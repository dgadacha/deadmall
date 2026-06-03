import { WEAPONS, START_MONEY } from './config.js';

export const State = { MENU:'menu', PLAY:'play', PAUSE:'pause', OVER:'over' };

export const player = { hp:100, money:START_MONEY, kills:0 };

export const wave = {
  num:0, toSpawn:0, spawned:0, alive:0,
  spawnTimer:0, intermission:2, active:false,
};

export const owned = { pistol:true, shotgun:false };

export const ammo = {
  pistol:  { mag:WEAPONS.pistol.mag,  reserve:Infinity },
  shotgun: { mag:0,                   reserve:0 },
};

// État global mutable, partagé entre modules.
export const game = {
  state: State.MENU,
  curWeapon: 'pistol',
  currentZone: 'sec_office',   // zone active : sec_office | parking | hall
  blackout: 0,
  fireCd: 0,
  reloading: 0,
  shake: 0,
};

export function resetState() {
  player.hp = 100;
  player.money = START_MONEY;
  player.kills = 0;
  owned.shotgun = false;
  ammo.pistol = { mag: WEAPONS.pistol.mag, reserve: Infinity };
  ammo.shotgun = { mag: 0, reserve: 0 };
  game.curWeapon = 'pistol';
  game.currentZone = 'sec_office';
  game.fireCd = 0;
  game.reloading = 0;
  game.shake = 0;
  game.blackout = 0;
  wave.num = 0; wave.toSpawn = 0; wave.spawned = 0; wave.alive = 0;
  wave.spawnTimer = 0; wave.intermission = 2; wave.active = false;
}
