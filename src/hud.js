import { State, player, wave, ammo, game } from './state.js';
import { WEAPONS } from './config.js';

const elHud     = document.getElementById('hud');
const elWave    = document.getElementById('wave');
const elKills   = document.getElementById('kills');
const elMoney   = document.getElementById('money');
const elHealth  = document.getElementById('health-fill');
const elWeapon  = document.getElementById('weapon-name');
const elAmmo    = document.getElementById('ammo');
const elReload  = document.getElementById('reloading');
const elPrompt  = document.getElementById('prompt');
const elBanner  = document.getElementById('event-banner');
const elHit     = document.getElementById('hitmarker');
const elDmg     = document.getElementById('damage');
const elVignette= document.getElementById('vignette');
const elToasts  = document.getElementById('toasts');

export function updateHUD() {
  elWave.textContent = `VAGUE ${wave.num}`;
  elKills.textContent = `TUÉS ${player.kills}`;
  elMoney.textContent = `$${player.money}`;
  elHealth.style.width = Math.max(0, player.hp) + '%';
  const w = WEAPONS[game.curWeapon];
  elWeapon.textContent = w.name;
  const a = ammo[game.curWeapon];
  const res = a.reserve === Infinity ? '∞' : a.reserve;
  elAmmo.innerHTML = `<span class="mag">${a.mag}</span><span class="reserve">/${res}</span>`;
  elReload.textContent = game.reloading > 0 ? 'RECHARGEMENT…' : '';
}

export function showHud()  { elHud.classList.remove('hidden'); }
export function hideHud()  { elHud.classList.add('hidden'); }

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}
export function hideScreens() {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
}

export function toast(txt) {
  const d = document.createElement('div');
  d.className = 'toast'; d.textContent = txt;
  elToasts.appendChild(d);
  setTimeout(() => d.remove(), 900);
}

export function banner(txt) {
  elBanner.textContent = txt;
  elBanner.classList.remove('show');
  void elBanner.offsetWidth;          // force reflow → re-déclenche l'animation
  elBanner.classList.add('show');
}

export function hitmark() {
  elHit.style.opacity = '1';
  setTimeout(() => elHit.style.opacity = '0', 70);
}

// Flash bref de dégâts (overlay #damage)
export function dmgFlash() {
  elDmg.style.transition = 'none';
  elDmg.style.opacity = '0.85';
  requestAnimationFrame(() => {
    elDmg.style.transition = 'opacity .4s';
    elDmg.style.opacity = '0';
  });
}

// Vignette rouge persistante (overlay #vignette, distinct du flash)
// Apparaît sous 40% HP, devient pénible sous 20%.
export function updateLowHpVignette() {
  if (game.state !== State.PLAY) { elVignette.style.opacity = '0'; return; }
  const hp = player.hp;
  let op = 0;
  if (hp < 40) op = (1 - hp/40) * 0.45;
  if (hp < 20) op = 0.45 + (1 - hp/20) * 0.35;
  elVignette.style.opacity = String(op);
}

export function updatePrompt(nearStation) {
  if (nearStation && game.state === State.PLAY) {
    const can = player.money >= nearStation.cost;
    elPrompt.classList.remove('hidden');
    elPrompt.style.borderColor = can ? '#ffb200' : '#666';
    elPrompt.style.color = can ? '#ffb200' : '#888';
    elPrompt.textContent = `[E] ${nearStation.label} — $${nearStation.cost}`;
  } else {
    elPrompt.classList.add('hidden');
  }
}
