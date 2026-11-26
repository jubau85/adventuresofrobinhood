// Bauen und Verfall: Die Welt erneuert sich ständig. Auf Bauplätzen entstehen neue Häuser,
// anderswo brennt eines ab, verfällt oder wird vom Sturm abgedeckt und später neu errichtet.
// Wer einen Ort überfällt, legt ihn lahm: Dort wird eine Weile nichts gebaut, die Leute haben Angst.

import { G, log } from './state.js';
import { FACTIONS, GOODS, MAP_K } from './data.js';
import { rand, randInt, pick } from './rng.js';
import { changeRep } from './politics.js';
import { spawnGroup, rebuildUnits, makeNpc, removeGroup } from './units.js';
import { addCargo, cargoFree } from './economy.js';
import { hourOf } from './sim.js';
import { buildingUp, refreshBuildingBlocks } from './world.js';
import { DEFENDER_NPC, repairBuilding } from './siege.js';

const GROWING = { stadt: 1, markt: 1, dorf: 1, burg: 1, halle: 1 };

// ---------------------------------------------------------------- Zustand eines Hauses
// b.cons: nicht gesetzt oder 1 = steht, 0 bis 1 = im Bau, -1 = Ruine, -2 = leerer Bauplatz
export function standing(b) { return !(b.cons < 1); }
export function underConstruction(b) { return b.cons >= 0 && b.cons < 1; }

function setCons(b, v) {
  const was = buildingUp(b);
  if (!b.plot && v >= 1) { b.cons = undefined; delete G.s.cons[b.idx]; }
  else {
    b.cons = v;
    if (b.plot && v === -2) delete G.s.cons[b.idx];
    else G.s.cons[b.idx] = Math.round(v * 1000) / 1000;
  }
  // Wände hoch oder Haus gefallen: Das Haus sperrt nun seine Felder oder gibt sie frei
  if (buildingUp(b) !== was) refreshBuildingBlocks(G.world);
}

// Häuser je Ort, einmal je Welt gesammelt
let hcache = null, hworld = null;
export function siteHouses(id) {
  if (hworld !== G.world) {
    hcache = new Map(); hworld = G.world;
    for (const b of G.world.buildings) {
      if (b.kind !== 'house' || !b.site) continue;
      if (!hcache.has(b.site)) hcache.set(b.site, []);
      hcache.get(b.site).push(b);
    }
  }
  return hcache.get(id) || [];
}

export function isBlighted(s) { return !!s && (G.s.blight[s.id] || 0) > G.s.day; }

// Nach einer Plünderung ist ein Ort verlassen: niemand wohnt dort, kein Licht, kein Rauch, kein Markt
export function isAbandoned(s) { return !!s && !!G.s && !!G.s.abandoned && (G.s.abandoned[s.id] || 0) > G.s.day; }
export function abandonedId(id) { return !!G.s && !!G.s.abandoned && (G.s.abandoned[id] || 0) > G.s.day; }

// Neues Spiel: manche Bauplätze sind schon halb bebaut, ein paar alte Häuser verfallen
export function initDynamics() {
  G.s.cons = {}; G.s.blight = G.s.blight || {}; G.s.slain = G.s.slain || {}; G.s.raided = G.s.raided || {};
  for (const b of G.world.buildings) {
    if (b.kind !== 'house' || !b.site) continue;
    if (b.plot) {
      const r = Math.random();
      if (r < 0.4) G.s.cons[b.idx] = Math.round(rand(0.05, 0.9) * 1000) / 1000;
      else if (r < 0.62) G.s.cons[b.idx] = 1;
    } else if (!b.tavern && Math.random() < 0.012) G.s.cons[b.idx] = -1;
    else if (!b.tavern && Math.random() < 0.04) G.s.damage[b.idx] = Math.round(rand(0.15, 0.45) * 100) / 100;
  }
}

// Gespeicherten Zustand auf die frisch erzeugte Welt übertragen
export function applyCons() {
  if (!G.s.cons) initDynamics();
  G.s.blight = G.s.blight || {}; G.s.slain = G.s.slain || {}; G.s.raided = G.s.raided || {}; G.s.abandoned = G.s.abandoned || {};
  for (const b of G.world.buildings) {
    if (b.kind !== 'house') continue;
    const v = G.s.cons[b.idx];
    b.cons = v !== undefined ? v : b.plot ? -2 : undefined;
  }
  refreshBuildingBlocks(G.world);
  G.fires = [];
  G.raid = null;
}

function hurt(b, amount, fire = false) {
  b.dmg = Math.min(1, (b.dmg || 0) + amount);
  G.s.damage[b.idx] = Math.round(b.dmg * 100) / 100;
  if (fire) igniteHouse(b, rand(40, 70));
}

export function igniteHouse(b, dur = 55) {
  b.fire = G.time + dur;
  // Alle in der Nähe lassen alles stehen und liegen
  for (const v of G.peasants || []) if (v.home && v.home.id === b.site && !v.funeral && !v.hidden && v.role !== 'kind') v.task = null;
  b.dmg = Math.max(b.dmg || 0, 0.12);
  G.s.damage[b.idx] = Math.round(b.dmg * 100) / 100;
  if (!G.fires) G.fires = [];
  if (!G.fires.some((f) => f.b === b)) G.fires.push({ b, s: G.world.sites.find((s) => s.id === b.site), doused: 0 });
}

// Eimer Wasser aufs Feuer: jeder Eimer verkürzt den Brand
export function douse(b) {
  if (!(b.fire > G.time)) return;
  b.fire -= 6;
  const f = G.fires && G.fires.find((x) => x.b === b);
  if (f) f.doused++;
  G.fx.push({ kind: 'staub', x: b.x + rand(-0.3, 0.3), y: b.y + b.wy / 2, t: 0, dur: 0.9, col: '#e8eef2' });
}

// Ein Bewohner arbeitet an einem Haus: Baustelle wächst, Schaden wird ausgebessert
export function workOn(b) {
  if (underConstruction(b)) setCons(b, Math.min(0.98, b.cons + 0.012));
  else repairBuilding(b, 0.15);
}

export function burningIn(s) {
  if (!G.fires) return null;
  const f = G.fires.find((x) => x.s === s && x.b.fire > G.time);
  return f ? f.b : null;
}

// ---------------------------------------------------------------- Der tägliche Kreislauf
export function dailyDynamics() {
  const p = G.s.player;
  let notes = 0;
  const note = (s, text, kind = 'info') => {
    if (notes < 2 && Math.hypot(s.x - p.x, s.y - p.y) < 45 * MAP_K) { log(text, kind); notes++; }
  };
  for (const s of G.world.sites) {
    if (!GROWING[s.type]) continue;
    const hs = siteHouses(s.id);
    if (!hs.length) continue;
    const blight = isBlighted(s), sieged = G.siege && G.siege.site === s;
    const calm = !blight && !sieged;
    // Ausgebrannte Häuser stürzen ein und werden später neu gebaut
    for (const b of hs) {
      if (standing(b) && b.dmg >= 0.9 && !(b.fire > G.time)) {
        b.dmg = 0; delete G.s.damage[b.idx];
        setCons(b, -1);
        note(s, `In ${s.name} ist ein ausgebranntes Haus eingestürzt.`);
      }
    }
    // Baufortschritt
    let building = 0;
    for (const b of hs) {
      if (!underConstruction(b)) continue;
      if (!calm) { building++; continue; }
      const v = b.cons + rand(0.1, 0.2) * (b.helped ? 1.8 : 1);
      if (v >= 1) { b.helped = false; setCons(b, 1); note(s, `In ${s.name} ist ein neues Haus fertig geworden.`, 'good'); } else { setCons(b, v); building++; }
    }
    // Neue Baustellen: zuerst die Ruinen, dann freie Bauplätze
    if (calm && building < 1 + Math.floor(hs.length / 30) && Math.random() < 0.15 + hs.length / 300) {
      const ruins = hs.filter((b) => b.cons === -1), empty = hs.filter((b) => b.cons === -2);
      const b = ruins.length && (Math.random() < 0.7 || !empty.length) ? pick(ruins) : empty.length ? pick(empty) : null;
      if (b) { const was = b.cons; setCons(b, 0.02); note(s, was === -1 ? `In ${s.name} räumt man eine Brandstelle und baut neu.` : `In ${s.name} wird ein neues Haus gebaut.`); }
    }
    // Unglück und Verfall: Feuer, Sturm, Alter. In verödeten Orten verfällt mehr.
    if (Math.random() < (0.08 + hs.length * 0.0015) * (blight ? 2.5 : 1)) {
      const cand = hs.filter((b) => standing(b) && !b.tavern && !b.smithy && !(b.fire > G.time));
      if (cand.length) {
        const b = pick(cand), r = Math.random();
        if (r < 0.35) { hurt(b, rand(0.55, 1), true); note(s, `In ${s.name} ist ein Feuer ausgebrochen.`, 'bad'); }
        else if (r < 0.55) { b.dmg = 0; delete G.s.damage[b.idx]; setCons(b, -1); note(s, `In ${s.name} wird ein baufälliges Haus abgerissen.`); }
        else if (r < 0.75) { hurt(b, rand(0.2, 0.35)); note(s, `Ein Sturm hat in ${s.name} ein Dach abgedeckt.`); }
        else hurt(b, rand(0.15, 0.3));
      }
    }
  }
  // Verödete Orte fassen wieder Mut, Getötete werden langsam ersetzt
  for (const [id, until] of Object.entries(G.s.blight)) {
    if (until > G.s.day) continue;
    delete G.s.blight[id];
    const s = G.world.sites.find((x) => x.id === id);
    if (!s) continue;
    if (G.s.abandoned && G.s.abandoned[id]) { delete G.s.abandoned[id]; if (G.repopulate) G.repopulate(s); note(s, `Nach ${s.name} kehren die ersten Leute zurück. Bald wird dort wieder gebaut.`, 'good'); }
    else note(s, `In ${s.name} fasst man wieder Mut. Es wird wieder gebaut.`, 'good');
  }
  // Wer noch in einem verlassenen Ort herumsteht, ist längst geflohen
  if (G.peasants && G.peasants.some((v) => v.home && abandonedId(v.home.id) && !v.flee)) G.peasants = G.peasants.filter((v) => !(v.home && abandonedId(v.home.id)));
  for (const [id, n] of Object.entries(G.s.slain)) {
    const s = G.world.sites.find((x) => x.id === id);
    if (!s || isBlighted(s) || n <= 0) { if (n <= 0) delete G.s.slain[id]; continue; }
    G.s.slain[id] = n - 1;
    if (G.addVillager) G.addVillager(s);
  }
}

// ---------------------------------------------------------------- Brände in deiner Nähe
let fireT = 90;
export function updateDynamics(dt) {
  const p = G.s.player;
  if (!G.fires) G.fires = [];
  // Hin und wieder bricht dort, wo du gerade bist, ein Feuer aus
  fireT -= dt;
  if (fireT <= 0) {
    fireT = rand(140, 300);
    const h = hourOf();
    const s = G.world.sites.find((x) => GROWING[x.type] && Math.hypot(x.x - p.x, x.y - p.y) < (x.clear || 6) + 3);
    if (s && h > 7 && h < 20 && !G.siege && !G.raid && !isBlighted(s) && Math.random() < 0.55) {
      const cand = siteHouses(s.id).filter((b) => standing(b) && !b.tavern && !(b.fire > G.time) && Math.hypot(b.x - p.x, b.y - p.y) < 11);
      if (cand.length) {
        const b = pick(cand);
        igniteHouse(b, rand(45, 65));
        log(`Feuer in ${s.name}! Die Leute laufen mit Eimern herbei.`, 'bad');
      }
    }
  }
  for (let i = G.fires.length - 1; i >= 0; i--) {
    const f = G.fires[i], b = f.b;
    if (b.fire > G.time && Math.abs(b.x - p.x) + Math.abs(b.y - p.y) < 70) {
      b.dmg = Math.min(1, (b.dmg || 0) + dt * 0.006);
      G.s.damage[b.idx] = Math.round(b.dmg * 100) / 100;
      continue;
    }
    G.fires.splice(i, 1);
    if (f.doused >= 3 && f.s && Math.hypot(b.x - p.x, b.y - p.y) < 25) log(`Das Feuer in ${f.s.name} ist gelöscht.`, 'good');
  }
  if (G.raid) updateRaid(dt);
}

// ---------------------------------------------------------------- Überfall auf einen Ort
const RAID_GUARDS = { dorf: 4, markt: 6, halle: 6, burg: 10, stadt: 10, abtei: 3 };
const RAID_GOLD = { dorf: [30, 70], markt: [70, 150], halle: [50, 110], burg: [100, 200], stadt: [150, 300], abtei: [90, 180] };

// Warum ein Überfall gerade nicht geht (oder null, wenn er geht)
const RAID_PAUSE = 4;
export function raidBlock(s) {
  if (!s || !RAID_GUARDS[s.type]) return 'Hier gibt es nichts zu überfallen.';
  if (G.raid) return 'Du bist schon mitten in einem Überfall.';
  if (G.siege && G.siege.site === s) return 'Der Ort wird gerade belagert.';
  if (isAbandoned(s)) return `${s.name} ist verlassen. Hier gibt es nichts mehr zu holen.`;
  if (isBlighted(s)) return `In ${s.name} haben sich die Leute verbarrikadiert, die Wachen sind verdoppelt. Bis Tag ${G.s.blight[s.id]} ist hier nichts zu machen.`;
  const last = G.s.lastRaid;
  if (last !== undefined && G.s.day < last + RAID_PAUSE) return `Nach deinem letzten Überfall ist das ganze Land gewarnt. Frühestens am Tag ${last + RAID_PAUSE} kannst du wieder zuschlagen.`;
  return null;
}
export function canRaid(s) { return !raidBlock(s); }
export function raidable(s) { return !!s && !!RAID_GUARDS[s.type]; }
export function raidVictim(t) { return t.kind === 'peasant' && !!G.raid && t.home === G.raid.site && !t.hidden && !t.dead; }

export function startRaid(s) {
  if (!canRaid(s)) return false;
  const types = DEFENDER_NPC[s.faction] || ['wache'];
  const n = Math.round(RAID_GUARDS[s.type] * ((G.fpsAvg || 60) >= 40 ? 1 : 0.7)) + Math.floor(G.s.day / 15);
  const walled = s.type === 'burg' || s.palisade;
  const pos = walled ? { x: s.x + 0.4, y: s.y + 2.2 } : { x: s.x, y: s.y + 1 };
  const members = [];
  for (let k = 0; k < n; k++) members.push(makeNpc(k % 3 === 2 ? types[1] || types[0] : types[0], pos.x + rand(-1, 1), pos.y + rand(-1, 1), Math.floor(G.s.day / 10)));
  const g = spawnGroup('verteidiger', { pos, membersUnits: members });
  if (!g) return false;
  g.faction = s.faction; g.engaged = true; g.provoked = true; g.raid = s.id; g.wait = 99999; g.path = null;
  G.raid = { site: s, group: g, t: 0 };
  G.s.lastRaid = G.s.day;
  for (const v of G.peasants) if (v.home === s && !v.funeral) { v.task = null; v.act = null; v.carry = null; }
  G.s.blight[s.id] = Math.max(G.s.blight[s.id] || 0, G.s.day + 10);
  log(`Du überfällst ${s.name}! Die Glocken läuten Sturm, die Leute fliehen in ihre Häuser.`, 'bad');
  changeRep(s.faction, s.type === 'abtei' ? -35 : -25);
  if (s.faction !== 'kirche') changeRep('kirche', -6);
  for (const r of FACTIONS[s.faction].rivals) changeRep(r, 3);
  rebuildUnits();
  return true;
}

function updateRaid(dt) {
  const r = G.raid, s = r.site, p = G.s.player;
  r.t += dt;
  const g = r.group;
  if (!G.groups.includes(g) || !g.members.length) { plunder(s); G.raid = null; return; }
  if (p.dead || Math.hypot(p.x - s.x, p.y - s.y) > (s.clear || 6) + 22) {
    log(`Du ziehst dich aus ${s.name} zurück. Die Besatzung schließt die Tore.`);
    removeGroup(g);
    G.raid = null;
    rebuildUnits();
  }
}

function plunder(s) {
  const [a, b] = RAID_GOLD[s.type];
  const recent = (G.s.raided[s.id] || -99) > G.s.day - 20;
  const gold = Math.round(randInt(a, b) * (recent ? 0.35 : 1));
  G.s.gold += gold;
  const loot = [`${gold} Gold`];
  for (const good of (s.produces || []).slice(0, 2)) {
    const n = Math.min(randInt(3, 8), cargoFree());
    if (n > 0 && !recent) { addCargo(good, n); loot.push(`${n} ${GOODS[good].name}`); }
  }
  // Ein paar Häuser gehen in Flammen auf
  const hs = siteHouses(s.id).filter((h) => standing(h) && !(h.fire > G.time)).sort((x, y) => Math.hypot(x.x - s.x, x.y - s.y) - Math.hypot(y.x - s.x, y.y - s.y));
  for (const h of hs.slice(0, randInt(2, 4))) hurt(h, rand(0.5, 1), true);
  G.s.blight[s.id] = G.s.day + 12 + (G.s.slain[s.id] || 0) * 2;
  G.s.raided[s.id] = G.s.day;
  // Die Bewohner fliehen, der Ort steht leer, bis die Brache vorbei ist
  if (!G.s.abandoned) G.s.abandoned = {};
  G.s.abandoned[s.id] = G.s.blight[s.id];
  if (G.evacuate) G.evacuate(s);
  const tr = G.s.tourney;
  if (tr && tr.site === s.id && !tr.done) { tr.done = true; log(`Das Turnier in ${s.name} fällt aus.`, 'bad'); }
  G.s.flags.raids = (G.s.flags.raids || 0) + 1;
  log(`Ihr plündert ${s.name}: ${loot.join(', ')}. Rauch steigt über den Dächern auf, die Bewohner fliehen mit dem, was sie tragen können. ${s.name} ist verlassen.`, 'bad');
}

// Ein Bewohner fällt: Der Ort trauert und verödet länger
export function villagerKilled(v) {
  const s = v.home;
  if (!s) return;
  G.s.slain[s.id] = (G.s.slain[s.id] || 0) + 1;
  G.s.blight[s.id] = Math.max(G.s.blight[s.id] || 0, G.s.day + 10) + 2;
  if (s.faction) changeRep(s.faction, -3);
  changeRep('kirche', -1);
}

// ---------------------------------------------------------------- Stiften und Sühne
export function rebuildNeed(s) {
  return siteHouses(s.id).filter((b) => b.cons === -1 || underConstruction(b) || (standing(b) && b.dmg > 0)).length;
}
export function donateCost(s) { return 30 + 12 * Math.min(10, rebuildNeed(s)); }
export function canDonate(s) { return GROWING[s.type] && !isBlighted(s) && rebuildNeed(s) > 0 && (G.s.towns[s.id].donateDay || -9) < G.s.day - 2; }

export function donate(s) {
  const cost = donateCost(s);
  if (G.s.gold < cost || !canDonate(s)) return false;
  G.s.gold -= cost;
  G.s.towns[s.id].donateDay = G.s.day;
  for (const b of siteHouses(s.id)) {
    if (underConstruction(b)) { b.helped = true; setCons(b, Math.min(0.97, b.cons + 0.35)); }
    else if (b.cons === -1) { b.helped = true; setCons(b, 0.2); }
    else if (standing(b) && b.dmg > 0) { b.dmg = Math.max(0, b.dmg - 0.5); if (b.dmg <= 0.001) { b.dmg = 0; delete G.s.damage[b.idx]; } else G.s.damage[b.idx] = b.dmg; }
  }
  log(`Du stiftest ${cost} Gold für den Wiederaufbau von ${s.name}. Zimmerleute und Dachdecker machen sich ans Werk.`, 'good');
  changeRep(s.faction, 4);
  if (s.faction !== 'kirche') changeRep('kirche', 1);
  return true;
}

export function atoneCost(s) { return 120 + 25 * (G.s.slain[s.id] || 0); }
export function atone(s) {
  const cost = atoneCost(s);
  if (G.s.gold < cost || !isBlighted(s)) return false;
  G.s.gold -= cost;
  delete G.s.blight[s.id];
  if (G.s.abandoned && G.s.abandoned[s.id]) { delete G.s.abandoned[s.id]; if (G.repopulate) G.repopulate(s); }
  log(`Du zahlst ${cost} Gold Sühne an ${s.name} und lässt Messen für die Toten lesen. Langsam kehrt das Leben zurück.`, 'good');
  changeRep(s.faction, 10);
  changeRep('kirche', 4);
  return true;
}
