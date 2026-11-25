// Oberfläche: Kopfleiste, Meldungen, Tafeln (Siedlung, Burg, Gefolge, Aufträge, Politik, Karte, Menü).

import { G, log } from './state.js';
import {
  FACTIONS, FACTION_IDS, GOODS, GOOD_IDS, ITEMS, SLOTS, SLOT_NAME, CLASSES, BUILDINGS, BUILDING_IDS,
  TYPE_NAME, SEASONS,
} from './data.js';
import {
  buy, sell, buyPrice, sellPrice, cargoUsed, shopItems, itemBuyPrice, itemSellPrice, buyItem, sellItem, siteById,
} from './economy.js';
import {
  repStatus, isHostileFaction, isAlly, alliesCount, acceptQuest, canDeliver, deliverQuest, claimQuest,
  deliverLetter, abandonQuest, questTarget, refreshTownQuests, giftCost, giveGift, ALLY_AT, HOSTILE_AT,
} from './politics.js';
import {
  bLevel, levelName, partyCap, cargoCap, buildInfo, startBuild, hire, setCompanionStatus, dismiss,
  castleDefense, dailyBalance, storeCargo, loadCargo, castleSite, conProgress, villageHouses,
} from './castle.js';
import { partyMembers, equip, unequip, previewEquip, xpNeeded, setPlayerPath } from './units.js';
import { seasonIndex, yearOf, clockText, passHours } from './sim.js';
import { drawMap, miniToWorld } from './render.js';

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
  set('hud-date', `Tag ${s.day} · ${SEASONS[seasonIndex()]} ${yearOf()}`);
  set('hud-clock', clockText());
  const mode = byId('hud-mode');
  const label = G.fast ? 'Zeitraffer' : '';
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
  for (const el of byId('log').children) el.classList.toggle('old', now - Number(el.dataset.t) > 14000);
}

export function renderLog() {
  const el = byId('log');
  const msgs = G.messages.slice(-7);
  el.innerHTML = msgs.map((m) => `<p class="msg ${m.kind}" data-t="${m.t}">${esc(m.text)}</p>`).join('');
}

export function showPrompt(text) {
  const el = byId('prompt');
  if (!text) { el.hidden = true; return; }
  el.hidden = false;
  if (el.dataset.text !== text) { el.dataset.text = text; el.innerHTML = text; }
}

// ---------------------------------------------------------------- Dialog
let dialogYes = null;
export function confirmDialog(text, yesLabel, onYes) {
  byId('dialog-text').textContent = text;
  byId('dialog-yes').textContent = yesLabel;
  dialogYes = onYes;
  byId('dialog').hidden = false;
  byId('dialog-yes').focus();
}
export function dialogOpen() { return !byId('dialog').hidden; }
export function closeDialog(accept) {
  byId('dialog').hidden = true;
  const f = dialogYes;
  dialogYes = null;
  if (accept && f) f();
}

// ---------------------------------------------------------------- Tafeln
const DEFAULT_TAB = { town: 'info', castle: 'ausbau', party: 'gefolge', quests: 'list', politics: 'list', map: 'map', menu: 'menu', help: 'help', victory: 'v' };

export function openPanel(kind, arg = null, tab = null) {
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
    map: mapPanel, menu: menuPanel, help: helpPanel, victory: victoryPanel,
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

function dirText(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d < 4) return 'ganz in der Nähe';
  const sx = dx - dy, sy = (dx + dy) / 2;
  const a = (Math.atan2(sx, -sy) * 180) / Math.PI;
  const names = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'];
  const name = names[(Math.round(((a + 360) % 360) / 45)) % 8];
  return `${Math.round(d)} Felder Richtung ${name}`;
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
  const f = site.faction;
  const town = G.s.towns[site.id];
  const sub = `${esc(TYPE_NAME[site.type])} · ${swatch(f)}${esc(FACTIONS[f].name)} · ${repPill(f)}`;
  if (isHostileFaction(f)) {
    return {
      title: site.name, sub, tabs: [],
      body: `<div class="notice bad"><p>Die Wachen von ${esc(site.name)} verwehren dir den Zutritt. Die ${esc(FACTIONS[f].name)} sind dir feindlich gesinnt.</p><p>Erledige Aufträge für ihre Freunde, mach Geschenke an verbündete Höfe oder meide ihre Rivalen, damit sich das wieder ändert.</p></div>`,
    };
  }
  const tabs = [['info', 'Übersicht'], ['markt', 'Markt'], ['waren', 'Ausrüster'], ['auftraege', `Aufträge (${town.quests.length + relevantQuests(site).length})`]];
  let body = '';
  if (G.ui.tab === 'info') body = townInfo(site);
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
        <dt>Herrschaft</dt><dd>${swatch(f)}${esc(FACTIONS[f].name)}</dd>
        <dt>Dein Ansehen</dt><dd>${repPill(f)}</dd>
        <dt>Billig zu haben</dt><dd>${list(site.produces)}</dd>
        <dt>Gesucht</dt><dd>${list(site.demands)}</dd>
      </dl>
    </div>
    <div class="actions">
      <h3>Am Hof</h3>
      <div class="action"><div><b>Geschenk an den Herrn</b><p>Ein Fass Wein, ein Ballen Tuch. Ansehen bei den ${esc(FACTIONS[f].short)} +3 bis +5, ihre Rivalen sehen das weniger gern. Einmal am Tag.</p></div><button class="btn" data-act="gift" ${G.s.towns[site.id].giftDay === G.s.day ? 'disabled' : ''}>${fmt(giftCost(site))} Gold</button></div>
      <div class="action"><div><b>Rasten</b><p>Vier Stunden ausruhen. Du und dein Gefolge kommen wieder zu Kräften.</p></div><button class="btn" data-act="rest">Rasten</button></div>
    </div>
  </div>`;
}

function marketTable(site) {
  const town = G.s.towns[site.id];
  const rows = GOOD_IDS.map((g) => {
    const tag = site.produces.includes(g) ? '<span class="tag cheap">billig</span>' : site.demands.includes(g) ? '<span class="tag dear">gefragt</span>' : '';
    const have = G.s.cargo[g] || 0;
    return `<tr>
      <th scope="row">${GOODS[g].name} ${tag}</th>
      <td class="num">${town.stock[g]}</td>
      <td class="num">${buyPrice(site, g)}</td>
      <td class="btns"><button class="btn sm" data-act="buy" data-good="${g}" data-n="1">+1</button><button class="btn sm" data-act="buy" data-good="${g}" data-n="5">+5</button></td>
      <td class="num">${sellPrice(site, g)}</td>
      <td class="btns"><button class="btn sm" data-act="sell" data-good="${g}" data-n="1" ${have ? '' : 'disabled'}>−1</button><button class="btn sm" data-act="sell" data-good="${g}" data-n="all" ${have ? '' : 'disabled'}>alle</button></td>
      <td class="num strong">${have}</td>
    </tr>`;
  }).join('');
  return `<p class="meta">Ladung <b>${cargoUsed()}/${cargoCap()}</b> · Gold <b>${fmt(G.s.gold)}</b>${isAlly('gilde') ? ' · Gildenrabatt aktiv' : ''}</p>
  <div class="table-wrap"><table class="market">
    <thead><tr><th>Ware</th><th>Vorrat</th><th>Kauf</th><th></th><th>Verkauf</th><th></th><th>Ladung</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
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
  const tabs = [['ausbau', 'Ausbau'], ['halle', 'Rittersaal'], ['gefolge', 'Gefolge'], ['lager', 'Lager']];
  if (bLevel('schmiede') || bLevel('stall')) tabs.push(['ruest', 'Rüstkammer']);
  if (bLevel('markt')) tabs.push(['markt', 'Markt']);
  const site = castleSite();
  let body = '';
  switch (G.ui.tab) {
    case 'ausbau': body = castleBuild(); break;
    case 'halle': body = castleHall(); break;
    case 'gefolge': body = partyView(true); break;
    case 'lager': body = castleStore(); break;
    case 'ruest': body = shopView(site); break;
    case 'markt': body = marketTable(site); break;
    default: body = castleBuild();
  }
  return { title: `Burg Ashcombe`, sub: `${esc(levelName())} · Verteidigung ${castleDefense()} · Ruhm ${fmt(G.s.renown)}`, tabs, body };
}

function castleBuild() {
  const c = G.s.castle;
  const bal = dailyBalance();
  const inc = bal.income.reduce((a, [, v]) => a + v, 0), cost = bal.costs.reduce((a, [, v]) => a + v, 0);
  const con = c.construction;
  const conText = con ? `<div class="notice"><b>Im Bau:</b> ${con.id === 'burg' ? BUILDINGS.burg.levels[con.level].name : `${BUILDINGS[con.id].name} Stufe ${con.level}`}, fertig an Tag ${con.done}. Die Bauleute arbeiten schon auf dem Bauplatz.<div class="progress" role="progressbar" aria-valuenow="${Math.round(conProgress() * 100)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.round(conProgress() * 100)}%"></span></div></div>` : '';
  const cards = BUILDING_IDS.map((id) => {
    const info = buildInfo(id);
    const def = BUILDINGS[id];
    const isBurg = id === 'burg';
    const name = isBurg ? `${def.levels[info.cur].name}` : def.name;
    const now = isBurg ? def.levels[info.cur].eff : info.cur ? def.levels[info.cur].eff : 'Noch nicht errichtet';
    const nextName = isBurg && info.lv ? `Ausbau zur ${info.lv.name}` : 'Nächste Stufe';
    const btnLabel = info.ok ? (info.cur || isBurg ? 'Ausbauen' : 'Errichten') : esc(info.reasons[0]);
    return `<article class="bcard${info.cur ? ' built' : ''}">
      <header><b>${esc(name)}</b><span class="lvl">${isBurg ? `Stufe ${info.cur}/3` : `${info.cur}/3`}</span></header>
      ${def.desc ? `<p class="muted">${esc(def.desc)}</p>` : ''}
      <p><span class="label">Jetzt</span> ${esc(now)}</p>
      ${info.lv ? `<p><span class="label">${nextName}</span> ${esc(info.lv.eff)}</p>
      <div class="chips">${costChips(info.lv.cost)}<span class="chip">${info.lv.days} ${info.lv.days === 1 ? 'Tag' : 'Tage'}</span>${info.lv.need && info.lv.need.renown ? `<span class="chip ${G.s.renown >= info.lv.need.renown ? 'ok' : 'miss'}">${info.lv.need.renown} Ruhm</span>` : ''}${info.lv.need && info.lv.need.allies ? `<span class="chip ${alliesCount() >= info.lv.need.allies ? 'ok' : 'miss'}">${info.lv.need.allies} Verbündete</span>` : ''}</div>
      <button class="btn${info.ok ? ' primary' : ''}" data-act="build" data-id="${id}" ${info.ok ? '' : 'disabled'}>${btnLabel}</button>` : '<p class="muted">Vollständig ausgebaut.</p>'}
    </article>`;
  }).join('');
  const st = c.storage;
  return `${conText}
    <div class="summary">
      <div><span class="label">Tagesbilanz</span><b class="${inc - cost >= 0 ? 'pos' : 'neg'}">${inc - cost >= 0 ? '+' : ''}${inc - cost} Gold</b><span class="muted">${bal.income.map(([n, v]) => `${n} +${v}`).join(', ')}${bal.costs.length ? '; ' + bal.costs.map(([n, v]) => `${n} −${v}`).join(', ') : ''}</span></div>
      <div><span class="label">Burgsiedlung</span><b>${villageHouses()} Häuser</b><span class="muted">${G.s.castle.level < 3 ? `Mit der nächsten Burgstufe ziehen weitere Familien nach Ashcombe.` : 'Ashcombe ist ein blühender Ort.'}</span></div>
      <div><span class="label">Burglager</span><b>${st.holz || 0} Holz · ${st.stein || 0} Stein · ${st.eisen || 0} Eisen</b><span class="muted">Täglich ${bal.prod.holz ? `+${bal.prod.holz} Holz` : 'kein Holz'}, ${bal.prod.stein ? `+${bal.prod.stein} Stein` : 'kein Stein'}. Baustoffe in deiner Ladung zählen mit.</span></div>
      <div class="row"><button class="btn" data-act="rest">Rasten</button></div>
    </div>
    <div class="bgrid">${cards}</div>`;
}

function unitStatsLine(u) {
  return `LP ${u.st.maxHp} · Angriff ${Math.round(u.st.atk)} · Schutz ${Math.round(u.st.def)}${u.st.ranged ? ` · Reichweite ${u.st.range}` : ''}`;
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
    <p class="hint">Wer nicht mehr ins Gefolge passt, bleibt in der Garnison und verteidigt Ashcombe.${isAlly('waldleute') ? '' : ' Langbogenschützen kommen nur, wenn die Waldleute dir vertrauen.'}</p>`;
}

function castleStore() {
  const c = G.s.castle;
  const rows = GOOD_IDS.map((g) => {
    const st = c.storage[g] || 0, cg = G.s.cargo[g] || 0;
    return `<tr><th scope="row">${GOODS[g].name}</th><td class="num">${st}</td><td class="num">${cg}</td>
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
  return `<button class="ros${sel ? ' sel' : ''}" data-act="sel" data-u="${u.id}"><b>${esc(u.name)}</b><span>${CLASSES[u.cls].name} · St. ${u.level}${u.status === 'verwundet' ? ` · verwundet (${u.woundedDays} T.)` : ` · ${hp} %`}</span></button>`;
}

function partyView(atCastle) {
  const party = partyMembers();
  const gar = G.s.companions.filter((c) => c.status === 'garnison');
  const wnd = G.s.companions.filter((c) => c.status === 'verwundet');
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
    if (u.status === 'garnison') moves = atCastle ? '<button class="btn primary" data-act="status" data-s="party">Ins Gefolge holen</button>' : '<span class="muted">Ins Gefolge holen kannst du sie nur in Ashcombe.</span>';
    moves += ` <button class="btn danger" data-act="dismiss">Entlassen</button>`;
  }
  const xp = `${u.xp}/${xpNeeded(u.level)} EP`;
  return `<div class="party">
    <aside class="roster">
      <h4>Im Feld (${party.length}/${partyCap()})</h4>
      ${rosterButton(G.s.player)}${party.map(rosterButton).join('')}
      ${gar.length ? `<h4>Garnison</h4>${gar.map(rosterButton).join('')}` : ''}
      ${wnd.length ? `<h4>Verwundet</h4>${wnd.map(rosterButton).join('')}` : ''}
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
  const atCastle = G.nearSite && G.nearSite.type === 'spieler';
  return { title: 'Gefolge & Ausrüstung', sub: `Gold ${fmt(G.s.gold)} · Befehl: ${{ folgen: 'Folgen', halten: 'Stellung halten', angriff: 'Angriff' }[G.s.order]}`, tabs: [], body: partyView(atCastle) };
}

// ---------------------------------------------------------------- Aufträge
function questsPanel() {
  const p = G.s.player;
  const goal = `<div class="goal">
    <h3>Dein Ziel</h3>
    <p>Mach Ashcombe zur Festung und gewinne zwei Fraktionen als Verbündete. Dann ist dein Name im ganzen Norden bekannt.</p>
    <div class="chips"><span class="chip ${G.s.castle.level >= 3 ? 'ok' : ''}">Burg: ${esc(levelName())} (${G.s.castle.level}/3)</span><span class="chip ${alliesCount() >= 2 ? 'ok' : ''}">Verbündete ${alliesCount()}/2</span><span class="chip">Ruhm ${fmt(G.s.renown)}</span><span class="chip">${G.s.stats.quests} Aufträge erfüllt</span></div>
  </div>`;
  const list = G.s.quests.map((q) => {
    const t = questTarget(q);
    const state = q.state === 'erfuellt' ? `<span class="pill ally">Erledigt, Belohnung in ${esc(siteById(q.from).name)} abholen</span>` : '<span class="pill neutral">Aktiv</span>';
    return questCard(q, `${state}<span class="muted">Ziel: ${esc(t.label)}, ${dirText(p, t)}</span><button class="btn" data-act="goto" data-q="${q.id}">Hinreisen</button><button class="btn danger sm" data-act="abandon" data-q="${q.id}">Aufgeben</button>`);
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
let mapScale = 1;
function mapPanel() {
  return {
    title: 'Karte des Nordens', sub: 'Klicke auf einen Ort, um dorthin zu reisen.', tabs: [],
    body: `<div class="mapwrap"><canvas id="bigmap" width="960" height="480" aria-label="Karte"></canvas></div>
      <p class="legend">${FACTION_IDS.map((f) => `<span>${swatch(f)}${FACTIONS[f].short}</span>`).join('')}<span><span class="swatch" style="--c:#ffd65a"></span>Ashcombe</span><span><span class="ring"></span>Auftrag</span></p>`,
    after: () => {
      const cv = byId('bigmap');
      const wrap = cv.parentElement;
      const w = Math.min(960, wrap.clientWidth || 960);
      cv.width = w * 2; cv.height = w;
      cv.style.width = `${w}px`; cv.style.height = `${w / 2}px`;
      const c = cv.getContext('2d');
      c.scale(2, 2);
      mapScale = drawMap(c, w, w / 2, { big: true });
      cv.onclick = (e) => {
        const r = cv.getBoundingClientRect();
        const wp = miniToWorld(e.clientX - r.left, e.clientY - r.top, mapScale);
        let target = wp, site = null;
        for (const s of G.world.sites) if (Math.hypot(s.x - wp.x, s.y - wp.y) < 4) { site = s; target = s; }
        if (setPlayerPath(target.x, target.y + (site && site.type === 'spieler' ? 2.6 : 0))) {
          G.pendingSite = site;
          log(site ? `Du reist nach ${site.name}.` : 'Du brichst auf.');
          closePanel();
        } else log('Dorthin führt kein Weg.', 'bad');
      };
    },
  };
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
      <button class="btn" data-act="help">Steuerung & Tipps</button>
      <button class="btn danger" data-act="newgame">Neues Spiel</button>
    </div>
    <p class="hint">Das Spiel speichert jeden Morgen von selbst, aber nur in diesem Browser.</p>`,
  };
}

function helpPanel() {
  return {
    title: 'Steuerung & Tipps', tabs: [],
    body: `<div class="cols">
      <div><h3>Steuerung</h3><dl class="keys">
        <dt>Klick</dt><dd>Gehen, Gegner angreifen, Orte ansteuern</dd>
        <dt>W A S D</dt><dd>Direkt laufen</dd>
        <dt>E</dt><dd>Siedlung oder Burg betreten</dd>
        <dt>R</dt><dd>Auf- und absitzen</dd>
        <dt>Leertaste</dt><dd>Nächsten Feind angreifen</dd>
        <dt>Klick auf Tier</dt><dd>Mit dem Bogen jagen: Fleisch und Felle</dd>
        <dt>F oder 1 2 3</dt><dd>Gefolge: folgen, Stellung halten, angreifen</dd>
        <dt>T</dt><dd>Zeitraffer auf Reisen</dd>
        <dt>I J P M</dt><dd>Gefolge, Aufträge, Politik, Karte</dd>
        <dt>Mausrad, + −</dt><dd>Zoomen</dd>
        <dt>G</dt><dd>Grafik wechseln: klar, Pixel, Retro (Amiga-Stil)</dd>
        <dt>Esc</dt><dd>Tafel schließen, Menü</dd>
      </dl></div>
      <div><h3>So kommst du voran</h3><ol class="tips">
        <li>In Ashcombe zuerst ein <b>Holzfällerlager</b> und einen <b>Rittersaal</b> errichten. Dann zur <b>Holzburg</b> ausbauen.</li>
        <li>Siedlungen vergeben <b>Aufträge</b>. Sie bringen Gold, Ruhm und Ansehen.</li>
        <li><b>Handel</b> lohnt sich: Was ein Ort erzeugt, ist dort billig und anderswo gefragt. Stein und Eisen brauchst du für den Burgbau.</li>
        <li>Rüste dein Gefolge in der Gefolge-Tafel mit besseren Waffen und Rüstungen aus. Bogenschützen bleiben auf Abstand.</li>
        <li>Wer einer Fraktion hilft, verärgert ihre Rivalen. Ab +${ALLY_AT} wird eine Fraktion zum Verbündeten und gewährt Vorteile.</li>
        <li>Mit einem Bogen kannst du <b>Hirsche und Enten jagen</b>. Fleisch und Felle lagerst du in Ashcombe ein oder verkaufst sie in Städten, die danach fragen. Wilderei sehen die Normannen nicht gern, und Vieh gehört den Dörfern.</li>
        <li>Feinde überfallen Ashcombe. Wachtürme und eine Garnison halten sie ab.</li>
      </ol></div>
    </div>`,
  };
}

function victoryPanel() {
  return {
    title: 'Herr von Ashcombe', tabs: [],
    body: `<div class="victory"><p class="lede">Die Festung Ashcombe steht, und zwei mächtige Verbündete stehen hinter dir. Als die Nachricht kommt, dass König Richard frei ist und nach England zurückkehrt, reiten Boten aus dem ganzen Norden zu deinem Tor.</p>
      <p>Du hast in ${G.s.day} Tagen ${G.s.stats.quests} Aufträge erfüllt und ${fmt(G.s.renown)} Ruhm gesammelt.</p>
      <button class="btn primary" data-act="resume">Weiterregieren</button></div>`,
  };
}

// ---------------------------------------------------------------- Aktionen
function questById(id) { return G.s.quests.find((q) => q.id === Number(id)); }

const ACTIONS = {
  close: () => closePanel(),
  resume: () => closePanel(),
  tab: (d) => { G.ui.tab = d.tab; refreshPanel(); byId('panel-body').scrollTop = 0; },
  gift: () => giveGift(G.ui.arg),
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
  accept: (d) => acceptQuest(G.ui.arg.id, Number(d.q)),
  deliver: (d) => { const q = questById(d.q); if (q) deliverQuest(q); },
  claim: (d) => { const q = questById(d.q); if (q) claimQuest(q); },
  letter: (d) => { const q = questById(d.q); if (q) deliverLetter(q); },
  abandon: (d) => { const q = questById(d.q); if (q) confirmDialog(`Den Auftrag „${q.title}“ aufgeben? Das kostet etwas Ansehen.`, 'Aufgeben', () => { abandonQuest(q); refreshPanel(); }); },
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
  build: (d) => startBuild(d.id),
  hire: (d) => hire(Number(d.i)),
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
  gfx: (d) => { if (G.setGfx) G.setGfx(d.mode); },
  newgame: () => confirmDialog('Ein neues Spiel beginnen? Der aktuelle Fortschritt geht verloren, wenn du nicht gespeichert hast.', 'Neues Spiel', () => { closePanel(); if (G.showTitle) G.showTitle(); }),
};

export function initUI() {
  G.onLog = renderLog;
  byId('panel').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const f = ACTIONS[b.dataset.act];
    if (!f) return;
    f(b.dataset);
    if (b.dataset.act !== 'close' && G.ui.panel) refreshPanel();
  });
  byId('dialog-yes').addEventListener('click', () => closeDialog(true));
  byId('dialog-no').addEventListener('click', () => closeDialog(false));
}

