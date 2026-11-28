// Oberfläche: Kopfleiste, Meldungen, Tafeln (Siedlung, Burg, Gefolge, Aufträge, Politik, Karte, Menü).

import { G, log, homeName, playerColor, versionText } from './state.js';
import {
  FACTIONS, FACTION_IDS, GOODS, GOOD_IDS, ITEMS, SLOTS, SLOT_NAME, CLASSES, BUILDINGS, BUILDING_IDS,
  TYPE_NAME, siteTypeName, SEASONS, REGIONS, dirText, CASTLE_BONUS, FOOD_PRICE, FOOD_GOODS, GROUP_TYPES, DAY_LEN,
} from './data.js';
import {
  buy, sell, sellStored, storedSellPrice, buyPrice, sellPrice, cargoUsed, shopItems, itemBuyPrice, itemSellPrice, buyItem, sellItem, siteById,
} from './economy.js';
import {
  repStatus, isHostileFaction, isAlly, alliesCount, acceptQuest, canDeliver, deliverQuest, claimQuest,
  deliverLetter, abandonQuest, questTarget, refreshTownQuests, giftCost, giveGift, ALLY_AT, HOSTILE_AT,
} from './politics.js';
import {
  bLevel, levelName, partyCap, cargoCap, buildInfo, startBuild, hire, setCompanionStatus, dismiss,
  castleDefense, dailyBalance, storeCargo, loadCargo, castleSite, homeBase, seatSite, isHomeBase, conProgress, villageHouses, foodNeed, foodStock,
  castlePlots, castleLayout, homeBesieged, repairCost, startRepair, demolish, typeChangeCost, typeChangeDays, typeChangeLosses, startTypeChange, castleTypeName,
} from './castle.js';
import { CASTLE_TYPES, TYPE_IDS, OUTER_ONLY, STACKABLE, PLOT_BUILDINGS, castleType } from './plots.js';
import { partyMembers, equip, unequip, previewEquip, xpNeeded, setPlayerPath, ferryRoutes, ferryCost, sail } from './units.js';
import { seasonIndex, yearOf, clockText, passHours, hourOf } from './sim.js';
import { buffActive } from './life.js';
import { drawMap, miniToWorld } from './render.js';
import { landAt } from './world.js';
import {
  canRaid, raidBlock, raidable, startRaid, isBlighted, isAbandoned, canDonate, donate, donateCost, atone, atoneCost, siteHouses, underConstruction, standing,
} from './dynamics.js';
import { tourneyAt, canJoin, joinTourney } from './tournament.js';
import { siegeAt, siegeStatus, sideBlock, sideOffer, joinSiege, canCallStorm, callStorm, hasHomeGate, homeGateClosed, setHomeGate, abortOwnSiege } from './siege.js';
import {
  holdingOf, isHeld, isOwnSite, heldSites, ORDERS, ORDER_IDS, WORKS, castellanOf, holdingEff, worksDone, nextWork, holdingDefense, holdingIncome,
  setHoldingOrder, appointCastellan, recallCastellan, repairCostHolding, repairHolding, RECRUIT, recruitHolding, workCost, payWork,
  LEVIES, levyCost, SIEGE_GEAR, MERC_COST, siegeHelpers, besiegeBlock, startOwnSiege, counterStrength, holdingLine,
} from './holdings.js';
import {
  trips, planTrip, startTrip, stopRoute, recallTrip, travelCandidates, travelerTrip, tripPos, fmtDays, DELEGABLE, WAGON, nowDay, towardText,
} from './travels.js';
import {
  THEATERS, THEATER_IDS, ALLEGIANCE, allegiance, war, sideStrength, sideTitle, sideColor, sideOfSeat, theaterSeats, goalProgress, warEnded,
  swearTo, sendSupport, supportCost, supportActive,
} from './war.js';
import { MINE_YIELD, leaseCost, ownsShare, leaseMine, hermitState, visitHermit, hermitAdvice, canBless, hermitBless, hermitGift } from './mines.js';
import { WEATHER_NAME, weatherKind } from './weather.js';
import { CHEATS, cheatOn, anyCheat, toggleCheat, cheatDo, teleport } from './cheats.js';
import { campGoods, buyAtCamp, campRecruits, hireAtCamp, CAMP_TEXT, townMercs, hireInTown } from './camps.js';
import { armsSVG } from './heraldry.js';
import { mpRoster, seatName } from './mp.js';
import { PVP_NAMES, pvpPlayers, pvpDeclareFeud, pvpOffer, pvpAccept, pvpDecline, pvpEndAlliance, pvpGift, GIFTS } from './pvp.js';
import {
  BARONS, baron, ranking, baronStatus, baronNews, traitName, SIDE_NAME, difficulty, BARON_GIFT, giftBlock, baronGiveGift, allianceBlock, offerAlliance,
  feudBlock, declareFeud, peaceBlock, peaceCost, makePeace, baronIncome, baronUpkeep, baronShires, baronStrength, baronDefense, menCap, baronSiegeBlock,
} from './barons.js';
import { SHIRES, HOME_SHIRE, shireOfSite, shireName, shireSites, shireOwner, ownerName, ownerPhrase, ownerColor, shireTax } from './shires.js';

export function byId(id) { return document.getElementById(id); }

export function esc(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const fmt = (n) => Math.round(n).toLocaleString('de-DE');

// ---------------------------------------------------------------- Kopfleiste & Meldungen
export function updateHUD() {
  const s = G.s;
  if (!s) return;
  const set = (id, v) => { const el = byId(id); if (el && el.textContent !== String(v)) el.textContent = v; };
  set('hud-gold', fmt(s.gold));
  set('hud-renown', fmt(s.renown));
  set('hud-party', `${partyMembers().length}/${partyCap()}`);
  set('hud-cargo', `${cargoUsed()}/${cargoCap()}`);
  set('hud-hp', `${Math.ceil(s.player.hp)}/${s.player.st.maxHp}`);
  const wn = WEATHER_NAME[weatherKind()];
  set('hud-date', `Tag ${s.day} · ${SEASONS[seasonIndex()]} ${yearOf()}${wn ? ` · ${wn}` : ''}${buffActive() ? ' · ausgeruht' : ''}`);
  set('hud-clock', clockText());
  const mode = byId('hud-mode');
  const label = [G.fast ? 'Zeitraffer' : '', anyCheat() ? 'Testmodus' : ''].filter(Boolean).join(' · ');
  mode.hidden = !label;
  set('hud-mode', label);
  set('order-label', { folgen: 'Folgen', halten: 'Halten', angriff: 'Angriff' }[s.order]);
  const hpEl = byId('hud-hp-wrap');
  if (hpEl) hpEl.classList.toggle('low', s.player.hp < s.player.st.maxHp * 0.35);
  const ride = document.querySelector('[data-tool="ride"]');
  if (ride) ride.classList.toggle('on', !!s.player.mounted);
  const fast = document.querySelector('[data-tool="fast"]');
  if (fast) fast.classList.toggle('on', G.fast);
  const now = performance.now();
  for (const el of byId('log').children) el.classList.toggle('old', now - Number(el.dataset.t) > 25000);
}

export function renderLog() {
  const el = byId('log');
  const msgs = G.messages.slice(-8);
  if (G.ui && G.ui.panel === 'chronik') refreshPanel();
  el.innerHTML = msgs.map((m) => `<p class="msg ${m.kind}" data-t="${m.t}" title="Chronik öffnen (N)">${esc(m.text)}</p>`).join('');
}

export function showPrompt(text) {
  const el = byId('prompt');
  if (!text) { el.hidden = true; return; }
  el.hidden = false;
  if (el.dataset.text !== text) { el.dataset.text = text; el.innerHTML = text; }
}

// ---------------------------------------------------------------- Dialog
let dialogYes = null, dialogNo = null;
export function confirmDialog(text, yesLabel, onYes, onNo = null) {
  byId('dialog-text').textContent = text;
  byId('dialog-yes').textContent = yesLabel;
  dialogYes = onYes; dialogNo = onNo;
  byId('dialog').hidden = false;
  byId('dialog-yes').focus();
}
export function dialogOpen() { return !byId('dialog').hidden; }
export function closeDialog(accept) {
  byId('dialog').hidden = true;
  const f = dialogYes, n = dialogNo;
  dialogYes = null; dialogNo = null;
  if (accept && f) f();
  else if (!accept && n) n();
}

// ---------------------------------------------------------------- Tafeln
const DEFAULT_TAB = { town: 'info', castle: 'ausbau', party: 'gefolge', quests: 'list', politics: 'list', map: 'map', menu: 'menu', help: 'help', chronik: 'alle', victory: 'v', cheat: 'c', siege: 's', camp: 'c' };

export function openPanel(kind, arg = null, tab = null) {
  // Die Burg deiner Grafschaft (Mehrspieler) ist deine Heimburg: dieselbe Tafel wie in Ashcombe
  if (kind === 'town' && arg && isHomeBase(arg)) { kind = 'castle'; arg = null; tab = null; }
  G.ui.panel = kind;
  G.ui.arg = arg;
  G.ui.tab = tab || DEFAULT_TAB[kind];
  if (kind === 'party' && !G.ui.sel) G.ui.sel = G.s.player.id;
  if (kind === 'town' && arg) refreshTownQuests(arg);
  byId('panel').hidden = false;
  byId('panel').dataset.kind = kind;
  renderPanel();
  byId('panel-body').scrollTop = 0;
}

export function closePanel() {
  G.ui.panel = null;
  byId('panel').hidden = true;
}

export function panelOpen() { return !!G.ui.panel; }

// Aus anderen Modulen (pvp.js): offene Tafel neu zeichnen
G.uiRefresh = () => { if (G.ui && G.ui.panel) refreshPanel(); };
export function refreshPanel() {
  if (!G.ui.panel) return;
  const body = byId('panel-body');
  const top = body.scrollTop;
  renderPanel();
  body.scrollTop = top;
}

function renderPanel() {
  const k = G.ui.panel;
  const out = ({
    town: townPanel, castle: castlePanel, party: partyPanel, quests: questsPanel, politics: politicsPanel,
    map: mapPanel, menu: menuPanel, help: helpPanel, chronik: chronikPanel, victory: victoryPanel, cheat: cheatPanel, siege: siegePanel, camp: campPanel,
  })[k]();
  byId('panel-title').textContent = out.title;
  byId('panel-sub').innerHTML = out.sub || '';
  byId('panel-tabs').innerHTML = (out.tabs || []).map(([id, label]) => `<button class="tab${id === G.ui.tab ? ' active' : ''}" data-act="tab" data-tab="${id}">${esc(label)}</button>`).join('');
  byId('panel-tabs').hidden = !(out.tabs && out.tabs.length > 1);
  byId('panel-body').innerHTML = out.body;
  if (out.after) out.after();
}

// ---------------------------------------------------------------- Bausteine
function goldChip(n) { return `<span class="chip gold">${fmt(n)} Gold</span>`; }
function costChips(cost) {
  return Object.entries(cost).map(([k, v]) => {
    const have = k === 'gold' ? G.s.gold : (G.s.castle.storage[k] || 0) + (G.s.cargo[k] || 0);
    const name = k === 'gold' ? 'Gold' : GOODS[k].name;
    return `<span class="chip ${have >= v ? 'ok' : 'miss'}">${fmt(v)} ${name}</span>`;
  }).join('');
}
function repPill(f) {
  const v = G.s.rep[f];
  const st = repStatus(v);
  return `<span class="pill ${st.cls}">${st.label} · ${v > 0 ? '+' : ''}${v}</span>`;
}
// „bei den Sachsen“, aber „bei der Kirche“, „bei der Gilde“
function beiFaction(f) { const n = FACTIONS[f].short; return n === 'Kirche' || n === 'Gilde' ? `bei der ${n}` : `bei den ${n}`; }
function swatch(f) { return f ? `<span class="swatch" style="--c:${FACTIONS[f].color}"></span>` : ''; }

function itemStats(id) {
  const it = ITEMS[id];
  const p = [];
  if (it.atk) p.push(`Angriff ${it.atk}`);
  if (it.def) p.push(`Schutz ${it.def}`);
  if (it.ranged) p.push(`Reichweite ${it.range}`);
  if (it.slot === 'waffe' && !it.ranged && it.range > 1.3) p.push('lange Reichweite');
  if (it.speed) p.push(`Tempo +${Math.round(it.speed * 100)} %`);
  if (it.slow) p.push(`Tempo −${Math.round(it.slow * 100)} %`);
  if (it.twoHanded) p.push('beidhändig');
  return p.join(' · ');
}


function questCard(q, buttons) {
  const s = siteById(q.from);
  const r = q.reward;
  return `<article class="quest">
    <header><b>${esc(q.title)}</b>${swatch(q.faction)}<span class="muted">${esc(s.name)}</span></header>
    <p>${esc(q.desc)}</p>
    <div class="chips">${goldChip(r.gold)}<span class="chip">Ansehen +${r.rep}</span><span class="chip">Ruhm +${r.renown}</span>${q.deadline ? `<span class="chip">Frist Tag ${q.deadline}</span>` : `<span class="chip">${q.days} Tage Zeit</span>`}</div>
    ${buttons ? `<div class="row">${buttons}</div>` : ''}
  </article>`;
}

// ---------------------------------------------------------------- Siedlung
function townPanel() {
  const site = G.ui.arg;
  if (site.type === 'einsiedelei') return hermitPanel(site);
  if (isAbandoned(site)) return abandonedPanel(site);
  if (isHeld(site)) return holdingPanel(site);
  if (siegeAt(site) && G.siege.stage !== 'anmarsch') return siegePanel();
  const f = site.faction;
  const town = G.s.towns[site.id];
  const shire = shireOfSite(site);
  const sub = site.baron && BARONS[site.baron]
    ? `${esc(siteTypeName(site))} · <span class="swatch" style="--c:${BARONS[site.baron].color}"></span>${esc(BARONS[site.baron].name)} · ${esc(baronStatus(site.baron))}${shire ? ` · Grafschaft ${esc(shireName(shire))}` : ''}`
    : `${esc(siteTypeName(site))} · ${swatch(f)}${esc(FACTIONS[f].name)} · ${repPill(f)}${shire ? ` · ${SHIRES[site.id] ? 'Sitz der Grafschaft' : 'Grafschaft'} ${esc(shireName(shire))}` : ''}`;
  if (isHostileFaction(f) && !site.baron) {
    return {
      title: site.name, sub, tabs: [],
      body: `<div class="notice bad"><p>Die Wachen von ${esc(site.name)} verwehren dir den Zutritt. Die ${esc(FACTIONS[f].name)} sind dir feindlich gesinnt.</p><p>Erledige Aufträge für ihre Freunde, mach Geschenke an verbündete Höfe oder meide ihre Rivalen, damit sich das wieder ändert.</p></div><div class="actions">${letterActions(site, 'den Herrn der Stadt; die Torwache reicht ihn weiter, auch wenn sie dich nicht einlässt')}${siegeAt(site) ? siegeActions() : ''}${besiegeActions(site)}${site.port ? harbourActions(site) : ''}${blightActions(site)}${raidAction(site)}</div>`,
    };
  }
  const tabs = [['info', 'Übersicht'], ['markt', 'Markt'], ['waren', 'Ausrüster'], ['auftraege', `Aufträge (${town.quests.length + relevantQuests(site).length})`]];
  let body = '';
  if (G.ui.tab === 'info') body = (SHIRES[site.id] ? shireCard(site.id) : '') + townInfo(site);
  if (G.ui.tab === 'markt') body = marketTable(site);
  if (G.ui.tab === 'waren') body = shopView(site);
  if (G.ui.tab === 'auftraege') body = townQuests(site);
  return { title: site.name, sub, tabs, body };
}

function townInfo(site) {
  const f = site.faction;
  const list = (arr) => arr.map((g) => GOODS[g].name).join(', ') || 'nichts Besonderes';
  return `<div class="cols">
    <div>
      <p class="lede">${esc(site.desc)}</p>
      <dl class="facts">
        <dt>Herrschaft</dt><dd>${site.baron && BARONS[site.baron] ? `<span class="swatch" style="--c:${BARONS[site.baron].color}"></span>${esc(BARONS[site.baron].name)} <span class="muted">(steht zu den ${esc(FACTIONS[f].short)})</span>` : `${swatch(f)}${esc(FACTIONS[f].name)}`}</dd>
        <dt>Dein Ansehen</dt><dd>${repPill(f)}</dd>
        <dt>Billig zu haben</dt><dd>${list(site.produces)}</dd>
        <dt>Gesucht</dt><dd>${list(site.demands)}</dd>
        ${buildFact(site)}
      </dl>
    </div>
    <div class="actions">
      ${site.baron ? baronAudience(site) : ''}
      ${letterActions(site)}
      ${siegeAt(site) ? siegeActions() : ''}
      ${besiegeActions(site)}
      <h3>Am Hof</h3>
      <div class="action"><div><b>Geschenk an den Herrn</b><p>Ein Fass Wein, ein Ballen Tuch. Ansehen ${esc(beiFaction(f))} +3 bis +5, ihre Rivalen sehen das weniger gern. Einmal am Tag.</p></div><button class="btn" data-act="gift" ${G.s.towns[site.id].giftDay === G.s.day ? 'disabled' : ''}>${fmt(giftCost(site))} Gold</button></div>
      <div class="action"><div><b>Rasten</b><p>Vier Stunden ausruhen. Du und dein Gefolge kommen wieder zu Kräften.</p></div><button class="btn" data-act="rest">Rasten</button></div>
      ${mineAction(site)}
      ${townMercActions(site)}
      ${tourneyAction(site)}
      ${tavernAction(site)}
      ${harbourActions(site)}
      ${blightActions(site)}
      ${raidAction(site)}
    </div>
  </div>`;
}

// ---------------------------------------------------------------- Erobern und Halten (holdings.js)
// Vor einer Grafschaftsburg: ein Aufgebot zusammenrufen und belagern
function garrisonGuess() { return Math.round(10 + 8 * ((G.fpsAvg || 60) >= 40 ? 1 : 0.6)); }
function besiegeActions(site) {
  if (site.type !== 'burg' || !SHIRES[site.id] || isHeld(site) || siegeAt(site)) return '';
  const why = besiegeBlock(site), helpers = siegeHelpers(site), sh = SHIRES[site.id], fs = FACTIONS[site.faction].short;
  const home = site.id === HOME_SHIRE;
  const help = helpers.length ? ` Deine Verbündeten schicken Männer: ${helpers.map((h) => `${h.n} ${esc(FACTIONS[h.f].short)}`).join(', ')}.` : '';
  return `<h3>Burg belagern</h3>
    <div class="notice${home ? ' good' : ''}">
      ${home ? `<p><b>Hier sitzt Prinz Johns Vogt.</b> Pontefract ist der Sitz deiner Grafschaft. Nimmst du die Burg, gehört dir das ${esc(sh.name)} wieder, und die Abgaben an den Vogt entfallen.</p>` : ''}
      <p>Mit einem Aufgebot aus Söldnern und deinem Gefolge ziehst du vor ${esc(site.name)}.${help} Das Trebuchet bricht eine Bresche in die Mauer, auf dein Zeichen wird gestürmt. Die Besatzung zählt rund ${garrisonGuess()} Mann.</p>
      <p>Fällt die Burg, gehören dir Burg und Grafschaft <b>${esc(sh.name)}</b> mit ${fmt(shireTax(site.id))} Gold Abgaben am Tag. ${esc(sh.text)} Die überlebenden Söldner bleiben als Besatzung. Ansehen bei den ${esc(fs)} −25 sofort und −15 beim Fall, ihre Feinde freut es.</p>
      ${why ? `<p class="muted">${esc(why)}</p>` : ''}
    </div>
    ${LEVIES.map((l) => `<div class="action"><div><b>${esc(l.name)}: ${l.n} Söldner</b><p>Handgeld für ${l.n} Mann (je ${MERC_COST} Gold) und das Belagerungsgerät mit Trebuchet (${SIEGE_GEAR} Gold).</p></div><button class="btn danger" data-act="besiege" data-n="${l.n}" ${besiegeBlock(site, l.n) ? 'disabled' : ''}>${fmt(levyCost(l.n))} Gold</button></div>`).join('')}`;
}

// Eine eroberte Burg: Kastellan, Vorgabe, Besatzung, Ausbau
function holdingPanel(site) {
  const h = holdingOf(site), sh = SHIRES[site.id];
  const tabs = [['info', 'Burg'], ['markt', 'Markt'], ['waren', 'Ausrüster']];
  if (!tabs.some(([t]) => t === G.ui.tab)) G.ui.tab = 'info';
  let body = '';
  if (G.ui.tab === 'info') body = holdingInfo(site, h);
  if (G.ui.tab === 'markt') body = marketTable(site);
  if (G.ui.tab === 'waren') body = shopView(site);
  return { title: site.name, sub: `Deine Burg · ${ownerSwatch('spieler')}Grafschaft ${esc(sh.name)} · erobert an Tag ${h.since}`, tabs, body };
}
function holdingInfo(site, h) {
  const sh = SHIRES[site.id], c = castellanOf(h), eff = holdingEff(h), from = h.from;
  const nw = nextWork(h), done = worksDone(h);
  const sg = siegeAt(site);
  const besieged = sg ? `<div class="notice bad"><p><b>${esc(site.name)} wird belagert!</b> ${esc(siegeStageText(sg))} Die Besatzung hält ${sg.def ? `mit ${sg.def.members.length} Mann ` : ''}die Mauer. Am Tor lassen dich deine Wachen durch die Pforte ein (E).</p></div>` : '';
  const who = c ? `<div class="notice good"><p><b>${esc(c.name)}</b> (${esc(CLASSES[c.cls].name)}, Stufe ${c.level}) ist Kastellan und führt die Burg mit ${Math.round(eff * 100)} % der Kraft. Mit jedem Tag lernt er dazu.</p></div><div class="action"><div><b>Kastellan abberufen</b><p>Ein gedungener Burgvogt übernimmt (${Math.round(holdingEff({}) * 100)} %, 6 Gold am Tag).</p></div><button class="btn" data-act="hrecall">Abberufen</button></div>`
    : `<div class="notice"><p>Ein gedungener Burgvogt führt die Geschäfte, mehr schlecht als recht: ${Math.round(eff * 100)} % der Kraft, 6 Gold Lohn am Tag. Ein eigener Gefolgsmann macht es besser, und je erfahrener er ist, desto mehr.</p></div>`;
  const party = partyMembers();
  const cand = party.length ? party.map((u) => `<div class="action"><div><b>${esc(u.name)}</b><p>${esc(CLASSES[u.cls].name)} · Stufe ${u.level}: führt die Burg mit ${Math.min(180, Math.round((1 + (u.level - 1) * 0.1) * 100))} %, verlässt dafür dein Gefolge.</p></div><button class="btn" data-act="hcast" data-u="${u.id}">${c ? 'Statt dessen einsetzen' : 'Als Kastellan einsetzen'}</button></div>`).join('')
    : '<p class="muted">Niemand aus deinem Gefolge ist bei dir, den du einsetzen könntest.</p>';
  const orders = ORDER_IDS.map((id) => {
    const o = ORDERS[id], cur = h.order === id;
    const share = Math.round((1 - o.keep) * 100);
    const extra = o.wood ? ` Täglich etwa ${Math.round(o.wood * eff)} Holz.` : '';
    return `<div class="action${cur ? ' current' : ''}"><div><b>${esc(o.name)}${cur ? ' · gilt jetzt' : ''}</b><p>${esc(o.text)}${extra} An dich gehen ${share} % der Abgaben.</p></div><button class="btn${cur ? '' : ' primary'}" data-act="horder" data-o="${id}" ${cur ? 'disabled' : ''}>${cur ? 'Gewählt' : 'Vorgeben'}</button></div>`;
  }).join('');
  const rc = repairCostHolding(h), wc = workCost(h);
  return `${besieged}<div class="cols">
    <div>
      <p class="lede">Dein Banner weht über ${esc(site.name)}. ${from ? `Die ${esc(FACTIONS[from].short)} haben die Burg verloren und wollen sie zurück.` : ''}</p>
      <dl class="facts">
        <dt>Grafschaft</dt><dd>${esc(sh.name)}: ${esc(sh.text)}</dd>
        <dt>Abgaben</dt><dd>${fmt(shireTax(site.id))} Gold am Tag, davon an dich ${fmt(holdingIncome(site.id))}</dd>
        <dt>Besatzung</dt><dd>${h.garrison} Mann${h.garrison < ORDERS[h.order].cap ? `, der Kastellan wirbt bis ${ORDERS[h.order].cap} nach` : ''}</dd>
        <dt>Zustand</dt><dd>${h.dmg > 0 ? `<span class="warn">Schäden ${Math.round(h.dmg * 100)} %</span>, wird ausgebessert` : 'unversehrt'}</dd>
        <dt>Burg</dt><dd>${h.level >= 3 ? 'Festung' : 'Steinburg'}${done.length ? ` mit ${done.map((w) => esc(w.name)).join(', ')}` : ''}</dd>
        <dt>Im Bau</dt><dd>${nw ? `${esc(nw.name)}: ${Math.floor(h.progress)} von ${nw.need}${ORDERS[h.order].works ? '' : ' (ruht bei dieser Vorgabe)'}` : 'Alles fertig gebaut.'}</dd>
        <dt>Verteidigung</dt><dd><b>${holdingDefense(h)}</b> · Angriffe rechnen derzeit mit rund ${Math.round(counterStrength())}</dd>
        ${from ? `<dt>Frühere Herren</dt><dd>${swatch(from)}${esc(FACTIONS[from].name)} · ${repPill(from)}</dd>` : ''}
      </dl>
    </div>
    <div class="actions">
      <h3>Kastellan</h3>
      ${who}
      ${cand}
      <h3>Vorgabe</h3>
      ${orders}
      <h3>Selbst Hand anlegen</h3>
      ${h.dmg > 0 ? `<div class="action"><div><b>Sofort instand setzen</b><p>Zimmerleute und Maurer aus der Stadt beheben alle Schäden auf einmal.</p></div><button class="btn" data-act="hrepair" ${G.s.gold < rc ? 'disabled' : ''}>${fmt(rc)} Gold</button></div>` : ''}
      <div class="action"><div><b>Besatzung verstärken</b><p>${RECRUIT.n} Söldner ziehen gleich ein (höchstens ${RECRUIT.max} Mann).</p></div><button class="btn" data-act="hrecruit" ${G.s.gold < RECRUIT.cost || h.garrison >= RECRUIT.max ? 'disabled' : ''}>${fmt(RECRUIT.cost)} Gold</button></div>
      ${nw ? `<div class="action"><div><b>${esc(nw.name)} bezahlen</b><p>${esc(nw.text)} +${nw.def} Verteidigung.${h.dmg > 0 ? ' Erst müssen die Schäden behoben sein.' : ''}</p></div><button class="btn" data-act="hwork" ${G.s.gold < wc || h.dmg > 0 ? 'disabled' : ''}>${fmt(wc)} Gold</button></div>` : ''}
      <h3>Am Ort</h3>
      <div class="action"><div><b>Rasten</b><p>Vier Stunden ausruhen. Du und dein Gefolge kommen wieder zu Kräften.</p></div><button class="btn" data-act="rest">Rasten</button></div>
      ${tavernAction(site)}
      ${harbourActions(site)}
    </div>
  </div>`;
}

// Briefe für diesen Ort: überall abzugeben, wo man ankommt, auch beim Einsiedler, in der Grube,
// in einem verlassenen Ort, am Tor einer feindlichen oder in einer belagerten Stadt
const LETTER_TO = { einsiedelei: 'den Einsiedler', mine: 'den Steiger der Grube', lager: 'den Anführer der Waldleute' };
function letterActions(site, who = null) {
  const qs = G.s.quests.filter((q) => q.type === 'bote' && q.target === site.id);
  if (!qs.length) return '';
  const to = who || LETTER_TO[site.type] || `den Herrn von ${site.name}`;
  return `<h3>Botschaft</h3>${qs.map((q) => `<div class="action"><div><b>${esc(q.title)}</b><p>Der versiegelte Brief aus ${esc(siteById(q.from).name)} ist bestimmt für ${esc(to)}. Belohnung ${fmt(q.reward.gold)} Gold und Ansehen ${esc(beiFaction(q.faction))}.</p></div><button class="btn primary" data-act="letter" data-q="${q.id}">Brief übergeben</button></div>`).join('')}`;
}

// Ein geplünderter Ort: leer, kein Markt, kein Gasthaus. Mit Sühne kehren die Leute früher zurück.
function abandonedPanel(site) {
  const back = G.s.abandoned[site.id];
  return {
    title: site.name, sub: `${esc(siteTypeName(site))} · verlassen`, tabs: [],
    body: `<div class="notice bad"><p>Die Türen stehen offen, die Herdstellen sind kalt. Seit deinem Überfall wohnt in ${esc(site.name)} niemand mehr. Markt, Gasthaus und Werkstätten sind verlassen.</p><p>Erst um Tag ${back} wagen sich die ersten Leute zurück.</p></div>
      <div class="actions">${letterActions(site, 'die wenigen, die geblieben sind')}${blightActions(site)}${site.port ? harbourActions(site) : ''}</div>`,
  };
}

// Bautätigkeit im Ort
function buildFact(site) {
  const hs = siteHouses(site.id);
  if (!hs.length) return '';
  const bau = hs.filter(underConstruction).length, ruin = hs.filter((b) => b.cons === -1).length, dmg = hs.filter((b) => standing(b) && b.dmg > 0).length;
  const parts = [];
  if (bau) parts.push(`${bau} ${bau === 1 ? 'Baustelle' : 'Baustellen'}`);
  if (dmg) parts.push(`${dmg} beschädigt`);
  if (ruin) parts.push(`${ruin} ${ruin === 1 ? 'Ruine' : 'Ruinen'}`);
  return `<dt>Häuser</dt><dd>${hs.filter(standing).length} bewohnt${parts.length ? `, ${parts.join(', ')}` : ''}</dd>`;
}

// Erzgrube: Anteil pachten
function mineAction(site) {
  if (site.type !== 'mine') return '';
  const g = GOODS[site.ore].name, n = MINE_YIELD[site.ore];
  if (ownsShare(site)) return `<h3>Dein Anteil</h3><div class="notice"><p>Du bist an der Grube beteiligt. Jeden Morgen bringen Fuhrleute ${n} ${esc(g)} nach ${esc(homeName())}, solange die ${esc(FACTIONS[site.faction].short)} dir nicht feindlich sind.</p></div>`;
  const cost = leaseCost(site);
  return `<h3>Die Grube</h3><div class="action"><div><b>Anteil pachten</b><p>Ein Anteil am Ertrag: jeden Morgen ${n} ${esc(g)} frei Haus in dein Burglager. Im Markt der Grube gibt es ${esc(g)} schon jetzt billig.</p></div><button class="btn primary" data-act="lease" ${G.s.gold < cost ? 'disabled' : ''}>${fmt(cost)} Gold</button></div>`;
}

// Einsiedelei: Rat, Segen, Spende
const FEATURE_TEXT = { quelle: 'Eine Quelle sprudelt zwischen moosigen Steinen.', steine: 'Graue Steine stehen im Kreis, älter als jede Kirche.', grab: 'Ein uralter Grabhügel liegt im Gras, mit einem Tor aus Felsblöcken.', hoehle: 'In der Felswand öffnet sich eine Höhle, ein Kreuz ist in den Stein gehauen.', eibe: 'Eine uralte Eibe breitet ihre Äste aus, bunte Bänder hängen darin.' };
function hermitPanel(site) {
  visitHermit(site);
  const st = hermitState(site);
  const bless = canBless(site);
  return {
    title: site.name, sub: `${esc(siteTypeName(site))} · Einsiedelei`, tabs: [],
    body: `<div class="cols">
      <div><p class="lede">${esc(site.desc)}</p><p>${esc(FEATURE_TEXT[site.feature] || '')} Glühwürmchen tanzen hier in der Dämmerung, und es ist seltsam still.</p></div>
      <div class="actions">
        ${letterActions(site)}
        <h3>Beim Einsiedler</h3>
        <div class="action"><div><b>Um Rat fragen</b><p>Der Einsiedler sieht mehr, als man glaubt: ein Spruch und ein echter Hinweis. Einmal am Tag.</p></div><button class="btn" data-act="hrat" ${st.adviceDay === G.s.day ? 'disabled' : ''}>Fragen</button></div>
        <div class="action"><div><b>Segen erbitten</b><p>Heilkräuter und ein Segen: Du und dein Gefolge seid ganz geheilt, bis morgen Abend +10 % Angriff und Abwehr, +15 % Erfahrung. Alle drei Tage.</p></div><button class="btn primary" data-act="hsegen" ${bless ? '' : 'disabled'}>Segnen lassen</button></div>
        <div class="action"><div><b>Spende für die Armen</b><p>Brot, Salz und Münzen, die der Einsiedler weitergibt. Ansehen bei der Kirche +2, Ruhm +1. Einmal am Tag.</p></div><button class="btn" data-act="hspende" ${st.giftDay === G.s.day || G.s.gold < 20 ? 'disabled' : ''}>20 Gold</button></div>
      </div>
    </div>`,
  };
}

// Belagerung: Lage und Seitenwahl (im Feldlager oder in der belagerten Stadt)
function siegeStageText(sg) {
  if (sg.stage === 'anmarsch') return 'Das Heer ist auf dem Anmarsch.';
  const w = sg.walls;
  if (sg.stage === 'sturm') return w ? 'Sturm! Die Angreifer drängen durch die Bresche.' : 'Sturm! Die Angreifer rennen gegen die Verteidiger an.';
  if (!w) return 'Das Trebuchet beschießt die Häuser.';
  return w.st.open ? 'Die Mauer ist gebrochen, durch die Bresche sieht man in die Gassen.' : `Das Trebuchet hämmert auf die Mauer (Schaden ${Math.round((w.st.dmg || 0) * 100)} %).`;
}
function siegePanel() {
  const sg = G.siege, st = siegeStatus();
  if (!sg) return { title: 'Belagerung', tabs: [], body: '<div class="notice"><p>Die Belagerung ist vorbei.</p></div>' };
  const s = sg.site, off = sideOffer();
  const inside = G.ui.panel === 'town';
  if (sg.lead) {
    const allies = sg.army.members.filter((m) => m.ally).length;
    return {
      title: `Deine Belagerung von ${s.name}`,
      sub: `${ownerSwatch('spieler')}Dein Aufgebot gegen ${swatch(s.faction)}${esc(s.name)}`,
      tabs: [],
      body: `<div class="cols">
        <div>
          <p class="lede">Dein Feldlager vor ${esc(s.name)}: Zelte, Feuer und das Knarren des Trebuchets. ${esc(sg.stage === 'anmarsch' ? 'Dein Aufgebot ist noch auf dem Weg ins Lager.' : siegeStageText(sg))}</p>
          <dl class="facts">
            <dt>Dein Aufgebot</dt><dd><b>${st.att}</b> Mann${allies ? `, davon ${allies} von deinen Verbündeten` : ''}</dd>
            <dt>Besatzung</dt><dd>${swatch(s.faction)}${sg.def ? `<b>${st.def}</b> Mann` : 'hinter den Mauern'} · ${repPill(s.faction)}</dd>
            <dt>Zu gewinnen</dt><dd>Burg und Grafschaft ${esc(SHIRES[s.id] ? SHIRES[s.id].name : '')}</dd>
          </dl>
        </div>
        <div class="actions">${siegeActions()}</div>
      </div>`,
    };
  }
  return {
    title: `Belagerung von ${st.name}`,
    sub: `${swatch(off.fa)}${esc(st.army)} gegen ${swatch(off.fs)}${esc(s.name)}`,
    tabs: [],
    body: `<div class="cols">
      <div>
        <p class="lede">${inside ? `Die Tore von ${esc(s.name)} sind verrammelt, hinter der Mauer steht die Besatzung. ` : 'Zelte, Feuer und das Knarren des Trebuchets. '}${siegeStageText(sg)}</p>
        <dl class="facts">
          <dt>Belagerer</dt><dd>${swatch(off.fa)}${esc(st.army)}: <b>${st.att}</b> Mann · ${repPill(off.fa)}</dd>
          <dt>Verteidiger</dt><dd>${swatch(off.fs)}${sg.def ? `Besatzung: <b>${st.def}</b> Mann` : 'Die Besatzung hinter den Mauern'} · ${repPill(off.fs)}</dd>
        </dl>
      </div>
      <div class="actions">${inside ? letterActions(s) : ''}${siegeActions()}</div>
    </div>`,
  };
}

function siegeActions() {
  const sg = G.siege;
  if (!sg || isOwnSite(sg.site)) return '';
  if (sg.lead) {
    const s = sg.site;
    const storm = canCallStorm() ? `<div class="action"><div><b>Zum Sturm blasen</b><p>${sg.walls && !sg.walls.st.open ? 'Die Mauer hält noch. Auf dein Zeichen wirft das Trebuchet ohne Pause, und sobald die Bresche offen ist, stürmen alle.' : 'Die Bresche ist offen. Auf dein Zeichen stürmt das ganze Aufgebot.'}</p></div><button class="btn danger" data-act="ssturm">Sturm!</button></div>`
      : sg.stage === 'sturm' ? '<div class="notice bad"><p>Der Sturm läuft! Kämpf mit an der Bresche. Ist die Besatzung auf ein Viertel geschmolzen, streckt sie die Waffen.</p></div>'
        : sg.storm ? '<div class="notice"><p>Das Trebuchet wirft ohne Pause. Sobald die Bresche offen ist, stürmen alle.</p></div>' : '';
    return `<h3>Deine Belagerung</h3><div class="notice good"><p>Du führst das Aufgebot vor ${esc(s.name)}. Das Trebuchet bricht eine Bresche in die Mauer. Gib das Zeichen zum Sturm, wenn du bereit bist; nach vier Minuten stürmen die Söldner von selbst. Entfernst du dich weit, entscheidet sich die Belagerung ohne dich.</p></div>${storm}
      <div class="action"><div><b>Belagerung aufgeben</b><p>Die Söldner ziehen ab, das Handgeld ist fort.</p></div><button class="btn" data-act="sabort">Aufgeben</button></div>`;
  }
  const s = sg.site, off = sideOffer(), fa = FACTIONS[off.fa].short, fs = FACTIONS[off.fs].short;
  if (sg.side) {
    const storm = canCallStorm() ? `<div class="action"><div><b>Zum Sturm blasen</b><p>${sg.walls && !sg.walls.st.open ? 'Die Mauer hält noch. Auf dein Zeichen wirft das Trebuchet ohne Pause, und sobald die Bresche offen ist, stürmen alle.' : 'Der Hauptmann wartet auf dein Zeichen. Dann stürmen alle durch die Bresche.'}</p></div><button class="btn danger" data-act="ssturm">Sturm!</button></div>` : '';
    const what = sg.side === 'def'
      ? `Du kämpfst für ${esc(s.name)}. ${sg.walls ? 'Die Besatzung bleibt hinter der Mauer und hält die Bresche. Am Tor lassen dich die Wachen durch die Pforte ein und aus (E).' : 'Kämpf mit der Besatzung gegen das Heer.'} Hält die Stadt, dankt sie dir.`
      : `Du dienst im Heer vor ${esc(s.name)}. Die Besatzung greift dich an, wo sie dich sieht. Fällt die Stadt, bekommst du deinen Beuteanteil.`;
    return `<h3>Belagerung</h3><div class="notice ${sg.side === 'def' ? 'good' : ''}"><p>${what}</p></div>${storm}`;
  }
  const bD = sideBlock('def'), bA = sideBlock('att');
  return `<h3>Belagerung · wähle deine Seite</h3>
    <div class="action"><div><b>Den Verteidigern beistehen</b><p>${sg.walls ? 'Die Wachen lassen dich durch die Pforte im Tor ein (E). Die Besatzung bleibt hinter der Mauer, gemeinsam haltet ihr die Bresche.' : 'Du kämpfst mit der Besatzung gegen das Heer.'} Hält ${esc(s.name)}, dankt dir die Stadt mit etwa ${fmt(off.thanks)} Gold, Ansehen bei den ${esc(fs)} +10 und Ruhm +15. Die ${esc(fa)} sehen das ungern (−5, mehr, wenn du ihr Heer zerschlägst).</p>${bD ? `<p class="muted">${esc(bD)}</p>` : ''}</div><button class="btn primary" data-act="sdef" ${bD ? 'disabled' : ''}>Beistehen</button></div>
    <div class="action"><div><b>Den Belagerern dienen</b><p>Du kämpfst für ${esc(GROUP_TYPES[sg.army.type].acc)} und stürmst mit, die Besatzung greift dich an. Fällt ${esc(s.name)}, bekommst du einen Beuteanteil (etwa ${fmt(off.share)} Gold und Waren aus der Stadt) und Ansehen bei den ${esc(fa)} +8. Die ${esc(fs)} vergessen das nicht (−8 sofort, −6 beim Fall).</p>${bA ? `<p class="muted">${esc(bA)}</p>` : ''}</div><button class="btn danger" data-act="satt" ${bA ? 'disabled' : ''}>Dienen</button></div>
    <p class="muted">Oder du schaust nur zu. Entfernst du dich zu weit, entscheidet sich die Belagerung ohne dich.</p>`;
}

// Turnier: Ankündigung, Teilnehmer, Anmeldung
function tourneyAction(site) {
  const tr = tourneyAt(site);
  if (!tr) return '';
  const when = tr.day === G.s.day ? 'heute' : tr.day === G.s.day + 1 ? 'morgen' : `am Tag ${tr.day}`;
  const names = tr.knights.map((k) => `<span class="swatch" style="--c:${k.col}"></span>${esc(k.player ? `${G.s.player.name} (du)` : k.name)}`).join(', ');
  const p = G.s.player;
  let btn;
  if (tr.joined) btn = '<span class="chip">Angemeldet</span>';
  else if (!p.eq.pferd) btn = '<span class="chip">Ohne Pferd kein Tjost</span>';
  else btn = `<button class="btn primary" data-act="tjoin" ${canJoin(tr) ? '' : 'disabled'}>${fmt(tr.fee)} Gold</button>`;
  return `<h3>Turnier ${when}</h3>
    <div class="action"><div><b>Tjost vor den Toren</b><p>Acht Ritter, drei Runden, Lanzen und Schilde stellt der Herold. Preis: ${fmt(tr.prize)} Gold und viel Ruhm. Senke die Lanze im richtigen Moment. Ab der zehnten Stunde bei den Schranken sein!</p><p class="muted">${names}</p></div>${btn}</div>`;
}

// Wiederaufbau stiften oder nach einem Überfall Sühne leisten
function blightActions(site) {
  if (isBlighted(site)) {
    const cost = atoneCost(site), slain = G.s.slain[site.id] || 0;
    return `<h3>Nach dem Überfall</h3><div class="notice bad"><p>${esc(site.name)} liegt darnieder${slain ? `, ${slain} ${slain === 1 ? 'Bewohner ist' : 'Bewohner sind'} tot` : ''}. Bis Tag ${G.s.blight[site.id]} wird hier nichts gebaut und nichts repariert.</p></div>
      <div class="action"><div><b>Sühne leisten</b><p>Gold für die Hinterbliebenen und Messen für die Toten. Danach wird wieder gebaut. Ansehen ${esc(beiFaction(site.faction))} +10, Kirche +4.</p></div><button class="btn" data-act="atone" ${G.s.gold < cost ? 'disabled' : ''}>${fmt(cost)} Gold</button></div>`;
  }
  if (!canDonate(site)) return '';
  const cost = donateCost(site);
  return `<div class="action"><div><b>Wiederaufbau stiften</b><p>Bauholz, Stroh und Lohn für die Zimmerleute: Baustellen wachsen schneller, Ruinen werden neu bebaut, Schäden ausgebessert. Ansehen +4.</p></div><button class="btn" data-act="donate" ${G.s.gold < cost ? 'disabled' : ''}>${fmt(cost)} Gold</button></div>`;
}

function raidAction(site) {
  if (!raidable(site) || isAbandoned(site)) return '';
  const why = raidBlock(site);
  return `<h3>Gewalt</h3><div class="action"><div><b>Ort überfallen</b><p>Die Besatzung stellt sich dir, die Leute fliehen in ihre Häuser. Bei einem Sieg plünderst du Gold und Waren, Häuser gehen in Flammen auf, und die Bewohner verlassen den Ort. Danach ist das ganze Land für einige Tage gewarnt.</p>${why ? `<p class="muted">${esc(why)}</p>` : ''}</div><button class="btn danger" data-act="raid" ${why ? 'disabled' : ''}>Überfallen</button></div>`;
}

// Gasthaus: Übernachten mit Gefolge
function innCost() { return 4 + partyMembers().length * 3; }
function tavernAction(site) {
  if (!site.tavern) return '';
  const cost = innCost();
  return `<h3>${esc(site.tavern.name)}</h3>
    <div class="action"><div><b>Übernachten</b><p>Warmes Essen, Bier und Betten für dich und dein Gefolge. Ihr schlaft bis zum Morgen und seid danach ganz geheilt. Bis zum nächsten Abend seid ihr ausgeruht: +10 % Angriff und Abwehr, +15 % Erfahrung. Und der Wirt weiß immer etwas Neues.</p></div><button class="btn" data-act="inn" ${G.s.gold < cost ? 'disabled' : ''}>${fmt(cost)} Gold</button></div>`;
}

// Gerüchte des Wirts: echte Hinweise aus der Spielwelt
function rumor(site) {
  const opts = [];
  const bandit = G.groups.filter((g) => g.type === 'banditen' && g.members.length).sort((a, b) => Math.hypot(a.x - site.x, a.y - site.y) - Math.hypot(b.x - site.x, b.y - site.y))[0];
  if (bandit) opts.push(`Eine Bande Wegelagerer treibt sich ${dirText(site, bandit)} herum.`);
  const towns = G.world.sites.filter((t) => t.demands && t.demands.length && t.land === site.land && t !== site);
  if (towns.length) { const t = towns[Math.floor(Math.random() * towns.length)]; const g = t.demands[Math.floor(Math.random() * t.demands.length)]; opts.push(`In ${t.name} zahlen sie gerade gut für ${GOODS[g].name}.`); }
  const army = G.groups.find((g) => g.army && g.members.length);
  if (army) opts.push(`Man sagt, ein großes Heer zieht ${dirText(site, army)}.`);
  if (G.siege) opts.push(`${G.siege.site.type === 'spieler' ? homeName() : G.siege.site.name} wird belagert, heißt es.`);
  const tr = G.s.tourney;
  if (tr && !tr.done) { const ts = siteById(tr.site); opts.push(`Am Tag ${tr.day} ist Turnier in ${ts.name}. Da reiten die besten Lanzen des Landes!`); opts.push(`Ich wette zwei Pfennige auf ${tr.knights[Math.floor(Math.random() * tr.knights.length)].name} beim Turnier in ${ts.name}.`); }
  const rich = G.groups.find((g) => g.type === 'steuer' && g.members.length);
  if (rich) opts.push(`Ein Steuereintreiber ist mit voller Kasse ${dirText(site, rich)} unterwegs.`);
  return opts.length ? opts[Math.floor(Math.random() * opts.length)] : 'Es ist ruhig in letzter Zeit. Zu ruhig, wenn Ihr mich fragt.';
}

// Hafen: Überfahrten mit Preis und Dauer. Der Hafen liegt vor den Mauern und ist immer offen.
function harbourActions(site) {
  const routes = site.port ? ferryRoutes(site.id) : [];
  if (!routes.length) return '';
  return `<h3>Hafen</h3>${routes.map((r) => {
    const to = siteById(r.to), cost = ferryCost(r);
    return `<div class="action"><div><b>${esc(r.ship)} nach ${esc(to.name)}</b><p>${r.hours} Stunden auf See, mit Gefolge und Pferden. ${cost ? `Fährlohn ${fmt(cost)} Gold.` : 'Für Freunde der Krone Frankreichs kostenlos.'}</p></div><button class="btn" data-act="sail" data-to="${r.to}" ${G.s.gold < cost ? 'disabled' : ''}>Ablegen</button></div>`;
  }).join('')}`;
}

// Was beim Verkauf des ganzen Lagers liegen bleibt: Nahrung für sieben Tage
function storeKeep(g) { return FOOD_GOODS.includes(g) ? Math.ceil((foodNeed() * 7) / FOOD_GOODS.length) : 0; }
function marketTable(site) {
  const town = G.s.towns[site.id];
  const rows = GOOD_IDS.map((g) => {
    const tag = site.produces.includes(g) ? '<span class="tag cheap">billig</span>' : site.demands.includes(g) ? '<span class="tag dear">gefragt</span>' : '';
    const have = G.s.cargo[g] || 0, stored = G.s.castle.storage[g] || 0;
    return `<tr>
      <th scope="row">${wareIcon(g)}${GOODS[g].name} ${tag}</th>
      <td class="num">${town.stock[g]}</td>
      <td class="num">${buyPrice(site, g)}</td>
      <td class="btns"><button class="btn sm" data-act="buy" data-good="${g}" data-n="1">+1</button><button class="btn sm" data-act="buy" data-good="${g}" data-n="5">+5</button></td>
      <td class="num">${sellPrice(site, g)}</td>
      <td class="btns"><button class="btn sm" data-act="sell" data-good="${g}" data-n="1" ${have ? '' : 'disabled'}>−1</button><button class="btn sm" data-act="sell" data-good="${g}" data-n="all" ${have ? '' : 'disabled'}>alle</button></td>
      <td class="num strong">${have}</td>
      <td class="num">${stored}</td>
      <td class="btns"><button class="btn sm" data-act="sellstore" data-good="${g}" ${stored ? '' : 'disabled'} title="Alles davon aus dem Burglager verkaufen, je ${storedSellPrice(site, g)} Gold">verkaufen</button></td>
    </tr>`;
  }).join('');
  const storeVal = GOOD_IDS.reduce((a, g) => a + Math.max(0, (G.s.castle.storage[g] || 0) - storeKeep(g)) * storedSellPrice(site, g), 0);
  return `<p class="meta">Ladung <b>${cargoUsed()}/${cargoCap()}</b> · Gold <b>${fmt(G.s.gold)}</b>${isAlly('gilde') ? ' · Gildenrabatt aktiv' : ''}</p>
  <div class="table-wrap"><table class="market">
    <thead><tr><th>Ware</th><th>Vorrat</th><th>Kauf</th><th></th><th>Verkauf</th><th></th><th>Ladung</th><th>Lager</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <div class="row"><button class="btn" data-act="sellstoreall" ${storeVal ? '' : 'disabled'}>Lager verkaufen (etwa ${fmt(storeVal)} Gold)</button></div>
  <p class="hint">Aus dem Burglager verkaufen: Händler holen die Ware ab und behalten ein Zehntel als Fuhrlohn. „Lager verkaufen“ lässt Getreide und Fleisch für sieben Tage am Tisch liegen.</p>
  <p class="hint">Was hier billig ist, ist anderswo gefragt. Die Preise ändern sich mit jedem Verkauf.</p>`;
}

function shopView(site) {
  const items = shopItems(site);
  const offer = items.length ? items.map((id) => `<div class="item"><div><b>${ITEMS[id].name}</b><span class="muted">${SLOT_NAME[ITEMS[id].slot]} · ${itemStats(id)}</span></div><button class="btn" data-act="buyitem" data-id="${id}" ${G.s.gold >= itemBuyPrice(site, id) ? '' : 'disabled'}>${fmt(itemBuyPrice(site, id))} Gold</button></div>`).join('') : '<p class="muted">Hier gibt es nichts zu kaufen.</p>';
  return `<div class="cols">
    <div><h3>Angebot</h3><div class="items">${offer}</div></div>
    <div><h3>Deine Truhe</h3>${chestList(true)}</div>
  </div>`;
}

function chestList(sellable) {
  if (!G.s.inventory.length) return '<p class="muted">Die Truhe ist leer. Beute und Einkäufe landen hier.</p>';
  return `<div class="items">${G.s.inventory.map((id, i) => `<div class="item"><div><b>${ITEMS[id].name}</b><span class="muted">${SLOT_NAME[ITEMS[id].slot]} · ${itemStats(id)}</span></div>${sellable ? `<button class="btn" data-act="sellitem" data-i="${i}">${itemSellPrice(id)} Gold</button>` : ''}</div>`).join('')}</div>`;
}

function relevantQuests(site) {
  return G.s.quests.filter((q) => (q.from === site.id && (q.type === 'lieferung' || q.state === 'erfuellt')) || (q.type === 'bote' && q.target === site.id));
}

function townQuests(site) {
  const town = G.s.towns[site.id];
  const mine = relevantQuests(site).map((q) => {
    let btn = '';
    if (q.type === 'bote' && q.target === site.id) btn = `<button class="btn primary" data-act="letter" data-q="${q.id}">Brief übergeben</button>`;
    else if (q.state === 'erfuellt') btn = `<button class="btn primary" data-act="claim" data-q="${q.id}">Belohnung abholen</button>`;
    else if (q.type === 'lieferung') btn = `<button class="btn primary" data-act="deliver" data-q="${q.id}" ${canDeliver(q) ? '' : 'disabled'}>${canDeliver(q) ? 'Liefern' : `Du hast ${G.s.cargo[q.good] || 0}/${q.qty}`}</button>`;
    return questCard(q, btn);
  }).join('');
  const offers = town.quests.map((q) => questCard(q, `<button class="btn" data-act="accept" data-q="${q.id}">Annehmen</button>`)).join('');
  return `${mine ? `<h3>Deine Aufträge hier</h3><div class="quests">${mine}</div>` : ''}
    <h3>Angebote</h3>
    ${offers ? `<div class="quests">${offers}</div>` : '<p class="muted">Im Moment gibt es hier nichts zu tun. Schau in ein paar Tagen wieder vorbei.</p>'}`;
}

// ---------------------------------------------------------------- Burg
function castlePanel() {
  const f = G.ui.arg && G.ui.arg.focus;
  if (f === 'plot') return plotPanel(G.ui.arg.plot);
  const tabs = [['ausbau', 'Ausbau'], ['halle', 'Rittersaal'], ['gefolge', 'Gefolge'], ['lager', 'Lager']];
  // Die Grafschaftsburg hat Markt und Ausrüster ihrer Stadt; in Ashcombe kommen sie mit Schmiede, Stall und Markt
  const seat = !!seatSite();
  if (seat || bLevel('schmiede') || bLevel('stall')) tabs.push(['ruest', seat ? 'Ausrüster' : 'Rüstkammer']);
  if (seat || bLevel('markt')) tabs.push(['markt', 'Markt']);
  const site = castleSite();
  let body = '';
  switch (G.ui.tab) {
    case 'ausbau': body = homeShireNote() + gateAction() + castleBuild(); break;
    case 'halle': body = castleHall(); break;
    case 'gefolge': body = partyView(true); break;
    case 'lager': body = castleStore(); break;
    case 'ruest': body = shopView(site); break;
    case 'markt': body = marketTable(site); break;
    default: body = castleBuild();
  }
  const cb = CASTLE_BONUS[G.s.castle.level];
  return { title: `Burg ${homeName()}`, sub: `${G.s.arms ? `<span class="arms-mini">${armsSVG(G.s.arms, 22, 'Dein Wappen')}</span>` : ''}${esc(levelName())} · Verteidigung ${castleDefense()} · In den Mauern +${Math.round(cb.atk * 100)} % Angriff, +${Math.round(cb.def * 100)} % Abwehr · Ruhm ${fmt(G.s.renown)}`, tabs, body };
}

// Ein einzelnes Burggebäude (Klick auf Gebäude oder Bauplatz in der Burg)
const FOCUS_TAB = { halle: ['halle', 'Anwerben'], kaserne: ['gefolge', 'Gefolge'], schmiede: ['ruest', 'Rüstkammer'], stall: ['ruest', 'Rüstkammer'], markt: ['markt', 'Markt'] };
// Klick auf ein Gebäude: gleich die passende Tafel (Rittersaal: Anwerben, Schmiede: Rüstkammer …)
export function castleFocusTab(i) { const b = castlePlots()[i]; return b && !b.dmg && bLevel(b.id) && FOCUS_TAB[b.id] ? FOCUS_TAB[b.id][0] : 'ausbau'; }
function conNote(con) {
  if (!con) return '';
  const what = con.id === 'burg' ? BUILDINGS.burg.levels[con.level].name : con.id === 'umbau' ? `Umbau zur ${CASTLE_TYPES[con.type].name}` : con.repair ? `${BUILDINGS[con.id].name} ausbessern` : `${BUILDINGS[con.id].name} Stufe ${con.level}`;
  return `<div class="notice"><b>Im Bau:</b> ${esc(what)}, fertig an Tag ${con.done}.<div class="progress" role="progressbar" aria-valuenow="${Math.round(conProgress() * 100)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.round(conProgress() * 100)}%"></span></div></div>`;
}
// Tafel eines Bauplatzes: frei (welche Gebäude passen hierher?) oder belegt (Ausbau, Ausbessern, Abreißen)
function plotPanel(i) {
  const plots = castlePlots(), lay = castleLayout(), p = lay[i], b = plots[i], con = G.s.castle.construction;
  if (!p) return { title: 'Bauplatz', sub: '', tabs: [], body: '<p class="muted">Diesen Bauplatz gibt es nicht mehr.</p>' };
  const site = castleSite(), where = p.inner ? 'im Hof (geschützt)' : 'vor der Mauer';
  const tabs = [['ausbau', b ? 'Ausbau' : 'Bauplatz']];
  if (b && !b.dmg && FOCUS_TAB[b.id]) tabs.push(FOCUS_TAB[b.id]);
  let body = '';
  switch (G.ui.tab) {
    case 'halle': body = castleHall(); break;
    case 'gefolge': body = partyView(true); break;
    case 'ruest': body = shopView(site); break;
    case 'markt': body = marketTable(site); break;
    default: {
      const note = con && con.plot === i ? conNote(con) : con ? `<div class="notice"><p>Die Bauleute sind gerade anderswo beschäftigt. Erst danach kann hier gebaut werden.</p></div>` : '';
      if (!b) {
        const ids = PLOT_BUILDINGS.filter((id) => !(OUTER_ONLY[id] && p.inner));
        const here = ids.filter((id) => STACKABLE[id] || !plots.some((q) => q && q.id === id));
        body = `${note}<p class="muted">${p.inner ? 'Ein Platz im Hof, 2 × 2 Felder, geschützt hinter der Mauer: Was hier steht, arbeitet auch während einer Belagerung.' : 'Ein Platz vor der Mauer, 3 × 3 Felder: Platz für Äcker, Weiden, Holzfäller und Steinbruch. Bei einer Belagerung ruht hier die Arbeit, und manches geht in Flammen auf.'}</p>
          <div class="bgrid">${here.map((id) => buildCard(id, i)).join('')}</div>`;
      } else {
        const dmg = b.dmg ? `<div class="notice bad"><p>Abgebrannt: ${esc(BUILDINGS[b.id].name)} arbeitet erst wieder, wenn es ausgebessert ist.</p><div class="chips">${costChips(repairCost(i))}<span class="chip">1 Tag</span></div><button class="btn primary" data-act="repair" data-plot="${i}" ${con ? 'disabled' : ''}>Ausbessern</button></div>` : '';
        body = `${note}${dmg}<div class="bgrid one">${buildCard(b.id, i)}</div>
          <div class="row"><button class="btn" data-act="demolish" data-plot="${i}" ${con && con.plot === i ? 'disabled' : ''}>Abreißen</button><button class="btn" data-act="castleall">Ganze Burg</button></div>`;
      }
      if (!b) body += '<div class="row"><button class="btn" data-act="castleall">Ganze Burg</button></div>';
    }
  }
  return { title: b ? BUILDINGS[b.id].name : 'Freier Bauplatz', sub: `Burg ${esc(homeName())} · ${where}${b ? ` · Stufe ${b.lv}/3${b.dmg ? ' · abgebrannt' : ''}` : ''}`, tabs, body };
}

// Burgtor: von Hand öffnen und schließen
function gateAction() {
  if (!hasHomeGate()) return `<div class="actions gate"><div class="action"><div><b>Burgtor</b><p>Die Ruine hat noch kein Tor. Ab der Holzburg kannst du es schließen.</p></div></div></div>`;
  const closed = homeGateClosed();
  const txt = closed
    ? 'Niemand kommt durchs Tor, du selbst gehst durch die Pforte (E), oder du klickst einfach ein Ziel an. Verteidigung +10, aber Händler bleiben draußen: kein Marktgeld.'
    : 'Ein geschlossenes Tor hält Räuber und Plünderer ab: Verteidigung +10. Dafür bleiben Händler draußen, das Marktgeld fällt weg. In der Nähe der Burg schaltet auch die Taste B das Tor.';
  return `<div class="actions gate"><div class="action"><div><b>Burgtor: ${closed ? 'geschlossen' : 'offen'}</b><p>${txt}</p></div><button class="btn${closed ? '' : ' primary'}" data-act="tor">${closed ? 'Öffnen' : 'Schließen'}</button></div></div>`;
}

// Karte eines Burggebäudes: was es jetzt leistet, was die nächste Stufe bringt und kostet
function buildCard(id, i = null) {
  const info = buildInfo(id, i);
  const def = BUILDINGS[id];
  const isBurg = id === 'burg';
  const name = isBurg ? `${def.levels[info.cur].name}` : def.name;
  const now = isBurg ? def.levels[info.cur].eff : info.cur ? def.levels[info.cur].eff : 'Noch nicht errichtet';
  const nextName = isBurg && info.lv ? `Ausbau zur ${info.lv.name}` : 'Nächste Stufe';
  const btnLabel = info.ok ? (info.cur || isBurg ? 'Ausbauen' : 'Errichten') : esc(info.reasons[0]);
  return `<article class="bcard${info.cur ? ' built' : ''}">
    <header><b>${esc(name)}</b><span class="lvl">${isBurg ? `Stufe ${info.cur}/3` : `${info.cur}/3`}</span></header>${!isBurg && STACKABLE[id] ? '<p class="muted small">Mehrfach baubar: Die Erträge addieren sich.</p>' : ''}${!isBurg && OUTER_ONLY[id] ? '<p class="muted small">Nur vor der Mauer.</p>' : ''}
    ${def.desc ? `<p class="muted">${esc(def.desc)}</p>` : ''}
    <p><span class="label">Jetzt</span> ${esc(now)}</p>
    ${info.lv ? `<p><span class="label">${nextName}</span> ${esc(info.lv.eff)}</p>
    <div class="chips">${costChips(info.lv.cost)}<span class="chip">${info.lv.days} ${info.lv.days === 1 ? 'Tag' : 'Tage'}</span>${info.lv.need && info.lv.need.renown ? `<span class="chip ${G.s.renown >= info.lv.need.renown ? 'ok' : 'miss'}">${info.lv.need.renown} Ruhm</span>` : ''}${info.lv.need && info.lv.need.allies ? `<span class="chip ${alliesCount() >= info.lv.need.allies ? 'ok' : 'miss'}">${info.lv.need.allies} Verbündete</span>` : ''}</div>
    <button class="btn${info.ok ? ' primary' : ''}" data-act="build" data-id="${id}"${i !== null ? ` data-plot="${i}"` : ''} ${info.ok ? '' : 'disabled'}>${btnLabel}</button>` : '<p class="muted">Vollständig ausgebaut.</p>'}
  </article>`;
}

function castleBuild() {
  const c = G.s.castle;
  const bal = dailyBalance();
  const inc = bal.income.reduce((a, [, v]) => a + v, 0), cost = bal.costs.reduce((a, [, v]) => a + v, 0);
  const con = c.construction;
  const conText = conNote(con) + (homeBesieged() ? '<div class="notice bad"><p>Feinde lagern vor der Burg: Vor der Mauer ruht die Arbeit, nur der Hof erzeugt noch etwas.</p></div>' : '');
  const st = c.storage;
  return `${conText}
    <div class="summary">
      <div><span class="label">Tagesbilanz</span><b class="${inc - cost >= 0 ? 'pos' : 'neg'}">${inc - cost >= 0 ? '+' : ''}${inc - cost} Gold</b><span class="muted">${bal.income.map(([n, v]) => `${n} +${v}`).join(', ')}${bal.costs.length ? '; ' + bal.costs.map(([n, v]) => `${n} −${v}`).join(', ') : ''}</span></div>
      ${seatSite() ? `<div><span class="label">Grafschaft</span><b>${esc(SHIRES[seatSite().id].name)}</b><span class="muted">${fmt(shireTax(seatSite().id))} Gold Abgaben am Tag. ${esc(SHIRES[seatSite().id].text)}</span></div>`
    : `<div><span class="label">Burgsiedlung</span><b>${villageHouses()} Häuser</b><span class="muted">${G.s.castle.level < 3 ? `Mit der nächsten Burgstufe ziehen weitere Familien nach ${esc(homeName())}.` : `${esc(homeName())} ist ein blühender Ort.`}</span></div>`}
      <div><span class="label">Burglager</span><b>${st.holz || 0} Holz · ${st.stein || 0} Stein · ${st.eisen || 0} Eisen</b><span class="muted">${prodText(bal.prod)} Baustoffe in deiner Ladung zählen mit.</span></div>
      <div><span class="label">Verpflegung</span><b class="${bal.food.short ? 'neg' : 'pos'}">${foodStock()} Rationen</b><span class="muted">${st.getreide || 0} Getreide, ${st.fleisch || 0} Fleisch im Lager. ${foodNeed()} ${foodNeed() === 1 ? 'Mund' : 'Münder'} am Tisch: Täglich ${foodNeed()} ${foodNeed() === 1 ? 'Ration' : 'Rationen'}.${bal.food.short ? ` Es fehlen ${bal.food.short}, die für je ${FOOD_PRICE} Gold zugekauft werden.` : ''} Felder, Schafzucht und Jagd füllen die Vorräte.</span></div>
      <div class="row"><button class="btn" data-act="rest">Rasten</button></div>
    </div>
    <h3>Bergfried</h3>
    <div class="bgrid one">${buildCard('burg')}</div>
    ${castleTypeSection()}
    ${plotList(true)}
    ${plotList(false)}`;
}

// Burgart: Mauerring und Aufteilung der Plätze
function castleTypeSection() {
  const cur = castleType(), con = G.s.castle.construction;
  const cards = TYPE_IDS.map((t) => {
    const d = CASTLE_TYPES[t], here = t === cur;
    const cost = typeChangeCost(t), lost = here ? [] : typeChangeLosses(t);
    const free = !G.s.castle.level;
    const can = !here && !con && Object.entries(cost).every(([k, v]) => (k === 'gold' ? G.s.gold : (G.s.castle.storage[k] || 0) + (G.s.cargo[k] || 0)) >= v);
    return `<article class="bcard${here ? ' built' : ''}">
      <header><b>${esc(d.name)}</b><span class="lvl">${d.inner} im Hof · ${d.outer} davor</span></header>
      <p class="muted">${esc(d.desc)}</p>
      <p><span class="label">Verteidigung</span> ${d.def ? `+${d.def} (ab der Holzburg)` : 'keine zusätzliche'}</p>
      ${here ? '<p class="muted">So ist deine Burg angelegt.</p>' : `${free ? '<p class="muted">Solange nur die Ruine steht, ist das bloß ein Plan und kostet nichts.</p>' : `<div class="chips">${costChips(cost)}<span class="chip">${typeChangeDays(t)} Tage</span></div>`}
      ${lost.length ? `<p class="warn">Kein Platz mehr für: ${esc(lost.map((x) => BUILDINGS[x.id].name).join(', '))}</p>` : ''}
      <button class="btn${can ? ' primary' : ''}" data-act="settype" data-type="${t}" ${can ? '' : 'disabled'}>${free ? 'So anlegen' : 'Umbauen'}</button>`}
    </article>`;
  }).join('');
  return `<h3>Burgart: ${esc(castleTypeName())}</h3><p class="muted">Eine große Burg hat weniger Plätze, aber mehr davon geschützt im Hof; eine kleine hat mehr Land davor, das bei einer Belagerung brachliegt oder abbrennt.</p><div class="bgrid">${cards}</div>`;
}
// Liste der Plätze im Hof oder vor der Mauer
function plotList(inner) {
  const plots = castlePlots(), lay = castleLayout().filter((p) => p.inner === inner);
  const used = lay.filter((p) => plots[p.i]).length, con = G.s.castle.construction;
  const rows = lay.map((p) => {
    const b = plots[p.i], building = con && con.plot === p.i;
    const label = b ? `${esc(BUILDINGS[b.id].name)} · Stufe ${b.lv}${b.dmg ? ' · <span class="neg">abgebrannt</span>' : ''}` : building ? `${esc(BUILDINGS[con.id].name)} · im Bau` : '<span class="muted">frei</span>';
    return `<button class="plotrow${b ? '' : ' free'}" data-act="plot" data-plot="${p.i}"><span>${label}</span><span class="muted">${b ? 'Ausbau' : 'Bauen'} ›</span></button>`;
  }).join('');
  return `<h3>${inner ? 'Im Hof' : 'Vor der Mauer'} <span class="muted">${used} von ${lay.length} belegt</span></h3><div class="plotlist">${rows || '<p class="muted">Keine Plätze.</p>'}</div>`;
}

function unitStatsLine(u) {
  return `LP ${u.st.maxHp} · Angriff ${Math.round(u.st.atk)} · Schutz ${Math.round(u.st.def)}${u.st.ranged ? ` · Reichweite ${u.st.range}` : ''}`;
}

// Anwärter als Karte (Rittersaal, Waldlager, Söldner im Ort); act: Aktion beim Anwerben
function recruitCard(u, i, act) {
  return `<article class="recruit">
    <header><b>${esc(u.name)}</b><span class="muted">${u.title ? `${esc(u.title)} · ` : ''}${CLASSES[u.cls].name} · Stufe ${u.level}</span></header>
    <p>${unitStatsLine(u)}</p>
    <p class="muted">${SLOTS.filter((s) => u.eq[s]).map((s) => ITEMS[u.eq[s]].name).join(', ') || 'ohne Ausrüstung'}</p>
    <div class="chips">${u.cost ? goldChip(u.cost) : '<span class="chip">ohne Handgeld</span>'}<span class="chip">Sold ${u.wage}/Tag</span></div>
    <button class="btn primary" data-act="${act}" data-i="${i}" ${G.s.gold >= u.cost ? '' : 'disabled'}>Anwerben</button>
  </article>`;
}

// Lager im Wald: Ware an der Quelle kaufen, im Waldlager Söldner anheuern
function campPanel() {
  const c = G.ui.arg;
  const goods = campGoods(c), rec = campRecruits(c);
  const rows = goods.map((r) => `<tr><th scope="row">${GOODS[r.good].name}</th><td class="num">${r.stock}</td><td class="num">${r.price}</td>
    <td class="btns"><button class="btn sm" data-act="campbuy" data-good="${r.good}" data-n="1" ${r.stock ? '' : 'disabled'}>+1</button><button class="btn sm" data-act="campbuy" data-good="${r.good}" data-n="5" ${r.stock ? '' : 'disabled'}>+5</button><button class="btn sm" data-act="campbuy" data-good="${r.good}" data-n="999" ${r.stock ? '' : 'disabled'}>alles</button></td>
    <td class="num strong">${G.s.cargo[r.good] || 0}</td></tr>`).join('');
  const body = `<p class="lede">${esc(CAMP_TEXT[c.camp] || '')}</p>
    ${rows ? `<p class="meta">Ladung <b>${cargoUsed()}/${cargoCap()}</b> · Gold <b>${fmt(G.s.gold)}</b></p>
    <div class="table-wrap"><table class="market"><thead><tr><th>Ware</th><th>Vorrat</th><th>Preis</th><th></th><th>Ladung</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="hint">Was heute weg ist, kommt morgen nach.</p>` : ''}
    ${rec.length ? `<h3>Anwerben</h3><p class="meta">Im Feld ${partyMembers().length}/${partyCap()}</p><div class="rgrid">${rec.map((u, i) => recruitCard(u, i, 'camphire')).join('')}</div>` : ''}`;
  return { title: c.name, sub: 'Lager im Wald', tabs: [], body };
}

// Söldner der Herren im Ort (Normannen, Sachsen)
function townMercActions(site) {
  const l = townMercs(site);
  if (!l) return '';
  return `<h3>Söldner</h3>${l.length ? `<div class="rgrid">${l.map((u, i) => recruitCard(u, i, 'mercHire')).join('')}</div>` : '<p class="muted">Heute bietet sich niemand an. In ein paar Tagen wieder.</p>'}`;
}

function castleHall() {
  if (!bLevel('halle')) return '<div class="notice"><p>Ohne Rittersaal meldet sich niemand, der dir dienen will. Errichte ihn unter „Ausbau“.</p></div>';
  const rec = G.s.castle.recruits;
  const next = Math.max(0, G.s.castle.recruitDay + 2 - G.s.day);
  const cards = rec.map((u, i) => `<article class="recruit">
    <header><b>${esc(u.name)}</b><span class="muted">${CLASSES[u.cls].name} · Stufe ${u.level}</span></header>
    <p>${unitStatsLine(u)}</p>
    <p class="muted">${SLOTS.filter((s) => u.eq[s]).map((s) => ITEMS[u.eq[s]].name).join(', ') || 'ohne Ausrüstung'}</p>
    <div class="chips">${goldChip(u.cost)}<span class="chip">Sold ${u.wage}/Tag</span></div>
    <button class="btn primary" data-act="hire" data-i="${i}" ${G.s.gold >= u.cost ? '' : 'disabled'}>Anwerben</button>
  </article>`).join('');
  return `<p class="meta">Im Feld ${partyMembers().length}/${partyCap()} · In der Garnison ${G.s.companions.filter((c) => c.status === 'garnison').length} · Neue Anwärter ${next ? `in ${next} ${next === 1 ? 'Tag' : 'Tagen'}` : 'morgen'}</p>
    ${cards ? `<div class="rgrid">${cards}</div>` : '<p class="muted">Heute hat sich niemand gemeldet.</p>'}
    <p class="hint">Wer nicht mehr ins Gefolge passt, bleibt in der Garnison und verteidigt ${esc(homeName())}.${isAlly('waldleute') ? '' : ' Langbogenschützen kommen nur, wenn die Waldleute dir vertrauen.'}</p>`;
}

function prodText(prod) {
  const parts = Object.entries(prod).filter(([, v]) => v).map(([k, v]) => `+${v} ${GOODS[k].name}`);
  return parts.length ? `Täglich ${parts.join(', ')}.` : 'Noch keine eigene Erzeugung.';
}

function castleStore() {
  const c = G.s.castle;
  const rows = GOOD_IDS.map((g) => {
    const st = c.storage[g] || 0, cg = G.s.cargo[g] || 0;
    return `<tr><th scope="row">${wareIcon(g)}${GOODS[g].name}</th><td class="num">${st}</td><td class="num">${cg}</td>
      <td class="btns"><button class="btn sm" data-act="store" data-good="${g}" data-n="all" ${cg ? '' : 'disabled'}>einlagern</button><button class="btn sm" data-act="load" data-good="${g}" data-n="10" ${st ? '' : 'disabled'}>10 aufladen</button></td></tr>`;
  }).join('');
  return `<p class="meta">Ladung ${cargoUsed()}/${cargoCap()}</p>
    <div class="table-wrap"><table class="market"><thead><tr><th>Ware</th><th>Lager</th><th>Ladung</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="row"><button class="btn" data-act="storeall">Ganze Ladung einlagern</button></div>
    <p class="hint">Das Lager wird bei Überfällen geplündert, wenn die Verteidigung nicht reicht.</p>`;
}

// ---------------------------------------------------------------- Gefolge
function selectedUnit() {
  const id = G.ui.sel;
  if (id === G.s.player.id) return G.s.player;
  return G.s.companions.find((c) => c.id === id) || G.s.player;
}

function rosterButton(u) {
  const sel = selectedUnit() === u;
  const hp = Math.round((u.hp / u.st.maxHp) * 100);
  const tr = u.status === 'reise' ? travelerTrip(u) : null;
  const where = tr ? ` · unterwegs ${esc(towardText(tripPos(tr).to))}` : u.status === 'kastellan' ? ` · Kastellan in ${esc((siteById(u.seat) || {}).name || '?')}` : u.status === 'verwundet' ? ` · verwundet (${u.woundedDays} T.)` : ` · ${hp} %`;
  return `<button class="ros${sel ? ' sel' : ''}" data-act="sel" data-u="${u.id}"><b>${esc(u.name)}</b><span>${CLASSES[u.cls].name} · St. ${u.level}${where}</span></button>`;
}

function partyView(atCastle) {
  const party = partyMembers();
  const gar = G.s.companions.filter((c) => c.status === 'garnison');
  const wnd = G.s.companions.filter((c) => c.status === 'verwundet');
  const cas = G.s.companions.filter((c) => c.status === 'kastellan');
  const away = G.s.companions.filter((c) => c.status === 'reise');
  const u = selectedUnit();
  const isPlayer = u.kind === 'player';
  const slots = SLOTS.map((s) => {
    const id = u.eq[s];
    return `<div class="slot"><span class="label">${SLOT_NAME[s]}</span>${id ? `<div><b>${ITEMS[id].name}</b><span class="muted">${itemStats(id)}</span></div><button class="btn sm" data-act="unequip" data-slot="${s}">ablegen</button>` : '<div class="muted">leer</div>'}</div>`;
  }).join('');
  const chest = G.s.inventory.map((id, i) => {
    const d = previewEquip(u, id);
    const parts = [];
    if (Math.abs(d.atk) >= 0.5) parts.push(`${d.atk > 0 ? '+' : ''}${Math.round(d.atk)} Angriff`);
    if (Math.abs(d.def) >= 0.5) parts.push(`${d.def > 0 ? '+' : ''}${Math.round(d.def)} Schutz`);
    const cls = d.atk + d.def > 0.4 ? 'pos' : d.atk + d.def < -0.4 ? 'neg' : '';
    return `<div class="item"><div><b>${ITEMS[id].name}</b><span class="muted">${SLOT_NAME[ITEMS[id].slot]} · ${itemStats(id)}</span>${parts.length ? `<span class="${cls}">${parts.join(', ')}</span>` : ''}</div><button class="btn sm" data-act="equip" data-i="${i}">anlegen</button></div>`;
  }).join('');
  let moves = '';
  if (!isPlayer) {
    if (u.status === 'party') moves = '<button class="btn" data-act="status" data-s="garnison">In die Garnison schicken</button>';
    if (u.status === 'garnison') moves = atCastle ? '<button class="btn primary" data-act="status" data-s="party">Ins Gefolge holen</button>' : `<span class="muted">Ins Gefolge holen kannst du sie nur in ${esc(homeName())}.</span>`;
    if (u.status === 'kastellan') moves = `<span class="muted">Abberufen kannst du den Kastellan in seiner Burg ${esc((siteById(u.seat) || {}).name || '')}.</span>`;
    if (u.status === 'reise') moves = `<span class="muted">${esc(u.name)} ist auf Reisen (Reiter „Reisen &amp; Handel“).</span>`;
    else moves += ` <button class="btn danger" data-act="dismiss">Entlassen</button>`;
  }
  const xp = `${u.xp}/${xpNeeded(u.level)} EP`;
  return `<div class="party">
    <aside class="roster">
      <h4>Im Feld (${party.length}/${partyCap()})</h4>
      ${rosterButton(G.s.player)}${party.map(rosterButton).join('')}
      ${gar.length ? `<h4>Garnison</h4>${gar.map(rosterButton).join('')}` : ''}
      ${wnd.length ? `<h4>Verwundet</h4>${wnd.map(rosterButton).join('')}` : ''}
      ${cas.length ? `<h4>Kastellane</h4>${cas.map(rosterButton).join('')}` : ''}
      ${away.length ? `<h4>Unterwegs</h4>${away.map(rosterButton).join('')}` : ''}
    </aside>
    <div class="detail">
      <header><h3>${esc(u.name)}</h3><span class="muted">${CLASSES[u.cls].name} · Stufe ${u.level} · ${xp}${u.wage ? ` · Sold ${u.wage}/Tag` : ''}</span></header>
      <p class="stats">${unitStatsLine(u)} · Lebenskraft ${Math.ceil(u.hp)}</p>
      <div class="slots">${slots}</div>
      ${moves ? `<div class="row">${moves}</div>` : ''}
      <h4>Aus der Truhe anlegen</h4>
      ${chest ? `<div class="items">${chest}</div>` : '<p class="muted">Die Truhe ist leer. Ausrüstung gibt es bei Händlern, in deiner Rüstkammer und als Beute.</p>'}
    </div>
  </div>`;
}

function partyPanel() {
  const atCastle = isHomeBase(G.nearSite);
  const n = trips().length;
  const tabs = [['gefolge', 'Gefolge'], ['reisen', `Reisen & Handel${n ? ` (${n})` : ''}`]];
  if (!tabs.some(([t]) => t === G.ui.tab)) G.ui.tab = 'gefolge';
  return {
    title: G.ui.tab === 'reisen' ? 'Reisen & Handel' : 'Gefolge & Ausrüstung',
    sub: `Gold ${fmt(G.s.gold)} · Befehl: ${{ folgen: 'Folgen', halten: 'Stellung halten', angriff: 'Angriff' }[G.s.order]}`,
    tabs, body: G.ui.tab === 'reisen' ? travelView() : partyView(atCastle),
  };
}

// ---------------------------------------------------------------- Reisen & Handel (travels.js)
function dayClock(t) { const d = Math.floor(t); return `Tag ${d}, ${clockText((t - d) * DAY_LEN)}`; }
function pct(x) { return `${Math.round(x * 100)} %`; }
function whoOptions(sel, allowNone = false, exclude = []) {
  const list = travelCandidates().filter((u) => !exclude.includes(String(u.id)));
  return `${allowNone ? '<option value="">niemand</option>' : ''}${list.map((u) => `<option value="${u.id}" ${String(sel) === String(u.id) ? 'selected' : ''}>${esc(u.name)} (${esc(CLASSES[u.cls].name)}, St. ${u.level}, ${u.status === 'party' ? 'im Gefolge' : 'Garnison'})</option>`).join('')}`;
}
function planNote(pl, kind) {
  if (!pl.legs) return pl.why ? `<p class="muted">${esc(pl.why)}</p>` : '';
  const parts = [`Zurück in etwa ${fmtDays(pl.days)} (${pl.legs.map((l) => esc(l.to)).join(' → ')})`, `Zehrgeld ${fmt(pl.cost)} Gold`];
  parts.push(`Überfall unterwegs ${pct(pl.risk.p)}, dann Sieg ${pct(pl.risk.win)}`);
  let more = '';
  if (pl.fight) more = `<p>Kampf: deine Leute ${pl.fight.us} gegen ${pl.fight.them}, Aussicht auf Sieg etwa ${pct(pl.fight.win)}.</p>`;
  if (pl.preview) {
    const pv = pl.preview, home = Object.entries(pv.home).map(([g, k]) => `${k} ${GOODS[g].name}`).join(', ');
    more = `<p>Nach heutigen Preisen: ${pv.sold ? `Verkauf ${fmt(pv.sold)} Gold` : 'nichts zu verkaufen'}${pv.bought ? `, Einkauf ${pv.bought} Stück` : ''}. Zurück kämen ${fmt(pv.gold)} Gold${home ? ` und ${home}` : ''}${pl.plan.budget ? ` (mitgegeben ${fmt(pl.plan.budget)})` : ''}.</p>`;
  }
  return `<p class="muted">${parts.join(' · ')}.</p>${more}${pl.why ? `<p class="muted">${esc(pl.why)}</p>` : ''}`;
}
function tripRow(t) {
  const pos = tripPos(t), us = t.who.map((id) => G.s.companions.find((c) => c.id === id)).filter(Boolean);
  const carry = [...Object.entries(t.cargo).filter(([, n]) => n > 0).map(([g, n]) => `${n} ${GOODS[g].name}`), ...(t.gold > 0 ? [`${fmt(t.gold)} Gold`] : [])];
  const heading = pos.to.act === 'heim' ? `auf dem Heimweg nach ${esc(homeName())}` : `unterwegs ${esc(towardText(pos.to))}`;
  return `<div class="action"><div><b>${esc(us.map((u) => u.name).join(', '))}</b><p>${esc(t.label)}${t.repeat ? ' · <b>feste Route</b>' : ''}</p>
    <p class="muted">${heading}, Ankunft ${dayClock(t.t1)}${carry.length ? ` · dabei: ${carry.join(', ')}` : ''}</p>
    <div class="progress"><span style="width:${Math.round(pos.k * 100)}%"></span></div></div>
    <div class="row">${t.repeat ? `<button class="btn sm" data-act="tstop" data-t="${t.id}">Route beenden</button>` : ''}${pos.to.act !== 'heim' ? `<button class="btn sm" data-act="trecall" data-t="${t.id}">Zurückrufen</button>` : ''}</div></div>`;
}
function questForm(q) {
  const f = (G.ui.qf = G.ui.qf || {})[q.id] || (G.ui.qf[q.id] = {});
  const cand = travelCandidates();
  if (f.who === undefined || !cand.some((u) => String(u.id) === String(f.who))) f.who = cand[0] ? String(cand[0].id) : '';
  // Wer inzwischen verwundet oder fort ist, fällt aus der Auswahl
  for (const k of ['e1', 'e2']) if (f[k] && (f[k] === f.who || !cand.some((u) => String(u.id) === String(f[k])))) f[k] = '';
  if (f.e2 && f.e2 === f.e1) f.e2 = '';
  const fightQ = q.type !== 'bote' && q.type !== 'lieferung';
  const who = [f.who, f.e1, fightQ ? f.e2 : ''].filter(Boolean);
  const pl = planTrip({ kind: 'auftrag', quest: q.id, who });
  const sel = (field, val, none, ex) => `<select data-field="q.${q.id}.${field}">${whoOptions(val, none, ex)}</select>`;
  return `<div class="trip-form">
    <label>Wer geht? ${sel('who', f.who, false, [])}</label>
    <label>Begleiter ${sel('e1', f.e1, true, [f.who])}</label>
    ${fightQ ? `<label>Zweiter Begleiter ${sel('e2', f.e2, true, [f.who, f.e1])}</label>` : ''}
    ${planNote(pl)}
    <button class="btn primary" data-act="tquest" data-q="${q.id}" ${pl.ok ? '' : 'disabled'}>Losschicken</button>
  </div>`;
}
function tradeForm() {
  const f = (G.ui.form = G.ui.form || { qty: '20', budget: '0', repeat: false });
  const cand = travelCandidates();
  if (!f.who || !cand.some((u) => String(u.id) === String(f.who))) f.who = cand[0] ? String(cand[0].id) : '';
  if (f.e1 && (f.e1 === f.who || !cand.some((u) => String(u.id) === String(f.e1)))) f.e1 = '';
  const u = cand.find((x) => String(x.id) === String(f.who));
  const fromStore = !u || u.status === 'garnison' || isHomeBase(G.nearSite);
  const store = fromStore ? G.s.castle.storage : G.s.cargo;
  const goods = GOOD_IDS.filter((g) => (store[g] || 0) > 0);
  if (f.good && !goods.includes(f.good)) f.good = '';
  const markets = G.world.sites.filter((s) => !['spieler', 'lager', 'einsiedelei'].includes(s.type) && !isHostileFaction(s.faction))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  if (f.to && !markets.some((s) => s.id === f.to)) f.to = '';
  const home = homeBase();
  const dist = (s) => Math.round(Math.hypot(s.x - home.x, s.y - home.y) * 1.25 / 75 * 2) / 2;
  const price = (s, g, buyIt) => (g ? ` · ${GOODS[g].name} ${buyIt ? buyPrice(s, g) : sellPrice(s, g)} G` : '');
  const opt = (s, sel, g, buyIt) => `<option value="${s.id}" ${sel === s.id ? 'selected' : ''}>${esc(s.name)} (${String(dist(s)).replace('.', ',')} T.${price(s, g, buyIt)})</option>`;
  const toSel = siteById(f.to);
  const who = [f.who, f.e1].filter(Boolean);
  const pl = planTrip({ kind: 'handel', who, good: f.good, qty: f.qty === 'alle' ? 9999 : f.qty, budget: f.budget, to: f.to, buy: f.buy, to2: f.to2, repeat: f.repeat });
  return `<div class="trip-form">
    <label>Wer fährt? <select data-field="f.who">${whoOptions(f.who)}</select></label>
    <label>Begleiter (zweiter Wagen, mehr Schutz) <select data-field="f.e1">${whoOptions(f.e1, true, [f.who])}</select></label>
    <label>Fracht aus ${fromStore ? 'dem Burglager' : 'deiner Ladung'} <select data-field="f.good"><option value="">keine</option>${goods.map((g) => `<option value="${g}" ${f.good === g ? 'selected' : ''}>${esc(GOODS[g].name)} (${store[g]})</option>`).join('')}</select></label>
    <label>Menge <select data-field="f.qty">${['10', '20', '40', 'alle'].map((k) => `<option ${f.qty === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
    <label>Geld für Einkäufe <select data-field="f.budget">${['0', '100', '250', '500', '1000'].map((k) => `<option value="${k}" ${f.budget === k ? 'selected' : ''}>${k} Gold</option>`).join('')}</select></label>
    <label>Ziel <select data-field="f.to"><option value="">wählen …</option>${markets.map((s) => opt(s, f.to, f.good, false)).join('')}</select></label>
    <label>Dort einkaufen <select data-field="f.buy"><option value="">nichts</option>${GOOD_IDS.map((g) => `<option value="${g}" ${f.buy === g ? 'selected' : ''}>${esc(GOODS[g].name)}${toSel ? ` (${buyPrice(toSel, g)} G)` : ''}</option>`).join('')}</select></label>
    <label>Danach verkaufen in <select data-field="f.to2"><option value="">nirgends, heimbringen</option>${markets.filter((s) => s.id !== f.to).map((s) => opt(s, f.to2, f.buy, false)).join('')}</select></label>
    <label class="check"><input type="checkbox" data-field="f.repeat" ${f.repeat ? 'checked' : ''}> Wiederholen: feste Route, solange Fracht und Geld reichen</label>
    ${planNote(pl)}
    <button class="btn primary" data-act="ttrade" ${pl.ok ? '' : 'disabled'}>Losschicken</button>
  </div>`;
}
function travelView() {
  const list = trips();
  const qs = G.s.quests.filter((q) => DELEGABLE[q.type] && q.state === 'aktiv');
  const cand = travelCandidates();
  const quests = qs.map((q) => {
    const t = q.agent && list.find((x) => x.id === q.agent);
    return `<article class="quest"><header><b>${esc(q.title)}</b>${swatch(q.faction)}<span class="muted">${esc(siteById(q.from).name)} · Frist Tag ${q.deadline}</span></header>
      ${t ? `<p class="muted">Unterwegs: ${esc(t.label)}.</p>` : cand.length ? questForm(q) : ''}</article>`;
  }).join('');
  return `<p class="hint">Gefährten aus dem Gefolge oder der Garnison reisen für dich: Sie bringen Briefe und Lieferungen, stellen mit Begleitern eine Bande oder fahren als Händler über Land. Wer aus der Garnison aufbricht, nimmt Ware aus dem Burglager, wer bei dir ist, aus deiner Ladung. Unterwegs lauern Wegelagerer. Zurück kommen alle in die Garnison von ${esc(homeName())}. Für Aufträge, die andere erledigen, gibt es den halben Ruhm.</p>
    <h3>Unterwegs</h3>
    ${list.length ? list.map(tripRow).join('') : '<p class="muted">Niemand ist unterwegs.</p>'}
    <h3>Aufträge abgeben</h3>
    ${!cand.length ? '<p class="muted">Niemand ist frei, alle sind unterwegs, verwundet oder Kastellane.</p>' : ''}
    ${qs.length ? `<div class="quests">${quests}</div>` : '<p class="muted">Keine Aufträge, die jemand für dich übernehmen könnte (Botengänge, Lieferungen und Banden).</p>'}
    <h3>Handelsfahrt</h3>
    ${cand.length ? tradeForm() : '<p class="muted">Niemand ist frei für eine Handelsfahrt.</p>'}
    <p class="muted">Ein Wagen lädt ${WAGON} Stück. Am ersten Ziel wird die Fracht verkauft und mit allem Geld eingekauft; ein zweites Ziel verkauft das Eingekaufte, sonst kommt es ins Burglager.</p>`;
}

// ---------------------------------------------------------------- Aufträge
function questsPanel() {
  const p = G.s.player;
  const goal = `<div class="goal">
    <h3>Dein Ziel</h3>
    <p>Mach ${esc(homeName())} zur Festung und gewinne zwei Fraktionen als Verbündete. Dann kennt man deinen Namen von York bis Paris.</p>
    <div class="chips"><span class="chip ${G.s.castle.level >= 3 ? 'ok' : ''}">Burg: ${esc(levelName())} (${G.s.castle.level}/3)</span><span class="chip ${alliesCount() >= 2 ? 'ok' : ''}">Verbündete ${alliesCount()}/2</span><span class="chip">Ruhm ${fmt(G.s.renown)}</span><span class="chip">${G.s.stats.quests} Aufträge erfüllt</span></div>
    <p>Das große Ziel: ${allegiance() === 'john' ? 'ganz England für Prinz Johann, mit mindestens zwei Grafschaften in deiner Hand' : 'ein geeintes England unter König Richard und die zurückgewonnene Normandie'}. Den Stand zeigt die Karte unter „Krieg“.</p>
    <div class="chips">${allegiance() ? `<span class="chip ok">Treueid: ${esc(ALLEGIANCE[allegiance()].name)}</span>` : '<span class="chip">Noch kein Treueid</span>'}${(allegiance() === 'john' ? [['england', 'john']] : [['england', 'richard'], ['normandie', 'richard']]).map(([th, sd]) => { const g = goalProgress(th, sd); return `<span class="chip ${g.have === g.of ? 'ok' : ''}">${esc(THEATERS[th].name)}: ${g.have}/${g.of}</span>`; }).join('')}</div>
  </div>`;
  const list = G.s.quests.map((q) => {
    const t = questTarget(q);
    const state = q.state === 'erfuellt' ? `<span class="pill ally">Erledigt, Belohnung in ${esc(siteById(q.from).name)} abholen</span>` : '<span class="pill neutral">Aktiv</span>';
    const tr = q.agent && trips().find((x) => x.id === q.agent);
    const send = tr ? '<span class="pill friend">Ein Gefährte ist unterwegs</span>' : DELEGABLE[q.type] && q.state === 'aktiv' ? `<button class="btn" data-act="tsend" data-q="${q.id}">Jemanden schicken</button>` : '';
    return questCard(q, `${state}<span class="muted">Ziel: ${esc(t.label)}, ${dirText(p, t)}</span><button class="btn" data-act="goto" data-q="${q.id}">Hinreisen</button>${send}<button class="btn danger sm" data-act="abandon" data-q="${q.id}">Aufgeben</button>`);
  }).join('');
  return {
    title: 'Aufträge', sub: `${G.s.quests.length} von 6 möglichen`, tabs: [],
    body: `${goal}${list ? `<div class="quests">${list}</div>` : '<p class="muted">Du hast keine Aufträge. Siedlungen vergeben Arbeit an Leute, die sich nützlich machen.</p>'}`,
  };
}

// ---------------------------------------------------------------- Politik
function politicsPanel() {
  const cards = FACTION_IDS.map((f) => {
    const F = FACTIONS[f];
    const v = G.s.rep[f];
    const pos = ((v + 100) / 200) * 100;
    const ally = isAlly(f);
    return `<article class="faction${ally ? ' is-ally' : ''}" style="--c:${F.color}">
      <header><b>${esc(F.name)}</b>${repPill(f)}</header>
      <div class="repbar" role="img" aria-label="Ansehen ${v} von −100 bis +100"><span class="mark hostile" style="left:${((HOSTILE_AT + 100) / 200) * 100}%"></span><span class="mark ally" style="left:${((ALLY_AT + 100) / 200) * 100}%"></span><span class="val" style="left:${pos}%"></span></div>
      <p>${esc(F.desc)}</p>
      <p class="${ally ? 'pos' : 'muted'}"><span class="label">Als Verbündete</span> ${esc(F.ally)}</p>
      ${F.rivals.length ? `<p class="muted"><span class="label">Rivalen</span> ${F.rivals.map((r) => FACTIONS[r].short).join(', ')}</p>` : ''}
    </article>`;
  }).join('');
  return {
    title: 'Politik', sub: `Verbündete ${alliesCount()} · Ab ${ALLY_AT} verbündet, ab ${HOSTILE_AT} feindlich`, tabs: [],
    body: `<p class="hint">Wer einer Fraktion hilft, verärgert ihre Rivalen. Überfälle auf Patrouillen, Steuereintreiber oder Händler haben Folgen, im Guten wie im Schlechten.</p><div class="fgrid">${cards}</div>`,
  };
}

// ---------------------------------------------------------------- Karte
// Laufende Ereignisse mit Richtung und „Hinreisen“
function eventTargets() {
  const out = [], p = G.s.player;
  const sg = G.siege;
  if (sg) {
    const st = siegeStatus();
    const own = isOwnSite(sg.site);
    const t = own || sg.stage === 'anmarsch' ? { x: sg.site.x, y: sg.site.y + 1 } : { x: sg.camp.x, y: sg.camp.y + 1.5 };
    out.push({ k: 'siege', t, camp: !own && sg.stage !== 'anmarsch', text: `<b>Belagerung von ${esc(st.name)}</b> (${{ anmarsch: 'Anmarsch', belagerung: 'Beschuss', sturm: 'Sturm' }[sg.stage]}), ${dirText(p, sg.site)}` });
  }
  const tr = G.s.tourney;
  if (tr && !tr.done) {
    const host = G.world.sites.find((x) => x.id === tr.site);
    const when = tr.day === G.s.day ? 'heute' : tr.day === G.s.day + 1 ? 'morgen' : `am Tag ${tr.day}`;
    out.push({ k: 'tourney', t: { x: host.x, y: host.y + 0.6 }, site: host, text: `<b>Turnier in ${esc(host.name)}</b> ${when}, ${dirText(p, host)}` });
  }
  return out;
}
function eventList() {
  const ev = eventTargets();
  if (!ev.length) return '';
  return `<div class="events">${ev.map((e) => `<div class="action"><div><p>${e.text}</p></div><button class="btn sm" data-act="goevent" data-k="${e.k}">Hinreisen</button></div>`).join('')}</div>`;
}

let mapView = null;
const mapState = { zoom: 2, cx: null, cy: null };
// ---------------------------------------------------------------- Grafschaften
function ownerSwatch(o) { return `<span class="swatch" style="--c:${ownerColor(o)}"></span>`; }
function shireCard(id, withSeat = false) {
  const seat = G.world.sites.find((s) => s.id === id), sh = SHIRES[id], own = shireOwner(id);
  const places = shireSites(id).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const placeList = places.length ? places.map((s) => `${esc(s.name)} <span class="muted">(${esc(siteTypeName(s))})</span>`).join(', ') : 'keine weiteren Orte';
  const home = id === ((G.s && G.s.seat) || HOME_SHIRE);
  return `<div class="shire${home ? ' home' : ''}${own === 'spieler' ? ' mine' : ''}">
    <div class="shire-head"><b>${esc(sh.name)}</b>${withSeat && seat ? `<span class="muted">Sitz: ${esc(seat.name)}</span>` : ''}<span>${ownerSwatch(own)}Herr: ${esc(ownerName(own))}</span></div>
    <p>${esc(sh.text)}</p>
    <p class="muted">Orte: ${placeList}. Abgaben für den Herrn: ${shireTax(id)} Gold am Tag.</p>
    ${seat && isHeld(seat) ? `<p class="goal">${esc(seat.name)}: ${esc(holdingLine(seat))}</p>` : ''}
    ${home && own !== 'spieler' && !G.s.seat ? `<p class="goal">Dein Erbe ${esc(homeName())} liegt in dieser Grafschaft. Erobere ${esc(seat ? seat.name : 'den Sitz')} zurück, dann gehört das West Riding dir.</p>` : ''}
  </div>`;
}
function shiresList() {
  const realmRank = { en: 0, wa: 1, sc: 2, ir: 3, nd: 4, fr: 5, fl: 6 };
  const ids = Object.keys(SHIRES).filter((id) => G.world.sites.some((s) => s.id === id));
  const seatOf = (id) => G.world.sites.find((s) => s.id === id);
  ids.sort((a, b) => (a === HOME_SHIRE ? -1 : b === HOME_SHIRE ? 1 : 0) || (shireOwner(a) === 'spieler' ? -1 : 0) - (shireOwner(b) === 'spieler' ? -1 : 0) || realmRank[seatOf(a).realm] - realmRank[seatOf(b).realm] || SHIRES[a].name.localeCompare(SHIRES[b].name, 'de'));
  return `<div class="shires">${ids.map((id) => shireCard(id, true)).join('')}</div>`;
}
function homeShireNote() {
  // Mehrspieler: Die Grafschaft gehört dir mit ihrer Burg, einen Vogt gibt es nicht
  const own = seatSite();
  if (own) return SHIRES[own.id] ? shireCard(own.id) : '';
  if (shireOwner(HOME_SHIRE) === 'spieler') return '';
  const seat = G.world.sites.find((s) => s.id === HOME_SHIRE);
  return `<div class="notice"><p>${esc(homeName())} liegt in der Grafschaft <b>${esc(SHIRES[HOME_SHIRE].name)}</b>. Ihr Sitz ${esc(seat ? seat.name : '')} ist ${esc(ownerPhrase(shireOwner(HOME_SHIRE)))}, und Prinz Johns Vogt verlangt Abgaben von dir. Erobere die Burg zurück, dann gehören dir die Grafschaft, ihre Abgaben und ihre Wolle.</p></div>`;
}

// ---------------------------------------------------------------- Warenbilder (assets/waren, aus den Gegenstands-Vorlagen)
const WAREN_BILD = {
  getreide: 'assets/waren/getreidesack.webp', holz: 'assets/waren/holz.webp', stein: 'assets/waren/steinblock.webp', eisen: 'assets/waren/eisenbarren.webp',
  wolle: 'assets/waren/wollballen.webp', bier: 'assets/waren/bierfass.webp', salz: 'assets/waren/salzsack.webp', wein: 'assets/waren/weinfass.webp',
  fleisch: 'assets/waren/fleisch.webp', felle: 'assets/waren/felle.webp', blei: 'assets/waren/bleibarren.webp',
};
function wareIcon(g) { return WAREN_BILD[g] ? `<img class="ware-bild" src="${WAREN_BILD[g]}" alt="" loading="lazy">` : '<span class="ware-bild"></span>'; }

// ---------------------------------------------------------------- Barone (barons.js)
// Rangliste aller sieben Herren (die Barone und du), dazu ihre Nachrichten
function playerRankRow() {
  const plots = castlePlots().reduce((a, p) => a + (p ? p.lv : 0), 0);
  const shires = Object.values(G.s.shires || {}).filter((v) => v.owner === 'spieler').length;
  const men = G.s.companions.length;
  const score = Math.round(G.s.castle.level * 100 + plots * 22 + shires * 90 + men * 6 + G.s.renown + G.s.gold / 12);
  return { id: null, name: `${G.s.player.name} (du)`, seat: homeName(), region: '', color: playerColor(), arms: G.s.arms, level: G.s.castle.level, men, shires, renown: G.s.renown, score, side: allegiance() };
}
function baronsView() {
  const rows = ranking(playerRankRow());
  const lv = (l) => BUILDINGS.burg.levels[l].name;
  const table = rows.map((r, i) => {
    const b = r.id ? baron(r.id) : null;
    const status = b ? `<span class="baronrel ${b.feud ? 'bad' : b.ally || b.vassal ? 'good' : ''}">${esc(baronStatus(r.id))}</span>` : '<span class="muted">du</span>';
    const march = b && b.march ? ` · zieht gegen ${esc((siteById(b.march.target) || {}).name || '')}` : '';
    return `<div class="baron${r.id ? '' : ' mine'}">
      <span class="rank">${i + 1}.</span>
      <span class="arms-mini">${r.arms ? armsSVG(r.arms, 28, r.name) : ''}</span>
      <div class="baron-main">
        <div class="baron-head"><b>${esc(r.name)}</b><span class="muted">${esc(r.seat)}${r.region ? ` · ${esc(r.region)}` : ''}</span>${status}</div>
        <div class="baron-facts">${esc(lv(r.level))} · ${r.men} Mann · ${r.shires} Grafschaft${r.shires === 1 ? '' : 'en'} · Ruhm ${r.renown} · ${r.side ? `Seite: ${esc(SIDE_NAME[r.side] || '')}` : 'kämpft für sich'}${b ? ` · ${esc(traitName(r.id))}` : ''}${march}</div>
      </div>
      <span class="score" title="Rang aus Burg, Gebäuden, Grafschaften, Männern, Ruhm und Gold">${r.score}</span>
      ${r.id ? `<button class="btn sm" data-act="barongo" data-b="${r.id}">Hinreisen</button>` : ''}
    </div>`;
  }).join('');
  const news = baronNews(14).map((e) => `<li><span class="muted">Tag ${e.day}</span> ${esc(e.text)}</li>`).join('');
  return `<div class="barons">${table}</div>
    <p class="hint">Besuche einen Baron in seiner Burg (E an der Burg): Dort kannst du ihm Geschenke machen, ein Bündnis schließen, ihm die Fehde ansagen oder Frieden schließen. Verbündete schicken dir Männer vor fremde Burgen, Vasallen zahlen Tribut. Wer ihre Handelszüge überfällt, macht sich Feinde.</p>
    <h3>Nachrichten von den Baronen</h3>${news ? `<ul class="warnews">${news}</ul>` : '<p class="muted">Noch gibt es nichts zu berichten.</p>'}`;
}
// Audienz in der Burg eines Barons
function baronAudience(site) {
  const id = site.baron, b = baron(id), def = BARONS[id];
  if (!b) return '';
  const lv = BUILDINGS.burg.levels[b.level].name;
  const btn = (act, label, why, cls = '') => `<button class="btn ${cls}" data-act="${act}" data-b="${id}" ${why ? `disabled title="${esc(why)}"` : ''}>${esc(label)}</button>`;
  const con = b.con ? (b.con.kind === 'burg' ? `Ausbau zur ${BUILDINGS.burg.levels[b.con.level].name}` : `${BUILDINGS[b.con.id].name} Stufe ${b.con.level}`) : '';
  const shires = baronShires(id).map((sid) => SHIRES[sid].name).join(', ');
  return `<h3>Audienz bei ${esc(def.name)}</h3>
    <div class="notice${b.feud ? ' bad' : b.ally || b.vassal ? ' good' : ''}">
      <div class="baron-audience"><span class="arms-mini">${armsSVG(def.arms, 44, def.name)}</span><p>${esc(def.desc)}</p></div>
      <dl class="facts">
        <dt>Verhältnis zu dir</dt><dd>${esc(baronStatus(id))} (${b.rel > 0 ? '+' : ''}${b.rel})</dd>
        <dt>Burg</dt><dd>${esc(lv)}${con ? ` · baut: ${esc(con)}` : ''}</dd>
        <dt>Männer</dt><dd>${b.men} von ${menCap(id)} · Kampfkraft ${baronStrength(id)} · Verteidigung ${baronDefense(id)}</dd>
        <dt>Im Krieg</dt><dd>${b.side ? `schwört ${esc(SIDE_NAME[b.side])} die Treue` : 'kämpft für sich selbst'} · ${esc(traitName(id))}</dd>
        <dt>Grafschaften</dt><dd>${shires ? esc(shires) : 'keine'}</dd>
        <dt>Einkommen</dt><dd>etwa ${fmt(baronIncome(id) - baronUpkeep(id))} Gold am Tag${b.vassal ? ' (ein Viertel davon als Tribut an dich)' : ''}</dd>
      </dl>
    </div>
    <div class="action"><div><b>Geschenk (${BARON_GIFT} Gold)</b><p>Silber, ein guter Falke, ein Fass Wein: Das Verhältnis steigt. Einmal am Tag.</p></div>${btn('bgift', 'Schenken', giftBlock(id))}</div>
    ${b.ally || b.vassal ? '' : `<div class="action"><div><b>Bündnis anbieten</b><p>Ab einem Verhältnis von 40: Er schickt Männer, wenn du eine Burg belagerst, steht dir gegen Angreifer bei und greift dich nicht an.</p></div>${btn('bally', 'Bündnis', allianceBlock(id))}</div>`}
    ${b.feud ? `<div class="action"><div><b>Frieden schließen</b><p>Er verlangt ${fmt(peaceCost(id))} Gold Sühne. Oder du belagerst seine Burg: Fällt sie, zahlt er Lösegeld und wird dein Vasall.</p></div>${btn('bpeace', 'Sühne zahlen', peaceBlock(id))}</div>`
      : b.vassal ? '' : `<div class="action"><div><b>Fehde ansagen</b><p>Dann darfst du seine Burg belagern (das Aufgebot findest du unten). Er wird seinerseits gegen deine Burgen ziehen.</p></div>${btn('bfeud', 'Fehde', feudBlock(id), 'danger')}</div>`}
    ${b.feud ? baronSiegeBox(site) : ''}`;
}
function baronSiegeBox(site) {
  if (isHeld(site) || siegeAt(site)) return '';
  const why = besiegeBlock(site);
  return `<h3>Burg belagern</h3>
    <div class="notice"><p>Mit einem Aufgebot aus Söldnern ziehst du vor ${esc(site.name)}. Die Besatzung zählt rund ${baron(site.baron).men} Mann. Fällt die Burg, zahlt ${esc(BARONS[site.baron].name)} Lösegeld, gibt dir seine Grafschaften und wird dein Vasall.</p>${why ? `<p class="muted">${esc(why)}</p>` : ''}</div>
    ${LEVIES.map((l) => `<div class="action"><div><b>${esc(l.name)}: ${l.n} Söldner</b><p>Handgeld für ${l.n} Mann (je ${MERC_COST} Gold) und das Belagerungsgerät mit Trebuchet (${SIEGE_GEAR} Gold).</p></div><button class="btn danger" data-act="besiege" data-n="${l.n}" ${besiegeBlock(site, l.n) ? 'disabled' : ''}>Belagern (${fmt(levyCost(l.n))} Gold)</button></div>`).join('')}`;
}

// ---------------------------------------------------------------- Krieg (war.js)
function warView() {
  const w = war(), a = allegiance();
  const theaters = THEATER_IDS.map((th) => {
    const T = THEATERS[th], sides = Object.keys(T.sides);
    const st = sides.map((sd) => sideStrength(th, sd)), tot = st.reduce((x, y) => x + y, 0) || 1;
    const rows = sides.map((sd, k) => {
      const g = goalProgress(th, sd), mo = w.morale[sd] || 0;
      return `<div class="warside"><span class="swatch" style="--c:${sideColor(th, sd)}"></span><b>${esc(sideTitle(th, sd))}</b><span class="muted">${g.have} von ${g.of} Zielburgen · Stärke ${st[k]}${mo ? ` · Kriegsglück ${mo > 0 ? '+' : ''}${mo}` : ''}${a === sd ? ' · <b>deine Seite</b>' : ''}</span></div>`;
    }).join('');
    const bar = `<div class="warbar" role="img" aria-label="Kräfteverhältnis">${sides.map((sd, k) => `<span style="width:${(st[k] / tot) * 100}%;background:${sideColor(th, sd)}"></span>`).join('')}</div>`;
    const seats = theaterSeats(th).map((s) => { const sd = sideOfSeat(th, s), own = shireOwner(s.id); return `<span class="seat">${ownerSwatch(own)}${esc(s.name)}${sd ? '' : own === 'spieler' ? ' <span class="muted">(dein, ohne Treueid)</span>' : ''}</span>`; }).join('');
    const camps = w.campaigns.filter((c) => c.th === th).map((c) => {
      const t = siteById(c.target);
      return `<div class="action"><div><b>${esc(GROUP_TYPES[c.army].nom)}</b><p>zieht gegen ${esc(t.name)} (${esc(shireName(c.target))}), Ankunft Tag ${c.arrive}. ${dirText(G.s.player, t)}.</p></div><button class="btn sm" data-act="wargo" data-s="${t.id}">Hinreisen</button></div>`;
    }).join('');
    const end = warEnded(th);
    const goal = th === 'england' ? 'Ziel: alle Grafschaften Englands und Wales' : 'Ziel: Caen, Falaise, Évreux und Gisors';
    return `<article class="theater"><header><h3>${esc(T.name)}</h3><span class="muted">${esc(goal)}</span></header>
      ${bar}${rows}
      <p class="seats">${seats}</p>
      ${end ? `<p class="goal">Entschieden: ${esc(sideTitle(th, end))} ${th === 'england' ? 'hält ganz England' : 'hält die Normandie'}. Verliert die Seite eine Burg, geht der Krieg weiter.</p>` : ''}
      ${camps || '<p class="muted">Gerade ist hier kein Heer unterwegs.</p>'}
    </article>`;
  }).join('');
  let oath;
  if (a) {
    const sup = supportActive();
    oath = `<div class="notice good"><p>Du hast <b>${esc(ALLEGIANCE[a].name)}</b> den Treueid geschworen. Deine Grafschaften zählen für ihn${a === 'john' ? ' (in England)' : ''}, seine Feinde ziehen auch gegen deine Burgen, und dein Ruhm stärkt seine Seite.</p></div>
      <div class="action"><div><b>Heerfolge leisten</b><p>Söldner und Gold für ${esc(ALLEGIANCE[a].name)}: Eine Woche lang kämpft seine Seite stärker (+20).${sup ? ` Deine Männer stehen noch bis Tag ${sup.until} im Feld.` : ''}</p></div><button class="btn primary" data-act="warsupport" ${sup || G.s.gold < supportCost() ? 'disabled' : ''}>${fmt(supportCost())} Gold</button></div>
      ${Object.keys(ALLEGIANCE).filter((k) => k !== a).map((k) => `<div class="action"><div><b>Eid brechen, zu ${esc(ALLEGIANCE[k].name)} wechseln</b><p>Ruhm −20, Ansehen bei deinen bisherigen Freunden −30.</p></div><button class="btn danger" data-act="warswear" data-side="${k}">Wechseln</button></div>`).join('')}`;
  } else {
    oath = `<p>Noch hast du niemandem die Treue geschworen. Ohne Eid zählen deine Grafschaften für keine Seite, und keine Seite kann ohne sie ganz England einen.</p>
      ${Object.entries(ALLEGIANCE).map(([k, al]) => `<div class="action"><div><b>Treueid: ${esc(al.name)}</b><p>${esc(al.text)} Ansehen: ${Object.entries(al.rep).map(([f, v]) => `${FACTIONS[f].short} ${v > 0 ? '+' : ''}${v}`).join(', ')}.</p></div><button class="btn primary" data-act="warswear" data-side="${k}">Schwören</button></div>`).join('')}`;
  }
  const news = w.log.slice(-10).reverse().map((e) => `<li><span class="muted">Tag ${e.day}</span> ${esc(e.text.replace(/^Kriegsnachricht: /, ''))}</li>`).join('');
  return `<div class="theaters">${theaters}</div>
    <h3>Deine Rolle</h3>${oath}
    <h3>Kriegsnachrichten</h3>${news ? `<ul class="warnews">${news}</ul>` : '<p class="muted">Noch ist es ruhig.</p>'}`;
}

const MAP_TABS = [['map', 'Karte'], ['krieg', 'Krieg'], ['grafschaften', 'Grafschaften'], ['barone', 'Barone']];
const mapTabs = () => (G.mp ? [...MAP_TABS, ['mitspieler', 'Mitspieler']] : MAP_TABS);
// Mehrspieler: Diplomatie mit den anderen Menschen (pvp.js)
const PVP_TEXT = {
  frieden: 'Ihr lasst einander in Ruhe. Weder ihr noch euer Gefolge greift den anderen an.',
  fehde: 'Ihr dürft einander angreifen, Held gegen Held und Gefolge gegen Gefolge. Wer fällt, verliert einen Teil seines Goldes und erwacht in seiner Burg.',
  buendnis: 'Ihr seid verbündet. Kündigt einer das Bündnis, gilt wieder Frieden.',
};
function pvpView() {
  const list = pvpPlayers();
  if (!list.length) return '<p class="muted">Gerade ist niemand sonst in der Partie.</p>';
  const rows = list.map((p) => {
    const btn = (act, label, cls = '', extra = '') => `<button class="btn sm ${cls}" data-act="${act}" data-seat="${esc(p.seat)}"${extra}>${esc(label)}</button>`;
    const acts = [];
    if (p.offer) acts.push(btn('pvpja', p.offer === 'frieden' ? 'Frieden annehmen' : 'Bündnis annehmen', 'primary'), btn('pvpnein', 'Ablehnen'));
    if (p.st === 'fehde') acts.push(btn('pvpfrieden', 'Frieden anbieten', 'primary'));
    else acts.push(btn('pvpfehde', 'Fehde erklären', 'danger'));
    if (p.st === 'frieden' && p.offer !== 'buendnis') acts.push(btn('pvpbund', 'Bündnis anbieten'));
    if (p.st === 'buendnis') acts.push(btn('pvplos', 'Bündnis kündigen'));
    const gifts = GIFTS.map((g) => `<button class="btn sm" data-act="pvpgold" data-seat="${esc(p.seat)}" data-g="${g}" ${G.s.gold >= g ? '' : 'disabled'}>${g} Gold</button>`).join('');
    return `<div class="baron pvp ${p.st}">
      <span class="arms-mini">${p.arms ? armsSVG(p.arms, 28, p.name) : `<span class="dot" style="background:${esc(p.color || '#888')}"></span>`}</span>
      <div class="baron-main">
        <div class="baron-head"><b>${esc(p.name)}</b><span class="muted">${esc(seatName(p.seat))}</span><span class="baronrel ${p.st === 'fehde' ? 'bad' : p.st === 'buendnis' ? 'good' : ''}">${esc(PVP_NAMES[p.st])}${p.since ? ` seit Tag ${p.since}` : ''}</span></div>
        <div class="baron-facts">${esc(PVP_TEXT[p.st])}${p.offer ? ` <b>${esc(p.name)} bietet dir ${p.offer === 'frieden' ? 'Frieden' : 'ein Bündnis'} an.</b>` : ''}</div>
        <div class="row">${acts.join('')}</div>
        <div class="row"><span class="label">Geschenk</span>${gifts}</div>
      </div>
    </div>`;
  }).join('');
  return `<div class="barons">${rows}</div>
    <p class="hint">Eine Fehde erklärst du allein, sie gilt sofort. Frieden nach einer Fehde und ein Bündnis bietest du an; der andere nimmt an oder lehnt ab. In einer Fehde darfst du seine Burgen belagern: eine eroberte wird deine, seine Heimburg plünderst du. Banden, Heere und Belagerungen sehen alle gleich; Beute bekommt, wer den letzten Schlag führt, ein Auftrag gehört dem, der ihn angenommen hat.</p>`;
}
// Mehrspieler: du und die Mitspieler in ihren Farben (Ländereien, Helden, Gefolge)
function mpLegend() {
  const me = `<span><span class="swatch" style="--c:${esc(playerColor())}"></span><b>${esc(G.s.player.name)} (du)</b></span>`;
  return me + pvpPlayers().map((p) => `<span><span class="swatch" style="--c:${esc(p.color || '#888')}"></span><b>${esc(p.name)}</b> · ${esc(PVP_NAMES[p.st] || '')}</span>`).join('');
}
function mapPanel() {
  if (G.ui.tab === 'mitspieler' && G.mp) return { title: 'Mitspieler', sub: 'Frieden, Fehde und Bündnis mit den anderen Herren der Partie.', tabs: mapTabs(), body: pvpView() };
  if (G.ui.tab === 'grafschaften') {
    return { title: 'Grafschaften', sub: 'Wer die Burg einer Grafschaft hält, beherrscht sie: Abgaben ihrer Orte und ein Vorzug, der zu ihrer Geschichte passt.', tabs: mapTabs(), body: shiresList() };
  }
  if (G.ui.tab === 'barone') return { title: 'Die Barone', sub: `Sieben Herren ringen um Macht und Land, du bist einer davon. Schwierigkeit: ${esc(difficulty().name)}.`, tabs: mapTabs(), body: baronsView() };
  if (G.ui.tab === 'krieg') return { title: 'Der Krieg um England und die Normandie', sub: 'Die Parteien erobern einander die Grafschaften. Auf der Karte zeigen Pfeile die Heere, die gerade ausgezogen sind.', tabs: mapTabs(), body: warView() };
  return {
    title: 'England und Frankreich', sub: 'Klicke auf einen Ort, um dorthin zu reisen. Mausrad oder + und − zoomen, Ziehen verschiebt. Übers Meer geht es nur mit dem Schiff. Gestrichelt: Grenzen der Grafschaften, getönt in der Farbe ihres Herrn. Pfeile: Heere im Krieg.', tabs: mapTabs(),
    body: `<div class="mapwrap"><div class="mapbox"><canvas id="bigmap" width="720" height="720" aria-label="Karte von England und Frankreich"></canvas>
      <div class="mapzoom"><button class="btn sm" data-act="mapzoom" data-d="1" aria-label="Hineinzoomen">+</button><button class="btn sm" data-act="mapzoom" data-d="-1" aria-label="Herauszoomen">−</button><button class="btn sm" data-act="mapzoom" data-d="home" aria-label="Zu dir springen">◎</button></div></div></div>
      <p class="legend">${G.mp ? mpLegend() : ''}${FACTION_IDS.map((f) => `<span>${swatch(f)}${FACTIONS[f].short}</span>`).join('')}<span><span class="swatch" style="--c:#ffd65a"></span>${esc(homeName())}</span><span><span class="ring"></span>Auftrag</span><span><span class="ev"></span>Belagerung, Schlacht</span><span><span class="ev gold"></span>Turnier</span>${trips().length ? `<span><span class="swatch" style="--c:${esc(playerColor())};border-radius:50%"></span>Gefährten unterwegs</span>` : ''}<span><span class="dash"></span>Fähre</span></p>${eventList()}`,
    after: () => {
      const cv = byId('bigmap');
      const wrap = cv.closest('.mapwrap');
      const w = Math.max(240, Math.min(760, wrap.clientWidth || 720, Math.round(window.innerHeight * 0.66)));
      cv.width = w * 2; cv.height = w * 2;
      cv.style.width = `${w}px`; cv.style.height = `${w}px`;
      const c = cv.getContext('2d');
      c.scale(2, 2);
      const p = G.s.player;
      if (mapState.cx === null) { mapState.cx = p.x; mapState.cy = p.y; }
      const draw = () => {
        mapView = drawMap(c, w, w, { big: true, zoom: mapState.zoom, cx: mapState.cx, cy: mapState.cy });
        // Mitte auf den tatsächlich gezeigten Ausschnitt setzen (am Rand begrenzt)
        const mid = miniToWorld(w / 2, w / 2, mapView);
        mapState.cx = mid.x; mapState.cy = mid.y;
      };
      draw();
      G.ui.redrawMap = draw;
      const at = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      // Ziehen verschiebt, Mausrad zoomt um den Mauszeiger, ein Klick ohne Ziehen reist
      let drag = null;
      cv.onpointerdown = (e) => { drag = { ...at(e), cx: mapState.cx, cy: mapState.cy, moved: false }; cv.setPointerCapture(e.pointerId); };
      cv.onpointermove = (e) => {
        if (!drag) return;
        const q = at(e), dx = q.x - drag.x, dy = q.y - drag.y;
        if (Math.hypot(dx, dy) > 5) drag.moved = true;
        if (drag.moved) { mapState.cx = drag.cx - dx / mapView.s; mapState.cy = drag.cy - dy / mapView.s; draw(); }
      };
      cv.onpointerup = (e) => {
        const d = drag; drag = null;
        if (!d || d.moved) return;
        const q = at(e);
        const wp = miniToWorld(q.x, q.y, mapView);
        let target = wp, site = null, best = 7 / Math.max(1, mapView.s);
        best = Math.max(best, 4);
        for (const s of G.world.sites) { const dd = Math.hypot(s.x - wp.x, s.y - wp.y); if (dd < best) { best = dd; site = s; target = s; } }
        travelTo(target, site);
      };
      cv.onwheel = (e) => {
        e.preventDefault();
        const q = at(e), before = miniToWorld(q.x, q.y, mapView);
        mapState.zoom = Math.max(1, Math.min(5, mapState.zoom * (e.deltaY < 0 ? 1.25 : 0.8)));
        draw();
        const after = miniToWorld(q.x, q.y, mapView);
        mapState.cx += before.x - after.x; mapState.cy += before.y - after.y;
        draw();
      };
    },
  };
}

// Reise über die Karte. Liegt das Ziel jenseits des Meeres, geht es zum passenden Hafen.
function travelTo(target, site) {
  if (cheatOn('reise')) { teleport(target, site); closePanel(); return; }
  const p = G.s.player, W = G.world;
  const here = landAt(W, p.x, p.y), there = landAt(W, target.x, target.y);
  if (there && here && there !== here) {
    const ports = W.sites.filter((s) => s.port && s.land === here && ferryRoutes(s.id).some((r) => siteById(r.to).land === there));
    ports.sort((x, y) => Math.hypot(x.x - p.x, x.y - p.y) - Math.hypot(y.x - p.x, y.y - p.y));
    // Bester Hafen: kurzer Weg dorthin und vom Zielhafen weiter, kurze Überfahrt
    const score = (s) => Math.min(...ferryRoutes(s.id).filter((r) => siteById(r.to).land === there).map((r) => { const d = siteById(r.to); return Math.hypot(s.x - p.x, s.y - p.y) + Math.hypot(d.x - target.x, d.y - target.y) + r.hours * 2; }));
    ports.sort((x, y) => score(x) - score(y));
    const port = ports[0];
    if (port && setPlayerPath(port.x, port.y)) {
      G.pendingSite = port;
      log(`Nach ${site ? site.name : 'dort'} führt kein Landweg. Du reist zum Hafen von ${port.name} und nimmst dort ein Schiff.`);
      closePanel();
    } else log('Dorthin führt kein Landweg. Du brauchst ein Schiff.', 'bad');
    return;
  }
  if (setPlayerPath(target.x, target.y + (site && site.type === 'spieler' ? 2.6 : 0))) {
    G.pendingSite = site;
    log(site ? `Du reist nach ${site.name}.` : 'Du brichst auf.');
    closePanel();
  } else log('Dorthin führt kein Weg.', 'bad');
}

// ---------------------------------------------------------------- Menü & Hilfe
function menuPanel() {
  const info = G.saveInfo ? G.saveInfo() : null;
  return {
    title: 'Menü', sub: info ? `Letzter Spielstand: ${esc(info)}` : 'Noch kein Spielstand gespeichert', tabs: [],
    body: `<div class="menu">
      <button class="btn primary" data-act="resume">Weiterspielen</button>
      <button class="btn" data-act="save">Speichern</button>
      <button class="btn" data-act="loadgame" ${info ? '' : 'disabled'}>Spielstand laden</button>
      <div class="gfx" role="group" aria-label="Grafik">
        <span class="label">Grafik</span>
        ${[['klar', 'Klar'], ['pixel', 'Pixel'], ['retro', 'Retro']].map(([m, n]) => `<button class="btn sm${G.gfx === m ? ' primary' : ''}" data-act="gfx" data-mode="${m}" aria-pressed="${G.gfx === m}">${n}</button>`).join('')}
      </div>
      <div class="gfx" role="group" aria-label="Ton">
        <span class="label">Ton</span>
        <button class="btn sm${G.musicOn && G.musicOn() ? ' primary' : ''}" data-act="music" aria-pressed="${!!(G.musicOn && G.musicOn())}">Musik ${G.musicOn && G.musicOn() ? 'an' : 'aus'}</button>
        <button class="btn sm${G.sfxOn && G.sfxOn() ? ' primary' : ''}" data-act="sfx" aria-pressed="${!!(G.sfxOn && G.sfxOn())}">Geräusche ${G.sfxOn && G.sfxOn() ? 'an' : 'aus'}</button>
      </div>
      ${mpMenu()}
      <button class="btn" data-act="help">Steuerung & Tipps</button>
      <button class="btn" data-act="chronik">Chronik</button>
      <button class="btn" data-act="cheats">Testmodus (Cheats)</button>
      <button class="btn danger" data-act="newgame">Neues Spiel</button>
    </div>
    <p class="hint">Das Spiel speichert jeden Morgen von selbst, aber nur in diesem Browser.</p>
    <p class="hint">A Knight's Tale · ${esc(versionText())}</p>`,
  };
}

// Mehrspieler im Menü: Partie eröffnen (die laufende) oder die Mitspieler, Chat und Verlassen
function mpMenu() {
  const mp = G.mp;
  if (!mp) return `<div class="mp-box"><span class="label">Mehrspieler</span>
      <p class="hint">Eine Partie mit anderen beginnt im Startmenü unter „Mehrspieler …“: Dort wählt jeder Ritter, Wappen und Grafschaft.</p></div>`;
  const rows = mpRoster().map((r) => `<li><span class="dot" style="background:${esc(r.color || '#888')}"></span>${esc(r.name)}${r.you ? ' (du)' : ''}${r.host ? ' · Gastgeber' : ''} <span class="muted">${r.seat ? esc(seatName(r.seat)) : ''}</span></li>`).join('');
  return `<div class="mp-box"><span class="label">Partie „${esc(mp.room)}“ (${mp.kind === 'relais' ? 'Relais' : 'dieser Rechner'})</span>
      <ul class="mp-roster">${rows}</ul>
      <p class="hint">Mit <kbd>Enter</kbd> sprichst du zu allen in der Partie.</p>
      <div class="row"><button class="btn sm" data-act="pvpopen">Diplomatie</button><button class="btn sm danger" data-act="mpleave">Partie verlassen</button></div></div>`;
}

// Testmodus: Schalter und Knöpfe für Ereignisse
function cheatPanel() {
  const c = G.s.cheat || {};
  const toggles = Object.entries(CHEATS).map(([k, label]) => `<button class="btn${c[k] ? ' primary' : ''}" data-act="cheat" data-c="${k}" aria-pressed="${!!c[k]}">${c[k] ? '✓ ' : ''}${esc(label)}</button>`).join('');
  const grp = (title, items) => `<h3>${title}</h3><div class="cheat-btns">${items.map(([id, label]) => `<button class="btn sm" data-act="cheatdo" data-do="${id}">${esc(label)}</button>`).join('')}</div>`;
  return {
    title: 'Testmodus', sub: 'Cheats zum Ausprobieren. Taste F9 öffnet und schließt diese Tafel.', tabs: [],
    body: `<div class="cheat-toggles">${toggles}</div>
      ${grp('Zeit und Wetter', [['h6', '+6 Stunden'], ['tag', '+1 Tag'], ['saison', 'Nächste Jahreszeit'], ['klar', 'Klar'], ['regen', 'Regen'], ['nebel', 'Nebel'], ['schnee', 'Schneefall'], ['snow0', 'Kein Schnee'], ['snow50', 'Halbe Schneedecke'], ['snow100', 'Volle Schneedecke']])}
      ${grp('Ereignisse', [['turnier', 'Turnier heute'], ['galgen', 'Hinrichtung jetzt'], ['feuer', 'Feuer in der Nähe'], ['belagerung', 'Belagerung starten'], ['schlacht', 'Schlacht starten'], ['grafschaft', 'Grafschaft hier übernehmen']])}
      ${grp('Held und Burg', [['ausruestung', 'Beste Ausrüstung'], ['stufe', 'Stufe +1 (alle)'], ['ruhm', 'Ruhm +50'], ['burg', 'Burg voll ausbauen'], ['repplus', 'Ansehen +25 (alle)'], ['repminus', 'Ansehen −25 (alle)']])}
      <p class="hint">Mit Sofortreise bringt dich ein Klick auf der Karte (M) sofort ans Ziel, auch übers Meer. Der Testmodus wird mit dem Spielstand gespeichert.</p>`,
  };
}

// Chronik: alle Meldungen nach Tagen, die neuesten oben, wahlweise nur Kampf, nur Erfolge oder das Übrige
const CHRONIK_FILTER = { alle: () => true, kampf: (m) => m.kind === 'bad', erfolge: (m) => m.kind === 'good' || m.kind === 'gold', sonst: (m) => m.kind !== 'bad' && m.kind !== 'good' && m.kind !== 'gold' };
function chronikPanel() {
  const all = G.s.chronik || [];
  const list = all.filter(CHRONIK_FILTER[G.ui.tab] || CHRONIK_FILTER.alle).reverse();
  let html = '', day = null;
  for (const m of list) {
    if (m.day !== day) {
      if (day !== null) html += '</ol>';
      day = m.day;
      html += `<h3 class="chronik-tag">Tag ${m.day} · ${SEASONS[seasonIndex(m.day)]} ${yearOf(m.day)}</h3><ol class="chronik">`;
    }
    html += `<li class="msg ${m.kind}"><time>${clockText(m.time)}</time>${esc(m.text)}</li>`;
  }
  if (day !== null) html += '</ol>';
  return {
    title: 'Chronik', sub: `${all.length} Einträge, die neuesten oben`,
    tabs: [['alle', 'Alles'], ['kampf', 'Kampf und Gefahr'], ['erfolge', 'Erfolge'], ['sonst', 'Übriges']],
    body: html || '<p class="muted">Noch nichts verzeichnet.</p>',
  };
}

function helpPanel() {
  return {
    title: 'Steuerung & Tipps', tabs: [],
    body: `<div class="cols">
      <div><h3>Steuerung</h3><dl class="keys">
        <dt>Klick</dt><dd>Gehen, Gegner angreifen, Orte ansteuern</dd>
        <dt>W A S D</dt><dd>Direkt laufen</dd>
        <dt>E</dt><dd>Siedlung oder Burg betreten, durch die Pforte eines geschlossenen Tors</dd>
        <dt>B</dt><dd>Burgtor deiner Burg schließen oder öffnen (in der Nähe, ab der Holzburg)</dd>
        <dt>R</dt><dd>Auf- und absitzen</dd>
        <dt>Leertaste</dt><dd>Nächsten Feind angreifen, beim Tjost die Lanze senken</dd>
        <dt>Klick auf Bettler</dt><dd>Almosen geben (3 Gold)</dd>
        <dt>Klick auf Tier</dt><dd>Mit dem Bogen jagen: Fleisch und Felle</dd>
        <dt>F oder 1 2 3</dt><dd>Gefolge: folgen, Stellung halten, angreifen</dd>
        <dt>T</dt><dd>Zeitraffer auf Reisen</dd>
        <dt>I J P M</dt><dd>Gefolge, Aufträge, Politik, Karte</dd>
        <dt>N</dt><dd>Chronik: alle Meldungen zum Nachlesen</dd>
        <dt>Mausrad, + −</dt><dd>Zoomen</dd>
        <dt>L</dt><dd>Musik an und aus</dd>
        <dt>K</dt><dd>Geräusche an und aus</dd>
        <dt>G</dt><dd>Grafik wechseln: klar, Pixel, Retro (Amiga-Stil)</dd>
        <dt>Esc</dt><dd>Tafel schließen, Menü</dd>
        <dt>F9</dt><dd>Testmodus mit Cheats</dd>
      </dl></div>
      <div><h3>So kommst du voran</h3><ol class="tips">
        <li>In ${esc(homeName())} zuerst ein <b>Holzfällerlager</b> und einen <b>Rittersaal</b> errichten. Dann zur <b>Holzburg</b> ausbauen.</li>
        <li>In deiner Burg öffnet ein Klick auf ein <b>Gebäude</b> oder einen <b>Bauplatz</b> nur dieses Gebäude, der Bergfried (oder <kbd>E</kbd>) die ganze Burg. Ein Klick auf den Boden dazwischen führt dich einfach dorthin, etwa um hinter den Mauern Schutz zu suchen. Häuser, Kirchen und Burggebäude kann niemand durchschreiten.</li>
        <li>Siedlungen vergeben <b>Aufträge</b>. Sie bringen Gold, Ruhm und Ansehen.</li>
        <li><b>Handel</b> lohnt sich: Was ein Ort erzeugt, ist dort billig und anderswo gefragt. Stein und Eisen brauchst du für den Burgbau.</li>
        <li>Rüste dein Gefolge in der Gefolge-Tafel mit besseren Waffen und Rüstungen aus. Bogenschützen bleiben auf Abstand.</li>
        <li>Wer einer Fraktion hilft, verärgert ihre Rivalen. Ab +${ALLY_AT} wird eine Fraktion zum Verbündeten und gewährt Vorteile.</li>
        <li>Mit einem Bogen kannst du <b>Hirsche und Enten jagen</b>. Fleisch und Felle lagerst du in ${esc(homeName())} ein oder verkaufst sie in Städten, die danach fragen. Wilderei sehen die Normannen nicht gern, und Vieh gehört den Dörfern.</li>
        <li>Feinde überfallen ${esc(homeName())}. Wachtürme und eine Garnison halten sie ab. Die Türme schießen auf jeden Feind in Reichweite, und <b>innerhalb deiner Mauern</b> kämpfst du mit jeder Burgstufe besser.</li>
        <li>Du und dein Gefolge braucht jeden Tag eine <b>Ration</b> pro Kopf aus dem Burglager: Getreide oder Fleisch. <b>Felder</b>, die <b>Schafzucht</b> und die Jagd füllen die Vorräte, sonst wird teuer zugekauft. Verwundete pflegt das <b>Hospiz</b>.</li>
        <li>Die Fraktionen <b>bekämpfen einander</b>: Banden überfallen Händler, Sachsen und Normannen gehen aufeinander los. Trupps einer Fraktion, die dich mag, kommen dir im Kampf zu Hilfe, verfeindete schließen sich deinen Angreifern an.</li>
        <li>Nach <b>Frankreich und Flandern</b> geht es nur per Schiff: von Dover nach Calais, von Portsmouth nach Barfleur oder von London nach Brügge. Drüben warten Paris, Rouen, die Messe von Troyes und die Krone Frankreichs.</li>
        <li>Der <b>Kompass</b> unten rechts zeigt, wo Norden liegt. In der Schrägansicht ist das rechts oben.</li>
        <li>Ab und zu ziehen zwei <b>Heere</b> heran und schlagen sich. Du kannst zusehen oder eingreifen: Wer ein Heer zerschlägt, gewinnt viel Ruhm und die Gunst der Gegenseite. Bei <b>Belagerungen</b> schließen sich die Tore, die Besatzung bezieht Stellung hinter der Mauer, und das Trebuchet schlägt eine <b>Bresche</b>. Durch sie stürmen die Angreifer. Danach bauen die Bewohner wieder auf, und die Toten werden auf dem Friedhof begraben. Sind dir Normannen oder Sachsen feindlich, ziehen sie auch gegen deine Burg. Durch die <b>Pforte</b> am Tor (<kbd>E</kbd>) kommst du hinein.</li>
        <li>Ab der Holzburg kannst du das <b>Burgtor</b> selbst schließen: in der Burgtafel unter Ausbau oder mit <kbd>B</kbd> in der Nähe der Burg. Geschlossen gibt es +10 Verteidigung, aber kein Marktgeld. Du selbst gehst durch die Pforte, ein Klick aufs Ziel genügt.</li>
        <li>Belagerungen, Schlachten und Turniere sind auf der Karte <b>markiert</b>, ein Pfeil am Bildrand zeigt die Richtung. Im <b>Feldlager</b> der Belagerer (<kbd>E</kbd>) oder in der belagerten Stadt wählst du deine Seite: den Verteidigern beistehen (durch die Pforte hinein, gemeinsam die Bresche halten, die Stadt dankt dir) oder den Belagerern dienen (du gibst das Zeichen zum Sturm und bekommst einen Beuteanteil).</li>
        <li><b>Burgen erobern:</b> Vor jeder Grafschaftsburg kannst du ein <b>Aufgebot</b> zusammenrufen (ab Ruhm 15): 12, 20 oder 30 Söldner mit Trebuchet, dazu dein Gefolge und Männer deiner Verbündeten, wenn sie mit den Herren der Burg verfeindet sind. Im Feldlager gibst du das Zeichen zum Sturm. Fällt die Burg, gehören dir Burg und Grafschaft, und die überlebenden Söldner bleiben als Besatzung. Zuerst wohl <b>Pontefract</b>: Dann gehört dir das West Riding, und der Vogt verlangt nichts mehr.</li>
        <li><b>Eroberte Burgen halten:</b> Setz einen Gefolgsmann als <b>Kastellan</b> ein (sonst führt ein gedungener Burgvogt die Burg, schlechter und gegen Lohn) und gib ihm eine Vorgabe: <i>Ausgewogen</i>, <i>Burg ausbauen</i> (Graben, Wehrgang, Torhaus, zuletzt ein Donjon, der die Burg zur Festung macht), <i>Holz erzeugen</i> (Fuhren nach Hause) oder <i>Verteidigung</i> (bis 30 Mann). Die früheren Herren greifen von Zeit zu Zeit an, und ihre Heere werden stärker. Bist du in der Nähe, kommt es zur Belagerung, bei der du hilfst; sonst entscheiden Mauern, Besatzung und Kastellan. Fällt die Burg, ist die Grafschaft fort, und der Kastellan schlägt sich verwundet heim.</li>
        <li><b>Gefährten auf Reisen</b> (Gefolge, Reiter „Reisen &amp; Handel“, oder „Jemanden schicken“ bei einem Auftrag): Gefährten aus Gefolge oder Garnison bringen Briefe und Lieferungen, stellen mit bis zu zwei Begleitern eine Bande oder fahren als <b>Händler</b>: Fracht aus dem Burglager an einem Ort verkaufen, dort mit allem Geld einkaufen, das Eingekaufte heimbringen oder an einem zweiten Ort verkaufen. Mit „Wiederholen“ wird daraus eine <b>feste Route</b>. Unterwegs lauern Wegelagerer; die Tafel nennt Dauer, Zehrgeld, Gefahr und Aussicht. Erledigte Aufträge bringen Gold und Ansehen, aber nur den halben Ruhm. Alle kehren in die Garnison zurück; auf der Karte siehst du, wo sie gerade sind.</li>
        <li><b>Der Krieg</b> (Karte, Reiter „Krieg“): In England kämpfen Richards Getreue gegen Prinz Johns Barone, in der Normandie das normannische Aufgebot gegen König Philipp. Heere ziehen gegen die Burgen der Gegenseite (Pfeile auf der Karte); fällt eine, wechselt die Grafschaft den Herrn. In deiner Nähe wird belagert, sonst entscheiden Stärke, Kriegsglück und Mauern. Gewonnene Feldschlachten bringen Kriegsglück. Schwör einer Seite den <b>Treueid</b>: Dann zählen deine Grafschaften für sie, ihre Feinde ziehen auch gegen dich, und mit <b>Heerfolge</b> stärkst du sie eine Woche lang. Ziel: ein geeintes England unter Richard und die zurückgewonnene Normandie, oder ganz England für Johann.</li>
        <li>Die Welt baut ständig: Auf Bauplätzen wachsen neue Häuser, anderswo brennt eines ab oder wird abgerissen und neu errichtet. Bricht in deiner Nähe ein <b>Feuer</b> aus, laufen alle mit Eimern herbei. Du kannst den <b>Wiederaufbau stiften</b>.</li>
        <li>Wer einen Ort <b>überfällt</b>, plündert Gold und Waren, doch danach liegt der Ort darnieder: Lange wird dort nichts gebaut, die Leute haben Angst, und wer Bewohner erschlägt, macht es schlimmer. Mit <b>Sühne</b> lässt sich das wiedergutmachen.</li>
        <li>Herolde kündigen <b>Turniere</b> an. Mit Pferd und Startgeld reitest du mit: Senke die Lanze (Leertaste oder Klick), wenn die Marke im goldenen Feld steht. Der Sieger gewinnt Gold und viel Ruhm.</li>
        <li>Diebe und Wilderer werden am <b>Galgen</b> vor der Stadt gehängt. Wer den Verurteilten befreit, hat die Wachen am Hals, aber die Waldleute auf seiner Seite.</li>
        <li><b>Bettler</b> sitzen vor den Stadttoren und Kirchen. Almosen freuen die Kirche, und manchmal weiß ein Bettler etwas Nützliches.</li>
        <li>Das <b>Wetter</b> wechselt: Regen, Nebel und im Winter Schnee, der nach und nach liegen bleibt und im Frühling taut. Bei Regen bleiben viele Leute drinnen.</li>
        <li>Im <b>Gasthaus</b> übernachtest du mit deinem Gefolge: voll geheilt, bis zum Abend ausgeruht (+10 % Angriff und Abwehr, +15 % Erfahrung), und der Wirt erzählt Gerüchte.</li>
      </ol></div>
    </div>`,
  };
}

function victoryPanel() {
  const v = G.ui.arg;
  if (v && v.th) {
    const T = THEATERS[v.th];
    return {
      title: v.th === 'england' ? (v.side === 'richard' ? 'Ein geeintes England' : 'England unter Johann') : 'Die Normandie', tabs: [],
      body: `<div class="victory"><p class="lede">${v.th === 'england' ? (v.side === 'richard' ? 'Keine Burg in England hält mehr zu Prinz Johann. König Richard reitet in Westminster ein, und als er an dir vorbeikommt, zügelt er sein Pferd und nennt dich beim Namen.' : 'Ganz England gehorcht Prinz Johann, und du sitzt an seiner Tafel. Die Getreuen des Königs sind zerstreut, ihre Burgen gehören seinen Baronen und dir.') : 'Von Caen bis Gisors weht wieder das Banner des Herzogs der Normandie. König Philipp ist hinter den Vexin zurückgeworfen, und in Rouen läuten die Glocken für die Sieger.'}</p>
        <p>${esc(T.name)} ist entschieden. Du hast in ${G.s.day} Tagen ${fmt(G.s.renown)} Ruhm gesammelt und hältst ${Object.keys(SHIRES).filter((id) => shireOwner(id) === 'spieler').length} Grafschaften.</p>
        <button class="btn primary" data-act="resume">Weiterregieren</button></div>`,
    };
  }
  return {
    title: `${G.s.player.female ? 'Herrin' : 'Herr'} von ${homeName()}`, tabs: [],
    body: `<div class="victory"><p class="lede">Die Festung ${esc(homeName())} steht, und zwei mächtige Verbündete stehen hinter dir. Als die Nachricht kommt, dass König Richard frei ist und nach England zurückkehrt, reiten Boten aus ganz England und aus der Normandie zu deinem Tor.</p>
      <p>Du hast in ${G.s.day} Tagen ${G.s.stats.quests} Aufträge erfüllt und ${fmt(G.s.renown)} Ruhm gesammelt.</p>
      <button class="btn primary" data-act="resume">Weiterregieren</button></div>`,
  };
}

// ---------------------------------------------------------------- Aktionen
function questById(id) { return G.s.quests.find((q) => q.id === Number(id)); }

const ACTIONS = {
  close: () => closePanel(),
  resume: () => closePanel(),
  mpleave: () => { if (G.mpLeaveNow) G.mpLeaveNow(); refreshPanel(); },
  pvpopen: () => openPanel('map', null, 'mitspieler'),
  pvpfehde: (d) => confirmDialog(`${(pvpPlayers().find((p) => p.seat === d.seat) || {}).name || 'Ihm'} die Fehde erklären? Dann dürft ihr einander angreifen, auch euer Gefolge.`, 'Fehde', () => pvpDeclareFeud(d.seat)),
  pvpfrieden: (d) => pvpOffer(d.seat, 'frieden'),
  pvpbund: (d) => pvpOffer(d.seat, 'buendnis'),
  pvplos: (d) => { pvpEndAlliance(d.seat); },
  pvpja: (d) => { pvpAccept(d.seat); refreshPanel(); },
  pvpnein: (d) => { pvpDecline(d.seat); refreshPanel(); },
  pvpgold: (d) => { pvpGift(d.seat, Number(d.g)); refreshPanel(); },
  tab: (d) => { G.ui.tab = d.tab; refreshPanel(); byId('panel-body').scrollTop = 0; },
  chronik: () => openPanel('chronik'),
  gift: () => giveGift(G.ui.arg),
  bgift: (d) => { baronGiveGift(d.b); refreshPanel(); },
  bally: (d) => { offerAlliance(d.b); refreshPanel(); },
  bfeud: (d) => confirmDialog(`${BARONS[d.b].name} die Fehde ansagen? Er wird gegen deine Burgen ziehen, und seine Freunde sehen das ungern.`, 'Fehde', () => { declareFeud(d.b); refreshPanel(); }),
  bpeace: (d) => { makePeace(d.b); refreshPanel(); },
  barongo: (d) => { const s = G.world.sites.find((x) => x.baron === d.b); if (s) { closePanel(); travelTo({ x: s.x, y: s.y + 6 }, null); } },
  donate: () => donate(G.ui.arg),
  tjoin: () => joinTourney(),
  sdef: () => joinSiege('def'),
  satt: () => {
    const sg = G.siege;
    if (!sg) return;
    confirmDialog(`Wirklich gegen ${sg.site.name} ziehen? Die ${FACTIONS[sg.site.faction].name} werden dir das übel nehmen (Ansehen −8 sofort, −6, wenn die Stadt fällt), und die Besatzung greift dich an.`, 'Dienen', () => { joinSiege('att'); refreshPanel(); });
  },
  ssturm: () => callStorm(),
  tor: () => {
    const sg = G.siege;
    if (homeGateClosed() && sg && sg.site.type === 'spieler' && sg.stage !== 'anmarsch') {
      confirmDialog('Das Tor mitten in der Belagerung öffnen? Dann können die Angreifer durchs Tor herein.', 'Öffnen', () => { setHomeGate(false); refreshPanel(); });
      return;
    }
    setHomeGate(!homeGateClosed());
  },
  lease: () => leaseMine(G.ui.arg),
  hrat: () => hermitAdvice(G.ui.arg),
  hsegen: () => hermitBless(G.ui.arg),
  hspende: () => hermitGift(G.ui.arg),
  atone: () => atone(G.ui.arg),
  raid: () => {
    const site = G.ui.arg, f = site.faction;
    confirmDialog(`${site.name} wirklich überfallen? Die ${FACTIONS[f].name} werden dich hassen (Ansehen −25${site.type === 'abtei' ? ', bei einer Abtei −35' : ''}), die Kirche ebenso. Wer Bewohner erschlägt, macht es schlimmer. Hier wird danach lange nichts mehr gebaut.`, 'Überfallen', () => { closePanel(); startRaid(site); });
  },
  sail: (d) => { if (sail(G.ui.arg.id, d.to)) closePanel(); },
  mapzoom: (d) => {
    if (d.d === 'home') { mapState.cx = G.s.player.x; mapState.cy = G.s.player.y; mapState.zoom = Math.max(mapState.zoom, 2); }
    else mapState.zoom = Math.max(1, Math.min(5, mapState.zoom * (d.d === '1' ? 1.5 : 1 / 1.5)));
    if (G.ui.redrawMap) G.ui.redrawMap();
  },
  inn: () => {
    const site = G.ui.arg, cost = innCost();
    if (G.s.gold < cost) return;
    G.s.gold -= cost;
    const h = hourOf();
    passHours(((7 - h + 24) % 24) || 24);
    const p = G.s.player;
    p.hp = p.st.maxHp;
    for (const c of partyMembers()) c.hp = c.st.maxHp;
    G.s.buff = { day: G.s.day };
    log(`Ihr übernachtet im ${site.tavern.name} und seid ausgeruht bis zum Abend. Der Wirt raunt: „${rumor(site)}“`, 'good');
    closePanel();
  },
  rest: () => {
    passHours(4);
    const p = G.s.player;
    p.hp = p.st.maxHp;
    for (const c of partyMembers()) c.hp = c.st.maxHp;
    log('Ihr rastet vier Stunden und kommt wieder zu Kräften.', 'good');
  },
  buy: (d) => { const site = G.ui.panel === 'castle' ? castleSite() : G.ui.arg; buy(site, d.good, Number(d.n)); },
  sell: (d) => { const site = G.ui.panel === 'castle' ? castleSite() : G.ui.arg; sell(site, d.good, d.n === 'all' ? 9999 : Number(d.n)); },
  buyitem: (d) => { const site = G.ui.panel === 'castle' ? castleSite() : G.ui.arg; buyItem(site, d.id); },
  sellitem: (d) => sellItem(Number(d.i)),
  campbuy: (d) => buyAtCamp(G.ui.arg, d.good, Number(d.n)),
  camphire: (d) => hireAtCamp(G.ui.arg, Number(d.i)),
  mercHire: (d) => hireInTown(G.ui.arg, Number(d.i)),
  sellstore: (d) => { const site = G.ui.panel === 'castle' ? castleSite() : G.ui.arg, r = sellStored(site, d.good, 9999); if (r.sold) log(`Aus dem Lager verkauft: ${r.sold} ${GOODS[d.good].name} für ${fmt(r.earned)} Gold.`, 'gold'); },
  sellstoreall: () => {
    const site = G.ui.panel === 'castle' ? castleSite() : G.ui.arg;
    let n = 0, gold = 0;
    for (const g of GOOD_IDS) { const r = sellStored(site, g, 9999, storeKeep(g)); n += r.sold; gold += r.earned; }
    if (n) log(`Das Lager ist verkauft: ${n} Waren für ${fmt(gold)} Gold (Vorrat für sieben Tage behalten).`, 'gold');
  },
  accept: (d) => acceptQuest(G.ui.arg.id, Number(d.q)),
  deliver: (d) => { const q = questById(d.q); if (q) deliverQuest(q); },
  claim: (d) => { const q = questById(d.q); if (q) claimQuest(q); },
  letter: (d) => { const q = questById(d.q); if (q) deliverLetter(q); },
  abandon: (d) => { const q = questById(d.q); if (q) confirmDialog(`Den Auftrag „${q.title}“ aufgeben? Das kostet etwas Ansehen.`, 'Aufgeben', () => { abandonQuest(q); refreshPanel(); }); },
  goevent: (d) => {
    const e = eventTargets().find((x) => x.k === d.k);
    if (!e) return;
    if (setPlayerPath(e.t.x, e.t.y)) {
      G.pendingSite = e.site || null;
      G.pendingCamp = !!e.camp;
      closePanel();
    } else log('Dorthin führt kein Weg.', 'bad');
  },
  goto: (d) => {
    const q = questById(d.q);
    if (!q) return;
    const t = questTarget(q);
    if (setPlayerPath(t.x, t.y)) {
      const site = G.world.sites.find((s) => Math.hypot(s.x - t.x, s.y - t.y) < 1);
      G.pendingSite = site || null;
      closePanel();
    } else log('Dorthin führt kein Weg.', 'bad');
  },
  build: (d) => startBuild(d.id, d.plot !== undefined ? +d.plot : null),
  plot: (d) => { G.ui.arg = { focus: 'plot', plot: +d.plot }; G.ui.tab = 'ausbau'; byId('panel-body').scrollTop = 0; },
  repair: (d) => startRepair(+d.plot),
  demolish: (d) => { const b = castlePlots()[+d.plot]; if (b) confirmDialog(`${BUILDINGS[b.id].name} abreißen? Das Gebäude ist dann fort, es gibt nichts zurück.`, 'Abreißen', () => { demolish(+d.plot); refreshPanel(); }); },
  settype: (d) => {
    const lost = typeChangeLosses(d.type), t = CASTLE_TYPES[d.type];
    const go = () => { startTypeChange(d.type); refreshPanel(); };
    if (lost.length) confirmDialog(`Zur ${t.name} umbauen? Kein Platz mehr für: ${lost.map((x) => BUILDINGS[x.id].name).join(', ')}. Diese Gebäude werden abgerissen.`, 'Umbauen', go);
    else go();
  },
  castleall: () => { G.ui.arg = null; G.ui.tab = 'ausbau'; byId('panel-body').scrollTop = 0; },
  hire: (d) => hire(Number(d.i)),
  besiege: (d) => {
    const site = G.ui.arg, n = Number(d.n);
    confirmDialog(site.baron ? `${site.name} mit ${n} Söldnern belagern? Das kostet ${levyCost(n)} Gold. Fällt die Burg, wird ${BARONS[site.baron].name} dein Vasall.` : `${site.name} mit ${n} Söldnern belagern? Das kostet ${levyCost(n)} Gold, und die ${FACTIONS[site.faction].short} werden dir das nicht verzeihen (Ansehen −25 sofort).`, 'Belagern', () => { if (startOwnSiege(site, n)) closePanel(); else refreshPanel(); });
  },
  sabort: () => confirmDialog('Die Belagerung aufgeben? Die Söldner ziehen ab, das Handgeld ist fort.', 'Aufgeben', () => { abortOwnSiege(); closePanel(); }),
  warswear: (d) => {
    const al = ALLEGIANCE[d.side];
    confirmDialog(allegiance() ? `Den Eid brechen und zu ${al.name} wechseln? Das kostet Ruhm und Freunde.` : `${al.name} den Treueid schwören? Seine Feinde werden auch deine.`, allegiance() ? 'Wechseln' : 'Schwören', () => { swearTo(d.side); refreshPanel(); });
  },
  warsupport: () => sendSupport(),
  wargo: (d) => { const s = siteById(d.s); if (s) travelTo({ x: s.x, y: s.y + 6 }, null); },
  tquest: (d) => { const f = (G.ui.qf || {})[d.q] || {}; startTrip({ kind: 'auftrag', quest: Number(d.q), who: [f.who, f.e1, f.e2].filter(Boolean) }); },
  ttrade: () => { const f = G.ui.form || {}; if (startTrip({ kind: 'handel', who: [f.who, f.e1].filter(Boolean), good: f.good, qty: f.qty === 'alle' ? 9999 : f.qty, budget: f.budget, to: f.to, buy: f.buy, to2: f.to2, repeat: f.repeat })) { G.ui.form = { qty: f.qty, budget: f.budget, repeat: false }; } },
  tsend: () => { openPanel('party', null, 'reisen'); },
  tstop: (d) => stopRoute(d.t),
  trecall: (d) => recallTrip(d.t),
  hcast: (d) => { const u = G.s.companions.find((c) => c.id === Number(d.u)); if (u) appointCastellan(G.ui.arg, u); },
  hrecall: () => recallCastellan(G.ui.arg),
  horder: (d) => setHoldingOrder(G.ui.arg, d.o),
  hrepair: () => repairHolding(G.ui.arg),
  hrecruit: () => recruitHolding(G.ui.arg),
  hwork: () => payWork(G.ui.arg),
  sel: (d) => { G.ui.sel = Number(d.u); },
  equip: (d) => equip(selectedUnit(), Number(d.i)),
  unequip: (d) => unequip(selectedUnit(), d.slot),
  status: (d) => { const u = selectedUnit(); if (u.kind !== 'player') setCompanionStatus(u, d.s); },
  dismiss: () => {
    const u = selectedUnit();
    if (u.kind === 'player') return;
    confirmDialog(`${u.name} aus dem Dienst entlassen?`, 'Entlassen', () => { dismiss(u); G.ui.sel = G.s.player.id; refreshPanel(); });
  },
  store: (d) => storeCargo(d.good, 9999),
  load: (d) => loadCargo(d.good, Number(d.n)),
  storeall: () => { for (const g of GOOD_IDS) storeCargo(g, 9999); },
  save: () => { if (G.saveGame) G.saveGame(false); },
  loadgame: () => { if (G.loadGame) confirmDialog('Den letzten Spielstand laden? Nicht gespeicherter Fortschritt geht verloren.', 'Laden', () => { G.loadGame(); closePanel(); }); },
  help: () => openPanel('help'),
  cheats: () => openPanel('cheat'),
  cheat: (d) => { toggleCheat(d.c); updateHUD(); },
  cheatdo: (d) => { cheatDo(d.do); updateHUD(); },
  music: () => { if (G.toggleMusic) G.toggleMusic(); },
  sfx: () => { if (G.toggleSfx) G.toggleSfx(); },
  gfx: (d) => { if (G.setGfx) G.setGfx(d.mode); },
  newgame: () => confirmDialog('Ein neues Spiel beginnen? Der aktuelle Fortschritt geht verloren, wenn du nicht gespeichert hast.', 'Neues Spiel', () => { closePanel(); if (G.showTitle) G.showTitle(); }),
};

export function initUI() {
  G.onLog = renderLog;
  // Ein Klick auf eine Meldung öffnet die Chronik
  byId('log').addEventListener('click', (e) => { if (e.target.closest('.msg') && G.started) openPanel('chronik'); });
  G.rumor = rumor;
  byId('panel').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const f = ACTIONS[b.dataset.act];
    if (!f) return;
    f(b.dataset);
    if (b.dataset.act !== 'close' && G.ui.panel) refreshPanel();
  });
  // Formulare in Tafeln (Reisen & Handel): Auswahl merken und die Schätzung neu rechnen
  byId('panel').addEventListener('change', (e) => {
    const el = e.target.closest('[data-field]');
    if (!el) return;
    const parts = el.dataset.field.split('.');
    const val = el.type === 'checkbox' ? el.checked : el.value;
    if (parts[0] === 'f') (G.ui.form = G.ui.form || {})[parts[1]] = val;
    else if (parts[0] === 'q') { const qf = (G.ui.qf = G.ui.qf || {}); (qf[parts[1]] = qf[parts[1]] || {})[parts[2]] = val; }
    refreshPanel();
  });
  byId('dialog-yes').addEventListener('click', () => closeDialog(true));
  byId('dialog-no').addEventListener('click', () => closeDialog(false));
}

