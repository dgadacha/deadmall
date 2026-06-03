import * as THREE from 'three';
import { FOG_NEAR, FOG_FAR, FOG_COLOR, PIXEL_HEIGHT, SPAWN } from './config.js';

export const canvas = document.getElementById('game');

export const renderer = new THREE.WebGLRenderer({ canvas, antialias:false });
renderer.setClearColor(FOG_COLOR);

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

export const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 200);
camera.position.copy(SPAWN);
scene.add(camera);

export function maybeResize() {
  const cw = canvas.clientWidth  || window.innerWidth  || 1280;
  const ch = canvas.clientHeight || window.innerHeight || 720;
  const aspect = cw / ch;
  const h = PIXEL_HEIGHT;
  const w = Math.max(1, Math.round(h * aspect));
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);   // false = ne pas écraser le style CSS
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
}
window.addEventListener('resize', maybeResize);
maybeResize();

// --- Shader PS1 : vertex snapping grossier + flat shading ---
// Quantize la position projetée sur une grille très grossière (96x72) → le wobble
// caractéristique PS1, beaucoup plus violent que PS2. Combiné à flatShading,
// donne le rendu low-poly facetté typique de l'ère PS1.
// À appliquer sur le décor, pas sur le viewmodel (sinon il vibre dans la main).
const PS1_GRID = new THREE.Vector2(96, 72);
export function applyPS1Shader(material) {
  material.flatShading = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPS1Grid = { value: PS1_GRID };
    shader.vertexShader = 'uniform vec2 uPS1Grid;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
       // PS1 vertex snap (sub-pixel precision absente sur PSX)
       vec4 _ps1pos = gl_Position;
       _ps1pos.xy = floor((_ps1pos.xy / _ps1pos.w) * uPS1Grid + 0.5) / uPS1Grid * _ps1pos.w;
       gl_Position = _ps1pos;`
    );
  };
  return material;
}
