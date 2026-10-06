// 《峡谷之巅》全部单位模型的统一入口。
// 每个 create* 返回 { root: THREE.Group, height, update(state) }，脚底 y=0，正面朝本地 +Z。
// state 字段见 tests/model_viewer.html 顶部说明；全部可选。
import * as THREE from 'three';
import { HERO_BUILDERS } from './heroes.js';
import { humanoidAnimator } from './rig.js';
import { buildMinion } from './minions.js';
import { MONSTER_BUILDERS } from './monsters.js';
import { BOSS_BUILDERS } from './bosses.js';
import { buildTower, buildCrystal, buildFountain } from './structures.js';

export { TEAM_COLORS, countMeshes } from './materials.js';

const DEFAULT_COLORS = { primary: '#8a8f99', secondary: '#4a4f59', accent: '#ffd166', skin: '#f1c9a5', hair: '#3a2a20' };
const _box = new THREE.Box3();

// 英雄：按 heroDef.model 选造型，配色取 heroDef.colors
export function createHeroModel(heroDef, team) {
  const def = heroDef || {};
  const make = HERO_BUILDERS[def.model] || HERO_BUILDERS.swordsman;
  const { R, style } = make(Object.assign({}, DEFAULT_COLORS, def.colors));
  const update = humanoidAnimator(R, style);
  update({ t: 0 });
  // 高度取待机姿势包围盒顶，限制在合理范围（头顶血条/头像相机用）
  R.root.updateMatrixWorld(true);
  _box.setFromObject(R.root);
  const top = isFinite(_box.max.y) ? _box.max.y : 2.3;
  const height = Math.min(2.7, Math.max(2.0, top));
  R.root.userData.team = team;
  return { root: R.root, height, update };
}

// 小兵：'melee' | 'ranged' | 'siege' | 'super'
export function createMinionModel(mtype, team) {
  return buildMinion(mtype, team);
}

// 野怪与首领
export function createMonsterModel(mtype) {
  const make = MONSTER_BUILDERS[mtype] || BOSS_BUILDERS[mtype] || MONSTER_BUILDERS.wolf;
  return make();
}

// 防御塔：'outer' | 'inner' | 'high'
export function createTowerModel(tier, team) {
  return buildTower(tier, team);
}

export function createCrystalModel(team) {
  return buildCrystal(team);
}

export function createFountainModel(team) {
  return buildFountain(team);
}
