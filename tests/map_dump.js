// 调试：把地图导出为字符画（供 tests/map_png.py 生成图片）
import { NavGrid } from '../src/sim/nav.js';
import { LANES, TOWERS, CAMPS, CRYSTALS, FOUNTAINS, inRiver } from '../src/data/map.js';
import { segDist2 } from '../src/util/math.js';
const nav = new NavGrid();
const N = 200;
const rows = [];
for (let y = 0; y < N; y++) {
  let s = '';
  for (let x = 0; x < N; x++) {
    const px = x + 0.5, py = y + 0.5;
    let ch = '.';
    if (inRiver(px, py)) ch = '~';
    for (const k in LANES) { const p = LANES[k].pts; for (let i = 1; i < p.length; i++) if (segDist2(px, py, p[i-1][0], p[i-1][1], p[i][0], p[i][1]) < 36) ch = '='; }
    if (nav.bush[y * N + x] >= 0) ch = 'b';
    if (nav.blocked[y * N + x]) ch = '#';
    s += ch;
  }
  rows.push(s);
}
const mark = (x, y, c, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const yy = Math.round(y) + dy, xx = Math.round(x) + dx; if (yy >= 0 && yy < N && xx >= 0 && xx < N) rows[yy] = rows[yy].slice(0, xx) + c + rows[yy].slice(xx + 1); } };
for (const t of TOWERS) mark(t.x, t.y, t.team === 1 ? 'T' : 'U', 1);
for (const c of CAMPS) mark(c.x, c.y, 'C', 1);
for (const k in CRYSTALS) mark(CRYSTALS[k].x, CRYSTALS[k].y, 'X', 2);
for (const k in FOUNTAINS) mark(FOUNTAINS[k].x, FOUNTAINS[k].y, 'F', 2);
print(rows.join('\n'));
