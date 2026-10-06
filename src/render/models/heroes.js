// 10 个英雄的造型（Q 版低多边形）。按 heroDef.model 选择造型，颜色取 heroDef.colors。
import { G, add, grp, merged, matL, matS, matGlow, shade } from './materials.js';
import { buildRig, W0, W1, W2, W3, SX } from './rig.js';
import { slash, claw, dual, staff, bow, gun, palm, smash } from './styles.js';
import { lerp, clamp01 } from './anim.js';

const PI = Math.PI;
const EYE = '#1d1612';

// 眼睛：两个竖长小方块（按头半径缓存）
function eyesGeo(hr, w = 0.2, h = 0.3, gap = 0.34) {
  const b = G.box(+(hr * w).toFixed(3), +(hr * h).toFixed(3), 0.05);
  const x = +(hr * gap).toFixed(3), y = +(-hr * 0.06).toFixed(3), z = +(hr * 0.9).toFixed(3);
  return merged(`eyes${hr},${w},${h},${gap}`, [[b, [x, y, z], [0, 0.25, 0]], [b, [-x, y, z], [0, -0.25, 0]]]);
}

// 标准人形身体：m 为各部位材质（为空则不建），d 为尺寸
function stdBody(R, m, d = {}) {
  const o = R.o;
  const hr = d.headR || 0.34, cw = d.chestW || 0.3, ch = d.chestH || 0.52, cz = d.chestZ || 0.7;
  const at = d.armT || 0.085, lt = d.legT || 0.105;
  const B = { hr, hc: hr * 0.92 };
  if (m.pelvis) B.pelvis = add(R.hips, G.cyl(cw * 0.7, cw * 0.62, 0.26, 8), m.pelvis, [0, -0.04, 0], null, [1, 1, 0.78]);
  if (m.belt) B.belt = add(R.hips, G.cyl(cw * 0.78, cw * 0.76, 0.09, 8), m.belt, [0, 0.09, 0], null, [1, 1, 0.8]);
  B.chest = add(R.spine, G.cyl(cw, cw * 0.74, ch, 8), m.chest, [0, 0.06 + ch / 2, 0], null, [1, 1, cz]);
  if (m.head) B.head = add(R.head, G.ico(hr, 1), m.head, [0, B.hc, 0]);
  if (m.eye) B.eyes = add(R.head, eyesGeo(hr), m.eye, [0, B.hc, 0]);
  const ul = o.upper + 0.06, ll = o.lower;
  B.upL = add(R.shL, G.cyl(at, at * 0.85, ul, 6), m.upper, [0, -ul / 2 + 0.04, 0]);
  B.upR = add(R.shR, G.cyl(at, at * 0.85, ul, 6), m.upper, [0, -ul / 2 + 0.04, 0]);
  const fg = d.foreGeo || G.cyl(at * 0.88, at * 0.72, ll, 6);
  B.foL = add(R.elL, fg, m.fore, [0, -ll / 2, 0]);
  B.foR = add(R.elR, fg, m.fore, [0, -ll / 2, 0]);
  if (m.hand) {
    const hg = G.ico(+(at * (d.handK || 1.05)).toFixed(3), 0);
    B.hdL = add(R.haL, hg, m.hand, [0, -0.03, 0]);
    B.hdR = add(R.haR, hg, m.hand, [0, -0.03, 0]);
  }
  if (m.thigh) {
    const tg = G.cyl(lt, lt * 0.85, o.thigh + 0.04, 6);
    B.thL = add(R.lgL, tg, m.thigh, [0, -o.thigh / 2, 0]);
    B.thR = add(R.lgR, tg, m.thigh, [0, -o.thigh / 2, 0]);
  }
  if (m.shin) {
    const sl = o.shin - 0.12;
    const sg = G.cyl(lt * 0.82, lt * 0.68, sl, 6);
    B.snL = add(R.knL, sg, m.shin, [0, -sl / 2, 0]);
    B.snR = add(R.knR, sg, m.shin, [0, -sl / 2, 0]);
  }
  if (m.boot) {
    const bg = G.box(+(lt * 1.7).toFixed(3), 0.14, 0.3);
    B.btL = add(R.knL, bg, m.boot, [0, -o.shin + 0.07, 0.05]);
    B.btR = add(R.knR, bg, m.boot, [0, -o.shin + 0.07, 0.05]);
  }
  return B;
}

// 头发外壳：盖住头顶和后脑，不挡脸
const hairCap = (r = 0.36, y = 0.1, z = -0.07, sy = 0.85) => [G.ico(r, 1), [0, y, z], [0, 0, 0], [1, sy, 1]];

// ============ 烈锋：红甲剑客 ============
function swordsman(c) {
  const R = buildRig({});
  const red = matL(c.primary), redD = matL(shade(c.primary, 0.72));
  const silver = matS(c.secondary, 0.6, 0.35), gold = matS(c.accent, 0.7, 0.3, 0.1);
  const dark = matL('#3a2c26');
  const B = stdBody(R, {
    pelvis: dark, belt: gold, chest: red, head: matL(c.skin), eye: matL(EYE),
    upper: red, fore: silver, hand: silver, thigh: dark, shin: silver, boot: matL('#4a3428'),
  });
  const hc = B.hc;
  // 短刺发 + 刘海
  add(R.head, merged('hair_sword', [
    hairCap(),
    [G.cone(0.11, 0.36, 5), [0, 0.36, -0.08], [-0.55, 0, 0]],
    [G.cone(0.1, 0.34, 5), [0.17, 0.3, -0.1], [-0.75, 0, -0.55]],
    [G.cone(0.1, 0.34, 5), [-0.17, 0.3, -0.1], [-0.75, 0, 0.55]],
    [G.cone(0.11, 0.36, 5), [0, 0.18, -0.34], [-1.55, 0, 0]],
    [G.cone(0.1, 0.32, 5), [0.22, 0.12, -0.27], [-1.6, 0, -0.65]],
    [G.cone(0.1, 0.32, 5), [-0.22, 0.12, -0.27], [-1.6, 0, 0.65]],
    [G.cone(0.09, 0.24, 4), [0.13, 0.22, 0.24], [2.3, 0, -0.25]],
    [G.cone(0.09, 0.24, 4), [-0.04, 0.24, 0.26], [2.4, 0, 0.1]],
    [G.cone(0.08, 0.2, 4), [-0.19, 0.2, 0.22], [2.2, 0, 0.45]],
  ]), matL(c.hair), [0, hc, 0]);
  // 金色头带
  add(R.head, G.tor(0.345, 0.035, 4, 14), gold, [0, hc + 0.1, -0.01], [PI / 2 + 0.18, 0, 0]);
  // 肩甲 + 胸甲（银）
  add(R.spine, merged('sw_armor', [
    [G.ico(0.17, 0), [0.36, 0.57, 0], [0, 0, -0.25], [1.15, 0.75, 1.1]],
    [G.ico(0.17, 0), [-0.36, 0.57, 0], [0, 0, 0.25], [1.15, 0.75, 1.1]],
    [G.box(0.38, 0.22, 0.06), [0, 0.38, 0.19], [-0.08, 0, 0]],
  ]), silver);
  add(R.spine, G.oct(0.075), gold, [0, 0.4, 0.235], null, [1, 1, 0.5]);
  // 战裙
  add(R.hips, G.cyl(0.24, 0.31, 0.26, 8), redD, [0, -0.13, 0], null, [1, 1, 0.8]);
  // 披风
  const cape = grp(R.spine, 0, 0.55, -0.2);
  add(cape, merged('cape_sw', [[G.cyl(0.36, 0.55, 1.05, 4), [0, -0.52, 0], [0, PI / 4, 0]]]), redD, null, null, [1, 1, 0.08]);
  // 长剑（剑身沿手的 +Z）
  const sw = grp(R.haR, 0, -0.04, 0);
  add(sw, merged('sw_grip', [[G.cyl(0.032, 0.032, 0.26, 6), [0, 0, 0], [PI / 2, 0, 0]], [G.oct(0.055), [0, 0, -0.15]]]), dark);
  add(sw, G.box(0.38, 0.07, 0.08), gold, [0, 0, 0.14]);
  add(sw, merged('sw_blade', [
    [G.box(0.15, 0.035, 1.1), [0, 0, 0.73]],
    [G.cone(0.1, 0.24, 4), [0, 0, 1.4], [PI / 2, 0, 0], [0.75, 1, 0.18]],
  ]), matS('#eef3fa', 0.8, 0.25, 0.15));

  const style = Object.assign({}, slash, {
    extra(R2, P, s, A, t) {
      cape.rotation.x = Math.max(0.05, 0.12 + A.runW * 0.6 + Math.sin(t * 10) * 0.06 * A.runW + Math.sin(t * 1.7) * 0.03 - P[SX] * 0.8);
      cape.rotation.z = Math.sin(t * 1.3) * 0.03;
    },
  });
  return { R, style };
}

// ============ 狂狼：狼人战士 ============
function wolfman(c) {
  const R = buildRig({ shW: 0.38, hipW: 0.15, upper: 0.32, lower: 0.3, neckY: 0.62 });
  const fur = matL(c.primary), furD = matL(c.secondary), red = matL(c.accent);
  const skin = matL(c.skin), mane = matL(c.hair), clawM = matL('#efe6d2');
  const B = stdBody(R, {
    pelvis: furD, belt: red, chest: fur, head: fur,
    upper: fur, fore: fur, hand: skin, thigh: furD, shin: fur, boot: skin,
  }, { headR: 0.3, chestW: 0.34, chestH: 0.54, armT: 0.1, legT: 0.115, handK: 1.25 });
  const hc = B.hc;
  // 狼吻、鼻子、下颌、耳朵、眼睛
  add(R.head, G.cyl(0.1, 0.15, 0.3, 6), skin, [0, hc - 0.07, 0.3], [PI / 2, 0, 0]);
  add(R.head, G.box(0.11, 0.08, 0.08), matL('#16161a'), [0, hc - 0.01, 0.45]);
  const jaw = grp(R.head, 0, hc - 0.15, 0.14);
  add(jaw, G.box(0.17, 0.06, 0.28), skin, [0, 0, 0.13]);
  add(R.head, merged('wolf_ears', [
    [G.cone(0.1, 0.28, 4), [0.15, 0.27, -0.05], [-0.15, 0, -0.3]],
    [G.cone(0.1, 0.28, 4), [-0.15, 0.27, -0.05], [-0.15, 0, 0.3]],
  ]), fur, [0, hc, 0]);
  add(R.head, merged('wolf_eyes', [
    [G.box(0.08, 0.045, 0.05), [0.12, 0.07, 0.24], [0, 0.4, -0.25]],
    [G.box(0.08, 0.045, 0.05), [-0.12, 0.07, 0.24], [0, -0.4, 0.25]],
  ]), matGlow('#ff5148'), [0, hc, 0]);
  // 鬃毛
  add(R.spine, merged('wolf_mane', [
    [G.ico(0.3, 0), [0, 0.6, -0.06], [0, 0, 0], [1.3, 0.75, 1.05]],
    [G.cone(0.12, 0.38, 4), [0, 0.68, -0.28], [-1.9, 0, 0]],
    [G.cone(0.11, 0.34, 4), [0.2, 0.62, -0.24], [-1.9, 0, -0.5]],
    [G.cone(0.11, 0.34, 4), [-0.2, 0.62, -0.24], [-1.9, 0, 0.5]],
    [G.cone(0.1, 0.3, 4), [0, 0.5, -0.3], [-2.1, 0, 0]],
  ]), mane);
  // 左肩红色皮甲 + 尖刺
  add(R.spine, merged('wolf_pad', [
    [G.ico(0.18, 0), [0.4, 0.58, 0], [0, 0, -0.3], [1.1, 0.7, 1.1]],
    [G.cone(0.06, 0.22, 4), [0.46, 0.7, 0], [0, 0, -0.5]],
  ]), red);
  // 护腕
  const brG = G.cyl(0.105, 0.105, 0.11, 6);
  add(R.elL, brG, red, [0, -0.2, 0]);
  add(R.elR, brG, red, [0, -0.2, 0]);
  // 利爪
  const clawG = merged('wolf_claw', [
    [G.cone(0.03, 0.17, 4), [0.05, -0.12, 0.07], [2.4, 0, 0]],
    [G.cone(0.03, 0.19, 4), [0, -0.13, 0.08], [2.4, 0, 0]],
    [G.cone(0.03, 0.17, 4), [-0.05, -0.12, 0.07], [2.4, 0, 0]],
  ]);
  add(R.haL, clawG, clawM);
  add(R.haR, clawG, clawM);
  // 尾巴
  const tail = grp(R.hips, 0, 0.02, -0.2);
  add(tail, G.ico(0.14, 0), fur, [0, 0, -0.38], null, [1, 1, 3]);
  add(tail, G.ico(0.11, 0), mane, [0, 0, -0.8], null, [1, 1, 1.4]);

  const style = Object.assign({}, claw, {
    extra(R2, P, s, A, t) {
      jaw.rotation.x = 0.05 + clamp01(P[W0]) * 0.65;
      tail.rotation.x = lerp(-0.55, -0.1, A.runW) + Math.sin(t * 9) * 0.06 * A.runW;
      tail.rotation.y = Math.sin(t * (2.5 + A.runW * 6)) * (0.35 - A.runW * 0.2);
    },
  });
  return { R, style };
}

// ============ 影刃：紫黑忍者 ============
function ninja(c) {
  const R = buildRig({ shW: 0.31, hipW: 0.13, thigh: 0.43, shin: 0.47, hipH: 0.9 });
  const purple = matL(c.primary), black = matL(c.secondary);
  const acc = matL(c.accent, 0.35), accG = matGlow(c.accent);
  const B = stdBody(R, {
    pelvis: black, belt: acc, chest: purple, head: matL(c.skin), eye: accG,
    upper: purple, fore: black, hand: black, thigh: purple, shin: black, boot: black,
  }, { chestW: 0.27, chestH: 0.5, armT: 0.078, legT: 0.1 });
  const hc = B.hc;
  // 头巾 + 面罩
  add(R.head, merged('ninja_hood', [
    hairCap(0.365, 0.1, -0.06, 0.88),
    [G.cyl(0.345, 0.3, 0.17, 10), [0, -0.16, 0.01]],
    [G.cone(0.07, 0.2, 4), [0, 0.1, -0.4], [-1.9, 0, 0]],
  ]), black, [0, hc, 0]);
  // 额带（带两条短尾）
  add(R.head, merged('ninja_band', [
    [G.tor(0.36, 0.035, 4, 14), [0, 0.13, -0.02], [PI / 2 + 0.15, 0, 0]],
    [G.box(0.07, 0.02, 0.36), [0.08, 0.1, -0.5], [0.3, 0.25, 0]],
    [G.box(0.07, 0.02, 0.3), [-0.06, 0.08, -0.48], [0.5, -0.2, 0]],
  ]), acc, [0, hc, 0]);
  // 围巾：领圈 + 两条飘带
  add(R.spine, G.tor(0.21, 0.075, 5, 12), acc, [0, 0.6, 0], [PI / 2, 0, 0]);
  const rib1 = grp(R.spine, 0.07, 0.6, -0.2), rib2 = grp(R.spine, -0.07, 0.58, -0.2);
  const ribG = G.box(0.13, 0.025, 0.85);
  add(rib1, ribG, acc, [0, 0, -0.42]);
  add(rib2, ribG, acc, [0, 0, -0.38], null, [0.85, 1, 0.9]);
  // 肩甲
  add(R.spine, G.ico(0.15, 0), purple, [0.33, 0.58, 0], [0, 0, -0.3], [1.15, 0.7, 1.1]);
  // 反手短刃（沿前臂外侧，越过手肘）
  const bladeM = matS('#e6e0ff', 0.7, 0.3, 0.3);
  const bladeG = merged('ninja_blade', [
    [G.box(0.03, 0.56, 0.1), [0, 0.3, 0]],
    [G.cone(0.07, 0.18, 4), [0, 0.67, 0], [0, PI / 4, 0], [0.3, 1, 1]],
  ]);
  add(R.haL, bladeG, bladeM, [0.08, -0.04, 0.02]);
  add(R.haR, bladeG, bladeM, [-0.08, -0.04, 0.02]);
  const guardG = G.box(0.1, 0.05, 0.14);
  add(R.haL, guardG, acc, [0.06, -0.02, 0.02]);
  add(R.haR, guardG, acc, [-0.06, -0.02, 0.02]);

  const style = Object.assign({}, dual, {
    extra(R2, P, s, A, t) {
      const blow = A.runW;
      rib1.rotation.x = lerp(-1.25, -0.12, blow) + Math.sin(t * 13) * 0.12 * blow + Math.sin(t * 2) * 0.05 - P[SX];
      rib2.rotation.x = lerp(-1.35, -0.25, blow) + Math.sin(t * 13 + 1.5) * 0.14 * blow + Math.sin(t * 2 + 1) * 0.05 - P[SX];
      rib1.rotation.y = 0.15 + Math.sin(t * 7) * 0.08 * blow;
      rib2.rotation.y = -0.15 + Math.sin(t * 7 + 2) * 0.08 * blow;
    },
  });
  return { R, style };
}

// 长袍法系通用：袍摆随跑步摆动
function robeSway(robe, A, t) {
  robe.rotation.x = A.runW * 0.18 + Math.sin(t * 2) * 0.015;
  robe.rotation.z = Math.sin(A.ph) * 0.05 * A.runW;
}

// ============ 炎姬：火焰法师 ============
function firemage(c) {
  const R = buildRig({ shW: 0.31, hipW: 0.12 });
  const robeM = matL(c.primary), robe2 = matL(c.secondary), gold = matS(c.accent, 0.6, 0.35, 0.15);
  const skin = matL(c.skin);
  const B = stdBody(R, {
    pelvis: robeM, belt: gold, chest: robeM, head: skin, eye: matL(EYE),
    upper: robeM, fore: robe2, hand: skin, boot: matL(shade(c.primary, 0.45)),
  }, { chestW: 0.27, chestH: 0.48, armT: 0.075, foreGeo: G.cyl(0.07, 0.13, 0.28, 6) });
  const hc = B.hc;
  // 火焰长发（微自发光）
  add(R.head, merged('hair_fire', [
    hairCap(0.37, 0.1, -0.07, 0.88),
    [G.cone(0.14, 0.5, 5), [0, 0.38, -0.14], [-0.6, 0, 0]],
    [G.cone(0.12, 0.42, 5), [0.2, 0.3, -0.14], [-0.75, 0, -0.6]],
    [G.cone(0.12, 0.42, 5), [-0.2, 0.3, -0.14], [-0.75, 0, 0.6]],
    [G.cone(0.16, 0.6, 5), [0, 0.12, -0.42], [-1.25, 0, 0]],
    [G.cone(0.13, 0.5, 5), [0.22, 0.0, -0.34], [-1.5, 0, -0.5]],
    [G.cone(0.13, 0.5, 5), [-0.22, 0.0, -0.34], [-1.5, 0, 0.5]],
    [G.box(0.09, 0.4, 0.12), [0.3, -0.14, 0.06], [0, 0, 0.08]],
    [G.box(0.09, 0.4, 0.12), [-0.3, -0.14, 0.06], [0, 0, -0.08]],
    [G.cone(0.09, 0.24, 4), [0.1, 0.24, 0.25], [2.3, 0, -0.3]],
    [G.cone(0.09, 0.24, 4), [-0.1, 0.24, 0.25], [2.3, 0, 0.3]],
  ]), matL(c.hair, 0.35), [0, hc, 0]);
  add(R.head, G.oct(0.07), gold, [0.3, hc + 0.16, 0.06]);
  // 长袍下摆 + 金边 + 前襟
  const robe = grp(R.hips, 0, 0, 0);
  add(robe, G.cyl(0.22, 0.44, 0.78, 8), robeM, [0, -0.38, 0], null, [1, 1, 0.85]);
  add(robe, G.tor(0.43, 0.03, 4, 16), gold, [0, -0.76, 0], [PI / 2, 0, 0], [1, 0.85, 1]);
  add(robe, G.box(0.18, 0.7, 0.04), robe2, [0, -0.38, 0.27], [-0.27, 0, 0]);
  // 披肩
  add(R.spine, G.cyl(0.16, 0.38, 0.18, 8), robe2, [0, 0.52, 0], null, [1, 1, 0.82]);
  // 法杖：木杖 + 金托 + 火球
  const st = grp(R.haR, 0, -0.03, 0);
  add(st, G.cyl(0.03, 0.036, 2.0, 6), matL('#4a2616'), [0, 0.4, 0]);
  add(st, merged('fire_holder', [
    [G.tor(0.1, 0.025, 4, 8), [0, 1.42, 0], [PI / 2, 0, 0]],
    [G.cone(0.035, 0.3, 4), [0.09, 1.55, 0], [0, 0, -0.45]],
    [G.cone(0.035, 0.3, 4), [-0.045, 1.55, 0.078], [0.39, 0, 0.22]],
    [G.cone(0.035, 0.3, 4), [-0.045, 1.55, -0.078], [-0.39, 0, 0.22]],
  ]), gold);
  const fireCore = add(st, G.sph(0.12, 8, 6), matGlow('#fff2a8'), [0, 1.64, 0]);
  const fireOut = add(st, G.ico(0.21, 0), matGlow('#ff7a1f', 0.7), [0, 1.66, 0]);
  fireCore.castShadow = fireOut.castShadow = false;
  // 环绕火苗
  const wisp1 = add(R.rig, G.ico(0.07, 0), matGlow('#ffb347'), [0, 1.3, 0]);
  const wisp2 = add(R.rig, G.ico(0.06, 0), matGlow('#ff6a2a'), [0, 1.0, 0]);
  wisp1.castShadow = wisp2.castShadow = false;

  const style = Object.assign({}, staff, {
    extra(R2, P, s, A, t) {
      robeSway(robe, A, t);
      const pulse = 1 + Math.sin(t * 9) * 0.1 + (s.act === 'cast' ? 0.35 : 0);
      fireOut.scale.setScalar(pulse);
      fireOut.rotation.set(t * 1.7, t * 2.3, 0);
      fireCore.scale.setScalar(1 + Math.sin(t * 13) * 0.08);
      const a = t * 2.2;
      wisp1.position.set(Math.cos(a) * 0.75, 1.35 + Math.sin(t * 3) * 0.12, Math.sin(a) * 0.75);
      wisp2.position.set(Math.cos(a + 3.1) * 0.65, 1.0 + Math.sin(t * 3 + 2) * 0.12, Math.sin(a + 3.1) * 0.65);
    },
  });
  return { R, style };
}

// ============ 霜语：冰系法师 ============
function icemage(c) {
  const R = buildRig({ shW: 0.31, hipW: 0.12 });
  const blue = matL(c.primary), white = matL(c.secondary), iceM = matL(c.accent, 0.55);
  const skin = matL(c.skin);
  const B = stdBody(R, {
    pelvis: blue, belt: iceM, chest: blue, head: skin, eye: matL('#20324a'),
    upper: white, fore: blue, hand: skin, boot: white,
  }, { chestW: 0.27, chestH: 0.48, armT: 0.075, foreGeo: G.cyl(0.07, 0.12, 0.28, 6) });
  const hc = B.hc;
  // 白色长直发
  add(R.head, merged('hair_ice', [
    hairCap(0.37, 0.09, -0.07, 0.9),
    [G.box(0.58, 0.8, 0.14), [0, -0.3, -0.25], [0.12, 0, 0]],
    [G.box(0.1, 0.5, 0.12), [0.31, -0.2, 0.05], [0, 0, 0.06]],
    [G.box(0.1, 0.5, 0.12), [-0.31, -0.2, 0.05], [0, 0, -0.06]],
    [G.box(0.5, 0.1, 0.12), [0, 0.22, 0.24], [0.5, 0, 0]],
  ]), matL(c.hair), [0, hc, 0]);
  // 冰晶头饰
  add(R.head, merged('ice_crown', [
    [G.oct(0.07), [0, 0.4, 0.1], [0, 0, 0], [0.7, 2.4, 0.7]],
    [G.oct(0.06), [0.14, 0.36, 0.07], [0, 0, -0.35], [0.7, 2.0, 0.7]],
    [G.oct(0.06), [-0.14, 0.36, 0.07], [0, 0, 0.35], [0.7, 2.0, 0.7]],
    [G.oct(0.05), [0.26, 0.28, 0.02], [0, 0, -0.7], [0.7, 1.8, 0.7]],
    [G.oct(0.05), [-0.26, 0.28, 0.02], [0, 0, 0.7], [0.7, 1.8, 0.7]],
  ]), iceM, [0, hc, 0]);
  // 双层长袍 + 冰晶边
  const robe = grp(R.hips, 0, 0, 0);
  add(robe, G.cyl(0.2, 0.4, 0.8, 8), white, [0, -0.4, 0], null, [1, 1, 0.85]);
  add(robe, G.cyl(0.24, 0.45, 0.6, 8), blue, [0, -0.3, -0.02], null, [1, 1, 0.82]);
  add(robe, G.tor(0.44, 0.03, 4, 16), iceM, [0, -0.6, -0.02], [PI / 2, 0, 0], [1, 0.82, 1]);
  // 毛领 + 肩部冰刺
  add(R.spine, G.tor(0.24, 0.09, 6, 12), white, [0, 0.58, 0], [PI / 2, 0, 0]);
  add(R.spine, merged('ice_shoulder', [
    [G.oct(0.07), [0.36, 0.64, 0], [0, 0, -0.5], [0.7, 2, 0.7]],
    [G.oct(0.06), [0.3, 0.66, -0.1], [0.3, 0, -0.2], [0.7, 1.8, 0.7]],
    [G.oct(0.07), [-0.36, 0.64, 0], [0, 0, 0.5], [0.7, 2, 0.7]],
    [G.oct(0.06), [-0.3, 0.66, -0.1], [0.3, 0, 0.2], [0.7, 1.8, 0.7]],
  ]), iceM);
  // 冰晶法杖 + 环绕碎晶
  const st = grp(R.haR, 0, -0.03, 0);
  add(st, G.cyl(0.028, 0.034, 2.0, 6), matS('#cfe3f5', 0.6, 0.3), [0, 0.4, 0]);
  add(st, merged('ice_holder', [
    [G.cone(0.03, 0.28, 4), [0.08, 1.5, 0], [0, 0, -0.35]],
    [G.cone(0.03, 0.28, 4), [-0.08, 1.5, 0], [0, 0, 0.35]],
    [G.cone(0.03, 0.22, 4), [0, 1.48, 0.08], [0.35, 0, 0]],
  ]), matS('#cfe3f5', 0.6, 0.3));
  const crys = add(st, G.oct(0.18), matGlow(c.accent, 0.85), [0, 1.72, 0], null, [0.7, 1.7, 0.7]);
  crys.castShadow = false;
  const orbit = grp(st, 0, 1.72, 0);
  const shardG = G.oct(0.06);
  const sh1 = add(orbit, shardG, matGlow('#e8fbff'), [0.3, 0, 0], null, [0.6, 1.6, 0.6]);
  const sh2 = add(orbit, shardG, matGlow('#e8fbff'), [-0.3, 0.06, 0], null, [0.6, 1.6, 0.6]);
  sh1.castShadow = sh2.castShadow = false;

  const style = Object.assign({}, staff, {
    extra(R2, P, s, A, t) {
      robeSway(robe, A, t);
      crys.rotation.y = t * 1.2;
      orbit.rotation.y = t * (s.act === 'cast' ? 7 : 2.2);
      orbit.position.y = 1.72 + Math.sin(t * 2.5) * 0.05;
    },
  });
  return { R, style };
}

// ============ 逐风：绿色游侠 ============
function archer(c) {
  const R = buildRig({ shW: 0.32 });
  const green = matL(c.primary), greenD = matL(shade(c.primary, 0.72)), tan = matL(c.secondary);
  const leather = matL('#6b4a2b'), lime = matL(c.accent, 0.4), skin = matL(c.skin);
  const B = stdBody(R, {
    pelvis: tan, belt: leather, chest: green, head: skin, eye: matL(EYE),
    upper: green, fore: leather, hand: skin, thigh: tan, shin: leather, boot: leather,
  }, { chestW: 0.29 });
  const hc = B.hc;
  // 兜帽 + 刘海
  add(R.head, merged('archer_hood', [
    hairCap(0.38, 0.08, -0.07, 0.92),
    [G.cone(0.17, 0.34, 5), [0, 0.06, -0.42], [-2.0, 0, 0]],
    [G.cyl(0.3, 0.34, 0.14, 8), [0, -0.27, -0.03]],
  ]), green, [0, hc, 0]);
  add(R.head, merged('archer_bang', [
    [G.cone(0.1, 0.26, 4), [0.12, 0.2, 0.25], [2.3, 0, -0.3]],
    [G.cone(0.1, 0.26, 4), [-0.06, 0.22, 0.27], [2.4, 0, 0.15]],
    [G.box(0.09, 0.3, 0.1), [0.29, -0.08, 0.1], [0, 0, 0.1]],
    [G.box(0.09, 0.3, 0.1), [-0.29, -0.08, 0.1], [0, 0, -0.1]],
  ]), matL(c.hair), [0, hc, 0]);
  // 短衣摆、右肩皮甲
  add(R.hips, G.cyl(0.23, 0.3, 0.28, 8), greenD, [0, -0.14, 0], null, [1, 1, 0.8]);
  add(R.spine, G.ico(0.15, 0), leather, [-0.34, 0.58, 0], [0, 0, 0.3], [1.15, 0.7, 1.1]);
  // 背后箭袋
  const qv = grp(R.spine, 0.1, 0.36, -0.25);
  qv.rotation.set(0.15, 0, -0.4);
  add(qv, G.cyl(0.09, 0.08, 0.62, 7), leather);
  add(qv, merged('quiver_arrows', [
    [G.cone(0.05, 0.16, 3), [0.03, 0.38, 0.02], [0, 0, 0.1]],
    [G.cone(0.05, 0.16, 3), [-0.03, 0.4, -0.02], [0, 1, -0.1]],
    [G.cone(0.05, 0.16, 3), [0.0, 0.36, -0.05], [0, 2, 0.05]],
  ]), lime);
  // 长弓（左手），弓弦两段 + 箭
  const bw = grp(R.haL, 0, -0.04, 0.02);
  const BR = 0.85, ARC = 2.0, tipY = BR * Math.sin(ARC / 2), tipZ = BR * Math.cos(ARC / 2) - BR;
  add(bw, merged('bow', [
    [G.tor(BR, 0.035, 4, 14, ARC), [0, 0, -BR], [0, -PI / 2, 0, 'YXZ'], 1],
    [G.box(0.07, 0.2, 0.08), [0, 0, 0.0]],
  ]), matL('#7a4a26'));
  const strM = matGlow('#f5f0dc');
  const sTop = grp(bw, 0, tipY, tipZ), sBot = grp(bw, 0, -tipY, tipZ);
  const strG = G.box(0.014, tipY, 0.014);
  add(sTop, strG, strM, [0, -tipY / 2, 0]).castShadow = false;
  add(sBot, strG, strM, [0, tipY / 2, 0]).castShadow = false;
  const arrow = grp(bw, 0, 0, tipZ);
  add(arrow, merged('arrow', [
    [G.cyl(0.015, 0.015, 1.0, 4), [0, 0, 0.5], [PI / 2, 0, 0]],
    [G.cone(0.04, 0.14, 4), [0, 0, 1.05], [PI / 2, 0, 0]],
    [G.box(0.01, 0.07, 0.14), [0, 0, 0.08]],
  ]), lime);

  const style = Object.assign({}, bow, {
    extra(R2, P, s, A, t) {
      const pull = clamp01(P[W0]) * 0.45;
      const ang = Math.atan2(pull, tipY);
      const len = Math.sqrt(tipY * tipY + pull * pull) / tipY;
      sTop.rotation.x = ang; sTop.scale.y = len;
      sBot.rotation.x = -ang; sBot.scale.y = len;
      arrow.position.z = tipZ - pull;
      arrow.visible = P[W1] > 0.5;
    },
  });
  return { R, style };
}

// ============ 雷火：机巧枪匠 ============
function gunner(c) {
  const R = buildRig({});
  const coat = matL(c.primary), brown = matL(c.secondary), brass = matS(c.accent, 0.7, 0.35, 0.1);
  const metal = matS('#3d4148', 0.7, 0.4), strap = matL('#2b211b'), skin = matL(c.skin);
  const B = stdBody(R, {
    pelvis: brown, belt: strap, chest: coat, head: skin, eye: matL(EYE),
    upper: coat, fore: brown, hand: brown, thigh: brown, shin: strap, boot: strap,
  });
  const hc = B.hc;
  // 乱发
  add(R.head, merged('hair_gun', [
    hairCap(0.365, 0.1, -0.07, 0.85),
    [G.cone(0.12, 0.3, 5), [0.08, 0.36, -0.02], [-0.3, 0, -0.4]],
    [G.cone(0.12, 0.3, 5), [-0.12, 0.34, -0.06], [-0.5, 0, 0.5]],
    [G.cone(0.11, 0.3, 5), [0.05, 0.25, -0.3], [-1.3, 0, -0.2]],
    [G.cone(0.1, 0.26, 4), [0.22, 0.2, 0.18], [1.9, 0, -0.6]],
    [G.cone(0.1, 0.26, 4), [-0.2, 0.22, 0.2], [2.0, 0, 0.5]],
  ]), matL(c.hair), [0, hc, 0]);
  // 护目镜：镜片（发光）+ 带子
  add(R.head, merged('goggle_lens', [
    [G.cyl(0.085, 0.085, 0.07, 8), [0.12, 0.2, 0.27], [PI / 2 - 0.55, 0, 0]],
    [G.cyl(0.085, 0.085, 0.07, 8), [-0.12, 0.2, 0.27], [PI / 2 - 0.55, 0, 0]],
  ]), matGlow('#ffe27a'), [0, hc, 0]);
  add(R.head, merged('goggle_strap', [
    [G.tor(0.355, 0.03, 4, 14), [0, 0.15, -0.02], [PI / 2 + 0.35, 0, 0]],
    [G.cyl(0.1, 0.1, 0.05, 8), [0.12, 0.2, 0.25], [PI / 2 - 0.55, 0, 0]],
    [G.cyl(0.1, 0.1, 0.05, 8), [-0.12, 0.2, 0.25], [PI / 2 - 0.55, 0, 0]],
  ]), brass, [0, hc, 0]);
  // 风衣后摆
  const tails = grp(R.hips, 0, 0.02, -0.14);
  add(tails, merged('coat_tail', [
    [G.box(0.2, 0.5, 0.04), [0.11, -0.25, 0], [0, 0, -0.06]],
    [G.box(0.2, 0.5, 0.04), [-0.11, -0.25, 0], [0, 0, 0.06]],
  ]), coat);
  // 右肩齿轮肩甲
  add(R.spine, merged('gun_pad', [
    [G.ico(0.17, 0), [-0.36, 0.57, 0], [0, 0, 0.25], [1.15, 0.7, 1.1]],
    [G.tor(0.11, 0.035, 4, 8), [-0.47, 0.62, 0], [0, PI / 2, 0]],
  ]), brass);
  // 背包 + 齿轮
  add(R.spine, G.box(0.36, 0.36, 0.2), brown, [0, 0.36, -0.28]);
  const gear = grp(R.spine, 0, 0.42, -0.4);
  add(gear, merged('gear', [
    [G.tor(0.12, 0.04, 4, 8), [0, 0, 0]],
    [G.box(0.04, 0.3, 0.04), [0, 0, 0]], [G.box(0.3, 0.04, 0.04), [0, 0, 0]],
  ]), brass);
  // 双管大火枪（枪口沿手的 +Z）
  const gn = grp(R.haR, 0, -0.03, 0.02);
  add(gn, merged('gun_stock', [
    [G.box(0.1, 0.16, 0.42), [0, -0.05, -0.2], [0.25, 0, 0]],
    [G.box(0.07, 0.14, 0.12), [0, -0.08, 0.02], [0.4, 0, 0]],
  ]), matL('#6a4024'));
  add(gn, merged('gun_body', [
    [G.box(0.17, 0.15, 0.3), [0, 0.04, 0.16]],
    [G.tor(0.09, 0.025, 4, 8), [0, 0.06, 0.55]],
    [G.tor(0.1, 0.03, 4, 8), [0, 0.06, 0.92]],
  ]), brass);
  add(gn, merged('gun_barrel', [
    [G.cyl(0.045, 0.05, 0.72, 7), [0.045, 0.06, 0.62], [PI / 2, 0, 0]],
    [G.cyl(0.045, 0.05, 0.72, 7), [-0.045, 0.06, 0.62], [PI / 2, 0, 0]],
  ]), metal);
  const flash = add(gn, merged('gun_flash', [
    [G.cone(0.16, 0.42, 6), [0, 0.06, 1.18], [PI / 2, 0, 0]],
    [G.oct(0.13), [0, 0.06, 1.0]],
  ]), matGlow('#fff0a0', 0.9));
  flash.castShadow = false;

  const style = Object.assign({}, gun, {
    extra(R2, P, s, A, t) {
      const f = clamp01(P[W1]);
      flash.visible = f > 0.05;
      flash.scale.set(f, f, 0.5 + f * 0.8);
      gn.position.z = 0.02 - clamp01(P[W0]) * 0.12;
      gear.rotation.z = t * (1.5 + A.runW * 3);
      tails.rotation.x = 0.08 + A.runW * 0.45 + Math.sin(t * 11) * 0.05 * A.runW - P[SX] * 0.6;
    },
  });
  return { R, style };
}

// ============ 灵泉：治疗辅助 ============
function healer(c) {
  const R = buildRig({ shW: 0.3, hipW: 0.12 });
  const teal = matL(c.primary), white = matL(c.secondary), mint = matL(c.accent, 0.45);
  const skin = matL(c.skin), silver = matS('#e3eef0', 0.5, 0.35);
  const B = stdBody(R, {
    pelvis: white, belt: mint, chest: white, head: skin, eye: matL('#1d3a35'),
    upper: teal, fore: white, hand: skin, boot: teal,
  }, { chestW: 0.26, chestH: 0.48, armT: 0.072, foreGeo: G.cyl(0.065, 0.12, 0.28, 6) });
  const hc = B.hc;
  // 长发 + 双发髻
  add(R.head, merged('hair_heal', [
    hairCap(0.37, 0.09, -0.07, 0.9),
    [G.ico(0.15, 0), [0.24, 0.3, -0.12]],
    [G.ico(0.15, 0), [-0.24, 0.3, -0.12]],
    [G.box(0.52, 0.85, 0.13), [0, -0.33, -0.26], [0.14, 0, 0]],
    [G.box(0.09, 0.45, 0.11), [0.31, -0.18, 0.06], [0, 0, 0.05]],
    [G.box(0.09, 0.45, 0.11), [-0.31, -0.18, 0.06], [0, 0, -0.05]],
    [G.box(0.46, 0.09, 0.12), [0, 0.22, 0.24], [0.5, 0, 0]],
  ]), matL(c.hair), [0, hc, 0]);
  // 花形发饰
  add(R.head, merged('heal_flower', [
    [G.oct(0.06), [0.06, 0, 0], [0, 0, 0], [1.4, 0.5, 0.8]],
    [G.oct(0.06), [-0.06, 0, 0], [0, 0, 0], [1.4, 0.5, 0.8]],
    [G.oct(0.06), [0, 0.06, 0], [0, 0, 0], [0.5, 1.4, 0.8]],
    [G.oct(0.06), [0, -0.06, 0], [0, 0, 0], [0.5, 1.4, 0.8]],
  ]), mint, [0.3, hc + 0.18, 0.1], [0, 0.6, 0]);
  // 双层裙
  const robe = grp(R.hips, 0, 0, 0);
  add(robe, G.cyl(0.21, 0.42, 0.8, 8), white, [0, -0.4, 0], null, [1, 1, 0.85]);
  add(robe, G.cyl(0.23, 0.4, 0.5, 8), teal, [0, -0.25, -0.01], null, [1, 1, 0.84]);
  // 披肩
  add(R.spine, G.cyl(0.15, 0.35, 0.15, 8), teal, [0, 0.52, 0], null, [1, 1, 0.82]);
  // 飘带：两条，每条两节
  const ribG = G.box(0.12, 0.6, 0.025);
  const rib = [];
  for (const sx of [1, -1]) {
    const a = grp(R.spine, sx * 0.2, 0.5, -0.18);
    add(a, ribG, mint, [0, -0.3, 0]);
    const b = grp(a, 0, -0.6, 0);
    add(b, ribG, mint, [0, -0.28, 0], null, [0.9, 0.95, 1]);
    rib.push(a, b);
  }
  // 水滴法杖
  const st = grp(R.haR, 0, -0.03, 0);
  add(st, G.cyl(0.026, 0.032, 1.95, 6), silver, [0, 0.38, 0]);
  add(st, G.tor(0.19, 0.03, 4, 12, PI * 1.4), silver, [0, 1.52, 0], [0, 0, -PI * 0.2]);
  const drop = add(st, merged('drop', [
    [G.sph(0.15, 8, 6), [0, 0, 0]],
    [G.cone(0.13, 0.24, 8), [0, 0.18, 0]],
  ]), matGlow(c.accent, 0.8), [0, 1.55, 0]);
  const core = add(st, G.sph(0.06, 6, 4), matGlow('#ffffff'), [0, 1.55, 0]);
  drop.castShadow = core.castShadow = false;
  const dropG = merged('drop_s', [[G.sph(0.05, 6, 4), [0, 0, 0]], [G.cone(0.043, 0.08, 6), [0, 0.06, 0]]]);
  const d1 = add(R.rig, dropG, matGlow(c.accent, 0.85), [0, 1.2, 0]);
  const d2 = add(R.rig, dropG, matGlow(c.accent, 0.85), [0, 1.2, 0]);
  d1.castShadow = d2.castShadow = false;

  const style = Object.assign({}, staff, {
    extra(R2, P, s, A, t) {
      robeSway(robe, A, t);
      for (let i = 0; i < 2; i++) {
        const ph = i * 1.7;
        rib[i * 2].rotation.x = 0.25 + A.runW * 0.95 + Math.sin(t * 3 + ph) * 0.12 - P[SX];
        rib[i * 2].rotation.z = (i ? -1 : 1) * (0.12 + Math.sin(t * 2 + ph) * 0.05);
        rib[i * 2 + 1].rotation.x = 0.15 + A.runW * 0.3 + Math.sin(t * 3 + ph + 1.2) * 0.25;
      }
      drop.position.y = 1.55 + Math.sin(t * 2.4) * 0.04;
      core.position.y = drop.position.y;
      core.scale.setScalar(1 + Math.sin(t * 5) * 0.2);
      const a = t * 1.6;
      d1.position.set(Math.cos(a) * 0.7, 1.25 + Math.sin(t * 2) * 0.15, Math.sin(a) * 0.7);
      d2.position.set(Math.cos(a + PI) * 0.7, 1.05 + Math.sin(t * 2 + 2) * 0.15, Math.sin(a + PI) * 0.7);
    },
  });
  return { R, style };
}

// ============ 镇岳：金钟禅师 ============
function monk(c) {
  const R = buildRig({ shW: 0.4, hipW: 0.16, upper: 0.32, lower: 0.3, hipH: 0.86, thigh: 0.4, shin: 0.46, shY: 0.58, neckY: 0.68 });
  const orange = matL(c.primary), red = matL(c.secondary), gold = matS(c.accent, 0.75, 0.3, 0.15);
  const skin = matL(c.skin);
  const B = stdBody(R, {
    pelvis: orange, belt: red, chest: orange, head: skin,
    upper: orange, fore: skin, hand: skin, thigh: orange, shin: red, boot: matL('#3b2418'),
  }, { headR: 0.33, chestW: 0.36, chestH: 0.54, armT: 0.1, legT: 0.13, handK: 1.2 });
  const hc = B.hc;
  // 闭目 + 头顶戒疤
  const dots = [];
  for (let i = 0; i < 6; i++) dots.push([G.box(0.03, 0.03, 0.03), [(i % 3 - 1) * 0.07, 0.31, 0.05 - (i > 2 ? 0.08 : 0)]]);
  add(R.head, merged('monk_face', [
    [G.box(0.1, 0.022, 0.05), [0.11, -0.03, 0.3], [0, 0.3, -0.12]],
    [G.box(0.1, 0.022, 0.05), [-0.11, -0.03, 0.3], [0, -0.3, 0.12]],
    ...dots,
  ]), matL('#4a2a1a'), [0, hc, 0]);
  // 大耳垂
  add(R.head, merged('monk_ears', [
    [G.ico(0.08, 0), [0.33, -0.04, 0], [0, 0, 0], [0.6, 1.5, 0.9]],
    [G.ico(0.08, 0), [-0.33, -0.04, 0], [0, 0, 0], [0.6, 1.5, 0.9]],
  ]), skin, [0, hc, 0]);
  // 袈裟斜带、下摆
  add(R.spine, G.box(0.17, 0.78, 0.5), red, [0, 0.34, 0], [0, 0, 0.62]);
  add(R.hips, G.cyl(0.27, 0.36, 0.42, 8), orange, [0, -0.2, 0], null, [1, 1, 0.82]);
  // 大佛珠
  const beads = [];
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * PI * 2;
    beads.push([G.ico(i === 0 ? 0.1 : 0.075, 0), [Math.sin(a) * 0.36, 0, Math.cos(a) * 0.3]]);
  }
  add(R.spine, merged('monk_beads', beads), matL('#5a2a18'), [0, 0.58, 0.02], [0.4, 0, 0]);
  // 金护腕
  const wrG = G.tor(0.1, 0.035, 4, 8);
  add(R.elL, wrG, gold, [0, -0.22, 0], [PI / 2, 0, 0]);
  add(R.elR, wrG, gold, [0, -0.22, 0], [PI / 2, 0, 0]);
  // 背后金钟
  const bell = grp(R.spine, 0, 0.5, -0.5);
  const bellIn = grp(bell, 0, 0, 0);
  add(bellIn, G.lathe('bell', [[0, 0.62], [0.14, 0.6], [0.24, 0.52], [0.29, 0.32], [0.32, 0.12], [0.4, 0.0], [0.43, -0.08], [0, -0.08]], 10),
    gold, [0, -0.25, 0], null, 1.15);
  add(bellIn, merged('bell_band', [
    [G.tor(0.31, 0.03, 4, 12), [0, 0.0, 0], [PI / 2, 0, 0]],
    [G.tor(0.36, 0.03, 4, 12), [0, -0.2, 0], [PI / 2, 0, 0]],
    [G.tor(0.08, 0.03, 4, 8), [0, 0.5, 0]],
  ]), red, [0, 0, 0]);
  const BP0 = [0, 0.5, -0.5], BP1 = [0, 1.45, 0.05], BP2 = [0, -0.6, 0.9];

  const style = Object.assign({}, palm, {
    extra(R2, P, s, A, t) {
      const w = Math.max(0, P[W3]);
      let x, y, z;
      if (w <= 1) { x = lerp(BP0[0], BP1[0], w); y = lerp(BP0[1], BP1[1], w); z = lerp(BP0[2], BP1[2], w); }
      else { const k = Math.min(1, w - 1); x = lerp(BP1[0], BP2[0], k); y = lerp(BP1[1], BP2[1], k); z = lerp(BP1[2], BP2[2], k); }
      bell.position.set(x, y, z);
      const sh = P[W2];
      bellIn.rotation.set(Math.sin(t * 2) * 0.04 + A.runW * 0.12 - P[SX] * 0.5 * (1 - Math.min(1, w)), 0, sh * 0.3);
      bellIn.scale.setScalar(1 + Math.abs(sh) * 0.12 + Math.min(1, w) * 0.35);
    },
  });
  return { R, style };
}

// ============ 岩罡：岩石巨人 ============
function golem(c) {
  const R = buildRig({ hipH: 0.78, hipW: 0.2, thigh: 0.36, shin: 0.42, shY: 0.62, shW: 0.52, upper: 0.36, lower: 0.36, neckY: 0.66, comY: 1.2 });
  const rock = matL(c.primary), rockD = matL(c.secondary), rockL = matL(c.skin);
  const glow = matGlow(c.accent);
  add(R.hips, G.dod(0.3), rockD, [0, -0.02, 0], null, [1.15, 0.7, 0.85]);
  add(R.spine, G.dod(0.5), rock, [0, 0.4, 0], [0.2, 0.3, 0], [1.15, 0.95, 0.8]);
  add(R.spine, G.dod(0.3), rockL, [0, 0.12, 0.1], [0, 0.5, 0], [1.1, 0.7, 0.7]);
  // 胸口裂纹 + 核心
  add(R.spine, merged('golem_crack', [
    [G.box(0.04, 0.26, 0.04), [0.12, 0.55, 0.36], [0.2, 0, 0.5]],
    [G.box(0.04, 0.2, 0.04), [0.2, 0.36, 0.38], [0, 0, -0.4]],
    [G.box(0.04, 0.24, 0.04), [-0.14, 0.5, 0.37], [0.2, 0, -0.6]],
    [G.box(0.04, 0.2, 0.04), [-0.18, 0.3, 0.37], [0, 0, 0.5]],
    [G.box(0.04, 0.18, 0.04), [0.32, 0.6, 0.25], [0.3, 0.6, 0.2]],
  ]), glow);
  const core = add(R.spine, G.oct(0.13), glow, [0, 0.42, 0.38]);
  core.castShadow = false;
  // 背部岩刺
  add(R.spine, merged('golem_spike', [
    [G.cone(0.14, 0.42, 5), [0.18, 0.72, -0.25], [-0.6, 0, -0.4]],
    [G.cone(0.16, 0.5, 5), [-0.12, 0.76, -0.3], [-0.7, 0, 0.3]],
    [G.cone(0.12, 0.36, 5), [0.0, 0.45, -0.42], [-1.2, 0, 0]],
  ]), rockD);
  // 头 + 眼
  add(R.head, G.dod(0.24), rockL, [0, 0.12, 0.08], [0.3, 0.4, 0], [1.05, 0.9, 1]);
  add(R.head, merged('golem_eye', [
    [G.box(0.09, 0.04, 0.04), [0.09, 0.13, 0.3], [0, 0.3, -0.15]],
    [G.box(0.09, 0.04, 0.04), [-0.09, 0.13, 0.3], [0, -0.3, 0.15]],
  ]), glow);
  // 手臂：肩石、上臂、粗前臂、巨拳 + 拳面发光
  const knG = merged('golem_knuckle', [
    [G.box(0.22, 0.04, 0.04), [0, -0.12, 0.2]],
    [G.box(0.04, 0.16, 0.04), [0.06, -0.05, 0.22]],
  ]);
  for (const [sh, el, ha] of [[R.shL, R.elL, R.haL], [R.shR, R.elR, R.haR]]) {
    add(sh, G.dod(0.27), rockD, [0, 0.04, 0], [0.4, 0.2, 0], [1.1, 0.95, 1]);
    add(sh, G.cyl(0.14, 0.12, 0.4, 6), rock, [0, -0.18, 0]);
    add(el, G.dod(0.2), rockL, [0, -0.18, 0], [0, 0.6, 0], [1, 1.35, 1]);
    add(ha, G.dod(0.24), rockD, [0, -0.08, 0.04], [0.5, 0, 0.3]);
    add(ha, knG, glow);
  }
  // 腿
  for (const [lg, kn] of [[R.lgL, R.knL], [R.lgR, R.knR]]) {
    add(lg, G.cyl(0.17, 0.15, 0.38, 6), rockD, [0, -0.18, 0]);
    add(kn, G.cyl(0.15, 0.19, 0.3, 6), rock, [0, -0.17, 0]);
    add(kn, G.box(0.34, 0.16, 0.42), rockD, [0, -0.34, 0.06]);
  }

  const style = Object.assign({}, smash, {
    extra(R2, P, s, A, t) {
      const k = s.dead ? Math.max(0, 1 - (s.deadT || 0) / 0.8) : 1;
      core.scale.setScalar(k * (1 + Math.sin(t * 4) * 0.15 + (s.act ? 0.3 : 0)));
      core.rotation.y = t * 1.5;
    },
  });
  return { R, style };
}

export const HERO_BUILDERS = { swordsman, wolfman, ninja, firemage, icemage, archer, gunner, healer, monk, golem };
