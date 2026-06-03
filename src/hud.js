import { State, player, wave, ammo, game, activePerksCount } from './state.js';
import { WEAPONS } from './config.js';

const elHud         = document.getElementById('hud');
const elWave        = document.getElementById('wave');
const elZlNum       = document.getElementById('zl-num');
const elMoney       = document.getElementById('money');
const elSecurityLv  = document.getElementById('security-lv');
const elHealthFill  = document.getElementById('health-fill');
const elHealthValue = document.getElementById('health-value');
const elArmorBar    = document.getElementById('armor-bar');
const elArmorFill   = document.getElementById('armor-fill');
const elArmorValue  = document.getElementById('armor-value');
const elAmmoMag     = document.getElementById('ammo-mag');
const elAmmoReserve = document.getElementById('ammo-reserve');
const elWeaponName  = document.getElementById('weapon-name');
const elReloading   = document.getElementById('reloading');
const elPerkNum     = document.getElementById('perk-num');
const elPrompt      = document.getElementById('prompt');
const elBanner      = document.getElementById('event-banner');
const elHit         = document.getElementById('hitmarker');
const elDmg         = document.getElementById('damage');
const elVignette    = document.getElementById('vignette');
const elToasts      = document.getElementById('toasts');

function zombiesRemaining() {
  return Math.max(0, (wave.toSpawn - wave.spawned) + wave.alive);
}

function securityLevel() {
  return 1 + Math.floor(player.kills / 8);
}

function fmt(n) { return n === Infinity ? '∞' : String(n); }

export function updateHUD() {
  const left = zombiesRemaining();
  const a = ammo[game.curWeapon];
  const w = WEAPONS[game.curWeapon];
  const hp = Math.max(0, Math.floor(player.hp));
  const armor = Math.max(0, Math.floor(player.armor));

  elWave.textContent  = `WAVE ${wave.num}`;
  elZlNum.textContent = String(left);
  elMoney.textContent = String(player.money);

  elSecurityLv.textContent  = String(securityLevel());
  elHealthFill.style.width  = Math.max(0, player.hp) + '%';
  elHealthValue.textContent = String(hp);

  if (armor > 0) {
    elArmorBar.classList.remove('hidden');
    elArmorFill.style.width = armor + '%';
    elArmorValue.textContent = String(armor);
  } else {
    elArmorBar.classList.add('hidden');
  }

  elAmmoMag.textContent     = fmt(a.mag);
  elAmmoReserve.textContent = fmt(a.reserve);
  elWeaponName.textContent  = w.name;
  elReloading.textContent   = game.reloading > 0 ? 'RELOADING…' : '';
  elPerkNum.textContent     = String(activePerksCount());
}

export function showHud()    { elHud.classList.remove('hidden'); }
export function hideHud()    { elHud.classList.add('hidden'); }

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
  void elBanner.offsetWidth;
  elBanner.classList.add('show');
}

export function hitmark() {
  elHit.style.opacity = '1';
  setTimeout(() => elHit.style.opacity = '0', 70);
}

export function dmgFlash() {
  elDmg.style.transition = 'none';
  elDmg.style.opacity = '0.85';
  requestAnimationFrame(() => {
    elDmg.style.transition = 'opacity .4s';
    elDmg.style.opacity = '0';
  });
}

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
