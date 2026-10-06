// 建筑：防御塔（三档）、水晶、泉水
import { G, add, grp, merged, matL, matS, matGlow, shade, teamColor, recv, noShadow } from './materials.js';
import { TAU, clamp01, smooth, easeIn, easeOut, bump, actP, getDt, EMPTY_STATE, lerp, seg } from './anim.js';

const PI = Math.PI;
const STONE = '#9a958b', STONE_D = '#625d56', GOLD = '#d8b25a';

// 各档防御塔参数：塔身高、爪数、是否金饰、光环数
const TIER = {
  outer: { sh: 4.3, n: 4, gold: false, halo: 1, coreR: 0.55 },
  inner: { sh: 5.1, n: 4, gold: true, halo: 1, coreR: 0.62 },
  high: { sh: 5.6, n: 6, gold: true, halo: 2, coreR: 0.7 },
};

// ============ 防御塔 ============
export function buildTower(tier, team) {
  const cfg = TIER[tier] || TIER.outer;
  const tc = teamColor(team);
  const sh = cfg.sh, y0 = 0.85, rB = 1.2, rT = 0.85;
  const root = grp(null);
  const stone = matL(STONE), stoneD = matL(STONE_D), trim = cfg.gold ? matS(GOLD, 0.7, 0.35) : matL(shade(STONE, 0.85));
  const glow = matGlow(tc), glowL = matGlow(shade(tc, 1.6)), teamE = matL(tc, 0.45);

  // 底座（两层八角台）
  recv(add(root, merged('tw_base', [
    [G.cyl(2.05, 2.25, 0.5, 8), [0, 0.25, 0]],
    [G.cyl(1.6, 1.85, 0.36, 8), [0, 0.67, 0]],
  ]), stoneD));
  const rune = add(root, G.ring(2.3, 2.55, 32), matGlow(tc, 0.55), [0, 0.04, 0]);
  noShadow(rune);
  // 倒塌后的碎石（平时缩成 0）
  const rubble = add(root, merged('tw_rubble', [
    [G.dod(0.5), [1.2, 0.3, 0.6], [0.3, 0.2, 0]], [G.dod(0.4), [-1.0, 0.25, 1.0], [0.6, 1, 0]],
    [G.dod(0.45), [0.3, 0.3, -1.3], [1, 0.4, 0.2]], [G.dod(0.35), [-1.3, 0.2, -0.6]],
  ]), stone);
  rubble.scale.setScalar(0.001);

  // 塔身组（绕底部倾倒）
  const top = grp(root, 0, y0, 0);
  const rAt = (y) => rB + (rT - rB) * (y / sh);
  const shaftParts = [[G.cyl(rT, rB, sh, 8), [0, sh / 2, 0]]];
  if (cfg.gold) {
    // 扶壁
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + PI / 4;
      shaftParts.push([G.box(0.35, sh * 0.45, 0.5), [Math.sin(a) * (rB + 0.05), sh * 0.2, Math.cos(a) * (rB + 0.05)], [0, a, 0]]);
    }
  }
  add(top, merged('tw_shaft' + tier, shaftParts), stone);
  // 队伍色饰带 + 发光窗缝
  const b1 = sh * 0.3, b2 = sh * 0.78;
  add(top, merged('tw_band' + tier, [
    [G.tor(rAt(b1) + 0.02, 0.09, 4, 16), [0, b1, 0], [PI / 2, 0, 0]],
    [G.tor(rAt(b2) + 0.02, 0.09, 4, 16), [0, b2, 0], [PI / 2, 0, 0]],
  ]), teamE);
  const slits = [];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU, ym = sh * 0.54, r = rAt(ym) - 0.03;
    slits.push([G.box(0.14, 0.75, 0.1), [Math.sin(a) * r, ym, Math.cos(a) * r], [0, a, 0]]);
  }
  add(top, merged('tw_slit' + tier, slits), glow);
  // 顶部平台 + 爪形立柱
  add(top, merged('tw_plat' + tier, [
    [G.cyl(1.45, 1.0, 0.45, 8), [0, sh + 0.2, 0]],
    [G.cyl(1.5, 1.5, 0.12, 8), [0, sh + 0.46, 0]],
  ]), stoneD);
  const claws = [];
  for (let i = 0; i < cfg.n; i++) {
    const a = i / cfg.n * TAU + PI / cfg.n;
    const sx = Math.sin(a), cz = Math.cos(a);
    claws.push([G.box(0.24, 1.3, 0.3), [sx * 1.2, sh + 1.1, cz * 1.2], [0, a, 0], 1]);
    // 爪尖向内弯：用绕切线轴的倾斜近似
    claws.push([G.cone(0.16, 0.7, 4), [sx * 1.0, sh + 2.0, cz * 1.0], [-cz * 0.55, 0, sx * 0.55]]);
  }
  add(top, merged('tw_claw' + tier, claws), trim);

  // 核心
  const coreY = sh + 1.55;
  const cg = grp(top, 0, coreY, 0);
  const core = add(cg, G.oct(cfg.coreR), glow, null, null, [1, 1.35, 1]);
  const inner = add(cg, G.oct(+(cfg.coreR * 0.5).toFixed(2)), matGlow('#ffffff'), null, null, [1, 1.35, 1]);
  const halos = [];
  for (let i = 0; i < cfg.halo; i++) {
    const h = add(cg, G.tor(cfg.coreR + 0.45 + i * 0.3, 0.05, 4, 24), matGlow(shade(tc, 1.3), 0.75));
    noShadow(h);
    halos.push(h);
  }
  const height = y0 + coreY + cfg.coreR * 1.35;

  const A = { time: 0, deadT: 0, wasDead: false, spin: 0 };
  function update(s) {
    s = s || EMPTY_STATE;
    const dt = getDt(s);
    A.time += dt;
    const t = s.t !== undefined ? s.t : A.time;
    if (s.dead) {
      if (!A.wasDead) { A.wasDead = true; A.deadT = 0; }
      A.deadT += dt;
      const d = s.deadT !== undefined ? s.deadT : A.deadT;
      const k = easeIn(clamp01(d / 1.0));
      top.rotation.set(0.12 * k, 0, 0.45 * k);
      top.position.y = y0 - (sh * 0.72) * k;
      const kc = clamp01(d / 0.6);
      cg.position.set(1.4 * kc, coreY - 2.2 * easeIn(kc), 0);
      core.scale.set(1 - kc, (1 - kc) * 1.35, 1 - kc);
      inner.visible = false;
      for (const h of halos) h.visible = false;
      rubble.scale.setScalar(Math.max(0.001, easeOut(seg(d, 0.3, 0.9))));
      rune.visible = d < 0.5;
      return;
    }
    if (A.wasDead) {
      A.wasDead = false;
      top.rotation.set(0, 0, 0); top.position.y = y0; cg.position.set(0, coreY, 0);
      inner.visible = true; rune.visible = true; rubble.scale.setScalar(0.001);
      for (const h of halos) h.visible = true;
    }
    let pulse = 0;
    if (s.act === 'attack' || s.act === 'cast') pulse = bump(actP(s), 0, 0.55);
    A.spin += dt * (0.8 + pulse * 6);
    cg.position.y = coreY + Math.sin(t * 1.6) * 0.12;
    core.rotation.y = A.spin;
    const cs = 1 + pulse * 0.45 + Math.sin(t * 3) * 0.04;
    core.scale.set(cs, cs * 1.35, cs);
    inner.scale.setScalar(1 + pulse * 0.9);
    for (let i = 0; i < halos.length; i++) {
      const h = halos[i];
      h.rotation.set(PI / 2 + Math.sin(t * 0.7 + i * 2) * 0.35, A.spin * (i ? -1.3 : 1), 0);
      h.scale.setScalar(1 + pulse * 0.35);
    }
  }
  update({ t: 0 });
  return { root, height, update };
}

// ============ 水晶 ============
export function buildCrystal(team) {
  const tc = teamColor(team);
  const root = grp(null);
  const stone = matL(STONE), stoneD = matL(STONE_D);
  const glow = matGlow(tc), crysM = matS(shade(tc, 1.25), 0.15, 0.3, 0.45);
  recv(add(root, G.cyl(3.3, 3.5, 0.5, 8), stoneD, [0, 0.25, 0]));
  recv(add(root, merged('cr_base', [
    [G.cyl(2.5, 2.9, 0.5, 8), [0, 0.75, 0]],
    [G.cyl(1.15, 1.55, 0.6, 8), [0, 1.3, 0]],
  ]), stone));
  const rune = add(root, G.ring(2.95, 3.2, 32), matGlow(tc, 0.8), [0, 0.52, 0]);
  noShadow(rune);
  // 四根立柱 + 柱顶光
  const pil = [], tips = [];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + PI / 4, sx = Math.sin(a), cz = Math.cos(a);
    pil.push([G.box(0.45, 2.6, 0.45), [sx * 2.55, 2.2, cz * 2.55], [cz * 0.12, a, -sx * 0.12]]);
    tips.push([G.oct(0.28), [sx * 2.4, 3.65, cz * 2.4], 0, [1, 1.6, 1]]);
  }
  add(root, merged('cr_pillar', pil), stoneD);
  const tipM = add(root, merged('cr_tip', tips), glow);
  // 主晶体（上下两半）+ 内核 + 光环
  const CY = 3.9;
  const cg = grp(root, 0, CY, 0);
  const upper = grp(cg), lower = grp(cg);
  add(upper, G.cone(1.15, 2.3, 6), crysM, [0, 1.15, 0]);
  add(lower, G.cone(1.15, 1.5, 6), crysM, [0, -0.75, 0], [PI, 0, 0]);
  const core = add(cg, G.oct(0.5), matGlow('#ffffff'), null, null, [1, 1.4, 1]);
  const aura = add(cg, G.tor(1.75, 0.06, 4, 28), matGlow(shade(tc, 1.35), 0.7));
  noShadow(aura);
  // 三片环绕碎晶
  const shards = [];
  for (let i = 0; i < 3; i++) {
    const g = grp(root, 0, CY, 0);
    add(g, G.oct(0.32), crysM, null, null, [0.8, 1.9, 0.8]);
    shards.push(g);
  }
  const height = CY + 2.3;

  const A = { time: 0, deadT: 0, wasDead: false, rot: 0 };
  function update(s) {
    s = s || EMPTY_STATE;
    const dt = getDt(s);
    A.time += dt;
    const t = s.t !== undefined ? s.t : A.time;
    if (s.dead) {
      if (!A.wasDead) { A.wasDead = true; A.deadT = 0; }
      A.deadT += dt;
      const d = s.deadT !== undefined ? s.deadT : A.deadT;
      const k1 = clamp01(d / 0.9), fall = easeIn(k1), pop = Math.sin(clamp01(d / 0.5) * PI * 0.5);
      // 两半裂开并落地
      cg.position.y = CY;
      upper.position.set(1.6 * k1, 0.8 * pop - (CY + 0.4) * fall + 0.3 * fall, 0);
      upper.rotation.set(0, 0, -1.25 * fall);
      lower.position.set(-1.0 * k1, -(CY - 2.6) * fall, 0.4 * k1);
      lower.rotation.set(0.5 * fall, 0, 0.9 * fall);
      core.scale.setScalar(Math.max(0.001, 1 - clamp01(d / 0.35)));
      aura.visible = false;
      tipM.visible = d < 0.4;
      for (let i = 0; i < 3; i++) {
        const a = A.rot * 1.4 + i * TAU / 3, r = 2.0 + 2.2 * easeOut(k1);
        shards[i].position.set(Math.cos(a) * r, lerp(CY, 0.35, fall), Math.sin(a) * r);
        shards[i].rotation.set(1.3 * fall, 0, 0.6 * fall + i);
      }
      return;
    }
    if (A.wasDead) {
      A.wasDead = false;
      upper.position.set(0, 0, 0); upper.rotation.set(0, 0, 0);
      lower.position.set(0, 0, 0); lower.rotation.set(0, 0, 0);
      core.scale.setScalar(1); aura.visible = true; tipM.visible = true;
    }
    let pulse = 0;
    if (s.act === 'attack' || s.act === 'cast') pulse = bump(actP(s), 0, 0.6);
    A.rot += dt * (0.45 + pulse * 2.5);
    cg.position.y = CY + Math.sin(t * 1.2) * 0.18;
    cg.rotation.y = A.rot;
    core.scale.set(1 + pulse * 0.6, (1 + pulse * 0.6) * 1.4, 1 + pulse * 0.6);
    aura.rotation.set(PI / 2 + Math.sin(t * 0.8) * 0.25, 0, 0);
    aura.scale.setScalar(1 + pulse * 0.4 + Math.sin(t * 2) * 0.03);
    for (let i = 0; i < 3; i++) {
      const a = A.rot * 1.4 + i * TAU / 3;
      shards[i].position.set(Math.cos(a) * 2.0, CY - 0.3 + Math.sin(t * 2 + i * 2) * 0.3, Math.sin(a) * 2.0);
      shards[i].rotation.set(0, -a, 0.25);
    }
  }
  update({ t: 0 });
  return { root, height, update };
}

// ============ 泉水 ============
export function buildFountain(team) {
  const tc = teamColor(team);
  const root = grp(null);
  const stone = matL('#b3ada2'), stoneD = matL(STONE_D);
  const glow = matGlow(tc), teamL = shade(tc, 1.45);
  // 平台：顶面 y≈0.06，边缘贴地
  recv(add(root, merged('ft_plat', [
    [G.cyl(9.6, 10, 0.1, 40), [0, 0.01, 0]],
    [G.cyl(6.3, 6.3, 0.04, 32), [0, 0.07, 0]],
  ]), stone));
  const rings = add(root, merged('ft_rings', [
    [G.ring(9.15, 9.5, 48), [0, 0.075, 0]],
    [G.ring(6.0, 6.25, 40), [0, 0.1, 0]],
  ]), matGlow(tc, 0.75));
  noShadow(rings);
  // 中心浅池：石沿 + 水面（可站人）
  recv(add(root, G.tor(3.3, 0.22, 5, 24), stoneD, [0, 0.1, 0], [PI / 2, 0, 0], [1, 1, 0.6]));
  const water = add(root, G.circle(3.15, 24), matGlow(teamL, 0.5), [0, 0.12, 0]);
  noShadow(water);
  // 六根立柱 + 柱顶光球
  const pil = [], orbs = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + PI / 6, sx = Math.sin(a) * 5.5, cz = Math.cos(a) * 5.5;
    pil.push([G.cyl(0.32, 0.45, 2.6, 6), [sx, 1.3, cz]]);
    pil.push([G.box(0.85, 0.22, 0.85), [sx, 2.66, cz], [0, a, 0]]);
    pil.push([G.cyl(0.55, 0.6, 0.18, 6), [sx, 0.09, cz]]);
    orbs.push([G.ico(0.3, 0), [sx, 3.1, cz]]);
  }
  add(root, merged('ft_pillar', pil), stone);
  const orbM = add(root, merged('ft_orb', orbs), glow);
  // 三根弯角托起悬浮晶体（不挡中心）
  const horns = [];
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * TAU, sx = Math.sin(a), cz = Math.cos(a);
    horns.push([G.cone(0.32, 2.6, 5), [sx * 3.0, 1.25, cz * 3.0], [-cz * 0.35, 0, sx * 0.35]]);
    horns.push([G.cone(0.2, 1.7, 5), [sx * 2.35, 3.1, cz * 2.35], [-cz * 0.85, 0, sx * 0.85]]);
  }
  add(root, merged('ft_horn', horns), matS(GOLD, 0.7, 0.35));
  const cg = grp(root, 0, 4.6, 0);
  const crys = add(cg, G.oct(0.85), matS(teamL, 0.15, 0.3, 0.5), null, null, [1, 1.7, 1]);
  const halo = add(cg, G.tor(1.5, 0.07, 4, 24), matGlow(teamL, 0.8));
  const beam = add(root, G.cyl(0.55, 1.4, 4.2, 12, ), matGlow(teamL, 0.18), [0, 2.2, 0]);
  noShadow(halo, beam);

  const A = { time: 0, rot: 0 };
  function update(s) {
    s = s || EMPTY_STATE;
    const dt = getDt(s);
    A.time += dt;
    const t = s.t !== undefined ? s.t : A.time;
    let pulse = 0;
    if (s.act === 'attack' || s.act === 'cast') pulse = bump(actP(s), 0, 0.6);
    A.rot += dt * (0.5 + pulse * 3);
    cg.position.y = 4.6 + Math.sin(t * 1.1) * 0.2;
    crys.rotation.y = A.rot;
    const cs = 1 + pulse * 0.35;
    crys.scale.set(cs, cs * 1.7, cs);
    halo.rotation.set(PI / 2 + Math.sin(t * 0.9) * 0.3, 0, A.rot);
    halo.scale.setScalar(1 + pulse * 0.5);
    beam.scale.set(1 + Math.sin(t * 2) * 0.06 + pulse * 0.5, 1, 1 + Math.sin(t * 2) * 0.06 + pulse * 0.5);
    orbM.position.y = Math.sin(t * 1.5) * 0.08;
    water.scale.setScalar(1 + Math.sin(t * 1.3) * 0.01);
  }
  update({ t: 0 });
  return { root, height: 5.5, update };
}
