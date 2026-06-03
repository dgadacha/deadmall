import * as THREE from 'three';
import { renderer, scene, camera, maybeResize } from './renderer.js';
import { State, game, player, wave, resetState } from './state.js';
import { PERK_REGEN_DELAY, PERK_REGEN_RATE } from './config.js';
import { initAudio, sfx } from './audio.js';
import {
  updateHUD, showHud, showScreen, hideScreens,
  updateLowHpVignette, updatePrompt, banner,
} from './hud.js';
import {
  updateWorld, buyStations, endBlackout,
  switchToZone, getZone, setTransitionHandler, setActionHandlers,
} from './world.js';
import { controls, initInput, updatePlayer, updateShake } from './player.js';
import {
  shoot, startReload, switchWeapon, giveWeapon, refillAmmo,
  applyMedkit, applyArmor, unlockRegen, unlockNightVision, unlockLight,
  updateWeapons, resetWeapons,
} from './weapons.js';
import {
  startWave, updateZombies, updateWaves, clearZombies, prepareZoneTransition,
} from './enemies.js';
import { updateEffects, clearEffects } from './effects.js';

// =============================================================================
//  TRANSITION DE ZONE
// =============================================================================
function transitionToZone(id) {
  const target = getZone(id);
  if (!target) { sfx.nope(); return; }
  prepareZoneTransition();
  switchToZone(id);
  camera.position.copy(target.playerSpawn);
  banner(`ENTERING ${target.name}`);
}

// Wire les handlers vers world.js (achats des bornes)
setTransitionHandler(transitionToZone);
setActionHandlers({
  giveWeapon,
  refillAmmo,
  medkit:      applyMedkit,
  armor:       applyArmor,
  regen:       unlockRegen,
  nightVision: unlockNightVision,
  lightUp:     unlockLight,
});

// Spawn initial : caméra placée dans le Security Office
camera.position.copy(getZone('sec_office').playerSpawn);

// =============================================================================
//  PROMPT DE BORNES
// =============================================================================
let nearStation = null;
function refreshNearStation() {
  nearStation = null;
  let best = 4.0;
  for (const s of buyStations) {
    if (s.zone !== game.currentZone) continue;
    const d = camera.position.distanceTo(s.pos);
    if (d < best) { best = d; nearStation = s; }
  }
}
function tryBuy() {
  if (!nearStation) return;
  if (player.money < nearStation.cost) { sfx.nope(); return; }
  player.money -= nearStation.cost;
  nearStation.action();
  sfx.buy();
  updateHUD();
}

// =============================================================================
//  INPUT
// =============================================================================
initInput({
  reload:   startReload,
  switchTo: switchWeapon,
  tryBuy,
  shoot,
});

// =============================================================================
//  POINTER LOCK
// =============================================================================
controls.addEventListener('lock', () => {
  initAudio();
  if      (game.state === State.MENU)  startRun();
  else if (game.state === State.PAUSE) game.state = State.PLAY;
  showHud(); hideScreens();
});
controls.addEventListener('unlock', () => {
  if (game.state === State.PLAY) {
    game.state = State.PAUSE;
    showScreen('pause');
  }
});

['menu', 'pause', 'gameover'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => {
    if (id === 'gameover') resetRun();
    controls.lock();
  });
});

function startRun() {
  game.state = State.PLAY;
  startWave(1);
}
function resetRun() {
  clearZombies();
  clearEffects();
  resetState();
  resetWeapons();
  endBlackout();
  switchToZone('sec_office');
  camera.position.copy(getZone('sec_office').playerSpawn);
  game.state = State.PLAY;
  startWave(1);
  updateHUD();
}
function gameOver() {
  game.state = State.OVER;
  document.getElementById('go-stats').innerHTML =
    `WAVE REACHED <span class="big-num">${wave.num}</span><br/>` +
    `ZOMBIES KILLED <span class="big-num">${player.kills}</span><br/>` +
    `MONEY <span class="big-num">$${player.money}</span>`;
  controls.unlock();
  showScreen('gameover');
}

// =============================================================================
//  HORREUR + PERK REGEN
// =============================================================================
let heartCd = 0;
let gruntCd = 8;
function updateAmbient(dt) {
  if (game.state !== State.PLAY) return;
  if (player.hp < 60) {
    heartCd -= dt;
    if (heartCd <= 0) {
      sfx.heart();
      const hpRatio = Math.max(0.05, player.hp / 100);
      heartCd = 0.4 + hpRatio * 0.7;
    }
  } else { heartCd = 0; }
  gruntCd -= dt;
  if (gruntCd <= 0) {
    sfx.distantGrunt();
    gruntCd = 5 + Math.random() * 9;
  }
}

function updateRegen(dt) {
  if (!player.perks.regen) return;
  if (player.hp >= 100) return;
  const now = performance.now() / 1000;
  if (now - player.lastDamageTime < PERK_REGEN_DELAY) return;
  player.hp = Math.min(100, player.hp + PERK_REGEN_RATE * dt);
}

// =============================================================================
//  BOUCLE PRINCIPALE
// =============================================================================
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  maybeResize();

  if (game.state === State.PLAY) {
    updatePlayer(dt);
    const dead = updateZombies(dt);
    updateWaves(dt);
    updateWeapons(dt);
    updateWorld(dt);
    updateEffects(dt);
    updateRegen(dt);
    refreshNearStation();
    updatePrompt(nearStation);
    updateLowHpVignette();
    updateAmbient(dt);
    if (dead) gameOver();
  } else {
    updateLowHpVignette();
  }
  updateShake(dt);
  renderer.render(scene, camera);
}
loop();
updateHUD();
