// Erzgruben und Einsiedeleien.
// An einer Grube kauft man Erz billig direkt am Stollen oder pachtet einen Anteil: Der liefert jeden
// Morgen Erz in das Lager deiner Burg. Einsiedler an mystischen Orten geben Rat, Segen und Heilung.

import { G, log, homeName } from './state.js';
import { GOODS } from './data.js';
import { pick } from './rng.js';
import { changeRep, addRenown, isHostileFaction } from './politics.js';
import { partyMembers } from './units.js';

// ---------------------------------------------------------------- Gruben
export const MINE_YIELD = { eisen: 3, blei: 3, zinn: 2, silber: 1 };
const LEASE = { eisen: 420, blei: 360, zinn: 400, silber: 650 };

export function leaseCost(s) { return LEASE[s.ore] || 420; }
export function ownsShare(s) { return !!(G.s.mines && G.s.mines[s.id]); }

export function leaseMine(s) {
  const cost = leaseCost(s);
  if (ownsShare(s) || G.s.gold < cost) return false;
  G.s.gold -= cost;
  if (!G.s.mines) G.s.mines = {};
  G.s.mines[s.id] = G.s.day;
  log(`Du pachtest einen Anteil an den ${s.name}. Jeden Morgen bringen Fuhrleute ${MINE_YIELD[s.ore]} ${GOODS[s.ore].name} nach ${homeName()}.`, 'gold');
  if (s.faction) changeRep(s.faction, 3);
  return true;
}

// Jeden Morgen: Lieferung aus allen Gruben, an denen du beteiligt bist
export function dailyMines() {
  const out = {};
  for (const id of Object.keys(G.s.mines || {})) {
    const s = G.world.sites.find((x) => x.id === id);
    if (!s) { delete G.s.mines[id]; continue; }
    if (s.faction && isHostileFaction(s.faction)) continue;
    const n = MINE_YIELD[s.ore] || 2;
    G.s.castle.storage[s.ore] = (G.s.castle.storage[s.ore] || 0) + n;
    out[s.ore] = (out[s.ore] || 0) + n;
  }
  const parts = Object.entries(out).map(([g, n]) => `${n} ${GOODS[g].name}`);
  if (parts.length) log(`Aus deinen Gruben kommt Erz nach ${homeName()}: ${parts.join(', ')}.`, 'good');
}

// ---------------------------------------------------------------- Einsiedler
const PROPHECY = [
  'Ich sehe einen Löwen, der aus dem Käfig kommt, und Füchse, die sich verkriechen.',
  'Wer im Wald Gerechtigkeit sucht, findet Freunde. Wer sie in der Burg sucht, findet Mauern.',
  'Dein Haus wird stehen, wenn du die Alten ehrst und die Armen nicht vergisst.',
  'Zwei Kronen streiten um ein Land jenseits des Wassers. Halte dich an den, der zuletzt lacht.',
  'Die Steine haben vieles kommen und gehen sehen. Auch dich werden sie gehen sehen.',
  'Ein Ritter ohne Gefolge ist ein Baum ohne Wurzeln.',
];

export function hermitState(s) {
  if (!G.s.hermits) G.s.hermits = {};
  return G.s.hermits[s.id] || (G.s.hermits[s.id] = { visited: false, adviceDay: -1, blessDay: -9, giftDay: -1 });
}

// Beim ersten Besuch: ein wenig Ruhm, weil man von solchen Orten erzählt
export function visitHermit(s) {
  const st = hermitState(s);
  if (st.visited) return;
  st.visited = true;
  log(`Du findest einen mystischen Ort: ${s.name}.`, 'gold');
  addRenown(3);
}

export function hermitAdvice(s) {
  const st = hermitState(s);
  if (st.adviceDay === G.s.day) return false;
  st.adviceDay = G.s.day;
  const hint = G.rumor ? G.rumor(s) : '';
  log(`Der Einsiedler spricht leise: „${pick(PROPHECY)}“ Und dann: „${hint}“`, 'gold');
  return true;
}

export function canBless(s) { return G.s.day - hermitState(s).blessDay >= 3; }
export function hermitBless(s) {
  if (!canBless(s)) return false;
  hermitState(s).blessDay = G.s.day;
  const p = G.s.player;
  p.hp = p.st.maxHp;
  for (const c of partyMembers()) c.hp = c.st.maxHp;
  G.s.buff = { day: G.s.day + 1 };
  log('Der Einsiedler legt dir die Hand auf und gibt dir bittere Kräuter. Ihr seid geheilt und gesegnet: bis morgen Abend +10 % Angriff und Abwehr, +15 % Erfahrung.', 'good');
  changeRep('kirche', 1);
  return true;
}

export function hermitGift(s) {
  const st = hermitState(s);
  if (st.giftDay === G.s.day || G.s.gold < 20) return false;
  st.giftDay = G.s.day;
  G.s.gold -= 20;
  log('Du lässt Brot, Salz und ein paar Münzen bei der Klause. „Gib es den Armen, die hierher kommen“, sagt der Einsiedler.', 'good');
  changeRep('kirche', 2);
  addRenown(1);
  return true;
}
