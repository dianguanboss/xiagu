// 程序绘制的图标：技能、装备、召唤师技能、操作按钮、英雄头像兜底
const cache = new Map();
const S = 128;

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return c;
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k > 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function bg(g, c1, c2, round = true) {
  const grd = g.createRadialGradient(S * 0.5, S * 0.38, 6, S * 0.5, S * 0.5, S * 0.72);
  grd.addColorStop(0, shade(c1, 0.15));
  grd.addColorStop(1, shade(c2 || c1, -0.62));
  g.fillStyle = grd;
  if (round) { g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.fill(); }
  else { roundRect(g, 0, 0, S, S, 18); g.fill(); }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function glow(g, color, blur = 14) { g.shadowColor = color; g.shadowBlur = blur; }
function noGlow(g) { g.shadowBlur = 0; }

function poly(g, pts, fill, stroke, lw = 4) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.lineJoin = 'round'; g.stroke(); }
}

// —— 技能图案 ——
const GLYPHS = {
  dash(g, c) {
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = shade(c, 0.2 + i * 0.25); g.lineWidth = 9 - i * 2;
      g.beginPath(); g.moveTo(22 + i * 6, 92 - i * 18); g.lineTo(78 + i * 4, 62 - i * 18); g.stroke();
    }
    poly(g, [[70, 26], [106, 40], [82, 66]], '#ffffff');
  },
  slash(g, c) {
    g.lineCap = 'round';
    g.strokeStyle = '#ffffff'; g.lineWidth = 10;
    g.beginPath(); g.arc(64, 70, 40, -2.6, -0.5); g.stroke();
    g.strokeStyle = c; g.lineWidth = 5;
    g.beginPath(); g.arc(64, 70, 30, -2.4, -0.7); g.stroke();
  },
  spin(g, c) {
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = i === 0 ? '#ffffff' : shade(c, 0.3 * i); g.lineWidth = 8 - i * 2;
      const a = i * 2.1;
      g.beginPath(); g.arc(64, 64, 22 + i * 12, a, a + 3.2); g.stroke();
    }
  },
  burst(g, c) {
    const pts = [];
    for (let i = 0; i < 16; i++) { const r = i % 2 ? 22 : 48, a = (i / 16) * Math.PI * 2; pts.push([64 + Math.cos(a) * r, 64 + Math.sin(a) * r]); }
    poly(g, pts, shade(c, 0.35), '#ffffff', 3);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 12, 0, 7); g.fill();
  },
  orb(g, c) {
    g.fillStyle = shade(c, 0.5); g.beginPath(); g.arc(70, 58, 26, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(76, 52, 11, 0, 7); g.fill();
    g.strokeStyle = shade(c, 0.2); g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(46, 74); g.lineTo(20, 100); g.stroke();
    g.beginPath(); g.moveTo(54, 84); g.lineTo(36, 104); g.stroke();
  },
  shard(g, c) {
    poly(g, [[24, 104], [92, 22], [104, 34], [36, 110]], shade(c, 0.45), '#ffffff', 3);
    poly(g, [[86, 18], [112, 14], [108, 40]], '#ffffff');
  },
  circle(g, c) {
    g.strokeStyle = '#ffffff'; g.lineWidth = 6;
    g.beginPath(); g.ellipse(64, 76, 44, 22, 0, 0, 7); g.stroke();
    g.strokeStyle = shade(c, 0.35); g.lineWidth = 4;
    g.beginPath(); g.ellipse(64, 76, 30, 14, 0, 0, 7); g.stroke();
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64 + Math.cos(a) * 37, 76 + Math.sin(a) * 18, 4, 0, 7); g.fill(); }
    poly(g, [[64, 18], [74, 50], [54, 50]], shade(c, 0.5));
  },
  meteor(g, c) {
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const x = 30 + i * 26, y = 38 + (i % 2) * 18;
      g.strokeStyle = shade(c, 0.3); g.lineWidth = 6;
      g.beginPath(); g.moveTo(x - 18, y - 26); g.lineTo(x, y); g.stroke();
      g.fillStyle = i === 1 ? '#ffffff' : shade(c, 0.6); g.beginPath(); g.arc(x + 3, y + 4, 10, 0, 7); g.fill();
    }
    g.fillStyle = shade(c, 0.1); g.fillRect(14, 96, 100, 8);
  },
  snow(g, c) {
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      g.beginPath(); g.moveTo(64 - Math.cos(a) * 44, 64 - Math.sin(a) * 44); g.lineTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44); g.stroke();
    }
    g.strokeStyle = shade(c, 0.4); g.lineWidth = 4;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, x = 64 + Math.cos(a) * 30, y = 64 + Math.sin(a) * 30;
      g.beginPath(); g.moveTo(x + Math.cos(a + 0.9) * 10, y + Math.sin(a + 0.9) * 10); g.lineTo(x, y); g.lineTo(x + Math.cos(a - 0.9) * 10, y + Math.sin(a - 0.9) * 10); g.stroke();
    }
  },
  arrow(g, c) {
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(20, 108); g.lineTo(100, 28); g.stroke();
    poly(g, [[108, 20], [80, 28], [100, 48]], '#ffffff');
    g.strokeStyle = shade(c, 0.35); g.lineWidth = 5;
    g.beginPath(); g.moveTo(20, 108); g.lineTo(18, 88); g.moveTo(20, 108); g.lineTo(40, 110); g.stroke();
  },
  bigArrow(g, c) {
    poly(g, [[16, 70], [80, 54], [80, 36], [116, 64], [80, 92], [80, 74], [16, 82]], shade(c, 0.4), '#ffffff', 4);
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(10, 46 + i * 18); g.lineTo(40, 46 + i * 18); g.stroke(); }
  },
  wind(g, c) {
    g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(16, 48); g.lineTo(80, 48); g.arc(80, 36, 12, 1.57, -1.8, true); g.stroke();
    g.strokeStyle = shade(c, 0.4);
    g.beginPath(); g.moveTo(24, 70); g.lineTo(96, 70); g.arc(96, 84, 14, -1.57, 1.8); g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(16, 92); g.lineTo(62, 92); g.stroke();
  },
  roll(g, c) {
    g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.arc(56, 64, 30, 0.6, 5.4); g.stroke();
    poly(g, [[92, 40], [104, 72], [74, 62]], '#ffffff');
    g.strokeStyle = shade(c, 0.4); g.lineWidth = 5;
    g.beginPath(); g.moveTo(16, 104); g.lineTo(108, 104); g.stroke();
  },
  grenade(g, c) {
    g.fillStyle = shade(c, 0.25); g.beginPath(); g.arc(60, 72, 30, 0, 7); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#ffffff'; g.fillRect(52, 34, 18, 12);
    g.strokeStyle = '#ffd23f'; g.lineWidth = 4; g.beginPath(); g.moveTo(70, 38); g.quadraticCurveTo(92, 22, 98, 36); g.stroke();
    for (let i = 0; i < 5; i++) { const a = -1 + i * 0.5; g.beginPath(); g.moveTo(100 + Math.cos(a) * 6, 34 + Math.sin(a) * 6); g.lineTo(100 + Math.cos(a) * 14, 34 + Math.sin(a) * 14); g.stroke(); }
  },
  barrage(g, c) {
    for (let i = 0; i < 5; i++) {
      const a = -0.5 + i * 0.25, x = 24, y = 92;
      g.strokeStyle = i % 2 ? '#ffffff' : shade(c, 0.5); g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x + Math.cos(a - 0.6) * 30, y + Math.sin(a - 0.6) * 30); g.lineTo(x + Math.cos(a - 0.6) * 92, y + Math.sin(a - 0.6) * 92); g.stroke();
    }
  },
  heal(g, c) {
    poly(g, [[52, 22], [76, 22], [76, 52], [106, 52], [106, 76], [76, 76], [76, 106], [52, 106], [52, 76], [22, 76], [22, 52], [52, 52]], shade(c, 0.45), '#ffffff', 4);
  },
  water(g, c) {
    g.fillStyle = shade(c, 0.45);
    g.beginPath(); g.moveTo(64, 16); g.bezierCurveTo(90, 52, 100, 66, 100, 80); g.arc(64, 80, 36, 0, Math.PI); g.bezierCurveTo(28, 66, 38, 52, 64, 16); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(50, 80, 7, 12, -0.4, 0, 7); g.fill();
  },
  vine(g, c) {
    g.strokeStyle = shade(c, 0.4); g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(16, 100); g.bezierCurveTo(50, 40, 70, 110, 108, 30); g.stroke();
    g.fillStyle = '#ffffff';
    for (const [x, y, a] of [[40, 70, -0.8], [66, 80, 0.6], [92, 52, -0.6]]) { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(0, -10, 6, 12, 0, 0, 7); g.fill(); g.restore(); }
  },
  wave(g, c) {
    g.strokeStyle = '#ffffff'; g.lineWidth = 6;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(64, 64, 16 + i * 15, 0, 7); g.strokeStyle = i === 1 ? shade(c, 0.4) : '#ffffff'; g.stroke(); }
    GLYPHS.shield(g, c, 0.45);
  },
  shield(g, c, k = 1) {
    g.save(); g.translate(64, 64); g.scale(k, k); g.translate(-64, -64);
    poly(g, [[64, 16], [104, 30], [100, 72], [64, 112], [28, 72], [24, 30]], shade(c, 0.35), '#ffffff', 5);
    g.restore();
  },
  hook(g, c) {
    g.strokeStyle = shade(c, 0.4); g.lineWidth = 4;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(22 + i * 13, 100 - i * 13, 7, 4, -0.8, 0, 7); g.stroke(); }
    g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(84, 44); g.lineTo(98, 30); g.arc(88, 24, 14, 0.5, 3.6, true); g.stroke();
  },
  roar(g, c) {
    g.fillStyle = shade(c, 0.4); g.beginPath(); g.arc(40, 64, 20, 0, 7); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(40, 64, 34 + i * 16, -0.7, 0.7); g.stroke(); }
  },
  bell(g, c) {
    g.fillStyle = shade(c, 0.4);
    g.beginPath(); g.moveTo(34, 92); g.bezierCurveTo(36, 40, 44, 26, 64, 26); g.bezierCurveTo(84, 26, 92, 40, 94, 92); g.closePath(); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#ffffff'; g.fillRect(26, 92, 76, 9); g.beginPath(); g.arc(64, 108, 7, 0, 7); g.fill();
    g.fillRect(58, 14, 12, 12);
  },
  charge(g, c) {
    poly(g, [[18, 44], [70, 44], [70, 26], [110, 64], [70, 102], [70, 84], [18, 84]], shade(c, 0.35), '#ffffff', 4);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 4; i++) g.fillRect(8 + i * 4, 104 + (i % 2) * 6, 10, 5);
  },
  rock(g, c) {
    poly(g, [[20, 100], [34, 54], [58, 42], [70, 60], [92, 40], [110, 100]], shade(c, 0.25), '#ffffff', 4);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(58, 42); g.lineTo(54, 76); g.lineTo(66, 100); g.moveTo(92, 40); g.lineTo(86, 72); g.stroke();
  },
  quake(g, c) {
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(64, 14); g.lineTo(56, 44); g.lineTo(72, 60); g.lineTo(54, 86); g.lineTo(66, 114); g.stroke();
    g.strokeStyle = shade(c, 0.4); g.lineWidth = 4;
    g.beginPath(); g.moveTo(56, 44); g.lineTo(28, 50); g.moveTo(72, 60); g.lineTo(102, 56); g.moveTo(54, 86); g.lineTo(24, 96); g.stroke();
  },
  fang(g, c) {
    poly(g, [[22, 30], [50, 30], [40, 84]], '#ffffff', shade(c, 0.3), 3);
    poly(g, [[78, 30], [106, 30], [88, 84]], '#ffffff', shade(c, 0.3), 3);
    g.strokeStyle = shade(c, 0.4); g.lineWidth = 6; g.beginPath(); g.moveTo(14, 28); g.lineTo(114, 28); g.stroke();
  },
  moon(g, c) {
    g.fillStyle = shade(c, 0.5); g.beginPath(); g.arc(60, 64, 40, 0, 7); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(80, 54, 34, 0, 7); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(70, 104); g.lineTo(110, 22); g.stroke();
  },
  shuriken(g, c) {
    g.save(); g.translate(64, 64);
    for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); poly(g, [[0, -8], [10, -46], [8, -6]], '#ffffff', shade(c, 0.3), 2); }
    g.fillStyle = shade(c, 0.3); g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill();
    g.restore();
  },
  blink(g, c) {
    g.fillStyle = shade(c, 0.3);
    for (let i = 0; i < 3; i++) { g.globalAlpha = 0.35 + i * 0.3; g.beginPath(); g.ellipse(28 + i * 30, 70, 10, 26, 0, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    poly(g, [[100, 40], [112, 70], [100, 100], [92, 70]], '#ffffff');
  },
  buff(g, c) {
    g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(32, 80 - i * 30); g.lineTo(64, 50 - i * 30); g.lineTo(96, 80 - i * 30); g.stroke(); g.strokeStyle = shade(c, 0.45); }
    g.fillStyle = '#ffffff'; g.fillRect(40, 96, 48, 8);
  },
  rage(g, c) {
    g.fillStyle = shade(c, 0.4);
    g.beginPath(); g.moveTo(64, 12); g.bezierCurveTo(96, 44, 104, 70, 90, 96); g.quadraticCurveTo(64, 120, 38, 96); g.bezierCurveTo(24, 70, 44, 60, 50, 36); g.bezierCurveTo(58, 54, 60, 50, 64, 12); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(64, 56); g.bezierCurveTo(80, 76, 80, 94, 64, 102); g.bezierCurveTo(48, 94, 52, 80, 64, 56); g.fill();
  },
  execute(g, c) {
    g.save(); g.translate(64, 64); g.rotate(-0.78);
    poly(g, [[-6, 40], [-6, -40], [0, -54], [6, -40], [6, 40]], '#ffffff', shade(c, 0.3), 3);
    g.fillStyle = shade(c, 0.35); g.fillRect(-20, 34, 40, 8); g.fillRect(-5, 42, 10, 18);
    g.restore();
    g.fillStyle = 'rgba(255,60,60,0.9)'; g.beginPath(); g.arc(96, 96, 10, 0, 7); g.fill();
  },
};

// 每个英雄技能的图案（未配置的按技能类型推断）
const HERO_GLYPHS = {
  liefeng: ['dash', 'spin', 'execute'],
  kuanglang: ['fang', 'roar', 'rage'],
  yingren: ['blink', 'shuriken', 'moon'],
  yanji: ['orb', 'circle', 'meteor'],
  shuangyu: ['shard', 'snow', 'snow'],
  zhufeng: ['arrow', 'wind', 'bigArrow'],
  leihuo: ['roll', 'grenade', 'barrage'],
  lingquan: ['water', 'vine', 'wave'],
  zhenyue: ['hook', 'roar', 'bell'],
  yangang: ['charge', 'rock', 'quake'],
};
const AI_GLYPH = { dash: 'dash', aoe: 'burst', poke: 'orb', cc: 'circle', heal: 'heal', selfbuff: 'buff', execute: 'execute', hook: 'hook', engage: 'charge', escape: 'roll', teamshield: 'shield' };

function cached(key, draw) {
  let url = cache.get(key);
  if (url) return url;
  const c = canvas();
  const g = c.getContext('2d');
  draw(g);
  url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

export function skillIcon(heroDef, slot) {
  return cached(`skill:${heroDef.id}:${slot}`, (g) => {
    const sd = heroDef.skills[slot];
    const col = heroDef.colors;
    bg(g, slot === 2 ? col.accent : col.primary, col.secondary);
    // 大招加一圈金边
    const name = (HERO_GLYPHS[heroDef.id] || [])[slot] || AI_GLYPH[sd.ai] || 'burst';
    glow(g, col.accent, 18);
    (GLYPHS[name] || GLYPHS.burst)(g, col.accent);
    noGlow(g);
    g.lineWidth = slot === 2 ? 8 : 5;
    g.strokeStyle = slot === 2 ? '#ffd76a' : 'rgba(255,255,255,0.55)';
    g.beginPath(); g.arc(64, 64, 60, 0, 7); g.stroke();
  });
}

export function passiveIcon(heroDef) {
  return cached(`passive:${heroDef.id}`, (g) => {
    bg(g, heroDef.colors.secondary, heroDef.colors.primary, false);
    glow(g, heroDef.colors.accent);
    poly(g, [[64, 18], [102, 64], [64, 110], [26, 64]], shade(heroDef.colors.accent, 0.2), '#ffffff', 5);
    noGlow(g);
  });
}

// —— 召唤师技能 / 操作按钮 ——
const SPELL_DRAW = {
  flash(g) {
    bg(g, '#ffd84a', '#c27a00');
    glow(g, '#fff6b0', 20);
    poly(g, [[72, 12], [34, 70], [60, 70], [50, 116], [96, 52], [68, 52]], '#ffffff', '#fff2a0', 3);
    noGlow(g);
  },
  smite(g) {
    bg(g, '#ff8a3d', '#7a2200');
    glow(g, '#ffd2a0', 18);
    g.strokeStyle = '#ffffff'; g.lineWidth = 9; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(38 + i * 20, 22); g.quadraticCurveTo(30 + i * 20, 70, 44 + i * 20, 108); g.stroke(); }
    noGlow(g);
  },
  heal(g) {
    bg(g, '#5ee67f', '#0f6a2a');
    glow(g, '#c9ffd4', 18);
    GLYPHS.heal(g, '#5ee67f');
    noGlow(g);
  },
  recall(g) {
    bg(g, '#4aa8ff', '#0b3b8a');
    glow(g, '#bfe3ff', 16);
    poly(g, [[64, 22], [106, 58], [94, 58], [94, 104], [34, 104], [34, 58], [22, 58]], '#ffffff');
    g.fillStyle = '#2a6fd0'; g.fillRect(54, 74, 20, 30);
    noGlow(g);
  },
  attack(g) {
    bg(g, '#e8c27a', '#5a3a12');
    glow(g, '#fff0c8', 16);
    g.save(); g.translate(64, 64); g.rotate(0.78);
    poly(g, [[-8, 36], [-8, -42], [0, -58], [8, -42], [8, 36]], '#ffffff', '#8a6a3a', 3);
    g.fillStyle = '#ffd36a'; g.fillRect(-24, 32, 48, 10); g.fillRect(-6, 42, 12, 20);
    g.restore();
    noGlow(g);
  },
  lastHit(g) {
    bg(g, '#9aa4b8', '#2c3242');
    g.fillStyle = '#ffd84a';
    g.beginPath(); g.arc(64, 70, 30, 0, 7); g.fill();
    g.fillStyle = '#7a5a10'; g.font = 'bold 40px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 64, 72);
  },
  tower(g) {
    bg(g, '#b8b0a0', '#3a3428');
    poly(g, [[44, 108], [50, 48], [40, 48], [40, 32], [52, 32], [52, 40], [60, 40], [60, 32], [68, 32], [68, 40], [76, 40], [76, 32], [88, 32], [88, 48], [78, 48], [84, 108]], '#ffffff', '#3a3428', 3);
  },
  shop(g) {
    bg(g, '#ffcf4a', '#7a4a00');
    g.fillStyle = '#fff3c4';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(64, 88 - i * 18, 32, 11, 0, 0, 7); g.fill(); g.strokeStyle = '#a06a00'; g.lineWidth = 3; g.stroke(); }
  },
  levelUp(g) {
    bg(g, '#ffd84a', '#a05a00');
    poly(g, [[64, 18], [104, 66], [80, 66], [80, 108], [48, 108], [48, 66], [24, 66]], '#ffffff', '#7a4a00', 3);
  },
};

export function spellIcon(id) { return cached(`spell:${id}`, (g) => (SPELL_DRAW[id] || SPELL_DRAW.flash)(g)); }

// —— 装备 ——
const ITEM_DRAW = {
  sword(g, c) {
    g.save(); g.translate(64, 64); g.rotate(0.78);
    poly(g, [[-9, 30], [-9, -40], [0, -56], [9, -40], [9, 30]], shade(c, 0.5), '#ffffff', 3);
    g.fillStyle = '#e8d08a'; g.fillRect(-26, 28, 52, 10); g.fillStyle = '#6a4a2a'; g.fillRect(-6, 38, 12, 22);
    g.restore();
  },
  dagger(g, c) {
    for (const s of [-1, 1]) {
      g.save(); g.translate(64 + s * 16, 66); g.rotate(s * 0.5);
      poly(g, [[-6, 20], [-6, -30], [0, -44], [6, -30], [6, 20]], shade(c, 0.5), '#ffffff', 3);
      g.fillStyle = '#5a4a3a'; g.fillRect(-12, 18, 24, 7); g.fillRect(-4, 25, 8, 16);
      g.restore();
    }
  },
  knife(g, c) {
    g.save(); g.translate(64, 64); g.rotate(-0.6);
    g.fillStyle = shade(c, 0.4);
    g.beginPath(); g.moveTo(-10, 20); g.lineTo(-10, -30); g.quadraticCurveTo(20, -50, 14, 0); g.lineTo(6, 20); g.closePath(); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#5a3a1a'; g.fillRect(-12, 20, 20, 30);
    g.restore();
  },
  axe(g, c) {
    g.save(); g.translate(64, 64); g.rotate(0.5);
    g.fillStyle = '#6a4a2a'; g.fillRect(-5, -44, 10, 96);
    g.fillStyle = shade(c, 0.35);
    g.beginPath(); g.moveTo(4, -40); g.quadraticCurveTo(50, -40, 44, 0); g.quadraticCurveTo(30, -10, 4, -8); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-4, -40); g.quadraticCurveTo(-40, -36, -36, -4); g.quadraticCurveTo(-24, -12, -4, -10); g.closePath(); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke();
    g.restore();
  },
  hammer(g, c) {
    g.save(); g.translate(64, 64); g.rotate(-0.6);
    g.fillStyle = '#6a4a2a'; g.fillRect(-5, -20, 10, 70);
    poly(g, [[-34, -46], [34, -46], [34, -14], [-34, -14]], shade(c, 0.3), '#ffffff', 3);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(-30, -42, 60, 6);
    g.restore();
  },
  bow(g, c) {
    g.strokeStyle = shade(c, 0.2); g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.arc(40, 64, 46, -1.1, 1.1); g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(40 + Math.cos(-1.1) * 46, 64 + Math.sin(-1.1) * 46); g.lineTo(40 + Math.cos(1.1) * 46, 64 + Math.sin(1.1) * 46); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.moveTo(52, 64); g.lineTo(110, 64); g.stroke();
    poly(g, [[116, 64], [102, 56], [102, 72]], '#ffffff');
  },
  boots(g, c) {
    poly(g, [[38, 18], [70, 18], [72, 74], [108, 86], [110, 108], [34, 108], [36, 74]], shade(c, 0.15), '#ffffff', 4);
    g.fillStyle = shade(c, -0.3); g.fillRect(34, 98, 76, 10);
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(16, 50); g.lineTo(30, 50); g.moveTo(10, 66); g.lineTo(28, 66); g.stroke();
  },
  book(g, c) {
    poly(g, [[22, 30], [64, 40], [106, 30], [106, 98], [64, 108], [22, 98]], shade(c, 0.1), '#ffffff', 4);
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 40); g.lineTo(64, 108); g.stroke();
    g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(84, 66, 9, 0, 7); g.fill();
  },
  staff(g, c) {
    g.strokeStyle = '#7a5a3a'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(30, 112); g.lineTo(80, 40); g.stroke();
    glow(g, c, 20);
    g.fillStyle = shade(c, 0.45); g.beginPath(); g.arc(88, 32, 18, 0, 7); g.fill();
    noGlow(g);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(83, 27, 6, 0, 7); g.fill();
  },
  orb(g, c) {
    glow(g, c, 22);
    const grd = g.createRadialGradient(54, 52, 4, 64, 64, 40);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.4, shade(c, 0.4)); grd.addColorStop(1, shade(c, -0.3));
    g.fillStyle = grd; g.beginPath(); g.arc(64, 62, 36, 0, 7); g.fill();
    noGlow(g);
    g.fillStyle = '#8a6a3a'; g.fillRect(40, 96, 48, 12);
  },
  gem(g, c) {
    poly(g, [[64, 18], [104, 52], [64, 112], [24, 52]], shade(c, 0.3), '#ffffff', 4);
    poly(g, [[64, 18], [80, 52], [64, 112], [48, 52]], shade(c, 0.55));
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(24, 52); g.lineTo(104, 52); g.stroke();
  },
  grail(g, c) {
    g.fillStyle = shade(c, 0.3);
    g.beginPath(); g.moveTo(30, 26); g.lineTo(98, 26); g.quadraticCurveTo(96, 72, 64, 76); g.quadraticCurveTo(32, 72, 30, 26); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.stroke();
    g.fillRect(58, 76, 12, 22); g.fillRect(40, 98, 48, 10);
    g.fillStyle = '#ffffff'; g.fillRect(40, 34, 48, 6);
  },
  crown(g, c) {
    poly(g, [[22, 96], [16, 36], [44, 62], [64, 26], [84, 62], [112, 36], [106, 96]], shade(c, 0.35), '#ffffff', 4);
    for (const x of [40, 64, 88]) { g.fillStyle = '#ff5a6a'; g.beginPath(); g.arc(x, 82, 6, 0, 7); g.fill(); }
  },
  mask(g, c) {
    g.fillStyle = shade(c, 0.25);
    g.beginPath(); g.moveTo(20, 34); g.quadraticCurveTo(64, 16, 108, 34); g.quadraticCurveTo(110, 96, 64, 112); g.quadraticCurveTo(18, 96, 20, 34); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#10121a';
    g.beginPath(); g.ellipse(44, 58, 13, 8, 0.2, 0, 7); g.fill(); g.beginPath(); g.ellipse(84, 58, 13, 8, -0.2, 0, 7); g.fill();
  },
  ankh(g, c) {
    g.strokeStyle = shade(c, 0.4); g.lineWidth = 12; g.lineCap = 'round';
    g.beginPath(); g.ellipse(64, 40, 18, 22, 0, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(64, 62); g.lineTo(64, 112); g.moveTo(34, 74); g.lineTo(94, 74); g.stroke();
  },
  armor(g, c) {
    poly(g, [[26, 30], [48, 22], [64, 32], [80, 22], [102, 30], [96, 70], [92, 106], [36, 106], [32, 70]], shade(c, 0.2), '#ffffff', 4);
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 32); g.lineTo(64, 104); g.moveTo(40, 66); g.lineTo(88, 66); g.stroke();
  },
  helmet(g, c) {
    g.fillStyle = shade(c, 0.25);
    g.beginPath(); g.moveTo(22, 96); g.quadraticCurveTo(20, 24, 64, 22); g.quadraticCurveTo(108, 24, 106, 96); g.lineTo(80, 96); g.lineTo(80, 64); g.lineTo(48, 64); g.lineTo(48, 96); g.closePath(); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#ff6a4a'; g.fillRect(58, 8, 12, 22);
  },
  cloak(g, c) {
    g.fillStyle = shade(c, 0.2);
    g.beginPath(); g.moveTo(44, 20); g.lineTo(84, 20); g.quadraticCurveTo(100, 60, 112, 108); g.quadraticCurveTo(64, 96, 16, 108); g.quadraticCurveTo(28, 60, 44, 20); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#ffd36a'; g.beginPath(); g.arc(64, 28, 8, 0, 7); g.fill();
  },
  spikes(g, c) {
    poly(g, [[28, 34], [100, 34], [96, 96], [64, 112], [32, 96]], shade(c, 0.15), '#ffffff', 4);
    for (const [x, y, a] of [[28, 50, Math.PI], [28, 78, Math.PI], [100, 50, 0], [100, 78, 0], [64, 34, -Math.PI / 2]]) {
      poly(g, [[x + Math.cos(a) * 18, y + Math.sin(a) * 18], [x + Math.cos(a + 1.57) * 7, y + Math.sin(a + 1.57) * 7], [x + Math.cos(a - 1.57) * 7, y + Math.sin(a - 1.57) * 7]], '#ffffff');
    }
  },
};

export function itemIcon(item) {
  return cached(`item:${item.id}`, (g) => {
    g.fillStyle = '#141a26';
    roundRect(g, 0, 0, S, S, 18); g.fill();
    const grd = g.createRadialGradient(64, 54, 4, 64, 64, 80);
    grd.addColorStop(0, shade(item.color, -0.25)); grd.addColorStop(1, 'rgba(10,14,22,0)');
    g.fillStyle = grd; roundRect(g, 0, 0, S, S, 18); g.fill();
    g.save(); g.translate(64, 64); g.scale(0.82, 0.82); g.translate(-64, -64);
    (ITEM_DRAW[item.icon] || ITEM_DRAW.gem)(g, item.color);
    g.restore();
    g.lineWidth = 6; g.strokeStyle = shade(item.color, -0.1);
    roundRect(g, 3, 3, S - 6, S - 6, 16); g.stroke();
  });
}

/** 没有 3D 头像时的兜底：纯色圆底 + 名字首字 */
export function fallbackPortrait(heroDef) {
  return cached(`portrait:${heroDef.id}`, (g) => {
    bg(g, heroDef.colors.primary, heroDef.colors.secondary, false);
    g.fillStyle = '#ffffff';
    g.font = 'bold 72px "PingFang SC", "Microsoft YaHei", system-ui';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(heroDef.name[0], 64, 68);
  });
}
