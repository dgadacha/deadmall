import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FOG_NEAR, FOG_FAR, FOG_COLOR, SPAWN } from './config.js';

// désactive le color management auto de Three (depuis r152) — sinon les
// CanvasTextures (sang, bannière, etc.) sont reconverties et les rouges
// deviennent rose. Les textures PNG chargées via TextureLoader devront
// définir explicitement texture.colorSpace = SRGBColorSpace.
THREE.ColorManagement.enabled = false;

export const canvas = document.getElementById('game');

// antialias activé pour les bords toon propres
export const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setClearColor(FOG_COLOR);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
// pas de tone mapping cinéma (TF2 = rendu cartoon lisible, pas de courbe ACES)
renderer.toneMapping = THREE.NoToneMapping;
// pas de shadows en temps réel (TF2 utilise des shadows pré-calculées / fake)
renderer.shadowMap.enabled = false;

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

export const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 200);
camera.position.copy(SPAWN);
scene.add(camera);

// === POSTPROCESSING : composer minimal (RenderPass + OutputPass) ===
// Pas de bloom (TF2 ne brille pas). On garde la structure si on veut
// ajouter un outline pass plus tard.
export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new OutputPass());

// Résolution native (pas de basse résolution pixelisée) + cap devicePixelRatio à 2
// pour rester économe sur les écrans très haute densité.
export function maybeResize() {
  const cw = canvas.clientWidth  || window.innerWidth  || 1280;
  const ch = canvas.clientHeight || window.innerHeight || 720;
  const pr = Math.min(window.devicePixelRatio || 1, 2);
  const wInternal = Math.round(cw * pr);
  const hInternal = Math.round(ch * pr);
  if (canvas.width !== wInternal || canvas.height !== hInternal) {
    renderer.setPixelRatio(pr);
    renderer.setSize(cw, ch, false);
    composer.setSize(cw, ch);
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
  }
}
window.addEventListener('resize', maybeResize);
maybeResize();

// =============================================================================
//  STYLE PS2 HORROR — vertex jitter léger + flat shading
//  Reproduit le wobble caractéristique des GTE de la PS2 (sub-pixel précision
//  limitée) à un niveau plus subtil que PS1. Grille 256×192 = perceptible sans
//  être agressif.
// =============================================================================
const PS2_GRID = new THREE.Vector2(256, 192);

function applyPS2Jitter(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPS2Grid = { value: PS2_GRID };
    shader.vertexShader = 'uniform vec2 uPS2Grid;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
       // PS2 vertex snap (precision sub-pixel limitée du GTE)
       vec4 _ps2pos = gl_Position;
       _ps2pos.xy = floor((_ps2pos.xy / _ps2pos.w) * uPS2Grid + 0.5) / uPS2Grid * _ps2pos.w;
       gl_Position = _ps2pos;`
    );
  };
}

// applyLowPoly : ajoute flatShading + vertex jitter PS2 aux materials lit
// (Lambert, Standard, etc.). Les MeshBasicMaterial (sang, yeux émissifs,
// muzzle flash) restent intacts pour pas que les particules sautent.
export function applyLowPoly(material) {
  if (material instanceof THREE.MeshBasicMaterial) return material;
  material.flatShading = true;
  applyPS2Jitter(material);
  return material;
}
