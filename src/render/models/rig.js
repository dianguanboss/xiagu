// 人形骨架（纯 Group 层级，不用蒙皮）+ 通用动作驱动。
// 英雄、近战/远程/超级兵共用。姿势用一组浮点通道表示，每帧混合后写回各关节。
import { grp } from './materials.js';
import { TAU, clamp01, lerp, smooth, easeIn, easeOut, approach, bump, key3, actP, getDt, EMPTY_STATE } from './anim.js';

// ---------- 姿势通道 ----------
// 约定：手臂/腿 X 负值＝向前抬；肘 X 负值＝前臂向前弯；膝 X 正值＝向后弯；
// 躯干 X 正值＝前倾；手臂 Z 正值＝向外张开（左右已镜像）；手臂 Y 正值＝向外横摆（左右已镜像）。
export const RY = 0, RZP = 1, RRX = 2, RRY = 3, RRZ = 4, PIV = 5,
  HY = 6, HRX = 7, HRY = 8, HRZ = 9,
  SX = 10, SY = 11, SZ = 12,
  NX = 13, NY = 14, NZ = 15,
  LAX = 16, LAY = 17, LAZ = 18, LEX = 19, LWX = 20, LWY = 21,
  RAX = 22, RAY = 23, RAZ = 24, REX = 25, RWX = 26, RWY = 27,
  LLX = 28, LLZ = 29, LKX = 30, RLX = 31, RLZ = 32, RKX = 33,
  W0 = 34, W1 = 35, W2 = 36, W3 = 37;
export const NCH = 38;

// ---------- 骨架 ----------
const DEF = { hipH: 0.88, hipW: 0.14, thigh: 0.42, shin: 0.46, shY: 0.56, shW: 0.34, upper: 0.3, lower: 0.28, neckY: 0.66 };

export function buildRig(opts) {
  const o = Object.assign({}, DEF, opts);
  if (o.comY === undefined) o.comY = o.hipH + o.shY * 0.4;
  const root = grp(null);
  const rig = grp(root);
  rig.rotation.order = 'YXZ';
  const hips = grp(rig, 0, o.hipH, 0);
  const spine = grp(hips, 0, 0.02, 0);
  spine.rotation.order = 'YXZ';
  const head = grp(spine, 0, o.neckY, 0);
  const shL = grp(spine, o.shW, o.shY, 0), shR = grp(spine, -o.shW, o.shY, 0);
  shL.rotation.order = shR.rotation.order = 'YXZ';
  const elL = grp(shL, 0, -o.upper, 0), elR = grp(shR, 0, -o.upper, 0);
  const haL = grp(elL, 0, -o.lower, 0), haR = grp(elR, 0, -o.lower, 0);
  haL.rotation.order = haR.rotation.order = 'YXZ';
  const lgL = grp(hips, o.hipW, 0, 0), lgR = grp(hips, -o.hipW, 0, 0);
  const knL = grp(lgL, 0, -o.thigh, 0), knR = grp(lgR, 0, -o.thigh, 0);
  return { root, rig, hips, spine, head, shL, shR, elL, elR, haL, haR, lgL, lgR, knL, knR, o };
}

// 把姿势写回骨架
export function applyPose(R, P) {
  const rx = P[RRX], ry = P[RRY], piv = P[PIV];
  let px = 0, py = P[RY], pz = P[RZP];
  if (piv !== 0) {
    // 绕身体重心旋转：补偿位移
    const sx = Math.sin(rx), sy = Math.sin(ry), cy = Math.cos(ry);
    px -= piv * sx * sy;
    py += piv * (1 - Math.cos(rx));
    pz -= piv * sx * cy;
  }
  R.rig.position.set(px, py, pz);
  R.rig.rotation.set(rx, ry, P[RRZ]);
  R.hips.position.y = R.o.hipH + P[HY];
  R.hips.rotation.set(P[HRX], P[HRY], P[HRZ]);
  R.spine.rotation.set(P[SX], P[SY], P[SZ]);
  R.head.rotation.set(P[NX], P[NY], P[NZ]);
  R.shL.rotation.set(P[LAX], P[LAY], P[LAZ]);
  R.shR.rotation.set(P[RAX], -P[RAY], -P[RAZ]);
  R.elL.rotation.x = P[LEX];
  R.elR.rotation.x = P[REX];
  R.haL.rotation.set(P[LWX], P[LWY], 0);
  R.haR.rotation.set(P[RWX], -P[RWY], 0);
  R.lgL.rotation.set(P[LLX], 0, P[LLZ]);
  R.lgR.rotation.set(P[RLX], 0, -P[RLZ]);
  R.knL.rotation.x = P[LKX];
  R.knR.rotation.x = P[RKX];
}

// ---------- 关键帧小工具 ----------
let _p = 0, _tw = 0.4, _ts = 0.6;
// 设定当前动作进度和蓄力/出手时间点
export function T(p, tw, ts) { _p = p; _tw = tw; _ts = ts; }
// 通道 i：当前值 → 蓄力值 → 出手值 → 回到当前值
export function K(P, i, wind, strike) { P[i] = key3(P[i], wind, strike, _p, _tw, _ts); }
// 在当前值上叠加 0→v→v→0
export function KA(P, i, wind, strike) { P[i] += key3(0, wind, strike, _p, _tw, _ts); }
const blend = (dst, src, w) => { for (let i = 0; i < NCH; i++) dst[i] += (src[i] - dst[i]) * w; };

// ---------- 基础姿势 ----------
function idlePose(P, t, st) {
  P.fill(0);
  const b = Math.sin(t * 2.2);
  P[HY] = b * 0.012 - 0.01;
  P[SX] = st.hunch + b * 0.025;
  P[NX] = -st.hunch * 0.6 - b * 0.02;
  P[LAZ] = 0.14 + b * 0.03; P[RAZ] = 0.14 + b * 0.03;
  P[LAX] = 0.04; P[RAX] = 0.04;
  P[LEX] = -0.18; P[REX] = -0.18;
  P[LLZ] = 0.05; P[RLZ] = 0.05;
  P[LKX] = 0.04; P[RKX] = 0.04;
  P[LLX] = -0.02; P[RLX] = -0.02;
}

function runPose(P, ph, st) {
  const s = Math.sin(ph), c = Math.cos(ph);
  const a = st.legAmp;
  P[LLX] = -s * a; P[RLX] = s * a;
  P[LKX] = 0.15 + 1.25 * Math.max(0, c); P[RKX] = 0.15 + 1.25 * Math.max(0, -c);
  P[HY] = 0.05 * Math.abs(c) - 0.06;
  P[SX] = st.hunch + st.lean;
  P[NX] = -(st.hunch + st.lean) * 0.7;
  P[SY] = s * 0.16;
  P[HRY] = -s * 0.1;
  P[HRZ] = c * 0.03;
  const aw = st.armAmp;
  P[LAX] = s * aw * st.swingL; P[RAX] = -s * aw * st.swingR;
  P[LEX] = -0.95; P[REX] = -0.95;
  P[LAZ] = 0.16; P[RAZ] = 0.16;
  P[LLZ] = 0.03; P[RLZ] = 0.03;
}

// ---------- 通用叠加姿势 ----------
function stunPose(P, t) {
  const w = Math.sin(t * 4.5);
  P[SX] = 0.32 + Math.sin(t * 5.2) * 0.08; P[SZ] = w * 0.16; P[SY] = 0;
  P[NX] = 0.35; P[NZ] = Math.sin(t * 4.5 + 1.2) * 0.3; P[NY] = 0;
  P[LAX] = 0.15; P[RAX] = 0.1; P[LAZ] = 0.12 + w * 0.1; P[RAZ] = 0.12 - w * 0.1; P[LAY] = 0; P[RAY] = 0;
  P[LEX] = -0.25; P[REX] = -0.25;
  P[HY] = -0.09; P[LKX] = 0.4; P[RKX] = 0.4; P[LLX] = -0.18; P[RLX] = -0.18;
  P[RRZ] = w * 0.07;
}

function airPose(P, at, t, comY) {
  const k = smooth(at / 0.25);
  P[PIV] = comY;
  P[RRX] = -0.85 * k - Math.sin(at * 6) * 0.15;
  P[RRY] = Math.sin(at * 5) * 0.5 * k;
  P[RRZ] = Math.sin(at * 7) * 0.12;
  const f = Math.sin(t * 16);
  P[LAX] = -2.2 + f * 0.35; P[RAX] = -2.0 - f * 0.35; P[LAZ] = 0.8; P[RAZ] = 0.8;
  P[LEX] = -0.4; P[REX] = -0.4;
  P[LLX] = -0.7 + f * 0.2; P[RLX] = -0.4 - f * 0.2; P[LKX] = 1.2; P[RKX] = 0.9;
  P[SX] = -0.2; P[NX] = -0.4;
}

function recallPose(P, t) {
  const b = Math.sin(t * 1.6);
  P[LAX] = -0.35; P[RAX] = -0.35; P[LAZ] = 0.3; P[RAZ] = 0.3;
  P[LAY] = -0.95; P[RAY] = -0.95; P[LEX] = -1.75; P[REX] = -1.75;
  P[LWX] = 0; P[RWX] = 0;
  P[SX] = 0.08; P[SY] = 0; P[NX] = 0.35; P[NY] = 0;
  P[HY] = -0.05; P[LKX] = 0.2; P[RKX] = 0.2; P[LLX] = -0.1; P[RLX] = -0.1;
  P[RY] = 0.12 + b * 0.05;
}

function channelPose(P, t) {
  const tr = Math.sin(t * 31) * 0.03;
  P[LAX] = -1.65 + tr; P[RAX] = -1.65 - tr; P[LAZ] = 0.45; P[RAZ] = 0.45;
  P[LEX] = -0.25; P[REX] = -0.25; P[LAY] = -0.1; P[RAY] = -0.1;
  P[SX] = -0.05; P[NX] = -0.05;
  P[LLX] = -0.25; P[RLX] = 0.2; P[LKX] = 0.2; P[RKX] = 0.1; P[HY] = -0.04;
}

// 默认死亡：向后（dir=1）或向前（dir=-1）倒地
export function deathPose(P, d, dir) {
  P.fill(0);
  const k = clamp01(d / 0.7);
  const fall = easeIn(k);
  const bounce = d > 0.7 ? Math.sin(clamp01((d - 0.7) / 0.25) * Math.PI) * 0.1 : 0;
  P[RRX] = (-1.45 * fall + bounce) * dir;
  P[RY] = 0.2 * fall;
  const kk = smooth(d / 0.5);
  P[LKX] = 0.7 * bump(k, 0, 0.9) + 0.1; P[RKX] = 0.5 * bump(k, 0, 0.9) + 0.15;
  P[HY] = -0.15 * bump(k, 0, 1);
  P[LAZ] = 1.1 * kk; P[RAZ] = 0.85 * kk;
  P[LAX] = dir > 0 ? 0.3 * kk : -0.6 * kk; P[RAX] = dir > 0 ? 0.1 * kk : -0.4 * kk;
  P[LEX] = -0.3; P[REX] = -0.5;
  P[NX] = -0.25 * kk * dir; P[NY] = 0.6 * kk; P[NZ] = 0.1 * kk;
  P[LLZ] = 0.15 * kk; P[RLZ] = 0.3 * kk;
  P[SZ] = 0.08 * kk;
}

// ---------- 通用攻击/施法 ----------
export function castGeneric(P, p, slot) {
  if (slot === 2) {
    T(p, 0.45, 0.6);
    K(P, LAX, -2.9, -1.0); K(P, RAX, -2.9, -1.0); K(P, LAZ, 0.45, 0.25); K(P, RAZ, 0.45, 0.25);
    K(P, LEX, -0.15, -0.1); K(P, REX, -0.15, -0.1);
    K(P, SX, -0.35, 0.5); K(P, NX, -0.35, 0.15); K(P, HY, 0.03, -0.2);
    K(P, LKX, 0.1, 0.7); K(P, RKX, 0.1, 0.5); K(P, LLX, 0, -0.55); K(P, RLX, 0, 0.15);
    P[RY] += 0.35 * bump(p, 0.1, 0.58);
  } else if (slot === 1) {
    T(p, 0.35, 0.55);
    K(P, RAX, -2.6, -2.95); K(P, RAZ, 0.3, 0.15); K(P, REX, -0.3, 0);
    K(P, LAX, -0.6, -0.3); K(P, LAZ, 0.9, 1.05); K(P, LEX, -0.4, -0.2);
    K(P, SX, -0.15, -0.22); K(P, NX, -0.2, -0.3);
    P[RY] += 0.12 * bump(p, 0.3, 0.7);
  } else {
    T(p, 0.35, 0.5);
    K(P, RAX, -0.5, -1.55); K(P, REX, -1.6, -0.05); K(P, LAX, -0.4, -1.4); K(P, LEX, -1.5, -0.1);
    K(P, LAY, 0, -0.3); K(P, RAY, 0, -0.3);
    K(P, SX, -0.2, 0.32); K(P, LLX, 0, -0.35); K(P, RLX, 0, 0.25); K(P, HY, 0, -0.06);
  }
}

// 风格缺省值
const STYLE_DEF = {
  cycle: 2.8, hunch: 0, lean: 0.22, legAmp: 0.85, armAmp: 0.9, swingL: 1, swingR: 1, deathDir: 1,
  hold: null, attack: null, cast: null, post: null, extra: null, stun: null, recall: null, channel: null, death: null,
};

// ---------- 动作驱动器 ----------
// R：buildRig 结果；style：上面的可选项。返回 update(state)
export function humanoidAnimator(R, style) {
  const st = Object.assign({}, STYLE_DEF, style);
  const base = new Float32Array(NCH), tmp = new Float32Array(NCH), out = new Float32Array(NCH), snap = new Float32Array(NCH);
  const A = {
    runW: 0, actW: 0, stunW: 0, airW: 0, recW: 0, chW: 0, ph: Math.random() * TAU,
    kind: 0, p: 0, slot: 0, idx: 0, airT: 0, time: 0, seed: Math.random() * 10, wasDead: false, deadT: 0, t: 0, dt: 0,
  };
  const comY = R.o.comY;
  let first = true;

  return function update(s) {
    s = s || EMPTY_STATE;
    const dt = getDt(s);
    A.time += dt;
    const t = s.t !== undefined ? s.t : A.time;
    A.t = t; A.dt = dt;

    // 死亡：从当前姿势混合到倒地姿势
    if (s.dead) {
      if (!A.wasDead) { snap.set(out); A.wasDead = true; A.deadT = 0; }
      A.deadT += dt;
      const d = s.deadT !== undefined ? s.deadT : A.deadT;
      if (st.death) st.death(tmp, d, A); else deathPose(tmp, d, st.deathDir);
      const k = smooth(d / 0.3);
      for (let i = 0; i < NCH; i++) out[i] = lerp(snap[i], tmp[i], k);
      if (st.post) st.post(out, A, t);
      applyPose(R, out);
      if (st.extra) st.extra(R, out, s, A, t, dt);
      return;
    }
    if (A.wasDead) { A.wasDead = false; A.actW = A.stunW = A.airW = A.recW = A.chW = 0; }

    // 待机 + 跑步
    const moving = !!s.moving;
    A.runW = approach(A.runW, moving ? 1 : 0, 9, dt);
    const spd = s.moveSpeed > 0 ? s.moveSpeed : 7;
    if (A.runW > 0.01) A.ph += dt * spd / st.cycle * TAU;
    idlePose(base, t + A.seed, st);
    if (A.runW > 0.001) {
      tmp.fill(0);
      runPose(tmp, A.ph, st);
      blend(base, tmp, A.runW);
    }
    if (st.hold) st.hold(base, A, t);

    // 回城 / 持续施法
    A.recW = approach(A.recW, s.recalling && !moving ? 1 : 0, 5, dt);
    if (A.recW > 0.001) {
      tmp.set(base);
      if (st.recall) st.recall(tmp, A, t); else recallPose(tmp, t);
      blend(base, tmp, A.recW);
    }
    A.chW = approach(A.chW, s.channel ? 1 : 0, 10, dt);
    if (A.chW > 0.001) {
      tmp.set(base);
      if (st.channel) st.channel(tmp, A, t); else channelPose(tmp, t);
      blend(base, tmp, A.chW);
    }

    // 普攻 / 施法
    const act = s.act;
    if (act === 'attack' || act === 'cast') {
      A.kind = act === 'attack' ? 1 : 2;
      A.p = actP(s);
      A.slot = s.castSlot | 0;
      A.idx = s.attackIdx | 0;
    }
    const actOn = (act === 'attack' || act === 'cast');
    A.actW = first && actOn ? 1 : approach(A.actW, actOn ? 1 : 0, actOn ? 30 : 7, dt);
    if (A.actW > 0.001 && A.kind) {
      tmp.set(base);
      if (A.kind === 1) { if (st.attack) st.attack(tmp, A.p, A.idx, A, t); }
      else if (st.cast) st.cast(tmp, A.p, A.slot, A, t);
      else castGeneric(tmp, A.p, A.slot);
      blend(base, tmp, A.actW);
    }

    // 眩晕 / 击飞
    A.stunW = approach(A.stunW, s.stunned ? 1 : 0, 10, dt);
    if (A.stunW > 0.001) {
      tmp.set(base);
      if (st.stun) st.stun(tmp, A, t); else stunPose(tmp, t);
      blend(base, tmp, A.stunW);
    }
    A.airT = s.airborne ? A.airT + dt : 0;
    A.airW = approach(A.airW, s.airborne ? 1 : 0, 12, dt);
    if (A.airW > 0.001) {
      tmp.set(base);
      airPose(tmp, A.airT, t, comY);
      blend(base, tmp, A.airW);
    }

    out.set(base);
    if (st.post) st.post(out, A, t);
    applyPose(R, out);
    if (st.extra) st.extra(R, out, s, A, t, dt);
    first = false;
  };
}
