import * as THREE from 'three';
import { camera } from './renderer.js';
import { State, game, player, ammo, owned } from './state.js';
import { WEAPONS } from './config.js';
import { sfx } from './audio.js';
import { spawnTracer } from './effects.js';
import { updateHUD, hitmark } from './hud.js';
import { damageZombie, getAliveZombies } from './enemies.js';
import { isMoving, isSprinting } from './player.js';

// =============================================================================
//  VIEWMODELS — 5 modèles distincts, toggle par visibility
// =============================================================================

// Matériaux partagés
const matGunDark   = new THREE.MeshLambertMaterial({ color: 0x18181f, flatShading: true });
const matGunMid    = new THREE.MeshLambertMaterial({ color: 0x2a2a32, flatShading: true });
const matGunLight  = new THREE.MeshLambertMaterial({ color: 0x3a3a44, flatShading: true });
const matMetal     = new THREE.MeshLambertMaterial({ color: 0x55555c, flatShading: true });
const matWood      = new THREE.MeshLambertMaterial({ color: 0x6a4a26, flatShading: true });
const matWoodDark  = new THREE.MeshLambertMaterial({ color: 0x3a2818, flatShading: true });

const gunGroup = new THREE.Group();
gunGroup.position.set(0.32, -0.32, -0.7);
camera.add(gunGroup);

// ---------------------- PISTOLET ----------------------
export const pistolGroup = new THREE.Group();
{
  // glissière (slide haut)
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.62), matGunDark);
  slide.position.set(0, 0.07, -0.05);
  pistolGroup.add(slide);
  // corps (frame)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.13, 0.55), matGunMid);
  frame.position.set(0, -0.04, -0.02);
  pistolGroup.add(frame);
  // canon
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.18, 8), matMetal);
  barrel.rotation.x = Math.PI/2;
  barrel.position.set(0, 0.06, -0.45);
  pistolGroup.add(barrel);
  // grip + texture
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.32, 0.18), matGunDark);
  grip.position.set(0, -0.24, 0.2);
  grip.rotation.x = 0.15;
  pistolGroup.add(grip);
  // magasin (visible)
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.16), matGunMid);
  mag.position.set(0, -0.42, 0.2);
  pistolGroup.add(mag);
  // viseur arrière
  const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), matGunDark);
  rearSight.position.set(0, 0.16, 0.18);
  pistolGroup.add(rearSight);
  // viseur avant
  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.04), matGunDark);
  frontSight.position.set(0, 0.16, -0.32);
  pistolGroup.add(frontSight);
  // détente
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.04), matMetal);
  trigger.position.set(0, -0.08, 0.08);
  pistolGroup.add(trigger);
  // garde-trigger
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 12, Math.PI), matGunMid);
  guard.rotation.set(0, 0, -Math.PI/2);
  guard.position.set(0, -0.08, 0.08);
  pistolGroup.add(guard);
  // chien marteau
  const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.04), matGunDark);
  hammer.position.set(0, 0.13, 0.24);
  pistolGroup.add(hammer);
}
gunGroup.add(pistolGroup);

// ---------------------- PUMP SHOTGUN ----------------------
export const shotgunGroup = new THREE.Group();
{
  // crosse arrière en bois
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.42), matWood);
  stock.position.set(0, -0.12, 0.32);
  stock.rotation.x = 0.12;
  shotgunGroup.add(stock);
  // partie centrale (action)
  const action = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.32), matGunDark);
  action.position.set(0, 0.0, 0.05);
  shotgunGroup.add(action);
  // canon long
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.85, 10), matMetal);
  barrel.rotation.x = Math.PI/2;
  barrel.position.set(0, 0.06, -0.45);
  shotgunGroup.add(barrel);
  // tube charge sous canon
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 8), matGunMid);
  tube.rotation.x = Math.PI/2;
  tube.position.set(0, -0.02, -0.4);
  shotgunGroup.add(tube);
  // pompe (en avant)
  const pump = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.16), matWoodDark);
  pump.position.set(0, -0.02, -0.22);
  shotgunGroup.add(pump);
  // grip
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.16), matWood);
  grip.position.set(0, -0.18, 0.15);
  grip.rotation.x = 0.15;
  shotgunGroup.add(grip);
  // viseur avant bille
  const bead = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.03), matMetal);
  bead.position.set(0, 0.13, -0.85);
  shotgunGroup.add(bead);
}
gunGroup.add(shotgunGroup);

// ---------------------- SMG ----------------------
export const smgGroup = new THREE.Group();
{
  // receiver central
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.4), matGunDark);
  receiver.position.set(0, 0.03, -0.05);
  smgGroup.add(receiver);
  // grip arrière
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.14), matGunDark);
  grip.position.set(0, -0.16, 0.16);
  grip.rotation.x = 0.1;
  smgGroup.add(grip);
  // magasin long qui dépasse vers le bas
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.12), matGunMid);
  mag.position.set(0, -0.22, -0.05);
  mag.rotation.x = -0.1;
  smgGroup.add(mag);
  // canon
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8), matMetal);
  barrel.rotation.x = Math.PI/2;
  barrel.position.set(0, 0.04, -0.48);
  smgGroup.add(barrel);
  // garde-main
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.18), matGunDark);
  handguard.position.set(0, 0.03, -0.35);
  smgGroup.add(handguard);
  // crosse pliante
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.28), matGunDark);
  stock.position.set(0, 0.06, 0.28);
  smgGroup.add(stock);
  const stockEnd = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.05), matGunDark);
  stockEnd.position.set(0, 0.06, 0.42);
  smgGroup.add(stockEnd);
  // viseurs
  const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.03), matGunDark);
  rearSight.position.set(0, 0.15, 0.12);
  smgGroup.add(rearSight);
  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.04), matGunDark);
  frontSight.position.set(0, 0.13, -0.27);
  smgGroup.add(frontSight);
}
gunGroup.add(smgGroup);

// Visibilité initiale
pistolGroup.visible = true;
shotgunGroup.visible = false;
smgGroup.visible = false;

// muzzle flash partagé (position ajustée selon arme)
const muzzle = new THREE.Mesh(
  new THREE.PlaneGeometry(0.5, 0.5),
  new THREE.MeshBasicMaterial({
    color: 0xffd070, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  })
);
muzzle.position.set(0, 0.05, -0.85);
gunGroup.add(muzzle);
const muzzleLight = new THREE.PointLight(0xffcc66, 0, 10);
muzzleLight.position.copy(muzzle.position);
gunGroup.add(muzzleLight);

// =============================================================================
//  VIEWMODELS MÊLÉE (BAT + AXE distincts)
// =============================================================================
const meleeGroup = new THREE.Group();
meleeGroup.position.set(0.35, -0.30, -0.55);
meleeGroup.rotation.z = -0.2;
meleeGroup.visible = false;
camera.add(meleeGroup);

// ---------------------- BAT ----------------------
export const batGroup = new THREE.Group();
{
  // pommeau bas (knob)
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10), matWoodDark);
  knob.rotation.x = Math.PI/2;
  knob.position.set(0, 0, 0.32);
  batGroup.add(knob);
  // poignée avec ruban noir
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 10), matGunDark);
  grip.rotation.x = Math.PI/2;
  grip.position.set(0, 0, 0.2);
  batGroup.add(grip);
  // manche qui s'évase progressivement
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.5, 10), matWood);
  shaft.rotation.x = Math.PI/2;
  shaft.position.set(0, 0, -0.15);
  batGroup.add(shaft);
  // tête large
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.32, 12), matWood);
  head.rotation.x = Math.PI/2;
  head.position.set(0, 0, -0.55);
  batGroup.add(head);
  // bout arrondi
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.083, 8, 6), matWood);
  tip.position.set(0, 0, -0.71);
  batGroup.add(tip);
  // taches de sang sur la tête
  const blood = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.18), new THREE.MeshBasicMaterial({ color: 0x8a0010 }));
  blood.position.set(0, 0.06, -0.5);
  batGroup.add(blood);
}
meleeGroup.add(batGroup);

// ---------------------- AXE ----------------------
export const axeGroup = new THREE.Group();
{
  // pommeau
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.04), matGunDark);
  knob.position.set(0, 0, 0.32);
  axeGroup.add(knob);
  // manche bois
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 1.0, 10), matWood);
  shaft.rotation.x = Math.PI/2;
  shaft.position.set(0, 0, -0.18);
  axeGroup.add(shaft);
  // poignée gainée
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 10), matGunDark);
  grip.rotation.x = Math.PI/2;
  grip.position.set(0, 0, 0.18);
  axeGroup.add(grip);
  // tête métal (corps central)
  const headBody = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.16), matMetal);
  headBody.position.set(0, 0.04, -0.68);
  axeGroup.add(headBody);
  // tranchant principal (triangle vers le bas)
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.22), matMetal);
  blade.position.set(0, 0.08, -0.72);
  axeGroup.add(blade);
  // pointe en haut
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), matMetal);
  spike.position.set(0, 0.22, -0.66);
  spike.rotation.z = Math.PI/4;
  axeGroup.add(spike);
  // sang sur le tranchant
  const blood = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.28, 0.08), new THREE.MeshBasicMaterial({ color: 0x8a0010 }));
  blood.position.set(0.024, 0.08, -0.72);
  axeGroup.add(blood);
}
axeGroup.visible = false;
meleeGroup.add(axeGroup);

// =============================================================================
//  TORCHE (SpotLight enfant de caméra, plus large/forte si lightUpgrade)
// =============================================================================
// Torche modérée (TF2 = scene déjà éclairée par ambient + key light)
const flashlight = new THREE.SpotLight(0xffe8c0, 1.4, 24, Math.PI/5, 0.5, 1.0);
flashlight.position.set(0.12, -0.1, 0);
const flashTarget = new THREE.Object3D();
flashTarget.position.set(0, 0, -1);
camera.add(flashlight); camera.add(flashTarget);
flashlight.target = flashTarget;

const raycaster = new THREE.Raycaster();

// =============================================================================
//  TIR / FRAPPE
// =============================================================================
function isMelee(name) { return WEAPONS[name]?.melee === true; }

function shootGun(w, a) {
  a.mag--;
  game.fireCd = w.fireDelay;
  if (game.curWeapon === 'shotgun') sfx.shotgun();
  else if (game.curWeapon === 'smg') sfx.pistol();
  else sfx.pistol();
  muzzle.material.opacity = 1;
  muzzleLight.intensity = 3;
  gunGroup.userData.recoil = 1;

  const origin = camera.getWorldPosition(new THREE.Vector3());
  const baseDir = camera.getWorldDirection(new THREE.Vector3());
  const alive = getAliveZombies();
  for (let p = 0; p < w.pellets; p++) {
    const dir = baseDir.clone();
    dir.x += (Math.random()*2 - 1) * w.spread;
    dir.y += (Math.random()*2 - 1) * w.spread;
    dir.z += (Math.random()*2 - 1) * w.spread;
    dir.normalize();
    raycaster.set(origin, dir);
    const hits = raycaster.intersectObjects(alive, true);
    let end = origin.clone().addScaledVector(dir, 60);
    if (hits.length) {
      const h = hits[0];
      end = h.point.clone();
      const z = h.object.userData.zombie;
      if (z && z.userData.alive) {
        // headshot détecté côté damageZombie via la hauteur de h.point
        damageZombie(z, w.dmg, h.point);
      }
    }
    spawnTracer(muzzle.getWorldPosition(new THREE.Vector3()), end);
  }
  if (a.mag <= 0) startReload();
}

function swingMelee(w) {
  game.fireCd = w.fireDelay;
  game.swingPhase = 1;
  sfx.melee();

  // hit detection : tous les zombies dans un cône devant le joueur, distance <= range
  const origin = camera.position.clone();
  const dir = camera.getWorldDirection(new THREE.Vector3());
  dir.y = 0; dir.normalize();
  const half = w.coneAngle / 2;
  const alive = getAliveZombies();
  let hitAny = false;
  for (const z of alive) {
    const to = z.position.clone().sub(origin);
    to.y = 0;
    const dist = to.length();
    if (dist > w.range || dist < 0.2) continue;
    to.normalize();
    const angle = Math.acos(THREE.MathUtils.clamp(dir.dot(to), -1, 1));
    if (angle <= half) {
      const hitPoint = z.position.clone().setY(1.1);   // au niveau torse → pas un headshot
      damageZombie(z, w.dmg, hitPoint);
      hitAny = true;
    }
  }
  if (hitAny) hitmark();
}

export function shoot() {
  if (game.state !== State.PLAY || game.reloading > 0 || game.fireCd > 0) return;
  const w = WEAPONS[game.curWeapon];
  const a = ammo[game.curWeapon];
  if (w.melee) {
    swingMelee(w);
  } else {
    if (a.mag <= 0) { sfx.nope(); startReload(); return; }
    shootGun(w, a);
  }
  updateHUD();
}

export function startReload() {
  const w = WEAPONS[game.curWeapon];
  if (w.melee) return;
  const a = ammo[game.curWeapon];
  if (game.reloading > 0 || a.mag >= w.mag) return;
  if (a.reserve !== Infinity && a.reserve <= 0) return;
  game.reloading = w.reload;
  sfx.reload();
  updateHUD();
}
function finishReload() {
  const w = WEAPONS[game.curWeapon];
  const a = ammo[game.curWeapon];
  const need = w.mag - a.mag;
  if (a.reserve === Infinity) {
    a.mag = w.mag;
  } else {
    const take = Math.min(need, a.reserve);
    a.mag += take; a.reserve -= take;
  }
  updateHUD();
}

// =============================================================================
//  SELECTION D'ARME
// =============================================================================
function applyWeaponSkin(name) {
  if (isMelee(name)) {
    gunGroup.visible = false;
    meleeGroup.visible = true;
    const isAxe = name === 'axe';
    batGroup.visible = !isAxe;
    axeGroup.visible = isAxe;
  } else {
    gunGroup.visible = true;
    meleeGroup.visible = false;
    pistolGroup.visible  = (name === 'pistol');
    shotgunGroup.visible = (name === 'shotgun');
    smgGroup.visible     = (name === 'smg');
    // ajuste la position du muzzle selon l'arme (canon plus ou moins long)
    if (name === 'shotgun')      muzzle.position.set(0, 0.06, -0.90);
    else if (name === 'smg')     muzzle.position.set(0, 0.04, -0.72);
    else                         muzzle.position.set(0, 0.06, -0.56);
    muzzleLight.position.copy(muzzle.position);
  }
}

export function switchWeapon(w) {
  if (!owned[w] || w === game.curWeapon || game.reloading > 0) return;
  game.curWeapon = w;
  applyWeaponSkin(w);
  updateHUD();
}

export function giveWeapon(w) {
  owned[w] = true;
  if (!ammo[w]) return;
  // recharge initiale pour les armes à feu
  if (!WEAPONS[w].melee && ammo[w].reserve === 0) {
    ammo[w].mag = WEAPONS[w].mag;
    if (w === 'shotgun') ammo[w].reserve = 24;
    else if (w === 'smg') ammo[w].reserve = 120;
  }
  // les mêlées partagent le slot 4 — la dernière achetée devient l'active
  if (WEAPONS[w].melee) game.meleeSlot = w;
  switchWeapon(w);
}
export function refillAmmo() {
  const a = ammo[game.curWeapon];
  if (a.reserve === Infinity || ammo[game.curWeapon] === undefined) return;
  if (WEAPONS[game.curWeapon].melee) return;
  a.reserve += WEAPONS[game.curWeapon].mag * 4;
  updateHUD();
}

// =============================================================================
//  Achats spéciaux (consommables, perks) — appelés par les bornes
// =============================================================================
export function applyMedkit()     { player.hp = 100; updateHUD(); }
export function applyArmor()      { player.armor = 100; updateHUD(); }
export function unlockRegen()     { player.perks.regen = true; updateHUD(); }
export function unlockNightVision(){ player.perks.nightVision = true; updateHUD(); }
export function unlockLight()     {
  player.perks.lightUpgrade = true;
  flashlight.distance = 42;
  flashlight.angle = Math.PI / 4.2;
  flashlight.intensity = 2.5;
  updateHUD();
}

// =============================================================================
//  UPDATE par frame
// =============================================================================
export function updateWeapons(dt) {
  const t = performance.now() * 0.001;
  const sprint = isSprinting() ? 1.7 : 1;
  const moving = isMoving();
  const bobY = moving ? Math.sin(t*10*sprint)*0.012 : 0;
  const bobX = moving ? Math.cos(t*5 *sprint)*0.006 : 0;

  if (!WEAPONS[game.curWeapon]?.melee) {
    const recoil = gunGroup.userData.recoil || 0;
    gunGroup.position.set(0.32 + bobX, -0.32 + bobY - recoil*0.04, -0.7 + recoil*0.06);
    gunGroup.rotation.x = recoil * 0.25;
    gunGroup.userData.recoil = Math.max(0, recoil - dt*6);
  } else {
    // animation swing mêlée
    if (game.swingPhase > 0) {
      game.swingPhase = Math.max(0, game.swingPhase - dt / 0.35);
    }
    const swing = game.swingPhase;
    meleeGroup.position.set(0.35 + bobX - swing*0.15, -0.30 + bobY + swing*0.18, -0.55 - swing*0.2);
    meleeGroup.rotation.z = -0.2 + swing * 1.4;
    meleeGroup.rotation.y = -swing * 0.6;
  }

  game.fireCd = Math.max(0, game.fireCd - dt);
  muzzle.material.opacity = Math.max(0, muzzle.material.opacity - dt*12);
  muzzleLight.intensity   = Math.max(0, muzzleLight.intensity   - dt*30);
  if (game.reloading > 0) {
    game.reloading -= dt;
    if (game.reloading <= 0) { game.reloading = 0; finishReload(); }
  }

  // tremblement torche
  const tremble = 0.012 + (player.hp < 50 ? 0.025 : 0);
  flashlight.position.x = 0.12 + Math.sin(t*4.3) * tremble;
  flashlight.position.y = -0.1 + Math.cos(t*3.7) * tremble;
}

export function resetWeapons() {
  game.curWeapon = 'pistol';
  applyWeaponSkin('pistol');
  flashlight.distance = 24;
  flashlight.angle = Math.PI/5;
  flashlight.intensity = 1.4;
}

// le main gère la touche 4 — il a besoin du slot actuel
export function meleeSlotName() { return game.meleeSlot; }
