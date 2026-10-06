// 电脑英雄 AI：团队决策（守塔、打龙、抱团推进）+ 个人行为（对线补刀、打野、团战、撤退）
import { enemyOf, DT, TIMING } from '../../config.js';
import { LANES, FOUNTAINS, CAMPS } from '../../data/map.js';
import { ITEM_BY_ID, MAX_ITEMS } from '../../data/items.js';
import { dist, norm, clamp, pointAlong, projectOnPolyline } from '../../util/math.js';
import { SPELLS, smiteDamage } from '../hero.js';
import { mitigate } from '../combat.js';

export const DIFFICULTY = {
  easy:   { name: '简单', think: 0.55, aimNoise: 2.2, predict: 0.0, lastHit: 0.55, retreatHp: 0.22, aggression: 1.35, spellUse: 0.35, skillChance: 0.5, dive: false, kite: false },
  normal: { name: '普通', think: 0.32, aimNoise: 0.9, predict: 0.6, lastHit: 0.85, retreatHp: 0.3, aggression: 1.05, spellUse: 0.8, skillChance: 0.85, dive: false, kite: true },
  hard:   { name: '困难', think: 0.2, aimNoise: 0.3, predict: 1.0, lastHit: 1.0, retreatHp: 0.32, aggression: 0.92, spellUse: 1, skillChance: 1, dive: true, kite: true },
};

const LANE_OF = { top: 'top', mid: 'mid', adc: 'bot', support: 'bot', jungle: null };
const ROLE_PRIO = { marksman: 1.5, mage: 1.4, assassin: 1.2, support: 1.1, fighter: 1.0, tank: 0.7 };

function laneProg(team, lane, x, y) {
  const L = LANES[lane];
  const a = projectOnPolyline(L.pts, L.acc, x, y).along;
  return team === 1 ? a : L.length - a;
}
function lanePoint(team, lane, prog) {
  const L = LANES[lane];
  const p = clamp(prog, 0, L.length);
  return pointAlong(L.pts, L.acc, team === 1 ? p : L.length - p);
}
function power(h) {
  const items = h.items.length;
  return (0.25 + 0.75 * h.hp / h.stats.maxHp) * (h.level + 4) * (1 + items * 0.18);
}

// —— 团队大脑：每秒评估一次全队目标 ——
export class TeamBrain {
  constructor(world, team) {
    this.world = world; this.team = team;
    this.objective = null;
    this.t = 0;
  }
  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1;
    this.objective = this.decide();
  }
  decide() {
    const w = this.world, T = this.team, E = enemyOf(T);
    const mine = w.heroes.filter((h) => h.team === T && !h.dead);
    const foes = w.heroes.filter((h) => h.team === E && !h.dead);
    // 守塔
    let def = null;
    for (const t of w.towers) {
      if (t.team !== T || t.dead) continue;
      const threats = foes.filter((e) => e.visible[T] && dist(e.x, e.y, t.x, t.y) < t.stats.range + 5).length;
      if (!threats) continue;
      const sev = threats + (t.kind === 'crystal' ? 3 : t.tier === 'high' ? 2 : t.tier === 'inner' ? 1 : 0);
      if (!def || sev > def.sev) def = { type: 'defend', x: t.x, y: t.y, tower: t, sev };
    }
    if (def && def.sev >= 2) return def;
    const avgLv = mine.reduce((s, h) => s + h.level, 0) / Math.max(1, mine.length);
    // 首领
    for (const c of w.camps) {
      if (!c.alive || (c.type !== 'drake' && c.type !== 'guardian')) continue;
      const need = c.type === 'drake' ? 4 : 8;
      if (avgLv >= need && mine.length >= 3 && mine.length >= foes.length) {
        const contested = foes.some((e) => e.visible[T] && dist(e.x, e.y, c.x, c.y) < 20);
        if (!contested || mine.length > foes.length) return { type: 'boss', x: c.x, y: c.y, camp: c };
      }
    }
    if (def) return def;
    // 抱团推进：中后期或人数优势
    const adv = mine.length - foes.length;
    if ((w.time > 540 && mine.length >= 3 && adv >= 0) || (adv >= 2 && mine.length >= 3)) {
      let best = null, bs = 1e9;
      for (const lane of Object.keys(LANES)) {
        const ts = w.towers.filter((t) => t.team === E && !t.dead && t.lane === lane);
        if (!ts.length) continue;
        const front = ts.reduce((a, b) => (laneProg(T, lane, a.x, a.y) < laneProg(T, lane, b.x, b.y) ? a : b));
        const tierW = front.tier === 'outer' ? 0 : front.tier === 'inner' ? 1 : 2;
        const sc = front.hp / front.stats.maxHp * 3 + tierW * 0.8 + (lane === 'mid' ? -0.5 : 0);
        if (sc < bs) { bs = sc; best = { type: 'push', lane, tower: front }; }
      }
      if (!best) best = { type: 'push', lane: 'mid', tower: w.crystals[E] };
      return best;
    }
    return null;
  }
}

// —— 单个英雄 ——
export class Bot {
  constructor(world, hero, brain, difficulty = 'normal') {
    this.world = world; this.hero = hero; this.brain = brain;
    this.cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.role = hero.position;
    this.lane = LANE_OF[this.role] || 'mid';
    this.thinkT = world.rng.next() * 0.3;
    this.retreating = false;
    this.mode = '';
    this.campTarget = null;
    this.enabled = true;
    hero.bot = this;
  }

  update(dt) {
    if (!this.enabled) return;
    this.thinkT -= dt;
    if (this.thinkT > 0) return;
    this.thinkT = this.cfg.think * (0.8 + this.world.rng.next() * 0.4);
    this.shop();
    const h = this.hero;
    if (h.dead) { this.retreating = false; return; }
    this.think();
  }

  // —— 买装备：按出装顺序，满格时卖掉猎刃 ——
  shop() {
    const h = this.hero;
    for (let guard = 0; guard < 3; guard++) {
      const build = this.role === 'jungle'
        ? (h.def.build.includes('jungle_knife') ? h.def.build : ['jungle_knife', ...h.def.build])
        : h.def.build.filter((id) => id !== 'jungle_knife');
      const next = build.find((id) => {
        if (h.items.includes(id)) return false;
        if (id === 'boots' && h.items.some((x) => ITEM_BY_ID[x].boots)) return false;
        return true;
      });
      if (!next) return;
      const it = ITEM_BY_ID[next];
      const upgrading = it.boots && next !== 'boots' && h.items.includes('boots');
      if (h.items.length >= MAX_ITEMS && !upgrading) {
        const ji = h.items.indexOf('jungle_knife');
        if (ji >= 0 && h.gold + Math.floor(ITEM_BY_ID.jungle_knife.cost * 0.6) >= h.buyCost(next)) h.sell(ji);
        else return;
      }
      if (!h.buy(next)) return;
    }
  }

  // —— 观察周围 ——
  scan() {
    const h = this.hero, w = this.world, T = h.team;
    const enemies = [], allies = [];
    for (const o of w.heroes) {
      if (o.dead || o === h) continue;
      const d = dist(h.x, h.y, o.x, o.y);
      if (o.team === T) { if (d < 14) allies.push(o); }
      else if (d < 16 && o.visible[T] && o.targetable) enemies.push(o);
    }
    let enemyTower = null, etd = 1e9, ownTower = null, otd = 1e9;
    for (const t of w.towers) {
      if (t.dead) continue;
      const d = dist(h.x, h.y, t.x, t.y);
      if (t.team !== T && d < etd) { etd = d; enemyTower = t; }
      if (t.team === T && d < otd) { otd = d; ownTower = t; }
    }
    return { enemies, allies, enemyTower, etd, ownTower, otd };
  }

  think() {
    const h = this.hero, w = this.world;
    const c = this.scan();
    const hpPct = h.hp / h.stats.maxHp;
    if (h.recalling) {
      if (c.enemies.some((e) => dist(e.x, e.y, h.x, h.y) < 9)) h.cancelRecall();
      else return;
    }
    // 1. 撤退 / 回城
    if (this.retreating) {
      if (hpPct > 0.8 || h.inFountain) this.retreating = false;
    } else if (hpPct < this.cfg.retreatHp || (hpPct < 0.45 && c.enemies.length > c.allies.length + 1) ||
      (h.resource !== 'none' && h.mp < h.stats.maxMp * 0.12 && hpPct < 0.6 && !c.enemies.length)) {
      this.retreating = true;
    }
    if (this.retreating && !h.inFountain) return this.retreat(c);
    // 2. 泉水里回满再出门
    if (h.inFountain && (hpPct < 0.92 || (h.resource !== 'none' && h.mp < h.stats.maxMp * 0.8))) { h.order = null; return; }
    // 3. 被敌方塔锁定：先退出塔范围
    const et = c.enemyTower;
    if (et && et.target === h && !et.protected && c.etd < et.stats.range + h.radius + et.radius + 1) {
      const killable = c.enemies.find((e) => e.hp / e.stats.maxHp < 0.12 && h.inRange(e, 1));
      if (!killable || hpPct < 0.4) {
        const n = norm(h.x - et.x, h.y - et.y);
        this.moveTo(h.x + n.x * 6, h.y + n.y * 6);
        return;
      }
    }
    // 4. 战斗
    if (c.enemies.length && this.fight(c)) return;
    // 5. 团队目标
    const obj = this.brain.objective;
    if (obj && this.joins(obj)) { this.doObjective(obj, c); return; }
    // 6. 分路职责
    if (this.role === 'jungle') this.jungle(c);
    else if (this.role === 'support') this.support(c);
    else this.laning(c, this.lane);
  }

  joins(obj) {
    const h = this.hero;
    const d = dist(h.x, h.y, obj.x ?? h.x, obj.y ?? h.y);
    if (obj.type === 'defend') return obj.sev >= 3 || d < 60;
    if (obj.type === 'boss') return this.role !== 'top' || d < 50 || this.world.time > 720;
    if (obj.type === 'push') return true;
    return false;
  }

  doObjective(obj, c) {
    const h = this.hero, w = this.world;
    this.mode = obj.type;
    if (obj.type === 'defend') {
      const n = norm(FOUNTAINS[h.team].x - obj.x, FOUNTAINS[h.team].y - obj.y);
      this.moveTo(obj.x + n.x * 3, obj.y + n.y * 3);
      this.farmNearby(c, 8);
      return;
    }
    if (obj.type === 'boss') {
      const boss = obj.camp.members.find((m) => !m.dead);
      if (!boss) return;
      const d = dist(h.x, h.y, boss.x, boss.y);
      const near = w.heroes.filter((a) => a.team === h.team && !a.dead && dist(a.x, a.y, boss.x, boss.y) < 14).length;
      if (d > 14 || (near < 2 && boss.hp > boss.stats.maxHp * 0.5)) {
        const n = norm(h.x - boss.x, h.y - boss.y);
        this.moveTo(boss.x + n.x * 8, boss.y + n.y * 8);
        return;
      }
      if (h.spell.id === 'smite' && h.canUseSpell() && boss.hp <= smiteDamage(h.level) && h.edgeDist(boss) <= SPELLS.smite.range) h.useSpell({ target: boss });
      this.useSkillsOn(boss, c, true);
      if (h.canAttackUnit(boss)) h.order = { type: 'attack', target: boss };
      else this.moveTo(boss.x, boss.y, boss.radius + 1);
      return;
    }
    if (obj.type === 'push') this.laning(c, obj.lane, true);
  }

  // —— 撤退 ——
  retreat(c) {
    const h = this.hero, w = this.world;
    this.mode = 'retreat';
    const f = FOUNTAINS[h.team];
    const close = c.enemies.filter((e) => dist(e.x, e.y, h.x, h.y) < 10);
    if (!close.length && w.time - h.lastDamagedAt > 2.5) {
      if (dist(h.x, h.y, f.x, f.y) > 30 && h.startRecall()) return;
      if (h.recalling) return;
    }
    this.moveTo(f.x, f.y);
    if (close.length) {
      const hpPct = h.hp / h.stats.maxHp;
      const n = norm(f.x - h.x, f.y - h.y);
      // 用位移技能逃跑
      for (let i = 0; i < 3; i++) {
        const sd = h.skills[i].def;
        if ((sd.ai === 'escape' || (sd.ai === 'dash' && sd.target !== 'unit')) && h.canCast(i)) {
          h.cast(i, { x: h.x + n.x * sd.range, y: h.y + n.y * sd.range });
          return;
        }
      }
      if (this.rand() < this.cfg.spellUse) {
        if (h.spell.id === 'heal' && hpPct < 0.3 && h.canUseSpell()) h.useSpell({});
        else if (h.spell.id === 'flash' && hpPct < 0.18 && h.canUseSpell() && dist(close[0].x, close[0].y, h.x, h.y) < 5) h.useSpell({ x: h.x + n.x * 8, y: h.y + n.y * 8 });
      }
      // 实在跑不掉就反打
      if (hpPct < 0.15) {
        const weak = close.find((e) => e.hp / e.stats.maxHp < 0.15 && h.inRange(e, 0.5));
        if (weak) { this.useSkillsOn(weak, c); h.order = { type: 'attack', target: weak }; }
      }
    }
  }

  // —— 战斗决策 ——
  fight(c) {
    const h = this.hero, w = this.world;
    const reach = h.stats.range + (this.mode === 'push' || this.brain.objective ? 7 : 4.5);
    let target = null, ts = 1e9;
    for (const e of c.enemies) {
      const d = h.edgeDist(e);
      if (d > reach + 3) continue;
      const eff = e.hp * (1 + e.stats.armor / 602) / (ROLE_PRIO[e.def.roles[0]] || 1);
      const sc = eff + d * 120;
      if (sc < ts) { ts = sc; target = e; }
    }
    if (!target) return false;
    const fav = this.evalFight(c, target);
    const fEnemy = FOUNTAINS[enemyOf(h.team)];
    if (dist(target.x, target.y, fEnemy.x, fEnemy.y) < 22) return false;
    // 越塔判断
    const tower = this.world.towers.find((t) => !t.dead && t.team !== h.team && !t.protected && dist(t.x, t.y, target.x, target.y) < t.stats.range + 1.5);
    if (tower) {
      const tankers = w.queryUnits(tower.x, tower.y, tower.stats.range, (u) => u.kind === 'minion' && u.team === h.team).length;
      const lowT = target.hp / target.stats.maxHp < (this.cfg.dive ? 0.3 : 0.18);
      const diveOk = (lowT && h.hp / h.stats.maxHp > 0.5) || (tankers >= 3 && fav > 1.3) || (c.allies.length >= 2 && fav > 1.6);
      if (!diveOk) {
        // 只在塔外消耗
        if (dist(h.x, h.y, tower.x, tower.y) > tower.stats.range + 1) this.useSkillsOn(target, c, false, true);
        return false;
      }
    }
    if (fav < this.cfg.aggression) {
      // 劣势：拉开距离
      const closest = c.enemies.reduce((a, b) => (dist(a.x, a.y, h.x, h.y) < dist(b.x, b.y, h.x, h.y) ? a : b));
      if (dist(closest.x, closest.y, h.x, h.y) < 8) {
        const back = this.safeSpot(c);
        this.moveTo(back.x, back.y);
        this.useSkillsOn(closest, c, false, true);
        return true;
      }
      return false;
    }
    this.mode = 'fight';
    this.useSkillsOn(target, c);
    this.useSpellsInFight(target, c);
    if (h.casting || h.forced || h.channel) return true;
    // 远程风筝：出手后后撤一步
    if (this.cfg.kite && h.ranged && h.atkTimer > h.stats.atkInterval * 0.35 && h.windup <= 0) {
      const mel = c.enemies.find((e) => !e.ranged && dist(e.x, e.y, h.x, h.y) < 4);
      if (mel) {
        const n = norm(h.x - mel.x, h.y - mel.y);
        h.order = { type: 'move', x: h.x + n.x * 2.5, y: h.y + n.y * 2.5 };
        return true;
      }
    }
    h.order = { type: 'attack', target };
    return true;
  }

  evalFight(c, target) {
    const h = this.hero, w = this.world;
    let mine = power(h), theirs = 0;
    for (const a of c.allies) if (dist(a.x, a.y, target.x, target.y) < 14) mine += power(a) * 0.9;
    for (const e of c.enemies) theirs += power(e);
    // 附近是否有其他看不见的敌人：按已知存活敌人数略微保守
    const ot = w.towers.find((t) => !t.dead && t.team === h.team && dist(t.x, t.y, target.x, target.y) < t.stats.range + 3);
    if (ot) mine += 6;
    const tp = target.hp / target.stats.maxHp;
    if (tp < 0.25) mine *= 1.6;
    return mine / Math.max(1, theirs);
  }

  safeSpot(c) {
    const h = this.hero;
    if (c.ownTower && c.otd < 45) {
      const f = FOUNTAINS[h.team];
      const n = norm(f.x - c.ownTower.x, f.y - c.ownTower.y);
      return { x: c.ownTower.x + n.x * 3, y: c.ownTower.y + n.y * 3 };
    }
    return FOUNTAINS[h.team];
  }

  rand() { return this.world.rng.next(); }

  // 预判瞄准点
  aimAt(t, speed = 25) {
    const h = this.hero;
    const d = dist(h.x, h.y, t.x, t.y);
    const tt = d / speed;
    const vx = (t.x - t.px) / DT, vy = (t.y - t.py) / DT;
    const k = this.cfg.predict;
    const noise = this.cfg.aimNoise;
    return {
      x: t.x + vx * tt * k + (this.rand() - 0.5) * noise,
      y: t.y + vy * tt * k + (this.rand() - 0.5) * noise,
    };
  }

  // —— 放技能 ——（farm：对小兵/野怪；pokeOnly：只用远程消耗）
  useSkillsOn(t, c, farm = false, pokeOnly = false) {
    const h = this.hero, w = this.world;
    if (!h.canAct() || h.silenced) return false;
    if (this.rand() > this.cfg.skillChance) return false;
    const d = dist(h.x, h.y, t.x, t.y);
    const tHp = t.hp / t.stats.maxHp;
    const order = farm ? [0, 1] : [2, 0, 1];
    for (const i of order) {
      if (!h.canCast(i)) continue;
      const sd = h.skills[i].def;
      const ai = sd.ai;
      if (pokeOnly && !(ai === 'poke' || (ai === 'cc' && i !== 2) || ai === 'hook')) continue;
      if (farm && (ai === 'execute' || ai === 'teamshield' || ai === 'hook' || (ai === 'escape'))) continue;
      if (farm && h.resource !== 'none' && h.mp < h.stats.maxMp * 0.35 && t.kind !== 'monster') continue;
      let aim = null;
      const R = sd.range || 0, rad = sd.radius || 0;
      switch (ai) {
        case 'heal': {
          const hurt = [h, ...c.allies].filter((a) => a.hp / a.stats.maxHp < 0.7 && dist(h.x, h.y, a.x, a.y) <= R);
          if (hurt.length && !farm) { const a = hurt.reduce((p, q) => (p.hp / p.stats.maxHp < q.hp / q.stats.maxHp ? p : q)); aim = { x: a.x, y: a.y }; }
          else if (d <= R) aim = this.aimAt(t, 30);
          break;
        }
        case 'teamshield': {
          const hurt = [h, ...c.allies].filter((a) => a.hp / a.stats.maxHp < 0.5 && dist(h.x, h.y, a.x, a.y) <= rad);
          if (hurt.length && c.enemies.length) aim = { x: h.x, y: h.y };
          break;
        }
        case 'execute':
          if (t.kind === 'hero' && h.edgeDist(t) <= R && (tHp < 0.5 || (c.allies.length >= 1 && tHp < 0.75))) aim = { target: t };
          break;
        case 'selfbuff':
          if (h.edgeDist(t) <= h.stats.range + 3) aim = { x: h.x, y: h.y };
          break;
        case 'escape':
          if (t.kind === 'hero' && d > h.stats.range * 0.9 && d < h.stats.range + sd.range) aim = { x: t.x, y: t.y };
          else if (t.kind === 'hero' && d < 3 && !t.ranged) { const n = norm(h.x - t.x, h.y - t.y); aim = { x: h.x + n.x * 4, y: h.y + n.y * 4 }; }
          break;
        default: {
          if (sd.target === 'self') {
            const r = (rad || 4) * 0.85;
            const n = this.countEnemies(h.x, h.y, r, farm);
            if ((t.kind === 'hero' && d <= r + t.radius) || n >= (farm ? 2 : 2) || (farm && t.kind === 'monster' && d <= r + t.radius)) aim = { x: h.x, y: h.y };
          } else if (sd.target === 'unit') {
            if (h.edgeDist(t) <= R && (!sd.unitHeroOnly || t.kind === 'hero')) aim = { target: t };
          } else {
            let maxR = R * 0.92;
            if (i === 2 && R > 30) maxR = tHp < 0.6 ? 28 : 14;     // 超远程大招：残血或近处才放
            if (sd.target === 'point' && rad) maxR = R + rad * 0.5;
            if (d <= maxR) {
              aim = this.aimAt(t, sd.target === 'point' ? 40 : 26);
              if (i === 2 && t.kind !== 'hero') aim = null;
            }
          }
        }
      }
      if (!aim) continue;
      // 大招只对英雄
      if (i === 2 && !farm && t.kind !== 'hero' && ai !== 'heal') continue;
      if (farm && i === 2) continue;
      if (h.cast(i, aim)) return true;
    }
    return false;
  }

  countEnemies(x, y, r, farm) {
    const h = this.hero;
    return this.world.queryUnits(x, y, r + 1.5, (u) => h.isEnemy(u) && u.targetable && !u.isStructure && (farm || u.kind === 'hero') && dist(x, y, u.x, u.y) <= r + u.radius).length;
  }

  useSpellsInFight(t, c) {
    const h = this.hero;
    if (!h.canUseSpell() || this.rand() > this.cfg.spellUse) return;
    const hpPct = h.hp / h.stats.maxHp;
    if (h.spell.id === 'heal') {
      const low = [h, ...c.allies].some((a) => a.hp / a.stats.maxHp < 0.25 && dist(a.x, a.y, h.x, h.y) < SPELLS.heal.radius);
      if (low) h.useSpell({});
    } else if (h.spell.id === 'smite') {
      if (t.hp <= smiteDamage(h.level) * 0.5 && h.edgeDist(t) <= SPELLS.smite.range) h.useSpell({ target: t });
    } else if (h.spell.id === 'flash' && this.cfg.dive) {
      const d = h.edgeDist(t);
      if (t.hp / t.stats.maxHp < 0.12 && d > h.stats.range + 1 && d < h.stats.range + 6 && hpPct > 0.4) h.useSpell({ x: t.x, y: t.y });
    }
  }

  // —— 移动 ——
  moveTo(x, y, stop = 0.4) {
    const h = this.hero;
    const fE = FOUNTAINS[enemyOf(h.team)];
    const df = dist(x, y, fE.x, fE.y);
    if (df < 20) { const n = norm(x - fE.x, y - fE.y); x = fE.x + n.x * 20; y = fE.y + n.y * 20; }
    const o = h.order;
    if (o && o.type === 'move' && dist(o.x, o.y, x, y) < 1) return;
    if (dist(h.x, h.y, x, y) <= stop + 0.1) { if (o && o.type === 'move') h.order = null; return; }
    h.order = { type: 'move', x, y, stop };
  }

  // 附近的小兵/野怪顺手清掉
  farmNearby(c, r) {
    const h = this.hero;
    const ms = this.world.queryUnits(h.x, h.y, r, (u) => u.kind === 'minion' && h.canAttackUnit(u));
    if (ms.length) {
      const m = ms.reduce((a, b) => (a.hp < b.hp ? a : b));
      h.order = { type: 'attack', target: m };
      return true;
    }
    return false;
  }

  // —— 对线 ——
  laning(c, lane, pushing = false) {
    const h = this.hero, w = this.world, T = h.team;
    this.mode = pushing ? 'push' : 'lane';
    const L = LANES[lane];
    // 我方 / 敌方兵线位置
    let myFront = -1, foeFront = 1e9;
    for (const u of w.units) {
      if (u.kind !== 'minion' || u.dead || u.lane !== lane) continue;
      const p = laneProg(T, lane, u.x, u.y);
      if (u.team === T) { if (p > myFront) myFront = p; }
      else if (u.visible[T] && p < foeFront) foeFront = p;
    }
    // 敌方最前的塔
    let foeTowerProg = L.length + 50, foeTower = null;
    for (const t of w.towers) {
      if (t.dead || t.team === T) continue;
      if (t.lane !== lane && !(t.kind === 'crystal')) continue;
      const p = laneProg(T, lane, t.x, t.y);
      if (p < foeTowerProg) { foeTowerProg = p; foeTower = t; }
    }
    let ownProg = 0;
    for (const t of w.towers) {
      if (t.dead || t.team !== T || t.lane !== lane) continue;
      ownProg = Math.max(ownProg, laneProg(T, lane, t.x, t.y));
    }
    const myLane = laneProg(T, lane, h.x, h.y);
    const offLane = projectOnPolyline(L.pts, L.acc, h.x, h.y).off;
    // 1. 补刀 / 清兵 / 推塔（在兵线附近才做）
    if (offLane < 10) {
      const lh = this.lastHitTarget(lane);
      const towerSafe = (u) => !foeTower || foeTower.protected || dist(u.x, u.y, foeTower.x, foeTower.y) > foeTower.stats.range + 1 ||
        w.queryUnits(foeTower.x, foeTower.y, foeTower.stats.range, (m) => m.kind === 'minion' && m.team === T).length >= 2;
      if (lh && towerSafe(lh)) { h.order = { type: 'attack', target: lh }; return; }
      // 推塔
      if (foeTower && !foeTower.protected && h.canAttackUnit(foeTower)) {
        const tankers = w.queryUnits(foeTower.x, foeTower.y, foeTower.stats.range, (m) => m.kind === 'minion' && m.team === T).length;
        const enemiesNear = c.enemies.filter((e) => dist(e.x, e.y, foeTower.x, foeTower.y) < 14).length;
        if ((tankers >= 1 && foeTower.target !== h) || (pushing && enemiesNear === 0 && h.hp / h.stats.maxHp > 0.6 && tankers >= 1)) {
          if (h.edgeDist(foeTower) < h.stats.range + 8) { h.order = { type: 'attack', target: foeTower }; return; }
        }
      }
      const ms = w.queryUnits(h.x, h.y, h.stats.range + 4, (u) => u.kind === 'minion' && h.canAttackUnit(u) && towerSafe(u));
      if (ms.length) {
        // 法师/射手用技能清兵
        if (ms.length >= 3) this.useSkillsOn(ms[0], c, true);
        if (!h.casting) {
          const support = this.role === 'support' && !pushing;
          if (!support || ms.length >= 4) {
            const m = ms.reduce((a, b) => (a.hp < b.hp ? a : b));
            if (m.hp > this.lhDamage(m) * 2.2 || pushing || c.enemies.length === 0) { h.order = { type: 'attack', target: m }; return; }
          }
        }
      }
    }
    // 2. 站位：我方兵线后方
    let stand;
    const back = h.ranged ? 4 : 1.8;
    if (myFront >= 0) stand = Math.min(myFront, foeFront) - back;
    else if (foeFront < 1e9) stand = Math.min(foeFront - h.stats.range - 2, ownProg + 4);
    else stand = ownProg + 5;
    if (!pushing && myFront < 0) stand = Math.min(stand, ownProg + 6);
    // 不进敌方塔范围（除非我方小兵在扛塔）
    if (foeTower && !foeTower.protected) {
      const tankers = w.queryUnits(foeTower.x, foeTower.y, foeTower.stats.range, (m) => m.kind === 'minion' && m.team === T).length;
      const limit = foeTowerProg - foeTower.stats.range - foeTower.radius - 1;
      if (tankers < 2 && stand > limit) stand = limit;
    } else if (foeTower) {
      stand = Math.min(stand, foeTowerProg - 4);
    }
    stand = Math.max(stand, 4);
    const p = lanePoint(T, lane, stand);
    this.moveTo(p.x + (this.hero.slot - 2) * 0.6, p.y - (this.hero.slot - 2) * 0.6, 1);
  }

  lhDamage(m) {
    const h = this.hero;
    return h.stats.ad * mitigate(m.stats.armor, h.stats.armorPenPct, h.stats.armorPenFlat);
  }
  lastHitTarget(lane) {
    const h = this.hero;
    if (this.role === 'support') return null;
    const ms = this.world.queryUnits(h.x, h.y, h.stats.range + 5, (u) => u.kind === 'minion' && h.canAttackUnit(u));
    let best = null;
    for (const m of ms) {
      const dmg = this.lhDamage(m) * (0.85 + 0.25 * this.cfg.lastHit) * (this.rand() < this.cfg.lastHit ? 1 : 0.6);
      if (m.hp <= dmg && (!best || m.hp < best.hp)) best = m;
    }
    return best;
  }

  // —— 辅助：跟着射手 ——
  support(c) {
    const h = this.hero, w = this.world;
    const adc = w.heroes.find((a) => a.team === h.team && a.position === 'adc' && !a.dead && !a.recalling);
    if (!adc || adc.inFountain || w.time > 600) return this.laning(c, 'bot');
    this.mode = 'support';
    const f = FOUNTAINS[h.team];
    const n = norm(f.x - adc.x, f.y - adc.y);
    const tx = adc.x + n.x * 1.5 - n.y * 2, ty = adc.y + n.y * 1.5 + n.x * 2;
    if (dist(h.x, h.y, tx, ty) > 2.5) this.moveTo(tx, ty, 1);
    else if (!this.farmNearby(c, 0)) h.order = null;
  }

  // —— 打野 ——
  jungle(c) {
    const h = this.hero, w = this.world, T = h.team;
    this.mode = 'jungle';
    // 抓人：等级 ≥ 3，附近队友正在和残血敌人对线
    if (h.level >= 3 && h.hp / h.stats.maxHp > 0.6) {
      let gank = null, gd = 1e9;
      for (const e of w.heroes) {
        if (e.team === T || e.dead || !e.visible[T]) continue;
        const d = dist(h.x, h.y, e.x, e.y);
        if (d > 50 || e.hp / e.stats.maxHp > 0.65) continue;
        const ally = w.heroes.some((a) => a.team === T && !a.dead && a !== h && dist(a.x, a.y, e.x, e.y) < 14);
        const under = w.towers.some((t) => !t.dead && t.team !== T && !t.protected && dist(t.x, t.y, e.x, e.y) < t.stats.range + 2);
        if (ally && !under && d < gd) { gd = d; gank = e; }
      }
      if (gank) { this.moveTo(gank.x, gank.y, 1); this.mode = 'gank'; return; }
    }
    // 选营地：本方野区，优先 Buff
    const cur = this.campTarget;
    if (!cur || !cur.alive || cur.members.every((m) => m.dead)) {
      let best = null, bs = 1e9;
      for (const cp of w.camps) {
        if (cp.side !== T) continue;
        const wait = cp.alive ? 0 : cp.respawnAt - w.time;
        if (wait > 12) continue;
        const sc = dist(h.x, h.y, cp.x, cp.y) + wait * 7 + (cp.def.respawn === 'buff' ? -15 : 0);
        if (sc < bs) { bs = sc; best = cp; }
      }
      this.campTarget = best;
    }
    const cp = this.campTarget;
    if (!cp) return this.laning(c, 'mid');
    if (!cp.alive) { this.moveTo(cp.x, cp.y, 3); return; }
    const alive = cp.members.filter((m) => !m.dead);
    if (dist(h.x, h.y, cp.x, cp.y) > 9 || !alive.some((m) => h.canAttackUnit(m))) { this.moveTo(cp.x, cp.y, 2); return; }
    const t = alive.filter((m) => h.canAttackUnit(m)).reduce((a, b) => (a.hp < b.hp ? a : b));
    if (h.spell.id === 'smite' && h.canUseSpell() && t.hp <= smiteDamage(h.level) && (t.def.buff || t.hp > 1000 || h.hp < h.stats.maxHp * 0.5)) h.useSpell({ target: t });
    this.useSkillsOn(t, c, true);
    if (!h.casting && !h.forced) h.order = { type: 'attack', target: t };
  }
}

/** 为一方创建 AI：返回 { brain, bots } 并注册到 world.controllers */
export function attachBots(world, team, difficulty, skipHero = null) {
  const brain = new TeamBrain(world, team);
  world.controllers.push(brain);
  const bots = [];
  for (const h of world.heroes) {
    if (h.team !== team || h === skipHero) continue;
    const b = new Bot(world, h, brain, difficulty);
    world.controllers.push(b);
    bots.push(b);
  }
  return { brain, bots };
}
