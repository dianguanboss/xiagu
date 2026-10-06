// 小地图：地形底图（只画一次）+ 迷雾 + 塔 / 野怪 / 小兵 / 英雄 + 当前镜头范围
import { MAP_SIZE } from '../config.js';
import { LANES, WALLS, BUSHES, CAMPS, FOUNTAINS, RIVER_HALF_WIDTH } from '../data/map.js';
import { FOW_N } from '../render/fog.js';

const N = 320;          // 画布像素
const K = N / MAP_SIZE;
const TEAM = { 1: '#3b9bff', 2: '#ff4a4a' };

function drawBase() {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#1f3a1a'; g.fillRect(0, 0, N, N);
  // 河道
  g.save();
  g.translate(N / 2, N / 2); g.rotate(Math.PI / 4);
  g.fillStyle = '#2c5f86';
  g.fillRect(-N * 0.62, -RIVER_HALF_WIDTH * K, N * 1.24, RIVER_HALF_WIDTH * 2 * K);
  g.restore();
  // 三路
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const lane of Object.values(LANES)) {
    g.strokeStyle = '#b9a77c'; g.lineWidth = 7 * K * 1.1;
    g.beginPath();
    lane.pts.forEach(([x, y], i) => (i ? g.lineTo(x * K, y * K) : g.moveTo(x * K, y * K)));
    g.stroke();
  }
  // 墙
  g.fillStyle = '#0f1d0c';
  g.strokeStyle = '#3d5a30'; g.lineWidth = 1;
  for (const w of WALLS) {
    g.beginPath();
    w.forEach(([x, y], i) => (i ? g.lineTo(x * K, y * K) : g.moveTo(x * K, y * K)));
    g.closePath(); g.fill(); g.stroke();
  }
  // 草丛
  g.fillStyle = 'rgba(70,140,50,0.75)';
  for (const b of BUSHES) { g.beginPath(); g.arc(b.x * K, b.y * K, b.r * K, 0, Math.PI * 2); g.fill(); }
  // 基地
  for (const t of [1, 2]) {
    const f = FOUNTAINS[t];
    const grd = g.createRadialGradient(f.x * K, f.y * K, 0, f.x * K, f.y * K, 30 * K);
    grd.addColorStop(0, t === 1 ? 'rgba(59,155,255,0.55)' : 'rgba(255,74,74,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, N, N);
  }
  return c;
}

export class Minimap {
  constructor(container) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = N;
    container.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d');
    this.base = drawBase();
    this.fowCanvas = document.createElement('canvas');
    this.fowCanvas.width = this.fowCanvas.height = FOW_N;
    this.fowG = this.fowCanvas.getContext('2d');
    this.fowImg = this.fowG.createImageData(FOW_N, FOW_N);
    this.pings = [];
  }

  /** 屏幕坐标 → 地图坐标 */
  toWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * MAP_SIZE, y: ((clientY - r.top) / r.height) * MAP_SIZE };
  }

  ping(x, y, color = '#ffd23f') { this.pings.push({ x, y, color, t: 0 }); }

  draw(world, { playerTeam, player, spectate, fog, viewPoly, portraits, dt }) {
    const g = this.g;
    g.drawImage(this.base, 0, 0);
    const vis = (u) => spectate || u.team === playerTeam || u.visible[playerTeam];
    // 野怪营地（活着才画）
    for (const c of world.camps) {
      if (!c.alive) continue;
      const boss = c.def.respawn === 'drake' || c.def.respawn === 'guardian';
      const buff = c.def.respawn === 'buff';
      g.beginPath();
      g.arc(c.x * K, c.y * K, boss ? 7 : buff ? 5 : 3.5, 0, Math.PI * 2);
      g.fillStyle = c.type === 'drake' ? '#ff8a3d' : c.type === 'guardian' ? '#b48cff' : c.type === 'blueBuff' ? '#5fb6ff' : c.type === 'redBuff' ? '#ff6a5a' : '#f0b43a';
      g.fill();
      g.lineWidth = 1.5; g.strokeStyle = '#000'; g.stroke();
    }
    // 迷雾
    if (!spectate && fog && fog.cur) {
      const d = this.fowImg.data, cur = fog.cur;
      for (let i = 0; i < FOW_N * FOW_N; i++) {
        const a = (1 - Math.min(1, cur[i])) * 150;
        d[i * 4] = 4; d[i * 4 + 1] = 8; d[i * 4 + 2] = 14; d[i * 4 + 3] = a;
      }
      this.fowG.putImageData(this.fowImg, 0, 0);
      g.imageSmoothingEnabled = true;
      g.drawImage(this.fowCanvas, 0, 0, N, N);
    }
    // 防御塔与水晶
    for (const t of world.towers) {
      if (t.dead) continue;
      const s = t.kind === 'crystal' ? 7 : 5;
      g.fillStyle = TEAM[t.team];
      g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.save(); g.translate(t.x * K, t.y * K); g.rotate(Math.PI / 4);
      g.fillRect(-s, -s, s * 2, s * 2); g.strokeRect(-s, -s, s * 2, s * 2);
      g.restore();
    }
    // 小兵
    for (const u of world.units) {
      if (u.kind !== 'minion' || u.dead || !vis(u)) continue;
      g.fillStyle = u.team === playerTeam || (spectate && u.team === 1) ? '#7fc0ff' : '#ff8080';
      g.fillRect(u.x * K - 1.8, u.y * K - 1.8, 3.6, 3.6);
    }
    // 英雄
    for (const h of world.heroes) {
      if (h.dead || !vis(h)) continue;
      const r = h === player ? 10 : 8.5;
      const x = h.x * K, y = h.y * K;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = TEAM[h.team]; g.fill();
      const img = portraits && portraits(h);
      if (img && img.complete && img.naturalWidth) {
        g.save(); g.beginPath(); g.arc(x, y, r - 2, 0, Math.PI * 2); g.clip();
        g.drawImage(img, x - r + 2, y - r + 2, (r - 2) * 2, (r - 2) * 2);
        g.restore();
      }
      g.lineWidth = h === player ? 3 : 2;
      g.strokeStyle = h === player ? '#45e05f' : '#ffffff';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    }
    // 镜头范围
    if (viewPoly) {
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.5;
      g.beginPath();
      viewPoly.forEach((p, i) => (i ? g.lineTo(p.x * K, p.y * K) : g.moveTo(p.x * K, p.y * K)));
      g.closePath(); g.stroke();
    }
    // 信号
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      p.t += dt || 0.1;
      if (p.t > 2) { this.pings.splice(i, 1); continue; }
      const k = (p.t % 0.7) / 0.7;
      g.strokeStyle = p.color; g.globalAlpha = 1 - k; g.lineWidth = 3;
      g.beginPath(); g.arc(p.x * K, p.y * K, 4 + k * 16, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }
  }
}
