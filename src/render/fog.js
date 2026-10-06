// 战争迷雾：按己方单位视野算出 100×100 的可见度图，地形材质据此变暗；小地图也用它
import * as THREE from 'three';
import { MAP_SIZE } from '../config.js';
import { U } from './shared.js';

export const FOW_N = 100;
const CELL = MAP_SIZE / FOW_N;

export class FogOfWar {
  constructor() {
    const n = FOW_N * FOW_N;
    this.data = new Uint8Array(n);
    this.target = new Float32Array(n);
    this.cur = new Float32Array(n);
    this.tex = new THREE.DataTexture(this.data, FOW_N, FOW_N, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.needsUpdate = true;
    U.uFow.value = this.tex;
    this.timer = 0;
    this.enabled = true;
    this.first = true;
    this.setEnabled(true);
  }

  setEnabled(on) {
    this.enabled = on;
    U.uFowOn.value = on ? 1 : 0;
  }

  // 在可见度图上，(x,y) 是否处于己方视野内
  visibleAt(x, y) {
    if (!this.enabled) return true;
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= FOW_N || cy >= FOW_N) return false;
    return this.target[cy * FOW_N + cx] > 0.5;
  }

  compute(world, team) {
    const T = this.target;
    T.fill(0);
    for (const u of world.units) {
      if (u.dead || u.team !== team || !(u.sight > 0)) continue;
      const r = u.sight, r2 = (r + CELL) * (r + CELL);
      const x0 = Math.max(0, Math.floor((u.x - r) / CELL) - 1), x1 = Math.min(FOW_N - 1, Math.ceil((u.x + r) / CELL) + 1);
      const y0 = Math.max(0, Math.floor((u.y - r) / CELL) - 1), y1 = Math.min(FOW_N - 1, Math.ceil((u.y + r) / CELL) + 1);
      for (let cy = y0; cy <= y1; cy++) {
        const dy = (cy + 0.5) * CELL - u.y;
        for (let cx = x0; cx <= x1; cx++) {
          const dx = (cx + 0.5) * CELL - u.x;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          // 边缘 2.5 米柔和过渡
          const v = Math.min(1, Math.max(0, (r - Math.sqrt(d2)) / 2.5 + 0.5));
          const i = cy * FOW_N + cx;
          if (v > T[i]) T[i] = v;
        }
      }
    }
  }

  update(world, team, dt) {
    if (!this.enabled) return;
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = 0.1; this.compute(world, team); }
    const k = this.first ? 1 : Math.min(1, dt * 7);
    this.first = false;
    const C = this.cur, T = this.target, D = this.data;
    for (let i = 0; i < C.length; i++) {
      C[i] += (T[i] - C[i]) * k;
      D[i] = (C[i] * 255) | 0;
    }
    this.tex.needsUpdate = true;
  }
}
