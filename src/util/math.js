// 通用数学工具（模拟层与渲染层共用，不依赖浏览器）

export const TAU = Math.PI * 2;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }
export function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
export function len(x, y) { return Math.sqrt(x * x + y * y); }

export function norm(x, y) {
  const l = Math.sqrt(x * x + y * y);
  return l > 1e-9 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}

// 角度插值（走最短方向）
export function lerpAngle(a, b, t) {
  let d = ((b - a) % TAU + TAU * 1.5) % TAU - Math.PI;
  return a + d * t;
}

export function angleDiff(a, b) {
  return Math.abs(((b - a) % TAU + TAU * 1.5) % TAU - Math.PI);
}

// 点到线段距离的平方
export function segDist2(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + vx * t, cy = ay + vy * t;
  return dist2(px, py, cx, cy);
}

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polyDist2(x, y, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = segDist2(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
    if (d < best) best = d;
  }
  return best;
}

// 折线：累计长度与按距离取点
export function polylineLengths(pts) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  return acc;
}

export function pointAlong(pts, acc, d) {
  if (d <= 0) return { x: pts[0][0], y: pts[0][1], i: 0, dir: norm(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) };
  for (let i = 1; i < pts.length; i++) {
    if (d <= acc[i] || i === pts.length - 1) {
      const seg = acc[i] - acc[i - 1];
      const t = seg > 0 ? clamp((d - acc[i - 1]) / seg, 0, 1) : 0;
      return {
        x: lerp(pts[i - 1][0], pts[i][0], t), y: lerp(pts[i - 1][1], pts[i][1], t), i,
        dir: norm(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]),
      };
    }
  }
  const n = pts.length - 1;
  return { x: pts[n][0], y: pts[n][1], i: n, dir: { x: 0, y: 0 } };
}

// 点投影到折线，返回沿线距离
export function projectOnPolyline(pts, acc, x, y) {
  let best = Infinity, bestD = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1];
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
    const t = l2 > 0 ? clamp(((x - ax) * vx + (y - ay) * vy) / l2, 0, 1) : 0;
    const d2 = dist2(x, y, ax + vx * t, ay + vy * t);
    if (d2 < best) { best = d2; bestD = acc[i - 1] + Math.sqrt(l2) * t; }
  }
  return { along: bestD, off: Math.sqrt(best) };
}
