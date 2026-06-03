import * as THREE from 'three';
import { scene, applyPS1Shader } from './renderer.js';
import { ARENA, WALL_H, FOG_FAR, FOG_FAR_BLACKOUT, EYE } from './config.js';
import { game } from './state.js';

// =============================================================================
//  COLLISIONS (AABB)
// =============================================================================
const obstacles = [];

function clamp(v, a, b) { return v<a ? a : v>b ? b : v; }

export function resolveCollision(pos, r) {
  pos.x = clamp(pos.x, -ARENA + r + 0.6, ARENA - r - 0.6);
  pos.z = clamp(pos.z, -ARENA + r + 0.6, ARENA - r - 0.6);
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

function addObstacle(x, z, w, d) {
  obstacles.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2 });
}

// =============================================================================
//  TEXTURES PROCÉDURALES
// =============================================================================
function makeTex(draw, rep=1) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); draw(g);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  return t;
}

const floorTex = makeTex(g => {
  for (let y=0;y<2;y++) for (let x=0;x<2;x++) {
    g.fillStyle = (x+y)%2 ? '#1a1a22' : '#23232e';
    g.fillRect(x*32, y*32, 32, 32);
  }
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0,0,64,2); g.fillRect(0,0,2,64);
  // saletés rouille / sang séché
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
  // éclaboussures sombres
  for (let i=0; i<4; i++) {
    g.fillStyle = `rgba(15,0,0,${0.3 + Math.random()*0.3})`;
    g.beginPath(); g.arc(Math.random()*64, Math.random()*64, 2+Math.random()*5, 0, 7); g.fill();
  }
}, 6);

// =============================================================================
//  LUMIÈRES (ambient + directional + néons colorés clignotants)
// =============================================================================
const ambient = new THREE.AmbientLight(0x6a6a85, 0.85);
scene.add(ambient);

const moon = new THREE.DirectionalLight(0x8088aa, 0.35);
moon.position.set(10, 20, 6);
scene.add(moon);

const neons = [];
function addNeon(x, z, color, intensity=1.1) {
  const l = new THREE.PointLight(color, intensity, 26, 1.6);
  l.position.set(x, WALL_H - 1.2, z);
  l.userData = { base: intensity, flicker: Math.random() < 0.5, phase: Math.random()*7 };
  scene.add(l);
  neons.push(l);
}
addNeon(-16, -16, 0xff2030, 1.2);
addNeon( 16, -16, 0x36d3ff, 1.0);
addNeon(-16,  16, 0xffd166, 1.0);
addNeon( 16,  16, 0x9b5cff, 1.0);
addNeon(  0,   0, 0xfff0c0, 1.3);

// =============================================================================
//  MAP : sol + plafond + murs + structures
// =============================================================================
function addBox(x, z, w, d, h, color, y=null) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    applyPS1Shader(new THREE.MeshLambertMaterial({ color }))
  );
  m.position.set(x, y===null ? h/2 : y, z);
  scene.add(m);
  addObstacle(x, z, w, d);
  return m;
}

// sol
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA*2, ARENA*2),
  applyPS1Shader(new THREE.MeshLambertMaterial({ map: floorTex }))
);
floor.rotation.x = -Math.PI/2;
scene.add(floor);

// plafond
const ceil = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA*2, ARENA*2),
  applyPS1Shader(new THREE.MeshLambertMaterial({ color: 0x101016 }))
);
ceil.rotation.x = Math.PI/2; ceil.position.y = WALL_H;
scene.add(ceil);

// murs périmètre
const wallMat = applyPS1Shader(new THREE.MeshLambertMaterial({ map: wallTex }));
function wall(x, z, w, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat);
  m.position.set(x, WALL_H/2, z); scene.add(m);
}
wall(0, -ARENA, ARENA*2, 1);
wall(0,  ARENA, ARENA*2, 1);
wall(-ARENA, 0, 1, ARENA*2);
wall( ARENA, 0, 1, ARENA*2);

// fontaine centrale + boutiques + caisses
addBox(0, 0, 5, 5, 1.1, 0x2d3a4a);
addBox(0, 0, 3, 3, 2.2, 0x39506a, 1.1);
[[-18,-8],[-18,8],[18,-8],[18,8]].forEach(([x,z]) => addBox(x, z, 6, 3, 3, 0x33333d));
[[-8,-18],[8,-18],[-8,18],[8,18]].forEach(([x,z]) => addBox(x, z, 3, 6, 3, 0x2f2f38));
[[10,2],[-10,-3],[4,-12],[-5,12],[13,12],[-13,-12]].forEach(([x,z]) =>
  addBox(x, z, 1.6, 1.6, 1.4, 0x4a3b2a)
);

// piliers (cylindres)
[[-22,-22],[22,-22],[-22,22],[22,22],[0,-22],[0,22],[-22,0],[22,0]].forEach(([x,z]) => {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, WALL_H, 8), wallMat);
  p.position.set(x, WALL_H/2, z); scene.add(p);
  obstacles.push({ minX:x-0.7, maxX:x+0.7, minZ:z-0.7, maxZ:z+0.7 });
});

// =============================================================================
//  PROPS — enseignes lumineuses, distributeurs, bancs, plantes, poubelles
// =============================================================================
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
  scene.add(mesh);
  return mesh;
}
sign(-18, 4.3, -7.6, 'FOOD COURT', '#ffd166');
sign( 18, 4.3, -7.6, 'ARCADE',     '#9b5cff');
sign(-18, 4.3,  7.6, 'CINÉMA',     '#36d3ff');
sign( 18, 4.3,  7.6, 'SUPER U',    '#ff9b3a');

// EXIT rouge plus petit au-dessus du mur sud
const sExit = sign(0, 4.6, -ARENA + 0.6, 'EXIT', '#ff2030', false);
sExit.scale.set(0.65, 0.65, 1);
sExit.rotation.y = Math.PI;

// distributeurs (boîtes verticales + écran émissif bleu)
function vendingMachine(x, z, ry) {
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 2.2, 0.8),
    applyPS1Shader(new THREE.MeshLambertMaterial({ color: 0x222a36 }))
  );
  body.position.set(x, 1.1, z); body.rotation.y = ry; scene.add(body);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.8),
    new THREE.MeshBasicMaterial({ color: 0x44d8ff })
  );
  const dz = Math.cos(ry)*0.42, dx = Math.sin(ry)*0.42;
  screen.position.set(x + dx, 1.5, z + dz);
  screen.rotation.y = ry;
  scene.add(screen);
  obstacles.push({ minX:x-0.8, maxX:x+0.8, minZ:z-0.5, maxZ:z+0.5 });
}
vendingMachine(-ARENA + 1.0,  0, Math.PI/2);
vendingMachine( ARENA - 1.0, -3, -Math.PI/2);
vendingMachine(-ARENA + 1.0, -14, Math.PI/2);

// bancs
function bench(x, z, ry) {
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.15, 0.6),
    applyPS1Shader(new THREE.MeshLambertMaterial({ color: 0x4a3a26 }))
  );
  seat.position.set(x, 0.42, z); seat.rotation.y = ry; scene.add(seat);
  const legGeo = new THREE.BoxGeometry(0.12, 0.42, 0.5);
  const legMat = applyPS1Shader(new THREE.MeshLambertMaterial({ color: 0x1a1a20 }));
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x + Math.cos(ry)*sx*1.0, 0.21, z - Math.sin(ry)*sx*1.0);
    leg.rotation.y = ry;
    scene.add(leg);
  }
  obstacles.push({ minX:x-1.3, maxX:x+1.3, minZ:z-0.3, maxZ:z+0.3 });
}
bench(-6,  6, 0);
bench( 6, -6, 0);
bench( 0, -10, Math.PI/2);

// plantes en pot
function plant(x, z) {
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.5, 0.55, 8),
    applyPS1Shader(new THREE.MeshLambertMaterial({ color: 0x382418 }))
  );
  pot.position.set(x, 0.27, z); scene.add(pot);
  const foliage = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.6, 0),
    applyPS1Shader(new THREE.MeshLambertMaterial({ color: 0x1f4a26 }))
  );
  foliage.position.set(x, 1.05, z); scene.add(foliage);
  obstacles.push({ minX:x-0.4, maxX:x+0.4, minZ:z-0.4, maxZ:z+0.4 });
}
plant(-4, 6); plant(4, 6); plant(-4, -6); plant(4, -6);
plant(11, 16); plant(-11, -16);

// poubelles
function trashCan(x, z) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 0.95, 8),
    applyPS1Shader(new THREE.MeshLambertMaterial({ color: 0x1a1a20 }))
  );
  m.position.set(x, 0.475, z); scene.add(m);
  obstacles.push({ minX:x-0.35, maxX:x+0.35, minZ:z-0.35, maxZ:z+0.35 });
}
trashCan(7, 9); trashCan(-7, -9); trashCan(15, -5); trashCan(-15, 5);

// =============================================================================
//  BORNES D'ACHAT
// =============================================================================
export const buyStations = [];
export function addBuyStation(x, z, ry, label, cost, action) {
  const g = new THREE.Group();
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.6, 0.2),
    new THREE.MeshLambertMaterial({
      color: 0x111111, emissive: 0x332200, emissiveIntensity: 0.6
    })
  );
  g.add(panel);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.4),
    new THREE.MeshBasicMaterial({ color: 0xffb200, transparent: true, opacity: 0.18 })
  );
  glow.position.z = 0.12; g.add(glow);
  g.position.set(x, 2.0, z); g.rotation.y = ry;
  scene.add(g);
  buyStations.push({ pos: new THREE.Vector3(x, EYE, z), label, cost, action, glow });
}

// =============================================================================
//  UPDATES (néons + blackout + pulsation bornes)
// =============================================================================
export function updateWorld(dt) {
  const t = performance.now() * 0.001;
  for (const l of neons) {
    let base = l.userData.base;
    if (game.blackout > 0) base *= 0.15 * (Math.random() < 0.55 ? 1 : 0);
    l.intensity = l.userData.flicker
      ? base * (0.65 + Math.sin(t*7 + l.userData.phase)*0.2 + Math.random()*0.2)
      : base;
  }
  ambient.intensity = game.blackout > 0 ? 0.12 : 0.85;
  if (game.blackout > 0) {
    game.blackout -= dt;
    if (game.blackout <= 0) endBlackout();
  }
  const pulse = 0.12 + Math.abs(Math.sin(t*3))*0.18;
  buyStations.forEach(s => { s.glow.material.opacity = pulse; });
}

export function triggerBlackout(duration = 14) {
  game.blackout = duration;
  scene.fog.far = FOG_FAR_BLACKOUT;
}
export function endBlackout() {
  game.blackout = 0;
  scene.fog.far = FOG_FAR;
}
