import * as THREE from 'three';
import { scene, camera } from './renderer.js';
import { REWARD_BODY, REWARD_HEAD_BONUS } from './config.js';
import { State, game, player, wave } from './state.js';
import { burst, bloodPool } from './effects.js';
import { sfx } from './audio.js';
import { toast, updateHUD, dmgFlash, banner } from './hud.js';
import { applyCameraShake, damagePlayer } from './player.js';
import { resolveCollision, triggerBlackout, getZombieSpawns, getCurrentZone } from './world.js';

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

  // === PALETTE CADAVRE (4 teintes de peau morte) ===
  const skinPalettes = [
    // gris-vert mort
    [120, 30, 150, 30, 110, 25],
    // gris pourri sale
    [110, 30, 115, 25, 105, 20],
    // jaunâtre malade
    [170, 25, 160, 20, 115, 25],
    // bleu-violacé livide
    [125, 25, 135, 25, 155, 30],
  ];
  const p = skinPalettes[Math.floor(Math.random() * skinPalettes.length)];
  const skin = new THREE.Color(
    `rgb(${p[0] + Math.floor(Math.random()*p[1])},${p[2] + Math.floor(Math.random()*p[3])},${p[4] + Math.floor(Math.random()*p[5])})`
  );
  const cloth = new THREE.Color(
    `rgb(${20 + Math.floor(Math.random()*25)},${20 + Math.floor(Math.random()*25)},${30 + Math.floor(Math.random()*35)})`
  );
  const hairColor = [0x14100a, 0x261c10, 0x3a2a18, 0x5a4520, 0x707070][Math.floor(Math.random()*5)];

  // === VARIATIONS MORPHO ===
  const roll = Math.random();
  const isFat   = roll < 0.18;
  const isThin  = !isFat && roll < 0.30;
  const isBald  = Math.random() < 0.15;
  const hasRedEyes = Math.random() < 0.40;

  const skinMat  = new THREE.MeshLambertMaterial({ color: skin,  flatShading: true });
  const torsoMat = new THREE.MeshLambertMaterial({ map: bloodyTorsoTex(), flatShading: true });
  const clothMat = new THREE.MeshLambertMaterial({ color: cloth, flatShading: true });
  const shoeMat  = new THREE.MeshLambertMaterial({ color: 0x18181c, flatShading: true });
  const hairMat  = new THREE.MeshLambertMaterial({ color: hairColor, flatShading: true });
  const eyeMat   = new THREE.MeshBasicMaterial({ color: hasRedEyes ? 0xaa1010 : 0xfafaf0 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x140000 });
  const bloodMat = new THREE.MeshBasicMaterial({ color: 0x8a0010 });
  const toothMat = new THREE.MeshBasicMaterial({ color: 0xc8b894 });
  const boneMat  = new THREE.MeshLambertMaterial({ color: 0xe0d8c0, flatShading: true });

  // === TORSE — voûté en avant ===
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.32), torsoMat);
  torso.position.y = 1.15;
  torso.rotation.x = -0.14 - Math.random() * 0.1;   // posture voûtée
  g.add(torso);

  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.32), torsoMat);
  collar.position.y = 1.5;
  g.add(collar);

  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), clothMat);
  hip.position.y = 0.78;
  g.add(hip);

  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), skinMat);
  neck.position.y = 1.55;
  neck.rotation.z = (Math.random() - 0.5) * 0.3;   // cou tordu
  g.add(neck);

  // === TÊTE — déformée, regard baissé ===
  const headGroup = new THREE.Group();

  const headBase = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skinMat);
  headBase.scale.set(1, 0.92 + Math.random()*0.12, 1.05);   // léger flatten asymétrique
  headGroup.add(headBase);

  // yeux (sclera + pupille) ; sclera rouge sang dans 40% des cas
  const eyeGeo = new THREE.BoxGeometry(0.07, 0.05, 0.04);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.085, 0.02, 0.19); headGroup.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set( 0.085, 0.02, 0.19); headGroup.add(eyeR);
  const pupilGeo = new THREE.BoxGeometry(0.024, 0.024, 0.015);
  const pupilL = new THREE.Mesh(pupilGeo, pupilMat); pupilL.position.set(-0.085, 0.02, 0.215); headGroup.add(pupilL);
  const pupilR = new THREE.Mesh(pupilGeo, pupilMat); pupilR.position.set( 0.085, 0.02, 0.215); headGroup.add(pupilR);

  // larmes de sang sous les yeux (très créépy)
  if (Math.random() < 0.65) {
    const tearL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.04), bloodMat);
    tearL.position.set(-0.085, -0.06, 0.195); headGroup.add(tearL);
  }
  if (Math.random() < 0.45) {
    const tearR = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.04), bloodMat);
    tearR.position.set( 0.085, -0.045, 0.195); headGroup.add(tearR);
  }

  // bouche large déchirée + dents apparentes
  const mouthW = 0.22, mouthH = 0.1;
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(mouthW, mouthH, 0.04), mouthMat);
  mouth.position.set(0, -0.11, 0.19);
  headGroup.add(mouth);
  const teethCount = 4 + Math.floor(Math.random() * 3);
  for (let t = 0; t < teethCount; t++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.04, 0.025), toothMat);
    const u = teethCount === 1 ? 0 : t / (teethCount - 1);
    tooth.position.set(-mouthW/2 + 0.03 + u * (mouthW - 0.06), -0.085, 0.205);
    headGroup.add(tooth);
  }
  // mâchoire qui pend (50%)
  if (Math.random() < 0.5) {
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.1), skinMat);
    jaw.position.set(0, -0.21, 0.16);
    jaw.rotation.x = 0.35;
    headGroup.add(jaw);
  }
  // dégoulinement sang sous la bouche
  const drip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.04), bloodMat);
  drip.position.set(0.02 + (Math.random() - 0.5) * 0.05, -0.24, 0.19);
  headGroup.add(drip);

  // cheveux ébouriffés OU crâne nu avec plaie
  if (!isBald) {
    const hair = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), hairMat);
    hair.position.set(0, 0.16, -0.02);
    hair.scale.set(1, 0.55, 0.95);
    hair.rotation.set(
      (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.3,
    );
    headGroup.add(hair);
  } else {
    // crâne visible : plaie sanglante sur le dessus
    const wound = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.06), bloodMat);
    wound.position.set(0, 0.14, 0.05);
    wound.rotation.z = (Math.random() - 0.5) * 0.4;
    headGroup.add(wound);
    // veines marquées
    const vein = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.02), bloodMat);
    vein.position.set(-0.1, 0.1, 0.16);
    headGroup.add(vein);
  }

  // posture tête : tordue, baissée, légèrement tournée
  headGroup.position.y = 1.78;
  const headRestZ = (Math.random() - 0.5) * 0.4;
  const headRestY = (Math.random() - 0.5) * 0.3;
  const headRestX = -0.08 - Math.random() * 0.18;   // baissée → regard au sol
  headGroup.rotation.z = headRestZ;
  headGroup.rotation.y = headRestY;
  headGroup.rotation.x = headRestX;
  g.add(headGroup);

  // === BRAS asymétriques (un plus haut, l'autre plus tendu) ===
  function makeArm(sign, restAngle, sideTwist, foreBend) {
    const grp = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), skinMat);
    upper.position.set(0, -0.16, 0); grp.add(upper);
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.14), skinMat);
    fore.position.set(0, -0.48, 0.03);
    fore.rotation.x = foreBend;
    grp.add(fore);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.1), skinMat);
    hand.position.set(0, -0.72, 0.05); grp.add(hand);
    // sang sur la main
    const handBlood = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.12), bloodMat);
    handBlood.position.set(0, -0.78, 0.05); grp.add(handBlood);
    // os qui dépasse (25%)
    if (Math.random() < 0.25) {
      const bone = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), boneMat);
      bone.position.set(0.07, -0.35, 0.08);
      bone.rotation.z = 0.3;
      grp.add(bone);
    }
    grp.position.set(sign * 0.38, 1.4, 0);
    grp.rotation.x = restAngle;
    grp.rotation.z = sign * sideTwist;
    return grp;
  }
  // bras gauche un peu plus levé, droit plus pendant
  const armL = makeArm(-1, -0.95 - Math.random() * 0.25, 0.35,  0.2);
  const armR = makeArm( 1, -1.15 - Math.random() * 0.25, 0.15, -0.15);
  g.add(armL); g.add(armR);

  // === JAMBES (cuisse + tibia + chaussure) légèrement asymétriques ===
  function makeLeg(sign, hipAngle) {
    const grp = new THREE.Group();
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.2), clothMat);
    thigh.position.set(0, -0.2, 0); grp.add(thigh);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.18), clothMat);
    shin.position.set(0, -0.6, 0);
    shin.rotation.x = sign * 0.06;
    grp.add(shin);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.32), shoeMat);
    shoe.position.set(0, -0.86, 0.05); grp.add(shoe);
    grp.position.set(sign * 0.13, 0.7, 0);
    grp.rotation.x = hipAngle;
    return grp;
  }
  const legL = makeLeg(-1,  0.04);
  const legR = makeLeg( 1, -0.04);
  g.add(legL); g.add(legR);

  // === userData ===
  g.traverse(m => {
    if (m.isMesh) { m.userData.zombie = null; m.userData.part = 'body'; }
  });
  headGroup.traverse(m => {
    if (m.isMesh) m.userData.part = 'head';
  });

  // morpho : scale global → ajuste taille + collision via Three
  const morphoScale = isFat ? 1.25 : (isThin ? 0.86 : 1.0);
  g.scale.setScalar(morphoScale);

  g.userData = {
    hp: 100 * (isFat ? 1.4 : (isThin ? 0.78 : 1)),
    speed: 1.6 * (isFat ? 0.7 : (isThin ? 1.4 : 1)),
    attackCd: 0,
    phase: Math.random() * 6.28,
    twitchCd: 1 + Math.random() * 2.5,
    twitchAmount: 0,
    legL, legR, armL, armR, head: headGroup, torso,
    headRestX, headRestY, headRestZ,
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
  if (!spawns || spawns.length === 0) return;
  const zone = getCurrentZone();
  if (!zone) return;
  // pick spawn loin du joueur (en world coords, donc + offset zone)
  let chosen = spawns[Math.floor(Math.random() * spawns.length)];
  let best = -1;
  for (let attempt = 0; attempt < 4; attempt++) {
    const cand = spawns[Math.floor(Math.random() * spawns.length)];
    const wx = cand.x + zone.baseX, wz = cand.z + zone.baseZ;
    const d = dist2(wx, wz, camera.position.x, camera.position.z);
    if (d > best) { best = d; chosen = cand; }
  }
  // jitter
  const jx = (Math.random() - 0.5) * 1.4;
  const jz = (Math.random() - 0.5) * 1.4;
  // POSITION EN WORLD COORDS — le zombie va direct au scene, pas au group de zone
  z.position.set(
    chosen.x + jx + zone.baseX,
    zone.baseY,
    chosen.z + jz + zone.baseZ,
  );
  z.userData.hp = 100 + waveNum * 16;
  z.userData.speed = Math.min(1.5 + waveNum * 0.09, 3.4) * (0.85 + Math.random() * 0.3);
  z.userData.baseY = zone.baseY;     // pour l'anim cadavre
  setZombieRef(z);
  scene.add(z);                       // direct sur scene, en world
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
      z.position.y = (u.baseY ?? 0) - fall * 0.05;
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

    // --- anim marche (claudicante + asymétrique) ---
    u.phase += dt * u.speed * 3;
    const sw = Math.sin(u.phase) * 0.5;
    // une jambe plus rigide que l'autre (claudication)
    u.legL.rotation.x =  sw * 1.1 + 0.04;
    u.legR.rotation.x = -sw * 0.8 - 0.04;
    // bras qui ballottent à hauteurs différentes
    u.armL.rotation.x = -0.95 + Math.sin(u.phase)         * 0.18;
    u.armR.rotation.x = -1.15 - Math.sin(u.phase + 0.8)   * 0.15;

    // --- tête : sway créépy permanent + twitch périodique ---
    u.twitchCd -= dt;
    if (u.twitchCd <= 0) {
      u.twitchAmount = 0.35 + Math.random() * 0.25;
      u.twitchCd = 1.8 + Math.random() * 3.5;
    }
    if (u.twitchAmount > 0) {
      u.twitchAmount = Math.max(0, u.twitchAmount - dt * 2.2);
      // tête qui spasme rapidement
      u.head.rotation.z = u.headRestZ + Math.sin(u.phase * 28) * u.twitchAmount * 0.6;
      u.head.rotation.y = u.headRestY + Math.cos(u.phase * 22) * u.twitchAmount * 0.4;
    } else {
      // balancement subtil constant (respiration cadavre)
      u.head.rotation.z = u.headRestZ + Math.sin(u.phase * 0.4) * 0.05;
      u.head.rotation.y = u.headRestY + Math.cos(u.phase * 0.3) * 0.06;
    }

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
