import * as THREE from 'three';
import { scene } from './renderer.js';
import { currentZoneGroup } from './world.js';

const particles = [];
const tracers = [];
const bloodPools = [];

const BLOOD_LIFE = 90;
const BLOOD_MAX = 40;

export function burst(pos, color, n=8, spd=4) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.08),
      new THREE.MeshBasicMaterial({ color })
    );
    m.position.copy(pos);
    const v = new THREE.Vector3(
      (Math.random()*2 - 1) * spd,
      Math.random() * spd * 1.2,
      (Math.random()*2 - 1) * spd,
    );
    m.userData = { v, life: 0.5 + Math.random()*0.3 };
    scene.add(m);
    particles.push(m);
  }
}

export function spawnTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo,
    new THREE.LineBasicMaterial({ color:0xffe08a, transparent:true, opacity:0.9 }));
  scene.add(line);
  tracers.push({ line, life: 0.06 });
}

// flaque de sang procédurale au sol — reste BLOOD_LIFE secondes, fade à la fin
export function bloodPool(pos) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(${100 + Math.random()*40},0,${Math.random()*15},${0.65 + Math.random()*0.35})`;
    const x = Math.random()*32, y = Math.random()*32, r = 2 + Math.random()*9;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), mat);
  mesh.rotation.x = -Math.PI/2;
  mesh.position.set(pos.x, 0.02, pos.z);
  currentZoneGroup().add(mesh);
  bloodPools.push({ mesh, life: BLOOD_LIFE });

  // limite : on retire la plus vieille si on dépasse
  while (bloodPools.length > BLOOD_MAX) {
    const old = bloodPools.shift();
    old.mesh.removeFromParent();
  }
}

export function updateEffects(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const tr = tracers[i];
    tr.life -= dt;
    tr.line.material.opacity = Math.max(0, tr.life / 0.06);
    if (tr.life <= 0) { scene.remove(tr.line); tracers.splice(i, 1); }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.userData.life -= dt;
    p.userData.v.y -= 9.8 * dt;
    p.position.addScaledVector(p.userData.v, dt);
    if (p.position.y < 0.05) { p.position.y = 0.05; p.userData.v.set(0,0,0); }
    if (p.userData.life <= 0) { scene.remove(p); particles.splice(i, 1); }
  }
  for (let i = bloodPools.length - 1; i >= 0; i--) {
    const bp = bloodPools[i];
    bp.life -= dt;
    if (bp.life < 3) bp.mesh.material.opacity = Math.max(0, bp.life / 3);
    if (bp.life <= 0) { bp.mesh.removeFromParent(); bloodPools.splice(i, 1); }
  }
}

export function clearEffects() {
  for (const p of particles)  p.removeFromParent();
  for (const t of tracers)    t.line.removeFromParent();
  for (const bp of bloodPools) bp.mesh.removeFromParent();
  particles.length = 0; tracers.length = 0; bloodPools.length = 0;
}
