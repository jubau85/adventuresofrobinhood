// Mehrspieler (Phase 7, Kern): Ein Spieler ist Gastgeber und rechnet die gemeinsame Welt – Uhrzeit und Tage, Märkte,
// Barone, Krieg, Grafschaften, Schäden und Bauten, Wetter. Die Gäste spielen ihren Helden mit Gefolge, Gold und
// Aufträgen selbst und bekommen die Welt vom Gastgeber; ihr Dorfleben, Tiere und Begegnungen unterwegs rechnet jeder
// für sich. Jeder Mensch sitzt auf einem Platz: der Gastgeber auf seiner Burg ('heim'), Gäste auf der Burg eines
// Barons, dessen KI dann ruht. Was die gemeinsame Welt ändert, schickt ein Gast als Befehl an den Gastgeber.
// Geht der Gastgeber, übernimmt der Gast mit der kleinsten Kennung mit dem zuletzt empfangenen Weltstand.
// Die Verbindung selbst liegt in net.js (Browser-Kanal, Relais, später Steam).

import { G, log } from './state.js';
import { openTransport, netId } from './net.js';
import { makeUnit } from './units.js';
import { BARONS, BARON_IDS, applyBarons, baronSite } from './barons.js';
import { applyDamage } from './siege.js';
import { applyCons } from './dynamics.js';

// Was zur gemeinsamen Welt gehört; alles andere im Spielstand gehört dem einzelnen Spieler
export const SHARED_KEYS = ['seed', 'difficulty', 'day', 'time', 'weather', 'snow', 'damage', 'blight', 'abandoned', 'slain', 'raided',
  'graves', 'pendingDead', 'deadDay', 'freedAt', 'cons', 'worldSig', 'barons', 'baronLog', 'war', 'shires', 'walls', 'siteLevel',
  'siteFaction', 'mines', 'tourney', 'lastTourney', 'hanging', 'campState', 'castle', 'castleName', 'hostArms'];
const MARKET_KEYS = ['towns'];
// Wer neu beitritt, erzeugt erst die Welt (das dauert einige Sekunden, in denen er nichts sendet): so lange Schonfrist
const HERO_EVERY = 0.1, CLOCK_EVERY = 0.5, WORLD_EVERY = 3, MARKET_EVERY = 8, HELLO_EVERY = 2, PEER_TIMEOUT = 7, HOST_TIMEOUT = 8, JOIN_GRACE = 120;

export function mpActive() { return !!G.mp; }
export function mpGuest() { return !!(G.mp && G.mp.role === 'guest'); }
export function mpHostRole() { return !!(G.mp && G.mp.role === 'host'); }

function hashText(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + t.length; }
function pickKeys(s, keys) { const o = {}; for (const k of keys) if (s[k] !== undefined) o[k] = s[k]; return o; }
const clone = (o) => JSON.parse(JSON.stringify(o));

// Plätze: 'heim' (die Burg des ersten Gastgebers) und je Baron seine Burg
export function seatIds() { return ['heim', ...BARON_IDS]; }
export function seatName(seat) {
  if (seat === 'heim') return (G.s && (G.s.castleName)) || 'Ashcombe';
  const s = G.world && baronSite(seat);
  return s ? s.name : (BARONS[seat] ? BARONS[seat].short : seat);
}

function me() { return { name: G.s ? G.s.player.name : '?', color: G.s ? G.s.color : '#888', arms: G.s ? G.s.arms : null, female: G.s ? !!G.s.player.female : false }; }

function newSession(role, opts) {
  const id = opts.id || netId();
  const tr = openTransport({ kind: opts.kind || 'kanal', room: opts.room || 'burg', url: opts.url || '', id });
  const mp = {
    role, id, room: opts.room || 'burg', kind: opts.kind || 'kanal', tr, hostId: role === 'host' ? id : null,
    peers: new Map(), seats: {}, seat: null, t: { hero: 0, clock: 0, world: 0, market: 0, hello: 0 },
    hash: { world: '', market: '' }, lastHost: performance.now() / 1000, pending: new Map(), cmdSeq: 1,
  };
  tr.on((env) => onMessage(mp, env));
  return mp;
}

// ---------------------------------------------------------------- Partie eröffnen und beitreten
// Gastgeber: die laufende Partie (eigener Spielstand) wird geöffnet; der Gastgeber sitzt auf seiner Burg
export function mpHost(opts = {}) {
  const mp = newSession('host', opts);
  mp.seats.heim = mp.id;
  mp.seat = 'heim';
  G.mp = mp;
  G.s.hostArms = { arms: G.s.arms, color: G.s.color, name: G.s.player.name };
  hookGame();
  log(`Die Partie „${mp.room}“ ist offen. Mitspieler treten mit diesem Namen bei.`, 'gold');
  return mp;
}

// Gast: Lebenszeichen senden, bis ein Gastgeber mit dem Weltstand antwortet. onWelcome baut daraus das Spiel (main.js).
export function mpJoin(opts, onWelcome, onFail) {
  const mp = newSession('guest', opts);
  mp.want = opts.seat || null;
  mp.join = { name: opts.name, color: opts.color, arms: opts.arms, female: !!opts.female, want: mp.want };
  mp.onWelcome = onWelcome;
  G.mp = mp;
  let tries = 0;
  const knock = () => {
    if (G.mp !== mp || mp.welcomed) return;
    if (++tries > 10) { G.mp = null; mp.tr.close(); if (onFail) onFail('Keine Partie mit diesem Namen gefunden.'); return; }
    mp.tr.broadcast('hallo', mp.join);
    setTimeout(knock, 700);
  };
  mp.tr.ready.then((ok) => { if (!ok) { G.mp = null; if (onFail) onFail('Keine Verbindung zum Relais.'); return; } knock(); });
  return mp;
}

export function mpLeave() {
  const mp = G.mp;
  if (!mp) return;
  mp.tr.broadcast('tschuess', {});
  mp.tr.close();
  for (const p of mp.peers.values()) dropHero(p);
  G.mp = null;
  G.remoteUnits = [];
}

// ---------------------------------------------------------------- Laufend (aus der Hauptschleife)
export function mpUpdate(dt) {
  const mp = G.mp;
  if (!mp || !G.started || (mp.role === 'guest' && !mp.welcomed)) return;
  const now = performance.now() / 1000;
  for (const k of Object.keys(mp.t)) mp.t[k] += dt;
  if (mp.t.hero >= HERO_EVERY) { mp.t.hero = 0; mp.tr.broadcast('held', heroState()); }
  if (mp.t.hello >= HELLO_EVERY) { mp.t.hello = 0; mp.tr.broadcast('da', { ...me(), seat: mp.seat, role: mp.role }); }
  if (mp.role === 'host') {
    if (mp.t.clock >= CLOCK_EVERY) { mp.t.clock = 0; mp.tr.broadcast('uhr', { day: G.s.day, time: G.s.time, fast: !!G.fast }); }
    if (mp.t.world >= WORLD_EVERY) { mp.t.world = 0; sendWorld(mp, false); }
    if (mp.t.market >= MARKET_EVERY) { mp.t.market = 0; sendMarkets(mp, false); }
  } else if (now - mp.lastHost > HOST_TIMEOUT) migrate(mp);
  // Mitspieler, von denen nichts mehr kommt, verschwinden
  for (const [id, p] of mp.peers) if (now - p.last > PEER_TIMEOUT && !(p.joinUntil > now && !p.hero)) peerGone(mp, id, 'ist nicht mehr zu erreichen');
  moveHeroes(dt);
}

function heroState() {
  const p = G.s.player;
  return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), m: !!p.mounted, run: !!p.run, sw: p.swing > 0 ? 1 : 0, dead: !!p.dead,
    eq: { waffe: p.eq.waffe, ruestung: p.eq.ruestung, schild: p.eq.schild, pferd: p.eq.pferd }, fem: !!p.female, col: G.s.color, name: p.name };
}

function sendWorld(mp, force, to = null) {
  const w = pickKeys(G.s, SHARED_KEYS), text = JSON.stringify(w), h = hashText(text);
  if (!force && h === mp.hash.world) return;
  mp.hash.world = h;
  if (to) mp.tr.send(to, 'welt', w); else mp.tr.broadcast('welt', w);
}
function sendMarkets(mp, force, to = null) {
  const w = pickKeys(G.s, MARKET_KEYS), text = JSON.stringify(w), h = hashText(text);
  if (!force && h === mp.hash.market) return;
  mp.hash.market = h;
  if (to) mp.tr.send(to, 'maerkte', w); else mp.tr.broadcast('maerkte', w);
}

// ---------------------------------------------------------------- Nachrichten
function peer(mp, id) {
  let p = mp.peers.get(id);
  if (!p) { p = { id, name: '?', color: '#888', seat: null, last: performance.now() / 1000, hero: null, unit: null }; mp.peers.set(id, p); }
  p.last = performance.now() / 1000;
  return p;
}

function onMessage(mp, env) {
  if (G.mp !== mp) return;
  const { f: from, y: type, d } = env;
  if (mp.role === 'host' && type === 'hallo') return welcome(mp, from, d);
  if (type === 'willkommen') return mp.role === 'guest' && !mp.welcomed ? welcomed(mp, from, d) : null;
  if (mp.role === 'guest' && !mp.welcomed) return;
  const p = peer(mp, from);
  if (from === mp.hostId) mp.lastHost = performance.now() / 1000;
  switch (type) {
    case 'da': Object.assign(p, { name: d.name, color: d.color, arms: d.arms, female: d.female, seat: d.seat }); if (d.role === 'host' && mp.role === 'guest') mp.hostId = from; break;
    case 'held': p.hero = d; p.name = d.name || p.name; p.color = d.col || p.color; break;
    case 'uhr': if (mp.role === 'guest' && from === mp.hostId) applyClock(d); break;
    case 'welt': if (mp.role === 'guest' && from === mp.hostId) applyWorld(d); break;
    case 'maerkte': if (mp.role === 'guest' && from === mp.hostId) Object.assign(G.s, d); break;
    case 'sitze': if (from === mp.hostId) { mp.seats = d.seats; if (d.seats) for (const [s, id] of Object.entries(d.seats)) if (id === mp.id) mp.seat = s; } break;
    case 'chat': log(`${String(d.name || p.name).slice(0, 24)}: ${String(d.text || '').slice(0, 200)}`, 'chat'); break;
    case 'befehl': if (mp.role === 'host') runCommand(mp, from, d); break;
    case 'antwort': { const cb = mp.pending.get(d.n); if (cb) { mp.pending.delete(d.n); cb(d); } break; }
    case 'gastgeber': mp.hostId = from; if (mp.role === 'host' && from !== mp.id) mp.role = 'guest'; log(`${p.name} ist jetzt Gastgeber der Partie.`, 'gold'); break;
    case 'tschuess': peerGone(mp, from, 'hat die Partie verlassen'); break;
  }
}

// Gastgeber: ein neuer Mitspieler klopft an. Er bekommt einen freien Platz (den gewünschten, wenn er frei ist) und den
// ganzen Weltstand.
function welcome(mp, from, d) {
  const p = peer(mp, from);
  Object.assign(p, { name: d.name || 'Gast', color: d.color, arms: d.arms, female: d.female });
  let seat = Object.keys(mp.seats).find((s) => mp.seats[s] === from) || null;
  if (!seat) {
    const free = seatIds().filter((s) => !mp.seats[s] && s !== 'heim' && G.s.barons && G.s.barons[s] && !G.s.barons[s].gone);
    seat = d.want && free.includes(d.want) ? d.want : free[0] || null;
    if (!seat) { mp.tr.send(from, 'willkommen', { voll: true }); return; }
    mp.seats[seat] = from;
    if (G.s.barons[seat]) G.s.barons[seat].human = { id: from, name: p.name, color: p.color };
    log(`${p.name} tritt der Partie bei und übernimmt ${seatName(seat)}.`, 'gold');
  }
  p.seat = seat;
  p.joinUntil = performance.now() / 1000 + JOIN_GRACE;
  mp.tr.send(from, 'willkommen', { hostId: mp.id, host: me(), seat, seats: mp.seats, world: pickKeys(G.s, [...SHARED_KEYS, ...MARKET_KEYS]), seed: G.s.seed });
  mp.tr.broadcast('sitze', { seats: mp.seats });
  mp.hash.world = '';
}

function welcomed(mp, from, d) {
  if (d.voll) { mpLeave(); if (mp.onWelcome) mp.onWelcome(null, 'Alle Plätze in dieser Partie sind besetzt.'); return; }
  mp.welcomed = true;
  mp.hostId = from;
  if (d.host) Object.assign(peer(mp, from), { name: d.host.name, color: d.host.color, arms: d.host.arms, female: d.host.female, seat: 'heim' });
  mp.seat = d.seat;
  mp.seats = d.seats;
  mp.lastHost = performance.now() / 1000;
  if (mp.onWelcome) mp.onWelcome(d);
}

// ---------------------------------------------------------------- Weltstand beim Gast
function applyClock(d) {
  const s = G.s;
  // Tage nachholen (nur die eigenen Tagesdinge, siehe sim.js), Uhrzeit nachziehen; kleine Abweichungen weich
  if (d.day > s.day + 30) s.day = d.day - 1;
  while (s.day < d.day) { s.time = 0; if (G.mpNewDay) G.mpNewDay(); else s.day++; }
  if (s.day === d.day) { const diff = d.time - s.time; s.time += Math.abs(diff) > 30 ? diff : diff * 0.3; }
  G.fast = !!d.fast;
}

function applyWorld(w) {
  const s = G.s, before = { barons: JSON.stringify(s.barons || null), damage: JSON.stringify(s.damage || null), cons: JSON.stringify(s.cons || null), castle: JSON.stringify(s.castle || null) };
  const day = s.day, time = s.time;
  Object.assign(s, w);
  s.day = day; s.time = time;   // die Uhr kommt über 'uhr'
  if (JSON.stringify(s.barons || null) !== before.barons) applyBarons();
  if (JSON.stringify(s.damage || null) !== before.damage) applyDamage();
  if (JSON.stringify(s.cons || null) !== before.cons) applyCons();
  if (JSON.stringify(s.castle || null) !== before.castle) G.castleDirty = true;
  G.staticDirty = true;
}

// ---------------------------------------------------------------- Befehle (Gast -> Gastgeber)
export function mpCommand(cmd, args = {}, cb = null) {
  const mp = G.mp;
  if (!mp) return false;
  if (mp.role === 'host') { const r = execCommand(mp, mp.id, cmd, args); if (cb) cb(r); return true; }
  const n = mp.cmdSeq++;
  if (cb) mp.pending.set(n, cb);
  mp.tr.send(mp.hostId, 'befehl', { n, cmd, args });
  return true;
}
function runCommand(mp, from, d) {
  const r = execCommand(mp, from, d.cmd, d.args || {});
  mp.tr.send(from, 'antwort', { n: d.n, ...r });
}
const COMMANDS = {
  // Ein Gast hat auf dem Markt gekauft (negativ) oder verkauft (positiv): das Warenlager der Stadt nachführen
  markt(mp, from, a) {
    const town = G.s.towns && G.s.towns[a.site];
    if (!town || !(a.good in town.stock)) return { ok: false };
    town.stock[a.good] = Math.max(0, (town.stock[a.good] || 0) + Math.max(-50, Math.min(50, a.delta | 0)));
    return { ok: true, stock: town.stock[a.good] };
  },
  // Platz wechseln (auf eine freie Baronsburg)
  sitz(mp, from, a) {
    const seat = a.seat;
    if (!BARONS[seat] || mp.seats[seat] || !G.s.barons[seat] || G.s.barons[seat].gone) return { ok: false, msg: 'Dieser Platz ist nicht frei.' };
    const old = Object.keys(mp.seats).find((s) => mp.seats[s] === from);
    if (old && old !== 'heim') { delete mp.seats[old]; if (G.s.barons[old]) delete G.s.barons[old].human; }
    mp.seats[seat] = from;
    const p = mp.peers.get(from) || { name: 'Gast' };
    G.s.barons[seat].human = { id: from, name: p.name, color: p.color };
    mp.tr.broadcast('sitze', { seats: mp.seats });
    return { ok: true, seat };
  },
};
function execCommand(mp, from, cmd, args) {
  const f = COMMANDS[cmd];
  if (!f) return { ok: false, msg: 'Unbekannter Befehl.' };
  try { return f(mp, from, args); } catch (e) { return { ok: false, msg: e.message }; }
}

// Kauf und Verkauf beim Gast: der Gastgeber führt die Warenlager
export function mpNoteStock(siteId, good, delta) {
  if (mpGuest() && delta) mpCommand('markt', { site: siteId, good, delta });
}

export function mpChat(text) {
  const mp = G.mp;
  const t = String(text || '').trim().slice(0, 200);
  if (!mp || !t) return;
  mp.tr.broadcast('chat', { text: t, name: G.s.player.name });
  log(`${G.s.player.name}: ${t}`, 'chat');
}

// ---------------------------------------------------------------- Gastgeber-Wechsel und Abschied
function peerGone(mp, id, why) {
  const p = mp.peers.get(id);
  if (!p) return;
  mp.peers.delete(id);
  dropHero(p);
  log(`${p.name} ${why}.`, 'info');
  if (mp.role === 'host') {
    for (const [s, pid] of Object.entries(mp.seats)) if (pid === id) { delete mp.seats[s]; if (G.s.barons && G.s.barons[s]) delete G.s.barons[s].human; }
    mp.tr.broadcast('sitze', { seats: mp.seats });
  } else if (id === mp.hostId) migrate(mp);
}

function migrate(mp) {
  const now = performance.now() / 1000;
  const alive = [mp.id, ...[...mp.peers.values()].filter((p) => p.id !== mp.hostId && now - p.last < PEER_TIMEOUT).map((p) => p.id)].sort();
  const old = mp.hostId;
  mp.lastHost = now;
  if (old) { const p = mp.peers.get(old); if (p) { mp.peers.delete(old); dropHero(p); } }
  if (alive[0] === mp.id) {
    mp.role = 'host';
    mp.hostId = mp.id;
    for (const [s, pid] of Object.entries(mp.seats)) if (pid === old) delete mp.seats[s];
    mp.hash.world = ''; mp.hash.market = '';
    mp.tr.broadcast('gastgeber', {});
    mp.tr.broadcast('sitze', { seats: mp.seats });
    log('Der Gastgeber ist fort. Du führst die Partie jetzt weiter.', 'gold');
  } else mp.hostId = alive[0];
}

// ---------------------------------------------------------------- Helden der Mitspieler
function dropHero(p) {
  if (p.unit && G.remoteUnits) G.remoteUnits = G.remoteUnits.filter((u) => u !== p.unit);
  p.unit = null;
}
function moveHeroes(dt) {
  const mp = G.mp;
  if (!G.remoteUnits) G.remoteUnits = [];
  for (const p of mp.peers.values()) {
    const h = p.hero;
    if (!h) continue;
    let u = p.unit;
    if (!u) {
      u = makeUnit({ kind: 'remote', cls: 'ritter', name: h.name || p.name, eq: h.eq, female: h.fem, x: h.x, y: h.y, tunic: h.col });
      u.team = 'remote'; u.peer = p.id;
      p.unit = u;
      G.remoteUnits.push(u);
    }
    u.name = h.name || p.name; u.tunic = h.col || p.color; u.female = !!h.fem; u.eq = { ...u.eq, ...h.eq }; u.mounted = !!h.m; u.run = !!h.run; u.dead = !!h.dead;
    if (h.sw && !(u.swing > 0)) u.swing = 0.3;
    if (u.swing > 0) u.swing -= dt;
    const dx = h.x - u.x, dy = h.y - u.y, d = Math.hypot(dx, dy);
    if (d > 6) { u.x = h.x; u.y = h.y; }
    else if (d > 0.01) {
      const k = Math.min(1, dt * 10);
      u.x += dx * k; u.y += dy * k;
      u.dirX = dx / d; u.dirY = dy / d;
      const sx = dx - dy;
      if (Math.abs(sx) > 0.02) u.facing = sx >= 0 ? 1 : -1;
    }
    u.moving = d > 0.03;
  }
}

// Spieler in der Partie, für die Anzeige: [{ name, color, seat, you, host }]
export function mpRoster() {
  const mp = G.mp;
  if (!mp) return [];
  const out = [{ name: G.s.player.name, color: G.s.color, seat: mp.seat, you: true, host: mp.role === 'host' }];
  for (const p of mp.peers.values()) out.push({ name: p.name, color: p.color, seat: p.seat, you: false, host: p.id === mp.hostId });
  return out;
}

// Hinweise an das Spiel: Gäste rechnen die gemeinsame Welt nicht selbst (sim.js fragt mpGuest()), Käufe melden sie
function hookGame() { G.remoteUnits = G.remoteUnits || []; }
export function mpHookGuest() {
  hookGame();
  const mp = G.mp;
  if (!mp) return;
  const now = performance.now() / 1000;
  mp.lastHost = now;
  for (const p of mp.peers.values()) p.last = now;
  mp.t.hello = HELLO_EVERY;   // gleich beim nächsten Bild melden
}
