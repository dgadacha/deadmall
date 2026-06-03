import * as THREE from 'three';
import { renderer, scene, camera, maybeResize } from './renderer.js';
import { State, game, player, wave, resetState } from './state.js';
import { initAudio, sfx } from './audio.js';
import {
  updateHUD, showHud, showScreen, hideScreens,
  updateLowHpVignette, updatePrompt, banner,
} from './hud.js';
import {
  updateWorld, buyStations, endBlackout,
  switchToZone, getZone, setTransitionHandler, setWeaponHandlers,
} from './world.js';
import { controls, initInput, updatePlayer, updateShake } from './player.js';
import {
  shoot, startReload, switchWeapon, giveWeapon, refillAmmo,
  updateWeapons, resetWeapons,
} from './weapons.js';
import {
  startWave, updateZombies, updateWaves, clearZombies, prepareZoneTransition,
} from './enemies.js';
import { updateEffects, clearEffects } from './effects.js';

// =============================================================================
//  TRANSITION DE ZONE — orchestré ici car touche plusieurs systèmes
// =============================================================================
function transitionToZone(id) {
  const target = getZone(id);
  if (!target) { sfx.nope(); return; }
  prepareZoneTransition();         // clear zombies + ajuste wave compteurs
  switchToZone(id);                // bascule visibility + fog + obstacles
  camera.position.copy(target.playerSpawn);
  banner(`ENTERING ${target.name}`);
}

// Wire les handlers que world.js attend (évite cycle d'import)
setTransitionHandler(transitionToZone);
setWeaponHandlers(giveWeapon, refillAmmo);

// Spawn initial : caméra placée dans le Security Office
camera.position.copy(getZone('sec_office').playerSpawn);

// =============================================================================
//  PROMPT DE BORNES (proximité)
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
//  HORREUR ambiante
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
