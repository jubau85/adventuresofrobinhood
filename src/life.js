// Alltag in Städten, Dörfern, Abteien, Burgen und auf den Einzelhöfen.
// Jeder Bewohner hat eine Rolle und folgt einem Tagesablauf: morgens zum Brunnen, tagsüber
// aufs Feld, an den Amboss oder hinter den Marktstand, mittags ein Schwatz, abends nach Hause.

import { G, homeName, log } from './state.js';
import { siteColor } from './holdings.js';
import { changeRep, addRenown } from './politics.js';
import { T, PEASANT_TUNICS, HAIR, GOODS, FACTIONS } from './data.js';
import { isWalkable, doorOf, freeNear } from './world.js';
import { rand, pick } from './rng.js';
import { makeUnit, placeNear, chaseTo, rebuildUnits, faceDir } from './units.js';
import { hourOf, seasonIndex } from './sim.js';
import { standing, underConstruction, isBlighted, isAbandoned, burningIn, douse, siteHouses, workOn } from './dynamics.js';
import { takeAnimal } from './animals.js';
import { watchSpot } from './tournament.js';
import { hangWatch } from './justice.js';
import { precip } from './weather.js';
import { baron } from './barons.js';

// Rollen je Ortstyp (der Rest der Bewohner ergibt sich daraus)
const ROLES = {
  stadt: ['haendler', 'haendler', 'haendler', 'haendler', 'magd', 'magd', 'handwerker', 'handwerker', 'buerger', 'buerger', 'buerger', 'buerger', 'kind', 'kind', 'moench', 'wache', 'priester', 'wirt', 'fischer'],
  markt: ['haendler', 'haendler', 'haendler', 'magd', 'bauer', 'bauer', 'handwerker', 'buerger', 'buerger', 'kind', 'priester', 'wirt', 'fischer'],
  dorf: ['bauer', 'bauer', 'bauer', 'baeuerin', 'magd', 'handwerker', 'hirte', 'kind', 'kind', 'priester', 'wirt', 'jaeger', 'fischer'],
  halle: ['bauer', 'bauer', 'magd', 'baeuerin', 'handwerker', 'wache', 'kind', 'priester', 'wirt', 'jaeger', 'jaeger'],
  abtei: ['moench', 'moench', 'moench', 'moench', 'moench', 'bauer', 'magd', 'fischer'],
  burg: ['wache', 'wache', 'wache', 'handwerker', 'magd', 'bauer', 'bauer', 'priester', 'wirt', 'jaeger'],
  lager: ['waldmann', 'waldmann', 'holzer'],
  mine: ['bergmann', 'bergmann', 'bergmann', 'bergmann', 'magd', 'wache', 'kind'],
  einsiedelei: ['einsiedler'],
  hof: ['bauer', 'baeuerin'],
};

const NAMES = {
  haendler: 'Händler', magd: 'Magd', handwerker: 'Handwerker', buerger: 'Bürger', kind: 'Kind', moench: 'Mönch', wache: 'Wache',
  bauer: 'Bauer', baeuerin: 'Bäuerin', hirte: 'Hirte', waldmann: 'Waldmann', holzer: 'Holzfäller', priester: 'Priester', wirt: 'Wirt',
  jaeger: 'Jäger', fischer: 'Fischer', bettler: 'Bettler', bergmann: 'Bergmann', einsiedler: 'Einsiedler',
  reisender: 'Reisender', pilger: 'Pilger',
};

const MERCHANT_COLS = ['#3d6fa3', '#a33b32', '#5e2f6e', '#3f6b2f', '#a8791f'];

function dress(role, site) {
  const o = { kind: 'peasant', cls: 'zivil', name: NAMES[role], look: 'bauer', tunic: pick(PEASANT_TUNICS) };
  switch (role) {
    case 'baeuerin': case 'magd': o.female = true; o.scarf = pick(['#e8e0cc', '#c9b98e', '#d8d0bc']); o.tunic = pick(['#8a6e4b', '#7d6a55', '#94704a', '#6f7a55', '#9a7b5a']); break;
    case 'haendler': o.tunic = pick(MERCHANT_COLS); o.cap = '#5a3a2a'; break;
    case 'buerger': o.tunic = pick(['#6f5a8a', '#5a6f8a', '#8a5a4a', '#7a7a5a', '#4a6a5a']); o.female = Math.random() < 0.45; if (o.female) o.scarf = '#e8e0cc'; break;
    case 'handwerker': o.apron = '#4a3526'; break;
    case 'bauer': case 'hirte': o.hat = Math.random() < 0.7 ? '#c9b06a' : null; break;
    case 'moench': o.look = 'moench'; o.tunic = null; break;
    case 'priester': o.look = 'moench'; o.tunic = '#2e2a2c'; break;
    case 'wirt': o.apron = '#e8e0cc'; o.tunic = '#7a4a3a'; break;
    case 'kind': o.small = true; o.female = Math.random() < 0.5; break;
    case 'wache': o.tunic = siteColor(site) || '#556b7d'; o.helm = true; o.tool = 'speer'; break;
    case 'baron': o.name = site.baronName || 'Der Baron'; o.tunic = siteColor(site) || '#2c4f86'; o.baron = site.baron; break;
    case 'waldmann': case 'holzer': o.look = 'wald'; o.tunic = null; break;
    case 'jaeger': o.tunic = pick(['#4a5a2a', '#5a5a32', '#4e4a2c']); o.cap = '#3e4a22'; o.bow = true; break;
    case 'fischer': o.tunic = pick(['#5a6a7a', '#6a6a5a', '#4a5a6a']); o.hat = '#8a7a5a'; break;
    case 'bergmann': o.tunic = pick(['#5a5048', '#4e4a44', '#625646']); o.cap = '#3a3028'; break;
    case 'einsiedler': o.look = 'moench'; o.tunic = '#6a5a44'; o.beard = true; break;
    case 'reisender': o.tunic = pick(['#5a4a6a', '#4a5a4a', '#6a4a3a', '#3e4e6a']); o.hat = '#5a4a3a'; break;
    case 'pilger': o.tunic = '#6e6252'; o.hat = '#4a3a2a'; o.staff = true; break;
    case 'bettler': o.tunic = pick(['#7a7062', '#6e6658', '#857a66']); o.patches = true; o.crutch = Math.random() < 0.4; o.female = Math.random() < 0.3; if (o.female) o.scarf = '#a89a80'; break;
    default: break;
  }
  return o;
}

// ---------------------------------------------------------------- Arbeitsplätze eines Ortes
const spotCache = new Map();
export function resetLife() { spotCache.clear(); }

export function siteSpots(s) {
  if (spotCache.has(s.id)) return spotCache.get(s.id);
  const W = G.world, N = W.N;
  const bs = W.buildings.filter((b) => b.site === s.id);
  const sp = { houses: [], stalls: [], wells: [], anvils: [], wood: [], hay: [], gardens: [], fields: [], church: null, fire: null, water: null, sheep: null };
  for (const b of bs) {
    if (b.kind === 'house' || b.kind === 'longhall') sp.houses.push({ ...doorOf(b, W), b });
    else if (b.kind === 'stall' || b.kind === 'tent') sp.stalls.push({ x: b.x, y: b.y, front: { x: b.x + 0.05, y: b.y + 0.62 }, back: { x: b.x, y: b.y - 0.5 } });
    else if (b.kind === 'well') sp.wells.push({ x: b.x + 0.45, y: b.y + 0.35 });
    else if (b.kind === 'fire') sp.fire = { x: b.x, y: b.y };
    else if (b.kind === 'stollen') sp.adit = doorOf(b, W);
    else if (b.kind === 'mystic') sp.mystic = { x: b.x - 0.2, y: b.y + b.wy / 2 + 0.2 };
    else if (b.kind === 'klause') sp.houses.push(doorOf(b, W));
    else if (b.kind === 'church') sp.church = doorOf(b, W);
    else if (b.kind === 'landmark' && b.lm === 'kathedrale') sp.church = doorOf(b, W);
    else if (b.kind === 'landmark' && b.lm === 'tuchhalle') for (let k = 0; k < 3; k++) { const x = b.x - 1 + k, y = b.y + b.wy / 2 + 0.55; sp.stalls.push({ x, y, front: { x, y: y + 0.6 }, back: { x, y: y - 0.45 } }); }
    else if (b.kind === 'prop') {
      const p = { x: b.x + 0.35, y: b.y + 0.3 };
      if (b.prop === 'amboss') sp.anvils.push({ x: b.x - 0.05, y: b.y + 0.4 });
      else if (b.prop === 'erzhaufen') sp.ore = { x: b.x + 0.5, y: b.y + 0.45 };
      else if (b.prop === 'holzstapel') sp.wood.push(p);
      else if (b.prop === 'heu') sp.hay.push(p);
      else if (b.prop === 'beet') sp.gardens.push({ x: b.x, y: b.y + 0.32 });
    }
  }
  // Felder, Wasser für Fischer
  const R = (s.clear || 3) + 6;
  for (let y = Math.floor(s.y - R); y <= s.y + R; y++) for (let x = Math.floor(s.x - R); x <= s.x + R; x++) {
    if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
    const t = W.tiles[y * N + x];
    if (t === T.FIELD && sp.fields.length < 40) sp.fields.push({ x: x + 0.5, y: y + 0.5 });
    if (t === T.WATER && !sp.water && Math.hypot(x - s.x, y - s.y) < R) {
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const t2 = W.tiles[(y + dy) * N + x + dx];
        if (t2 !== T.WATER && t2 !== T.BRIDGE && isWalkable(W, x + dx + 0.5, y + dy + 0.5)) { sp.water = { x: x + dx + 0.5, y: y + dy + 0.5, fx: x + 0.5, fy: y + 0.5 }; break; }
      }
    }
  }
  // Plätze, die knapp in einem Nachbarhaus, Stand oder Brunnen liegen, rücken an die nächste freie Stelle
  const fx = (q) => (q ? freeNear(W, q, 2.6) : q);
  sp.houses = sp.houses.map((h) => ({ ...fx(h), b: h.b }));
  for (const st of sp.stalls) { st.front = fx(st.front); st.back = fx(st.back); }
  for (const k of ['wells', 'anvils', 'wood', 'hay', 'gardens']) sp[k] = sp[k].map(fx);
  sp.church = fx(sp.church); sp.adit = fx(sp.adit); sp.mystic = fx(sp.mystic); sp.ore = fx(sp.ore);
  if (s.tavern) sp.tavern = fx({ x: s.tavern.x + 0.5, y: s.tavern.y + 0.15 });
  if (s.type === 'burg' || s.type === 'spieler') sp.gate = [{ x: s.x + 0.4, y: s.y + 5.4 }, { x: s.x + 0.4, y: s.y + 2.5 }];
  // Bettler: vor den Toren der Stadtmauer, am Burgtor, an der Kirchentür oder am Markt
  sp.beg = [];
  if (s.cityWall) {
    const ring = s.cityWall, open = (x, y) => { const t2 = W.tiles[y * N + x]; return t2 === T.ROAD || t2 === T.BRIDGE; };
    ring.forEach(([x, y]) => {
      if (!open(x, y)) return;
      const dx = x + 0.5 - s.x, dy = y + 0.5 - s.y, d = Math.hypot(dx, dy) || 1;
      for (const side of [-1, 1]) {
        const bx = x + 0.5 + (dx / d) * 1.6 + (-dy / d) * side * 0.95, by = y + 0.5 + (dy / d) * 1.6 + (dx / d) * side * 0.95;
        if (isWalkable(W, bx, by) && W.tiles[Math.floor(by) * N + Math.floor(bx)] !== T.ROAD) sp.beg.push({ x: bx, y: by });
      }
    });
  }
  if (!sp.beg.length && sp.gate) sp.beg.push({ x: sp.gate[0].x - 0.9, y: sp.gate[0].y + 0.4 }, { x: sp.gate[0].x + 0.9, y: sp.gate[0].y + 0.5 });
  if (sp.church) sp.beg.push({ x: sp.church.x + 0.7, y: sp.church.y + 0.3 });
  if (!sp.beg.length && sp.stalls.length) sp.beg.push({ x: sp.stalls[0].front.x + 0.8, y: sp.stalls[0].front.y + 0.4 });
  // Bäume am Ortsrand: Reisig sammeln, Holz schlagen, auf Wild lauern
  sp.trees = []; sp.forest = [];
  const CN = W.CN, CH = N / CN, TR = R + 12;
  for (let cy = Math.max(0, Math.floor((s.y - TR) / CH)); cy <= Math.min(CN - 1, Math.floor((s.y + TR) / CH)); cy++) {
    for (let cx = Math.max(0, Math.floor((s.x - TR) / CH)); cx <= Math.min(CN - 1, Math.floor((s.x + TR) / CH)); cx++) {
      for (const o of W.chunkObjs[cy * CN + cx]) {
        if (o.kind !== 'laub' && o.kind !== 'nadel') continue;
        const d = Math.hypot(o.x - s.x, o.y - s.y), spot = { x: o.x + 0.35, y: o.y + 0.45 };
        if (!isWalkable(W, spot.x, spot.y)) continue;
        if (d < R + 6 && sp.trees.length < 30) sp.trees.push(spot);
        else if (d >= R + 4 && d < TR && sp.forest.length < 30) sp.forest.push(spot);
      }
    }
  }
  spotCache.set(s.id, sp);
  return sp;
}

// ---------------------------------------------------------------- Bewohner anlegen
export function spawnVillagers() {
  G.peasants = [];
  resetLife();
  const homes = G.world.sites.concat(G.world.farms || [], G.world.camps || []);
  for (const site of homes) {
    // Ein geplünderter Ort bleibt leer, bis die Leute zurückkehren
    if (isAbandoned(site)) continue;
    let stall = 0;
    for (const role of rolesFor(site)) G.peasants.push(makeVillager(site, role, role === 'haendler' ? stall++ : 0));
  }
  G.addVillager = addVillager;
  G.evacuate = evacuate;
  G.repopulate = repopulate;
}

// Wer in einem Ort lebt: Grundrollen je Ortstyp, mehr Leute in großen Orten, Bettler, abzüglich der Getöteten
function rolesFor(site) {
  const lvl = G.s.castle.level;
  {
    let roles = ROLES[site.type] || [];
    if (site.type === 'spieler') roles = ['bauer', 'bauer', 'magd', 'handwerker', 'kind', 'bauer', 'magd', 'wache', 'baeuerin', 'kind'].slice(0, 1 + lvl * 3);
    if (site.type === 'hof' && Math.random() < 0.4) roles = ['bauer'];
    if (site.type === 'hof' && Math.random() < 0.25) roles = roles.concat('jaeger');
    if (site.type === 'lagerfeuer') roles = site.roles.slice(0, 1 + Math.floor(Math.random() * site.roles.length));
    // In der Burg eines Barons lebt er selbst (barons.js), solange er dort Herr ist
    if (site.baron) roles = ['baron', ...roles];
    // Große Orte: je fünf Häuser ein weiterer Bewohner (London und Paris haben ein eigenes Gewimmel)
    if (site.type === 'stadt' || site.type === 'markt' || site.type === 'burg') {
      const nh = G.world.buildings.filter((b) => b.site === site.id && b.kind === 'house').length;
      const pool = ['buerger', 'magd', 'handwerker', 'buerger', 'haendler', 'kind', 'buerger', 'wache', 'magd', 'bauer'];
      for (let k = 0; k < Math.min(60, Math.floor(nh / 5)); k++) roles = roles.concat(pool[k % pool.length]);
    }
    // Bettler vor den Toren großer Orte, an Burgtoren und Kirchen
    const beggars = { stadt: 1 + Math.floor(((site.cityR || 8) - 6) / 4), markt: 1, burg: 1, abtei: 1 }[site.type] || 0;
    for (let k = 0; k < beggars; k++) roles = roles.concat('bettler');
    // Wer bei einem Überfall umkam, fehlt, bis neue Leute zuziehen
    const lost = (G.s.slain && G.s.slain[site.id]) || 0;
    if (lost) roles = roles.slice(0, Math.max(1, roles.length - lost));
    return roles;
  }
}

// Nach der Plünderung: Alle fliehen aus dem Ort und verschwinden im Umland
export function evacuate(site) {
  for (const v of G.peasants) {
    if (v.home !== site || v.dead) continue;
    const a = Math.random() * Math.PI * 2, r = (site.clear || 6) + 6 + Math.random() * 4;
    v.flee = { x: site.x + Math.cos(a) * r, y: site.y + Math.sin(a) * r, t: 0 };
    v.task = null; v.act = null; v.funeral = null; v.spectator = null;
    v.hidden = false; v.inside = false;
    if (v.door) { v.x = v.door.x; v.y = v.door.y; }
    if (Math.random() < 0.25) v.say = { text: pick(['Weg hier, nur weg!', 'Nehmt die Kinder!', 'Gott verfluche Euch!', 'Alles verloren …']), t: 0, dur: 3 };
  }
}

// Die Leute kehren zurück: Sie kommen von außen und gehen in ihre Häuser
export function repopulate(site) {
  let stall = 0;
  for (const role of rolesFor(site)) {
    const v = makeVillager(site, role, role === 'haendler' ? stall++ : 0);
    const a = Math.random() * Math.PI * 2, r = (site.clear || 6) + 4 + Math.random() * 3;
    placeNear(v, site.x + Math.cos(a) * r, site.y + Math.sin(a) * r, 1.5);
    G.peasants.push(v);
  }
  rebuildUnits();
}

export function makeVillager(site, role, stall = 0) {
  const o = dress(role, site);
  const v = makeUnit(o);
  for (const k of ['scarf', 'cap', 'apron', 'hat', 'small', 'helm', 'tool', 'bow', 'patches', 'crutch', 'beard', 'staff', 'baron']) if (o[k]) v[k] = o[k];
  v.role = role; v.home = site; v.task = null;
  v.hair = pick(HAIR);
  v.stall = stall;
  placeNear(v, site.x, site.y, Math.min(4, (site.clear || 3) - 1));
  v.sayT = rand(4, 30);
  return v;
}

// Neue Leute ziehen zu (nach einem Überfall)
export function addVillager(site) {
  const pool = (ROLES[site.type] || ['bauer']).filter((r) => r !== 'priester' && r !== 'wirt');
  const v = makeVillager(site, pick(pool), Math.floor(Math.random() * 4));
  G.peasants.push(v);
  rebuildUnits();
}

// ---------------------------------------------------------------- Tagesablauf
function phase(h) {
  if (h >= 21 || h < 5) return 'nacht';
  if (h < 7) return 'morgen';
  if (h >= 12 && h < 13) return 'mittag';
  if (h >= 19) return 'abend';
  return 'arbeit';
}

const near = (list, v) => {
  let best = null, bd = Infinity;
  for (const p of list) { const d = Math.hypot(p.x - v.x, p.y - v.y) + Math.random() * 3; if (d < bd) { bd = d; best = p; } }
  return best;
};

function goTo(v, spot, act, dur, then = null, speed = 1) {
  const p = freeNear(G.world, spot, 1.2);
  v.task = { kind: 'walk', x: p.x, y: p.y, act, dur, then, t: 0, speed, face: spot.face };
}

function wander(v, s, r) {
  for (let k = 0; k < 8; k++) {
    const x = s.x + rand(-r, r), y = s.y + rand(-r, r);
    if (isWalkable(G.world, x, y)) return { x, y };
  }
  return { x: s.x, y: s.y + 1 };
}

function chooseTask(v) {
  const s = v.home, sp = siteSpots(s), h = hourOf(), ph = phase(h), se = seasonIndex();
  const house = () => { const hs = sp.houses.filter((q) => !q.b || standing(q.b)); return hs.length ? pick(hs) : wander(v, s, 3); };
  const door = () => (v.door && (!v.door.b || standing(v.door.b)) ? v.door : (v.door = house()));
  const r = Math.max(2.5, (s.clear || 3) - 1.5);
  v.carry = v.task && v.task.then === 'drop' ? null : v.carry;
  // Überfall: alle fliehen in die Häuser
  if (G.raid && G.raid.site === s) {
    goTo(v, door(), 'heim', 9999, null, 1.7);
    if (Math.random() < 0.3) v.say = { text: pick(['Hilfe! Räuber!', 'Rettet euch!', 'Holt die Kinder ins Haus!', 'Gnade, Herr, Gnade!']), t: 0, dur: 3 };
    return;
  }
  // Während einer Belagerung verkriechen sich alle in den Häusern
  if (G.siege && G.siege.site === s && G.siege.stage !== 'anmarsch') { goTo(v, door(), 'heim', 9999, null, 1.4); return; }
  // Feuer! Eimer am Brunnen oder am Wasser füllen und aufs Feuer schütten
  const fb = burningIn(s);
  if (fb && !['kind', 'priester', 'wache', 'wirt'].includes(v.role) && Math.hypot(fb.x - v.x, fb.y - v.y) < 15
    && G.peasants.filter((o) => o.task && (o.task.douse === fb || o.task.fireB === fb)).length < 12) {
    const src = sp.wells.length ? near(sp.wells, v) : sp.water;
    if (src && Math.hypot(src.x - fb.x, src.y - fb.y) < 25) { goTo(v, src, 'schoepfen', rand(0.8, 1.6), null, 1.6); v.task.fireB = fb; return; }
    v.carry = 'eimer';
    goTo(v, { x: fb.x + rand(-0.5, 0.5), y: fb.y + fb.wy / 2 + 0.5 }, 'loeschen', rand(1.2, 2), null, 1.6); v.task.douse = fb; return;
  }
  // Am Lagerfeuer: sitzen, reden, Holz nachlegen
  if (s.type === 'lagerfeuer') {
    if (sp.fire && Math.random() < 0.75) { const a = (v.id % 5) / 5 * Math.PI * 2; goTo(v, { x: sp.fire.x + Math.cos(a) * 0.8, y: sp.fire.y + Math.sin(a) * 0.55 }, Math.random() < 0.6 ? 'sitzen' : 'reden', rand(20, 50), null, 0.7); return; }
    if (sp.trees.length && Math.random() < 0.5) { goTo(v, pick(sp.trees), 'sammeln', rand(8, 14), 'reisig'); return; }
    goTo(v, wander(v, s, 3), 'stehen', rand(6, 12)); return;
  }
  // Der Einsiedler betet am heiligen Ort, pflegt seinen Garten oder sitzt vor der Klause
  if (v.role === 'einsiedler') {
    const r2 = Math.random();
    if (sp.mystic && r2 < 0.45) { goTo(v, sp.mystic, 'beten', rand(20, 40), null, 0.6); return; }
    if (sp.gardens.length && r2 < 0.7) { goTo(v, pick(sp.gardens), 'jaeten', rand(14, 26), null, 0.6); return; }
    goTo(v, house(), 'sitzen', rand(15, 30), null, 0.6); return;
  }
  // Bergleute: im Stollen Erz brechen und es zum Haufen tragen
  if (v.role === 'bergmann' && (ph === 'arbeit' || ph === 'morgen')) {
    if (sp.adit && Math.random() < 0.75) {
      goTo(v, { x: sp.adit.x + rand(-0.4, 0.4), y: sp.adit.y + rand(-0.1, 0.3) }, 'hacke', rand(14, 28));
      if (sp.ore) v.task.next = { spot: sp.ore, act: 'abladen', dur: rand(2, 3), carry: 'erz', speed: 0.75, props: { dropAfter: true } };
      return;
    }
    if (sp.wood.length) { goTo(v, pick(sp.wood), 'axt', rand(10, 18), 'holz'); return; }
  }
  // Bettler sitzen den ganzen Tag an ihrem Platz
  if (v.role === 'bettler') {
    if (!v.begSpot) v.begSpot = sp.beg.length ? sp.beg[v.id % sp.beg.length] : wander(v, s, 2);
    goTo(v, v.begSpot, 'betteln', rand(40, 90), null, 0.6);
    return;
  }
  // Hinrichtung am Galgen: viele schauen zu
  const hw = v.role !== 'wache' && v.role !== 'wirt' && v.role !== 'bettler' && Math.random() < 0.65 ? hangWatch(s) : null;
  if (hw) { goTo(v, hw, Math.random() < 0.3 ? 'beten' : 'stehen', rand(30, 60)); return; }
  // Turnier vor den Toren: viele gehen zuschauen
  const ws = (ph === 'arbeit' || ph === 'mittag') && v.role !== 'wache' && v.role !== 'wirt' && Math.random() < 0.45 ? watchSpot(s) : null;
  if (ws) { goTo(v, ws, Math.random() < 0.6 ? 'jubeln' : 'stehen', rand(25, 50)); return; }
  // Bei Regen und Schneetreiben bleibt man lieber drinnen
  if (precip() > 0.6 && !['wache', 'bettler', 'fischer'].includes(v.role) && Math.random() < 0.3) { goTo(v, door(), 'heim', 9999, null, 1.3); v.task.hideFor = rand(20, 50); return; }
  // Nach einem Überfall bleiben viele lieber im Haus
  if (isBlighted(s) && v.role !== 'wache' && Math.random() < 0.4) { goTo(v, door(), 'heim', 9999, null, 0.9); v.task.hideFor = rand(25, 70); return; }
  const tav = s.tavern;
  if (v.role === 'wirt' && tav && h < 22) { goTo(v, sp.tavern || { x: tav.x + 0.5, y: tav.y + 0.15 }, 'verkaufen', rand(30, 60)); return; }
  if (ph === 'abend' && h >= 20) {
    if (tav && Math.random() < 0.35 && v.role !== 'kind' && v.role !== 'moench') { goTo(v, { x: tav.x + rand(-1, 1.4), y: tav.y + rand(0.1, 1.1) }, 'trinken', rand(25, 50)); return; }
    goTo(v, door(), 'heim', 9999); return;
  }
  if (ph === 'abend' && tav && Math.random() < 0.45 && v.role !== 'kind' && v.role !== 'moench' && v.role !== 'priester') {
    goTo(v, { x: tav.x + rand(-1, 1.4), y: tav.y + rand(0.1, 1.1) }, 'trinken', rand(20, 45)); return;
  }
  if (ph === 'mittag' && tav && Math.random() < 0.2 && v.role !== 'kind') { goTo(v, { x: tav.x + rand(-1, 1.4), y: tav.y + rand(0.1, 1.1) }, 'trinken', rand(12, 22)); return; }
  // Beschädigte Häuser werden wieder aufgebaut
  // Beschädigte Häuser ausbessern und neue bauen
  if (ph === 'arbeit' && ['handwerker', 'bauer', 'baeuerin', 'magd', 'buerger'].includes(v.role) && !isBlighted(s)) {
    const pool = s.type === 'spieler' ? (s.villageSpots || []) : siteHouses(s.id);
    const broken = pool.filter((b) => ((b.dmg > 0 && standing(b)) || underConstruction(b)) && !(b.fire > G.time));
    if (broken.length && Math.random() < (v.role === 'handwerker' ? 0.85 : 0.5)) {
      const b = pick(broken);
      const spot = { x: b.x + rand(-0.45, 0.45), y: b.y + b.wy / 2 + 0.38 };
      const fetch = underConstruction(b) && Math.random() < 0.4 && (sp.wood.length || sp.trees.length);
      if (fetch) {
        // Balken holen und zur Baustelle tragen
        goTo(v, pick(sp.wood.length ? sp.wood : sp.trees), 'axt', rand(4, 8));
        v.task.next = { spot, act: 'abladen', dur: rand(2, 3), carry: 'balken', speed: 0.8, props: { repair: b, dropAfter: true } };
        return;
      }
      goTo(v, spot, Math.random() < 0.7 ? 'hammer' : 'axt', rand(18, 32));
      v.task.repair = b;
      return;
    }
  }
  if (v.role === 'priester' && ph === 'arbeit') {
    if (sp.church && Math.random() < 0.5) { goTo(v, sp.church, 'beten', rand(15, 30)); return; }
    goTo(v, wander(v, s, r * 0.7), 'reden', rand(8, 16), null, 0.8); return;
  }
  if (ph === 'morgen') {
    if ((v.role === 'magd' || v.role === 'baeuerin') && sp.wells.length) { goTo(v, near(sp.wells, v), 'eimer', rand(5, 9), 'eimer'); return; }
    goTo(v, wander(v, s, r * 0.6), 'stehen', rand(3, 8)); return;
  }
  if (ph === 'mittag') {
    if (v.role === 'haendler' && sp.stalls.length) { const st = sp.stalls[v.stall % sp.stalls.length]; goTo(v, st.back, 'verkaufen', rand(20, 40)); return; }
    // Mittagspause: am Brunnen, vor dem eigenen Haus oder irgendwo im Ort, in kleinen Grüppchen
    const spots = [...sp.wells, ...sp.houses.slice(0, 6), wander(v, s, r * 0.8)];
    const m = pick(spots);
    goTo(v, { x: m.x + rand(-0.9, 0.9), y: m.y + rand(0.2, 1.1) }, Math.random() < 0.7 ? 'reden' : 'stehen', rand(10, 22)); return;
  }
  if (ph === 'abend') {
    if (v.role === 'moench' && sp.church) { goTo(v, sp.church, 'beten', rand(15, 30)); return; }
    if (Math.random() < 0.5) { goTo(v, wander(v, s, 2.5), 'reden', rand(8, 18)); return; }
    goTo(v, door(), 'stehen', rand(6, 14)); return;
  }
  // Arbeitszeit
  switch (v.role) {
    case 'fischer':
      if (sp.water) { goTo(v, sp.water, 'angeln', rand(25, 45), Math.random() < 0.65 ? 'fisch' : null); return; }
      // ohne Wasser arbeitet der Fischer wie ein Bauer
    // falls through
    case 'bauer': case 'baeuerin':
      if (sp.water && Math.random() < 0.08) { goTo(v, sp.water, 'angeln', rand(20, 40), Math.random() < 0.5 ? 'fisch' : null); return; }
      if (sp.trees.length && Math.random() < (se >= 2 ? 0.28 : 0.1)) { goTo(v, pick(sp.trees), 'sammeln', rand(10, 18), 'reisig'); return; }
      if (se < 3 && sp.fields.length && (v.role !== 'baeuerin' || Math.random() < 0.4)) {
        const act = se === 0 && Math.random() < 0.55 ? 'saeen' : se === 2 ? 'sichel' : 'hacke';
        goTo(v, pick(sp.fields), act, rand(14, 30), act === 'saeen' ? null : Math.random() < 0.4 ? (se === 2 ? 'heu' : 'sack') : null);
        if (act === 'saeen') v.carry = 'saatsack';
        return;
      }
      if (v.role === 'baeuerin' && sp.gardens.length) { goTo(v, pick(sp.gardens), 'jaeten', rand(10, 20)); return; }
      if (sp.wood.length && Math.random() < 0.6) { goTo(v, pick(sp.wood), 'axt', rand(10, 20), 'holz'); return; }
      if (sp.hay.length) { goTo(v, pick(sp.hay), 'gabel', rand(8, 16)); return; }
      goTo(v, wander(v, s, r), 'stehen', rand(4, 10)); return;
    case 'magd':
      if (sp.trees.length && Math.random() < (se >= 2 ? 0.25 : 0.1)) { goTo(v, pick(sp.trees), 'sammeln', rand(10, 16), 'reisig'); return; }
      if (sp.wells.length && Math.random() < 0.45) { goTo(v, near(sp.wells, v), 'eimer', rand(5, 9), 'eimer'); return; }
      if (sp.stalls.length && Math.random() < 0.5) { goTo(v, pick(sp.stalls).front, 'kaufen', rand(6, 12), 'korb'); return; }
      goTo(v, house(), 'besen', rand(8, 16)); return;
    case 'handwerker':
      if (sp.anvils.length && Math.random() < 0.65) { goTo(v, pick(sp.anvils), 'hammer', rand(16, 32)); v.task.anvil = true; return; }
      if (sp.wood.length) { goTo(v, pick(sp.wood), 'axt', rand(10, 20), 'holz'); return; }
      goTo(v, house(), 'hammer', rand(10, 18)); return;
    case 'haendler':
      if (sp.stalls.length) { const st = sp.stalls[v.stall % sp.stalls.length]; goTo(v, st.back, 'verkaufen', rand(40, 90)); return; }
      goTo(v, wander(v, s, 2), 'verkaufen', rand(20, 40)); return;
    case 'buerger':
      if (sp.stalls.length && Math.random() < 0.55) { goTo(v, pick(sp.stalls).front, 'kaufen', rand(5, 12), 'korb'); return; }
      if (sp.church && Math.random() < 0.3) { goTo(v, sp.church, 'beten', rand(8, 16)); return; }
      goTo(v, wander(v, s, r), Math.random() < 0.5 ? 'reden' : 'stehen', rand(6, 14)); return;
    case 'moench':
      if (sp.gardens.length && Math.random() < 0.4) { goTo(v, pick(sp.gardens), 'jaeten', rand(12, 24)); return; }
      if (sp.church && Math.random() < 0.5) { goTo(v, sp.church, 'beten', rand(12, 26)); return; }
      if (sp.fields.length) { goTo(v, pick(sp.fields), 'hacke', rand(12, 24)); return; }
      goTo(v, wander(v, s, r * 0.7), 'stehen', rand(6, 12), null, 0.8); return;
    case 'kind':
      if (sp.trees.length && Math.random() < 0.04) { goTo(v, pick(sp.trees), 'sammeln', rand(6, 10), 'reisig'); return; }
      goTo(v, wander(v, s, Math.min(4, r)), 'spielen', rand(1, 3), null, 1.5); return;
    case 'jaeger':
      // Auf der Pirsch am Waldrand, mit etwas Glück mit Wild zurück
      if (sp.forest.length && Math.random() < 0.8) { goTo(v, pick(sp.forest), 'pirschen', rand(14, 28), null, 0.85); v.task.hunt = true; return; }
      if (sp.trees.length) { goTo(v, pick(sp.trees), 'sammeln', rand(8, 14), 'reisig'); return; }
      goTo(v, wander(v, s, r), 'stehen', rand(5, 10)); return;
    case 'wache':
      if (sp.gate) { goTo(v, pick(sp.gate), 'wache', rand(12, 24)); return; }
      goTo(v, wander(v, s, r), 'wache', rand(10, 20)); return;
    case 'hirte': {
      const sheep = G.animals.filter((a) => a.site === s.id && a.kind === 'schaf');
      if (sheep.length) { const a = pick(sheep); goTo(v, { x: a.home.x + rand(-1.5, 1.5), y: a.home.y + rand(-1.5, 1.5) }, 'hueten', rand(15, 30)); return; }
      goTo(v, wander(v, s, r), 'hueten', rand(10, 20)); return;
    }
    case 'waldmann':
      if (sp.fire && Math.random() < 0.6) { goTo(v, { x: sp.fire.x + rand(-1, 1), y: sp.fire.y + rand(0.5, 1.2) }, 'sitzen', rand(15, 30)); return; }
      goTo(v, wander(v, s, 4), 'stehen', rand(8, 16)); return;
    case 'holzer':
      goTo(v, wander(v, s, 3.5), 'axt', rand(12, 22), 'holz'); return;
    case 'baron':
      // Der Baron bleibt in seinem Hof, mal am Bergfried, mal am Tor
      goTo(v, Math.random() < 0.3 && sp.gate ? sp.gate[1] : wander(v, s, 2.6), Math.random() < 0.3 ? 'reden' : 'stehen', rand(10, 22), null, 0.7); return;
    default:
      goTo(v, wander(v, s, r), 'stehen', rand(5, 10));
  }
}

export function updateVillager(v, dt) {
  if (v.flee) {
    // Auf der Flucht: rennen, bis sie außer Sicht sind
    v.flee.t += dt;
    chaseTo(v, v.flee.x, v.flee.y, dt, 0.3, 1.7);
    if (Math.hypot(v.flee.x - v.x, v.flee.y - v.y) < 0.6 || v.flee.t > 18) { v.dead = true; v.hidden = true; }
    return;
  }
  if (v.funeral || v.spectator || v.execution) return;
  const h = hourOf(), ph = phase(h);
  if (ph === 'nacht') {
    if (v.home && v.home.type === 'lagerfeuer') { campNight(v, dt); return; }
    v.hidden = true; v.inside = true; v.task = null; v.act = null; v.carry = null; return;
  }
  if (v.inside) {
    if (ph === 'abend' && h >= 20) return;
    if ((v.hideUntil || 0) > G.time || (G.raid && G.raid.site === v.home)) return;
    v.inside = false; v.hidden = false;
    if (v.door) { v.x = v.door.x; v.y = v.door.y; }
  }
  if (!v.task) chooseTask(v);
  const t = v.task;
  if (t.kind === 'walk') {
    v.act = null;
    t.t += dt;
    chaseTo(v, t.x, t.y, dt, 0.18, 0.55 * t.speed);
    if (Math.hypot(t.x - v.x, t.y - v.y) < 0.3 || t.t > 25) {
      t.kind = 'work'; t.t = 0;
      if (t.act === 'heim') { v.hidden = true; v.inside = true; v.hideUntil = t.hideFor ? G.time + t.hideFor : 0; v.task = null; return; }
      // Blickrichtung zum Arbeitsplatz
      if (t.act === 'verkaufen') faceDir(v, 0, 1);
    }
    return;
  }
  // Arbeiten
  v.act = t.act;
  t.t += dt;
  if (t.act === 'spielen') { v.task = null; return; }
  if (t.t >= t.dur) {
    v.act = null;
    if (t.repair) workOn(t.repair);
    if (t.dropAfter || t.act === 'saeen') v.carry = null;
    if (t.douse) { douse(t.douse); v.carry = null; v.task = null; return; }
    if (t.fireB) {
      const b = t.fireB;
      v.carry = 'eimer';
      goTo(v, { x: b.x + rand(-0.5, 0.5), y: b.y + b.wy / 2 + 0.5 }, 'loeschen', rand(1.2, 2), null, 1.6);
      v.task.douse = b;
      return;
    }
    if (t.hunt && huntShot(v, t)) return;
    if (t.next) {
      const n = t.next;
      if (n.carry !== undefined) v.carry = n.carry;
      goTo(v, n.spot, n.act, n.dur, n.then || null, n.speed || 1);
      Object.assign(v.task, n.props || {});
      return;
    }
    if (t.then && t.then !== 'drop') {
      v.carry = t.then;
      const sp = siteSpots(v.home);
      const dest = sp.houses.length ? pick(sp.houses) : wander(v, v.home, 3);
      v.task = { kind: 'walk', x: dest.x, y: dest.y, act: 'abladen', dur: rand(2, 4), then: 'drop', t: 0, speed: 0.85 };
      return;
    }
    if (t.then === 'drop') v.carry = null;
    v.task = null;
  }
}

// Nachts am Lagerfeuer: im Kreis um die Flammen sitzen
function campNight(v, dt) {
  const sp = siteSpots(v.home);
  if (!sp.fire) { v.hidden = true; return; }
  v.hidden = false; v.inside = false; v.carry = null;
  const a = (v.id % 5) / 5 * Math.PI * 2, x = sp.fire.x + Math.cos(a) * 0.8, y = sp.fire.y + Math.sin(a) * 0.55;
  if (Math.hypot(x - v.x, y - v.y) > 0.2) { v.act = null; chaseTo(v, x, y, dt, 0.1, 0.6); return; }
  v.task = null; v.act = 'sitzen';
  faceDir(v, sp.fire.x - v.x, sp.fire.y - v.y);
}

// Jäger: Liegt ein Hirsch in Schussweite, fliegt ein Pfeil. Sonst gibt es vielleicht einen Hasen aus der Schlinge.
function huntShot(v, t) {
  let deer = null, bd = 10;
  for (const a of G.animals || []) {
    if ((a.kind !== 'hirsch' && a.kind !== 'reh') || a.dead) continue;
    const d = Math.hypot(a.x - v.x, a.y - v.y);
    if (d < bd) { bd = d; deer = a; }
  }
  if (!deer || Math.random() < 0.35) { if (Math.random() < 0.4) t.then = 'hase'; return false; }
  faceDir(v, deer.x - v.x, deer.y - v.y);
  G.projectiles.push({ x: v.x, y: v.y, tx: deer.x, ty: deer.y, target: deer, att: v, t: 0, dur: Math.max(0.2, bd / 15), animal: true, npcHunt: true, dmg: 99 });
  v.task = { kind: 'walk', x: deer.x + 0.3, y: deer.y + 0.2, act: 'sammeln', dur: 2, then: 'wild', t: 0, speed: 0.9 };
  v.say = { text: pick(['Getroffen!', 'Der Braten für Sonntag!', 'Leise jetzt …']), t: 0, dur: 2.6 };
  return true;
}

// ---------------------------------------------------------------- Sprüche
const SAYINGS = {
  bauer: ['Gott segne die Ernte.', 'Der Vogt will schon wieder mehr.', 'Regen wär gut für die Saat.', 'Mein Rücken, mein Rücken …'],
  baeuerin: ['Die Hühner legen kaum.', 'Wer hat schon wieder das Tor offen gelassen?', 'Kohl, nichts als Kohl.'],
  magd: ['Das Wasser ist eiskalt heute.', 'Noch drei Eimer, dann ist Feierabend.', 'Habt Ihr schon gehört? Der König ist frei!'],
  handwerker: ['Ein gutes Hufeisen braucht seine Zeit.', 'Eisen ist teuer geworden.', 'Gleich fertig, Herr!'],
  buerger: ['Die Preise, die Preise!', 'In London soll es eine steinerne Brücke geben.', 'Man sagt, die Franzosen rüsten.'],
  moench: ['Pax vobiscum.', 'Ora et labora.', 'Der Herr sieht alles.'],
  kind: ['Fang mich doch!', 'Du bist dran!', 'Ich bin ein Ritter!'],
  wache: ['Halt! Ach, Ihr seid es.', 'Alles ruhig.', 'Wer da?'],
  hirte: ['Brav, brav.', 'Ein Lamm fehlt mir.', 'Der Wolf war wieder da.'],
  waldmann: ['Pst. Nicht so laut.', 'Der Sheriff soll kommen.', 'Wildbret schmeckt am besten, wenn es dem König gehört.'],
  holzer: ['Holz! Achtung!', 'Gutes Eichenholz.'],
  bergmann: ['Glück auf!', 'Die Ader wird dünner.', 'Da unten hört man das Wasser rauschen.', 'Der Vogt will schon wieder seinen Zehnten.'],
  einsiedler: ['Der Wald hört alles, mein Sohn.', 'Gottes Wege sind verschlungen wie Wurzeln.', 'Hier war schon lange vor den Kirchen ein heiliger Ort.', 'Setz dich. Du hast einen weiten Weg hinter dir.'],
  reisender: ['Nach London sind es noch drei Tage.', 'Die Straßen sind unsicher geworden.', 'Ein Becher Wein am Feuer, mehr braucht es nicht.'],
  pilger: ['Wir ziehen nach Canterbury, zum Grab des Märtyrers.', 'Gott schütze alle Pilger.', 'Meine Füße, meine Füße …'],
  jaeger: ['Pst! Da drüben im Unterholz …', 'Ein Hirsch, so groß wie ein Pferd, sag ich Euch.', 'Der Förster darf mich nicht sehen.'],
  fischer: ['Heute beißen sie gut.', 'Hecht zum Abendessen!', 'Ruhig, sonst verscheucht Ihr die Fische.'],
};

function sayFor(v) {
  const s = v.home;
  const t = v.task;
  if (t && (t.douse || t.fireB)) return pick(['Feuer! Feuer!', 'Wasser, schnell!', 'Bildet eine Kette!', 'Rettet das Vieh!', 'Noch ein Eimer!']);
  if (isBlighted(s)) {
    const pp = G.s.player;
    if (Math.hypot(v.x - pp.x, v.y - pp.y) < 4) return pick(['Ihr habt genug Unheil angerichtet.', 'Bitte, Herr, verschont uns.', 'Wer soll das alles wieder aufbauen?', 'Geht! Geht einfach.']);
    return pick(['Es hat doch keinen Sinn mehr.', 'Wann kommen sie wieder?', 'Gott steh uns bei.', 'Mein Nachbar liegt jetzt auf dem Friedhof.']);
  }
  if (t && t.repair && underConstruction(t.repair)) return pick(['Hebt an! Noch ein Balken!', 'Bis zum Herbst steht das Dach.', 'Ein neues Haus für meine Tochter und ihren Mann.', 'Wer hat den Mörtel gesehen?']);
  if (v.carry === 'reisig') return pick(['Ein kalter Winter steht bevor.', 'Für den Herd, für den Herd.', 'Das Reisig wird jedes Jahr weniger.']);
  if (v.carry === 'wild') return pick(['Heute gibt es Wildbret!', 'Schwer, der Bursche.']);
  if (v.role === 'bettler') return pick(['Ein Almosen, um Christi willen!', 'Habt Erbarmen, Herr!', 'Ein Pfennig für einen alten Kreuzfahrer …', 'Gott vergelt\'s jedem, der gibt!', 'Seit dem Brand hab ich nichts mehr.']);
  if (v.act === 'trinken') return pick(['Noch ein Bier, Wirt!', '♪ Hey ho, der Krug ist leer ♪', 'Prost!', 'Habt Ihr von der Schlacht gehört?', 'Der Wirt panscht das Bier, sag ich euch.', '♪ Als König Richard übers Meer ... ♪']);
  if (v.role === 'wirt') return pick(['Herein, herein! Warmes Essen und weiche Betten!', 'Frisches Bier aus dem Fass!', 'Ein Bett für die Nacht, Herr?']);
  if (v.role === 'priester') return pick(['Der Herr sei mit Euch.', 'Vergesst die Messe am Sonntag nicht.', 'Betet für die Toten.']);
  if (v.role === 'baron') {
    const b = baron(v.baron);
    if (!b) return 'Willkommen auf meiner Burg.';
    if (b.feud) return pick(['Ihr wagt es, Euch hier zu zeigen?', 'Meine Männer sind schon unterwegs zu Eurer Burg.', 'Zahlt Sühne, oder wir sehen uns vor Euren Mauern.']);
    if (b.vassal) return pick(['Mein Tribut ist unterwegs, Herr.', 'Ich halte mein Wort, Herr.', 'Was befehlt Ihr?']);
    if (b.ally) return pick(['Mein Freund! Wein für unseren Gast!', 'Gegen wen ziehen wir als Nächstes?', 'Meine Männer stehen bereit, wenn Ihr sie braucht.']);
    if (b.rel < -10) return pick(['Was wollt Ihr hier?', 'Ich habe nicht vergessen, was Ihr getan habt.', 'Fasst Euch kurz.']);
    return pick(['Willkommen auf meiner Burg.', 'Habt Ihr Neuigkeiten aus dem Süden?', 'Die Mauern wachsen, Stein um Stein.', 'Der Krieg wird uns alle reich oder arm machen.', 'Setzt Euch, trinkt einen Becher mit mir.']);
  }
  if (v.task && v.task.repair) return pick(['Das Dach muss bis zum Winter dicht sein.', 'Noch ein Balken, dann steht die Wand.', 'Verfluchte Belagerer!']);
  if (v.role === 'haendler') {
    const goods = (s.produces || []).map((g) => GOODS[g].name);
    if (goods.length && Math.random() < 0.75) return pick([`${pick(goods)}! Billig wie nirgends!`, `Feinstes ${pick(goods)}, nur hier!`, `Kauft ${pick(goods)}, Leute, kauft!`]);
    return pick(['Nur heute zum halben Preis!', 'Schaut nur, schaut!']);
  }
  const p = G.s.player;
  const title = p.female ? 'Herrin' : 'Herr';
  if (Math.hypot(v.x - p.x, v.y - p.y) < 3.5 && Math.random() < 0.5) {
    const rep = s.faction ? G.s.rep[s.faction] : 0;
    if (rep >= 30) return pick([`Gott zum Gruße, ${title}!`, `Man spricht gut von Euch, ${title}.`, `Seht, der Ritter von ${homeName()}!`]);
    if (rep <= -20) return pick(['Der da bringt nur Ärger.', 'Haltet die Hühner fest.', 'Geht weiter, Fremder.']);
    return pick([`Gott zum Gruße, ${title}.`, 'Ein schöner Tag, nicht wahr?', `Kommt Ihr von weit her, ${title}?`]);
  }
  return pick(SAYINGS[v.role] || ['…']);
}

// Gelegentlich sagt jemand in deiner Nähe etwas, höchstens drei gleichzeitig
export function updateSayings(dt) {
  updateFunerals(dt);
  const p = G.s.player;
  let active = 0;
  for (const v of G.peasants) if (v.say && v.say.t < v.say.dur) active++;
  for (const v of G.peasants) {
    if (v.hidden) continue;
    if (v.say) { v.say.t += dt; if (v.say.t >= v.say.dur) v.say = null; continue; }
    if (Math.abs(v.x - p.x) > 10 || Math.abs(v.y - p.y) > 10) continue;
    v.sayT -= dt;
    if (v.sayT > 0 || active >= 3) continue;
    v.sayT = v.role === 'bettler' && Math.hypot(v.x - p.x, v.y - p.y) < 4.5 ? rand(5, 10) : rand(14, 40);
    if (v.role === 'haendler' || v.role === 'bettler' || Math.random() < 0.6) { v.say = { text: sayFor(v), t: 0, dur: 3.6 }; active++; }
  }
}

// ---------------------------------------------------------------- Almosen
// Drei Gold für einen Bettler: Die Kirche sieht es gern, und Bettler wissen allerhand.
export const ALMS = 3;
export function giveAlms(v) {
  if (G.s.gold < ALMS) { log('Du hast nicht einmal ein paar Münzen übrig.', 'bad'); return false; }
  G.s.gold -= ALMS;
  G.s.alms = (G.s.alms || 0) + 1;
  G.fx.push({ kind: 'text', x: v.x, y: v.y, text: `−${ALMS} Gold`, color: '#ffd84a', t: 0, dur: 1.4 });
  const title = G.s.player.female ? 'Herrin' : 'Herr';
  if (Math.random() < 0.3 && G.rumor) v.say = { text: `Gott segne Euch! Ein Rat für Euch: ${G.rumor(v.home)}`, t: 0, dur: 7 };
  else v.say = { text: pick([`Gott vergelt's, ${title}!`, `Der Herr segne Euch, ${title}!`, 'Möge der Himmel Euch beschützen!', 'Heute Abend gibt es Brot!']), t: 0, dur: 3.4 };
  v.sayT = rand(20, 40);
  if (G.s.almsDay !== G.s.day) { G.s.almsDay = G.s.day; changeRep('kirche', 1); }
  if (G.s.alms % 5 === 0) addRenown(1);
  return true;
}

// ---------------------------------------------------------------- Wirtshaus
// Übernachten macht ausgeruht: bis zum nächsten Abend +10 % Angriff und Abwehr, +15 % Erfahrung
export function buffActive() {
  const b = G.s && G.s.buff;
  return !!b && (G.s.day < b.day || (G.s.day === b.day && hourOf() < 19));
}

// ---------------------------------------------------------------- Friedhof und Begräbnis
const GRAVE_COLS = 5, GRAVE_ROWS = 3;
export function graveSlot(s, k) {
  const c = s.cemetery;
  const i = Math.min(k, GRAVE_COLS * GRAVE_ROWS - 1);
  return { x: c.x - c.wx / 2 + 0.35 + (i % GRAVE_COLS) * ((c.wx - 0.7) / (GRAVE_COLS - 1)), y: c.y - c.wy / 2 + 0.4 + Math.floor(i / GRAVE_COLS) * ((c.wy - 0.8) / (GRAVE_ROWS - 1)) };
}
export function graveCount(s) { return (s.cemetery ? s.cemetery.old : 0) + ((G.s.graves && G.s.graves[s.id]) || 0); }

const funerals = [];
export function funeralProps() { return funerals.filter((f) => f.stage === 'grab' || f.stage === 'messe').map((f) => ({ x: f.grave.x, y: f.grave.y })); }

// Was keiner gesehen hat, ist nach zwei Tagen beerdigt
export function dailyBurials() {
  const pd = G.s.pendingDead || {};
  for (const [id, n] of Object.entries(pd)) {
    if (!n) continue;
    if ((G.s.deadDay[id] || 0) < G.s.day - 1 && !funerals.some((f) => f.site.id === id)) {
      G.s.graves[id] = (G.s.graves[id] || 0) + Math.ceil(n / 3);
      pd[id] = 0;
      G.staticDirty = true;
    }
  }
}

function startFuneral(s) {
  const vs = G.peasants.filter((v) => v.home === s && !v.hidden && !v.funeral);
  const priest = vs.find((v) => v.role === 'priester') || vs.find((v) => v.role === 'moench');
  if (!priest) return;
  const others = vs.filter((v) => v !== priest);
  const bearers = others.filter((v) => v.role === 'moench').concat(others.filter((v) => ['bauer', 'handwerker', 'buerger'].includes(v.role))).slice(0, 2);
  if (bearers.length < 2) return;
  const mourners = others.filter((v) => !bearers.includes(v) && ['magd', 'baeuerin', 'buerger', 'moench'].includes(v.role)).slice(0, 3);
  const start = { x: s.x + 0.4, y: s.y + ((s.type === 'burg' || s.palisade) ? 5.8 : 1.5) };
  const grave = graveSlot(s, graveCount(s));
  const f = { site: s, stage: 'sammeln', t: 0, priest, bearers, mourners, start, grave, n: Math.min(G.s.pendingDead[s.id], 6) };
  for (const v of [priest, ...bearers, ...mourners]) { v.funeral = f; v.task = null; v.act = null; v.carry = null; }
  bearers[0].carry = 'bahre';
  funerals.push(f);
}

function endFuneral(f) {
  const s = f.site;
  G.s.graves[s.id] = (G.s.graves[s.id] || 0) + 1;
  G.s.pendingDead[s.id] = Math.max(0, (G.s.pendingDead[s.id] || 0) - f.n);
  G.staticDirty = true;
  for (const v of [f.priest, ...f.bearers, ...f.mourners]) { v.funeral = null; v.act = null; v.carry = null; v.task = null; }
  funerals.splice(funerals.indexOf(f), 1);
  s.funeralPause = G.time + 25;
}

const say = (v, text) => { v.say = { text, t: 0, dur: 3.6 }; };

export function updateFunerals(dt) {
  const p = G.s.player, h = hourOf();
  // Neue Begräbnisse in Orten in deiner Nähe
  if (h >= 8 && h < 18) {
    for (const s of G.world.sites) {
      if (!s.cemetery || !(G.s.pendingDead && G.s.pendingDead[s.id] > 0)) continue;
      if (Math.abs(s.x - p.x) + Math.abs(s.y - p.y) > 55 || (s.funeralPause || 0) > G.time) continue;
      if (funerals.some((f) => f.site === s) || (G.siege && G.siege.site === s)) continue;
      if (G.groups.some((g) => g.army && g.members.length && Math.hypot(g.x - s.x, g.y - s.y) < 30)) continue;
      startFuneral(s);
    }
  }
  for (const f of funerals.slice()) {
    f.t += dt;
    const all = [f.priest, ...f.bearers, ...f.mourners];
    if (all.some((v) => v.dead) || Math.abs(f.site.x - p.x) + Math.abs(f.site.y - p.y) > 70) { endFuneral(f); continue; }
    if (f.stage === 'sammeln') {
      let ready = true;
      all.forEach((v, k) => { const tx = f.start.x + (k % 3) * 0.5 - 0.5, ty = f.start.y + Math.floor(k / 3) * 0.6; chaseTo(v, tx, ty, dt, 0.2, 0.7); if (Math.hypot(tx - v.x, ty - v.y) > 0.6) ready = false; });
      if (ready || f.t > 25) { f.stage = 'zug'; f.t = 0; say(f.priest, 'Lasst uns den Toten das letzte Geleit geben.'); }
    } else if (f.stage === 'zug') {
      // Vorneweg der Priester mit dem Kreuz, dann die Bahre, dahinter die Trauernden
      f.priest.act = 'kreuz';
      chaseTo(f.priest, f.grave.x, f.grave.y - 0.75, dt, 0.15, 0.62);
      all.slice(1).forEach((v, k) => {
        const lead = all[k];
        const dx = lead.x - v.x, dy = lead.y - v.y, d = Math.hypot(dx, dy);
        if (d > 0.75) chaseTo(v, lead.x - (dx / d) * 0.7, lead.y - (dy / d) * 0.7, dt, 0.1, 0.68);
      });
      if (Math.hypot(f.priest.x - f.grave.x, f.priest.y - f.grave.y + 0.75) < 0.4 || f.t > 45) { f.stage = 'grab'; f.t = 0; f.priest.act = 'beten'; }
    } else if (f.stage === 'grab') {
      const digger = f.bearers[1];
      chaseTo(digger, f.grave.x + 0.45, f.grave.y + 0.1, dt, 0.1, 0.6);
      digger.act = 'hacke';
      f.bearers[0].carry = null;
      all.forEach((v, k) => { if (v !== digger && v !== f.priest) { const a = (k / all.length) * Math.PI * 2; chaseTo(v, f.grave.x + Math.cos(a) * 0.9, f.grave.y + Math.sin(a) * 0.7, dt, 0.1, 0.6); v.act = 'beten'; } });
      if (f.t > 7) { f.stage = 'messe'; f.t = 0; digger.act = 'beten'; }
    } else if (f.stage === 'messe') {
      f.priest.act = 'segnen';
      const lines = [[0.5, f.priest, 'Requiem aeternam dona eis, Domine.'], [5, f.priest, 'Et lux perpetua luceat eis.'], [9.5, f.mourners[0] || f.bearers[0], 'Ruhe in Frieden.'], [13, f.priest, 'Requiescant in pace.'], [16.5, f.bearers[0], 'Amen.']];
      for (const [at, who, text] of lines) if (f.t >= at && f.t - dt < at) say(who, text);
      if (f.t > 19) endFuneral(f);
    }
  }
}
