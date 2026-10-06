// 批量无界面对局：多个种子 × 难度，统计胜负、时长、击杀，检查异常
// 运行：jsc -m tests/sim_batch.js -- [每种难度局数] [难度列表，逗号分隔]
import { createMatch } from '../src/sim/match.js';
import { DT } from '../src/config.js';

const args = (typeof arguments !== 'undefined' ? arguments : []) || [];
const n = +(args[0] || 4);
const diffs = (args[1] || 'easy,normal,hard').split(',');
const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
let fail = 0;
for (const diff of diffs) {
  let blueWins = 0, totalT = 0, totalK = 0;
  for (let i = 0; i < n; i++) {
    const seed = 1000 + i * 17;
    // 观战模式下蓝方也由电脑控制（普通难度），红方使用所测难度
    const { world: w } = createMatch({ seed, difficulty: diff, spectate: true });
    let err = null;
    try {
      while (!w.over && w.time < 45 * 60) {
        w.step(DT);
        if (w.tick % 300 === 0) for (const u of w.units) if (!Number.isFinite(u.x + u.y + u.hp)) throw new Error(`非法数值 ${u.kind}`);
      }
    } catch (e) { err = e; }
    const kills = w.score[1] + w.score[2];
    const line = `${diff} 种子${seed}: ${err ? '异常 ' + err : w.over ? (w.winner === 1 ? '蓝胜' : '红胜') : '超时'} ${fmt(w.time)} 比分${w.score[1]}:${w.score[2]} 推塔${w.towersDown[1]}:${w.towersDown[2]}`;
    print(line);
    if (err) print(err.stack);
    if (err || !w.over) fail++;
    if (w.winner === 1) blueWins++;
    totalT += w.time; totalK += kills;
  }
  print(`== ${diff}: 蓝方(普通)胜 ${blueWins}/${n}，平均时长 ${fmt(totalT / n)}，平均总击杀 ${(totalK / n).toFixed(1)}\n`);
}
print(fail ? `有 ${fail} 局异常或超时` : '全部对局正常结束');
if (fail) throw new Error('批量对局未通过');
