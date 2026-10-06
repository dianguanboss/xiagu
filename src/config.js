// 全局玩法参数（时间单位：秒；距离单位：米，地图 200×200）

export const DT = 1 / 30;            // 模拟步长
export const MAP_SIZE = 200;

export const TEAM_NEUTRAL = 0;
export const TEAM_BLUE = 1;
export const TEAM_RED = 2;
export const enemyOf = (t) => (t === TEAM_BLUE ? TEAM_RED : t === TEAM_RED ? TEAM_BLUE : 0);

export const TEAM_NAMES = { 1: '蓝方', 2: '红方', 0: '野怪' };

export const MAX_LEVEL = 15;
// 升到下一级所需经验（下标为当前等级）
export const XP_TO_NEXT = [0];
for (let l = 1; l < MAX_LEVEL; l++) XP_TO_NEXT.push(120 + 45 * l);

export const ECON = {
  startGold: 300,
  passiveGoldPerSec: 4,
  passiveXpPerSec: 2,
  heroKillGold: 200,
  heroKillGoldPerStreak: 40,     // 连杀赏金
  maxStreakBonus: 300,
  shutdownPerStreak: 60,
  assistShare: 0.5,              // 助攻者分得击杀赏金的比例（平分）
  heroKillXpBase: 80,
  heroKillXpPerLevel: 25,
  towerTeamGold: 100,
  towerLastHitGold: 150,
  crystalGold: 0,
  shareRadius: 16,               // 经验/金币分享半径
  sellRatio: 0.6,
};

export const TIMING = {
  firstWave: 15,
  waveInterval: 30,
  siegeEvery: 3,           // 每 3 波出一个炮车
  jungleFirst: 30,
  campRespawn: 70,
  buffRespawn: 90,
  drakeFirst: 120,
  drakeRespawn: 180,
  guardianFirst: 360,
  guardianRespawn: 180,
  recallTime: 6,
  assistWindow: 10,
  combatTag: 4,            // 受伤后多久算"脱战"
  minionScalePerMin: 0.025,
  buffDuration: 70,
  drakeBuffDuration: 90,
  guardianBuffDuration: 90,
};

export const VISION = {
  hero: 13,
  minion: 8,
  tower: 12,
  crystal: 14,
  monster: 0,
  fountain: 20,
  bushReveal: 2.6,     // 敌人在此距离内可看见草丛里的单位
  attackReveal: 1.2,   // 攻击后暴露时长
};

// 防御塔：有敌方小兵在附近时英雄伤害全额，否则减免
export const TOWER_NO_MINION_REDUCTION = 0.5;

export function respawnTime(level, gameTime) {
  return Math.min(60, 4 + level * 2.4 + Math.max(0, gameTime - 600) / 60 * 1.2);
}
