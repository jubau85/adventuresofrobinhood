// Wappen: Schild in der Wappenfarbe, darauf ein Tier oder Zeichen in Gold oder Silber, schwarz umrandet.
// Die Bilder sind SVG-Pfade in einem Feld von 100 × 100; dieselben Pfade dienen dem Startmenü (SVG) und dem Spiel
// (Canvas, Path2D) für Banner und Fahnen.

export const METALS = { gold: { name: 'Gold', color: '#e3b843' }, silber: { name: 'Silber', color: '#ecebe4' } };
const INK = '#20160e';

// Hilfen für erzeugte Formen
const pt = (x, y) => `${x.toFixed(1)} ${y.toFixed(1)}`;
function starPath(cx, cy, r1, r2, n, rot = -Math.PI / 2) {
  let d = '';
  for (let k = 0; k < n * 2; k++) { const r = k % 2 ? r2 : r1, a = rot + (k * Math.PI) / n; d += `${k ? 'L' : 'M'}${pt(cx + Math.cos(a) * r, cy + Math.sin(a) * r)} `; }
  return d + 'Z';
}
function circle(cx, cy, r) { return `M${pt(cx - r, cy)} A${r} ${r} 0 1 0 ${pt(cx + r, cy)} A${r} ${r} 0 1 0 ${pt(cx - r, cy)} Z`; }
// Schwert längs der Achse (Spitze oben), gedreht um ang um (cx, cy)
function swordPath(cx, cy, ang) {
  const P = [[0, -44], [4, -36], [4, 14], [14, 14], [14, 20], [4, 20], [4, 32], [7, 36], [0, 42], [-7, 36], [-4, 32], [-4, 20], [-14, 20], [-14, 14], [-4, 14], [-4, -36]];
  const c = Math.cos(ang), s = Math.sin(ang);
  return P.map(([x, y], i) => `${i ? 'L' : 'M'}${pt(cx + x * c - y * s, cy + x * s + y * c)}`).join(' ') + ' Z';
}
function mirror(d) { return d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, x, y) => `${(100 - +x).toFixed(1)} ${y}`).replace(/A(\d+) (\d+) 0 (\d) (\d)/g, (m, a, b, l, sw) => `A${a} ${b} 0 ${l} ${1 - +sw}`); }

// Teile: d = Pfad, f = Füllung ('m' Metall, 'f' Feld, 'd' Tinte)
const EAGLE_WING = 'M44 38 C34 30 22 20 8 14 C12 20 9 22 6 26 C11 28 10 31 6 35 C12 36 11 40 8 44 C14 44 14 48 12 52 C20 50 22 54 22 58 C30 54 38 54 44 56 Z';
export const CHARGES = {
  loewe: { name: 'Löwe', kind: 'tier', parts: [
    // Schwanz mit Quaste
    { d: 'M64 66 C78 62 80 50 76 40 C74 34 78 26 84 24 C82 30 88 30 90 26 C90 34 84 36 82 40 C86 50 82 66 66 72 Z', f: 'm' },
    // Hinterbeine
    { d: 'M48 62 L42 78 L34 84 L28 93 L37 91 L42 94 L47 87 L56 80 L60 68 Z', f: 'm' },
    { d: 'M58 62 L65 78 L63 88 L70 93 L74 89 L81 93 L77 84 L74 76 L70 58 Z', f: 'm' },
    // Leib
    { d: 'M30 28 C42 22 54 28 60 40 C66 52 74 62 68 72 C62 80 50 78 46 68 C42 58 36 48 30 42 Z', f: 'm' },
    // Vorderbeine mit Pranken
    { d: 'M42 36 L28 38 L20 33 L13 36 L18 40 L12 43 L19 45 L25 44 L30 47 L45 47 Z', f: 'm' },
    { d: 'M46 48 L34 55 L26 55 L21 60 L27 61 L24 66 L31 63 L37 63 L52 57 Z', f: 'm' },
    // Kopf mit Mähne, Zunge
    { d: 'M24 14 L28 8 L32 13 L36 7 L39 13 L44 10 L44 17 L49 18 L45 23 L48 28 L42 29 L41 34 L36 31 L31 34 L30 28 L24 30 L22 24 L16 24 L14 19 L20 17 Z', f: 'm' },
    { d: 'M16 22 L10 24 L14 26 Z', f: 'd' },
    { d: circle(25, 17, 1.6), f: 'd' },
  ] },
  adler: { name: 'Adler', kind: 'tier', parts: [
    { d: EAGLE_WING, f: 'm' },
    { d: mirror(EAGLE_WING), f: 'm' },
    // Schwanz
    { d: 'M44 64 L36 84 L44 80 L50 90 L56 80 L64 84 L56 64 Z', f: 'm' },
    // Fänge
    { d: 'M44 66 L36 72 L32 70 L34 75 L40 74 L46 70 Z', f: 'm' },
    { d: 'M56 66 L64 72 L68 70 L66 75 L60 74 L54 70 Z', f: 'm' },
    // Leib und Kopf mit Schnabel nach links
    { d: 'M50 30 C58 32 60 44 58 56 C57 64 54 70 50 72 C46 70 43 64 42 56 C40 44 42 32 50 30 Z', f: 'm' },
    { d: 'M46 16 C52 14 56 18 56 24 C56 30 52 32 48 32 C44 31 42 28 41 26 L34 26 L38 22 L40 18 Z', f: 'm' },
    { d: circle(47, 21, 1.5), f: 'd' },
  ] },
  hirsch: { name: 'Hirsch', kind: 'tier', parts: [
    // Geweih
    { d: 'M44 36 C38 28 34 20 34 8 L37 9 C38 16 40 22 43 27 L40 14 L43 14 L45 26 C46 22 48 20 50 22 L46 36 Z', f: 'm' },
    { d: 'M44 34 C34 30 26 24 22 12 L25 11 C28 18 32 22 37 26 L28 20 L29 17 L39 25 Z', f: 'm' },
    { d: mirror('M44 36 C38 28 34 20 34 8 L37 9 C38 16 40 22 43 27 L40 14 L43 14 L45 26 C46 22 48 20 50 22 L46 36 Z'), f: 'm' },
    { d: mirror('M44 34 C34 30 26 24 22 12 L25 11 C28 18 32 22 37 26 L28 20 L29 17 L39 25 Z'), f: 'm' },
    // Ohren
    { d: 'M40 42 L24 38 L30 46 L40 48 Z', f: 'm' },
    { d: mirror('M40 42 L24 38 L30 46 L40 48 Z'), f: 'm' },
    // Kopf von vorn
    { d: 'M38 36 C44 33 56 33 62 36 C64 46 60 58 56 70 C54 78 52 84 50 86 C48 84 46 78 44 70 C40 58 36 46 38 36 Z', f: 'm' },
    { d: circle(44, 50, 2), f: 'd' },
    { d: circle(56, 50, 2), f: 'd' },
    { d: 'M47 82 Q50 86 53 82 Q50 80 47 82 Z', f: 'd' },
  ] },
  eber: { name: 'Eber', kind: 'tier', parts: [
    // Beine
    { d: 'M30 62 L28 80 L34 80 L36 64 Z M42 64 L42 82 L48 82 L48 64 Z M64 62 L66 80 L72 80 L70 62 Z M74 60 L78 76 L84 76 L80 58 Z', f: 'm' },
    // Leib mit Borstenkamm, Rüssel nach links
    { d: 'M12 46 L16 40 L24 38 L30 30 L34 34 L38 26 L42 32 L46 24 L50 31 L55 24 L58 31 L63 26 L66 33 L72 30 L74 37 L82 38 C90 44 90 56 84 62 C76 68 54 68 40 66 C30 66 22 62 18 56 L12 56 L8 52 Z', f: 'm' },
    // Schwanz, Hauer, Auge, Ohr
    { d: 'M86 46 C92 42 94 36 92 32 C96 36 96 44 88 50 Z', f: 'm' },
    { d: 'M16 50 C14 46 16 42 20 42 C18 45 18 47 20 50 Z', f: 'f' },
    { d: circle(25, 44, 1.8), f: 'd' },
    { d: 'M30 38 L36 32 L37 42 Z', f: 'd' },
  ] },
  rabe: { name: 'Rabe', kind: 'tier', parts: [
    // Beine
    { d: 'M44 72 L40 86 L34 88 L42 89 L48 86 L48 72 Z M54 72 L56 86 L52 89 L60 89 L62 86 L58 72 Z', f: 'm' },
    // Leib, Flügel, Schwanz; Kopf mit Schnabel nach links
    { d: 'M28 30 C34 24 42 24 46 30 C56 32 66 42 74 54 L90 66 L80 68 L86 74 L72 70 C66 74 56 76 46 72 C38 68 34 56 36 44 C34 40 30 38 22 40 L14 40 L22 34 Z', f: 'm' },
    { d: 'M44 44 C52 46 62 54 70 64 C60 62 50 58 44 52 Z', f: 'f' },
    { d: circle(34, 32, 1.8), f: 'd' },
  ] },
  kreuz: { name: 'Kreuz', kind: 'zeichen', parts: [
    { d: 'M38 8 H62 L55 45 L92 38 V62 L55 55 L62 92 H38 L45 55 L8 62 V38 L45 45 Z', f: 'm' },
  ] },
  lilie: { name: 'Lilie', kind: 'zeichen', parts: [
    { d: 'M44 58 C30 60 16 52 14 40 C12 30 20 23 28 27 C22 31 22 40 30 44 C36 47 42 50 44 52 Z', f: 'm' },
    { d: mirror('M44 58 C30 60 16 52 14 40 C12 30 20 23 28 27 C22 31 22 40 30 44 C36 47 42 50 44 52 Z'), f: 'm' },
    { d: 'M46 64 L40 84 C44 82 47 85 50 92 C53 85 56 82 60 84 L54 64 Z', f: 'm' },
    { d: 'M50 6 C59 18 63 32 56 46 L54 60 H46 L44 46 C37 32 41 18 50 6 Z', f: 'm' },
    { d: 'M32 56 H68 V66 H32 Z', f: 'm' },
  ] },
  stern: { name: 'Stern', kind: 'zeichen', parts: [{ d: starPath(50, 50, 44, 18, 6), f: 'm' }] },
  turm: { name: 'Turm', kind: 'zeichen', parts: [
    { d: 'M26 92 V40 H22 V16 H32 V24 H42 V16 H58 V24 H68 V16 H78 V40 H74 V92 Z', f: 'm' },
    { d: 'M43 92 V74 Q50 64 57 74 V92 Z', f: 'd' },
    { d: 'M46 44 H54 V58 H46 Z', f: 'd' },
  ] },
  mond: { name: 'Mond', kind: 'zeichen', parts: [{ d: 'M8 30 A42 42 0 0 0 92 30 A58 58 0 0 1 8 30 Z', f: 'm' }] },
  schwerter: { name: 'Schwerter', kind: 'zeichen', parts: [{ d: swordPath(50, 50, Math.PI / 4), f: 'm' }, { d: swordPath(50, 50, -Math.PI / 4), f: 'm' }] },
  rose: { name: 'Rose', kind: 'zeichen', parts: [
    ...[0, 1, 2, 3, 4].map((k) => { const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5; return { d: circle(50 + Math.cos(a) * 22, 50 + Math.sin(a) * 22, 19), f: 'm' }; }),
    ...[0, 1, 2, 3, 4].map((k) => { const a = -Math.PI / 2 + Math.PI / 5 + (k * 2 * Math.PI) / 5; return { d: `M${pt(50 + Math.cos(a) * 30, 50 + Math.sin(a) * 30)} L${pt(50 + Math.cos(a) * 44, 50 + Math.sin(a) * 44)} L${pt(50 + Math.cos(a + 0.16) * 33, 50 + Math.sin(a + 0.16) * 33)} Z`, f: 'd' }; }),
    { d: circle(50, 50, 13), f: 'f' },
    { d: circle(50, 50, 7), f: 'm' },
  ] },
};
export const CHARGE_IDS = Object.keys(CHARGES);

// Schild (Dreieckschild) in einem Feld von 100 × 116
export const SHIELD_PATH = 'M6 6 H94 V48 C94 82 74 102 50 112 C26 102 6 82 6 48 Z';

const fillOf = (f, arms) => (f === 'm' ? (METALS[arms.metal] || METALS.gold).color : f === 'f' ? arms.field : INK);

// Wappen als SVG (Startmenü, Panels). size: Breite in Pixeln
export function armsSVG(arms, size = 64, title = '') {
  const ch = CHARGES[arms.charge];
  const parts = ch ? ch.parts.map((p) => `<path d="${p.d}" fill="${fillOf(p.f, arms)}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`).join('') : '';
  return `<svg viewBox="0 0 100 116" width="${size}" height="${Math.round(size * 1.16)}" role="img" aria-label="${title || 'Wappen'}">
    <defs><linearGradient id="wg${size}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.22"/></linearGradient></defs>
    <path d="${SHIELD_PATH}" fill="${arms.field}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <g transform="translate(14 12) scale(0.72)">${parts}</g>
    <path d="${SHIELD_PATH}" fill="url(#wg${size})"/>
  </svg>`;
}
// Nur das Bild ohne Schild (Auswahlknöpfe)
export function chargeSVG(id, arms, size = 34) {
  const ch = CHARGES[id];
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">${ch.parts.map((p) => `<path d="${p.d}" fill="${fillOf(p.f, arms)}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`).join('')}</svg>`;
}

// Auf der Zeichenfläche: Bild mit Mitte (cx, cy) und Größe s (Weltpixel), z. B. auf einem Banner
const pathCache = new Map();
function path2d(d) { let p = pathCache.get(d); if (!p) { p = new Path2D(d); pathCache.set(d, p); } return p; }
export function drawCharge(c, arms, cx, cy, s) {
  const ch = arms && CHARGES[arms.charge];
  if (!ch || typeof Path2D === 'undefined') return;
  c.save();
  c.translate(cx - s / 2, cy - s / 2); c.scale(s / 100, s / 100);
  c.lineJoin = 'round'; c.lineWidth = Math.max(2.5, 100 / s * 0.6); c.strokeStyle = INK;
  for (const p of ch.parts) { const q = path2d(p.d); c.fillStyle = fillOf(p.f, arms); c.fill(q); c.stroke(q); }
  c.restore();
}
// Ganzer Schild auf der Zeichenfläche: obere Mitte (x, y), Breite w
export function drawArms(c, arms, x, y, w) {
  if (typeof Path2D === 'undefined') return;
  const k = w / 100;
  c.save(); c.translate(x - w / 2, y); c.scale(k, k);
  const sh = path2d(SHIELD_PATH);
  c.fillStyle = arms.field; c.fill(sh);
  c.restore();
  drawCharge(c, arms, x, y + 0.48 * w, w * 0.72);
  c.save(); c.translate(x - w / 2, y); c.scale(k, k);
  c.lineWidth = 4; c.strokeStyle = INK; c.stroke(sh);
  c.restore();
}


// ---------------------------------------------------------------- Ritter als Buchmalerei (Startmenü)
// Gemalt wie eine Miniatur in einer Liederhandschrift um 1300: Rahmen in Blau, Gold und Rot, darüber der Name in
// roter Tinte. Der Ritter galoppiert nach links, Pferdedecke und Banner sind mit dem Wappenbild bestreut, das
// Wappenbild steht als Helmzier auf dem Topfhelm, im Grund rankt eine Rose. Flache Farben mit Tintenrand.
// Gezeichnet in einem Feld von 300 × 212, eingepasst in w × h.
export const PLATE_W = 300, PLATE_H = 212;
const MS = { blau: '#2c5d9c', gold: '#d8a83a', rot: '#b8321f', ranke: '#3f7d37', blatt: '#2c6630', rose: '#c8402a', kette: '#a3a9ae', helm: '#b9bec2' };
function msShade(hex, f) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (v) => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
function msReddish(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r > g * 1.45 && r > b * 1.3;
}
// Geschlossener Linienzug mit gerundeten Ecken (Mittelpunkte als Stützen)
function msLoop(c, P) {
  const n = P.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const s = mid(P[n - 1], P[0]);
  c.moveTo(s[0], s[1]);
  for (let i = 0; i < n; i++) { const m = mid(P[i], P[(i + 1) % n]); c.quadraticCurveTo(P[i][0], P[i][1], m[0], m[1]); }
  c.closePath();
}
// Glied entlang eines Linienzugs mit Breiten je Punkt
function msLimb(c, pts, wd) {
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    L.push([p[0] - dy * wd[i] / 2, p[1] + dx * wd[i] / 2]); R.push([p[0] + dy * wd[i] / 2, p[1] - dx * wd[i] / 2]);
  }
  c.beginPath(); msLoop(c, L.concat(R.reverse()));
}
function msInk(c, fill, lw = 1) { c.fillStyle = fill; c.fill(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke(); }
// Kettengeflecht: graue Fläche mit Reihen kleiner Bögen
function msMail(c, x0, y0, x1, y1) {
  c.strokeStyle = 'rgba(40,46,54,0.38)'; c.lineWidth = 0.4;
  c.beginPath();
  let row = 0;
  for (let y = y0; y < y1; y += 2.6, row++) for (let x = x0 + (row % 2) * 1.5; x < x1; x += 3) { c.moveTo(x + 1.2, y); c.arc(x, y, 1.2, 0, Math.PI); }
  c.stroke();
}
// Pferdebein mit Huf und Nägeln
function msLeg(c, pts, wd, coat) {
  msLimb(c, pts, wd); msInk(c, coat, 1);
  const p = pts[pts.length - 1], q = pts[pts.length - 2], a = Math.atan2(p[1] - q[1], p[0] - q[0]);
  c.save(); c.translate(p[0], p[1]); c.rotate(a);
  c.beginPath(); c.moveTo(-1.5, -3); c.lineTo(3.5, -3.6); c.quadraticCurveTo(7, 0, 4.5, 3.6); c.lineTo(-1.5, 3); c.closePath();
  msInk(c, '#2b2420', 0.8);
  c.fillStyle = '#f4efe2';
  for (const [x, y] of [[3.6, -2.2], [5, 0], [3.8, 2.2]]) { c.beginPath(); c.arc(x, y, 0.55, 0, Math.PI * 2); c.fill(); }
  c.restore();
}
// Rose: fünf Blätter, gelbe Mitte, grüne Kelchspitzen
function msRose(c, x, y, r) {
  c.fillStyle = MS.blatt;
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + Math.PI / 5 + (k * 2 * Math.PI) / 5;
    c.beginPath(); c.moveTo(x + Math.cos(a - 0.25) * r * 0.7, y + Math.sin(a - 0.25) * r * 0.7); c.lineTo(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35); c.lineTo(x + Math.cos(a + 0.25) * r * 0.7, y + Math.sin(a + 0.25) * r * 0.7); c.fill();
  }
  c.beginPath();
  for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5; c.moveTo(x + Math.cos(a) * r * 0.52 + r * 0.55, y + Math.sin(a) * r * 0.52); c.arc(x + Math.cos(a) * r * 0.52, y + Math.sin(a) * r * 0.52, r * 0.55, 0, Math.PI * 2); }
  c.fillStyle = MS.rose; c.fill(); c.strokeStyle = INK; c.lineWidth = 0.7; c.stroke();
  c.beginPath(); c.arc(x, y, r * 0.42, 0, Math.PI * 2); c.fillStyle = MS.rose; c.fill();
  c.beginPath(); c.arc(x, y, r * 0.3, 0, Math.PI * 2); msInk(c, '#ecc23e', 0.6);
}
function msLeaf(c, x, y, a, s) {
  c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
  c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(2, -3, 6, -4, 8, -1); c.bezierCurveTo(10, -4, 14, -2, 12, 1); c.bezierCurveTo(14, 3, 10, 6, 8, 3); c.bezierCurveTo(6, 5, 2, 3, 0, 0); c.closePath();
  msInk(c, MS.blatt, 0.6 / s);
  c.restore();
}
// Ranke: Stiel als Tintenlinie mit grüner Füllung
function msStem(c, draw, w = 2.2) {
  c.beginPath(); draw(); c.strokeStyle = INK; c.lineWidth = w + 1.1; c.stroke();
  c.beginPath(); draw(); c.strokeStyle = MS.ranke; c.lineWidth = w; c.stroke();
}
function msVine(c) {
  msStem(c, () => { c.moveTo(268, 196); c.bezierCurveTo(284, 172, 254, 156, 264, 132); c.bezierCurveTo(274, 110, 250, 100, 256, 80); c.bezierCurveTo(262, 60, 240, 54, 226, 46); }, 2.4);
  // Seitenzweige, je mit einer Rose im Rankenkreis
  const twigs = [[264, 150, 271, 168], [262, 116, 244, 120], [258, 90, 272, 86], [250, 66, 236, 76], [236, 50, 210, 60], [258, 74, 266, 52]];
  for (const [sx, sy, rx, ry] of twigs) {
    const a0 = Math.atan2(sy - ry, sx - rx), R = 9.5;
    msStem(c, () => { c.moveTo(sx, sy); c.quadraticCurveTo((sx + rx) / 2 + (ry - sy) * 0.25, (sy + ry) / 2 - (rx - sx) * 0.25, rx + Math.cos(a0) * R, ry + Math.sin(a0) * R); c.arc(rx, ry, R, a0, a0 + Math.PI * 1.55); }, 1.3);
    // kleine Dornen am Kreis
    c.strokeStyle = MS.ranke; c.lineWidth = 0.9;
    for (let k = 1; k < 5; k++) { const a = a0 + k * 0.36; c.beginPath(); c.moveTo(rx + Math.cos(a) * R, ry + Math.sin(a) * R); c.lineTo(rx + Math.cos(a + 0.12) * (R + 2.6), ry + Math.sin(a + 0.12) * (R + 2.6)); c.stroke(); }
    msRose(c, rx, ry, 5.6);
  }
  msLeaf(c, 268, 140, -0.4, 0.9); msLeaf(c, 254, 104, 2.7, 0.9); msLeaf(c, 262, 60, -1.2, 0.8); msLeaf(c, 270, 186, -0.9, 0.9);
  // freie Ranke ohne Blüte
  msStem(c, () => { c.moveTo(226, 46); c.bezierCurveTo(214, 40, 204, 46, 206, 52); c.arc(210, 51, 4, Math.PI, Math.PI * 2.6); }, 1.1);
}

function msFrame(c) {
  const x0 = 8, y0 = 28, x1 = 292, y1 = 206;
  const band = (i, col) => { c.beginPath(); c.rect(x0 + i[0], y0 + i[0], x1 - x0 - 2 * i[0], y1 - y0 - 2 * i[0]); c.rect(x0 + i[1], y0 + i[1], x1 - x0 - 2 * i[1], y1 - y0 - 2 * i[1]); c.fillStyle = col; c.fill('evenodd'); };
  c.fillStyle = 'rgba(252,247,233,0.62)'; c.fillRect(x0 + 11, y0 + 11, x1 - x0 - 22, y1 - y0 - 22);
  band([0, 6.5], MS.blau); band([6.5, 9.4], MS.gold); band([9.4, 11.4], MS.rot);
  c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 0.7; c.strokeRect(x0 + 3.2, y0 + 3.2, x1 - x0 - 6.4, y1 - y0 - 6.4);
  c.strokeStyle = 'rgba(20,30,60,0.75)'; c.lineWidth = 0.6; c.strokeRect(x0, y0, x1 - x0, y1 - y0);
  c.strokeStyle = 'rgba(90,50,10,0.5)'; c.strokeRect(x0 + 6.5, y0 + 6.5, x1 - x0 - 13, y1 - y0 - 13);
  return [x0 + 11.4, y0 + 11.4, x1 - 11.4, y1 - 11.4];
}

function msTitle(c, text) {
  if (!text) return;
  let fs = 17;
  c.font = `${fs}px 'UnifrakturMaguntia', 'Old English Text MT', serif`;
  const tw = c.measureText(text).width;
  if (tw > 250) { fs = Math.max(9, fs * 250 / tw); c.font = `${fs}px 'UnifrakturMaguntia', 'Old English Text MT', serif`; }
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillStyle = MS.rot; c.fillText(text, 150, 21);
  c.textAlign = 'left';
}

// Pferdedecke mit Kopfhaube (Pferd nach links, Kopf geneigt)
function msCap(c) {
  c.beginPath();
  c.moveTo(130, 96);
  c.bezierCurveTo(160, 97, 196, 97, 214, 104);
  c.bezierCurveTo(228, 109, 233, 121, 231, 134);
  c.bezierCurveTo(236, 148, 244, 160, 252, 170);
  c.quadraticCurveTo(244, 174, 236, 167); c.quadraticCurveTo(228, 175, 218, 168); c.quadraticCurveTo(208, 174, 198, 166);
  c.quadraticCurveTo(190, 172, 184, 162); c.quadraticCurveTo(168, 157, 152, 158); c.quadraticCurveTo(136, 158, 124, 165);
  c.quadraticCurveTo(116, 174, 106, 168); c.quadraticCurveTo(98, 176, 88, 168); c.quadraticCurveTo(82, 172, 78, 163);
  c.bezierCurveTo(72, 150, 74, 136, 84, 128);   // Brust
  c.bezierCurveTo(90, 122, 94, 114, 96, 106);   // Hals unten bis zur Kehle
  c.bezierCurveTo(92, 114, 84, 122, 74, 124);   // Unterkiefer
  c.lineTo(60, 112);                            // Saum der Kopfhaube über der Nase
  c.bezierCurveTo(64, 100, 74, 88, 84, 80);     // Stirn
  c.lineTo(91, 76);                             // Genick
  c.bezierCurveTo(108, 70, 124, 80, 130, 96);   // Mähnenkamm
  c.closePath();
}

export function drawKnightPlate(c, w, h, arms, t = 0, opt = {}) {
  const k = Math.min(w / PLATE_W, h / PLATE_H);
  c.save();
  c.translate((w - PLATE_W * k) / 2, (h - PLATE_H * k) / 2); c.scale(k, k);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const field = arms.field, metal = (METALS[arms.metal] || METALS.gold).color;
  const coat = msReddish(field) ? '#ebe5d6' : '#b65c52', coatFar = msReddish(field) ? '#c7bfae' : '#91463f';
  const lanceCol = msReddish(field) ? metal : MS.rot;
  msTitle(c, opt.title);
  const [ix0, iy0, ix1, iy1] = msFrame(c);
  c.save(); c.beginPath(); c.rect(ix0, iy0, ix1 - ix0, iy1 - iy0); c.clip();
  msVine(c);
  c.restore();

  // Reiter und Pferd: im eigenen Maß gezeichnet, verkleinert in den Rahmen gesetzt (Hufe dürfen auf dem Rahmen stehen)
  const S = 0.92, KS = 1.15, K = (p) => [165 + (p[0] - 165) * KS, 100 + (p[1] - 100) * KS];
  c.save(); c.translate(150 + 2, 41); c.scale(S, S); c.translate(-150, -14);

  // Lanze mit Banner (hinter allem)
  const tip = [38, 26], hand = K([136, 79]), ux = (hand[0] - tip[0]), uy = (hand[1] - tip[1]), ul = Math.hypot(ux, uy), u = [ux / ul, uy / ul];
  const at = (d) => [tip[0] + u[0] * d, tip[1] + u[1] * d];
  {
    // Banner längs des Schafts angeschlagen, das freie Ende weht nach hinten unten und läuft in drei Zungen aus
    const H = 34, L = 25, f = [0.42, 0.91], N = 10;
    const pos = (h, s) => { const b = at(4 + h * H), wv = Math.sin(s * 4 - t * 3.4 + h * 2) * 2.6 * s; return [b[0] + f[0] * L * s + u[0] * wv, b[1] + f[1] * L * s + u[1] * wv]; };
    c.beginPath();
    let p = pos(0, 0); c.moveTo(p[0], p[1]);
    for (let i = 1; i <= N; i++) { p = pos(0, i / N); c.lineTo(p[0], p[1]); }
    for (let j = 1; j <= 6; j++) { const h = j / 6; p = pos(h, j % 2 ? 0.8 : 1.12); c.lineTo(p[0], p[1]); }
    for (let i = N; i >= 0; i--) { p = pos(1, i / N); c.lineTo(p[0], p[1]); }
    c.closePath();
    c.fillStyle = field; c.fill();
    c.save(); c.clip();
    for (const h of [0.27, 0.73]) { const q = pos(h, 0.46); drawCharge(c, arms, q[0], q[1], 14); }
    c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = 2;
    for (const h of [0.5]) { const a0 = pos(h, 0.05), a1 = pos(h, 0.95); c.beginPath(); c.moveTo(a0[0], a0[1]); c.lineTo(a1[0], a1[1]); c.stroke(); }
    c.restore();
    c.strokeStyle = INK; c.lineWidth = 1; c.stroke();
  }
  const butt = at(ul + 40);
  c.beginPath(); c.moveTo(tip[0], tip[1]); c.lineTo(butt[0], butt[1]); c.strokeStyle = INK; c.lineWidth = 3.6; c.stroke();
  c.beginPath(); c.moveTo(tip[0], tip[1]); c.lineTo(butt[0], butt[1]); c.strokeStyle = lanceCol; c.lineWidth = 2.2; c.stroke();
  // Spitze
  c.save(); c.translate(tip[0], tip[1]); c.rotate(Math.atan2(u[1], u[0]));
  c.beginPath(); c.moveTo(-9, 0); c.lineTo(-1, -2.4); c.lineTo(1.5, 0); c.lineTo(-1, 2.4); c.closePath(); msInk(c, MS.helm, 0.8);
  c.restore();

  // Ferne Beine, Schweif, nahe Beine
  msLeg(c, [[124, 150], [110, 166], [98, 176], [86, 182], [78, 186]], [13, 8, 5.4, 4.6, 5], coatFar);
  msLeg(c, [[204, 142], [208, 162], [222, 178], [236, 186], [244, 190]], [16, 10, 6, 4.6, 5], coatFar);
  c.beginPath(); c.moveTo(236, 146); c.bezierCurveTo(252, 146, 264, 152, 274, 162); c.lineTo(267, 162); c.lineTo(276, 168); c.bezierCurveTo(262, 168, 250, 164, 240, 160); c.closePath();
  msInk(c, msShade(coat, 0.82), 0.9);
  c.strokeStyle = 'rgba(40,20,10,0.45)'; c.lineWidth = 0.6;
  for (const d of [0, 3, 6]) { c.beginPath(); c.moveTo(242, 150 + d); c.bezierCurveTo(254, 152 + d, 262, 156 + d, 270, 163 + d * 0.5); c.stroke(); }
  msLeg(c, [[112, 148], [98, 162], [84, 170], [70, 174], [60, 177]], [14, 8.5, 5.6, 4.8, 5.2], coat);
  msLeg(c, [[214, 140], [220, 158], [236, 172], [252, 180], [262, 184]], [17, 11, 6.4, 4.8, 5.2], coat);

  // Decke: Feld, Wappenbilder gestreut, Falten, Futter in Metall an den Säumen, Tintenrand
  msCap(c); c.fillStyle = field; c.fill();
  c.save(); msCap(c); c.clip();
  const wash = c.createLinearGradient(0, 80, 0, 176);
  wash.addColorStop(0, 'rgba(255,255,255,0.14)'); wash.addColorStop(0.5, 'rgba(255,255,255,0)'); wash.addColorStop(1, 'rgba(0,0,0,0.16)');
  c.fillStyle = wash; c.fillRect(50, 60, 220, 120);
  for (let r = 0; r < 4; r++) for (let q = 0; q < 9; q++) {
    const x = 74 + q * 24 + (r % 2) * 12, y = 88 + r * 22;
    if (x < 88 && y < 100) continue;      // Augenpartie frei
    drawCharge(c, arms, x, y, 15);
  }
  c.strokeStyle = msShade(field, 0.62); c.lineWidth = 1.6; c.globalAlpha = 0.55;
  for (const [x0, y0, x1, y1] of [[94, 138, 98, 170], [84, 144, 86, 166], [220, 136, 228, 170], [208, 140, 210, 168], [238, 146, 246, 168]]) { c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 - 3, (y0 + y1) / 2, x1, y1); c.stroke(); }
  c.globalAlpha = 1;
  c.strokeStyle = metal; c.lineWidth = 3.4;
  c.beginPath(); c.moveTo(231, 134); c.bezierCurveTo(236, 148, 244, 160, 252, 170); c.stroke();
  c.beginPath(); c.moveTo(78, 163); c.bezierCurveTo(72, 150, 74, 136, 84, 128); c.stroke();
  c.restore();
  msCap(c); c.strokeStyle = INK; c.lineWidth = 1.3; c.stroke();
  // Ohren in Stoff
  c.beginPath(); c.moveTo(82, 81); c.quadraticCurveTo(76, 70, 79, 63); c.quadraticCurveTo(87, 70, 89, 78); c.closePath(); msInk(c, field, 1);
  c.beginPath(); c.moveTo(89, 78); c.quadraticCurveTo(88, 68, 93, 62); c.quadraticCurveTo(98, 70, 96, 79); c.closePath(); msInk(c, msShade(field, 0.8), 1);
  // Augenloch mit Auge
  c.save(); c.translate(80, 95); c.rotate(-0.9);
  c.beginPath(); c.ellipse(0, 0, 4.6, 3.6, 0, 0, Math.PI * 2); msInk(c, '#f1d6cc', 0.9);
  c.beginPath(); c.arc(0.4, 0, 1.7, 0, Math.PI * 2); c.fillStyle = INK; c.fill();
  c.restore();
  // Maul frei, Zaumzeug rot mit goldenem Buckel
  c.beginPath(); c.moveTo(60, 112); c.bezierCurveTo(52, 116, 50, 126, 54, 130); c.bezierCurveTo(58, 134, 68, 132, 74, 124); c.closePath(); msInk(c, coat, 1);
  c.beginPath(); c.arc(55.5, 124, 1.2, 0, Math.PI * 2); c.fillStyle = INK; c.fill();
  c.beginPath(); c.moveTo(57, 131); c.quadraticCurveTo(61, 129, 65, 130); c.strokeStyle = INK; c.lineWidth = 0.8; c.stroke();
  c.strokeStyle = MS.rot; c.lineWidth = 1.8;
  c.beginPath(); c.moveTo(58, 114); c.lineTo(73, 127); c.moveTo(66, 120); c.lineTo(88, 82); c.moveTo(78, 101); c.lineTo(95, 108); c.stroke();
  c.beginPath(); c.arc(77, 102, 2.2, 0, Math.PI * 2); msInk(c, MS.gold, 0.6);

  // Reiter etwas größer als das Pferd, wie in der Buchmalerei
  c.save(); c.translate(165, 100); c.scale(KS, KS); c.translate(-165, -100);
  // Sattel: hoher Hinterzwiesel
  c.beginPath(); c.moveTo(178, 101); c.quadraticCurveTo(180, 90, 186, 80); c.lineTo(191, 82); c.quadraticCurveTo(186, 92, 186, 102); c.closePath(); msInk(c, MS.gold, 1);
  c.beginPath(); c.moveTo(144, 100); c.quadraticCurveTo(142, 94, 145, 88); c.lineTo(150, 89); c.lineTo(150, 100); c.closePath(); msInk(c, MS.gold, 1);

  // Bein in Kettenhose mit Steigbügel und Sporn
  c.strokeStyle = '#5a3a22'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(160, 102); c.lineTo(148, 151); c.stroke();
  const legPath = () => msLimb(c, [[155, 118], [153, 132], [151, 147]], [10, 8.4, 7.4]);
  legPath(); c.fillStyle = MS.kette; c.fill();
  c.save(); c.clip(); msMail(c, 144, 116, 162, 152); c.restore();
  legPath(); c.strokeStyle = INK; c.lineWidth = 1; c.stroke();
  c.beginPath(); c.moveTo(155, 145); c.quadraticCurveTo(150, 152, 137, 157); c.lineTo(147, 151); c.quadraticCurveTo(149, 147, 148, 145); c.closePath(); msInk(c, MS.kette, 0.9);
  c.beginPath(); c.moveTo(142, 156); c.lineTo(145, 150.5); c.lineTo(152, 150); c.lineTo(150, 156); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
  c.beginPath(); c.moveTo(155, 149); c.lineTo(161, 151); c.strokeStyle = MS.gold; c.lineWidth = 1.4; c.stroke();

  // Waffenrock: Schoß über dem Oberschenkel, nach hinten wehend
  c.beginPath(); c.moveTo(151, 97); c.lineTo(178, 97); c.bezierCurveTo(190, 104, 202, 116, 210, 132);
  c.lineTo(200, 134); c.lineTo(193, 128); c.lineTo(184, 136); c.lineTo(174, 129); c.lineTo(162, 134); c.lineTo(152, 128);
  c.bezierCurveTo(148, 118, 148, 106, 151, 97); c.closePath();
  c.fillStyle = field; c.fill();
  c.save(); c.clip(); drawCharge(c, arms, 182, 114, 15); c.strokeStyle = msShade(field, 0.6); c.lineWidth = 1.4; c.globalAlpha = 0.5;
  c.beginPath(); c.moveTo(166, 102); c.quadraticCurveTo(170, 116, 168, 130); c.moveTo(190, 108); c.quadraticCurveTo(194, 118, 196, 130); c.stroke(); c.restore();
  c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
  // Leib im Waffenrock
  c.beginPath(); c.moveTo(153, 100); c.lineTo(179, 100); c.lineTo(178, 76); c.quadraticCurveTo(166, 70, 154, 76); c.closePath(); msInk(c, field, 1.2);
  // Ritterin: Zopf unter dem Helm
  if (opt.female) {
    msLimb(c, [[176, 70], [182, 78], [185, 88], [189, 99]], [5, 4.6, 4, 2.6]); msInk(c, '#b07a3a', 0.8);
    c.strokeStyle = 'rgba(60,30,10,0.6)'; c.lineWidth = 0.6;
    for (const [x, y] of [[179, 76], [183, 84], [185, 92]]) { c.beginPath(); c.moveTo(x - 2, y - 1); c.lineTo(x + 2, y + 1.5); c.stroke(); }
  }
  // Topfhelm mit Sehschlitz, Luftlöchern und goldenem Kreuzband
  c.beginPath(); c.moveTo(153, 78); c.lineTo(152, 56); c.quadraticCurveTo(152, 49, 165, 49); c.quadraticCurveTo(178, 49, 178, 56); c.lineTo(178, 78); c.quadraticCurveTo(166, 81, 153, 78); c.closePath();
  const hg = c.createLinearGradient(152, 0, 178, 0); hg.addColorStop(0, '#dfe2e4'); hg.addColorStop(0.55, MS.helm); hg.addColorStop(1, '#868c92');
  msInk(c, hg, 1.3);
  c.fillStyle = MS.gold; c.fillRect(155.5, 50, 3, 28); c.fillRect(152.5, 60.5, 13, 2.6);
  c.strokeStyle = INK; c.lineWidth = 0.6; c.strokeRect(155.5, 50, 3, 28);
  c.fillStyle = INK; c.fillRect(152, 58, 16, 1.9);
  for (const [x, y] of [[160, 67], [163, 67], [160, 70], [163, 70], [161.5, 73]]) { c.beginPath(); c.arc(x, y, 0.6, 0, Math.PI * 2); c.fill(); }
  // Helmwulst in Feld und Metall, darauf das Wappenbild als Helmzier
  for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(155.5 + i * 4.8, 48.5, 2.8, 2.4, 0.5, 0, Math.PI * 2); msInk(c, i % 2 ? metal : field, 0.7); }
  drawCharge(c, arms, 165, 36, 23);
  // Arm in Kettenhemd zur Lanze, Faust um den Schaft
  const armPath = () => msLimb(c, [[170, 80], [156, 86], [140, 80]], [9, 8, 7]);
  armPath(); c.fillStyle = MS.kette; c.fill();
  c.save(); c.clip(); msMail(c, 134, 72, 176, 92); c.restore();
  armPath(); c.strokeStyle = INK; c.lineWidth = 1; c.stroke();
  c.beginPath(); c.ellipse(136, 79, 4.4, 3.6, -0.4, 0, Math.PI * 2); msInk(c, MS.kette, 1);
  c.beginPath(); c.moveTo(136 - u[0] * 4.5, 79 - u[1] * 4.5); c.lineTo(136 - u[0] * 8, 79 - u[1] * 8); c.strokeStyle = INK; c.lineWidth = 3.6 / KS; c.stroke(); c.strokeStyle = lanceCol; c.lineWidth = 2.2 / KS; c.stroke();
  // Wappenschild vor der Brust
  c.save(); c.translate(152, 82); c.rotate(-0.1);
  drawArms(c, arms, 0, 0, 35);
  c.restore();
  c.restore();
  // Zügel von der Schildhand zum Gebiss
  { const r0 = K([139, 110]); c.beginPath(); c.moveTo(r0[0], r0[1]); c.quadraticCurveTo(96, 138, 62, 126); } c.strokeStyle = MS.rot; c.lineWidth = 1.4; c.stroke();
  c.restore();
  c.restore();
}
