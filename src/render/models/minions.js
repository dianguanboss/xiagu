// 小兵：近战兵、远程兵、超级兵（共用人形骨架，四肢各一个网格）和炮车。
import { G, add, grp, merged, matL, matS, matGlow, shade, teamColor, noShadow } from './materials.js';
import {
  buildRig, humanoidAnimator, T, K,
  RY, RZP, RRX, RRZ, HY, SX, SY, NX,
  LAX, LAY, LAZ, LEX, LWX, RAX, RAY, RAZ, REX, RWX, RWY, LKX, RKX, LLX, RLX, W1, W3,
} from './rig.js';
import { TAU, clamp01, smooth, easeIn, bump, approach, actP, getDt, EMPTY_STATE, lerp } from './anim.js';

const PI = Math.PI;

// 小兵四肢不弯折：肘、膝清零，身体起伏减小（四肢是整根网格）
function stiff(P) {
  P[LEX] = 0; P[REX] = 0; P[LKX] = 0; P[RKX] = 0;
  P[HY] *= 0.25;
}

// 共用：整根手臂（含手）、整根腿（含靴）
function limbs(R, armM, legM, at, lt, bootM) {
  const o = R.o, al = o.upper + o.lower, ll = o.hipH;
  const armG = merged(`m_arm${al},${at}`, [
    [G.cyl(at, at * 0.85, al, 6), [0, -al / 2 + 0.02, 0]],
    [G.ico(+(at * 1.15).toFixed(3), 0), [0, -al - 0.01, 0]],
  ]);
  const legG = merged(`m_leg${ll},${lt}`, [
    [G.cyl(lt, lt * 0.8, ll - 0.06, 6), [0, -(ll - 0.06) / 2, 0]],
    [G.box(+(lt * 1.6).toFixed(3), +(ll * 0.2).toFixed(3), +(lt * 2.6).toFixed(3)), [0, -ll * 0.9, lt * 0.5]],
  ]);
  add(R.shL, armG, armM); add(R.shR, armG, armM);
  add(R.lgL, legG, bootM || legM); add(R.lgR, legG, bootM || legM);
}

const SMALL = { hipH: 0.5, hipW: 0.1, thigh: 0.24, shin: 0.26, shY: 0.36, shW: 0.23, upper: 0.2, lower: 0.18, neckY: 0.42, comY: 0.66 };

// ============ 近战兵：头盔、盾、短剑 ============
function melee(team) {
  const tc = teamColor(team);
  const R = buildRig(SMALL);
  const teamM = matL(tc), teamD = matL(shade(tc, 0.62)), steel = matS('#b9c1cc', 0.6, 0.4), dark = matL('#3a3d46');
  add(R.spine, merged('m_chest', [
    [G.cyl(0.22, 0.17, 0.38, 8), [0, 0.2, 0], 0, [1, 1, 0.78]],
    [G.ico(0.11, 0), [0.24, 0.37, 0], [0, 0, -0.3], [1.1, 0.75, 1.05]],
    [G.ico(0.11, 0), [-0.24, 0.37, 0], [0, 0, 0.3], [1.1, 0.75, 1.05]],
  ]), teamM);
  add(R.hips, G.cyl(0.17, 0.23, 0.2, 8), dark, [0, -0.06, 0], null, [1, 1, 0.8]);
  // 全盔 + 冠脊 + 眼缝
  add(R.head, merged('m_helm', [
    [G.ico(0.22, 1), [0, 0, 0], 0, [1, 1.02, 1]],
    [G.tor(0.215, 0.03, 4, 12), [0, -0.04, 0], [PI / 2, 0, 0]],
    [G.box(0.05, 0.12, 0.42), [0, 0.2, -0.02], [0.1, 0, 0]],
  ]), matL(shade(tc, 1.15)), [0, 0.17, 0]);
  add(R.head, merged('m_eyes', [
    [G.box(0.07, 0.035, 0.04), [0.07, 0.0, 0.2], [0, 0.3, 0]],
    [G.box(0.07, 0.035, 0.04), [-0.07, 0.0, 0.2], [0, -0.3, 0]],
  ]), matGlow('#fff3b0'), [0, 0.17, 0]);
  limbs(R, steel, dark, 0.065, 0.08);
  // 盾（左臂外侧）
  add(R.shL, merged('m_shield', [
    [G.cyl(0.24, 0.24, 0.05, 6), [0, 0, 0], [PI / 2, 0, PI / 6]],
    [G.cone(0.08, 0.1, 6), [0, 0, 0.06], [PI / 2, 0, 0]],
  ]), teamD, [0.05, -0.28, 0.1], [0.5, 0.25, 0]);
  // 短剑（沿手 +Z）
  const sw = grp(R.haR, 0, -0.02, 0);
  sw.rotation.x = -0.35;
  add(sw, merged('m_sword', [
    [G.box(0.05, 0.05, 0.16), [0, 0, -0.04]],
    [G.box(0.22, 0.05, 0.05), [0, 0, 0.06]],
    [G.box(0.09, 0.025, 0.55), [0, 0, 0.34]],
    [G.cone(0.065, 0.12, 4), [0, 0, 0.67], [PI / 2, 0, 0], [0.7, 1, 0.3]],
  ]), steel);

  const style = {
    cycle: 2.3, lean: 0.15, legAmp: 0.65, armAmp: 0.55, swingL: 0.4, deathDir: 1,
    hold(P, A) {
      P[RAX] += -0.45; P[RAZ] += 0.05;
      P[LAX] += -0.75 + A.runW * 0.5; P[LAZ] += 0.15; P[LAY] = -0.25;
    },
    attack(P, p, idx) {
      if (idx % 2 === 0) {
        T(p, 0.42, 0.58);
        K(P, RAX, -2.7, -0.35); K(P, RAZ, 0.25, 0.05); K(P, SX, -0.15, 0.32); K(P, NX, -0.1, 0.1);
      } else {
        T(p, 0.4, 0.58);
        K(P, RAX, -1.3, -1.25); K(P, RAY, 1.1, -0.9); K(P, SY, -0.45, 0.45); K(P, SX, 0, 0.18);
      }
      K(P, LAX, -1.0, -1.1); K(P, RZP, 0, 0.12);
    },
    cast(P, p, slot) { this.attack(P, p, slot); },
    post: stiff,
  };
  return { R, style, height: 1.4 };
}

// ============ 远程兵：兜帽法师、法杖 ============
function ranged(team) {
  const tc = teamColor(team);
  const R = buildRig(SMALL);
  const teamM = matL(tc), teamD = matL(shade(tc, 0.55));
  add(R.spine, merged('r_chest', [
    [G.cyl(0.2, 0.18, 0.38, 8), [0, 0.2, 0], 0, [1, 1, 0.8]],
    [G.cyl(0.13, 0.27, 0.12, 8), [0, 0.36, 0], 0, [1, 1, 0.85]],
  ]), teamM);
  add(R.hips, G.cyl(0.19, 0.32, 0.46, 8), teamD, [0, -0.2, 0], null, [1, 1, 0.85]);
  // 兜帽（深色脸部 + 尖帽）
  add(R.head, merged('r_hood', [
    [G.ico(0.22, 1), [0, 0, 0]],
    [G.cone(0.2, 0.36, 6), [0, 0.16, -0.12], [-0.85, 0, 0]],
    [G.cyl(0.24, 0.25, 0.1, 8), [0, -0.14, -0.02]],
  ]), matL(shade(tc, 0.35)), [0, 0.17, 0]);
  add(R.head, merged('r_eyes', [
    [G.box(0.06, 0.06, 0.04), [0.07, 0.0, 0.2], [0, 0.3, 0]],
    [G.box(0.06, 0.06, 0.04), [-0.07, 0.0, 0.2], [0, -0.3, 0]],
  ]), matGlow(shade(tc, 1.6)), [0, 0.17, 0]);
  limbs(R, teamM, teamD, 0.06, 0.06, matL('#2f2a28'));
  // 法杖（沿手 +Y）+ 法球
  const st = grp(R.haR, 0, -0.02, 0);
  add(st, G.cyl(0.022, 0.026, 1.0, 5), matL('#6b4527'), [0, 0.18, 0]);
  const orb = add(st, G.ico(0.09, 0), matGlow(shade(tc, 1.5)), [0, 0.72, 0]);

  const style = {
    cycle: 2.3, lean: 0.12, legAmp: 0.6, armAmp: 0.5, swingR: 0.3,
    hold(P, A) { P[RAX] += -0.3; P[RAZ] += 0.12; P[W3] = 0.1 + 0.25 * A.runW; },
    attack(P, p) {
      T(p, 0.45, 0.6);
      K(P, RAX, -2.3, -1.45); K(P, W3, -0.25, 1.3); K(P, SX, -0.12, 0.2);
      K(P, LAX, -0.6, -1.3); K(P, LAZ, 0.5, 0.2);
      P[W1] = bump(p, 0.4, 0.85);
    },
    cast(P, p) { this.attack(P, p); },
    post(P) { stiff(P); P[RWX] = P[W3] - P[RAX]; P[RWY] = 0; },
    extra(R2, P, s, A, t) { orb.scale.setScalar(1 + Math.sin(t * 6) * 0.1 + P[W1] * 0.9); },
  };
  return { R, style, height: 1.45 };
}

// ============ 超级兵：重甲巨锤 ============
function superM(team) {
  const tc = teamColor(team);
  const R = buildRig({ hipH: 0.78, hipW: 0.17, thigh: 0.38, shin: 0.4, shY: 0.6, shW: 0.44, upper: 0.32, lower: 0.28, neckY: 0.66, comY: 1.0 });
  const teamM = matL(tc), steel = matS('#7c8593', 0.65, 0.4), dark = matL('#2c2f37');
  add(R.spine, merged('s_chest', [
    [G.cyl(0.38, 0.28, 0.62, 8), [0, 0.32, 0], 0, [1, 1, 0.75]],
    [G.ico(0.2, 0), [0.42, 0.62, 0], [0, 0, -0.3], [1.2, 0.8, 1.15]],
    [G.ico(0.2, 0), [-0.42, 0.62, 0], [0, 0, 0.3], [1.2, 0.8, 1.15]],
    [G.cone(0.07, 0.24, 4), [0.46, 0.8, 0], [0, 0, -0.35]],
    [G.cone(0.07, 0.24, 4), [-0.46, 0.8, 0], [0, 0, 0.35]],
  ]), teamM);
  const gem = add(R.spine, G.oct(0.09), matGlow(shade(tc, 1.6)), [0, 0.42, 0.27], null, [1, 1, 0.6]);
  add(R.hips, merged('s_skirt', [
    [G.cyl(0.3, 0.38, 0.32, 8), [0, -0.1, 0], 0, [1, 1, 0.8]],
    [G.cyl(0.32, 0.32, 0.1, 8), [0, 0.1, 0], 0, [1, 1, 0.8]],
  ]), dark);
  // 带角重盔
  add(R.head, merged('s_helm', [
    [G.ico(0.3, 1), [0, 0, 0]],
    [G.box(0.5, 0.08, 0.1), [0, -0.02, 0.27]],
    [G.cone(0.08, 0.36, 5), [0.3, 0.16, 0], [0, 0, -1.0]],
    [G.cone(0.08, 0.36, 5), [-0.3, 0.16, 0], [0, 0, 1.0]],
  ]), steel, [0, 0.24, 0]);
  add(R.head, merged('s_eyes', [
    [G.box(0.1, 0.04, 0.04), [0.1, 0.06, 0.28], [0, 0.3, 0]],
    [G.box(0.1, 0.04, 0.04), [-0.1, 0.06, 0.28], [0, -0.3, 0]],
  ]), matGlow('#ffb347'), [0, 0.24, 0]);
  limbs(R, steel, dark, 0.11, 0.13);
  // 巨锤（锤柄沿手 +Z）
  const hm = grp(R.haR, 0, -0.03, 0);
  hm.rotation.x = -0.9;
  add(hm, merged('s_hammer', [
    [G.cyl(0.04, 0.04, 1.2, 6), [0, 0, 0.35], [PI / 2, 0, 0]],
    [G.box(0.32, 0.32, 0.5), [0, 0, 0.95], [0, 0, PI / 4]],
    [G.box(0.36, 0.08, 0.08), [0, 0, 0.95]],
  ]), steel);

  const style = {
    cycle: 2.7, lean: 0.12, legAmp: 0.55, armAmp: 0.45, swingR: 0.25, deathDir: -1,
    hold(P) { P[RAX] += -0.3; P[RAZ] += 0.12; P[LAZ] += 0.1; },
    attack(P, p) {
      T(p, 0.48, 0.62);
      K(P, RAX, -2.9, -0.55); K(P, LAX, -2.7, -0.6); K(P, LAY, -0.5, -0.4); K(P, RAZ, 0.15, 0.05);
      K(P, SX, -0.32, 0.5); K(P, NX, -0.2, 0.05); K(P, RZP, -0.05, 0.15); K(P, LLX, -0.1, -0.35);
    },
    cast(P, p) { this.attack(P, p); },
    post: stiff,
    extra(R2, P, s, A, t) { gem.scale.setScalar(1 + Math.sin(t * 3) * 0.12); },
  };
  return { R, style, height: 2.2 };
}

// ============ 炮车 ============
function siege(team) {
  const tc = teamColor(team);
  const root = grp(null);
  const all = grp(root);
  const body = grp(all, 0, 0.62, 0);
  const wood = matL('#6e4a2c'), dark = matL('#3b2d22'), steel = matS('#5d6570', 0.7, 0.4);
  add(body, merged('sg_body', [
    [G.box(0.95, 0.34, 1.45), [0, 0, -0.05]],
    [G.box(0.8, 0.18, 0.5), [0, 0.25, -0.35]],
  ]), matL(tc));
  // 前挡板 + 弹药箱
  add(body, merged('sg_plate', [
    [G.box(1.05, 0.5, 0.08), [0, 0.18, 0.7], [-0.35, 0, 0]],
    [G.cone(0.06, 0.18, 4), [0.4, 0.42, 0.66], [-0.35, 0, 0]],
    [G.cone(0.06, 0.18, 4), [-0.4, 0.42, 0.66], [-0.35, 0, 0]],
  ]), steel);
  add(body, merged('sg_ammo', [
    [G.box(0.42, 0.22, 0.3), [0, 0.45, -0.38]],
    [G.ico(0.1, 0), [0.1, 0.6, -0.36]],
    [G.ico(0.1, 0), [-0.1, 0.6, -0.4]],
  ]), dark);
  // 轮子：前后两组，左右轮合并在一个网格里
  const WR = 0.32;
  const wheelG = merged('sg_wheel', [
    [G.cyl(WR, WR, 0.1, 10), [0.52, 0, 0], [0, 0, PI / 2]],
    [G.cyl(WR, WR, 0.1, 10), [-0.52, 0, 0], [0, 0, PI / 2]],
    [G.cyl(0.04, 0.04, 1.1, 5), [0, 0, 0], [0, 0, PI / 2]],
    [G.box(0.12, 0.5, 0.06), [0.52, 0, 0]], [G.box(0.12, 0.5, 0.06), [-0.52, 0, 0]],
  ]);
  const wf = grp(all, 0, WR, 0.45), wb = grp(all, 0, WR, -0.5);
  add(wf, wheelG, wood); add(wb, wheelG, wood);
  // 炮管（俯仰轴在车身上方）
  const turret = grp(body, 0, 0.35, 0.1);
  turret.rotation.x = -0.28;
  const barrel = grp(turret, 0, 0, 0);
  add(barrel, merged('sg_barrel', [
    [G.cyl(0.12, 0.16, 1.05, 8), [0, 0, 0.3], [PI / 2, 0, 0]],
    [G.ico(0.19, 0), [0, 0, -0.22]],
    [G.tor(0.14, 0.04, 4, 8), [0, 0, 0.82]],
  ]), steel);
  add(barrel, G.tor(0.17, 0.045, 4, 10), matGlow(shade(tc, 1.4)), [0, 0, 0.2]);
  const flash = add(barrel, merged('sg_flash', [
    [G.cone(0.2, 0.5, 6), [0, 0, 1.12], [PI / 2, 0, 0]],
    [G.ico(0.16, 0), [0, 0, 0.9]],
  ]), matGlow('#ffe08a', 0.9));
  noShadow(flash);
  // 队旗
  const flag = grp(body, -0.36, 0.2, -0.62);
  add(flag, merged('sg_flag', [
    [G.cyl(0.02, 0.02, 0.9, 4), [0, 0.45, 0]],
    [G.box(0.03, 0.26, 0.36), [0, 0.76, -0.18]],
  ]), matL(shade(tc, 1.2)));

  const A = { runW: 0, actW: 0, p: 0, stunW: 0, airW: 0, deadT: 0, wasDead: false, time: 0, roll: 0 };
  function update(s) {
    s = s || EMPTY_STATE;
    const dt = getDt(s);
    A.time += dt;
    const t = s.t !== undefined ? s.t : A.time;
    if (s.dead) {
      if (!A.wasDead) { A.wasDead = true; A.deadT = 0; }
      A.deadT += dt;
      const d = s.deadT !== undefined ? s.deadT : A.deadT;
      const k = easeIn(clamp01(d / 0.7));
      all.rotation.set(0, 0, 1.25 * k);
      all.position.set(-0.3 * k, 0.15 * k - 0.25 * smooth((d - 0.6) / 0.6), 0);
      turret.rotation.x = -0.28 + 0.5 * k;
      flash.visible = false;
      return;
    }
    if (A.wasDead) { A.wasDead = false; all.rotation.set(0, 0, 0); all.position.set(0, 0, 0); }
    const moving = !!s.moving;
    A.runW = approach(A.runW, moving ? 1 : 0, 8, dt);
    const spd = (s.moveSpeed > 0 ? s.moveSpeed : 5) * A.runW;
    A.roll += spd * dt / WR;
    if (A.roll > TAU) A.roll -= TAU;
    wf.rotation.x = A.roll; wb.rotation.x = A.roll;
    // 攻击：炮管后坐 + 火光
    let rec = 0, fl = 0;
    if (s.act === 'attack' || s.act === 'cast') {
      const p = actP(s);
      rec = p < 0.12 ? smooth(p / 0.12) : 1 - smooth((p - 0.12) / 0.6);
      fl = p < 0.3 ? 1 - p / 0.3 : 0;
    }
    barrel.position.z = -0.28 * rec;
    turret.rotation.x = -0.28 - 0.12 * rec;
    flash.visible = fl > 0.02;
    flash.scale.setScalar(0.5 + fl * 0.7);
    // 行进颠簸、眩晕摇晃、击飞
    A.stunW = approach(A.stunW, s.stunned ? 1 : 0, 8, dt);
    A.airW = approach(A.airW, s.airborne ? 1 : 0, 10, dt);
    body.position.y = 0.62 + Math.abs(Math.sin(t * 9)) * 0.03 * A.runW;
    body.rotation.x = 0.05 * rec + Math.sin(t * 9) * 0.015 * A.runW;
    all.rotation.set(Math.sin(t * 6) * 0.25 * A.airW, 0, Math.sin(t * 7) * (0.08 * A.stunW + 0.2 * A.airW));
    flag.rotation.x = 0.1 + A.runW * 0.25 + Math.sin(t * 5) * 0.06;
  }
  update({ t: 0 });
  return { root, height: 1.5, update };
}

// 人形小兵统一包装
function humanoid(build, team) {
  const { R, style, height } = build(team);
  const update = humanoidAnimator(R, style);
  update({ t: 0 });
  return { root: R.root, height, update };
}

export function buildMinion(mtype, team) {
  switch (mtype) {
    case 'ranged': return humanoid(ranged, team);
    case 'siege': return siege(team);
    case 'super': return humanoid(superM, team);
    default: return humanoid(melee, team);
  }
}
