// Die eigene Burg: Ausbau, Produktion, Anwerben, Garnison, Überfälle.

import { G, log, homeName } from './state.js';
import { BUILDINGS, CLASSES, GOOD_IDS, GOODS, DAY_LEN, CASTLE_BONUS, FOOD_GOODS, FOOD_PRICE, T, CASTLE_LAYOUT, CASTLE_TOWERS, CASTLE_KEEP, MAP_K } from './data.js';
import { rand, randInt, pick, mulberry32 } from './rng.js';
import { makeUnit, randomName, partyMembers, rebuildUnits, placeNear, computeStats, grantXp, spawnPeasants } from './units.js';
import { isAlly, alliesCount, addRenown, changeRep, isHostileFaction } from './politics.js';
import { cargoUsed } from './economy.js';
import { setPlayerWalls, tileAt } from './world.js';
import { seasonIndex } from './sim.js';
import { refreshCastleHerd } from './animals.js';
import { startSiege, homeGateClosed } from './siege.js';
import { cheatOn } from './cheats.js';
import { SHIRES, ownedShires, shireGoods, shireDef, shireRenown, ownsHomeShire } from './shires.js';
import { holdingIncome, holdingCosts, holdingGoods } from './holdings.js';
import { CASTLE_TYPES, OUTER_ONLY, STACKABLE, castleType, ringR, plotLayout } from './plots.js';
import { artKnown } from './assets.js';

export function castleSite() { return G.world.sites.find((s) => s.type === 'spieler'); }
// Mehrspieler: Die Welt hat keine Heimburg; jeder sitzt auf der Burg seiner Grafschaft (G.s.seat). Dort sind Lager,
// Rittersaal und Garnison. homeBase ist, wo du zu Hause bist: die Heimburg, sonst diese Burg.
export function seatSite() { return (G.s && G.s.seat && G.world && G.world.sites.find((s) => s.id === G.s.seat)) || null; }
export function homeBase() { return castleSite() || seatSite(); }
export function isHomeBase(s) { return !!s && (s.type === 'spieler' || (s === seatSite() && !castleSite())); }
// Was die Burg einer Grafschaft schon mitbringt (ohne Bauplätze)
const SEAT_LEVELS = { halle: 2, kaserne: 2, schmiede: 1, stall: 1 };

// ---------------------------------------------------------------- Bauplätze (plots.js)
// Gebäude je Platz: { id, lv, dmg } oder null. Ein alter Spielstand (eine Stufe je Gebäude) zieht beim ersten Blick
// auf eine Turmburg um: Werkstätten und Unterkünfte in den Hof, Land, Markt und Türme davor.
function freePlotFor(id, lay, plots) {
  const wantInner = !OUTER_ONLY[id] && id !== 'wehr' && id !== 'markt';
  const ok = lay.filter((p) => !plots[p.i] && !(OUTER_ONLY[id] && p.inner));
  const pref = ok.find((p) => p.inner === wantInner);
  return pref ? pref.i : ok.length ? ok[0].i : -1;
}
export function castlePlots() {
  const C = G.s.castle;
  if (!CASTLE_TYPES[C.type]) C.type = 'turm';
  const site = castleSite();
  if (!site) return [];
  const lay = plotLayout(site, C.type);
  if (!C.plots) {
    C.plots = lay.map(() => null);
    for (const id of ['halle', 'kaserne', 'schmiede', 'stall', 'kapelle', 'hospiz', 'markt', 'wehr', 'holzfaeller', 'steinbruch', 'felder', 'schafzucht']) {
      const L = (C.b && C.b[id]) || 0;
      if (!L) continue;
      const i = freePlotFor(id, lay, C.plots);
      if (i >= 0) C.plots[i] = { id, lv: L };
    }
  }
  while (C.plots.length < lay.length) C.plots.push(null);
  if (C.plots.length > lay.length) C.plots.length = lay.length;
  return C.plots;
}
export function castleLayout() { const s = castleSite(); return s ? plotLayout(s, castleType()) : []; }
// Belagert? Dann ruht die Arbeit vor der Mauer
export function homeBesieged() { return !!(G.siege && G.siege.site && G.siege.site.type === 'spieler' && G.siege.stage !== 'anmarsch'); }
function working(p, lay) { return !!p && !p.dmg && !(homeBesieged() && !lay.inner); }
// Höchste arbeitende Stufe eines Gebäudes (der Bergfried: Burgstufe)
export function bLevel(id) {
  if (id === 'burg') return G.s.castle.level;
  if (!castleSite()) return SEAT_LEVELS[id] || 0;
  const plots = castlePlots(), lay = castleLayout();
  let m = 0;
  for (let i = 0; i < plots.length; i++) { const p = plots[i]; if (p && p.id === id && working(p, lay[i]) && p.lv > m) m = p.lv; }
  return m;
}
// Gebaute Stufe, auch abgebrannt (für Tafeln)
export function bBuilt(id) { return castlePlots().reduce((a, p) => (p && p.id === id ? Math.max(a, p.lv) : a), 0); }
// Alle arbeitenden Gebäude einer Art
export function workingPlots(id) {
  const plots = castlePlots(), lay = castleLayout(), out = [];
  for (let i = 0; i < plots.length; i++) { const p = plots[i]; if (p && p.id === id && working(p, lay[i])) out.push({ i, lv: p.lv, plot: lay[i] }); }
  return out;
}
// Summe über alle arbeitenden Gebäude einer Art, nach einer Tabelle je Stufe
export function bSum(id, table) { return workingPlots(id).reduce((a, w) => a + (table ? table[w.lv] : w.lv), 0); }
export function castleTypeName() { return CASTLE_TYPES[castleType()].name; }

// Baufortschritt 0..1 der laufenden Baustelle
export function conProgress() {
  const c = G.s.castle.construction;
  if (!c) return 0;
  const days = c.days || (c.id === 'burg' ? BUILDINGS.burg.levels[c.level] : BUILDINGS[c.id] ? BUILDINGS[c.id].levels[c.level] : null)?.days || 1;
  return Math.max(0, Math.min(1, (G.s.day - (c.done - days) + G.s.time / DAY_LEN) / days));
}

// Häuser der Burgsiedlung je Burgstufe
export function villageHouses() { return [0, 2, 5, 9][G.s.castle.level]; }

// Häuser der Burgsiedlung rund um die Burg (fest je Welt), gezeichnet in render.js
export function villageSpots(s) {
  const type = castleType(), key = `villageSpots_${type}`;
  if (s[key]) return s[key];
  const W = G.world;
  const r = mulberry32(W.seed + 991);
  const R = ringR(type);
  // Die Häuser stehen zwischen und hinter den Bauplätzen, nie auf ihnen und nie vor dem Tor
  const lay = plotLayout(s, type);
  const onPlot = (x, y) => lay.some((p) => Math.abs(p.x - x) < p.size / 2 + 0.8 && Math.abs(p.y - y) < p.size / 2 + 0.8);
  const spots = [];
  for (let tries = 0; tries < 1500 && spots.length < 9; tries++) {
    const a = r() * Math.PI * 2, d = R + 3 + r() * 9;
    const x = Math.floor(s.x + Math.cos(a) * d) + 0.5, y = Math.floor(s.y + Math.sin(a) * d) + 0.5;
    const t = tileAt(W, x, y);
    if (t === T.WATER || t === T.ROAD || t === T.BRIDGE || t === T.FOREST) continue;
    if (Math.max(Math.abs(x - s.x), Math.abs(y - s.y)) < R + 2) continue;
    if (y - s.y > R && Math.abs(x - s.x) < 2.5) continue;
    if (onPlot(x, y)) continue;
    if (spots.some((o) => Math.hypot(o.x - x, o.y - y) < 1.9)) continue;
    const b = { kind: 'house', x, y, wx: 0.9 + r() * 0.4, wy: 0.8 + r() * 0.3, h: (13 + r() * 6) * 1.6, rh: (11 + r() * 5) * 1.5, wall: r() < 0.6 ? 'timber' : 'plaster', roof: 'thatch', chimney: r() < 0.6, lit: true, v: r() };
    if (r() < 0.6) b.prop = { prop: ['heu', 'holzstapel', 'fass', 'beet'][Math.floor(r() * 4)], x: x + 0.75, y: y + (r() - 0.5) * 0.6, v: r() };
    spots.push(b);
  }
  s[key] = spots;
  spots.forEach((b, k) => { b.idx = `v${k}`; const d = G.s && G.s.damage && G.s.damage[b.idx]; if (d) b.dmg = d; });
  return spots;
}

// Grundflächen der Burg, so wie render.js sie zeichnet: Bergfried, fertige Gebäude mit Nebengebäuden,
// Wachtürme, Marktstände, die Häuser der Burgsiedlung und die eingezäunten Pferche (pen: Tiere dürfen hinein).
// Dort geht niemand hindurch; Äcker und Wege bleiben frei.
export function castleObstacles() {
  const s = castleSite(), C = G.s.castle, out = [];
  if (!s) return out;
  const k = CASTLE_KEEP[C.level];
  out.push({ x: s.x + k.dx, y: s.y + k.dy, wx: k.w, wy: k.w, pen: false });
  const plots = castlePlots(), lay = castleLayout();
  for (let i = 0; i < plots.length; i++) if (plots[i]) for (const [x, y, wx, wy, pen] of plotRects(plots[i].id, plots[i].lv, lay[i])) out.push({ x, y, wx, wy, pen: !!pen });
  for (const b of villageSpots(s).slice(0, villageHouses())) out.push({ x: b.x, y: b.y, wx: b.wx, wy: b.wy, pen: false });
  return out;
}

// Feste Teile eines Gebäudes auf seinem Platz (wie render.js es zeichnet): [x, y, Breite, Tiefe, Pferch]
// Innen (Platz 2 × 2) stehen die Gebäude enger und ohne Nebenanlagen.
// Gemalte Gebäude (Paket 6): Grundfläche der Hauptgebäude je Gebäude, Platz (2 = Hof, 3 = vor der Mauer) und Stufe,
// relativ zur Platzmitte [x, y, Breite x, Breite y]; Höfe, Äcker und Kleinkram bleiben begehbar, Pferche sind Weiden
const EIGEN_RECTS = {
  'halle|3': [[-0.78, -0.64, 1.09, 1.38], [-0.71, -0.56, 1.23, 1.56], [-0.85, -0.38, 1.3, 1.95]],
  'kaserne|3': [[-0.86, -0.74, 1.44, 1.14], [-0.8, -0.45, 1.2, 1.7], [-0.8, -0.37, 1.22, 1.86]],
  'schmiede|3': [[-0.7, -0.6, 1.0, 1.0], [-0.75, -0.65, 1.3, 1.2], [-0.63, -0.73, 1.48, 1.38]],
  'stall|3': [[-0.91, -0.65, 0.92, 1.45], [-0.9, -0.6, 1.1, 1.6], [-1.0, -0.4, 0.9, 2.0]],
  'holzfaeller|3': [[-0.7, -0.75, 1.1, 1.1], [-0.7, -0.75, 1.1, 1.1], [-0.75, -0.55, 1.2, 1.7]],
  'steinbruch|3': [[-0.89, -0.86, 1.38, 1.12], [-0.8, -0.85, 1.4, 1.3], [-0.75, -0.75, 1.5, 1.5]],
  'markt|3': [[-0.55, -0.55, 1.0, 0.7], [-0.5, -0.5, 1.3, 1.3], [-0.6, -0.6, 1.4, 1.4]],
  'kapelle|3': [[-0.5, -0.5, 0.3, 0.3], [-0.55, -0.5, 1.3, 0.9], [-0.61, -0.7, 1.59, 1.64]],
  'hospiz|3': [[-0.75, -0.95, 1.0, 0.9], [-0.78, -0.84, 1.09, 1.27], [-0.46, -0.88, 1.9, 1.2]],
  'schafzucht|3': [[-0.8, -0.9, 1.1, 1.0], [-0.75, -0.85, 1.1, 1.0], [-0.85, -0.75, 1.2, 1.4]],
  'felder|3': [[-0.7, -0.9, 0.8, 0.8], [-0.75, -0.8, 1.1, 1.1], [-0.7, -0.75, 1.2, 1.5]],
  'halle|2': [[-0.02, -0.03, 1.09, 1.38], [-0.09, -0.05, 1.25, 1.55], [-0.3, -0.05, 1.3, 1.9]],
  'kaserne|2': [[-0.22, -0.11, 1.44, 1.34], [-0.1, -0.02, 1.02, 1.86], [-0.23, -0.06, 1.19, 1.91]],
  'schmiede|2': [[-0.1, 0.0, 1.1, 1.1], [-0.2, 0.03, 1.27, 1.06], [-0.11, -0.18, 1.5, 1.33]],
  'stall|2': [[-0.04, -0.02, 0.92, 1.45], [-0.11, -0.03, 1.09, 1.56], [-0.2, -0.05, 0.97, 1.9]],
  'markt|2': [[-0.2, -0.2, 1.0, 0.8], [-0.27, -0.3, 1.44, 1.31], [-0.32, -0.38, 1.48, 1.05]],
  'kapelle|2': [[0, 0, 0.3, 0.3], [-0.1, -0.1, 1.2, 0.9], [-0.14, -0.15, 1.66, 1.42]],
  'hospiz|2': [[0, -0.15, 1.2, 0.8], [-0.17, -0.2, 1.09, 1.27], [0, -0.3, 1.8, 1.2]],
};
// Weide im gemalten Pferch der Schafzucht (Stufe 1 und 2 rechts, Stufe 3 vor dem Stall)
const EIGEN_PEN = [null, [0.69, -0.77, 1.6, 1.6], [0.69, -0.77, 1.6, 1.6], [0.45, 0.2, 1.9, 2.4]];
export const eigenPainted = (id, L, p) => !!EIGEN_RECTS[`${id}|${p.size < 3 ? 2 : 3}`] && artKnown(`eigen_rittersaal_1`);
export function plotRects(id, L, p) {
  const c = p.size < 3, x = p.x, y = p.y;
  if (eigenPainted(id, L, p)) {
    const [dx, dy, wx, wy] = EIGEN_RECTS[`${id}|${c ? 2 : 3}`][L - 1], r = [[x + dx, y + dy, wx, wy]];
    if (id === 'schafzucht') { const pa = pastureOf(L, p); r.push([pa.x, pa.y, pa.w, pa.h, true]); }
    return r;
  }
  switch (id) {
    case 'halle': return [[x, y, 1.2 + L * 0.1, c ? 1.8 : [0, 2.2, 2.4, 2.6][L]]];
    case 'kaserne': return c ? [[x, y, 1.8, 1.0]] : [[x, y - 0.7, [0, 2.0, 2.4, 2.6][L], L === 3 ? 1.2 : 1.0], [x - 0.1, y + 0.75, 2.0, 1.1, true]];
    case 'schmiede': return L === 1 ? [[x, y, 1.1, 1.0], [x + 0.75, y - 0.1, 0.4, 0.4]] : [[x, y, c ? 1.4 : L === 2 ? 1.4 : 1.7, L === 2 ? 1.2 : 1.4]];
    case 'stall': return c ? [[x, y, 1.1 + L * 0.05, 1.8]] : [[x - 0.6, y, 1.1 + L * 0.05, [0, 2.0, 2.6, 2.8][L]], [x + 0.75, y + 0.1, 1.3, 2.6, true]];
    case 'holzfaeller': { const r = [[x - 0.4, y - 0.4, 1.0, 0.9], [x + 0.7, y + 0.42, 1.0, 0.62]]; if (L === 3) r.push([x + 0.7, y - 0.95, 0.9, 0.9]); return r; }
    case 'steinbruch': return [[x, y - 0.3, 2.0, 1.6]];
    case 'markt': {
      const r = [], n = c ? [0, 2, 2, 3][L] : [0, 2, 4, 6][L];
      for (let k = 0; k < n; k++) r.push(c ? [x - 0.5 + (k % 2) * 1.0, y - 0.4 + Math.floor(k / 2) * 1.0, 0.8, 0.6] : [x - 0.95 + (k % 3) * 0.95, y - 0.75 + Math.floor(k / 3) * 1.25, 0.8, 0.6]);
      if (!c && L >= 2) r.push([x + 1.05, y + 1.05, 0.6, 0.6]);
      return r;
    }
    case 'kapelle': return [[x, y, c ? Math.min(1.8, [0, 1.6, 2.0, 2.6][L]) : [0, 1.6, 2.0, 2.6][L], [0, 1.0, 1.0, 1.2][L]]];
    case 'hospiz': {
      const h = [null, [0.2, -0.3, 1.3, 1.1], [0.3, -0.2, 1.2, 2.0], [0.3, -0.2, 1.4, 2.3]][L];
      const r = [[x + (c ? 0 : h[0]), y + (c ? 0 : h[1]), h[2], c ? Math.min(1.8, h[3]) : h[3]]];
      if (!c && L >= 2) r.push([x - 1.0, y - 1.05, 0.6, 0.6]);
      return r;
    }
    case 'schafzucht': {
      const pa = pastureOf(L, p), r = [[x - 0.95, y - 1.0, L === 3 ? 1.0 : 0.85, L === 3 ? 0.9 : 0.75], [pa.x, pa.y, pa.w, pa.h, true]];
      if (L >= 2) r.push([x + 0.85, y - 1.05, 0.9, 0.8]);
      return r;
    }
    case 'felder': { const r = [L === 1 ? [x - 1.0, y - 1.0, 0.8, 0.7] : [x - 0.95, y - 1.0, 0.95, 0.8]]; if (L === 3) r.push([x + 1.05, y - 1.05, 0.75, 0.62]); return r; }
    case 'wehr': return [[x, y, 0.9, 0.9]];
    default: return [];
  }
}
// Weide einer Schafzucht auf ihrem Platz
export function pastureOf(L, p) {
  if (eigenPainted('schafzucht', L, p)) { const [dx, dy, w, h] = EIGEN_PEN[L]; return { x: p.x + dx, y: p.y + dy, w, h }; }
  return { x: p.x + 0.35, y: p.y + 0.35, w: [0, 1.7, 2.0, 2.2][L], h: [0, 1.6, 1.9, 2.1][L] };
}

// Mauern und Burggebäude neu eintragen (nach Ausbau, Laden, Schummeln)
export function refreshCastleBlock() {
  setPlayerWalls(G.world, G.s.castle.level >= 1, castleObstacles(), ringR());
}

export function levelName() { return BUILDINGS.burg.levels[G.s.castle.level].name; }

export function partyCap() { return 2 + bLevel('kaserne') * 2 + (G.s.castle.level >= 3 ? 2 : 0); }

export function cargoCap() { return 20 + bLevel('stall') * 20 + partyMembers().length * 4; }

export function haveMaterial(m) { return (G.s.castle.storage[m] || 0) + (G.s.cargo[m] || 0); }

// Was kostet der nächste Schritt? id: Gebäude (oder 'burg' für den Bergfried), i: Bauplatz
export function buildInfo(id, i = null) {
  const def = BUILDINGS[id];
  const res = { id, def, cur: 0, next: 1, lv: null, ok: false, reasons: [], plot: i };
  if (id === 'burg') res.cur = G.s.castle.level;
  else {
    const plots = castlePlots(), lay = castleLayout(), here = i !== null ? plots[i] : null;
    if (i === null || !lay[i]) { res.reasons.push('Kein Bauplatz'); return res; }
    if (here && here.id !== id) { res.reasons.push('Der Platz ist belegt'); return res; }
    res.cur = here ? here.lv : 0;
    if (OUTER_ONLY[id] && lay[i].inner) res.reasons.push('Braucht Land vor der Mauer');
    if (!res.cur && !STACKABLE[id] && plots.some((q) => q && q.id === id)) res.reasons.push('Gibt es schon in deiner Burg');
    if (here && here.dmg) res.reasons.push('Erst ausbessern');
  }
  res.next = res.cur + 1;
  const lv = def.levels[res.next];
  res.lv = lv;
  if (!lv) { res.reasons.push('Höchste Stufe erreicht'); return res; }
  const c = G.s.castle.construction;
  if (c) res.reasons.push('Die Baumeister sind beschäftigt');
  if (id !== 'burg' && res.next > G.s.castle.level + 1) res.reasons.push(`Braucht zuerst ${BUILDINGS.burg.levels[res.next - 1].name}`);
  if (lv.need) {
    if (lv.need.renown && G.s.renown < lv.need.renown) res.reasons.push(`Braucht ${lv.need.renown} Ruhm`);
    if (lv.need.allies && alliesCount() < lv.need.allies) res.reasons.push(`Braucht ${lv.need.allies} Verbündete`);
  }
  if (!payable(lv.cost)) res.reasons.push(lackText(lv.cost));
  res.ok = res.reasons.length === 0;
  return res;
}
function payable(cost) { return Object.entries(cost).every(([k, v]) => (k === 'gold' ? G.s.gold : haveMaterial(k)) >= v); }
function lackText(cost) { const k = Object.keys(cost).find((m) => (m === 'gold' ? G.s.gold : haveMaterial(m)) < cost[m]); return `Zu wenig ${k === 'gold' ? 'Gold' : GOODS[k].name}`; }
function pay(cost) {
  for (const [k, v] of Object.entries(cost)) {
    if (k === 'gold') { G.s.gold -= v; continue; }
    let need = v;
    const fromStore = Math.min(need, G.s.castle.storage[k] || 0);
    G.s.castle.storage[k] = (G.s.castle.storage[k] || 0) - fromStore;
    need -= fromStore;
    if (need > 0) G.s.cargo[k] -= need;
  }
}
function begin(con, label) {
  G.s.castle.construction = con;
  if (cheatOn('build')) { con.done = G.s.day; finishConstruction(); return true; }
  log(`Baubeginn: ${label}. Fertig an Tag ${con.done}.`, 'gold');
  G.castleDirty = true;
  return true;
}

export function startBuild(id, i = null) {
  const info = buildInfo(id, i);
  if (!info.ok) { log(info.reasons[0], 'bad'); return false; }
  pay(info.lv.cost);
  const con = { id, level: info.next, done: G.s.day + info.lv.days, days: info.lv.days };
  if (id !== 'burg') con.plot = i;
  return begin(con, id === 'burg' ? info.lv.name : `${info.def.name} Stufe ${info.next}`);
}

// Abgebrannt: Ausbessern kostet etwas Gold und Holz und einen Tag
export function repairCost(i) { const p = castlePlots()[i]; return p ? { gold: 20 + 25 * p.lv, holz: 6 * p.lv } : null; }
export function startRepair(i) {
  const p = castlePlots()[i];
  if (!p || !p.dmg) return false;
  if (G.s.castle.construction) { log('Die Baumeister sind beschäftigt.', 'bad'); return false; }
  const cost = repairCost(i);
  if (!payable(cost)) { log(lackText(cost), 'bad'); return false; }
  pay(cost);
  return begin({ id: p.id, level: p.lv, plot: i, repair: true, done: G.s.day + 1, days: 1 }, `${BUILDINGS[p.id].name} ausbessern`);
}

// Abreißen: Der Platz wird frei, das Gebäude ist fort (ohne Erstattung)
export function demolish(i) {
  const plots = castlePlots(), p = plots[i], c = G.s.castle.construction;
  if (!p) return false;
  if (c && c.plot === i) { log('Hier wird gerade gebaut.', 'bad'); return false; }
  plots[i] = null;
  log(`${BUILDINGS[p.id].name} abgerissen. Der Bauplatz ist frei.`);
  if (p.id === 'schafzucht') refreshCastleHerd();
  refreshCastleBlock();
  G.castleDirty = true;
  return true;
}

// Burgart wechseln: neuer Mauerring, andere Plätze. Solange nur die Ruine steht, ist es bloß ein Plan.
export function typeChangeCost(type) {
  const L = G.s.castle.level;
  if (!L) return { gold: 0 };
  const big = CASTLE_TYPES[type].R > ringR();
  return { gold: 150 + L * (big ? 250 : 120), [L >= 2 ? 'stein' : 'holz']: (big ? 40 : 15) * L };
}
export function typeChangeDays(type) { return G.s.castle.level ? 1 + G.s.castle.level + (CASTLE_TYPES[type].R > ringR() ? 1 : 0) : 0; }
// Welche Gebäude passen nach dem Wechsel nicht mehr hin?
export function typeChangeLosses(type) {
  if (!castleSite()) return [];
  const plots = castlePlots(), lay = castleLayout(), nlay = plotLayout(castleSite(), type);
  const free = { in: nlay.filter((p) => p.inner).length, out: nlay.filter((p) => !p.inner).length };
  const lost = [];
  // Erst was nach draußen muss, dann der Rest, innen zuerst
  const list = plots.map((p, i) => ({ p, inner: lay[i].inner })).filter((e) => e.p);
  for (const e of list.filter((e) => OUTER_ONLY[e.p.id])) { if (free.out > 0) free.out--; else lost.push(e.p); }
  for (const e of list.filter((e) => !OUTER_ONLY[e.p.id])) {
    if (e.inner && free.in > 0) free.in--;
    else if (!e.inner && free.out > 0) free.out--;
    else if (free.in > 0) free.in--;
    else if (free.out > 0) free.out--;
    else lost.push(e.p);
  }
  return lost;
}
export function startTypeChange(type) {
  if (!CASTLE_TYPES[type] || type === castleType()) return false;
  if (G.s.castle.construction) { log('Die Baumeister sind beschäftigt.', 'bad'); return false; }
  const cost = typeChangeCost(type);
  if (!payable(cost)) { log(lackText(cost), 'bad'); return false; }
  pay(cost);
  if (!G.s.castle.level) { applyTypeChange(type); return true; }
  const days = typeChangeDays(type);
  return begin({ id: 'umbau', type, done: G.s.day + days, days }, `Umbau zur ${CASTLE_TYPES[type].name}`);
}
function applyTypeChange(type) {
  if (!castleSite()) return [];
  const C = G.s.castle, plots = castlePlots(), lay = castleLayout();
  const nlay = plotLayout(castleSite(), type), next = nlay.map(() => null);
  const lost = [];
  const place = (p, preferInner) => {
    const ok = nlay.filter((q) => !next[q.i] && !(OUTER_ONLY[p.id] && q.inner));
    const q = ok.find((o) => o.inner === preferInner) || ok[0];
    if (q) next[q.i] = p; else lost.push(p);
  };
  const list = plots.map((p, i) => ({ p, inner: lay[i].inner })).filter((e) => e.p);
  for (const e of list.filter((e) => OUTER_ONLY[e.p.id])) place(e.p, false);
  for (const e of list.filter((e) => !OUTER_ONLY[e.p.id])) place(e.p, e.inner);
  C.type = type; C.plots = next;
  log(`${homeName()} ist jetzt eine ${CASTLE_TYPES[type].name}.${lost.length ? ` Kein Platz mehr für: ${lost.map((p) => BUILDINGS[p.id].name).join(', ')}.` : ''}`, 'gold');
}

export function finishConstruction() {
  const c = G.s.castle.construction;
  if (!c || G.s.day < c.done) return;
  if (c.id === 'burg') {
    G.s.castle.level = c.level;
    log(`${homeName()} ist jetzt eine ${BUILDINGS.burg.levels[c.level].name}!`, 'gold');
    addRenown(5 * c.level);
    spawnPeasants();
    rebuildUnits();
  } else if (c.id === 'umbau') {
    applyTypeChange(c.type);
    spawnPeasants();
    rebuildUnits();
    refreshCastleHerd();
  } else {
    const plots = castlePlots();
    if (c.repair) {
      if (plots[c.plot]) plots[c.plot].dmg = 0;
      log(`Ausgebessert: ${BUILDINGS[c.id].name}.`, 'good');
    } else {
      plots[c.plot] = { id: c.id, lv: c.level };
      log(`Fertiggestellt: ${BUILDINGS[c.id].name} Stufe ${c.level}.`, 'gold');
      addRenown(1);
      if (c.id === 'halle' && !G.s.castle.recruits.length) refreshRecruits();
    }
    if (c.id === 'schafzucht') refreshCastleHerd();
  }
  G.s.castle.construction = null;
  refreshCastleBlock();
  G.castleDirty = true;
  G.celebrate = { id: c.id, level: c.level, plot: c.plot, type: c.type, t0: G.time };
}

// Vor der Mauer: Belagerer und Plünderer brennen Gebäude nieder (frac: Anteil)
export function burnOuterPlots(frac, by) {
  const plots = castlePlots(), lay = castleLayout(), hit = [];
  for (let i = 0; i < plots.length; i++) {
    const p = plots[i];
    if (!p || p.dmg || lay[i].inner || Math.random() >= frac) continue;
    p.dmg = 1; hit.push(BUILDINGS[p.id].name);
  }
  if (hit.length) {
    const cnt = {};
    for (const n of hit) cnt[n] = (cnt[n] || 0) + 1;
    const list = Object.entries(cnt).map(([n, k]) => (k > 1 ? `${k} × ${n}` : n)).join(', ');
    log(`Vor den Mauern gehen in Flammen auf: ${list} (${by}). Bessere sie aus, sonst bleiben sie nutzlos.`, 'bad');
    if (hit.includes(BUILDINGS.schafzucht.name)) refreshCastleHerd();
    G.castleDirty = true;
  }
  return hit.length;
}

// ---------------------------------------------------------------- Anwerben
export function refreshRecruits() {
  const hl = bLevel('halle');
  G.s.castle.recruits = [];
  if (!hl) return;
  const classes = ['bauer', 'knecht', 'schuetze', 'knecht', 'schuetze'];
  if (hl >= 2) classes.push('reisiger', 'reisiger');
  if (isAlly('waldleute')) classes.push('waldlaeufer', 'waldlaeufer');
  if (isAlly('franken')) classes.push('armbruster', 'armbruster');
  const n = 2 + hl;
  const lvMin = hl >= 3 ? 2 : 1;
  const lvMax = Math.min(7, 1 + hl + Math.floor(G.s.renown / 40));
  for (let k = 0; k < n; k++) {
    const cls = pick(classes);
    const nm = randomName();
    const level = randInt(lvMin, lvMax);
    const u = makeUnit({ kind: 'companion', cls, level, eq: { ...CLASSES[cls].start }, name: nm.name, female: nm.female, status: 'anwaerter' });
    u.cost = Math.round(CLASSES[cls].cost * (1 + (level - 1) * 0.35) * (isAlly('sachsen') ? 0.8 : 1));
    u.wage = CLASSES[cls].wage + (level - 1);
    G.s.castle.recruits.push(u);
  }
  G.s.castle.recruitDay = G.s.day;
}

export function hire(index) {
  const u = G.s.castle.recruits[index];
  if (!u) return;
  if (G.s.gold < u.cost) { log('Nicht genug Gold.', 'bad'); return; }
  G.s.gold -= u.cost;
  G.s.castle.recruits.splice(index, 1);
  const inField = partyMembers().length < partyCap();
  u.status = inField ? 'party' : 'garnison';
  G.s.companions.push(u);
  if (inField) placeNear(u, G.s.player.x, G.s.player.y, 1.5);
  log(`${u.name} (${CLASSES[u.cls].name}) steht jetzt in deinen Diensten${inField ? '' : ' und bleibt in der Garnison'}. Sold: ${u.wage} Gold am Tag.`, 'good');
  rebuildUnits();
}

export function setCompanionStatus(u, status) {
  if (status === 'party' && partyMembers().length >= partyCap()) { log(`Dein Gefolge ist voll (${partyCap()}). Baue die Unterkunft aus.`, 'bad'); return; }
  u.status = status;
  if (status === 'party') { u.dead = false; placeNear(u, G.s.player.x, G.s.player.y, 1.5); }
  rebuildUnits();
}

export function dismiss(u) {
  G.s.companions = G.s.companions.filter((c) => c !== u);
  for (const s of Object.values(u.eq)) if (s) G.s.inventory.push(s);
  log(`${u.name} verlässt deinen Dienst. Die Ausrüstung bleibt in deiner Truhe.`);
  rebuildUnits();
}

// ---------------------------------------------------------------- Kampfbonus und Verpflegung
// Innerhalb der eigenen Mauern (und am Tor) kämpfen du und dein Gefolge besser
export function castleBonusAt(x, y) {
  const s = castleSite();
  if (!s || Math.hypot(x - s.x, y - s.y) > ringR() + 2.5) return null;
  return CASTLE_BONUS[G.s.castle.level];
}

// Jeder Mund am Tisch braucht eine Ration am Tag: du und alle Gefährten
export function foodNeed() { return 1 + G.s.companions.length; }
export function foodStock() { return FOOD_GOODS.reduce((a, g) => a + (G.s.castle.storage[g] || 0), 0); }

const FIELD_SEASON = [0.5, 1, 1.5, 0];

// ---------------------------------------------------------------- Werte
export function castleDefense() {
  let d = [5, 25, 55, 90][G.s.castle.level] + (G.s.castle.level ? CASTLE_TYPES[castleType()].def : 0) + bSum('wehr', [0, 15, 35, 60]) + shireDef();
  for (const c of G.s.companions) if (c.status === 'garnison') d += (c.st.atk + c.st.def) * 1.5;
  if (isAlly('sachsen')) d += 20;
  if (isAlly('schotten')) d += 15;
  if (isAlly('iren')) d += 10;
  if (homeGateClosed()) d += 10;
  return Math.round(d);
}

export function dailyBalance() {
  const lvl = G.s.castle.level, home = !!castleSite();
  // Ohne Heimburg (Mehrspieler) leben Herr und Gefolge allein von den Grafschaften
  const income = home ? [
    ['Pacht der Bauern', 20 + lvl * 15],
    ['Marktgeld', homeGateClosed() ? 0 : [0, 15, 35, 60][bLevel('markt')]],
  ] : [];
  if (isAlly('gilde')) income.push(['Handelsanteile der Gilde', 15]);
  const mills = workingPlots('felder').filter((w) => w.lv >= 3).length;
  if (mills) income.push([mills > 1 ? `Mahlgeld der ${mills} Windmühlen` : 'Mahlgeld der Windmühle', 10 * mills]);
  // Eigene Grafschaften: Abgaben ihrer Orte, abzüglich dessen, was die Kastellane für ihre Burgen behalten
  for (const id of ownedShires()) income.push([`Abgaben ${SHIRES[id].name}`, holdingIncome(id)]);
  const costs = [];
  const wages = G.s.companions.reduce((a, c) => a + (c.wage || 0), 0);
  if (wages) costs.push(['Sold', wages]);
  costs.push(...holdingCosts());
  // Solange Prinz Johns Vogt in Pontefract sitzt, will er seinen Anteil
  if (home && !isAlly('normannen') && !ownsHomeShire()) costs.push(['Abgaben an den Vogt', 5 + lvl * 10]);
  // Erträge aller arbeitenden Gebäude zusammen (mehrere Holzfäller liefern mehrfach); vor der Mauer ruht bei
  // einer Belagerung die Arbeit, Abgebranntes liefert nichts
  const season = seasonIndex();
  const prod = {
    holz: bSum('holzfaeller', [0, 6, 12, 18]),
    stein: bSum('steinbruch', [0, 4, 8, 12]),
    getreide: Math.round(bSum('felder', [0, 6, 12, 18]) * FIELD_SEASON[season]),
    wolle: bSum('schafzucht', [0, 4, 8, 12]),
    fleisch: bSum('schafzucht', [0, 0, 2, 4]),
    felle: bSum('schafzucht', [0, 0, 0, 1]),
  };
  if (season === 3) { prod.holz = Math.floor(prod.holz / 2); prod.stein = Math.floor(prod.stein / 2); prod.wolle = Math.floor(prod.wolle / 2); }
  // Vorzüge eigener Grafschaften (Wolle aus dem West Riding, Caen-Stein …)
  for (const [g, n] of Object.entries(shireGoods())) prod[g] = (prod[g] || 0) + n;
  // Holz aus den Forsten eroberter Grafschaften (Vorgabe „Holz erzeugen“)
  for (const [g, n] of Object.entries(holdingGoods())) prod[g] = (prod[g] || 0) + n;
  // Verpflegung: was fehlt, kaufen die Knechte teuer zu
  const need = foodNeed();
  const avail = foodStock() + prod.getreide + prod.fleisch;
  const short = Math.max(0, need - avail);
  if (short) costs.push(['Zukauf von Nahrung', short * FOOD_PRICE]);
  return { income, costs, prod, food: { need, avail, short } };
}

// ---------------------------------------------------------------- Tageswechsel
export function dailyCastle() {
  finishConstruction();
  const bal = dailyBalance();
  const inc = bal.income.reduce((a, [, v]) => a + v, 0);
  G.s.gold += inc;
  const fame = shireRenown();
  if (fame) addRenown(fame);
  const costOf = (name) => (bal.costs.find(([n]) => n === name) || [0, 0])[1];
  const wages = costOf('Sold'), tax = costOf('Abgaben an den Vogt');
  // Lohn der Burgvögte in eroberten Burgen ohne Kastellan
  const stewards = bal.costs.filter(([n]) => n.startsWith('Burgvogt')).reduce((a, [, v]) => a + v, 0);
  if (stewards) G.s.gold = Math.max(0, G.s.gold - stewards);
  if (tax) {
    if (G.s.gold >= tax) G.s.gold -= tax;
    else { G.s.gold = 0; log('Du kannst die Abgaben nicht zahlen. Der Vogt ist verärgert.', 'bad'); changeRep('normannen', -4); }
  }
  if (wages) {
    if (G.s.gold >= wages) G.s.gold -= wages;
    else {
      G.s.gold = 0;
      const unpaid = G.s.companions.filter((c) => c.status !== 'verwundet');
      if (unpaid.length) {
        const u = pick(unpaid);
        G.s.companions = G.s.companions.filter((c) => c !== u);
        for (const s of Object.values(u.eq)) if (s) G.s.inventory.push(s);
        log(`Kein Sold! ${u.name} hat deinen Dienst verlassen.`, 'bad');
        rebuildUnits();
      }
    }
  }
  for (const [k, v] of Object.entries(bal.prod)) if (v) G.s.castle.storage[k] = (G.s.castle.storage[k] || 0) + v;

  // Verpflegung aus dem Burglager: erst Getreide, dann Fleisch, der Rest wird zugekauft
  let hungry = bal.food.need, eaten = 0;
  for (const g of FOOD_GOODS) {
    const k = Math.min(hungry, G.s.castle.storage[g] || 0);
    G.s.castle.storage[g] = (G.s.castle.storage[g] || 0) - k;
    hungry -= k; eaten += k;
  }
  let bought = 0;
  if (hungry > 0) {
    const cost = hungry * FOOD_PRICE;
    if (G.s.gold >= cost) { G.s.gold -= cost; bought = hungry; }
    else {
      G.s.gold = 0;
      log('Hunger in deinem Gefolge! Es fehlt an Brot und Fleisch. Alle sind geschwächt.', 'bad');
      for (const u of [G.s.player, ...partyMembers()]) u.hp = Math.max(1, Math.round(u.hp * 0.75));
    }
  }

  // Verwundete heilen: im Hospiz schneller
  const heal = (1 + bLevel('hospiz')) * (isAlly('kirche') ? 2 : 1);
  for (const c of G.s.companions) {
    if (c.status !== 'verwundet') continue;
    c.woundedDays -= heal;
    if (c.woundedDays <= 0) {
      c.status = 'garnison';
      c.dead = false;
      computeStats(c);
      c.hp = c.st.maxHp;
      log(`${c.name} ist genesen und wartet in der Garnison.`, 'good');
    }
  }
  // Übung der Garnison
  const train = [0, 6, 12, 18][bLevel('kaserne')];
  if (train) for (const c of G.s.companions) if (c.status === 'garnison') grantXp(c, train);

  // Kapelle und Kirche
  const kap = bLevel('kapelle');
  if (kap >= 3) addRenown(1);
  else if (kap >= 1 && G.s.day % 3 === 0) addRenown(1);
  if (kap >= 2 && G.s.day % 2 === 0) changeRep('kirche', 1);
  if (isAlly('kirche') && G.s.day % 2 === 0) addRenown(1);

  if (bLevel('halle') && G.s.day - G.s.castle.recruitDay >= 2) refreshRecruits();
  checkRaid();

  const parts = [`+${inc} Gold`];
  if (tax) parts.push(`−${tax} Abgaben`);
  if (wages) parts.push(`−${wages} Sold`);
  if (stewards) parts.push(`−${stewards} Burgvögte`);
  for (const [k, v] of Object.entries(bal.prod)) if (v) parts.push(`+${v} ${GOODS[k].name}`);
  parts.push(`${eaten + bought} Rationen gegessen${bought ? ` (${bought} zugekauft)` : ''}`);
  log(`Tag ${G.s.day} in ${homeName()}: ${parts.join(', ')}.`);
}

function checkRaid() {
  if (G.s.day < 5 || !castleSite()) return;
  const threats = [];
  // Feindliche Fraktionen mit Heeren belagern die Burg. Ab −60 (sehr feindlich) kommen sie öfter.
  for (const [f, by, army] of [['normannen', 'Normannische Truppen', 'heer_john'], ['sachsen', 'Sächsische Aufgebote', 'heer_richard']]) {
    if (!isHostileFaction(f)) continue;
    threats.push({ by, str: 40 + G.s.day * 3, chance: G.s.rep[f] <= -60 ? 0.35 : 0.2, army });
  }
  if (isHostileFaction('waldleute')) threats.push({ by: 'Waldleute', str: 25 + G.s.day * 2, chance: 0.15 });
  threats.push({ by: 'Raubgesindel', str: 12 + G.s.day * 1.6, chance: 0.07 });
  for (const t of threats) {
    if (Math.random() >= t.chance) continue;
    const home = castleSite(), p = G.s.player;
    if (t.army && !G.siege && !G.battle && G.s.day - (G.s.lastHomeSiege ?? -99) >= 3 && Math.hypot(home.x - p.x, home.y - p.y) < 100 * MAP_K && startSiege(home, t.army, Math.min(0.8, 0.35 + G.s.day * 0.02))) { G.s.lastHomeSiege = G.s.day; break; }
    const def = castleDefense();
    const strength = Math.round(t.str * rand(0.8, 1.2));
    if (def >= strength) {
      log(`${t.by} haben ${homeName()} angegriffen. Die Besatzung hat sie zurückgeschlagen (Verteidigung ${def} gegen ${strength}).`, 'good');
      addRenown(2);
      for (const c of G.s.companions) if (c.status === 'garnison') grantXp(c, 15);
    } else {
      const lostGold = Math.floor(G.s.gold * 0.15);
      G.s.gold -= lostGold;
      const lost = [];
      for (const g of GOOD_IDS) {
        const n = Math.floor((G.s.castle.storage[g] || 0) * 0.3);
        if (n > 0) { G.s.castle.storage[g] -= n; lost.push(`${n} ${GOODS[g].name}`); }
      }
      log(`${t.by} haben ${homeName()} überfallen (Verteidigung ${def} gegen ${strength})! Verloren: ${lostGold} Gold${lost.length ? ', ' + lost.join(', ') : ''}. Wachtürme und Garnison schützen.`, 'bad');
      burnOuterPlots(0.2, t.by);
    }
    break;
  }
}

// Ware zwischen Ladung und Lager verschieben
export function storeCargo(good, n) {
  const k = Math.min(n, G.s.cargo[good] || 0);
  G.s.cargo[good] -= k;
  G.s.castle.storage[good] = (G.s.castle.storage[good] || 0) + k;
}

export function loadCargo(good, n) {
  const free = cargoCap() - cargoUsed();
  const k = Math.min(n, G.s.castle.storage[good] || 0, free);
  G.s.castle.storage[good] -= k;
  G.s.cargo[good] = (G.s.cargo[good] || 0) + k;
}
