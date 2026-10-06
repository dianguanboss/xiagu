// 入口：识别触屏、解锁声音、启动游戏。网址参数（调试用）：
//   ?touch=1 强制触屏界面   ?play=英雄id 直接开局   ?spectate=1&speed=4 直接观战
//   ?seed=123 固定随机种子   ?difficulty=easy|normal|hard   ?models=placeholder 用占位模型
import { Game } from './game.js';
import audio from './audio/audio.js';
import { HERO_BY_ID } from './data/heroes.js';

const q = new URLSearchParams(location.search);
const boot = document.getElementById('boot');
const bootMsg = boot.querySelector('.msg');
const bootBar = boot.querySelector('.bar i');
const setBoot = (k, msg) => { bootBar.style.width = `${Math.round(k * 100)}%`; if (msg) bootMsg.textContent = msg; };

function showError(msg) {
  if (boot.classList.contains('done')) return;
  boot.classList.add('err');
  bootMsg.textContent = '启动失败：' + msg + '（请用新版 Chrome / Safari / Edge 打开，或刷新重试）';
}
window.addEventListener('error', (e) => showError(e.message || String(e.error)));
window.addEventListener('unhandledrejection', (e) => showError((e.reason && e.reason.message) || String(e.reason)));

// 触屏识别：主指针是手指，或者网址里强制
const touch = q.get('touch') === '1' || (q.get('touch') !== '0' && matchMedia('(pointer: coarse)').matches);
document.body.classList.toggle('touch', touch);

// 浏览器要求用户先点一下才能出声；手机上顺便尝试全屏 + 锁定横屏
let unlocked = false;
const unlock = () => {
  audio.unlock();
  if (unlocked) return;
  unlocked = true;
  if (touch && document.documentElement.requestFullscreen && !document.fullscreenElement) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}))
      .catch(() => {});
  }
};
window.addEventListener('pointerdown', unlock, true);
window.addEventListener('keydown', unlock, true);
// 手机上禁止双指缩放页面
document.addEventListener('gesturestart', (e) => e.preventDefault());

async function start() {
  setBoot(0.15, '正在生成模型与贴图…');
  await new Promise((r) => requestAnimationFrame(() => r()));
  const game = new Game();
  window.game = game;   // 方便在控制台调试
  await game.init({ placeholder: q.get('models') === 'placeholder' });
  setBoot(1, '准备就绪');
  boot.classList.add('done');
  setTimeout(() => boot.remove(), 600);
  const difficulty = q.get('difficulty') || undefined;
  const seed = q.get('seed') ? +q.get('seed') : undefined;
  if (q.get('spectate') === '1') {
    game.startMatch({ difficulty, seed, speed: +q.get('speed') || 1 }, true);
  } else if (q.get('play') && HERO_BY_ID[q.get('play')]) {
    game.startMatch({ playerHero: q.get('play'), difficulty, seed, autoLevel: q.get('auto') === '1' }, false);
  } else {
    game.menus.showMain();
  }
}

start().catch((e) => { console.error(e); showError(e.message || String(e)); });
