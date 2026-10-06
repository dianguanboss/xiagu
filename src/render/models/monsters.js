// 普通野怪：蓝晶巨像、赤焰蜥王、幽影狼王/狼、岩甲虫、赤羽鸟王/鸟、獠牙野猪
import { G, add, grp, merged, matL, matS, matGlow, shade, noShadow } from './materials.js';
import { TAU, clamp01, smooth, easeIn, easeOut, bump, key3, lerp, newTrack, track, EMPTY_STATE } from './anim.js';

const PI = Math.PI;
const FLAT = [-PI / 2, 0, 0]; // 把 XY 平面的薄片放平到 XZ（形状 y 正向＝身后）

// 关键帧：起点 0 → 蓄力 wind → 出手 strike → 回 0，乘以动作权重
let _p = 0, _tw = 0.4, _ts = 0.6, _w = 0;
const T3 = (p, tw, ts, w) => { _p = p; _tw = tw; _ts = ts; _w = w; };
const k3 = (wind, strike) => key3(0, wind, strike, _p, _tw, _ts) * _w;
const kb = (a, b) => bump(_p, a, b) * _w;

// ---------- 四足通用驱动 ----------
// 共用的临时姿势（同步调用，不分配）
const X = { by: 0, bz: 0, bx: 0, bry: 0, brz: 0, hx: 0, hy: 0, hz: 0, jaw: 0, tx: 0, ty: 0, fire: 0, l: new Float32Array(4), lz: new Float32Array(4) };
const LEG_DEAD = [-0.4, -0.2, 0.35, 0.5];

// Q: { all, body, head, jaw, legs[FL,FR,BL,BR], tail[], side[] }
// cfg: { bodyY, cycle, gait[4], amp, bob, pitch, halfW, sprawl, tailX, attack(p, idx), extra(A, s) }
function quadDriver(Q, cfg) {
  const A = newTrack();
  const { all, body, head, jaw, legs, tail } = Q;
  return function update(s) {
    s = s || EMPTY_STATE;
    track(A, s, cfg.cycle);
    const t = A.t + A.seed, rw = A.runW, ph = A.ph;
    // 待机：呼吸、张望、喘气
    X.by = cfg.bodyY * (1 + Math.sin(t * 2) * 0.015);
    X.bz = 0; X.bx = 0; X.bry = 0; X.brz = 0;
    X.hx = Math.sin(t * 1.3) * 0.05 * (1 - rw);
    X.hy = Math.sin(t * 0.45) * 0.35 * (1 - rw); X.hz = 0;
    X.jaw = 0.05 + Math.max(0, Math.sin(t * 0.9)) * 0.1 * (1 - rw);
    X.tx = 0; X.ty = Math.sin(t * 2.2) * 0.25 * (1 - rw); X.fire = 0;
    // 步态
    const amp = cfg.amp * rw;
    for (let i = 0; i < 4; i++) {
      X.l[i] = Math.sin(ph + cfg.gait[i]) * amp;
      X.lz[i] = cfg.sprawl ? Math.max(0, Math.cos(ph + cfg.gait[i])) * 0.35 * rw : 0;
    }
    X.by += (Math.abs(Math.cos(ph)) - 0.6) * cfg.bob * rw;
    X.bx += cfg.pitch * rw + Math.sin(ph * 2) * 0.03 * rw;
    X.hx += -cfg.pitch * 0.7 * rw + Math.cos(ph * 2) * 0.05 * rw;
    X.tx += 0.2 * rw;
    X.ty += Math.sin(ph) * 0.3 * rw;
    if (cfg.sprawl) { X.bry += Math.sin(ph) * 0.12 * rw; X.ty -= Math.sin(ph) * 0.25 * rw; }
    // 攻击
    if (A.actW > 0.001 && cfg.attack) { T3(A.p, 0.4, 0.58, A.actW); cfg.attack(A.p, A.idx); }
    // 眩晕
    const sw = A.stunW;
    if (sw > 0.001) {
      X.hx += 0.4 * sw; X.hz += Math.sin(t * 4.5) * 0.3 * sw;
      X.brz += Math.sin(t * 4) * 0.08 * sw; X.by -= cfg.bodyY * 0.06 * sw;
    }
    // 击飞：翻滚、四肢乱蹬
    const aw = A.airW;
    all.rotation.set((-0.5 * smooth(A.airT / 0.25) + Math.sin(A.airT * 6) * 0.15) * aw, 0, Math.sin(A.airT * 7) * 0.2 * aw);
    all.position.set(0, 0, 0);
    if (aw > 0.001) for (let i = 0; i < 4; i++) X.l[i] += Math.sin(t * 14 + i * 1.7) * 0.6 * aw;
    // 死亡：侧翻倒地
    if (A.dead) {
      const k = easeIn(clamp01(A.d / 0.75));
      all.rotation.set(0, 0, 1.45 * k);
      all.position.set(cfg.bodyY * 0.99 * k, (cfg.halfW - cfg.bodyY * 0.12) * k, 0);
      for (let i = 0; i < 4; i++) { X.l[i] = lerp(X.l[i], LEG_DEAD[i], k); X.lz[i] *= 1 - k; }
      X.hx = lerp(X.hx, 0.3, k); X.hy *= 1 - k; X.jaw = lerp(X.jaw, 0.35, k); X.ty *= 1 - k; X.tx = lerp(X.tx, -0.2, k);
    }
    // 写回
    body.position.set(0, X.by, X.bz);
    body.rotation.set(X.bx, X.bry, X.brz);
    head.rotation.set(X.hx, X.hy, X.hz);
    if (jaw) jaw.rotation.x = X.jaw;
    for (let i = 0; i < 4; i++) {
      if (cfg.sprawl) { const sd = Q.side[i]; legs[i].rotation.set(0, X.l[i] * sd, X.lz[i] * sd); }
      else legs[i].rotation.x = X.l[i];
    }
    for (let i = 0; i < tail.length; i++) tail[i].rotation.set(cfg.tailX[i] + X.tx * 0.5, X.ty * (0.6 + i * 0.4), 0);
    if (cfg.extra) cfg.extra(A, s, t);
  };
}

function quadRig(bodyY, scale) {
  const root = grp(null);
  const sc = grp(root);
  sc.scale.setScalar(scale);
  const all = grp(sc);
  const body = grp(all, 0, bodyY, 0);
  return { root, all, body, legs: [], tail: [], side: [1, -1, 1, -1] };
}

// ============ 狼 / 狼王 ============
function wolf(big) {
  const S = big ? 1.45 : 1;
  const Q = quadRig(0.56, S);
  const fur = matL(big ? '#5e5384' : '#64718f'), dark = matL(big ? '#3b3358' : '#3d455c');
  const glowC = big ? '#c49bff' : '#7fe3ff';
  add(Q.body, merged('wolf_body', [
    [G.ico(0.3, 1), [0, 0, -0.12], 0, [1, 0.95, 1.9]],
    [G.ico(0.32, 1), [0, 0.03, 0.26], 0, [1.05, 1.05, 1.1]],
  ]), fur);
  add(Q.body, merged(big ? 'wolf_ruffB' : 'wolf_ruff', big ? [
    [G.ico(0.3, 0), [0, 0.12, 0.36], 0, [1.25, 1.1, 0.9]],
    [G.cone(0.1, 0.36, 4), [0.17, 0.26, 0.2], [-1.7, 0, -0.5]],
    [G.cone(0.1, 0.36, 4), [-0.17, 0.26, 0.2], [-1.7, 0, 0.5]],
    [G.cone(0.1, 0.36, 4), [0, 0.32, 0.15], [-1.8, 0, 0]],
  ] : [
    [G.cone(0.08, 0.26, 4), [0, 0.3, 0.12], [-1.8, 0, 0]],
    [G.cone(0.07, 0.22, 4), [0, 0.28, -0.12], [-1.9, 0, 0]],
    [G.cone(0.07, 0.24, 4), [0.15, 0.2, 0.32], [-1.6, 0, -0.6]],
    [G.cone(0.07, 0.24, 4), [-0.15, 0.2, 0.32], [-1.6, 0, 0.6]],
  ]), big ? matL('#a395d6') : dark);
  if (big) {
    // 狼王：背脊骨刺
    add(Q.body, merged('wolf_spike', [
      [G.cone(0.06, 0.3, 4), [0, 0.32, -0.05], [-0.4, 0, 0]],
      [G.cone(0.055, 0.26, 4), [0, 0.3, -0.25], [-0.5, 0, 0]],
      [G.cone(0.05, 0.22, 4), [0, 0.26, -0.45], [-0.6, 0, 0]],
      [G.cone(0.05, 0.2, 4), [0.2, 0.22, 0.3], [-0.3, 0, -0.7]],
      [G.cone(0.05, 0.2, 4), [-0.2, 0.22, 0.3], [-0.3, 0, 0.7]],
    ]), matL('#e2dccb'));
  }
  // 腿
  const legG = merged('wolf_leg', [
    [G.cyl(0.095, 0.065, 0.4, 5), [0, -0.2, 0]],
    [G.box(0.13, 0.07, 0.17), [0, -0.425, 0.03]],
  ]);
  for (const [x, z] of [[0.17, 0.36], [-0.17, 0.36], [0.17, -0.45], [-0.17, -0.45]]) {
    const g = grp(Q.body, x, -0.1, z);
    add(g, legG, dark);
    Q.legs.push(g);
  }
  // 头
  Q.head = grp(Q.body, 0, 0.22, 0.58);
  Q.head.scale.setScalar(1.2);
  add(Q.head, merged('wolf_head', [
    [G.ico(0.2, 1), [0, 0, 0], 0, [1, 0.9, 1.1]],
    [G.box(0.15, 0.12, 0.28), [0, -0.05, 0.24]],
    [G.cone(0.07, 0.2, 4), [0.1, 0.2, -0.03], [-0.2, 0, -0.25]],
    [G.cone(0.07, 0.2, 4), [-0.1, 0.2, -0.03], [-0.2, 0, 0.25]],
    [G.cone(0.08, 0.18, 4), [0.17, -0.06, -0.02], [0, 0, -1.7]],
    [G.cone(0.08, 0.18, 4), [-0.17, -0.06, -0.02], [0, 0, 1.7]],
  ]), fur);
  Q.jaw = grp(Q.head, 0, -0.1, 0.1);
  add(Q.jaw, G.box(0.12, 0.05, 0.26), dark, [0, 0, 0.13]);
  add(Q.head, merged('wolf_eye', [
    [G.box(0.07, 0.035, 0.03), [0.09, 0.04, 0.17], [0, 0.4, 0]],
    [G.box(0.07, 0.035, 0.03), [-0.09, 0.04, 0.17], [0, -0.4, 0]],
    [G.box(0.06, 0.05, 0.05), [0, -0.01, 0.39]],
  ]), matGlow(glowC));
  // 尾巴
  const tl = grp(Q.body, 0, 0.12, -0.62);
  add(tl, merged('wolf_tail', [
    [G.cone(0.1, 0.55, 5), [0, 0, -0.27], [-PI / 2, 0, 0]],
  ]), fur);
  Q.tail.push(tl);

  const update = quadDriver(Q, {
    bodyY: 0.56, cycle: 2.2 * S, gait: [0, 0.4, PI, PI + 0.4], amp: 0.8, bob: 0.07, pitch: 0.05,
    halfW: 0.3, tailX: [-0.45],
    attack(p, idx) {
      X.bz += k3(-0.15, 0.42); X.bx += k3(-0.25, 0.15); X.by += k3(0.05, -0.03);
      X.hx += k3(-0.45, 0.35); X.jaw += k3(0.75, 0.0);
      if (idx % 2) X.hy += k3(0.5, -0.45);
      X.l[0] += k3(-0.6, 0.4); X.l[1] += k3(-0.5, 0.45); X.l[2] += k3(0.2, -0.3); X.l[3] += k3(0.2, -0.3);
    },
  });
  update({ t: 0 });
  return { root: Q.root, height: (big ? 1.05 : 1.0) * S, update };
}

// ============ 獠牙野猪 ============
function boar() {
  const S = 1.15;
  const Q = quadRig(0.78, S);
  const hide = matL('#6e4a32'), dark = matL('#33221a');
  add(Q.body, merged('boar_body', [
    [G.ico(0.5, 1), [0, 0, -0.18], 0, [1, 0.92, 1.45]],
    [G.ico(0.48, 1), [0, 0.12, 0.32], 0, [1.08, 1.05, 1]],
  ]), hide);
  add(Q.body, merged('boar_mane', [
    [G.cone(0.1, 0.4, 4), [0, 0.6, 0.45], [-0.6, 0, 0]],
    [G.cone(0.1, 0.42, 4), [0, 0.6, 0.2], [-0.8, 0, 0]],
    [G.cone(0.1, 0.38, 4), [0, 0.52, -0.08], [-1.0, 0, 0]],
    [G.cone(0.09, 0.3, 4), [0, 0.44, -0.35], [-1.2, 0, 0]],
    [G.cone(0.08, 0.3, 4), [0.16, 0.52, 0.3], [-0.7, 0, -0.5]],
    [G.cone(0.08, 0.3, 4), [-0.16, 0.52, 0.3], [-0.7, 0, 0.5]],
  ]), dark);
  const legG = merged('boar_leg', [
    [G.cyl(0.13, 0.09, 0.44, 6), [0, -0.2, 0]],
    [G.cyl(0.1, 0.11, 0.1, 6), [0, -0.46, 0]],
  ]);
  for (const [x, z] of [[0.28, 0.45], [-0.28, 0.45], [0.28, -0.6], [-0.28, -0.6]]) {
    const g = grp(Q.body, x, -0.27, z);
    add(g, legG, hide);
    Q.legs.push(g);
  }
  Q.head = grp(Q.body, 0, 0.08, 0.82);
  add(Q.head, merged('boar_head', [
    [G.ico(0.32, 1), [0, 0, 0.05], 0, [0.92, 0.85, 1.1]],
    [G.cyl(0.17, 0.22, 0.32, 7), [0, -0.06, 0.38], [PI / 2, 0, 0]],
    [G.cone(0.09, 0.22, 4), [0.2, 0.24, -0.05], [-0.4, 0, -0.6]],
    [G.cone(0.09, 0.22, 4), [-0.2, 0.24, -0.05], [-0.4, 0, 0.6]],
  ]), hide);
  add(Q.head, G.cyl(0.155, 0.155, 0.05, 8), matL('#c7877a'), [0, -0.06, 0.55], [PI / 2, 0, 0]);
  add(Q.head, merged('boar_tusk', [
    [G.cone(0.05, 0.36, 5), [0.17, -0.1, 0.44], [0.65, 0, -0.4]],
    [G.cone(0.05, 0.36, 5), [-0.17, -0.1, 0.44], [0.65, 0, 0.4]],
  ]), matL('#efe6d0'));
  add(Q.head, merged('boar_eye', [
    [G.box(0.06, 0.045, 0.03), [0.16, 0.09, 0.3], [0, 0.4, 0]],
    [G.box(0.06, 0.045, 0.03), [-0.16, 0.09, 0.3], [0, -0.4, 0]],
  ]), matGlow('#ff6a3d'));
  const tl = grp(Q.body, 0, 0.2, -0.88);
  add(tl, G.cone(0.06, 0.3, 4), dark, [0, 0, -0.14], [-PI / 2, 0, 0]);
  Q.tail.push(tl);

  const update = quadDriver(Q, {
    bodyY: 0.78, cycle: 2.2 * S, gait: [0, PI, PI, 0], amp: 0.65, bob: 0.06, pitch: 0.06,
    halfW: 0.48, tailX: [-0.6],
    attack(p, idx) {
      // 低头冲顶，再上挑
      X.bz += k3(-0.28, 0.55); X.bx += k3(0.12, -0.12); X.by += k3(-0.05, 0.04);
      X.hx += k3(0.5, -0.55); X.hy += idx % 2 ? k3(0.25, -0.3) : 0;
      X.l[0] += k3(0.3, -0.5); X.l[1] += k3(0.3, -0.5); X.l[2] += k3(0.3, 0.4); X.l[3] += k3(0.3, 0.4);
    },
  });
  update({ t: 0 });
  return { root: Q.root, height: 1.5 * S, update };
}

// ============ 赤焰蜥王 ============
function redLizard() {
  const S = 1.2;
  const Q = quadRig(0.6, S);
  const red = matL('#c23a26'), belly = matL('#f2a24a');
  add(Q.body, G.ico(0.5, 1), red, [0, 0, 0], null, [1.05, 0.62, 1.8]);
  add(Q.body, G.ico(0.46, 1), belly, [0, -0.1, 0.05], null, [1.0, 0.45, 1.7]);
  // 背部火焰冠
  const crestParts = [];
  for (let i = 0; i < 6; i++) {
    const z = 0.65 - i * 0.28, h = 0.42 - Math.abs(i - 1.5) * 0.06;
    crestParts.push([G.cone(0.1, h, 4), [0, 0.26 + h / 2, z], [-0.35, 0, 0]]);
  }
  const crest = add(Q.body, merged('liz_crest', crestParts), matGlow('#ffb52e'));
  // 外撇的四条腿（右侧镜像）
  // 上臂向外略向下，前臂向下略外撇，脚掌带三爪
  const legG = merged('liz_leg', [
    [G.ico(0.13, 0), [0.02, 0, 0]],
    [G.cyl(0.12, 0.1, 0.42, 6), [0.2, -0.062, 0], [0, 0, -1.87]],
    [G.ico(0.1, 0), [0.4, -0.124, 0]],
    [G.cyl(0.09, 0.07, 0.39, 6), [0.45, -0.312, 0], [0, 0, 0.26]],
    [G.box(0.24, 0.08, 0.28), [0.5, -0.51, 0.05]],
    [G.cone(0.035, 0.12, 3), [0.42, -0.53, 0.22], [PI / 2, 0, 0]],
    [G.cone(0.035, 0.12, 3), [0.5, -0.53, 0.24], [PI / 2, 0, 0]],
    [G.cone(0.035, 0.12, 3), [0.58, -0.53, 0.22], [PI / 2, 0, 0]],
  ]);
  for (const [x, z] of [[0.42, 0.55], [-0.42, 0.55], [0.42, -0.5], [-0.42, -0.5]]) {
    const g = grp(Q.body, x, -0.05, z);
    if (x < 0) g.scale.x = -1;
    add(g, legG, red);
    Q.legs.push(g);
  }
  Q.head = grp(Q.body, 0, 0.05, 0.92);
  add(Q.head, merged('liz_head', [
    [G.ico(0.3, 1), [0, 0.02, 0.1], 0, [1.1, 0.6, 1.3]],
    [G.box(0.36, 0.14, 0.4), [0, -0.01, 0.4]],
    [G.cone(0.07, 0.3, 4), [0.17, 0.15, -0.1], [-1.9, 0, -0.3]],
    [G.cone(0.07, 0.3, 4), [-0.17, 0.15, -0.1], [-1.9, 0, 0.3]],
  ]), red);
  Q.jaw = grp(Q.head, 0, -0.1, 0.12);
  add(Q.jaw, G.box(0.32, 0.07, 0.5), belly, [0, 0, 0.22]);
  add(Q.head, merged('liz_eye', [
    [G.oct(0.06), [0.19, 0.11, 0.26]],
    [G.oct(0.06), [-0.19, 0.11, 0.26]],
  ]), matGlow('#fff07a'));
  const fire = grp(Q.head, 0, -0.06, 0.62);
  const fireM = add(fire, merged('liz_fire', [
    [G.cone(0.32, 1.7, 6), [0, 0, 0.85], [-PI / 2, 0, 0]],
  ]), matGlow('#ff7a1f', 0.85));
  noShadow(fireM);
  // 尾巴三节
  let parent = Q.body, z0 = -0.85;
  const tailSeg = [[0.28, 0.2, 0.7], [0.2, 0.12, 0.65], [0.12, 0.02, 0.6]];
  for (const [r0, r1, len] of tailSeg) {
    const g = grp(parent, 0, 0, z0);
    add(g, G.cyl(r0, r1, len, 6), red, [0, 0, -len / 2], [PI / 2, 0, 0], [1, 1, 0.75]);
    Q.tail.push(g);
    parent = g; z0 = -len;
  }

  const update = quadDriver(Q, {
    bodyY: 0.6, cycle: 2.6 * S, gait: [0, PI, PI, 0], amp: 0.55, bob: 0.03, pitch: 0.0, sprawl: true,
    halfW: 0.33, tailX: [-0.22, 0.1, 0.12],
    attack(p, idx) {
      X.bz += k3(-0.2, 0.45); X.bx += k3(-0.15, 0.08);
      X.hx += k3(-0.45, 0.2); X.jaw += k3(0.85, 0.6);
      X.hy += idx % 2 ? k3(-0.3, 0.35) : 0;
      X.fire = kb(0.48, 0.92);
    },
    extra(A, s, t) {
      const f = X.fire;
      fire.visible = f > 0.02;
      fire.scale.set(0.6 + f * 0.6, 0.6 + f * 0.6, f * (1 + Math.sin(t * 40) * 0.08));
      crest.scale.set(1, 1 + Math.sin(t * 7) * 0.08 + f * 0.3, 1);
    },
  });
  update({ t: 0 });
  return { root: Q.root, height: 1.4 * S, update };
}

// ============ 岩甲虫 ============
function beetle() {
  const root = grp(null);
  const all = grp(root);
  const BY = 0.42;
  const body = grp(all, 0, BY, 0);
  const shellM = matL('#7a6a58'), under = matL('#3b332c'), hornM = matL('#4a3c30');
  add(body, G.ico(0.42, 1), under, [0, -0.05, -0.1], null, [1, 0.55, 1.4]);
  // 左右鞘翅（可张开）
  const shL = grp(body, 0, 0.08, 0.22), shR = grp(body, 0, 0.08, 0.22);
  shR.scale.x = -1;
  const shellG = G.ico(0.45, 1);
  add(shL, shellG, shellM, [0.21, 0, -0.38], null, [0.52, 0.6, 1.2]);
  add(shR, shellG, shellM, [0.21, 0, -0.38], null, [0.52, 0.6, 1.2]);
  // 头 + 前胸 + 晶体
  const head = grp(body, 0, 0.02, 0.38);
  add(head, merged('bt_head', [
    [G.ico(0.3, 1), [0, 0.04, 0], 0, [1.15, 0.7, 0.75]],
    [G.ico(0.17, 0), [0, -0.04, 0.2]],
  ]), shellM);
  add(head, G.cone(0.085, 0.48, 5), hornM, [0, 0.15, 0.36], [1.0, 0, 0]);
  add(head, merged('bt_crys', [
    [G.oct(0.09), [0.12, 0.22, -0.05], [0, 0, -0.3], [0.8, 1.8, 0.8]],
    [G.oct(0.07), [-0.1, 0.2, -0.08], [0, 0, 0.35], [0.8, 1.8, 0.8]],
    [G.oct(0.06), [0.0, 0.24, -0.15], [0.3, 0, 0], [0.8, 1.6, 0.8]],
  ]), matGlow('#62f0d2'));
  add(head, merged('bt_eye', [
    [G.box(0.05, 0.04, 0.04), [0.1, 0.0, 0.28]],
    [G.box(0.05, 0.04, 0.04), [-0.1, 0.0, 0.28]],
  ]), matGlow('#ffcf5a'));
  const mdL = grp(head, 0.1, -0.08, 0.3), mdR = grp(head, -0.1, -0.08, 0.3);
  const mdG = G.cone(0.04, 0.24, 4);
  add(mdL, mdG, hornM, [0, 0, 0.11], [PI / 2, 0, 0]);
  add(mdR, mdG, hornM, [0, 0, 0.11], [PI / 2, 0, 0]);
  // 三角步态：两组腿各合并成一个网格
  const leg = (sx, z) => [
    [G.box(0.3, 0.05, 0.05), [sx * 0.42, 0.06, z], [0, 0, sx * 0.38]],
    [G.box(0.05, 0.5, 0.05), [sx * 0.62, -0.14, z], [0, 0, sx * 0.3]],
  ];
  const legA = grp(body, 0, -0.05, 0), legB = grp(body, 0, -0.05, 0);
  add(legA, merged('bt_legA', [...leg(1, 0.25), ...leg(-1, -0.05), ...leg(1, -0.35)]), under);
  add(legB, merged('bt_legB', [...leg(-1, 0.25), ...leg(1, -0.05), ...leg(-1, -0.35)]), under);

  const A = newTrack();
  function update(s) {
    s = s || EMPTY_STATE;
    track(A, s, 1.2);
    const t = A.t + A.seed, rw = A.runW, ph = A.ph;
    let by = BY + Math.sin(t * 2.5) * 0.006, bz = 0, bx = 0, hx = 0, hy = Math.sin(t * 0.5) * 0.15 * (1 - rw);
    let md = 0.15 + Math.sin(t * 3) * 0.1, shell = 0;
    const a = Math.sin(ph);
    legA.position.y = -0.05 + Math.max(0, a) * 0.07 * rw;
    legB.position.y = -0.05 + Math.max(0, -a) * 0.07 * rw;
    legA.rotation.set(0, a * 0.3 * rw, 0);
    legB.rotation.set(0, -a * 0.3 * rw, 0);
    by += Math.abs(a) * 0.02 * rw;
    if (A.actW > 0.001) {
      T3(A.p, 0.42, 0.58, A.actW);
      bx += k3(-0.35, 0.15); bz += k3(-0.08, 0.25); hx += k3(-0.35, 0.3); md += k3(0.6, -0.15);
      shell += k3(0.5, 0.2); by += k3(0.06, 0);
    }
    const sw = A.stunW;
    let rz = Math.sin(t * 5) * 0.1 * sw;
    hx += 0.25 * sw;
    const aw = A.airW;
    all.rotation.set((-0.6 * smooth(A.airT / 0.25)) * aw, 0, rz + Math.sin(A.airT * 8) * 0.3 * aw);
    all.position.set(0, 0, 0);
    if (aw > 0.001) { legA.rotation.x = Math.sin(t * 20) * 0.3 * aw; legB.rotation.x = -legA.rotation.x; }
    if (A.dead) {
      // 翻成四脚朝天，腿抽动几下
      const k = easeIn(clamp01(A.d / 0.6));
      all.rotation.set(0, 0, PI * k);
      all.position.set(0, 2 * (BY - 0.06) * k, 0);
      const tw = Math.sin(t * 22) * 0.25 * Math.max(0, 1 - A.d / 1.6);
      legA.rotation.set(tw, 0, 0); legB.rotation.set(-tw, 0, 0);
      legA.position.y = legB.position.y = -0.05;
      md = lerp(md, 0.5, k);
    }
    body.position.set(0, by, bz);
    body.rotation.x = bx;
    head.rotation.set(hx, hy, 0);
    mdL.rotation.y = md; mdR.rotation.y = -md;
    shL.rotation.set(shell * 0.45, 0, shell); shR.rotation.set(shell * 0.45, 0, -shell);
  }
  update({ t: 0 });
  return { root, height: 1.0, update };
}

// ============ 赤羽鸟 / 鸟王 ============
function bird(big) {
  const S = big ? 1.4 : 1;
  const root = grp(null);
  const sc = grp(root);
  sc.scale.setScalar(S);
  const all = grp(sc);
  const HY = 1.25;
  const hover = grp(all, 0, HY, 0);
  const body = grp(hover);
  const red = matL(big ? '#c93424' : '#d8452f'), wingM = matL(big ? '#9c2216' : '#b8321f');
  const tipM = matL(big ? '#ffb347' : '#ff8c42'), cream = matL('#ffd9a0'), gold = matL('#f2b33d');
  add(body, merged('bird_body', [
    [G.ico(0.28, 1), [0, 0, -0.02], 0, [0.9, 0.9, 1.25]],
    [G.ico(0.18, 1), [0, 0.16, 0.22]],
  ]), red);
  add(body, G.ico(0.24, 1), cream, [0, -0.08, 0.07], null, [0.82, 0.8, 1.1]);
  // 头
  const head = grp(body, 0, 0.3, 0.3);
  add(head, G.ico(0.17, 1), red);
  add(head, merged(big ? 'bird_crestB' : 'bird_crest', big ? [
    [G.cone(0.06, 0.4, 4), [0, 0.2, -0.12], [-0.7, 0, 0]],
    [G.cone(0.05, 0.36, 4), [0.08, 0.16, -0.14], [-0.9, 0, -0.35]],
    [G.cone(0.05, 0.36, 4), [-0.08, 0.16, -0.14], [-0.9, 0, 0.35]],
    [G.cone(0.04, 0.3, 4), [0, 0.12, -0.2], [-1.2, 0, 0]],
  ] : [
    [G.cone(0.05, 0.24, 4), [0, 0.17, -0.08], [-0.8, 0, 0]],
    [G.cone(0.04, 0.2, 4), [0, 0.12, -0.14], [-1.1, 0, 0]],
  ]), big ? matGlow('#ffcf4a') : tipM);
  add(head, G.cone(0.07, 0.22, 4), gold, [0, -0.01, 0.22], [PI / 2, 0, 0]);
  const beakL = grp(head, 0, -0.05, 0.12);
  add(beakL, G.cone(0.05, 0.15, 4), gold, [0, 0, 0.07], [PI / 2, 0, 0]);
  add(head, merged('bird_eye', [
    [G.box(0.045, 0.045, 0.03), [0.1, 0.04, 0.11], [0, 0.6, 0]],
    [G.box(0.045, 0.045, 0.03), [-0.1, 0.04, 0.11], [0, -0.6, 0]],
  ]), matGlow('#fff2b0'));
  // 翅膀：内段 + 外段，右侧镜像
  const innerG = merged('bird_wing1', [[G.shape('bw1', [[0, -0.1], [0.58, -0.06], [0.52, 0.26], [0.04, 0.3]], 0.04), [0, 0, 0], FLAT]]);
  const outerG = merged('bird_wing2', [[G.shape('bw2', [[0, -0.06], [0.42, -0.02], [0.72, 0.12], [0.6, 0.3], [0.36, 0.42], [0.12, 0.36], [0, 0.26]], 0.035), [0, 0, 0], FLAT]]);
  const wings = [];
  for (const sx of [1, -1]) {
    const w1 = grp(body, sx * 0.18, 0.1, 0.06);
    if (sx < 0) w1.scale.x = -1;
    add(w1, innerG, wingM);
    const w2 = grp(w1, 0.55, 0, 0);
    add(w2, outerG, tipM);
    wings.push(w1, w2);
  }
  // 尾羽
  const tail = grp(body, 0, 0.02, -0.32);
  add(tail, merged('bird_tail', [
    [G.cone(0.1, 0.5, 4), [0, 0, -0.24], [-PI / 2 - 0.15, 0, 0], [1, 1, 0.3]],
    [G.cone(0.09, 0.44, 4), [0.12, 0, -0.2], [-PI / 2 - 0.1, 0, -0.35], [1, 1, 0.3]],
    [G.cone(0.09, 0.44, 4), [-0.12, 0, -0.2], [-PI / 2 - 0.1, 0, 0.35], [1, 1, 0.3]],
  ]), tipM);
  // 爪
  add(body, merged('bird_leg', [
    [G.cyl(0.025, 0.02, 0.3, 4), [0.08, -0.3, -0.02]],
    [G.cyl(0.025, 0.02, 0.3, 4), [-0.08, -0.3, -0.02]],
    [G.cone(0.04, 0.12, 4), [0.08, -0.46, 0.03], [2.2, 0, 0]],
    [G.cone(0.04, 0.12, 4), [-0.08, -0.46, 0.03], [2.2, 0, 0]],
  ]), matL('#4a3020'));

  const A = newTrack();
  let flap = Math.random() * TAU;
  function update(s) {
    s = s || EMPTY_STATE;
    track(A, s, 3);
    const t = A.t + A.seed, rw = A.runW, sw = A.stunW;
    flap += A.dt * (11 + rw * 5 - sw * 4);
    const f = Math.sin(flap), f2 = Math.sin(flap - 0.9);
    let hy = HY + Math.sin(flap + PI) * 0.07 - 0.25 * sw;
    let bx = 0.06 + Math.sin(t * 1.1) * 0.04 + rw * 0.3, bz = 0;
    let hx = -rw * 0.25 + Math.sin(t * 1.7) * 0.06, hdy = Math.sin(t * 0.6) * 0.4 * (1 - rw), beak = 0.05;
    let w1z = 0.15 + f * 0.75, w1y = 0.1, w2z = f2 * 0.5, tx = Math.sin(t * 2) * 0.1 - rw * 0.15;
    if (A.actW > 0.001) {
      T3(A.p, 0.45, 0.6, A.actW);
      bx += k3(-0.45, 0.35); bz += k3(-0.15, 0.25); hx += k3(-0.5, 0.45); beak += k3(0.7, 0.5);
      w1z += k3(0.5, -0.6); w1y += k3(0.5, -0.3); w2z += k3(0.3, -0.2); hy += k3(0.15, 0);
    }
    const aw = A.airW;
    all.rotation.set(0, 0, Math.sin(t * 5) * 0.12 * sw + Math.sin(A.airT * 9) * 0.5 * aw);
    all.position.set(0, 0, 0);
    if (A.dead) {
      // 掉落到地上侧躺，翅膀耷拉
      const k = easeIn(clamp01(A.d / 0.6));
      hy = lerp(hy, 0.24, k);
      all.rotation.set(0, 0, 1.3 * k);
      all.position.set(0.22 * k, 0.2 * k, 0);
      w1z = lerp(w1z, -0.25, k); w2z = lerp(w2z, 0.3, k); w1y = lerp(w1y, 0.2, k);
      hx = lerp(hx, 0.5, k); beak = lerp(beak, 0.3, k); bx = lerp(bx, 0, k);
    }
    hover.position.set(0, hy, bz);
    body.rotation.x = bx;
    head.rotation.set(hx, hdy, 0);
    beakL.rotation.x = beak;
    // 右翼根节点被镜像，绕 Y/Z 的转角取反；外段在镜像组内部，不用取反
    wings[0].rotation.set(0, w1y, w1z); wings[2].rotation.set(0, -w1y, -w1z);
    wings[1].rotation.z = w2z; wings[3].rotation.z = w2z;
    tail.rotation.x = tx;
  }
  update({ t: 0 });
  return { root, height: (HY + 0.6) * S, update };
}

// ============ 蓝晶巨像 ============
function blueGolem() {
  const root = grp(null);
  const all = grp(root);
  const PY = 1.05, TP = 0.45;
  const pelvis = grp(all, 0, PY, 0);
  const torso = grp(pelvis, 0, 0.1, 0);
  const stone = matL('#6f87ab'), stoneD = matL('#4b5d7d'), stoneL = matL('#9fb4d4');
  const crys = matS('#4fc3ff', 0.2, 0.3, 0.55), glow = matGlow('#9fe8ff');
  add(pelvis, G.dod(0.55), stoneD, [0, 0, 0], null, [1.2, 0.7, 0.9]);
  add(torso, G.dod(0.85), stone, [0, 0.65, 0], [0.3, 0.4, 0], [1.25, 1.0, 0.9]);
  add(torso, merged('bg_crys', [
    [G.oct(0.22), [0.35, 1.25, -0.35], [-0.5, 0, -0.4], [0.8, 2.4, 0.8]],
    [G.oct(0.26), [-0.2, 1.35, -0.4], [-0.6, 0, 0.3], [0.8, 2.6, 0.8]],
    [G.oct(0.18), [0.05, 1.0, -0.7], [-1.0, 0, 0.1], [0.8, 2.2, 0.8]],
    [G.oct(0.2), [0.95, 1.15, 0.0], [0, 0, -0.6], [0.8, 2.2, 0.8]],
    [G.oct(0.18), [-0.95, 1.12, 0.05], [0, 0, 0.6], [0.8, 2.2, 0.8]],
  ]), crys);
  const core = add(torso, G.oct(0.2), glow, [0, 0.72, 0.74], null, [1, 1.3, 0.7]);
  const head = grp(torso, 0, 1.22, 0.78);
  add(head, merged('bg_head', [
    [G.dod(0.36), [0, 0.1, 0.1], [0.4, 0.3, 0]],
    [G.box(0.5, 0.14, 0.3), [0, 0.24, 0.22], [0.25, 0, 0]],
  ]), stoneL);
  add(head, merged('bg_eye', [
    [G.box(0.12, 0.05, 0.05), [0.12, 0.12, 0.42], [0, 0.3, -0.15]],
    [G.box(0.12, 0.05, 0.05), [-0.12, 0.12, 0.42], [0, -0.3, 0.15]],
  ]), glow);
  // 双臂：上臂 + 前臂巨拳
  const upG = G.cyl(0.27, 0.22, 0.85, 6);
  const foreG = merged('bg_fore', [
    [G.cyl(0.24, 0.3, 0.7, 6), [0, -0.35, 0]],
    [G.dod(0.4), [0, -0.85, 0.05], [0.3, 0.2, 0]],
  ]);
  const sh = [], el = [];
  for (const sx of [1, -1]) {
    const s1 = grp(torso, sx * 0.95, 0.95, 0.1);
    add(s1, G.dod(0.35), stoneD, [sx * 0.08, 0.05, 0], [0.5, 0.3, 0]);
    add(s1, upG, stone, [0, -0.4, 0]);
    const e1 = grp(s1, 0, -0.85, 0);
    add(e1, foreG, stoneD);
    sh.push(s1); el.push(e1);
  }
  const legG = merged('bg_leg', [
    [G.cyl(0.3, 0.25, 0.6, 6), [0, -0.3, 0]],
    [G.cyl(0.25, 0.32, 0.4, 6), [0, -0.75, 0]],
    [G.box(0.5, 0.18, 0.6), [0, -0.96, 0.08]],
  ]);
  const lg = [];
  for (const sx of [1, -1]) { const g = grp(pelvis, sx * 0.45, 0, 0); add(g, legG, stoneD); lg.push(g); }

  const A = newTrack();
  function update(s) {
    s = s || EMPTY_STATE;
    track(A, s, 3.4);
    const t = A.t + A.seed, rw = A.runW, ph = A.ph;
    const a = Math.sin(ph);
    let py = PY + Math.sin(t * 1.5) * 0.02 + Math.abs(Math.cos(ph)) * 0.06 * rw;
    let tp = TP + Math.sin(t * 1.5) * 0.03 + 0.1 * rw, ty = 0, tz = Math.sin(ph) * 0.06 * rw;
    let aL = -0.3 + Math.sin(t * 1.2) * 0.04 - a * 0.55 * rw, aR = -0.3 + Math.sin(t * 1.2 + 1) * 0.04 + a * 0.55 * rw;
    let eL = -0.15, eR = -0.15, zL = 0.12, zR = 0.12;
    let lL = a * 0.45 * rw, lR = -a * 0.45 * rw, hx = -0.25, hy = Math.sin(t * 0.5) * 0.3 * (1 - rw);
    if (A.actW > 0.001) {
      T3(A.p, 0.45, 0.6, A.actW);
      if (A.idx % 2 === 0) {
        // 双拳举起 → 砸地
        aL += k3(-2.6, -0.45); aR += k3(-2.6, -0.45); eL += k3(-0.35, 0.1); eR += k3(-0.35, 0.1);
        zL += k3(0.1, -0.05); zR += k3(0.1, -0.05);
        tp += k3(-0.45, 0.4); py += k3(0.12, -0.22); hx += k3(-0.25, 0.2);
        lL += k3(0, -0.25); lR += k3(0, 0.15);
      } else {
        // 单臂横扫
        aR += k3(-1.6, -1.2); zR += k3(0.9, -0.2); eR += k3(-0.6, 0); ty += k3(-0.5, 0.55); tp += k3(-0.15, 0.2);
        aL += k3(0.3, 0.2);
      }
    }
    const sw = A.stunW;
    tz += Math.sin(t * 4) * 0.08 * sw; hx += 0.35 * sw; tp += 0.1 * sw;
    const aw = A.airW;
    all.rotation.set((-0.4 * smooth(A.airT / 0.25)) * aw, 0, Math.sin(A.airT * 6) * 0.15 * aw);
    all.position.set(0, 0, 0);
    if (A.dead) {
      // 向前跪倒趴下
      const k = easeIn(clamp01(A.d / 0.85));
      py = lerp(py, 0.6, k); tp = lerp(tp, 1.3, k); ty *= 1 - k; tz = lerp(tz, 0.1, k);
      lL = lerp(lL, 0.9, k); lR = lerp(lR, 1.05, k);
      aL = lerp(aL, -1.4, k); aR = lerp(aR, -1.2, k); zL = lerp(zL, 0.7, k); zR = lerp(zR, 0.5, k);
      eL = lerp(eL, 0, k); eR = lerp(eR, 0, k); hx = lerp(hx, 0.4, k);
    }
    pelvis.position.y = py;
    torso.rotation.set(tp, ty, tz);
    head.rotation.set(hx - (tp - TP) * 0.5, hy, 0);
    // 手臂角度相对世界竖直方向，扣掉躯干前倾
    sh[0].rotation.set(aL - tp, 0, zL); sh[1].rotation.set(aR - tp, 0, -zR);
    el[0].rotation.x = eL; el[1].rotation.x = eR;
    lg[0].rotation.x = lL; lg[1].rotation.x = lR;
    core.scale.setScalar(Math.max(0.01, 1 + Math.sin(t * 3) * 0.12 - (A.dead ? clamp01(A.d) : 0)));
  }
  update({ t: 0 });
  return { root, height: 3.3, update };
}

export const MONSTER_BUILDERS = {
  blueGolem, redLizard, boar, beetle,
  wolfBig: () => wolf(true), wolf: () => wolf(false),
  birdBig: () => bird(true), bird: () => bird(false),
};
