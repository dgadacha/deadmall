import * as THREE from 'three';

export const ARENA = 30;
export const WALL_H = 7;
export const EYE = 1.7;
export const PLAYER_R = 0.45;
export const START_MONEY = 1000;
export const FOG_NEAR = 10;
export const FOG_FAR = 55;
export const FOG_FAR_BLACKOUT = 28;
export const FOG_COLOR = 0x07070b;

// Spawn par défaut (override par chaque zone via playerSpawn)
export const SPAWN = new THREE.Vector3(0, EYE, 1.5);

export const WEAPONS = {
  pistol:  { name:"PISTOL",       dmg:34, mag:12, fireDelay:0.16, reload:1.1, pellets:1, spread:0.006 },
  shotgun: { name:"PUMP SHOTGUN", dmg:22, mag:6,  fireDelay:0.7,  reload:1.6, pellets:8, spread:0.07  },
};

// Récompenses CoD-Zombies-style
export const REWARD_BODY = 50;
export const REWARD_HEAD_BONUS = 25;   // headshot = body + bonus = 75
