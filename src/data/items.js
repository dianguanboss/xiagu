// 装备：直接购买成品，最多 6 格，鞋子只能带一双
// icon: 图标形状（ui 里程序绘制），color: 图标主色
export const ITEM_CATS = { attack: '攻击', magic: '法术', defense: '防御', move: '移动', jungle: '打野' };

export const ITEMS = [
  // 打野 / 移动
  { id: 'jungle_knife', name: '猎刃', cat: 'jungle', cost: 250, icon: 'knife', color: '#7fd16b',
    stats: { ad: 20 }, passive: 'jungle', desc: '对野怪伤害 +30%，击杀野怪额外获得 20% 金币和经验。' },
  { id: 'boots', name: '疾行之靴', cat: 'move', cost: 250, icon: 'boots', color: '#b9a27a', boots: true,
    stats: { ms: 0.6 }, desc: '移动速度 +0.6。可升级为进阶鞋（自动抵扣 250 金币）。' },
  { id: 'boots_as', name: '急速战靴', cat: 'move', cost: 900, icon: 'boots', color: '#e9b44c', boots: true,
    stats: { ms: 0.8, asBonus: 0.25 }, desc: '移动速度 +0.8，攻击速度 +25%。' },
  { id: 'boots_mr', name: '抵抗之靴', cat: 'move', cost: 900, icon: 'boots', color: '#8e7cc3', boots: true,
    stats: { ms: 0.8, mr: 110, tenacity: 0.35 }, desc: '移动速度 +0.8，法术防御 +110，控制时间缩短 35%。' },
  { id: 'boots_armor', name: '影忍之足', cat: 'move', cost: 900, icon: 'boots', color: '#6d8b74', boots: true,
    stats: { ms: 0.8, armor: 110 }, passive: 'boots_armor', desc: '移动速度 +0.8，物理防御 +110，受到普攻伤害降低 15%。' },
  { id: 'boots_magic', name: '秘法之靴', cat: 'move', cost: 900, icon: 'boots', color: '#4fa3e0', boots: true,
    stats: { ms: 0.8, magicPenFlat: 75 }, desc: '移动速度 +0.8，法术穿透 +75。' },
  { id: 'boots_cdr', name: '冷静之靴', cat: 'move', cost: 900, icon: 'boots', color: '#5fc9c0', boots: true,
    stats: { ms: 0.8, cdr: 0.15 }, desc: '移动速度 +0.8，冷却缩减 +15%。' },

  // 攻击
  { id: 'blade_inf', name: '无尽锋刃', cat: 'attack', cost: 2140, icon: 'sword', color: '#f2c14e',
    stats: { ad: 130, crit: 0.2, critDmg: 0.5 }, desc: '物理攻击 +130，暴击率 +20%，暴击伤害 +50%。' },
  { id: 'hammer', name: '碎星锤', cat: 'attack', cost: 2100, icon: 'hammer', color: '#c0c6cf',
    stats: { ad: 80, cdr: 0.1, armorPenPct: 0.4 }, desc: '物理攻击 +80，冷却缩减 +10%，物理穿透 +40%。' },
  { id: 'bloodblade', name: '泣血之刃', cat: 'attack', cost: 1740, icon: 'sword', color: '#d64045',
    stats: { ad: 100, lifesteal: 0.25 }, desc: '物理攻击 +100，物理吸血 +25%。' },
  { id: 'windblade', name: '逐风之刃', cat: 'attack', cost: 1800, icon: 'dagger', color: '#9ad1d4',
    stats: { asBonus: 0.35, crit: 0.2, ms: 0.3 }, desc: '攻击速度 +35%，暴击率 +20%，移动速度 +0.3。' },
  { id: 'shadow_axe', name: '暗影战斧', cat: 'attack', cost: 2090, icon: 'axe', color: '#7a5c9e',
    stats: { ad: 85, cdr: 0.15, maxHp: 500 }, passive: 'spellblade', desc: '物理攻击 +85，冷却缩减 +15%，最大生命 +500。施放技能后下一次普攻额外造成 60% 物理攻击伤害。' },
  { id: 'dawn', name: '破晓之弓', cat: 'attack', cost: 3000, icon: 'bow', color: '#ffb347',
    stats: { ad: 60, asBonus: 0.35, armorPenPct: 0.35 }, desc: '物理攻击 +60，攻击速度 +35%，物理穿透 +35%。' },
  { id: 'kings_blade', name: '王者之刃', cat: 'attack', cost: 2100, icon: 'sword', color: '#3fb27f',
    stats: { ad: 60, asBonus: 0.3, lifesteal: 0.1 }, passive: 'execute', desc: '物理攻击 +60，攻击速度 +30%，物理吸血 +10%。普攻额外造成目标当前生命 8% 的物理伤害。' },

  // 法术
  { id: 'book_devour', name: '噬神之书', cat: 'magic', cost: 2100, icon: 'book', color: '#c94f7c',
    stats: { ap: 180, maxHp: 400, spellVamp: 0.2 }, desc: '法术攻击 +180，最大生命 +400，法术吸血 +20%。' },
  { id: 'wrath', name: '博学者之怒', cat: 'magic', cost: 2300, icon: 'crown', color: '#e8c547',
    stats: { ap: 240 }, passive: 'ap_mult', desc: '法术攻击 +240，总法术攻击提高 30%。' },
  { id: 'void_staff', name: '虚无法杖', cat: 'magic', cost: 2110, icon: 'staff', color: '#5b5bd6',
    stats: { ap: 240, magicPenPct: 0.45 }, desc: '法术攻击 +240，法术穿透 +45%。' },
  { id: 'agony', name: '痛苦面具', cat: 'magic', cost: 2040, icon: 'mask', color: '#9b3d3d',
    stats: { ap: 140, maxHp: 500, magicPenFlat: 75 }, desc: '法术攻击 +140，最大生命 +500，法术穿透 +75。' },
  { id: 'echo', name: '回响之杖', cat: 'magic', cost: 2100, icon: 'orb', color: '#a77dff',
    stats: { ap: 240, ms: 0.3 }, passive: 'echo', desc: '法术攻击 +240，移动速度 +0.3。技能命中时在目标处引发一次小爆炸（6 秒一次）。' },
  { id: 'frost_staff', name: '冰霜法杖', cat: 'magic', cost: 2100, icon: 'staff', color: '#8fd3ff',
    stats: { ap: 150, maxHp: 1050 }, passive: 'frost', desc: '法术攻击 +150，最大生命 +1050。技能伤害使目标减速 25%，持续 1.5 秒。' },
  { id: 'holy_grail', name: '圣杯', cat: 'magic', cost: 2100, icon: 'grail', color: '#f4e285',
    stats: { ap: 180, maxMp: 400, mpRegen: 8, cdr: 0.1 }, desc: '法术攻击 +180，最大法力 +400，每秒回蓝 +8，冷却缩减 +10%。' },

  // 防御
  { id: 'red_lotus', name: '红莲斗篷', cat: 'defense', cost: 1830, icon: 'cloak', color: '#e4572e',
    stats: { maxHp: 1000, armor: 240 }, passive: 'burn_aura', desc: '最大生命 +1000，物理防御 +240。每秒对身边敌人造成法术伤害。' },
  { id: 'omen', name: '不祥征兆', cat: 'defense', cost: 2180, icon: 'armor', color: '#4f6d7a',
    stats: { maxHp: 1200, armor: 270 }, passive: 'omen', desc: '最大生命 +1200，物理防御 +270。被普攻时降低攻击者 30% 攻击速度。' },
  { id: 'overlord', name: '霸者重装', cat: 'defense', cost: 2070, icon: 'helmet', color: '#c97c3d',
    stats: { maxHp: 2000 }, passive: 'overlord', desc: '最大生命 +2000。脱离战斗后每秒回复 2% 最大生命。' },
  { id: 'witch', name: '魔女斗篷', cat: 'defense', cost: 2120, icon: 'cloak', color: '#7b4fa3',
    stats: { maxHp: 1000, mr: 360 }, passive: 'lowhp_shield', desc: '最大生命 +1000，法术防御 +360。生命低于 30% 时获得护盾（60 秒一次）。' },
  { id: 'phoenix', name: '不死鸟之眼', cat: 'defense', cost: 2100, icon: 'gem', color: '#ff7b54',
    stats: { maxHp: 1200, mr: 240, healAmp: 0.2 }, desc: '最大生命 +1200，法术防御 +240，受到的治疗效果 +20%。' },
  { id: 'thorns', name: '反伤刺甲', cat: 'defense', cost: 1840, icon: 'spikes', color: '#8a9a5b',
    stats: { ad: 40, armor: 420 }, passive: 'reflect', desc: '物理攻击 +40，物理防御 +420。受到普攻时反弹 20% 伤害。' },
  { id: 'sage', name: '贤者庇护', cat: 'defense', cost: 2080, icon: 'ankh', color: '#f0e6d2',
    stats: { armor: 140, mr: 140 }, passive: 'revive', desc: '物理/法术防御 +140。阵亡后 2 秒原地复活并回复 50% 生命（150 秒一次）。' },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((it) => [it.id, it]));
export const MAX_ITEMS = 6;
