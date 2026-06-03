import * as THREE from 'three';

export const ARENA = 30;
export const WALL_H = 7;
export const EYE = 1.7;
export const PLAYER_R = 0.45;
export const PIXEL_HEIGHT = 220;            // PS1 : résolution interne basse, gros pixels
export const START_MONEY = 500;
export const FOG_NEAR = 5;
export const FOG_FAR = 28;                   // PS1 : draw distance courte
export const FOG_FAR_BLACKOUT = 14;
export const FOG_COLOR = 0x07070b;

export const SPAWN = new THREE.Vector3(0, EYE, 14);

export const WEAPONS = {
  pistol:  { name:"PISTOLET",      dmg:34, mag:12, fireDelay:0.16, reload:1.1, pellets:1, spread:0.006 },
  shotgun: { name:"FUSIL À POMPE", dmg:22, mag:6,  fireDelay:0.7,  reload:1.6, pellets:8, spread:0.07  },
};
