// Grafschaften (Shires). Jede Burg ist Sitz einer Grafschaft; Städte, Abteien, Hallen, Dörfer, Lager und Gruben
// gehören zu der Burg, die man über Land am schnellsten erreicht (höchstens gut hundert Kilometer weit). Wer die Burg
// hält, beherrscht die Grafschaft: Er bekommt die Abgaben ihrer Orte und einen Vorzug, der zu ihrer Geschichte passt.
// Dein Erbe Ashcombe liegt im West Riding. Dessen Sitz Pontefract hält Prinz Johns Vogt: die einzige Grafschaft mit
// zwei Burgen. Erst wer Pontefract zurückerobert, beherrscht das West Riding.

import { G, log, homeName, playerColor } from './state.js';
import { FACTIONS, GEO } from './data.js';
import { landAt } from './world.js';
import { BARONS, isBaronOwner, ownerBaron, baronColor } from './barons.js';

// Sitz (Burg) → Name der Grafschaft, Vorzug für ihren Herrn und Erklärung
// goods: Waren täglich ins Burglager, gold: Gold täglich, def: Verteidigung der Burg, ruhm: Ruhm täglich,
// faehre: Fährlohn (Anteil)
export const SHIRES = {
  pontefract: { name: 'West Riding', also: ['york'], goods: { wolle: 6 }, text: 'Schafweiden am Rand der Pennines: täglich 6 Wolle.' },
  nottingham: { name: 'Nottinghamshire', goods: { fleisch: 4, holz: 4 }, text: 'Der Sherwood: täglich Wildbret und Holz.' },
  torquilstone: { name: 'East Riding', goods: { getreide: 8 }, text: 'Die fruchtbaren Wolds: täglich 8 Getreide.' },
  scarborough: { name: 'North Riding', goods: { salz: 3, felle: 2 }, text: 'Küste und Moore: täglich Salz und Felle.' },
  warwick: { name: 'Warwickshire', gold: 25, text: 'Die Mitte Englands, wo alle Straßen kreuzen: Zölle bringen täglich 25 Gold.' },
  gloucester: { name: 'Gloucestershire', goods: { eisen: 4 }, text: 'Eisen aus den Gruben im Forest of Dean: täglich 4 Eisen.' },
  carlisle: { name: 'Cumberland', def: 20, text: 'Die Grenzmark gegen die Schotten: erfahrene Grenzer stärken deine Burg (+20 Verteidigung).' },
  chester: { name: 'Cheshire', goods: { salz: 5 }, text: 'Die Pfalzgrafschaft mit den Salzpfannen von Nantwich: täglich 5 Salz.' },
  lancaster: { name: 'Lancashire', goods: { wolle: 3, felle: 3 }, text: 'Weiden und Moore zwischen Ribble und Lune: täglich Wolle und Felle.' },
  dover: { name: 'Kent', faehre: 0.5, gold: 10, text: 'Der Schlüssel Englands: Die Fährleute fahren dich zum halben Lohn, dazu 10 Gold Hafenzoll täglich.' },
  windsor: { name: 'Berkshire', ruhm: 1, text: 'Königliche Burg und Forst: Wer hier gebietet, gilt etwas am Hof (täglich Ruhm).' },
  colchester: { name: 'Essex', gold: 15, goods: { salz: 2 }, text: 'Die älteste Stadt Englands, Austernbänke und Salzgärten: täglich Gold und Salz.' },
  pembroke: { name: 'Pembroke', def: 15, text: '„Klein-England jenseits von Wales“: walisische Langbogenschützen stärken deine Burg (+15 Verteidigung).' },
  cardiff: { name: 'Glamorgan', goods: { eisen: 3, stein: 3 }, text: 'Die walisische Mark mit Erz und Bruchstein: täglich Eisen und Stein.' },
  caen: { name: 'Bessin', goods: { stein: 8 }, text: 'Der Caen-Stein, aus dem man den Tower und Canterbury baute: täglich 8 Stein.' },
  falaise: { name: 'Hiémois', ruhm: 1, text: 'Die Heimat Wilhelms des Eroberers: Wer sie hält, hat Ansehen (täglich Ruhm).' },
  evreux: { name: 'Grafschaft Évreux', goods: { getreide: 8 }, text: 'Die Kornkammer an der Eure: täglich 8 Getreide.' },
  gisors: { name: 'Vexin', def: 25, text: 'Die umkämpfte Grenzfeste zwischen Normandie und Frankreich (+25 Verteidigung).' },
  compiegne: { name: 'Île-de-France', weight: 0.72, goods: { holz: 8 }, text: 'Die Krondomäne um Paris mit dem königlichen Forst von Compiègne: täglich 8 Holz.' },
  // Schottland
  roxburgh: { name: 'Teviotdale', goods: { wolle: 6 }, text: 'Die Schafweiden der Grenzabteien: täglich 6 Wolle.' },
  stirling: { name: 'Stirlingshire', weight: 0.85, def: 20, text: 'Die Brücke über den Forth: Wer sie hält, hält das Reich zusammen (+20 Verteidigung).' },
  inverness: { name: 'Moray', weight: 0.8, goods: { felle: 4, holz: 4 }, text: 'Der Zugang zu den Highlands: täglich Felle und Holz aus den Wäldern der Clans.' },
  // Irland
  carrickfergus: { name: 'Ulster', weight: 0.85, goods: { fleisch: 5 }, text: 'Die Rinderweiden von Antrim und Down: täglich 5 Fleisch.' },
  trim: { name: 'Meath', goods: { getreide: 8 }, text: 'Das fruchtbarste Land Irlands: täglich 8 Getreide.' },
  kilkenny: { name: 'Leinster', gold: 15, text: 'Das Erbe Strongbows mit seinen Märkten und Häfen: täglich 15 Gold.' },
  limerick: { name: 'Thomond', goods: { fleisch: 3, salz: 2 }, text: 'Das Königreich der Ó Briain am Shannon: täglich Fleisch und Salz.' },
  galway: { name: 'Connacht', weight: 0.8, goods: { felle: 3, wolle: 3 }, text: 'Das weite Land jenseits des Shannon: täglich Felle und Wolle.' },
};
export const HOME_SHIRE = 'pontefract';
// Abgaben je Ort in einer eigenen Grafschaft (Gold am Tag)
const TAX = { stadt: 15, markt: 8, abtei: 6, halle: 6, dorf: 3, burg: 10 };

const K = 4;                 // Rastergröße in Kacheln
// Reichweite in Rastern: in England und Wales bis rund 160 km (auch Devon und Cornwall), auf dem Festland rund
// 115 km (Flandern und die Bretagne bleiben eigene Herrschaften)
const SHIRE_REACH = { en: 50 * 10, wa: 50 * 10, nd: 36 * 10, fr: 36 * 10, sc: 50 * 10, ir: 50 * 10 };

// Schottland (grob: nördlich von Solway und Tweed) hat eigene Grafschaften: Die Grenze trennt sie von den englischen
function scotland(lon, lat) {
  if (lon < -3.3) return lat > 54.6;
  if (lon < -3.05) return lat > 54.95;
  if (lon < -2.0) return lat > 54.98 + (lon + 3.05) * 0.7;
  return lat > 55.74;
}

// Raster der Grafschaften: Flutung über Land von allen Sitzen zugleich (Kosten 10 gerade, 14 schräg)
export function buildShires(W) {
  if (W.shireGrid) return;
  const N = W.N, S = Math.ceil(N / K);
  const seats = W.sites.filter((s) => s.type === 'burg' && SHIRES[s.id]);
  const grid = new Uint8Array(S * S), cost = new Int32Array(S * S).fill(1 << 30), orig = new Uint8Array(S * S);
  const land = new Int32Array(S * S);
  const york = W.sites.find((s) => s.id === 'york'), gbLand = york ? landAt(W, york.x, york.y) : 0;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = i * K + K / 2, y = j * K + K / 2;
    const l = landAt(W, x, y);
    if (!l) continue;
    const lon = GEO.lonW + x * GEO.dLon, lat = GEO.latN - y * GEO.dLat;
    // Schottische Felder bekommen eine eigene Nummer: Englische Sitze greifen nicht über die Grenze und umgekehrt
    land[j * S + i] = l === gbLand && scotland(lon, lat) ? -l : l;
  }
  const buckets = [];
  const push = (c, v, k) => { (buckets[c] || (buckets[c] = [])).push(v, k); };
  seats.forEach((s, n) => {
    s.landSeat = landAt(W, s.x, s.y);
    if (s.realm === 'sc') s.landSeat = -s.landSeat;
    // Weitere Ausgangspunkte: Das Umland von York (das Ainsty) gehört zum West Riding
    const from = [s, ...(SHIRES[s.id].also || []).map((id) => W.sites.find((o) => o.id === id)).filter(Boolean)];
    from.forEach((o, q) => {
      const i = Math.floor(o.x / K), j = Math.floor(o.y / K), v = j * S + i;
      cost[v] = 0; grid[v] = n + 1; orig[v] = q ? 1 : 0; push(0, v, n + 1);
    });
  });
  // Schritte je Sitz: Ein Gewicht unter 1 macht die Grafschaft größer (das West Riding reicht bis York)
  const steps = seats.map((s) => { const f = SHIRES[s.id].weight || 1; return [Math.round(10 * f), Math.round(14 * f)]; });
  // Die Reichweite bleibt dieselbe Strecke, auch wenn das Gewicht die Schritte verbilligt
  const reach = seats.map((s) => Math.round((SHIRE_REACH[s.realm] || 360) * (SHIRES[s.id].weight || 1)));
  const maxReach = Math.max(...reach);
  const nb = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [1, 1, 1], [1, -1, 1], [-1, 1, 1], [-1, -1, 1]];
  for (let c = 0; c <= maxReach; c++) {
    const b = buckets[c];
    if (!b) continue;
    for (let q = 0; q < b.length; q += 2) {
      const v = b[q], k = b[q + 1];
      if (cost[v] !== c || grid[v] !== k) continue;
      const i = v % S, j = (v - i) / S, home = seats[k - 1].landSeat;
      for (const [di, dj, diag] of nb) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= S || nj >= S) continue;
        const u = nj * S + ni, nc = c + steps[k - 1][diag];
        // Ein weiterer Ausgangspunkt (York) nimmt nur sein Umland, rund 30 km
        if (nc > reach[k - 1] || (orig[v] && nc > 90) || land[u] !== home || nc >= cost[u]) continue;
        cost[u] = nc; grid[u] = k; orig[u] = orig[v]; push(nc, u, k);
      }
    }
  }
  W.shireGrid = grid; W.shireS = S; W.shireSeats = seats.map((s) => s.id);
  // Mitte jeder Grafschaft (für die Beschriftung) und Zuordnung der Orte
  const sum = seats.map(() => ({ x: 0, y: 0, n: 0 }));
  for (let v = 0; v < grid.length; v++) if (grid[v]) { const a = sum[grid[v] - 1], i = v % S; a.x += i; a.y += (v - i) / S; a.n++; }
  W.shireMid = {};
  seats.forEach((s, n) => { const a = sum[n]; W.shireMid[s.id] = a.n ? { x: (a.x / a.n + 0.5) * K, y: (a.y / a.n + 0.5) * K, cells: a.n } : { x: s.x, y: s.y, cells: 0 }; });
  W.shireOf = {};
  for (const s of W.sites) {
    const k = shireAt(s.x, s.y, W);
    if (k) W.shireOf[s.id] = k;
  }
  W.shireOf.ashcombe = HOME_SHIRE;
}

export function shireAt(x, y, W = G.world) {
  if (!W.shireGrid) buildShires(W);
  const i = Math.floor(x / K), j = Math.floor(y / K), S = W.shireS;
  if (i < 0 || j < 0 || i >= S || j >= S) return null;
  const k = W.shireGrid[j * S + i];
  return k ? W.shireSeats[k - 1] : null;
}
export function shireOfSite(site) {
  const W = G.world;
  if (!W.shireGrid) buildShires(W);
  return W.shireOf[site.id] || null;
}
export function shireName(id) { return SHIRES[id] ? SHIRES[id].name : ''; }
export function shireSites(id) { return G.world.sites.filter((s) => s.id !== id && shireOfSite(s) === id); }

// Besitz: im Spielstand, anfangs der Herr der Burg (Fraktion), später auch du
export function shireState() {
  const st = G.s.shires || (G.s.shires = {});
  for (const id of Object.keys(SHIRES)) {
    if (st[id]) continue;
    const seat = G.world.sites.find((s) => s.id === id);
    st[id] = { owner: seat ? seat.faction : null };
  }
  return st;
}
export function shireOwner(id) { return (shireState()[id] || {}).owner || null; }
export function ownedShires() { const st = shireState(); return Object.keys(SHIRES).filter((id) => st[id].owner === 'spieler'); }
// Mehrspieler: Grafschaften eines anderen Menschen heißen 'p:<seine Grafschaft>'; Name und Farbe kennt mp.js (G.mpSeatInfo)
export function isHumanOwner(o) { return typeof o === 'string' && o.startsWith('p:'); }
function humanInfo(o) { return (G.mpSeatInfo && G.mpSeatInfo(o.slice(2))) || { name: `Herr von ${SHIRES[o.slice(2)] ? SHIRES[o.slice(2)].name : '?'}`, color: '#8a8070' }; }
export function ownerPhrase(o) { return o === 'spieler' ? 'in deiner Hand' : isHumanOwner(o) ? `in der Hand von ${humanInfo(o).name}` : isBaronOwner(o) && BARONS[ownerBaron(o)] ? `in der Hand von ${BARONS[ownerBaron(o)].name}` : o && FACTIONS[o] ? `in der Hand der ${FACTIONS[o].short}` : 'herrenlos'; }
export function ownerName(o) { return o === 'spieler' ? `${G.s && G.s.seat ? G.s.player.name : homeName()} (du)` : isHumanOwner(o) ? humanInfo(o).name : isBaronOwner(o) && BARONS[ownerBaron(o)] ? BARONS[ownerBaron(o)].name : o && FACTIONS[o] ? FACTIONS[o].short : 'niemand'; }
export function ownerColor(o) { return o === 'spieler' ? playerColor() : isHumanOwner(o) ? humanInfo(o).color : isBaronOwner(o) ? baronColor(ownerBaron(o)) : o && FACTIONS[o] ? FACTIONS[o].color : '#8a8070'; }

// Abgaben einer Grafschaft am Tag (Grundbetrag und je Ort)
export function shireTax(id) {
  let g = 10;
  for (const s of shireSites(id)) g += TAX[s.type] || 0;
  return g + (SHIRES[id].gold || 0);
}
// Für die Tagesabrechnung der Burg
export function shireIncome() { return ownedShires().map((id) => [`Abgaben ${SHIRES[id].name}`, shireTax(id)]); }
export function shireGoods() {
  const out = {};
  for (const id of ownedShires()) for (const [g, n] of Object.entries(SHIRES[id].goods || {})) out[g] = (out[g] || 0) + n;
  return out;
}
export function shireDef() { return ownedShires().reduce((a, id) => a + (SHIRES[id].def || 0), 0); }
export function shireRenown() { return ownedShires().reduce((a, id) => a + (SHIRES[id].ruhm || 0), 0); }
export function shireFerryFactor() { return ownedShires().reduce((a, id) => Math.min(a, SHIRES[id].faehre ?? 1), 1); }
export function ownsHomeShire() { return shireOwner(HOME_SHIRE) === 'spieler'; }

// Grafschaft übernehmen (Eroberung, Testmodus)
// quiet: ohne Meldung (Mehrspieler-Start). Ein Gast meldet den Wechsel dem Gastgeber (G.onClaimShire, mp.js).
export function claimShire(id, who = 'spieler', quiet = false) {
  const st = shireState();
  if (!st[id] || st[id].owner === who) return;
  st[id].owner = who;
  G.shireTint = null;
  if (G.onClaimShire) G.onClaimShire(id, who);
  if (quiet) return;
  if (who === 'spieler') log(`Du beherrschst jetzt die Grafschaft ${SHIRES[id].name}. ${SHIRES[id].text}`, 'gold');
  else log(`${SHIRES[id].name} fällt an ${ownerName(who)}.`);
}

// ---------------------------------------------------------------- Karte
// Farbe der Herren als zarte Fläche, Grenzen als Linie, Namen in der Mitte. v: Ausschnitt aus drawMap.
function tintCanvas(W) {
  const key = Object.keys(SHIRES).map((id) => shireOwner(id)).join(',') + playerColor();
  if (G.shireTint && G.shireTint.key === key) return G.shireTint.cv;
  const S = W.shireS, cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const c = cv.getContext('2d'), img = c.createImageData(S, S);
  const cols = W.shireSeats.map((id) => { const h = ownerColor(shireOwner(id)).replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });
  for (let v = 0; v < S * S; v++) {
    const k = W.shireGrid[v];
    if (!k) continue;
    const [r, g, b] = cols[k - 1];
    img.data[v * 4] = r; img.data[v * 4 + 1] = g; img.data[v * 4 + 2] = b; img.data[v * 4 + 3] = 75;
  }
  c.putImageData(img, 0, 0);
  G.shireTint = { key, cv };
  return cv;
}
function borderPath(W) {
  if (W.shireBorder) return W.shireBorder;
  const S = W.shireS, g = W.shireGrid, p = new Path2D();
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const a = g[j * S + i];
    if (i + 1 < S) { const b = g[j * S + i + 1]; if (a !== b && (a || b)) { p.moveTo((i + 1) * K, j * K); p.lineTo((i + 1) * K, (j + 1) * K); } }
    if (j + 1 < S) { const b = g[(j + 1) * S + i]; if (a !== b && (a || b)) { p.moveTo(i * K, (j + 1) * K); p.lineTo((i + 1) * K, (j + 1) * K); } }
  }
  W.shireBorder = p;
  return p;
}
export function drawShires(c, v) {
  const W = G.world;
  if (typeof Path2D === 'undefined') return;
  if (!W.shireGrid) buildShires(W);
  const N = W.N;
  c.save();
  c.imageSmoothingEnabled = true;
  c.drawImage(tintCanvas(W), v.dx - v.ox * v.s, v.dy - v.oy * v.s, N * v.s, N * v.s);
  c.translate(v.dx - v.ox * v.s, v.dy - v.oy * v.s); c.scale(v.s, v.s);
  const path = borderPath(W);
  c.strokeStyle = 'rgba(250,236,200,0.45)'; c.lineWidth = 3.2 / v.s; c.stroke(path);
  c.strokeStyle = 'rgba(70,22,12,0.85)'; c.lineWidth = 1.5 / v.s; c.setLineDash([5 / v.s, 3 / v.s]);
  c.stroke(path);
  c.restore();
  // Namen: nur wenn die Grafschaft groß genug zu sehen ist
  c.save();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const fs = Math.max(10, Math.min(15, 9 + v.s * 2.2));
  c.font = `600 ${fs}px "IM Fell English SC", "Alegreya", Georgia, serif`;
  if ('letterSpacing' in c) c.letterSpacing = '1px';
  // Ortsnamen stehen über und unter ihrem Ort: Der Name der Grafschaft weicht ihnen aus
  const pts = W.sites.map((o) => ({ x: v.dx + (o.x - v.ox) * v.s, y: v.dy + (o.y - v.oy) * v.s, w: o.name.length * 3.6 + 8 }));
  const free = (x, y, tw) => pts.every((p) => Math.abs(p.x - x) > tw / 2 + p.w || Math.abs(p.y - y) > 17);
  const tries = [[0, 0], [0, 18], [0, -18], [0, 34], [0, -34], [46, 8], [-46, 8], [60, 24], [-60, 24]];
  for (const id of W.shireSeats) {
    const m = W.shireMid[id];
    if (!m || m.cells < 6) continue;
    const x0 = v.dx + (m.x - v.ox) * v.s, y0 = v.dy + (m.y - v.oy) * v.s + 10;
    const name = SHIRES[id].name, tw = c.measureText(name).width;
    const [ox, oy] = tries.find(([dx, dy]) => free(x0 + dx, y0 + dy, tw)) || [0, 0];
    const x = x0 + ox, y = y0 + oy;
    const own = shireOwner(id);
    c.lineWidth = 3.5; c.strokeStyle = 'rgba(248,238,214,0.9)'; c.strokeText(name, x, y);
    c.fillStyle = own === 'spieler' ? '#1f3f7a' : '#6a1f12'; c.fillText(name, x, y);
  }
  c.restore();
}
