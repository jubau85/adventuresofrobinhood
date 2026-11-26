// Feldschlacht mit Verstand. Treffen zwei Heere aufeinander, stellen sie sich auf: Fußvolk vorn in Reihen,
// Schützen dahinter, Reiter auf beiden Flügeln. Das Heer mit den stärkeren Schützen erwartet den Angriff und lässt
// den Gegner in den Beschuss laufen, das andere rückt geschlossen vor. Die Linien halten zusammen: Wer kämpft,
// entfernt sich nur ein Stück von seinem Platz. Sobald die Linien aufeinanderprallen (oder es zu lange dauert),
// umgehen die Reiter die Flanke und fallen dem Gegner in den Rücken, am liebsten über seine Schützen her.
// Wer zu viele Leute verliert, wankt und flieht; die Sieger setzen eine Weile nach.
// Schilde schützen nur nach vorn (calcDamage in units.js): voll von vorn, halb von der Seite, gar nicht von hinten.

import { G, log } from './state.js';
import { GROUP_TYPES } from './data.js';
import { isWalkable } from './world.js';
import { attack, chaseTo, followSlot, faceDir, nearestEnemy, isEnemy, moveToward, endFeud, nearPlayer, WALK } from './units.js';

const SP_COL = 0.82, SP_ROW = 0.9;      // Abstand nebeneinander und zwischen den Reihen
export const DEPLOY_DIST = 26;          // so weit voneinander stellen sich die Heere auf

const roleOf = (m) => (m.st.ranged ? 'schuetze' : m.st.horse ? 'reiter' : 'fuss');
const nomOf = (g) => GROUP_TYPES[g.type].nom;

// Plätze in der Aufstellung, in Front-Koordinaten: l quer (rechts positiv), f nach vorn
function layout(g) {
  const T = g.tac, by = { fuss: [], schuetze: [], reiter: [] };
  for (const m of g.members) { m.role = roleOf(m); m.tgt = null; m.wp = 0; by[m.role].push(m); }
  const rows = (list, width, sp, f0, spRow) => {
    list.forEach((m, i) => {
      const row = Math.floor(i / width), n = Math.min(width, list.length - row * width), col = i % width;
      m.slot = { l: (col - (n - 1) / 2) * sp, f: f0 - row * spRow };
    });
    return Math.ceil(list.length / width);
  };
  const nf = by.fuss.length;
  const width = Math.max(5, Math.min(16, Math.ceil(nf / 3)));
  const ranksF = nf ? rows(by.fuss, width, SP_COL, 0, SP_ROW) : 0;
  const ns = by.schuetze.length;
  const back = ranksF ? -(ranksF * SP_ROW + 2.2) : 0;
  rows(by.schuetze, Math.max(4, Math.min(18, Math.ceil(ns / 2))), 0.95, back, SP_ROW);
  T.halfW = ((Math.min(width, nf || width) - 1) / 2) * SP_COL;
  T.depth = -back + 2 * SP_ROW;
  by.reiter.forEach((m, i) => {
    const side = i % 2 ? 1 : -1, j = Math.floor(i / 2);
    m.wing = side;
    m.slot = { l: side * (T.halfW + 2.6 + (j % 2) * 1.1), f: -0.6 - Math.floor(j / 2) * 1.2 };
  });
  T.count = { fuss: nf, schuetze: ns, reiter: by.reiter.length };
  // Marschtempo der Linie: das langsamste Fußvolk im Schritt
  T.speed = Math.min(...g.members.filter((m) => m.role === 'fuss').map((m) => m.st.speed), 1.4) * WALK * 0.92;
}

function slotPos(g, m) {
  const T = g.tac, s = m.slot || { l: 0, f: 0 };
  const x = T.ax - T.fy * s.l + T.fx * s.f, y = T.ay + T.fx * s.l + T.fy * s.f;
  if (isWalkable(G.world, x, y)) { m._slotOk = { x, y }; return m._slotOk; }
  return m._slotOk || { x: T.ax, y: T.ay };
}

// Was richten die Schützen gegen die Rüstungen des Gegners aus? (Schaden je Sekunde, mit Reichweite gewichtet)
function rangedPower(g, f) {
  const def = f.members.reduce((a, m) => a + m.st.def, 0) / Math.max(1, f.members.length);
  let r = 0;
  for (const m of g.members) if (m.st.ranged) r += ((m.st.atk * m.st.atk) / (m.st.atk + def * 1.5) / m.st.cd) * (m.st.range / 6);
  return r;
}

// Treffen sich zwei Heere, stellen sie sich gegeneinander auf
export function startTactics(a, b) {
  for (const [g, f] of [[a, b], [b, a]]) {
    const dx = f.x - g.x, dy = f.y - g.y, d = Math.hypot(dx, dy) || 1;
    g.tac = { state: 'aufstellen', fx: dx / d, fy: dy / d, ax: g.x, ay: g.y, t: 0, all: 0, cav: 'warten', start: g.members.length, broken: false, said: {}, lastHit: G.time };
    g.path = null; g.feud = f;
    layout(g);
  }
  // Haltung: Wer die besseren Schützen hat, lässt den Gegner kommen; ein klar größeres Heer greift an
  const ra = rangedPower(a, b), rb = rangedPower(b, a), na = a.members.length, nb = b.members.length;
  a.tac.stance = b.tac.stance = 'angriff';
  if (na > nb * 1.35) b.tac.stance = rb > ra ? 'halten' : 'angriff';
  else if (nb > na * 1.35) a.tac.stance = ra > rb ? 'halten' : 'angriff';
  else if (Math.abs(ra - rb) > 0.15 * Math.max(ra, rb) && Math.random() < 0.8) (ra > rb ? a : b).tac.stance = 'halten';
  if (nearPlayer(a, 60) || nearPlayer(b, 60)) {
    log('Die Heere stellen sich zur Schlacht auf: Fußvolk in Reihen vorn, Schützen dahinter, Reiter auf den Flügeln.', 'bad');
    for (const g of [a, b]) if (g.tac.stance === 'halten') log(`${nomOf(g)} erwartet den Angriff und lässt die Schützen arbeiten.`);
  }
}

export function endTactics(g) {
  if (!g.tac) return;
  g.tac = null;
  for (const m of g.members) { m.tgt = null; m.role = null; m.slot = null; m._slotOk = null; m.tacRun = false; }
}

function centroid(list) {
  if (!list.length) return null;
  let x = 0, y = 0;
  for (const m of list) { x += m.x; y += m.y; }
  return { x: x / list.length, y: y / list.length };
}

// Wie weit vor der eigenen Front steht der nächste Feind (nur im Streifen vor der Linie)?
function frontGap(g, f) {
  const T = g.tac;
  let best = Infinity;
  for (const e of f.members) {
    const dx = e.x - T.ax, dy = e.y - T.ay;
    const fwd = dx * T.fx + dy * T.fy, lat = -dx * T.fy + dy * T.fx;
    if (Math.abs(lat) < T.halfW + 3 && fwd < best) best = fwd;
  }
  return best;
}

function tacSay(g, key, text, kind) {
  const T = g.tac;
  if (T.said[key]) return;
  T.said[key] = true;
  if (nearPlayer(g, 60)) log(text, kind);
}

function shouldBreak(g, f) {
  const lost = 1 - g.members.length / g.tac.start, flost = 1 - f.members.length / f.tac.start;
  return g.members.length < 4 || lost > 0.62 || (lost > 0.42 && lost - flost > 0.25);
}

function finishBattle(win, lose) {
  if (nearPlayer(win, 60) || nearPlayer(lose, 60)) log(`${nomOf(win)} behauptet das Feld. ${nomOf(lose)} ist geschlagen und zieht ab.`, 'gold');
  endTactics(win); endTactics(lose);
  endFeud(win);
  win.foe = null; lose.foe = null;
  const c = centroid(lose.members);
  if (c) { lose.x = c.x; lose.y = c.y; }
  const cw = centroid(win.members);
  if (cw) { win.x = cw.x; win.y = cw.y; }
  // Die Geschlagenen bekommen einen kleinen Vorsprung; begegnet man sich danach wieder, wird wieder gekämpft
  lose.peace = G.time + 60; win.peace = G.time + 30;
  lose.wait = 0; win.wait = 6;
  if (G.battle && (G.battle.a === win || G.battle.b === win)) G.battle = null;
}

function partWays(a, b) {
  if (nearPlayer(a, 60) || nearPlayer(b, 60)) log('Die Heere kommen nicht aneinander und trennen sich ohne Entscheidung.');
  endTactics(a); endTactics(b); endFeud(a);
  a.foe = null; b.foe = null;
  for (const g of [a, b]) { const c = centroid(g.members); if (c) { g.x = c.x; g.y = c.y; } g.peace = G.time + 120; }
  if (G.battle && (G.battle.a === a || G.battle.b === a)) G.battle = null;
}

// Jede Runde: Front ausrichten, vorrücken oder halten, Reiter führen, Moral prüfen
export function updateTactics(g, dt) {
  const T = g.tac, f = g.feud;
  if (!f || !f.tac || !f.members.length || !G.groups.includes(f)) { endTactics(g); return; }
  T.t += dt; T.all += dt;
  // Moral: Wer zu viel verliert, flieht; die Sieger setzen nach
  if (!T.broken && !f.tac.broken && shouldBreak(g, f)) {
    T.broken = true; T.brokeAt = G.time;
    f.tac.state = 'verfolgen'; f.tac.t = 0;
    tacSay(g, 'flucht', `${nomOf(g)} wankt und flieht!`, 'bad');
  }
  if (T.broken) {
    T.ax = g.members[0].x; T.ay = g.members[0].y; g.x = T.ax; g.y = T.ay;
    let close = false;
    for (const m of g.members) { for (const e of f.members) if (Math.abs(e.x - m.x) + Math.abs(e.y - m.y) < 12) { close = true; break; } if (close) break; }
    if (G.time - T.brokeAt > 22 || (!close && G.time - T.brokeAt > 5)) finishBattle(f, g);
    return;
  }
  if (T.state === 'verfolgen' || T.state === 'handgemenge') { const c = centroid(g.members); T.ax = c.x; T.ay = c.y; g.x = c.x; g.y = c.y; return; }
  // Steckt die Schlacht fest (Wald, Bach, Hang dazwischen, niemand trifft), löst sich die Ordnung ins Handgemenge auf
  const idle = G.time - Math.max(T.lastHit || 0, f.tac.lastHit || 0);
  // Kommen sie auch dann nicht aneinander, trennen sich die Heere ohne Sieger
  if (T.all > 300 && idle > 30) { partWays(g, f); return; }
  if ((T.all > 30 && idle > 18) || T.all > 180) {
    for (const h of [g, f]) { h.tac.state = 'handgemenge'; h.tac.cav = 'angriff'; }
    tacSay(g, 'gemenge', 'Die Ordnung löst sich auf, die Heere stürzen ins Handgemenge!', 'bad');
    return;
  }

  // Die Front dreht langsam zum Gegner, solange die Linien sich nicht berühren
  const ec = centroid(f.members.filter((m) => m.role === 'fuss')) || centroid(f.members);
  if (T.state !== 'nahkampf' && ec) {
    const dx = ec.x - T.ax, dy = ec.y - T.ay, d = Math.hypot(dx, dy) || 1, k = Math.min(1, dt * 0.35);
    T.fx += (dx / d - T.fx) * k; T.fy += (dy / d - T.fy) * k;
    const l = Math.hypot(T.fx, T.fy) || 1; T.fx /= l; T.fy /= l;
  }
  const gap = frontGap(g, f);
  // Wie gut hält die Linie ihre Plätze? (Vorrücken nur, wenn sie geschlossen folgt)
  let err = 0, n = 0;
  for (const m of g.members) if (m.role === 'fuss' && !m.tgt) { const s = slotPos(g, m); err += Math.hypot(s.x - m.x, s.y - m.y); n++; }
  const loose = n ? err / n : 0;
  const advance = (mult) => {
    const st = T.speed * mult * dt, nx = T.ax + T.fx * st, ny = T.ay + T.fy * st;
    if (isWalkable(G.world, nx, ny)) { T.ax = nx; T.ay = ny; }
  };
  if (T.state === 'aufstellen') {
    if ((n && loose < 1.1) || T.t > 10 || !n) { T.state = 'vorruecken'; T.t = 0; }
  } else if (T.state === 'vorruecken') {
    if (gap < 2.4) { T.state = 'nahkampf'; T.t = 0; if (f.tac.state === 'vorruecken') { f.tac.state = 'nahkampf'; f.tac.t = 0; } tacSay(g, 'prall', 'Die Linien prallen aufeinander!', 'bad'); f.tac.said.prall = true; }
    else if (T.stance === 'angriff' && loose < 1.6) advance(1);
    // Wer hält und nicht angegriffen wird, rückt nach einer Weile doch vor
    if (T.stance === 'halten' && T.t > 24 && f.tac.stance === 'halten') T.stance = 'angriff';
    if (T.stance === 'halten' && T.t > 40) T.stance = 'angriff';
  } else if (T.state === 'nahkampf') {
    // Die Linie drückt nach, solange vorn niemand steht
    if (gap > 1.1 && loose < 2.2) advance(0.45);
  }
  // Reiter: warten auf dem Flügel, umgehen die Flanke, fallen in den Rücken
  if (T.count.reiter) {
    const inMelee = T.state === 'nahkampf' || f.tac.state === 'nahkampf';
    // Wer angreift, schickt die Reiter los, kurz bevor die Linien sich treffen; wer hält, behält sie als Rückhalt
    // und wirft sie feindlichen Reitern entgegen, die herankommen
    let foeRiders = false;
    if (T.cav === 'warten') for (const e of f.members) if (e.role === 'reiter' && Math.hypot(e.x - T.ax, e.y - T.ay) < T.halfW + 8) { foeRiders = true; break; }
    const go = T.stance === 'halten' ? inMelee : inMelee || gap < 9 || T.all > 24;
    if (T.cav === 'warten' && foeRiders) {
      T.cav = 'angriff';
      tacSay(g, 'gegenstoss', `${nomOf(g)}: Die Reiter werfen sich den feindlichen Reitern entgegen!`);
    } else if (T.cav === 'warten' && go) {
      T.cav = 'umgehen'; T.cavT = 0;
      tacSay(g, 'flanke', `${nomOf(g)}: Die Reiter umgehen die Flanke!`);
    } else if (T.cav === 'umgehen') {
      T.cavT += dt;
      if (T.cavT > 16) T.cav = 'angriff';
    }
  }
  g.x = T.ax; g.y = T.ay;
}

// Ziel behalten, solange es lebt, Feind ist und in Reichweite bleibt
function keepTarget(m, r) {
  const t = m.tgt;
  if (!t || t.dead || !isEnemy(m, t) || Math.hypot(t.x - m.x, t.y - m.y) > r) { m.tgt = null; return null; }
  return t;
}

function fight(m, t, dt) {
  m.tgt = t; m.tacRun = true;
  const d = Math.hypot(t.x - m.x, t.y - m.y), r = m.st.range;
  if (d > r * 0.95) chaseTo(m, t.x, t.y, dt, r * 0.85);
  if (d <= r + 0.15 && m.cd <= 0) attack(m, t);
}

// Am Platz still stehen und nach vorn blicken
function holdSlot(m, g, dt, vx, vy, mult = 1.15) {
  const s = slotPos(g, m), T = g.tac, d = Math.hypot(s.x - m.x, s.y - m.y);
  m.tacRun = d > 2;
  if (d > 30) { m.x = s.x; m.y = s.y; return; }
  const done = followSlot(m, s.x, s.y, vx, vy, dt, d > 2 ? 1.5 : mult);
  if (done || d < 0.6) {
    const k = Math.min(1, dt * 3);
    faceDir(m, (m.dirX ?? T.fx) + (T.fx - (m.dirX ?? T.fx)) * k, (m.dirY ?? T.fy) + (T.fy - (m.dirY ?? T.fy)) * k);
  }
}

function flee(m, g, dt) {
  const f = g.feud;
  m.tacRun = true; m.tgt = null;
  const c = f && centroid(f.members);
  let dx = c ? m.x - c.x : -g.tac.fx, dy = c ? m.y - c.y : -g.tac.fy;
  const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
  if (!moveToward(m, m.x + dx * 4, m.y + dy * 4, dt, 0.05, 1.05)) chaseTo(m, m.x + dx * 6 - dy * 3, m.y + dy * 6 + dx * 3, dt, 0.3);
}

// Schützen nehmen das lohnendste Ziel in Reichweite: wenig Rüstung, und ein Schild hilft nur, wenn er zum Schützen zeigt
function bestShot(m, f) {
  if (!f) return null;
  const r = m.st.range, atk = m.st.atk;
  let best = null, bs = 0;
  for (const e of f.members) {
    const d = Math.hypot(e.x - m.x, e.y - m.y);
    if (d > r) continue;
    let def = e.st.def;
    if (e.st.shield && e.dirX !== undefined && ((m.x - e.x) * e.dirX + (m.y - e.y) * e.dirY) / (d || 1) >= 0.5) def += e.st.shield * 0.5;
    const sc = (atk * atk) / (atk + def * 1.5) * (1.15 - d / r * 0.3);
    if (sc > bs) { bs = sc; best = e; }
  }
  return best;
}

// Wegpunkte der Reiter eines Flügels: erst seitlich neben die feindliche Linie, dann hinter sie
function wingPoints(g, side) {
  const T = g.tac, E = g.feud.tac;
  const lx = -T.fy, ly = T.fx;               // eigene Querrichtung (der eigene Flügel liegt auf dieser Seite)
  const w = (E.halfW || 4) + 5;
  const p1 = { x: E.ax + lx * side * w - T.fx * 1, y: E.ay + ly * side * w - T.fy * 1 };
  const back = (E.depth || 4) + 2.5;
  const p2 = { x: E.ax + lx * side * (E.halfW || 4) * 0.4 + T.fx * back, y: E.ay + ly * side * (E.halfW || 4) * 0.4 + T.fy * back };
  return [p1, p2];
}

export function updateTacMember(m, g, dt) {
  const T = g.tac;
  if (T.broken) { flee(m, g, dt); return; }
  if (T.state === 'verfolgen' || T.state === 'handgemenge') {
    const r = T.state === 'handgemenge' ? 40 : 14;
    const e = keepTarget(m, r) || nearestEnemy(m, r);
    if (e) fight(m, e, dt); else { m.tacRun = false; m.tgt = null; }
    return;
  }
  const vx = g.vx || 0, vy = g.vy || 0;
  const role = m.role || (m.role = roleOf(m));
  if (role === 'schuetze') {
    // Nahkämpfer dicht dran: ein paar Schritte zurück, dann wehren
    const close = nearestEnemy(m, 1.8);
    if (close && !close.st.ranged) {
      m.backT = (m.backT || 0) + dt;
      if (m.backT < 2.5) { m.tacRun = true; moveToward(m, m.x - (close.x - m.x) * 2, m.y - (close.y - m.y) * 2, dt, 0.05, 0.95); if (m.cd <= 0 && Math.hypot(close.x - m.x, close.y - m.y) < 1.2) attack(m, close); return; }
      fight(m, close, dt); return;
    }
    m.backT = Math.max(0, (m.backT || 0) - dt * 0.5);
    m.pickT = (m.pickT || 0) - dt;
    let t = keepTarget(m, m.st.range + 0.4);
    if (!t || m.pickT <= 0) { t = bestShot(m, g.feud) || t; m.pickT = 1.5; }
    if (t) { m.tgt = t; m.tacRun = false; faceDir(m, t.x - m.x, t.y - m.y); if (m.cd <= 0) attack(m, t); return; }
    holdSlot(m, g, dt, vx, vy);
    return;
  }
  if (role === 'fuss') {
    const s = slotPos(g, m);
    const leash = T.state === 'nahkampf' ? 5 : 1.8;
    let t = keepTarget(m, m.st.range + 1.4);
    if (t && Math.hypot(t.x - s.x, t.y - s.y) > leash + 2) { t = null; m.tgt = null; }
    if (!t) { const e = nearestEnemy(m, leash + 1.5); if (e && Math.hypot(e.x - s.x, e.y - s.y) <= leash + 1.5) t = e; }
    if (t) { fight(m, t, dt); return; }
    holdSlot(m, g, dt, vx, vy);
    return;
  }
  // Reiter
  const near = nearestEnemy(m, T.cav === 'angriff' ? 14 : 2.6);
  if (T.cav === 'angriff') {
    // Im Rücken des Gegners: am liebsten die Schützen
    let t = keepTarget(m, 4);
    if (!t) {
      let best = null, bd = 9;
      for (const e of g.feud.members) { if (e.role !== 'schuetze') continue; const d = Math.hypot(e.x - m.x, e.y - m.y); if (d < bd) { bd = d; best = e; } }
      t = best || near;
    }
    if (t) { fight(m, t, dt); return; }
    holdSlot(m, g, dt, vx, vy); return;
  }
  if (near) { fight(m, near, dt); return; }
  if (T.cav === 'umgehen') {
    const pts = wingPoints(g, m.wing || 1);
    m.wp = m.wp || 0;
    const wp = pts[Math.min(1, m.wp)];
    const j = (m.slot ? m.slot.f : 0) * 0.8;
    m.tacRun = true; m.tgt = null;
    if (chaseTo(m, wp.x - T.fx * j, wp.y - T.fy * j, dt, 1.2) || Math.hypot(wp.x - m.x, wp.y - m.y) < 2.4) {
      if (m.wp === 0) m.wp = 1;
      else { T.cav = 'angriff'; tacSay(g, 'ruecken', `${nomOf(g)}: Die Reiter fallen dem Gegner in den Rücken!`, 'bad'); }
    }
    return;
  }
  holdSlot(m, g, dt, vx, vy);
}
