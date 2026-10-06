// 程序生成贴图：地面总图、细节噪声、水面、粒子圆点
import * as THREE from 'three';
import { LANES, LANE_WIDTH, WALLS, BUSHES, FOUNTAINS, CRYSTALS, RIVER_HALF_WIDTH, MAP_BORDER, CAMPS } from '../data/map.js';
import { MAP_SIZE } from '../config.js';
import { RNG } from '../util/rng.js';

export function canvasTexture(canvas, { repeat = null, srgb = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.anisotropy = 4;
  t.generateMipmaps = mips;
  return t;
}

function mk(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

// —— 地面总图：1 像素 = MAP_SIZE/size 米，画布坐标与模拟坐标同向 ——
export function makeGroundCanvas(size = 2048) {
  const [c, g] = mk(size);
  const k = size / MAP_SIZE;
  const rng = new RNG(20261006);
  const P = (x) => x * k;

  // 草地底色 + 斑驳
  g.fillStyle = '#4f8a3a';
  g.fillRect(0, 0, size, size);
  const greens = ['#5d9a42', '#467d34', '#6aa64b', '#3f7330', '#578f3e', '#72ad52'];
  for (let i = 0; i < 2600; i++) {
    g.globalAlpha = 0.10 + rng.next() * 0.16;
    g.fillStyle = greens[(rng.next() * greens.length) | 0];
    g.beginPath();
    g.arc(rng.next() * size, rng.next() * size, P(1.5 + rng.next() * 7), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // 野区：离三条路较远处略暗（用宽线反向提亮路旁）
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(120,170,80,0.22)';
  for (const L of Object.values(LANES)) {
    g.lineWidth = P(LANE_WIDTH * 2.4);
    g.beginPath();
    L.pts.forEach(([x, y], i) => (i ? g.lineTo(P(x), P(y)) : g.moveTo(P(x), P(y))));
    g.stroke();
  }

  // 营地空地
  for (const cp of CAMPS) {
    const r = cp.type === 'drake' || cp.type === 'guardian' ? 9 : 5.5;
    const grd = g.createRadialGradient(P(cp.x), P(cp.y), 0, P(cp.x), P(cp.y), P(r));
    grd.addColorStop(0, 'rgba(128,104,70,0.85)');
    grd.addColorStop(0.7, 'rgba(118,98,66,0.55)');
    grd.addColorStop(1, 'rgba(118,98,66,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(P(cp.x), P(cp.y), P(r), 0, Math.PI * 2); g.fill();
  }

  // 河床（沙岸 + 深色河底），水面另有一层透明平面
  const r0 = 15, r1 = 185;
  g.strokeStyle = '#b59f72';
  g.lineWidth = P(RIVER_HALF_WIDTH * 2 + 4.5);
  g.beginPath(); g.moveTo(P(r0), P(r0)); g.lineTo(P(r1), P(r1)); g.stroke();
  g.strokeStyle = '#2f5d6e';
  g.lineWidth = P(RIVER_HALF_WIDTH * 2 - 0.5);
  g.beginPath(); g.moveTo(P(r0), P(r0)); g.lineTo(P(r1), P(r1)); g.stroke();
  for (let i = 0; i < 260; i++) {
    const t = rng.next(), off = (rng.next() - 0.5) * RIVER_HALF_WIDTH * 1.8;
    const x = r0 + (r1 - r0) * t + off * 0.7071, y = r0 + (r1 - r0) * t - off * 0.7071;
    g.fillStyle = rng.next() < 0.5 ? 'rgba(60,110,120,0.5)' : 'rgba(30,70,85,0.5)';
    g.beginPath(); g.arc(P(x), P(y), P(0.6 + rng.next() * 1.6), 0, Math.PI * 2); g.fill();
  }

  // 三条路：石板路
  const lane = (w, color) => {
    g.strokeStyle = color; g.lineWidth = P(w);
    for (const L of Object.values(LANES)) {
      g.beginPath();
      L.pts.forEach(([x, y], i) => (i ? g.lineTo(P(x), P(y)) : g.moveTo(P(x), P(y))));
      g.stroke();
    }
  };
  lane(LANE_WIDTH * 0.95, '#8c7a58');
  lane(LANE_WIDTH * 0.82, '#b8a47a');
  lane(LANE_WIDTH * 0.55, '#c6b38a');
  // 路面碎石块
  for (const L of Object.values(LANES)) {
    const n = Math.floor(L.length * 2.2);
    for (let i = 0; i < n; i++) {
      const d = rng.next() * L.length;
      let a = 0, seg = 0;
      while (seg < L.acc.length - 2 && L.acc[seg + 1] < d) seg++;
      const [ax, ay] = L.pts[seg], [bx, by] = L.pts[seg + 1];
      const sl = L.acc[seg + 1] - L.acc[seg];
      a = sl > 0 ? (d - L.acc[seg]) / sl : 0;
      const nx = -(by - ay) / (sl || 1), ny = (bx - ax) / (sl || 1);
      const off = (rng.next() - 0.5) * LANE_WIDTH * 0.75;
      const x = ax + (bx - ax) * a + nx * off, y = ay + (by - ay) * a + ny * off;
      const s = 0.4 + rng.next() * 0.9;
      g.fillStyle = rng.next() < 0.5 ? 'rgba(150,132,98,0.55)' : 'rgba(214,200,164,0.45)';
      g.save(); g.translate(P(x), P(y)); g.rotate(rng.next() * 3);
      g.fillRect(-P(s), -P(s * 0.7), P(s * 2), P(s * 1.4));
      g.restore();
    }
  }

  // 基地高台：石砖广场
  for (const team of [1, 2]) {
    const cr = CRYSTALS[team], f = FOUNTAINS[team];
    const tint = team === 1 ? ['#8e9fb3', '#a9b8c9', '#6f8196'] : ['#b39a8e', '#c9b0a3', '#96776b'];
    const cx = (cr.x + f.x) / 2, cy = (cr.y + f.y) / 2;
    const grd = g.createRadialGradient(P(cx), P(cy), P(6), P(cx), P(cy), P(34));
    grd.addColorStop(0, tint[1]); grd.addColorStop(0.75, tint[0]); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(P(cx), P(cy), P(34), 0, Math.PI * 2); g.fill();
    // 砖缝
    g.save();
    g.beginPath(); g.arc(P(cx), P(cy), P(28), 0, Math.PI * 2); g.clip();
    g.strokeStyle = 'rgba(60,60,70,0.25)'; g.lineWidth = Math.max(1, P(0.12));
    for (let r = 4; r < 30; r += 3.2) { g.beginPath(); g.arc(P(cx), P(cy), P(r), 0, Math.PI * 2); g.stroke(); }
    for (let a = 0; a < 24; a++) {
      const an = (a / 24) * Math.PI * 2;
      g.beginPath(); g.moveTo(P(cx + Math.cos(an) * 4), P(cy + Math.sin(an) * 4)); g.lineTo(P(cx + Math.cos(an) * 30), P(cy + Math.sin(an) * 30)); g.stroke();
    }
    g.restore();
    // 泉水圆台
    g.fillStyle = tint[2];
    g.beginPath(); g.arc(P(f.x), P(f.y), P(11), 0, Math.PI * 2); g.fill();
    g.strokeStyle = team === 1 ? 'rgba(90,170,255,0.9)' : 'rgba(255,100,90,0.9)';
    g.lineWidth = P(0.8);
    g.beginPath(); g.arc(P(f.x), P(f.y), P(10.2), 0, Math.PI * 2); g.stroke();
  }

  // 草丛地面略深
  for (const b of BUSHES) {
    g.fillStyle = 'rgba(40,80,30,0.55)';
    g.beginPath(); g.arc(P(b.x), P(b.y), P(b.r + 0.6), 0, Math.PI * 2); g.fill();
  }
  // 墙脚阴影
  g.fillStyle = 'rgba(40,46,30,0.55)';
  g.strokeStyle = 'rgba(40,46,30,0.35)'; g.lineWidth = P(3);
  for (const w of WALLS) {
    g.beginPath();
    w.forEach(([x, y], i) => (i ? g.lineTo(P(x), P(y)) : g.moveTo(P(x), P(y))));
    g.closePath(); g.fill(); g.stroke();
  }
  // 地图边缘：森林地面
  const bw = MAP_BORDER + 2;
  const edge = (x, y, w, h, gx0, gy0, gx1, gy1) => {
    const grd = g.createLinearGradient(P(gx0), P(gy0), P(gx1), P(gy1));
    grd.addColorStop(0, '#2c4a22'); grd.addColorStop(1, 'rgba(44,74,34,0)');
    g.fillStyle = grd; g.fillRect(P(x), P(y), P(w), P(h));
  };
  edge(0, 0, MAP_SIZE, bw, 0, 0, 0, bw);
  edge(0, MAP_SIZE - bw, MAP_SIZE, bw, 0, MAP_SIZE, 0, MAP_SIZE - bw);
  edge(0, 0, bw, MAP_SIZE, 0, 0, bw, 0);
  edge(MAP_SIZE - bw, 0, bw, MAP_SIZE, MAP_SIZE, 0, MAP_SIZE - bw, 0);
  return c;
}

// 细节噪声（平铺，均值约 0.62，着色器里 ×1.6 还原亮度）
export function makeDetailCanvas(size = 256) {
  const [c, g] = mk(size);
  const img = g.createImageData(size, size);
  const rng = new RNG(7);
  // 简单值噪声叠加
  const grid = (n) => { const a = new Float32Array((n + 1) * (n + 1)); for (let i = 0; i < a.length; i++) a[i] = rng.next(); for (let i = 0; i <= n; i++) { a[i * (n + 1) + n] = a[i * (n + 1)]; a[n * (n + 1) + i] = a[i]; } return a; };
  const octs = [[8, 0.5], [16, 0.3], [64, 0.2]].map(([n, w]) => ({ n, w, a: grid(n) }));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const o of octs) {
        const fx = (x / size) * o.n, fy = (y / size) * o.n;
        const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const N = o.n + 1;
        const a = o.a[iy * N + ix], b = o.a[iy * N + ix + 1], cc = o.a[(iy + 1) * N + ix], d = o.a[(iy + 1) * N + ix + 1];
        v += (a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy) * o.w;
      }
      const g8 = Math.round(255 * (0.47 + v * 0.3));
      const i = (y * size + x) * 4;
      img.data[i] = g8; img.data[i + 1] = g8; img.data[i + 2] = g8; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// 水面波纹（平铺）
export function makeWaterCanvas(size = 256) {
  const [c, g] = mk(size);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  const rng = new RNG(99);
  g.strokeStyle = 'rgba(160,215,255,0.9)';
  for (let i = 0; i < 70; i++) {
    const x = rng.next() * size, y = rng.next() * size, r = 6 + rng.next() * 26;
    g.lineWidth = 1 + rng.next() * 2.2;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      g.beginPath(); g.ellipse(x + ox, y + oy, r, r * 0.45, rng.next() * 0.2, 0.3, Math.PI * 0.9 + rng.next()); g.stroke();
    }
  }
  return c;
}

// 粒子用的柔和圆点
export function makeDotCanvas(size = 64) {
  const [c, g] = mk(size);
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return c;
}

// 地面贴花用的环形渐变（技能范围、警示圈）
export function makeRingCanvas(size = 256) {
  const [c, g] = mk(size);
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0.10)');
  grd.addColorStop(0.82, 'rgba(255,255,255,0.28)');
  grd.addColorStop(0.93, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return c;
}
