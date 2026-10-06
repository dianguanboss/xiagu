// 小兵、防御塔、野怪的基础数值

export const MINIONS = {
  melee:  { name: '近战兵', hp: 1600, ad: 78,  armor: 40, mr: 20, range: 1.6, interval: 1.2, ms: 5.4, radius: 0.65, gold: 38, xp: 30, sight: 8 },
  ranged: { name: '远程兵', hp: 1100, ad: 112, armor: 20, mr: 20, range: 6.0, interval: 1.4, ms: 5.4, radius: 0.6,  gold: 30, xp: 25, sight: 8, projSpeed: 20 },
  siege:  { name: '炮车',   hp: 2800, ad: 170, armor: 60, mr: 60, range: 8.0, interval: 2.0, ms: 5.0, radius: 1.0,  gold: 80, xp: 60, sight: 9, projSpeed: 16, towerMul: 2.0 },
  super:  { name: '超级兵', hp: 4200, ad: 260, armor: 120, mr: 120, range: 1.9, interval: 1.2, ms: 5.4, radius: 0.9, gold: 50, xp: 50, sight: 9 },
};
// 防御塔对小兵按最大生命百分比造成伤害
export const TOWER_VS_MINION = { melee: 0.45, ranged: 0.62, siege: 0.18, super: 0.14 };

export const TOWERS_STATS = {
  outer:   { name: '一塔', hp: 7000,  ad: 380, armor: 100, mr: 100, range: 10.5, interval: 1.0, radius: 1.8 },
  inner:   { name: '二塔', hp: 8000,  ad: 420, armor: 110, mr: 110, range: 10.5, interval: 1.0, radius: 1.8 },
  high:    { name: '高地塔', hp: 9000, ad: 460, armor: 120, mr: 120, range: 10.5, interval: 1.0, radius: 1.8 },
  crystal: { name: '水晶', hp: 12000, ad: 520, armor: 130, mr: 130, range: 11,   interval: 0.9, radius: 3.2 },
};
export const TOWER_RAMP = 0.35, TOWER_RAMP_MAX = 1.75;

export const FOUNTAIN_STATS = { range: 14, damage: 2400, interval: 0.5, healPct: 0.12 };

// 野怪：每个营地由若干只组成
export const MONSTERS = {
  blueGolem: { name: '蓝晶巨像', hp: 5500, ad: 150, armor: 80, mr: 80, range: 2.6, interval: 1.4, radius: 1.6, gold: 90, xp: 140, buff: 'blue' },
  redLizard: { name: '赤焰蜥王', hp: 5500, ad: 160, armor: 80, mr: 80, range: 2.6, interval: 1.4, radius: 1.6, gold: 90, xp: 140, buff: 'red' },
  wolfBig:   { name: '幽影狼王', hp: 2600, ad: 110, armor: 50, mr: 40, range: 1.8, interval: 1.2, radius: 1.0, gold: 50, xp: 70 },
  wolf:      { name: '幽影狼',   hp: 1100, ad: 60,  armor: 30, mr: 20, range: 1.5, interval: 1.2, radius: 0.7, gold: 20, xp: 30 },
  beetle:    { name: '岩甲虫',   hp: 1300, ad: 70,  armor: 70, mr: 30, range: 1.5, interval: 1.3, radius: 0.8, gold: 26, xp: 36 },
  birdBig:   { name: '赤羽鸟王', hp: 2400, ad: 120, armor: 40, mr: 40, range: 4.0, interval: 1.3, radius: 0.9, gold: 50, xp: 70, ranged: true },
  bird:      { name: '赤羽鸟',   hp: 900,  ad: 60,  armor: 20, mr: 20, range: 4.0, interval: 1.3, radius: 0.6, gold: 20, xp: 30, ranged: true },
  boar:      { name: '獠牙野猪', hp: 3600, ad: 130, armor: 60, mr: 40, range: 2.0, interval: 1.3, radius: 1.2, gold: 70, xp: 100 },
  drake:     { name: '炎鳞龙',   hp: 14000, ad: 330, armor: 120, mr: 120, range: 4.5, interval: 1.6, radius: 2.8, gold: 100, xp: 220, boss: true, aoe: 3.5 },
  guardian:  { name: '远古守卫', hp: 20000, ad: 420, armor: 140, mr: 140, range: 5.0, interval: 1.8, radius: 3.2, gold: 150, xp: 300, boss: true, aoe: 4.5 },
};

// 营地类型 → 成员（相对营地中心的偏移）
export const CAMP_TYPES = {
  blueBuff: { name: '蓝 Buff', members: [['blueGolem', 0, 0]], respawn: 'buff' },
  redBuff:  { name: '红 Buff', members: [['redLizard', 0, 0]], respawn: 'buff' },
  wolves:   { name: '狼群', members: [['wolfBig', 0, 0], ['wolf', -2.2, 1.4], ['wolf', 2.2, 1.4]], respawn: 'camp' },
  beetles:  { name: '甲虫', members: [['beetle', 0, -1.6], ['beetle', -1.6, 1.2], ['beetle', 1.6, 1.2]], respawn: 'camp' },
  birds:    { name: '鸟群', members: [['birdBig', 0, 0], ['bird', -2, 1.2], ['bird', 2, 1.2]], respawn: 'camp' },
  boars:    { name: '野猪', members: [['boar', 0, 0]], respawn: 'camp' },
  drake:    { name: '炎鳞龙', members: [['drake', 0, 0]], respawn: 'drake' },
  guardian: { name: '远古守卫', members: [['guardian', 0, 0]], respawn: 'guardian' },
};

export const MONSTER_LEASH = 11;     // 离营地多远脱战回家
export const MONSTER_SCALE_PER_MIN = 0.03;
