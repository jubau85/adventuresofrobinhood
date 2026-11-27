// Erobern und Halten (Phase 3). Vor einer Grafschaftsburg rufst du ein Aufgebot zusammen: Söldner, dein Gefolge
// und Hilfe von Verbündeten, die mit den Herren der Burg verfeindet sind. Fällt die Burg, gehören dir Burg und
// Grafschaft. Die überlebenden Söldner bleiben als Besatzung. Ein Kastellan führt die Burg nach deiner Vorgabe:
// ein eigener Gefolgsmann oder, wenn du keinen einsetzt, ein gedungener Burgvogt, der weniger taugt.
// Die früheren Herren wollen ihre Burg zurück und greifen von Zeit zu Zeit an.

import { G, log, playerColor } from './state.js';
import { FACTIONS, LIVERY, MAP_K } from './data.js';
import { rand, randInt } from './rng.js';
import { SHIRES, HOME_SHIRE, claimShire, shireTax, shireName } from './shires.js';
import { changeRep, addRenown, isAlly } from './politics.js';
import { makeNpc, partyMembers, placeNear, rebuildUnits, inCombat, grantXp } from './units.js';
import { rebuildStaticWalls } from './world.js';
import { startSiege } from './siege.js';
import { partyCap } from './castle.js';
import { siteById } from './economy.js';

// ---------------------------------------------------------------- Besitz
export function holdings() { return G.s.holdings || (G.s.holdings = {}); }
export function holdingOf(s) { const id = typeof s === 'string' ? s : s && s.id; return id ? holdings()[id] || null : null; }
export function isHeld(s) { return !!holdingOf(s); }
// Deine Burg Ashcombe oder eine eroberte
export function isOwnSite(s) { return !!s && (s.type === 'spieler' || isHeld(s)); }
// Farbe der Herrschaft eines Ortes (Banner, Wachen, Kartenzeichen)
export function siteColor(s) { return isHeld(s) ? playerColor() : s && s.faction ? FACTIONS[s.faction].color : null; }
export function heldSites() { return Object.keys(holdings()).map(siteById).filter(Boolean); }

// Ausbau der Burgen bleibt, auch wenn sie den Herrn wechseln (die Welt wird beim Laden neu erzeugt)
function siteLevels() { return G.s.siteLevel || (G.s.siteLevel = {}); }

// Nach dem Laden und nach jedem Wechsel: Herr, Stufe, Farben
export function applyHoldings() {
  let walls = false;
  // Burgen, die im Krieg den Herrn gewechselt haben (war.js, loseHolding)
  for (const [id, f] of Object.entries(G.s.siteFaction || {})) { const s = siteById(id); if (s && FACTIONS[f]) s.faction = f; }
  for (const [id, lv] of Object.entries(siteLevels())) {
    const s = siteById(id);
    if (s && s.castleLevel !== lv) { s.castleLevel = lv; walls = true; }
  }
  for (const s of G.world.sites) s.lord = isHeld(s) ? 'spieler' : null;
  if (walls) rebuildStaticWalls(G.world);
  recolorGuards();
  G.staticDirty = true;
}
function recolorGuards() {
  for (const v of G.peasants || []) {
    if (v.role !== 'wache' || !v.home || v.home.type !== 'burg') continue;
    v.tunic = siteColor(v.home) || v.tunic;
  }
}

// ---------------------------------------------------------------- Kastellan und Vorgaben
export const ORDERS = {
  ausgewogen: { name: 'Ausgewogen', keep: 0.25, cap: 12, repair: 0.06, works: 1, text: 'Er führt die Burg mit ruhiger Hand: bessert aus, hält die Besatzung bei 12 Mann, baut langsam weiter und schickt dir drei Viertel der Abgaben.' },
  ausbau: { name: 'Burg ausbauen', keep: 0.7, cap: 10, repair: 0.15, works: 4, text: 'Gut zwei Drittel der Abgaben fließen in Mauern und Türme: erst die Schäden, dann Graben, Wehrgang und Torhaus, zuletzt ein mächtiger Donjon.' },
  holz: { name: 'Holz erzeugen', keep: 0.25, cap: 8, repair: 0.04, works: 0, wood: 12, text: 'Holzfäller schlagen in den Forsten der Grafschaft. Fuhrleute bringen jeden Tag Holz in dein Burglager. Die Besatzung bleibt klein.' },
  verteidigung: { name: 'Verteidigung', keep: 0.5, cap: 30, repair: 0.08, works: 0, grow: 2, def: 15, text: 'Die Hälfte der Abgaben geht in Sold und Waffen: Die Besatzung wächst bis 30 Mann, übt jeden Tag, auf allen Türmen stehen Wachen (+15 Verteidigung).' },
};
export const ORDER_IDS = Object.keys(ORDERS);
// Befestigung in Stufen; der Donjon macht aus einer Steinburg eine Festung (sichtbar)
export const WORKS = [
  { name: 'Graben', def: 10, need: 30, text: 'Ein tiefer, nasser Graben um die Mauer.' },
  { name: 'Wehrgang', def: 12, need: 45, text: 'Ein überdachter Wehrgang mit Schießscharten.' },
  { name: 'Torhaus', def: 14, need: 60, text: 'Ein Torhaus mit Fallgitter und Pechnasen.' },
  { name: 'Donjon', def: 20, need: 90, text: 'Ein mächtiger Donjon in der Mitte: Aus der Burg wird eine Festung.', keep: true },
];
const STEWARD_WAGE = 6;

export function castellanOf(h) { return h && h.castellan ? G.s.companions.find((c) => c.id === h.castellan && c.status === 'kastellan') || null : null; }
// Wie gut die Burg geführt wird: ein eigener Gefolgsmann besser, je erfahrener er ist
export function holdingEff(h) { const c = castellanOf(h); return c ? Math.min(1.8, 1 + (c.level - 1) * 0.1) : 0.7; }
export function worksDone(h) { return WORKS.slice(0, h.works).filter((w) => !w.keep || h.level >= 3); }
// Der Donjon zählt nur, solange die Burg noch keine Festung ist
export function nextWork(h) {
  for (let k = h.works; k < WORKS.length; k++) {
    if (WORKS[k].keep && h.level >= 3) continue;
    return WORKS[k];
  }
  return null;
}

export function holdingDefense(h) {
  if (typeof h === 'string') h = holdingOf(h);
  if (!h) return 0;
  let d = (h.level >= 3 ? 60 : 40) + worksDone(h).reduce((a, w) => a + w.def, 0) + h.garrison * 1.5 + (ORDERS[h.order].def || 0);
  const c = castellanOf(h);
  if (c) d += c.level * 3;
  d -= h.dmg * 40;
  return Math.max(5, Math.round(d));
}

// Für die Tagesabrechnung der Burg: Abgaben abzüglich des Anteils, den der Kastellan behält, Lohn der Burgvögte,
// Holz aus den Forsten
export function holdingIncome(id) {
  const h = holdingOf(id), tax = shireTax(id);
  if (!h) return tax;
  return Math.round(tax * (1 - ORDERS[h.order].keep));
}
export function holdingCosts() {
  const out = [];
  for (const s of heldSites()) if (!castellanOf(holdingOf(s))) out.push([`Burgvogt in ${s.name}`, STEWARD_WAGE]);
  return out;
}
export function holdingGoods() {
  const out = {};
  for (const s of heldSites()) {
    const h = holdingOf(s), o = ORDERS[h.order];
    if (o.wood) out.holz = (out.holz || 0) + Math.round(o.wood * holdingEff(h));
  }
  return out;
}

export function setHoldingOrder(s, order) {
  const h = holdingOf(s);
  if (!h || !ORDERS[order] || h.order === order) return;
  h.order = order;
  const c = castellanOf(h);
  log(`${c ? c.name : 'Der Burgvogt'} in ${s.name} hat eine neue Vorgabe: ${ORDERS[order].name}.`, 'good');
}

// Ein Gefolgsmann übernimmt die Burg; der bisherige Kastellan kommt zu dir zurück
export function appointCastellan(s, u) {
  const h = holdingOf(s);
  if (!h || !u || u.status !== 'party') return false;
  recallCastellan(s, true);
  u.status = 'kastellan'; u.seat = s.id;
  h.castellan = u.id;
  log(`${u.name} ist jetzt Kastellan von ${s.name}. ${ORDERS[h.order].name} lautet die Vorgabe.`, 'good');
  rebuildUnits();
  return true;
}
export function recallCastellan(s, quiet = false) {
  const h = holdingOf(s), c = castellanOf(h);
  if (!c) return false;
  h.castellan = null; c.seat = null;
  const p = G.s.player, here = Math.hypot(s.x - p.x, s.y - p.y) < 12, room = partyMembers().length < partyCap();
  c.status = here && room ? 'party' : 'garnison';
  if (c.status === 'party') placeNear(c, p.x, p.y, 1.5);
  if (!quiet) log(c.status === 'party' ? `${c.name} übergibt ${s.name} einem Burgvogt und reitet wieder mit dir.` : `${c.name} übergibt ${s.name} einem Burgvogt und kehrt in deine Garnison zurück.`);
  rebuildUnits();
  return true;
}

// Selbst Hand anlegen: Schäden sofort ausbessern, Männer anwerben, einen Bauabschnitt bezahlen
export function repairCostHolding(h) { return Math.round(h.dmg * 400 / 10) * 10; }
export function repairHolding(s) {
  const h = holdingOf(s), cost = repairCostHolding(h);
  if (!h || h.dmg <= 0 || G.s.gold < cost) return false;
  G.s.gold -= cost; h.dmg = 0;
  log(`Zimmerleute und Maurer setzen ${s.name} instand (${cost} Gold).`, 'good');
  return true;
}
export const RECRUIT = { n: 5, cost: 110, max: 40 };
export function recruitHolding(s) {
  const h = holdingOf(s);
  if (!h || h.garrison >= RECRUIT.max || G.s.gold < RECRUIT.cost) return false;
  G.s.gold -= RECRUIT.cost;
  h.garrison = Math.min(RECRUIT.max, h.garrison + RECRUIT.n);
  log(`${RECRUIT.n} Söldner ziehen in ${s.name} ein. Die Besatzung zählt jetzt ${h.garrison} Mann.`, 'good');
  return true;
}
export function workCost(h) { const w = nextWork(h); return w ? Math.round(w.need * 9 / 10) * 10 : 0; }
export function payWork(s) {
  const h = holdingOf(s), w = h && nextWork(h), cost = h ? workCost(h) : 0;
  if (!w || h.dmg > 0 || G.s.gold < cost) return false;
  G.s.gold -= cost;
  log(`Du bezahlst den Bau: ${w.name} in ${s.name} (${cost} Gold).`, 'good');
  finishWork(s, h);
  return true;
}
function finishWork(s, h) {
  const w = nextWork(h);
  if (!w) return;
  h.works = WORKS.indexOf(w) + 1; h.progress = 0;
  if (w.keep) {
    h.level = 3;
    siteLevels()[s.id] = 3;
    applyHoldings();
    log(`${s.name} hat einen neuen Donjon. Aus der Burg ist eine Festung geworden!`, 'gold');
  } else log(`${s.name}: ${w.name} fertig. ${w.text}`, 'good');
}

// ---------------------------------------------------------------- Eigene Belagerung
export const LEVIES = [
  { n: 12, name: 'Kleines Aufgebot' },
  { n: 20, name: 'Aufgebot' },
  { n: 30, name: 'Großes Aufgebot' },
];
export const SIEGE_GEAR = 150, MERC_COST = 25, SIEGE_RENOWN = 15;
export function levyCost(n) { return SIEGE_GEAR + n * MERC_COST; }

// Verbündete, die mit den Herren der Burg verfeindet sind, schicken Männer
const HELP = {
  sachsen: [['freisasse', 5], ['sachs_bogen', 3]],
  waldleute: [['waldmann', 5]],
  franken: [['sergent', 5], ['arbaletrier', 3]],
  normannen: [['soldat', 5], ['armbrust', 3]],
};
function rivalsOf(f, g) { return !!f && !!g && f !== g && (FACTIONS[f].rivals.includes(g) || FACTIONS[g].rivals.includes(f)); }
export function siegeHelpers(s) {
  return Object.keys(HELP).filter((f) => isAlly(f) && rivalsOf(f, s.faction)).map((f) => ({ f, n: HELP[f].reduce((a, [, k]) => a + k, 0) }));
}

// Was eine Belagerung verhindert (ohne Angabe der Größe: was jede verhindert)
export function besiegeBlock(s, n = null) {
  if (!s || s.type !== 'burg' || !SHIRES[s.id]) return 'Belagern kannst du nur die Burgen, die eine Grafschaft beherrschen.';
  if (isHeld(s)) return `${s.name} gehört dir schon.`;
  if (G.siege) return G.siege.site === s ? `${s.name} wird gerade belagert.` : `Gerade wird ${G.siege.site.type === 'spieler' ? 'deine Burg' : G.siege.site.name} belagert. Zwei Belagerungen zugleich gibt das Land nicht her.`;
  if (G.battle || inCombat()) return 'Erst muss der Kampf hier vorbei sein.';
  if (G.s.renown < SIEGE_RENOWN) return `Einem Ritter ohne Namen folgt niemand vor eine Burgmauer (Ruhm ${SIEGE_RENOWN} nötig, du hast ${G.s.renown}).`;
  if (n !== null && G.s.gold < levyCost(n)) return `Für ${n} Söldner und das Belagerungsgerät fehlt dir Gold (${levyCost(n)}).`;
  return null;
}

// Truppen des Aufgebots: Spießträger, Axtkämpfer, Armbrustschützen in deinen Farben; Verbündete in ihren
function levyUnits(s, n) {
  return (pos) => {
    const out = [], bonus = Math.floor((G.s.day - 1) / 8) + 1;
    const mix = ['soldat', 'soeldner', 'armbrust', 'soldat', 'soeldner', 'soldat', 'armbrust', 'soeldner'];
    for (let k = 0; k < n; k++) {
      const m = makeNpc(mix[k % mix.length], pos.x + rand(-1, 1), pos.y + rand(-1, 1), bonus);
      m.tunic = playerColor(); m.livery = playerColor();
      out.push(m);
    }
    for (const { f } of siegeHelpers(s)) {
      for (const [t, k] of HELP[f]) for (let j = 0; j < k; j++) {
        const m = makeNpc(t, pos.x + rand(-1, 1), pos.y + rand(-1, 1), bonus);
        if (LIVERY[f] && (m.cls === 'soldat' || m.cls === 'ritter')) { m.tunic = LIVERY[f]; m.livery = LIVERY[f]; }
        m.ally = f;
        out.push(m);
      }
    }
    return out;
  };
}

export function startOwnSiege(s, n) {
  const why = besiegeBlock(s, n);
  if (why) { log(why, 'bad'); return false; }
  const helpers = siegeHelpers(s);
  if (!startSiege(s, 'heer_spieler', null, { makeUnits: levyUnits(s, n), lead: true })) {
    log(`Vor ${s.name} findet sich kein Platz für ein Feldlager.`, 'bad');
    return false;
  }
  G.s.gold -= levyCost(n);
  const sg = G.siege;
  sg.lead = true; sg.side = 'att'; sg.levy = n;
  changeRep(s.faction, -25);
  for (const f of Object.keys(FACTIONS)) if (rivalsOf(f, s.faction)) changeRep(f, 4);
  const help = helpers.map((h) => `${h.n} ${FACTIONS[h.f].short}`).join(', ');
  log(`Du rufst dein Aufgebot zusammen: ${n} Söldner mit Trebuchet${help ? `, dazu schicken deine Verbündeten Männer (${help})` : ''}. Sie ziehen vor ${s.name} und schlagen ein Feldlager auf. Im Lager (E) gibst du das Zeichen zum Sturm.`, 'gold');
  return true;
}

// Die Burg ist gefallen: Burg und Grafschaft gehen an dich, die überlebenden Söldner bleiben als Besatzung
export function conquer(sg) {
  const s = sg.site, from = s.faction;
  const own = sg.army ? sg.army.members.filter((m) => !m.ally && !m.dead).length : 0;
  holdings()[s.id] = { since: G.s.day, from, castellan: null, order: 'ausgewogen', garrison: Math.max(4, Math.min(30, own)), dmg: 0.5, works: 0, progress: 0, level: s.castleLevel || 2, lastAttack: G.s.day };
  applyHoldings();
  claimShire(s.id);
  const gold = Math.round(rand(180, 320) / 10) * 10;
  G.s.gold += gold;
  changeRep(from, -15);
  for (const f of Object.keys(FACTIONS)) if (rivalsOf(f, from)) changeRep(f, 6);
  const home = s.id === HOME_SHIRE;
  addRenown(home ? 45 : 25);
  log(`${s.name} ist dein! Die Besatzung streckt die Waffen, dein Banner weht über dem Bergfried. Im Burgschatz: ${gold} Gold. ${Math.max(4, Math.min(30, own))} Söldner bleiben als Besatzung.`, 'gold');
  if (home) log(`Prinz Johns Vogt ist aus Pontefract verjagt. Das ${SHIRES[HOME_SHIRE].name} gehört wieder dir, und niemand verlangt mehr Abgaben von ${G.s.castleName || 'Ashcombe'}.`, 'gold');
  log(`Setz in ${s.name} einen Kastellan ein (E an der Burg), sonst führt ein gedungener Burgvogt die Geschäfte.`);
}

// Die Burg ist verloren: Die Grafschaft geht an die früheren Herren, der Kastellan schlägt sich verwundet heim
// to: wer die Burg bekommt (sonst die früheren Herren); eine andere Partei als die frühere wird neuer Herr des Ortes
export function loseHolding(s, text, to = null) {
  const h = holdingOf(s);
  if (!h) return;
  const c = castellanOf(h);
  delete holdings()[s.id];
  if (c) { c.status = 'verwundet'; c.woundedDays = 4; c.seat = null; c.hp = Math.max(1, Math.round(c.st.maxHp * 0.2)); }
  log(text, 'bad');
  if (c) log(`${c.name} hat sich verwundet nach Hause durchgeschlagen.`, 'bad');
  const lord = to || h.from;
  if (lord && lord !== s.faction) { (G.s.siteFaction || (G.s.siteFaction = {}))[s.id] = lord; s.faction = lord; }
  claimShire(s.id, lord);
  applyHoldings();
  rebuildUnits();
}

// Testmodus: eine Burg ohne Belagerung übernehmen
export function grantHolding(s) {
  if (!s || isHeld(s) || !SHIRES[s.id]) return false;
  holdings()[s.id] = { since: G.s.day, from: s.faction, castellan: null, order: 'ausgewogen', garrison: 14, dmg: 0, works: 0, progress: 0, level: s.castleLevel || 2, lastAttack: G.s.day };
  applyHoldings();
  claimShire(s.id);
  return true;
}

// ---------------------------------------------------------------- Gegenangriffe
// Welches Heer die früheren Herren schicken
const COUNTER = {
  normannen: { en: 'heer_john', wa: 'heer_john', nd: 'heer_normandie', fr: 'heer_normandie', fl: 'heer_normandie', ir: 'heer_john', sc: 'heer_john' },
  franken: { en: 'heer_philipp', wa: 'heer_philipp', nd: 'heer_philipp', fr: 'heer_philipp', fl: 'heer_philipp' },
  sachsen: { en: 'heer_richard', wa: 'heer_richard' },
  schotten: { sc: 'heer_schotten', en: 'heer_schotten' },
  iren: { ir: 'heer_iren' },
};
// Angriffsstärke der früheren Herren: wächst mit der Zeit, also muss die Burg mitwachsen
export function counterStrength() { return 45 + G.s.day * 2; }
const ATTACK_PAUSE = 7;

function counterattack(s, h) {
  const f = h.from, army = COUNTER[f] && COUNTER[f][s.realm];
  const p = G.s.player;
  h.lastAttack = G.s.day;
  // In der Nähe: eine echte Belagerung, bei der du helfen kannst
  if (army && Math.hypot(s.x - p.x, s.y - p.y) < 100 * MAP_K && !G.siege && !G.battle && startSiege(s, army, Math.min(0.8, 0.35 + G.s.day * 0.02))) return;
  const strength = Math.round(counterStrength() * rand(0.8, 1.2)), def = holdingDefense(h);
  const by = FACTIONS[f] ? `Die ${FACTIONS[f].short}` : 'Feinde';
  if (def >= strength) {
    h.garrison = Math.max(3, h.garrison - randInt(1, 4));
    h.dmg = Math.min(0.6, h.dmg + 0.15);
    const c = castellanOf(h);
    if (c) grantXp(c, 25);
    addRenown(2);
    log(`Nachricht aus ${s.name}: ${by} haben die Burg angegriffen. ${c ? c.name : 'Der Burgvogt'} und die Besatzung haben sie zurückgeschlagen (Verteidigung ${def} gegen ${strength}).`, 'good');
  } else loseHolding(s, `Nachricht aus ${s.name}: ${by} haben die Burg gestürmt (Verteidigung ${def} gegen ${strength})! ${s.name} und die Grafschaft ${shireName(s.id)} sind verloren.`);
}

// Nach einer echten Belagerung deiner eroberten Burg (siege.js)
export function holdingSiegeOver(s, how, defenders, by = null) {
  const h = holdingOf(s);
  if (!h) return;
  if (how === 'gefallen') { loseHolding(s, `${s.name} ist gefallen! Die Grafschaft ${shireName(s.id)} ${by && by !== h.from ? `fällt an die ${FACTIONS[by].short}` : 'geht an die früheren Herren zurück'}.`, by); return; }
  h.garrison = Math.max(3, defenders);
  h.dmg = Math.min(0.8, h.dmg + 0.25);
  if (how === 'abgewehrt') { addRenown(10); const c = castellanOf(h); if (c) grantXp(c, 40); }
}
// Fern von dir: Hält die Burg, wenn Mauern, Besatzung und Kastellan stark genug sind
export function holdingHolds(s) {
  return holdingDefense(holdingOf(s)) >= counterStrength() * rand(0.8, 1.2);
}

// ---------------------------------------------------------------- Tageswechsel
export function dailyHoldings() {
  for (const s of heldSites()) {
    const h = holdingOf(s), o = ORDERS[h.order], eff = holdingEff(h);
    // Schäden ausbessern, dann weiterbauen
    if (h.dmg > 0) h.dmg = Math.max(0, h.dmg - o.repair * eff);
    else if (o.works && nextWork(h)) {
      h.progress += o.works * eff;
      if (h.progress >= nextWork(h).need) finishWork(s, h);
    }
    // Besatzung: wächst bis zur Grenze der Vorgabe
    if (h.garrison < o.cap) h.garrison = Math.min(o.cap, h.garrison + (o.grow || 1));
    const c = castellanOf(h);
    if (c) grantXp(c, h.order === 'verteidigung' ? 12 : 8);
  }
  // Höchstens ein Gegenangriff am Tag
  for (const s of heldSites()) {
    const h = holdingOf(s), f = h.from;
    if (!f || G.s.day - (h.lastAttack ?? h.since) < ATTACK_PAUSE) continue;
    let chance = 0.07;
    if (G.s.rep[f] <= -60) chance += 0.06;
    if (isAlly(f)) chance = 0.01;
    if (Math.random() >= chance) continue;
    counterattack(s, h);
    break;
  }
}

// Kurzer Stand für Tafeln
export function holdingLine(s) {
  const h = holdingOf(s), c = castellanOf(h);
  return `${c ? `Kastellan ${c.name}` : 'Burgvogt'} · ${ORDERS[h.order].name} · Besatzung ${h.garrison} · Verteidigung ${holdingDefense(h)}${h.dmg > 0 ? ` · Schäden ${Math.round(h.dmg * 100)} %` : ''}`;
}
