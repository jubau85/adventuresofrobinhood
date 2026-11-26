// Galgen und Hinrichtungen: Wer beim Wildern oder Stehlen erwischt wird, hängt. Vor Burgen,
// Städten und Marktflecken steht ein Galgen. Die Wachen führen den Verurteilten hinaus, das Urteil
// wird verlesen, der Priester betet, das Volk schaut zu. Danach wird der Tote begraben.
// Wer den Mut hat, schneidet ihn vorher los, und die Wachen greifen an.

import { G, log } from './state.js';
import { T } from './data.js';
import { rand, randInt, pick } from './rng.js';
import { isWalkable, landAt } from './world.js';
import { hourOf, passHours } from './sim.js';
import { makeVillager } from './life.js';
import { makeNpc, spawnGroup, rebuildUnits, chaseTo, partyMembers } from './units.js';
import { isoX, isoY } from './iso.js';
import { changeRep, addRenown } from './politics.js';
import { DEFENDER_NPC, countDead } from './siege.js';
import { isBlighted } from './dynamics.js';

const GALLOWS_TYPES = { burg: 1, stadt: 1, markt: 1 };
const CRIMES = [['Wilderei im Forst des Königs', 'Wilderer'], ['Diebstahl', 'Dieb'], ['Viehdiebstahl', 'Viehdieb'], ['Straßenraub', 'Wegelagerer']];
const CONDEMNED_NAMES = ['Wat Tyler', 'Hob der Lange', 'Will Scathlock', 'Dickon Miller', 'Jack Straw', 'Ned Fletcher', 'Tom Hogg', 'Alan Swift', 'Gib Turner', 'Hal Wood'];
const LAST = ['Ich bin unschuldig!', 'Es war doch nur ein Hase …', 'Sagt meiner Frau, dass ich sie liebe.', 'Gott vergebe euch allen.', 'Meine Kinder hatten Hunger!', 'Der Sheriff soll verflucht sein!'];

// ---------------------------------------------------------------- Galgen vor dem Ort
const gcache = new Map();
let gworld = null;
export function gallowsFor(s) {
  if (!s || !GALLOWS_TYPES[s.type]) return null;
  if (gworld !== G.world) { gcache.clear(); gworld = G.world; }
  if (gcache.has(s.id)) return gcache.get(s.id);
  const W = G.world, N = W.N;
  const near = W.buildings.filter((b) => Math.abs(b.x - s.x) < 32 && Math.abs(b.y - s.y) < 32);
  const bad = (x, y) => {
    const t = W.tiles[Math.floor(y) * N + Math.floor(x)];
    return !isWalkable(W, x, y) || t === T.FOREST || t === T.WATER || t === T.BRIDGE || t === T.ROAD || landAt(W, x, y) !== s.land || (W.solid && W.solid[Math.floor(y) * N + Math.floor(x)]);
  };
  let best = null;
  for (let k = 0; k < 140 && !best; k++) {
    const a = 0.6 + k * 2.399, r = (s.clear || 7) + 2.5 + (k % 6) * 0.8;
    const gx = Math.floor(s.x + Math.cos(a) * r) + 0.5, gy = Math.floor(s.y + Math.sin(a) * r) + 0.5;
    let ok = true;
    for (let y = gy - 1.5; y <= gy + 2.5 && ok; y += 1) for (let x = gx - 2; x <= gx + 2 && ok; x += 1) if (bad(x, y)) ok = false;
    if (!ok || near.some((b) => Math.abs(b.x - gx) < 2.4 && Math.abs(b.y - gy) < 2.4)) continue;
    let road = false;
    for (let y = gy - 3; y <= gy + 3 && !road; y += 1) for (let x = gx - 3; x <= gx + 3; x += 1) if (W.tiles[Math.floor(y) * N + Math.floor(x)] === T.ROAD) { road = true; break; }
    if (road || k > 90) best = { x: gx, y: gy, site: s };
  }
  gcache.set(s.id, best);
  return best;
}

// ---------------------------------------------------------------- Urteile über den Tag verteilt
export function dailyJustice() {
  const h = G.s.hanging;
  if (h && h.day < G.s.day) { if (!h.done) unseen(h); G.s.hanging = null; }
  if (G.exec) endExec();
  if (G.s.hanging || Math.random() > 0.35) return;
  const p = G.s.player, land = landAt(G.world, p.x, p.y);
  const cand = G.world.sites.filter((s) => GALLOWS_TYPES[s.type] && s.land === land && Math.hypot(s.x - p.x, s.y - p.y) < 70 && !isBlighted(s) && gallowsFor(s));
  if (!cand.length) return;
  const s = pick(cand), [crime, who] = pick(CRIMES);
  const hh = { site: s.id, day: G.s.day, hour: randInt(11, 15), crime, who, name: pick(CONDEMNED_NAMES), done: false };
  G.s.hanging = hh;
  if (Math.hypot(s.x - p.x, s.y - p.y) < 45) log(`Ausrufer in ${s.name}: Heute zur ${hh.hour}. Stunde wird ein ${who} am Galgen gehängt.`);
}

// Testmodus: Hinrichtung am nächsten Galgen, jetzt gleich, du stehst schon davor
export function cheatHanging() {
  const p = G.s.player, land = landAt(G.world, p.x, p.y);
  if (hourOf() >= 17.5 || hourOf() < 8) passHours(((11 - hourOf()) + 24) % 24);
  const cand = G.world.sites.filter((s) => GALLOWS_TYPES[s.type] && s.land === land && gallowsFor(s)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const s = cand[0];
  if (!s) { log('Kein Galgen in der Nähe.', 'bad'); return false; }
  if (G.exec) endExec();
  const [crime, who] = pick(CRIMES);
  G.s.hanging = { site: s.id, day: G.s.day, hour: Math.floor(hourOf()), crime, who, name: pick(CONDEMNED_NAMES), done: false };
  const g = gallowsFor(s);
  p.x = g.x + 1.5; p.y = g.y + 4; p.path = null;
  for (const c of partyMembers()) { c.x = p.x + 0.6; c.y = p.y + 0.4; }
  G.cam.x = isoX(p.x, p.y); G.cam.y = isoY(p.x, p.y) - 12;
  log(`Testmodus: Gleich wird am Galgen von ${s.name} ein ${who} gehängt.`, 'gold');
  return true;
}

// Ohne Zuschauer geschieht es trotzdem, der Tote wird begraben
function unseen(h) {
  const s = G.world.sites.find((x) => x.id === h.site);
  const g = gallowsFor(s);
  if (g) countDead({ x: g.x, y: g.y });
  h.done = true;
}

export function hangingToday(s) { const h = G.s.hanging; return h && h.site === s.id && h.day === G.s.day && !h.done ? h : null; }

// ---------------------------------------------------------------- Die Szene
function startExec(h, s, g) {
  const dx = g.x - s.x, dy = g.y - s.y, d = Math.hypot(dx, dy) || 1;
  const start = { x: s.x + (dx / d) * Math.max(2, (s.clear || 6) - 2), y: s.y + (dy / d) * Math.max(2, (s.clear || 6) - 2) };
  const mk = (role, x, y) => { const v = makeVillager(s, role); v.x = x; v.y = y; v.task = null; v.noSep = true; G.peasants.push(v); return v; };
  const e = { h, site: s, g, stage: 'zug', t: 0, hanged: false };
  e.con = mk('bauer', start.x, start.y);
  e.con.name = `${h.name}, ${h.who}`; e.con.tunic = '#d8d0bc'; e.con.hat = null; e.con.condemned = true; e.con.act = 'gefesselt';
  e.guards = [mk('wache', start.x - 0.5, start.y + 0.3), mk('wache', start.x + 0.5, start.y - 0.3)];
  e.priest = mk('priester', start.x + 0.4, start.y + 0.6);
  e.hangman = mk('bauer', g.x + 0.9, g.y + 0.9);
  e.hangman.name = 'Henker'; e.hangman.hat = null; e.hangman.lookObj = { tunic: '#2a2628', trim: '#4a3a2a', hood: '#1a181a' };
  for (const v of [e.con, ...e.guards, e.priest, e.hangman]) v.execution = e;
  G.exec = e;
  // Das Volk läuft zusammen
  for (const v of G.peasants) if (v.home === s && !v.execution && !v.funeral && !v.hidden && v.role !== 'wache' && v.role !== 'bettler') v.task = null;
  rebuildUnits();
  log(`Am Galgen von ${s.name} versammelt sich das Volk. Die Wachen führen ${h.name} hinaus.`);
}

export function endExec() {
  const e = G.exec;
  if (!e) return;
  const temp = [e.con, ...e.guards, e.priest, e.hangman];
  G.peasants = G.peasants.filter((v) => !temp.includes(v) || v.freed);
  G.exec = null;
  rebuildUnits();
}

const speak = (v, text, dur = 3.6) => { if (v && !v.dead) v.say = { text, t: 0, dur }; };

export function updateJustice(dt) {
  const h = G.s.hanging, p = G.s.player;
  if (!h || h.day !== G.s.day) { if (G.exec) endExec(); return; }
  const s = G.world.sites.find((x) => x.id === h.site), g = gallowsFor(s);
  if (!g) return;
  const dist = Math.hypot(g.x - p.x, g.y - p.y);
  if (!G.exec) {
    if (h.done) return;
    if (dist < 45 && hourOf() >= h.hour - 0.4 && hourOf() < 19) startExec(h, s, g);
    else if (hourOf() >= h.hour + 1) unseen(h);
    return;
  }
  const e = G.exec;
  e.t += dt;
  if (dist > 75) { if (!h.done && e.stage !== 'befreit') unseen(h); endExec(); return; }
  const front = { x: g.x, y: g.y + 1.3 };
  if (e.stage === 'zug') {
    chaseTo(e.priest, front.x + 0.9, front.y + 0.4, dt, 0.15, 0.6); e.priest.act = 'kreuz';
    chaseTo(e.con, front.x, front.y, dt, 0.1, 0.55); e.con.act = 'gefesselt';
    e.guards.forEach((v, k) => chaseTo(v, e.con.x + (k ? 0.55 : -0.55), e.con.y + (k ? -0.15 : 0.25), dt, 0.1, 0.62));
    if (Math.hypot(e.con.x - front.x, e.con.y - front.y) < 0.35 || e.t > 45) { e.stage = 'urteil'; e.t = 0; speak(e.guards[0], `Im Namen des Königs: ${h.name}, für ${h.crime} zum Tod durch den Strang verurteilt!`, 5); }
    return;
  }
  if (e.stage === 'urteil') {
    e.priest.act = 'beten';
    if (e.t > 6) { e.stage = 'gebet'; e.t = 0; speak(e.priest, 'Gott sei deiner armen Seele gnädig.'); }
    return;
  }
  if (e.stage === 'gebet') {
    e.priest.act = 'segnen';
    if (e.t > 3 && e.t - dt <= 3) speak(e.con, pick(LAST), 3.4);
    if (e.t > 7.5) { e.stage = 'strang'; e.t = 0; e.priest.act = 'beten'; }
    return;
  }
  if (e.stage === 'strang') {
    chaseTo(e.con, g.x, g.y + 0.25, dt, 0.08, 0.45);
    chaseTo(e.hangman, g.x + 0.7, g.y + 0.35, dt, 0.08, 0.5);
    if (e.t > 4) {
      e.stage = 'haengen'; e.t = 0; e.hanged = true;
      e.con.hidden = true;
      crowdSay(['Oh!', 'Gott steh ihm bei.', 'Armer Kerl.', 'So geht es Dieben.']);
    }
    return;
  }
  if (e.stage === 'haengen') {
    if (e.t > 14) {
      e.stage = 'abnahme'; e.t = 0; e.hanged = false;
      G.fx.push({ kind: 'corpse', x: front.x + 0.2, y: front.y - 0.3, look: { tunic: '#d8d0bc', trim: '#8a7a5a' }, t: 0, dur: 9 });
      countDead({ x: g.x, y: g.y });
      h.done = true;
      speak(e.priest, 'Wir bringen ihn zum Friedhof.');
    }
    return;
  }
  if (e.stage === 'abnahme' || e.stage === 'befreit') {
    for (const v of [e.priest, ...e.guards, e.hangman]) if (!v.dead) chaseTo(v, s.x, s.y, dt, 0.5, 0.6);
    if (e.con.freed) { const fx = e.con.fleeTo; chaseTo(e.con, fx.x, fx.y, dt, 0.3, 1.6); }
    if (e.t > 10) endExec();
  }
}

function crowdSay(lines) {
  const e = G.exec;
  const vs = G.peasants.filter((v) => v.home === e.site && !v.execution && !v.hidden && Math.hypot(v.x - e.g.x, v.y - e.g.y) < 6);
  for (let k = 0; k < 2 && vs.length; k++) speak(vs.splice(Math.floor(Math.random() * vs.length), 1)[0], pick(lines), 2.8);
}

// Wohin die Leute gehen, um zuzusehen
export function hangWatch(s) {
  const e = G.exec;
  if (!e || e.site !== s || !['zug', 'urteil', 'gebet', 'strang', 'haengen'].includes(e.stage)) return null;
  const a = Math.PI * (0.15 + Math.random() * 0.7);
  return { x: e.g.x + Math.cos(a) * rand(2.2, 3.6) - 0.3, y: e.g.y + 1.2 + Math.sin(a) * rand(1.6, 2.8) };
}

// ---------------------------------------------------------------- Befreien
export function canRescue(u) {
  const e = G.exec;
  return !!e && u === e.con && ['zug', 'urteil', 'gebet', 'strang'].includes(e.stage);
}

export function rescueCondemned(u) {
  const e = G.exec;
  if (!canRescue(u)) return false;
  const s = e.site, h = e.h;
  e.stage = 'befreit'; e.t = 0; e.hanged = false;
  const c = e.con;
  c.freed = true; c.condemned = false; c.act = null; c.hidden = false;
  const dx = c.x - s.x, dy = c.y - s.y, d = Math.hypot(dx, dy) || 1;
  c.fleeTo = { x: c.x + (dx / d) * 14, y: c.y + (dy / d) * 14 };
  setTimeout(() => { G.peasants = G.peasants.filter((v) => v !== c); rebuildUnits(); }, 12000);
  speak(c, 'Gott segne Euch! Ich vergesse das nie!', 3.4);
  // Die Wachen greifen an: aus den beiden Wachen wird ein echter Trupp
  const types = DEFENDER_NPC[s.faction] || ['wache'];
  const members = [];
  for (const gv of e.guards) { members.push(makeNpc(types[0], gv.x, gv.y, Math.floor(G.s.day / 10))); gv.hidden = true; }
  for (let k = 0; k < 2; k++) members.push(makeNpc(types[k % 2 ? 1 : 0] || types[0], e.g.x + rand(-1, 1), e.g.y + rand(0.5, 1.5), Math.floor(G.s.day / 10)));
  const grp = spawnGroup('verteidiger', { pos: { x: e.g.x, y: e.g.y + 1 }, membersUnits: members });
  if (grp) { grp.faction = s.faction; grp.engaged = true; grp.provoked = true; grp.wait = 99999; grp.path = null; }
  h.done = true;
  log(`Du schneidest ${h.name} vom Strick los! Er rennt in die Wälder. Die Wachen gehen auf dich los!`, 'gold');
  if (s.faction) changeRep(s.faction, -12);
  changeRep('waldleute', 6);
  if (s.faction === 'normannen') changeRep('sachsen', 3);
  addRenown(3);
  rebuildUnits();
  return true;
}
