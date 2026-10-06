/**
 * 运行时合成音频引擎（Web Audio API）
 * 所有音效与音乐都在运行时合成：没有音频文件、没有采样、没有网络加载。
 *
 * 用法：
 *   import { audio } from './audio/audio.js';
 *   someButton.addEventListener('click', () => audio.unlock()); // 必须在用户手势里调用
 *   audio.play('hit_melee', { volume: 0.8, pan: -0.3, pitch: 1.1 });
 *   audio.playAt('explosion', x, y, camX, camY);
 *   audio.playMusic('battle');            // null 为停止
 *   audio.setVolumes({ master: 0.8, music: 0.5, sfx: 1 });
 *
 * 信号链：音效总线 + 音乐总线(含闪避) -> 主音量 -> 压缩器 -> 输出；
 *        播报类音效和音乐另有少量混响送到主音量。
 */

const MAX_VOICES = 24;
const MIN_GAP_MS = 40;
const MUSIC_TRIM = 0.9; // 音乐总线系数：默认音量下对战音乐比普通命中声低约 10dB，音效始终在上
const PENT = [0, 2, 4, 7, 9]; // 宫 商 角 徵 羽

const ANNOUNCER = new Set([
  'first_blood', 'double_kill', 'triple_kill', 'quadra_kill', 'penta_kill',
  'legendary', 'victory', 'defeat', 'tower_lost', 'ally_killed',
]);
// 带混响的音效（播报、钟、大爆破等）
const REVERB_SENDS = new Set([
  ...ANNOUNCER, 'kill', 'enemy_tower_down', 'game_start', 'bell',
  'crystal_destroy', 'level_up', 'thunder', 'dragon_roar', 'tower_destroy',
]);
// 播放时压低音乐
const DUCKERS = new Set([...ANNOUNCER, 'enemy_tower_down', 'crystal_destroy']);
// 高频战斗音效每次随机微调音高，避免机械重复
const VARY = new Set([
  'swing', 'hit_melee', 'hit_heavy', 'arrow_shoot', 'arrow_hit', 'gun_shot',
  'magic_shoot', 'magic_hit', 'crit', 'minion_die', 'tower_shot', 'tower_hit',
  'burn', 'chain', 'ice_hit', 'gold', 'dash',
]);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const pent = (root, i) => {
  const o = Math.floor(i / 5);
  return root + 12 * o + PENT[i - o * 5];
};
const nowMs = () =>
  typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 拨弦（Karplus–Strong）音色参数：sus 为基频衰减到 -60dB 的秒数
const KS_KINDS = {
  zheng: { sus: 2.2, bright: 0.55, pick: 0.13, len: 2.4 },
  bass: { sus: 1.3, bright: 0.3, pick: 0.22, len: 1.5 },
};

/* ------------------------------------------------------------------ */
/* Voice：一次发声的节点集合，负责包络、自动断开回收                      */
/* ------------------------------------------------------------------ */
class Voice {
  constructor(eng, t0, pitch, out) {
    this.e = eng;
    this.c = eng.ctx;
    this.t0 = t0;
    this.p = pitch;
    this.out = out;
    this.nodes = [];
    this.live = 0;
    this.end = t0;
    this.freed = false;
    this.timer = 0;
  }

  _n(node) {
    this.nodes.push(node);
    return node;
  }

  _f(f) {
    return clamp(f * this.p, 10, this.c.sampleRate * 0.45);
  }

  _src(s, start, stop, offset) {
    this.live++;
    s.onended = () => {
      if (--this.live <= 0) this.free();
    };
    if (offset != null) s.start(start, offset);
    else s.start(start);
    s.stop(stop);
    if (stop > this.end) this.end = stop;
  }

  free() {
    if (this.freed) return;
    this.freed = true;
    if (this.timer && typeof clearTimeout === 'function') clearTimeout(this.timer);
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch (e) {
        /* 已断开 */
      }
    }
    this.nodes.length = 0;
  }

  // 兜底：onended 未触发时按时间回收
  arm() {
    if (this.live <= 0) {
      this.free();
      return;
    }
    if (typeof setTimeout === 'function') {
      const ms = (this.end - this.c.currentTime + 0.6) * 1000;
      this.timer = setTimeout(() => this.free(), Math.max(200, ms));
    }
  }

  gain(v = 1, to = this.out) {
    const g = this._n(this.c.createGain());
    g.gain.value = v;
    g.connect(to);
    return g;
  }

  // o: { t, f1, fp, gl } 频率自动化
  filt(type, f, q = 0.7, to = this.out, o = null) {
    const b = this._n(this.c.createBiquadFilter());
    b.type = type;
    b.Q.value = q;
    if (o) this._freq(b.frequency, this.t0 + (o.t || 0), f, o, o.gl || 0.3);
    else b.frequency.value = this._f(f);
    b.connect(to);
    return b;
  }

  _freq(p, T, f, o, dur) {
    p.setValueAtTime(this._f(f), T);
    if (o.fp) {
      for (const [dt, ff] of o.fp) p.exponentialRampToValueAtTime(this._f(ff), T + Math.max(dt, 0.001));
    } else if (o.f1) {
      p.exponentialRampToValueAtTime(this._f(o.f1), T + Math.max(o.gl != null ? o.gl : dur, 0.001));
    }
  }

  // 线性起音 -> 保持 -> 指数衰减；返回结束时刻（绝对时间）
  env(param, t, a, h, d, peak) {
    const T = this.t0 + t;
    const A = Math.max(a, 0.001);
    const H = Math.max(h, 0);
    const pk = Math.max(peak, 1e-4);
    // 初值置 0：否则音源亚采样起播时会有一帧按默认增益 1 输出，形成尖峰
    param.value = 0;
    param.setValueAtTime(0, T);
    param.linearRampToValueAtTime(pk, T + A);
    if (H > 0) param.setValueAtTime(pk, T + A + H);
    const end = T + A + H + Math.max(d, 0.005);
    param.exponentialRampToValueAtTime(1e-4, end);
    return end;
  }

  // 包络振荡器。o: { type, f, f1, fp, gl, t, a, h, d, v, to, det }
  tone(o) {
    const { type = 'sine', f = 440, t = 0, a = 0.005, h = 0, d = 0.2, v = 0.2, to = this.out, det = 0 } = o;
    const T = this.t0 + t;
    const osc = this._n(this.c.createOscillator());
    osc.type = type;
    this._freq(osc.frequency, T, f, o, a + h + d);
    if (det) osc.detune.value = det;
    const g = this._n(this.c.createGain());
    osc.connect(g);
    g.connect(to);
    const end = this.env(g.gain, t, a, h, d, v);
    this._src(osc, T, end + 0.02);
    return { o: osc, g, end };
  }

  // 滤波噪声（共享噪声缓冲）。v 已按带宽做响度补偿
  noise(o) {
    const { t = 0, a = 0.002, h = 0, d = 0.1, v = 0.2, ft = 'bandpass', f = 1000, q = 1, to = this.out } = o;
    const c = this.c;
    const T = this.t0 + t;
    const s = this._n(c.createBufferSource());
    s.buffer = this.e.noiseBuf;
    s.loop = true;
    const b = this._n(c.createBiquadFilter());
    b.type = ft;
    b.Q.value = q;
    this._freq(b.frequency, T, f, o, a + h + d);
    const nyq = c.sampleRate / 2;
    // 按包络峰值时刻的滤波频率估带宽做响度补偿（下扫噪声起点最宽，不能按中值补）
    let fp0 = f;
    if (o.fp && o.fp.length) fp0 = o.fp[0][0] <= a ? o.fp[0][1] : f;
    else if (o.f1) {
      const gl = Math.max(o.gl != null ? o.gl : a + h + d, 0.001);
      fp0 = f * Math.pow(o.f1 / f, Math.min(a / gl, 1));
    }
    const fm = this._f(fp0);
    const bw =
      ft === 'bandpass' ? fm / Math.max(q, 0.1) : ft === 'lowpass' ? fm : ft === 'highpass' ? Math.max(nyq - fm, 1000) : nyq;
    const comp = clamp(Math.sqrt(nyq / Math.max(bw, 1)), 1, 4);
    const g = this._n(c.createGain());
    s.connect(b);
    b.connect(g);
    g.connect(to);
    const end = this.env(g.gain, t, a, h, d, v * comp);
    this._src(s, T, end + 0.02, Math.random() * 1.5);
    return { s, b, g, end };
  }

  // 简单两算子 FM。r 频率比，i -> i1 调制指数
  fm(o) {
    const { f = 440, r = 1, i = 2, t = 0, a = 0.005, h = 0, d = 0.3, v = 0.2, to = this.out, type = 'sine' } = o;
    const i1 = o.i1 != null ? o.i1 : i;
    const c = this.c;
    const T = this.t0 + t;
    const dur = a + h + d;
    const car = this._n(c.createOscillator());
    car.type = type;
    const mod = this._n(c.createOscillator());
    this._freq(car.frequency, T, f, o, dur);
    const mo = {
      f1: o.f1 ? o.f1 * r : 0,
      gl: o.gl,
      fp: o.fp ? o.fp.map(([dt, ff]) => [dt, ff * r]) : null,
    };
    this._freq(mod.frequency, T, f * r, mo, dur);
    const mg = this._n(c.createGain());
    const fr = this._f(f * r);
    mg.gain.setValueAtTime(Math.max(i * fr, 0.01), T);
    mg.gain.exponentialRampToValueAtTime(Math.max(i1 * fr, 0.01), T + Math.max(a, 0.001) + h + d);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = this._n(c.createGain());
    car.connect(g);
    g.connect(to);
    const end = this.env(g.gain, t, a, h, d, v);
    this._src(car, T, end + 0.02);
    this._src(mod, T, end + 0.02);
    return { o: car, g, end };
  }

  // 低频振荡挂到参数上；delay>0 时深度从 0 渐入
  lfo(param, rate, depth, t, dur, delay = 0, type = 'sine') {
    const T = this.t0 + t;
    const o = this._n(this.c.createOscillator());
    o.type = type;
    o.frequency.value = rate;
    const g = this._n(this.c.createGain());
    if (delay > 0) {
      g.gain.setValueAtTime(0, T);
      g.gain.linearRampToValueAtTime(depth, T + delay);
    } else g.gain.value = depth;
    o.connect(g);
    g.connect(param);
    this._src(o, T, T + Math.max(dur, 0.01));
  }

  // 颤音（幅度调制）节点：增益在 [1-2*depth, 1] 间摆动
  trem(rate, depth, t, dur, to = this.out) {
    const g = this.gain(1 - depth, to);
    this.lfo(g.gain, rate, depth, t, dur);
    return g;
  }

  // Karplus–Strong 拨弦（筝/琵琶风格）。o: { t, v, len, bend, bendEnd, vib, kind }
  pluck(f, o = {}) {
    const { t = 0, v = 0.3, len = 0, bend = 0, bendEnd = 0, vib = 0, kind = 'zheng', to = this.out } = o;
    const F = this._f(f);
    const ks = this.e._ks(F, kind);
    if (!ks) return;
    const c = this.c;
    const T = this.t0 + t;
    const s = this._n(c.createBufferSource());
    s.buffer = ks.buf;
    const rate = F / ks.f0;
    const full = ks.buf.duration / rate;
    const dur = len > 0 ? Math.min(len, full) : full;
    const pr = s.playbackRate;
    if (bend) {
      pr.setValueAtTime(rate * Math.pow(2, bend / 12), T);
      pr.linearRampToValueAtTime(rate, T + 0.09);
    } else pr.setValueAtTime(rate, T);
    if (bendEnd) {
      pr.setValueAtTime(rate, T + dur * 0.5);
      pr.linearRampToValueAtTime(rate * Math.pow(2, bendEnd / 12), T + dur * 0.9);
    } else if (vib > 0 && dur > 0.6) {
      // 揉弦
      let tt = T + 0.3;
      let k = 0;
      while (tt < T + dur - 0.12 && k < 40) {
        pr.linearRampToValueAtTime(rate * (1 + (k % 2 ? -vib : vib)), tt);
        tt += 0.11;
        k++;
      }
      pr.linearRampToValueAtTime(rate, tt);
    }
    const g = this._n(c.createGain());
    g.gain.value = v;
    g.gain.setValueAtTime(v, T);
    if (dur < full - 0.01) {
      g.gain.setValueAtTime(v, T + Math.max(dur - 0.07, 0.001));
      g.gain.linearRampToValueAtTime(0, T + dur);
    }
    s.connect(g);
    g.connect(to);
    this._src(s, T, T + dur + 0.01);
  }

  /* ---------------- 复合乐器 ---------------- */

  taiko(t, v = 1, f = 70) {
    this.tone({ f: f * 2, f1: f, gl: 0.07, t, a: 0.002, d: 0.5, v: 0.45 * v });
    this.tone({ type: 'triangle', f: f * 3.1, f1: f * 1.5, gl: 0.06, t, a: 0.001, d: 0.09, v: 0.12 * v });
    this.noise({ ft: 'bandpass', f: 600, q: 0.8, t, a: 0.001, d: 0.05, v: 0.2 * v });
  }

  ka(t, v = 1) {
    this.noise({ ft: 'bandpass', f: 2200, q: 5, t, a: 0.001, d: 0.025, v: 0.22 * v });
    this.tone({ type: 'triangle', f: 1100, f1: 900, t, a: 0.001, d: 0.03, v: 0.07 * v });
  }

  shaker(t, v = 1) {
    this.noise({ ft: 'bandpass', f: 6000, q: 1.2, t, a: 0.008, d: 0.04, v: 0.06 * v });
  }

  cymbal(t, v = 1, d = 1) {
    this.noise({ ft: 'highpass', f: 4500, q: 0.7, t, a: 0.002, d, v: 0.1 * v });
    this.noise({ ft: 'bandpass', f: 8000, q: 1.5, t, a: 0.002, d: d * 0.4, v: 0.05 * v });
    this.fm({ f: 3150, r: 1.47, i: 1.2, i1: 0.3, t, a: 0.002, d: d * 0.7, v: 0.02 * v });
  }

  gong(t, v = 1, f = 98) {
    this.fm({ f, r: 1.41, i: 2.2, i1: 0.4, t, a: 0.01, d: 3, v: 0.2 * v });
    this.tone({ f: f * 1.19, t, a: 0.01, d: 2.2, v: 0.08 * v });
    this.tone({ f: f * 2.76, t, a: 0.02, d: 1.6, v: 0.04 * v });
    this.noise({ ft: 'bandpass', f: f * 6, q: 2, t, a: 0.25, d: 1.4, v: 0.05 * v });
    this.noise({ ft: 'lowpass', f: 1200, t, a: 0.001, d: 0.08, v: 0.12 * v });
  }

  // 铜管感：双锯齿 + 打开的低通
  brass(f, t, dur, v, bright = 2400) {
    const lp = this.filt('lowpass', 350, 1.5, this.out, { t, fp: [[0.06, bright], [dur + 0.25, bright * 0.55]] });
    for (const det of [-8, 7]) {
      this.tone({ type: 'sawtooth', f: f * 0.97, f1: f, gl: 0.05, t, a: 0.035, h: dur, d: 0.22, v: v * 0.5, to: lp, det });
    }
    this.tone({ type: 'triangle', f, t, a: 0.03, h: dur, d: 0.2, v: v * 0.3 });
  }

  chime(f, t, v, d = 0.6) {
    this.tone({ f, t, a: 0.003, d, v });
    this.tone({ f: f * 2, t, a: 0.003, d: d * 0.5, v: v * 0.2 });
    this.tone({ f: f * 2.756, t, a: 0.002, d: d * 0.35, v: v * 0.2 });
  }

  // 碎屑/噼啪：随机短噪声
  debris(t, span, n, v, lo, hi) {
    for (let k = 0; k < n; k++) {
      this.noise({
        ft: 'bandpass',
        f: lo + Math.random() * (hi - lo),
        q: 2,
        t: t + Math.random() * span,
        a: 0.001,
        d: 0.015 + Math.random() * 0.06,
        v: v * (0.5 + Math.random() * 0.5),
      });
    }
  }

  // 玻璃碎裂的高频叮声
  pings(t, span, n, v, lo, hi) {
    for (let k = 0; k < n; k++) {
      this.tone({
        type: 'triangle',
        f: lo * Math.pow(hi / lo, Math.random()),
        t: t + Math.random() * span,
        a: 0.001,
        d: 0.04 + Math.random() * 0.12,
        v: v * (0.5 + Math.random() * 0.5),
      });
    }
  }

  // 刮奏：五声音阶快速拨弦
  gliss(root, i0, i1, t, dur, v = 0.2) {
    const n = Math.abs(i1 - i0);
    const dir = i1 >= i0 ? 1 : -1;
    for (let k = 0; k <= n; k++) {
      const x = n ? k / n : 0;
      this.pluck(mtof(pent(root, i0 + dir * k)), { t: t + dur * x, v: v * (0.55 + 0.45 * x), len: k === n ? 0 : 0.9 });
    }
  }

  // 弦乐铺底：失谐锯齿，慢起音（接在低通总线上）
  pad(notes, t, dur, v = 1) {
    const a = Math.min(0.8, dur * 0.35);
    for (const m of notes) {
      const f = mtof(m);
      for (const det of [-9, 8]) {
        this.tone({ type: 'sawtooth', f, t, a, h: Math.max(0, dur - a), d: 0.9, v: 0.022 * v, det });
      }
    }
  }

  // 箫：正弦 + 少量泛音 + 气声 + 渐入颤音
  flute(f, t, dur, v = 1) {
    const h = Math.max(0, dur - 0.1);
    const o = this.tone({ f, t, a: 0.08, h, d: 0.3, v: 0.07 * v });
    this.tone({ type: 'triangle', f: f * 2, t, a: 0.08, h, d: 0.25, v: 0.012 * v });
    if (dur > 0.45) this.lfo(o.o.frequency, 5, f * 0.007 * this.p, t, dur + 0.35, 0.35);
    this.noise({ ft: 'bandpass', f: f * 2, q: 3, t, a: 0.04, h: h * 0.5, d: 0.2, v: 0.02 * v });
  }
}

/* ------------------------------------------------------------------ */
/* 音效配方                                                             */
/* ------------------------------------------------------------------ */
const M = mtof;

const SFX = {
  /* ---------- 界面 ---------- */
  ui_click(v) {
    v.tone({ type: 'triangle', f: 1800, f1: 1100, a: 0.001, d: 0.045, v: 0.16 });
    v.noise({ ft: 'highpass', f: 3500, a: 0.001, d: 0.012, v: 0.06 });
  },
  ui_hover(v) {
    v.tone({ f: 2400, f1: 2600, a: 0.004, d: 0.03, v: 0.05 });
  },
  ui_buy(v) {
    v.fm({ f: 1318.5, r: 2, i: 0.6, i1: 0.1, a: 0.002, d: 0.16, v: 0.11 });
    v.fm({ f: 1975.5, r: 2, i: 0.6, i1: 0.1, t: 0.07, a: 0.002, d: 0.28, v: 0.11 });
    v.noise({ ft: 'highpass', f: 6000, t: 0.07, a: 0.002, d: 0.12, v: 0.03 });
  },
  ui_sell(v) {
    v.fm({ f: 1568, r: 2, i: 0.5, i1: 0.1, a: 0.002, d: 0.12, v: 0.1 });
    v.fm({ f: 1174.7, r: 2, i: 0.5, i1: 0.1, t: 0.07, a: 0.002, d: 0.22, v: 0.1 });
  },
  ui_error(v) {
    const lp = v.filt('lowpass', 1100, 0.5);
    v.tone({ type: 'sawtooth', f: 233, a: 0.004, h: 0.05, d: 0.06, v: 0.13, to: lp });
    v.tone({ type: 'sawtooth', f: 196, t: 0.11, a: 0.004, h: 0.07, d: 0.08, v: 0.13, to: lp });
  },
  ui_open(v) {
    v.noise({ ft: 'bandpass', f: 500, f1: 2600, q: 1.2, a: 0.04, d: 0.12, v: 0.08 });
    v.tone({ f: 520, f1: 880, a: 0.01, d: 0.12, v: 0.07 });
  },
  ui_close(v) {
    v.noise({ ft: 'bandpass', f: 2600, f1: 500, q: 1.2, a: 0.02, d: 0.12, v: 0.08 });
    v.tone({ f: 880, f1: 480, a: 0.01, d: 0.12, v: 0.07 });
  },
  skill_up(v) {
    [880, 1318.5, 1760].forEach((f, k) => v.tone({ type: 'triangle', f, t: k * 0.045, a: 0.003, d: 0.22, v: 0.11 }));
    v.tone({ f: 3520, t: 0.09, a: 0.01, d: 0.3, v: 0.03 });
  },
  countdown(v) {
    v.tone({ f: 1046.5, a: 0.002, d: 0.09, v: 0.16 });
    v.tone({ type: 'triangle', f: 2093, a: 0.001, d: 0.03, v: 0.05 });
    v.noise({ ft: 'bandpass', f: 2500, q: 6, a: 0.001, d: 0.02, v: 0.08 });
  },
  game_start(v) {
    v.gong(0, 0.9, 92);
    v.taiko(0, 0.9, 62);
    v.brass(M(50), 0.02, 0.4, 0.14, 1400);
    v.brass(M(57), 0.02, 0.4, 0.09, 1400);
    [62, 66, 69, 74, 78].forEach((m, k) =>
      v.tone({ type: 'triangle', f: M(m), t: 0.45 + k * 0.08, a: 0.01, h: 0.25, d: 0.7, v: 0.06 }),
    );
    v.noise({ ft: 'highpass', f: 5000, t: 0.45, a: 0.3, d: 0.6, v: 0.03 });
  },

  /* ---------- 基础战斗 ---------- */
  swing(v) {
    v.noise({ ft: 'bandpass', f: 600, f1: 2400, q: 1.6, a: 0.045, d: 0.13, v: 0.26 });
    v.noise({ ft: 'lowpass', f: 700, a: 0.03, d: 0.1, v: 0.08 });
  },
  hit_melee(v) {
    v.tone({ f: 170, f1: 55, gl: 0.11, a: 0.002, d: 0.13, v: 0.26 });
    v.noise({ ft: 'lowpass', f: 2200, f1: 500, a: 0.001, d: 0.07, v: 0.26 });
    v.noise({ ft: 'bandpass', f: 1100, q: 1.2, a: 0.001, d: 0.04, v: 0.16 });
  },
  hit_heavy(v) {
    v.tone({ f: 130, f1: 40, gl: 0.2, a: 0.002, d: 0.26, v: 0.28 });
    v.tone({ type: 'triangle', f: 240, f1: 90, gl: 0.1, a: 0.002, d: 0.12, v: 0.14 });
    v.noise({ ft: 'lowpass', f: 1600, f1: 250, a: 0.001, d: 0.22, v: 0.3 });
    v.noise({ ft: 'bandpass', f: 700, q: 1, a: 0.001, d: 0.08, v: 0.18 });
  },
  arrow_shoot(v) {
    v.fm({ f: 210, f1: 190, r: 2, i: 2.5, i1: 0.2, a: 0.002, d: 0.16, v: 0.13 });
    v.noise({ ft: 'bandpass', f: 3200, f1: 1400, q: 1.5, t: 0.015, a: 0.02, d: 0.13, v: 0.13 });
  },
  arrow_hit(v) {
    v.tone({ f: 320, f1: 110, gl: 0.06, a: 0.001, d: 0.07, v: 0.26 });
    v.tone({ type: 'triangle', f: 640, f1: 520, a: 0.001, d: 0.04, v: 0.08 });
    v.noise({ ft: 'bandpass', f: 2600, q: 2, a: 0.001, d: 0.03, v: 0.14 });
  },
  gun_shot(v) {
    v.tone({ f: 160, f1: 50, gl: 0.09, a: 0.001, d: 0.1, v: 0.22 });
    v.noise({ ft: 'lowpass', f: 4000, f1: 600, a: 0.001, d: 0.11, v: 0.24 });
    v.noise({ ft: 'highpass', f: 2500, a: 0.001, d: 0.025, v: 0.12 });
  },
  magic_shoot(v) {
    v.fm({ f: 880, f1: 1760, r: 3.01, i: 1.6, i1: 0.3, a: 0.01, d: 0.22, v: 0.1 });
    v.tone({ type: 'triangle', f: 1320, f1: 2640, a: 0.01, d: 0.16, v: 0.06 });
    v.noise({ ft: 'bandpass', f: 4500, q: 3, a: 0.02, d: 0.18, v: 0.07 });
  },
  magic_hit(v) {
    v.tone({ f: 640, f1: 200, gl: 0.14, a: 0.002, d: 0.16, v: 0.2 });
    v.fm({ f: 1250, r: 1.41, i: 2.5, i1: 0.1, a: 0.002, d: 0.24, v: 0.08 });
    v.noise({ ft: 'bandpass', f: 3200, f1: 900, q: 1.5, a: 0.002, d: 0.12, v: 0.13 });
  },
  crit(v) {
    v.noise({ ft: 'bandpass', f: 7000, f1: 2500, q: 2, a: 0.004, d: 0.07, v: 0.2 });
    v.tone({ f: 220, f1: 70, gl: 0.08, t: 0.03, a: 0.001, d: 0.09, v: 0.3 });
    v.fm({ f: 1850, r: 2.76, i: 1.4, i1: 0.15, t: 0.03, a: 0.002, d: 0.45, v: 0.08 });
    v.tone({ f: 2490, t: 0.03, a: 0.002, d: 0.35, v: 0.04 });
  },

  /* ---------- 技能 ---------- */
  fireball(v) {
    v.noise({ ft: 'lowpass', f: 400, f1: 2000, q: 2, a: 0.06, d: 0.35, v: 0.26 });
    v.tone({ f: 110, f1: 70, a: 0.02, d: 0.3, v: 0.18 });
    v.debris(0.03, 0.3, 6, 0.1, 2500, 5000);
  },
  explosion(v) {
    v.tone({ f: 100, f1: 32, gl: 0.5, a: 0.002, d: 0.6, v: 0.26 });
    v.noise({ ft: 'lowpass', f: 3000, f1: 180, gl: 0.6, a: 0.002, d: 0.65, v: 0.34 });
    v.noise({ ft: 'bandpass', f: 800, q: 0.9, a: 0.002, d: 0.22, v: 0.18 });
    v.debris(0.05, 0.4, 6, 0.07, 1500, 3500);
  },
  burn(v) {
    v.noise({ ft: 'lowpass', f: 700, a: 0.05, h: 0.1, d: 0.25, v: 0.07 });
    v.debris(0, 0.38, 9, 0.12, 2000, 6000);
  },
  ice_cast(v) {
    v.fm({ f: 1480, r: 3.5, i: 1.2, i1: 0.1, a: 0.01, d: 0.3, v: 0.07 });
    [2093, 2637, 3136].forEach((f, k) => v.tone({ f, t: 0.02 + k * 0.04, a: 0.002, d: 0.2, v: 0.05 }));
    v.noise({ ft: 'highpass', f: 5000, a: 0.06, d: 0.24, v: 0.06 });
  },
  ice_hit(v) {
    v.tone({ f: 320, f1: 140, gl: 0.06, a: 0.001, d: 0.06, v: 0.2 });
    v.noise({ ft: 'highpass', f: 3000, a: 0.001, d: 0.14, v: 0.14 });
    v.pings(0, 0.14, 9, 0.05, 2500, 7000);
  },
  freeze(v) {
    v.tone({ f: 260, f1: 120, a: 0.01, d: 0.35, v: 0.12 });
    v.noise({ ft: 'bandpass', f: 6000, f1: 2000, q: 1.5, a: 0.04, d: 0.45, v: 0.1 });
    v.fm({ f: 2400, r: 1.5, i: 1.5, i1: 0.1, t: 0.05, a: 0.05, d: 0.5, v: 0.04 });
    v.debris(0.02, 0.45, 8, 0.07, 4000, 8000);
  },
  heal(v) {
    [74, 78, 81, 86, 88].forEach((m, k) => v.chime(M(m), k * 0.07, 0.07, 0.5));
    v.tone({ f: 587.3, a: 0.15, h: 0.1, d: 0.4, v: 0.04 });
  },
  shield(v) {
    const tr = v.trem(11, 0.3, 0, 0.75);
    v.tone({ type: 'triangle', f: 440, f1: 660, gl: 0.15, a: 0.05, h: 0.12, d: 0.45, v: 0.08, to: tr });
    v.tone({ type: 'triangle', f: 663, f1: 994, gl: 0.15, a: 0.05, h: 0.12, d: 0.45, v: 0.06, to: tr });
    v.fm({ f: 1320, r: 2, i: 1, i1: 0.2, a: 0.08, d: 0.4, v: 0.04 });
    v.noise({ ft: 'bandpass', f: 5000, q: 4, a: 0.08, d: 0.35, v: 0.04 });
  },
  dash(v) {
    v.noise({ ft: 'bandpass', f: 400, f1: 3000, q: 1.2, a: 0.02, d: 0.16, v: 0.26 });
    v.tone({ f: 130, f1: 60, a: 0.001, d: 0.07, v: 0.18 });
  },
  blink(v) {
    v.fm({ f: 300, f1: 2400, r: 2, i: 3, i1: 0.5, a: 0.005, d: 0.17, v: 0.1 });
    v.noise({ ft: 'highpass', f: 4000, t: 0.11, a: 0.002, d: 0.09, v: 0.09 });
    v.tone({ f: 2400, f1: 3600, t: 0.12, a: 0.002, d: 0.1, v: 0.05 });
  },
  stun(v) {
    v.tone({ f: 300, f1: 120, gl: 0.06, a: 0.001, d: 0.07, v: 0.22 });
    const a = v.tone({ f: 1568, t: 0.02, a: 0.003, d: 0.55, v: 0.08 });
    v.lfo(a.o.frequency, 7, 30 * v.p, 0.02, 0.6);
    const b = v.tone({ f: 2093, t: 0.13, a: 0.003, d: 0.45, v: 0.06 });
    v.lfo(b.o.frequency, 7.5, 40 * v.p, 0.13, 0.5);
  },
  knockup(v) {
    v.tone({ f: 150, f1: 50, gl: 0.1, a: 0.001, d: 0.13, v: 0.34 });
    v.noise({ ft: 'bandpass', f: 300, f1: 2600, q: 1.2, a: 0.05, d: 0.22, v: 0.18 });
    v.tone({ f: 220, f1: 660, a: 0.03, d: 0.2, v: 0.06 });
  },
  slam(v) {
    v.tone({ f: 85, f1: 30, gl: 0.4, a: 0.002, d: 0.5, v: 0.28 });
    v.tone({ type: 'triangle', f: 180, f1: 60, gl: 0.15, a: 0.001, d: 0.15, v: 0.15 });
    v.noise({ ft: 'lowpass', f: 900, f1: 120, gl: 0.45, a: 0.002, d: 0.5, v: 0.3 });
    v.noise({ ft: 'bandpass', f: 450, q: 0.8, a: 0.001, d: 0.14, v: 0.2 });
    v.debris(0.08, 0.35, 5, 0.07, 800, 2200);
  },
  howl(v) {
    const fp = [[0.35, 540], [0.85, 500], [1.25, 360]];
    const bp = v.filt('bandpass', 900, 3);
    const r = v.tone({ type: 'sawtooth', f: 300, fp, a: 0.15, h: 0.6, d: 0.5, v: 0.16, to: bp });
    v.lfo(r.o.frequency, 5.5, 7 * v.p, 0.3, 1.1, 0.2);
    const s = v.fm({ f: 300, fp, r: 1, i: 0.6, i1: 0.3, a: 0.15, h: 0.6, d: 0.5, v: 0.07 });
    v.lfo(s.o.frequency, 5.5, 7 * v.p, 0.3, 1.1, 0.2);
    v.noise({ ft: 'bandpass', f: 1400, q: 2, a: 0.2, h: 0.5, d: 0.5, v: 0.025 });
  },
  bell(v) {
    // 大铜钟：非谐和分音，低分音衰减更慢
    const f = 130.8;
    const P = [
      [0.5, 0.25, 3.2], [1, 0.3, 2.9], [1.19, 0.22, 2.3], [1.56, 0.12, 1.8], [2, 0.2, 2.0],
      [2.51, 0.1, 1.4], [2.66, 0.08, 1.2], [3.01, 0.07, 1.0], [4.07, 0.05, 0.7], [5.43, 0.035, 0.5],
    ];
    for (const [r, amp, d] of P) v.tone({ f: f * r, a: 0.004, d, v: amp * 0.4, det: (Math.random() - 0.5) * 4 });
    v.tone({ f: f * 1.004, a: 0.004, d: 2.6, v: 0.06 }); // 拍频
    v.tone({ f: f * 2.006, a: 0.004, d: 1.9, v: 0.05 });
    v.noise({ ft: 'bandpass', f: 1800, q: 1.2, a: 0.001, d: 0.05, v: 0.13 });
    v.tone({ f: 90, f1: 60, a: 0.001, d: 0.12, v: 0.14 });
  },
  chain(v) {
    for (let k = 0; k < 9; k++) {
      const t = k * 0.035 + Math.random() * 0.02;
      v.fm({ f: 2000 + Math.random() * 1800, r: 1.41 + Math.random(), i: 1.5, i1: 0.1, t, a: 0.001, d: 0.05 + Math.random() * 0.05, v: 0.06 });
      v.noise({ ft: 'bandpass', f: 5000, q: 3, t, a: 0.001, d: 0.02, v: 0.08 });
    }
  },
  whirl(v) {
    const tr = v.trem(15, 0.45, 0, 0.6);
    v.noise({ ft: 'bandpass', f: 1400, f1: 2200, q: 1.8, a: 0.06, h: 0.2, d: 0.22, v: 0.22, to: tr });
    v.tone({ type: 'triangle', f: 2200, f1: 2600, a: 0.05, h: 0.2, d: 0.2, v: 0.03, to: tr });
  },
  buff(v) {
    const lp = v.filt('lowpass', 600, 2, v.out, { f1: 3000, gl: 0.35 });
    for (const det of [-8, 8]) {
      v.tone({ type: 'sawtooth', f: 220, f1: 440, gl: 0.35, a: 0.05, h: 0.1, d: 0.3, v: 0.07, to: lp, det });
    }
    v.chime(880, 0.3, 0.07, 0.35);
    v.chime(1318.5, 0.34, 0.06, 0.4);
    v.noise({ ft: 'highpass', f: 6000, t: 0.25, a: 0.05, d: 0.3, v: 0.035 });
  },
  wind(v) {
    v.noise({ ft: 'bandpass', f: 380, fp: [[0.35, 1300], [1.0, 450]], q: 0.9, a: 0.3, h: 0.2, d: 0.5, v: 0.2 });
    v.noise({ ft: 'bandpass', f: 1800, fp: [[0.4, 2600], [1.0, 1500]], q: 6, a: 0.35, h: 0.1, d: 0.5, v: 0.04 });
  },
  thunder(v) {
    v.noise({ ft: 'highpass', f: 1500, a: 0.001, d: 0.09, v: 0.28 });
    v.noise({ ft: 'bandpass', f: 3000, q: 1, a: 0.001, d: 0.04, v: 0.18 });
    v.noise({ ft: 'lowpass', f: 320, f1: 70, gl: 1.3, a: 0.04, d: 1.3, v: 0.4 });
    v.tone({ f: 58, f1: 34, gl: 1, a: 0.02, d: 1, v: 0.14 });
    v.noise({ ft: 'lowpass', f: 220, t: 0.28, a: 0.08, d: 0.8, v: 0.28 });
  },
  meteor(v) {
    v.tone({ f: 1700, f1: 300, gl: 0.55, a: 0.3, h: 0.2, d: 0.05, v: 0.05 });
    v.noise({ ft: 'lowpass', f: 500, f1: 2600, gl: 0.55, q: 1.5, a: 0.5, d: 0.06, v: 0.22 });
    const t = 0.55;
    v.tone({ f: 90, f1: 28, gl: 0.7, t, a: 0.002, d: 0.8, v: 0.26 });
    v.noise({ ft: 'lowpass', f: 2200, f1: 150, gl: 0.8, t, a: 0.002, d: 0.85, v: 0.32 });
    v.noise({ ft: 'bandpass', f: 600, q: 0.8, t, a: 0.002, d: 0.25, v: 0.18 });
    v.debris(t + 0.05, 0.5, 6, 0.07, 1000, 3000);
  },
  root(v) {
    const bp = v.filt('bandpass', 700, 5);
    const c = v.tone({ type: 'sawtooth', f: 110, f1: 85, a: 0.02, h: 0.1, d: 0.15, v: 0.12, to: bp });
    v.lfo(c.o.frequency, 31, 25 * v.p, 0, 0.3);
    [0, 0.07, 0.16].forEach((t, k) => v.noise({ ft: 'highpass', f: 2000 + k * 600, t, a: 0.001, d: 0.018, v: 0.24 }));
    v.tone({ type: 'triangle', f: 230, f1: 150, a: 0.001, d: 0.07, v: 0.14 });
  },

  /* ---------- 建筑与单位 ---------- */
  tower_shot(v) {
    v.fm({ f: 900, f1: 220, r: 1.5, i: 4, i1: 0.5, a: 0.002, d: 0.2, v: 0.12 });
    v.tone({ f: 1300, f1: 300, a: 0.002, d: 0.15, v: 0.08 });
    v.noise({ ft: 'bandpass', f: 3000, q: 2, a: 0.001, d: 0.05, v: 0.09 });
  },
  tower_hit(v) {
    v.tone({ f: 180, f1: 70, gl: 0.1, a: 0.001, d: 0.12, v: 0.3 });
    v.fm({ f: 520, r: 1.41, i: 2, i1: 0.2, a: 0.001, d: 0.25, v: 0.07 });
    v.noise({ ft: 'lowpass', f: 2500, a: 0.001, d: 0.07, v: 0.18 });
  },
  tower_destroy(v) {
    v.tone({ f: 70, f1: 25, gl: 1, a: 0.002, d: 1.2, v: 0.26 });
    v.noise({ ft: 'lowpass', f: 1600, f1: 100, gl: 1.4, a: 0.005, d: 1.4, v: 0.32 });
    v.noise({ ft: 'bandpass', f: 500, q: 0.8, a: 0.002, d: 0.4, v: 0.18 });
    v.debris(0.1, 1.2, 14, 0.09, 500, 2200);
    v.tone({ type: 'triangle', f: 150, f1: 60, gl: 0.3, a: 0.002, d: 0.35, v: 0.12 });
  },
  crystal_destroy(v) {
    v.tone({ f: 60, f1: 22, gl: 2.4, a: 0.002, d: 2.6, v: 0.26 });
    v.noise({ ft: 'lowpass', f: 2600, f1: 80, gl: 2.6, a: 0.004, d: 2.8, v: 0.3 });
    v.noise({ ft: 'bandpass', f: 700, q: 0.8, a: 0.002, d: 0.5, v: 0.18 });
    v.pings(0.02, 0.9, 26, 0.035, 1800, 7000);
    [1760, 1318.5, 880, 659.3].forEach((f, k) =>
      v.tone({ f, f1: f * 0.5, gl: 2.5, t: 0.05 + k * 0.05, a: 0.01, d: 2.5, v: 0.035 }),
    );
    v.debris(0.15, 2.1, 18, 0.07, 400, 2000);
    v.noise({ ft: 'highpass', f: 6000, a: 0.002, d: 1.2, v: 0.05 });
  },
  minion_spawn(v) {
    const lp = v.filt('lowpass', 500, 1, v.out, { f1: 1400, gl: 0.12 });
    for (const det of [-7, 6]) {
      v.tone({ type: 'sawtooth', f: 280, f1: 293.66, gl: 0.06, a: 0.06, h: 0.18, d: 0.22, v: 0.07, to: lp, det });
    }
    v.tone({ type: 'sawtooth', f: 430, f1: 440, gl: 0.06, a: 0.07, h: 0.15, d: 0.2, v: 0.035, to: lp });
  },
  minion_die(v) {
    v.tone({ f: 300, f1: 110, gl: 0.12, a: 0.001, d: 0.12, v: 0.16 });
    v.noise({ ft: 'bandpass', f: 900, q: 1, a: 0.001, d: 0.08, v: 0.11 });
  },
  hero_die(v) {
    v.tone({ f: 120, f1: 45, gl: 0.3, a: 0.002, d: 0.32, v: 0.26 });
    v.noise({ ft: 'lowpass', f: 900, f1: 200, gl: 0.35, a: 0.002, d: 0.35, v: 0.26 });
    v.tone({ type: 'triangle', f: 146.83, f1: 138.6, gl: 0.9, t: 0.08, a: 0.05, h: 0.3, d: 0.6, v: 0.12 });
    v.tone({ f: 220, f1: 207.6, gl: 0.9, t: 0.08, a: 0.05, h: 0.3, d: 0.6, v: 0.06 });
  },
  monster_roar(v) {
    const lp = v.filt('lowpass', 900, 3);
    const tr = v.trem(28, 0.35, 0, 0.85, lp);
    v.tone({ type: 'sawtooth', f: 105, fp: [[0.2, 160], [0.75, 85]], a: 0.08, h: 0.35, d: 0.35, v: 0.15, to: tr });
    v.tone({ type: 'sawtooth', f: 107, fp: [[0.2, 163], [0.75, 87]], a: 0.08, h: 0.35, d: 0.35, v: 0.11, to: tr });
    v.noise({ ft: 'bandpass', f: 600, f1: 400, q: 1.5, a: 0.08, h: 0.3, d: 0.35, v: 0.13 });
  },
  dragon_roar(v) {
    const lp = v.filt('lowpass', 500, 4, v.out, { fp: [[0.4, 1300], [1.75, 380]] });
    const tr = v.trem(22, 0.4, 0, 1.9, lp);
    const fp = [[0.35, 95], [1.15, 80], [1.75, 50]];
    v.tone({ type: 'sawtooth', f: 62, fp, a: 0.15, h: 0.9, d: 0.65, v: 0.16, to: tr });
    v.tone({ type: 'sawtooth', f: 63.3, fp: fp.map(([t, f]) => [t, f * 1.02]), a: 0.15, h: 0.9, d: 0.65, v: 0.13, to: tr });
    v.fm({ f: 80, r: 0.5, i: 3, i1: 1, a: 0.15, h: 0.8, d: 0.65, v: 0.08 });
    v.noise({ ft: 'bandpass', f: 420, f1: 300, q: 1, a: 0.12, h: 0.8, d: 0.65, v: 0.16 });
  },
  monster_die(v) {
    const lp = v.filt('lowpass', 700, 2);
    v.tone({ type: 'sawtooth', f: 140, f1: 50, gl: 0.6, a: 0.03, h: 0.15, d: 0.45, v: 0.14, to: lp });
    v.tone({ f: 95, f1: 35, gl: 0.3, t: 0.15, a: 0.002, d: 0.32, v: 0.24 });
    v.noise({ ft: 'lowpass', f: 700, f1: 150, t: 0.15, a: 0.002, d: 0.4, v: 0.2 });
  },

  /* ---------- 经济与成长 ---------- */
  gold(v) {
    v.tone({ f: 2637, a: 0.001, d: 0.07, v: 0.05 });
    v.tone({ f: 3951, t: 0.035, a: 0.001, d: 0.08, v: 0.035 });
  },
  level_up(v) {
    [74, 78, 81, 86].forEach((m, k) => {
      v.tone({ type: 'triangle', f: M(m), t: k * 0.06, a: 0.003, h: 0.05, d: 0.4, v: 0.1 });
      v.tone({ f: M(m + 12), t: k * 0.06, a: 0.003, d: 0.25, v: 0.03 });
    });
    v.fm({ f: 1174.7, r: 2, i: 0.8, i1: 0.1, t: 0.24, a: 0.01, d: 0.6, v: 0.06 });
    v.noise({ ft: 'highpass', f: 6500, t: 0.1, a: 0.12, d: 0.5, v: 0.04 });
  },
  recall_start(v) {
    const tr = v.trem(6, 0.3, 0, 1.1);
    v.tone({ f: 220, f1: 440, gl: 0.9, a: 0.3, h: 0.4, d: 0.3, v: 0.08, to: tr });
    v.tone({ f: 222, f1: 444, gl: 0.9, a: 0.3, h: 0.4, d: 0.3, v: 0.06, to: tr });
    v.tone({ type: 'triangle', f: 330, f1: 660, gl: 0.9, a: 0.3, h: 0.4, d: 0.3, v: 0.04, to: tr });
    v.noise({ ft: 'bandpass', f: 1000, f1: 3000, gl: 0.9, q: 5, a: 0.3, h: 0.3, d: 0.3, v: 0.04 });
  },
  recall_end(v) {
    v.noise({ ft: 'bandpass', f: 300, f1: 5000, q: 1.2, a: 0.15, d: 0.2, v: 0.22 });
    v.tone({ f: 300, f1: 1500, a: 0.1, d: 0.15, v: 0.08 });
    v.chime(2637, 0.22, 0.05, 0.35);
  },
  respawn(v) {
    [62, 69, 74, 78].forEach((m, k) => v.tone({ f: M(m), t: k * 0.05, a: 0.05, h: 0.1, d: 0.6, v: 0.065 }));
    v.noise({ ft: 'highpass', f: 4000, a: 0.2, d: 0.4, v: 0.04 });
    v.noise({ ft: 'bandpass', f: 400, f1: 2400, q: 1, a: 0.1, d: 0.25, v: 0.11 });
  },
  buy(v) {
    SFX.ui_buy(v);
    v.tone({ f: 2637, t: 0.13, a: 0.001, d: 0.07, v: 0.04 });
    v.tone({ f: 3136, t: 0.17, a: 0.001, d: 0.09, v: 0.035 });
  },

  /* ---------- 播报（纯音乐，无人声） ---------- */
  kill(v) {
    v.taiko(0, 0.8, 75);
    v.brass(M(69), 0, 0.08, 0.14);
    v.brass(M(74), 0.12, 0.25, 0.16);
    v.cymbal(0.12, 0.5, 0.5);
  },
  first_blood(v) {
    v.taiko(0, 0.9, 70);
    v.taiko(0.16, 0.7, 75);
    v.taiko(0.32, 1, 65);
    v.brass(M(69), 0, 0.1, 0.15);
    v.brass(M(74), 0.16, 0.1, 0.16);
    v.brass(M(81), 0.32, 0.55, 0.17);
    v.brass(M(62), 0.32, 0.55, 0.1);
    v.gong(0.32, 0.6, 98);
  },
  double_kill(v) {
    v.taiko(0, 0.8, 72);
    v.taiko(0.14, 0.8, 72);
    v.brass(M(74), 0, 0.08, 0.15);
    v.brass(M(74), 0.14, 0.08, 0.15);
    v.taiko(0.28, 1, 65);
    v.brass(M(78), 0.28, 0.5, 0.13);
    v.brass(M(81), 0.28, 0.5, 0.11);
    v.brass(M(62), 0.28, 0.5, 0.08);
    v.cymbal(0.28, 0.6, 0.8);
  },
  triple_kill(v) {
    [74, 78, 81].forEach((m, k) => {
      v.taiko(k * 0.13, 0.8, 72);
      v.brass(M(m), k * 0.13, 0.08, 0.15);
    });
    v.taiko(0.42, 1, 65);
    [62, 74, 81, 86].forEach((m, k) => v.brass(M(m), 0.42, 0.6, k ? 0.11 : 0.08));
    v.cymbal(0.42, 0.7, 1);
  },
  quadra_kill(v) {
    [69, 74, 76, 78].forEach((m, k) => {
      v.taiko(k * 0.11, 0.75 + k * 0.05, 72);
      v.brass(M(m), k * 0.11, 0.07, 0.15);
    });
    v.taiko(0.48, 1, 62);
    [57, 69, 74, 81, 86].forEach((m, k) => v.brass(M(m), 0.48, 0.8, k ? 0.1 : 0.08));
    v.gong(0.48, 0.6, 92);
    v.cymbal(0.48, 0.8, 1.2);
  },
  penta_kill(v) {
    [0, 0.15, 0.27, 0.37, 0.45, 0.52, 0.58, 0.63].forEach((t, k) => v.taiko(t, 0.5 + k * 0.06, 70));
    [74, 78, 81, 86].forEach((m, k) => v.brass(M(m), 0.1 + k * 0.1, 0.08, 0.13));
    v.taiko(0.7, 1, 60);
    [50, 62, 69, 74, 78, 81].forEach((m, k) => v.brass(M(m), 0.7, 1.2, k ? 0.085 : 0.07));
    v.gong(0.7, 0.9, 85);
    v.cymbal(0.7, 0.9, 1.6);
    [86, 88, 90, 93, 95, 98].forEach((m, k) => v.chime(M(m), 0.8 + k * 0.06, 0.035, 0.6));
  },
  legendary(v) {
    v.gong(0, 1, 82);
    v.taiko(0, 1, 60);
    [50, 57, 62].forEach((m) => v.brass(M(m), 0, 1.6, 0.11, 1200));
    v.gliss(62, 0, 12, 0.45, 0.45, 0.22);
    v.taiko(0.9, 0.9, 65);
    [74, 81, 86].forEach((m) => v.brass(M(m), 0.9, 1, 0.1));
    v.cymbal(0.9, 0.8, 1.5);
  },
  ally_killed(v) {
    const lp = v.filt('lowpass', 1400, 0.7);
    [[71, 0, 0.2], [69, 0.25, 0.2], [66, 0.5, 0.55]].forEach(([m, t, h]) => {
      v.tone({ type: 'triangle', f: M(m), t, a: 0.03, h, d: 0.4, v: 0.13, to: lp });
      v.tone({ f: M(m - 12), t, a: 0.03, h, d: 0.4, v: 0.05 });
    });
    v.tone({ type: 'triangle', f: M(47), a: 0.1, h: 0.6, d: 0.6, v: 0.08, to: lp });
    v.taiko(0, 0.5, 55);
  },
  enemy_tower_down(v) {
    v.taiko(0, 0.9, 70);
    v.taiko(0.18, 0.8, 70);
    v.brass(M(69), 0, 0.12, 0.14);
    v.brass(M(74), 0.18, 0.12, 0.15);
    v.taiko(0.36, 1, 62);
    [62, 74, 78, 81].forEach((m, k) => v.brass(M(m), 0.36, 0.7, k ? 0.1 : 0.08));
    v.cymbal(0.36, 0.7, 1.2);
  },
  tower_lost(v) {
    const lp = v.filt('lowpass', 1800, 0.7);
    for (let k = 0; k < 3; k++) {
      const t = k * 0.3;
      v.tone({ type: 'triangle', f: M(76), t, a: 0.01, h: 0.1, d: 0.05, v: 0.13 });
      v.tone({ type: 'sawtooth', f: M(76), t, a: 0.01, h: 0.1, d: 0.05, v: 0.05, to: lp });
      v.tone({ type: 'triangle', f: M(71), t: t + 0.15, a: 0.01, h: 0.1, d: 0.05, v: 0.13 });
      v.tone({ type: 'sawtooth', f: M(71), t: t + 0.15, a: 0.01, h: 0.1, d: 0.05, v: 0.05, to: lp });
    }
    v.taiko(0, 0.7, 55);
    v.taiko(0.6, 0.7, 55);
    v.brass(M(47), 0, 1.0, 0.08, 700);
  },
  victory(v) {
    v.taiko(0, 1, 65);
    v.cymbal(0, 0.8, 1.5);
    v.gong(0, 0.7, 98);
    [[62, 0, 0.12], [69, 0.18, 0.12], [74, 0.36, 0.3], [76, 0.72, 0.12], [78, 0.9, 0.12], [81, 1.08, 1.4]].forEach(([m, t, d]) =>
      v.brass(M(m), t, d, 0.15),
    );
    [0.36, 0.72, 0.9].forEach((t) => v.taiko(t, 0.7, 70));
    v.taiko(1.08, 1, 62);
    [50, 62, 69, 74, 78].forEach((m) => v.brass(M(m), 1.08, 1.5, 0.07, 1600));
    v.cymbal(1.08, 0.7, 1.8);
    [86, 90, 93, 98].forEach((m, k) => v.chime(M(m), 1.15 + k * 0.08, 0.04, 0.8));
  },
  defeat(v) {
    v.gong(0, 0.6, 73);
    [[66, 0, 0.45], [64, 0.6, 0.45], [62, 1.2, 0.45], [59, 1.8, 1.0]].forEach(([m, t, d]) =>
      v.brass(M(m), t, d, 0.13, 900),
    );
    [47, 54].forEach((m) => v.tone({ type: 'triangle', f: M(m), a: 0.4, h: 2, d: 0.8, v: 0.06 }));
    [0, 1.2, 1.8].forEach((t) => v.taiko(t, 0.5, 55));
  },
};

// 每个音效的总增益校准（离线渲染实测）：普通音效单声部峰值约 0.45 以内，
// 播报约 0.8 以内；同时按笔记本扬声器能放出的频段（>200Hz）拉平同类音效的响度
const TRIM = {
  ui_error: 0.64, ui_close: 0.87, game_start: 0.94,
  swing: 0.56, hit_melee: 0.6, hit_heavy: 0.53, arrow_shoot: 0.71, arrow_hit: 0.66, gun_shot: 0.71,
  magic_hit: 0.68, crit: 0.85,
  fireball: 0.73, explosion: 0.48, ice_cast: 1.21, ice_hit: 0.91, freeze: 0.83, dash: 0.92, blink: 1.27,
  stun: 0.89, slam: 0.63, bell: 0.75, chain: 1.5, whirl: 0.78, buff: 0.88, wind: 0.63, thunder: 0.83, meteor: 0.5,
  tower_hit: 0.73, tower_destroy: 0.45, crystal_destroy: 0.55, minion_spawn: 0.64, minion_die: 0.7,
  hero_die: 0.85, monster_roar: 0.93, monster_die: 0.86,
  recall_start: 0.53, recall_end: 0.73, respawn: 0.74,
  double_kill: 1.15, triple_kill: 1.1, quadra_kill: 0.94, penta_kill: 0.96, legendary: 0.93, enemy_tower_down: 1.09,
};

const SOUND_NAMES = Object.freeze([
  // 界面
  'ui_click', 'ui_hover', 'ui_buy', 'ui_sell', 'ui_error', 'ui_open', 'ui_close', 'skill_up', 'countdown', 'game_start',
  // 基础战斗
  'swing', 'hit_melee', 'hit_heavy', 'arrow_shoot', 'arrow_hit', 'gun_shot', 'magic_shoot', 'magic_hit', 'crit',
  // 技能
  'fireball', 'explosion', 'burn', 'ice_cast', 'ice_hit', 'freeze', 'heal', 'shield', 'dash', 'blink', 'stun',
  'knockup', 'slam', 'howl', 'bell', 'chain', 'whirl', 'buff', 'wind', 'thunder', 'meteor', 'root',
  // 建筑与单位
  'tower_shot', 'tower_hit', 'tower_destroy', 'crystal_destroy', 'minion_spawn', 'minion_die', 'hero_die',
  'monster_roar', 'dragon_roar', 'monster_die',
  // 经济与成长
  'gold', 'level_up', 'recall_start', 'recall_end', 'respawn', 'buy',
  // 播报
  'kill', 'first_blood', 'double_kill', 'triple_kill', 'quadra_kill', 'penta_kill', 'legendary',
  'ally_killed', 'enemy_tower_down', 'tower_lost', 'victory', 'defeat',
].filter((n) => typeof SFX[n] === 'function'));

/* ------------------------------------------------------------------ */
/* 音乐                                                                 */
/* ------------------------------------------------------------------ */

// 记谱：'音级:长度'（音级为五声音阶序号，0 = D4；长度单位 16 分音符；r 为休止）
function parseBars(bars) {
  const m = new Map();
  bars.forEach((str, b) => {
    let pos = 0;
    for (const tok of str.trim().split(/\s+/)) {
      const [a, l] = tok.split(':');
      const len = Number(l);
      if (a !== 'r') m.set(b * 16 + pos, { i: Number(a), l: len });
      pos += len;
    }
  });
  return m;
}
const listMel = (arr) => new Map(arr.map(([s, i, l]) => [s, { i, l }]));

const CHORDS = {
  D: { b: 50, pad: [62, 66, 69, 74] },
  B: { b: 47, pad: [59, 62, 66, 71] },
  E: { b: 52, pad: [64, 71, 74, 76] },
  A: { b: 45, pad: [57, 64, 69, 71] },
  Fm: { b: 54, pad: [66, 69, 76] },
};

// 主菜单：16 小节 A/B 两段（D 宫调）
const MENU_MEL = parseBars([
  '3:6 4:2 5:8', '6:4 5:2 4:2 3:8', '2:4 3:4 5:4 4:2 3:2', '1:12 r:4',
  '3:6 4:2 5:6 6:2', '8:8 7:4 6:4', '5:4 6:2 5:2 4:4 3:4', '5:12 r:4',
  '8:4 8:2 9:2 10:8', '9:4 8:4 7:4 8:4', '6:6 7:2 8:4 6:4', '5:12 r:4',
  '7:4 8:4 9:4 8:2 7:2', '6:4 5:4 4:4 3:4', '2:4 3:2 4:2 5:4 6:4', '5:12 r:4',
]);
const MENU_CH = ['D', 'A', 'B', 'E', 'D', 'B', 'A', 'D', 'D', 'B', 'E', 'D', 'B', 'A', 'E', 'D'];

// 对战：B 羽调，问句/答句各三种，按循环序号种子选择
const BAT_PROG = ['B', 'B', 'A', 'A', 'D', 'D', 'E', 'Fm', 'B', 'B', 'A', 'A', 'D', 'E', 'B', 'B'];
const BAT_Q = [
  ['4:4 r:2 5:2 6:8', 'r:4 7:2 6:2 5:4 4:4', '3:6 4:2 6:8', '3:12 r:4'],
  ['8:6 7:2 6:8', '5:4 6:4 4:8', 'r:8 3:4 4:4', '6:12 r:4'],
  ['r:4 4:2 4:2 5:4 7:4', '8:8 7:4 5:4', '6:6 5:2 4:4 3:4', '3:12 r:4'],
].map(parseBars);
const BAT_A = [
  ['5:6 6:2 7:8', '8:4 7:4 6:8', '7:4 6:4 4:4 5:4', '4:12 r:4'],
  ['9:8 8:4 7:4', '6:4 7:2 6:2 4:8', '2:4 3:4 4:4 6:4', '4:12 r:4'],
  ['r:4 7:4 8:4 9:4', '8:6 6:2 7:8', '5:4 4:4 3:4 2:4', '4:12 r:4'],
].map(parseBars);
const OSTINATO = new Map([[0, 0], [3, 2], [6, 1], [8, 0], [11, 2], [14, 1]]);

const VIC_MEL = listMel([[8, 3, 2], [10, 5, 2], [12, 7, 4], [16, 6, 2], [18, 7, 2], [20, 8, 8], [28, 7, 2], [30, 8, 2], [32, 9, 4], [36, 10, 16]]);
const DEF_MEL = listMel([[2, 4, 4], [6, 3, 2], [8, 2, 6], [14, 1, 2], [16, 2, 4], [20, 0, 4], [24, -1, 12]]);

const mPluck = (pl, t, midi, o) => pl.play(t, pl.bPluck, (x) => x.pluck(mtof(midi), o));
const mBass = (pl, t, midi, v) => pl.play(t, pl.bCenter, (x) => x.pluck(mtof(midi), { v, len: 0.7, kind: 'bass' }));
const mTaiko = (pl, t, v, f = 70) => pl.play(t, pl.bDrum, (x) => x.taiko(0, v, f));
const mKa = (pl, t, v) => pl.play(t, pl.bDrum, (x) => x.ka(0, v));
const mShaker = (pl, t, v) => pl.play(t, pl.bDrum, (x) => x.shaker(0, v));
const mCymbal = (pl, t, v) => pl.play(t, pl.bDrum, (x) => x.cymbal(0, v, 1.2));
const mGong = (pl, t, v, f = 98) => pl.play(t, pl.bDrum, (x) => x.gong(0, v, f));
const mPad = (pl, t, notes, dur, v) => pl.play(t, pl.bPad, (x) => x.pad(notes, 0, dur, v));
const mFlute = (pl, t, f, dur, v) => pl.play(t, pl.bFlute, (x) => x.flute(f, 0, dur, v));
const mBrass = (pl, t, f, dur, v) => pl.play(t, pl.bCenter, (x) => x.brass(f, 0, dur, v, 1800));
const mGliss = (pl, t, root, i0, i1, dur, v) => pl.play(t, pl.bPluck, (x) => x.gliss(root, i0, i1, 0, dur, v));

const TRACKS = {
  menu: {
    bpm: 80,
    level: 0.9,
    loop: true,
    fadeIn: 1.5,
    step(pl, s, t) {
      const sd = pl.sd;
      if (s < 16) {
        // 前奏一小节：锣 + 刮奏
        if (s === 0) {
          mGong(pl, t, 0.8);
          mTaiko(pl, t, 0.9);
          mCymbal(pl, t, 0.4);
          mPad(pl, t, CHORDS.D.pad, sd * 16 + 0.3, 0.9);
          mGliss(pl, t + 0.05, 62, -5, 10, 1.6, 0.22);
        }
        if (s === 8) mTaiko(pl, t, 0.5);
        if (s === 12 || s === 14) mTaiko(pl, t, s === 12 ? 0.35 : 0.5, 75);
        return;
      }
      const ls = s - 16;
      const pos = ls % 16;
      const bar = Math.floor(ls / 16) % 16;
      const cyc = Math.floor(ls / 256);
      const ch = CHORDS[MENU_CH[bar]];
      const B = bar >= 8;

      if (pos === 0) mPad(pl, t, ch.pad, sd * 16 + 0.25, B ? 1.1 : 0.9);

      const ev = MENU_MEL.get(bar * 16 + pos);
      if (ev) {
        const rnd = mulberry32(cyc * 1013 + bar * 16 + pos + 7)();
        const midi = pent(62, ev.i);
        const dur = ev.l * sd;
        const o = { v: 0.34, len: Math.max(dur * 1.6, 0.6) };
        if (ev.l >= 8) o.vib = 0.0045;
        if (cyc % 2 === 1 && ev.l >= 6 && rnd < 0.5) o.bend = -2; // 第二遍加上滑音
        mPluck(pl, t, midi, o);
        if ((B || cyc % 2 === 1) && ev.l >= 4) mFlute(pl, t, mtof(midi - 12), dur * 0.95, B ? 1 : 0.8);
      }

      // 左手分解和弦
      if (B) {
        if (pos % 2 === 0) {
          const k = pos / 2;
          mPluck(pl, t, ch.b + [0, 7, 12, 19, 24, 19, 12, 7][k], { v: k === 0 ? 0.2 : 0.12, len: 0.9 });
        }
      } else if (pos % 4 === 0) {
        mPluck(pl, t, ch.b + [0, 7, 12, 7][pos / 4], { v: pos === 0 ? 0.2 : 0.13, len: 1.4 });
      }

      // 鼓
      if (pos === 0) mTaiko(pl, t, 0.85);
      if (pos === 8) mTaiko(pl, t, 0.5);
      if (bar === 15 && pos >= 9) mTaiko(pl, t, 0.25 + (pos - 8) * 0.05, 78);
      else if (bar % 4 === 3 && (pos === 12 || pos === 14)) mTaiko(pl, t, pos === 12 ? 0.35 : 0.45, 75);
      if (B && (pos === 4 || pos === 12)) mKa(pl, t, 0.4);
      if (B && pos % 4 === 2) mShaker(pl, t, 0.6);
      if (pos === 0 && (bar === 0 || bar === 8)) mCymbal(pl, t, bar === 0 ? 0.6 : 0.45);
      if (pos === 0 && bar === 0) mGong(pl, t, 0.45);

      // 段落衔接刮奏
      if (bar === 7 && pos === 12) mGliss(pl, t, 62, 0, 8, 0.55, 0.2);
      if (bar === 15 && pos === 12) mGliss(pl, t, 62, 10, 3, 0.55, 0.17);
    },
  },

  battle: {
    bpm: 100,
    level: 0.6,
    loop: true,
    fadeIn: 1.5,
    step(pl, s, t) {
      const sd = pl.sd;
      const pos = s % 16;
      const barN = Math.floor(s / 16);
      const bar = barN % 16;
      const cyc = Math.floor(barN / 16);
      if (pl.cyc !== cyc) {
        // 每 16 小节用种子决定一次变化
        const r = mulberry32(cyc * 9301 + 49297);
        pl.cyc = cyc;
        pl.var = { q: Math.floor(r() * 3), a: Math.floor(r() * 3), gliss: r() < 0.5, dropShaker: r() < 0.35 };
      }
      const V = pl.var;
      const brk = cyc % 4 === 3 && bar < 8; // 间奏：鼓减弱，箫长音
      const ch = CHORDS[BAT_PROG[bar]];

      if (pos === 0) mPad(pl, t, ch.pad, sd * 16 + 0.3, brk ? 1.1 : 0.75);

      if (!brk || bar >= 4) {
        if (pos === 0) mBass(pl, t, ch.b, 0.3);
        else if (pos === 6) mBass(pl, t, ch.b, 0.2);
        else if (pos === 10) mBass(pl, t, ch.b + 12, 0.15);
        else if (pos === 14) mBass(pl, t, ch.b + 7, 0.13);
      }

      const fill = bar === 15 && pos >= 8;
      if (pos === 0) mTaiko(pl, t, 0.6, 72);
      if (!brk && !fill) {
        if (pos === 6) mTaiko(pl, t, 0.35, 72);
        if (pos === 10) mTaiko(pl, t, 0.42, 72);
      }
      if (!brk) {
        if (pos === 4 || pos === 12) mKa(pl, t, 0.28);
        if (pos % 4 === 2 && !(V.dropShaker && bar >= 4 && bar < 8)) mShaker(pl, t, 0.45);
      }
      if (fill && pos % 2 === 0) mTaiko(pl, t, 0.25 + (pos - 8) * 0.04, 80);
      if (pos === 0 && bar === 0) mCymbal(pl, t, 0.35);

      if (bar < 8 && !brk && OSTINATO.has(pos)) mPluck(pl, t, ch.pad[OSTINATO.get(pos)], { v: 0.1, len: 0.5 });
      if (brk && pos === 0 && bar % 2 === 0) mFlute(pl, t, mtof(ch.pad[2]), sd * 30, 0.7);

      if (bar >= 8) {
        const ph = bar < 12 ? BAT_Q[V.q] : BAT_A[V.a];
        const ev = ph.get(((bar - 8) % 4) * 16 + pos);
        if (ev) {
          const midi = pent(62, ev.i);
          const dur = ev.l * sd;
          if (cyc % 2 === 1) mFlute(pl, t, mtof(midi), dur * 0.95, 0.85);
          else mPluck(pl, t, midi, { v: 0.24, len: Math.max(0.5, dur * 1.5), vib: ev.l >= 8 ? 0.004 : 0 });
        }
      }
      if (V.gliss && bar === 7 && pos === 12) mGliss(pl, t, 62, -1, 9, 0.6, 0.12);
    },
  },

  victory: {
    bpm: 96,
    level: 1,
    loop: false,
    len: 52,
    fadeIn: 0.05,
    step(pl, s, t) {
      const sd = pl.sd;
      if (s === 0) {
        mGong(pl, t, 0.9);
        mTaiko(pl, t, 1);
        mCymbal(pl, t, 0.7);
        mPad(pl, t, [50, 57, 62, 66, 69], sd * 36, 1.2);
        mGliss(pl, t, 62, -5, 10, 1, 0.22);
      }
      const m = VIC_MEL.get(s);
      if (m) {
        const midi = pent(62, m.i);
        mPluck(pl, t, midi, { v: 0.36, len: Math.max(0.6, m.l * sd * 1.5), vib: m.l >= 8 ? 0.004 : 0 });
        mBrass(pl, t, mtof(midi), m.l * sd, 0.05);
      }
      if (s === 8) mTaiko(pl, t, 0.5);
      if (s === 12 || s === 20 || s === 32) mTaiko(pl, t, 0.75);
      if (s === 34) mTaiko(pl, t, 0.5, 78);
      if (s === 36) {
        mTaiko(pl, t, 1);
        mCymbal(pl, t, 0.8);
        mGong(pl, t, 0.6);
        mPad(pl, t, [62, 66, 69, 74, 78], sd * 14, 1.2);
      }
    },
  },

  defeat: {
    bpm: 72,
    level: 1,
    loop: false,
    len: 40,
    fadeIn: 0.05,
    step(pl, s, t) {
      const sd = pl.sd;
      if (s === 0) {
        mGong(pl, t, 0.55, 73);
        mTaiko(pl, t, 0.6, 55);
        mPad(pl, t, [47, 54, 59, 62], sd * 34, 1.1);
      }
      const m = DEF_MEL.get(s);
      if (m) {
        const midi = pent(62, m.i);
        const last = s === 24;
        mPluck(pl, t, midi, { v: 0.3, len: m.l * sd * 1.6, vib: !last && m.l >= 4 ? 0.004 : 0, bendEnd: last ? -1 : 0 });
        if (s >= 8) mFlute(pl, t, mtof(midi), m.l * sd, 0.7);
      }
      if (s === 8 || s === 16) mTaiko(pl, t, 0.4, 55);
      if (s === 24) {
        mTaiko(pl, t, 0.5, 52);
        mGong(pl, t, 0.35, 65);
      }
    },
  },
};
const MUSIC_TRACKS = Object.freeze(Object.keys(TRACKS));

class MusicPlayer {
  constructor(eng, name) {
    const c = eng.ctx;
    const def = TRACKS[name];
    this.e = eng;
    this.c = c;
    this.name = name;
    this.def = def;
    this.sd = 60 / def.bpm / 4;
    this.step = 0;
    this.next = c.currentTime + 0.08;
    this.nodes = [];
    this.dead = false;
    this.finished = false;
    this.timer = 0;
    this.cyc = -1;
    this.var = null;

    this.out = this._g(0, eng.musicBus);
    this.bCenter = this._g(1, this.out);
    this.bDrum = this._g(0.9, this.out);
    this.bPluck = this._panned(-0.15);
    this.bFlute = this._panned(0.2);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;
    lp.Q.value = 0.3;
    lp.connect(this.out);
    this.nodes.push(lp);
    this.bPad = lp;

    const g = this.out.gain;
    const now = c.currentTime;
    g.setValueAtTime(0, now);
    g.linearRampToValueAtTime(def.level, now + Math.max(def.fadeIn, 0.01));

    if (typeof setInterval === 'function') this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  }

  _g(v, to) {
    const g = this.c.createGain();
    g.gain.value = v;
    g.connect(to);
    this.nodes.push(g);
    return g;
  }

  _panned(p) {
    const g = this._g(1, this.out);
    if (typeof this.c.createStereoPanner === 'function') {
      g.disconnect();
      const pn = this.c.createStereoPanner();
      pn.pan.value = p;
      g.connect(pn);
      pn.connect(this.out);
      this.nodes.push(pn);
    }
    return g;
  }

  play(t, bus, fn) {
    const v = new Voice(this.e, t, 1, bus);
    try {
      fn(v);
    } finally {
      v.arm();
    }
  }

  tick() {
    try {
      if (this.finished || !this.e.ready) return;
      const now = this.c.currentTime;
      const hidden = typeof document !== 'undefined' && document && document.hidden;
      this.scheduleUntil(now + (hidden ? 1.5 : 0.12));
    } catch (e) {
      this.e._err(e);
    }
  }

  scheduleUntil(until) {
    const now = this.c.currentTime;
    if (this.next < now - 0.2) {
      // 计时器被节流时跳过已过去的拍子，保持节拍网格
      const skip = Math.ceil((now - this.next) / this.sd);
      this.next += skip * this.sd;
      this.step += skip;
    }
    while (this.next < until) {
      if (!this.def.loop && this.step >= this.def.len) {
        this.finish();
        return;
      }
      try {
        this.def.step(this, this.step, this.next);
      } catch (e) {
        this.e._err(e);
      }
      this.next += this.sd;
      this.step++;
    }
  }

  // 单次曲目播完：停止调度，等尾音结束后回收
  finish() {
    if (this.finished) return;
    this.finished = true;
    this._stopTimer();
    if (typeof setTimeout === 'function') setTimeout(() => this.dispose(), 6000);
  }

  _stopTimer() {
    if (this.timer && typeof clearInterval === 'function') clearInterval(this.timer);
    this.timer = 0;
  }

  fadeOut(sec = 1.5) {
    if (this.dead) return;
    this.dead = true;
    const g = this.out.gain;
    const now = this.c.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + sec);
    if (typeof setTimeout === 'function') {
      setTimeout(() => this._stopTimer(), sec * 1000 + 100);
      setTimeout(() => this.dispose(), sec * 1000 + 4000);
    } else this._stopTimer();
  }

  dispose() {
    this._stopTimer();
    this.finished = true;
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch (e) {
        /* 已断开 */
      }
    }
    this.nodes.length = 0;
  }
}

/* ------------------------------------------------------------------ */
/* 引擎                                                                 */
/* ------------------------------------------------------------------ */
export class AudioEngine {
  constructor() {
    // 注意：这里不创建 AudioContext（浏览器要求用户手势后才能出声）
    this.ctx = null;
    this._vol = { master: 0.8, music: 0.6, sfx: 0.9 };
    this._last = new Map();
    this._alive = [];
    this._track = null;
    this._player = null;
    this._ksCache = new Map();
    this._offline = false;
    this._primed = false;
    this.noiseBuf = null;
    this.errors = 0;
    this.lastError = null;
  }

  static get SOUND_NAMES() {
    return SOUND_NAMES.slice();
  }

  static get MUSIC_TRACKS() {
    return MUSIC_TRACKS.slice();
  }

  get ready() {
    try {
      if (!this.ctx) return false;
      return this._offline || this.ctx.state === 'running';
    } catch (e) {
      return false;
    }
  }

  // 当前存活的音效声部数（调试用）
  get activeVoices() {
    try {
      this._prune();
      return this._alive.length;
    } catch (e) {
      return 0;
    }
  }

  get musicTrack() {
    return this._track;
  }

  getVolumes() {
    return { ...this._vol };
  }

  unlock() {
    try {
      if (!this.ctx && !this._init()) return Promise.resolve(false);
      const c = this.ctx;
      if (!this._primed) {
        // iOS：手势内播放一个静音缓冲以解锁
        this._primed = true;
        try {
          const s = c.createBufferSource();
          s.buffer = c.createBuffer(1, 1, c.sampleRate);
          s.connect(c.destination);
          s.onended = () => {
            try {
              s.disconnect();
            } catch (e) {
              /* 忽略 */
            }
          };
          s.start(0);
        } catch (e) {
          /* 忽略 */
        }
      }
      let p = null;
      if (c.state !== 'running' && typeof c.resume === 'function') p = c.resume();
      return Promise.resolve(p).then(
        () => {
          this._onState();
          return this.ready;
        },
        (e) => {
          this._err(e);
          return false;
        },
      );
    } catch (e) {
      this._err(e);
      return Promise.resolve(false);
    }
  }

  setVolumes(v = {}) {
    try {
      if (!v || typeof v !== 'object') return;
      for (const k of ['master', 'music', 'sfx']) {
        if (typeof v[k] === 'number' && Number.isFinite(v[k])) this._vol[k] = clamp(v[k], 0, 1);
      }
      this._applyVol(false);
    } catch (e) {
      this._err(e);
    }
  }

  /** 播放音效；成功发声返回 true */
  play(name, opts = {}) {
    try {
      if (!this.ready) return false;
      const fn = SFX[name];
      if (typeof fn !== 'function' || !Object.prototype.hasOwnProperty.call(SFX, name)) return false;
      const o = opts && typeof opts === 'object' ? opts : {};
      const vol = clamp(num(o.volume, 1), 0, 2);
      if (vol < 0.01) return false;
      const pan = clamp(num(o.pan, 0), -1, 1);
      let pitch = clamp(num(o.pitch, 1), 0.25, 4);

      const ms = nowMs();
      const last = this._last.get(name);
      if (last !== undefined && ms - last < MIN_GAP_MS) return false;
      const isAnn = ANNOUNCER.has(name);
      this._prune();
      if (!isAnn && this._alive.length >= MAX_VOICES) return false;
      this._last.set(name, ms);
      if (VARY.has(name)) pitch *= 1 + (Math.random() - 0.5) * 0.08;

      const c = this.ctx;
      const now = c.currentTime;
      const vg = c.createGain();
      vg.gain.value = vol * (TRIM[name] || 1);
      const extra = [vg];
      if (pan !== 0 && typeof c.createStereoPanner === 'function') {
        const pn = c.createStereoPanner();
        pn.pan.value = pan;
        vg.connect(pn);
        pn.connect(this.sfxBus);
        extra.push(pn);
      } else vg.connect(this.sfxBus);
      if (this.sfxRev && REVERB_SENDS.has(name)) {
        const sg = c.createGain();
        sg.gain.value = 0.3;
        vg.connect(sg);
        sg.connect(this.sfxRev);
        extra.push(sg);
      }
      const voice = new Voice(this, now + 0.01, pitch, vg);
      voice.nodes.push(...extra);
      try {
        fn(voice);
      } catch (e) {
        voice.free();
        throw e;
      }
      voice.arm();
      this._alive.push(voice.end);
      if (DUCKERS.has(name)) this._duck(voice.end - now);
      return true;
    } catch (e) {
      this._err(e);
      return false;
    }
  }

  /** 按世界坐标播放：8 单位内满音量，45 单位线性衰减到无声，pan = dx/30 */
  playAt(name, x, y, listenerX, listenerY, opts = {}) {
    try {
      const dx = num(x, 0) - num(listenerX, 0);
      const dy = num(y, 0) - num(listenerY, 0);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (!(d < 45)) return false;
      const att = d <= 8 ? 1 : 1 - (d - 8) / 37;
      const o = opts && typeof opts === 'object' ? opts : {};
      return this.play(name, { ...o, volume: num(o.volume, 1) * att, pan: clamp(dx / 30, -1, 1) });
    } catch (e) {
      this._err(e);
      return false;
    }
  }

  playMusic(track) {
    try {
      const t = track == null ? null : String(track);
      if (t !== null && !Object.prototype.hasOwnProperty.call(TRACKS, t)) return;
      if (t === this._track) return;
      this._track = t;
      this._switchMusic();
    } catch (e) {
      this._err(e);
    }
  }

  /* ---------------- 内部 ---------------- */

  _err(e) {
    this.errors++;
    this.lastError = e;
  }

  _prune() {
    if (!this.ctx) {
      this._alive.length = 0;
      return;
    }
    const now = this.ctx.currentTime;
    const a = this._alive;
    let n = 0;
    for (let i = 0; i < a.length; i++) if (a[i] > now) a[n++] = a[i];
    a.length = n;
  }

  _init() {
    const g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {};
    const AC = g.AudioContext || g.webkitAudioContext;
    if (typeof AC !== 'function') return false;
    let c;
    try {
      c = new AC({ latencyHint: 'interactive' });
    } catch (e) {
      c = new AC();
    }
    return this._initWith(c, false);
  }

  // 也供测试用：传入 OfflineAudioContext 并设 offline=true 可离线渲染
  _initWith(c, offline = false) {
    try {
      this.ctx = c;
      this._offline = !!offline;
      const sr = c.sampleRate;

      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -16;
      this.comp.knee.value = 10;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.003;
      this.comp.release.value = 0.25;
      this.comp.connect(c.destination);

      this.master = c.createGain();
      this.master.connect(this.comp);
      this.sfxBus = c.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = c.createGain();
      this.duckGain = c.createGain();
      this.musicBus.connect(this.duckGain);
      this.duckGain.connect(this.master);

      // 共享白噪声（2 秒）
      const nb = c.createBuffer(1, Math.floor(sr * 2), sr);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.noiseBuf = nb;

      // 合成混响
      this.verb = null;
      this.sfxRev = null;
      try {
        const verb = c.createConvolver();
        verb.buffer = this._makeIR(2.4);
        verb.connect(this.master);
        const mr = c.createGain();
        mr.gain.value = 0.3;
        this.duckGain.connect(mr);
        mr.connect(verb);
        const sr2 = c.createGain();
        sr2.connect(verb);
        this.verb = verb;
        this.musicRev = mr;
        this.sfxRev = sr2;
      } catch (e) {
        this._err(e);
      }

      this._applyVol(true);
      const onState = () => this._onState();
      if (typeof c.addEventListener === 'function') c.addEventListener('statechange', onState);
      else c.onstatechange = onState;
      return true;
    } catch (e) {
      this._err(e);
      this.ctx = null;
      return false;
    }
  }

  _makeIR(sec) {
    const c = this.ctx;
    const sr = c.sampleRate;
    const len = Math.floor(sr * sec);
    const pre = Math.floor(sr * 0.012);
    const buf = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      const rnd = mulberry32(1234 + ch * 777);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const x = (i - pre) / (len - pre);
        const k = 0.7 - 0.55 * x; // 越往后越暗
        lp += (rnd() * 2 - 1 - lp) * k;
        d[i] = lp * Math.pow(1 - x, 2) * Math.exp(-3 * x);
      }
    }
    return buf;
  }

  _applyVol(instant) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const curve = (x) => x * x; // 听感更线性
    const set = (p, x) => {
      if (instant) p.value = x;
      else {
        p.cancelScheduledValues(now);
        p.setTargetAtTime(x, now, 0.06);
      }
    };
    set(this.master.gain, curve(this._vol.master));
    set(this.musicBus.gain, curve(this._vol.music) * MUSIC_TRIM);
    set(this.sfxBus.gain, curve(this._vol.sfx));
    if (this.sfxRev) set(this.sfxRev.gain, curve(this._vol.sfx));
  }

  _duck(sec) {
    const g = this.duckGain.gain;
    const now = this.ctx.currentTime;
    const hold = Math.max(0.2, sec * 0.7);
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.5, now + 0.08);
    g.setValueAtTime(0.5, now + hold);
    g.linearRampToValueAtTime(1, now + hold + 0.8);
  }

  _onState() {
    try {
      if (!this.ready) return;
      const cur = this._player && !this._player.dead ? this._player.name : null;
      if (cur !== this._track) this._switchMusic();
    } catch (e) {
      this._err(e);
    }
  }

  _switchMusic() {
    if (!this.ready) return; // 解锁后由 _onState 补上
    if (this._player) {
      this._player.fadeOut(1.5);
      this._player = null;
    }
    if (this._track) this._player = new MusicPlayer(this, this._track);
  }

  // Karplus–Strong 拨弦缓冲（按周期长度缓存）
  _ks(freq, kind = 'zheng') {
    const k = KS_KINDS[kind] || KS_KINDS.zheng;
    const c = this.ctx;
    const sr = c.sampleRate;
    const N = Math.max(8, Math.round(sr / freq - 0.5));
    const key = kind + ':' + N;
    const hit = this._ksCache.get(key);
    if (hit) return hit;

    const f0 = sr / (N + 0.5);
    const len = Math.floor(sr * k.len);
    const buf = c.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const line = new Float32Array(N);
    const rnd = mulberry32(N * 7919 + (kind === 'bass' ? 17 : 3));
    let lp = 0;
    for (let i = 0; i < N; i++) {
      lp += (rnd() * 2 - 1 - lp) * k.bright;
      line[i] = lp;
    }
    // 拨弦位置梳状滤波 + 去直流
    const ex = Float32Array.from(line);
    const pk = Math.max(1, Math.round(N * k.pick));
    let mean = 0;
    for (let i = 0; i < N; i++) {
      line[i] = ex[i] - ex[(i + pk) % N];
      mean += line[i];
    }
    mean /= N;
    for (let i = 0; i < N; i++) line[i] -= mean;

    const per = Math.pow(0.001, 1 / (k.sus * f0));
    const g = Math.min(0.99985, per / Math.max(Math.cos((Math.PI * f0) / sr), 0.5));
    let idx = 0;
    let prev = 0;
    let peak = 1e-9;
    for (let n = 0; n < len; n++) {
      const old = line[idx];
      const y = g * 0.5 * (old + prev);
      prev = old;
      line[idx] = y;
      out[n] = y;
      if (++idx === N) idx = 0;
      const a = y < 0 ? -y : y;
      if (a > peak) peak = a;
    }
    const sc = 0.9 / peak;
    const fade = Math.floor(sr * 0.04);
    for (let n = 0; n < len; n++) {
      const tail = len - n;
      out[n] *= tail < fade ? (sc * tail) / fade : sc;
    }

    const res = { buf, f0 };
    if (this._ksCache.size >= 64) this._ksCache.delete(this._ksCache.keys().next().value);
    this._ksCache.set(key, res);
    return res;
  }
}

export const audio = new AudioEngine();
export default audio;
