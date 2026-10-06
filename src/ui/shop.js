// 商店：分类浏览、推荐出装、购买与出售（任何位置都能买）
import { ITEMS, ITEM_BY_ID, ITEM_CATS, MAX_ITEMS } from '../data/items.js';
import { ECON } from '../config.js';
import { el, esc, onTap, sfx } from './common.js';
import { itemIcon } from './icons.js';

const STAT_NAMES = {
  ad: '物理攻击', ap: '法术攻击', maxHp: '最大生命', maxMp: '最大法力', armor: '物理防御', mr: '法术防御',
  ms: '移动速度', asBonus: '攻击速度', crit: '暴击率', critDmg: '暴击伤害', lifesteal: '物理吸血', spellVamp: '法术吸血',
  cdr: '冷却缩减', armorPenPct: '物理穿透', magicPenFlat: '法术穿透', magicPenPct: '法术穿透', hpRegen: '每秒回血', mpRegen: '每秒回蓝', tenacity: '韧性', healAmp: '治疗效果',
};
const PCT = new Set(['asBonus', 'crit', 'critDmg', 'lifesteal', 'spellVamp', 'cdr', 'armorPenPct', 'magicPenPct', 'tenacity', 'healAmp']);

export function statText(stats) {
  return Object.entries(stats).map(([k, v]) => `${STAT_NAMES[k] || k} +${PCT.has(k) ? Math.round(v * 100) + '%' : v}`).join('，');
}

/** 推荐的下一件装备（按英雄出装顺序，跳过已有的） */
export function nextRecommended(hero) {
  const build = hero.def.build || [];
  const own = hero.items;
  const hasAdvBoots = own.some((id) => ITEM_BY_ID[id].boots && id !== 'boots');
  for (const id of build) {
    if (own.includes(id)) continue;
    const it = ITEM_BY_ID[id];
    if (!it) continue;
    if (id === 'boots' && hasAdvBoots) continue;
    if (it.boots && id !== 'boots' && !own.includes('boots') && build.indexOf('boots') > build.indexOf(id)) continue;
    if (own.length >= MAX_ITEMS && !(it.boots && own.includes('boots'))) return null;
    return it;
  }
  return null;
}

export class Shop {
  constructor(wrap, { onBuy, onSell, onClose }) {
    this.wrap = wrap;
    this.cb = { onBuy, onSell, onClose };
    this.cat = 'rec';
    this.sel = null;       // { kind:'item', id } | { kind:'own', slot }
    this.open = false;
  }

  show(hero) {
    this.hero = hero;
    this.open = true;
    this.wrap.innerHTML = '';
    this.wrap.classList.add('on');
    const box = el('div', 'shop panel');
    box.innerHTML = `<div class="shop-head"></div>
      <div class="shop-body"><div class="shop-grid"></div>
        <div class="shop-side-panel"><div class="shop-detail"></div><div class="shop-owned"></div><div class="shop-act" style="display:flex;gap:0.5rem"></div></div></div>`;
    this.wrap.appendChild(box);
    this.box = box;
    const head = box.querySelector('.shop-head');
    const cats = [['rec', '推荐'], ...Object.entries(ITEM_CATS)];
    for (const [k, name] of cats) {
      const c = el('button', 'chip' + (k === this.cat ? ' on' : ''), name);
      c.dataset.cat = k;
      onTap(c, () => { this.cat = k; this.refresh(true); });
      head.appendChild(c);
    }
    head.appendChild(el('span', 'gold'));
    const close = el('button', 'icon-btn', '✕');
    onTap(close, () => this.close(), 'ui_close');
    head.appendChild(close);
    this.wrap.onpointerdown = (e) => { if (e.target === this.wrap) this.close(); };
    if (!this.sel) { const r = nextRecommended(hero); if (r) this.sel = { kind: 'item', id: r.id }; }
    this.refresh(true);
    sfx('ui_open');
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.wrap.classList.remove('on');
    this.wrap.innerHTML = '';
    this.cb.onClose && this.cb.onClose();
  }

  list() {
    if (this.cat === 'rec') return (this.hero.def.build || []).map((id) => ITEM_BY_ID[id]).filter(Boolean);
    return ITEMS.filter((it) => it.cat === this.cat);
  }

  refresh(full = false) {
    if (!this.open) return;
    const h = this.hero, box = this.box;
    box.querySelector('.gold').textContent = `💰 ${Math.floor(h.gold)}`;
    box.querySelectorAll('.shop-head .chip').forEach((c) => c.classList.toggle('on', c.dataset.cat === this.cat));
    const grid = box.querySelector('.shop-grid');
    const sig = `${this.cat}|${Math.floor(h.gold)}|${h.items.join(',')}|${this.sel ? this.sel.kind + this.sel.id + this.sel.slot : ''}`;
    if (!full && sig === this.sig) return;
    this.sig = sig;
    grid.innerHTML = '';
    for (const it of this.list()) {
      const cost = h.buyCost(it.id);
      const cell = el('div', 'shop-item' + (h.canBuy(it.id) ? '' : ' cant') + (h.items.includes(it.id) ? ' owned' : '') + (this.sel && this.sel.kind === 'item' && this.sel.id === it.id ? ' sel' : ''));
      cell.innerHTML = `<img src="${itemIcon(it)}"><div class="nm">${esc(it.name)}</div><div class="pr">${cost}</div>`;
      onTap(cell, () => { this.sel = { kind: 'item', id: it.id }; this.refresh(true); }, 'ui_hover');
      cell.addEventListener('dblclick', () => this.buy(it.id));
      grid.appendChild(cell);
    }
    // 已有装备
    const own = box.querySelector('.shop-owned');
    own.innerHTML = '';
    for (let i = 0; i < MAX_ITEMS; i++) {
      const id = h.items[i];
      const slot = el('div', 'item-slot' + (this.sel && this.sel.kind === 'own' && this.sel.slot === i ? ' sel' : ''));
      if (id) {
        slot.innerHTML = `<img src="${itemIcon(ITEM_BY_ID[id])}">`;
        onTap(slot, () => { this.sel = { kind: 'own', slot: i }; this.refresh(true); }, 'ui_hover');
      }
      own.appendChild(slot);
    }
    // 详情与按钮
    const det = box.querySelector('.shop-detail');
    const act = box.querySelector('.shop-act');
    act.innerHTML = '';
    det.innerHTML = '<p>点击装备查看详情，双击直接购买。</p>';
    if (this.sel && this.sel.kind === 'item') {
      const it = ITEM_BY_ID[this.sel.id];
      const cost = h.buyCost(it.id);
      det.innerHTML = `<div class="hd"><img src="${itemIcon(it)}"><div><b>${esc(it.name)}</b><div style="color:var(--gold)">💰 ${cost}${cost !== it.cost ? `（原价 ${it.cost}）` : ''}</div></div></div>
        <p>${esc(statText(it.stats))}</p>${it.desc ? `<p>${esc(it.desc)}</p>` : ''}`;
      const b = el('button', 'btn primary small', h.canBuy(it.id) ? '购买' : h.gold < cost ? '金币不足' : '无法购买');
      b.style.flex = '1';
      b.disabled = !h.canBuy(it.id);
      onTap(b, () => this.buy(it.id), null);
      act.appendChild(b);
    } else if (this.sel && this.sel.kind === 'own' && h.items[this.sel.slot]) {
      const it = ITEM_BY_ID[h.items[this.sel.slot]];
      det.innerHTML = `<div class="hd"><img src="${itemIcon(it)}"><div><b>${esc(it.name)}</b></div></div><p>${esc(statText(it.stats))}</p>${it.desc ? `<p>${esc(it.desc)}</p>` : ''}`;
      const b = el('button', 'btn red small', `出售 +${Math.floor(it.cost * ECON.sellRatio)}`);
      b.style.flex = '1';
      onTap(b, () => { this.cb.onSell(this.sel.slot); this.sel = null; this.refresh(true); }, null);
      act.appendChild(b);
    }
  }

  buy(id) {
    if (!this.hero.canBuy(id)) { sfx('ui_error'); return; }
    this.cb.onBuy(id);
    this.refresh(true);
  }
}
