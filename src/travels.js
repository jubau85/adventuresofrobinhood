// Gefolgsleute auf Reisen (Phase 4). Du schickst Gefährten los, statt alles selbst zu erledigen: Sie bringen Briefe,
// liefern Ware, stellen mit ein, zwei Begleitern eine Bande oder fahren als Händler mit einem Wagen über Land.
// Eine Handelsfahrt verkauft Fracht aus dem Burglager, kauft woanders ein und kann ein zweites Ziel anfahren;
// wiederholt man sie, wird daraus eine feste Route. Unterwegs lauern Wegelagerer: Wer stark genug ist, schlägt sie
// zurück, sonst ist ein Teil der Ladung fort und die Reisenden kehren verwundet heim.
// Die Reise läuft in Spielzeit ab (Tag plus Tageszeit), auch während du schläfst oder rastest.

import { G, log, homeName } from './state.js';
import { GOODS, GROUP_TYPES, DAY_LEN, CLASSES } from './data.js';
import { rand, randInt } from './rng.js';
import { siteById, sellPrice, buyPrice } from './economy.js';
import { changeRep, isAlly, isHostileFaction, rewardQuest } from './politics.js';
import { rebuildUnits, grantXp, removeGroup } from './units.js';
import { castleSite, homeBase } from './castle.js';
import { landAt } from './world.js';

export function trips() { return G.s.trips || (G.s.trips = []); }
export function nowDay() { return G.s.day + G.s.time / DAY_LEN; }

// Felder am Tag: zu Pferd, zu Fuß, mit dem Wagen. Straßen machen Umwege, daher ein Viertel mehr als die Luftlinie.
const SPEED = { reiter: 120, fuss: 90, wagen: 75 };
const DETOUR = 1.25;
export const WAGON = 40;          // so viel lädt ein Wagen
const FOOD_PER_DAY = 3;           // Zehrgeld je Kopf und Tag
const FERRY = 12;                 // Fährgeld je Kopf und Überfahrt
const SEA_DAYS = 1.5;             // eine Überfahrt kostet so viel Zeit
export const DELEGABLE = { bote: 1, lieferung: 1, banditen: 1, jagd: 1, ueberfall: 1 };
const KIND_OF = { bote: 'bote', lieferung: 'lieferung', banditen: 'kampf', jagd: 'kampf', ueberfall: 'kampf' };

// ---------------------------------------------------------------- Wer reist
export function companion(id) { return G.s.companions.find((c) => c.id === Number(id)) || null; }
// Wer losgeschickt werden kann: im Gefolge oder in der Garnison, gesund
export function canTravel(u) { return !!u && (u.status === 'party' || u.status === 'garnison'); }
export function travelCandidates() { return G.s.companions.filter(canTravel); }
function travelers(t) { return t.who.map(companion).filter((u) => u && u.status === 'reise'); }
function names(us) {
  const n = us.map((u) => u.name);
  return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} und ${n[n.length - 1]}`;
}
export function partyStrength(us) { return us.reduce((a, u) => a + u.st.atk * 2 + u.st.def + u.st.maxHp / 8, 0); }
function groupStrength(g) { return g.members.reduce((a, m) => a + m.st.atk * 2 + m.st.def + m.hp / 8, 0); }

// ---------------------------------------------------------------- Strecken
function homePt() { const s = homeBase(); return { x: s.x, y: s.y + 4, land: s.land, name: s.type === 'spieler' ? homeName() : s.name }; }
function sitePt(s) { return { x: s.x, y: s.y + 1, land: s.land, name: s.name, site: s.id }; }
function playerPt() { const p = G.s.player; return { x: p.x, y: p.y, land: landAt(G.world, p.x, p.y), name: 'deinem Lager' }; }
function legDays(a, b, mode) {
  const d = Math.hypot(a.x - b.x, a.y - b.y) * DETOUR;
  return Math.max(0.2, d / SPEED[mode] + (a.land !== b.land ? SEA_DAYS : 0));
}
function modeOf(us, cargo) {
  if (Object.values(cargo || {}).some((n) => n > 0)) return 'wagen';
  return us.length && us.every((u) => u.eq.pferd) ? 'reiter' : 'fuss';
}
const MODE_NAME = { reiter: 'zu Pferd', fuss: 'zu Fuß', wagen: 'mit dem Wagen' };

// Gefahr: Wegelagerer je Tag unterwegs. Mit den Waldleuten verbündet, meiden dich die Banden; sind sie dir feind,
// lauern sie öfter. Eine reiche Fracht lockt sie an.
function dangerPerDay(value) {
  let p = 0.05;
  if (isAlly('waldleute')) p *= 0.35;
  else if (isHostileFaction('waldleute')) p *= 1.6;
  if (value > 300) p *= 1.3;
  return p;
}
function robberStrength() { return (20 + G.s.day * 0.8) * rand(0.6, 1.4); }
function cargoValue(cargo, gold = 0) { return gold + Object.entries(cargo || {}).reduce((a, [g, n]) => a + GOODS[g].base * n, 0); }
// Chance, auf einer Strecke von days Tagen überfallen zu werden, und wie gut die Reisenden dann dastehen
export function riskOf(days, us, value) {
  const p = 1 - Math.pow(1 - dangerPerDay(value), days);
  const win = chanceAtLeast(partyStrength(us), 0.8, 1.2, 20 + G.s.day * 0.8, 0.6, 1.4);
  return { p, win };
}

// ---------------------------------------------------------------- Planen
// spec: { kind: 'auftrag'|'handel', who: [ids], quest, good, qty, budget, to, buy, to2, repeat }
// Ergebnis: { ok, why, stops, days, cost, from, source, mode, cargo, note }
export function planTrip(spec) {
  const out = { ok: false, why: null, stops: [], days: 0, cost: 0, cargo: {}, budget: 0 };
  const ids = [...new Set((spec.who || []).map(Number).filter(Boolean))];
  const us = ids.map(companion);
  if (!us.length || us.some((u) => !u)) { out.why = 'Wähle, wer reisen soll.'; return out; }
  const bad = us.find((u) => !canTravel(u));
  if (bad) { out.why = `${bad.name} kann gerade nicht reisen.`; return out; }
  // Abreise: aus der Garnison von der Burg, aus dem Gefolge von dir aus
  const home = homePt(), p = G.s.player, atHome = Math.hypot(home.x - p.x, home.y - 4 - p.y) < 15;
  const fromParty = us.some((u) => u.status === 'party'), fromGar = us.some((u) => u.status === 'garnison');
  if (fromParty && fromGar && !atHome) { out.why = 'Gefolge und Garnison sind nicht am selben Ort. Schick sie getrennt oder reite heim.'; return out; }
  const from = fromParty && !atHome ? playerPt() : home;
  out.from = from;
  out.source = from === home ? 'lager' : 'ladung';
  const store = out.source === 'lager' ? G.s.castle.storage : G.s.cargo;
  out.us = us;
  if (spec.kind === 'auftrag') {
    const q = G.s.quests.find((x) => x.id === Number(spec.quest));
    if (!q || q.state !== 'aktiv' || !DELEGABLE[q.type]) { out.why = 'Diesen Auftrag kann niemand mehr übernehmen.'; return out; }
    if (q.agent && trips().some((t) => t.id === q.agent)) { out.why = 'Für diesen Auftrag ist schon jemand unterwegs.'; return out; }
    out.quest = q; out.kind = KIND_OF[q.type];
    if (q.type === 'bote') out.stops = [{ pt: sitePt(siteById(q.target)), act: 'bote' }];
    else if (q.type === 'lieferung') {
      if ((store[q.good] || 0) < q.qty) { out.why = `Dafür fehlen ${q.qty - (store[q.good] || 0)} ${GOODS[q.good].name} ${out.source === 'lager' ? 'im Burglager' : 'in deiner Ladung'}.`; return out; }
      out.cargo = { [q.good]: q.qty };
      out.stops = [{ pt: sitePt(siteById(q.from)), act: 'lieferung' }];
    } else {
      const g = G.groups.find((x) => x.id === q.groupId);
      if (!g) { out.why = 'Die Gesuchten sind nicht mehr aufzufinden.'; return out; }
      out.stops = [{ pt: { x: g.x, y: g.y, land: landAt(G.world, g.x, g.y), name: `Umgebung von ${siteById(q.from).name}` }, act: 'kampf' }];
      out.foe = g;
    }
  } else {
    out.kind = 'handel';
    const to = siteById(spec.to), to2 = spec.to2 ? siteById(spec.to2) : null;
    if (!to) { out.why = 'Wähle ein Ziel.'; return out; }
    if (isHostileFaction(to.faction) || (to2 && isHostileFaction(to2.faction))) { out.why = `In ${isHostileFaction(to.faction) ? to.name : to2.name} lassen die Wachen niemanden von dir herein.`; return out; }
    if (to2 === to) { out.why = 'Das zweite Ziel ist dasselbe wie das erste.'; return out; }
    const cap = WAGON * us.length;
    const qty = spec.good ? Math.min(Number(spec.qty) || 0, store[spec.good] || 0, cap) : 0;
    if (spec.good && qty <= 0) { out.why = `${out.source === 'lager' ? 'Im Burglager' : 'In deiner Ladung'} ist kein ${GOODS[spec.good].name}.`; return out; }
    if (qty) out.cargo = { [spec.good]: qty };
    out.budget = Math.max(0, Math.min(Number(spec.budget) || 0, G.s.gold));
    if (!qty && !out.budget) { out.why = 'Gib Fracht oder Geld für Einkäufe mit.'; return out; }
    if (spec.buy && !out.budget && !qty) { out.why = 'Zum Einkaufen braucht es Geld oder Fracht, die sich verkaufen lässt.'; return out; }
    out.stops = [{ pt: sitePt(to), act: 'markt1' }];
    if (to2) out.stops.push({ pt: sitePt(to2), act: 'markt2' });
    out.plan = { good: spec.good || null, qty, budget: out.budget, to: to.id, buy: spec.buy || null, to2: to2 ? to2.id : null };
    out.preview = tradePreview(out.plan, cap);
  }
  out.stops.push({ pt: home, act: 'heim' });
  // Dauer und Kosten: hin mit Fracht im Wagen, sonst zu Pferd oder zu Fuß
  let at = from, days = 0, crossings = 0;
  const legs = [];
  for (const st of out.stops) {
    // Händler fahren immer mit dem Wagen, Lieferungen bis zum Ziel, alle anderen reiten oder gehen
    const mode = out.kind === 'handel' || st.act === 'lieferung' ? 'wagen' : modeOf(us, {});
    const d = legDays(at, st.pt, mode);
    if (at.land !== st.pt.land) crossings++;
    legs.push({ to: st.pt.name, days: d, mode });
    days += d; at = st.pt;
  }
  out.legs = legs;
  out.days = days;
  out.cost = Math.ceil(days * FOOD_PER_DAY * us.length + crossings * FERRY * us.length);
  out.mode = legs[0].mode;
  out.risk = riskOf(days, us, cargoValue(out.cargo, out.budget));
  if (out.kind === 'kampf') {
    const S = groupStrength(out.foe);
    out.fight = { us: Math.round(partyStrength(us)), them: Math.round(S), win: chanceAtLeast(partyStrength(us) * 1.1, 0.8, 1.2, S, 0.75, 1.25) };
  }
  if (G.s.gold < out.cost + out.budget) { out.why = `Für Zehrgeld${crossings ? ' und Fähre' : ''} fehlt dir Gold (${out.cost + out.budget}).`; return out; }
  out.ok = true;
  return out;
}

// Was eine Handelsfahrt nach heutigen Preisen ungefähr bringt (Preise ändern sich, wenn viel verkauft wird)
export function tradePreview(plan, cap) {
  const to = siteById(plan.to), to2 = plan.to2 ? siteById(plan.to2) : null;
  let gold = plan.budget, sold = 0, bought = 0, home = {};
  if (plan.good && plan.qty) { sold = sellRun(to, plan.good, plan.qty, true); gold += sold; }
  if (plan.buy) {
    const k = buyRun(to, plan.buy, gold, cap, true);
    bought = k.n; gold -= k.spent;
    if (to2 && k.n) { const s2 = sellRun(to2, plan.buy, k.n, true); gold += s2; } else if (k.n) home[plan.buy] = k.n;
  }
  return { sold, bought, gold, home, net: gold - plan.budget };
}
// Verkaufen und Kaufen am Markt: Jedes Stück verschiebt den Preis ein wenig (wie bei dir selbst)
function sellRun(site, good, n, dry = false) {
  const st = G.s.towns[site.id].stock, keep = st[good];
  let earned = 0;
  for (let k = 0; k < n; k++) { earned += sellPrice(site, good); st[good]++; }
  if (dry) st[good] = keep;
  return earned;
}
function buyRun(site, good, money, cap, dry = false) {
  const st = G.s.towns[site.id].stock, keep = st[good];
  let n = 0, spent = 0;
  while (n < cap && st[good] > 0) {
    const p = buyPrice(site, good);
    if (spent + p > money) break;
    spent += p; st[good]--; n++;
  }
  if (dry) st[good] = keep;
  return { n, spent };
}

// ---------------------------------------------------------------- Losschicken
export function startTrip(spec, quiet = false) {
  const plan = planTrip(spec);
  if (!plan.ok) { if (!quiet) log(plan.why, 'bad'); return null; }
  const us = plan.us;
  G.s.gold -= plan.cost + plan.budget;
  const store = plan.source === 'lager' ? G.s.castle.storage : G.s.cargo;
  for (const [g, n] of Object.entries(plan.cargo)) store[g] -= n;
  for (const u of us) { u.status = 'reise'; u.attackTarget = null; u.path = null; }
  const id = (G.s.tripSeq = (G.s.tripSeq || 0) + 1);
  const t = {
    id, kind: plan.kind, who: us.map((u) => u.id), quest: plan.quest ? plan.quest.id : null,
    stops: plan.stops.map((s) => ({ ...s.pt, act: s.act })), i: 0, from: plan.from, t1: nowDay(),
    cargo: { ...plan.cargo }, gold: plan.budget, plan: plan.plan || null, repeat: !!spec.repeat, spec: { ...spec },
    label: tripLabel(plan), started: G.s.day, foe: plan.foe ? plan.foe.id : null,
  };
  if (plan.quest) plan.quest.agent = id;
  startLeg(t, plan.from);
  trips().push(t);
  rebuildUnits();
  if (!quiet) log(`${names(us)} ${us.length > 1 ? 'brechen' : 'bricht'} auf: ${t.label}. Zurück in etwa ${fmtDays(plan.days)} (Zehrgeld${plan.cost ? ` ${plan.cost} Gold` : ''}).`, 'good');
  return t;
}
function tripLabel(plan) {
  const q = plan.quest;
  if (q) return q.type === 'bote' ? `Brief nach ${siteById(q.target).name}` : q.type === 'lieferung' ? `${q.qty} ${GOODS[q.good].name} nach ${siteById(q.from).name}` : `${q.title} bei ${siteById(q.from).name}`;
  const pl = plan.plan, to = siteById(pl.to).name;
  const parts = [];
  if (pl.good) parts.push(`${pl.qty} ${GOODS[pl.good].name} nach ${to}`);
  else parts.push(`nach ${to}`);
  if (pl.buy) parts.push(`dort ${GOODS[pl.buy].name} kaufen`);
  if (pl.to2) parts.push(`weiter nach ${siteById(pl.to2).name}`);
  return `Handelsfahrt: ${parts.join(', ')}`;
}
export function fmtDays(d) { const r = Math.round(d * 2) / 2; return r <= 0.5 ? 'einem halben Tag' : r === 1 ? 'einem Tag' : `${String(r).replace('.', ',')} Tagen`; }

// Eine Strecke beginnt: Dauer nach Fracht und Reittieren, Überfall auswürfeln
function startLeg(t, from) {
  const to = t.stops[t.i], us = travelers(t);
  const loaded = Object.values(t.cargo).some((n) => n > 0) || t.kind === 'handel';
  const days = legDays(from, to, loaded ? 'wagen' : modeOf(us, {}));
  t.from = { x: from.x, y: from.y, land: from.land, name: from.name };
  t.t0 = t.t1; t.t1 = t.t0 + days;
  const r = riskOf(days, us, cargoValue(t.cargo, t.gold));
  t.ambushAt = Math.random() < r.p ? t.t0 + days * rand(0.2, 0.8) : null;
}
// „nach York“, „in die Umgebung von York“
export function towardText(st) { return st.act === 'kampf' ? `in die ${st.name}` : `nach ${st.name}`; }
// Wahrscheinlichkeit, dass a·[aLo, aHi] mindestens b·[bLo, bHi] erreicht (beide Zufallsfaktoren gleichverteilt)
function chanceAtLeast(a, aLo, aHi, b, bLo, bHi) {
  let win = 0;
  const n = 24;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (a * (aLo + (aHi - aLo) * (i + 0.5) / n) >= b * (bLo + (bHi - bLo) * (j + 0.5) / n)) win++;
  return win / (n * n);
}
// Wo die Reisenden gerade sind (für die Karte)
export function tripPos(t) {
  const to = t.stops[t.i], k = Math.max(0, Math.min(1, (nowDay() - t.t0) / Math.max(0.01, t.t1 - t.t0)));
  return { x: t.from.x + (to.x - t.from.x) * k, y: t.from.y + (to.y - t.from.y) * k, k, to };
}

// ---------------------------------------------------------------- Unterwegs
export function updateTrips() {
  if (!G.s || !G.s.trips || !G.s.trips.length) return;
  const now = nowDay();
  for (const t of [...G.s.trips]) {
    for (let guard = 0; guard < 8 && !t.done; guard++) {
      if (!travelers(t).length) { t.done = true; log(`Von der Reise „${t.label}“ kommt niemand mehr zurück.`, 'bad'); break; }
      if (t.ambushAt && now >= t.ambushAt && t.ambushAt < t.t1) { ambush(t); continue; }
      if (now < t.t1) break;
      arrive(t);
    }
  }
  G.s.trips = G.s.trips.filter((t) => !t.done);
}

function ambush(t) {
  const us = travelers(t), pos = tripPos(t);
  t.ambushAt = null;
  const P = partyStrength(us) * rand(0.8, 1.2), R = robberStrength();
  const who = names(us), pl = us.length > 1;
  if (P >= R) {
    const loot = randInt(8, 35);
    t.gold += loot;
    for (const u of us) { grantXp(u, 25); u.hp = Math.max(1, Math.round(u.hp - u.st.maxHp * rand(0.1, 0.3))); }
    log(`Unterwegs ${towardText(pos.to)} ${pl ? 'werden' : 'wird'} ${who} von Wegelagerern überfallen und ${pl ? 'schlagen' : 'schlägt'} sie in die Flucht (${loot} Gold Beute).`, 'good');
    return;
  }
  // Niederlage: Die Hälfte der Ladung und des Geldes ist fort, alle sind verwundet und kehren heim
  const lost = [];
  for (const [g, n] of Object.entries(t.cargo)) { const k = Math.ceil(n / 2); if (k > 0) { t.cargo[g] -= k; lost.push(`${k} ${GOODS[g].name}`); } }
  const lg = Math.ceil(t.gold / 2);
  if (lg > 0) { t.gold -= lg; lost.push(`${lg} Gold`); }
  for (const u of us) u.hp = Math.max(1, Math.round(u.st.maxHp * 0.15));
  t.wounded = true;
  log(`Wegelagerer haben ${who} auf dem Weg ${towardText(pos.to)} überfallen${lost.length ? ` und ${lost.join(', ')} geraubt` : ''}. Verwundet ${pl ? 'kehren sie' : 'kehrt er'} heim.`, 'bad');
  turnHome(t, pos);
}
function turnHome(t, pos) {
  const home = t.stops[t.stops.length - 1];
  t.stops = [home]; t.i = 0;
  t.t1 = nowDay();
  startLeg(t, { x: pos.x, y: pos.y, land: landAt(G.world, pos.x, pos.y), name: 'unterwegs' });
  t.ambushAt = null;
}

function arrive(t) {
  const st = t.stops[t.i], us = travelers(t), who = names(us), pl = us.length > 1;
  const q = t.quest ? G.s.quests.find((x) => x.id === t.quest) : null;
  if (st.act === 'heim') return finish(t);
  if (st.act === 'bote' || st.act === 'lieferung') {
    if (!q || q.state !== 'aktiv') log(`${who} ${pl ? 'kommen' : 'kommt'} in ${st.name} an, aber der Auftrag gilt nicht mehr.`);
    else {
      if (st.act === 'lieferung') { G.s.towns[q.from].stock[q.good] += t.cargo[q.good] || 0; t.cargo[q.good] = 0; }
      rewardQuest(q, who);
      for (const u of us) grantXp(u, 30);
    }
  } else if (st.act === 'kampf') tripFight(t, us, q);
  else if (st.act === 'markt1' || st.act === 'markt2') market(t, siteById(st.site), st.act === 'markt1', us);
  t.i++;
  startLeg(t, st);
}

function tripFight(t, us, q) {
  const g = G.groups.find((x) => x.id === t.foe);
  const who = names(us), pl = us.length > 1;
  if (!g || !g.members.length) { log(`${who} ${pl ? 'finden' : 'findet'} ${q ? `für „${q.title}“` : ''} niemanden mehr vor und ${pl ? 'kehren' : 'kehrt'} heim.`); return; }
  const gt = GROUP_TYPES[g.type];
  const P = partyStrength(us) * 1.1 * rand(0.8, 1.2), S = groupStrength(g) * rand(0.75, 1.25);
  if (P >= S) {
    const loot = randInt(gt.gold[0], gt.gold[1]);
    t.gold += loot;
    if (gt.kill) for (const [f, v] of Object.entries(gt.kill)) changeRep(f, v);
    g.questId = null;
    removeGroup(g);
    rebuildUnits();
    for (const u of us) { grantXp(u, 45); u.hp = Math.max(1, Math.round(u.hp - u.st.maxHp * rand(0.2, 0.45))); }
    log(`${who} ${pl ? 'haben' : 'hat'} ${gt.acc} gestellt und besiegt (Beute ${loot} Gold).`, 'good');
    if (q && q.state === 'aktiv') rewardQuest(q, who);
  } else {
    for (const u of us) u.hp = Math.max(1, Math.round(u.st.maxHp * 0.15));
    t.wounded = true;
    log(`${who} ${pl ? 'haben' : 'hat'} gegen ${gt.acc} verloren und ${pl ? 'schleppen sich' : 'schleppt sich'} verwundet heim. Schick mehr Leute oder geh selbst.`, 'bad');
  }
}

function market(t, s, first, us) {
  const who = names(us), parts = [];
  if (!s || isHostileFaction(s.faction)) { log(`In ${s ? s.name : 'der Stadt'} lassen die Wachen ${who} nicht auf den Markt. Die Fracht kommt wieder mit heim.`, 'bad'); return; }
  for (const [g, n] of Object.entries(t.cargo)) {
    if (n <= 0 || (first && t.plan && t.plan.buy === g && t.plan.to2)) continue;
    const e = sellRun(s, g, n);
    t.gold += e; t.cargo[g] = 0;
    parts.push(`${n} ${GOODS[g].name} für ${e} Gold verkauft`);
  }
  if (first && t.plan && t.plan.buy) {
    const cap = WAGON * us.length - Object.values(t.cargo).reduce((a, n) => a + n, 0);
    const k = buyRun(s, t.plan.buy, t.gold, cap);
    if (k.n) { t.gold -= k.spent; t.cargo[t.plan.buy] = (t.cargo[t.plan.buy] || 0) + k.n; parts.push(`${k.n} ${GOODS[t.plan.buy].name} für ${k.spent} Gold gekauft`); }
    else parts.push(`kein ${GOODS[t.plan.buy].name} zu bekommen`);
  }
  for (const u of us) grantXp(u, 10);
  if (parts.length) log(`${who} in ${s.name}: ${parts.join(', ')}.`);
}

function finish(t) {
  const us = travelers(t), who = names(us), pl = us.length > 1;
  t.done = true;
  for (const u of us) {
    if (t.wounded) { u.status = 'verwundet'; u.woundedDays = 3; u.hp = Math.max(1, u.hp); }
    else u.status = 'garnison';
    grantXp(u, 10);
  }
  const brought = [];
  if (t.gold > 0) { G.s.gold += t.gold; brought.push(`${t.gold} Gold`); }
  for (const [g, n] of Object.entries(t.cargo)) if (n > 0) { G.s.castle.storage[g] = (G.s.castle.storage[g] || 0) + n; brought.push(`${n} ${GOODS[g].name}`); }
  const q = t.quest ? G.s.quests.find((x) => x.id === t.quest) : null;
  if (q && q.agent === t.id) q.agent = null;
  log(`${who} ${pl ? 'sind' : 'ist'} zurück in ${homeName()}${t.wounded ? ', verwundet' : ''}${brought.length ? ` und ${pl ? 'bringen' : 'bringt'} ${brought.join(', ')}` : ''}.`, t.wounded ? 'bad' : 'good');
  rebuildUnits();
  // Feste Route: gleich wieder los, solange Fracht und Geld reichen
  if (t.repeat && t.kind === 'handel' && !t.wounded) {
    const again = startTrip({ ...t.spec, who: t.who }, true);
    if (again) log(`${who} ${pl ? 'fahren' : 'fährt'} die Route erneut: ${again.label}.`);
    else log(`Die Route „${t.label}“ ruht: ${planTrip({ ...t.spec, who: t.who }).why || 'es fehlt an Fracht oder Geld'}`, 'bad');
  }
}

// Route beenden: Die laufende Fahrt geht noch zu Ende, dann bleiben sie daheim
export function stopRoute(id) { const t = trips().find((x) => x.id === Number(id)); if (t) { t.repeat = false; log(`Nach dieser Fahrt bleibt die Route „${t.label}“ ruhen.`); } }
// Zurückrufen: sofort umkehren (Aufträge bleiben unerledigt)
export function recallTrip(id) {
  const t = trips().find((x) => x.id === Number(id));
  if (!t || t.stops[t.i].act === 'heim') return;
  t.repeat = false;
  const pos = tripPos(t);
  turnHome(t, pos);
  log(`Ein Bote holt ${names(travelers(t))} zurück. Sie kehren um und sind in etwa ${fmtDays(t.t1 - nowDay())} daheim.`);
}

export function travelerTrip(u) { return trips().find((t) => t.who.includes(u.id)) || null; }
export function tripEta(t) { return t.stops.length ? t.stops[t.stops.length - 1] : null; }
export function className(u) { return CLASSES[u.cls].name; }
