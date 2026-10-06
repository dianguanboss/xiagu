// 对局事件 → 音效。纯函数：只决定"播什么、在哪播、多大声"，真正发声由调用方完成（便于无界面测试）

// 每个英雄三个技能的音效
export const SKILL_SFX = {
  liefeng: ['dash', 'whirl', 'slam'],
  kuanglang: ['dash', 'howl', 'buff'],
  yingren: ['blink', 'arrow_shoot', 'slam'],
  yanji: ['fireball', 'burn', 'meteor'],
  shuangyu: ['ice_cast', 'freeze', 'wind'],
  zhufeng: ['arrow_shoot', 'wind', 'thunder'],
  leihuo: ['dash', 'explosion', 'gun_shot'],
  lingquan: ['heal', 'root', 'shield'],
  zhenyue: ['chain', 'howl', 'bell'],
  yangang: ['dash', 'slam', 'knockup'],
};

const SHOOT = { arrow: 'arrow_shoot', bullet: 'gun_shot', fire: 'magic_shoot', ice: 'magic_shoot', water: 'magic_shoot', basic: 'magic_shoot' };
const LAND = { arrow: 'arrow_hit', bullet: 'arrow_hit', fire: 'magic_hit', ice: 'ice_hit', water: 'magic_hit', basic: 'magic_hit' };
const PROJ_HIT = { fireball: 'explosion', icelance: 'ice_hit', grenade: 'explosion', chain: 'chain', shuriken: 'arrow_hit', tracer: 'arrow_hit', vine: 'root' };
const SPELL = { flash: 'blink', smite: 'slam', heal: 'heal' };
const CC = { stun: 'stun', knockup: 'knockup', freeze: 'freeze', root: 'root' };

/**
 * ctx: { playerId, spectate, isVisible(x, y) }
 * 返回 [{ name, x, y, volume }]，x 为 undefined 时表示不分位置（界面音）
 */
export function soundsForEvents(events, world, ctx) {
  const out = [];
  const me = ctx.playerId;
  const seen = (x, y) => ctx.spectate || x === undefined || ctx.isVisible(x, y);
  const at = (name, ev, volume = 1) => { if (seen(ev.x, ev.y)) out.push({ name, x: ev.x, y: ev.y, volume }); };
  const ui = (name, volume = 1) => out.push({ name, volume });
  for (const ev of events) {
    switch (ev.type) {
      case 'attack': {
        const s = world.unitById(ev.src);
        if (!s) break;
        const mine = s.id === me;
        if (s.kind === 'hero') at(s.ranged ? SHOOT[s.projStyle] || 'magic_shoot' : 'swing', ev, mine ? 0.85 : 0.55);
        else if (s.kind === 'tower') at('tower_shot', ev, 0.8);
        else if (s.projStyle === 'cannon') at('gun_shot', ev, 0.3);
        break;
      }
      case 'hit': {
        const s = world.unitById(ev.src);
        const mine = ev.src === me;
        if (ev.crit) { at('crit', ev, mine ? 1 : 0.7); break; }
        if (ev.kind === 'hero') {
          if (s && s.ranged) at(LAND[s.projStyle] || 'magic_hit', ev, mine ? 0.8 : 0.5);
          else at(s && s.def && s.def.roles.includes('tank') ? 'hit_heavy' : 'hit_melee', ev, mine ? 0.85 : 0.55);
        } else if (ev.kind === 'tower') at('tower_hit', ev, 0.75);
        else if (ev.kind === 'monster') at('hit_heavy', ev, 0.45);
        else if (ev.target === me) at('hit_melee', ev, 0.35);
        break;
      }
      case 'cast': {
        const list = SKILL_SFX[ev.heroId];
        const h = world.unitById(ev.hero);
        if (list && h) at(list[ev.slot], { x: h.x, y: h.y }, ev.hero === me ? 1 : 0.8);
        break;
      }
      case 'projHit': if (PROJ_HIT[ev.style]) at(PROJ_HIT[ev.style], ev, 0.6); break;
      case 'spell': if (SPELL[ev.spell]) at(SPELL[ev.spell], ev, ev.hero === me ? 1 : 0.8); break;
      case 'cc': if (CC[ev.kind]) at(CC[ev.kind], ev, 0.7); break;
      case 'fx':
        if (ev.name === 'shield') at('shield', ev, 0.6);
        else if (ev.name === 'revive') at('heal', ev, 0.9);
        else if (ev.name === 'quake') at('slam', ev, 0.8);
        break;
      case 'death':
        if (ev.kind === 'hero') at('hero_die', ev, ev.unit === me ? 1 : 0.8);
        else if (ev.kind === 'minion') { if (ev.killer === me) at('minion_die', ev, 0.4); }
        else if (ev.kind === 'monster') at('monster_die', ev, 0.7);
        else if (ev.kind === 'tower') at('tower_destroy', ev, 1);
        else if (ev.kind === 'crystal') ui('crystal_destroy', 1);
        break;
      case 'levelUp': if (ev.hero === me) ui('level_up', 0.9); break;
      case 'gold': if (ev.hero === me && ev.amount >= 15) ui('gold', 0.45); break;
      case 'recallStart': if (ev.hero === me) ui('recall_start', 0.8); break;
      case 'recallEnd': if (ev.hero === me) ui('recall_end', 0.9); break;
      case 'respawn': if (ev.hero === me) ui('respawn', 0.9); break;
      case 'buy': if (ev.hero === me) ui('ui_buy', 0.9); break;
      case 'sell': if (ev.hero === me) ui('ui_sell', 0.9); break;
      case 'skillUp': if (ev.hero === me) ui('skill_up', 0.9); break;
      default: break;
    }
  }
  return out;
}

/**
 * 对局事件 → 飘字。返回 [{ x, y, h, text, style }]
 * 玩家：自己打出的伤害、自己受到的伤害、自己的治疗和金币；观战：英雄之间的伤害
 */
export function floatsForEvents(events, world, ctx) {
  const out = [];
  const me = ctx.playerId;
  for (const ev of events) {
    if (ev.type === 'damage') {
      if (ev.amount < 1) continue;
      const t = world.unitById(ev.target);
      const h = t && t.kind === 'hero' ? 2.6 : t && t.isStructure ? 5 : 1.8;
      if (!ctx.spectate && ev.target === me) out.push({ x: ev.x, y: ev.y, h, text: `-${ev.amount}`, style: 'taken' });
      else if (!ctx.spectate && ev.src === me) out.push({ x: ev.x, y: ev.y, h, text: String(ev.amount), style: ev.crit ? 'crit' : ev.dtype === 'magic' ? 'magic' : ev.dtype === 'true' ? 'true' : 'phys' });
      else if (ctx.spectate && t && t.kind === 'hero' && ev.amount >= 30) {
        const s = world.unitById(ev.src);
        if (s && s.kind === 'hero') out.push({ x: ev.x, y: ev.y, h, text: String(ev.amount), style: ev.crit ? 'crit' : ev.dtype === 'magic' ? 'magic' : 'phys' });
      }
    } else if (ev.type === 'heal') {
      if (ev.target === me && ev.amount >= 15) out.push({ x: ev.x, y: ev.y, h: 2.8, text: `+${ev.amount}`, style: 'heal' });
    } else if (ev.type === 'gold') {
      if (ev.hero === me) out.push({ x: ev.x, y: ev.y, h: 2.2, text: `+${ev.amount}`, style: 'gold' });
    } else if (ev.type === 'levelUp') {
      if (ev.hero === me) out.push({ x: ev.x, y: ev.y, h: 3.2, text: '升级！', style: 'xp' });
    }
  }
  return out;
}
