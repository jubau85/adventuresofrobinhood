// Belagerungen: Ein Heer zieht vor eine Burg oder Stadt der Gegenseite, schlägt ein Lager auf,
// beschießt die Häuser mit dem Trebuchet und stürmt dann das Tor. Getroffene Häuser brennen und
// werden beschädigt. Danach bauen die Bewohner wieder auf, und die Toten werden begraben.

import { G, log, homeName, playerColor } from './state.js';
import { GROUP_TYPES, FACTIONS, GOODS, T, dirText, MAP_K } from './data.js';
import { rand, pick, randInt } from './rng.js';
import { changeRep, addRenown, isHostileFaction } from './politics.js';
import { cargoFree, addCargo } from './economy.js';
import { spawnGroup, rebuildUnits, inCombat, makeNpc, partyMembers } from './units.js';
import { isWalkable, landAt, findPath, wallRing, palisadeBand, nearestWalkable } from './world.js';
import { villageHouses, castleDefense, bSum, burnOuterPlots } from './castle.js';
import { ringR } from './plots.js';
import { sfxAt } from './audio.js';
import { isHeld, isOwnSite, holdingOf, conquer, holdingSiegeOver, holdingHolds } from './holdings.js';
import { seatSiegeOver } from './war.js';
import { SHIRES } from './shires.js';

// Welches Heer zieht gegen welche Fraktion, je nach Landesteil
const ATTACKER = {
  normannen: { en: 'heer_richard', wa: 'heer_richard', nd: 'heer_philipp', fr: 'heer_philipp', fl: 'heer_philipp', ir: 'heer_iren' },
  sachsen: { en: 'heer_john', wa: 'heer_john' },
  franken: { fr: 'heer_normandie', fl: 'heer_normandie', nd: 'heer_normandie' },
  // Die Barone in Irland greifen nach den Ländern der gälischen Könige
  iren: { ir: 'heer_john' },
};
export const DEFENDER_NPC = { normannen: ['soldat', 'armbrust'], sachsen: ['freisasse', 'sachs_bogen'], franken: ['sergent', 'arbaletrier'], schotten: ['freisasse', 'sachs_bogen'], iren: ['freisasse', 'waldmann'] };

// ---------------------------------------------------------------- Schäden und Reparatur
export function siteBuildings(siteId) { return G.world.buildings.filter((b) => b.site === siteId && b.kind === 'house' && !(b.cons < 1)); }

export function damageBuilding(b, amount) {
  if (!b) return;
  b.dmg = Math.min(1, (b.dmg || 0) + amount);
  b.fire = G.time + rand(30, 60);
  G.s.damage[b.idx] = b.dmg;
}

export function repairBuilding(b, amount) {
  if (!b || !b.dmg) return;
  b.dmg = Math.max(0, b.dmg - amount);
  if (b.dmg <= 0.001) { b.dmg = 0; delete G.s.damage[b.idx]; } else G.s.damage[b.idx] = b.dmg;
}

// Schlüssel „v3“ meint Haus 3 der eigenen Burgsiedlung, Zahlen meinen Gebäude der Welt
function buildingByKey(k) {
  if (typeof k === 'string' && k[0] === 'v') {
    const home = G.world.sites.find((s) => s.type === 'spieler');
    const b = home && home.villageSpots && home.villageSpots[Number(k.slice(1))];
    if (b) b.idx = k;
    return b;
  }
  return G.world.buildings[k];
}

// Gespeicherte Schäden auf die frisch erzeugte Welt übertragen
export function applyDamage() {
  if (!G.s.damage) G.s.damage = {};
  for (const [i, d] of Object.entries(G.s.damage)) { const b = buildingByKey(i); if (b) b.dmg = d; else if (i[0] !== 'v') delete G.s.damage[i]; }
  if (!G.s.walls) G.s.walls = {};
  G.world.afterBlock = applyWallState;
  applyWallState();
}

// Jeden Tag bauen die Leute weiter, auch wenn du nicht hinsiehst
// In verödeten Orten repariert niemand, ausgebrannte Häuser stürzen ein (dynamics.js)
export function dailyRepairs() {
  for (const k of Object.keys(G.s.damage || {})) {
    const b = buildingByKey(k);
    if (!b) { delete G.s.damage[k]; continue; }
    if (typeof b.idx === 'number') {
      const s = G.world.sites.find((x) => x.id === b.site);
      if ((s && (G.s.blight[s.id] || 0) > G.s.day) || b.dmg >= 0.9) continue;
    }
    repairBuilding(b, 0.22);
  }
  // Breschen: zwei Tage liegt der Schutt, dann wird die Lücke vermauert und das Gerüst steht noch eine Weile
  const W = G.world;
  for (const [id, st] of Object.entries(G.s.walls || {})) {
    if (G.siege && G.siege.site.id === id) continue;
    if (st.open) {
      if (G.s.day - (st.since ?? G.s.day) < 2) continue;
      st.open = false; st.dmg = 0.75;
      for (const [x, y] of st.tiles) W.block[y * W.N + x] = 1;
      continue;
    }
    st.dmg -= 0.25;
    if (st.dmg <= 0) delete G.s.walls[id];
  }
}

// ---------------------------------------------------------------- Tote zählen
export function nearestCemeterySite(x, y, maxD = 50) {
  let best = null, bd = maxD;
  for (const s of G.world.sites) {
    if (!s.cemetery) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

export function countDead(u) {
  const s = nearestCemeterySite(u.x, u.y);
  if (!s) return;
  const pd = G.s.pendingDead || (G.s.pendingDead = {});
  pd[s.id] = (pd[s.id] || 0) + 1;
  (G.s.deadDay || (G.s.deadDay = {}))[s.id] = G.s.day;
}

// ---------------------------------------------------------------- Belagerung beginnen
export function maybeSiege() {
  if (G.s.day < 5 || G.siege || G.battle || inCombat()) return;
  if (Math.random() < 0.3) startSiege();
}

// opts.makeUnits(pos): eigene Truppen statt der üblichen des Heeres (dein Aufgebot, holdings.js); opts.lead: du führst
export function startSiege(target = null, armyType = null, scale = null, opts = {}) {
  if (G.siege) return false;
  const W = G.world, p = G.s.player, land = landAt(W, p.x, p.y);
  if (!target) {
    // Grafschaftsburgen belagern die Heere im Krieg (war.js); hier geht es um Städte, Hallen und Märkte
    const cand = W.sites.filter((s) => ['burg', 'stadt', 'halle', 'markt'].includes(s.type) && !SHIRES[s.id] && s.land === land && !isHeld(s) && !(G.s.abandoned && (G.s.abandoned[s.id] || 0) > G.s.day) && ATTACKER[s.faction] && ATTACKER[s.faction][s.realm]
      && Math.hypot(s.x - p.x, s.y - p.y) > 18 && Math.hypot(s.x - p.x, s.y - p.y) < 85 * MAP_K);
    if (!cand.length) return false;
    target = pick(cand);
    armyType = ATTACKER[target.faction][target.realm];
  }
  // Lager vor der Stadt, bevorzugt auf der Seite der Straße zum Tor. Das Heer zieht von weiter draußen heran.
  // Mehrere Versuche: Liegt hinter dem Lager Wasser oder fremdes Land, wird eine andere Richtung probiert.
  let camp = null, from = null, path = null;
  for (let tries = 0; tries < 8 && !path; tries++) {
    camp = null; from = null;
    for (let k = 0; k < 40 && !camp; k++) {
      const a = Math.PI * 0.5 + rand(-1.1, 1.1) + (tries % 2 ? Math.PI : 0) + (tries >= 4 ? rand(-1.6, 1.6) : 0), r = (target.clear || 7) + 6 + rand(0, 3);
      const x = target.x + Math.cos(a) * r, y = target.y + Math.sin(a) * r;
      if (isWalkable(W, x, y) && landAt(W, x, y) === target.land) camp = { x, y };
    }
    if (!camp) continue;
    for (let k = 0; k < 60 && !from; k++) {
      const a = Math.atan2(camp.y - target.y, camp.x - target.x) + rand(-0.5, 0.5) * (1 + k / 15), r = 22 + (k % 20) * 0.6;
      const x = camp.x + Math.cos(a) * r, y = camp.y + Math.sin(a) * r;
      if (isWalkable(W, x, y) && landAt(W, x, y) === target.land && Math.hypot(x - target.x, y - target.y) > (target.clear || 7) + 12) from = { x, y };
    }
    if (from) path = findPath(W, from.x, from.y, camp.x, camp.y, 80000);
  }
  if (!path) return false;
  const sz = scale ?? ((G.fpsAvg || 60) >= 40 ? 0.8 : 0.6);
  const army = opts.makeUnits ? spawnGroup(armyType, { pos: from, membersUnits: opts.makeUnits(from) }) : spawnGroup(armyType, { pos: from, scale: sz });
  if (!army) return false;
  army.siege = true; army.path = path; army.pathI = 0; army.wait = 0;
  const ang = Math.atan2(target.y - camp.y, target.x - camp.x);
  G.siege = {
    site: target, army, def: null, camp, stage: 'anmarsch', t: 0, shotT: 4, lead: !!opts.lead, side: opts.lead ? 'att' : undefined,
    tre: { x: camp.x + Math.cos(ang) * 2.2, y: camp.y + Math.sin(ang) * 2.2, fired: -10 },
    tents: [0, 1, 2, 3].map((k) => ({ x: camp.x - Math.cos(ang) * (1.4 + (k % 2) * 1.1) + Math.cos(ang + Math.PI / 2) * (k - 1.5) * 1.2, y: camp.y - Math.sin(ang) * (1.4 + (k % 2) * 1.1) + Math.sin(ang + Math.PI / 2) * (k - 1.5) * 1.2 })),
    shots: [],
  };
  rebuildUnits();
  if (opts.lead) return true;
  const own = target.type === 'spieler';
  const where = dirText(p, target);
  if (isHeld(target)) { log(`${GROUP_TYPES[armyType].nom} zieht gegen deine Burg ${target.name} (${where})! Die frühere Herrschaft will sie zurück. Eile hin und hilf der Besatzung, durch die Pforte am Tor kommst du hinein.`, 'bad'); return true; }
  log(own ? `${GROUP_TYPES[armyType].nom} zieht gegen ${homeName()} (${where})! Sobald das Heer da ist, schließen sich die Tore und die Garnison bezieht Stellung. Eile zurück, durch die Pforte am Tor kommst du hinein.` : `Ein Bote meldet: ${GROUP_TYPES[armyType].nom} zieht vor ${target.name} (${where}) und will die ${target.type === 'burg' ? 'Burg' : 'Stadt'} belagern! Auf der Karte ist der Ort markiert. Im Feldlager oder in ${target.name} kannst du dich einer Seite anschließen.`, 'bad');
  return true;
}

// ---------------------------------------------------------------- Mauern, Tore, Bresche
// Mauerband eines Ortes: Stadtmauer, Burgmauer (auch deine eigene ab der Holzburg) oder Palisade
function wallBand(s) {
  const W = G.world;
  if (s.cityWall) return { band: s.cityWall, square: false };
  if (s.type === 'burg' || (s.type === 'spieler' && G.s.castle.level >= 1)) return { band: wallRing(W, s, s.type === 'spieler' ? ringR() : 4), square: true };
  if (s.palisade) return { band: palisadeBand(s, true), square: false };
  return null;
}

function walkPt(x, y) {
  const W = G.world;
  if (isWalkable(W, x, y)) return { x, y };
  const q = nearestWalkable(W, Math.floor(x), Math.floor(y), 3);
  return q ? { x: q.x + 0.5, y: q.y + 0.5 } : { x, y };
}

// Tore und Bresche bestimmen: Offene Felder im Mauerring sind Tore. Die Bresche liegt dort,
// wo die Mauer dem Lager am nächsten ist, aber nicht direkt neben einem Tor.
function setupWalls(sg) {
  const s = sg.site, W = G.world, N = W.N, wb = wallBand(s);
  if (!wb) return;
  if (!G.s.walls) G.s.walls = {};
  const prev = G.s.walls[s.id];
  const inBreach = (x, y) => !!prev && prev.open && prev.tiles.some((t) => t[0] === x && t[1] === y);
  const seen = new Set(), wall = [], open = [];
  for (const [x, y] of wb.band) {
    if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
    const i = y * N + x;
    if (seen.has(i) || W.tiles[i] === T.WATER) continue;
    seen.add(i);
    (W.block[i] || inBreach(x, y) ? wall : open).push([x, y]);
  }
  // Deine Burg: Das Tor liegt auf den Straßenfeldern im Ring, auch wenn du es schon geschlossen hast
  if (s.type === 'spieler') {
    const gt = homeGateTiles(), isGate = ([x, y]) => gt.some((g) => g[0] === x && g[1] === y);
    for (let k = wall.length - 1; k >= 0; k--) if (isGate(wall[k])) wall.splice(k, 1);
    open.length = 0; open.push(...gt);
  }
  if (!wall.length) return;
  let inside;
  if (wb.square) inside = (x, y) => Math.abs(x - s.x) < 3.4 && Math.abs(y - s.y) < 3.4;
  else {
    const r = wall.reduce((a, [x, y]) => a + Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y), 0) / wall.length - 0.75;
    inside = (x, y) => Math.hypot(x - s.x, y - s.y) < r;
  }
  let st = prev && prev.open ? prev : null;
  if (!st) {
    let best = null, bd = Infinity;
    for (const t of wall) {
      if (open.some((o) => Math.hypot(o[0] - t[0], o[1] - t[1]) < 2.6)) continue;
      // Bei Burgen nicht an den Ecktürmen, sondern mitten in der Mauer
      if (wb.square && Math.abs(t[0] - s.tx) >= 3 && Math.abs(t[1] - s.ty) >= 3) continue;
      const d = Math.hypot(t[0] + 0.5 - sg.camp.x, t[1] + 0.5 - sg.camp.y);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) best = wall[0];
    const tiles = wall.filter((t) => Math.hypot(t[0] - best[0], t[1] - best[1]) < 1.5);
    const bx = tiles.reduce((a, t) => a + t[0], 0) / tiles.length + 0.5, by = tiles.reduce((a, t) => a + t[1], 0) / tiles.length + 0.5;
    st = { bx, by, tiles, dmg: prev ? Math.max(0, prev.dmg || 0) : 0, open: false };
    G.s.walls[s.id] = st;
  }
  const toward = (x, y, d) => { const dx = s.x - x, dy = s.y - y, l = Math.hypot(dx, dy) || 1; return walkPt(x + (dx / l) * d, y + (dy / l) * d); };
  const gx = open.length ? open.reduce((a, t) => a + t[0], 0) / open.length + 0.5 : null, gy = open.length ? open.reduce((a, t) => a + t[1], 0) / open.length + 0.5 : null;
  sg.walls = { inside, gates: open, st, square: wb.square, breachIn: toward(st.bx, st.by, 1.9), breachOut: toward(st.bx, st.by, -2.4), gateIn: open.length ? toward(gx, gy, 1.9) : null };
}

// Tore zu: Die Torfelder werden gesperrt. Wer im Tor steht, tritt beiseite.
function closeGates(sg) {
  const w = sg.walls, W = G.world;
  if (!w || sg.gatesClosed) return;
  sg.gatesClosed = true;
  for (const [x, y] of w.gates) W.block[y * W.N + x] = 1;
  stepAside(sg.site);
  if (w.gates.length) sfxAt('tor', w.gates[0][0] + 0.5, w.gates[0][1] + 0.5, 1, 40);
}

// Wer in einem gerade geschlossenen Tor steht, tritt beiseite
function stepAside(site) {
  const W = G.world;
  for (const u of G.units) {
    if (u.dead || isWalkable(W, u.x, u.y) || Math.hypot(u.x - site.x, u.y - site.y) > 20) continue;
    const q = nearestWalkable(W, Math.floor(u.x), Math.floor(u.y), 3);
    if (q) { u.x = q.x + 0.5; u.y = q.y + 0.5; u.path = null; }
  }
}

function openGates(sg) {
  const w = sg.walls, W = G.world;
  if (!w || !sg.gatesClosed) return;
  sg.gatesClosed = false;
  if (sg.site.type === 'spieler' && homeGateClosed()) return;
  for (const [x, y] of w.gates) W.block[y * W.N + x] = 0;
}

// ---------------------------------------------------------------- Burgtor von deiner Burg
// Ab der Holzburg lässt sich das Tor schließen. Zu bleibt es, bis du es wieder öffnest, auch über das Speichern hinaus.
export function homeSite() { return G.world.sites.find((x) => x.type === 'spieler'); }
export function hasHomeGate() { return !!G.s && G.s.castle.level >= 1; }
export function homeGateClosed() { return hasHomeGate() && !!G.s.gateClosed; }
export function homeGateTiles() {
  const W = G.world, N = W.N;
  return wallRing(W, homeSite(), ringR()).filter(([x, y]) => { const t = W.tiles[y * N + x]; return t === T.ROAD || t === T.BRIDGE; });
}
function insideHome(x, y) { const s = homeSite(), r = ringR() - 0.6; return Math.abs(x - s.x) < r && Math.abs(y - s.y) < r; }

export function setHomeGate(closed) {
  if (!hasHomeGate()) return false;
  const W = G.world, N = W.N, sg = G.siege, sieged = !!sg && sg.site.type === 'spieler' && !!sg.walls;
  G.s.gateClosed = !!closed;
  for (const [x, y] of homeGateTiles()) W.block[y * N + x] = closed ? 1 : 0;
  if (closed) stepAside(homeSite());
  const gt = homeGateTiles()[0];
  if (gt) sfxAt('tor', gt[0] + 0.5, gt[1] + 0.5, 1, 40);
  if (sieged) sg.gatesClosed = !!closed;
  log(closed ? `Das Tor von ${homeName()} schlägt zu, die Riegel fallen. Durch die Pforte (E) kommst du weiter hinein und hinaus.`
    : sieged ? `Das Tor von ${homeName()} steht offen, mitten in der Belagerung! Jetzt können die Angreifer durchs Tor.` : `Das Tor von ${homeName()} steht wieder offen.`, closed ? 'good' : sieged ? 'bad' : '');
  return true;
}

// Nach dem Neuaufbau der Sperrkarte (Burgausbau, Laden): Breschen offen, Tore der laufenden Belagerung zu
export function applyWallState() {
  const W = G.world;
  if (!W || !G.s) return;
  const N = W.N;
  for (const st of Object.values(G.s.walls || {})) if (st.open) for (const [x, y] of st.tiles) W.block[y * N + x] = 0;
  if (homeGateClosed()) for (const [x, y] of homeGateTiles()) W.block[y * N + x] = 1;
  const sg = G.siege;
  if (sg && sg.walls && sg.gatesClosed) for (const [x, y] of sg.walls.gates) W.block[y * N + x] = 1;
}

function siteName(s) { return s.type === 'spieler' ? homeName() : s.name; }

// Ein Stein trifft die Mauer: Staub, Splitter, Schaden. Bei vollem Schaden bricht die Bresche auf.
function hitWall(sg) {
  const st = sg.walls.st;
  st.dmg = Math.min(1, (st.dmg || 0) + rand(0.13, 0.21));
  G.fx.push({ kind: 'staub', x: st.bx, y: st.by, t: 0, dur: 1.5, col: '#a49a88' });
  for (let k = 0; k < 6; k++) G.fx.push({ kind: 'splitter', x: st.bx, y: st.by, vx: rand(-2, 2), vy: rand(-2, 2), z0: 24, t: 0, dur: 0.9, col: '#8f897c' });
  if (st.dmg >= 1) openBreach(sg);
}

function openBreach(sg) {
  const st = sg.walls.st, W = G.world, p = G.s.player;
  if (st.open) return;
  st.open = true; st.dmg = 1; st.since = G.s.day;
  sfxAt('einsturz', st.bx, st.by, 1, 45);
  for (const [x, y] of st.tiles) W.block[y * W.N + x] = 0;
  // Führt kein Weg durch die Lücke (Mauer mit Treppenstufen), wird sie verbreitert
  const w = sg.walls;
  if (!findPath(W, w.breachOut.x, w.breachOut.y, w.breachIn.x, w.breachIn.y, 3000) || (findPath(W, w.breachOut.x, w.breachOut.y, w.breachIn.x, w.breachIn.y, 3000) || []).length > 8) {
    const N = W.N, bx = Math.floor(st.bx), by = Math.floor(st.by);
    for (let y = by - 2; y <= by + 2; y++) for (let x = bx - 2; x <= bx + 2; x++) {
      const i = y * N + x;
      if (!W.block[i] || Math.hypot(x + 0.5 - st.bx, y + 0.5 - st.by) > 2.2 || w.gates.some((g) => g[0] === x && g[1] === y)) continue;
      W.block[i] = 0;
      st.tiles.push([x, y]);
    }
  }
  G.fx.push({ kind: 'staub', x: st.bx, y: st.by, t: 0, dur: 2.6, col: '#8a8070' });
  if (Math.hypot(sg.site.x - p.x, sg.site.y - p.y) < 80) log(`Die Mauer von ${siteName(sg.site)} bricht! Eine Bresche klafft, Schutt liegt im Graben.`, 'bad');
}

// Wo die Besatzung herauskommt: aus dem Bergfried, bei Städten aus den Häusern
function musterPoints(sg) {
  const s = sg.site, w = sg.walls;
  if (s.type === 'burg' || s.type === 'spieler') return [walkPt(s.x - 0.6, s.y + 0.9), walkPt(s.x + 0.4, s.y + 0.4)];
  const houses = siteBuildings(s.id).filter((b) => !w || w.inside(b.x, b.y)).sort(() => Math.random() - 0.5).slice(0, 6);
  const pts = houses.map((b) => walkPt(b.x, b.y + b.wy / 2 + 0.35));
  return pts.length ? pts : [walkPt(s.x, s.y + 1)];
}

// Posten: Nahkämpfer in zwei Reihen hinter der Bresche, ein Teil am Tor, Schützen dicht hinter der Mauer.
// Jeder Posten liegt sicher innerhalb der Mauer, sonst rückt er zur Mitte hin nach.
function insidePt(sg, p) {
  const s = sg.site, w = sg.walls;
  let q = walkPt(p.x, p.y);
  for (let k = 1; k <= 8 && !(w.inside(q.x, q.y) && isWalkable(G.world, q.x, q.y)); k++) {
    const t = k / 8;
    q = walkPt(p.x + (s.x - p.x) * t * 0.6, p.y + (s.y - p.y) * t * 0.6);
  }
  return q;
}

function defenderPosts(sg, members) {
  const posts = rawPosts(sg, members);
  return sg.walls ? posts.map((p) => insidePt(sg, p)) : posts;
}

function rawPosts(sg, members) {
  const s = sg.site, w = sg.walls;
  if (!w) return members.map(() => walkPt(s.x + rand(-1.6, 1.6), s.y + 1 + rand(-1, 1)));
  const b = w.breachIn, dx = b.x - w.st.bx, dy = b.y - w.st.by, l = Math.hypot(dx, dy) || 1;
  const ix = dx / l, iy = dy / l, lx = -iy, ly = ix;
  let melee = 0, ranged = 0;
  return members.map((m) => {
    if (m.st.ranged) {
      const k = ranged++;
      const side = ((k % 6) - 2.5) * 0.9;
      return walkPt(w.st.bx + ix * 1.1 + lx * side, w.st.by + iy * 1.1 + ly * side);
    }
    const k = melee++;
    if (w.gateIn && k % 3 === 2) return walkPt(w.gateIn.x + rand(-0.7, 0.7), w.gateIn.y + rand(-0.7, 0.7));
    const j = k - Math.floor(k / 3);
    const row = Math.floor(j / 4), col = (j % 4) - 1.5;
    return walkPt(b.x + ix * row * 0.75 + lx * col * 0.8, b.y + iy * row * 0.75 + ly * col * 0.8);
  });
}

// Besatzung aufstellen: Die Garnison kommt heraus und bezieht ihre Posten hinter der Mauer
function raiseDefenders(sg) {
  const s = sg.site, home = s.type === 'spieler', held = isHeld(s), own = home || held;
  // Deine Besatzung in eroberten Burgen: Söldner in Kettenhemd und Armbrustschützen, in deinen Farben
  const types = home ? ['wache'] : held ? ['soldat', 'armbrust'] : DEFENDER_NPC[s.faction] || ['wache'];
  const n = home ? 4 + G.s.castle.level * 2 + G.s.companions.filter((c) => c.status === 'garnison').length + bSum('wehr') * 2
    : held ? Math.max(3, Math.min(30, holdingOf(s).garrison))
      : Math.round(10 + (s.type === 'burg' ? 8 : 4) * ((G.fpsAvg || 60) >= 40 ? 1 : 0.6));
  const muster = musterPoints(sg);
  const members = [];
  for (let k = 0; k < n; k++) {
    const at = muster[k % muster.length];
    const m = makeNpc(k % 3 === 2 ? types[1] || types[0] : types[0], at.x + rand(-0.3, 0.3), at.y + rand(-0.3, 0.3), Math.floor(G.s.day / 8));
    if (own) m.lookObj = null;
    if (held) { m.tunic = playerColor(); m.livery = playerColor(); }
    members.push(m);
  }
  const posts = defenderPosts(sg, members);
  members.forEach((m, k) => { m.post = posts[k]; });
  const g = spawnGroup('verteidiger', { pos: posts[0] || muster[0], membersUnits: members });
  if (!g) return null;
  g.faction = own ? null : s.faction; g.defender = s.id; g.wait = 99999; g.path = null; g.homeGuard = own;
  if (sg.side === 'att') g.engaged = true;
  rebuildUnits();
  return g;
}

// Pforte im Tor: Wer zur Stadt hält, wird eingelassen oder hinausgelassen. An deiner Burg immer.
export function posternNear() {
  const p = G.s.player, sg = G.siege;
  if (sg && sg.walls && sg.gatesClosed && (isOwnSite(sg.site) || (sg.side !== 'att' && !isHostileFaction(sg.site.faction)))) {
    for (const [x, y] of sg.walls.gates) {
      if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) < 2.4) return { x: x + 0.5, y: y + 0.5, inside: sg.walls.inside(p.x, p.y), site: sg.site };
    }
  }
  if (homeGateClosed()) {
    for (const [x, y] of homeGateTiles()) {
      if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) < 2.4) return { x: x + 0.5, y: y + 0.5, inside: insideHome(p.x, p.y), site: homeSite() };
    }
  }
  return null;
}
export function usePostern() {
  const pf = posternNear();
  if (!pf) return false;
  const s = pf.site, p = G.s.player;
  const dx = s.x - pf.x, dy = s.y - pf.y, l = Math.hypot(dx, dy) || 1, k = pf.inside ? -1.8 : 1.8;
  const to = walkPt(pf.x + (dx / l) * k, pf.y + (dy / l) * k);
  p.x = to.x; p.y = to.y; p.path = null; p.attackTarget = null;
  for (const c of partyMembers()) { c.x = to.x + rand(-0.4, 0.4); c.y = to.y + rand(-0.4, 0.4); c.path = null; c.chase = null; }
  const own = isOwnSite(s);
  log(pf.inside ? `${own ? 'Deine Wachen' : 'Die Wachen'} öffnen die Pforte einen Spalt und lassen dich hinaus.` : `${own ? 'Deine Wachen' : 'Die Wachen'} öffnen die Pforte einen Spalt und lassen dich ein. Hinter dir fällt der Riegel.`, 'good');
  return true;
}

// Ziel hinter einem geschlossenen Tor: erst zur Pforte, von dort weiter. Gibt den Punkt vor der Pforte zurück.
export function posternRoute(tx, ty) {
  const p = G.s.player, sg = G.siege;
  const gates = [];
  if (sg && sg.walls && sg.gatesClosed && (isOwnSite(sg.site) || (sg.side !== 'att' && !isHostileFaction(sg.site.faction)))) gates.push({ site: sg.site, tiles: sg.walls.gates, inside: sg.walls.inside });
  if (homeGateClosed()) gates.push({ site: homeSite(), tiles: homeGateTiles(), inside: insideHome });
  for (const g of gates) {
    const pin = g.inside(p.x, p.y), tin = g.inside(tx, ty);
    if (pin === tin || !g.tiles.length) continue;
    const [gx, gy] = g.tiles[Math.floor(g.tiles.length / 2)];
    const x = gx + 0.5, y = gy + 0.5, dx = g.site.x - x, dy = g.site.y - y, l = Math.hypot(dx, dy) || 1, k = pin ? 1.5 : -1.5;
    return walkPt(x + (dx / l) * k, y + (dy / l) * k);
  }
  return null;
}

// ---------------------------------------------------------------- Ablauf
export function updateSiege(dt) {
  const sg = G.siege;
  if (!sg) return;
  const p = G.s.player, s = sg.site, army = sg.army;
  sg.t += dt;
  const alive = (g) => g && g.members.length && G.groups.includes(g);
  const far = Math.hypot(s.x - p.x, s.y - p.y) > 95;
  // Flugbahnen der Steine
  for (const sh of sg.shots) sh.t += dt;
  for (const sh of sg.shots) {
    if (sh.t < sh.dur || sh.hit) continue;
    sh.hit = true;
    sfxAt('einschlag', sh.x1, sh.y1, sh.wall ? 1 : 0.8, 40);
    if (sh.wall) { if (sg.walls) hitWall(sg); continue; }
    damageBuilding(sh.b, rand(0.25, 0.4));
    G.fx.push({ kind: 'staub', x: sh.x1, y: sh.y1, t: 0, dur: 1.2 });
  }
  sg.shots = sg.shots.filter((sh) => sh.t < sh.dur + 0.1);

  if (!alive(army)) return endSiege(sg, 'abgewehrt');
  if (far) return resolveAbstract(sg);
  if (sg.stage === 'anmarsch') {
    if (Math.hypot(army.x - sg.camp.x, army.y - sg.camp.y) < 3 || (!army.path && sg.t > 30)) {
      sg.stage = 'belagerung'; sg.t = 0;
      setupWalls(sg);
      closeGates(sg);
      sg.def = raiseDefenders(sg);
      // Vor der eigenen Burg: Die Belagerer schlagen ihr Lager auf und brennen nieder, was vor den Mauern steht
      if (sg.site.type === 'spieler') burnOuterPlots(0.45, GROUP_TYPES[army.type].nom);
      sg.att0 = army.members.length; sg.def0 = sg.def ? sg.def.members.length : 0;
      if (Math.hypot(s.x - p.x, s.y - p.y) < 70) log(sg.walls ? `Die Tore von ${siteName(s)} schlagen zu, die Riegel fallen. Die Besatzung rückt aus und bezieht Stellung hinter der Mauer. Draußen wird das Trebuchet aufgestellt.` : `Die Belagerung von ${siteName(s)} beginnt. Das Trebuchet wird aufgestellt.`, 'bad');
    } else if (sg.t > 260) return endSiege(sg, 'abgezogen');
    return;
  }
  keepSides(sg);
  if (sg.stage === 'belagerung') {
    sg.shotT -= dt;
    if (sg.shotT <= 0) {
      sg.shotT = sg.storm ? rand(2.2, 3.4) : rand(5, 8);
      const houses = siteBuildings(s.id).filter((b) => (b.dmg || 0) < 0.95);
      const vh = s.type === 'spieler' ? (s.villageSpots || []).slice(0, villageHouses()) : [];
      const pool = houses.length ? houses : vh;
      // Meist zielt das Trebuchet auf die Mauer, bis die Bresche offen ist, sonst auf die Dächer
      if (sg.walls && !sg.walls.st.open && (Math.random() < 0.75 || !pool.length)) {
        sg.tre.fired = G.time; sfxAt('trebuchet', sg.tre.x, sg.tre.y, 0.9, 40);
        sg.shots.push({ x0: sg.tre.x, y0: sg.tre.y, x1: sg.walls.st.bx, y1: sg.walls.st.by, t: -0.35, dur: 1.6, wall: true });
      } else if (pool.length) {
        const b = pick(pool);
        if (!b.idx && b.idx !== 0) b.idx = `v${(s.villageSpots || []).indexOf(b)}`;
        sg.tre.fired = G.time; sfxAt('trebuchet', sg.tre.x, sg.tre.y, 0.9, 40);
        sg.shots.push({ x0: sg.tre.x, y0: sg.tre.y, x1: b.x, y1: b.y, t: -0.35, dur: 1.6, b });
      }
    }
    // Ummauerte Orte: Gestürmt wird erst durch die Bresche. Hält die Mauer zu lange, bricht sie zuletzt doch.
    // Der Sturm wartet, bis du nah genug bist (höchstens bis 160 s), damit du noch rechtzeitig kommst.
    const dS = Math.hypot(s.x - p.x, s.y - p.y);
    if (sg.walls && !sg.walls.st.open && sg.t > 150) openBreach(sg);
    const ready = sg.walls ? sg.walls.st.open : sg.t > 70 || sg.storm;
    // Führst du selbst, wartet dein Aufgebot auf dein Zeichen (höchstens vier Minuten)
    if (ready && (sg.storm || (sg.lead ? sg.t > 240 : dS < 35 || sg.t > 160))) {
      sg.stage = 'sturm';
      if (alive(sg.def)) { army.feud = sg.def; sg.def.feud = army; army.path = null; }
      if (isOwnSite(s) && Math.hypot(s.x - p.x, s.y - p.y) < 60) army.engaged = true;
      if (sg.lead) log(`Sturm auf ${s.name}! Dein Aufgebot drängt ${sg.walls ? 'durch die Bresche' : 'gegen die Besatzung'}, die Hörner blasen.`, 'bad');
      else if (Math.hypot(s.x - p.x, s.y - p.y) < 70) log(sg.walls ? `Sturm auf ${siteName(s)}! Die Angreifer drängen durch die Bresche, die Besatzung hält dagegen.` : `Sturm auf ${siteName(s)}! Die Angreifer rennen gegen die Verteidiger an.`, 'bad');
    }
    return;
  }
  if (sg.stage === 'sturm') {
    if (!alive(sg.def)) return endSiege(sg, 'gefallen');
    // Moral: Ist die Besatzung auf ein Viertel geschmolzen, streckt der Rest die Waffen.
    // Haben die Belagerer zwei Drittel verloren, brechen sie den Sturm ab. (Nicht an deiner eigenen Burg: Dort hält die Garnison bis zuletzt.)
    const nearP = Math.hypot(s.x - p.x, s.y - p.y) < 70;
    if (!isOwnSite(s) && sg.def0 && sg.def.members.length <= Math.max(2, Math.round(sg.def0 * 0.25))) {
      if (nearP) log(`Die Besatzung von ${siteName(s)} streckt die Waffen. Die Angreifer strömen durch die Bresche.`, 'bad');
      for (const m of sg.def.members) m.dead = true;
      return endSiege(sg, 'gefallen');
    }
    if (sg.att0 && army.members.length <= Math.round(sg.att0 * 0.33)) {
      if (sg.lead) log(`Dein Aufgebot hat vor ${s.name} zu viele Männer verloren. Die Söldner brechen den Sturm ab.`, 'bad');
      else if (nearP) log(`Die Belagerer von ${siteName(s)} haben zu viele Männer verloren und brechen den Sturm ab.`, 'good');
      return endSiege(sg, 'abgewehrt');
    }
    if (sg.t > 260) return endSiege(sg, 'abgezogen');
  }
}

// Ausgang ohne Zuschauer: Kräfteverhältnis aus Heer, Besatzung und Mauern, dazu etwas Glück
export function siegeOdds(site, attackers) {
  const garrison = 10 + (site.type === 'burg' ? 8 : 4);
  const walled = site.type === 'burg' || !!site.cityWall || !!site.palisade;
  const ratio = attackers / (garrison * (walled ? 2.2 : 1.4));
  return 1 / (1 + ratio * ratio);   // Wahrscheinlichkeit, dass die Stadt hält
}

// Fern vom Spieler: Ausgang auswürfeln, Häuser beschädigen, Tote zählen
function resolveAbstract(sg) {
  const houses = siteBuildings(sg.site.id);
  for (const b of houses) if (Math.random() < 0.35) damageBuilding(b, rand(0.2, 0.6));
  const pd = G.s.pendingDead || (G.s.pendingDead = {});
  if (sg.site.cemetery) pd[sg.site.id] = (pd[sg.site.id] || 0) + Math.floor(rand(4, 12));
  (G.s.deadDay || (G.s.deadDay = {}))[sg.site.id] = G.s.day;
  // Deine eigene Burg hält, wenn Mauern, Türme und Garnison stark genug sind
  // Eine eroberte Burg ebenso, nach Mauern, Besatzung und Kastellan
  const s = sg.site, mine = isHeld(s);
  const held = s.type === 'spieler' ? castleDefense() >= (40 + G.s.day * 3) * rand(0.8, 1.2) : mine ? holdingHolds(s) : Math.random() < siegeOdds(s, sg.army ? sg.army.members.length : 40);
  if (s.type === 'spieler' && held) log(`Nachricht aus ${homeName()}: Die Besatzung hat die Belagerer abgewehrt.`, 'good');
  if (mine && held) log(`Nachricht aus ${s.name}: Die Besatzung hat die Belagerer abgewehrt.`, 'good');
  if (sg.lead) log(held ? `Nachricht aus dem Feldlager vor ${s.name}: Ohne dich hat dein Aufgebot die Burg nicht nehmen können und sich zerstreut.` : `Nachricht aus dem Feldlager vor ${s.name}: Dein Aufgebot hat die Burg auch ohne dich gestürmt.`, held ? 'bad' : 'gold');
  endSiege(sg, held ? 'abgewehrt' : 'gefallen', !held && (s.type === 'spieler' || sg.lead) ? false : true);
}

function endSiege(sg, how, quiet = false) {
  const s = sg.site, p = G.s.player, name = s.type === 'spieler' ? homeName() : s.name;
  const near = !quiet && Math.hypot(s.x - p.x, s.y - p.y) < 80;
  const mine = isHeld(s);
  if (sg.lead) {
    // Deine eigene Belagerung: Fällt die Burg, gehört sie dir
    if (how === 'gefallen') { for (const b of siteBuildings(s.id)) if (Math.random() < 0.3) damageBuilding(b, rand(0.15, 0.35)); conquer(sg); }
    else if (how === 'abgewehrt') log(`Dein Sturm auf ${name} ist gescheitert. Die Überlebenden deines Aufgebots zerstreuen sich.`, 'bad');
    else log(`Dein Aufgebot zieht von ${name} ab, ohne die Burg genommen zu haben. Die Söldner gehen ihrer Wege.`, 'bad');
  } else if (mine) {
    holdingSiegeOver(s, how, sg.def && G.groups.includes(sg.def) ? sg.def.members.length : 0, sg.army && sg.army.faction);
    if (how === 'abgewehrt') log(`Die Belagerung deiner Burg ${name} ist abgeschlagen!`, 'good');
  } else if (how === 'gefallen') {
    for (const b of siteBuildings(s.id)) if (Math.random() < 0.4) damageBuilding(b, rand(0.2, 0.45));
    if (s.type === 'spieler') {
      const lost = Math.floor(G.s.gold * 0.2);
      G.s.gold -= lost;
      for (const g of Object.keys(G.s.castle.storage)) G.s.castle.storage[g] = Math.floor(G.s.castle.storage[g] * 0.6);
      log(`${name} wurde gestürmt und geplündert! Verloren: ${lost} Gold und ein Teil der Vorräte.`, 'bad');
    } else {
      const town = G.s.towns[s.id];
      if (town) for (const g of Object.keys(town.stock)) town.stock[g] = Math.floor(town.stock[g] * 0.5);
      if (near) log(`${name} ist gefallen! Die Angreifer plündern die Stadt und ziehen ab.`, 'bad');
    }
  } else if (how === 'abgewehrt') {
    if (near) log(s.type === 'spieler' ? `Die Belagerung von ${name} ist abgeschlagen!` : `Die Belagerung von ${name} ist abgeschlagen. Die Verteidiger jubeln.`, 'good');
  } else if (near) log(`Die Belagerer ziehen von ${name} ab.`);
  if (!sg.lead && !mine) sideOutcome(sg, how, quiet);
  // Im Krieg: Fällt eine Grafschaftsburg, wechselt sie den Herrn
  if (!sg.lead && !mine && s.type !== 'spieler') seatSiegeOver(s, sg.army, how);
  // Tore wieder auf (die Bresche bleibt, bis sie vermauert ist). Heer zieht heim, Besatzung kehrt in die Häuser zurück.
  openGates(sg);
  const army = sg.army;
  if (army && G.groups.includes(army)) { army.siegeDone = true; army.feud = null; army.engaged = false; army.path = null; army.wait = rand(2, 5); army.peace = G.time + 120; if (sg.lead) army.home = { ...sg.camp }; }
  if (sg.def && G.groups.includes(sg.def)) { const i = G.groups.indexOf(sg.def); G.groups.splice(i, 1); for (const m of sg.def.members) m.dead = true; }
  if (quiet && army && G.groups.includes(army)) { const i = G.groups.indexOf(army); G.groups.splice(i, 1); for (const m of army.members) m.dead = true; }
  G.siege = null;
  rebuildUnits();
}

// Für die Anzeige
export function siegeStatus() {
  const sg = G.siege;
  if (!sg) return null;
  return {
    name: sg.site.type === 'spieler' ? homeName() : sg.site.name, stage: sg.stage, att: sg.army.members.length, def: sg.def ? sg.def.members.length : 0,
    x: sg.site.x, y: sg.site.y, army: GROUP_TYPES[sg.army.type].name, side: sg.side || null, camp: sg.camp, own: isOwnSite(sg.site), lead: !!sg.lead,
    wall: sg.walls ? (sg.walls.st.open ? -1 : Math.round((sg.walls.st.dmg || 0) * 100)) : null, gates: !!sg.gatesClosed,
  };
}

// ---------------------------------------------------------------- Seitenwahl
// Im Feldlager oder in der belagerten Stadt kannst du dich einer Seite anschließen.
// Verteidiger: Die Wachen lassen dich durch die Pforte ein, ihr haltet gemeinsam die Bresche. Hält die Stadt, dankt sie dir.
// Belagerer: Du bläst mit zum Sturm, die Besatzung greift dich an. Fällt die Stadt, bekommst du einen Beuteanteil.
export function siegeAt(site) { return G.siege && G.siege.site === site ? G.siege : null; }
export function nearSiegeCamp(r = 5) {
  const sg = G.siege, p = G.s.player;
  return !!sg && sg.stage !== 'anmarsch' && !isOwnSite(sg.site) && Math.hypot(sg.camp.x - p.x, sg.camp.y - p.y) < r;
}
export function isSiegeGroup(g) { const sg = G.siege; return !!sg && !!g && (g === sg.army || g === sg.def); }

export function sideBlock(side) {
  const sg = G.siege;
  if (!sg) return 'Hier wird nicht mehr belagert.';
  const s = sg.site;
  if (isOwnSite(s)) return 'Deine eigene Burg verteidigst du ohnehin.';
  if (sg.lead) return 'Du führst diese Belagerung selbst.';
  const fa = sg.army.faction, fs = s.faction;
  if (sg.side === side) return 'Auf dieser Seite stehst du schon.';
  if (sg.side) return `Du hast dich schon ${sg.side === 'def' ? 'den Verteidigern' : 'den Belagerern'} angeschlossen.`;
  if (side === 'att') {
    if (sg.army.provoked || sg.army.engaged) return 'Du hast das Heer schon angegriffen. Im Lager will dich niemand sehen.';
    if (isHostileFaction(fa)) return `Der Hauptmann lässt dich nicht ins Lager. Die ${FACTIONS[fa].name} sind dir feindlich gesinnt.`;
  } else {
    if (sg.def && (sg.def.provoked || sg.def.engaged)) return 'Du hast die Besatzung schon angegriffen.';
    if (isHostileFaction(fs)) return `Die Besatzung traut dir nicht. Die ${FACTIONS[fs].name} sind dir feindlich gesinnt.`;
  }
  return null;
}

// Was dir die Seiten in Aussicht stellen (für die Tafel)
export function sideOffer() {
  const sg = G.siege;
  if (!sg) return null;
  const s = sg.site;
  const thanks = s.type === 'stadt' ? 240 : s.type === 'burg' ? 200 : 130;
  const share = Math.round(125 * (s.type === 'stadt' ? 1.4 : 1) / 10) * 10;
  return { thanks, share, fa: sg.army.faction, fs: s.faction };
}

export function joinSiege(side) {
  const why = sideBlock(side);
  if (why) { log(why, 'bad'); return false; }
  const sg = G.siege, s = sg.site, army = sg.army;
  sg.side = side;
  if (side === 'def') {
    army.provoked = true;
    changeRep(army.faction, -5);
    log(sg.walls ? `Du stellst dich auf die Seite von ${s.name}. Am Tor lassen dich die Wachen durch die Pforte ein (E). Halte mit der Besatzung die Bresche!` : `Du stellst dich auf die Seite von ${s.name}. Kämpf mit der Besatzung gegen das Heer!`, 'good');
  } else {
    changeRep(s.faction, -8);
    changeRep(army.faction, 3);
    if (sg.def) sg.def.provoked = true;
    log(`Du reihst dich bei den Belagerern vor ${s.name} ein. Der Hauptmann nickt dir zu: „Wenn du bereit bist, blasen wir zum Sturm.“`, 'good');
  }
  return true;
}

// Deine eigene Belagerung abbrechen: Die Söldner ziehen ab
export function abortOwnSiege() {
  const sg = G.siege;
  if (!sg || !sg.lead) return false;
  endSiege(sg, 'abgezogen');
  return true;
}

export function canCallStorm() { const sg = G.siege; return !!sg && sg.side === 'att' && sg.stage === 'belagerung' && !sg.storm; }
export function callStorm() {
  if (!canCallStorm()) return false;
  const sg = G.siege;
  sg.storm = true;
  if (sg.walls && !sg.walls.st.open) { sg.shotT = Math.min(sg.shotT, 1); log(`Auf dein Zeichen wirft das Trebuchet ohne Pause gegen die Mauer von ${sg.site.name}. Sobald die Bresche offen ist, stürmen alle.`, 'bad'); }
  else log(`Die Hörner blasen zum Sturm auf ${sg.site.name}!`, 'bad');
  return true;
}

// Wer sich einer Seite angeschlossen hat, wird von der anderen angegriffen, sobald er in der Nähe ist
function keepSides(sg) {
  if (!sg.side) return;
  const p = G.s.player, army = sg.army, def = sg.def;
  const alive = (g) => g && g.members.length && G.groups.includes(g);
  const near = (g, r) => g.members.some((m) => Math.hypot(m.x - p.x, m.y - p.y) < r);
  if (p.dead) return;
  if (sg.side === 'def') {
    if (!army.engaged && near(army, 30)) army.engaged = true;
  } else if (alive(def) && !def.engaged && near(def, 26)) def.engaged = true;
}

// Dank, Beute und Folgen für deine Seite
function sideOutcome(sg, how, quiet) {
  const side = sg.side, s = sg.site;
  if (!side || s.type === 'spieler') return;
  const fs = FACTIONS[s.faction].short, fa = FACTIONS[sg.army.faction].short;
  if (quiet) {
    log(`Nachricht aus ${s.name}: ${how === 'gefallen' ? 'Die Stadt ist gefallen.' : 'Die Belagerung ist vorbei.'} Du warst nicht mehr dabei.`);
    return;
  }
  const offer = sideOffer();
  if (side === 'def') {
    if (how !== 'abgewehrt') { log(how === 'gefallen' ? `Trotz deiner Hilfe ist ${s.name} gefallen.` : `Die Belagerer ziehen von ${s.name} ab.`, how === 'gefallen' ? 'bad' : ''); return; }
    const gold = Math.round((offer.thanks * rand(0.85, 1.15)) / 10) * 10;
    G.s.gold += gold;
    changeRep(s.faction, 10);
    addRenown(15);
    (G.s.rescued || (G.s.rescued = {}))[s.id] = G.s.day;
    log(`${s.name} ist gerettet! Man feiert dich auf dem Markt. Dank der Stadt: ${gold} Gold, Ansehen bei den ${fs} +10, Ruhm +15.`, 'gold');
    return;
  }
  if (how !== 'gefallen') { log(`Der Sturm auf ${s.name} ist gescheitert. Die ${fs} werden dir das nicht so bald vergessen.`, 'bad'); return; }
  const gold = Math.round((offer.share * rand(0.75, 1.3)) / 10) * 10;
  G.s.gold += gold;
  const loot = [`${gold} Gold`];
  const town = G.s.towns[s.id];
  if (town) {
    const goods = Object.entries(town.stock).filter(([, n]) => n > 2).sort(() => Math.random() - 0.5).slice(0, 2);
    for (const [g, n] of goods) {
      const k = Math.min(Math.ceil(n / 3), randInt(4, 8), cargoFree());
      if (k <= 0) continue;
      addCargo(g, k); town.stock[g] -= k;
      loot.push(`${k} ${GOODS[g].name}`);
    }
  }
  changeRep(sg.army.faction, 8);
  changeRep(s.faction, -6);
  addRenown(8);
  const bl = G.s.blight || (G.s.blight = {});
  bl[s.id] = Math.max(bl[s.id] || 0, G.s.day + 6);
  log(`${s.name} ist gefallen, und du warst unter den Ersten auf der Mauer. Dein Beuteanteil: ${loot.join(', ')}. Ansehen bei den ${fa} +8, bei den ${fs} −6.`, 'gold');
}
