// 英雄技能与被动的具体实现（按英雄 id）。数值规格见 data/heroes.js
// 钩子：init / modifyAttack / onAttackHit / onSkillHit / onDamaged / onTick / onCast / canCast / glow / s1 s2 s3
import { dealDamage, heal, addShield, stun, root, freeze, slow, knockup, displace } from './combat.js';
import { calcVal } from '../data/heroes.js';
import { dist, norm, clamp } from '../util/math.js';

// —— 通用工具 ——
export function enemiesInCircle(h, x, y, r) {
  return h.world.queryUnits(x, y, r + 3.5, (u) => h.isEnemy(u) && u.targetable && !u.isStructure && dist(x, y, u.x, u.y) <= r + u.radius);
}
export function alliesInCircle(h, x, y, r) {
  return h.world.queryUnits(x, y, r + 1, (u) => u.kind === 'hero' && u.team === h.team && !u.dead && dist(x, y, u.x, u.y) <= r + u.radius);
}
export function fx(w, name, o) { w.emit(Object.assign({ type: 'fx', name }, o)); }
const pval = (h, name) => calcVal(h.def.passive.vals[name], h, 1);
const accent = (h) => h.def.colors.accent;

/** 技能伤害：统一走这里，触发装备被动（冰霜、回响）与英雄被动 onSkillHit */
export function skillHit(ctx, u, amount, type = 'magic', opts = {}) {
  const h = ctx.hero, w = ctx.world;
  if (!u || u.dead || !u.targetable) return 0;
  const dealt = dealDamage(w, h, u, amount, type, Object.assign({ skill: true }, opts));
  if (u.isStructure) return dealt;
  if (!u.dead) {
    if (h.hasPassive('frost')) slow(w, h, u, 0.25, 1.5, 'frost_item');
  }
  if (h.hasPassive('echo') && !(h.icd.echo > w.time)) {
    h.icd.echo = w.time + 6;
    const dmg = 150 + 10 * h.level + 0.35 * h.stats.ap;
    fx(w, 'burst', { x: u.x, y: u.y, r: 2.5, color: '#a77dff' });
    for (const e of enemiesInCircle(h, u.x, u.y, 2.5)) dealDamage(w, h, e, dmg, 'magic', { skill: true, aoe: true });
  }
  if (h.impl.onSkillHit && !u.dead) h.impl.onSkillHit(h, u, ctx, opts);
  return dealt;
}

/** 自身位移：冲刺 / 跳跃。opts: hit(u) 路径命中、onEnd、passWalls、follow、stopDist、leap、hitRadius */
export function dash(h, tx, ty, speed, opts = {}) {
  const w = h.world;
  const p = opts.passWalls ? { x: tx, y: ty } : w.nav.clipMove(h.x, h.y, tx, ty);
  h.windup = 0; h.windupTarget = null; h.path = null;
  h.forced = {
    tx: p.x, ty: p.y, sx: h.x, sy: h.y, speed, self: true,
    hit: opts.hit || null, hitRadius: opts.hitRadius, onEnd: opts.onEnd || null,
    passWalls: !!opts.passWalls, follow: opts.follow || null, stopDist: opts.stopDist || 0,
    leap: !!opts.leap, maxTime: opts.maxTime || 1.6,
  };
  h.faceTo(p.x, p.y);
  w.emit({ type: 'dash', unit: h.id, x: h.x, y: h.y, x2: p.x, y2: p.y, color: opts.color || accent(h), leap: !!opts.leap });
}

/** 指向型飞行物 */
export function skillshot(ctx, o) {
  const h = ctx.hero;
  const dx = o.dx ?? ctx.aim.dx, dy = o.dy ?? ctx.aim.dy;
  return ctx.world.spawnProjectile(Object.assign({
    owner: h, team: h.team, x: h.x + dx * 0.6, y: h.y + dy * 0.6, dx, dy,
    range: ctx.def.range, width: ctx.def.width || 1, speed: 25, pierce: false, color: accent(h),
    filter: (u) => h.isEnemy(u) && u.targetable && !u.isStructure,
  }, o));
}

/** 地面区域（延迟爆发 / 持续区域） */
export function area(ctx, o) {
  const h = ctx.hero;
  return ctx.world.addArea(Object.assign({
    owner: h, team: h.team, x: ctx.aim.x, y: ctx.aim.y, radius: ctx.def.radius, color: accent(h),
  }, o));
}

function circleHit(ctx, x, y, r, dmg, type, extra) {
  const out = [];
  for (const u of enemiesInCircle(ctx.hero, x, y, r)) {
    skillHit(ctx, u, dmg, type, { aoe: true });
    if (extra && !u.dead) extra(u);
    out.push(u);
  }
  return out;
}

// —— 各英雄 ——
export const SKILL_IMPL = {
  // 烈锋：战意叠层；疾风斩可二段；断空斩斩杀
  liefeng: {
    onAttackHit(h, t) { if (t.kind === 'hero') zhanyi(h); },
    onSkillHit(h, u) { if (u.kind === 'hero') zhanyi(h); },
    glow(h) { const b = h.hasBuff('zhanyi'); return b && b.stacks >= 5; },
    s1(ctx) {
      const h = ctx.hero;
      const dmg = ctx.val('dmg');
      const rc = h.hasBuff('lf_recast');
      if (rc) { rc.used = true; h.removeBuff('lf_recast'); h.mp += h.skillCost(0); }
      else {
        const full = ctx.skill.cdLeft, sk = ctx.skill;
        sk.cdLeft = 0.5;
        h.addBuff({ key: 'lf_recast', dur: 3, visual: 'recast', onExpire: (u, b) => { if (!b.used) sk.cdLeft = Math.max(sk.cdLeft, full - 3); } });
      }
      dash(h, ctx.aim.x, ctx.aim.y, 24, { hitRadius: ctx.def.width * 0.5 + 0.3, hit: (u) => { skillHit(ctx, u, dmg, 'phys'); } });
    },
    s2(ctx) {
      const h = ctx.hero, w = ctx.world;
      fx(w, 'spin', { x: h.x, y: h.y, r: ctx.def.radius, color: accent(h), unit: h.id });
      let n = 0;
      for (const u of circleHit(ctx, h.x, h.y, ctx.def.radius, ctx.val('dmg'), 'phys')) if (u.kind === 'hero') n++;
      if (n) heal(w, h, h, ctx.val('heal') * n);
    },
    s3(ctx) {
      const h = ctx.hero, w = ctx.world, t = ctx.aim.target;
      const dmg = ctx.val('dmg');
      dash(h, t.x, t.y, 32, { follow: t, stopDist: h.radius + t.radius + 0.2, passWalls: true, leap: true, onEnd: () => {
        if (t.dead || !t.targetable) return;
        fx(w, 'slash', { x: t.x, y: t.y, r: 3.2, angle: h.facing, color: '#ffdf6b', big: true });
        skillHit(ctx, t, dmg + (t.stats.maxHp - t.hp) * 0.25, 'phys');
        if (!t.dead) slow(w, h, t, 0.5, 2);
      } });
    },
  },

  // 狂狼：扑击、狼嚎、狂化（普攻溅射）
  kuanglang: {
    onAttackHit(h, t, res) {
      if (!h.hasBuff('kl_rage') || t.isStructure) return;
      for (const u of enemiesInCircle(h, t.x, t.y, 2.5)) if (u !== t) dealDamage(h.world, h, u, res.amount * 0.5, 'phys', { aoe: true, noVamp: true });
    },
    glow(h) { return !!h.hasBuff('kl_rage'); },
    s1(ctx) {
      const h = ctx.hero, w = ctx.world, dmg = ctx.val('dmg'), r = ctx.def.radius;
      dash(h, ctx.aim.x, ctx.aim.y, 20, { leap: true, onEnd: () => {
        fx(w, 'ring', { x: h.x, y: h.y, r, color: '#d64045' });
        circleHit(ctx, h.x, h.y, r, dmg, 'phys', (u) => slow(w, h, u, 0.35, 1.5));
      } });
    },
    s2(ctx) {
      const h = ctx.hero, w = ctx.world, r = ctx.def.radius;
      fx(w, 'roar', { x: h.x, y: h.y, r, color: '#d64045', unit: h.id });
      circleHit(ctx, h.x, h.y, r, ctx.val('dmg'), 'magic', (u) => slow(w, h, u, 0.4, 2));
      h.addBuff({ key: 'kl_howl', dur: 3, mods: { msPct: 0.3 }, visual: 'haste' });
    },
    s3(ctx) {
      const h = ctx.hero, w = ctx.world;
      h.addBuff({ key: 'kl_rage', dur: 8, mods: { asBonus: 0.5, lifesteal: 0.2, ms: 0.8 }, visual: 'rage' });
      addShield(w, h, h, ctx.val('shield'), 8, 'kl_shield');
      fx(w, 'ring', { x: h.x, y: h.y, r: 4, color: '#ff3b3b' });
    },
  },

  // 影刃：暗袭普攻；影步瞬身；飞镖；绝影杀击杀刷新
  yingren: {
    init(h) { h.ps.ambushAt = 0; },
    glow(h) { return h.world.time >= h.ps.ambushAt; },
    modifyAttack(h, t, res) {
      if (h.world.time >= h.ps.ambushAt && !t.isStructure) {
        h.ps.ambushAt = h.world.time + 6;
        res.amount += pval(h, 'pdmg'); res.ambush = true;
      }
    },
    onAttackHit(h, t, res) {
      if (res.ambush) { slow(h.world, h, t, 0.3, 1.5); fx(h.world, 'slash', { x: t.x, y: t.y, r: 2.2, angle: h.facing, color: '#b07cff' }); }
    },
    s1(ctx) {
      const h = ctx.hero, w = ctx.world, r = ctx.def.radius;
      const p = w.nav.blinkTarget(h.x, h.y, ctx.aim.x, ctx.aim.y);
      fx(w, 'blink', { x: h.x, y: h.y, x2: p.x, y2: p.y, color: '#b07cff', unit: h.id });
      h.x = p.x; h.y = p.y; h.px = p.x; h.py = p.y; h.path = null;
      fx(w, 'ring', { x: p.x, y: p.y, r, color: '#b07cff' });
      circleHit(ctx, p.x, p.y, r, ctx.val('dmg'), 'phys');
      h.atkTimer = 0;
    },
    s2(ctx) {
      const h = ctx.hero, dmg = ctx.val('dmg');
      const hitOnce = new Set();
      const base = Math.atan2(ctx.aim.dy, ctx.aim.dx), sp = (ctx.def.spread * Math.PI) / 180 / 2;
      for (const a of [-sp, 0, sp]) {
        skillshot(ctx, { dx: Math.cos(base + a), dy: Math.sin(base + a), speed: 28, style: 'shuriken', color: '#b07cff', onHit: (u) => {
          skillHit(ctx, u, hitOnce.has(u.id) ? dmg * 0.5 : dmg, 'phys');
          hitOnce.add(u.id);
          return 'stop';
        } });
      }
    },
    s3(ctx) {
      const h = ctx.hero, w = ctx.world, t = ctx.aim.target, sk = ctx.skill;
      const dmg = ctx.val('dmg');
      fx(w, 'blink', { x: h.x, y: h.y, x2: t.x, y2: t.y, color: '#b07cff', unit: h.id });
      dash(h, t.x, t.y, 40, { follow: t, stopDist: h.radius + t.radius + 0.1, passWalls: true, onEnd: () => {
        if (t.dead || !t.targetable) return;
        fx(w, 'slash', { x: t.x, y: t.y, r: 3, angle: h.facing, color: '#d9b3ff', big: true });
        skillHit(ctx, t, t.hp < t.stats.maxHp * 0.5 ? dmg * 1.3 : dmg, 'phys');
        if (t.dead) { sk.cdLeft = 0; fx(w, 'refresh', { x: h.x, y: h.y, unit: h.id, color: '#b07cff' }); }
      } });
    },
  },

  // 炎姬：技能点燃；火球、炎阵眩晕、陨星三连
  yanji: {
    onSkillHit(h, u) {
      const total = pval(h, 'burn');
      u.addBuff({ key: 'yj_burn', src: h, perSource: true, dur: 3, tickEvery: 1, visual: 'burn',
        tick: (t) => dealDamage(h.world, h, t, total / 3, 'magic', { noVamp: true }) });
    },
    s1(ctx) {
      const h = ctx.hero, w = ctx.world, dmg = ctx.val('dmg');
      skillshot(ctx, { speed: 24, style: 'fireball', color: '#ff7b2e', onHit: (u, p) => {
        fx(w, 'explosion', { x: p.x, y: p.y, r: 2.2, color: '#ff7b2e' });
        circleHit(ctx, p.x, p.y, 2.2, dmg, 'magic');
        return 'stop';
      } });
    },
    s2(ctx) {
      const w = ctx.world, h = ctx.hero, dmg = ctx.val('dmg'), r = ctx.def.radius;
      area(ctx, { delay: 0.75, visual: 'firecircle', color: '#ff5a1f', onTrigger: (a) => {
        fx(w, 'explosion', { x: a.x, y: a.y, r, color: '#ff5a1f' });
        circleHit(ctx, a.x, a.y, r, dmg, 'magic', (u) => stun(w, h, u, 1));
      } });
    },
    s3(ctx) {
      const w = ctx.world, dmg = ctx.val('dmg'), r = ctx.def.radius;
      area(ctx, { delay: 0.6, dur: 1.25, tickEvery: 0.6, visual: 'meteor', color: '#ff3d00', onTick: (a) => {
        for (let i = 0; i < 4; i++) {
          const ang = w.rng.next() * Math.PI * 2, rr = Math.sqrt(w.rng.next()) * r * 0.8;
          fx(w, 'meteor', { x: a.x + Math.cos(ang) * rr, y: a.y + Math.sin(ang) * rr, r: 1.6, color: '#ff6b1a' });
        }
        fx(w, 'explosion', { x: a.x, y: a.y, r, color: '#ff3d00', soft: true });
        circleHit(ctx, a.x, a.y, r, dmg, 'magic');
      } });
    },
  },

  // 霜语：技能附带减速；冰锥穿透、冰晶冻结、暴风雪
  shuangyu: {
    onSkillHit(h, u) { slow(h.world, h, u, 0.2, 1.5, 'sy_frost'); },
    s1(ctx) {
      const h = ctx.hero, w = ctx.world, dmg = ctx.val('dmg');
      skillshot(ctx, { speed: 26, pierce: true, style: 'icelance', color: '#9be7ff', onHit: (u) => {
        skillHit(ctx, u, dmg, 'magic');
        if (!u.dead) slow(w, h, u, 0.3, 1.5);
      } });
    },
    s2(ctx) {
      const w = ctx.world, h = ctx.hero, dmg = ctx.val('dmg'), r = ctx.def.radius;
      area(ctx, { delay: 1.0, visual: 'icecage', color: '#9be7ff', onTrigger: (a) => {
        fx(w, 'icecrack', { x: a.x, y: a.y, r, color: '#bdf0ff' });
        circleHit(ctx, a.x, a.y, r, dmg, 'magic', (u) => freeze(w, h, u, 1.2));
      } });
    },
    s3(ctx) {
      const w = ctx.world, h = ctx.hero, dmg = ctx.val('dmg'), r = ctx.def.radius;
      area(ctx, { delay: 0.25, dur: 4, tickEvery: 0.5, visual: 'blizzard', color: '#dff6ff', onTick: (a) => {
        circleHit(ctx, a.x, a.y, r, dmg, 'magic', (u) => slow(w, h, u, 0.5, 1, 'blizzard'));
      } });
    },
  },

  // 逐风：三连击强化；穿云箭、风之步、天罚之箭
  zhufeng: {
    init(h) { h.ps.count = 0; },
    glow(h) { return h.ps.count >= 2; },
    modifyAttack(h, t, res) {
      h.ps.count++;
      if (h.ps.count >= 3) { h.ps.count = 0; res.amount *= 1.5; res.empowered = true; }
    },
    onAttackHit(h, t, res) { if (res.empowered && !t.isStructure) slow(h.world, h, t, 0.25, 1.5); },
    s1(ctx) {
      const dmg = ctx.val('dmg');
      skillshot(ctx, { speed: 34, pierce: true, style: 'arrowBig', color: '#a3e635', onHit: (u) => { skillHit(ctx, u, dmg, 'phys'); } });
    },
    s2(ctx) {
      const h = ctx.hero;
      h.addBuff({ key: 'zf_wind', dur: 4, mods: { asBonus: ctx.val('as') / 100, msPct: 0.25 }, visual: 'haste' });
      fx(ctx.world, 'ring', { x: h.x, y: h.y, r: 2.5, color: '#a3e635' });
    },
    s3(ctx) {
      const h = ctx.hero, w = ctx.world, dmg = ctx.val('dmg');
      skillshot(ctx, { speed: 32, width: ctx.def.width, style: 'ultArrow', color: '#d9ff6a',
        filter: (u) => h.isEnemy(u) && u.kind === 'hero' && u.targetable,
        onHit: (u, p) => {
          const st = 1 + 1.5 * clamp(p.traveled / 40, 0, 1);
          fx(w, 'explosion', { x: u.x, y: u.y, r: 2, color: '#d9ff6a' });
          skillHit(ctx, u, dmg, 'phys');
          if (!u.dead) stun(w, h, u, st);
          return 'stop';
        } });
    },
  },

  // 雷火：普攻溅射；翻滚强化、榴弹、弹幕
  leihuo: {
    glow(h) { return !!h.hasBuff('lh_roll'); },
    modifyAttack(h, t, res) {
      const b = h.hasBuff('lh_roll');
      if (b) { res.amount += b.data.dmg; res.roll = true; h.removeBuff('lh_roll'); }
    },
    onAttackHit(h, t, res) {
      const w = h.world;
      for (const u of enemiesInCircle(h, t.x, t.y, 2.2)) if (u !== t) dealDamage(w, h, u, res.amount * 0.4, 'phys', { aoe: true, noVamp: true, noEvent: u.kind !== 'hero' });
      if (res.roll) fx(w, 'explosion', { x: t.x, y: t.y, r: 1.6, color: '#ffd23f' });
    },
    s1(ctx) {
      const h = ctx.hero;
      dash(h, ctx.aim.x, ctx.aim.y, 18, { color: '#ffd23f' });
      h.addBuff({ key: 'lh_roll', dur: 3, data: { dmg: ctx.val('dmg') }, visual: 'empower' });
      h.atkTimer = Math.min(h.atkTimer, 0.05);
    },
    s2(ctx) {
      const h = ctx.hero, w = ctx.world, dmg = ctx.val('dmg'), r = ctx.def.radius;
      w.spawnProjectile({ owner: h, team: h.team, x: h.x, y: h.y, tx: ctx.aim.x, ty: ctx.aim.y, lob: true, speed: 18, style: 'grenade', color: '#ffd23f',
        onArrive: (p) => {
          fx(w, 'explosion', { x: p.x, y: p.y, r, color: '#ffb000' });
          circleHit(ctx, p.x, p.y, r, dmg, 'phys', (u) => slow(w, h, u, 0.4, 1.5));
        } });
    },
    s3(ctx) {
      const h = ctx.hero, w = ctx.world, dmg = ctx.val('dmg');
      const base = Math.atan2(ctx.aim.dy, ctx.aim.dx), sp = (ctx.def.spread * Math.PI) / 180;
      let n = 0, t = 0;
      h.faceTo(ctx.aim.x, ctx.aim.y);
      h.channel = { t: 1.5, lock: true, root: true, kind: 'barrage',
        update: (dt) => {
          t += dt;
          while (n < 15 && t >= n * 0.1) {
            n++;
            const a = base + (w.rng.next() - 0.5) * sp;
            h.anim.act = 'attack'; h.anim.actT = 0; h.anim.actDur = 0.1;
            skillshot(ctx, { dx: Math.cos(a), dy: Math.sin(a), speed: 36, width: 0.7, style: 'tracer', color: '#ffe066', onHit: (u) => {
              skillHit(ctx, u, dmg, 'phys', { aoe: true });
              return 'stop';
            } });
          }
        } };
    },
  },

  // 灵泉：光环回血；治愈之泉、灵缚禁锢、团队护盾
  lingquan: {
    onTick(h, dt) {
      h.ps.t = (h.ps.t || 0) - dt;
      if (h.ps.t > 0) return;
      h.ps.t = 1;
      const r = pval(h, 'regen');
      for (const a of alliesInCircle(h, h.x, h.y, 7)) heal(h.world, h, a, r, true);
    },
    s1(ctx) {
      const h = ctx.hero, w = ctx.world, r = ctx.def.radius, hv = ctx.val('heal'), dmg = ctx.val('dmg');
      area(ctx, { delay: 0.3, visual: 'spring', color: '#7ef0d0', onTrigger: (a) => {
        fx(w, 'fountain', { x: a.x, y: a.y, r, color: '#7ef0d0' });
        for (const u of alliesInCircle(h, a.x, a.y, r)) heal(w, h, u, hv);
        circleHit(ctx, a.x, a.y, r, dmg, 'magic');
      } });
    },
    s2(ctx) {
      const h = ctx.hero, w = ctx.world, dmg = ctx.val('dmg');
      skillshot(ctx, { speed: 22, style: 'vine', color: '#2fa58a', onHit: (u) => {
        skillHit(ctx, u, dmg, 'magic');
        if (!u.dead) root(w, h, u, 1.5);
        return 'stop';
      } });
    },
    s3(ctx) {
      const h = ctx.hero, w = ctx.world, sh = ctx.val('shield');
      fx(w, 'ring', { x: h.x, y: h.y, r: ctx.def.radius, color: '#7ef0d0', big: true });
      for (const u of alliesInCircle(h, h.x, h.y, ctx.def.radius)) {
        addShield(w, h, u, sh, 4, 'lq_shield');
        u.addBuff({ key: 'lq_haste', dur: 2, mods: { msPct: 0.3 }, visual: 'haste' });
      }
    },
  },

  // 镇岳：施法得护盾；锁链钩、怒吼、镇魂钟
  zhenyue: {
    onCast(h) { addShield(h.world, h, h, pval(h, 'shield'), 3, 'zy_shield'); },
    s1(ctx) {
      const h = ctx.hero, w = ctx.world, dmg = ctx.val('dmg');
      skillshot(ctx, { speed: 28, style: 'chain', color: '#ffd166', onHit: (u) => {
        skillHit(ctx, u, dmg, 'magic');
        if (!u.dead && !u.ccImmune) {
          const n = norm(u.x - h.x, u.y - h.y);
          const d = h.radius + u.radius + 0.4;
          displace(w, u, h.x + n.x * d, h.y + n.y * d, 26, { onEnd: () => stun(w, h, u, 0.6) });
        }
        return 'stop';
      } });
    },
    s2(ctx) {
      const h = ctx.hero, w = ctx.world, r = ctx.def.radius;
      fx(w, 'roar', { x: h.x, y: h.y, r, color: '#ffd166', unit: h.id });
      circleHit(ctx, h.x, h.y, r, ctx.val('dmg'), 'magic', (u) => slow(w, h, u, 0.4, 2));
      h.addBuff({ key: 'zy_roar', dur: 4, mods: { armorPct: 0.3, mrPct: 0.3 }, visual: 'harden' });
    },
    s3(ctx) {
      const h = ctx.hero, w = ctx.world, r = ctx.def.radius, dmg = ctx.val('dmg');
      area(ctx, { x: h.x, y: h.y, follow: h, delay: 0.5, visual: 'bell', color: '#ffd166', onTrigger: (a) => {
        fx(w, 'ring', { x: a.x, y: a.y, r, color: '#ffd166', big: true });
        circleHit(ctx, a.x, a.y, r, dmg, 'magic', (u) => knockup(w, h, u, 1));
      } });
    },
  },

  // 岩罡：低血护盾；冲锋击飞、岩崩、跳砸
  yangang: {
    onDamaged(h) {
      if (h.dead || h.hp >= h.stats.maxHp * 0.4 || h.icd.rock > h.world.time) return;
      h.icd.rock = h.world.time + 60;
      addShield(h.world, h, h, pval(h, 'shield'), 5, 'yg_rock');
    },
    s1(ctx) {
      const h = ctx.hero, w = ctx.world, dmg = ctx.val('dmg');
      dash(h, ctx.aim.x, ctx.aim.y, 20, { hitRadius: ctx.def.width * 0.5 + 0.3, hit: (u) => {
        skillHit(ctx, u, dmg, 'phys');
        if (u.kind === 'hero') {
          if (!u.dead) knockup(w, h, u, 0.75);
          fx(w, 'ring', { x: u.x, y: u.y, r: 2, color: '#ff9f1c' });
          return 'stop';
        }
      } });
    },
    s2(ctx) {
      const h = ctx.hero, w = ctx.world, r = ctx.def.radius;
      fx(w, 'quake', { x: h.x, y: h.y, r, color: '#ff9f1c' });
      circleHit(ctx, h.x, h.y, r, ctx.val('dmg'), 'magic', (u) => slow(w, h, u, 0.35, 2));
      h.addBuff({ key: 'yg_rock2', dur: 3, mods: { dmgReduce: 0.25 }, visual: 'harden' });
    },
    s3(ctx) {
      const h = ctx.hero, w = ctx.world, r = ctx.def.radius, dmg = ctx.val('dmg');
      const d = dist(h.x, h.y, ctx.aim.x, ctx.aim.y);
      area(ctx, { delay: Math.max(0.35, d / 16), visual: 'telegraph', color: '#ff9f1c' });
      dash(h, ctx.aim.x, ctx.aim.y, Math.max(10, d / Math.max(0.35, d / 16)), { passWalls: true, leap: true, onEnd: () => {
        fx(w, 'quake', { x: h.x, y: h.y, r, color: '#ff9f1c', big: true });
        circleHit(ctx, h.x, h.y, r, dmg, 'phys', (u) => knockup(w, h, u, 1.25));
      } });
    },
  },
};

function zhanyi(h) {
  h.addBuff({ key: 'zhanyi', dur: 4, maxStacks: 5, mods: { adPct: 0.04 }, visual: 'stack' });
}
