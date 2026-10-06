// 组装一局比赛：阵容分配（每方 5 个位置、同队不重复）、召唤师技能、电脑 AI
import { HEROES, HERO_BY_ID } from '../data/heroes.js';
import { RNG } from '../util/rng.js';
import { World } from './world.js';
import { attachBots } from './ai/bot.js';

export const POS_ORDER = ['top', 'jungle', 'mid', 'adc', 'support'];

export function defaultSpell(position) {
  return position === 'jungle' ? 'smite' : position === 'support' ? 'heal' : 'flash';
}

/** 为一方补齐 5 个位置。fixed: { heroId, position, spell, isPlayer } 可选 */
export function fillTeam(rng, fixed = null) {
  const used = new Set();
  const out = {};
  if (fixed) { out[fixed.position] = fixed; used.add(fixed.heroId); }
  // 选择面窄的位置先选，避免后面没人可选
  const open = POS_ORDER.filter((p) => !out[p]);
  open.sort((a, b) => HEROES.filter((h) => h.positions.includes(a)).length - HEROES.filter((h) => h.positions.includes(b)).length);
  for (const pos of open) {
    let cands = HEROES.filter((h) => h.positions.includes(pos) && !used.has(h.id));
    if (!cands.length) cands = HEROES.filter((h) => !used.has(h.id));
    const h = rng.pick(cands);
    used.add(h.id);
    out[pos] = { heroId: h.id, position: pos, spell: defaultSpell(pos), isPlayer: false };
  }
  return POS_ORDER.map((p) => out[p]);
}

/**
 * opts: { seed, difficulty, playerHero, playerPosition, playerSpell, autoLevel, spectate }
 * 返回 { world, player, ai: { 1: {brain,bots}, 2: {brain,bots} } }
 */
export function createMatch(opts = {}) {
  const seed = opts.seed ?? ((Math.random() * 1e9) | 0);
  const rng = new RNG(Math.imul(seed ^ 0x5bd1e995, 2654435761) >>> 0);
  const difficulty = opts.difficulty || 'normal';
  let fixed = null;
  if (!opts.spectate && opts.playerHero) {
    const def = HERO_BY_ID[opts.playerHero];
    const position = opts.playerPosition || def.positions[0];
    fixed = { heroId: def.id, position, spell: opts.playerSpell || defaultSpell(position), isPlayer: true, autoLevel: !!opts.autoLevel };
  }
  const picks = { 1: fillTeam(rng, fixed), 2: fillTeam(rng) };
  const world = new World({ seed, picks, difficulty });
  const player = world.heroes.find((h) => h.isPlayer) || null;
  const ai = {
    1: attachBots(world, 1, 'normal', player),
    2: attachBots(world, 2, difficulty),
  };
  world.player = player;
  world.ai = ai;
  return { world, player, ai, seed };
}
