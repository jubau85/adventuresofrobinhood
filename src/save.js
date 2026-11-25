// Speichern und Laden im Browser (localStorage). Die Welt wird aus dem Seed neu erzeugt.

import { G } from './state.js';
import { SAVE_KEY, SAVE_VERSION } from './data.js';
import { generateWorld } from './world.js';
import { makeUnit, spawnGroup, rebuildUnits, spawnPeasants } from './units.js';

function unitData(u) {
  return {
    id: u.id, kind: u.kind, name: u.name, cls: u.cls, level: u.level, xp: u.xp, eq: { ...u.eq },
    hp: Math.round(u.hp), x: u.x, y: u.y, mounted: u.mounted, status: u.status, woundedDays: u.woundedDays,
    wage: u.wage, cost: u.cost, look: u.look, npcType: u.npcType, female: u.female, tunic: u.tunic, hair: u.hair,
  };
}

export function serialize() {
  const s = G.s;
  const data = {
    v: SAVE_VERSION,
    savedAt: Date.now(),
    nextId: G.nextId,
    s: {
      ...s,
      player: unitData(s.player),
      companions: s.companions.map(unitData),
      castle: { ...s.castle, recruits: s.castle.recruits.map(unitData) },
    },
    groups: G.groups.map((g) => ({ id: g.id, type: g.type, x: g.x, y: g.y, home: g.home, provoked: g.provoked, questId: g.questId, members: g.members.map(unitData) })),
  };
  return JSON.stringify(data);
}

export function deserialize(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || data.v !== SAVE_VERSION) throw new Error('Der Spielstand passt nicht zu dieser Version.');
  const s = data.s;
  G.world = generateWorld(s.seed);
  G.nextId = 1;
  s.player = makeUnit(s.player);
  s.companions = s.companions.map((c) => makeUnit(c));
  s.castle.recruits = (s.castle.recruits || []).map((c) => makeUnit(c));
  G.s = s;
  G.groups = []; G.units = []; G.projectiles = []; G.fx = [];
  for (const gd of data.groups) {
    const g = spawnGroup(gd.type, { pos: { x: gd.x, y: gd.y }, questId: gd.questId, members: gd.members });
    if (g) { g.id = gd.id; g.home = gd.home; g.provoked = gd.provoked; }
  }
  G.nextId = Math.max(G.nextId, data.nextId);
  spawnPeasants();
  rebuildUnits();
}

export function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, serialize());
    return true;
  } catch (e) {
    return false;
  }
}

export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.v !== SAVE_VERSION) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function saveSummary(data = readSave()) {
  if (!data) return null;
  const d = new Date(data.savedAt);
  return `${data.s.player.name}, Tag ${data.s.day} (${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })})`;
}
