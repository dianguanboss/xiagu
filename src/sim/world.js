// 对局世界：所有单位、刷新计时、视野、击杀结算、胜负判定
import { DT, TEAM_BLUE, TEAM_RED, enemyOf, ECON, TIMING, VISION, MAX_LEVEL } from '../config.js';
import { TOWERS, CRYSTALS, FOUNTAINS, CAMPS, LANES } from '../data/map.js';
import { CAMP_TYPES, MONSTERS } from '../data/units.js';
import { NavGrid } from './nav.js';
import { RNG } from '../util/rng.js';
import { dist, dist2 } from '../util/math.js';
import { Hero } from './hero.js';
import { Minion, Tower, Fountain, Monster, Projectile, Area } from './entities.js';

let NAV_CACHE = null;
export function getNav() { return NAV_CACHE || (NAV_CACHE = new NavGrid()); }

const CELL = 8;

export class World {
  /**
   * opts.picks: { 1: [{ heroId, position, spell, isPlayer }...5], 2: [...] }
   */
  constructor(opts = {}) {
    this.opts = opts;
    this.rng = new RNG(opts.seed ?? 12345);
    this.nav = getNav();
    this.time = 0; this.tick = 0;
    this.nextId = 1;
    this.events = [];
    this.units = [];
    this.byId = new Map();
    this.heroes = [];
    this.towers = [];
    this.projectiles = [];
    this.areas = [];
    this.controllers = [];
    this.camps = [];
    this.score = { 1: 0, 2: 0 };
    this.towersDown = { 1: 0, 2: 0 };
    this.firstBlood = false;
    this.over = false; this.winner = 0;
    this.nextWave = TIMING.firstWave; this.waveNo = 0;
    this.spawnQueue = [];
    this.empowered = { 1: 0, 2: 0 };  // 远古守卫：强化兵线截止时间
    this.visTimer = 0;
    this.grid = new Map();
    this.difficulty = opts.difficulty || 'normal';
    this.setupStructures();
    this.setupCamps();
    if (opts.picks) this.setupHeroes(opts.picks);
  }

  // —— 基础 API ——
  emit(ev) { ev.t = this.time; this.events.push(ev); }
  add(u) { this.units.push(u); this.byId.set(u.id, u); return u; }
  unitById(id) { return this.byId.get(id); }
  spawnProjectile(spec) { const p = new Projectile(this, spec); this.projectiles.push(p); return p; }
  addArea(spec) { const a = new Area(this, spec); this.areas.push(a); this.emit({ type: 'area', id: a.id, x: a.x, y: a.y, r: a.radius, delay: a.delay, dur: a.dur, visual: a.visual, color: a.color, team: a.team }); return a; }

  rebuildGrid() {
    const g = this.grid;
    g.clear();
    for (const u of this.units) {
      if (u.dead) continue;
      const k = ((u.x / CELL) | 0) * 1000 + ((u.y / CELL) | 0);
      let a = g.get(k);
      if (!a) g.set(k, (a = []));
      a.push(u);
    }
  }
  queryUnits(x, y, r, filter) {
    const out = [];
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    const r2 = r * r;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const a = this.grid.get(cx * 1000 + cy);
        if (!a) continue;
        for (const u of a) {
          if (u.dead) continue;
          if (dist2(x, y, u.x, u.y) > r2) continue;
          if (filter && !filter(u)) continue;
          out.push(u);
        }
      }
    }
    return out;
  }
  hasEnemyMinionsNear(target, r) {
    return this.queryUnits(target.x, target.y, r, (u) => u.kind === 'minion' && u.team !== target.team).length > 0;
  }

  // —— 初始化 ——
  setupStructures() {
    for (const t of TOWERS) this.towers.push(this.add(new Tower(this, t.team, t.tier, t.lane, t.x, t.y)));
    this.crystals = {};
    for (const team of [TEAM_BLUE, TEAM_RED]) {
      const c = CRYSTALS[team];
      const cr = this.add(new Tower(this, team, 'crystal', null, c.x, c.y));
      this.crystals[team] = cr; this.towers.push(cr);
      const f = FOUNTAINS[team];
      this.add(new Fountain(this, team, f.x, f.y));
    }
    for (const t of this.towers) t.visible = [true, true, true];
  }
  setupCamps() {
    for (const c of CAMPS) {
      const ct = CAMP_TYPES[c.type];
      const first = ct.respawn === 'drake' ? TIMING.drakeFirst : ct.respawn === 'guardian' ? TIMING.guardianFirst : TIMING.jungleFirst;
      this.camps.push({ ...c, def: ct, members: [], respawnAt: first, alive: false });
    }
  }
  setupHeroes(picks) {
    for (const team of [TEAM_BLUE, TEAM_RED]) {
      (picks[team] || []).forEach((p, i) => {
        const h = new Hero(this, p.heroId, team, { spell: p.spell, isPlayer: p.isPlayer, position: p.position, slot: i, autoLevel: p.autoLevel });
        this.heroes.push(this.add(h));
      });
    }
  }

  // —— 主循环 ——
  step(dt = DT) {
    this.events.length = 0;
    if (this.over) return;
    this.time += dt; this.tick++;
    this.rebuildGrid();
    this.updateSpawns(dt);
    for (const c of this.controllers) c.update(dt);
    for (const u of this.units) if (!u.removed) u.update(dt);
    for (const p of this.projectiles) p.update(dt);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    for (const a of this.areas) a.update(dt);
    this.areas = this.areas.filter((a) => !a.dead);
    this.separate(dt);
    this.economyTick(dt);
    this.visTimer -= dt;
    if (this.visTimer <= 0) { this.visTimer = 0.2; this.updateVision(); }
    // 清理死去的小兵 / 野怪
    if (this.units.some((u) => u.removed)) {
      this.units = this.units.filter((u) => {
        if (u.removed) { this.byId.delete(u.id); return false; }
        return true;
      });
    }
  }

  economyTick(dt) {
    for (const h of this.heroes) {
      h.goldFrac = (h.goldFrac || 0) + ECON.passiveGoldPerSec * dt;
      if (h.goldFrac >= 1) { const g = Math.floor(h.goldFrac); h.goldFrac -= g; h.gold += g; h.totalGold += g; }
      if (!h.dead) h.gainXp(ECON.passiveXpPerSec * dt);
    }
  }

  // 软碰撞：互相推开，重的推得少
  separate() {
    for (const [, a] of this.grid) {
      for (let i = 0; i < a.length; i++) {
        const u = a[i];
        if (u.dead || !u.mobile) continue;
        const near = this.queryUnits(u.x, u.y, u.radius + 1.8, (v) => v !== u && v.id > u.id);
        for (const v of near) {
          if (v.dead) continue;
          const rr = (u.radius + v.radius) * (u.kind === 'hero' || v.kind === 'hero' ? 0.75 : 0.9);
          const d2 = dist2(u.x, u.y, v.x, v.y);
          if (d2 >= rr * rr) continue;
          let d = Math.sqrt(d2);
          let nx, ny;
          if (d < 1e-4) { const a2 = this.rng.next() * 6.283; nx = Math.cos(a2); ny = Math.sin(a2); d = 0; }
          else { nx = (v.x - u.x) / d; ny = (v.y - u.y) / d; }
          const push = Math.min(0.12, (rr - d) * 0.5);
          const mu = u.mobile && !u.forced ? u.mass : 1e9, mv = v.mobile && !v.forced ? v.mass : 1e9;
          if (mu >= 1e9 && mv >= 1e9) continue;
          const ku = mv / (mu + mv), kv = mu / (mu + mv);
          if (ku > 0) this.nudge(u, -nx * push * ku * 2, -ny * push * ku * 2);
          if (kv > 0) this.nudge(v, nx * push * kv * 2, ny * push * kv * 2);
        }
      }
    }
  }
  nudge(u, dx, dy) {
    if (!u.mobile || u.forced || u.isStructure) return;
    const nx = u.x + dx, ny = u.y + dy;
    if (!this.nav.isBlocked(nx, ny)) { u.x = nx; u.y = ny; }
  }

  // —— 刷新：兵线、野怪、首领 ——
  updateSpawns(dt) {
    if (this.time >= this.nextWave) {
      this.waveNo++;
      this.nextWave += TIMING.waveInterval;
      const siege = this.waveNo % TIMING.siegeEvery === 0;
      const order = ['melee', 'melee', 'melee'];
      if (siege) order.push('siege');
      order.push('ranged', 'ranged');
      for (const team of [TEAM_BLUE, TEAM_RED]) {
        const enemy = enemyOf(team);
        for (const lane of Object.keys(LANES)) {
          const list = order.slice();
          const highDown = this.towers.some((t) => t.team === enemy && t.lane === lane && t.tier === 'high' && t.dead);
          if (highDown) list.unshift('super');
          list.forEach((m, i) => this.spawnQueue.push({ at: this.time + i * 0.9, team, lane, m }));
        }
      }
      this.emit({ type: 'wave', n: this.waveNo });
    }
    if (this.spawnQueue.length) {
      const scale = TIMING.minionScalePerMin * (this.time / 60);
      const rest = [];
      for (const s of this.spawnQueue) {
        if (s.at > this.time) { rest.push(s); continue; }
        const emp = this.empowered[s.team] > this.time;
        const mi = new Minion(this, s.team, s.lane, s.m, scale, emp);
        mi.offset = (this.rng.next() - 0.5) * 3;
        this.add(mi);
      }
      this.spawnQueue = rest;
    }
    for (const c of this.camps) {
      if (c.alive) {
        if (c.members.every((m) => m.dead)) {
          c.alive = false;
          const k = c.def.respawn;
          c.respawnAt = this.time + (k === 'buff' ? TIMING.buffRespawn : k === 'drake' ? TIMING.drakeRespawn : k === 'guardian' ? TIMING.guardianRespawn : TIMING.campRespawn);
          c.members = [];
        }
      } else if (this.time >= c.respawnAt) {
        c.alive = true;
        c.members = c.def.members.map(([mt, ox, oy]) => this.add(new Monster(this, c, mt, ox, oy)));
        if (c.def.respawn === 'drake' || c.def.respawn === 'guardian') this.emit({ type: 'announce', kind: 'bossSpawn', boss: c.type, text: `${c.def.name}已出现！`, x: c.x, y: c.y });
      }
    }
  }

  // —— 视野 ——
  updateVision() {
    const nav = this.nav;
    const srcs = { 1: [], 2: [] };
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.mobile) u.bush = nav.bushAt(u.x, u.y);
      if (u.team === 1 || u.team === 2) if (u.sight > 0) srcs[u.team].push(u);
    }
    for (const u of this.units) {
      if (u.dead || u.isStructure) continue;
      for (const T of [1, 2]) {
        if (u.team === T) { u.visible[T] = true; continue; }
        let vis = false;
        for (const s of srcs[T]) {
          const d2 = dist2(s.x, s.y, u.x, u.y);
          if (d2 > s.sight * s.sight) continue;
          if (u.bush >= 0 && u.revealT <= 0) {
            if (s.bush === u.bush || d2 <= VISION.bushReveal * VISION.bushReveal) { vis = true; break; }
            continue;
          }
          vis = true; break;
        }
        u.visible[T] = vis;
      }
    }
  }

  // —— 击杀结算 ——
  creditHero(killer, victim) {
    if (killer && killer.kind === 'hero') return killer;
    // 被小兵/塔/野怪击杀：归最后一个造成伤害的敌方英雄
    let best = null, bt = -1;
    for (const [id, t] of victim.damagedBy) {
      if (this.time - t > TIMING.assistWindow) continue;
      const h = this.unitById(id);
      if (h && h.kind === 'hero' && h.team !== victim.team && t > bt) { bt = t; best = h; }
    }
    return best;
  }
  nearbyHeroes(team, x, y, r) {
    return this.heroes.filter((h) => h.team === team && !h.dead && dist(h.x, h.y, x, y) <= r);
  }

  killUnit(target, killer) {
    if (target.dead) return;
    if (target.kind === 'hero' && target.tryRevive && target.tryRevive()) return;
    if (target.kind === 'hero') this.killHero(target, killer);
    else if (target.kind === 'minion') this.killMinion(target, killer);
    else if (target.kind === 'monster') this.killMonster(target, killer);
    else if (target.kind === 'tower' || target.kind === 'crystal') this.killTower(target, killer);
  }

  killHero(v, killer) {
    const k = this.creditHero(killer, v);
    const enemy = enemyOf(v.team);
    // 助攻：最近一段时间内伤害过它的其他敌方英雄
    const assists = [];
    for (const [id, t] of v.damagedBy) {
      if (this.time - t > TIMING.assistWindow) continue;
      const h = this.unitById(id);
      if (h && h.kind === 'hero' && h.team === enemy && h !== k && !assists.includes(h)) assists.push(h);
    }
    const shutdown = Math.min(ECON.maxStreakBonus, Math.max(0, v.streak - 1) * ECON.shutdownPerStreak);
    let bounty = ECON.heroKillGold + shutdown;
    const fb = !this.firstBlood;
    if (fb) { this.firstBlood = true; bounty += 100; }
    // Buff 转移
    const carried = v.buffs.filter((b) => b.key === 'blueBuff' || b.key === 'redBuff');
    v.onDeath();
    this.score[enemy]++;
    if (k) {
      k.kills++; k.streak++;
      k.multi = this.time - k.lastKillAt < 10 ? k.multi + 1 : 1;
      k.lastKillAt = this.time;
      k.gainGold(bounty, v.x, v.y);
      for (const b of carried) k.addBuff({ key: b.key, dur: Math.max(b.dur, 30), mods: b.mods, visual: b.visual });
    }
    if (assists.length) {
      const share = Math.round((bounty * ECON.assistShare) / assists.length);
      for (const a of assists) { a.assists++; a.gainGold(share, v.x, v.y); }
    }
    const xp = ECON.heroKillXpBase + ECON.heroKillXpPerLevel * v.level;
    const near = this.nearbyHeroes(enemy, v.x, v.y, ECON.shareRadius);
    if (k && !near.includes(k)) near.push(k);
    for (const h of near) h.gainXp(h === k ? xp : xp * 0.6);
    this.emit({ type: 'kill', killer: k ? k.id : 0, killerSrc: killer ? killer.id : 0, victim: v.id, assists: assists.map((a) => a.id),
      multi: k ? k.multi : 0, streak: k ? k.streak : 0, firstBlood: fb, shutdown: shutdown > 0, gold: bounty, team: enemy, x: v.x, y: v.y });
    this.emit({ type: 'death', unit: v.id, kind: 'hero', team: v.team, x: v.x, y: v.y, killer: killer ? killer.id : 0 });
  }

  killMinion(m, killer) {
    m.dead = true; m.hp = 0; m.removed = true;
    const enemy = enemyOf(m.team);
    const near = this.nearbyHeroes(enemy, m.x, m.y, ECON.shareRadius);
    const last = killer && killer.kind === 'hero' ? killer : null;
    if (last) {
      last.cs++;
      last.gainGold(m.gold, m.x, m.y, last.isPlayer);
    } else if (near.length) {
      const g = (m.gold * 0.6) / near.length;
      for (const h of near) h.gainGold(g, m.x, m.y, false);
    }
    if (near.length) {
      const xp = m.xp * (1 / near.length + 0.15);
      for (const h of near) h.gainXp(xp);
    }
    this.emit({ type: 'death', unit: m.id, kind: 'minion', team: m.team, mtype: m.mtype, x: m.x, y: m.y, killer: killer ? killer.id : 0, lastHit: !!last });
  }

  killMonster(m, killer) {
    m.dead = true; m.hp = 0; m.removed = true;
    const k = killer && killer.kind === 'hero' ? killer : (killer && killer.kind === 'minion' ? null : this.creditHero(killer, m));
    const d = m.def;
    if (k) {
      const bonus = k.hasPassive('jungle') ? 1.2 : 1;
      k.gainGold(d.gold * bonus, m.x, m.y, k.isPlayer);
      k.gainXp(d.xp * bonus);
      k.cs++;
      for (const h of this.nearbyHeroes(k.team, m.x, m.y, ECON.shareRadius)) if (h !== k) h.gainXp(d.xp * 0.4);
      if (d.buff === 'blue') {
        k.addBuff({ key: 'blueBuff', dur: TIMING.buffDuration, mods: { cdr: 0.1, mpRegen: 10 }, visual: 'blueBuff' });
        this.emit({ type: 'announce', kind: 'buff', buff: 'blue', hero: k.id, team: k.team, text: `${k.name}获得了蓝 Buff`, quiet: true });
      } else if (d.buff === 'red') {
        k.addBuff({ key: 'redBuff', dur: TIMING.buffDuration, visual: 'redBuff' });
        this.emit({ type: 'announce', kind: 'buff', buff: 'red', hero: k.id, team: k.team, text: `${k.name}获得了红 Buff`, quiet: true });
      }
      if (m.mtype === 'drake') {
        for (const h of this.heroes.filter((h) => h.team === k.team)) {
          h.gainGold(100, h.x, h.y, h.isPlayer);
          if (!h.dead) h.gainXp(100);
          h.addBuff({ key: 'drakeBuff', dur: TIMING.drakeBuffDuration, mods: { adPct: 0.08, apPct: 0.08 }, visual: 'drakeBuff', persistent: true });
        }
        this.emit({ type: 'announce', kind: 'objective', boss: 'drake', team: k.team, text: `${k.team === 1 ? '蓝方' : '红方'}击败了炎鳞龙！全队获得金币与攻击强化`, x: m.x, y: m.y });
      } else if (m.mtype === 'guardian') {
        for (const h of this.heroes.filter((h) => h.team === k.team)) {
          h.gainGold(150, h.x, h.y, h.isPlayer);
          if (!h.dead) h.gainXp(150);
          h.addBuff({ key: 'guardianBuff', dur: TIMING.guardianBuffDuration, mods: { hpRegen: 40, mpRegen: 10, dmgReduce: 0.08 }, visual: 'guardianBuff', persistent: true });
        }
        this.empowered[k.team] = this.time + TIMING.guardianBuffDuration;
        this.emit({ type: 'announce', kind: 'objective', boss: 'guardian', team: k.team, text: `${k.team === 1 ? '蓝方' : '红方'}击败了远古守卫！兵线得到强化`, x: m.x, y: m.y });
      }
    }
    this.emit({ type: 'death', unit: m.id, kind: 'monster', team: 0, mtype: m.mtype, x: m.x, y: m.y, killer: killer ? killer.id : 0 });
  }

  killTower(t, killer) {
    t.dead = true; t.hp = 0;
    const enemy = enemyOf(t.team);
    if (t.kind === 'crystal') {
      this.over = true; this.winner = enemy;
      this.emit({ type: 'death', unit: t.id, kind: 'crystal', team: t.team, x: t.x, y: t.y });
      this.emit({ type: 'victory', winner: enemy });
      return;
    }
    this.towersDown[enemy]++;
    const k = this.creditHero(killer, t) || (killer && killer.kind === 'hero' ? killer : null);
    if (k && dist(k.x, k.y, t.x, t.y) < 20) k.gainGold(ECON.towerLastHitGold, t.x, t.y);
    for (const h of this.heroes) if (h.team === enemy) h.gainGold(ECON.towerTeamGold, h.x, h.y, h.isPlayer && h !== k);
    // 解除后一座塔的保护
    const next = t.tier === 'outer' ? 'inner' : t.tier === 'inner' ? 'high' : null;
    if (next) { for (const o of this.towers) if (o.team === t.team && o.lane === t.lane && o.tier === next) o.protected = false; }
    else if (t.tier === 'high') this.crystals[t.team].protected = false;
    this.emit({ type: 'death', unit: t.id, kind: 'tower', team: t.team, tier: t.tier, lane: t.lane, x: t.x, y: t.y });
    this.emit({ type: 'towerDown', team: t.team, tier: t.tier, lane: t.lane, by: k ? k.id : 0, text: `${enemy === 1 ? '蓝方' : '红方'}摧毁了一座防御塔`, x: t.x, y: t.y });
  }

  // —— 查询辅助（AI / 界面使用）——
  teamHeroes(team) { return this.heroes.filter((h) => h.team === team); }
  aliveTowers(team, lane) { return this.towers.filter((t) => t.team === team && !t.dead && (lane === undefined || t.lane === lane)); }
}
