// Karte der Grafschaften für die Mehrspieler-Lobby. Die Welt gibt es dann noch nicht (der Gastgeber erschafft sie erst
// beim Start), darum entsteht die Karte aus den Umrissen in geo.js: Meer, Land, Bergland, Flüsse und die Grafschaften,
// grob so geschnitten wie im Spiel (shires.js: Ausbreitung über Land vom Sitz aus, Schottland getrennt, begrenzte
// Reichweite). Vergebene Grafschaften tragen Farbe, Wappen und Namen ihres Spielers; ein Klick wählt eine freie.

import { COAST_GB, COAST_IRELAND, COAST_CONTINENT, ISLANDS, RIVERS, UPLANDS } from './geo.js';
import { MAP, GEO, GEO_SCALE, SETTLEMENTS, geoToTile } from './data.js';
import { SHIRES } from './shires.js';
import { drawArms } from './heraldry.js';

const LM_N = 192, LM_CELL = MAP / LM_N;                  // Raster: 8 Kacheln je Zelle
const LM_REACH = { en: 200, wa: 200, sc: 200, ir: 200, nd: 144, fr: 144, fl: 144 };   // Reichweite in Kacheln
const LM_REALMS = [['ENGLAND', -1.2, 52.55], ['WALES', -3.75, 52.25], ['SCHOTTLAND', -4.3, 57.15], ['IRLAND', -8.1, 53.25], ['NORMANDIE', -0.45, 48.95], ['FRANKREICH', 2.6, 48.45]];
const LM_CITIES = ['london', 'york', 'paris', 'dublin', 'edinburgh'];
let LM = null;

const lmTile = ([lon, lat]) => geoToTile(lon, lat);
const lmSite = (id) => SETTLEMENTS.find((s) => s.id === id);

// Land im Raster: 1 Großbritannien, 5 Schottland (nördlich von 55,74°), 2 Irland, 3 Festland, 6+ kleine Inseln
function lmLand() {
  const land = new Uint8Array(LM_N * LM_N);
  const polys = [[COAST_GB, 1], [COAST_IRELAND, 2], [COAST_CONTINENT, 3], ...ISLANDS.map((p, k) => [p, 6 + k])];
  const xs = [];
  for (const [poly, key] of polys) {
    const P = poly.map((q) => { const t = lmTile(q); return { x: t.x / LM_CELL, y: t.y / LM_CELL }; });
    for (let j = 0; j < LM_N; j++) {
      const yc = j + 0.5;
      xs.length = 0;
      for (let k = 0; k < P.length; k++) { const p = P[k], q = P[(k + 1) % P.length]; if ((p.y <= yc) !== (q.y <= yc)) xs.push(p.x + ((yc - p.y) / (q.y - p.y)) * (q.x - p.x)); }
      xs.sort((u, v) => u - v);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, Math.ceil(xs[k] - 0.5)), x1 = Math.min(LM_N - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = x0; x <= x1; x++) land[j * LM_N + x] = key === 1 && GEO.latN - yc * LM_CELL * GEO.dLat > 55.74 ? 5 : key;
      }
    }
  }
  return land;
}

// Grafschaften: von allen Sitzen zugleich über Land fluten (gerade 10, schräg 14, mit Gewicht), bis zur Reichweite
function lmBuild() {
  const land = lmLand(), N = LM_N;
  const ids = Object.keys(SHIRES), own = new Uint8Array(N * N), cost = new Float64Array(N * N).fill(Infinity), orig = new Uint8Array(N * N);
  const seats = ids.map((id) => {
    const s = lmSite(id), t = lmTile([s.lon, s.lat]);
    const i = Math.min(N - 1, Math.floor(t.x / LM_CELL)), j = Math.min(N - 1, Math.floor(t.y / LM_CELL));
    const home = s.realm === 'sc' ? 5 : land[j * N + i] || (s.realm === 'ir' ? 2 : s.realm === 'nd' || s.realm === 'fr' || s.realm === 'fl' ? 3 : 1);
    return { id, x: t.x, y: t.y, i, j, home, w: SHIRES[id].weight || 1, reach: (LM_REACH[s.realm] || 160) / LM_CELL };
  });
  const heap = [];
  const push = (c, v, k, o) => { heap.push([c, v, k, o]); let n = heap.length - 1; while (n > 0) { const p = (n - 1) >> 1; if (heap[p][0] <= heap[n][0]) break; [heap[p], heap[n]] = [heap[n], heap[p]]; n = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let n = 0; for (;;) { const l = 2 * n + 1, r = l + 1; let m = n; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === n) break; [heap[m], heap[n]] = [heap[n], heap[m]]; n = m; } } return top; };
  seats.forEach((s, n) => {
    const from = [[s.i, s.j, 0], ...(SHIRES[s.id].also || []).map((id) => { const o = lmSite(id), t = lmTile([o.lon, o.lat]); return [Math.floor(t.x / LM_CELL), Math.floor(t.y / LM_CELL), 1]; })];
    for (const [i, j, o] of from) { const v = j * N + i; cost[v] = 0; own[v] = n + 1; orig[v] = o; push(0, v, n + 1, o); }
  });
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];
  while (heap.length) {
    const [c, v, k, o] = pop();
    if (c !== cost[v] || own[v] !== k) continue;
    const s = seats[k - 1], i = v % N, j = (v - i) / N;
    for (const [di, dj, d] of nb) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const u = nj * N + ni, nc = c + d * s.w;
      // Die Reichweite bleibt dieselbe Strecke, auch wenn das Gewicht die Schritte verbilligt; York nimmt nur sein Umland
      if (nc / s.w > s.reach || (o && nc / s.w > 4.5) || land[u] !== s.home || nc >= cost[u]) continue;
      cost[u] = nc; own[u] = k; orig[u] = o; push(nc, u, k, o);
    }
  }
  // Mitte jeder Grafschaft für Beschriftung und Hervorhebung
  const sum = seats.map(() => ({ x: 0, y: 0, n: 0 }));
  for (let v = 0; v < own.length; v++) if (own[v]) { const a = sum[own[v] - 1], i = v % N; a.x += i + 0.5; a.y += (v - i) / N + 0.5; a.n++; }
  seats.forEach((s, n) => { const a = sum[n]; s.mx = a.n ? (a.x / a.n) * LM_CELL : s.x; s.my = a.n ? (a.y / a.n) * LM_CELL : s.y; s.cells = a.n; });
  // Ausschnitt: alles Land der Inseln und alle Sitze, mit Rand
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of [...COAST_GB, ...COAST_IRELAND]) { const t = lmTile(q); x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x); y1 = Math.max(y1, t.y); }
  for (const s of seats) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
  const m = 36;
  const view = { x0: Math.max(0, x0 - m), y0: Math.max(0, y0 - m), x1: Math.min(MAP, x1 + m), y1: Math.min(MAP, y1 + m) };
  return { land, own, seats, ids, view };
}

export function lobbyMapAspect() { if (!LM) LM = lmBuild(); const v = LM.view; return (v.y1 - v.y0) / (v.x1 - v.x0); }

function lmHex(h) { const n = parseInt(String(h || '#888888').slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lmMix(a, b, t) { return [0, 1, 2].map((c) => Math.round(a[c] + (b[c] - a[c]) * t)); }

// Zeichnen. st: { seats: [{ id, by, color, arms }], mine, hover }
export function drawLobbyMap(cv, st) {
  if (!LM) LM = lmBuild();
  const { land, own, seats, view } = LM, N = LM_N;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = cv.clientWidth || 400, H = Math.round(W * lobbyMapAspect());
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  cv.style.height = `${H}px`;
  const c = cv.getContext('2d');
  const k = W / (view.x1 - view.x0), X = (x) => (x - view.x0) * k, Y = (y) => (y - view.y0) * k;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Meer
  const sea = c.createLinearGradient(0, 0, 0, H); sea.addColorStop(0, '#9fb6b6'); sea.addColorStop(1, '#b4c5bd');
  c.fillStyle = sea; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(70,100,110,0.16)'; c.lineWidth = 1;
  for (let y = 10; y < H; y += 14) { c.beginPath(); for (let x = 0; x <= W; x += 8) c.lineTo(x, y + Math.sin(x * 0.09 + y) * 1.4); c.stroke(); }
  // Flächen der Grafschaften im Raster, weich vergrößert, an der Küste scharf beschnitten
  const by = new Map((st.seats || []).filter((s) => s.by || s.id === st.mine).map((s) => [s.id, s]));
  const base = lmHex('#e8d8b0'), none = lmHex('#ddd3bb');
  const tones = [lmHex('#e6d3a4'), lmHex('#ecdcb4'), lmHex('#e1cd9a')];
  const img = new ImageData(N, N);
  for (let v = 0; v < N * N; v++) {
    if (!land[v]) continue;
    let col = none;
    const k2 = own[v];
    if (k2) {
      const s = seats[k2 - 1], p = by.get(s.id);
      col = p ? lmMix(base, lmHex(p.color), s.id === st.mine ? 0.62 : 0.45) : tones[k2 % 3];
      if (s.id === st.hover && !p) col = lmMix(col, [255, 248, 225], 0.55);
      if (s.id === st.hover && p) col = lmMix(col, [255, 255, 255], 0.2);
    }
    img.data.set([col[0], col[1], col[2], 255], v * 4);
  }
  if (!LM.off) { LM.off = document.createElement('canvas'); LM.off.width = N; LM.off.height = N; }
  LM.off.getContext('2d').putImageData(img, 0, 0);
  const coast = new Path2D();
  for (const poly of [COAST_GB, COAST_IRELAND, COAST_CONTINENT, ...ISLANDS]) {
    poly.forEach((q, n) => { const t = lmTile(q); if (n) coast.lineTo(X(t.x), Y(t.y)); else coast.moveTo(X(t.x), Y(t.y)); });
    coast.closePath();
  }
  c.save(); c.clip(coast);
  c.imageSmoothingEnabled = true;
  c.drawImage(LM.off, X(0), Y(0), MAP * k, MAP * k);
  // Bergland als weicher Schatten, Flüsse
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const u of UPLANDS) {
    c.strokeStyle = `rgba(110,84,50,${Math.min(0.2, u.a * 0.4)})`; c.lineWidth = Math.max(3, u.r * GEO_SCALE * k * 1.4);
    c.beginPath(); u.pts.forEach((q, n) => { const t = lmTile(q); if (n) c.lineTo(X(t.x), Y(t.y)); else c.moveTo(X(t.x), Y(t.y)); });
    if (u.pts.length === 1) { const t = lmTile(u.pts[0]); c.lineTo(X(t.x) + 0.1, Y(t.y)); }
    c.stroke();
  }
  c.strokeStyle = 'rgba(70,110,140,0.75)'; c.lineWidth = 1;
  for (const r of RIVERS) { c.beginPath(); r.pts.forEach((q, n) => { const t = lmTile(q); if (n) c.lineTo(X(t.x), Y(t.y)); else c.moveTo(X(t.x), Y(t.y)); }); c.stroke(); }
  // Grenzen zwischen Grafschaften
  c.strokeStyle = 'rgba(92,62,30,0.55)'; c.lineWidth = 0.8; c.setLineDash([2.5, 2]);
  c.beginPath();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = own[j * N + i];
    if (i + 1 < N) { const b = own[j * N + i + 1]; if (a && b && a !== b) { c.moveTo(X((i + 1) * LM_CELL), Y(j * LM_CELL)); c.lineTo(X((i + 1) * LM_CELL), Y((j + 1) * LM_CELL)); } }
    if (j + 1 < N) { const b = own[(j + 1) * N + i]; if (a && b && a !== b) { c.moveTo(X(i * LM_CELL), Y((j + 1) * LM_CELL)); c.lineTo(X((i + 1) * LM_CELL), Y((j + 1) * LM_CELL)); } }
  }
  c.stroke(); c.setLineDash([]);
  c.restore();
  // Küste
  c.strokeStyle = '#4a3420'; c.lineWidth = 1.2; c.stroke(coast);
  // Reiche, groß und blass
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `600 ${Math.max(10, Math.round(W / 34))}px "IM Fell English SC", Georgia, serif`;
  c.fillStyle = 'rgba(74,52,32,0.32)';
  for (const [name, lon, lat] of LM_REALMS) { const t = lmTile([lon, lat]); if (t.x > view.x0 && t.x < view.x1 && t.y > view.y0 && t.y < view.y1) c.fillText(name.split('').join(' '), X(t.x), Y(t.y)); }
  // Große Städte zur Orientierung
  c.font = `italic 400 ${Math.max(10, Math.round(W / 46))}px "Alegreya", Georgia, serif`;
  for (const id of LM_CITIES) {
    const s = lmSite(id);
    if (!s) continue;
    const t = lmTile([s.lon, s.lat]), x = X(t.x), y = Y(t.y);
    c.fillStyle = '#3a2614'; c.beginPath(); c.arc(x, y, 1.8, 0, Math.PI * 2); c.fill();
    lmLabel(c, s.name, x + 4, y - 1, 'left', '#3a2614', 'rgba(240,228,200,0.85)');
  }
  // Sitze: frei ein Turm, vergeben das Wappen des Spielers mit Namen; deine Wahl golden umrandet
  const fs = Math.max(10, Math.round(W / 42));
  for (const s of seats) {
    const p = by.get(s.id), x = X(s.x), y = Y(s.y), mine = s.id === st.mine, hov = s.id === st.hover;
    if (p && p.arms) {
      const w = mine ? 20 : 16;
      if (mine) { c.fillStyle = 'rgba(255,214,120,0.9)'; c.beginPath(); c.arc(x, y + w * 0.5, w * 0.82, 0, Math.PI * 2); c.fill(); }
      drawArms(c, p.arms, x, y - w * 0.08, w);
    } else {
      c.fillStyle = hov ? '#7a1a10' : '#4a3420';
      c.beginPath(); c.moveTo(x - 4, y + 4); c.lineTo(x - 4, y - 2); c.lineTo(x - 2.6, y - 2); c.lineTo(x - 2.6, y - 4); c.lineTo(x - 1, y - 4); c.lineTo(x - 1, y - 2); c.lineTo(x + 1, y - 2); c.lineTo(x + 1, y - 4); c.lineTo(x + 2.6, y - 4); c.lineTo(x + 2.6, y - 2); c.lineTo(x + 4, y - 2); c.lineTo(x + 4, y + 4); c.closePath(); c.fill();
    }
  }
  // Namen: deine Grafschaft, die angezeigte und die der anderen (mit Spielername)
  c.font = `600 ${fs}px "Alegreya", Georgia, serif`;
  for (const s of seats) {
    const p = by.get(s.id), mine = s.id === st.mine, hov = s.id === st.hover;
    if (!mine && !hov && !p) continue;
    const x = X(s.x), y = Y(s.y) + (p ? (mine ? 26 : 22) : 13);
    const txt = p && p.by ? `${SHIRES[s.id].name} · ${p.by}` : SHIRES[s.id].name;
    lmLabel(c, txt, x, y, 'center', mine ? '#5a1a08' : '#2a1a0c', 'rgba(250,240,214,0.92)');
  }
}

function lmLabel(c, text, x, y, align, ink, halo) {
  c.textAlign = align; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineWidth = 3.2; c.strokeStyle = halo; c.strokeText(text, x, y);
  c.fillStyle = ink; c.fillText(text, x, y);
}

// Welche Grafschaft liegt unter dem Zeiger (Fläche, sonst der nächste Sitz in 18 Pixeln)?
export function lobbyMapPick(cv, px, py) {
  if (!LM) LM = lmBuild();
  const { own, seats, view } = LM, W = cv.clientWidth || 400, k = W / (view.x1 - view.x0);
  const tx = view.x0 + px / k, ty = view.y0 + py / k;
  let best = null, bd = 18 / k;
  for (const s of seats) { const d = Math.hypot(s.x - tx, s.y - ty); if (d < bd) { bd = d; best = s.id; } }
  if (best) return best;
  const i = Math.floor(tx / LM_CELL), j = Math.floor(ty / LM_CELL);
  if (i < 0 || j < 0 || i >= LM_N || j >= LM_N) return null;
  const n = own[j * LM_N + i];
  return n ? seats[n - 1].id : null;
}

// Für Tests: wo ein Sitz auf der gezeichneten Karte liegt (Pixel im Element)
export function lobbyMapSeatPos(cv, id) {
  if (!LM) LM = lmBuild();
  const s = LM.seats.find((x) => x.id === id), v = LM.view, k = (cv.clientWidth || 400) / (v.x1 - v.x0);
  return s ? { x: (s.x - v.x0) * k, y: (s.y - v.y0) * k } : null;
}
