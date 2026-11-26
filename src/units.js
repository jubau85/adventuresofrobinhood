// Einheiten, Gefolge, KI-Gruppen und Kampf.

import { G, uid, log, homeName, playerColor } from './state.js';
import {
  CLASSES, ITEMS, NPC_TYPES, GROUP_TYPES, T, TERRAIN_SPEED, NAMES_M, NAMES_F, EPITHETS,
  GOODS, GOOD_IDS, PEASANT_TUNICS, HAIR, LOOKS, FERRIES, FACTIONS, CASTLE_TOWERS,
  LIVERY, MAP_K, MAP_AREA,
} from './data.js';
import { isWalkable, findPath, tileAt, nearestWalkable, landAt, groundZ } from './world.js';
import { isoX, isoY } from './iso.js';
import { rand, randInt, pick, clamp } from './rng.js';
import { changeRep, isHostileFaction, isAlly, addRenown, onQuestGroupDestroyed } from './politics.js';
import { cargoFree, addCargo, siteById } from './economy.js';
import { castleSite, bLevel, castleBonusAt, workingPlots } from './castle.js';
import { hourOf, passHours } from './sim.js';
import { hitAnimal, takeAnimal } from './animals.js';
import { spawnVillagers, updateVillager, updateSayings, buffActive } from './life.js';
import { countDead, updateSiege } from './siege.js';
import { raidVictim, villagerKilled } from './dynamics.js';
import { companionWatch } from './tournament.js';
import { cheatOn } from './cheats.js';
import { sfxAt } from './audio.js';
import { startTactics, updateTactics, updateTacMember, DEPLOY_DIST } from './tactics.js';
import { shireFerryFactor } from './shires.js';

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
  u.st = { maxHp: Math.round(hp), atk, def, range, cd, speed, ranged, horse, armorDef: a ? a.def : 0, shield: s ? s.def : 0 };
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
  if (G.peasants.some((v) => v.dead)) G.peasants = G.peasants.filter((v) => !v.dead);
  for (const p of G.peasants) list.push(p);
  for (const e of G.extras || []) list.push(e);
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
// Gangart: Alle gehen. Gelaufen wird bei Gefahr (Kampf, Angriff, Flucht, Löschen), zum Aufholen und beim Helden
// auf Doppelklick (oder mit gedrückter Umschalttaste). Gehen ist gut halb so schnell wie Laufen.
export const WALK = 0.55;
function wantsRun(u) {
  if (u.kind === 'peasant') return !!u.flee || !!(u.task && u.task.speed >= 1.4);
  if (u.combatT > 0 || u.attackTarget) return true;
  if (u.kind === 'player') return (!!u.runClick || !!G.input.shift) && (!!u.path || !!G.input.dx || !!G.input.dy);
  if (u.kind === 'companion') return !!G.s.player.run || !!u.catchUp;
  if (u.group && u.group.tac) return !!u.tacRun || !!u.catchUp;
  if (u.group) return !!(u.group.engaged || u.group.feud) || !!u.catchUp;
  return !!u.catchUp;
}
export function unitSpeed(u) {
  const t = tileAt(G.world, u.x, u.y);
  let s = u.st.speed * TERRAIN_SPEED[t];
  if (u.mounted && u.st.horse) s *= (1 + u.st.horse.speed) * (t === T.FOREST ? 0.72 : 1);
  if (u.kind !== 'peasant' && !u.run) s *= WALK;
  return s;
}

export function moveToward(u, tx, ty, dt, stop = 0.05, mult = 1) {
  const dx = tx - u.x, dy = ty - u.y;
  const d = Math.hypot(dx, dy);
  if (d <= stop) return true;
  const step = Math.min(unitSpeed(u) * mult * dt, d - stop * 0.5);
  const nx = u.x + (dx / d) * step, ny = u.y + (dy / d) * step;
  const W = G.world;
  // Eingeklemmt (ein Haus wurde fertig, ein Tor ging zu, ins Gedränge geschoben): auf kürzestem Weg ins Freie
  if (!isWalkable(W, u.x, u.y)) {
    const e = escapeSpot(W, u.x, u.y);
    if (e) {
      const ex = e.x - u.x, ey = e.y - u.y, ed = Math.hypot(ex, ey) || 1, st = Math.min(ed, unitSpeed(u) * mult * dt);
      u.x += (ex / ed) * st; u.y += (ey / ed) * st; u.moving = true;
      return false;
    }
  }
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

// Nächste freie Stelle (Feldmitte oder Punkt daneben) für jemanden, der in einem Hindernis steckt
function escapeSpot(W, x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  let best = null, bd = Infinity;
  for (let r = 0; r <= 3 && !best; r++) {
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
      for (const [fx, fy] of [[0.5, 0.5], [0.15, 0.5], [0.85, 0.5], [0.5, 0.15], [0.5, 0.85]]) {
        const px = tx + ox + fx, py = ty + oy + fy;
        if (!isWalkable(W, px, py)) continue;
        const d = Math.hypot(px - x, py - y);
        if (d < bd) { bd = d; best = { x: px, y: py }; }
      }
    }
  }
  return best;
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
export function chaseTo(u, tx, ty, dt, stop, mult = 1) {
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

// Einem Platz in einer Formation gleichmäßig folgen: mit der Geschwindigkeit des Ankers (vx, vy) und einer sanften
// Korrektur zum Platz hin, statt anzulaufen, anzuhalten und wieder anzulaufen. Die Blickrichtung dreht gedämpft.
// Steht der Anker, bleibt man in der Nähe des Platzes ruhig stehen (mit Spielraum, damit nichts flackert).
export function followSlot(u, tx, ty, vx, vy, dt, mult = 1.15) {
  const ex = tx - u.x, ey = ty - u.y, d = Math.hypot(ex, ey);
  if (d > 1.2 && !lineClear(u.x, u.y, tx, ty)) { u._settled = false; return chaseTo(u, tx, ty, dt, 0.3, mult); }
  u.chase = null;
  const still = Math.hypot(vx, vy) < 0.05;
  if (still && d < (u._settled ? 0.55 : 0.12)) { u._settled = true; return true; }
  u._settled = false;
  let wx = vx + ex * 1.6, wy = vy + ey * 1.6;
  const vmax = unitSpeed(u) * mult, w = Math.hypot(wx, wy);
  if (w > vmax) { wx *= vmax / w; wy *= vmax / w; }
  const sp = Math.hypot(wx, wy);
  if (sp < 0.04) return true;
  const nx = u.x + wx * dt, ny = u.y + wy * dt, W = G.world;
  if (isWalkable(W, nx, ny)) { u.x = nx; u.y = ny; }
  else if (isWalkable(W, nx, u.y)) u.x = nx;
  else if (isWalkable(W, u.x, ny)) u.y = ny;
  else return false;
  u.moving = true;
  const k = Math.min(1, dt * 5);
  let fx = (u.dirX ?? wx / sp) + (wx / sp - (u.dirX ?? wx / sp)) * k, fy = (u.dirY ?? wy / sp) + (wy / sp - (u.dirY ?? wy / sp)) * k;
  const fl = Math.hypot(fx, fy) || 1; u.dirX = fx / fl; u.dirY = fy / fl;
  const sx = u.dirX - u.dirY;
  if (Math.abs(sx) > 0.2) u.facing = sx > 0 ? 1 : -1;
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
  const path = findPath(G.world, p.x, p.y, x, y, 450000 * MAP_AREA);
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

export function isEnemy(a, b) {
  if (b.dead || a.dead) return false;
  if (a.team === 'player') return !!(b.group && b.group.engaged) || raidVictim(b);
  const ga = a.group;
  if (!ga) return false;
  if (ga.engaged && b.team === 'player') return true;
  const gb = b.group;
  return !!(gb && gb !== ga && (ga.feud === gb || gb.feud === ga));
}

export function nearestEnemy(u, radius, from = u) {
  let best = null, bd = radius;
  for (const o of G.combatants || G.units) {
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
// Von wo kommt der Schlag? 1 von vorn (±60°), 0.5 von der Seite, 0 von hinten (der Schild hilft nur nach vorn)
export function shieldFacing(t, ox, oy) {
  if (t.dirX === undefined) return 1;
  const dx = ox - t.x, dy = oy - t.y, d = Math.hypot(dx, dy);
  if (d < 1e-3) return 1;
  const c = (dx * t.dirX + dy * t.dirY) / d;
  return c >= 0.5 ? 1 : c > -0.34 ? 0.5 : 0;
}
function calcDamage(a, t, face = 1, charge = false) {
  let atk = a.st.atk, def = t.st.def;
  if (a.mounted && a.st.horse) atk += a.st.horse.atk;
  if (t.mounted && t.st.horse) def += t.st.horse.def;
  // Schild: voll von vorn, halb von der Seite, gar nicht von hinten
  const sh = t.st.shield || 0;
  def -= sh * (1 - face);
  if (a.team === 'player') { const b = castleBonusAt(a.x, a.y); if (b) atk *= 1 + b.atk; if (buffActive()) atk *= 1.1; }
  if (t.team === 'player') { const b = castleBonusAt(t.x, t.y); if (b) def = def * (1 + b.def) + G.s.castle.level; if (buffActive()) def *= 1.1; }
  let dmg = (atk * atk) / (atk + def * 1.5) * rand(0.8, 1.2);
  // In den Rücken trifft man härter; ein Reiter im vollen Ansturm noch mehr
  if (face === 0) dmg *= 1.2;
  if (charge) dmg *= 1.6;
  let crit = false;
  if (Math.random() < 0.08) { dmg *= 1.6; crit = true; }
  return { dmg: Math.max(1, Math.round(dmg)), crit };
}

// Blickrichtung setzen: dirX/dirY für die 3D-Figuren, facing (links/rechts) für die gezeichneten
export function faceDir(u, dx, dy) {
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return;
  u.dirX = dx / d; u.dirY = dy / d;
  const sx = dx - dy;
  if (Math.abs(sx) > 0.05 * d) u.facing = sx >= 0 ? 1 : -1;
}

export function attack(u, t) {
  const d = Math.hypot(t.x - u.x, t.y - u.y);
  u.cd = u.st.cd * rand(0.92, 1.08);
  u.swing = 0.3;
  faceDir(u, t.x - u.x, t.y - u.y);
  u.combatT = 5; t.combatT = 5;
  if (u.st.ranged) {
    sfxAt(ITEMS[u.eq.waffe].kind === 'armbrust' ? 'armbrust' : 'bogen', u.x, u.y, 0.8);
    G.projectiles.push({ x: u.x, y: u.y, tx: t.x, ty: t.y, target: t, att: u, t: 0, dur: Math.max(0.18, d / 15), bolt: ITEMS[u.eq.waffe].kind === 'armbrust' });
  } else {
    sfxAt('hieb', u.x, u.y, 0.6);
    // Ansturm: Wer zu Pferd mit Anlauf zuschlägt, trifft mit voller Wucht
    const charge = !!(u.mounted && u.st.horse && (u.runDist || 0) > 3.5);
    u.runDist = 0;
    applyHit(u, t, false, u.x, u.y, charge);
  }
}

function applyHit(a, t, ranged = false, ox = a.x, oy = a.y, charge = false) {
  if (t.dead) return;
  if (t.team === 'player' && cheatOn('god')) { t.flash = 0.12; G.fx.push({ kind: 'text', x: t.x, y: t.y, text: '0', color: '#c8d8e8', t: 0, dur: 0.8 }); return; }
  const face = shieldFacing(t, ox, oy), sh = t.st.shield || 0;
  // Zählung für die Auswertung (Testmodus): Treffer von vorn, von der Seite, von hinten, Ansturm, abgefangen
  const hs = G.hitStats || (G.hitStats = { vorn: 0, seite: 0, hinten: 0, ansturm: 0, schild: 0 });
  hs[face === 1 ? 'vorn' : face ? 'seite' : 'hinten']++; if (charge) hs.ansturm++;
  // Ein Pfeil von vorn bleibt oft im Schild stecken
  if (ranged && sh && face === 1 && Math.random() < 0.06 + sh * 0.04) {
    sfxAt('pfeilholz', t.x, t.y, 0.7);
    t.combatT = 5; hs.schild++;
    if (a.team === 'player' || t.team === 'player') G.fx.push({ kind: 'text', x: t.x, y: t.y, text: 'Schild', color: '#c8d0d8', t: 0, dur: 0.8 });
    return;
  }
  const { dmg, crit } = calcDamage(a, t, face, charge);
  // Für die Schlachtführung: Wann hat es zuletzt Treffer gegeben?
  if (t.group && t.group.tac) t.group.tac.lastHit = G.time;
  if (a.group && a.group.tac) a.group.tac.lastHit = G.time;
  // Pfeile klingen anders als Hiebe: in den Schild, an der Rüstung abprallend oder ins Fleisch
  const shield = sh && face > 0 && Math.random() < 0.4 * face, heavy = (t.st.armorDef || 0) >= 6;
  sfxAt(ranged ? (shield ? 'pfeilholz' : heavy ? 'pfeilmetall' : 'pfeil') : shield ? 'schild' : heavy ? 'klirren' : 'treffer', t.x, t.y, crit ? 1 : 0.8);
  t.hp -= dmg;
  t.flash = 0.18;
  t.combatT = 5;
  const col = t.team === 'player' ? '#ff8a6a' : crit || charge ? '#ffd84a' : face === 0 ? '#ffb070' : '#fff4d8';
  G.fx.push({ kind: 'text', x: t.x, y: t.y, text: crit || charge ? `${dmg}!` : String(dmg), color: col, t: 0, dur: 1.0 });
  if (charge && (a.team === 'player' || t.team === 'player')) G.fx.push({ kind: 'text', x: t.x, y: t.y - 0.6, text: 'Ansturm!', color: '#ffd84a', t: 0, dur: 1.2 });
  if (t.hp <= 0) unitDown(t, a);
}

// Pfeil auf ein Tier (Jagd). Ein Pfeil zielt etwas vor ein laufendes Tier.
export function shootAnimal(u, a) {
  const d = Math.hypot(a.x - u.x, a.y - u.y);
  u.cd = u.st.cd * rand(0.92, 1.08);
  u.swing = 0.3;
  faceDir(u, a.x - u.x, a.y - u.y);
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
        if (p.npcHunt) { if (!tg.dead) takeAnimal(tg); }
        else if (!tg.dead && Math.hypot(tg.x - p.tx, tg.y - p.ty) < 1.1) { sfxAt('pfeil', tg.x, tg.y, 0.7); hitAnimal(tg, p.dmg, p.att); }
        else sfxAt('pfeilboden', p.tx, p.ty, 0.6);
      } else if (!tg.dead && Math.hypot(tg.x - p.tx, tg.y - p.ty) < 1.2) applyHit(p.att, tg, true, p.x, p.y);
      else sfxAt('pfeilboden', p.tx, p.ty, 0.6);
      G.projectiles.splice(i, 1);
    }
  }
}

export function grantXp(u, amount) {
  if (!u || u.dead || (u.kind !== 'player' && u.kind !== 'companion')) return;
  u.xp += Math.round(amount * (buffActive() ? 1.15 : 1));
  while (u.xp >= xpNeeded(u.level) && u.level < 12) {
    u.xp -= xpNeeded(u.level);
    u.level++;
    const old = u.st.maxHp;
    computeStats(u);
    u.hp += u.st.maxHp - old;
    log(`${u.kind === 'player' ? 'Du erreichst' : `${u.name} erreicht`} Stufe ${u.level}.`, 'good');
  }
}

// Wie der Gefallene gemalt ist: Waffenknecht in Rüstung (rot), Wegelagerer und Waldläufer (grün), Bauer und Bürger (braun)
function corpseOf(t) {
  const r = t.eq && t.eq.ruestung;
  const typ = t.cls === 'bandit' || t.cls === 'waldlaeufer' || t.look === 'bandit' || t.look === 'wald' ? 'gruen'
    : t.kind === 'peasant' || t.cls === 'zivil' || (!r && t.cls !== 'ritter' && t.cls !== 'soldat') ? 'braun' : 'rot';
  return { typ, v: 1 + Math.floor(Math.random() * 4), flip: Math.random() < 0.5 };
}
function unitDown(t, killer) {
  t.dead = true;
  t.hp = 0;
  if (t.kind === 'player') { playerDefeated(); return; }
  if (t.kind === 'companion') {
    t.status = 'verwundet';
    t.woundedDays = 4;
    t.hp = 1;
    t.path = null;
    log(`${t.name} ist schwer verwundet und wird nach ${homeName()} gebracht.`, 'bad');
    G.fx.push({ kind: 'corpse', x: t.x, y: t.y, look: unitLook(t), t: 0, dur: 6, ...corpseOf(t) });
    return;
  }
  G.fx.push({ kind: 'corpse', x: t.x, y: t.y, look: unitLook(t), t: 0, dur: 25, ...corpseOf(t) });
  const g = t.group;
  // Auswertung der Feldschlacht (Testmodus): wer fällt durch wen
  if (g && g.tac && killer && killer.group) { const ks = G.killStats || (G.killStats = {}); const k = `${killer.group.type}:${killer.role || '?'}>${t.role || '?'}`; ks[k] = (ks[k] || 0) + 1; }
  countDead(t);
  if (t.kind === 'peasant') { villagerKilled(t); return; }
  // Erfahrung nur für Kämpfe, an denen du beteiligt bist
  if ((killer && killer.team === 'player') || (g && g.engaged)) {
    const xp = 6 + t.level * 6;
    grantXp(killer, xp);
    for (const c of partyMembers()) if (c !== killer) grantXp(c, Math.round(xp / 3));
    if (killer !== G.s.player) grantXp(G.s.player, Math.round(xp / 3));
  }
  if (g) {
    g.members = g.members.filter((m) => m !== t);
    g.fallen.push(t);
    if (g.members.length === 0) {
      if (g.engaged) groupDestroyed(g);
      else feudLost(g);
    }
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
  // gedämpfte Blickrichtung des Helden: das Gefolge schwenkt nicht bei jedem Wegpunkt mit
  const dx = G.pHead ? G.pHead.x : p.dirX || 0.7, dy = G.pHead ? G.pHead.y : p.dirY || 0.7;
  return {
    x: p.x - dx * row * 1.05 + -dy * side * 0.75,
    y: p.y - dy * row * 1.05 + dx * side * 0.75,
  };
}

// ---------------------------------------------------------------- Aktualisierung
export function updateUnits(dt) {
  const p = G.s.player;
  // Alle, die gerade kämpfen können: nur sie kommen als Gegner in Frage
  G.combatants = G.units.filter((o) => !o.dead && (o.team === 'player' || (o.group && (o.group.engaged || o.group.feud))));
  for (const u of G.units) {
    u.moving = false;
    if (u.cd > 0) u.cd -= dt;
    if (u.flash > 0) u.flash -= dt;
    if (u.swing > 0) u.swing -= dt;
    if (u.combatT > 0) u.combatT -= dt;
    u.run = wantsRun(u);
    u.catchUp = false;
    // Wer auf einer neu gebauten Mauer steht, wird daneben gesetzt. Nicht die Turnierritter (und du in den Schranken):
    // Sie reiten feste Wege um Schranke und Zelte, ihr Wartepunkt vor dem Zelt liegt auf einem gesperrten Feld.
    const scripted = u.tourney || (u === p && G.tour && G.tour.lock);
    if (!u.hidden && !scripted && !isWalkable(G.world, u.x, u.y)) {
      const n = nearestWalkable(G.world, Math.floor(u.x), Math.floor(u.y), 4);
      if (n) { u.x = n.x + 0.5; u.y = n.y + 0.5; u.chase = null; }
    }
  }
  if (G.s.safeTime > 0) G.s.safeTime -= dt;

  const px0 = p.x, py0 = p.y;
  updatePlayer(p, dt);
  // Geschwindigkeit des Helden: ihr folgt das Gefolge gleichmäßig
  if (dt > 0) { const vx = (p.x - px0) / dt, vy = (p.y - py0) / dt; G.playerVel = Math.hypot(vx, vy) > 8 ? { x: 0, y: 0 } : { x: vx, y: vy }; }
  if (!G.pHead) G.pHead = { x: p.dirX || 0.7, y: p.dirY || 0.7 };
  if (p.moving && dt > 0) {
    const k = Math.min(1, dt * 1.5), h = G.pHead;
    h.x += ((p.dirX ?? h.x) - h.x) * k; h.y += ((p.dirY ?? h.y) - h.y) * k;
    const l = Math.hypot(h.x, h.y) || 1; h.x /= l; h.y /= l;
  }
  const party = partyMembers();
  party.forEach((c, k) => { if (!c.dead) updateCompanion(c, k, dt); });
  for (const g of G.groups) {
    const near = Math.hypot(g.x - p.x, g.y - p.y) < 55;
    for (let k = 0; k < g.members.length; k++) {
      const m = g.members[k];
      if (near || g.engaged || g.feud) updateGroupMember(m, g, k, dt);
      else {
        const o = g.army ? armyOffset(g, k) : memberOffset(k);
        if (isWalkable(G.world, g.x + o.x, g.y + o.y)) { m.x = g.x + o.x; m.y = g.y + o.y; } else { m.x = g.x; m.y = g.y; }
      }
    }
  }
  for (const v of G.peasants) {
    if (Math.abs(v.x - p.x) + Math.abs(v.y - p.y) < 60) updateVillager(v, dt);
  }
  updateSayings(dt);
  separate();
  updateTowers(dt);
  // Regeneration außerhalb des Kampfes: mit Feldscher unterwegs schneller, im Hospiz der Burg rasch
  const hz = bLevel('hospiz'), home = castleSite();
  const field = [1, 1, 1.5, 2][hz];
  const regen = (u) => {
    if (u.combatT > 0 || u.hp >= u.st.maxHp) return;
    const atHome = hz && home && Math.hypot(u.x - home.x, u.y - home.y) < 10;
    u.hp = Math.min(u.st.maxHp, u.hp + u.st.maxHp * 0.015 * dt * field * (atHome ? 5 : 1));
  };
  regen(p);
  party.forEach(regen);

  // Gefallene entfernen
  if (G.units.some((u) => u.dead)) {
    if (party.some((c) => c.status !== 'party' || c.dead)) { /* Status bereits gesetzt */ }
    G.units = G.units.filter((u) => !u.dead || u.kind === 'player');
    rebuildUnits();
  }
  for (const u of G.units) {
    if (u.moving) u.anim += dt;
    // Anlauf zu Pferd (für den Ansturm): Strecke im Lauf, sie verfällt im Stand
    if (u.mounted) {
      const dd = u._px === undefined ? 0 : Math.hypot(u.x - u._px, u.y - u._py);
      u.runDist = u.moving && u.run && dd < 1 ? Math.min(12, (u.runDist || 0) + dd) : Math.max(0, (u.runDist || 0) - dt * 3);
    }
    u._px = u.x; u._py = u.y;
  }
}

function updatePlayer(p, dt) {
  if (p.dead) return;
  if (G.tour && G.tour.lock) return;
  const inp = G.input;
  const at = p.attackTarget;
  if (at && (at.dead || ((!at.group || !at.group.engaged) && !raidVictim(at)))) p.attackTarget = null;
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
  const watch = companionWatch(k);
  if (watch) { u.mounted = false; chaseTo(u, watch.x, watch.y, dt, 0.3); return; }
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
  if (d > 3) u.catchUp = true;
  followSlot(u, slot.x, slot.y, G.playerVel ? G.playerVel.x : 0, G.playerVel ? G.playerVel.y : 0, dt, d > 3 ? 1.4 : 1.1);
}

// Heere ziehen in Blöcken: acht Mann nebeneinander, Reihe hinter Reihe
function armyOffset(g, k) {
  const fx = g.fdx ?? (g.dirX || 1), fy = g.fdy ?? (g.dirY || 0);
  const col = (k % 8) - 3.5, row = Math.floor(k / 8);
  return { x: -fy * col * 0.85 - fx * row * 0.85, y: fx * col * 0.85 - fy * row * 0.85 };
}

function memberOffset(k) {
  const a = k * 2.4, r = k === 0 ? 0 : 0.9 + (k % 2) * 0.4;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

// Besatzung einer Belagerung: Jeder hat seinen Posten hinter der Mauer. Schützen schießen über die Mauer,
// Nahkämpfer stellen sich nur Feinden, die schon drinnen sind (oder direkt vor ihnen in der Bresche stehen).
function updateDefender(m, g, dt) {
  const sg = G.siege;
  const inside = sg && sg.def === g && sg.walls ? sg.walls.inside : null;
  if (g.engaged || g.feud) {
    const e = nearestEnemy(m, 16);
    if (e) {
      const d = Math.hypot(e.x - m.x, e.y - m.y);
      if (d <= m.st.range + 0.15) {
        if (m.cd <= 0) attack(m, e);
        return;
      }
      if (!m.st.ranged && (!inside || inside(e.x, e.y))) { engage(m, e, dt); return; }
    }
  }
  const post = m.post;
  if (Math.hypot(post.x - m.x, post.y - m.y) > 0.35) chaseTo(m, post.x, post.y, dt, 0.3, 1.1);
}

function updateGroupMember(m, g, k, dt) {
  if (g.defender && m.post) { updateDefender(m, g, dt); return; }
  if (g.tac) { updateTacMember(m, g, dt); return; }
  if (g.engaged || g.feud) {
    const e = nearestEnemy(m, 22);
    if (e) { engage(m, e, dt); return; }
  }
  const o = g.army ? armyOffset(g, k) : memberOffset(k);
  const tx = g.x + o.x, ty = g.y + o.y;
  const d = Math.hypot(tx - m.x, ty - m.y);
  if (d > 30) { m.x = tx; m.y = ty; return; }
  if (d > 2) m.catchUp = true;
  followSlot(m, tx, ty, g.vx || 0, g.vy || 0, dt, d > 2 ? 1.5 : 1.15);
}


function separate() {
  const p = G.s.player;
  const list = G.units.filter((o) => !o.dead && !o.hidden && !o.noSep && Math.abs(o.x - p.x) + Math.abs(o.y - p.y) <= 31);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
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

// Landmassen, auf denen es Orte gibt (Irland bleibt unbewohnt)
function settledLand(x, y) {
  const l = landAt(G.world, x, y);
  return l > 0 && G.world.sites.some((s) => s.land === l);
}

function sitesFor(type) {
  const S = G.world.sites;
  const gt = GROUP_TYPES[type];
  if (type === 'steuer') return S.filter((s) => s.realm !== 'fr' && s.realm !== 'fl' && (s.faction === 'normannen' || s.type === 'dorf' || s.type === 'halle'));
  if (type === 'haendler') return S.filter((s) => ['stadt', 'markt', 'dorf', 'abtei', 'halle', 'burg'].includes(s.type));
  if (gt && gt.spawn === 'patrol') return S.filter((s) => s.type !== 'lager' && s.type !== 'spieler' && s.type !== 'einsiedelei' && (!gt.realms || gt.realms.includes(s.realm)) && (!gt.siteFaction || s.faction === gt.siteFaction));
  return S.filter((s) => s.type !== 'einsiedelei');
}

// Ziele auf derselben Landmasse in sinnvoller Entfernung
function reachableSites(list, x, y, minD = 0, maxD = 170) {
  const l = landAt(G.world, x, y);
  const same = list.filter((s) => s.land === l);
  const inRange = same.filter((s) => { const d = Math.hypot(s.x - x, s.y - y); return d > minD && d < maxD; });
  return inRange.length ? inRange : same;
}

function findSpawnPos(type, opts) {
  const gt = GROUP_TYPES[type];
  if (opts.near) {
    const n = opts.near;
    for (let k = 0; k < 200; k++) {
      const a = Math.random() * Math.PI * 2, r = rand(n.rMin ?? 6, n.r);
      const x = n.x + Math.cos(a) * r, y = n.y + Math.sin(a) * r;
      if (isWalkable(G.world, x, y) && farFromPlayer(x, y, 10) && landAt(G.world, x, y) === landAt(G.world, n.x, n.y)) return { x, y };
    }
  }
  const minP = opts.initial ? 18 : 30;
  switch (gt.spawn) {
    case 'wild':
      return randomTile((t, x, y) => (t === T.FOREST || t === T.HILLS) && farFromSites(x, y, 12) && farFromPlayer(x, y, minP) && settledLand(x, y), 800);
    case 'forest': {
      const camp = pick(G.world.sites.filter((s) => s.type === 'lager'));
      return tileNear(camp, 55, (t, x, y) => t === T.FOREST && farFromPlayer(x, y, minP));
    }
    case 'patrol': {
      const s = pick(sitesFor(type));
      return tileNear(s, 36, (t, x, y) => t === T.ROAD && farFromPlayer(x, y, minP) && farFromSites(x, y, 5));
    }
    case 'route': {
      const S = type === 'steuer' ? sitesFor('steuer').filter((s) => s.faction === 'normannen') : sitesFor(type);
      const cand = S.filter((s) => farFromPlayer(s.x, s.y, minP));
      const s = pick(cand.length ? cand : S);
      return { x: s.x + rand(-1, 1), y: s.y + rand(-1, 1) };
    }
    default:
      return null;
  }
}

// Zufälliges passendes Feld im Umkreis eines Ortes (auf dessen Landmasse)
function tileNear(site, r, pred) {
  if (!site) return null;
  const W = G.world, N = W.N;
  for (let k = 0; k < 400; k++) {
    const x = Math.floor(site.x + rand(-r, r)), y = Math.floor(site.y + rand(-r, r));
    if (x < 2 || y < 2 || x >= N - 2 || y >= N - 2) continue;
    if (W.landId[y * N + x] !== site.land) continue;
    if (pred(W.tiles[y * N + x], x + 0.5, y + 0.5)) return { x: x + 0.5, y: y + 0.5 };
  }
  return null;
}

export function spawnGroup(type, opts = {}) {
  const gt = GROUP_TYPES[type];
  const pos = opts.pos || findSpawnPos(type, opts);
  if (!pos) return null;
  const g = {
    id: uid(), type, faction: gt.faction, x: pos.x, y: pos.y, home: { x: pos.x, y: pos.y },
    members: [], fallen: [], engaged: false, provoked: false, path: null, pathI: 0, wait: rand(0, 4),
    questId: opts.questId || null, aggro: gt.hostile ? 7 : gt.army ? 12 : 6, army: !!gt.army,
  };
  const bonus = Math.floor((G.s.day - 1) / 8) + (opts.luck || 0);
  if (opts.membersUnits) {
    for (const m of opts.membersUnits) { m.team = 'group'; m.group = g; g.members.push(m); }
  } else if (opts.members) {
    for (const md of opts.members) {
      const m = makeUnit(md);
      m.team = 'group'; m.group = g; m.mounted = !!m.st.horse;
      g.members.push(m);
    }
  } else {
    for (const [nt, min, max] of gt.members) {
      const n = Math.max(1, Math.round(randInt(min, max) * (opts.scale || 1)));
      for (let k = 0; k < n; k++) {
        const m = makeNpc(nt, pos.x + rand(-1, 1), pos.y + rand(-1, 1), bonus);
        m.team = 'group';
        m.group = g;
        g.members.push(m);
      }
    }
  }
  if (!g.members.length) return null;
  // Bewaffnete einer Partei tragen deren Livree (Heere, Wachen, Streifen); Wegelagerer und Zivile bleiben, wie sie sind
  const liv = LIVERY[g.faction];
  if (liv) for (const m of g.members) if (m.cls === 'soldat' || m.cls === 'ritter') { m.tunic = liv; m.livery = liv; }
  G.groups.push(g);
  for (const m of g.members) G.units.push(m);
  return g;
}

function chooseDest(g) {
  const gt = GROUP_TYPES[g.type];
  const W = G.world;
  let dest = null;
  if (g.defender) { g.wait = 99999; return; }
  if (g.army && g.siege && !g.siegeDone && G.siege && G.siege.army === g) {
    dest = G.siege.stage === 'anmarsch' ? G.siege.camp : null;
    if (!dest) { g.wait = 99999; return; }
  } else if (g.army && g.foe && g.foe.members.length && G.groups.includes(g.foe)) {
    // Unterwegs aufgehalten (etwa von einer Streife): weiter dem Feind entgegen
    dest = { x: g.foe.x, y: g.foe.y };
  } else if (g.army) {
    // Nach der Schlacht zieht das Heer heim und löst sich auf, sobald es außer Sicht ist
    dest = g.home;
    if (Math.hypot(g.x - dest.x, g.y - dest.y) < 3) { if (!nearPlayer(g, 60)) removeGroup(g); else g.wait = 5; return; }
  }
  if (gt.spawn === 'wild' || gt.spawn === 'forest' || g.questId) {
    for (let k = 0; k < 30 && !dest; k++) {
      const x = g.home.x + rand(-14, 14), y = g.home.y + rand(-14, 14);
      if (isWalkable(W, x, y)) dest = { x, y };
    }
  } else if (gt.spawn === 'patrol') {
    const s = pick(reachableSites(sitesFor(g.type), g.x, g.y, 10, 120));
    if (s) dest = { x: s.x + rand(-2, 2), y: s.y + rand(-2, 2) };
  } else {
    const s = pick(reachableSites(sitesFor(g.type), g.x, g.y, 20, 150));
    if (s) dest = { x: s.x + rand(-1, 1), y: s.y + rand(-1, 1) };
  }
  if (!dest) { g.wait = 3; return; }
  g.path = findPath(W, g.x, g.y, dest.x, dest.y, 90000);
  g.pathI = 0;
  if (!g.path) g.wait = rand(3, 6);
}

export function updateGroups(dt) {
  const p = G.s.player;
  G.pathBudget = 2;
  G.feudT = (G.feudT || 0) - dt;
  if (G.feudT <= 0) { G.feudT = 0.5; checkFeuds(); }
  for (const g of G.groups) {
    if (!g.members.length) continue;
    // Geschwindigkeit des Ankers (aus dem letzten Bild): ihr folgen die Mitglieder gleichmäßig
    if (g._lx !== undefined && dt > 0) {
      g.vx = (g.x - g._lx) / dt; g.vy = (g.y - g._ly) / dt;
      if (Math.hypot(g.vx, g.vy) > 6) { g.vx = 0; g.vy = 0; }
    }
    g._lx = g.x; g._ly = g.y;
    const gt = GROUP_TYPES[g.type];
    const lead = g.members[0];
    if (g.army) updateArmy(g, p);
    if (g.tac) {
      updateTactics(g, dt);
      // Fern vom Spieler wird die Schlacht ausgewürfelt
      if (g.tac && !g.engaged && g.feud && Math.hypot(g.x - p.x, g.y - p.y) > 70 && Math.hypot(g.feud.x - p.x, g.feud.y - p.y) > 70) { resolveFeud(g, g.feud); continue; }
      if (!g.engaged) continue;
    }
    if (g.feud && !g.tac) {
      const f = g.feud;
      g.x = lead.x; g.y = lead.y;
      if (!f.members.length || !G.groups.includes(f) || Math.hypot(f.x - g.x, f.y - g.y) > (g.siege || g.defender ? 60 : 26)) endFeud(g);
      else if (!g.engaged && Math.hypot(g.x - p.x, g.y - p.y) > 70) resolveFeud(g, f);
      if (!g.engaged) continue;
    }
    if (g.engaged) {
      let minD = Infinity;
      for (const m of g.members) minD = Math.min(minD, Math.hypot(m.x - p.x, m.y - p.y));
      if (minD > (g.defender || g.siege ? 60 : g.army ? 40 : 17) || p.dead) {
        g.engaged = false;
        g.path = null; g.wait = g.defender ? 99999 : 2;
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
    if (g.army) {
      const dd = Math.hypot(target.x - g.x, target.y - g.y) || 1; g.dirX = (target.x - g.x) / dd; g.dirY = (target.y - g.y) / dd;
      // Die Formation dreht langsam und blickt ein paar Wegpunkte voraus, statt an jeder Ecke herumzuschwenken
      const far = g.path[Math.min(g.path.length - 1, g.pathI + 4)], fd = Math.hypot(far.x - g.x, far.y - g.y);
      if (fd > 0.5) {
        const k = Math.min(1, dt * 0.6);
        g.fdx = (g.fdx ?? g.dirX) + ((far.x - g.x) / fd - (g.fdx ?? g.dirX)) * k;
        g.fdy = (g.fdy ?? g.dirY) + ((far.y - g.y) / fd - (g.fdy ?? g.dirY)) * k;
        const l = Math.hypot(g.fdx, g.fdy) || 1; g.fdx /= l; g.fdy /= l;
      }
    }
    const t = tileAt(G.world, g.x, g.y);
    const sp = gt.speed * TERRAIN_SPEED[t] * dt * WALK;
    const dx = target.x - g.x, dy = target.y - g.y, d = Math.hypot(dx, dy);
    if (d <= sp + 0.02) {
      g.x = target.x; g.y = target.y; g.pathI++;
      if (g.pathI >= g.path.length) { g.path = null; g.wait = rand(3, 9); }
    } else {
      g.x += (dx / d) * sp; g.y += (dy / d) * sp;
    }
  }
  updateSiege(dt);
}

export function maintainGroups(initial = false) {
  for (const [type, gt] of Object.entries(GROUP_TYPES)) {
    if (gt.minDay && G.s.day < gt.minDay && !initial) continue;
    if (gt.minDay && initial) continue;
    // Auf der größeren Karte gibt es mehr Gruppen, aber nicht im Verhältnis der Fläche: es bleibt mehr Platz zwischen ihnen
    const want = Math.round((gt.count + (type === 'banditen' ? Math.min(8, Math.floor(G.s.day / 4)) : 0)) * MAP_K);
    const have = G.groups.filter((g) => g.type === type && !g.questId).length;
    const n = initial ? want : Math.min(3, want - have);
    for (let k = 0; k < n; k++) spawnGroup(type, { initial });
  }
}

// ---------------------------------------------------------------- Dorfbewohner
// Bewohner der Orte und Höfe: siehe life.js
export function spawnPeasants() { spawnVillagers(); }

// ---------------------------------------------------------------- Seefahrt
// Fähren verbinden England mit Frankreich und Flandern. Die Überfahrt kostet Gold je Kopf und Zeit.
export function ferryRoutes(siteId) {
  return FERRIES.filter((f) => f.a === siteId || f.b === siteId).map((f) => ({ ...f, to: f.a === siteId ? f.b : f.a }));
}

export function ferryCost(route) {
  const from = siteById(route.a), to = siteById(route.b);
  const french = (s) => s && (s.realm === 'fr' || s.realm === 'fl');
  if (isAlly('franken') && (french(from) || french(to))) return 0;
  const riders = [G.s.player, ...partyMembers()];
  const horses = riders.filter((u) => u.eq && u.eq.pferd).length;
  return Math.round((route.cost * riders.length + horses * Math.ceil(route.cost / 2)) * shireFerryFactor());
}

export function sail(fromId, toId) {
  const route = ferryRoutes(fromId).find((r) => r.to === toId);
  const to = siteById(toId);
  if (!route || !to) return false;
  if (inCombat()) { log('Mitten im Kampf legt kein Schiff ab.', 'bad'); return false; }
  const cost = ferryCost(route);
  if (G.s.gold < cost) { log(`Die Überfahrt kostet ${cost} Gold. So viel hast du nicht.`, 'bad'); return false; }
  G.s.gold -= cost;
  passHours(route.hours);
  const p = G.s.player;
  const q = to.quay || to;
  p.x = q.x; p.y = q.y;
  p.path = null; p.attackTarget = null; p.huntTarget = null; p.chase = null;
  G.pendingSite = null;
  partyMembers().forEach((c) => { placeNear(c, q.x, q.y, 1.6); c.path = null; c.chase = null; });
  G.s.safeTime = Math.max(G.s.safeTime || 0, 10);
  G.cam.x = isoX(p.x, p.y);
  G.cam.y = isoY(p.x, p.y) - groundZ(G.world, p.x, p.y) - 12;
  log(`Nach ${route.hours} Stunden auf See legt ${route.ship === 'Kogge' ? 'die' : 'das'} ${route.ship} in ${to.name} an.${cost ? ` Fährlohn: ${cost} Gold.` : ' Die Franzosen verlangen von dir keinen Fährlohn.'}`, 'good');
  return true;
}

// ---------------------------------------------------------------- Fehden zwischen Trupps
// Rivalisierende Fraktionen gehen aufeinander los, Banden überfallen Händler und Vögte, Streifen jagen Banden.
const OUTLAWS = { banditen: 1, raubritter: 1 };
const PREY = { haendler: 1, steuer: 1, patrouille: 1, franzosen: 1, sachsen: 1 };

function groupsFeud(a, b) {
  if (a === b || a.questId || b.questId || a.defender || b.defender || a.siege || b.siege) return false;
  if (OUTLAWS[a.type] || OUTLAWS[b.type]) {
    if (OUTLAWS[a.type] && OUTLAWS[b.type]) return false;
    return !!PREY[(OUTLAWS[a.type] ? b : a).type];
  }
  const fa = a.faction, fb = b.faction;
  if (!fa || !fb || fa === fb) return false;
  return FACTIONS[fa].rivals.includes(fb) || FACTIONS[fb].rivals.includes(fa);
}

function strength(g) {
  return g.members.reduce((a, m) => a + m.st.atk * 2 + m.st.def + m.hp / 8, 0) * rand(0.75, 1.25);
}

export function nearPlayer(g, d) { const p = G.s.player; return Math.hypot(g.x - p.x, g.y - p.y) < d; }

function checkFeuds() {
  const gs = G.groups;
  const p = G.s.player;
  for (let i = 0; i < gs.length; i++) {
    const a = gs[i];
    if (!a.members.length || a.feud || a.engaged || (a.peace || 0) > G.time) continue;
    for (let j = i + 1; j < gs.length; j++) {
      const b = gs[j];
      if (!b.members.length || b.feud || b.engaged || (b.peace || 0) > G.time) continue;
      // Verfeindete sehen sich von weitem: Heere stellen sich schon auf Bogenschussweite mal drei auf
      const both = a.army && b.army, range = both ? DEPLOY_DIST : a.army || b.army ? 12 : 9;
      if (Math.abs(a.x - b.x) > range || Math.abs(a.y - b.y) > range || Math.hypot(a.x - b.x, a.y - b.y) > range) continue;
      if (!groupsFeud(a, b)) continue;
      // Zwei verfeindete Heere: Feldschlacht, wo immer sie sich treffen (fern von dir wird sie ausgewürfelt)
      if (both) {
        if (!nearPlayer(a, 70) && !nearPlayer(b, 70)) { resolveFeud(a, b); break; }
        a.foe = b; b.foe = a;
        startTactics(a, b);
        if (!G.battle) G.battle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, a, b };
        break;
      }
      // Der Angreifer: Banden greifen an, sonst der stärkere Trupp
      const att = OUTLAWS[a.type] ? a : OUTLAWS[b.type] ? b : a.members.length >= b.members.length ? a : b;
      const def = att === a ? b : a;
      // Fern vom Spieler wird der Kampf ausgewürfelt: Verfeindete lassen einander nie einfach ziehen
      if (!nearPlayer(a, 50) && !nearPlayer(b, 50)) { resolveFeud(att, def); break; }
      a.feud = b; b.feud = a;
      a.path = null; b.path = null;
      if (nearPlayer(att, 32)) {
        const ta = GROUP_TYPES[att.type], td = GROUP_TYPES[def.type];
        log(`${ta.nom} ${ta.pl ? 'greifen' : 'greift'} ${td.acc} an!`);
      }
      break;
    }
  }
  // Helfer: Freunde in der Nähe greifen deine Angreifer an, Feinde schließen sich ihnen an
  if (!inCombat() || p.dead) return;
  for (const h of gs) {
    if (!h.members.length || h.engaged || h.feud || h.questId || h.army || h.defender) continue;
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    if (d > 28) continue;
    const ht = GROUP_TYPES[h.type];
    if (groupHostile(h)) {
      if (d < 14 && !(G.s.safeTime > 0)) { h.engaged = true; log(`${ht.nom} ${ht.pl ? 'schließen' : 'schließt'} sich dem Angriff an!`, 'bad'); }
      continue;
    }
    const rep = h.faction ? G.s.rep[h.faction] : -99;
    if (rep < 25 || d > (rep >= 50 ? 28 : 16)) continue;
    const foe = G.groups.find((e) => e.engaged && e.members.length && e.faction !== h.faction && Math.hypot(e.x - h.x, e.y - h.y) < 30);
    if (!foe) continue;
    h.feud = foe; h.path = null;
    // Mehrere Helfer derselben Art: nur eine Meldung
    const key = `hilfe-${h.type}`;
    if (!G.helpLog || G.helpLog[key] === undefined || G.time - G.helpLog[key] > 20) {
      (G.helpLog = G.helpLog || {})[key] = G.time;
      log(`${ht.nom} ${ht.pl ? 'kommen' : 'kommt'} dir zu Hilfe!`, 'good');
    }
  }
}

export function endFeud(g) {
  const f = g.feud;
  // Kurze Atempause nach einem Kampf, dann geht jeder wieder auf den nächsten Feind los
  g.feud = null; g.path = null; g.wait = g.defender ? 99999 : rand(2, 5); g.peace = G.time + 20;
  if (f && f.feud === g) { f.feud = null; f.path = null; f.wait = f.defender ? 99999 : rand(2, 5); f.peace = G.time + 20; }
}

// Fern vom Spieler wird eine Fehde einfach ausgewürfelt
function resolveFeud(a, b) {
  const win = strength(a) >= strength(b) ? a : b, lose = win === a ? b : a;
  endFeud(a);
  removeGroup(lose);
  const n = Math.floor(win.members.length * rand(0.1, 0.45));
  for (let k = 0; k < n && win.members.length > 1; k++) { const m = win.members.pop(); m.dead = true; }
  win.peace = G.time + 60;
  rebuildUnits();
}

// Ein Trupp wurde ohne dein Zutun aufgerieben
function feudLost(g) {
  const f = G.groups.find((o) => o.feud === g);
  if (f && nearPlayer(g, 32)) {
    const tw = GROUP_TYPES[f.type], tl = GROUP_TYPES[g.type];
    log(`${tw.nom} ${tw.pl ? 'haben' : 'hat'} ${tl.acc} besiegt.`);
  }
  if (f) endFeud(f);
  removeGroup(g);
}

export function removeGroup(g) {
  for (const m of g.members) m.dead = true;
  g.members = [];
  for (const o of G.groups) if (o.feud === g) { o.feud = null; o.peace = G.time + 45; }
  const i = G.groups.indexOf(g);
  if (i >= 0) G.groups.splice(i, 1);
}

// ---------------------------------------------------------------- Wachtürme der eigenen Burg
// Die Bogenschützen auf den Türmen schießen auf alles, was dir feindlich ist und in Reichweite kommt.
function updateTowers(dt) {
  const towers = workingPlots('wehr');
  if (!towers.length) return;
  if (!G.towerCd) G.towerCd = {};
  for (const w of towers) {
    const L = w.lv, k = w.i;
    G.towerCd[k] = (G.towerCd[k] || 0) - dt;
    if (G.towerCd[k] > 0) continue;
    const tx = w.plot.x, ty = w.plot.y;
    let best = null, bd = 7 + L;
    for (const g of G.groups) {
      if (!(g.engaged || groupHostile(g))) continue;
      for (const m of g.members) {
        if (m.dead) continue;
        const d = Math.hypot(m.x - tx, m.y - ty);
        if (d < bd) { bd = d; best = m; }
      }
    }
    if (!best) { G.towerCd[k] = 0.5; continue; }
    const g = best.group;
    if (!g.engaged && !(G.s.safeTime > 0)) { g.engaged = true; log(`Die Wachen auf den Türmen von ${homeName()} schießen auf ${GROUP_TYPES[g.type].acc}!`, 'bad'); }
    const archer = { kind: 'tower', team: 'player', x: tx, y: ty, st: { atk: 3 + L * 3, def: 0 }, mounted: false };
    G.projectiles.push({ x: tx, y: ty, tx: best.x, ty: best.y, target: best, att: archer, t: 0, dur: Math.max(0.25, bd / 14), bolt: L >= 3, z0: 46 });
    G.towerCd[k] = 2.8 - L * 0.45;
  }
}

// ---------------------------------------------------------------- Schlachten
// Ab und zu ziehen zwei Heere heran und schlagen sich, je 50 Mann (bei knapper Leistung weniger).
// Du kannst zuschauen oder eingreifen. Nur ein Heer, dessen Fraktion dir feindlich ist, greift auch dich an.
// Höchstzahl beider Heere zusammen, nach Bildrate
function battleCap() {
  const f = G.fpsAvg || 60;
  return f >= 40 ? 140 : f >= 30 ? 100 : 70;
}
// Heerstärke: je Seite 30 bis 100 Mann, unabhängig voneinander (Kriegsglück); zusammen nicht mehr als battleCap
function battleSizes() {
  let na = randInt(30, 100), nb = randInt(30, 100);
  const k = Math.min(1, battleCap() / (na + nb));
  return [Math.max(15, Math.round(na * k)), Math.max(15, Math.round(nb * k))];
}

export function maybeBattle() {
  if (G.s.day < 4 || G.battle || inCombat()) return;
  if (Math.random() < 0.35) startBattle();
}

export function startBattle(force = null) {
  const W = G.world, p = G.s.player;
  if (G.battle) return false;
  const land = landAt(W, p.x, p.y);
  const site = W.sites.reduce((a, s) => (s.land === land && (!a || Math.hypot(s.x - p.x, s.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y)) ? s : a), null);
  const french = site && (site.realm === 'fr' || site.realm === 'fl' || site.realm === 'nd');
  const [ta, tb] = french ? ['heer_normandie', 'heer_philipp'] : ['heer_john', 'heer_richard'];
  // Schlachtfeld: offenes Land 16 bis 26 Felder vom Spieler, nicht in einem Ort
  for (let k = 0; k < 160; k++) {
    const a = Math.random() * Math.PI * 2, r = rand(16, 26);
    const bx = p.x + Math.cos(a) * r, by = p.y + Math.sin(a) * r;
    const t = tileAt(W, bx, by);
    if ((t !== T.GRASS && t !== T.FIELD) || landAt(W, bx, by) !== land) continue;
    if (W.sites.some((s) => Math.hypot(s.x - bx, s.y - by) < s.clear + 6)) continue;
    // Die Heere kommen von gegenüberliegenden Seiten
    const d = Math.random() * Math.PI * 2;
    const spawnAt = (ang) => {
      for (let j = 0; j < 30; j++) {
        const rr = 26 + j * 0.6, x = bx + Math.cos(ang) * rr, y = by + Math.sin(ang) * rr;
        if (isWalkable(W, x, y) && landAt(W, x, y) === land) return { x, y };
      }
      return null;
    };
    const pa = spawnAt(d), pb = spawnAt(d + Math.PI);
    if (!pa || !pb) continue;
    const patha = findPath(W, pa.x, pa.y, bx, by, 60000), pathb = findPath(W, pb.x, pb.y, bx, by, 60000);
    if (!patha || !pathb) continue;
    // Kein Fluss und kein Sumpf dazwischen, der lange Umwege erzwingt: Die Heere sollen sich auch finden
    const plen = (path, x, y) => { let l = 0, px = x, py = y; for (const q of path) { l += Math.hypot(q.x - px, q.y - py); px = q.x; py = q.y; } return l; };
    if (plen(patha, pa.x, pa.y) > Math.hypot(bx - pa.x, by - pa.y) * 1.35 || plen(pathb, pb.x, pb.y) > Math.hypot(bx - pb.x, by - pb.y) * 1.35) continue;
    // Beide Heere sind 50 Mann stark angelegt; die Stärke im Feld wird ausgewürfelt (force: feste Größen zum Testen)
    const [na, nb] = force || battleSizes();
    // Kriegsglück: gut geführt, ausgeruht und satt (+1) oder müde, schlecht verpflegt (−1)
    const luck = () => (force ? 0 : pick([-1, 0, 0, 1]));
    const A = spawnGroup(ta, { pos: pa, scale: na / 50, luck: luck() }), B = spawnGroup(tb, { pos: pb, scale: nb / 50, luck: luck() });
    if (!A || !B) return false;
    for (const [g, path] of [[A, patha], [B, pathb]]) { g.path = path; g.pathI = 0; g.wait = 0; g.foe = g === A ? B : A; g.peace = 0; }
    G.battle = { x: bx, y: by, a: A, b: B, t0: G.time };
    rebuildUnits();
    const dx = bx - p.x, dy = by - p.y, ang = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const dir = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'][Math.round(((ang + 360) % 360) / 45) % 8];
    log(`Zwei Heere ziehen heran! ${GROUP_TYPES[ta].nom} mit ${A.members.length} Mann und ${GROUP_TYPES[tb].acc} mit ${B.members.length} Mann treffen im ${dir} von dir aufeinander. Halte dich heraus oder greif ein.`, 'bad');
    return true;
  }
  return false;
}

function updateArmy(g, p) {
  if (g.siege) return;
  const f = g.foe;
  if (f && f.members.length && G.groups.includes(f)) {
    // Kommen sich die Heere nahe, stellen sie sich zur Schlacht auf (tactics.js)
    if (!g.feud && !g.tac && Math.hypot(f.x - g.x, f.y - g.y) < DEPLOY_DIST) startTactics(g, f);
    // Finden sie lange nicht zueinander, ziehen beide ab
    else if (!g.tac && !f.tac && G.battle && G.battle.a === g && G.time - (G.battle.t0 || G.time) > 200) {
      if (nearPlayer(g, 60) || nearPlayer(f, 60)) log('Die Heere finden nicht zueinander und ziehen wieder ab.');
      g.foe = null; f.foe = null; g.path = null; f.path = null; G.battle = null;
    }
  } else if (G.battle && (G.battle.a === g || G.battle.b === g)) {
    // Der Gegner ist geschlagen oder fort: Sieg melden, dann heimziehen
    if (nearPlayer(g, 60)) log(`${GROUP_TYPES[g.type].nom} ${GROUP_TYPES[g.type].pl ? 'haben' : 'hat'} die Schlacht gewonnen.`, 'gold');
    G.battle = null;
    g.foe = null;
  }
  if (G.battle && !G.groups.includes(G.battle.a) && !G.groups.includes(G.battle.b)) G.battle = null;
}

// Stärke beider Heere für die Anzeige
export function battleStatus() {
  const b = G.battle;
  if (!b) return null;
  return { a: GROUP_TYPES[b.a.type].name, na: b.a.members.length, b: GROUP_TYPES[b.b.type].name, nb: b.b.members.length, x: b.x, y: b.y };
}
