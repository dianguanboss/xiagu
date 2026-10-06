// 游戏主控：菜单 ↔ 对局切换、逐帧推进模拟、把事件分发给画面 / 界面 / 音效、结算
import { DT, enemyOf } from './config.js';
import { createMatch } from './sim/match.js';
import { HEROES } from './data/heroes.js';
import { Renderer } from './render/renderer.js';
import * as placeholderModels from './render/placeholder_models.js';
import { Menus } from './ui/menu.js';
import { Hud } from './ui/hud.js';
import { Input } from './input.js';
import { el, setPortraits } from './ui/common.js';
import { loadSettings, saveSettings, resolveQuality } from './settings.js';
import { soundsForEvents, floatsForEvents } from './eventsounds.js';
import audio from './audio/audio.js';

const MODEL_FNS = ['createHeroModel', 'createMinionModel', 'createMonsterModel', 'createTowerModel', 'createCrystalModel', 'createFountainModel'];
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/** 加载正式模型；缺少的部分用占位模型补上，整个模块出错时全部用占位模型 */
async function loadModels(forcePlaceholder) {
  if (forcePlaceholder) return placeholderModels;
  try {
    const m = await import('./render/models/index.js');
    const out = { ...placeholderModels };
    for (const k of MODEL_FNS) if (typeof m[k] === 'function') out[k] = m[k];
    return out;
  } catch (e) {
    console.warn('正式模型加载失败，改用占位模型：', e);
    return placeholderModels;
  }
}

export class Game {
  constructor() {
    this.view = document.getElementById('view');
    this.hudRoot = document.getElementById('hud');
    this.screens = document.getElementById('screens');
    this.settings = loadSettings();
    this.renderer = null;
    this.menus = null;
    this.hud = null;
    this.input = null;
    this.world = null;          // 正在进行的对局（结算后清空）
    this.player = null;
    this.spectate = false;
    this.speed = 1;
    this.paused = false;
    this.ending = null;
    this.acc = 0;
    this.last = 0;
    this.fps = 60;
    this.frame = this.frame.bind(this);
  }

  get camLock() { return this.settings.camLock; }

  async init({ placeholder = false } = {}) {
    const s = this.settings;
    audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
    this.models = await loadModels(placeholder);
    this.createRenderer();
    setPortraits(this.renderer.makePortraits(HEROES));
    this.hooks = {
      renderer: this.renderer,
      onStart: (o) => this.startMatch(o, false),
      onSpectate: (o) => this.startMatch(o, true),
      onQuit: () => this.stopMatch(),
      onResume: () => this.resume(),
      onSurrender: () => this.surrender(),
      onSettingsChanged: (st) => this.applySettings(st),
    };
    this.menus = new Menus(this.screens, this.hooks);
    window.addEventListener('resize', () => { if (this.hud && this.hud.resetJoy) this.hud.resetJoy(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.world && !this.spectate && !this.paused && !this.ending) this.pause();
    });
    requestAnimationFrame(this.frame);
  }

  /** 按当前画质建渲染器；画质变了就重建（旧的释放掉） */
  createRenderer() {
    const q = resolveQuality(this.settings.quality);
    if (this.renderer) {
      if (this.renderer.quality === q) return;
      const old = this.renderer;
      old.resize = () => {};
      old.gl.dispose();
      old.gl.forceContextLoss();
      old.gl.domElement.remove();
      old.overlay.canvas.remove();
    }
    this.renderer = new Renderer(this.view, { quality: q, models: this.models });
    if (this.hooks) this.hooks.renderer = this.renderer;
  }

  // ================= 开局 / 结束 =================
  async startMatch(opts = {}, spectate = false) {
    if (this.starting) return;
    this.starting = true;
    try {
      this.stopMatch();
      this.settings = loadSettings();
      const m = createMatch({
        seed: opts.seed,
        difficulty: opts.difficulty || this.settings.difficulty,
        playerHero: spectate ? undefined : opts.playerHero,
        playerPosition: opts.playerPosition || undefined,
        playerSpell: opts.playerSpell || undefined,
        autoLevel: !!opts.autoLevel,
        spectate,
      });
      const load = this.menus.showLoading(m.world);
      const t0 = performance.now();
      load.set(0.1);
      await nextFrame();
      this.createRenderer();
      this.renderer.setMatch(m.world, { spectate });
      // 加载画面盖着，先渲染几帧把所有单位外观建好
      for (let i = 0; i < 4; i++) {
        load.set(0.2 + i * 0.15);
        await nextFrame();
      }
      while (performance.now() - t0 < 1400) {
        load.set(0.8 + 0.2 * Math.min(1, (performance.now() - t0) / 1400));
        await nextFrame();
      }
      load.set(1);
      await nextFrame();

      this.world = m.world;
      this.player = m.player || null;
      this.spectate = spectate;
      this.speed = spectate ? opts.speed || 1 : 1;
      this.paused = false;
      this.ending = null;
      this.acc = 0;
      this.menus.hideAll();
      this.hudRoot.classList.add('on');
      this.hud = new Hud(this.hudRoot, this);
      this.input = new Input(this);
      this.input.attach();
      this.hud.setFps(this.settings.showFps);
      if (!spectate) {
        this.renderer.free = !this.settings.camLock;
        this.hud.setCamLock(this.settings.camLock);
      }
      audio.playMusic('battle');
    } finally {
      this.starting = false;
    }
  }

  /** 拆掉对局界面与操作（画面里的对局可以留着当结算背景） */
  teardownUi() {
    if (this.input) { this.input.detach(); this.input = null; }
    if (this.hud) { this.hud.destroy(); this.hud = null; }
    this.hudRoot.classList.remove('on');
    this.hudRoot.innerHTML = '';
  }

  stopMatch() {
    this.teardownUi();
    this.world = null;
    this.player = null;
    this.ending = null;
    this.paused = false;
    const R = this.renderer;
    if (R) {
      R.clearUnits();
      R.world = null;
      R.camLook = null;
      R.indicators.hide();
      R.indicators.showAttackRange(0, 0, 0);
    }
  }

  // ================= 每帧 =================
  frame(now) {
    requestAnimationFrame(this.frame);
    const raw = this.last ? (now - this.last) / 1000 : 1 / 60;
    this.last = now;
    const dt = Math.min(0.1, Math.max(0, raw));
    if (raw > 0) this.fps += (1 / Math.max(raw, 1e-3) - this.fps) * 0.05;
    const R = this.renderer;
    if (!R) return;
    const w = this.world;
    const events = [];
    let alpha = 1, rdt = dt;
    if (w) {
      // 操作在两帧之间直接改动单位（施法、购买等）产生的事件也要收进来
      const take = () => { if (w.events.length) { events.push(...w.events); w.events.length = 0; } };
      try { if (this.input) this.input.update(dt); } catch (e) { console.error(e); }
      take();
      if (this.paused) rdt = 0;
      else if (!w.over) {
        this.acc += dt * this.speed;
        const maxSteps = 6 * this.speed;
        let n = 0;
        while (this.acc >= DT && n < maxSteps) {
          w.step(DT);
          take();
          this.acc -= DT;
          n++;
          if (w.over) break;
        }
        if (n >= maxSteps) this.acc = 0;   // 太卡时丢掉积压，别越追越慢
        alpha = Math.min(1, this.acc / DT);
        rdt = dt * this.speed;
      }
    }
    R.render(alpha, rdt, events);
    if (!w) return;
    if (events.length) {
      this.hud.handleEvents(events);
      this.playSounds(events);
      this.showFloats(events);
    }
    this.hud.update(dt, this.fps);
    if (w.over) this.updateEnding(dt);
  }

  playSounds(events) {
    const R = this.renderer;
    const list = soundsForEvents(events, this.world, {
      playerId: this.player ? this.player.id : 0,
      spectate: this.spectate,
      isVisible: (x, y) => R.fog.visibleAt(x, y),
    });
    const lx = R.camTarget.x, ly = R.camTarget.z;
    for (const s of list) {
      if (s.x === undefined) audio.play(s.name, { volume: s.volume });
      else audio.playAt(s.name, s.x, s.y, lx, ly, { volume: s.volume });
    }
  }

  showFloats(events) {
    const R = this.renderer;
    const list = floatsForEvents(events, this.world, { playerId: this.player ? this.player.id : 0, spectate: this.spectate });
    for (const f of list) {
      if (f.x === undefined) continue;
      if (!this.spectate && !R.fog.visibleAt(f.x, f.y)) continue;
      R.floatText(f.x, f.y, f.h, f.text, f.style);
    }
  }

  // ================= 结算 =================
  updateEnding(dt) {
    const w = this.world, R = this.renderer;
    if (!this.ending) {
      this.ending = { t: 0, stage: 0 };
      this.paused = false;
      this.menus.closeModal();
      if (this.input) { this.input.detach(); this.input = null; }
      if (this.hud) this.hud.closeOverlays();
      const loser = enemyOf(w.winner);
      const c = w.towers.find((t) => t.kind === 'crystal' && t.team === loser);
      if (c) { R.camLook = { x: c.x, y: c.y }; R.free = false; }
      R.indicators.hide();
      R.indicators.showAttackRange(0, 0, 0);
      audio.playMusic(null);
    }
    const e = this.ending;
    e.t += dt;
    if (e.stage === 0 && e.t > 1.5) {
      e.stage = 1;
      const win = this.spectate || (this.player && w.winner === this.player.team);
      const text = this.spectate ? `${w.winner === 1 ? '蓝方' : '红方'}胜利` : win ? '胜 利' : '失 败';
      const b = el('div', 'end-banner ' + (win ? 'win' : 'lose'), `<h1 class="title-gold">${text}</h1>`);
      this.hudRoot.appendChild(b);
      audio.play(win ? 'victory' : 'defeat');
      audio.playMusic(win ? 'victory' : 'defeat');
    }
    if (e.stage === 1 && e.t > 5.2) {
      e.stage = 2;
      const playerTeam = this.player ? this.player.team : 1;
      this.teardownUi();
      this.menus.showResult(w, { playerTeam, spectate: this.spectate });
      this.world = null;   // 画面停在最后一刻当背景
      this.ending = null;
    }
  }

  // ================= 给界面 / 操作调用 =================
  pause() {
    if (!this.world || this.ending || this.paused) return;
    this.paused = true;
    if (this.input) this.input.releaseAll();
    if (this.hud) this.hud.closeOverlays();
    this.menus.openPause({ spectate: this.spectate });
  }

  resume() {
    this.paused = false;
    this.last = 0;
  }

  surrender() {
    const w = this.world;
    if (!w || w.over || !this.player) return;
    this.paused = false;
    w.over = true;
    w.winner = enemyOf(this.player.team);
  }

  toggleCamLock() {
    if (this.spectate) return;
    this.settings = saveSettings({ camLock: !this.settings.camLock });
    if (this.renderer) this.renderer.free = !this.settings.camLock;
    if (this.hud) this.hud.setCamLock(this.settings.camLock);
  }

  applySettings(s) {
    this.settings = s;
    if (this.hud) { this.hud.setFps(s.showFps); if (!this.spectate) this.hud.setCamLock(s.camLock); }
    if (this.world && !this.spectate && this.renderer) this.renderer.free = !s.camLock;
  }

  /** 观战：跟随某个英雄；0 表示自由镜头 */
  follow(id) {
    const R = this.renderer;
    if (!id) { R.free = true; return; }
    R.followId = id;
    R.free = false;
    R.camLook = null;
  }

  setSpeed(s) { this.speed = Math.max(1, Math.min(8, s)); }

  buy(id) {
    const me = this.player;
    if (!me || !me.buy(id)) { audio.play('ui_error'); return false; }
    return true;
  }

  sell(slot) {
    const me = this.player;
    if (!me || !me.sell(slot)) { audio.play('ui_error'); return false; }
    return true;
  }

  upgrade(i) {
    const me = this.player;
    if (!me || !me.upgradeSkill(i)) { audio.play('ui_error'); return false; }
    return true;
  }

  moveTo(x, y) {
    const me = this.player;
    if (!me || me.dead) return;
    me.order = { type: 'move', x, y };
    this.renderer.indicators.clickMarker(x, y, false);
  }
}
