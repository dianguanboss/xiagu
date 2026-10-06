// 界面公用：建元素、头像、时间格式、技能描述数值填充
import { HERO_BY_ID, calcVal } from '../data/heroes.js';
import { fallbackPortrait } from './icons.js';
import audio from '../audio/audio.js';

let PORTRAITS = {};
export function setPortraits(map) { PORTRAITS = { ...PORTRAITS, ...map }; }
export function portrait(idOrDef) {
  const def = typeof idOrDef === 'string' ? HERO_BY_ID[idOrDef] : idOrDef;
  if (!def) return '';
  return PORTRAITS[def.id] || fallbackPortrait(def);
}

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function fmtTime(t) {
  t = Math.max(0, Math.floor(t));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function sfx(name, opts) { audio.play(name, opts); }

/** 按钮点击：带音效，并防止触屏上的重复触发 */
export function onTap(node, fn, sound = 'ui_click') {
  node.addEventListener('click', (e) => { e.stopPropagation(); if (sound) sfx(sound); fn(e); });
}

const TARGET_NAMES = { dir: '指向', point: '范围', unit: '指定目标', self: '自身' };
export const targetName = (t) => TARGET_NAMES[t] || '';

// 选英雄时：显示"基础值（+加成）"
function ratioText(spec) {
  const parts = [];
  const pct = (v) => `${Math.round(v * 100)}%`;
  if (spec.ad) parts.push(`${pct(spec.ad)}物攻`);
  if (spec.bonusAd) parts.push(`${pct(spec.bonusAd)}额外物攻`);
  if (spec.ap) parts.push(`${pct(spec.ap)}法强`);
  if (spec.maxHp) parts.push(`${pct(spec.maxHp)}最大生命`);
  if (spec.lvl) parts.push(`每级+${spec.lvl}`);
  return parts.length ? `（+${parts.join('+')}）` : '';
}

/** 把描述中的 {name} 换成数值。hero 为空时显示 1 级基础值和加成比例 */
export function fillDesc(desc, vals, hero = null, lvl = 1) {
  if (!desc) return '';
  return esc(desc).replace(/\{(\w+)\}/g, (_, k) => {
    const spec = vals && vals[k];
    if (!spec) return '?';
    if (hero) return `<b class="num">${calcVal(spec, hero, Math.max(1, lvl))}</b>`;
    const b = spec.base[0];
    return `<b class="num">${b}</b>${ratioText(spec)}`;
  });
}

export const DIFF_NAMES = { easy: '简单', normal: '普通', hard: '困难' };
