// Isometrischer Renderer: Gelände mit Höhenrelief in Chunks, Objekte tiefensortiert,
// Schatten, Tiere, Vögel, Tag/Nacht, Retro-Modus (Amiga-Stil) und Minikarte.

import { G, homeName, playerColor } from './state.js';
import { TW, TH, CHUNK, HMAX, T, ITEMS, FACTIONS, CASTLE_LAYOUT, BUILDINGS, FERRIES, REGIONS, geoToTile } from './data.js';
import { isoX, isoY, HW, HH, screenToWorld } from './iso.js';
import { hash2, mulberry32, makeNoise, rand } from './rng.js';
import { groundZ, tileAt } from './world.js';
import { conProgress } from './castle.js';
import { seasonIndex, darkness, warmth } from './sim.js';
import { unitLook, heraldLook } from './units.js';
import { questTarget } from './politics.js';

let canvas = null, ctx = null;
let lowCv = null, lowCtx = null;
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
];

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

function winterize(col) { return seasonIndex() === 3 ? mix(col, '#f0f4f4', 0.68) : col; }

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
  const dh = Math.min(11, b.h * 0.68);
  faceQuad(c, b.x, b.y, b.wx, b.wy, 'L', 0.36, 0.64, 0, dh + 1.5, '#6a4c34');
  faceQuad(c, b.x, b.y, b.wx, b.wy, 'L', 0.4, 0.6, 0, dh, '#3d2b1f');
  windowOn(c, b, 'R', 0.38, 0.62, b.h * 0.42, b.h * 0.74, b.lit);
  if (b.wx >= 1.15) windowOn(c, b, 'L', 0.1, 0.26, b.h * 0.42, b.h * 0.72, b.lit);
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
    b.smoke = P(b.x + b.wx * 0.2, b.y - b.wy * 0.15, b.h + b.rh * 0.8 + 6);
  }
}

function drawChurch(c, b) {
  const stone = '#b5ae9f';
  const tx = b.x + b.wx / 2 - 0.45, ty = b.y;
  const th = b.abbey ? 70 : 58;
  drawShadow(c, b.x, b.y, b.wx, b.wy, th * 0.8);
  drawBox(c, b.x - 0.25, b.y, b.wx - 0.5, b.wy, b.h, stone, 0, 'stone');
  const nb = { x: b.x - 0.25, y: b.y, wx: b.wx - 0.5, wy: b.wy };
  for (const u of [0.15, 0.45, 0.75]) {
    faceQuad(c, nb.x, nb.y, nb.wx, nb.wy, 'L', u - 0.02, u + 0.1, b.h * 0.32, b.h * 0.84, '#6f685c');
    faceQuad(c, nb.x, nb.y, nb.wx, nb.wy, 'L', u, u + 0.08, b.h * 0.35, b.h * 0.8, darkness() > 0.2 ? '#ffd27a' : '#41506a');
  }
  drawGableRoof(c, b.x - 0.25, b.y, b.wx - 0.5, b.wy, b.h, 16, ROOFS.tile, stone, true);
  drawBox(c, tx, ty, 1.0, 1.0, th, stone, 0, 'stone');
  faceQuad(c, tx, ty, 1, 1, 'L', 0.32, 0.68, 0, 14, '#5a4030');
  faceQuad(c, tx, ty, 1, 1, 'L', 0.38, 0.62, 0, 12, '#2f241b');
  faceQuad(c, tx, ty, 1, 1, 'L', 0.4, 0.6, th * 0.7, th * 0.85, '#2f2a28');
  faceQuad(c, tx, ty, 1, 1, 'R', 0.4, 0.6, th * 0.7, th * 0.85, '#2f2a28');
  drawPyramid(c, tx, ty, 1.0, 1.0, th, 24, ROOFS.slate);
  const [ax, ay] = P(tx, ty, th + 24);
  c.strokeStyle = '#d6ad4c'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax, ay - 9); c.moveTo(ax - 3, ay - 6); c.lineTo(ax + 3, ay - 6); c.stroke();
  if (darkness() > 0.2) addLight(b.x, b.y + b.wy / 2, b.h * 0.6, 34, 0.7);
}

function drawLonghall(c, b) {
  drawShadow(c, b.x, b.y, b.wx, b.wy, b.h + 18);
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
  for (let k = 0; k < 4; k++) { const p = P(b.x - 0.28 + k * 0.18, b.y + 0.05, 7); c.fillStyle = goods[k]; c.beginPath(); c.arc(p[0], p[1] - 1.5, 1.8, 0, Math.PI * 2); c.fill(); }
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
  addLight(b.x, b.y, 6, 60, 1.3);
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
  const winter = seasonIndex() === 3;
  c.fillStyle = 'rgba(25,35,15,0.2)';
  c.beginPath(); c.ellipse(x + 3, y, 8, 3.5, 0, 0, Math.PI * 2); c.fill();
  switch (b.prop) {
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
    case 'holzstapel':
      drawLogs(c, b.x, b.y - 0.2, 3 + Math.floor(b.v * 3));
      break;
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
    case 'beet': {
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
    const r = mulberry32(site.tx * 31 + site.ty);
    for (const s of sides) {
      if (s.gate || r() < 0.45) continue;
      const h = 4 + r() * 14;
      add(s.x, s.y, (c) => drawBox(c, s.x, s.y, s.along === 'x' ? 1 : 0.45, s.along === 'x' ? 0.45 : 1, h, '#938e83', 0, 'stone'));
    }
    for (const [x, y] of corners) {
      const h = 10 + r() * 18;
      add(x, y, (c) => { drawShadow(c, x, y, 1.1, 1.1, h); drawBox(c, x, y, 1.1, 1.1, h, '#8e897e', 0, 'stone'); drawBox(c, x - 0.25, y - 0.2, 0.5, 0.6, 7, '#8e897e', h, 'stone'); });
    }
    add(cx - 1.2, cy - 1.2, (c) => { drawShadow(c, cx - 1.2, cy - 1.2, 2.1, 2.1, 30); drawBox(c, cx - 1.2, cy - 1.2, 2.1, 2.1, 24, '#8e897e', 0, 'stone'); drawBox(c, cx - 1.6, cy - 1.0, 0.8, 1.0, 12, '#8e897e', 24, 'stone'); });
    add(cx + 1.4, cy + 1.2, (c) => drawTent(c, { x: cx + 1.4, y: cy + 1.2, wx: 1.1, wy: 1.0, color: '#d8ccb0' }));
    add(cx + 2.4, cy + 2.4, (c) => drawFire(c, { x: cx + 2.4, y: cy + 2.4 }));
    add(cx - 2.2, cy + 2.4, (c) => drawStones(c, cx - 2.2, cy + 2.4, 5));
    return parts;
  }

  if (level === 1) {
    for (const s of sides) {
      if (s.gate) continue;
      add(s.x, s.y, (c) => {
        for (let k = -1; k <= 1; k++) {
          const px = s.along === 'x' ? s.x + k * 0.33 : s.x, py = s.along === 'y' ? s.y + k * 0.33 : s.y;
          drawBox(c, px, py, 0.24, 0.24, 24, wood);
          drawPyramid(c, px, py, 0.24, 0.24, 24, 6, wood);
        }
      });
    }
    for (const gx of [-1.15, 1.15]) add(cx + gx, cy + R, (c) => { drawBox(c, cx + gx, cy + R, 0.5, 0.5, 34, wood, 0, 'plank'); drawPyramid(c, cx + gx, cy + R, 0.5, 0.5, 34, 8, ROOFS.wood); });
    add(cx - 1.2, cy - 1.2, (c) => {
      drawShadow(c, cx - 1.2, cy - 1.2, 1.6, 1.6, 70);
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
      drawBox(c, x, y, 1.4, 1.4, th, stone, 0, 'stone');
      faceQuad(c, x, y, 1.4, 1.4, 'L', 0.42, 0.58, th * 0.6, th * 0.72, '#2c2622');
      faceQuad(c, x, y, 1.4, 1.4, 'R', 0.42, 0.58, th * 0.6, th * 0.72, '#2c2622');
      if (level >= 3) { drawPyramid(c, x, y, 1.4, 1.4, th, 30, ROOFS.slate); banner(c, x, y, th + 30, bannerCol); }
      else drawMerlons(c, x, y, 1.4, 1.4, th, stone);
    }, 0.4);
  }
  for (const gx of [-1.3, 1.3]) {
    add(cx + gx, cy + R, (c) => {
      drawBox(c, cx + gx, cy + R, 1.0, 1.0, wh + 16, stone, 0, 'stone');
      drawMerlons(c, cx + gx, cy + R, 1.0, 1.0, wh + 16, stone);
    }, 0.3);
  }
  add(cx, cy + R - 0.05, (c) => {
    drawBox(c, cx, cy + R, 1.6, 0.8, 10, stone, wh - 4, 'stone');
    faceQuad(c, cx, cy + R, 1.6, 0.8, 'L', 0.05, 0.95, wh - 4, wh - 3, '#3a2a1c');
    c.strokeStyle = '#3a3632'; c.lineWidth = 1;
    c.beginPath();
    for (let k = 1; k < 6; k++) { const a = facePoint(cx, cy + R, 1.6, 0.8, 'L', k / 6, wh - 4), d = facePoint(cx, cy + R, 1.6, 0.8, 'L', k / 6, wh - 14); c.moveTo(a[0], a[1]); c.lineTo(d[0], d[1]); }
    c.stroke();
  }, 0.2);
  if (level >= 3) {
    for (const [x, y] of [[cx, cy - R], [cx - R, cy]]) add(x, y, (c) => { drawBox(c, x, y, 1.1, 1.1, 56, stone, 0, 'stone'); drawPyramid(c, x, y, 1.1, 1.1, 56, 24, ROOFS.slate); }, 0.3);
  }
  const kw = level >= 3 ? 2.8 : 2.2, kh = level >= 3 ? 100 : 76;
  add(cx - 1.1, cy - 1.1, (c) => {
    drawShadow(c, cx - 1.1, cy - 1.1, kw, kw, kh);
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

function palisadeRing(site, r) {
  const parts = [];
  const wood = '#8a6440';
  const z0 = groundZ(G.world, site.x, site.y);
  const n = Math.round(Math.PI * 2 * r / 0.36);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    if (Math.abs(a - Math.PI * 0.5) < 0.28) continue;
    const x = site.x + Math.cos(a) * r, y = site.y + Math.sin(a) * r;
    parts.push({ x, y, d: x + y, z: z0, f: (c) => { drawBox(c, x, y, 0.22, 0.22, 20, wood); drawPyramid(c, x, y, 0.22, 0.22, 20, 5, wood); } });
  }
  return parts;
}

function buildStaticParts() {
  const W = G.world;
  const parts = [];
  for (const b of W.buildings) {
    const f = {
      house: drawHouse, church: drawChurch, longhall: drawLonghall, tent: drawTent, stall: drawStall,
      well: drawWell, fire: drawFire, fence: drawFence, prop: drawProp, ship: drawShip,
    }[b.kind];
    if (f) parts.push({ x: b.x, y: b.y, d: b.x + b.y, z: groundZ(W, b.x, b.y), f: (c) => f(c, b), b });
  }
  for (const s of W.sites) {
    if (s.type === 'burg') parts.push(...castlePieces(s, s.castleLevel, FACTIONS[s.faction].color));
    if (s.palisade) parts.push(...palisadeRing(s, s.palisade));
  }
  return parts;
}

// ---------------------------------------------------------------- Eigene Burg: sichtbarer Ausbau
const BUILD_ICON = { halle: 'krone', kaserne: 'schwerter', schmiede: 'amboss', stall: 'hufeisen', holzfaeller: 'axt', steinbruch: 'hacke', markt: 'muenze', kapelle: 'kreuz', wehr: 'turm' };
const PLOT = { halle: [1.5, 2.9], kaserne: [2.6, 1.2], schmiede: [1.8, 1.5], stall: [1.4, 3.0], holzfaeller: [1.4, 1.2], steinbruch: [2.2, 1.8], markt: [2.8, 2.4], kapelle: [2.6, 1.3], wehr: [1.0, 1.0] };
const TOWER_SPOTS = [[6.4, 6.4], [-6.4, -6.4], [6.4, -6.4]];
const STONE_BUILDINGS = { halle: 1, kapelle: 1, schmiede: 1, steinbruch: 1, wehr: 1 };
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
function drawWorker(c, x, y, tool, phase, o = {}) {
  const [px, py] = P(x, y, o.z || 0);
  const t = G.time * (o.speed || 5) + phase;
  const s = Math.sin(t);
  const lift = s > 0 ? s : 0;
  c.save();
  c.translate(px, py);
  c.fillStyle = 'rgba(20,30,10,0.28)'; c.beginPath(); c.ellipse(2, 0, 6, 2.6, 0, 0, Math.PI * 2); c.fill();
  c.scale((o.flip ? -1 : 1) * 1.1, 1.1);
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
        add(t.x - 0.4, t.y + 0.35, (c) => drawWorker(c, t.x - 0.4, t.y + 0.35, 'schwert', 0, { col: '#4d74ad', hat: '#9aa1a6', speed: 6 }));
        add(t.x + 0.1, t.y + 0.55, (c) => drawWorker(c, t.x + 0.1, t.y + 0.55, 'schwert', 2.5, { col: '#4d74ad', hat: '#9aa1a6', speed: 6, flip: true }));
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
          const t = G.time * 0.22 + k * 2.1;
          const hx = pad.x + Math.sin(t) * (pw / 2 - 0.45), hy = pad.y + Math.cos(t * 0.8 + k) * (ph / 2 - 0.45);
          const vx = Math.cos(t) * (pw / 2 - 0.45) - (-Math.sin(t * 0.8 + k) * 0.8 * (ph / 2 - 0.45));
          const [px, py] = P(hx, hy);
          c.save(); c.translate(px, py); c.scale(vx >= 0 ? 1 : -1, 1);
          c.fillStyle = 'rgba(25,35,15,0.22)'; c.beginPath(); c.ellipse(3, 0, 13, 4.5, 0, 0, Math.PI * 2); c.fill();
          drawHorse(c, cols[k % cols.length], G.time * 0.6, true, null);
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
        if (L >= 2 && k % 2 === 0) add(x + 0.1, y + 0.55, (c) => drawWorker(c, x + 0.1, y + 0.55, null, k, { col: cols[(k + 2) % cols.length], speed: 1 }));
      }
      if (L >= 2) add(p.x + 1.6, p.y + 0.3, (c) => drawWell(c, { x: p.x + 1.6, y: p.y + 0.3 }));
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
    drawWorker(c, x + 0.1, y + 0.1, null, k, { z: h + (stone ? 0 : 3), col: '#4d74ad', hat: '#9aa1a6', speed: 0.5 });
    if (L >= 3 || (stone && k === 0)) drawBrazier(c, x - 0.25, y - 0.25, h + 2);
  });
}

function buildPlayerCastle() {
  const s = G.world.sites.find((x) => x.type === 'spieler');
  const C = G.s.castle;
  const parts = castlePieces(s, C.level, playerColor());
  const z0 = groundZ(G.world, s.x, s.y);
  const add = (x, y, f) => parts.push({ x, y, d: x + y, z: z0, f });
  const lv = (id) => C.b[id] || 0;
  const pos = (id) => ({ x: s.x + CASTLE_LAYOUT[id].dx, y: s.y + CASTLE_LAYOUT[id].dy });
  const con = C.construction;
  castleAnchors = [{ x: s.x - 1, y: s.y - 1, h: 90, label: `Burg ${homeName()} · ${BUILDINGS.burg.levels[C.level].name}${con && con.id === 'burg' ? ' (Ausbau läuft)' : ''}` }];

  for (const id of ['halle', 'kaserne', 'schmiede', 'stall', 'holzfaeller', 'steinbruch', 'markt', 'kapelle']) {
    const L = lv(id), p = pos(id), building = con && con.id === id;
    const [pw, ph] = PLOT[id];
    const signAt = { x: p.x - pw / 2 - 0.25, y: p.y + ph / 2 + 0.15 };
    const name = BUILDINGS[id].name;
    if (!L && !building) {
      add(p.x - 0.5, p.y - 0.5, (c) => drawPlot(c, p.x, p.y, pw, ph));
      add(signAt.x, signAt.y, (c) => drawSign(c, signAt.x, signAt.y, BUILD_ICON[id], true));
      castleAnchors.push({ x: p.x, y: p.y, h: 20, label: `Bauplatz: ${name}` });
      continue;
    }
    if (L) addCastleBuilding(add, id, L, p, s);
    if (building) addConstruction(add, id, p, L);
    add(signAt.x, signAt.y, (c) => drawSign(c, signAt.x, signAt.y, BUILD_ICON[id], false));
    castleAnchors.push({ x: p.x, y: p.y, h: 40, label: `${name} · Stufe ${L}${building ? ` (Ausbau auf Stufe ${con.level} läuft)` : ''}` });
  }

  // Wachtürme
  const WE = lv('wehr');
  for (let k = 0; k < WE; k++) addTower(add, s, k, WE);
  const nextT = con && con.id === 'wehr' ? con.level - 1 : WE;
  if (nextT < 3) {
    const tx = s.x + TOWER_SPOTS[nextT][0], ty = s.y + TOWER_SPOTS[nextT][1];
    if (con && con.id === 'wehr') addConstruction(add, 'wehr', { x: tx, y: ty }, 0);
    else { add(tx - 0.3, ty - 0.3, (c) => drawPlot(c, tx, ty, 1.0, 1.0)); add(tx - 0.7, ty + 0.65, (c) => drawSign(c, tx - 0.7, ty + 0.65, 'turm', true)); }
    castleAnchors.push({ x: tx, y: ty, h: 30, label: con && con.id === 'wehr' ? `Wachturm im Bau` : 'Bauplatz: Wachturm' });
  }
  for (let k = 0; k < WE; k++) castleAnchors.push({ x: s.x + TOWER_SPOTS[k][0], y: s.y + TOWER_SPOTS[k][1], h: 60, label: `Wachturm · Stufe ${WE}` });

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
function villageSpots(s) {
  if (s.villageSpots) return s.villageSpots;
  const W = G.world;
  const r = mulberry32(W.seed + 991);
  const avoid = Object.values(CASTLE_LAYOUT).map((o) => ({ x: s.x + o.dx, y: s.y + o.dy, r: 2.4 }));
  avoid.push({ x: s.x - 2.7, y: s.y + 6.5, r: 1.8 }, { x: s.x + 9.0, y: s.y + 2.6, r: 1.8 });
  for (const [dx, dy] of TOWER_SPOTS) avoid.push({ x: s.x + dx, y: s.y + dy, r: 1.5 });
  const spots = [];
  for (let tries = 0; tries < 600 && spots.length < 9; tries++) {
    const a = r() * Math.PI * 2, d = 7.6 + r() * 3.2;
    const x = Math.floor(s.x + Math.cos(a) * d) + 0.5, y = Math.floor(s.y + Math.sin(a) * d) + 0.5;
    const t = tileAt(W, x, y);
    if (t === T.WATER || t === T.ROAD || t === T.BRIDGE || t === T.FOREST) continue;
    if (Math.hypot(x - s.x, y - s.y) < 6) continue;
    if (avoid.some((o) => Math.hypot(o.x - x, o.y - y) < o.r)) continue;
    if (spots.some((o) => Math.hypot(o.x - x, o.y - y) < 1.9)) continue;
    const b = { kind: 'house', x, y, wx: 0.9 + r() * 0.4, wy: 0.8 + r() * 0.3, h: 13 + r() * 6, rh: 11 + r() * 5, wall: r() < 0.6 ? 'timber' : 'plaster', roof: 'thatch', chimney: r() < 0.6, lit: true, v: r() };
    if (r() < 0.6) b.prop = { prop: ['heu', 'holzstapel', 'fass', 'beet'][Math.floor(r() * 4)], x: x + 0.75, y: y + (r() - 0.5) * 0.6, v: r() };
    spots.push(b);
  }
  s.villageSpots = spots;
  return spots;
}

// Name eines Burggebäudes unter dem Mauszeiger
export function buildingAtScreen(px, py) {
  if (!G.world || !G.s) return null;
  let best = null, bd = Infinity;
  for (const a of castleAnchors) {
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
    if (ce.id === 'wehr') { px = s.x + TOWER_SPOTS[ce.level - 1][0]; py = s.y + TOWER_SPOTS[ce.level - 1][1]; }
    else if (ce.id !== 'burg') { px = s.x + CASTLE_LAYOUT[ce.id].dx; py = s.y + CASTLE_LAYOUT[ce.id].dy; }
    const sp = toScreen(px, py);
    const z = G.cam.zoom;
    if (sparkles.length < 140) for (let k = 0; k < 3; k++) sparkles.push({ x: sp.x + (Math.random() - 0.5) * 90 * z, y: sp.y - Math.random() * 40 * z, vy: -20 - Math.random() * 30, life: 0, max: 1.2 + Math.random() * 1.2 });
    const name = ce.id === 'burg' ? BUILDINGS.burg.levels[ce.level].name : `${BUILDINGS[ce.id].name} Stufe ${ce.level}`;
    const label = `Fertig: ${name}`;
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
  c.save(); c.translate(px, py); c.scale(1.1, 1.1);
  c.fillStyle = 'rgba(25,35,15,0.22)'; c.beginPath(); c.ellipse(3, 0, 13, 4.5, 0, 0, Math.PI * 2); c.fill();
  drawHorse(c, col, 0, false, null);
  c.restore();
}

// ---------------------------------------------------------------- Bäume, Büsche, Felsen
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function makeDeciduous(season, v) {
  const w = 64, h = 84;
  const cv = makeCanvas(w, h), g = cv.getContext('2d');
  const r = mulberry32(1000 + v * 17);
  g.fillStyle = '#5a4030';
  g.fillRect(w / 2 - 3, h - 30, 6, 28);
  g.fillStyle = '#6e5038'; g.fillRect(w / 2 - 3, h - 30, 2, 28);
  if (season === 3) {
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
    for (let k = 0; k < 12; k++) g.fillRect(w / 2 - 16 + r() * 32, 14 + r() * 30, 3, 1.5);
    return { cvs: cv, ax: w / 2, ay: h - 3 };
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
  return { cvs: cv, ax: w / 2, ay: h - 3 };
}

function makeConifer(season, v) {
  const w = 44, h = 92;
  const cv = makeCanvas(w, h), g = cv.getContext('2d');
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
  return { cvs: cv, ax: w / 2, ay: h - 3 };
}

function makeBush(season, v) {
  const w = 34, h = 26;
  const cv = makeCanvas(w, h), g = cv.getContext('2d');
  const r = mulberry32(4000 + v * 11);
  const cols = [['#4c8232', '#68a043', '#8cc25c'], ['#3f7a2c', '#55923a', '#77b04e'], ['#8a6a2a', '#b08a34', '#d0aa4a'], ['#5a6650', '#6e7a62', '#eef2f2']][season];
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
  return { cvs: cv, ax: w / 2, ay: h - 4 };
}

function makeRock(season, v) {
  const w = 40, h = 30;
  const cv = makeCanvas(w, h), g = cv.getContext('2d');
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
  return { cvs: cv, ax: 20, ay: 25 };
}

function ensureSprites() {
  const s = seasonIndex();
  if (sprites && spriteSeason === s) return;
  spriteSeason = s;
  sprites = {
    laub: [0, 1, 2].map((v) => makeDeciduous(s, v)),
    nadel: [0, 1, 2].map((v) => makeConifer(s, v)),
    fels: [0, 1, 2].map((v) => makeRock(s, v)),
    busch: [0, 1, 2].map((v) => makeBush(s, v)),
  };
}

function drawTreeObj(c, o) {
  const set = sprites[o.kind] || sprites.laub;
  const sp = set[o.v % set.length];
  const z = groundZ(G.world, o.x, o.y);
  const x = isoX(o.x, o.y), y = isoY(o.x, o.y) - z;
  const w = sp.cvs.width * o.s, h = sp.cvs.height * o.s;
  const big = o.kind === 'laub' || o.kind === 'nadel';
  c.fillStyle = 'rgba(20,35,12,0.2)';
  c.beginPath(); c.ellipse(x + (big ? 10 : 4) * o.s, y - 1, (big ? 16 : 10) * o.s, (big ? 5.5 : 3.5) * o.s, 0, 0, Math.PI * 2); c.fill();
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

function drawTile(c, W, i, j, ox, oy, pal, season, noise) {
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
  const fL = isWater ? 1 : slopeLight(hB - hL, hL - hT), fR = isWater ? 1 : slopeLight(hR - hT, hB - hR);
  const cL = shade(base, varF * fL), cR = shade(base, varF * fR);
  c.lineWidth = 0.9;
  c.beginPath(); c.moveTo(Tp[0], Tp[1]); c.lineTo(Bp[0], Bp[1]); c.lineTo(Lp[0], Lp[1]); c.closePath();
  c.fillStyle = cL; c.fill(); c.strokeStyle = cL; c.stroke();
  c.beginPath(); c.moveTo(Tp[0], Tp[1]); c.lineTo(Rp[0], Rp[1]); c.lineTo(Bp[0], Bp[1]); c.closePath();
  c.fillStyle = cR; c.fill(); c.strokeStyle = cR; c.stroke();

  if (isWater) {
    const land = (a, b) => a >= 0 && b >= 0 && a < N && b < N && W.tiles[b * N + a] !== T.WATER && W.tiles[b * N + a] !== T.BRIDGE;
    const nU = land(i, j - 1), nR = land(i + 1, j), nD = land(i, j + 1), nL = land(i - 1, j);
    if (!nU && !nR && !nD && !nL && season !== 3) {
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
    if (season === 3 && h1 < 0.3) {
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1;
      const a = tp(0.2, 0.5), b = tp(0.6, 0.4);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    }
  }

  if (t === T.GRASS || t === T.FOREST || t === T.HILLS || t === T.SAND) {
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
      c.fillStyle = season === 2 ? '#c9742a' : season === 3 ? '#b9c4c2' : '#3d5e2a';
      for (let k = 0; k < 5; k++) { const p = tp(0.1 + hash2(i + k * 7, j, 31) * 0.8, 0.1 + hash2(i, j + k * 7, 32) * 0.8); c.fillRect(p[0], p[1], 2, 1.4); }
    }
    if ((t === T.HILLS || t === T.SAND) && h2 < 0.4) {
      c.fillStyle = shade(base, 0.68);
      const p = tp(0.3 + h1 * 0.4, 0.3 + h2);
      c.beginPath(); c.ellipse(p[0], p[1], 2.4, 1.4, 0, 0, Math.PI * 2); c.fill();
    }
  }
  if (t === T.FIELD) {
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
  if (t === T.ROAD || t === T.BRIDGE) {
    const bridge = t === T.BRIDGE;
    const lift = bridge ? 4 : 0;
    const ctr = tp(0.5, 0.5); ctr[1] -= lift;
    const arms = [];
    if (isRoadish(W, i, j - 1)) arms.push(tp(0.5, 0));
    if (isRoadish(W, i + 1, j)) arms.push(tp(1, 0.5));
    if (isRoadish(W, i, j + 1)) arms.push(tp(0.5, 1));
    if (isRoadish(W, i - 1, j)) arms.push(tp(0, 0.5));
    for (const a of arms) a[1] -= lift;
    c.lineCap = 'round';
    const rc = bridge ? '#8f6e44' : pal.road;
    c.strokeStyle = bridge ? '#5a4128' : shade(rc, 0.82); c.lineWidth = 17;
    for (const a of arms) { c.beginPath(); c.moveTo(ctr[0], ctr[1]); c.lineTo(a[0], a[1]); c.stroke(); }
    c.strokeStyle = rc; c.lineWidth = bridge ? 13 : 12.5;
    for (const a of arms) { c.beginPath(); c.moveTo(ctr[0], ctr[1]); c.lineTo(a[0], a[1]); c.stroke(); }
    if (!arms.length) { c.fillStyle = rc; c.beginPath(); c.ellipse(ctr[0], ctr[1], 8, 4, 0, 0, Math.PI * 2); c.fill(); }
    if (!bridge) {
      c.strokeStyle = shade(rc, 0.88); c.lineWidth = 1.2;
      for (const a of arms) {
        c.beginPath(); c.moveTo(ctr[0] - 2.5, ctr[1]); c.lineTo(a[0] - 2.5, a[1]); c.moveTo(ctr[0] + 2.5, ctr[1]); c.lineTo(a[0] + 2.5, a[1]); c.stroke();
      }
      if (h1 < 0.55) { c.fillStyle = shade(rc, 0.7); c.fillRect(ctr[0] - 4 + h1 * 8, ctr[1] - 1 + h2 * 3, 2, 1.5); c.fillRect(ctr[0] + 2 - h2 * 6, ctr[1] + 1, 1.5, 1.2); }
    } else {
      c.strokeStyle = 'rgba(50,32,16,0.55)'; c.lineWidth = 1;
      for (const a of arms) {
        for (let k = 1; k < 5; k++) {
          const px = ctr[0] + (a[0] - ctr[0]) * (k / 5), py = ctr[1] + (a[1] - ctr[1]) * (k / 5);
          const nx = -(a[1] - ctr[1]), ny = a[0] - ctr[0], nl = Math.hypot(nx, ny) || 1;
          c.beginPath(); c.moveTo(px + (nx / nl) * 6, py + (ny / nl) * 6); c.lineTo(px - (nx / nl) * 6, py - (ny / nl) * 6); c.stroke();
        }
      }
    }
    c.lineCap = 'butt';
  }
}

function renderChunk(cx, cy) {
  const W = G.world;
  const season = seasonIndex();
  const pal = PAL[season];
  const cvs = makeCanvas(CHUNK * TW, CHUNK * TH + PAD_TOP + 4);
  const c = cvs.getContext('2d');
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  const ox = -isoX(x0, y0 + CHUNK), oy = -isoY(x0, y0) + PAD_TOP;
  const noise = getPatchNoise();
  for (let j = y0; j < y0 + CHUNK; j++) for (let i = x0; i < x0 + CHUNK; i++) drawTile(c, W, i, j, ox, oy, pal, season, noise);
  return { cvs, x: -ox, y: -oy };
}

function getChunk(cx, cy) {
  const key = cy * G.world.CN + cx;
  let ch = chunkCache.get(key);
  if (ch) { chunkCache.delete(key); chunkCache.set(key, ch); return ch; }
  ch = renderChunk(cx, cy);
  chunkCache.set(key, ch);
  if (chunkCache.size > 240) chunkCache.delete(chunkCache.keys().next().value);
  return ch;
}

// Erdscholle an den vorderen Kartenrändern (Diorama)
function drawSlab(c, minX, maxX, minY, maxY) {
  const W = G.world, N = W.N, M = W.M;
  const season = seasonIndex();
  const face = (a, b, hA, hB, t, side) => {
    const aB = [a[0], a[1] + hA + SLAB], bB = [b[0], b[1] + hB + SLAB];
    const f = side === 'L' ? 1 : 0.8;
    poly(c, [a, b, bB, aB], shade('#6b4a30', f));
    const mid = (p, q, k) => [p[0], p[1] + (q[1] - p[1]) * k];
    poly(c, [mid(a, aB, 0.55), mid(b, bB, 0.55), bB, aB], shade('#5d5750', f));
    poly(c, [mid(a, aB, 0.8), mid(b, bB, 0.8), bB, aB], shade('#4a453f', f));
    const water = t === T.WATER || t === T.BRIDGE;
    poly(c, [a, b, [b[0], b[1] + 5], [a[0], a[1] + 5]], water ? shade('#3f7a9c', f) : season === 3 ? shade('#e8eded', f) : shade('#5f8f3a', f));
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
  if (seasonIndex() === 3) return;
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

function drawWeapon(c, u, by) {
  const it = ITEMS[u.eq.waffe];
  if (!it) return;
  const sw = u.swing > 0 ? (u.swing / 0.3) : 0;
  c.save();
  c.translate(4, by - 12);
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
  c.fillStyle = 'rgba(20,30,10,0.3)';
  c.beginPath(); c.ellipse(3, 0, m ? 14 : 8, m ? 5 : 3.4, 0, 0, Math.PI * 2); c.fill();
  if (u.kind === 'player' || u.kind === 'companion') {
    c.strokeStyle = u.kind === 'player' ? 'rgba(255,214,90,0.9)' : 'rgba(150,190,255,0.7)';
    c.lineWidth = 1.4;
    c.beginPath(); c.ellipse(0, 0, m ? 16 : 10, m ? 6 : 4.4, 0, 0, Math.PI * 2); c.stroke();
  }
  c.scale((u.facing || 1) * 1.14, 1.14);
  let by = 0;
  if (m) { drawHorse(c, HORSES[u.eq.pferd] || '#7a5232', u.anim, u.moving, u.eq.pferd === 'schlachtross' ? L : null); by = -12; }
  else {
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
  if (u.flash > 0) {
    c.globalAlpha = Math.min(1, u.flash * 5);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.ellipse(0, yb - 13, 6, 10, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
  }
  c.restore();
  if ((u.combatT > 0 || u.hp < u.st.maxHp * 0.999) && u.kind !== 'peasant') {
    const w = 18, top = y + (m ? -44 : -32);
    c.fillStyle = 'rgba(20,12,8,0.75)'; c.fillRect(x - w / 2 - 1, top - 1, w + 2, 4);
    c.fillStyle = u.team === 'player' ? '#7bc15a' : '#d9533f';
    c.fillRect(x - w / 2, top, w * Math.max(0, u.hp / u.st.maxHp), 2);
  }
}

function drawCorpse(c, f, x, y) {
  c.globalAlpha = Math.min(1, (f.dur - f.t) / 3);
  c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(x, y, 9, 3.5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = f.look.tunic; c.beginPath(); c.ellipse(x, y - 2, 6.5, 2.6, -0.2, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d9b08c'; c.beginPath(); c.arc(x + 7, y - 3.5, 2.6, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1;
}

function drawAnimal(c, a, x, y) {
  const winter = seasonIndex() === 3;
  c.save();
  c.translate(x, y);
  if (a.kind !== 'ente') { c.fillStyle = 'rgba(20,30,10,0.22)'; c.beginPath(); c.ellipse(2, 0, a.kind === 'huhn' ? 3.5 : 8, a.kind === 'huhn' ? 1.5 : 2.8, 0, 0, Math.PI * 2); c.fill(); }
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
  const col = { hirsch: '#8a5a34', schaf: '#efe9dc', kuh: '#9a6a42', huhn: '#f2eee6', ente: '#8a6a45' }[f.animal] || '#8a5a34';
  const big = f.animal === 'hirsch' || f.animal === 'kuh' ? 1 : f.animal === 'schaf' ? 0.8 : 0.45;
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
    const d = Math.hypot(sp.x - px, sp.y - 6 * G.cam.zoom - py);
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

function drawSnow(c, w, h, dt) {
  if (seasonIndex() !== 3) { snow.length = 0; return; }
  while (snow.length < 120) snow.push({ x: Math.random() * w, y: Math.random() * h, v: 20 + Math.random() * 30, r: 1 + Math.random() * 1.6 });
  c.fillStyle = 'rgba(255,255,255,0.85)';
  for (const f of snow) {
    f.y += f.v * dt; f.x += Math.sin(G.time + f.v) * 10 * dt;
    if (f.y > h) { f.y = -4; f.x = Math.random() * w; }
    c.beginPath(); c.arc(f.x, f.y, f.r, 0, Math.PI * 2); c.fill();
  }
}

function drawBirds(c, w, h, dt) {
  birdTimer -= dt;
  if (birdTimer <= 0) {
    birdTimer = rand(12, 28);
    if (darkness() < 0.25 && birds.length < 3) {
      const left = Math.random() < 0.5;
      const n = 4 + Math.floor(Math.random() * 6);
      const flock = { x: left ? -40 : w + 40, y: rand(h * 0.12, h * 0.55), vx: (left ? 1 : -1) * rand(45, 75), vy: rand(-8, 8), members: [] };
      for (let k = 0; k < n; k++) flock.members.push({ dx: -Math.abs(k - n / 2) * 9 * Math.sign(flock.vx), dy: (k - n / 2) * 7, p: Math.random() * 6 });
      birds.push(flock);
    }
  }
  c.strokeStyle = 'rgba(35,30,28,0.75)';
  c.lineWidth = 1.4;
  for (let i = birds.length - 1; i >= 0; i--) {
    const f = birds[i];
    f.x += f.vx * dt; f.y += f.vy * dt;
    c.beginPath();
    for (const m of f.members) {
      const x = f.x + m.dx, y = f.y + m.dy, flap = Math.sin(G.time * 11 + m.p) * 2.6;
      c.moveTo(x - 5, y - flap); c.quadraticCurveTo(x - 2, y - 1.5, x, y); c.quadraticCurveTo(x + 2, y - 1.5, x + 5, y - flap);
    }
    c.stroke();
    if (f.x < -200 || f.x > w + 200) birds.splice(i, 1);
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

export function onSeasonChanged() { chunkCache.clear(); minimapBase = null; }

export function zAt(x, y) { return G.world ? groundZ(G.world, x, y) : 0; }

// Bildschirmpunkt -> Weltpunkt auf dem Gelände (berücksichtigt die Höhe)
export function screenToGround(px, py) {
  const { w, h } = G.view;
  let wp = screenToWorld(px, py, G.cam, w, h);
  for (let k = 0; k < 4; k++) wp = screenToWorld(px, py + zAt(wp.x, wp.y) * G.cam.zoom, G.cam, w, h);
  return wp;
}

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
  if (!G.world || !G.s) return;
  ensureSprites();
  if (cacheSeason !== seasonIndex()) { chunkCache.clear(); cacheSeason = seasonIndex(); }
  if (G.castleDirty) { castleParts = buildPlayerCastle(); G.castleDirty = false; }
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

  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const ch = getChunk(cx, cy);
    if (ch.x > isoR || ch.x + ch.cvs.width < isoL || ch.y > isoB || ch.y + ch.cvs.height < isoT) continue;
    wc.drawImage(ch.cvs, ch.x, ch.y);
  }
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
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    for (const o of W.chunkObjs[cy * CN + cx]) {
      const ix = isoX(o.x, o.y);
      if (ix < isoL || ix > isoR) continue;
      objs.push({ d: o.x + o.y, z: 0, f: (c) => drawTreeObj(c, o) });
    }
  }
  for (const part of staticParts) if (inView(part.x, part.y)) objs.push(part);
  for (const part of castleParts) if (inView(part.x, part.y)) objs.push(part);
  for (const u of G.units) {
    if (u.hidden || (u.dead && u.kind !== 'player') || !inView(u.x, u.y)) continue;
    objs.push({ d: u.x + u.y + 0.05, z: 0, f: (c) => drawFigure(c, u, isoX(u.x, u.y), isoY(u.x, u.y) - zAt(u.x, u.y)) });
  }
  const night = darkness() > 0.4;
  for (const a of G.animals || []) {
    if (!inView(a.x, a.y) || (night && a.kind === 'huhn')) continue;
    objs.push({ d: a.x + a.y, z: 0, f: (c) => { const ax = isoX(a.x, a.y), ay = isoY(a.x, a.y) - zAt(a.x, a.y); if (G.s.player.huntTarget === a) { c.strokeStyle = 'rgba(255,120,80,0.9)'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(ax, ay, 11, 4.5, 0, 0, Math.PI * 2); c.stroke(); } drawAnimal(c, a, ax, ay); } });
  }
  for (const f of G.fx) if (f.kind === 'kadaver' && inView(f.x, f.y)) objs.push({ d: f.x + f.y - 0.3, z: 0, f: (c) => drawCarcass(c, f, isoX(f.x, f.y), isoY(f.x, f.y) - zAt(f.x, f.y)) });
  for (const f of G.fx) if (f.kind === 'corpse' && inView(f.x, f.y)) objs.push({ d: f.x + f.y - 0.3, z: 0, f: (c) => drawCorpse(c, f, isoX(f.x, f.y), isoY(f.x, f.y) - zAt(f.x, f.y)) });
  objs.sort((a, b) => a.d - b.d);
  for (const o of objs) { baseZ = o.z || 0; o.f(wc); }
  baseZ = 0;

  for (const part of staticParts) if (part.b && part.b.smoke && inView(part.x, part.y)) smokeEmit(part.b.smoke[0], part.b.smoke[1], 0.04);
  drawSmoke(wc, dt);

  // Geschosse
  for (const pr of G.projectiles) {
    const k = pr.t / pr.dur;
    const x = pr.x + (pr.tx - pr.x) * k, y = pr.y + (pr.ty - pr.y) * k;
    const d = Math.hypot(pr.tx - pr.x, pr.ty - pr.y);
    const zz = 14 + Math.sin(k * Math.PI) * d * (pr.bolt ? 1.5 : 4) + zAt(x, y);
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
  drawSnow(ctx, w, h, dt);

  // Ortsnamen
  ctx.textAlign = 'center';
  for (const s of W.sites) {
    if (!inView(s.x, s.y)) continue;
    const sp = toScreen(s.x, s.y);
    const yy = sp.y - (s.type === 'spieler' || s.type === 'burg' ? 125 : 72) * z;
    ctx.font = `600 ${Math.round(13 + z * 2)}px "IM Fell English SC", Georgia, serif`;
    const label = s.name;
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
    const label = `${u.name}${u.kind !== 'peasant' ? ` · Stufe ${u.level}` : ''}`;
    const tw = ctx.measureText(label).width;
    const yy = sp.y - (u.mounted ? 56 : 44) * z;
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
];

function buildMinimap() {
  const W = G.world, N = W.N, M = W.M;
  const cv = makeCanvas(N, N);
  const g = cv.getContext('2d');
  const img = g.createImageData(N, N);
  const cols = MINI_COL[seasonIndex()].map((hx) => { const n = parseInt(hx.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });
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
  minimapSeason = seasonIndex();
}

// Kartenansicht: v = { ox, oy, s, dx, dy } (Welt -> Bild: (x - ox) * s + dx)
export function miniPos(x, y, v) { return { x: (x - v.ox) * v.s + v.dx, y: (y - v.oy) * v.s + v.dy }; }
export function miniToWorld(mx, my, v) { return { x: (mx - v.dx) / v.s + v.ox, y: (my - v.dy) / v.s + v.oy }; }

export function drawMap(c, w, h, opts = {}) {
  if (!minimapBase || minimapSeason !== seasonIndex()) buildMinimap();
  const W = G.world, N = W.N;
  const p = G.s.player;
  const big = !!opts.big;
  let v;
  if (big) {
    const s = Math.min(w, h) / N;
    v = { ox: 0, oy: 0, s, dx: (w - N * s) / 2, dy: (h - N * s) / 2 };
  } else {
    const s = opts.zoom || 2.6;
    v = { ox: p.x - w / (2 * s), oy: p.y - h / (2 * s), s, dx: 0, dy: 0 };
  }
  c.clearRect(0, 0, w, h);
  c.fillStyle = '#35627d'; c.fillRect(0, 0, w, h);
  c.imageSmoothingEnabled = false;
  c.drawImage(minimapBase, v.dx - v.ox * v.s, v.dy - v.oy * v.s, N * v.s, N * v.s);
  c.imageSmoothingEnabled = true;
  if (big) drawMapDecor(c, v);
  for (const g of G.groups) {
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
  const RANK = { spieler: 0, stadt: 1, burg: 2, abtei: 3, markt: 4, halle: 5, dorf: 6, lager: 7 };
  const placed = [];
  const order = W.sites.slice().sort((a, b) => RANK[a.type] - RANK[b.type]);
  for (const s of order) {
    const q = miniPos(s.x, s.y, v);
    if (q.x < -20 || q.y < -20 || q.x > w + 20 || q.y > h + 20) continue;
    const col = s.faction ? FACTIONS[s.faction].color : '#ffd65a';
    const r = big ? (s.type === 'stadt' || s.type === 'spieler' ? 4.5 : 3.5) : 3;
    c.fillStyle = '#1d140c'; c.fillRect(q.x - r - 1, q.y - r - 1, r * 2 + 2, r * 2 + 2);
    c.fillStyle = col; c.fillRect(q.x - r, q.y - r, r * 2, r * 2);
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
    const fs = Math.round(15 * r.size * Math.max(0.7, v.s / 2.2));
    c.font = r.sea ? `italic 500 ${fs}px "Alegreya", Georgia, serif` : `600 ${fs}px "IM Fell English SC", Georgia, serif`;
    c.fillStyle = r.sea ? 'rgba(200,225,240,0.6)' : 'rgba(40,28,16,0.42)';
    if (!r.sea && 'letterSpacing' in c) c.letterSpacing = `${Math.round(fs * 0.25)}px`;
    c.textAlign = r.align || 'center';
    if (!r.sea) { c.lineWidth = 3; c.strokeStyle = 'rgba(245,236,210,0.28)'; c.strokeText(r.name, q.x, q.y); }
    c.fillText(r.name, q.x, q.y);
    c.textAlign = 'center';
    if ('letterSpacing' in c) c.letterSpacing = '0px';
  }
  // Windrose oben rechts
  const cx = v.dx + W.N * v.s - 34, cy = v.dy + 38;
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
    const d = Math.hypot(sp.x - px, sp.y - (u.mounted ? 22 : 14) * G.cam.zoom - py);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
