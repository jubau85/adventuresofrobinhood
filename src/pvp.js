// Mehrspieler zwischen Menschen: Diplomatie, die Truppen der anderen in der eigenen Welt und Kämpfe über die Rechner
// hinweg.
// 1) Diplomatie: Zwischen je zwei Grafschaften (Plätzen) gilt Frieden, Fehde oder Bündnis (G.s.pvp im gemeinsamen
//    Stand, nur der Gastgeber trägt ein). Eine Fehde erklärt man allein; Frieden (nach einer Fehde) und ein Bündnis
//    bietet man an, der andere nimmt an oder lehnt ab. Ein Bündnis kündigt man allein. Gold schickt man als Geschenk.
// 2) Truppen: Jeder schickt viermal je Sekunde sein Gefolge und die Banden seiner Aufträge (trupp). Die anderen zeigen
//    sie als Figuren (G.remoteUnits) mit Schüssen, Treffern und Gefallenen.
// 3) Treffer: Wer eine fremde Figur trifft, schickt den Schlag ihrem Besitzer (treffer). Der rechnet den Schaden mit den
//    echten Werten (Rüstung, Schild, Burg), und alle sehen die Zahl. Banden aus Aufträgen greifen jeden Menschen an;
//    Helden und Gefolge zweier Spieler kämpfen nur in einer Fehde gegeneinander.
import { G, log } from './state.js';
import { SHIRES } from './shires.js';
import { CLASSES, ITEMS } from './data.js';
import { makeUnit, computeStats, applyRemoteHit, partyMembers, groupHostile, unitLook } from './units.js';
import { mpOn, mpAddCommand, mpOnTick, mpSendTo, mpBroadcast, mpPeerOfSeat, mpSeatOf, mpWorldSoon, mpCommand, seatName, mpGuest, mpHostRole } from './mp.js';
import { confirmDialog, dialogOpen } from './ui.js';

// ---------------------------------------------------------------- Diplomatie
export const PVP_NAMES = { frieden: 'Frieden', fehde: 'Fehde', buendnis: 'Bündnis' };
const pairKey = (a, b) => [a, b].sort().join('|');
export function pvpState(a, b) { const v = G.s && G.s.pvp && G.s.pvp[pairKey(a, b)]; return v && PVP_NAMES[v.st] ? v.st : 'frieden'; }
export function pvpWith(seat) { const mp = G.mp; return mp && mp.seat && seat && seat !== mp.seat ? pvpState(mp.seat, seat) : 'frieden'; }
export function pvpSince(seat) { const mp = G.mp, v = mp && G.s.pvp && G.s.pvp[pairKey(mp.seat, seat)]; return v ? v.since : null; }
export function humanName(seat) { const i = G.mpSeatInfo && G.mpSeatInfo(seat); return i ? i.name : seatName(seat); }
// Offene Angebote an dich: Platz -> 'frieden' | 'buendnis'
export function pvpOffers() { return G.pvpOffers || (G.pvpOffers = {}); }

// Die anderen Menschen der Partie (online), für die Tafel
export function pvpPlayers() {
  const mp = G.mp;
  if (!mp) return [];
  return [...mp.peers.values()].filter((p) => p.seat && p.seat !== mp.seat).map((p) => ({ id: p.id, seat: p.seat, name: p.name, color: p.color, arms: p.arms, st: pvpWith(p.seat), since: pvpSince(p.seat), offer: pvpOffers()[p.seat] || null }));
}

const pending = new Map();   // Gastgeber: offene Angebote 'von>an' -> Art
function setPvp(a, b, st, was) {
  (G.s.pvp || (G.s.pvp = {}))[pairKey(a, b)] = { st, since: G.s.day };
  mpBroadcast('diplo', { a, b, st, was, day: G.s.day });
  diploNews(a, b, st, was);
  mpWorldSoon();
}
mpAddCommand('diplo', (mp, from, a) => {
  const me = mpSeatOf(from), to = a && a.to;
  if (!me || !SHIRES[to] || to === me || !PVP_NAMES[a.st]) return { ok: false };
  const cur = pvpState(me, to);
  if (a.st === cur) return { ok: false, msg: `Zwischen euch gilt schon ${PVP_NAMES[cur]}.` };
  // Frieden nach einer Fehde und ein Bündnis gelten nur, wenn der andere sie angeboten hat
  if ((a.st === 'frieden' && cur === 'fehde') || a.st === 'buendnis') {
    if (pending.get(`${to}>${me}`) !== a.st) return { ok: false, msg: 'Das Angebot gilt nicht mehr.' };
    pending.delete(`${to}>${me}`);
  }
  pending.delete(`${me}>${to}`);
  setPvp(me, to, a.st, cur);
  return { ok: true };
});
mpAddCommand('angebot', (mp, from, a) => {
  const me = mpSeatOf(from), to = a && a.to;
  if (!me || !SHIRES[to] || to === me) return { ok: false };
  const cur = pvpState(me, to);
  if (!((a.st === 'frieden' && cur === 'fehde') || (a.st === 'buendnis' && cur === 'frieden'))) return { ok: false, msg: 'Dieses Angebot passt nicht zu eurem Stand.' };
  const pid = mpPeerOfSeat(to);
  if (!pid) return { ok: false, msg: `${humanName(to)} ist gerade nicht in der Partie.` };
  pending.set(`${me}>${to}`, a.st);
  mpSendTo(pid, 'angebot', { from: me, st: a.st });
  return { ok: true };
});
mpAddCommand('absage', (mp, from, a) => {
  const me = mpSeatOf(from);
  if (!me || !a || !SHIRES[a.to]) return { ok: false };
  pending.delete(`${a.to}>${me}`);
  const pid = mpPeerOfSeat(a.to);
  if (pid) mpSendTo(pid, 'absage', { from: me, st: a.st });
  return { ok: true };
});

mpOn('diplo', (mp, from, d) => {
  if (from !== mp.hostId || !d || !SHIRES[d.a] || !SHIRES[d.b] || !PVP_NAMES[d.st]) return;
  (G.s.pvp || (G.s.pvp = {}))[pairKey(d.a, d.b)] = { st: d.st, since: d.day || G.s.day };
  const me = mp.seat;
  if (d.a === me || d.b === me) delete pvpOffers()[d.a === me ? d.b : d.a];
  diploNews(d.a, d.b, d.st, d.was);
});
mpOn('angebot', (mp, from, d) => {
  if (!d || !SHIRES[d.from] || (d.st !== 'frieden' && d.st !== 'buendnis')) return;
  pvpOffers()[d.from] = d.st;
  const who = humanName(d.from), what = d.st === 'frieden' ? 'Frieden' : 'ein Bündnis';
  log(`${who} bietet dir ${what} an. Annehmen oder ablehnen kannst du auf der Karte unter „Mitspieler“ (M).`, 'gold');
  if (G.started && !dialogOpen()) confirmDialog(`${who} bietet dir ${what} an.`, 'Annehmen', () => pvpAccept(d.from), () => pvpDecline(d.from));
  if (G.uiRefresh) G.uiRefresh();
});
mpOn('absage', (mp, from, d) => {
  if (!d || !SHIRES[d.from]) return;
  log(`${humanName(d.from)} lehnt dein Angebot ab (${d.st === 'frieden' ? 'Frieden' : 'Bündnis'}).`, 'bad');
});
mpOn('geschenk', (mp, from, d) => {
  const g = Math.max(0, Math.min(5000, (d && d.gold) | 0));
  if (!g || !G.s) return;
  G.s.gold += g;
  log(`${humanName(mpSeatOf(from)) || d.name} schickt dir ${g} Gold als Geschenk.`, 'gold');
});

function diploNews(a, b, st, was) {
  const mp = G.mp, me = mp && mp.seat;
  const na = a === me ? 'du' : humanName(a), nb = b === me ? 'dich' : humanName(b), nbD = b === me ? 'dir' : humanName(b);
  const mine = a === me || b === me;
  let text;
  if (st === 'fehde') text = a === me ? `Du erklärst ${humanName(b)} die Fehde! Ihr dürft euch und eure Gefährten jetzt angreifen.` : b === me ? `${humanName(a)} erklärt dir die Fehde! Ihr dürft einander jetzt angreifen, auch euer Gefolge.` : `${na} erklärt ${nbD} die Fehde.`;
  else if (st === 'buendnis') text = mine ? `Bündnis mit ${humanName(a === me ? b : a)} geschlossen.` : `${na} und ${humanName(b)} schließen ein Bündnis.`;
  else if (was === 'buendnis') text = a === me ? `Du kündigst das Bündnis mit ${humanName(b)}.` : b === me ? `${humanName(a)} kündigt das Bündnis mit dir.` : `${na} kündigt das Bündnis mit ${humanName(b)}.`;
  else text = mine ? `Frieden mit ${humanName(a === me ? b : a)}: Die Fehde ist beendet.` : `${na} und ${humanName(b)} schließen Frieden.`;
  log(text, st === 'fehde' && mine ? 'bad' : mine ? 'gold' : 'info');
  if (G.uiRefresh) G.uiRefresh();
}

const done = (r) => { if (r && !r.ok && r.msg) log(r.msg, 'bad'); };
export function pvpDeclareFeud(seat) { mpCommand('diplo', { to: seat, st: 'fehde' }, done); }
export function pvpOffer(seat, st) {
  mpCommand('angebot', { to: seat, st }, (r) => { if (r && r.ok) log(`Du bietest ${humanName(seat)} ${st === 'frieden' ? 'Frieden' : 'ein Bündnis'} an. Jetzt liegt es an ${humanName(seat)}.`, 'gold'); else done(r); });
}
export function pvpAccept(seat) {
  const st = pvpOffers()[seat];
  if (!st) return;
  delete pvpOffers()[seat];
  mpCommand('diplo', { to: seat, st }, done);
}
export function pvpDecline(seat) {
  const st = pvpOffers()[seat];
  if (!st) return;
  delete pvpOffers()[seat];
  mpCommand('absage', { to: seat, st }, done);
  log(`Du lehnst das Angebot von ${humanName(seat)} ab.`);
  if (G.uiRefresh) G.uiRefresh();
}
export function pvpEndAlliance(seat) { if (pvpWith(seat) === 'buendnis') mpCommand('diplo', { to: seat, st: 'frieden' }, done); }
export const GIFTS = [50, 200, 500];
export function pvpGift(seat, gold) {
  const pid = mpPeerOfSeat(seat);
  if (!pid) { log(`${humanName(seat)} ist gerade nicht in der Partie.`, 'bad'); return; }
  if (G.s.gold < gold) { log('Nicht genug Gold.', 'bad'); return; }
  G.s.gold -= gold;
  mpSendTo(pid, 'geschenk', { gold, name: G.s.player.name });
  log(`Du schickst ${humanName(seat)} ${gold} Gold.`, 'gold');
}

// Aufträge: Wer einen annimmt, nimmt ihn für alle vom Brett. Der Gastgeber führt die Bretter (beim Gast: mpwelt.js)
G.pvpWithSeat = pvpWith;   // für holdings.js (Belagern nur in der Fehde)
G.onQuestTaken = () => { if (G.mp && !mpGuest()) mpWorldSoon(true); };

// ---------------------------------------------------------------- Truppen der Mitspieler
// Kennung einer eigenen Figur für die anderen: 'h' der Held, 'c…' Gefolge, 'w…' (beim Gastgeber) die Gruppen der Welt
function ridOf(u) {
  if (!u) return null;
  if (u === G.s.player) return 'h';
  if (u.kind === 'companion' && u.status === 'party') return `c${u.id}`;
  if (u.group && !u.group.mirror && mpHostRole()) return `w${u.id}`;
  return null;
}
function localByRid(rid) {
  if (rid === 'h') return G.s.player;
  const id = Number(String(rid).slice(1));
  if (rid[0] === 'c') return G.s.companions.find((c) => c.id === id && c.status === 'party' && !c.dead) || null;
  if (rid[0] === 'w' && mpHostRole()) { for (const g of G.groups) if (!g.mirror) for (const m of g.members) if (m.id === id) return m; }
  return null;
}
function troopKind() { return 'gefaehrte'; }
function enc(u) {
  const fl = (u.mounted ? 1 : 0) | (u.swing > 0 ? 2 : 0) | (u.run ? 4 : 0) | (u.female ? 8 : 0);
  return [ridOf(u), troopKind(u), u.cls, +u.x.toFixed(2), +u.y.toFixed(2), Math.max(0, Math.round(u.hp)), Math.round(u.st.maxHp), fl,
    u.eq.waffe || null, u.eq.ruestung || null, u.eq.schild || null, u.eq.pferd || null, u.tunic || null, u.livery || null, u.look || null, u.level || 1,
    u.group ? u.group.id : 0, u.name || ''];
}

let troopT = 0, sentEmpty = true;
const hitFx = [], shots = [], deaths = [];
G.onHit = (t, dmg, crit) => { if (!G.mp) return; const rid = ridOf(t); if (!rid) return; hitFx.push([rid, dmg, crit ? 1 : 0]); if (t.hp <= 0) deaths.push(rid); };
G.onShot = (u, t) => { if (!G.mp) return; const rid = ridOf(u); if (rid) shots.push([rid, +t.x.toFixed(1), +t.y.toFixed(1), ITEMS[u.eq.waffe] && ITEMS[u.eq.waffe].kind === 'armbrust' ? 1 : 0]); };

mpOnTick((mp, dt) => {
  if (!G.started || !G.s) return;
  smoothTroops(mp, dt);
  for (const u of G.remoteUnits || []) if (u.team === 'remote') u.friendly = u.rk !== 'feind' && u.rk !== 'ziel' && pvpWith(u.seat) !== 'fehde';
  troopT += dt;
  if (troopT < 0.25) return;
  troopT = 0;
  const list = [];
  for (const c of partyMembers()) if (!c.dead && !c.hidden) list.push(enc(c));
  if (!list.length && sentEmpty && !hitFx.length && !shots.length && !deaths.length) return;
  sentEmpty = !list.length;
  mpBroadcast('trupp', { u: list, fx: hitFx.splice(0), sh: shots.splice(0), tot: deaths.splice(0) });
});

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
mpOn('trupp', (mp, from, d, p) => {
  if (!p || !d || !Array.isArray(d.u)) return;
  const T = p.troops || (p.troops = new Map()), seen = new Set();
  if (!G.remoteUnits) G.remoteUnits = [];
  for (const r of d.u.slice(0, 80)) {
    if (!Array.isArray(r) || typeof r[0] !== 'string' || !CLASSES[r[2]]) continue;
    const [rid, rk, cls, x, y, hp, mhp, fl, w, ru, sc, pf, tunic, livery, look, lv, gid, name] = r;
    seen.add(rid);
    let u = T.get(rid);
    const eq = { waffe: ITEMS[w] ? w : null, ruestung: ITEMS[ru] ? ru : null, schild: ITEMS[sc] ? sc : null, pferd: ITEMS[pf] ? pf : null };
    if (!u) {
      u = makeUnit({ kind: 'npc', cls, level: Math.max(1, num(lv, 1)), eq, x: num(x), y: num(y), name: String(name || '').slice(0, 24) || undefined, female: !!(fl & 8) });
      u.team = 'remote'; u.peer = from; u.rid = rid; u.mirror = true; u.tx = u.x; u.ty = u.y;
      T.set(rid, u);
      G.remoteUnits.push(u);
    }
    const eqKey = JSON.stringify(eq);
    if (u._eqKey !== eqKey) { u._eqKey = eqKey; u.eq = eq; computeStats(u); }
    u.rk = 'gefaehrte'; u.seat = p.seat; u.gid = gid | 0;
    if (p.unit) { u.feinde = p.unit.feinde; u.waldAlly = p.unit.waldAlly; }
    u.tx = num(x, u.x); u.ty = num(y, u.y);
    u.st.maxHp = Math.max(1, num(mhp, 1)); u.hp = Math.max(0, Math.min(u.st.maxHp, num(hp, 1)));
    u.mounted = !!(fl & 1); u.run = !!(fl & 4); u.female = !!(fl & 8);
    if ((fl & 2) && !(u.swing > 0)) u.swing = 0.3;
    u.look = typeof look === 'string' ? look : null;
    // Gefolge in der Farbe seines Herrn (Ring und Wappenrock), Banden wie sie sind
    u.livery = u.rk === 'gefaehrte' ? p.color || livery : typeof livery === 'string' ? livery : null;
    u.tunic = typeof tunic === 'string' ? tunic : u.rk === 'gefaehrte' ? p.color : null;
  }
  for (const [rid, u] of T) if (!seen.has(rid)) { T.delete(rid); G.remoteUnits = G.remoteUnits.filter((o) => o !== u); }
  const byRid = (rid) => (rid === 'h' ? p.unit : rid[0] === 'w' ? G.mirrorMember && G.mirrorMember(Number(rid.slice(1))) : T.get(rid));
  for (const [rid, dmg, crit] of Array.isArray(d.fx) ? d.fx.slice(0, 40) : []) {
    const u = byRid(rid);
    if (u) { u.flash = 0.18; u.combatT = 5; G.fx.push({ kind: 'text', x: u.x, y: u.y, text: crit ? `${dmg | 0}!` : String(dmg | 0), color: crit ? '#ffd84a' : '#fff4d8', t: 0, dur: 1.0 }); }
  }
  for (const [rid, tx, ty, bolt] of Array.isArray(d.sh) ? d.sh.slice(0, 40) : []) {
    const u = byRid(rid);
    if (u) G.projectiles.push({ x: u.x, y: u.y, tx: num(tx), ty: num(ty), target: null, visual: true, t: 0, dur: Math.max(0.18, Math.hypot(num(tx) - u.x, num(ty) - u.y) / 15), bolt: !!bolt });
  }
  for (const rid of Array.isArray(d.tot) ? d.tot.slice(0, 40) : []) {
    const u = byRid(rid);
    if (u && rid !== 'h') G.fx.push({ kind: 'corpse', x: u.x, y: u.y, look: unitLook(u), t: 0, dur: 25, typ: u.cls === 'bandit' || u.look === 'bandit' || u.look === 'wald' ? 'gruen' : 'rot', v: 1 + Math.floor(Math.random() * 4), flip: Math.random() < 0.5 });
  }
});
// Weich zwischen den Meldungen bewegen (wie die Helden der Mitspieler, mp.js)
function smoothTroops(mp, dt) {
  for (const p of mp.peers.values()) {
    if (!p.troops) continue;
    for (const u of p.troops.values()) {
      if (u.swing > 0) u.swing -= dt;
      if (u.flash > 0) u.flash -= dt;
      if (u.combatT > 0) u.combatT -= dt;
      const dx = u.tx - u.x, dy = u.ty - u.y, dd = Math.hypot(dx, dy);
      if (dd > 6) { u.x = u.tx; u.y = u.ty; }
      else if (dd > 0.01) {
        const k = Math.min(1, dt * 8);
        u.x += dx * k; u.y += dy * k;
        u.dirX = dx / dd; u.dirY = dy / dd;
        const sx = dx - dy;
        if (Math.abs(sx) > 0.02) u.facing = sx >= 0 ? 1 : -1;
      }
      u.moving = dd > 0.03;
      if (u.moving) u.anim += dt;
    }
  }
}

// ---------------------------------------------------------------- Kämpfe über die Rechner
// Wer gegen wen: Helden und Gefolge zweier Spieler nur in einer Fehde; die Gruppen der Welt beim Gastgeber nach
// mpwelt.js (worldFoe: Banden jeden, Parteien ihre Feinde, Aufgebote und Burgwachen die Feinde ihres Herrn)
G.remoteFoe = (a, b) => {
  const r = a.team === 'remote' ? a : b, l = r === a ? b : a;
  if (l.team === 'remote' || r.dead) return false;
  if (l.team === 'player') return pvpWith(r.seat) === 'fehde';
  const g = l.group;
  if (!g || g.mirror) return false;
  return !!(G.worldFoe && G.worldFoe(g, r));
};
// Ein Schlag auf eine fremde Figur geht an ihren Besitzer (beim Gast: Gruppen der Welt an den Gastgeber)
G.onRemoteHit = (a, t, ranged, ox, oy, charge) => {
  if (!G.mp) return;
  const peer = t.peer || (t.group && t.group.mirror ? G.mp.hostId : null), rid = t.rid || `w${t.id}`;
  if (!peer) return;
  const ak = a === G.s.player ? 'held' : a.kind === 'companion' ? 'gefaehrte' : 'bande';
  mpSendTo(peer, 'treffer', { rid, aid: ridOf(a) || 'h', atk: Math.round(a.st.atk * 10) / 10, hatk: a.mounted && a.st.horse ? a.st.horse.atk : 0, x: +ox.toFixed(2), y: +oy.toFixed(2), r: ranged ? 1 : 0, c: charge ? 1 : 0, ak, by: G.s.player.name });
};
mpOn('treffer', (mp, from, d) => {
  if (!d || typeof d.rid !== 'string' || !G.s) return;
  const t = localByRid(d.rid);
  if (!t || t.dead) return;
  // Held und Gefolge treffen nur Feinde in einer Fehde (alte Meldungen nach einem Friedensschluss zählen nicht)
  const seat = mpSeatOf(from);
  if (d.ak !== 'bande' && !t.group && pvpWith(seat) !== 'fehde') return;
  applyRemoteHit(t, { ...d, peer: from, seat });
  if (t === G.s.player && t.dead) log(`${String(d.by || humanName(seat)).slice(0, 24)} hat dich niedergeschlagen.`, 'bad');
});

// Für Tests
if (typeof window !== 'undefined') window.__ritterPvp = { pvpWith, pvpOffers, pvpDeclareFeud, pvpOffer, pvpAccept, pvpDecline, pvpEndAlliance, pvpGift, pvpPlayers };
