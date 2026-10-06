// 玩家设置：保存在浏览器本地（读写失败时用默认值，不影响游戏）
const KEY = 'xgzd.settings.v1';

export const DEFAULTS = {
  master: 0.8,
  music: 0.55,
  sfx: 0.9,
  quality: 'auto',        // auto | low | medium | high
  difficulty: 'normal',   // easy | normal | hard
  autoLevel: false,       // 自动加点
  showFps: false,
  camLock: true,          // 镜头锁定英雄
  lastHero: 'liefeng',
  lastPosition: '',
  lastSpell: '',
};

let cache = null;

export function loadSettings() {
  if (cache) return cache;
  let saved = {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) saved = JSON.parse(raw) || {};
  } catch (e) { saved = {}; }
  cache = { ...DEFAULTS, ...saved };
  return cache;
}

export function saveSettings(patch) {
  cache = { ...loadSettings(), ...patch };
  try { window.localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* 本地存储不可用时只在本次生效 */ }
  return cache;
}

/** 根据设备推断画质 */
export function resolveQuality(q) {
  if (q && q !== 'auto') return q;
  const touch = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (touch) return cores >= 8 ? 'medium' : 'low';
  return cores >= 8 ? 'high' : 'medium';
}
