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
//  VIEWMODEL (pistolet — détaillé : body + barrel + grip + sight + magasin)
// =============================================================================
const gun = new THREE.Group();
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

gun.add(gunBody, gunBarrel, gunGrip, gunSight, gunMag);
gun.position.set(0.32, -0.32, -0.7);
camera.add(gun);

// muzzle flash (plane additif + point light)
const muzzle = new THREE.Mesh(
  new THREE.PlaneGeometry(0.5, 0.5),
  new THREE.MeshBasicMaterial({
    color: 0xffd070, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  })
);
muzzle.position.set(0, 0.02, -0.85);
gun.add(muzzle);
const muzzleLight = new THREE.PointLight(0xffcc66, 0, 10);
muzzleLight.position.copy(muzzle.position);
gun.add(muzzleLight);

// =============================================================================
//  TORCHE (SpotLight enfant de caméra, position légèrement tremblante)
// =============================================================================
const flashlight = new THREE.SpotLight(0xfff2d0, 1.9, 30, Math.PI/5, 0.45, 1.0);
flashlight.position.set(0.12, -0.1, 0);
const flashTarget = new THREE.Object3D();
flashTarget.position.set(0, 0, -1);
camera.add(flashlight); camera.add(flashTarget);
flashlight.target = flashTarget;

const raycaster = new THREE.Raycaster();

// =============================================================================
//  TIR
// =============================================================================
export function shoot() {
  if (game.state !== State.PLAY || game.reloading > 0 || game.fireCd > 0) return;
  const w = WEAPONS[game.curWeapon];
  const a = ammo[game.curWeapon];
  if (a.mag <= 0) { sfx.nope(); startReload(); return; }
  a.mag--;
  game.fireCd = w.fireDelay;
  game.curWeapon === 'shotgun' ? sfx.shotgun() : sfx.pistol();
  muzzle.material.opacity = 1;
  muzzleLight.intensity = 3;
  gun.userData.recoil = 1;

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
  updateHUD();
  if (a.mag <= 0) startReload();
}

export function startReload() {
  const w = WEAPONS[game.curWeapon];
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

export function switchWeapon(w) {
  if (!owned[w] || w === game.curWeapon || game.reloading > 0) return;
  game.curWeapon = w;
  // re-skin viewmodel : pompe = canon plus long et plus sombre
  gunBody.material.color.setHex(w === 'shotgun' ? 0x1a1a1f : 0x2c2c36);
  gunBarrel.scale.z = w === 'shotgun' ? 1.6 : 1;
  updateHUD();
}
export function giveWeapon(w) {
  owned[w] = true;
  if (w === 'shotgun' && ammo[w].reserve === 0) {
    ammo[w].mag = WEAPONS[w].mag; ammo[w].reserve = 24;
  }
  switchWeapon(w);
}
export function refillAmmo() {
  const a = ammo[game.curWeapon];
  if (a.reserve !== Infinity) a.reserve += WEAPONS[game.curWeapon].mag * 4;
  updateHUD();
}

export function updateWeapons(dt) {
  const t = performance.now() * 0.001;
  // bob (vertical + latéral subtil) + recul
  const sprint = isSprinting() ? 1.7 : 1;
  const moving = isMoving();
  const bobY = moving ? Math.sin(t*10*sprint)*0.012 : 0;
  const bobX = moving ? Math.cos(t*5 *sprint)*0.006 : 0;
  const recoil = gun.userData.recoil || 0;
  gun.position.set(0.32 + bobX, -0.32 + bobY - recoil*0.04, -0.7 + recoil*0.06);
  gun.rotation.x = recoil * 0.25;
  gun.userData.recoil = Math.max(0, recoil - dt*6);

  game.fireCd = Math.max(0, game.fireCd - dt);
  muzzle.material.opacity = Math.max(0, muzzle.material.opacity - dt*12);
  muzzleLight.intensity   = Math.max(0, muzzleLight.intensity   - dt*30);
  if (game.reloading > 0) {
    game.reloading -= dt;
    if (game.reloading <= 0) { game.reloading = 0; finishReload(); }
  }

  // tremblement de la torche (respirations) — plus fort à HP bas
  const tremble = 0.012 + (player.hp < 50 ? 0.025 : 0);
  flashlight.position.x = 0.12 + Math.sin(t*4.3) * tremble;
  flashlight.position.y = -0.1 + Math.cos(t*3.7) * tremble;
}

export function resetWeapons() {
  game.curWeapon = 'pistol';
  gunBody.material.color.setHex(0x2c2c36);
  gunBarrel.scale.z = 1;
}
