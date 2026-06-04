import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FOG_NEAR, FOG_FAR, FOG_COLOR, SPAWN } from './config.js';

// désactive le color management auto de Three (depuis r152) — sinon les
// CanvasTextures (sang, bannière, etc.) sont reconverties et les rouges
// deviennent rose. Garde les couleurs des canvas telles quelles.
THREE.ColorManagement.enabled = false;

export const canvas = document.getElementById('game');

// antialias activé → arêtes lisses sur les polygones low-poly
export const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setClearColor(FOG_COLOR);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

export const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 200);
camera.position.copy(SPAWN);
scene.add(camera);

// =============================================================================
//  POSTPROCESSING — EffectComposer + Bloom pour faire briller yeux zombies,
//  néons enseignes, phares de voitures, muzzle flash, etc.
// =============================================================================
export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// UnrealBloomPass (resolution, strength, radius, threshold)
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(1280, 720),
  0.75,   // strength : intensité du bloom
  0.55,   // radius : étendue du halo
  0.55,   // threshold : luminosité min pour bloomer (0=tout, 1=rien)
);
composer.addPass(bloomPass);
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

// Look low-poly net (style Unturned) — flat shading par face, sans vertex snap.
export function applyLowPoly(material) {
  material.flatShading = true;
  return material;
}
