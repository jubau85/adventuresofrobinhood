// Isometrischer Renderer: Gelände mit Höhenrelief in Chunks, Objekte tiefensortiert,
// Schatten, Tiere, Vögel, Tag/Nacht, Retro-Modus (Amiga-Stil) und Minikarte.

import { G, homeName, playerColor } from './state.js';
import { TW, TH, CHUNK, HMAX, T, ITEMS, FACTIONS, CASTLE_LAYOUT, BUILDINGS, FERRIES, REGIONS, geoToTile, CASTLE_TOWERS, CASTLE_PLOT, POIS, KM_PER_TILE } from './data.js';
import { isoX, isoY, HW, HH, screenToWorld } from './iso.js';
import { hash2, mulberry32, makeNoise, rand } from './rng.js';
import { groundZ, tileAt, PAL_GATE } from './world.js';
import { conProgress, villageSpots } from './castle.js';
import { castlePasture } from './animals.js';
import { ART, onArt, wantArt, wantArtPrefix } from './assets.js';
import { HORSE3D } from './pferde.js';
import { HERO3D, FIG3D } from './figuren.js';
import { graveSlot, graveCount, funeralProps } from './life.js';
import { seasonIndex, darkness, warmth } from './sim.js';
import { unitLook, heraldLook } from './units.js';
import { questTarget } from './politics.js';
import { tourneyLayout, pavilionSpot, tourneyCore } from './tournament.js';
import { gallowsFor } from './justice.js';
import { snowLevel, lookSeason, treeSeason, weatherKind, precip } from './weather.js';
import { abandonedId } from './dynamics.js';
import { homeGateClosed, homeSite } from './siege.js';

let canvas = null, ctx = null;
let lowCv = null, lowCtx = null;
let chunksVisible = 24;
const chunkCache = new Map();
let cacheSeason = -1;
let sprites = null, spriteSeason = -1;
let staticParts = [];
let castleParts = [];
let lights = [];
let smoke = [];
let snow = [];
let birds = [], birdTimer = 6;
let minimapBase = null, minimapSeason = -1;
let patchNoise = null;
let baseZ = 0;            // Geländehöhe unter dem gerade gezeichneten Objekt
const PAD_TOP = HMAX + 22;
const SLAB = 96;          // Dicke der Erdscholle am Kartenrand
const OUTLINE = 'rgba(28,18,10,0.55)';

// ---------------------------------------------------------------- Farben
const shadeCache = new Map();
export function shade(hex, f) {
  const key = hex + f.toFixed(3);
  let v = shadeCache.get(key);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  v = `rgb(${r},${g},${b})`;
  if (shadeCache.size > 6000) shadeCache.clear();
  shadeCache.set(key, v);
  return v;
}

function mix(hex, hex2, t) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(hex2.slice(1), 16);
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return '#' + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0');
}

const PAL = [
  { grass: '#73a046', grass2: '#7eab4e', forest: '#557f36', hills: '#8a9a58', field: '#82ab4c', fieldRow: '#5e8a34', crop: '#9cc45c', road: '#b09468', sand: '#d4c491', water: '#3f7a9c', water2: '#356a89', foam: 'rgba(235,245,245,0.55)', flowers: ['#f4e9a8', '#ffffff', '#d65a4e', '#b98ad6'] },
  { grass: '#7fa140', grass2: '#8bab48', forest: '#4f7832', hills: '#98985a', field: '#d6b850', fieldRow: '#b39436', crop: '#e8cf6a', road: '#b5976a', sand: '#dacb98', water: '#3c7697', water2: '#336684', foam: 'rgba(235,245,245,0.55)', flowers: ['#f4e9a8', '#ffffff', '#d65a4e'] },
  { grass: '#939446', grass2: '#a09d4c', forest: '#736433', hills: '#958a5a', field: '#a3803e', fieldRow: '#7b5e2d', crop: '#b08c48', road: '#a6895f', sand: '#cbb686', water: '#3b6a87', water2: '#335c76', foam: 'rgba(235,245,245,0.45)', flowers: [] },
  { grass: '#e3e9e9', grass2: '#eef2f2', forest: '#d1dad9', hills: '#d8dedb', field: '#e6ebea', fieldRow: '#c6cdcc', crop: '#d0d6d5', road: '#bcb5a9', sand: '#dde0da', water: '#a9c4d1', water2: '#9cb9c7', foam: 'rgba(255,255,255,0.7)', flowers: [] },
  { grass: '#7f8a50', grass2: '#879052', forest: '#5c5a36', hills: '#8a8660', field: '#8a6e48', fieldRow: '#6a5234', crop: '#8a7a50', road: '#9e8662', sand: '#c4b48a', water: '#3a6680', water2: '#325a72', foam: 'rgba(235,245,245,0.45)', flowers: [] },
];

// Landschaft zwischen den Jahreszeiten: Grundfarben der Jahreszeit, je nach Schneedecke ins Weiße
let palKey = '', palCache = null;
function lookPal() {
  const lv = snowLevel(), se = seasonIndex(), key = `${se}|${lv}`;
  if (key === palKey) return palCache;
  const base = PAL[se === 3 ? 4 : se], k = lv >= 1 ? 1 : lv * 0.8;
  const o = {};
  for (const [name, col] of Object.entries(base)) {
    if (typeof col === 'string' && col[0] === '#') o[name] = k ? mix(col, PAL[3][name], k) : col;
    else o[name] = lv >= 0.5 ? PAL[3][name] : col;
  }
  palKey = key; palCache = o;
  return o;
}
function lookKey() { return `${seasonIndex()}|${snowLevel()}|${G.s ? fieldStage() : ''}`; }

// ---------------------------------------------------------------- Grundformen
function poly(c, pts, fill) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}
function P(x, y, z = 0) { return [isoX(x, y), isoY(x, y) - z - baseZ]; }
function lerp2(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

// Größe der Figuren und Tiere im Verhältnis zu den Häusern: Die Traufe einer Kate liegt knapp zwei
// Menschenhöhen über dem Boden, mit Dach ist sie gut dreimal so hoch wie eine Figur
const FIG = 0.72;
// Höhe einer 1,8 m großen 3D-Figur in Figureneinheiten (vor FIG); sie sind schlanker als die gezeichneten, daher etwas größer
const FIG3D_H = 26;

function winterize(col) { const lv = snowLevel(); return lv > 0 ? mix(col, '#f0f4f4', 0.68 * lv) : col; }

function addLight(x, y, z, r = 26, strength = 1) { lights.push({ x, y, z: z + baseZ, r, s: strength }); }

// Konvexe Hülle (für Schatten)
function hull(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// Schlagschatten nach rechts (Licht kommt von links oben)
function drawShadow(c, cx, cy, wx, wy, h, alpha = 0.2) {
  const d = Math.min(2.2, h / 30);
  const x0 = cx - wx / 2, x1 = cx + wx / 2, y0 = cy - wy / 2, y1 = cy + wy / 2;
  const pts = [];
  for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) { pts.push(P(x, y)); pts.push(P(x + d * 0.7, y - d * 0.7)); }
  poly(c, hull(pts), `rgba(25,35,15,${alpha})`);
}

export function drawBox(c, cx, cy, wx, wy, h, col, z = 0, tex = null) {
  const x0 = cx - wx / 2, x1 = cx + wx / 2, y0 = cy - wy / 2, y1 = cy + wy / 2;
  const L0 = P(x0, y1, z), C0 = P(x1, y1, z), R0 = P(x1, y0, z);
  poly(c, [L0, C0, [C0[0], C0[1] - h], [L0[0], L0[1] - h]], shade(col, 0.95));
  poly(c, [C0, R0, [R0[0], R0[1] - h], [C0[0], C0[1] - h]], shade(col, 0.74));
  poly(c, [P(x0, y0, z + h), P(x1, y0, z + h), P(x1, y1, z + h), P(x0, y1, z + h)], shade(col, 1.12));
  if (tex && h > 5) faceTexture(c, [[L0, C0], [C0, R0]], h, tex);
  c.strokeStyle = 'rgba(30,20,12,0.28)'; c.lineWidth = 0.8;
  c.beginPath(); c.moveTo(C0[0], C0[1]); c.lineTo(C0[0], C0[1] - h); c.stroke();
}

function faceTexture(c, faces, h, tex) {
  c.beginPath();
  if (tex === 'stone') {
    c.strokeStyle = 'rgba(45,35,25,0.22)'; c.lineWidth = 0.8;
    const rowH = 6.5;
    for (const [A, B] of faces) {
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const n = Math.max(2, Math.round(len / 11));
      for (let r = 0; r * rowH < h; r++) {
        const yb = r * rowH;
        if (yb > 0) { c.moveTo(A[0], A[1] - yb); c.lineTo(B[0], B[1] - yb); }
        const off = (r % 2) * 0.5, top = Math.min(rowH, h - yb);
        for (let q = 1; q <= n; q++) {
          const f = (q - off) / n;
          if (f <= 0.02 || f >= 0.98) continue;
          const x = A[0] + (B[0] - A[0]) * f, y = A[1] + (B[1] - A[1]) * f - yb;
          c.moveTo(x, y); c.lineTo(x, y - top);
        }
      }
    }
  } else if (tex === 'plank') {
    c.strokeStyle = 'rgba(40,25,12,0.28)'; c.lineWidth = 0.8;
    for (const [A, B] of faces) {
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const n = Math.max(2, Math.round(len / 6));
      for (let q = 1; q < n; q++) {
        const x = A[0] + (B[0] - A[0]) * (q / n), y = A[1] + (B[1] - A[1]) * (q / n);
        c.moveTo(x, y); c.lineTo(x, y - h);
      }
    }
  }
  c.stroke();
}

function drawGableRoof(c, cx, cy, wx, wy, h, rh, col, gableCol, alongX, rows = true) {
  const o = 0.1;
  const x0 = cx - wx / 2 - o, x1 = cx + wx / 2 + o, y0 = cy - wy / 2 - o, y1 = cy + wy / 2 + o;
  col = winterize(col);
  const line = shade(col, 0.72);
  const slopes = [];
  if (alongX) {
    const R0 = P(x0, cy, h + rh), R1 = P(x1, cy, h + rh);
    const back = [P(x0, y0, h), P(x1, y0, h), R1, R0], front = [P(x0, y1, h), P(x1, y1, h), R1, R0];
    poly(c, back, shade(col, 0.78));
    poly(c, [P(cx + wx / 2, cy - wy / 2, h), P(cx + wx / 2, cy + wy / 2, h), P(cx + wx / 2, cy, h + rh)], shade(gableCol, 0.74));
    poly(c, front, shade(col, 1.0));
    slopes.push(front);
  } else {
    const R0 = P(cx, y0, h + rh), R1 = P(cx, y1, h + rh);
    const back = [P(x0, y0, h), P(x0, y1, h), R1, R0], front = [P(x1, y0, h), P(x1, y1, h), R1, R0];
    poly(c, back, shade(col, 1.05));
    poly(c, [P(cx - wx / 2, cy + wy / 2, h), P(cx + wx / 2, cy + wy / 2, h), P(cx, cy + wy / 2, h + rh)], shade(gableCol, 0.95));
    poly(c, front, shade(col, 0.78));
    slopes.push(back, front);
  }
  if (rows) {
    c.strokeStyle = line; c.lineWidth = 0.9;
    c.beginPath();
    for (const s of slopes) {
      for (const f of [0.28, 0.55, 0.8]) {
        const a = lerp2(s[0], s[3], f), b = lerp2(s[1], s[2], f);
        c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
      }
    }
    c.stroke();
    const s = slopes[slopes.length - 1];
    c.strokeStyle = shade(col, 1.25); c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(s[3][0], s[3][1]); c.lineTo(s[2][0], s[2][1]); c.stroke();
  }
}

function drawPyramid(c, cx, cy, wx, wy, h, rh, col) {
  col = winterize(col);
  const o = 0.08;
  const x0 = cx - wx / 2 - o, x1 = cx + wx / 2 + o, y0 = cy - wy / 2 - o, y1 = cy + wy / 2 + o;
  const A = P(cx, cy, h + rh);
  poly(c, [P(x0, y1, h), P(x1, y1, h), A], shade(col, 1.0));
  poly(c, [P(x1, y1, h), P(x1, y0, h), A], shade(col, 0.76));
  c.strokeStyle = shade(col, 0.6); c.lineWidth = 0.8;
  c.beginPath();
  for (const f of [0.35, 0.65]) {
    const a = lerp2(P(x0, y1, h), A, f), b = lerp2(P(x1, y1, h), A, f), d = lerp2(P(x1, y0, h), A, f);
    c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]);
  }
  c.stroke();
}

function drawMerlons(c, cx, cy, wx, wy, h, col, size = 0.2) {
  const x0 = cx - wx / 2, x1 = cx + wx / 2, y0 = cy - wy / 2, y1 = cy + wy / 2;
  const pts = [];
  const nx = Math.max(2, Math.round(wx / 0.45)), ny = Math.max(2, Math.round(wy / 0.45));
  for (let i = 0; i <= nx; i += 2) { pts.push([x0 + (i / nx) * wx, y0 + size / 2]); pts.push([x0 + (i / nx) * wx, y1 - size / 2]); }
  for (let j = 2; j < ny; j += 2) { pts.push([x0 + size / 2, y0 + (j / ny) * wy]); pts.push([x1 - size / 2, y0 + (j / ny) * wy]); }
  pts.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  for (const [x, y] of pts) drawBox(c, Math.min(Math.max(x, x0 + size / 2), x1 - size / 2), y, size, size, 6, col, h);
}

function banner(c, x, y, z, col) {
  const [bx, by] = P(x, y, z);
  c.strokeStyle = '#3a2a1c'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(bx, by); c.lineTo(bx, by - 22); c.stroke();
  const w = Math.sin(G.time * 3 + x) * 2;
  c.beginPath();
  c.moveTo(bx, by - 22);
  c.quadraticCurveTo(bx + 7, by - 22 + w, bx + 14, by - 20 + w);
  c.lineTo(bx + 14, by - 13 + w);
  c.quadraticCurveTo(bx + 7, by - 15 + w, bx, by - 15);
  c.closePath();
  c.fillStyle = col; c.fill();
  c.strokeStyle = OUTLINE; c.lineWidth = 0.7; c.stroke();
}

// ---------------------------------------------------------------- Gebäude
const WALLS = { plaster: '#dccfb2', timber: '#d8c8a4', stone: '#a7a093', wood: '#93704a' };
const ROOFS = { thatch: '#b8964f', tile: '#a0533c', wood: '#735538', slate: '#5f6873' };
const SHUTTERS = ['#4f7a3a', '#9a3a2c', '#3d6a9a', '#7a5a2a'];

function faceQuad(c, x, y, wx, wy, face, u0, u1, z0, z1, col) {
  const x0 = x - wx / 2, x1 = x + wx / 2, y0 = y - wy / 2, y1 = y + wy / 2;
  if (face === 'L') poly(c, [P(x0 + u0 * wx, y1, z0), P(x0 + u1 * wx, y1, z0), P(x0 + u1 * wx, y1, z1), P(x0 + u0 * wx, y1, z1)], col);
  else poly(c, [P(x1, y1 - u0 * wy, z0), P(x1, y1 - u1 * wy, z0), P(x1, y1 - u1 * wy, z1), P(x1, y1 - u0 * wy, z1)], col);
}

function facePoint(x, y, wx, wy, face, u, z) {
  return face === 'L' ? P(x - wx / 2 + u * wx, y + wy / 2, z) : P(x + wx / 2, y + wy / 2 - u * wy, z);
}

function faceLine(c, x, y, wx, wy, face, u0, z0, u1, z1) {
  const a = facePoint(x, y, wx, wy, face, u0, z0), b = facePoint(x, y, wx, wy, face, u1, z1);
  c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
}

function windowOn(c, b, face, u0, u1, z0, z1, lit) {
  const night = darkness() > 0.2;
  faceQuad(c, b.x, b.y, b.wx, b.wy, face, u0 - 0.03, u1 + 0.03, z0 - 1.5, z1 + 1.5, '#5a4030');
  faceQuad(c, b.x, b.y, b.wx, b.wy, face, u0, u1, z0, z1, night && lit ? '#ffd27a' : '#2c2622');
  if (b.shutter != null) {
    const sc = SHUTTERS[b.shutter % SHUTTERS.length];
    const w = (u1 - u0) * 0.45;
    faceQuad(c, b.x, b.y, b.wx, b.wy, face, u0 - w - 0.03, u0 - 0.03, z0, z1, face === 'L' ? sc : shade(sc, 0.78));
    faceQuad(c, b.x, b.y, b.wx, b.wy, face, u1 + 0.03, u1 + w + 0.03, z0, z1, face === 'L' ? sc : shade(sc, 0.78));
  }
  if (night && lit) addLight(face === 'R' ? b.x + b.wx / 2 : b.x, face === 'R' ? b.y : b.y + b.wy / 2, (z0 + z1) / 2, 22, 0.8);
}

function drawHouse(c, b) {
  const hs = houseSprite(b);
  if (hs && drawHouseSprite(c, b, hs)) return;
  const wall = WALLS[b.wall] || WALLS.plaster;
  const v = b.v ?? hash2(Math.round(b.x * 10), Math.round(b.y * 10), 3);
  if (b.shutter === undefined) b.shutter = v < 0.6 ? Math.floor(v * 10) : null;
  if (b.flowers === undefined) b.flowers = (b.wall === 'plaster' || b.wall === 'timber') && v > 0.45;
  drawShadow(c, b.x, b.y, b.wx, b.wy, b.h + b.rh * 0.7);
  drawBox(c, b.x, b.y, b.wx + 0.08, b.wy + 0.08, 5, '#80796d', -4);
  drawBox(c, b.x, b.y, b.wx, b.wy, b.h, wall, 0, b.wall === 'stone' ? 'stone' : b.wall === 'wood' ? 'plank' : null);
  if (b.wall === 'timber') {
    c.strokeStyle = '#5a4030'; c.lineWidth = 1.6;
    c.beginPath();
    for (const u of [0.02, 0.5, 0.98]) faceLine(c, b.x, b.y, b.wx, b.wy, 'L', u, 0, u, b.h);
    faceLine(c, b.x, b.y, b.wx, b.wy, 'L', 0.02, b.h * 0.58, 0.98, b.h * 0.58);
    faceLine(c, b.x, b.y, b.wx, b.wy, 'L', 0.04, b.h * 0.05, 0.46, b.h * 0.55);
    faceLine(c, b.x, b.y, b.wx, b.wy, 'L', 0.96, b.h * 0.05, 0.54, b.h * 0.55);
    c.stroke();
    c.strokeStyle = '#46321f';
    c.beginPath();
    for (const u of [0.02, 0.98]) faceLine(c, b.x, b.y, b.wx, b.wy, 'R', u, 0, u, b.h);
    faceLine(c, b.x, b.y, b.wx, b.wy, 'R', 0.02, b.h * 0.58, 0.98, b.h * 0.58);
    c.stroke();
  }
  // Tür mit Rahmen
  const dh = Math.min(16, b.h * 0.6);
  faceQuad(c, b.x, b.y, b.wx, b.wy, 'L', 0.36, 0.64, 0, dh + 1.5, '#6a4c34');
  faceQuad(c, b.x, b.y, b.wx, b.wy, 'L', 0.4, 0.6, 0, dh, '#3d2b1f');
  // Kein Licht in verlassenen, brennenden oder schwer beschädigten Häusern
  const empty = abandonedId(b.site), lit = b.lit && !empty && !(b.fire > G.time) && !((b.dmg || 0) >= 0.45);
  windowOn(c, b, 'R', 0.38, 0.62, b.h * 0.42, b.h * 0.74, lit);
  if (b.wx >= 1.15) windowOn(c, b, 'L', 0.1, 0.26, b.h * 0.42, b.h * 0.72, lit);
  if (b.flowers && seasonIndex() < 2) {
    faceQuad(c, b.x, b.y, b.wx, b.wy, 'R', 0.34, 0.66, b.h * 0.36, b.h * 0.42, '#6b4a2e');
    const cols = ['#e05a4e', '#f2d65a', '#e8e8f0', '#c27ad6'];
    for (let k = 0; k < 4; k++) {
      const p = facePoint(b.x, b.y, b.wx, b.wy, 'R', 0.37 + k * 0.08, b.h * 0.44);
      c.fillStyle = cols[(k + (b.shutter || 0)) % 4]; c.fillRect(p[0] - 1, p[1] - 2, 2, 2);
    }
  }
  const roof = ROOFS[b.roof] || ROOFS.thatch;
  drawGableRoof(c, b.x, b.y, b.wx, b.wy, b.h, b.rh, roof, wall, b.wx >= b.wy);
  if (b.chimney) {
    drawBox(c, b.x + b.wx * 0.2, b.y - b.wy * 0.15, 0.16, 0.16, b.rh * 0.8 + 6, '#857b6e', b.h, 'stone');
    b.smoke = empty ? null : P(b.x + b.wx * 0.2, b.y - b.wy * 0.15, b.h + b.rh * 0.8 + 6);
  }
  if (b.tavern) drawTavernFront(c, b);
  if (b.dmg > 0) drawDamage(c, b);
}

// ---------------------------------------------------------------- Bild-Zwischenspeicher
// Ruhende Bauten werden einmal in ein Bild gezeichnet und dann nur noch kopiert. Ganz nah
// (oder bei Brand und Gerüst) wird direkt gezeichnet, damit alles scharf und lebendig bleibt.
const partCache = new Map();
let cacheScale = 1, cacheOn = true, cacheUsed = 0, cacheMax = 400;
function cachedDraw(c, o, bounds, fn) {
  if (!cacheOn) { fn(c); return; }
  cacheUsed++;
  const key = `${lookKey()}|${darkness() > 0.2 ? 1 : 0}|${cacheScale}`;
  let e = partCache.get(o);
  const ax = isoX(o.x, o.y), ay = isoY(o.x, o.y);
  if (!e || e.key !== key) {
    const [xmin, xmax, ymin, ymax] = bounds;
    const sc = cacheScale;
    const cv = makeCanvas(Math.max(1, Math.ceil((xmax - xmin) * sc)), Math.max(1, Math.ceil((ymax - ymin) * sc)));
    const g = cv.getContext('2d');
    g.setTransform(sc, 0, 0, sc, (-ax - xmin) * sc, (-ay - ymin) * sc);
    const bz = baseZ; baseZ = 0;
    const l0 = lights.length;
    fn(g);
    const ls = lights.splice(l0);
    baseZ = bz;
    e = { cv, key, xmin, ymin, sc, lights: ls, smoke: o.smoke ? [o.smoke[0], o.smoke[1]] : null };
    if (o.smoke) o.smoke = null;
  } else partCache.delete(o);
  partCache.set(o, e);
  while (partCache.size > cacheMax) partCache.delete(partCache.keys().next().value);
  c.drawImage(e.cv, ax + e.xmin, ay - baseZ + e.ymin, e.cv.width / e.sc, e.cv.height / e.sc);
  for (const l of e.lights) lights.push({ ...l, z: l.z + baseZ });
  if (e.smoke) o.smoke = [e.smoke[0], e.smoke[1] - baseZ];
}

function houseBounds(b) {
  const half = (b.wx + b.wy) * 16, r = [-half - 6, half + 44, -(b.h + b.rh * 1.1 + 24), half / 2 + 10];
  // gemaltes Haus: so groß wie sein Bild (Dach, Schornstein, Rauch, Bänke)
  const hs = houseSprite(b), a = hs && P5[`bau_${hs.name}`], im = hs && ART[`bau_${hs.name}`];
  if (a && im) {
    const w = im.width * a[2] * hs.sc, h = im.height * a[2] * hs.sc, l = hs.flip ? -(w - a[0] * hs.sc) : -a[0] * hs.sc;
    r[0] = Math.min(r[0], l - 4); r[1] = Math.max(r[1], l + w + 4); r[2] = Math.min(r[2], -a[1] * hs.sc - 4); r[3] = Math.max(r[3], h - a[1] * hs.sc + 4);
  }
  return r;
}
function drawHouseFast(c, b) {
  if (b.cons < 1) { drawHouseStage(c, b); return; }
  if (b.dmg > 0 || b.fire > G.time || b.tavern || abandonedId(b.site)) { drawHouse(c, b); return; }
  cachedDraw(c, b, houseBounds(b), (g) => drawHouse(g, b));
}
function drawChurchFast(c, b) { if (abandonedId(b.site)) { drawChurch(c, b); return; } const half = (b.wx + b.wy) * 16; cachedDraw(c, b, [-half - 30, half + 90, -(b.abbey ? 160 : 140), half / 2 + 16], (g) => drawChurch(g, b)); }

// Stadtmauer: ein Mauerstück je Feld, Türme in Abständen und an den Toren
function drawCityWallPiece(c, o) {
  const col = '#b9b1a1';
  if (o.tower) {
    drawShadow(c, o.x, o.y, 1.3, 1.3, 64, 0.18);
    drawBox(c, o.x, o.y, 1.25, 1.25, o.gate ? 62 : 54, col, 0, 'stone');
    drawMerlons(c, o.x, o.y, 1.25, 1.25, o.gate ? 62 : 54, col);
    if (o.gate) banner(c, o.x, o.y, 62, o.color);
    return;
  }
  drawBox(c, o.x, o.y, 1.0, 1.0, 38, col, 0, 'stone');
  drawMerlons(c, o.x, o.y, 1.0, 1.0, 38, col, 0.16);
}

// ---------------------------------------------------------------- Mauerschäden, Bresche, Tore (siege.js)
// Schaden eines Mauerstücks an (x, y): Nahe der Bresche wächst er mit jedem Treffer. Ist die Bresche offen,
// liegt dort nur noch Schutt. Nach der Belagerung wird vermauert, solange steht ein Gerüst.
function wallHit(site, x, y) {
  const st = G.s && G.s.walls && G.s.walls[site.id];
  if (!st) return null;
  const d = Math.hypot(x - st.bx, y - st.by);
  if (d > 2.4) return null;
  if (st.open && d < 1.55) return { gone: true };
  const dmg = (st.open ? 1 : st.dmg || 0) * Math.max(0, 1 - Math.max(0, d - 0.6) / 1.8);
  if (dmg < 0.08) return null;
  return { gone: false, dmg, repair: !st.open && !(G.siege && G.siege.site === site) };
}

function drawWallRuined(c, x, y, wx, wy, h, col, hit) {
  const along = wx >= wy;
  if (hit.gone) {
    // Schutt: ein flacher Haufen und ein paar Mauerstümpfe
    const g = P(x, y);
    c.fillStyle = 'rgba(60,52,44,0.35)';
    c.beginPath(); c.ellipse(g[0], g[1], 26, 12, 0, 0, Math.PI * 2); c.fill();
    drawBox(c, x, y, wx * 0.95, wy * 0.95, 4, mix(col, '#6f685e', 0.35), 0, 'stone');
    const stub = (Math.abs(Math.floor(x * 7 + y * 13)) % 3) * 4 + 3;
    drawBox(c, along ? x - wx * 0.3 : x, along ? y : y - wy * 0.3, along ? wx * 0.35 : wx, along ? wy : wy * 0.35, stub, mix(col, '#7a7266', 0.3), 0, 'stone');
    drawStones(c, x + 0.25, y + 0.25, 7);
    return;
  }
  // Beschädigt: oben ausgebrochen in Stufen, Risse und Löcher, Steine am Fuß
  const d = hit.dmg;
  const dark = mix(col, '#6a6258', 0.35 * d);
  const cuts = [0.15, 0.6, 0.35];
  for (let k = 0; k < 3; k++) {
    const hh = h * (1 - cuts[k] * d * 1.1);
    const sx = along ? x - wx / 3 + (k * wx) / 3 : x, sy = along ? y : y - wy / 3 + (k * wy) / 3;
    drawBox(c, sx, sy, along ? wx / 3 + 0.01 : wx, along ? wy : wy / 3 + 0.01, hh, dark, 0, 'stone');
    if (d < 0.3) drawMerlons(c, sx, sy, along ? wx / 3 : wx, along ? wy : wy / 3, hh, col, 0.16);
  }
  const hh = h * (1 - 0.45 * d);
  c.strokeStyle = 'rgba(35,30,26,0.9)'; c.lineWidth = 1.3;
  for (const face of ['L', 'R']) {
    const n = 1 + Math.round(d * 3);
    for (let k = 0; k < n; k++) {
      const u = 0.15 + ((k * 0.29) % 0.68);
      c.beginPath();
      let pt = facePoint(x, y, wx, wy, face, u, hh);
      c.moveTo(pt[0], pt[1]);
      for (let j = 1; j <= 4; j++) { pt = facePoint(x, y, wx, wy, face, u + (j % 2 ? 0.07 : -0.05), hh * (1 - j * 0.17 * (0.6 + d))); c.lineTo(pt[0], pt[1]); }
      c.stroke();
    }
    if (d > 0.35) faceQuad(c, x, y, wx, wy, face, 0.28, 0.28 + 0.4 * d, hh * (0.62 - 0.3 * d), hh * 0.84, 'rgba(28,24,20,0.85)');
  }
  if (d > 0.2) drawStones(c, x + 0.45, y + 0.45, Math.round(2 + d * 5));
  if (hit.repair) drawScaffold(c, x, y, wx + 0.3, wy + 0.3, hh + 8);
}

// Geschlossenes Tor: Bohlen mit Eisenbändern
function drawClosedGate(c, x, y, wx, wy, h) {
  drawBox(c, x, y, wx, wy, h, '#6b4b2e', 0, 'plank');
  for (const face of ['L', 'R']) {
    for (const z of [h * 0.22, h * 0.6]) faceQuad(c, x, y, wx, wy, face, 0.02, 0.98, z, z + 2.2, '#2c2622');
    faceQuad(c, x, y, wx, wy, face, 0.485, 0.515, 0, h, '#2c2622');
  }
}

// Tore der laufenden Belagerung als Objekte für die Tiefensortierung
function siegeGateParts() {
  const sg = G.siege, W = G.world;
  // Gemalte Burgtore zeigen sich selbst offen oder geschlossen (castlePieces); hier nur noch die Stadttore
  const painted = !!(ART.burg_stein_tor && ART.burg_holztor_zu);
  if (painted) { if (!sg || !sg.walls || !sg.gatesClosed || sg.walls.square) return []; return siegeGatePartsFor(sg); }
  // Deine Burg mit geschlossenem Tor, auch ohne Belagerung
  if (homeGateClosed() && !(sg && sg.site.type === 'spieler' && sg.gatesClosed)) {
    const s = homeSite(), lvl = G.s.castle.level, x = s.x, y = s.y + 4, h = lvl >= 2 ? (lvl >= 3 ? 36 : 26) : 22;
    const part = { x, y, d: x + y, z: groundZ(W, x, y), f: (c) => drawClosedGate(c, x, y, 1.7, 0.42, h), box: [x - 0.85, x + 0.85, y - 0.21, y + 0.21], big: true };
    if (!sg || !sg.walls || !sg.gatesClosed) return [part];
    return [part, ...siegeGatePartsFor(sg)];
  }
  if (!sg || !sg.walls || !sg.gatesClosed) return [];
  return siegeGatePartsFor(sg);
}

function siegeGatePartsFor(sg) {
  const s = sg.site, W = G.world, out = [];
  if (sg.walls.square) {
    const lvl = s.type === 'spieler' ? G.s.castle.level : s.castleLevel || 0;
    const x = s.x, y = s.y + 4, h = lvl >= 2 ? (lvl >= 3 ? 36 : 26) : 22;
    out.push({ x, y, d: x + y, z: groundZ(W, x, y), f: (c) => drawClosedGate(c, x, y, 1.7, 0.42, h), box: [x - 0.85, x + 0.85, y - 0.21, y + 0.21], big: true });
    return out;
  }
  const h = s.cityWall ? 30 : 18;
  for (const [tx, ty] of sg.walls.gates) {
    const x = tx + 0.5, y = ty + 0.5;
    // Torflügel quer zur Straße: liegt das Tor im Osten oder Westen, verläuft die Mauer von Nord nach Süd
    const ew = Math.abs(x - s.x) > Math.abs(y - s.y);
    const wx = ew ? 0.42 : 1.0, wy = ew ? 1.0 : 0.42;
    out.push({ x, y, d: x + y, z: groundZ(W, x, y), f: (c) => {
      drawClosedGate(c, x, y, wx, wy, h);
      if (s.cityWall) { drawBox(c, x, y, ew ? 0.9 : 1.0, ew ? 1.0 : 0.9, 8, '#b9b1a1', h, 'stone'); drawMerlons(c, x, y, ew ? 0.9 : 1.0, ew ? 1.0 : 0.9, h + 8, '#b9b1a1', 0.16); }
    }, box: [x - wx / 2, x + wx / 2, y - wy / 2, y + wy / 2], big: true });
  }
  return out;
}

// Wirtshaus: Ausleger mit Schild, Bänke und Tisch vor der Tür
function drawTavernFront(c, b) {
  const [ax, ay] = P(b.x + b.wx / 2, b.y + b.wy / 2, b.h * 0.85);
  c.strokeStyle = '#4a3322'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax + 11, ay + 5); c.stroke();
  const sw = Math.sin(G.time * 1.6 + b.x) * 0.12;
  c.save(); c.translate(ax + 9, ay + 5); c.rotate(sw);
  c.fillStyle = '#d1ae6e'; c.fillRect(-5, 2, 10, 9); c.strokeStyle = '#4a3322'; c.lineWidth = 1; c.strokeRect(-5, 2, 10, 9);
  c.beginPath(); c.moveTo(-3, 0); c.lineTo(-3, 2); c.moveTo(3, 0); c.lineTo(3, 2); c.stroke();
  c.fillStyle = '#5a3a22';
  if (b.sign === 'krug') { c.fillRect(-2, 4, 4, 5); c.strokeStyle = '#5a3a22'; c.beginPath(); c.arc(2.6, 6.5, 1.5, -1.4, 1.4); c.stroke(); }
  else if (b.sign === 'krone') { c.beginPath(); c.moveTo(-3.5, 9); c.lineTo(-3.5, 5); c.lineTo(-1.5, 7); c.lineTo(0, 4); c.lineTo(1.5, 7); c.lineTo(3.5, 5); c.lineTo(3.5, 9); c.closePath(); c.fill(); }
  else { c.beginPath(); c.ellipse(0, 6.5, 3.5, 2.2, 0, 0, Math.PI * 2); c.fill(); }
  c.restore();
  // Bank und Tisch
  drawBox(c, b.x + 0.1, b.y + b.wy / 2 + 0.55, 0.9, 0.16, 4, '#7a5636', 0, 'plank');
  drawBox(c, b.x + 0.1, b.y + b.wy / 2 + 0.85, 0.7, 0.3, 7, '#8a6440', 0, 'plank');
  if (abandonedId(b.site)) return;
  const mug = P(b.x + 0.2, b.y + b.wy / 2 + 0.85, 7); c.fillStyle = '#c9b48a'; c.fillRect(mug[0] - 1, mug[1] - 3, 2, 3);
  if (darkness() > 0.15) addLight(b.x, b.y + b.wy / 2, 10, 44, 1.1);
}

// Bauplatz, Rohbau oder Ruine (siehe dynamics.js)
function drawHouseStage(c, b) {
  const k = b.cons;
  const x0 = b.x - b.wx / 2, x1 = b.x + b.wx / 2, y0 = b.y - b.wy / 2, y1 = b.y + b.wy / 2;
  if (k === -2) { drawPlot(c, b.x, b.y, b.wx, b.wy); return; }
  if (k === -1) {
    // Brandruine: Aschefleck, Mauerreste, verkohlte Balken
    const g = P(b.x, b.y);
    c.fillStyle = 'rgba(40,34,30,0.45)'; c.beginPath(); c.ellipse(g[0], g[1], (b.wx + b.wy) * 17, (b.wx + b.wy) * 8.5, 0, 0, Math.PI * 2); c.fill();
    drawBox(c, b.x, b.y, b.wx + 0.08, b.wy + 0.08, 4, '#6f685e', -3);
    const wall = mix(WALLS[b.wall] || WALLS.plaster, '#2a2420', 0.55);
    drawBox(c, x0 + 0.12, b.y, 0.18, b.wy * 0.9, b.h * 0.45, wall, 0, b.wall === 'stone' ? 'stone' : null);
    drawBox(c, b.x + 0.1, y0 + 0.12, b.wx * 0.7, 0.18, b.h * 0.3, wall, 0, b.wall === 'stone' ? 'stone' : null);
    c.strokeStyle = '#2a201a'; c.lineWidth = 2.2;
    const a = P(x0 + 0.2, y1 - 0.1, 0), e = P(b.x + 0.2, y0 + 0.2, b.h * 0.55), f = P(x1 - 0.1, y1 - 0.2, 0), h2 = P(b.x - 0.1, b.y, b.h * 0.4);
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(e[0], e[1]); c.moveTo(f[0], f[1]); c.lineTo(h2[0], h2[1]); c.stroke();
    drawStones(c, x1 + 0.2, y1 - 0.1, 4);
    if (Math.random() < 0.02) smokeEmit(g[0], g[1] - 6, 0.3);
    return;
  }
  // Baustelle: Fundament, Fachwerk, Wände, Sparren, zuletzt das Dach
  const wall = WALLS[b.wall] || WALLS.plaster;
  drawPlot(c, b.x, b.y, b.wx + 0.3, b.wy + 0.3);
  drawBox(c, b.x, b.y, b.wx + 0.08, b.wy + 0.08, 5, '#80796d', -4);
  drawLogs(c, x0 - 0.5, b.y + 0.25, 3);
  if (k >= 0.86) { drawHouse(c, { ...b, cons: undefined, dmg: 0, fire: 0, lit: false, chimney: false, tavern: false }); drawScaffold(c, b.x, b.y, b.wx + 0.25, b.wy + 0.25, b.h + 6); return; }
  const postH = b.h * Math.min(1, Math.max(0, (k - 0.15) / 0.3));
  const wallH = b.h * Math.min(1, Math.max(0, (k - 0.42) / 0.3));
  if (wallH > 2) drawBox(c, b.x, b.y, b.wx, b.wy, wallH, b.wall === 'timber' ? WALLS.plaster : wall, 0, b.wall === 'stone' ? 'stone' : b.wall === 'wood' ? 'plank' : null);
  if (postH > 2) {
    c.strokeStyle = '#6b4a2e'; c.lineWidth = 2;
    c.beginPath();
    for (const [px, py] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) { const q0 = P(px, py, 0), q1 = P(px, py, postH); c.moveTo(q0[0], q0[1]); c.lineTo(q1[0], q1[1]); }
    if (postH >= b.h * 0.99) {
      const q = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([px, py]) => P(px, py, b.h));
      c.moveTo(q[0][0], q[0][1]); for (const p2 of q.slice(1)) c.lineTo(p2[0], p2[1]);
      // Streben
      const s1 = P(x0, y1, 0), s2 = P(b.x, y1, b.h * 0.6), s3 = P(x1, y1, 0), s4 = P(x1, b.y, b.h * 0.6);
      c.moveTo(s1[0], s1[1]); c.lineTo(s2[0], s2[1]); c.moveTo(s3[0], s3[1]); c.lineTo(s4[0], s4[1]);
    }
    c.stroke();
  }
  if (k >= 0.66) {
    // Sparren des Dachstuhls
    const alongX = b.wx >= b.wy, top = b.h + b.rh;
    c.strokeStyle = '#7a5636'; c.lineWidth = 1.6;
    c.beginPath();
    for (const u of [0, 0.34, 0.67, 1]) {
      const a = alongX ? [P(x0 + u * b.wx, y0, b.h), P(x0 + u * b.wx, b.y, top), P(x0 + u * b.wx, y1, b.h)] : [P(x0, y0 + u * b.wy, b.h), P(b.x, y0 + u * b.wy, top), P(x1, y0 + u * b.wy, b.h)];
      c.moveTo(a[0][0], a[0][1]); c.lineTo(a[1][0], a[1][1]); c.lineTo(a[2][0], a[2][1]);
    }
    const r1 = alongX ? P(x0, b.y, top) : P(b.x, y0, top), r2 = alongX ? P(x1, b.y, top) : P(b.x, y1, top);
    c.moveTo(r1[0], r1[1]); c.lineTo(r2[0], r2[1]);
    c.stroke();
  }
  if (k >= 0.2) drawScaffold(c, b.x, b.y, b.wx + 0.25, b.wy + 0.25, Math.max(postH, 12) + 6);
}

// ---------------------------------------------------------------- Turnierplatz
// Schranke mit Tuchbehang, Tribüne mit Baldachin und Publikum, Zelte der Ritter, Banner
function tourneyParts() {
  const L = tourneyLayout();
  if (!L) return [];
  const W = G.world, parts = [], { lx, ly } = L;
  const host = L.host && L.host.faction ? FACTIONS[L.host.faction].color : '#a33b32';
  const z = groundZ(W, lx, ly);
  const add = (x, y, f, dd = 0) => parts.push({ x, y, d: x + y + dd, z, f });
  for (let i = -6; i < 6; i++) {
    const x0 = lx + i, x1 = x0 + 1;
    add(x0 + 0.5, ly, (c) => drawTiltPiece(c, x0, x1, ly, i % 2 ? host : '#e8dcc0', i === -6, i === 5));
  }
  add(lx, ly - 3, (c) => drawStand(c, lx, ly - 3, host, !L.building));
  for (const side of [-1, 1]) add(lx + side * 6.4, ly - 0.2, (c) => { const [bx, by] = P(lx + side * 6.4, ly - 0.2, 0); c.strokeStyle = '#4a3322'; c.lineWidth = 2; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx, by - 18); c.stroke(); banner(c, lx + side * 6.4, ly - 0.2, 18, host); });
  L.knights.forEach((k, i) => {
    const { x, y } = pavilionSpot(lx, ly, i);
    add(x, y, (c) => drawPavilion(c, x, y, k.col));
  });
  return parts;
}

function drawTiltPiece(c, x0, x1, y, col, first, last) {
  const a = P(x0, y, 2), b = P(x1, y, 2), a2 = P(x0, y, 7), b2 = P(x1, y, 7);
  poly(c, [a, b, b2, a2], col);
  c.strokeStyle = 'rgba(60,40,20,0.35)'; c.lineWidth = 0.8;
  c.beginPath(); for (const f of [0.33, 0.66]) { const p1 = lerp2(a, b, f), p2 = lerp2(a2, b2, f); c.moveTo(p1[0], p1[1] + 1); c.lineTo(p2[0], p2[1]); } c.stroke();
  c.strokeStyle = '#6b4a2e'; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(a2[0], a2[1] - 1); c.lineTo(b2[0], b2[1] - 1); c.stroke();
  c.lineWidth = 1.8;
  const p0 = P(x0, y, 0), p1 = P(x0, y, 8);
  c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke();
  if (last) { const q0 = P(x1, y, 0), q1 = P(x1, y, 8); c.beginPath(); c.moveTo(q0[0], q0[1]); c.lineTo(q1[0], q1[1]); c.stroke(); }
}

function drawStand(c, x, y, col, crowd) {
  drawShadow(c, x, y, 7.4, 1.6, 30, 0.16);
  const tiers = [[y + 0.45, 6], [y, 12], [y - 0.45, 18]];
  const t = G.tour, cheer = t && t.cheer > 0;
  const cols = ['#9a3b32', '#3d6fa3', '#d6ad4c', '#5b8a3c', '#e8e0cc', '#6f5a8a', '#8a5a4a', '#4a6a5a'];
  for (const [ty, h] of tiers.slice().reverse()) {
    drawBox(c, x, ty, 7.2, 0.5, h, '#8a6440', 0, 'plank');
    if (!crowd) continue;
    for (let k = 0; k < 14; k++) {
      const px = x - 3.3 + k * 0.5 + (ty - y) * 0.3;
      const [sx, sy] = P(px, ty, h);
      const bob = cheer ? Math.abs(Math.sin(G.time * 8 + k * 1.3 + ty * 3)) * 2.5 : 0;
      c.fillStyle = cols[(k * 3 + Math.round(ty * 7)) % cols.length];
      c.fillRect(sx - 2.4, sy - 8 - bob, 4.8, 6);
      c.fillStyle = '#e4ba94'; c.beginPath(); c.arc(sx, sy - 10.5 - bob, 2, 0, Math.PI * 2); c.fill();
      if (cheer && k % 3 === 0) { c.strokeStyle = '#e4ba94'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(sx - 2, sy - 8 - bob); c.lineTo(sx - 4, sy - 14 - bob); c.moveTo(sx + 2, sy - 8 - bob); c.lineTo(sx + 4, sy - 14 - bob); c.stroke(); }
    }
  }
  // Baldachin über der Mitte mit gestreiftem Tuch
  const top = 36;
  c.strokeStyle = '#5a3d26'; c.lineWidth = 1.8;
  for (const [px, py] of [[x - 1.6, y + 0.6], [x + 1.6, y + 0.6], [x + 1.6, y - 0.7]]) { const a = P(px, py, 0), b = P(px, py, top); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  const r = [P(x - 1.7, y + 0.7, top), P(x + 1.7, y + 0.7, top), P(x + 1.7, y - 0.8, top), P(x - 1.7, y - 0.8, top)];
  const peak = P(x, y, top + 10);
  poly(c, [r[0], r[1], peak], col);
  poly(c, [r[1], r[2], peak], shade(col, 0.8));
  c.strokeStyle = '#e8dcc0'; c.lineWidth = 2;
  c.beginPath(); for (const f of [0.25, 0.5, 0.75]) { const q = lerp2(r[0], r[1], f); c.moveTo(q[0], q[1]); c.lineTo(peak[0], peak[1]); } c.stroke();
  for (let k = 0; k < 6; k++) { const q = lerp2(r[0], r[1], (k + 0.5) / 6); c.fillStyle = k % 2 ? col : '#e8dcc0'; c.beginPath(); c.arc(q[0], q[1], 2.6, 0, Math.PI); c.fill(); }
  banner(c, x, y, top + 10, col);
}

function drawPavilion(c, x, y, col) {
  drawShadow(c, x, y, 1.0, 1.0, 24, 0.16);
  drawBox(c, x, y, 0.9, 0.9, 13, '#ece2c8');
  for (const f of [0.15, 0.5, 0.85]) faceQuad(c, x, y, 0.9, 0.9, 'L', f - 0.08, f + 0.08, 0, 13, col);
  faceQuad(c, x, y, 0.9, 0.9, 'R', 0.3, 0.7, 0, 13, shade(col, 0.85));
  drawPyramid(c, x, y, 1.05, 1.05, 13, 13, col);
  const [px, py] = P(x, y, 26);
  c.strokeStyle = '#4a3322'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 8); c.stroke();
  const w = Math.sin(G.time * 3 + x) * 1.2;
  c.fillStyle = col; c.beginPath(); c.moveTo(px, py - 8); c.lineTo(px + 7, py - 6.5 + w); c.lineTo(px, py - 5); c.fill();
}

// Galgen: Podest mit Stufe, zwei Pfosten, Querbalken, Strick
function drawGallows(c, g, hanged) {
  // Gemalter Galgen: leer oder mit dem Gehenkten, im Schnee mit Winterbild
  if (p5(c, bauId(hanged ? 'galgen_besetzt' : 'galgen'), g.x, g.y)) return;
  const wood = '#6b4a2e';
  drawShadow(c, g.x, g.y, 1.2, 0.9, 34, 0.14);
  drawBox(c, g.x, g.y + 0.1, 1.2, 0.9, 5, '#7a5a3a', 0, 'plank');
  drawBox(c, g.x, g.y + 0.7, 0.5, 0.3, 2.5, '#6b4a2e', 0, 'plank');
  for (const dx of [-0.45, 0.45]) drawBox(c, g.x + dx, g.y, 0.1, 0.1, 29, wood, 5);
  drawBox(c, g.x, g.y, 1.05, 0.11, 3, '#5a3d26', 34);
  const [ax, ay] = P(g.x - 0.45, g.y, 26), [bx, by] = P(g.x - 0.18, g.y, 34);
  c.strokeStyle = wood; c.lineWidth = 1.6; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
  const [rx, ry] = P(g.x + 0.12, g.y, 34);
  c.strokeStyle = '#b8a070'; c.lineWidth = 0.9;
  if (!hanged) {
    c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx, ry + 8); c.stroke();
    c.beginPath(); c.ellipse(rx, ry + 10, 1.6, 2.1, 0, 0, Math.PI * 2); c.stroke();
    return;
  }
  // Eine stille dunkle Gestalt, leicht im Wind
  c.save(); c.translate(rx, ry); c.scale(0.62, 0.62); c.rotate(Math.sin(G.time * 1.1) * 0.05);
  c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 14); c.stroke();
  c.fillStyle = 'rgba(58,52,48,0.92)';
  c.beginPath(); c.arc(0, 17, 3, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(-4, 20); c.lineTo(4, 20); c.lineTo(3.4, 32); c.lineTo(-3.4, 32); c.closePath(); c.fill();
  c.fillRect(-2.6, 32, 2, 8); c.fillRect(0.6, 32, 2, 8);
  c.restore();
}

// ---------------------------------------------------------------- Erzgrube
// Stollen: Felsrippe im Hang mit hölzernem Mundloch, Schienen aus Bohlen
function drawStollen(c, b) {
  const rock = '#857b6c';
  drawShadow(c, b.x, b.y, b.wx, b.wy, 30, 0.18);
  drawBox(c, b.x, b.y, b.wx, b.wy, 20, rock, 0, 'stone');
  drawBox(c, b.x + 0.3, b.y - 0.25, b.wx * 0.6, b.wy * 0.55, 10, '#918779', 20, 'stone');
  if (lookSeason() !== 3) { const [gx, gy] = P(b.x, b.y, 30); c.fillStyle = 'rgba(95,140,60,0.75)'; c.beginPath(); c.ellipse(gx + 4, gy + 2, 16, 5, 0, 0, Math.PI * 2); c.fill(); }
  // Mundloch an der Vorderseite
  const L = (u, z) => facePoint(b.x, b.y, b.wx, b.wy, 'L', u, z);
  const q = [L(0.32, 0), L(0.62, 0), L(0.62, 13), L(0.32, 13)];
  poly(c, q, '#1a1512');
  c.strokeStyle = '#6b4a2e'; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(q[0][0], q[0][1]); c.lineTo(q[3][0], q[3][1] - 1); c.moveTo(q[1][0], q[1][1]); c.lineTo(q[2][0], q[2][1] - 1);
  const l0 = L(0.28, 14), l1 = L(0.66, 14); c.moveTo(l0[0], l0[1]); c.lineTo(l1[0], l1[1]); c.stroke();
  // Bohlenweg hinaus
  const a0 = P(b.x - 0.1, b.y + b.wy / 2, 0), a1 = P(b.x - 0.25, b.y + b.wy / 2 + 1.2, 0);
  c.strokeStyle = '#7a5636'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(a0[0] - 3, a0[1]); c.lineTo(a1[0] - 3, a1[1]); c.moveTo(a0[0] + 3, a0[1]); c.lineTo(a1[0] + 3, a1[1]); c.stroke();
  if (darkness() > 0.2) addLight(b.x - 0.1, b.y + b.wy / 2, 6, 20, 0.6);
}

// Abraumhalde aus Gestein und Schlacke
function drawHalde(c, b) {
  const [x, y] = P(b.x, b.y, 0);
  const base = b.ore === 'eisen' ? '#6e5a4c' : '#787470';
  c.fillStyle = 'rgba(25,35,15,0.22)'; c.beginPath(); c.ellipse(x + 4, y + 2, 34, 15, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = shade(base, 0.8); c.beginPath(); c.ellipse(x, y, 32, 14, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = base; c.beginPath(); c.ellipse(x - 2, y - 6, 24, 11, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = shade(base, 1.15); c.beginPath(); c.ellipse(x - 5, y - 11, 13, 6, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = shade(base, 0.6);
  for (let k = 0; k < 18; k++) { const ox = ((k * 29) % 44) - 22, oy = ((k * 17) % 16) - 9; c.fillRect(x + ox, y + oy - 2, 2.2, 1.6); }
  if (lookSeason() === 3) { c.fillStyle = 'rgba(240,244,244,0.85)'; c.beginPath(); c.ellipse(x - 5, y - 13, 11, 4.5, 0, 0, Math.PI * 2); c.fill(); }
}

// ---------------------------------------------------------------- Einsiedelei
// Klause: runde Steinhütte mit Strohkegel
function drawKlause(c, b) {
  const stone = '#9a9384';
  drawShadow(c, b.x, b.y, b.wx, b.wy, b.h + 18, 0.18);
  drawBox(c, b.x, b.y, b.wx, b.wy, b.h, stone, 0, 'stone');
  faceQuad(c, b.x, b.y, b.wx, b.wy, 'L', 0.38, 0.62, 0, Math.min(14, b.h * 0.8), '#3a2a1c');
  windowOn(c, b, 'R', 0.42, 0.58, b.h * 0.5, b.h * 0.72, true);
  drawPyramid(c, b.x, b.y, b.wx + 0.15, b.wy + 0.15, b.h, 16, winterize(ROOFS.thatch));
  const top = P(b.x, b.y, b.h + 16);
  if (Math.random() < 0.05) smokeEmit(top[0], top[1] - 2, 0.4);
  if (darkness() > 0.2) addLight(b.x, b.y + b.wy / 2, 8, 26, 0.8);
}

// Der heilige Ort: Quelle, Steinkreis, Hügelgrab, Höhle oder alte Eibe
function drawMystic(c, b) {
  const f = b.feature, t = G.time, r = mulberry32((b.idx || 7) + 99);
  if (f === 'quelle') {
    const [x, y] = P(b.x, b.y, 0);
    c.fillStyle = '#8f897c'; c.beginPath(); c.ellipse(x, y, 20, 10, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#6f695e'; c.beginPath(); c.ellipse(x, y - 1, 15, 7.5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#4f86a8'; c.beginPath(); c.ellipse(x, y - 1, 12.5, 6, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(220,240,250,0.7)'; c.lineWidth = 0.8;
    const k = (t * 0.6) % 1; c.beginPath(); c.ellipse(x, y - 1, 4 + k * 8, 2 + k * 4, 0, 0, Math.PI * 2); c.stroke();
    // kleines Holzkreuz
    c.strokeStyle = '#5a3d26'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(x + 16, y - 2); c.lineTo(x + 16, y - 20); c.moveTo(x + 11, y - 15); c.lineTo(x + 21, y - 15); c.stroke();
  } else if (f === 'steine') {
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2, sx = b.x + Math.cos(a) * 1.15, sy = b.y + Math.sin(a) * 0.95;
      const h = 13 + r() * 9;
      drawBox(c, sx, sy, 0.22, 0.16, h, k % 2 ? '#8e8a80' : '#9c978b', 0, 'stone');
      if (lookSeason() !== 3) { const [mx, my] = P(sx, sy, h * 0.4); c.fillStyle = 'rgba(100,130,70,0.6)'; c.fillRect(mx - 3, my, 3, 3); }
    }
    drawBox(c, b.x, b.y, 0.5, 0.3, 4, '#8a857a', 0, 'stone');
  } else if (f === 'grab') {
    // Langes Hügelgrab mit Steinportal
    const [x, y] = P(b.x, b.y, 0);
    const g = lookSeason() === 3 ? '#e3e9e9' : '#5f8a3a';
    c.fillStyle = shade(g, 0.8); c.beginPath(); c.ellipse(x - 4, y - 2, 34, 13, -0.46, 0, Math.PI * 2); c.fill();
    c.fillStyle = g; c.beginPath(); c.ellipse(x - 6, y - 6, 28, 10, -0.46, 0, Math.PI * 2); c.fill();
    for (const [dx, dy, h] of [[0.7, 0.75, 16], [1.05, 0.45, 18], [0.35, 1.0, 14]]) drawBox(c, b.x + dx, b.y + dy, 0.24, 0.2, h, '#9a958a', 0, 'stone');
    drawBox(c, b.x + 0.8, b.y + 0.65, 0.7, 0.35, 3, '#8a857a', 15, 'stone');
    const [dx, dy] = P(b.x + 0.75, b.y + 0.62, 0); c.fillStyle = '#1e1a16'; c.fillRect(dx - 3, dy - 11, 5, 10);
  } else if (f === 'hoehle') {
    // Felswand mit Höhle und eingehauenem Kreuz
    drawBox(c, b.x + 0.2, b.y - 0.3, 1.8, 1.2, 26, '#8a7f70', 0, 'stone');
    drawBox(c, b.x - 0.3, b.y - 0.1, 1.0, 0.9, 16, '#968b7b', 0, 'stone');
    const q = [0.25, 0.55].map((u) => facePoint(b.x + 0.2, b.y - 0.3, 1.8, 1.2, 'L', u, 0));
    const tq = [0.3, 0.5].map((u) => facePoint(b.x + 0.2, b.y - 0.3, 1.8, 1.2, 'L', u, 14));
    poly(c, [q[0], q[1], tq[1], tq[0]], '#16120f');
    const cr = facePoint(b.x + 0.2, b.y - 0.3, 1.8, 1.2, 'L', 0.78, 18);
    c.strokeStyle = '#5a5248'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(cr[0], cr[1] - 6); c.lineTo(cr[0], cr[1] + 4); c.moveTo(cr[0] - 3, cr[1] - 2); c.lineTo(cr[0] + 3, cr[1] - 2); c.stroke();
    if (darkness() > 0.2) addLight(b.x, b.y + 0.4, 6, 24, 0.7);
  } else {
    // Alte Eibe mit bunten Bändern und kleinem Schrein
    const [x, y] = P(b.x, b.y, 0);
    c.fillStyle = '#4a3428'; c.fillRect(x - 5, y - 28, 10, 28);
    c.fillStyle = '#1f3a24'; c.beginPath(); c.ellipse(x, y - 42, 30, 22, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a4a2e'; c.beginPath(); c.ellipse(x - 6, y - 48, 20, 14, 0, 0, Math.PI * 2); c.fill();
    const cols = ['#c9302a', '#e8e0cc', '#3d6fa3', '#d6ad4c'];
    for (let k = 0; k < 6; k++) { const bx = x - 18 + k * 7, by = y - 26 - (k % 2) * 6, sw = Math.sin(t * 2 + k) * 2; c.strokeStyle = cols[k % 4]; c.lineWidth = 1.4; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + sw, by + 9); c.stroke(); }
    drawBox(c, b.x + 0.7, b.y + 0.5, 0.3, 0.3, 9, '#8a857a', 0, 'stone');
  }
}

// Glühwürmchen und Nebel an mystischen Orten in der Dämmerung, ein Funkeln am Tag
function drawMysticGlow(c, s) {
  const dk = darkness(), t = G.time;
  const n = dk > 0.15 ? 12 : 3;
  for (let k = 0; k < n; k++) {
    const a = t * (0.3 + (k % 3) * 0.12) + k * 2.1;
    const x = s.x + 1.3 + Math.cos(a) * (1.2 + (k % 4) * 0.35), y = s.y + 0.3 + Math.sin(a * 1.3) * (0.9 + (k % 3) * 0.3);
    const [px, py] = P(x, y, 8 + Math.sin(a * 2.2) * 6 + (k % 5) * 3);
    const al = dk > 0.15 ? 0.55 + 0.45 * Math.sin(t * 4 + k) : 0.4 * Math.max(0, Math.sin(t * 2 + k * 1.7));
    c.fillStyle = dk > 0.15 ? `rgba(220,255,150,${al})` : `rgba(255,250,220,${al})`;
    c.beginPath(); c.arc(px, py, dk > 0.15 ? 1.6 : 1.1, 0, Math.PI * 2); c.fill();
  }
  if (dk > 0.15) {
    const [mx, my] = P(s.x + 1, s.y + 0.5, 2);
    const g = c.createRadialGradient(mx, my, 4, mx, my, 70);
    g.addColorStop(0, `rgba(210,230,235,${0.16 * dk})`); g.addColorStop(1, 'rgba(210,230,235,0)');
    c.fillStyle = g; c.fillRect(mx - 70, my - 70, 140, 140);
    addLight(s.x + 1.3, s.y + 0.3, 10, 34, 0.5);
  }
}

function drawLooseHorse(c, f) {
  const x = f.x + f.vx * f.t, y = f.y + f.vy * f.t;
  const [px, py] = P(x, y, 0);
  const fc = (f.vx - f.vy) >= 0 ? 1 : -1;
  const kind = f.look ? 'ross' : 'pferd';
  c.save(); c.translate(px, py); c.globalAlpha = Math.min(1, (f.dur - f.t) * 2);
  if (horseReady(kind)) {
    // Ohne Reiter davongaloppierend
    c.scale(1.14 * FIG, 1.14 * FIG);
    drawHorseSprite(c, kind, 'galopp', dirIndex(f.vx, f.vy), f.t * 1.7, f.look ? f.look.tunic : f.col);
  } else { c.scale(fc * 1.14 * FIG, 1.14 * FIG); drawHorse(c, f.col, G.time, true, f.look); }
  c.restore();
}

function drawSplinter(c, f) {
  const k = f.t;
  const [px, py] = P(f.x + f.vx * k, f.y + f.vy * k, f.z0 + 30 * k - 50 * k * k);
  c.globalAlpha = Math.max(0, 1 - k / f.dur);
  c.strokeStyle = '#d8c8a0'; c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(px - 2, py - 1); c.lineTo(px + 2, py + 1); c.stroke();
  c.globalAlpha = 1;
}

// Zielleiste beim Tjost (Bildschirmkoordinaten)
function drawAimBar(c, w, h, aim) {
  const bw = Math.min(440, w - 60), bx = (w - bw) / 2, by = h - (w < 720 ? 190 : 150);
  c.fillStyle = 'rgba(28,20,14,0.86)'; c.fillRect(bx - 16, by - 34, bw + 32, 62);
  c.strokeStyle = '#d6ad4c'; c.lineWidth = 1.2; c.strokeRect(bx - 16, by - 34, bw + 32, 62);
  c.font = '600 14px "Alegreya Sans", sans-serif'; c.textAlign = 'center'; c.fillStyle = '#f3ead2';
  c.fillText(aim.pressed === null ? (w < 720 ? 'Tippen, wenn die Marke im Gold ist!' : 'Lanze senken: Leertaste oder Klick im goldenen Feld') : 'Die Lanze ist gesenkt …', w / 2, by - 14);
  c.fillStyle = '#4a3a2a'; c.fillRect(bx, by, bw, 12);
  const z0 = bx + (aim.c - aim.w / 2) * bw, zw = aim.w * bw;
  const g = c.createLinearGradient(z0, 0, z0 + zw, 0);
  g.addColorStop(0, 'rgba(214,173,76,0.35)'); g.addColorStop(0.5, 'rgba(255,224,120,1)'); g.addColorStop(1, 'rgba(214,173,76,0.35)');
  c.fillStyle = g; c.fillRect(z0, by, zw, 12);
  const mk = (v, col) => { const x = bx + v * bw; c.fillStyle = col; c.beginPath(); c.moveTo(x, by - 3); c.lineTo(x - 5, by - 10); c.lineTo(x + 5, by - 10); c.closePath(); c.fill(); c.fillRect(x - 1, by - 3, 2, 18); };
  mk(aim.m, '#ffffff');
  if (aim.pressed !== null) mk(aim.pressed, '#ff7a5a');
}

// Brand- und Belagerungsschäden: Ruß, Löcher im Dach, eingestürzte Sparren, danach ein Gerüst
function drawDamage(c, b) {
  const d = b.dmg, burning = b.fire > G.time;
  const x0 = b.x - b.wx / 2, x1 = b.x + b.wx / 2, y0 = b.y - b.wy / 2, y1 = b.y + b.wy / 2;
  c.save();
  c.globalAlpha = Math.min(0.8, 0.25 + d * 0.6);
  poly(c, [P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, b.h * (0.4 + d * 0.5)), P(x0, y1, b.h * 0.3)], '#2a2220');
  poly(c, [P(x1, y1, 0), P(x1, y0, 0), P(x1, y0, b.h * 0.3), P(x1, y1, b.h * (0.3 + d * 0.5))], '#1f1a18');
  c.restore();
  if (d >= 0.35) {
    // Löcher im Dach mit verkohlten Sparren
    const r = mulberry32(b.idx || 1);
    for (let k = 0; k < (d >= 0.7 ? 4 : 2); k++) {
      const u = 0.2 + r() * 0.6, v = 0.2 + r() * 0.6;
      const p = P(x0 + u * b.wx, y0 + v * b.wy, b.h + b.rh * 0.5);
      c.fillStyle = '#1e1816'; c.beginPath(); c.ellipse(p[0], p[1], 6 + d * 6, 3 + d * 3, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#3a2a20'; c.lineWidth = 1.4;
      for (let j = -1; j <= 1; j++) { c.beginPath(); c.moveTo(p[0] + j * 4 - 3, p[1] - 4); c.lineTo(p[0] + j * 4 + 3, p[1] + 4); c.stroke(); }
    }
  }
  if (burning) {
    const top = P(b.x, b.y, b.h + b.rh * 0.6);
    for (let k = 0; k < 5; k++) {
      const fx = top[0] + (k - 2) * 6, fl = 1 + Math.sin(G.time * 11 + k * 1.7) * 0.25;
      c.fillStyle = '#e8762a'; c.beginPath(); c.moveTo(fx - 4, top[1]); c.quadraticCurveTo(fx, top[1] - 16 * fl, fx + 4, top[1]); c.fill();
      c.fillStyle = '#ffd25a'; c.beginPath(); c.moveTo(fx - 2, top[1]); c.quadraticCurveTo(fx, top[1] - 9 * fl, fx + 2, top[1]); c.fill();
    }
    if (Math.random() < 0.35) smokeEmit(top[0], top[1] - 10, 1);
    addLight(b.x, b.y, b.h + 10, 50, 1.2);
  } else drawScaffold(c, b.x, b.y, b.wx + 0.25, b.wy + 0.25, b.h + 6);
}

// Friedhof: hintere Hälfte mit Gräbern, vordere Zaunhälfte getrennt
// Gemalter Friedhof (tools/friedhof.py): Gräber, Friedhofskreuz, Zaunstücke und Tor, je mit Winterbild; dazu die Gefallenen.
// Fußpunkte in Weltpixeln (Gefallene in Figureneinheiten), Maßstab 1/3.
const fhId = (name) => { const w = `fh_${name}_winter`; return lookSeason() === 3 && ART[w] ? w : `fh_${name}`; };
const ZAUN_LEN = 0.51, TOR_LEN = 0.58;
// Zaun von (ax, ay) nach (bx, by), längs x oder y: Stücke gleicher Länge, von hinten nach vorn gezeichnet.
// Das Bild läuft vom linken Pfosten nach rechts oben (längs −y); gespiegelt läuft es nach links oben (längs −x).
function paintFence(c, ax, ay, bx, by) {
  const alongY = Math.abs(bx - ax) < 1e-6, len = Math.hypot(bx - ax, by - ay);
  if (len < 0.05) return true;
  const n = Math.max(1, Math.round(len / ZAUN_LEN)), seg = len / n, sc = seg / ZAUN_LEN;
  // Ausgangspunkt jedes Stücks ist das vordere Ende (größeres y bzw. größeres x)
  for (let i = n - 1; i >= 0; i--) {
    const px = alongY ? ax : Math.max(ax, bx) - i * seg, py = alongY ? Math.max(ay, by) - i * seg : ay;
    if (!p5(c, fhId('friedhof_zaun'), px, py, sc, !alongY)) return false;
  }
  return true;
}
function drawCemeteryArt(c, s, front) {
  const cm = s.cemetery;
  if (!ART.fh_friedhof_zaun) return false;
  const x0 = cm.x - cm.wx / 2, x1 = cm.x + cm.wx / 2, y0 = cm.y - cm.wy / 2, y1 = cm.y + cm.wy / 2;
  if (front) {
    // vorne: rechte Seite (längs y) und die Vorderseite mit dem Tor in der Mitte
    paintFence(c, x1, y0, x1, y1);
    const xm = cm.x;
    paintFence(c, x0, y1, xm - TOR_LEN / 2, y1);
    p5(c, fhId('friedhof_tor'), xm, y1);
    paintFence(c, xm + TOR_LEN / 2, y1, x1, y1);
    return true;
  }
  paintFence(c, x0, y0, x1, y0);
  paintFence(c, x0, y0, x0, y1);
  // Gräber: frische mit Holzkreuz, alte verwittert, mit Steinkreuz oder (selten) als Steingrab
  const n = graveCount(s), slots = [];
  for (let k = 0; k < Math.min(n, 15); k++) slots.push({ ...graveSlot(s, k), fresh: k >= cm.old, k });
  slots.sort((a, b) => a.x + a.y - (b.x + b.y));
  const rich = s.type === 'stadt' || s.type === 'burg' || s.type === 'abtei';
  for (const g of slots) {
    const h = hash2(Math.round(g.x * 7), Math.round(g.y * 7), 61);
    const name = g.fresh ? 'grab_frisch' : h < (rich ? 0.14 : 0.05) ? 'grab_stein' : h < (rich ? 0.6 : 0.35) ? 'grab_steinkreuz' : 'grab_alt';
    p5(c, fhId(name), g.x, g.y, 0.95);
  }
  // Hohes Friedhofskreuz in der vorderen linken Ecke
  p5(c, fhId('friedhofskreuz'), x0 + 0.3, y1 - 0.3, 1.1);
  return true;
}

function drawCemetery(c, s, front) {
  if (drawCemeteryArt(c, s, front)) return;
  const cm = s.cemetery;
  if (front) { drawFenceHalf(c, cm.x, cm.y, cm.wx, cm.wy, true); return; }
  drawFenceHalf(c, cm.x, cm.y, cm.wx, cm.wy, false);
  const n = graveCount(s);
  const slots = [];
  for (let k = 0; k < Math.min(n, 15); k++) slots.push({ ...graveSlot(s, k), fresh: k >= cm.old, k });
  slots.sort((a, b) => a.x + a.y - (b.x + b.y));
  for (const g of slots) {
    const [px, py] = P(g.x, g.y);
    if (g.fresh) {
      c.fillStyle = '#6b4a2e'; c.beginPath(); c.ellipse(px + 4, py + 2, 7, 3, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#5a4030'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(px, py + 1); c.lineTo(px, py - 10); c.moveTo(px - 3, py - 7); c.lineTo(px + 3, py - 7); c.stroke();
    } else {
      c.fillStyle = '#8f897c'; c.fillRect(px - 1.2, py - 9, 2.4, 9); c.fillRect(px - 3.5, py - 7, 7, 1.8);
    }
  }
  // Großes Steinkreuz
  const cx = cm.x - cm.wx / 2 + 0.3, cy = cm.y + cm.wy / 2 - 0.3;
  drawBox(c, cx, cy, 0.3, 0.3, 4, '#9a958a', 0, 'stone');
  const [qx, qy] = P(cx, cy, 4);
  c.fillStyle = '#a8a296'; c.fillRect(qx - 1.5, qy - 18, 3, 18); c.fillRect(qx - 5, qy - 14, 10, 3);
}

// Werkzeuge im Bild melden ihren Takt; das Tonmodul spielt jeden Schlag im Moment des Treffers
let workSounds = [];
export function workEmitters() { return workSounds; }
function emitWork(x, y, kind, speed, phase) { if (workSounds.length < 40) workSounds.push({ x, y, kind, speed, phase }); }

// Trebuchet der Belagerer: Gestell, Schwenkarm, Gegengewicht
function drawTrebuchet(c, tr) {
  const [bx, by] = P(tr.x, tr.y);
  c.strokeStyle = '#5a3e26'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(bx - 14, by); c.lineTo(bx - 2, by - 36); c.lineTo(bx + 10, by); c.moveTo(bx - 6, by + 4); c.lineTo(bx - 2, by - 36); c.lineTo(bx + 4, by + 4); c.stroke();
  c.lineWidth = 2.5; c.beginPath(); c.moveTo(bx - 18, by + 2); c.lineTo(bx + 16, by - 2); c.stroke();
  const since = G.time - tr.fired;
  const ang = since < 0.5 ? -0.9 + (since / 0.5) * 2.6 : since < 3 ? 1.7 - ((since - 0.5) / 2.5) * 2.6 : -0.9;
  const pv = [bx - 2, by - 36];
  const L1 = 30, L2 = 10;
  const tip = [pv[0] + Math.cos(-Math.PI / 2 + ang) * L1, pv[1] + Math.sin(-Math.PI / 2 + ang) * L1];
  const cw = [pv[0] - Math.cos(-Math.PI / 2 + ang) * L2, pv[1] - Math.sin(-Math.PI / 2 + ang) * L2];
  c.strokeStyle = '#6b4a2a'; c.lineWidth = 3; c.beginPath(); c.moveTo(cw[0], cw[1]); c.lineTo(tip[0], tip[1]); c.stroke();
  c.fillStyle = '#4a3a2a'; c.fillRect(cw[0] - 5, cw[1], 10, 9);
  c.strokeStyle = '#c9b48a'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(tip[0], tip[1]); c.lineTo(tip[0] + 3, tip[1] + 8); c.stroke();
}

function drawSiegeShot(c, sh) {
  if (sh.t < 0) return;
  const k = Math.min(1, sh.t / sh.dur);
  const x = sh.x0 + (sh.x1 - sh.x0) * k, y = sh.y0 + (sh.y1 - sh.y0) * k;
  const p = P(x, y, 30 + Math.sin(k * Math.PI) * 140);
  c.fillStyle = '#5a5248'; c.beginPath(); c.arc(p[0], p[1], 3.2, 0, Math.PI * 2); c.fill();
}

function drawOpenGrave(c, g) {
  if (p5(c, fhId('grab_offen'), g.x + 0.05, g.y + 0.05, 0.95)) return;
  poly(c, [P(g.x - 0.18, g.y - 0.1), P(g.x + 0.18, g.y - 0.1), P(g.x + 0.18, g.y + 0.3), P(g.x - 0.18, g.y + 0.3)], '#2a1e14');
  const [px, py] = P(g.x + 0.35, g.y + 0.1);
  c.fillStyle = '#6b4a2e'; c.beginPath(); c.ellipse(px, py, 6, 3.5, 0, Math.PI, Math.PI * 2); c.fill();
}

function drawChurch(c, b) {
  const stone = '#b5ae9f';
  const dark = abandonedId(b.site);
  const tx = b.x + b.wx / 2 - 0.45, ty = b.y;
  const th = b.abbey ? 88 : 74;
  drawShadow(c, b.x, b.y, b.wx, b.wy, th * 0.8);
  drawBox(c, b.x - 0.25, b.y, b.wx - 0.5, b.wy, b.h, stone, 0, 'stone');
  const nb = { x: b.x - 0.25, y: b.y, wx: b.wx - 0.5, wy: b.wy };
  for (const u of [0.15, 0.45, 0.75]) {
    faceQuad(c, nb.x, nb.y, nb.wx, nb.wy, 'L', u - 0.02, u + 0.1, b.h * 0.32, b.h * 0.84, '#6f685c');
    faceQuad(c, nb.x, nb.y, nb.wx, nb.wy, 'L', u, u + 0.08, b.h * 0.35, b.h * 0.8, darkness() > 0.2 && !dark ? '#ffd27a' : '#41506a');
  }
  drawGableRoof(c, b.x - 0.25, b.y, b.wx - 0.5, b.wy, b.h, 20, ROOFS.tile, stone, true);
  drawBox(c, tx, ty, 1.0, 1.0, th, stone, 0, 'stone');
  faceQuad(c, tx, ty, 1, 1, 'L', 0.32, 0.68, 0, 14, '#5a4030');
  faceQuad(c, tx, ty, 1, 1, 'L', 0.38, 0.62, 0, 12, '#2f241b');
  faceQuad(c, tx, ty, 1, 1, 'L', 0.4, 0.6, th * 0.7, th * 0.85, '#2f2a28');
  faceQuad(c, tx, ty, 1, 1, 'R', 0.4, 0.6, th * 0.7, th * 0.85, '#2f2a28');
  drawPyramid(c, tx, ty, 1.0, 1.0, th, 24, ROOFS.slate);
  const [ax, ay] = P(tx, ty, th + 24);
  c.strokeStyle = '#d6ad4c'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax, ay - 9); c.moveTo(ax - 3, ay - 6); c.lineTo(ax + 3, ay - 6); c.stroke();
  if (darkness() > 0.2 && !dark) addLight(b.x, b.y + b.wy / 2, b.h * 0.6, 34, 0.7);
}

// ---------------------------------------------------------------- Wahrzeichen
const GLASS = () => (darkness() > 0.2 ? '#ffd27a' : '#3e4a5e');

const CATHEDRAL_K = 1.3;
// Romanische Kathedrale: Langhaus, Querhaus, Apsis, Vierungs- und Westtürme. Optional Gerüst, Brandruine, Felsen.
function drawCathedral(c, b) {
  const stone = b.color || '#cbc3af';
  const dark = shade(stone, 0.55);
  const L = (b.len || 4) * CATHEDRAL_K, w = 1.5, h = b.burned ? 32 : 40;
  const roof = b.burned ? null : ROOFS.slate;
  const x0 = b.x - L / 2, x1 = b.x + L / 2, y = b.y, xc = b.x + L * 0.12;
  let lift = 0;
  if (b.rock) {
    lift = 30;
    const r = mulberry32(Math.round(b.x * 13));
    drawBox(c, b.x, y, L + 1.4, 3.2, 12, '#8d8577', 0, 'stone');
    drawBox(c, b.x, y, L + 0.8, 2.7, 10, '#978f80', 12, 'stone');
    drawBox(c, b.x - 0.1, y, L + 0.2, 2.3, 8, '#a19a8b', 22, 'stone');
    for (let k = 0; k < 5; k++) drawHouse(c, { x: b.x - L / 2 + 0.2 + k * 0.85, y: y + 1.45, wx: 0.5, wy: 0.4, h: 7, rh: 6, wall: 'stone', roof: 'slate', lit: true, v: r() });
    baseZ += lift;
  }
  drawShadow(c, b.x, y, L, 2.4, h + 30, 0.22);
  const towerH = h + 38, tw = 0.86;
  const westTower = (ty) => {
    const th = b.unfinished ? h + 12 : towerH;
    drawBox(c, x0 + tw / 2, ty, tw, tw, th, stone, 0, 'stone');
    for (const f of ['L', 'R']) { faceQuad(c, x0 + tw / 2, ty, tw, tw, f, 0.36, 0.64, th * 0.62, th * 0.82, GLASS()); faceQuad(c, x0 + tw / 2, ty, tw, tw, f, 0.4, 0.6, th * 0.3, th * 0.44, GLASS()); }
    if (b.unfinished) drawScaffold(c, x0 + tw / 2, ty, tw + 0.15, tw + 0.15, th + 16);
    else drawPyramid(c, x0 + tw / 2, ty, tw, tw, th, b.central === 'spitze' ? 44 : 18, ROOFS.slate);
  };
  if (b.westTowers === 2) { westTower(y - 0.55); westTower(y + 0.55); }
  else if (b.westTowers === 1) westTower(y);
  // Querhaus, hinterer Arm
  const ta = w / 2 + 0.52;
  drawBox(c, xc, y - ta, 1.2, 1.05, h, stone, 0, 'stone');
  if (roof) drawGableRoof(c, xc, y - ta, 1.2, 1.05, h, 19, roof, stone, false);
  // Langhaus mit Strebepfeilern und Rundbogenfenstern
  const nx0 = b.westTowers ? x0 + 0.86 : x0 + 0.1, nx1 = x1 - 0.75, nx = (nx0 + nx1) / 2, nl = nx1 - nx0;
  drawBox(c, nx, y, nl, w, h, stone, 0, 'stone');
  const n = Math.max(4, Math.round(nl / 0.42));
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    faceQuad(c, nx, y, nl, w, 'L', u - 0.012, u + 0.012, 0, h, shade(stone, 0.82));
    faceQuad(c, nx, y, nl, w, 'L', u + 0.03, u + 0.07, h * 0.4, h * 0.82, GLASS());
  }
  if (roof) drawGableRoof(c, nx, y, nl, w, h, 22, roof, stone, true);
  else {
    // Ausgebrannt: verkohlte Mauerkrone, ein paar Balken, Rauch
    c.strokeStyle = '#2a2420'; c.lineWidth = 2;
    for (let k = 0; k < 6; k++) { const a = P(nx0 + (k + 0.3) * nl / 6, y - w / 2, h), d = P(nx0 + (k + 0.5) * nl / 6, y + w / 2, h + 6); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(d[0], d[1]); c.stroke(); }
    faceQuad(c, nx, y, nl, w, 'L', 0, 1, h - 4, h, '#3a3430');
    if (Math.random() < 0.06) { const p = P(nx, y, h); smokeEmit(p[0], p[1], 1); }
  }
  // Vierungsturm: steht auf der Vierung, sichtbar erst über dem Dach, hinter dem vorderen Querhaus
  if (b.central === 'reiter') {
    drawBox(c, xc, y, 0.36, 0.36, 18, '#8a6a40', h + 18);
    drawPyramid(c, xc, y, 0.36, 0.36, h + 36, 32, ROOFS.slate);
  } else if (b.central) {
    const ch = h + (b.central === 'stumpf' ? 14 : 42), cw = 1.3;
    drawBox(c, xc, y, cw, cw, ch - h, stone, h, 'stone');
    for (const f of ['L', 'R']) { faceQuad(c, xc, y, cw, cw, f, 0.16, 0.36, ch * 0.72, ch * 0.92, dark); faceQuad(c, xc, y, cw, cw, f, 0.64, 0.84, ch * 0.72, ch * 0.92, dark); }
    if (b.central === 'spitze') drawPyramid(c, xc, y, cw, cw, ch, 66, ROOFS.slate);
    else if (b.spire) drawPyramid(c, xc, y, cw, cw, ch, 84, ROOFS.slate);
    else { drawMerlons(c, xc, y, cw, cw, ch, stone); drawPyramid(c, xc, y, cw * 0.7, cw * 0.7, ch, 12, ROOFS.slate); }
    const [ax, ay] = P(xc, y, ch + (b.central === 'spitze' ? 66 : b.spire ? 84 : 12));
    c.strokeStyle = '#d6ad4c'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax, ay - 9); c.moveTo(ax - 3, ay - 6); c.lineTo(ax + 3, ay - 6); c.stroke();
  } else if (b.spire) {
    drawBox(c, xc, y, 1.1, 1.1, 30, stone, h, 'stone');
    drawPyramid(c, xc, y, 1.1, 1.1, h + 30, 90, ROOFS.slate);
  }
  // Querhaus, vorderer Arm
  drawBox(c, xc, y + ta, 1.2, 1.05, h, stone, 0, 'stone');
  faceQuad(c, xc, y + ta, 1.2, 1.05, 'L', 0.32, 0.68, h * 0.45, h * 0.88, GLASS());
  if (roof) drawGableRoof(c, xc, y + ta, 1.2, 1.05, h, 19, roof, stone, false);
  // Apsis im Osten
  drawBox(c, x1 - 0.38, y, 0.76, w * 0.8, h * 0.82, stone, 0, 'stone');
  faceQuad(c, x1 - 0.38, y, 0.76, w * 0.8, 'R', 0.35, 0.65, h * 0.35, h * 0.7, GLASS());
  if (roof) drawPyramid(c, x1 - 0.38, y, 0.76, w * 0.8, h * 0.82, 12, roof);
  // Baustelle: Gerüst und Kran
  if (b.scaffold) {
    drawScaffold(c, b.unfinished ? x0 + 0.4 : x1 - 0.4, y, 1.0, 1.4, h + 26);
    drawCrane(c, x1 + 0.3, y + 1.3, b.x);
  }
  if (lift) baseZ -= lift;
  if (darkness() > 0.2) addLight(b.x, y + w / 2, h * 0.5, 40, 0.8);
}

// Großer Bergfried mit Ecktürmen: der Tower von London (weiß gekalkt) oder grau wie der Gravensteen
function drawGreatKeep(c, b) {
  const col = b.grey ? '#a6a092' : '#e9e4d6';
  const wx = 2.0, wy = 1.7, h = 64, tw = 0.44, th = h + 16;
  const x0 = b.x - wx / 2, x1 = b.x + wx / 2, y0 = b.y - wy / 2, y1 = b.y + wy / 2;
  // Ringmauer mit Tor im Süden
  drawShadow(c, b.x, b.y, wx + 1.6, wy + 1.6, h, 0.2);
  const turret = (x, y) => { drawBox(c, x, y, tw, tw, th, col, 0, 'stone'); drawMerlons(c, x, y, tw, tw, th, col, 0.12); };
  turret(x0 + tw / 2, y0 + tw / 2);
  drawBox(c, b.x, b.y, wx, wy, h, col, 0, 'stone');
  for (const f of ['L', 'R']) {
    for (const u of [0.33, 0.66]) faceQuad(c, b.x, b.y, wx, wy, f, u - 0.02, u + 0.02, 0, h, shade(col, 0.86));
    for (const z of [0.3, 0.55, 0.78]) for (const u of [0.16, 0.5, 0.83]) faceQuad(c, b.x, b.y, wx, wy, f, u - 0.03, u + 0.03, h * z, h * z + 7, GLASS());
  }
  drawMerlons(c, b.x, b.y, wx, wy, h, col);
  turret(x1 - tw / 2, y0 + tw / 2);
  turret(x0 + tw / 2, y1 - tw / 2);
  turret(x1 - tw / 2, y1 - tw / 2);
  // Holztreppe zum Eingang im ersten Stock
  drawBox(c, b.x - 0.3, y1 + 0.25, 0.7, 0.4, 16, '#7a5636', 0, 'plank');
  faceQuad(c, b.x, b.y, wx, wy, 'L', 0.36, 0.46, 16, 28, '#3a2a1c');
  banner(c, x1 - tw / 2, y0 + tw / 2, th, b.grey ? '#2c2c2c' : '#a33b32');
  if (darkness() > 0.2) addLight(b.x, y1, 30, 40, 0.7);
}

// Burghügel (Motte) mit Holzturm oder steinernem Ringturm
function drawMotte(c, b) {
  const mh = 26, R = 1.45;
  const g = P(b.x, b.y, 0), t = P(b.x, b.y, mh);
  const RX = R * 45, RY = R * 22.6, rx = R * 0.5 * 45, ry = R * 0.5 * 22.6;
  const grass = lookSeason() === 3 ? '#dfe5e4' : lookSeason() >= 2 ? '#8f8a48' : '#6f9b45';
  c.fillStyle = 'rgba(40,50,30,0.25)'; c.beginPath(); c.ellipse(g[0] + 6, g[1] + 2, RX + 8, RY + 4, 0, 0, Math.PI * 2); c.fill();
  const grad = c.createLinearGradient(g[0] - RX, 0, g[0] + RX, 0);
  grad.addColorStop(0, shade(grass, 1.12)); grad.addColorStop(1, shade(grass, 0.72));
  c.fillStyle = grad;
  c.beginPath(); c.moveTo(g[0] - RX, g[1]); c.lineTo(t[0] - rx, t[1]); c.ellipse(t[0], t[1], rx, ry, 0, Math.PI, 0, false); c.lineTo(g[0] + RX, g[1]); c.ellipse(g[0], g[1], RX, RY, 0, 0, Math.PI, false); c.closePath(); c.fill();
  c.fillStyle = shade(grass, 1.05); c.beginPath(); c.ellipse(t[0], t[1], rx, ry, 0, 0, Math.PI * 2); c.fill();
  // Treppe den Hang hinauf
  c.strokeStyle = '#7a5636'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(g[0] - RX * 0.2, g[1] + RY * 0.9); c.lineTo(t[0] - rx * 0.1, t[1] + ry * 0.8); c.stroke();
  baseZ += mh;
  if (b.wooden) {
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; const p = P(b.x + Math.cos(a) * 0.62, b.y + Math.sin(a) * 0.62); if (Math.sin(a) < 0) { c.strokeStyle = '#6e5236'; c.lineWidth = 2; c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0], p[1] - 9); c.stroke(); } }
    drawBox(c, b.x, b.y, 0.75, 0.75, 24, WALLS.wood, 0, 'plank');
    drawPyramid(c, b.x, b.y, 0.85, 0.85, 24, 12, ROOFS.wood);
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; const p = P(b.x + Math.cos(a) * 0.62, b.y + Math.sin(a) * 0.62); if (Math.sin(a) >= 0) { c.strokeStyle = '#6e5236'; c.lineWidth = 2; c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0], p[1] - 9); c.stroke(); } }
  } else {
    drawBox(c, b.x, b.y, 1.0, 1.0, 20, '#aaa395', 0, 'stone');
    drawMerlons(c, b.x, b.y, 1.0, 1.0, 20, '#aaa395');
  }
  banner(c, b.x + 0.25, b.y - 0.25, b.wooden ? 36 : 22, '#a33b32');
  baseZ -= mh;
}

// Runder Donjon im Bau (der neue Louvre König Philipps)
function drawRoundKeep(c, b) {
  const g = P(b.x, b.y, 0), R = 0.75, RX = R * 45, RY = R * 22.6;
  const H = b.scaffold ? 44 : 64;
  // niedrige, halb fertige Ringmauer
  for (const [dx, dy, wx, wy] of [[0, -1.15, 2.3, 0.3], [-1.15, 0, 0.3, 2.3]]) drawBox(c, b.x + dx, b.y + dy, wx, wy, 10, '#b4ad9e', 0, 'stone');
  c.fillStyle = 'rgba(30,40,20,0.25)'; c.beginPath(); c.ellipse(g[0] + 8, g[1] + 2, RX + 10, RY + 4, 0, 0, Math.PI * 2); c.fill();
  const grad = c.createLinearGradient(g[0] - RX, 0, g[0] + RX, 0);
  grad.addColorStop(0, '#d8d1c0'); grad.addColorStop(0.55, '#bdb5a3'); grad.addColorStop(1, '#8f887a');
  c.fillStyle = grad;
  c.beginPath(); c.moveTo(g[0] - RX, g[1]); c.lineTo(g[0] - RX, g[1] - H); c.ellipse(g[0], g[1] - H, RX, RY, 0, Math.PI, 0, false); c.lineTo(g[0] + RX, g[1]); c.ellipse(g[0], g[1], RX, RY, 0, 0, Math.PI, false); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(60,50,40,0.35)'; c.lineWidth = 1;
  for (let z = 8; z < H; z += 8) { c.beginPath(); c.ellipse(g[0], g[1] - z, RX, RY, 0, 0, Math.PI, false); c.stroke(); }
  c.fillStyle = '#9a9384'; c.beginPath(); c.ellipse(g[0], g[1] - H, RX, RY, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#6e685e'; c.beginPath(); c.ellipse(g[0], g[1] - H, RX * 0.7, RY * 0.7, 0, 0, Math.PI * 2); c.fill();
  for (const z of [0.35, 0.65]) { c.fillStyle = GLASS(); c.fillRect(g[0] - RX * 0.45, g[1] - H * z - 4, 3, 7); c.fillRect(g[0] + RX * 0.3, g[1] - H * z - 4, 3, 7); }
  if (b.scaffold) {
    drawScaffold(c, b.x, b.y, 1.7, 1.7, H + 12);
    drawCrane(c, b.x + 1.1, b.y + 0.9, 2);
    drawStones(c, b.x - 1.0, b.y + 1.2, 7);
  }
}

// Tuch- und Messehalle mit Arkaden, in Brügge mit Belfried
function drawClothHall(c, b) {
  const col = '#cdbfa2', wx = 3.2, wy = 1.3, h = 22;
  drawShadow(c, b.x, b.y, wx, wy, h + 16);
  if (b.belfry) {
    const bx = b.x - wx / 2 + 0.45;
    drawBox(c, bx, b.y, 0.85, 0.85, 64, col, 0, 'stone');
    drawBox(c, bx, b.y, 0.6, 0.6, 18, '#d6c9ad', 64, 'stone');
    faceQuad(c, bx, b.y, 0.6, 0.6, 'L', 0.3, 0.7, 68, 78, '#3a3430');
    drawPyramid(c, bx, b.y, 0.6, 0.6, 82, 22, ROOFS.slate);
  }
  drawBox(c, b.x, b.y, wx, wy, h, col, 0, 'stone');
  const n = 7;
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    faceQuad(c, b.x, b.y, wx, wy, 'L', u - 0.04, u + 0.04, 0, h * 0.42, '#3f362e');
    faceQuad(c, b.x, b.y, wx, wy, 'L', u - 0.02, u + 0.02, h * 0.58, h * 0.82, GLASS());
  }
  faceQuad(c, b.x, b.y, wx, wy, 'R', 0.3, 0.7, 0, h * 0.42, '#3f362e');
  drawGableRoof(c, b.x, b.y, wx, wy, h, 18, ROOFS.tile, col, true);
  for (let k = 0; k < 3; k++) drawStall(c, { x: b.x - 1 + k, y: b.y + wy / 2 + 0.55, color: ['#a33b32', '#3d6fa3', '#d6ad4c'][k] });
}

// Glastonbury Tor: kegelförmiger Hügel mit Terrassen und Kapelle
function drawTor(c, b) {
  const mh = 70, R = 2.5;
  const g = P(b.x, b.y, 0), t = P(b.x, b.y, mh);
  const RX = R * 45, RY = R * 22.6;
  const grass = lookSeason() === 3 ? '#dfe5e4' : lookSeason() >= 2 ? '#8f8a48' : '#6f9b45';
  const grad = c.createLinearGradient(g[0] - RX, 0, g[0] + RX, 0);
  grad.addColorStop(0, shade(grass, 1.15)); grad.addColorStop(1, shade(grass, 0.68));
  c.fillStyle = grad;
  c.beginPath(); c.moveTo(g[0] - RX, g[1]); c.quadraticCurveTo(g[0] - RX * 0.3, t[1] + 6, t[0] - 8, t[1]); c.lineTo(t[0] + 8, t[1]); c.quadraticCurveTo(g[0] + RX * 0.3, t[1] + 6, g[0] + RX, g[1]); c.ellipse(g[0], g[1], RX, RY, 0, 0, Math.PI, false); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(70,90,40,0.45)'; c.lineWidth = 1.5;
  for (let k = 1; k < 5; k++) { const f = k / 5; c.beginPath(); c.ellipse(g[0], g[1] - mh * f * 0.95, RX * (1 - f * 0.88), RY * (1 - f * 0.88), 0, 0.1, Math.PI - 0.1, false); c.stroke(); }
  baseZ += mh;
  drawBox(c, b.x, b.y, 0.5, 0.35, 10, '#a8a090', 0, 'stone');
  drawGableRoof(c, b.x, b.y, 0.5, 0.35, 10, 6, ROOFS.slate, '#a8a090', true);
  drawBox(c, b.x - 0.3, b.y, 0.3, 0.3, 22, '#a8a090', 0, 'stone');
  drawPyramid(c, b.x - 0.3, b.y, 0.3, 0.3, 22, 7, ROOFS.slate);
  baseZ -= mh;
}

function drawLandmark(c, b) {
  switch (b.lm) {
    case 'kathedrale': return drawCathedral(c, b);
    case 'tower': return drawGreatKeep(c, b);
    case 'motte': return drawMotte(c, b);
    case 'rundturm': return drawRoundKeep(c, b);
    case 'tuchhalle': return drawClothHall(c, b);
    case 'tor': return drawTor(c, b);
    default: return null;
  }
}

// Stonehenge: Ring aus Sarsensteinen mit Decksteinen, innen das Hufeisen der Trilithen
function drawStonehenge(c, b) {
  const col = '#9d988c', items = [];
  const ring = 26, R = 1.25;
  for (let k = 0; k < ring; k++) {
    if (k === 7 || k === 19) continue;
    const a = (k / ring) * Math.PI * 2;
    items.push({ x: b.x + Math.cos(a) * R, y: b.y + Math.sin(a) * R * 1.0, h: 16, a, kind: 'stein', k });
  }
  for (let k = 0; k < 5; k++) {
    const a = Math.PI * 0.25 + (k - 2) * 0.62;
    items.push({ x: b.x + Math.cos(a) * 0.55, y: b.y + Math.sin(a) * 0.55, h: 21 + (k === 2 ? 4 : 0), a, kind: 'tri' });
  }
  items.push({ x: b.x - 0.9, y: b.y + 1.9, h: 4, kind: 'liegend' }, { x: b.x + 1.7, y: b.y + 0.6, h: 4, kind: 'liegend' });
  items.sort((p, q) => p.x + p.y - (q.x + q.y));
  drawShadow(c, b.x, b.y, 2.7, 2.7, 10, 0.12);
  for (const it of items) {
    if (it.kind === 'liegend') { drawBox(c, it.x, it.y, 0.55, 0.22, it.h, '#958f84', 0, 'stone'); continue; }
    drawBox(c, it.x, it.y, 0.17, 0.17, it.h, col, 0, 'stone');
    if (it.kind === 'tri') drawBox(c, it.x, it.y, 0.26, 0.26, 4, '#a7a296', it.h);
    else if (it.k % 2 === 0 && it.k < ring - 1) {
      const a2 = ((it.k + 1) / ring) * Math.PI * 2;
      const p = P(it.x, it.y, it.h + 2), q = P(b.x + Math.cos(a2) * R, b.y + Math.sin(a2) * R, it.h + 2);
      c.strokeStyle = shade(col, 1.05); c.lineWidth = 4; c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); c.stroke();
      c.strokeStyle = shade(col, 0.7); c.lineWidth = 1; c.beginPath(); c.moveTo(p[0], p[1] + 2); c.lineTo(q[0], q[1] + 2); c.stroke();
    }
  }
}

// Ein Stück verfallener Römermauer
function drawWallRuin(c, o) {
  const along = Math.abs(Math.cos(o.dir)) >= Math.abs(Math.sin(o.dir));
  // Gemalte Reste: Mauerstümpfe mit Efeu oder mit zerbrochenem Bogen, ab und zu ein Turmstumpf
  if (o.tower ? p5(c, 'burg_ruine_turm', o.x, o.y, 0.85) : p5(c, `burg_ruine_mauer_${(Math.floor(o.x * 3 + o.y * 7) & 1) + 1}${along ? '' : '_y'}`, o.x, o.y, 0.95)) return;
  const col = '#9e978a';
  if (o.tower) drawBox(c, o.x, o.y, 0.62, 0.62, o.h + 8, '#969083', 0, 'stone');
  drawBox(c, o.x, o.y, along ? 0.95 : 0.34, along ? 0.34 : 0.95, o.h, col, 0, 'stone');
  const [px, py] = P(o.x, o.y, o.h);
  c.fillStyle = shade(col, 0.8);
  c.fillRect(px - 3, py - 2, 3, 2); c.fillRect(px + 4, py - 1, 2, 1);
  if (lookSeason() !== 3) { c.fillStyle = 'rgba(90,120,50,0.6)'; c.fillRect(px - 6, py + 1, 5, 2); }
}

function drawLonghall(c, b) {
  drawShadow(c, b.x, b.y, b.wx, b.wy, b.h + 18);
  // Gemaltes sächsisches Langhaus: Rotherwood mit seinem Schild über der Tür, die anderen Hallen in der Gegenansicht
  // (gespiegelt, damit der First längs liegt); sonst die Holzhalle aus Paket 5
  const rw = b.site === 'rotherwood', lh = rw ? 'langhaus_rotherwood' : 'langhaus';
  if (p5(c, bauId(lh), b.x, b.y, b.wx / 3.3, !rw) || p5(c, 'burg_holzhalle', b.x, b.y, Math.min(b.wx / 2.3, b.wy / 1.05))) {
    if (darkness() > 0.2) addLight(b.x, b.y + b.wy / 2, 6, 40, 1);
    return;
  }
  drawBox(c, b.x, b.y, b.wx, b.wy, b.h, WALLS.wood, 0, 'plank');
  faceQuad(c, b.x, b.y, b.wx, b.wy, 'L', 0.42, 0.58, 0, 14, '#6a4c34');
  faceQuad(c, b.x, b.y, b.wx, b.wy, 'L', 0.45, 0.55, 0, 13, '#2e2016');
  c.fillStyle = '#c9a050';
  for (const u of [0.15, 0.3, 0.7, 0.85]) { const p = facePoint(b.x, b.y, b.wx, b.wy, 'L', u, b.h * 0.6); c.beginPath(); c.arc(p[0], p[1], 1.6, 0, Math.PI * 2); c.fill(); }
  drawGableRoof(c, b.x, b.y, b.wx, b.wy, b.h, 22, ROOFS.thatch, WALLS.wood, true);
  const [ex, ey] = P(b.x + b.wx / 2 + 0.1, b.y, b.h + 22);
  c.strokeStyle = '#4a3322'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(ex - 5, ey - 7); c.lineTo(ex, ey); c.lineTo(ex + 5, ey - 7); c.stroke();
  if (darkness() > 0.2) addLight(b.x, b.y + b.wy / 2, 6, 40, 1);
}

function drawTent(c, b) {
  const col = b.color || '#d8ccb0';
  drawShadow(c, b.x, b.y, b.wx, b.wy, 16, 0.16);
  drawGableRoof(c, b.x, b.y, b.wx, b.wy * 0.9, 0, 20, col, col, true, false);
  const s = [P(b.x - b.wx / 2 - 0.1, b.y + b.wy * 0.45 + 0.1, 0), P(b.x + b.wx / 2 + 0.1, b.y + b.wy * 0.45 + 0.1, 0), P(b.x + b.wx / 2 + 0.1, b.y, 20), P(b.x - b.wx / 2 - 0.1, b.y, 20)];
  c.strokeStyle = shade(col, 0.7); c.lineWidth = 1;
  c.beginPath();
  for (const f of [0.33, 0.66]) { const a = lerp2(s[0], s[1], f), d = lerp2(s[3], s[2], f); c.moveTo(a[0], a[1]); c.lineTo(d[0], d[1]); }
  c.stroke();
  const [px, py] = P(b.x + b.wx / 2 + 0.1, b.y, 20);
  c.strokeStyle = '#4a3322'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 7); c.stroke();
  c.fillStyle = col === '#d8ccb0' ? '#9a3326' : shade(col, 1.2);
  c.beginPath(); c.moveTo(px, py - 7); c.lineTo(px + 6, py - 5.5); c.lineTo(px, py - 4); c.fill();
}

// Kogge am Liegeplatz: Rumpf längs zur Küste, Rahsegel mit Streifen, Wimpel im Wind
function drawShip(c, b) {
  const th = (b.dir || 0) + Math.PI / 2;
  const ux = Math.cos(th), uy = Math.sin(th), vx = -uy, vy = ux;
  const bob = Math.sin(G.time * 1.3 + b.x) * 1.2;
  const at = (a, w, z) => P(b.x + ux * a + vx * w, b.y + uy * a + vy * w, z + bob);
  // Wellen am Rumpf
  c.fillStyle = 'rgba(235,245,250,0.35)';
  c.beginPath(); const fw = at(1.1, 0, -1); c.ellipse(fw[0], fw[1], 9, 3, 0, 0, Math.PI * 2); c.fill();
  const outline = (z, k) => [at(1.15 * k, 0, z), at(0.7 * k, 0.36 * k, z), at(-0.75 * k, 0.36 * k, z), at(-1.0 * k, 0.2 * k, z), at(-1.0 * k, -0.2 * k, z), at(-0.75 * k, -0.36 * k, z), at(0.7 * k, -0.36 * k, z)];
  const low = outline(0, 0.82), deck = outline(9, 1);
  // Bordwand: zwischen Wasserlinie und Deck
  const side = [];
  for (const p of low) side.push(p);
  for (const p of deck) side.push(p);
  poly(c, hull(side), '#4e3423');
  c.strokeStyle = 'rgba(30,18,10,0.5)'; c.lineWidth = 1;
  c.beginPath(); for (let k = 0; k < low.length; k++) { const m = lerp2(low[k], deck[k], 0.5); if (k) c.lineTo(m[0], m[1]); else c.moveTo(m[0], m[1]); } c.closePath(); c.stroke();
  poly(c, deck, '#8a6440');
  // Achter- und Vorderkastell
  const castle = (a) => { const q = [at(a - 0.22, -0.3, 9), at(a + 0.22, -0.3, 9), at(a + 0.22, 0.3, 9), at(a - 0.22, 0.3, 9)]; const top = q.map((p) => [p[0], p[1] - 6]); poly(c, hull(q.concat(top)), '#6b4a2e'); poly(c, top, '#9a7350'); };
  castle(-0.72); castle(0.8);
  // Mast, Rah und Segel
  const foot = at(0.05, 0, 9), head = at(0.05, 0, 46);
  c.strokeStyle = '#3a2618'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(foot[0], foot[1]); c.lineTo(head[0], head[1]); c.stroke();
  const bl = Math.sin(G.time * 0.9 + b.y) * 1.5;
  const top = head[1] + 7, bot = head[1] + 30, half = 15;
  c.beginPath();
  c.moveTo(head[0] - half, top);
  c.lineTo(head[0] + half, top);
  c.quadraticCurveTo(head[0] + half + 3 + bl, (top + bot) / 2, head[0] + half - 1, bot);
  c.quadraticCurveTo(head[0], bot + 4 + bl, head[0] - half + 1, bot);
  c.quadraticCurveTo(head[0] - half - 3 + bl, (top + bot) / 2, head[0] - half, top);
  c.closePath();
  c.fillStyle = '#ece2c8'; c.fill();
  c.save(); c.clip();
  c.fillStyle = '#a8382c';
  for (let k = -half + 4; k < half; k += 10) c.fillRect(head[0] + k, top, 5, bot - top + 6);
  c.restore();
  c.strokeStyle = 'rgba(60,40,25,0.55)'; c.lineWidth = 1; c.stroke();
  c.strokeStyle = '#3a2618'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(head[0] - half - 2, top); c.lineTo(head[0] + half + 2, top); c.stroke();
  // Wimpel
  const t = G.time * 3 + b.x;
  c.fillStyle = '#d8b54a';
  c.beginPath(); c.moveTo(head[0], head[1]); c.lineTo(head[0] + 11, head[1] + 2 + Math.sin(t) * 1.5); c.lineTo(head[0], head[1] + 4); c.fill();
}

function drawStall(c, b) {
  const x0 = b.x - 0.4, x1 = b.x + 0.4, y0 = b.y - 0.3, y1 = b.y + 0.3;
  c.strokeStyle = '#5a4030'; c.lineWidth = 1.5;
  for (const [x, y] of [[x0, y1], [x1, y1], [x1, y0]]) { const [a, bb] = P(x, y, 0); c.beginPath(); c.moveTo(a, bb); c.lineTo(a, bb - 16); c.stroke(); }
  drawBox(c, b.x, b.y, 0.8, 0.5, 7, '#8a6a45', 0, 'plank');
  const goods = ['#d9b04a', '#c9483a', '#6f9b45', '#e8e0cc'];
  if (!abandonedId(b.site)) for (let k = 0; k < 4; k++) { const p = P(b.x - 0.28 + k * 0.18, b.y + 0.05, 7); c.fillStyle = goods[k]; c.beginPath(); c.arc(p[0], p[1] - 1.5, 1.8, 0, Math.PI * 2); c.fill(); }
  const col = winterize(b.color);
  poly(c, [P(x0, y0, 20), P(x1, y0, 20), P(x1, y1 + 0.1, 14), P(x0, y1 + 0.1, 14)], col);
  for (let k = 0; k < 4; k += 2) poly(c, [P(x0 + (k / 4) * 0.8, y0, 20), P(x0 + ((k + 1) / 4) * 0.8, y0, 20), P(x0 + ((k + 1) / 4) * 0.8, y1 + 0.1, 14), P(x0 + (k / 4) * 0.8, y1 + 0.1, 14)], 'rgba(255,255,255,0.35)');
  poly(c, [P(x0, y1 + 0.1, 14), P(x1, y1 + 0.1, 14), P(x1, y1 + 0.1, 11), P(x0, y1 + 0.1, 11)], shade(b.color, 0.8));
}

function drawWell(c, b) {
  drawBox(c, b.x, b.y, 0.6, 0.6, 7, '#8f897c', 0, 'stone');
  poly(c, [P(b.x - 0.22, b.y - 0.22, 7), P(b.x + 0.22, b.y - 0.22, 7), P(b.x + 0.22, b.y + 0.22, 7), P(b.x - 0.22, b.y + 0.22, 7)], '#2f4a5a');
  c.strokeStyle = '#5a4030'; c.lineWidth = 1.5;
  const [a1, b1] = P(b.x - 0.25, b.y + 0.25, 7), [a2, b2] = P(b.x + 0.25, b.y - 0.25, 7);
  c.beginPath(); c.moveTo(a1, b1); c.lineTo(a1, b1 - 13); c.moveTo(a2, b2); c.lineTo(a2, b2 - 13); c.stroke();
  drawGableRoof(c, b.x, b.y, 0.7, 0.7, 19, 5, ROOFS.wood, '#6e5236', true, false);
}

function drawFire(c, b) {
  const [x, y] = P(b.x, b.y, 0);
  c.fillStyle = '#6d665c';
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; c.beginPath(); c.ellipse(x + Math.cos(a) * 8, y + Math.sin(a) * 4, 2.2, 1.6, 0, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#4a3322';
  c.fillRect(x - 7, y - 2, 14, 3);
  const f = 1 + Math.sin(G.time * 13 + b.x) * 0.15;
  c.fillStyle = '#e8762a';
  c.beginPath(); c.moveTo(x - 5, y); c.quadraticCurveTo(x, y - 16 * f, x + 5, y); c.fill();
  c.fillStyle = '#ffd25a';
  c.beginPath(); c.moveTo(x - 2.5, y); c.quadraticCurveTo(x, y - 9 * f, x + 2.5, y); c.fill();
  if (b.camp) addLight(b.x, b.y, 6, 34, 0.85); else addLight(b.x, b.y, 6, 60, 1.3);
  b.smoke = [x, y - 14];
}

function drawFence(c, b) {
  c.strokeStyle = '#6e5236'; c.lineWidth = 1.6;
  const n = Math.round((b.x2 - b.x1) / 0.5);
  for (let k = 0; k <= n; k++) {
    const [x, y] = P(b.x1 + k * 0.5, b.y, 0);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 9); c.stroke();
  }
  const [a, bb] = P(b.x1, b.y, 7), [d, e] = P(b.x2, b.y, 7);
  c.beginPath(); c.moveTo(a, bb); c.lineTo(d, e); c.moveTo(a, bb + 4); c.lineTo(d, e + 4); c.stroke();
}

function drawLogs(c, x, y, n) {
  for (let k = 0; k < n; k++) {
    const yy = y + (k % 3) * 0.22, z = Math.floor(k / 3) * 5;
    drawBox(c, x, yy, 1.0, 0.18, 4, '#7a5636', z);
    const [ex, ey] = P(x + 0.5, yy, z + 2);
    c.fillStyle = '#c9a274'; c.beginPath(); c.ellipse(ex, ey, 2, 2.4, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#8a6a44'; c.lineWidth = 0.6; c.beginPath(); c.ellipse(ex, ey, 1, 1.2, 0, 0, Math.PI * 2); c.stroke();
  }
}

function drawStones(c, x, y, n) {
  for (let k = 0; k < n; k++) {
    const ox = (k % 3) * 0.3 - 0.3, oy = (Math.floor(k / 3) % 2) * 0.3 - 0.15, z = Math.floor(k / 6) * 6;
    drawBox(c, x + ox, y + oy, 0.26, 0.26, 6, '#a29d90', z);
  }
}

function drawProp(c, b) {
  const [x, y] = P(b.x, b.y, 0);
  const winter = lookSeason() === 3;
  c.fillStyle = 'rgba(25,35,15,0.2)';
  c.beginPath(); c.ellipse(x + 3, y, 8, 3.5, 0, 0, Math.PI * 2); c.fill();
  switch (b.prop) {
    case 'sitzstamm': {
      drawBox(c, b.x, b.y, 0.75, 0.2, 3.5, '#6e5034');
      const [ex, ey] = P(b.x + 0.37, b.y, 1.8);
      c.fillStyle = '#c9a274'; c.beginPath(); c.ellipse(ex, ey, 1.6, 2, 0, 0, Math.PI * 2); c.fill();
      if (winter) { const [sx, sy] = P(b.x, b.y, 3.6); c.fillStyle = '#eef2f2'; c.fillRect(sx - 8, sy - 1, 14, 1.5); }
      break;
    }
    case 'meiler': {
      // Kohlenmeiler: mit Erde bedeckter Holzhaufen, der leise qualmt
      const [mx, my] = P(b.x, b.y, 0);
      c.fillStyle = '#4a3a2a'; c.beginPath(); c.ellipse(mx, my - 4, 18, 9, 0, Math.PI, 0); c.fill();
      c.fillStyle = '#5e4a34'; c.beginPath(); c.ellipse(mx, my - 4, 18, 13, 0, Math.PI, 0); c.fill();
      c.fillStyle = '#3a2e22'; for (let k = 0; k < 5; k++) c.fillRect(mx - 12 + k * 5, my - 9 - (k % 2) * 4, 3, 2);
      if (Math.random() < 0.08) smokeEmit(mx + 2, my - 16, 0.6);
      break;
    }
    case 'wildbret': {
      // Erlegter Hirsch am Dreibein
      c.strokeStyle = '#5a3d26'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x, y - 18); c.lineTo(x + 6, y); c.moveTo(x, y - 18); c.lineTo(x + 2, y + 2); c.stroke();
      c.fillStyle = '#8a5a34'; c.beginPath(); c.ellipse(x, y - 10, 3, 6.5, 0, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'erzhaufen': {
      const col = { eisen: '#8a4a32', blei: '#6f7580', zinn: '#9aa0a6', silber: '#b4b8c0' }[b.ore] || '#8a4a32';
      for (let k = 0; k < 14; k++) {
        const ox = ((k * 37) % 17) - 8, oy = ((k * 13) % 7) - 3, h = 3 + (k % 4);
        c.fillStyle = k % 3 ? col : shade(col, 0.75);
        c.beginPath(); c.ellipse(x + ox, y + oy - h * (k < 5 ? 1.4 : 0.6), 3, 2.2, 0, 0, Math.PI * 2); c.fill();
      }
      if (b.ore === 'silber' && Math.sin(G.time * 3 + b.x) > 0.9) { c.fillStyle = '#ffffff'; c.fillRect(x - 2, y - 9, 2, 2); }
      break;
    }
    case 'fass': {
      for (let k = 0; k < (b.v > 0.5 ? 2 : 1); k++) {
        const bx = x - k * 7, by = y - k * 2;
        c.fillStyle = '#7a5232'; c.fillRect(bx - 3.5, by - 9, 7, 9);
        c.fillStyle = '#5a3d26'; c.fillRect(bx - 3.5, by - 7, 7, 1); c.fillRect(bx - 3.5, by - 3, 7, 1);
        c.fillStyle = winter ? '#eef2f2' : '#9a7048'; c.beginPath(); c.ellipse(bx, by - 9, 3.5, 1.4, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = OUTLINE; c.lineWidth = 0.7; c.strokeRect(bx - 3.5, by - 9, 7, 9);
      }
      break;
    }
    case 'heu': {
      c.fillStyle = winter ? '#e9ece6' : '#d8b452';
      c.beginPath(); c.ellipse(x, y - 5, 8, 7, 0, Math.PI, 0); c.lineTo(x + 8, y); c.lineTo(x - 8, y); c.fill();
      c.strokeStyle = winter ? '#c8ccc6' : '#a8852e'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(x - 6, y - 4); c.lineTo(x - 2, y - 10); c.moveTo(x, y - 2); c.lineTo(x + 3, y - 10); c.moveTo(x + 5, y - 2); c.lineTo(x + 6, y - 7); c.stroke();
      break;
    }
    case 'holzstapel': {
      const im = ART.holzstapel;
      if (im) { const k = TREE_K * (0.8 + b.v * 0.3); c.drawImage(im, x - im.width * k / 2, y - im.height * k * 0.86, im.width * k, im.height * k); }
      else drawLogs(c, b.x, b.y - 0.2, 3 + Math.floor(b.v * 3));
      break;
    }
    case 'karren': {
      drawBox(c, b.x, b.y, 0.6, 0.34, 5, '#8a6440', 4, 'plank');
      const w1 = P(b.x - 0.05, b.y + 0.2, 4), w2 = P(b.x + 0.32, b.y - 0.05, 4);
      c.fillStyle = '#4a3322';
      c.beginPath(); c.ellipse(w1[0], w1[1], 3, 4, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(w2[0], w2[1], 2.5, 3.6, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#6a4c34'; c.lineWidth = 1.4;
      const a = P(b.x - 0.3, b.y + 0.05, 6), d = P(b.x - 0.75, b.y + 0.25, 3);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(d[0], d[1]); c.stroke();
      if (!winter) { const l = P(b.x, b.y, 11); c.fillStyle = '#d8b452'; c.beginPath(); c.ellipse(l[0], l[1], 6, 3, 0, 0, Math.PI * 2); c.fill(); }
      break;
    }
    case 'amboss': {
      drawAnvil(c, b.x, b.y, true);
      drawBox(c, b.x - 0.35, b.y - 0.2, 0.3, 0.3, 9, '#5a4a3a', 0, 'stone');
      break;
    }
    case 'beet': {
      // Gemalte Beete (Gemüse oder Blumen) von Frühling bis Herbst, im Winter das kahle gezeichnete Beet
      const im = seasonIndex() < 3 ? ART[['beet', 'beet_2', 'beet_blumen', 'beet_blumen_2'][Math.floor(b.v * 4) % 4]] : null;
      if (im) { const k = TREE_K * 0.95; c.drawImage(im, x - im.width * k / 2, y - im.height * k * 0.7, im.width * k, im.height * k); break; }
      poly(c, [P(b.x - 0.3, b.y - 0.25), P(b.x + 0.3, b.y - 0.25), P(b.x + 0.3, b.y + 0.25), P(b.x - 0.3, b.y + 0.25)], winter ? '#e2e6e4' : '#6b4a2e');
      if (seasonIndex() < 3) {
        const cols = seasonIndex() === 2 ? ['#c97a2a', '#7a8a3a'] : ['#5f9a3a', '#e05a4e', '#f2d65a', '#5f9a3a'];
        for (let k = 0; k < 8; k++) { const p = P(b.x - 0.22 + (k % 4) * 0.15, b.y - 0.12 + Math.floor(k / 4) * 0.24); c.fillStyle = cols[k % cols.length]; c.fillRect(p[0] - 1.2, p[1] - 3, 2.4, 2.6); }
      }
      break;
    }
    default: break;
  }
}

function drawScaffold(c, x, y, wx, wy, h) {
  c.strokeStyle = '#8a6a40'; c.lineWidth = 1.4;
  const corners = [[x - wx / 2, y + wy / 2], [x + wx / 2, y + wy / 2], [x + wx / 2, y - wy / 2]];
  for (const [cx, cy] of corners) { const [a, b] = P(cx, cy, 0); c.beginPath(); c.moveTo(a, b); c.lineTo(a, b - h); c.stroke(); }
  for (const z of [h * 0.4, h * 0.8]) {
    const [a, b] = P(corners[0][0], corners[0][1], z), [d, e] = P(corners[1][0], corners[1][1], z), [f, g] = P(corners[2][0], corners[2][1], z);
    c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.lineTo(f, g); c.stroke();
  }
  drawStones(c, x - wx / 2 - 0.4, y + 0.2, 4);
}

// ---------------------------------------------------------------- Burgen
// ---------------------------------------------------------------- Gemalte Burgteile (Paket 5)
// Je Bild der Fußpunkt (x, y in 1×-Bildpunkten) und die Größe eines Bildpunkts in Weltpunkten. Mauern und Palisaden
// sind genau ein Feld lang (x: links oben nach rechts unten, y: rechts oben nach links unten), der Fußpunkt liegt auf
// der Mauerlinie in der Mitte. Türme stehen auf der Mitte ihres Sockels, Bergfried und Hallen auf ihrer Grundfläche.
const P5 = {'burg_palisade_x':[33.88,54.0,0.25],'burg_palisade_x_schaden_1':[33.88,54.0,0.25],'burg_palisade_x_schaden_2':[33.88,54.0,0.25],'burg_palisade_x_schaden_3':[33.88,54.0,0.25],'burg_palisade_x_schaden_4':[33.88,54.0,0.25],'burg_palisade_y':[33.88,54.5,0.25],'burg_palisade_y_schaden_1':[33.88,54.5,0.25],'burg_palisade_y_schaden_2':[33.88,54.5,0.25],'burg_palisade_y_schaden_3':[33.88,54.5,0.25],'burg_palisade_y_schaden_4':[33.88,54.5,0.25],'burg_stein_mauer_x':[33.88,70.5,0.25],'burg_stein_mauer_x_schaden_1':[33.88,70.5,0.25],'burg_stein_mauer_x_schaden_2':[33.88,70.5,0.25],'burg_stein_mauer_x_schaden_3':[33.88,70.5,0.25],'burg_stein_mauer_x_schaden_4':[33.88,70.5,0.25],'burg_stein_mauer_y':[33.88,68.5,0.25],'burg_stein_mauer_y_schaden_1':[33.88,68.5,0.25],'burg_stein_mauer_y_schaden_2':[33.88,68.5,0.25],'burg_stein_mauer_y_schaden_3':[33.88,68.5,0.25],'burg_stein_mauer_y_schaden_4':[33.88,68.5,0.25],'burg_bergfried':[69.88,167.0,0.25],'burg_bergfried_gross':[84.88,197.25,0.25],'burg_holzhalle':[70.5,80.25,0.25],'burg_holztor':[35.5,84.0,0.25],'burg_holztor_schaden_1':[35.5,84.0,0.25],'burg_holztor_schaden_2':[35.5,84.0,0.25],'burg_holztor_schaden_3':[35.5,84.0,0.25],'burg_holztor_schaden_4':[35.5,84.0,0.25],'burg_holztor_zu':[35.5,84.0,0.25],'burg_holzturm':[32.0,97.75,0.25],'burg_holzturm_schaden_1':[32.0,97.75,0.25],'burg_holzturm_schaden_2':[32.0,97.75,0.25],'burg_holzturm_schaden_3':[32.0,97.75,0.25],'burg_holzturm_schaden_4':[32.0,97.75,0.25],'burg_palas':[78.0,99.25,0.25],'burg_stein_tor':[39.38,88.75,0.25],'burg_stein_tor_schaden_1':[39.38,88.75,0.25],'burg_stein_tor_schaden_2':[39.38,88.75,0.25],'burg_stein_tor_schaden_3':[39.38,88.75,0.25],'burg_stein_tor_schaden_4':[39.38,88.75,0.25],'burg_stein_tor_zu':[39.38,88.75,0.25],'burg_stein_turm':[35.75,104.88,0.25],'burg_stein_turm_schaden_1':[35.75,104.88,0.25],'burg_stein_turm_schaden_2':[35.75,104.88,0.25],'burg_stein_turm_schaden_3':[35.75,104.88,0.25],'burg_stein_turm_schaden_4':[35.75,104.88,0.25],'burg_ruine_mauer_1':[33.88,34.25,0.25],'burg_ruine_mauer_1_y':[33.88,33.75,0.25],'burg_ruine_mauer_2':[33.75,21.75,0.25],'burg_ruine_mauer_2_y':[34.0,24.0,0.25],'burg_ruine_turm':[37.5,66.88,0.25],'burg_schutt':[27.88,22.75,0.25],'feld_brach_x':[34.0,35.75,0.25],'feld_hoch_x':[34.0,35.75,0.25],'feld_jung_x':[34.0,35.75,0.25],'feld_jung_y':[34.0,35.75,0.25],'feld_reif_x':[34.0,35.75,0.25],'feld_reif_y':[34.0,35.75,0.25],'feld_winter_x':[34.0,35.75,0.25],'feld_winter_y':[34.0,35.75,0.25],'garben_1':[9.88,21.5,0.25],'garben_2':[9.88,22.0,0.25],'schneefleck_1':[31.75,15.75,0.5],'schneefleck_2':[28.75,15.88,0.5],'schneefleck_3':[28.38,15.12,0.5],'schneefleck_4':[23.25,11.75,0.5],'schneefleck_5':[22.75,12.38,0.5],'schneefleck_6':[18.88,10.12,0.5],'schneefleck_7':[18.38,10.5,0.5],'schneefleck_8':[15.25,9.5,0.5]};
// Gemalte Pfähle und Palisadentor (tools/palisade.py)
Object.assign(P5, {pal_pfahl_1:[1.68,27.53,0.3333],pal_pfahl_2:[1.94,28.94,0.3333],pal_pfahl_3:[1.59,26.65,0.3333],pal_pfahl_4:[1.76,29.29,0.3333],pal_pfahl_5:[1.94,29.12,0.3333],pal_pfahl_6:[1.76,27.88,0.3333],pal_pfahl_7:[1.94,28.76,0.3333],pal_pfahl_8:[2.91,28.24,0.3333],pal_pfahl_9:[1.85,28.41,0.3333],pal_pfahl_10:[1.76,29.29,0.3333],pal_pfahl_11:[1.76,27.0,0.3333],pal_pfahl_12:[1.94,28.41,0.3333],pal_pfahl_13:[1.85,30.18,0.3333],pal_pfahl_14:[1.5,28.06,0.3333],pal_pfahl_15:[1.85,29.12,0.3333],pal_pfahl_16:[1.85,27.71,0.3333],pal_pfahl_17:[1.94,28.76,0.3333],pal_pfahl_18:[1.76,27.88,0.3333],pal_pfahl_19:[2.03,29.12,0.3333],pal_pfahl_20:[1.76,29.12,0.3333],pal_pfahl_21:[1.59,26.47,0.3333],pal_pfahl_22:[2.03,28.94,0.3333],pal_pfahl_23:[1.76,27.53,0.3333],pal_pfahl_24:[1.85,29.65,0.3333],pal_palisade_tor:[20.47,34.94,0.3333],pal_pfahl_1_winter:[1.06,27.35,0.3333],pal_pfahl_2_winter:[1.41,28.76,0.3333],pal_pfahl_3_winter:[1.06,26.65,0.3333],pal_pfahl_4_winter:[1.41,29.29,0.3333],pal_pfahl_5_winter:[1.24,29.12,0.3333],pal_pfahl_6_winter:[1.24,27.71,0.3333],pal_pfahl_7_winter:[1.41,29.12,0.3333],pal_pfahl_8_winter:[1.32,28.41,0.3333],pal_pfahl_9_winter:[1.06,26.47,0.3333],pal_pfahl_10_winter:[1.5,28.24,0.3333],pal_pfahl_11_winter:[1.24,29.29,0.3333],pal_pfahl_12_winter:[1.5,27.0,0.3333],pal_pfahl_13_winter:[1.06,28.41,0.3333],pal_pfahl_14_winter:[1.24,30.35,0.3333],pal_pfahl_15_winter:[1.15,27.88,0.3333],pal_pfahl_16_winter:[1.32,29.12,0.3333],pal_pfahl_17_winter:[1.5,27.35,0.3333],pal_pfahl_18_winter:[1.32,28.59,0.3333],pal_pfahl_19_winter:[1.24,27.88,0.3333],pal_pfahl_20_winter:[1.15,29.12,0.3333],pal_pfahl_21_winter:[1.24,28.94,0.3333],pal_pfahl_22_winter:[1.59,28.94,0.3333],pal_pfahl_23_winter:[1.24,27.35,0.3333],pal_pfahl_24_winter:[1.06,29.47,0.3333],pal_palisade_tor_winter:[20.47,34.76,0.3333]});
const PAL_N = [24, 24];
// Friedhof und Gefallene (tools/friedhof.py), siehe drawCemeteryArt
Object.assign(P5, {fh_grab_offen:[10.2,16.12,0.3333],fh_grab_offen_winter:[10.33,16.2,0.3333],fh_grab_frisch:[11.56,17.47,0.3333],fh_grab_frisch_winter:[11.02,17.58,0.3333],fh_grab_steinkreuz:[11.44,16.27,0.3333],fh_grab_steinkreuz_winter:[11.48,16.38,0.3333],fh_grab_stein:[9.4,16.28,0.3333],fh_grab_stein_winter:[11.35,16.64,0.3333],fh_grab_alt:[11.16,15.37,0.3333],fh_grab_alt_winter:[10.88,15.88,0.3333],fh_friedhofskreuz:[8.68,26.21,0.3333],fh_friedhofskreuz_winter:[8.89,25.42,0.3333],fh_friedhof_zaun:[1.4,16.3,0.3333],fh_friedhof_zaun_winter:[0.85,16.5,0.3333],fh_friedhof_tor:[10.3,21.15,0.3333],fh_friedhof_tor_winter:[10.4,26.0,0.3333],fh_toter_rot_1:[12.22,6.72,0.3333],fh_toter_rot_2:[10.18,6.91,0.3333],fh_toter_rot_3:[9.55,6.05,0.3333],fh_toter_rot_4:[10.69,7.8,0.3333],fh_toter_gruen_1:[10.58,6.25,0.3333],fh_toter_gruen_2:[13.84,6.98,0.3333],fh_toter_gruen_3:[9.58,4.73,0.3333],fh_toter_gruen_4:[11.98,7.04,0.3333],fh_toter_braun_1:[12.27,6.92,0.3333],fh_toter_braun_2:[12.72,6.62,0.3333],fh_toter_braun_3:[10.94,6.37,0.3333],fh_toter_braun_4:[10.93,6.0,0.3333]});
// Zeichnen mit Fußpunkt auf (x, y): sc vergrößert, flip spiegelt (vertauscht x und y der Schrägansicht),
// color färbt Magenta (Banner) in diese Farbe; beim Herauszoomen nimmt es die passende verkleinerte Stufe
function p5(c, id, x, y, sc = 1, flip = false, color = null, z = 0) {
  const a = P5[id];
  if (!a || !ART[id]) return false;
  const spr = figSprite(id, color || '#808080');
  if (!spr) return false;
  const t = c.getTransform(), on = Math.hypot(t.a, t.b) * a[2] * sc;
  const lv = Math.max(0, Math.min(spr.mips.length - 1, Math.floor(Math.log2(1 / Math.max(on, 1e-3)))));
  const im = spr.mips[lv];
  const [px, py] = P(x, y, z);
  c.save(); c.translate(px, py); if (flip) c.scale(-1, 1);
  c.drawImage(im, -a[0] * sc, -a[1] * sc, spr.w * a[2] * sc, spr.h * a[2] * sc);
  c.restore();
  return true;
}
// Gemalte Bauten aus Rasterbögen (tools/bauten.py): Langhaus (Rotherwood mit Schild), Katen, Wirtshaus, Galgen,
// je mit Winterbild. Fußpunkt in Weltpixeln, Maßstab; BAU_FLAECHE: Grundfläche (Kacheln) beim Maßstab 1.
Object.assign(P5, {bau_langhaus_rotherwood:[85.12,98.7,0.3333],bau_langhaus_rotherwood_winter:[89.16,93.79,0.3333],bau_langhaus:[85.12,114.16,0.3333],bau_langhaus_winter:[84.83,111.85,0.3333],bau_kate_a:[33.79,48.53,0.3333],bau_kate_a_winter:[36.11,48.95,0.3333],bau_kate_b:[34.32,49.26,0.3333],bau_kate_b_winter:[36.63,49.89,0.3333],bau_taverne:[45.26,53.05,0.3333],bau_taverne_winter:[45.26,59.79,0.3333],bau_galgen:[34.95,47.07,0.3333],bau_galgen_besetzt:[33.69,47.07,0.3333],bau_galgen_winter:[34.65,50.71,0.3333],bau_galgen_besetzt_winter:[34.6,50.61,0.3333]});
const BAU_FLAECHE = {langhaus_rotherwood:[3.3,1.6],langhaus:[1.6,3.3],kate_a:[0.95,0.95],kate_b:[0.95,0.95],taverne:[1.3,0.94],galgen:[1.2,0.9],galgen_besetzt:[1.2,0.9]};
// Im Schnee das Winterbild, wenn es geladen ist
function bauId(name) { const w = `bau_${name}_winter`; return lookSeason() === 3 && ART[w] ? w : `bau_${name}`; }
// Haus als gemaltes Bild: Wirtshaus; strohgedeckte Holz- und Lehmhäuser als Kate (nicht zu lang gestreckt)
function houseSprite(b) {
  if (b.kind !== 'house' || b.cons < 1 || b.dmg > 0 || b.fire > G.time) return null;
  let name = null;
  if (b.tavern) name = 'taverne';
  else if ((b.roof || 'thatch') === 'thatch' && Math.max(b.wx, b.wy) / Math.min(b.wx, b.wy) <= 1.4 && Math.max(b.wx, b.wy) <= 1.8) name = b.wall === 'wood' ? 'kate_a' : b.wall === 'plaster' ? 'kate_b' : null;
  if (!name || !ART[`bau_${name}`]) return null;
  const [fw, fh] = BAU_FLAECHE[name];
  // Tür liegt im Bild auf der vorderen linken Seite; ein Haus, das quer steht, wird gespiegelt
  const flip = name === 'taverne' ? b.wy > b.wx : false;
  const sc = Math.sqrt((b.wx * b.wy) / (fw * fh));
  return { name, flip, sc };
}
function drawHouseSprite(c, b, hs) {
  drawShadow(c, b.x, b.y, b.wx, b.wy, b.h + b.rh * 0.7);
  if (!p5(c, bauId(hs.name), b.x, b.y, hs.sc, hs.flip)) return false;
  const lit = b.lit && !abandonedId(b.site);
  if (lit && darkness() > 0.2) { addLight(b.x, b.y + b.wy / 2, b.h * 0.5, 22, 0.8); addLight(b.x + b.wx / 2, b.y, b.h * 0.5, 22, 0.7); }
  return true;
}

// Schadensstufe eines Mauerstücks: 1–3 nach dem Schaden, 4 wenn die Bresche offen ist
function dmgStage(hit) { if (!hit) return 0; if (hit.gone) return 4; return Math.min(3, 1 + Math.floor(hit.dmg * 3)); }
const p5dmg = (base, st) => (st ? `${base}_schaden_${st}` : base);
// Steinmauer mit den Zinnen immer außen. Geliefert sind die x-Mauer von außen (Zinnen vorn) und die y-Mauer von innen
// (Zinnen hinten). Gespiegelt wird aus der einen die andere Achse (Spiegeln vertauscht x und y der Schrägansicht):
// die y-Mauer von außen (Ostseite) und die x-Mauer von innen (Nordseite). Das Licht kommt von links, darum wird die
// gespiegelte Ansicht an die Helligkeit ihrer neuen Seite angeglichen.
const WALL_MIRROR = { x: ['y_aussen', 0.76], y: ['x_innen', 1.3] };
function mirrorWall(id) {
  const m = /^burg_stein_mauer_(x|y)((?:_schaden_\d)?)$/.exec(id);
  const im = m && ART[id], a = m && P5[id];
  if (!im || !a) return;
  const [view, f] = WALL_MIRROR[m[1]];
  const cv = makeCanvas(im.width, im.height), g = cv.getContext('2d');
  g.translate(im.width, 0); g.scale(-1, 1); g.drawImage(im, 0, 0);
  try {
    const d = g.getImageData(0, 0, cv.width, cv.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) { px[i] = Math.min(255, px[i] * f); px[i + 1] = Math.min(255, px[i + 1] * f); px[i + 2] = Math.min(255, px[i + 2] * f); }
    g.putImageData(d, 0, 0);
  } catch (e) { /* ohne Pixelzugriff bleibt die Helligkeit */ }
  const nid = `burg_stein_mauer_${view}${m[2]}`;
  P5[nid] = [im.width * a[2] - a[0], a[1], a[2]];
  ART[nid] = cv;
}
// Ansicht je Seite: Süden und Osten zeigen die Außenseite, Norden und Westen die Innenseite (Zinnen hinten = außen)
const wallView = (s) => (s.along === 'x' ? (s.front ? 'x' : 'x_innen') : s.front ? 'y_aussen' : 'y');
// Die Bilder stehen mit ihrer sichtbaren Vorderkante auf dem Fußpunkt; um halbe Mauerstärke zum Betrachter gerückt,
// läuft die Mauermitte genau durch die Mitte der Ecktürme
const WALL_HALF = 0.14;
// Tor einer Burg geschlossen? Bei Belagerung oder wenn du das Tor deiner Burg geschlossen hast
function castleGateClosed(site) {
  const sg = G.siege;
  if (sg && sg.site === site && sg.gatesClosed && sg.walls && sg.walls.square) return true;
  return site.type === 'spieler' && homeGateClosed();
}

function castlePieces(site, level, bannerCol) {
  const parts = [];
  const cx = site.x, cy = site.y, R = 4;
  const z0 = groundZ(G.world, cx, cy);
  const add = (x, y, f, bias = 0) => parts.push({ x, y, d: x + y + bias, z: z0, f });
  const stone = '#a5a092', wood = '#8a6440';
  const sides = [];
  for (let k = -R; k < R; k++) {
    sides.push({ x: cx + k + 0.5, y: cy - R, along: 'x' });
    sides.push({ x: cx + k + 0.5, y: cy + R, along: 'x', front: true, gate: k === -1 || k === 0 });
    sides.push({ x: cx - R, y: cy + k + 0.5, along: 'y' });
    sides.push({ x: cx + R, y: cy + k + 0.5, along: 'y', front: true });
  }
  const corners = [[cx - R, cy - R], [cx + R, cy - R], [cx - R, cy + R], [cx + R, cy + R]];

  if (level === 0) {
    // Ruine: Mauerreste mit Efeu, Turmstümpfe, Schutt
    const r = mulberry32(site.tx * 31 + site.ty);
    for (const s of sides) {
      if (s.gate || r() < 0.45) continue;
      const h = 4 + r() * 14, v = r() < 0.5 ? 1 : 2;
      add(s.x, s.y, (c) => { if (!p5(c, `burg_ruine_mauer_${v}${s.along === 'y' ? '_y' : ''}`, s.x, s.y)) drawBox(c, s.x, s.y, s.along === 'x' ? 1 : 0.45, s.along === 'x' ? 0.45 : 1, h, '#938e83', 0, 'stone'); });
    }
    for (const [x, y] of corners) {
      const h = 10 + r() * 18;
      add(x, y, (c) => { drawShadow(c, x, y, 1.1, 1.1, h); if (!p5(c, 'burg_ruine_turm', x, y, 1.15)) { drawBox(c, x, y, 1.1, 1.1, h, '#8e897e', 0, 'stone'); drawBox(c, x - 0.25, y - 0.2, 0.5, 0.6, 7, '#8e897e', h, 'stone'); } });
    }
    add(cx - 1.2, cy - 1.2, (c) => {
      drawShadow(c, cx - 1.2, cy - 1.2, 2.1, 2.1, 30);
      if (p5(c, 'burg_ruine_turm', cx - 1.2, cy - 1.2, 1.7)) return;
      drawBox(c, cx - 1.2, cy - 1.2, 2.1, 2.1, 24, '#8e897e', 0, 'stone'); drawBox(c, cx - 1.6, cy - 1.0, 0.8, 1.0, 12, '#8e897e', 24, 'stone');
    });
    add(cx - 0.2, cy + 0.1, (c) => p5(c, 'burg_schutt', cx - 0.2, cy + 0.1, 1.1));
    add(cx + 1.4, cy + 1.2, (c) => drawTent(c, { x: cx + 1.4, y: cy + 1.2, wx: 1.1, wy: 1.0, color: '#d8ccb0' }));
    add(cx + 2.4, cy + 2.4, (c) => drawFire(c, { x: cx + 2.4, y: cy + 2.4 }));
    add(cx - 2.2, cy + 2.4, (c) => { if (!p5(c, 'burg_schutt', cx - 2.2, cy + 2.4)) drawStones(c, cx - 2.2, cy + 2.4, 5); });
    return parts;
  }

  if (level === 1) {
    for (const s of sides) {
      if (s.gate) continue;
      add(s.x, s.y, (c) => {
        const hit = wallHit(site, s.x, s.y);
        if (p5(c, p5dmg(`burg_palisade_${s.along}`, dmgStage(hit)), s.x, s.y)) { if (hit && hit.repair) drawScaffold(c, s.x, s.y, 1.1, 0.6, 30); return; }
        for (let k = -1; k <= 1; k++) {
          const px = s.along === 'x' ? s.x + k * 0.33 : s.x, py = s.along === 'y' ? s.y + k * 0.33 : s.y;
          const sh = !hit ? 24 : hit.gone ? (k === 0 ? 0 : 5) : 24 * (1 - 0.55 * hit.dmg * ((k + 2) % 3 === 0 ? 1 : 0.5));
          if (sh <= 0) continue;
          drawBox(c, px, py, 0.24, 0.24, sh, hit ? '#7a5a3a' : wood);
          if (sh > 12) drawPyramid(c, px, py, 0.24, 0.24, sh, 6, wood);
        }
        if (hit && hit.gone) drawLogs(c, s.x + 0.3, s.y + 0.3, 3);
        if (hit && hit.repair) drawScaffold(c, s.x, s.y, 1.1, 0.6, 30);
      });
    }
    // Holztürme an den Ecken, Tor mit Wehrgang (offen, geschlossen oder beschädigt)
    for (const [x, y] of corners) add(x, y, (c) => p5(c, p5dmg('burg_holzturm', dmgStage(wallHit(site, x, y))), x, y, 1.25), 0.4);
    if (ART.burg_holztor) {
      add(cx, cy + R, (c) => { const st = dmgStage(wallHit(site, cx, cy + R)); p5(c, st ? p5dmg('burg_holztor', st) : castleGateClosed(site) ? 'burg_holztor_zu' : 'burg_holztor', cx, cy + R, 1.4); }, 0.3);
    } else {
      for (const gx of [-1.15, 1.15]) add(cx + gx, cy + R, (c) => { drawBox(c, cx + gx, cy + R, 0.5, 0.5, 34, wood, 0, 'plank'); drawPyramid(c, cx + gx, cy + R, 0.5, 0.5, 34, 8, ROOFS.wood); });
    }
    add(cx - 1.2, cy - 1.2, (c) => {
      drawShadow(c, cx - 1.2, cy - 1.2, 1.6, 1.6, 70);
      // Holzhalle mit Schindeldach als Haupthaus der Holzburg
      if (p5(c, 'burg_holzhalle', cx - 1.2, cy - 1.2, 0.85)) {
        banner(c, cx - 1.2, cy - 1.2, 58, bannerCol);
        if (darkness() > 0.2) addLight(cx - 0.8, cy - 1.0, 14, 30, 0.8);
        return;
      }
      drawBox(c, cx - 1.2, cy - 1.2, 1.6, 1.6, 56, wood, 0, 'plank');
      faceQuad(c, cx - 1.2, cy - 1.2, 1.6, 1.6, 'L', 0.4, 0.6, 0, 12, '#3a2a1c');
      faceQuad(c, cx - 1.2, cy - 1.2, 1.6, 1.6, 'R', 0.4, 0.55, 34, 42, darkness() > 0.2 ? '#ffcf6a' : '#2a2018');
      drawBox(c, cx - 1.2, cy - 1.2, 1.9, 1.9, 4, '#7c5a3a', 50);
      drawPyramid(c, cx - 1.2, cy - 1.2, 1.6, 1.6, 56, 22, ROOFS.wood);
      banner(c, cx - 1.2, cy - 1.2, 78, bannerCol);
      if (darkness() > 0.2) addLight(cx - 0.4, cy - 1.2, 38, 26, 0.8);
    });
    return parts;
  }

  const wh = level >= 3 ? 40 : 30;
  for (const s of sides) {
    if (s.gate) continue;
    add(s.x, s.y, (c) => {
      const wx = s.along === 'x' ? 1.02 : 0.5, wy = s.along === 'y' ? 1.02 : 0.5;
      const hit = wallHit(site, s.x, s.y);
      const ax = s.x + (s.along === 'y' ? WALL_HALF : 0), ay = s.y + (s.along === 'x' ? WALL_HALF : 0);
      if (p5(c, p5dmg(`burg_stein_mauer_${wallView(s)}`, dmgStage(hit)), ax, ay, level >= 3 ? 1.1 : 1)) { if (hit && hit.repair) drawScaffold(c, s.x, s.y, wx + 0.3, wy + 0.3, wh + 18); return; }
      if (hit) { drawWallRuined(c, s.x, s.y, wx, wy, wh, stone, hit); return; }
      drawBox(c, s.x, s.y, wx, wy, wh, stone, 0, 'stone');
      for (const k of [-0.25, 0.25]) {
        const mx = s.along === 'x' ? s.x + k : s.x, my = s.along === 'y' ? s.y + k : s.y;
        drawBox(c, mx, my, s.along === 'x' ? 0.24 : 0.5, s.along === 'y' ? 0.24 : 0.5, 6, stone, wh);
      }
    });
  }
  const th = level >= 3 ? 66 : 50;
  for (const [x, y] of corners) {
    add(x, y, (c) => {
      drawShadow(c, x, y, 1.4, 1.4, th);
      if (p5(c, p5dmg('burg_stein_turm', dmgStage(wallHit(site, x, y))), x, y, level >= 3 ? 1.42 : 1.3)) return;
      drawBox(c, x, y, 1.4, 1.4, th, stone, 0, 'stone');
      faceQuad(c, x, y, 1.4, 1.4, 'L', 0.42, 0.58, th * 0.6, th * 0.72, '#2c2622');
      faceQuad(c, x, y, 1.4, 1.4, 'R', 0.42, 0.58, th * 0.6, th * 0.72, '#2c2622');
      if (level >= 3) { drawPyramid(c, x, y, 1.4, 1.4, th, 30, ROOFS.slate); banner(c, x, y, th + 30, bannerCol); }
      else drawMerlons(c, x, y, 1.4, 1.4, th, stone);
    }, 0.4);
  }
  // Torhaus mit zwei Rundtürmen: offen, geschlossen oder beschädigt, die Banner in der Farbe des Herrn
  if (ART.burg_stein_tor) add(cx, cy + R, (c) => { const st = dmgStage(wallHit(site, cx, cy + R)); p5(c, st ? p5dmg('burg_stein_tor', st) : castleGateClosed(site) ? 'burg_stein_tor_zu' : 'burg_stein_tor', cx, cy + R, level >= 3 ? 1.25 : 1.15, false, bannerCol); }, 0.3);
  else for (const gx of [-1.3, 1.3]) {
    add(cx + gx, cy + R, (c) => {
      drawBox(c, cx + gx, cy + R, 1.0, 1.0, wh + 16, stone, 0, 'stone');
      drawMerlons(c, cx + gx, cy + R, 1.0, 1.0, wh + 16, stone);
    }, 0.3);
  }
  if (!ART.burg_stein_tor) add(cx, cy + R - 0.05, (c) => {
    drawBox(c, cx, cy + R, 1.6, 0.8, 10, stone, wh - 4, 'stone');
    faceQuad(c, cx, cy + R, 1.6, 0.8, 'L', 0.05, 0.95, wh - 4, wh - 3, '#3a2a1c');
    c.strokeStyle = '#3a3632'; c.lineWidth = 1;
    c.beginPath();
    for (let k = 1; k < 6; k++) { const a = facePoint(cx, cy + R, 1.6, 0.8, 'L', k / 6, wh - 4), d = facePoint(cx, cy + R, 1.6, 0.8, 'L', k / 6, wh - 14); c.moveTo(a[0], a[1]); c.lineTo(d[0], d[1]); }
    c.stroke();
  }, 0.2);
  if (level >= 3) {
    for (const [x, y] of [[cx, cy - R], [cx - R, cy]]) add(x, y, (c) => { if (p5(c, p5dmg('burg_stein_turm', dmgStage(wallHit(site, x, y))), x, y, 1.15)) return; drawBox(c, x, y, 1.1, 1.1, 56, stone, 0, 'stone'); drawPyramid(c, x, y, 1.1, 1.1, 56, 24, ROOFS.slate); }, 0.3);
  }
  const kw = level >= 3 ? 2.8 : 2.2, kh = level >= 3 ? 100 : 76;
  add(cx - 1.1, cy - 1.1, (c) => {
    drawShadow(c, cx - 1.1, cy - 1.1, kw, kw, kh);
    // Bergfried: normannischer Wohnturm, in der Festung der große mit Ecktürmchen; Banner in der Farbe des Herrn
    if (p5(c, level >= 3 ? 'burg_bergfried_gross' : 'burg_bergfried', cx - 1.1, cy - 1.1, level >= 3 ? 1.12 : 1.1, false, bannerCol)) {
      if (darkness() > 0.2) addLight(cx - 1.1, cy - 1.1 + kw / 2, kh * 0.5, 40, 0.8);
      return;
    }
    drawBox(c, cx - 1.1, cy - 1.1, kw, kw, kh, '#ada798', 0, 'stone');
    faceQuad(c, cx - 1.1, cy - 1.1, kw, kw, 'L', 0.38, 0.62, 0, 18, '#5a4030');
    faceQuad(c, cx - 1.1, cy - 1.1, kw, kw, 'L', 0.42, 0.58, 0, 16, '#2c2420');
    for (const z of [0.45, 0.72]) {
      const lit = darkness() > 0.2;
      faceQuad(c, cx - 1.1, cy - 1.1, kw, kw, 'L', 0.2, 0.3, kh * z, kh * z + 9, lit ? '#ffd27a' : '#2c2622');
      faceQuad(c, cx - 1.1, cy - 1.1, kw, kw, 'R', 0.6, 0.7, kh * z, kh * z + 9, lit ? '#ffd27a' : '#2c2622');
    }
    drawMerlons(c, cx - 1.1, cy - 1.1, kw, kw, kh, '#ada798', 0.24);
    banner(c, cx - 1.1, cy - 1.1, kh + 6, bannerCol);
    if (darkness() > 0.2) addLight(cx - 1.1, cy - 1.1 + kw / 2, kh * 0.5, 40, 0.8);
  });
  return parts;
}

// Runder Pfahl mit Spitze und Bastband: Licht von links, Schatten rechts
function drawStake(c, x, y, h, k) {
  const [px, py0] = P(x, y, 0), py = py0 + 1;
  const w = 4.6 + (k % 3) * 0.3, tip = h > 12 ? 6 + (k % 2) : 0;
  c.fillStyle = '#7d5634'; c.fillRect(px - w, py - h, 2 * w, h);
  c.fillStyle = '#9c7249'; c.fillRect(px - w, py - h, w * 0.85, h);
  c.fillStyle = '#5a3c24'; c.fillRect(px + w * 0.4, py - h, w * 0.6, h);
  c.beginPath(); c.ellipse(px, py, w, w * 0.45, 0, 0, Math.PI); c.fill();
  if (tip) {
    c.fillStyle = '#b48858'; c.beginPath(); c.moveTo(px - w, py - h); c.lineTo(px, py - h - tip); c.lineTo(px, py - h + 1); c.closePath(); c.fill();
    c.fillStyle = '#7a5230'; c.beginPath(); c.moveTo(px + w, py - h); c.lineTo(px, py - h - tip); c.lineTo(px, py - h + 1); c.closePath(); c.fill();
  } else { c.fillStyle = '#c8a070'; c.beginPath(); c.ellipse(px, py - h, w, w * 0.45, 0, 0, Math.PI * 2); c.fill(); }
  c.strokeStyle = 'rgba(214,190,130,0.8)'; c.lineWidth = 1.1;
  for (const f of [0.3, 0.75]) if (h * f < h - 2) { c.beginPath(); c.ellipse(px, py - h * f, w, w * 0.45, 0, 0.15, Math.PI - 0.15); c.stroke(); }
}

// Gemalter Pfahl (Sommer oder Winter), etwas breiter als gemalt, damit die Palisade dicht wirkt; f: Anteil der Höhe
// (Schaden: oben abgebrochen)
function drawStakeArt(c, x, y, k, f = 1) {
  const win = lookSeason() === 3 && ART.pal_pfahl_1_winter, n = PAL_N[win ? 1 : 0];
  const id = `pal_pfahl_${1 + (k % n)}${win ? '_winter' : ''}`, a = P5[id];
  if (!a || !ART[id]) return false;
  const [px, py] = P(x, y);
  c.save();
  if (f < 1) { c.beginPath(); c.rect(px - 12, py - 30 * f, 24, 30 * f + 8); c.clip(); }
  const wd = win ? 1.75 : 1.3;   // die Winterpfähle sind schmaler gemalt
  c.translate(px, py); c.scale(k % 3 === 1 ? -wd : wd, 1); c.translate(-px, -py);
  const ok = p5(c, id, x, y);
  c.restore();
  return ok;
}
// Palisadentor schräg in die Richtung der Mauer gelegt (die Lücke liegt im Süden, die Mauer läuft dort längs x)
function drawPalisadeGate(c, x, y) {
  const id = lookSeason() === 3 && ART.pal_palisade_tor_winter ? 'pal_palisade_tor_winter' : 'pal_palisade_tor', a = P5[id];
  const spr = a && ART[id] ? figSprite(id, '#808080') : null;
  if (!spr) return;
  const [px, py] = P(x, y);
  c.save(); c.translate(px, py); c.transform(1, 0.5, 0, 1, 0, 0);
  c.drawImage(lodOf(spr.mips[0], c, a[2]), -a[0], -a[1], spr.w * a[2], spr.h * a[2]);
  c.restore();
}
function palisadeRing(site, r) {
  const parts = [];
  const wood = '#8a6440';
  const z0 = groundZ(G.world, site.x, site.y);
  const W = G.world, N = W.N;
  if (ART.pal_pfahl_1) {
    // Gemalte Pfähle dicht an dicht: der Schritt richtet sich nach der Breite auf dem Bildschirm (vorn und hinten enger)
    const open = (x, y) => { const t = W.tiles[Math.floor(y) * N + Math.floor(x)]; return t === T.ROAD || t === T.BRIDGE || t === T.WATER; };
    const stakes = [];
    for (let a = Math.PI / 2 + PAL_GATE, k = 0; a < Math.PI / 2 + Math.PI * 2 - PAL_GATE; k++) {
      const x = site.x + Math.cos(a) * r, y = site.y + Math.sin(a) * r;
      if (!open(x, y)) stakes.push({ x, y, k: Math.floor(hash2(k, site.tx, 71) * 97) });
      const hs = 32 * r * Math.abs(Math.sin(a) + Math.cos(a));
      a += Math.max(0.012, Math.min(0.06, 3.6 / Math.max(hs, 1)));
    }
    // je gut eine Viertelkachel ein Stück für die Tiefensortierung
    for (let i = 0; i < stakes.length;) {
      const grp = [stakes[i]];
      while (++i < stakes.length && Math.hypot(stakes[i].x - grp[0].x, stakes[i].y - grp[0].y) < 0.28) grp.push(stakes[i]);
      grp.sort((p, q) => p.x + p.y - (q.x + q.y));
      const m = grp[grp.length >> 1];
      parts.push({ x: m.x, y: m.y, d: m.x + m.y, z: z0, f: (c) => {
        for (const st of grp) {
          const hit = wallHit(site, st.x, st.y);
          if (!hit) drawStakeArt(c, st.x, st.y, st.k);
          else if (hit.gone) { if (st.k % 2) drawStakeArt(c, st.x, st.y, st.k, 0.18); }
          else drawStakeArt(c, st.x, st.y, st.k, 1 - 0.6 * hit.dmg * (st.k % 2 ? 1 : 0.4));
        }
        const h0 = wallHit(site, m.x, m.y);
        if (h0 && h0.repair) drawScaffold(c, m.x, m.y, 0.5, 0.5, 30);
      } });
    }
    const gx = site.x, gy = site.y + r;
    parts.push({ x: gx, y: gy, d: gx + gy, z: z0, f: (c) => drawPalisadeGate(c, gx, gy) });
    return parts;
  }
  const n = Math.round(Math.PI * 2 * r / 0.27);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    if (Math.abs(a - Math.PI * 0.5) < 0.28) continue;
    const x = site.x + Math.cos(a) * r, y = site.y + Math.sin(a) * r;
    const h0 = 22 + hash2(k, site.tx, 71) * 4;
    parts.push({ x, y, d: x + y, z: z0, f: (c) => {
      const hit = wallHit(site, x, y);
      if (!hit) { drawStake(c, x, y, h0, k); return; }
      if (hit.gone) { if (k % 2) drawStake(c, x, y, 4, k); return; }
      drawStake(c, x, y, h0 * (1 - 0.6 * hit.dmg * (k % 2 ? 1 : 0.4)), k);
      if (hit.repair && k % 3 === 0) drawScaffold(c, x, y, 0.5, 0.5, 24);
    } });
  }
  return parts;
}

const BOXED_KINDS = { house: 1, church: 1, longhall: 1, landmark: 1, klause: 1, stollen: 1, halde: 1, mystic: 1, tent: 1, stall: 1, well: 1 };

// Tiefensortierung: erst grob nach x + y, dann für Gebäude genau. Was vollständig hinter einem
// Gebäude steht (westlich oder nördlich davon), wird vorher gezeichnet, was davor steht, danach.
// Lange Bauten wie Kathedralen verdecken so keine Häuser mehr, die eigentlich vor ihnen stehen.
const SORT_CELL = 4;
function sortObjects(objs) {
  objs.sort((a, b) => a.d - b.d);
  const grid = new Map();
  let bigs = 0;
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i];
    if (!o.box) continue;
    o.pre = null; o.mark = 0; o.ord = i;
    const k = Math.floor((o.box[0] + o.box[1]) / 2 / SORT_CELL) * 8192 + Math.floor((o.box[2] + o.box[3]) / 2 / SORT_CELL);
    let l = grid.get(k);
    if (!l) grid.set(k, l = []);
    l.push(o);
    if (o.big) bigs++;
  }
  if (!bigs) return objs;
  const E = 0.02;
  const behind = (a, b) => (a.box[1] <= b.box[0] + E && a.box[2] < b.box[3] - E) || (a.box[3] <= b.box[2] + E && a.box[0] < b.box[1] - E);
  for (const a of objs) {
    if (!a.big || !a.box) continue;
    const cx = Math.floor((a.box[0] + a.box[1]) / 2 / SORT_CELL), cy = Math.floor((a.box[2] + a.box[3]) / 2 / SORT_CELL);
    const reach = 1 + Math.floor(Math.max(a.box[1] - a.box[0], a.box[3] - a.box[2]) / SORT_CELL);
    for (let gx = cx - reach; gx <= cx + reach; gx++) for (let gy = cy - reach; gy <= cy + reach; gy++) {
      const l = grid.get(gx * 8192 + gy);
      if (!l) continue;
      for (const b of l) {
        if (b === a || (b.big && b.ord < a.ord)) continue;
        if (behind(b, a)) (a.pre || (a.pre = [])).push(b);
        else if (behind(a, b)) (b.pre || (b.pre = [])).push(a);
      }
    }
  }
  const out = [];
  const visit = (o) => {
    if (o.mark) return;
    o.mark = 1;
    if (o.pre) for (const p of o.pre) visit(p);
    o.mark = 2;
    out.push(o);
  };
  for (const o of objs) { if (o.box) visit(o); else out.push(o); }
  return out;
}

function buildStaticParts() {
  const W = G.world;
  const parts = [];
  // Am gemalten Wirtshaus stehen Bänke und Fässer schon im Bild: die gezeichneten Dinge davor weglassen
  const tavs = ART.bau_taverne ? W.buildings.filter((b) => b.tavern) : [];
  for (const b of W.buildings) {
    if (b.kind === 'prop' && tavs.some((t) => Math.abs(t.x - b.x) < 1.6 && Math.abs(t.y - b.y) < 1.5)) continue;
    const f = {
      house: drawHouseFast, church: drawChurchFast, longhall: drawLonghall, tent: drawTent, stall: drawStall,
      well: drawWell, fire: drawFire, fence: drawFence, prop: drawProp, ship: drawShip,
      landmark: drawLandmark, stonehenge: drawStonehenge,
      stollen: drawStollen, halde: drawHalde, klause: drawKlause, mystic: drawMystic,
    }[b.kind];
    if (b.kind === 'friedhof') continue;
    if (!f) continue;
    // Grundfläche für die Zeichenreihenfolge: Gebäude als Rechteck, Kleinkram als Punkt
    const big = b.wx >= 0.5 && BOXED_KINDS[b.kind];
    const r = 0.2, box = big ? [b.x - b.wx / 2, b.x + b.wx / 2, b.y - b.wy / 2, b.y + b.wy / 2] : [b.x - r, b.x + r, b.y - r, b.y + r];
    parts.push({ x: b.x, y: b.y, d: b.x + b.y, z: groundZ(W, b.x, b.y), f: (c) => f(c, b), b, box, big });
  }
  for (const s of W.sites) {
    if (s.cityWall) {
      const N = W.N, isOpen = (x, y) => { const t = W.tiles[y * N + x]; return t === T.ROAD || t === T.BRIDGE || t === T.WATER; };
      const ring = s.cityWall;
      ring.forEach(([x, y], k) => {
        if (isOpen(x, y)) return;
        const prev = ring[(k - 1 + ring.length) % ring.length], next = ring[(k + 1) % ring.length];
        const gate = isOpen(prev[0], prev[1]) || isOpen(next[0], next[1]);
        const o = { x: x + 0.5, y: y + 0.5, tower: gate || k % 7 === 0, gate, color: s.faction ? FACTIONS[s.faction].color : '#a33b32' };
        const hw = o.tower ? 0.62 : 0.5;
        const site = s;
        parts.push({ x: o.x, y: o.y, d: o.x + o.y, z: groundZ(W, o.x, o.y), f: (c) => {
          const hit = !o.tower && wallHit(site, o.x, o.y);
          if (hit) drawWallRuined(c, o.x, o.y, 1.0, 1.0, 38, '#b9b1a1', hit);
          else cachedDraw(c, o, [-44, 64, o.gate ? -116 : -82, 26], (g) => drawCityWallPiece(g, o));
        }, box: [o.x - hw, o.x + hw, o.y - hw, o.y + hw], big: true });
      });
    }
    if (s.type === 'burg') parts.push(...castlePieces(s, s.castleLevel, FACTIONS[s.faction].color));
    if (s.palisade) parts.push(...palisadeRing(s, s.palisade));
    if (s.cemetery) {
      const cm = s.cemetery;
      parts.push({ x: cm.x, y: cm.y, d: cm.x + cm.y - (cm.wx + cm.wy) / 2, z: groundZ(W, cm.x, cm.y), f: (c) => drawCemetery(c, s, false) });
      parts.push({ x: cm.x, y: cm.y, d: cm.x + cm.y + (cm.wx + cm.wy) / 2, z: groundZ(W, cm.x, cm.y), f: (c) => drawCemetery(c, s, true) });
    }
  }
  return parts;
}

// ---------------------------------------------------------------- Eigene Burg: sichtbarer Ausbau
const BUILD_ICON = { halle: 'krone', kaserne: 'schwerter', schmiede: 'amboss', stall: 'hufeisen', holzfaeller: 'axt', steinbruch: 'hacke', markt: 'muenze', kapelle: 'kreuz', wehr: 'turm', hospiz: 'kraut', schafzucht: 'schaf', felder: 'aehre' };
const PLOT = CASTLE_PLOT;
const TOWER_SPOTS = CASTLE_TOWERS;
const STONE_BUILDINGS = { halle: 1, kapelle: 1, schmiede: 1, steinbruch: 1, wehr: 1, hospiz: 1 };
let castleAnchors = [];
let sparkles = [];

function drawIcon(c, icon, x, y, col) {
  c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 1.2;
  c.beginPath();
  switch (icon) {
    case 'krone': c.moveTo(x - 5, y + 3); c.lineTo(x - 5, y - 2); c.lineTo(x - 2.5, y + 0.5); c.lineTo(x, y - 3); c.lineTo(x + 2.5, y + 0.5); c.lineTo(x + 5, y - 2); c.lineTo(x + 5, y + 3); c.closePath(); c.fill(); break;
    case 'schwerter': c.moveTo(x - 4, y + 3.5); c.lineTo(x + 4, y - 3.5); c.moveTo(x + 4, y + 3.5); c.lineTo(x - 4, y - 3.5); c.stroke(); c.fillRect(x - 4.8, y + 1.6, 2.6, 1.2); c.fillRect(x + 2.2, y + 1.6, 2.6, 1.2); break;
    case 'amboss': c.moveTo(x - 5, y - 2); c.lineTo(x + 5, y - 2); c.lineTo(x + 3, y); c.lineTo(x + 1.5, y); c.lineTo(x + 2.5, y + 3); c.lineTo(x - 2.5, y + 3); c.lineTo(x - 1.5, y); c.lineTo(x - 3, y); c.closePath(); c.fill(); break;
    case 'hufeisen': c.lineWidth = 1.8; c.moveTo(x - 3.2, y + 3.5); c.lineTo(x - 3.2, y + 0.3); c.arc(x, y + 0.3, 3.2, Math.PI, 0); c.lineTo(x + 3.2, y + 3.5); c.stroke(); break;
    case 'axt': c.moveTo(x - 3, y + 4); c.lineTo(x + 2, y - 3); c.stroke(); c.beginPath(); c.moveTo(x + 0.5, y - 4); c.lineTo(x + 4.5, y - 2.5); c.lineTo(x + 2.5, y + 0.5); c.closePath(); c.fill(); break;
    case 'hacke': c.moveTo(x - 2, y + 4); c.lineTo(x + 1, y - 3); c.stroke(); c.beginPath(); c.moveTo(x - 4.5, y - 1.5); c.quadraticCurveTo(x + 0.5, y - 5.5, x + 5, y - 1); c.stroke(); break;
    case 'muenze': c.arc(x, y, 3.3, 0, Math.PI * 2); c.fill(); c.fillStyle = '#c9a66b'; c.fillRect(x - 0.6, y - 2, 1.2, 4); break;
    case 'kreuz': c.fillRect(x - 0.8, y - 4, 1.6, 8); c.fillRect(x - 3, y - 2, 6, 1.6); break;
    case 'turm': c.fillRect(x - 2.5, y - 2, 5, 6); c.fillRect(x - 3.5, y - 4, 1.6, 2); c.fillRect(x - 0.8, y - 4, 1.6, 2); c.fillRect(x + 1.9, y - 4, 1.6, 2); break;
    case 'kraut': c.moveTo(x, y + 4); c.lineTo(x, y - 1); c.stroke(); c.beginPath(); c.ellipse(x - 2.2, y - 1.5, 2.4, 1.3, -0.5, 0, Math.PI * 2); c.ellipse(x + 2.2, y - 1.5, 2.4, 1.3, 0.5, 0, Math.PI * 2); c.ellipse(x, y - 3.6, 1.3, 2.2, 0, 0, Math.PI * 2); c.fill(); break;
    case 'schaf': c.ellipse(x - 0.5, y, 4, 2.6, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(x + 3.6, y - 1.2, 1.6, 0, Math.PI * 2); c.fill(); c.fillRect(x - 3, y + 1.5, 1, 2.5); c.fillRect(x + 1, y + 1.5, 1, 2.5); break;
    case 'aehre': c.moveTo(x, y + 4.5); c.lineTo(x, y - 4); c.stroke(); for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(x - 1.5, y - 2.6 + k * 2, 1.5, 0.9, -0.6, 0, Math.PI * 2); c.ellipse(x + 1.5, y - 2.6 + k * 2, 1.5, 0.9, 0.6, 0, Math.PI * 2); c.fill(); } break;
    default: break;
  }
}

function drawSign(c, x, y, icon, dim) {
  const [px, py] = P(x, y);
  c.strokeStyle = '#5a4030'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 15); c.stroke();
  c.globalAlpha = dim ? 0.75 : 1;
  c.fillStyle = dim ? '#b8a07a' : '#d1ae6e';
  c.fillRect(px - 8, py - 24, 16, 11);
  c.strokeStyle = '#5a4030'; c.lineWidth = 1; c.strokeRect(px - 8, py - 24, 16, 11);
  drawIcon(c, icon, px, py - 18.5, dim ? '#6b5a42' : '#2a1e14');
  c.globalAlpha = 1;
}

function drawPlot(c, x, y, wx, wy) {
  const pts = [[x - wx / 2, y - wy / 2], [x + wx / 2, y - wy / 2], [x + wx / 2, y + wy / 2], [x - wx / 2, y + wy / 2]].map(([a, b]) => P(a, b));
  poly(c, pts, 'rgba(110,80,45,0.22)');
  c.strokeStyle = 'rgba(245,232,200,0.9)'; c.lineWidth = 1; c.setLineDash([3, 2]);
  c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(p[0], p[1] - 4) : c.moveTo(p[0], p[1] - 4))); c.closePath(); c.stroke();
  c.setLineDash([]);
  c.strokeStyle = '#6b4a2e'; c.lineWidth = 1.8;
  for (const p of pts) { c.beginPath(); c.moveTo(p[0], p[1] + 1); c.lineTo(p[0], p[1] - 6); c.stroke(); }
}

// Kleine Arbeiterfigur mit Werkzeug (hämmert, hackt, schlägt)
// Arbeiter an Bauplätzen und in der Burg als 3D-Figur: Handwerker hämmern und hacken mit dem gemalten Werkzeug,
// Bauern hacken auf dem Feld, Soldaten üben Hiebe, Mönche segnen, Wachen stehen auf dem Turm. Je Stelle eine feste Figur.
const workerUnits = new Map();
const WORKER_ROLE = { hammer: 'handwerker', axt: 'handwerker', hacke: 'bauer', schwert: 'soldat' };
function workerUnit(x, y, tool, phase, o) {
  const key = `${x.toFixed(2)}|${y.toFixed(2)}|${tool}|${o.role || ''}`;
  let u = workerUnits.get(key);
  if (!u) {
    const role = o.role || WORKER_ROLE[tool] || 'bauer', soldier = role === 'soldat' || role === 'wache';
    const f = o.flip ? -1 : 1;
    u = soldier
      ? { kind: 'npc', cls: 'soldat', look: 'soldat', eq: { waffe: tool === 'schwert' ? 'kurzschwert' : 'speer', ruestung: 'gambeson', schild: tool === 'schwert' ? 'rundschild' : null } }
      : { kind: 'peasant', role, eq: {}, staff: !!o.staff };
    Object.assign(u, { x, y, id: 7000 + Math.round(phase * 37) % 997, hp: 1, st: { maxHp: 1 }, facing: f, dirX: f > 0 ? 1 : -0.35, dirY: f > 0 ? 0.35 : 1,
      tunic: o.col, act: o.act || (tool && tool !== 'schwert' ? tool : null), task: o.apron ? { anvil: true } : null, moving: false, worker: true });
    workerUnits.set(key, u);
    if (workerUnits.size > 300) workerUnits.delete(workerUnits.keys().next().value);
  }
  return u;
}
function drawWorker(c, x, y, tool, phase, o = {}) {
  const u = workerUnit(x, y, tool, phase, o);
  if (modelFor(u, false)) {
    const t = G.time * (o.speed || 5) + phase;
    // Übungshiebe: kurz ausholen und zuschlagen, dann Pause
    if (tool === 'schwert') { const p = ((G.time * (o.speed || 5) / 7 + phase / 6.28) % 1 + 1) % 1; u.swing = p < 0.3 ? 0.3 * (1 - p / 0.3) : 0; }
    const [px, py] = P(x, y, o.z || 0);
    drawFigure(c, u, px, py);
    return Math.sin(t);
  }
  if (tool === 'hammer' || tool === 'axt' || tool === 'hacke') emitWork(x, y, tool === 'hammer' && o.apron ? 'amboss' : tool, o.speed || 5, phase);
  const [px, py] = P(x, y, o.z || 0);
  const t = G.time * (o.speed || 5) + phase;
  const s = Math.sin(t);
  const lift = s > 0 ? s : 0;
  c.save();
  c.translate(px, py);
  c.fillStyle = 'rgba(20,30,10,0.28)'; c.beginPath(); c.ellipse(2, 0, 6, 2.6, 0, 0, Math.PI * 2); c.fill();
  c.scale((o.flip ? -1 : 1) * 1.1 * FIG, 1.1 * FIG);
  c.strokeStyle = '#3b2e24'; c.lineWidth = 2.1;
  c.beginPath(); c.moveTo(-1.5, -7); c.lineTo(-2, 0); c.moveTo(1.5, -7); c.lineTo(2, 0); c.stroke();
  const tunic = o.col || '#8a6e4b';
  c.strokeStyle = OUTLINE; c.lineWidth = 0.9;
  c.fillStyle = tunic;
  c.beginPath(); c.moveTo(-4.2, -6.5); c.lineTo(4.2, -6.5); c.lineTo(3.4, -15.5); c.lineTo(-3.4, -15.5); c.closePath(); c.fill(); c.stroke();
  if (o.apron) { c.fillStyle = '#4a3526'; c.fillRect(-2.6, -13, 5.2, 6.4); }
  c.save();
  c.translate(2.5, -13);
  c.rotate(-2.3 + lift * 2.0);
  c.strokeStyle = '#6b4a2a'; c.lineWidth = 1.8;
  if (tool === 'schwert') { c.strokeStyle = '#dfe3e6'; c.beginPath(); c.moveTo(0, 0); c.lineTo(10, 0); c.stroke(); }
  else if (tool) {
    c.beginPath(); c.moveTo(0, 0); c.lineTo(9, 0); c.stroke();
    c.fillStyle = '#9aa0a6';
    if (tool === 'hammer') c.fillRect(7.5, -2.5, 3, 5);
    if (tool === 'axt') { c.beginPath(); c.moveTo(8, -0.5); c.lineTo(11, -4); c.lineTo(11, 2.5); c.closePath(); c.fill(); }
    if (tool === 'hacke') { c.strokeStyle = '#9aa0a6'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(9, -4); c.quadraticCurveTo(11, 0, 9, 4); c.stroke(); }
  }
  c.restore();
  c.fillStyle = '#e4ba94'; c.strokeStyle = OUTLINE;
  c.beginPath(); c.arc(0, -18.5, 3, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = o.hat || '#6b4a2e';
  c.beginPath(); c.arc(0, -19, 3.2, Math.PI * 1.05, Math.PI * 1.95); c.fill();
  c.restore();
  return s;
}

function drawAnvil(c, x, y, hot) {
  drawBox(c, x, y, 0.16, 0.16, 4, '#5a4a3a');
  drawBox(c, x, y, 0.34, 0.16, 3, '#3c3a38', 4);
  if (hot) { const p = P(x, y, 7); c.fillStyle = '#ff9a3a'; c.fillRect(p[0] - 2, p[1] - 1, 4, 1.4); }
}

function drawSparks(c, x, y, z, s) {
  if (s < 0.75) return;
  const p = P(x, y, z);
  c.fillStyle = '#ffd25a';
  for (let k = 0; k < 6; k++) { const a = Math.random() * Math.PI, r = 3 + Math.random() * 9; c.fillRect(p[0] + Math.cos(a) * r, p[1] - Math.sin(a) * r * 0.8, 1.6, 1.6); }
  addLight(x, y, z, 18, 0.9);
}

function drawDummy(c, x, y) {
  const [px, py] = P(x, y);
  c.strokeStyle = '#5a4030'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 20); c.moveTo(px - 6, py - 15); c.lineTo(px + 6, py - 15); c.stroke();
  c.fillStyle = '#c9a85a'; c.strokeStyle = OUTLINE; c.lineWidth = 0.8;
  c.beginPath(); c.ellipse(px, py - 12, 4, 6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.arc(px, py - 21, 2.8, 0, Math.PI * 2); c.fill(); c.stroke();
}

function drawTarget(c, x, y) {
  const [px, py] = P(x, y);
  c.strokeStyle = '#5a4030'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(px - 4, py); c.lineTo(px, py - 16); c.lineTo(px + 4, py); c.stroke();
  const ring = (r, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(px, py - 13, r * 0.75, r, 0, 0, Math.PI * 2); c.fill(); };
  ring(7, '#e8e0cc'); ring(5, '#a33b32'); ring(3, '#e8e0cc'); ring(1.4, '#a33b32');
}

function drawRack(c, x, y) {
  const a = P(x - 0.3, y + 0.1), b = P(x + 0.3, y - 0.1);
  c.strokeStyle = '#5a4030'; c.lineWidth = 1.8;
  c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(a[0], a[1] - 12); c.moveTo(b[0], b[1]); c.lineTo(b[0], b[1] - 12); c.moveTo(a[0], a[1] - 10); c.lineTo(b[0], b[1] - 10); c.stroke();
  c.strokeStyle = '#7a5a3a'; c.lineWidth = 1.2;
  for (let k = 0; k < 4; k++) {
    const p = lerp2(a, b, 0.15 + k * 0.23);
    c.beginPath(); c.moveTo(p[0] - 1, p[1]); c.lineTo(p[0] + 1, p[1] - 20); c.stroke();
    c.fillStyle = '#c8cdd2'; c.fillRect(p[0], p[1] - 23, 1.6, 3);
  }
}

function drawFenceRect(c, x, y, wx, wy) {
  const x0 = x - wx / 2, x1 = x + wx / 2, y0 = y - wy / 2, y1 = y + wy / 2;
  c.strokeStyle = '#7a5a3a'; c.lineWidth = 1.4;
  const post = (px, py) => { const p = P(px, py); c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0], p[1] - 8); c.stroke(); };
  const rail = (ax, ay, bx, by) => { for (const z of [4, 7]) { const a = P(ax, ay, z), b = P(bx, by, z); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); } };
  rail(x0, y0, x1, y0); rail(x0, y0, x0, y1);
  for (let k = 0; k <= Math.round(wx / 0.5); k++) post(x0 + (k / Math.round(wx / 0.5)) * wx, y0);
  for (let k = 1; k <= Math.round(wy / 0.5); k++) post(x0, y0 + (k / Math.round(wy / 0.5)) * wy);
  rail(x1, y0, x1, y1); rail(x0, y1, x1, y1);
  for (let k = 1; k <= Math.round(wy / 0.5); k++) post(x1, y0 + (k / Math.round(wy / 0.5)) * wy);
  for (let k = 0; k < Math.round(wx / 0.5); k++) post(x0 + (k / Math.round(wx / 0.5)) * wx, y1);
}

function drawCrane(c, x, y, phase) {
  const a = P(x - 0.25, y + 0.25), b = P(x + 0.25, y - 0.25), top = P(x, y, 34);
  c.strokeStyle = '#7a5636'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(top[0], top[1]); c.lineTo(b[0], b[1]); c.stroke();
  const tip = [top[0] + 22, top[1] + 4];
  c.beginPath(); c.moveTo(top[0] - 6, top[1] + 2); c.lineTo(tip[0], tip[1]); c.stroke();
  const drop = 14 + Math.sin(G.time * 0.8 + phase) * 9;
  c.strokeStyle = '#d8ccb0'; c.lineWidth = 0.8;
  c.beginPath(); c.moveTo(tip[0], tip[1]); c.lineTo(tip[0], tip[1] + drop); c.stroke();
  c.fillStyle = '#a29d90'; c.strokeStyle = OUTLINE;
  c.fillRect(tip[0] - 3.5, tip[1] + drop, 7, 5); c.strokeRect(tip[0] - 3.5, tip[1] + drop, 7, 5);
  c.fillStyle = '#7a5636'; c.beginPath(); c.arc(a[0] + (b[0] - a[0]) / 2, a[1] - 6, 6, 0, Math.PI * 2); c.lineWidth = 1.4; c.strokeStyle = '#7a5636'; c.stroke();
}

function drawGrave(c, x, y) {
  const [px, py] = P(x, y);
  c.fillStyle = '#8f897c'; c.fillRect(px - 1, py - 8, 2, 8); c.fillRect(px - 3, py - 6, 6, 1.6);
}

function drawBrazier(c, x, y, z) {
  const [px, py] = P(x, y, z);
  c.fillStyle = '#3a3632'; c.fillRect(px - 3, py - 3, 6, 3);
  const f = 1 + Math.sin(G.time * 12 + x) * 0.2;
  c.fillStyle = '#e8762a'; c.beginPath(); c.moveTo(px - 3, py - 3); c.quadraticCurveTo(px, py - 11 * f, px + 3, py - 3); c.fill();
  c.fillStyle = '#ffd25a'; c.beginPath(); c.moveTo(px - 1.5, py - 3); c.quadraticCurveTo(px, py - 7 * f, px + 1.5, py - 3); c.fill();
  if (darkness() > 0.1) addLight(x, y, z + 4, 30, 1);
}

function drawStoneOutcrop(c, x, y, n) {
  const r = mulberry32(Math.round(x * 100 + y));
  for (let k = 0; k < n; k++) {
    const ox = (r() - 0.5) * 1.2, oy = (r() - 0.5) * 0.9;
    drawBox(c, x + ox, y + oy, 0.4 + r() * 0.4, 0.4 + r() * 0.3, 8 + r() * 14, '#9a958a', 0, 'stone');
  }
}

function addCastleBuilding(add, id, L, p, s) {
  switch (id) {
    case 'halle': {
      const wy = [0, 2.2, 2.6, 2.9][L], h = [0, 20, 24, 28][L];
      add(p.x, p.y, (c) => {
        // Gemalt: Holzhalle, ab Stufe 2 der steinerne Palas; das Bild liegt längs zu x, gespiegelt längs zu y
        if (p5(c, L === 1 ? 'burg_holzhalle' : 'burg_palas', p.x, p.y, wy / 2, true)) { if (darkness() > 0.2) addLight(p.x, p.y + 0.3, 14, 30, 0.8); return; }
        drawHouse(c, { x: p.x, y: p.y, wx: 1.2 + L * 0.1, wy, h, rh: 13 + L * 2, wall: L === 1 ? 'timber' : 'stone', roof: L === 1 ? 'thatch' : L === 2 ? 'tile' : 'slate', lit: true, chimney: true, v: 0.75 });
        if (L >= 2) banner(c, p.x + 0.45, p.y + wy / 2 - 0.15, h + 2, playerColor());
      });
      if (L === 3) add(p.x + 0.1, p.y - wy / 2 - 0.35, (c) => { drawBox(c, p.x + 0.1, p.y - wy / 2 - 0.35, 0.8, 0.8, 46, '#ada798', 0, 'stone'); drawPyramid(c, p.x + 0.1, p.y - wy / 2 - 0.35, 0.8, 0.8, 46, 22, ROOFS.slate); banner(c, p.x + 0.1, p.y - wy / 2 - 0.35, 68, '#d6ad4c'); });
      break;
    }
    case 'kaserne': {
      const wx = [0, 2.0, 2.4, 2.6][L];
      add(p.x, p.y, (c) => drawHouse(c, { x: p.x, y: p.y, wx, wy: L === 3 ? 1.2 : 1.0, h: [0, 15, 18, 27][L], rh: 10, wall: L === 1 ? 'wood' : 'stone', roof: L === 3 ? 'tile' : 'wood', lit: true, v: 0.2 }));
      // Übungsplatz vor dem Tor
      const t = { x: s.x - 2.7, y: s.y + 6.5 };
      add(t.x, t.y - 0.6, (c) => drawFenceRect(c, t.x, t.y, 2.0, 1.6));
      add(t.x - 0.5, t.y - 0.3, (c) => drawDummy(c, t.x - 0.5, t.y - 0.3));
      if (L >= 2) { add(t.x + 0.1, t.y - 0.4, (c) => drawDummy(c, t.x + 0.1, t.y - 0.4)); add(t.x + 0.6, t.y + 0.4, (c) => drawTarget(c, t.x + 0.6, t.y + 0.4)); }
      if (L >= 2) add(p.x + 0.4, p.y + 0.85, (c) => drawRack(c, p.x + 0.4, p.y + 0.85));
      if (L === 3) {
        add(t.x - 0.4, t.y + 0.35, (c) => drawWorker(c, t.x - 0.4, t.y + 0.35, 'schwert', 0, { col: '#4d74ad', hat: '#9aa1a6', speed: 6, role: 'soldat' }));
        add(t.x + 0.1, t.y + 0.55, (c) => drawWorker(c, t.x + 0.1, t.y + 0.55, 'schwert', 2.5, { col: '#4d74ad', hat: '#9aa1a6', speed: 6, flip: true, role: 'soldat' }));
      }
      break;
    }
    case 'schmiede': {
      const anvil = { x: p.x + 0.4, y: p.y + 0.95 };
      if (L === 1) {
        add(p.x, p.y, (c) => {
          drawHouse(c, { x: p.x, y: p.y, wx: 1.1, wy: 1.0, h: 13, rh: 9, wall: 'wood', roof: 'thatch', lit: true, v: 0.1 });
          drawBox(c, p.x + 0.75, p.y - 0.1, 0.4, 0.4, 7, '#7d766b', 0, 'stone');
          const g = P(p.x + 0.75, p.y - 0.1, 7); c.fillStyle = '#ff8a2a'; c.fillRect(g[0] - 3, g[1] - 2, 6, 2);
          addLight(p.x + 0.75, p.y - 0.1, 8, 22, 0.9);
        });
      } else {
        const wx = L === 2 ? 1.4 : 1.7, wy = L === 2 ? 1.2 : 1.4;
        add(p.x, p.y, (c) => {
          drawHouse(c, { x: p.x, y: p.y, wx, wy, h: L === 2 ? 16 : 20, rh: 11, wall: 'stone', roof: 'tile', lit: true, v: 0.1 });
          for (let k = 0; k < L - 1; k++) {
            const cx = p.x + 0.3 - k * 0.6, cy = p.y - wy / 2 + 0.2;
            drawBox(c, cx, cy, 0.3, 0.3, 34, '#6d665c', 0, 'stone');
            const sp = P(cx, cy, 34); smokeEmit(sp[0], sp[1], 0.15);
          }
          if (darkness() > 0.1) addLight(p.x + wx / 2, p.y, 8, 30, 1);
        });
        add(p.x + 1.15, p.y - 0.3, (c) => drawRack(c, p.x + 1.15, p.y - 0.3));
      }
      add(anvil.x, anvil.y, (c) => drawAnvil(c, anvil.x, anvil.y, true));
      add(anvil.x + 0.35, anvil.y + 0.15, (c) => { const s2 = drawWorker(c, anvil.x + 0.35, anvil.y + 0.15, 'hammer', 0, { apron: true, col: '#7a6a55', flip: true, speed: 4 }); drawSparks(c, anvil.x, anvil.y, 8, s2); });
      if (L === 3) {
        const a2 = { x: p.x - 0.5, y: p.y + 1.05 };
        add(a2.x, a2.y, (c) => drawAnvil(c, a2.x, a2.y, true));
        add(a2.x - 0.35, a2.y + 0.1, (c) => { const s2 = drawWorker(c, a2.x - 0.35, a2.y + 0.1, 'hammer', 1.7, { apron: true, col: '#6a5a45', speed: 4.5 }); drawSparks(c, a2.x, a2.y, 8, s2); });
      }
      break;
    }
    case 'stall': {
      const wy = [0, 2.0, 2.6, 3.0][L];
      add(p.x, p.y, (c) => {
        drawHouse(c, { x: p.x, y: p.y, wx: 1.1 + L * 0.05, wy, h: 14 + L, rh: 10, wall: L === 3 ? 'stone' : 'wood', roof: 'thatch', lit: false, v: 0.3 });
      });
      const pad = { x: p.x + 1.55 + L * 0.1, y: p.y + 0.2 }, pw = [0, 1.4, 1.8, 2.2][L], ph = [0, 1.6, 2.2, 2.8][L];
      add(pad.x, pad.y - ph / 2, (c) => drawFenceRect(c, pad.x, pad.y, pw, ph));
      const n = [0, 1, 2, 4][L];
      const cols = ['#7a5232', '#b8b0a2', '#2e2925', '#9a6a3a'];
      for (let k = 0; k < n; k++) {
        add(pad.x, pad.y + (k - n / 2) * 0.3, (c) => {
          // Koppelpferde: eine Weile im Schritt die Runde, dann grasen sie (jedes zu seiner Zeit)
          const cyc = 26, walk = 9, tt = G.time + k * 7.3, cyc0 = Math.floor(tt / cyc), inC = tt - cyc0 * cyc;
          const moving = inC < walk;
          const t = (cyc0 * walk + Math.min(inC, walk)) * 0.22 + k * 2.1;
          const ax = pw / 2 - 0.45, ay = ph / 2 - 0.45;
          const hx = pad.x + Math.sin(t) * ax, hy = pad.y + Math.cos(t * 0.8 + k) * ay;
          const dx = Math.cos(t) * ax, dy = -Math.sin(t * 0.8 + k) * 0.8 * ay;
          const [px, py] = P(hx, hy);
          c.save(); c.translate(px, py);
          if (horseReady('pferd')) {
            c.scale(1.14 * FIG, 1.14 * FIG);
            c.fillStyle = 'rgba(25,35,15,0.22)'; c.beginPath(); c.ellipse(0, 0, 16, 6, 0, 0, Math.PI * 2); c.fill();
            drawHorseSprite(c, 'pferd', moving ? 'schritt' : 'grasen', dirIndex(dx, dy), moving ? tt * 0.9 : tt / 3, cols[k % cols.length]);
          } else {
            c.scale(dx - dy >= 0 ? 1 : -1, 1);
            c.fillStyle = 'rgba(25,35,15,0.22)'; c.beginPath(); c.ellipse(3, 0, 13, 4.5, 0, 0, Math.PI * 2); c.fill();
            drawHorse(c, cols[k % cols.length], G.time * 0.6, true, null);
          }
          c.restore();
        });
      }
      if (L >= 2) add(p.x - 0.2, p.y + wy / 2 + 0.4, (c) => drawProp(c, { prop: 'heu', x: p.x - 0.2, y: p.y + wy / 2 + 0.4, v: 0.3 }));
      if (L === 3) add(p.x + 0.4, p.y + wy / 2 + 0.5, (c) => drawProp(c, { prop: 'heu', x: p.x + 0.4, y: p.y + wy / 2 + 0.5, v: 0.6 }));
      break;
    }
    case 'holzfaeller': {
      add(p.x, p.y, (c) => drawHouse(c, { x: p.x, y: p.y, wx: 1.0, wy: 0.9, h: 12, rh: 8, wall: 'wood', roof: 'wood', lit: true, v: 0.9, chimney: true }));
      if (L === 3) add(p.x - 0.4, p.y - 1.4, (c) => drawHouse(c, { x: p.x - 0.4, y: p.y - 1.4, wx: 0.9, wy: 0.9, h: 11, rh: 8, wall: 'wood', roof: 'thatch', lit: true, v: 0.4 }));
      add(p.x + 1.1, p.y + 0.3, (c) => drawLogs(c, p.x + 1.1, p.y + 0.2, [0, 4, 8, 12][L]));
      add(p.x + 0.3, p.y + 1.0, (c) => { drawBox(c, p.x + 0.3, p.y + 1.0, 0.25, 0.25, 5, '#7a5636'); });
      add(p.x + 0.55, p.y + 1.15, (c) => drawWorker(c, p.x + 0.55, p.y + 1.15, 'axt', 0.7, { col: '#5f7a3a', flip: true, speed: 3.5 }));
      if (L >= 2) add(p.x + 1.4, p.y + 1.2, (c) => drawWorker(c, p.x + 1.4, p.y + 1.2, 'axt', 2.2, { col: '#7a5a3a', speed: 3 }));
      if (L >= 2) add(p.x - 0.4, p.y + 1.0, (c) => drawProp(c, { prop: 'karren', x: p.x - 0.4, y: p.y + 1.0, v: 0.1 }));
      break;
    }
    case 'steinbruch': {
      add(p.x, p.y, (c) => {
        if (L === 1) drawStoneOutcrop(c, p.x, p.y, 4);
        else {
          drawBox(c, p.x, p.y, 2.0, 1.6, 6, '#8f897c', 0, 'stone');
          drawBox(c, p.x - 0.3, p.y - 0.3, 1.4, 1.0, 10, '#9a958a', 6, 'stone');
          if (L === 3) drawBox(c, p.x - 0.5, p.y - 0.45, 0.9, 0.6, 9, '#a39e92', 16, 'stone');
        }
      });
      add(p.x + 1.2, p.y + 0.6, (c) => drawStones(c, p.x + 1.2, p.y + 0.6, [0, 4, 8, 12][L]));
      add(p.x + 0.4, p.y + 1.1, (c) => drawWorker(c, p.x + 0.4, p.y + 1.1, 'hacke', 0.3, { col: '#8a7a64', speed: 3.6 }));
      if (L >= 2) add(p.x + 1.3, p.y - 0.6, (c) => drawCrane(c, p.x + 1.3, p.y - 0.6, 0));
      if (L >= 2) add(p.x - 0.7, p.y + 1.0, (c) => drawWorker(c, p.x - 0.7, p.y + 1.0, 'hammer', 1.4, { col: '#6e6458', flip: true, speed: 4 }));
      if (L === 3) { add(p.x - 1.1, p.y - 0.4, (c) => drawCrane(c, p.x - 1.1, p.y - 0.4, 2)); add(p.x + 1.8, p.y + 1.3, (c) => drawProp(c, { prop: 'karren', x: p.x + 1.8, y: p.y + 1.3, v: 0.1 })); }
      break;
    }
    case 'markt': {
      const cols = ['#a33b32', '#3d6fa3', '#d6ad4c', '#5b8a3c', '#e8e0cc', '#7d2a52'];
      const n = [0, 2, 4, 6][L];
      for (let k = 0; k < n; k++) {
        const x = p.x - 0.9 + (k % 3) * 0.95, y = p.y - 0.6 + Math.floor(k / 3) * 1.25;
        add(x, y, (c) => drawStall(c, { x, y, color: cols[k % cols.length] }));
        if (L >= 2 && k % 2 === 0) add(x + 0.1, y + 0.55, (c) => drawWorker(c, x + 0.1, y + 0.55, null, k, { col: cols[(k + 2) % cols.length], speed: 1, role: 'buerger', act: 'verkaufen' }));
      }
      if (L >= 2) add(p.x + 1.8, p.y + 0.3, (c) => drawWell(c, { x: p.x + 1.8, y: p.y + 0.3 }));
      if (L === 3) add(p.x + 0.1, p.y + 0.15, (c) => { drawBox(c, p.x + 0.1, p.y + 0.15, 0.4, 0.4, 6, '#9a958a', 0, 'stone'); drawBox(c, p.x + 0.1, p.y + 0.15, 0.14, 0.14, 26, '#a8a296', 6); const tp = P(p.x + 0.1, p.y + 0.15, 32); c.fillStyle = '#a8a296'; c.fillRect(tp[0] - 4, tp[1] - 2, 8, 2); });
      break;
    }
    case 'kapelle': {
      if (L === 1) {
        add(p.x, p.y, (c) => {
          drawHouse(c, { x: p.x, y: p.y, wx: 1.6, wy: 1.0, h: 15, rh: 12, wall: 'wood', roof: 'thatch', lit: true, v: 0.05 });
          const t = P(p.x + 0.8, p.y, 28); c.fillStyle = '#d6ad4c'; c.fillRect(t[0] - 0.8, t[1] - 8, 1.6, 8); c.fillRect(t[0] - 3, t[1] - 6, 6, 1.5);
        });
      } else {
        add(p.x, p.y, (c) => drawChurch(c, { x: p.x, y: p.y, wx: L === 2 ? 2.0 : 2.6, wy: L === 2 ? 1.0 : 1.2, h: L === 2 ? 22 : 28, abbey: L === 3 }));
      }
      if (L === 3) for (let k = 0; k < 6; k++) { const gx = p.x - 1.0 + (k % 3) * 0.45, gy = p.y + 1.1 + Math.floor(k / 3) * 0.4; add(gx, gy, (c) => drawGrave(c, gx, gy)); }
      if (L >= 2) add(p.x - 1.4, p.y + 0.9, (c) => drawProp(c, { prop: 'beet', x: p.x - 1.4, y: p.y + 0.9, v: 0.2 }));
      break;
    }
    default: break;
  }
}

// Acker als flache Fläche: Furchen und Feldfrucht je nach Jahreszeit
// Gemalte Saat in Reihen je Jahreszeit: Furchen, junge Saat, halbhohes und reifes Korn, Winterfurchen;
// nach der Ernte im Herbst Garben. Fehlt die y-Fassung, nimmt es das gespiegelte x-Bild.
function fieldSprite(ori) {
  const st = fieldStage(), se = lookSeason();
  const base = st === 'acker_winter' ? 'feld_winter' : st === 'acker_reif' ? 'feld_reif' : st === 'acker_jung' ? (se === 1 ? 'feld_hoch' : 'feld_jung') : 'feld_brach';
  return ART[`${base}_${ori}`] ? [`${base}_${ori}`, false] : [`${base}_x`, ori === 'y'];
}
const harvestTime = () => lookSeason() === 2 && fieldStage() === 'acker_brach';
function drawFieldObj(c, o) {
  const [id, flip] = fieldSprite(o.ori);
  p5(c, id, o.x, o.y, 1, flip);
  if (harvestTime() && o.v < 0.32) p5(c, o.v < 0.16 ? 'garben_1' : 'garben_2', o.x + (o.v - 0.16) * 2, o.y + 0.1, 1);
}

function drawCropField(c, f) {
  const se = seasonIndex();
  const x0 = f.x - f.wx / 2, x1 = f.x + f.wx / 2, y0 = f.y - f.wy / 2, y1 = f.y + f.wy / 2;
  poly(c, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], se === 3 ? '#e4e9e8' : '#7a5a38');
  // Gemalt: die Fläche in Zellen von etwa einem Feld, je Zelle ein Saatbild
  if (ART.feld_brach_x) {
    const nx = Math.max(1, Math.round(f.wx)), ny = Math.max(1, Math.round(f.wy)), cw = f.wx / nx, ch = f.wy / ny;
    const ori = f.wx >= f.wy ? 'x' : 'y', [id, flip] = fieldSprite(ori);
    for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++) p5(c, id, x0 + (a + 0.5) * cw, y0 + (b + 0.5) * ch, Math.min(cw, ch), flip);
    if (harvestTime()) { const r = mulberry32(Math.round(f.x * 31 + f.y * 17)); for (let k = 0; k < 3; k++) p5(c, k % 2 ? 'garben_1' : 'garben_2', x0 + 0.3 + r() * (f.wx - 0.6), y0 + 0.3 + r() * (f.wy - 0.6)); }
    return;
  }
  const crop = [['#8fc256', 2.0], ['#c8b648', 2.8], ['#dcae3e', 3.2], ['#b9c0bf', 1.2]][se];
  c.strokeStyle = crop[0]; c.lineWidth = crop[1];
  const along = f.wx >= f.wy;
  const n = Math.round((along ? f.wy : f.wx) / 0.22);
  c.beginPath();
  for (let k = 0; k <= n; k++) {
    const t = (k + 0.5) / (n + 1);
    const a = along ? P(x0 + 0.06, y0 + t * f.wy) : P(x0 + t * f.wx, y0 + 0.06);
    const b = along ? P(x1 - 0.06, y0 + t * f.wy) : P(x0 + t * f.wx, y1 - 0.06);
    c.moveTo(a[0], a[1] - (se === 2 ? 1.5 : 0.5)); c.lineTo(b[0], b[1] - (se === 2 ? 1.5 : 0.5));
  }
  c.stroke();
  // Im Herbst stehen Garben auf dem Feld
  if (se === 2) {
    const r = mulberry32(Math.round(f.x * 31 + f.y * 17));
    for (let k = 0; k < 3; k++) {
      const p = P(x0 + 0.3 + r() * (f.wx - 0.6), y0 + 0.3 + r() * (f.wy - 0.6));
      c.fillStyle = '#e8c15a'; c.strokeStyle = '#9a7a2a'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(p[0] - 3.5, p[1]); c.lineTo(p[0], p[1] - 9); c.lineTo(p[0] + 3.5, p[1]); c.closePath(); c.fill(); c.stroke();
    }
  }
}

function drawScarecrow(c, x, y) {
  const [px, py] = P(x, y);
  c.strokeStyle = '#5a4030'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 20); c.moveTo(px - 7, py - 14); c.lineTo(px + 7, py - 14); c.stroke();
  c.fillStyle = '#8a5a3a'; c.fillRect(px - 3.5, py - 15, 7, 7);
  c.fillStyle = '#d8c48a'; c.beginPath(); c.arc(px, py - 19, 2.8, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#5a4a2a'; c.beginPath(); c.moveTo(px - 5, py - 20); c.lineTo(px + 5, py - 20); c.lineTo(px, py - 25); c.closePath(); c.fill();
}

// Bockwindmühle mit drehenden Flügeln
function drawWindmill(c, x, y) {
  drawShadow(c, x, y, 0.8, 0.8, 50);
  drawBox(c, x, y, 0.22, 0.22, 12, '#5a4030');
  drawBox(c, x, y, 0.75, 0.62, 22, '#a07a50', 12, 'plank');
  drawGableRoof(c, x, y, 0.75, 0.62, 34, 10, ROOFS.wood, '#8a6440', true);
  const hub = P(x + 0.4, y + 0.05, 26);
  const a0 = G.time * 0.9;
  for (let k = 0; k < 4; k++) {
    const a = a0 + k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    const px = -sa, py = ca;
    const q = (r, w) => [hub[0] + ca * r + px * w, hub[1] + sa * r * 0.9 + py * w];
    poly(c, [q(5, 0), q(24, 0), q(24, 5), q(5, 5)], 'rgba(236,226,200,0.92)');
    c.strokeStyle = '#4a3322'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(hub[0], hub[1]); const e = q(25, 0); c.lineTo(e[0], e[1]); c.stroke();
  }
  c.fillStyle = '#3a2a1a'; c.beginPath(); c.arc(hub[0], hub[1], 2, 0, Math.PI * 2); c.fill();
}

// Zaun als hintere und vordere Hälfte, damit Tiere dazwischen stehen können
function drawFenceHalf(c, x, y, wx, wy, front) {
  const x0 = x - wx / 2, x1 = x + wx / 2, y0 = y - wy / 2, y1 = y + wy / 2;
  c.strokeStyle = '#7a5a3a'; c.lineWidth = 1.4;
  const post = (px, py) => { const p = P(px, py); c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0], p[1] - 8); c.stroke(); };
  const side = (ax, ay, bx, by) => {
    for (const z of [3.5, 6.5]) { const a = P(ax, ay, z), b = P(bx, by, z); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 0.5));
    for (let k = 0; k <= n; k++) post(ax + (bx - ax) * k / n, ay + (by - ay) * k / n);
  };
  if (front) { side(x1, y0, x1, y1); side(x0, y1, x1, y1); }
  else { side(x0, y0, x1, y0); side(x0, y0, x0, y1); }
}

function drawWoolBales(c, x, y, n) {
  for (let k = 0; k < n; k++) {
    const p = P(x + (k % 2) * 0.28, y + Math.floor(k / 2) * 0.22, Math.floor(k / 4) * 6);
    c.fillStyle = '#efe8d6'; c.strokeStyle = 'rgba(90,70,50,0.6)'; c.lineWidth = 0.8;
    c.beginPath(); c.ellipse(p[0], p[1] - 3.5, 6, 4, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = '#a08860'; c.beginPath(); c.moveTo(p[0] - 1, p[1] - 7.5); c.lineTo(p[0] - 1, p[1] + 0.5); c.stroke();
  }
}

// Feste Lage der Äcker um die Burg: nicht auf Straßen, Wasser, Häusern oder Bauplätzen
export function fieldSpots(s) {
  if (s.fieldSpots) return s.fieldSpots;
  const W = G.world;
  const r = mulberry32(W.seed + 4711);
  const fp = { x: s.x + CASTLE_LAYOUT.felder.dx, y: s.y + CASTLE_LAYOUT.felder.dy };
  const avoid = Object.entries(CASTLE_LAYOUT).filter(([id]) => id !== 'felder').map(([id, o]) => ({ x: s.x + o.dx, y: s.y + o.dy, r: Math.max(...PLOT[id]) / 2 + 1.4 }));
  avoid.push({ x: fp.x, y: fp.y, r: 1.6 });
  for (const b of villageSpots(s)) avoid.push({ x: b.x, y: b.y, r: 1.5 });
  for (const [dx, dy] of TOWER_SPOTS) avoid.push({ x: s.x + dx, y: s.y + dy, r: 1.6 });
  // Übungsplatz der Unterkunft und Pferdekoppel des Stalls (größte Ausbaustufe)
  avoid.push({ x: s.x - 2.7, y: s.y + 6.5, r: 1.3 });
  avoid.push({ x: s.x + CASTLE_LAYOUT.stall.dx + 1.85, y: s.y + CASTLE_LAYOUT.stall.dy + 0.2, r: 1.5 });
  const cand = [];
  for (let k = 0; k < 900; k++) {
    const a = r() * Math.PI * 2, d = 6.5 + r() * 5;
    const wide = r() < 0.5;
    const f = { x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d, wx: wide ? 2.1 : 1.4, wy: wide ? 1.4 : 2.1 };
    if (Math.hypot(f.x - s.x, f.y - s.y) < 6) continue;
    let ok = true;
    for (let ty = Math.floor(f.y - f.wy / 2); ty <= Math.floor(f.y + f.wy / 2) && ok; ty++) for (let tx = Math.floor(f.x - f.wx / 2); tx <= Math.floor(f.x + f.wx / 2); tx++) {
      const t = tileAt(W, tx + 0.5, ty + 0.5);
      if (t === T.WATER || t === T.ROAD || t === T.BRIDGE || t === T.FOREST || t === T.FIELD) { ok = false; break; }
    }
    if (!ok) continue;
    if (avoid.some((o) => Math.abs(o.x - f.x) < o.r + f.wx / 2 && Math.abs(o.y - f.y) < o.r + f.wy / 2)) continue;
    cand.push(f);
  }
  cand.sort((p, q) => Math.hypot(p.x - fp.x, p.y - fp.y) - Math.hypot(q.x - fp.x, q.y - fp.y));
  const spots = [];
  for (const f of cand) {
    if (spots.some((o) => Math.abs(o.x - f.x) < (o.wx + f.wx) / 2 + 0.35 && Math.abs(o.y - f.y) < (o.wy + f.wy) / 2 + 0.35)) continue;
    spots.push(f);
    if (spots.length >= 6) break;
  }
  s.fieldSpots = spots;
  return spots;
}

function addNewCastleBuilding(add, addFlat, id, L, p, s) {
  switch (id) {
    case 'hospiz': {
      const house = [null,
        { x: p.x + 0.2, y: p.y - 0.3, wx: 1.3, wy: 1.1, h: 13, rh: 10, wall: 'timber', roof: 'thatch', lit: true, chimney: true, v: 0.35 },
        { x: p.x + 0.3, y: p.y - 0.2, wx: 1.2, wy: 2.0, h: 16, rh: 12, wall: 'plaster', roof: 'tile', lit: true, chimney: true, v: 0.15 },
        { x: p.x + 0.3, y: p.y - 0.2, wx: 1.4, wy: 2.3, h: 22, rh: 13, wall: 'stone', roof: 'slate', lit: true, chimney: true, v: 0.2 }][L];
      add(house.x, house.y, (c) => {
        drawHouse(c, house);
        if (L === 3) { const tx = house.x, ty = house.y - house.wy / 2 + 0.25; drawBox(c, tx, ty, 0.36, 0.36, 12, '#b2ab9c', house.h + 8, 'stone'); drawPyramid(c, tx, ty, 0.36, 0.36, house.h + 20, 9, ROOFS.slate); }
      });
      const beds = [0, 2, 3, 4][L];
      for (let k = 0; k < beds; k++) {
        const bx = p.x - 0.75 + (k % 2) * 0.7, by = p.y + 0.55 + Math.floor(k / 2) * 0.55;
        add(bx, by, (c) => drawProp(c, { prop: 'beet', x: bx, y: by, v: 0.2 + k * 0.2 }));
      }
      if (L >= 2) add(p.x - 1.0, p.y - 1.05, (c) => drawWell(c, { x: p.x - 1.0, y: p.y - 1.05 }));
      add(p.x - 0.4, p.y + 1.15, (c) => drawWorker(c, p.x - 0.4, p.y + 1.15, null, 0.8, { col: '#6a5240', hat: '#e8e0cc', speed: 1.2, role: 'moench', act: 'segnen' }));
      if (L === 3) add(p.x + 0.4, p.y + 1.2, (c) => drawWorker(c, p.x + 0.4, p.y + 1.2, null, 2.4, { col: '#e8e0cc', hat: '#e8e0cc', speed: 1, flip: true, role: 'moench' }));
      break;
    }
    case 'schafzucht': {
      const pa = castlePasture(s);
      if (pa) {
        addFlat(pa.x - pa.w / 2, pa.y - pa.h / 2, (c) => drawFenceHalf(c, pa.x, pa.y, pa.w, pa.h, false));
        add(pa.x + pa.w / 2, pa.y + pa.h / 2, (c) => drawFenceHalf(c, pa.x, pa.y, pa.w, pa.h, true));
      }
      // Hütte und Scherschuppen hinter dem Weidezaun (nicht darin)
      const hut = L === 3
        ? { x: p.x - 1.2, y: p.y - 1.55, wx: 1.0, wy: 0.9, h: 12, rh: 9, wall: 'stone', roof: 'slate', lit: true, v: 0.6 }
        : { x: p.x - 1.2, y: p.y - 1.55, wx: 0.85, wy: 0.75, h: 10, rh: 9, wall: 'wood', roof: 'thatch', lit: true, v: 0.6 };
      add(hut.x, hut.y, (c) => drawHouse(c, hut));
      if (L >= 2) add(p.x + 1.5, p.y - 1.55, (c) => {
        // Scherschuppen: offenes Dach auf Pfosten
        for (const [dx, dy] of [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]]) drawBox(c, p.x + 1.5 + dx, p.y - 1.55 + dy, 0.08, 0.08, 12, '#6b4a2e');
        drawGableRoof(c, p.x + 1.5, p.y - 1.55, 0.9, 0.8, 12, 7, ROOFS.thatch, '#8a6a40', true);
      });
      if (L >= 2) add(p.x + 2.4, p.y - 0.85, (c) => drawWoolBales(c, p.x + 2.4, p.y - 0.85, L === 3 ? 6 : 3));
      add(p.x - 1.3, p.y + 0.4, (c) => drawWorker(c, p.x - 1.3, p.y + 0.4, null, 1.7, { col: '#7d6a55', hat: '#5a4a35', speed: 0.8, role: 'hirte', staff: true }));
      break;
    }
    case 'felder': {
      const spots = fieldSpots(s).slice(0, [0, 2, 4, 6][L]);
      spots.forEach((f, k) => {
        addFlat(f.x - f.wx / 2, f.y - f.wy / 2, (c) => drawCropField(c, f));
        if (k % 2 === 0 && seasonIndex() < 3) add(f.x + 0.2, f.y + 0.2, (c) => drawWorker(c, f.x + 0.2, f.y + 0.2, 'hacke', k * 1.3, { col: '#8a7a55', hat: '#c9b06a', speed: 2.2, flip: k % 4 === 0 }));
      });
      if (spots[0]) add(spots[0].x - 0.4, spots[0].y - 0.3, (c) => drawScarecrow(c, spots[0].x - 0.4, spots[0].y - 0.3));
      if (L === 1) add(p.x, p.y, (c) => { drawHouse(c, { x: p.x, y: p.y, wx: 0.8, wy: 0.7, h: 9, rh: 8, wall: 'wood', roof: 'thatch', lit: false, v: 0.4 }); });
      if (L >= 2) add(p.x - 0.1, p.y - 0.1, (c) => drawHouse(c, { x: p.x - 0.1, y: p.y - 0.1, wx: 1.1, wy: 1.6, h: 14, rh: 14, wall: 'wood', roof: 'thatch', lit: false, v: 0.7 }));
      if (L >= 2) add(p.x + 0.9, p.y + 0.6, (c) => drawProp(c, { prop: 'heu', x: p.x + 0.9, y: p.y + 0.6, v: 0.4 }));
      if (L === 3) add(p.x + 1.3, p.y - 0.9, (c) => drawWindmill(c, p.x + 1.3, p.y - 0.9));
      break;
    }
    default: break;
  }
}

function addTower(add, s, k, L) {
  const x = s.x + TOWER_SPOTS[k][0], y = s.y + TOWER_SPOTS[k][1];
  const stone = L >= 2;
  const h = stone ? 52 : 44;
  add(x, y, (c) => {
    drawShadow(c, x, y, 0.9, 0.9, h + 10);
    drawBox(c, x, y, 0.9, 0.9, h, stone ? '#a5a092' : '#8a6440', 0, stone ? 'stone' : 'plank');
    faceQuad(c, x, y, 0.9, 0.9, 'L', 0.4, 0.6, h * 0.55, h * 0.7, '#2c2622');
    if (stone) drawMerlons(c, x, y, 0.9, 0.9, h, '#a5a092');
    else { drawBox(c, x, y, 1.1, 1.1, 3, '#6e5236', h); }
    drawWorker(c, x + 0.1, y + 0.1, null, k, { z: h + (stone ? 0 : 3), col: '#4d74ad', hat: '#9aa1a6', speed: 0.5, role: 'wache' });
    if (L >= 3 || (stone && k === 0)) drawBrazier(c, x - 0.25, y - 0.25, h + 2);
  });
}

function buildPlayerCastle() {
  const s = G.world.sites.find((x) => x.type === 'spieler');
  const C = G.s.castle;
  const parts = castlePieces(s, C.level, playerColor());
  const z0 = groundZ(G.world, s.x, s.y);
  const add = (x, y, f) => parts.push({ x, y, d: x + y, z: z0, f });
  // Flache Dinge (Äcker, hintere Zäune) liegen unter allem, was auf ihnen steht
  const addFlat = (x, y, f) => parts.push({ x, y, d: x + y - 0.5, z: z0, f });
  const lv = (id) => C.b[id] || 0;
  const pos = (id) => ({ x: s.x + CASTLE_LAYOUT[id].dx, y: s.y + CASTLE_LAYOUT[id].dy });
  const con = C.construction;
  castleAnchors = [{ id: 'burg', castle: true, x: s.x - 1, y: s.y - 1, h: 90, label: `Burg ${homeName()} · ${BUILDINGS.burg.levels[C.level].name}${con && con.id === 'burg' ? ' (Ausbau läuft)' : ''}` }];

  for (const id of ['halle', 'kaserne', 'schmiede', 'stall', 'holzfaeller', 'steinbruch', 'markt', 'kapelle', 'hospiz', 'schafzucht', 'felder']) {
    const L = lv(id), p = pos(id), building = con && con.id === id;
    const [pw, ph] = PLOT[id];
    const signAt = { x: p.x - pw / 2 - 0.25, y: p.y + ph / 2 + 0.15 };
    const name = BUILDINGS[id].name;
    if (!L && !building) {
      add(p.x - 0.5, p.y - 0.5, (c) => drawPlot(c, p.x, p.y, pw, ph));
      add(signAt.x, signAt.y, (c) => drawSign(c, signAt.x, signAt.y, BUILD_ICON[id], true));
      castleAnchors.push({ id, castle: true, plot: true, x: p.x, y: p.y, h: 20, label: `Bauplatz: ${name}` });
      continue;
    }
    if (L) { addCastleBuilding(add, id, L, p, s); addNewCastleBuilding(add, addFlat, id, L, p, s); }
    if (building) addConstruction(add, id, p, L);
    add(signAt.x, signAt.y, (c) => drawSign(c, signAt.x, signAt.y, BUILD_ICON[id], false));
    castleAnchors.push({ id, castle: true, x: p.x, y: p.y, h: 40, label: `${name} · Stufe ${L}${building ? ` (Ausbau auf Stufe ${con.level} läuft)` : ''}` });
  }

  // Wachtürme
  const WE = lv('wehr');
  for (let k = 0; k < WE; k++) addTower(add, s, k, WE);
  const nextT = con && con.id === 'wehr' ? con.level - 1 : WE;
  if (nextT < 3) {
    const tx = s.x + TOWER_SPOTS[nextT][0], ty = s.y + TOWER_SPOTS[nextT][1];
    if (con && con.id === 'wehr') addConstruction(add, 'wehr', { x: tx, y: ty }, 0);
    else { add(tx - 0.3, ty - 0.3, (c) => drawPlot(c, tx, ty, 1.0, 1.0)); add(tx - 0.7, ty + 0.65, (c) => drawSign(c, tx - 0.7, ty + 0.65, 'turm', true)); }
    castleAnchors.push({ id: 'wehr', castle: true, plot: true, x: tx, y: ty, h: 30, label: con && con.id === 'wehr' ? `Wachturm im Bau` : 'Bauplatz: Wachturm' });
  }
  for (let k = 0; k < WE; k++) castleAnchors.push({ id: 'wehr', castle: true, x: s.x + TOWER_SPOTS[k][0], y: s.y + TOWER_SPOTS[k][1], h: 60, label: `Wachturm · Stufe ${WE}` });

  // Burgsiedlung
  const spots = villageSpots(s);
  const n = [0, 2, 5, 9][C.level];
  for (let k = 0; k < Math.min(n, spots.length); k++) {
    const b = spots[k];
    parts.push({ x: b.x, y: b.y, d: b.x + b.y, z: groundZ(G.world, b.x, b.y), f: (c) => drawHouse(c, b) });
    if (b.prop) parts.push({ x: b.prop.x, y: b.prop.y, d: b.prop.x + b.prop.y, z: groundZ(G.world, b.prop.x, b.prop.y), f: (c) => drawProp(c, b.prop) });
  }

  // Burg im Ausbau
  if (con && con.id === 'burg') {
    const R = 4;
    if (con.level === 1) {
      // Die Palisade wächst Stück für Stück
      const sides = [];
      for (let k = -R; k < R; k++) {
        sides.push({ x: s.x + k + 0.5, y: s.y - R, along: 'x' }, { x: s.x - R, y: s.y + k + 0.5, along: 'y' });
        if (k !== -1 && k !== 0) sides.push({ x: s.x + k + 0.5, y: s.y + R, along: 'x' });
        sides.push({ x: s.x + R, y: s.y + k + 0.5, along: 'y' });
      }
      sides.forEach((sd, i) => add(sd.x, sd.y, (c) => {
        if (i / sides.length > conProgress()) return;
        for (let k = -1; k <= 1; k++) {
          const px = sd.along === 'x' ? sd.x + k * 0.33 : sd.x, py = sd.along === 'y' ? sd.y + k * 0.33 : sd.y;
          drawBox(c, px, py, 0.24, 0.24, 24, '#9a7450'); drawPyramid(c, px, py, 0.24, 0.24, 24, 6, '#9a7450');
        }
      }));
    } else {
      // Steinerne Türme wachsen im Gerüst
      const spots = con.level === 2 ? [[-R, -R], [R, -R], [-R, R], [R, R]] : [[0, -R], [-R, 0], [-1.1, -1.1]];
      for (const [dx, dy] of spots) {
        const x = s.x + dx, y = s.y + dy, keep = dx === -1.1;
        add(x, y + 0.2, (c) => {
          const pr = conProgress();
          const w = keep ? 3.0 : 1.4;
          const h = keep ? 76 + 26 * pr : 6 + (con.level === 2 ? 44 : 50) * pr;
          if (!keep) drawBox(c, x, y, w, w, h, '#a5a092', 0, 'stone');
          drawScaffold(c, x, y, w + 0.3, w + 0.3, h + 10);
        });
      }
    }
    add(s.x + 1.6, s.y + 5.4, (c) => drawLogs(c, s.x + 1.6, s.y + 5.2, 6));
    add(s.x - 1.8, s.y + 5.4, (c) => drawStones(c, s.x - 1.8, s.y + 5.4, 9));
    for (let k = 0; k < 3; k++) {
      const wx = s.x + [-3.3, 3.3, 3.6][k], wy = s.y + [4.7, 4.7, -3.2][k];
      add(wx, wy, (c) => drawWorker(c, wx, wy, 'hammer', k * 1.3, { col: '#8a6e4b', flip: k === 1, speed: 4.5 }));
    }
  }
  return parts;
}

function addConstruction(add, id, p, L) {
  const [pw, ph] = PLOT[id];
  const full = id === 'wehr' ? 46 : 24;
  const tex = STONE_BUILDINGS[id] ? 'stone' : 'plank';
  add(p.x, p.y, (c) => {
    const prog = conProgress();
    if (!L) {
      drawPlot(c, p.x, p.y, pw, ph);
      drawBox(c, p.x, p.y, pw * 0.8, ph * 0.8, 4, '#8f897c', 0, 'stone');
      const hh = full * Math.min(1, prog * 1.1);
      if (hh > 3) drawBox(c, p.x, p.y, pw * 0.72, ph * 0.72, hh, STONE_BUILDINGS[id] ? '#a5a092' : '#93704a', 4, tex);
    }
    drawScaffold(c, p.x, p.y, pw * 0.85, ph * 0.85, (L ? 30 : full) + 6);
  });
  add(p.x - pw / 2 - 0.5, p.y + 0.3, (c) => drawLogs(c, p.x - pw / 2 - 0.5, p.y + 0.1, 3));
  add(p.x + pw / 2 + 0.5, p.y + ph / 2 + 0.2, (c) => { const s2 = drawWorker(c, p.x + pw / 2 + 0.5, p.y + ph / 2 + 0.2, 'hammer', 0.5, { col: '#8a6e4b', flip: true, speed: 4.5 }); if (s2 > 0.95) { const d = P(p.x + pw / 2 + 0.2, p.y + ph / 2, 4); smokeEmit(d[0], d[1], 0.5); } });
  add(p.x - 0.2, p.y + ph / 2 + 0.45, (c) => drawWorker(c, p.x - 0.2, p.y + ph / 2 + 0.45, 'hammer', 2.1, { col: '#6f7a55', speed: 4 }));
}

// Feste Bauplätze für die Häuser der Burgsiedlung
// Name eines Burggebäudes unter dem Mauszeiger
let landmarkAnchors = null, landmarkWorld = null;
export function buildingAtScreen(px, py) {
  if (!G.world || !G.s) return null;
  if (landmarkWorld !== G.world) {
    landmarkWorld = G.world;
    landmarkAnchors = G.world.buildings.filter((b) => b.label).map((b) => ({ x: b.x, y: b.y, h: b.lm === 'tor' ? 90 : b.lm === 'kathedrale' ? 80 : b.kind === 'stonehenge' ? 24 : 70, label: b.label }));
  }
  let best = null, bd = Infinity;
  for (const a of castleAnchors.concat(landmarkAnchors)) {
    const sp = toScreen(a.x, a.y);
    const dx = Math.abs(px - sp.x), dy = sp.y - py;
    if (dx > 38 * G.cam.zoom || dy < -12 * G.cam.zoom || dy > (a.h + 14) * G.cam.zoom) continue;
    const d = dx + Math.abs(dy - a.h * 0.4 * G.cam.zoom) * 0.5;
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

function drawCelebration(c, dt) {
  const ce = G.celebrate;
  if (ce && G.time - ce.t0 < 45 && G.world) {
    const s = G.world.sites.find((x) => x.type === 'spieler');
    let px = s.x - 1, py = s.y - 1;
    if (ce.x !== undefined) { px = ce.x; py = ce.y; }
    else if (ce.id === 'wehr') { px = s.x + TOWER_SPOTS[ce.level - 1][0]; py = s.y + TOWER_SPOTS[ce.level - 1][1]; }
    else if (ce.id !== 'burg') { px = s.x + CASTLE_LAYOUT[ce.id].dx; py = s.y + CASTLE_LAYOUT[ce.id].dy; }
    const sp = toScreen(px, py);
    const z = G.cam.zoom;
    if (sparkles.length < 140) for (let k = 0; k < 3; k++) sparkles.push({ x: sp.x + (Math.random() - 0.5) * 90 * z, y: sp.y - Math.random() * 40 * z, vy: -20 - Math.random() * 30, life: 0, max: 1.2 + Math.random() * 1.2 });
    const label = ce.label || `Fertig: ${ce.id === 'burg' ? BUILDINGS.burg.levels[ce.level].name : `${BUILDINGS[ce.id].name} Stufe ${ce.level}`}`;
    c.font = `600 ${Math.round(15 + z * 2)}px "IM Fell English SC", Georgia, serif`;
    c.textAlign = 'center';
    const tw = c.measureText(label).width;
    const yy = sp.y - (ce.id === 'burg' ? 150 : 80) * z - Math.sin(G.time * 2) * 3;
    const fade = Math.min(1, (45 - (G.time - ce.t0)) / 3);
    c.globalAlpha = fade;
    c.fillStyle = 'rgba(28,20,14,0.85)'; c.fillRect(sp.x - tw / 2 - 12, yy - 17, tw + 24, 24);
    c.strokeStyle = '#d6ad4c'; c.lineWidth = 1.5; c.strokeRect(sp.x - tw / 2 - 12, yy - 17, tw + 24, 24);
    c.fillStyle = '#ffe9a8'; c.fillText(label, sp.x, yy);
    c.globalAlpha = 1;
  }
  for (let i = sparkles.length - 1; i >= 0; i--) {
    const p = sparkles[i];
    p.life += dt; p.y += p.vy * dt;
    if (p.life > p.max) { sparkles.splice(i, 1); continue; }
    c.fillStyle = `rgba(255,${200 + Math.floor(Math.random() * 55)},90,${1 - p.life / p.max})`;
    c.fillRect(p.x, p.y, 2.4, 2.4);
  }
}

function drawHorseStanding(c, x, y, col) {
  const [px, py] = P(x, y, 0);
  c.save(); c.translate(px, py); c.scale(1.1 * FIG, 1.1 * FIG);
  c.fillStyle = 'rgba(25,35,15,0.22)'; c.beginPath(); c.ellipse(3, 0, 13, 4.5, 0, 0, Math.PI * 2); c.fill();
  drawHorse(c, col, 0, false, null);
  c.restore();
}

// ---------------------------------------------------------------- Bäume, Büsche, Felsen
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function makeDeciduous(season, v) {
  const w = 64, h = 84;
  const cv = makeCanvas(w * SPR, h * SPR), g = cv.getContext('2d'); g.scale(SPR, SPR);
  const r = mulberry32(1000 + v * 17);
  g.fillStyle = '#5a4030';
  g.fillRect(w / 2 - 3, h - 30, 6, 28);
  g.fillStyle = '#6e5038'; g.fillRect(w / 2 - 3, h - 30, 2, 28);
  if (season >= 3) {
    g.strokeStyle = '#4d3a2c'; g.lineCap = 'round';
    const branch = (x, y, a, len, wd) => {
      if (len < 4) return;
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      g.lineWidth = wd; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      branch(x2, y2, a - 0.45 - r() * 0.3, len * 0.7, wd * 0.7);
      branch(x2, y2, a + 0.45 + r() * 0.3, len * 0.7, wd * 0.7);
    };
    branch(w / 2, h - 28, -Math.PI / 2, 16, 4);
    g.fillStyle = 'rgba(250,252,252,0.9)';
    if (season === 3) for (let k = 0; k < 12; k++) g.fillRect(w / 2 - 16 + r() * 32, 14 + r() * 30, 3, 1.5);
    return { cvs: cv, ax: w / 2, ay: h - 3, k: 1 / SPR };
  }
  const sets = [
    ['#4f8a34', '#6aa344', '#94c862', '#35612a'],
    ['#3f7a2c', '#53923a', '#79b452', '#2c5520'],
    v === 1 ? ['#9c3f22', '#c25a2c', '#eb9a50', '#6e2a18'] : v === 2 ? ['#a8761f', '#d09a2e', '#f2cc66', '#7a5418'] : ['#7a6a26', '#a88a2e', '#d6b850', '#5a4c1c'],
  ][season];
  const cx = w / 2, cy = 32;
  const blobs = [];
  for (let k = 0; k < 10; k++) {
    const a = r() * Math.PI * 2, d = r() * 11;
    blobs.push([cx + Math.cos(a) * d * 1.25, cy + Math.sin(a) * d * 0.85, 9 + r() * 6]);
  }
  g.fillStyle = 'rgba(28,30,12,0.65)';
  for (const [x, y, rr] of blobs) { g.beginPath(); g.arc(x + 1, y + 2, rr + 1.3, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = sets[3];
  for (const [x, y, rr] of blobs) { g.beginPath(); g.arc(x + 1.5, y + 2.5, rr, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = sets[0];
  for (const [x, y, rr] of blobs) { g.beginPath(); g.arc(x, y, rr * 0.92, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = sets[1];
  for (const [x, y, rr] of blobs) { g.beginPath(); g.arc(x - 1.5, y - 2, rr * 0.7, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = sets[2];
  for (const [x, y, rr] of blobs.slice(0, 6)) { g.beginPath(); g.arc(x - 3.5, y - 4.5, rr * 0.36, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(20,40,10,0.18)';
  for (let k = 0; k < 40; k++) g.fillRect(cx - 18 + r() * 36, cy - 14 + r() * 28, 1.5, 1.5);
  if (season === 0 && v === 0) { g.fillStyle = '#f6e6f0'; for (let k = 0; k < 14; k++) g.fillRect(cx - 14 + r() * 28, cy - 12 + r() * 22, 2, 2); }
  if (season === 1 && v === 2) { g.fillStyle = '#c9302a'; for (let k = 0; k < 8; k++) { g.beginPath(); g.arc(cx - 12 + r() * 24, cy - 8 + r() * 20, 1.6, 0, Math.PI * 2); g.fill(); } }
  return { cvs: cv, ax: w / 2, ay: h - 3, k: 1 / SPR };
}

function makeConifer(season, v) {
  const w = 44, h = 92;
  const cv = makeCanvas(w * SPR, h * SPR), g = cv.getContext('2d'); g.scale(SPR, SPR);
  const r = mulberry32(2000 + v * 13);
  g.fillStyle = '#4a3428';
  g.fillRect(w / 2 - 2.5, h - 16, 5, 14);
  const tiers = 4;
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers;
    const by = h - 14 - t * 60, half = 19 - t * 11 + r() * 2, top = by - 26;
    g.fillStyle = 'rgba(15,30,15,0.6)';
    g.beginPath(); g.moveTo(w / 2 - half - 1.2, by + 1.2); g.lineTo(w / 2, top - 1.5); g.lineTo(w / 2 + half + 1.2, by + 1.2); g.closePath(); g.fill();
    g.fillStyle = season === 3 ? '#2d4b34' : '#2f5a36';
    g.beginPath(); g.moveTo(w / 2 - half, by); g.lineTo(w / 2, top); g.lineTo(w / 2 + half, by); g.closePath(); g.fill();
    g.fillStyle = season === 3 ? '#3a5e42' : '#407348';
    g.beginPath(); g.moveTo(w / 2 - half, by); g.lineTo(w / 2, top); g.lineTo(w / 2 - 1, by); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(15,35,15,0.35)'; g.lineWidth = 1;
    g.beginPath(); for (let q = 0; q < 4; q++) { const xx = w / 2 - half * 0.7 + q * half * 0.45; g.moveTo(xx, by - 1); g.lineTo(xx + 2, by - 5); } g.stroke();
    if (season === 3) {
      g.fillStyle = 'rgba(248,250,250,0.95)';
      g.beginPath(); g.moveTo(w / 2 - half * 0.75, by - 5); g.lineTo(w / 2, top + 1); g.lineTo(w / 2 + half * 0.6, by - 6); g.lineTo(w / 2, top + 8); g.closePath(); g.fill();
    }
  }
  return { cvs: cv, ax: w / 2, ay: h - 3, k: 1 / SPR };
}

function makeBush(season, v) {
  const w = 34, h = 26;
  const cv = makeCanvas(w * SPR, h * SPR), g = cv.getContext('2d'); g.scale(SPR, SPR);
  const r = mulberry32(4000 + v * 11);
  const cols = [['#4c8232', '#68a043', '#8cc25c'], ['#3f7a2c', '#55923a', '#77b04e'], ['#8a6a2a', '#b08a34', '#d0aa4a'], ['#5a6650', '#6e7a62', '#eef2f2'], ['#5e5a3c', '#6e6846', '#847c56']][season];
  const blobs = [];
  for (let k = 0; k < 6; k++) blobs.push([w / 2 + (r() - 0.5) * 16, 15 + (r() - 0.5) * 5, 5 + r() * 4]);
  g.fillStyle = 'rgba(28,30,12,0.6)';
  for (const [x, y, rr] of blobs) { g.beginPath(); g.arc(x + 0.8, y + 1.2, rr + 1.1, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = cols[0];
  for (const [x, y, rr] of blobs) { g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = cols[1];
  for (const [x, y, rr] of blobs) { g.beginPath(); g.arc(x - 1, y - 1.5, rr * 0.65, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = cols[2];
  for (const [x, y, rr] of blobs.slice(0, 3)) { g.beginPath(); g.arc(x - 2, y - 3, rr * 0.3, 0, Math.PI * 2); g.fill(); }
  if (season < 2 && v === 1) { g.fillStyle = '#c9302a'; for (let k = 0; k < 6; k++) g.fillRect(w / 2 - 9 + r() * 18, 10 + r() * 8, 2, 2); }
  if (season === 0 && v === 2) { g.fillStyle = '#f8f0d8'; for (let k = 0; k < 7; k++) g.fillRect(w / 2 - 9 + r() * 18, 9 + r() * 9, 2, 2); }
  return { cvs: cv, ax: w / 2, ay: h - 4, k: 1 / SPR };
}

function makeRock(season, v) {
  const w = 40, h = 30;
  const cv = makeCanvas(w * SPR, h * SPR), g = cv.getContext('2d'); g.scale(SPR, SPR);
  const r = mulberry32(3000 + v * 7);
  const pts = [];
  for (let k = 0; k < 7; k++) { const a = Math.PI + (k / 6) * Math.PI; pts.push([20 + Math.cos(a) * (12 + r() * 6), 24 + Math.sin(a) * (10 + r() * 8)]); }
  g.fillStyle = '#5f5b54';
  g.beginPath(); g.moveTo(pts[0][0] - 1, pts[0][1] + 1); for (const p of pts) g.lineTo(p[0], p[1] - 1); g.lineTo(pts[6][0] + 1, pts[6][1] + 1); g.closePath(); g.fill();
  g.fillStyle = '#857f75';
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1]); g.closePath(); g.fill();
  g.fillStyle = '#a39d91';
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(0, 4)) g.lineTo(p[0], p[1]); g.lineTo(20, 22); g.closePath(); g.fill();
  g.fillStyle = season === 3 ? 'rgba(250,252,252,0.95)' : 'rgba(110,140,70,0.55)';
  g.beginPath(); g.ellipse(17, 13, 8, 3.5, 0, 0, Math.PI * 2); g.fill();
  return { cvs: cv, ax: 20, ay: 25, k: 1 / SPR };
}

// Gemalte Bäume. Laubbäume: 1 Eiche, 2 Buche, 3 Birke, 4 Apfelbaum, je Herbst und Winter (der Winter auch für den
// kahlen Winter ohne Schnee); im Frühling und Sommer gibt es bisher nur die Eiche, in drei Farbspielarten.
// Nadelbäume: 1 Kiefer, 2 Fichte, 3 junge Tanne, im Schnee die verschneite Fassung.
// Alle Bilder im selben Maßstab gemalt (vierfach), im Spiel 0,275 Einheiten je Bildpunkt.
const TREE_K = 0.275;
const treeAnchorCache = new Map();
function treeAnchor(id, im) {
  // Stammfuß: unterste deckende Zeile in der Bildmitte
  if (treeAnchorCache.has(id)) return treeAnchorCache.get(id);
  const cv = makeCanvas(im.width, im.height), g = cv.getContext('2d');
  g.drawImage(im, 0, 0);
  const d = g.getImageData(Math.floor(im.width * 0.35), 0, Math.ceil(im.width * 0.3), im.height).data, w = Math.ceil(im.width * 0.3);
  let foot = im.height * 0.9;
  for (let y = im.height - 1; y > im.height * 0.5; y--) {
    let n = 0;
    for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 140) n++;
    if (n >= 3) { foot = y - 2; break; }
  }
  treeAnchorCache.set(id, foot);
  return foot;
}
function artSprite(id, filter = '', k = TREE_K) {
  const im = ART[id];
  if (!im) return null;
  const cv = makeCanvas(im.width, im.height), g = cv.getContext('2d');
  if (filter) g.filter = filter;
  g.drawImage(im, 0, 0);
  return { cvs: cv, ax: (im.width / 2) * k, ay: treeAnchor(id, im) * k, k };
}
const OAK_TINT = ['saturate(1.35) hue-rotate(16deg) brightness(1.06)', 'saturate(1.3) hue-rotate(26deg) brightness(0.96)', 'saturate(1.3) hue-rotate(9deg) brightness(1.1)'];
function artLaub(look) {
  if (look === 2 || look === 3 || look === 4) {
    const suf = look === 2 ? 'herbst' : 'winter';
    const set = [1, 2, 3, 4].map((n) => artSprite(`laub_${n}_${suf}`));
    return set.every(Boolean) ? set : null;
  }
  const id = look === 0 && ART.laub_1_fruehling ? 'laub_1_fruehling' : 'laub_1_sommer';
  const set = [0, 1, 2].map((v) => artSprite(id, OAK_TINT[v]));
  return set.every(Boolean) ? set : null;
}
function artNadel(look) {
  const set = [1, 2, 3].map((n) => artSprite(look === 3 && ART[`nadel_${n}_winter`] ? `nadel_${n}_winter` : `nadel_${n}`));
  return set.every(Boolean) ? set : null;
}

// Büsche: Sommerbild auch im Frühling, Winterbild (kahl, etwas Schnee) im ganzen Winter. Felsen tragen im Schnee eine Haube.
// Felsen und Büsche kleiner als im gemalten Maßstab: neben den Figuren wirkten sie sonst wie Hügel und Hecken
const FELS_K = TREE_K * 0.6, BUSCH_K = TREE_K * 0.72;
function artSet(ids, k = TREE_K) { const set = ids.map((id) => artSprite(id, '', k)); return set.every(Boolean) ? set : null; }
function artBusch(look) { const suf = look === 2 ? 'herbst' : look >= 3 ? 'winter' : 'sommer'; return artSet([1, 2, 3].map((n) => `busch_${n}_${suf}`), BUSCH_K); }
function artFels(look) { return artSet([1, 2, 3].map((n) => (look === 3 ? `fels_${n}_winter` : `fels_${n}`)), FELS_K); }

const SPR = 3;
function ensureSprites() {
  const s = treeSeason();
  if (sprites && spriteSeason === s) return;
  spriteSeason = s;
  sprites = {
    laub: artLaub(s) || [0, 1, 2].map((v) => makeDeciduous(s, v)),
    nadel: artNadel(s) || [0, 1, 2].map((v) => makeConifer(s, v)),
    fels: artFels(s) || [0, 1, 2].map((v) => makeRock(s, v)),
    busch: artBusch(s) || [0, 1, 2].map((v) => makeBush(s, v)),
    // nur gemalt: ohne Bild bleiben sie weg
    schilf: artSet(['schilf']),
    blumen: s <= 1 ? artSet(['wildblumen_1', 'wildblumen_2']) : null,
    stumpf: artSet(['baumstumpf']),
    stamm: artSet(['baum_umgestuerzt_1', 'baum_umgestuerzt_2']),
  };
}

// Welche Art an diesem Platz wächst: fest je Baum, damit eine Birke auch im Winter eine Birke ist.
// Eichen und Buchen am häufigsten, Birken seltener, Apfelbäume nur vereinzelt.
const LAUB_MIX = [0, 0, 0, 0, 1, 1, 1, 2, 2, 3];
function treeIndex(o, n) {
  const h = hash2(Math.floor(o.x * 7), Math.floor(o.y * 7), 313);
  if (o.kind === 'laub' && n === 4) return LAUB_MIX[Math.floor(h * LAUB_MIX.length)];
  return n === 3 && o.kind !== 'laub' ? Math.floor(h * 3) : o.v % n;
}

function drawTreeObj(c, o) {
  const set = o.kind in sprites ? sprites[o.kind] : sprites.laub;
  if (!set) return;
  const sp = set[treeIndex(o, set.length)];
  const z = groundZ(G.world, o.x, o.y);
  const x = isoX(o.x, o.y), y = isoY(o.x, o.y) - z;
  const w = sp.cvs.width * o.s * (sp.k || 1), h = sp.cvs.height * o.s * (sp.k || 1);
  const big = o.kind === 'laub' || o.kind === 'nadel', long = o.kind === 'stamm';
  const f = big || long ? 1 : (sp.k || TREE_K) / TREE_K;
  c.fillStyle = 'rgba(20,35,12,0.2)';
  if (o.kind !== 'schilf' && o.kind !== 'blumen') { c.beginPath(); c.ellipse(x + (big ? 10 : long ? 0 : 4) * o.s * f, y - 1, (big ? 16 : long ? 22 : 10) * o.s * f, (big ? 5.5 : long ? 6 : 3.5) * o.s * f, 0, 0, Math.PI * 2); c.fill(); }
  c.drawImage(sp.cvs, x - sp.ax * o.s, y - sp.ay * o.s, w, h);
}

// ---------------------------------------------------------------- Gelände
function getPatchNoise() {
  if (!patchNoise || patchNoise.seed !== G.world.seed) {
    const n = makeNoise(G.world.seed * 5 + 77);
    patchNoise = { seed: G.world.seed, f: (x, y) => n(x / 6, y / 6) * 0.6 + n(x / 2.5 + 40, y / 2.5) * 0.4 };
  }
  return patchNoise.f;
}

function isRoadish(W, i, j) {
  if (i < 0 || j < 0 || i >= W.N || j >= W.N) return false;
  const t = W.tiles[j * W.N + i];
  return t === T.ROAD || t === T.BRIDGE;
}

function tileColor(t, pal, hv) {
  switch (t) {
    case T.WATER: return pal.water;
    case T.BRIDGE: return pal.water;
    case T.FOREST: return pal.forest;
    case T.HILLS: return pal.hills;
    case T.FIELD: return pal.field;
    case T.SAND: return pal.sand;
    default: return hv < 0.5 ? pal.grass : pal.grass2;
  }
}

// Helligkeit eines Hangs: Licht kommt von links oben
function slopeLight(dhdx, dhdy) { return 1 + Math.max(-0.32, Math.min(0.2, (dhdx - dhdy) / 34)); }
// Licht an jeder Kachelecke aus den Höhen ringsum (geglättetes Gefälle wie ein Sobel-Filter). Zwischen den Ecken
// verläuft das Licht, so wirken Hügel rund statt kantig.
let vlightOf = null, vlight = null;
function vertexLight(W) {
  if (vlightOf === W.vh) return vlight;
  const M = W.M, vh = W.vh, L = new Float32Array(M * M);
  const h = (x, y) => vh[Math.max(0, Math.min(M - 1, y)) * M + Math.max(0, Math.min(M - 1, x))];
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    let dx = 0, dy = 0;
    for (let k = -1; k <= 1; k++) {
      const w = k ? 1 : 2;
      dx += w * (h(x + 1, y + k) - h(x - 1, y + k));
      dy += w * (h(x + k, y + 1) - h(x + k, y - 1));
    }
    L[y * M + x] = slopeLight(dx / 8, dy / 8);
  }
  vlightOf = vh; vlight = L;
  return L;
}
// Verlauf über ein Dreieck, dessen Wert an den drei Ecken v0..v2 liegt: ein Wert, der im Dreieck linear verläuft,
// ist genau ein linearer Verlauf der Leinwand. stops(lo, hi) liefert die Farbhalte von lo (0) bis hi (1).
function triFill(c, p0, p1, p2, v0, v1, v2, colorOf, strokeToo = false) {
  const lo = Math.min(v0, v1, v2), hi = Math.max(v0, v1, v2);
  let style;
  if (hi - lo < 0.004) style = colorOf((lo + hi) / 2);
  else {
    const x1 = p1[0] - p0[0], y1 = p1[1] - p0[1], x2 = p2[0] - p0[0], y2 = p2[1] - p0[1];
    const det = x1 * y2 - x2 * y1;
    if (Math.abs(det) < 1e-6) style = colorOf((lo + hi) / 2);
    else {
      const d1 = v1 - v0, d2 = v2 - v0;
      const a = (d1 * y2 - d2 * y1) / det, b = (x1 * d2 - x2 * d1) / det, g2 = a * a + b * b;
      const s0 = (lo - v0) / g2, s1 = (hi - v0) / g2;
      style = c.createLinearGradient(p0[0] + a * s0, p0[1] + b * s0, p0[0] + a * s1, p0[1] + b * s1);
      gradStops(style, lo, hi, colorOf);
    }
  }
  c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.closePath();
  c.fillStyle = style; c.fill();
  if (strokeToo) { c.strokeStyle = style; c.stroke(); }
}
// Farbhalte für den Verlauf von lo bis hi; Knicke der Farbfunktion (colorOf.knots) bekommen eigene Halte
function gradStops(g, lo, hi, colorOf) {
  const span = hi - lo;
  g.addColorStop(0, colorOf(lo, 1));
  for (const k of colorOf.knots || []) if (k > lo && k < hi) { const o = (k - lo) / span; g.addColorStop(o, colorOf(k, -1)); g.addColorStop(o, colorOf(k, 1)); }
  g.addColorStop(1, colorOf(hi, -1));
}
// Hangschatten über dem gemalten Boden: Lichtseite warm aufgehellt, Schattenseite dunkler (höchstens max),
// im Schnee mit kühlem, bläulichem Schatten statt grünlichem
function makeSlopeTint(lite, dark, max) {
  // Farben in 1/400-Schritten vorrätig halten, statt bei jeder Kachel neue Texte zu bauen
  const L = [], D = [];
  for (let k = 0; k <= 400; k++) { const a = Math.min(max, k / 400).toFixed(4); L.push(`rgba(${lite},${a})`); D.push(`rgba(${dark},${a})`); }
  const f = (v, side = 0) => {
    const d = v - 1, k = Math.min(400, Math.round(Math.abs(d) * 1.1 * 400));
    return d > 0 || (d === 0 && side > 0) ? L[k] : D[k];
  };
  f.knots = [1, 1 + max / 1.1, 1 - max / 1.1];
  return f;
}
const slopeTint = makeSlopeTint('255,246,216', '28,36,16', 0.3);
const slopeTintSnow = makeSlopeTint('255,252,240', '58,74,110', 0.26);

// Gemalte Böden als Muster: ein Bild deckt 4 × 4 Kacheln, schräg wie der Boden
const GRASS_TILES = 4;
function texPattern(c, id, ox, oy) {
  const im = ART[id];
  if (!im) return null;
  const cache = c.__tex || (c.__tex = {});
  if (!cache[id]) cache[id] = c.createPattern(im, 'repeat');
  const k = im.width / GRASS_TILES;
  cache[id].setTransform(new DOMMatrix([HW / k, HH / k, -HW / k, HH / k, ox, oy]));
  return cache[id];
}
// Welcher gemalte Boden zu Gelände und Jahreszeit passt (look: 0 Frühling, 1 Sommer, 2 Herbst, 3 Schnee,
// 4 kahler Winter). Unter tiefem Schnee liegt überall Schnee, nur Wege und Äcker zeichnen sich ab.
const TEX = {
  0: { [T.GRASS]: 'wiese_fruehling', [T.ROAD]: 'wiese_fruehling', [T.HILLS]: 'heide_sommer', [T.FOREST]: 'waldboden_sommer' },
  1: { [T.GRASS]: 'wiese_sommer', [T.ROAD]: 'wiese_sommer', [T.HILLS]: 'heide_sommer', [T.FOREST]: 'waldboden_sommer' },
  2: { [T.GRASS]: 'wiese_herbst', [T.ROAD]: 'wiese_herbst', [T.HILLS]: 'heide_herbst', [T.FOREST]: 'waldboden_herbst' },
  3: { [T.GRASS]: 'wiese_winter', [T.ROAD]: 'wiese_winter', [T.HILLS]: 'heide_winter', [T.FOREST]: 'waldboden_winter' },
};
TEX[4] = TEX[2];
// Äcker im Jahreslauf: im Frühjahr gepflügt, dann junge Saat; im Sommer grün, dann reif; im Herbst nach der Ernte brach
export function fieldStage() {
  const look = lookSeason();
  if (look === 3) return 'acker_winter';
  if (look === 4) return 'acker_brach';
  const d = G.s ? (G.s.day - 1) % 6 : 0;
  return look === 0 ? (d < 3 ? 'acker_brach' : 'acker_jung') : look === 1 ? (d < 3 ? 'acker_jung' : 'acker_reif') : (d < 2 ? 'acker_reif' : 'acker_brach');
}
// Kreideküsten: Kent, Sussex und das Pays de Caux in der Normandie
let chalkBoxes = null;
function chalkAt(x, y) {
  if (!chalkBoxes) chalkBoxes = [[0.9, 50.9, 1.6, 51.4], [-0.3, 50.65, 0.45, 50.9], [-0.05, 49.4, 1.6, 50.1]].map(([a, b, c2, d]) => { const p = geoToTile(a, b), q = geoToTile(c2, d); return [Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y)]; });
  return chalkBoxes.some(([x0, y0, x1, y1]) => x >= x0 - 3 && x <= x1 + 3 && y >= y0 - 3 && y <= y1 + 3);
}
let campMud = null, campMudWorld = null;
function nearCamp(W, i, j) {
  if (campMudWorld !== W) { campMudWorld = W; campMud = new Set(); for (const c of W.camps || []) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) campMud.add((c.ty + dy) * W.N + c.tx + dx); }
  return campMud.has(j * W.N + i);
}
function groundTex(W, t, look, i, j) {
  const N = W.N, k = j * N + i;
  if (t === T.WATER || t === T.BRIDGE) return W.sea[k] ? 'wasser_meer' : look >= 3 ? 'wasser_winter' : 'wasser_fluss';
  if (t === T.FIELD) return fieldStage();
  if (look === 3 && tileSnow >= 1 && t !== T.SAND) return ART.schnee ? 'schnee' : TEX[3][t];
  if (t === T.SAND) {
    // Küste: Sand, Kies oder Klippen (hoch über dem Meer, an Kreideküsten weiß)
    const coast = W.sea[k - 1] || W.sea[k + 1] || W.sea[k - N] || W.sea[k + N];
    if (coast && W.elev[k] > 0.5) return chalkAt(i, j) ? 'klippe_kreide' : 'klippe';
    return hash2(i >> 2, j >> 2, 611) < 0.3 ? 'kies' : 'sand';
  }
  if (t === T.HILLS && W.elev[k] > 0.78) return look === 3 ? 'fels_winter' : 'fels';
  if ((t === T.GRASS || t === T.FOREST) && nearCamp(W, i, j)) return look === 3 ? TEX[3][t] : 'schlamm';
  return (TEX[look] || TEX[1])[t] || null;
}
// Gemalter Weg: trocken, im Herbst und kahlen Winter Matsch, im Schnee Winterweg, in ummauerten Städten Pflaster
let cityStreet = null, cityStreetWorld = null;
function roadTex(W, i, j, look) {
  if (cityStreetWorld !== W) {
    cityStreetWorld = W; cityStreet = new Set();
    for (const s of W.sites) if (s.cityWall) { const R = s.clear; for (let y = Math.floor(s.y - R); y <= s.y + R; y++) for (let x = Math.floor(s.x - R); x <= s.x + R; x++) if (Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y) < R - 1) cityStreet.add(y * W.N + x); }
  }
  if (look === 3) return 'weg_winter';
  if (cityStreet.has(j * W.N + i)) return 'pflaster';
  return look === 2 || look === 4 ? 'weg_matsch' : 'weg';
}

let tileSnow = 0;
let texBatch = null;
// Boden in zwei Durchgängen: erst Grundfarbe und gemalter Boden aller Kacheln (phase 1), dann Licht, Jahreszeit und
// Kleinkram darüber (phase 2) – so überdecken die Kanten der Nachbarkachel keinen Schatten mehr und es bleiben keine Fugen
function drawTile(c, W, i, j, ox, oy, pal, season, noise, phase = 1) {
  const M = W.M, vh = W.vh, N = W.N;
  const t = W.tiles[j * N + i];
  const hT = vh[j * M + i], hR = vh[j * M + i + 1], hB = vh[(j + 1) * M + i + 1], hL = vh[(j + 1) * M + i];
  const sx = isoX(i, j) + ox, sy = isoY(i, j) + oy;
  const tp = (u, v) => {
    const h = hT + (hR - hT) * u + (hL - hT) * v + (hT - hR - hL + hB) * u * v;
    return [sx + (u - v) * HW, sy + (u + v) * HH - h];
  };
  const Tp = [sx, sy - hT], Rp = [sx + HW, sy + HH - hR], Bp = [sx, sy + TH - hB], Lp = [sx - HW, sy + HH - hL];
  const h1 = hash2(i, j, 77), h2 = hash2(i, j, 991);
  const pn = noise(i, j);
  const isWater = t === T.WATER || t === T.BRIDGE;
  const base = tileColor(t === T.ROAD ? T.GRASS : t, pal, pn);
  const varF = isWater ? 0.97 + pn * 0.06 : 0.9 + pn * 0.16 + (h1 - 0.5) * 0.04;
  // Licht an den vier Ecken; dazwischen verläuft es weich (Wasser bleibt flach)
  const VL = isWater ? null : vertexLight(W);
  const lT = VL ? VL[j * M + i] : 1, lR = VL ? VL[j * M + i + 1] : 1, lB = VL ? VL[(j + 1) * M + i + 1] : 1, lL = VL ? VL[(j + 1) * M + i] : 1;
  const baseOf = (f) => shade(base, varF * f);
  // Gemalter Boden: Textur auf die Raute legen, Hangschatten und Jahreszeit leicht darüber
  const texId = groundTex(W, t, season, i, j);
  const grassArt = texId ? texPattern(c, texId, ox, oy) : null;
  if (phase === 1) {
    c.lineWidth = 0.9;
    if (grassArt && !isWater && texBatch) {
      // Unter deckendem gemaltem Boden reicht eine glatte Grundfarbe; den Boden selbst füllt renderChunk für alle
      // Kacheln mit demselben Bild in einem Zug (ein einziger Pfad hat keine Fugen zwischen den Kacheln)
      c.beginPath(); c.moveTo(Tp[0], Tp[1]); c.lineTo(Rp[0], Rp[1]); c.lineTo(Bp[0], Bp[1]); c.lineTo(Lp[0], Lp[1]); c.closePath();
      c.fillStyle = c.strokeStyle = baseOf(1); c.fill(); c.stroke();
      let q = texBatch.get(texId);
      if (!q) texBatch.set(texId, (q = []));
      q.push(Tp, Rp, Bp, Lp);
      return;
    }
    triFill(c, Tp, Bp, Lp, lT, lB, lL, baseOf, true);
    triFill(c, Tp, Rp, Bp, lT, lR, lB, baseOf, true);
    if (grassArt) {
      c.save();
      c.beginPath(); c.moveTo(Tp[0], Tp[1]); c.lineTo(Rp[0], Rp[1]); c.lineTo(Bp[0], Bp[1]); c.lineTo(Lp[0], Lp[1]); c.closePath();
      if (isWater) c.globalAlpha = 0.85;
      c.fillStyle = grassArt; c.fill();
      c.restore();
    }
    return;
  }
  if (grassArt) {
    c.save();
    // Farbe der Jahreszeit darüber: Sommerwiese im Herbst und Winter stärker, eigene Herbst- und Winterbilder nur leicht;
    // kahler Winter nimmt die Herbstbilder, matter und kälter
    const own = texId !== 'wiese_sommer' || season === 1;
    c.globalAlpha = isWater ? 0 : own ? (season === 4 ? 0.42 : season === 3 ? 0.08 : 0.14) : season === 2 ? 0.5 : season === 4 ? 0.66 : 0.26;
    // (den Hang zeichnet der Lichtverlauf darunter, die Farbe der Jahreszeit liegt eben darüber)
    if (c.globalAlpha > 0) { c.beginPath(); c.moveTo(Tp[0], Tp[1]); c.lineTo(Rp[0], Rp[1]); c.lineTo(Bp[0], Bp[1]); c.lineTo(Lp[0], Lp[1]); c.closePath(); c.fillStyle = baseOf(1); c.fill(); }
    // Hänge auch auf der gemalten Wiese sichtbar machen: Lichtseite heller, Schattenseite dunkler, weich verlaufend
    if (!isWater && Math.max(Math.abs(lT - 1), Math.abs(lR - 1), Math.abs(lB - 1), Math.abs(lL - 1)) > 0.01) {
      c.globalAlpha = 1;
      const tint = season === 3 ? slopeTintSnow : slopeTint;
      triFill(c, Tp, Bp, Lp, lT, lB, lL, tint);
      triFill(c, Tp, Rp, Bp, lT, lR, lB, tint);
    }
    c.restore();
  }

  // Liegengebliebener Schnee in Flecken, je mehr, desto dichter die Decke (die gemalten Winterböden haben ihn schon)
  if (tileSnow > 0 && tileSnow < 1 && !isWater && !(grassArt && season === 3)) {
    const n = Math.floor(hash2(i, j, 41) * 4 * tileSnow + tileSnow * 3.2);
    c.fillStyle = 'rgba(242,246,246,0.92)';
    for (let k = 0; k < n; k++) {
      const p = tp(0.2 + hash2(i + k * 5, j, 42) * 0.6, 0.2 + hash2(i, j + k * 5, 43) * 0.6);
      const rr = (4 + hash2(i + k, j + k, 44) * 7) * (0.7 + tileSnow);
      // Gemalte Schneeflecken mit Grashalmen, sonst ein heller Fleck
      const id = `schneefleck_${1 + Math.floor(hash2(i + k * 3, j - k, 45) * 8)}`, im = ART[id], a = P5[id];
      if (im && a) { const w = rr * 2.6, sc = w / (im.width * a[2]); c.drawImage(im, p[0] - a[0] * sc, p[1] - a[1] * sc, w, im.height * a[2] * sc); continue; }
      c.beginPath(); c.ellipse(p[0], p[1], rr, rr * 0.5, 0, 0, Math.PI * 2); c.fill();
    }
  }

  if (isWater) {
    const land = (a, b) => a >= 0 && b >= 0 && a < N && b < N && W.tiles[b * N + a] !== T.WATER && W.tiles[b * N + a] !== T.BRIDGE;
    const nU = land(i, j - 1), nR = land(i + 1, j), nD = land(i, j + 1), nL = land(i - 1, j);
    if (!nU && !nR && !nD && !nL && season !== 3 && !grassArt) {
      const deep = shade(pal.water2, 0.97 + pn * 0.06);
      c.beginPath(); c.moveTo(Tp[0], Tp[1]); c.lineTo(Rp[0], Rp[1]); c.lineTo(Bp[0], Bp[1]); c.lineTo(Lp[0], Lp[1]); c.closePath();
      c.fillStyle = deep; c.fill(); c.strokeStyle = deep; c.lineWidth = 0.9; c.stroke();
    }
    c.strokeStyle = pal.foam; c.lineWidth = 1.6;
    c.beginPath();
    if (nU) { c.moveTo(Tp[0] + 1, Tp[1] + 1.5); c.lineTo(Rp[0] - 2, Rp[1] + 0.5); }
    if (nR) { c.moveTo(Rp[0] - 2, Rp[1] + 0.5); c.lineTo(Bp[0] + 1, Bp[1] - 1.5); }
    if (nD) { c.moveTo(Bp[0] - 1, Bp[1] - 1.5); c.lineTo(Lp[0] + 2, Lp[1] + 0.5); }
    if (nL) { c.moveTo(Lp[0] + 2, Lp[1] + 0.5); c.lineTo(Tp[0] - 1, Tp[1] + 1.5); }
    c.stroke();
    if (season === 3 && h1 < 0.3 && !grassArt) {
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1;
      const a = tp(0.2, 0.5), b = tp(0.6, 0.4);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    }
  }

  if (!grassArt && (t === T.GRASS || t === T.FOREST || t === T.HILLS || t === T.SAND)) {
    c.strokeStyle = shade(base, 0.74); c.lineWidth = 1;
    c.beginPath();
    const n = t === T.FOREST ? 4 : t === T.SAND ? 1 : 3;
    for (let k = 0; k < n; k++) {
      const p = tp(0.15 + hash2(i * 3 + k, j, 5) * 0.7, 0.15 + hash2(i, j * 3 + k, 6) * 0.7);
      c.moveTo(p[0], p[1]); c.lineTo(p[0] - 1.2, p[1] - 3.5);
      c.moveTo(p[0] + 1.5, p[1]); c.lineTo(p[0] + 1.8, p[1] - 4);
      c.moveTo(p[0] + 3, p[1]); c.lineTo(p[0] + 4, p[1] - 2.6);
    }
    c.stroke();
    if (t === T.GRASS && pal.flowers.length && h2 < 0.16) {
      const fc = pal.flowers[Math.floor(h1 * pal.flowers.length)];
      for (let k = 0; k < 4; k++) {
        const p = tp(0.2 + hash2(i + k, j, 21) * 0.6, 0.2 + hash2(i, j + k, 22) * 0.6);
        c.fillStyle = fc; c.fillRect(p[0] - 1, p[1] - 2, 2, 2);
      }
    }
    if (t === T.FOREST) {
      c.fillStyle = season === 2 ? '#c9742a' : season === 3 ? '#b9c4c2' : season === 4 ? '#6a5a3a' : '#3d5e2a';
      for (let k = 0; k < 5; k++) { const p = tp(0.1 + hash2(i + k * 7, j, 31) * 0.8, 0.1 + hash2(i, j + k * 7, 32) * 0.8); c.fillRect(p[0], p[1], 2, 1.4); }
    }
    if ((t === T.HILLS || t === T.SAND) && h2 < 0.4) {
      c.fillStyle = shade(base, 0.68);
      const p = tp(0.3 + h1 * 0.4, 0.3 + h2);
      c.beginPath(); c.ellipse(p[0], p[1], 2.4, 1.4, 0, 0, Math.PI * 2); c.fill();
    }
  }
  if (t === T.FIELD && !grassArt) {
    for (let k = 1; k <= 4; k++) {
      const f = k / 5;
      const a = tp(0.04, f), b = tp(0.96, f);
      c.strokeStyle = pal.fieldRow; c.lineWidth = 2;
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
      if (season < 3) {
        c.strokeStyle = pal.crop; c.lineWidth = 1;
        c.beginPath();
        for (let q = 0; q < 5; q++) { const p = tp(0.1 + q * 0.2, f); c.moveTo(p[0], p[1]); c.lineTo(p[0] + 0.5, p[1] - (season === 1 ? 5 : 3)); }
        c.stroke();
      }
    }
  }
}

// Wege und Brücken eines Chunks in gemeinsamen Durchgängen über allen Böden: erst der Rand, dann die Wegdecke. So laufen
// die Stücke benachbarter Kacheln ohne Ringe oder Nähte ineinander. Ein Kranz von einer Kachel um den Chunk schließt die
// Wege an den Chunkgrenzen an; gezeichnet wird nur auf den eigenen Kacheln (minimal größer, damit keine Haarlinie bleibt).
function drawRoads(c, W, x0, y0, ox, oy, pal, season) {
  const N = W.N, M = W.M, vh = W.vh;
  const corner = (i, j) => {
    const hT = vh[j * M + i], hR = vh[j * M + i + 1], hB = vh[(j + 1) * M + i + 1], hL = vh[(j + 1) * M + i];
    const sx = isoX(i, j) + ox, sy = isoY(i, j) + oy;
    return (u, v) => [sx + (u - v) * HW, sy + (u + v) * HH - (hT + (hR - hT) * u + (hL - hT) * v + (hT - hR - hL + hB) * u * v)];
  };
  const segs = [];
  for (let j = y0 - 1; j <= y0 + CHUNK; j++) for (let i = x0 - 1; i <= x0 + CHUNK; i++) {
    if (!isRoadish(W, i, j)) continue;
    const bridge = W.tiles[j * N + i] === T.BRIDGE, lift = bridge ? 4 : 0, tp = corner(i, j);
    const ctr = tp(0.5, 0.5); ctr[1] -= lift;
    const arms = [];
    if (isRoadish(W, i, j - 1)) arms.push(tp(0.5, 0));
    if (isRoadish(W, i + 1, j)) arms.push(tp(1, 0.5));
    if (isRoadish(W, i, j + 1)) arms.push(tp(0.5, 1));
    if (isRoadish(W, i - 1, j)) arms.push(tp(0, 0.5));
    for (const q of arms) q[1] -= lift;
    segs.push({ i, j, bridge, ctr, arms, tex: bridge ? null : roadTex(W, i, j, season) });
  }
  if (!segs.length) return;
  // nur Kacheln mit Weg in der Nähe gehören in die Schablone
  const near = new Set();
  for (const g of segs) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) near.add((g.j + dj) * N + g.i + di);
  c.save();
  c.beginPath();
  for (let j = y0; j < y0 + CHUNK; j++) for (let i = x0; i < x0 + CHUNK; i++) {
    if (!near.has(j * N + i)) continue;
    const tp = corner(i, j), e = 0.03;
    const q = [tp(-e, -e), tp(1 + e, -e), tp(1 + e, 1 + e), tp(-e, 1 + e)];
    c.moveTo(q[0][0], q[0][1]); c.lineTo(q[1][0], q[1][1]); c.lineTo(q[2][0], q[2][1]); c.lineTo(q[3][0], q[3][1]); c.closePath();
  }
  c.clip();
  c.lineCap = 'round'; c.lineJoin = 'round';
  // Pfad aller Stücke einer Gruppe; Sackgassen als kleiner Fleck
  const trace = (list, dot) => {
    c.beginPath();
    for (const g of list) {
      if (!g.arms.length) { c.moveTo(g.ctr[0] + dot, g.ctr[1]); c.ellipse(g.ctr[0], g.ctr[1], dot, dot / 2, 0, 0, Math.PI * 2); continue; }
      for (const q of g.arms) { c.moveTo(g.ctr[0], g.ctr[1]); c.lineTo(q[0], q[1]); }
    }
  };
  const ground = segs.filter((g) => !g.bridge), bridges = segs.filter((g) => g.bridge);
  const byTex = new Map();
  for (const g of ground) { const k = g.tex || ''; if (!byTex.has(k)) byTex.set(k, []); byTex.get(k).push(g); }
  const art = (k) => (k ? texPattern(c, k, ox, oy) : null);
  const rc = pal.road;
  // Rand: dieselbe Wegtextur, etwas dunkler, mit einem weichen Saum ins Gras
  if (ground.length) {
    trace(ground, 9); c.strokeStyle = 'rgba(40,28,14,0.16)'; c.lineWidth = 19.5; c.stroke();
    for (const [k, list] of byTex) {
      const pat = art(k);
      trace(list, 8.5); c.strokeStyle = pat || shade(rc, 0.82); c.lineWidth = 17; c.stroke();
      if (!pat) { c.fillStyle = shade(rc, 0.82); c.fill(); }
    }
    trace(ground, 8.5); c.strokeStyle = 'rgba(38,26,12,0.3)'; c.lineWidth = 17; c.stroke();
    // Wegdecke
    for (const [k, list] of byTex) {
      const pat = art(k);
      trace(list, 6.5); c.strokeStyle = pat || rc; c.lineWidth = 12.5; c.stroke();
      c.fillStyle = pat || rc; c.fill();
    }
    // Ohne gemalte Textur: Fahrspuren und Steinchen wie bisher
    for (const g of byTex.get('') || []) {
      c.strokeStyle = shade(rc, 0.88); c.lineWidth = 1.2;
      for (const q of g.arms) {
        c.beginPath(); c.moveTo(g.ctr[0] - 2.5, g.ctr[1]); c.lineTo(q[0] - 2.5, q[1]); c.moveTo(g.ctr[0] + 2.5, g.ctr[1]); c.lineTo(q[0] + 2.5, q[1]); c.stroke();
      }
      const h1 = hash2(g.i, g.j, 77), h2 = hash2(g.i, g.j, 991);
      if (h1 < 0.55) { c.fillStyle = shade(rc, 0.7); c.fillRect(g.ctr[0] - 4 + h1 * 8, g.ctr[1] - 1 + h2 * 3, 2, 1.5); c.fillRect(g.ctr[0] + 2 - h2 * 6, g.ctr[1] + 1, 1.5, 1.2); }
    }
  }
  // Brücken: dunkler Rahmen, Bohlen darüber
  if (bridges.length) {
    trace(bridges, 8.5); c.strokeStyle = '#5a4128'; c.lineWidth = 17; c.stroke();
    trace(bridges, 6.5); c.strokeStyle = '#8f6e44'; c.lineWidth = 13; c.stroke();
    c.strokeStyle = 'rgba(50,32,16,0.55)'; c.lineWidth = 1; c.lineCap = 'butt';
    c.beginPath();
    for (const g of bridges) for (const q of g.arms) {
      const nx = -(q[1] - g.ctr[1]), ny = q[0] - g.ctr[0], nl = Math.hypot(nx, ny) || 1;
      for (let k = 1; k < 5; k++) {
        const px = g.ctr[0] + (q[0] - g.ctr[0]) * (k / 5), py = g.ctr[1] + (q[1] - g.ctr[1]) * (k / 5);
        c.moveTo(px + (nx / nl) * 6, py + (ny / nl) * 6); c.lineTo(px - (nx / nl) * 6, py - (ny / nl) * 6);
      }
    }
    c.stroke();
  }
  c.restore();
}

function renderChunk(cx, cy, cs = 1) {
  const W = G.world;
  const season = lookSeason();
  const pal = lookPal();
  tileSnow = snowLevel();
  const cvs = makeCanvas((CHUNK * TW) * cs, (CHUNK * TH + PAD_TOP + 4) * cs);
  const c = cvs.getContext('2d');
  c.scale(cs, cs);
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  const ox = -isoX(x0, y0 + CHUNK), oy = -isoY(x0, y0) + PAD_TOP;
  const noise = getPatchNoise();
  texBatch = new Map();
  for (let j = y0; j < y0 + CHUNK; j++) for (let i = x0; i < x0 + CHUNK; i++) drawTile(c, W, i, j, ox, oy, pal, season, noise, 1);
  for (const [id, q] of texBatch) {
    c.beginPath();
    for (let k = 0; k < q.length; k += 4) { c.moveTo(q[k][0], q[k][1]); c.lineTo(q[k + 1][0], q[k + 1][1]); c.lineTo(q[k + 2][0], q[k + 2][1]); c.lineTo(q[k + 3][0], q[k + 3][1]); c.closePath(); }
    c.fillStyle = texPattern(c, id, ox, oy); c.fill();
  }
  texBatch = null;
  for (let j = y0; j < y0 + CHUNK; j++) for (let i = x0; i < x0 + CHUNK; i++) drawTile(c, W, i, j, ox, oy, pal, season, noise, 2);
  drawRoads(c, W, x0, y0, ox, oy, pal, season);
  return { cvs, x: -ox, y: -oy, s: cs, w: cvs.width / cs, h: cvs.height / cs };
}

// Je näher die Kamera, desto feiner werden die Kacheln gerendert (Speicher bleibt begrenzt)
function getChunk(cx, cy, cs = 1) {
  const key = (cy * G.world.CN + cx) * 8 + cs;
  let ch = chunkCache.get(key);
  if (ch) { chunkCache.delete(key); chunkCache.set(key, ch); return ch; }
  ch = renderChunk(cx, cy, cs);
  chunkCache.set(key, ch);
  // Speicher für Bodenkacheln begrenzen (rund 40 Millionen Bildpunkte), aber nie weniger als gerade sichtbar
  const px = CHUNK * TW * cs * (CHUNK * TH + PAD_TOP + 4) * cs;
  const max = Math.max(chunksVisible + 6, Math.floor(40e6 / px));
  while (chunkCache.size > max) chunkCache.delete(chunkCache.keys().next().value);
  return ch;
}

// Erdscholle an den vorderen Kartenrändern (Diorama)
function drawSlab(c, minX, maxX, minY, maxY) {
  const W = G.world, N = W.N, M = W.M;
  const season = lookSeason();
  const face = (a, b, hA, hB, t, side) => {
    const aB = [a[0], a[1] + hA + SLAB], bB = [b[0], b[1] + hB + SLAB];
    const f = side === 'L' ? 1 : 0.8;
    poly(c, [a, b, bB, aB], shade('#6b4a30', f));
    const mid = (p, q, k) => [p[0], p[1] + (q[1] - p[1]) * k];
    poly(c, [mid(a, aB, 0.55), mid(b, bB, 0.55), bB, aB], shade('#5d5750', f));
    poly(c, [mid(a, aB, 0.8), mid(b, bB, 0.8), bB, aB], shade('#4a453f', f));
    const water = t === T.WATER || t === T.BRIDGE;
    poly(c, [a, b, [b[0], b[1] + 5], [a[0], a[1] + 5]], water ? shade('#3f7a9c', f) : season === 3 ? shade('#e8eded', f) : shade(season === 4 ? '#7f8a50' : '#5f8f3a', f));
    const p = lerp2(a, b, 0.4);
    c.fillStyle = 'rgba(30,20,10,0.25)'; c.fillRect(p[0], p[1] + 22, 3, 2);
  };
  if (maxY >= N - 4) {
    for (let i = Math.max(0, Math.floor(minX) - 2); i < Math.min(N, Math.ceil(maxX) + 2); i++) {
      const hA = W.vh[N * M + i], hB = W.vh[N * M + i + 1];
      face([isoX(i, N), isoY(i, N) - hA], [isoX(i + 1, N), isoY(i + 1, N) - hB], hA, hB, W.tiles[(N - 1) * N + i], 'L');
    }
  }
  if (maxX >= N - 4) {
    for (let j = Math.max(0, Math.floor(minY) - 2); j < Math.min(N, Math.ceil(maxY) + 2); j++) {
      const hA = W.vh[j * M + N], hB = W.vh[(j + 1) * M + N];
      face([isoX(N, j), isoY(N, j) - hA], [isoX(N, j + 1), isoY(N, j + 1) - hB], hA, hB, W.tiles[j * N + N - 1], 'R');
    }
  }
}

function drawWaterShimmer(c, minX, maxX, minY, maxY) {
  if (lookSeason() === 3) return;
  const W = G.world, N = W.N;
  const i0 = Math.max(0, Math.floor(minX)), i1 = Math.min(N - 1, Math.ceil(maxX));
  const j0 = Math.max(0, Math.floor(minY)), j1 = Math.min(N - 1, Math.ceil(maxY));
  const t = G.time;
  c.lineWidth = 1.3;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (W.tiles[j * N + i] !== T.WATER) continue;
    const h = hash2(i, j, 31);
    if (h > 0.3) continue;
    const a = Math.sin(t * 1.7 + h * 60);
    if (a < 0.1) continue;
    const x = isoX(i + 0.5, j + 0.5) + Math.sin(t * 0.6 + h * 9) * 5, y = isoY(i + 0.5, j + 0.5) + (h - 0.15) * 40;
    c.strokeStyle = `rgba(255,255,255,${0.32 * a})`;
    c.beginPath(); c.moveTo(x - 5, y); c.lineTo(x + 4, y); c.stroke();
  }
}

// ---------------------------------------------------------------- Figuren
const HORSES = { klepper: '#7a5232', zelter: '#b8b0a2', schlachtross: '#2e2925' };

function drawHorse(c, col, t, moving, look) {
  const s = moving ? Math.sin(t * 9) * 3 : 0;
  c.strokeStyle = shade(col, 0.7); c.lineWidth = 2.4; c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-7, -7); c.lineTo(-7 + s, 0);
  c.moveTo(-4, -7); c.lineTo(-4 - s, 0);
  c.moveTo(5, -7); c.lineTo(5 - s, 0);
  c.moveTo(8, -7); c.lineTo(8 + s, 0);
  c.stroke();
  c.fillStyle = '#2a2018';
  for (const x of [-7 + s, -4 - s, 5 - s, 8 + s]) c.fillRect(x - 1.2, -1, 2.4, 1.5);
  c.fillStyle = col;
  c.strokeStyle = OUTLINE; c.lineWidth = 0.9;
  c.beginPath(); c.ellipse(0, -10, 10.5, 4.6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(6, -13); c.lineTo(11, -20); c.lineTo(14, -18); c.lineTo(9, -10); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(13.5, -19, 3.8, 2.1, 0.4, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = shade(col, 1.18); c.beginPath(); c.ellipse(-2, -12, 6, 1.6, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = shade(col, 0.5); c.lineWidth = 2;
  c.beginPath(); c.moveTo(-10, -11); c.quadraticCurveTo(-14, -9, -13, -4); c.stroke();
  c.beginPath(); c.moveTo(9, -17); c.lineTo(7, -13); c.stroke();
  if (look) {
    c.fillStyle = look.tunic;
    c.globalAlpha = 0.9;
    c.beginPath(); c.moveTo(-8, -13); c.lineTo(6, -13); c.lineTo(7, -6); c.lineTo(-9, -6); c.closePath(); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = look.trim; c.fillRect(-8, -7.5, 15, 1.3);
  }
  c.lineCap = 'butt';
}

function drawLance(c, u, by) {
  const col = (u.lookObj && u.lookObj.tunic) || (u.kind === 'player' ? playerColor() : '#9a2f2a');
  c.save();
  c.translate(3, by - 12);
  c.lineCap = 'round';
  if (u.lanceBroken) {
    c.strokeStyle = '#e2d4b0'; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(-6, 2); c.lineTo(9, -1); c.stroke();
    c.strokeStyle = '#b89a6a'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(9, -1); c.lineTo(12, -3); c.moveTo(9, -1); c.lineTo(11.5, 1); c.stroke();
  } else if (u.lanceDown) {
    c.strokeStyle = '#e8dcc0'; c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(-9, 2); c.lineTo(36, -4); c.stroke();
    c.strokeStyle = col; c.lineWidth = 2.6;
    c.beginPath(); for (const a of [0.15, 0.45, 0.75]) { c.moveTo(-9 + 45 * a, 2 - 6 * a); c.lineTo(-9 + 45 * (a + 0.12), 2 - 6 * (a + 0.12)); } c.stroke();
    c.fillStyle = '#c8cdd2'; c.beginPath(); c.moveTo(1, -3.5); c.lineTo(5, -0.5); c.lineTo(1, 3); c.closePath(); c.fill();
  } else {
    c.strokeStyle = '#e8dcc0'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(0, 6); c.lineTo(3, -34); c.stroke();
    const w = Math.sin(G.time * 4 + u.id) * 1.5;
    c.fillStyle = col; c.beginPath(); c.moveTo(3, -33); c.lineTo(13, -30 + w); c.lineTo(3, -27); c.closePath(); c.fill();
  }
  c.lineCap = 'butt';
  c.restore();
}

// ---------------------------------------------------------------- Gegenstände (tools/gegenstaende.py)
// Waffen, Schilde und Werkzeuge aus den gemalten Bögen. Je Bild: Griffpunkt (x, y in Bildpunkten), Länge (lange Dinge) oder
// Höhe (Schilde, Gefäße) in Metern, Bildpunkte je Meter und bei langen Dingen der Winkel, in dem sie gemalt waren.
// Lange Dinge liegen waagerecht (Griffende links, Kopf rechts, Klinge unten) und werden um den Griff in die Hand gedreht.
const GEG = {knueppel:[13.5,10.8,0.8,128,142.6],langschwert:[12.3,14.6,0.95,128,-44.6],kriegshammer:[13.6,21.3,0.8,128,143.1],speer:[103.9,11.7,2.1,128,-43.4],streitaxt:[14.6,23.8,0.85,128,-40.7],kurzbogen:[78.3,5.1,1.2,128,-44.3],armbrust:[34.4,53.3,0.85,128,-30.4],axt:[12.7,17.7,0.75,128,-145.6],hammer:[27.8,36.8,0.4,256,138.0],hacke:[27.0,57.5,1.1,128,-131.6],sichel:[7.5,20.1,0.5,128,-131.9],heugabel:[83.9,21.5,1.6,128,138.9],besen:[77.6,25.6,1.3,128,135.6],angelrute:[23.6,26.9,3.0,128,-39.7],wanderstab:[133.5,27.5,1.7,128,-132.5],kruecke:[152.3,31.6,1.3,128,-52.8],holzschild:[32.3,38.4,0.6,128],holzschild_innen:[32.6,38.4,0.6,128],rundschild:[45.0,51.2,0.8,128],rundschild_innen:[45.5,51.2,0.8,128],langschild:[35.2,70.4,1.1,128],langschild_innen:[34.8,70.4,1.1,128],wappenschild:[34.9,51.2,0.8,128],wappenschild_innen:[34.9,51.2,0.8,128],bettelschale:[17.9,12.8,0.1,256],krug:[25.9,35.8,0.28,256],becher:[11.9,15.4,0.12,256]};
const UPM = FIG3D_H / 1.8;   // Figureneinheiten je Meter
// Gegenstand an der aktuellen Stelle zeichnen: um den Griff gedreht (ang), vergrößert (sc), Magenta umgefärbt (color)
function drawGeg(c, name, ang = 0, sc = 1, color = null) {
  const g = GEG[name], id = `geg_${name}`;
  if (!g || !ART[id]) return false;
  const spr = figSprite(id, color || '#808080');
  if (!spr) return false;
  const s = (UPM / g[3]) * sc;
  c.save();
  if (ang) c.rotate(ang);
  const im = lodOf(spr.mips[0], c, s);
  c.drawImage(im, -g[0] * s, -g[1] * s, spr.w * s, spr.h * s);
  c.restore();
  return true;
}
// Waffe -> Bild und Größe (Kurzschwert, Ritterschwert und die langen Bögen nach dem Vorbild der gemalten)
const WEAPON_GEG = {
  knueppel: ['knueppel', 1], kurzschwert: ['langschwert', 0.74], langschwert: ['langschwert', 1], ritterschwert: ['langschwert', 1.12],
  speer: ['speer', 1], streitaxt: ['streitaxt', 1], kriegshammer: ['kriegshammer', 1], kurzbogen: ['kurzbogen', 1],
  langbogen: ['kurzbogen', 1.45], eibenbogen: ['kurzbogen', 1.5], armbrust: ['armbrust', 1],
};
const SHIELD_GEG = { holzschild: 'holzschild', rundschild: 'rundschild', drachenschild: 'langschild', wappenschild: 'wappenschild' };
const TOOL_GEG = { hacke: 'hacke', sichel: 'sichel', axt: 'axt', hammer: 'hammer', gabel: 'heugabel', besen: 'besen' };

function drawWeapon(c, u, by) {
  if (u.lance) { drawLance(c, u, by); return; }
  const it = ITEMS[u.eq.waffe];
  if (!it) return;
  const sw = u.swing > 0 ? (u.swing / 0.3) : 0;
  c.save();
  c.translate(4, by - 12);
  const wg = WEAPON_GEG[u.eq.waffe];
  if (wg) {
    // Bogen senkrecht (Bauch nach vorn), Armbrust waagerecht, Speer schräg vor, Hiebwaffen holen aus und schlagen zu
    const ang = it.kind === 'bogen' ? -Math.PI / 2 : it.kind === 'armbrust' ? -0.12 : it.kind === 'speer' ? -0.9 + sw * 0.9 : -1.2 + sw * 2.0;
    if (drawGeg(c, wg[0], ang, wg[1])) { c.restore(); return; }
  }
  switch (it.kind) {
    case 'bogen':
      c.strokeStyle = '#6b4a2a'; c.lineWidth = 1.7;
      c.beginPath(); c.arc(1, 0, 8, -Math.PI / 2.4, Math.PI / 2.4); c.stroke();
      c.strokeStyle = 'rgba(240,230,200,0.85)'; c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(1 + 8 * Math.cos(-Math.PI / 2.4), 8 * Math.sin(-Math.PI / 2.4)); c.lineTo(1 - sw * 3, 0); c.lineTo(1 + 8 * Math.cos(Math.PI / 2.4), 8 * Math.sin(Math.PI / 2.4)); c.stroke();
      break;
    case 'armbrust':
      c.strokeStyle = '#5a3d26'; c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(-2, 0); c.lineTo(9, -1); c.stroke();
      c.strokeStyle = '#3a3a3a'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(8, -5); c.quadraticCurveTo(10, -1, 8, 3); c.stroke();
      break;
    case 'speer': {
      c.rotate(-0.9 + sw * 0.9);
      c.strokeStyle = '#7a5a3a'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(-6, 0); c.lineTo(16, 0); c.stroke();
      c.fillStyle = '#d0d5da'; c.beginPath(); c.moveTo(16, -2); c.lineTo(21, 0); c.lineTo(16, 2); c.fill();
      break;
    }
    default: {
      c.rotate(-1.2 + sw * 2.0);
      if (it.kind === 'axt' || it.kind === 'hammer' || it.kind === 'keule') {
        c.strokeStyle = '#6b4a2a'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(0, 0); c.lineTo(11, 0); c.stroke();
        c.fillStyle = it.kind === 'keule' ? '#6b4a2a' : '#a2a8ae';
        if (it.kind === 'axt') { c.beginPath(); c.moveTo(9, -1); c.lineTo(13, -5); c.lineTo(13, 3); c.closePath(); c.fill(); }
        else c.fillRect(9, -3, 4, 6);
      } else {
        c.strokeStyle = '#e2e6e9'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(2, 0); c.lineTo(it.atk >= 7 ? 15 : 11, 0); c.stroke();
        c.strokeStyle = '#8a6a2a'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(2, -3); c.lineTo(2, 3); c.stroke();
      }
    }
  }
  c.restore();
}

function drawFigure(c, u, x, y) {
  const L = unitLook(u);
  const m = u.mounted && u.st.horse;
  c.save();
  c.translate(x, y);
  c.scale(FIG, FIG);
  c.fillStyle = 'rgba(20,30,10,0.3)';
  c.beginPath(); c.ellipse(m ? 0 : 3, 0, m ? 16 : 8, m ? 6 : 3.4, 0, 0, Math.PI * 2); c.fill();
  if (u.kind === 'player' || u.kind === 'companion') {
    c.strokeStyle = u.kind === 'player' ? 'rgba(255,214,90,0.9)' : 'rgba(150,190,255,0.7)';
    c.lineWidth = 1.4;
    c.beginPath(); c.ellipse(0, 0, m ? 16 : 10, m ? 6 : 4.4, 0, 0, Math.PI * 2); c.stroke();
  }
  else if (u.livery && !u.dead) {
    // Ring in der Farbe der Partei: im Getümmel sieht man sofort, wer zu wem gehört
    c.strokeStyle = u.livery; c.globalAlpha = 0.85; c.lineWidth = 1.6;
    c.beginPath(); c.ellipse(0, 0, m ? 15 : 9, m ? 5.6 : 4, 0, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
  }
  const key = modelFor(u, m);
  const sc = u.small && !key ? 0.8 : 1.14;
  c.scale((u.facing || 1) * sc, sc);
  // Handgemalte Figur, wo es eine gibt (bisher dein Ritter zu Fuß), sonst gezeichnet
  // Der Held als 3D-Figur nach seiner Rüstung (Frauen und Gefolge folgen), sonst das gemalte oder gezeichnete Bild
  const spr = !key && !m && u.kind === 'player' && !u.female ? figSprite('fig_ritter', playerColor()) : null;
  const yb = (key ? drawModel3d(c, u, L, m, key) : null) ?? (spr ? drawSpriteFigure(c, u, spr) : drawFigureBody(c, u, L, m));
  if (u.flash > 0) {
    c.globalAlpha = Math.min(1, u.flash * 5);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.ellipse(0, yb - 13, 6, 10, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
  }
  c.restore();
  if ((u.combatT > 0 || u.hp < u.st.maxHp * 0.999) && u.kind !== 'peasant') {
    const w = 18, top = y + (m ? -44 : -32) * FIG;
    c.fillStyle = 'rgba(20,12,8,0.75)'; c.fillRect(x - w / 2 - 1, top - 1, w + 2, 4);
    c.fillStyle = u.team === 'player' ? '#7bc15a' : '#d9533f';
    c.fillRect(x - w / 2, top, w * Math.max(0, u.hp / u.st.maxHp), 2);
  }
}

function drawFigureBody(c, u, L, m) {
  let by = 0;
  const low = u.kind === 'peasant' && (u.act === 'jaeten' || u.act === 'sitzen' || u.act === 'sammeln' || u.act === 'pirschen' || u.act === 'betteln');
  let late = null;
  if (m) {
    const hs = horse3dFor(u, L);
    if (hs) {
      hs.paint(c);
      if (hs.front) late = hs;
      // Reiter im Sattel: Hüfte auf dem Sattelpunkt, ein Bein hängt an der Flanke herab
      c.translate(hs.x, 0);
      by = hs.y + 6.2;
      c.strokeStyle = '#3b2e24'; c.lineWidth = 2.3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0.4, by - 7); c.lineTo(2.6, by - 3.4); c.lineTo(2, by + 2.2); c.stroke();
      c.lineCap = 'butt';
      c.fillStyle = '#2a2018'; c.fillRect(1.2, by + 1.6, 2.6, 1.5);
    } else { drawHorse(c, HORSES[u.eq.pferd] || '#7a5232', u.anim, u.moving, u.eq.pferd === 'schlachtross' ? L : null); by = -12; }
  }
  else if (low) {
    by = 5;
    c.strokeStyle = '#3b2e24'; c.lineWidth = 2.3;
    c.beginPath(); c.moveTo(-1.5, -2); c.lineTo(-4, 0); c.moveTo(1.5, -2); c.lineTo(3.5, 0); c.stroke();
  } else {
    const s = u.moving ? Math.sin(u.anim * 7) * 2.4 : 0;
    c.strokeStyle = '#3b2e24'; c.lineWidth = 2.3;
    c.beginPath(); c.moveTo(-1.5, -7); c.lineTo(-1.5 + s, 0); c.moveTo(1.5, -7); c.lineTo(1.5 - s, 0); c.stroke();
    c.fillStyle = '#2a2018'; c.fillRect(-2.6 + s, -1, 2.4, 1.4); c.fillRect(0.4 - s, -1, 2.4, 1.4);
  }
  const bob = u.moving && !m ? Math.abs(Math.sin(u.anim * 7)) * 1.1 : 0;
  const yb = by - bob;
  const tunic = u.tunic || L.tunic;
  c.strokeStyle = OUTLINE; c.lineWidth = 0.9;
  if (u.eq.schild && !m) {
    c.fillStyle = shade(tunic, 0.75);
    c.beginPath(); c.ellipse(-4.5, yb - 11, 2.6, 4.2, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  c.fillStyle = tunic;
  c.beginPath(); c.moveTo(-4.6, yb - 6.5); c.lineTo(4.6, yb - 6.5); c.lineTo(3.6, yb - 16); c.lineTo(-3.6, yb - 16); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = shade(tunic, 1.2); c.fillRect(-3, yb - 15.5, 2, 8);
  if (u.st.armorDef >= 6) { c.fillStyle = '#8d949a'; c.fillRect(-3.6, yb - 16, 7.2, 4); c.fillStyle = '#b5bcc2'; c.fillRect(-3.6, yb - 16, 7.2, 1); }
  c.fillStyle = L.trim; c.fillRect(-4.1, yb - 9.6, 8.2, 1.4);
  drawWeapon(c, u, yb);
  c.strokeStyle = OUTLINE; c.lineWidth = 0.9;
  if (u.eq.schild) {
    const sc = u.kind === 'player' || u.kind === 'companion' ? '#d8b54a' : L.trim;
    c.fillStyle = shade(tunic, 1.1);
    c.beginPath(); c.moveTo(1.5, yb - 15); c.lineTo(7, yb - 15); c.lineTo(7, yb - 9); c.lineTo(4.2, yb - 5.5); c.lineTo(1.5, yb - 9); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = sc; c.fillRect(3.8, yb - 14.5, 1.2, 8); c.fillRect(1.8, yb - 12, 5, 1.1);
  }
  c.fillStyle = '#e4ba94';
  c.beginPath(); c.arc(0, yb - 19, 3.2, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = '#2a1c14'; c.fillRect(1.4, yb - 19.6, 1, 1);
  if (L.hood) {
    c.fillStyle = L.hood;
    c.beginPath(); c.arc(0, yb - 19.4, 3.8, Math.PI * 0.95, Math.PI * 2.05); c.lineTo(3, yb - 15.5); c.lineTo(-3, yb - 15.5); c.closePath(); c.fill(); c.stroke();
  } else if (u.st.armorDef >= 6) {
    c.fillStyle = u.st.armorDef >= 12 ? '#aab0b5' : '#9aa1a6';
    if (u.st.armorDef >= 12) { c.fillRect(-3.6, yb - 23, 7.2, 6.5); c.strokeRect(-3.6, yb - 23, 7.2, 6.5); c.fillStyle = '#2a2a2a'; c.fillRect(-0.5, yb - 21, 4, 1); }
    else { c.beginPath(); c.arc(0, yb - 19.8, 3.6, Math.PI, Math.PI * 2); c.fill(); c.stroke(); c.fillRect(0.6, yb - 20, 1, 3); }
    if (u.female) { c.fillStyle = u.hair || '#5a3d26'; c.fillRect(-4.6, yb - 18.5, 1.8, 7); c.fillRect(-5, yb - 12, 2.4, 1.6); }
  } else {
    c.fillStyle = u.hair || '#3b2a1e';
    c.beginPath(); c.arc(0, yb - 19.6, 3.4, Math.PI * 1.05, Math.PI * 1.95); c.fill();
    if (u.female) c.fillRect(-3.4, yb - 19.5, 1.6, 5);
  }
  if (u.kind === 'peasant') drawVillagerGear(c, u, yb);
  if (late) { c.translate(-late.x, 0); late.head(c); c.translate(late.x, 0); }
  return yb;
}

// ---------------------------------------------------------------- 3D-Figuren (Meshy + Blender: tools/sprites.py, tools/sprite_pack.py)
// Bögen: Zeilen = 8 Richtungen, Spalten = Bilder. Richtung 0 schaut nach links unten (+y in Feldern), jede weitere
// dreht sich um 45° gegen den Uhrzeigersinn (von oben gesehen): Richtung d schaut nach (sin d·45°, cos d·45°).
// Die Hauptkleidung ist grau gemalt; die Maske sagt, wo sie ist, und das Spiel färbt sie je Figur ein.
// Modelle: der Held (HERO3D, Bilder held_<stufe>_…) und alle übrigen Figuren (FIG3D, Bilder fig3d_<modell>_…).
const fig3dCache = new Map();
let fig3dTmp = null;
function model3d(key) {
  if (key.startsWith('held_')) return { M: HERO3D[key.slice(5)], art: key };
  return { M: FIG3D[key], art: `fig3d_${key}` };
}
function modelHas(key, anim) { const md = model3d(key); return !!(md.M && md.M.bewegungen[anim] && ART[`${md.art}_${anim}`]); }
// Bögen eines Modells beim ersten Bedarf laden (alle Bewegungen samt Masken)
const modelAsked = new Set();
function modelReady(key) {
  if (!modelAsked.has(key)) {
    modelAsked.add(key);
    const md = model3d(key);
    if (md.M) for (const a in md.M.bewegungen) { wantArt(`${md.art}_${a}`); wantArt(`${md.art}_${a}_maske`); }
  }
  return modelHas(key, 'stehen') && modelHas(key, 'gehen');
}
function modelCell(key, anim, dir, frame, color) {
  const ck = `${key}|${anim}|${dir}|${frame}|${color}`;
  let cv = fig3dCache.get(ck);
  if (cv) { fig3dCache.delete(ck); fig3dCache.set(ck, cv); return cv; }
  const { M, art } = model3d(key);
  const base = ART[`${art}_${anim}`], mask = ART[`${art}_${anim}_maske`];
  if (!base) return null;
  const CW = M.breite || M.zelle, CH = M.hoehe || M.zelle, sx = frame * CW, sy = dir * CH;
  cv = makeCanvas(CW, CH);
  const g = cv.getContext('2d');
  g.drawImage(base, sx, sy, CW, CH, 0, 0, CW, CH);
  if (mask) {
    if (!fig3dTmp || fig3dTmp.width !== CW || fig3dTmp.height !== CH) fig3dTmp = makeCanvas(CW, CH);
    const tg = fig3dTmp.getContext('2d');
    tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, CW, CH);
    tg.drawImage(mask, sx, sy, CW, CH, 0, 0, CW, CH);
    tg.globalCompositeOperation = 'multiply'; tg.fillStyle = color; tg.fillRect(0, 0, CW, CH);
    tg.globalCompositeOperation = 'destination-in'; tg.drawImage(mask, sx, sy, CW, CH, 0, 0, CW, CH);
    tg.globalCompositeOperation = 'source-over';
    g.drawImage(fig3dTmp, 0, 0);
  }
  fig3dCache.set(ck, cv);
  while (fig3dCache.size > 1400) fig3dCache.delete(fig3dCache.keys().next().value);
  return cv;
}

// Welches Modell eine Figur trägt: Held nach Rüstung, Ritterin für Frauen in Waffen, Fußsoldat nach Rüstung,
// Ritter mit Topfhelm, Wegelagerer und Waldläufer als Jäger mit Kapuze, Dorf- und Stadtvolk nach Beruf
const HERO_VARIANT = { gambeson: 'gambeson', lederwams: 'leder', kettenhemd: 'kette', schuppenpanzer: 'schuppe', kettenruestung: 'ritter' };
function heroVariant(u) { return HERO_VARIANT[u.eq.ruestung] || 'edel'; }
const RITTERIN = { gambeson: 'ritterin_gambeson', lederwams: 'ritterin_leder', kettenhemd: 'ritterin_kette', schuppenpanzer: 'ritterin_schuppe', kettenruestung: 'ritterin_ritter' };
const SOLDAT = { gambeson: 'soldat', lederwams: 'soldat_leder', kettenhemd: 'soldat_kette', schuppenpanzer: 'soldat_schuppe' };
const ROLLE3D = {
  bauer: 'bauer', fischer: 'bauer', hirte: 'bauer', knecht: 'bauer', baeuerin: 'frau', magd: 'frau', kind: 'kind',
  buerger: 'buerger', haendler: 'buerger', reisender: 'buerger', vogt: 'buerger', wirt: 'handwerker', handwerker: 'handwerker',
  bergmann: 'handwerker', schmied: 'handwerker', moench: 'geistlicher', priester: 'geistlicher', einsiedler: 'geistlicher',
  wache: 'soldat', bettler: 'bettler', jaeger: 'jaeger',
};
function modelFor(u, m) {
  if (u.hidden) return null;
  const r = u.eq && u.eq.ruestung;
  let key;
  if (u.kind === 'player' || u.kind === 'preview') key = u.female ? RITTERIN[r] || 'ritterin' : `held_${heroVariant(u)}`;
  else if (u.kind === 'peasant') key = u.small || u.role === 'kind' ? 'kind' : u.female ? 'frau' : ROLLE3D[u.role] || 'bauer';
  else if (u.female) key = RITTERIN[r] || 'ritterin';
  else if (r === 'kettenruestung' || u.cls === 'ritter') key = 'held_ritter';
  else if (u.cls === 'bandit' || u.cls === 'waldlaeufer' || u.look === 'bandit' || u.look === 'wald') key = r === 'kettenhemd' || r === 'schuppenpanzer' ? SOLDAT[r] : 'jaeger';
  else if (u.cls === 'zivil' || u.look === 'haendler' || u.look === 'vogt') key = 'buerger';
  else if (SOLDAT[r]) key = SOLDAT[r];
  else key = u.cls === 'soldat' || u.look === 'soldat' || u.look === 'wache' || u.look === 'franken' || u.look === 'sachsen' ? 'soldat' : 'bauer';
  if (!modelReady(key) || (m && !modelHas(key, 'reiten'))) return null;
  return key;
}

// Tätigkeit -> Bewegung (die erste, die das Modell hat); Sitzen und Knien sind feste Haltungen
const ACT3D = {
  axt: ['hacken', 'haemmern'], hammer: ['haemmern', 'hacken'], hacke: ['haemmern', 'hacken', 'aufheben'], gabel: ['haemmern', 'aufheben'],
  sichel: ['aufheben'], saeen: ['aufheben'], sammeln: ['aufheben'], jaeten: ['jaeten', 'aufheben'], abladen: ['aufheben'],
  schoepfen: ['aufheben'], loeschen: ['aufheben'], eimer: ['aufheben'], verkaufen: ['reden'], reden: ['reden'], kaufen: ['reden'],
  trinken: ['trinken'], sitzen: ['sitzen'], betteln: ['sitzen'], jubeln: ['jubeln', 'springen'], spielen: ['springen', 'jubeln'],
  beten: ['knien'], kreuz: ['knien'], segnen: ['segnen', 'reden'],
};
const HOLD3D = { sitzen: 1, knien: 1 };
// Weg (in Feldern) je Bewegungszyklus: daran hängt die Bildfolge beim Gehen und Laufen
const STRIDE3D = { gehen: 0.8, laufen: 1.15, eimer: 0.7, schleichen: 0.55, huepfen: 0.9 };
function modelAnim(u, key, m) {
  const M = model3d(key).M.bewegungen, has = (a) => modelHas(key, a);
  const pick = (a, p) => { const A = M[a]; return { anim: a, frame: Math.min(A.bilder - 1, Math.max(0, Math.floor(p * A.bilder))) }; };
  const loop = (a, t) => { const A = M[a]; if (HOLD3D[a]) return { anim: a, frame: A.bilder - 1 }; return { anim: a, frame: ((Math.floor(t * A.bilder) % A.bilder) + A.bilder) % A.bilder }; };
  if (m) return { anim: 'reiten', frame: 0 };
  const it = ITEMS[u.eq && u.eq.waffe];
  if (u.swing > 0) {
    if (it && it.ranged && has('bogen')) return pick('bogen', 1 - u.swing / 0.3);
    if (has('schlag') && !(it && it.ranged)) return pick('schlag', 1 - u.swing / 0.3);
  }
  if (u.flash > 0.04 && has('getroffen')) return pick('getroffen', 1 - u.flash / 0.18);
  const dt = Math.max(0, Math.min(0.25, G.time - (u._ht ?? G.time)));
  const d = u._hx === undefined ? 0 : Math.hypot(u.x - u._hx, u.y - u._hy);
  if (dt > 0) u._hv = (u._hv || 0) * 0.8 + Math.min(d / dt, 8) * 0.2;
  u._hx = u.x; u._hy = u.y; u._ht = G.time;
  if (u.moving) {
    // Gangart steht fest (gehen oder bei Gefahr laufen), kein Umschalten nach dem geschätzten Tempo;
    // die Bilder folgen dem zurückgelegten Weg, damit die Füße nicht rutschen
    let a = u.run && has('laufen') ? 'laufen' : 'gehen';
    if (a === 'gehen' && u.carry === 'eimer' && has('eimer')) a = 'eimer';
    if (u.act === 'pirschen' && has('schleichen')) a = 'schleichen';
    if (u.act === 'spielen' && has('huepfen')) a = 'huepfen';
    u._wp = (u._wp || 0) + Math.min(d, 0.5) / (STRIDE3D[a] || 0.85);
    return loop(a, u._wp);
  }
  const ph = ((u.id || 0) % 13) * 0.37;
  for (const a of ACT3D[u.act] || []) if (has(a)) return loop(a, (G.time * Math.min(1.6, Math.max(0.7, (ACT_SPEED[u.act] || 2.5) / 2.5)) + ph) / M[a].dauer);
  return loop('stehen', (G.time + ph) / M.stehen.dauer);
}
function modelPoint(key, anim, dir, frame, which) {
  const M = model3d(key).M, A = M.bewegungen[anim], arr = M.punkte && M.punkte[`${anim}|${which}`];
  if (!A || !arr) return null;
  const i = (dir * A.bilder + frame) * 2, k = heroK(M);
  if (arr[i] === undefined) return null;
  return { x: arr[i] * k, y: arr[i + 1] * k };
}

// ---------------------------------------------------------------- 3D-Pferde (tools/pferd.py)
// Gleiche Bögen wie bei den 3D-Figuren. Beim Reitpferd ist das Fell einfärbbar (Klepper braun, Zelter Schimmel),
// beim Schlachtross die Schabracke (Wappenfarbe des Reiters). Der Sattelpunkt je Bild trägt den Reiter.
// Verkleinerte Stufen beim Herauszoomen: Zellen in voller Auflösung flimmern sonst, wenn sie stark verkleinert gemalt werden.
// scale: Bildschirm-Pixel je Zellen-Pixel (aus der Zeichenmatrix und dem Maßstab k der Figur)
const lodMap = new WeakMap();
function lodOf(cv, c, k) {
  const t = c.getTransform(), sc = Math.hypot(t.a, t.b) * k;
  if (sc >= 0.62) return cv;
  const want = sc < 0.16 ? 3 : sc < 0.31 ? 2 : 1;
  let l = lodMap.get(cv);
  if (!l) lodMap.set(cv, (l = []));
  let src = cv;
  for (let i = 0; i < want; i++) {
    if (!l[i]) {
      const w = Math.max(1, Math.round(src.width / 2)), h = Math.max(1, Math.round(src.height / 2));
      const d = makeCanvas(w, h), g = d.getContext('2d');
      g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h); l[i] = d;
    }
    src = l[i];
  }
  return src;
}
function horseReady(kind) { wantArtPrefix(`pferd3d_${kind}_`); return !!(ART[`pferd3d_${kind}_stehen`] && ART[`pferd3d_${kind}_schritt`] && ART[`pferd3d_${kind}_galopp_maske`]); }
function horseCell(kind, anim, dir, frame, color) {
  const key = `${kind}|${anim}|${dir}|${frame}|${color}`;
  let cv = fig3dCache.get(key);
  if (cv) { fig3dCache.delete(key); fig3dCache.set(key, cv); return cv; }
  const base = ART[`pferd3d_${kind}_${anim}`], mask = ART[`pferd3d_${kind}_${anim}_maske`];
  if (!base || !mask) return null;
  const M = HORSE3D[kind], CW = M.breite || M.zelle, CH = M.hoehe || M.zelle, sx = frame * CW, sy = dir * CH;
  const tmp = makeCanvas(CW, CH), tg = tmp.getContext('2d');
  tg.drawImage(mask, sx, sy, CW, CH, 0, 0, CW, CH);
  tg.globalCompositeOperation = 'multiply'; tg.fillStyle = color; tg.fillRect(0, 0, CW, CH);
  tg.globalCompositeOperation = 'destination-in'; tg.drawImage(mask, sx, sy, CW, CH, 0, 0, CW, CH);
  cv = makeCanvas(CW, CH);
  const g = cv.getContext('2d');
  g.drawImage(base, sx, sy, CW, CH, 0, 0, CW, CH);
  g.drawImage(tmp, 0, 0);
  fig3dCache.set(key, cv);
  while (fig3dCache.size > 600) fig3dCache.delete(fig3dCache.keys().next().value);
  return cv;
}
const dirIndex = (dx, dy) => ((Math.round(Math.atan2(dx, dy) / (Math.PI / 4)) % 8) + 8) % 8;
// Bild und Sattelpunkt eines Pferdes (Ursprung am Boden unter dem Rumpf)
function horseFrame(kind, anim, dir, phase, color) {
  const M = HORSE3D[kind];
  if (!M.bewegungen[anim] || !ART[`pferd3d_${kind}_${anim}`]) anim = 'stehen';
  const A = M.bewegungen[anim];
  const frame = ((Math.floor(phase * A.bilder) % A.bilder) + A.bilder) % A.bilder;
  const cell = horseCell(kind, anim, dir, frame, color);
  if (!cell) return null;
  const k = FIG3D_H / M.figur_px, pts = M.sattel[anim], hd = M.kopf && M.kopf[anim], i = (dir * A.bilder + frame) * 2;
  return {
    cell, k, x0: -M.fusspunkt[0] * k, y0: -M.fusspunkt[1] * k, w: (M.breite || M.zelle) * k, h: (M.hoehe || M.zelle) * k, dir,
    sx: pts[i] * k, sy: pts[i + 1] * k, hx: hd ? hd[i] * k : null, hy: hd ? hd[i + 1] * k : null,
  };
}
function paintHorse(c, h) { c.drawImage(lodOf(h.cell, c, h.k), h.x0, h.y0, h.w, h.h); }
// Von vorn und schräg vorn (Richtung 0 bis 2) stehen Kopf und Hals vor dem Reiter: nach ihm noch einmal malen,
// beschnitten auf eine Kapsel vom Kopf ein Stück zum Sattel hin
function paintHorseHead(c, h) {
  if (h.dir > 2 || h.hx === null) return;
  const m = FIG3D_H / 1.8, ex = h.hx + (h.sx - h.hx) * 0.62, ey = h.hy + (h.sy - h.hy) * 0.62;
  const dx = ex - h.hx, dy = ey - h.hy, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d, rn = 0.2 * m;
  c.save();
  c.beginPath();
  c.arc(h.hx, h.hy, 0.3 * m, 0, Math.PI * 2);
  c.moveTo(h.hx + nx * rn, h.hy + ny * rn); c.lineTo(ex + nx * rn, ey + ny * rn); c.lineTo(ex - nx * rn, ey - ny * rn); c.lineTo(h.hx - nx * rn, h.hy - ny * rn); c.closePath();
  c.clip('nonzero');
  paintHorse(c, h);
  c.restore();
}
function drawHorseSprite(c, kind, anim, dir, phase, color) {
  const h = horseFrame(kind, anim, dir, phase, color);
  if (!h) return null;
  paintHorse(c, h);
  return { x: h.sx, y: h.sy };
}
// Gangart nach dem Tempo: Stehen, Schritt, Galopp. Die Beine laufen im Takt der Bewegung.
function horseGait(u) {
  const dt = Math.max(0, Math.min(0.25, G.time - (u._ht ?? G.time)));
  const d = u._hx === undefined ? 0 : Math.hypot(u.x - u._hx, u.y - u._hy);
  if (dt > 0) u._hv = (u._hv || 0) * 0.85 + (Math.min(d / dt, 8)) * 0.15;
  u._hx = u.x; u._hy = u.y; u._ht = G.time;
  // Schritt beim Gehen, Galopp nur beim Laufen (feste Gangart, kein Flackern); die Beine folgen dem Weg
  const anim = !u.moving ? 'stehen' : u.run ? 'galopp' : 'schritt';
  const adv = anim === 'stehen' ? dt / 4 : Math.min(d, 0.6) / (anim === 'schritt' ? 1.25 : 1.6);
  u._hp = (u._hp || ((u.id || 0) % 7) * 0.13) + adv;
  return { anim, phase: u._hp };
}
// Pferd eines Reiters: Sattelpunkt (im gespiegelten Raum der Figur) und eine Malfunktion.
// front: Blick genau von vorn, dann steht der Kopf des Pferdes vor dem Reiter und wird nach ihm gemalt.
function horse3dFor(u, L) {
  const kind = u.eq.pferd === 'schlachtross' ? 'ross' : 'pferd';
  if (!horseReady(kind)) return null;
  const { anim, phase } = horseGait(u);
  const color = kind === 'ross' ? (u.tunic || L.tunic || '#7a2a22') : HORSES[u.eq.pferd] || '#7a5232';
  const dir = dirIndex(u.dirX ?? 0, u.dirY ?? 1);
  const h = horseFrame(kind, anim, dir, phase, color);
  if (!h) return null;
  const f = u.facing || 1;
  return {
    x: h.sx * f, y: h.sy, front: dir <= 2,
    paint: (c) => { c.save(); c.scale(f, 1); paintHorse(c, h); c.restore(); },
    head: (c) => { c.save(); c.scale(f, 1); paintHorseHead(c, h); c.restore(); },
  };
}

// ---------------------------------------------------------------- 3D-Figur malen (Held, Gefolge, Volk, Gegner)
// Der Held: ohne Rüstung ein Edelmann in schwarzem Wams; jede Rüstung ist dieselbe Figur in anderer Bemalung, die
// Kettenrüstung dazu mit Topfhelm und einem Waffenrock in der Wappenfarbe. Waffe, Schild und Werkzeug malt das Spiel
// an die gerenderten Handpunkte, zu Pferd sitzt die Hüfte auf dem Sattelpunkt.
const heroK = (M) => FIG3D_H / (M.figur_px || 60);
const TOOL3D = { hacke: 'hacke', sichel: 'sichel', axt: 'axt', hammer: 'hammer', gabel: 'gabel', besen: 'besen' };
function drawModel3d(c, u, L, m, key) {
  const { M } = model3d(key);
  const { anim, frame } = modelAnim(u, key, m);
  const dir = dirIndex(u.dirX ?? 0, u.dirY ?? 1);
  const color = u.tunic || L.tunic || (u.kind === 'player' || u.kind === 'preview' ? playerColor() : '#8a6e4b');
  const cell = modelCell(key, anim, dir, frame, color);
  if (!cell) return null;
  const f = u.facing || 1, k = heroK(M), CW = M.breite || M.zelle, CH = M.hoehe || M.zelle;
  const pt = (which) => modelPoint(key, anim, dir, frame, which);
  c.save();
  c.scale(f, 1);   // die Richtung steckt im Bild, nicht spiegeln
  // Zu Pferd: Pferd malen, Reiter mit der Hüfte auf den Sattel
  let ox = 0, oy = 0, horse = null, near = null;
  if (m) {
    const kind = u.eq.pferd === 'schlachtross' ? 'ross' : 'pferd';
    if (horseReady(kind)) {
      const { anim: ha, phase } = horseGait(u);
      const hc = kind === 'ross' ? (u.tunic || L.tunic || playerColor()) : HORSES[u.eq.pferd] || '#7a5232';
      horse = horseFrame(kind, ha, dir, phase, hc);
    }
    if (horse) {
      const hip = pt('Hips') || { x: 0, y: -22 };
      // Das Hüftgelenk liegt rund 9 cm über der Sitzfläche
      ox = horse.sx - hip.x; oy = horse.sy - hip.y - 0.09 * FIG3D_H / 1.8;
      // Das abgewandte Bein hängt hinter dem Pferdeleib: erst den ganzen Reiter, dann das Pferd, darüber den Reiter
      // ohne dieses Bein (reiten_nah). So schaut es nur unter dem Bauch hervor, wie es sein soll.
      near = modelHas(key, 'reiten_nah') ? modelCell(key, 'reiten_nah', dir, frame, color) : null;
      if (near) c.drawImage(lodOf(cell, c, k), ox - M.fusspunkt[0] * k, oy - M.fusspunkt[1] * k, CW * k, CH * k);
      paintHorse(c, horse);
    }
  }
  // Waffe, Schild und Werkzeug: von hinten gesehen hinter dem Körper, sonst davor
  const back = dir >= 4 && dir <= 6;
  const gear = () => {
    const sgn = (u.dirX ?? 0) - (u.dirY ?? 1) >= 0 ? 1 : -1;
    const rh = pt('RightHand'), lh = pt('LeftHand');
    if (u.eq && u.eq.schild && lh) drawHeroShield(c, u, L, ox + lh.x + 1.5 * sgn, oy + lh.y, sgn, back);
    if (rh && ((u.eq && u.eq.waffe) || u.lance)) {
      c.save(); c.translate(ox + rh.x, oy + rh.y); c.scale(sgn, 1); c.translate(-4, 12); drawWeapon(c, u, 0); c.restore();
    }
    if (u.kind === 'peasant') drawHandGear(c, u, rh && { x: ox + rh.x, y: oy + rh.y }, lh && { x: ox + lh.x, y: oy + lh.y }, sgn, anim);
  };
  if (back) gear();
  c.drawImage(lodOf(near || cell, c, k), ox - M.fusspunkt[0] * k, oy - M.fusspunkt[1] * k, CW * k, CH * k);
  if (!back) gear();
  if (horse) paintHorseHead(c, horse);
  c.restore();
  const head = pt('Hips');
  return (head ? oy + head.y : -10) - 2;
}
// Werkzeug in der rechten Hand, Bogen, Eimer, Korb oder Stab bei den Dorfleuten
function drawHandGear(c, u, rh, lh, sgn, anim) {
  let tool = TOOL3D[u.act];
  c.strokeStyle = OUTLINE; c.lineWidth = 0.9;
  if (tool === 'hammer' || tool === 'axt' || tool === 'hacke') emitWork(u.x, u.y, tool === 'hammer' && u.task && u.task.anvil ? 'amboss' : tool, ACT_SPEED[u.act] || 1, u.id % 7);
  if (tool && rh) {
    c.save(); c.translate(rh.x, rh.y); c.scale(sgn, 1);
    // Stiel von der Hand nach oben vorn; bei Schlagbewegungen folgt er der Hand
    c.rotate(anim === 'stehen' ? -1.2 : -1.9);
    if (drawGeg(c, TOOL_GEG[tool])) { c.restore(); tool = null; }
  }
  if (tool && rh) {
    c.strokeStyle = '#6b4a2a'; c.lineWidth = 1.5;
    const L2 = tool === 'besen' || tool === 'gabel' ? 11 : 8;
    c.beginPath(); c.moveTo(-2, 0); c.lineTo(L2, 0); c.stroke();
    c.fillStyle = '#9aa0a6'; c.strokeStyle = '#9aa0a6'; c.lineWidth = 1.3;
    if (tool === 'hammer') c.fillRect(L2 - 1.5, -2, 2.6, 4);
    else if (tool === 'axt') { c.beginPath(); c.moveTo(L2 - 1, -0.5); c.lineTo(L2 + 2, -3.4); c.lineTo(L2 + 2, 2.2); c.closePath(); c.fill(); }
    else if (tool === 'hacke') { c.beginPath(); c.moveTo(L2, -0.5); c.lineTo(L2, 3.5); c.stroke(); }
    else if (tool === 'sichel') { c.beginPath(); c.arc(L2 + 1, -1.8, 2.6, -Math.PI * 0.6, Math.PI * 0.7); c.stroke(); }
    else if (tool === 'gabel') { c.beginPath(); c.moveTo(L2, -1.3); c.lineTo(L2 + 3, -1.3); c.moveTo(L2, 1.3); c.lineTo(L2 + 3, 1.3); c.moveTo(L2, -1.3); c.lineTo(L2, 1.3); c.stroke(); }
    else if (tool === 'besen') { c.fillStyle = '#b89a5a'; c.beginPath(); c.moveTo(L2, -2.2); c.lineTo(L2 + 3.5, -3); c.lineTo(L2 + 3.5, 3); c.lineTo(L2, 2.2); c.closePath(); c.fill(); }
    c.restore();
  }
  const bucket = (p) => { c.fillStyle = '#7a6a55'; c.fillRect(p.x - 1.6, p.y, 3.2, 3.4); c.fillStyle = '#5f86a0'; c.fillRect(p.x - 1.2, p.y, 2.4, 0.9); c.strokeStyle = '#c9b48a'; c.lineWidth = 0.6; c.beginPath(); c.arc(p.x, p.y, 1.6, Math.PI, 0); c.stroke(); };
  if ((u.carry === 'eimer' && anim !== 'eimer') || u.act === 'eimer' || u.act === 'schoepfen' || u.act === 'loeschen') { if (rh) bucket(rh); }
  if (u.carry === 'korb' && lh) { c.fillStyle = '#a07a44'; c.beginPath(); c.ellipse(lh.x, lh.y + 1.5, 2.6, 1.8, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
  // Bogen, Pilgerstab, Becher, Bettelschale und Angel gemalt, wo es das Bild gibt
  const at = (p, f) => { c.save(); c.translate(p.x, p.y); c.scale(sgn, 1); const ok = f(); c.restore(); return ok; };
  if (u.bow && lh && anim !== 'bogen' && at(lh, () => drawGeg(c, 'kurzbogen', -Math.PI / 2))) { /* gemalt */ }
  else if (u.bow && lh && anim !== 'bogen') { c.strokeStyle = '#6b4a2a'; c.lineWidth = 1.2; c.beginPath(); c.arc(lh.x - 1, lh.y, 7, -Math.PI * 0.45, Math.PI * 0.45); c.stroke(); }
  if (u.staff && rh && anim !== 'sitzen' && anim !== 'knien' && at(rh, () => drawGeg(c, 'wanderstab', -Math.PI / 2))) { /* gemalt */ }
  else if (u.staff && rh && anim !== 'sitzen' && anim !== 'knien') { c.strokeStyle = '#6b4a2a'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(rh.x + 1, rh.y + 13); c.lineTo(rh.x + 1, rh.y - 10); c.stroke(); }
  if (anim === 'trinken' && rh && at(rh, () => drawGeg(c, 'becher', 0, 1.4))) { /* gemalt */ }
  else if (anim === 'trinken' && rh) { c.fillStyle = '#8a6a44'; c.fillRect(rh.x - 1.1, rh.y - 2.2, 2.2, 2.8); c.strokeRect(rh.x - 1.1, rh.y - 2.2, 2.2, 2.8); }
  if (u.act === 'betteln' && rh && at({ x: rh.x + sgn, y: rh.y }, () => drawGeg(c, 'bettelschale', 0, 1.5))) { /* gemalt */ }
  else if (u.act === 'betteln' && rh) { c.fillStyle = '#8a6a44'; c.beginPath(); c.ellipse(rh.x + 1, rh.y, 2.4, 1.1, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
  // Angel im Winkel, in dem sie gemalt war: die Schnur hängt dann senkrecht ins Wasser
  if (u.act === 'angeln' && rh && at(rh, () => drawGeg(c, 'angelrute', GEG.angelrute[4] * Math.PI / 180, 0.8))) { /* gemalt */ }
  else if (u.act === 'angeln' && rh) { c.strokeStyle = '#6b4a2a'; c.lineWidth = 1; c.beginPath(); c.moveTo(rh.x, rh.y); c.lineTo(rh.x + 14 * sgn, rh.y - 10); c.stroke(); c.strokeStyle = 'rgba(230,230,220,0.7)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(rh.x + 14 * sgn, rh.y - 10); c.lineTo(rh.x + 16 * sgn, rh.y + 8); c.stroke(); }
  if (u.act === 'saeen' && rh && Math.sin(G.time * 3.3 + u.id) > 0.5) { c.fillStyle = '#d8c48a'; for (let q = 0; q < 4; q++) c.fillRect(rh.x + 2 + q * 1.8, rh.y + 1 + q * 1.4 + ((G.time * 9 + q) % 3), 1, 1); }
  if (u.act === 'gefesselt' && rh) { c.strokeStyle = '#b8a070'; c.lineWidth = 1; c.beginPath(); c.moveTo(rh.x - 2, rh.y); c.lineTo(rh.x + 2, rh.y); c.stroke(); }
}
function drawHeroShield(c, u, L, x, y, sgn, inner = false) {
  const it = ITEMS[u.eq.schild];
  const col = u.tunic || playerColor(), trim = '#d8b54a';
  c.save(); c.translate(x, y); c.scale(sgn, 1);
  // Gemalter Schild: von vorn die Schauseite (Wappenschild in der Farbe des Trägers), von hinten Riemen und Griff
  const sg = SHIELD_GEG[u.eq.schild];
  if (sg && drawGeg(c, inner ? `${sg}_innen` : sg, 0, 0.85, u.tunic || (L && L.tunic) || col)) { c.restore(); return; }
  c.strokeStyle = OUTLINE; c.lineWidth = 0.8;
  c.fillStyle = it && it.def >= 4 ? shade(col, 1.05) : '#8a6440';
  if (it && (u.eq.schild === 'rundschild' || u.eq.schild === 'holzschild')) {
    c.beginPath(); c.ellipse(1.5, 0, 3.6, 4.2, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#9aa1a6'; c.beginPath(); c.arc(1.5, 0, 1, 0, Math.PI * 2); c.fill();
  } else {
    // Normannischer Lang- oder Wappenschild: oben rund, unten spitz
    c.beginPath(); c.moveTo(-1.5, -4.5); c.quadraticCurveTo(1.8, -6.2, 5, -4.5); c.lineTo(4.4, 2); c.lineTo(1.75, 7); c.lineTo(-0.9, 2); c.closePath(); c.fill(); c.stroke();
    if (it && it.def >= 6) { c.fillStyle = trim; c.fillRect(1.2, -4.6, 1.1, 9.5); c.fillRect(-0.6, -2.2, 4.7, 1); }
  }
  c.restore();
}

// ---------------------------------------------------------------- Handgemalte Figuren (assets/figuren)
// Magenta im Bild wird zur Wappenfarbe, Schatten und Lichter bleiben erhalten. Für kleine Zoomstufen
// gibt es vorab verkleinerte Stufen, damit die Figur beim Herauszoomen nicht flimmert.
const SPRITE_INFO = { fig_ritter: { ax: 85, ay: 182, top: 4 } };
const spriteCache = new Map();
function spriteRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function figSprite(id, color) {
  const im = ART[id];
  if (!im) return null;
  const key = `${id}|${color}`;
  let s = spriteCache.get(key);
  if (s) return s;
  const cv = makeCanvas(im.width, im.height), g = cv.getContext('2d');
  g.drawImage(im, 0, 0);
  try {
    const d = g.getImageData(0, 0, cv.width, cv.height), a = d.data;
    const [tr, tg, tb] = spriteRgb(color);
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] < 8) continue;
      const r = a[i], gg = a[i + 1], b = a[i + 2];
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      if (mx < 45 || mx - mn < 45 || mx === gg) continue;
      const hue = mx === r ? (60 * ((gg - b) / (mx - mn)) + 360) % 360 : 60 * ((r - gg) / (mx - mn)) + 240;
      if (hue < 285 || hue > 350) continue;
      const f = Math.min(1.35, mx / 255 / 0.72);
      a[i] = Math.min(255, tr * f); a[i + 1] = Math.min(255, tg * f); a[i + 2] = Math.min(255, tb * f);
    }
    g.putImageData(d, 0, 0);
  } catch (e) { /* ohne Pixelzugriff bleibt Magenta stehen */ }
  const mips = [cv];
  let prev = cv;
  while (prev.width > 24) {
    const n = makeCanvas(Math.ceil(prev.width / 2), Math.ceil(prev.height / 2)), ng = n.getContext('2d');
    ng.imageSmoothingQuality = 'high';
    ng.drawImage(prev, 0, 0, n.width, n.height);
    mips.push(n);
    prev = n;
  }
  s = { mips, w: im.width, h: im.height, info: SPRITE_INFO[id] };
  spriteCache.set(key, s);
  return s;
}

// Bisher eine Pose: Beim Gehen wippt und neigt sich die Figur, beim Schlag kippt sie nach vorn.
// Das Bild schaut nach links unten, im Spiel schaut die Figur bei facing = 1 nach rechts.
function drawSpriteFigure(c, u, spr) {
  const A = spr.info;
  const k = 23.5 / (A.ay - A.top);
  const ph = (u.anim || 0) * 7;
  const bob = u.moving ? Math.abs(Math.sin(ph)) * 1.3 : 0;
  const tilt = u.moving ? Math.sin(ph) * 0.06 : 0;
  const hit = u.swing > 0 ? Math.sin(Math.min(1, (0.3 - u.swing) / 0.3) * Math.PI) * 0.22 : 0;
  c.save();
  c.translate(0, -bob);
  c.rotate(tilt + hit);
  c.scale(-k, k);
  // Passende Verkleinerungsstufe für die aktuelle Bildschirmgröße
  const t = c.getTransform(), px = Math.hypot(t.a, t.b);
  let lv = 0;
  while (lv < spr.mips.length - 1 && px * (1 << (lv + 1)) <= 1.05) lv++;
  const mip = spr.mips[lv], q = 1 << lv;
  c.imageSmoothingEnabled = true;
  c.drawImage(mip, -A.ax, -A.ay, mip.width * q, mip.height * q);
  c.restore();
  return -bob;
}

// Kleidung, Werkzeug und Last der Bewohner, dazu die Arbeitsbewegung
const ACT_SPEED = { hacke: 3, sichel: 3.4, axt: 3.6, hammer: 5.5, gabel: 2.6, eimer: 1.6, schoepfen: 1.6, besen: 3.2, verkaufen: 1.4, reden: 1.1, kaufen: 0.8, loeschen: 3.2, saeen: 2.2, sammeln: 2.6, pirschen: 0.6 };
function drawVillagerGear(c, u, yb) {
  const t = G.time * (ACT_SPEED[u.act] || 1) + (u.id % 7);
  const s = Math.sin(t), lift = s > 0 ? s : 0;
  c.strokeStyle = OUTLINE; c.lineWidth = 0.9;
  if (u.apron) { c.fillStyle = u.apron; c.fillRect(-2.6, yb - 13, 5.2, 6.4); }
  // Kopfbedeckung
  if (u.scarf) {
    c.fillStyle = u.scarf;
    c.beginPath(); c.arc(0, yb - 19.4, 3.8, Math.PI * 0.85, Math.PI * 2.15); c.fill(); c.stroke();
    c.fillRect(-4, yb - 19.5, 2, 5.5);
  } else if (u.hat) {
    c.fillStyle = u.hat;
    c.beginPath(); c.ellipse(0, yb - 21.3, 5.6, 1.6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(0, yb - 22.4, 2.8, 2, 0, Math.PI, Math.PI * 2); c.fill();
  } else if (u.cap) {
    c.fillStyle = u.cap;
    c.beginPath(); c.arc(0, yb - 20.4, 3.5, Math.PI, Math.PI * 2); c.fill(); c.stroke();
    c.fillRect(-3.8, yb - 21, 2.2, 1.6);
  } else if (u.helm) {
    c.fillStyle = '#9aa1a6';
    c.beginPath(); c.arc(0, yb - 20, 3.6, Math.PI, Math.PI * 2); c.fill(); c.stroke(); c.fillRect(0.8, yb - 20.2, 1, 3);
  }
  // Werkzeug in der Hand
  const tool = { hacke: 'hacke', sichel: 'sichel', axt: 'axt', hammer: 'hammer', gabel: 'gabel', besen: 'besen' }[u.act];
  if (tool === 'hammer' || tool === 'axt' || tool === 'hacke') emitWork(u.x, u.y, tool === 'hammer' && u.task && u.task.anvil ? 'amboss' : tool, ACT_SPEED[u.act] || 1, u.id % 7);
  if (tool) {
    c.save(); c.translate(2.5, yb - 13); c.rotate(-2.3 + lift * 2.0);
    c.strokeStyle = '#6b4a2a'; c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(tool === 'besen' || tool === 'gabel' ? 12 : 9, 0); c.stroke();
    c.fillStyle = '#9aa0a6'; c.strokeStyle = '#9aa0a6'; c.lineWidth = 1.5;
    if (tool === 'hammer') c.fillRect(7.5, -2.5, 3, 5);
    else if (tool === 'axt') { c.beginPath(); c.moveTo(8, -0.5); c.lineTo(11, -4); c.lineTo(11, 2.5); c.closePath(); c.fill(); }
    else if (tool === 'hacke') { c.beginPath(); c.moveTo(9, -0.5); c.lineTo(9, 4); c.stroke(); }
    else if (tool === 'sichel') { c.beginPath(); c.arc(10, -2, 3, -Math.PI * 0.6, Math.PI * 0.7); c.stroke(); }
    else if (tool === 'gabel') { c.beginPath(); c.moveTo(12, -1.5); c.lineTo(15, -1.5); c.moveTo(12, 1.5); c.lineTo(15, 1.5); c.moveTo(12, -1.5); c.lineTo(12, 1.5); c.stroke(); }
    else if (tool === 'besen') { c.fillStyle = '#b89a5a'; c.beginPath(); c.moveTo(12, -2.5); c.lineTo(16, -3.5); c.lineTo(16, 3.5); c.lineTo(12, 2.5); c.closePath(); c.fill(); }
    c.restore();
  }
  if (u.bow && u.act !== 'pirschen') {
    c.strokeStyle = '#6b4a2a'; c.lineWidth = 1.3;
    c.beginPath(); c.arc(-2, yb - 12, 8, -Math.PI * 0.45, Math.PI * 0.45); c.stroke();
  }
  if (u.act === 'pirschen') {
    const draw = Math.max(0, Math.sin(t * 0.5)) * 2.5;
    c.strokeStyle = '#6b4a2a'; c.lineWidth = 1.6;
    c.beginPath(); c.arc(6, yb - 12, 7, -Math.PI / 2.4, Math.PI / 2.4); c.stroke();
    c.strokeStyle = 'rgba(240,230,200,0.85)'; c.lineWidth = 0.7;
    c.beginPath(); c.moveTo(6 + 7 * Math.cos(-Math.PI / 2.4), yb - 12 + 7 * Math.sin(-Math.PI / 2.4)); c.lineTo(5 - draw, yb - 12); c.lineTo(6 + 7 * Math.cos(Math.PI / 2.4), yb - 12 + 7 * Math.sin(Math.PI / 2.4)); c.stroke();
    c.strokeStyle = '#7a5a3a'; c.lineWidth = 1; c.beginPath(); c.moveTo(4 - draw, yb - 12); c.lineTo(14, yb - 12); c.stroke();
  }
  if (u.act === 'sammeln') {
    c.strokeStyle = '#7a5636'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(3, yb - 6 - lift * 2); c.lineTo(9, yb - 8 - lift * 2); c.moveTo(4, yb - 4); c.lineTo(8, yb - 6); c.stroke();
  }
  if (u.act === 'saeen') {
    const sw = Math.sin(t * 1.5);
    c.strokeStyle = shade(u.tunic || '#8a6e4b', 0.85); c.lineWidth = 2;
    c.beginPath(); c.moveTo(2.5, yb - 14); c.lineTo(6 + sw * 3, yb - 11 - Math.abs(sw) * 3); c.stroke();
    if (sw > 0.6) { c.fillStyle = '#d8c48a'; for (let q = 0; q < 5; q++) c.fillRect(8 + q * 2.2, yb - 12 + q * 1.6 + ((G.time * 9 + q) % 3), 1.1, 1.1); }
  }
  if (u.act === 'loeschen') {
    const up = Math.max(0, Math.sin(t));
    c.save(); c.translate(5, yb - 12 - up * 4); c.rotate(-up * 1.2);
    c.fillStyle = '#7a6a55'; c.fillRect(-1.5, -2, 4, 4.4); c.fillStyle = '#5f86a0'; c.fillRect(-1.1, -2, 3.2, 1);
    c.restore();
    if (up > 0.7) { c.strokeStyle = 'rgba(150,200,235,0.85)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(7, yb - 18); c.quadraticCurveTo(14, yb - 24, 19, yb - 12); c.stroke(); }
  }
  if (u.act === 'eimer' || u.act === 'schoepfen') {
    const by = yb - 5 - lift * 7;
    c.strokeStyle = '#c9b48a'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(5.5, yb - 18); c.lineTo(5.5, by); c.stroke();
    c.fillStyle = '#7a6a55'; c.fillRect(3.8, by, 3.4, 3.6); c.fillStyle = '#5f86a0'; c.fillRect(4.2, by, 2.6, 1);
  }
  if (u.act === 'verkaufen' || u.act === 'reden') {
    const wave = u.act === 'verkaufen' ? Math.sin(t * 2) * 2.5 : Math.sin(t * 3) * 1.2;
    c.strokeStyle = shade(u.tunic || '#8a6e4b', 0.85); c.lineWidth = 2;
    c.beginPath(); c.moveTo(2.8, yb - 14); c.lineTo(6.5, yb - 17 - wave); c.stroke();
    c.fillStyle = '#e4ba94'; c.beginPath(); c.arc(6.8, yb - 17.5 - wave, 1.3, 0, Math.PI * 2); c.fill();
  }
  if (u.beard) { c.fillStyle = '#d8d4cc'; c.beginPath(); c.moveTo(-1.5, yb - 17.5); c.lineTo(3.8, yb - 17.5); c.lineTo(1.6, yb - 11.5); c.closePath(); c.fill(); }
  if (u.staff && !['sitzen', 'beten'].includes(u.act)) { c.strokeStyle = '#6b4a2a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(5, yb + 1); c.lineTo(5, yb - 27); c.stroke(); c.fillStyle = '#e8dcc0'; c.beginPath(); c.arc(5, yb - 27, 1.8, 0, Math.PI * 2); c.fill(); }
  if (u.act === 'gefesselt') { c.strokeStyle = '#b8a070'; c.lineWidth = 1; c.beginPath(); c.moveTo(-3, yb - 10); c.lineTo(3, yb - 10); c.stroke(); }
  if (u.patches) { c.fillStyle = shade(u.tunic || '#7a7062', 0.7); c.fillRect(-2.6, yb - 13, 2.2, 2.4); c.fillStyle = shade(u.tunic || '#7a7062', 1.25); c.fillRect(1, yb - 10, 2.4, 2); }
  if (u.crutch) { c.strokeStyle = '#7a5a3a'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-7, yb + 3); c.lineTo(-4.5, yb - 17); c.moveTo(-6.4, yb - 16.5); c.lineTo(-2.6, yb - 17.5); c.stroke(); }
  if (u.act === 'betteln') {
    const up = Math.max(0, Math.sin(G.time * 0.9 + u.id)) > 0.8 ? 2.5 : 0;
    c.strokeStyle = shade(u.tunic || '#7a7062', 0.85); c.lineWidth = 2; c.beginPath(); c.moveTo(2.5, yb - 13); c.lineTo(6, yb - 9 - up); c.stroke();
    c.fillStyle = '#8a6a44'; c.beginPath(); c.ellipse(7.5, yb - 8.5 - up, 3, 1.3, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  if (u.act === 'jubeln') {
    const w1 = Math.sin(G.time * 9 + u.id) * 2, w2 = Math.sin(G.time * 9 + u.id + 2) * 2;
    c.strokeStyle = shade(u.tunic || '#8a6e4b', 0.85); c.lineWidth = 2;
    c.beginPath(); c.moveTo(-2.8, yb - 15); c.lineTo(-5.5, yb - 23 + w1); c.moveTo(2.8, yb - 15); c.lineTo(5.5, yb - 23 + w2); c.stroke();
    c.fillStyle = '#e4ba94'; c.beginPath(); c.arc(-5.6, yb - 23.5 + w1, 1.3, 0, Math.PI * 2); c.arc(5.6, yb - 23.5 + w2, 1.3, 0, Math.PI * 2); c.fill();
  }
  if (u.act === 'kaufen') { c.fillStyle = '#e8c35a'; c.beginPath(); c.arc(5.5, yb - 11, 1.2, 0, Math.PI * 2); c.fill(); }
  if (u.act === 'kreuz') {
    c.strokeStyle = '#6b4a2a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(4.2, yb - 3); c.lineTo(4.2, yb - 32); c.stroke();
    c.fillStyle = '#d6ad4c'; c.fillRect(3.4, yb - 38, 1.6, 9); c.fillRect(1.6, yb - 35, 5.2, 1.6);
  }
  if (u.act === 'segnen') {
    const a = Math.sin(G.time * 2.4) * 0.7;
    const hx = 3, hy = yb - 13, ex = hx + Math.sin(a) * 9, ey = hy + Math.cos(a) * 9;
    c.strokeStyle = '#c9b48a'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(hx, hy); c.lineTo(ex, ey); c.stroke();
    c.fillStyle = '#d6ad4c'; c.beginPath(); c.arc(ex, ey, 1.8, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(230,230,230,0.5)'; c.beginPath(); c.arc(ex + 1, ey - 4 - (G.time * 6 % 6), 1.8, 0, Math.PI * 2); c.fill();
  }
  if (u.act === 'trinken') {
    const up = Math.max(0, Math.sin(G.time * 1.2 + u.id)) > 0.85;
    c.fillStyle = '#9a7a4a'; c.fillRect(up ? 1.5 : 4, up ? yb - 20 : yb - 12, 3, 4);
    c.fillStyle = '#f0e6c8'; c.fillRect(up ? 1.5 : 4, up ? yb - 20 : yb - 12, 3, 1);
  }
  if (u.act === 'beten') { c.fillStyle = '#e4ba94'; c.beginPath(); c.arc(1.5, yb - 13.5, 1.3, 0, Math.PI * 2); c.fill(); }
  if (u.act === 'angeln') {
    const bob = Math.sin(G.time * 2 + u.id) * 1.5;
    c.strokeStyle = '#6b4a2a'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(3, yb - 12); c.lineTo(15, yb - 24); c.stroke();
    c.strokeStyle = 'rgba(230,230,220,0.8)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(15, yb - 24); c.lineTo(17, yb + 3 + bob); c.stroke();
  }
  if (u.act === 'hueten' || u.role === 'hirte') {
    c.strokeStyle = '#6b4a2a'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(4.5, yb - 1); c.lineTo(4.5, yb - 24); c.arc(6.3, yb - 24, 1.8, Math.PI, Math.PI * 2.2); c.stroke();
  }
  if (u.tool === 'speer' && !tool) {
    c.strokeStyle = '#6b4a2a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(4.2, yb - 2); c.lineTo(4.2, yb - 30); c.stroke();
    c.fillStyle = '#c8cdd2'; c.beginPath(); c.moveTo(4.2, yb - 34); c.lineTo(5.6, yb - 29); c.lineTo(2.8, yb - 29); c.closePath(); c.fill();
  }
  // Last
  switch (u.carry) {
    case 'sack': c.fillStyle = '#b39468'; c.beginPath(); c.ellipse(-3.4, yb - 17, 3.4, 4.3, -0.3, 0, Math.PI * 2); c.fill(); c.stroke(); break;
    case 'korb':
      c.fillStyle = '#8a6a40'; c.beginPath(); c.moveTo(3, yb - 10); c.lineTo(8, yb - 10); c.lineTo(7, yb - 6); c.lineTo(4, yb - 6); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#c9483a'; c.fillRect(4, yb - 11.5, 1.6, 1.6); c.fillStyle = '#6f9b45'; c.fillRect(5.8, yb - 11.8, 1.8, 1.8); break;
    case 'eimer': c.fillStyle = '#7a6a55'; c.fillRect(4, yb - 7, 3.6, 4); c.fillStyle = '#5f86a0'; c.fillRect(4.4, yb - 7, 2.8, 1); break;
    case 'holz': c.strokeStyle = '#7a5636'; c.lineWidth = 2.2; for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(-5, yb - 18.5 + k * 1.6); c.lineTo(5, yb - 20 + k * 1.6); c.stroke(); } break;
    case 'heu': c.fillStyle = '#d8b452'; c.beginPath(); c.ellipse(0, yb - 24.5, 5.5, 2.8, 0, 0, Math.PI * 2); c.fill(); c.stroke(); break;
    case 'fisch': c.fillStyle = '#b9c4c8'; c.beginPath(); c.ellipse(5.5, yb - 6, 3, 1.2, 0.4, 0, Math.PI * 2); c.fill(); break;
    case 'erz':
      c.fillStyle = '#6b4a2a'; c.beginPath(); c.moveTo(-8, yb - 21); c.lineTo(-1, yb - 21); c.lineTo(-2, yb - 13); c.lineTo(-7, yb - 13); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#7a5a4a'; c.beginPath(); c.arc(-5.5, yb - 21.5, 2, 0, Math.PI * 2); c.arc(-3, yb - 22, 1.8, 0, Math.PI * 2); c.fill();
      break;
    case 'balken': c.fillStyle = '#9a7448'; c.save(); c.translate(0, yb - 18); c.rotate(-0.18); c.fillRect(-12, -1.6, 24, 3.2); c.strokeRect(-12, -1.6, 24, 3.2); c.restore(); break;
    case 'reisig':
      c.strokeStyle = '#6e5232'; c.lineWidth = 1.1;
      for (let q = 0; q < 7; q++) { c.beginPath(); c.moveTo(-7 + q * 0.6, yb - 10 - q * 0.9); c.lineTo(-1 + q * 0.5, yb - 21 - q * 0.5); c.stroke(); }
      c.strokeStyle = '#c9b48a'; c.lineWidth = 1; c.beginPath(); c.moveTo(-6, yb - 14); c.lineTo(-1, yb - 17); c.stroke();
      break;
    case 'wild':
      c.fillStyle = '#8a5a34'; c.beginPath(); c.ellipse(0, yb - 19, 8, 3, -0.1, 0, Math.PI * 2); c.fill(); c.stroke();
      c.strokeStyle = '#5a3a22'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-6, yb - 18); c.lineTo(-7, yb - 12); c.moveTo(6, yb - 19); c.lineTo(7, yb - 13); c.moveTo(-8, yb - 21); c.lineTo(-11, yb - 25); c.stroke();
      break;
    case 'hase': c.fillStyle = '#8a7a66'; c.beginPath(); c.ellipse(5.5, yb - 7, 1.6, 3.6, 0.2, 0, Math.PI * 2); c.fill(); c.fillRect(5, yb - 12, 1, 2.5); break;
    case 'saatsack': c.fillStyle = '#c9b48a'; c.beginPath(); c.ellipse(-3.6, yb - 9, 2.6, 3.2, 0, 0, Math.PI * 2); c.fill(); c.stroke(); break;
    case 'bahre':
      c.strokeStyle = '#6b4a2a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(6, yb - 14); c.lineTo(-22, yb - 14); c.stroke();
      c.fillStyle = '#ece6d8'; c.beginPath(); c.ellipse(-8, yb - 16, 10, 2.8, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = 'rgba(80,70,60,0.6)'; c.lineWidth = 0.8; c.stroke();
      break;
    default: break;
  }
}

// Sprechblasen der Bewohner (Bildschirmkoordinaten)
function drawSpeech(c, z, inView) {
  c.font = '600 12px "Alegreya Sans", sans-serif';
  c.textAlign = 'center';
  for (const v of G.peasants || []) {
    if (!v.say || v.hidden || !inView(v.x, v.y)) continue;
    const sp = toScreen(v.x, v.y);
    const a = Math.min(1, (v.say.dur - v.say.t) * 2, v.say.t * 4);
    const tw = c.measureText(v.say.text).width;
    const bx = sp.x, by = sp.y - (v.small ? 34 : 42) * FIG * z;
    c.globalAlpha = a;
    c.fillStyle = 'rgba(250,244,228,0.95)'; c.strokeStyle = 'rgba(60,44,28,0.85)'; c.lineWidth = 1.2;
    c.beginPath();
    if (c.roundRect) c.roundRect(bx - tw / 2 - 7, by - 18, tw + 14, 20, 7); else c.rect(bx - tw / 2 - 7, by - 18, tw + 14, 20);
    c.fill(); c.stroke();
    c.beginPath(); c.moveTo(bx - 4, by + 1.5); c.lineTo(bx, by + 7); c.lineTo(bx + 4, by + 1.5); c.closePath(); c.fill();
    c.fillStyle = '#2a1e14'; c.fillText(v.say.text, bx, by - 4);
  }
  c.globalAlpha = 1;
}

function drawCorpse(c, f, x, y) {
  c.save(); c.translate(x, y); c.scale(FIG, FIG); x = 0; y = 0;
  c.globalAlpha = Math.min(1, (f.dur - f.t) / 3);
  // Gemalter Gefallener: Waffenknecht (rot), Wegelagerer (grün) oder Bauer (braun), eine von vier Lagen, zufällig gespiegelt
  const id = `fh_toter_${f.typ || 'braun'}_${f.v || 1}`, a = P5[id], spr = a && ART[id] ? figSprite(id, '#808080') : null;
  if (spr) {
    // so groß wie die stehenden Figuren (die zeichnet drawFigure 1,14-fach)
    c.scale(f.flip ? -1.14 : 1.14, 1.14);
    c.drawImage(lodOf(spr.mips[0], c, a[2]), -a[0], -a[1], spr.w * a[2], spr.h * a[2]);
    c.restore();
    return;
  }
  c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(x, y, 9, 3.5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = f.look.tunic; c.beginPath(); c.ellipse(x, y - 2, 6.5, 2.6, -0.2, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d9b08c'; c.beginPath(); c.arc(x + 7, y - 3.5, 2.6, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1;
  c.restore();
}

// ---------------------------------------------------------------- Gemalte Tiere (Paket 8)
// Bögen mit 6 Spalten (stehen, gehen 1, gehen 2, grasen/picken, rennen, erlegt) und 2 Zeilen: von vorn (schaut nach
// links unten) und von hinten (schaut nach rechts oben). Gespiegelt ergeben sich vier Blickrichtungen.
// TIER: Zelle (Breite, Höhe) und Fußpunkt im Bild; TIER_K: Größe eines Bildpunkts in Figureneinheiten.
const TIER = {'schaf':[128,112,58.5,99],'kuh':[176,144,97.0,128],'huhn':[72,72,38.0,63],'hirsch':[176,176,81.5,156],'reh':[160,160,72.5,142],'ente':[80,64,41.5,56],'pferd':[224,192,105.5,171]};
// Maßstab je Tier, aus der Höhe im Bild und der echten Größe (Schaf 0,9 m, Kuh 1,5 m, Hirsch mit Geweih 2 m, Reh 1,1 m, Huhn 0,45 m, Ente 0,3 m)
const TIER_K = {'schaf':0.1783,'kuh':0.2327,'huhn':0.1233,'hirsch':0.3193,'reh':0.1723,'ente':0.141,'pferd':0.2616};
// Spalte und Zeile malen; flip spiegelt. Beim Herauszoomen die passende verkleinerte Stufe des Bogens.
function drawTierCell(c, kind, col, row, flip) {
  const T = TIER[kind], spr = T && ART[`tier_${kind}`] ? figSprite(`tier_${kind}`, '#808080') : null;
  if (!spr) return false;
  const [cw, ch, ax, ay] = T, K = TIER_K[kind] || 0.2, t = c.getTransform(), on = Math.hypot(t.a, t.b) * K;
  const lv = Math.max(0, Math.min(spr.mips.length - 1, Math.floor(Math.log2(1 / Math.max(on, 1e-3)))));
  const im = spr.mips[lv], f = im.width / spr.w;
  c.save(); if (flip) c.scale(-1, 1);
  c.drawImage(im, col * cw * f, row * ch * f, cw * f, ch * f, -ax * K, -ay * K, cw * K, ch * K);
  c.restore();
  return true;
}
// Blickrichtung: Zeile 0 schaut nach links unten, Zeile 1 nach rechts oben; facing > 0 heißt nach rechts
function tierView(a) { const row = a.away ? 1 : 0; return { row, flip: row === 0 ? (a.facing || 1) > 0 : (a.facing || 1) < 0 }; }
function drawAnimal(c, a, x, y) {
  const winter = seasonIndex() === 3;
  c.save();
  c.translate(x, y);
  c.scale(FIG, FIG);
  if (a.kind !== 'ente') { c.fillStyle = 'rgba(20,30,10,0.22)'; c.beginPath(); c.ellipse(2, 0, a.kind === 'huhn' ? 3.5 : 8, a.kind === 'huhn' ? 1.5 : 2.8, 0, 0, Math.PI * 2); c.fill(); }
  if (TIER[a.kind] && ART[`tier_${a.kind}`]) {
    const { row, flip } = tierView(a);
    const graze = !a.moving && Math.sin(G.time * (a.kind === 'huhn' ? 5 : 0.8) + a.v * 12) > (a.kind === 'huhn' ? 0.5 : 0.2);
    const run = a.moving && a.flee > 0 && (a.kind === 'hirsch' || a.kind === 'reh' || a.kind === 'pferd');
    const col = run ? 4 : a.moving ? 1 + (Math.floor(a.anim * (a.flee > 0 ? 9 : 4.5)) % 2) : graze ? 3 : 0;
    const bob = a.kind === 'ente' ? Math.sin(G.time * 2 + a.v * 10) * 0.5 : 0;
    if (a.kind === 'ente') { c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 0.8; c.beginPath(); c.ellipse(0, 0.5, 5.5, 1.8, 0, 0, Math.PI * 2); c.stroke(); }
    c.translate(0, bob);
    drawTierCell(c, a.kind, col, row, flip);
    if (a.flash > 0) { c.globalAlpha = Math.min(1, a.flash * 5); c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(0, -6, 7, 5, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
    c.restore();
    return;
  }
  c.scale(a.facing, 1);
  const step = a.moving ? Math.sin(a.anim * 10) * 1.6 : 0;
  const graze = !a.moving && Math.sin(G.time * 0.8 + a.v * 12) > 0.2;
  c.strokeStyle = OUTLINE; c.lineWidth = 0.8;
  switch (a.kind) {
    case 'schaf': {
      c.strokeStyle = '#3a3029'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(-3, -3); c.lineTo(-3 + step, 0); c.moveTo(-1, -3); c.lineTo(-1 - step, 0); c.moveTo(2.5, -3); c.lineTo(2.5 - step, 0); c.moveTo(4, -3); c.lineTo(4 + step, 0); c.stroke();
      const wool = winter ? '#f6f6f2' : '#efe9dc';
      c.strokeStyle = OUTLINE; c.lineWidth = 0.8;
      for (const [bx, by, r] of [[-2.8, -5.8, 3.3], [0.5, -6.6, 3.6], [3, -5.6, 3.1], [-0.4, -4.6, 3.3]]) { c.fillStyle = wool; c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill(); c.stroke(); }
      c.fillStyle = wool;
      for (const [bx, by, r] of [[-2.8, -5.8, 2.6], [0.5, -6.6, 2.9], [3, -5.6, 2.4], [-0.4, -4.6, 2.6]]) { c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(-0.5, -8, 1.6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#3b322b';
      c.beginPath(); c.ellipse(5.8, graze ? -3.5 : -7, 2.2, 1.7, graze ? 0.6 : 0, 0, Math.PI * 2); c.fill(); c.stroke();
      break;
    }
    case 'kuh': {
      c.strokeStyle = '#4a3a2c'; c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(-5, -5); c.lineTo(-5 + step, 0); c.moveTo(-2.5, -5); c.lineTo(-2.5 - step, 0); c.moveTo(3, -5); c.lineTo(3 - step, 0); c.moveTo(5.5, -5); c.lineTo(5.5 + step, 0); c.stroke();
      c.strokeStyle = OUTLINE; c.lineWidth = 0.8;
      c.fillStyle = a.v > 0.5 ? '#f0ebe0' : '#9a6a42';
      c.beginPath(); c.ellipse(0, -7.5, 7.5, 3.8, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = a.v > 0.5 ? '#5a3d26' : '#f0ebe0';
      c.beginPath(); c.ellipse(-2.5, -8.5, 2.4, 1.8, 0.3, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(3, -7, 1.8, 1.4, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = a.v > 0.5 ? '#f0ebe0' : '#8a5a38';
      c.beginPath(); c.ellipse(8.5, graze ? -4.5 : -8.5, 2.6, 2, 0.3, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#e8c9a8'; c.fillRect(9.5, graze ? -4.5 : -8.5, 1.6, 1.4);
      c.strokeStyle = '#4a3a2c'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(-7.5, -8); c.quadraticCurveTo(-9.5, -6, -8.5, -3); c.stroke();
      break;
    }
    case 'huhn': {
      const peck = !a.moving && Math.sin(G.time * 5 + a.v * 20) > 0.5;
      c.strokeStyle = '#c98a2a'; c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(-0.5, -1.6); c.lineTo(-0.5 + step * 0.5, 0); c.moveTo(0.8, -1.6); c.lineTo(0.8 - step * 0.5, 0); c.stroke();
      c.strokeStyle = OUTLINE; c.lineWidth = 0.7;
      c.fillStyle = a.v > 0.5 ? '#f2eee6' : '#a8642e';
      c.beginPath(); c.ellipse(0, -3, 2.6, 1.9, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.arc(2.3, peck ? -1.6 : -4.6, 1.3, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#d6322a'; c.fillRect(1.9, peck ? -3.2 : -6.2, 1, 1);
      c.fillStyle = '#e8b030'; c.fillRect(3.4, peck ? -1.6 : -4.6, 1.2, 0.8);
      break;
    }
    case 'hirsch': {
      c.strokeStyle = '#5a3a22'; c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(-4, -6); c.lineTo(-4 + step * 1.4, 0); c.moveTo(-2, -6); c.lineTo(-2 - step * 1.4, 0); c.moveTo(3, -6); c.lineTo(3 - step * 1.4, 0); c.moveTo(4.5, -6); c.lineTo(4.5 + step * 1.4, 0); c.stroke();
      c.strokeStyle = OUTLINE; c.lineWidth = 0.8;
      c.fillStyle = '#8a5a34';
      c.beginPath(); c.ellipse(0, -8, 6, 2.7, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#f2e6d2'; c.beginPath(); c.ellipse(-5.6, -8.4, 1.3, 1.1, 0, 0, Math.PI * 2); c.fill();
      const hy = graze ? -4 : -14;
      c.strokeStyle = '#8a5a34'; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(4, -9); c.lineTo(6, hy + 1); c.stroke();
      c.fillStyle = '#8a5a34'; c.strokeStyle = OUTLINE; c.lineWidth = 0.8;
      c.beginPath(); c.ellipse(7, hy, 2.4, 1.5, 0.3, 0, Math.PI * 2); c.fill(); c.stroke();
      if (a.v > 0.5) {
        c.strokeStyle = '#d8c6a0'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(6.4, hy - 1); c.lineTo(5, hy - 6); c.lineTo(3.5, hy - 7); c.moveTo(5.5, hy - 4); c.lineTo(7.5, hy - 6.5); c.moveTo(7.2, hy - 1); c.lineTo(8.5, hy - 5); c.stroke();
      }
      break;
    }
    case 'ente': {
      const bob = Math.sin(G.time * 2 + a.v * 10) * 0.6;
      c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 0.8;
      c.beginPath(); c.ellipse(0, 0.5, 5.5, 1.8, 0, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = OUTLINE; c.lineWidth = 0.7;
      c.fillStyle = '#8a6a45';
      c.beginPath(); c.ellipse(0, -1 + bob, 3.4, 1.7, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = a.v > 0.5 ? '#2f6a3a' : '#7a5a3a';
      c.beginPath(); c.arc(2.8, -3 + bob, 1.4, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#e8b030'; c.fillRect(3.8, -3.2 + bob, 1.6, 0.9);
      break;
    }
    default: break;
  }
  if (a.flash > 0) {
    c.globalAlpha = Math.min(1, a.flash * 5);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.ellipse(0, -6, 7, 5, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
  }
  c.restore();
}

// Erlegtes Tier, liegt eine Weile im Gras
function drawCarcass(c, f, x, y) {
  // Gemalt: das erlegte Tier aus der letzten Spalte des Bogens
  if (TIER[f.animal] && ART[`tier_${f.animal}`]) {
    const v = tierView(f);
    c.save(); c.globalAlpha = Math.min(1, (f.dur - f.t) / 4); c.translate(x, y); c.scale(FIG, FIG);
    drawTierCell(c, f.animal, 5, v.row, v.flip);
    c.restore();
    return;
  }
  const col = { hirsch: '#8a5a34', schaf: '#efe9dc', kuh: '#9a6a42', huhn: '#f2eee6', ente: '#8a6a45' }[f.animal] || '#8a5a34';
  const big = (f.animal === 'hirsch' || f.animal === 'kuh' ? 1 : f.animal === 'schaf' ? 0.8 : 0.45) * FIG;
  c.globalAlpha = Math.min(1, (f.dur - f.t) / 4);
  c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(x, y, 10 * big, 3.5 * big, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = col; c.strokeStyle = OUTLINE; c.lineWidth = 0.8;
  c.beginPath(); c.ellipse(x, y - 2 * big, 7.5 * big, 3 * big, 0.08 * (f.facing || 1), 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(x + 7 * big * (f.facing || 1), y - 1.5 * big, 2.4 * big, 1.6 * big, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.strokeStyle = shade(col, 0.6); c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(x - 3 * big, y - 1); c.lineTo(x - 6 * big, y + 1.5); c.moveTo(x + 2 * big, y - 1); c.lineTo(x + 4 * big, y + 2); c.stroke();
  c.globalAlpha = 1;
}

// Vorschau der Spielfigur im Startmenü: Reiter mit Banner in der gewählten Farbe
export function drawHeroPreview(cv, color, female, t) {
  const c = cv.getContext('2d');
  const w = cv.width, h = cv.height, k = h / 150;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, w, h);
  const g = c.createRadialGradient(w / 2, h * 0.78, 4, w / 2, h * 0.78, w * 0.5);
  g.addColorStop(0, 'rgba(110,140,70,0.55)'); g.addColorStop(1, 'rgba(110,140,70,0)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.setTransform(k * 2.6, 0, 0, k * 2.6, w * 0.52, h * 0.86);
  // Standarte
  c.strokeStyle = '#4a3322'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(-22, 0); c.lineTo(-22, -42); c.stroke();
  c.beginPath(); c.moveTo(-22, -42);
  for (let q = 0; q <= 8; q++) { const u = q / 8; c.lineTo(-22 + u * 16, -42 + Math.sin(t * 3 + u * 5) * 1.5 * u); }
  for (let q = 8; q >= 0; q--) { const u = q / 8; c.lineTo(-22 + u * 16, -32 - u * 1 + Math.sin(t * 3 + u * 5) * 1.5 * u); }
  c.closePath(); c.fillStyle = color; c.fill(); c.strokeStyle = OUTLINE; c.lineWidth = 0.6; c.stroke();
  c.fillStyle = '#d8b54a'; c.fillRect(-15.5, -40, 1.2, 7); c.fillRect(-18, -37.2, 6.4, 1.2);
  const u = {
    kind: 'preview', eq: { waffe: 'langschwert', ruestung: 'kettenhemd', schild: 'holzschild', pferd: 'zelter' },
    st: { armorDef: 6, horse: ITEMS.zelter, maxHp: 1 }, hp: 1, mounted: true, facing: 1, anim: t * 0.6, moving: true,
    female, hair: female ? '#7a3a1e' : '#3b2a1e', lookObj: heraldLook(color, false), swing: 0, flash: 0, combatT: 0,
  };
  drawFigure(c, u, 6, 0);
  c.setTransform(1, 0, 0, 1, 0, 0);
}

// Tier unter dem Mauszeiger (für die Jagd)
export function animalAtScreen(px, py) {
  let best = null, bd = 16 * G.cam.zoom + 6;
  for (const a of G.animals || []) {
    if (a.dead) continue;
    if (a.kind === 'huhn' && darkness() > 0.4) continue;
    const sp = toScreen(a.x, a.y);
    const d = Math.hypot(sp.x - px, sp.y - 6 * FIG * G.cam.zoom - py);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

// ---------------------------------------------------------------- Rauch, Schnee, Vögel
function smokeEmit(x, y, rate) {
  if (Math.random() < rate) smoke.push({ x, y, vx: 4 + Math.random() * 4, vy: -12 - Math.random() * 6, r: 2.5, life: 0, max: 2.5 + Math.random() });
}

function drawSmoke(c, dt) {
  for (let i = smoke.length - 1; i >= 0; i--) {
    const p = smoke[i];
    p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 3;
    if (p.life > p.max) { smoke.splice(i, 1); continue; }
    c.fillStyle = `rgba(205,205,200,${0.38 * (1 - p.life / p.max)})`;
    c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
  }
  if (smoke.length > 300) smoke.splice(0, smoke.length - 300);
}

// Wetter über dem fertigen Bild: Schneeflocken, Regenschnüre, Wolkenschatten, Nebel
const rain = [];
let clouds = null;
function drawWeather(c, w, h, dt) {
  const kind = weatherKind(), int = precip() || (G.s.weather ? G.s.weather.int : 0);
  // Schnee
  const nSnow = kind === 'schnee' ? Math.round(170 * int) : 0;
  while (snow.length < nSnow) snow.push({ x: Math.random() * w, y: Math.random() * h, v: 20 + Math.random() * 30, r: 1 + Math.random() * 1.6 });
  if (snow.length > nSnow) snow.length = nSnow;
  if (nSnow) {
    c.fillStyle = `rgba(225,230,238,${0.1 * int})`; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    for (const f of snow) {
      f.y += f.v * dt; f.x += (Math.sin(G.time + f.v) * 10 - 8 * int) * dt;
      if (f.y > h) { f.y = -4; f.x = Math.random() * w; }
      c.beginPath(); c.arc(f.x, f.y, f.r, 0, Math.PI * 2); c.fill();
    }
  }
  // Regen: schräge Schnüre, etwas dunkler, kleine Spritzer am Boden
  const nRain = kind === 'regen' ? Math.round(240 * int) : 0;
  while (rain.length < nRain) rain.push({ x: Math.random() * (w + 200), y: Math.random() * h, l: 10 + Math.random() * 14, v: 560 + Math.random() * 260 });
  if (rain.length > nRain) rain.length = nRain;
  if (nRain) {
    c.fillStyle = `rgba(40,52,66,${0.18 * int})`; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(200,214,228,0.45)'; c.lineWidth = 1;
    c.beginPath();
    for (const d of rain) {
      d.y += d.v * dt; d.x -= d.v * 0.22 * dt;
      if (d.y > h) { d.y = -d.l; d.x = Math.random() * (w + 200); }
      c.moveTo(d.x, d.y); c.lineTo(d.x + d.l * 0.22, d.y - d.l);
    }
    c.stroke();
    c.fillStyle = 'rgba(220,232,240,0.45)';
    for (let k = 0; k < 18 * int; k++) { const x = Math.random() * w, y = Math.random() * h; c.fillRect(x - 1.5, y, 3, 1); }
  }
  // Wolkenschatten ziehen über das Land
  if (kind === 'wolken' || kind === 'regen' || kind === 'schnee') {
    if (!clouds) clouds = [0, 1, 2, 3].map((k) => ({ x: Math.random() * w, y: Math.random() * h, r: 220 + Math.random() * 200, v: 10 + k * 4 }));
    for (const cl of clouds) {
      cl.x += cl.v * dt; cl.y += cl.v * 0.35 * dt;
      if (cl.x - cl.r > w || cl.y - cl.r > h) { cl.x = -cl.r; cl.y = Math.random() * h - cl.r * 0.5; }
      const g = c.createRadialGradient(cl.x, cl.y, 0, cl.x, cl.y, cl.r);
      g.addColorStop(0, `rgba(20,26,34,${kind === 'wolken' ? 0.13 : 0.08})`); g.addColorStop(1, 'rgba(20,26,34,0)');
      c.fillStyle = g; c.fillRect(cl.x - cl.r, cl.y - cl.r, cl.r * 2, cl.r * 2);
    }
  }
  // Nebel: milchiger Schleier, unten dichter
  if (kind === 'nebel') {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(220,224,226,${0.18 * int})`); g.addColorStop(1, `rgba(228,232,234,${0.42 * int})`);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
}

// Vogelschwärme hoch über der Landschaft: in Weltkoordinaten (ziehen beim Scrollen nicht mit), wachsen mit dem
// Zoom und verblassen beim nahen Hineinzoomen, denn dann fliegen sie über der Kamera hinweg.
// Für Tests: sofort einen Schwarm losschicken
export function birdsNow() { birdTimer = 0; return birds.length; }
function drawBirds(c, w, h, dt) {
  const z = G.cam.zoom, cx = G.cam.x, cy = G.cam.y;
  const fade = z <= 1.9 ? 1 : Math.max(0, 1 - (z - 1.9) / 1.1);
  const halfW = w / 2 / z, halfH = h / 2 / z;
  birdTimer -= dt;
  if (birdTimer <= 0) {
    birdTimer = rand(12, 28);
    if (darkness() < 0.25 && birds.length < 3 && fade > 0.2) {
      const left = Math.random() < 0.5;
      const n = 4 + Math.floor(Math.random() * 6);
      const flock = { x: cx + (left ? -1 : 1) * (halfW + 40), y: cy + rand(-0.75, 0.1) * halfH, vx: (left ? 1 : -1) * rand(40, 65), vy: rand(-6, 6), members: [] };
      for (let k = 0; k < n; k++) flock.members.push({ dx: -Math.abs(k - n / 2) * 9 * Math.sign(flock.vx), dy: (k - n / 2) * 7, p: Math.random() * 6 });
      birds.push(flock);
    }
  }
  const k = Math.min(1.8, Math.max(0.55, z * 0.75));
  if (fade > 0) { c.strokeStyle = `rgba(35,30,28,${0.75 * fade})`; c.lineWidth = 1.4 * k; }
  for (let i = birds.length - 1; i >= 0; i--) {
    const f = birds[i];
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (fade > 0) {
      c.beginPath();
      for (const m of f.members) {
        const x = (f.x + m.dx - cx) * z + w / 2, y = (f.y + m.dy - cy) * z + h / 2, flap = Math.sin(G.time * 11 + m.p) * 2.6 * k;
        c.moveTo(x - 5 * k, y - flap); c.quadraticCurveTo(x - 2 * k, y - 1.5 * k, x, y); c.quadraticCurveTo(x + 2 * k, y - 1.5 * k, x + 5 * k, y - flap);
      }
      c.stroke();
    }
    if (Math.abs(f.x - cx) > halfW + 400 || Math.abs(f.y - cy) > halfH + 400) birds.splice(i, 1);
  }
}

// ---------------------------------------------------------------- Retro-Modus
// Eigene 32-Farben-Palette im Stil der Amiga-Ära, dazu geordnetes Dithering.
const RETRO_PAL = [
  '#0c0a08', '#2a1c14', '#4a3222', '#6e4c30', '#946a44', '#b88e5e', '#d8b483', '#f0dcb0',
  '#1e2e14', '#2e4a1c', '#426626', '#5a8230', '#78a03c', '#9cbc52', '#c4d878',
  '#14203c', '#24406a', '#3a6496', '#5a8cbc', '#8cb8d8',
  '#4a4844', '#6e6a62', '#948e82', '#bab4a6', '#e2ddd0', '#ffffff',
  '#6a1e16', '#a8342a', '#d85c34', '#f0a048', '#e8c440', '#2a2440',
];
const BAYER_RAW = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const BAYER4 = BAYER_RAW.map((v) => (v / 16 - 0.47) * 13);
let retroLut = null, retroPal = null;


function buildRetroLut() {
  retroPal = RETRO_PAL.map((hx) => { const n = parseInt(hx.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });
  retroLut = new Uint8Array(32768);
  for (let r = 0; r < 32; r++) for (let g = 0; g < 32; g++) for (let b = 0; b < 32; b++) {
    const R = r * 8 + 4, Gc = g * 8 + 4, B = b * 8 + 4;
    let best = 0, bd = Infinity;
    for (let i = 0; i < retroPal.length; i++) {
      const q = retroPal[i];
      const dr = R - q[0], dg = Gc - q[1], db = B - q[2];
      const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
      if (d < bd) { bd = d; best = i; }
    }
    retroLut[(r << 10) | (g << 5) | b] = best;
  }
}

function quantizeRetro(c, w, h) {
  if (!retroLut) buildRetroLut();
  const img = c.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const by = (y & 3) * 4;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, o = BAYER4[by + (x & 3)];
      let r = d[i] + o, g = d[i + 1] + o, b = d[i + 2] + o;
      r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
      const q = retroPal[retroLut[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)]];
      d[i] = q[0]; d[i + 1] = q[1]; d[i + 2] = q[2];
    }
  }
  c.putImageData(img, 0, 0);
}

// Pixelgröße im Pixel- und Retro-Modus (2 = halbe Auflösung)
export function retroScale() { return 2; }

// Tag und Nacht in Bildschirmkoordinaten (CSS-Pixel)
function drawDayNight(c, w, h, p, cam, z) {
  const dark = darkness();
  const warm = warmth();
  if (warm > 0) { c.fillStyle = `rgba(255,140,60,${warm * 0.14})`; c.fillRect(0, 0, w, h); }
  if (dark <= 0.01) return;
  c.fillStyle = `rgba(14,20,52,${dark})`;
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'lighter';
  for (const L of lights) {
    const sx = (isoX(L.x, L.y) - cam.x) * z + w / 2, sy = (isoY(L.x, L.y) - L.z - cam.y) * z + h / 2;
    if (sx < -100 || sy < -100 || sx > w + 100 || sy > h + 100) continue;
    const r = L.r * z * (1 + Math.sin(G.time * 9 + L.x) * 0.04);
    const g = c.createRadialGradient(sx, sy, 0, sx, sy, r * 2);
    g.addColorStop(0, `rgba(255,190,100,${0.55 * L.s * dark / 0.62})`);
    g.addColorStop(1, 'rgba(255,150,60,0)');
    c.fillStyle = g;
    c.fillRect(sx - r * 2, sy - r * 2, r * 4, r * 4);
  }
  const ps = toScreen(p.x, p.y);
  const g = c.createRadialGradient(ps.x, ps.y - 10, 0, ps.x, ps.y - 10, 120 * z);
  g.addColorStop(0, `rgba(255,200,120,${0.35 * dark / 0.62})`);
  g.addColorStop(1, 'rgba(255,160,80,0)');
  c.fillStyle = g; c.fillRect(ps.x - 130 * z, ps.y - 140 * z, 260 * z, 260 * z);
  c.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- Hauptschleife
export function initRender(cv) { canvas = cv; ctx = cv.getContext('2d'); }

export function resetRender() {
  chunkCache.clear();
  cacheSeason = -1;
  sprites = null;
  staticParts = buildStaticParts();
  G.castleDirty = true;
  minimapBase = null;
  smoke = [];
  birds = [];
}

// Alle Zwischenbilder freigeben (beim Neuladen einer neuen Fassung im selben Fenster)
export function releaseRender() {
  chunkCache.clear();
  partCache.clear();
  sprites = null;
  minimapBase = null;
  lowCv = null; lowCtx = null;
  for (const cv of [canvas]) if (cv) { cv.width = 1; cv.height = 1; }
}

export function onSeasonChanged() { chunkCache.clear(); minimapBase = null; G.castleDirty = true; }

// Neue gemalte Grafik geladen: Bäume und Boden neu aufbauen
onArt((id) => {
  if (/^(laub|nadel|busch|fels|schilf|baum|wildblumen)/.test(id)) sprites = null;
  if (/^(wiese|heide|waldboden|acker|weg|wasser|schnee|fels|sand|kies|klippe|pflaster|schlamm)/.test(id)) { chunkCache.clear(); minimapBase = null; }
  // Burgteile: die festen Teile neu zusammenstellen (Tore und Hallen fragen beim Aufbau, ob es ein Bild gibt)
  if (id.startsWith('burg_stein_mauer_')) mirrorWall(id);
  if (id.startsWith('burg_')) { G.staticDirty = true; G.castleDirty = true; }
  // Gemalte Häuser: zwischengespeicherte Hausbilder neu zeichnen
  if (id.startsWith('bau_') || id.startsWith('pal_')) { partCache.clear(); G.staticDirty = true; }
});

export function zAt(x, y) { return G.world ? groundZ(G.world, x, y) : 0; }

// Bildschirmpunkt -> Weltpunkt auf dem Gelände (berücksichtigt die Höhe)
export function screenToGround(px, py) {
  const { w, h } = G.view;
  let wp = screenToWorld(px, py, G.cam, w, h);
  for (let k = 0; k < 4; k++) wp = screenToWorld(px, py + zAt(wp.x, wp.y) * G.cam.zoom, G.cam, w, h);
  return wp;
}

// Für Tests: Weltpunkt auf dem Bildschirm
export function tileToScreen(x, y) { return toScreen(x, y); }
function toScreen(x, y) {
  const { w, h } = G.view, cam = G.cam;
  return { x: (isoX(x, y) - cam.x) * cam.zoom + w / 2, y: (isoY(x, y) - zAt(x, y) - cam.y) * cam.zoom + h / 2 };
}

let lastFrame = 0;
export function render() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  const { w, h, dpr } = G.view;
  const cam = G.cam;
  const z = cam.zoom;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1a2018';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  workSounds = [];
  if (!G.world || !G.s) return;
  ensureSprites();
  if (cacheSeason !== lookKey()) { chunkCache.clear(); cacheSeason = lookKey(); }
  if (G.castleDirty) { castleParts = buildPlayerCastle(); G.castleDirty = false; }
  if (G.staticDirty) { staticParts = buildStaticParts(); G.staticDirty = false; }
  lights = [];

  // Welt zeichnen (im Pixel- und Retro-Modus in halber Auflösung)
  let wc = ctx, ws = dpr;
  const mode = G.gfx || 'klar';
  const low = mode !== 'klar', retro = mode === 'retro';
  const rk = low ? retroScale() : 1;
  if (low) {
    const pw = Math.max(1, Math.ceil(w / rk)), ph = Math.max(1, Math.ceil(h / rk));
    if (!lowCv || lowCv.width !== pw || lowCv.height !== ph) { lowCv = makeCanvas(pw, ph); lowCtx = lowCv.getContext('2d', { willReadFrequently: true }); }
    wc = lowCtx; ws = 1 / rk;
    wc.setTransform(1, 0, 0, 1, 0, 0);
    wc.fillStyle = '#1a2018'; wc.fillRect(0, 0, pw, ph);
  }
  wc.setTransform(ws * z, 0, 0, ws * z, ws * (w / 2 - cam.x * z), ws * (h / 2 - cam.y * z));

  const c1 = screenToWorld(0, 0, cam, w, h), c2 = screenToWorld(w, 0, cam, w, h), c3 = screenToWorld(0, h, cam, w, h), c4 = screenToWorld(w, h, cam, w, h);
  const minX = Math.min(c1.x, c2.x, c3.x, c4.x) - 3, maxX = Math.max(c1.x, c2.x, c3.x, c4.x) + 6;
  const minY = Math.min(c1.y, c2.y, c3.y, c4.y) - 3, maxY = Math.max(c1.y, c2.y, c3.y, c4.y) + 7;
  const W = G.world, CN = W.CN;
  const cx0 = Math.max(0, Math.floor(minX / CHUNK)), cx1 = Math.min(CN - 1, Math.floor(maxX / CHUNK));
  const cy0 = Math.max(0, Math.floor(minY / CHUNK)), cy1 = Math.min(CN - 1, Math.floor(maxY / CHUNK));
  const isoL = cam.x - w / 2 / z - 80, isoR = cam.x + w / 2 / z + 80, isoT = cam.y - h / 2 / z - 140, isoB = cam.y + h / 2 / z + 120;

  const cs = low ? 1 : Math.max(1, Math.min(3, Math.ceil(z * dpr - 0.15)));
  cacheOn = low || z * dpr <= 2.6;
  cacheScale = low ? 1 : Math.max(1, Math.min(2, Math.ceil(z * dpr - 0.15)));
  // Platz für alles, was im letzten Bild zu sehen war, plus Reserve (kein ständiges Neuzeichnen)
  cacheMax = Math.max(Math.floor(300 / (cacheScale * cacheScale)), Math.ceil(cacheUsed * 1.3) + 20);
  cacheUsed = 0;
  let nVis = 0;
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const ch = getChunk(cx, cy, cs);
    nVis++;
    if (ch.x > isoR || ch.x + ch.w < isoL || ch.y > isoB || ch.y + ch.h < isoT) continue;
    wc.drawImage(ch.cvs, ch.x, ch.y, ch.w, ch.h);
  }
  chunksVisible = nVis;
  drawSlab(wc, minX, maxX, minY, maxY);
  drawWaterShimmer(wc, minX, maxX, minY, maxY);

  // Wegmarken
  const p = G.s.player;
  if (p.path && p.path.length) {
    wc.fillStyle = 'rgba(255,230,150,0.6)';
    for (let k = p.pathI; k < p.path.length; k++) { const q = p.path[k]; wc.beginPath(); wc.ellipse(isoX(q.x, q.y), isoY(q.x, q.y) - zAt(q.x, q.y), 2.5, 1.3, 0, 0, Math.PI * 2); wc.fill(); }
  }
  if (G.clickMarker) {
    const m = G.clickMarker;
    m.t += dt;
    if (m.t > 0.8) G.clickMarker = null;
    else {
      wc.strokeStyle = `rgba(255,220,120,${1 - m.t / 0.8})`; wc.lineWidth = 1.5;
      wc.beginPath(); wc.ellipse(isoX(m.x, m.y), isoY(m.x, m.y) - zAt(m.x, m.y), 6 + m.t * 14, 3 + m.t * 7, 0, 0, Math.PI * 2); wc.stroke();
    }
  }

  // Objekte sammeln und nach Tiefe sortieren
  const objs = [];
  const inView = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;
  const lists = tourneyLayout(), listsCore = lists && tourneyCore(lists.lx, lists.ly, lists.knights.length);
  const gallows = [];
  for (const s of W.sites) {
    if (s.x < minX - 24 || s.x > maxX + 24 || s.y < minY - 24 || s.y > maxY + 24) continue;
    const g = gallowsFor(s);
    if (g && inView(g.x, g.y)) gallows.push(g);
  }
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    for (const o of W.chunkObjs[cy * CN + cx]) {
      const ix = isoX(o.x, o.y);
      if (ix < isoL || ix > isoR) continue;
      if (listsCore && Math.abs(o.x - lists.lx) < 11 && Math.abs(o.y - lists.ly) < 5 && listsCore.some((q) => o.x > q.x0 && o.x < q.x1 && o.y > q.y0 && o.y < q.y1)) continue;
      if (gallows.length && gallows.some((g) => Math.abs(o.x - g.x) < 2 && Math.abs(o.y - g.y) < 2.2)) continue;
      if (o.kind === 'mauer') objs.push({ d: o.x + o.y, z: groundZ(W, o.x, o.y), f: (c) => drawWallRuin(c, o) });
      else if (o.kind === 'feld') { if (ART.feld_brach_x) objs.push({ d: o.x + o.y - 0.15, z: groundZ(W, o.x, o.y), f: (c) => drawFieldObj(c, o) }); }
      else objs.push({ d: o.x + o.y, z: 0, f: (c) => drawTreeObj(c, o), box: o.box || (o.box = [o.x - 0.25, o.x + 0.25, o.y - 0.25, o.y + 0.25]) });
    }
  }
  for (const part of staticParts) if (inView(part.x, part.y)) objs.push(part);
  if (G.siege) {
    const sg = G.siege;
    if (sg.stage !== 'anmarsch') {
      for (const t of sg.tents) if (inView(t.x, t.y)) objs.push({ d: t.x + t.y, z: zAt(t.x, t.y), f: (c) => drawTent(c, { x: t.x, y: t.y, wx: 0.9, wy: 0.9, color: FACTIONS[sg.army.faction].color }) });
      if (inView(sg.tre.x, sg.tre.y)) objs.push({ d: sg.tre.x + sg.tre.y, z: zAt(sg.tre.x, sg.tre.y), f: (c) => drawTrebuchet(c, sg.tre) });
    }
    for (const sh of sg.shots) objs.push({ d: 1e6, z: 0, f: (c) => drawSiegeShot(c, sh) });
  }
  for (const part of tourneyParts()) if (inView(part.x, part.y)) objs.push(part);
  for (const part of siegeGateParts()) if (inView(part.x, part.y)) objs.push(part);
  for (const s of W.sites) if (s.type === 'einsiedelei' && inView(s.x, s.y)) objs.push({ d: s.x + s.y + 3, z: zAt(s.x, s.y), f: (c) => drawMysticGlow(c, s) });
  for (const g of gallows) objs.push({ d: g.x + g.y, z: zAt(g.x, g.y), f: (c) => drawGallows(c, g, G.exec && G.exec.g === g && G.exec.hanged) });
  for (const f of G.fx) {
    if (f.kind === 'pferd' && inView(f.x, f.y)) objs.push({ d: f.x + f.y + 0.1, z: zAt(f.x, f.y), f: (c) => drawLooseHorse(c, f) });
    else if (f.kind === 'splitter') objs.push({ d: 1e6, z: zAt(f.x, f.y), f: (c) => drawSplinter(c, f) });
  }
  for (const g of funeralProps()) if (inView(g.x, g.y)) objs.push({ d: g.x + g.y - 0.4, z: zAt(g.x, g.y), f: (c) => drawOpenGrave(c, g) });
  for (const f of G.fx) if (f.kind === 'staub' && inView(f.x, f.y)) objs.push({ d: f.x + f.y + 1, z: zAt(f.x, f.y), f: (c) => { const k = f.t / f.dur, [px, py] = P(f.x, f.y, 10); c.globalAlpha = Math.max(0, 0.7 * (1 - k)); c.fillStyle = f.col || '#8a7a66'; c.beginPath(); c.arc(px, py - k * 14, 8 + k * 22, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; } });
  for (const part of castleParts) if (inView(part.x, part.y)) objs.push(part);
  for (const u of G.units) {
    if (u.hidden || (u.dead && u.kind !== 'player') || !inView(u.x, u.y)) continue;
    objs.push({ d: u.x + u.y + 0.05, z: 0, f: (c) => drawFigure(c, u, isoX(u.x, u.y), isoY(u.x, u.y) - zAt(u.x, u.y)), box: [u.x - 0.15, u.x + 0.15, u.y - 0.15, u.y + 0.15] });
  }
  const night = darkness() > 0.4;
  for (const a of G.animals || []) {
    if (!inView(a.x, a.y) || (night && a.kind === 'huhn')) continue;
    objs.push({ d: a.x + a.y, z: 0, box: [a.x - 0.2, a.x + 0.2, a.y - 0.2, a.y + 0.2], f: (c) => { const ax = isoX(a.x, a.y), ay = isoY(a.x, a.y) - zAt(a.x, a.y); if (G.s.player.huntTarget === a) { c.strokeStyle = 'rgba(255,120,80,0.9)'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(ax, ay, 11, 4.5, 0, 0, Math.PI * 2); c.stroke(); } drawAnimal(c, a, ax, ay); } });
  }
  for (const f of G.fx) if (f.kind === 'kadaver' && inView(f.x, f.y)) objs.push({ d: f.x + f.y - 0.3, z: 0, f: (c) => drawCarcass(c, f, isoX(f.x, f.y), isoY(f.x, f.y) - zAt(f.x, f.y)) });
  for (const f of G.fx) if (f.kind === 'corpse' && inView(f.x, f.y)) objs.push({ d: f.x + f.y - 0.3, z: 0, f: (c) => drawCorpse(c, f, isoX(f.x, f.y), isoY(f.x, f.y) - zAt(f.x, f.y)) });
  for (const o of sortObjects(objs)) { baseZ = o.z || 0; o.f(wc); }
  baseZ = 0;

  for (const part of staticParts) if (part.b && part.b.smoke && inView(part.x, part.y)) smokeEmit(part.b.smoke[0], part.b.smoke[1], 0.04);
  drawSmoke(wc, dt);

  // Geschosse
  for (const pr of G.projectiles) {
    const k = pr.t / pr.dur;
    const x = pr.x + (pr.tx - pr.x) * k, y = pr.y + (pr.ty - pr.y) * k;
    const d = Math.hypot(pr.tx - pr.x, pr.ty - pr.y);
    const zz = 14 + (pr.z0 || 0) * (1 - k) + Math.sin(k * Math.PI) * d * (pr.bolt ? 1.5 : 4) + zAt(x, y);
    const sx = isoX(x, y), sy = isoY(x, y) - zz;
    const dx = isoX(pr.tx, pr.ty) - isoX(pr.x, pr.y), dy = isoY(pr.tx, pr.ty) - isoY(pr.x, pr.y);
    const l = Math.hypot(dx, dy) || 1;
    wc.strokeStyle = '#3a2a1a'; wc.lineWidth = 1.4;
    wc.beginPath(); wc.moveTo(sx - (dx / l) * 7, sy - (dy / l) * 7 + (k - 0.5) * 4); wc.lineTo(sx, sy); wc.stroke();
  }

  // Retro-Modus: Vögel, Nacht und Schnee noch in die Pixelebene, dann Palette und Dithering
  if (retro) {
    wc.setTransform(ws, 0, 0, ws, 0, 0);
    drawBirds(wc, w, h, dt);
    quantizeRetro(wc, lowCv.width, lowCv.height);
  }
  if (low) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(lowCv, 0, 0, lowCv.width * rk * dpr, lowCv.height * rk * dpr);
    ctx.imageSmoothingEnabled = true;
  }

  // Ab hier Bildschirmkoordinaten
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!retro) drawBirds(ctx, w, h, dt);

  ctx.font = 'bold 13px "Alegreya Sans", sans-serif';
  ctx.textAlign = 'center';
  for (const f of G.fx) {
    if (f.kind !== 'text') continue;
    if (f.t < 0) continue;
    const sp = toScreen(f.x, f.y);
    const y = sp.y - (34 + f.t * 26) * z;
    ctx.globalAlpha = Math.max(0, 1 - f.t / f.dur);
    ctx.strokeStyle = 'rgba(20,10,5,0.85)'; ctx.lineWidth = 3; ctx.strokeText(f.text, sp.x, y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, sp.x, y);
  }
  ctx.globalAlpha = 1;

  // Tag und Nacht: sanft über das fertige Bild, in allen Grafikstufen gleich gut lesbar
  drawDayNight(ctx, w, h, p, cam, z);
  drawWeather(ctx, w, h, dt);

  drawSpeech(ctx, z, inView);
  if (G.tour && G.tour.aim) drawAimBar(ctx, w, h, G.tour.aim);
  // Sehenswürdigkeiten
  ctx.textAlign = 'center';
  for (const p of W.pois || []) {
    if (p.kind === 'wall' || !inView(p.x, p.y)) continue;
    const sp = toScreen(p.x, p.y);
    ctx.font = `italic 600 ${Math.round(12 + z * 2)}px "IM Fell English SC", Georgia, serif`;
    const yy = sp.y - 46 * z, tw = ctx.measureText(p.name).width;
    ctx.fillStyle = 'rgba(28,20,14,0.62)'; ctx.fillRect(sp.x - tw / 2 - 8, yy - 13, tw + 16, 18);
    ctx.fillStyle = '#e8dcb8'; ctx.fillText(p.name, sp.x, yy);
  }
  // Ortsnamen
  ctx.textAlign = 'center';
  for (const s of W.sites) {
    if (!inView(s.x, s.y)) continue;
    const sp = toScreen(s.x, s.y);
    const yy = sp.y - (s.type === 'spieler' || s.type === 'burg' ? 125 : 72) * z;
    ctx.font = `600 ${Math.round(13 + z * 2)}px "IM Fell English SC", Georgia, serif`;
    const label = abandonedId(s.id) ? `${s.name} · verlassen` : s.name;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(28,20,14,0.72)';
    ctx.fillRect(sp.x - tw / 2 - 10, yy - 14, tw + 20, 20);
    ctx.fillStyle = s.faction ? FACTIONS[s.faction].color : '#d6ad4c';
    ctx.fillRect(sp.x - tw / 2 - 10, yy + 5, tw + 20, 2);
    ctx.fillStyle = '#f3ead2';
    ctx.fillText(label, sp.x, yy);
  }
  if (G.hover && !G.hover.dead) {
    const u = G.hover;
    const sp = toScreen(u.x, u.y);
    ctx.font = '600 12px "Alegreya Sans", sans-serif';
    const label = `${u.name}${u.kind !== 'peasant' ? ` · Stufe ${u.level}` : u.role === 'bettler' ? ' · Klick: Almosen geben' : u.condemned ? ' · Klick: befreien' : ''}`;
    const tw = ctx.measureText(label).width;
    const yy = sp.y - (u.mounted ? 56 : 44) * FIG * z;
    ctx.fillStyle = 'rgba(28,20,14,0.82)'; ctx.fillRect(sp.x - tw / 2 - 6, yy - 12, tw + 12, 17);
    ctx.fillStyle = u.group && (u.group.engaged || u.group.provoked) ? '#ff9a80' : '#f3ead2';
    ctx.fillText(label, sp.x, yy);
  } else if (G.hoverAnimal && !G.hoverAnimal.dead) {
    const a = G.hoverAnimal;
    const sp = toScreen(a.x, a.y);
    ctx.font = '600 12px "Alegreya Sans", sans-serif';
    const label = G.animalTitle ? G.animalTitle(a) : a.kind;
    const tw = ctx.measureText(label).width;
    const yy = sp.y - 26 * z;
    ctx.fillStyle = 'rgba(28,20,14,0.84)'; ctx.fillRect(sp.x - tw / 2 - 6, yy - 12, tw + 12, 17);
    ctx.fillStyle = '#f3ead2'; ctx.fillText(label, sp.x, yy);
  } else if (G.hoverBuilding) {
    const a = G.hoverBuilding;
    const sp = toScreen(a.x, a.y);
    ctx.font = '600 13px "Alegreya Sans", sans-serif';
    const tw = ctx.measureText(a.label).width;
    const yy = sp.y - (a.h + 22) * z;
    ctx.fillStyle = 'rgba(28,20,14,0.86)'; ctx.fillRect(sp.x - tw / 2 - 7, yy - 13, tw + 14, 19);
    ctx.strokeStyle = 'rgba(214,173,76,0.7)'; ctx.lineWidth = 1; ctx.strokeRect(sp.x - tw / 2 - 7, yy - 13, tw + 14, 19);
    ctx.fillStyle = '#f3ead2';
    ctx.fillText(a.label, sp.x, yy);
  }
  drawEventPointers(ctx, w, h);
  drawCelebration(ctx, dt);
  drawCompass(ctx, w, h);
}

function drawCompass(c, w, h) {
  const cx = w - 46, cy = h - (w < 720 ? 128 : 96), r = 22;
  c.save();
  c.translate(cx, cy);
  c.fillStyle = 'rgba(28,20,14,0.62)';
  c.beginPath(); c.arc(0, 0, r + 9, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(214,173,76,0.75)'; c.lineWidth = 1.2;
  c.beginPath(); c.arc(0, 0, r + 6, 0, Math.PI * 2); c.stroke();
  // Richtungen im Bild: Norden ist Kachel -y, Osten +x
  const dir = (dx, dy) => { const sx = (dx - dy) * HW, sy = (dx + dy) * HH, l = Math.hypot(sx, sy); return [sx / l, sy / l]; };
  const pts = [['N', dir(0, -1), '#e8c35a'], ['O', dir(1, 0), '#e9dfc6'], ['S', dir(0, 1), '#e9dfc6'], ['W', dir(-1, 0), '#e9dfc6']];
  for (const [label, [ux, uy], col] of pts) {
    const vx = -uy, vy = ux;
    c.fillStyle = label === 'N' ? '#c9483a' : 'rgba(233,223,198,0.85)';
    c.beginPath(); c.moveTo(ux * r, uy * r); c.lineTo(vx * 4, vy * 4); c.lineTo(-vx * 4, -vy * 4); c.closePath(); c.fill();
    c.font = `700 ${label === 'N' ? 13 : 10}px "IM Fell English SC", Georgia, serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = col;
    c.fillText(label, ux * (r + 15), uy * (r + 15));
  }
  c.fillStyle = '#d6ad4c'; c.beginPath(); c.arc(0, 0, 2.5, 0, Math.PI * 2); c.fill();
  c.restore();
  c.textBaseline = 'alphabetic';
}

// ---------------------------------------------------------------- Minikarte
const MINI_COL = [
  ['#3e7393', '#6f9b45', '#3f6a2c', '#8c9259', '#b39a6e', '#a8b85a', '#8a6a42', '#cdbd8c'],
  ['#3b7090', '#7d9d3f', '#3d6429', '#979159', '#b39a6e', '#d4b64f', '#8a6a42', '#d5c493'],
  ['#3a6683', '#8e9045', '#6a5a2c', '#918259', '#a88d66', '#9e7c3d', '#8a6a42', '#c4b083'],
  ['#8fb0c2', '#dfe6e6', '#a9b8b5', '#c9cfcb', '#a49d90', '#d8dddc', '#8a6a42', '#dadcd6'],
  ['#3a6680', '#7f8a50', '#5c5a36', '#8a8660', '#9e8662', '#8a6e48', '#8a6a42', '#c4b48a'],
];

function buildMinimap() {
  const W = G.world, N = W.N, M = W.M;
  const cv = makeCanvas(N, N);
  const g = cv.getContext('2d');
  const img = g.createImageData(N, N);
  const cols = MINI_COL[lookSeason()].map((hx) => { const n = parseInt(hx.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, t = W.tiles[k];
    let f = 1;
    if (t === T.WATER) f = W.sea[k] ? 0.86 : 1.08;
    else f = 1 + Math.max(-0.28, Math.min(0.26, (W.vh[j * M + i] - W.vh[(j + 1) * M + i + 1]) / 14));
    const col = cols[t], o = k * 4;
    img.data[o] = Math.min(255, col[0] * f); img.data[o + 1] = Math.min(255, col[1] * f); img.data[o + 2] = Math.min(255, col[2] * f); img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  minimapBase = cv;
  minimapSeason = lookKey();
}

// Kartenansicht: v = { ox, oy, s, dx, dy } (Welt -> Bild: (x - ox) * s + dx)
export function miniPos(x, y, v) { return { x: (x - v.ox) * v.s + v.dx, y: (y - v.oy) * v.s + v.dy }; }
export function miniToWorld(mx, my, v) { return { x: (mx - v.dx) / v.s + v.ox, y: (my - v.dy) / v.s + v.oy }; }

export function drawMap(c, w, h, opts = {}) {
  if (!minimapBase || minimapSeason !== lookKey()) buildMinimap();
  const W = G.world, N = W.N;
  const p = G.s.player;
  const big = !!opts.big;
  let v;
  if (big) {
    // Große Karte: Zoomstufe 1 zeigt alles, darüber ein Ausschnitt um (cx, cy)
    const s = (Math.min(w, h) / N) * (opts.zoom || 1);
    const fit = (len, c) => (N * s <= len ? { o: 0, d: (len - N * s) / 2 } : { o: Math.max(0, Math.min(N - len / s, c - len / (2 * s))), d: 0 });
    const fx = fit(w, opts.cx ?? N / 2), fy = fit(h, opts.cy ?? N / 2);
    v = { ox: fx.o, oy: fy.o, s, dx: fx.d, dy: fy.d };
  } else {
    const s = opts.zoom || 2.3;
    v = { ox: p.x - w / (2 * s), oy: p.y - h / (2 * s), s, dx: 0, dy: 0 };
  }
  c.clearRect(0, 0, w, h);
  c.fillStyle = '#35627d'; c.fillRect(0, 0, w, h);
  c.imageSmoothingEnabled = false;
  c.drawImage(minimapBase, v.dx - v.ox * v.s, v.dy - v.oy * v.s, N * v.s, N * v.s);
  c.imageSmoothingEnabled = true;
  if (big) drawMapDecor(c, v);
  for (const g of G.groups) {
    if (g.army) {
      const q = miniPos(g.x, g.y, v);
      c.fillStyle = FACTIONS[g.faction].color; c.strokeStyle = '#1d140c'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(q.x, q.y, big ? 6 : 4.5, 0, Math.PI * 2); c.fill(); c.stroke();
      continue;
    }
    if (Math.hypot(g.x - p.x, g.y - p.y) > (big ? 30 : 24)) continue;
    const q = miniPos(g.x, g.y, v);
    c.fillStyle = g.engaged || g.provoked ? '#ff4a3a' : g.faction ? FACTIONS[g.faction].color : '#3a2a1a';
    c.beginPath(); c.arc(q.x, q.y, big ? 3 : 2.4, 0, Math.PI * 2); c.fill();
  }
  for (const qq of G.s.quests) {
    const t = questTarget(qq);
    const q = miniPos(t.x, t.y, v);
    c.strokeStyle = '#ffe066'; c.lineWidth = big ? 2 : 1.4;
    c.beginPath(); c.arc(q.x, q.y, big ? 7 : 5, 0, Math.PI * 2); c.stroke();
  }
  c.textAlign = 'center';
  const RANK = { spieler: 0, stadt: 1, burg: 2, abtei: 3, markt: 4, halle: 5, dorf: 6, lager: 7, mine: 8, einsiedelei: 9 };
  const placed = [];
  // Ereignisse (Belagerung, Schlacht, Turnier): Platz für Symbol und Beschriftung freihalten
  const marks = eventMarks().map((mk) => {
    const q = miniPos(mk.x, mk.y, v), r = big ? 10 : 6.5;
    placed.push({ x0: q.x - r - 2, y0: q.y - r - 2, x1: q.x + r + 2, y1: q.y + r + 2 });
    let cap = null;
    if (big) {
      c.font = '700 12px "Alegreya Sans", sans-serif';
      const tw = c.measureText(mk.label).width;
      cap = { x: q.x, y: q.y + r + 15, tw };
      placed.push({ x0: q.x - tw / 2 - 4, y0: cap.y - 12, x1: q.x + tw / 2 + 4, y1: cap.y + 4 });
    }
    return { mk, q, r, cap };
  });
  const order = W.sites.slice().sort((a, b) => RANK[a.type] - RANK[b.type]);
  for (const s of order) {
    const q = miniPos(s.x, s.y, v);
    if (q.x < -20 || q.y < -20 || q.x > w + 20 || q.y > h + 20) continue;
    const col = abandonedId(s.id) ? '#7a7468' : s.faction ? FACTIONS[s.faction].color : '#ffd65a';
    const r = big ? (s.type === 'stadt' || s.type === 'spieler' ? 4.5 : 3.5) : 3;
    if (s.type === 'einsiedelei') {
      // Mystischer Ort: kleiner heller Stern
      c.fillStyle = '#1d140c'; c.beginPath(); c.arc(q.x, q.y, r + 1.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#d8f0a8'; c.beginPath();
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r * 1.05; c.lineTo(q.x + Math.cos(a) * rr, q.y + Math.sin(a) * rr); }
      c.closePath(); c.fill();
    } else if (s.type === 'mine') {
      // Grube: dunkles Dreieck wie eine Halde
      c.fillStyle = '#1d140c'; c.beginPath(); c.moveTo(q.x, q.y - r - 2); c.lineTo(q.x + r + 2, q.y + r + 1); c.lineTo(q.x - r - 2, q.y + r + 1); c.closePath(); c.fill();
      c.fillStyle = col; c.beginPath(); c.moveTo(q.x, q.y - r); c.lineTo(q.x + r, q.y + r * 0.85); c.lineTo(q.x - r, q.y + r * 0.85); c.closePath(); c.fill();
    } else {
      c.fillStyle = '#1d140c'; c.fillRect(q.x - r - 1, q.y - r - 1, r * 2 + 2, r * 2 + 2);
      c.fillStyle = col; c.fillRect(q.x - r, q.y - r, r * 2, r * 2);
    }
    placed.push({ x0: q.x - r - 1, y0: q.y - r - 1, x1: q.x + r + 1, y1: q.y + r + 1 });
    if (!big && v.s < 4) continue;
    const fs = big ? (s.type === 'stadt' || s.type === 'spieler' ? 13 : 11) : 11;
    c.font = `600 ${fs}px "Alegreya Sans", sans-serif`;
    const label = s.type === 'lager' ? s.name.replace(/^Lager im /, '') : s.name;
    const tw = c.measureText(label).width;
    // Über, unter, rechts oder links vom Ort, sonst weglassen
    const spots = [[q.x, q.y - r - 4, 'center'], [q.x, q.y + r + fs + 1, 'center'], [q.x + r + 3, q.y + fs * 0.35, 'left'], [q.x - r - 3, q.y + fs * 0.35, 'right']];
    for (const [lx, ly, al] of spots) {
      const x0 = al === 'center' ? lx - tw / 2 : al === 'left' ? lx : lx - tw;
      const box = { x0: x0 - 1, y0: ly - fs + 2, x1: x0 + tw + 1, y1: ly + 2 };
      if (placed.some((o) => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0)) continue;
      placed.push(box);
      c.textAlign = al;
      c.lineWidth = 3; c.strokeStyle = 'rgba(20,12,6,0.85)';
      c.strokeText(label, lx, ly); c.fillStyle = s.type === 'spieler' ? '#ffe9a0' : '#f3ead2'; c.fillText(label, lx, ly);
      break;
    }
  }
  c.textAlign = 'center';
  for (const { mk, q, r, cap } of marks) {
    const k = big ? 0.35 : ((G.time || 0) * 0.8) % 1;
    c.strokeStyle = mk.col; c.globalAlpha = 0.85 * (1 - k); c.lineWidth = 2;
    c.beginPath(); c.arc(q.x, q.y, r + 2 + k * r * 1.3, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
    drawEventIcon(c, mk, q.x, q.y, r);
    if (cap) {
      c.font = '700 12px "Alegreya Sans", sans-serif';
      c.lineWidth = 3; c.strokeStyle = 'rgba(20,12,6,0.9)'; c.strokeText(mk.label, cap.x, cap.y);
      c.fillStyle = mk.col; c.fillText(mk.label, cap.x, cap.y);
    }
  }
  const q = miniPos(p.x, p.y, v);
  c.fillStyle = '#ffffff'; c.strokeStyle = '#1d140c'; c.lineWidth = 2;
  c.beginPath(); c.arc(q.x, q.y, big ? 5 : 3.4, 0, Math.PI * 2); c.stroke(); c.fill();
  if (!big) {
    const { w: vw, h: vh } = G.view;
    const corners = [[0, 0], [vw, 0], [vw, vh], [0, vh]].map(([sx, sy]) => { const wp = screenToWorld(sx, sy, G.cam, vw, vh); return miniPos(wp.x, wp.y, v); });
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1;
    c.beginPath(); corners.forEach((pt, k) => (k ? c.lineTo(pt.x, pt.y) : c.moveTo(pt.x, pt.y))); c.closePath(); c.stroke();
    c.font = '700 11px "IM Fell English SC", Georgia, serif';
    c.fillStyle = '#e8c35a'; c.textAlign = 'center';
    c.fillText('N', w - 9, 13);
  }
  return v;
}

// ---------------------------------------------------------------- Ereignisse markieren
// Belagerung, Feldschlacht und angekündigtes Turnier: auf beiden Karten und als Pfeil am Bildrand
export function eventMarks() {
  const out = [];
  const sg = G.siege;
  if (sg) {
    const name = sg.site.type === 'spieler' ? homeName() : sg.site.name;
    out.push({ kind: 'siege', x: sg.site.x, y: sg.site.y, label: `Belagerung von ${name}`, short: 'Belagerung', col: '#ff6a4a', reach: 170 });
  }
  if (G.battle) out.push({ kind: 'battle', x: G.battle.x, y: G.battle.y, label: 'Feldschlacht', short: 'Schlacht', col: '#ff6a4a', reach: 120 });
  const tr = G.s && G.s.tourney;
  if (tr && !tr.done) {
    const host = G.world.sites.find((s) => s.id === tr.site);
    const when = tr.day === G.s.day ? 'heute' : tr.day === G.s.day + 1 ? 'morgen' : `Tag ${tr.day}`;
    out.push({ kind: 'tourney', x: tr.lx, y: tr.ly, label: `Turnier in ${host ? host.name : ''} · ${when}`, short: `Turnier ${when}`, col: '#ffd65a', reach: tr.day - G.s.day <= 1 ? 170 : 0 });
  }
  return out;
}

function drawEventIcon(c, mk, x, y, r) {
  c.fillStyle = '#1d140c'; c.beginPath(); c.arc(x, y, r + 1.5, 0, Math.PI * 2); c.fill();
  c.strokeStyle = mk.col; c.lineWidth = Math.max(1.5, r * 0.16); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
  const u = r / 10;
  if (mk.kind === 'siege') {
    // Turm mit Zinnen und Flamme
    c.fillStyle = '#d9d1bd';
    c.fillRect(x - 3.6 * u, y - 3 * u, 7.2 * u, 8.2 * u);
    for (let k = 0; k < 3; k++) c.fillRect(x - 3.6 * u + k * 2.8 * u, y - 5 * u, 1.6 * u, 2.2 * u);
    c.fillStyle = '#1d140c'; c.fillRect(x - 1 * u, y + 1.6 * u, 2 * u, 3.6 * u);
    c.fillStyle = '#ff8a3a'; c.beginPath(); c.moveTo(x + 2.2 * u, y - 9 * u); c.quadraticCurveTo(x + 6.5 * u, y - 4.5 * u, x + 3.6 * u, y - 2.6 * u); c.quadraticCurveTo(x + 1 * u, y - 4 * u, x + 2.2 * u, y - 9 * u); c.fill();
  } else if (mk.kind === 'battle') {
    // Gekreuzte Schwerter
    c.strokeStyle = '#e9dfc6'; c.lineWidth = Math.max(1.4, 1.6 * u); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - 5.5 * u, y - 5.5 * u); c.lineTo(x + 5 * u, y + 5 * u); c.moveTo(x + 5.5 * u, y - 5.5 * u); c.lineTo(x - 5 * u, y + 5 * u); c.stroke();
    c.strokeStyle = '#ff6a4a';
    c.beginPath(); c.moveTo(x + 1.6 * u, y + 4.4 * u); c.lineTo(x + 4.4 * u, y + 1.6 * u); c.moveTo(x - 1.6 * u, y + 4.4 * u); c.lineTo(x - 4.4 * u, y + 1.6 * u); c.stroke();
    c.lineCap = 'butt';
  } else {
    // Lanze mit Wimpel
    c.strokeStyle = '#e9dfc6'; c.lineWidth = Math.max(1.4, 1.5 * u); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - 5 * u, y + 6 * u); c.lineTo(x + 4 * u, y - 6.5 * u); c.stroke();
    c.lineCap = 'butt';
    c.fillStyle = '#c9483a'; c.beginPath(); c.moveTo(x + 3 * u, y - 5 * u); c.lineTo(x + 7.5 * u, y - 2.6 * u); c.lineTo(x + 1.6 * u, y - 1.8 * u); c.closePath(); c.fill();
    c.fillStyle = '#ffd65a'; c.beginPath(); c.moveTo(x + 2.4 * u, y - 3.8 * u); c.lineTo(x + 5 * u, y - 2.6 * u); c.lineTo(x + 1.9 * u, y - 2.2 * u); c.closePath(); c.fill();
  }
}

// Im Bild: ein Schild über dem Ort. Außerhalb: ein Pfeil am Bildrand mit Entfernung.
function drawEventPointers(c, w, h) {
  const p = G.s.player;
  const t = G.time || 0;
  for (const mk of eventMarks()) {
    const d = Math.hypot(mk.x - p.x, mk.y - p.y);
    if (d > mk.reach) continue;
    // Mitten in der Belagerung braucht es keinen Pfeil
    if (mk.kind === 'siege' && (d < 24 || Math.hypot(G.siege.camp.x - p.x, G.siege.camp.y - p.y) < 16)) continue;
    const sp = toScreen(mk.x, mk.y);
    const z = G.cam.zoom;
    const mL = 34, mR = w - 34, mT = 70, mB = h - 96;
    const inside = sp.x > mL && sp.x < mR && sp.y > mT && sp.y < mB;
    c.font = '700 12px "Alegreya Sans", sans-serif';
    c.textAlign = 'center';
    if (inside) {
      if (mk.kind === 'battle') continue;
      const site = mk.kind === 'siege' ? G.siege.site : null;
      const up = site ? (site.type === 'spieler' || site.type === 'burg' ? 150 : 98) : 64;
      const y = sp.y - up * z - 6 + Math.sin(t * 2.2) * 2.5;
      const tw = c.measureText(mk.label).width;
      c.fillStyle = 'rgba(28,20,14,0.82)'; c.fillRect(sp.x - tw / 2 - 26, y - 12, tw + 36, 22);
      c.strokeStyle = mk.col; c.lineWidth = 1; c.strokeRect(sp.x - tw / 2 - 26, y - 12, tw + 36, 22);
      drawEventIcon(c, mk, sp.x - tw / 2 - 12, y - 1, 8);
      c.fillStyle = mk.col; c.fillText(mk.label, sp.x + 6, y + 3);
      continue;
    }
    // Schnittpunkt der Linie Bildmitte → Ziel mit dem Rand (oben rechts liegt die Karte)
    const cx = w / 2, cy = h / 2, dx = sp.x - cx, dy = sp.y - cy;
    let k = Infinity;
    if (dx > 0) k = Math.min(k, (mR - cx) / dx); if (dx < 0) k = Math.min(k, (mL - cx) / dx);
    if (dy > 0) k = Math.min(k, (mB - cy) / dy); if (dy < 0) k = Math.min(k, (mT - cy) / dy);
    let x = cx + dx * k, y = cy + dy * k;
    // Karte oben rechts und Meldungen unten links freihalten
    const mini = document.getElementById('minimap');
    const mw = mini ? mini.offsetWidth + 24 : 200, mh = mini ? mini.offsetTop + mini.offsetHeight + 18 : 250;
    if (x > w - mw && y < mh) { if (dx > 0 && Math.abs(dx) > Math.abs(dy)) y = mh; else x = w - mw; }
    const logEl = document.getElementById('log');
    const lr = logEl && logEl.offsetHeight ? logEl.getBoundingClientRect() : null;
    if (lr && x < lr.right + 24 && y > lr.top - 40) { if (x <= mL + 1) y = Math.max(mT, lr.top - 40); else x = lr.right + 30; }
    const a = Math.atan2(dy, dx);
    const pulse = 1 + Math.sin(t * 4) * 0.06;
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.fillStyle = mk.col;
    c.beginPath(); c.moveTo(25 * pulse, 0); c.lineTo(15, -7); c.lineTo(15, 7); c.closePath(); c.fill();
    c.strokeStyle = '#1d140c'; c.lineWidth = 1.2; c.stroke();
    c.restore();
    drawEventIcon(c, mk, x, y, 13);
    const mi = Math.max(1, Math.round((d * KM_PER_TILE) / 1.609));
    const txt = `${mk.short} · ${mi} ${mi === 1 ? 'Meile' : 'Meilen'}`;
    const tw = c.measureText(txt).width;
    let tx = x, ty = y + 30;
    if (ty > h - 70) ty = y - 22;
    tx = Math.max(tw / 2 + 8, Math.min(w - tw / 2 - 8, tx));
    c.fillStyle = 'rgba(28,20,14,0.8)'; c.fillRect(tx - tw / 2 - 6, ty - 12, tw + 12, 17);
    c.fillStyle = mk.col; c.fillText(txt, tx, ty);
  }
}

// Große Karte: Fährlinien, Landschaftsnamen, Windrose
function drawMapDecor(c, v) {
  const W = G.world;
  c.save();
  c.setLineDash([5, 4]);
  c.strokeStyle = 'rgba(240,230,200,0.75)'; c.lineWidth = 1.5;
  for (const f of FERRIES) {
    const a = W.sites.find((s) => s.id === f.a), b = W.sites.find((s) => s.id === f.b);
    if (!a || !b) continue;
    const pa = miniPos((a.dock || a).x, (a.dock || a).y, v), pb = miniPos((b.dock || b).x, (b.dock || b).y, v);
    c.beginPath(); c.moveTo(pa.x, pa.y); c.lineTo(pb.x, pb.y); c.stroke();
  }
  c.setLineDash([]);
  c.textAlign = 'center';
  for (const r of REGIONS) {
    const t = geoToTile(r.lon, r.lat), q = miniPos(t.x, t.y, v);
    const fs = Math.round(15 * r.size * Math.max(0.75, Math.min(1.6, v.s / 1.6)));
    c.font = r.sea ? `italic 500 ${fs}px "Alegreya", Georgia, serif` : `600 ${fs}px "IM Fell English SC", Georgia, serif`;
    c.fillStyle = r.sea ? 'rgba(200,225,240,0.6)' : 'rgba(40,28,16,0.42)';
    if (!r.sea && 'letterSpacing' in c) c.letterSpacing = `${Math.round(fs * 0.25)}px`;
    c.textAlign = r.align || 'center';
    if (!r.sea) { c.lineWidth = 3; c.strokeStyle = 'rgba(245,236,210,0.28)'; c.strokeText(r.name, q.x, q.y); }
    c.fillText(r.name, q.x, q.y);
    c.textAlign = 'center';
    if ('letterSpacing' in c) c.letterSpacing = '0px';
  }
  // Sehenswürdigkeiten
  for (const p of POIS) {
    const t = geoToTile(p.lon, p.lat), q = miniPos(t.x, t.y, v);
    c.fillStyle = '#e8dcb8'; c.strokeStyle = '#2a1e14'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(q.x, q.y - 5); c.lineTo(q.x + 4, q.y); c.lineTo(q.x, q.y + 5); c.lineTo(q.x - 4, q.y); c.closePath(); c.fill(); c.stroke();
    c.font = 'italic 600 11px "Alegreya", Georgia, serif'; c.fillStyle = '#f3ead2';
    c.lineWidth = 3; c.strokeStyle = 'rgba(20,12,6,0.8)'; c.strokeText(p.name, q.x, q.y + 15); c.fillText(p.name, q.x, q.y + 15);
  }
  // Windrose oben rechts
  const cx = Math.min(v.dx + W.N * v.s, c.canvas.width / 2) - 34, cy = v.dy + 38;
  c.fillStyle = 'rgba(28,20,14,0.55)'; c.beginPath(); c.arc(cx, cy, 22, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#c9483a'; c.beginPath(); c.moveTo(cx, cy - 18); c.lineTo(cx + 5, cy); c.lineTo(cx - 5, cy); c.fill();
  c.fillStyle = '#e9dfc6'; c.beginPath(); c.moveTo(cx, cy + 18); c.lineTo(cx + 5, cy); c.lineTo(cx - 5, cy); c.fill();
  c.font = '700 12px "IM Fell English SC", Georgia, serif'; c.fillStyle = '#e8c35a';
  c.fillText('N', cx, cy - 24);
  c.restore();
}

// Treffer-Test für Klicks auf Einheiten (Bildschirmkoordinaten)
export function unitAtScreen(px, py) {
  let best = null, bd = 18 * G.cam.zoom + 6;
  for (const u of G.units) {
    if (u.dead || u.hidden || u.kind === 'player') continue;
    const sp = toScreen(u.x, u.y);
    const d = Math.hypot(sp.x - px, sp.y - (u.mounted ? 22 : 14) * FIG * G.cam.zoom - py);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
