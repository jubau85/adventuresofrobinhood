// Isometrischer Renderer: Gelände in Chunks, Objekte tiefensortiert, Tag/Nacht, Minikarte.

import { G } from './state.js';
import { TW, TH, CHUNK, T, ITEMS, FACTIONS, CASTLE_LAYOUT } from './data.js';
import { isoX, isoY, HW, HH, screenToWorld, worldToScreen } from './iso.js';
import { hash2, mulberry32 } from './rng.js';
import { seasonIndex, darkness, warmth, hourOf } from './sim.js';
import { unitLook } from './units.js';
import { questTarget } from './politics.js';

let canvas = null, ctx = null;
const chunkCache = new Map();
let cacheSeason = -1;
let sprites = null, spriteSeason = -1;
let staticParts = [];
let castleParts = [];
let lights = [];
let smoke = [];
let snow = [];
let minimapBase = null, minimapSeason = -1;

// ---------------------------------------------------------------- Farben
const shadeCache = new Map();
export function shade(hex, f) {
  const key = hex + f;
  let v = shadeCache.get(key);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  v = `rgb(${r},${g},${b})`;
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
  { grass: '#6f9b45', grass2: '#79a44c', forest: '#557d36', hills: '#8c9259', field: '#7fa94b', fieldRow: '#5d8a34', road: '#a78b62', sand: '#cdbd8c', water: '#3e7393', foam: 'rgba(230,240,240,0.45)' },
  { grass: '#7d9d3f', grass2: '#87a747', forest: '#4f7532', hills: '#979159', field: '#d4b64f', fieldRow: '#b49436', road: '#ae9166', sand: '#d5c493', water: '#3b7090', foam: 'rgba(230,240,240,0.45)' },
  { grass: '#8e9045', grass2: '#9a984c', forest: '#6e6232', hills: '#918259', field: '#9e7c3d', fieldRow: '#7b5e2d', road: '#9e835e', sand: '#c4b083', water: '#3a6683', foam: 'rgba(230,240,240,0.4)' },
  { grass: '#dfe6e6', grass2: '#e8eded', forest: '#cbd5d4', hills: '#d2d8d4', field: '#e3e8e7', fieldRow: '#c6cdcc', road: '#b8b1a5', sand: '#dadcd6', water: '#6d8ea2', foam: 'rgba(255,255,255,0.6)' },
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
function P(x, y, z = 0) { return [isoX(x, y), isoY(x, y) - z]; }

function winterize(col) { return seasonIndex() === 3 ? mix(col, '#eef2f2', 0.65) : col; }

export function drawBox(c, cx, cy, wx, wy, h, col, z = 0) {
  const x0 = cx - wx / 2, x1 = cx + wx / 2, y0 = cy - wy / 2, y1 = cy + wy / 2;
  poly(c, [P(x0, y1, z), P(x1, y1, z), P(x1, y1, z + h), P(x0, y1, z + h)], shade(col, 0.95));
  poly(c, [P(x1, y1, z), P(x1, y0, z), P(x1, y0, z + h), P(x1, y1, z + h)], shade(col, 0.74));
  poly(c, [P(x0, y0, z + h), P(x1, y0, z + h), P(x1, y1, z + h), P(x0, y1, z + h)], shade(col, 1.12));
}

function drawGableRoof(c, cx, cy, wx, wy, h, rh, col, gableCol, alongX) {
  const o = 0.1;
  const x0 = cx - wx / 2 - o, x1 = cx + wx / 2 + o, y0 = cy - wy / 2 - o, y1 = cy + wy / 2 + o;
  col = winterize(col);
  if (alongX) {
    const R0 = P(x0, cy, h + rh), R1 = P(x1, cy, h + rh);
    poly(c, [P(x0, y0, h), P(x1, y0, h), R1, R0], shade(col, 0.78));
    poly(c, [P(cx + wx / 2, cy - wy / 2, h), P(cx + wx / 2, cy + wy / 2, h), P(cx + wx / 2, cy, h + rh)], shade(gableCol, 0.74));
    poly(c, [P(x0, y1, h), P(x1, y1, h), R1, R0], shade(col, 1.0));
  } else {
    const R0 = P(cx, y0, h + rh), R1 = P(cx, y1, h + rh);
    poly(c, [P(x0, y0, h), P(x0, y1, h), R1, R0], shade(col, 1.05));
    poly(c, [P(cx - wx / 2, cy + wy / 2, h), P(cx + wx / 2, cy + wy / 2, h), P(cx, cy + wy / 2, h + rh)], shade(gableCol, 0.95));
    poly(c, [P(x1, y0, h), P(x1, y1, h), R1, R0], shade(col, 0.78));
  }
}

function drawPyramid(c, cx, cy, wx, wy, h, rh, col) {
  col = winterize(col);
  const o = 0.08;
  const x0 = cx - wx / 2 - o, x1 = cx + wx / 2 + o, y0 = cy - wy / 2 - o, y1 = cy + wy / 2 + o;
  const A = P(cx, cy, h + rh);
  poly(c, [P(x0, y1, h), P(x1, y1, h), A], shade(col, 1.0));
  poly(c, [P(x1, y1, h), P(x1, y0, h), A], shade(col, 0.76));
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
}

function addLight(x, y, z, r = 26, strength = 1) { lights.push({ x, y, z, r, s: strength }); }

// ---------------------------------------------------------------- Gebäude
const WALLS = { plaster: '#d9ccb0', timber: '#d6c6a2', stone: '#a39d90', wood: '#8f6a45' };
const ROOFS = { thatch: '#b39352', tile: '#9a4f3a', wood: '#6e5236', slate: '#5e6670' };

function faceQuad(c, x, y, wx, wy, face, u0, u1, z0, z1, col) {
  const x0 = x - wx / 2, x1 = x + wx / 2, y0 = y - wy / 2, y1 = y + wy / 2;
  if (face === 'L') poly(c, [P(x0 + u0 * wx, y1, z0), P(x0 + u1 * wx, y1, z0), P(x0 + u1 * wx, y1, z1), P(x0 + u0 * wx, y1, z1)], col);
  else poly(c, [P(x1, y1 - u0 * wy, z0), P(x1, y1 - u1 * wy, z0), P(x1, y1 - u1 * wy, z1), P(x1, y1 - u0 * wy, z1)], col);
}

function drawHouse(c, b) {
  const wall = WALLS[b.wall] || WALLS.plaster;
  drawBox(c, b.x, b.y, b.wx, b.wy, b.h, wall);
  if (b.wall === 'timber') {
    const beam = '#5a4030';
    for (const u of [0, 0.5, 1]) faceQuad(c, b.x, b.y, b.wx, b.wy, 'L', Math.max(0, u - 0.04), Math.min(1, u + 0.04), 0, b.h, beam);
    for (const u of [0, 1]) faceQuad(c, b.x, b.y, b.wx, b.wy, 'R', Math.max(0, u - 0.05), Math.min(1, u + 0.05), 0, b.h, shade(beam, 0.8));
    faceQuad(c, b.x, b.y, b.wx, b.wy, 'L', 0, 1, b.h * 0.55, b.h * 0.6, beam);
  }
  faceQuad(c, b.x, b.y, b.wx, b.wy, 'L', 0.38, 0.62, 0, Math.min(11, b.h * 0.7), '#3d2b1f');
  const night = darkness() > 0.2;
  const winCol = night && b.lit ? '#ffcf6a' : '#2b2420';
  faceQuad(c, b.x, b.y, b.wx, b.wy, 'R', 0.35, 0.6, b.h * 0.45, b.h * 0.75, winCol);
  if (night && b.lit) addLight(b.x + b.wx / 2, b.y, b.h * 0.6, 22, 0.8);
  const roof = ROOFS[b.roof] || ROOFS.thatch;
  drawGableRoof(c, b.x, b.y, b.wx, b.wy, b.h, b.rh, roof, wall, b.wx >= b.wy);
  if (b.chimney) {
    drawBox(c, b.x + b.wx * 0.2, b.y - b.wy * 0.15, 0.16, 0.16, b.rh * 0.8 + 6, '#7d756a', b.h);
    b.smoke = P(b.x + b.wx * 0.2, b.y - b.wy * 0.15, b.h + b.rh * 0.8 + 6);
  }
}

function drawChurch(c, b) {
  const stone = '#b1aa9c';
  const tx = b.x + b.wx / 2 - 0.45, ty = b.y;
  drawBox(c, b.x - 0.25, b.y, b.wx - 0.5, b.wy, b.h, stone);
  drawGableRoof(c, b.x - 0.25, b.y, b.wx - 0.5, b.wy, b.h, 16, ROOFS.tile, stone, true);
  for (const u of [0.15, 0.45, 0.75]) faceQuad(c, b.x - 0.25, b.y, b.wx - 0.5, b.wy, 'L', u, u + 0.08, b.h * 0.35, b.h * 0.8, darkness() > 0.2 ? '#ffd27a' : '#3a3232');
  const th = b.abbey ? 70 : 58;
  drawBox(c, tx, ty, 1.0, 1.0, th, stone);
  faceQuad(c, tx, ty, 1, 1, 'L', 0.4, 0.6, th * 0.7, th * 0.85, '#2f2a28');
  drawPyramid(c, tx, ty, 1.0, 1.0, th, 24, ROOFS.slate);
  const [ax, ay] = P(tx, ty, th + 24);
  c.strokeStyle = '#d6ad4c'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax, ay - 9); c.moveTo(ax - 3, ay - 6); c.lineTo(ax + 3, ay - 6); c.stroke();
  if (darkness() > 0.2) addLight(b.x, b.y + b.wy / 2, b.h * 0.6, 34, 0.7);
}

function drawLonghall(c, b) {
  drawBox(c, b.x, b.y, b.wx, b.wy, b.h, WALLS.wood);
  faceQuad(c, b.x, b.y, b.wx, b.wy, 'L', 0.45, 0.55, 0, 13, '#2e2016');
  drawGableRoof(c, b.x, b.y, b.wx, b.wy, b.h, 22, ROOFS.thatch, WALLS.wood, true);
  const [ex, ey] = P(b.x + b.wx / 2 + 0.1, b.y, b.h + 22);
  c.strokeStyle = '#4a3322'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(ex - 5, ey - 7); c.lineTo(ex, ey); c.lineTo(ex + 5, ey - 7); c.stroke();
  if (darkness() > 0.2) addLight(b.x, b.y + b.wy / 2, 6, 40, 1);
}

function drawTent(c, b) {
  const col = b.color || '#d8ccb0';
  drawGableRoof(c, b.x, b.y, b.wx, b.wy * 0.9, 0, 20, col, col, true);
  const [px, py] = P(b.x + b.wx / 2 + 0.1, b.y, 20);
  c.strokeStyle = '#4a3322'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 6); c.stroke();
}

function drawStall(c, b) {
  const x0 = b.x - 0.4, x1 = b.x + 0.4, y0 = b.y - 0.3, y1 = b.y + 0.3;
  c.strokeStyle = '#5a4030'; c.lineWidth = 1.5;
  for (const [x, y] of [[x0, y1], [x1, y1], [x1, y0]]) { const [a, bb] = P(x, y, 0); c.beginPath(); c.moveTo(a, bb); c.lineTo(a, bb - 16); c.stroke(); }
  drawBox(c, b.x, b.y, 0.8, 0.5, 7, '#8a6a45');
  poly(c, [P(x0, y0, 20), P(x1, y0, 20), P(x1, y1 + 0.1, 14), P(x0, y1 + 0.1, 14)], winterize(b.color));
  poly(c, [P(x0, y1 + 0.1, 14), P(x1, y1 + 0.1, 14), P(x1, y1 + 0.1, 11), P(x0, y1 + 0.1, 11)], shade(b.color, 0.8));
}

function drawWell(c, b) {
  drawBox(c, b.x, b.y, 0.6, 0.6, 7, '#8f897c');
  c.strokeStyle = '#5a4030'; c.lineWidth = 1.5;
  const [a1, b1] = P(b.x - 0.25, b.y + 0.25, 7), [a2, b2] = P(b.x + 0.25, b.y - 0.25, 7);
  c.beginPath(); c.moveTo(a1, b1); c.lineTo(a1, b1 - 13); c.moveTo(a2, b2); c.lineTo(a2, b2 - 13); c.stroke();
  drawGableRoof(c, b.x, b.y, 0.7, 0.7, 19, 5, ROOFS.wood, '#6e5236', true);
}

function drawFire(c, b) {
  const [x, y] = P(b.x, b.y, 0);
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
  }
}

function drawStones(c, x, y, n) {
  for (let k = 0; k < n; k++) {
    const ox = (k % 3) * 0.3 - 0.3, oy = (Math.floor(k / 3) % 2) * 0.3 - 0.15, z = Math.floor(k / 6) * 6;
    drawBox(c, x + ox, y + oy, 0.26, 0.26, 6, '#9d988c', z);
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
  const add = (x, y, f, bias = 0) => parts.push({ x, y, d: x + y + bias, f });
  const stone = '#a29c8f', wood = '#8a6440';
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
      add(s.x, s.y, (c) => drawBox(c, s.x, s.y, s.along === 'x' ? 1 : 0.45, s.along === 'x' ? 0.45 : 1, h, '#8f8a80'));
    }
    for (const [x, y] of corners) { const h = 10 + r() * 18; add(x, y, (c) => drawBox(c, x, y, 1.1, 1.1, h, '#8a857a')); }
    add(cx - 1.2, cy - 1.2, (c) => { drawBox(c, cx - 1.2, cy - 1.2, 2.1, 2.1, 24, '#8a857a'); drawBox(c, cx - 1.6, cy - 1.0, 0.8, 1.0, 12, '#8a857a', 24); });
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
    for (const gx of [-1.15, 1.15]) add(cx + gx, cy + R, (c) => { drawBox(c, cx + gx, cy + R, 0.5, 0.5, 34, wood); drawPyramid(c, cx + gx, cy + R, 0.5, 0.5, 34, 8, ROOFS.wood); });
    add(cx - 1.2, cy - 1.2, (c) => {
      drawBox(c, cx - 1.2, cy - 1.2, 1.6, 1.6, 56, wood);
      faceQuad(c, cx - 1.2, cy - 1.2, 1.6, 1.6, 'L', 0.4, 0.6, 0, 12, '#3a2a1c');
      faceQuad(c, cx - 1.2, cy - 1.2, 1.6, 1.6, 'R', 0.4, 0.55, 34, 42, darkness() > 0.2 ? '#ffcf6a' : '#2a2018');
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
      drawBox(c, s.x, s.y, wx, wy, wh, stone);
      for (const k of [-0.25, 0.25]) {
        const mx = s.along === 'x' ? s.x + k : s.x, my = s.along === 'y' ? s.y + k : s.y;
        drawBox(c, mx, my, s.along === 'x' ? 0.24 : 0.5, s.along === 'y' ? 0.24 : 0.5, 6, stone, wh);
      }
    });
  }
  const th = level >= 3 ? 66 : 50;
  for (const [x, y] of corners) {
    add(x, y, (c) => {
      drawBox(c, x, y, 1.4, 1.4, th, stone);
      faceQuad(c, x, y, 1.4, 1.4, 'L', 0.42, 0.58, th * 0.6, th * 0.72, '#2c2622');
      if (level >= 3) { drawPyramid(c, x, y, 1.4, 1.4, th, 30, ROOFS.slate); banner(c, x, y, th + 30, bannerCol); }
      else drawMerlons(c, x, y, 1.4, 1.4, th, stone);
    }, 0.4);
  }
  for (const gx of [-1.3, 1.3]) {
    add(cx + gx, cy + R, (c) => {
      drawBox(c, cx + gx, cy + R, 1.0, 1.0, wh + 16, stone);
      drawMerlons(c, cx + gx, cy + R, 1.0, 1.0, wh + 16, stone);
    }, 0.3);
  }
  add(cx, cy + R - 0.05, (c) => {
    drawBox(c, cx, cy + R, 1.6, 0.8, 10, stone, wh - 4);
    faceQuad(c, cx, cy + R, 1.6, 0.8, 'L', 0.05, 0.95, wh - 4, wh - 3, '#3a2a1c');
  }, 0.2);
  if (level >= 3) {
    for (const [x, y] of [[cx, cy - R], [cx - R, cy]]) add(x, y, (c) => { drawBox(c, x, y, 1.1, 1.1, 56, stone); drawPyramid(c, x, y, 1.1, 1.1, 56, 24, ROOFS.slate); }, 0.3);
  }
  const kw = level >= 3 ? 2.8 : 2.2, kh = level >= 3 ? 100 : 76;
  add(cx - 1.1, cy - 1.1, (c) => {
    drawBox(c, cx - 1.1, cy - 1.1, kw, kw, kh, '#aaa496');
    faceQuad(c, cx - 1.1, cy - 1.1, kw, kw, 'L', 0.4, 0.6, 0, 16, '#2c2420');
    for (const z of [0.45, 0.72]) {
      const lit = darkness() > 0.2;
      faceQuad(c, cx - 1.1, cy - 1.1, kw, kw, 'L', 0.2, 0.3, kh * z, kh * z + 9, lit ? '#ffd27a' : '#2c2622');
      faceQuad(c, cx - 1.1, cy - 1.1, kw, kw, 'R', 0.6, 0.7, kh * z, kh * z + 9, lit ? '#ffd27a' : '#2c2622');
    }
    drawMerlons(c, cx - 1.1, cy - 1.1, kw, kw, kh, '#aaa496', 0.24);
    banner(c, cx - 1.1, cy - 1.1, kh + 6, bannerCol);
    if (darkness() > 0.2) addLight(cx - 1.1, cy - 1.1 + kw / 2, kh * 0.5, 40, 0.8);
  });
  return parts;
}

function palisadeRing(site, r) {
  const parts = [];
  const wood = '#8a6440';
  const n = Math.round(Math.PI * 2 * r / 0.36);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    if (Math.abs(a - Math.PI * 0.5) < 0.28) continue;
    const x = site.x + Math.cos(a) * r, y = site.y + Math.sin(a) * r;
    parts.push({ x, y, d: x + y, f: (c) => { drawBox(c, x, y, 0.22, 0.22, 20, wood); drawPyramid(c, x, y, 0.22, 0.22, 20, 5, wood); } });
  }
  return parts;
}

function buildStaticParts() {
  const W = G.world;
  const parts = [];
  for (const b of W.buildings) {
    const f = {
      house: drawHouse, church: drawChurch, longhall: drawLonghall, tent: drawTent, stall: drawStall,
      well: drawWell, fire: drawFire, fence: drawFence,
    }[b.kind];
    if (f) parts.push({ x: b.x, y: b.y, d: b.x + b.y, f: (c) => f(c, b), b });
  }
  for (const s of W.sites) {
    if (s.type === 'burg') parts.push(...castlePieces(s, s.castleLevel, FACTIONS[s.faction].color));
    if (s.palisade) parts.push(...palisadeRing(s, s.palisade));
  }
  return parts;
}

function buildPlayerCastle() {
  const s = G.world.sites.find((x) => x.type === 'spieler');
  const C = G.s.castle;
  const parts = castlePieces(s, C.level, '#2c4f86');
  const add = (x, y, f) => parts.push({ x, y, d: x + y, f });
  const lv = (id) => C.b[id] || 0;
  const pos = (id) => ({ x: s.x + CASTLE_LAYOUT[id].dx, y: s.y + CASTLE_LAYOUT[id].dy });
  const con = C.construction;
  const stoneOr = (l) => (l >= 2 ? 'stone' : 'wood');
  const scaffold = (id, wx, wy, h) => { const p = pos(id); add(p.x, p.y, (c) => drawScaffold(c, p.x, p.y, wx, wy, h)); };

  const H = lv('halle');
  if (H) { const p = pos('halle'); add(p.x, p.y, (c) => drawHouse(c, { x: p.x, y: p.y, wx: 1.2, wy: 2.2 + H * 0.2, h: 20 + H * 3, rh: 14, wall: H >= 2 ? 'stone' : 'timber', roof: H >= 2 ? 'tile' : 'thatch', lit: true, chimney: true })); }
  const K = lv('kaserne');
  if (K) { const p = pos('kaserne'); add(p.x, p.y, (c) => drawHouse(c, { x: p.x, y: p.y, wx: 2.0 + K * 0.3, wy: 1.0, h: 16 + K * 2, rh: 10, wall: stoneOr(K) === 'stone' ? 'stone' : 'wood', roof: 'wood', lit: true })); }
  const S = lv('schmiede');
  if (S) {
    const p = pos('schmiede');
    add(p.x, p.y, (c) => {
      drawHouse(c, { x: p.x, y: p.y, wx: 1.3, wy: 1.1, h: 16, rh: 10, wall: 'stone', roof: S >= 2 ? 'tile' : 'thatch', lit: true, chimney: false });
      drawBox(c, p.x + 0.35, p.y - 0.25, 0.3, 0.3, 30, '#6d665c');
      const sp = P(p.x + 0.35, p.y - 0.25, 30); smokeEmit(sp[0], sp[1], 0.12);
      if (darkness() > 0.1) addLight(p.x + 0.65, p.y, 8, 30, 1);
      drawBox(c, p.x + 0.9, p.y + 0.5, 0.3, 0.2, 6, '#3c3a38');
    });
  }
  const ST = lv('stall');
  if (ST) {
    const p = pos('stall');
    add(p.x, p.y, (c) => {
      drawHouse(c, { x: p.x, y: p.y, wx: 1.1, wy: 2.0 + ST * 0.4, h: 14, rh: 10, wall: 'wood', roof: 'thatch', lit: false });
      drawHorseStanding(c, p.x + 1.0, p.y + 0.4, '#7a5232');
      if (ST >= 2) drawHorseStanding(c, p.x + 1.1, p.y - 0.6, '#b8b0a2');
    });
  }
  const KP = lv('kapelle');
  if (KP) { const p = pos('kapelle'); add(p.x, p.y, (c) => drawChurch(c, { x: p.x, y: p.y, wx: 1.6 + KP * 0.4, wy: 1.0, h: 20 + KP * 4 })); }
  const M = lv('markt');
  if (M) {
    const p = pos('markt');
    const cols = ['#a33b32', '#3d6fa3', '#d6ad4c', '#5b8a3c', '#e8e0cc'];
    for (let k = 0; k < 1 + M; k++) {
      const x = p.x + (k % 2) * 1.2 - 0.6, y = p.y + Math.floor(k / 2) * 1.1 - 0.5;
      add(x, y, (c) => drawStall(c, { x, y, color: cols[k % cols.length] }));
    }
  }
  const HF = lv('holzfaeller');
  if (HF) { const p = pos('holzfaeller'); add(p.x, p.y, (c) => { drawHouse(c, { x: p.x, y: p.y, wx: 1.0, wy: 0.9, h: 12, rh: 8, wall: 'wood', roof: 'wood', lit: true }); drawLogs(c, p.x + 1.1, p.y + 0.3, 2 + HF * 2); }); }
  const SB = lv('steinbruch');
  if (SB) { const p = pos('steinbruch'); add(p.x, p.y, (c) => { drawBox(c, p.x, p.y, 1.6, 1.2, 10, '#8a857a'); drawStones(c, p.x + 1.2, p.y + 0.6, 3 + SB * 3); }); }
  const WE = lv('wehr');
  const towerSpots = [[6.4, 6.4], [-6.4, -6.4], [6.4, -6.4]];
  for (let k = 0; k < WE; k++) {
    const x = s.x + towerSpots[k][0], y = s.y + towerSpots[k][1];
    const stone = k > 0 || WE >= 2;
    add(x, y, (c) => {
      drawBox(c, x, y, 0.9, 0.9, 48, stone ? '#a29c8f' : '#8a6440');
      drawPyramid(c, x, y, 0.9, 0.9, 48, 16, stone ? ROOFS.slate : ROOFS.wood);
      if (darkness() > 0.2) addLight(x, y + 0.45, 40, 20, 0.8);
    });
  }
  if (con && con.id !== 'burg') {
    const dims = { halle: [1.2, 2.4, 26], kaserne: [2.3, 1.0, 20], schmiede: [1.3, 1.1, 18], stall: [1.1, 2.4, 16], kapelle: [2.0, 1.0, 26], markt: [1.6, 1.4, 12], holzfaeller: [1.0, 0.9, 14], steinbruch: [1.6, 1.2, 12], wehr: [0.9, 0.9, 40] };
    const d = dims[con.id];
    if (con.id === 'wehr') {
      const t = towerSpots[con.level - 1];
      add(s.x + t[0], s.y + t[1], (c) => drawScaffold(c, s.x + t[0], s.y + t[1], d[0], d[1], d[2]));
    } else if (!lv(con.id)) scaffold(con.id, d[0], d[1], d[2]);
    else { const p = pos(con.id); add(p.x + 0.8, p.y + 0.8, (c) => drawScaffold(c, p.x + 0.8, p.y + 0.8, 0.8, 0.8, 18)); }
  }
  if (con && con.id === 'burg') {
    for (const [dx, dy] of [[-4, 4], [4, 4], [4, -4]]) add(s.x + dx, s.y + dy, (c) => drawScaffold(c, s.x + dx, s.y + dy, 1.3, 1.3, 40));
  }
  return parts;
}

function drawHorseStanding(c, x, y, col) {
  const [px, py] = P(x, y, 0);
  c.save(); c.translate(px, py);
  drawHorse(c, col, 0, false, null);
  c.restore();
}

// ---------------------------------------------------------------- Bäume & Felsen
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function makeDeciduous(season, v) {
  const w = 64, h = 84;
  const cv = makeCanvas(w, h), g = cv.getContext('2d');
  const r = mulberry32(1000 + v * 17);
  g.fillStyle = '#5a4030';
  g.fillRect(w / 2 - 3, h - 30, 6, 28);
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
    g.fillStyle = 'rgba(250,252,252,0.85)';
    for (let k = 0; k < 10; k++) g.fillRect(w / 2 - 16 + r() * 32, 14 + r() * 30, 3, 1.5);
    return { cvs: cv, ax: w / 2, ay: h - 3 };
  }
  const sets = [
    ['#4f8a34', '#6aa344', '#8cc25a'],
    ['#3f7a2c', '#52913a', '#71ad4e'],
    v === 1 ? ['#9c3f22', '#c25a2c', '#e08a44'] : v === 2 ? ['#a8761f', '#d09a2e', '#ecc35a'] : ['#7a6a26', '#a88a2e', '#cfb04a'],
  ][season];
  const cx = w / 2, cy = 32;
  const blobs = [];
  for (let k = 0; k < 9; k++) {
    const a = r() * Math.PI * 2, d = r() * 11;
    blobs.push([cx + Math.cos(a) * d * 1.25, cy + Math.sin(a) * d * 0.85, 10 + r() * 6]);
  }
  g.fillStyle = sets[0];
  for (const [x, y, rr] of blobs) { g.beginPath(); g.arc(x + 2, y + 3, rr, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = sets[1];
  for (const [x, y, rr] of blobs) { g.beginPath(); g.arc(x, y, rr * 0.88, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = sets[2];
  for (const [x, y, rr] of blobs.slice(0, 5)) { g.beginPath(); g.arc(x - 3, y - 4, rr * 0.45, 0, Math.PI * 2); g.fill(); }
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
    g.fillStyle = season === 3 ? '#2d4b34' : '#2f5a36';
    g.beginPath(); g.moveTo(w / 2 - half, by); g.lineTo(w / 2, top); g.lineTo(w / 2 + half, by); g.closePath(); g.fill();
    g.fillStyle = season === 3 ? '#3a5e42' : '#3f7046';
    g.beginPath(); g.moveTo(w / 2 - half, by); g.lineTo(w / 2, top); g.lineTo(w / 2 - 1, by); g.closePath(); g.fill();
    if (season === 3) {
      g.fillStyle = 'rgba(248,250,250,0.92)';
      g.beginPath(); g.moveTo(w / 2 - half * 0.75, by - 5); g.lineTo(w / 2, top + 1); g.lineTo(w / 2 + half * 0.6, by - 6); g.lineTo(w / 2, top + 8); g.closePath(); g.fill();
    }
  }
  return { cvs: cv, ax: w / 2, ay: h - 3 };
}

function makeRock(season, v) {
  const w = 40, h = 30;
  const cv = makeCanvas(w, h), g = cv.getContext('2d');
  const r = mulberry32(3000 + v * 7);
  const pts = [];
  for (let k = 0; k < 7; k++) { const a = Math.PI + (k / 6) * Math.PI; pts.push([20 + Math.cos(a) * (12 + r() * 6), 24 + Math.sin(a) * (10 + r() * 8)]); }
  g.fillStyle = '#7f7b72';
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1]); g.closePath(); g.fill();
  g.fillStyle = '#9b978c';
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(0, 4)) g.lineTo(p[0], p[1]); g.lineTo(20, 22); g.closePath(); g.fill();
  if (season === 3) { g.fillStyle = 'rgba(250,252,252,0.9)'; g.beginPath(); g.ellipse(18, 12, 9, 4, 0, 0, Math.PI * 2); g.fill(); }
  return { cvs: cv, ax: 20, ay: 25 };
}

function ensureSprites() {
  const s = seasonIndex();
  if (sprites && spriteSeason === s) return;
  spriteSeason = s;
  sprites = { laub: [0, 1, 2].map((v) => makeDeciduous(s, v)), nadel: [0, 1, 2].map((v) => makeConifer(s, v)), fels: [0, 1, 2].map((v) => makeRock(s, v)) };
}

function drawTreeObj(c, o) {
  const set = sprites[o.kind];
  const sp = set[o.v % set.length];
  const x = isoX(o.x, o.y), y = isoY(o.x, o.y);
  const w = sp.cvs.width * o.s, h = sp.cvs.height * o.s;
  c.fillStyle = 'rgba(0,0,0,0.16)';
  c.beginPath(); c.ellipse(x, y, 12 * o.s, 5 * o.s, 0, 0, Math.PI * 2); c.fill();
  c.drawImage(sp.cvs, x - sp.ax * o.s, y - sp.ay * o.s, w, h);
}

// ---------------------------------------------------------------- Gelände
function diamond(c, sx, sy) {
  c.beginPath();
  c.moveTo(sx, sy); c.lineTo(sx + HW, sy + HH); c.lineTo(sx, sy + TH); c.lineTo(sx - HW, sy + HH);
  c.closePath();
}

function isRoadish(W, i, j) {
  if (i < 0 || j < 0 || i >= W.N || j >= W.N) return false;
  const t = W.tiles[j * W.N + i];
  return t === T.ROAD || t === T.BRIDGE;
}

function drawTile(c, W, t, sx, sy, i, j, pal, season) {
  const h = hash2(i, j, 77), h2 = hash2(i, j, 991);
  let col;
  switch (t) {
    case T.WATER: col = pal.water; break;
    case T.FOREST: col = pal.forest; break;
    case T.HILLS: col = pal.hills; break;
    case T.FIELD: col = pal.field; break;
    case T.SAND: col = pal.sand; break;
    case T.BRIDGE: col = pal.water; break;
    default: col = h < 0.5 ? pal.grass : pal.grass2;
  }
  const fill = shade(col, 0.94 + h * 0.12);
  diamond(c, sx, sy);
  c.fillStyle = fill; c.fill();
  c.strokeStyle = fill; c.lineWidth = 1; c.stroke();

  if (t === T.WATER || t === T.BRIDGE) {
    c.strokeStyle = pal.foam; c.lineWidth = 1.5;
    const N = W.N;
    const land = (a, b) => a >= 0 && b >= 0 && a < N && b < N && W.tiles[b * N + a] !== T.WATER && W.tiles[b * N + a] !== T.BRIDGE;
    c.beginPath();
    if (land(i, j - 1)) { c.moveTo(sx, sy + 1); c.lineTo(sx + HW - 1, sy + HH); }
    if (land(i + 1, j)) { c.moveTo(sx + HW - 1, sy + HH); c.lineTo(sx, sy + TH - 1); }
    if (land(i, j + 1)) { c.moveTo(sx, sy + TH - 1); c.lineTo(sx - HW + 1, sy + HH); }
    if (land(i - 1, j)) { c.moveTo(sx - HW + 1, sy + HH); c.lineTo(sx, sy + 1); }
    c.stroke();
    if (h < 0.35) {
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(sx - 10 + h2 * 8, sy + HH + 2); c.lineTo(sx + h2 * 8, sy + HH + 2); c.stroke();
    }
  }
  if (t === T.GRASS || t === T.FOREST || t === T.HILLS) {
    c.strokeStyle = shade(col, 0.78); c.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const a = hash2(i * 3 + k, j, 5), b = hash2(i, j * 3 + k, 6);
      const px = sx + (a - 0.5) * HW * 1.1, py = sy + HH + (b - 0.5) * HH * 1.1;
      c.beginPath(); c.moveTo(px, py); c.lineTo(px - 1, py - 3); c.moveTo(px + 2, py); c.lineTo(px + 2.5, py - 3); c.stroke();
    }
    if (t === T.GRASS && season < 2 && h2 < 0.12) {
      c.fillStyle = h2 < 0.04 ? '#f2e6a0' : h2 < 0.08 ? '#e8eef0' : '#c9524a';
      c.fillRect(sx - 6 + h * 12, sy + HH - 2 + h2 * 20, 2, 2);
      c.fillRect(sx + 4 - h * 8, sy + HH + 3 - h2 * 10, 2, 2);
    }
  }
  if (t === T.HILLS) {
    c.fillStyle = shade(col, 1.12);
    c.beginPath(); c.ellipse(sx - 3 + h * 6, sy + HH - 2, 18, 7, 0, Math.PI, 0); c.fill();
    c.fillStyle = shade(col, 0.82);
    c.beginPath(); c.ellipse(sx + 4 + h * 6, sy + HH + 1, 14, 4, 0, 0, Math.PI); c.fill();
  }
  if (t === T.FIELD) {
    c.strokeStyle = pal.fieldRow; c.lineWidth = 2;
    for (let k = 1; k <= 4; k++) {
      const f = k / 5;
      const ax = sx - HW + f * HW, ay = sy + HH - f * HH;
      c.beginPath(); c.moveTo(ax + 2, ay + 1); c.lineTo(ax + HW - 2, ay + HH - 1); c.stroke();
    }
  }
  if (t === T.ROAD || t === T.BRIDGE) {
    const cx = sx, cy = sy + HH;
    const bridge = t === T.BRIDGE;
    const arms = [];
    if (isRoadish(W, i, j - 1)) arms.push([sx + HW / 2, sy + HH / 2]);
    if (isRoadish(W, i + 1, j)) arms.push([sx + HW / 2, sy + HH * 1.5]);
    if (isRoadish(W, i, j + 1)) arms.push([sx - HW / 2, sy + HH * 1.5]);
    if (isRoadish(W, i - 1, j)) arms.push([sx - HW / 2, sy + HH / 2]);
    c.lineCap = 'round';
    if (!bridge) {
      c.fillStyle = shade(pal.grass, 0.97);
      diamond(c, sx, sy); c.fill();
    }
    const rc = bridge ? '#8a6a42' : pal.road;
    c.strokeStyle = shade(rc, 0.85); c.lineWidth = bridge ? 15 : 16;
    for (const [ax, ay] of arms) { c.beginPath(); c.moveTo(cx, cy); c.lineTo(ax, ay); c.stroke(); }
    c.strokeStyle = rc; c.lineWidth = bridge ? 12 : 12;
    for (const [ax, ay] of arms) { c.beginPath(); c.moveTo(cx, cy); c.lineTo(ax, ay); c.stroke(); }
    if (!arms.length) { c.fillStyle = rc; c.beginPath(); c.ellipse(cx, cy, 8, 4, 0, 0, Math.PI * 2); c.fill(); }
    if (!bridge && h < 0.5) {
      c.fillStyle = shade(rc, 0.75);
      c.fillRect(cx - 3 + h * 8, cy - 1 + h2 * 3, 2, 1.5);
    }
    if (bridge) {
      c.strokeStyle = 'rgba(60,40,20,0.6)'; c.lineWidth = 1;
      for (const [ax, ay] of arms) {
        for (let k = 1; k < 4; k++) {
          const px = cx + (ax - cx) * (k / 4), py = cy + (ay - cy) * (k / 4);
          const nx = -(ay - cy), ny = ax - cx, nl = Math.hypot(nx, ny) || 1;
          c.beginPath(); c.moveTo(px + (nx / nl) * 6, py + (ny / nl) * 6); c.lineTo(px - (nx / nl) * 6, py - (ny / nl) * 6); c.stroke();
        }
      }
    }
    c.lineCap = 'butt';
  }
}

function renderChunk(cx, cy) {
  const W = G.world, N = W.N;
  const season = seasonIndex();
  const pal = PAL[season];
  const pad = 12;
  const cvs = makeCanvas(CHUNK * TW, CHUNK * TH + pad);
  const c = cvs.getContext('2d');
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  const ox = -isoX(x0, y0 + CHUNK), oy = -isoY(x0, y0) + pad;
  for (let j = y0; j < y0 + CHUNK; j++) for (let i = x0; i < x0 + CHUNK; i++) {
    drawTile(c, W, W.tiles[j * N + i], isoX(i, j) + ox, isoY(i, j) + oy, i, j, pal, season);
  }
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

// ---------------------------------------------------------------- Figuren
const HORSES = { klepper: '#7a5232', zelter: '#b8b0a2', schlachtross: '#2e2925' };

function drawHorse(c, col, t, moving, look) {
  const s = moving ? Math.sin(t * 13) * 3 : 0;
  c.strokeStyle = shade(col, 0.7); c.lineWidth = 2.4; c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-7, -7); c.lineTo(-7 + s, 0);
  c.moveTo(-4, -7); c.lineTo(-4 - s, 0);
  c.moveTo(5, -7); c.lineTo(5 - s, 0);
  c.moveTo(8, -7); c.lineTo(8 + s, 0);
  c.stroke();
  c.fillStyle = col;
  c.beginPath(); c.ellipse(0, -10, 10.5, 4.6, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(6, -13); c.lineTo(11, -20); c.lineTo(14, -18); c.lineTo(9, -10); c.closePath(); c.fill();
  c.beginPath(); c.ellipse(13.5, -19, 3.8, 2.1, 0.4, 0, Math.PI * 2); c.fill();
  c.strokeStyle = shade(col, 0.55); c.lineWidth = 2;
  c.beginPath(); c.moveTo(-10, -11); c.quadraticCurveTo(-14, -9, -13, -4); c.stroke();
  c.beginPath(); c.moveTo(9, -16); c.lineTo(7, -13); c.stroke();
  if (look) {
    c.fillStyle = look.tunic;
    c.globalAlpha = 0.85;
    c.beginPath(); c.moveTo(-8, -13); c.lineTo(6, -13); c.lineTo(7, -7); c.lineTo(-9, -7); c.closePath(); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = look.trim; c.fillRect(-8, -8, 15, 1.2);
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
      c.strokeStyle = '#6b4a2a'; c.lineWidth = 1.6;
      c.beginPath(); c.arc(1, 0, 8, -Math.PI / 2.4, Math.PI / 2.4); c.stroke();
      c.strokeStyle = 'rgba(240,230,200,0.8)'; c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(1 + 8 * Math.cos(-Math.PI / 2.4), 8 * Math.sin(-Math.PI / 2.4)); c.lineTo(1 - sw * 3, 0); c.lineTo(1 + 8 * Math.cos(Math.PI / 2.4), 8 * Math.sin(Math.PI / 2.4)); c.stroke();
      break;
    case 'armbrust':
      c.strokeStyle = '#5a3d26'; c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(-2, 0); c.lineTo(9, -1); c.stroke();
      c.strokeStyle = '#3a3a3a'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(8, -5); c.quadraticCurveTo(10, -1, 8, 3); c.stroke();
      break;
    case 'speer': {
      const a = -0.9 + sw * 0.9;
      c.rotate(a);
      c.strokeStyle = '#7a5a3a'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(-6, 0); c.lineTo(16, 0); c.stroke();
      c.fillStyle = '#c8cdd2'; c.beginPath(); c.moveTo(16, -2); c.lineTo(21, 0); c.lineTo(16, 2); c.fill();
      break;
    }
    default: {
      const a = -1.2 + sw * 2.0;
      c.rotate(a);
      if (it.kind === 'axt' || it.kind === 'hammer' || it.kind === 'keule') {
        c.strokeStyle = '#6b4a2a'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(0, 0); c.lineTo(11, 0); c.stroke();
        c.fillStyle = it.kind === 'keule' ? '#6b4a2a' : '#9aa0a6';
        if (it.kind === 'axt') { c.beginPath(); c.moveTo(9, -1); c.lineTo(13, -5); c.lineTo(13, 3); c.closePath(); c.fill(); }
        else c.fillRect(9, -3, 4, 6);
      } else {
        c.strokeStyle = '#d6dadd'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(2, 0); c.lineTo(it.atk >= 7 ? 15 : 11, 0); c.stroke();
        c.strokeStyle = '#7a5a2a'; c.lineWidth = 2;
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
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.beginPath(); c.ellipse(0, 0, m ? 13 : 7, m ? 5 : 3.2, 0, 0, Math.PI * 2); c.fill();
  if (u.kind === 'player' || u.kind === 'companion') {
    c.strokeStyle = u.kind === 'player' ? 'rgba(255,214,90,0.9)' : 'rgba(150,190,255,0.7)';
    c.lineWidth = 1.4;
    c.beginPath(); c.ellipse(0, 0, m ? 15 : 9, m ? 6 : 4.2, 0, 0, Math.PI * 2); c.stroke();
  }
  c.scale(u.facing || 1, 1);
  let by = 0;
  if (m) { drawHorse(c, HORSES[u.eq.pferd] || '#7a5232', u.anim, u.moving, u.eq.pferd === 'schlachtross' ? L : null); by = -12; }
  else {
    const s = u.moving ? Math.sin(u.anim * 11) * 2.4 : 0;
    c.strokeStyle = '#3b2e24'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(-1.5, -7); c.lineTo(-1.5 + s, 0); c.moveTo(1.5, -7); c.lineTo(1.5 - s, 0); c.stroke();
  }
  const bob = u.moving && !m ? Math.abs(Math.sin(u.anim * 11)) * 1.1 : 0;
  const yb = by - bob;
  const tunic = u.tunic || L.tunic;
  if (u.eq.schild && !m) {
    c.fillStyle = shade(tunic, 0.75);
    c.beginPath(); c.ellipse(-4.5, yb - 11, 2.6, 4.2, 0, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = tunic;
  c.beginPath(); c.moveTo(-4.6, yb - 6.5); c.lineTo(4.6, yb - 6.5); c.lineTo(3.6, yb - 16); c.lineTo(-3.6, yb - 16); c.closePath(); c.fill();
  if (u.st.armorDef >= 6) { c.fillStyle = '#8d949a'; c.fillRect(-3.6, yb - 16, 7.2, 4); }
  c.fillStyle = L.trim; c.fillRect(-4.1, yb - 9.6, 8.2, 1.4);
  drawWeapon(c, u, yb);
  if (u.eq.schild) {
    const sc = u.kind === 'player' || u.kind === 'companion' ? '#d8b54a' : L.trim;
    c.fillStyle = shade(tunic, 1.1);
    c.beginPath(); c.moveTo(1.5, yb - 15); c.lineTo(7, yb - 15); c.lineTo(7, yb - 9); c.lineTo(4.2, yb - 5.5); c.lineTo(1.5, yb - 9); c.closePath(); c.fill();
    c.fillStyle = sc; c.fillRect(3.8, yb - 14.5, 1.2, 8);
  }
  c.fillStyle = '#e2b892';
  c.beginPath(); c.arc(0, yb - 19, 3.2, 0, Math.PI * 2); c.fill();
  if (L.hood) {
    c.fillStyle = L.hood;
    c.beginPath(); c.arc(0, yb - 19.4, 3.8, Math.PI * 0.95, Math.PI * 2.05); c.lineTo(3, yb - 15.5); c.lineTo(-3, yb - 15.5); c.closePath(); c.fill();
  } else if (u.st.armorDef >= 6) {
    c.fillStyle = u.st.armorDef >= 12 ? '#aab0b5' : '#9aa1a6';
    if (u.st.armorDef >= 12) { c.fillRect(-3.6, yb - 23, 7.2, 6.5); c.fillStyle = '#2a2a2a'; c.fillRect(-0.5, yb - 21, 4, 1); }
    else { c.beginPath(); c.arc(0, yb - 19.8, 3.6, Math.PI, Math.PI * 2); c.fill(); c.fillRect(0.6, yb - 20, 1, 3); }
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
    const w = 18, top = y + (m ? -40 : -29);
    c.fillStyle = 'rgba(20,12,8,0.75)'; c.fillRect(x - w / 2 - 1, top - 1, w + 2, 4);
    c.fillStyle = u.team === 'player' ? '#7bc15a' : '#d9533f';
    c.fillRect(x - w / 2, top, w * Math.max(0, u.hp / u.st.maxHp), 2);
  }
}

function drawCorpse(c, f) {
  const x = isoX(f.x, f.y), y = isoY(f.x, f.y);
  c.globalAlpha = Math.min(1, (f.dur - f.t) / 3);
  c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(x, y, 9, 3.5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = f.look.tunic; c.beginPath(); c.ellipse(x, y - 2, 6.5, 2.6, -0.2, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d9b08c'; c.beginPath(); c.arc(x + 7, y - 3.5, 2.6, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1;
}

// ---------------------------------------------------------------- Rauch & Schnee
function smokeEmit(x, y, rate) {
  if (Math.random() < rate) smoke.push({ x, y, vx: 4 + Math.random() * 4, vy: -12 - Math.random() * 6, r: 2.5, life: 0, max: 2.5 + Math.random() });
}

function drawSmoke(c, dt) {
  for (let i = smoke.length - 1; i >= 0; i--) {
    const p = smoke[i];
    p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 3;
    if (p.life > p.max) { smoke.splice(i, 1); continue; }
    c.fillStyle = `rgba(200,200,195,${0.35 * (1 - p.life / p.max)})`;
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
}

export function onSeasonChanged() { chunkCache.clear(); minimapBase = null; }

let lastFrame = 0;
export function render() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  const { w, h, dpr } = G.view;
  const cam = G.cam;
  const z = cam.zoom;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#1d2418';
  ctx.fillRect(0, 0, w, h);
  if (!G.world || !G.s) return;
  ensureSprites();
  if (cacheSeason !== seasonIndex()) { chunkCache.clear(); cacheSeason = seasonIndex(); }
  if (G.castleDirty) { castleParts = buildPlayerCastle(); G.castleDirty = false; }
  lights = [];

  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (w / 2 - cam.x * z), dpr * (h / 2 - cam.y * z));

  // sichtbarer Bereich in Weltkoordinaten
  const c1 = screenToWorld(0, 0, cam, w, h), c2 = screenToWorld(w, 0, cam, w, h), c3 = screenToWorld(0, h, cam, w, h), c4 = screenToWorld(w, h, cam, w, h);
  const minX = Math.min(c1.x, c2.x, c3.x, c4.x) - 3, maxX = Math.max(c1.x, c2.x, c3.x, c4.x) + 3;
  const minY = Math.min(c1.y, c2.y, c3.y, c4.y) - 3, maxY = Math.max(c1.y, c2.y, c3.y, c4.y) + 6;
  const W = G.world, CN = W.CN;
  const cx0 = Math.max(0, Math.floor(minX / CHUNK)), cx1 = Math.min(CN - 1, Math.floor(maxX / CHUNK));
  const cy0 = Math.max(0, Math.floor(minY / CHUNK)), cy1 = Math.min(CN - 1, Math.floor(maxY / CHUNK));
  const isoL = cam.x - w / 2 / z - 80, isoR = cam.x + w / 2 / z + 80, isoT = cam.y - h / 2 / z - 140, isoB = cam.y + h / 2 / z + 60;

  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const ch = getChunk(cx, cy);
    if (ch.x > isoR || ch.x + ch.cvs.width < isoL || ch.y > isoB || ch.y + ch.cvs.height < isoT) continue;
    ctx.drawImage(ch.cvs, ch.x, ch.y);
  }

  // Wegmarken
  const p = G.s.player;
  if (p.path && p.path.length) {
    ctx.fillStyle = 'rgba(255,230,150,0.55)';
    for (let k = p.pathI; k < p.path.length; k++) { const q = p.path[k]; ctx.beginPath(); ctx.ellipse(isoX(q.x, q.y), isoY(q.x, q.y), 2.5, 1.3, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  if (G.clickMarker) {
    const m = G.clickMarker;
    m.t += dt;
    if (m.t > 0.8) G.clickMarker = null;
    else {
      ctx.strokeStyle = `rgba(255,220,120,${1 - m.t / 0.8})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(isoX(m.x, m.y), isoY(m.x, m.y), 6 + m.t * 14, 3 + m.t * 7, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Objekte sammeln
  const objs = [];
  const inView = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    for (const o of W.chunkObjs[cy * CN + cx]) {
      const ix = isoX(o.x, o.y);
      if (ix < isoL || ix > isoR) continue;
      objs.push({ d: o.x + o.y, f: (c) => drawTreeObj(c, o) });
    }
  }
  for (const part of staticParts) if (inView(part.x, part.y)) objs.push(part);
  for (const part of castleParts) if (inView(part.x, part.y)) objs.push(part);
  for (const u of G.units) {
    if (u.hidden || (u.dead && u.kind !== 'player') || !inView(u.x, u.y)) continue;
    objs.push({ d: u.x + u.y + 0.05, f: (c) => drawFigure(c, u, isoX(u.x, u.y), isoY(u.x, u.y)) });
  }
  for (const f of G.fx) if (f.kind === 'corpse' && inView(f.x, f.y)) objs.push({ d: f.x + f.y - 0.3, f: (c) => drawCorpse(c, f) });
  objs.sort((a, b) => a.d - b.d);
  for (const o of objs) o.f(ctx);

  for (const part of staticParts) if (part.b && part.b.smoke && inView(part.x, part.y)) smokeEmit(part.b.smoke[0], part.b.smoke[1], 0.04);
  drawSmoke(ctx, dt);

  // Geschosse
  for (const pr of G.projectiles) {
    const k = pr.t / pr.dur;
    const x = pr.x + (pr.tx - pr.x) * k, y = pr.y + (pr.ty - pr.y) * k;
    const d = Math.hypot(pr.tx - pr.x, pr.ty - pr.y);
    const zz = 14 + Math.sin(k * Math.PI) * d * (pr.bolt ? 1.5 : 4);
    const sx = isoX(x, y), sy = isoY(x, y) - zz;
    const dx = isoX(pr.tx, pr.ty) - isoX(pr.x, pr.y), dy = isoY(pr.tx, pr.ty) - isoY(pr.x, pr.y);
    const l = Math.hypot(dx, dy) || 1;
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(sx - (dx / l) * 7, sy - (dy / l) * 7 + (k - 0.5) * 4); ctx.lineTo(sx, sy); ctx.stroke();
  }

  // Schadenszahlen
  ctx.font = 'bold 12px "Alegreya Sans", sans-serif';
  ctx.textAlign = 'center';
  for (const f of G.fx) {
    if (f.kind !== 'text') continue;
    const x = isoX(f.x, f.y), y = isoY(f.x, f.y) - 34 - f.t * 26;
    ctx.globalAlpha = 1 - f.t / f.dur;
    ctx.strokeStyle = 'rgba(20,10,5,0.8)'; ctx.lineWidth = 3; ctx.strokeText(f.text, x, y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, x, y);
  }
  ctx.globalAlpha = 1;

  // Tag und Nacht
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const dark = darkness();
  const warm = warmth();
  if (warm > 0) { ctx.fillStyle = `rgba(255,140,60,${warm * 0.14})`; ctx.fillRect(0, 0, w, h); }
  if (dark > 0.01) {
    ctx.fillStyle = `rgba(14,20,52,${dark})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      const sx = (isoX(L.x, L.y) - cam.x) * z + w / 2, sy = (isoY(L.x, L.y) - L.z - cam.y) * z + h / 2;
      if (sx < -100 || sy < -100 || sx > w + 100 || sy > h + 100) continue;
      const r = L.r * z * (1 + Math.sin(G.time * 9 + L.x) * 0.04);
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2);
      g.addColorStop(0, `rgba(255,190,100,${0.55 * L.s * dark / 0.62})`);
      g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - r * 2, sy - r * 2, r * 4, r * 4);
    }
    // Fackel des Spielers
    const ps = worldToScreen(p.x, p.y, cam, w, h);
    const g = ctx.createRadialGradient(ps.x, ps.y - 10, 0, ps.x, ps.y - 10, 120 * z);
    g.addColorStop(0, `rgba(255,200,120,${0.35 * dark / 0.62})`);
    g.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = g; ctx.fillRect(ps.x - 130 * z, ps.y - 140 * z, 260 * z, 260 * z);
    ctx.globalCompositeOperation = 'source-over';
  }
  drawSnow(ctx, w, h, dt);

  // Ortsnamen
  ctx.textAlign = 'center';
  for (const s of W.sites) {
    if (!inView(s.x, s.y)) continue;
    const sp = worldToScreen(s.x, s.y, cam, w, h);
    const yy = sp.y - (s.type === 'spieler' || s.type === 'burg' ? 120 : 70) * z;
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
  // Name unter dem Mauszeiger
  if (G.hover && !G.hover.dead) {
    const u = G.hover;
    const sp = worldToScreen(u.x, u.y, cam, w, h);
    ctx.font = '600 12px "Alegreya Sans", sans-serif';
    const label = `${u.name}${u.kind !== 'peasant' ? ` · Stufe ${u.level}` : ''}`;
    const tw = ctx.measureText(label).width;
    const yy = sp.y - (u.mounted ? 52 : 42) * z;
    ctx.fillStyle = 'rgba(28,20,14,0.82)'; ctx.fillRect(sp.x - tw / 2 - 6, yy - 12, tw + 12, 17);
    ctx.fillStyle = u.group && (u.group.engaged || u.group.provoked) ? '#ff9a80' : '#f3ead2';
    ctx.fillText(label, sp.x, yy);
  }
}

// ---------------------------------------------------------------- Minikarte
const MINI_COL = [
  ['#3e7393', '#6f9b45', '#3f6a2c', '#8c9259', '#b39a6e', '#a8b85a', '#8a6a42', '#cdbd8c'],
  ['#3b7090', '#7d9d3f', '#3d6429', '#979159', '#b39a6e', '#d4b64f', '#8a6a42', '#d5c493'],
  ['#3a6683', '#8e9045', '#62582c', '#918259', '#a88d66', '#9e7c3d', '#8a6a42', '#c4b083'],
  ['#6d8ea2', '#dfe6e6', '#a9b8b5', '#c9cfcb', '#a49d90', '#d8dddc', '#8a6a42', '#dadcd6'],
];

function buildMinimap() {
  const W = G.world, N = W.N;
  const cv = makeCanvas(N * 2, N);
  const g = cv.getContext('2d');
  const img = g.createImageData(N * 2, N);
  const cols = MINI_COL[seasonIndex()].map((h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const t = W.tiles[j * N + i];
    const mx = i - j + N - 1, my = Math.floor((i + j) / 2);
    const col = cols[t];
    for (const ox of [0, 1]) {
      const o = (my * N * 2 + mx + ox) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  minimapBase = cv;
  minimapSeason = seasonIndex();
}

export function miniPos(x, y, scale) {
  const N = G.world.N;
  return { x: (x - y + N - 1) * scale, y: ((x + y) / 2) * scale };
}

export function miniToWorld(mx, my, scale) {
  const N = G.world.N;
  const a = mx / scale - (N - 1), b = (my / scale) * 2;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

export function drawMap(c, w, h, opts = {}) {
  if (!minimapBase || minimapSeason !== seasonIndex()) buildMinimap();
  const N = G.world.N;
  const scale = Math.min(w / (N * 2), h / N);
  c.clearRect(0, 0, w, h);
  c.imageSmoothingEnabled = false;
  c.drawImage(minimapBase, 0, 0, N * 2 * scale, N * scale);
  c.imageSmoothingEnabled = true;
  const p = G.s.player;
  // Gruppen in der Nähe
  for (const g of G.groups) {
    if (Math.hypot(g.x - p.x, g.y - p.y) > (opts.big ? 30 : 24)) continue;
    const q = miniPos(g.x, g.y, scale);
    c.fillStyle = g.engaged || (g.provoked) ? '#ff4a3a' : g.faction ? FACTIONS[g.faction].color : '#3a2a1a';
    c.beginPath(); c.arc(q.x, q.y, opts.big ? 3.5 : 2.2, 0, Math.PI * 2); c.fill();
  }
  // Auftragsziele
  for (const qq of G.s.quests) {
    const t = questTarget(qq);
    const q = miniPos(t.x, t.y, scale);
    c.strokeStyle = '#ffe066'; c.lineWidth = opts.big ? 2 : 1.4;
    c.beginPath(); c.arc(q.x, q.y, opts.big ? 8 : 5, 0, Math.PI * 2); c.stroke();
  }
  // Siedlungen
  c.textAlign = 'center';
  for (const s of G.world.sites) {
    const q = miniPos(s.x, s.y, scale);
    const col = s.faction ? FACTIONS[s.faction].color : '#ffd65a';
    const r = opts.big ? 5 : 3;
    c.fillStyle = '#1d140c'; c.fillRect(q.x - r - 1, q.y - r - 1, r * 2 + 2, r * 2 + 2);
    c.fillStyle = col; c.fillRect(q.x - r, q.y - r, r * 2, r * 2);
    if (opts.big) {
      c.font = '600 13px "Alegreya Sans", sans-serif';
      c.lineWidth = 3; c.strokeStyle = 'rgba(20,12,6,0.85)';
      c.strokeText(s.name, q.x, q.y - 9); c.fillStyle = '#f3ead2'; c.fillText(s.name, q.x, q.y - 9);
    }
  }
  if (opts.dest) {
    const q = miniPos(opts.dest.x, opts.dest.y, scale);
    c.strokeStyle = '#ffffff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(q.x - 5, q.y - 5); c.lineTo(q.x + 5, q.y + 5); c.moveTo(q.x + 5, q.y - 5); c.lineTo(q.x - 5, q.y + 5); c.stroke();
  }
  const q = miniPos(p.x, p.y, scale);
  c.fillStyle = '#ffffff'; c.strokeStyle = '#1d140c'; c.lineWidth = 2;
  c.beginPath(); c.arc(q.x, q.y, opts.big ? 5 : 3.2, 0, Math.PI * 2); c.stroke(); c.fill();
  // Sichtfenster
  if (!opts.big) {
    const { w: vw, h: vh } = G.view;
    const corners = [[0, 0], [vw, 0], [vw, vh], [0, vh]].map(([sx, sy]) => { const wp = screenToWorld(sx, sy, G.cam, vw, vh); return miniPos(wp.x, wp.y, scale); });
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1;
    c.beginPath(); corners.forEach((pt, k) => (k ? c.lineTo(pt.x, pt.y) : c.moveTo(pt.x, pt.y))); c.closePath(); c.stroke();
  }
  return scale;
}

// Treffer-Test für Klicks auf Einheiten (Bildschirmkoordinaten)
export function unitAtScreen(px, py) {
  const { w, h } = G.view;
  let best = null, bd = 18 * G.cam.zoom + 6;
  for (const u of G.units) {
    if (u.dead || u.hidden || u.kind === 'player') continue;
    const sp = worldToScreen(u.x, u.y, G.cam, w, h);
    const d = Math.hypot(sp.x - px, sp.y - (u.mounted ? 20 : 12) * G.cam.zoom - py);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
