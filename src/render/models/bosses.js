// 首领：炎鳞龙（四足火龙）、远古守卫（紫色符文石巨人）
import * as THREE from 'three';
import { G, add, grp, merged, matL, matGlow, noShadow } from './materials.js';
import { clamp01, smooth, easeIn, seg, lerp, newTrack, track, EMPTY_STATE } from './anim.js';

const PI = Math.PI;
const FLAT = [-PI / 2, 0, 0]; // 薄片放平：形状 y 正向 → 身后

// 四段关键帧：0 → 蓄力(tw) → 出手(ts) → 保持到 th → 回 0
let _p = 0, _tw = 0.45, _ts = 0.55, _th = 0.85, _w = 0;
const T4 = (p, tw, ts, th, w) => { _p = p; _tw = tw; _ts = ts; _th = th; _w = w; };
function key4(wind, strike) {
  const p = _p;
  let v;
  if (p < _tw) v = wind * smooth(p / _tw);
  else if (p < _ts) v = lerp(wind, strike, smooth((p - _tw) / (_ts - _tw)));
  else if (p < _th) v = strike;
  else v = strike * (1 - smooth((p - _th) / (1 - _th)));
  return v * _w;
}

// ============ 炎鳞龙 ============
const DL = new Float32Array(4), DK = new Float32Array(4);
const DK_GAIT = [0, PI, PI, 0];
const DK_DEAD_L = [-0.5, -0.2, 0.3, 0.55];

function drake() {
  const S = 0.85, BY = 1.7, N1 = -0.75, N2 = 0.35, HD = 0.45;
  const root = grp(null);
  const sc = grp(root);
  sc.scale.setScalar(S);
  const all = grp(sc);
  const body = grp(all, 0, BY, 0);
  const red = matL('#b8321f'), dark = matL('#5e1a12'), belly = matL('#f0a24a');
  const wingM = matL('#d9542a'), wingD = matL('#8a2416'), horn = matL('#e8dcc0');

  // 躯干 + 胸 + 臀
  add(body, merged('dk_body', [
    [G.ico(1, 1), [0, 0, -0.1], 0, [0.95, 0.82, 1.6]],
    [G.ico(0.8, 1), [0, 0.2, 0.95]],
    [G.ico(0.7, 1), [0, 0.05, -1.05], 0, [1.15, 1, 1]],
  ]), red);
  add(body, G.ico(0.9, 1), belly, [0, -0.3, 0.15], null, [0.85, 0.5, 1.55]);
  // 背刺
  const sp = [];
  const SPZ = [1.25, 0.8, 0.35, -0.1, -0.55, -1.0, -1.45], SPY = [0.95, 0.98, 0.82, 0.8, 0.74, 0.7, 0.45];
  for (let i = 0; i < SPZ.length; i++) {
    const h = 0.5 - Math.abs(i - 2.5) * 0.06;
    sp.push([G.cone(0.15, h, 4), [0, SPY[i] + h * 0.35, SPZ[i]], [-0.55, 0, 0]]);
  }
  add(body, merged('dk_spike', sp), horn);
  // 两侧熔岩纹
  const lv = [];
  for (const sx of [1, -1]) {
    for (const z of [-0.75, -0.1, 0.55]) {
      const r = 0.95 * Math.sqrt(1 - ((z + 0.1) / 1.6) ** 2);
      lv.push([G.box(0.06, 0.1, 0.55), [sx * r * 0.97, 0.12, z], [0.55, sx * 0.25, 0]]);
    }
  }
  const lava = add(body, merged('dk_lava', lv), matGlow('#ffb02e'));
  noShadow(lava);

  // 脖子两节 + 头
  const neck1 = grp(body, 0, 0.45, 1.35);
  add(neck1, merged('dk_neck1', [
    [G.cyl(0.42, 0.56, 1.15, 7), [0, 0, 0.5], [PI / 2, 0, 0]],
    [G.cone(0.1, 0.32, 4), [0, 0.47, 0.35], [-0.5, 0, 0]],
    [G.cone(0.09, 0.28, 4), [0, 0.4, 0.8], [-0.5, 0, 0]],
  ]), red);
  const neck2 = grp(neck1, 0, 0, 1.0);
  add(neck2, merged('dk_neck2', [
    [G.cyl(0.34, 0.43, 0.95, 7), [0, 0, 0.45], [PI / 2, 0, 0]],
    [G.cone(0.08, 0.26, 4), [0, 0.37, 0.4], [-0.5, 0, 0]],
  ]), red);
  const head = grp(neck2, 0, 0, 0.85);
  add(head, merged('dk_head', [
    [G.ico(0.45, 1), [0, 0.08, 0.15], 0, [0.95, 0.75, 1.0]],
    [G.box(0.55, 0.3, 0.8), [0, 0.02, 0.7]],
    [G.box(0.64, 0.12, 0.3), [0, 0.27, 0.38], [0.25, 0, 0]],
  ]), red);
  add(head, merged('dk_horn', [
    [G.cone(0.13, 0.85, 5), [0.25, 0.38, -0.25], [-1.35, 0, -0.35]],
    [G.cone(0.13, 0.85, 5), [-0.25, 0.38, -0.25], [-1.35, 0, 0.35]],
    [G.cone(0.07, 0.42, 4), [0.38, 0.05, -0.12], [-1.7, 0, -1.0]],
    [G.cone(0.07, 0.42, 4), [-0.38, 0.05, -0.12], [-1.7, 0, 1.0]],
    [G.cone(0.06, 0.22, 4), [0, 0.22, 0.95], [-0.3, 0, 0]],
    [G.cone(0.035, 0.14, 3), [0.2, -0.17, 0.95], [PI, 0, 0]],
    [G.cone(0.035, 0.14, 3), [-0.2, -0.17, 0.95], [PI, 0, 0]],
  ]), horn);
  const jaw = grp(head, 0, -0.14, 0.2);
  add(jaw, G.box(0.5, 0.14, 0.85), dark, [0, -0.04, 0.42]);
  add(head, merged('dk_eye', [
    [G.box(0.14, 0.07, 0.05), [0.27, 0.17, 0.45], [0, 0.5, -0.2]],
    [G.box(0.14, 0.07, 0.05), [-0.27, 0.17, 0.45], [0, -0.5, 0.2]],
  ]), matGlow('#ffe66b'));
  // 喷火：尖端在嘴，向前张开
  const fire = grp(head, 0, -0.12, 1.1);
  fire.rotation.x = -0.7; // 低头喷火时火柱上抬，免得整段扎进地里
  const fo = add(fire, G.cone(0.78, 3.6, 8), matGlow('#ff7a1f', 0.72), [0, 0, 1.8], FLAT);
  const fi = add(fire, G.cone(0.38, 3.0, 6), matGlow('#ffe66b', 0.9), [0, 0, 1.5], FLAT);
  fi.renderOrder = 1;
  noShadow(fo, fi);

  // 翅膀：内段（带翼骨）+ 外段，右翼镜像
  const w1G = merged('dk_w1', [
    [G.shape('dkw1', [[0, -0.12], [1.7, -0.05], [1.55, 0.55], [1.0, 1.0], [0.45, 1.3], [0, 1.15]], 0.06), [0, 0, 0], FLAT],
    [G.cyl(0.07, 0.13, 1.75, 5), [0.85, 0, 0.06], [0, 0, -PI / 2]],
  ]);
  const w2G = merged('dk_w2', [
    [G.shape('dkw2', [[0, -0.1], [2.1, 0.1], [1.75, 0.6], [1.35, 0.5], [1.05, 1.05], [0.6, 0.85], [0.25, 1.25], [0, 1.0]], 0.05), [0, 0, 0], FLAT],
    [G.cyl(0.045, 0.075, 2.1, 5), [1.05, 0, 0.08], [0, 0, -PI / 2]],
    [G.cone(0.07, 0.32, 4), [2.25, 0, 0.1], [0, 0, -PI / 2]],
  ]);
  const wings = [];
  for (const sx of [1, -1]) {
    const w1 = grp(body, sx * 0.65, 0.6, 0.55);
    if (sx < 0) w1.scale.x = -1;
    add(w1, w1G, wingD);
    const w2 = grp(w1, 1.7, 0, 0);
    add(w2, w2G, wingM);
    wings.push(w1, w2);
  }

  // 四条腿（上段 + 下段），下段长度按脚底贴地反算
  const L2F = BY - 0.3 - 0.7 * Math.cos(0.2) - 0.07, L2B = BY - 0.25 - 0.75 * Math.cos(0.3) - 0.07;
  const fuG = merged('dk_fu', [[G.ico(0.32, 0), [0, -0.02, 0]], [G.cyl(0.26, 0.19, 0.7, 6), [0, -0.35, 0]]]);
  const buG = merged('dk_bu', [[G.ico(0.48, 1), [0, -0.2, 0], 0, [0.8, 1.15, 1]], [G.cyl(0.26, 0.2, 0.75, 6), [0, -0.4, 0]]]);
  const claw = (L) => [
    [G.box(0.38, 0.14, 0.5), [0, -L, 0.1]],
    [G.cone(0.05, 0.18, 3), [0.12, -L - 0.02, 0.4], [PI / 2, 0, 0]],
    [G.cone(0.05, 0.18, 3), [0, -L - 0.02, 0.42], [PI / 2, 0, 0]],
    [G.cone(0.05, 0.18, 3), [-0.12, -L - 0.02, 0.4], [PI / 2, 0, 0]],
  ];
  const flG = merged('dk_fl', [[G.cyl(0.18, 0.14, L2F, 6), [0, -L2F / 2, 0]], ...claw(L2F)]);
  const blG = merged('dk_bl', [[G.cyl(0.19, 0.15, L2B, 6), [0, -L2B / 2, 0]], ...claw(L2B)]);
  const LEGS = [[0.75, -0.3, 0.95, 0.7], [-0.75, -0.3, 0.95, 0.7], [0.8, -0.25, -0.85, 0.75], [-0.8, -0.25, -0.85, 0.75]];
  const REST_L = [0.2, 0.2, -0.3, -0.3], REST_K = [-0.2, -0.2, 0.3, 0.3];
  const legs = [], knees = [];
  for (let i = 0; i < 4; i++) {
    const [x, y, z, len] = LEGS[i];
    const g = grp(body, x, y, z);
    add(g, i < 2 ? fuG : buG, red);
    const k = grp(g, 0, -len, 0);
    add(k, i < 2 ? flG : blG, dark);
    legs.push(g); knees.push(k);
  }

  // 尾巴四节 + 尾锤
  const TS = [[0.52, 0.4, 0.8], [0.4, 0.29, 0.75], [0.29, 0.19, 0.7], [0.19, 0.09, 0.65]];
  const TX = [-0.55, 0.15, 0.15, 0.12];
  const tail = [];
  let par = body;
  for (let i = 0; i < TS.length; i++) {
    const [r0, r1, len] = TS[i];
    const g = grp(par, 0, i ? 0 : 0.05, i ? -TS[i - 1][2] : -1.55);
    add(g, merged('dk_tail' + i, [
      [G.cyl(r0, r1, len, 6), [0, 0, -len / 2], [PI / 2, 0, 0]],
      [G.cone(0.07 + r1 * 0.2, 0.22 + r1 * 0.3, 4), [0, r0 * 0.9, -len * 0.4], [-0.6, 0, 0]],
    ]), red);
    tail.push(g);
    par = g;
  }
  add(par, merged('dk_tip', [
    [G.oct(0.36), [0, 0, -0.95], 0, [1, 0.28, 1.5]],
  ]), horn);

  const A = newTrack();
  function update(s) {
    s = s || EMPTY_STATE;
    track(A, s, 4.2);
    const t = A.t + A.seed, rw = A.runW, ph = A.ph, aw = A.actW, sw = A.stunW;
    let by = BY + Math.sin(t * 1.4) * 0.03, bz = 0, bx = 0, brz = 0;
    let n1x = N1 + Math.sin(t * 0.9) * 0.04 + 0.15 * rw, n1y = Math.sin(t * 0.45) * 0.2 * (1 - rw);
    let n2x = N2, hx = HD + Math.sin(t * 0.9 + 1) * 0.05 - 0.1 * rw, hy = Math.sin(t * 0.7) * 0.15 * (1 - rw);
    let jw = 0.06 + Math.max(0, Math.sin(t * 0.8)) * 0.1;
    let wz = 0.9 + Math.sin(t * 1.4) * 0.04, wy = 0.9, w2z = -2.0, f = 0, tsw = 1;
    // 行走：对角步态
    by += (Math.abs(Math.cos(ph)) - 0.6) * 0.08 * rw;
    bx += Math.sin(ph * 2) * 0.02 * rw;
    for (let i = 0; i < 4; i++) {
      const a = ph + DK_GAIT[i];
      DL[i] = REST_L[i] + Math.sin(a) * 0.42 * rw;
      DK[i] = REST_K[i] + Math.max(0, -Math.cos(a)) * 0.7 * rw;
    }
    // 喷火：抬身张翅仰头蓄力 → 低头前压喷火（单数次边喷边扫）
    if (aw > 0.001) {
      const big = A.kind === 2 ? 1.35 : 1;
      T4(A.p, 0.45, 0.55, 0.85, aw);
      bx += key4(-0.22, 0.08) * big; by += key4(0.22, -0.05) * big; bz += key4(-0.25, 0.3);
      n1x += key4(-0.35, 0.55); n2x += key4(-0.1, 0.1); hx += key4(-0.45, 0.1); jw += key4(0.45, 0.75);
      wz += key4(-0.55, -0.3); wy += key4(-0.7, -0.4); w2z += key4(1.85, 1.6);
      DL[0] += key4(-0.55, 0.05); DL[1] += key4(-0.55, 0.05); DK[0] += key4(0.6, 0); DK[1] += key4(0.6, 0);
      DL[2] += key4(0.22, -0.08); DL[3] += key4(0.22, -0.08);
      f = seg(A.p, 0.47, 0.56) * (1 - seg(A.p, 0.85, 0.95)) * aw;
      if (A.idx % 2) n1y += lerp(-0.5, 0.5, smooth(seg(A.p, 0.5, 0.86))) * f;
    }
    // 眩晕：低头晃脑
    n1x += 0.35 * sw; hy += Math.sin(t * 3) * 0.35 * sw; jw += 0.2 * sw; brz += Math.sin(t * 3) * 0.05 * sw;
    // 击飞
    const aiw = A.airW;
    all.rotation.set(-0.3 * smooth(A.airT / 0.3) * aiw, 0, Math.sin(A.airT * 5) * 0.1 * aiw);
    all.position.set(0, 0, 0);
    // 死亡：侧倒，脖子垂地
    if (A.dead) {
      const k = easeIn(clamp01(A.d / 0.9));
      all.rotation.set(0, 0, 1.3 * k);
      all.position.set(BY * 0.96 * k, (0.95 - BY * 0.27) * k, 0);
      n1x = lerp(n1x, -0.1, k); n1y = lerp(n1y, -0.7, k); n2x = lerp(n2x, 0.1, k);
      hx = lerp(hx, 0.1, k); hy = lerp(hy, -0.4, k); jw = lerp(jw, 0.5, k);
      wz = lerp(wz, 0.5, k); wy = lerp(wy, 0.6, k); w2z = lerp(w2z, -1.2, k);
      for (let i = 0; i < 4; i++) { DL[i] = lerp(DL[i], DK_DEAD_L[i], k); DK[i] = lerp(DK[i], 0.4, k); }
      tsw = 1 - k; f = 0;
    }
    body.position.set(0, by, bz);
    body.rotation.set(bx, 0, brz);
    neck1.rotation.set(n1x, n1y, 0);
    neck2.rotation.set(n2x, n1y * 0.5, 0);
    head.rotation.set(hx, hy, 0);
    jaw.rotation.x = jw;
    // 右翼根节点是镜像组，Y/Z 转角取反
    wings[0].rotation.set(0, wy, wz); wings[2].rotation.set(0, -wy, -wz);
    wings[1].rotation.z = w2z; wings[3].rotation.z = w2z;
    for (let i = 0; i < 4; i++) { legs[i].rotation.x = DL[i]; knees[i].rotation.x = DK[i]; }
    for (let i = 0; i < tail.length; i++) {
      tail[i].rotation.set(TX[i] + 0.1 * rw, (Math.sin(t * 1.1 - i * 0.7) * 0.12 + Math.sin(ph - i * 0.5) * 0.12 * rw) * tsw, 0);
    }
    fire.visible = f > 0.02;
    if (fire.visible) {
      fire.scale.set(0.5 + f * 0.5, 0.5 + f * 0.5, f * (1 + Math.sin(t * 37) * 0.06));
      fi.scale.set(1 + Math.sin(t * 53) * 0.12, 1 + Math.sin(t * 47) * 0.12, 1);
    }
    lava.scale.set(1, 1 + Math.sin(t * 3) * 0.08 + f * 0.3, 1);
  }
  update({ t: 0 });
  return { root, height: 3.4, update };
}

// ============ 远古守卫 ============
const C_RUNE = new THREE.Color('#9b52e8'), C_HOT = new THREE.Color('#f1d6ff'), C_DEAD = new THREE.Color('#2e2238');

function guardian() {
  const root = grp(null);
  const all = grp(root);
  const PY = 2.0, TP = 0.15;
  const stone = matL('#6d6188'), stoneD = matL('#4a3f5f'), stoneL = matL('#9184ad');
  // 符文、地面光圈、冲击波要单独调亮度/透明度，用本实例专属材质（首领只有一只）
  const runeM = new THREE.MeshBasicMaterial({ color: C_RUNE.clone() });
  const ringM = new THREE.MeshBasicMaterial({ color: '#c77dff', transparent: true, opacity: 0.5, depthWrite: false });
  const waveM = new THREE.MeshBasicMaterial({ color: '#e0aaff', transparent: true, opacity: 0, depthWrite: false });

  const pelvis = grp(all, 0, PY, 0);
  add(pelvis, G.dod(0.7), stoneD, [0, 0, 0], [0.2, 0.5, 0], [1.4, 0.75, 1.0]);
  const torso = grp(pelvis, 0, 0.2, 0);
  add(torso, G.dod(1.0), stone, [0, 1.05, 0], [0.2, 0.3, 0], [1.45, 1.15, 0.95]);
  add(torso, merged('gd_plate', [
    [G.box(1.7, 0.85, 0.35), [0, 1.4, 0.78], [-0.12, 0, 0]],
    [G.box(1.1, 0.5, 0.3), [0, 0.6, 0.78], [0.1, 0, 0]],
    [G.box(0.8, 0.4, 0.9), [0, 2.0, -0.15]],
  ]), stoneL);
  add(torso, merged('gd_rune', [
    [G.box(0.07, 0.62, 0.05), [0.42, 1.4, 0.97], [-0.12, 0, 0]],
    [G.box(0.07, 0.62, 0.05), [-0.42, 1.4, 0.97], [-0.12, 0, 0]],
    [G.box(1.2, 0.06, 0.05), [0, 1.8, 0.92], [-0.12, 0, 0]],
    [G.box(0.6, 0.06, 0.05), [0, 0.62, 0.95], [0.1, 0, 0]],
    [G.oct(0.22), [0.5, 2.0, -0.6], [-0.6, 0, -0.3], [0.7, 2.2, 0.7]],
    [G.oct(0.24), [-0.45, 2.1, -0.55], [-0.5, 0, 0.35], [0.7, 2.2, 0.7]],
    [G.oct(0.2), [0, 1.65, -0.85], [-0.9, 0, 0], [0.7, 2.2, 0.7]],
    [G.oct(0.17), [0.85, 1.3, -0.6], [-0.7, 0, -0.6], [0.7, 2, 0.7]],
    [G.oct(0.17), [-0.85, 1.25, -0.6], [-0.7, 0, 0.6], [0.7, 2, 0.7]],
  ]), runeM);
  const core = add(torso, G.oct(0.28), matGlow('#f3d1ff'), [0, 1.2, 1.02], null, [1, 1.35, 0.6]);
  noShadow(core);
  // 头 + 角冠
  const head = grp(torso, 0, 2.25, 0.3);
  add(head, merged('gd_head', [
    [G.dod(0.45), [0, 0.15, 0], [0.3, 0.4, 0], [1.1, 0.95, 1.05]],
    [G.box(0.6, 0.25, 0.45), [0, -0.12, 0.15]],
    [G.cone(0.11, 0.55, 4), [0, 0.68, -0.05], [-0.3, 0, 0]],
    [G.cone(0.1, 0.48, 4), [0.3, 0.55, -0.05], [-0.3, 0, -0.5]],
    [G.cone(0.1, 0.48, 4), [-0.3, 0.55, -0.05], [-0.3, 0, 0.5]],
    [G.cone(0.09, 0.4, 4), [0.46, 0.32, -0.05], [-0.2, 0, -1.0]],
    [G.cone(0.09, 0.4, 4), [-0.46, 0.32, -0.05], [-0.2, 0, 1.0]],
  ]), stoneL);
  add(head, merged('gd_eye', [
    [G.box(0.15, 0.06, 0.05), [0.17, 0.15, 0.46], [0, 0.3, -0.2]],
    [G.box(0.15, 0.06, 0.05), [-0.17, 0.15, 0.46], [0, -0.3, 0.2]],
  ]), runeM);
  // 双臂：肩部巨石、上臂、前臂连拳头、前臂符文环
  const upG = G.cyl(0.36, 0.3, 1.2, 6);
  const foreG = merged('gd_fore', [[G.cyl(0.33, 0.45, 1.1, 6), [0, -0.55, 0]], [G.dod(0.6), [0, -1.4, 0.05], [0.3, 0.4, 0]]]);
  const fruneG = merged('gd_frune', [
    [G.tor(0.43, 0.05, 4, 10), [0, -0.3, 0], [PI / 2, 0, 0]],
    [G.tor(0.47, 0.05, 4, 10), [0, -0.8, 0], [PI / 2, 0, 0]],
    [G.box(0.06, 0.5, 0.06), [0, -0.55, 0.42]],
  ]);
  const sh = [], el = [];
  for (const sx of [1, -1]) {
    const s1 = grp(torso, sx * 1.5, 1.75, 0);
    add(s1, G.dod(0.62), stoneD, [sx * 0.12, 0.18, 0], [0.4, sx * 0.5, 0.2]);
    add(s1, upG, stone, [0, -0.6, 0]);
    const e1 = grp(s1, 0, -1.2, 0);
    add(e1, foreG, stoneD);
    add(e1, fruneG, runeM);
    sh.push(s1); el.push(e1);
  }
  // 双腿：大腿、小腿、脚掌（脚掌单独保持水平）
  const thighG = merged('gd_thigh', [[G.dod(0.42), [0, -0.05, 0], [0.3, 0.2, 0]], [G.cyl(0.4, 0.33, 0.95, 6), [0, -0.47, 0]]]);
  const shinG = merged('gd_shin', [[G.dod(0.36), [0, 0, 0.05]], [G.cyl(0.33, 0.4, 0.75, 6), [0, -0.37, 0]]]);
  const lg = [], kn = [], ft = [];
  for (const sx of [1, -1]) {
    const l = grp(pelvis, sx * 0.62, -0.1, 0);
    add(l, thighG, stone);
    const k = grp(l, 0, -0.95, 0);
    add(k, shinG, stoneD);
    const f = grp(k, 0, -0.75, 0);
    add(f, G.box(0.8, 0.26, 1.05), stoneD, [0, -0.07, 0.15]);
    lg.push(l); kn.push(k); ft.push(f);
  }
  // 环绕浮石（合并为一个网格，整组旋转）
  const orb = grp(all, 0, 3.4, 0);
  add(orb, merged('gd_orb', [
    [G.dod(0.28), [2.4, 0.2, 0]],
    [G.dod(0.22), [-1.2, 0.35, 2.0]],
    [G.dod(0.32), [-1.4, -0.1, -1.9]],
    [G.dod(0.2), [0.9, 0.3, -2.2]],
    [G.tet(0.3), [1.0, -0.2, 2.1]],
  ]), stoneL);
  // 地面符文光圈 + 冲击波
  const ring = add(all, merged('gd_ring', [[G.ring(2.7, 2.95, 40)], [G.ring(1.9, 2.0, 40)]]), ringM, [0, 0.04, 0]);
  const WZ = 3.0;
  const wave = add(all, G.ring(0.8, 1.0, 40), waveM, [0, 0.07, WZ]);
  noShadow(ring, wave);
  wave.visible = false;

  const A = newTrack();
  function update(s) {
    s = s || EMPTY_STATE;
    track(A, s, 4.6);
    const t = A.t + A.seed, rw = A.runW, ph = A.ph, aw = A.actW, sw = A.stunW;
    const a = Math.sin(ph), c = Math.cos(ph);
    let py = PY + Math.sin(t * 1.1) * 0.03 - Math.abs(a) * 0.08 * rw;
    let tp = TP + Math.sin(t * 1.1) * 0.02 + 0.12 * rw, ty = a * 0.12 * rw, tz = 0;
    // 手臂角度按世界竖直方向算（负值＝向前）
    let aL = -0.12 + Math.sin(t * 0.9) * 0.04 - a * 0.4 * rw, aR = -0.12 + Math.sin(t * 0.9 + 1) * 0.04 + a * 0.4 * rw;
    let eL = -0.2, eR = -0.2, zL = 0.1, zR = 0.1;
    let lL = a * 0.4 * rw, lR = -a * 0.4 * rw;
    let kL = Math.max(0, -c) * 0.7 * rw, kR = Math.max(0, c) * 0.7 * rw;
    let hx = -0.1 + Math.sin(t * 0.6) * 0.05, hy = Math.sin(t * 0.4) * 0.3 * (1 - rw);
    let glow = 0.3 + Math.sin(t * 2.2) * 0.12, wv = -1;
    // 攻击：双拳举过头蓄力（符文变亮）→ 砸地放冲击波
    if (aw > 0.001) {
      const big = A.kind === 2 ? 1.2 : 1;
      T4(A.p, 0.5, 0.6, 0.75, aw);
      aL += key4(-2.75, -0.5); aR += key4(-2.75, -0.5); eL += key4(-0.5, 0.15); eR += key4(-0.5, 0.15);
      zL += key4(0.15, -0.05); zR += key4(0.15, -0.05);
      tp += key4(-0.3, 0.85); py += key4(0.12 * big, -0.43); hx += key4(-0.35, 0.1);
      lL += key4(0.05, -0.72); lR += key4(0.05, -0.72); kL += key4(0, 1.44); kR += key4(0, 1.44);
      glow = lerp(glow, 1, key4(1, 1));
      if (A.p > 0.58) wv = (A.p - 0.58) / 0.42;
    }
    // 眩晕
    tz += Math.sin(t * 2.6) * 0.07 * sw; hx += 0.3 * sw; glow *= 1 - 0.6 * sw;
    // 击飞
    const aiw = A.airW;
    all.rotation.set(-0.25 * smooth(A.airT / 0.3) * aiw, 0, Math.sin(A.airT * 5) * 0.08 * aiw);
    all.position.set(0, 0, 0);
    // 死亡：跪倒前扑，肩臂和头散开下坠，整体下沉，符文熄灭
    let dk = 0;
    if (A.dead) {
      const k = easeIn(clamp01(A.d / 0.9));
      dk = k;
      py = lerp(py, 0.95, k); tp = lerp(tp, 1.15, k); ty *= 1 - k; tz *= 1 - k;
      lL = lerp(lL, -1.3, k); lR = lerp(lR, -1.1, k); kL = lerp(kL, 2.2, k); kR = lerp(kR, 2.0, k);
      aL = lerp(aL, -1.25, k); aR = lerp(aR, -1.1, k); zL = lerp(zL, 0.6, k); zR = lerp(zR, 0.5, k);
      eL = lerp(eL, -0.3, k); eR = lerp(eR, 0, k); hx = lerp(hx, 0.7, k);
      glow = 0;
      all.position.y = -0.5 * smooth(clamp01((A.d - 0.6) / 0.6));
    }
    pelvis.position.y = py;
    torso.rotation.set(tp, ty, tz);
    head.position.set(0, 2.25 - 0.5 * dk, 0.3 + 0.6 * dk);
    head.rotation.set(hx - (tp - TP) * 0.5, hy, 0);
    sh[0].position.set(1.5 + 0.5 * dk, 1.75 - 0.6 * dk, 0.3 * dk);
    sh[1].position.set(-1.5 - 0.5 * dk, 1.75 - 0.6 * dk, 0.3 * dk);
    sh[0].rotation.set(aL - tp, 0, zL); sh[1].rotation.set(aR - tp, 0, -zR);
    el[0].rotation.x = eL; el[1].rotation.x = eR;
    lg[0].rotation.x = lL; lg[1].rotation.x = lR;
    kn[0].rotation.x = kL; kn[1].rotation.x = kR;
    ft[0].rotation.x = -(lL + kL); ft[1].rotation.x = -(lR + kR);
    orb.rotation.y = t * 0.35;
    orb.position.y = lerp(3.4 + Math.sin(t * 0.8) * 0.12, 0.35, dk);
    runeM.color.copy(C_RUNE).lerp(dk > 0 ? C_DEAD : C_HOT, dk > 0 ? dk : clamp01(glow));
    core.scale.set(1 + Math.sin(t * 2.5) * 0.08 + glow * 0.25, 1.35 * (1 + glow * 0.2), 0.6);
    core.visible = dk < 0.6;
    ringM.opacity = (0.4 + Math.sin(t * 1.5) * 0.1 + glow * 0.25) * (1 - dk);
    wave.visible = wv >= 0 && wv < 1;
    if (wave.visible) {
      const r = 1 + easeOutQ(wv) * 4.5;
      wave.scale.set(r, 1, r);
      waveM.opacity = 0.9 * (1 - wv) * aw;
    }
  }
  update({ t: 0 });
  return { root, height: 5.4, update };
}

const easeOutQ = (x) => 1 - (1 - x) * (1 - x);

export const BOSS_BUILDERS = { drake, guardian };
