// Märkte, Preise, Ladung, Ausrüstungshandel.

import { G, log } from './state.js';
import { GOODS, GOOD_IDS, ITEMS, SHOPS } from './data.js';
import { clamp } from './rng.js';
import { isAlly } from './politics.js';
import { cargoCap, bLevel } from './castle.js';

export function siteById(id) { return G.world.sites.find((s) => s.id === id); }

function targetStock(site, good) {
  if (site.produces.includes(good)) return 60;
  if (site.demands.includes(good)) return 8;
  return 24;
}

export function initTowns() {
  G.s.towns = {};
  for (const s of G.world.sites) {
    const stock = {};
    for (const g of GOOD_IDS) stock[g] = Math.round(targetStock(s, g) * (0.7 + Math.random() * 0.6));
    G.s.towns[s.id] = { stock, quests: [], questDay: 0, giftDay: -1 };
  }
}

// Fehlende Orte und Waren (z. B. nach einem Update) im Bestand ergänzen
export function ensureTownStock() {
  for (const s of G.world.sites) {
    if (!G.s.towns[s.id]) G.s.towns[s.id] = { stock: {}, quests: [], questDay: 0, giftDay: -1 };
    const town = G.s.towns[s.id];
    for (const g of GOOD_IDS) if (town.stock[g] == null) town.stock[g] = targetStock(s, g);
  }
}

export function price(site, good) {
  const base = GOODS[good].base;
  const f = site.produces.includes(good) ? 0.65 : site.demands.includes(good) ? 1.55 : 1.0;
  const tgt = targetStock(site, good);
  const s = G.s.towns[site.id].stock[good];
  const scarcity = clamp(1 + ((tgt - s) / (tgt + 20)) * 0.7, 0.55, 1.9);
  return base * f * scarcity;
}

export function buyPrice(site, good) {
  return Math.max(1, Math.ceil(price(site, good) * 1.08 * (isAlly('gilde') ? 0.95 : 1)));
}

export function sellPrice(site, good) {
  return Math.max(1, Math.floor(price(site, good) * 0.9 * (isAlly('gilde') ? 1.04 : 1)));
}

export function cargoUsed() {
  let n = 0;
  for (const g of GOOD_IDS) n += G.s.cargo[g] || 0;
  return n;
}

export function cargoFree() { return Math.max(0, cargoCap() - cargoUsed()); }

export function addCargo(good, n) { G.s.cargo[good] = (G.s.cargo[good] || 0) + n; }

export function buy(site, good, n) {
  const town = G.s.towns[site.id];
  let bought = 0, spent = 0;
  for (let k = 0; k < n; k++) {
    if (town.stock[good] <= 0) break;
    if (cargoFree() <= 0) { if (!bought) log('Kein Platz mehr für Ladung. Stallungen und Gefolge erhöhen die Tragkraft.', 'bad'); break; }
    const p = buyPrice(site, good);
    if (G.s.gold < p) { if (!bought) log('Nicht genug Gold.', 'bad'); break; }
    G.s.gold -= p; spent += p;
    town.stock[good]--;
    addCargo(good, 1);
    bought++;
  }
  return { bought, spent };
}

export function sell(site, good, n) {
  const town = G.s.towns[site.id];
  let sold = 0, earned = 0;
  for (let k = 0; k < n; k++) {
    if ((G.s.cargo[good] || 0) <= 0) break;
    const p = sellPrice(site, good);
    G.s.gold += p; earned += p;
    town.stock[good]++;
    G.s.cargo[good]--;
    sold++;
  }
  return { sold, earned };
}

// Aus dem Burglager verkaufen, ohne die Ware selbst herzuschaffen: Händler holen sie ab und behalten ein Zehntel als
// Fuhrlohn. keep: so viel bleibt im Lager liegen.
export const HAUL = 0.9;
export function storedSellPrice(site, good) { return Math.max(1, Math.floor(sellPrice(site, good) * HAUL)); }
export function sellStored(site, good, n, keep = 0) {
  const town = G.s.towns[site.id], st = G.s.castle.storage;
  let sold = 0, earned = 0;
  for (let k = 0; k < n; k++) {
    if ((st[good] || 0) <= keep) break;
    const p = storedSellPrice(site, good);
    G.s.gold += p; earned += p;
    town.stock[good]++;
    st[good]--;
    sold++;
  }
  return { sold, earned };
}

export function dailyEconomy() {
  for (const s of G.world.sites) {
    const town = G.s.towns[s.id];
    for (const g of GOOD_IDS) {
      const tgt = targetStock(s, g);
      town.stock[g] = Math.round(town.stock[g] + (tgt - town.stock[g]) * 0.18 + (s.produces.includes(g) ? 2 : 0));
      if (town.stock[g] < 0) town.stock[g] = 0;
    }
  }
}

// ---------------------------------------------------------------- Ausrüstung
export function shopItems(site) {
  if (site.type === 'spieler') {
    const out = [];
    const sm = bLevel('schmiede'), st = bLevel('stall');
    for (const [id, it] of Object.entries(ITEMS)) {
      if (it.tier === 0) continue;
      if (it.slot === 'pferd' ? it.tier <= st : it.tier <= sm) out.push(id);
    }
    return out;
  }
  return SHOPS[site.type] || [];
}

export function itemBuyPrice(site, id) {
  const base = ITEMS[id].price;
  if (site.type === 'spieler') return Math.round(base * (ITEMS[id].slot === 'pferd' ? 0.9 : 0.85));
  return Math.round(base * (isAlly(site.faction) ? 0.9 : 1));
}

export function itemSellPrice(id) { return Math.max(1, Math.round(ITEMS[id].price * 0.4)); }

export function buyItem(site, id) {
  const p = itemBuyPrice(site, id);
  if (G.s.gold < p) { log('Nicht genug Gold.', 'bad'); return false; }
  G.s.gold -= p;
  G.s.inventory.push(id);
  log(`Gekauft: ${ITEMS[id].name} für ${p} Gold. Anlegen kannst du es unter „Gefolge“.`, 'good');
  return true;
}

export function sellItem(index) {
  const id = G.s.inventory[index];
  if (!id) return;
  const p = itemSellPrice(id);
  G.s.inventory.splice(index, 1);
  G.s.gold += p;
  log(`Verkauft: ${ITEMS[id].name} für ${p} Gold.`);
}
