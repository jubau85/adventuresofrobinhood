// Ansehen bei den Fraktionen, Ruhm und Aufträge.

import { G, log } from './state.js';
import { FACTIONS, FACTION_IDS, GOODS } from './data.js';
import { randInt, pick, clamp } from './rng.js';
import { spawnGroup } from './units.js';
import { siteById } from './economy.js';

export const ALLY_AT = 50;
export const HOSTILE_AT = -30;

export function repStatus(v) {
  if (v >= ALLY_AT) return { label: 'Verbündet', cls: 'ally' };
  if (v >= 20) return { label: 'Freundlich', cls: 'friend' };
  if (v > -5) return { label: 'Neutral', cls: 'neutral' };
  if (v > HOSTILE_AT) return { label: 'Misstrauisch', cls: 'wary' };
  return { label: 'Feindlich', cls: 'hostile' };
}

export function isAlly(f) { return !!f && G.s.rep[f] >= ALLY_AT; }
export function isHostileFaction(f) { return !!f && G.s.rep[f] <= HOSTILE_AT; }
export function alliesCount() { return FACTION_IDS.filter((f) => isAlly(f)).length; }

export function changeRep(f, amount, spread = false) {
  if (!f || !amount) return;
  const before = G.s.rep[f];
  G.s.rep[f] = clamp(Math.round(before + amount), -100, 100);
  const after = G.s.rep[f];
  const name = FACTIONS[f].short;
  if (after !== before) log(`Ansehen ${name}: ${amount > 0 ? '+' : ''}${after - before}`, amount > 0 ? 'good' : 'bad');
  if (before < ALLY_AT && after >= ALLY_AT) log(`Die ${FACTIONS[f].name} sind jetzt deine Verbündeten! ${FACTIONS[f].ally}`, 'gold');
  if (before >= ALLY_AT && after < ALLY_AT) log(`Das Bündnis mit den ${FACTIONS[f].name} ist zerbrochen.`, 'bad');
  if (before > HOSTILE_AT && after <= HOSTILE_AT) log(`Die ${FACTIONS[f].name} betrachten dich jetzt als Feind.`, 'bad');
  if (before <= HOSTILE_AT && after > HOSTILE_AT) log(`Die ${FACTIONS[f].name} sind nicht mehr feindlich gesinnt.`, 'good');
  if (spread && amount > 0) {
    for (const r of FACTIONS[f].rivals) changeRep(r, -Math.max(1, Math.round(amount * 0.4)));
  }
}

export function addRenown(n) {
  if (!n) return;
  G.s.renown += n;
  log(`Ruhm +${n}`, 'gold');
}

// ---------------------------------------------------------------- Aufträge
const QUEST_TYPES_BY_FACTION = {
  sachsen: ['lieferung', 'banditen', 'bote', 'lieferung', 'banditen'],
  normannen: ['lieferung', 'jagd', 'bote', 'banditen'],
  kirche: ['lieferung', 'bote', 'banditen', 'lieferung'],
  gilde: ['lieferung', 'lieferung', 'banditen', 'bote'],
  waldleute: ['ueberfall', 'lieferung', 'ueberfall', 'bote'],
  franken: ['lieferung', 'banditen', 'bote', 'lieferung'],
};

function makeQuest(site) {
  const types = QUEST_TYPES_BY_FACTION[site.faction] || ['lieferung'];
  const type = pick(types);
  const q = { id: G.s.questSeq++, type, from: site.id, faction: site.faction, state: 'offen', created: G.s.day };
  const others = G.world.sites.filter((s) => s.id !== site.id && s.type !== 'spieler' && (s.type !== 'lager' || site.faction === 'waldleute'));
  switch (type) {
    case 'lieferung': {
      const good = pick(site.demands.length ? site.demands : ['getreide']);
      const qty = randInt(6, 16);
      q.good = good; q.qty = qty;
      q.days = 6;
      q.reward = { gold: Math.round(qty * GOODS[good].base * 1.3 + 25), rep: randInt(6, 9), renown: 1 };
      q.title = `${qty} ${GOODS[good].name} liefern`;
      q.desc = `${site.name} braucht ${qty} ${GOODS[good].name}. Bring die Ware hierher.`;
      break;
    }
    case 'banditen':
      q.days = 5;
      q.reward = { gold: randInt(80, 150), rep: randInt(8, 12), renown: 3 };
      q.title = 'Wegelagerer vertreiben';
      q.desc = `Eine Bande überfällt Reisende bei ${site.name}. Zerschlag sie und kehr zurück.`;
      break;
    case 'jagd':
      q.days = 5;
      q.reward = { gold: randInt(100, 170), rep: randInt(10, 14), renown: 2 };
      q.title = 'Wilderer stellen';
      q.desc = 'Waldleute wildern im Forst des Barons. Stell sie zur Rede, notfalls mit dem Schwert.';
      break;
    case 'ueberfall':
      q.days = 5;
      q.reward = { gold: randInt(60, 120), rep: randInt(10, 14), renown: 3 };
      q.title = 'Steuerkasse erleichtern';
      q.desc = 'Ein Steuereintreiber ist mit seiner Wache unterwegs. Nimm ihm ab, was er den Bauern abgepresst hat.';
      break;
    case 'bote': {
      // Meist ein Ort in der Nähe, manchmal eine Botschaft übers Meer
      const near = others.filter((s) => s.land === site.land && Math.hypot(s.x - site.x, s.y - site.y) < 170);
      const tgt = pick(near.length && Math.random() < 0.8 ? near : others);
      const overSea = tgt.land !== site.land;
      q.target = tgt.id;
      q.days = overSea ? 7 : 5;
      const d = Math.hypot(tgt.x - site.x, tgt.y - site.y);
      q.reward = { gold: Math.round(30 + d * 0.6 + (overSea ? 60 : 0)), rep: randInt(4, 7) + (overSea ? 2 : 0), renown: overSea ? 2 : 1 };
      q.title = `Botschaft nach ${tgt.name}`;
      q.desc = overSea ? `Bring einen versiegelten Brief nach ${tgt.name}. Dafür musst du übers Meer: Schiffe fahren in Dover, Portsmouth und London.` : `Bring einen versiegelten Brief nach ${tgt.name}.`;
      break;
    }
    default: break;
  }
  return q;
}

export function refreshTownQuests(site) {
  const town = G.s.towns[site.id];
  if (!site.faction || town.questDay > G.s.day) return;
  town.quests = town.quests.filter((q) => q.state === 'offen' && G.s.day - q.created < 4);
  while (town.quests.length < 3) town.quests.push(makeQuest(site));
  town.questDay = G.s.day + 3;
}

export function activeQuests() { return G.s.quests; }

export function acceptQuest(siteId, qid) {
  const town = G.s.towns[siteId];
  const q = town.quests.find((x) => x.id === qid);
  if (!q) return;
  if (G.s.quests.length >= 6) { log('Du hast schon zu viele Aufträge angenommen.', 'bad'); return; }
  town.quests = town.quests.filter((x) => x !== q);
  q.state = 'aktiv';
  q.deadline = G.s.day + q.days;
  const site = siteById(siteId);
  if (q.type === 'banditen') {
    const g = spawnGroup('banditen', { near: { x: site.x, y: site.y, r: 22, rMin: 10 }, questId: q.id });
    if (g) { q.groupId = g.id; q.tx = g.x; q.ty = g.y; }
  } else if (q.type === 'jagd') {
    const g = spawnGroup('waldleute', { near: { x: site.x, y: site.y, r: 24, rMin: 10 }, questId: q.id });
    if (g) { q.groupId = g.id; q.tx = g.x; q.ty = g.y; }
  } else if (q.type === 'ueberfall') {
    const g = spawnGroup('steuer', { near: { x: site.x, y: site.y, r: 28, rMin: 12 }, questId: q.id });
    if (g) { q.groupId = g.id; q.tx = g.x; q.ty = g.y; }
  }
  G.s.quests.push(q);
  log(`Auftrag angenommen: ${q.title}. Frist bis Tag ${q.deadline}.`, 'gold');
}

export function questTarget(q) {
  if (q.groupId && q.state === 'aktiv') {
    const g = G.groups.find((x) => x.id === q.groupId);
    if (g) return { x: g.x, y: g.y, label: q.title };
  }
  if (q.type === 'bote' && q.state === 'aktiv') { const s = siteById(q.target); return { x: s.x, y: s.y, label: s.name }; }
  const s = siteById(q.from);
  return { x: s.x, y: s.y, label: s.name };
}

function reward(q) {
  const r = q.reward;
  G.s.gold += r.gold;
  log(`Auftrag erfüllt: ${q.title}. Belohnung: ${r.gold} Gold.`, 'gold');
  changeRep(q.faction, r.rep, true);
  addRenown(r.renown);
  G.s.quests = G.s.quests.filter((x) => x !== q);
  G.s.stats.quests++;
}

export function canDeliver(q) { return q.type === 'lieferung' && (G.s.cargo[q.good] || 0) >= q.qty; }

export function deliverQuest(q) {
  if (!canDeliver(q)) return;
  G.s.cargo[q.good] -= q.qty;
  G.s.towns[q.from].stock[q.good] += q.qty;
  reward(q);
}

export function claimQuest(q) { if (q.state === 'erfuellt') reward(q); }

export function deliverLetter(q) { if (q.type === 'bote') reward(q); }

export function abandonQuest(q) {
  G.s.quests = G.s.quests.filter((x) => x !== q);
  if (q.groupId) {
    const g = G.groups.find((x) => x.id === q.groupId);
    if (g) g.questId = null;
  }
  changeRep(q.faction, -2);
  log(`Auftrag aufgegeben: ${q.title}.`);
}

export function onQuestGroupDestroyed(g) {
  if (!g.questId) return;
  const q = G.s.quests.find((x) => x.id === g.questId);
  if (!q) return;
  q.state = 'erfuellt';
  const s = siteById(q.from);
  log(`Auftrag „${q.title}“ erledigt. Hol dir die Belohnung in ${s.name}.`, 'gold');
}

export function dailyQuests() {
  for (const q of [...G.s.quests]) {
    if (q.state === 'aktiv' && G.s.day > q.deadline) {
      G.s.quests = G.s.quests.filter((x) => x !== q);
      if (q.groupId) { const g = G.groups.find((x) => x.id === q.groupId); if (g) g.questId = null; }
      log(`Frist verstrichen: ${q.title}.`, 'bad');
      changeRep(q.faction, -4);
    }
  }
  for (const s of G.world.sites) refreshTownQuests(s);
}

// Geschenke und Gelage: Politik mit Gold
export function giftCost(site) { return 60 + Math.max(0, G.s.rep[site.faction]) * 2; }

export function giveGift(site) {
  const town = G.s.towns[site.id];
  if (town.giftDay === G.s.day) { log('Hier hast du heute schon etwas gegeben.'); return; }
  const cost = giftCost(site);
  if (G.s.gold < cost) { log('Nicht genug Gold.', 'bad'); return; }
  G.s.gold -= cost;
  town.giftDay = G.s.day;
  changeRep(site.faction, randInt(3, 5), true);
}

