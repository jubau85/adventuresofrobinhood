// Weltgenerator: Küsten, Flüsse, Bergland, Siedlungen, Straßen, Häfen, Felder, Bäume, Gebäude.
// Alles ist deterministisch aus dem Seed, daher muss nur der Seed gespeichert werden.

import { MAP, MAP_K, MAP_AREA, CHUNK, HMAX, T, TERRAIN_COST, SETTLEMENTS, geoToTile, GEO_SCALE, POIS } from './data.js';
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

// Kann eine Figur hier stehen? Wasser, Mauern und gesperrte Felder nicht, Gebäude genau geprüft.
// animal: Weidetiere dürfen in ihren Pferch.
export function isWalkable(W, x, y, animal = false) {
  if (x < 0.3 || y < 0.3 || x > W.N - 0.3 || y > W.N - 0.3) return false;
  const i = Math.floor(y) * W.N + Math.floor(x);
  if (W.tiles[i] === T.WATER) return false;
  if (W.block[i] && !(animal && W.penTile && W.penTile[i])) return false;
  return !inObstacle(W, x, y, animal);
}

// ---------------------------------------------------------------- Mauern
// Burgmauern und Palisaden sperren ihre Felder. Straßenfelder bleiben offen: Dort ist das Tor.
export function wallRing(W, s, R) {
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

// Nach einem Ausbau fremder Burgen (holdings.js): Mauern und Bergfriede neu als Hindernis eintragen
export function rebuildStaticWalls(W) { buildStaticWalls(W); }
function buildStaticWalls(W) {
  W.wallStatic = new Uint8Array(W.N * W.N);
  markWalls(W, W.wallStatic);
  // Bergfriede der Burgen auch genau als Hindernis
  W.keepObs = W.sites.filter((s) => s.type === 'burg').map((s) => { const kw = s.castleLevel >= 3 ? 2.8 : 2.2; return makeObstacle(s.x - 1.1, s.y - 1.1, kw, kw); });
  W.ogrid = null;
  refreshBuildingBlocks(W);
}

// Stadtmauern, Burgmauern mit Bergfried (wie in render.js castlePieces gezeichnet) und Palisaden
function markWalls(W, arr) {
  for (const s of W.sites) {
    if (s.cityWall) blockTiles(W, arr, s.cityWall);
    if (s.type === 'burg') {
      blockTiles(W, arr, wallRing(W, s, 4));
      const kw = s.castleLevel >= 3 ? 2.8 : 2.2;
      for (const [x, y] of obstacleTiles(W, makeObstacle(s.x - 1.1, s.y - 1.1, kw, kw), false)) arr[y * W.N + x] = 1;
    }
    if (s.palisade) blockTiles(W, arr, palisadeBand(s, false));
  }
}

// ---------------------------------------------------------------- Gebäude als Hindernis
// Häuser, Kirchen, Hallen, Wahrzeichen, Stände, Brunnen, Zelte und Zäune sind Rechtecke.
// Die Bewegung prüft sie genau, um REACH erweitert (so breit ist eine Figur). Die Wegsuche sperrt
// jedes Feld, dessen Mitte darin liegt; dünne Zäune sperren jedes Feld, das sie berühren.
// Straßen und Brücken sperrt ein Ortsgebäude nie, das Feld vor der Tür bleibt frei.
export const REACH = 0.1;
const SOLID_KINDS = { house: 1, church: 1, longhall: 1, klause: 1, stollen: 1, halde: 1, landmark: 1, stall: 1, well: 1, tent: 1, fence: 1, deko: 1 };
function solidRects(b) {
  if (!SOLID_KINDS[b.kind] || !b.wx) return null;
  if (b.kind === 'deko' && !b.solid) return null;
  if (b.kind === 'landmark') {
    if (b.lm === 'tor') return null;
    // Kathedrale: Langhaus und Querschiff statt des ganzen Rechtecks
    if (b.lm === 'kathedrale') { const L = (b.len || 4) * 1.3; return [[b.x, b.y, L, 1.5], [b.x + L * 0.12, b.y, 1.3, Math.min(b.wy, 3.2)]]; }
    if (b.lm === 'motte') return [[b.x, b.y, b.wx * 0.7, b.wy * 0.7]];
  }
  if (b.kind === 'tent') return [[b.x, b.y, b.wx * 0.8, b.wy * 0.8]];
  return [[b.x, b.y, b.wx, b.wy]];
}
// Hindernis aus Mitte und Größe; o.b: das Gebäude (steht es?), o.pen: Pferch, den Tiere betreten
export function makeObstacle(x, y, wx, wy, extra = {}) {
  return { x0: x - wx / 2 - REACH, x1: x + wx / 2 + REACH, y0: y - wy / 2 - REACH, y1: y + wy / 2 + REACH, ...extra };
}
function obstaclesOf(b) {
  if (b._obs) return b._obs;
  const rs = solidRects(b);
  return (b._obs = rs ? rs.map(([x, y, wx, wy]) => makeObstacle(x, y, wx, wy, { b })) : []);
}
// Felder, die ein Hindernis für die Wegsuche sperrt
export function obstacleTiles(W, o, keepRoads = true) {
  const N = W.N, out = [];
  const thin = Math.min(o.x1 - o.x0, o.y1 - o.y0) < 0.6 + 2 * REACH;
  for (let ty = Math.floor(o.y0); ty <= Math.floor(o.y1 - 1e-6); ty++) for (let tx = Math.floor(o.x0); tx <= Math.floor(o.x1 - 1e-6); tx++) {
    if (tx < 1 || ty < 1 || tx >= N - 1 || ty >= N - 1) continue;
    const inside = tx + 0.5 > o.x0 && tx + 0.5 < o.x1 && ty + 0.5 > o.y0 && ty + 0.5 < o.y1;
    if (!inside && !thin) continue;
    const t = W.tiles[ty * N + tx];
    if (t === T.WATER || (keepRoads && (t === T.ROAD || t === T.BRIDGE))) continue;
    out.push([tx, ty]);
  }
  return out;
}
// Tür eines Gebäudes: meist vorn (Richtung +y). Liegt dort Wasser, ist sie auf einer anderen Seite.
// Die Tür rückt so weit vor, dass ihr Feld frei bleibt.
export function doorOf(b, W) {
  if (b._door) return b._door;
  let d, n = [0, 1];
  if (b.kind === 'church') d = { x: b.x + b.wx / 2 - 0.45, y: b.y + b.wy / 2 + 0.55 };
  else if (b.kind === 'landmark' && b.lm === 'kathedrale') d = { x: b.x - (b.len || 4) / 2 + 0.4, y: b.y + 1.0 };
  else if (b.kind === 'stollen') d = { x: b.x - 0.3, y: b.y + b.wy / 2 + 0.45 };
  else if (b.kind === 'klause') d = { x: b.x - 0.1, y: b.y + b.wy / 2 + 0.3 };
  else d = { x: b.x - 0.15, y: b.y + b.wy / 2 + 0.3 };
  if (!W) return d;
  const wet = (p) => W.tiles[Math.floor(p.y) * W.N + Math.floor(p.x)] === T.WATER;
  if (wet(d) && b.kind !== 'landmark') {
    const alt = [[{ x: b.x + 0.15, y: b.y - b.wy / 2 - 0.3 }, [0, -1]], [{ x: b.x + b.wx / 2 + 0.3, y: b.y + 0.1 }, [1, 0]], [{ x: b.x - b.wx / 2 - 0.3, y: b.y + 0.1 }, [-1, 0]]].find(([p]) => !wet(p));
    if (alt) [d, n] = alt;
  }
  const inBody = (p) => obstaclesOf(b).some((o) => { const cx = Math.floor(p.x) + 0.5, cy = Math.floor(p.y) + 0.5; return cx > o.x0 && cx < o.x1 && cy > o.y0 && cy < o.y1; });
  for (let k = 0; k < 3 && inBody(d); k++) d = { x: d.x + n[0] * 0.5, y: d.y + n[1] * 0.5 };
  return (b._door = d);
}
export function buildingTiles(W, b) {
  if (b._bt) return b._bt;
  const out = [];
  for (const o of obstaclesOf(b)) for (const q of obstacleTiles(W, o)) if (!out.some((r) => r[0] === q[0] && r[1] === q[1])) out.push(q);
  return (b._bt = out);
}
// Raster: Feld -> Hindernisse, die hineinragen
function gridAdd(grid, N, o) {
  for (let ty = Math.floor(o.y0); ty <= Math.floor(o.y1); ty++) for (let tx = Math.floor(o.x0); tx <= Math.floor(o.x1); tx++) {
    const i = ty * N + tx;
    const l = grid.get(i);
    if (l) l.push(o); else grid.set(i, [o]);
  }
}
function buildObstacleGrid(W) {
  W.ogrid = new Map();
  for (const b of W.buildings) for (const o of obstaclesOf(b)) gridAdd(W.ogrid, W.N, o);
  for (const o of W.keepObs || []) gridAdd(W.ogrid, W.N, o);
}
// Nächste freie Stelle bei p (für Plätze, die knapp in einem Gebäude oder Stand liegen)
export function freeNear(W, p, maxR = 1.4) {
  if (isWalkable(W, p.x, p.y)) return p;
  for (let r = 0.15; r <= maxR; r += 0.15) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (isWalkable(W, x, y)) return { ...p, x, y };
    }
  }
  return p;
}
// Steht (x, y) in einem Hindernis? animal: Tiere dürfen in ihren Pferch
export function inObstacle(W, x, y, animal = false) {
  const i = Math.floor(y) * W.N + Math.floor(x);
  for (const grid of [W.ogrid, W.cgrid, W.xgrid]) {
    const l = grid && grid.get(i);
    if (!l) continue;
    for (const o of l) {
      if (x <= o.x0 || x >= o.x1 || y <= o.y0 || y >= o.y1) continue;
      if (o.b && !buildingUp(o.b)) continue;
      if (animal && o.pen) continue;
      return o;
    }
  }
  return null;
}
// Häuser, deren Tür niemand erreicht (Tür zum Fluss, in einer Flussschleife ohne Brücke,
// zwischen Mauer und Nachbarhäusern eingeklemmt), werden gar nicht erst gebaut.
export function siteFlood(W, s, block, pad = 16) {
  const N = W.N, R = Math.ceil((s.clear || 4) + pad), D = 2 * R + 1;
  const seen = new Uint8Array(D * D), q = [];
  const id = (x, y) => (Math.abs(x - s.tx) > R || Math.abs(y - s.ty) > R ? -1 : (y - s.ty + R) * D + (x - s.tx + R));
  const open = (x, y) => x > 0 && y > 0 && x < N - 1 && y < N - 1 && W.tiles[y * N + x] !== T.WATER && !block[y * N + x];
  const push = (x, y) => { const k = id(x, y); if (k >= 0 && !seen[k] && open(x, y)) { seen[k] = 1; q.push(x, y); } };
  for (let k = -R; k <= R; k++) { push(s.tx + k, s.ty - R); push(s.tx + k, s.ty + R); push(s.tx - R, s.ty + k); push(s.tx + R, s.ty + k); }
  while (q.length) {
    const y = q.pop(), x = q.pop();
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return (x, y) => { const k = id(Math.floor(x), Math.floor(y)); return k >= 0 && seen[k] === 1; };
}
function pruneLockedHouses(W) {
  const N = W.N, drop = new Set();
  const canDrop = (b) => b.kind === 'house' || (b.kind === 'church' && !b.big);
  for (let pass = 0; pass < 3; pass++) {
    const block = new Uint8Array(N * N);
    markWalls(W, block);
    for (const b of W.buildings) if (!drop.has(b)) for (const [x, y] of buildingTiles(W, b)) block[y * N + x] = 1;
    let changed = false;
    for (const s of W.sites) {
      const bs = W.buildings.filter((b) => b.site === s.id && !drop.has(b) && buildingTiles(W, b).length);
      if (!bs.length) continue;
      const reach = siteFlood(W, s, block);
      for (const b of bs) {
        const d = doorOf(b, W);
        if (reach(d.x, d.y)) continue;
        if (canDrop(b)) { drop.add(b); changed = true; continue; }
        // Kirche oder Wahrzeichen mit versperrter Tür: Die Häuser davor weichen
        for (const h of bs) if (h !== b && canDrop(h) && !drop.has(h) && Math.hypot(h.x - d.x, h.y - d.y) < 2.6) { drop.add(h); changed = true; }
      }
    }
    if (!changed) break;
  }
  if (!drop.size) return;
  // Mit dem Haus verschwinden Fässer, Heu und Beete, die daneben standen
  const near = (p) => [...drop].some((b) => b.site === p.site && Math.abs(p.x - b.x) < b.wx / 2 + 0.75 && Math.abs(p.y - b.y) < b.wy / 2 + 0.75);
  W.buildings = W.buildings.filter((b) => !drop.has(b) && !(b.kind === 'prop' && near(b)));
  // Gasthäuser neu zuordnen, falls eines wegfiel
  for (const s of W.sites) {
    if (!s.tavern) continue;
    const tv = W.buildings.filter((b) => b.site === s.id && b.tavern);
    s.taverns = tv.map((b) => ({ x: b.x, y: b.y + 0.85 }));
    s.tavern = tv.length ? { x: tv[0].x, y: tv[0].y + 0.85, name: s.tavern.name } : null;
  }
}

// Fingerabdruck des Weltaufbaus. Häuser werden im Spielstand über ihre Nummer gespeichert;
// ändert eine neue Version die Ortsanlage, passen alte Nummern nicht mehr (main.js prüft das).
export function worldSig(W) {
  let h = W.buildings.length;
  for (const b of W.buildings) h = (Math.imul(h, 31) + Math.round(b.x * 10) * 7 + Math.round(b.y * 10)) >>> 0;
  return h;
}
// Steht das Haus (oder sind die Wände schon hoch)? Ruinen und leere Bauplätze bleiben begehbar.
export function buildingUp(b) { return !(b.cons < 0.3); }
export function refreshBuildingBlocks(W) {
  const N = W.N;
  if (!W.ogrid) buildObstacleGrid(W);
  W.bblock = new Uint8Array(N * N);
  for (const b of W.buildings) {
    if (!buildingUp(b)) continue;
    for (const [x, y] of buildingTiles(W, b)) W.bblock[y * N + x] = 1;
  }
  W.blockStatic = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) W.blockStatic[i] = W.wallStatic[i] | W.bblock[i];
  setPlayerWalls(W, !!W.playerWalls);
}

// Felder der Palisade, mit oder ohne die Toröffnung im Süden
// Halbe Breite der Toröffnung (Bogenmaß): das gemalte Tor ist gut eine Kachel breit, offen bleibt das mittlere Feld
export const PAL_GATE = 0.15;
export function palisadeBand(s, withGate) {
  const list = [];
  const r = s.palisade;
  for (let y = s.ty - 6; y <= s.ty + 6; y++) for (let x = s.tx - 6; x <= s.tx + 6; x++) {
    const d = Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y);
    const a = Math.atan2(y + 0.5 - s.y, x + 0.5 - s.x);
    if (d >= r - 0.55 && d <= r + 0.45 && (withGate || Math.abs(a - Math.PI / 2) > PAL_GATE)) list.push([x, y]);
  }
  return list;
}

// Mauern von Ashcombe (ab der Holzburg) ein- oder ausschalten. rects: Grundflächen der Burggebäude
// (Bergfried, Saal, Türme, Hütten, Pferche ...), die castle.js je nach Ausbau liefert; ohne Angabe
// bleiben die alten. Sie sperren auch Straßenfelder (ein Wachturm kann am Weg stehen).
export function setPlayerWalls(W, on, rects, R) {
  const N = W.N;
  W.playerWalls = on;
  if (R) W.playerR = R;
  if (rects) W.playerRects = rects;
  // Gebäude deiner Burg und der Burgen der Barone (barons.js) zusammen
  if (rects || W.baronDirty) {
    W.castleObs = [...(W.playerRects || []), ...(W.baronRects || [])].map((r) => makeObstacle(r.x, r.y, r.wx, r.wy, { pen: !!r.pen, castle: true }));
    W.cgrid = new Map();
    for (const o of W.castleObs) gridAdd(W.cgrid, N, o);
    W.baronDirty = false;
  }
  W.block = new Uint8Array(W.blockStatic);
  W.penTile = new Uint8Array(N * N);
  if (on) {
    const s = W.sites.find((x) => x.type === 'spieler');
    blockTiles(W, W.block, wallRing(W, s, W.playerR || 4));
  }
  for (const o of W.castleObs || []) for (const [x, y] of obstacleTiles(W, o, false)) {
    const i = y * N + x;
    if (o.pen && !W.block[i]) W.penTile[i] = 1;
    W.block[i] = 1;
  }
  for (const list of Object.values(W.tempObs || {})) for (const o of list) for (const [x, y] of obstacleTiles(W, o, false)) W.block[y * N + x] = 1;
  // Breschen und geschlossene Tore einer Belagerung wieder eintragen (siege.js)
  if (W.afterBlock) W.afterBlock();
}

// Gebäude auf den Bauplätzen der Barone als Hindernis (Rechtecke {x, y, wx, wy, pen})
export function setBaronRects(W, rects) {
  W.baronRects = rects;
  W.baronDirty = true;
  if (W.blockStatic) setPlayerWalls(W, !!W.playerWalls);
}

// Hindernisse auf Zeit (z. B. der Turnierplatz): unter einem Schlüssel Rechtecke {x, y, wx, wy}; ohne rects wieder fort
export function setTempObstacles(W, key, rects) {
  W.tempObs = W.tempObs || {};
  if (rects && rects.length) W.tempObs[key] = rects.map((r) => makeObstacle(r.x, r.y, r.wx, r.wy, { temp: key }));
  else delete W.tempObs[key];
  W.xgrid = new Map();
  for (const list of Object.values(W.tempObs)) for (const o of list) gridAdd(W.xgrid, W.N, o);
  if (W.blockStatic) setPlayerWalls(W, !!W.playerWalls);
}

export function isBlockedTile(W, x, y) {
  const i = Math.floor(y) * W.N + Math.floor(x);
  return !!W.block[i];
}

// Nächstes freies Feld; (fx, fy): eigentlicher Zielpunkt, damit z. B. bei einer Tür das Feld davor gewählt wird
export function nearestWalkable(W, tx, ty, maxR = 8, fx = tx + 0.5, fy = ty + 0.5) {
  const N = W.N;
  for (let r = 0; r <= maxR; r++) {
    let best = null, bd = Infinity;
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      const x = tx + ox, y = ty + oy;
      if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
      if (W.tiles[y * N + x] === T.WATER || (W.block && W.block[y * N + x])) continue;
      const d = Math.hypot(x + 0.5 - fx, y + 0.5 - fy);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (best) return best;
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
    const a = nearestWalkable(W, gx, gy, 8, tx, ty);
    if (!a) return null;
    gx = a.x; gy = a.y; tx = gx + 0.5; ty = gy + 0.5;
  }
  if (sx === gx && sy === gy) return [{ x: tx, y: ty }];
  if (W.landId[sy * N + sx] !== W.landId[gy * N + gx]) return null;
  const tiles = W.tiles, extra = W.extraCost, block = W.block;
  const far = Math.hypot(gx - sx, gy - sy);
  const hMul = far > 140 ? 0.95 : far > 70 ? 0.8 : 0.6;
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
  const K = GEO_SCALE;

  // Küste: gerasterte Umrisse, leicht verwirbelt
  const poly = rasterLand(N);
  const land = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const wx = x + (fbm(nW, x / (9 * K), y / (9 * K), 3) - 0.5) * 5.5 * K + (nW2(x / 2.5, y / 2.5) - 0.5) * 1.3;
    const wy = y + (fbm(nW, x / (9 * K) + 71, y / (9 * K) + 37, 3) - 0.5) * 5.5 * K + (nW2(x / 2.5 + 13, y / 2.5 + 7) - 0.5) * 1.3;
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
    const e = 0.42 + (fbm(nE, x / (20 * K), y / (20 * K), 4) - 0.5) * 0.2 + Math.min(1, dSea[i] / (10 * K)) * 0.06 + upl[i] * rough;
    elev[i] = e;
    const m = fbm(nM, x / (13 * Math.sqrt(K)) + 50, y / (13 * Math.sqrt(K)) + 50, 4) + wood[i];
    tiles[i] = e > 0.665 ? T.HILLS : m > 0.62 ? T.FOREST : T.GRASS;
  }

  const W = { N, seed, tiles, elev, extraCost, sea, sites: [], buildings: [], chunkObjs: [], CN: N / CHUNK, roads: [], solid: new Uint8Array(N * N) };
  carveRivers(W, nR);
  W.landId = labelLand(W);

  placeSettlements(W, rng);
  for (const s of W.sites) clearAround(W, s);
  addShores(W);
  buildRoads(W);
  placeDocks(W);
  for (const s of W.sites) addFields(W, s, rng);
  addFarms(W, rng);
  // Orte in Flandern bekommen ihren eigenen Zufall: Änderungen dort verschieben nicht den Rest der Welt
  for (const s of W.sites) genBuildings(W, s, s.realm === 'fl' ? mulberry32((seed ^ strHash(s.id)) >>> 0) : rng);
  for (const f of W.farms) genFarm(W, f, rng);
  placePois(W, rng);
  for (const s of W.sites) placeCemetery(W, s);
  pruneLockedHouses(W);
  // Feste Nummer je Gebäude: Schäden werden darüber gespeichert
  W.buildings.forEach((b, i) => { b.idx = i; });
  assignPlots(W);
  scaleBuildings(W);
  placeCamps(W);
  placeWayside(W);
  computeHeights(W);
  flattenSites(W);
  placeTrees(W, rng);
  addWallRuinObjs(W);
  addFieldObjs(W);
  buildStaticWalls(W);
  return W;
}

// Bauplätze: Einige Häuser am Ortsrand stehen am Anfang noch nicht. Dort wird im Lauf des
// Spiels gebaut (siehe dynamics.js). Eigener Zufall je Ort, damit der Rest der Welt gleich bleibt.
const PLOT_TYPES = { stadt: 1, markt: 1, dorf: 1, burg: 1, halle: 1 };
function assignPlots(W) {
  for (const s of W.sites) {
    if (!PLOT_TYPES[s.type]) continue;
    const hs = W.buildings.filter((b) => b.site === s.id && b.kind === 'house' && !b.tavern && !b.smithy);
    if (hs.length < 4) continue;
    hs.sort((a, b) => Math.hypot(b.x - s.x, b.y - s.y) - Math.hypot(a.x - s.x, a.y - s.y));
    const outer = hs.slice(0, Math.max(3, Math.ceil(hs.length * 0.4)));
    const rng = mulberry32((W.seed ^ (s.x * 7919 + s.y * 104729)) >>> 0);
    const n = Math.max(1, Math.min(14, Math.round(hs.length * 0.09)));
    for (let k = 0; k < n && outer.length; k++) outer.splice(Math.floor(rng() * outer.length), 1)[0].plot = true;
  }
}

// Lagerfeuer im Land: Köhler, Jäger, Reisende und Pilger rasten an Waldrändern und abseits der Wege.
// Eigener Zufall, und die Feuer kommen ans Ende der Gebäudeliste, damit Spielstände passen.
const CAMP_KINDS = [
  { kind: 'koehler', name: 'Köhlerlager', roles: ['holzer', 'waldmann'] },
  { kind: 'reisende', name: 'Rastplatz', roles: ['reisender', 'pilger', 'reisender'] },
  { kind: 'jaeger', name: 'Jägerfeuer', roles: ['jaeger', 'waldmann'] },
  { kind: 'hirten', name: 'Hirtenfeuer', roles: ['hirte', 'reisender'] },
  { kind: 'holzfaeller', name: 'Holzfällerlager', roles: ['holzer', 'holzer'] },
  { kind: 'steinbruch', name: 'Steinbruch', roles: ['bergmann', 'bergmann'], hills: true },
  { kind: 'soeldner', name: 'Waldlager', roles: ['waldmann', 'waldmann', 'reisender'] },
];
function placeCamps(W) {
  const N = W.N, rng = mulberry32((W.seed ^ 0xC0FFEE) >>> 0);
  W.camps = [];
  const settled = new Set(W.sites.map((s) => s.land));
  for (let tries = 0; tries < 30000 * MAP_AREA && W.camps.length < Math.round(60 * MAP_AREA * 0.8); tries++) {
    const x = 8 + Math.floor(rng() * (N - 16)), y = 8 + Math.floor(rng() * (N - 16));
    const i = y * N + x;
    if (W.tiles[i] !== T.GRASS || !settled.has(W.landId[i])) continue;
    const forest = countAround(W, x, y, 3, T.FOREST);
    if (forest < 6 || countAround(W, x, y, 2, T.WATER) || countAround(W, x, y, 1, T.ROAD)) continue;
    if (W.sites.some((s) => Math.hypot(s.tx - x, s.ty - y) < s.clear + 9)) continue;
    if (W.farms.some((f) => Math.hypot(f.tx - x, f.ty - y) < 7)) continue;
    if (W.camps.some((c) => Math.hypot(c.tx - x, c.ty - y) < 22)) continue;
    let kind = CAMP_KINDS[Math.floor(rng() * CAMP_KINDS.length)];
    // Steinbrüche nur am Hang; sonst wird es ein anderes Lager
    if (kind.hills && countAround(W, x, y, 4, T.HILLS) < 3) kind = CAMP_KINDS[Math.floor(rng() * 4)];
    const c = { id: `feuer${W.camps.length}`, type: 'lagerfeuer', camp: kind.kind, roles: kind.roles, name: kind.name, tx: x, ty: y, x: x + 0.5, y: y + 0.5, clear: 2, land: W.landId[i] };
    W.camps.push(c);
    W.tiles[i] = T.GRASS;
    const push = (b) => { b.site = c.id; b.idx = W.buildings.length; W.buildings.push(b); };
    push({ kind: 'fire', x: c.x, y: c.y, noCost: true, camp: true });
    push({ kind: 'prop', prop: 'sitzstamm', x: c.x - 0.9, y: c.y + 0.3, v: rng() });
    push({ kind: 'prop', prop: 'sitzstamm', x: c.x + 0.4, y: c.y + 0.95, v: rng() });
    if (kind.kind === 'koehler') push({ kind: 'prop', prop: 'meiler', x: c.x + 1.6, y: c.y - 1.0, v: rng() });
    else if (rng() < 0.7) push({ kind: 'tent', x: c.x - 0.6, y: c.y - 1.3, wx: 0.9, wy: 0.9, color: ['#6d6a4a', '#7a6a4a', '#8a7a5a'][Math.floor(rng() * 3)], noCost: true });
    if (kind.kind === 'jaeger') push({ kind: 'prop', prop: 'wildbret', x: c.x + 1.0, y: c.y - 0.4, v: rng() });
    if (kind.kind === 'holzfaeller') { push({ kind: 'prop', prop: 'holzstapel', x: c.x + 1.3, y: c.y - 0.6, v: rng() }); push({ kind: 'prop', prop: 'holzstapel', x: c.x + 1.0, y: c.y + 0.9, v: rng() }); }
    if (kind.kind === 'steinbruch') { push({ kind: 'prop', prop: 'erzhaufen', x: c.x + 1.3, y: c.y - 0.5, v: rng() }); push({ kind: 'prop', prop: 'erzhaufen', x: c.x - 1.2, y: c.y - 0.9, v: rng() }); }
    if (kind.kind === 'soeldner') push({ kind: 'tent', x: c.x + 1.1, y: c.y - 1.1, wx: 0.9, wy: 0.9, color: '#6a5a3a', noCost: true });
  }
  // Steinbrüche am Fuß der Hügel und Berge, auch ohne Wald ringsum
  const quarry = CAMP_KINDS.find((k) => k.kind === 'steinbruch');
  let nq = W.camps.filter((c) => c.camp === 'steinbruch').length;
  for (let tries = 0; tries < 30000 * MAP_AREA && nq < Math.round(14 * MAP_AREA * 0.8); tries++) {
    const x = 8 + Math.floor(rng() * (N - 16)), y = 8 + Math.floor(rng() * (N - 16));
    const i = y * N + x;
    if (W.tiles[i] !== T.GRASS || !settled.has(W.landId[i])) continue;
    if (countAround(W, x, y, 3, T.HILLS) < 7 || countAround(W, x, y, 2, T.WATER) || countAround(W, x, y, 1, T.ROAD)) continue;
    if (W.sites.some((s) => Math.hypot(s.tx - x, s.ty - y) < s.clear + 8)) continue;
    if (W.farms.some((f) => Math.hypot(f.tx - x, f.ty - y) < 7)) continue;
    if (W.camps.some((c) => Math.hypot(c.tx - x, c.ty - y) < 18)) continue;
    const c = { id: `feuer${W.camps.length}`, type: 'lagerfeuer', camp: quarry.kind, roles: quarry.roles, name: quarry.name, tx: x, ty: y, x: x + 0.5, y: y + 0.5, clear: 2, land: W.landId[i] };
    W.camps.push(c); nq++;
    const push = (b) => { b.site = c.id; b.idx = W.buildings.length; W.buildings.push(b); };
    push({ kind: 'fire', x: c.x, y: c.y, noCost: true, camp: true });
    push({ kind: 'prop', prop: 'sitzstamm', x: c.x - 0.9, y: c.y + 0.3, v: rng() });
    push({ kind: 'prop', prop: 'erzhaufen', x: c.x + 1.3, y: c.y - 0.5, v: rng() });
    push({ kind: 'prop', prop: 'erzhaufen', x: c.x - 1.2, y: c.y - 0.9, v: rng() });
  }
}

// Kleinkram aus dem Paket Orte, nach allen nummerierten Gebäuden angehängt und ohne den Weltzufall (hash2), damit
// sich nichts anderes verschiebt: Wegschreine und Steinkreuze an Wegkreuzungen über Land, ein Baumstumpf mit Axt im
// Holzfällerlager, ein Votivbaum an heiligen Quellen
function placeWayside(W) {
  const N = W.N, tl = W.tiles;
  const road = (x, y) => x >= 0 && y >= 0 && x < N && y < N && (tl[y * N + x] === T.ROAD || tl[y * N + x] === T.BRIDGE);
  const push = (b) => { b.idx = W.buildings.length; W.buildings.push(b); };
  const placed = [];
  for (let y = 2; y < N - 2; y++) for (let x = 2; x < N - 2; x++) {
    if (tl[y * N + x] !== T.ROAD) continue;
    const deg = road(x - 1, y) + road(x + 1, y) + road(x, y - 1) + road(x, y + 1);
    if (deg < 3 || hash2(x, y, 733) > 0.45) continue;
    if (W.sites.some((s) => Math.hypot(s.x - x, s.y - y) < s.clear + 6)) continue;
    if (W.camps.some((c) => Math.hypot(c.x - x, c.y - y) < 6) || placed.some(([px, py]) => Math.hypot(px - x, py - y) < 22)) continue;
    // Eine freie Wiesenkachel neben der Kreuzung (nicht zwischen zwei Wegen)
    let spot = null;
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const qx = x + dx, qy = y + dy, t = tl[qy * N + qx];
      if (t !== T.GRASS || W.solid[qy * N + qx] || road(qx + dx, qy) && road(qx, qy + dy)) continue;
      spot = [qx + 0.5 - dx * 0.15, qy + 0.5 - dy * 0.15]; break;
    }
    if (!spot) continue;
    placed.push([x, y]);
    const cross = hash2(x, y, 734) < (W.sites.some((s) => (s.realm === 'ir' || s.realm === 'sc') && Math.hypot(s.x - x, s.y - y) < 90) ? 0.7 : 0.4);
    push({ kind: 'prop', prop: cross ? 'steinkreuz' : 'wegschrein', x: spot[0], y: spot[1], v: hash2(x, y, 735), wayside: true });
  }
  for (const c of W.camps || []) {
    if (c.camp === 'holzfaeller') push({ kind: 'prop', prop: 'baumstumpf_axt', x: c.x - 1.5, y: c.y - 0.4, v: hash2(c.tx, c.ty, 736), site: c.id });
  }
  for (const s of W.sites) {
    if (s.type === 'einsiedelei' && s.feature === 'quelle') push({ kind: 'prop', prop: 'votivbaum', x: s.x + 3.0, y: s.y - 1.3, v: hash2(s.tx, s.ty, 737), site: s.id });
  }
}

// Häuser im richtigen Verhältnis zu den Figuren: Traufe gut eine Menschenhöhe, darüber ein steiles Dach
function scaleBuildings(W) {
  for (const b of W.buildings) {
    if (b.kind === 'house') { b.h = Math.round(b.h * 1.35); b.rh = Math.round(b.rh * 1.3); }
    else if (b.kind === 'church' || b.kind === 'longhall') b.h = Math.round(b.h * 1.3);
  }
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
    const r = f.r * GEO_SCALE;
    const P = toTilePts(f.pts), R = r * 2.6;
    const x0 = Math.max(0, Math.floor(Math.min(...P.map((p) => p.x)) - R)), x1 = Math.min(N - 1, Math.ceil(Math.max(...P.map((p) => p.x)) + R));
    const y0 = Math.max(0, Math.floor(Math.min(...P.map((p) => p.y)) - R)), y1 = Math.min(N - 1, Math.ceil(Math.max(...P.map((p) => p.y)) + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let d = Infinity;
      if (P.length === 1) d = Math.hypot(x + 0.5 - P[0].x, y + 0.5 - P[0].y);
      else for (let k = 0; k + 1 < P.length; k++) d = Math.min(d, segDist(x + 0.5, y + 0.5, P[k], P[k + 1]));
      if (d < R) field[y * N + x] += f.a * Math.exp(-(d * d) / (r * r));
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
        const w = (r.w[0] + (r.w[1] - r.w[0]) * f) * (r.lake ? GEO_SCALE : 1 + (GEO_SCALE - 1) * 0.35);
        const amp = r.lake ? 0.3 : 1.3 * GEO_SCALE * Math.min(1, dd / 6, (L - dd) / 6);
        const off = (nR(dd * 0.09 / GEO_SCALE, ri * 7.3) - 0.5) * 2 * amp;
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
  // Kleine Hügel im Flachland: sanfte Kuppen abseits von Orten, Höfen und Gebäuden
  const busy = new Uint8Array(N * N);
  const markBusy = (cx, cy, r) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (x >= 0 && y >= 0 && x < N && y < N) busy[y * N + x] = 1;
  };
  for (const s of W.sites) markBusy(s.x, s.y, s.clear + 5);
  for (const f of W.farms) markBusy(f.x, f.y, 4);
  for (const c of W.camps || []) markBusy(c.x, c.y, 2.5);
  for (const b of W.buildings) markBusy(b.x, b.y, Math.max(b.wx || 0.6, b.wy || 0.6) / 2 + 1.2);
  const rk = mulberry32((W.seed ^ 0x51ED) >>> 0);
  let knolls = 0;
  for (let k = 0; k < 4000 * MAP_AREA && knolls < 320 * MAP_AREA; k++) {
    const x = 4 + Math.floor(rk() * (N - 8)), y = 4 + Math.floor(rk() * (N - 8));
    const t0 = W.tiles[y * N + x];
    if ((t0 !== T.GRASS && t0 !== T.FOREST && t0 !== T.FIELD) || W.elev[y * N + x] > 0.55) continue;
    const r = 2 + rk() * 2.6, hh = 13 + rk() * 16;
    let free = true;
    for (let yy = Math.floor(y - r); yy <= y + r && free; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
      const ii = yy * N + xx;
      if (busy[ii] || W.tiles[ii] === T.WATER || W.tiles[ii] === T.BRIDGE) { free = false; break; }
    }
    if (!free) continue;
    knolls++;
    if (!W.knollAt) W.knollAt = { x: x + 0.5, y: y + 0.5 };
    if (!W.knollAt2 && t0 === T.GRASS) W.knollAt2 = { x: x + 0.5, y: y + 0.5 };
    for (let vy = Math.floor(y - r); vy <= y + r + 1; vy++) for (let vx = Math.floor(x - r); vx <= x + r + 1; vx++) {
      if (vx < 0 || vy < 0 || vx >= M || vy >= M) continue;
      const kk = vy * M + vx;
      if (vwater[kk]) continue;
      const d = Math.hypot(vx - x - 0.5, vy - y - 0.5) / r;
      if (d < 1) vh[kk] += hh * (0.5 + 0.5 * Math.cos(d * Math.PI));
    }
  }
  W.knolls = knolls;
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
  // Die eigene Burg und die Burgen der Barone brauchen Platz für ihre Bauplätze
  if (a.type === 'spieler' || b.type === 'spieler' || a.baron || b.baron) return lager ? 18 : 26;
  if (lager) return 16;
  return a.clear + b.clear + 2;
}

// Größe eines Ortes in Feldern (Radius): Großstädte füllen mehrere Bildschirme
// Dörfer, Märkte, Burgen und Abteien sind weitläufig angelegt: Zwischen den Häusern liegen Gärten und Wege.
const SPREAD = { markt: 1.3, dorf: 1.3, burg: 1.3, abtei: 1.3 };
function siteRadius(def) {
  if (def.type === 'stadt') return Math.round((def.cityR || 13) * 1.15);
  return Math.round(def.clear * (SPREAD[def.type] || 1)) + ({ markt: 2, dorf: 2, burg: 2, abtei: 1, halle: 1 }[def.type] || 0);
}

// Jeder Ort startet an seiner echten Lage und rückt bei Bedarf zur Seite (auf derselben Landmasse).
// Gruben und Einsiedeleien kommen zuletzt: Sie suchen sich einen entlegenen Platz in Wald und Hügeln,
// ein gutes Stück entfernt von Städten, Burgen und Dörfern.
const REMOTE = { mine: 1, einsiedelei: 1 };
const REMOTE_GAP = 17;
function placeSettlements(W, rng) {
  const N = W.N;
  const order = SETTLEMENTS.filter((d) => !REMOTE[d.type]).concat(SETTLEMENTS.filter((d) => REMOTE[d.type]));
  for (const def0 of order) {
    const def = { ...def0, clear: siteRadius(def0) };
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
          const waterR = def.port ? (def.type === 'burg' || def.type === 'stadt' ? 5 : 4) : def.type === 'lager' ? 3 : def.type === 'stadt' || def.type === 'markt' ? 4 : Math.min(6, Math.max(4, def.clear - 2));
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
          } else if (REMOTE[def.type]) {
            if (def.type === 'mine') score -= countAround(W, x, y, 4, T.HILLS) * 0.35;
            else score -= (countAround(W, x, y, 4, T.FOREST) + countAround(W, x, y, 4, T.HILLS)) * 0.12;
            // Abstand zum Rand des nächsten Ortes: je näher, desto schlechter
            let near = Infinity;
            for (const o of W.sites) if (!REMOTE[o.type] && o.type !== 'lager') near = Math.min(near, Math.hypot(o.tx - x, o.ty - y) - o.clear);
            if (near < REMOTE_GAP) { if (strict && near < 9) continue; score += (REMOTE_GAP - near) * 2.2; }
          } else {
            if (W.tiles[i] === T.HILLS) score += 3;
            score += countAround(W, x, y, 3, T.HILLS) * 0.3;
          }
          if (score < bestScore) { bestScore = score; best = { x, y }; bestR = r; }
        }
      }
      return best;
    };
    const best = tryFind(true, 34) || tryFind(false, 56) || near;
    W.sites.push({ ...def, tx: best.x, ty: best.y, x: best.x + 0.5, y: best.y + 0.5, land: home });
  }
  // Reihenfolge wie in der Liste, damit der Rest der Welt gleich erzeugt wird
  const rank = new Map(SETTLEMENTS.map((d, i) => [d.id, i]));
  W.sites.sort((a, b) => rank.get(a.id) - rank.get(b.id));
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
    if (s.type === 'lager' || s.type === 'einsiedelei') { if (d <= 2.5) W.tiles[i] = T.GRASS; continue; }
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
function makeRoadCost(W, yard, avoid) {
  return (i) => {
    if (W.sea[i]) return 1e9;
    if (yard && yard[i]) return 60;
    if (avoid && avoid[i]) return 40;
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
    if (s.type === 'lager' || REMOTE[s.type]) continue;
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
      if (d < 58 * GEO_SCALE) extra.push({ a, b, d });
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
  // Um Gruben und Einsiedeleien machen die Straßen einen Bogen
  const avoid = new Uint8Array(N * N);
  for (const s of W.sites) {
    if (!REMOTE[s.type]) continue;
    for (let oy = -8; oy <= 8; oy++) for (let ox = -8; ox <= 8; ox++) {
      const x = s.tx + ox, y = s.ty + oy;
      if (x >= 0 && y >= 0 && x < N && y < N && ox * ox + oy * oy <= 64) avoid[y * N + x] = 1;
    }
  }
  const roadCost = makeRoadCost(W, yard, avoid);
  edges.sort((p, q) => p.d - q.d);
  for (const e of edges) {
    const pa = roadPoint(e.a), pb = roadPoint(e.b);
    const idx = astar(N, pa.x, pa.y, pb.x, pb.y, roadCost, { diag: false, maxIter: 600000, hMul: 0.45 });
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

  // Lager der Waldleute, Gruben und Einsiedeleien: sicherstellen, dass sie erreichbar sind (Brücke, wenn nötig)
  for (const camp of W.sites.filter((s) => s.type === 'lager' || REMOTE[s.type])) {
    let nearest = null;
    for (const s of byLand.get(camp.land) || []) {
      const d = Math.hypot(s.tx - camp.tx, s.ty - camp.ty);
      if (!nearest || d < nearest.d) nearest = { s, d };
    }
    if (!nearest) continue;
    const walk = (i) => (W.tiles[i] === T.WATER ? 1e9 : TERRAIN_COST[W.tiles[i]]);
    const ok = astar(N, camp.tx, camp.ty, nearest.s.tx, nearest.s.ty, walk, { maxIter: 250000, hMul: 0.6 });
    if (!ok) {
      const idx = astar(N, camp.tx, camp.ty, nearest.s.tx, nearest.s.ty, roadCost, { diag: false, maxIter: 400000, hMul: 0.45 });
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

// Halbmesser der Palisade um eine sächsische Halle
const PALISADE_R = 4.5;
function addFields(W, s, rng) {
  const n = { dorf: 4, halle: 3, abtei: 3, spieler: 3, stadt: 3, markt: 2, burg: 2 }[s.type] || 0;
  const N = W.N;
  // Äcker bleiben außerhalb der Palisade (mit einem Streifen Platz davor)
  const keepR = s.type === 'halle' ? PALISADE_R + 1.4 : 0;
  for (let k = 0; k < n; k++) {
    const a = rng() * Math.PI * 2;
    const r = (s.type === 'spieler' || s.baron ? 11 : 5.5) + rng() * 3;
    const cx = Math.floor(s.x + Math.cos(a) * r), cy = Math.floor(s.y + Math.sin(a) * r);
    const w = 2 + Math.floor(rng() * 3), h = 2 + Math.floor(rng() * 2);
    for (let y = cy; y < cy + h; y++) for (let x = cx; x < cx + w; x++) {
      if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
      const i = y * N + x;
      if (keepR && Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y) < keepR) continue;
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
  if (solidNear(W, x, y, Math.min(0.95, minGap), Math.min(0.95, minGap))) return false;
  for (const b of W.buildings) {
    const gx = Math.max(minGap, (b.wx || 0) / 2 + 0.9), gy = Math.max(minGap, (b.wy || 0) / 2 + 0.9);
    if (Math.abs(b.x - x) < gx && Math.abs(b.y - y) < gy) return false;
  }
  return true;
}

// Ist eine Grundfläche frei von Wasser, Straßen und anderen Gebäuden?
// Feste Felder (Stadtmauer, Friedhof) in einem Rechteck um (x, y)?
function solidNear(W, x, y, rx, ry) {
  const N = W.N;
  for (let ty = Math.floor(y - ry); ty <= Math.floor(y + ry); ty++) for (let tx = Math.floor(x - rx); tx <= Math.floor(x + rx); tx++) {
    if (tx >= 0 && ty >= 0 && tx < N && ty < N && W.solid[ty * N + tx]) return true;
  }
  return false;
}
function markSolid(W, x, y, wx, wy) {
  const N = W.N;
  for (let ty = Math.floor(y - wy / 2); ty <= Math.floor(y + wy / 2); ty++) for (let tx = Math.floor(x - wx / 2); tx <= Math.floor(x + wx / 2); tx++) {
    if (tx >= 0 && ty >= 0 && tx < N && ty < N) W.solid[ty * N + tx] = 1;
  }
}

function footprintFree(W, x, y, wx, wy, margin = 0.4) {
  const N = W.N;
  if (solidNear(W, x, y, wx / 2 + margin, wy / 2 + margin)) return false;
  for (let ty = Math.floor(y - wy / 2 - margin); ty <= Math.floor(y + wy / 2 + margin); ty++) {
    for (let tx = Math.floor(x - wx / 2 - margin); tx <= Math.floor(x + wx / 2 + margin); tx++) {
      if (tx < 2 || ty < 2 || tx >= N - 2 || ty >= N - 2) return false;
      const t = W.tiles[ty * N + tx];
      if (t === T.WATER || t === T.ROAD || t === T.BRIDGE) return false;
    }
  }
  for (const b of W.buildings) {
    if (Math.abs(b.x - x) < ((b.wx || 0.6) + wx) / 2 + margin && Math.abs(b.y - y) < ((b.wy || 0.6) + wy) / 2 + margin) return false;
  }
  return true;
}

const TAVERN_SIGNS = ['krug', 'krone', 'hirsch', 'eber', 'schwan'];
const TAVERN_NAMES = ['Zum Goldenen Krug', 'Zur Krone', 'Zum Weißen Hirsch', 'Zum Blauen Eber', 'Zum Schwan', 'Zum Roten Löwen', 'Zur Glocke', 'Zum Pilger'];

// Friedhof neben der Kirche (oder am Ortsrand), umzäunt, mit Steinkreuz
function placeCemetery(W, s) {
  if (s.type === 'lager' || s.type === 'spieler' || s.type === 'mine' || s.type === 'einsiedelei' || s.baron) return;
  const church = W.buildings.find((b) => b.site === s.id && (b.kind === 'church' || (b.kind === 'landmark' && b.lm === 'kathedrale')));
  const pref = church ? { x: church.x + (church.wx || 2) / 2 + 1.6, y: church.y - 0.6 } : { x: s.x - 4.5, y: s.y - 2.5 };
  const wx = 2.6, wy = 2.0, N = W.N;
  // Abstand halten: zum Wasser mindestens anderthalb Felder (kein Zaun im Fluss), kein Ufersand und kein Acker unter
  // den Gräbern, und bei Hallen ganz außerhalb der Palisade
  const clearOf = (x, y) => {
    for (let ty = Math.floor(y - wy / 2 - 1.5); ty <= Math.floor(y + wy / 2 + 1.5); ty++) for (let tx = Math.floor(x - wx / 2 - 1.5); tx <= Math.floor(x + wx / 2 + 1.5); tx++) {
      if (tx < 0 || ty < 0 || tx >= N || ty >= N) return false;
      const t = W.tiles[ty * N + tx];
      if (t === T.WATER || t === T.BRIDGE) return false;
      const near = tx + 1 > x - wx / 2 - 0.5 && tx < x + wx / 2 + 0.5 && ty + 1 > y - wy / 2 - 0.5 && ty < y + wy / 2 + 0.5;
      if (near && (t === T.SAND || t === T.FIELD)) return false;
    }
    if (s.palisade) {
      const nx = Math.max(x - wx / 2, Math.min(s.x, x + wx / 2)), ny = Math.max(y - wy / 2, Math.min(s.y, y + wy / 2));
      const fx = Math.abs(s.x - x) + wx / 2, fy = Math.abs(s.y - y) + wy / 2;
      // ganz draußen (nächster Punkt weiter weg als die Palisade) oder ganz drinnen (fernster Punkt diesseits)
      if (!(Math.hypot(nx - s.x, ny - s.y) > s.palisade + 1 || Math.hypot(fx, fy) < s.palisade - 1)) return false;
    }
    return true;
  };
  for (const strict of [true, false]) for (let r = 0; r <= (strict ? 10 : 6); r += 0.5) {
    const n = Math.max(1, Math.round(r * 8));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, x = pref.x + Math.cos(a) * r, y = pref.y + Math.sin(a) * r;
      if (!footprintFree(W, x, y, wx, wy, 0.3) || (strict && !clearOf(x, y))) continue;
      s.cemetery = { x, y, wx, wy, old: 2 + Math.floor(hash2(Math.round(x), Math.round(y), 5) * 6) };
      markSolid(W, x, y, wx, wy);
      W.buildings.push({ kind: 'friedhof', x, y, wx, wy, site: s.id, noCost: true, label: `Friedhof von ${s.name}` });
      return;
    }
  }
}

// ---------------------------------------------------------------- Städte
// Marktplatz in der Mitte, Hauptstraßen zu den Toren, Ringgassen, Häuserzeilen, Pfarrkirchen,
// Brunnen, Gasthäuser und Schmieden. Große Städte haben eine Mauer mit Toren an den Straßen.
function genCity(W, s, rng, add, house, props, smithy, tavern, hasCathedral) {
  const N = W.N, R = s.clear - 1, cx = s.x, cy = s.y;
  const walled = R >= 12;
  const streets = new Set();
  const inCity = (x, y) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < R - (walled ? 0.9 : 0);
  const street = (x, y, bridge = false) => {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 2 || y < 2 || x >= N - 2 || y >= N - 2 || !inCity(x, y)) return false;
    const i = y * N + x, t = W.tiles[i];
    if (t === T.WATER) { if (!bridge || W.sea[i]) return false; W.tiles[i] = T.BRIDGE; }
    else if (t !== T.BRIDGE) W.tiles[i] = T.ROAD;
    streets.add(i);
    return true;
  };
  // Marktplatz
  for (let y = Math.floor(cy - 2.6); y <= cy + 2.6; y++) for (let x = Math.floor(cx - 2.6); x <= cx + 2.6; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 2.6) street(x, y);
  // Hauptstraßen strahlenförmig, leicht geschwungen, über Flüsse mit Brücken
  const rays = Math.max(6, Math.round(R / 2.2));
  const a0 = rng() * Math.PI;
  for (let k = 0; k < rays; k++) {
    const a = a0 + (k / rays) * Math.PI * 2 + (rng() - 0.5) * 0.25;
    const bend = (rng() - 0.5) * 0.04;
    for (let r = 2.4; r < R + 2; r += 0.4) {
      const aa = a + bend * r;
      street(cx + Math.cos(aa) * r, cy + Math.sin(aa) * r, true);
    }
  }
  // Ringgassen
  for (const f of R >= 12 ? [0.42, 0.68, 0.9] : [0.5, 0.85]) {
    const rr = R * f;
    for (let a = 0; a < Math.PI * 2; a += 0.35 / rr) street(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  // Stadtmauer: Ring knapp außerhalb, Straßen bleiben als Tore offen
  if (walled) {
    s.cityWall = [];
    const seen = new Set();
    for (let a = 0; a < Math.PI * 2; a += 0.3 / R) {
      const x = Math.floor(cx + Math.cos(a) * R), y = Math.floor(cy + Math.sin(a) * R);
      const i = y * N + x;
      if (seen.has(i) || x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
      seen.add(i);
      if (W.tiles[i] === T.WATER) continue;
      s.cityWall.push([x, y]);
      W.solid[i] = 1;
    }
  }
  // Wahrzeichen und Kirchen
  if (!hasCathedral) {
    const spot = freeArea(W, cx - 3.2, cy - 3.4, 2.6, 1.2, 0.3, 6);
    if (spot) add({ kind: 'church', x: spot.x, y: spot.y, wx: 2.6, wy: 1.2, h: 30, big: true });
  }
  // Marktstände rund um den Platz, Brunnen in der Mitte
  for (let k = 0; k < 6 + Math.floor(R / 4); k++) {
    const a = (k / (6 + Math.floor(R / 4))) * Math.PI * 2 + 0.3, r = 1.6 + (k % 2) * 0.6;
    const col = rpick(rng, ['#a33b32', '#3d6fa3', '#d6ad4c', '#5b8a3c', '#7d2a52', '#e8e0cc']);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (!clearOfBuildings(W, x, y, 0.8, 0.6, 0.1)) continue;
    add({ kind: 'stall', x, y, color: col, noCost: true, wx: 0.8, wy: 0.6 });
  }
  add({ kind: 'well', x: cx + 0.15, y: cy - 0.25, wx: 0.6, wy: 0.6, noCost: true });
  // Pfarrkirchen in den Vierteln
  for (let k = 0; k < Math.floor(R / 5); k++) {
    for (let tries = 0; tries < 80; tries++) {
      const a = rng() * Math.PI * 2, r = R * (0.35 + rng() * 0.5);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (!footprintFree(W, x, y, 2.0, 1.0, 0.25)) continue;
      add({ kind: 'church', x, y, wx: 2.0, wy: 1.0, h: 24, big: false });
      break;
    }
  }
  // Brunnen, Gasthäuser und Schmieden in den Vierteln
  for (let k = 0; k < Math.floor(R / 4); k++) {
    for (let tries = 0; tries < 40; tries++) {
      const a = rng() * Math.PI * 2, r = R * (0.3 + rng() * 0.55);
      const x = Math.floor(cx + Math.cos(a) * r) + 0.5, y = Math.floor(cy + Math.sin(a) * r) + 0.5;
      if (W.tiles[Math.floor(y) * N + Math.floor(x)] !== T.ROAD || !freeSpot(W, x + 0.6, y, 0.9)) continue;
      add({ kind: 'well', x: x + 0.6, y, wx: 0.6, wy: 0.6, noCost: true });
      break;
    }
  }
  for (let k = 0; k < 1 + Math.floor(R / 7); k++) tavern(3, R * 0.8);
  for (let k = 0; k < 1 + Math.floor(R / 6); k++) smithy();
  // Häuserzeilen entlang der Gassen, die Längsseite zur Straße
  // Nicht jede Gasse ist zugebaut: höchstens so viele Häuser, dass Höfe und Gärten Platz haben
  const list = [...streets], rowHouses = [], maxRow = Math.round(R * R * 0.21);
  for (let k = list.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [list[k], list[j]] = [list[j], list[k]]; }
  for (const i of list) {
    const x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (rng() > 0.78 || rowHouses.length >= maxRow) continue;
      const hx = x + dx, hy = y + dy;
      if (!inCity(hx, hy) || Math.hypot(hx + 0.5 - cx, hy + 0.5 - cy) < 3.6) continue;
      const t = W.tiles[hy * N + hx];
      if (t === T.ROAD || t === T.BRIDGE || t === T.WATER) continue;
      const px = hx + 0.5 - dx * 0.08, py = hy + 0.5 - dy * 0.08;
      if (!freeSpot(W, px, py, 1.02)) continue;
      const alongX = dy !== 0;
      // Lücken in der Zeile: Oft bleibt neben dem Nachbarhaus ein Hof oder Garten frei
      if (rng() < 0.6 && rowHouses.some((o) => (alongX ? Math.abs(o.y - py) < 0.6 && Math.abs(o.x - px) < 2.5 : Math.abs(o.x - px) < 0.6 && Math.abs(o.y - py) < 2.5))) continue;
      rowHouses.push({ x: px, y: py });
      const big = rng() < 0.3;
      props(add(house(px, py, {
        wx: alongX ? 0.95 + rng() * 0.25 : 0.8 + rng() * 0.12, wy: alongX ? 0.8 + rng() * 0.12 : 0.95 + rng() * 0.25,
        h: big ? 22 + rng() * 8 : 15 + rng() * 8, rh: 11 + rng() * 5,
        roof: rng() < 0.3 ? 'tile' : rng() < 0.12 ? 'slate' : 'thatch',
        wall: rpick(rng, ['timber', 'timber', 'plaster', 'stone', 'timber', 'plaster']),
      })));
    }
  }
}

// Grundfläche so groß, wie das Wahrzeichen gezeichnet wird (Ringmauer, Querhaus, Baukran)
const LANDMARK_SIZE = { kathedrale: [4, 2.6], tower: [3.7, 3.4], motte: [3.2, 3.2], rundturm: [2.6, 2.6], rundturm_ir: [2.4, 1.6], tuchhalle: [3.4, 1.8], tor: [5.5, 5.5] };

// Freie Stelle für eine Grundfläche in der Nähe eines Wunschortes suchen
function freeArea(W, px, py, wx, wy, margin, maxR) {
  for (let r = 0; r <= maxR; r += 0.5) {
    const n = Math.max(1, Math.round(r * 8));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, x = px + Math.cos(a) * r, y = py + Math.sin(a) * r;
      if (footprintFree(W, x, y, wx, wy, margin)) return { x, y };
    }
  }
  return null;
}

// Nur Gebäude und feste Felder prüfen (Stände und Zelte dürfen auf Straßen und Plätzen stehen)
function clearOfBuildings(W, x, y, wx, wy, margin) {
  if (solidNear(W, x, y, wx / 2 + margin, wy / 2 + margin)) return false;
  for (const b of W.buildings) {
    if (!b.wx || b.kind === 'prop') continue;
    if (Math.abs(b.x - x) < (b.wx + wx) / 2 + margin && Math.abs(b.y - y) < (b.wy + wy) / 2 + margin) return false;
  }
  return true;
}

// Wahrzeichen zuerst setzen, die Häuser ordnen sich darum herum
function placeLandmark(W, s, lm) {
  const [wx, wy] = lm.kind === 'kathedrale' ? [(lm.len || 4) * 1.3 + (lm.scaffold ? 1.6 : 0.2), 3.9] : LANDMARK_SIZE[lm.kind];
  let pref;
  if (lm.near === 'dock' && s.dock) {
    const dx = s.dock.x - s.x, dy = s.dock.y - s.y, d = Math.hypot(dx, dy) || 1;
    pref = { x: s.x + (dx / d) * 4.5 + (dy / d) * 3.5, y: s.y + (dy / d) * 4.5 - (dx / d) * 3.5 };
  } else {
    const abbey = s.type === 'abtei';
    pref = {
      kathedrale: abbey ? { x: s.x - 0.3, y: s.y - 2.8 } : { x: s.x - 3.8, y: s.y - 4.0 },
      tower: { x: s.x + 4.2, y: s.y + 1.6 }, motte: { x: s.x + 5, y: s.y - 4 }, rundturm: { x: s.x + 4.4, y: s.y + 2.4 }, rundturm_ir: { x: s.x + 3.2, y: s.y - 3.0 },
      tuchhalle: { x: s.x - 2.8, y: s.y - 3.2 }, tor: { x: s.x - 10, y: s.y + 7 },
    }[lm.kind];
  }
  let spot = null;
  for (let r = 0; r <= 7 && !spot; r += 0.5) {
    for (let k = 0; k < Math.max(1, Math.round(r * 8)) && !spot; k++) {
      const a = (k / Math.max(1, Math.round(r * 8))) * Math.PI * 2;
      const x = pref.x + Math.cos(a) * r, y = pref.y + Math.sin(a) * r;
      if (footprintFree(W, x, y, wx, wy, lm.kind === 'tor' ? 0 : 0.4)) spot = { x, y };
    }
  }
  if (!spot) return;
  const b = { ...lm, kind: 'landmark', lm: lm.kind, x: spot.x, y: spot.y, wx, wy, site: s.id, label: lm.name };
  W.buildings.push(b);
  if (lm.kind !== 'tor') markCost(W, b);
}

function genBuildings(W, s, rng) {
  const add = (b) => { b.site = s.id; W.buildings.push(b); if (b.wx && !b.noCost) markCost(W, b); return b; };
  const house = (x, y, o = {}) => ({
    kind: 'house', x, y,
    wx: o.wx ?? 0.9 + rng() * 0.5, wy: o.wy ?? 0.8 + rng() * 0.4,
    h: (o.h ?? 13 + rng() * 8) * 1.2, rh: (o.rh ?? 11 + rng() * 6) * 1.2,
    wall: o.wall ?? rpick(rng, ['plaster', 'timber', 'timber']),
    roof: o.roof ?? 'thatch', chimney: rng() < 0.45, lit: rng() < 0.75,
  });
  const props = (b) => {
    if (b.kind !== 'house' || rng() > 0.7) return;
    const kinds = s.type === 'stadt' || s.type === 'abtei' ? ['fass', 'fass', 'karren', 'beet', 'kisten'] : ['heu', 'holzstapel', 'fass', 'karren', 'beet', 'heu'];
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
  const ring = (count, rMin, rMax, mk, gap = 2.3) => {
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
  // Was später gezeichnet wird, aber nicht in der Gebäudeliste steht, als feste Felder vormerken:
  // die Burgmauer (8 × 8 Felder mit Ecktürmen), die Palisade der Halle, der Ring der Stadtmauer
  if (s.type === 'burg') markSolid(W, s.x, s.y, 9.6, 9.6);
  if (s.type === 'halle') {
    for (let a = 0; a < Math.PI * 2; a += 0.12) markSolid(W, s.x + Math.cos(a) * 4.5, s.y + Math.sin(a) * 4.5, 0.4, 0.4);
  }
  if (s.type === 'stadt' && s.clear - 1 >= 12) {
    const R = s.clear - 1;
    for (let a = 0; a < Math.PI * 2; a += 0.3 / R) { const x = Math.floor(s.x + Math.cos(a) * R), y = Math.floor(s.y + Math.sin(a) * R); if (x > 0 && y > 0 && x < W.N && y < W.N) W.solid[y * W.N + x] = 1; }
  }
  if (s.realm === 'fl' && s.type === 'stadt') carveGrachten(W, s, rng);
  const lms = s.landmarks || [];
  const hasCathedral = lms.some((l) => l.kind === 'kathedrale');
  for (const lm of lms) placeLandmark(W, s, lm);
  // Werkstatt mit Amboss (Schmied) für die Tagesarbeit der Bewohner
  const smithy = () => {
    if (!['stadt', 'markt', 'dorf', 'halle', 'burg'].includes(s.type)) return;
    for (let k = 0; k < 40; k++) {
      const a = rng() * Math.PI * 2, r = 3 + rng() * Math.max(3, s.clear * 0.6);
      const x = Math.floor(s.x + Math.cos(a) * r) + 0.5, y = Math.floor(s.y + Math.sin(a) * r) + 0.5;
      if (!freeSpot(W, x, y, 2.3) || Math.hypot(x - s.x, y - s.y) < 2) continue;
      add({ kind: 'house', x, y, wx: 1.0, wy: 0.9, h: 13, rh: 10, wall: 'timber', roof: 'thatch', chimney: true, lit: true, smithy: true });
      const ax = W.tiles[Math.floor(y + 0.3) * W.N + Math.floor(x + 0.9)] === T.WATER ? x - 0.9 : x + 0.9;
      W.buildings.push({ kind: 'prop', prop: 'amboss', x: ax, y: y + 0.3, v: rng(), site: s.id });
      return;
    }
  };
  // Wirtshaus mit Schild, Bänken und Fässern
  const tavern = (rMin = s.type === 'burg' ? 6.4 : 2.4, rSpan = 2.4) => {
    if (!['stadt', 'markt', 'dorf', 'halle', 'burg'].includes(s.type)) return;
    for (let k = 0; k < 60; k++) {
      const a = rng() * Math.PI * 2, r = rMin + rng() * rSpan;
      const x = Math.floor(s.x + Math.cos(a) * r) + 0.5, y = Math.floor(s.y + Math.sin(a) * r) + 0.5;
      if (!freeSpot(W, x, y, 2.5) || Math.hypot(x - s.x, y - s.y) < 2) continue;
      if (s.type === 'burg' && Math.hypot(x - s.x, y - s.y) < 5.8) continue;
      add({ kind: 'house', x, y, wx: 1.5, wy: 1.1, h: 17, rh: 12, wall: 'timber', roof: 'thatch', chimney: true, lit: true, tavern: true, sign: rpick(rng, TAVERN_SIGNS) });
      W.buildings.push({ kind: 'prop', prop: 'fass', x: x + 0.95, y: y - 0.2, v: rng(), site: s.id });
      if (!s.tavern) s.tavern = { x, y: y + 0.85, name: `Gasthaus ${rpick(rng, TAVERN_NAMES)}` };
      (s.taverns || (s.taverns = [])).push({ x, y: y + 0.85 });
      return;
    }
  };
  if (s.type !== 'stadt' && s.type !== 'halle' && !s.baron) tavern();
  switch (s.type) {
    case 'stadt':
      genCity(W, s, rng, add, house, props, smithy, tavern, hasCathedral);
      break;
    case 'markt': {
      // Marktzelte, Pferch und Stände zuerst, damit die Häuser sich darum herum ordnen
      let tents = 0;
      // Zelte und Stände nur auf trockenem Land (in Hafenorten reicht das Wasser bis an den Markt)
      const dry = (x, y, wx, wy) => { for (const [px, py] of [[x - wx / 2, y - wy / 2], [x + wx / 2, y - wy / 2], [x - wx / 2, y + wy / 2 + 0.7], [x + wx / 2, y + wy / 2 + 0.7]]) if (W.tiles[Math.floor(py) * W.N + Math.floor(px)] === T.WATER) return false; return true; };
      for (let k = 0; k < 5; k++) {
        const col = rpick(rng, ['#a33b32', '#3d6fa3', '#d6ad4c', '#e8e0cc', '#5b8a3c']);
        const x = s.x + 3 + k * 1.15, y = s.y - 3.6;
        if (!clearOfBuildings(W, x, y, 0.9, 0.9, 0.15) || !dry(x, y, 0.9, 0.9)) continue;
        add({ kind: 'tent', x, y, wx: 0.9, wy: 0.9, color: col, noCost: true });
        tents++;
      }
      if (tents >= 3 && clearOfBuildings(W, s.x + 5.3, s.y - 2.2, 5.8, 0.4, 0.1) && dry(s.x + 5.3, s.y - 2.2, 5.8, 0.4)) add({ kind: 'fence', x: s.x + 5.3, y: s.y - 2.2, x1: s.x + 2.4, x2: s.x + 8.2, wx: 5.8, wy: 0.3, noCost: true });
      for (const [dx, dy, col] of [[1.2, 1.1, '#a33b32'], [-1.3, 0.9, '#d6ad4c']]) {
        if (clearOfBuildings(W, s.x + dx, s.y + dy, 0.8, 0.6, 0.1) && dry(s.x + dx, s.y + dy, 0.8, 0.6)) add({ kind: 'stall', x: s.x + dx, y: s.y + dy, color: col, noCost: true, wx: 0.8, wy: 0.6 });
      }
      smithy();
      ring(9, 7, s.clear - 0.5, (x, y) => house(x, y, { roof: rng() < 0.3 ? 'tile' : 'thatch' }));
      ring(7, 3.2, 6.6, (x, y) => house(x, y, { roof: rng() < 0.4 ? 'tile' : 'thatch' }));
      break;
    }
    case 'dorf':
      ring(8 + Math.floor(rng() * 4), 2.4, s.clear - 0.8, (x, y) => house(x, y));
      smithy();
      { const wl = freeArea(W, s.x + 0.9, s.y + 0.7, 0.6, 0.6, 0.2, 3); if (wl) add({ kind: 'well', x: wl.x, y: wl.y, wx: 0.6, wy: 0.6, noCost: true }); }
      break;
    case 'halle': {
      const lh = freeArea(W, s.x - 0.4, s.y - 1.6, 3.2, 1.4, 0.3, 2.5) || { x: s.x - 0.4, y: s.y - 1.6 };
      add({ kind: 'longhall', x: lh.x, y: lh.y, wx: 3.2, wy: 1.4, h: 20 });
      tavern(2.4, 1.2);
      if (!s.tavern) tavern(5.6, 2.5);
      ring(3, 2.2, 3.4, (x, y) => house(x, y, { wall: 'wood' }), 1.7);
      s.palisade = PALISADE_R;
      break;
    }
    case 'burg':
      s.castleLevel = s.castleLevel || (s.id === 'torquilstone' ? 3 : 2);
      // Burgen der Barone: Die Gebäude stehen auf Bauplätzen wie bei dir (barons.js), dazu nur ein paar Katen weiter draußen
      if (s.baron) { ring(5, s.clear + 9, s.clear + 11, (x, y) => house(x, y)); break; }
      ring(12, 6.4, s.clear - 0.5, (x, y) => house(x, y));
      smithy();
      break;
    case 'abtei':
      // Kloster mit Kirche und Kreuzgang (gemalt aus dem Paket York); wo eine Kathedrale steht, nur die Klostergebäude
      let kloster = null;
      if (!hasCathedral) { const ch = freeArea(W, s.x - 0.5, s.y - 1.6, 2.6, 2.4, 0.3, 3); if (ch) kloster = add({ kind: 'church', x: ch.x, y: ch.y, wx: 2.6, wy: 2.4, h: 34, big: true, abbey: true }); }
      // Klostergebäude: Dormitorium und Refektorium, wo neben der Kirche Platz ist
      for (const [dx, dy, wx, wy, h, rh] of kloster ? [] : [[2.2, -1.2, 1.0, 2.2, 18, 12], [-2.6, 1.4, 2.0, 1.0, 16, 10]]) {
        const sp = freeArea(W, s.x + dx, s.y + dy, wx, wy, 0.3, 3.5);
        if (sp) add({ kind: 'house', x: sp.x, y: sp.y, wx, wy, h, rh, wall: 'stone', roof: 'tile', lit: true });
      }
      ring(7, 3.8, s.clear - 0.5, (x, y) => house(x, y));
      { const wl = freeArea(W, s.x + 0.4, s.y + 1.1, 0.6, 0.6, 0.2, 2.5); if (wl) add({ kind: 'well', x: wl.x, y: wl.y, wx: 0.6, wy: 0.6, noCost: true }); }
      break;
    case 'mine':
      // Stollen im Hang, Abraumhalde, Erzhaufen, Karren und die Hütten der Bergleute
      add({ kind: 'stollen', x: s.x - 0.6, y: s.y - 1.8, wx: 2.4, wy: 1.5, ore: s.ore, noCost: true });
      add({ kind: 'halde', x: s.x + 2.3, y: s.y - 1.5, wx: 2.2, wy: 1.8, ore: s.ore, noCost: true });
      W.buildings.push({ kind: 'prop', prop: 'erzhaufen', ore: s.ore, x: s.x + 0.7, y: s.y + 0.1, v: rng(), site: s.id });
      W.buildings.push({ kind: 'prop', prop: 'karren', x: s.x - 0.5, y: s.y + 0.5, v: rng(), site: s.id });
      W.buildings.push({ kind: 'prop', prop: 'holzstapel', x: s.x - 2.2, y: s.y + 0.4, v: rng(), site: s.id });
      ring(3, 2.6, s.clear + 0.5, (x, y) => house(x, y, { wall: rng() < 0.5 ? 'wood' : 'stone', roof: 'thatch', wx: 1.0, wy: 0.85 }), 1.9);
      break;
    case 'einsiedelei':
      // Klause des Einsiedlers und der heilige Ort daneben
      add({ kind: 'klause', x: s.x - 0.9, y: s.y - 0.7, wx: 1.2, wy: 1.2, h: 15, noCost: true });
      add({ kind: 'mystic', x: s.x + 1.3, y: s.y + 0.2, feature: s.feature, wx: 2.2, wy: 2.0, noCost: true });
      W.buildings.push({ kind: 'prop', prop: 'beet', x: s.x - 1.0, y: s.y + 0.9, v: rng(), site: s.id });
      W.buildings.push({ kind: 'prop', prop: 'holzstapel', x: s.x - 2.0, y: s.y - 0.2, v: rng(), site: s.id });
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
  if (s.realm === 'fl') flemishExtras(W, s, rng, add);
}

// Kurzer Hash eines Namens (für den eigenen Zufall eines Ortes)
function strHash(str) {
  let h = 2166136261;
  for (let k = 0; k < str.length; k++) h = Math.imul(h ^ str.charCodeAt(k), 16777619);
  return h >>> 0;
}

// Grachten in Brügge: ein Ring zwischen den Ringgassen und ein Arm hinaus durch die Stadtmauer. Wo schon ein Weg liegt,
// wird er zur Brücke; die Hauptstraßen queren den Ring später auf Brücken (genCity), die Ringgassen enden am Wasser.
function carveGrachten(W, s, rng) {
  const N = W.N, R = s.clear - 1, rr = R * 0.56;
  const wet = (x, y) => {
    if (x < 2 || y < 2 || x >= N - 2 || y >= N - 2) return;
    const i = y * N + x, t = W.tiles[i];
    if (t === T.WATER || t === T.BRIDGE) return;
    W.tiles[i] = t === T.ROAD ? T.BRIDGE : T.WATER;
  };
  for (let y = Math.floor(s.y - rr - 2); y <= s.y + rr + 2; y++) for (let x = Math.floor(s.x - rr - 2); x <= s.x + rr + 2; x++) {
    if (Math.abs(Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y) - rr) < 0.62) wet(x, y);
  }
  const a = rng() * Math.PI * 2;
  for (let r = rr; r < R + 2.5; r += 0.3) wet(Math.floor(s.x + Math.cos(a) * r), Math.floor(s.y + Math.sin(a) * r));
  s.gracht = { r: rr, arm: a };
}

// Flandern: Windmühlen vor dem Ort; in Brügge Lastkähne auf der Gracht und ein Tretkran am Kai
function flemishExtras(W, s, rng, add) {
  const N = W.N;
  const mills = s.type === 'stadt' ? 3 : s.type === 'markt' ? 2 : 1;
  for (let k = 0, placed = 0; k < 120 && placed < mills; k++) {
    const a = rng() * Math.PI * 2, r = s.clear + 0.8 + rng() * 3.5;
    const x = Math.floor(s.x + Math.cos(a) * r) + 0.5, y = Math.floor(s.y + Math.sin(a) * r) + 0.5;
    if (x < 3 || y < 3 || x >= N - 3 || y >= N - 3) continue;
    const t = W.tiles[Math.floor(y) * N + Math.floor(x)];
    if (t !== T.GRASS && t !== T.FIELD) continue;
    if (!freeSpot(W, x, y, 2.4) || countAround(W, Math.floor(x), Math.floor(y), 2, T.WATER) || countAround(W, Math.floor(x), Math.floor(y), 1, T.ROAD)) continue;
    add({ kind: 'deko', name: 'windmuehle', x, y, wx: 1.0, wy: 1.0, solid: true });
    placed++;
  }
  if (!s.gracht) return;
  const { r: rr } = s.gracht;
  const isWet = (x, y) => W.tiles[Math.floor(y) * N + Math.floor(x)] === T.WATER;
  // Lastkähne längs der Gracht, die Längsseite nach der Richtung des Rings
  for (let k = 0, placed = 0; k < 40 && placed < 3; k++) {
    const a = rng() * Math.PI * 2;
    const x = Math.floor(s.x + Math.cos(a) * rr) + 0.5, y = Math.floor(s.y + Math.sin(a) * rr) + 0.5;
    if (!isWet(x, y) || !isWet(x + Math.sin(a) * 0.9, y - Math.cos(a) * 0.9)) continue;
    if (W.buildings.some((b) => b.name === 'lastkahn' && Math.hypot(b.x - x, b.y - y) < 4)) continue;
    // Ringrichtung (−sin a, cos a): mehr entlang y als entlang x heißt, das Bild bleibt ungespiegelt
    add({ kind: 'deko', name: 'lastkahn', x, y, flip: Math.abs(Math.sin(a)) > Math.abs(Math.cos(a)), noCost: true });
    placed++;
  }
  // Tretkran auf einem Feld am Kai, nahe dem Markt
  for (let k = 0; k < 80; k++) {
    const a = rng() * Math.PI * 2, r = rr + (rng() < 0.5 ? -1 : 1);
    const x = Math.floor(s.x + Math.cos(a) * r) + 0.5, y = Math.floor(s.y + Math.sin(a) * r) + 0.5;
    const t = W.tiles[Math.floor(y) * N + Math.floor(x)];
    if (t === T.WATER || t === T.ROAD || t === T.BRIDGE || !countAround(W, Math.floor(x), Math.floor(y), 1, T.WATER)) continue;
    if (!freeSpot(W, x, y, 1.3)) continue;
    add({ kind: 'deko', name: 'tretkran', x, y, wx: 0.9, wy: 0.9, solid: true });
    break;
  }
}

// Einzelhöfe abseits der Orte, nahe an Straßen: Das Land wirkt bewohnt
function addFarms(W, rng) {
  const N = W.N;
  W.farms = [];
  const settled = new Set(W.sites.map((s) => s.land));
  const roadNear = (x, y, r) => {
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      const tx = x + ox, ty = y + oy;
      if (tx >= 0 && ty >= 0 && tx < N && ty < N && W.tiles[ty * N + tx] === T.ROAD) return true;
    }
    return false;
  };
  for (let tries = 0; tries < 24000 * MAP_AREA && W.farms.length < Math.round(150 * MAP_AREA * 0.8); tries++) {
    const x = 10 + Math.floor(rng() * (N - 20)), y = 10 + Math.floor(rng() * (N - 20));
    const i = y * N + x;
    if (W.tiles[i] !== T.GRASS || !settled.has(W.landId[i])) continue;
    if (W.sites.some((s) => Math.hypot(s.tx - x, s.ty - y) < s.clear + 7)) continue;
    if (W.farms.some((f) => Math.hypot(f.tx - x, f.ty - y) < 10)) continue;
    if (countAround(W, x, y, 3, T.WATER) || countAround(W, x, y, 1, T.ROAD) || countAround(W, x, y, 2, T.HILLS) > 3) continue;
    if (!roadNear(x, y, 6)) continue;
    W.farms.push({ id: `hof${W.farms.length}`, type: 'hof', name: 'Gehöft', tx: x, ty: y, x: x + 0.5, y: y + 0.5, clear: 3, land: W.landId[i] });
  }
  // Ackerstreifen neben jedem Hof
  for (const f of W.farms) {
    const n = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2, r = 2.6 + rng() * 1.5;
      const cx = Math.floor(f.x + Math.cos(a) * r), cy = Math.floor(f.y + Math.sin(a) * r);
      const w = 2 + Math.floor(rng() * 2), h = 2 + Math.floor(rng() * 2);
      for (let yy = cy; yy < cy + h; yy++) for (let xx = cx; xx < cx + w; xx++) {
        if (xx < 1 || yy < 1 || xx >= N - 1 || yy >= N - 1) continue;
        if (W.tiles[yy * N + xx] === T.GRASS) W.tiles[yy * N + xx] = T.FIELD;
      }
    }
  }
}

function genFarm(W, f, rng) {
  const add = (b) => { b.site = f.id; W.buildings.push(b); if (b.wx && !b.noCost) markCost(W, b); return b; };
  add({ kind: 'house', x: f.x, y: f.y, wx: 1.1 + rng() * 0.4, wy: 0.9 + rng() * 0.3, h: (12 + rng() * 4) * 1.2, rh: (12 + rng() * 4) * 1.2, wall: rpick(rng, ['plaster', 'timber', 'timber', 'wood']), roof: 'thatch', chimney: false, lit: rng() < 0.8 });
  if (rng() < 0.55 && freeSpot(W, f.x + 1.8, f.y - 0.6, 1.2)) add({ kind: 'house', x: f.x + 1.8, y: f.y - 0.6, wx: 1.3, wy: 0.9, h: 11, rh: 12, wall: 'wood', roof: 'thatch', chimney: false, lit: false });
  const kinds = ['heu', 'holzstapel', 'beet', 'karren', 'heu', 'beet'];
  const n = 1 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    const x = f.x + (rng() - 0.3) * 2.6, y = f.y + 0.9 + rng() * 1.2;
    const t = W.tiles[Math.floor(y) * W.N + Math.floor(x)];
    if (t === T.WATER || t === T.ROAD || t === T.BRIDGE) continue;
    W.buildings.push({ kind: 'prop', prop: rpick(rng, kinds), x, y, v: rng(), site: f.id });
  }
}

// Sehenswürdigkeiten: Stonehenge als Steinkreis, der Hadrianswall als Kette von Mauerresten
function placePois(W, rng) {
  const N = W.N;
  W.pois = [];
  W.wallRuins = [];
  for (const p of POIS) {
    if (p.kind === 'wall') {
      const P = p.pts.map(([lon, lat]) => geoToTile(lon, lat));
      for (let k = 0; k + 1 < P.length; k++) {
        const a = P[k], b = P[k + 1], len = Math.hypot(b.x - a.x, b.y - a.y), dir = Math.atan2(b.y - a.y, b.x - a.x);
        for (let d = 0; d < len; d += 0.9) {
          const x = a.x + ((b.x - a.x) * d) / len, y = a.y + ((b.y - a.y) * d) / len;
          const t = W.tiles[Math.floor(y) * N + Math.floor(x)];
          if (t === T.WATER || t === T.ROAD || t === T.BRIDGE || t === T.FIELD) continue;
          if (rng() < 0.22) continue;
          W.wallRuins.push({ x, y, dir, h: 6 + rng() * 10, tower: W.wallRuins.length % 9 === 4 });
        }
      }
      const mid = geoToTile(p.lon, p.lat);
      W.pois.push({ ...p, x: mid.x, y: mid.y });
      continue;
    }
    const g = geoToTile(p.lon, p.lat);
    const near = nearestWalkableTile(W, Math.floor(g.x), Math.floor(g.y));
    let spot = { x: near.x + 0.5, y: near.y + 0.5 };
    for (let r = 0; r < 6; r++) { if (footprintFree(W, spot.x, spot.y, 3, 3, 0)) break; spot = { x: near.x + 0.5 + r, y: near.y + 0.5 - r }; }
    W.buildings.push({ kind: 'stonehenge', x: spot.x, y: spot.y, wx: 3, wy: 3, noCost: true, label: p.name, site: null });
    W.pois.push({ ...p, x: spot.x, y: spot.y });
  }
}

// Äcker: je Feld die Saat in Reihen als Objekt (render.js wählt das Bild nach Jahreszeit). Die Reihen laufen in
// Blöcken von 4 × 4 Feldern gleich, damit ein Acker einheitlich aussieht.
function addFieldObjs(W) {
  const N = W.N;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (W.tiles[j * N + i] !== T.FIELD) continue;
    const ci = Math.floor(j / CHUNK) * W.CN + Math.floor(i / CHUNK);
    W.chunkObjs[ci].push({ kind: 'feld', x: i + 0.5, y: j + 0.5, ori: hash2(i >> 2, j >> 2, 515) < 0.5 ? 'x' : 'y', v: hash2(i, j, 516), s: 1 });
  }
}

function addWallRuinObjs(W) {
  for (const r of W.wallRuins) {
    const ci = Math.floor(r.y / CHUNK) * W.CN + Math.floor(r.x / CHUNK);
    W.chunkObjs[ci].push({ kind: 'mauer', x: r.x, y: r.y, dir: r.dir, h: r.h, tower: r.tower, v: 0, s: 1 });
  }
}

function placeTrees(W, rng) {
  const N = W.N, CN = W.CN;
  for (let k = 0; k < CN * CN; k++) W.chunkObjs.push([]);
  // Sperrmaske statt Schleifen über alle Orte und Gebäude
  const keep = new Uint8Array(N * N);
  const mark = (cx, cy, r) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x >= 0 && y >= 0 && x < N && y < N && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) keep[y * N + x] = 2;
    }
  };
  for (const s of W.sites) mark(s.x, s.y, s.type === 'lager' ? 2.8 : s.clear + 1);
  for (const f of W.farms) mark(f.x, f.y, 3.6);
  for (const c of W.camps || []) mark(c.x, c.y, 2.2);
  for (const b of W.buildings) {
    const rx = (b.wx || 0.6) / 2 + 0.7, ry = (b.wy || 0.6) / 2 + 0.7;
    for (let y = Math.floor(b.y - ry); y <= Math.floor(b.y + ry); y++) for (let x = Math.floor(b.x - rx); x <= Math.floor(b.x + rx); x++) {
      if (x >= 0 && y >= 0 && x < N && y < N && !keep[y * N + x]) keep[y * N + x] = 1;
    }
  }
  for (const r of W.wallRuins) mark(r.x, r.y, 0.9);
  const nearSite = (x, y) => keep[Math.floor(y) * N + Math.floor(x)] === 2;
  const nearBuilding = (x, y) => keep[Math.floor(y) * N + Math.floor(x)] >= 1;
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
    // Schilf an Fluss- und Seeufern, im Wald hier und da ein umgestürzter Stamm oder ein Baumstumpf
    // (eigener Zufall je Feld, damit der übrige Aufbau der Welt gleich bleibt)
    const hx = hash2(x, y, 517);
    let extra = null;
    if ((t === T.GRASS || t === T.SAND) && hx < 0.4) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (y + dy) * N + x + dx;
        if (W.tiles[j] === T.WATER && !W.sea[j]) { extra = { kind: 'schilf', x: x + 0.5 + dx * 0.25, y: y + 0.5 + dy * 0.25 }; break; }
      }
    } else if (t === T.FOREST && hx < 0.022) extra = { kind: 'stamm', x: x + 0.5, y: y + 0.5 };
    else if (t === T.GRASS && hash2(x, y, 522) < 0.03) extra = { kind: 'blumen', x: x + 0.2 + hash2(x, y, 523) * 0.6, y: y + 0.2 + hash2(x, y, 524) * 0.6 };
    else if (t === T.FOREST && hx < 0.045) extra = { kind: 'stumpf', x: x + 0.3 + hash2(x, y, 518) * 0.4, y: y + 0.3 + hash2(x, y, 519) * 0.4 };
    if (extra && !nearSite(extra.x, extra.y) && !nearBuilding(extra.x, extra.y)) {
      const ci = Math.floor(extra.y / CHUNK) * CN + Math.floor(extra.x / CHUNK);
      W.chunkObjs[ci].push({ ...extra, v: Math.floor(hash2(x, y, 520) * 2), s: 0.85 + hash2(x, y, 521) * 0.3 });
    }
  }
}
