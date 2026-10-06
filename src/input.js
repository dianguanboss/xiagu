// 操作：电脑（WASD / 右键移动、QER 按住瞄准松开释放）与触屏（左摇杆、技能键拖动瞄准、点按自动瞄准）
import { SPELLS } from './sim/hero.js';
import audio from './audio/audio.js';

const DEAD = 0.2;          // 拖动瞄准的死区（低于它算"点按"，自动选目标）
const SKILL_KEYS = { KeyQ: 0, KeyE: 1, KeyR: 2 };
const MOVE_KEYS = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

export class Input {
  constructor(game) {
    this.game = game;
    this.touch = document.body.classList.contains('touch');
    this.keys = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, in: false };
    this.aim = null;        // 正在瞄准的技能
    this.joy = null;        // 摇杆
    this.atk = null;        // 按住的普攻键 { id, mode }
    this.rmb = null;        // 按住右键持续移动
    this.panDrag = null;    // 观战/自由镜头拖动
    this.handlers = [];
    this.moveRepath = 0;
  }

  get me() { return this.game.player; }
  get R() { return this.game.renderer; }
  get hud() { return this.game.hud; }
  get blocked() { return this.game.paused || this.game.menus.modalOpen || (this.hud && (this.hud.shop.open || this.hud.boardWrap.classList.contains('on') && this.touch)); }

  on(target, type, fn, opts) { target.addEventListener(type, fn, opts); this.handlers.push([target, type, fn, opts]); }

  attach() {
    const view = document.getElementById('view');
    this.on(window, 'keydown', (e) => this.keyDown(e));
    this.on(window, 'keyup', (e) => this.keyUp(e));
    this.on(window, 'blur', () => this.releaseAll());
    this.on(window, 'pointermove', (e) => {
      if (e.pointerType === 'mouse') { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.in = true; }
      if (this.panDrag && this.panDrag.id === e.pointerId) { this.panDrag.nx = e.clientX; this.panDrag.ny = e.clientY; }
    });
    this.on(document, 'mouseleave', () => { this.mouse.in = false; });
    this.on(view, 'contextmenu', (e) => e.preventDefault());
    this.on(document.getElementById('hud'), 'contextmenu', (e) => e.preventDefault());
    this.on(view, 'pointerdown', (e) => this.viewDown(e));
    this.on(window, 'pointerup', (e) => this.viewUp(e));
    this.on(window, 'pointercancel', (e) => this.viewUp(e));
    this.on(view, 'wheel', (e) => { e.preventDefault(); this.R.zoom = Math.max(0.72, Math.min(1.35, this.R.zoom * (e.deltaY > 0 ? 1.08 : 1 / 1.08))); }, { passive: false });
    const hud = this.hud;
    if (!hud || !hud.btn) return;
    // 技能按钮
    for (const name of ['s0', 's1', 's2', 'spell']) {
      const b = hud.btn[name];
      const slot = name === 'spell' ? 'spell' : +name[1];
      this.on(b, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (this.blocked) return; b.setPointerCapture(e.pointerId); this.startAim(slot, { id: e.pointerId, x: e.clientX, y: e.clientY, btn: b }); });
      this.on(b, 'pointermove', (e) => this.aimMove(e));
      this.on(b, 'pointerup', (e) => this.aimUp(e));
      this.on(b, 'pointercancel', (e) => { if (this.aim && this.aim.src.id === e.pointerId) this.endAim(true); });
    }
    // 普攻、补刀、推塔
    for (const [name, mode] of [['attack', 'auto'], ['lastHit', 'lastHit'], ['tower', 'tower']]) {
      const b = hud.btn[name];
      if (!b) continue;
      this.on(b, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (this.blocked) return; b.setPointerCapture(e.pointerId); this.atkDown(e.pointerId, mode, b); });
      const up = (e) => { if (this.atk && this.atk.id === e.pointerId) this.atkUp(); };
      this.on(b, 'pointerup', up);
      this.on(b, 'pointercancel', up);
    }
    this.on(hud.btn.recall, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (!this.blocked) this.recall(); });
    // 摇杆
    if (hud.joyArea) {
      const a = hud.joyArea;
      this.on(a, 'pointerdown', (e) => this.joyDown(e));
      this.on(a, 'pointermove', (e) => this.joyMove(e));
      this.on(a, 'pointerup', (e) => this.joyUp(e));
      this.on(a, 'pointercancel', (e) => this.joyUp(e));
    }
  }

  detach() {
    for (const [t, type, fn, opts] of this.handlers) t.removeEventListener(type, fn, opts);
    this.handlers = [];
    this.releaseAll();
  }

  releaseAll() {
    this.keys.clear();
    if (this.aim) this.endAim(true);
    if (this.atk) this.atkUp();
    if (this.joy) this.joyUp({ pointerId: this.joy.id });
    this.rmb = null; this.panDrag = null;
    const me = this.me;
    if (me && me.order && me.order.type === 'dir') me.order = null;
  }

  // ================= 键盘 =================
  keyDown(e) {
    const g = this.game, code = e.code;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (code === 'Tab') { e.preventDefault(); if (!g.paused && this.hud) this.hud.toggleBoard(true); return; }
    if (code === 'Escape') {
      e.preventDefault();
      if (this.aim) { this.endAim(true); return; }
      if (g.menus.modalOpen) return;
      if (this.hud && this.hud.closeOverlays()) return;
      g.pause();
      return;
    }
    if (g.paused || g.menus.modalOpen) return;
    if (e.repeat) { if (MOVE_KEYS[code] || code === 'Space') e.preventDefault(); return; }
    this.keys.add(code);
    if (MOVE_KEYS[code] || code === 'Space') e.preventDefault();
    if (code === 'KeyC' || code === 'KeyP') { this.hud && this.hud.openShop(); return; }
    if (this.hud && this.hud.shop.open) return;
    if (code === 'KeyY') { g.toggleCamLock(); return; }
    const me = this.me;
    if (!me || g.spectate) return;
    // 升级技能：1/2/3 或 Ctrl/Alt + Q/E/R
    const up = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[code];
    if (up !== undefined) { g.upgrade(up); return; }
    if (SKILL_KEYS[code] !== undefined && (e.ctrlKey || e.altKey || e.metaKey)) { e.preventDefault(); g.upgrade(SKILL_KEYS[code]); return; }
    if (SKILL_KEYS[code] !== undefined) { this.startAim(SKILL_KEYS[code], { key: code }); return; }
    if (code === 'KeyF') { this.startAim('spell', { key: code }); return; }
    if (code === 'KeyB') { this.recall(); return; }
    if (code === 'Space' || code === 'KeyJ') { this.atkDown('key:' + code, 'auto', this.hud && this.hud.btn.attack); return; }
    if (code === 'KeyH') { me.order = null; me.path = null; return; }
  }

  keyUp(e) {
    const code = e.code;
    this.keys.delete(code);
    if (code === 'Tab') { e.preventDefault(); this.hud && this.hud.toggleBoard(false); return; }
    if (this.aim && this.aim.src.key === code) { this.endAim(false); return; }
    if (this.atk && this.atk.id === 'key:' + code) this.atkUp();
  }

  keyDir() {
    let x = 0, y = 0;
    for (const k of this.keys) { const d = MOVE_KEYS[k]; if (d) { x += d[0]; y += d[1]; } }
    const l = Math.hypot(x, y);
    return l ? { x: x / l, y: y / l } : null;
  }

  // ================= 鼠标 / 点按场景 =================
  viewDown(e) {
    const g = this.game;
    if (this.blocked) return;
    if (e.pointerType === 'mouse') { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.in = true; }
    // 观战或死亡后自由镜头：拖动平移
    if (g.spectate || !this.me) {
      this.panDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, nx: e.clientX, ny: e.clientY };
      return;
    }
    const me = this.me;
    if (this.aim) {
      // 键盘瞄准中：左键释放，右键取消
      if (this.aim.src.key) { this.endAim(e.button === 2); return; }
    }
    if (e.pointerType === 'mouse' && (e.button === 0 || e.button === 2)) {
      if (me.dead) return;
      this.issueAt(e.clientX, e.clientY, true);
      if (e.button === 2) this.rmb = { id: e.pointerId, t: 0 };
    } else if (e.pointerType !== 'mouse') {
      // 触屏点按场景：点到敌人就攻击
      const u = this.R.pickUnit(e.clientX, e.clientY, (u) => me.canAttackUnit(u), 40);
      if (u && !me.dead) { me.order = { type: 'attack', target: u }; this.R.indicators.clickMarker(u.x, u.y, true); }
    }
  }

  viewUp(e) {
    if (this.panDrag && this.panDrag.id === e.pointerId) this.panDrag = null;
    if (this.rmb && this.rmb.id === e.pointerId) this.rmb = null;
  }

  /** 在屏幕点 (sx,sy) 处下达移动或攻击命令 */
  issueAt(sx, sy, marker) {
    const me = this.me, R = this.R;
    if (!me || me.dead) return false;
    const u = R.pickUnit(sx, sy, (u) => me.canAttackUnit(u), 34);
    if (u) {
      me.order = { type: 'attack', target: u };
      if (marker) R.indicators.clickMarker(u.x, u.y, true);
      return true;
    }
    const p = R.screenToGround(sx, sy);
    if (!p) return false;
    me.order = { type: 'move', x: p.x, y: p.y };
    if (marker) R.indicators.clickMarker(p.x, p.y, false);
    return true;
  }

  recall() {
    const me = this.me;
    if (!me || me.dead) return;
    if (me.recalling) { me.cancelRecall(); return; }
    me.order = null; me.path = null;
    if (!me.startRecall()) audio.play('ui_error');
  }

  // ================= 摇杆 =================
  joyDown(e) {
    if (this.blocked || this.joy || !this.me) return;
    e.preventDefault();
    const hud = this.hud, area = hud.joyArea;
    area.setPointerCapture(e.pointerId);
    const r = area.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const home = hud.joyHome;
    let cx = e.clientX - r.left, cy = e.clientY - r.top;
    // 按在摇杆附近就用原位，否则摇杆跟到手指处
    if (home && Math.hypot(cx - home.x, cy - home.y) < 6 * fs) { cx = home.x; cy = home.y; }
    hud.joy.style.left = `${cx}px`; hud.joy.style.top = `${cy}px`;
    hud.joy.classList.add('active');
    this.joy = { id: e.pointerId, cx, cy, ox: r.left, oy: r.top, R: 4.5 * fs, dx: 0, dy: 0 };
    this.joyMove(e);
  }
  joyMove(e) {
    const j = this.joy;
    if (!j || j.id !== e.pointerId) return;
    let dx = e.clientX - j.ox - j.cx, dy = e.clientY - j.oy - j.cy;
    const l = Math.hypot(dx, dy);
    if (l > j.R) { dx *= j.R / l; dy *= j.R / l; }
    this.hud.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    j.dx = dx / j.R; j.dy = dy / j.R;
  }
  joyUp(e) {
    const j = this.joy;
    if (!j || j.id !== e.pointerId) return;
    this.joy = null;
    this.hud.resetJoy();
    const me = this.me;
    if (me && me.order && me.order.type === 'dir') me.order = null;
  }

  // ================= 普攻 =================
  atkDown(id, mode, btn) {
    const me = this.me;
    if (!me || me.dead) return;
    this.atk = { id, mode, btn, t: 0 };
    if (btn) btn.classList.add('aiming');
    const t = this.pickAttackTarget(mode);
    if (t) me.order = { type: 'attack', target: t };
    else if (mode === 'auto') audio.play('swing', { volume: 0.25 });
  }
  atkUp() {
    if (this.atk && this.atk.btn) this.atk.btn.classList.remove('aiming');
    this.atk = null;
    this.R.indicators.showAttackRange(0, 0, 0);
  }

  /** 普攻自动选目标：英雄优先 → 小兵野怪（残血优先）→ 建筑 */
  pickAttackTarget(mode) {
    const me = this.me, w = this.game.world;
    const range = me.stats.range + me.radius;
    const cur = me.order && me.order.type === 'attack' ? me.order.target : null;
    const ok = (u) => me.canAttackUnit(u);
    const near = (extra, f) => w.queryUnits(me.x, me.y, range + extra + 2, (u) => ok(u) && f(u) && me.edgeDist(u) <= me.stats.range + extra);
    const lowest = (arr, key) => arr.reduce((b, u) => (!b || key(u) < key(b) ? u : b), null);
    if (mode === 'tower') {
      if (cur && cur.isStructure && ok(cur)) return cur;
      return lowest(near(5, (u) => u.isStructure), (u) => me.edgeDist(u));
    }
    if (mode === 'lastHit') {
      return lowest(near(3.5, (u) => u.kind === 'minion' || u.kind === 'monster'), (u) => u.hp);
    }
    if (cur && ok(cur) && me.edgeDist(cur) <= me.stats.range + 2.5 && (cur.kind === 'hero' || !near(2.5, (u) => u.kind === 'hero').length)) return cur;
    const heroes = near(2.5, (u) => u.kind === 'hero');
    if (heroes.length) return lowest(heroes, (u) => u.hp / u.stats.maxHp + me.edgeDist(u) * 0.04);
    const small = near(2, (u) => u.kind === 'minion' || u.kind === 'monster');
    if (small.length) return lowest(small, (u) => u.hp + me.edgeDist(u) * 30);
    return lowest(near(1.5, (u) => u.isStructure && u.kind !== 'fountain'), (u) => me.edgeDist(u));
  }

  // ================= 技能瞄准 =================
  skillDef(slot) {
    const me = this.me;
    return slot === 'spell' ? SPELLS[me.spell.id] : me.skills[slot].def;
  }
  canUse(slot) {
    const me = this.me;
    return slot === 'spell' ? me.canUseSpell() : me.canCast(slot);
  }

  startAim(slot, src) {
    const me = this.me;
    if (!me || me.dead) return;
    if (this.aim) this.endAim(true);
    if (!this.canUse(slot)) {
      // 未学会但可以升级：点一下就是升级
      if (slot !== 'spell' && me.skills[slot].level === 0 && me.canUpgrade(slot) && src.btn) { this.game.upgrade(slot); return; }
      audio.play('ui_error', { volume: 0.6 });
      return;
    }
    const d = this.skillDef(slot);
    // 自身技能与治疗术：按下立即释放
    if (d.target === 'self') { this.fire(slot, {}); return; }
    // 惩击：自动找最近的野怪/小兵
    if (slot === 'spell' && me.spell.id === 'smite') {
      const t = this.autoTarget(d, 'any', src.key ? this.cursorGround() : null);
      this.fire(slot, t ? { target: t } : {});
      return;
    }
    this.aim = { slot, def: d, src, vec: { x: 0, y: 0 }, mag: 0, cancel: false, btn: src.btn || this.hud && this.hud.btn[slot === 'spell' ? 'spell' : 's' + slot] };
    if (this.aim.btn) this.aim.btn.classList.add('aiming');
    if (src.btn && this.hud.cancel) this.hud.cancel.classList.add('on');
    this.updateAimIndicator();
  }

  aimMove(e) {
    const a = this.aim;
    if (!a || a.src.id !== e.pointerId) return;
    const fs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const r = a.src.btn.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const max = 5.5 * fs;
    let vx = (e.clientX - cx) / max, vy = (e.clientY - cy) / max;
    const l = Math.hypot(vx, vy);
    if (l > 1) { vx /= l; vy /= l; }
    a.vec = { x: vx, y: vy };
    a.mag = Math.min(1, l);
    // 拖到取消区
    const cz = this.hud.cancel.getBoundingClientRect();
    const inCancel = e.clientX > cz.left && e.clientX < cz.right && e.clientY > cz.top && e.clientY < cz.bottom;
    a.cancel = inCancel;
    this.hud.cancel.classList.toggle('hot', inCancel);
  }

  aimUp(e) {
    const a = this.aim;
    if (!a || a.src.id !== e.pointerId) return;
    this.endAim(a.cancel);
  }

  cursorGround() {
    return this.mouse.in ? this.R.screenToGround(this.mouse.x, this.mouse.y) : null;
  }

  /** 根据当前瞄准状态算出释放参数 { x, y } 或 { target } */
  aimResult() {
    const a = this.aim, me = this.me, d = a.def;
    const range = d.range || 6;
    let p = null, auto = false;
    if (a.src.key) {
      p = this.cursorGround();
      if (!p) auto = true;
    } else if (a.mag < DEAD) auto = true;
    else {
      const f = d.target === 'point' ? Math.max(0.15, (a.mag - DEAD) / (1 - DEAD)) : 1;
      p = { x: me.x + a.vec.x * range * f, y: me.y + a.vec.y * range * f };
    }
    if (d.target === 'unit') {
      // 指定目标：选瞄准点附近的敌人，没有就自动选
      const t = this.autoTarget(d, d.unitHeroOnly ? 'hero' : 'any', p);
      return { target: t, x: t ? t.x : undefined, y: t ? t.y : undefined, auto };
    }
    if (auto) {
      if (a.slot === 'spell') return { x: me.x + Math.cos(me.facing) * range, y: me.y + Math.sin(me.facing) * range, auto };
      const t = this.autoTarget(d, d.autoTarget || 'hero', null);
      if (t) return { x: t.x, y: t.y, target: d.target === 'unit' ? t : undefined, auto, tgt: t };
      return { auto };
    }
    return p;
  }

  /** 自动目标。kind: 'hero' 只找英雄（找不到再看技能是否允许打小兵）| 'any' | 'ally'。near: 优先靠近这个点 */
  autoTarget(d, kind, near) {
    const me = this.me, w = this.game.world;
    const range = (d.range || 6) + (kind === 'ally' ? 0 : 1.5);
    const vis = (u) => u.visible[me.team] || u.team === me.team;
    const score = (u) => (near ? Math.hypot(u.x - near.x, u.y - near.y) : me.edgeDist(u) + (u.hp / u.stats.maxHp) * 3);
    const pick = (f) => {
      let best = null, bs = 1e9;
      for (const u of w.queryUnits(me.x, me.y, range + 2, f)) {
        if (me.edgeDist(u) > range || !vis(u)) continue;
        const s = score(u);
        if (s < bs) { bs = s; best = u; }
      }
      return best;
    };
    if (kind === 'ally') return pick((u) => u.kind === 'hero' && u.team === me.team && !u.dead && u.hp < u.stats.maxHp) || null;
    const hero = pick((u) => u.kind === 'hero' && me.canAttackUnit(u));
    if (hero || kind === 'hero' && d.unitHeroOnly) return hero;
    if (kind === 'any' || d.autoTarget === 'any' || d.target === 'unit') return pick((u) => (u.kind === 'minion' || u.kind === 'monster') && me.canAttackUnit(u));
    return null;
  }

  updateAimIndicator() {
    const a = this.aim, me = this.me, R = this.R;
    if (!a) return;
    if (me.dead || !this.canUse(a.slot)) { this.endAim(true); return; }
    const d = a.def, res = this.aimResult();
    const spec = { kind: d.target, ox: me.x, oy: me.y, range: d.range || 0, width: d.width, radius: d.radius, cancel: a.cancel };
    let ax = res.x, ay = res.y;
    if (ax === undefined) { ax = me.x + Math.cos(me.facing) * (d.range || 4); ay = me.y + Math.sin(me.facing) * (d.range || 4); }
    if (d.target === 'point') {
      const dx = ax - me.x, dy = ay - me.y, l = Math.hypot(dx, dy);
      if (l > d.range) { ax = me.x + (dx / l) * d.range; ay = me.y + (dy / l) * d.range; }
    }
    spec.ax = ax; spec.ay = ay;
    if (res.target) spec.target = res.target;
    else if (res.tgt) spec.target = res.tgt;
    R.indicators.show(spec);
  }

  endAim(cancel) {
    const a = this.aim;
    if (!a) return;
    let res = null;
    if (!cancel && this.me && !this.me.dead) res = this.aimResult();
    this.aim = null;
    if (a.btn) a.btn.classList.remove('aiming');
    if (this.hud && this.hud.cancel) this.hud.cancel.classList.remove('on', 'hot');
    this.R.indicators.hide();
    if (cancel) { audio.play('ui_close', { volume: 0.5 }); return; }
    if (a.def.target === 'unit' && !res.target) { audio.play('ui_error', { volume: 0.6 }); return; }
    this.fire(a.slot, res);
  }

  fire(slot, res) {
    const me = this.me;
    const aim = res.target ? { target: res.target, x: res.x, y: res.y } : res.x !== undefined ? { x: res.x, y: res.y } : {};
    const ok = slot === 'spell' ? me.useSpell(aim) : me.cast(slot, aim);
    if (!ok) audio.play('ui_error', { volume: 0.6 });
    else if (me.order && me.order.type === 'move' && !this.rmb) { /* 保留移动 */ }
    return ok;
  }

  // ================= 每帧 =================
  update(dt) {
    const g = this.game, me = this.me, R = this.R;
    if (!R || !g.world) return;
    // 自由镜头：边缘平移、WASD、拖动
    const free = g.spectate || !me || !g.camLock;
    if (free && this.mouse.in && !this.touch && !g.paused) {
      const e = 14, sp = 38 * dt * R.zoom;
      let px = 0, py = 0;
      if (this.mouse.x < e) px = -1; else if (this.mouse.x > innerWidth - e) px = 1;
      if (this.mouse.y < e) py = -1; else if (this.mouse.y > innerHeight - e) py = 1;
      if (px || py) { R.free = true; R.panBy(px * sp, py * sp); }
    }
    if ((g.spectate || !me) && !g.paused) {
      const k = this.keyDir();
      if (k) { R.free = true; R.panBy(k.x * 40 * dt * R.zoom, k.y * 40 * dt * R.zoom); }
    }
    if (this.panDrag) {
      const p = this.panDrag;
      // 拖动跟手：按当前缩放换算
      const nx = p.nx, ny = p.ny;
      if (nx !== p.x || ny !== p.y) {
        R.free = true;
        R.panBy(-(nx - p.x) * 0.06 * R.zoom, -(ny - p.y) * 0.09 * R.zoom);
        p.x = nx; p.y = ny;
      }
    }
    if (!me || g.spectate || g.paused) return;
    if (me.dead) { if (this.aim) this.endAim(true); return; }
    // 移动：摇杆 / WASD
    let dir = null;
    if (this.joy && Math.hypot(this.joy.dx, this.joy.dy) > 0.15) {
      const l = Math.hypot(this.joy.dx, this.joy.dy);
      dir = { x: this.joy.dx / l, y: this.joy.dy / l };
    } else if (!this.hud.shop.open) dir = this.keyDir();
    if (dir) {
      me.order = { type: 'dir', dx: dir.x, dy: dir.y };
    } else if (me.order && me.order.type === 'dir' && !this.joy) {
      me.order = null;
    }
    // 按住右键：持续向鼠标处移动
    if (this.rmb && !dir) {
      this.rmb.t += dt;
      if (this.rmb.t > 0.15) { this.rmb.t = 0; this.issueAt(this.mouse.x, this.mouse.y, false); }
    }
    // 按住普攻：目标没了就换一个
    if (this.atk && !dir) {
      this.atk.t += dt;
      const o = me.order;
      const valid = o && o.type === 'attack' && me.canAttackUnit(o.target);
      if (!valid || this.atk.t > 0.4) {
        this.atk.t = 0;
        const t = this.pickAttackTarget(this.atk.mode);
        if (t) me.order = { type: 'attack', target: t };
      }
      R.indicators.showAttackRange(me.x, me.y, me.stats.range + me.radius);
    } else if (this.atk) R.indicators.showAttackRange(me.x, me.y, me.stats.range + me.radius);
    // 自动反击的目标跑出射程就不追
    if (me.order && me.order.auto && (!me.canAttackUnit(me.order.target) || !me.inRange(me.order.target, 0.6))) me.order = null;
    // 站着不动时自动反击：射程内有敌人就打（不主动打塔）
    if (!dir && !me.order && !me.recalling && !me.casting && !me.channel && !this.rmb) {
      this.idleT = (this.idleT || 0) + dt;
      if (this.idleT > 0.4) {
        const t = this.game.world.queryUnits(me.x, me.y, me.stats.range + 3, (u) => me.canAttackUnit(u) && !u.isStructure && me.inRange(u, 0)).sort((a, b) => (b.kind === 'hero') - (a.kind === 'hero') || me.edgeDist(a) - me.edgeDist(b))[0];
        if (t) me.order = { type: 'attack', target: t, auto: true };
      }
    } else this.idleT = 0;
    // 瞄准指示器
    if (this.aim) this.updateAimIndicator();
  }
}
