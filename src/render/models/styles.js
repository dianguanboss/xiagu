// 英雄动作风格：持械姿势、普攻、施法。每个函数直接改写姿势数组 P（无分配）。
import {
  T, K, KA, castGeneric,
  RY, RZP, RRX, RRY, PIV, HY, SX, SY, SZ, NX, NY,
  LAX, LAY, LAZ, LEX, LWX, LWY, RAX, RAY, RAZ, REX, RWX, RWY,
  LLX, LLZ, LKX, RLX, RLZ, RKX, W0, W1, W2, W3,
} from './rig.js';
import { TAU, lerp, smooth, seg, bump } from './anim.js';

// 持续型包络：a→b 淡入，c→d 淡出
export const env = (p, a, b, c, d) => smooth(seg(p, a, b)) * (1 - smooth(seg(p, c, d)));
const H = (P, i, v, e) => { P[i] += (v - P[i]) * e; };
// 整圈旋转：转满后归零，避免回放
const spin = (p, a, b) => { const k = smooth(seg(p, a, b)); return k >= 1 ? 0 : k * TAU; };

// 跨步：出手时前腿前跨、重心下沉
function step(P, f = 1) {
  K(P, LLX, -0.15 * f, -0.5 * f); K(P, RLX, 0.1 * f, 0.35 * f);
  K(P, LKX, 0.15 * f, 0.35 * f); K(P, RKX, 0.1 * f, 0.25 * f);
  K(P, HY, -0.03 * f, -0.1 * f);
}

// ============ 剑客：单手长剑 ============
export const slash = {
  swingR: 0.3,
  hold(P, A) {
    const r = A.runW;
    P[RAX] += lerp(-0.3, 0.35, r);
    P[REX] = lerp(-0.55, -0.4, r);
    P[RWX] = lerp(1.3, 2.5, r);
    P[RAZ] += 0.06;
  },
  attack(P, p, idx) {
    if (idx % 2 === 0) {
      // 斜劈：举过肩 → 向左下劈
      T(p, 0.42, 0.56);
      K(P, RAX, -2.75, -0.55); K(P, RAY, 0.45, -0.55); K(P, RAZ, 0.25, 0.05); K(P, REX, -0.5, -0.1); K(P, RWX, 0.9, 1.1);
      K(P, SY, -0.5, 0.45); K(P, SX, -0.08, 0.32);
      K(P, LAX, -0.5, 0.45); K(P, LAZ, 0.45, 0.35);
    } else {
      // 横扫：从右外侧扫向左前
      T(p, 0.4, 0.56);
      K(P, RAX, -1.35, -1.4); K(P, RAY, 1.4, -0.95); K(P, REX, -0.35, -0.05); K(P, RWX, 1.7, 1.45); K(P, RAZ, 0.2, 0.05);
      K(P, SY, -0.6, 0.55); K(P, SX, 0.05, 0.25);
      K(P, LAX, -0.3, 0.4); K(P, LAZ, 0.6, 0.4);
    }
    step(P); K(P, RZP, 0, 0.18);
  },
  cast(P, p, slot) {
    if (slot === 0) {
      // 疾风斩：前冲突刺
      T(p, 0.3, 0.45);
      K(P, RAX, -0.6, -1.5); K(P, REX, -1.2, -0.05); K(P, RWX, 2.0, 1.55); K(P, RAY, 0.3, -0.15);
      K(P, SX, 0.15, 0.55); K(P, LAX, 0.3, 0.8); K(P, LAZ, 0.4, 0.5);
      K(P, LLX, -0.3, -0.8); K(P, RLX, 0.2, 0.6); K(P, LKX, 0.4, 0.4); K(P, HY, -0.08, -0.15);
      K(P, RZP, -0.1, 0.45);
    } else if (slot === 1) {
      // 回旋斩：手臂平伸、整身旋转一圈
      const e = env(p, 0, 0.15, 0.82, 1);
      H(P, RAZ, 1.35, e); H(P, RAX, -0.25, e); H(P, REX, -0.05, e); H(P, RWX, 1.5, e); H(P, RAY, 0, e);
      H(P, LAZ, 1.2, e); H(P, LAX, -0.2, e); H(P, SX, 0.2, e);
      H(P, LKX, 0.35, e); H(P, RKX, 0.35, e); H(P, HY, -0.1, e); H(P, LLX, -0.2, e); H(P, RLX, -0.2, e);
      P[RRY] += spin(p, 0.12, 0.78);
    } else {
      // 断空斩：跃起，双手举剑，落地重劈
      T(p, 0.5, 0.62);
      K(P, RAX, -2.9, -0.45); K(P, REX, -0.4, -0.05); K(P, RWX, 0.8, 1.2); K(P, RAY, 0, -0.15);
      K(P, LAX, -2.7, -0.5); K(P, LAY, -0.45, -0.4); K(P, LEX, -0.6, -0.2);
      K(P, SX, -0.35, 0.65); K(P, NX, -0.2, 0.1);
      K(P, LKX, 1.0, 0.9); K(P, RKX, 1.2, 0.6); K(P, LLX, -0.8, -0.7); K(P, RLX, -0.3, 0.3); K(P, HY, 0, -0.2);
      P[RY] += 1.3 * bump(p, 0.05, 0.6);
      K(P, RZP, 0.2, 0.55);
    }
  },
};

// ============ 狼人：双爪 ============
export const claw = {
  hunch: 0.32, swingL: 1.1, swingR: 1.1, cycle: 3.0, deathDir: -1,
  hold(P, A) {
    P[LAZ] += 0.12; P[RAZ] += 0.12;
    P[LEX] -= 0.25; P[REX] -= 0.25;
    P[LAX] -= 0.15; P[RAX] -= 0.15;
    P[LKX] += 0.12; P[RKX] += 0.12; P[LLX] -= 0.1; P[RLX] -= 0.1; P[HY] -= 0.03;
  },
  attack(P, p, idx) {
    T(p, 0.38, 0.52);
    const L = idx % 2 === 1;
    const ax = L ? LAX : RAX, ay = L ? LAY : RAY, az = L ? LAZ : RAZ, ex = L ? LEX : REX;
    const ox = L ? RAX : LAX;
    K(P, ax, -2.5, -0.35); K(P, az, 0.75, 0.0); K(P, ay, 0.35, -0.65); K(P, ex, -0.7, -0.15);
    K(P, ox, 0.2, 0.55);
    K(P, SY, L ? 0.5 : -0.5, L ? -0.45 : 0.45); K(P, SX, 0.25, 0.6);
    K(P, NX, -0.2, -0.3);
    KA(P, W0, 0.3, 0.8);
    step(P); K(P, RZP, -0.05, 0.35);
  },
  cast(P, p, slot) {
    if (slot === 0) {
      // 扑击：腾空双爪前扑
      T(p, 0.35, 0.6);
      K(P, LAX, -2.6, -1.1); K(P, RAX, -2.6, -1.1); K(P, LAZ, 0.6, 0.3); K(P, RAZ, 0.6, 0.3);
      K(P, LEX, -0.4, -0.2); K(P, REX, -0.4, -0.2);
      K(P, SX, 0.1, 0.7); K(P, NX, -0.3, -0.4);
      K(P, LKX, 0.9, 0.5); K(P, RKX, 1.1, 0.4); K(P, LLX, -0.6, -0.5); K(P, RLX, 0.2, 0.3);
      KA(P, W0, 0.6, 1);
      P[RY] += 0.9 * bump(p, 0.1, 0.62);
      K(P, RZP, 0, 0.4);
    } else if (slot === 1) {
      // 狼嚎：仰头长嚎，双臂后展
      const e = env(p, 0, 0.25, 0.8, 1);
      H(P, NX, -1.0, e); H(P, SX, -0.3, e);
      H(P, LAX, 0.55, e); H(P, RAX, 0.55, e); H(P, LAZ, 0.75, e); H(P, RAZ, 0.75, e);
      H(P, LEX, -0.6, e); H(P, REX, -0.6, e);
      H(P, W0, 1, e);
    } else {
      // 狂化：下蹲蓄力，再张臂怒吼
      T(p, 0.35, 0.5);
      K(P, LAX, -0.3, -0.9); K(P, RAX, -0.3, -0.9); K(P, LAZ, 0.2, 1.3); K(P, RAZ, 0.2, 1.3);
      K(P, LEX, -1.8, -1.4); K(P, REX, -1.8, -1.4);
      K(P, SX, 0.7, -0.35); K(P, NX, 0.2, -0.7);
      K(P, HY, -0.22, 0.02); K(P, LKX, 0.9, 0.1); K(P, RKX, 0.9, 0.1); K(P, LLX, -0.5, -0.05); K(P, RLX, -0.5, -0.05);
      KA(P, W0, 0.2, 1);
      P[RY] += 0.25 * bump(p, 0.38, 0.62);
    }
  },
};

// ============ 忍者：反手双短刃 ============
export const dual = {
  hunch: 0.12, swingL: 0.3, swingR: 0.3, lean: 0.42, cycle: 3.1,
  hold(P, A) {
    const r = A.runW;
    // 待机：双刃护在身前；跑步：双臂后甩（忍者跑）
    H(P, LAX, -0.3, 1 - r); H(P, RAX, -0.3, 1 - r);
    H(P, LEX, -1.25, 1 - r); H(P, REX, -1.25, 1 - r);
    H(P, LAY, -0.35, 1 - r); H(P, RAY, -0.35, 1 - r);
    H(P, LAX, 1.15, r); H(P, RAX, 1.15, r); H(P, LEX, -0.15, r); H(P, REX, -0.15, r);
    P[LAZ] += 0.12 * r; P[RAZ] += 0.12 * r;
    P[LKX] += 0.15 * (1 - r); P[RKX] += 0.15 * (1 - r); P[HY] -= 0.04 * (1 - r);
    P[LLX] -= 0.12 * (1 - r); P[RLX] += 0.05 * (1 - r);
  },
  attack(P, p, idx) {
    T(p, 0.3, 0.45);
    const L = idx % 2 === 1;
    const ax = L ? LAX : RAX, ay = L ? LAY : RAY, ex = L ? LEX : REX;
    const ox = L ? RAX : LAX, oex = L ? REX : LEX;
    K(P, ax, -1.25, -1.45); K(P, ay, -0.9, 1.05); K(P, ex, -1.5, -0.15);
    K(P, ox, 0.4, 0.7); K(P, oex, -1.1, -1.0);
    K(P, SY, L ? -0.45 : 0.45, L ? 0.5 : -0.5); K(P, SX, 0.25, 0.4);
    step(P); K(P, RZP, 0, 0.28);
  },
  cast(P, p, slot) {
    if (slot === 0) {
      // 影步：伏低前冲，双刃拖后
      T(p, 0.25, 0.45);
      K(P, LAX, 0.8, 1.3); K(P, RAX, 0.8, 1.3); K(P, LEX, -0.4, -0.1); K(P, REX, -0.4, -0.1);
      K(P, LAZ, 0.4, 0.3); K(P, RAZ, 0.4, 0.3);
      K(P, SX, 0.45, 0.75); K(P, NX, -0.4, -0.55);
      K(P, HY, -0.15, -0.22); K(P, LLX, -0.7, -0.9); K(P, RLX, 0.5, 0.7); K(P, LKX, 0.8, 0.6); K(P, RKX, 0.4, 0.3);
      K(P, RZP, -0.1, 0.5);
    } else if (slot === 1) {
      // 飞镖：右手横向甩出
      T(p, 0.35, 0.5);
      K(P, RAX, -1.3, -1.45); K(P, RAY, -1.1, 1.2); K(P, REX, -1.6, -0.1);
      K(P, SY, 0.55, -0.6); K(P, LAX, 0.3, 0.6);
      step(P, 0.7);
    } else {
      // 绝影杀：腾空旋身，再落地十字斩
      T(p, 0.55, 0.68);
      K(P, LAX, -2.6, -0.9); K(P, RAX, -2.6, -0.9); K(P, LAY, 0.8, -0.8); K(P, RAY, 0.8, -0.8);
      K(P, LEX, -0.4, -0.1); K(P, REX, -0.4, -0.1);
      K(P, SX, -0.15, 0.6); K(P, LKX, 1.1, 0.7); K(P, RKX, 1.1, 0.5); K(P, LLX, -0.7, -0.6); K(P, RLX, -0.7, 0.3);
      K(P, HY, 0, -0.2);
      P[RY] += 1.0 * bump(p, 0.05, 0.66);
      P[RRY] += spin(p, 0.08, 0.55);
      K(P, RZP, 0.1, 0.4);
    }
  },
};

// ============ 法杖：右手持杖（W3=杖身前倾角） ============
export const staff = {
  swingR: 0.35,
  hold(P, A) {
    const r = A.runW;
    P[RAX] += -0.15; P[REX] = lerp(-0.8, -0.7, r); P[RAZ] += 0.12;
    P[W3] = 0.08 + 0.3 * r;
  },
  // 让法杖始终保持竖直（只受 W3 前倾影响）
  post(P) { P[RWX] = P[W3] - P[RAX] - P[REX]; P[RWY] = 0; },
  attack(P, p, idx) {
    T(p, 0.4, 0.55);
    if (idx % 2 === 0) {
      K(P, RAX, -0.45, -1.4); K(P, REX, -1.5, -0.1); K(P, RAZ, 0.25, 0.05); K(P, RAY, 0.1, -0.2);
      K(P, W3, -0.2, 1.15);
      K(P, SX, -0.15, 0.28); K(P, SY, -0.3, 0.25);
      K(P, LAX, 0.2, 0.45); K(P, LAZ, 0.35, 0.45);
    } else {
      // 左掌推出
      K(P, LAX, -0.35, -1.5); K(P, LEX, -1.8, -0.1); K(P, LAY, -0.2, -0.15);
      K(P, RAX, -0.5, -0.65); K(P, W3, 0.05, 0.2);
      K(P, SY, 0.4, -0.35); K(P, SX, -0.1, 0.22);
    }
    step(P, 0.7);
  },
  cast(P, p, slot) {
    if (slot === 0) {
      T(p, 0.35, 0.5);
      K(P, RAX, -0.5, -1.5); K(P, REX, -1.5, -0.05); K(P, W3, -0.3, 1.35);
      K(P, LAX, -0.4, -1.3); K(P, LEX, -1.4, -0.15); K(P, LAY, 0, -0.3);
      K(P, SX, -0.2, 0.32); step(P, 0.8);
    } else if (slot === 1) {
      // 法杖高举
      T(p, 0.35, 0.55);
      K(P, RAX, -2.5, -2.95); K(P, REX, -0.3, -0.05); K(P, RAZ, 0.25, 0.1); K(P, W3, -0.1, 0.05);
      K(P, LAX, -0.7, -0.5); K(P, LAZ, 0.9, 1.1); K(P, LEX, -0.4, -0.2);
      K(P, SX, -0.15, -0.25); K(P, NX, -0.2, -0.35);
      P[RY] += 0.15 * bump(p, 0.3, 0.75);
    } else {
      // 大招：双臂高举蓄力，跃起后杖击地面
      T(p, 0.5, 0.63);
      K(P, RAX, -2.95, -1.2); K(P, REX, -0.2, -0.1); K(P, W3, 0, 1.0);
      K(P, LAX, -2.8, -0.9); K(P, LAZ, 0.6, 0.6); K(P, LEX, -0.2, -0.2);
      K(P, SX, -0.4, 0.45); K(P, NX, -0.45, 0.1);
      K(P, HY, 0.05, -0.2); K(P, LKX, 0.2, 0.7); K(P, RKX, 0.2, 0.5); K(P, LLX, 0, -0.5); K(P, RLX, 0, 0.2);
      P[RY] += 0.45 * bump(p, 0.1, 0.62);
    }
  },
  channel(P, A, t) {
    const tr = Math.sin(t * 29) * 0.03;
    P[RAX] = -2.3 + tr; P[REX] = -0.2; P[RAZ] = 0.3; P[W3] = 0.3;
    P[LAX] = -1.5 - tr; P[LEX] = -0.3; P[LAZ] = 0.6;
    P[SX] = -0.08; P[NX] = -0.2;
  },
};

// ============ 弓：左手持弓（W0=拉弦，W1=箭可见，W2=弓身倾角） ============
export const bow = {
  swingL: 0.35,
  hold(P, A) {
    P[LEX] = -0.3; P[LAX] += 0.05; P[W2] = 0.12 + 0.2 * A.runW; P[W0] = 0; P[W1] = 0;
  },
  post(P) { P[LWX] = P[W2] - P[LAX] - P[LEX]; P[LWY] = -P[LAY]; },
  attack(P, p) { drawShot(P, p, 0.55, 0); },
  cast(P, p, slot) {
    if (slot === 0) drawShot(P, p, 0.6, 0.1);
    else if (slot === 1) {
      // 风之步：轻跳、张臂
      T(p, 0.3, 0.5);
      K(P, LAZ, 0.6, 1.0); K(P, RAZ, 0.6, 1.0); K(P, RAX, 0.3, 0.5); K(P, LAX, 0.3, 0.4);
      K(P, SX, 0.2, -0.15); K(P, LKX, 0.6, 0.2); K(P, RKX, 0.6, 0.2); K(P, HY, -0.12, 0.05);
      P[RY] += 0.5 * bump(p, 0.3, 0.75);
    } else drawShot(P, p, 0.72, 0.3);
  },
};
// 拉弓射击：tw=松弦时刻，big=大招幅度（后仰、后撤）
function drawShot(P, p, tw, big) {
  T(p, tw, tw + 0.06);
  K(P, LAX, -1.55 + big * 0.3, -1.55 + big * 0.3); K(P, LEX, -0.05, -0.05); K(P, LAY, 0.45, 0.45); K(P, LAZ, 0.08, 0.08);
  K(P, RAX, -1.5 + big * 0.3, -1.3); K(P, REX, -2.15, -0.9); K(P, RAY, -0.75, -0.2); K(P, RAZ, 0.1, 0.35);
  K(P, SY, -0.4, -0.35); K(P, NY, 0.4, 0.35); K(P, SX, -big, -big * 0.6);
  K(P, W2, 0, 0);
  K(P, LLX, -0.3, -0.3); K(P, RLX, 0.25, 0.25); K(P, LKX, 0.15, 0.15); K(P, RKX, 0.1, 0.1);
  K(P, RZP, 0, -big * 0.5);
  const draw = p < tw ? smooth(p / (tw * 0.85)) : 0;
  P[W0] = draw * (1 + big * 0.4);
  P[W1] = p < tw + 0.01 ? 1 : 0;
}

// ============ 火枪：右手持枪（W0=后坐，W1=枪口火光，W2=枪口俯仰） ============
export const gun = {
  swingR: 0.15, swingL: 0.15,
  hold(P, A) {
    const r = A.runW;
    P[RAX] = 0.05 + P[RAX]; P[REX] = -1.25; P[RAZ] = 0.22;
    P[LAX] = -0.75 + P[LAX] * 0.3; P[LEX] = -0.85; P[LAY] = -0.8; P[LAZ] = 0.1;
    P[W2] = 0.35 + 0.15 * r;
  },
  post(P) { P[RWX] = P[W2] - P[RAX] - P[REX]; P[RWY] = -P[RAY] * 0.5; },
  attack(P, p) {
    T(p, 0.35, 0.45);
    K(P, RAX, -0.8, -1.05); K(P, REX, -0.75, -0.6); K(P, RAZ, 0.12, 0.12); K(P, W2, 0, -0.35);
    K(P, LAX, -1.25, -1.35); K(P, LEX, -0.45, -0.4); K(P, LAY, -0.55, -0.5);
    K(P, SX, 0.06, -0.12); K(P, NX, 0.05, 0); K(P, RZP, 0, -0.08);
    K(P, LLX, -0.2, -0.2); K(P, RLX, 0.2, 0.25);
    P[W0] = bump(p, 0.42, 0.62);
    P[W1] = bump(p, 0.42, 0.6);
  },
  cast(P, p, slot) {
    if (slot === 0) {
      // 战术翻滚：团身前滚一圈
      const e = env(p, 0, 0.1, 0.85, 1);
      P[PIV] = 0.6;
      P[RRX] += spin(p, 0.05, 0.85);
      H(P, LKX, 1.7, e); H(P, RKX, 1.7, e); H(P, LLX, -1.4, e); H(P, RLX, -1.4, e);
      H(P, SX, 0.7, e); H(P, NX, 0.4, e); H(P, HY, -0.25, e);
      H(P, LAX, -0.6, e); H(P, LEX, -1.5, e);
    } else if (slot === 1) {
      // 榴弹：左手过肩投掷
      T(p, 0.4, 0.55);
      K(P, LAX, 0.9, -2.0); K(P, LEX, -1.6, -0.2); K(P, LAZ, 0.4, 0.2); K(P, LAY, 0.3, 0);
      K(P, SY, -0.5, 0.45); K(P, SX, -0.15, 0.25);
      step(P, 0.8);
    } else {
      // 弹幕风暴：端枪扫射
      const e = env(p, 0, 0.12, 0.88, 1);
      const f = Math.abs(Math.sin(p * 55));
      H(P, RAX, -1.0 - f * 0.08, e); H(P, REX, -0.65, e); H(P, W2, -0.1 - f * 0.18, e);
      H(P, LAX, -1.3, e); H(P, LEX, -0.4, e); H(P, LAY, -0.5, e);
      H(P, SY, Math.sin(p * 7) * 0.45, e); H(P, SX, -0.08 - f * 0.05, e);
      H(P, LLX, -0.35, e); H(P, RLX, 0.35, e); H(P, LKX, 0.3, e); H(P, RKX, 0.2, e); H(P, HY, -0.08, e);
      P[W0] = f * e; P[W1] = (Math.sin(p * 55) > 0.3 ? 1 : 0) * e;
    }
  },
  channel(P, A, t) {
    const f = Math.abs(Math.sin(t * 25));
    P[RAX] = -1.0 - f * 0.06; P[REX] = -0.65; P[W2] = -0.1 - f * 0.15;
    P[LAX] = -1.3; P[LEX] = -0.4; P[LAY] = -0.5;
    P[W0] = f; P[W1] = Math.sin(t * 25) > 0.3 ? 1 : 0;
  },
};

// ============ 禅师：掌击（W2=钟震动，W3=金钟位置 0背上 1头顶 2砸地） ============
export const palm = {
  swingR: 0.5, swingL: 0.9, cycle: 2.9,
  hold(P, A) {
    const k = 1 - A.runW * 0.6;
    H(P, RAX, -0.55, k); H(P, REX, -1.5, k); H(P, RAY, -0.45, k);
    P[LKX] += 0.1; P[RKX] += 0.1; P[HY] -= 0.03; P[LLZ] += 0.06; P[RLZ] += 0.06;
  },
  attack(P, p, idx) {
    T(p, 0.38, 0.52);
    const L = idx % 2 === 1;
    const ax = L ? LAX : RAX, ex = L ? LEX : REX, ay = L ? LAY : RAY;
    K(P, ax, 0.45, -1.5); K(P, ex, -1.7, -0.05); K(P, ay, 0, -0.15);
    K(P, SY, L ? 0.4 : -0.4, L ? -0.4 : 0.4); K(P, SX, -0.05, 0.22);
    step(P, 1.1); K(P, RZP, 0, 0.2);
  },
  cast(P, p, slot) {
    if (slot === 0) {
      // 双掌推出
      T(p, 0.38, 0.52);
      K(P, LAX, 0.3, -1.45); K(P, RAX, 0.3, -1.45); K(P, LEX, -1.8, -0.05); K(P, REX, -1.8, -0.05);
      K(P, LAY, 0.1, -0.25); K(P, RAY, 0.1, -0.25);
      K(P, SX, -0.15, 0.3); step(P, 1.2); K(P, RZP, -0.05, 0.25);
    } else if (slot === 1) {
      // 撞钟：蹲身合掌再张开，金钟震荡
      T(p, 0.35, 0.5);
      K(P, LAX, -1.3, -0.6); K(P, RAX, -1.3, -0.6); K(P, LAY, -1.0, 0.4); K(P, RAY, -1.0, 0.4);
      K(P, LEX, -1.2, -0.2); K(P, REX, -1.2, -0.2); K(P, LAZ, 0.2, 1.1); K(P, RAZ, 0.2, 1.1);
      K(P, HY, -0.2, -0.05); K(P, LKX, 0.7, 0.2); K(P, RKX, 0.7, 0.2); K(P, LLX, -0.4, -0.1); K(P, RLX, -0.4, -0.1);
      K(P, SX, 0.3, -0.15);
      P[W2] = bump(p, 0.45, 1) * Math.sin(p * 40);
    } else {
      // 大招：举钟过顶，砸向地面
      T(p, 0.45, 0.6);
      K(P, LAX, -2.9, -1.0); K(P, RAX, -2.9, -1.0); K(P, LAZ, 0.3, 0.35); K(P, RAZ, 0.3, 0.35);
      K(P, LEX, -0.2, -0.1); K(P, REX, -0.2, -0.1);
      K(P, SX, -0.25, 0.55); K(P, NX, -0.4, 0.2); K(P, HY, 0.02, -0.22);
      K(P, LKX, 0.1, 0.8); K(P, RKX, 0.1, 0.6); K(P, LLX, 0, -0.55); K(P, RLX, 0, 0.2);
      K(P, W3, 1, 2);
      P[RY] += 0.3 * bump(p, 0.1, 0.55);
      P[W2] = bump(p, 0.6, 1) * Math.sin(p * 45) * 0.6;
    }
  },
  recall(P, A, t) {
    // 打坐：双腿盘起，合掌
    const b = Math.sin(t * 1.6);
    P[LAX] = -0.35; P[RAX] = -0.35; P[LAZ] = 0.3; P[RAZ] = 0.3; P[LAY] = -0.95; P[RAY] = -0.95;
    P[LEX] = -1.75; P[REX] = -1.75; P[SX] = 0; P[SY] = 0; P[NX] = 0.2;
    P[LLX] = -1.4; P[RLX] = -1.4; P[LKX] = 2.2; P[RKX] = 2.2; P[HY] = -0.55; P[LLZ] = 0.7; P[RLZ] = 0.7;
    P[RY] = 0.25 + b * 0.06;
  },
};

// ============ 岩石巨人：重拳 ============
export const smash = {
  hunch: 0.15, swingL: 0.8, swingR: 0.8, cycle: 3.2, lean: 0.15, legAmp: 0.6, deathDir: -1,
  hold(P) {
    P[LAX] -= 0.15; P[RAX] -= 0.15; P[LAZ] += 0.2; P[RAZ] += 0.2; P[LEX] -= 0.2; P[REX] -= 0.2;
    P[LLZ] += 0.06; P[RLZ] += 0.06;
  },
  attack(P, p, idx) {
    if (idx % 2 === 0) {
      T(p, 0.4, 0.55);
      K(P, RAX, -0.7, -1.5); K(P, RAY, 1.0, -0.45); K(P, REX, -1.4, -0.2); K(P, RAZ, 0.5, 0.1);
      K(P, SY, -0.55, 0.5); K(P, SX, 0.05, 0.3); K(P, LAX, -0.2, 0.3);
      step(P, 0.8); K(P, RZP, 0, 0.2);
    } else {
      T(p, 0.45, 0.58);
      K(P, LAX, -2.9, -1.05); K(P, RAX, -2.9, -1.05); K(P, LAZ, 0.3, 0.3); K(P, RAZ, 0.3, 0.3);
      K(P, LEX, -0.3, -0.1); K(P, REX, -0.3, -0.1);
      K(P, SX, -0.35, 0.6); K(P, HY, 0.02, -0.18); K(P, LKX, 0.1, 0.6); K(P, RKX, 0.1, 0.6);
      K(P, LLX, 0, -0.3); K(P, RLX, 0, -0.3);
    }
  },
  cast(P, p, slot) {
    if (slot === 0) {
      // 冲撞：肩膀前顶
      T(p, 0.3, 0.45);
      K(P, SX, 0.3, 0.65); K(P, SY, -0.3, -0.5); K(P, LAX, 0.3, 0.5); K(P, RAX, -0.6, -0.9); K(P, RAY, -0.7, -0.8);
      K(P, REX, -1.4, -1.4); K(P, LLX, -0.5, -0.8); K(P, RLX, 0.4, 0.6); K(P, LKX, 0.5, 0.4); K(P, HY, -0.1, -0.15);
      K(P, RZP, 0, 0.5);
    } else if (slot === 1) {
      // 震地：抬腿重踏，双臂张开
      T(p, 0.42, 0.55);
      K(P, RLX, -1.3, 0.1); K(P, RKX, 1.2, 0.3); K(P, LKX, 0.2, 0.6); K(P, HY, 0.05, -0.2);
      K(P, LAZ, 0.9, 1.2); K(P, RAZ, 0.9, 1.2); K(P, LAX, -0.6, 0); K(P, RAX, -0.6, 0); K(P, LEX, -1.2, -0.5); K(P, REX, -1.2, -0.5);
      K(P, SX, -0.25, 0.35); K(P, NX, -0.3, 0.1);
    } else {
      // 大招：跃起双拳砸地
      T(p, 0.5, 0.62);
      K(P, LAX, -3.0, -0.9); K(P, RAX, -3.0, -0.9); K(P, LAZ, 0.4, 0.5); K(P, RAZ, 0.4, 0.5);
      K(P, LEX, -0.4, -0.1); K(P, REX, -0.4, -0.1);
      K(P, SX, -0.4, 0.7); K(P, HY, 0.05, -0.25);
      K(P, LKX, 1.0, 0.9); K(P, RKX, 1.0, 0.9); K(P, LLX, -0.7, -0.6); K(P, RLX, -0.7, -0.6);
      P[RY] += 1.2 * bump(p, 0.08, 0.62);
    }
  },
};

export { castGeneric, SZ, LWY };
