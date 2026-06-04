import * as THREE from 'three';
import { scene, applyLowPoly } from './renderer.js';
import { ARENA, WALL_H, FOG_FAR, FOG_FAR_BLACKOUT, FOG_NEAR, FOG_COLOR, EYE, NIGHTVISION_AMBIENT } from './config.js';
import { game, player } from './state.js';

// =============================================================================
//  COLLISIONS — Y-aware (filtre par Y range + applique offset XZ par zone)
// =============================================================================
function clamp(v, a, b) { return v<a ? a : v>b ? b : v; }

export function resolveCollision(pos, r) {
  const y = pos.y;
  for (const id in zones) {
    const z = zones[id];
    if (y < z.minY || y > z.maxY) continue;     // hors Y range → ignore cette zone
    const ox = z.baseX, oz = z.baseZ;
    // bounds périmétriques de la zone (en world)
    pos.x = clamp(pos.x, z.minX + ox + r + 0.3, z.maxX + ox - r - 0.3);
    pos.z = clamp(pos.z, z.minZ + oz + r + 0.3, z.maxZ + oz - r - 0.3);
    // obstacles internes (avec offset world)
    for (const b of z.obstacles) {
      const bMinX = b.minX + ox, bMaxX = b.maxX + ox;
      const bMinZ = b.minZ + oz, bMaxZ = b.maxZ + oz;
      const cx = clamp(pos.x, bMinX, bMaxX);
      const cz = clamp(pos.z, bMinZ, bMaxZ);
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx*dx + dz*dz;
      if (d2 < r*r) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = r - d;
          pos.x += dx/d * push; pos.z += dz/d * push;
        } else {
          const l = pos.x - bMinX, ri = bMaxX - pos.x;
          const nz = pos.z - bMinZ, fz = bMaxZ - pos.z;
          const m = Math.min(l, ri, nz, fz);
          if      (m === l)  pos.x = bMinX - r;
          else if (m === ri) pos.x = bMaxX + r;
          else if (m === nz) pos.z = bMinZ - r;
          else               pos.z = bMaxZ + r;
        }
      }
    }
  }
}

// =============================================================================
//  LUMIÈRES GLOBALES (partagées entre zones)
// =============================================================================
// Style PS2 horror : ambient bas + directionnelle faible.
// La torche du joueur + les néons des zones sont les vraies sources lumineuses.
const ambient = new THREE.AmbientLight(0x5a5a6a, 0.18);
scene.add(ambient);
const moon = new THREE.DirectionalLight(0x6068a0, 0.15);
moon.position.set(10, 20, 6);
scene.add(moon);

// =============================================================================
//  SOLS — tracés pour le raycast de gravité du joueur
// =============================================================================
const floorMeshes = [];
export function getFloorMeshes() { return floorMeshes; }

function registerFloor(mesh) {
  mesh.userData.isFloor = true;
  floorMeshes.push(mesh);
  return mesh;
}

// texture procédurale "marches" pour les rampes
const rampStepsTex = (() => {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2a30'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#16161c';
  for (let i = 1; i < 8; i++) g.fillRect(0, i*8 - 1, 64, 2);
  // saletés
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(80,60,40,${0.12 + Math.random()*0.15})`;
    g.fillRect(Math.random()*64, Math.random()*64, 6, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
})();

// makeRamp : crée une rampe inclinée entre 2 points (x0,y0,z0) et (x1,y1,z1)
// width = largeur perpendiculaire à la direction
// Retourne le mesh ; à ajouter au group de zone par l'appelant.
export function makeRamp(x0, y0, z0, x1, y1, z1, width) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const dy = y1 - y0;
  const length3d = Math.hypot(len, dy);
  const angle = Math.atan2(dy, len);
  const yaw = Math.atan2(dx, dz);

  const grp = new THREE.Group();
  grp.position.set((x0+x1)/2, (y0+y1)/2, (z0+z1)/2);
  grp.rotation.y = yaw;

  // texture clonée + repeat selon la longueur (1 marche tous les ~0.4m)
  const tex = rampStepsTex.clone();
  tex.needsUpdate = true;
  tex.repeat.set(Math.max(1, Math.round(width * 0.6)), Math.max(2, Math.round(length3d * 2)));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;

  const geo = new THREE.BoxGeometry(width, 0.1, length3d);
  const mat = applyLowPoly(new THREE.MeshLambertMaterial({ map: tex }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -angle;
  registerFloor(mesh);
  grp.add(mesh);
  grp.userData.rampMesh = mesh;
  return grp;
}

// makePlatform : crée un sol plat surélevé (palier) à hauteur y
export function makePlatform(x, y, z, w, d) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.1, d),
    applyLowPoly(new THREE.MeshLambertMaterial({ map: rampStepsTex }))
  );
  mesh.position.set(x, y, z);
  registerFloor(mesh);
  return mesh;
}

// =============================================================================
//  TEXTURES PBR — chargement depuis public/textures/
//  Chaque texture peut avoir un diffuse + (optionnel) un normal map
//  Convention : floor_mall.png + floor_mall_normal.png
// =============================================================================
const texLoader = new THREE.TextureLoader();

function loadPBRTexture(name, repeat=1) {
  const map = texLoader.load(`public/textures/${name}.png`);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  // tenter de charger une normal map associée (silencieux si absente)
  let normal = null;
  try {
    normal = texLoader.load(`public/textures/${name}_normal.png`, undefined, undefined, () => null);
    if (normal) {
      normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
      normal.repeat.set(repeat, repeat);
    }
  } catch (e) { /* pas de normal map, OK */ }
  return { map, normal };
}

// Material sol avec texture diffuse + vertex jitter PS2 (style cohérent)
function makeToonFloorMaterial(name, repeat=1) {
  const { map } = loadPBRTexture(name, repeat);
  return applyLowPoly(new THREE.MeshLambertMaterial({ map }));
}

// =============================================================================
//  HELPERS GÉNÉRIQUES
// =============================================================================
function makeTex(draw, rep=1) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); draw(g);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  return t;
}

// =============================================================================
//  SYSTÈME DE ZONES
//  Chaque zone a un offset XYZ qui la place dans l'espace monde.
//  Toutes les zones sont visibles en permanence — la collision filtre par Y.
// =============================================================================
const zones = {};

// Positions spatiales monde par zone (Y = étage, XZ = position au sol)
const ZONE_OFFSETS = {
  sec_office:  { x:  0,  y: -10, z:  0 },   // B2 — sous tout
  parking:     { x:  0,  y:  -5, z:  0 },   // B1 — entre B2 et RDC
  hall:        { x:  0,  y:   0, z:  0 },   // RDC — étage du sol
  electronics: { x:  45, y:   0, z: -10 },  // RDC — accolée au Hall, sud-est
  pharmacy:    { x:  45, y:   0, z:  10 },  // RDC — accolée au Hall, nord-est
  sports:      { x: -45, y:   0, z: -10 },  // RDC — accolée au Hall, sud-ouest
};

function createZone(id, opts) {
  const off = ZONE_OFFSETS[id] || { x:0, y:0, z:0 };
  const height = opts.height ?? 7;
  const z = {
    id,
    name: opts.name,
    group: new THREE.Group(),
    obstacles: [],
    neons: [],
    zombieSpawns: [],
    playerSpawn: opts.playerSpawn,
    minX: -opts.width/2, maxX: opts.width/2,
    minZ: -opts.depth/2, maxZ: opts.depth/2,
    baseX: off.x, baseY: off.y, baseZ: off.z,
    minY: off.y - 0.5, maxY: off.y + height + 0.5,    // Y range + tolérance
    fogColor: opts.fogColor ?? FOG_COLOR,
    fogNear: opts.fogNear ?? FOG_NEAR,
    fogFar: opts.fogFar ?? FOG_FAR,
    ambientIntensity: opts.ambient ?? 0.4,
  };
  zones[id] = z;
  z.group.position.set(off.x, off.y, off.z);
  scene.add(z.group);
  // toutes les zones VISIBLES — la collision filtre par Y range
  z.group.visible = true;
  return z;
}

export function getZone(id) { return zones[id]; }
export function getCurrentZone() { return zones[game.currentZone]; }
export function currentZoneGroup() { return getCurrentZone()?.group ?? scene; }
export function getZombieSpawns() {
  const z = getCurrentZone();
  return z ? z.zombieSpawns : [];
}
export function getCurrentBounds() {
  const z = getCurrentZone();
  return z ? { minX:z.minX, maxX:z.maxX, minZ:z.minZ, maxZ:z.maxZ } : null;
}

export function switchToZone(id) {
  const next = zones[id];
  if (!next) return null;
  // toutes les zones restent visibles — on ne touche plus à .visible
  game.currentZone = id;
  scene.fog.color.setHex(next.fogColor);
  scene.fog.near = next.fogNear;
  scene.fog.far = next.fogFar;
  ambient.intensity = next.ambientIntensity;
  return next;
}

// =============================================================================
//  BORNES D'ACHAT + PORTES (même API, type 'buy' ou 'door')
// =============================================================================
export const buyStations = [];

// canvas texture pour l'écran de la borne (label + prix)
function stationScreenTex(label, cost, glowHex) {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0a10'; g.fillRect(0, 0, 320, 160);
  // grille fond rétro
  g.strokeStyle = `rgba(${(glowHex>>16)&0xff},${(glowHex>>8)&0xff},${glowHex&0xff},0.13)`;
  g.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    g.beginPath(); g.moveTo(i*40, 0); g.lineTo(i*40, 160); g.stroke();
    g.beginPath(); g.moveTo(0, i*20); g.lineTo(320, i*20); g.stroke();
  }
  // label
  g.fillStyle = `rgb(${(glowHex>>16)&0xff},${(glowHex>>8)&0xff},${glowHex&0xff})`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const labelClean = label.replace(/ — \$\d+$/, '');   // retire le prix du label si présent
  // adapte la taille selon longueur
  g.font = labelClean.length > 12 ? 'bold 28px "Arial Black", sans-serif' : 'bold 38px "Arial Black", sans-serif';
  g.fillText(labelClean, 160, 60);
  // prix
  if (cost > 0) {
    g.fillStyle = '#4cd07a';
    g.font = 'bold 36px "Arial Black", sans-serif';
    g.fillText(`$${cost}`, 160, 115);
  } else {
    g.fillStyle = '#aaa';
    g.font = 'bold 22px "Arial Black", sans-serif';
    g.fillText('[FREE]', 160, 115);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function addBuyStation(zone, x, y, z, ry, label, cost, action, opts = {}) {
  const kind = opts.kind || 'buy';
  const isDoor = kind === 'door';
  const baseColor   = isDoor ? 0x0a1a22 : 0x141414;
  const emissiveCol = isDoor ? 0x004055 : 0x332200;
  const glowColor   = isDoor ? 0x36c8e8 : 0xffb200;

  const group = new THREE.Group();

  // cadre métal arrière (un peu plus large que le panel principal)
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.85, 0.12),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1f, flatShading: true })
  );
  frame.position.z = -0.05;
  group.add(frame);

  // panel principal (boîtier)
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.6, 0.16),
    new THREE.MeshLambertMaterial({ color: baseColor, emissive: emissiveCol, emissiveIntensity: 0.7 })
  );
  group.add(panel);

  // écran avec texte + prix (vraie texture canvas)
  const screenTex = stationScreenTex(label, cost, glowColor);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 1.0),
    new THREE.MeshBasicMaterial({ map: screenTex })
  );
  screen.position.set(0, 0.15, 0.085);
  group.add(screen);

  // glow par-dessus (pulse, opacité animée)
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.4),
    new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.position.z = 0.09;
  group.add(glow);

  // LED rétroéclairée en haut (bande lumineuse)
  const ledTop = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 0.04),
    new THREE.MeshBasicMaterial({ color: glowColor })
  );
  ledTop.position.set(0, 0.78, 0.085);
  group.add(ledTop);
  const ledBot = ledTop.clone();
  ledBot.position.set(0, -0.78, 0.085);
  group.add(ledBot);

  // 3 boutons cylindriques sous l'écran
  for (let i = 0; i < 3; i++) {
    const btn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.035, 10),
      new THREE.MeshLambertMaterial({
        color: 0x16161c, emissive: glowColor, emissiveIntensity: 0.4, flatShading: true
      })
    );
    btn.rotation.x = Math.PI/2;
    btn.position.set(-0.45 + i*0.45, -0.5, 0.09);
    group.add(btn);
  }

  // fente / lecteur de carte (rectangle noir mince)
  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.04, 0.02),
    new THREE.MeshLambertMaterial({ color: 0x050508 })
  );
  slot.position.set(0.55, -0.5, 0.09);
  group.add(slot);

  // support vertical jusqu'au sol (s'il s'agit d'une borne libre, pas mur)
  // y = hauteur du centre du panel ; on descend jusqu'à y=0.2
  if (y > 1.0) {
    const stem = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, y - 0.5, 0.18),
      new THREE.MeshLambertMaterial({ color: 0x16161c, flatShading: true })
    );
    stem.position.set(0, -(y/2 - 0.2), -0.06);
    group.add(stem);
  }

  group.position.set(x, y, z);
  group.rotation.y = ry;
  zone.group.add(group);
  // s.pos en world coords : ajoute l'offset spatial du group de la zone
  buyStations.push({
    pos: new THREE.Vector3(x + zone.baseX, EYE + zone.baseY, z + zone.baseZ),
    label, cost, action, glow,
    zone: zone.id, kind,
  });
}

// =============================================================================
//  HANDLERS INJECTÉS PAR main.js (évite cycles d'import)
// =============================================================================
let onTransition = () => {};
const actions = {
  giveWeapon: () => {},
  refillAmmo: () => {},
  medkit:     () => {},
  armor:      () => {},
  regen:      () => {},
  nightVision:() => {},
  lightUp:    () => {},
};

export function setTransitionHandler(fn) { onTransition = fn; }
export function setActionHandlers(map)   { Object.assign(actions, map); }

// =============================================================================
//  SECURITY OFFICE (B2) — spawn de départ
// =============================================================================
function cctvWallTex() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#080a0e'; g.fillRect(0, 0, 256, 128);
  for (let r = 0; r < 2; r++) {
    for (let col = 0; col < 4; col++) {
      const sx = col*64 + 3, sy = r*64 + 3, sw = 58, sh = 58;
      // statique noir/bleu sombre
      g.fillStyle = '#0e1218';
      g.fillRect(sx, sy, sw, sh);
      // bruit
      for (let i = 0; i < 60; i++) {
        const v = Math.floor(Math.random()*55);
        g.fillStyle = `rgba(${v},${v},${v+10},${0.4+Math.random()*0.4})`;
        g.fillRect(sx + Math.random()*sw, sy + Math.random()*sh, 1, 1);
      }
      // cadre + label
      g.strokeStyle = '#202028'; g.lineWidth = 1;
      g.strokeRect(sx, sy, sw, sh);
      g.fillStyle = '#2a7a8a';
      g.font = 'bold 8px monospace';
      g.fillText(`CAM ${String(r*4+col+1).padStart(2,'0')}`, sx+3, sy+10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function buildSecurityOffice() {
  const W = 14, D = 11, H = 3.6;
  const zone = createZone('sec_office', {
    name: 'SECURITY OFFICE',
    width: W, depth: D, height: H,
    playerSpawn: new THREE.Vector3(0, EYE, 1.5),
    fogColor: 0x050608,
    fogNear: 4, fogFar: 18,
    ambient: 0.22,
  });

  // sol béton sombre crasseux
  const floorTex = makeTex(g => {
    g.fillStyle = '#28282e'; g.fillRect(0,0,64,64);
    g.fillStyle = '#22222a';
    for (let i = 0; i < 4; i++) g.fillRect(Math.random()*64, Math.random()*64, 8, 4);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `rgba(20,15,10,${0.15 + Math.random()*0.25})`;
      g.beginPath(); g.arc(Math.random()*64, Math.random()*64, 1+Math.random()*4, 0, 7); g.fill();
    }
  }, W/3);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    applyLowPoly(new THREE.MeshLambertMaterial({ map: floorTex }))
  );
  floor.rotation.x = -Math.PI/2;
  registerFloor(floor); zone.group.add(floor);

  // plafond
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x080a0e }))
  );
  ceil.rotation.x = Math.PI/2; ceil.position.y = H;
  zone.group.add(ceil);

  // murs béton tachés
  const wallTex = makeTex(g => {
    g.fillStyle = '#28282d'; g.fillRect(0,0,64,64);
    g.fillStyle = '#1c1c20';
    for (let y = 0; y < 64; y += 18) g.fillRect(0, y, 64, 1);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `rgba(${50+Math.random()*40},5,5,${0.3+Math.random()*0.3})`;
      g.beginPath(); g.arc(Math.random()*64, Math.random()*64, 2+Math.random()*5, 0, 7); g.fill();
    }
  }, 3);
  const wallMat = applyLowPoly(new THREE.MeshLambertMaterial({ map: wallTex }));
  const addWall = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat);
    m.position.set(x, H/2, z);
    zone.group.add(m);
    zone.obstacles.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2 });
  };
  addWall(0, -D/2, W, 0.4);
  addWall(0,  D/2, W, 0.4);
  addWall(-W/2, 0, 0.4, D);
  addWall( W/2, 0, 0.4, D);

  // mur d'écrans CCTV (mur nord, derrière le bureau)
  const cctvTex = cctvWallTex();
  const cctvWall = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 2.0),
    new THREE.MeshBasicMaterial({ map: cctvTex })
  );
  cctvWall.position.set(-2, 2.2, -D/2 + 0.21);
  zone.group.add(cctvWall);

  // bureau principal
  const desk = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.7, 1.2),
    applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x3a2818 }))
  );
  desk.position.set(-2, 0.35, -3);
  zone.group.add(desk);
  zone.obstacles.push({ minX:-3.3, maxX:-0.7, minZ:-3.6, maxZ:-2.4 });

  // moniteur sur le bureau
  const monitor = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x2acc66 })
  );
  monitor.position.set(-2.4, 1.0, -3);
  zone.group.add(monitor);

  // chaise de bureau
  const chair = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 1.0, 0.6),
    applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x18181c }))
  );
  chair.position.set(-2, 0.5, -1.8);
  zone.group.add(chair);
  zone.obstacles.push({ minX:-2.3, maxX:-1.7, minZ:-2.1, maxZ:-1.5 });

  // casiers (4 alignés contre le mur est)
  for (let i = 0; i < 4; i++) {
    const locker = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 2.0, 0.5),
      applyLowPoly(new THREE.MeshLambertMaterial({ color: i % 2 ? 0x3a4a52 : 0x2a3a42 }))
    );
    const lx = W/2 - 0.5;
    const lz = -3 + i * 1.0;
    locker.position.set(lx, 1.0, lz);
    zone.group.add(locker);
    zone.obstacles.push({ minX:lx-0.4, maxX:lx+0.25, minZ:lz-0.4, maxZ:lz+0.4 });
  }

  // racks serveur (côté ouest)
  for (let i = 0; i < 2; i++) {
    const rack = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 2.3, 0.7),
      applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x0a0a0e }))
    );
    const rx = -W/2 + 0.6;
    const rz = 1 + i * 1.4;
    rack.position.set(rx, 1.15, rz);
    zone.group.add(rack);
    zone.obstacles.push({ minX:rx-0.4, maxX:rx+0.4, minZ:rz-0.35, maxZ:rz+0.35 });
    // bande LEDs verts émissive
    const led = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x2acc66 })
    );
    led.position.set(rx + 0.41, 1.5, rz);
    led.rotation.y = Math.PI/2;
    zone.group.add(led);
  }

  // générateur (coin SE)
  const gen = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.1, 0.9),
    applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x44230a }))
  );
  gen.position.set(W/2 - 1.2, 0.55, D/2 - 1.2);
  zone.group.add(gen);
  zone.obstacles.push({
    minX: W/2 - 1.8, maxX: W/2 - 0.6,
    minZ: D/2 - 1.65, maxZ: D/2 - 0.75,
  });
  // petite veilleuse rouge sur le générateur
  const genLight = new THREE.Mesh(
    new THREE.PlaneGeometry(0.08, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xff2030 })
  );
  genLight.position.set(W/2 - 1.2, 1.1, D/2 - 0.74);
  zone.group.add(genLight);

  // néons plafond qui grésillent
  const neon1 = new THREE.PointLight(0xffd270, 2.2, 14, 1.3);
  neon1.position.set(-1, H - 0.3, -1);
  neon1.userData = { base: 2.2, flicker: true, phase: Math.random()*7 };
  zone.group.add(neon1);
  zone.neons.push(neon1);
  const neon2 = new THREE.PointLight(0xa8d8ff, 1.6, 12, 1.3);
  neon2.position.set(3, H - 0.3, 2);
  neon2.userData = { base: 1.6, flicker: true, phase: Math.random()*7 };
  zone.group.add(neon2);
  zone.neons.push(neon2);

  // PORTE vers Parking ($500) — mur sud, côté ouest
  addBuyStation(zone, 2, 1.8, D/2 - 0.3, Math.PI,
    'PARKING — $500', 500, () => onTransition('parking'), { kind: 'door' });

  // === Rampe + palier test (passe 1 : validation gravité dynamique) ===
  // Le joueur peut monter à droite du bureau, vers un palier surélevé près du mur nord.
  zone.group.add(makeRamp(3, 0, 4, 3, 0.7, 1.5, 1.5));
  zone.group.add(makePlatform(3, 0.7, 0.4, 2.5, 2.4));  // étendu pour chevaucher le haut de la rampe

  // spawns zombies (porte + conduits aération)
  zone.zombieSpawns = [
    new THREE.Vector3(4.5, 0, D/2 - 1),
    new THREE.Vector3(-W/2 + 1, 0, -D/2 + 1.5),
    new THREE.Vector3( W/2 - 1.5, 0, -D/2 + 1.5),
  ];

  return zone;
}

// =============================================================================
//  PARKING B1
// =============================================================================
function buildParking() {
  const W = 40, D = 40, H = 4.5;
  const zone = createZone('parking', {
    name: 'PARKING B1',
    width: W, depth: D, height: H,
    playerSpawn: new THREE.Vector3(0, EYE, 16),
    fogColor: 0x05060a,
    fogNear: 6, fogFar: 30,
    ambient: 0.18,
  });

  // sol béton avec texture PBR (floor_parking.png + optionnel normal map)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    makeToonFloorMaterial('floor_parking', W/4)
  );
  floor.rotation.x = -Math.PI/2;
  floor.receiveShadow = true;
  registerFloor(floor); zone.group.add(floor);

  // plafond + poutres
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x101015 }))
  );
  ceil.rotation.x = Math.PI/2; ceil.position.y = H;
  zone.group.add(ceil);
  const beamMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x1a1a20 }));
  for (let i = -2; i <= 2; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, 0.4), beamMat);
    beam.position.set(0, H - 0.15, i * 8);
    zone.group.add(beam);
  }

  // murs béton
  const wallTex = makeTex(g => {
    g.fillStyle = '#33333a'; g.fillRect(0,0,64,64);
    g.fillStyle = '#28282e';
    for (let y = 0; y < 64; y += 12) g.fillRect(0, y, 64, 1);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `rgba(${20+Math.random()*40},5,5,0.4)`;
      g.beginPath(); g.arc(Math.random()*64, Math.random()*64, 2+Math.random()*4, 0, 7); g.fill();
    }
  }, 6);
  const wallMat = applyLowPoly(new THREE.MeshLambertMaterial({ map: wallTex }));
  const addWall = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat);
    m.position.set(x, H/2, z);
    zone.group.add(m);
    zone.obstacles.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2 });
  };
  addWall(0, -D/2, W, 0.8);
  addWall(0,  D/2, W, 0.8);
  addWall(-W/2, 0, 0.8, D);
  addWall( W/2, 0, 0.8, D);

  // === VOITURES ABANDONNÉES (style Synty "Abandoned Car") ===

  // texture rouille procédurale — carrosserie blanche/crème délavée + taches rouille
  const rustyCarTex = (baseR, baseG, baseB) => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
    g.fillRect(0, 0, 128, 128);
    // ombrages aléatoires
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(0,0,0,${0.04 + Math.random()*0.05})`;
      g.fillRect(Math.random()*128, Math.random()*128, 25, 4);
    }
    // 20 taches de rouille (rouge-brun-orange, gradient radial)
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * 128, y = Math.random() * 128;
      const r = 3 + Math.random() * 14;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(${100 + Math.random()*40},${50 + Math.random()*25},${15 + Math.random()*15},${0.75 + Math.random()*0.25})`);
      rg.addColorStop(0.5, `rgba(${75 + Math.random()*25},${35 + Math.random()*15},${5 + Math.random()*15},0.4)`);
      rg.addColorStop(1, 'rgba(60,30,10,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    // saleté grise
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `rgba(60,55,50,${0.15 + Math.random()*0.2})`;
      g.beginPath(); g.arc(Math.random()*128, Math.random()*128, 2 + Math.random()*6, 0, 7); g.fill();
    }
    // griffures fines
    g.strokeStyle = 'rgba(40,25,15,0.55)';
    for (let i = 0; i < 6; i++) {
      g.lineWidth = 0.6 + Math.random() * 1;
      g.beginPath();
      const sx = Math.random() * 128, sy = Math.random() * 128;
      g.moveTo(sx, sy);
      g.lineTo(sx + (Math.random() - 0.5) * 40, sy + (Math.random() - 0.5) * 12);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    return tex;
  };

  // texture jante 5 branches (étoile)
  const wheelRimTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#0a0a0c'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#88888c';
    g.beginPath(); g.arc(32, 32, 22, 0, 7); g.fill();
    g.fillStyle = '#0a0a0c';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.save();
      g.translate(32, 32);
      g.rotate(a);
      g.beginPath();
      g.moveTo(-3, 2); g.lineTo(3, 2); g.lineTo(2, 20); g.lineTo(-2, 20); g.closePath();
      g.fill();
      g.restore();
    }
    g.fillStyle = '#22222a';
    g.beginPath(); g.arc(32, 32, 5, 0, 7); g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    return tex;
  })();

  // texture plaque immatriculation "MALL 88"
  const licensePlateTex = (() => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#e8e0c0'; g.fillRect(0, 0, 128, 32);
    g.strokeStyle = '#1a1a14'; g.lineWidth = 2;
    g.strokeRect(0, 0, 128, 32);
    g.fillStyle = '#000';
    g.font = 'bold 22px "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('MALL 88', 64, 18);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    return tex;
  })();

  // palettes voiture abandonnée (toutes délavées/sales)
  const abandonedPalettes = [
    [220, 215, 200],  // blanc crème sale
    [205, 205, 200],  // gris clair
    [195, 185, 170],  // beige sale
    [205, 190, 175],  // brun pâle
    [175, 185, 200],  // bleu pâle délavé
    [188, 188, 183],  // gris pâle uniforme
    [200, 200, 205],  // bleu très clair
    [210, 200, 185],  // crème
  ];
  const carData = [
    [-13, -10, 0], [10, -10, 1], [-14, 4, 1], [-3, -4, 0],
    [12, 4, 0], [-8, 12, 1], [9, 12, 0], [-2, 8, 1],
  ];

  const tireMat       = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x0a0a0c }));
  const rimFaceMat    = new THREE.MeshBasicMaterial({ map: wheelRimTex });
  const glassMat      = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x12182a }));
  const headlightMat  = new THREE.MeshBasicMaterial({ color: 0xffe8a0 });
  const taillightMat  = new THREE.MeshBasicMaterial({ color: 0xc81020 });
  const indicatorMat  = new THREE.MeshBasicMaterial({ color: 0xff9020 });
  const bumperMat     = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x18181c }));
  const grilleMat     = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x08080c }));
  const grilleBarMat  = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x44444a }));
  const plateMat      = new THREE.MeshBasicMaterial({ map: licensePlateTex });

  carData.forEach(([cx, cz, rotIdx], idx) => {
    const pal = abandonedPalettes[idx % abandonedPalettes.length];
    const ry = rotIdx ? Math.PI/2 : 0;
    const tex = rustyCarTex(pal[0], pal[1], pal[2]);
    const bodyMat = applyLowPoly(new THREE.MeshLambertMaterial({ map: tex }));
    const car = new THREE.Group();

    // --- carrosserie ---
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 4.0), bodyMat);
    chassis.position.y = 0.65; car.add(chassis);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.18, 1.0), bodyMat);
    hood.position.set(0, 0.95, 1.4); car.add(hood);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.18, 0.9), bodyMat);
    trunk.position.set(0, 0.95, -1.4); car.add(trunk);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.6, 2.0), bodyMat);
    cabin.position.set(0, 1.3, 0); car.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.8), bodyMat);
    roof.position.set(0, 1.65, 0); car.add(roof);

    // --- vitres (planes inclinées teintées sombres) ---
    const wsFront = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.5), glassMat);
    wsFront.position.set(0, 1.35, 0.95); wsFront.rotation.x = -0.42; car.add(wsFront);
    const wsRear = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.5), glassMat);
    wsRear.position.set(0, 1.35, -0.95); wsRear.rotation.x = Math.PI + 0.42; car.add(wsRear);
    for (const sx of [-0.88, 0.88]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.45), glassMat);
      win.position.set(sx, 1.4, 0);
      win.rotation.y = sx < 0 ? -Math.PI/2 : Math.PI/2;
      car.add(win);
    }

    // --- 4 roues + jantes texturées 5 branches ---
    for (const wz of [-1.35, 1.15]) {
      for (const wx of [-0.92, 0.92]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 14), tireMat);
        wheel.rotation.z = Math.PI/2;
        wheel.position.set(wx, 0.32, wz);
        car.add(wheel);
        // disque jante visible côté extérieur (PlaneGeometry texturée)
        const rim = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16), rimFaceMat);
        rim.rotation.y = wx > 0 ? Math.PI/2 : -Math.PI/2;
        rim.position.set(wx + (wx > 0 ? 0.105 : -0.105), 0.32, wz);
        car.add(rim);
      }
    }

    // --- pare-chocs avant et arrière (noirs) ---
    const bumpFront = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.22, 0.16), bumperMat);
    bumpFront.position.set(0, 0.45, 2.02); car.add(bumpFront);
    const bumpRear = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.22, 0.16), bumperMat);
    bumpRear.position.set(0, 0.45, -2.02); car.add(bumpRear);

    // --- grille avant noire avec 3 barres ---
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.22, 0.05), grilleMat);
    grille.position.set(0, 0.62, 2.04); car.add(grille);
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.025, 0.02), grilleBarMat);
      bar.position.set(0, 0.55 + i * 0.07, 2.065);
      car.add(bar);
    }

    // --- phares (cadre noir + ampoule jaune) ---
    for (const lx of [-0.62, 0.62]) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.20, 0.04), bumperMat);
      frame.position.set(lx, 0.78, 2.02); car.add(frame);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.15, 0.06), headlightMat);
      bulb.position.set(lx, 0.78, 2.045); car.add(bulb);
    }

    // --- feux arrière en 2 parties (rouge + indicator orange) ---
    for (const lx of [-0.62, 0.62]) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.04), taillightMat);
      tail.position.set(lx, 0.78, -2.02); car.add(tail);
      const ind = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.04), indicatorMat);
      ind.position.set(lx > 0 ? lx + 0.16 : lx - 0.16, 0.78, -2.02);
      car.add(ind);
    }

    // --- plaques d'immatriculation "MALL 88" ---
    const plateFront = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.14), plateMat);
    plateFront.position.set(0, 0.46, 2.09); car.add(plateFront);
    const plateRear = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.14), plateMat);
    plateRear.position.set(0, 0.46, -2.09); plateRear.rotation.y = Math.PI; car.add(plateRear);

    // --- rétroviseurs (boxes carrosserie sur portes avant) ---
    const mirrorL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.16), bodyMat);
    mirrorL.position.set(-0.99, 1.18, 0.6); car.add(mirrorL);
    const mirrorR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.16), bodyMat);
    mirrorR.position.set( 0.99, 1.18, 0.6); car.add(mirrorR);

    // --- poignées de porte ---
    for (const sx of [-0.93, 0.93]) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.22), tireMat);
      handle.position.set(sx, 1.05, 0.0);
      car.add(handle);
    }

    // --- antenne ---
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 6), tireMat);
    antenna.position.set(0.62, 1.88, -0.7); car.add(antenna);

    car.position.set(cx, 0, cz);
    car.rotation.y = ry;
    zone.group.add(car);
    const aw = ry === 0 ? 2.0 : 4.4;
    const ad = ry === 0 ? 4.4 : 2.0;
    zone.obstacles.push({ minX:cx-aw/2, maxX:cx+aw/2, minZ:cz-ad/2, maxZ:cz+ad/2 });
  });

  // piliers
  const pillarMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x2a2a30 }));
  [[-16, -16], [16, -16], [-16, 16], [16, 16], [0, 0], [-8, 8], [8, -8]].forEach(([px, pz]) => {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, H, 8), pillarMat);
    pillar.position.set(px, H/2, pz);
    zone.group.add(pillar);
    zone.obstacles.push({ minX:px-0.7, maxX:px+0.7, minZ:pz-0.7, maxZ:pz+0.7 });
  });

  // bornes de paiement
  [[-10, -2], [10, 2], [-2, 11]].forEach(([px, pz]) => {
    const term = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 1.4, 0.3),
      applyLowPoly(new THREE.MeshLambertMaterial({ color: 0xddaa20 }))
    );
    term.position.set(px, 0.7, pz);
    zone.group.add(term);
    zone.obstacles.push({ minX:px-0.2, maxX:px+0.2, minZ:pz-0.15, maxZ:pz+0.15 });
  });

  // néons défectueux au plafond
  const neonPositions = [
    [-12, -12, 0xffd070],
    [ 12, -12, 0x70c8ff],
    [-12,  12, 0xffd070],
    [ 12,  12, 0x70c8ff],
    [  0,   0, 0xffe8a0],
    [-14,   0, 0x90b8ff],
    [ 14,   0, 0xffd070],
  ];
  neonPositions.forEach(([px, pz, col]) => {
    const intensity = 1.6 + Math.random() * 1.0;
    const l = new THREE.PointLight(col, intensity, 22, 1.5);
    l.position.set(px, H - 0.4, pz);
    l.userData = { base: intensity, flicker: Math.random() < 0.75, phase: Math.random()*7 };
    zone.group.add(l);
    zone.neons.push(l);
  });

  // PORTES
  addBuyStation(zone, 0, 1.8, D/2 - 0.3, Math.PI,
    'SECURITY OFFICE', 0, () => onTransition('sec_office'), { kind: 'door' });
  addBuyStation(zone, 0, 1.8, -D/2 + 0.3, 0,
    'MAIN ENTRANCE — $1000', 1000, () => onTransition('hall'), { kind: 'door' });

  // spawns zombies (4 coins)
  zone.zombieSpawns = [
    new THREE.Vector3(-W/2 + 2, 0, -D/2 + 2),
    new THREE.Vector3( W/2 - 2, 0, -D/2 + 2),
    new THREE.Vector3(-W/2 + 2,  0, D/2 - 2),
    new THREE.Vector3( W/2 - 2,  0, D/2 - 2),
  ];

  return zone;
}

// =============================================================================
//  MAIN ENTRANCE (RDC) — le hall actuel, encapsulé
// =============================================================================
function buildHall() {
  const W = ARENA * 2, D = ARENA * 2, H = WALL_H;
  const zone = createZone('hall', {
    name: 'MAIN ENTRANCE',
    width: W, depth: D, height: H,
    playerSpawn: new THREE.Vector3(-ARENA + 5, EYE, -10),
    fogColor: FOG_COLOR,
    fogNear: FOG_NEAR, fogFar: FOG_FAR,
    ambient: 0.28,
  });

  // textures sol + murs
  const floorTex = makeTex(g => {
    for (let y=0;y<2;y++) for (let x=0;x<2;x++) {
      g.fillStyle = (x+y)%2 ? '#1a1a22' : '#23232e';
      g.fillRect(x*32, y*32, 32, 32);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0,0,64,2); g.fillRect(0,0,2,64);
    for (let i=0;i<6;i++) {
      g.fillStyle = `rgba(${60+Math.random()*40},${10+Math.random()*15},${5+Math.random()*10},0.18)`;
      g.beginPath(); g.arc(Math.random()*64, Math.random()*64, 1+Math.random()*3, 0, 7); g.fill();
    }
  }, ARENA);
  const wallTex = makeTex(g => {
    g.fillStyle = '#2b2b34'; g.fillRect(0,0,64,64);
    g.fillStyle = '#222229';
    for (let y=0; y<64; y+=16)
      for (let x=0; x<64; x+=32)
        g.fillRect(x + ((y/16)%2 ? 16 : 0), y, 30, 14);
    for (let i=0; i<4; i++) {
      g.fillStyle = `rgba(15,0,0,${0.3 + Math.random()*0.3})`;
      g.beginPath(); g.arc(Math.random()*64, Math.random()*64, 2+Math.random()*5, 0, 7); g.fill();
    }
  }, 6);

  // sol mall avec texture PBR (floor_mall.png + optionnel normal map)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    makeToonFloorMaterial('floor_mall', ARENA)
  );
  floor.rotation.x = -Math.PI/2;
  floor.receiveShadow = true;
  registerFloor(floor); zone.group.add(floor);
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x101016 }))
  );
  ceil.rotation.x = Math.PI/2; ceil.position.y = H; zone.group.add(ceil);
  const wallMat = applyLowPoly(new THREE.MeshLambertMaterial({ map: wallTex }));
  const addWallH = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat);
    m.position.set(x, H/2, z); zone.group.add(m);
    zone.obstacles.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2 });
  };
  addWallH(0, -ARENA, W, 1);
  addWallH(0,  ARENA, W, 1);
  addWallH(-ARENA, 0, 1, D);
  addWallH( ARENA, 0, 1, D);

  // helper addBox local au hall
  const addBox = (x, z, w, d, h, color, y=null) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      applyLowPoly(new THREE.MeshLambertMaterial({ color }))
    );
    m.position.set(x, y===null ? h/2 : y, z);
    zone.group.add(m);
    zone.obstacles.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2 });
  };

  // === FONTAINE CENTRALE (circulaire, multi-niveau + statue) ===
  (function fountain() {
    const stoneMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x4a5260 }));
    const stoneDark = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x2d3a4a }));
    const waterMat = new THREE.MeshLambertMaterial({
      color: 0x2a6080, transparent: true, opacity: 0.85, flatShading: true
    });
    const goldMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x9a7a30 }));
    // bassin externe (cylindre creux : disque + bord)
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.5, 0.6, 16),
      stoneMat
    );
    bowl.position.y = 0.3;
    zone.group.add(bowl);
    // rebord supérieur (anneau plus large)
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(2.55, 2.5, 0.18, 16),
      stoneDark
    );
    rim.position.y = 0.62;
    zone.group.add(rim);
    // eau dans le bassin externe
    const water1 = new THREE.Mesh(
      new THREE.CylinderGeometry(2.35, 2.35, 0.1, 16),
      waterMat
    );
    water1.position.y = 0.62;
    zone.group.add(water1);
    // niveau intermédiaire (colonne basse)
    const col1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.7, 0.35, 12),
      stoneMat
    );
    col1.position.y = 0.85;
    zone.group.add(col1);
    // vasque intermédiaire
    const bowl2 = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.0, 0.25, 16),
      stoneMat
    );
    bowl2.position.y = 1.15;
    zone.group.add(bowl2);
    const water2 = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.05, 0.08, 16),
      waterMat
    );
    water2.position.y = 1.28;
    zone.group.add(water2);
    // colonne haute
    const col2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.45, 0.5, 12),
      stoneMat
    );
    col2.position.y = 1.55;
    zone.group.add(col2);
    // vasque sommet
    const bowl3 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.5, 0.18, 16),
      stoneMat
    );
    bowl3.position.y = 1.9;
    zone.group.add(bowl3);
    const water3 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.06, 16),
      waterMat
    );
    water3.position.y = 1.99;
    zone.group.add(water3);
    // statue dorée au sommet (icosaèdre stylisé)
    const statue = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.28, 0),
      goldMat
    );
    statue.position.y = 2.35;
    zone.group.add(statue);
    // jet d'eau central (cylindre fin bleu transparent vers le haut)
    const jet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.07, 0.6, 6),
      waterMat
    );
    jet.position.y = 2.7;
    zone.group.add(jet);
    // obstacle : cercle approximé en AABB 5×5
    zone.obstacles.push({ minX:-2.6, maxX:2.6, minZ:-2.6, maxZ:2.6 });
  })();
  [[-18,-8],[-18,8],[18,-8],[18,8]].forEach(([x,z]) => addBox(x, z, 6, 3, 3, 0x33333d));
  [[-8,-18],[8,-18],[-8,18],[8,18]].forEach(([x,z]) => addBox(x, z, 3, 6, 3, 0x2f2f38));
  [[10,2],[-10,-3],[4,-12],[-5,12],[13,12],[-13,-12]].forEach(([x,z]) =>
    addBox(x, z, 1.6, 1.6, 1.4, 0x4a3b2a)
  );

  // piliers
  [[-22,-22],[22,-22],[-22,22],[22,22],[0,-22],[0,22],[-22,0],[22,0]].forEach(([x,z]) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, H, 8), wallMat);
    p.position.set(x, H/2, z); zone.group.add(p);
    zone.obstacles.push({ minX:x-0.7, maxX:x+0.7, minZ:z-0.7, maxZ:z+0.7 });
  });

  // enseignes
  function sign(x, y, z, text, color, lookAtCenter=true) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#0a0a10'; g.fillRect(0,0,256,64);
    g.fillStyle = color;
    g.font = 'bold 38px "Courier New", monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 36);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), mat);
    mesh.position.set(x, y, z);
    if (lookAtCenter) mesh.lookAt(0, y, 0);
    zone.group.add(mesh);
    return mesh;
  }
  sign(-18, 4.3, -7.6, 'FOOD COURT', '#ffd166');
  sign( 18, 4.3, -7.6, 'ARCADE',     '#9b5cff');
  sign(-18, 4.3,  7.6, 'CINEMA',     '#36d3ff');
  sign( 18, 4.3,  7.6, 'PHARMACY',   '#ff9b3a');
  const sExit = sign(0, 4.6, -ARENA + 0.6, 'EXIT', '#ff2030', false);
  sExit.scale.set(0.65, 0.65, 1); sExit.rotation.y = Math.PI;

  // distributeurs
  function vendingMachine(x, z, ry) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 2.2, 0.8),
      applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x222a36 }))
    );
    body.position.set(x, 1.1, z); body.rotation.y = ry; zone.group.add(body);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.8),
      new THREE.MeshBasicMaterial({ color: 0x44d8ff })
    );
    const dz = Math.cos(ry)*0.42, dx = Math.sin(ry)*0.42;
    screen.position.set(x + dx, 1.5, z + dz);
    screen.rotation.y = ry; zone.group.add(screen);
    zone.obstacles.push({ minX:x-0.8, maxX:x+0.8, minZ:z-0.5, maxZ:z+0.5 });
  }
  vendingMachine(-ARENA + 1.0,  0, Math.PI/2);
  vendingMachine( ARENA - 1.0, -3, -Math.PI/2);
  vendingMachine( ARENA - 1.0, -14, -Math.PI/2);

  // bancs
  function bench(x, z, ry) {
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.15, 0.6),
      applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x4a3a26 }))
    );
    seat.position.set(x, 0.42, z); seat.rotation.y = ry; zone.group.add(seat);
    const legGeo = new THREE.BoxGeometry(0.12, 0.42, 0.5);
    const legMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x1a1a20 }));
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(x + Math.cos(ry)*sx*1.0, 0.21, z - Math.sin(ry)*sx*1.0);
      leg.rotation.y = ry; zone.group.add(leg);
    }
    zone.obstacles.push({ minX:x-1.3, maxX:x+1.3, minZ:z-0.3, maxZ:z+0.3 });
  }
  bench(-6,  6, 0); bench( 6, -6, 0); bench( 0, -10, Math.PI/2);

  // plantes
  function plant(x, z) {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.5, 0.55, 8),
      applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x382418 }))
    );
    pot.position.set(x, 0.27, z); zone.group.add(pot);
    const foliage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.6, 0),
      applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x1f4a26 }))
    );
    foliage.position.set(x, 1.05, z); zone.group.add(foliage);
    zone.obstacles.push({ minX:x-0.4, maxX:x+0.4, minZ:z-0.4, maxZ:z+0.4 });
  }
  plant(-4, 6); plant(4, 6); plant(-4, -6); plant(4, -6);
  plant(11, 16); plant(-11, -16);

  // poubelles
  function trashCan(x, z) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.95, 8),
      applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x1a1a20 }))
    );
    m.position.set(x, 0.475, z); zone.group.add(m);
    zone.obstacles.push({ minX:x-0.35, maxX:x+0.35, minZ:z-0.35, maxZ:z+0.35 });
  }
  trashCan(7, 9); trashCan(-7, -9); trashCan(15, -5); trashCan(-15, 5);

  // bannière MEGA SALE
  (function megaSaleBanner() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#a01018'; g.fillRect(0, 0, 256, 512);
    g.fillStyle = '#fff';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 64px "Arial Black", sans-serif';
    g.fillText('MEGA', 128, 110);
    g.fillText('SALE', 128, 200);
    g.font = '24px "Arial", sans-serif';
    g.fillText('UP TO', 128, 280);
    g.font = 'bold 80px "Arial Black", sans-serif';
    g.fillText('50%', 128, 360);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, 0, 256, 20); g.fillRect(0, 492, 256, 20);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.4), mat);
    mesh.position.set(0, 4.8, -4);
    zone.group.add(mesh);
  })();

  // débris
  function debris(x, z, color) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.35 + Math.random()*0.5, 0.18 + Math.random()*0.25, 0.35 + Math.random()*0.5),
      applyLowPoly(new THREE.MeshLambertMaterial({ color }))
    );
    m.position.set(x, 0.12, z);
    m.rotation.y = Math.random() * Math.PI * 2;
    zone.group.add(m);
  }
  [
    [3.5, 8.5, 0x404048], [-4.2, 9.1, 0x55504a], [11.3, -2.8, 0x3a3a40],
    [-9.5, -4, 0x4a4030], [-2.3, 13.6, 0x444], [13.8, 5.9, 0x4a3b2a],
    [-14.1, 1.2, 0x55504a], [5.4, -11.2, 0x383838], [9.2, 14.1, 0x3d3d44],
    [-11.8, 11.4, 0x4a4030], [6.7, -14.6, 0x40404a], [-7.3, -13.1, 0x4a3b2a],
  ].forEach(([x, z, c]) => debris(x, z, c));

  // sang initial
  function bloodSplat(x, z, scale = 1) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    for (let i = 0; i < 16; i++) {
      g.fillStyle = `rgba(${100 + Math.random()*40},0,${Math.random()*15},${0.5 + Math.random()*0.45})`;
      const cx = Math.random()*64, cy = Math.random()*64, r = 3 + Math.random()*14;
      g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4 * scale, 2.4 * scale), mat);
    mesh.rotation.x = -Math.PI/2;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.position.set(x, 0.02, z);
    zone.group.add(mesh);
  }
  [
    [3, 5, 1.4], [-5, 8, 1.1], [10, -3, 1.3], [-8, -6, 1.0],
    [0, 10, 1.6], [-12, 2, 1.0], [7, 9, 0.9], [-2, -10, 1.4],
    [12, 6, 1.0], [-14, -2, 1.2], [4, -8, 0.8], [-6, 15, 1.1],
    [14, -10, 0.9], [-11, -14, 1.3], [2, -3, 1.0],
  ].forEach(([x, z, s]) => bloodSplat(x, z, s));

  // néons + spots cinéma
  const addNeon = (x, z, color, intensity) => {
    const l = new THREE.PointLight(color, intensity, 38, 1.4);
    l.position.set(x, H - 1.2, z);
    l.userData = { base: intensity, flicker: Math.random() < 0.5, phase: Math.random()*7 };
    zone.group.add(l);
    zone.neons.push(l);
  };
  addNeon(-16, -16, 0xff2030, 2.8);
  addNeon( 16, -16, 0x36d3ff, 2.4);
  addNeon(-16,  16, 0xffd166, 2.6);
  addNeon( 16,  16, 0x9b5cff, 2.4);
  addNeon(  0,   0, 0xfff0c0, 2.8);
  const addSpot = (x, z, color, intensity) => {
    const s = new THREE.SpotLight(color, intensity, 24, Math.PI/5, 0.55, 1.2);
    s.position.set(x, H - 0.4, z);
    const t = new THREE.Object3D(); t.position.set(x, 0, z);
    zone.group.add(s); zone.group.add(t); s.target = t;
  };
  addSpot(0,    0,   0xffe8c0, 2.5);
  addSpot(-16,  16,  0xffc874, 2.2);
  addSpot( 16,  16,  0xa874ff, 2.0);
  addSpot(-16, -16,  0xff5a4a, 2.0);
  addSpot( 16, -16,  0x60c8ff, 2.0);

  // PORTES + BORNES
  // Retour vers Parking ($0)
  addBuyStation(zone, -ARENA + 0.7, 1.8, -12, Math.PI/2,
    'PARKING', 0, () => onTransition('parking'), { kind: 'door' });
  // Achats existants recalibrés
  addBuyStation(zone, -ARENA + 0.7, 1.8, -8, Math.PI/2,
    'PUMP SHOTGUN — $500', 500, () => actions.giveWeapon('shotgun'), { kind: 'buy' });
  addBuyStation(zone, ARENA - 0.7, 1.8, 8, -Math.PI/2,
    'AMMO — $250', 250, () => actions.refillAmmo(), { kind: 'buy' });

  // PORTES vers les 3 boutiques (passe B)
  addBuyStation(zone, 18, 1.8, -10.4, Math.PI/2,    // sous l'enseigne ARCADE → on garde le label boutique
    'ELECTRONICS — $1250', 1250, () => onTransition('electronics'), { kind: 'door' });
  addBuyStation(zone, 18, 1.8,  10.4, -Math.PI/2,
    'PHARMACY — $1250', 1250, () => onTransition('pharmacy'), { kind: 'door' });
  addBuyStation(zone, -18, 1.8, -10.4, Math.PI/2,
    'SPORTS — $1250', 1250, () => onTransition('sports'), { kind: 'door' });

  // spawns zombies (4 directions périphériques)
  zone.zombieSpawns = [
    new THREE.Vector3(-26, 0, 0),
    new THREE.Vector3( 26, 0, 0),
    new THREE.Vector3(0, 0, -26),
    new THREE.Vector3(0, 0,  26),
  ];

  return zone;
}

// =============================================================================
//  ELECTRONICS (boutique RDC)
// =============================================================================
function buildElectronics() {
  const W = 14, D = 11, H = 4.0;
  const zone = createZone('electronics', {
    name: 'ELECTRONICS',
    width: W, depth: D, height: H,
    playerSpawn: new THREE.Vector3(0, EYE, D/2 - 2),
    fogColor: 0x05080e,
    fogNear: 5, fogFar: 18,
    ambient: 0.28,
  });
  // sol carrelage
  const floorTex = makeTex(g => {
    g.fillStyle = '#262630'; g.fillRect(0,0,64,64);
    g.fillStyle = '#1e1e28';
    for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) {
      if (((y/16)+(x/16))%2) g.fillRect(x, y, 16, 16);
    }
  }, W/4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
    applyLowPoly(new THREE.MeshLambertMaterial({ map: floorTex })));
  floor.rotation.x = -Math.PI/2; registerFloor(floor); zone.group.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
    applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x0c0c12 })));
  ceil.rotation.x = Math.PI/2; ceil.position.y = H; zone.group.add(ceil);
  // murs
  const wallTex = makeTex(g => {
    g.fillStyle = '#2a2a32'; g.fillRect(0,0,64,64);
    g.fillStyle = '#202028';
    for (let y = 0; y < 64; y += 18) g.fillRect(0, y, 64, 1);
  }, 4);
  const wallMat = applyLowPoly(new THREE.MeshLambertMaterial({ map: wallTex }));
  const addWall = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat);
    m.position.set(x, H/2, z); zone.group.add(m);
    zone.obstacles.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2 });
  };
  addWall(0, -D/2, W, 0.4); addWall(0, D/2, W, 0.4);
  addWall(-W/2, 0, 0.4, D); addWall(W/2, 0, 0.4, D);
  // étagères + TVs (boxes verticales avec écrans bleus émissifs)
  const shelfMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x33333a }));
  for (let i = 0; i < 4; i++) {
    const sx = -W/2 + 2.8 + i * 2.6;
    for (const sz of [-2.5, 2.5]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.0, 0.6), shelfMat);
      shelf.position.set(sx, 1.0, sz);
      zone.group.add(shelf);
      zone.obstacles.push({ minX:sx-1.05, maxX:sx+1.05, minZ:sz-0.3, maxZ:sz+0.3 });
      for (let t = 0; t < 3; t++) {
        const tv = new THREE.Mesh(
          new THREE.PlaneGeometry(0.55, 0.4),
          new THREE.MeshBasicMaterial({ color: 0x36c3ff })
        );
        const sign = sz > 0 ? -1 : 1;
        tv.position.set(sx - 0.7 + t*0.7, 1.3, sz + sign*0.31);
        if (sz > 0) tv.rotation.y = Math.PI;
        zone.group.add(tv);
      }
    }
  }
  // néons bleus
  const neon = new THREE.PointLight(0x80c8ff, 2.8, 22, 1.3);
  neon.position.set(0, H - 0.3, 0);
  neon.userData = { base: 2.8, flicker: false, phase: 0 };
  zone.group.add(neon); zone.neons.push(neon);
  const neon2 = new THREE.PointLight(0x36c3ff, 1.8, 16, 1.4);
  neon2.position.set(-4, H - 0.5, 0);
  neon2.userData = { base: 1.8, flicker: Math.random()<0.3, phase: Math.random()*7 };
  zone.group.add(neon2); zone.neons.push(neon2);
  // portes + achats
  addBuyStation(zone, 0, 1.8, D/2 - 0.3, Math.PI,
    'MAIN ENTRANCE', 0, () => onTransition('hall'), { kind: 'door' });
  addBuyStation(zone, -W/2 + 0.3, 1.8, 0, Math.PI/2,
    'SMG — $1000', 1000, () => actions.giveWeapon('smg'), { kind: 'buy' });
  addBuyStation(zone, W/2 - 0.3, 1.8, -2, -Math.PI/2,
    'LIGHT UPGRADE — $800', 800, () => actions.lightUp(), { kind: 'buy' });
  addBuyStation(zone, W/2 - 0.3, 1.8, 2, -Math.PI/2,
    'NIGHT VISION — $1500', 1500, () => actions.nightVision(), { kind: 'buy' });
  zone.zombieSpawns = [
    new THREE.Vector3(0, 0, D/2 - 1),
    new THREE.Vector3(-W/2 + 1.5, 0, -D/2 + 1),
    new THREE.Vector3(W/2 - 1.5, 0, -D/2 + 1),
  ];
  return zone;
}

// =============================================================================
//  PHARMACY (boutique RDC, étroite et dangereuse)
// =============================================================================
function buildPharmacy() {
  const W = 11, D = 10, H = 3.8;
  const zone = createZone('pharmacy', {
    name: 'PHARMACY',
    width: W, depth: D, height: H,
    playerSpawn: new THREE.Vector3(0, EYE, D/2 - 1.5),
    fogColor: 0x070a08,
    fogNear: 4, fogFar: 16,
    ambient: 0.32,
  });
  // sol blanc clinique
  const floorTex = makeTex(g => {
    g.fillStyle = '#cccfc8'; g.fillRect(0,0,64,64);
    g.fillStyle = '#b8bcb4';
    for (let y = 0; y < 64; y += 32) for (let x = 0; x < 64; x += 32) {
      if (((y/32)+(x/32))%2) g.fillRect(x, y, 32, 32);
    }
    // taches sang
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `rgba(${100+Math.random()*30},5,5,${0.3+Math.random()*0.3})`;
      g.beginPath(); g.arc(Math.random()*64, Math.random()*64, 2+Math.random()*4, 0, 7); g.fill();
    }
  }, W/4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
    applyLowPoly(new THREE.MeshLambertMaterial({ map: floorTex })));
  floor.rotation.x = -Math.PI/2; registerFloor(floor); zone.group.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
    applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x202030 })));
  ceil.rotation.x = Math.PI/2; ceil.position.y = H; zone.group.add(ceil);
  // murs blancs
  const wallTex = makeTex(g => {
    g.fillStyle = '#d4d8d0'; g.fillRect(0,0,64,64);
    g.fillStyle = '#b8bcb4';
    for (let y = 0; y < 64; y += 22) g.fillRect(0, y, 64, 1);
    // taches sang
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `rgba(${80+Math.random()*40},5,5,${0.3+Math.random()*0.3})`;
      g.beginPath(); g.arc(Math.random()*64, Math.random()*64, 2+Math.random()*4, 0, 7); g.fill();
    }
  }, 4);
  const wallMat = applyLowPoly(new THREE.MeshLambertMaterial({ map: wallTex }));
  const addWall = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat);
    m.position.set(x, H/2, z); zone.group.add(m);
    zone.obstacles.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2 });
  };
  addWall(0, -D/2, W, 0.4); addWall(0, D/2, W, 0.4);
  addWall(-W/2, 0, 0.4, D); addWall(W/2, 0, 0.4, D);
  // rayons médicaux (étagères blanches)
  const shelfMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0xe6e6e0 }));
  for (let i = 0; i < 3; i++) {
    const sx = -W/2 + 2.5 + i * 3.0;
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.0, 5.0), shelfMat);
    shelf.position.set(sx, 1.0, 0);
    zone.group.add(shelf);
    zone.obstacles.push({ minX:sx-0.25, maxX:sx+0.25, minZ:-2.5, maxZ:2.5 });
    // petites boîtes médicales colorées
    for (let b = 0; b < 5; b++) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3),
        applyLowPoly(new THREE.MeshLambertMaterial({
          color: [0xff5050, 0x4a8aff, 0x50ff80, 0xffdd50, 0xffffff][b]
        }))
      );
      box.position.set(sx, 0.75, -2 + b*1.0);
      zone.group.add(box);
    }
  }
  // comptoir au fond
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(4, 1.0, 0.8),
    applyLowPoly(new THREE.MeshLambertMaterial({ color: 0xc0c0b8 }))
  );
  counter.position.set(0, 0.5, -D/2 + 1);
  zone.group.add(counter);
  zone.obstacles.push({ minX:-2, maxX:2, minZ:-D/2+0.6, maxZ:-D/2+1.4 });
  // lumière verte/blanche clinique
  const neon = new THREE.PointLight(0xe8fff0, 3.0, 18, 1.3);
  neon.position.set(0, H - 0.3, 0);
  neon.userData = { base: 3.0, flicker: false, phase: 0 };
  zone.group.add(neon); zone.neons.push(neon);
  const neon2 = new THREE.PointLight(0xa0ffc0, 1.6, 12, 1.4);
  neon2.position.set(0, H - 0.5, -D/2 + 2);
  neon2.userData = { base: 1.6, flicker: Math.random()<0.3, phase: Math.random()*7 };
  zone.group.add(neon2); zone.neons.push(neon2);
  // portes + achats
  addBuyStation(zone, 0, 1.8, D/2 - 0.3, Math.PI,
    'MAIN ENTRANCE', 0, () => onTransition('hall'), { kind: 'door' });
  addBuyStation(zone, -W/2 + 0.3, 1.8, -3, Math.PI/2,
    'MEDKIT — $500', 500, () => actions.medkit(), { kind: 'buy' });
  addBuyStation(zone, W/2 - 0.3, 1.8, -3, -Math.PI/2,
    'ARMOR — $1500', 1500, () => actions.armor(), { kind: 'buy' });
  addBuyStation(zone, -W/2 + 0.3, 1.8, 3, Math.PI/2,
    'REGEN PERK — $2000', 2000, () => actions.regen(), { kind: 'buy' });
  zone.zombieSpawns = [
    new THREE.Vector3(0, 0, D/2 - 1),
    new THREE.Vector3(-W/2 + 1.5, 0, -D/2 + 1.5),
    new THREE.Vector3(W/2 - 1.5, 0, -D/2 + 1.5),
  ];
  return zone;
}

// =============================================================================
//  SPORTS STORE (boutique RDC, mannequins + matériel)
// =============================================================================
function buildSports() {
  const W = 14, D = 12, H = 4.0;
  const zone = createZone('sports', {
    name: 'SPORTS',
    width: W, depth: D, height: H,
    playerSpawn: new THREE.Vector3(0, EYE, D/2 - 1.5),
    fogColor: 0x0a0a08,
    fogNear: 5, fogFar: 18,
    ambient: 0.28,
  });
  // sol parquet bois
  const floorTex = makeTex(g => {
    g.fillStyle = '#6a4a26'; g.fillRect(0,0,64,64);
    g.fillStyle = '#5a3e22';
    for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 1);
    g.fillStyle = '#7a5a36';
    for (let i = 0; i < 8; i++) g.fillRect(Math.random()*64, Math.random()*64, 4, 1);
  }, W/3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
    applyLowPoly(new THREE.MeshLambertMaterial({ map: floorTex })));
  floor.rotation.x = -Math.PI/2; registerFloor(floor); zone.group.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
    applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x1a1410 })));
  ceil.rotation.x = Math.PI/2; ceil.position.y = H; zone.group.add(ceil);
  // murs
  const wallTex = makeTex(g => {
    g.fillStyle = '#4a3422'; g.fillRect(0,0,64,64);
    g.fillStyle = '#3a2818';
    for (let y = 0; y < 64; y += 18) g.fillRect(0, y, 64, 1);
  }, 4);
  const wallMat = applyLowPoly(new THREE.MeshLambertMaterial({ map: wallTex }));
  const addWall = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat);
    m.position.set(x, H/2, z); zone.group.add(m);
    zone.obstacles.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2 });
  };
  addWall(0, -D/2, W, 0.4); addWall(0, D/2, W, 0.4);
  addWall(-W/2, 0, 0.4, D); addWall(W/2, 0, 0.4, D);
  // mannequins (humanoïdes propres : tête sphère + cou + torse + bras + hanche + jambes + socle)
  const skinMnk = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0xe6c8a0 }));
  const pantsMnk = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x1a1a20 }));
  const baseMnk = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x16161c }));
  function mannequin(x, z, color) {
    const shirtMat = applyLowPoly(new THREE.MeshLambertMaterial({ color }));
    const grp = new THREE.Group();
    // socle disque
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.42, 0.08, 16), baseMnk
    );
    base.position.y = 0.04; grp.add(base);
    // tige support (cylindre fin du socle aux pieds)
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), baseMnk
    );
    stem.position.y = 0.23; grp.add(stem);
    // jambes
    for (const sx of [-1, 1]) {
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, 0.18), pantsMnk);
      thigh.position.set(sx * 0.1, 0.7, 0); grp.add(thigh);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.16), pantsMnk);
      shin.position.set(sx * 0.1, 0.3, 0.02); grp.add(shin);
    }
    // hanche
    const hip = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.22), pantsMnk);
    hip.position.y = 0.98; grp.add(hip);
    // torse (t-shirt coloré)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.6, 0.28), shirtMat);
    torso.position.y = 1.4; grp.add(torso);
    // épaules
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.12, 0.3), shirtMat);
    shoulders.position.y = 1.73; grp.add(shoulders);
    // bras (segments)
    for (const sx of [-1, 1]) {
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.14), shirtMat);
      upper.position.set(sx * 0.36, 1.5, 0); grp.add(upper);
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.12), skinMnk);
      fore.position.set(sx * 0.36, 1.12, 0); grp.add(fore);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.1), skinMnk);
      hand.position.set(sx * 0.36, 0.9, 0); grp.add(hand);
    }
    // cou
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 6), skinMnk);
    neck.position.y = 1.84; grp.add(neck);
    // tête sphère ovale
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skinMnk);
    head.position.y = 2.0; head.scale.set(1, 1.1, 0.95); grp.add(head);
    grp.position.set(x, 0, z);
    zone.group.add(grp);
    zone.obstacles.push({ minX:x-0.4, maxX:x+0.4, minZ:z-0.4, maxZ:z+0.4 });
  }
  mannequin(-4, -3, 0xff5040);
  mannequin( 4, -3, 0x4080ff);
  mannequin(-4,  3, 0x60c060);
  mannequin( 4,  3, 0xffd040);
  // présentoirs / vélos (boxes longues basses)
  const dispMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x2a2018 }));
  for (let i = 0; i < 2; i++) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.6, 0.6), dispMat);
    d.position.set((i===0 ? -3 : 3), 0.3, 0);
    zone.group.add(d);
    zone.obstacles.push({ minX:(i===0?-4.75:1.25), maxX:(i===0?-1.25:4.75), minZ:-0.3, maxZ:0.3 });
  }
  // lumière chaude
  const neon = new THREE.PointLight(0xffcc70, 2.6, 20, 1.4);
  neon.position.set(0, H - 0.3, 0);
  neon.userData = { base: 2.6, flicker: false, phase: 0 };
  zone.group.add(neon); zone.neons.push(neon);
  const neon2 = new THREE.PointLight(0xff9040, 1.8, 14, 1.4);
  neon2.position.set(-4, H - 0.5, -3);
  neon2.userData = { base: 1.8, flicker: Math.random()<0.3, phase: Math.random()*7 };
  zone.group.add(neon2); zone.neons.push(neon2);
  // portes + achats
  addBuyStation(zone, 0, 1.8, D/2 - 0.3, Math.PI,
    'MAIN ENTRANCE', 0, () => onTransition('hall'), { kind: 'door' });
  addBuyStation(zone, -W/2 + 0.3, 1.8, -3, Math.PI/2,
    'BAT — $300', 300, () => actions.giveWeapon('bat'), { kind: 'buy' });
  addBuyStation(zone, -W/2 + 0.3, 1.8, 3, Math.PI/2,
    'AXE — $600', 600, () => actions.giveWeapon('axe'), { kind: 'buy' });
  addBuyStation(zone, W/2 - 0.3, 1.8, 0, -Math.PI/2,
    'HEAVY ARMOR — $1800', 1800, () => actions.armor(), { kind: 'buy' });
  zone.zombieSpawns = [
    new THREE.Vector3(0, 0, D/2 - 1),
    new THREE.Vector3(-W/2 + 1.5, 0, -D/2 + 1.5),
    new THREE.Vector3(W/2 - 1.5, 0, -D/2 + 1.5),
  ];
  return zone;
}

// =============================================================================
//  CONSTRUCTION
// =============================================================================
buildSecurityOffice();
buildParking();
buildHall();
buildElectronics();
buildPharmacy();
buildSports();

// zone active initiale (Sec Office)
switchToZone('sec_office');

// =============================================================================
//  UPDATE (néons + blackout + pulsation bornes de la zone active)
// =============================================================================
export function updateWorld(dt) {
  const t = performance.now() * 0.001;
  const zone = getCurrentZone();
  if (!zone) return;
  for (const l of zone.neons) {
    let base = l.userData.base;
    if (game.blackout > 0) base *= 0.15 * (Math.random() < 0.55 ? 1 : 0);
    l.intensity = l.userData.flicker
      ? base * (0.65 + Math.sin(t*7 + l.userData.phase)*0.2 + Math.random()*0.2)
      : base;
  }
  if (game.blackout > 0) {
    ambient.intensity = player.perks.nightVision ? NIGHTVISION_AMBIENT : 0.08;
  } else {
    ambient.intensity = zone.ambientIntensity;
  }
  if (game.blackout > 0) {
    game.blackout -= dt;
    if (game.blackout <= 0) endBlackout();
  }
  const pulse = 0.12 + Math.abs(Math.sin(t*3))*0.18;
  for (const s of buyStations) {
    if (s.zone === zone.id) s.glow.material.opacity = pulse;
  }
}

export function triggerBlackout(duration = 14) {
  const zone = getCurrentZone();
  game.blackout = duration;
  scene.fog.far = zone ? Math.min(zone.fogFar, FOG_FAR_BLACKOUT) : FOG_FAR_BLACKOUT;
}
export function endBlackout() {
  game.blackout = 0;
  const zone = getCurrentZone();
  scene.fog.far = zone ? zone.fogFar : FOG_FAR;
}
