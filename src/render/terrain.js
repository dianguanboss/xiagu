// 地形：地面、石墙、树林、草丛、河水
import * as THREE from 'three';
import { WALLS, BUSHES, MAP_BORDER, FOUNTAINS, RIVER_HALF_WIDTH } from '../data/map.js';
import { MAP_SIZE } from '../config.js';
import { RNG } from '../util/rng.js';
import { pointInPoly } from '../util/math.js';
import { canvasTexture, makeGroundCanvas, makeDetailCanvas, makeWaterCanvas } from './textures.js';
import { patchMaterial, mergeGeometries, hash3 } from './shared.js';

const S = MAP_SIZE;

// —— 石墙：把多边形边细分并抖动，挤出成低多边形岩石 ——
function subdividePoly(poly, seed) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    const L = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(L / 1.8));
    const nx = -(by - ay) / L, ny = (bx - ax) / L;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const j = k === 0 ? 0 : (hash3(seed, i, k) - 0.5) * 0.8;
      out.push([ax + (bx - ax) * t + nx * j, ay + (by - ay) * t + ny * j]);
    }
  }
  return out;
}

function wallGeometry(poly, idx) {
  const pts = subdividePoly(poly, idx + 11);
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, -y)));
  const h = 2.6 + hash3(idx, 3, 7) * 1.6;
  let geo = new THREE.ExtrudeGeometry(shape, {
    depth: h, steps: 2, curveSegments: 1,
    bevelEnabled: true, bevelThickness: 0.9, bevelSize: 0.75, bevelSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);
  if (geo.index) geo = geo.toNonIndexed();
  const p = geo.attributes.position;
  // 按位置取噪声，重合顶点位移相同，不会裂缝
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const kx = Math.round(x * 8), ky = Math.round(y * 8), kz = Math.round(z * 8);
    if (y > 0.2) {
      const up = y > h ? 0.7 : 0.35;
      p.setXYZ(i,
        x + (hash3(kx, ky, kz) - 0.5) * 0.7,
        y + (hash3(kz, kx, ky + 5) - 0.5) * up,
        z + (hash3(ky + 9, kz, kx) - 0.5) * 0.7);
    }
  }
  geo.computeVertexNormals();
  // 顶面青苔、侧面岩石，按三角形上色（平面着色）
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const moss = [new THREE.Color('#5f8f3a'), new THREE.Color('#6c9c43'), new THREE.Color('#527d33')];
  const rock = [new THREE.Color('#8a8172'), new THREE.Color('#7a7264'), new THREE.Color('#968c7a'), new THREE.Color('#6e675b')];
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    const cy = (a.y + b.y + c.y) / 3;
    const r = hash3(Math.round(a.x * 3), Math.round(a.z * 3), i);
    if (n.y > 0.55 && cy > h * 0.6) tmp.copy(moss[(r * 3) | 0]);
    else {
      tmp.copy(rock[(r * 4) | 0]);
      tmp.multiplyScalar(0.62 + 0.38 * Math.min(1, Math.max(0, cy / h)));
    }
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = tmp.r; col[(i + k) * 3 + 1] = tmp.g; col[(i + k) * 3 + 2] = tmp.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return { geo, h };
}

// —— 树（树干 + 两层树冠）——
function treeGeometries() {
  const trunk = new THREE.CylinderGeometry(0.22, 0.34, 1.5, 6).toNonIndexed();
  trunk.translate(0, 0.75, 0);
  const c1 = new THREE.ConeGeometry(1.5, 2.6, 7).toNonIndexed(); c1.translate(0, 2.4, 0);
  const c2 = new THREE.ConeGeometry(1.1, 2.0, 7).toNonIndexed(); c2.translate(0, 3.5, 0);
  const c3 = new THREE.ConeGeometry(0.7, 1.4, 6).toNonIndexed(); c3.translate(0, 4.4, 0);
  return { trunk, crown: mergeGeometries([c1, c2, c3]) };
}
function roundTreeGeometry() {
  const g = new THREE.IcosahedronGeometry(1.5, 0); // 本身就是非索引几何体
  g.translate(0, 2.7, 0);
  const g2 = new THREE.IcosahedronGeometry(1.0, 0);
  g2.translate(0.6, 3.6, 0.3);
  return mergeGeometries([g, g2]);
}

// —— 草丛：一簇细长叶片 ——
function tuftGeometry() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.ConeGeometry(0.16, 1.25 + (i % 3) * 0.2, 3).toNonIndexed();
    b.translate(0, 0.6, 0);
    b.rotateZ((i % 2 ? 1 : -1) * (0.18 + (i % 3) * 0.08));
    b.rotateY((i / 6) * Math.PI * 2);
    b.translate(Math.cos(i) * 0.25, 0, Math.sin(i) * 0.25);
    parts.push(b);
  }
  return mergeGeometries(parts);
}

function riverShape() {
  // 沿 y=x 的带子，两岸略有起伏，两端圆头
  const rng = new RNG(5);
  const s0 = 18, s1 = 182, hw = RIVER_HALF_WIDTH + 0.6;
  const left = [], right = [];
  const ux = Math.SQRT1_2, uy = Math.SQRT1_2, nx = -Math.SQRT1_2, ny = Math.SQRT1_2;
  const len = (s1 - s0) * Math.SQRT2;
  const N = 60;
  for (let i = 0; i <= N; i++) {
    const d = (i / N) * len;
    const cx = s0 + ux * d, cy = s0 + uy * d;
    const wl = hw + Math.sin(i * 0.9) * 0.5 + rng.range(-0.3, 0.3);
    const wr = hw + Math.cos(i * 0.7) * 0.5 + rng.range(-0.3, 0.3);
    left.push([cx + nx * wl, cy + ny * wl]);
    right.push([cx - nx * wr, cy - ny * wr]);
  }
  // 端头半圆：从 +n 一侧顺时针扫到 -n 一侧
  const cap = (cx, cy, a0) => { const out = []; for (let k = 1; k < 8; k++) { const a = a0 - (k / 8) * Math.PI; out.push([cx + Math.cos(a) * hw, cy + Math.sin(a) * hw]); } return out; };
  const e1 = s0 + ux * len, e1y = s0 + uy * len;
  return [...left, ...cap(e1, e1y, Math.PI * 0.75), ...right.reverse(), ...cap(s0, s0, -Math.PI * 0.25)];
}

/**
 * quality: 'low' | 'medium' | 'high'
 * 返回 { group, bushes: Map(id→{mesh, mat}), update(dt, time), setBushFaded(id, bool) }
 */
export function buildTerrain(quality = 'medium') {
  const Q = { low: 0, medium: 1, high: 2 }[quality] ?? 1;
  const group = new THREE.Group();
  group.name = 'terrain';
  const rng = new RNG(424242);
  const detail = canvasTexture(makeDetailCanvas(256), { srgb: false });
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping;

  // 地面
  const groundTex = canvasTexture(makeGroundCanvas(Q === 0 ? 1024 : 2048));
  const groundMat = patchMaterial(new THREE.MeshLambertMaterial({ map: groundTex }), { detail, detailScale: 1 / 7 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(S, S), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(S / 2, 0, S / 2);
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  // 地图外圈的森林地面
  const outerMat = patchMaterial(new THREE.MeshLambertMaterial({ color: '#2f4f26' }), { detail, detailScale: 1 / 9 });
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(S + 160, S + 160), outerMat);
  outer.rotation.x = -Math.PI / 2;
  outer.position.set(S / 2, -0.06, S / 2);
  outer.receiveShadow = true;
  group.add(outer);

  // 石墙
  const wallGeos = [];
  const wallInfo = [];
  WALLS.forEach((w, i) => { const { geo, h } = wallGeometry(w, i); wallGeos.push(geo); wallInfo.push({ poly: w, h }); });
  const wallMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { detail, detailScale: 1 / 3 });
  const walls = new THREE.Mesh(mergeGeometries(wallGeos), wallMat);
  walls.castShadow = Q > 0; walls.receiveShadow = true;
  walls.name = 'walls';
  group.add(walls);

  // 树：外圈若干排 + 墙顶几棵
  const trees = [];
  const nearFountain = (x, y) => Object.values(FOUNTAINS).some((f) => Math.hypot(f.x - x, f.y - y) < 13);
  const rows = Q === 0 ? [1.6, -2, -6, -11, -17] : Q === 1 ? [1.6, -1.5, -4.5, -8, -12, -17, -23] : [1.6, -0.8, -3.4, -6.2, -9.2, -12.5, -16, -20, -25];
  const step = Q === 0 ? 3.2 : 2.5;
  rows.forEach((d, ri) => {
    for (let s = -30; s <= S + 30; s += step) {
      const jit = () => rng.range(-0.9, 0.9);
      const cands = [[s + jit(), d + jit()], [s + jit(), S - d + jit()], [d + jit(), s + jit()], [S - d + jit(), s + jit()]];
      for (const [x, y] of cands) {
        if (d > 0 && nearFountain(x, y)) continue;
        if (d > 0 && (x < -1 || y < -1 || x > S + 1 || y > S + 1)) continue;
        trees.push({ x, y, base: 0, s: rng.range(0.85, 1.35) * (ri === 0 ? 0.8 : 1), round: rng.chance(0.28) });
      }
    }
  });
  for (const w of wallInfo) {
    let cx = 0, cy = 0;
    for (const [x, y] of w.poly) { cx += x; cy += y; }
    cx /= w.poly.length; cy /= w.poly.length;
    const k = 1 + (rng.next() < 0.6 ? 1 : 0);
    for (let i = 0; i < k; i++) {
      const x = cx + rng.range(-1.6, 1.6), y = cy + rng.range(-1.6, 1.6);
      if (pointInPoly(x, y, w.poly)) trees.push({ x, y, base: w.h + 0.6, s: rng.range(0.6, 0.85), round: rng.chance(0.5) });
    }
  }
  const tg = treeGeometries();
  const roundGeo = roundTreeGeometry();
  const trunkMat = patchMaterial(new THREE.MeshLambertMaterial({ color: '#6b4a2e', flatShading: true }));
  const crownMat = patchMaterial(new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), { sway: 0.025 });
  const coneTrees = trees.filter((t) => !t.round), roundTrees = trees.filter((t) => t.round);
  const trunkMesh = new THREE.InstancedMesh(tg.trunk, trunkMat, trees.length);
  const crownMesh = new THREE.InstancedMesh(tg.crown, crownMat, coneTrees.length);
  const roundMesh = new THREE.InstancedMesh(roundGeo, crownMat, roundTrees.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const greens = ['#2f6b2c', '#3b7a33', '#28602a', '#47853a', '#356f30', '#4f8c3c'].map((c) => new THREE.Color(c));
  const autumn = ['#8a8a2e', '#9b6b2a'].map((c) => new THREE.Color(c));
  let ci = 0, ri2 = 0;
  trees.forEach((t, i) => {
    q.setFromAxisAngle(up, rng.next() * Math.PI * 2);
    v.set(t.x, t.base, t.y);
    sc.set(t.s, t.s * rng.range(0.9, 1.15), t.s);
    m4.compose(v, q, sc);
    trunkMesh.setMatrixAt(i, m4);
    const col = (rng.chance(0.06) ? autumn : greens)[(rng.next() * (rng.chance(0.06) ? 2 : 6)) | 0] || greens[0];
    if (t.round) { roundMesh.setMatrixAt(ri2, m4); roundMesh.setColorAt(ri2++, col); }
    else { crownMesh.setMatrixAt(ci, m4); crownMesh.setColorAt(ci++, col); }
  });
  for (const m of [trunkMesh, crownMesh, roundMesh]) {
    m.castShadow = Q > 1; m.receiveShadow = false;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    group.add(m);
  }

  // 河边小石头与花
  const pebbleGeo = new THREE.DodecahedronGeometry(0.35, 0);
  const pebbleMat = patchMaterial(new THREE.MeshLambertMaterial({ color: '#9a9284', flatShading: true }));
  const pebbleN = Q === 0 ? 60 : 160;
  const pebbles = new THREE.InstancedMesh(pebbleGeo, pebbleMat, pebbleN);
  for (let i = 0; i < pebbleN; i++) {
    const t = rng.range(20, 180), side = rng.chance(0.5) ? 1 : -1, off = side * rng.range(RIVER_HALF_WIDTH + 0.2, RIVER_HALF_WIDTH + 2.2);
    const x = t - off * Math.SQRT1_2, y = t + off * Math.SQRT1_2;
    q.setFromAxisAngle(up, rng.next() * 6);
    const s = rng.range(0.6, 1.8);
    m4.compose(v.set(x, 0.05, y), q, sc.set(s, s * 0.6, s));
    pebbles.setMatrixAt(i, m4);
  }
  pebbles.receiveShadow = true;
  group.add(pebbles);

  const flowerN = Q === 0 ? 0 : Q === 1 ? 500 : 900;
  if (flowerN) {
    const flowerGeo = new THREE.OctahedronGeometry(0.16, 0);
    flowerGeo.translate(0, 0.18, 0);
    const flowerMat = patchMaterial(new THREE.MeshLambertMaterial({ color: '#ffffff' }));
    const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerN);
    const fcols = ['#f4e36a', '#ffffff', '#f49ac1', '#b9a3ff', '#ff9f5a'].map((c) => new THREE.Color(c));
    let n = 0, tries = 0;
    while (n < flowerN && tries < flowerN * 20) {
      tries++;
      const cx = rng.range(8, 192), cy = rng.range(8, 192);
      // 只放在野区：离三条路和河道都有距离
      const dMid = Math.abs(cx + cy - 200) / Math.SQRT2;
      const dRiver = Math.abs(cx - cy) / Math.SQRT2;
      const nearLane = cx < 26 || cy < 26 || cx > 174 || cy > 174 || dMid < 9;
      if (nearLane || dRiver < 11) continue;
      if (WALLS.some((w) => pointInPoly(cx, cy, w))) continue;
      const k = 2 + ((rng.next() * 4) | 0);
      const col = fcols[(rng.next() * fcols.length) | 0];
      for (let j = 0; j < k && n < flowerN; j++) {
        q.setFromAxisAngle(up, rng.next() * 6);
        m4.compose(v.set(cx + rng.range(-0.8, 0.8), 0, cy + rng.range(-0.8, 0.8)), q, sc.set(1, 1, 1));
        flowers.setMatrixAt(n, m4); flowers.setColorAt(n, col); n++;
      }
    }
    flowers.count = n;
    flowers.instanceColor.needsUpdate = true;
    group.add(flowers);
  }

  // 草丛：每丛一个实例网格，玩家进入时变半透明
  const tuft = tuftGeometry();
  const bushes = new Map();
  const bushGreens = ['#3f8c34', '#4a9a3a', '#357a2c', '#5aa847'].map((c) => new THREE.Color(c));
  for (const b of BUSHES) {
    const n = Math.max(10, Math.round(b.r * b.r * (Q === 0 ? 2.0 : 3.2)));
    const mat = patchMaterial(new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, transparent: true, opacity: 1 }), { sway: 0.05 });
    const mesh = new THREE.InstancedMesh(tuft, mat, n);
    const brng = new RNG(1000 + b.id);
    for (let i = 0; i < n; i++) {
      const a = brng.next() * Math.PI * 2, r = Math.sqrt(brng.next()) * (b.r - 0.2);
      q.setFromAxisAngle(up, brng.next() * 6);
      const s = brng.range(0.85, 1.3) * (1 - (r / b.r) * 0.25);
      m4.compose(v.set(b.x + Math.cos(a) * r, 0, b.y + Math.sin(a) * r), q, sc.set(s, s * brng.range(0.9, 1.25), s));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, bushGreens[(brng.next() * 4) | 0]);
    }
    mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = Q > 1;
    mesh.computeBoundingSphere();
    mesh.renderOrder = 2;
    group.add(mesh);
    bushes.set(b.id, { mesh, mat, faded: false, cur: 1 });
  }

  // 河水
  const waterTex = canvasTexture(makeWaterCanvas(256), { srgb: true });
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(1 / 13, 1 / 13);
  const shapePts = riverShape();
  const wshape = new THREE.Shape(shapePts.map(([x, y]) => new THREE.Vector2(x, -y)));
  const wgeo = new THREE.ShapeGeometry(wshape, 1);
  wgeo.rotateX(-Math.PI / 2);
  const waterMat = patchMaterial(new THREE.MeshPhongMaterial({
    color: '#56b6e6', map: waterTex, transparent: true, opacity: 0.62,
    shininess: 90, specular: new THREE.Color('#d8f3ff'), depthWrite: false,
  }), { fogDim: 0.5 });
  const water = new THREE.Mesh(wgeo, waterMat);
  water.position.y = 0.08;
  water.receiveShadow = true;
  water.renderOrder = 1;
  group.add(water);

  let tAcc = 0;
  return {
    group,
    bushes,
    walls,
    setBushFaded(id, faded) { const b = bushes.get(id); if (b) b.faded = faded; },
    update(dt) {
      tAcc += dt;
      waterTex.offset.set((tAcc * 0.012) % 1, (tAcc * -0.02) % 1);
      for (const b of bushes.values()) {
        const target = b.faded ? 0.42 : 1;
        if (b.cur !== target) {
          b.cur += Math.sign(target - b.cur) * Math.min(Math.abs(target - b.cur), dt * 3);
          b.mat.opacity = b.cur;
          b.mat.depthWrite = b.cur > 0.99;
        }
      }
    },
  };
}
