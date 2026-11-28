// Der Bergfried von innen (Vorbild: der normannische Donjon von Rochester, um 1127: Keller, Eingangsgeschoss hinter
// einem Vorbau mit Treppe und Zugbrücke, ein zwei Geschosse hoher Saal mit Galerie, darüber die Gemächer, oben
// Wehrgang und vier Ecktürme; ein Brunnenschacht in der Kreuzmauer reicht bis in jedes Geschoss).
// Räume werden je Burgstufe frei: der Holzturm auf der Motte hat zwei, der steinerne Bergfried sieben, der große
// Donjon der Festung alle dreizehn. Jeder Raum kostet Gold und Baustoffe aus dem Burglager, braucht ein paar Tage
// und bringt einen Vorteil. Gebaut wird immer ein Raum zur Zeit, neben dem Ausbau draußen.
// Zustand: G.s.castle.rooms[id] = true, G.s.castle.roomCon = { id, done }.
// Erst als Text (Burgtafel, Reiter „Bergfried“); später soll ein Klick auf den Bergfried das Innere zeigen.
import { G, log, homeName } from './state.js';
import { GOODS } from './data.js';
import { addRenown, changeRep } from './politics.js';
import { BARON_IDS, baron } from './barons.js';
import { setFamilyKeepBonus, setWeddingHook, setBirthHook, kinWith } from './familie.js';

export const KEEP_FLOORS = [
  { id: 'wehr', name: 'Wehrgang und Ecktürme', text: 'Oben auf dem Turm, mit Zinnen und Ausguck über das Land.' },
  { id: 'ober', name: 'Obergeschoss', text: 'Die Gemächer der Familie, mit Kaminen und Aborterkern in der Mauer.' },
  { id: 'saal', name: 'Saalgeschoss', text: 'Zwei Geschosse hoch, mit Galerie in der Mauer und Bögen in der Kreuzmauer.' },
  { id: 'eingang', name: 'Eingangsgeschoss', text: 'Hinter dem Vorbau; hier kommt man über Treppe und Zugbrücke herein.' },
  { id: 'keller', name: 'Keller', text: 'Unter allem, nur über eine Wendeltreppe im Inneren zu erreichen.' },
];
// lv: ab welcher Burgstufe (1 Holzburg, 2 Steinburg, 3 Festung)
export const ROOMS = {
  vorratskeller: { floor: 'keller', lv: 1, name: 'Vorratskeller', cost: { gold: 120, holz: 20 }, days: 1, eff: 'Fässer und Säcke im Trockenen: Es verdirbt weniger, ein Viertel weniger Rationen am Tag.' },
  brunnen: { floor: 'keller', lv: 2, name: 'Brunnenschacht', cost: { gold: 300, stein: 40 }, days: 2, eff: 'Ein Schacht durch die Kreuzmauer bis in jedes Geschoss: Wasser auch in der Belagerung, Verteidigung +15.' },
  wachstube: { floor: 'eingang', lv: 1, name: 'Wachstube', cost: { gold: 140, holz: 25 }, days: 1, eff: 'Wachen rund um die Uhr: Verteidigung +10.' },
  waffenkammer: { floor: 'eingang', lv: 2, name: 'Waffenkammer', cost: { gold: 380, holz: 20, eisen: 20 }, days: 2, eff: 'Speere, Armbrüste und Bolzen für die Burgwache: Bei einer Belagerung verteidigen drei Mann mehr.' },
  vorbau: { floor: 'eingang', lv: 3, name: 'Vorbau mit Zugbrücke', cost: { gold: 700, stein: 80 }, days: 3, eff: 'Die Treppe zum Eingang liegt in einem eigenen Turm mit Zugbrücke: Verteidigung +20.' },
  saal: { floor: 'saal', lv: 2, name: 'Großer Saal', cost: { gold: 450, holz: 40, stein: 30 }, days: 2, eff: 'Bankette, Gericht und Empfänge: alle vier Tage +1 Ruhm, Geschenke an Barone wirken stärker (+4).' },
  kapelle: { floor: 'saal', lv: 2, name: 'Hauskapelle', cost: { gold: 380, stein: 30, wein: 5 }, days: 2, eff: 'Hochzeit und Taufe im eigenen Haus: +3 Ruhm bei jeder Hochzeit und Geburt, alle drei Tage +1 Ansehen bei der Kirche.' },
  schreibstube: { floor: 'saal', lv: 3, name: 'Schreibstube', cost: { gold: 600, holz: 20, stein: 20 }, days: 2, eff: 'Ein Schreiber führt Buch über Pacht und Abgaben: +10 % auf alle Einnahmen des Tages.' },
  kemenate: { floor: 'ober', lv: 2, name: 'Kemenate', cost: { gold: 400, holz: 30, wolle: 10 }, days: 2, eff: 'Warme Gemächer mit Kamin für den Burgherrn und seine Familie: Kinder kommen öfter zur Welt.' },
  kinderstube: { floor: 'ober', lv: 3, name: 'Kinderstube', cost: { gold: 450, holz: 30, wolle: 10 }, days: 2, eff: 'Lehrer für Lesen, Reiten und Fechten: Deine Kinder sind als Pfand mehr wert (+10 Verhältnis).' },
  gaeste: { floor: 'ober', lv: 3, name: 'Gästegemach', cost: { gold: 500, holz: 20, stein: 30 }, days: 2, eff: 'Würdige Kammern für Gesandte: Verbündete und verschwägerte Barone schätzen dich jeden dritten Tag etwas mehr.' },
  schatz: { floor: 'ober', lv: 3, name: 'Schatzkammer', cost: { gold: 800, stein: 50, eisen: 20 }, days: 3, eff: 'Hinter eisernen Türen: Bei Überfällen und Plünderungen verlierst du nur halb so viel Gold.' },
  wehrgang: { floor: 'wehr', lv: 3, name: 'Wehrgang und Ecktürme', cost: { gold: 900, stein: 90 }, days: 3, eff: 'Vier Ecktürme mit Zinnen und ein Ausguck über das Land: Verteidigung +20.' },
};
export const ROOM_IDS = Object.keys(ROOMS);
// Name des Bergfrieds je Burgstufe
export function keepName(lv = G.s.castle.level) { return ['Turmstumpf', 'Holzturm auf der Motte', 'Bergfried', 'Großer Donjon'][lv] || 'Bergfried'; }

function rooms() { const C = G.s.castle; return C.rooms || (C.rooms = {}); }
export function hasRoom(id) { return !!rooms()[id]; }
export function roomCon() { return G.s.castle.roomCon || null; }
export function roomsOpen(lv = G.s.castle.level) { return ROOM_IDS.filter((id) => ROOMS[id].lv <= lv); }

export function roomBlock(id) {
  const r = ROOMS[id], C = G.s.castle;
  if (!r) return 'Diesen Raum gibt es nicht.';
  if (hasRoom(id)) return 'Schon eingerichtet.';
  if (C.level < r.lv) return `Erst ab der ${['', 'Holzburg', 'Steinburg', 'Festung'][r.lv]}.`;
  if (roomCon()) return `Im Bergfried wird schon gebaut (${ROOMS[roomCon().id].name}).`;
  for (const [k, n] of Object.entries(r.cost)) {
    if (k === 'gold') { if (G.s.gold < n) return `Dir fehlt Gold (${n}).`; }
    else if ((C.storage[k] || 0) < n) return `Im Lager fehlt ${GOODS[k] ? GOODS[k].name : k} (${n}).`;
  }
  return null;
}
export function startRoom(id) {
  if (roomBlock(id)) return false;
  const r = ROOMS[id], C = G.s.castle;
  for (const [k, n] of Object.entries(r.cost)) { if (k === 'gold') G.s.gold -= n; else C.storage[k] -= n; }
  C.roomCon = { id, done: G.s.day + r.days };
  log(`Im ${keepName()} beginnen die Arbeiten an: ${r.name}. Fertig in ${r.days} ${r.days === 1 ? 'Tag' : 'Tagen'}.`, 'good');
  return true;
}

// ---------------------------------------------------------------- Wirkungen
export function keepDefense() { return (hasRoom('brunnen') ? 15 : 0) + (hasRoom('wachstube') ? 10 : 0) + (hasRoom('vorbau') ? 20 : 0) + (hasRoom('wehrgang') ? 20 : 0); }
G.keepDefense = keepDefense;
G.keepFood = () => (hasRoom('vorratskeller') ? 0.75 : 1);
G.keepIncome = () => (hasRoom('schreibstube') ? 0.1 : 0);
G.keepPlunder = () => (hasRoom('schatz') ? 0.5 : 1);
G.keepSiegeMen = () => (hasRoom('waffenkammer') ? 3 : 0);
G.keepGift = () => (hasRoom('saal') ? 4 : 0);
setFamilyKeepBonus(() => ({ births: hasRoom('kemenate') ? 1.5 : 1, ward: hasRoom('kinderstube') ? 10 : 0 }));
setWeddingHook(() => { if (hasRoom('kapelle')) { addRenown(3); log('Die Trauung in deiner Hauskapelle spricht sich herum: Ruhm +3.', 'good'); } });
setBirthHook(() => { if (hasRoom('kapelle')) addRenown(3); });

export function dailyKeep() {
  const C = G.s.castle, con = C.roomCon;
  if (con && G.s.day >= con.done) {
    rooms()[con.id] = true; C.roomCon = null;
    log(`Fertig im ${keepName()} von ${homeName()}: ${ROOMS[con.id].name}. ${ROOMS[con.id].eff}`, 'gold');
  }
  if (hasRoom('saal') && G.s.day % 4 === 0) addRenown(1);
  if (hasRoom('kapelle') && G.s.day % 3 === 0) changeRep('kirche', 1);
  if (hasRoom('gaeste') && G.s.day % 3 === 0) {
    for (const id of BARON_IDS) { const b = baron(id); if (b && !b.gone && !b.feud && (b.ally || kinWith(id)) && b.rel < 80) b.rel++; }
  }
}

// Für Tests
if (typeof window !== 'undefined') window.__ritterBergfried = { startRoom, roomBlock, hasRoom, dailyKeep, keepDefense };
