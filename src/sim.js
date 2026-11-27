// Zeit: Tageslauf, Jahreszeiten, Tageswechsel.

import { G, log } from './state.js';
import { DAY_LEN, DAYS_PER_SEASON, SEASONS } from './data.js';
import { dailyEconomy } from './economy.js';
import { dailyCastle } from './castle.js';
import { dailyQuests, alliesCount } from './politics.js';
import { maintainGroups, maybeBattle } from './units.js';
import { maybeSiege, dailyRepairs } from './siege.js';
import { dailyBurials } from './life.js';
import { replenishAnimals } from './animals.js';
import { dailyDynamics } from './dynamics.js';
import { dailyTourney } from './tournament.js';
import { dailyJustice } from './justice.js';
import { passWeather } from './weather.js';
import { dailyMines } from './mines.js';
import { dailyHoldings } from './holdings.js';
import { updateTrips } from './travels.js';

export function hourOf(time = G.s.time) { return (6 + (time / DAY_LEN) * 24) % 24; }

export function seasonIndex(day = G.s.day) { return Math.floor((day - 1) / DAYS_PER_SEASON) % 4; }

export function yearOf(day = G.s.day) { return 1194 + Math.floor((day - 1) / (DAYS_PER_SEASON * 4)); }

export function clockText(time = G.s.time) {
  const h = hourOf(time);
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 15) * 15;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// 0 = heller Tag, ~0.62 = tiefe Nacht
export function darkness() {
  const h = hourOf();
  if (h >= 7 && h < 18.5) return 0;
  if (h >= 18.5 && h < 21.5) return ((h - 18.5) / 3) * 0.62;
  if (h >= 21.5 || h < 4) return 0.62;
  return (1 - (h - 4) / 3) * 0.62;
}

// Abendrot / Morgenrot
export function warmth() {
  const h = hourOf();
  if (h >= 17 && h < 20) return Math.sin(((h - 17) / 3) * Math.PI);
  if (h >= 4.5 && h < 7.5) return Math.sin(((h - 4.5) / 3) * Math.PI) * 0.7;
  return 0;
}

export function updateTime(dt) {
  G.s.time += dt;
  if (G.s.time >= DAY_LEN) {
    G.s.time -= DAY_LEN;
    newDay();
  }
  updateTrips();
}

export function passHours(h) {
  passWeather(Math.round(h));
  G.s.time += (h / 24) * DAY_LEN;
  while (G.s.time >= DAY_LEN) { G.s.time -= DAY_LEN; newDay(); updateTrips(); }
  updateTrips();
}

function newDay() {
  const before = seasonIndex();
  G.s.day++;
  dailyEconomy();
  dailyCastle();
  dailyHoldings();
  dailyQuests();
  maintainGroups();
  replenishAnimals();
  maybeBattle();
  maybeSiege();
  dailyDynamics();
  dailyTourney();
  dailyJustice();
  dailyMines();
  dailyRepairs();
  dailyBurials();
  const now = seasonIndex();
  if (now !== before) {
    log(`Der ${SEASONS[now]}${now === 0 ? ` des Jahres ${yearOf()}` : ''} beginnt.`, 'gold');
    if (G.onSeason) G.onSeason();
  }
  if (!G.s.flags.victory && G.s.castle.level >= 3 && alliesCount() >= 2) {
    G.s.flags.victory = true;
    if (G.onVictory) G.onVictory();
  }
  if (G.onNewDay) G.onNewDay();
}
