import * as THREE from 'three';
import { makeZombie, whenZombieReady } from './enemies.js';
import { pistolGroup, shotgunGroup, smgGroup, batGroup, axeGroup } from './weapons.js';

// =============================================================================
//  Scène galerie 3D — affichage des modèles isolés pour inspection
// =============================================================================
const galleryScene = new THREE.Scene();
galleryScene.background = new THREE.Color(0x14161c);

// caméra dédiée
const galleryCamera = new THREE.PerspectiveCamera(40, 16/9, 0.05, 100);

// éclairage studio (3 points : key / fill / rim)
galleryScene.add(new THREE.AmbientLight(0x808090, 0.45));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
keyLight.position.set(4, 6, 4);
galleryScene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.5);
fillLight.position.set(-4, 3, 2);
galleryScene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xff9966, 0.4);
rimLight.position.set(0, 4, -4);
galleryScene.add(rimLight);

// sol studio (disque sombre)
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(4, 32),
  new THREE.MeshLambertMaterial({ color: 0x1a1c22, flatShading: true })
);
floor.rotation.x = -Math.PI/2;
galleryScene.add(floor);

// halo de lumière au sol
const haloGeo = new THREE.RingGeometry(0.3, 3.5, 32);
const halo = new THREE.Mesh(
  haloGeo,
  new THREE.MeshBasicMaterial({ color: 0x2a3040, transparent: true, opacity: 0.4 })
);
halo.rotation.x = -Math.PI/2;
halo.position.y = 0.01;
galleryScene.add(halo);

// =============================================================================
//  Voiture preview (simplifiée — pas la version du parking, mais le même look)
// =============================================================================
function makeCarPreview() {
  const car = new THREE.Group();
  // texture rouille rapide
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(220,215,200)'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 18; i++) {
    const x = Math.random()*128, y = Math.random()*128, r = 3 + Math.random()*14;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${100+Math.random()*40},${50+Math.random()*25},${15+Math.random()*15},${0.8})`);
    rg.addColorStop(0.5, `rgba(80,40,15,0.4)`);
    rg.addColorStop(1, 'rgba(60,30,10,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = 'rgba(40,25,15,0.5)';
    g.lineWidth = 0.6;
    g.beginPath();
    const sx = Math.random()*128, sy = Math.random()*128;
    g.moveTo(sx, sy); g.lineTo(sx + 25, sy + 4); g.stroke();
  }
  const bodyTex = new THREE.CanvasTexture(c);
  bodyTex.magFilter = THREE.NearestFilter;
  const bodyMat = new THREE.MeshLambertMaterial({ map: bodyTex, flatShading: true });
  const tireMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0c, flatShading: true });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x12182a, flatShading: true });
  const bumperMat = new THREE.MeshLambertMaterial({ color: 0x18181c, flatShading: true });
  const grilleMat = new THREE.MeshLambertMaterial({ color: 0x08080c, flatShading: true });
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xffe8a0 });
  const taillightMat = new THREE.MeshBasicMaterial({ color: 0xc81020 });
  const indicatorMat = new THREE.MeshBasicMaterial({ color: 0xff9020 });
  // texture plaque
  const pc = document.createElement('canvas'); pc.width = 128; pc.height = 32;
  const pg = pc.getContext('2d');
  pg.fillStyle = '#e8e0c0'; pg.fillRect(0, 0, 128, 32);
  pg.strokeStyle = '#1a1a14'; pg.lineWidth = 2; pg.strokeRect(0, 0, 128, 32);
  pg.fillStyle = '#000'; pg.font = 'bold 22px "Arial Black", sans-serif';
  pg.textAlign = 'center'; pg.textBaseline = 'middle';
  pg.fillText('MALL 88', 64, 18);
  const plateTex = new THREE.CanvasTexture(pc); plateTex.magFilter = THREE.NearestFilter;
  const plateMat = new THREE.MeshBasicMaterial({ map: plateTex });
  // texture jante
  const rc = document.createElement('canvas'); rc.width = rc.height = 64;
  const rg2 = rc.getContext('2d');
  rg2.fillStyle = '#0a0a0c'; rg2.fillRect(0, 0, 64, 64);
  rg2.fillStyle = '#88888c';
  rg2.beginPath(); rg2.arc(32, 32, 22, 0, 7); rg2.fill();
  rg2.fillStyle = '#0a0a0c';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    rg2.save(); rg2.translate(32, 32); rg2.rotate(a);
    rg2.beginPath(); rg2.moveTo(-3, 2); rg2.lineTo(3, 2); rg2.lineTo(2, 20); rg2.lineTo(-2, 20); rg2.closePath();
    rg2.fill(); rg2.restore();
  }
  rg2.fillStyle = '#22222a'; rg2.beginPath(); rg2.arc(32, 32, 5, 0, 7); rg2.fill();
  const rimTex = new THREE.CanvasTexture(rc); rimTex.magFilter = THREE.NearestFilter;
  const rimFaceMat = new THREE.MeshBasicMaterial({ map: rimTex });

  // carrosserie
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
  // vitres
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
  // roues + jantes
  for (const wz of [-1.35, 1.15]) {
    for (const wx of [-0.92, 0.92]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 14), tireMat);
      wheel.rotation.z = Math.PI/2;
      wheel.position.set(wx, 0.32, wz);
      car.add(wheel);
      const rim = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16), rimFaceMat);
      rim.rotation.y = wx > 0 ? Math.PI/2 : -Math.PI/2;
      rim.position.set(wx + (wx > 0 ? 0.105 : -0.105), 0.32, wz);
      car.add(rim);
    }
  }
  // pare-chocs
  const bumpFront = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.22, 0.16), bumperMat);
  bumpFront.position.set(0, 0.45, 2.02); car.add(bumpFront);
  const bumpRear = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.22, 0.16), bumperMat);
  bumpRear.position.set(0, 0.45, -2.02); car.add(bumpRear);
  // grille
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.22, 0.05), grilleMat);
  grille.position.set(0, 0.62, 2.04); car.add(grille);
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.025, 0.02),
      new THREE.MeshLambertMaterial({ color: 0x44444a, flatShading: true }));
    bar.position.set(0, 0.55 + i * 0.07, 2.065); car.add(bar);
  }
  // phares + feux
  for (const lx of [-0.62, 0.62]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.20, 0.04), bumperMat);
    frame.position.set(lx, 0.78, 2.02); car.add(frame);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.15, 0.06), headlightMat);
    bulb.position.set(lx, 0.78, 2.045); car.add(bulb);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.04), taillightMat);
    tail.position.set(lx, 0.78, -2.02); car.add(tail);
    const ind = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.04), indicatorMat);
    ind.position.set(lx > 0 ? lx + 0.16 : lx - 0.16, 0.78, -2.02); car.add(ind);
  }
  // plaques
  const plateFront = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.14), plateMat);
  plateFront.position.set(0, 0.46, 2.09); car.add(plateFront);
  const plateRear = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.14), plateMat);
  plateRear.position.set(0, 0.46, -2.09); plateRear.rotation.y = Math.PI; car.add(plateRear);
  // rétroviseurs
  const mL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.16), bodyMat);
  mL.position.set(-0.99, 1.18, 0.6); car.add(mL);
  const mR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.16), bodyMat);
  mR.position.set(0.99, 1.18, 0.6); car.add(mR);
  // antenne
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 6), tireMat);
  antenna.position.set(0.62, 1.88, -0.7); car.add(antenna);
  return car;
}

// =============================================================================
//  Clone d'un viewmodel (les groupes weapons sont attachés à camera, donc on
//  doit cloner pour les afficher dans la galerie)
// =============================================================================
function clonedViewmodel(group) {
  const clone = group.clone(true);
  clone.traverse(m => m.visible = true);
  clone.position.set(0, 0, 0);
  clone.rotation.set(0, 0, 0);
  // élève l'arme à une hauteur de présentation (1.2m)
  clone.position.y = 1.2;
  return clone;
}

// =============================================================================
//  Catalogue
// =============================================================================
const modelDefs = [
  { id: 'zombie',  label: 'ZOMBIE',         dist: 4.0, focus: 1.0, factory: () => makeZombie() },
  { id: 'pistol',  label: 'PISTOL',         dist: 1.4, focus: 1.2, factory: () => clonedViewmodel(pistolGroup) },
  { id: 'shotgun', label: 'PUMP SHOTGUN',   dist: 2.0, focus: 1.2, factory: () => clonedViewmodel(shotgunGroup) },
  { id: 'smg',     label: 'SMG',            dist: 1.7, focus: 1.2, factory: () => clonedViewmodel(smgGroup) },
  { id: 'bat',     label: 'BAT',            dist: 1.8, focus: 1.2, factory: () => clonedViewmodel(batGroup) },
  { id: 'axe',     label: 'AXE',            dist: 2.0, focus: 1.2, factory: () => clonedViewmodel(axeGroup) },
  { id: 'car',     label: 'ABANDONED CAR',  dist: 8.0, focus: 0.9, factory: () => makeCarPreview() },
];

// =============================================================================
//  État de présentation
// =============================================================================
let currentModel = null;
let currentInfo = null;
let yaw = 0;
let autoRotate = true;

function placeCameraOrbit(info) {
  galleryCamera.position.set(0, info.focus + 0.8, info.dist);
  galleryCamera.lookAt(0, info.focus, 0);
}

export function getModelList() {
  return modelDefs.map(m => ({ id: m.id, label: m.label }));
}

export function showModel(id) {
  if (currentModel) {
    galleryScene.remove(currentModel);
    currentModel = null;
  }
  const def = modelDefs.find(m => m.id === id);
  if (!def) return;
  currentInfo = def;
  const built = def.factory();
  if (!built) {
    // ressource pas encore chargée (cas du zombie GLB asynchrone) — réessaie au load
    if (id === 'zombie') {
      whenZombieReady(() => {
        if (currentInfo?.id === 'zombie' && !currentModel) showModel('zombie');
      });
    }
    return;
  }
  currentModel = built;
  currentModel.position.y = 0;
  galleryScene.add(currentModel);
  yaw = 0;
  autoRotate = true;
  placeCameraOrbit(def);
}

export function setView(view) {
  if (!currentModel || !currentInfo) return;
  autoRotate = false;
  switch (view) {
    case 'front': yaw = 0;          break;
    case 'side':  yaw = Math.PI/2;  break;
    case 'back':  yaw = Math.PI;    break;
    case 'top':
      galleryCamera.position.set(0, currentInfo.focus + currentInfo.dist, 0.001);
      galleryCamera.lookAt(0, currentInfo.focus, 0);
      currentModel.rotation.y = yaw;
      return;
  }
  placeCameraOrbit(currentInfo);
  currentModel.rotation.y = yaw;
}

export function toggleAutoRotate() {
  autoRotate = !autoRotate;
  return autoRotate;
}

export function updateGallery(dt) {
  if (autoRotate && currentModel) {
    yaw += dt * 0.4;
    currentModel.rotation.y = yaw;
  }
  // joue l'animation rigée (zombie GLB) si présente
  if (currentModel?.userData?.mixer) {
    currentModel.userData.mixer.update(dt);
  }
}

export function getGalleryScene()  { return galleryScene; }
export function getGalleryCamera() { return galleryCamera; }
