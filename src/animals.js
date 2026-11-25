// Tiere: Schafe und Kühe auf den Weiden, Hühner bei den Häusern, Hirsche im Wald, Enten auf dem Wasser.
// Reine Atmosphäre, sie werden nicht gespeichert.

import { G } from './state.js';
import { T } from './data.js';
import { isWalkable, tileAt } from './world.js';
import { rand } from './rng.js';

const ANIMAL_SPEED = { schaf: 0.35, kuh: 0.28, huhn: 0.55, hirsch: 0.75, ente: 0.3 };

function animalOk(kind, x, y) {
  const t = tileAt(G.world, x, y);
  if (kind === 'ente') return t === T.WATER;
  return t !== T.WATER && t !== T.ROAD && t !== T.BRIDGE && isWalkable(G.world, x, y);
}

function spotNear(cx, cy, rMin, rMax, kind) {
  for (let k = 0; k < 60; k++) {
    const a = Math.random() * Math.PI * 2, r = rand(rMin, rMax);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (animalOk(kind, x, y)) return { x, y };
  }
  return null;
}

export function spawnAnimals() {
  const W = G.world, N = W.N;
  const out = [];
  const herd = (kind, home, n, r) => {
    for (let k = 0; k < n; k++) {
      const p = spotNear(home.x, home.y, 0, r, kind);
      if (p) out.push({ kind, x: p.x, y: p.y, home: { x: home.x, y: home.y }, r, goal: null, wait: rand(0, 6), facing: Math.random() < 0.5 ? 1 : -1, anim: rand(0, 10), moving: false, v: Math.random(), flee: 0 });
    }
  };
  for (const s of W.sites) {
    const sheep = { dorf: 5, halle: 4, abtei: 6, spieler: 4, markt: 3, burg: 2 }[s.type] || 0;
    const cows = { dorf: 2, halle: 3, spieler: 2 }[s.type] || 0;
    const hens = { dorf: 4, halle: 3, spieler: 3, stadt: 3, abtei: 2 }[s.type] || 0;
    if (sheep) { const c = spotNear(s.x, s.y, s.clear - 1, s.clear + 4, 'schaf'); if (c) herd('schaf', c, sheep, 2.5); }
    if (cows) { const c = spotNear(s.x, s.y, s.clear - 2, s.clear + 3, 'kuh'); if (c) herd('kuh', c, cows, 2.2); }
    if (hens) herd('huhn', { x: s.x + 0.5, y: s.y + 0.8 }, hens, 2.8);
  }
  for (let h = 0; h < 16; h++) {
    for (let k = 0; k < 200; k++) {
      const x = 4 + Math.random() * (N - 8), y = 4 + Math.random() * (N - 8);
      if (tileAt(W, x, y) !== T.FOREST) continue;
      herd('hirsch', { x, y }, 2 + Math.floor(Math.random() * 2), 6);
      break;
    }
  }
  for (let h = 0; h < 12; h++) {
    for (let k = 0; k < 300; k++) {
      const x = 2 + Math.random() * (N - 4), y = 2 + Math.random() * (N - 4);
      if (tileAt(W, x, y) !== T.WATER) continue;
      herd('ente', { x, y }, 2, 2.5);
      break;
    }
  }
  G.animals = out;
}

export function updateAnimals(dt) {
  const p = G.s.player;
  for (const a of G.animals) {
    a.moving = false;
    if (Math.abs(a.x - p.x) + Math.abs(a.y - p.y) > 55) continue;
    if (a.kind === 'hirsch') {
      const d = Math.hypot(a.x - p.x, a.y - p.y) || 0.01;
      if (d < (p.mounted ? 7 : 5) && a.flee <= 0) {
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
    const v = ANIMAL_SPEED[a.kind] * (a.flee > 0 ? 5 : 1) * dt;
    if (d < 0.08 + v) { a.goal = null; a.wait = rand(2, 9); continue; }
    const nx = a.x + (dx / d) * v, ny = a.y + (dy / d) * v;
    if (animalOk(a.kind, nx, ny)) {
      a.x = nx; a.y = ny; a.moving = true; a.anim += dt;
      const sx = dx - dy;
      if (Math.abs(sx) > 0.02) a.facing = sx > 0 ? 1 : -1;
    } else { a.goal = null; a.wait = 1; }
  }
}
