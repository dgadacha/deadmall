import * as THREE from 'three';

export const ARENA = 30;
export const WALL_H = 7;
export const EYE = 1.7;
export const PLAYER_R = 0.45;
export const START_MONEY = 1000;
export const FOG_NEAR = 4;
export const FOG_FAR = 28;
export const FOG_FAR_BLACKOUT = 14;
export const FOG_COLOR = 0x030308;

// Spawn par défaut (override par chaque zone via playerSpawn)
export const SPAWN = new THREE.Vector3(0, EYE, 1.5);

// =============================================================================
//  ARMES
//  - tir : pellets/spread/raycast hitscan
//  - mêlée : melee=true, hit en cône proche
// =============================================================================
export const WEAPONS = {
  pistol:  { name:"PISTOL",       dmg:34, mag:12, fireDelay:0.16, reload:1.1,  pellets:1, spread:0.006 },
  shotgun: { name:"PUMP SHOTGUN", dmg:22, mag:6,  fireDelay:0.7,  reload:1.6,  pellets:8, spread:0.07  },
  smg:     { name:"SMG",          dmg:18, mag:30, fireDelay:0.075,reload:1.4,  pellets:1, spread:0.014, auto:true },
  bat:     { name:"BAT",          dmg:60,  fireDelay:0.55, swingTime:0.45, range:2.3, coneAngle:Math.PI/2.6, melee:true },
  axe:     { name:"AXE",          dmg:120, fireDelay:0.75, swingTime:0.6,  range:2.1, coneAngle:Math.PI/3,   melee:true },
};

// Récompenses CoD-Zombies-style
export const REWARD_BODY = 50;
export const REWARD_HEAD_BONUS = 25;   // headshot = body + bonus = 75

// =============================================================================
//  PERKS
// =============================================================================
export const PERK_REGEN_DELAY = 5.0;     // s sans dégât avant que la regen démarre
export const PERK_REGEN_RATE  = 12;      // HP/sec quand active
export const ARMOR_SOAK_RATIO = 0.7;     // 70% des dégâts absorbés par l'armure quand présente
export const NIGHTVISION_AMBIENT = 0.55; // niveau d'ambient quand night vision active pendant blackout
