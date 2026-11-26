// Wetter: Wolken, Regen, Nebel und Schneefall je nach Jahreszeit. Schnee bleibt liegen und taut
// nach und nach wieder. So gehen die Jahreszeiten fließend ineinander über: Der Winter beginnt
// grau und kahl, der erste Schnee bleibt in Flecken liegen, im Frühling taut er im Regen weg.

import { G, log } from './state.js';
import { DAY_LEN, DAYS_PER_SEASON } from './data.js';
import { seasonIndex, hourOf, yearOf } from './sim.js';
import { rand } from './rng.js';

export const WEATHER_NAME = { klar: '', wolken: 'bewölkt', regen: 'Regen', schnee: 'Schneefall', nebel: 'Nebel' };

const absHours = () => G.s.day * 24 + (G.s.time / DAY_LEN) * 24;
const dayInSeason = () => (G.s.day - 1) % DAYS_PER_SEASON;

function chooseWeather() {
  const se = seasonIndex(), d = dayInSeason(), h = hourOf();
  let table;
  // Im Frühling schneit es nicht mehr (das Spiel beginnt am ersten Frühlingstag); Schnee vom Winter taut nur noch weg
  if (se === 0) table = { klar: 4, wolken: 3, regen: d < 2 ? 4 : 2.5, nebel: h < 10 ? 1.4 : 0 };
  else if (se === 1) table = { klar: 7, wolken: 2, regen: 1.5, nebel: 0 };
  else if (se === 2) table = { klar: 3, wolken: 3, regen: 3.4, nebel: h < 11 ? 2 : 0.4, schnee: d >= 4 ? 1.2 : 0 };
  else table = { klar: 3, wolken: 2.5, schnee: d === 0 ? 1.4 : 4, regen: d === DAYS_PER_SEASON - 1 ? 1.2 : 0.3, nebel: 0.6 };
  let sum = 0;
  for (const v of Object.values(table)) sum += v;
  let r = Math.random() * sum;
  for (const [k, v] of Object.entries(table)) { r -= v; if (r <= 0) return k; }
  return 'klar';
}

export function initWeather() {
  if (!G.s.weather) G.s.weather = { kind: 'klar', int: 0.5, until: absHours() + rand(3, 8) };
  if (G.s.snow === undefined) G.s.snow = seasonIndex() === 3 ? 0.5 : 0;
}

function change(w) {
  const prev = w.kind;
  w.kind = chooseWeather();
  w.int = rand(0.35, 1);
  w.until = absHours() + rand(3, 10);
  if (w.kind === prev) return;
  const p = G.s;
  if (w.kind === 'schnee' && (p.snow || 0) < 0.05) log(seasonIndex() === 3 ? 'Es schneit. Der erste Schnee bleibt liegen.' : 'Ein paar Schneeflocken fallen.', 'gold');
  else if (w.kind === 'regen' && Math.random() < 0.3) log(w.int > 0.75 ? 'Ein Wolkenbruch! Es schüttet wie aus Eimern.' : 'Es fängt an zu regnen.');
  else if (w.kind === 'nebel' && Math.random() < 0.3) log('Nebel zieht auf.');
}

// Stündlich weiter: Schneedecke wächst bei Schneefall und schmilzt sonst je nach Jahreszeit
function advance(dh) {
  const w = G.s.weather;
  if (absHours() >= w.until) change(w);
  const se = seasonIndex(), h = hourOf();
  const before = G.s.snow || 0;
  if (w.kind === 'schnee') G.s.snow = Math.min(1, before + dh * 0.085 * w.int);
  else {
    let melt = [0.05, 0.3, 0.035, 0.004][se];
    if (w.kind === 'regen') melt *= 2.2;
    if (w.kind === 'klar' && h > 10 && h < 16) melt *= 1.4;
    G.s.snow = Math.max(0, before - dh * melt);
  }
  if (before >= 0.3 && G.s.snow < 0.3 && se === 0 && G.s.flags.thaw !== yearOf()) { G.s.flags.thaw = yearOf(); log('Tauwetter: Der Schnee schmilzt, die Bäche schwellen an.', 'gold'); }
}

export function updateWeather(dt) {
  if (!G.s.weather) initWeather();
  advance((dt / DAY_LEN) * 24);
}

// Für Zeitsprünge (Rasten, Übernachten): in Stundenschritten
export function passWeather(hours) {
  if (!G.s.weather) initWeather();
  for (let k = 0; k < hours; k++) advance(1);
}

// Schneedecke in Stufen (0, ¼, ½, ¾, 1): Das Gelände wird nur bei einer neuen Stufe neu gemalt
export function snowLevel() { return Math.round((G.s.snow || 0) * 4) / 4; }

// Aussehen der Landschaft: 0 Frühling, 1 Sommer, 2 Herbst, 3 verschneit, 4 kahler Winter ohne Schnee
export function lookSeason() {
  const lv = snowLevel(), se = seasonIndex();
  if (lv >= 0.75) return 3;
  return se === 3 ? 4 : se;
}

// Bäume tragen schon ab der halben Schneedecke Schnee
export function treeSeason() {
  const lv = snowLevel(), se = seasonIndex();
  if (lv >= 0.5) return 3;
  return se === 3 ? 4 : se;
}

export function precip() {
  const w = G.s && G.s.weather;
  return w && (w.kind === 'regen' || w.kind === 'schnee') ? w.int : 0;
}

export function weatherKind() { return (G.s && G.s.weather && G.s.weather.kind) || 'klar'; }
