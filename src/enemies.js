import * as THREE from 'three';
import { scene, camera } from './renderer.js';
import { REWARD_BODY, REWARD_HEAD_BONUS } from './config.js';
import { State, game, player, wave } from './state.js';
import { burst, bloodPool } from './effects.js';
import { sfx } from './audio.js';
import { toast, updateHUD, dmgFlash, banner } from './hud.js';
import { applyCameraShake, damagePlayer } from './player.js';
import { resolveCollision, triggerBlackout, getZombieSpawns, currentZoneGroup } from './world.js';

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
  // peau vert vif saturé
  const skin = new THREE.Color(
    `rgb(${110 + Math.floor(Math.random()*45)},${175 + Math.floor(Math.random()*45)},${50 + Math.floor(Math.random()*40)})`
  );
  // pantalon : sombre
  const cloth = new THREE.Color(
    `rgb(${30 + Math.floor(Math.random()*30)},${35 + Math.floor(Math.random()*30)},${55 + Math.floor(Math.random()*40)})`
  );
  const hairColor = [0x18120c, 0x2a1f12, 0x3a2f18, 0x5a4520][Math.floor(Math.random()*4)];

  const skinMat  = new THREE.MeshLambertMaterial({ color: skin,  flatShading: true });
  const torsoMat = new THREE.MeshLambertMaterial({ map: bloodyTorsoTex(), flatShading: true });
  const clothMat = new THREE.MeshLambertMaterial({ color: cloth, flatShading: true });
  const shoeMat  = new THREE.MeshLambertMaterial({ color: 0x18181c, flatShading: true });
  const hairMat  = new THREE.MeshLambertMaterial({ color: hairColor, flatShading: true });
  const eyeMat   = new THREE.MeshBasicMaterial({ color: 0xfafaf0 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x2a0000 });
  const bloodMat = new THREE.MeshBasicMaterial({ color: 0x7a0008 });

  // === TORSE ===
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.32), torsoMat);
  torso.position.y = 1.15; g.add(torso);

  // col chemise (déchirée)
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.32), torsoMat);
  collar.position.y = 1.5; g.add(collar);

  // hanche (pantalon en haut)
  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), clothMat);
  hip.position.y = 0.78; g.add(hip);

  // cou
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), skinMat);
  neck.position.y = 1.55; g.add(neck);

  // === TÊTE (groupe avec yeux/bouche/cheveux) ===
  const headGroup = new THREE.Group();
  const headBase = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skinMat);
  headGroup.add(headBase);
  // yeux
  const eyeGeo = new THREE.BoxGeometry(0.06, 0.05, 0.04);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.08, 0.02, 0.19); headGroup.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set( 0.08, 0.02, 0.19); headGroup.add(eyeR);
  const pupilGeo = new THREE.BoxGeometry(0.025, 0.025, 0.015);
  const pupilL = new THREE.Mesh(pupilGeo, pupilMat); pupilL.position.set(-0.08, 0.02, 0.215); headGroup.add(pupilL);
  const pupilR = new THREE.Mesh(pupilGeo, pupilMat); pupilR.position.set( 0.08, 0.02, 0.215); headGroup.add(pupilR);
  // bouche ouverte
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.04), mouthMat);
  mouth.position.set(0, -0.09, 0.19); headGroup.add(mouth);
  // dégoulinement sang sous la bouche
  const drip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.04), bloodMat);
  drip.position.set(0.04, -0.18, 0.19); headGroup.add(drip);
  // cheveux en désordre
  const hair = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), hairMat);
  hair.position.set(0, 0.16, -0.02); hair.scale.set(1, 0.55, 0.95);
  headGroup.add(hair);
  // oreille gauche déchirée (icosaèdre déformé)
  if (Math.random() < 0.5) {
    const ear = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.1, 0.06),
      skinMat
    );
    ear.position.set(-0.2, 0, 0.02); headGroup.add(ear);
  }
  headGroup.position.y = 1.78;
  g.add(headGroup);

  // === BRAS (épaule + avant-bras + main, pendants devant) ===
  function makeArm(sign) {
    const grp = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), skinMat);
    upper.position.set(0, -0.16, 0); grp.add(upper);
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.14), skinMat);
    fore.position.set(0, -0.48, 0.03); grp.add(fore);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.1), skinMat);
    hand.position.set(0, -0.72, 0.05); grp.add(hand);
    // sang sur les mains
    const handBlood = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.12), bloodMat);
    handBlood.position.set(0, -0.78, 0.05); grp.add(handBlood);
    grp.position.set(sign * 0.38, 1.4, 0);
    grp.rotation.x = -1.1;
    return grp;
  }
  const armL = makeArm(-1); g.add(armL);
  const armR = makeArm( 1); g.add(armR);

  // === JAMBES (cuisse + tibia + chaussure) ===
  function makeLeg(sign) {
    const grp = new THREE.Group();
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.2), clothMat);
    thigh.position.set(0, -0.2, 0); grp.add(thigh);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.18), clothMat);
    shin.position.set(0, -0.6, 0); grp.add(shin);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.32), shoeMat);
    shoe.position.set(0, -0.86, 0.05); grp.add(shoe);
    grp.position.set(sign * 0.13, 0.7, 0);
    return grp;
  }
  const legL = makeLeg(-1); g.add(legL);
  const legR = makeLeg( 1); g.add(legR);

  // === userData ===
  // tous les meshes : part='body' par défaut, sauf la tête
  g.traverse(m => {
    if (m.isMesh) { m.userData.zombie = null; m.userData.part = 'body'; }
  });
  headGroup.traverse(m => {
    if (m.isMesh) m.userData.part = 'head';
  });

  g.userData = {
    hp: 100, speed: 1.6, attackCd: 0,
    phase: Math.random() * 6.28,
    legL, legR, armL, armR, head: headGroup, torso,
    torsoMat, skinMat, clothMat,
    alive: true, flash: 0,
    deathTime: 0, deathDur: 0, deathAxis: 'x',
  };
  return g;
}

function setZombieRef(z) {
  z.traverse(m => { if (m.isMesh) m.userData.zombie = z; });
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx*dx + dz*dz;
}

export function spawnZombie(waveNum) {
  const z = makeZombie();
  const spawns = getZombieSpawns();
  if (!spawns || spawns.length === 0) return;   // pas de spawn dispo dans cette zone
  // pick un spawn point loin du joueur (au possible)
  let chosen = spawns[Math.floor(Math.random() * spawns.length)];
  let best = -1;
  for (let attempt = 0; attempt < 4; attempt++) {
    const cand = spawns[Math.floor(Math.random() * spawns.length)];
    const d = dist2(cand.x, cand.z, camera.position.x, camera.position.z);
    if (d > best) { best = d; chosen = cand; }
  }
  // jitter pour éviter chevauchement
  const jx = (Math.random() - 0.5) * 1.4;
  const jz = (Math.random() - 0.5) * 1.4;
  z.position.set(chosen.x + jx, 0, chosen.z + jz);
  z.userData.hp = 100 + waveNum * 16;
  z.userData.speed = Math.min(1.5 + waveNum * 0.09, 3.4) * (0.85 + Math.random() * 0.3);
  setZombieRef(z);
  currentZoneGroup().add(z);
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
  const reward = head ? (REWARD_BODY + REWARD_HEAD_BONUS) : REWARD_BODY;
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
        z.removeFromParent();
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
      damagePlayer(9 + wave.num * 0.6);
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
  wave.respawnFast = 0;
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
        if (wave.respawnFast > 0) {
          wave.respawnFast--;
          wave.spawnTimer = 0.18;   // rafale post-transition (~2-4s au total)
        } else {
          wave.spawnTimer = Math.max(0.25, 1.0 - wave.num * 0.03);
        }
      }
    } else if (wave.alive <= 0) {
      wave.active = false;
      wave.intermission = 4;
      const bonus = 100 + wave.num * 20;
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
  for (const z of zombies) z.removeFromParent();
  zombies.length = 0;
}

// Préparation à un changement de zone : retire les zombies mais conserve le
// nombre restant à tuer pour que la nouvelle zone les respawn — progressivement.
export function prepareZoneTransition() {
  const remaining = Math.max(0, (wave.toSpawn - wave.spawned) + wave.alive);
  clearZombies();
  wave.alive = 0;
  wave.spawned = Math.max(0, wave.toSpawn - remaining);
  wave.spawnTimer = 0.8;        // délai initial pour que le joueur s'installe
  wave.respawnFast = remaining; // tous ces zombies vont respawn en rafale (~0.18s)
}
