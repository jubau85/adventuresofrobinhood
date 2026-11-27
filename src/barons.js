// Die Barone (Phase 6): sechs Herren mit eigener Burg, verteilt über das Reich: Wales, Schottland, Normandie,
// Südengland, Mittelengland und Irland. Sie handeln wie du: Sie bauen ihre Burg aus (dieselben Gebäude auf denselben
// Bauplätzen), werben Männer an, erfüllen Aufträge, treiben Handel, schwören im Krieg einer Seite die Treue oder kämpfen
// für sich selbst und nehmen Grafschaften ein. Wie geschickt und wie reich sie sind, legt der Schwierigkeitsgrad fest.
// Dir gegenüber haben sie ein Verhältnis: Geschenke und Hilfe machen Freunde und Verbündete, Raub und Streit machen
// Feinde. In einer Fehde ziehen sie gegen deine Burg, und du darfst ihre Burg belagern. Wer unterliegt, wird Vasall.
//
// Spielstand: G.s.barons[id] = { gold, men, level, plots, con, renown, side, rel, ally, feud, vassal, march, ... }
// Ein Baron sitzt in einer Burg (Ort mit type 'burg' und baron: id). Ihre Burgstufe ist die des Barons.

import { G, log, homeName } from './state.js';
import { BUILDINGS, GOODS, FACTIONS, GROUP_TYPES, MAP_K } from './data.js';
import { rand, randInt, pick } from './rng.js';
import { SHIRES, shireOwner, claimShire, shireName } from './shires.js';
import { OUTER_ONLY, STACKABLE, plotLayout } from './plots.js';
import { addRenown } from './politics.js';
import { spawnGroup } from './units.js';
import { sideStrength } from './war.js';
import { startSiege } from './siege.js';
import { castleDefense, burnOuterPlots, plotRects } from './castle.js';
import { setBaronRects, rebuildStaticWalls } from './world.js';
import { isHeld, holdingOf, holdingDefense, loseHolding } from './holdings.js';

// ---------------------------------------------------------------- Schwierigkeit
// inc: Anteil am Einkommen, days: Bauzeit, start: Burgstufe und Gebäude zu Beginn, gold: Startgold,
// smart: wie oft der Baron das Vernünftigste tut statt etwas Beliebiges, feud: ab welchem Verhältnis und Tag
// er Fehde gegen dich führt, raid: Stärke seiner Angriffe
export const DIFFICULTY = {
  leicht: { name: 'Leicht', inc: 0.62, days: 1.5, start: 1, builds: 2, gold: 200, men: 8, smart: 0.35, feudAt: -60, feudDay: 30, raid: 0.75,
    text: 'Die Barone wirtschaften gemächlich und lassen dich lange in Ruhe.' },
  mittel: { name: 'Mittel', inc: 0.9, days: 1.15, start: 1, builds: 3, gold: 450, men: 14, smart: 0.6, feudAt: -45, feudDay: 18, raid: 1,
    text: 'Die Barone bauen zügig, handeln klug und nehmen dir übel, was du ihnen antust.' },
  schwer: { name: 'Schwer', inc: 1.25, days: 0.85, start: 2, builds: 4, gold: 800, men: 24, smart: 0.85, feudAt: -25, feudDay: 10, raid: 1.3,
    text: 'Die Barone sind reich, gerissen und greifen früh nach allem, was du nicht verteidigst.' },
};
export const DIFF_IDS = Object.keys(DIFFICULTY);
export function difficulty() { return DIFFICULTY[(G.s && G.s.difficulty) || 'leicht'] || DIFFICULTY.leicht; }

// ---------------------------------------------------------------- Die sechs Barone
// trait: kriegsherr (wirbt an und greift an), kaufmann (Handel und Markt), wendehals (wechselt zur stärkeren Seite),
// baumeister (baut zuerst die Burg), frommer (Aufträge der Kirche, Kapelle), rebell (kämpft für sich gegen die Normannen)
export const BARONS = {
  gwilym: {
    name: 'Gwilym ap Rhys', short: 'Gwilym', seat: 'garw', region: 'Wales', color: '#d4507f', arms: { field: '#d4507f', metal: 'gold', charge: 'rabe' },
    side: 'richard', trait: 'kriegsherr', female: false,
    desc: 'Ein walisischer Herr aus den Bergen von Powys. Er hasst Johanns Barone und zählt seine Feinde wie andere ihre Schafe.',
  },
  malcolm: {
    name: 'Malcolm von Glenarden', short: 'Malcolm', seat: 'glenarden', region: 'Schottland', color: '#2b3a78', arms: { field: '#2b3a78', metal: 'silber', charge: 'hirsch' },
    side: null, trait: 'kaufmann', female: false,
    desc: 'Ein Lehnsmann König Wilhelms am Rand der Highlands. Er handelt mit Fellen, Wolle und Lachs und sieht zuerst auf sein Silber.',
  },
  raoul: {
    name: 'Raoul de Montcabré', short: 'Raoul', seat: 'montcabre', region: 'Normandie', color: '#262626', arms: { field: '#262626', metal: 'gold', charge: 'eber' },
    side: 'philipp', trait: 'wendehals', female: false,
    desc: 'Ein normannischer Baron, der Philipp von Frankreich zuhört, solange es sich lohnt. Er dient immer dem, der gerade gewinnt.',
  },
  hugh: {
    name: 'Hugh de Ravensmere', short: 'Hugh', seat: 'ravensmere', region: 'Südengland', color: '#6b4a2f', arms: { field: '#6b4a2f', metal: 'silber', charge: 'turm' },
    side: 'john', trait: 'baumeister', female: false,
    desc: 'Prinz Johns Gefolgsmann in Hampshire. Er baut Mauern lieber als Freundschaften.',
  },
  geoffrey: {
    name: 'Geoffrey von Kirkwold', short: 'Geoffrey', seat: 'kirkwold', region: 'Mittelengland', color: '#6f9a2c', arms: { field: '#6f9a2c', metal: 'silber', charge: 'kreuz' },
    side: 'richard', trait: 'frommer', female: false,
    desc: 'Ein Kreuzfahrer wie du, zurück aus Akkon. Er stiftet Kapellen, hält sein Wort und betet für König Richard.',
  },
  fergal: {
    name: 'Fergal Ó Duibhne', short: 'Fergal', seat: 'rathcarraig', region: 'Irland', color: '#4c94d0', arms: { field: '#4c94d0', metal: 'gold', charge: 'mond' },
    side: null, trait: 'rebell', female: false,
    desc: 'Ein gälischer Herr in den Mittellanden. Er nimmt den Normannen ab, was sie den Iren genommen haben.',
  },
};
export const BARON_IDS = Object.keys(BARONS);
const BARON_TRAIT = {
  kriegsherr: { name: 'Kriegsherr', build: 0.8, baronRecruit: 1.6, quest: 0.8, trade: 0.7, war: 1.6, faction: null },
  kaufmann: { name: 'Kaufmann', build: 1.0, baronRecruit: 0.8, quest: 0.9, trade: 1.8, war: 0.6, faction: 'gilde' },
  wendehals: { name: 'Wendehals', build: 1.0, baronRecruit: 1.0, quest: 1.0, trade: 1.1, war: 1.0, faction: null },
  baumeister: { name: 'Baumeister', build: 1.6, baronRecruit: 0.9, quest: 0.8, trade: 1.0, war: 0.8, faction: null },
  frommer: { name: 'Frommer Ritter', build: 1.0, baronRecruit: 0.9, quest: 1.6, trade: 0.8, war: 0.8, faction: 'kirche' },
  rebell: { name: 'Rebell', build: 0.9, baronRecruit: 1.3, quest: 0.9, trade: 0.9, war: 1.4, faction: null },
};
export function traitName(id) { return BARON_TRAIT[BARONS[id].trait].name; }
// Seiten im Krieg (war.js): Richard, Johann oder Philipp; ohne Seite kämpft der Baron für sich
export const SIDE_NAME = { richard: 'König Richard', john: 'Prinz Johann', philipp: 'König Philipp' };
const BARON_SIDE_FACTION = { richard: 'sachsen', john: 'normannen', philipp: 'franken' };

// Heere und Handelszüge der Barone in ihren Farben (Gruppen auf der Karte)
for (const [id, b] of Object.entries(BARONS)) {
  GROUP_TYPES[`heer_${id}`] = {
    name: `Das Heer von ${b.name}`, nom: `Das Heer von ${b.name}`, acc: `das Heer von ${b.name}`, pl: false, faction: null, baron: id, livery: b.color, army: true,
    members: [['ritter_n', 3, 3], ['soldat', 12, 12], ['armbrust', 6, 6], ['soeldner', 7, 7]],
    gold: [160, 320], itemChance: 1, renown: 8, count: 0, spawn: 'army', speed: 1.05,
  };
  GROUP_TYPES[`zug_${id}`] = {
    name: `Handelszug von ${b.short}`, nom: `Der Handelszug von ${b.name}`, acc: `den Handelszug von ${b.name}`, pl: false, faction: null, baron: id, livery: b.color,
    members: [['haendler', 1, 1], ['wache', 1, 2]], gold: [60, 130], goods: true, renown: 0, count: 0, spawn: 'route', speed: 1.12,
  };
}

// ---------------------------------------------------------------- Zustand
export function barons() { return (G.s && G.s.barons) || {}; }
export function baron(id) { return barons()[id] || null; }
export function baronSite(id) { return G.world.sites.find((s) => s.baron === id) || null; }
export function siteBaron(s) { return s && s.baron ? s.baron : null; }
export function baronColor(id) { return BARONS[id] ? BARONS[id].color : '#8a8070'; }
export function isBaronOwner(o) { return typeof o === 'string' && o.startsWith('b:'); }
export function ownerBaron(o) { return isBaronOwner(o) ? o.slice(2) : null; }
export function baronActive(id) { const b = baron(id); return !!b && !b.gone; }

// Bauplätze: dieselbe Anlage wie deine Turmburg
export function baronLayout(id) { const s = baronSite(id); return s ? plotLayout(s, 'turm') : []; }
export function baronPlots(id) {
  const b = baron(id), lay = baronLayout(id);
  if (!b) return [];
  if (!b.plots) b.plots = lay.map(() => null);
  while (b.plots.length < lay.length) b.plots.push(null);
  if (b.plots.length > lay.length) b.plots.length = lay.length;
  return b.plots;
}
export function baronBLevel(id, bid) { return baronPlots(id).reduce((a, p) => (p && p.id === bid ? Math.max(a, p.lv) : a), 0); }
function baronBSum(id, bid, table) { return baronPlots(id).reduce((a, p) => a + (p && p.id === bid ? table[p.lv] : 0), 0); }

// Neues Spiel: Burgen und Kassen je nach Schwierigkeit
export function initBarons() {
  const D = difficulty();
  G.s.barons = {};
  for (const [id, def] of Object.entries(BARONS)) {
    const b = G.s.barons[id] = {
      gold: D.gold + randInt(0, 120), men: D.men + randInt(0, 6), level: D.start, plots: null, con: null,
      renown: D.start >= 2 ? 30 : 8, side: def.side, rel: baronStartRel(id), ally: false, feud: false, vassal: false,
      quests: 0, trades: 0, wins: 0, losses: 0, lastGift: -9, lastAct: 0, march: null, feudSince: null, lastRaid: -99, tribute: 0, log: [],
    };
    const plots = baronPlots(id), lay = baronLayout(id);
    const want = baronStartBuilds(def.trait).slice(0, D.builds);
    for (const bid of want) { const i = baronFreePlot(id, bid, lay, plots); if (i >= 0) plots[i] = { id: bid, lv: D.start >= 2 && Math.random() < 0.5 ? 2 : 1 }; }
  }
  applyBarons();
}
function baronStartRel(id) {
  const def = BARONS[id];
  // Kreuzfahrer und Richards Leute mögen dich anfangs eher, Johanns Leute und Rebellen weniger
  return { richard: 10, john: -5, philipp: -10 }[def.side] ?? 0;
}
function baronStartBuilds(trait) {
  const base = { kriegsherr: ['kaserne', 'halle', 'schmiede', 'felder'], kaufmann: ['markt', 'schafzucht', 'felder', 'halle'], wendehals: ['halle', 'markt', 'kaserne', 'felder'],
    baumeister: ['steinbruch', 'holzfaeller', 'halle', 'markt'], frommer: ['kapelle', 'felder', 'halle', 'hospiz'], rebell: ['kaserne', 'felder', 'halle', 'stall'] };
  return base[trait];
}
function baronFreePlot(id, bid, lay, plots) {
  const inner = !OUTER_ONLY[bid] && bid !== 'wehr' && bid !== 'markt';
  const ok = lay.filter((p) => !plots[p.i] && !(OUTER_ONLY[bid] && p.inner));
  const pref = ok.find((p) => p.inner === inner);
  return pref ? pref.i : ok.length ? ok[0].i : -1;
}

// Nach Laden oder neuem Spiel: Burgstufe auf die Orte übertragen, Hindernisse eintragen
export function applyBarons() {
  if (!G.s.barons) return;
  const rects = [];
  let keep = false;
  for (const id of BARON_IDS) {
    const s = baronSite(id), b = baron(id);
    if (!s || !b) continue;
    const lv = Math.max(1, b.level);
    if ((s.castleLevel >= 3) !== (lv >= 3)) keep = true;
    s.castleLevel = lv;
    s.baronName = BARONS[id].name;
    // Gebäude auf den Bauplätzen sind Hindernisse wie in deiner Burg
    const plots = baronPlots(id), lay = baronLayout(id);
    plots.forEach((p, i) => { if (p && lay[i]) for (const [x, y, wx, wy, pen] of plotRects(p.id, p.lv, lay[i])) rects.push({ x, y, wx, wy, pen: !!pen }); });
  }
  // Der Bergfried einer Festung ist größer
  if (keep) rebuildStaticWalls(G.world);
  setBaronRects(G.world, rects);
  G.staticDirty = true;
}

// ---------------------------------------------------------------- Werte
export function baronCost(bid, L) {
  const lv = bid === 'burg' ? BUILDINGS.burg.levels[L] : BUILDINGS[bid] && BUILDINGS[bid].levels[L];
  if (!lv || !lv.cost) return null;
  // Ein Baron kauft das Baumaterial ein: Waren zählen mit ihrem Grundpreis
  return Object.entries(lv.cost).reduce((a, [k, v]) => a + (k === 'gold' ? v : v * GOODS[k].base * 0.8), 0);
}
function baronBuildDays(bid, L) {
  const lv = bid === 'burg' ? BUILDINGS.burg.levels[L] : BUILDINGS[bid].levels[L];
  return Math.max(1, Math.round((lv.days || 1) * difficulty().days));
}
export function menCap(id) { const b = baron(id); return 10 + b.level * 8 + baronBLevel(id, 'kaserne') * 8 + (BARONS[id].trait === 'kriegsherr' ? 8 : 0); }
// Einkommen am Tag (vor Schwierigkeit): Grundertrag, Werkstätten, Felder, Markt und Grafschaften, weniger Sold
export function baronIncome(id) {
  const b = baron(id), tr = BARON_TRAIT[BARONS[id].trait];
  let g = 22 + b.level * 18;
  g += baronBSum(id, 'markt', [0, 15, 35, 60]) * (tr.trade > 1.2 ? 1.25 : 1);
  g += baronBSum(id, 'felder', [0, 8, 14, 22]) + baronBSum(id, 'holzfaeller', [0, 6, 11, 16]) + baronBSum(id, 'steinbruch', [0, 8, 14, 22]);
  g += baronBSum(id, 'schafzucht', [0, 8, 15, 24]) + baronBSum(id, 'schmiede', [0, 4, 8, 12]);
  for (const sid of baronShires(id)) { const sh = SHIRES[sid]; g += 25 + (sh.gold || 0) + Object.entries(sh.goods || {}).reduce((a, [k, v]) => a + v * GOODS[k].base * 0.6, 0); }
  return Math.round(g * difficulty().inc);
}
export function baronUpkeep(id) { return Math.round(baron(id).men * 0.8); }
export function baronShires(id) { const st = G.s.shires || {}; return Object.keys(SHIRES).filter((k) => st[k] && st[k].owner === `b:${id}`); }
// Kampfkraft: Männer, Burg, Schmiede
export function baronStrength(id) {
  const b = baron(id);
  if (!b || b.gone) return 0;
  return Math.round(b.men * (1 + baronBLevel(id, 'schmiede') * 0.12) + b.level * 6);
}
export function baronDefense(id) {
  const b = baron(id);
  return Math.round([5, 25, 55, 90][b.level] + b.men * 1.5 + baronBSum(id, 'wehr', [0, 15, 35, 60]));
}
// Rangliste: Burg, Gebäude, Grafschaften, Männer, Ruhm, Gold
export function baronScore(id) {
  const b = baron(id);
  const plots = baronPlots(id).reduce((a, p) => a + (p ? p.lv : 0), 0);
  return Math.round(b.level * 100 + plots * 22 + baronShires(id).length * 90 + b.men * 2 + b.renown + Math.min(b.gold, 6000) / 30);
}

// ---------------------------------------------------------------- Verhältnis zu dir
export function relName(v) {
  if (v >= 60) return 'herzlich';
  if (v >= 25) return 'freundlich';
  if (v > -10) return 'höflich';
  if (v > -40) return 'kühl';
  return 'feindselig';
}
export function changeBaronRel(id, n, why = '') {
  const b = baron(id);
  if (!b || !n) return;
  const before = b.rel;
  b.rel = Math.max(-100, Math.min(100, Math.round(b.rel + n)));
  if (b.rel !== before && why) log(`${BARONS[id].name}: ${why} (Verhältnis ${n > 0 ? '+' : ''}${b.rel - before})`, n > 0 ? 'good' : 'bad');
  if (b.ally && b.rel < 10) { b.ally = false; log(`${BARONS[id].name} kündigt das Bündnis mit dir auf.`, 'bad'); }
}
function baronLogEntry(id, text, kind = 'info', loud = false) {
  const b = baron(id);
  b.log.push({ day: G.s.day, text });
  if (b.log.length > 12) b.log.splice(0, b.log.length - 12);
  const all = G.s.baronLog || (G.s.baronLog = []);
  all.push({ day: G.s.day, id, text });
  if (all.length > 60) all.splice(0, all.length - 60);
  if (loud) log(text, kind);
}
function baronNearPlayer(id, r = 110) { const s = baronSite(id), p = G.s.player; return !!s && Math.hypot(s.x - p.x, s.y - p.y) < r * MAP_K; }

// Was du ihm tun kannst
export const BARON_GIFT = 120;
export function giftBlock(id) {
  const b = baron(id);
  if (!b || b.gone) return 'Der Baron ist nicht mehr Herr seiner Burg.';
  if (b.lastGift >= G.s.day) return 'Heute hast du ihm schon etwas geschenkt.';
  if (G.s.gold < BARON_GIFT) return `Für ein würdiges Geschenk fehlt dir Gold (${BARON_GIFT}).`;
  return null;
}
export function baronGiveGift(id) {
  if (giftBlock(id)) return false;
  const b = baron(id);
  G.s.gold -= BARON_GIFT; b.gold += BARON_GIFT; b.lastGift = G.s.day;
  changeBaronRel(id, b.feud ? 4 : 10, 'Er nimmt dein Geschenk an');
  return true;
}
export function allianceBlock(id) {
  const b = baron(id);
  if (!b || b.gone) return 'Der Baron ist nicht mehr Herr seiner Burg.';
  if (b.ally) return 'Ihr seid schon verbündet.';
  if (b.feud) return 'Erst muss die Fehde beigelegt sein.';
  if (b.rel < 40) return `Er traut dir noch nicht genug (Verhältnis ${b.rel}, nötig 40).`;
  return null;
}
export function offerAlliance(id) {
  if (allianceBlock(id)) return false;
  const b = baron(id);
  b.ally = true;
  addRenown(3);
  log(`${BARONS[id].name} schlägt ein: Ihr seid verbündet. Er schickt dir Männer, wenn du eine Burg belagerst, und hilft, wenn man dich angreift.`, 'gold');
  return true;
}
export function feudBlock(id) {
  const b = baron(id);
  if (!b || b.gone) return 'Der Baron ist nicht mehr Herr seiner Burg.';
  if (b.feud) return 'Ihr liegt schon in Fehde.';
  if (b.vassal) return 'Er ist dein Vasall.';
  return null;
}
export function declareFeud(id, byBaron = false) {
  if (feudBlock(id)) return false;
  const b = baron(id);
  b.feud = true; b.ally = false; b.feudSince = G.s.day;
  b.rel = Math.min(b.rel, -50);
  if (byBaron) log(`${BARONS[id].name} sagt dir die Fehde an! Seine Männer werden gegen ${homeName()} und deine Burgen ziehen. Du darfst nun auch seine Burg belagern.`, 'bad');
  else { log(`Du sagst ${BARONS[id].name} die Fehde an. Ab jetzt darfst du seine Burg ${baronSite(id).name} belagern, und er wird sich wehren.`, 'bad'); }
  return true;
}
export function peaceCost(id) { const b = baron(id); return 150 + b.level * 120 + Math.round(baronStrength(id) * 2); }
export function peaceBlock(id) {
  const b = baron(id);
  if (!b || !b.feud) return 'Ihr liegt nicht in Fehde.';
  if (G.s.gold < peaceCost(id)) return `Er verlangt ${peaceCost(id)} Gold Sühne.`;
  return null;
}
export function makePeace(id) {
  if (peaceBlock(id)) return false;
  const b = baron(id);
  G.s.gold -= peaceCost(id); b.gold += peaceCost(id);
  b.feud = false; b.march = null; b.rel = Math.max(b.rel, -15);
  log(`Du zahlst ${BARONS[id].name} Sühne. Die Fehde ist beigelegt.`, 'good');
  return true;
}
// Darfst du seine Burg belagern? Nur in einer Fehde
export function baronSiegeBlock(s) {
  const id = siteBaron(s), b = id && baron(id);
  if (!b) return null;
  if (b.vassal) return `${BARONS[id].name} ist dein Vasall.`;
  if (!b.feud) return `Ohne Fehde greift kein Ritter die Burg eines Barons an. Sag ${BARONS[id].name} erst die Fehde an.`;
  return null;
}
// Du hast seine Burg genommen: Er zahlt Lösegeld und wird dein Vasall
export function baronConquered(id) {
  const b = baron(id), def = BARONS[id];
  if (!b) return;
  const ransom = Math.min(b.gold, 250 + b.level * 200);
  b.gold -= ransom; G.s.gold += ransom;
  b.feud = false; b.march = null; b.vassal = true; b.ally = true; b.rel = 20;
  b.men = Math.max(4, Math.floor(b.men * 0.3)); b.losses++;
  const a = G.s.war && G.s.war.allegiance;
  if (a) b.side = a;
  addRenown(30);
  for (const sid of baronShires(id)) claimShire(sid, 'spieler');
  log(`${baronSite(id).name} ist gefallen! ${def.name} beugt das Knie: Er zahlt ${ransom} Gold Lösegeld, wird dein Vasall und gibt dir seine Grafschaften. Jeden Tag zahlt er dir Tribut.`, 'gold');
  applyBarons();
}

// Verbündete Barone schicken Männer zu deiner Belagerung (holdings.js)
export function baronHelpers(target) {
  const out = [];
  for (const id of BARON_IDS) {
    const b = baron(id), s = baronSite(id);
    if (!b || b.gone || !(b.ally || b.vassal) || b.feud || !s || s.land !== target.land) continue;
    if (target.baron === id) continue;
    const n = Math.min(8, Math.max(2, Math.floor(b.men / 6)));
    if (Math.hypot(s.x - target.x, s.y - target.y) < 260 * MAP_K && b.men > n + 4) out.push({ id, n });
  }
  return out;
}

// ---------------------------------------------------------------- Tageslauf
export function dailyBarons() {
  if (!G.s.barons) return;
  const D = difficulty();
  let notes = 0;
  const say = (id, text, kind = 'info', force = false) => {
    const loud = force || (notes < 2 && baronNearPlayer(id));
    if (loud && !force) notes++;
    baronLogEntry(id, text, kind, loud);
  };
  for (const id of BARON_IDS) {
    const b = baron(id), def = BARONS[id], tr = BARON_TRAIT[def.trait];
    if (!b || b.gone || !baronSite(id)) continue;
    // Einkommen und Sold
    const inc = baronIncome(id), up = baronUpkeep(id);
    b.gold += inc - up;
    if (b.gold < 0) { const lost = Math.min(b.men, Math.ceil(-b.gold / 10)); b.men -= lost; b.gold = 0; }
    // Vasallen zahlen Tribut
    if (b.vassal) { const t = Math.max(5, Math.round(inc * 0.25)); b.gold -= t; G.s.gold += t; b.tribute += t; }
    // Baustelle fertig?
    if (b.con && G.s.day >= b.con.done) baronFinishBuild(id, say);
    // Heerzug angekommen?
    if (b.march && G.s.day >= b.march.arrive) baronResolveMarch(id, say);
    // Was der Baron heute tut: ein, an guten Tagen zwei Vorhaben
    const acts = Math.random() < 0.25 * D.smart ? 2 : 1;
    for (let k = 0; k < acts; k++) {
      const smart = Math.random() < D.smart;
      const w = {
        bauen: b.con ? 0 : 1.2 * tr.build,
        anwerben: b.men < menCap(id) ? 0.7 * tr.baronRecruit * (b.feud || b.march ? 1.8 : 1) : 0,
        auftrag: 0.55 * tr.quest,
        handel: 0.5 * tr.trade,
        krieg: !b.march && b.men >= 30 && G.s.day >= 8 && G.s.day - (b.lastWar || -99) >= 10 ? 0.14 * tr.war : 0,
      };
      // Klug: zuerst Burg und Einkommen, Krieg nur mit genug Männern
      if (smart && b.gold > (baronCost('burg', Math.min(3, b.level + 1)) || 9e9) * 0.8 && !b.con) w.bauen *= 2.5;
      if (smart && b.men < 16) w.anwerben *= 1.8;
      const act = pickWeighted(w);
      if (act === 'bauen') baronStartBuild(id, smart, say);
      else if (act === 'anwerben') baronRecruit(id);
      else if (act === 'auftrag') baronQuest(id, say);
      else if (act === 'handel') baronTrade(id, say);
      else if (act === 'krieg') baronPlanCampaign(id, say);
    }
    // Überschuss: Söldner für den Krieg oder eine Stiftung, die Ruhm bringt
    const rich = Math.max(1500 + b.level * 800, b.level < 3 ? baronCost('burg', b.level + 1) * 1.2 : 0);
    if (b.gold > rich) {
      const room = menCap(id) + 20 - b.men;
      if ((b.feud || b.side || def.trait === 'rebell') && tr.war >= 1 && room > 0) { const n = Math.min(10, room); b.men += n; b.gold -= n * 20; }
      else {
        b.gold -= 350; b.renown += 2;
        if (Math.random() < 0.25) say(id, `${def.name} stiftet ${pick(['ein Glasfenster', 'einen Altar', 'eine Glocke', 'ein Spital', 'eine Brücke'])} in ${pick(G.world.sites.filter((o) => (o.type === 'abtei' || o.type === 'stadt') && o.land === baronSite(id).land)).name}.`);
      }
    }
    // Seite im Krieg prüfen (alle paar Tage)
    if ((G.s.day + id.length) % 6 === 0) baronReconsiderSide(id, say);
    // Fehde gegen dich
    if (!b.feud && !b.vassal && !b.ally && b.rel <= D.feudAt && G.s.day >= D.feudDay && Math.random() < 0.15 * tr.war) declareFeud(id, true);
    if (b.feud && !b.march && b.men >= 14 && G.s.day - b.lastRaid >= 5 && Math.random() < 0.3 * tr.war) baronPlanFeud(id, say);
    // Das Verhältnis kühlt ab oder erholt sich langsam
    if (!b.feud && b.rel < 0 && Math.random() < 0.3) b.rel++;
  }
  // Wöchentlich: Tribut der Vasallen melden
  if (G.s.day % 7 === 0) {
    const vs = BARON_IDS.filter((id) => baron(id) && baron(id).vassal && baron(id).tribute > 0);
    if (vs.length) {
      const sum = vs.reduce((a, id) => a + baron(id).tribute, 0);
      log(`Tribut deiner Vasallen in dieser Woche: ${sum} Gold (${vs.map((id) => BARONS[id].short).join(', ')}).`, 'gold');
      for (const id of vs) baron(id).tribute = 0;
    }
  }
}
function pickWeighted(w) {
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  if (sum <= 0) return null;
  let r = Math.random() * sum;
  for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) return k; }
  return null;
}

// ---- Bauen: Burgstufe oder ein Gebäude auf einem Bauplatz, wie bei dir
const BARON_PRIORITY = {
  kriegsherr: ['kaserne', 'schmiede', 'halle', 'felder', 'stall', 'wehr', 'markt', 'holzfaeller', 'steinbruch', 'kapelle', 'schafzucht', 'hospiz'],
  kaufmann: ['markt', 'schafzucht', 'felder', 'stall', 'halle', 'holzfaeller', 'steinbruch', 'kaserne', 'schmiede', 'kapelle', 'wehr', 'hospiz'],
  wendehals: ['halle', 'markt', 'kaserne', 'felder', 'schmiede', 'stall', 'schafzucht', 'wehr', 'steinbruch', 'kapelle', 'holzfaeller', 'hospiz'],
  baumeister: ['steinbruch', 'holzfaeller', 'markt', 'halle', 'wehr', 'kaserne', 'felder', 'schmiede', 'kapelle', 'stall', 'schafzucht', 'hospiz'],
  frommer: ['kapelle', 'hospiz', 'felder', 'halle', 'markt', 'schafzucht', 'kaserne', 'stall', 'schmiede', 'wehr', 'holzfaeller', 'steinbruch'],
  rebell: ['kaserne', 'felder', 'halle', 'schmiede', 'stall', 'wehr', 'schafzucht', 'markt', 'holzfaeller', 'kapelle', 'steinbruch', 'hospiz'],
};
function baronCandidates(id) {
  const b = baron(id), plots = baronPlots(id), lay = baronLayout(id), out = [];
  // Die Burg selbst
  const nl = b.level + 1;
  if (nl <= 3) {
    const need = BUILDINGS.burg.levels[nl].need || {};
    if (!(need.renown && b.renown < need.renown)) out.push({ kind: 'burg', id: 'burg', level: nl, cost: baronCost('burg', nl), plot: -1 });
  }
  // Gebäude ausbauen (höchstens bis zur Burgstufe) oder neu bauen
  const order = BARON_PRIORITY[BARONS[id].trait];
  for (const bid of order) {
    const have = plots.map((p, i) => (p && p.id === bid ? i : -1)).filter((i) => i >= 0);
    for (const i of have) { const L = plots[i].lv + 1; if (L <= 3 && L <= b.level + 1) out.push({ kind: 'bau', id: bid, level: L, plot: i, cost: baronCost(bid, L) }); }
    if (!have.length || STACKABLE[bid]) { const i = baronFreePlot(id, bid, lay, plots); if (i >= 0 && (have.length < 2)) out.push({ kind: 'bau', id: bid, level: 1, plot: i, cost: baronCost(bid, 1) }); }
  }
  return out.filter((c) => c.cost);
}
function baronStartBuild(id, smart, say) {
  const b = baron(id);
  if (b.con) return;
  const cand = baronCandidates(id);
  if (!cand.length) return;
  const order = BARON_PRIORITY[BARONS[id].trait];
  // Klug: erst die Burg, sobald sie bezahlbar ist, sonst nach Rang in der Vorliebe und Preis
  const rank = (c) => (c.kind === 'burg' ? -5 : order.indexOf(c.id)) + c.level * 1.5;
  // Wie bei dir: Je größer die Burg, desto mehr Gebäude haben Platz und Leute
  const count = baronPlots(id).filter(Boolean).length, cap = 3 + b.level * 3;
  const castle = cand.find((c) => c.kind === 'burg');
  let ok = cand.filter((c) => c.cost <= b.gold - 40 && (c.kind === 'burg' || c.level > 1 || count < cap));
  // Klug: auf den nächsten Burgausbau sparen, statt das Gold für Kleinkram auszugeben
  if (castle && smart && castle.cost > b.gold - 40) ok = ok.filter((c) => b.gold - c.cost >= castle.cost * 0.6);
  if (!ok.length) return;
  const c = smart ? ok.sort((x, y) => rank(x) - rank(y))[0] : pick(ok);
  b.gold -= Math.round(c.cost);
  const days = baronBuildDays(c.id, c.level);
  b.con = { ...c, days, done: G.s.day + days };
  G.staticDirty = true;
}
function baronFinishBuild(id, say) {
  const b = baron(id), c = b.con, def = BARONS[id];
  b.con = null;
  if (c.kind === 'burg') {
    b.level = c.level; b.renown += 6;
    say(id, `${def.name} hat ${baronSite(id).name} zur ${BUILDINGS.burg.levels[c.level].name} ausgebaut.`, 'info', c.level >= 2);
  } else {
    const plots = baronPlots(id);
    if (plots[c.plot] && plots[c.plot].id !== c.id) return;
    plots[c.plot] = { id: c.id, lv: c.level };
    b.renown += 1;
    if (c.level >= 2) say(id, `${def.name} baut in ${baronSite(id).name}: ${BUILDINGS[c.id].name} Stufe ${c.level}.`);
  }
  applyBarons();
}
function baronRecruit(id) {
  const b = baron(id), room = menCap(id) - b.men;
  if (room <= 0) return;
  const n = Math.min(room, randInt(2, 5), Math.floor((b.gold - 60) / 14));
  if (n <= 0) return;
  b.gold -= n * 14; b.men += n;
}
// Aufträge: wie du erledigen die Barone Botengänge, Geleit und Kämpfe für die Parteien ihrer Gegend
function baronQuest(id, say) {
  const b = baron(id), def = BARONS[id], s = baronSite(id);
  const near = G.world.sites.filter((o) => o.faction && o.type !== 'einsiedelei' && o.land === s.land && Math.hypot(o.x - s.x, o.y - s.y) < 160 * MAP_K && FACTIONS[o.faction]);
  if (!near.length) return;
  const fav = BARON_TRAIT[def.trait].faction;
  const town = fav && Math.random() < 0.5 ? (near.find((o) => o.faction === fav) || pick(near)) : pick(near);
  if (Math.random() > 0.55 + difficulty().smart * 0.35) return;   // Nicht jeder Auftrag gelingt
  const gold = Math.round(rand(40, 120) * (0.7 + difficulty().inc * 0.4));
  b.gold += gold; b.renown += randInt(1, 2); b.quests++;
  if (b.quests % 4 === 0) say(id, `${def.name} hat in ${town.name} einen Auftrag für die ${FACTIONS[town.faction].short} erledigt, schon den ${b.quests}.`);
}
// Handel: Waren aus der eigenen Gegend zu einem Markt in der Nähe; in deiner Nähe ziehen echte Handelszüge
function baronTrade(id, say) {
  const b = baron(id), def = BARONS[id], s = baronSite(id);
  const markets = G.world.sites.filter((o) => ['stadt', 'markt'].includes(o.type) && o.land === s.land && Math.hypot(o.x - s.x, o.y - s.y) < 220 * MAP_K);
  if (!markets.length) return;
  const m = pick(markets), d = Math.hypot(m.x - s.x, m.y - s.y) / MAP_K;
  const gain = Math.round((28 + d * 0.25 + baronBLevel(id, 'markt') * 12 + baronBLevel(id, 'stall') * 8) * BARON_TRAIT[def.trait].trade * difficulty().inc);
  b.gold += gain; b.trades++;
  // Sichtbar: ein Handelszug in deiner Nähe, den man überfallen kann (das nimmt dir der Baron übel)
  if (baronNearPlayer(id, 140) && G.groups && !G.groups.some((g) => g.type === `zug_${id}`)) {
    const g = spawnGroup(`zug_${id}`, { pos: { x: s.x + rand(-1, 1), y: s.y + 6.5 } });
    if (g) g.baron = id;
  }
  if (b.trades % 5 === 0) say(id, `${def.name} schickt Wagen mit Waren nach ${m.name}. Seine Kasse füllt sich.`);
}

// ---- Krieg: für seine Seite oder für sich selbst eine Grafschaft einnehmen
function baronEnemySeats(id) {
  const b = baron(id), s = baronSite(id), def = BARONS[id];
  const mySide = b.side;
  return G.world.sites.filter((o) => {
    if (!SHIRES[o.id] || o.type !== 'burg' || o.land !== s.land) return false;
    const owner = shireOwner(o.id);
    if (owner === `b:${id}`) return false;
    if (owner === 'spieler') return false;              // dich greift er nur in einer Fehde an
    if (isBaronOwner(owner)) { const ob = baron(ownerBaron(owner)); return ob && !ob.ally && ob.side !== mySide && Math.random() < 0.4; }
    if (mySide) return BARON_SIDE_FACTION[mySide] !== owner && (owner === 'normannen' || owner === 'sachsen' || owner === 'franken') && baronRivalOfSide(mySide, owner);
    // Ohne Seite: Rebellen gegen die Normannen, sonst gegen wen es sich lohnt
    if (def.trait === 'rebell') return owner === 'normannen';
    return owner !== (s.faction || '') && Math.random() < 0.5;
  }).filter((o) => Math.hypot(o.x - s.x, o.y - s.y) < 230 * MAP_K);
}
function baronRivalOfSide(side, owner) {
  if (side === 'richard') return owner === 'normannen' || owner === 'franken';
  if (side === 'john') return owner === 'sachsen' || owner === 'franken';
  if (side === 'philipp') return owner === 'normannen';
  return false;
}
function baronPlanCampaign(id, say) {
  const b = baron(id), s = baronSite(id);
  const cand = baronEnemySeats(id);
  if (!cand.length) return;
  cand.sort((x, y) => Math.hypot(x.x - s.x, x.y - s.y) - Math.hypot(y.x - s.x, y.y - s.y));
  const t = cand[0];
  const days = Math.max(1, Math.min(4, Math.round(Math.hypot(t.x - s.x, t.y - s.y) / (45 * MAP_K))));
  const men = Math.floor(b.men * 0.8);
  b.march = { kind: 'grafschaft', target: t.id, men, arrive: G.s.day + days };
  b.lastWar = G.s.day;
  say(id, `${BARONS[id].name} zieht mit ${men} Mann gegen ${t.name} (${shireName(t.id)}).`, 'info', baronNearPlayer(id, 160) || Math.hypot(t.x - G.s.player.x, t.y - G.s.player.y) < 120 * MAP_K);
}
function baronPlanFeud(id, say) {
  const b = baron(id), s = baronSite(id), home = G.world.sites.find((o) => o.type === 'spieler');
  const held = G.world.sites.filter((o) => shireOwner(o.id) === 'spieler' && SHIRES[o.id] && o.land === s.land);
  const targets = [...(home.land === s.land || Math.random() < 0.4 ? [home] : []), ...held];
  if (!targets.length) return;
  const t = pick(targets);
  const days = Math.max(1, Math.min(5, Math.round(Math.hypot(t.x - s.x, t.y - s.y) / (45 * MAP_K))));
  const men = Math.floor(b.men * 0.75);
  b.march = { kind: 'fehde', target: t.id, men, arrive: G.s.day + days };
  b.lastRaid = G.s.day;
  log(`Kundschafter melden: ${BARONS[id].name} zieht mit ${men} Mann gegen ${t.type === 'spieler' ? homeName() : t.name}. Ankunft in etwa ${days} ${days === 1 ? 'Tag' : 'Tagen'}.`, 'bad');
}
function baronResolveMarch(id, say) {
  const b = baron(id), m = b.march, def = BARONS[id];
  b.march = null;
  const t = G.world.sites.find((o) => o.id === m.target);
  if (!t) return;
  const A = (m.men * (1 + baronBLevel(id, 'schmiede') * 0.12) + b.level * 4) * rand(0.8, 1.2) * (m.kind === 'fehde' ? difficulty().raid : 1);
  if (m.kind === 'fehde') { baronFeudRaid(id, t, A, m.men); return; }
  const owner = shireOwner(t.id);
  if (owner === `b:${id}` || owner === 'spieler') return;
  // Verteidigung: Burg, Partei, Kriegsglück; eine Burg in Baronshand verteidigt deren Heer
  // Eine Grafschaftsburg verteidigen ihre Besatzung und, im Krieg, die Stärke ihrer Seite
  let Dv = (t.castleLevel >= 3 ? 80 : 60) * rand(0.85, 1.2);
  const th = t.realm === 'nd' || t.realm === 'fr' ? 'normandie' : t.realm === 'en' || t.realm === 'wa' ? 'england' : null;
  if (th && FACTIONS[owner]) { const defSide = Object.entries({ richard: th === 'normandie' ? 'normannen' : 'sachsen', john: 'normannen', philipp: 'franken' }).find(([sd, f]) => f === owner && (th === 'normandie' ? sd !== 'john' : sd !== 'philipp')); if (defSide) Dv += sideStrength(th, defSide[0]) * 0.25; }
  if (isBaronOwner(owner)) Dv = baronDefense(ownerBaron(owner)) * 0.9 * rand(0.8, 1.2);
  const won = Math.random() < Math.max(0.08, Math.min(0.75, 0.32 + ((A - Dv) / (A + Dv)) * 0.8));
  const lost = Math.round(m.men * (won ? rand(0.12, 0.25) : rand(0.3, 0.5)));
  b.men = Math.max(0, b.men - lost);
  const loud = Math.hypot(t.x - G.s.player.x, t.y - G.s.player.y) < 150 * MAP_K || baronNearPlayer(id, 150);
  if (won) {
    b.wins++; b.renown += 8;
    const prev = owner;
    if (isBaronOwner(prev)) { const ob = baron(ownerBaron(prev)); if (ob) { ob.losses++; ob.renown = Math.max(0, ob.renown - 4); } }
    claimShire(t.id, `b:${id}`);
    if (b.side && BARON_SIDE_FACTION[b.side]) { (G.s.siteFaction || (G.s.siteFaction = {}))[t.id] = BARON_SIDE_FACTION[b.side]; t.faction = BARON_SIDE_FACTION[b.side]; }
    G.shireTint = null;
    say(id, `${def.name} hat ${t.name} erobert. Die Grafschaft ${shireName(t.id)} gehört jetzt ihm.`, 'info', true);
  } else {
    b.losses++;
    say(id, `${def.name} ist vor ${t.name} gescheitert und hat ${lost} Mann verloren.`, 'info', loud);
  }
}

// Fehde: Das Heer des Barons steht vor deiner Burg oder einer deiner Grafschaftsburgen. Bist du in der Nähe, wird daraus
// eine echte Belagerung; sonst entscheidet die Verteidigung gegen seine Stärke.
function baronFeudRaid(id, t, A, men) {
  const b = baron(id), def = BARONS[id], p = G.s.player;
  const home = t.type === 'spieler';
  const near = Math.hypot(t.x - p.x, t.y - p.y) < 100 * MAP_K;
  if (near && !G.siege && !G.battle && startSiege(t, `heer_${id}`, Math.min(1.2, 0.5 + men / 60))) {
    if (home) G.s.lastHomeSiege = G.s.day;
    return;
  }
  const allies = BARON_IDS.filter((o) => o !== id && baron(o) && (baron(o).ally || baron(o).vassal) && !baron(o).feud).reduce((a, o) => a + baronStrength(o) * 0.25, 0);
  const D = (home ? castleDefense() : isHeld(t) ? holdingDefense(holdingOf(t)) : 40) + allies;
  if (D * rand(0.85, 1.15) >= A) {
    const lost = Math.round(men * rand(0.25, 0.45));
    b.men = Math.max(0, b.men - lost); b.losses++;
    addRenown(3);
    log(`${def.name} ist vor ${home ? homeName() : t.name} gescheitert (Verteidigung ${Math.round(D)} gegen ${Math.round(A)}). Er verliert ${lost} Mann.`, 'good');
    return;
  }
  b.wins++; b.renown += 5;
  if (home) {
    const lostGold = Math.floor(G.s.gold * 0.15);
    G.s.gold -= lostGold; b.gold += lostGold;
    for (const g of Object.keys(G.s.castle.storage)) G.s.castle.storage[g] = Math.floor(G.s.castle.storage[g] * 0.75);
    burnOuterPlots(0.25, def.name);
    log(`${def.name} hat ${homeName()} überfallen (Verteidigung ${Math.round(D)} gegen ${Math.round(A)})! Er raubt ${lostGold} Gold und Vorräte und legt Feuer vor der Mauer.`, 'bad');
  } else if (isHeld(t)) {
    loseHolding(t, `${def.name} hat deine Burg ${t.name} gestürmt! Die Grafschaft ${shireName(t.id)} gehört jetzt ihm.`, null);
    claimShire(t.id, `b:${id}`);
    G.shireTint = null;
  }
}

// Seite wechseln: der Wendehals geht zur stärkeren Seite, andere bleiben, solange es nicht ganz schlecht steht
function baronReconsiderSide(id, say) {
  const b = baron(id), def = BARONS[id];
  if (b.vassal) { const a = G.s.war && G.s.war.allegiance; if (a && b.side !== a) b.side = a; return; }
  const s = baronSite(id);
  const th = s.realm === 'nd' || s.realm === 'fr' ? 'normandie' : 'england';
  const sides = th === 'normandie' ? ['richard', 'philipp'] : ['richard', 'john'];
  const st = sides.map((sd) => sideStrength(th, sd));
  const best = st[0] >= st[1] ? sides[0] : sides[1];
  const ratio = Math.max(...st) / Math.max(1, Math.min(...st));
  if (def.trait === 'wendehals' ? ratio > 1.15 && b.side !== best : def.trait !== 'frommer' && def.trait !== 'rebell' && ratio > 1.8 && b.side && b.side !== best && Math.random() < 0.3) {
    const old = b.side;
    b.side = best;
    say(id, `${def.name} wechselt die Seite: ${old ? `Er verlässt ${SIDE_NAME[old]} und` : 'Er'} schwört ${SIDE_NAME[best]} die Treue.`, 'info', true);
  }
}

// ---------------------------------------------------------------- Für die Anzeige
// Alle sieben Herren mit Punkten: die Barone und du
export function ranking(player) {
  const rows = BARON_IDS.filter((id) => baron(id)).map((id) => {
    const b = baron(id), s = baronSite(id);
    return { id, name: BARONS[id].name, seat: s ? s.name : '', region: BARONS[id].region, color: BARONS[id].color, arms: BARONS[id].arms, level: b.level,
      men: b.men, shires: baronShires(id).length, renown: b.renown, gold: b.gold, score: baronScore(id), side: b.side, rel: b.rel, ally: b.ally, feud: b.feud, vassal: b.vassal, march: b.march };
  });
  if (player) rows.push(player);
  rows.sort((a, b) => b.score - a.score);
  return rows;
}
export function baronStatus(id) {
  const b = baron(id);
  if (!b) return '';
  if (b.vassal) return 'dein Vasall';
  if (b.feud) return 'in Fehde mit dir';
  if (b.ally) return 'dein Verbündeter';
  return relName(b.rel);
}
export function baronNews(n = 12) { return (G.s.baronLog || []).slice(-n).reverse(); }
export function sideStrengthBonus(th, side) {
  let add = 0;
  for (const id of BARON_IDS) {
    const b = baron(id), s = baronSite(id);
    if (!b || b.gone || b.side !== side || !s) continue;
    const bth = s.realm === 'nd' || s.realm === 'fr' ? 'normandie' : 'england';
    // Barone aus Schottland und Irland schicken ihre Männer nach England
    if (bth !== th) continue;
    add += Math.round(baronStrength(id) * 0.12);
  }
  return Math.min(25, add);
}
