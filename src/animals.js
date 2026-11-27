// Tiere: Schafe und Kühe auf den Weiden, Hühner bei den Häusern, Hirsche im Wald, Enten auf dem Wasser.
// Mit dem Bogen lassen sie sich jagen. Die Bestände werden nicht gespeichert, sie wachsen täglich nach.

import { G, log } from './state.js';
import { T, GOODS, CASTLE_LAYOUT } from './data.js';
import { bLevel, workingPlots, pastureOf } from './castle.js';
import { isWalkable, tileAt } from './world.js';
import { rand, randInt } from './rng.js';
import { addCargo, cargoFree } from './economy.js';
import { changeRep, isAlly } from './politics.js';

const ANIMAL_SPEED = { schaf: 0.25, kuh: 0.2, huhn: 0.4, hirsch: 0.55, reh: 0.6, ente: 0.22, klepper: 0.28, packpferd: 0.24, schlachtross: 0.3 };
// Wild im Wald: Hirsch und Reh fliehen, wenn du zu nahe kommst
const WILD = { hirsch: 1, reh: 1 };

// Jagdbeute: Fleisch und Felle, Hof-Tiere gehören einem Ort
export const ANIMAL_INFO = {
  hirsch: { name: 'Hirsch', hp: 12, fleisch: [6, 9], felle: [1, 2] },
  reh: { name: 'Reh', hp: 7, fleisch: [3, 5], felle: [1, 1] },
  ente: { name: 'Ente', hp: 4, fleisch: [1, 2] },
  schaf: { name: 'Schaf', hp: 10, fleisch: [3, 5], felle: [1, 1], farm: true },
  kuh: { name: 'Kuh', hp: 20, fleisch: [8, 12], felle: [1, 2], farm: true },
  huhn: { name: 'Huhn', hp: 3, fleisch: [1, 1], farm: true },
  // Pferde auf der Weide (Paket 8, Teil 2): Klepper bei Hallen, Dörfern und Höfen, Packpferde bei Märkten und Städten,
  // Schlachtrösser in der Schabracke des Burgherrn
  klepper: { name: 'Klepper', hp: 22, fleisch: [8, 12], felle: [1, 2], farm: true },
  packpferd: { name: 'Packpferd', hp: 24, fleisch: [8, 12], felle: [1, 2], farm: true },
  schlachtross: { name: 'Schlachtross', hp: 30, fleisch: [10, 14], felle: [1, 2], farm: true },
};

const DEER_TARGET = 130, DUCK_TARGET = 80;

function animalOk(kind, x, y) {
  const t = tileAt(G.world, x, y);
  if (kind === 'ente') return t === T.WATER;
  return t !== T.WATER && t !== T.ROAD && t !== T.BRIDGE && isWalkable(G.world, x, y, true);
}

function spotNear(cx, cy, rMin, rMax, kind) {
  for (let k = 0; k < 60; k++) {
    const a = Math.random() * Math.PI * 2, r = rand(rMin, rMax);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (animalOk(kind, x, y)) return { x, y };
  }
  return null;
}

function addHerd(kind, home, n, r, site = null, farFromPlayer = 0) {
  const p0 = G.s && G.s.player;
  for (let k = 0; k < n; k++) {
    const p = spotNear(home.x, home.y, 0, r, kind);
    if (!p) continue;
    if (farFromPlayer && p0 && Math.hypot(p.x - p0.x, p.y - p0.y) < farFromPlayer) continue;
    G.animals.push({
      kind, x: p.x, y: p.y, home: { x: home.x, y: home.y }, r, site, hp: ANIMAL_INFO[kind].hp,
      goal: null, wait: rand(0, 6), facing: Math.random() < 0.5 ? 1 : -1, anim: rand(0, 10),
      moving: false, v: Math.random(), flee: 0, flash: 0, dead: false,
    });
  }
}

// Weide der eigenen Schafzucht (passt zum Zaun, den der Renderer zeichnet)
// Mehrere Schafzuchten: Die Herde weidet auf der größten Weide, so viele Schafe, wie alle zusammen halten
export function castlePasture(s) {
  if (!s) return null;
  const all = workingPlots('schafzucht');
  if (!all.length) return null;
  const top = all.reduce((a, w) => (w.lv > a.lv ? w : a), all[0]), L = top.lv, pa = pastureOf(L, top.plot);
  const n = Math.min(22, all.reduce((a, w) => a + [0, 6, 10, 14][w.lv], 0));
  return { x: pa.x, y: pa.y, w: pa.w, h: pa.h, r: [0, 0.5, 0.65, 0.75][L], n };
}

function farmHerds(s) {
  const pa = s.type === 'spieler' ? castlePasture(s) : null;
  return {
    schaf: pa ? { n: pa.n, home: { x: pa.x, y: pa.y }, r: pa.r } : { n: { dorf: 5, halle: 4, abtei: 6, spieler: 3, markt: 3, burg: 2, hof: 3 }[s.type] || 0, rMin: s.clear - 1, rMax: s.clear + 4, r: 2.5 },
    kuh: { n: { dorf: 2, halle: 3, spieler: 2, hof: 1 }[s.type] || 0, rMin: s.clear - 2, rMax: s.clear + 3, r: 2.2 },
    huhn: { n: { dorf: 4, halle: 3, spieler: 3, stadt: 3, abtei: 2, hof: 3 }[s.type] || 0, home: { x: s.x + 0.5, y: s.y + 0.8 }, r: 2.8 },
    klepper: { n: { markt: 2, halle: 2, dorf: 1, hof: 1 }[s.type] || 0, rMin: s.clear - 1, rMax: s.clear + 3, r: 2.2 },
    packpferd: { n: { markt: 2, stadt: 1 }[s.type] || 0, rMin: s.clear, rMax: s.clear + 4, r: 2 },
    schlachtross: { n: { burg: 2 }[s.type] || 0, rMin: s.clear, rMax: s.clear + 3, r: 2 },
  };
}

function spawnWild(kind, count, far) {
  const W = G.world, N = W.N;
  const want = WILD[kind] ? T.FOREST : T.WATER;
  for (let h = 0; h < count; h++) {
    for (let k = 0; k < 300; k++) {
      const x = 3 + Math.random() * (N - 6), y = 3 + Math.random() * (N - 6);
      if (tileAt(W, x, y) !== want) continue;
      if (kind === 'ente' && W.sea[Math.floor(y) * N + Math.floor(x)]) continue;   // Enten auf Flüssen und Seen, nicht auf hoher See
      if (far && Math.hypot(x - G.s.player.x, y - G.s.player.y) < far) continue;
      addHerd(kind, { x, y }, WILD[kind] ? 2 + Math.floor(Math.random() * 2) : 2, WILD[kind] ? 6 : 2.5);
      break;
    }
  }
}

export function spawnAnimals() {
  G.animals = [];
  for (const s of G.world.sites.concat(G.world.farms || [])) {
    for (const [kind, h] of Object.entries(farmHerds(s))) {
      if (!h.n) continue;
      const home = h.home || spotNear(s.x, s.y, h.rMin, h.rMax, kind);
      if (home) addHerd(kind, home, h.n, h.r, s.id);
    }
  }
  spawnWild('hirsch', 60);
  spawnWild('reh', 45);
  spawnWild('ente', 40);
}

// Täglicher Nachwuchs: Wild kehrt zurück, Höfe ziehen Tiere nach
// Nach dem Ausbau der Schafzucht: die Herde zieht auf die neue Weide
export function refreshCastleHerd() {
  const s = G.world.sites.find((x) => x.type === 'spieler');
  const pa = castlePasture(s);
  G.animals = G.animals.filter((a) => !(a.kind === 'schaf' && a.site === s.id));
  if (pa) addHerd('schaf', { x: pa.x, y: pa.y }, pa.n, pa.r, s.id);
}

export function replenishAnimals() {
  const count = (kind) => G.animals.filter((a) => a.kind === kind).length;
  if (count('hirsch') < DEER_TARGET) spawnWild('hirsch', 6, 25);
  if (count('reh') < DEER_TARGET * 0.7) spawnWild('reh', 5, 25);
  if (count('ente') < DUCK_TARGET) spawnWild('ente', 3, 20);
  for (const s of G.world.sites.concat(G.world.farms || [])) {
    for (const [kind, h] of Object.entries(farmHerds(s))) {
      if (!h.n) continue;
      const have = G.animals.filter((a) => a.kind === kind && a.site === s.id);
      if (have.length >= h.n) continue;
      const home = h.home || (have.length ? have[0].home : spotNear(s.x, s.y, h.rMin, h.rMax, kind));
      if (home) addHerd(kind, home, 1, h.r, s.id, 12);
    }
  }
}

// ---------------------------------------------------------------- Jagd
export function animalTitle(a) {
  const info = ANIMAL_INFO[a.kind];
  if (!info.farm) return `${info.name} · mit dem Bogen jagen`;
  const s = G.world.sites.find((x) => x.id === a.site);
  if (s && s.type === 'spieler') return `${info.name} · dein Vieh`;
  return `${info.name} · gehört ${s ? s.name : 'einem Hof'}`;
}

export function hitAnimal(a, dmg, shooter) {
  if (a.dead) return;
  a.hp -= dmg;
  a.flash = 0.2;
  G.fx.push({ kind: 'text', x: a.x, y: a.y, text: String(dmg), color: '#fff4d8', t: 0, dur: 0.8 });
  if (WILD[a.kind] || a.kind === 'ente' || a.kind === 'huhn') {
    const d = Math.hypot(a.x - shooter.x, a.y - shooter.y) || 0.01;
    a.goal = { x: a.x + ((a.x - shooter.x) / d) * 8, y: a.y + ((a.y - shooter.y) / d) * 8 };
    a.flee = 3; a.wait = 0;
  }
  if (a.hp <= 0) killAnimal(a);
}

// Ein Jäger aus dem Dorf erlegt ein Tier: kein Ertrag für dich, nur ein Tier weniger im Wald
export function takeAnimal(a) {
  if (a.dead) return;
  a.dead = true;
  G.animals = G.animals.filter((x) => x !== a);
  G.fx.push({ kind: 'kadaver', x: a.x, y: a.y, animal: a.kind, facing: a.facing, away: a.away, t: 0, dur: 3 });
  if (G.s.player.huntTarget === a) G.s.player.huntTarget = null;
}

function killAnimal(a) {
  const info = ANIMAL_INFO[a.kind];
  a.dead = true;
  G.animals = G.animals.filter((x) => x !== a);
  G.fx.push({ kind: 'kadaver', x: a.x, y: a.y, animal: a.kind, facing: a.facing, away: a.away, t: 0, dur: 30 });
  const loot = [];
  let lost = 0;
  for (const good of ['fleisch', 'felle']) {
    if (!info[good]) continue;
    const n = randInt(info[good][0], info[good][1]);
    const k = Math.min(n, cargoFree());
    if (k > 0) { addCargo(good, k); loot.push(`${k} ${good === 'felle' && k === 1 ? 'Fell' : GOODS[good].name}`); }
    lost += n - k;
  }
  loot.forEach((l, i) => G.fx.push({ kind: 'text', x: a.x, y: a.y - 0.3, text: `+${l}`, color: '#bfe39a', t: -0.5 * i, dur: 1.8 }));
  const msg = loot.length ? `${info.name} erlegt: ${loot.join(', ')}.` : `${info.name} erlegt, aber du kannst nichts mehr tragen.`;
  log(`${msg}${lost && loot.length ? ` ${lost} bleiben liegen, die Ladung ist voll.` : ''}`, loot.length ? 'good' : 'bad');
  // Folgen
  if (info.farm) {
    const s = G.world.sites.find((x) => x.id === a.site);
    if (s && s.faction) {
      log(`Viehdiebstahl! ${s.name} wird das nicht vergessen.`, 'bad');
      changeRep(s.faction, -6);
    }
  } else if (WILD[a.kind] && !isAlly('normannen') && Math.random() < 0.35) {
    log('Ein Förster hat dich beim Wildern gesehen. Das Rotwild gehört nach dem Forstrecht dem König.', 'bad');
    changeRep('normannen', -2);
    if (Math.random() < 0.5) changeRep('waldleute', 1);
  }
  if (G.s.player.huntTarget === a) G.s.player.huntTarget = null;
}

// Wie Wild auf Störung reagiert: Hirsche fliehen, wenn du zu nahe kommst
export function updateAnimals(dt) {
  const p = G.s.player;
  for (const a of G.animals) {
    a.moving = false;
    if (a.flash > 0) a.flash -= dt;
    if (Math.abs(a.x - p.x) + Math.abs(a.y - p.y) > 55) continue;
    if (WILD[a.kind]) {
      const d = Math.hypot(a.x - p.x, a.y - p.y) || 0.01;
      if (d < (p.mounted ? 7 : 4.5) * (a.kind === 'reh' ? 1.25 : 1) && a.flee <= 0) {
        a.goal = { x: a.x + ((a.x - p.x) / d) * 7, y: a.y + ((a.y - p.y) / d) * 7 };
        a.flee = 2.5; a.wait = 0;
      }
    }
    if (a.flee > 0) a.flee -= dt;
    if (a.wait > 0) { a.wait -= dt; continue; }
    if (!a.goal) {
      a.goal = { x: a.home.x + rand(-a.r, a.r), y: a.home.y + rand(-a.r, a.r) };
      if (!animalOk(a.kind, a.goal.x, a.goal.y)) { a.goal = null; a.wait = 1; continue; }
    }
    const dx = a.goal.x - a.x, dy = a.goal.y - a.y, d = Math.hypot(dx, dy);
    const v = ANIMAL_SPEED[a.kind] * (a.flee > 0 ? 4.5 : 1) * dt;
    if (d < 0.08 + v) { a.goal = null; a.wait = rand(2, 9); continue; }
    const nx = a.x + (dx / d) * v, ny = a.y + (dy / d) * v;
    if (animalOk(a.kind, nx, ny)) {
      a.x = nx; a.y = ny; a.moving = true; a.anim += dt;
      const sx = dx - dy;
      if (Math.abs(sx) > 0.02) a.facing = sx > 0 ? 1 : -1;
      // vom Betrachter weg (nach oben im Bild) oder auf ihn zu: Rücken- oder Vorderansicht
      if (Math.abs(dx + dy) > 0.02) a.away = dx + dy < 0;
    } else { a.goal = null; a.wait = 1; }
  }
}

