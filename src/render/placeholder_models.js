// 备用的简易模型：正式模型模块加载失败时使用，接口与 models/index.js 一致
import * as THREE from 'three';

export const TEAM_COLORS = { 1: '#3b8cff', 2: '#ff4a4a' };
const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });

function simple(build, height) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  build(body);
  return {
    root, height,
    update(s) {
      body.position.y = s.moving ? Math.abs(Math.sin(s.t * 10)) * 0.12 : 0;
      body.rotation.x = s.dead ? -Math.min(1.4, (s.deadT || 0) * 3) : 0;
    },
  };
}

export function createHeroModel(def, team) {
  return simple((b) => {
    const c = def.colors || {};
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.8, 4, 8), lam(c.primary || TEAM_COLORS[team]));
    torso.position.y = 0.9; torso.castShadow = true; b.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), lam(c.skin || '#f1c9a5'));
    head.position.y = 1.75; head.castShadow = true; b.add(head);
    const wpn = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.1), lam(c.accent || '#ffd166'));
    wpn.position.set(0.5, 1.0, 0.4); b.add(wpn);
  }, 2.1);
}
export function createMinionModel(mtype, team) {
  const s = mtype === 'siege' ? 1.4 : mtype === 'super' ? 1.6 : 1;
  return simple((b) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.7 * s, 0.9 * s, 0.6 * s), lam(TEAM_COLORS[team]));
    m.position.y = 0.45 * s; m.castShadow = true; b.add(m);
  }, 1.0 * s);
}
export function createMonsterModel(mtype) {
  const big = /Big|Buff|drake|guardian/.test(mtype);
  const s = mtype === 'drake' || mtype === 'guardian' ? 2.6 : big ? 1.5 : 0.9;
  return simple((b) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 * s, 0), lam(mtype === 'drake' ? '#d9541e' : mtype === 'guardian' ? '#7b5bd6' : '#8a6a4a'));
    m.position.y = 0.7 * s; m.castShadow = true; b.add(m);
  }, 1.4 * s);
}
export function createTowerModel(tier, team) {
  return simple((b) => {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 4.5, 8), lam('#9a9488'));
    base.position.y = 2.25; base.castShadow = true; b.add(base);
    const top = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team] }));
    top.position.y = 5.6; b.add(top);
  }, 6.4);
}
export function createCrystalModel(team) {
  return simple((b) => {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 1.2, 8), lam('#8a8a96'));
    base.position.y = 0.6; base.castShadow = true; b.add(base);
    const cr = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 0), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team] }));
    cr.position.y = 3.6; cr.scale.y = 1.6; b.add(cr);
  }, 5.8);
}
export function createFountainModel(team) {
  return simple((b) => {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 0.8, 16), lam('#a8a8b4'));
    base.position.y = 0.4; b.add(base);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.2, 16), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team] }));
    water.position.y = 0.85; b.add(water);
  }, 1.5);
}
