// 寻路网格：1 米一格，墙体按单位半径膨胀后标记为阻挡
import { MAP_SIZE } from '../config.js';
import { WALLS, BUSHES, MAP_BORDER } from '../data/map.js';
import { pointInPoly, polyDist2 } from '../util/math.js';

const N = MAP_SIZE;
const INFLATE = 0.75;

export class NavGrid {
  constructor() {
    this.n = N;
    this.blocked = new Uint8Array(N * N);
    this.bush = new Int16Array(N * N).fill(-1);
    this._build();
    // A* 缓冲
    this.g = new Float32Array(N * N);
    this.came = new Int32Array(N * N);
    this.stamp = new Uint32Array(N * N);
    this.closed = new Uint32Array(N * N);
    this.curStamp = 0;
    this.heap = new Int32Array(N * N);
    this.heapF = new Float32Array(N * N);
  }

  _build() {
    for (let cy = 0; cy < N; cy++) {
      for (let cx = 0; cx < N; cx++) {
        const x = cx + 0.5, y = cy + 0.5;
        let b = x < MAP_BORDER || y < MAP_BORDER || x > N - MAP_BORDER || y > N - MAP_BORDER;
        if (!b) {
          for (const w of WALLS) {
            if (pointInPoly(x, y, w) || polyDist2(x, y, w) < INFLATE * INFLATE) { b = true; break; }
          }
        }
        this.blocked[cy * N + cx] = b ? 1 : 0;
        for (const bu of BUSHES) {
          const dx = x - bu.x, dy = y - bu.y;
          if (dx * dx + dy * dy <= bu.r * bu.r) { this.bush[cy * N + cx] = bu.id; break; }
        }
      }
    }
  }

  cell(x, y) {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return -1;
    return cy * N + cx;
  }
  isBlocked(x, y) {
    const c = this.cell(x, y);
    return c < 0 || this.blocked[c] === 1;
  }
  bushAt(x, y) {
    const c = this.cell(x, y);
    return c < 0 ? -1 : this.bush[c];
  }

  // 视线/直线可通行检查
  los(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const L = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(L / 0.4);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.isBlocked(ax + dx * t, ay + dy * t)) return false;
    }
    return true;
  }

  // 沿直线走到第一个阻挡前的位置（用于闪现、位移技能）
  clipMove(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const L = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(L / 0.25));
    let lx = ax, ly = ay;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + dx * t, y = ay + dy * t;
      if (this.isBlocked(x, y)) return { x: lx, y: ly, clipped: true };
      lx = x; ly = y;
    }
    return { x: bx, y: by, clipped: false };
  }

  // 闪现：目标点在墙内时，沿方向往回找最近可站立点（可以穿墙）
  blinkTarget(ax, ay, bx, by) {
    if (!this.isBlocked(bx, by)) return { x: bx, y: by };
    const dx = bx - ax, dy = by - ay;
    const L = Math.sqrt(dx * dx + dy * dy);
    // 先往前找（穿过薄墙），再往回找
    for (let e = 0.5; e <= 4; e += 0.5) {
      const x = bx + dx / L * e, y = by + dy / L * e;
      if (!this.isBlocked(x, y)) return { x, y };
    }
    for (let e = 0.5; e <= L; e += 0.5) {
      const x = bx - dx / L * e, y = by - dy / L * e;
      if (!this.isBlocked(x, y)) return { x, y };
    }
    return { x: ax, y: ay };
  }

  nearestFree(x, y, maxR = 12) {
    if (!this.isBlocked(x, y)) return { x, y };
    for (let r = 1; r <= maxR; r++) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const px = x + Math.cos(ang) * r, py = y + Math.sin(ang) * r;
        if (!this.isBlocked(px, py)) return { x: px, y: py };
      }
    }
    return { x, y };
  }

  // A* 八方向，不切角；返回平滑后的路径点数组 [{x,y}, ...]（不含起点）
  findPath(sx, sy, tx, ty, maxExpand = 12000) {
    let start = this.cell(sx, sy), goal = this.cell(tx, ty);
    if (start < 0 || goal < 0) return null;
    if (this.blocked[goal]) {
      const f = this.nearestFree(tx, ty);
      tx = f.x; ty = f.y; goal = this.cell(tx, ty);
    }
    if (this.blocked[start]) {
      const f = this.nearestFree(sx, sy);
      start = this.cell(f.x, f.y);
    }
    if (start === goal || this.los(sx, sy, tx, ty)) return [{ x: tx, y: ty }];

    const s = ++this.curStamp;
    const g = this.g, came = this.came, stamp = this.stamp, closed = this.closed;
    const heap = this.heap, hf = this.heapF;
    let hn = 0;
    const gx = goal % N, gy = (goal / N) | 0;
    const H = (c) => {
      const dx = Math.abs((c % N) - gx), dy = Math.abs(((c / N) | 0) - gy);
      return dx > dy ? dx + 0.4142 * dy : dy + 0.4142 * dx;
    };
    const push = (c, f) => {
      let i = hn++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hf[p] <= f) break;
        heap[i] = heap[p]; hf[i] = hf[p]; i = p;
      }
      heap[i] = c; hf[i] = f;
    };
    const pop = () => {
      const top = heap[0];
      const lc = heap[--hn], lf = hf[hn];
      let i = 0;
      while (true) {
        let l = i * 2 + 1;
        if (l >= hn) break;
        if (l + 1 < hn && hf[l + 1] < hf[l]) l++;
        if (hf[l] >= lf) break;
        heap[i] = heap[l]; hf[i] = hf[l]; i = l;
      }
      heap[i] = lc; hf[i] = lf;
      return top;
    };

    stamp[start] = s; g[start] = 0; came[start] = -1;
    push(start, H(start));
    let expanded = 0, found = false;
    const blocked = this.blocked;
    while (hn > 0) {
      const c = pop();
      if (closed[c] === s) continue;
      closed[c] = s;
      if (c === goal) { found = true; break; }
      if (++expanded > maxExpand) break;
      const cx = c % N, cy = (c / N) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const nc = ny * N + nx;
          if (blocked[nc] || closed[nc] === s) continue;
          if (dx && dy && (blocked[cy * N + nx] || blocked[ny * N + cx])) continue;
          const ng = g[c] + (dx && dy ? 1.4142 : 1);
          if (stamp[nc] !== s || ng < g[nc]) {
            stamp[nc] = s; g[nc] = ng; came[nc] = c;
            push(nc, ng + H(nc));
          }
        }
      }
    }
    if (!found) return null;
    const raw = [];
    for (let c = goal; c !== -1 && c !== start; c = came[c]) raw.push(c);
    raw.reverse();
    const pts = raw.map((c) => ({ x: (c % N) + 0.5, y: ((c / N) | 0) + 0.5 }));
    pts[pts.length - 1] = { x: tx, y: ty };
    // 视线平滑
    const out = [];
    let ax = sx, ay = sy, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.los(ax, ay, pts[j].x, pts[j].y)) j--;
      out.push(pts[j]);
      ax = pts[j].x; ay = pts[j].y;
      i = j + 1;
    }
    return out;
  }
}
