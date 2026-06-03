import * as THREE from 'three';
import { scene, camera } from './renderer.js';
import { ARENA } from './config.js';
import { State, game, player, wave } from './state.js';
import { burst, bloodPool } from './effects.js';
import { sfx } from './audio.js';
import { hitmark, toast, updateHUD, dmgFlash, banner } from './hud.js';
import { applyCameraShake } from './player.js';
import { resolveCollision, triggerBlackout } from './world.js';

const zombies = [];
const ZHEAD = 1.55;

// =============================================================================
//  CRÉATION
// =============================================================================

// Texture procédurale pour le torse — t-shirt/polo crasseux + éclaboussures violentes
function bloodyTorsoTex() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  // base : tissu clair crasseux (blanc/beige/bleu pâle), pas sombre
  const tones = [
    [220, 220, 215],  // blanc cassé
    [200, 195, 180],  // beige sale
    [180, 195, 210],  // bleu pâle
    [210, 200, 195],  // crème
  ];
  const [tr, tg, tb] = tones[Math.floor(Math.random() * tones.length)];
  g.fillStyle = `rgb(${tr + Math.floor(Math.random()*15-7)},${tg + Math.floor(Math.random()*15-7)},${tb + Math.floor(Math.random()*15-7)})`;
  g.fillRect(0, 0, 32, 32);
  // crasse subtile
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(50,40,30,${0.1 + Math.random()*0.18})`;
    g.beginPath(); g.arc(Math.random()*32, Math.random()*32, 1 + Math.random()*4, 0, 7); g.fill();
  }
  // taches sang VIOLENTES
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(${110 + Math.random()*45},0,${Math.random()*18},${0.65 + Math.random()*0.35})`;
    const x = Math.random()*32, y = Math.random()*32, rad = 2 + Math.random()*7;
    g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
  }
  // grosse coulée de sang centrale
  g.fillStyle = `rgba(125,0,10,0.85)`;
  g.beginPath(); g.arc(16, 14, 5, 0, 7); g.fill();
  g.beginPath(); g.arc(14, 20, 3, 0, 7); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  return tex;
}

function makeZombie() {
  const g = new THREE.Group();
  // peau vert vif saturé (lime/toxique) — bien plus visible que le vert sombre
  const skin = new THREE.Color(
    `rgb(${110 + Math.floor(Math.random()*45)},${175 + Math.floor(Math.random()*45)},${50 + Math.floor(Math.random()*40)})`
  );
  // pantalon : sombre (gris/bleu jean)
  const cloth = new THREE.Color(
    `rgb(${30 + Math.floor(Math.random()*30)},${35 + Math.floor(Math.random()*30)},${55 + Math.floor(Math.random()*40)})`
  );

  const skinMat  = new THREE.MeshLambertMaterial({ color: skin,  flatShading: true });
  const torsoMat = new THREE.MeshLambertMaterial({ map: bloodyTorsoTex(), flatShading: true });
  const clothMat = new THREE.MeshLambertMaterial({ color: cloth, flatShading: true });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.34), torsoMat);
  torso.position.y = 1.0; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skinMat);
  head.position.y = ZHEAD; g.add(head);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), skinMat);
  armL.position.set(-0.42, 1.05, -0.18); armL.rotation.x = -1.2; g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), clothMat);
  legL.position.set(-0.16, 0.35, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);

  g.children.forEach(m => { m.userData.zombie = null; m.userData.part = 'body'; });
  head.userData.part = 'head';

  g.userData = {
    hp: 100, speed: 1.6, attackCd: 0,
    phase: Math.random() * 6.28,
    legL, legR, armL, armR, head, torso,
    torsoMat, skinMat, clothMat,
    alive: true, flash: 0,
    deathTime: 0, deathDur: 0, deathAxis: 'x',
  };
  return g;
}

function setZombieRef(z) {
  z.children.forEach(m => m.userData.zombie = z);
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx*dx + dz*dz;
}

export function spawnZombie(waveNum) {
  const z = makeZombie();
  let x, zz, tries = 0;
  do {
    const edge = Math.floor(Math.random() * 4);
    const t = (Math.random()*2 - 1) * (ARENA - 2);
    if (edge === 0)      { x = -ARENA + 2; zz = t; }
    else if (edge === 1) { x =  ARENA - 2; zz = t; }
    else if (edge === 2) { x = t; zz = -ARENA + 2; }
    else                 { x = t; zz =  ARENA - 2; }
    tries++;
  } while (dist2(x, zz, camera.position.x, camera.position.z) < 144 && tries < 10);
  z.position.set(x, 0, zz);
  z.userData.hp = 100 + waveNum * 16;
  z.userData.speed = Math.min(1.5 + waveNum * 0.09, 3.4) * (0.85 + Math.random() * 0.3);
  setZombieRef(z);
  scene.add(z);
  zombies.push(z);
}

export function damageZombie(z, dmg, point, head) {
  z.userData.hp -= dmg;
  z.userData.flash = 0.08;
  burst(point, 0x8a0000, head ? 10 : 6, 4);
  sfx.hit();
  if (z.userData.hp <= 0) killZombie(z, head);
}

function killZombie(z, head) {
  z.userData.alive = false;
  z.userData.deathTime = 0;
  z.userData.deathDur = 10 + Math.random() * 4;
  z.userData.deathAxis = Math.random() < 0.5 ? 'x' : 'z';
  const reward = head ? 15 : 10;
  player.money += reward;
  player.kills++;
  wave.alive--;
  toast(`+$${reward}${head ? ' ☠' : ''}`);
  burst(z.position.clone().setY(1), 0x8a0000, 14, 5);
  bloodPool(z.position);
  sfx.zdeath();
  updateHUD();
}

export function getAliveZombies() {
  return zombies.filter(z => z.userData.alive);
}

// =============================================================================
//  UPDATE (mouvement + attaque + cadavres qui tombent et fondent)
// =============================================================================
export function updateZombies(dt) {
  const px = camera.position.x, pz = camera.position.z;
  let gameover = false;

  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    const u = z.userData;

    // --- cadavre ---
    if (!u.alive) {
      u.deathTime += dt;
      const fall = Math.min(u.deathTime / 0.45, 1);
      if (u.deathAxis === 'x') z.rotation.x = -Math.PI/2 * fall;
      else                     z.rotation.z = -Math.PI/2 * fall;
      z.position.y = -fall * 0.05;
      if (u.deathTime > u.deathDur - 1.5) {
        const a = Math.max(0, 1 - (u.deathTime - (u.deathDur - 1.5)) / 1.5);
        z.traverse(c => {
          if (c.material) {
            c.material.transparent = true;
            c.material.opacity = a;
          }
        });
      }
      if (u.deathTime > u.deathDur) {
        scene.remove(z);
        zombies.splice(i, 1);
      }
      continue;
    }

    // --- mouvement ---
    let dx = px - z.position.x, dz_ = pz - z.position.z;
    const d = Math.hypot(dx, dz_) || 1;
    dx /= d; dz_ /= d;

    // séparation des vivants seulement
    let sx = 0, sz = 0;
    for (const o of zombies) {
      if (o === z || !o.userData.alive) continue;
      const ox = z.position.x - o.position.x;
      const oz = z.position.z - o.position.z;
      const od = ox*ox + oz*oz;
      if (od > 0.001 && od < 1.6) {
        const f = 1 / od;
        sx += ox * f; sz += oz * f;
      }
    }
    const sl = Math.hypot(sx, sz) || 1;
    sx /= sl; sz /= sl;
    const mvx = dx + sx * 0.5, mvz = dz_ + sz * 0.5;
    const ml = Math.hypot(mvx, mvz) || 1;
    z.position.x += (mvx / ml) * u.speed * dt;
    z.position.z += (mvz / ml) * u.speed * dt;
    resolveCollision(z.position, 0.4);
    z.rotation.y = Math.atan2(dx, dz_);

    // --- anim marche ---
    u.phase += dt * u.speed * 3;
    const sw = Math.sin(u.phase) * 0.5;
    u.legL.rotation.x = sw;          u.legR.rotation.x = -sw;
    u.armL.rotation.x = -1.2 + Math.sin(u.phase) * 0.2;
    u.armR.rotation.x = -1.2 - Math.sin(u.phase) * 0.2;

    // --- flash hit ---
    if (u.flash > 0) {
      u.flash -= dt;
      const on = u.flash > 0;
      u.torsoMat.emissive.setHex(on ? 0x550000 : 0x000000);
      u.skinMat.emissive.setHex (on ? 0x550000 : 0x000000);
      u.clothMat.emissive.setHex(on ? 0x550000 : 0x000000);
    }

    // --- attaque ---
    u.attackCd = Math.max(0, u.attackCd - dt);
    if (d < 1.4 && u.attackCd <= 0) {
      u.attackCd = 1.0;
      player.hp -= 9 + wave.num * 0.6;
      dmgFlash();
      sfx.hurt();
      applyCameraShake(0.55);
      updateHUD();
      if (player.hp <= 0) { gameover = true; }
    }
  }
  return gameover;
}

// =============================================================================
//  VAGUES
// =============================================================================
export function startWave(n) {
  wave.num = n;
  wave.toSpawn = 4 + n * 3;
  wave.spawned = 0;
  wave.alive = 0;
  wave.spawnTimer = 0;
  wave.active = true;
  banner(`WAVE ${n}`);
  sfx.wave();
  if (n >= 3 && n % 3 === 0) {
    triggerBlackout();
    sfx.blackout();
    setTimeout(() => banner('⚠ BLACKOUT ⚠'), 80);
  }
  updateHUD();
}

export function updateWaves(dt) {
  if (wave.active) {
    if (wave.spawned < wave.toSpawn) {
      wave.spawnTimer -= dt;
      const maxAlive = Math.min(wave.toSpawn, 22);
      const aliveCount = zombies.reduce((n, z) => n + (z.userData.alive ? 1 : 0), 0);
      if (wave.spawnTimer <= 0 && aliveCount < maxAlive) {
        spawnZombie(wave.num);
        wave.spawned++;
        wave.alive++;
        wave.spawnTimer = Math.max(0.25, 1.0 - wave.num * 0.03);
      }
    } else if (wave.alive <= 0) {
      wave.active = false;
      wave.intermission = 4;
      const bonus = 50 + wave.num * 10;
      player.money += bonus;
      toast(`WAVE ${wave.num} CLEARED  +$${bonus}`);
      updateHUD();
    }
  } else if (game.state === State.PLAY) {
    wave.intermission -= dt;
    if (wave.intermission <= 0) startWave(wave.num + 1);
  }
}

export function clearZombies() {
  for (const z of zombies) scene.remove(z);
  zombies.length = 0;
}
