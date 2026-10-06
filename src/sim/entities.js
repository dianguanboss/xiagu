// 小兵、防御塔/水晶、泉水、野怪、飞行物、地面区域
import { Unit } from './unit.js';
import { MINIONS, TOWER_VS_MINION, TOWERS_STATS, TOWER_RAMP, TOWER_RAMP_MAX, FOUNTAIN_STATS, MONSTERS, MONSTER_LEASH, MONSTER_SCALE_PER_MIN } from '../data/units.js';
import { LANES } from '../data/map.js';
import { VISION, TIMING } from '../config.js';
import { dealDamage } from './combat.js';
import { dist, dist2, pointAlong, projectOnPolyline, segDist2 } from '../util/math.js';

// —— 小兵 ——
export class Minion extends Unit {
  constructor(world, team, lane, mtype, scale = 0, empowered = false) {
    const L = LANES[lane];
    const startAlong = team === 1 ? 6 : L.length - 6;
    const p = pointAlong(L.pts, L.acc, startAlong);
    super(world, 'minion', team, p.x, p.y);
    const d = MINIONS[mtype];
    this.mtype = mtype; this.lane = lane; this.def = d;
    this.dir = team === 1 ? 1 : -1;
    this.along = startAlong;
    this.offset = 0;
    this.radius = d.radius;
    this.sight = d.sight || VISION.minion;
    this.ranged = d.range > 3;
    this.projStyle = mtype === 'siege' ? 'cannon' : 'minion';
    this.projSpeed = d.projSpeed || 20;
    this.windupFrac = 0.35;
    const k = 1 + scale;
    const emp = empowered ? 1.35 : 1;
    const s = this.base;
    s.maxHp = d.hp * k * emp; s.ad = d.ad * k * emp; s.armor = d.armor; s.mr = d.mr;
    s.range = d.range; s.interval = d.interval; s.ms = d.ms;
    this.empowered = empowered;
    this.recalc();
    this.hp = this.stats.maxHp;
    this.gold = d.gold; this.xp = d.xp;
    this.target = null; this.retargetT = 0;
    this.aggroHero = null; this.aggroT = 0;
    this.mass = mtype === 'siege' || mtype === 'super' ? 3 : 1;
  }
  attackDamage(t) {
    let a = this.stats.ad;
    if (t.isStructure && this.def.towerMul) a *= this.def.towerMul;
    return { amount: a, type: 'phys', crit: false };
  }
  pickTarget() {
    const w = this.world;
    // 被敌方英雄攻击我方英雄时会转火（仇恨）
    if (this.aggroHero && (this.aggroT < w.time || !this.canAttackUnit(this.aggroHero) || dist(this.x, this.y, this.aggroHero.x, this.aggroHero.y) > 10)) this.aggroHero = null;
    if (this.aggroHero) return this.aggroHero;
    let best = null, bs = 1e9;
    for (const u of w.queryUnits(this.x, this.y, 9.5, (u) => this.canAttackUnit(u))) {
      const d = dist(this.x, this.y, u.x, u.y);
      // 优先：小兵 > 建筑 > 野怪 > 英雄
      const pri = u.kind === 'minion' ? 0 : u.isStructure ? 1 : u.kind === 'hero' ? 3 : 2;
      const sc = pri * 30 + d;
      if (sc < bs) { bs = sc; best = u; }
    }
    return best;
  }
  update(dt) {
    if (this.dead) return;
    this.baseUpdate(dt);
    const w = this.world;
    this.retargetT -= dt;
    if (this.target && (!this.canAttackUnit(this.target) || dist(this.x, this.y, this.target.x, this.target.y) > 12)) this.target = null;
    if (this.retargetT <= 0 || !this.target) {
      this.retargetT = 0.5;
      const nt = this.pickTarget();
      if (nt && (!this.target || this.windup <= 0)) this.target = nt;
    }
    if (this.forced || this.stunned) { this.updateAttack(dt); return; }
    const t = this.target;
    if (t) {
      if (this.inRange(t, 0.05)) { this.startAttack(t); }
      else if (this.windup <= 0) {
        const stop = this.stats.range + this.radius + t.radius - 0.15;
        if (w.nav.los(this.x, this.y, t.x, t.y)) this.moveToward(t.x, t.y, dt, stop);
        else this.walkLane(dt);
      }
    } else if (this.windup <= 0) {
      this.walkLane(dt);
    }
    this.updateAttack(dt);
  }
  walkLane(dt) {
    const L = LANES[this.lane];
    const pr = projectOnPolyline(L.pts, L.acc, this.x, this.y);
    this.along = pr.along;
    const ahead = Math.max(0, Math.min(L.length, pr.along + this.dir * 4));
    const p = pointAlong(L.pts, L.acc, ahead);
    // 每个兵在路宽内有自己的偏移，避免排成一条线
    const px = -p.dir.y * this.offset, py = p.dir.x * this.offset;
    this.moveToward(p.x + px, p.y + py, dt, 0.1);
  }
}

// —— 防御塔 / 水晶 ——
export class Tower extends Unit {
  constructor(world, team, tier, lane, x, y) {
    super(world, tier === 'crystal' ? 'crystal' : 'tower', team, x, y);
    const d = TOWERS_STATS[tier];
    this.tier = tier; this.lane = lane; this.def = d;
    this.isStructure = true; this.mobile = false;
    this.radius = d.radius;
    this.sight = tier === 'crystal' ? VISION.crystal : VISION.tower;
    const s = this.base;
    s.maxHp = d.hp; s.ad = d.ad; s.armor = d.armor; s.mr = d.mr; s.range = d.range; s.interval = d.interval; s.ms = 0;
    this.recalc();
    this.hp = this.stats.maxHp;
    this.ranged = true;
    this.projStyle = 'tower'; this.projSpeed = 26;
    this.windupFrac = 0.15;
    this.target = null;
    this.rampTarget = null; this.ramp = 0;
    this.protected = tier !== 'outer';   // 前一座塔没倒之前无敌
    this.mass = 100;
  }
  get targetable() { return !this.dead && !this.protected; }
  canMove() { return false; }
  attackDamage(t) {
    if (t.kind === 'minion') return { amount: t.stats.maxHp * (TOWER_VS_MINION[t.mtype] || 0.3), type: 'true', crit: false };
    if (t.kind === 'monster') return { amount: this.stats.ad, type: 'phys', crit: false };
    // 对英雄：连续攻击同一目标伤害递增
    if (this.rampTarget === t) this.ramp = Math.min(TOWER_RAMP_MAX, this.ramp + TOWER_RAMP);
    else { this.rampTarget = t; this.ramp = 0; }
    return { amount: this.stats.ad * (1 + this.ramp), type: 'phys', crit: false };
  }
  pickTarget() {
    const w = this.world;
    const r = this.stats.range;
    const inR = (u) => this.canAttackUnit(u) && this.edgeDist(u) <= r && u.kind !== 'monster';
    // 规则：敌方英雄攻击了范围内我方英雄 → 优先打该英雄
    let call = null;
    for (const h of w.heroes) {
      if (h.team !== this.team || h.dead) continue;
      if (dist(h.x, h.y, this.x, this.y) > r + 2) continue;
      for (const [id, t] of h.damagedBy) {
        if (w.time - t > 0.6) continue;
        const e = w.unitById(id);
        if (e && e.kind === 'hero' && inR(e)) { call = e; break; }
      }
      if (call) break;
    }
    if (call) return call;
    if (this.target && inR(this.target)) return this.target;
    let best = null, bs = 1e9;
    for (const u of w.queryUnits(this.x, this.y, r + 4, inR)) {
      const pri = u.kind === 'minion' ? (u.mtype === 'siege' ? 1 : 0) : 2;
      const sc = pri * 100 + dist(this.x, this.y, u.x, u.y);
      if (sc < bs) { bs = sc; best = u; }
    }
    return best;
  }
  update(dt) {
    if (this.dead) return;
    this.baseUpdate(dt);
    const t = this.pickTarget();
    if (t !== this.target) { this.target = t; if (!t || t !== this.rampTarget) { this.ramp = 0; this.rampTarget = null; } }
    if (t) this.startAttack(t);
    this.updateAttack(dt);
    // 水晶缓慢回血
    if (this.tier === 'crystal' && this.world.time - this.lastDamagedAt > 8) this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.01 * dt);
  }
}

// —— 泉水（高伤害炮台，防止推进到泉水）——
export class Fountain extends Unit {
  constructor(world, team, x, y) {
    super(world, 'fountain', team, x, y);
    this.isStructure = true; this.mobile = false; this.untargetable = true; this.invuln = true;
    this.radius = 2;
    this.sight = VISION.fountain;
    this.base.ad = FOUNTAIN_STATS.damage; this.base.range = FOUNTAIN_STATS.range; this.base.interval = FOUNTAIN_STATS.interval;
    this.recalc(); this.hp = 1;
    this.ranged = true; this.projStyle = 'fountain'; this.projSpeed = 40; this.windupFrac = 0.1;
  }
  attackDamage() { return { amount: this.stats.ad, type: 'true', crit: false }; }
  canMove() { return false; }
  update(dt) {
    this.baseUpdate(dt);
    if (this.atkTimer <= 0 && this.windup <= 0) {
      const ts = this.world.queryUnits(this.x, this.y, this.stats.range + 2, (u) => this.canAttackUnit(u) && this.edgeDist(u) <= this.stats.range);
      if (ts.length) this.startAttack(ts[0]);
    }
    this.updateAttack(dt);
  }
}

// —— 野怪 ——
export class Monster extends Unit {
  constructor(world, camp, mtype, ox, oy) {
    super(world, 'monster', 0, camp.x + ox, camp.y + oy);
    const d = MONSTERS[mtype];
    this.mtype = mtype; this.def = d; this.camp = camp;
    this.homeX = this.x; this.homeY = this.y;
    this.radius = d.radius;
    this.ranged = !!d.ranged || d.range > 3.5;
    this.projStyle = 'monster'; this.projSpeed = 18;
    this.boss = !!d.boss; this.ccImmune = this.boss;
    this.windupFrac = 0.4;
    const k = 1 + MONSTER_SCALE_PER_MIN * (world.time / 60);
    const s = this.base;
    s.maxHp = d.hp * k; s.ad = d.ad * k; s.armor = d.armor; s.mr = d.mr;
    s.range = d.range; s.interval = d.interval; s.ms = this.boss ? 5.5 : 6.5;
    s.hpRegen = 0;
    this.recalc(); this.hp = this.stats.maxHp;
    this.gold = d.gold; this.xp = d.xp;
    this.target = null; this.resetting = false;
    this.facing = Math.atan2(100 - this.y, 100 - this.x);
    this.mass = this.boss ? 100 : 4;
    this.sight = 0;
  }
  attackLands(t) {
    if (this.def.aoe && !t.dead) {
      const w = this.world;
      w.emit({ type: 'fx', name: 'quake', x: t.x, y: t.y, r: this.def.aoe, color: this.mtype === 'drake' ? '#ff6b35' : '#9b7bff' });
      for (const u of w.queryUnits(t.x, t.y, this.def.aoe + 2, (u) => this.canAttackUnit(u) && !u.isStructure && dist(t.x, t.y, u.x, u.y) <= this.def.aoe + u.radius)) {
        dealDamage(w, this, u, this.stats.ad * (u === t ? 1 : 0.7), 'phys', { attack: true });
      }
      w.emit({ type: 'hit', src: this.id, target: t.id, kind: 'monster', x: t.x, y: t.y });
      return;
    }
    super.attackLands(t);
  }
  onDamaged(src) {
    if (!src || this.resetting) return;
    if (!this.target || this.target.dead) this.target = src.kind === 'hero' || src.kind === 'minion' ? src : this.target;
    // 同营地的野怪一起反击
    for (const m of this.camp.members) if (m !== this && !m.dead && !m.target && !m.resetting) m.target = src;
  }
  canAttackUnit(u) {
    return u && u !== this && !u.dead && u.targetable && u.team !== 0 && !u.isStructure;
  }
  update(dt) {
    if (this.dead) return;
    this.baseUpdate(dt);
    const w = this.world;
    const dHome = dist(this.x, this.y, this.homeX, this.homeY);
    if (this.resetting) {
      this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.25 * dt);
      if (this.moveToward(this.homeX, this.homeY, dt * 1.6, 0.2) || dHome < 0.4) {
        this.resetting = false; this.hp = this.stats.maxHp;
        this.facing = Math.atan2(100 - this.y, 100 - this.x);
      }
      return;
    }
    let t = this.target;
    if (t && (t.dead || !t.targetable || dist(t.x, t.y, this.homeX, this.homeY) > MONSTER_LEASH + 3)) {
      // 换一个仍在营地附近、打过我的目标
      t = null;
      for (const [id, tm] of this.damagedBy) {
        if (w.time - tm > 4) continue;
        const e = w.unitById(id);
        if (e && this.canAttackUnit(e) && dist(e.x, e.y, this.homeX, this.homeY) < MONSTER_LEASH) { t = e; break; }
      }
      this.target = t;
    }
    if (t && (dHome > MONSTER_LEASH || (w.time - this.lastDamagedAt > 6 && !this.inRange(t, 0.2)))) t = null;
    if (!t) {
      if (dHome > 0.5 || this.hp < this.stats.maxHp) { this.target = null; this.resetting = dHome > 0.5 || w.time - this.lastDamagedAt > 3; this.damagedBy.clear(); }
      if (!this.resetting && this.hp < this.stats.maxHp && w.time - this.lastDamagedAt > 3) this.hp = this.stats.maxHp;
      this.updateAttack(dt);
      return;
    }
    if (this.forced || this.stunned) { this.updateAttack(dt); return; }
    if (this.inRange(t, 0.05)) this.startAttack(t);
    else if (this.windup <= 0) this.moveToward(t.x, t.y, dt, this.stats.range + this.radius + t.radius - 0.2);
    this.updateAttack(dt);
  }
}

// —— 飞行物 ——
// 追踪型：{ target, homing:true, onHit(target) }
// 指向型：{ dx, dy, range, width, pierce, filter(u), onHit(u, p) → 'stop', onEnd(p) }
// 抛物型：{ tx, ty, lob:true, onArrive(p) }
export class Projectile {
  constructor(world, spec) {
    Object.assign(this, spec);
    this.id = world.nextId++;
    this.world = world;
    this.px = this.x; this.py = this.y;
    this.traveled = 0;
    this.dead = false;
    this.hitSet = null;
    if (this.lob) {
      this.sx = this.x; this.sy = this.y;
      this.total = Math.max(0.5, dist(this.x, this.y, this.tx, this.ty));
    }
    if (!this.homing && !this.lob) this.angle = Math.atan2(this.dy, this.dx);
  }
  update(dt) {
    const w = this.world;
    this.px = this.x; this.py = this.y;
    const step = this.speed * dt;
    if (this.homing) {
      const t = this.target;
      if (!t || t.dead || t.removed) { this.dead = true; return; }
      const d = dist(this.x, this.y, t.x, t.y);
      this.angle = Math.atan2(t.y - this.y, t.x - this.x);
      if (d <= step + t.radius * 0.5) {
        this.x = t.x; this.y = t.y; this.dead = true;
        if (t.targetable || t.isStructure) this.onHit(t, this);
        return;
      }
      this.x += (t.x - this.x) / d * step; this.y += (t.y - this.y) / d * step;
      return;
    }
    if (this.lob) {
      const d = dist(this.x, this.y, this.tx, this.ty);
      this.angle = Math.atan2(this.ty - this.y, this.tx - this.x);
      if (d <= step) { this.x = this.tx; this.y = this.ty; this.dead = true; this.onArrive && this.onArrive(this); return; }
      this.x += (this.tx - this.x) / d * step; this.y += (this.ty - this.y) / d * step;
      this.traveled += step;
      return;
    }
    const s = Math.min(step, this.range - this.traveled);
    const ox = this.x, oy = this.y;
    this.x += this.dx * s; this.y += this.dy * s;
    this.traveled += s;
    // 扫过的线段上检测命中
    const hw = this.width * 0.5;
    const cands = w.queryUnits((ox + this.x) / 2, (oy + this.y) / 2, s / 2 + hw + 3.5, this.filter);
    cands.sort((a, b) => dist2(ox, oy, a.x, a.y) - dist2(ox, oy, b.x, b.y));
    for (const u of cands) {
      if (this.hitSet && this.hitSet.has(u.id)) continue;
      const r = hw + u.radius;
      if (segDist2(u.x, u.y, ox, oy, this.x, this.y) > r * r) continue;
      if (!this.hitSet) this.hitSet = new Set();
      this.hitSet.add(u.id);
      const res = this.onHit(u, this);
      if (res === 'stop' || !this.pierce) {
        this.x = ox + this.dx * Math.sqrt(dist2(ox, oy, u.x, u.y)); this.y = oy + this.dy * Math.sqrt(dist2(ox, oy, u.x, u.y));
        this.dead = true; this.stopped = true;
        w.emit({ type: 'projHit', id: this.id, x: this.x, y: this.y, style: this.style });
        return;
      }
    }
    if (this.traveled >= this.range - 1e-6) { this.dead = true; this.onEnd && this.onEnd(this); }
  }
}

// —— 地面区域 ——（delay 后触发 onTrigger；dur>0 时每 tickEvery 秒 onTick）
export class Area {
  constructor(world, spec) {
    Object.assign(this, { delay: 0, dur: 0, tickEvery: 0.5 }, spec);
    this.id = world.nextId++;
    this.world = world;
    this.t = 0; this.triggered = false; this.tickT = 0; this.dead = false;
  }
  update(dt) {
    if (this.follow && !this.follow.dead && !this.triggered) { this.x = this.follow.x; this.y = this.follow.y; }
    this.t += dt;
    if (!this.triggered) {
      if (this.t >= this.delay) {
        this.triggered = true;
        if (this.onTrigger) this.onTrigger(this);
        if (this.dur > 0 && this.onTick) { this.onTick(this); this.tickT = this.tickEvery; }
      }
      if (this.dur <= 0 && this.triggered) this.dead = true;
      return;
    }
    const e = this.t - this.delay;
    if (e >= this.dur) { this.dead = true; this.onEnd && this.onEnd(this); return; }
    this.tickT -= dt;
    if (this.tickT <= 1e-6) { this.tickT += this.tickEvery; if (this.onTick) this.onTick(this); }
  }
}
