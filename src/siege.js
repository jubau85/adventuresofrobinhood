// Belagerungen: Ein Heer zieht vor eine Burg oder Stadt der Gegenseite, schlägt ein Lager auf,
// beschießt die Häuser mit dem Trebuchet und stürmt dann das Tor. Getroffene Häuser brennen und
// werden beschädigt. Danach bauen die Bewohner wieder auf, und die Toten werden begraben.

import { G, log, homeName } from './state.js';
import { GROUP_TYPES, FACTIONS, GOODS, dirText } from './data.js';
import { rand, pick, randInt } from './rng.js';
import { changeRep, addRenown, isHostileFaction } from './politics.js';
import { cargoFree, addCargo } from './economy.js';
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
    const cand = W.sites.filter((s) => ['burg', 'stadt', 'halle', 'markt'].includes(s.type) && s.land === land && !(G.s.abandoned && (G.s.abandoned[s.id] || 0) > G.s.day) && ATTACKER[s.faction] && ATTACKER[s.faction][s.realm]
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
  const where = dirText(p, target);
  log(own ? `${GROUP_TYPES[armyType].nom} zieht gegen ${homeName()}! Eine Belagerung steht bevor.` : `Ein Bote meldet: ${GROUP_TYPES[armyType].nom} zieht vor ${target.name} (${where}) und will die ${target.type === 'burg' ? 'Burg' : 'Stadt'} belagern! Auf der Karte ist der Ort markiert. Im Feldlager oder in ${target.name} kannst du dich einer Seite anschließen.`, 'bad');
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
  if (sg.side === 'att') g.engaged = true;
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
  keepSides(sg);
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
    // Der Sturm wartet, bis du nah genug bist (höchstens bis 160 s), damit du noch rechtzeitig kommst
    const dS = Math.hypot(s.x - p.x, s.y - p.y);
    if (sg.storm || (sg.t > 70 && (dS < 35 || sg.t > 160))) {
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
  sideOutcome(sg, how, quiet);
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
  return {
    name: sg.site.type === 'spieler' ? homeName() : sg.site.name, stage: sg.stage, att: sg.army.members.length, def: sg.def ? sg.def.members.length : 0,
    x: sg.site.x, y: sg.site.y, army: GROUP_TYPES[sg.army.type].name, side: sg.side || null, camp: sg.camp, own: sg.site.type === 'spieler',
  };
}

// ---------------------------------------------------------------- Seitenwahl
// Im Feldlager oder in der belagerten Stadt kannst du dich einer Seite anschließen.
// Verteidiger: Die Besatzung wagt einen Ausfall, wenn du am Lager angreifst. Hält die Stadt, dankt sie dir.
// Belagerer: Du bläst mit zum Sturm, die Besatzung greift dich an. Fällt die Stadt, bekommst du einen Beuteanteil.
export function siegeAt(site) { return G.siege && G.siege.site === site ? G.siege : null; }
export function nearSiegeCamp(r = 5) {
  const sg = G.siege, p = G.s.player;
  return !!sg && sg.stage !== 'anmarsch' && sg.site.type !== 'spieler' && Math.hypot(sg.camp.x - p.x, sg.camp.y - p.y) < r;
}
export function isSiegeGroup(g) { const sg = G.siege; return !!sg && !!g && (g === sg.army || g === sg.def); }

export function sideBlock(side) {
  const sg = G.siege;
  if (!sg) return 'Hier wird nicht mehr belagert.';
  const s = sg.site;
  if (s.type === 'spieler') return 'Deine eigene Burg verteidigst du ohnehin.';
  const fa = sg.army.faction, fs = s.faction;
  if (sg.side === side) return 'Auf dieser Seite stehst du schon.';
  if (sg.side) return `Du hast dich schon ${sg.side === 'def' ? 'den Verteidigern' : 'den Belagerern'} angeschlossen.`;
  if (side === 'att') {
    if (sg.army.provoked || sg.army.engaged) return 'Du hast das Heer schon angegriffen. Im Lager will dich niemand sehen.';
    if (isHostileFaction(fa)) return `Der Hauptmann lässt dich nicht ins Lager. Die ${FACTIONS[fa].name} sind dir feindlich gesinnt.`;
  } else {
    if (sg.def && (sg.def.provoked || sg.def.engaged)) return 'Du hast die Besatzung schon angegriffen.';
    if (isHostileFaction(fs)) return `Die Besatzung traut dir nicht. Die ${FACTIONS[fs].name} sind dir feindlich gesinnt.`;
  }
  return null;
}

// Was dir die Seiten in Aussicht stellen (für die Tafel)
export function sideOffer() {
  const sg = G.siege;
  if (!sg) return null;
  const s = sg.site;
  const thanks = s.type === 'stadt' ? 240 : s.type === 'burg' ? 200 : 130;
  const share = Math.round(125 * (s.type === 'stadt' ? 1.4 : 1) / 10) * 10;
  return { thanks, share, fa: sg.army.faction, fs: s.faction };
}

export function joinSiege(side) {
  const why = sideBlock(side);
  if (why) { log(why, 'bad'); return false; }
  const sg = G.siege, s = sg.site, army = sg.army;
  sg.side = side;
  if (side === 'def') {
    army.provoked = true;
    changeRep(army.faction, -5);
    log(`Du stellst dich auf die Seite von ${s.name}. Greif das Feldlager an, dann wagt die Besatzung einen Ausfall und kämpft mit dir.`, 'good');
  } else {
    changeRep(s.faction, -8);
    changeRep(army.faction, 3);
    if (sg.def) sg.def.provoked = true;
    log(`Du reihst dich bei den Belagerern vor ${s.name} ein. Der Hauptmann nickt dir zu: „Wenn du bereit bist, blasen wir zum Sturm.“`, 'good');
  }
  return true;
}

export function canCallStorm() { const sg = G.siege; return !!sg && sg.side === 'att' && sg.stage === 'belagerung' && !sg.storm; }
export function callStorm() {
  if (!canCallStorm()) return false;
  G.siege.storm = true;
  log(`Die Hörner blasen zum Sturm auf ${G.siege.site.name}!`, 'bad');
  return true;
}

// Wer sich einer Seite angeschlossen hat, wird von der anderen angegriffen, sobald er in der Nähe ist
function keepSides(sg) {
  if (!sg.side) return;
  const p = G.s.player, army = sg.army, def = sg.def;
  const alive = (g) => g && g.members.length && G.groups.includes(g);
  const near = (g, r) => g.members.some((m) => Math.hypot(m.x - p.x, m.y - p.y) < r);
  if (p.dead) return;
  if (sg.side === 'def') {
    if (!army.engaged && near(army, 30)) army.engaged = true;
    if (!sg.sortie && alive(def) && sg.stage === 'belagerung' && (army.engaged || Math.hypot(sg.camp.x - p.x, sg.camp.y - p.y) < 14)) {
      sg.sortie = true;
      army.feud = def; def.feud = army;
      log(`Das Tor von ${sg.site.name} öffnet sich: Die Besatzung wagt einen Ausfall und kämpft an deiner Seite!`, 'good');
    }
  } else if (alive(def) && !def.engaged && near(def, 26)) def.engaged = true;
}

// Dank, Beute und Folgen für deine Seite
function sideOutcome(sg, how, quiet) {
  const side = sg.side, s = sg.site;
  if (!side || s.type === 'spieler') return;
  const fs = FACTIONS[s.faction].short, fa = FACTIONS[sg.army.faction].short;
  if (quiet) {
    log(`Nachricht aus ${s.name}: ${how === 'gefallen' ? 'Die Stadt ist gefallen.' : 'Die Belagerung ist vorbei.'} Du warst nicht mehr dabei.`);
    return;
  }
  const offer = sideOffer();
  if (side === 'def') {
    if (how !== 'abgewehrt') { log(`Trotz deiner Hilfe ${how === 'gefallen' ? `ist ${s.name} gefallen` : `ist die Belagerung von ${s.name} zu Ende gegangen`}.`, how === 'gefallen' ? 'bad' : ''); return; }
    const gold = Math.round((offer.thanks * rand(0.85, 1.15)) / 10) * 10;
    G.s.gold += gold;
    changeRep(s.faction, 10);
    addRenown(15);
    (G.s.rescued || (G.s.rescued = {}))[s.id] = G.s.day;
    log(`${s.name} ist gerettet! Man feiert dich auf dem Markt. Dank der Stadt: ${gold} Gold, Ansehen bei den ${fs} +10, Ruhm +15.`, 'gold');
    return;
  }
  if (how !== 'gefallen') { log(`Der Sturm auf ${s.name} ist gescheitert. Die ${fs} werden dir das nicht so bald vergessen.`, 'bad'); return; }
  const gold = Math.round((offer.share * rand(0.75, 1.3)) / 10) * 10;
  G.s.gold += gold;
  const loot = [`${gold} Gold`];
  const town = G.s.towns[s.id];
  if (town) {
    const goods = Object.entries(town.stock).filter(([, n]) => n > 2).sort(() => Math.random() - 0.5).slice(0, 2);
    for (const [g, n] of goods) {
      const k = Math.min(Math.ceil(n / 3), randInt(4, 8), cargoFree());
      if (k <= 0) continue;
      addCargo(g, k); town.stock[g] -= k;
      loot.push(`${k} ${GOODS[g].name}`);
    }
  }
  changeRep(sg.army.faction, 8);
  changeRep(s.faction, -6);
  addRenown(8);
  const bl = G.s.blight || (G.s.blight = {});
  bl[s.id] = Math.max(bl[s.id] || 0, G.s.day + 6);
  log(`${s.name} ist gefallen, und du warst unter den Ersten auf der Mauer. Dein Beuteanteil: ${loot.join(', ')}. Ansehen bei den ${fa} +8, bei den ${fs} −6.`, 'gold');
}
