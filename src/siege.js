// Belagerungen: Ein Heer zieht vor eine Burg oder Stadt der Gegenseite, schlägt ein Lager auf,
// beschießt die Häuser mit dem Trebuchet und stürmt dann das Tor. Getroffene Häuser brennen und
// werden beschädigt. Danach bauen die Bewohner wieder auf, und die Toten werden begraben.

import { G, log, homeName } from './state.js';
import { GROUP_TYPES } from './data.js';
import { rand, pick } from './rng.js';
import { spawnGroup, rebuildUnits, inCombat, makeNpc } from './units.js';
import { isWalkable, landAt, findPath } from './world.js';
import { villageHouses } from './castle.js';

// Welches Heer zieht gegen welche Fraktion, je nach Landesteil
const ATTACKER = {
  normannen: { en: 'heer_richard', wa: 'heer_richard', nd: 'heer_philipp', fr: 'heer_philipp', fl: 'heer_philipp' },
  sachsen: { en: 'heer_john', wa: 'heer_john' },
  franken: { fr: 'heer_normandie', fl: 'heer_normandie', nd: 'heer_normandie' },
};
export const DEFENDER_NPC = { normannen: ['soldat', 'armbrust'], sachsen: ['freisasse', 'sachs_bogen'], franken: ['sergent', 'arbaletrier'] };

// ---------------------------------------------------------------- Schäden und Reparatur
export function siteBuildings(siteId) { return G.world.buildings.filter((b) => b.site === siteId && b.kind === 'house' && !(b.cons < 1)); }

export function damageBuilding(b, amount) {
  if (!b) return;
  b.dmg = Math.min(1, (b.dmg || 0) + amount);
  b.fire = G.time + rand(30, 60);
  G.s.damage[b.idx] = b.dmg;
}

export function repairBuilding(b, amount) {
  if (!b || !b.dmg) return;
  b.dmg = Math.max(0, b.dmg - amount);
  if (b.dmg <= 0.001) { b.dmg = 0; delete G.s.damage[b.idx]; } else G.s.damage[b.idx] = b.dmg;
}

// Schlüssel „v3“ meint Haus 3 der eigenen Burgsiedlung, Zahlen meinen Gebäude der Welt
function buildingByKey(k) {
  if (typeof k === 'string' && k[0] === 'v') {
    const home = G.world.sites.find((s) => s.type === 'spieler');
    const b = home && home.villageSpots && home.villageSpots[Number(k.slice(1))];
    if (b) b.idx = k;
    return b;
  }
  return G.world.buildings[k];
}

// Gespeicherte Schäden auf die frisch erzeugte Welt übertragen
export function applyDamage() {
  if (!G.s.damage) G.s.damage = {};
  for (const [i, d] of Object.entries(G.s.damage)) { const b = buildingByKey(i); if (b) b.dmg = d; else if (i[0] !== 'v') delete G.s.damage[i]; }
}

// Jeden Tag bauen die Leute weiter, auch wenn du nicht hinsiehst
// In verödeten Orten repariert niemand, ausgebrannte Häuser stürzen ein (dynamics.js)
export function dailyRepairs() {
  for (const k of Object.keys(G.s.damage || {})) {
    const b = buildingByKey(k);
    if (!b) { delete G.s.damage[k]; continue; }
    if (typeof b.idx === 'number') {
      const s = G.world.sites.find((x) => x.id === b.site);
      if ((s && (G.s.blight[s.id] || 0) > G.s.day) || b.dmg >= 0.9) continue;
    }
    repairBuilding(b, 0.22);
  }
}

// ---------------------------------------------------------------- Tote zählen
export function nearestCemeterySite(x, y, maxD = 50) {
  let best = null, bd = maxD;
  for (const s of G.world.sites) {
    if (!s.cemetery) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

export function countDead(u) {
  const s = nearestCemeterySite(u.x, u.y);
  if (!s) return;
  const pd = G.s.pendingDead || (G.s.pendingDead = {});
  pd[s.id] = (pd[s.id] || 0) + 1;
  (G.s.deadDay || (G.s.deadDay = {}))[s.id] = G.s.day;
}

// ---------------------------------------------------------------- Belagerung beginnen
export function maybeSiege() {
  if (G.s.day < 5 || G.siege || G.battle || inCombat()) return;
  if (Math.random() < 0.3) startSiege();
}

export function startSiege(target = null, armyType = null, scale = null) {
  if (G.siege) return false;
  const W = G.world, p = G.s.player, land = landAt(W, p.x, p.y);
  if (!target) {
    const cand = W.sites.filter((s) => ['burg', 'stadt', 'halle', 'markt'].includes(s.type) && s.land === land && ATTACKER[s.faction] && ATTACKER[s.faction][s.realm]
      && Math.hypot(s.x - p.x, s.y - p.y) > 18 && Math.hypot(s.x - p.x, s.y - p.y) < 85);
    if (!cand.length) return false;
    target = pick(cand);
    armyType = ATTACKER[target.faction][target.realm];
  }
  // Lager vor der Stadt, auf der Seite der Straße zum Tor
  let camp = null;
  for (let k = 0; k < 40 && !camp; k++) {
    const a = Math.PI * 0.5 + rand(-1.1, 1.1) + (k > 20 ? Math.PI : 0), r = (target.clear || 7) + 6 + rand(0, 3);
    const x = target.x + Math.cos(a) * r, y = target.y + Math.sin(a) * r;
    if (isWalkable(W, x, y) && landAt(W, x, y) === target.land) camp = { x, y };
  }
  if (!camp) return false;
  let from = null;
  for (let k = 0; k < 40 && !from; k++) {
    const a = Math.atan2(camp.y - target.y, camp.x - target.x) + rand(-0.5, 0.5), r = 28 + k * 0.5;
    const x = camp.x + Math.cos(a) * r, y = camp.y + Math.sin(a) * r;
    if (isWalkable(W, x, y) && landAt(W, x, y) === target.land) from = { x, y };
  }
  if (!from) return false;
  const path = findPath(W, from.x, from.y, camp.x, camp.y, 80000);
  if (!path) return false;
  const sz = scale ?? ((G.fpsAvg || 60) >= 40 ? 0.8 : 0.6);
  const army = spawnGroup(armyType, { pos: from, scale: sz });
  if (!army) return false;
  army.siege = true; army.path = path; army.pathI = 0; army.wait = 0;
  const ang = Math.atan2(target.y - camp.y, target.x - camp.x);
  G.siege = {
    site: target, army, def: null, camp, stage: 'anmarsch', t: 0, shotT: 4,
    tre: { x: camp.x + Math.cos(ang) * 2.2, y: camp.y + Math.sin(ang) * 2.2, fired: -10 },
    tents: [0, 1, 2, 3].map((k) => ({ x: camp.x - Math.cos(ang) * (1.4 + (k % 2) * 1.1) + Math.cos(ang + Math.PI / 2) * (k - 1.5) * 1.2, y: camp.y - Math.sin(ang) * (1.4 + (k % 2) * 1.1) + Math.sin(ang + Math.PI / 2) * (k - 1.5) * 1.2 })),
    shots: [],
  };
  rebuildUnits();
  const own = target.type === 'spieler';
  log(own ? `${GROUP_TYPES[armyType].nom} zieht gegen ${homeName()}! Eine Belagerung steht bevor.` : `${GROUP_TYPES[armyType].nom} zieht vor ${target.name} und will die ${target.type === 'burg' ? 'Burg' : 'Stadt'} belagern!`, 'bad');
  return true;
}

// Besatzung aufstellen: Wachen hinter dem Tor
function raiseDefenders(sg) {
  const s = sg.site, own = s.type === 'spieler';
  const types = own ? ['wache'] : DEFENDER_NPC[s.faction] || ['wache'];
  const n = own ? 3 + G.s.companions.filter((c) => c.status === 'garnison').length + (G.s.castle.b.wehr || 0) * 2 : Math.round(10 + (s.type === 'burg' ? 8 : 4) * ((G.fpsAvg || 60) >= 40 ? 1 : 0.6));
  const walled = s.type === 'burg' || s.type === 'spieler' || s.palisade;
  const pos = walled ? { x: s.x + 0.4, y: s.y + 2.2 } : { x: s.x, y: s.y + 1 };
  const members = [];
  for (let k = 0; k < n; k++) {
    const m = makeNpc(k % 3 === 2 ? types[1] || types[0] : types[0], pos.x + rand(-1, 1), pos.y + rand(-1, 1), Math.floor(G.s.day / 8));
    if (own) m.lookObj = null;
    members.push(m);
  }
  const g = spawnGroup('verteidiger', { pos, membersUnits: members });
  if (!g) return null;
  g.faction = own ? null : s.faction; g.defender = s.id; g.wait = 99999; g.path = null; g.homeGuard = own;
  rebuildUnits();
  return g;
}

// ---------------------------------------------------------------- Ablauf
export function updateSiege(dt) {
  const sg = G.siege;
  if (!sg) return;
  const p = G.s.player, s = sg.site, army = sg.army;
  sg.t += dt;
  const alive = (g) => g && g.members.length && G.groups.includes(g);
  const far = Math.hypot(s.x - p.x, s.y - p.y) > 95;
  // Flugbahnen der Steine
  for (const sh of sg.shots) sh.t += dt;
  for (const sh of sg.shots) if (sh.t >= sh.dur && !sh.hit) { sh.hit = true; damageBuilding(sh.b, rand(0.25, 0.4)); G.fx.push({ kind: 'staub', x: sh.x1, y: sh.y1, t: 0, dur: 1.2 }); }
  sg.shots = sg.shots.filter((sh) => sh.t < sh.dur + 0.1);

  if (!alive(army)) return endSiege(sg, 'abgewehrt');
  if (far) return resolveAbstract(sg);
  if (sg.stage === 'anmarsch') {
    if (Math.hypot(army.x - sg.camp.x, army.y - sg.camp.y) < 3 || (!army.path && sg.t > 30)) {
      sg.stage = 'belagerung'; sg.t = 0;
      sg.def = raiseDefenders(sg);
      if (Math.hypot(s.x - p.x, s.y - p.y) < 70) log(`Die Belagerung von ${s.type === 'spieler' ? homeName() : s.name} beginnt. Das Trebuchet wird aufgestellt.`, 'bad');
    } else if (sg.t > 260) return endSiege(sg, 'abgezogen');
    return;
  }
  if (sg.stage === 'belagerung') {
    sg.shotT -= dt;
    if (sg.shotT <= 0) {
      sg.shotT = rand(5, 8);
      const houses = siteBuildings(s.id).filter((b) => (b.dmg || 0) < 0.95);
      const vh = s.type === 'spieler' ? (s.villageSpots || []).slice(0, villageHouses()) : [];
      const pool = houses.length ? houses : vh;
      if (pool.length) {
        const b = pick(pool);
        if (!b.idx && b.idx !== 0) b.idx = `v${(s.villageSpots || []).indexOf(b)}`;
        sg.tre.fired = G.time;
        sg.shots.push({ x0: sg.tre.x, y0: sg.tre.y, x1: b.x, y1: b.y, t: -0.35, dur: 1.6, b });
      }
    }
    if (sg.t > 70) {
      sg.stage = 'sturm';
      if (alive(sg.def)) { army.feud = sg.def; sg.def.feud = army; army.path = null; }
      if (s.type === 'spieler' && Math.hypot(s.x - p.x, s.y - p.y) < 60) army.engaged = true;
      if (Math.hypot(s.x - p.x, s.y - p.y) < 70) log(`Sturm auf ${s.type === 'spieler' ? homeName() : s.name}! Die Angreifer rennen gegen das Tor an.`, 'bad');
    }
    return;
  }
  if (sg.stage === 'sturm') {
    if (!alive(sg.def)) return endSiege(sg, 'gefallen');
    if (sg.t > 260) return endSiege(sg, 'abgezogen');
  }
}

// Fern vom Spieler: Ausgang auswürfeln, Häuser beschädigen, Tote zählen
function resolveAbstract(sg) {
  const houses = siteBuildings(sg.site.id);
  for (const b of houses) if (Math.random() < 0.35) damageBuilding(b, rand(0.2, 0.6));
  const pd = G.s.pendingDead || (G.s.pendingDead = {});
  if (sg.site.cemetery) pd[sg.site.id] = (pd[sg.site.id] || 0) + Math.floor(rand(4, 12));
  (G.s.deadDay || (G.s.deadDay = {}))[sg.site.id] = G.s.day;
  endSiege(sg, Math.random() < 0.5 ? 'gefallen' : 'abgewehrt', true);
}

function endSiege(sg, how, quiet = false) {
  const s = sg.site, p = G.s.player, name = s.type === 'spieler' ? homeName() : s.name;
  const near = !quiet && Math.hypot(s.x - p.x, s.y - p.y) < 80;
  if (how === 'gefallen') {
    for (const b of siteBuildings(s.id)) if (Math.random() < 0.4) damageBuilding(b, rand(0.2, 0.45));
    if (s.type === 'spieler') {
      const lost = Math.floor(G.s.gold * 0.2);
      G.s.gold -= lost;
      for (const g of Object.keys(G.s.castle.storage)) G.s.castle.storage[g] = Math.floor(G.s.castle.storage[g] * 0.6);
      log(`${name} wurde gestürmt und geplündert! Verloren: ${lost} Gold und ein Teil der Vorräte.`, 'bad');
    } else {
      const town = G.s.towns[s.id];
      if (town) for (const g of Object.keys(town.stock)) town.stock[g] = Math.floor(town.stock[g] * 0.5);
      if (near) log(`${name} ist gefallen! Die Angreifer plündern die Stadt und ziehen ab.`, 'bad');
    }
  } else if (how === 'abgewehrt') {
    if (near) log(s.type === 'spieler' ? `Die Belagerung von ${name} ist abgeschlagen!` : `Die Belagerung von ${name} ist abgeschlagen. Die Verteidiger jubeln.`, 'good');
  } else if (near) log(`Die Belagerer ziehen von ${name} ab.`);
  // Heer zieht heim, Besatzung kehrt in die Häuser zurück
  const army = sg.army;
  if (army && G.groups.includes(army)) { army.siegeDone = true; army.feud = null; army.engaged = false; army.path = null; army.wait = rand(2, 5); army.peace = G.time + 120; }
  if (sg.def && G.groups.includes(sg.def)) { const i = G.groups.indexOf(sg.def); G.groups.splice(i, 1); for (const m of sg.def.members) m.dead = true; }
  if (quiet && army && G.groups.includes(army)) { const i = G.groups.indexOf(army); G.groups.splice(i, 1); for (const m of army.members) m.dead = true; }
  G.siege = null;
  rebuildUnits();
}

// Für die Anzeige
export function siegeStatus() {
  const sg = G.siege;
  if (!sg) return null;
  return { name: sg.site.type === 'spieler' ? homeName() : sg.site.name, stage: sg.stage, att: sg.army.members.length, def: sg.def ? sg.def.members.length : 0, x: sg.site.x, y: sg.site.y, army: GROUP_TYPES[sg.army.type].name };
}
