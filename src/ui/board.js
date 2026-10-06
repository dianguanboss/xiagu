// 计分表：对局中按 Tab 查看，结算页也用它
import { ITEM_BY_ID } from '../data/items.js';
import { POSITIONS } from '../data/heroes.js';
import { el, esc, portrait } from './common.js';
import { itemIcon } from './icons.js';

/** 评分：击杀参与、伤害、承伤、经济综合，用于 MVP */
export function heroRating(h, world) {
  const teamKills = Math.max(1, world.score[h.team]);
  const kp = (h.kills + h.assists) / teamKills;
  const all = world.heroes.filter((x) => x.team === h.team);
  const share = (k) => { const tot = all.reduce((s, x) => s + (x[k] || 0), 0) || 1; return (h[k] || 0) / tot; };
  const r = 3 + kp * 4 + share('heroDmg') * 6 + share('dmgTaken') * 3 + share('totalGold') * 3 + h.kills * 0.3 - h.deaths * 0.45;
  return Math.max(1, Math.min(16, r));
}

export function renderBoard(container, world, playerId, { final = false } = {}) {
  container.innerHTML = '';
  const mvp = {};
  if (final) {
    for (const team of [1, 2]) {
      let best = null, br = -1;
      for (const h of world.heroes) if (h.team === team) { const r = heroRating(h, world); if (r > br) { br = r; best = h; } }
      if (best) mvp[team] = best.id;
    }
  }
  for (const team of [1, 2]) {
    const box = el('div', `team t${team}`);
    const gold = world.heroes.filter((h) => h.team === team).reduce((s, h) => s + h.totalGold, 0);
    box.appendChild(el('h3', '', `<span>${team === 1 ? '蓝方' : '红方'} · 击杀 ${world.score[team]}</span><span style="color:var(--gold)">经济 ${(gold / 1000).toFixed(1)}k</span>`));
    for (const h of world.heroes.filter((x) => x.team === team)) {
      const row = el('div', 'b-row' + (h.id === playerId ? ' me' : '') + (h.dead && !final ? ' dead' : ''));
      const tag = mvp[team] === h.id ? ` <span class="mvp">${world.winner === team ? 'MVP' : '虽败犹荣'}</span>` : '';
      row.innerHTML = `
        <img class="pt" src="${portrait(h.def)}">
        <div class="nm">${esc(h.name)}${tag}<small>${POSITIONS[h.position] || ''} · ${h.level} 级${h.id === playerId ? ' · 你' : h.isPlayer ? '' : ' · 电脑'}</small></div>
        <div class="kda">${h.kills}/${h.deaths}/${h.assists}</div>
        <div class="cs" title="补刀">${h.cs}</div>
        <div class="gold">${h.totalGold}</div>`;
      const items = el('div', 'items');
      for (const id of h.items) { const it = ITEM_BY_ID[id]; if (it) { const im = el('img'); im.src = itemIcon(it); im.title = it.name; items.appendChild(im); } }
      row.appendChild(items);
      box.appendChild(row);
    }
    container.appendChild(box);
  }
}
