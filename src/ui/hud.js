// 对局界面：顶部比分与双方头像、小地图、播报与击杀信息、自身状态、技能按钮、商店入口、死亡倒计时、观战控制
import { ITEM_BY_ID, MAX_ITEMS } from '../data/items.js';
import { SPELLS } from '../sim/hero.js';
import { XP_TO_NEXT, MAX_LEVEL } from '../config.js';
import { LANE_NAMES } from '../data/map.js';
import { el, esc, fmtTime, onTap, portrait, sfx } from './common.js';
import { skillIcon, spellIcon, itemIcon } from './icons.js';
import { Minimap } from './minimap.js';
import { Shop, nextRecommended } from './shop.js';
import { renderBoard } from './board.js';
import audio from '../audio/audio.js';

// 技能按钮布局（单位 rem，以屏幕右下角为原点，y 向上）。普攻键为中心，其余按角度排开
const ATK = { x: 5.6, y: 5.4, r: 3.3 };
const polar = (deg, d, r) => ({ x: ATK.x - Math.cos((deg * Math.PI) / 180) * d, y: ATK.y + Math.sin((deg * Math.PI) / 180) * d, r });
const LAYOUT = {
  attack: ATK,
  s0: polar(180, 6.2, 2.35),
  s1: polar(128, 6.2, 2.35),
  s2: polar(76, 6.2, 2.35),
  lastHit: polar(228, 4.85, 1.5),
  tower: polar(318, 4.85, 1.5),
  spell: polar(165, 10.6, 1.9),
  recall: polar(196, 9.9, 1.6),
};
const CANCEL_POS = { x: 3, y: 16 };

const MULTI = { 2: ['双杀', 'double_kill'], 3: ['三杀', 'triple_kill'], 4: ['四杀', 'quadra_kill'], 5: ['五杀', 'penta_kill'] };
const STREAK = { 3: '大杀特杀', 4: '杀人如麻', 5: '无人能挡', 6: '横扫千军', 7: '天下无双' };
const streakName = (n) => (n >= 8 ? '超神' : STREAK[n] || '');
const TIER_NAMES = { outer: '一塔', inner: '二塔', high: '高地塔' };
const BUFF_CHIPS = {
  blueBuff: ['#3f8cff', '蓝'], redBuff: ['#ff5a4a', '红'], drakeBuff: ['#ff8a3d', '龙'], guardianBuff: ['#b48cff', '卫'],
};

export class Hud {
  /** game: 提供 world / player / renderer / spectate / settings 以及各种操作方法 */
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.touch = document.body.classList.contains('touch');
    this.acc = 0;
    this.annQueue = [];
    this.annCur = null;
    this.feedRows = [];
    this.portraitImgs = new Map();
    this.boardOpen = false;
    this.boardT = 0;
    this.lastSig = {};
    this.build();
  }

  get world() { return this.game.world; }
  get player() { return this.game.player; }

  // ================= 搭建 =================
  build() {
    const r = this.root;
    r.innerHTML = '';
    const g = this.game, w = this.world, me = this.player, spec = g.spectate;
    const team = me ? me.team : 1;

    // 小地图
    const mm = el('div', 'minimap pe');
    r.appendChild(mm);
    this.minimap = new Minimap(mm);
    this.bindMinimap(mm);

    // 顶部：双方头像 + 比分
    const top = el('div', 'hud-top');
    const bar1 = el('div', 'team-bar'), bar2 = el('div', 'team-bar');
    const sb = el('div', 'score-box', `<div class="sc"><span class="b">0</span><span class="sep">VS</span><span class="r">0</span></div><div class="tm">00:00</div>`);
    top.append(bar1, sb, bar2);
    r.appendChild(top);
    this.scoreB = sb.querySelector('.b'); this.scoreR = sb.querySelector('.r'); this.timeEl = sb.querySelector('.tm');
    this.tb = new Map();
    for (const h of w.heroes) {
      const c = el('div', `tb-hero t${h.team}` + (h === me ? ' me' : ''), `<img src="${portrait(h.def)}"><i class="hpb"></i><span class="rs"></span>`);
      c.title = h.name;
      (h.team === 1 ? bar1 : bar2).appendChild(c);
      this.tb.set(h.id, { node: c, hp: c.querySelector('.hpb'), rs: c.querySelector('.rs') });
    }

    // 右上：数据、帧率、按钮
    const tr = el('div', 'top-right');
    this.myStats = el('div', 'my-stats');
    if (spec || !me) this.myStats.classList.add('hidden');
    this.fpsEl = el('div', 'fps');
    this.fpsEl.classList.toggle('hidden', !g.settings.showFps);
    const camBtn = el('button', 'icon-btn pe', '🎥');
    camBtn.title = '镜头锁定（Y）';
    onTap(camBtn, () => g.toggleCamLock());
    if (spec || this.touch) camBtn.classList.add('hidden');
    this.camBtn = camBtn;
    const boardBtn = el('button', 'icon-btn pe', '📋');
    boardBtn.title = '战绩（Tab）';
    onTap(boardBtn, () => this.toggleBoard());
    const pauseBtn = el('button', 'icon-btn pe', 'Ⅱ');
    pauseBtn.title = '暂停（Esc）';
    onTap(pauseBtn, () => g.pause(), 'ui_open');
    tr.append(this.myStats, this.fpsEl, camBtn, boardBtn, pauseBtn);
    r.appendChild(tr);

    // 播报与击杀信息
    this.annBox = el('div', 'announce');
    this.feed = el('div', 'feed');
    r.append(this.annBox, this.feed);

    // 死亡倒计时
    this.death = el('div', 'death', `<div class="t">复活倒计时</div><div class="n">0</div><div class="t k"></div>`);
    r.appendChild(this.death);

    // 计分表与商店的弹出层
    this.boardWrap = el('div', 'modal-wrap');
    this.boardWrap.innerHTML = '<div class="board panel" style="padding:0.6rem"></div>';
    this.boardWrap.addEventListener('pointerdown', (e) => { if (e.target === this.boardWrap) this.toggleBoard(false); });
    this.shopWrap = el('div', 'modal-wrap');
    r.append(this.boardWrap, this.shopWrap);
    this.shop = new Shop(this.shopWrap, {
      onBuy: (id) => g.buy(id),
      onSell: (slot) => g.sell(slot),
      onClose: () => {},
    });

    if (spec || !me) { this.buildSpectate(); return; }

    // 左下：自身状态（电脑上显示）
    const sp = el('div', 'self-panel panel pe');
    sp.innerHTML = `<div class="portrait"><img src="${portrait(me.def)}"><i class="xp"></i><span class="lv">1</span></div>
      <div class="bars"><div class="buffs" style="display:flex;gap:0.3rem;min-height:1.6rem"></div>
        <div class="bar hp"><i></i><span></span></div>
        <div class="bar mp${me.resource === 'energy' ? ' energy' : ''}${me.resource === 'none' ? ' hidden' : ''}"><i></i><span></span></div>
        <div class="stat-line"></div><div class="items-row"></div></div>`;
    r.appendChild(sp);
    this.sp = {
      lv: sp.querySelector('.lv'), xp: sp.querySelector('.xp'),
      hp: sp.querySelector('.bar.hp > i'), hpT: sp.querySelector('.bar.hp > span'),
      mp: sp.querySelector('.bar.mp > i'), mpT: sp.querySelector('.bar.mp > span'),
      stat: sp.querySelector('.stat-line'), items: sp.querySelector('.items-row'), buffs: sp.querySelector('.buffs'),
    };
    this.itemSlots = [];
    for (let i = 0; i < MAX_ITEMS; i++) {
      const s = el('div', 'item-slot');
      onTap(s, () => this.openShop(), null);
      this.sp.items.appendChild(s);
      this.itemSlots.push(s);
    }

    // 左侧：金币（打开商店）与推荐装备一键购买
    const side = el('div', 'shop-side');
    this.goldBtn = el('div', 'gold-btn pe', `<img src="${spellIcon('shop')}"><span>300</span>`);
    this.goldBtn.title = '商店（C）';
    onTap(this.goldBtn, () => this.openShop(), null);
    this.recBtn = el('div', 'rec-buy pe hidden', `<img><div><div class="nm"></div><div class="pr"></div></div>`);
    onTap(this.recBtn, () => { const it = nextRecommended(me); if (it) g.buy(it.id); }, null);
    side.append(this.goldBtn, this.recBtn);
    r.appendChild(side);

    // 右下：技能按钮
    const sk = el('div', 'skills');
    r.appendChild(sk);
    this.btn = {};
    const keys = this.touch ? {} : { attack: '空格', s0: 'Q', s1: 'E', s2: 'R', spell: 'F', recall: 'B' };
    const mk = (name, icon) => {
      const L = LAYOUT[name];
      const b = el('div', `sk ${name === 'attack' ? 'attack' : ''}`, `<img src="${icon}"><div class="sweep"></div><div class="cd"></div><div class="ring"></div>`);
      Object.assign(b.style, { left: `calc(-${L.x}rem - var(--safe-r))`, top: `calc(-${L.y}rem - var(--safe-b))`, width: `${L.r * 2}rem`, height: `${L.r * 2}rem` });
      b.dataset.name = name;
      if (keys[name]) b.appendChild(el('span', 'key', keys[name]));
      sk.appendChild(b);
      this.btn[name] = b;
      return b;
    };
    mk('attack', spellIcon('attack'));
    for (let i = 0; i < 3; i++) {
      const b = mk('s' + i, skillIcon(me.def, i));
      const lv = el('div', 'lvl');
      for (let k = 0; k < (i === 2 ? 3 : 6); k++) lv.appendChild(el('i'));
      b.appendChild(lv);
      const up = el('div', 'up', '+');
      up.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); g.upgrade(i); });
      b.appendChild(up);
    }
    mk('spell', spellIcon(me.spell.id));
    mk('recall', spellIcon('recall'));
    if (this.touch) { mk('lastHit', spellIcon('lastHit')); mk('tower', spellIcon('tower')); }
    this.cancel = el('div', 'cancel-zone', '取消');
    Object.assign(this.cancel.style, { left: 'auto', right: `calc(${CANCEL_POS.x}rem + var(--safe-r))`, bottom: `${CANCEL_POS.y}rem`, transform: 'translate(50%, 50%)' });
    r.appendChild(this.cancel);

    // 左侧摇杆（触屏）
    if (this.touch) {
      this.joyArea = el('div', 'joy-area');
      this.joy = el('div', 'joy', '<div class="knob"></div>');
      this.knob = this.joy.querySelector('.knob');
      this.joyArea.appendChild(this.joy);
      r.insertBefore(this.joyArea, r.firstChild);
      this.resetJoy();
    }
  }

  resetJoy() {
    if (!this.joy) return;
    const fs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const rect = this.joyArea.getBoundingClientRect();
    const x = 7.5 * fs + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-l')) || 0);
    const y = (rect.height || innerHeight * 0.62) - 6.5 * fs;
    this.joyHome = { x, y };
    this.joy.style.left = `${x}px`; this.joy.style.top = `${y}px`;
    this.knob.style.transform = '';
    this.joy.classList.remove('active');
  }

  buildSpectate() {
    const g = this.game;
    const bar = el('div', 'spec-bar panel pe');
    this.specHeroes = new Map();
    for (const h of this.world.heroes) {
      const c = el('div', `tb-hero t${h.team}`, `<img src="${portrait(h.def)}">`);
      c.title = `跟随 ${h.name}`;
      onTap(c, () => g.follow(h.id));
      bar.appendChild(c);
      this.specHeroes.set(h.id, c);
      if (h.team === 1 && this.world.heroes.filter((x) => x.team === 1).indexOf(h) === 4) bar.appendChild(el('span', '', '&nbsp;'));
    }
    const free = el('button', 'chip', '自由镜头');
    onTap(free, () => g.follow(0));
    bar.appendChild(free);
    this.speedChips = [];
    for (const s of [1, 2, 4]) {
      const c = el('button', 'chip' + (g.speed === s ? ' on' : ''), `${s}×`);
      onTap(c, () => { g.setSpeed(s); this.speedChips.forEach((x) => x.classList.toggle('on', x === c)); });
      bar.appendChild(c);
      this.speedChips.push(c);
    }
    this.root.appendChild(bar);
  }

  bindMinimap(node) {
    const g = this.game;
    let drag = null;
    const look = (e) => {
      const p = this.minimap.toWorld(e.clientX, e.clientY);
      if (g.renderer.free) { g.renderer.camTarget.x = p.x; g.renderer.camTarget.z = p.y; g.renderer.clampCam(); }
      else g.renderer.camLook = p;
    };
    node.addEventListener('contextmenu', (e) => e.preventDefault());
    node.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      if (e.button === 2) {
        const p = this.minimap.toWorld(e.clientX, e.clientY);
        if (g.moveTo(p.x, p.y)) this.minimap.ping(p.x, p.y, '#45e05f');
        return;
      }
      drag = e.pointerId;
      node.setPointerCapture(e.pointerId);
      look(e);
    });
    node.addEventListener('pointermove', (e) => { if (drag === e.pointerId) look(e); });
    const end = (e) => { if (drag !== e.pointerId) return; drag = null; g.renderer.camLook = null; };
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
  }

  portraitImg(h) {
    let im = this.portraitImgs.get(h.heroId);
    if (!im) { im = new Image(); im.src = portrait(h.def); this.portraitImgs.set(h.heroId, im); }
    return im;
  }

  // ================= 商店 / 计分表 =================
  openShop() {
    if (!this.player) return;
    if (this.shop.open) { this.shop.close(); return; }
    this.toggleBoard(false);
    this.shop.show(this.player);
  }
  closeOverlays() {
    let any = false;
    if (this.shop.open) { this.shop.close(); any = true; }
    if (this.boardOpen) { this.toggleBoard(false); any = true; }
    return any;
  }
  toggleBoard(on = !this.boardOpen) {
    if (on === this.boardOpen) return;
    this.boardOpen = on;
    this.boardWrap.classList.toggle('on', on);
    if (on) { this.renderBoardNow(); sfx('ui_open'); }
  }
  renderBoardNow() {
    renderBoard(this.boardWrap.firstChild, this.world, this.player ? this.player.id : 0);
    this.boardT = 0;
  }

  // ================= 播报 =================
  announce(o) {
    // o: { html, team, sound, prio, dur }
    if (o.prio) {
      // 重要播报插到队首，并缩短当前这条
      this.annQueue.unshift(o);
      if (this.annCur && !this.annCur.prio) this.annCur.left = Math.min(this.annCur.left, 0.25);
    } else {
      this.annQueue.push(o);
      if (this.annQueue.length > 3) this.annQueue.splice(this.annQueue.findIndex((x) => !x.prio), 1);
    }
  }

  updateAnnounce(dt) {
    if (this.annCur) {
      this.annCur.left -= dt;
      if (this.annCur.left <= 0) {
        const n = this.annCur.node;
        n.classList.add('out');
        setTimeout(() => n.remove(), 420);
        this.annCur = null;
      }
    }
    if (!this.annCur && this.annQueue.length) {
      const o = this.annQueue.shift();
      const n = el('div', `ann t${o.team || 0}`, o.html);
      this.annBox.appendChild(n);
      o.node = n; o.left = o.dur || 2.4;
      this.annCur = o;
      if (o.sound) audio.play(o.sound, { volume: 1 });
    }
    for (let i = this.feedRows.length - 1; i >= 0; i--) {
      const f = this.feedRows[i];
      f.t -= dt;
      if (f.t <= 0) { f.node.remove(); this.feedRows.splice(i, 1); }
    }
  }

  addFeed(html) {
    const n = el('div', 'feed-row', html);
    this.feed.appendChild(n);
    this.feedRows.push({ node: n, t: 7 });
    if (this.feedRows.length > 5) { const f = this.feedRows.shift(); f.node.remove(); }
  }

  img(h) { return `<img class="t${h.team}" src="${portrait(h.def)}">`; }

  /** 事件：击杀、推塔、野怪、兵线等播报 */
  handleEvents(events) {
    const w = this.world, me = this.player;
    const myTeam = me ? me.team : 1;
    for (const ev of events) {
      if (ev.type === 'kill') this.onKill(ev, myTeam);
      else if (ev.type === 'towerDown') {
        const ours = ev.team === myTeam;
        const lane = ev.lane ? LANE_NAMES[ev.lane] : '';
        const what = ev.tier === 'crystal' ? '水晶' : `${lane}${TIER_NAMES[ev.tier] || '防御塔'}`;
        const by = w.unitById(ev.by);
        const text = this.game.spectate ? `${ev.team === 1 ? '蓝方' : '红方'}${what}被摧毁` : ours ? `我方${what}被摧毁` : `摧毁敌方${what}`;
        this.announce({ html: `<span>${esc(text)}</span>`, team: ours ? 2 : 1, sound: this.game.spectate ? 'enemy_tower_down' : ours ? 'tower_lost' : 'enemy_tower_down', dur: 2.4 });
        this.addFeed(`${by && by.def ? this.img(by) : `<span class="ic" style="background:${ev.team === 1 ? '#6e1616' : '#123a6e'}">兵</span>`}<span class="sw">⚔</span><span class="ic" style="background:${ev.team === 1 ? 'var(--blue)' : 'var(--red)'}">塔</span>`);
      } else if (ev.type === 'announce') {
        if (ev.quiet) {
          const h = w.unitById(ev.hero);
          if (h && h.team === myTeam) this.addFeed(`${this.img(h)}<span class="ic" style="background:${ev.buff === 'blue' ? '#3f8cff' : '#ff5a4a'}">${ev.buff === 'blue' ? '蓝' : '红'}</span>`);
          continue;
        }
        if (ev.kind === 'bossSpawn') this.announce({ html: `<span>${esc(ev.text)}</span>`, team: 0, sound: ev.boss === 'drake' ? 'dragon_roar' : 'monster_roar', dur: 2.6 });
        else if (ev.kind === 'objective') {
          this.announce({ html: `<span>${esc(ev.text)}</span>`, team: ev.team === myTeam ? 1 : 2, sound: ev.team === myTeam ? 'enemy_tower_down' : 'tower_lost', prio: true, dur: 3 });
          this.addFeed(`<span class="ic" style="background:${ev.team === 1 ? 'var(--blue)' : 'var(--red)'}">${ev.team === 1 ? '蓝' : '红'}</span><span class="sw">⚔</span><span class="ic" style="background:${ev.boss === 'drake' ? '#ff8a3d' : '#b48cff'}">${ev.boss === 'drake' ? '龙' : '卫'}</span>`);
        } else if (ev.text) this.announce({ html: `<span>${esc(ev.text)}</span>`, team: 0, dur: 2.4 });
      } else if (ev.type === 'wave' && ev.n === 1) {
        this.announce({ html: '<span class="big">全军出击</span>', team: myTeam, sound: 'game_start', prio: true, dur: 2.4 });
      }
    }
  }

  onKill(ev, myTeam) {
    const w = this.world, me = this.player;
    const k = w.unitById(ev.killer), v = w.unitById(ev.victim);
    if (!v) return;
    const kTeam = ev.team;
    const src = w.unitById(ev.killerSrc);
    const kImg = k ? this.img(k) : `<span class="ic" style="background:${kTeam === 1 ? '#123a6e' : '#6e1616'}">${src && src.kind === 'tower' ? '塔' : src && src.kind === 'monster' ? '野' : '兵'}</span>`;
    this.addFeed(`${kImg}<span class="sw">⚔</span>${this.img(v)}`);
    // 播报内容与优先级
    let big = '', sound = ev.team === myTeam ? 'kill' : 'ally_killed', prio = false;
    if (ev.multi >= 2) { const m = MULTI[Math.min(5, ev.multi)]; big = m[0]; sound = m[1]; prio = true; }
    else if (ev.firstBlood) { big = '第一滴血'; sound = 'first_blood'; prio = true; }
    else if (ev.streak >= 3) { big = streakName(ev.streak); if (ev.streak >= 8) sound = 'legendary'; prio = ev.streak >= 5; }
    let text;
    if (me && v === me) text = k ? `你被 ${esc(k.name)} 击败了` : '你阵亡了';
    else if (me && k === me) text = `你击败了 ${esc(v.name)}`;
    else text = k ? `${esc(k.name)} 击败了 ${esc(v.name)}` : `${esc(v.name)} 阵亡`;
    if (ev.shutdown) text += '，终结了对方连杀';
    const html = `${k ? `<img class="t${k.team}" src="${portrait(k.def)}">` : ''}${big ? `<span class="big">${big}</span>` : ''}<span>${text}</span><img class="t${v.team}" src="${portrait(v.def)}">`;
    this.announce({ html, team: kTeam, sound, prio: prio || (me && (k === me || v === me)), dur: big ? 2.8 : 2.0 });
    // 团灭
    const vt = v.team;
    if (w.heroes.filter((h) => h.team === vt).every((h) => h.dead)) {
      this.announce({ html: `<span class="big">团灭</span><span>${vt === myTeam ? '我方' : '敌方'}全员阵亡</span>`, team: kTeam, sound: 'legendary', prio: true, dur: 2.6 });
    }
  }

  // ================= 每帧 =================
  update(dt, fps) {
    this.updateAnnounce(dt);
    this.acc += dt;
    if (this.acc < 0.05) return;
    const step = this.acc;
    this.acc = 0;
    const w = this.world, g = this.game, me = this.player, R = g.renderer;
    // 比分、时间
    this.scoreB.textContent = w.score[1];
    this.scoreR.textContent = w.score[2];
    this.timeEl.textContent = fmtTime(w.time);
    if (!this.fpsEl.classList.contains('hidden')) this.fpsEl.textContent = `${Math.round(fps)} 帧`;
    // 双方头像
    const myTeam = me ? me.team : 1;
    for (const h of w.heroes) {
      const t = this.tb.get(h.id);
      const seen = g.spectate || h.team === myTeam || h.visible[myTeam];
      t.node.classList.toggle('dead', h.dead);
      t.node.classList.toggle('unseen', !h.dead && !seen);
      t.hp.style.width = `${h.dead ? 0 : seen ? (h.hp / h.stats.maxHp) * 100 : 0}%`;
      if (h.dead) t.rs.textContent = Math.ceil(h.respawnT);
      if (this.specHeroes) {
        const c = this.specHeroes.get(h.id);
        c.classList.toggle('dead', h.dead);
        c.classList.toggle('follow', R.followId === h.id && !R.free);
      }
    }
    // 小地图
    this.minimap.draw(w, {
      playerTeam: myTeam, player: me, spectate: g.spectate, fog: R.fog, dt: step,
      viewPoly: this.viewPoly(), portraits: (h) => this.portraitImg(h),
    });
    if (this.boardOpen) { this.boardT += step; if (this.boardT > 0.5) this.renderBoardNow(); }
    if (!me) return;
    this.updateSelf(me);
    this.updateSkills(me);
    this.shop.refresh();
  }

  viewPoly() {
    const R = this.game.renderer;
    const r = R.gl.domElement.getBoundingClientRect();
    const pts = [[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom]].map(([x, y]) => R.screenToGround(x, y));
    return pts.every(Boolean) ? pts : null;
  }

  updateSelf(me) {
    this.myStats.innerHTML = `<span class="k">⚔ ${me.kills}/${me.deaths}/${me.assists}</span><span>补刀 ${me.cs}</span>`;
    this.goldBtn.lastChild.textContent = Math.floor(me.gold);
    // 推荐装备
    const rec = nextRecommended(me);
    if (rec) {
      const can = me.canBuy(rec.id);
      const sig = rec.id + can + me.buyCost(rec.id);
      if (this.lastSig.rec !== sig) {
        this.lastSig.rec = sig;
        this.recBtn.classList.remove('hidden');
        this.recBtn.classList.toggle('ready', can);
        this.recBtn.querySelector('img').src = itemIcon(rec);
        this.recBtn.querySelector('.nm').textContent = rec.name;
        this.recBtn.querySelector('.pr').textContent = `💰 ${me.buyCost(rec.id)}`;
      }
    } else if (this.lastSig.rec !== 'none') { this.lastSig.rec = 'none'; this.recBtn.classList.add('hidden'); }
    // 死亡
    this.death.classList.toggle('on', me.dead);
    document.getElementById('view').classList.toggle('dead', me.dead);
    if (me.dead) this.death.querySelector('.n').textContent = Math.ceil(me.respawnT);
    // 自身面板（触屏隐藏）
    if (this.touch) return;
    const s = me.stats, sp = this.sp;
    sp.lv.textContent = me.level;
    sp.xp.style.width = me.level >= MAX_LEVEL ? '100%' : `${(me.xp / XP_TO_NEXT[me.level]) * 100}%`;
    sp.hp.style.width = `${(me.hp / s.maxHp) * 100}%`;
    sp.hpT.textContent = `${Math.ceil(me.hp)} / ${Math.round(s.maxHp)}`;
    if (me.resource !== 'none') {
      sp.mp.style.width = `${s.maxMp ? (me.mp / s.maxMp) * 100 : 0}%`;
      sp.mpT.textContent = `${Math.floor(me.mp)} / ${Math.round(s.maxMp)}`;
    }
    sp.stat.innerHTML = `<span>攻 <b>${Math.round(s.ad)}</b></span><span>法 <b>${Math.round(s.ap)}</b></span><span>甲 <b>${Math.round(s.armor)}</b></span><span>抗 <b>${Math.round(s.mr)}</b></span><span>速 <b>${Math.round(s.ms * 10) / 10}</b></span>`;
    const isig = me.items.join(',');
    if (this.lastSig.items !== isig) {
      this.lastSig.items = isig;
      this.itemSlots.forEach((slot, i) => {
        const it = ITEM_BY_ID[me.items[i]];
        slot.innerHTML = it ? `<img src="${itemIcon(it)}" title="${esc(it.name)}">` : '';
      });
    }
    // Buff
    const bsig = me.buffs.filter((b) => BUFF_CHIPS[b.key]).map((b) => `${b.key}:${Math.ceil(b.dur)}`).join(',');
    if (this.lastSig.buffs !== bsig) {
      this.lastSig.buffs = bsig;
      sp.buffs.innerHTML = me.buffs.filter((b) => BUFF_CHIPS[b.key]).map((b) => {
        const [c, t] = BUFF_CHIPS[b.key];
        return `<span style="display:inline-flex;align-items:center;gap:0.2rem;padding:0 0.45rem;border-radius:1rem;border:2px solid ${c};background:rgba(0,0,0,0.5);font-weight:800;font-size:0.9rem">${t} ${Math.ceil(b.dur)}</span>`;
      }).join('');
    }
  }

  setCd(b, left, total) {
    const cool = left > 0.05;
    b.classList.toggle('cooling', cool);
    const sw = b.querySelector('.sweep');
    if (cool) {
      const f = Math.max(0, Math.min(1, left / Math.max(0.01, total)));
      sw.style.background = `conic-gradient(rgba(0,0,0,0) ${(1 - f) * 360}deg, rgba(0,0,0,0.55) 0)`;
      sw.style.display = 'block';
      b.querySelector('.cd').textContent = left < 1 ? left.toFixed(1) : Math.ceil(left);
    } else sw.style.display = 'none';
  }

  updateSkills(me) {
    const blocked = me.dead || me.stunned || me.silenced || !!me.forced;
    for (let i = 0; i < 3; i++) {
      const b = this.btn['s' + i], s = me.skills[i];
      const total = Math.max(0.1, me.skillCd(i));
      this.setCd(b, s.cdLeft, total);
      b.classList.toggle('locked', s.level === 0);
      const noRes = s.level > 0 && me.resource !== 'none' && me.mp < me.skillCost(i);
      b.classList.toggle('nomana', noRes && !(s.cdLeft > 0));
      b.classList.toggle('ready', me.canCast(i));
      b.classList.toggle('blocked', blocked && s.level > 0);
      b.classList.toggle('canup', me.skillPoints > 0 && me.canUpgrade(i) && !me.dead);
      const dots = b.querySelectorAll('.lvl i');
      dots.forEach((d, k) => d.classList.toggle('on', k < s.level));
    }
    const sp = SPELLS[me.spell.id];
    this.setCd(this.btn.spell, me.spell.cdLeft, sp.cd);
    this.btn.spell.classList.toggle('ready', me.canUseSpell());
    const rb = this.btn.recall;
    rb.classList.toggle('recalling', !!me.recalling);
    if (me.recalling) { this.setCd(rb, me.recalling.t, 6); rb.classList.remove('cooling'); rb.querySelector('.cd').style.display = 'flex'; }
    else { this.setCd(rb, 0, 1); rb.querySelector('.cd').style.display = ''; }
    this.btn.attack.classList.toggle('blocked', blocked);
  }

  setFps(show) { this.fpsEl.classList.toggle('hidden', !show); }
  setCamLock(on) { this.camBtn.classList.toggle('on', !on); this.camBtn.textContent = on ? '🎥' : '🔓'; }

  destroy() {
    this.shop.close();
    document.getElementById('view').classList.remove('dead');
    this.root.innerHTML = '';
  }
}
