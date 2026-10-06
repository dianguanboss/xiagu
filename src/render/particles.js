// 粒子系统：CPU 更新、GPU 点精灵绘制；叠加发光与普通混合两套
import * as THREE from 'three';
import { canvasTexture, makeDotCanvas } from './textures.js';

const VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
uniform float uScale;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D uTex;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float a = texture2D(uTex, gl_PointCoord).a * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}`;

class Pool {
  constructor(max, blending, tex, uScale) {
    this.max = max;
    this.n = 0;
    // 每个粒子：位置 速度 寿命 已过时间 尺寸起止 颜色起止 重力 阻力 透明度
    this.px = new Float32Array(max); this.py = new Float32Array(max); this.pz = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max); this.vz = new Float32Array(max);
    this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.size = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.alpha = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('aColor', this.col);
    g.setAttribute('aSize', this.size);
    g.setAttribute('aAlpha', this.alpha);
    g.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uScale },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = blending === THREE.AdditiveBlending ? 6 : 5;
  }

  spawn(o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.px[i] = o.x; this.py[i] = o.y; this.pz[i] = o.z;
    this.vx[i] = o.vx; this.vy[i] = o.vy; this.vz[i] = o.vz;
    this.life[i] = o.life; this.age[i] = 0;
    this.s0[i] = o.size; this.s1[i] = o.sizeEnd;
    this.c0[i * 3] = o.c0.r; this.c0[i * 3 + 1] = o.c0.g; this.c0[i * 3 + 2] = o.c0.b;
    this.c1[i * 3] = o.c1.r; this.c1[i * 3 + 1] = o.c1.g; this.c1[i * 3 + 2] = o.c1.b;
    this.grav[i] = o.gravity; this.drag[i] = o.drag; this.a0[i] = o.alpha;
  }

  update(dt) {
    let i = 0;
    const P = this.pos.array, C = this.col.array, S = this.size.array, A = this.alpha.array;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); continue; }
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= k; this.vz[i] *= k; this.vy[i] = this.vy[i] * k - this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.02) { this.py[i] = 0.02; this.vy[i] *= -0.3; }
      const t = this.age[i] / this.life[i];
      P[i * 3] = this.px[i]; P[i * 3 + 1] = this.py[i]; P[i * 3 + 2] = this.pz[i];
      for (let c = 0; c < 3; c++) C[i * 3 + c] = this.c0[i * 3 + c] + (this.c1[i * 3 + c] - this.c0[i * 3 + c]) * t;
      S[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      // 淡入 10%，之后线性淡出
      A[i] = this.a0[i] * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
      i++;
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.pos.needsUpdate = this.col.needsUpdate = this.size.needsUpdate = this.alpha.needsUpdate = true;
  }

  // 用最后一个粒子覆盖第 i 个
  kill(i) {
    const j = --this.n;
    if (i === j) return;
    this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j];
    this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
    this.life[i] = this.life[j]; this.age[i] = this.age[j];
    this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j];
    for (let c = 0; c < 3; c++) { this.c0[i * 3 + c] = this.c0[j * 3 + c]; this.c1[i * 3 + c] = this.c1[j * 3 + c]; }
    this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.a0[i] = this.a0[j];
  }

  clear() { this.n = 0; this.points.geometry.setDrawRange(0, 0); }
}

const _c0 = new THREE.Color(), _c1 = new THREE.Color();
const tmp = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 1, sizeEnd: 1, c0: _c0, c1: _c1, gravity: 0, drag: 0, alpha: 1 };

export class Particles {
  constructor(scene, quality = 'medium') {
    const max = quality === 'low' ? 1500 : quality === 'high' ? 6000 : 3500;
    this.mult = quality === 'low' ? 0.5 : quality === 'high' ? 1.2 : 1;
    const tex = canvasTexture(makeDotCanvas(64), { srgb: false });
    this.uScale = { value: 400 };
    this.add = new Pool(max, THREE.AdditiveBlending, tex, this.uScale);
    this.norm = new Pool(Math.floor(max / 2), THREE.NormalBlending, tex, this.uScale);
    scene.add(this.add.points, this.norm.points);
  }

  // 每次窗口尺寸或镜头视角变化时调用
  setViewport(heightPx, fovDeg) {
    this.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  /**
   * 发射一团粒子（模拟坐标 x,y；高度 z）
   * o: { x, y, h=0.5, count=10, color, color2, speed=3, up=0.5(向上偏置 0..1), spread=1(水平), life=0.6, lifeVar=0.3,
   *      size=0.6, sizeEnd, gravity=0, drag=1.5, radius=0, alpha=1, additive=true, dir:{x,y} 方向性喷射, vx,vy 基础速度 }
   */
  burst(o) {
    const pool = o.additive === false ? this.norm : this.add;
    const n = Math.max(1, Math.round((o.count ?? 10) * this.mult));
    _c0.set(o.color || '#ffffff');
    _c1.set(o.color2 || o.color || '#ffffff');
    const speed = o.speed ?? 3, up = o.up ?? 0.5, spread = o.spread ?? 1, life = o.life ?? 0.6, lv = o.lifeVar ?? 0.3;
    const size = o.size ?? 0.6, sizeEnd = o.sizeEnd ?? size * 0.3, rad = o.radius || 0;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, rr = rad * Math.sqrt(Math.random());
      tmp.x = o.x + Math.cos(a) * rr;
      tmp.z = o.y + Math.sin(a) * rr;
      tmp.y = (o.h ?? 0.5) + (o.hVar ? Math.random() * o.hVar : 0);
      const b = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random() * 0.6);
      let dx = Math.cos(b), dz = Math.sin(b);
      if (o.dir) { dx = o.dir.x + (Math.random() - 0.5) * spread; dz = o.dir.y + (Math.random() - 0.5) * spread; }
      else { dx *= spread; dz *= spread; }
      if (o.outward && rr > 0) { dx = Math.cos(a); dz = Math.sin(a); }
      tmp.vx = dx * sp * (1 - up) + (o.vx || 0);
      tmp.vz = dz * sp * (1 - up) + (o.vy || 0);
      tmp.vy = sp * up * (0.6 + Math.random() * 0.8) + (o.vh || 0);
      tmp.life = life * (1 - lv / 2 + Math.random() * lv);
      tmp.size = size * (0.7 + Math.random() * 0.6);
      tmp.sizeEnd = sizeEnd;
      tmp.gravity = o.gravity || 0;
      tmp.drag = o.drag ?? 1.5;
      tmp.alpha = o.alpha ?? 1;
      pool.spawn(tmp);
    }
  }

  // 单个粒子（拖尾等）
  one(x, y, h, color, size, life, o = {}) {
    const pool = o.additive === false ? this.norm : this.add;
    _c0.set(color); _c1.set(o.color2 || color);
    tmp.x = x; tmp.z = y; tmp.y = h;
    tmp.vx = o.vx || 0; tmp.vz = o.vy || 0; tmp.vy = o.vh || 0;
    tmp.life = life; tmp.size = size; tmp.sizeEnd = o.sizeEnd ?? size * 0.2;
    tmp.gravity = o.gravity || 0; tmp.drag = o.drag ?? 0; tmp.alpha = o.alpha ?? 1;
    pool.spawn(tmp);
  }

  update(dt) { this.add.update(dt); this.norm.update(dt); }
  clear() { this.add.clear(); this.norm.clear(); }
}
