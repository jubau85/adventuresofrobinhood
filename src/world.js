// Weltgenerator: Küsten, Flüsse, Bergland, Siedlungen, Straßen, Häfen, Felder, Bäume, Gebäude.
// Alles ist deterministisch aus dem Seed, daher muss nur der Seed gespeichert werden.

import { MAP, CHUNK, HMAX, T, TERRAIN_COST, SETTLEMENTS, geoToTile } from './data.js';
import { COAST_GB, COAST_IRELAND, COAST_CONTINENT, ISLANDS, RIVERS, UPLANDS, FORESTS } from './geo.js';
import { mulberry32, makeNoise, fbm, rpick, hash2 } from './rng.js';

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

// Geländehöhe (Pixel) an einem beliebigen Weltpunkt, bilinear aus den Eckpunkten
export function groundZ(W, x, y) {
  const N = W.N, M = W.M;
  if (!(x >= 0 && y >= 0 && x < N && y < N)) return 0;
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const a = W.vh[j * M + i], b = W.vh[j * M + i + 1], c = W.vh[(j + 1) * M + i], d = W.vh[(j + 1) * M + i + 1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export function isWalkable(W, x, y) {
  if (x < 0.3 || y < 0.3 || x > W.N - 0.3 || y > W.N - 0.3) return false;
  const i = Math.floor(y) * W.N + Math.floor(x);
  return W.tiles[i] !== T.WATER && !W.block[i];
}

// ---------------------------------------------------------------- Mauern
// Burgmauern und Palisaden sperren ihre Felder. Straßenfelder bleiben offen: Dort ist das Tor.
function wallRing(W, s, R) {
  const out = [];
  for (let k = -R; k <= R; k++) out.push([s.tx + k, s.ty - R], [s.tx + k, s.ty + R], [s.tx - R, s.ty + k], [s.tx + R, s.ty + k]);
  return out;
}

function blockTiles(W, arr, list) {
  const N = W.N;
  for (const [x, y] of list) {
    if (x < 0 || y < 0 || x >= N || y >= N) continue;
    const i = y * N + x, t = W.tiles[i];
    if (t === T.ROAD || t === T.BRIDGE || t === T.WATER) continue;
    arr[i] = 1;
  }
}

function buildStaticWalls(W) {
  const N = W.N;
  W.blockStatic = new Uint8Array(N * N);
  for (const s of W.sites) {
    if (s.type === 'burg') blockTiles(W, W.blockStatic, wallRing(W, s, 4));
    if (s.palisade) {
      const list = [];
      const r = s.palisade;
      for (let y = s.ty - 6; y <= s.ty + 6; y++) for (let x = s.tx - 6; x <= s.tx + 6; x++) {
        const d = Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y);
        const a = Math.atan2(y + 0.5 - s.y, x + 0.5 - s.x);
        if (d >= r - 0.55 && d <= r + 0.45 && Math.abs(a - Math.PI / 2) > 0.3) list.push([x, y]);
      }
      blockTiles(W, W.blockStatic, list);
    }
  }
  W.block = new Uint8Array(W.blockStatic);
}

// Mauern von Ashcombe (ab der Holzburg) ein- oder ausschalten
export function setPlayerWalls(W, on) {
  W.block = new Uint8Array(W.blockStatic);
  if (!on) return;
  const s = W.sites.find((x) => x.type === 'spieler');
  blockTiles(W, W.block, wallRing(W, s, 4));
}

export function isBlockedTile(W, x, y) {
  const i = Math.floor(y) * W.N + Math.floor(x);
  return !!W.block[i];
}

export function nearestWalkable(W, tx, ty, maxR = 8) {
  const N = W.N;
  for (let r = 0; r <= maxR; r++) {
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      const x = tx + ox, y = ty + oy;
      if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
      if (W.tiles[y * N + x] !== T.WATER && !(W.block && W.block[y * N + x])) return { x, y };
    }
  }
  return null;
}

// Pfad zwischen zwei Weltpunkten (Fließkomma). Gibt Wegpunkte zurück oder null.
export function findPath(W, fx, fy, tx, ty, maxIter = 60000) {
  const N = W.N;
  const cl = (v) => Math.max(0, Math.min(N - 1, Math.floor(v)));
  let sx = cl(fx), sy = cl(fy), gx = cl(tx), gy = cl(ty);
  if (W.tiles[sy * N + sx] === T.WATER || W.block[sy * N + sx]) {
    const a = nearestWalkable(W, sx, sy, 3);
    if (!a) return null;
    sx = a.x; sy = a.y;
  }
  if (W.tiles[gy * N + gx] === T.WATER || W.block[gy * N + gx]) {
    const a = nearestWalkable(W, gx, gy, 8);
    if (!a) return null;
    gx = a.x; gy = a.y; tx = gx + 0.5; ty = gy + 0.5;
  }
  if (sx === gx && sy === gy) return [{ x: tx, y: ty }];
  if (W.landId[sy * N + sx] !== W.landId[gy * N + gx]) return null;
  const tiles = W.tiles, extra = W.extraCost, block = W.block;
  const far = Math.hypot(gx - sx, gy - sy);
  const hMul = far > 90 ? 0.95 : far > 45 ? 0.8 : 0.6;
  const idx = astar(N, sx, sy, gx, gy, (i) => (block[i] ? 1e9 : TERRAIN_COST[tiles[i]] + extra[i]), { hMul, maxIter });
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
  const nW = makeNoise(seed * 17 + 23), nW2 = makeNoise(seed * 19 + 29);

  // Küste: gerasterte Umrisse, leicht verwirbelt
  const poly = rasterLand(N);
  const land = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const wx = x + (fbm(nW, x / 9, y / 9, 3) - 0.5) * 5.5 + (nW2(x / 2.5, y / 2.5) - 0.5) * 1.3;
    const wy = y + (fbm(nW, x / 9 + 71, y / 9 + 37, 3) - 0.5) * 5.5 + (nW2(x / 2.5 + 13, y / 2.5 + 7) - 0.5) * 1.3;
    const sx = Math.max(0, Math.min(N - 1, Math.floor(wx))), sy = Math.max(0, Math.min(N - 1, Math.floor(wy)));
    land[y * N + x] = poly[sy * N + sx];
  }
  smoothLand(land, N);
  const sea = findSea(land, N);
  // Eingeschlossene Tümpel aus der Verwirbelung werden Land
  for (let i = 0; i < N * N; i++) if (!land[i] && !sea[i]) land[i] = 1;
  const dSea = distanceField(N, (i) => sea[i] === 1);

  // Gelände: Höhe aus Bergland und Rauschen, Wald aus Waldgebieten und Rauschen
  const upl = new Float32Array(N * N), wood = new Float32Array(N * N);
  addInfluence(N, upl, UPLANDS);
  addInfluence(N, wood, FORESTS);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (sea[i]) { tiles[i] = T.WATER; elev[i] = 0.25; continue; }
    const rough = 0.85 + (fbm(nE, x / 6 + 40, y / 6 + 40, 3) - 0.5) * 0.9;
    const e = 0.42 + (fbm(nE, x / 20, y / 20, 4) - 0.5) * 0.2 + Math.min(1, dSea[i] / 10) * 0.06 + upl[i] * rough;
    elev[i] = e;
    const m = fbm(nM, x / 13 + 50, y / 13 + 50, 4) + wood[i];
    tiles[i] = e > 0.665 ? T.HILLS : m > 0.62 ? T.FOREST : T.GRASS;
  }

  const W = { N, seed, tiles, elev, extraCost, sea, sites: [], buildings: [], chunkObjs: [], CN: N / CHUNK, roads: [] };
  carveRivers(W, nR);
  W.landId = labelLand(W);

  placeSettlements(W, rng);
  for (const s of W.sites) clearAround(W, s);
  addShores(W);
  buildRoads(W);
  placeDocks(W);
  for (const s of W.sites) addFields(W, s, rng);
  for (const s of W.sites) genBuildings(W, s, rng);
  computeHeights(W);
  flattenSites(W);
  placeTrees(W, rng);
  buildStaticWalls(W);
  return W;
}

// Landmasse an einer Stelle (0 = Meer). Gruppen und Wege bleiben auf ihrer Landmasse.
export function landAt(W, x, y) {
  const i = Math.floor(y) * W.N + Math.floor(x);
  return x < 0 || y < 0 || x >= W.N || y >= W.N ? 0 : W.landId[i];
}

const toTilePts = (pts) => pts.map(([lon, lat]) => geoToTile(lon, lat));

// Umrisse zeilenweise rastern (gerade-ungerade-Regel), 1 = Land
function rasterLand(N) {
  const out = new Uint8Array(N * N);
  const polys = [COAST_GB, COAST_IRELAND, COAST_CONTINENT, ...ISLANDS].map(toTilePts);
  const xs = [];
  for (const P of polys) {
    for (let j = 0; j < N; j++) {
      const yc = j + 0.5;
      xs.length = 0;
      for (let k = 0; k < P.length; k++) {
        const p = P[k], q = P[(k + 1) % P.length];
        if ((p.y <= yc) !== (q.y <= yc)) xs.push(p.x + ((yc - p.y) / (q.y - p.y)) * (q.x - p.x));
      }
      xs.sort((u, v) => u - v);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, Math.ceil(xs[k] - 0.5)), x1 = Math.min(N - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = x0; x <= x1; x++) out[j * N + x] = 1;
      }
    }
  }
  return out;
}

// Einzelne Land- und Wasserkrümel entfernen
function smoothLand(land, N) {
  const src = new Uint8Array(land);
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && src[(y + dy) * N + x + dx]) n++;
    const i = y * N + x;
    if (src[i] && n <= 1) land[i] = 0;
    else if (!src[i] && n >= 7) land[i] = 1;
  }
}

// Meer: Wasser, das mit dem Kartenrand verbunden ist
function findSea(land, N) {
  const sea = new Uint8Array(N * N);
  const q = [];
  for (let k = 0; k < N; k++) for (const i of [k, (N - 1) * N + k, k * N, k * N + N - 1]) if (!land[i] && !sea[i]) { sea[i] = 1; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const ni = ny * N + nx;
      if (!land[ni] && !sea[ni]) { sea[ni] = 1; q.push(ni); }
    }
  }
  return sea;
}

// Abstand (in Kacheln, 4er-Nachbarschaft) zu den Feldern, für die src(i) gilt
function distanceField(N, src) {
  const d = new Int16Array(N * N).fill(-1);
  const q = [];
  for (let i = 0; i < N * N; i++) if (src(i)) { d[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const ni = ny * N + nx;
      if (d[ni] < 0) { d[ni] = d[i] + 1; q.push(ni); }
    }
  }
  return d;
}

function segDist(px, py, p, q) {
  const dx = q.x - p.x, dy = q.y - p.y, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - p.x) * dx + (py - p.y) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - p.x - t * dx, py - p.y - t * dy);
}

// Einfluss von Linienzügen mit glockenförmigem Abfall aufaddieren
function addInfluence(N, field, list) {
  for (const f of list) {
    const P = toTilePts(f.pts), R = f.r * 2.6;
    const x0 = Math.max(0, Math.floor(Math.min(...P.map((p) => p.x)) - R)), x1 = Math.min(N - 1, Math.ceil(Math.max(...P.map((p) => p.x)) + R));
    const y0 = Math.max(0, Math.floor(Math.min(...P.map((p) => p.y)) - R)), y1 = Math.min(N - 1, Math.ceil(Math.max(...P.map((p) => p.y)) + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let d = Infinity;
      if (P.length === 1) d = Math.hypot(x + 0.5 - P[0].x, y + 0.5 - P[0].y);
      else for (let k = 0; k + 1 < P.length; k++) d = Math.min(d, segDist(x + 0.5, y + 0.5, P[k], P[k + 1]));
      if (d < R) field[y * N + x] += f.a * Math.exp(-(d * d) / (f.r * f.r));
    }
  }
}

// Flüsse und Seen als Wasserbänder entlang der Linienzüge, mit leichten Mäandern
function carveRivers(W, nR) {
  const N = W.N;
  RIVERS.forEach((r, ri) => {
    const P = toTilePts(r.pts);
    let L = 0;
    for (let k = 0; k + 1 < P.length; k++) L += Math.hypot(P[k + 1].x - P[k].x, P[k + 1].y - P[k].y);
    let acc = 0;
    for (let k = 0; k + 1 < P.length; k++) {
      const p = P[k], q = P[k + 1], len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len < 1e-6) continue;
      const nx = -(q.y - p.y) / len, ny = (q.x - p.x) / len;
      const steps = Math.ceil(len / 0.3);
      for (let st = 0; st <= steps; st++) {
        const t = st / steps, dd = acc + t * len, f = dd / L;
        const w = r.w[0] + (r.w[1] - r.w[0]) * f;
        const amp = r.lake ? 0.3 : 1.3 * Math.min(1, dd / 6, (L - dd) / 6);
        const off = (nR(dd * 0.09, ri * 7.3) - 0.5) * 2 * amp;
        const cx = p.x + (q.x - p.x) * t + nx * off, cy = p.y + (q.y - p.y) * t + ny * off;
        for (let y = Math.floor(cy - w); y <= Math.ceil(cy + w); y++) for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) {
          if (x < 0 || y < 0 || x >= N || y >= N) continue;
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= w) W.tiles[y * N + x] = T.WATER;
        }
      }
      acc += len;
    }
  });
}

// Zusammenhängende Landmassen nummerieren (Flüsse zählen zum Land)
function labelLand(W) {
  const N = W.N, id = new Int16Array(N * N);
  let next = 0;
  for (let s = 0; s < N * N; s++) {
    if (W.sea[s] || id[s]) continue;
    next++;
    const q = [s];
    id[s] = next;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % N, y = (i / N) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const ni = ny * N + nx;
        if (!W.sea[ni] && !id[ni]) { id[ni] = next; q.push(ni); }
      }
    }
  }
  return id;
}

// Höhen an den Kachelecken: Wasser liegt auf 0, Land steigt mit der Erhebung an
function computeHeights(W) {
  const N = W.N, M = N + 1;
  const vh = new Float32Array(M * M), vwater = new Uint8Array(M * M);
  const nD = makeNoise(W.seed * 11 + 3);
  for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
    let s = 0, n = 0, water = false;
    for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= N || ty >= N) continue;
      const i = ty * N + tx;
      if (W.tiles[i] === T.WATER || W.tiles[i] === T.BRIDGE) water = true;
      s += W.elev[i]; n++;
    }
    const k = y * M + x;
    if (water) { vh[k] = 0; vwater[k] = 1; continue; }
    const e = n ? s / n : 0.4;
    const t = Math.max(0, Math.min(1, (e - 0.36) / 0.42));
    // Grundform plus Kuppen und Rücken im Hügelland
    const hill = Math.max(0, Math.min(1, (e - 0.52) / 0.16));
    const bumps = (fbm(nD, x / 5.5, y / 5.5, 3) - 0.5) * 58 * hill;
    vh[k] = Math.min(HMAX + 16, Math.max(1, Math.pow(t, 1.4) * HMAX * 0.8 + bumps + 2 + (hash2(x, y, 4242) - 0.5) * 0.8));
  }
  // Ufer abflachen: je näher am Wasser, desto niedriger (keine senkrechten Uferwände)
  const dist = new Int16Array(M * M).fill(-1);
  const queue = [];
  for (let k = 0; k < M * M; k++) if (vwater[k]) { dist[k] = 0; queue.push(k); }
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi], x = k % M, y = (k / M) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= M || ny >= M) continue;
      const nk = ny * M + nx;
      if (dist[nk] >= 0) continue;
      dist[nk] = dist[k] + 1;
      queue.push(nk);
    }
  }
  for (let k = 0; k < M * M; k++) if (dist[k] > 0) vh[k] = Math.min(vh[k], 3 + dist[k] * 11);
  W.M = M; W.vh = vh; W.vwater = vwater;
}

// Orte stehen auf ebenem Grund, Burgen etwas erhöht
function flattenSites(W) {
  const M = W.M;
  for (const s of W.sites) {
    const c = [s.ty * M + s.tx, s.ty * M + s.tx + 1, (s.ty + 1) * M + s.tx, (s.ty + 1) * M + s.tx + 1];
    let target = c.reduce((a, i) => a + W.vh[i], 0) / 4;
    if (s.type === 'spieler' || s.type === 'burg') target += 9;
    target = Math.min(target, HMAX + 16);
    const r = s.clear + 4;
    for (let vy = s.ty - r; vy <= s.ty + r + 1; vy++) for (let vx = s.tx - r; vx <= s.tx + r + 1; vx++) {
      if (vx < 0 || vy < 0 || vx >= M || vy >= M) continue;
      const i = vy * M + vx;
      if (W.vwater[i]) continue;
      const d = Math.hypot(vx - s.x, vy - s.y);
      const w = Math.max(0, Math.min(1, (d - (s.clear - 1)) / 3.5));
      W.vh[i] = target * (1 - w) + W.vh[i] * w;
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

// Nächstes Wasserfeld (Abstand in Kacheln) im Umkreis r, sonst Infinity
function waterDist(W, cx, cy, r) {
  let best = Infinity;
  for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
    const x = cx + ox, y = cy + oy;
    if (x < 0 || y < 0 || x >= W.N || y >= W.N) continue;
    if (W.tiles[y * W.N + x] === T.WATER) best = Math.min(best, Math.hypot(ox, oy));
  }
  return best;
}

// Mindestabstand zweier Orte: die eigene Burg braucht Platz, Lager kommen mit wenig aus
function siteGap(a, b) {
  const lager = a.type === 'lager' || b.type === 'lager';
  if (a.type === 'spieler' || b.type === 'spieler') return lager ? 13 : 17;
  if (lager) return 10;
  return Math.max(10, a.clear + b.clear - 2);
}

// Jeder Ort startet an seiner echten Lage und rückt bei Bedarf zur Seite (auf derselben Landmasse)
function placeSettlements(W, rng) {
  const N = W.N;
  for (const def of SETTLEMENTS) {
    const g = geoToTile(def.lon, def.lat);
    const gx = Math.floor(g.x), gy = Math.floor(g.y);
    const near = nearestWalkableTile(W, gx, gy);
    const home = W.landId[near.y * N + near.x];
    const margin = def.clear + 4;
    const tryFind = (strict, maxR) => {
      let best = null, bestScore = Infinity, bestR = -1;
      for (let r = 0; r <= maxR; r++) {
        if (best && r > bestR + 4) break;
        for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          const x = gx + ox, y = gy + oy;
          if (x < margin || y < margin || x >= N - margin || y >= N - margin) continue;
          const i = y * N + x;
          if (W.tiles[i] === T.WATER || W.landId[i] !== home) continue;
          if (W.sites.some((s) => Math.hypot(s.tx - x, s.ty - y) < siteGap(s, def))) continue;
          const waterR = def.port ? (def.type === 'burg' ? 7 : def.type === 'stadt' ? 5 : 4) : def.type === 'lager' ? 3 : Math.max(4, def.clear - 2);
          if (countAround(W, x, y, waterR, T.WATER) > 0) continue;
          let score = Math.hypot(ox, oy);
          if (strict && def.port) {
            const dw = waterDist(W, x, y, 12);
            if (dw > 11) continue;
            score += dw * 0.5;
          }
          if (def.type === 'lager') {
            const f = countAround(W, x, y, 5, T.FOREST);
            if (strict && f < 24) continue;
            score += (70 - f) * 0.15;
          } else {
            if (W.tiles[i] === T.HILLS) score += 3;
            score += countAround(W, x, y, 3, T.HILLS) * 0.3;
          }
          if (score < bestScore) { bestScore = score; best = { x, y }; bestR = r; }
        }
      }
      return best;
    };
    const best = tryFind(true, 26) || tryFind(false, 44) || near;
    W.sites.push({ ...def, tx: best.x, ty: best.y, x: best.x + 0.5, y: best.y + 0.5, land: home });
  }
}

function nearestWalkableTile(W, tx, ty) {
  const N = W.N;
  for (let r = 0; r < N; r++) {
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      const x = tx + ox, y = ty + oy;
      if (x >= 0 && y >= 0 && x < N && y < N && W.tiles[y * N + x] !== T.WATER) return { x, y };
    }
  }
  return { x: tx, y: ty };
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

// Straßenkosten: Meer ist unpassierbar, über Flüsse führen Brücken
function makeRoadCost(W, yard) {
  return (i) => {
    if (W.sea[i]) return 1e9;
    if (yard && yard[i]) return 60;
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
}

function paveRoad(W, idx) {
  for (const i of idx) W.tiles[i] = W.tiles[i] === T.WATER || W.tiles[i] === T.BRIDGE ? T.BRIDGE : T.ROAD;
}

function buildRoads(W) {
  const N = W.N;
  // Je Landmasse ein minimaler Spannbaum (Prim) plus ein paar Querverbindungen
  const byLand = new Map();
  for (const s of W.sites) {
    if (s.type === 'lager') continue;
    if (!byLand.has(s.land)) byLand.set(s.land, []);
    byLand.get(s.land).push(s);
  }
  const edges = [];
  for (const sites of byLand.values()) {
    if (sites.length < 2) continue;
    const inTree = [sites[0]], rest = sites.slice(1), own = [];
    while (rest.length) {
      let best = null;
      for (const a of inTree) for (const b of rest) {
        const d = Math.hypot(a.tx - b.tx, a.ty - b.ty);
        if (!best || d < best.d) best = { a, b, d };
      }
      own.push(best);
      inTree.push(best.b);
      rest.splice(rest.indexOf(best.b), 1);
    }
    const has = (a, b) => own.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
    const extra = [];
    for (const a of sites) for (const b of sites) {
      if (a.id >= b.id || has(a, b)) continue;
      const d = Math.hypot(a.tx - b.tx, a.ty - b.ty);
      if (d < 58) extra.push({ a, b, d });
    }
    extra.sort((p, q) => p.d - q.d);
    edges.push(...own, ...extra.slice(0, Math.round(sites.length / 3)));
  }

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
  const roadCost = makeRoadCost(W, yard);
  edges.sort((p, q) => p.d - q.d);
  for (const e of edges) {
    const pa = roadPoint(e.a), pb = roadPoint(e.b);
    const idx = astar(N, pa.x, pa.y, pb.x, pb.y, roadCost, { diag: false, maxIter: 260000, hMul: 0.4 });
    if (!idx) continue;
    paveRoad(W, idx);
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

  // Lager der Waldleute: sicherstellen, dass sie erreichbar sind (Trampelpfad, wenn nötig)
  for (const camp of W.sites.filter((s) => s.type === 'lager')) {
    let nearest = null;
    for (const s of byLand.get(camp.land) || []) {
      const d = Math.hypot(s.tx - camp.tx, s.ty - camp.ty);
      if (!nearest || d < nearest.d) nearest = { s, d };
    }
    if (!nearest) continue;
    const walk = (i) => (W.tiles[i] === T.WATER ? 1e9 : TERRAIN_COST[W.tiles[i]]);
    const ok = astar(N, camp.tx, camp.ty, nearest.s.tx, nearest.s.ty, walk, { maxIter: 120000, hMul: 0.6 });
    if (!ok) {
      const idx = astar(N, camp.tx, camp.ty, nearest.s.tx, nearest.s.ty, roadCost, { diag: false, maxIter: 200000, hMul: 0.4 });
      if (idx) for (const i of idx) if (W.tiles[i] === T.WATER) W.tiles[i] = T.BRIDGE;
    }
  }
}

// Häfen: ein Liegeplatz im Wasser, ein Kai an Land und ein Weg vom Ort dorthin
function placeDocks(W) {
  const N = W.N;
  const water = (x, y) => x >= 0 && y >= 0 && x < N && y < N && W.tiles[y * N + x] === T.WATER;
  for (const s of W.sites) {
    if (!s.port) continue;
    let best = null;
    const minR = (WALLED[s.type] || 3) + 2.5;
    for (let y = s.ty - 15; y <= s.ty + 15; y++) for (let x = s.tx - 15; x <= s.tx + 15; x++) {
      if (!water(x, y) || Math.hypot(x - s.tx, y - s.ty) < minR) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && water(x + dx, y + dy)) n++;
      if (n < 6) continue;
      // Kai: Landfeld direkt neben dem Liegeplatz
      let quay = null;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const qx = x + dx * 2, qy = y + dy * 2;
        if (qx < 1 || qy < 1 || qx >= N - 1 || qy >= N - 1) continue;
        const t = W.tiles[qy * N + qx];
        if (t !== T.WATER && t !== T.BRIDGE && W.landId[qy * N + qx] === s.land) {
          if (!quay || Math.hypot(qx - s.tx, qy - s.ty) < Math.hypot(quay.x - s.tx, quay.y - s.ty)) quay = { x: qx, y: qy, dx, dy };
        }
      }
      if (!quay) continue;
      const d = Math.hypot(x - s.tx, y - s.ty) + (W.sea[y * N + x] ? 0 : 1.5);
      if (!best || d < best.d) best = { x, y, d, quay };
    }
    if (!best) { s.port = false; continue; }
    const q = best.quay;
    // Steg vom Kai zum Liegeplatz
    const sx = q.x - q.dx, sy = q.y - q.dy;
    if (W.tiles[sy * N + sx] === T.WATER) W.tiles[sy * N + sx] = T.BRIDGE;
    s.dock = { x: best.x + 0.5, y: best.y + 0.5 };
    s.quay = { x: q.x + 0.5, y: q.y + 0.5 };
    const rp = roadPoint(s);
    const idx = astar(N, rp.x, rp.y, q.x, q.y, makeRoadCost(W, null), { diag: false, maxIter: 40000, hMul: 0.5 });
    if (idx) paveRoad(W, idx.filter((i) => W.tiles[i] !== T.WATER));
    W.buildings.push({ kind: 'ship', x: s.dock.x, y: s.dock.y, site: s.id, dir: Math.atan2(best.y - q.y, best.x - q.x), noCost: true });
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
  const props = (b) => {
    if (b.kind !== 'house' || rng() > 0.7) return;
    const kinds = s.type === 'stadt' || s.type === 'abtei' ? ['fass', 'fass', 'karren', 'beet'] : ['heu', 'holzstapel', 'fass', 'karren', 'beet', 'heu'];
    const n = rng() < 0.35 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const side = rng() < 0.5;
      const x = side ? b.x + b.wx / 2 + 0.3 + rng() * 0.25 : b.x + (rng() - 0.5) * b.wx * 0.8;
      const y = side ? b.y + (rng() - 0.5) * b.wy * 0.8 : b.y + b.wy / 2 + 0.3 + rng() * 0.25;
      const t = W.tiles[Math.floor(y) * W.N + Math.floor(x)];
      if (t === T.WATER || t === T.ROAD || t === T.BRIDGE) continue;
      W.buildings.push({ kind: 'prop', prop: rpick(rng, kinds), x, y, v: rng(), site: s.id });
    }
  };
  const ring = (count, rMin, rMax, mk, gap = 1.7) => {
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 60; tries++) {
      const a = rng() * Math.PI * 2, r = rMin + rng() * (rMax - rMin);
      const x = Math.floor(s.x + Math.cos(a) * r) + 0.5, y = Math.floor(s.y + Math.sin(a) * r) + 0.5;
      if (!freeSpot(W, x, y, gap)) continue;
      if (Math.hypot(x - s.x, y - s.y) < 1.6) continue;
      props(add(mk(x, y)));
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
    if (t === T.FOREST) { n = rng() < 0.55 ? 2 : 1; if (rng() < 0.22) kind = 'mix'; }
    else if (t === T.GRASS && rng() < 0.03) n = 1;
    else if ((t === T.GRASS || t === T.SAND) && rng() < 0.045) { n = 1; kind = 'busch'; }
    else if (t === T.HILLS) { if (rng() < 0.12) { n = 1; kind = 'fels'; } else if (rng() < 0.08) { n = 1; kind = 'nadel'; } }
    for (let k = 0; k < n; k++) {
      const ox = x + 0.15 + rng() * 0.7, oy = y + 0.15 + rng() * 0.7;
      if (nearSite(ox, oy)) continue;
      if (t === T.GRASS && nearBuilding(ox, oy)) continue;
      let kk = kind === 'mix' ? (k === 0 ? 'busch' : 'laub') : kind;
      if (kk === 'laub' && (W.elev[y * N + x] > 0.56 || rng() < 0.3)) kk = 'nadel';
      const ci = Math.floor(oy / CHUNK) * CN + Math.floor(ox / CHUNK);
      W.chunkObjs[ci].push({ kind: kk, x: ox, y: oy, v: Math.floor(rng() * 3), s: 0.8 + rng() * 0.45 });
    }
  }
}
