// 无界面完整对局：10 个电脑英雄对打直到水晶被推掉
// 运行：jsc -m tests/sim_match.js -- [种子] [难度] [最长分钟]
import { createMatch } from '../src/sim/match.js';
import { DT } from '../src/config.js';

const args = (typeof arguments !== 'undefined' ? arguments : []) || [];
const seed = +(args[0] || 7);
const difficulty = args[1] || 'normal';
const maxMin = +(args[2] || 40);
const verbose = args.includes('-v');

const { world: w } = createMatch({ seed, difficulty, spectate: true });
const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const name = (id) => { const u = w.unitById(id); return u ? (u.name || u.kind) + (u.team ? `[${u.team}]` : '') : '?' + id; };

const t0 = Date.now();
let problems = 0;
const stuck = new Map();
let lastReport = 0;
const counts = { kill: 0, towerDown: 0, drake: 0, guardian: 0 };
const evCount = {};
while (!w.over && w.time < maxMin * 60) {
  try { w.step(DT); }
  catch (e) { print(`!! 异常 @${fmt(w.time)}: ${e}\n${e.stack}`); problems++; break; }
  for (const ev of w.events) {
    evCount[ev.type] = (evCount[ev.type] || 0) + 1;
    if (ev.type === 'kill') { counts.kill++; if (verbose) print(`${fmt(w.time)} 击杀 ${name(ev.killer)} → ${name(ev.victim)}`); }
    else if (ev.type === 'towerDown') { counts.towerDown++; print(`${fmt(w.time)} ${ev.text}（${ev.team === 1 ? '蓝' : '红'}方 ${ev.lane || ''} ${ev.tier}）`); }
    else if (ev.type === 'announce' && ev.kind === 'objective') { counts[ev.boss]++; print(`${fmt(w.time)} ${ev.text}`); }
  }
  // 数值检查
  for (const u of w.units) {
    if (!Number.isFinite(u.x) || !Number.isFinite(u.y) || !Number.isFinite(u.hp)) {
      print(`!! 非法数值 ${u.kind} ${u.name || ''} x=${u.x} y=${u.y} hp=${u.hp}`); problems++; u.x = 100; u.y = 100; u.hp = 1;
    }
  }
  // 卡住检测：英雄 20 秒没移动且不在泉水、不在战斗
  if (w.tick % 30 === 0) {
    for (const h of w.heroes) {
      if (h.dead || h.inFountain || h.recalling) { stuck.delete(h.id); continue; }
      const s = stuck.get(h.id);
      if (!s || Math.hypot(s.x - h.x, s.y - h.y) > 2) stuck.set(h.id, { x: h.x, y: h.y, t: w.time });
      else if (w.time - s.t > 25 && w.time - h.lastCombatAt > 10) {
        print(`?? ${fmt(w.time)} ${h.name}[${h.team}] 疑似卡住 @(${h.x.toFixed(1)},${h.y.toFixed(1)}) 模式=${h.bot && h.bot.mode} 指令=${JSON.stringify(h.order && { ...h.order, target: h.order.target && h.order.target.id })}`);
        s.t = w.time;
      }
    }
  }
  if (w.time - lastReport >= 120) {
    lastReport = w.time;
    const row = (T) => w.heroes.filter((h) => h.team === T).map((h) => `${h.name}${h.level}级${h.kills}/${h.deaths}/${h.assists} ${h.cs}刀 ${h.items.length}件${h.dead ? '(死)' : ''}`).join(' | ');
    print(`—— ${fmt(w.time)} 比分 ${w.score[1]}:${w.score[2]} 推塔 ${w.towersDown[1]}:${w.towersDown[2]} 单位数 ${w.units.length}`);
    print('  蓝 ' + row(1));
    print('  红 ' + row(2));
  }
}
const sec = (Date.now() - t0) / 1000;
print(`\n==== 结果：${w.over ? (w.winner === 1 ? '蓝方胜' : '红方胜') : '超时未分胜负'}  时长 ${fmt(w.time)}  比分 ${w.score[1]}:${w.score[2]}  推塔 ${w.towersDown[1]}:${w.towersDown[2]}  小龙 ${counts.drake} 守卫 ${counts.guardian}`);
print(`模拟耗时 ${sec.toFixed(1)}s（${(w.time / sec).toFixed(0)} 倍速）  问题 ${problems}`);
print('事件统计 ' + JSON.stringify(evCount));
for (const h of w.heroes) print(`  ${h.team === 1 ? '蓝' : '红'} ${h.position.padEnd(7)} ${h.name} Lv${h.level} ${h.kills}/${h.deaths}/${h.assists} 补刀${h.cs} 金${Math.round(h.totalGold)} 装备:${h.items.join(',')}`);
if (problems) throw new Error('对局出现问题');
