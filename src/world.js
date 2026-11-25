// Weltgenerator: Gelände, Fluss, Siedlungen, Straßen, Felder, Bäume, Gebäude.
// Alles ist deterministisch aus dem Seed, daher muss nur der Seed gespeichert werden.

import { MAP, CHUNK, T, TERRAIN_COST, SETTLEMENTS } from './data.js';
import { mulberry32, makeNoise, fbm, rpick } from './rng.js';

// ---------------------------------------------------------------- A*
export class MinHeap {
  constructor() { this.keys = []; this.vals = []; }
  get size() { return this.keys.length; }
  push(k, v) {
    const K = this.keys, V = this.vals;
    let i = K.length;
    K.push(k); V.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= k) break;
      K[i] = K[p]; V[i] = V[p]; i = p;
    }
    K[i] = k; V[i] = v;
  }
  pop() {
    const K = this.keys, V = this.vals;
    const top = V[0];
    const lk = K.pop(), lv = V.pop();
    const n = K.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mk = lk;
        if (l < n && K[l] < mk) { m = l; mk = K[l]; }
        if (r < n && K[r] < mk) { m = r; }
        if (m === i) break;
        K[i] = K[m]; V[i] = V[m]; i = m;
      }
      K[i] = lk; V[i] = lv;
    }
    return top;
  }
}

const DIRS8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
let bufN = 0, bufG = null, bufPar = null, bufSeen = null, bufClosed = null, bufStamp = 0;

function ensureBuffers(N) {
  if (bufN === N) return;
  bufN = N;
  bufG = new Float32Array(N * N);
  bufPar = new Int32Array(N * N);
  bufSeen = new Uint32Array(N * N);
  bufClosed = new Uint32Array(N * N);
  bufStamp = 0;
}

// Liefert eine Liste von Kachelindizes (Start bis Ziel) oder null.
export function astar(N, sx, sy, tx, ty, costAt, opts = {}) {
  ensureBuffers(N);
  const diag = opts.diag !== false;
  const maxIter = opts.maxIter || 60000;
  const hMul = opts.hMul ?? 1;
  const st = ++bufStamp;
  const start = sy * N + sx, goal = ty * N + tx;
  const heap = new MinHeap();
  const hfun = (x, y) => {
    const dx = Math.abs(x - tx), dy = Math.abs(y - ty);
    return (diag ? Math.max(dx, dy) + 0.4142 * Math.min(dx, dy) : dx + dy) * hMul;
  };
  bufG[start] = 0; bufSeen[start] = st; bufPar[start] = -1;
  heap.push(hfun(sx, sy), start);
  const nd = diag ? 8 : 4;
  let iter = 0;
  while (heap.size && iter++ < maxIter) {
    const cur = heap.pop();
    if (cur === goal) {
      const out = [];
      for (let c = cur; c !== -1; c = bufPar[c]) out.push(c);
      return out.reverse();
    }
    if (bufClosed[cur] === st) continue;
    bufClosed[cur] = st;
    const cx = cur % N, cy = (cur / N) | 0;
    for (let d = 0; d < nd; d++) {
      const dx = DIRS8[d][0], dy = DIRS8[d][1];
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const ni = ny * N + nx;
      if (bufClosed[ni] === st) continue;
      const c = costAt(ni);
      if (c >= 1e8) continue;
      if (dx && dy && (costAt(cy * N + nx) >= 1e8 || costAt(ny * N + cx) >= 1e8)) continue;
      const ng = bufG[cur] + c * DIRS8[d][2];
      if (bufSeen[ni] !== st || ng < bufG[ni]) {
        bufSeen[ni] = st; bufG[ni] = ng; bufPar[ni] = cur;
        heap.push(ng + hfun(nx, ny), ni);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- Abfragen
export function tileAt(W, x, y) {
  const i = Math.floor(x), j = Math.floor(y);
  if (i < 0 || j < 0 || i >= W.N || j >= W.N) return T.WATER;
  return W.tiles[j * W.N + i];
}

export function isWalkable(W, x, y) {
  if (x < 0.3 || y < 0.3 || x > W.N - 0.3 || y > W.N - 0.3) return false;
  return W.tiles[Math.floor(y) * W.N + Math.floor(x)] !== T.WATER;
}

export function nearestWalkable(W, tx, ty, maxR = 8) {
  const N = W.N;
  for (let r = 0; r <= maxR; r++) {
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      const x = tx + ox, y = ty + oy;
      if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
      if (W.tiles[y * N + x] !== T.WATER) return { x, y };
    }
  }
  return null;
}

// Pfad zwischen zwei Weltpunkten (Fließkomma). Gibt Wegpunkte zurück oder null.
export function findPath(W, fx, fy, tx, ty, maxIter = 40000) {
  const N = W.N;
  const cl = (v) => Math.max(0, Math.min(N - 1, Math.floor(v)));
  let sx = cl(fx), sy = cl(fy), gx = cl(tx), gy = cl(ty);
  if (W.tiles[sy * N + sx] === T.WATER) {
    const a = nearestWalkable(W, sx, sy, 3);
    if (!a) return null;
    sx = a.x; sy = a.y;
  }
  if (W.tiles[gy * N + gx] === T.WATER) {
    const a = nearestWalkable(W, gx, gy, 8);
    if (!a) return null;
    gx = a.x; gy = a.y; tx = gx + 0.5; ty = gy + 0.5;
  }
  if (sx === gx && sy === gy) return [{ x: tx, y: ty }];
  const tiles = W.tiles, extra = W.extraCost;
  const idx = astar(N, sx, sy, gx, gy, (i) => TERRAIN_COST[tiles[i]] + extra[i], { hMul: 0.6, maxIter });
  if (!idx) return null;
  const pts = [];
  let pdx = 0, pdy = 0;
  for (let k = 1; k < idx.length; k++) {
    const i = idx[k], x = i % N, y = (i / N) | 0;
    const px = idx[k - 1] % N, py = (idx[k - 1] / N) | 0;
    const dx = x - px, dy = y - py;
    // gleiche Richtung -> vorherigen Punkt ersetzen
    if (pts.length && dx === pdx && dy === pdy) pts[pts.length - 1] = { x: x + 0.5, y: y + 0.5 };
    else pts.push({ x: x + 0.5, y: y + 0.5 });
    pdx = dx; pdy = dy;
  }
  if (pts.length) pts[pts.length - 1] = { x: tx, y: ty };
  return pts;
}

// ---------------------------------------------------------------- Generator
export function generateWorld(seed) {
  const N = MAP;
  const rng = mulberry32(seed);
  const tiles = new Uint8Array(N * N);
  const elev = new Float32Array(N * N);
  const extraCost = new Float32Array(N * N);
  const nE = makeNoise(seed * 7 + 1), nM = makeNoise(seed * 13 + 5), nR = makeNoise(seed * 3 + 11);

  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    let e = fbm(nE, x / 26, y / 26, 4);
    const m = fbm(nM, x / 19 + 50, y / 19 + 50, 4);
    const edge = Math.max(Math.abs(x - N / 2), Math.abs(y - N / 2)) / (N / 2);
    if (edge > 0.88) e += (edge - 0.88) * 1.2;   // Ränder werden hügelig
    elev[i] = e;
    let t = T.GRASS;
    if (e < 0.34) t = T.WATER;
    else if (e > 0.665) t = T.HILLS;
    else if (m > 0.53) t = T.FOREST;
    tiles[i] = t;
  }

  carveRiver(tiles, N, rng, nR);

  const W = { N, seed, tiles, elev, extraCost, sites: [], buildings: [], chunkObjs: [], CN: N / CHUNK, roads: [] };

  placeSettlements(W, rng);
  for (const s of W.sites) clearAround(W, s);
  addShores(W);
  buildRoads(W);
  for (const s of W.sites) addFields(W, s, rng);
  for (const s of W.sites) genBuildings(W, s, rng);
  placeTrees(W, rng);
  return W;
}

function carveRiver(tiles, N, rng, noise) {
  let x = N * (0.3 + rng() * 0.4), y = 0, a = Math.PI / 2;
  const base = Math.PI / 2;
  for (let step = 0; step < 3000 && y < N - 1 && x > 1 && x < N - 2; step++) {
    a += (noise(step * 0.04, 3.3) - 0.5) * 0.3 + (base - a) * 0.02;
    a = Math.max(base - 1.0, Math.min(base + 1.0, a));
    x += Math.cos(a) * 0.5;
    y += Math.sin(a) * 0.5;
    const w = 0.85 + noise(step * 0.02, 9.1) * 0.9;
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
      const tx = Math.floor(x + ox), ty = Math.floor(y + oy);
      if (tx < 0 || ty < 0 || tx >= N || ty >= N) continue;
      if (Math.hypot(tx + 0.5 - x, ty + 0.5 - y) <= w) tiles[ty * N + tx] = T.WATER;
    }
  }
}

function countAround(W, cx, cy, r, type) {
  let n = 0;
  for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
    const x = cx + ox, y = cy + oy;
    if (x < 0 || y < 0 || x >= W.N || y >= W.N) { if (type === T.WATER) n++; continue; }
    if (ox * ox + oy * oy > r * r) continue;
    if (W.tiles[y * W.N + x] === type) n++;
  }
  return n;
}

function placeSettlements(W, rng) {
  const N = W.N;
  for (const def of SETTLEMENTS) {
    let best = null;
    for (let attempt = 0; attempt < 900 && !best; attempt++) {
      const minD = attempt < 400 ? 24 : attempt < 700 ? 18 : 12;
      let x, y;
      if (def.type === 'spieler') {
        x = N / 2 + (rng() - 0.5) * 50; y = N / 2 + (rng() - 0.5) * 50;
      } else {
        x = 12 + rng() * (N - 24); y = 12 + rng() * (N - 24);
      }
      x = Math.floor(x); y = Math.floor(y);
      if (W.sites.some((s) => Math.hypot(s.tx - x, s.ty - y) < minD)) continue;
      const waterR = def.type === 'lager' ? 3 : Math.max(4, def.clear - 2);
      if (countAround(W, x, y, waterR, T.WATER) > 0) continue;
      if (def.type === 'lager') {
        if (countAround(W, x, y, 5, T.FOREST) < 55) continue;
      } else if (attempt < 600) {
        if (W.tiles[y * N + x] === T.HILLS && rng() < 0.8) continue;
        if (countAround(W, x, y, 3, T.HILLS) > 10) continue;
      }
      best = { x, y };
    }
    if (!best) {
      // Notlösung: irgendein trockenes Feld weit genug weg
      for (let k = 0; k < 4000 && !best; k++) {
        const x = 10 + Math.floor(rng() * (N - 20)), y = 10 + Math.floor(rng() * (N - 20));
        if (W.tiles[y * N + x] !== T.WATER && !W.sites.some((s) => Math.hypot(s.tx - x, s.ty - y) < 10)) best = { x, y };
      }
    }
    if (!best) best = { x: N / 2, y: N / 2 };
    W.sites.push({ ...def, tx: best.x, ty: best.y, x: best.x + 0.5, y: best.y + 0.5 });
  }
}

function clearAround(W, s) {
  const N = W.N, r = s.clear;
  for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
    const x = s.tx + ox, y = s.ty + oy;
    if (x < 0 || y < 0 || x >= N || y >= N) continue;
    const d = Math.hypot(ox, oy);
    if (d > r + 0.3) continue;
    const i = y * N + x;
    const t = W.tiles[i];
    if (t === T.WATER) {
      if (d < 3) W.tiles[i] = T.GRASS;    // Kern immer trocken
      continue;
    }
    if (s.type === 'lager') { if (d <= 2.5) W.tiles[i] = T.GRASS; continue; }
    if (t === T.FOREST || t === T.HILLS || t === T.SAND) W.tiles[i] = T.GRASS;
  }
}

function addShores(W) {
  const N = W.N, tl = W.tiles;
  const out = new Uint8Array(tl);
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const i = y * N + x;
    if (tl[i] !== T.GRASS) continue;
    if (tl[i - 1] === T.WATER || tl[i + 1] === T.WATER || tl[i - N] === T.WATER || tl[i + N] === T.WATER) out[i] = T.SAND;
  }
  W.tiles.set(out);
}

const WALLED = { spieler: 6, burg: 6, halle: 5 };

function roadPoint(s) {
  // Ummauerte Orte werden über das Tor (Südwestseite) angefahren, sonst die Ortsmitte
  if (WALLED[s.type]) return { x: s.tx, y: s.ty + WALLED[s.type] };
  return { x: s.tx, y: s.ty };
}

function buildRoads(W) {
  const N = W.N;
  const sites = W.sites.filter((s) => s.type !== 'lager');
  // Minimaler Spannbaum (Prim) + ein paar Querverbindungen
  const inTree = [sites[0]], rest = sites.slice(1), edges = [];
  while (rest.length) {
    let best = null;
    for (const a of inTree) for (const b of rest) {
      const d = Math.hypot(a.tx - b.tx, a.ty - b.ty);
      if (!best || d < best.d) best = { a, b, d };
    }
    edges.push(best);
    inTree.push(best.b);
    rest.splice(rest.indexOf(best.b), 1);
  }
  const has = (a, b) => edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  const extra = [];
  for (const a of sites) for (const b of sites) {
    if (a.id >= b.id || has(a, b)) continue;
    const d = Math.hypot(a.tx - b.tx, a.ty - b.ty);
    if (d < 46) extra.push({ a, b, d });
  }
  extra.sort((p, q) => p.d - q.d);
  edges.push(...extra.slice(0, 5));

  // Innenhöfe ummauerter Orte sind für Straßen tabu
  const yard = new Uint8Array(N * N);
  for (const s of W.sites) {
    const r = WALLED[s.type];
    if (!r) continue;
    for (let oy = -r + 1; oy <= r - 1; oy++) for (let ox = -r + 1; ox <= r - 1; ox++) {
      const x = s.tx + ox, y = s.ty + oy;
      if (x >= 0 && y >= 0 && x < N && y < N) yard[y * N + x] = 1;
    }
  }
  const roadCost = (i) => {
    if (yard[i]) return 60;
    switch (W.tiles[i]) {
      case T.ROAD: case T.BRIDGE: return 0.35;
      case T.GRASS: return 1;
      case T.SAND: return 1.3;
      case T.FIELD: return 1.5;
      case T.FOREST: return 2.6;
      case T.HILLS: return 3.2;
      case T.WATER: return 14;
      default: return 1;
    }
  };
  for (const e of edges) {
    const pa = roadPoint(e.a), pb = roadPoint(e.b);
    const idx = astar(N, pa.x, pa.y, pb.x, pb.y, roadCost, { diag: false, maxIter: 120000, hMul: 0.35 });
    if (!idx) continue;
    for (const i of idx) W.tiles[i] = W.tiles[i] === T.WATER || W.tiles[i] === T.BRIDGE ? T.BRIDGE : T.ROAD;
    W.roads.push([e.a.id, e.b.id]);
  }
  // Zufahrt durch das Tor bis in den Hof
  for (const s of W.sites) {
    const r = WALLED[s.type];
    if (!r) continue;
    for (let k = 0; k <= r; k++) {
      const i = (s.ty + k) * N + s.tx;
      W.tiles[i] = W.tiles[i] === T.WATER ? T.BRIDGE : T.ROAD;
    }
  }

  // Lager der Waldleute: sicherstellen, dass es erreichbar ist (Trampelpfad, wenn nötig)
  const camp = W.sites.find((s) => s.type === 'lager');
  if (camp) {
    let nearest = null;
    for (const s of sites) {
      const d = Math.hypot(s.tx - camp.tx, s.ty - camp.ty);
      if (!nearest || d < nearest.d) nearest = { s, d };
    }
    const walk = (i) => (W.tiles[i] === T.WATER ? 1e9 : TERRAIN_COST[W.tiles[i]]);
    const ok = astar(N, camp.tx, camp.ty, nearest.s.tx, nearest.s.ty, walk, { maxIter: 80000, hMul: 0.5 });
    if (!ok) {
      const idx = astar(N, camp.tx, camp.ty, nearest.s.tx, nearest.s.ty, roadCost, { diag: false, maxIter: 120000, hMul: 0.35 });
      if (idx) for (const i of idx) if (W.tiles[i] === T.WATER) W.tiles[i] = T.BRIDGE;
    }
  }
}

function addFields(W, s, rng) {
  const n = { dorf: 4, halle: 3, abtei: 3, spieler: 3, stadt: 3, markt: 2, burg: 2 }[s.type] || 0;
  const N = W.N;
  for (let k = 0; k < n; k++) {
    const a = rng() * Math.PI * 2;
    const r = (s.type === 'spieler' ? 11 : 5.5) + rng() * 3;
    const cx = Math.floor(s.x + Math.cos(a) * r), cy = Math.floor(s.y + Math.sin(a) * r);
    const w = 2 + Math.floor(rng() * 3), h = 2 + Math.floor(rng() * 2);
    for (let y = cy; y < cy + h; y++) for (let x = cx; x < cx + w; x++) {
      if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
      const i = y * N + x;
      if (W.tiles[i] === T.GRASS) W.tiles[i] = T.FIELD;
    }
  }
}

function markCost(W, b) {
  const N = W.N;
  const x0 = Math.floor(b.x - b.wx / 2 + 0.1), x1 = Math.floor(b.x + b.wx / 2 - 0.1);
  const y0 = Math.floor(b.y - b.wy / 2 + 0.1), y1 = Math.floor(b.y + b.wy / 2 - 0.1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (x >= 0 && y >= 0 && x < N && y < N) W.extraCost[y * N + x] = 12;
  }
}

function freeSpot(W, x, y, minGap) {
  const N = W.N;
  const i = Math.floor(y) * N + Math.floor(x);
  if (x < 2 || y < 2 || x > N - 2 || y > N - 2) return false;
  const t = W.tiles[i];
  if (t === T.WATER || t === T.ROAD || t === T.BRIDGE || t === T.FIELD) return false;
  for (const b of W.buildings) if (Math.abs(b.x - x) < minGap && Math.abs(b.y - y) < minGap) return false;
  return true;
}

function genBuildings(W, s, rng) {
  const add = (b) => { b.site = s.id; W.buildings.push(b); if (b.wx && !b.noCost) markCost(W, b); return b; };
  const house = (x, y, o = {}) => ({
    kind: 'house', x, y,
    wx: o.wx ?? 0.9 + rng() * 0.5, wy: o.wy ?? 0.8 + rng() * 0.4,
    h: o.h ?? 13 + rng() * 8, rh: o.rh ?? 11 + rng() * 6,
    wall: o.wall ?? rpick(rng, ['plaster', 'timber', 'timber']),
    roof: o.roof ?? 'thatch', chimney: rng() < 0.45, lit: rng() < 0.75,
  });
  const ring = (count, rMin, rMax, mk, gap = 1.7) => {
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 60; tries++) {
      const a = rng() * Math.PI * 2, r = rMin + rng() * (rMax - rMin);
      const x = Math.floor(s.x + Math.cos(a) * r) + 0.5, y = Math.floor(s.y + Math.sin(a) * r) + 0.5;
      if (!freeSpot(W, x, y, gap)) continue;
      if (Math.hypot(x - s.x, y - s.y) < 1.6) continue;
      add(mk(x, y));
      placed++;
    }
  };
  switch (s.type) {
    case 'stadt':
      add({ kind: 'church', x: s.x - 2.5, y: s.y - 2.5, wx: 2.6, wy: 1.2, h: 30, big: true });
      for (let k = 0; k < 3; k++) add({ kind: 'stall', x: s.x + Math.cos(k * 2.1) * 1.6, y: s.y + Math.sin(k * 2.1) * 1.6, color: rpick(rng, ['#a33b32', '#3d6fa3', '#d6ad4c', '#5b8a3c']), noCost: true, wx: 0.8, wy: 0.6 });
      ring(15, 2.6, 6.5, (x, y) => house(x, y, { roof: rng() < 0.55 ? 'tile' : 'thatch', wall: rpick(rng, ['timber', 'plaster', 'stone']), h: 16 + rng() * 10 }));
      break;
    case 'markt':
      ring(7, 2.5, 5.5, (x, y) => house(x, y, { roof: rng() < 0.4 ? 'tile' : 'thatch' }));
      for (let k = 0; k < 5; k++) add({ kind: 'tent', x: s.x + 3 + k * 1.15, y: s.y - 3.6, wx: 0.9, wy: 0.9, color: rpick(rng, ['#a33b32', '#3d6fa3', '#d6ad4c', '#e8e0cc', '#5b8a3c']), noCost: true });
      add({ kind: 'fence', x: s.x + 5.3, y: s.y - 2.2, x1: s.x + 2.4, x2: s.x + 8.2, noCost: true });
      add({ kind: 'stall', x: s.x + 1.2, y: s.y + 1.1, color: '#a33b32', noCost: true, wx: 0.8, wy: 0.6 });
      add({ kind: 'stall', x: s.x - 1.3, y: s.y + 0.9, color: '#d6ad4c', noCost: true, wx: 0.8, wy: 0.6 });
      break;
    case 'dorf':
      ring(5 + Math.floor(rng() * 3), 1.8, 4.8, (x, y) => house(x, y));
      add({ kind: 'well', x: s.x + 0.9, y: s.y + 0.7, wx: 0.6, wy: 0.6, noCost: true });
      break;
    case 'halle':
      add({ kind: 'longhall', x: s.x - 0.4, y: s.y - 1.6, wx: 3.2, wy: 1.4, h: 20 });
      ring(3, 2.2, 3.4, (x, y) => house(x, y, { wall: 'wood' }));
      s.palisade = 4.5;
      break;
    case 'burg':
      s.castleLevel = s.id === 'torquilstone' ? 3 : 2;
      ring(5, 6.2, 7.8, (x, y) => house(x, y));
      break;
    case 'abtei':
      add({ kind: 'church', x: s.x - 0.5, y: s.y - 1.8, wx: 3.2, wy: 1.3, h: 34, big: true, abbey: true });
      add({ kind: 'house', x: s.x + 2.2, y: s.y - 1.2, wx: 1.0, wy: 2.2, h: 18, rh: 12, wall: 'stone', roof: 'tile', lit: true });
      add({ kind: 'house', x: s.x - 2.6, y: s.y + 1.4, wx: 2.0, wy: 1.0, h: 16, rh: 10, wall: 'stone', roof: 'tile', lit: true });
      ring(3, 3.5, 5.2, (x, y) => house(x, y));
      add({ kind: 'well', x: s.x + 0.4, y: s.y + 1.1, wx: 0.6, wy: 0.6, noCost: true });
      break;
    case 'lager':
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2 + rng() * 0.4;
        add({ kind: 'tent', x: s.x + Math.cos(a) * 1.9, y: s.y + Math.sin(a) * 1.9, wx: 0.9, wy: 0.9, color: rpick(rng, ['#6d6a4a', '#5c6640', '#7a6a4a']), noCost: true });
      }
      add({ kind: 'fire', x: s.x + 0.2, y: s.y + 0.2, noCost: true });
      break;
    default:
      break;
  }
}

function placeTrees(W, rng) {
  const N = W.N, CN = W.CN;
  for (let k = 0; k < CN * CN; k++) W.chunkObjs.push([]);
  const nearSite = (x, y) => W.sites.some((s) => Math.hypot(s.x - x, s.y - y) < (s.type === 'lager' ? 2.8 : s.clear + 1));
  const nearBuilding = (x, y) => W.buildings.some((b) => Math.abs(b.x - x) < 1.1 && Math.abs(b.y - y) < 1.1);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const t = W.tiles[y * N + x];
    let n = 0, kind = 'laub';
    if (t === T.FOREST) n = rng() < 0.55 ? 2 : 1;
    else if (t === T.GRASS && rng() < 0.03) n = 1;
    else if (t === T.HILLS) { if (rng() < 0.12) { n = 1; kind = 'fels'; } else if (rng() < 0.08) { n = 1; kind = 'nadel'; } }
    for (let k = 0; k < n; k++) {
      const ox = x + 0.15 + rng() * 0.7, oy = y + 0.15 + rng() * 0.7;
      if (nearSite(ox, oy)) continue;
      if (t === T.GRASS && nearBuilding(ox, oy)) continue;
      let kk = kind;
      if (kk === 'laub' && (W.elev[y * N + x] > 0.56 || rng() < 0.3)) kk = 'nadel';
      const ci = Math.floor(oy / CHUNK) * CN + Math.floor(ox / CHUNK);
      W.chunkObjs[ci].push({ kind: kk, x: ox, y: oy, v: Math.floor(rng() * 3), s: 0.8 + rng() * 0.45 });
    }
  }
}
