// Turniere: Herolde kündigen ein Turnier in einer Stadt oder Burg an. Am Turniertag stehen vor
// dem Ort Schranken, Tribüne und Zelte, das Volk jubelt, Ritter tjosten gegeneinander.
// Wer ein Pferd hat und das Startgeld zahlt, reitet mit: Die Lanze im rechten Moment senken.

import { G, log, homeName, playerColor } from './state.js';
import { FACTIONS, T } from './data.js';
import { rand, randInt, pick, clamp } from './rng.js';
import { makeUnit, rebuildUnits, partyMembers } from './units.js';
import { isoX, isoY } from './iso.js';
import { isWalkable, landAt } from './world.js';
import { hourOf, passHours } from './sim.js';
import { changeRep, addRenown } from './politics.js';
import { makeVillager } from './life.js';
import { isBlighted } from './dynamics.js';

const KNIGHT_NAMES = [
  'Sir Baldwin de Montclair', 'Sir Aymer de Rochefort', 'Sir Gilbert of Wycombe', 'Sir Raoul le Hardi', 'Sir Thurstan of Holderness',
  'Sir Walerand de Brioude', 'Sir Hugh of Ravenscar', 'Sir Odo de Ferrières', 'Sir Alard of Kendal', 'Sir Ivo de Mortain',
  'Sir Godric Eisenhand', 'Sir Enguerrand de Sancerre', 'Der Schwarze Ritter', 'Der Ritter mit dem Falken', 'Sir Hamelin of Lewes',
  'Sir Bertran de Born', 'Sir Robert Lackland', 'Sir Fulk le Brun', 'Sir Osric of Whitby', 'Sir Amaury de Craon',
];
const KNIGHT_COLS = ['#9a2f2a', '#2c4f86', '#3f6b2f', '#5e2f6e', '#a8791f', '#2b2a2e', '#1f6a6a', '#b34a1a', '#6a6a6a', '#8a2a5a', '#c9a227', '#3a3a7a'];
const HOST_TYPES = { stadt: 1, burg: 1, markt: 1 };
const PASS_T = 3.4;           // Sekunden je Durchgang
const IMPACT = 0.585;         // Anteil des Durchgangs bis zum Zusammenprall
const LANE = 0.55;            // Abstand der Bahnen von der Schranke

const ease = (k) => 0.35 * k * k + 0.65 * k;
const akk = (n) => n.replace(/^Der /, 'den ');

// ---------------------------------------------------------------- Ankündigung
function findLists(s) {
  const W = G.world, N = W.N;
  const free = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    if (xi < 2 || yi < 2 || xi >= N - 2 || yi >= N - 2) return false;
    const t = W.tiles[yi * N + xi];
    return isWalkable(W, x, y) && t !== T.FOREST && t !== T.WATER && t !== T.BRIDGE && landAt(W, x, y) === s.land && !(W.solid && W.solid[yi * N + xi]);
  };
  const near = W.buildings.filter((b) => Math.abs(b.x - s.x) < 40 && Math.abs(b.y - s.y) < 40 && b.kind !== 'prop');
  for (let k = 0; k < 160; k++) {
    const a = (k * 2.399) % (Math.PI * 2), r = (s.clear || 7) + 5 + (k % 9);
    const lx = Math.round(s.x + Math.cos(a) * r) + 0.5, ly = Math.round(s.y + Math.sin(a) * r) + 0.5;
    let ok = true;
    for (let y = ly - 3.5; y <= ly + 3.5 && ok; y += 1) for (let x = lx - 8; x <= lx + 8 && ok; x += 1) if (!free(x, y)) ok = false;
    if (!ok) continue;
    if (near.some((b) => Math.abs(b.x - lx) < 9.5 && Math.abs(b.y - ly) < 4.5)) continue;
    return { lx, ly };
  }
  return null;
}

function announce() {
  const p = G.s.player, land = landAt(G.world, p.x, p.y);
  let cand = G.world.sites.filter((s) => HOST_TYPES[s.type] && s.land === land && !isBlighted(s) && Math.hypot(s.x - p.x, s.y - p.y) > 12 && Math.hypot(s.x - p.x, s.y - p.y) < 130);
  if (!cand.length) return;
  if (!G.s.flags.tourneys) { const ashby = cand.find((s) => s.id === 'ashby'); if (ashby) cand = [ashby]; }
  for (let tries = 0; tries < 6; tries++) {
    const s = pick(cand);
    const lists = findLists(s);
    if (!lists) continue;
    const day = G.s.day + randInt(3, 5);
    const big = s.type === 'stadt' ? 1.5 : s.type === 'burg' ? 1.2 : 1;
    const names = KNIGHT_NAMES.slice().sort(() => Math.random() - 0.5).slice(0, 8);
    const cols = KNIGHT_COLS.slice().sort(() => Math.random() - 0.5);
    G.s.tourney = {
      site: s.id, day, lx: lists.lx, ly: lists.ly, prize: Math.round(randInt(140, 220) * big / 10) * 10, fee: Math.round(randInt(20, 35) * big),
      knights: names.map((name, i) => ({ name, col: cols[i % cols.length], skill: Math.round(rand(0.3, 0.85) * 100) / 100 })),
      joined: false, done: false,
    };
    G.s.flags.tourneys = (G.s.flags.tourneys || 0) + 1;
    log(`Herolde rufen aus: In ${day - G.s.day} Tagen (Tag ${day}) wird vor ${s.name} ein Turnier gehalten! Preis ${G.s.tourney.prize} Gold, Startgeld ${G.s.tourney.fee} Gold. Die Schranken sind auf der Karte markiert.`, 'gold');
    return;
  }
}

// Testmodus: Turnier beim nächsten Ort, heute ab der zehnten Stunde, du stehst schon an den Schranken
export function cheatTourney() {
  const p = G.s.player, land = landAt(G.world, p.x, p.y);
  const h = hourOf();
  if (h > 9.6) passHours(24 - h + 9.6);
  else passHours(9.6 - h);
  const cand = G.world.sites.filter((s) => HOST_TYPES[s.type] && s.land === land && !isBlighted(s)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  for (const s of cand.slice(0, 8)) {
    const lists = findLists(s);
    if (!lists) continue;
    if (G.tour) endTour();
    const names = KNIGHT_NAMES.slice().sort(() => Math.random() - 0.5).slice(0, 8);
    const cols = KNIGHT_COLS.slice().sort(() => Math.random() - 0.5);
    G.s.tourney = {
      site: s.id, day: G.s.day, lx: lists.lx, ly: lists.ly, prize: 200, fee: 25,
      knights: names.map((name, i) => ({ name, col: cols[i % cols.length], skill: Math.round(rand(0.3, 0.85) * 100) / 100 })),
      joined: false, done: false,
    };
    p.x = lists.lx + 1; p.y = lists.ly + 3.2; p.path = null;
    for (const c of partyMembers()) { c.x = p.x + 0.6; c.y = p.y + 0.4; }
    G.cam.x = isoX(p.x, p.y); G.cam.y = isoY(p.x, p.y) - 12;
    log(`Testmodus: Heute zur zehnten Stunde ist Turnier vor ${s.name}. Melde dich in ${s.name} an (E) oder schau zu.`, 'gold');
    return true;
  }
  log('Kein Ort für ein Turnier in der Nähe.', 'bad');
  return false;
}

export function dailyTourney() {
  const tr = G.s.tourney;
  if (tr && G.s.day > tr.day) {
    if (!tr.done) finishUnseen(tr);
    G.s.tourney = null;
    G.s.lastTourney = G.s.day;
    endTour();
  }
  if (!G.s.tourney && G.s.day >= 3 && G.s.day - (G.s.lastTourney || 0) >= 5 && Math.random() < 0.3) announce();
}

// Ohne dich: Ein Sieger wird ausgelost, nach Können gewichtet
function finishUnseen(tr) {
  const s = G.world.sites.find((x) => x.id === tr.site);
  if (tr.joined) { log(`Du bist nicht zum Turnier in ${s.name} erschienen. Das Startgeld ist verfallen.`, 'bad'); }
  const w = tr.knights.slice().sort((a, b) => (b.skill + Math.random() * 0.5) - (a.skill + Math.random() * 0.5))[0];
  const p = G.s.player;
  if (Math.hypot(s.x - p.x, s.y - p.y) < 120) log(`${w.name} hat das Turnier von ${s.name} gewonnen, heißt es.`);
  tr.done = true;
}

// ---------------------------------------------------------------- Anmelden
export function tourneyAt(site) { const tr = G.s.tourney; return tr && tr.site === site.id && !tr.done ? tr : null; }
export function canJoin(tr) { return !!G.s.player.eq.pferd && !tr.joined && G.s.gold >= tr.fee && !(G.tour && G.tour.stage !== 'warten'); }
export function joinTourney() {
  const tr = G.s.tourney;
  if (!tr || !canJoin(tr)) return false;
  G.s.gold -= tr.fee;
  tr.joined = true;
  // Der schwächste Ritter tritt für dich zurück
  let weak = 0;
  tr.knights.forEach((k, i) => { if (k.skill < tr.knights[weak].skill) weak = i; });
  tr.knights.splice(weak, 1);
  tr.knights.unshift({ name: G.s.player.name, col: playerColor(), player: true, skill: 0 });
  log(`Du trägst dich in die Turnierliste ein. Sei am Tag ${tr.day} ab der zehnten Stunde bei den Schranken.`, 'good');
  if (G.tour) { endTour(); }
  return true;
}

// ---------------------------------------------------------------- Ablauf am Turniertag
// G.tour lebt nur, solange du in der Nähe bist, und wird nicht gespeichert.
function setupTour(tr) {
  const s = G.world.sites.find((x) => x.id === tr.site);
  const t = { tr, site: s, lx: tr.lx, ly: tr.ly, stage: 'warten', t: 0, knights: [], spectators: [], match: null, queue: [], round: 0, lock: false, aim: null, cheer: 0 };
  // Ritter an ihren Zelten
  tr.knights.forEach((k, i) => {
    let u;
    if (k.player) u = G.s.player;
    else {
      u = makeUnit({ kind: 'npc', cls: 'ritter', name: k.name, level: 3 + Math.round(k.skill * 6), eq: { waffe: 'langschwert', ruestung: 'kettenruestung', schild: 'wappenschild', pferd: 'schlachtross' }, x: 0, y: 0 });
      u.lookObj = { tunic: k.col, trim: '#e8d9a8' };
      u.mounted = true; u.noSep = true; u.tourney = true;
    }
    const tent = tentSpot(t, i);
    if (!k.player) { u.x = tent.x; u.y = tent.y; u.facing = tent.x < t.lx ? 1 : -1; }
    t.knights.push({ ...k, u, out: false, tent });
  });
  G.extras = t.knights.filter((k) => !k.player).map((k) => k.u);
  // Zuschauer vor der Tribüne und an den Seiten
  const n = (G.fpsAvg || 60) >= 40 ? 26 : 14;
  const roles = ['buerger', 'bauer', 'magd', 'buerger', 'kind', 'baeuerin', 'haendler', 'handwerker'];
  for (let k = 0; k < n; k++) {
    const front = k % 3 !== 2;
    const spot = front ? { x: t.lx - 5 + rand(0, 10), y: t.ly + 1.9 + rand(0, 1.3) } : { x: t.lx + (k % 2 ? -1 : 1) * rand(5.6, 7.5), y: t.ly + rand(-0.6, 2.2) };
    if (!isWalkable(G.world, spot.x, spot.y)) continue;
    const v = makeVillager(s, roles[k % roles.length]);
    v.x = spot.x + rand(-2, 2); v.y = spot.y + rand(1, 3);
    v.spectator = spot; v.noSep = true;
    G.peasants.push(v);
    t.spectators.push(v);
  }
  G.tour = t;
  rebuildUnits();
}

function tentSpot(t, i) {
  const side = i % 2 === 0 ? -1 : 1, row = Math.floor(i / 2);
  return { x: t.lx + side * (7.6 + (row % 2) * 0.9), y: t.ly - 1.6 + row * 1.15 };
}

export function endTour() {
  const t = G.tour;
  if (!t) return;
  G.peasants = G.peasants.filter((v) => !v.spectator);
  G.extras = [];
  const p = G.s.player;
  p.lance = false; p.lanceDown = false; p.lanceBroken = false;
  G.tour = null;
  rebuildUnits();
}

export function updateTourney(dt) {
  const tr = G.s.tourney, p = G.s.player;
  if (!tr || tr.done) { if (G.tour) endTour(); return; }
  const near = Math.hypot(tr.lx - p.x, tr.ly - p.y) < 70;
  if (!G.tour) {
    if (G.s.day === tr.day && near && hourOf() >= 8 && hourOf() < 21) setupTour(tr);
    return;
  }
  const t = G.tour;
  if (!near) { endTour(); return; }
  t.t += dt;
  if (t.cheer > 0) t.cheer -= dt;
  for (const v of t.spectators) updateSpectator(v, t, dt);
  if (t.stage === 'warten') {
    for (const k of t.knights) if (!k.player) idleKnight(k, dt);
    if (hourOf() >= 10) {
      t.stage = 'tjost'; t.t = 0;
      t.queue = pairs(t.knights);
      log(`Fanfaren! Das Turnier von ${t.site.name} beginnt. ${t.knights.length} Ritter reiten in die Schranken.`, 'gold');
      shout(t, ['Hurra!', 'Es geht los!', 'Seht nur die Banner!']);
    }
    return;
  }
  if (t.stage === 'tjost') {
    for (const k of t.knights) if (!k.player && (!t.match || (t.match.a !== k && t.match.b !== k))) idleKnight(k, dt);
    if (!t.match) {
      if (t.pauseT > 0) { t.pauseT -= dt; return; }
      if (!t.queue.length) {
        const alive = t.knights.filter((k) => !k.out);
        if (alive.length <= 1) { crown(t, alive[0]); return; }
        t.round++;
        t.queue = pairs(alive);
      }
      startMatch(t, t.queue.shift());
      return;
    }
    updateMatch(t, t.match, dt);
    return;
  }
  if (t.stage === 'ende') {
    for (const k of t.knights) if (!k.player) idleKnight(k, dt);
    if (t.t > 30) { tr.done = true; endTour(); }
  }
}

function pairs(list) {
  const out = [];
  for (let i = 0; i + 1 < list.length; i += 2) out.push([list[i], list[i + 1]]);
  return out;
}

const ROUND_NAME = ['Erste Runde', 'Halbfinale', 'Finale'];
function startMatch(t, [a, b]) {
  const p = G.s.player;
  const withPlayer = a.player || b.player;
  if (withPlayer && Math.hypot(p.x - t.lx, p.y - t.ly) > 30) {
    // Nicht da: kampflos verloren
    const other = a.player ? b : a, me = a.player ? a : b;
    me.out = true;
    log(`Der Herold ruft deinen Namen, doch du bist nicht bei den Schranken. ${other.name} kommt kampflos weiter.`, 'bad');
    return;
  }
  const m = { a, b, pass: 0, ptsA: 0, ptsB: 0, phase: 'aufstellen', t: 0, dirA: 1, player: withPlayer };
  t.match = m;
  if (withPlayer) {
    t.lock = true;
    p.path = null; p.attackTarget = null; p.huntTarget = null;
    p.mounted = true; p.lance = true; p.lanceDown = false; p.lanceBroken = false;
    const foe = a.player ? b : a;
    log(`${ROUND_NAME[Math.min(2, t.round)]}: Du gegen ${foe.name}. Senke die Lanze im richtigen Moment (Leertaste oder Klick)!`, 'gold');
  } else if (t.round === 2 || t.knights.filter((k) => !k.out).length === 2) log(`Das Finale: ${a.name} gegen ${b.name}!`, 'gold');
  for (const k of [a, b]) { k.u.lance = true; k.u.lanceDown = false; k.u.lanceBroken = false; k.u.mounted = true; }
}

function laneStart(t, m, k) {
  // Reiter A beginnt links auf der Nordbahn, B rechts auf der Südbahn; nach jedem Durchgang wenden sie
  const isA = k === m.a, dir = isA ? m.dirA : -m.dirA;
  return { x: t.lx - dir * 5.4, y: t.ly + (isA ? -LANE : LANE), dir };
}

function updateMatch(t, m, dt) {
  m.t += dt;
  const A = m.a.u, B = m.b.u;
  if (m.phase === 'aufstellen') {
    let ready = true;
    for (const k of [m.a, m.b]) {
      const s = laneStart(t, m, k), u = k.u;
      const d = Math.hypot(s.x - u.x, s.y - u.y);
      if (d > 0.15) { ready = false; rideTo(u, s.x, s.y, dt, k.player ? 5 : 3.5); } else { u.moving = false; u.facing = s.dir; }
    }
    if (ready || m.t > 9) { m.phase = 'anlauf'; m.t = 0; A.lanceBroken = false; B.lanceBroken = false; if (m.player) startAim(t, m); }
    return;
  }
  if (m.phase === 'anlauf') {
    const dur = m.player ? PASS_T : PASS_T * 0.85;
    const k = Math.min(1, m.t / dur), e = ease(k);
    for (const kn of [m.a, m.b]) {
      const s = laneStart(t, m, kn), u = kn.u;
      u.x = s.x + s.dir * 10.8 * e; u.y = s.y; u.facing = s.dir; u.moving = true; u.anim += dt * (0.6 + k);
      u.lanceDown = k > 0.22;
    }
    if (t.aim) t.aim.m = Math.min(1, k / IMPACT);
    if (!m.hit && k >= IMPACT) { m.hit = true; resolvePass(t, m); }
    if (k >= 1) {
      for (const kn of [m.a, m.b]) { kn.u.moving = false; kn.u.lanceDown = false; }
      m.pass++; m.hit = false; m.dirA = -m.dirA;
      const a = m.ptsA, b = m.ptsB;
      const decided = m.unhorsed || (m.pass >= 3 && a !== b) || m.pass >= 5;
      if (decided) { endMatch(t, m); return; }
      m.phase = 'wenden'; m.t = 0;
    }
    return;
  }
  if (m.phase === 'wenden') {
    for (const kn of [m.a, m.b]) kn.u.anim += dt * 0.3;
    if (m.t > (m.player ? 1.6 : 1.0)) { m.phase = 'anlauf'; m.t = 0; if (m.player) startAim(t, m); }
  }
}

function rideTo(u, x, y, dt, v) {
  const dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy);
  const step = Math.min(d, v * dt);
  u.x += (dx / d) * step; u.y += (dy / d) * step;
  u.moving = true; u.anim += dt;
  const sx = dx - dy;
  if (Math.abs(sx) > 0.02) u.facing = sx > 0 ? 1 : -1;
}

function idleKnight(k, dt) {
  const u = k.u;
  if (k.out) { u.lance = false; }
  const d = Math.hypot(k.tent.x - u.x, k.tent.y - u.y);
  if (d > 0.2) rideTo(u, k.tent.x, k.tent.y, dt, 2.2);
  else { u.moving = false; u.mounted = !k.out; }
}

// ---------------------------------------------------------------- Zielen (dein Durchgang)
function playerZone() {
  const p = G.s.player;
  const horse = p.eq.pferd === 'schlachtross' ? 0.05 : p.eq.pferd === 'klepper' ? 0 : 0.025;
  return clamp(0.11 + p.level * 0.012 + horse, 0.11, 0.3);
}

function startAim(t) {
  t.aim = { m: 0, c: rand(0.78, 0.88), w: playerZone(), pressed: null };
}

export function joustPress() {
  const t = G.tour;
  if (!t || !t.aim || t.aim.pressed !== null) return false;
  t.aim.pressed = t.aim.m;
  return true;
}

function aimQuality(aim) {
  if (!aim || aim.pressed === null) return { q: 0, why: 'Die Lanze kam nicht herunter!' };
  const d = Math.abs(aim.pressed - aim.c);
  if (d > aim.w / 2) return { q: 0, why: aim.pressed < aim.c ? 'Zu früh gesenkt!' : 'Zu spät gesenkt!' };
  return { q: 1 - d / (aim.w / 2), why: null };
}

// ---------------------------------------------------------------- Zusammenprall
function stability(k) {
  if (!k.player) return k.skill * 0.6;
  const p = G.s.player;
  return clamp(p.st.def / 40 + (p.st.horse ? p.st.horse.def / 10 : 0) + p.level * 0.02, 0, 0.6);
}

function strike(q, foeStab) {
  if (q <= 0.05) return 'verfehlt';
  if (q < 0.45) return 'treffer';
  if (q < 0.8) return Math.random() < 0.65 ? 'bruch' : 'treffer';
  return Math.random() < 0.45 + (q - 0.8) * 1.5 - foeStab * 0.3 ? 'abwurf' : 'bruch';
}

const PTS = { verfehlt: 0, treffer: 1, bruch: 2, abwurf: 3 };
const SHOUT = { verfehlt: 'Verfehlt', treffer: 'Treffer!', bruch: 'Lanzenbruch!', abwurf: 'Abgeworfen!' };

function resolvePass(t, m) {
  let qa, qb, why = null;
  const qNpc = (k) => clamp(k.skill + rand(-0.38, 0.22), 0, 1);
  if (m.a.player) { const r = aimQuality(t.aim); qa = r.q; why = r.why; } else qa = qNpc(m.a);
  if (m.b.player) { const r = aimQuality(t.aim); qb = r.q; why = r.why; } else qb = qNpc(m.b);
  t.aim = null;
  const ra = strike(qa, stability(m.b)), rb = strike(qb, stability(m.a));
  m.ptsA += Math.min(2, PTS[ra]); m.ptsB += Math.min(2, PTS[rb]);
  const A = m.a.u, B = m.b.u;
  const fxText = (u, text, col) => G.fx.push({ kind: 'text', x: u.x, y: u.y - 0.2, text, color: col, t: 0, dur: 1.6 });
  fxText(B, SHOUT[ra], ra === 'verfehlt' ? '#e8dcc8' : '#ffd84a');
  fxText(A, SHOUT[rb], rb === 'verfehlt' ? '#e8dcc8' : '#ffd84a');
  if (why) G.fx.push({ kind: 'text', x: G.s.player.x, y: G.s.player.y + 0.6, text: why, color: '#ff9a80', t: -0.4, dur: 1.8 });
  if (ra === 'bruch' || ra === 'abwurf') { A.lanceBroken = true; splinter(t.lx, t.ly); }
  if (rb === 'bruch' || rb === 'abwurf') { B.lanceBroken = true; splinter(t.lx, t.ly); }
  if (ra === 'abwurf') unhorse(m.b, m);
  if (rb === 'abwurf') unhorse(m.a, m);
  if (ra !== 'verfehlt' || rb !== 'verfehlt') { t.cheer = 2.2; shout(t, ra === 'abwurf' || rb === 'abwurf' ? ['Aaah!', 'Er fällt!', 'Was für ein Stoß!'] : ['Hurra!', 'Gut getroffen!', 'Noch einmal!']); }
}

function splinter(x, y) {
  for (let k = 0; k < 7; k++) G.fx.push({ kind: 'splitter', x, y, vx: rand(-2.2, 2.2), vy: rand(-1.4, 1.4), z0: 18, t: 0, dur: 0.8 });
}

function unhorse(k, m) {
  const u = k.u;
  m.unhorsed = m.unhorsed || k;
  u.mounted = false; u.lance = false;
  G.fx.push({ kind: 'staub', x: u.x, y: u.y, t: 0, dur: 1.2 });
  G.fx.push({ kind: 'pferd', x: u.x, y: u.y, vx: (u.facing || 1) * 2.2, vy: -(u.facing || 1) * 2.2, col: k.player ? '#7a5232' : '#3a2a22', look: k.player ? null : u.lookObj, t: 0, dur: 3 });
  u.y += k === m.a ? -0.7 : 0.7;
  if (k.player) {
    const p = G.s.player;
    p.hp = Math.max(1, Math.round(p.hp - p.st.maxHp * 0.25));
    log('Du wirst aus dem Sattel gehoben und landest hart im Sand!', 'bad');
  }
}

function endMatch(t, m) {
  let win, lose;
  if (m.unhorsed) { lose = m.unhorsed; win = lose === m.a ? m.b : m.a; }
  else if (m.ptsA !== m.ptsB) { win = m.ptsA > m.ptsB ? m.a : m.b; lose = win === m.a ? m.b : m.a; }
  else { win = Math.random() < 0.5 ? m.a : m.b; lose = win === m.a ? m.b : m.a; m.lot = true; }
  lose.out = true;
  const score = `${Math.max(m.ptsA, m.ptsB)}:${Math.min(m.ptsA, m.ptsB)}${m.lot ? ', das Los entscheidet' : ''}`;
  if (win.player) log(`Du besiegst ${akk(lose.name)}${m.unhorsed ? ' und hebst ihn aus dem Sattel' : ` nach Punkten (${score})`}!`, 'good');
  else if (lose.player) {
    log(`${win.name} besiegt dich${m.unhorsed ? '' : ` nach Punkten (${score})`}. Für dich ist das Turnier vorbei.`, 'bad');
    const r = t.round;
    if (r >= 1) { addRenown(r >= 2 ? 6 : 3); }
    if (r >= 2) { const prize = Math.round(t.tr.prize / 3); G.s.gold += prize; log(`Als Zweiter erhältst du ${prize} Gold.`, 'good'); }
  } else if (Math.hypot(G.s.player.x - t.lx, G.s.player.y - t.ly) < 40) log(`${win.name} schlägt ${akk(lose.name)}${m.unhorsed ? ' aus dem Sattel' : ` (${score})`}.`);
  if (m.player) {
    t.lock = false;
    const p = G.s.player;
    p.lance = false; p.lanceDown = false; p.mounted = !!p.st.horse;
    p.x = t.lx + rand(-1, 1); p.y = t.ly + 2.4;
  }
  for (const k of [m.a, m.b]) { if (!k.player) { k.u.lanceDown = false; k.u.mounted = true; } }
  t.match = null;
  t.pauseT = 2.5;
}

function crown(t, k) {
  t.stage = 'ende'; t.t = 0;
  const s = t.site;
  if (!k) { t.tr.done = true; return; }
  if (k.player) {
    const prize = t.tr.prize;
    G.s.gold += prize;
    log(`Du gewinnst das Turnier von ${s.name}! Die Menge jubelt, die Herolde rufen deinen Namen. Preis: ${prize} Gold.`, 'gold');
    addRenown(20);
    if (s.faction) changeRep(s.faction, 8);
    G.s.flags.champion = (G.s.flags.champion || 0) + 1;
    G.celebrate = { label: `Turniersieger von ${s.name}`, t0: G.time, x: G.s.player.x, y: G.s.player.y };
  } else log(`${k.name} gewinnt das Turnier von ${s.name}!`, 'gold');
  t.cheer = 6;
  shout(t, [`Hoch lebe ${k.player ? G.s.player.name : k.name}!`, 'Ein Champion!', 'Hurra! Hurra!']);
}

// ---------------------------------------------------------------- Zuschauer
function updateSpectator(v, t, dt) {
  const s = v.spectator;
  const d = Math.hypot(s.x - v.x, s.y - v.y);
  if (d > 0.2) { const dx = s.x - v.x, dy = s.y - v.y; v.x += (dx / d) * Math.min(d, 1.4 * dt); v.y += (dy / d) * Math.min(d, 1.4 * dt); v.moving = true; v.anim += dt; v.act = null; return; }
  v.moving = false;
  const sx = (t.lx - v.x) - (t.ly - v.y);
  v.facing = sx >= 0 ? 1 : -1;
  v.act = t.cheer > 0 && (v.id % 3 !== 0 || t.cheer > 3) ? 'jubeln' : (v.id % 4 === 0 ? 'reden' : 'stehen');
}

function shout(t, lines) {
  const vs = t.spectators.filter((v) => !v.say);
  for (let k = 0; k < 2 && vs.length; k++) { const v = vs.splice(Math.floor(Math.random() * vs.length), 1)[0]; v.say = { text: pick(lines), t: -k * 0.6, dur: 2.6 }; }
}

// Wohin die Bewohner des Ausrichters gehen, um zuzuschauen
export function watchSpot(site) {
  const t = G.tour;
  if (!t || t.site !== site || t.stage === 'warten' && hourOf() < 9) return null;
  return { x: t.lx - 5 + rand(0, 10), y: t.ly + 2 + rand(0, 1.6) };
}

// Gefolge schaut von der Seite zu, solange du reitest
export function companionWatch(k) {
  const t = G.tour;
  if (!t || !t.lock) return null;
  return { x: t.lx - 6.4 + k * 0.6, y: t.ly + 2.6 };
}

// ---------------------------------------------------------------- Status und Zeichnen
export function tourneyStatus() {
  const t = G.tour;
  if (!t) return null;
  if (t.stage === 'warten') return `Turnier in ${t.site.name}: Beginn zur zehnten Stunde`;
  if (t.stage === 'ende') return `Turnier in ${t.site.name}: vorbei`;
  const m = t.match;
  if (!m) return `Turnier in ${t.site.name}: Die nächsten Ritter reiten ein`;
  return `Turnier: ${m.a.player ? 'Du' : m.a.name} <b>${m.ptsA}</b> gegen <b>${m.ptsB}</b> ${m.b.player ? 'Du' : m.b.name} · Durchgang ${Math.min(5, m.pass + 1)}`;
}

// Schranken, Tribüne und Zelte stehen am Vortag und am Turniertag
export function tourneyLayout() {
  const tr = G.s.tourney;
  if (!tr || G.s.day < tr.day - 1 || G.s.day > tr.day) return null;
  return { lx: tr.lx, ly: tr.ly, knights: tr.knights, building: G.s.day < tr.day, host: G.world.sites.find((s) => s.id === tr.site) };
}
