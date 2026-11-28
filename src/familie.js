// Haus und Familie (ein wenig wie bei den großen Herren der Zeit): heiraten, Kinder bekommen und sie für die Diplomatie
// einsetzen. Alles gehört dem eigenen Helden (G.s.family), auch im Mehrspieler.
// - Heirat: mit einer Tochter oder einem Sohn eines Barons (in seiner Burg, Audienz; ab einem freundlichen Verhältnis)
//   oder mit einer Edeldame bzw. einem Edelmann aus sächsischem oder normannischem Haus (Burgtafel, Reiter „Familie“;
//   bei gutem Ansehen der Partei). Du gibst eine Brautgabe, die andere Seite eine Mitgift. Ein Baron, mit dem du
//   verschwägert bist, sagt dir keine Fehde an und schließt schon bei einem Verhältnis von 25 ein Bündnis.
// - Kinder: Verheiratet kommen nach und nach Kinder zur Welt (in der Kemenate des Bergfrieds öfter). Ein Jahr hat
//   24 Tage (vier Jahreszeiten zu je sechs Tagen).
// - Pfand: Ein Kind ab einem halben Jahr kann an den Hof eines Barons gehen, als Unterpfand des Friedens. Er hält
//   Frieden mit dir, das Verhältnis steigt sofort und dann langsam weiter (mit Kinderstube mehr). Holst du es zurück,
//   kühlt das Verhältnis ab. Sagst du ihm die Fehde an, solange dein Kind bei ihm ist, wird es seine Geisel: Erst
//   Frieden oder die Eroberung seiner Burg bringen es heim, und dein Wortbruch kostet Ruhm.
// - Verlobung: Ein Kind kann mit dem Haus eines Barons verlobt werden: Ihr seid verschwägert wie nach einer Heirat.
import { G, log } from './state.js';
import { FACTIONS } from './data.js';
import { pick } from './rng.js';
import { addRenown, changeRep } from './politics.js';
import { BARONS, BARON_IDS, baron, changeBaronRel } from './barons.js';

export const YEAR_DAYS = 24;
export const BRAUTGABE = 150, WARD_AGE = 12, MAX_CHILDREN = 6;
// Heiratsfähige Kinder der Barone: Tochter, Sohn
const BARON_KIN = {
  gwilym: ['Angharad', 'Rhodri'], malcolm: ['Isobel', 'Duncan'], raoul: ['Adélaïde', 'Guérin'],
  hugh: ['Matilda', 'Walter'], geoffrey: ['Edith', 'Robert'], fergal: ['Gormlaith', 'Donal'],
};
// Edle Häuser der Parteien: Name der Familie, Töchter, Söhne
const HOUSES = {
  sachsen: { house: 'aus dem Haus Cedrics von Rotherwood', f: ['Rowena', 'Elgiva', 'Wilfreda'], m: ['Athelstan', 'Wulfstan', 'Edwin'] },
  normannen: { house: 'aus dem Haus de Lacy', f: ['Alix', 'Mathilde', 'Isabeau'], m: ['Raoul', 'Gilbert', 'Henri'] },
};
const KIND_NAMEN_F = ['Alys', 'Maud', 'Edith', 'Joan', 'Eleanor', 'Margery', 'Isolde', 'Agnes', 'Cecily', 'Avice'];
const KIND_NAMEN_M = ['William', 'Hugh', 'Robert', 'Richard', 'Geoffrey', 'Walter', 'Henry', 'Roger', 'Ralph', 'Simon'];

export function family() {
  const f = G.s.family || (G.s.family = { spouse: null, children: [], lastBirth: 0, nextId: 1 });
  if (!f.children) f.children = [];
  return f;
}
export function married() { return !!family().spouse; }
export function childAge(c) { return Math.max(0, G.s.day - c.born); }
export function ageText(c) {
  const d = childAge(c), y = Math.floor(d / YEAR_DAYS);
  if (y >= 1) return `${y} ${y === 1 ? 'Jahr' : 'Jahre'}`;
  const m = Math.max(1, Math.floor(d / (YEAR_DAYS / 12)));
  return `${m} ${m === 1 ? 'Monat' : 'Monate'}`;
}
// Verschwägert mit diesem Baron: Ehe, Verlobung eines Kindes oder ein Kind als Pfand an seinem Hof
export function kinWith(id) {
  const f = family();
  return (f.spouse && f.spouse.from === id) || f.children.some((c) => c.at === id && (c.state === 'verlobt' || c.state === 'pfand'));
}
export function wardAt(id) { return family().children.find((c) => c.at === id && c.state === 'pfand') || null; }
G.familyKin = (id) => kinWith(id);
// Für die Kemenate und Kinderstube (bergfried.js)
let keepBonus = () => ({ births: 1, ward: 0 });
export function setFamilyKeepBonus(fn) { keepBonus = fn; }

// ---------------------------------------------------------------- Heirat
function partnerOf(id) {
  const k = BARON_KIN[id];
  return k ? (G.s.player.female ? k[1] : k[0]) : null;
}
export function baronMatch(id) {
  const p = partnerOf(id);
  return p ? { name: p, female: !G.s.player.female, from: id, house: `${G.s.player.female ? 'Sohn' : 'Tochter'} von ${BARONS[id].name}` } : null;
}
export function baronMarryBlock(id) {
  const b = baron(id);
  if (married()) return 'Du bist schon verheiratet.';
  if (!b || b.gone || b.human) return 'An diesem Hof gibt es niemanden, um den du werben kannst.';
  if (b.feud) return 'Mitten in einer Fehde gibt er dir sein Kind nicht.';
  if (b.rel < 25) return `Er schätzt dich noch nicht genug (Verhältnis ${b.rel}, nötig 25).`;
  if (G.s.gold < BRAUTGABE) return `Für die Brautgabe fehlt dir Gold (${BRAUTGABE}).`;
  return null;
}
export function dowryOf(id) { const b = baron(id); return 80 + (b ? b.level : 1) * 60; }
export function marryBaron(id) {
  if (baronMarryBlock(id)) return false;
  const b = baron(id), m = baronMatch(id), dowry = Math.min(dowryOf(id), Math.max(0, b.gold));
  G.s.gold -= BRAUTGABE; b.gold = b.gold + BRAUTGABE - dowry; G.s.gold += dowry;
  family().spouse = { ...m, day: G.s.day };
  changeBaronRel(id, 25, 'Hochzeit, ihr seid verschwägert');
  addRenown(6);
  weddingBonus();
  log(`Hochzeit auf seiner Burg: Du heiratest ${m.name}, ${m.house}. Brautgabe ${BRAUTGABE} Gold, Mitgift ${dowry} Gold. ${BARONS[id].short} ist nun dein Schwiegervater und sagt dir keine Fehde mehr an. Ruhm +6.`, 'gold');
  return true;
}
export function houseMatch(fid) {
  const h = HOUSES[fid];
  if (!h) return null;
  const f = family(), pool = G.s.player.female ? h.m : h.f;
  const name = pool[(f.matchSeed || (f.matchSeed = 1 + Math.floor(Math.random() * 97))) % pool.length];
  return { name, female: !G.s.player.female, from: null, faction: fid, house: h.house };
}
export function houseMarryBlock(fid) {
  if (married()) return 'Du bist schon verheiratet.';
  const rep = (G.s.rep || {})[fid] ?? 0;
  if (rep < 20) return `Das Haus schaut auf dein Ansehen bei den ${FACTIONS[fid].name} (${rep}, nötig 20).`;
  if (G.s.gold < BRAUTGABE) return `Für die Brautgabe fehlt dir Gold (${BRAUTGABE}).`;
  return null;
}
export function marryHouse(fid) {
  if (houseMarryBlock(fid)) return false;
  const m = houseMatch(fid), dowry = 120;
  G.s.gold += dowry - BRAUTGABE;
  family().spouse = { ...m, day: G.s.day };
  changeRep(fid, 15);
  addRenown(4);
  weddingBonus();
  log(`Hochzeit in der Burgkapelle: Du heiratest ${m.name} ${m.house}. Brautgabe ${BRAUTGABE} Gold, Mitgift ${dowry} Gold. Die ${FACTIONS[fid].name} sehen dich nun als einen der Ihren (Ansehen +15). Ruhm +4.`, 'gold');
  return true;
}
let onWedding = () => {};
export function setWeddingHook(fn) { onWedding = fn; }
function weddingBonus() { onWedding(); }

// ---------------------------------------------------------------- Kinder
export function dailyFamily() {
  const f = family();
  if (f.spouse && f.children.length < MAX_CHILDREN && G.s.day - (f.lastBirth || f.spouse.day) >= 10 && Math.random() < 0.09 * keepBonus().births) birth();
  // Pfand: Das Verhältnis zum Baron steigt langsam weiter
  for (const c of f.children) {
    if (c.state !== 'pfand' || !c.at) continue;
    const b = baron(c.at);
    if (!b || b.gone) { c.state = 'daheim'; c.at = null; log(`${c.name} kommt heim: Der Hof, an dem ${c.female ? 'sie' : 'er'} als Pfand lebte, ist nicht mehr.`); continue; }
    if (G.s.day % 2 === 0 && b.rel < 75) b.rel = Math.min(75, b.rel + 1);
  }
}
export function birth(female = Math.random() < 0.5) {
  const f = family(), taken = new Set(f.children.map((c) => c.name));
  const pool = (female ? KIND_NAMEN_F : KIND_NAMEN_M).filter((n) => !taken.has(n));
  const c = { id: f.nextId++, name: pick(pool.length ? pool : (female ? KIND_NAMEN_F : KIND_NAMEN_M)), female, born: G.s.day, state: 'daheim', at: null };
  f.children.push(c); f.lastBirth = G.s.day;
  addRenown(1);
  onBirth(c);
  log(`${f.spouse ? f.spouse.name : 'Deine Frau'} hat ${c.female ? 'eine Tochter' : 'einen Sohn'} geboren: ${c.name}. Die Glocken läuten in ${G.s.castleName || 'deiner Burg'}.`, 'gold');
  return c;
}
let onBirth = () => {};
export function setBirthHook(fn) { onBirth = fn; }

// ---------------------------------------------------------------- Pfand und Verlobung
export function wardBlock(c, id) {
  const b = baron(id);
  if (!c || c.state !== 'daheim') return 'Dieses Kind ist nicht daheim.';
  if (childAge(c) < WARD_AGE) return `Noch zu klein (ab einem halben Jahr, das sind ${WARD_AGE} Tage).`;
  if (!b || b.gone || b.human) return 'An diesen Hof kann kein Kind gehen.';
  if (b.feud) return 'Mitten in einer Fehde nimmt er kein Pfand an.';
  if (wardAt(id)) return 'An seinem Hof lebt schon eines deiner Kinder.';
  return null;
}
export function sendWard(childId, id) {
  const c = family().children.find((x) => x.id === childId);
  if (wardBlock(c, id)) return false;
  c.state = 'pfand'; c.at = id; c.since = G.s.day;
  changeBaronRel(id, 20 + keepBonus().ward, `${c.name} lebt als Pfand des Friedens an seinem Hof`);
  addRenown(2);
  log(`${c.name} reist an den Hof von ${BARONS[id].name}. Solange ${c.female ? 'sie' : 'er'} dort lebt, hält der Baron Frieden mit dir.`, 'good');
  return true;
}
export function recallWard(childId) {
  const c = family().children.find((x) => x.id === childId);
  if (!c || c.state !== 'pfand') return false;
  const id = c.at;
  c.state = 'daheim'; c.at = null;
  changeBaronRel(id, -10, `Du holst ${c.name} von seinem Hof zurück`);
  log(`${c.name} kommt zurück nach Hause.`);
  return true;
}
export function betrothBlock(c, id) {
  const b = baron(id);
  if (!c || c.state !== 'daheim') return 'Dieses Kind ist nicht daheim.';
  if (!b || b.gone || b.human) return 'Mit diesem Haus ist keine Verlobung möglich.';
  if (b.feud) return 'Mitten in einer Fehde gibt es keine Verlobung.';
  if (b.rel < 15) return `Er schätzt dich noch nicht genug (Verhältnis ${b.rel}, nötig 15).`;
  if (family().children.some((x) => x.state === 'verlobt' && x.at === id)) return 'Ein Kind ist schon mit seinem Haus verlobt.';
  if (c.female && G.s.gold < 100) return 'Für die Mitgift deiner Tochter fehlt dir Gold (100).';
  return null;
}
export function betroth(childId, id) {
  const c = family().children.find((x) => x.id === childId);
  if (betrothBlock(c, id)) return false;
  const b = baron(id);
  if (c.female) { G.s.gold -= 100; b.gold += 100; } else { const d = Math.min(100, b.gold); b.gold -= d; G.s.gold += d; }
  c.state = 'verlobt'; c.at = id; c.since = G.s.day;
  changeBaronRel(id, 25, `${c.name} ist mit seinem Haus verlobt, ihr seid verschwägert`);
  addRenown(3);
  log(`${c.name} wird mit einem Kind aus dem Haus von ${BARONS[id].name} verlobt. ${c.female ? 'Mitgift 100 Gold.' : 'Er zahlt dir eine Mitgift.'} Ihr seid nun verschwägert.`, 'gold');
  return true;
}
// Fehde gegen einen Baron, an dessen Hof dein Kind als Pfand lebt: Es wird seine Geisel (barons.js, declareFeud)
G.familyFeud = (id) => {
  const c = wardAt(id);
  if (!c) return;
  c.state = 'geisel';
  G.s.renown = Math.max(0, (G.s.renown || 0) - 5);
  log(`Wortbruch! ${c.name} lebte als Pfand an seinem Hof und ist nun ${BARONS[id].short}s Geisel. Erst Frieden oder seine Burg bringen ${c.female ? 'sie' : 'ihn'} heim. Ruhm −5.`, 'bad');
};
// Frieden oder Eroberung: Geiseln kommen heim
G.familyFree = (id, why) => {
  for (const c of family().children) if (c.at === id && c.state === 'geisel') { c.state = 'daheim'; c.at = null; log(`${c.name} ist frei und kommt heim (${why}).`, 'good'); }
};
export function baronKinName(id) { return BARON_IDS.includes(id) ? partnerOf(id) : null; }

// Für Tests
if (typeof window !== 'undefined') window.__ritterFamilie = { family, birth, sendWard, recallWard, betroth, marryBaron, marryHouse, kinWith };
