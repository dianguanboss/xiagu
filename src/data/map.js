// 地图数据：200×200，蓝方基地在左下 (y 大)，红方在右上。
// 对称：D(x,y)=(y,x) 把蓝方映射到红方（以河道对角线为轴）；
//       R(x,y)=(200-y,200-x) 在同一方内把上半野区映射到下半野区（以中路为轴）。
import { TEAM_BLUE, TEAM_RED, MAP_SIZE } from '../config.js';
import { polylineLengths, pointAlong } from '../util/math.js';

const S = MAP_SIZE;
export const mirD = ([x, y]) => [y, x];
export const mirR = ([x, y]) => [S - y, S - x];
const mapPts = (pts, f) => pts.map(f);

// —— 三路（蓝方水晶 → 红方水晶）——
const LANE_PTS = {
  top: [[26, 174], [18, 150], [18, 32], [32, 18], [150, 18], [174, 26]],
  mid: [[26, 174], [174, 26]],
  bot: [[26, 174], [50, 182], [168, 182], [182, 168], [182, 50], [174, 26]],
};
export const LANE_NAMES = { top: '对抗路', mid: '中路', bot: '发育路' };
export const LANE_WIDTH = 12;

export const LANES = {};
for (const k of Object.keys(LANE_PTS)) {
  const pts = LANE_PTS[k];
  LANES[k] = { id: k, pts, acc: polylineLengths(pts) };
  LANES[k].length = LANES[k].acc[LANES[k].acc.length - 1];
}

export const FOUNTAINS = { [TEAM_BLUE]: { x: 10, y: 190 }, [TEAM_RED]: { x: 190, y: 10 } };
export const CRYSTALS = { [TEAM_BLUE]: { x: 26, y: 174 }, [TEAM_RED]: { x: 174, y: 26 } };
export const FOUNTAIN_RADIUS = 10;

// 防御塔：按沿路距离放置（从本方水晶算起）
const TOWER_DIST = {
  top: { high: 25, inner: 62, outer: 102 },
  bot: { high: 25, inner: 62, outer: 102 },
  mid: { high: 24, inner: 50, outer: 78 },
};
export const TOWER_TIERS = ['outer', 'inner', 'high'];

function buildTowers() {
  const list = [];
  for (const lane of Object.keys(LANES)) {
    const L = LANES[lane];
    for (const tier of TOWER_TIERS) {
      const d = TOWER_DIST[lane][tier];
      const pb = pointAlong(L.pts, L.acc, d);
      const pr = pointAlong(L.pts, L.acc, L.length - d);
      list.push({ team: TEAM_BLUE, lane, tier, x: pb.x, y: pb.y, along: d });
      list.push({ team: TEAM_RED, lane, tier, x: pr.x, y: pr.y, along: L.length - d });
    }
  }
  return list;
}
export const TOWERS = buildTowers();

// —— 地形墙（多边形）——蓝方上半野区手工设计，其余三块由对称生成
const WALLS_BLUE_TOP = [
  [[27, 78], [33, 76], [35, 95], [29, 97]],                 // 上路旁长墙（下段）
  [[27, 116], [33, 114], [36, 130], [29, 133]],             // 上路旁长墙（上段）
  [[47, 94], [55, 89], [61, 97], [53, 104]],                // 野区中央石
  [[41, 66], [48, 61], [55, 69], [47, 76]],                 // 河岸石
  [[70, 95], [76, 89], [82, 95], [76, 103]],                // 中路旁石
  [[43, 123], [55, 117], [61, 124], [49, 131]],             // 蓝 buff 后墙
  [[29, 44], [36, 40], [38, 50], [31, 54]],                 // 上路河口石
];
// 基地边墙（蓝方，上/中之间；中/下之间由 R 生成）
const BASE_WALLS_BLUE = [
  [[26, 140], [34, 138], [40, 149], [35, 154], [28, 150]],
];
// 河道两侧小石（在轴上自对称地成对生成）
const RIVER_ROCKS = [
  [[84, 70], [90, 66], [94, 72], [88, 76]],  // 中路河口附近（红方侧，D 后得到蓝方侧）
];

function buildWalls() {
  const out = [];
  const blueTop = [...WALLS_BLUE_TOP, ...BASE_WALLS_BLUE];
  for (const w of blueTop) {
    out.push(w);                              // 蓝 上半
    out.push(mapPts(w, mirR));                // 蓝 下半
    out.push(mapPts(w, mirD));                // 红 对应
    out.push(mapPts(mapPts(w, mirR), mirD));
  }
  for (const w of RIVER_ROCKS) {
    out.push(w); out.push(mapPts(w, mirD));
    out.push(mapPts(w, mirR)); out.push(mapPts(mapPts(w, mirR), mirD));
  }
  return out;
}
export const WALLS = buildWalls();

// —— 草丛（圆形块的组合）——
const BUSH_BLUE_TOP = [
  { x: 27, y: 62, r: 3.6 },   // 上路草
  { x: 27, y: 106, r: 3.2 },  // 上路中段草
  { x: 60, y: 82, r: 3.4 },   // 野区河口草
  { x: 84, y: 108, r: 3.4 },  // 中路草（蓝侧）
  { x: 39, y: 92, r: 3.0 },   // 蓝 buff 上方草
];
const RIVER_BUSH = [
  { x: 64, y: 50, r: 3.4 },   // 上河道草（红侧，D 得蓝侧）
];
function buildBushes() {
  const out = [];
  const add = (b, f) => { const [x, y] = f([b.x, b.y]); out.push({ x, y, r: b.r }); };
  const id = (p) => p;
  const RD = (p) => mirD(mirR(p));
  for (const b of BUSH_BLUE_TOP) { add(b, id); add(b, mirR); add(b, mirD); add(b, RD); }
  for (const b of RIVER_BUSH) { add(b, id); add(b, mirD); add(b, mirR); add(b, RD); }
  return out.map((b, i) => ({ ...b, id: i }));
}
export const BUSHES = buildBushes();

// —— 野怪营地 ——（蓝方上半野区：蓝 buff、狼、甲虫；R 映射到下半：红 buff、林鸟、野猪）
const CAMPS_BLUE_TOP = [
  { type: 'blueBuff', x: 40, y: 108 },
  { type: 'wolves', x: 64, y: 102 },
  { type: 'beetles', x: 37, y: 70 },
];
const CAMP_R_TYPE = { blueBuff: 'redBuff', wolves: 'birds', beetles: 'boars' };
function buildCamps() {
  const out = [];
  for (const c of CAMPS_BLUE_TOP) {
    const r = mirR([c.x, c.y]);
    const blue = [{ type: c.type, x: c.x, y: c.y }, { type: CAMP_R_TYPE[c.type], x: r[0], y: r[1] }];
    for (const b of blue) {
      out.push({ ...b, side: TEAM_BLUE });
      const d = mirD([b.x, b.y]);
      out.push({ type: b.type, x: d[0], y: d[1], side: TEAM_RED });
    }
  }
  out.push({ type: 'guardian', x: 55, y: 55, side: 0 });  // 上河道：远古守卫
  out.push({ type: 'drake', x: 145, y: 145, side: 0 });   // 下河道：炎鳞龙
  return out.map((c, i) => ({ ...c, id: i }));
}
export const CAMPS = buildCamps();

// 河道：沿 y=x 的带状区域
export const RIVER_HALF_WIDTH = 8;
export function inRiver(x, y) {
  return Math.abs(x - y) / Math.SQRT2 < RIVER_HALF_WIDTH && x + y > 30 && x + y < 2 * S - 30;
}

export function onSide(team, x, y) {
  // 蓝方半场 y > x
  return team === TEAM_BLUE ? y > x : x > y;
}

export const MAP_BORDER = 4;
