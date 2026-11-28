// Mehrspieler: eine gemeinsame Welt. Der Gastgeber rechnet alle Gruppen (Banden, Heere, Händler, Streifen, Züge der
// Barone, Söldner, Aufgebote, Besatzungen, die Banden aus Aufträgen) und die Belagerung. Jeder Gast bekommt viermal je
// Sekunde, was um seinen Helden herum unterwegs ist (gruppen), und zeigt es als Spiegel (g.mirror): Die Figuren laufen
// weich zwischen den Meldungen, rechnen aber nichts selbst.
// - Treffer eines Gastes auf eine gespiegelte Figur gehen an den Gastgeber (pvp.js, Kennung 'w…'); der rechnet den
//   Schaden. Erfahrung (erlegt), Beute und Ehre (sieg) bekommt, wer den letzten Schlag geführt hat; einen erledigten
//   Auftrag (auftragFertig) der, der ihn angenommen hat.
// - Gegen wen eine Gruppe kämpft, merkt sie sich (foes, units.js); Banden greifen jeden an, eine Partei die, mit denen
//   sie verfeindet ist (fe in der Meldung des Helden), ein Aufgebot oder eine Burgwache die, mit denen ihr Herr in Fehde
//   liegt, die Heere einer Belagerung die, die sich der anderen Seite angeschlossen haben.
// - Aufträge eines Gastes stellt der Gastgeber auf (auftrag), auch Belagerungen, die ein Gast anführt (belagern).
//   In einer Fehde lassen sich die eroberten Burgen eines Mitspielers einnehmen; seine Heimburg wird geplündert.
import { G, log } from './state.js';
import { CLASSES, ITEMS, GROUP_TYPES, FACTIONS } from './data.js';
import { makeUnit, makeNpc, computeStats, rebuildUnits, unitLook, spawnGroup, victorySpoils, grantXp, partyMembers, engageGroup, humanDist } from './units.js';
import { mpOn, mpAddCommand, mpOnTick, mpSendTo, mpSeatOf, mpWorldSoon, mpCommand, mpPeerOfSeat, mpBroadcast } from './mp.js';
import { siteById } from './economy.js';
import { onQuestGroupDestroyed } from './politics.js';
import { pvpState, pvpWith, humanName } from './pvp.js';
import { startSiege, applyWallState, sideOutcome } from './siege.js';
import { SHIRES, shireOwner, isHumanOwner, claimShire, ownerColor } from './shires.js';
import { holdings, applyHoldings, dropHolding, isOwnSite } from './holdings.js';
import { rand } from './rng.js';

const isHost = () => !!(G.mp && G.mp.role === 'host');
const isGuest = () => !!(G.mp && G.mp.role === 'guest');
const WORLD_VIEW = 100;       // so weit um einen Gast schickt der Gastgeber die Gruppen (Felder)

// ---------------------------------------------------------------- Gastgeber: senden
function encMember(m) {
  const fl = (m.mounted ? 1 : 0) | (m.swing > 0 ? 2 : 0) | (m.run ? 4 : 0) | (m.female ? 8 : 0);
  return [m.id, m.cls, +m.x.toFixed(2), +m.y.toFixed(2), Math.max(0, Math.round(m.hp)), Math.round(m.st.maxHp), fl,
    m.eq.waffe || null, m.eq.ruestung || null, m.eq.schild || null, m.eq.pferd || null, m.tunic || null, m.livery || null, m.look || null, m.level || 1, m.name || '', m.wagon || 0];
}
// seat: für wen; im Kampf heißt die Gruppe nur für den, gegen den sie kämpft (foes)
function encGroup(g, seat) {
  const lead = g.members[0];
  const fl = (g.engaged && (!g.foes || g.foes.has(seat)) ? 1 : 0) | (g.provoked ? 2 : 0) | (g.army ? 4 : 0) | (g.defender ? 8 : 0);
  return [g.id, g.type, fl, g.questId || 0, g.questOwner || '', g.baron || '', g.faction || '', +lead.x.toFixed(2), +lead.y.toFixed(2), g.members.map(encMember), g.leadSeat || ''];
}
function siegeOut() {
  const sg = G.siege;
  if (!sg || sg.mirror || !sg.site) return null;
  const w = sg.walls;
  return {
    site: sg.site.id, stage: sg.stage, camp: sg.camp, tents: sg.tents, tre: { x: sg.tre.x, y: sg.tre.y, age: Math.min(60, G.time - sg.tre.fired) },
    shots: sg.shots.map((sh) => [+sh.x0.toFixed(1), +sh.y0.toFixed(1), +sh.x1.toFixed(1), +sh.y1.toFixed(1), +sh.t.toFixed(2), +sh.dur.toFixed(2), sh.wall ? 1 : 0]),
    gates: w ? w.gates : null, st: w ? { bx: w.st.bx, by: w.st.by, dmg: w.st.dmg || 0, open: !!w.st.open } : null, sq: w ? !!w.square : false, gc: !!sg.gatesClosed,
    army: sg.army ? sg.army.id : 0, at: sg.army ? sg.army.type : '', af: sg.army ? sg.army.faction || null : null, def: sg.def ? sg.def.id : 0,
    lead: sg.leadSeat || (sg.lead ? G.mp.seat : null), sides: sg.sides || {}, storm: !!sg.storm,
  };
}
let worldT = 0;
mpOnTick((mp, dt) => {
  if (!G.started || !G.s) return;
  if (mp.role !== 'host') { smoothMirrors(dt); return; }
  worldT += dt;
  if (worldT < 0.25) return;
  worldT = 0;
  const sg = siegeOut();
  for (const p of mp.peers.values()) {
    const h = p.unit;
    if (!h) continue;
    const list = [];
    for (const g of G.groups) {
      if (!g.members.length || g.mirror) continue;
      const lead = g.members[0];
      if (Math.hypot(lead.x - h.x, lead.y - h.y) < WORLD_VIEW) list.push(encGroup(g, p.seat));
    }
    mpSendTo(p.id, 'gruppen', { g: list, sg });
  }
});

// ---------------------------------------------------------------- Gast: Spiegel
const numW = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
function mirrorMember(id) {
  for (const g of G.groups) if (g.mirror) for (const m of g.members) if (m.id === id) return m;
  return null;
}
G.mirrorMember = mirrorMember;
mpOn('gruppen', (mp, from, d) => {
  if (!isGuest() || from !== mp.hostId || !d || !Array.isArray(d.g) || !G.started) return;
  const old = new Map(G.groups.filter((g) => g.mirror).map((g) => [g.id, g]));
  const seen = new Set();
  let changed = false;
  for (const r of d.g.slice(0, 160)) {
    if (!Array.isArray(r) || !GROUP_TYPES[r[1]] || !Array.isArray(r[9])) continue;
    const [id, type, fl, questId, qOwner, baronId, faction, x, y, ms, leadSeat] = r;
    seen.add(id);
    let g = old.get(id);
    if (!g) {
      g = { id, type, mirror: true, members: [], fallen: [], x: numW(x), y: numW(y), home: { x: numW(x), y: numW(y) }, path: null, pathI: 0, wait: 0, aggro: 0 };
      G.groups.push(g);
      changed = true;
    }
    g.faction = FACTIONS[faction] ? faction : null; g.baron = baronId || null; g.questId = questId || null; g.questOwner = qOwner || null; g.leadSeat = leadSeat || null;
    g.engaged = !!(fl & 1) || (g.localEngage || 0) > G.time; g.provoked = !!(fl & 2); g.army = !!(fl & 4); g.defender = fl & 8 ? 1 : null;
    g.tx = numW(x, g.x); g.ty = numW(y, g.y);
    const was = new Map(g.members.map((m) => [m.id, m])), keep = [];
    for (const q of ms.slice(0, 80)) {
      if (!Array.isArray(q) || !CLASSES[q[1]]) continue;
      const [mid, cls, mx, my, hp, mhp, mfl, w, ru, sc, pf, tunic, livery, look, lv, name, wagon] = q;
      const eq = { waffe: ITEMS[w] ? w : null, ruestung: ITEMS[ru] ? ru : null, schild: ITEMS[sc] ? sc : null, pferd: ITEMS[pf] ? pf : null };
      let m = was.get(mid);
      if (!m) {
        m = makeUnit({ kind: 'npc', cls, level: Math.max(1, numW(lv, 1)), eq, x: numW(mx), y: numW(my), name: String(name || '').slice(0, 24) || undefined, female: !!(mfl & 8) });
        m.id = mid; m.team = 'group'; m.group = g; m.mirror = true;
        changed = true;
      }
      const eqKey = JSON.stringify(eq);
      if (m._eqKey !== eqKey) { m._eqKey = eqKey; m.eq = eq; computeStats(m); }
      m.tx = numW(mx, m.x); m.ty = numW(my, m.y);
      m.st.maxHp = Math.max(1, numW(mhp, 1)); m.hp = Math.max(0, Math.min(m.st.maxHp, numW(hp, 1)));
      m.mounted = !!(mfl & 1); m.run = !!(mfl & 4); m.female = !!(mfl & 8);
      if ((mfl & 2) && !(m.swing > 0)) m.swing = 0.3;
      m.tunic = typeof tunic === 'string' ? tunic : null; m.livery = typeof livery === 'string' ? livery : null; m.look = typeof look === 'string' ? look : null;
      m.wagon = typeof wagon === 'string' ? wagon : null;
      keep.push(m);
    }
    if (keep.length !== g.members.length) changed = true;
    g.members = keep;
  }
  for (const g of [...G.groups]) if (g.mirror && (!seen.has(g.id) || !g.members.length)) { G.groups.splice(G.groups.indexOf(g), 1); changed = true; }
  if (changed) rebuildUnits();
  applySiegeMirror(d.sg || null);
});
function smoothMirrors(dt) {
  const k = Math.min(1, dt * 8);
  for (const g of G.groups) {
    if (!g.mirror) continue;
    g.x += (g.tx - g.x) * k; g.y += (g.ty - g.y) * k;
    for (const m of g.members) {
      const dx = m.tx - m.x, dy = m.ty - m.y, dd = Math.hypot(dx, dy);
      if (dd > 6) { m.x = m.tx; m.y = m.ty; }
      else if (dd > 0.01) {
        m.x += dx * k; m.y += dy * k;
        m.dirX = dx / dd; m.dirY = dy / dd;
        const sx = dx - dy;
        if (Math.abs(sx) > 0.02) m.facing = sx >= 0 ? 1 : -1;
      }
      m.moving = dd > 0.03;
    }
  }
  const sg = G.siege;
  if (sg && sg.mirror) for (const sh of sg.shots) sh.t += dt;
}

// Die Belagerung, die der Gastgeber rechnet: Lager, Trebuchet, Steine, Tore, Bresche und die Heere als Spiegel
function gateBlock(gates, on) {
  const W = G.world;
  if (!gates || !W) return;
  for (const [x, y] of gates) W.block[y * W.N + x] = on ? 1 : 0;
}
function applySiegeMirror(d) {
  let sg = G.siege;
  if (!d) {
    if (sg && sg.mirror) { if (sg.gatesClosed && sg.walls) gateBlock(sg.walls.gates, false); G.siege = null; }
    return;
  }
  const site = siteById(d.site);
  if (!site) return;
  if (!sg || !sg.mirror || sg.site !== site) {
    if (sg && sg.mirror && sg.gatesClosed && sg.walls) gateBlock(sg.walls.gates, false);
    if (sg && !sg.mirror) return;   // eine eigene Belagerung des Gastes (sollte es im Mehrspieler nicht geben)
    sg = G.siege = { mirror: true, site, t: 0, shots: [], tents: [], tre: { x: 0, y: 0, fired: -10 }, side: null };
  }
  const me = G.mp.seat;
  sg.stage = d.stage; sg.camp = d.camp; sg.tents = Array.isArray(d.tents) ? d.tents : [];
  sg.tre = { x: numW(d.tre && d.tre.x), y: numW(d.tre && d.tre.y), fired: G.time - numW(d.tre && d.tre.age, 60) };
  sg.shots = (Array.isArray(d.shots) ? d.shots : []).map(([x0, y0, x1, y1, t, dur, wall]) => ({ x0, y0, x1, y1, t, dur, wall: !!wall, hit: true }));
  sg.army = G.groups.find((g) => g.id === d.army) || { id: d.army, mirror: true, type: GROUP_TYPES[d.at] ? d.at : 'heer_john', faction: d.af, members: [], engaged: false };
  sg.def = G.groups.find((g) => g.id === d.def) || null;
  sg.lead = d.lead === me; sg.leadSeat = d.lead || null;
  sg.side = (d.sides && d.sides[me]) || sg.side || (sg.lead ? 'att' : null);
  sg.storm = !!d.storm;
  if (d.gates) {
    const R = site.type === 'spieler' ? 4 : site.ringR || 4, rr = site.cityWall ? Math.max(4, (site.clear || 8) - 1.5) : R - 0.6;
    sg.walls = { gates: d.gates, st: d.st || { bx: site.x, by: site.y, dmg: 0, open: false }, square: !!d.sq, inside: d.sq ? (x, y) => Math.abs(x - site.x) < rr && Math.abs(y - site.y) < rr : (x, y) => Math.hypot(x - site.x, y - site.y) < rr };
    if (!!d.gc !== !!sg.gatesClosed) { sg.gatesClosed = !!d.gc; gateBlock(d.gates, sg.gatesClosed); }
    if (d.st && d.st.open && !sg.breach) { sg.breach = true; applyWallState(); }
  } else sg.walls = null;
}

// ---------------------------------------------------------------- Feindschaft und Treffer beim Gastgeber
// Wem eine Gruppe des Gastgebers feind ist (r: Held oder Gefolge eines Gastes, mit Platz, Feinden und Waldfreundschaft)
function worldFoe(g, r) {
  if (g.foes && g.foes.has(r.seat)) return true;
  const sg = G.siege;
  if (sg && !sg.mirror && sg.sides && sg.sides[r.seat]) {
    if (g === sg.army) return sg.sides[r.seat] === 'def';
    if (g === sg.def) return sg.sides[r.seat] === 'att';
  }
  if (g.leadSeat) return g.leadSeat !== r.seat && pvpState(g.leadSeat, r.seat) === 'fehde';
  const gt = GROUP_TYPES[g.type];
  if (gt.own || g.homeGuard) return pvpWith(r.seat) === 'fehde';
  if (g.ownerSeat) return pvpState(g.ownerSeat, r.seat) === 'fehde';
  if (gt.hostile) return !(g.type === 'banditen' && r.waldAlly);
  return !!(g.faction && Array.isArray(r.feinde) && r.feinde.includes(g.faction));
}
G.worldFoe = worldFoe;
// Eine ruhende Gruppe sieht einen Menschen eines Gastes, dem sie feind ist, und greift an
G.worldAggro = (g, lead) => {
  if (!isHost()) return null;
  for (const r of G.remoteUnits || []) {
    if (r.dead || (r.rk !== 'held' && r.rk !== 'gefaehrte') || !r.seat) continue;
    if (Math.hypot(r.x - lead.x, r.y - lead.y) < (g.aggro || 6) && worldFoe(g, r)) return r.seat;
  }
  return null;
};
// Erfahrung für den, der getroffen hat
G.onRemoteKill = (killer, t) => { if (isHost() && killer.peer) mpSendTo(killer.peer, 'erlegt', { lv: t.level || 1, aid: killer.aid || 'h' }); };
// Beute und Ehre für den, der den letzten Schlag geführt hat
G.onRemoteVictory = (g, items) => {
  const k = g.lastKiller;
  if (isHost() && k && k.peer) mpSendTo(k.peer, 'sieg', { type: g.type, items: items.slice(0, 24), baron: g.baron || null, quest: !!g.questId });
};
// Ein Auftrag eines Gastes ist erledigt
G.onQuestDone = (g) => {
  if (!isHost() || !g.questOwner || g.questOwner === G.mp.seat) return;
  const pid = mpPeerOfSeat(g.questOwner);
  if (pid) mpSendTo(pid, 'auftragFertig', { questId: g.questId });
};
// Ein Gast greift eine Gruppe an oder fordert sie heraus
mpOn('kampf', (mp, from, d) => {
  if (!isHost() || !d) return;
  const g = G.groups.find((x) => x.id === d.gid && !x.mirror);
  if (!g) return;
  if (d.prov) g.provoked = true;
  engageGroup(g, mpSeatOf(from) || '?');
});

// ---------------------------------------------------------------- Gast: Meldungen an den Gastgeber und zurück
G.onMirrorEngage = (g) => { if (isGuest()) mpSendTo(G.mp.hostId, 'kampf', { gid: g.id }); };
G.onMirrorProvoke = (g) => { if (isGuest()) mpSendTo(G.mp.hostId, 'kampf', { gid: g.id, prov: 1 }); };
mpOn('erlegt', (mp, from, d) => {
  if (from !== mp.hostId || !d) return;
  const xp = 6 + Math.max(1, Math.min(30, d.lv | 0)) * 6;
  const party = partyMembers(), p = G.s.player;
  const killer = d.aid === 'h' ? p : party.find((c) => `c${c.id}` === d.aid) || p;
  grantXp(killer, xp);
  for (const c of party) if (c !== killer) grantXp(c, Math.round(xp / 3));
  if (killer !== p) grantXp(p, Math.round(xp / 3));
});
mpOn('sieg', (mp, from, d) => {
  if (from !== mp.hostId || !d || !GROUP_TYPES[d.type]) return;
  victorySpoils(d.type, (Array.isArray(d.items) ? d.items : []).filter((id) => ITEMS[id]), d.baron || null, !!d.quest);
});
mpOn('auftragFertig', (mp, from, d) => { if (from === mp.hostId && d) onQuestGroupDestroyed({ questId: d.questId }); });

// Aufträge: Der Gastgeber nimmt sie vom Brett und stellt ihre Bande auf (spec: [Gruppenart, Umkreis, Mindestabstand])
G.mpQuestGroup = (q, siteId, spec) => {
  if (!isGuest()) return false;
  mpCommand('auftrag', { site: siteId, id: q.id, spec: spec || null }, (r) => { if (r && r.ok && r.gid) { q.groupId = r.gid; q.tx = r.x; q.ty = r.y; } else if (r && !r.ok && r.msg) log(r.msg, 'bad'); });
  return true;
};
G.onQuestDropped = (q) => { if (isGuest() && q.groupId) mpCommand('auftragWeg', { questId: q.id }); };
mpAddCommand('auftrag', (mp, from, a) => {
  const town = G.s.towns && a && G.s.towns[a.site], site = a && siteById(a.site);
  if (!town || !site) return { ok: false };
  town.quests = town.quests.filter((q) => q.id !== a.id);
  mpWorldSoon(true);
  const spec = Array.isArray(a.spec) && GROUP_TYPES[a.spec[0]] ? a.spec : null;
  if (!spec) return { ok: true };
  const g = spawnGroup(spec[0], { near: { x: site.x, y: site.y, r: numW(spec[1], 22), rMin: numW(spec[2], 10) }, questId: a.id });
  if (!g) return { ok: true };
  g.questOwner = mpSeatOf(from);
  return { ok: true, gid: g.id, x: +g.x.toFixed(1), y: +g.y.toFixed(1) };
});
mpAddCommand('auftragWeg', (mp, from, a) => {
  const g = G.groups.find((x) => !x.mirror && x.questId === (a && a.questId));
  if (g) { g.questId = null; g.questOwner = null; }
  return { ok: true };
});

// ---------------------------------------------------------------- Belagerungen
// Seite und Sturm eines Gastes
G.onSiegeSide = (side) => { if (isGuest()) mpSendTo(G.mp.hostId, 'seite', { side }); };
G.onSiegeStorm = () => { if (isGuest()) mpSendTo(G.mp.hostId, 'sturm', {}); };
mpOn('seite', (mp, from, d) => {
  const sg = G.siege;
  if (!isHost() || !sg || sg.mirror || !d || (d.side !== 'att' && d.side !== 'def')) return;
  (sg.sides || (sg.sides = {}))[mpSeatOf(from)] = d.side;
});
mpOn('sturm', (mp, from) => {
  const sg = G.siege, seat = mpSeatOf(from);
  if (!isHost() || !sg || sg.mirror || !sg.sides || sg.sides[seat] !== 'att' || sg.storm) return;
  sg.storm = true;
  if (sg.walls && !sg.walls.st.open) sg.shotT = Math.min(sg.shotT, 1);
});
// Ende einer Belagerung: Die Gäste rechnen ihren Lohn als Verbündete selbst (sideOutcome)
G.onSiegeEnd = (sg, how) => { if (isHost()) mpBroadcast('belagerungEnde', { site: sg.site.id, how }); };
mpOn('belagerungEnde', (mp, from, d) => {
  const sg = G.siege;
  if (from !== mp.hostId || !sg || !sg.mirror || !d || sg.site.id !== d.site) return;
  const p = G.s.player, far = Math.hypot(sg.site.x - p.x, sg.site.y - p.y) > 80;
  // Die eigene Burg: Fällt sie, kommt die Nachricht vom Gastgeber (gepluendert, oder die Grafschaft wechselt)
  if (isOwnSite(sg.site)) { if (d.how !== 'gefallen') log(d.how === 'abgewehrt' ? `Die Belagerung deiner Burg ${sg.site.name} ist abgeschlagen!` : `Die Belagerer ziehen von ${sg.site.name} ab.`, 'good'); }
  else if (sg.side && !sg.lead) sideOutcome(sg, d.how, far);
  else if (!far && !sg.lead) log(d.how === 'gefallen' ? `${sg.site.name} ist gefallen.` : d.how === 'abgewehrt' ? `Die Belagerung von ${sg.site.name} ist abgeschlagen.` : `Die Belagerer ziehen von ${sg.site.name} ab.`);
  if (sg.gatesClosed && sg.walls) gateBlock(sg.walls.gates, false);
  G.siege = null;
});

// Ein Gast führt eine Belagerung an: Der Gastgeber stellt sein Aufgebot in seiner Farbe auf
G.mpOwnSiege = (s, n, cost) => {
  if (!isGuest()) return false;
  mpCommand('belagern', { site: s.id, n, color: G.s.color }, (r) => {
    if (r && r.ok) { G.s.gold -= cost; log(`Dein Aufgebot (${n} Söldner mit Trebuchet) zieht vor ${s.name} und schlägt ein Feldlager auf. Im Lager gibst du das Zeichen zum Sturm.`, 'gold'); }
    else log((r && r.msg) || `Vor ${s.name} findet sich kein Platz für ein Feldlager.`, 'bad');
  });
  return true;
};
mpAddCommand('belagern', (mp, from, a) => {
  const s = a && siteById(a.site), seat = mpSeatOf(from);
  if (!s || s.type !== 'burg' || !SHIRES[s.id] || !seat) return { ok: false };
  if (G.siege) return { ok: false, msg: 'Gerade wird schon anderswo belagert. Zwei Belagerungen zugleich gibt das Land nicht her.' };
  const o = shireOwner(s.id);
  if (o === `p:${seat}`) return { ok: false, msg: `${s.name} gehört dir schon.` };
  const victim = o === 'spieler' ? mp.seat : isHumanOwner(o) ? o.slice(2) : null;
  if (victim && pvpState(seat, victim) !== 'fehde') return { ok: false, msg: `Mit ${humanName(victim)} herrscht keine Fehde.` };
  const n = Math.max(6, Math.min(30, a.n | 0)), col = typeof a.color === 'string' ? a.color : '#888';
  const make = (pos) => {
    const out = [], bonus = Math.floor((G.s.day - 1) / 8) + 1, mix = ['soldat', 'soeldner', 'armbrust', 'soldat', 'soeldner'];
    for (let k = 0; k < n; k++) { const m = makeNpc(mix[k % mix.length], pos.x + rand(-1, 1), pos.y + rand(-1, 1), bonus); m.tunic = col; m.livery = col; out.push(m); }
    return out;
  };
  if (!startSiege(s, 'heer_spieler', null, { makeUnits: make })) return { ok: false };
  const sg = G.siege;
  sg.leadSeat = seat; sg.sides = { [seat]: 'att' };
  if (victim && victim !== mp.seat) sg.sides[victim] = 'def';
  if (victim === mp.seat) sg.side = 'def';
  if (sg.army) sg.army.leadSeat = seat;
  noteAttack(s, seat);
  return { ok: true };
});
// Gastgeber: Der Herr einer belagerten Burg erfährt es
export function noteAttack(s, bySeat) {
  const o = shireOwner(s.id);
  if (!isHumanOwner(o)) return;
  const sg = G.siege;
  if (sg && sg.site === s) (sg.sides || (sg.sides = {}))[o.slice(2)] = 'def';
  const pid = mpPeerOfSeat(o.slice(2));
  if (pid) mpSendTo(pid, 'angriff', { site: s.id, by: bySeat });
}
// Der Gastgeber selbst zieht gegen die Burg eines Gastes (holdings.js, startOwnSiege)
G.noteAttack = (s) => { if (isHost()) noteAttack(s, G.mp.seat); };
mpOn('angriff', (mp, from, d) => {
  const s = d && siteById(d.site);
  if (s) log(`${humanName(d.by)} zieht mit einem Aufgebot gegen deine Burg ${s.name}! Eile hin und verteidige sie.`, 'bad');
});

// Ausgang einer Belagerung, die ein Mensch angeführt hat (siege.js, endSiege). Gibt true zurück, wenn es erledigt ist.
// Eine eroberte Burg eines Mitspielers wechselt den Herrn; seine Heimburg wird nur geplündert.
G.pvpSiegeEnd = (sg, how) => {
  if (!isHost()) return false;
  const s = sg.site, lead = sg.leadSeat || (sg.lead ? G.mp.seat : null);
  const o = shireOwner(s.id), victim = o === 'spieler' ? G.mp.seat : isHumanOwner(o) ? o.slice(2) : null;
  if (!lead) {
    // Ein Heer der Welt vor der Heimburg eines Gastes: Fällt sie, plündert es; die Burg bleibt seine
    if (s.mpHome !== 'peer') return false;
    const vp = victim && mpPeerOfSeat(victim);
    if (vp && how === 'gefallen') mpSendTo(vp, 'gepluendert', { site: s.id, by: null, army: sg.army ? sg.army.type : null });
    return true;
  }
  const leadPid = lead === G.mp.seat ? null : mpPeerOfSeat(lead);
  // Ein Gast führt: Nachricht an ihn; gefallen ist die Burg dann seine (oder geplündert)
  if (how !== 'gefallen') {
    if (leadPid) mpSendTo(leadPid, 'feldzug', { site: s.id, how });
    return !!leadPid;
  }
  const home = !!victim && (s.mpHome || (victim === G.mp.seat && s.type === 'burg' && s.id === G.s.seat));
  if (victim && home) {
    if (victim === G.mp.seat) plundered(s, humanName(lead));
    else { const vp = mpPeerOfSeat(victim); if (vp) mpSendTo(vp, 'gepluendert', { site: s.id, by: lead }); }
    if (leadPid) mpSendTo(leadPid, 'feldzug', { site: s.id, how, pluender: 1 });
    else plunderGain(s);
    return true;
  }
  if (leadPid) {
    if (victim === G.mp.seat) dropHolding(s, `${humanName(lead)} hat ${s.name} erobert. Die Burg ist nicht mehr in deiner Hand.`);
    claimShire(s.id, `p:${lead}`, true);
    mpWorldSoon();
    mpSendTo(leadPid, 'feldzug', { site: s.id, how, erobert: 1, from: victim });
    return true;
  }
  return false;   // der Gastgeber selbst: wie bisher (conquer)
};
function plunderGain(s) {
  const gold = Math.round(rand(120, 260) / 10) * 10;
  G.s.gold += gold;
  log(`${s.name} ist gestürmt! Die Burg selbst bleibt in der Hand ihres Herrn, aber dein Aufgebot plündert: ${gold} Gold.`, 'gold');
}
mpOn('feldzug', (mp, from, d) => {
  const s = d && siteById(d.site);
  if (from !== mp.hostId || !s) return;
  if (d.how !== 'gefallen') { log(d.how === 'abgewehrt' ? `Dein Sturm auf ${s.name} ist gescheitert. Die Überlebenden deines Aufgebots zerstreuen sich.` : `Dein Aufgebot zieht von ${s.name} ab, ohne die Burg genommen zu haben.`, 'bad'); return; }
  if (d.pluender) { plunderGain(s); return; }
  if (d.erobert) {
    holdings()[s.id] = { since: G.s.day, from: s.faction, castellan: null, order: 'ausgewogen', garrison: 10, dmg: 0.5, works: 0, progress: 0, level: s.castleLevel || 2, lastAttack: G.s.day };
    claimShire(s.id, 'spieler', true);
    applyHoldings();
    const gold = Math.round(rand(180, 320) / 10) * 10;
    G.s.gold += gold;
    log(`${s.name} ist dein${d.from ? `, ${humanName(d.from)} hat die Burg verloren` : ''}! Dein Banner weht über dem Bergfried. Im Burgschatz: ${gold} Gold. Setz einen Kastellan ein (E an der Burg).`, 'gold');
  }
});
// Deine Heimburg ist gestürmt: Gold und Vorräte sind zum Teil fort, die Burg bleibt deine
function plundered(s, by) {
  const lost = Math.floor(G.s.gold * 0.2 * (G.keepPlunder ? G.keepPlunder() : 1));
  G.s.gold -= lost;
  for (const k of Object.keys(G.s.castle.storage)) G.s.castle.storage[k] = Math.floor(G.s.castle.storage[k] * 0.6);
  log(`${by} hat ${s.name} gestürmt und geplündert! Verloren: ${lost} Gold und ein Teil der Vorräte. Die Burg bleibt deine.`, 'bad');
}
mpOn('gepluendert', (mp, from, d) => {
  const s = d && siteById(d.site);
  if (from !== mp.hostId || !s) return;
  plundered(s, d.by ? humanName(d.by) : (GROUP_TYPES[d.army] && GROUP_TYPES[d.army].nom) || 'Ein feindliches Heer');
});

// Gastgeber-Wechsel: Der neue Gastgeber rechnet die Gruppen, die er bisher nur gespiegelt hat, selbst weiter
G.onBecomeHost = () => {
  for (const g of G.groups) {
    if (!g.mirror) continue;
    g.mirror = false; g.path = null; g.wait = 1; g.home = { x: g.x, y: g.y }; g.aggro = GROUP_TYPES[g.type].hostile ? 7 : GROUP_TYPES[g.type].army ? 12 : 6;
    for (const m of g.members) m.mirror = false;
  }
  if (G.siege && G.siege.mirror) { if (G.siege.gatesClosed && G.siege.walls) gateBlock(G.siege.walls.gates, false); G.siege = null; }
};

// Für die Anzeige der Herrenfarbe an der Besatzung einer Burg, die ein Mensch hält (und für Freund und Feind)
export function humanOwnerColor(s) { const o = s && SHIRES[s.id] ? shireOwner(s.id) : null; return isHumanOwner(o) ? ownerColor(o) : null; }
export function humanOwnerSeat(s) { const o = s && SHIRES[s.id] ? shireOwner(s.id) : null; return isHumanOwner(o) ? o.slice(2) : null; }

// Ein Heer zieht gegen die Heimburg eines Gastes: Der Gastgeber rechnet die Belagerung, alle sehen sie
G.mpHomeSiege = (home, t, scale) => {
  if (!isGuest()) return false;
  mpCommand('heimBelagerung', { army: t.army, scale }, (r) => { if (r && r.ok) log(`${t.by} ziehen vor ${home.name} und schlagen ein Feldlager auf. Die Belagerung beginnt! Schließ das Tor und sammle deine Leute.`, 'bad'); });
  return true;
};
mpAddCommand('heimBelagerung', (mp, from, a) => {
  const seat = mpSeatOf(from), s = seat && siteById(seat);
  if (!s || s.mpHome !== 'peer' || G.siege || G.battle || !a || !GROUP_TYPES[a.army] || !GROUP_TYPES[a.army].army) return { ok: false };
  if (!startSiege(s, a.army, Math.max(0.2, Math.min(0.8, +a.scale || 0.4)))) return { ok: false };
  G.siege.sides = { [seat]: 'def' };   // der Herr verteidigt seine Burg
  return { ok: true };
});
// Für Tests
if (typeof window !== 'undefined') window.__ritterWelt = { siegeOut, worldFoe, humanDist };
