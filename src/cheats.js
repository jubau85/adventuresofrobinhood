// Testmodus: Cheats zum Ausprobieren. Unendlich Gold und Rohstoffe, unverwundbar, sofort bauen,
// Sofortreise über die Karte, dazu Knöpfe, die Ereignisse sofort auslösen. Taste F9 oder Menü.

import { G, log } from './state.js';
import { claimShire, shireAt, HOME_SHIRE } from './shires.js';
import { grantHolding } from './holdings.js';
import { GOOD_IDS, FACTION_IDS, BUILDINGS, BUILDING_IDS, DAYS_PER_SEASON, DAY_LEN } from './data.js';
import { passHours } from './sim.js';
import { finishConstruction, castleSite, refreshCastleBlock, castlePlots, castleLayout } from './castle.js';
import { OUTER_ONLY, STACKABLE } from './plots.js';
import { partyMembers, placeNear, rebuildUnits, startBattle, computeStats, grantXp, xpNeeded, spawnPeasants } from './units.js';
import { changeRep, addRenown } from './politics.js';
import { startSiege } from './siege.js';
import { igniteHouse, siteHouses, standing } from './dynamics.js';
import { cheatTourney } from './tournament.js';
import { cheatHanging } from './justice.js';
import { groundZ } from './world.js';
import { refreshCastleHerd } from './animals.js';
import { isoX, isoY } from './iso.js';

export const CHEATS = {
  gold: 'Unendlich Gold',
  res: 'Unendlich Rohstoffe und Vorräte',
  god: 'Unverwundbar (du und dein Gefolge)',
  build: 'Sofort bauen',
  reise: 'Sofortreise über die Karte',
};

export function cheatOn(k) { return !!(G.s && G.s.cheat && G.s.cheat[k]); }
export function anyCheat() { return !!(G.s && G.s.cheat && Object.values(G.s.cheat).some(Boolean)); }

export function toggleCheat(k) {
  if (!CHEATS[k]) return;
  if (!G.s.cheat) G.s.cheat = {};
  G.s.cheat[k] = !G.s.cheat[k];
  log(`Testmodus: ${CHEATS[k]} ${G.s.cheat[k] ? 'an' : 'aus'}.`, 'gold');
  if (G.s.cheat[k] && k === 'build' && G.s.castle.construction) { G.s.castle.construction.done = G.s.day; finishConstruction(); }
  updateCheats();
}

// Jedes Bild: Kasse und Lager auffüllen, Lebenspunkte voll halten
export function updateCheats() {
  const c = G.s && G.s.cheat;
  if (!c) return;
  if (c.gold && G.s.gold < 99999) G.s.gold = 99999;
  if (c.res) { const st = G.s.castle.storage; for (const g of GOOD_IDS) if ((st[g] || 0) < 999) st[g] = 999; }
  if (c.god) { const p = G.s.player; p.hp = p.st.maxHp; for (const u of partyMembers()) u.hp = u.st.maxHp; }
}

// Sofortreise: Held und Gefolge stehen sofort am Ziel, auch jenseits des Meeres
export function teleport(target, site) {
  const p = G.s.player;
  const dy = site ? (site.type === 'spieler' ? 2.6 : 1.4) : 0;
  placeNear(p, target.x, target.y + dy, 1.2);
  p.path = null; p.attackTarget = null; p.huntTarget = null;
  G.pendingSite = null;
  for (const c of partyMembers()) placeNear(c, p.x, p.y, 1.5);
  G.cam.x = isoX(p.x, p.y); G.cam.y = isoY(p.x, p.y) - groundZ(G.world, p.x, p.y) - 12;
  log(`Sofortreise: Du bist ${site ? `in ${site.name}` : 'am Ziel'}.`, 'gold');
}

const setWeather = (kind) => { G.s.weather = { kind, int: 0.85, until: G.s.day * 24 + (G.s.time / DAY_LEN) * 24 + 8 }; };

const CHEAT_ACTIONS = {
  h6: () => passHours(6),
  tag: () => passHours(24),
  saison: () => passHours((DAYS_PER_SEASON - ((G.s.day - 1) % DAYS_PER_SEASON)) * 24),
  klar: () => setWeather('klar'),
  regen: () => setWeather('regen'),
  nebel: () => setWeather('nebel'),
  schnee: () => setWeather('schnee'),
  snow0: () => { G.s.snow = 0; },
  snow50: () => { G.s.snow = 0.5; },
  snow100: () => { G.s.snow = 1; },
  turnier: () => cheatTourney(),
  galgen: () => cheatHanging(),
  feuer: () => {
    const p = G.s.player;
    let best = null, bd = 16;
    for (const s of G.world.sites) {
      if (Math.abs(s.x - p.x) > 40 || Math.abs(s.y - p.y) > 40) continue;
      for (const b of siteHouses(s.id)) {
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        if (d < bd && standing(b) && !b.tavern && !(b.fire > G.time)) { bd = d; best = b; }
      }
    }
    if (best) { igniteHouse(best, 60); log('Testmodus: Ein Haus in deiner Nähe brennt.', 'bad'); } else log('Kein Haus in der Nähe.', 'bad');
  },
  belagerung: () => { if (!startSiege()) log('Gerade lässt sich keine Belagerung beginnen: Es läuft schon eine, oder keine passende Burg oder Stadt liegt in Reichweite.', 'bad'); },
  schlacht: () => { if (!startBattle()) log('Gerade lässt sich keine Schlacht beginnen.', 'bad'); },
  ruhm: () => addRenown(50),
  stufe: () => { for (const u of [G.s.player, ...partyMembers()]) grantXp(u, xpNeeded(u.level) - u.xp); },
  ausruestung: () => {
    const p = G.s.player;
    p.eq = { waffe: 'ritterschwert', ruestung: 'kettenruestung', schild: 'wappenschild', pferd: 'schlachtross' };
    computeStats(p); p.hp = p.st.maxHp; p.mounted = true;
    log('Testmodus: Ritterschwert, Kettenrüstung, Wappenschild und Schlachtross.', 'gold');
  },
  burg: () => {
    const cs = G.s.castle;
    cs.level = BUILDINGS.burg.levels.length - 1;
    // Jedes Gebäude einmal auf höchster Stufe, die übrigen Plätze davor mit Land, im Hof mit Wachtürmen
    const plots = castlePlots(), lay = castleLayout(), top = (id) => BUILDINGS[id].levels.length - 1;
    for (const id of BUILDING_IDS) {
      if (id === 'burg' || plots.some((p) => p && p.id === id)) continue;
      const q = lay.filter((p) => !plots[p.i] && !(OUTER_ONLY[id] && p.inner));
      const pick2 = q.find((p) => p.inner === !OUTER_ONLY[id]) || q[0];
      if (pick2) plots[pick2.i] = { id, lv: top(id) };
    }
    const land = ['felder', 'holzfaeller', 'schafzucht', 'steinbruch'];
    lay.forEach((p, k) => { if (!plots[p.i]) plots[p.i] = p.inner ? { id: 'wehr', lv: 3 } : { id: land[k % 4], lv: 3 }; });
    for (const p of plots) if (p) { p.lv = top(p.id); p.dmg = 0; }
    cs.construction = null;
    refreshCastleBlock();
    refreshCastleHerd();
    spawnPeasants(); rebuildUnits();
    G.castleDirty = true;
    log(`Testmodus: ${(castleSite() || { name: 'Die Burg' }).name} ist voll ausgebaut.`, 'gold');
  },
  repplus: () => { for (const f of FACTION_IDS) changeRep(f, 25); },
  // Die Grafschaft, in der du stehst (sonst dein West Riding), gehört dir samt ihrer Burg
  grafschaft: () => {
    const p = G.s.player, id = shireAt(p.x, p.y) || HOME_SHIRE;
    if (!grantHolding(G.world.sites.find((s) => s.id === id))) claimShire(id);
  },
  repminus: () => { for (const f of FACTION_IDS) changeRep(f, -25); },
};

export function cheatDo(id) {
  const f = CHEAT_ACTIONS[id];
  if (!f) return;
  if (!G.s.cheat) G.s.cheat = {};
  G.s.cheat.used = true;
  f();
  updateCheats();
}
