// Einheiten, Gefolge, KI-Gruppen und Kampf.

import { G, uid, log, homeName, playerColor } from './state.js';
import {
  CLASSES, ITEMS, NPC_TYPES, GROUP_TYPES, T, TERRAIN_SPEED, NAMES_M, NAMES_F, EPITHETS,
  GOODS, GOOD_IDS, PEASANT_TUNICS, HAIR, LOOKS,
} from './data.js';
import { isWalkable, findPath, tileAt, nearestWalkable } from './world.js';
import { rand, randInt, pick, clamp } from './rng.js';
import { changeRep, isHostileFaction, isAlly, addRenown, onQuestGroupDestroyed } from './politics.js';
import { cargoFree, addCargo } from './economy.js';
import { castleSite } from './castle.js';
import { hourOf } from './sim.js';
import { hitAnimal } from './animals.js';

// ---------------------------------------------------------------- Werte
export function computeStats(u) {
  const c = CLASSES[u.cls];
  const lv = u.level || 1;
  const m = 1 + (lv - 1) * 0.08;
  let hp = c.hp * m, atk = c.atk * m, def = c.def * (1 + (lv - 1) * 0.05);
  let range = 1.1, cd = 1.1, speed = c.speed, ranged = false;
  const w = ITEMS[u.eq.waffe];
  if (w) {
    atk += w.atk; range = w.range; cd = w.cd; ranged = !!w.ranged;
    if (ranged && c.bow) atk *= c.bow;
  }
  const a = ITEMS[u.eq.ruestung];
  if (a) { def += a.def; speed *= 1 - (a.slow || 0); }
  const s = ITEMS[u.eq.schild];
  if (s) def += s.def;
  const horse = ITEMS[u.eq.pferd] || null;
  u.st = { maxHp: Math.round(hp), atk, def, range, cd, speed, ranged, horse, armorDef: a ? a.def : 0 };
  if (u.hp > u.st.maxHp) u.hp = u.st.maxHp;
  if (!horse) u.mounted = false;
  return u.st;
}

export function xpNeeded(level) { return 40 + level * 30; }

export function makeUnit(o) {
  const u = {
    id: o.id ?? uid(), kind: o.kind,
    team: o.team ?? (o.kind === 'player' || o.kind === 'companion' ? 'player' : 'neutral'),
    name: o.name ?? CLASSES[o.cls].name, cls: o.cls, level: o.level ?? 1, xp: o.xp ?? 0,
    eq: Object.assign({ waffe: null, ruestung: null, schild: null, pferd: null }, o.eq || {}),
    x: o.x ?? 0, y: o.y ?? 0, facing: 1, dirX: 0.7, dirY: 0.7, mounted: !!o.mounted,
    status: o.status ?? null, woundedDays: o.woundedDays ?? 0, wage: o.wage ?? 0, cost: o.cost ?? 0,
    look: o.look ?? null, npcType: o.npcType ?? null, female: !!o.female,
    tunic: o.tunic ?? null, hair: o.hair ?? pick(HAIR),
    cd: Math.random() * 0.6, target: null, attackTarget: null, path: null, pathI: 0,
    anim: Math.random() * 10, moving: false, flash: 0, swing: 0, combatT: 0, group: null, dead: false,
    st: null, hp: 1,
  };
  computeStats(u);
  u.hp = o.hp != null ? Math.min(o.hp, u.st.maxHp) : u.st.maxHp;
  return u;
}

export function randomName() {
  const female = Math.random() < 0.18;
  const first = female ? pick(NAMES_F) : pick(NAMES_M);
  return { name: Math.random() < 0.7 ? `${first} ${pick(EPITHETS)}` : first, female };
}

export function makeNpc(typeId, x, y, levelBonus = 0) {
  const d = NPC_TYPES[typeId];
  const u = makeUnit({
    kind: 'npc', cls: d.cls, name: d.name, level: clamp(randInt(d.lv[0], d.lv[1]) + levelBonus, 1, 10),
    eq: { ...d.eq }, x, y, look: d.look, npcType: typeId,
  });
  u.mounted = !!u.st.horse;
  return u;
}

// Wappenfarben des Spielers: Spieler in voller Farbe, Gefolge etwas heller
const heraldCache = new Map();
export function heraldLook(color, light = false) {
  const key = color + light;
  let v = heraldCache.get(key);
  if (v) return v;
  let tunic = color;
  if (light) {
    const n = parseInt(color.slice(1), 16);
    const f = (c) => Math.round(c + (255 - c) * 0.2);
    tunic = '#' + ((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0');
  }
  v = { tunic, trim: '#d8b54a' };
  heraldCache.set(key, v);
  return v;
}

export function unitLook(u) {
  if (u.lookObj) return u.lookObj;
  if (u.kind === 'player' || u.kind === 'companion') return heraldLook(playerColor(), u.kind === 'companion');
  return LOOKS[u.look] || LOOKS.bauer;
}

// ---------------------------------------------------------------- Ausrüstung anlegen
export function equip(u, invIndex) {
  const id = G.s.inventory[invIndex];
  if (!id) return false;
  const it = ITEMS[id];
  if (it.slot === 'schild') {
    const w = ITEMS[u.eq.waffe];
    if (w && w.twoHanded) { log('Mit Bogen oder Armbrust lässt sich kein Schild tragen.', 'bad'); return false; }
  }
  G.s.inventory.splice(invIndex, 1);
  if (u.eq[it.slot]) G.s.inventory.push(u.eq[it.slot]);
  u.eq[it.slot] = id;
  if (it.twoHanded && u.eq.schild) { G.s.inventory.push(u.eq.schild); u.eq.schild = null; }
  const ratio = u.hp / u.st.maxHp;
  computeStats(u);
  u.hp = Math.max(1, Math.round(u.st.maxHp * ratio));
  if (it.slot === 'pferd' && u.kind === 'player') u.mounted = true;
  return true;
}

export function unequip(u, slot) {
  if (!u.eq[slot]) return;
  G.s.inventory.push(u.eq[slot]);
  u.eq[slot] = null;
  const ratio = u.hp / u.st.maxHp;
  computeStats(u);
  u.hp = Math.max(1, Math.round(u.st.maxHp * ratio));
}

// Wie verändert ein Gegenstand die Werte einer Einheit?
export function previewEquip(u, id) {
  const it = ITEMS[id];
  const clone = { ...u, eq: { ...u.eq } };
  clone.eq[it.slot] = id;
  if (it.twoHanded) clone.eq.schild = null;
  const before = u.st, after = computeStats(clone);
  return { atk: after.atk - before.atk, def: after.def - before.def, hp: after.maxHp - before.maxHp };
}

// ---------------------------------------------------------------- Einheitenliste
export function partyMembers() { return G.s.companions.filter((c) => c.status === 'party'); }

export function rebuildUnits() {
  const list = [G.s.player];
  for (const c of partyMembers()) { c.dead = false; list.push(c); }
  for (const g of G.groups) for (const m of g.members) list.push(m);
  for (const p of G.peasants) list.push(p);
  G.units = list;
}

export function placeNear(u, x, y, spread = 1.5) {
  for (let k = 0; k < 20; k++) {
    const nx = x + rand(-spread, spread), ny = y + rand(-spread, spread);
    if (isWalkable(G.world, nx, ny)) { u.x = nx; u.y = ny; return; }
  }
  u.x = x; u.y = y;
}

// ---------------------------------------------------------------- Bewegung
export function unitSpeed(u) {
  const t = tileAt(G.world, u.x, u.y);
  let s = u.st.speed * TERRAIN_SPEED[t];
  if (u.mounted && u.st.horse) s *= (1 + u.st.horse.speed) * (t === T.FOREST ? 0.72 : 1);
  return s;
}

function moveToward(u, tx, ty, dt, stop = 0.05, mult = 1) {
  const dx = tx - u.x, dy = ty - u.y;
  const d = Math.hypot(dx, dy);
  if (d <= stop) return true;
  const step = Math.min(unitSpeed(u) * mult * dt, d - stop * 0.5);
  const nx = u.x + (dx / d) * step, ny = u.y + (dy / d) * step;
  const W = G.world;
  if (isWalkable(W, nx, ny)) { u.x = nx; u.y = ny; }
  else if (isWalkable(W, nx, u.y)) u.x = nx;
  else if (isWalkable(W, u.x, ny)) u.y = ny;
  else return false;
  u.dirX = dx / d; u.dirY = dy / d;
  const sx = dx - dy;
  if (Math.abs(sx) > 0.05) u.facing = sx >= 0 ? 1 : -1;
  u.moving = true;
  return d - step <= stop;
}

// Freie Linie zwischen zwei Punkten (keine Mauer, kein Wasser)?
function lineClear(ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.ceil(d / 0.35);
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    if (!isWalkable(G.world, ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

// Auf ein Ziel zugehen. Versperren Mauern oder Wasser den direkten Weg, wird ein Weg gesucht (z. B. durchs Tor).
function chaseTo(u, tx, ty, dt, stop, mult = 1) {
  if (Math.hypot(tx - u.x, ty - u.y) < 1.2 || lineClear(u.x, u.y, tx, ty)) { u.chase = null; return moveToward(u, tx, ty, dt, stop, mult); }
  const c = u.chase;
  if (!c || G.time - c.t > 1.5 || Math.hypot(c.tx - tx, c.ty - ty) > 2) {
    u.chase = { path: findPath(G.world, u.x, u.y, tx, ty, 8000), i: 0, t: G.time, tx, ty };
  }
  const ch = u.chase;
  if (!ch.path || ch.i >= ch.path.length) return moveToward(u, tx, ty, dt, stop, mult);
  const wp = ch.path[ch.i];
  if (moveToward(u, wp.x, wp.y, dt, 0.25, mult)) ch.i++;
  return false;
}

function followPath(u, dt, mult = 1) {
  if (!u.path || u.pathI >= u.path.length) { u.path = null; return true; }
  const p = u.path[u.pathI];
  const last = u.pathI === u.path.length - 1;
  if (moveToward(u, p.x, p.y, dt, last ? 0.08 : 0.25, mult)) {
    u.pathI++;
    if (u.pathI >= u.path.length) { u.path = null; return true; }
  }
  return false;
}

export function setPlayerPath(x, y) {
  const p = G.s.player;
  const path = findPath(G.world, p.x, p.y, x, y);
  p.path = path; p.pathI = 0;
  return !!path;
}

// ---------------------------------------------------------------- Feindschaft
export function groupHostile(g) {
  const gt = GROUP_TYPES[g.type];
  if (g.provoked) return true;
  if (gt.hostile) return !(g.type === 'banditen' && isAlly('waldleute'));
  return g.faction ? isHostileFaction(g.faction) : false;
}

function isEnemy(a, b) {
  if (b.dead || a.dead) return false;
  if (a.team === 'player') return !!(b.group && b.group.engaged);
  if (a.group && a.group.engaged) return b.team === 'player';
  return false;
}

function nearestEnemy(u, radius, from = u) {
  let best = null, bd = radius;
  for (const o of G.units) {
    if (o === u || !isEnemy(u, o)) continue;
    const d = Math.hypot(o.x - from.x, o.y - from.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

export function inCombat() {
  return G.groups.some((g) => g.engaged);
}

// ---------------------------------------------------------------- Kampf
function calcDamage(a, t) {
  let atk = a.st.atk, def = t.st.def;
  if (a.mounted && a.st.horse) atk += a.st.horse.atk;
  if (t.mounted && t.st.horse) def += t.st.horse.def;
  let dmg = (atk * atk) / (atk + def * 1.5) * rand(0.8, 1.2);
  let crit = false;
  if (Math.random() < 0.08) { dmg *= 1.6; crit = true; }
  return { dmg: Math.max(1, Math.round(dmg)), crit };
}

function attack(u, t) {
  const d = Math.hypot(t.x - u.x, t.y - u.y);
  u.cd = u.st.cd * rand(0.92, 1.08);
  u.swing = 0.3;
  const sx = (t.x - u.x) - (t.y - u.y);
  if (Math.abs(sx) > 0.05) u.facing = sx >= 0 ? 1 : -1;
  u.combatT = 5; t.combatT = 5;
  if (u.st.ranged) {
    G.projectiles.push({ x: u.x, y: u.y, tx: t.x, ty: t.y, target: t, att: u, t: 0, dur: Math.max(0.18, d / 15), bolt: ITEMS[u.eq.waffe].kind === 'armbrust' });
  } else {
    applyHit(u, t);
  }
}

function applyHit(a, t) {
  if (t.dead) return;
  const { dmg, crit } = calcDamage(a, t);
  t.hp -= dmg;
  t.flash = 0.18;
  t.combatT = 5;
  const col = t.team === 'player' ? '#ff8a6a' : crit ? '#ffd84a' : '#fff4d8';
  G.fx.push({ kind: 'text', x: t.x, y: t.y, text: crit ? `${dmg}!` : String(dmg), color: col, t: 0, dur: 1.0 });
  if (t.hp <= 0) unitDown(t, a);
}

// Pfeil auf ein Tier (Jagd). Ein Pfeil zielt etwas vor ein laufendes Tier.
export function shootAnimal(u, a) {
  const d = Math.hypot(a.x - u.x, a.y - u.y);
  u.cd = u.st.cd * rand(0.92, 1.08);
  u.swing = 0.3;
  const sx = (a.x - u.x) - (a.y - u.y);
  if (Math.abs(sx) > 0.05) u.facing = sx >= 0 ? 1 : -1;
  const dur = Math.max(0.18, d / 15);
  let tx = a.x, ty = a.y;
  if (a.moving && a.goal) {
    const gd = Math.hypot(a.goal.x - a.x, a.goal.y - a.y) || 1;
    const v = (a.flee > 0 ? 2.4 : 0.5) * dur * 0.6;
    tx += ((a.goal.x - a.x) / gd) * v; ty += ((a.goal.y - a.y) / gd) * v;
  }
  const dmg = Math.max(1, Math.round(u.st.atk * rand(0.8, 1.2)));
  G.projectiles.push({ x: u.x, y: u.y, tx, ty, target: a, att: u, t: 0, dur, animal: true, dmg, bolt: ITEMS[u.eq.waffe].kind === 'armbrust' });
}

export function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i];
    p.t += dt;
    if (p.t >= p.dur) {
      const tg = p.target;
      if (p.animal) {
        if (!tg.dead && Math.hypot(tg.x - p.tx, tg.y - p.ty) < 1.1) hitAnimal(tg, p.dmg, p.att);
      } else if (!tg.dead && Math.hypot(tg.x - p.tx, tg.y - p.ty) < 1.2) applyHit(p.att, tg);
      G.projectiles.splice(i, 1);
    }
  }
}

export function grantXp(u, amount) {
  if (!u || u.dead || u.kind === 'npc' || u.kind === 'peasant') return;
  u.xp += amount;
  while (u.xp >= xpNeeded(u.level) && u.level < 12) {
    u.xp -= xpNeeded(u.level);
    u.level++;
    const old = u.st.maxHp;
    computeStats(u);
    u.hp += u.st.maxHp - old;
    log(`${u.kind === 'player' ? 'Du erreichst' : `${u.name} erreicht`} Stufe ${u.level}.`, 'good');
  }
}

function unitDown(t, killer) {
  t.dead = true;
  t.hp = 0;
  if (t.kind === 'player') { playerDefeated(); return; }
  if (t.kind === 'companion') {
    t.status = 'verwundet';
    t.woundedDays = 2;
    t.hp = 1;
    t.path = null;
    log(`${t.name} ist schwer verwundet und wird nach ${homeName()} gebracht.`, 'bad');
    G.fx.push({ kind: 'corpse', x: t.x, y: t.y, look: unitLook(t), t: 0, dur: 6 });
    return;
  }
  G.fx.push({ kind: 'corpse', x: t.x, y: t.y, look: unitLook(t), t: 0, dur: 25 });
  const g = t.group;
  const xp = 6 + t.level * 6;
  grantXp(killer, xp);
  for (const c of partyMembers()) if (c !== killer) grantXp(c, Math.round(xp / 3));
  if (killer !== G.s.player) grantXp(G.s.player, Math.round(xp / 3));
  if (g) {
    g.members = g.members.filter((m) => m !== t);
    g.fallen.push(t);
    if (g.members.length === 0) groupDestroyed(g);
  }
}

function groupDestroyed(g) {
  const gt = GROUP_TYPES[g.type];
  const gold = randInt(gt.gold[0], gt.gold[1]);
  G.s.gold += gold;
  const loot = [`${gold} Gold`];
  if (Math.random() < (gt.itemChance || 0)) {
    const items = g.fallen.flatMap((m) => Object.values(m.eq).filter(Boolean)).filter((id) => id !== 'knueppel');
    if (items.length) {
      const it = pick(items);
      G.s.inventory.push(it);
      loot.push(ITEMS[it].name);
    }
  }
  if (gt.goods) {
    const good = pick(GOOD_IDS);
    const n = Math.min(randInt(4, 10), cargoFree());
    if (n > 0) { addCargo(good, n); loot.push(`${n} ${GOODS[good].name}`); }
  }
  log(`Sieg über ${g.questId ? 'die gesuchte Bande' : gt.acc}! Beute: ${loot.join(', ')}.`, 'good');
  if (gt.kill) for (const [f, v] of Object.entries(gt.kill)) changeRep(f, v);
  if (gt.renown) addRenown(gt.renown);
  onQuestGroupDestroyed(g);
  const i = G.groups.indexOf(g);
  if (i >= 0) G.groups.splice(i, 1);
}

function playerDefeated() {
  const p = G.s.player;
  const lost = Math.floor(G.s.gold * 0.2);
  G.s.gold -= lost;
  for (const k of Object.keys(G.s.cargo)) G.s.cargo[k] = Math.floor(G.s.cargo[k] / 2);
  log(`Du wurdest niedergeschlagen. Bauern bringen dich nach ${homeName()}. Verloren: ${lost} Gold und die Hälfte der Ladung.`, 'bad');
  const site = castleSite();
  p.dead = false;
  p.x = site.x + 0.3; p.y = site.y + 2.6;
  p.hp = Math.round(p.st.maxHp * 0.5);
  p.path = null; p.attackTarget = null; p.mounted = false;
  for (const c of partyMembers()) { placeNear(c, p.x, p.y, 1.5); c.hp = Math.max(c.hp, Math.round(c.st.maxHp * 0.3)); c.path = null; }
  for (const g of G.groups) { g.engaged = false; g.path = null; g.wait = rand(4, 8); }
  G.s.safeTime = 12;
  rebuildUnits();
}

export function provokeGroup(g) {
  const gt = GROUP_TYPES[g.type];
  g.provoked = true;
  g.engaged = true;
  if (g.faction) changeRep(g.faction, -5);
  log(`Du greifst ${gt.acc} an!`, 'bad');
}

// ---------------------------------------------------------------- Formation
function formationSlot(k) {
  const p = G.s.player;
  const row = Math.floor(k / 2) + 1, side = k % 2 ? 1 : -1;
  const dx = p.dirX || 0.7, dy = p.dirY || 0.7;
  return {
    x: p.x - dx * row * 1.05 + -dy * side * 0.75,
    y: p.y - dy * row * 1.05 + dx * side * 0.75,
  };
}

// ---------------------------------------------------------------- Aktualisierung
export function updateUnits(dt) {
  const p = G.s.player;
  for (const u of G.units) {
    u.moving = false;
    if (u.cd > 0) u.cd -= dt;
    if (u.flash > 0) u.flash -= dt;
    if (u.swing > 0) u.swing -= dt;
    if (u.combatT > 0) u.combatT -= dt;
    // Wer auf einer neu gebauten Mauer steht, wird daneben gesetzt
    if (!u.hidden && !isWalkable(G.world, u.x, u.y)) {
      const n = nearestWalkable(G.world, Math.floor(u.x), Math.floor(u.y), 4);
      if (n) { u.x = n.x + 0.5; u.y = n.y + 0.5; u.chase = null; }
    }
  }
  if (G.s.safeTime > 0) G.s.safeTime -= dt;

  updatePlayer(p, dt);
  const party = partyMembers();
  party.forEach((c, k) => { if (!c.dead) updateCompanion(c, k, dt); });
  for (const g of G.groups) {
    const near = Math.hypot(g.x - p.x, g.y - p.y) < 55;
    for (let k = 0; k < g.members.length; k++) {
      const m = g.members[k];
      if (near || g.engaged) updateGroupMember(m, g, k, dt);
      else {
        const o = memberOffset(k);
        if (isWalkable(G.world, g.x + o.x, g.y + o.y)) { m.x = g.x + o.x; m.y = g.y + o.y; } else { m.x = g.x; m.y = g.y; }
      }
    }
  }
  const isNight = hourOf() >= 21 || hourOf() < 5;
  for (const v of G.peasants) {
    if (Math.abs(v.x - p.x) + Math.abs(v.y - p.y) < 60) updatePeasant(v, dt, isNight);
  }
  separate();
  // Regeneration außerhalb des Kampfes
  const regen = (u) => {
    if (u.combatT <= 0 && u.hp < u.st.maxHp) u.hp = Math.min(u.st.maxHp, u.hp + u.st.maxHp * 0.015 * dt);
  };
  regen(p);
  party.forEach(regen);

  // Gefallene entfernen
  if (G.units.some((u) => u.dead)) {
    if (party.some((c) => c.status !== 'party' || c.dead)) { /* Status bereits gesetzt */ }
    G.units = G.units.filter((u) => !u.dead || u.kind === 'player');
    rebuildUnits();
  }
  for (const u of G.units) if (u.moving) u.anim += dt;
}

function updatePlayer(p, dt) {
  if (p.dead) return;
  const inp = G.input;
  if (p.attackTarget && (p.attackTarget.dead || !p.attackTarget.group || !p.attackTarget.group.engaged)) p.attackTarget = null;
  if (p.huntTarget && (p.huntTarget.dead || !p.st.ranged)) p.huntTarget = null;
  if (inp.dx || inp.dy) {
    p.path = null; p.attackTarget = null; p.huntTarget = null; G.pendingSite = null;
    moveToward(p, p.x + inp.dx * 2, p.y + inp.dy * 2, dt, 0.01);
  } else if (p.huntTarget && !p.attackTarget && !inCombat()) {
    // Jagd: auf Schussweite heran, dann schießen
    const a = p.huntTarget;
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d > 26) { p.huntTarget = null; log('Das Tier ist entkommen.'); }
    else if (d > p.st.range * 0.92) chaseTo(p, a.x, a.y, dt, p.st.range * 0.88);
    else if (p.cd <= 0) shootAnimal(p, a);
  } else if (p.attackTarget) {
    const t = p.attackTarget;
    const d = Math.hypot(t.x - p.x, t.y - p.y);
    if (d > p.st.range * 0.9) chaseTo(p, t.x, t.y, dt, p.st.range * 0.85);
  } else if (p.path) {
    followPath(p, dt);
  } else {
    // Wer still steht, stellt sich Gegnern in der Nähe
    const t = nearestEnemy(p, 4.5);
    if (t) p.attackTarget = t;
  }
  // Automatischer Angriff auf Gegner in Reichweite
  if (p.cd <= 0) {
    let t = p.attackTarget;
    if (!t || Math.hypot(t.x - p.x, t.y - p.y) > p.st.range + 0.2) t = nearestEnemy(p, p.st.range + 0.2);
    if (t) attack(p, t);
  }
}

function engage(u, enemy, dt) {
  const d = Math.hypot(enemy.x - u.x, enemy.y - u.y);
  const r = u.st.range;
  if (u.st.ranged && d < 2.2 && r > 3) {
    // Schützen weichen zurück
    moveToward(u, u.x - (enemy.x - u.x), u.y - (enemy.y - u.y), dt, 0.05, 0.9);
  } else if (d > r * 0.95) {
    chaseTo(u, enemy.x, enemy.y, dt, r * 0.85);
  }
  if (d <= r + 0.15 && u.cd <= 0) attack(u, enemy);
}

function updateCompanion(u, k, dt) {
  const p = G.s.player;
  const order = G.s.order;
  u.mounted = p.mounted && !!u.st.horse;
  let enemy = null;
  if (order === 'halten') enemy = nearestEnemy(u, u.st.range + 1.5);
  else enemy = nearestEnemy(u, order === 'angriff' ? 16 : 9, p) || nearestEnemy(u, u.st.range + 0.5);
  if (enemy) { engage(u, enemy, dt); return; }
  // Bogenschützen im Gefolge schießen bei der Jagd mit
  const prey = p.huntTarget;
  if (prey && !prey.dead && u.st.ranged && u.cd <= 0 && Math.hypot(prey.x - u.x, prey.y - u.y) <= u.st.range) shootAnimal(u, prey);
  if (order === 'halten' && u.holdPos) { chaseTo(u, u.holdPos.x, u.holdPos.y, dt, 0.3); return; }
  const slot = formationSlot(k);
  const d = Math.hypot(slot.x - u.x, slot.y - u.y);
  if (d > 24) { placeNear(u, p.x, p.y, 1.5); return; }
  if (d > 0.45) chaseTo(u, slot.x, slot.y, dt, 0.3, d > 3 ? 1.4 : 1.05);
}

function memberOffset(k) {
  const a = k * 2.4, r = k === 0 ? 0 : 0.9 + (k % 2) * 0.4;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

function updateGroupMember(m, g, k, dt) {
  if (g.engaged) {
    const e = nearestEnemy(m, 22);
    if (e) { engage(m, e, dt); return; }
  }
  const o = memberOffset(k);
  const tx = g.x + o.x, ty = g.y + o.y;
  const d = Math.hypot(tx - m.x, ty - m.y);
  if (d > 30) { m.x = tx; m.y = ty; return; }
  if (d > 0.3) chaseTo(m, tx, ty, dt, 0.2, d > 2 ? 1.5 : 1.1);
}

function updatePeasant(v, dt, night) {
  v.hidden = night;
  if (night) return;
  if (v.wait > 0) { v.wait -= dt; return; }
  if (!v.goal) {
    const h = v.home;
    const r = h.type === 'stadt' ? 5.5 : h.type === 'spieler' ? 4 : 4.2;
    v.goal = { x: h.x + rand(-r, r), y: h.y + rand(-r, r) };
    if (!isWalkable(G.world, v.goal.x, v.goal.y)) { v.goal = null; return; }
    v.goalT = 0;
  }
  v.goalT = (v.goalT || 0) + dt;
  const arrived = moveToward(v, v.goal.x, v.goal.y, dt, 0.2, 0.55);
  // Angekommen, an einer Mauer hängen geblieben oder zu lange unterwegs: neues Ziel
  if (arrived || !v.moving || v.goalT > 14) { v.goal = null; v.wait = rand(2, 7); }
}

function separate() {
  const list = G.units;
  const p = G.s.player;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead || a.hidden || Math.abs(a.x - p.x) + Math.abs(a.y - p.y) > 30) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.dead || b.hidden) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) > 0.6 || Math.abs(dy) > 0.6) continue;
      const d = Math.hypot(dx, dy) || 0.01;
      const min = (a.mounted || b.mounted) ? 0.62 : 0.42;
      if (d < min) {
        const push = (min - d) * 0.5;
        const nx = dx / d, ny = dy / d;
        const W = G.world;
        if (a.kind !== 'player' && isWalkable(W, a.x - nx * push, a.y - ny * push)) { a.x -= nx * push; a.y -= ny * push; }
        if (b.kind !== 'player' && isWalkable(W, b.x + nx * push, b.y + ny * push)) { b.x += nx * push; b.y += ny * push; }
      }
    }
  }
}

// ---------------------------------------------------------------- Gruppen
function randomTile(pred, tries = 400) {
  const W = G.world, N = W.N;
  for (let k = 0; k < tries; k++) {
    const x = 3 + Math.floor(Math.random() * (N - 6)), y = 3 + Math.floor(Math.random() * (N - 6));
    const t = W.tiles[y * N + x];
    if (pred(t, x + 0.5, y + 0.5)) return { x: x + 0.5, y: y + 0.5 };
  }
  return null;
}

function farFromPlayer(x, y, d) {
  const p = G.s.player;
  return Math.hypot(p.x - x, p.y - y) > d;
}

function farFromSites(x, y, d) {
  return G.world.sites.every((s) => Math.hypot(s.x - x, s.y - y) > d);
}

function sitesFor(type) {
  const S = G.world.sites;
  if (type === 'steuer') return S.filter((s) => s.faction === 'normannen' || s.type === 'dorf' || s.type === 'halle');
  if (type === 'haendler') return S.filter((s) => ['stadt', 'markt', 'dorf', 'abtei', 'halle', 'burg'].includes(s.type));
  if (type === 'patrouille') return S.filter((s) => s.type !== 'lager' && s.type !== 'spieler');
  return S;
}

function findSpawnPos(type, opts) {
  const gt = GROUP_TYPES[type];
  if (opts.near) {
    const n = opts.near;
    for (let k = 0; k < 200; k++) {
      const a = Math.random() * Math.PI * 2, r = rand(n.rMin ?? 6, n.r);
      const x = n.x + Math.cos(a) * r, y = n.y + Math.sin(a) * r;
      if (isWalkable(G.world, x, y) && farFromPlayer(x, y, 10)) return { x, y };
    }
  }
  const minP = opts.initial ? 18 : 30;
  switch (gt.spawn) {
    case 'wild':
      return randomTile((t, x, y) => (t === T.FOREST || t === T.HILLS) && farFromSites(x, y, 12) && farFromPlayer(x, y, minP));
    case 'forest': {
      const camp = G.world.sites.find((s) => s.type === 'lager');
      return randomTile((t, x, y) => t === T.FOREST && farFromPlayer(x, y, minP) && (!camp || Math.hypot(camp.x - x, camp.y - y) < 40));
    }
    case 'patrol':
      return randomTile((t, x, y) => t === T.ROAD && farFromPlayer(x, y, minP) && farFromSites(x, y, 5), 1200);
    case 'route': {
      const S = type === 'steuer' ? G.world.sites.filter((s) => s.faction === 'normannen') : sitesFor(type);
      const cand = S.filter((s) => farFromPlayer(s.x, s.y, minP));
      const s = pick(cand.length ? cand : S);
      return { x: s.x + rand(-1, 1), y: s.y + rand(-1, 1) };
    }
    default:
      return null;
  }
}

export function spawnGroup(type, opts = {}) {
  const gt = GROUP_TYPES[type];
  const pos = opts.pos || findSpawnPos(type, opts);
  if (!pos) return null;
  const g = {
    id: uid(), type, faction: gt.faction, x: pos.x, y: pos.y, home: { x: pos.x, y: pos.y },
    members: [], fallen: [], engaged: false, provoked: false, path: null, pathI: 0, wait: rand(0, 4),
    questId: opts.questId || null, aggro: gt.hostile ? 7 : 6,
  };
  const bonus = Math.floor((G.s.day - 1) / 8);
  if (opts.members) {
    for (const md of opts.members) {
      const m = makeUnit(md);
      m.team = 'group'; m.group = g; m.mounted = !!m.st.horse;
      g.members.push(m);
    }
  } else {
    for (const [nt, min, max] of gt.members) {
      const n = randInt(min, max);
      for (let k = 0; k < n; k++) {
        const m = makeNpc(nt, pos.x + rand(-1, 1), pos.y + rand(-1, 1), bonus);
        m.team = 'group';
        m.group = g;
        g.members.push(m);
      }
    }
  }
  if (!g.members.length) return null;
  G.groups.push(g);
  for (const m of g.members) G.units.push(m);
  return g;
}

function chooseDest(g) {
  const gt = GROUP_TYPES[g.type];
  const W = G.world;
  let dest = null;
  if (gt.spawn === 'wild' || gt.spawn === 'forest' || g.questId) {
    for (let k = 0; k < 30 && !dest; k++) {
      const x = g.home.x + rand(-14, 14), y = g.home.y + rand(-14, 14);
      if (isWalkable(W, x, y)) dest = { x, y };
    }
  } else if (gt.spawn === 'patrol') {
    const s = pick(sitesFor('patrouille'));
    dest = { x: s.x + rand(-2, 2), y: s.y + rand(-2, 2) };
  } else {
    const opts = sitesFor(g.type).filter((s) => Math.hypot(s.x - g.x, s.y - g.y) > 15);
    const s = pick(opts.length ? opts : sitesFor(g.type));
    dest = { x: s.x + rand(-1, 1), y: s.y + rand(-1, 1) };
  }
  if (!dest) { g.wait = 3; return; }
  g.path = findPath(W, g.x, g.y, dest.x, dest.y, 30000);
  g.pathI = 0;
  if (!g.path) g.wait = rand(3, 6);
}

export function updateGroups(dt) {
  const p = G.s.player;
  G.pathBudget = 2;
  for (const g of G.groups) {
    if (!g.members.length) continue;
    const gt = GROUP_TYPES[g.type];
    const lead = g.members[0];
    if (g.engaged) {
      let minD = Infinity;
      for (const m of g.members) minD = Math.min(minD, Math.hypot(m.x - p.x, m.y - p.y));
      if (minD > 17 || p.dead) {
        g.engaged = false;
        g.path = null; g.wait = 2;
        g.x = lead.x; g.y = lead.y;
        log(`${gt.nom} ${gt.pl ? 'lassen' : 'lässt'} von dir ab.`);
      }
      continue;
    }
    const hostile = groupHostile(g);
    if (hostile && !(G.s.safeTime > 0)) {
      const dP = Math.hypot(p.x - lead.x, p.y - lead.y);
      if (dP < g.aggro) {
        g.engaged = true;
        log(`${gt.nom} ${gt.pl ? 'greifen' : 'greift'} an!`, 'bad');
        continue;
      }
    }
    if (!g.path) {
      if (g.wait > 0) { g.wait -= dt; continue; }
      if (G.pathBudget > 0) { G.pathBudget--; chooseDest(g); }
      continue;
    }
    const target = g.path[g.pathI];
    const t = tileAt(G.world, g.x, g.y);
    const sp = gt.speed * TERRAIN_SPEED[t] * dt;
    const dx = target.x - g.x, dy = target.y - g.y, d = Math.hypot(dx, dy);
    if (d <= sp + 0.02) {
      g.x = target.x; g.y = target.y; g.pathI++;
      if (g.pathI >= g.path.length) { g.path = null; g.wait = rand(3, 9); }
    } else {
      g.x += (dx / d) * sp; g.y += (dy / d) * sp;
    }
  }
}

export function maintainGroups(initial = false) {
  for (const [type, gt] of Object.entries(GROUP_TYPES)) {
    if (gt.minDay && G.s.day < gt.minDay && !initial) continue;
    if (gt.minDay && initial) continue;
    const want = gt.count + (type === 'banditen' ? Math.min(4, Math.floor(G.s.day / 6)) : 0);
    const have = G.groups.filter((g) => g.type === type && !g.questId).length;
    const n = initial ? want : Math.min(2, want - have);
    for (let k = 0; k < n; k++) spawnGroup(type, { initial });
  }
}

// ---------------------------------------------------------------- Dorfbewohner
export function spawnPeasants() {
  G.peasants = [];
  const lvl = G.s.castle.level;
  for (const site of G.world.sites) {
    const n = { stadt: 7, markt: 5, dorf: 4, halle: 3, abtei: 3, burg: 3, lager: 3, spieler: lvl * 2 + 1 }[site.type] || 0;
    for (let k = 0; k < n; k++) {
      const look = site.type === 'lager' ? 'wald' : site.type === 'abtei' && k < 2 ? 'moench' : 'bauer';
      const v = makeUnit({ kind: 'peasant', cls: 'zivil', name: look === 'moench' ? 'Mönch' : 'Bauer', look, tunic: look === 'bauer' ? pick(PEASANT_TUNICS) : null });
      placeNear(v, site.x, site.y, 3);
      v.home = site;
      v.wait = rand(0, 4);
      G.peasants.push(v);
    }
  }
}
