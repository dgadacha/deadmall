import * as THREE from 'three';
import { scene, applyLowPoly } from './renderer.js';
import { FOG_FAR, FOG_NEAR, FOG_COLOR, EYE, NIGHTVISION_AMBIENT } from './config.js';
import { game, player } from './state.js';

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
//  LUMIÈRES GLOBALES
// =============================================================================
const ambient = new THREE.AmbientLight(0x5a5a6a, 0.20);
scene.add(ambient);
const moon = new THREE.DirectionalLight(0x6068a0, 0.16);
moon.position.set(10, 20, 6);
scene.add(moon);

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
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  return t;
}

// =============================================================================
//  SOL — asphalte craquelé sombre
// =============================================================================
const groundTex = makeTex((g, s) => {
  g.fillStyle = '#1a1a20'; g.fillRect(0, 0, s, s);
  // grandes taches plus sombres (flaques)
  for (let i = 0; i < 6; i++) {
    const x = Math.random()*s, y = Math.random()*s, r = 4 + Math.random()*8;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(8,8,12,0.6)');
    rg.addColorStop(1, 'rgba(8,8,12,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  // craquelures fines
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 0.6;
  for (let i = 0; i < 8; i++) {
    const x = Math.random()*s, y = Math.random()*s;
    g.beginPath(); g.moveTo(x, y);
    let cx = x, cy = y;
    for (let j = 0; j < 4; j++) {
      cx += (Math.random()-0.5)*16; cy += (Math.random()-0.5)*16;
      g.lineTo(cx, cy);
    }
    g.stroke();
  }
  // marques de pneus
  for (let i = 0; i < 3; i++) {
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.4;
    const y = Math.random()*s;
    g.beginPath(); g.moveTo(0, y); g.lineTo(s, y + (Math.random()-0.5)*6); g.stroke();
  }
}, W/3, 128);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(W, D),
  applyLowPoly(new THREE.MeshLambertMaterial({ map: groundTex }))
);
ground.rotation.x = -Math.PI/2;
ground.position.y = 0;
registerFloor(ground);
scene.add(ground);

// =============================================================================
//  MUR D'ENCEINTE — palissades grillagées + briques
// =============================================================================
const fenceTex = makeTex((g, s) => {
  g.fillStyle = '#2a2a30'; g.fillRect(0, 0, s, s);
  // briques horizontales
  g.fillStyle = '#22222a';
  for (let y = 0; y < s; y += 16) {
    g.fillRect(0, y, s, 1);
    for (let x = 0; x < s; x += 32) g.fillRect(x + ((y/16)%2 ? 16 : 0), y, 2, 14);
  }
  // taches d'humidité
  for (let i = 0; i < 4; i++) {
    g.fillStyle = `rgba(${20+Math.random()*30},${15+Math.random()*15},${10+Math.random()*10},0.4)`;
    g.beginPath(); g.arc(Math.random()*s, Math.random()*s, 3+Math.random()*6, 0, 7); g.fill();
  }
  // tags vagues
  g.fillStyle = 'rgba(170,20,20,0.18)';
  g.font = 'bold 18px sans-serif';
  g.fillText('X', 10, 30);
  g.fillText('//', 40, 50);
}, 6, 128);
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
const depotWallTex = makeTex((g, s) => {
  g.fillStyle = '#3a3a42'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#2c2c34';
  for (let y = 0; y < s; y += 12) g.fillRect(0, y, s, 1);
  // taches huileuses
  for (let i = 0; i < 5; i++) {
    g.fillStyle = `rgba(${10+Math.random()*20},${5+Math.random()*8},${5+Math.random()*8},0.5)`;
    g.beginPath(); g.arc(Math.random()*s, Math.random()*s, 2+Math.random()*4, 0, 7); g.fill();
  }
}, 4, 128);
const depotWallMat = applyLowPoly(new THREE.MeshLambertMaterial({ map: depotWallTex }));

const zoneNeons = [];

function buildDepot() {
  const hw = DEPOT_W/2, hd = DEPOT_D/2;
  const t = 0.4;
  const doorW = 2.2;
  const winW = 1.8;

  // === sol intérieur (béton plus clair que l'asphalte) ===
  const innerTex = makeTex((g, s) => {
    g.fillStyle = '#2a2a30'; g.fillRect(0, 0, s, s);
    // dalles
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1;
    for (let y = 0; y < s; y += 32) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
    }
    for (let x = 0; x < s; x += 32) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke();
    }
    // graffitis légers / saletés
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(${30+Math.random()*40},${20+Math.random()*20},${15+Math.random()*15},0.35)`;
      g.beginPath(); g.arc(Math.random()*s, Math.random()*s, 1+Math.random()*3, 0, 7); g.fill();
    }
  }, 3, 128);
  const innerFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(DEPOT_W, DEPOT_D),
    applyLowPoly(new THREE.MeshLambertMaterial({ map: innerTex }))
  );
  innerFloor.rotation.x = -Math.PI/2;
  innerFloor.position.y = 0.005; // léger offset pour éviter z-fight avec ground
  registerFloor(innerFloor);
  scene.add(innerFloor);

  // === plafond ===
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(DEPOT_W, DEPOT_D),
    applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x0a0a10 }))
  );
  ceil.rotation.x = Math.PI/2;
  ceil.position.y = DEPOT_H;
  scene.add(ceil);

  // === mur Nord avec entrée centrale (porte vide) ===
  const segL_w = (DEPOT_W - doorW)/2;
  const wallNL = new THREE.Mesh(new THREE.BoxGeometry(segL_w, DEPOT_H, t), depotWallMat);
  wallNL.position.set(-doorW/2 - segL_w/2, DEPOT_H/2, -hd);
  scene.add(wallNL);
  addObstacle(-doorW/2 - segL_w, -doorW/2, -hd - t/2, -hd + t/2);
  const wallNR = new THREE.Mesh(new THREE.BoxGeometry(segL_w, DEPOT_H, t), depotWallMat);
  wallNR.position.set(doorW/2 + segL_w/2, DEPOT_H/2, -hd);
  scene.add(wallNR);
  addObstacle(doorW/2, doorW/2 + segL_w, -hd - t/2, -hd + t/2);
  // linteau au-dessus de la porte
  const lintN = new THREE.Mesh(new THREE.BoxGeometry(doorW, 1.0, t), depotWallMat);
  lintN.position.set(0, DEPOT_H - 0.5, -hd);
  scene.add(lintN);

  // === mur Sud avec entrée centrale (idem) ===
  const wallSL = new THREE.Mesh(new THREE.BoxGeometry(segL_w, DEPOT_H, t), depotWallMat);
  wallSL.position.set(-doorW/2 - segL_w/2, DEPOT_H/2, hd);
  scene.add(wallSL);
  addObstacle(-doorW/2 - segL_w, -doorW/2, hd - t/2, hd + t/2);
  const wallSR = new THREE.Mesh(new THREE.BoxGeometry(segL_w, DEPOT_H, t), depotWallMat);
  wallSR.position.set(doorW/2 + segL_w/2, DEPOT_H/2, hd);
  scene.add(wallSR);
  addObstacle(doorW/2, doorW/2 + segL_w, hd - t/2, hd + t/2);
  const lintS = new THREE.Mesh(new THREE.BoxGeometry(doorW, 1.0, t), depotWallMat);
  lintS.position.set(0, DEPOT_H - 0.5, hd);
  scene.add(lintS);

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
      scene.add(m);
      addObstacle(sx - t/2, sx + t/2, sg.z0, sg.z1);
    }
    for (const wz of winPosZ) {
      const below = new THREE.Mesh(new THREE.BoxGeometry(t, winBotY, winW), depotWallMat);
      below.position.set(sx, winBotY/2, wz);
      scene.add(below);
      addObstacle(sx - t/2, sx + t/2, wz - winW/2, wz + winW/2);
      const above = new THREE.Mesh(new THREE.BoxGeometry(t, DEPOT_H - winTopY, winW), depotWallMat);
      above.position.set(sx, winTopY + (DEPOT_H - winTopY)/2, wz);
      scene.add(above);
    }
  }
  buildSideWallWithWindows( DEPOT_W/2);
  buildSideWallWithWindows(-DEPOT_W/2);

  // === BARRICADES (planches en travers des fenêtres) — visuel V1 ===
  const plankTex = makeTex((g, s) => {
    g.fillStyle = '#5a3a1c'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#3a2410';
    for (let y = 0; y < s; y += 8) g.fillRect(0, y, s, 1);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `rgba(${20+Math.random()*20},${10+Math.random()*10},5,0.55)`;
      g.beginPath(); g.arc(Math.random()*s, Math.random()*s, 1+Math.random()*2.5, 0, 7); g.fill();
    }
  }, 1, 64);
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

  // === NÉON intérieur (grésille) ===
  const neonIn = new THREE.PointLight(0xffe8a0, 1.8, 14, 1.4);
  neonIn.position.set(0, DEPOT_H - 0.3, 0);
  neonIn.userData = { base: 1.8, flicker: true, phase: Math.random()*7 };
  scene.add(neonIn);
  zoneNeons.push(neonIn);
}
buildDepot();

// =============================================================================
//  BUS ABANDONNÉS — gros volumes rectangulaires sombres dans la cour
//  Position pensée pour casser les sightlines + créer 2-3 chokepoints.
// =============================================================================
function buildBuses() {
  // texture carrosserie de bus : jaune scolaire sale + rouille
  const busTex = makeTex((g, s) => {
    g.fillStyle = '#7a6a20'; g.fillRect(0, 0, s, s);
    // bande inférieure noire
    g.fillStyle = '#1a1410'; g.fillRect(0, s*0.78, s, s*0.08);
    // fenêtres alignées (rectangles noirs)
    g.fillStyle = '#0a0a14';
    for (let i = 0; i < 6; i++) g.fillRect(8 + i*20, s*0.18, 14, s*0.32);
    // rouille
    for (let i = 0; i < 18; i++) {
      const x = Math.random()*s, y = Math.random()*s, r = 2+Math.random()*7;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(${90+Math.random()*30},${40+Math.random()*15},${10+Math.random()*10},0.7)`);
      rg.addColorStop(1, 'rgba(60,25,10,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }, 1, 256);
  const busMat = applyLowPoly(new THREE.MeshLambertMaterial({ map: busTex }));
  const wheelMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x0a0a0c }));
  const busTopMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x4a3a14 }));

  function addBus(cx, cz, ry) {
    const busL = 8.5, busW = 2.5, busH = 2.8;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(busW, busH, busL), busMat);
    body.position.y = 0.8 + busH/2;
    g.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(busW + 0.05, 0.1, busL + 0.05), busTopMat);
    top.position.y = 0.8 + busH;
    g.add(top);
    for (const zoff of [-busL/2 + 1, 0, busL/2 - 1]) {
      for (const sx of [-busW/2, busW/2]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 12), wheelMat);
        w.rotation.z = Math.PI/2;
        w.position.set(sx, 0.55, zoff);
        g.add(w);
      }
    }
    const bMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x14141a }));
    const bp1 = new THREE.Mesh(new THREE.BoxGeometry(busW + 0.1, 0.3, 0.2), bMat);
    bp1.position.set(0, 0.7, busL/2 + 0.05);
    g.add(bp1);
    const bp2 = new THREE.Mesh(new THREE.BoxGeometry(busW + 0.1, 0.3, 0.2), bMat);
    bp2.position.set(0, 0.7, -busL/2 - 0.05);
    g.add(bp2);
    for (const sx of [-0.6, 0.6]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.05), new THREE.MeshBasicMaterial({ color: 0xffe8a0 }));
      head.position.set(sx, 1.1, busL/2 + 0.06);
      g.add(head);
    }

    g.position.set(cx, 0, cz);
    g.rotation.y = ry;
    scene.add(g);

    const aw = ry === 0 ? busW : busL;
    const ad = ry === 0 ? busL : busW;
    addObstacle(cx - aw/2 - 0.1, cx + aw/2 + 0.1, cz - ad/2 - 0.1, cz + ad/2 + 0.1);
  }

  // 3 bus disposés autour de la cour, jamais trop près des entrées du depot
  addBus(-15,  12, 0);
  addBus( 15, -10, 0);
  addBus(-10, -14, Math.PI/2);
}
buildBuses();

// =============================================================================
//  POTEAUX D'ÉCLAIRAGE + NÉONS GRÉSILLANTS (4 coins de la cour)
// =============================================================================
function buildStreetLights() {
  const poleMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x16161c }));
  const positions = [
    [-W/2 + 3, -D/2 + 3, 0xffd070],
    [ W/2 - 3, -D/2 + 3, 0x90b8ff],
    [-W/2 + 3,  D/2 - 3, 0x90b8ff],
    [ W/2 - 3,  D/2 - 3, 0xffd070],
  ];
  for (const [px, pz, col] of positions) {
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
    const l = new THREE.PointLight(col, 1.6, 18, 1.4);
    l.position.set(px, 4.7, pz);
    l.userData = { base: 1.6, flicker: true, phase: Math.random()*7 };
    scene.add(l);
    zoneNeons.push(l);
  }
}
buildStreetLights();

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

function wallBuyTex(label, cost) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0a10'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#ffb200'; g.lineWidth = 3;
  g.strokeRect(4, 4, 248, 120);
  g.fillStyle = '#ffe8a0'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 28px "Arial Black", sans-serif';
  g.fillText(label, 128, 50);
  g.fillStyle = '#4cd07a';
  g.font = 'bold 30px "Arial Black", sans-serif';
  g.fillText(`$${cost}`, 128, 92);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

function addWallBuy(x, y, z, ry, label, cost, action) {
  const tex = wallBuyTex(label, cost);
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.8),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
  panel.position.set(x, y, z);
  panel.rotation.y = ry;
  scene.add(panel);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.0),
    new THREE.MeshBasicMaterial({ color: 0xffb200, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.position.set(x, y, z);
  glow.rotation.y = ry;
  const off = 0.01;
  glow.position.x += Math.sin(ry) * off;
  glow.position.z += Math.cos(ry) * off;
  scene.add(glow);

  buyStations.push({
    pos: new THREE.Vector3(x, EYE, z),
    label, cost, action, glow,
    zone: 'bus_depot',
    kind: 'wall',
  });
}

// === MYSTERY BOX (caisse en bois + lueur) ===
function addMysteryBox(x, z) {
  const g = new THREE.Group();
  const woodMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x3a2410 }));
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.9), woodMat);
  box.position.y = 0.45;
  g.add(box);
  const strapMat = applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x88882a }));
  for (const sx of [-0.5, 0.5]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.95, 0.95), strapMat);
    strap.position.set(sx, 0.45, 0);
    g.add(strap);
  }
  const qTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = '#ffd040';
    ctx.font = 'bold 56px "Arial Black", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', 32, 36);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    return t;
  })();
  const qFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.7),
    new THREE.MeshBasicMaterial({ map: qTex, transparent: true })
  );
  qFace.position.set(0, 0.45, 0.46);
  g.add(qFace);

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

  buyStations.push({
    pos: new THREE.Vector3(x, EYE, z),
    label: 'MYSTERY BOX',
    cost: 950,
    action: () => actions.giveWeapon('mystery'),
    glow: halo,
    zone: 'bus_depot',
    kind: 'mystery',
  });
}

// === PERK MACHINE (distributeur — bouteille colorée émissive) ===
function addPerkMachine(x, z, ry, label, cost, perkKey) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 2.0, 0.7),
    applyLowPoly(new THREE.MeshLambertMaterial({ color: 0x141420 }))
  );
  body.position.y = 1.0;
  g.add(body);
  const colorByPerk = {
    regen:        0x2acc66,
    nightVision:  0x6a30c8,
    lightUpgrade: 0xffc040,
  };
  const fc = colorByPerk[perkKey] ?? 0x2acc66;
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 1.8),
    new THREE.MeshBasicMaterial({ color: fc })
  );
  front.position.set(0, 1.0, 0.36);
  g.add(front);
  const bottleMat = new THREE.MeshBasicMaterial({ color: fc });
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.6, 8), bottleMat);
  bottle.position.set(0, 1.2, 0.4);
  g.add(bottle);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8),
    applyLowPoly(new THREE.MeshLambertMaterial({ color: 0xc0c0c8 }))
  );
  cap.position.set(0, 1.55, 0.4);
  g.add(cap);
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
    t.magFilter = THREE.NearestFilter;
    return t;
  })();
  const labelMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.32),
    new THREE.MeshBasicMaterial({ map: labelTex })
  );
  labelMesh.position.set(0, 0.4, 0.37);
  g.add(labelMesh);
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
}

// === LAYOUT DES ACHATS ===
addWallBuy(-4.0, 1.8, DEPOT_D/2 - 0.22, 0, 'PISTOL AMMO', 250,
  () => actions.refillAmmo('pistol'));

addWallBuy( 4.0, 1.8, -DEPOT_D/2 + 0.22, Math.PI, 'OLYMPIA', 500,
  () => actions.giveWeapon('shotgun'));

addWallBuy(DEPOT_W/2 + 0.22, 1.8, 0, Math.PI/2, 'MP5', 1000,
  () => actions.giveWeapon('smg'));

addWallBuy(-DEPOT_W/2 - 0.22, 1.8, 0, -Math.PI/2, 'BAT', 250,
  () => actions.giveWeapon('bat'));

// MYSTERY BOX — coin nord-est de la cour
addMysteryBox(16, -15);

// PERK : REGEN — à l'intérieur du depot, coin sud-est
addPerkMachine(5.0, 3.5, Math.PI, 'REGEN', 2500, 'regen');

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
const FAKE_ZONE = {
  id: 'bus_depot',
  name: 'BUS DEPOT',
  baseX: 0, baseY: 0, baseZ: 0,
  playerSpawn: new THREE.Vector3(0, EYE, 0),  // centre du bâtiment
  minX: -W/2, maxX: W/2,
  minZ: -D/2, maxZ: D/2,
  fogColor: FOG_COLOR, fogNear: FOG_NEAR, fogFar: FOG_FAR,
  ambientIntensity: 0.20,
  group: scene,
};
export function getZone(_id) { return FAKE_ZONE; }
export function getCurrentZone() { return FAKE_ZONE; }
export function currentZoneGroup() { return scene; }
export function switchToZone(_id) { return FAKE_ZONE; }

export function getCurrentBounds() {
  return { minX: -W/2, maxX: W/2, minZ: -D/2, maxZ: D/2 };
}

// =============================================================================
//  SPAWNS ZOMBIES — par les ouvertures (portes N/S + fenêtres E/O + coins cour)
// =============================================================================
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

// =============================================================================
//  UPDATE (néons grésillants + pulse glow + blackout stub)
// =============================================================================
let blackoutT = 0;
export function updateWorld(dt) {
  // néons : flicker random
  for (const n of zoneNeons) {
    const u = n.userData;
    if (!u.flicker) continue;
    u.phase += dt * (3 + Math.random() * 2);
    const f = 0.7 + 0.3 * Math.sin(u.phase * 7) * Math.sin(u.phase * 13);
    n.intensity = u.base * (Math.random() < 0.02 ? 0.2 : f);
  }
  // glow des bornes : pulse léger
  const t = performance.now() / 1000;
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
