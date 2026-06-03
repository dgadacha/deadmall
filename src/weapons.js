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
//  VIEWMODELS — un group pour les armes à feu, un autre pour la mêlée
// =============================================================================
const gunGroup = new THREE.Group();
const gunBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.18, 0.18, 0.7),
  new THREE.MeshLambertMaterial({ color: 0x2c2c36 })
);
const gunBarrel = new THREE.Mesh(
  new THREE.BoxGeometry(0.08, 0.08, 0.5),
  new THREE.MeshLambertMaterial({ color: 0x0a0a0d })
);
gunBarrel.position.set(0, 0.02, -0.5);
const gunGrip = new THREE.Mesh(
  new THREE.BoxGeometry(0.14, 0.3, 0.16),
  new THREE.MeshLambertMaterial({ color: 0x202028 })
);
gunGrip.position.set(0, -0.2, 0.2);
const gunSight = new THREE.Mesh(
  new THREE.BoxGeometry(0.04, 0.06, 0.04),
  new THREE.MeshLambertMaterial({ color: 0x444452 })
);
gunSight.position.set(0, 0.15, -0.2);
const gunMag = new THREE.Mesh(
  new THREE.BoxGeometry(0.12, 0.18, 0.14),
  new THREE.MeshLambertMaterial({ color: 0x16161c })
);
gunMag.position.set(0, -0.18, 0.2);
gunGroup.add(gunBody, gunBarrel, gunGrip, gunSight, gunMag);
gunGroup.position.set(0.32, -0.32, -0.7);
camera.add(gunGroup);

// muzzle flash
const muzzle = new THREE.Mesh(
  new THREE.PlaneGeometry(0.5, 0.5),
  new THREE.MeshBasicMaterial({
    color: 0xffd070, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  })
);
muzzle.position.set(0, 0.02, -0.85);
gunGroup.add(muzzle);
const muzzleLight = new THREE.PointLight(0xffcc66, 0, 10);
muzzleLight.position.copy(muzzle.position);
gunGroup.add(muzzleLight);

// =============================================================================
//  Viewmodel mêlée (BAT par défaut, swap matière pour AXE)
// =============================================================================
const meleeGroup = new THREE.Group();
const batShaft = new THREE.Mesh(
  new THREE.CylinderGeometry(0.05, 0.06, 0.9, 8),
  new THREE.MeshLambertMaterial({ color: 0x6a4a26 })
);
batShaft.rotation.x = Math.PI / 2;
batShaft.position.set(0, 0, -0.3);
const batHead = new THREE.Mesh(
  new THREE.CylinderGeometry(0.075, 0.08, 0.4, 8),
  new THREE.MeshLambertMaterial({ color: 0x9a7a4a })
);
batHead.rotation.x = Math.PI / 2;
batHead.position.set(0, 0, -0.75);
const meleeGrip = new THREE.Mesh(
  new THREE.BoxGeometry(0.08, 0.18, 0.08),
  new THREE.MeshLambertMaterial({ color: 0x1a1a1f })
);
meleeGrip.position.set(0, -0.05, 0.18);
// hache (tête triangulaire, cachée par défaut)
const axeHead = new THREE.Mesh(
  new THREE.BoxGeometry(0.36, 0.22, 0.08),
  new THREE.MeshLambertMaterial({ color: 0xa0a0a8 })
);
axeHead.position.set(0, 0, -0.7);
axeHead.visible = false;
meleeGroup.add(batShaft, batHead, meleeGrip, axeHead);
meleeGroup.position.set(0.35, -0.30, -0.55);
meleeGroup.rotation.z = -0.2;
meleeGroup.visible = false;
camera.add(meleeGroup);

// =============================================================================
//  TORCHE (SpotLight enfant de caméra, plus large/forte si lightUpgrade)
// =============================================================================
const flashlight = new THREE.SpotLight(0xfff2d0, 1.9, 30, Math.PI/5, 0.45, 1.0);
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
        const head = h.object.userData.part === 'head';
        const dmg = w.dmg * (head ? 2.4 : 1);
        damageZombie(z, dmg, h.point, head);
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
      const head = false;   // pas de headshot en mêlée pour cette v1
      const hitPoint = z.position.clone().setY(1.1);
      damageZombie(z, w.dmg, hitPoint, head);
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
    // BAT par défaut, AXE = tête triangulaire à la place
    const isAxe = name === 'axe';
    batHead.visible = !isAxe;
    axeHead.visible = isAxe;
    batShaft.material.color.setHex(isAxe ? 0x4a3018 : 0x6a4a26);
  } else {
    gunGroup.visible = true;
    meleeGroup.visible = false;
    if (name === 'shotgun') {
      gunBody.material.color.setHex(0x1a1a1f);
      gunBarrel.scale.z = 1.6;
    } else if (name === 'smg') {
      gunBody.material.color.setHex(0x161a22);
      gunBarrel.scale.z = 1.3;
    } else {
      gunBody.material.color.setHex(0x2c2c36);
      gunBarrel.scale.z = 1;
    }
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
  flashlight.distance = 30;
  flashlight.angle = Math.PI/5;
  flashlight.intensity = 1.9;
}

// le main gère la touche 4 — il a besoin du slot actuel
export function meleeSlotName() { return game.meleeSlot; }
