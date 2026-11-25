// Einstieg: Spielstart, Hauptschleife, Eingabe, Kamera.

import { G, log } from './state.js';
import { DAY_LEN, CLASSES, GROUP_TYPES, FACTIONS } from './data.js';
import { generateWorld, groundZ } from './world.js';
import { spawnAnimals, updateAnimals } from './animals.js';
import {
  makeUnit, rebuildUnits, spawnPeasants, maintainGroups, updateUnits, updateGroups, updateProjectiles,
  setPlayerPath, provokeGroup, inCombat, placeNear, groupHostile, partyMembers,
} from './units.js';
import { initTowns } from './economy.js';
import { refreshTownQuests, isHostileFaction } from './politics.js';
import { castleSite } from './castle.js';
import { updateTime } from './sim.js';
import { initRender, resetRender, render, onSeasonChanged, unitAtScreen, drawMap, screenToGround, buildingAtScreen } from './render.js';
import {
  initUI, updateHUD, openPanel, closePanel, panelOpen, confirmDialog, dialogOpen, closeDialog, showPrompt, byId, esc, renderLog,
} from './ui.js';
import { serialize, deserialize, saveGame, readSave, saveSummary } from './save.js';
import { isoX, isoY } from './iso.js';

const keys = new Set();
let viewCanvas, mini;

// ---------------------------------------------------------------- Spielstart
function newGame(name) {
  const seed = (Math.random() * 2147483647) | 0;
  G.world = generateWorld(seed);
  G.nextId = 1;
  const site = G.world.sites.find((s) => s.type === 'spieler');
  const player = makeUnit({
    kind: 'player', cls: 'ritter', name, level: 1,
    eq: { waffe: 'langschwert', ruestung: 'kettenhemd', schild: 'holzschild', pferd: 'klepper' },
    x: site.x + 0.3, y: site.y + 2.6,
  });
  G.s = {
    seed, day: 1, time: DAY_LEN * (2 / 24), gold: 300, renown: 0,
    rep: { sachsen: 10, normannen: -5, kirche: 0, gilde: 0, waldleute: -5 },
    cargo: {}, inventory: ['speer', 'gambeson', 'kurzbogen'],
    castle: { level: 0, b: {}, storage: { holz: 30, stein: 0, eisen: 0 }, construction: null, recruits: [], recruitDay: 0 },
    towns: {}, quests: [], questSeq: 1, order: 'folgen', companions: [], flags: {}, stats: { quests: 0 }, safeTime: 0,
    player,
  };
  const squire = makeUnit({ kind: 'companion', cls: 'knecht', name: 'Oswin Langbein', level: 1, eq: { ...CLASSES.knecht.start }, status: 'party' });
  squire.wage = CLASSES.knecht.wage;
  placeNear(squire, player.x, player.y, 1);
  G.s.companions.push(squire);
  initTowns();
  G.groups = []; G.units = []; G.projectiles = []; G.fx = []; G.messages = [];
  spawnPeasants();
  maintainGroups(true);
  rebuildUnits();
  spawnAnimals();
  for (const s of G.world.sites) refreshTownQuests(s);
  startWorld();
  log(`Willkommen in Ashcombe, ${name}. Die Burg ist eine Ruine, aber sie gehört dir.`, 'gold');
  log('Tritt an die Ruine (E) und errichte ein Holzfällerlager und einen Rittersaal. Aufträge gibt es in den Siedlungen.');
}

function startWorld() {
  resetRender();
  const p = G.s.player;
  G.cam.x = isoX(p.x, p.y); G.cam.y = isoY(p.x, p.y) - groundZ(G.world, p.x, p.y);
  G.cam.zoom = G.pixel ? (G.view.w < 720 ? 1.0 : 1.3) : (G.view.w < 720 ? 0.75 : 1);
  G.started = true;
  G.fast = false;
  G.ui.sel = null;
  G.pendingSite = null;
  closePanel();
  byId('title').hidden = true;
  renderLog();
  updateHUD();
}

function showTitle() {
  G.started = false;
  const info = saveSummary();
  const cont = byId('btn-continue');
  cont.hidden = !info;
  byId('continue-info').textContent = info ? `Gespeichert: ${info}` : '';
  byId('title').hidden = false;
  byId('name-input').focus();
}

function loadGame() {
  const data = readSave();
  if (!data) { log('Kein Spielstand gefunden.', 'bad'); return false; }
  try {
    deserialize(data);
    spawnAnimals();
    G.messages = [];
    startWorld();
    log(`Spielstand geladen: Tag ${G.s.day}.`, 'gold');
    return true;
  } catch (e) {
    log(`Laden fehlgeschlagen: ${e.message}`, 'bad');
    return false;
  }
}

G.saveGame = (auto) => {
  const ok = saveGame();
  if (!auto) log(ok ? 'Spielstand gespeichert.' : 'Speichern ist in diesem Browser nicht möglich.', ok ? 'good' : 'bad');
};
G.loadGame = loadGame;
G.saveInfo = () => saveSummary();
G.showTitle = showTitle;
G.onSeason = onSeasonChanged;
G.onNewDay = () => { G.saveGame(true); };
G.onVictory = () => openPanel('victory');

// ---------------------------------------------------------------- Interaktion
function interactRadius(s) { return s.type === 'spieler' ? 6.5 : s.type === 'burg' || s.type === 'stadt' ? 5 : 4; }

function nearestSite() {
  const p = G.s.player;
  let best = null, bd = Infinity;
  for (const s of G.world.sites) {
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d < interactRadius(s) && d < bd) { bd = d; best = s; }
  }
  return best;
}

function enterSite(s) {
  if (!s) return;
  G.pendingSite = null;
  G.s.player.path = null;
  if (s.type === 'spieler') openPanel('castle');
  else openPanel('town', s);
}

function checkNearSite() {
  const s = nearestSite();
  G.nearSite = s;
  if (s && G.pendingSite === s && !inCombat()) { enterSite(s); return; }
  if (s && !inCombat()) {
    const blocked = s.faction && isHostileFaction(s.faction);
    showPrompt(`<kbd>E</kbd> ${s.type === 'spieler' ? 'Burg Ashcombe verwalten' : `${esc(s.name)} betreten`}${blocked ? ' <span class="warn">(feindlich)</span>' : ''}`);
  } else if (inCombat()) {
    showPrompt('<span class="warn">Kampf!</span> Klicke auf Gegner oder drücke <kbd>Leertaste</kbd>');
  } else showPrompt(null);
}

function attackNearest() {
  const p = G.s.player;
  let best = null, bd = 12;
  for (const u of G.units) {
    if (u.dead || !u.group) continue;
    if (!(u.group.engaged || groupHostile(u.group))) continue;
    const d = Math.hypot(u.x - p.x, u.y - p.y);
    if (d < bd) { bd = d; best = u; }
  }
  if (best) {
    best.group.engaged = true;
    p.attackTarget = best;
    p.path = null;
  }
}

function clickUnit(u) {
  const p = G.s.player;
  const g = u.group;
  if (!g) return false;
  if (g.engaged || groupHostile(g)) {
    g.engaged = true;
    p.attackTarget = u;
    p.path = null;
    return true;
  }
  const gt = GROUP_TYPES[g.type];
  const conseq = gt.kill ? Object.entries(gt.kill).map(([f, v]) => `${FACTIONS[f].short} ${v > 0 ? '+' : ''}${v}`).join(', ') : '';
  const who = gt.acc[0].toUpperCase() + gt.acc.slice(1);
  confirmDialog(`${who} angreifen? Sie sind dir nicht feindlich gesinnt.${conseq ? ` Folgen bei einem Sieg: ${conseq}.` : ''}`, 'Angreifen', () => {
    provokeGroup(g);
    p.attackTarget = u;
    p.path = null;
  });
  return true;
}

function clickWorld(px, py) {
  if (!G.started || panelOpen() || dialogOpen()) return;
  const u = unitAtScreen(px, py);
  if (u && clickUnit(u)) return;
  const wp = screenToGround(px, py);
  const p = G.s.player;
  p.attackTarget = null;
  let site = null;
  for (const s of G.world.sites) if (Math.hypot(s.x - wp.x, s.y - wp.y) < (s.type === 'spieler' ? 4.5 : 2.5)) site = s;
  let tx = wp.x, ty = wp.y;
  if (site) {
    if (Math.hypot(site.x - p.x, site.y - p.y) < interactRadius(site)) { enterSite(site); return; }
    tx = site.x; ty = site.y + (site.type === 'spieler' ? 2.6 : 0.6);
  }
  if (setPlayerPath(tx, ty)) {
    G.pendingSite = site;
    G.clickMarker = { x: tx, y: ty, t: 0 };
  }
}

function toggleRide() {
  const p = G.s.player;
  if (!p.st.horse) { log('Du hast kein Pferd. Lege eins unter „Gefolge“ an oder kauf eins.', 'bad'); return; }
  p.mounted = !p.mounted;
  log(p.mounted ? 'Du sitzt auf.' : 'Du sitzt ab.');
}

function setOrder(o) {
  G.s.order = o;
  if (o === 'halten') for (const c of partyMembers()) c.holdPos = { x: c.x, y: c.y };
  log({ folgen: 'Gefolge: Folgt mir!', halten: 'Gefolge: Stellung halten!', angriff: 'Gefolge: Angriff!' }[o]);
}

function cycleOrder() {
  const o = ['folgen', 'halten', 'angriff'];
  setOrder(o[(o.indexOf(G.s.order) + 1) % 3]);
}

function toggleFast() {
  if (!G.fast && inCombat()) { log('Im Kampf vergeht die Zeit nicht schneller.', 'bad'); return; }
  G.fast = !G.fast;
}

function setRetro(on, quiet = false) {
  G.pixel = on;
  try { localStorage.setItem('ritter-retro', on ? '1' : '0'); } catch (e) { /* ohne Speicher */ }
  if (on) G.cam.zoom = Math.max(G.cam.zoom, 1.25);
  if (!quiet) log(on ? 'Retro-Look (Amiga-Stil) an.' : 'Retro-Look aus: klare Grafik.');
}
G.togglePixel = () => setRetro(!G.pixel);

function zoom(f) { G.cam.zoom = Math.max(0.55, Math.min(1.8, G.cam.zoom * f)); }

function togglePanel(kind) {
  if (G.ui.panel === kind) closePanel();
  else openPanel(kind);
}

function tool(name) {
  if (!G.started || dialogOpen()) return;
  switch (name) {
    case 'party': togglePanel('party'); break;
    case 'quests': togglePanel('quests'); break;
    case 'politics': togglePanel('politics'); break;
    case 'map': togglePanel('map'); break;
    case 'menu': togglePanel('menu'); break;
    case 'ride': if (!panelOpen()) toggleRide(); break;
    case 'order': cycleOrder(); break;
    case 'fast': toggleFast(); break;
    case 'zoomin': zoom(1.15); break;
    case 'zoomout': zoom(1 / 1.15); break;
    default: break;
  }
  updateHUD();
}

// ---------------------------------------------------------------- Eingabe
function onKey(e) {
  const k = e.key.toLowerCase();
  if (!byId('title').hidden) {
    if (k === 'enter') byId('btn-new').click();
    return;
  }
  if (dialogOpen()) {
    if (k === 'enter') closeDialog(true);
    if (k === 'escape') closeDialog(false);
    e.preventDefault();
    return;
  }
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (k === 'escape') { if (panelOpen()) closePanel(); else openPanel('menu'); e.preventDefault(); return; }
  const panelKeys = { i: 'party', j: 'quests', p: 'politics', m: 'map', h: 'help' };
  if (panelKeys[k]) { if (k === 'h') togglePanel('help'); else tool(panelKeys[k]); e.preventDefault(); return; }
  if (panelOpen()) return;
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); return; }
  switch (k) {
    case 'e': enterSite(nearestSite()); break;
    case 'r': toggleRide(); break;
    case ' ': attackNearest(); e.preventDefault(); break;
    case 'f': cycleOrder(); break;
    case '1': setOrder('folgen'); break;
    case '2': setOrder('halten'); break;
    case '3': setOrder('angriff'); break;
    case 't': toggleFast(); break;
    case 'g': G.togglePixel(); break;
    case '+': case '=': zoom(1.15); break;
    case '-': zoom(1 / 1.15); break;
    default: return;
  }
  updateHUD();
}

function readInput() {
  let dx = 0, dy = 0;
  if (keys.has('w') || keys.has('arrowup')) { dx -= 1; dy -= 1; }
  if (keys.has('s') || keys.has('arrowdown')) { dx += 1; dy += 1; }
  if (keys.has('a') || keys.has('arrowleft')) { dx -= 1; dy += 1; }
  if (keys.has('d') || keys.has('arrowright')) { dx += 1; dy -= 1; }
  const l = Math.hypot(dx, dy);
  G.input.dx = l ? dx / l : 0;
  G.input.dy = l ? dy / l : 0;
}

function bindInput() {
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  let down = null;
  viewCanvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  viewCanvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved < 10) {
      const r = viewCanvas.getBoundingClientRect();
      clickWorld(e.clientX - r.left, e.clientY - r.top);
    }
  });
  viewCanvas.addEventListener('pointermove', (e) => {
    if (!G.started) return;
    const r = viewCanvas.getBoundingClientRect();
    const u = unitAtScreen(e.clientX - r.left, e.clientY - r.top);
    G.hover = u;
    G.hoverBuilding = u ? null : buildingAtScreen(e.clientX - r.left, e.clientY - r.top);
    canvas.style.cursor = u && u.group ? 'crosshair' : 'pointer';
  });
  viewCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
  viewCanvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  mini.addEventListener('click', () => tool('map'));
  byId('prompt').addEventListener('click', () => {
    if (!G.started || panelOpen() || dialogOpen()) return;
    if (inCombat()) attackNearest(); else enterSite(nearestSite());
  });
  for (const b of document.querySelectorAll('[data-tool]')) b.addEventListener('click', () => tool(b.dataset.tool));
  byId('btn-new').addEventListener('click', () => {
    const name = byId('name-input').value.trim().slice(0, 28) || 'Aldric';
    newGame(name);
  });
  byId('btn-continue').addEventListener('click', () => loadGame());
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.started) G.saveGame(true); });
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = viewCanvas.getBoundingClientRect();
  G.view.w = r.width; G.view.h = r.height; G.view.dpr = dpr;
  viewCanvas.width = Math.round(r.width * dpr);
  viewCanvas.height = Math.round(r.height * dpr);
}

// ---------------------------------------------------------------- Schleife
function step(dt) {
  updateTime(dt);
  updateUnits(dt);
  updateGroups(dt);
  updateProjectiles(dt);
  updateAnimals(dt);
}

function updateFx(dt) {
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const f = G.fx[i];
    f.t += dt;
    if (f.t >= f.dur) G.fx.splice(i, 1);
  }
}

function updateCamera(dt) {
  const p = G.s.player;
  const tx = isoX(p.x, p.y), ty = isoY(p.x, p.y) - groundZ(G.world, p.x, p.y) - 12;
  const k = Math.min(1, dt * 6);
  G.cam.x += (tx - G.cam.x) * k;
  G.cam.y += (ty - G.cam.y) * k;
}

let last = performance.now(), hudT = 0, miniT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.time += dt;
  if (G.started) {
    readInput();
    const running = !panelOpen() && !dialogOpen();
    if (running) {
      if (G.fast && inCombat()) { G.fast = false; log('Der Zeitraffer endet. Kampf!', 'bad'); }
      const steps = G.fast ? 4 : 1;
      for (let k = 0; k < steps; k++) step(dt);
      updateFx(dt);
      checkNearSite();
    }
    updateCamera(dt);
    hudT -= dt;
    if (hudT <= 0) { updateHUD(); hudT = 0.2; }
    miniT -= dt;
    if (miniT <= 0) {
      const c = mini.getContext('2d');
      c.setTransform(2, 0, 0, 2, 0, 0);
      drawMap(c, mini.width / 2, mini.height / 2);
      miniT = 0.25;
    }
  }
  render();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- Boot
function boot(hotData) {
  viewCanvas = byId('view');
  mini = byId('minimap');
  initRender(viewCanvas);
  try { const v = localStorage.getItem('ritter-retro'); G.pixel = v === null ? true : v === '1'; } catch (e) { G.pixel = true; }
  initUI();
  bindInput();
  resize();
  window.addEventListener('resize', resize);
  let resumed = false;
  if (hotData && hotData.save) {
    try { deserialize(hotData.save); spawnAnimals(); startWorld(); resumed = true; } catch (e) { resumed = false; }
  }
  if (!resumed) showTitle();
  try {
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
      window.claude.hot.snapshot(() => (G.started ? { save: serialize() } : {}));
    }
  } catch (e) { /* Vorschau ohne Hot-Reload */ }
  requestAnimationFrame(frame);
}

const hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(boot);
else boot((hot && hot.data) || {});

// Für die Entwicklung in der Konsole erreichbar
window.__ritter = G;
window.__ritterCastle = castleSite;
