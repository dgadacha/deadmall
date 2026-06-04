import * as THREE from 'three';
import { renderer, scene, camera, maybeResize, composer } from './renderer.js';
import { State, game, player, wave, resetState } from './state.js';
import { PERK_REGEN_DELAY, PERK_REGEN_RATE } from './config.js';
import { initAudio, sfx } from './audio.js';
import {
  updateHUD, showHud, showScreen, hideScreens,
  updateLowHpVignette, updatePrompt, banner,
} from './hud.js';
import {
  updateWorld, buyStations, endBlackout,
  switchToZone, getZone, setActionHandlers,
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
import {
  getModelList, showModel, setView, toggleAutoRotate,
  updateGallery, getGalleryScene, getGalleryCamera,
  setScaleMultiplier, getCurrentBaseScale,
  playCurrentAnimation, setAnimListListener,
} from './gallery.js';

// =============================================================================
//  HANDLERS WORLD (achats des bornes)
//  MVP mono-zone : plus de transition de zone, on garde juste les actions d'achat.
// =============================================================================
setActionHandlers({
  giveWeapon,
  refillAmmo,
  medkit:      applyMedkit,
  armor:       applyArmor,
  regen:       unlockRegen,
  nightVision: unlockNightVision,
  lightUp:     unlockLight,
});

// Spawn initial : centre du Depot
{
  const zone = getZone('bus_depot');
  camera.position.set(
    zone.playerSpawn.x + zone.baseX,
    zone.playerSpawn.y + zone.baseY,
    zone.playerSpawn.z + zone.baseZ,
  );
}

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
  document.getElementById(id).addEventListener('click', (e) => {
    // ignore les clicks sur les boutons internes (galerie etc.)
    if (e.target.closest('button')) return;
    if (id === 'gameover') resetRun();
    controls.lock();
  });
});

// =============================================================================
//  GALERIE 3D — ouverture / fermeture / navigation
// =============================================================================
function populateGalleryList() {
  const list = document.getElementById('gallery-list');
  list.innerHTML = '';
  for (const m of getModelList()) {
    const item = document.createElement('button');
    item.className = 'gallery-item';
    item.textContent = m.label;
    item.dataset.modelId = m.id;
    item.addEventListener('click', () => {
      document.querySelectorAll('.gallery-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      showModel(m.id);
    });
    list.appendChild(item);
  }
  list.firstChild?.classList.add('active');
}

function openGallery() {
  game.state = State.GALLERY;
  hideScreens();
  showScreen('gallery');
  populateGalleryList();
  const first = getModelList()[0];
  if (first) showModel(first.id);
}
function closeGallery() {
  game.state = State.MENU;
  hideScreens();
  showScreen('menu');
}

document.getElementById('open-gallery').addEventListener('click', (e) => {
  e.stopPropagation();
  openGallery();
});
document.getElementById('gallery-close').addEventListener('click', closeGallery);
document.querySelectorAll('#gallery [data-view]').forEach(btn => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});
document.getElementById('gallery-autorotate').addEventListener('click', () => {
  const on = toggleAutoRotate();
  document.getElementById('gallery-autorotate').textContent = on ? '↻ AUTO' : '⏸ MANUEL';
});

// sélecteur d'animation (galerie)
const animSelect = document.getElementById('gallery-anim');
if (animSelect) {
  animSelect.addEventListener('change', () => {
    const name = animSelect.value;
    if (name && name !== '—') playCurrentAnimation(name);
  });
}
setAnimListListener((animNames) => {
  if (!animSelect) return;
  animSelect.innerHTML = '';
  if (animNames.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = '—';
    animSelect.appendChild(opt);
    animSelect.disabled = true;
    return;
  }
  animSelect.disabled = false;
  for (const n of animNames) {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n;
    animSelect.appendChild(opt);
  }
});

// slider de calibration de taille
const scaleSlider = document.getElementById('gallery-scale');
const scaleValueEl = document.getElementById('gallery-scale-value');
if (scaleSlider && scaleValueEl) {
  scaleSlider.addEventListener('input', () => {
    const mult = parseFloat(scaleSlider.value);
    const abs = setScaleMultiplier(mult);
    const base = getCurrentBaseScale();
    if (abs !== undefined) {
      scaleValueEl.textContent = `${mult.toFixed(3)}× (abs ${abs.toFixed(4)})`;
    } else {
      scaleValueEl.textContent = `${mult.toFixed(3)}× (base ${base.toFixed(4)})`;
    }
  });
}

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
  const zone = getZone('bus_depot');
  camera.position.set(
    zone.playerSpawn.x + zone.baseX,
    zone.playerSpawn.y + zone.baseY,
    zone.playerSpawn.z + zone.baseZ,
  );
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

  if (game.state === State.GALLERY) {
    // mode galerie : rend la scène galerie au lieu du jeu
    updateGallery(dt);
    const gc = getGalleryCamera();
    gc.aspect = camera.aspect;
    gc.updateProjectionMatrix();
    renderer.render(getGalleryScene(), gc);
    return;
  }

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
  composer.render();
}
loop();
updateHUD();
