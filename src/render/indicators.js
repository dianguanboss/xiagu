// 技能指示器：射程圈、方向条、落点圈、目标高亮；以及点地移动的标记
import * as THREE from 'three';
import { canvasTexture, makeRingCanvas } from './textures.js';

function arrowCanvas() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 512, 0, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0.10)');
  grd.addColorStop(1, 'rgba(255,255,255,0.45)');
  g.fillStyle = grd;
  g.fillRect(8, 0, 112, 512);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.fillRect(0, 0, 8, 512); g.fillRect(120, 0, 8, 512);
  // 箭头
  g.beginPath(); g.moveTo(64, 0); g.lineTo(124, 70); g.lineTo(104, 70); g.lineTo(64, 26); g.lineTo(24, 70); g.lineTo(4, 70); g.closePath(); g.fill();
  return c;
}

function discCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0.18)');
  grd.addColorStop(0.85, 'rgba(255,255,255,0.4)');
  grd.addColorStop(0.92, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  return c;
}

const OK = new THREE.Color('#7fd0ff'), BAD = new THREE.Color('#ff4040'), TGT = new THREE.Color('#ffd23f');

export class Indicators {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.name = 'indicators';
    parent.add(this.group);
    const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
    // 方向条：贴图沿 v 方向，平面原点放在底边中点
    const rect = new THREE.PlaneGeometry(1, 1); rect.translate(0, 0.5, 0); rect.rotateX(-Math.PI / 2);
    const mat = (tex) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, color: OK.clone() });
    const ringTex = canvasTexture(makeRingCanvas(256), { srgb: false });
    const discTex = canvasTexture(discCanvas(), { srgb: false });
    const arrowTex = canvasTexture(arrowCanvas(), { srgb: false });
    this.range = new THREE.Mesh(plane, mat(ringTex));
    this.range.material.opacity = 0.6;
    this.rect = new THREE.Mesh(rect, mat(arrowTex));
    this.area = new THREE.Mesh(plane, mat(discTex));
    this.target = new THREE.Mesh(plane, mat(ringTex));
    this.attackRange = new THREE.Mesh(plane, mat(ringTex));
    this.attackRange.material.opacity = 0.35;
    for (const m of [this.range, this.rect, this.area, this.target, this.attackRange]) {
      m.renderOrder = 20; m.visible = false; m.position.y = 0.2; this.group.add(m);
    }
    // 点地标记
    this.markers = [];
    this.markerTex = ringTex;
    this.plane = plane;
    this.t = 0;
  }

  /**
   * spec: { kind:'dir'|'point'|'unit'|'self', ox, oy, ax, ay, range, width, radius, target, cancel }
   */
  show(spec) {
    const col = spec.cancel ? BAD : OK;
    const R = spec.range || 0;
    this.range.visible = R > 0;
    if (R > 0) {
      this.range.position.set(spec.ox, 0.2, spec.oy);
      this.range.scale.set(R * 2, 1, R * 2);
      this.range.material.color.copy(col);
    }
    this.rect.visible = spec.kind === 'dir';
    this.area.visible = spec.kind === 'point' || spec.kind === 'self';
    this.target.visible = false;
    if (spec.kind === 'dir') {
      const a = Math.atan2(spec.ay - spec.oy, spec.ax - spec.ox);
      this.rect.position.set(spec.ox, 0.21, spec.oy);
      // 几何体沿 -Z（rotateX 后的 +Y→-Z）延伸，转到瞄准方向
      this.rect.rotation.y = -a - Math.PI / 2;
      this.rect.scale.set(Math.max(0.8, spec.width || 1), 1, Math.max(1, R));
      this.rect.material.color.copy(col);
    } else if (spec.kind === 'point') {
      const r = spec.radius || 2;
      this.area.position.set(spec.ax, 0.22, spec.ay);
      this.area.scale.set(r * 2, 1, r * 2);
      this.area.material.color.copy(col);
    } else if (spec.kind === 'self') {
      const r = spec.radius || R || 3;
      this.area.position.set(spec.ox, 0.22, spec.oy);
      this.area.scale.set(r * 2, 1, r * 2);
      this.area.material.color.copy(col);
      this.range.visible = false;
    }
    if (spec.target) {
      this.target.visible = true;
      const r = (spec.target.radius || 0.8) + 0.8;
      this.target.position.set(spec.target.x, 0.23, spec.target.y);
      this.target.scale.set(r * 2, 1, r * 2);
      this.target.material.color.copy(spec.cancel ? BAD : TGT);
    }
  }

  hide() {
    this.range.visible = this.rect.visible = this.area.visible = this.target.visible = false;
  }

  showAttackRange(x, y, r) {
    if (!r) { this.attackRange.visible = false; return; }
    this.attackRange.visible = true;
    this.attackRange.position.set(x, 0.19, y);
    this.attackRange.scale.set(r * 2, 1, r * 2);
  }

  // 点地移动 / 攻击的标记
  clickMarker(x, y, attack = false) {
    const m = new THREE.Mesh(this.plane, new THREE.MeshBasicMaterial({ map: this.markerTex, transparent: true, depthWrite: false, color: attack ? '#ff5a4a' : '#5dff8f' }));
    m.position.set(x, 0.24, y);
    m.renderOrder = 21;
    this.group.add(m);
    this.markers.push({ m, t: 0 });
  }

  update(dt) {
    this.t += dt;
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 8);
    this.target.material.opacity = pulse;
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const k = (this.markers[i].t += dt) / 0.45;
      const m = this.markers[i].m;
      if (k >= 1) { this.group.remove(m); m.material.dispose(); this.markers.splice(i, 1); continue; }
      const s = 2.4 * (1 - k * 0.7);
      m.scale.set(s, 1, s);
      m.material.opacity = 1 - k;
    }
  }
}
