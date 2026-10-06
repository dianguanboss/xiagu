// 2D 叠加层：头顶血条、等级、名字、回城条、飘字（伤害 / 治疗 / 金币）
import * as THREE from 'three';

const COL = {
  self: '#45e05f', ally: '#3b9bff', enemy: '#ff3b3b', neutral: '#f0b43a',
  mana: '#3f8cff', energy: '#f2d24a', shield: '#f4f4f4', back: 'rgba(8,10,16,0.82)', edge: '#0a0c12',
};
const v3 = new THREE.Vector3();

export class Overlay {
  constructor(container) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'overlay-canvas';
    Object.assign(this.canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    container.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d');
    this.floats = [];
    this.w = 1; this.h = 1; this.dpr = 1;
    this.scale = 1;     // 界面整体缩放（手机上略大）
    this.lagHp = new Map(); // 受伤后的"残血"白条
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = Math.min(2, dpr);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.scale = Math.max(0.85, Math.min(1.25, Math.min(w, h) / 760));
  }

  // style: 'phys' | 'magic' | 'true' | 'crit' | 'heal' | 'gold' | 'taken' | 'xp'
  addFloat(x, h, y, text, style) {
    if (this.floats.length > 80) this.floats.shift();
    this.floats.push({ x, h, y, text: String(text), style, t: 0, dur: style === 'gold' ? 1.2 : 0.95, dx: (Math.random() - 0.5) * 30 });
  }

  project(x, h, y, camera) {
    v3.set(x, h, y).project(camera);
    if (v3.z > 1) return null;
    return { sx: (v3.x * 0.5 + 0.5) * this.w, sy: (-v3.y * 0.5 + 0.5) * this.h };
  }

  /**
   * entries: [{ u, x, y, top, rel: 'self'|'ally'|'enemy'|'neutral', alpha }]
   */
  draw(camera, entries, dt, opts = {}) {
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    const S = this.scale;
    // 先画小兵和野怪，再画英雄（英雄在上层）
    entries.sort((a, b) => (a.u.kind === 'hero') - (b.u.kind === 'hero'));
    for (const e of entries) {
      const p = this.project(e.x, e.top, e.y, camera);
      if (!p || p.sx < -150 || p.sx > this.w + 150 || p.sy < -80 || p.sy > this.h + 80) continue;
      g.globalAlpha = e.alpha ?? 1;
      const u = e.u;
      if (u.kind === 'hero') this.heroBar(g, u, p.sx, p.sy - 10 * S, e.rel, S);
      else if (u.kind === 'minion') this.simpleBar(g, u, p.sx, p.sy - 4 * S, 44 * S, 6 * S, COL[e.rel], dt);
      else if (u.kind === 'monster') {
        if (u.hp >= u.stats.maxHp && !u.boss) continue;   // 满血小野怪不显示
        const w = (u.boss ? 120 : 64) * S;
        this.simpleBar(g, u, p.sx, p.sy - 4 * S, w, (u.boss ? 10 : 7) * S, COL.neutral, dt);
        if (u.boss) this.label(g, u.def.name, p.sx, p.sy - 14 * S, 15 * S, '#ffe2a0');
      } else if (u.kind === 'tower' || u.kind === 'crystal') {
        if (u.dead) continue;
        const w = (u.kind === 'crystal' ? 130 : 100) * S;
        this.simpleBar(g, u, p.sx, p.sy - 6 * S, w, 11 * S, COL[e.rel], dt);
        if (u.protected) this.shieldIcon(g, p.sx + w / 2 + 12 * S, p.sy - 6 * S + 5.5 * S, 9 * S);
      }
    }
    g.globalAlpha = 1;
    this.drawFloats(g, camera, dt, S);
  }

  heroBar(g, u, cx, cy, rel, S) {
    const W = 104 * S, H = 13 * S, x = cx - W / 2 + 12 * S, y = cy - H;
    const maxHp = u.stats.maxHp, hp = Math.max(0, u.hp), sh = u.shieldTotal || 0;
    const tot = Math.max(maxHp, hp + sh);
    // 底板
    g.fillStyle = COL.back;
    roundRect(g, x - 2 * S, y - 2 * S, W + 4 * S, H + 4 * S + (rel !== 'enemy' ? 6 * S : 0), 3 * S); g.fill();
    // 残血白条
    const lag = this.lagValue(u, hp, 0.016);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(x, y, W * Math.min(1, lag / tot), H);
    g.fillStyle = COL[rel];
    g.fillRect(x, y, W * (hp / tot), H);
    if (sh > 0) { g.fillStyle = COL.shield; g.fillRect(x + W * (hp / tot), y, W * (sh / tot), H); }
    // 每 1000 生命一格刻度
    g.fillStyle = 'rgba(0,0,0,0.55)';
    const step = 1000;
    for (let v = step; v < maxHp; v += step) {
      const xx = x + W * (v / tot);
      g.fillRect(xx, y, v % 5000 === 0 ? 2 * S : 1 * S, v % 5000 === 0 ? H : H * 0.55);
    }
    // 法力 / 能量
    if (rel !== 'enemy') {
      const mp = u.stats.maxMp > 0 ? u.mp / u.stats.maxMp : 0;
      g.fillStyle = 'rgba(30,30,40,0.9)'; g.fillRect(x, y + H + 1.5 * S, W, 3.5 * S);
      if (u.resource !== 'none') { g.fillStyle = u.resource === 'energy' ? COL.energy : COL.mana; g.fillRect(x, y + H + 1.5 * S, W * mp, 3.5 * S); }
    }
    // 等级圆章
    const r = 12 * S, lx = x - 13 * S, ly = y + H / 2 + 1 * S;
    g.beginPath(); g.arc(lx, ly, r, 0, Math.PI * 2);
    g.fillStyle = rel === 'enemy' ? '#5a1414' : rel === 'self' ? '#1a4a1f' : '#13305a'; g.fill();
    g.lineWidth = 2.5 * S; g.strokeStyle = COL[rel]; g.stroke();
    g.fillStyle = '#ffffff';
    g.font = `bold ${Math.round(14 * S)}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(u.level), lx, ly + 0.5 * S);
    // 名字
    this.label(g, u.name, cx + 12 * S, y - 10 * S, 14 * S, rel === 'self' ? '#c9ffd2' : '#ffffff');
    // 回城进度
    if (u.recalling) {
      const k = 1 - u.recalling.t / 6;
      const by = y + H + 14 * S;
      g.fillStyle = COL.back; roundRect(g, x - 2 * S, by - 2 * S, W + 4 * S, 10 * S, 3 * S); g.fill();
      g.fillStyle = '#7fc8ff'; g.fillRect(x, by, W * k, 6 * S);
    }
    // 引导 / 施法进度
    if (u.channel) {
      if (!u.channel._total) u.channel._total = Math.max(0.1, u.channel.t);
      const k = 1 - u.channel.t / u.channel._total;
      const by = y + H + 14 * S;
      g.fillStyle = '#ffd166'; g.fillRect(x, by, W * k, 5 * S);
    }
  }

  simpleBar(g, u, cx, cy, W, H, color, dt) {
    const x = cx - W / 2, y = cy - H;
    const k = Math.max(0, u.hp) / u.stats.maxHp;
    g.fillStyle = COL.back;
    g.fillRect(x - 1.5, y - 1.5, W + 3, H + 3);
    const lag = this.lagValue(u, u.hp, dt) / u.stats.maxHp;
    g.fillStyle = 'rgba(255,255,255,0.65)'; g.fillRect(x, y, W * Math.min(1, lag), H);
    g.fillStyle = color; g.fillRect(x, y, W * k, H);
  }

  lagValue(u, hp, dt) {
    let l = this.lagHp.get(u.id);
    if (l === undefined || hp > l) l = hp;
    else l = Math.max(hp, l - Math.max(u.stats.maxHp * 0.5 * dt, (l - hp) * 3 * dt));
    this.lagHp.set(u.id, l);
    return l;
  }

  label(g, text, x, y, size, color) {
    g.font = `bold ${Math.round(size)}px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = Math.max(2.5, size * 0.25); g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(text, x, y);
    g.fillStyle = color; g.fillText(text, x, y);
  }

  shieldIcon(g, x, y, r) {
    g.beginPath();
    g.moveTo(x, y - r); g.lineTo(x + r * 0.85, y - r * 0.55); g.lineTo(x + r * 0.7, y + r * 0.45); g.lineTo(x, y + r); g.lineTo(x - r * 0.7, y + r * 0.45); g.lineTo(x - r * 0.85, y - r * 0.55); g.closePath();
    g.fillStyle = '#c9d6e8'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#2a3a55'; g.stroke();
  }

  drawFloats(g, camera, dt, S) {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t >= f.dur) { this.floats.splice(i, 1); continue; }
      const p = this.project(f.x, f.h, f.y, camera);
      if (!p) continue;
      const k = f.t / f.dur;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.5);
      let size = 20, color = '#ffffff', stroke = 'rgba(0,0,0,0.9)';
      switch (f.style) {
        case 'phys': color = '#ffffff'; break;
        case 'magic': color = '#d4a6ff'; break;
        case 'true': color = '#fff6d0'; break;
        case 'crit': color = '#ffcf3a'; size = 28; break;
        case 'heal': color = '#6dff8f'; break;
        case 'gold': color = '#ffd84a'; size = 20; break;
        case 'taken': color = '#ff5a4a'; size = 20; break;
        case 'xp': color = '#9fd8ff'; size = 16; break;
        default: break;
      }
      size *= S * pop;
      const rise = f.style === 'gold' ? 50 : 60;
      const sx = p.sx + f.dx * k, sy = p.sy - 30 * S - rise * S * easeOut(k);
      g.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      g.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = Math.max(3, size * 0.18); g.strokeStyle = stroke; g.lineJoin = 'round';
      g.strokeText(f.text, sx, sy);
      g.fillStyle = color; g.fillText(f.text, sx, sy);
    }
    g.globalAlpha = 1;
  }

  clear() { this.floats.length = 0; this.lagHp.clear(); }
}

function easeOut(k) { return 1 - (1 - k) * (1 - k); }

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
