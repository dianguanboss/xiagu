// 英雄数据（全部原创）。技能实现见 sim/skills.js，按英雄 id 对应。
// vals 中的数值规格：{ base:[按技能等级], ad, bonusAd, ap, maxHp }，界面描述和实际结算共用。
// target: dir 指向型 / point 地点型 / unit 指定目标 / self 自身

export const ROLES = { tank: '坦克', fighter: '战士', assassin: '刺客', mage: '法师', marksman: '射手', support: '辅助' };
export const POSITIONS = { top: '对抗路', jungle: '打野', mid: '中路', adc: '发育路', support: '游走' };

const lv6 = (a, step) => [0, 1, 2, 3, 4, 5].map((i) => Math.round(a + step * i));
const lv3 = (a, step) => [0, 1, 2].map((i) => Math.round(a + step * i));
const cd6 = (a, b) => [0, 1, 2, 3, 4, 5].map((i) => +(a + (b - a) * i / 5).toFixed(1));

export const HEROES = [
  {
    id: 'liefeng', name: '烈锋', title: '破阵之刃', roles: ['fighter'], positions: ['top', 'jungle'], difficulty: 2,
    attack: 'melee', model: 'swordsman',
    colors: { primary: '#b8332a', secondary: '#d9d9d9', accent: '#f2c14e', skin: '#f1c9a5', hair: '#2b1d14' },
    base: { hp: 3350, hpG: 275, mp: 440, mpG: 70, ad: 176, adG: 12, armor: 110, armorG: 16, mr: 60, mrG: 6,
      ms: 7.2, range: 2.2, interval: 1.0, hpRegen: 9, hpRegenG: 1.2, mpRegen: 5, mpRegenG: 0.6, asG: 0.02 },
    passive: { name: '战意', desc: '普攻或技能命中敌方英雄获得 1 层战意（最多 5 层，持续 4 秒），每层提高 4% 物理攻击。' },
    skills: [
      { name: '疾风斩', target: 'dir', range: 6, width: 1.6, castTime: 0.05, cd: cd6(9, 6.5), cost: lv6(50, 5), ai: 'dash',
        desc: '向前冲刺斩击，对路径上的敌人造成 {dmg} 点物理伤害。3 秒内可再次施放一次。',
        vals: { dmg: { base: lv6(160, 40), bonusAd: 0.7 } } },
      { name: '回旋斩', target: 'self', radius: 3.6, castTime: 0.1, cd: cd6(8, 6), cost: lv6(60, 5), ai: 'aoe',
        desc: '旋转挥剑，对周围敌人造成 {dmg} 点物理伤害，每命中一名英雄回复 {heal} 点生命。',
        vals: { dmg: { base: lv6(200, 45), bonusAd: 0.9 }, heal: { base: lv6(80, 25), maxHp: 0.03 } } },
      { name: '断空斩', target: 'unit', range: 7, castTime: 0.1, cd: [40, 34, 28], cost: [100, 100, 100], ai: 'execute', unitHeroOnly: true,
        desc: '跃向目标敌方英雄，造成 {dmg} 点物理伤害外加目标已损失生命 25% 的伤害，并减速 50%。',
        vals: { dmg: { base: lv3(320, 160), bonusAd: 1.0 } } },
    ],
    build: ['boots', 'shadow_axe', 'boots_armor', 'hammer', 'overlord', 'omen', 'witch'],
  },
  {
    id: 'kuanglang', name: '狂狼', title: '血月猎手', roles: ['fighter'], positions: ['jungle', 'top'], difficulty: 1,
    attack: 'melee', model: 'wolfman',
    colors: { primary: '#6b6f7a', secondary: '#3b3f4a', accent: '#d64045', skin: '#8d939e', hair: '#c9ccd3' },
    base: { hp: 3300, hpG: 280, mp: 0, mpG: 0, ad: 172, adG: 13, armor: 105, armorG: 15, mr: 55, mrG: 6,
      ms: 7.4, range: 2.0, interval: 0.95, hpRegen: 10, hpRegenG: 1.3, mpRegen: 0, mpRegenG: 0, asG: 0.025, lifesteal: 0.1 },
    resource: 'none',
    passive: { name: '嗜血', desc: '自带 10% 物理吸血，攻击野怪时吸血效果翻倍。' },
    skills: [
      { name: '撕咬突袭', target: 'point', range: 6.5, radius: 2.2, castTime: 0.05, cd: cd6(9, 6.5), cost: lv6(0, 0), ai: 'dash',
        desc: '扑向目标位置，对落点附近敌人造成 {dmg} 点物理伤害并减速 35%，持续 1.5 秒。',
        vals: { dmg: { base: lv6(170, 40), bonusAd: 0.8 } } },
      { name: '狼嚎', target: 'self', radius: 4.2, castTime: 0.15, cd: cd6(11, 8), cost: lv6(0, 0), ai: 'aoe',
        desc: '发出狼嚎，对周围敌人造成 {dmg} 点法术伤害并减速 40%，自身移速提高 30%，持续 3 秒。',
        vals: { dmg: { base: lv6(150, 35), ad: 0.4 } } },
      { name: '嗜血狂化', target: 'self', castTime: 0.2, cd: [50, 45, 40], cost: [0, 0, 0], ai: 'selfbuff',
        desc: '狂化 8 秒：攻击速度 +50%，物理吸血 +20%，移速 +0.8，普攻溅射周围敌人，并立即获得 {shield} 点护盾。',
        vals: { shield: { base: lv3(300, 200), maxHp: 0.08 } } },
    ],
    build: ['jungle_knife', 'boots', 'bloodblade', 'boots_armor', 'kings_blade', 'overlord', 'omen'],
  },
  {
    id: 'yingren', name: '影刃', title: '月下无声', roles: ['assassin'], positions: ['jungle'], difficulty: 3,
    attack: 'melee', model: 'ninja',
    colors: { primary: '#3c2a5a', secondary: '#1d1828', accent: '#b07cff', skin: '#e7c3a1', hair: '#111111' },
    base: { hp: 3050, hpG: 235, mp: 420, mpG: 65, ad: 182, adG: 14, armor: 92, armorG: 13, mr: 50, mrG: 5,
      ms: 7.6, range: 2.0, interval: 0.9, hpRegen: 8, hpRegenG: 1.0, mpRegen: 5, mpRegenG: 0.6, asG: 0.03 },
    passive: { name: '暗袭', desc: '每 6 秒，下一次普攻额外造成 {pdmg} 点物理伤害并减速 30%。' , vals: { pdmg: { base: [60], ad: 0.8 } } },
    skills: [
      { name: '影步', target: 'point', range: 6.5, radius: 2.4, castTime: 0, cd: cd6(8, 5.5), cost: lv6(45, 5), ai: 'dash',
        desc: '瞬身至目标位置，对落点附近敌人造成 {dmg} 点物理伤害，并重置普攻。',
        vals: { dmg: { base: lv6(150, 35), bonusAd: 0.75 } } },
      { name: '飞镖', target: 'dir', range: 8, width: 1.0, spread: 30, castTime: 0.1, cd: cd6(7, 5), cost: lv6(40, 4), ai: 'poke',
        desc: '扇形掷出 3 枚飞镖，每枚造成 {dmg} 点物理伤害（同一目标后续飞镖伤害减半）。',
        vals: { dmg: { base: lv6(110, 25), bonusAd: 0.5 } } },
      { name: '绝影杀', target: 'unit', range: 6, castTime: 0.05, cd: [36, 30, 24], cost: [100, 100, 100], ai: 'execute', unitHeroOnly: true,
        desc: '突进至目标英雄身边造成 {dmg} 点物理伤害，目标生命低于 50% 时伤害提高 30%。击杀目标则立即刷新冷却。',
        vals: { dmg: { base: lv3(380, 180), bonusAd: 1.2 } } },
    ],
    build: ['jungle_knife', 'boots', 'bloodblade', 'boots_armor', 'blade_inf', 'hammer', 'sage'],
  },
  {
    id: 'yanji', name: '炎姬', title: '焚天之焰', roles: ['mage'], positions: ['mid'], difficulty: 2,
    attack: 'ranged', projectile: 'fire', model: 'firemage',
    colors: { primary: '#d9472b', secondary: '#f6a04d', accent: '#ffe066', skin: '#f5d0b0', hair: '#ff6b35' },
    base: { hp: 2900, hpG: 210, mp: 520, mpG: 100, ad: 160, adG: 8, armor: 85, armorG: 12, mr: 50, mrG: 5,
      ms: 7.0, range: 7, interval: 1.05, hpRegen: 7, hpRegenG: 0.9, mpRegen: 7, mpRegenG: 0.9, asG: 0.01, projSpeed: 22 },
    passive: { name: '灼烧', desc: '技能命中会点燃敌人，3 秒内共造成 {burn} 点法术伤害。', vals: { burn: { base: [90], ap: 0.15, lvl: 12 } } },
    skills: [
      { name: '火球术', target: 'dir', range: 9.5, width: 1.1, castTime: 0.15, cd: cd6(6, 4.5), cost: lv6(55, 6), ai: 'poke', autoTarget: 'any',
        desc: '发射火球，命中第一个敌人后爆炸，对周围敌人造成 {dmg} 点法术伤害。',
        vals: { dmg: { base: lv6(260, 55), ap: 0.65 } } },
      { name: '炎阵', target: 'point', range: 8.5, radius: 2.7, castTime: 0.15, cd: cd6(10, 8), cost: lv6(70, 6), ai: 'cc',
        desc: '在目标位置画下炎阵，0.75 秒后爆发，造成 {dmg} 点法术伤害并眩晕 1 秒。',
        vals: { dmg: { base: lv6(220, 45), ap: 0.55 } } },
      { name: '陨星火雨', target: 'point', range: 11, radius: 4.6, castTime: 0.25, cd: [42, 36, 30], cost: [120, 140, 160], ai: 'aoe',
        desc: '召唤三波陨星砸向目标区域，每波造成 {dmg} 点法术伤害。',
        vals: { dmg: { base: lv3(220, 110), ap: 0.45 } } },
    ],
    build: ['boots', 'holy_grail', 'boots_magic', 'echo', 'wrath', 'void_staff', 'sage'],
  },
  {
    id: 'shuangyu', name: '霜语', title: '冰原歌者', roles: ['mage'], positions: ['mid', 'support'], difficulty: 2,
    attack: 'ranged', projectile: 'ice', model: 'icemage',
    colors: { primary: '#3d7cc9', secondary: '#e8f4ff', accent: '#9be7ff', skin: '#f4dfd0', hair: '#dff3ff' },
    base: { hp: 2950, hpG: 215, mp: 520, mpG: 100, ad: 158, adG: 8, armor: 86, armorG: 12, mr: 52, mrG: 5,
      ms: 7.0, range: 7, interval: 1.05, hpRegen: 7, hpRegenG: 0.9, mpRegen: 7, mpRegenG: 0.9, asG: 0.01, projSpeed: 22 },
    passive: { name: '寒霜', desc: '技能命中使敌人减速 20%，持续 1.5 秒。' },
    skills: [
      { name: '冰锥', target: 'dir', range: 10, width: 1.2, castTime: 0.15, cd: cd6(7, 5), cost: lv6(55, 6), ai: 'poke', autoTarget: 'any',
        desc: '射出穿透冰锥，对直线上所有敌人造成 {dmg} 点法术伤害并减速 30%。',
        vals: { dmg: { base: lv6(240, 50), ap: 0.6 } } },
      { name: '冰晶牢笼', target: 'point', range: 8.5, radius: 2.8, castTime: 0.15, cd: cd6(11, 8.5), cost: lv6(70, 6), ai: 'cc',
        desc: '在目标位置凝结冰晶，1 秒后冻结范围内敌人 1.2 秒并造成 {dmg} 点法术伤害。',
        vals: { dmg: { base: lv6(200, 40), ap: 0.5 } } },
      { name: '暴风雪', target: 'point', range: 9.5, radius: 5, castTime: 0.25, cd: [45, 38, 32], cost: [120, 140, 160], ai: 'aoe',
        desc: '在目标区域召唤暴风雪，持续 4 秒，每 0.5 秒造成 {dmg} 点法术伤害并减速 50%。',
        vals: { dmg: { base: lv3(70, 35), ap: 0.14 } } },
    ],
    build: ['boots', 'agony', 'boots_magic', 'frost_staff', 'void_staff', 'wrath', 'sage'],
  },
  {
    id: 'zhufeng', name: '逐风', title: '苍林游侠', roles: ['marksman'], positions: ['adc'], difficulty: 1,
    attack: 'ranged', projectile: 'arrow', model: 'archer',
    colors: { primary: '#3f7d4a', secondary: '#c9b48a', accent: '#a3e635', skin: '#f2d2b3', hair: '#e6d17a' },
    base: { hp: 2900, hpG: 210, mp: 440, mpG: 70, ad: 176, adG: 13, armor: 85, armorG: 12, mr: 50, mrG: 5,
      ms: 7.1, range: 8, interval: 0.92, hpRegen: 7, hpRegenG: 0.9, mpRegen: 5, mpRegenG: 0.6, asG: 0.03, projSpeed: 30 },
    passive: { name: '疾风连射', desc: '每第 3 次普攻造成 150% 伤害并减速目标 25%。' },
    skills: [
      { name: '穿云箭', target: 'dir', range: 11, width: 1.0, castTime: 0.2, cd: cd6(8, 6), cost: lv6(50, 5), ai: 'poke', autoTarget: 'any',
        desc: '射出穿透箭矢，对直线上敌人造成 {dmg} 点物理伤害。',
        vals: { dmg: { base: lv6(200, 45), ad: 0.9 } } },
      { name: '风之步', target: 'self', castTime: 0, cd: cd6(12, 9), cost: lv6(50, 5), ai: 'selfbuff',
        desc: '4 秒内攻击速度提高 {as}%，移动速度提高 25%。',
        vals: { as: { base: lv6(40, 8) } } },
      { name: '天罚之箭', target: 'dir', range: 60, width: 1.6, castTime: 0.3, cd: [50, 44, 38], cost: [100, 100, 100], ai: 'cc',
        desc: '射出一支贯穿地图的巨箭，命中第一个敌方英雄造成 {dmg} 点物理伤害并眩晕，飞得越远眩晕越久（1～2.5 秒）。',
        vals: { dmg: { base: lv3(400, 200), bonusAd: 1.0 } } },
    ],
    build: ['boots', 'windblade', 'boots_as', 'blade_inf', 'dawn', 'bloodblade', 'sage'],
  },
  {
    id: 'leihuo', name: '雷火', title: '机巧枪匠', roles: ['marksman'], positions: ['adc'], difficulty: 2,
    attack: 'ranged', projectile: 'bullet', model: 'gunner',
    colors: { primary: '#c58b2a', secondary: '#5a3e2b', accent: '#ffd23f', skin: '#e8c19c', hair: '#7a3b12' },
    base: { hp: 2950, hpG: 215, mp: 440, mpG: 70, ad: 172, adG: 12, armor: 86, armorG: 12, mr: 50, mrG: 5,
      ms: 7.0, range: 7.5, interval: 0.95, hpRegen: 7, hpRegenG: 0.9, mpRegen: 5, mpRegenG: 0.6, asG: 0.028, projSpeed: 34 },
    passive: { name: '爆裂弹', desc: '普攻命中时对目标周围敌人造成 40% 溅射伤害。' },
    skills: [
      { name: '战术翻滚', target: 'dir', range: 4.5, width: 1.2, castTime: 0, cd: cd6(9, 6), cost: lv6(40, 4), ai: 'escape',
        desc: '向指定方向翻滚，3 秒内下一次普攻额外造成 {dmg} 点物理伤害。',
        vals: { dmg: { base: lv6(100, 25), ad: 0.5 } } },
      { name: '震荡榴弹', target: 'point', range: 9, radius: 3, castTime: 0.15, cd: cd6(9, 7), cost: lv6(60, 5), ai: 'poke', autoTarget: 'any',
        desc: '抛出榴弹，落地爆炸造成 {dmg} 点物理伤害并减速 40%，持续 1.5 秒。',
        vals: { dmg: { base: lv6(190, 40), bonusAd: 0.7 } } },
      { name: '弹幕风暴', target: 'dir', range: 10, width: 6, spread: 40, castTime: 0.1, cd: [40, 35, 30], cost: [100, 110, 120], ai: 'aoe',
        desc: '架枪扫射 1.5 秒，向前方扇形射出 15 发子弹，每发造成 {dmg} 点物理伤害。',
        vals: { dmg: { base: lv3(80, 35), ad: 0.28 } } },
    ],
    build: ['boots', 'kings_blade', 'boots_as', 'blade_inf', 'dawn', 'bloodblade', 'sage'],
  },
  {
    id: 'lingquan', name: '灵泉', title: '青溪之心', roles: ['support'], positions: ['support'], difficulty: 1,
    attack: 'ranged', projectile: 'water', model: 'healer',
    colors: { primary: '#2fa58a', secondary: '#f3fff9', accent: '#7ef0d0', skin: '#f6dcc8', hair: '#1f6f5f' },
    base: { hp: 3200, hpG: 245, mp: 500, mpG: 90, ad: 158, adG: 8, armor: 95, armorG: 13, mr: 60, mrG: 6,
      ms: 7.1, range: 6.5, interval: 1.05, hpRegen: 9, hpRegenG: 1.0, mpRegen: 7, mpRegenG: 0.9, asG: 0.01, projSpeed: 22 },
    passive: { name: '生生不息', desc: '附近 7 米内的友方英雄每秒回复 {regen} 点生命。', vals: { regen: { base: [6], lvl: 2, ap: 0.02 } } },
    skills: [
      { name: '治愈之泉', target: 'point', range: 8, radius: 3.6, castTime: 0.15, cd: cd6(10, 7.5), cost: lv6(70, 6), ai: 'heal', autoTarget: 'ally',
        desc: '在目标位置涌出泉水，为范围内友方英雄回复 {heal} 点生命，并对敌人造成 {dmg} 点法术伤害。',
        vals: { heal: { base: lv6(180, 40), ap: 0.4 }, dmg: { base: lv6(120, 25), ap: 0.3 } } },
      { name: '灵缚', target: 'dir', range: 9, width: 1.2, castTime: 0.15, cd: cd6(11, 8.5), cost: lv6(60, 5), ai: 'cc',
        desc: '甩出藤灵，命中第一个敌人造成 {dmg} 点法术伤害并禁锢 1.5 秒。',
        vals: { dmg: { base: lv6(160, 35), ap: 0.5 } } },
      { name: '庇护之潮', target: 'self', radius: 12, castTime: 0.2, cd: [55, 48, 42], cost: [120, 130, 140], ai: 'teamshield',
        desc: '为 12 米内所有友方英雄提供 {shield} 点护盾（持续 4 秒），并提高 30% 移速 2 秒。',
        vals: { shield: { base: lv3(320, 180), ap: 0.6 } } },
    ],
    build: ['boots', 'phoenix', 'boots_cdr', 'holy_grail', 'witch', 'sage', 'overlord'],
  },
  {
    id: 'zhenyue', name: '镇岳', title: '金钟禅师', roles: ['tank', 'support'], positions: ['support', 'top'], difficulty: 2,
    attack: 'melee', model: 'monk',
    colors: { primary: '#e08e2b', secondary: '#7b2d26', accent: '#ffd166', skin: '#e5b88f', hair: '#e5b88f' },
    base: { hp: 3500, hpG: 300, mp: 460, mpG: 80, ad: 165, adG: 9, armor: 130, armorG: 18, mr: 70, mrG: 7,
      ms: 7.1, range: 2.2, interval: 1.05, hpRegen: 11, hpRegenG: 1.4, mpRegen: 6, mpRegenG: 0.7, asG: 0.015 },
    passive: { name: '金钟护体', desc: '每次施放技能后获得 {shield} 点护盾，持续 3 秒。', vals: { shield: { base: [80], lvl: 15, maxHp: 0.04 } } },
    skills: [
      { name: '锁链钩', target: 'dir', range: 10, width: 1.1, castTime: 0.2, cd: cd6(12, 9), cost: lv6(70, 5), ai: 'hook',
        desc: '甩出锁链，命中第一个敌人造成 {dmg} 点法术伤害，并将其拉到身前、眩晕 0.6 秒。',
        vals: { dmg: { base: lv6(170, 40), ap: 0.6 } } },
      { name: '金刚怒吼', target: 'self', radius: 4.2, castTime: 0.15, cd: cd6(10, 8), cost: lv6(60, 5), ai: 'aoe',
        desc: '怒吼震荡周围，造成 {dmg} 点法术伤害并减速 40%，自身双抗提高 30%，持续 4 秒。',
        vals: { dmg: { base: lv6(160, 35), maxHp: 0.03 } } },
      { name: '镇魂钟', target: 'self', radius: 5, castTime: 0.1, cd: [45, 40, 35], cost: [120, 120, 120], ai: 'engage',
        desc: '召唤巨钟落下，0.5 秒后击飞周围敌人 1 秒，造成 {dmg} 点法术伤害。',
        vals: { dmg: { base: lv3(260, 120), maxHp: 0.06 } } },
    ],
    build: ['boots', 'red_lotus', 'boots_mr', 'omen', 'witch', 'overlord', 'sage'],
  },
  {
    id: 'yangang', name: '岩罡', title: '不动山岳', roles: ['tank'], positions: ['top', 'support'], difficulty: 1,
    attack: 'melee', model: 'golem',
    colors: { primary: '#7d6b5d', secondary: '#4a3f37', accent: '#ff9f1c', skin: '#9c8a7a', hair: '#5e5046' },
    base: { hp: 3600, hpG: 310, mp: 450, mpG: 80, ad: 168, adG: 10, armor: 140, armorG: 19, mr: 70, mrG: 7,
      ms: 7.0, range: 2.4, interval: 1.1, hpRegen: 12, hpRegenG: 1.5, mpRegen: 6, mpRegenG: 0.7, asG: 0.015 },
    passive: { name: '岩肤', desc: '生命低于 40% 时获得 {shield} 点护盾，持续 5 秒（60 秒一次）。', vals: { shield: { base: [0], maxHp: 0.2 } } },
    skills: [
      { name: '震地冲锋', target: 'dir', range: 7, width: 1.8, castTime: 0.05, cd: cd6(11, 8.5), cost: lv6(60, 5), ai: 'engage',
        desc: '向前冲锋，撞到第一个敌方英雄时停下并将其击飞 0.75 秒；路径上的敌人受到 {dmg} 点物理伤害。',
        vals: { dmg: { base: lv6(150, 35), maxHp: 0.04 } } },
      { name: '岩崩', target: 'self', radius: 3.8, castTime: 0.15, cd: cd6(9, 7), cost: lv6(55, 5), ai: 'aoe',
        desc: '重击地面，造成 {dmg} 点法术伤害并减速 35%，自身受到的伤害降低 25%，持续 3 秒。',
        vals: { dmg: { base: lv6(170, 35), maxHp: 0.03 } } },
      { name: '山崩地裂', target: 'point', range: 10, radius: 4, castTime: 0.15, cd: [48, 42, 36], cost: [120, 120, 120], ai: 'engage',
        desc: '跃起砸向目标区域，落地时击飞范围内敌人 1.25 秒并造成 {dmg} 点物理伤害。',
        vals: { dmg: { base: lv3(250, 125), maxHp: 0.06 } } },
    ],
    build: ['boots', 'red_lotus', 'boots_armor', 'overlord', 'witch', 'thorns', 'omen'],
  },
];

export const HERO_BY_ID = Object.fromEntries(HEROES.map((h) => [h.id, h]));

// 计算技能数值：spec.base 按技能等级取值，再加上各项加成
export function calcVal(spec, hero, skillLvl = 1) {
  if (!spec) return 0;
  const b = spec.base[Math.min(spec.base.length, Math.max(1, skillLvl)) - 1] || 0;
  const s = hero.stats;
  let v = b;
  if (spec.ad) v += spec.ad * s.ad;
  if (spec.bonusAd) v += spec.bonusAd * Math.max(0, s.ad - hero.baseAd);
  if (spec.ap) v += spec.ap * s.ap;
  if (spec.maxHp) v += spec.maxHp * s.maxHp;
  if (spec.lvl) v += spec.lvl * (hero.level - 1);
  return Math.round(v);
}
