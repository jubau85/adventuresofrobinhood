// Bauplätze der eigenen Burg. Der Bergfried bleibt der Kern, ringsum liegen Plätze, die man frei mit Gebäuden
// belegt, manche auch mehrfach (nur Holzfäller ist erlaubt). Die Burgart legt Mauerring und Plätze fest:
// Eine Turmburg hat einen engen Ring mit 4 Plätzen innen und 16 davor, eine Ringburg 8 und 10, eine Festung
// 12 innen und nur noch 4 davor. Innen ist ein Platz 2 × 2 Felder groß, davor 3 × 3. Innen ist alles geschützt;
// davor ruht bei einer Belagerung die Arbeit, und die Belagerer brennen einiges nieder (castle.js).

import { G } from './state.js';
import { T, BUILDINGS } from './data.js';
import { tileAt } from './world.js';

export const CASTLE_TYPES = {
  turm: { name: 'Turmburg', R: 4, inner: 4, outer: 16, def: 0, desc: 'Ein enger Mauerring um den Bergfried: wenig Platz im Hof, viel Land davor.' },
  ring: { name: 'Ringburg', R: 5, inner: 8, outer: 10, def: 15, desc: 'Ein weiter Mauerring mit Platz für Werkstätten und Unterkünfte im Hof.' },
  festung: { name: 'Festung', R: 6, inner: 12, outer: 4, def: 35, desc: 'Ein mächtiger Mauerring, fast alles liegt geschützt im Hof, davor bleibt wenig Land.' },
};
export const TYPE_IDS = Object.keys(CASTLE_TYPES);
// Äcker, Weiden, Holzfäller und Steinbruch brauchen Land vor der Mauer
export const OUTER_ONLY = { felder: 1, schafzucht: 1, holzfaeller: 1, steinbruch: 1 };
// Mehrfach baubar (die Erträge addieren sich); alles andere gibt es nur einmal
export const STACKABLE = { felder: 1, schafzucht: 1, holzfaeller: 1, steinbruch: 1, wehr: 1 };
export const PLOT_BUILDINGS = Object.keys(BUILDINGS).filter((id) => id !== 'burg');

export function castleType() { const t = G.s && G.s.castle && G.s.castle.type; return CASTLE_TYPES[t] ? t : 'turm'; }
export function ringR(type = castleType()) { return CASTLE_TYPES[type].R; }

// Lage der Plätze, je Burgart einmal berechnet. Kachelversatz zur Burgmitte: Die Mauer liegt auf ±R, innen bleiben
// der Bergfried (−3 … 0 in beiden Richtungen) und der Weg vom Tor (x −1 … 0) frei. Davor bleibt ein Feld Abstand zur
// Mauer, zwischen den Plätzen ein Weg, und die Straße zum Tor bleibt offen. Wasser, Straßen und Wald sind tabu.
export function plotLayout(s, type = castleType()) {
  const key = `plots_${type}`;
  if (s[key]) return s[key];
  const def = CASTLE_TYPES[type], R = def.R, W = G.world;
  const used = new Set(), K = (x, y) => `${x},${y}`;
  const out = [];
  const take = (x0, y0, n, inner) => {
    for (let y = y0; y < y0 + n; y++) for (let x = x0; x < x0 + n; x++) used.add(K(x, y));
    const c = (n - 1) / 2;
    out.push({ i: out.length, dx: x0 + c, dy: y0 + c, x: s.x + x0 + c, y: s.y + y0 + c, size: n, inner, x0, y0 });
  };
  // Innen: alle 2 × 2-Lagen, nach Abstand zur Mitte des Hofs; wer zuerst passt, bekommt den Platz
  const freeIn = (x, y) => !(x >= -3 && x <= 0 && y >= -3 && y <= 0) && !((x === -1 || x === 0) && y >= 0) && Math.max(Math.abs(x), Math.abs(y)) <= R - 1;
  const candIn = [];
  for (let y = -(R - 1); y <= R - 2; y++) for (let x = -(R - 1); x <= R - 2; x++) candIn.push([x, y]);
  candIn.sort((a, b) => Math.hypot(a[0] + 0.5 - 1, a[1] + 0.5) - Math.hypot(b[0] + 0.5 - 1, b[1] + 0.5) || a[1] - b[1] || a[0] - b[0]);
  for (const [x, y] of candIn) {
    if (out.length >= def.inner) break;
    let ok = true;
    for (let j = 0; j < 2 && ok; j++) for (let i = 0; i < 2; i++) if (!freeIn(x + i, y + j) || used.has(K(x + i, y + j))) { ok = false; break; }
    if (ok) take(x, y, 2, true);
  }
  // Davor: 3 × 3-Lagen mit einem Feld Abstand zueinander, nah an der Mauer zuerst
  const tileOk = (x, y) => {
    const t = tileAt(W, s.x + x, s.y + y);
    if (t === T.WATER || t === T.ROAD || t === T.BRIDGE || t === T.FOREST) return false;
    if (W.blockStatic && W.blockStatic[(s.ty + y) * W.N + s.tx + x]) return false;
    return true;
  };
  const freeOut = (x, y) => Math.max(Math.abs(x), Math.abs(y)) >= R + 2 && !(y > R && x >= -2 && x <= 1);
  const candOut = [];
  const M = R + 15;
  for (let y = -M; y <= M - 2; y++) for (let x = -M; x <= M - 2; x++) candOut.push([x, y]);
  candOut.sort((a, b) => Math.hypot(a[0] + 1, a[1] + 1) - Math.hypot(b[0] + 1, b[1] + 1) || a[1] - b[1] || a[0] - b[0]);
  const nIn = out.length;
  for (const [x, y] of candOut) {
    if (out.length - nIn >= def.outer) break;
    let ok = true;
    for (let j = -1; j < 4 && ok; j++) for (let i = -1; i < 4; i++) {
      const inside = i >= 0 && i < 3 && j >= 0 && j < 3;
      if (used.has(K(x + i, y + j))) { ok = false; break; }
      if (inside && (!freeOut(x + i, y + j) || !tileOk(x + i, y + j))) { ok = false; break; }
    }
    if (ok) take(x, y, 3, false);
  }
  s[key] = out;
  return out;
}

// Ein Rechteck eines Platzes in Weltkoordinaten (für Kollision und Klick)
export function plotRect(p) { return { x: p.x, y: p.y, wx: p.size, wy: p.size }; }
