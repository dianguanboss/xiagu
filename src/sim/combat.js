// 伤害结算、治疗、护盾、控制效果
import { TIMING, VISION, TOWER_NO_MINION_REDUCTION } from '../config.js';

// 防御减伤：伤害 × 602 / (602 + 有效防御)
export function mitigate(def, penPct, penFlat) {
  const eff = Math.max(0, def * (1 - penPct) - penFlat);
  return 602 / (602 + eff);
}

/**
 * 造成伤害。type: 'phys' | 'magic' | 'true'
 * opts: { attack: 普攻, skill: 技能, crit, aoe, noVamp, tag: 说明, noEvent }
 * 返回实际扣除的生命值（不含护盾吸收）
 */
export function dealDamage(world, src, target, amount, type, opts = {}) {
  if (!target || target.dead || target.invuln || amount <= 0) return 0;
  let dmg = amount;
  const ss = src ? src.stats : null;
  const ts = target.stats;

  if (type === 'phys') dmg *= mitigate(ts.armor, ss ? ss.armorPenPct : 0, ss ? ss.armorPenFlat : 0);
  else if (type === 'magic') dmg *= mitigate(ts.mr, ss ? ss.magicPenPct : 0, ss ? ss.magicPenFlat : 0);

  if (ss) dmg *= 1 + (ss.dmgAmp || 0);
  dmg *= 1 - Math.min(0.8, ts.dmgReduce || 0);
  if (opts.attack && target.kind === 'hero' && target.attackReduce) dmg *= 1 - target.attackReduce;

  if (src && src.kind === 'hero') {
    if (target.kind === 'monster' && src.hasPassive('jungle')) dmg *= 1.3;
    // 防御塔/水晶：附近没有敌方小兵时，受英雄伤害减半
    if (target.isStructure && !world.hasEnemyMinionsNear(target, target.stats.range + 2)) dmg *= TOWER_NO_MINION_REDUCTION;
  }
  if (target.onBeforeDamage) dmg = target.onBeforeDamage(src, dmg, type, opts);

  dmg = Math.max(0, dmg);
  // 护盾吸收
  let absorbed = 0;
  if (target.shieldTotal > 0) {
    for (const b of target.buffs) {
      if (b.shield > 0 && dmg > 0) {
        const a = Math.min(b.shield, dmg);
        b.shield -= a; dmg -= a; absorbed += a;
        if (b.shield <= 0) b.dur = 0;
      }
    }
    target.calcShield();
  }
  const dealt = Math.min(target.hp, dmg);
  target.hp -= dealt;

  // 战斗标记、助攻记录、暴露视野
  target.lastDamagedAt = world.time;
  if (src) {
    src.lastCombatAt = world.time;
    if (src.kind === 'hero') {
      target.damagedBy.set(src.id, world.time);
      if (target.kind === 'hero') src.revealT = Math.max(src.revealT, VISION.attackReveal);
      src.dmgDealt = (src.dmgDealt || 0) + dealt + absorbed;
      if (target.kind === 'hero') src.heroDmg = (src.heroDmg || 0) + dealt + absorbed;
    }
    if (target.kind === 'hero') target.dmgTaken = (target.dmgTaken || 0) + dealt + absorbed;
    // 吸血
    if (!opts.noVamp && dealt + absorbed > 0) {
      let vamp = 0;
      if (opts.attack) vamp = ss.lifesteal || 0;
      else if (opts.skill) vamp = (ss.spellVamp || 0) * (opts.aoe ? 0.4 : 1);
      if (vamp > 0 && target.kind === 'monster' && src.monsterVampMul) vamp *= src.monsterVampMul;
      if (vamp > 0 && !target.isStructure) heal(world, src, src, (dealt + absorbed) * vamp, true);
    }
  }
  if (!opts.noEvent) {
    world.emit({ type: 'damage', target: target.id, src: src ? src.id : 0, amount: Math.round(dealt + absorbed), dtype: type, crit: !!opts.crit, x: target.x, y: target.y });
  }
  if (src && src.onDealtDamage) src.onDealtDamage(target, dealt + absorbed, type, opts);
  if (target.onDamaged) target.onDamaged(src, dealt + absorbed, type, opts);
  if (target.hp <= 0.001 && !target.dead) world.killUnit(target, src);
  return dealt;
}

export function heal(world, src, target, amount, quiet = false) {
  if (!target || target.dead || amount <= 0) return 0;
  const amp = 1 + (target.stats.healAmp || 0) + (target.healBlock ? -0.5 : 0);
  const h = Math.min(target.stats.maxHp - target.hp, amount * amp);
  if (h <= 0) return 0;
  target.hp += h;
  if (!quiet && h > 20) world.emit({ type: 'heal', target: target.id, amount: Math.round(h), x: target.x, y: target.y });
  return h;
}

export function addShield(world, src, target, amount, dur, key = 'shield') {
  if (!target || target.dead) return;
  target.addBuff({ key, src, dur, shield: amount, visual: 'shield', perSource: true });
  world.emit({ type: 'fx', name: 'shield', target: target.id, x: target.x, y: target.y });
}

// —— 控制效果 ——（韧性缩短时长；首领免疫位移和硬控）
function ccDur(target, dur) {
  return dur * (1 - Math.min(0.7, target.stats.tenacity || 0));
}

export function stun(world, src, target, dur) {
  if (target.ccImmune || target.dead) return;
  target.addBuff({ key: 'stun', src, dur: ccDur(target, dur), stun: true, visual: 'stun', cc: true });
  target.interrupt();
  world.emit({ type: 'cc', kind: 'stun', target: target.id, x: target.x, y: target.y });
}
export function root(world, src, target, dur) {
  if (target.ccImmune || target.dead) return;
  target.addBuff({ key: 'root', src, dur: ccDur(target, dur), root: true, visual: 'root', cc: true });
  world.emit({ type: 'cc', kind: 'root', target: target.id, x: target.x, y: target.y });
}
export function freeze(world, src, target, dur) {
  if (target.ccImmune || target.dead) return;
  target.addBuff({ key: 'freeze', src, dur: ccDur(target, dur), stun: true, visual: 'freeze', cc: true });
  target.interrupt();
  world.emit({ type: 'cc', kind: 'freeze', target: target.id, x: target.x, y: target.y });
}
export function silence(world, src, target, dur) {
  if (target.ccImmune || target.dead) return;
  target.addBuff({ key: 'silence', src, dur: ccDur(target, dur), silence: true, visual: 'silence', cc: true });
}
export function slow(world, src, target, pct, dur, key = 'slow') {
  if (target.dead || target.isStructure) return;
  if (target.ccImmune) pct *= 0.3;
  target.addBuff({ key, src, dur: ccDur(target, dur), slow: pct, visual: 'slow', perSource: true });
}
export function knockup(world, src, target, dur) {
  if (target.ccImmune || target.dead) return;
  const d = ccDur(target, dur);
  target.addBuff({ key: 'airborne', src, dur: d, stun: true, airborne: true, visual: 'airborne', cc: true, total: d });
  target.interrupt();
  world.emit({ type: 'cc', kind: 'knockup', target: target.id, x: target.x, y: target.y });
}
// 强制位移：击退 / 拉拽
export function displace(world, target, tx, ty, speed, opts = {}) {
  if (target.ccImmune || target.dead || target.isStructure) return;
  const p = world.nav.clipMove(target.x, target.y, tx, ty);
  target.forced = { tx: p.x, ty: p.y, sx: target.x, sy: target.y, speed, hit: null, onEnd: opts.onEnd || null, cc: true };
  target.interrupt();
  if (target.path) target.path = null;
}

export function inCombat(unit, time) {
  return time - Math.max(unit.lastDamagedAt, unit.lastCombatAt) < TIMING.combatTag;
}
