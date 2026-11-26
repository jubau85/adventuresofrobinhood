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
// Eine Seite wie aus einer Liederhandschrift um 1300, im Hochformat: oben in roter Tinte Name und Blattzahl, Rahmen
// in Blau, Gold und Rot, im Grund scheint die Schrift der Rückseite durch. Der Ritter springt nach links, Pferdedecke
// und Banner sind mit dem Wappenbild bestreut, das Wappenbild steht groß als Helmzier auf dem Topfhelm, vor der Brust
// hängt der Wappenschild, rechts und oben rankt eine Rose. Flache Farben mit Tintenrand, Falten mit Schatten und
// weißen Lichtern. Gezeichnet in einem Feld von 240 × 340, eingepasst in w × h.
export const PLATE_W = 240, PLATE_H = 340;
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
// Gemalte Falten: dunkle, weiche Striche in den Tiefen, feine weiße Lichter auf den Graten (wie in der Buchmalerei)
function msFolds(c, col, lines) {
  for (const [x0, y0, x1, y1, bend] of lines) {
    const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2;
    for (const [w, a] of [[6, 0.1], [3.6, 0.14], [1.8, 0.2]]) { c.strokeStyle = col; c.globalAlpha = a * 2.2; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(mx, my, x1, y1); c.stroke(); }
    c.globalAlpha = 0.55; c.strokeStyle = '#fff'; c.lineWidth = 0.7;
    c.beginPath(); c.moveTo(x0 + 3, y0 + 2); c.quadraticCurveTo(mx + 3.2, my, x1 + 3, y1 - 4); c.stroke();
  }
  c.globalAlpha = 1;
}
// Rose mit gemalter Tiefe
function msRoseBig(c, x, y, r) {
  msRose(c, x, y, r);
  c.strokeStyle = 'rgba(110,20,10,0.45)'; c.lineWidth = r * 0.12;
  for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.52, y + Math.sin(a) * r * 0.52, r * 0.36, a - 1.1, a + 1.1); c.stroke(); }
  c.fillStyle = 'rgba(255,255,255,0.55)';
  for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5 - 0.5; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78, r * 0.07, 0, Math.PI * 2); c.fill(); }
}
// Efeublatt (dreilappig)
function msIvy(c, x, y, a, s) {
  c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
  c.beginPath(); c.moveTo(0, 0);
  c.bezierCurveTo(-2, -4, -9, -4, -10, -9); c.bezierCurveTo(-6, -10, -4, -13, 0, -16); c.bezierCurveTo(4, -13, 6, -10, 10, -9); c.bezierCurveTo(9, -4, 2, -4, 0, 0);
  c.closePath(); msInk(c, MS.blatt, 0.7 / s);
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.6 / s; c.beginPath(); c.moveTo(0, -2); c.lineTo(0, -12); c.stroke();
  c.restore();
}

// Rosenranke: vom unteren Rand hinter dem Pferd hinauf und oben über das Bild, jede Rose in einem Rankenkreis
function msVine(c) {
  const stem = () => { c.moveTo(186, 323); c.bezierCurveTo(176, 300, 198, 286, 190, 262); c.bezierCurveTo(182, 240, 204, 226, 194, 204); c.bezierCurveTo(186, 184, 206, 170, 196, 148); c.bezierCurveTo(186, 126, 206, 112, 194, 90); c.bezierCurveTo(186, 74, 166, 70, 150, 74); c.bezierCurveTo(134, 78, 118, 72, 108, 58); };
  msStem(c, stem, 2.6);
  // [Abzweig am Stiel x, y, Rose x, y, Drehsinn]
  const twigs = [[192, 244, 207, 228, 1], [194, 206, 172, 196, -1], [196, 170, 208, 152, 1], [195, 132, 172, 124, -1], [196, 100, 206, 66, 1], [160, 72, 168, 46, -1], [124, 72, 128, 48, 1], [110, 60, 88, 44, -1]];
  for (const [sx, sy, rx, ry, dir] of twigs) {
    const R = 14, a0 = Math.atan2(sy - ry, sx - rx);
    msStem(c, () => { c.moveTo(sx, sy); c.quadraticCurveTo((sx + rx) / 2 + (ry - sy) * 0.3 * dir, (sy + ry) / 2 - (rx - sx) * 0.3 * dir, rx + Math.cos(a0) * R, ry + Math.sin(a0) * R); c.arc(rx, ry, R, a0, a0 + dir * Math.PI * 1.6, dir < 0); }, 1.5);
    // Ranke läuft in eine kleine Schnecke aus
    const ae = a0 + dir * Math.PI * 1.6, ex = rx + Math.cos(ae) * R, ey = ry + Math.sin(ae) * R;
    msStem(c, () => { c.moveTo(ex, ey); c.arc(ex + Math.cos(ae) * -3, ey + Math.sin(ae) * -3, 3, ae, ae + dir * Math.PI * 1.5, dir < 0); }, 1);
    // kleine Blättchen außen am Kreis
    c.fillStyle = MS.ranke;
    for (let k = 1; k < 7; k++) { const a = a0 + dir * k * 0.42; const px = rx + Math.cos(a) * R, py = ry + Math.sin(a) * R; c.beginPath(); c.ellipse(px + Math.cos(a) * 2.2, py + Math.sin(a) * 2.2, 2.2, 1, a, 0, Math.PI * 2); c.fill(); }
    msRoseBig(c, rx, ry, 9);
  }
  msIvy(c, 206, 312, 0.5, 0.95); msIvy(c, 182, 280, -0.6, 0.85); msIvy(c, 210, 108, 0.8, 0.8);
}

// Rahmen: Blau mit weißer Haarlinie, Gold, Rot; innen das Pergament (mit Schrift von der Rückseite, die durchscheint)
const MS_VERSE = ['ich saz ûf eime steine und dahte bein mit beine', 'dar ûf satzt ich den ellenbogen ich hete in mîne hant gesmogen', 'daz kinne und ein mîn wange dô dâhte ich mir vil ange', 'wie man zer welte solte leben deheinen rât kond ich gegeben', 'wie man driu dinc erwurbe der deheinez niht verdurbe'];
function msFrame(c, bleed) {
  const x0 = 8, y0 = 26, x1 = PLATE_W - 8, y1 = PLATE_H - 6, ins = 11;
  const band = (a, b, col) => { c.beginPath(); c.rect(x0 + a, y0 + a, x1 - x0 - 2 * a, y1 - y0 - 2 * a); c.rect(x0 + b, y0 + b, x1 - x0 - 2 * b, y1 - y0 - 2 * b); c.fillStyle = col; c.fill('evenodd'); };
  c.fillStyle = 'rgba(253,249,236,0.5)'; c.fillRect(x0 + ins, y0 + ins, x1 - x0 - 2 * ins, y1 - y0 - 2 * ins);
  if (bleed) {
    // gespiegelt und ganz blass: die Verse der Rückseite
    c.save(); c.beginPath(); c.rect(x0 + ins, y0 + ins, x1 - x0 - 2 * ins, y1 - y0 - 2 * ins); c.clip();
    c.translate(PLATE_W, 0); c.scale(-1, 1);
    c.fillStyle = 'rgba(80,50,25,0.045)'; c.font = `8.5px 'UnifrakturMaguntia', serif`;
    for (let i = 0, y = y0 + 22; y < y1 - 6; i++, y += 10.5) c.fillText(MS_VERSE[i % MS_VERSE.length], x0 + 16 + (i % 3) * 2, y);
    c.restore();
  }
  band(0, 6, MS.blau);
  const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, '#e9c25a'); g.addColorStop(0.45, MS.gold); g.addColorStop(0.55, '#f0d27a'); g.addColorStop(1, '#b98a2a');
  band(6, 9, g); band(9, ins, MS.rot);
  c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 0.7; c.strokeRect(x0 + 3, y0 + 3, x1 - x0 - 6, y1 - y0 - 6);
  c.strokeStyle = 'rgba(20,30,60,0.7)'; c.lineWidth = 0.6; c.strokeRect(x0, y0, x1 - x0, y1 - y0);
  c.strokeStyle = 'rgba(90,50,10,0.45)'; c.strokeRect(x0 + 6, y0 + 6, x1 - x0 - 12, y1 - y0 - 12);
  return [x0 + ins, y0 + ins, x1 - ins, y1 - ins];
}

// Blattzahl in römischen Ziffern wie in den Handschriften („.lvij.“)
function msRoman(n) {
  let s = '';
  for (const [v, r] of [[100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]) while (n >= v) { s += r; n -= v; }
  return s.replace(/i$/, 'j');
}
function msTitle(c, text) {
  if (!text) return;
  let h = 0; for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const folio = `.${msRoman(12 + (h % 128))}.`;
  const font = (fs) => `${fs}px 'UnifrakturMaguntia', 'Old English Text MT', serif`;
  let fs = 15; c.font = font(fs);
  const tw = c.measureText(text).width;
  if (tw > 160) { fs = Math.max(8, fs * 160 / tw); c.font = font(fs); }
  c.textBaseline = 'alphabetic'; c.fillStyle = MS.rot;
  c.textAlign = 'center'; c.fillText(text, 108, 18);
  c.font = font(12); c.textAlign = 'right'; c.fillText(folio, PLATE_W - 14, 18);
  c.textAlign = 'left';
  // Punktierte Linierung wie auf der Seite
  c.fillStyle = 'rgba(120,90,60,0.35)';
  for (let x = 12; x < PLATE_W - 12; x += 7) c.fillRect(x, 23, 0.8, 0.8);
}

// Pferdedecke mit Kopfhaube; das Pferd springt nach links, der Vorderleib hoch, der Kopf geneigt
function msCap(c) {
  c.beginPath();
  c.moveTo(104, 206);
  c.bezierCurveTo(128, 212, 158, 222, 180, 232);                 // Rücken
  c.bezierCurveTo(196, 238, 206, 254, 202, 270);                 // Kruppe
  c.bezierCurveTo(206, 280, 210, 290, 214, 300);                 // Schoß hinten, weht
  c.quadraticCurveTo(207, 305, 200, 299); c.quadraticCurveTo(193, 306, 185, 299); c.quadraticCurveTo(178, 305, 170, 298); c.quadraticCurveTo(163, 303, 156, 296);
  c.quadraticCurveTo(146, 289, 136, 294);                        // unter dem Bauch höher
  c.quadraticCurveTo(130, 312, 122, 304); c.quadraticCurveTo(114, 314, 106, 304); c.quadraticCurveTo(98, 312, 90, 302); c.quadraticCurveTo(82, 310, 76, 300);
  c.bezierCurveTo(68, 284, 66, 266, 72, 252);                    // Brust
  c.bezierCurveTo(76, 240, 76, 228, 72, 220);                    // Hals unten bis zur Kehle
  c.bezierCurveTo(64, 226, 54, 232, 46, 234);                    // Unterkiefer
  c.lineTo(36, 222);                                             // Saum der Haube über der Nase
  c.bezierCurveTo(40, 208, 50, 194, 60, 186);                    // Stirn
  c.lineTo(66, 182);                                             // Genick
  c.bezierCurveTo(84, 176, 100, 188, 104, 206);                  // Mähnenkamm
  c.closePath();
}

export function drawKnightPlate(c, w, h, arms, t = 0, opt = {}) {
  const k = Math.min(w / PLATE_W, h / PLATE_H);
  c.save();
  c.translate((w - PLATE_W * k) / 2, (h - PLATE_H * k) / 2); c.scale(k, k);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const field = arms.field, metal = (METALS[arms.metal] || METALS.gold).color, deep = msShade(field, 0.55);
  const white = msReddish(field);
  const coat = white ? '#ece6d8' : '#b45a54', coatFar = white ? '#c8c0ae' : '#8e4540';
  const lanceCol = white ? metal : MS.rot;
  msTitle(c, opt.title);
  const [ix0, iy0, ix1, iy1] = msFrame(c, true);
  c.save(); c.beginPath(); c.rect(ix0, iy0, ix1 - ix0, iy1 - iy0); c.clip();
  msVine(c);
  c.restore();

  // Lanze von links oben zur Faust, Banner längs des Schafts, das nach rechts weht
  const tip = [26, 44], hand = [86, 178], ul = Math.hypot(hand[0] - tip[0], hand[1] - tip[1]), u = [(hand[0] - tip[0]) / ul, (hand[1] - tip[1]) / ul];
  const at = (d) => [tip[0] + u[0] * d, tip[1] + u[1] * d];
  {
    const H0 = 10, H1 = 66, L = 54, N = 12;
    const pos = (hh, s) => { const b = at(H0 + hh * (H1 - H0)), wv = Math.sin(s * 5 - t * 3 + hh * 1.5) * 3.4 * s; return [b[0] + L * s, b[1] + wv + s * 6]; };
    const outline = () => {
      c.beginPath(); let p = pos(0, 0); c.moveTo(p[0], p[1]);
      for (let i = 1; i <= N; i++) { p = pos(0, i / N); c.lineTo(p[0], p[1]); }
      for (let j = 1; j <= 8; j++) { p = pos(j / 8, 1 + Math.sin(j * 1.3) * 0.02); c.lineTo(p[0], p[1]); }
      for (let i = N; i >= 0; i--) { p = pos(1, i / N); c.lineTo(p[0], p[1]); }
      c.closePath();
    };
    outline(); c.fillStyle = field; c.fill();
    c.save(); outline(); c.clip();
    for (const hh of [0.17, 0.5, 0.83]) { const q = pos(hh, 0.5); drawCharge(c, arms, q[0], q[1], 17); }
    const f1 = pos(0, 0.3), f2 = pos(1, 0.32), f3 = pos(0, 0.72), f4 = pos(1, 0.7);
    msFolds(c, deep, [[f1[0], f1[1], f2[0], f2[1], 4], [f3[0], f3[1], f4[0], f4[1], -4]]);
    c.restore();
    outline(); c.strokeStyle = INK; c.lineWidth = 1; c.stroke();
  }
  const butt = at(ul + 44);
  c.beginPath(); c.moveTo(tip[0], tip[1]); c.lineTo(butt[0], butt[1]); c.strokeStyle = INK; c.lineWidth = 4.2; c.stroke();
  c.beginPath(); c.moveTo(tip[0], tip[1]); c.lineTo(butt[0], butt[1]); c.strokeStyle = lanceCol; c.lineWidth = 2.7; c.stroke();
  c.save(); c.translate(tip[0], tip[1]); c.rotate(Math.atan2(u[1], u[0]));
  c.beginPath(); c.moveTo(-11, 0); c.lineTo(-1, -3); c.lineTo(2, 0); c.lineTo(-1, 3); c.closePath(); msInk(c, MS.helm, 0.8);
  c.restore();

  // Beine und Schweif
  msLeg(c, [[88, 258], [70, 268], [54, 278], [54, 294], [58, 306]], [14, 9, 6.6, 5.6, 6], coatFar);
  msLeg(c, [[168, 272], [166, 292], [178, 306], [170, 318], [176, 328]], [18, 11, 7, 5.6, 6], coatFar);
  c.beginPath(); c.moveTo(202, 274); c.bezierCurveTo(214, 280, 222, 288, 230, 300); c.lineTo(223, 298); c.lineTo(228, 307); c.bezierCurveTo(217, 302, 208, 296, 200, 288); c.closePath();
  msInk(c, msShade(coat, 0.85), 0.9);
  c.strokeStyle = 'rgba(60,20,10,0.4)'; c.lineWidth = 0.6;
  for (const d of [0, 3, 6]) { c.beginPath(); c.moveTo(204, 279 + d); c.bezierCurveTo(212, 284 + d, 218, 290 + d, 225, 300 + d * 0.4); c.stroke(); }
  msLeg(c, [[80, 250], [60, 252], [42, 256], [38, 272], [40, 286]], [15, 9.5, 6.6, 5.6, 6], coat);
  msLeg(c, [[184, 268], [190, 290], [204, 304], [196, 318], [204, 328]], [20, 12, 7, 5.6, 6], coat);
  // Schattenlinien an den Beinen
  c.strokeStyle = msShade(coat, 0.7); c.lineWidth = 1.2; c.globalAlpha = 0.6;
  for (const pts of [[[60, 254], [44, 258], [41, 272]], [[190, 292], [202, 305]]]) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1] + 2); for (const p of pts.slice(1)) c.lineTo(p[0] + 1.5, p[1] + 1); c.stroke(); }
  c.globalAlpha = 1;

  // Decke: Feld, gestreute Wappenbilder, gemalte Falten, Futter in Metall, Tintenrand
  msCap(c); c.fillStyle = field; c.fill();
  c.save(); msCap(c); c.clip();
  const wash = c.createLinearGradient(0, 180, 0, 312);
  wash.addColorStop(0, 'rgba(255,255,255,0.16)'); wash.addColorStop(0.55, 'rgba(255,255,255,0)'); wash.addColorStop(1, 'rgba(0,0,0,0.2)');
  c.fillStyle = wash; c.fillRect(20, 170, 200, 150);
  for (let r = 0; r < 5; r++) for (let q = 0; q < 8; q++) {
    const x = 36 + q * 26 + (r % 2) * 13, y = 190 + r * 26;
    if (x < 70 && y < 220) continue;     // Augenpartie frei
    drawCharge(c, arms, x, y, 17);
  }
  msFolds(c, deep, [[92, 262, 90, 306, -3], [108, 262, 106, 308, 3], [124, 268, 122, 304, -2], [172, 258, 168, 298, -4], [188, 256, 186, 298, 3], [201, 272, 208, 298, 2]]);
  c.strokeStyle = metal; c.lineWidth = 4;
  c.beginPath(); c.moveTo(202, 270); c.bezierCurveTo(206, 280, 210, 290, 214, 300); c.stroke();
  c.beginPath(); c.moveTo(76, 300); c.bezierCurveTo(68, 284, 66, 266, 72, 252); c.stroke();
  c.restore();
  msCap(c); c.strokeStyle = INK; c.lineWidth = 1.4; c.stroke();
  // Ohren in Stoff
  c.beginPath(); c.moveTo(58, 187); c.quadraticCurveTo(50, 176, 52, 166); c.quadraticCurveTo(62, 174, 65, 183); c.closePath(); msInk(c, field, 1);
  c.beginPath(); c.moveTo(64, 183); c.quadraticCurveTo(63, 172, 68, 164); c.quadraticCurveTo(74, 174, 71, 184); c.closePath(); msInk(c, msShade(field, 0.8), 1);
  // Augenloch mit Auge
  c.save(); c.translate(54, 204); c.rotate(-0.9);
  c.beginPath(); c.ellipse(0, 0, 5.4, 4.2, 0, 0, Math.PI * 2); msInk(c, '#efd2c8', 0.9);
  c.beginPath(); c.arc(0.4, 0, 2, 0, Math.PI * 2); c.fillStyle = INK; c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(-0.4, -0.8, 0.6, 0, Math.PI * 2); c.fill();
  c.restore();
  // Maul, Zaumzeug rot mit goldenem Buckel
  c.beginPath(); c.moveTo(36, 222); c.bezierCurveTo(28, 226, 26, 236, 30, 240); c.bezierCurveTo(34, 244, 42, 242, 46, 234); c.closePath(); msInk(c, coat, 1);
  c.beginPath(); c.arc(31, 233, 1.3, 0, Math.PI * 2); c.fillStyle = INK; c.fill();
  c.beginPath(); c.moveTo(32, 240.5); c.quadraticCurveTo(37, 239, 41, 240); c.strokeStyle = INK; c.lineWidth = 0.8; c.stroke();
  c.strokeStyle = MS.rot; c.lineWidth = 2;
  c.beginPath(); c.moveTo(34, 224); c.lineTo(47, 236); c.moveTo(41, 230); c.lineTo(61, 190); c.moveTo(52, 212); c.lineTo(72, 220); c.stroke();
  c.beginPath(); c.arc(52, 212, 2.6, 0, Math.PI * 2); msInk(c, MS.gold, 0.6);

  // Sattel: hoher Hinterzwiesel, Vorderzwiesel
  c.beginPath(); c.moveTo(144, 220); c.quadraticCurveTo(146, 206, 152, 194); c.lineTo(158, 196); c.quadraticCurveTo(152, 208, 152, 222); c.closePath(); msInk(c, MS.gold, 1);
  c.beginPath(); c.moveTo(106, 214); c.quadraticCurveTo(104, 206, 108, 198); c.lineTo(114, 199); c.lineTo(114, 214); c.closePath(); msInk(c, MS.gold, 1);
  // Bein in Kettenhose, Steigbügel, Sporn
  c.strokeStyle = '#5a3a22'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(128, 216); c.lineTo(114, 274); c.stroke();
  const legPath = () => msLimb(c, [[121, 238], [119, 254], [118, 268]], [13, 11, 9.5]);
  legPath(); c.fillStyle = MS.kette; c.fill();
  c.save(); c.clip(); msMail(c, 110, 232, 130, 272); c.restore();
  legPath(); c.strokeStyle = INK; c.lineWidth = 1; c.stroke();
  c.beginPath(); c.moveTo(123, 264); c.quadraticCurveTo(118, 274, 101, 280); c.lineTo(113, 271); c.quadraticCurveTo(114, 266, 113, 264); c.closePath(); msInk(c, MS.kette, 0.9);
  c.beginPath(); c.moveTo(106, 281); c.lineTo(109, 274); c.lineTo(119, 273); c.lineTo(117, 281); c.strokeStyle = INK; c.lineWidth = 1.7; c.stroke();
  c.beginPath(); c.moveTo(123, 268); c.lineTo(131, 271); c.strokeStyle = MS.gold; c.lineWidth = 1.6; c.stroke();
  // Waffenrock: Schoß über dem Oberschenkel, nach hinten wehend, mit weißem Futter am Saum
  const skirt = () => { c.beginPath(); c.moveTo(110, 204); c.lineTo(146, 204); c.bezierCurveTo(156, 214, 164, 230, 168, 248); c.lineTo(158, 250); c.lineTo(151, 243); c.lineTo(143, 251); c.lineTo(134, 244); c.lineTo(125, 251); c.lineTo(115, 243); c.bezierCurveTo(108, 230, 106, 216, 110, 204); c.closePath(); };
  skirt(); c.fillStyle = field; c.fill();
  c.save(); skirt(); c.clip();
  drawCharge(c, arms, 141, 226, 17);
  msFolds(c, deep, [[126, 210, 122, 248, -3], [150, 212, 158, 246, 3]]);
  c.strokeStyle = metal; c.lineWidth = 3; c.beginPath(); c.moveTo(168, 248); c.lineTo(158, 250); c.lineTo(151, 243); c.lineTo(143, 251); c.lineTo(134, 244); c.lineTo(125, 251); c.lineTo(115, 243); c.stroke();
  c.restore();
  skirt(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
  // Leib im Waffenrock
  c.beginPath(); c.moveTo(108, 208); c.lineTo(146, 208); c.lineTo(144, 168); c.quadraticCurveTo(126, 160, 110, 168); c.closePath(); msInk(c, field, 1.2);
  // Ritterin: Zopf unter dem Helm
  if (opt.female) {
    msLimb(c, [[138, 160], [146, 172], [149, 184], [154, 198]], [7, 6.4, 5.4, 3.4]); msInk(c, '#b07a3a', 0.8);
    c.strokeStyle = 'rgba(60,30,10,0.6)'; c.lineWidth = 0.7;
    for (const [x, y] of [[142, 166], [147, 176], [150, 187]]) { c.beginPath(); c.moveTo(x - 3, y - 1); c.lineTo(x + 3, y + 2); c.stroke(); }
  }
  // Topfhelm: Sehschlitz, Luftlöcher, goldenes Kreuzband, Licht auf der Wölbung
  c.beginPath(); c.moveTo(111, 166); c.lineTo(110, 140); c.quadraticCurveTo(110, 131, 125, 131); c.quadraticCurveTo(140, 131, 140, 140); c.lineTo(140, 166); c.quadraticCurveTo(126, 170, 111, 166); c.closePath();
  const hg = c.createLinearGradient(110, 0, 140, 0); hg.addColorStop(0, '#e6e8ea'); hg.addColorStop(0.5, MS.helm); hg.addColorStop(1, '#7d838a');
  msInk(c, hg, 1.4);
  c.fillStyle = MS.gold; c.fillRect(113.5, 132, 3.6, 34); c.fillRect(110.5, 147.5, 16, 3);
  c.strokeStyle = INK; c.lineWidth = 0.6; c.strokeRect(113.5, 132, 3.6, 34); c.strokeRect(110.5, 147.5, 16, 3);
  c.fillStyle = INK; c.fillRect(110, 144.5, 19, 2.4);
  for (const [x, y] of [[121, 155], [124.5, 155], [121, 159], [124.5, 159], [122.7, 163]]) { c.beginPath(); c.arc(x, y, 0.75, 0, Math.PI * 2); c.fill(); }
  c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(119, 134); c.quadraticCurveTo(129, 133, 134, 137); c.stroke();
  // Das Wappenbild als große Helmzier, darunter der Helmwulst in Feld und Metall
  drawCharge(c, arms, 125, 108, 52);
  for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(112.5 + i * 5.1, 131, 3, 2.6, 0.5, 0, Math.PI * 2); msInk(c, i % 2 ? metal : field, 0.7); }
  // Arm in Kettenhemd, Faust um den Schaft
  const armPath = () => msLimb(c, [[138, 172], [112, 186], [90, 180]], [11, 10, 9]);
  armPath(); c.fillStyle = MS.kette; c.fill();
  c.save(); c.clip(); msMail(c, 82, 166, 146, 196); c.restore();
  armPath(); c.strokeStyle = INK; c.lineWidth = 1; c.stroke();
  c.beginPath(); c.ellipse(hand[0], hand[1], 6, 5, -0.5, 0, Math.PI * 2); msInk(c, MS.kette, 1);
  c.beginPath(); c.moveTo(hand[0] - u[0] * 6, hand[1] - u[1] * 6); c.lineTo(hand[0] - u[0] * 11, hand[1] - u[1] * 11); c.strokeStyle = INK; c.lineWidth = 4.2; c.stroke(); c.strokeStyle = lanceCol; c.lineWidth = 2.7; c.stroke();
  // Großer Wappenschild vor der Brust
  c.save(); c.translate(112, 170); c.rotate(-0.08);
  drawArms(c, arms, 0, 0, 48);
  c.restore();
  // Zügel von der Schildhand zum Gebiss
  c.beginPath(); c.moveTo(92, 218); c.quadraticCurveTo(64, 246, 38, 236); c.strokeStyle = MS.rot; c.lineWidth = 1.6; c.stroke();
  c.restore();
}
