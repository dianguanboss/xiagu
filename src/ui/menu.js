// 菜单界面：主页、选英雄、加载、结算；设置、操作说明、暂停弹窗
import { HEROES, HERO_BY_ID, ROLES, POSITIONS } from '../data/heroes.js';
import { SPELLS } from '../sim/hero.js';
import { defaultSpell } from '../sim/match.js';
import { el, esc, onTap, portrait, fillDesc, targetName, fmtTime, DIFF_NAMES, sfx } from './common.js';
import { skillIcon, passiveIcon, spellIcon } from './icons.js';
import { renderBoard } from './board.js';
import { loadSettings, saveSettings } from '../settings.js';
import audio from '../audio/audio.js';

const TIPS = [
  '补刀：小兵最后一击由你打出才能拿到全部金币。',
  '炎鳞龙给全队金币和攻击强化，远古守卫会强化己方兵线。',
  '蓝 Buff 回蓝并减少冷却，红 Buff 让普攻灼烧减速敌人。',
  '敌人在草丛里时看不见，小心草丛埋伏。',
  '防御塔会优先攻击打你队友的敌方英雄。',
  '残血时按 B 回城，回到泉水能快速恢复。',
  '没有己方小兵时去拆塔，塔对英雄伤害很高。',
  '技能升级：等级提升后点技能按钮上的 + 号。',
];

export class Menus {
  /**
   * hooks: { renderer, onStart(opts), onSpectate(opts), onQuit(), onResume(), onSurrender(), onSettingsChanged(s) }
   */
  constructor(root, hooks) {
    this.root = root;
    this.h = hooks;
    this.s = loadSettings();
    this.screens = {};
    for (const id of ['main', 'select', 'loading', 'result']) {
      const s = el('section', 'screen');
      s.id = 'scr-' + id;
      root.appendChild(s);
      this.screens[id] = s;
    }
    this.modalWrap = el('div', 'modal-wrap');
    root.appendChild(this.modalWrap);
    this.modalWrap.addEventListener('pointerdown', (e) => { if (e.target === this.modalWrap && this.modalCloser) this.modalCloser(); });
    this.buildMain();
    this.pick = { heroId: HERO_BY_ID[this.s.lastHero] ? this.s.lastHero : HEROES[0].id, position: this.s.lastPosition, spell: this.s.lastSpell, difficulty: this.s.difficulty };
    this.roleFilter = 'all';
  }

  show(id) {
    for (const [k, s] of Object.entries(this.screens)) s.classList.toggle('on', k === id);
    this.current = id;
  }
  hideAll() { this.show(null); this.closeModal(); }

  // —— 主页 ——
  buildMain() {
    const s = this.screens.main;
    s.innerHTML = `
      <h1 class="title-gold">峡谷之巅</h1>
      <div class="sub">五 v 五 · 三路征战</div>
      <div class="menu-btns"></div>
      <div class="ver">原创 MOBA 演示版 · 全部美术与音效由程序生成</div>`;
    const box = s.querySelector('.menu-btns');
    const add = (txt, cls, fn) => { const b = el('button', 'btn ' + cls, txt); onTap(b, fn); box.appendChild(b); return b; };
    add('⚔ 开始对战', 'primary', () => this.showSelect());
    add('👁 观战：电脑对战', '', () => this.h.onSpectate({ difficulty: this.s.difficulty }));
    add('⚙ 设置', '', () => this.openSettings());
    add('❓ 操作说明', '', () => this.openHelp());
  }

  showMain() {
    this.closeModal();
    this.show('main');
    const r = this.h.renderer;
    r.enterShowcase();
    const def = HERO_BY_ID[this.s.lastHero] || HEROES[(Math.random() * HEROES.length) | 0];
    r.setShowcaseHero(def, 1, 0.55);
    audio.playMusic('menu');
  }

  // —— 选英雄 ——
  showSelect() {
    this.closeModal();
    const s = this.screens.select;
    s.innerHTML = `
      <div class="sel-left">
        <h2 class="title-gold">选择英雄</h2>
        <div class="role-tabs"></div>
        <div class="hero-grid"></div>
      </div>
      <div class="sel-center">
        <h2 class="hero-name title-gold"></h2>
        <div class="hero-title"></div>
      </div>
      <div class="sel-right">
        <div class="sel-detail panel"></div>
        <div class="opt-block panel">
          <div class="opt-line"><span class="lbl">分路</span><span class="opt-pos"></span></div>
          <div class="opt-line"><span class="lbl">召唤师技能</span><span class="opt-spell"></span></div>
          <div class="opt-line"><span class="lbl">电脑难度</span><span class="opt-diff"></span></div>
        </div>
        <div class="sel-actions"></div>
      </div>`;
    // 职业筛选
    const tabs = s.querySelector('.role-tabs');
    const roles = [['all', '全部'], ...Object.entries(ROLES)];
    for (const [k, name] of roles) {
      if (k !== 'all' && !HEROES.some((h) => h.roles.includes(k))) continue;
      const c = el('button', 'chip' + (this.roleFilter === k ? ' on' : ''), name);
      onTap(c, () => { this.roleFilter = k; tabs.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c)); this.fillGrid(); });
      tabs.appendChild(c);
    }
    const act = s.querySelector('.sel-actions');
    const back = el('button', 'btn', '返回');
    onTap(back, () => this.showMain());
    const go = el('button', 'btn primary', '开始对战');
    onTap(go, () => this.startGame(), 'game_start');
    act.append(back, go);
    this.fillGrid();
    this.selectHero(this.pick.heroId, true);
    this.show('select');
    audio.playMusic('menu');
  }

  fillGrid() {
    const grid = this.screens.select.querySelector('.hero-grid');
    grid.innerHTML = '';
    for (const h of HEROES) {
      if (this.roleFilter !== 'all' && !h.roles.includes(this.roleFilter)) continue;
      const c = el('div', 'hero-card' + (h.id === this.pick.heroId ? ' on' : ''));
      c.dataset.id = h.id;
      c.innerHTML = `<img src="${portrait(h)}" alt=""><div class="nm">${esc(h.name)}</div>`;
      onTap(c, () => this.selectHero(h.id));
      grid.appendChild(c);
    }
  }

  selectHero(id, initial = false) {
    const def = HERO_BY_ID[id];
    const changed = this.pick.heroId !== id;
    this.pick.heroId = id;
    if (changed || !def.positions.includes(this.pick.position)) this.pick.position = def.positions[0];
    if (changed || !this.pick.spell) this.pick.spell = defaultSpell(this.pick.position);
    const s = this.screens.select;
    s.querySelectorAll('.hero-card').forEach((c) => c.classList.toggle('on', c.dataset.id === id));
    s.querySelector('.hero-name').textContent = def.name;
    s.querySelector('.hero-title').textContent = def.title;
    const stars = '★'.repeat(def.difficulty) + '☆'.repeat(3 - def.difficulty);
    const keys = ['Q', 'E', 'R'];
    let html = `<div class="tags">${def.roles.map((r) => `<span class="tag">${ROLES[r]}</span>`).join('')}
      <span class="tag" style="background:rgba(255,255,255,0.08);border-color:#777">${def.attack === 'ranged' ? '远程' : '近战'}</span>
      <span style="margin-left:auto">上手难度 <span class="stars">${stars}</span></span></div>`;
    html += `<div class="skill-row"><img src="${passiveIcon(def)}" style="border-radius:0.5rem"><div><div class="s-name">被动 · ${esc(def.passive.name)}</div><div class="s-desc">${fillDesc(def.passive.desc, def.passive.vals)}</div></div></div>`;
    def.skills.forEach((sk, i) => {
      const cd = sk.cd.length > 3 ? `${sk.cd[0]}→${sk.cd[sk.cd.length - 1]}` : sk.cd.join('/');
      const cost = def.resource === 'none' || !sk.cost[0] ? '无消耗' : `消耗 ${sk.cost[0]}${def.resource === 'energy' ? ' 能量' : ' 法力'}`;
      html += `<div class="skill-row"><img src="${skillIcon(def, i)}"><div>
        <div class="s-name"><span class="s-key">${keys[i]}</span>${esc(sk.name)}${i === 2 ? '（大招）' : ''}</div>
        <div class="s-meta">${targetName(sk.target)} · 冷却 ${cd} 秒 · ${cost}</div>
        <div class="s-desc">${fillDesc(sk.desc, sk.vals)}</div></div></div>`;
    });
    s.querySelector('.sel-detail').innerHTML = html;
    s.querySelector('.sel-detail').scrollTop = 0;
    this.fillOptions();
    if (!initial || changed || true) {
      const r = this.h.renderer;
      r.enterShowcase();
      r.setShowcaseHero(def, 1, 0);
    }
    if (changed) sfx('ui_hover');
  }

  fillOptions() {
    const s = this.screens.select;
    const def = HERO_BY_ID[this.pick.heroId];
    const pos = s.querySelector('.opt-pos');
    pos.innerHTML = '';
    for (const p of def.positions) {
      const c = el('button', 'chip' + (p === this.pick.position ? ' on' : ''), POSITIONS[p]);
      onTap(c, () => { this.pick.position = p; this.pick.spell = defaultSpell(p); this.fillOptions(); });
      pos.appendChild(c);
    }
    const sp = s.querySelector('.opt-spell');
    sp.innerHTML = '';
    for (const id of Object.keys(SPELLS)) {
      const c = el('button', 'chip' + (id === this.pick.spell ? ' on' : ''), `<img src="${spellIcon(id)}">${SPELLS[id].name}`);
      c.title = SPELLS[id].desc.replace('{d}', '900+');
      onTap(c, () => { this.pick.spell = id; this.fillOptions(); });
      sp.appendChild(c);
    }
    const df = s.querySelector('.opt-diff');
    df.innerHTML = '';
    for (const d of ['easy', 'normal', 'hard']) {
      const c = el('button', 'chip' + (d === this.pick.difficulty ? ' on' : ''), DIFF_NAMES[d]);
      onTap(c, () => { this.pick.difficulty = d; this.fillOptions(); });
      df.appendChild(c);
    }
  }

  startGame() {
    const p = this.pick;
    this.s = saveSettings({ lastHero: p.heroId, lastPosition: p.position, lastSpell: p.spell, difficulty: p.difficulty });
    this.h.onStart({ playerHero: p.heroId, playerPosition: p.position, playerSpell: p.spell, difficulty: p.difficulty, autoLevel: this.s.autoLevel });
  }

  // —— 加载 ——
  showLoading(world) {
    this.closeModal();
    const s = this.screens.loading;
    s.innerHTML = '';
    const row = (team) => {
      const box = el('div', 'load-team');
      for (const h of world.heroes.filter((x) => x.team === team)) {
        const c = el('div', `load-card t${team}` + (h.isPlayer ? ' me' : ''));
        c.innerHTML = `<img src="${portrait(h.def)}"><div class="nm">${esc(h.name)}</div><div class="pos">${POSITIONS[h.position]}${h.isPlayer ? ' · 你' : ''}</div>`;
        box.appendChild(c);
      }
      return box;
    };
    s.appendChild(row(1));
    s.appendChild(el('div', 'load-vs title-gold', 'VS'));
    s.appendChild(row(2));
    const bar = el('div', 'load-bar', '<i></i>');
    s.appendChild(bar);
    s.appendChild(el('div', 'load-tip', '小提示：' + TIPS[(Math.random() * TIPS.length) | 0]));
    this.show('loading');
    return { set: (k) => { bar.firstChild.style.width = `${Math.round(Math.min(1, k) * 100)}%`; } };
  }

  // —— 结算 ——
  showResult(world, { playerTeam, spectate }) {
    this.closeModal();
    const s = this.screens.result;
    const win = !spectate && world.winner === playerTeam;
    const banner = spectate ? `${world.winner === 1 ? '蓝方' : '红方'}胜利` : win ? '胜 利' : '失 败';
    s.innerHTML = `<h1 class="banner title-gold ${!spectate && !win ? 'lose' : ''}">${banner}</h1>
      <div class="res-meta">对局时长 ${fmtTime(world.time)} · 比分 <b style="color:var(--blue)">${world.score[1]}</b> : <b style="color:var(--red)">${world.score[2]}</b> · 难度 ${DIFF_NAMES[world.difficulty] || ''}</div>
      <div class="board"></div>
      <div class="res-actions"></div>`;
    renderBoard(s.querySelector('.board'), world, world.player ? world.player.id : 0, { final: true });
    const act = s.querySelector('.res-actions');
    const again = el('button', 'btn primary', spectate ? '再看一局' : '再来一局');
    onTap(again, () => (spectate ? this.h.onSpectate({ difficulty: this.s.difficulty }) : this.showSelect()));
    const home = el('button', 'btn', '返回主页');
    onTap(home, () => { this.h.onQuit(); this.showMain(); });
    act.append(again, home);
    this.show('result');
  }

  // —— 弹窗 ——
  openModal(html, closer) {
    this.modalWrap.innerHTML = '';
    const m = el('div', 'modal panel', html);
    this.modalWrap.appendChild(m);
    this.modalWrap.classList.add('on');
    this.modalCloser = closer || (() => this.closeModal());
    return m;
  }
  closeModal() {
    if (!this.modalWrap.classList.contains('on')) return;
    this.modalWrap.classList.remove('on');
    this.modalWrap.innerHTML = '';
    const after = this.afterClose; this.afterClose = null;
    this.modalCloser = null;
    if (after) after();
  }
  get modalOpen() { return this.modalWrap.classList.contains('on'); }

  openSettings(after) {
    const s = this.s = loadSettings();
    const m = this.openModal(`<h2>设置</h2>
      <div class="row"><span class="lbl">总音量</span><input type="range" min="0" max="100" data-k="master"><span class="val"></span></div>
      <div class="row"><span class="lbl">音乐</span><input type="range" min="0" max="100" data-k="music"><span class="val"></span></div>
      <div class="row"><span class="lbl">音效</span><input type="range" min="0" max="100" data-k="sfx"><span class="val"></span></div>
      <div class="row"><span class="lbl">画质</span><span class="q-chips"></span></div>
      <div class="row note">画质在下一局开始时生效。手机上建议用"低"或"中"。</div>
      <div class="row"><span class="lbl">自动加点</span><div class="toggle" data-t="autoLevel"></div><span class="note">升级时自动分配技能点（下一局生效）</span></div>
      <div class="row"><span class="lbl">显示帧率</span><div class="toggle" data-t="showFps"></div></div>
      <div class="actions"><button class="btn primary small" data-a="ok">完成</button></div>`);
    this.afterClose = after || null;
    m.querySelectorAll('input[type=range]').forEach((inp) => {
      const k = inp.dataset.k;
      const val = inp.nextElementSibling;
      inp.value = Math.round(s[k] * 100);
      val.textContent = inp.value;
      inp.addEventListener('input', () => {
        val.textContent = inp.value;
        this.s = saveSettings({ [k]: inp.value / 100 });
        audio.setVolumes({ master: this.s.master, music: this.s.music, sfx: this.s.sfx });
      });
      inp.addEventListener('change', () => sfx('ui_click'));
    });
    const qc = m.querySelector('.q-chips');
    const qs = [['auto', '自动'], ['low', '低'], ['medium', '中'], ['high', '高']];
    const fillQ = () => {
      qc.innerHTML = '';
      for (const [k, name] of qs) {
        const c = el('button', 'chip' + (this.s.quality === k ? ' on' : ''), name);
        onTap(c, () => { this.s = saveSettings({ quality: k }); fillQ(); });
        qc.appendChild(c);
      }
    };
    fillQ();
    m.querySelectorAll('.toggle').forEach((t) => {
      const k = t.dataset.t;
      t.classList.toggle('on', !!this.s[k]);
      onTap(t, () => { this.s = saveSettings({ [k]: !this.s[k] }); t.classList.toggle('on', !!this.s[k]); this.h.onSettingsChanged && this.h.onSettingsChanged(this.s); });
    });
    onTap(m.querySelector('[data-a=ok]'), () => this.closeModal(), 'ui_close');
  }

  openHelp(after) {
    const m = this.openModal(`<h2>操作说明</h2>
      <h3 style="margin:0.4rem 0">电脑（键盘 + 鼠标）</h3>
      <div class="help-grid">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>移动（也可以鼠标右键点地面移动）</span>
        <span>右键</span><span>点地面移动，点敌人攻击</span>
        <span><kbd>Q</kbd><kbd>E</kbd><kbd>R</kbd></span><span>按住显示技能范围，松开朝鼠标方向施放；按住时点右键取消</span>
        <span><kbd>空格</kbd> / <kbd>J</kbd></span><span>普通攻击（自动选最近的敌人，优先英雄）</span>
        <span><kbd>F</kbd></span><span>召唤师技能（闪现朝鼠标方向）</span>
        <span><kbd>B</kbd></span><span>回城</span>
        <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></span><span>升级技能（也可点技能按钮上的 +）</span>
        <span><kbd>C</kbd></span><span>打开商店（任何地方都能买）</span>
        <span><kbd>Tab</kbd></span><span>按住查看计分表</span>
        <span><kbd>Y</kbd></span><span>镜头锁定 / 解锁（解锁后鼠标移到屏幕边缘可移动镜头）</span>
        <span>滚轮</span><span>镜头远近</span>
        <span><kbd>Esc</kbd></span><span>暂停菜单</span>
      </div>
      <h3 style="margin:0.9rem 0 0.4rem">手机（横屏）</h3>
      <div class="help-grid">
        <span>左下摇杆</span><span>移动</span>
        <span>技能按钮</span><span>轻点自动瞄准施放；按住拖动瞄准，松手施放；拖到"取消"上放弃</span>
        <span>大攻击键</span><span>普通攻击；旁边小键分别是"补刀"（打小兵野怪）和"推塔"</span>
        <span>小地图</span><span>按住查看其他位置，松手镜头回来</span>
      </div>
      <h3 style="margin:0.9rem 0 0.4rem">玩法</h3>
      <div class="note" style="line-height:1.6">两队各 5 名英雄，沿上、中、下三条路推进。摧毁敌方三路的防御塔后，打掉敌方基地水晶即获胜。
      击杀小兵、野怪和敌方英雄获得金币和经验，用金币购买装备。河道两侧的炎鳞龙和远古守卫是重要目标。</div>
      <div class="actions"><button class="btn primary small" data-a="ok">知道了</button></div>`);
    this.afterClose = after || null;
    onTap(m.querySelector('[data-a=ok]'), () => this.closeModal(), 'ui_close');
  }

  openPause({ spectate } = {}) {
    const m = this.openModal(`<h2>暂停</h2>
      <div style="display:flex;flex-direction:column;gap:0.7rem">
        <button class="btn primary" data-a="resume">继续游戏</button>
        <button class="btn" data-a="settings">设置</button>
        <button class="btn" data-a="help">操作说明</button>
        ${spectate ? '' : '<button class="btn red" data-a="surrender">投降</button>'}
        <button class="btn" data-a="quit">退出到主页</button>
      </div>`, () => { this.closeModal(); this.h.onResume(); });
    onTap(m.querySelector('[data-a=resume]'), () => { this.closeModal(); this.h.onResume(); });
    onTap(m.querySelector('[data-a=settings]'), () => this.openSettings(() => this.openPause({ spectate })));
    onTap(m.querySelector('[data-a=help]'), () => this.openHelp(() => this.openPause({ spectate })));
    const sur = m.querySelector('[data-a=surrender]');
    if (sur) onTap(sur, () => this.confirm('确定投降吗？本局将判负。', () => this.h.onSurrender(), () => this.openPause({ spectate })));
    onTap(m.querySelector('[data-a=quit]'), () => this.confirm('退出后本局进度不会保存，确定退出吗？', () => { this.h.onQuit(); this.showMain(); }, () => this.openPause({ spectate })));
  }

  confirm(text, yes, no) {
    const m = this.openModal(`<h2>确认</h2><p style="font-size:1.1rem">${esc(text)}</p>
      <div class="actions"><button class="btn small" data-a="no">取消</button><button class="btn red small" data-a="yes">确定</button></div>`, () => { this.closeModal(); no && no(); });
    onTap(m.querySelector('[data-a=yes]'), () => { this.modalCloser = null; this.modalWrap.classList.remove('on'); this.modalWrap.innerHTML = ''; yes(); });
    onTap(m.querySelector('[data-a=no]'), () => { this.closeModal(); no && no(); });
  }
}
