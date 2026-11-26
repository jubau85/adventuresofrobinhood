// Alltag in Städten, Dörfern, Abteien, Burgen und auf den Einzelhöfen.
// Jeder Bewohner hat eine Rolle und folgt einem Tagesablauf: morgens zum Brunnen, tagsüber
// aufs Feld, an den Amboss oder hinter den Marktstand, mittags ein Schwatz, abends nach Hause.

import { G, homeName } from './state.js';
import { T, PEASANT_TUNICS, HAIR, GOODS, FACTIONS } from './data.js';
import { isWalkable } from './world.js';
import { rand, pick } from './rng.js';
import { makeUnit, placeNear, chaseTo } from './units.js';
import { hourOf, seasonIndex } from './sim.js';
import { repairBuilding } from './siege.js';

// Rollen je Ortstyp (der Rest der Bewohner ergibt sich daraus)
const ROLES = {
  stadt: ['haendler', 'haendler', 'haendler', 'haendler', 'magd', 'magd', 'handwerker', 'handwerker', 'buerger', 'buerger', 'buerger', 'buerger', 'kind', 'kind', 'moench', 'wache', 'priester', 'wirt'],
  markt: ['haendler', 'haendler', 'haendler', 'magd', 'bauer', 'bauer', 'handwerker', 'buerger', 'buerger', 'kind', 'priester', 'wirt'],
  dorf: ['bauer', 'bauer', 'bauer', 'baeuerin', 'magd', 'handwerker', 'hirte', 'kind', 'kind', 'priester', 'wirt'],
  halle: ['bauer', 'bauer', 'magd', 'baeuerin', 'handwerker', 'wache', 'kind', 'priester', 'wirt'],
  abtei: ['moench', 'moench', 'moench', 'moench', 'moench', 'bauer', 'magd'],
  burg: ['wache', 'wache', 'wache', 'handwerker', 'magd', 'bauer', 'bauer', 'priester', 'wirt'],
  lager: ['waldmann', 'waldmann', 'holzer'],
  hof: ['bauer', 'baeuerin'],
};

const NAMES = {
  haendler: 'Händler', magd: 'Magd', handwerker: 'Handwerker', buerger: 'Bürger', kind: 'Kind', moench: 'Mönch', wache: 'Wache',
  bauer: 'Bauer', baeuerin: 'Bäuerin', hirte: 'Hirte', waldmann: 'Waldmann', holzer: 'Holzfäller', priester: 'Priester', wirt: 'Wirt',
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
    case 'wache': o.tunic = site.faction ? FACTIONS[site.faction].color : '#556b7d'; o.helm = true; o.tool = 'speer'; break;
    case 'waldmann': case 'holzer': o.look = 'wald'; o.tunic = null; break;
    default: break;
  }
  return o;
}

// ---------------------------------------------------------------- Arbeitsplätze eines Ortes
const spotCache = new Map();
export function resetLife() { spotCache.clear(); }

function siteSpots(s) {
  if (spotCache.has(s.id)) return spotCache.get(s.id);
  const W = G.world, N = W.N;
  const bs = W.buildings.filter((b) => b.site === s.id);
  const sp = { houses: [], stalls: [], wells: [], anvils: [], wood: [], hay: [], gardens: [], fields: [], church: null, fire: null, water: null, sheep: null };
  for (const b of bs) {
    if (b.kind === 'house' || b.kind === 'longhall') sp.houses.push({ x: b.x - 0.15, y: b.y + b.wy / 2 + 0.3 });
    else if (b.kind === 'stall' || b.kind === 'tent') sp.stalls.push({ x: b.x, y: b.y, front: { x: b.x + 0.05, y: b.y + 0.62 }, back: { x: b.x, y: b.y - 0.5 } });
    else if (b.kind === 'well') sp.wells.push({ x: b.x + 0.45, y: b.y + 0.35 });
    else if (b.kind === 'fire') sp.fire = { x: b.x, y: b.y };
    else if (b.kind === 'church') sp.church = { x: b.x + b.wx / 2 - 0.45, y: b.y + b.wy / 2 + 0.55 };
    else if (b.kind === 'landmark' && b.lm === 'kathedrale') sp.church = { x: b.x - (b.len || 4) / 2 + 0.4, y: b.y + 1.0 };
    else if (b.kind === 'landmark' && b.lm === 'tuchhalle') for (let k = 0; k < 3; k++) { const x = b.x - 1 + k, y = b.y + b.wy / 2 + 0.55; sp.stalls.push({ x, y, front: { x, y: y + 0.6 }, back: { x, y: y - 0.45 } }); }
    else if (b.kind === 'prop') {
      const p = { x: b.x + 0.35, y: b.y + 0.3 };
      if (b.prop === 'amboss') sp.anvils.push({ x: b.x - 0.05, y: b.y + 0.4 });
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
  if (s.type === 'burg' || s.type === 'spieler') sp.gate = [{ x: s.x + 0.4, y: s.y + 5.4 }, { x: s.x + 0.4, y: s.y + 2.5 }];
  spotCache.set(s.id, sp);
  return sp;
}

// ---------------------------------------------------------------- Bewohner anlegen
export function spawnVillagers() {
  G.peasants = [];
  resetLife();
  const lvl = G.s.castle.level;
  const homes = G.world.sites.concat(G.world.farms || []);
  for (const site of homes) {
    let roles = ROLES[site.type] || [];
    if (site.type === 'spieler') roles = ['bauer', 'bauer', 'magd', 'handwerker', 'kind', 'bauer', 'magd', 'wache', 'baeuerin', 'kind'].slice(0, 1 + lvl * 3);
    if (site.type === 'hof' && Math.random() < 0.4) roles = ['bauer'];
    if ((site.houses || 0) > 18) roles = roles.concat(['buerger', 'buerger', 'haendler', 'magd', 'kind', 'buerger']);
    let stall = 0;
    for (const role of roles) {
      const o = dress(role, site);
      const v = makeUnit(o);
      for (const k of ['scarf', 'cap', 'apron', 'hat', 'small', 'helm', 'tool']) if (o[k]) v[k] = o[k];
      v.role = role; v.home = site; v.task = null;
      v.hair = pick(HAIR);
      if (role === 'haendler') v.stall = stall++;
      placeNear(v, site.x, site.y, Math.min(4, (site.clear || 3) - 1));
      v.sayT = rand(4, 30);
      G.peasants.push(v);
    }
  }
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
  v.task = { kind: 'walk', x: spot.x, y: spot.y, act, dur, then, t: 0, speed, face: spot.face };
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
  const house = () => (sp.houses.length ? pick(sp.houses) : wander(v, s, 3));
  const r = Math.max(2.5, (s.clear || 3) - 1.5);
  v.carry = v.task && v.task.then === 'drop' ? null : v.carry;
  // Während einer Belagerung verkriechen sich alle in den Häusern
  if (G.siege && G.siege.site === s && G.siege.stage !== 'anmarsch') { goTo(v, v.door || (v.door = house()), 'heim', 9999, null, 1.4); return; }
  const tav = s.tavern;
  if (v.role === 'wirt' && tav && h < 22) { goTo(v, { x: tav.x + 0.5, y: tav.y + 0.15 }, 'verkaufen', rand(30, 60)); return; }
  if (ph === 'abend' && h >= 20) {
    if (tav && Math.random() < 0.35 && v.role !== 'kind' && v.role !== 'moench') { goTo(v, { x: tav.x + rand(-1, 1.4), y: tav.y + rand(0.1, 1.1) }, 'trinken', rand(25, 50)); return; }
    goTo(v, v.door || (v.door = house()), 'heim', 9999); return;
  }
  if (ph === 'abend' && tav && Math.random() < 0.45 && v.role !== 'kind' && v.role !== 'moench' && v.role !== 'priester') {
    goTo(v, { x: tav.x + rand(-1, 1.4), y: tav.y + rand(0.1, 1.1) }, 'trinken', rand(20, 45)); return;
  }
  if (ph === 'mittag' && tav && Math.random() < 0.2 && v.role !== 'kind') { goTo(v, { x: tav.x + rand(-1, 1.4), y: tav.y + rand(0.1, 1.1) }, 'trinken', rand(12, 22)); return; }
  // Beschädigte Häuser werden wieder aufgebaut
  if (ph === 'arbeit' && ['handwerker', 'bauer', 'baeuerin', 'magd', 'buerger'].includes(v.role)) {
    const pool = s.type === 'spieler' ? (s.villageSpots || []) : G.world.buildings.filter((b) => b.site === s.id);
    const broken = pool.filter((b) => b.dmg > 0 && !(b.fire > G.time));
    if (broken.length && Math.random() < (v.role === 'handwerker' ? 0.85 : 0.5)) {
      const b = pick(broken);
      const spot = { x: b.x + rand(-0.4, 0.4), y: b.y + b.wy / 2 + 0.35 };
      goTo(v, spot, Math.random() < 0.7 ? 'hammer' : 'axt', rand(18, 32), Math.random() < 0.3 ? 'holz' : null);
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
    goTo(v, v.door || (v.door = house()), 'stehen', rand(6, 14)); return;
  }
  // Arbeitszeit
  switch (v.role) {
    case 'bauer': case 'baeuerin':
      if (sp.water && Math.random() < 0.12) { goTo(v, sp.water, 'angeln', rand(20, 40), Math.random() < 0.5 ? 'fisch' : null); return; }
      if (se < 3 && sp.fields.length && (v.role === 'bauer' || Math.random() < 0.4)) { goTo(v, pick(sp.fields), se === 2 ? 'sichel' : 'hacke', rand(14, 30), Math.random() < 0.4 ? (se === 2 ? 'heu' : 'sack') : null); return; }
      if (v.role === 'baeuerin' && sp.gardens.length) { goTo(v, pick(sp.gardens), 'jaeten', rand(10, 20)); return; }
      if (sp.wood.length && Math.random() < 0.6) { goTo(v, pick(sp.wood), 'axt', rand(10, 20), 'holz'); return; }
      if (sp.hay.length) { goTo(v, pick(sp.hay), 'gabel', rand(8, 16)); return; }
      goTo(v, wander(v, s, r), 'stehen', rand(4, 10)); return;
    case 'magd':
      if (sp.wells.length && Math.random() < 0.45) { goTo(v, near(sp.wells, v), 'eimer', rand(5, 9), 'eimer'); return; }
      if (sp.stalls.length && Math.random() < 0.5) { goTo(v, pick(sp.stalls).front, 'kaufen', rand(6, 12), 'korb'); return; }
      goTo(v, house(), 'besen', rand(8, 16)); return;
    case 'handwerker':
      if (sp.anvils.length && Math.random() < 0.65) { goTo(v, pick(sp.anvils), 'hammer', rand(16, 32)); return; }
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
      goTo(v, wander(v, s, Math.min(4, r)), 'spielen', rand(1, 3), null, 1.5); return;
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
    default:
      goTo(v, wander(v, s, r), 'stehen', rand(5, 10));
  }
}

export function updateVillager(v, dt) {
  if (v.funeral) return;
  const h = hourOf(), ph = phase(h);
  if (ph === 'nacht') { v.hidden = true; v.inside = true; v.task = null; v.act = null; v.carry = null; return; }
  if (v.inside) {
    if (ph === 'abend' && h >= 20) return;
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
      if (t.act === 'heim') { v.hidden = true; v.inside = true; v.task = null; return; }
      // Blickrichtung zum Arbeitsplatz
      if (t.act === 'verkaufen') v.facing = -1;
    }
    return;
  }
  // Arbeiten
  v.act = t.act;
  t.t += dt;
  if (t.act === 'spielen') { v.task = null; return; }
  if (t.t >= t.dur) {
    v.act = null;
    if (t.repair) repairBuilding(t.repair, 0.15);
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
};

function sayFor(v) {
  const s = v.home;
  if (v.act === 'trinken') return pick(['Noch ein Bier, Wirt!', '♪ Hey ho, der Krug ist leer ♪', 'Prost!', 'Habt Ihr von der Schlacht gehört?', 'Der Wirt panscht das Bier, sag ich euch.', '♪ Als König Richard übers Meer ... ♪']);
  if (v.role === 'wirt') return pick(['Herein, herein! Warmes Essen und weiche Betten!', 'Frisches Bier aus dem Fass!', 'Ein Bett für die Nacht, Herr?']);
  if (v.role === 'priester') return pick(['Der Herr sei mit Euch.', 'Vergesst die Messe am Sonntag nicht.', 'Betet für die Toten.']);
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
    v.sayT = rand(14, 40);
    if (v.role === 'haendler' || Math.random() < 0.6) { v.say = { text: sayFor(v), t: 0, dur: 3.6 }; active++; }
  }
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
