// 所有战斗单位的基类：属性、增益/减益、移动、普攻
import { clamp, dist, norm } from '../util/math.js';
import { dealDamage } from './combat.js';

export const STAT_KEYS = ['maxHp', 'hpRegen', 'maxMp', 'mpRegen', 'ad', 'ap', 'armor', 'mr', 'asBonus', 'range', 'ms',
  'crit', 'critDmg', 'lifesteal', 'spellVamp', 'cdr', 'armorPenPct', 'armorPenFlat', 'magicPenPct', 'magicPenFlat',
  'tenacity', 'dmgReduce', 'dmgAmp', 'healAmp', 'interval'];

export function emptyStats() {
  const s = {};
  for (const k of STAT_KEYS) s[k] = 0;
  s.interval = 1;
  return s;
}

export class Unit {
  constructor(world, kind, team, x, y) {
    this.world = world;
    this.id = world.nextId++;
    this.kind = kind;           // hero | minion | tower | crystal | monster
    this.team = team;
    this.x = x; this.y = y; this.px = x; this.py = y;
    this.facing = 0; this.pfacing = 0;
    this.radius = 0.7;
    this.dead = false; this.removed = false;
    this.base = emptyStats();
    this.stats = emptyStats();
    this.hp = 1; this.mp = 0;
    this.buffs = [];
    this.statsDirty = true;
    this.shieldTotal = 0;
    this.stunned = false; this.rooted = false; this.silenced = false; this.airborne = false;
    this.slowPct = 0;
    this.untargetable = false; this.invuln = false; this.ccImmune = false;
    this.atkTimer = 0; this.windup = 0; this.windupTarget = null;
    this.target = null;
    this.forced = null;
    this.anim = { state: 'idle', act: null, actT: 0, actDur: 0, moving: false };
    this.visible = [true, false, false];
    this.revealT = 0;
    this.damagedBy = new Map();
    this.lastDamagedAt = -99; this.lastCombatAt = -99;
    this.sight = 8;
    this.isStructure = false;
    this.mobile = true;
    this.mass = 1;
    this.ranged = false;
    this.projStyle = 'basic';
    this.projSpeed = 20;
    this.windupFrac = 0.3;
    this.moving = false;
    this.bush = -1;
  }

  // —— 属性 ——
  recalc() {
    const s = this.stats;
    const b = this.base;
    for (const k of STAT_KEYS) s[k] = b[k];
    let adPct = 0, apPct = 0, armorPct = 0, mrPct = 0, msPct = 0, msFlat = 0, slowMax = 0, asMul = 0;
    for (const bf of this.buffs) {
      const m = bf.mods;
      if (m) {
        for (const k in m) {
          const v = m[k] * (bf.stacks || 1);
          if (k === 'adPct') adPct += v;
          else if (k === 'apPct') apPct += v;
          else if (k === 'armorPct') armorPct += v;
          else if (k === 'mrPct') mrPct += v;
          else if (k === 'msPct') msPct += v;
          else if (k === 'msFlat') msFlat += v;
          else if (k === 'asMul') asMul += v;
          else s[k] += v;
        }
      }
      if (bf.slow && bf.slow > slowMax) slowMax = bf.slow;
    }
    if (this.apMult) apPct += this.apMult;
    s.ad *= 1 + adPct; s.ap *= 1 + apPct;
    s.armor *= 1 + armorPct; s.mr *= 1 + mrPct;
    s.ms = Math.max(1.2, (s.ms + msFlat) * (1 + msPct) * (1 - slowMax));
    s.cdr = Math.min(0.4, s.cdr);
    s.crit = Math.min(1, s.crit);
    const asTotal = clamp(s.asBonus, -0.7, 2.0);
    s.atkInterval = s.interval / (1 + asTotal) * (1 + Math.max(0, asMul));
    this.slowPct = slowMax;
    if (this.hp > s.maxHp) this.hp = s.maxHp;
    if (this.mp > s.maxMp) this.mp = s.maxMp;
    this.statsDirty = false;
  }

  calcShield() {
    let t = 0;
    for (const b of this.buffs) if (b.shield > 0) t += b.shield;
    this.shieldTotal = t;
  }

  refreshStatus() {
    let st = false, ro = false, si = false, ai = false, un = false;
    for (const b of this.buffs) {
      if (b.stun) st = true;
      if (b.root) ro = true;
      if (b.silence) si = true;
      if (b.airborne) ai = true;
      if (b.untargetable) un = true;
    }
    this.stunned = st; this.rooted = ro || st; this.silenced = si || st; this.airborne = ai;
    this.untargetableBuff = un;
  }

  addBuff(spec) {
    let b = null;
    for (const e of this.buffs) {
      if (e.key === spec.key && (!spec.perSource || e.src === spec.src)) { b = e; break; }
    }
    if (b) {
      if (spec.maxStacks) b.stacks = Math.min(spec.maxStacks, (b.stacks || 1) + 1);
      b.dur = Math.max(b.dur, spec.dur);
      if (spec.shield !== undefined) b.shield = Math.max(b.shield || 0, spec.shield);
      if (spec.mods) b.mods = spec.mods;
      if (spec.slow !== undefined) b.slow = Math.max(b.slow || 0, spec.slow);
      if (spec.data) b.data = spec.data;
    } else {
      b = Object.assign({ stacks: 1 }, spec);
      if (b.tick) b.tickT = b.tickEvery || 1;
      this.buffs.push(b);
    }
    this.statsDirty = true;
    this.refreshStatus();
    this.calcShield();
    return b;
  }

  hasBuff(key) { for (const b of this.buffs) if (b.key === key) return b; return null; }
  removeBuff(key) {
    const n = this.buffs.length;
    this.buffs = this.buffs.filter((b) => {
      if (b.key !== key) return true;
      if (b.onExpire) b.onExpire(this, b);
      return false;
    });
    if (this.buffs.length !== n) { this.statsDirty = true; this.refreshStatus(); this.calcShield(); }
  }
  clearBuffs(keepPersistent = true) {
    this.buffs = this.buffs.filter((b) => keepPersistent && b.persistent);
    this.statsDirty = true; this.refreshStatus(); this.calcShield();
  }

  updateBuffs(dt) {
    if (!this.buffs.length) return;
    let changed = false;
    for (const b of this.buffs) {
      b.dur -= dt;
      if (b.tick) {
        b.tickT -= dt;
        while (b.tickT <= 0 && b.dur > -dt) { b.tickT += b.tickEvery || 1; if (!this.dead) b.tick(this, b); }
      }
    }
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      const b = this.buffs[i];
      if (b.dur <= 0) {
        this.buffs.splice(i, 1);
        if (b.onExpire) b.onExpire(this, b);
        changed = true;
      }
    }
    if (changed) { this.statsDirty = true; this.refreshStatus(); this.calcShield(); }
  }

  // —— 判定 ——
  isEnemy(u) { return u.team !== this.team; }
  get targetable() { return !this.dead && !this.untargetable && !this.untargetableBuff; }
  edgeDist(u) { return dist(this.x, this.y, u.x, u.y) - this.radius - u.radius; }
  inRange(u, extra = 0) { return this.edgeDist(u) <= this.stats.range + extra; }
  canAttackUnit(u) {
    return u && u !== this && !u.dead && u.targetable && this.isEnemy(u) && (this.team === 0 || u.visible[this.team]);
  }

  interrupt() {
    this.windup = 0; this.windupTarget = null;
    if (this.casting && !this.casting.uninterruptible) this.casting = null;
    if (this.channel && !this.channel.uninterruptible) { if (this.channel.onEnd) this.channel.onEnd(true); this.channel = null; }
    if (this.recalling) this.cancelRecall && this.cancelRecall();
  }

  faceTo(x, y) {
    const dx = x - this.x, dy = y - this.y;
    if (dx * dx + dy * dy > 1e-4) this.facing = Math.atan2(dy, dx);
  }

  // —— 移动 ——（返回是否移动了）
  tryMove(nx, ny) {
    const nav = this.world.nav;
    if (!nav.isBlocked(nx, ny)) { this.x = nx; this.y = ny; return true; }
    if (!nav.isBlocked(nx, this.y)) { this.x = nx; return true; }
    if (!nav.isBlocked(this.x, ny)) { this.y = ny; return true; }
    return false;
  }

  canMove() { return !this.dead && !this.rooted && !this.forced && !this.casting && !this.channel?.root; }

  moveToward(tx, ty, dt, stopDist = 0) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= stopDist + 0.05) return true;
    if (!this.canMove()) return false;
    const step = Math.min(d - stopDist, this.stats.ms * dt);
    this.facing = Math.atan2(dy, dx);
    this.moving = this.tryMove(this.x + dx / d * step, this.y + dy / d * step);
    return d - step <= stopDist + 0.05;
  }

  moveDir(dx, dy, dt) {
    if (!this.canMove()) return;
    const n = norm(dx, dy);
    if (!n.x && !n.y) return;
    this.facing = Math.atan2(n.y, n.x);
    const step = this.stats.ms * dt;
    this.moving = this.tryMove(this.x + n.x * step, this.y + n.y * step);
  }

  updateForced(dt) {
    const f = this.forced;
    if (!f) return;
    // follow：追着目标冲（如突进型大招）；stopDist：停在目标前方
    if (f.follow && !f.follow.dead && f.follow.targetable) { f.tx = f.follow.x; f.ty = f.follow.y; }
    const stop = f.stopDist || 0;
    const dx = f.tx - this.x, dy = f.ty - this.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const step = f.speed * dt;
    let done = false;
    f.elapsed = (f.elapsed || 0) + dt;
    if (f.self && d > 1e-3) this.facing = Math.atan2(dy, dx);
    if (d - stop <= step) {
      const k = d > 1e-6 ? Math.max(0, d - stop) / d : 0;
      const nx = this.x + dx * k, ny = this.y + dy * k;
      if (f.passWalls || !this.world.nav.isBlocked(nx, ny)) { this.x = nx; this.y = ny; }
      done = true;
    } else {
      const nx = this.x + dx / d * step, ny = this.y + dy / d * step;
      if (f.passWalls || !this.world.nav.isBlocked(nx, ny)) { this.x = nx; this.y = ny; }
      else done = true;
    }
    if (f.elapsed > (f.maxTime || 2.5)) done = true;
    if (f.hit) {
      const hits = this.world.queryUnits(this.x, this.y, this.radius + (f.hitRadius || 1.2), (u) => this.isEnemy(u) && u.targetable && !u.isStructure);
      for (const u of hits) {
        if (!f.hitSet) f.hitSet = new Set();
        if (f.hitSet.has(u.id)) continue;
        f.hitSet.add(u.id);
        if (f.hit(u) === 'stop') { done = true; break; }
      }
    }
    if (done || this.dead) {
      this.forced = null;
      if (f.onEnd && !this.dead) f.onEnd();
      if (this.world.nav.isBlocked(this.x, this.y)) {
        const p = this.world.nav.nearestFree(this.x, this.y);
        this.x = p.x; this.y = p.y;
      }
    }
  }

  // —— 普攻 ——
  startAttack(target) {
    if (this.dead || this.stunned || this.forced || this.casting || this.channel || this.atkTimer > 0 || this.windup > 0) return false;
    if (!this.canAttackUnit(target) || !this.inRange(target, 0.3)) return false;
    const iv = this.stats.atkInterval;
    this.atkTimer = iv;
    this.windup = Math.max(0.08, Math.min(0.35, iv * this.windupFrac));
    this.windupTarget = target;
    this.faceTo(target.x, target.y);
    this.anim.act = 'attack'; this.anim.actT = 0; this.anim.actDur = Math.min(0.6, iv * 0.9);
    this.anim.attackCount = (this.anim.attackCount || 0) + 1;
    this.world.emit({ type: 'attack', src: this.id, target: target.id, kind: this.kind, x: this.x, y: this.y });
    return true;
  }

  updateAttack(dt) {
    if (this.atkTimer > 0) this.atkTimer -= dt;
    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0) {
        const t = this.windupTarget;
        this.windupTarget = null;
        if (t && !t.dead && t.targetable && !this.stunned && this.inRange(t, 1.5)) this.releaseAttack(t);
      }
    }
  }

  releaseAttack(t) {
    this.lastCombatAt = this.world.time;
    if (this.ranged) {
      this.world.spawnProjectile({
        owner: this, team: this.team, x: this.x, y: this.y, target: t, speed: this.projSpeed,
        style: this.projStyle, homing: true,
        onHit: (tg) => this.attackLands(tg),
      });
    } else {
      this.attackLands(t);
    }
  }

  // 普攻命中：子类可覆盖 attackDamage / onAttackHit
  attackLands(t) {
    if (this.dead && this.kind !== 'tower') return;
    if (t.dead) return;
    const res = this.attackDamage(t);
    dealDamage(this.world, this, t, res.amount, res.type || 'phys', { attack: true, crit: res.crit });
    if (this.onAttackHit) this.onAttackHit(t, res);
    if (t.onAttacked) t.onAttacked(this, res);
    this.world.emit({ type: 'hit', src: this.id, target: t.id, kind: this.kind, crit: res.crit, style: this.projStyle, x: t.x, y: t.y });
  }

  attackDamage(t) {
    return { amount: this.stats.ad, type: 'phys', crit: false };
  }

  // —— 每帧基础更新 ——
  baseUpdate(dt) {
    this.px = this.x; this.py = this.y; this.pfacing = this.facing;
    this.moving = false;
    if (this.revealT > 0) this.revealT -= dt;
    this.updateBuffs(dt);
    if (this.statsDirty) this.recalc();
    if (!this.dead) {
      if (this.hp < this.stats.maxHp) this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.hpRegen * dt);
      if (this.mp < this.stats.maxMp) this.mp = Math.min(this.stats.maxMp, this.mp + this.stats.mpRegen * dt);
    }
    if (this.forced) this.updateForced(dt);
    if (this.anim.act) {
      this.anim.actT += dt;
      if (this.anim.actT >= this.anim.actDur) this.anim.act = null;
    }
  }
}
