import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { scene, applyLowPoly, forceNearestFilter, applyOutlinesRecursive, MAX_ANISOTROPY } from './renderer.js';
import { PS1_MODE } from './graphics-settings.js';
import { FOG_FAR, FOG_NEAR, FOG_COLOR, EYE, NIGHTVISION_AMBIENT } from './config.js';
import { game, player } from './state.js';

// =============================================================================
//  MAP EDITOR — declarations hoist en haut (TDZ-safe car utilisé par buildDepot)
// =============================================================================
export const MAP_STORAGE_KEY = 'horde-map-v1';      // legacy, gardé pour migration
export const MAP_LIST_KEY    = 'horde-maps-list';   // métadonnées des saves
export const MAP_ACTIVE_KEY  = 'horde-map-active';  // id de la map active pour le jeu
export const editableProps = [];                    // refs Object3D taggés
let editablePropIdCounter = 0;
let _lastObstaclesLen = 0;

// =============================================================================
//  BUS DEPOT — mono-zone (MVP horde-survival, plat, pas d'étages)
//  Cour extérieure 44×44 + bâtiment central 14×10 + bus/voitures abandonnées.
//  Ambiance nuit / brouillard violet-bleu, néons grésillants.
// =============================================================================

const W = 44;        // largeur cour (X)
const D = 44;        // profondeur cour (Z)
const WALL_H = 6;    // hauteur des murs extérieurs
const DEPOT_W = 14;  // bâtiment central X
const DEPOT_D = 10;  // bâtiment central Z
const DEPOT_H = 4.5; // hauteur intérieure depot

// =============================================================================
//  SKYBOX — DA Fortnite/TF2 cartoon NUIT (ciel étoilé bleu profond)
//  Bleu nuit en haut → bleu plus pâle/violet doux à l'horizon. Étoiles ON.
//  Cohérent avec lampadaires jaune chaud qui restent la seule chaleur visible.
// =============================================================================
const skyShader = {
  uniforms: {
    uTopColor:    { value: new THREE.Color(0x0a1530) },   // bleu nuit profond
    uHorizonColor:{ value: new THREE.Color(0x2a3460) },   // bleu nuit avec touche violet
    uTime:        { value: 0 },
    uDaytime:     { value: 0.0 },                          // nuit (étoiles ON)
  },
  vertexShader: /* glsl */`
    varying vec3 vWorldDir;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldDir = normalize(worldPos.xyz - cameraPosition);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 uTopColor;
    uniform vec3 uHorizonColor;
    uniform float uTime;
    uniform float uDaytime; // 1 = jour pas d'étoiles, 0 = nuit étoilée
    varying vec3 vWorldDir;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec3 d = normalize(vWorldDir);
      float h = clamp(d.y * 1.4 + 0.05, 0.0, 1.0);
      vec3 col = mix(uHorizonColor, uTopColor, pow(h, 0.7));
      // ===== Étoiles cartoon 4-branches (nuit uniquement) =====
      // Forme classique d'étoile cartoon (Mario, Disney) : 4 pics qui partent
      // d'un centre, façon "+", obtenue via produit de gaussiennes.
      if (uDaytime < 0.5 && d.y > 0.05) {
        vec2 stUv = vec2(atan(d.x, d.z) / 6.28318, d.y) * 40.0;
        vec2 gid = floor(stUv);
        vec2 fid = fract(stUv);
        float r = hash(gid);
        if (r > 0.92) {
          vec2 starPos = vec2(hash(gid + vec2(1.1, 0.0)),
                              hash(gid + vec2(0.0, 2.3))) * 0.6 + 0.2;
          vec2 p = (fid - starPos) * 8.0; // 8 = inverse de la taille d'étoile
          // 4-branche cartoon : croix « + » avec corps central
          float horizSpike = exp(-25.0 * abs(p.y)) * exp(-3.5 * abs(p.x));
          float vertSpike  = exp(-25.0 * abs(p.x)) * exp(-3.5 * abs(p.y));
          float centerDot  = exp(-30.0 * dot(p, p));
          float star = max(centerDot, max(horizSpike, vertSpike));
          // Twinkle plus subtil
          float tw = 0.85 + 0.15 * sin(uTime * 2.0 + r * 47.0);
          float bright = (r - 0.92) / 0.08;
          // Couleur jaune chaud
          col += vec3(1.0, 0.94, 0.55) * star * bright * tw *
                 smoothstep(0.05, 0.30, d.y);
        }
      }
      // ===== Lune cartoon disque + outline + cratères =====
      if (uDaytime < 0.5) {
        vec3 moonDir = normalize(vec3(0.42, 0.78, 0.30));
        float md = dot(d, moonDir);
        // Halo très subtil + serré (pas de soupe géante)
        float halo = pow(max(md, 0.0), 600.0) * 0.6;
        col += vec3(0.95, 0.97, 1.0) * halo;
        // 3 zones concentriques pour cartoon disque + outline noir + corps :
        //   md > 0.99955  → disque crème (corps lunaire)
        //   0.9990 < md < 0.99955 → ring outline noir épais
        //   md < 0.9990   → pas de lune
        float diskBody = step(0.99955, md);
        float diskOutline = step(0.9990, md) - diskBody;
        col = mix(col, vec3(0.02, 0.02, 0.08), diskOutline); // outline noir-bleu
        col = mix(col, vec3(1.0, 0.97, 0.86), diskBody);     // corps crème
        // Cratères : 3 zones plus sombres à positions fixes sur le disque lunaire
        if (diskBody > 0.5) {
          // tangentes au moonDir pour avoir des UV locaux 2D sur le disque
          vec3 t1 = normalize(cross(moonDir, vec3(0.0, 1.0, 0.0)));
          vec3 t2 = cross(moonDir, t1);
          vec2 luv = vec2(dot(d, t1), dot(d, t2)) * 200.0;
          float c1 = smoothstep(0.55, 0.40, length(luv - vec2( 0.30,  0.20)));
          float c2 = smoothstep(0.40, 0.28, length(luv - vec2(-0.25,  0.35)));
          float c3 = smoothstep(0.35, 0.22, length(luv - vec2( 0.15, -0.35)));
          float craters = max(c1, max(c2, c3));
          col = mix(col, vec3(0.74, 0.70, 0.62), craters * 0.55);
        }
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
const skyGeo = new THREE.SphereGeometry(100, 24, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  fog: false,
  uniforms: skyShader.uniforms,
  vertexShader: skyShader.vertexShader,
  fragmentShader: skyShader.fragmentShader,
});
const skyMesh = new THREE.Mesh(skyGeo, skyMat);
skyMesh.renderOrder = -1;
skyMesh.userData._skipOutline = true;
scene.add(skyMesh);
// Exporté pour que l'éditeur puisse masquer le sky durant la vue top-down
export { skyMesh };

// Defaults fog pour que le menu Graphismes puisse les restaurer
export const fogDefaults = { near: FOG_NEAR, far: FOG_FAR };

// Export de la moon pour le menu Graphismes (toggle shadows / mapSize)
export let moon;

// =============================================================================
//  LUMIÈRES GLOBALES — DA Fortnite/TF2 cartoon NUIT
//  Ambient bleu nuit doux + lune blanc-bleu pour ombres lisibles +
//  hemi bleu cieux / sol froid. Les lampadaires jaunes restent la seule
//  source chaude (contraste cohérent avec la nuit).
// =============================================================================
const ambient = new THREE.AmbientLight(0x9eb0d8, 0.45); // bleu nuit doux, intensité modérée
scene.add(ambient);
// Lune blanche-bleue : froide, intensité un peu plus basse que le soleil
// golden hour précédent. Position légèrement plus haute pour ombres lisibles.
moon = new THREE.DirectionalLight(0xc8d4ff, 0.95);
moon.position.set(22, 42, 14);
moon.castShadow = true;
// 1024² au lieu de 2048² → 4× moins de fillrate sur la pass shadow
moon.shadow.mapSize.set(1024, 1024);
moon.shadow.camera.left   = -30;
moon.shadow.camera.right  =  30;
moon.shadow.camera.top    =  30;
moon.shadow.camera.bottom = -30;
moon.shadow.camera.near = 1;
moon.shadow.camera.far = 80;
moon.shadow.bias = -0.0008;
// Throttle l'update de la shadow map à ~20 Hz au lieu de 60 Hz.
// La lune ne bouge pas, seuls les zombies projettent des ombres dynamiques.
// 3 frames de retard sur les ombres = invisible à l'œil nu en gameplay rapide.
moon.shadow.autoUpdate = false;
moon.shadow.needsUpdate = true; // bootstrap la première frame
scene.add(moon);
// Hemisphere nuit : ciel bleu nuit clair / sol bleu nuit plus sombre.
// Intensité 0.30 — laisse la place au directionnel pour ne pas désaturer.
const hemi = new THREE.HemisphereLight(0x6080a8, 0x1a2238, 0.30);
scene.add(hemi);

// =============================================================================
//  COLLISIONS — version mono-zone simplifiée
//  obstacles = [{minX, maxX, minZ, maxZ}] en world coords.
// =============================================================================
const obstacles = [];
function addObstacle(minX, maxX, minZ, maxZ) {
  obstacles.push({ minX, maxX, minZ, maxZ });
}
function clamp(v, a, b) { return v<a ? a : v>b ? b : v; }

export function resolveCollision(pos, r) {
  // SANITY : si la pos a déjà été corrompue (NaN/Infinity), la rapatrier au
  // centre. Sinon l'AudioListener.updateMatrixWorld crashe au prochain
  // linearRampToValueAtTime (et le jeu boucle l'erreur indéfiniment).
  if (!isFinite(pos.x) || !isFinite(pos.z) || !isFinite(pos.y)) {
    pos.set(0, EYE, 0);
  }
  // bornes extérieures (mur d'enceinte intérieur, marge r+0.3)
  pos.x = clamp(pos.x, -W/2 + r + 0.6, W/2 - r - 0.6);
  pos.z = clamp(pos.z, -D/2 + r + 0.6, D/2 - r - 0.6);
  for (const b of obstacles) {
    const cx = clamp(pos.x, b.minX, b.maxX);
    const cz = clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx*dx + dz*dz;
    if (d2 < r*r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = r - d;
        pos.x += dx/d * push; pos.z += dz/d * push;
      } else {
        const l = pos.x - b.minX, ri = b.maxX - pos.x;
        const nz = pos.z - b.minZ, fz = b.maxZ - pos.z;
        const m = Math.min(l, ri, nz, fz);
        if      (m === l)  pos.x = b.minX - r;
        else if (m === ri) pos.x = b.maxX + r;
        else if (m === nz) pos.z = b.minZ - r;
        else               pos.z = b.maxZ + r;
      }
    }
  }
}

// =============================================================================
//  SOLS — pour le raycast de gravité du joueur
// =============================================================================
const floorMeshes = [];
export function getFloorMeshes() { return floorMeshes; }
function registerFloor(mesh) { mesh.userData.isFloor = true; floorMeshes.push(mesh); return mesh; }

// =============================================================================
//  HELPERS TEXTURES PROCÉDURALES
// =============================================================================
function makeTex(draw, rep=1, size=64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  return t;
}

// Loader pour les PNG dans public/textures/ — colorSpace sRGB.
// Mode normal : Linear + mipmaps + anisotropy 8 (rendu propre).
// Mode PS1 : NEAREST + pas de mipmaps. En plus, tente d'abord
// public/textures/ps1/<name>.png. Si le fichier n'existe pas, fallback
// sur la version moderne public/textures/<name>.png (toujours filtrée
// NEAREST si PS1_MODE = look pixelisé même sur les assets non-spécifiques).
const texLoader = new THREE.TextureLoader();
function loadPng(name, repeat = 1) {
  // crée la texture vide avec les paramètres voulus — l'image se chargera async
  const map = new THREE.Texture();
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  if (PS1_MODE) {
    map.magFilter = THREE.NearestFilter;
    map.minFilter = THREE.NearestFilter;
    map.generateMipmaps = false;
  } else {
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    // Anisotropy max GPU (16× typique) au lieu de 8 — drastique sur les sols
    // et murs vus sous des angles rasants (très loin du joueur).
    map.anisotropy = MAX_ANISOTROPY;
  }

  const loadInto = (url, onFail) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      map.image = img;
      map.needsUpdate = true;
    };
    img.onerror = () => { if (onFail) onFail(); };
    img.src = url;
  };

  if (PS1_MODE) {
    // tente d'abord la version PS1 dédiée, fallback sur la moderne
    loadInto(`public/textures/ps1/${name}.png`, () => {
      console.log(`[textures] ${name} : pas de version PS1, fallback moderne`);
      loadInto(`public/textures/${name}.png`);
    });
  } else {
    loadInto(`public/textures/${name}.png`);
  }
  return map;
}

// =============================================================================
//  SOL — asphalte craquelé sombre (PNG midjourney : floor_asphalt.png)
// =============================================================================
const groundTex = loadPng('floor_asphalt', Math.round(W/3));

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(W, D),
  applyLowPoly(new THREE.MeshLambertMaterial({ map: groundTex }))
);
ground.rotation.x = -Math.PI/2;
ground.position.y = 0;
ground.userData._skipOutline = true; // sol : pas d'outline (trop grand)
registerFloor(ground);
scene.add(ground);

// =============================================================================
//  MUR D'ENCEINTE — briques industrielles (PNG midjourney : wall_fence_brick.png)
// =============================================================================
const fenceTex = loadPng('wall_fence_brick', 6);
const wallMat = applyLowPoly(new THREE.MeshLambertMaterial({ map: fenceTex }));

function buildPerimeterWall() {
  const t = 0.6;
  // Nord
  const wN = new THREE.Mesh(new THREE.BoxGeometry(W, WALL_H, t), wallMat);
  wN.position.set(0, WALL_H/2, -D/2);
  scene.add(wN);
  addObstacle(-W/2, W/2, -D/2 - t/2, -D/2 + t/2);
  // Sud
  const wS = new THREE.Mesh(new THREE.BoxGeometry(W, WALL_H, t), wallMat);
  wS.position.set(0, WALL_H/2, D/2);
  scene.add(wS);
  addObstacle(-W/2, W/2, D/2 - t/2, D/2 + t/2);
  // Est
  const wE = new THREE.Mesh(new THREE.BoxGeometry(t, WALL_H, D), wallMat);
  wE.position.set(W/2, WALL_H/2, 0);
  scene.add(wE);
  addObstacle(W/2 - t/2, W/2 + t/2, -D/2, D/2);
  // Ouest
  const wW = new THREE.Mesh(new THREE.BoxGeometry(t, WALL_H, D), wallMat);
  wW.position.set(-W/2, WALL_H/2, 0);
  scene.add(wW);
  addObstacle(-W/2 - t/2, -W/2 + t/2, -D/2, D/2);
}
buildPerimeterWall();

// =============================================================================
//  BÂTIMENT CENTRAL — le DEPOT
//  Position : centré sur (0, 0, 0). Entrées : nord (porte large) + sud.
//  4 fenêtres : 2 est + 2 ouest (futures barricades).
// =============================================================================
// Mur du depot (PNG midjourney : wall_depot.png)
const depotWallTex = loadPng('wall_depot', 4);
const depotWallMat = applyLowPoly(new THREE.MeshLambertMaterial({ map: depotWallTex }));

const zoneNeons = [];
const glowSprites = []; // halos sprites pour anim de pulse
export const interactableSpots = []; // spotlights des wall buys/mystery/perks
export const groundDecals = [];      // taches sang/huile au sol
export { glowSprites };

// =============================================================================
//  GLOW SPRITE — halo lumineux autour d'une source de lumière (Sprite + radial)
// =============================================================================
const glowTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0,    'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.6,  'rgba(255,255,255,0.12)');
  grd.addColorStop(1,    'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

function addGlow(x, y, z, color, scale = 2.5) {
  // Dark PBR : glow sprite très discret (le bloom additif ressort trop sur
  // les fonds sombres). On garde une faible présence pour évoquer le halo
  // d'une ampoule, mais l'éclairage réel vient des PointLight / SpotLight.
  const mat = new THREE.SpriteMaterial({
    map: glowTexture,
    color,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  });
  const spr = new THREE.Sprite(mat);
  spr.position.set(x, y, z);
  spr.scale.set(scale * 0.6, scale * 0.6, scale * 0.6);
  spr.userData = { baseScale: scale * 0.6, basePhase: Math.random() * 7 };
  scene.add(spr);
  glowSprites.push(spr);
  return spr;
}

// Helper : spotlight au-dessus d'un interactable. castShadow optionnel :
// activé seulement sur les 2 points focaux signature horror (mystery box +
// perk machine) pour la flaque de lumière dramatique. Les 4 wall buys
// restent sans shadow (compromis perf).
function addInteractableSpot(x, y, z, color = 0xffdc88, intensity = 8, withShadow = false) {
  const sp = new THREE.SpotLight(color, intensity, 7, Math.PI/5.5, 0.45, 1.6);
  sp.position.set(x, y + 2.6, z);
  const tgt = new THREE.Object3D();
  tgt.position.set(x, y - 0.3, z);
  sp.target = tgt;
  // Note : withShadow contrôle la valeur PAR DÉFAUT. Le menu Graphismes
  // peut toggler runtime via userData.wantsShadow.
  sp.userData.wantsShadow = withShadow;
  if (withShadow) {
    sp.castShadow = true;
    sp.shadow.mapSize.set(512, 512);
    sp.shadow.bias = -0.001;
    sp.shadow.camera.near = 0.5;
    sp.shadow.camera.far = 8;
  }
  scene.add(sp);
  scene.add(tgt);
  interactableSpots.push(sp);
  return sp;
}

// =============================================================================
//  DECALS SOL — taches de sang, flaques d'huile, marques de pneus
// =============================================================================
function makeDecalTexture(drawFn, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  drawFn(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  return t;
}

const decalBloodTex = makeDecalTexture((g, s) => {
  g.clearRect(0, 0, s, s);
  // tache centrale rouge sombre avec gouttelettes
  const cx = s/2, cy = s/2;
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, s*0.35);
  grad.addColorStop(0,    'rgba(120,8,12,0.95)');
  grad.addColorStop(0.45, 'rgba(80,5,8,0.75)');
  grad.addColorStop(1,    'rgba(40,0,4,0)');
  g.fillStyle = grad;
  g.beginPath();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = s*0.30 + (Math.random()-0.5) * s*0.15;
    g.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
  }
  g.closePath(); g.fill();
  // gouttes éparses
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(${90+Math.random()*40},${5+Math.random()*15},${5+Math.random()*10},${0.6+Math.random()*0.35})`;
    g.beginPath();
    g.arc(Math.random()*s, Math.random()*s, 2+Math.random()*5, 0, 7);
    g.fill();
  }
});

const decalOilTex = makeDecalTexture((g, s) => {
  g.clearRect(0, 0, s, s);
  const cx = s/2, cy = s/2;
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, s*0.4);
  grad.addColorStop(0,    'rgba(8,5,12,0.9)');
  grad.addColorStop(0.6,  'rgba(15,10,15,0.4)');
  grad.addColorStop(1,    'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const r = s*0.35 + (Math.random()-0.5) * s*0.20;
    g.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
  }
  g.closePath(); g.fill();
  // reflet violacé
  g.fillStyle = 'rgba(60,40,80,0.18)';
  g.beginPath(); g.ellipse(cx-8, cy+5, s*0.18, s*0.08, 0.4, 0, 7); g.fill();
});

function addGroundDecal(x, z, tex, size = 2.0, rot = 0, opacity = 0.85) {
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    fog: true,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI/2;
  m.rotation.z = rot;
  m.position.set(x, 0.02, z);
  m.renderOrder = 1;
  scene.add(m);
  groundDecals.push(m);
  return m;
}

// Disperse des decals sang + huile dans la cour (hors emplacements bus/bâtiment)
function placeGroundDecals() {
  // === SANG GÉNÉRIQUE — au centre + zones de passage ===
  const bloodPositions = [
    [-3, 6], [5, 7], [0, 9], [-6, 11], [7, 12],
    [-8, -8], [10, -6], [-12, 4],
  ];
  for (const [x, z] of bloodPositions) {
    addGroundDecal(x, z, decalBloodTex, 1.6 + Math.random()*1.4, Math.random()*Math.PI*2, 0.75);
  }

  // === SANG SCÉNOGRAPHIQUE — storytelling environnemental SH ===
  // 1. Trainée de sang menant vers les dumpsters (où "ils" cachent les corps)
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const x = -18 * t + 0 * (1 - t);  // de (0,0) vers dumpster (-18, -8)
    const z = -8 * t + 0 * (1 - t);
    addGroundDecal(x + (Math.random()-0.5)*0.6, z + (Math.random()-0.5)*0.6,
      decalBloodTex, 0.9 + Math.random()*0.5, Math.random()*Math.PI*2, 0.55);
  }
  // 2. Mare de sang devant chaque wall buy (combats répétés)
  const wallBuyBloodSpots = [
    [-4.0, 4.2],  [4.0, -4.2],
    [6.5, 0],     [-6.5, 0],
  ];
  for (const [x, z] of wallBuyBloodSpots) {
    addGroundDecal(x, z, decalBloodTex, 2.0 + Math.random()*0.6, Math.random()*Math.PI*2, 0.8);
  }
  // 3. Sang massif devant la porte nord du dépôt (massacre à l'entrée)
  addGroundDecal(0, -5.4, decalBloodTex, 3.2, 0.3, 0.85);
  addGroundDecal(-1.5, -6, decalBloodTex, 1.4, 1.1, 0.6);
  addGroundDecal(1.8, -6.3, decalBloodTex, 1.6, -0.5, 0.65);
  // 4. Sang autour du mystery box (chemin de pèlerinage)
  addGroundDecal(16, -13, decalBloodTex, 1.8, 0.7, 0.7);
  addGroundDecal(14, -16, decalBloodTex, 1.3, 2.1, 0.6);

  // === FLAQUES D'HUILE — près des véhicules abandonnés ===
  const oilPositions = [
    [-14, 10], [-16, 13], [13, -9], [16, -11], [-9, -13], [-11, -15],
  ];
  for (const [x, z] of oilPositions) {
    addGroundDecal(x, z, decalOilTex, 1.8 + Math.random()*1.6, Math.random()*Math.PI*2, 0.7);
  }
}
placeGroundDecals();

function buildDepot() {
  const hw = DEPOT_W/2, hd = DEPOT_D/2;
  const t = 0.4;
  const doorW = 2.2;
  const winW = 1.8;

  // === sol intérieur (PNG midjourney : floor_depot_concrete.png) ===
  const innerTex = loadPng('floor_depot_concrete', 3);
  const innerFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(DEPOT_W, DEPOT_D),
    applyLowPoly(new THREE.MeshLambertMaterial({ map: innerTex }))
  );
  innerFloor.rotation.x = -Math.PI/2;
  innerFloor.position.y = 0.05;
  innerFloor.userData._skipOutline = true;
  registerFloor(innerFloor);
  scene.add(innerFloor);

  // === plafond ===
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(DEPOT_W, DEPOT_D),
    applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x0a0a10 }))
  );
  ceil.rotation.x = Math.PI/2;
  ceil.position.y = DEPOT_H;
  ceil.userData._skipOutline = true;
  scene.add(ceil);

  // === mur Nord avec entrée centrale (porte vide) ===
  const segL_w = (DEPOT_W - doorW)/2;
  const wallNL = new THREE.Mesh(new THREE.BoxGeometry(segL_w, DEPOT_H, t), depotWallMat);
  wallNL.position.set(-doorW/2 - segL_w/2, DEPOT_H/2, -hd);
  scene.add(wallNL); tagEditable(wallNL, 'wall', { protected: true });
  addObstacle(-doorW/2 - segL_w, -doorW/2, -hd - t/2, -hd + t/2);
  const wallNR = new THREE.Mesh(new THREE.BoxGeometry(segL_w, DEPOT_H, t), depotWallMat);
  wallNR.position.set(doorW/2 + segL_w/2, DEPOT_H/2, -hd);
  scene.add(wallNR); tagEditable(wallNR, 'wall', { protected: true });
  addObstacle(doorW/2, doorW/2 + segL_w, -hd - t/2, -hd + t/2);
  // linteau au-dessus de la porte
  const lintN = new THREE.Mesh(new THREE.BoxGeometry(doorW, 1.0, t), depotWallMat);
  lintN.position.set(0, DEPOT_H - 0.5, -hd);
  scene.add(lintN); tagEditable(lintN, 'wall', { protected: true });

  // === mur Sud avec entrée centrale (idem) ===
  const wallSL = new THREE.Mesh(new THREE.BoxGeometry(segL_w, DEPOT_H, t), depotWallMat);
  wallSL.position.set(-doorW/2 - segL_w/2, DEPOT_H/2, hd);
  scene.add(wallSL); tagEditable(wallSL, 'wall', { protected: true });
  addObstacle(-doorW/2 - segL_w, -doorW/2, hd - t/2, hd + t/2);
  const wallSR = new THREE.Mesh(new THREE.BoxGeometry(segL_w, DEPOT_H, t), depotWallMat);
  wallSR.position.set(doorW/2 + segL_w/2, DEPOT_H/2, hd);
  scene.add(wallSR); tagEditable(wallSR, 'wall', { protected: true });
  addObstacle(doorW/2, doorW/2 + segL_w, hd - t/2, hd + t/2);
  const lintS = new THREE.Mesh(new THREE.BoxGeometry(doorW, 1.0, t), depotWallMat);
  lintS.position.set(0, DEPOT_H - 0.5, hd);
  scene.add(lintS); tagEditable(lintS, 'wall', { protected: true });

  // === ENSEIGNE "BUS DEPOT" au-dessus des portes (PNG midjourney) ===
  // 1 enseigne par façade (nord + sud), MeshBasicMaterial pour rester
  // visible quoi qu'il arrive de l'éclairage ambient.
  const signTex = loadPng('sign_bus_depot', 1);
  signTex.wrapS = signTex.wrapT = THREE.ClampToEdgeWrapping;
  signTex.repeat.set(1, 1);
  const signMat = new THREE.MeshBasicMaterial({
    map: signTex,
    transparent: true,
    fog: true,
    depthWrite: false,
  });
  const signGeo = new THREE.PlaneGeometry(4.0, 1.0);    // ratio 4:1 selon le prompt
  // Façade sud : visible depuis la cour sud
  const signS = new THREE.Mesh(signGeo, signMat);
  signS.position.set(0, DEPOT_H + 0.55, hd + 0.06);
  signS.userData._skipOutline = true;
  scene.add(signS);
  // Façade nord : visible depuis la cour nord (rotation 180°)
  const signN = new THREE.Mesh(signGeo, signMat);
  signN.position.set(0, DEPOT_H + 0.55, -hd - 0.06);
  signN.rotation.y = Math.PI;
  signN.userData._skipOutline = true;
  scene.add(signN);

  // === murs Est / Ouest avec 2 fenêtres chacun (futures barricades) ===
  const winPosZ = [-2.2, 2.2];
  const winH = 1.6, winYCenter = 2.0;
  const winTopY = winYCenter + winH/2, winBotY = winYCenter - winH/2;

  function buildSideWallWithWindows(sideX) {
    const sx = sideX;
    const w1z0 = winPosZ[0] - winW/2, w1z1 = winPosZ[0] + winW/2;
    const w2z0 = winPosZ[1] - winW/2, w2z1 = winPosZ[1] + winW/2;
    const segs = [
      { z0: -hd, z1: w1z0 },
      { z0: w1z1, z1: w2z0 },
      { z0: w2z1, z1: hd },
    ];
    for (const sg of segs) {
      const len = sg.z1 - sg.z0;
      if (len <= 0) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(t, DEPOT_H, len), depotWallMat);
      m.position.set(sx, DEPOT_H/2, (sg.z0 + sg.z1)/2);
      scene.add(m); tagEditable(m, 'wall', { protected: true });
      addObstacle(sx - t/2, sx + t/2, sg.z0, sg.z1);
    }
    for (const wz of winPosZ) {
      const below = new THREE.Mesh(new THREE.BoxGeometry(t, winBotY, winW), depotWallMat);
      below.position.set(sx, winBotY/2, wz);
      scene.add(below); tagEditable(below, 'wall', { protected: true });
      addObstacle(sx - t/2, sx + t/2, wz - winW/2, wz + winW/2);
      const above = new THREE.Mesh(new THREE.BoxGeometry(t, DEPOT_H - winTopY, winW), depotWallMat);
      above.position.set(sx, winTopY + (DEPOT_H - winTopY)/2, wz);
      scene.add(above); tagEditable(above, 'wall', { protected: true });
    }
  }
  buildSideWallWithWindows( DEPOT_W/2);
  buildSideWallWithWindows(-DEPOT_W/2);

  // === BARRICADES (PNG midjourney : plank_wood.png) ===
  const plankTex = loadPng('plank_wood', 1);
  const plankMat = applyLowPoly(new THREE.MeshLambertMaterial({ map: plankTex }));

  function addPlanksAt(x, z, side) {
    for (let i = 0; i < 4; i++) {
      const py = winBotY + 0.15 + i * 0.4;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, winW + 0.5), plankMat);
      plank.position.set(x + side * 0.05, py, z);
      plank.rotation.x = (Math.random() - 0.5) * 0.06;
      scene.add(plank);
    }
  }
  for (const wz of winPosZ) {
    addPlanksAt( DEPOT_W/2, wz, +1);
    addPlanksAt(-DEPOT_W/2, wz, -1);
  }

  // === COMPTOIR INTÉRIEUR ===
  const counterMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x3a2818 }));
  const counter = new THREE.Mesh(new THREE.BoxGeometry(5.0, 1.0, 0.8), counterMat);
  counter.position.set(-3, 0.5, -hd + 2.5);
  scene.add(counter);
  addObstacle(-5.5, -0.5, -hd + 2.1, -hd + 2.9);

  // moniteur émissif sur le comptoir
  const monTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#0a0a10'; g.fillRect(0, 0, 64, 32);
    g.fillStyle = '#2acc66';
    g.font = 'bold 8px monospace';
    g.fillText('DEPOT 04', 4, 12);
    g.fillText('STATUS: OFFLINE', 4, 24);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    return t;
  })();
  const mon = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.3),
    new THREE.MeshBasicMaterial({ map: monTex })
  );
  mon.position.set(-3.8, 1.2, -hd + 2.5 - 0.41);
  mon.rotation.y = Math.PI;
  scene.add(mon);

  // === BANCS contre le mur sud (intérieur) ===
  const benchMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x2a1a10 }));
  for (let i = 0; i < 2; i++) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.6), benchMat);
    const bx = -3 + i * 4;
    bench.position.set(bx, 0.25, hd - 0.8);
    scene.add(bench);
    addObstacle(bx - 1.2, bx + 1.2, hd - 1.1, hd - 0.5);
  }

  // === NÉON intérieur (grésille) + halo glow ===
  const neonIn = new THREE.PointLight(0xffe8a0, 1.8, 14, 1.4);
  neonIn.position.set(0, DEPOT_H - 0.3, 0);
  neonIn.userData = { base: 1.8, flicker: true, phase: Math.random()*7 };
  scene.add(neonIn);
  zoneNeons.push(neonIn);
  addGlow(0, DEPOT_H - 0.3, 0, 0xffe8a0, 2.0);
}
buildDepot();

// =============================================================================
//  BUS ABANDONNÉS — GLB Meshy bus.glb cloné 3 fois.
//  Les positions/collision sont déclarées immédiatement, le GLB est chargé en
//  async et instancié quand prêt. En attendant, les bus sont invisibles mais
//  on peut déjà collisionner avec leur emplacement futur.
// =============================================================================
const BUS_POSITIONS = [
  { x: -15, z:  12, ry: 0 },
  { x:  15, z: -10, ry: 0 },
  { x: -10, z: -14, ry: Math.PI/2 },
];
// dimensions approchées d'un bus scolaire pour les obstacles de collision
const BUS_LEN = 8.5, BUS_WID = 2.5;

function addBusCollisions() {
  for (const p of BUS_POSITIONS) {
    const aw = p.ry === 0 ? BUS_WID : BUS_LEN;
    const ad = p.ry === 0 ? BUS_LEN : BUS_WID;
    addObstacle(p.x - aw/2 - 0.1, p.x + aw/2 + 0.1, p.z - ad/2 - 0.1, p.z + ad/2 + 0.1);
  }
}
addBusCollisions();

// Helper de comptage des triangles d'un sous-arbre (mesh + skinnedMesh)
function countTriangles(root) {
  let tris = 0;
  root.traverse(c => {
    if ((c.isMesh || c.isSkinnedMesh) && c.geometry) {
      const idx = c.geometry.index;
      tris += idx ? idx.count / 3 : c.geometry.attributes.position.count / 3;
    }
  });
  return Math.round(tris);
}

const busLoader = new GLTFLoader();
busLoader.load('public/models/bus.glb', (gltf) => {
  const template = gltf.scene;
  console.log(`[bus GLB] triangles: ${countTriangles(template).toLocaleString()} (×3 instances)`);

  // mesure la bbox réelle (mesh-only pour ignorer d'éventuels bones)
  const rawBox = new THREE.Box3();
  let any = false;
  template.updateMatrixWorld(true);
  template.traverse(c => {
    if ((c.isMesh || c.isSkinnedMesh) && c.geometry) {
      if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
      const cb = c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld);
      if (!any) { rawBox.copy(cb); any = true; }
      else rawBox.union(cb);
    }
  });
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const rawMaxDim = Math.max(rawSize.x, rawSize.z);
  const scale = BUS_LEN / Math.max(0.001, rawMaxDim);
  template.scale.setScalar(scale);
  template.updateMatrixWorld(true);
  console.log('[bus GLB] raw size', rawSize, '→ scale', scale.toFixed(4));

  // applyLowPoly + frustumCulled true (GLB statique, bbox stable → safe à
  // culler quand hors écran, gain perf significatif sur la map ouverte)
  template.traverse(c => {
    if (c.isMesh || c.isSkinnedMesh) {
      c.frustumCulled = true;
      if (Array.isArray(c.material)) {
        c.material = c.material.map(m => applyLowPoly(m.clone()));
      } else if (c.material) {
        c.material = applyLowPoly(c.material.clone());
      }
      if (c.geometry) {
        c.geometry.computeBoundingBox();
        c.geometry.computeBoundingSphere();
      }
    }
  });
  // NEAREST sur les textures embarquées (no-op en dark PBR)
  forceNearestFilter(template);
  // castShadow + receiveShadow sur les meshes du bus (propagé aux clones)
  template.traverse(c => {
    if (c.isMesh || c.isSkinnedMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });

  // Outlines cartoon (inverted hull) sur le bus AVANT le clonage —
  // template.clone(true) propage les outlines aux 3 instances.
  // Outline en world ~5cm. Compensation par 1/scale (extrusion en object
  // space). `minSize` filtre les petites pièces (poignées, miroirs,
  // détails) dont les normales sont souvent suspectes et qui n'ont pas
  // besoin d'outline propre. Skip aussi window/glass/interior par nom.
  // 1.0 object-space units ≈ 1.0 / scale meters, donc minSize=0.5 object
  // ignore tout ce qui fait moins de ~0.5 unit en geometry (~3-5cm world).
  applyOutlinesRecursive(template, 0.05 / scale, 0x000000, 0.5);

  // mesure bottom après scale pour ancrer au sol
  const finalBox = new THREE.Box3().setFromObject(template);
  const yOffset = -finalBox.min.y;

  // 3 instances : on clone le template pour chacune (chacune éditable)
  for (const p of BUS_POSITIONS) {
    const inst = template.clone(true);
    inst.position.set(p.x, yOffset, p.z);
    inst.rotation.y = p.ry;
    scene.add(inst);
    tagEditable(inst, 'bus');
  }
}, undefined, (err) => {
  console.error('[bus GLB] load error:', err);
});

// =============================================================================
//  POTEAUX D'ÉCLAIRAGE + NÉONS GRÉSILLANTS (4 coins de la cour)
// =============================================================================
// 8 positions de lampadaires (4 coins + 4 mi-murs), couleurs alternées jaune/bleu
// DA Fortnite/TF2 : lampadaires jaune ambré chaud (cohérent avec golden
// hour). Pas d'alternance néon — palette unifiée chaude façon TF2 oilfield.
export const lampPositions = [
  { x: -W/2 + 3, z: -D/2 + 3, col: 0xffc858 },
  { x:  W/2 - 3, z: -D/2 + 3, col: 0xffc858 },
  { x: -W/2 + 3, z:  D/2 - 3, col: 0xffc858 },
  { x:  W/2 - 3, z:  D/2 - 3, col: 0xffc858 },
  { x:   0,      z: -D/2 + 1, col: 0xffc858 },
  { x:   0,      z:  D/2 - 1, col: 0xffc858 },
  { x: -W/2 + 1, z:   0,      col: 0xffc858 },
  { x:  W/2 - 1, z:   0,      col: 0xffc858 },
];

// Lampadaires en InstancedMesh — 8 instances 1 mesh par sub-mesh GLB.
// Gros gain perf vs 8 clones individuels.
const proceduralLampMeshes = [];
const lampVisualHelpers = [];

function placeStreetLamps() {
  const poleMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x16161c }));
  // DA réaliste type RE7 : pas de stroboscope SH3 horror. Toutes les lampes
  // font juste un flicker très subtle (variance ±15% lente). Si tu veux
  // remettre 2 lampes dramatiques, mets [1, 5] ici.
  const dramaticIndices = [];
  for (let idx = 0; idx < lampPositions.length; idx++) {
    const lp = lampPositions[idx];
    addObstacle(lp.x - 0.15, lp.x + 0.15, lp.z - 0.15, lp.z + 0.15);
    // PointLight (gardée même quand le GLB est là)
    const l = new THREE.PointLight(lp.col, 1.6, 18, 1.4);
    l.position.set(lp.x, 4.7, lp.z);
    const isDramatic = dramaticIndices.includes(idx);
    l.userData = {
      base: 1.6, flicker: true, phase: Math.random()*7,
      dramaticFlicker: isDramatic, dramaticOff: 0,
      dramaticNext: Math.random() * 4,
    };
    scene.add(l);
    zoneNeons.push(l);
    // halo glow
    const glowSpr = addGlow(lp.x, 4.85, lp.z, lp.col, 3.0);
    lampVisualHelpers.push(glowSpr);
    // ampoule visible
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 6),
      new THREE.MeshBasicMaterial({ color: lp.col })
    );
    bulb.position.set(lp.x, 4.85, lp.z);
    scene.add(bulb);
    lampVisualHelpers.push(bulb);
    // fallback procédural pole+head supprimés au load GLB
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 5.0, 8), poleMat);
    pole.position.set(lp.x, 2.5, lp.z);
    scene.add(pole);
    proceduralLampMeshes.push(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), poleMat);
    head.position.set(lp.x, 5.0, lp.z);
    scene.add(head);
    proceduralLampMeshes.push(head);
  }
}
placeStreetLamps();

const streetLampLoader = new GLTFLoader();
streetLampLoader.load('public/models/street_lamp.glb', (gltf) => {
  const template = gltf.scene;
  console.log(`[street_lamp GLB] triangles: ${countTriangles(template).toLocaleString()} (×${lampPositions.length} instances)`);
  const rawBox = new THREE.Box3().setFromObject(template);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const targetHeight = 5.0;
  const scale = targetHeight / Math.max(0.001, rawSize.y);
  template.scale.setScalar(scale);
  template.updateMatrixWorld(true);
  template.traverse(c => {
    if (c.isMesh || c.isSkinnedMesh) {
      c.frustumCulled = true;
      c.castShadow = false;
      c.receiveShadow = false;
      if (Array.isArray(c.material)) c.material = c.material.map(m => applyLowPoly(m.clone()));
      else if (c.material) c.material = applyLowPoly(c.material.clone());
    }
  });
  forceNearestFilter(template);
  applyOutlinesRecursive(template, 0.04 / scale, 0x000000, 0.2);
  const finalBox = new THREE.Box3().setFromObject(template);
  const yOffset = -finalBox.min.y;
  // supprime procéduraux + cache helpers 2D
  for (const m of proceduralLampMeshes) scene.remove(m);
  proceduralLampMeshes.length = 0;
  for (const h of lampVisualHelpers) h.visible = false;
  // InstancedMesh × N (1 par sub-mesh, 8 instances chacun)
  template.updateMatrixWorld(true);
  const subMeshes = [];
  template.traverse(c => {
    if (c.isMesh) subMeshes.push({
      geometry: c.geometry, material: c.material,
      localMatrix: c.matrixWorld.clone(),
    });
  });
  for (const sm of subMeshes) {
    const inst = new THREE.InstancedMesh(sm.geometry, sm.material, lampPositions.length);
    inst.frustumCulled = true;
    inst.castShadow = false;
    inst.receiveShadow = false;
    for (let i = 0; i < lampPositions.length; i++) {
      const lp = lampPositions[i];
      const worldMat = new THREE.Matrix4()
        .makeTranslation(lp.x, yOffset, lp.z)
        .multiply(sm.localMatrix);
      inst.setMatrixAt(i, worldMat);
    }
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }
  console.log(`[street_lamp GLB] InstancedMesh × ${lampPositions.length} (${subMeshes.length} sous-meshes)`);
}, undefined, (err) => {
  console.warn('[street_lamp GLB] échec, fallback procédural :', err);
});

// =============================================================================
//  HANDLERS INJECTÉS PAR main.js (évite cycles d'import)
// =============================================================================
const actions = {
  giveWeapon: () => {},
  refillAmmo: () => {},
  medkit:     () => {},
  armor:      () => {},
  regen:      () => {},
  nightVision:() => {},
  lightUp:    () => {},
};
export function setActionHandlers(map) { Object.assign(actions, map); }
// Stub conservé pour compat main.js — plus de transition de zone en MVP mono-map.
export function setTransitionHandler(_fn) { /* no-op */ }

// =============================================================================
//  WALL BUYS — armes / munitions affichées sur les murs (style survival classique)
// =============================================================================
export const buyStations = [];

// =============================================================================
//  MAP EDITOR — fonctions (les declarations sont hoisted en haut du fichier)
// =============================================================================

// Helper pour tagger un Object3D et l'ajouter au registry éditable.
// Marque aussi les obstacles ajoutés depuis le dernier tagEditable comme "owned"
// par ce prop, ce qui permet de les recalculer dynamiquement quand on le déplace.
export function tagEditable(obj, type, opts = {}) {
  if (!obj) return obj;
  const id = `${type}_${editablePropIdCounter++}`;
  obj.userData.editable = {
    id, type,
    defaultPos: { x: obj.position.x, z: obj.position.z },
    defaultRot: obj.rotation.y || 0,
    // Si true, ce prop ne peut pas être supprimé par applyMapData (replaceAll).
    // Utilisé pour les murs structurels du dépôt (lintels, façades porteuses).
    protected: opts.protected === true,
  };
  editableProps.push(obj);
  // Marque les obstacles ajoutés depuis le dernier tagEditable comme owned par ce prop
  for (let i = _lastObstaclesLen; i < obstacles.length; i++) {
    obstacles[i].owner = obj;
  }
  _lastObstaclesLen = obstacles.length;
  return obj;
}

// === Rebuild des AABB de collision depuis les editableProps ===
// Pour chaque editable, calcule son Box3 et remplace ses anciens obstacles.
// Throttled : maximum 1× toutes les 100ms (debounce sur trailing edge).
const _tempBox = new THREE.Box3();
let _rebuildPending = false;
function _doRebuildObstacles() {
  _rebuildPending = false;
  for (let i = obstacles.length - 1; i >= 0; i--) {
    if (obstacles[i].owner) obstacles.splice(i, 1);
  }
  for (const prop of editableProps) {
    _tempBox.setFromObject(prop);
    if (!isFinite(_tempBox.min.x) || _tempBox.min.x === _tempBox.max.x) continue;
    // Skip les props dont le BAS est au-dessus de la tête du joueur (~1.6m,
    // marge 2m). Sinon les linteaux de porte et les bandeaux au-dessus des
    // fenêtres deviennent des « murs invisibles » qui couvrent la projection
    // XZ de l'ouverture → impossible de passer la porte.
    if (_tempBox.min.y > 2.0) continue;
    // IMPORTANT : utiliser les MÊMES clés que addObstacle (minX/maxX/minZ/maxZ).
    // Sinon resolveCollision lit b.minX === undefined → NaN → camera.position
    // devient NaN → AudioListener crash. Bug latent confirmé dans les logs.
    obstacles.push({
      minX: _tempBox.min.x, maxX: _tempBox.max.x,
      minZ: _tempBox.min.z, maxZ: _tempBox.max.z,
      owner: prop,
    });
  }
  _lastObstaclesLen = obstacles.length;
}
export function rebuildObstacles() {
  // Debounce : si déjà programmé, no-op (le pending callback fera le job)
  if (_rebuildPending) return;
  _rebuildPending = true;
  setTimeout(_doRebuildObstacles, 100);
}

// Applique une map JSON sauvée : remap les positions/rotations/scale par ID.
// Les props absents de la sauvegarde gardent leur état par défaut.
export function applyMapData(data) {
  if (!data) return;

  // 1) Props ordinaires : diff par ID (repositionne | crée | supprime)
  if (Array.isArray(data.props)) {
    const byId = new Map();
    for (const p of editableProps) {
      byId.set(p.userData.editable.id, p);
      if (!p.userData.editable.originalScale) {
        p.userData.editable.originalScale = p.scale.clone();
      }
    }
    const jsonIds = new Set(data.props.map(p => p.id));
    const unsupportedTypes = new Set();

    // 1a) Pour chaque entrée du JSON : repositionne ou crée
    for (const entry of data.props) {
      let prop = byId.get(entry.id);
      if (!prop) {
        // Pas dans HORDE → crée dynamiquement (si type supporté)
        if (!SIMPLE_DYNAMIC_TYPES.has(entry.type)) {
          unsupportedTypes.add(entry.type);
          continue;
        }
        prop = spawnEditableProp(entry.type, entry.x ?? 0, entry.z ?? 0, {
          ry: entry.ry,
          scale: entry.scale,
          wallParams: entry.wallParams,
        });
        if (!prop) continue;
        // Aligne l'ID éditable sur celui du JSON → ré-import idempotent
        prop.userData.editable.id = entry.id;
      } else {
        // Existe déjà → repositionne
        if (typeof entry.x === 'number') prop.position.x = entry.x;
        if (typeof entry.z === 'number') prop.position.z = entry.z;
        if (typeof entry.ry === 'number') prop.rotation.y = entry.ry;
        if (typeof entry.scale === 'number') {
          const orig = prop.userData.editable.originalScale;
          const m = entry.scale;
          prop.scale.set(orig.x * m, orig.y * m, orig.z * m);
        }
      }
    }

    // 1b) Si le JSON dit `replaceAll`, supprime les props HORDE de type simple
    //     qui ne figurent PAS dans le JSON (= suppressions faites dans l'éditeur).
    //     IMPORTANT : on protège les props "structurels" (murs porteurs du dépôt,
    //     lintels, façades), qui sont taggés editable mais NE doivent jamais
    //     être supprimés. Marqueur : userData.editable.protected = true.
    if (data.replaceAll === true) {
      for (const [id, prop] of byId.entries()) {
        if (jsonIds.has(id)) continue;
        const e = prop.userData.editable;
        const t = e?.type;
        if (!SIMPLE_DYNAMIC_TYPES.has(t)) continue;
        if (e?.protected) continue;
        removeEditableProp(prop);
      }
    }

    if (unsupportedTypes.size > 0) {
      console.warn(
        '[applyMapData] types non créables dynamiquement, IDs ignorés s\'ils n\'existent pas en défaut :',
        [...unsupportedTypes].join(', '),
      );
    }
  }

  // 2) Spawn du joueur (issu de l'éditeur) → écrase la position par défaut
  if (data.playerSpawn && typeof data.playerSpawn.x === 'number' && typeof data.playerSpawn.z === 'number') {
    FAKE_ZONE.playerSpawn.set(data.playerSpawn.x, EYE, data.playerSpawn.z);
    // ry stocké séparément pour orientation initiale (consommé par main.js si besoin)
    FAKE_ZONE.playerSpawnYaw = data.playerSpawn.ry ?? 0;
  }

  // 3) Spawns zombies (issus de l'éditeur) → remplace le pool entier
  if (Array.isArray(data.zombieSpawns) && data.zombieSpawns.length > 0) {
    zombieSpawns.length = 0;
    for (const s of data.zombieSpawns) {
      if (typeof s.x !== 'number' || typeof s.z !== 'number') continue;
      zombieSpawns.push(new THREE.Vector3(s.x, 0, s.z));
    }
  }

  // Recalcule les collisions après remap
  rebuildObstacles();
}

// =============================================================================
//  IMPORT JSON externe (depuis l'éditeur) — sauvegarde + active la carte
// =============================================================================
export function importMapJson(data, displayName) {
  if (!data || typeof data !== 'object') {
    throw new Error('JSON invalide');
  }
  // Génère un ID unique pour la nouvelle carte
  const id = `imported-${Date.now().toString(36)}`;
  const name = displayName || data.name || `Carte importée ${new Date().toLocaleDateString('fr-FR')}`;

  // Sauvegarde le payload
  localStorage.setItem(`horde-map-${id}`, JSON.stringify(data));

  // Met à jour la liste des cartes
  let list = [];
  try {
    const raw = localStorage.getItem(MAP_LIST_KEY);
    if (raw) list = JSON.parse(raw) || [];
  } catch {}
  list.push({ id, name, createdAt: Date.now(), modifiedAt: Date.now(), imported: true });
  localStorage.setItem(MAP_LIST_KEY, JSON.stringify(list));

  // Rend cette carte active pour le prochain démarrage
  localStorage.setItem(MAP_ACTIVE_KEY, id);

  return { id, name };
}

// Types « simples » que HORDE sait créer/supprimer dynamiquement depuis un
// JSON éditeur. Les autres types (street_lamp/bus/car/mystery_box/perk_machine)
// sont juste repositionnés et jamais supprimés (effets gameplay liés).
export const SIMPLE_DYNAMIC_TYPES = new Set([
  'dumpster', 'bus_shelter', 'pallet_stack', 'trash_bag_pile', 'wall',
]);

// Spawn dynamique d'un prop éditable (depuis l'éditeur, runtime).
// opts : { ry, scale, wallParams: {w, h, d, texture} }
export function spawnEditableProp(type, x = 0, z = 0, opts = {}) {
  let obj = null;
  const ry = typeof opts.ry === 'number' ? opts.ry : 0;
  if (type === 'dumpster')           obj = addDumpster(x, z, ry);
  else if (type === 'bus_shelter')   obj = buildBusShelter(x, z, ry);
  else if (type === 'pallet_stack')  obj = addPalletStack(x, z, 3, ry);
  else if (type === 'trash_bag_pile') obj = addTrashBags(x, z);
  else if (type === 'wall')          obj = addWallSegment(
    x, z,
    opts.wallParams?.w ?? 4,
    opts.wallParams?.h ?? 4.5,
    opts.wallParams?.d ?? 0.4,
  );
  // Types complexes (street_lamp, bus, car, mystery_box, perk_machine) :
  // pas de spawn dynamique, on retournera null et l'appelant gère le fallback.
  if (!obj) return null;
  // Rotation Y pour les types qui ne la prennent pas dans leur signature
  if (type === 'trash_bag_pile' && ry !== 0) obj.rotation.y = ry;
  // Échelle relative (si fournie par le JSON)
  if (typeof opts.scale === 'number' && obj.userData.editable) {
    if (!obj.userData.editable.originalScale) {
      obj.userData.editable.originalScale = obj.scale.clone();
    }
    const orig = obj.userData.editable.originalScale;
    obj.scale.set(orig.x * opts.scale, orig.y * opts.scale, orig.z * opts.scale);
  }
  if (obj.userData.editable) obj.userData.editable.dynamicallyAdded = true;
  return obj;
}

// === Spawn mur générique (depuis l'éditeur) ===
// Mur en BoxGeometry paramétrable, matière dépôt par défaut.
function addWallSegment(x, z, w = 4, h = 4.5, d = 0.4) {
  const wallMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x2a2e2a }));
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  m.position.set(x, h/2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  // Conserve les dimensions pour pouvoir les ré-éditer plus tard
  m.userData._wallParams = { w, h, d };
  scene.add(m);
  // Obstacle approximatif (basé sur les dimensions + position)
  addObstacle(x - w/2, x + w/2, z - d/2, z + d/2);
  tagEditable(m, 'wall');
  return m;
}

// Suppression d'un prop éditable
export function removeEditableProp(prop) {
  if (!prop) return;
  scene.remove(prop);
  // Retire les obstacles owned par ce prop
  for (let i = obstacles.length - 1; i >= 0; i--) {
    if (obstacles[i].owner === prop) obstacles.splice(i, 1);
  }
  const idx = editableProps.indexOf(prop);
  if (idx >= 0) editableProps.splice(idx, 1);
  // dispose des resources GPU
  prop.traverse(c => {
    if (c.geometry) c.geometry.dispose?.();
    if (c.material) {
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      for (const m of mats) m.dispose?.();
    }
  });
}

// Charge la map active (selon MAP_ACTIVE_KEY) au boot du jeu.
// Fallback : MAP_STORAGE_KEY (legacy single-slot) si présent.
export function loadSavedMap() {
  try {
    const activeId = localStorage.getItem(MAP_ACTIVE_KEY);
    let raw = null;
    if (activeId) raw = localStorage.getItem(`horde-map-${activeId}`);
    if (!raw) raw = localStorage.getItem(MAP_STORAGE_KEY); // legacy fallback
    if (raw) {
      const data = JSON.parse(raw);
      applyMapData(data);
      console.log(`[map] sauvegarde chargée (${data.props?.length || 0} props)`);
    }
  } catch (e) {
    console.warn('[map] échec chargement sauvegarde :', e);
  }
}

// =============================================================================
//  MULTI-SLOT MAP STORAGE — gestion de plusieurs cartes nommées
// =============================================================================
// Format localStorage :
//  - MAP_LIST_KEY    : [{ id, name, createdAt, modifiedAt }]
//  - MAP_ACTIVE_KEY  : id de la carte active (utilisée par le jeu au boot)
//  - horde-map-{id}  : data JSON de chaque carte

export function listSavedMaps() {
  try {
    const raw = localStorage.getItem(MAP_LIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveMapsList(list) {
  localStorage.setItem(MAP_LIST_KEY, JSON.stringify(list));
}

export function createSavedMap(name, dataJson) {
  const id = `map_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const list = listSavedMaps();
  const entry = { id, name, createdAt: Date.now(), modifiedAt: Date.now() };
  list.push(entry);
  saveMapsList(list);
  localStorage.setItem(`horde-map-${id}`, JSON.stringify(dataJson));
  return id;
}

export function updateSavedMap(id, dataJson) {
  const list = listSavedMaps();
  const entry = list.find(m => m.id === id);
  if (entry) { entry.modifiedAt = Date.now(); saveMapsList(list); }
  localStorage.setItem(`horde-map-${id}`, JSON.stringify(dataJson));
}

export function getSavedMap(id) {
  try {
    const raw = localStorage.getItem(`horde-map-${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function deleteSavedMap(id) {
  const list = listSavedMaps().filter(m => m.id !== id);
  saveMapsList(list);
  localStorage.removeItem(`horde-map-${id}`);
  if (localStorage.getItem(MAP_ACTIVE_KEY) === id) {
    localStorage.removeItem(MAP_ACTIVE_KEY);
  }
}

export function setActiveMap(id) {
  if (id) localStorage.setItem(MAP_ACTIVE_KEY, id);
  else localStorage.removeItem(MAP_ACTIVE_KEY);
}
export function getActiveMapId() {
  return localStorage.getItem(MAP_ACTIVE_KEY);
}

// Canvas fallback : visible même sans la texture PNG dédiée.
// Fond ambre désaturé + contour épais blanc + texte large pour lisibilité
// sur mur sombre en faible éclairage.
function wallBuyTex(label, cost) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  // fond dégradé sombre → ambre brûlé pour contraster avec le mur
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2a1808');
  grad.addColorStop(1, '#180a04');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
  // contour ambre épais + double cadre intérieur
  g.strokeStyle = '#ffb84a'; g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 240);
  g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.strokeRect(20, 20, 472, 216);
  // texte label : blanc cassé épais
  g.fillStyle = '#fff8e0'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 56px "Arial Black", "Impact", sans-serif';
  g.fillText(label, 256, 100);
  // prix : vert pour signaler interactivité
  g.fillStyle = '#5cf09a';
  g.font = 'bold 58px "Arial Black", "Impact", sans-serif';
  g.fillText(`$${cost}`, 256, 186);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = PS1_MODE ? THREE.NearestFilter : THREE.LinearFilter;
  t.minFilter = PS1_MODE ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
  if (PS1_MODE) t.generateMipmaps = false;
  return t;
}

// addWallBuy(x, y, z, ry, label, cost, action, texSlug?)
// texSlug : nom court pour charger une vraie texture PNG dédiée (silhouette
// d'arme + prix, style poster CoD zombies). Cherchera
// `public/textures/sign_wall_<slug>.png` (mode normal) ou
// `public/textures/ps1/sign_wall_<slug>.png` (mode PS1).
// Fallback canvas si le PNG n'est pas encore généré.
function addWallBuy(x, y, z, ry, label, cost, action, texSlug = null) {
  // alphaTest: 0.5 → les pixels visibles sont traités comme opaques (pas de
  // sorting buggé à courte distance), les pixels transparents (fond du PNG)
  // sont nettement clippés (pas de rectangle blanc). Compatible avec :
  //   - canvas fallback (alpha=1 partout → tous pixels conservés)
  //   - PNG avec fond transparent (alpha=0 sur fond → clippé)
  // DoubleSide : robuste face aux conventions de rotation Y des 4 murs.
  const mat = new THREE.MeshBasicMaterial({
    map: wallBuyTex(label, cost),
    transparent: true,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), mat);
  // Décale le panel de 15cm dans le sens de sa normale (vers le joueur,
  // away du mur). 15cm est nécessaire car les murs ont t=0.4m d'épaisseur,
  // donc la face intérieure est à 0.2m du centre du mur. Sans ce push,
  // le panel disparaît derrière la face intérieure quand on s'approche.
  const extraOff = 0.15;
  panel.position.set(
    x + Math.sin(ry) * extraOff,
    y,
    z + Math.cos(ry) * extraOff,
  );
  panel.rotation.y = ry;
  // renderOrder élevé → rendu après les murs, garantit l'affichage par-dessus.
  panel.renderOrder = 10;
  scene.add(panel);

  // Tente de charger la texture PNG dédiée si un slug est fourni
  if (texSlug) {
    const pngTex = new THREE.Texture();
    pngTex.colorSpace = THREE.SRGBColorSpace;
    if (PS1_MODE) {
      pngTex.magFilter = THREE.NearestFilter;
      pngTex.minFilter = THREE.NearestFilter;
      pngTex.generateMipmaps = false;
    } else {
      pngTex.magFilter = THREE.LinearFilter;
      pngTex.minFilter = THREE.LinearMipmapLinearFilter;
      pngTex.anisotropy = 8;
    }
    const swapInPng = (img) => {
      pngTex.image = img;
      pngTex.needsUpdate = true;
      mat.map = pngTex;
      mat.needsUpdate = true;
    };
    const tryUrl = (url, onFail) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => swapInPng(img);
      img.onerror = () => { if (onFail) onFail(); };
      img.src = url;
    };
    if (PS1_MODE) {
      tryUrl(`public/textures/ps1/sign_wall_${texSlug}.png`,
        () => tryUrl(`public/textures/sign_wall_${texSlug}.png`));
    } else {
      tryUrl(`public/textures/sign_wall_${texSlug}.png`);
    }
  }

  // glow: null désactive le pulse animation (qui modifie .material.opacity
  // sur l'objet glow — ferait clignoter le panel si on lui passait `panel`).
  // Le SpotLight castShadow ajouté juste après suffit pour signaler la borne.
  const station = {
    pos: new THREE.Vector3(x, EYE, z),
    label, cost, action, glow: null,
    zone: 'bus_depot',
    kind: 'wall',
  };
  buyStations.push(station);
  // Spotlight castShadow au-dessus du panneau (flaque jaune sale dans le noir)
  addInteractableSpot(x, y, z, 0xffd680, 7);
  // Le panel est l'élément déplaçable en éditeur
  panel.userData.station = station;
  tagEditable(panel, 'wall_buy');
}

// === MYSTERY BOX (caisse en bois + lueur) ===
// Constantes calibrables pour le mystery_box.glb (à ajuster après test visuel)
const MYSTERY_BOX_SCALE = 1.0;        // ratio appliqué après auto-scale par bbox
const MYSTERY_BOX_TARGET_WIDTH = 1.4; // largeur world cible (proportions du prompt)
const MYSTERY_BOX_FRONT_YAW = 0;      // rotation Y si le GLB est mal orienté

function addMysteryBox(x, z) {
  const g = new THREE.Group();
  // Groupe pour les meshes procéduraux temporaires (supprimés quand le GLB charge)
  const procGroup = new THREE.Group();
  g.add(procGroup);

  // Fallback procédural : caisse + sangles (visibles tant que le GLB charge)
  const woodMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x3a2410 }));
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.9), woodMat);
  box.position.y = 0.45;
  procGroup.add(box);
  const strapMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x88882a }));
  for (const sx of [-0.5, 0.5]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.95, 0.95), strapMat);
    strap.position.set(sx, 0.45, 0);
    procGroup.add(strap);
  }

  // Halo doré au sol (toujours présent, conservé pour le pulse animé)
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 2.0),
    new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  halo.position.y = 0.5;
  halo.rotation.x = -Math.PI/2;
  g.add(halo);

  g.position.set(x, 0, z);
  scene.add(g);
  addObstacle(x - 0.7, x + 0.7, z - 0.6, z + 0.6);
  applyOutlinesRecursive(g, 0.025, 0x000000, 0.15);
  addGlow(x, 1.2, z, 0xffc040, 1.5);
  addInteractableSpot(x, 0.5, z, 0xffc040, 9, true);
  tagEditable(g, 'mystery_box');

  buyStations.push({
    pos: new THREE.Vector3(x, EYE, z),
    label: 'MYSTERY BOX',
    cost: 950,
    action: () => actions.giveWeapon('mystery'),
    glow: halo,
    zone: 'bus_depot',
    kind: 'mystery',
  });

  // Charge le GLB et remplace les procéduraux
  const mysteryLoader = new GLTFLoader();
  mysteryLoader.load('public/models/mystery_box.glb', (gltf) => {
    const model = gltf.scene;
    console.log(`[mystery_box GLB] triangles: ${countTriangles(model).toLocaleString()}`);
    // auto-scale sur la largeur cible
    const rawBox = new THREE.Box3().setFromObject(model);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(rawSize.x, rawSize.z);
    const autoScale = MYSTERY_BOX_TARGET_WIDTH / Math.max(0.001, maxDim);
    const finalScale = autoScale * MYSTERY_BOX_SCALE;
    model.scale.setScalar(finalScale);
    model.rotation.y = MYSTERY_BOX_FRONT_YAW;
    model.updateMatrixWorld(true);
    console.log('[mystery_box GLB] raw size', rawSize, '→ scale', finalScale.toFixed(4));
    model.traverse(c => {
      if (c.isMesh || c.isSkinnedMesh) {
        c.frustumCulled = true;
        c.castShadow = true;
        c.receiveShadow = true;
        if (Array.isArray(c.material)) {
          c.material = c.material.map(m => applyLowPoly(m.clone()));
        } else if (c.material) {
          c.material = applyLowPoly(c.material.clone());
        }
      }
    });
    forceNearestFilter(model);
    applyOutlinesRecursive(model, 0.04 / finalScale, 0x000000, 0.2);
    // ancrage au sol
    const finalBox = new THREE.Box3().setFromObject(model);
    model.position.y = -finalBox.min.y;
    // supprime le procédural
    g.remove(procGroup);
    g.add(model);
    // cache le halo plane (carré net additif au sol) — le GLB a ses propres
    // surfaces émissives, le sprite addGlow + SpotLight suffisent pour l'ambiance
    halo.visible = false;
  }, undefined, (err) => {
    console.warn('[mystery_box GLB] échec, fallback procédural :', err);
  });
}

// === PERK MACHINE (distributeur — bouteille colorée émissive) ===
// Constantes calibrables pour les perk machines GLB (à ajuster après test visuel)
const PERK_REGEN_SCALE = 1.0;          // ratio appliqué après auto-scale par bbox
const PERK_REGEN_TARGET_HEIGHT = 2.0;  // hauteur world cible (mêmes proportions que le procédural)
const PERK_REGEN_FRONT_YAW = 0;        // rotation Y locale si le GLB est mal orienté

// Mapping perkKey → fichier GLB (null = pas encore généré, fallback procédural)
const PERK_GLB_MAP = {
  regen: 'public/models/perk_machine_regen.glb',
  // tank: 'public/models/perk_machine_tank.glb',
  // quick: 'public/models/perk_machine_quick.glb',
  // brute: 'public/models/perk_machine_brute.glb',
  // iron: 'public/models/perk_machine_iron.glb',
};

function addPerkMachine(x, z, ry, label, cost, perkKey) {
  const g = new THREE.Group();
  // Groupe pour les meshes procéduraux temporaires (supprimés quand le GLB charge)
  const procGroup = new THREE.Group();
  g.add(procGroup);

  const colorByPerk = {
    regen:        0x2acc66,
    nightVision:  0x6a30c8,
    lightUpgrade: 0xffc040,
  };
  const fc = colorByPerk[perkKey] ?? 0x2acc66;

  // Fallback procédural : corps + bouteille + capsule + label canvas
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 2.0, 0.7),
    applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x141420 }))
  );
  body.position.y = 1.0;
  procGroup.add(body);
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 1.8),
    new THREE.MeshBasicMaterial({ color: fc })
  );
  front.position.set(0, 1.0, 0.36);
  procGroup.add(front);
  const bottleMat = new THREE.MeshBasicMaterial({ color: fc });
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.6, 8), bottleMat);
  bottle.position.set(0, 1.2, 0.4);
  procGroup.add(bottle);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8),
    applyLowPoly(new THREE.MeshLambertMaterial({ color: 0xc0c0c8 }))
  );
  cap.position.set(0, 1.55, 0.4);
  procGroup.add(cap);
  const labelTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0a0a14'; ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = `#${fc.toString(16).padStart(6, '0')}`;
    ctx.lineWidth = 4; ctx.strokeRect(6, 6, 244, 84);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px "Arial Black", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 128, 36);
    ctx.fillStyle = '#4cd07a';
    ctx.font = 'bold 24px "Arial Black", sans-serif';
    ctx.fillText(`$${cost}`, 128, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    return t;
  })();
  const labelMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.32),
    new THREE.MeshBasicMaterial({ map: labelTex })
  );
  labelMesh.position.set(0, 0.4, 0.37);
  procGroup.add(labelMesh);

  // Glow vertical (toujours présent — conservé pour le pulse animé via buyStations.glow)
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 2.4),
    new THREE.MeshBasicMaterial({ color: fc, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.position.set(0, 1.0, 0.38);
  g.add(glow);

  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
  addObstacle(x - 0.55, x + 0.55, z - 0.4, z + 0.4);
  // outlines no-op + halo + spotlight castShadow coloré perk (point focal)
  applyOutlinesRecursive(g, 0.025, 0x000000, 0.15);
  addGlow(x, 1.2, z, fc, 1.4);
  addInteractableSpot(x, 0.5, z, fc, 8, true);
  tagEditable(g, 'perk_machine');

  const actionFn = () => {
    if      (perkKey === 'regen')        actions.regen();
    else if (perkKey === 'nightVision')  actions.nightVision();
    else if (perkKey === 'lightUpgrade') actions.lightUp();
  };
  buyStations.push({
    pos: new THREE.Vector3(x, EYE, z),
    label, cost, action: actionFn, glow,
    zone: 'bus_depot',
    kind: 'perk',
  });

  // Charge le GLB s'il existe pour ce perk, sinon garde le procédural
  const glbPath = PERK_GLB_MAP[perkKey];
  if (!glbPath) return;

  const perkLoader = new GLTFLoader();
  perkLoader.load(glbPath, (gltf) => {
    const model = gltf.scene;
    console.log(`[perk_machine_${perkKey} GLB] triangles: ${countTriangles(model).toLocaleString()}`);
    // auto-scale sur la hauteur cible
    const rawBox = new THREE.Box3().setFromObject(model);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const maxDim = rawSize.y;
    const autoScale = PERK_REGEN_TARGET_HEIGHT / Math.max(0.001, maxDim);
    const finalScale = autoScale * PERK_REGEN_SCALE;
    model.scale.setScalar(finalScale);
    model.rotation.y = PERK_REGEN_FRONT_YAW;
    model.updateMatrixWorld(true);
    console.log(`[perk_machine_${perkKey} GLB] raw size`, rawSize, '→ scale', finalScale.toFixed(4));
    model.traverse(c => {
      if (c.isMesh || c.isSkinnedMesh) {
        c.frustumCulled = true;
        c.castShadow = true;
        c.receiveShadow = true;
        if (Array.isArray(c.material)) {
          c.material = c.material.map(m => applyLowPoly(m.clone()));
        } else if (c.material) {
          c.material = applyLowPoly(c.material.clone());
        }
      }
    });
    forceNearestFilter(model);
    applyOutlinesRecursive(model, 0.04 / finalScale, 0x000000, 0.2);
    // ancrage au sol
    const finalBox = new THREE.Box3().setFromObject(model);
    model.position.y = -finalBox.min.y;
    // supprime le procédural
    g.remove(procGroup);
    g.add(model);
    // cache le glow plane (rectangle net additif devant la machine) — le GLB
    // a sa propre bouteille brillante et son néon, le sprite addGlow + SpotLight
    // suffisent pour l'ambiance lumineuse
    glow.visible = false;
  }, undefined, (err) => {
    console.warn(`[perk_machine_${perkKey} GLB] échec, fallback procédural :`, err);
  });
}

// === LAYOUT DES ACHATS ===
// Rotations Y normalisées : la normale du panel pointe TOUJOURS vers le joueur
// (away du mur). Cohérence indispensable pour que l'offset perpendiculaire
// dans addWallBuy pousse le panel dans la bonne direction.
// - mur SUD (z=+DEPOT_D/2)  → ry = π  (normale -Z, vers joueur au centre)
// - mur NORD (z=-DEPOT_D/2) → ry = 0  (normale +Z, vers joueur au centre)
// - mur EST  (x=+DEPOT_W/2) → ry = π/2  (normale +X, vers extérieur cour)
// - mur OUEST(x=-DEPOT_W/2) → ry = -π/2 (normale -X, vers extérieur cour)
addWallBuy(-4.0, 1.8, DEPOT_D/2 - 0.22, Math.PI, 'PISTOL AMMO', 250,
  () => actions.refillAmmo('pistol'), 'pistol_ammo');

addWallBuy( 4.0, 1.8, -DEPOT_D/2 + 0.22, 0, 'OLYMPIA', 500,
  () => actions.giveWeapon('shotgun'), 'olympia');

addWallBuy(DEPOT_W/2 + 0.22, 1.8, 0, Math.PI/2, 'MP5', 1000,
  () => actions.giveWeapon('smg'), 'mp5');

addWallBuy(-DEPOT_W/2 - 0.22, 1.8, 0, -Math.PI/2, 'BAT', 250,
  () => actions.giveWeapon('bat'), 'bat');

// MYSTERY BOX — coin nord-est de la cour
addMysteryBox(16, -15);

// PERK : REGEN — à l'intérieur du depot, coin sud-est
addPerkMachine(5.0, 3.5, Math.PI, 'REGEN', 2500, 'regen');

// =============================================================================
//  CLUTTER & PROPS — densifie la cour avec du mobilier urbain industriel.
//  Tous procéduraux pour rester légers (pas de GLB supplémentaires à charger).
// =============================================================================

// === DUMPSTER (gros conteneur poubelle métal vert avec couvercle) ===
// Track les procéduraux pour les remplacer par le GLB une fois chargé
const proceduralDumpsters = [];
const DUMPSTER_TARGET_WIDTH = 1.8;

function addDumpster(x, z, ry = 0) {
  const g = new THREE.Group();
  const greenMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x2a4a2a }));
  const darkMat  = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x121814 }));
  // corps : box 1.8 × 1.3 × 1.0
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.0), greenMat);
  body.position.y = 0.55;
  g.add(body);
  // bandes horizontales sombres (décor)
  const band1 = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.05, 1.02), darkMat);
  band1.position.y = 0.85;
  g.add(band1);
  const band2 = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.05, 1.02), darkMat);
  band2.position.y = 0.25;
  g.add(band2);
  // couvercle légèrement ouvert (penché vers l'arrière)
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.0), darkMat);
  lid.position.set(0, 1.18, -0.15);
  lid.rotation.x = -0.2;
  g.add(lid);
  // 4 roulettes
  const wheelMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x080808 }));
  for (const sx of [-0.7, 0.7]) {
    for (const sz of [-0.4, 0.4]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.08, 8), wheelMat);
      w.rotation.z = Math.PI/2;
      w.position.set(sx, 0.10, sz);
      g.add(w);
    }
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
  const aw = ry === 0 ? 1.8 : 1.0;
  const ad = ry === 0 ? 1.0 : 1.8;
  addObstacle(x - aw/2, x + aw/2, z - ad/2, z + ad/2);
  // track pour swap GLB
  proceduralDumpsters.push({ group: g, x, z, ry });
  tagEditable(g, 'dumpster');
  return g;
}

// === BUS SHELTER (abri d'arrêt : toit + 2 poteaux + banc) ===
const proceduralBusShelters = [];
const BUS_SHELTER_TARGET_WIDTH = 3.0;

function buildBusShelter(x, z, ry = 0) {
  const g = new THREE.Group();
  const frameMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x202028 }));
  const roofMat  = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x16161a }));
  const benchMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x3a2a18 }));
  // 4 poteaux carrés
  for (const sx of [-1.2, 1.2]) {
    for (const sz of [-0.6, 0.6]) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.10, 2.6, 0.10), frameMat);
      pole.position.set(sx, 1.3, sz);
      g.add(pole);
    }
  }
  // toit incliné (légèrement avant vers le sud)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.10, 1.5), roofMat);
  roof.position.set(0, 2.65, 0);
  roof.rotation.x = -0.06;
  g.add(roof);
  // panneau latéral (panneau de pub côté est)
  const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.8, 1.3), frameMat);
  sidePanel.position.set(1.2, 1.0, 0);
  g.add(sidePanel);
  // banc à l'intérieur (face vers la cour, dos contre le panneau)
  const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.10, 0.45), benchMat);
  benchSeat.position.set(0, 0.42, 0.30);
  g.add(benchSeat);
  // 3 lattes du dossier
  for (let i = 0; i < 3; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.04), benchMat);
    slat.position.set(0, 0.7 + i * 0.18, 0.05);
    g.add(slat);
  }
  // pieds du banc
  for (const sx of [-0.9, 0.9]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.40), frameMat);
    leg.position.set(sx, 0.21, 0.30);
    g.add(leg);
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
  // collision : zone des poteaux + panneau
  const aw = ry === 0 ? 2.6 : 1.4;
  const ad = ry === 0 ? 1.4 : 2.6;
  addObstacle(x - aw/2, x + aw/2, z - ad/2, z + ad/2);
  // track pour swap GLB
  proceduralBusShelters.push({ group: g, x, z, ry });
  tagEditable(g, 'bus_shelter');
  return g;
}

// =============================================================================
//  GLB SWAP — dumpster.glb et bus_shelter.glb
//  Charge le GLB une seule fois (loader async), puis remplace tous les
//  procéduraux trackés dans les arrays correspondants.
// =============================================================================
const dumpsterLoader = new GLTFLoader();
dumpsterLoader.load('public/models/dumpster.glb', (gltf) => {
  const template = gltf.scene;
  console.log(`[dumpster GLB] triangles: ${countTriangles(template).toLocaleString()} (×${proceduralDumpsters.length} instances)`);
  // auto-scale sur la largeur cible
  const rawBox = new THREE.Box3().setFromObject(template);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(rawSize.x, rawSize.z);
  const scale = DUMPSTER_TARGET_WIDTH / Math.max(0.001, maxDim);
  template.scale.setScalar(scale);
  template.updateMatrixWorld(true);
  template.traverse(c => {
    if (c.isMesh || c.isSkinnedMesh) {
      c.frustumCulled = true;
      c.castShadow = true;
      c.receiveShadow = true;
      if (Array.isArray(c.material)) c.material = c.material.map(m => applyLowPoly(m.clone()));
      else if (c.material) c.material = applyLowPoly(c.material.clone());
    }
  });
  forceNearestFilter(template);
  // ancrage au sol
  const finalBox = new THREE.Box3().setFromObject(template);
  const yOffset = -finalBox.min.y;
  // remplace les procéduraux trackés
  for (const item of proceduralDumpsters) {
    scene.remove(item.group);
    const inst = template.clone(true);
    inst.position.set(item.x, yOffset, item.z);
    inst.rotation.y = item.ry;
    scene.add(inst);
  }
}, undefined, (err) => {
  console.warn('[dumpster GLB] échec, fallback procédural conservé :', err);
});

const busShelterLoader = new GLTFLoader();
busShelterLoader.load('public/models/bus_shelter.glb', (gltf) => {
  const template = gltf.scene;
  console.log(`[bus_shelter GLB] triangles: ${countTriangles(template).toLocaleString()} (×${proceduralBusShelters.length} instances)`);
  const rawBox = new THREE.Box3().setFromObject(template);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(rawSize.x, rawSize.z);
  const scale = BUS_SHELTER_TARGET_WIDTH / Math.max(0.001, maxDim);
  template.scale.setScalar(scale);
  template.updateMatrixWorld(true);
  template.traverse(c => {
    if (c.isMesh || c.isSkinnedMesh) {
      c.frustumCulled = true;
      c.castShadow = true;
      c.receiveShadow = true;
      if (Array.isArray(c.material)) c.material = c.material.map(m => applyLowPoly(m.clone()));
      else if (c.material) c.material = applyLowPoly(c.material.clone());
    }
  });
  forceNearestFilter(template);
  const finalBox = new THREE.Box3().setFromObject(template);
  const yOffset = -finalBox.min.y;
  for (const item of proceduralBusShelters) {
    scene.remove(item.group);
    const inst = template.clone(true);
    inst.position.set(item.x, yOffset, item.z);
    inst.rotation.y = item.ry;
    scene.add(inst);
  }
}, undefined, (err) => {
  console.warn('[bus_shelter GLB] échec, fallback procédural conservé :', err);
});

// === PALETTE EN BOIS (empilable) ===
// === PALETTE EN BOIS (procédural fallback + swap GLB) ===
const proceduralPalletStacks = [];
const PALLET_STACK_TARGET_WIDTH = 1.1;

function addPalletStack(x, z, count = 3, ry = 0) {
  const g = new THREE.Group();
  const palletMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x6a4a26 }));
  const slatMat   = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x4a3018 }));
  for (let i = 0; i < count; i++) {
    const y = i * 0.12 + 0.06;
    // 3 lattes haut
    for (let j = 0; j < 3; j++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.025, 0.18), palletMat);
      slat.position.set(0, y + 0.05, -0.4 + j * 0.4);
      g.add(slat);
    }
    // 3 supports
    for (let j = 0; j < 3; j++) {
      const sup = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.08, 1.1), slatMat);
      sup.position.set(-0.45 + j * 0.45, y, 0);
      g.add(sup);
    }
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
  addObstacle(x - 0.55, x + 0.55, z - 0.55, z + 0.55);
  proceduralPalletStacks.push({ group: g, x, z, ry, count });
  tagEditable(g, 'pallet_stack');
  return g;
}

// Charge pallet_stack.glb et remplace les procéduraux trackés
const palletStackLoader = new GLTFLoader();
palletStackLoader.load('public/models/pallet_stack.glb', (gltf) => {
  const template = gltf.scene;
  console.log(`[pallet_stack GLB] triangles: ${countTriangles(template).toLocaleString()} (×${proceduralPalletStacks.length} instances)`);
  const rawBox = new THREE.Box3().setFromObject(template);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(rawSize.x, rawSize.z);
  const scale = PALLET_STACK_TARGET_WIDTH / Math.max(0.001, maxDim);
  template.scale.setScalar(scale);
  template.updateMatrixWorld(true);
  template.traverse(c => {
    if (c.isMesh || c.isSkinnedMesh) {
      c.frustumCulled = true;
      c.castShadow = true;
      c.receiveShadow = true;
      if (Array.isArray(c.material)) c.material = c.material.map(m => applyLowPoly(m.clone()));
      else if (c.material) c.material = applyLowPoly(c.material.clone());
    }
  });
  forceNearestFilter(template);
  const finalBox = new THREE.Box3().setFromObject(template);
  const yOffset = -finalBox.min.y;
  for (const item of proceduralPalletStacks) {
    scene.remove(item.group);
    const inst = template.clone(true);
    inst.position.set(item.x, yOffset, item.z);
    inst.rotation.y = item.ry;
    scene.add(inst);
  }
}, undefined, (err) => {
  console.warn('[pallet_stack GLB] échec, fallback procédural conservé :', err);
});

// === TAS DE SACS POUBELLE NOIRS ===
// === TAS DE SACS POUBELLE (procédural fallback + swap GLB) ===
const proceduralTrashBags = [];
const TRASH_BAG_TARGET_WIDTH = 1.4;

function addTrashBags(x, z) {
  const g = new THREE.Group();
  const bagMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x0a0a10 }));
  const stainMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x1a1410 }));
  // 4-5 sacs sphéro-cylindriques entassés
  const positions = [
    [0, 0.35, 0, 0.5],
    [0.45, 0.30, 0.1, 0.45],
    [-0.35, 0.32, 0.15, 0.42],
    [0.20, 0.55, -0.30, 0.38],
    [-0.15, 0.45, -0.40, 0.35],
  ];
  for (const [bx, by, bz, r] of positions) {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), bagMat);
    bag.scale.set(1, 1.15, 1);
    bag.position.set(bx, by, bz);
    g.add(bag);
  }
  // petite tache au sol pour ancrer
  const stain = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12), stainMat);
  stain.rotation.x = -Math.PI/2;
  stain.position.y = 0.015;
  g.add(stain);
  g.position.set(x, 0, z);
  scene.add(g);
  addObstacle(x - 0.7, x + 0.7, z - 0.7, z + 0.7);
  // Rotation aléatoire pour casser la répétition visuelle des 3 tas
  const ry = Math.random() * Math.PI * 2;
  proceduralTrashBags.push({ group: g, x, z, ry });
  tagEditable(g, 'trash_bag_pile');
  return g;
}

// Charge trash_bag_pile.glb et remplace les procéduraux trackés
const trashBagLoader = new GLTFLoader();
trashBagLoader.load('public/models/trash_bag_pile.glb', (gltf) => {
  const template = gltf.scene;
  console.log(`[trash_bag_pile GLB] triangles: ${countTriangles(template).toLocaleString()} (×${proceduralTrashBags.length} instances)`);
  const rawBox = new THREE.Box3().setFromObject(template);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(rawSize.x, rawSize.z);
  const scale = TRASH_BAG_TARGET_WIDTH / Math.max(0.001, maxDim);
  template.scale.setScalar(scale);
  template.updateMatrixWorld(true);
  template.traverse(c => {
    if (c.isMesh || c.isSkinnedMesh) {
      c.frustumCulled = true;
      c.castShadow = true;
      c.receiveShadow = true;
      if (Array.isArray(c.material)) c.material = c.material.map(m => applyLowPoly(m.clone()));
      else if (c.material) c.material = applyLowPoly(c.material.clone());
    }
  });
  forceNearestFilter(template);
  const finalBox = new THREE.Box3().setFromObject(template);
  const yOffset = -finalBox.min.y;
  for (const item of proceduralTrashBags) {
    scene.remove(item.group);
    const inst = template.clone(true);
    inst.position.set(item.x, yOffset, item.z);
    inst.rotation.y = item.ry;
    scene.add(inst);
  }
}, undefined, (err) => {
  console.warn('[trash_bag_pile GLB] échec, fallback procédural conservé :', err);
});

// === CABANON (petit shed bois/métal dans un coin) ===
function buildShed(x, z, ry = 0) {
  const g = new THREE.Group();
  const wallMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x3a2818 }));
  const roofMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x1a1410 }));
  const doorMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x222018 }));
  const W = 2.4, D = 2.0, H = 2.4;
  // 4 murs
  const north = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.10), wallMat);
  north.position.set(0, H/2, -D/2);
  g.add(north);
  const south = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.10), wallMat);
  south.position.set(0, H/2, D/2);
  g.add(south);
  const east = new THREE.Mesh(new THREE.BoxGeometry(0.10, H, D), wallMat);
  east.position.set(W/2, H/2, 0);
  g.add(east);
  const west = new THREE.Mesh(new THREE.BoxGeometry(0.10, H, D), wallMat);
  west.position.set(-W/2, H/2, 0);
  g.add(west);
  // porte sur le mur sud
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.8, 0.05), doorMat);
  door.position.set(0.3, 0.9, D/2 + 0.06);
  g.add(door);
  // toit incliné
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.10, D + 0.2), roofMat);
  roof.position.set(0, H + 0.05, 0);
  roof.rotation.x = -0.12;
  g.add(roof);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
  const aw = ry === 0 ? W : D;
  const ad = ry === 0 ? D : W;
  addObstacle(x - aw/2, x + aw/2, z - ad/2, z + ad/2);
  return g;
}

// === LAMPADAIRES SUPPLÉMENTAIRES (4 de plus, mi-mur) ===
function addExtraStreetLamp(px, pz, col) {
  const poleMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x16161c }));
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 5.0, 8), poleMat);
  pole.position.set(px, 2.5, pz);
  scene.add(pole);
  addObstacle(px - 0.15, px + 0.15, pz - 0.15, pz + 0.15);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), poleMat);
  head.position.set(px, 5.0, pz);
  scene.add(head);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 8, 6),
    new THREE.MeshBasicMaterial({ color: col })
  );
  bulb.position.set(px, 4.85, pz);
  scene.add(bulb);
  const l = new THREE.PointLight(col, 1.4, 16, 1.4);
  l.position.set(px, 4.7, pz);
  l.userData = { base: 1.4, flicker: true, phase: Math.random()*7 };
  scene.add(l);
  zoneNeons.push(l);
  addGlow(px, 4.85, pz, col, 2.5);
}

// === CARCASSES DE VOITURES (utilise car.glb déjà sur le disque) ===
const CAR_POSITIONS = [
  { x: -2, z: -16, ry: 0.4 },     // sud-ouest, légèrement tournée
  { x: 10, z: 16, ry: Math.PI/3 }, // sud-est, en travers
];
// collisions placées dès maintenant (dimensions approchées d'un sedan)
const CAR_LEN = 4.5, CAR_WID = 1.9;
for (const p of CAR_POSITIONS) {
  const aw = Math.abs(Math.cos(p.ry)) * CAR_LEN + Math.abs(Math.sin(p.ry)) * CAR_WID;
  const ad = Math.abs(Math.sin(p.ry)) * CAR_LEN + Math.abs(Math.cos(p.ry)) * CAR_WID;
  addObstacle(p.x - aw/2, p.x + aw/2, p.z - ad/2, p.z + ad/2);
}
const carLoader = new GLTFLoader();
carLoader.load('public/models/car.glb', (gltf) => {
  console.log(`[car GLB] triangles: ${countTriangles(gltf.scene).toLocaleString()} (×2 instances)`);
  const template = gltf.scene;
  const rawBox = new THREE.Box3();
  let any = false;
  template.updateMatrixWorld(true);
  template.traverse(c => {
    if ((c.isMesh || c.isSkinnedMesh) && c.geometry) {
      if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
      const cb = c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld);
      if (!any) { rawBox.copy(cb); any = true; }
      else rawBox.union(cb);
    }
  });
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const rawMaxDim = Math.max(rawSize.x, rawSize.z);
  const scale = CAR_LEN / Math.max(0.001, rawMaxDim);
  template.scale.setScalar(scale);
  template.updateMatrixWorld(true);
  template.traverse(c => {
    if (c.isMesh || c.isSkinnedMesh) {
      c.frustumCulled = true; // car GLB statique, safe à culler
      if (Array.isArray(c.material)) {
        c.material = c.material.map(m => applyLowPoly(m.clone()));
      } else if (c.material) {
        c.material = applyLowPoly(c.material.clone());
      }
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  forceNearestFilter(template);
  applyOutlinesRecursive(template, 0.05 / scale, 0x000000, 0.4);
  const finalBox = new THREE.Box3().setFromObject(template);
  const yOffset = -finalBox.min.y;
  for (const p of CAR_POSITIONS) {
    const inst = template.clone(true);
    inst.position.set(p.x, yOffset, p.z);
    inst.rotation.y = p.ry;
    scene.add(inst);
    tagEditable(inst, 'car');
  }
}, undefined, (err) => {
  console.warn('[car GLB] chargement échoué :', err);
});

// === Placements concrets ===
// 4 lampadaires supplémentaires aux mi-murs (alternance jaune/bleu)
// Les 4 lampadaires mi-mur sont maintenant inclus dans `lampPositions` plus
// haut (= 8 instances street_lamp.glb au total). Anciens appels retirés :
// addExtraStreetLamp(0, -19, 0xffd070); addExtraStreetLamp(0, 19, 0x90b8ff);
// addExtraStreetLamp(-19, 0, 0xffd070); addExtraStreetLamp(19, 0, 0x90b8ff);

// 2 dumpsters
addDumpster(-18, -8, Math.PI/2);
addDumpster( 18,  4, -Math.PI/2);

// 1 abri à bus orienté vers la cour sud
buildBusShelter(-12, 18, Math.PI);

// 1 cabanon de maintenance dans le coin nord-est
buildShed(18, -18, -Math.PI/3);

// Empilements de palettes près des bus
addPalletStack(-19,   12, 4, 0.3);
addPalletStack( 11, -13, 3, -0.5);
// === SCÉNOGRAPHIE — palettes formant des chokepoints qui forcent les
//     trajectoires de combat (style SH/RE labyrinthe partial) ===
addPalletStack( -2, -16, 2, Math.PI/2);    // chemin nord-ouest étranglé
addPalletStack(  8,  14, 3, -0.8);         // bloque l'angle SE de la cour
addPalletStack( 17,  -3, 2, 0.4);          // près du wall buy est

// Tas de sacs poubelle scatter
addTrashBags(-7,  16);
addTrashBags(13,  10);
addTrashBags(-4,  19);
// === SCÉNOGRAPHIE — sacs additionnels pour densifier les ambiances ===
addTrashBags(-15, -2);                     // près du mur ouest
addTrashBags( 6,  -1);                     // milieu cour (créé chokepoint)
addTrashBags( 15,  17);                    // coin SE désert

// =============================================================================
//  PASSE FINALE — outlines cartoon sur tout le décor statique restant
//  (murs depot, murs enceinte, bancs, comptoir, wall buys, lampadaires…).
//  Skip automatique via :
//   - userData._isOutline (outlines existantes)
//   - userData._hasOutline (déjà outliné, ex: mystery box)
//   - userData._skipOutline (ground, plafond, sky)
//   - MeshBasicMaterial (decals, écrans, sprites glow)
//   - minSize 0.3 object-space (filtre les détails trop fins)
// =============================================================================
// DA XIII : trait d'encre noir net et épais sur tout (sauf petits détails < 0.2m).
applyOutlinesRecursive(scene, 0.06, 0x000000, 0.2);

// =============================================================================
//  FAKE_ZONE + zombieSpawns — déclarés AVANT loadSavedMap() car applyMapData()
//  peut écraser playerSpawn et zombieSpawns (depuis le JSON éditeur). TDZ-safe.
// =============================================================================
const FAKE_ZONE = {
  id: 'bus_depot',
  name: 'BUS DEPOT',
  baseX: 0, baseY: 0, baseZ: 0,
  playerSpawn: new THREE.Vector3(0, EYE, 0),  // centre du bâtiment (défaut)
  playerSpawnYaw: 0,
  minX: -W/2, maxX: W/2,
  minZ: -D/2, maxZ: D/2,
  fogColor: FOG_COLOR, fogNear: FOG_NEAR, fogFar: FOG_FAR,
  ambientIntensity: 0.20,
  group: scene,
};

// Pool de spawns zombies (par défaut : ouvertures + coins). applyMapData() le
// remplace si le JSON éditeur fournit des positions explicites.
const zombieSpawns = [
  // portes du bâtiment central
  new THREE.Vector3(0, 0, -DEPOT_D/2 - 1.0),
  new THREE.Vector3(0, 0,  DEPOT_D/2 + 1.0),
  // fenêtres (extérieur, devant les barricades)
  new THREE.Vector3( DEPOT_W/2 + 1.2, 0, -2.2),
  new THREE.Vector3( DEPOT_W/2 + 1.2, 0,  2.2),
  new THREE.Vector3(-DEPOT_W/2 - 1.2, 0, -2.2),
  new THREE.Vector3(-DEPOT_W/2 - 1.2, 0,  2.2),
  // coins de la cour
  new THREE.Vector3(-W/2 + 4, 0, -D/2 + 4),
  new THREE.Vector3( W/2 - 4, 0, -D/2 + 4),
  new THREE.Vector3(-W/2 + 4, 0,  D/2 - 4),
  new THREE.Vector3( W/2 - 4, 0,  D/2 - 4),
];
export function getZombieSpawns() { return zombieSpawns; }

// Applique la sauvegarde map JSON (si présente) APRÈS que tous les props ont
// été placés en défaut. Les props non sauvés restent en position par défaut.
loadSavedMap();
// Rebuild les collisions une première fois pour les meshes procéduraux.
rebuildObstacles();
// Re-rebuild après quelques delays pour couvrir les loaders GLB async
// (bus, car, lampes, dumpsters, etc. mettent ~50-500ms à load).
setTimeout(rebuildObstacles, 500);
setTimeout(rebuildObstacles, 1500);
setTimeout(rebuildObstacles, 3000);

// =============================================================================
//  PASSE FINALE — castShadow / receiveShadow sur tout le décor statique
//  Indispensable pour que les SpotLight castShadow projettent leurs ombres
//  sur les murs/sols/props. Coût raisonnable car les shadow maps des
//  SpotLight sont à 512² (pas la moon à 2048²).
// =============================================================================
function setupShadowsRecursive(root) {
  root.traverse(c => {
    if (!c.isMesh && !c.isSkinnedMesh) return;
    if (c === skyMesh) return;
    if (c.userData._isOutline) return;
    if (c.material && c.material.isMeshBasicMaterial) return; // decals, sprites
    if (c.userData.isFloor) {
      c.receiveShadow = true;
      c.castShadow = false;
    } else {
      // Filtre par taille : seuls les gros volumes castent une shadow.
      // Évite que les planches / boutons / petits props participent à la
      // shadow pass de la moon (gros gain perf).
      if (c.geometry) {
        if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
        const sz = c.geometry.boundingBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(sz.x, sz.y, sz.z);
        c.castShadow = maxDim >= 1.0; // seuil 1m
      } else {
        c.castShadow = true;
      }
      c.receiveShadow = true;
    }
  });
}
setupShadowsRecursive(scene);

// =============================================================================
//  BARRICADE SLOTS (exposés pour la mécanique cassage/rebuild — à implémenter)
// =============================================================================
export const barricadeSlots = [
  { x:  DEPOT_W/2 + 0.2, z: -2.2, normal: new THREE.Vector3( 1, 0, 0) },
  { x:  DEPOT_W/2 + 0.2, z:  2.2, normal: new THREE.Vector3( 1, 0, 0) },
  { x: -DEPOT_W/2 - 0.2, z: -2.2, normal: new THREE.Vector3(-1, 0, 0) },
  { x: -DEPOT_W/2 - 0.2, z:  2.2, normal: new THREE.Vector3(-1, 0, 0) },
];

// =============================================================================
//  EXPORTS DE COMPAT (anciennes APIs zones/blackout) — neutralisés MVP mono-map
// =============================================================================
// Stub conservé pour compat enemies.js
export function prepareZoneTransition() { /* no-op */ }

// Stubs zones (main.js et autres modules les appellent encore)
// FAKE_ZONE déclaré plus haut (avant loadSavedMap pour TDZ).
export function getZone(_id) { return FAKE_ZONE; }
export function getCurrentZone() { return FAKE_ZONE; }
export function currentZoneGroup() { return scene; }
export function switchToZone(_id) { return FAKE_ZONE; }

export function getCurrentBounds() {
  return { minX: -W/2, maxX: W/2, minZ: -D/2, maxZ: D/2 };
}

// (zombieSpawns + getZombieSpawns déplacés plus haut pour TDZ-safety
// avant l'appel à loadSavedMap() qui peut les écraser via applyMapData)

// =============================================================================
//  UPDATE (néons grésillants + pulse glow + blackout stub)
// =============================================================================
let blackoutT = 0;
export function updateWorld(dt) {
  const t = performance.now() / 1000;
  // anim sky (étoiles qui scintillent)
  skyMat.uniforms.uTime.value = t;
  // néons : flicker random standard + variante dramatique sur 2 lampes
  for (const n of zoneNeons) {
    const u = n.userData;
    if (!u.flicker) continue;

    if (u.dramaticFlicker) {
      // Lampe SH3 horror : reste off X secondes puis revient violemment,
      // pendant le ON elle stroboscope sauvagement
      u.dramaticNext -= dt;
      if (u.dramaticOff > 0) {
        u.dramaticOff -= dt;
        n.intensity = u.base * 0.02; // quasi noir
        if (u.dramaticOff <= 0) {
          // retour brutal allumé
          u.dramaticNext = 2 + Math.random() * 5;
        }
      } else if (u.dramaticNext <= 0) {
        // déclenche une nouvelle période off (0.4 - 1.5s)
        u.dramaticOff = 0.4 + Math.random() * 1.1;
      } else {
        // stroboscope chaotique pendant le ON
        u.phase += dt * (4 + Math.random() * 4);
        const f = Math.sin(u.phase * 11) * Math.sin(u.phase * 17);
        const burst = Math.random() < 0.08 ? 0.15 : (0.6 + 0.6 * f);
        n.intensity = u.base * Math.max(0.1, burst);
      }
      continue;
    }

    // Flicker très subtil (DA RE7) : amplitude ±15%, drop rare (1 ‰ par frame)
    u.phase += dt * (3 + Math.random() * 2);
    const f = 0.85 + 0.15 * Math.sin(u.phase * 7) * Math.sin(u.phase * 13);
    n.intensity = u.base * (Math.random() < 0.001 ? 0.5 : f);
  }
  // glow sprites : pulse subtil synchronisé sur le flicker (chaque sprite
  // a son propre phase aléatoire pour éviter qu'ils pulsent tous ensemble)
  for (const spr of glowSprites) {
    const u = spr.userData;
    const pulse = 0.85 + 0.15 * Math.sin(t * 3 + u.basePhase);
    const flick = Math.random() < 0.015 ? 0.4 : 1.0;
    spr.material.opacity = 0.75 * pulse * flick;
    spr.scale.setScalar(u.baseScale * (0.95 + 0.05 * Math.sin(t * 2.4 + u.basePhase)));
  }
  // glow des bornes : pulse léger
  for (const s of buyStations) {
    if (!s.glow) continue;
    const p = 0.5 + 0.5 * Math.sin(t * 2 + s.pos.x);
    s.glow.material.opacity = 0.08 + p * 0.07;
  }
  if (blackoutT > 0) {
    blackoutT -= dt;
    if (blackoutT <= 0) endBlackout();
  }
}

// Stub blackout — laissé pour compat (event possible plus tard)
export function startBlackout(_dur = 14) { /* no-op MVP */ }
export function endBlackout() {
  ambient.intensity = 0.20;
  if (scene.fog) scene.fog.far = FOG_FAR;
  blackoutT = 0;
}
