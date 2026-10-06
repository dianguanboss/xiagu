// 单元测试：规则与界面逻辑里不依赖浏览器的部分
// 运行：jsc -m tests/unit.js
import { createMatch } from '../src/sim/match.js';
import { DT, MAX_LEVEL, XP_TO_NEXT, ECON, TIMING } from '../src/config.js';
import { SPELLS } from '../src/sim/hero.js';
import { dealDamage } from '../src/sim/combat.js';
import { HEROES } from '../src/data/heroes.js';
import { ITEMS, ITEM_BY_ID, MAX_ITEMS } from '../src/data/items.js';
import { FOUNTAINS } from '../src/data/map.js';
import { soundsForEvents, floatsForEvents, SKILL_SFX } from '../src/eventsounds.js';
import { nextRecommended, statText } from '../src/ui/shop.js';
import { AudioEngine } from '../src/audio/audio.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; print(`  ✓ ${name}`); }
  catch (e) { fail++; print(`  ✗ ${name}\n      ${e.message}`); }
}
function eq(a, b, msg = '') { if (a !== b) throw new Error(`${msg} 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }
function ok(v, msg = '条件不成立') { if (!v) throw new Error(msg); }

const newGame = (hero = 'zhufeng', seed = 11) => createMatch({ seed, playerHero: hero, difficulty: 'normal' });
const run = (w, sec) => { for (let i = 0; i < Math.round(sec / DT); i++) w.step(DT); };
// 中路靠己方一侧、远离防御塔的空地
const midSpot = (team) => (team === 1 ? { x: 92, y: 108 } : { x: 108, y: 92 });

// —— 音效与飘字 ——
print('音效与飘字');
const fakeWorld = (units) => ({ unitById: (id) => units.find((u) => u.id === id) || null });
const H1 = { id: 1, kind: 'hero', ranged: true, projStyle: 'arrow', def: { roles: ['marksman'] } };
const H2 = { id: 2, kind: 'hero', ranged: false, projStyle: 'basic', def: { roles: ['tank'] } };
const T1 = { id: 3, kind: 'tower', ranged: true, projStyle: 'tower' };
const SW = fakeWorld([H1, H2, T1]);
const ctx = (o = {}) => ({ playerId: 1, spectate: false, isVisible: () => true, ...o });

test('远程英雄普攻按弹道出声，近战英雄挥砍', () => {
  const r = soundsForEvents([{ type: 'attack', src: 1, x: 0, y: 0 }, { type: 'attack', src: 2, x: 0, y: 0 }], SW, ctx());
  eq(r.map((s) => s.name).join(), 'arrow_shoot,swing');
});
test('坦克命中用重击声，暴击优先', () => {
  const r = soundsForEvents([{ type: 'hit', src: 2, kind: 'hero', x: 0, y: 0 }, { type: 'hit', src: 1, kind: 'hero', crit: true, x: 0, y: 0 }], SW, ctx());
  eq(r.map((s) => s.name).join(), 'hit_heavy,crit');
});
test('迷雾里看不见的声音不播，观战时都播', () => {
  const evs = [{ type: 'attack', src: 3, x: 5, y: 5 }];
  eq(soundsForEvents(evs, SW, ctx({ isVisible: () => false })).length, 0);
  eq(soundsForEvents(evs, SW, ctx({ isVisible: () => false, spectate: true })).length, 1);
});
test('金币 / 升级 / 购买只给玩家自己出声', () => {
  const evs = [{ type: 'gold', hero: 2, amount: 50 }, { type: 'gold', hero: 1, amount: 50 }, { type: 'levelUp', hero: 2 }, { type: 'buy', hero: 1 }];
  eq(soundsForEvents(evs, SW, ctx()).map((s) => s.name).join(), 'gold,ui_buy');
});
test('每个英雄三个技能都有音效', () => {
  for (const h of HEROES) { ok(SKILL_SFX[h.id], `缺少 ${h.id}`); eq(SKILL_SFX[h.id].length, 3, h.id); }
});
test('代码里用到的音效名都在音效库里', () => {
  const names = new Set(AudioEngine.SOUND_NAMES);
  const used = new Set();
  for (const list of Object.values(SKILL_SFX)) list.forEach((n) => used.add(n));
  const files = ['src/eventsounds.js', 'src/game.js', 'src/input.js', 'src/ui/hud.js', 'src/ui/shop.js', 'src/ui/menu.js', 'src/ui/common.js'];
  for (const f of files) {
    const src = read(f);
    for (const m of src.matchAll(/(?:audio\.play|sfx|ui|at)\('([a-z_]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/sound: '([a-z_]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/onTap\([^;]*?, '([a-z_]+)'\)/g)) used.add(m[1]);
  }
  const missing = [...used].filter((n) => !names.has(n));
  eq(missing.join(','), '', '缺少的音效：');
  ok(used.size > 40, `只找到 ${used.size} 个音效名，匹配规则可能失效`);
});
test('飘字：自己打出的伤害按类型着色，自己受伤显示负数', () => {
  const evs = [
    { type: 'damage', src: 1, target: 2, amount: 120, dtype: 'phys', x: 0, y: 0 },
    { type: 'damage', src: 1, target: 2, amount: 300, dtype: 'phys', crit: true, x: 0, y: 0 },
    { type: 'damage', src: 1, target: 2, amount: 80, dtype: 'magic', x: 0, y: 0 },
    { type: 'damage', src: 2, target: 1, amount: 50, dtype: 'phys', x: 0, y: 0 },
    { type: 'damage', src: 3, target: 2, amount: 500, dtype: 'phys', x: 0, y: 0 },
  ];
  const r = floatsForEvents(evs, SW, ctx());
  eq(r.map((f) => f.style).join(), 'phys,crit,magic,taken');
  eq(r[3].text, '-50');
});

// —— 商店 ——
print('商店与装备');
test('每个英雄的推荐出装都是真实存在的装备', () => {
  for (const h of HEROES) for (const id of h.build) ok(ITEM_BY_ID[id], `${h.id} 的 ${id} 不存在`);
});
test('推荐下一件：按顺序跳过已有的', () => {
  const { player: p } = newGame('zhufeng');
  const first = nextRecommended(p);
  eq(first.id, p.def.build[0]);
  p.gold = 99999;
  ok(p.buy(first.id));
  ok(nextRecommended(p).id !== first.id, '买过的不应再推荐');
});
test('买鞋后升级鞋只补差价，并替换原来的鞋', () => {
  const { player: p } = newGame('liefeng');
  p.gold = 99999;
  ok(p.buy('boots'));
  const adv = ITEMS.find((it) => it.boots && it.id !== 'boots');
  eq(p.buyCost(adv.id), adv.cost - ITEM_BY_ID.boots.cost);
  const before = p.gold;
  ok(p.buy(adv.id));
  eq(before - p.gold, adv.cost - ITEM_BY_ID.boots.cost);
  ok(!p.items.includes('boots') && p.items.includes(adv.id), '鞋没有被替换');
  ok(!p.canBuy('boots'), '已有进阶鞋不能再买鞋');
});
test('装备栏满 6 件不能再买；出售返还 60%', () => {
  const { player: p } = newGame('yanji');
  p.gold = 999999;
  const cheap = ITEMS.filter((it) => !it.boots && it.passive !== 'jungle').slice(0, MAX_ITEMS);
  for (const it of cheap) ok(p.buy(it.id), `买不了 ${it.id}`);
  eq(p.items.length, MAX_ITEMS);
  ok(!p.canBuy(cheap[0].id), '满了还能买');
  const g = p.gold;
  ok(p.sell(0));
  eq(p.gold - g, Math.floor(cheap[0].cost * ECON.sellRatio));
  eq(ECON.sellRatio, 0.6);
});
test('买装备后属性立刻生效', () => {
  const { player: p } = newGame('zhufeng');
  p.gold = 99999;
  const it = ITEMS.find((x) => x.stats.ad >= 20);
  const ad = p.stats.ad;
  p.buy(it.id);
  eq(Math.round(p.stats.ad - ad), it.stats.ad);
});
test('装备说明文字能生成', () => {
  for (const it of ITEMS) ok(statText(it.stats).length > 0 || it.desc, `${it.id} 没有说明`);
});

// —— 成长 ——
print('等级与技能');
test('1 级有 1 个技能点，大招 4 级才能学', () => {
  const { player: p } = newGame();
  eq(p.level, 1);
  eq(p.skillPoints, 1);
  ok(!p.canUpgrade(2), '1 级不能学大招');
  ok(p.upgradeSkill(0));
  ok(!p.canUpgrade(1), '没有技能点了');
});
test('经验够了逐级升级，满级 15 级', () => {
  const { player: p } = newGame();
  let sum = 0;
  for (let i = 1; i < MAX_LEVEL; i++) sum += XP_TO_NEXT[i];
  p.gainXp(sum + 99999);
  eq(p.level, MAX_LEVEL);
  eq(p.skillPoints, MAX_LEVEL);
});
test('小技能等级不超过英雄等级的一半（向上取整）', () => {
  const { player: p } = newGame();
  p.gainXp(XP_TO_NEXT[1] + XP_TO_NEXT[2]); // 3 级
  eq(p.level, 3);
  ok(p.upgradeSkill(0)); ok(p.upgradeSkill(0));
  ok(!p.canUpgrade(0), '3 级时一技能最多 2 级');
  ok(p.upgradeSkill(1));
});
test('自动加点会把技能点用完', () => {
  const { world: w } = createMatch({ seed: 5, playerHero: 'yanji', autoLevel: true });
  const p = w.player;
  p.gainXp(5000);
  run(w, 0.1);
  eq(p.skillPoints, 0);
  ok(p.skills[2].level >= 1, '到 4 级应自动学大招');
});

// —— 召唤师技能与回城 ——
print('召唤师技能与回城');
test('闪现最多 7.5 米并进入冷却', () => {
  const { world: w, player: p } = createMatch({ seed: 3, playerHero: 'zhufeng', playerSpell: 'flash' });
  const a = midSpot(p.team);
  p.x = p.px = a.x; p.y = p.py = a.y;
  const x0 = p.x, y0 = p.y;
  ok(p.useSpell({ x: p.x + 20, y: p.y }));
  const d = Math.hypot(p.x - x0, p.y - y0);
  ok(d <= SPELLS.flash.range + 0.01 && d > 2, `闪现距离 ${d.toFixed(2)}`);
  eq(p.spell.cdLeft, SPELLS.flash.cd);
  ok(!p.useSpell({ x: 0, y: 0 }), '冷却中不能再用');
});
test('回城 6 秒后回到泉水；在泉水里不能回城', () => {
  const { world: w, player: p } = newGame('lingquan', 21);
  run(w, 0.1);
  ok(!p.startRecall(), '泉水里回城应该失败');
  const a = midSpot(p.team);
  p.x = p.px = a.x; p.y = p.py = a.y;
  run(w, 0.2);
  ok(p.startRecall(), '回城没开始');
  run(w, TIMING.recallTime - 0.5);
  ok(p.recalling, '回城提前结束了');
  run(w, 1);
  ok(!p.recalling, '回城没结束');
  ok(Math.hypot(p.x - FOUNTAINS[p.team].x, p.y - FOUNTAINS[p.team].y) < 12, `没回到泉水 (${p.x | 0},${p.y | 0})`);
});
test('回城途中受到伤害会被打断', () => {
  const { world: w, player: p } = newGame('lingquan', 22);
  const a = midSpot(p.team);
  p.x = p.px = a.x; p.y = p.py = a.y;
  run(w, 0.2);
  ok(p.startRecall());
  const enemy = w.heroes.find((h) => h.team !== p.team);
  dealDamage(w, enemy, p, 10, 'phys');
  ok(!p.recalling, '回城没被打断');
});

// —— 整局流程 ——
print('对局流程');
test('开局 10 个英雄、两方水晶、小兵按波次出现', () => {
  const { world: w } = newGame('zhenyue', 9);
  eq(w.heroes.length, 10);
  eq(w.towers.filter((t) => t.kind === 'crystal').length, 2);
  run(w, 45);
  ok(w.units.some((u) => u.kind === 'minion' && !u.dead), '45 秒还没有小兵');
});
test('玩家站着不动时电脑不会替玩家操作', () => {
  const { world: w, player: p } = newGame('yangang', 4);
  const x = p.x, y = p.y;
  run(w, 20);
  ok(Math.hypot(p.x - x, p.y - y) < 0.5, '玩家英雄被别人控制了');
});
test('投降：直接判对面获胜（游戏里的处理方式）', () => {
  const { world: w, player: p } = newGame('zhufeng', 8);
  w.over = true; w.winner = p.team === 1 ? 2 : 1;
  const t = w.time;
  run(w, 1);
  eq(w.time, t, '结束后不应再推进');
});

print(`\n通过 ${pass} 项，失败 ${fail} 项`);
if (fail) throw new Error(`${fail} 项测试失败`);
