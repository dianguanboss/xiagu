// 3D 渲染主控：场景、光照、镜头、单位外观、地形、迷雾、特效、血条、指示器；另有菜单里的英雄展示台
import * as THREE from 'three';
import { buildTerrain } from './terrain.js';
import { FogOfWar } from './fog.js';
import { FX } from './fx.js';
import { Overlay } from './overlay.js';
import { Indicators } from './indicators.js';
import { U } from './shared.js';
import { MAP_SIZE } from '../config.js';
import { lerpAngle } from '../util/math.js';

const REL_COLOR = { self: '#45e05f', ally: '#3b9bff', enemy: '#ff3b3b', neutral: '#f0b43a' };
const CAM_OFF = new THREE.Vector3(0, 24, 13);

export class Renderer {
  /**
   * opts: { quality: 'low'|'medium'|'high', models }
   */
  constructor(container, opts) {
    this.container = container;
    this.quality = opts.quality || 'medium';
    this.models = opts.models;
    const Q = this.quality;
    this.gl = new THREE.WebGLRenderer({ antialias: Q !== 'low', powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.NoToneMapping;
    this.gl.shadowMap.enabled = Q !== 'low';
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.domElement.className = 'game-canvas';
    container.appendChild(this.gl.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1d2a1a');
    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 400);
    this.camTarget = new THREE.Vector3(100, 0, 100);
    this.camLook = null;          // 临时查看点（拖动小地图时）
    this.zoom = 1;
    this.free = false;            // 观战/死亡时可以自由移动镜头

    // 光照
    this.hemi = new THREE.HemisphereLight('#dceeff', '#5a6a40', 1.35);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.3);
    this.sun.castShadow = Q !== 'low';
    const sm = Q === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 1; sc.far = 140;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    // 地形
    this.terrain = buildTerrain(Q);
    this.scene.add(this.terrain.group);
    this.fog = new FogOfWar();

    this.unitLayer = new THREE.Group();
    this.unitLayer.name = 'units';
    this.scene.add(this.unitLayer);
    this.views = new Map();

    this.fx = new FX(this.scene, {
      quality: Q,
      getUnitView: (id) => this.views.get(id) || null,
      isVisible: (x, y) => this.spectate || this.fog.visibleAt(x, y),
      camTarget: () => this.camTarget,
      playerTeam: 1,
    });
    this.indicators = new Indicators(this.scene);
    this.overlay = new Overlay(container);

    this.world = null;
    this.player = null;
    this.playerTeam = 1;
    this.spectate = false;
    this.followId = 0;
    this._fadedBush = -1;
    this.showcase = null;
    this.time = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    const Q = this.quality;
    const dpr = Q === 'low' ? 1 : Q === 'medium' ? Math.min(window.devicePixelRatio || 1, 1.5) : Math.min(window.devicePixelRatio || 1, 2);
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(w, h);
    this.camera.aspect = w / h;
    // 竖屏时拉远一点，保证左右可视范围
    this.camera.fov = w < h ? 60 : 42;
    this.camera.updateProjectionMatrix();
    this.fx.particles.setViewport(h * dpr, this.camera.fov);
    this.overlay.resize(w, h, window.devicePixelRatio || 1);
    this.w = w; this.h = h;
  }

  // —— 对局 ——
  setMatch(world, { spectate = false } = {}) {
    this.clearUnits();
    this.world = world;
    this.player = world.player;
    this.spectate = spectate || !world.player;
    this.playerTeam = this.player ? this.player.team : 1;
    this.fx.opts.playerTeam = this.spectate ? -1 : this.playerTeam;
    this.fx.setWorld(world);
    this.fog.setEnabled(!this.spectate);
    this.fog.first = true;
    this.overlay.clear();
    this.free = this.spectate;
    this.followId = this.player ? this.player.id : 0;
    const p = this.player || world.heroes[0];
    this.camTarget.set(p.x, 0, p.y);
    this.showcase && this.exitShowcase();
  }

  clearUnits() {
    for (const v of this.views.values()) this.unitLayer.remove(v.root);
    this.views.clear();
    this.fx.clear();
  }

  relation(u) {
    if (u.team === 0) return 'neutral';
    if (this.spectate) return u.team === 1 ? 'ally' : 'enemy';
    if (this.player && u === this.player) return 'self';
    return u.team === this.playerTeam ? 'ally' : 'enemy';
  }

  createView(u) {
    const M = this.models;
    let model;
    try {
      switch (u.kind) {
        case 'hero': model = M.createHeroModel(u.def, u.team); break;
        case 'minion': model = M.createMinionModel(u.mtype, u.team); break;
        case 'monster': model = M.createMonsterModel(u.mtype); break;
        case 'tower': model = M.createTowerModel(u.tier, u.team); break;
        case 'crystal': model = M.createCrystalModel(u.team); break;
        case 'fountain': model = M.createFountainModel(u.team); break;
        default: return null;
      }
    } catch (e) {
      console.error('模型创建失败', u.kind, e);
      return null;
    }
    const root = new THREE.Group();
    root.add(model.root);
    model.root.traverse((o) => { if (o.isMesh) { o.castShadow = this.quality !== 'low' && o.castShadow !== false; } });
    const rel = this.relation(u);
    // 英雄脚下的阵营圈
    let ring = null;
    if (u.kind === 'hero') {
      const r = (u.radius || 0.6) + 0.45;
      const g = new THREE.RingGeometry(r - 0.13, r, 40); g.rotateX(-Math.PI / 2);
      ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: REL_COLOR[rel], transparent: true, opacity: 0.85, depthWrite: false }));
      ring.position.y = 0.09; ring.renderOrder = 2;
      root.add(ring);
    }
    // 低画质下没有实时阴影，用圆形暗斑代替
    if (this.quality === 'low' && u.mobile) {
      const g = new THREE.CircleGeometry((u.radius || 0.6) * 1.1, 16); g.rotateX(-Math.PI / 2);
      const blob = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false }));
      blob.position.y = 0.07;
      root.add(blob);
    }
    this.unitLayer.add(root);
    const v = {
      id: u.id, u, model, root, ring, rel,
      height: model.height || 2,
      pos: root.position,
      deadT: 0, goneT: -1,
      st: { t: Math.random() * 10, dt: 0, moving: false, moveSpeed: 0, act: null, actT: 0, actDur: 0, castSlot: 0, attackIdx: 0, dead: false, deadT: 0, stunned: false, airborne: false, channel: false, recalling: false },
    };
    root.position.set(u.x, 0, u.y);
    root.rotation.y = Math.PI / 2 - (u.facing || 0);
    return v;
  }

  // 单位外观逐帧更新
  updateUnits(alpha, dt) {
    const w = this.world;
    const seen = new Set();
    let playerBush = -1;
    for (const u of w.units) {
      seen.add(u.id);
      let v = this.views.get(u.id);
      if (!v) { v = this.createView(u); if (!v) continue; this.views.set(u.id, v); }
      v.u = u;
      // 可见性
      let vis = this.spectate || u.team === this.playerTeam || u.isStructure || u.kind === 'fountain' || u.visible[this.playerTeam];
      if (u.dead) {
        v.deadT += dt;
        if (u.kind === 'hero' && v.deadT > 2.6) vis = false;
      } else if (v.deadT > 0) {
        v.deadT = 0;  // 复活
      }
      v.root.visible = vis;
      if (!vis) continue;
      // 位置插值（瞬移时直接到位）
      let x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
      if (Math.abs(u.x - u.px) + Math.abs(u.y - u.py) > 8) { x = u.x; y = u.y; }
      let lift = 0;
      if (u.airborne) {
        const b = u.hasBuff('airborne');
        if (b && b.total) { const k = 1 - b.dur / b.total; lift = Math.max(0, 4 * k * (1 - k)) * 2.2; }
      } else if (u.forced && u.forced.leap) {
        const f = u.forced, d0 = Math.hypot(f.tx - f.sx, f.ty - f.sy) || 1;
        const k = Math.min(1, Math.max(0, 1 - Math.hypot(f.tx - x, f.ty - y) / d0));
        lift = Math.sin(k * Math.PI) * Math.min(3.5, d0 * 0.4);
      }
      v.root.position.set(x, lift, y);
      if (u.mobile) v.root.rotation.y = Math.PI / 2 - lerpAngle(u.pfacing ?? u.facing, u.facing, alpha);
      if (v.ring) {
        v.ring.visible = !u.dead;
        v.ring.position.y = 0.09 - lift;
      }
      // 动作状态
      const s = v.st, a = u.anim || {};
      s.t += dt; s.dt = dt;
      s.moving = !!u.moving && !u.dead;
      s.moveSpeed = u.stats ? u.stats.ms : 0;
      s.act = a.act || null;
      s.actT = (a.actT || 0) + (a.act ? alpha * (1 / 30) : 0);
      s.actDur = a.actDur || 0;
      s.castSlot = a.castSlot || 0;
      s.attackIdx = a.attackCount || 0;
      s.dead = !!u.dead; s.deadT = v.deadT;
      s.stunned = !!u.stunned; s.airborne = !!u.airborne;
      s.channel = !!u.channel; s.recalling = !!u.recalling;
      try { v.model.update(s); } catch (e) { if (!v.err) { v.err = true; console.error('模型动画出错', u.kind, e); } }
      if (u === this.player && !u.dead) playerBush = u.bush ?? -1;
    }
    // 已移除的单位：播完倒地再沉入地下
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      if (v.goneT < 0) { v.goneT = 0; v.st.dead = true; }
      v.goneT += dt;
      v.st.t += dt; v.st.dt = dt; v.st.deadT = v.goneT; v.st.moving = false; v.st.act = null;
      try { v.model.update(v.st); } catch (e) { /* 忽略 */ }
      if (v.goneT > 1.0) v.root.position.y -= dt * 1.2;
      if (v.goneT > 2.2) { this.unitLayer.remove(v.root); this.views.delete(id); }
    }
    // 玩家所在草丛半透明
    if (playerBush !== this._fadedBush) {
      if (this._fadedBush >= 0) this.terrain.setBushFaded(this._fadedBush, false);
      if (playerBush >= 0) this.terrain.setBushFaded(playerBush, true);
      this._fadedBush = playerBush;
    }
  }

  // —— 镜头 ——
  followTarget() {
    if (this.camLook) return this.camLook;
    if (this.free) return null;
    const u = this.world && this.world.unitById(this.followId);
    if (!u) return null;
    const v = this.views.get(u.id);
    return v ? { x: v.root.position.x, y: v.root.position.z } : { x: u.x, y: u.y };
  }

  panBy(dx, dy) {
    this.camTarget.x += dx; this.camTarget.z += dy;
    this.clampCam();
  }

  clampCam() {
    this.camTarget.x = Math.min(MAP_SIZE - 10, Math.max(10, this.camTarget.x));
    this.camTarget.z = Math.min(MAP_SIZE - 6, Math.max(14, this.camTarget.z));
  }

  updateCamera(dt) {
    const f = this.followTarget();
    if (f) {
      const k = this.camLook ? 1 : Math.min(1, dt * 8);
      this.camTarget.x += (f.x - this.camTarget.x) * k;
      this.camTarget.z += (f.y - this.camTarget.z) * k;
    }
    this.clampCam();
    const off = CAM_OFF.clone().multiplyScalar(this.zoom * (this.camera.fov > 50 ? 1.05 : 1));
    this.camera.position.copy(this.camTarget).add(off);
    const sh = this.fx.shakeAmt;
    if (sh > 0) {
      this.camera.position.x += (Math.random() - 0.5) * sh * 0.9;
      this.camera.position.y += (Math.random() - 0.5) * sh * 0.6;
      this.camera.position.z += (Math.random() - 0.5) * sh * 0.9;
    }
    this.camera.lookAt(this.camTarget.x, 0, this.camTarget.z - 1.5);
    // 阴影相机跟随镜头，按阴影贴图像素对齐以减少闪烁
    const snap = 84 / this.sun.shadow.mapSize.x;
    const tx = Math.round(this.camTarget.x / snap) * snap, tz = Math.round(this.camTarget.z / snap) * snap;
    this.sun.position.set(tx - 28, 60, tz + 18);
    this.sun.target.position.set(tx, 0, tz);
  }

  // —— 坐标换算 ——
  screenToGround(sx, sy) {
    const r = this.gl.domElement.getBoundingClientRect();
    const nx = ((sx - r.left) / r.width) * 2 - 1, ny = -((sy - r.top) / r.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    if (Math.abs(d.y) < 1e-5) return null;
    const t = -o.y / d.y;
    return { x: o.x + d.x * t, y: o.z + d.z * t };
  }

  worldToScreen(x, h, y) {
    const v = new THREE.Vector3(x, h, y).project(this.camera);
    const r = this.gl.domElement.getBoundingClientRect();
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height, behind: v.z > 1 };
  }

  /** 屏幕坐标附近的单位（按屏幕距离，身体中部为准）。filter(u) → bool */
  pickUnit(sx, sy, filter, maxPx = 46) {
    let best = null, bd = maxPx * maxPx;
    for (const v of this.views.values()) {
      const u = v.u;
      if (!v.root.visible || u.dead || v.goneT >= 0) continue;
      if (filter && !filter(u)) continue;
      const p = this.worldToScreen(v.root.position.x, v.root.position.y + v.height * 0.5, v.root.position.z);
      const rad = maxPx + (u.radius || 0.6) * 10;
      const d2 = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d2 < Math.min(bd, rad * rad) + (bd === maxPx * maxPx ? 0 : 0)) { bd = d2; best = u; }
    }
    return best;
  }

  // —— 每帧 ——
  render(alpha, dt, events) {
    this.time += dt;
    U.uTime.value = this.time;
    if (this.showcase) { this.renderShowcase(dt); return; }
    if (!this.world) { this.gl.render(this.scene, this.camera); return; }
    if (events && events.length) this.fx.handleEvents(events);
    this.updateUnits(alpha, dt);
    this.updateCamera(dt);
    if (!this.spectate) this.fog.update(this.world, this.playerTeam, dt);
    this.fx.update(dt, alpha);
    this.terrain.update(dt);
    this.indicators.update(dt);
    this.gl.render(this.scene, this.camera);
    // 血条
    const entries = [];
    for (const v of this.views.values()) {
      if (!v.root.visible || v.goneT >= 0) continue;
      const u = v.u;
      if (u.kind === 'fountain') continue;
      if (u.dead && u.kind !== 'tower') continue;
      if (u.untargetableBuff && u.kind === 'hero' && u.team !== this.playerTeam && !this.spectate) { /* 仍显示 */ }
      entries.push({ u, x: v.root.position.x, y: v.root.position.z, top: v.root.position.y + v.height + 0.35, rel: v.rel });
    }
    this.overlay.draw(this.camera, entries, dt);
  }

  floatText(x, y, h, text, style) { this.overlay.addFloat(x, h, y, text, style); }

  // —— 菜单里的英雄展示台 ——
  enterShowcase() {
    if (this.showcase) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d1424');
    scene.fog = new THREE.Fog('#0d1424', 12, 30);
    scene.add(new THREE.HemisphereLight('#c8dcff', '#202838', 1.4));
    const key = new THREE.DirectionalLight('#fff0dc', 2.6); key.position.set(3, 6, 5); scene.add(key);
    const rim = new THREE.DirectionalLight('#6fb6ff', 2.0); rim.position.set(-4, 3, -4); scene.add(rim);
    // 圆形展台
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.5, 40), new THREE.MeshPhongMaterial({ color: '#2a3550', shininess: 60 }));
    ped.position.y = -0.25; scene.add(ped);
    const ringG = new THREE.RingGeometry(2.25, 2.45, 64); ringG.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: '#6fd0ff', transparent: true, opacity: 0.8 }));
    ring.position.y = 0.01; scene.add(ring);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshLambertMaterial({ color: '#121a2c' }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.5; scene.add(floor);
    const cam = new THREE.PerspectiveCamera(30, this.w / this.h, 0.1, 100);
    this.showcase = { scene, cam, holder: new THREE.Group(), model: null, st: { t: 0, dt: 0, moving: false, act: null, actT: 0, actDur: 0, castSlot: 0, attackIdx: 0, dead: false, deadT: 0 }, actTimer: 2, ring, spin: 0, offsetX: 0 };
    scene.add(this.showcase.holder);
  }

  exitShowcase() { this.showcase = null; }

  /** 展台显示某个英雄；offsetX：模型在画面里的水平偏移（-1..1，给左右两侧的界面留位置） */
  setShowcaseHero(def, team = 1, offsetX = 0) {
    if (!this.showcase) this.enterShowcase();
    const sc = this.showcase;
    sc.offsetX = offsetX;
    sc.holder.clear();
    sc.model = null;
    if (!def) return;
    try {
      sc.model = this.models.createHeroModel(def, team);
      sc.holder.add(sc.model.root);
      const s = 2.2 / Math.max(1.6, sc.model.height || 2);
      sc.holder.scale.setScalar(s * 1.35);
      sc.holder.rotation.y = 0.5;
      sc.ring.material.color.set(def.colors.accent);
      sc.actTimer = 1.2;
    } catch (e) { console.error(e); }
  }

  renderShowcase(dt) {
    const sc = this.showcase;
    const aspect = this.w / this.h;
    sc.cam.aspect = aspect;
    sc.cam.fov = aspect < 1 ? 45 : 30;
    sc.cam.updateProjectionMatrix();
    // 模型放在画面中偏移位置
    const dist = 11;
    sc.cam.position.set(-sc.offsetX * 3.2 * Math.min(1.6, aspect), 3.4, dist);
    sc.cam.lookAt(-sc.offsetX * 3.2 * Math.min(1.6, aspect), 1.4, 0);
    sc.holder.rotation.y += dt * 0.35;
    if (sc.model) {
      const st = sc.st;
      st.t += dt; st.dt = dt;
      sc.actTimer -= dt;
      if (st.act) { st.actT += dt; if (st.actT >= st.actDur) st.act = null; }
      if (sc.actTimer <= 0) {
        sc.actTimer = 3 + Math.random() * 2;
        if (Math.random() < 0.5) { st.act = 'attack'; st.actDur = 0.6; st.attackIdx++; }
        else { st.act = 'cast'; st.actDur = 0.7; st.castSlot = (Math.random() * 3) | 0; }
        st.actT = 0;
      }
      try { sc.model.update(st); } catch (e) { /* 忽略 */ }
    }
    this.gl.render(sc.scene, sc.cam);
    const g = this.overlay.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.overlay.canvas.width, this.overlay.canvas.height);
  }

  /** 生成英雄头像（dataURL），用于界面 */
  makePortraits(heroes, size = 160) {
    const out = {};
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#e6f0ff', '#303848', 1.6));
    const key = new THREE.DirectionalLight('#fff4e0', 2.4); key.position.set(2, 4, 5); scene.add(key);
    const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
    const buf = new Uint8Array(size * size * 4);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const img = g.createImageData(size, size);
    const prevBg = scene.background;
    for (const def of heroes) {
      let m;
      try { m = this.models.createHeroModel(def, 1); } catch (e) { continue; }
      scene.add(m.root);
      try { m.update({ t: 0.3, dt: 0, moving: false, act: null, actT: 0, actDur: 0, castSlot: 0, attackIdx: 0, dead: false, deadT: 0 }); } catch (e) { /* 忽略 */ }
      const H = m.height || 2;
      m.root.rotation.y = 0.35;
      cam.position.set(0, H * 0.82, H * 1.25);
      cam.lookAt(0, H * 0.72, 0);
      scene.background = new THREE.Color(def.colors.primary).multiplyScalar(0.35);
      this.gl.setRenderTarget(rt);
      this.gl.render(scene, cam);
      this.gl.readRenderTargetPixels(rt, 0, 0, size, size, buf);
      this.gl.setRenderTarget(null);
      // 上下翻转
      for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      g.putImageData(img, 0, 0);
      out[def.id] = cv.toDataURL('image/png');
      scene.remove(m.root);
    }
    scene.background = prevBg;
    rt.dispose();
    return out;
  }
}
