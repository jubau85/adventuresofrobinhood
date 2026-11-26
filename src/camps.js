// Lager im Wald und Söldner: Bei Jägern, Köhlern, Holzfällern, im Steinbruch und bei Hirten kauft man Ware direkt
// an der Quelle (billiger als in der Stadt, aber nur, was sie gerade haben). Im Waldlager heuern Söldner an, und wer
// vom Galgen gerettet wurde, wartet dort und dient dir ohne Handgeld. In normannischen und sächsischen Orten
// bieten sich Söldner ihrer Herren an.

import { G, log } from './state.js';
import { GOODS, CLASSES, FACTIONS } from './data.js';
import { rand, randInt, pick } from './rng.js';
import { makeUnit, randomName, partyMembers, placeNear, rebuildUnits } from './units.js';
import { cargoFree, addCargo } from './economy.js';
import { partyCap } from './castle.js';
import { landAt } from './world.js';

// Ware je Lager: [Gut, Menge am Tag von–bis, Preisfaktor zum Grundpreis]
const CAMP_GOODS = {
  jaeger: [['fleisch', 8, 14, 0.8], ['felle', 2, 5, 0.85]],
  koehler: [['holz', 6, 10, 0.8]],
  holzfaeller: [['holz', 14, 24, 0.72]],
  steinbruch: [['stein', 12, 20, 0.72]],
  hirten: [['wolle', 6, 10, 0.8], ['fleisch', 2, 4, 0.85]],
  reisende: [['salz', 2, 4, 0.95], ['wein', 1, 2, 0.95]],
  soeldner: [['fleisch', 2, 4, 0.9]],
};
export const CAMP_TEXT = {
  jaeger: 'Jäger haben Wild aufgebrochen. Fleisch und Felle gibt es hier billiger als in der Stadt.',
  koehler: 'Köhler hüten den Meiler. Sie verkaufen Holz, das sie nicht verkohlen.',
  holzfaeller: 'Holzfäller schlagen hier Eichen und Buchen und verkaufen das Holz gleich vom Stapel.',
  steinbruch: 'Im Steinbruch brechen Männer Quader aus dem Hang. Stein gibt es hier am günstigsten.',
  hirten: 'Hirten treiben ihre Herden. Sie verkaufen Wolle und ab und zu ein Stück Fleisch.',
  reisende: 'Reisende rasten am Feuer. Manchmal tauschen sie etwas Salz oder Wein.',
  soeldner: 'Im Waldlager warten Männer, die für Silber kämpfen: Waldläufer, Knechte, Gesindel. Fragen stellt hier keiner.',
};

function campState(c) {
  const all = G.s.campState || (G.s.campState = {});
  let st = all[c.id];
  if (!st || st.day !== G.s.day) {
    const old = st;
    st = { day: G.s.day, stock: {}, recruits: old && G.s.day - old.recruitDay < 3 ? old.recruits : null, recruitDay: old && G.s.day - old.recruitDay < 3 ? old.recruitDay : G.s.day };
    for (const [g, a, b] of CAMP_GOODS[c.camp] || []) st.stock[g] = randInt(a, b);
    all[c.id] = st;
  }
  if (c.camp === 'soeldner' && !st.recruits) { st.recruits = makeOffers(['bauer', 'knecht', 'knecht', 'schuetze', 'schuetze', 'reisiger'], 3, 0.85, null); st.recruitDay = G.s.day; }
  return st;
}
export function campGoods(c) {
  const st = campState(c);
  return (CAMP_GOODS[c.camp] || []).map(([g, , , f]) => ({ good: g, stock: st.stock[g] || 0, price: Math.max(1, Math.round(GOODS[g].base * f)) }));
}
export function buyAtCamp(c, good, n) {
  const st = campState(c), row = campGoods(c).find((r) => r.good === good);
  if (!row) return;
  let k = 0, spent = 0;
  while (k < n && (st.stock[good] || 0) > 0) {
    if (cargoFree() <= 0) { if (!k) log('Kein Platz mehr für Ladung.', 'bad'); break; }
    if (G.s.gold < row.price) { if (!k) log('Nicht genug Gold.', 'bad'); break; }
    G.s.gold -= row.price; spent += row.price; st.stock[good]--; addCargo(good, 1); k++;
  }
  if (k) log(`Gekauft: ${k} ${GOODS[good].name} für ${spent} Gold.`);
}

// Söldner: Klassen zur Wahl, Anzahl, Preisfaktor, Ausrüstung (oder null für die übliche der Klasse)
function makeOffers(classes, n, costF, gear, title = null) {
  const out = [];
  const lvMax = Math.min(6, 2 + Math.floor(G.s.renown / 50));
  for (let k = 0; k < n; k++) {
    const cls = pick(classes), nm = randomName(), level = randInt(1, lvMax);
    const eq = { ...CLASSES[cls].start, ...((gear && gear[cls]) || {}) };
    const u = makeUnit({ kind: 'companion', cls, level, eq, name: nm.name, female: nm.female, status: 'anwaerter' });
    u.cost = Math.round(CLASSES[cls].cost * (1 + (level - 1) * 0.35) * costF);
    u.wage = CLASSES[cls].wage + (level - 1) + 1;
    if (title) u.title = title;
    out.push(u);
  }
  return out;
}

// Wer vom Galgen gerettet wurde, flieht ins nächste Waldlager (oder an ein anderes Feuer im Wald) und wartet dort
export function freedToCamp(name, x, y) {
  const W = G.world, land = landAt(W, x, y);
  const camps = (W.camps || []).filter((c) => c.land === land).sort((a, b) => (a.camp === 'soeldner' ? 0 : 1) - (b.camp === 'soeldner' ? 0 : 1) || Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  const c = camps.find((q) => q.camp === 'soeldner' && Math.hypot(q.x - x, q.y - y) < 90) || camps[0];
  if (!c) return null;
  const u = makeUnit({ kind: 'companion', cls: 'bauer', level: randInt(2, 3), eq: { ...CLASSES.bauer.start }, name, female: false, status: 'anwaerter' });
  u.cost = 0; u.wage = 1; u.title = 'Vom Galgen gerettet';
  (G.s.freedAt || (G.s.freedAt = {}))[c.id] = (G.s.freedAt[c.id] || []).concat([u]);
  return c;
}

export function campRecruits(c) {
  const st = campState(c);
  return ((G.s.freedAt && G.s.freedAt[c.id]) || []).concat(st.recruits || []);
}

// Anwerben aus einer Liste (Lager oder Ort): Handgeld zahlen, ins Gefolge oder in die Garnison
function enlist(list, i) {
  const u = list[i];
  if (!u) return false;
  if (G.s.gold < u.cost) { log('Nicht genug Gold.', 'bad'); return false; }
  G.s.gold -= u.cost;
  list.splice(i, 1);
  const inField = partyMembers().length < partyCap();
  u.status = inField ? 'party' : 'garnison';
  G.s.companions.push(u);
  if (inField) placeNear(u, G.s.player.x, G.s.player.y, 1.5);
  log(`${u.name} (${CLASSES[u.cls].name}) steht jetzt in deinen Diensten${inField ? '' : ' und geht in die Garnison'}.${u.cost ? '' : ' Ohne Handgeld, aus Dankbarkeit.'} Sold: ${u.wage} Gold am Tag.`, 'good');
  rebuildUnits();
  return true;
}
export function hireAtCamp(c, i) {
  const freed = (G.s.freedAt && G.s.freedAt[c.id]) || [];
  if (i < freed.length) { enlist(freed, i); if (!freed.length) delete G.s.freedAt[c.id]; return; }
  enlist(campState(c).recruits || [], i - freed.length);
}

// Söldner der Herren: Normannen stellen Reisige in Kettenhemd und Armbrustschützen, Sachsen Axtkämpfer und Bogner
const FACTION_MERCS = {
  normannen: { classes: ['reisiger', 'reisiger', 'armbruster', 'knecht'], gear: { reisiger: { waffe: 'langschwert', ruestung: 'kettenhemd', schild: 'drachenschild' }, knecht: { ruestung: 'kettenhemd', schild: 'drachenschild' } }, title: 'Normannischer Söldner', cost: 1.25 },
  sachsen: { classes: ['reisiger', 'knecht', 'schuetze', 'schuetze'], gear: { reisiger: { waffe: 'streitaxt', ruestung: 'gambeson', schild: 'rundschild' }, knecht: { waffe: 'streitaxt', schild: 'rundschild' }, schuetze: { waffe: 'kurzbogen', ruestung: 'lederwams' } }, title: 'Sächsischer Söldner', cost: 1.0 },
};
export function townMercs(site) {
  const fm = FACTION_MERCS[site.faction];
  if (!fm || !['stadt', 'burg', 'halle', 'markt'].includes(site.type)) return null;
  const t = G.s.towns[site.id];
  if (!t.mercs || G.s.day - t.mercDay >= 3) { t.mercs = makeOffers(fm.classes, 2, fm.cost, fm.gear, fm.title); t.mercDay = G.s.day; }
  return t.mercs;
}
export function hireInTown(site, i) { const l = townMercs(site); if (l) enlist(l, i); }
export function mercFaction(site) { return FACTIONS[site.faction] ? FACTIONS[site.faction].short : ''; }
