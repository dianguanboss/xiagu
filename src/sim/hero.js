// 英雄：等级经验、技能、装备、召唤师技能、回城、复活
import { Unit } from './unit.js';
import { HERO_BY_ID, calcVal } from '../data/heroes.js';
import { ITEM_BY_ID, MAX_ITEMS } from '../data/items.js';
import { XP_TO_NEXT, MAX_LEVEL, ECON, TIMING, VISION, respawnTime } from '../config.js';
import { FOUNTAINS, FOUNTAIN_RADIUS } from '../data/map.js';
import { SKILL_IMPL } from './skills.js';
import { dealDamage, heal, addShield, slow, inCombat } from './combat.js';
import { dist, norm, clamp } from '../util/math.js';

export const SPELLS = {
  flash: { id: 'flash', name: '闪现', cd: 100, range: 7.5, target: 'dir', desc: '向指定方向瞬间移动 7.5 米，可以穿过薄墙。' },
  smite: { id: 'smite', name: '惩击', cd: 30, range: 5.5, target: 'unit', desc: '对附近野怪或小兵造成 {d} 点真实伤害；对英雄造成一半伤害并减速 50%。打野必带。' },
  heal: { id: 'heal', name: '治疗术', cd: 100, radius: 8, target: 'self', desc: '回复自身和 8 米内队友 15% 最大生命，并提高 20% 移速 2 秒。' },
};
export const smiteDamage = (lvl) => 900 + 70 * (lvl - 1);

const ULT_LEVELS = [4, 8, 12];

export class Hero extends Unit {
  constructor(world, heroId, team, opts = {}) {
    const f = FOUNTAINS[team];
    super(world, 'hero', team, f.x, f.y);
    const def = HERO_BY_ID[heroId];
    if (!def) throw new Error('未知英雄 ' + heroId);
    this.def = def;
    this.heroId = heroId;
    this.name = def.name;
    this.level = 1; this.xp = 0;
    this.gold = ECON.startGold; this.totalGold = ECON.startGold;
    this.items = [];
    this.passives = new Set();
    this.skills = def.skills.map((sd) => ({ def: sd, level: 0, cdLeft: 0 }));
    this.skillPoints = 1;
    this.spell = { id: opts.spell || 'flash', cdLeft: 0 };
    this.kills = 0; this.deaths = 0; this.assists = 0; this.cs = 0;
    this.streak = 0; this.multi = 0; this.lastKillAt = -99;
    this.respawnT = 0;
    this.recalling = null;
    this.order = null; this.path = null; this.pathGoal = null; this.nextPathAt = 0; this.pathAt = -9;
    this.stuckT = 0;
    this.casting = null; this.channel = null;
    this.impl = SKILL_IMPL[heroId] || {};
    this.ps = {};            // 被动状态
    this.icd = {};           // 装备被动内置冷却
    this.isPlayer = !!opts.isPlayer;
    this.position = opts.position || def.positions[0];
    this.slot = opts.slot || 0;
    this.autoLevel = opts.autoLevel !== undefined ? opts.autoLevel : !this.isPlayer;
    this.radius = 0.8;
    this.sight = VISION.hero;
    this.mass = 3;
    this.ranged = def.attack === 'ranged';
    this.projStyle = def.projectile || 'basic';
    this.projSpeed = def.base.projSpeed || 22;
    this.windupFrac = this.ranged ? 0.28 : 0.3;
    this.monsterVampMul = heroId === 'kuanglang' ? 2 : 1;
    this.resource = def.resource || 'mp';
    this.inFountain = false;
    this.dmgDealt = 0; this.heroDmg = 0; this.dmgTaken = 0;
    this.attackReduce = 0;
    this.reviveCd = 0;
    this.spawnPos();
    this.recalcBase();
    this.recalc();
    this.hp = this.stats.maxHp; this.mp = this.stats.maxMp;
    if (this.impl.init) this.impl.init(this);
    if (this.autoLevel) this.autoLevelSkills();
  }

  spawnPos() {
    const f = FOUNTAINS[this.team];
    const a = (this.slot / 5) * Math.PI * 0.5 + (this.team === 1 ? -Math.PI * 0.5 : Math.PI * 0.5);
    this.x = f.x + Math.cos(a) * 3; this.y = f.y + Math.sin(a) * 3;
    this.px = this.x; this.py = this.y;
    this.facing = this.team === 1 ? -Math.PI / 4 : (Math.PI * 3) / 4;
  }

  hasPassive(p) { return this.passives.has(p); }

  recalcBase() {
    const b = this.def.base, L = this.level - 1, s = this.base;
    for (const k in s) s[k] = 0;
    s.maxHp = b.hp + b.hpG * L;
    s.maxMp = b.mp + b.mpG * L;
    s.ad = b.ad + b.adG * L;
    s.armor = b.armor + b.armorG * L;
    s.mr = b.mr + b.mrG * L;
    s.ms = b.ms;
    s.range = b.range;
    s.interval = b.interval;
    s.asBonus = b.asG * L;
    s.hpRegen = b.hpRegen + b.hpRegenG * L;
    s.mpRegen = b.mpRegen + b.mpRegenG * L;
    s.critDmg = 1.0;
    s.lifesteal = b.lifesteal || 0;
    this.baseAd = s.ad;
    this.passives.clear();
    for (const id of this.items) {
      const it = ITEM_BY_ID[id];
      for (const k in it.stats) s[k] += it.stats[k];
      if (it.passive) this.passives.add(it.passive);
    }
    this.apMult = this.passives.has('ap_mult') ? 0.3 : 0;
    this.attackReduce = this.passives.has('boots_armor') ? 0.15 : 0;
    this.statsDirty = true;
  }

  refreshStats() {
    const oldMax = this.stats.maxHp, oldMp = this.stats.maxMp;
    this.recalcBase();
    this.recalc();
    if (!this.dead) {
      if (this.stats.maxHp > oldMax) this.hp += this.stats.maxHp - oldMax;
      if (this.stats.maxMp > oldMp) this.mp += this.stats.maxMp - oldMp;
    }
  }

  // —— 经验与等级 ——
  gainXp(n) {
    if (this.level >= MAX_LEVEL || n <= 0) return;
    this.xp += n;
    while (this.level < MAX_LEVEL && this.xp >= XP_TO_NEXT[this.level]) {
      this.xp -= XP_TO_NEXT[this.level];
      this.levelUp();
    }
    if (this.level >= MAX_LEVEL) this.xp = 0;
  }
  levelUp() {
    this.level++;
    this.skillPoints++;
    this.refreshStats();
    this.world.emit({ type: 'levelUp', hero: this.id, level: this.level, x: this.x, y: this.y });
    if (this.autoLevel) this.autoLevelSkills();
  }
  gainGold(n, x, y, show = true) {
    if (n <= 0) return;
    n = Math.round(n);
    this.gold += n; this.totalGold += n;
    if (show) this.world.emit({ type: 'gold', hero: this.id, amount: n, x: x ?? this.x, y: y ?? this.y });
  }

  canUpgrade(i) {
    if (this.skillPoints <= 0) return false;
    const s = this.skills[i];
    if (i === 2) return s.level < 3 && this.level >= ULT_LEVELS[s.level];
    return s.level < 6 && s.level < Math.ceil(this.level / 2);
  }
  upgradeSkill(i) {
    if (!this.canUpgrade(i)) return false;
    this.skills[i].level++;
    this.skillPoints--;
    this.world.emit({ type: 'skillUp', hero: this.id, slot: i });
    return true;
  }
  autoLevelSkills() {
    const order = this.def.levelOrder || [0, 1];
    while (this.skillPoints > 0) {
      if (this.upgradeSkill(2)) continue;
      // 先保证每个技能至少 1 级
      let done = false;
      for (const i of order) if (this.skills[i].level === 0 && this.upgradeSkill(i)) { done = true; break; }
      if (done) continue;
      for (const i of order) if (this.upgradeSkill(i)) { done = true; break; }
      if (!done) break;
    }
  }

  // —— 技能 ——
  skillCost(i) {
    const s = this.skills[i];
    if (this.resource === 'none' || s.level === 0) return 0;
    return s.def.cost[s.level - 1] || 0;
  }
  skillCd(i) {
    const s = this.skills[i];
    return (s.def.cd[Math.max(0, s.level - 1)] || 0) * (1 - this.stats.cdr);
  }
  canAct() { return !this.dead && !this.stunned && !this.forced && !this.casting && !(this.channel && this.channel.lock); }
  canCast(i) {
    const s = this.skills[i];
    if (!s || s.level === 0 || s.cdLeft > 0) return false;
    if (!this.canAct() || this.silenced) return false;
    if (this.resource !== 'none' && this.mp < this.skillCost(i)) return false;
    if (this.impl.canCast && !this.impl.canCast(this, i)) return false;
    return true;
  }
  /** aim: { x, y } 目标点（指向/地点型）或 { target: unit }（指定目标型） */
  cast(i, aim = {}) {
    if (!this.canCast(i)) return false;
    const s = this.skills[i], d = s.def;
    const a = this.resolveAim(d, aim);
    if (!a) return false;
    if (this.recalling) this.cancelRecall();
    this.windup = 0; this.windupTarget = null;
    if (d.target !== 'self') this.faceTo(a.x, a.y);
    this.anim.act = 'cast'; this.anim.actT = 0; this.anim.actDur = Math.max(0.35, d.castTime + 0.2); this.anim.castSlot = i;
    if (d.castTime > 0) {
      this.casting = { i, aim: a, t: d.castTime };
      this.world.emit({ type: 'castStart', hero: this.id, slot: i, x: a.x, y: a.y, dur: d.castTime });
    } else {
      this.executeCast(i, a);
    }
    return true;
  }
  resolveAim(d, aim) {
    const a = { x: aim.x, y: aim.y, target: aim.target || null };
    if (d.target === 'unit') {
      let t = a.target;
      if (!t || !this.canAttackUnit(t) || (d.unitHeroOnly && t.kind !== 'hero') || this.edgeDist(t) > d.range + 0.5) return null;
      a.x = t.x; a.y = t.y;
    } else if (d.target === 'self') {
      a.x = a.x ?? this.x; a.y = a.y ?? this.y;
    } else {
      if (a.x === undefined) { a.x = this.x + Math.cos(this.facing) * d.range; a.y = this.y + Math.sin(this.facing) * d.range; }
      let dx = a.x - this.x, dy = a.y - this.y;
      let l = Math.sqrt(dx * dx + dy * dy);
      if (l < 0.01) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); l = 1; a.x = this.x + dx; a.y = this.y + dy; }
      a.dx = dx / l; a.dy = dy / l;
      if (d.target === 'point' && l > d.range) { a.x = this.x + a.dx * d.range; a.y = this.y + a.dy * d.range; }
      if (d.target === 'dir') { a.x = this.x + a.dx * d.range; a.y = this.y + a.dy * d.range; }
    }
    if (a.dx === undefined) {
      const n = norm(a.x - this.x, a.y - this.y);
      a.dx = n.x || Math.cos(this.facing); a.dy = n.y || Math.sin(this.facing);
    }
    return a;
  }
  executeCast(i, aim) {
    const s = this.skills[i];
    if (this.dead) return;
    // 指定目标技能：前摇期间目标死亡或消失则取消，不消耗蓝和冷却
    if (aim.target && (aim.target.dead || !aim.target.targetable)) {
      if (s.def.target === 'unit') { this.anim.act = null; return; }
      aim.target = null;
    }
    if (this.resource !== 'none') this.mp -= this.skillCost(i);
    s.cdLeft = this.skillCd(i);
    const ctx = this.makeCtx(i, aim);
    const fn = this.impl['s' + (i + 1)];
    this.lastCombatAt = Math.max(this.lastCombatAt, this.world.time - 2);
    this.world.emit({ type: 'cast', hero: this.id, heroId: this.heroId, slot: i, x: aim.x, y: aim.y, tx: aim.target ? aim.target.id : 0 });
    if (fn) fn(ctx);
    if (this.hasPassive('spellblade') && !(this.icd.spellblade > this.world.time)) {
      this.addBuff({ key: 'spellblade', dur: 4, visual: 'empower' });
    }
    if (this.impl.onCast) this.impl.onCast(this, i, ctx);
  }
  makeCtx(i, aim) {
    const s = this.skills[i];
    return {
      world: this.world, hero: this, slot: i, skill: s, lvl: s.level, aim, def: s.def,
      val: (name) => calcVal(s.def.vals[name], this, s.level),
    };
  }

  // —— 召唤师技能 ——
  canUseSpell() { return !this.dead && this.spell.cdLeft <= 0 && !this.stunned && !this.casting && !(this.channel && this.channel.lock); }
  useSpell(aim = {}) {
    if (!this.canUseSpell()) return false;
    const sp = SPELLS[this.spell.id];
    const w = this.world;
    if (this.spell.id === 'flash') {
      if (this.forced) return false;
      let dx = (aim.x ?? this.x + Math.cos(this.facing)) - this.x, dy = (aim.y ?? this.y + Math.sin(this.facing)) - this.y;
      const n = norm(dx, dy);
      if (!n.x && !n.y) { n.x = Math.cos(this.facing); n.y = Math.sin(this.facing); }
      const p = w.nav.blinkTarget(this.x, this.y, this.x + n.x * sp.range, this.y + n.y * sp.range);
      w.emit({ type: 'fx', name: 'flash', x: this.x, y: this.y, x2: p.x, y2: p.y, hero: this.id });
      this.x = p.x; this.y = p.y; this.px = p.x; this.py = p.y;
      this.facing = Math.atan2(n.y, n.x);
      this.windup = 0;
    } else if (this.spell.id === 'smite') {
      let t = aim.target && this.canAttackUnit(aim.target) && this.edgeDist(aim.target) <= sp.range ? aim.target : null;
      if (!t) {
        let best = null, bd = 1e9;
        for (const u of w.queryUnits(this.x, this.y, sp.range + 3, (u) => this.canAttackUnit(u) && !u.isStructure)) {
          const d = this.edgeDist(u);
          if (d > sp.range) continue;
          const pri = (u.kind === 'monster' ? (u.boss ? 0 : 1) : u.kind === 'hero' ? 3 : 2) * 100 + d;
          if (pri < bd) { bd = pri; best = u; }
        }
        t = best;
      }
      if (!t) return false;
      const dmg = smiteDamage(this.level);
      w.emit({ type: 'fx', name: 'smite', x: t.x, y: t.y, target: t.id, hero: this.id });
      if (t.kind === 'hero') { dealDamage(w, this, t, dmg * 0.5, 'true', { skill: true }); slow(w, this, t, 0.5, 1.5); }
      else dealDamage(w, this, t, dmg, 'true', { skill: true });
    } else if (this.spell.id === 'heal') {
      for (const u of w.queryUnits(this.x, this.y, sp.radius, (u) => u.kind === 'hero' && u.team === this.team && !u.dead)) {
        heal(w, this, u, u.stats.maxHp * 0.15);
        u.addBuff({ key: 'healspell', dur: 2, mods: { msPct: 0.2 } });
        w.emit({ type: 'fx', name: 'healspell', target: u.id, x: u.x, y: u.y });
      }
    }
    this.spell.cdLeft = sp.cd;
    if (this.recalling) this.cancelRecall();
    w.emit({ type: 'spell', hero: this.id, spell: this.spell.id, x: this.x, y: this.y });
    return true;
  }

  // —— 回城 ——
  startRecall() {
    if (this.dead || this.recalling || this.inFountain || !this.canAct()) return false;
    this.recalling = { t: TIMING.recallTime };
    this.order = null; this.path = null;
    this.world.emit({ type: 'recallStart', hero: this.id, x: this.x, y: this.y });
    return true;
  }
  cancelRecall() {
    if (!this.recalling) return;
    this.recalling = null;
    this.world.emit({ type: 'recallCancel', hero: this.id });
  }

  // —— 装备 ——
  buyCost(id) {
    const it = ITEM_BY_ID[id];
    if (!it) return Infinity;
    if (it.boots && it.id !== 'boots' && this.items.includes('boots')) return it.cost - ITEM_BY_ID.boots.cost;
    return it.cost;
  }
  canBuy(id) {
    const it = ITEM_BY_ID[id];
    if (!it || this.dead && false) return false;
    if (this.gold < this.buyCost(id)) return false;
    if (it.boots) {
      const owned = this.items.find((x) => ITEM_BY_ID[x].boots);
      if (owned && !(owned === 'boots' && id !== 'boots')) return false;
      if (owned === 'boots' && id !== 'boots') return true;
    }
    if (it.passive === 'jungle' && this.items.includes(id)) return false;
    return this.items.length < MAX_ITEMS;
  }
  buy(id) {
    if (!this.canBuy(id)) return false;
    const cost = this.buyCost(id);
    const it = ITEM_BY_ID[id];
    if (it.boots && id !== 'boots' && this.items.includes('boots')) this.items.splice(this.items.indexOf('boots'), 1, id);
    else this.items.push(id);
    this.gold -= cost;
    this.refreshStats();
    this.world.emit({ type: 'buy', hero: this.id, item: id });
    return true;
  }
  sell(slot) {
    const id = this.items[slot];
    if (!id) return false;
    this.items.splice(slot, 1);
    this.gold += Math.floor(ITEM_BY_ID[id].cost * ECON.sellRatio);
    this.refreshStats();
    this.world.emit({ type: 'sell', hero: this.id, item: id });
    return true;
  }

  // —— 普攻（暴击、装备被动、英雄被动、红 buff）——
  attackDamage(t) {
    const s = this.stats;
    let amount = s.ad;
    let crit = false;
    if (s.crit > 0 && this.world.rng.next() < s.crit) { crit = true; amount *= 1 + s.critDmg; }
    const res = { amount, type: 'phys', crit };
    if (this.hasBuff('spellblade')) {
      res.amount += s.ad * 0.6; res.spellblade = true;
      this.removeBuff('spellblade');
      this.icd.spellblade = this.world.time + 1.5;
    }
    if (this.hasPassive('execute')) {
      let e = t.hp * 0.08;
      if (t.kind !== 'hero') e = Math.min(e, 150);
      res.amount += e;
    }
    if (this.impl.modifyAttack) this.impl.modifyAttack(this, t, res);
    return res;
  }
  onAttackHit(t, res) {
    const w = this.world;
    if (this.hasBuff('redBuff') && !t.isStructure) {
      const dmg = 16 + 5 * this.level;
      t.addBuff({ key: 'redburn', src: this, dur: 3, tickEvery: 1, visual: 'burn', perSource: true,
        tick: (u) => dealDamage(w, this, u, dmg, 'true', { noEvent: false, noVamp: true }) });
      slow(w, this, t, 0.2, 1, 'redslow');
    }
    if (this.impl.onAttackHit) this.impl.onAttackHit(this, t, res);
  }
  onAttacked(src, res) {
    const w = this.world;
    if (!src || src.dead) return;
    if (this.hasPassive('reflect') && (src.kind === 'hero' || src.kind === 'monster')) {
      dealDamage(w, this, src, res.amount * 0.2, 'magic', { noVamp: true });
    }
    if (this.hasPassive('omen') && src.kind === 'hero') {
      src.addBuff({ key: 'omen', src: this, dur: 2, mods: { asBonus: -0.3 }, visual: 'slow' });
    }
  }
  onDamaged(src, amount) {
    if (this.dead) return;
    if (this.recalling && amount > 0) this.cancelRecall();
    // 敌方英雄攻击我方英雄：附近我方小兵转火该英雄
    if (src && src.kind === 'hero' && src.team !== this.team && amount > 0) {
      for (const m of this.world.queryUnits(this.x, this.y, 9, (u) => u.kind === 'minion' && u.team === this.team)) {
        m.aggroHero = src; m.aggroT = this.world.time + 2.5;
      }
    }
    if (this.hasPassive('lowhp_shield') && this.hp < this.stats.maxHp * 0.3 && !(this.icd.witch > this.world.time)) {
      this.icd.witch = this.world.time + 60;
      addShield(this.world, this, this, 400 + 40 * this.level, 4, 'witch');
    }
    if (this.impl.onDamaged) this.impl.onDamaged(this, src, amount);
  }
  onDealtDamage(target, amount, type, opts) {
    if (this.impl.onDealtDamage) this.impl.onDealtDamage(this, target, amount, type, opts);
  }

  // 复活甲
  tryRevive() {
    if (!this.hasPassive('revive') || this.reviveCd > this.world.time) return false;
    this.reviveCd = this.world.time + 150;
    this.hp = 1;
    this.interrupt();
    this.forced = null;
    this.addBuff({ key: 'reviving', dur: 2, stun: true, untargetable: true, visual: 'revive',
      onExpire: (u) => { if (!u.dead) { u.hp = Math.max(u.hp, u.stats.maxHp * 0.5); u.world.emit({ type: 'fx', name: 'revive', target: u.id, x: u.x, y: u.y }); } } });
    this.world.emit({ type: 'fx', name: 'reviveStart', target: this.id, x: this.x, y: this.y });
    return true;
  }

  onDeath() {
    this.dead = true;
    this.deaths++;
    this.streak = 0;
    this.respawnT = respawnTime(this.level, this.world.time);
    this.casting = null; this.channel = null; this.forced = null; this.recalling = null;
    this.order = null; this.path = null; this.windup = 0;
    this.clearBuffs(true);
    this.hp = 0;
  }
  respawn() {
    this.dead = false;
    this.spawnPos();
    this.refreshStats();
    this.hp = this.stats.maxHp; this.mp = this.stats.maxMp;
    this.world.emit({ type: 'respawn', hero: this.id, x: this.x, y: this.y });
  }

  // —— 指令执行 ——
  // order: {type:'dir',dx,dy} | {type:'move',x,y} | {type:'attack',target} | null
  followPath(tx, ty, dt, stop = 0.3) {
    const w = this.world;
    const need = !this.path || !this.pathGoal || dist(this.pathGoal.x, this.pathGoal.y, tx, ty) > 1.5 || w.time - this.pathAt > 3 || this.stuckT > 0.6;
    if (need && w.time >= this.nextPathAt) {
      if (dist(this.x, this.y, tx, ty) < 1.2 || w.nav.los(this.x, this.y, tx, ty)) this.path = [{ x: tx, y: ty }];
      else this.path = w.nav.findPath(this.x, this.y, tx, ty) || [{ x: tx, y: ty }];
      this.pathGoal = { x: tx, y: ty }; this.pathAt = w.time;
      this.nextPathAt = w.time + 0.3;
      this.stuckT = 0;
    }
    if (!this.path || !this.path.length) return true;
    const p = this.path[0];
    const last = this.path.length === 1;
    const ox = this.x, oy = this.y;
    const arrived = this.moveToward(p.x, p.y, dt, last ? stop : 0);
    if (Math.abs(this.x - ox) + Math.abs(this.y - oy) < this.stats.ms * dt * 0.2 && !arrived && this.canMove()) this.stuckT += dt;
    else this.stuckT = 0;
    if (!last && dist(this.x, this.y, p.x, p.y) < 0.7) this.path.shift();
    if (arrived && last) { this.path = null; return true; }
    return false;
  }

  updateOrders(dt) {
    const w = this.world;
    if (this.casting) {
      this.casting.t -= dt;
      if (this.casting.t <= 0) { const c = this.casting; this.casting = null; this.executeCast(c.i, c.aim); }
      return;
    }
    if (this.channel) {
      const ch = this.channel;
      ch.t -= dt;
      if (ch.update) ch.update(dt, ch);
      if (ch.t <= 0 || this.dead) { this.channel = null; if (ch.onEnd) ch.onEnd(false); }
      if (ch.lock) return;
    }
    if (this.stunned || this.forced) return;
    const o = this.order;
    if (!o) return;
    if (o.type === 'dir') {
      if (this.recalling) this.cancelRecall();
      if (this.windup > 0 && this.ranged) { this.windup = 0; this.windupTarget = null; this.atkTimer = Math.min(this.atkTimer, 0.1); }
      if (this.windup > 0) return;
      this.path = null;
      this.moveDir(o.dx, o.dy, dt);
    } else if (o.type === 'move') {
      if (this.recalling) this.cancelRecall();
      if (this.windup > 0) return;
      if (this.followPath(o.x, o.y, dt, o.stop || 0.3)) this.order = null;
    } else if (o.type === 'attack') {
      const t = o.target;
      if (!t || !this.canAttackUnit(t)) { this.order = null; return; }
      if (this.windup > 0) return;
      if (this.inRange(t, 0.1)) {
        if (this.recalling) this.cancelRecall();
        this.faceTo(t.x, t.y);
        this.startAttack(t);
      } else {
        if (this.recalling) this.cancelRecall();
        const r = this.stats.range + this.radius + t.radius - 0.2;
        if (w.nav.los(this.x, this.y, t.x, t.y)) { this.path = null; this.moveToward(t.x, t.y, dt, r); }
        else this.followPath(t.x, t.y, dt, r);
      }
    }
  }

  update(dt) {
    const w = this.world;
    for (const s of this.skills) if (s.cdLeft > 0) s.cdLeft -= dt;
    if (this.spell.cdLeft > 0) this.spell.cdLeft -= dt;
    if (this.dead) {
      this.px = this.x; this.py = this.y;
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.respawn();
      return;
    }
    this.baseUpdate(dt);
    if (this.resource === 'none') this.mp = 0;
    // 泉水
    const f = FOUNTAINS[this.team];
    this.inFountain = dist(this.x, this.y, f.x, f.y) < FOUNTAIN_RADIUS;
    if (this.inFountain) {
      this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.12 * dt);
      this.mp = Math.min(this.stats.maxMp, this.mp + this.stats.maxMp * 0.12 * dt);
    }
    if (this.hasPassive('overlord') && !inCombat(this, w.time)) this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.02 * dt);
    if (this.hasPassive('burn_aura')) {
      this.ps.burnT = (this.ps.burnT || 0) - dt;
      if (this.ps.burnT <= 0) {
        this.ps.burnT = 1;
        for (const u of w.queryUnits(this.x, this.y, 4.2, (u) => this.isEnemy(u) && u.targetable && !u.isStructure)) {
          dealDamage(w, this, u, 60 + 8 * this.level, 'magic', { noVamp: true, noEvent: u.kind !== 'hero' });
        }
      }
    }
    if (this.impl.onTick) this.impl.onTick(this, dt);
    // 回城
    if (this.recalling) {
      if (this.stunned || this.forced) this.cancelRecall();
      else {
        this.recalling.t -= dt;
        if (this.recalling.t <= 0) {
          this.recalling = null;
          const fx = this.x, fy = this.y;
          this.spawnPos();
          w.emit({ type: 'recallEnd', hero: this.id, x: this.x, y: this.y, fromX: fx, fromY: fy });
        }
      }
    }
    this.updateOrders(dt);
    this.updateAttack(dt);
  }
}
