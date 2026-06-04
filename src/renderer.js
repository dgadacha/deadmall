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
//  TOON SHADING — style Team Fortress 2 (cel-shading 3 tons)
//  Gradient map partagée : ombre / mi-tons / lumière, transitions dures
// =============================================================================
const TOON_GRADIENT = (() => {
  const c = document.createElement('canvas');
  c.width = 3; c.height = 1;
  const g = c.getContext('2d');
  g.fillStyle = '#404048'; g.fillRect(0, 0, 1, 1);    // ombre
  g.fillStyle = '#a0a0a8'; g.fillRect(1, 0, 1, 1);    // mi-tons
  g.fillStyle = '#ffffff'; g.fillRect(2, 0, 1, 1);    // pleine lumière
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
})();

// Convertit un MeshLambertMaterial → MeshToonMaterial (cel-shading TF2).
// Les MeshBasicMaterial / MeshStandardMaterial sont retournés tels quels.
export function applyLowPoly(material) {
  if (material instanceof THREE.MeshLambertMaterial) {
    const toon = new THREE.MeshToonMaterial({
      color: material.color.clone(),
      map: material.map || null,
      gradientMap: TOON_GRADIENT,
      transparent: material.transparent,
      opacity: material.opacity,
      side: material.side,
      emissive: material.emissive ? material.emissive.clone() : new THREE.Color(0x000000),
      emissiveIntensity: material.emissiveIntensity ?? 1,
    });
    return toon;
  }
  return material;
}

// Helper pour créer des MeshToonMaterial directement avec le gradient TF2
export function makeToonMaterial(opts={}) {
  return new THREE.MeshToonMaterial({
    gradientMap: TOON_GRADIENT,
    ...opts,
  });
}
