// 特效：飞行物、地面区域、瞬时特效（事件驱动）、持续状态（眩晕星、冰块、护盾…）、镜头震动
import * as THREE from 'three';
import { Particles } from './particles.js';
import { canvasTexture, makeDotCanvas, makeRingCanvas } from './textures.js';

const TEAMC = { 0: '#c49bff', 1: '#58b0ff', 2: '#ff5c4d' };
const easeOut = (k) => 1 - (1 - k) * (1 - k);

// —— 共用几何体 ——
const G = (() => {
  const ring = new THREE.RingGeometry(0.88, 1, 56, 1); ring.rotateX(-Math.PI / 2);
  const thinRing = new THREE.RingGeometry(0.95, 1, 56, 1); thinRing.rotateX(-Math.PI / 2);
  const disc = new THREE.CircleGeometry(1, 48); disc.rotateX(-Math.PI / 2);
  const arc = new THREE.RingGeometry(0.55, 1, 24, 1, -Math.PI / 3, (Math.PI * 2) / 3); arc.rotateX(-Math.PI / 2);
  const bigArc = new THREE.RingGeometry(0.35, 1, 32, 1, -Math.PI * 0.45, Math.PI * 0.9); bigArc.rotateX(-Math.PI / 2);
  const tube = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true); tube.translate(0, 0.5, 0);
  const cone = new THREE.ConeGeometry(1, 1, 6); cone.translate(0, 0.5, 0);
  const sphere = new THREE.SphereGeometry(1, 16, 10);
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const oct = new THREE.OctahedronGeometry(1, 0);
  const dodec = new THREE.DodecahedronGeometry(1, 0);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const torus = new THREE.TorusGeometry(1, 0.12, 6, 24); torus.rotateX(Math.PI / 2);
  // 箭：沿 +X
  const shaft = new THREE.CylinderGeometry(0.04, 0.04, 1.3, 5); shaft.rotateZ(Math.PI / 2);
  const head = new THREE.ConeGeometry(0.12, 0.35, 5); head.rotateZ(-Math.PI / 2); head.translate(0.8, 0, 0);
  const lance = new THREE.ConeGeometry(0.22, 1.8, 6); lance.rotateZ(-Math.PI / 2);
  const bullet = new THREE.CapsuleGeometry(0.07, 0.4, 2, 6); bullet.rotateZ(Math.PI / 2);
  // 手里剑（四角星，平放）
  const starShape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 0.16 : 0.55, a = (i / 8) * Math.PI * 2;
    i ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const star = new THREE.ExtrudeGeometry(starShape, { depth: 0.06, bevelEnabled: false }); star.rotateX(-Math.PI / 2);
  const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
  return { ring, thinRing, disc, arc, bigArc, tube, cone, sphere, ico, oct, dodec, box, torus, shaft, head, lance, bullet, star, plane };
})();

function glowMat(color, opacity = 1, extra = {}) {
  return new THREE.MeshBasicMaterial(Object.assign({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }, extra));
}
function solidMat(color, extra = {}) {
  return new THREE.MeshLambertMaterial(Object.assign({ color, flatShading: true }, extra));
}
function disposeTree(obj) {
  if (!obj) return;
  obj.traverse((o) => {
    if (o.material && !o.material.userData.shared) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose()); else o.material.dispose();
    }
  });
}

export class FX {
  /**
   * opts: { quality, getUnitView(id) → { pos: Vector3, height, root } | null, isVisible(x, y, team) → bool, playerTeam }
   */
  constructor(scene, opts) {
    this.scene = scene;
    this.opts = opts;
    this.group = new THREE.Group();
    this.group.name = 'fx';
    scene.add(this.group);
    this.particles = new Particles(this.group, opts.quality);
    this.dotTex = canvasTexture(makeDotCanvas(64), { srgb: false });
    this.ringTex = canvasTexture(makeRingCanvas(256), { srgb: false });
    this.live = [];
    this.projViews = new Map();
    this.areaViews = new Map();
    this.buffViews = new Map();
    this.shakeAmt = 0;
    this.time = 0;
    this.world = null;
  }

  setWorld(world) {
    this.clear();
    this.world = world;
  }

  clear() {
    for (const l of this.live) { this.group.remove(l.obj); disposeTree(l.obj); }
    this.live.length = 0;
    for (const v of this.projViews.values()) { this.group.remove(v.obj); disposeTree(v.obj); }
    this.projViews.clear();
    for (const v of this.areaViews.values()) { this.group.remove(v.obj); disposeTree(v.obj); }
    this.areaViews.clear();
    for (const v of this.buffViews.values()) for (const o of Object.values(v.objs)) { this.group.remove(o); disposeTree(o); }
    this.buffViews.clear();
    this.particles.clear();
  }

  // —— 通用：生成一个会自动消失的物体 ——
  spawn(obj, dur, fn) {
    this.group.add(obj);
    const l = { obj, t: 0, dur, fn };
    this.live.push(l);
    if (fn) fn(0, obj, 0, l);
    return l;
  }

  sprite(color, size, opacity = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dotTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.set(size, size, 1);
    return s;
  }

  ring(x, y, r0, r1, color, dur = 0.5, o = {}) {
    const m = new THREE.Mesh(o.thin ? G.thinRing : G.ring, glowMat(color, o.alpha ?? 0.9));
    m.position.set(x, o.h ?? 0.14, y);
    m.renderOrder = 4;
    return this.spawn(m, dur, (k) => {
      const r = r0 + (r1 - r0) * easeOut(k);
      m.scale.set(r, 1, r);
      m.material.opacity = (o.alpha ?? 0.9) * (1 - k);
    });
  }

  disc(x, y, r, color, dur = 0.4, o = {}) {
    const m = new THREE.Mesh(G.disc, glowMat(color, o.alpha ?? 0.5));
    m.position.set(x, o.h ?? 0.12, y);
    m.renderOrder = 3;
    return this.spawn(m, dur, (k) => {
      const s = o.grow ? r * (0.3 + 0.7 * easeOut(k)) : r;
      m.scale.set(s, 1, s);
      m.material.opacity = (o.alpha ?? 0.5) * (1 - k);
    });
  }

  flashSphere(x, h, y, r, color, dur = 0.3, alpha = 0.8) {
    const m = new THREE.Mesh(G.sphere, glowMat(color, alpha));
    m.position.set(x, h, y);
    return this.spawn(m, dur, (k) => {
      const s = r * (0.4 + 0.6 * easeOut(k));
      m.scale.set(s, s * 0.8, s);
      m.material.opacity = alpha * (1 - k) * (1 - k);
    });
  }

  pillar(x, y, r, height, color, dur = 0.8, alpha = 0.6) {
    const m = new THREE.Mesh(G.tube, glowMat(color, alpha));
    m.position.set(x, 0, y);
    return this.spawn(m, dur, (k) => {
      m.scale.set(r * (1 - k * 0.4), height * (0.3 + 0.7 * easeOut(Math.min(1, k * 2.5))), r * (1 - k * 0.4));
      m.material.opacity = alpha * (1 - k);
    });
  }

  slash(x, y, angle, r, color, dur = 0.22, big = false) {
    const m = new THREE.Mesh(big ? G.bigArc : G.arc, glowMat(color, 0.95));
    m.position.set(x, 1.0, y);
    m.rotation.y = -angle;
    m.renderOrder = 6;
    return this.spawn(m, dur, (k) => {
      const s = r * (0.7 + 0.3 * easeOut(k));
      m.scale.set(s, 1, s);
      m.rotation.y = -angle + (k - 0.5) * 0.9;
      m.material.opacity = 0.95 * (1 - k);
    });
  }

  shake(amount, x, y) {
    const v = this.opts.camTarget && this.opts.camTarget();
    if (v && x !== undefined) {
      const d = Math.hypot(v.x - x, v.z - y);
      amount *= Math.max(0, 1 - d / 35);
    }
    this.shakeAmt = Math.min(1.2, Math.max(this.shakeAmt, amount));
  }

  // 粒子快捷方法
  burst(o) { this.particles.burst(o); }

  // ================= 事件 =================
  handleEvents(events) {
    const w = this.world;
    for (const ev of events) {
      const x = ev.x, y = ev.y;
      const vis = x === undefined || this.opts.isVisible(x, y);
      switch (ev.type) {
        case 'hit': if (vis) this.onHit(ev); break;
        case 'attack': if (vis) this.onAttack(ev); break;
        case 'projHit': if (vis) this.onProjHit(ev); break;
        case 'heal':
          if (vis) this.burst({ x, y, h: 0.6, count: 8, color: '#7dffa0', color2: '#2bd96b', speed: 1.5, up: 0.9, life: 0.9, size: 0.45, radius: 0.6, drag: 0.5 });
          break;
        case 'cc': if (vis) this.onCC(ev); break;
        case 'dash': if (vis || this.opts.isVisible(ev.x2, ev.y2)) this.onDash(ev); break;
        case 'fx': if (vis || (ev.x2 !== undefined && this.opts.isVisible(ev.x2, ev.y2))) this.onFx(ev); break;
        case 'death': if (vis) this.onDeath(ev); break;
        case 'levelUp': {
          if (!vis) break;
          this.ring(x, y, 0.4, 2.2, '#ffd75e', 0.7);
          this.pillar(x, y, 1.0, 3.5, '#ffd75e', 0.9, 0.45);
          this.burst({ x, y, h: 0.2, count: 18, color: '#fff2a8', color2: '#ffb400', speed: 2.5, up: 0.85, life: 1.0, size: 0.4, radius: 0.9, drag: 0.8 });
          break;
        }
        case 'respawn':
          this.pillar(x, y, 1.3, 6, TEAMC[w.unitById(ev.hero)?.team || 1], 1.0, 0.6);
          this.ring(x, y, 0.5, 3, '#ffffff', 0.6);
          break;
        case 'recallEnd':
          this.pillar(x, y, 1.2, 5, '#9fd8ff', 0.8, 0.6);
          if (this.opts.isVisible(ev.fromX, ev.fromY)) {
            this.pillar(ev.fromX, ev.fromY, 1.2, 5, '#9fd8ff', 0.6, 0.7);
            this.burst({ x: ev.fromX, y: ev.fromY, h: 0.5, count: 24, color: '#bfe6ff', speed: 4, up: 0.8, life: 0.7, size: 0.5, radius: 0.8 });
          }
          break;
        case 'cast': if (vis) this.onCast(ev); break;
        case 'castStart': {
          if (!vis) break;
          const h = w.unitById(ev.hero);
          if (h && h.def) this.burst({ x: h.x, y: h.y, h: 1.2, count: 10, color: h.def.colors.accent, speed: 1.2, up: 0.3, life: 0.5, size: 0.5, radius: 0.8, drag: 2 });
          break;
        }
        case 'spell': break;
        default: break;
      }
    }
  }

  onAttack(ev) {
    const w = this.world;
    const s = w.unitById(ev.src);
    if (!s || !s.ranged) return;
    const t = w.unitById(ev.target);
    const a = t ? Math.atan2(t.y - s.y, t.x - s.x) : 0;
    const style = s.projStyle;
    const c = style === 'tower' || style === 'fountain' ? TEAMC[s.team] : projColor(style, s);
    if (s.kind === 'tower') {
      this.flashSphere(s.x, s.isStructure && s.tier === 'crystal' ? 5 : 6.2, s.y, 1.2, c, 0.25, 0.7);
    } else if (style === 'bullet') {
      this.burst({ x: s.x + Math.cos(a) * 0.9, y: s.y + Math.sin(a) * 0.9, h: 1.2, count: 5, color: '#fff2a0', color2: '#ff9a2e', speed: 4, dir: { x: Math.cos(a), y: Math.sin(a) }, spread: 0.5, up: 0.05, life: 0.15, size: 0.45 });
    }
  }

  onHit(ev) {
    const w = this.world;
    const s = w.unitById(ev.src);
    const t = w.unitById(ev.target);
    const tv = t && this.opts.getUnitView(t.id);
    const h = tv ? tv.height * 0.55 : 1;
    const crit = ev.crit;
    if (s && !s.ranged) {
      const a = Math.atan2(ev.y - s.y, ev.x - s.x);
      const col = s.kind === 'hero' ? (crit ? '#ffef6b' : s.def.colors.accent) : s.kind === 'monster' ? '#ffcf9e' : TEAMC[s.team];
      const r = s.kind === 'hero' ? 2.2 : s.kind === 'monster' && s.boss ? 4 : 1.4;
      if (s.kind === 'hero' || s.boss || s.kind === 'monster') this.slash(s.x + Math.cos(a) * 0.6, s.y + Math.sin(a) * 0.6, a, r * (crit ? 1.3 : 1), col, crit ? 0.3 : 0.2, crit);
      this.burst({ x: ev.x, y: ev.y, h, count: crit ? 14 : 6, color: crit ? '#fff6b0' : '#ffffff', color2: col, speed: crit ? 6 : 4, up: 0.3, dir: { x: Math.cos(a), y: Math.sin(a) }, spread: 1.6, life: 0.3, size: crit ? 0.55 : 0.4, drag: 3 });
      return;
    }
    this.impact(ev.style, ev.x, ev.y, h, crit, s);
  }

  impact(style, x, y, h = 1, crit = false, s = null) {
    const c = projColor(style, s);
    const n = crit ? 1.6 : 1;
    switch (style) {
      case 'fire': case 'fireball':
        this.burst({ x, y, h, count: 12 * n, color: '#ffe08a', color2: '#ff4a12', speed: 4, up: 0.4, life: 0.4, size: 0.7 });
        this.flashSphere(x, h, y, 0.9, '#ff8a2e', 0.2);
        break;
      case 'ice': case 'icelance':
        this.burst({ x, y, h, count: 10 * n, color: '#ffffff', color2: '#7fdcff', speed: 4.5, up: 0.4, life: 0.4, size: 0.45, gravity: 6 });
        break;
      case 'water':
        this.burst({ x, y, h, count: 10 * n, color: '#c8fff1', color2: '#33c9b0', speed: 3.5, up: 0.6, life: 0.5, size: 0.45, gravity: 9 });
        break;
      case 'tower': case 'fountain':
        this.flashSphere(x, h, y, 1.3, c, 0.25);
        this.burst({ x, y, h, count: 14, color: '#ffffff', color2: c, speed: 5, up: 0.4, life: 0.4, size: 0.6 });
        break;
      case 'cannon': case 'grenade':
        this.burst({ x, y, h: 0.5, count: 12, color: '#ffd27a', color2: '#7a4a2a', speed: 4, up: 0.6, life: 0.5, size: 0.6 });
        this.burst({ x, y, h: 0.5, count: 6, color: '#6d6d6d', color2: '#2a2a2a', speed: 1.5, up: 0.7, life: 0.9, size: 0.9, sizeEnd: 1.4, additive: false, alpha: 0.6 });
        break;
      default:
        this.burst({ x, y, h, count: 7 * n, color: '#ffffff', color2: c, speed: 3.5, up: 0.4, life: 0.3, size: 0.4 });
    }
    if (crit) this.ring(x, y, 0.3, 1.6, '#fff07a', 0.3);
  }

  onProjHit(ev) {
    this.impact(ev.style, ev.x, ev.y, 1.1, false);
    if (ev.style === 'fireball') this.flashSphere(ev.x, 1, ev.y, 2, '#ff6a1f', 0.3);
  }

  onCC(ev) {
    const { x, y } = ev;
    switch (ev.kind) {
      case 'stun': this.burst({ x, y, h: 2.2, count: 10, color: '#fff27a', speed: 2.5, up: 0.2, life: 0.45, size: 0.4 }); break;
      case 'freeze': this.burst({ x, y, h: 1, count: 16, color: '#ffffff', color2: '#8fe3ff', speed: 3, up: 0.6, life: 0.6, size: 0.5, radius: 0.6 }); break;
      case 'root': this.ring(x, y, 1.6, 0.6, '#5ee36b', 0.4); break;
      case 'knockup': this.burst({ x, y, h: 0.2, count: 12, color: '#d9c49a', color2: '#7a6a4a', speed: 3, up: 0.5, life: 0.6, size: 0.7, additive: false, alpha: 0.7 }); break;
      default: break;
    }
  }

  onDash(ev) {
    const { x, y, x2, y2 } = ev;
    const c = ev.color || '#ffffff';
    const L = Math.hypot(x2 - x, y2 - y);
    const n = Math.max(2, Math.round(L * 2.5));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      this.particles.one(x + (x2 - x) * k, y + (y2 - y) * k, ev.leap ? 0.6 + Math.sin(k * Math.PI) * 2.5 : 1.0, c, 0.9, 0.35 + k * 0.25, { sizeEnd: 0.1 });
    }
    // 拖影条
    const m = new THREE.Mesh(G.plane, glowMat(c, 0.5));
    m.position.set((x + x2) / 2, 0.9, (y + y2) / 2);
    m.rotation.y = -Math.atan2(y2 - y, x2 - x);
    this.spawn(m, 0.35, (k) => { m.scale.set(Math.max(0.1, L), 1, 0.9 * (1 - k)); m.material.opacity = 0.5 * (1 - k); });
    if (ev.leap) {
      this.ring(x2, y2, 0.5, 2.6, c, 0.5);
      this.burst({ x: x2, y: y2, h: 0.2, count: 10, color: '#d9c49a', color2: '#6a5a3a', speed: 3, up: 0.4, life: 0.6, size: 0.7, additive: false, alpha: 0.6 });
    }
  }

  onCast(ev) {
    const h = this.world.unitById(ev.hero);
    if (!h || !h.def) return;
    const c = h.def.colors.accent;
    this.burst({ x: h.x, y: h.y, h: 1.1, count: ev.slot === 2 ? 20 : 8, color: '#ffffff', color2: c, speed: ev.slot === 2 ? 4 : 2.5, up: 0.3, life: 0.4, size: 0.5, radius: 0.4 });
    if (ev.slot === 2) this.ring(h.x, h.y, 0.4, 2.4, c, 0.45);
  }

  onDeath(ev) {
    const { x, y } = ev;
    switch (ev.kind) {
      case 'hero': {
        const c = TEAMC[ev.team];
        this.burst({ x, y, h: 1, count: 30, color: '#ffffff', color2: c, speed: 4, up: 0.6, life: 0.9, size: 0.6, radius: 0.5 });
        this.pillar(x, y, 0.9, 5, c, 1.2, 0.35);
        this.ring(x, y, 0.5, 3, c, 0.7);
        break;
      }
      case 'minion':
        this.burst({ x, y, h: 0.6, count: 8, color: '#bdbdbd', color2: '#4a4a4a', speed: 1.8, up: 0.6, life: 0.6, size: 0.6, sizeEnd: 1, additive: false, alpha: 0.55 });
        if (ev.lastHit) this.burst({ x, y, h: 1.2, count: 6, color: '#ffe066', speed: 2, up: 0.8, life: 0.6, size: 0.35, gravity: 6 });
        break;
      case 'monster':
        this.burst({ x, y, h: 0.8, count: 16, color: '#e9d4ff', color2: '#8a4bff', speed: 3, up: 0.6, life: 0.8, size: 0.6, radius: 0.8 });
        break;
      case 'tower': case 'crystal': {
        const big = ev.kind === 'crystal';
        const c = TEAMC[ev.team];
        this.flashSphere(x, 3, y, big ? 9 : 6, '#ffd08a', big ? 0.9 : 0.6, 0.9);
        this.ring(x, y, 1, big ? 18 : 10, '#ffb35a', big ? 1.2 : 0.9);
        this.ring(x, y, 1, big ? 12 : 7, c, big ? 1.0 : 0.7);
        this.burst({ x, y, h: 2, count: big ? 90 : 50, color: '#fff0c0', color2: '#ff5a1a', speed: big ? 12 : 8, up: 0.55, life: 1.2, size: 1.2, radius: 1.5, gravity: 6 });
        this.burst({ x, y, h: 1, count: big ? 40 : 24, color: '#8a8378', color2: '#3a3530', speed: 6, up: 0.75, life: 1.6, size: 0.8, gravity: 14, additive: false, alpha: 0.9, drag: 0.3 });
        this.burst({ x, y, h: 1, count: big ? 30 : 16, color: '#7a7a7a', color2: '#2c2c2c', speed: 2, up: 0.8, life: 2.2, size: 2.2, sizeEnd: 4, additive: false, alpha: 0.5, radius: 2 });
        this.shake(big ? 1.2 : 0.7, x, y);
        break;
      }
      default: break;
    }
  }

  onFx(ev) {
    const { x, y } = ev;
    const r = ev.r || 2;
    const c = ev.color || '#ffffff';
    const uv = ev.unit ? this.opts.getUnitView(ev.unit) : null;
    switch (ev.name) {
      case 'spin': {
        const m = new THREE.Mesh(G.bigArc, glowMat(c, 0.9));
        m.position.set(x, 0.9, y);
        this.spawn(m, 0.35, (k, o) => {
          if (uv) o.position.set(uv.pos.x, 0.9, uv.pos.z);
          o.scale.set(r, 1, r);
          o.rotation.y = -k * Math.PI * 4;
          o.material.opacity = 0.9 * (1 - k);
        });
        this.ring(x, y, r * 0.3, r, c, 0.35);
        this.burst({ x, y, h: 0.9, count: 16, color: '#ffffff', color2: c, speed: 6, up: 0.15, life: 0.35, size: 0.45, radius: r * 0.5, outward: true });
        break;
      }
      case 'slash': this.slash(x, y, ev.angle || 0, r, c, ev.big ? 0.35 : 0.25, !!ev.big); if (ev.big) this.shake(0.15, x, y); break;
      case 'ring': this.ring(x, y, r * 0.2, r, c, ev.big ? 0.7 : 0.45); this.disc(x, y, r, c, 0.35, { alpha: 0.25, grow: true }); break;
      case 'roar':
        for (let i = 0; i < 3; i++) setTimeout(() => this.ring(x, y, 0.5, r * (0.7 + i * 0.15), c, 0.5), i * 90);
        this.burst({ x, y, h: 0.3, count: 20, color: '#d9c49a', color2: '#6a5a3a', speed: 5, up: 0.25, life: 0.6, size: 0.8, radius: 1, outward: true, additive: false, alpha: 0.6 });
        this.shake(0.25, x, y);
        break;
      case 'blink':
        this.burst({ x, y, h: 1, count: 14, color: '#ffffff', color2: c, speed: 3, up: 0.4, life: 0.4, size: 0.5, radius: 0.5 });
        if (ev.x2 !== undefined) {
          this.burst({ x: ev.x2, y: ev.y2, h: 1, count: 14, color: '#ffffff', color2: c, speed: 3, up: 0.4, life: 0.4, size: 0.5, radius: 0.5 });
          this.onDash({ x, y, x2: ev.x2, y2: ev.y2, color: c });
        }
        break;
      case 'refresh':
        this.burst({ x, y, h: 0.5, count: 16, color: '#ffffff', color2: c, speed: 2, up: 0.95, life: 0.8, size: 0.4, radius: 0.8 });
        this.ring(x, y, 0.4, 1.8, c, 0.4);
        break;
      case 'explosion': {
        const soft = !!ev.soft;
        this.flashSphere(x, 0.8, y, r * 0.9, c, soft ? 0.5 : 0.35, soft ? 0.55 : 0.85);
        this.ring(x, y, r * 0.3, r * 1.15, c, 0.45);
        this.disc(x, y, r, c, 0.5, { alpha: 0.35 });
        this.burst({ x, y, h: 0.6, count: Math.round(10 + r * 7), color: '#fff2c0', color2: c, speed: 3 + r * 2, up: 0.45, life: 0.55, size: 0.8, radius: r * 0.4 });
        this.burst({ x, y, h: 0.6, count: Math.round(4 + r * 2), color: '#5a5048', color2: '#2a2622', speed: 1.5, up: 0.8, life: 1.1, size: 1.2, sizeEnd: 2.0, additive: false, alpha: 0.45, radius: r * 0.5 });
        this.shake(soft ? 0.25 : 0.12 + r * 0.04, x, y);
        break;
      }
      case 'meteor': this.meteor(x, y, r, c); break;
      case 'icecrack': {
        this.disc(x, y, r, '#bdf0ff', 0.6, { alpha: 0.45 });
        this.ring(x, y, r * 0.5, r * 1.1, '#e8fbff', 0.5);
        const n = 9;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, d = r * (0.3 + Math.random() * 0.65);
          const m = new THREE.Mesh(G.oct, new THREE.MeshPhongMaterial({ color: '#bfefff', emissive: '#3aa7d6', transparent: true, opacity: 0.85, shininess: 100, flatShading: true }));
          const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
          m.position.set(px, 0, py);
          m.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * 3, (Math.random() - 0.5) * 0.6);
          const s = 0.35 + Math.random() * 0.3;
          this.spawn(m, 1.1, (k, o) => {
            const g = Math.min(1, k * 6);
            o.scale.set(s, s * 3 * g, s);
            o.material.opacity = k > 0.7 ? 0.85 * (1 - (k - 0.7) / 0.3) : 0.85;
          });
        }
        this.burst({ x, y, h: 0.5, count: 24, color: '#ffffff', color2: '#7fdcff', speed: 5, up: 0.5, life: 0.6, size: 0.45, radius: r * 0.6, gravity: 5 });
        break;
      }
      case 'fountain':
        this.ring(x, y, 0.5, r, c, 0.6);
        this.disc(x, y, r, c, 0.8, { alpha: 0.3 });
        this.burst({ x, y, h: 0.2, count: 40, color: '#e6fff8', color2: c, speed: 5, up: 0.9, spread: 0.3, life: 0.9, size: 0.5, radius: r * 0.7, gravity: 8 });
        break;
      case 'quake':
        this.ring(x, y, 0.4, r, c, 0.5);
        this.ring(x, y, 0.4, r * 0.75, '#ffe2b0', 0.4, { thin: true });
        this.disc(x, y, r, '#5a4630', 0.7, { alpha: 0.35 });
        this.burst({ x, y, h: 0.2, count: Math.round(12 + r * 4), color: '#cdb48a', color2: '#5a4630', speed: 4 + r, up: 0.6, life: 0.8, size: 0.6, radius: r * 0.6, gravity: 12, additive: false, alpha: 0.85 });
        this.shake(ev.big ? 0.5 : 0.25, x, y);
        break;
      case 'burst':
        this.burst({ x, y, h: 1, count: 18, color: '#ffffff', color2: c, speed: 4, up: 0.4, life: 0.5, size: 0.5, radius: r * 0.4 });
        this.ring(x, y, 0.3, r, c, 0.35);
        break;
      case 'shield': {
        const t = this.world.unitById(ev.target);
        const v = t && this.opts.getUnitView(t.id);
        const hh = v ? v.height : 2;
        this.flashSphere(x, hh * 0.5, y, hh * 0.75, '#bff3ff', 0.35, 0.5);
        break;
      }
      case 'healspell':
        this.ring(x, y, 0.4, 2.2, '#5dff8f', 0.6);
        this.burst({ x, y, h: 0.3, count: 16, color: '#cfffdc', color2: '#28d06a', speed: 2, up: 0.95, life: 1.0, size: 0.5, radius: 1 });
        break;
      case 'reviveStart': this.pillar(x, y, 1.2, 4, '#ffe08a', 2.0, 0.5); break;
      case 'revive':
        this.pillar(x, y, 1.6, 7, '#fff2b0', 0.9, 0.7);
        this.ring(x, y, 0.5, 3.5, '#ffd75e', 0.7);
        this.burst({ x, y, h: 0.5, count: 30, color: '#ffffff', color2: '#ffc93c', speed: 4, up: 0.7, life: 1.0, size: 0.5, radius: 1 });
        break;
      case 'flash':
        this.burst({ x, y, h: 1, count: 16, color: '#fffbd0', color2: '#ffd23f', speed: 3, up: 0.4, life: 0.4, size: 0.55, radius: 0.5 });
        if (ev.x2 !== undefined) {
          this.burst({ x: ev.x2, y: ev.y2, h: 1, count: 16, color: '#fffbd0', color2: '#ffd23f', speed: 3, up: 0.4, life: 0.4, size: 0.55, radius: 0.5 });
          this.onDash({ x, y, x2: ev.x2, y2: ev.y2, color: '#ffe680' });
        }
        break;
      case 'smite': {
        const m = new THREE.Mesh(G.tube, glowMat('#fff3c4', 0.95));
        m.position.set(x, 0, y);
        this.spawn(m, 0.35, (k, o) => { o.scale.set(0.35 * (1 - k), 14, 0.35 * (1 - k)); o.material.opacity = 0.95 * (1 - k); });
        this.flashSphere(x, 1, y, 2.2, '#ffcf4a', 0.3);
        this.ring(x, y, 0.5, 3, '#ffcf4a', 0.45);
        this.burst({ x, y, h: 1, count: 20, color: '#ffffff', color2: '#ffb000', speed: 5, up: 0.5, life: 0.45, size: 0.5 });
        this.shake(0.2, x, y);
        break;
      }
      default:
        this.burst({ x, y, h: 1, count: 10, color: c, speed: 3, up: 0.4, life: 0.4, size: 0.5 });
    }
  }

  meteor(x, y, r, c) {
    const rock = new THREE.Group();
    const core = new THREE.Mesh(G.dodec, solidMat('#4a2a1a', { emissive: '#ff4a10', emissiveIntensity: 0.8 }));
    core.scale.setScalar(r * 0.45);
    rock.add(core);
    const glow = this.sprite('#ff7a2a', r * 2.2, 0.9);
    rock.add(glow);
    const sx = x + 5, sy = y - 3, sh = 16, dur = 0.38;
    this.spawn(rock, dur, (k, o, dt) => {
      const e = k * k;
      o.position.set(sx + (x - sx) * e, sh * (1 - e) + 0.3, sy + (y - sy) * e);
      core.rotation.x += 0.2; core.rotation.y += 0.13;
      if (dt) this.particles.one(o.position.x, o.position.y, o.position.z, '#ffb060', 1.2, 0.35, { color2: '#ff3000', sizeEnd: 0.2 });
      if (k >= 1) {
        this.flashSphere(x, 0.6, y, r * 1.3, c, 0.3, 0.9);
        this.ring(x, y, 0.3, r * 1.4, c, 0.4);
        this.burst({ x, y, h: 0.4, count: 14, color: '#ffe0a0', color2: c, speed: 5, up: 0.5, life: 0.5, size: 0.7, radius: 0.5, gravity: 8 });
        this.shake(0.12, x, y);
      }
    });
  }

  // ================= 飞行物 =================
  updateProjectiles(alpha, dt) {
    const w = this.world;
    const seen = new Set();
    for (const p of w.projectiles) {
      if (p.dead && !p.stopped && !p.homing && !p.lob) { /* 刚结束的直线飞行物，下一帧移除 */ }
      seen.add(p.id);
      let v = this.projViews.get(p.id);
      if (!v) {
        v = this.makeProjView(p);
        this.projViews.set(p.id, v);
        this.group.add(v.obj);
      }
      const x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha;
      let h = v.h;
      if (p.lob) {
        const done = Math.min(1, (p.traveled + p.speed * dt * alpha) / p.total);
        h = v.h + Math.sin(done * Math.PI) * Math.max(2, p.total * 0.35);
      }
      const visible = p.team === this.opts.playerTeam || this.opts.isVisible(x, y);
      v.obj.visible = visible;
      v.obj.position.set(x, h, y);
      v.obj.rotation.y = -(p.angle || 0);
      v.t += dt;
      if (v.spin) v.spinObj.rotation.y += dt * v.spin;
      if (v.bob) v.obj.position.y += Math.sin(v.t * 20) * 0.05;
      // 拖尾
      if (visible && v.trail && dt > 0) {
        v.trailAcc += dt * v.trail.rate;
        while (v.trailAcc >= 1) {
          v.trailAcc -= 1;
          this.particles.one(x + (Math.random() - 0.5) * v.trail.jit, y + (Math.random() - 0.5) * v.trail.jit, h + (Math.random() - 0.5) * v.trail.jit,
            v.trail.color, v.trail.size, v.trail.life, { color2: v.trail.color2, sizeEnd: v.trail.size * 0.15, vh: v.trail.vh || 0, additive: v.trail.additive });
        }
      }
    }
    for (const [id, v] of this.projViews) {
      if (!seen.has(id)) { this.group.remove(v.obj); disposeTree(v.obj); this.projViews.delete(id); }
    }
  }

  makeProjView(p) {
    const style = p.style || 'basic';
    const c = p.color || projColor(style, p.owner);
    const g = new THREE.Group();
    const v = { obj: g, h: 1.3, t: 0, trail: null, trailAcc: 0, spin: 0, spinObj: null, bob: false };
    const core = (geo, color, s, mat) => { const m = new THREE.Mesh(geo, mat || new THREE.MeshBasicMaterial({ color })); m.scale.setScalar(s); g.add(m); return m; };
    switch (style) {
      case 'fire':
        core(G.sphere, '#fff1b0', 0.22); g.add(this.sprite('#ff7a1a', 1.4, 0.95));
        v.trail = { color: '#ffb347', color2: '#ff3a00', size: 0.7, life: 0.3, rate: 50, jit: 0.2 };
        break;
      case 'ice':
        core(G.oct, '#e6fbff', 0.28).scale.set(0.45, 0.22, 0.22); g.add(this.sprite('#6fd3ff', 1.2, 0.9));
        v.trail = { color: '#e0f8ff', color2: '#5fc8ff', size: 0.5, life: 0.3, rate: 40, jit: 0.2 };
        break;
      case 'arrow': {
        const s = new THREE.Mesh(G.shaft, new THREE.MeshBasicMaterial({ color: '#d8c49a' })); g.add(s);
        const hd = new THREE.Mesh(G.head, new THREE.MeshBasicMaterial({ color: '#e8e8f0' })); g.add(hd);
        v.trail = { color: '#ffffff', color2: '#a3e635', size: 0.25, life: 0.15, rate: 40, jit: 0.05 };
        break;
      }
      case 'bullet':
        core(G.bullet, '#fff6c0', 1); g.add(this.sprite('#ffcc33', 0.7, 0.8));
        v.trail = { color: '#fff2a0', color2: '#ff9a2e', size: 0.3, life: 0.12, rate: 60, jit: 0.02 };
        break;
      case 'water':
        core(G.sphere, '#d8fff6', 0.22); g.add(this.sprite('#33d6b8', 1.2, 0.9));
        v.trail = { color: '#a8fff0', color2: '#1aa58c', size: 0.45, life: 0.35, rate: 35, jit: 0.25, vh: -1 };
        break;
      case 'minion':
        core(G.sphere, TEAMC[p.team] || '#ffffff', 0.16); g.add(this.sprite(TEAMC[p.team] || '#ffffff', 0.8, 0.8));
        v.trail = { color: TEAMC[p.team] || '#ffffff', size: 0.3, life: 0.15, rate: 25, jit: 0.05 };
        break;
      case 'cannon':
        core(G.sphere, '#333333', 0.3, solidMat('#3a3a3a')); v.h = 1.4; v.bob = false;
        v.trail = { color: '#7a7a7a', color2: '#3a3a3a', size: 0.5, life: 0.4, rate: 20, jit: 0.1, additive: false };
        break;
      case 'tower': {
        const tc = TEAMC[p.team];
        core(G.sphere, '#ffffff', 0.35); g.add(this.sprite(tc, 2.4, 1));
        v.h = 3; v.trail = { color: '#ffffff', color2: tc, size: 1.0, life: 0.25, rate: 60, jit: 0.15 };
        break;
      }
      case 'fountain': {
        const tc = TEAMC[p.team];
        core(G.sphere, '#ffffff', 0.4); g.add(this.sprite(tc, 2.6, 1)); v.h = 2.5;
        v.trail = { color: '#ffffff', color2: tc, size: 1.0, life: 0.2, rate: 60, jit: 0.1 };
        break;
      }
      case 'monster':
        core(G.ico, '#e2c6ff', 0.25); g.add(this.sprite('#a46bff', 1.2, 0.9));
        v.trail = { color: '#d2b0ff', color2: '#6a2bd6', size: 0.5, life: 0.25, rate: 30, jit: 0.1 };
        break;
      case 'shuriken': {
        const m = new THREE.Mesh(G.star, new THREE.MeshBasicMaterial({ color: '#e6d6ff' }));
        m.scale.setScalar(1.4);
        const sp = new THREE.Group(); sp.add(m); g.add(sp); g.add(this.sprite(c, 1.4, 0.7));
        v.spin = 25; v.spinObj = sp;
        v.trail = { color: '#d9b3ff', color2: '#7a3bd6', size: 0.4, life: 0.2, rate: 40, jit: 0.2 };
        break;
      }
      case 'fireball':
        core(G.sphere, '#fff3c0', 0.45); g.add(this.sprite('#ff6a1a', 2.8, 1)); g.add(this.sprite('#ffcc66', 1.4, 0.9));
        v.trail = { color: '#ffcf6a', color2: '#ff2a00', size: 1.3, life: 0.45, rate: 70, jit: 0.4, vh: 0.6 };
        break;
      case 'icelance': {
        const m = new THREE.Mesh(G.lance, new THREE.MeshPhongMaterial({ color: '#d8f6ff', emissive: '#2b9fd8', shininess: 120, flatShading: true }));
        m.scale.set(1.2, 1.2, 1.2);
        g.add(m); g.add(this.sprite('#7fe0ff', 2, 0.8));
        v.trail = { color: '#ffffff', color2: '#58c8ff', size: 0.6, life: 0.35, rate: 60, jit: 0.4 };
        break;
      }
      case 'arrowBig': {
        const s = new THREE.Mesh(G.shaft, glowMat('#eaffb0', 1)); s.scale.set(1.6, 2.5, 2.5); g.add(s);
        const hd = new THREE.Mesh(G.head, glowMat('#d9ff6a', 1)); hd.scale.set(1.8, 2.5, 2.5); g.add(hd);
        g.add(this.sprite('#a3e635', 1.8, 0.8));
        v.trail = { color: '#eaffb0', color2: '#5aa81e', size: 0.6, life: 0.3, rate: 60, jit: 0.15 };
        break;
      }
      case 'ultArrow': {
        const w = Math.max(1.5, p.width || 2);
        const s = new THREE.Mesh(G.shaft, glowMat('#f4ffd0', 1)); s.scale.set(3, w * 3, w * 3); g.add(s);
        const hd = new THREE.Mesh(G.head, glowMat('#d9ff6a', 1)); hd.scale.set(3, w * 2.5, w * 2.5); hd.position.x = 1.6; g.add(hd);
        g.add(this.sprite('#c8ff5a', w * 2.4, 0.9));
        v.h = 1.4;
        v.trail = { color: '#f4ffd0', color2: '#7fd61e', size: w * 0.9, life: 0.45, rate: 90, jit: w * 0.4 };
        break;
      }
      case 'grenade':
        core(G.sphere, '#5a4a2a', 0.3, solidMat('#6a5a2a')); g.add(this.sprite('#ffd23f', 0.9, 0.7)); v.h = 1;
        v.trail = { color: '#ffd23f', color2: '#ff6a00', size: 0.35, life: 0.25, rate: 30, jit: 0.05 };
        break;
      case 'tracer': {
        const s = new THREE.Mesh(G.shaft, glowMat('#fff6b0', 1)); s.scale.set(1.2, 1.5, 1.5); g.add(s);
        v.trail = { color: '#fff2a0', color2: '#ff9a2e', size: 0.3, life: 0.1, rate: 50, jit: 0.02 };
        break;
      }
      case 'vine': {
        const sp = new THREE.Group();
        for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(G.oct, solidMat('#3fb36a', { emissive: '#145a30' })); m.scale.set(0.35, 0.18, 0.18); m.position.set(-i * 0.35, Math.sin(i * 2) * 0.12, Math.cos(i * 2) * 0.12); sp.add(m); }
        g.add(sp); g.add(this.sprite('#4dffb0', 1.3, 0.6));
        v.spin = 0; v.trail = { color: '#9affd0', color2: '#1d8a5a', size: 0.45, life: 0.4, rate: 40, jit: 0.3 };
        break;
      }
      case 'chain': {
        for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(G.torus, new THREE.MeshPhongMaterial({ color: '#ffd166', emissive: '#7a5a10', shininess: 80 })); m.scale.set(0.22, 0.6, 0.22); m.rotation.z = i % 2 ? Math.PI / 2 : 0; m.position.x = -i * 0.32; g.add(m); }
        g.add(this.sprite('#ffd166', 1.4, 0.8));
        v.trail = { color: '#ffe9a8', color2: '#d69a1a', size: 0.35, life: 0.3, rate: 30, jit: 0.1 };
        break;
      }
      default:
        core(G.sphere, '#ffffff', 0.18); g.add(this.sprite(c, 0.9, 0.8));
        v.trail = { color: c, size: 0.3, life: 0.15, rate: 25, jit: 0.05 };
    }
    return v;
  }

  // ================= 地面区域 =================
  updateAreas(dt) {
    const w = this.world;
    const seen = new Set();
    for (const a of w.areas) {
      if (a.dead) continue;
      seen.add(a.id);
      let v = this.areaViews.get(a.id);
      if (!v) { v = this.makeAreaView(a); this.areaViews.set(a.id, v); this.group.add(v.obj); }
      const visible = a.team === this.opts.playerTeam || this.opts.isVisible(a.x, a.y);
      v.obj.visible = visible;
      v.obj.position.set(a.x, 0, a.y);
      const r = a.radius || 2;
      if (!a.triggered) {
        const k = Math.min(1, a.t / Math.max(0.01, a.delay));
        v.edge.scale.set(r * 2, 1, r * 2);
        v.edge.material.opacity = 0.55 + 0.35 * Math.sin(this.time * 18);
        v.fill.scale.set(r * k, 1, r * k);
        v.fill.material.opacity = 0.25 + 0.25 * k;
        if (v.bell) { v.bell.position.y = 3.2 + (1 - k) * 2.5; v.bell.rotation.y += dt * 4; }
      } else {
        // 持续阶段
        v.edge.scale.set(r * 2, 1, r * 2);
        v.edge.material.opacity = 0.4;
        v.fill.scale.set(r, 1, r);
        v.fill.material.opacity = 0.18 + 0.08 * Math.sin(this.time * 6);
        if (v.bell) v.bell.visible = false;
        if (visible && a.visual === 'blizzard') {
          for (let i = 0; i < 3; i++) {
            const ang = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
            this.particles.one(a.x + Math.cos(ang) * d, a.y + Math.sin(ang) * d, 4 + Math.random() * 2, '#ffffff', 0.45, 0.9, { vh: -6, vx: 1.5, color2: '#bfeaff', sizeEnd: 0.3 });
          }
        } else if (visible && a.visual === 'meteor') {
          const ang = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
          this.particles.one(a.x + Math.cos(ang) * d, a.y + Math.sin(ang) * d, 0.2, '#ff7a2a', 0.6, 0.6, { vh: 1.5, color2: '#5a1000' });
        }
      }
    }
    for (const [id, v] of this.areaViews) {
      if (!seen.has(id)) { this.group.remove(v.obj); disposeTree(v.obj); this.areaViews.delete(id); }
    }
  }

  makeAreaView(a) {
    const g = new THREE.Group();
    const c = a.color || '#ff9f1c';
    const edgeMat = new THREE.MeshBasicMaterial({ map: this.ringTex, color: c, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    // 1×1 平面里的贴图圆半径 0.5，所以缩放用 2r
    const edge = new THREE.Mesh(G.plane, edgeMat);
    edge.position.y = 0.16;
    edge.renderOrder = 4;
    const fill = new THREE.Mesh(G.disc, glowMat(c, 0.3));
    fill.position.y = 0.13;
    fill.renderOrder = 3;
    g.add(edge, fill);
    const v = { obj: g, edge, fill, bell: null };
    if (a.visual === 'bell') {
      const bell = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 1.4, 12, 1, true), new THREE.MeshPhongMaterial({ color: '#e8b84a', emissive: '#6a4a10', side: THREE.DoubleSide, shininess: 90 }));
      body.position.y = 0.7;
      const top = new THREE.Mesh(G.sphere, new THREE.MeshPhongMaterial({ color: '#e8b84a', emissive: '#6a4a10' }));
      top.scale.set(0.5, 0.35, 0.5); top.position.y = 1.4;
      bell.add(body, top, this.sprite('#ffd166', 3, 0.5));
      bell.position.y = 5;
      g.add(bell);
      v.bell = bell;
    }
    return v;
  }

  // ================= 持续状态 =================
  updateBuffs(units, dt) {
    const seen = new Set();
    for (const u of units) {
      if (u.dead || !u.buffs) continue;
      const view = this.opts.getUnitView(u.id);
      if (!view || !view.root.visible) continue;
      const keys = new Set();
      for (const b of u.buffs) if (b.visual) keys.add(b.visual);
      if (u.recalling) keys.add('recall');
      if (!keys.size) continue;
      seen.add(u.id);
      let bv = this.buffViews.get(u.id);
      if (!bv) { bv = { objs: {}, acc: 0 }; this.buffViews.set(u.id, bv); }
      const p = view.pos, H = view.height;
      // 移除已结束的
      for (const k of Object.keys(bv.objs)) if (!keys.has(k)) { if (bv.objs[k]) { this.group.remove(bv.objs[k]); disposeTree(bv.objs[k]); } delete bv.objs[k]; }
      for (const k of keys) {
        let o = bv.objs[k];
        if (o === undefined) { o = this.makeBuffObj(k, u, H); bv.objs[k] = o; if (o) this.group.add(o); }
        if (o) {
          o.position.copy(p);
          if (o.userData.tick) o.userData.tick(o, dt, this.time, u, H);
        }
        this.buffParticles(k, u, p, H, dt);
      }
    }
    for (const [id, bv] of this.buffViews) {
      if (!seen.has(id)) { for (const o of Object.values(bv.objs)) if (o) { this.group.remove(o); disposeTree(o); } this.buffViews.delete(id); }
    }
  }

  makeBuffObj(key, u, H) {
    const R = (u.radius || 0.6) + 0.35;
    switch (key) {
      case 'stun': {
        const g = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const s = new THREE.Mesh(G.star, new THREE.MeshBasicMaterial({ color: '#ffe94a' }));
          s.scale.setScalar(0.45);
          g.add(s);
        }
        g.userData.tick = (o, dt, t) => o.children.forEach((s, i) => {
          const a = t * 5 + (i / 3) * Math.PI * 2;
          s.position.set(Math.cos(a) * 0.6, H + 0.35 + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.6);
          s.rotation.y = -a * 2;
        });
        return g;
      }
      case 'freeze': {
        const m = new THREE.Mesh(G.ico, new THREE.MeshPhongMaterial({ color: '#c8f2ff', emissive: '#1d6f99', transparent: true, opacity: 0.5, shininess: 120, flatShading: true, depthWrite: false }));
        m.scale.set(R * 1.4, H * 0.75, R * 1.4);
        m.userData.tick = (o) => { o.position.y = H * 0.55; };
        return m;
      }
      case 'root': {
        const g = new THREE.Group();
        const t = new THREE.Mesh(G.torus, solidMat('#3a9a3a', { emissive: '#103a10' })); t.scale.set(R, 1.5, R); t.position.y = 0.25; g.add(t);
        for (let i = 0; i < 5; i++) {
          const s = new THREE.Mesh(G.cone, solidMat('#4ab84a', { emissive: '#103a10' }));
          const a = (i / 5) * Math.PI * 2;
          s.position.set(Math.cos(a) * R, 0, Math.sin(a) * R); s.scale.set(0.12, 0.9, 0.12); s.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
          g.add(s);
        }
        return g;
      }
      case 'silence': {
        const m = new THREE.Mesh(G.torus, glowMat('#c58bff', 0.9)); m.scale.set(0.45, 1, 0.45);
        m.userData.tick = (o, dt, t) => { o.position.y = H + 0.4; o.rotation.y = t * 3; };
        return m;
      }
      case 'shield': {
        const m = new THREE.Mesh(G.sphere, glowMat('#9fe8ff', 0.18));
        m.scale.set(R * 1.6, H * 0.65, R * 1.6);
        m.userData.tick = (o, dt, t) => { o.position.y = H * 0.48; o.material.opacity = 0.15 + 0.06 * Math.sin(t * 5); };
        return m;
      }
      case 'slow': {
        const m = new THREE.Mesh(G.ring, glowMat('#6fa8ff', 0.45)); m.scale.set(R, 1, R);
        m.userData.tick = (o) => { o.position.y = 0.15; };
        return m;
      }
      case 'harden': {
        const m = new THREE.Mesh(G.sphere, glowMat('#ffc04a', 0.14)); m.scale.set(R * 1.5, H * 0.62, R * 1.5);
        m.userData.tick = (o, dt, t) => { o.position.y = H * 0.48; o.material.opacity = 0.1 + 0.06 * Math.sin(t * 8); };
        return m;
      }
      case 'rage': {
        const m = new THREE.Mesh(G.ring, glowMat('#ff3030', 0.6)); m.scale.set(R * 1.2, 1, R * 1.2);
        m.userData.tick = (o, dt, t) => { o.position.y = 0.15; const s = R * (1.15 + 0.1 * Math.sin(t * 10)); o.scale.set(s, 1, s); };
        return m;
      }
      case 'revive': {
        const m = new THREE.Mesh(G.tube, glowMat('#ffe08a', 0.4)); m.scale.set(R * 1.3, H * 2.2, R * 1.3);
        return m;
      }
      case 'recall': {
        const g = new THREE.Group();
        const ring = new THREE.Mesh(G.ring, glowMat('#7fc8ff', 0.8)); ring.scale.set(1.6, 1, 1.6); ring.position.y = 0.15;
        const prog = new THREE.Mesh(G.disc, glowMat('#3a8fe0', 0.35)); prog.position.y = 0.13;
        const col = new THREE.Mesh(G.tube, glowMat('#9fd8ff', 0.25)); col.scale.set(1.2, H * 1.8, 1.2);
        g.add(ring, prog, col);
        g.userData.tick = (o, dt, t, unit) => {
          const k = unit.recalling ? 1 - unit.recalling.t / 6 : 1;
          prog.scale.set(1.6 * k, 1, 1.6 * k);
          col.material.opacity = 0.15 + 0.25 * k;
          ring.rotation.y = t * 2;
        };
        return g;
      }
      case 'blueBuff': case 'redBuff': case 'drakeBuff': case 'guardianBuff': {
        const c = { blueBuff: '#4ab0ff', redBuff: '#ff4a3a', drakeBuff: '#ff9a2e', guardianBuff: '#b07cff' }[key];
        const off = { blueBuff: 0, redBuff: Math.PI, drakeBuff: Math.PI / 2, guardianBuff: -Math.PI / 2 }[key];
        const g = new THREE.Group();
        const orb = new THREE.Mesh(G.sphere, new THREE.MeshBasicMaterial({ color: c })); orb.scale.setScalar(0.13);
        const sp = this.sprite(c, 0.8, 0.9);
        const holder = new THREE.Group(); holder.add(orb, sp);
        g.add(holder);
        g.userData.tick = (o, dt, t) => {
          const a = t * 2.4 + off;
          holder.position.set(Math.cos(a) * R * 1.2, H * 0.35 + Math.sin(t * 3 + off) * 0.15, Math.sin(a) * R * 1.2);
        };
        return g;
      }
      default: return null;  // 只用粒子表现
    }
  }

  buffParticles(key, u, p, H, dt) {
    const rate = (n) => Math.random() < n * dt;
    switch (key) {
      case 'burn': if (rate(14)) this.particles.one(p.x + (Math.random() - 0.5) * 0.8, p.z + (Math.random() - 0.5) * 0.8, H * (0.2 + Math.random() * 0.6), '#ffb347', 0.6, 0.45, { vh: 2, color2: '#ff2a00' }); break;
      case 'rage': if (rate(10)) this.particles.one(p.x + (Math.random() - 0.5), p.z + (Math.random() - 0.5), 0.3, '#ff5050', 0.5, 0.6, { vh: 2.5, color2: '#800000' }); break;
      case 'haste': if (u.moving && rate(16)) this.particles.one(p.x + (Math.random() - 0.5) * 0.6, p.z + (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * H * 0.7, '#e8f6ff', 0.35, 0.3, { color2: '#7fc8ff' }); break;
      case 'empower': case 'recast': if (rate(12)) {
        const c = u.def && u.def.colors ? u.def.colors.accent : '#ffd166';
        const a = (u.facing || 0) + 0.6;
        this.particles.one(p.x + Math.cos(a) * 0.6, p.z + Math.sin(a) * 0.6, H * 0.55, c, 0.55, 0.35, { vh: 0.8 });
      } break;
      case 'stack': if (rate(3 + (u.hasBuff && u.hasBuff('zhanyi') ? u.hasBuff('zhanyi').stacks * 2 : 0))) this.particles.one(p.x + (Math.random() - 0.5), p.z + (Math.random() - 0.5), H * 0.4, '#ffb347', 0.35, 0.5, { vh: 1.5 }); break;
      case 'airborne': if (rate(6)) this.particles.one(p.x, p.z, 0.2, '#bba98a', 0.7, 0.5, { additive: false, vh: 0.5 }); break;
      case 'revive': if (rate(20)) this.particles.one(p.x + (Math.random() - 0.5) * 1.5, p.z + (Math.random() - 0.5) * 1.5, 0.2, '#fff2b0', 0.5, 0.9, { vh: 3 }); break;
      case 'recall': if (rate(14)) {
        const a = Math.random() * Math.PI * 2;
        this.particles.one(p.x + Math.cos(a) * 1.4, p.z + Math.sin(a) * 1.4, 0.2, '#bfe6ff', 0.45, 0.9, { vh: 2.5, vx: -Math.cos(a) * 1.2, vy: -Math.sin(a) * 1.2 });
      } break;
      default: break;
    }
  }

  // ================= 每帧 =================
  update(dt, alpha) {
    this.time += dt;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i];
      l.t += dt;
      const k = Math.min(1, l.t / l.dur);
      if (l.fn) l.fn(k, l.obj, dt, l);
      if (k >= 1) { this.group.remove(l.obj); disposeTree(l.obj); this.live.splice(i, 1); }
    }
    if (this.world) {
      this.updateProjectiles(alpha, dt);
      this.updateAreas(dt);
      this.updateBuffs(this.world.units, dt);
    }
    this.particles.update(dt);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
  }
}

function projColor(style, owner) {
  switch (style) {
    case 'fire': case 'fireball': return '#ff7a1a';
    case 'ice': case 'icelance': return '#6fd3ff';
    case 'arrow': case 'arrowBig': case 'ultArrow': return '#a3e635';
    case 'bullet': case 'tracer': return '#ffcc33';
    case 'water': return '#33d6b8';
    case 'monster': return '#a46bff';
    case 'cannon': return '#ffb060';
    case 'minion': case 'tower': case 'fountain': return TEAMC[owner ? owner.team : 1] || '#ffffff';
    default: return owner && owner.def && owner.def.colors ? owner.def.colors.accent : '#ffffff';
  }
}
