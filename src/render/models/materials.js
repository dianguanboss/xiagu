// 模型公用：材质缓存、几何体缓存、合并几何、建网格的小工具。
// 所有模型共用这里的缓存，同一颜色/参数只建一次。
import * as THREE from 'three';

const _c = new THREE.Color();
const hex = (c) => _c.set(c).getHexString();

// 队伍主色（1 蓝方，2 红方）
export const TEAM_COLORS = { 1: '#3b8cff', 2: '#ff4a4a' };
export const teamColor = (team) => TEAM_COLORS[team] || '#c9c9c9';

// ---------- 颜色工具（只在建模时用） ----------
// 按系数调亮/调暗：k>1 变亮，k<1 变暗
export function shade(color, k) {
  _c.set(color);
  if (k >= 1) _c.lerp(new THREE.Color(1, 1, 1), Math.min(1, k - 1));
  else _c.multiplyScalar(k);
  return '#' + _c.getHexString();
}
// 两色混合
export function mix(a, b, k) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return '#' + ca.lerp(cb, k).getHexString();
}

// ---------- 材质缓存 ----------
const mats = new Map();

// 普通实体：Lambert + 平直着色；emi>0 时带同色自发光
export function matL(color, emi = 0) {
  const key = 'L' + hex(color) + '|' + emi;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    if (emi > 0) { m.emissive.set(color); m.emissiveIntensity = emi; }
    mats.set(key, m);
  }
  return m;
}

// 金属/宝石：Standard，可选自发光
export function matS(color, metal = 0.5, rough = 0.5, emi = 0) {
  const key = 'S' + hex(color) + '|' + metal + '|' + rough + '|' + emi;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, flatShading: true });
    if (emi > 0) { m.emissive.set(color); m.emissiveIntensity = emi; }
    mats.set(key, m);
  }
  return m;
}

// 发光件：不受光照，可半透明
export function matGlow(color, opacity = 1) {
  const key = 'G' + hex(color) + '|' + opacity;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    if (opacity < 1) { m.transparent = true; m.opacity = opacity; m.depthWrite = false; }
    mats.set(key, m);
  }
  return m;
}

// ---------- 几何体缓存 ----------
const geos = new Map();
function cached(key, make) {
  let g = geos.get(key);
  if (!g) { g = make(); geos.set(key, g); }
  return g;
}

const TAU = Math.PI * 2;
export const G = {
  box: (w, h, d) => cached(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  // 圆柱：上半径、下半径、高、分段
  cyl: (rt, rb, h, s = 8) => cached(`cyl${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)),
  cone: (r, h, s = 6) => cached(`cone${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s)),
  sph: (r, ws = 8, hs = 6) => cached(`sph${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)),
  ico: (r, d = 0) => cached(`ico${r},${d}`, () => new THREE.IcosahedronGeometry(r, d)),
  oct: (r) => cached(`oct${r}`, () => new THREE.OctahedronGeometry(r, 0)),
  dod: (r) => cached(`dod${r}`, () => new THREE.DodecahedronGeometry(r, 0)),
  tet: (r) => cached(`tet${r}`, () => new THREE.TetrahedronGeometry(r, 0)),
  tor: (r, tube, rs = 6, ts = 12, arc = TAU) => cached(`tor${r},${tube},${rs},${ts},${arc}`,
    () => new THREE.TorusGeometry(r, tube, rs, ts, arc)),
  // 旋转体：pts 为 [[半径, 高], ...]
  lathe: (key, pts, s = 10) => cached('lathe' + key, () =>
    new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), s)),
  // 圆环面片（地面光圈）
  ring: (r0, r1, s = 32) => cached(`ring${r0},${r1},${s}`, () => {
    const g = new THREE.RingGeometry(r0, r1, s);
    g.rotateX(-Math.PI / 2);
    return g;
  }),
  // 平面多边形挤出薄片（翅膀等）：pts 为 [[x,y], ...]，挤出方向 Z
  shape: (key, pts, depth = 0.05) => cached('shape' + key, () => {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return g;
  }),
  circle: (r, s = 32) => cached(`circle${r},${s}`, () => {
    const g = new THREE.CircleGeometry(r, s);
    g.rotateX(-Math.PI / 2);
    return g;
  }),
};

// ---------- 合并几何 ----------
// parts: [[geo, [x,y,z], [rx,ry,rz], [sx,sy,sz]], ...]，合成一个几何（只保留位置和法线）
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function merged(key, parts) {
  return cached('merge:' + key, () => {
    const pos = [], nor = [];
    for (const part of parts) {
      const [geo, p = [0, 0, 0], r, s = [1, 1, 1]] = part;
      const g = (geo.index ? geo.toNonIndexed() : geo.clone());
      if (Array.isArray(r)) _e.set(r[0], r[1], r[2]); else _e.set(0, 0, 0);
      _q.setFromEuler(_e);
      _p.set(p[0], p[1], p[2]);
      if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
      _m4.compose(_p, _q, _s);
      g.applyMatrix4(_m4);
      pos.push(g.attributes.position.array);
      nor.push(g.attributes.normal.array);
      g.dispose();
    }
    const cat = (arrs) => {
      let n = 0;
      for (const a of arrs) n += a.length;
      const out = new Float32Array(n);
      let o = 0;
      for (const a of arrs) { out.set(a, o); o += a.length; }
      return out;
    };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(cat(pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(cat(nor), 3));
    g.computeBoundingSphere();
    return g;
  });
}

// ---------- 建节点 ----------
export function grp(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
}

// 建网格：p 位置、r 旋转、s 缩放（数字或数组），默认投影
export function add(parent, geo, mat, p, r, s) {
  const m = new THREE.Mesh(geo, mat);
  if (p) m.position.set(p[0], p[1], p[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  if (s !== undefined) {
    if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
  }
  m.castShadow = true;
  if (parent) parent.add(m);
  return m;
}

// 让网格接收阴影（地面类大件用）
export function recv(mesh) { mesh.receiveShadow = true; return mesh; }
// 发光件不投影
export function noShadow(...ms) { for (const m of ms) m.castShadow = false; }

// 统计网格数（测试和自查用）
export function countMeshes(obj) {
  let n = 0;
  obj.traverse((o) => { if (o.isMesh) n++; });
  return n;
}
