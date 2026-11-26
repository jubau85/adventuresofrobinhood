// Die eigene Burg: Ausbau, Produktion, Anwerben, Garnison, Überfälle.

import { G, log, homeName } from './state.js';
import { BUILDINGS, CLASSES, GOOD_IDS, GOODS, DAY_LEN, CASTLE_BONUS, FOOD_GOODS, FOOD_PRICE } from './data.js';
import { rand, randInt, pick } from './rng.js';
import { makeUnit, randomName, partyMembers, rebuildUnits, placeNear, computeStats, grantXp, spawnPeasants } from './units.js';
import { isAlly, alliesCount, addRenown, changeRep, isHostileFaction } from './politics.js';
import { cargoUsed } from './economy.js';
import { setPlayerWalls } from './world.js';
import { seasonIndex } from './sim.js';
import { refreshCastleHerd } from './animals.js';
import { startSiege } from './siege.js';
import { cheatOn } from './cheats.js';

export function castleSite() { return G.world.sites.find((s) => s.type === 'spieler'); }

export function bLevel(id) { return id === 'burg' ? G.s.castle.level : G.s.castle.b[id] || 0; }

// Baufortschritt 0..1 der laufenden Baustelle
export function conProgress() {
  const c = G.s.castle.construction;
  if (!c) return 0;
  const lv = c.id === 'burg' ? BUILDINGS.burg.levels[c.level] : BUILDINGS[c.id].levels[c.level];
  const days = lv.days || 1;
  return Math.max(0, Math.min(1, (G.s.day - (c.done - days) + G.s.time / DAY_LEN) / days));
}

// Häuser der Burgsiedlung je Burgstufe
export function villageHouses() { return [0, 2, 5, 9][G.s.castle.level]; }

export function levelName() { return BUILDINGS.burg.levels[G.s.castle.level].name; }

export function partyCap() { return 2 + bLevel('kaserne') * 2 + (G.s.castle.level >= 3 ? 2 : 0); }

export function cargoCap() { return 20 + bLevel('stall') * 20 + partyMembers().length * 4; }

export function haveMaterial(m) { return (G.s.castle.storage[m] || 0) + (G.s.cargo[m] || 0); }

export function buildInfo(id) {
  const def = BUILDINGS[id];
  const cur = bLevel(id);
  const next = cur + 1;
  const lv = def.levels[next];
  const res = { id, def, cur, next, lv, ok: false, reasons: [] };
  if (!lv) { res.reasons.push('Höchste Stufe erreicht'); return res; }
  const c = G.s.castle.construction;
  if (c) res.reasons.push('Die Baumeister sind beschäftigt');
  if (id !== 'burg' && next > G.s.castle.level + 1) res.reasons.push(`Braucht zuerst ${BUILDINGS.burg.levels[next - 1].name}`);
  if (lv.need) {
    if (lv.need.renown && G.s.renown < lv.need.renown) res.reasons.push(`Braucht ${lv.need.renown} Ruhm`);
    if (lv.need.allies && alliesCount() < lv.need.allies) res.reasons.push(`Braucht ${lv.need.allies} Verbündete`);
  }
  for (const [k, v] of Object.entries(lv.cost)) {
    const have = k === 'gold' ? G.s.gold : haveMaterial(k);
    if (have < v) res.reasons.push(`Zu wenig ${k === 'gold' ? 'Gold' : GOODS[k].name}`);
  }
  res.ok = res.reasons.length === 0;
  return res;
}

export function startBuild(id) {
  const info = buildInfo(id);
  if (!info.ok) { log(info.reasons[0], 'bad'); return false; }
  for (const [k, v] of Object.entries(info.lv.cost)) {
    if (k === 'gold') { G.s.gold -= v; continue; }
    let need = v;
    const fromStore = Math.min(need, G.s.castle.storage[k] || 0);
    G.s.castle.storage[k] = (G.s.castle.storage[k] || 0) - fromStore;
    need -= fromStore;
    if (need > 0) G.s.cargo[k] -= need;
  }
  G.s.castle.construction = { id, level: info.next, done: G.s.day + info.lv.days };
  if (cheatOn('build')) { G.s.castle.construction.done = G.s.day; finishConstruction(); return true; }
  const nm = id === 'burg' ? info.lv.name : `${info.def.name} Stufe ${info.next}`;
  log(`Baubeginn: ${nm}. Fertig an Tag ${G.s.castle.construction.done}.`, 'gold');
  G.castleDirty = true;
  return true;
}

export function finishConstruction() {
  const c = G.s.castle.construction;
  if (!c || G.s.day < c.done) return;
  if (c.id === 'burg') {
    G.s.castle.level = c.level;
    setPlayerWalls(G.world, c.level >= 1);
    log(`${homeName()} ist jetzt eine ${BUILDINGS.burg.levels[c.level].name}!`, 'gold');
    addRenown(5 * c.level);
    spawnPeasants();
    rebuildUnits();
  } else {
    G.s.castle.b[c.id] = c.level;
    log(`Fertiggestellt: ${BUILDINGS[c.id].name} Stufe ${c.level}.`, 'gold');
    addRenown(1);
    if (c.id === 'halle' && !G.s.castle.recruits.length) refreshRecruits();
    if (c.id === 'schafzucht') refreshCastleHerd();
  }
  G.s.castle.construction = null;
  G.castleDirty = true;
  G.celebrate = { id: c.id, level: c.level, t0: G.time };
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
  if (!s || Math.hypot(x - s.x, y - s.y) > 6.5) return null;
  return CASTLE_BONUS[G.s.castle.level];
}

// Jeder Mund am Tisch braucht eine Ration am Tag: du und alle Gefährten
export function foodNeed() { return 1 + G.s.companions.length; }
export function foodStock() { return FOOD_GOODS.reduce((a, g) => a + (G.s.castle.storage[g] || 0), 0); }

const FIELD_SEASON = [0.5, 1, 1.5, 0];

// ---------------------------------------------------------------- Werte
export function castleDefense() {
  let d = [5, 25, 55, 90][G.s.castle.level] + [0, 15, 35, 60][bLevel('wehr')];
  for (const c of G.s.companions) if (c.status === 'garnison') d += (c.st.atk + c.st.def) * 1.5;
  if (isAlly('sachsen')) d += 20;
  return Math.round(d);
}

export function dailyBalance() {
  const lvl = G.s.castle.level;
  const income = [
    ['Pacht der Bauern', 20 + lvl * 15],
    ['Marktgeld', [0, 15, 35, 60][bLevel('markt')]],
  ];
  if (isAlly('gilde')) income.push(['Handelsanteile der Gilde', 15]);
  if (bLevel('felder') >= 3) income.push(['Mahlgeld der Windmühle', 10]);
  const costs = [];
  const wages = G.s.companions.reduce((a, c) => a + (c.wage || 0), 0);
  if (wages) costs.push(['Sold', wages]);
  if (!isAlly('normannen')) costs.push(['Abgaben an den Vogt', 5 + lvl * 10]);
  const season = seasonIndex(), sz = bLevel('schafzucht');
  const prod = {
    holz: [0, 6, 12, 18][bLevel('holzfaeller')],
    stein: [0, 4, 8, 12][bLevel('steinbruch')],
    getreide: Math.round([0, 6, 12, 18][bLevel('felder')] * FIELD_SEASON[season]),
    wolle: [0, 4, 8, 12][sz],
    fleisch: [0, 0, 2, 4][sz],
    felle: [0, 0, 0, 1][sz],
  };
  if (season === 3) { prod.holz = Math.floor(prod.holz / 2); prod.stein = Math.floor(prod.stein / 2); prod.wolle = Math.floor(prod.wolle / 2); }
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
  const costOf = (name) => (bal.costs.find(([n]) => n === name) || [0, 0])[1];
  const wages = costOf('Sold'), tax = costOf('Abgaben an den Vogt');
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
  for (const [k, v] of Object.entries(bal.prod)) if (v) parts.push(`+${v} ${GOODS[k].name}`);
  parts.push(`${eaten + bought} Rationen gegessen${bought ? ` (${bought} zugekauft)` : ''}`);
  log(`Tag ${G.s.day} in ${homeName()}: ${parts.join(', ')}.`);
}

function checkRaid() {
  if (G.s.day < 5) return;
  const threats = [];
  if (isHostileFaction('normannen')) threats.push({ by: 'Normannische Truppen', str: 40 + G.s.day * 3, chance: 0.2, army: 'heer_john' });
  if (isHostileFaction('waldleute')) threats.push({ by: 'Waldleute', str: 25 + G.s.day * 2, chance: 0.15 });
  threats.push({ by: 'Raubgesindel', str: 12 + G.s.day * 1.6, chance: 0.07 });
  for (const t of threats) {
    if (Math.random() >= t.chance) continue;
    const home = castleSite(), p = G.s.player;
    if (t.army && !G.siege && Math.hypot(home.x - p.x, home.y - p.y) < 100 && startSiege(home, t.army, Math.min(0.8, 0.35 + G.s.day * 0.02))) break;
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
