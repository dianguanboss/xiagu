// 动画用的小数学工具（全部无分配）
export const TAU = Math.PI * 2;
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const easeOut = (x) => { x = clamp01(x); return 1 - (1 - x) * (1 - x); };
export const easeIn = (x) => { x = clamp01(x); return x * x; };
// p 在 [a,b] 区间内的进度
export const seg = (p, a, b) => clamp01((p - a) / (b - a));
// 帧率无关的平滑趋近
export const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
// 0→1→0 的鼓包
export const bump = (p, a, b) => { const x = seg(p, a, b); return Math.sin(x * Math.PI); };

// 三段关键帧：起点 base → 蓄力 wind（到 tw）→ 出手 strike（到 ts）→ 回到 base
export function key3(base, wind, strike, p, tw, ts) {
  if (p < tw) return lerp(base, wind, easeOut(p / tw));
  if (p < ts) return lerp(wind, strike, easeIn((p - tw) / (ts - tw)));
  return lerp(strike, base, smooth((p - ts) / (1 - ts)));
}

// 读取动作进度 0..1
export function actP(s) {
  const d = s.actDur > 0 ? s.actDur : 0.5;
  return clamp01((s.actT || 0) / d);
}

// 空状态（缺省用）
export const EMPTY_STATE = Object.freeze({});

// 帧间隔（缺省 1/60，最大 0.1）
export const getDt = (s) => {
  const dt = s.dt;
  return dt > 0 ? (dt > 0.1 ? 0.1 : dt) : 1 / 60;
};

// ---------- 野怪/首领用的状态跟踪（无分配） ----------
export function newTrack() {
  return {
    time: 0, t: 0, dt: 1 / 60, runW: 0, actW: 0, stunW: 0, airW: 0, ph: Math.random() * TAU,
    p: 0, idx: 0, kind: 0, slot: 0, airT: 0, dead: false, wasDead: false, deadT: 0, d: 0,
    seed: Math.random() * 10, first: true,
  };
}

// 每帧更新权重；cycleLen 为一个步态周期走的米数
export function track(A, s, cycleLen) {
  const dt = getDt(s);
  A.dt = dt; A.time += dt;
  A.t = s.t !== undefined ? s.t : A.time;
  if (s.dead) {
    if (!A.wasDead) { A.wasDead = true; A.deadT = 0; }
    A.deadT += dt;
    A.d = s.deadT !== undefined ? s.deadT : A.deadT;
    A.dead = true;
  } else {
    A.dead = false; A.wasDead = false; A.d = 0;
  }
  const live = !A.dead;
  A.runW = approach(A.runW, live && s.moving ? 1 : 0, 8, dt);
  const spd = s.moveSpeed > 0 ? s.moveSpeed : 6;
  if (A.runW > 0.01) A.ph += dt * spd / cycleLen * TAU;
  const act = live ? s.act : null;
  const on = act === 'attack' || act === 'cast';
  if (on) { A.kind = act === 'attack' ? 1 : 2; A.p = actP(s); A.idx = s.attackIdx | 0; A.slot = s.castSlot | 0; }
  A.actW = A.first && on ? 1 : approach(A.actW, on ? 1 : 0, on ? 30 : 7, dt);
  A.stunW = approach(A.stunW, live && s.stunned ? 1 : 0, 10, dt);
  A.airT = live && s.airborne ? A.airT + dt : 0;
  A.airW = approach(A.airW, live && s.airborne ? 1 : 0, 10, dt);
  A.first = false;
  return A;
}
