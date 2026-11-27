// Kriegskarte (Phase 5). Zwei Kriege laufen, ob du hinsiehst oder nicht:
//   England: Richards Getreue (die Sachsen) gegen Prinz Johns Barone (die Normannen).
//   Normandie: das normannische Aufgebot, das Richard die Treue hält, gegen König Philipp von Frankreich.
// Jede Partei schickt Heere gegen die Grafschaften der Gegenseite. Fällt die Burg, wechselt die Grafschaft den Herrn.
// In deiner Nähe wird daraus eine echte Belagerung, sonst entscheiden Stärke, Kriegsglück und Mauern. Feldschlachten
// und deine Hilfe verschieben das Kriegsglück. Schwörst du einer Seite den Treueid, zählen deine Grafschaften für
// sie, und ihre Feinde ziehen auch gegen dich. Ziel: ein geeintes England unter Richard oder die zurückgewonnene
// Normandie (oder, wenn du Johann dienst, ein England unter Johann).

import { G, log } from './state.js';
import { FACTIONS, GROUP_TYPES, MAP_K, DAY_LEN } from './data.js';
import { rand, pick } from './rng.js';
import { SHIRES, claimShire, shireOwner, shireName } from './shires.js';
import { changeRep, addRenown } from './politics.js';
import { siteById } from './economy.js';
import { startSiege } from './siege.js';
import { isHeld, holdingOf, holdingDefense, loseHolding, applyHoldings } from './holdings.js';
import { sideStrengthBonus, isBaronOwner, ownerBaron, baron } from './barons.js';

export const THEATERS = {
  england: {
    name: 'England', realms: ['en', 'wa'], goal: null,
    sides: { richard: 'sachsen', john: 'normannen' },
    names: { richard: 'Richards Getreue', john: 'Prinz Johns Barone' },
    armies: { richard: 'heer_richard', john: 'heer_john' },
    base: { richard: 85, john: 55 }, lead: { richard: 0.6, john: 0.4 },
  },
  normandie: {
    // Ziel sind die vier Burgen der Normandie bis an die Grenze im Vexin; Compiègne bleibt Philipps Krondomäne
    name: 'Normandie', realms: ['nd', 'fr'], goal: ['caen', 'falaise', 'evreux', 'gisors'],
    sides: { richard: 'normannen', philipp: 'franken' },
    names: { richard: 'das normannische Aufgebot', philipp: 'König Philipp' },
    armies: { richard: 'heer_normandie', philipp: 'heer_philipp' },
    base: { richard: 60, philipp: 75 }, lead: { richard: 0.5, philipp: 0.5 },
  },
};
export const THEATER_IDS = Object.keys(THEATERS);
// Wem du die Treue schwören kannst
export const ALLEGIANCE = {
  richard: { name: 'König Richard', text: 'Löwenherz ist frei und will sein Reich zurück: England von Johanns Baronen, die Normandie von Philipp.', rep: { sachsen: 15, waldleute: 5, normannen: -15 } },
  john: { name: 'Prinz Johann', text: 'Johann ohne Land hält die Burgen und das Geld. Wer ihm dient, wird reich belehnt, und um die Normandie kümmert er sich nicht.', rep: { normannen: 15, sachsen: -20, waldleute: -10 } },
};
const CAMPAIGN_CHANCE = 0.25;   // je Kriegsschauplatz und Tag, solange dort kein Feldzug läuft
const SUPPORT = { cost: 250, add: 20, days: 7 };

export function war() {
  const w = G.s.war || (G.s.war = {});
  w.morale = w.morale || {};
  w.campaigns = w.campaigns || [];
  w.log = w.log || [];
  w.ended = w.ended || {};
  return w;
}
export function allegiance() { return war().allegiance || null; }
function warLog(text, kind = 'info', loud = true) {
  const w = war();
  w.log.push({ day: G.s.day, text });
  if (w.log.length > 40) w.log.splice(0, w.log.length - 40);
  if (loud) log(text, kind);
}

// ---------------------------------------------------------------- Seiten und Grafschaften
export function theaterOf(site) { return THEATER_IDS.find((t) => THEATERS[t].realms.includes(site.realm)) || null; }
export function theaterSeats(th) { return G.world.sites.filter((s) => SHIRES[s.id] && THEATERS[th].realms.includes(s.realm)); }
// Wem eine Grafschaft im Krieg zählt: der Partei ihres Herrn; deine nur der Seite, der du die Treue geschworen hast
export function sideOfOwner(th, owner) {
  if (owner === 'spieler') { const a = allegiance(); return a && THEATERS[th].sides[a] ? a : null; }
  // Grafschaften eines Barons zählen für die Seite, der er die Treue geschworen hat
  if (isBaronOwner(owner)) { const b = baron(ownerBaron(owner)); return b && b.side && THEATERS[th].sides[b.side] ? b.side : null; }
  return Object.keys(THEATERS[th].sides).find((k) => THEATERS[th].sides[k] === owner) || null;
}
export function sideOfSeat(th, s) { return sideOfOwner(th, shireOwner(s.id)); }
export function sideName(th, side) { return THEATERS[th].names[side]; }
export function sideTitle(th, side) { const n = sideName(th, side); return n[0].toUpperCase() + n.slice(1); }
function goalSeats(th) { const T = THEATERS[th]; return theaterSeats(th).filter((s) => (T.goal ? T.goal.includes(s.id) : true)); }
export function sideColor(th, side) { return FACTIONS[THEATERS[th].sides[side]].color; }
function enemyOf(th, side) { return Object.keys(THEATERS[th].sides).find((k) => k !== side); }

// Stärke einer Seite: Grundstärke, je Grafschaft mehr, Kriegsglück, deine Heerfolge
export function sideStrength(th, side) {
  const T = THEATERS[th], w = war();
  const seats = theaterSeats(th).filter((s) => sideOfSeat(th, s) === side).length;
  let st = T.base[side] + seats * 3 + (w.morale[side] || 0);
  if (w.support && w.support.side === side && w.support.until >= G.s.day) st += w.support.add;
  if (allegiance() === side) st += Math.min(30, Math.round(G.s.renown / 8));
  st += sideStrengthBonus(th, side);
  return Math.max(10, Math.round(st));
}

// ---------------------------------------------------------------- Feldzüge
// Ziel: eine Grafschaft der Gegenseite, möglichst nah an den eigenen; deine Burgen nur, wenn du der Gegenseite dienst
function pickTarget(th, side) {
  const seats = theaterSeats(th), foe = enemyOf(th, side);
  const own = seats.filter((s) => sideOfSeat(th, s) === side);
  const cand = seats.filter((s) => sideOfSeat(th, s) === foe && !(G.siege && G.siege.site === s) && !war().campaigns.some((c) => c.target === s.id));
  if (!cand.length) return null;
  // Ohne eigene Burg: von den Orten der eigenen Partei aus (Hallen, Städte)
  const fac = THEATERS[th].sides[side];
  const bases = own.length ? own : G.world.sites.filter((s) => s.faction === fac && THEATERS[th].realms.includes(s.realm));
  const dist = (s) => Math.min(...bases.map((b) => Math.hypot(b.x - s.x, b.y - s.y)), 9e9);
  cand.sort((a, b) => dist(a) - dist(b));
  const t = pick(cand.slice(0, 3));
  const from = bases.length ? bases.reduce((a, b) => (Math.hypot(b.x - t.x, b.y - t.y) < Math.hypot(a.x - t.x, a.y - t.y) ? b : a)) : null;
  return { target: t, from };
}

function launchCampaign(th) {
  const T = THEATERS[th], sides = Object.keys(T.sides);
  // Wer angreift: nach Stärke und Angriffslust
  const wts = sides.map((sd) => sideStrength(th, sd) * T.lead[sd]);
  let r = Math.random() * wts.reduce((a, b) => a + b, 0), side = sides[0];
  for (let k = 0; k < sides.length; k++) { r -= wts[k]; if (r <= 0) { side = sides[k]; break; } }
  const tg = pickTarget(th, side);
  if (!tg) return;
  const days = Math.max(1, Math.min(4, Math.round((tg.from ? Math.hypot(tg.from.x - tg.target.x, tg.from.y - tg.target.y) : 200) / (90 * MAP_K / 2))));
  const c = { th, side, army: T.armies[side], target: tg.target.id, from: tg.from ? tg.from.id : null, day0: G.s.day, arrive: G.s.day + days };
  war().campaigns.push(c);
  const own = shireOwner(tg.target.id) === 'spieler';
  warLog(`Kriegsnachricht: ${GROUP_TYPES[c.army].nom} zieht ${tg.from ? `von ${tg.from.name} ` : ''}gegen ${tg.target.name} (${shireName(tg.target.id)}). Ankunft in etwa ${days} ${days === 1 ? 'Tag' : 'Tagen'}.`, own ? 'bad' : 'info');
}

// Das Heer ist vor der Burg: in deiner Nähe eine echte Belagerung, sonst nach Stärke ausgewürfelt
function resolveCampaign(c) {
  const s = siteById(c.target), th = c.th, T = THEATERS[th];
  if (!s || sideOfSeat(th, s) === c.side) return;
  const p = G.s.player;
  if (!G.siege && !G.battle && Math.hypot(s.x - p.x, s.y - p.y) < 100 * MAP_K && startSiege(s, c.army, Math.min(0.8, 0.45 + G.s.day * 0.01))) {
    warLog(`${GROUP_TYPES[c.army].nom} schlägt vor ${s.name} das Lager auf. Die Belagerung beginnt, ganz in deiner Nähe.`, 'bad', false);
    return;
  }
  const A = sideStrength(th, c.side) * rand(0.8, 1.2);
  const foe = enemyOf(th, c.side);
  let won;
  if (isHeld(s)) won = A * 0.9 > holdingDefense(holdingOf(s)) * rand(0.8, 1.2);
  else {
    const D = sideStrength(th, foe) * (s.castleLevel >= 3 ? 1.35 : 1.15) * rand(0.8, 1.2);
    won = Math.random() < Math.max(0.15, Math.min(0.85, 0.4 + ((A - D) / (A + D)) * 0.9));
  }
  const w = war();
  if (won) {
    w.morale[c.side] = (w.morale[c.side] || 0) + 8;
    w.morale[foe] = (w.morale[foe] || 0) - 5;
    takeSeat(s, T.sides[c.side], `${GROUP_TYPES[c.army].nom} hat ${s.name} gestürmt`);
  } else {
    w.morale[c.side] = (w.morale[c.side] || 0) - 6;
    w.morale[foe] = (w.morale[foe] || 0) + 4;
    warLog(`Kriegsnachricht: Vor ${s.name} ist ${GROUP_TYPES[c.army].acc} gescheitert und zieht ab.`, isHeld(s) ? 'good' : 'info');
  }
}

// Eine Burg wechselt im Krieg den Herrn. Deine eigene verlierst du an den Sieger.
export function takeSeat(s, faction, how) {
  if (isHeld(s)) { loseHolding(s, `Kriegsnachricht: ${how}! Deine Burg ${s.name} ist verloren, die Grafschaft ${shireName(s.id)} fällt an die ${FACTIONS[faction].short}.`, faction); checkEnds(); return; }
  if (s.faction === faction) return;
  (G.s.siteFaction || (G.s.siteFaction = {}))[s.id] = faction;
  s.faction = faction;
  claimShire(s.id, faction);
  applyHoldings();
  const th = theaterOf(s), side = th && sideOfOwner(th, faction);
  warLog(`Kriegsnachricht: ${how}. ${s.name} und die Grafschaft ${shireName(s.id)} fallen an ${side ? sideName(th, side) : `die ${FACTIONS[faction].short}`}.`, allegiance() && side === allegiance() ? 'good' : 'info');
  checkEnds();
}

// Eine echte Belagerung in deiner Nähe ist zu Ende (siege.js): Fällt eine Grafschaftsburg, wechselt sie den Herrn
export function seatSiegeOver(s, army, how) {
  if (!SHIRES[s.id] || s.type !== 'burg' || !army || !army.faction) return;
  const th = theaterOf(s), side = th && sideOfOwner(th, army.faction), w = war();
  if (side) {
    const foe = enemyOf(th, side);
    w.morale[side] = (w.morale[side] || 0) + (how === 'gefallen' ? 8 : -6);
    w.morale[foe] = (w.morale[foe] || 0) + (how === 'gefallen' ? -5 : 4);
  }
  if (how === 'gefallen' && !isHeld(s) && army.faction !== s.faction) takeSeat(s, army.faction, `${GROUP_TYPES[army.type].nom} hat ${s.name} gestürmt`);
}

// Feldschlachten verschieben das Kriegsglück (units.js)
export function armyVictory(g) {
  if (!g || !g.faction) return;
  const p = G.s.player, here = G.world.sites.reduce((a, s) => (!a || Math.hypot(s.x - g.x, s.y - g.y) < Math.hypot(a.x - g.x, a.y - g.y) ? s : a), null);
  const th = here && theaterOf(here), side = th && sideOfOwner(th, g.faction);
  if (!side) return;
  const w = war(), foe = enemyOf(th, side);
  w.morale[side] = (w.morale[side] || 0) + 12;
  w.morale[foe] = (w.morale[foe] || 0) - 8;
  warLog(`Kriegsnachricht: ${GROUP_TYPES[g.type].nom} hat bei ${here.name} eine Feldschlacht gewonnen. Das Kriegsglück spricht für ${sideName(th, side)}.`, 'info', Math.hypot(g.x - p.x, g.y - p.y) > 70);
}

// ---------------------------------------------------------------- Deine Rolle
export function swearTo(side) {
  const w = war(), old = w.allegiance;
  if (!ALLEGIANCE[side] || old === side) return false;
  if (old) {
    addRenown(-20);
    for (const [f, v] of Object.entries(ALLEGIANCE[old].rep)) if (v > 0) changeRep(f, -30);
    log(`Du brichst deinen Eid gegenüber ${ALLEGIANCE[old].name}. Eidbrecher sieht man nicht gern.`, 'bad');
  }
  w.allegiance = side;
  for (const [f, v] of Object.entries(ALLEGIANCE[side].rep)) changeRep(f, v);
  warLog(`Du schwörst ${ALLEGIANCE[side].name} den Treueid. Deine Grafschaften zählen für seine Seite, und seine Feinde sind jetzt die deinen.`, 'gold');
  G.shireTint = null;
  checkEnds();
  return true;
}
export function supportCost() { return SUPPORT.cost; }
export function supportActive() { const s = war().support; return s && s.until >= G.s.day ? s : null; }
// Heerfolge: Söldner für deine Seite, eine Woche lang stärker
export function sendSupport() {
  const side = allegiance();
  if (!side) { log('Erst musst du einer Seite die Treue schwören.', 'bad'); return false; }
  if (supportActive()) { log('Deine Männer stehen schon im Feld.', 'bad'); return false; }
  if (G.s.gold < SUPPORT.cost) { log('Nicht genug Gold.', 'bad'); return false; }
  G.s.gold -= SUPPORT.cost;
  war().support = { side, until: G.s.day + SUPPORT.days, add: SUPPORT.add };
  addRenown(3);
  for (const [f, v] of Object.entries(ALLEGIANCE[side].rep)) if (v > 0) changeRep(f, 3);
  warLog(`Du schickst ${ALLEGIANCE[side].name} Söldner und Gold: Eine Woche lang kämpft seine Seite stärker (+${SUPPORT.add}).`, 'good');
  return true;
}

// ---------------------------------------------------------------- Kriegsziele
// Wer den Kriegsschauplatz geeint hat (alle Grafschaften des Ziels), sonst null
export function theaterWinner(th) {
  const seats = goalSeats(th);
  if (!seats.length) return null;
  const sides = new Set(seats.map((s) => sideOfSeat(th, s)));
  return sides.size === 1 && [...sides][0] ? [...sides][0] : null;
}
export function goalProgress(th, side) {
  const seats = goalSeats(th);
  return { have: seats.filter((s) => sideOfSeat(th, s) === side).length, of: seats.length };
}
const END_TEXT = {
  england: {
    richard: 'England ist geeint! Keine Burg hält mehr zu Prinz Johann. König Richard reitet in Westminster ein, und der Chronist schreibt deinen Namen unter die seiner Getreuen.',
    john: 'Prinz Johann hält alle Burgen Englands. Richards Getreue sind zerstreut, und Johann lässt sich in London als Herr des Reiches feiern.',
  },
  normandie: {
    richard: 'Die Normandie ist zurückgewonnen! Von Caen bis Gisors weht das Banner des Herzogs, Philipp ist hinter den Vexin zurückgeworfen.',
    philipp: 'Die Normandie ist an Frankreich gefallen. König Philipp hält Caen, Falaise und Évreux, und Rouen öffnet ihm die Tore.',
  },
};
// Ein Kriegsschauplatz gilt als entschieden, wenn eine Seite alle Burgen des Ziels hält. Der Stand zu Spielbeginn
// (Johann hält ganz England) zählt nicht: Erst wer etwas erobert hat, kann siegen. Für Johanns Sieg musst du ihm
// selbst mindestens zwei Grafschaften erobert haben.
function checkEnds() {
  const w = war();
  if (!w.unified) { w.unified = {}; for (const th of THEATER_IDS) w.unified[th] = theaterWinner(th); return; }
  for (const th of THEATER_IDS) {
    const win = theaterWinner(th);
    if (win === w.unified[th]) continue;
    w.unified[th] = win;
    if (!win) continue;
    const a = allegiance();
    const ownHere = goalSeats(th).filter((s) => shireOwner(s.id) === 'spieler').length;
    const mine = !!a && win === a && (a !== 'john' || ownHere >= 2);
    w.ended[th] = win;
    warLog(END_TEXT[th][win], mine ? 'gold' : win === a ? 'good' : 'bad');
    if (mine) addRenown(th === 'england' ? 100 : 60);
    if (G.onWarEnd) G.onWarEnd(th, win, mine);
  }
}
export function warEnded(th) { return war().ended[th] || null; }
// Beim Start und nach dem Laden: Ausgangslage merken (zählt nicht als Sieg)
export function initWar() { war(); checkEnds(); }

// ---------------------------------------------------------------- Tageswechsel
export function dailyWar() {
  const w = war();
  // Kriegsglück verblasst langsam
  for (const k of Object.keys(w.morale)) { w.morale[k] = Math.round(w.morale[k] * 0.9); if (!w.morale[k]) delete w.morale[k]; }
  if (w.support && w.support.until < G.s.day) w.support = null;
  // Heere, die angekommen sind
  for (const c of [...w.campaigns]) {
    if (G.s.day < c.arrive) continue;
    w.campaigns = w.campaigns.filter((x) => x !== c);
    resolveCampaign(c);
  }
  // Neue Feldzüge: höchstens einer je Kriegsschauplatz. Die unterlegene Seite gibt nicht auf.
  if (G.s.day >= 3) {
    for (const th of THEATER_IDS) {
      if (w.campaigns.some((c) => c.th === th) || Math.random() >= CAMPAIGN_CHANCE) continue;
      launchCampaign(th);
    }
  }
  checkEnds();
}

// Für die Karte: Heere unterwegs als Pfeile (Ausgangsburg → Ziel), Fortschritt nach Tagen
export function campaignArrows() {
  return war().campaigns.map((c) => {
    const t = siteById(c.target), f = c.from ? siteById(c.from) : null;
    if (!t) return null;
    const k = Math.max(0, Math.min(1, (G.s.day - c.day0 + G.s.time / DAY_LEN) / Math.max(1, c.arrive - c.day0)));
    return { from: f || { x: t.x - 30, y: t.y - 30 }, to: t, k, color: sideColor(c.th, c.side), c };
  }).filter(Boolean);
}
