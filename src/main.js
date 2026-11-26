// Einstieg: Spielstart, Hauptschleife, Eingabe, Kamera.

import { G, log, homeName } from './state.js';
import { DAY_LEN, CLASSES, GROUP_TYPES, FACTIONS, HERALDRY, CASTLE_PLOT } from './data.js';
import { drawTitleArt } from './titleart.js';
import { loadArt } from './assets.js';
import { startAudio, setMood, setScene, musicEnabled, setMusicEnabled, sfxEnabled, setSfxEnabled, loadMusicPref, audioDebug, sfx, sfxAt, playWork } from './audio.js';
import { generateWorld, groundZ, worldSig } from './world.js';
import { spawnAnimals, updateAnimals, animalTitle, ANIMAL_INFO, refreshCastleHerd } from './animals.js';
import {
  makeUnit, rebuildUnits, spawnPeasants, maintainGroups, updateUnits, updateGroups, updateProjectiles,
  setPlayerPath, provokeGroup, inCombat, placeNear, groupHostile, partyMembers, startBattle, battleStatus,
} from './units.js';
import { initTowns } from './economy.js';
import { refreshTownQuests, isHostileFaction, addRenown } from './politics.js';
import { castleSite, castleBonusAt, dailyBalance, dailyCastle, refreshCastleBlock, castleObstacles } from './castle.js';
import { applyDamage, startSiege, siegeStatus, nearSiegeCamp, isSiegeGroup, posternNear, usePostern, posternRoute, setHomeGate, homeGateClosed, hasHomeGate, homeSite } from './siege.js';
import { initDynamics, applyCons, updateDynamics, raidVictim, startRaid } from './dynamics.js';
import { updateTourney, joustPress, tourneyStatus, dailyTourney, joinTourney } from './tournament.js';
import { initWeather, updateWeather, precip } from './weather.js';
import { updateCheats } from './cheats.js';
import { updateTime, passHours } from './sim.js';
import { initRender, resetRender, releaseRender, render, onSeasonChanged, unitAtScreen, drawMap, screenToGround, buildingAtScreen, animalAtScreen, drawHeroPreview, workEmitters, tileToScreen, fieldSpots } from './render.js';
import {
  initUI, updateHUD, openPanel, closePanel, panelOpen, confirmDialog, dialogOpen, closeDialog, showPrompt, byId, esc, renderLog, castleFocusTab,
} from './ui.js';
import { serialize, deserialize, saveGame, readSave, saveSummary } from './save.js';
import { giveAlms } from './life.js';
import { rescueCondemned, updateJustice, canRescue } from './justice.js';
import { darkness, seasonIndex, hourOf } from './sim.js';
import { isoX, isoY } from './iso.js';

const keys = new Set();
let viewCanvas, mini;

// ---------------------------------------------------------------- Spielstart
function newGame(opts) {
  const { name, castleName, color, female } = opts;
  const seed = (Math.random() * 2147483647) | 0;
  G.world = generateWorld(seed);
  G.nextId = 1;
  const site = G.world.sites.find((s) => s.type === 'spieler');
  const player = makeUnit({
    kind: 'player', cls: 'ritter', name, level: 1, female, hair: female ? '#7a3a1e' : '#3b2a1e',
    eq: { waffe: 'langschwert', ruestung: 'kettenhemd', schild: 'holzschild', pferd: 'klepper' },
    x: site.x + 0.3, y: site.y + 2.6,
  });
  G.s = {
    seed, castleName, color, day: 1, time: DAY_LEN * (2 / 24), gold: 300, renown: 0,
    rep: { sachsen: 10, normannen: -5, kirche: 0, gilde: 0, waldleute: -5, franken: -10 },
    damage: {}, graves: {}, pendingDead: {}, deadDay: {}, buff: null, blight: {}, slain: {}, raided: {},
    cargo: {}, inventory: ['speer', 'gambeson', 'kurzbogen'],
    castle: { level: 0, b: {}, storage: { holz: 30, stein: 0, eisen: 0, getreide: 20, fleisch: 4 }, construction: null, recruits: [], recruitDay: 0 },
    towns: {}, quests: [], questSeq: 1, order: 'folgen', companions: [], flags: {}, stats: { quests: 0 }, safeTime: 0,
    player,
  };
  const squire = makeUnit({ kind: 'companion', cls: 'knecht', name: 'Oswin Langbein', level: 1, eq: { ...CLASSES.knecht.start }, status: 'party' });
  squire.wage = CLASSES.knecht.wage;
  placeNear(squire, player.x, player.y, 1);
  G.s.companions.push(squire);
  initTowns();
  initDynamics();
  G.s.worldSig = worldSig(G.world);
  G.groups = []; G.units = []; G.projectiles = []; G.fx = []; G.messages = []; G.extras = []; G.tour = null; G.exec = null;
  spawnPeasants();
  maintainGroups(true);
  rebuildUnits();
  spawnAnimals();
  for (const s of G.world.sites) refreshTownQuests(s);
  startWorld();
  log(`Willkommen in ${homeName()}, ${name}. Die Burg ist eine Ruine, aber sie gehört dir.`, 'gold');
  log('Tritt an die Ruine (E) und errichte ein Holzfällerlager und einen Rittersaal. Aufträge gibt es in den Siedlungen.');
}

function startWorld() {
  const home = G.world.sites.find((s) => s.type === 'spieler');
  home.name = homeName();
  // Spielstand aus einer Version mit anderer Ortsanlage: Bau- und Schadensstand der Häuser neu auswürfeln
  const sig = worldSig(G.world);
  if (G.s.worldSig !== sig) {
    for (const k of Object.keys(G.s.damage || {})) if (k[0] !== 'v') delete G.s.damage[k];
    G.s.cons = null;
    G.s.worldSig = sig;
  }
  refreshCastleBlock();
  applyDamage();
  applyCons();
  initWeather();
  resetRender();
  const p = G.s.player;
  G.cam.x = isoX(p.x, p.y); G.cam.y = isoY(p.x, p.y) - groundZ(G.world, p.x, p.y);
  G.cam.zoom = G.gfx === 'klar' ? (G.view.w < 720 ? 1.7 : 2.4) : (G.view.w < 720 ? 1.7 : 2.0);
  G.started = true;
  G.fast = false;
  G.ui.sel = null;
  G.pendingSite = null; G.pendingBuild = null;
  closePanel();
  byId('title').hidden = true;
  renderLog();
  updateHUD();
}

// Startmenü: Wappenfarben, Figur und Vorschau
let titleColor = HERALDRY[0].color;
let titleFemale = false;

function buildSetupForm() {
  const box = byId('color-swatches');
  if (box.childElementCount) return;
  box.innerHTML = HERALDRY.map((h, i) => `<label title="${h.name}"><input type="radio" name="farbe" value="${h.color}" data-name="${h.name}"${i === 0 ? ' checked' : ''}><span style="--c:${h.color}"></span></label>`).join('');
  byId('color-name').textContent = HERALDRY[0].name;
  box.addEventListener('change', (e) => {
    const inp = e.target.closest('input');
    if (!inp) return;
    titleColor = inp.value;
    byId('color-name').textContent = inp.dataset.name;
  });
  for (const r of document.querySelectorAll('input[name="figur"]')) {
    r.addEventListener('change', () => {
      titleFemale = r.value === 'w' && r.checked;
      const ni = byId('name-input');
      if (titleFemale && ni.value === 'Aldric') ni.value = 'Aelfgifu';
      if (!titleFemale && ni.value === 'Aelfgifu') ni.value = 'Aldric';
    });
  }
  byId('setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    startAudio();
    const name = byId('name-input').value.trim().slice(0, 24) || (titleFemale ? 'Aelfgifu' : 'Aldric');
    const castleName = byId('castle-input').value.trim().slice(0, 20) || 'Ashcombe';
    newGame({ name, castleName, color: titleColor, female: titleFemale });
  });
}

function updateMusicButtons() {
  const on = musicEnabled();
  const t = byId('btn-music-title');
  t.textContent = on ? '♪ Musik an' : '♪ Musik aus';
  t.setAttribute('aria-pressed', String(on));
  const tool = document.querySelector('[data-tool="music"]');
  if (tool) tool.classList.toggle('on', on);
}

function toggleMusic() {
  setMusicEnabled(!musicEnabled());
  updateMusicButtons();
  log(musicEnabled() ? 'Musik an.' : 'Musik aus.');
}
function toggleSfx() {
  setSfxEnabled(!sfxEnabled());
  log(sfxEnabled() ? 'Geräusche an.' : 'Geräusche aus.');
}
G.toggleMusic = () => { toggleMusic(); };
G.musicOn = () => musicEnabled();
G.toggleSfx = () => { toggleSfx(); };
G.sfxOn = () => sfxEnabled();

function showTitle() {
  G.started = false;
  buildSetupForm();
  const info = saveSummary();
  const cont = byId('btn-continue');
  cont.hidden = !info;
  byId('continue-info').textContent = info ? `Gespeichert: ${info}` : '';
  byId('title').hidden = false;
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
G.animalTitle = animalTitle;

// ---------------------------------------------------------------- Interaktion
function interactRadius(s) { return s.type === 'spieler' ? 6.5 : s.type === 'burg' || s.type === 'stadt' ? 5 : 4; }

// Sehenswürdigkeiten: beim ersten Besuch ein Satz dazu und etwas Ruhm
let poiT = 0;
function checkPois(dt) {
  poiT -= dt;
  if (poiT > 0) return;
  poiT = 1;
  const p = G.s.player, W = G.world;
  G.s.visited = G.s.visited || {};
  for (const poi of W.pois || []) {
    if (G.s.visited[poi.id]) continue;
    const near = poi.kind === 'wall' ? W.wallRuins.some((r) => Math.hypot(r.x - p.x, r.y - p.y) < 2.2) : Math.hypot(poi.x - p.x, poi.y - p.y) < 3.5;
    if (!near) continue;
    G.s.visited[poi.id] = true;
    log(`${poi.name}: ${poi.desc}`, 'gold');
    addRenown(2);
  }
}

function nearestSite() {
  const p = G.s.player;
  let best = null, bd = Infinity;
  for (const s of G.world.sites) {
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d < interactRadius(s) && d < bd) { bd = d; best = s; }
    // Am Kai eines Hafens kann man den Ort ebenfalls betreten (Fähre)
    if (s.quay) {
      const dq = Math.hypot(s.quay.x - p.x, s.quay.y - p.y);
      if (dq < 3 && dq < bd) { bd = dq; best = s; }
    }
  }
  return best;
}

// E oder Klick auf die Statuszeile: Ort betreten, sonst ins Feldlager einer Belagerung
function interactHere() {
  if (posternNear()) { usePostern(); return; }
  G.pendingPostern = null;
  const s = nearestSite();
  if (s) enterSite(s);
  else if (nearSiegeCamp()) { G.pendingCamp = false; G.s.player.path = null; openPanel('siege'); }
}

// Eigene Burg: Ein Klick auf ein Gebäude oder einen Bauplatz öffnet nur dieses Gebäude,
// der Bergfried die ganze Burg. Steht man zu weit weg, geht man erst hin.
function buildingReach(id) {
  if (id === 'burg') return 4.2;
  const [w, h] = CASTLE_PLOT[id] || [1, 1];
  return Math.max(w, h) / 2 + 1.9;
}
function openCastleBuilding(id) {
  G.pendingBuild = null;
  G.s.player.path = null;
  if (id === 'burg') openPanel('castle');
  else openPanel('castle', { focus: id }, castleFocusTab(id));
}
function goBuilding(a) {
  const p = G.s.player, r = buildingReach(a.id);
  if (Math.hypot(a.x - p.x, a.y - p.y) < r) { openCastleBuilding(a.id); return; }
  G.pendingSite = null; G.pendingPostern = null;
  const pb = { id: a.id, x: a.x, y: a.y, r };
  if (setPlayerPath(a.x, a.y)) { G.pendingBuild = pb; G.clickMarker = { x: a.x, y: a.y, t: 0 }; return; }
  const pt = posternRoute(a.x, a.y);
  if (pt && setPlayerPath(pt.x, pt.y)) { G.pendingPostern = { x: a.x, y: a.y, site: null, build: pb }; G.clickMarker = { x: a.x, y: a.y, t: 0 }; }
}

function enterSite(s) {
  if (!s) return;
  G.pendingSite = null;
  G.s.player.path = null;
  if (s.type === 'spieler') openPanel('castle');
  else openPanel('town', s);
}

function checkNearSite() {
  const pa = G.pendingAlms;
  if (pa && (pa.dead || !G.s.player.path) && Math.hypot(pa.x - G.s.player.x, pa.y - G.s.player.y) >= 2.6) G.pendingAlms = null;
  else if (pa && Math.hypot(pa.x - G.s.player.x, pa.y - G.s.player.y) < 2.6) { G.pendingAlms = null; G.s.player.path = null; giveAlms(pa); }
  const s = nearestSite();
  G.nearSite = s;
  const ts = tourneyStatus();
  if (ts && G.tour && Math.hypot(G.tour.lx - G.s.player.x, G.tour.ly - G.s.player.y) < 16) { showPrompt(ts); return; }
  if (s && G.pendingSite === s && !inCombat()) { enterSite(s); return; }
  const pb = G.pendingBuild;
  if (pb && !inCombat() && Math.hypot(pb.x - G.s.player.x, pb.y - G.s.player.y) < pb.r) { openCastleBuilding(pb.id); return; }
  if (pb && !G.s.player.path) G.pendingBuild = null;
  if (!s && G.pendingCamp && nearSiegeCamp() && !inCombat()) { interactHere(); return; }
  const pp = G.pendingPostern;
  if (pp && posternNear()) {
    G.pendingPostern = null;
    usePostern();
    if (setPlayerPath(pp.x, pp.y)) { G.pendingSite = pp.site; G.pendingBuild = pp.build || null; }
    return;
  }
  if (pp && !G.s.player.path) G.pendingPostern = null;
  const pf = posternNear();
  if (pf) {
    showPrompt(`<kbd>E</kbd> ${pf.inside ? 'Durch die Pforte hinaus' : 'An die Pforte klopfen und hinein'}${battleText(' · ')}`);
  } else if (!s && nearSiegeCamp() && !inCombat()) {
    const sg = siegeStatus();
    showPrompt(`<kbd>E</kbd> Feldlager vor ${esc(sg.name)}${sg.side ? '' : ': Seite wählen'}${battleText(' · ')}`);
  } else if (s && !inCombat()) {
    const blocked = s.faction && isHostileFaction(s.faction);
    showPrompt(`<kbd>E</kbd> ${s.type === 'spieler' ? `Burg ${esc(homeName())} verwalten` : `${esc(s.name)} betreten`}${blocked ? ' <span class="warn">(feindlich)</span>' : ''}${battleText(' · ')}`);
  } else if (inCombat()) {
    const cb = castleBonusAt(G.s.player.x, G.s.player.y);
    showPrompt(`<span class="warn">Kampf!</span> Klicke auf Gegner oder drücke <kbd>Leertaste</kbd>${cb ? ` · Mauerschutz +${Math.round(cb.atk * 100)} % Angriff, +${Math.round(cb.def * 100)} % Abwehr` : ''}${battleText(' · ')}`);
  } else if (battleText('')) showPrompt(battleText(''));
  else showPrompt(null);
}

// Stand einer Schlacht in der Nähe
function battleText(prefix) {
  const sg = siegeStatus();
  if (sg && Math.hypot(sg.x - G.s.player.x, sg.y - G.s.player.y) < 50) {
    const st = { anmarsch: 'Anmarsch', belagerung: 'Beschuss', sturm: 'Sturm' }[sg.stage];
    const side = sg.side === 'def' ? ' · du hilfst den Verteidigern' : sg.side === 'att' ? ' · du dienst den Belagerern' : '';
    const wall = sg.wall === null ? '' : sg.wall < 0 ? ' · <span class="warn">Bresche offen</span>' : sg.stage !== 'anmarsch' ? ` · Mauer ${100 - sg.wall} %` : '';
    return `${prefix}<span class="warn">Belagerung von ${esc(sg.name)}</span> (${st}): ${esc(sg.army)} <b>${sg.att}</b> gegen die Besatzung <b>${sg.def}</b>${wall}${side}`;
  }
  const b = battleStatus();
  if (!b || Math.hypot(b.x - G.s.player.x, b.y - G.s.player.y) > 45) return '';
  return `${prefix}<span class="warn">Schlacht:</span> ${esc(b.a)} <b>${b.na}</b> gegen ${esc(b.b)} <b>${b.nb}</b>`;
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
  if (raidVictim(u)) { p.attackTarget = u; p.path = null; return true; }
  if (u.role === 'bettler') {
    if (Math.hypot(u.x - p.x, u.y - p.y) < 2.6) giveAlms(u);
    else if (setPlayerPath(u.x, u.y + 0.7)) { G.pendingAlms = u; G.pendingSite = null; }
    return true;
  }
  if (u.condemned && canRescue(u)) {
    const s = G.exec.site;
    confirmDialog(`${G.exec.h.name} vom Galgen befreien? Die Wachen von ${s.name} werden angreifen. Die ${FACTIONS[s.faction].name} sehen das gar nicht gern, die Waldleute schon.`, 'Losschneiden', () => rescueCondemned(u));
    return true;
  }
  if (!g) return false;
  if (isSiegeGroup(g) && G.siege.site.type !== 'spieler' && !G.siege.side && !g.engaged && !groupHostile(g)) {
    if (Math.hypot(u.x - p.x, u.y - p.y) < 7 || nearSiegeCamp(7)) openPanel('siege');
    else if (setPlayerPath(G.siege.camp.x, G.siege.camp.y + 1.5)) { G.pendingCamp = true; G.pendingSite = null; }
    return true;
  }
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

// Jagd mit dem Bogen
function startHunt(a) {
  const p = G.s.player;
  if (!p.st.ranged) {
    log('Zum Jagen brauchst du einen Bogen oder eine Armbrust. Leg einen unter „Gefolge“ an (Taste I).', 'bad');
    return;
  }
  const info = ANIMAL_INFO[a.kind];
  const go = () => { p.huntTarget = a; p.attackTarget = null; p.path = null; G.pendingSite = null; log(`Du legst auf ${info.name === 'Ente' ? 'die' : info.name === 'Kuh' ? 'die' : 'den'} ${info.name} an.`); };
  if (info.farm) {
    const s = G.world.sites.find((x) => x.id === a.site);
    if (s && s.type === 'spieler') { go(); return; }
    const who = s && s.faction ? `${s.name} (${FACTIONS[s.faction].short})` : 'einem Hof';
    confirmDialog(`Das Tier gehört ${who}. Viehdiebstahl kostet Ansehen (−6). Trotzdem schießen?`, 'Schießen', go);
    return;
  }
  go();
}

function clickWorld(px, py) {
  if (!G.started || panelOpen() || dialogOpen()) return;
  if (joustPress() || (G.tour && G.tour.lock)) return;
  G.pendingBuild = null;
  const u = unitAtScreen(px, py);
  if (u && clickUnit(u)) return;
  const an = animalAtScreen(px, py);
  if (an) { startHunt(an); return; }
  const wp = screenToGround(px, py);
  const p = G.s.player;
  p.attackTarget = null;
  p.huntTarget = null;
  const ba = buildingAtScreen(px, py);
  if (ba && ba.castle) { goBuilding(ba); return; }
  // Der Boden der eigenen Burg ist zum Hingehen da (dort sucht man Schutz), nur Gebäude öffnen sich
  let site = null;
  for (const s of G.world.sites) if (s.type !== 'spieler' && Math.hypot(s.x - wp.x, s.y - wp.y) < 2.5) site = s;
  G.pendingCamp = false;
  const sgc = G.siege && G.siege.stage !== 'anmarsch' && G.siege.site.type !== 'spieler' ? G.siege.camp : null;
  if (!site && sgc && Math.hypot(sgc.x - wp.x, sgc.y - wp.y) < 3.2) {
    if (nearSiegeCamp()) { openPanel('siege'); return; }
    if (setPlayerPath(sgc.x, sgc.y + 1.5)) { G.pendingCamp = true; G.pendingSite = null; G.clickMarker = { x: sgc.x, y: sgc.y + 1.5, t: 0 }; }
    return;
  }
  let tx = wp.x, ty = wp.y;
  if (site) {
    if (Math.hypot(site.x - p.x, site.y - p.y) < interactRadius(site)) { enterSite(site); return; }
    tx = site.x; ty = site.y + (site.type === 'spieler' ? 2.6 : 0.6);
  }
  G.pendingPostern = null;
  if (setPlayerPath(tx, ty)) {
    G.pendingSite = site;
    G.clickMarker = { x: tx, y: ty, t: 0 };
  } else {
    // Ziel hinter einem geschlossenen Tor: zur Pforte, hindurch, dann weiter
    const pt = posternRoute(tx, ty);
    if (pt && setPlayerPath(pt.x, pt.y)) { G.pendingPostern = { x: tx, y: ty, site }; G.pendingSite = null; G.clickMarker = { x: tx, y: ty, t: 0 }; }
  }
}

// Burgtor deiner Burg öffnen oder schließen (Taste B), nur in der Nähe der Burg
function toggleHomeGate() {
  if (!hasHomeGate()) { log(`${homeName()} hat noch kein Tor. Ab der Holzburg lässt es sich schließen.`); return; }
  const s = homeSite(), p = G.s.player;
  if (Math.hypot(s.x - p.x, s.y - p.y) > 16) { log(`Das Tor von ${homeName()} lässt sich nur vor Ort schließen oder öffnen.`); return; }
  const sg = G.siege;
  if (homeGateClosed() && sg && sg.site.type === 'spieler' && sg.stage !== 'anmarsch') {
    confirmDialog('Das Tor mitten in der Belagerung öffnen? Dann können die Angreifer durchs Tor herein.', 'Öffnen', () => setHomeGate(false));
    return;
  }
  setHomeGate(!homeGateClosed());
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

const GFX_MODES = ['klar', 'pixel', 'retro'];
const GFX_NAME = { klar: 'Klare Grafik', pixel: 'Pixel-Look', retro: 'Retro-Look (Amiga-Stil)' };

function setGfx(mode, quiet = false) {
  G.gfx = GFX_MODES.includes(mode) ? mode : 'klar';
  try { localStorage.setItem('ritter-grafik', G.gfx); } catch (e) { /* ohne Speicher */ }
  if (G.gfx !== 'klar') G.cam.zoom = Math.max(G.cam.zoom, 1.1);
  if (!quiet) log(`Grafik: ${GFX_NAME[G.gfx]}.`);
}
G.setGfx = setGfx;
G.cycleGfx = () => setGfx(GFX_MODES[(GFX_MODES.indexOf(G.gfx) + 1) % GFX_MODES.length]);

// Zoom von der Übersicht (0,45) bis ganz nah (4): Figuren füllen dann gut ein Zehntel der Bildhöhe
function zoom(f) { G.cam.zoom = Math.max(0.45, Math.min(5, G.cam.zoom * f)); }

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
    case 'music': toggleMusic(); break;
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
  if (!byId('title').hidden) return;
  if (dialogOpen()) {
    if (k === 'enter') closeDialog(true);
    if (k === 'escape') closeDialog(false);
    e.preventDefault();
    return;
  }
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (k === 'escape') { if (panelOpen()) closePanel(); else openPanel('menu'); e.preventDefault(); return; }
  if (k === 'f9') { togglePanel('cheat'); e.preventDefault(); return; }
  const panelKeys = { i: 'party', j: 'quests', p: 'politics', m: 'map', h: 'help' };
  if (panelKeys[k]) { if (k === 'h') togglePanel('help'); else tool(panelKeys[k]); e.preventDefault(); return; }
  if (panelOpen()) return;
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); return; }
  switch (k) {
    case 'e': interactHere(); break;
    case 'r': toggleRide(); break;
    case ' ': if (!joustPress()) attackNearest(); e.preventDefault(); break;
    case 'f': cycleOrder(); break;
    case '1': setOrder('folgen'); break;
    case '2': setOrder('halten'); break;
    case '3': setOrder('angriff'); break;
    case 't': toggleFast(); break;
    case 'l': toggleMusic(); break;
    case 'k': toggleSfx(); break;
    case 'g': G.cycleGfx(); break;
    case 'b': toggleHomeGate(); break;
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
    const an = u ? null : animalAtScreen(e.clientX - r.left, e.clientY - r.top);
    G.hoverAnimal = an;
    G.hoverBuilding = u || an ? null : buildingAtScreen(e.clientX - r.left, e.clientY - r.top);
    viewCanvas.style.cursor = (u && u.group) || an ? 'crosshair' : 'pointer';
  });
  viewCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
  viewCanvas.addEventListener('wheel', (e) => { e.preventDefault(); const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; zoom(Math.exp(-Math.max(-120, Math.min(120, d)) * 0.0016)); }, { passive: false });
  mini.addEventListener('click', () => tool('map'));
  byId('prompt').addEventListener('click', () => {
    if (!G.started || panelOpen() || dialogOpen()) return;
    if (joustPress()) return;
    if (inCombat()) attackNearest(); else interactHere();
  });
  for (const b of document.querySelectorAll('[data-tool]')) b.addEventListener('click', () => tool(b.dataset.tool));
  byId('btn-continue').addEventListener('click', () => { startAudio(); loadGame(); });
  byId('btn-music-title').addEventListener('click', () => { toggleMusic(); startAudio(); });
  // Browser erlauben Ton erst nach der ersten Eingabe
  const firstGesture = () => { startAudio(); window.removeEventListener('pointerdown', firstGesture); window.removeEventListener('keydown', firstGesture); };
  window.addEventListener('pointerdown', firstGesture);
  window.addEventListener('keydown', firstGesture);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.started) G.saveGame(true); });
}

function resize() {
  const r = viewCanvas.getBoundingClientRect();
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  while (dpr > 1 && r.width * r.height * dpr * dpr > 9e6) dpr = Math.max(1, dpr - 0.25);
  G.view.w = r.width; G.view.h = r.height; G.view.dpr = dpr;
  viewCanvas.width = Math.round(r.width * dpr);
  viewCanvas.height = Math.round(r.height * dpr);
}

// ---------------------------------------------------------------- Schleife
function step(dt) {
  updateTime(dt);
  updateWeather(dt);
  updateUnits(dt);
  updateGroups(dt);
  updateProjectiles(dt);
  updateAnimals(dt);
  updateDynamics(dt);
  updateTourney(dt);
  updateJustice(dt);
  updateCheats();
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

// Jede neue Fassung (etwa beim Neuladen der Artifact-Seite) beendet die Schleife der alten.
// Ein Fehler beim Zeichnen hält die Schleife nicht mehr an, sondern wird angezeigt.
const BOOT_ID = (window.__aktBoot = (window.__aktBoot || 0) + 1);
let faultShown = false;
function showFault(e) {
  console.error(e);
  if (faultShown) return;
  faultShown = true;
  const box = document.createElement('div');
  box.id = 'fault';
  box.setAttribute('role', 'alert');
  box.innerHTML = `<p><b>Hier ist etwas schiefgegangen.</b> ${esc(e && e.message ? e.message : String(e))}</p><p>Lade die Seite bitte neu. Passiert es wieder, schick diese Meldung.</p><button class="btn primary" type="button">Seite neu laden</button>`;
  box.querySelector('button').addEventListener('click', () => location.reload());
  document.body.appendChild(box);
}

function frame(now) {
  if (window.__aktBoot !== BOOT_ID) return;
  requestAnimationFrame(frame);
  try { frameBody(now); } catch (e) { showFault(e); }
}

let last = performance.now(), hudT = 0, miniT = 0;
function frameBody(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // Mittlere Bildrate: bestimmt, wie groß Schlachten werden dürfen
  if (dt > 0) G.fpsAvg = G.fpsAvg ? G.fpsAvg * 0.98 + (1 / dt) * 0.02 : 60;
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
      checkPois(dt);
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
    // Musik und Hintergrund nach Lage: Aufnahmen, wo es welche gibt, sonst die erzeugte Musik
    const fight = inCombat(), night = darkness() > 0.35;
    setMood(fight ? 'kampf' : night ? 'nacht' : 'welt');
    // Bis weitere Stücke da sind, läuft die aufgenommene Musik überall; die erzeugte nur, falls sie nicht lädt
    const season = seasonIndex();
    setScene('welt_sommer', !night && season <= 2 && precip() < 0.35 ? 'wiese_tag' : null);
  }
  if (!byId('title').hidden) {
    setMood('titel');
    setScene('welt_sommer', null);
    drawTitleScreen();
    return;
  }
  render();
  playWork(workEmitters());
  soundscape(dt);
}

// Geräusche der Welt: Feuer knistert, Glocken läuten zur sechsten, zwölften und achtzehnten Stunde, Münzen klingen
let sndT = 0, lastGold = null, lastHour = null, bellQueue = [];
function soundscape(dt) {
  if (!G.s || !G.world) return;
  const p = G.s.player, W = G.world;
  if (lastGold !== null && G.s.gold !== lastGold && !G.fast) sfx('muenzen', Math.min(1, 0.45 + Math.abs(G.s.gold - lastGold) / 300));
  lastGold = G.s.gold;
  sndT -= dt;
  if (sndT <= 0) {
    sndT = 0.22;
    let n = 0;
    for (const b of W.buildings) {
      if (!(b.fire > G.time) || Math.abs(b.x - p.x) > 16 || Math.abs(b.y - p.y) > 16) continue;
      sfxAt('knistern', b.x, b.y, 0.9, 16);
      if (++n >= 3) break;
    }
  }
  const h = Math.floor(hourOf());
  if (lastHour !== null && h !== lastHour && (h === 6 || h === 12 || h === 18) && !G.fast) {
    if (!W.churchSpots) W.churchSpots = W.buildings.filter((b) => b.kind === 'church' || (b.kind === 'landmark' && b.lm === 'kathedrale'));
    let best = null, bd = 30;
    for (const c of W.churchSpots) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = c; } }
    if (best) for (let k = 0; k < 3; k++) bellQueue.push({ at: G.time + k * 1.7, x: best.x, y: best.y });
  }
  lastHour = h;
  while (bellQueue.length && bellQueue[0].at <= G.time) { const b = bellQueue.shift(); sfxAt('glocke', b.x, b.y, 0.8, 30); }
}

// Titelbild und Vorschau zeichnen (nur solange das Startmenü offen ist)
let titleCv = null, titleCtx = null;
function drawTitleScreen() {
  let fault = null;
  try { drawTitleBackground(); } catch (e) { fault = e; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pv = byId('hero-preview');
  const pw = Math.round(pv.clientWidth * dpr) || 300;
  if (pv.width !== pw) { pv.width = pw; pv.height = Math.round(pw / 2); }
  drawHeroPreview(pv, titleColor, titleFemale, G.time);
  if (fault) throw fault;
}

function drawTitleBackground() {
  if (!titleCv || !titleCv.isConnected || !titleCtx) { titleCv = byId('title-art'); titleCtx = titleCv.getContext('2d'); }
  if (!titleCtx) throw new Error('Der Browser gibt keine Zeichenfläche für das Titelbild her (wahrscheinlich zu wenig Grafikspeicher).');
  // Höchstens etwa 9 Millionen Bildpunkte, damit auch Safari genug Grafikspeicher behält
  const w = Math.min(window.innerWidth, 4000), h = Math.min(window.innerHeight, 3000);
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  while (dpr > 1 && w * h * dpr * dpr > 9e6) dpr = Math.max(1, dpr - 0.25);
  if (titleCv.width !== Math.round(w * dpr) || titleCv.height !== Math.round(h * dpr)) { titleCv.width = Math.round(w * dpr); titleCv.height = Math.round(h * dpr); }
  titleCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawTitleArt(titleCtx, w, h, G.time, titleColor);
}

// ---------------------------------------------------------------- Boot
function boot(hotData) {
  // Speicher einer älteren Fassung im selben Fenster freigeben
  try { if (window.__aktRelease) window.__aktRelease(); } catch (e) { /* ältere Fassung ohne Aufräumen */ }
  window.__aktRelease = releaseRender;
  loadArt();
  viewCanvas = byId('view');
  mini = byId('minimap');
  initRender(viewCanvas);
  try { const v = localStorage.getItem('ritter-grafik'); G.gfx = GFX_MODES.includes(v) ? v : 'klar'; } catch (e) { G.gfx = 'klar'; }
  initUI();
  loadMusicPref();
  bindInput();
  updateMusicButtons();
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
window.__ritterPath = (x, y) => setPlayerPath(x, y);
window.__ritterWalls = () => refreshCastleBlock();
window.__ritterDebug = { castleObstacles, fieldSpots, tileToScreen, buildingAtScreen, passHours, refreshCastleHerd, dailyBalance, dailyCastle, audioDebug, startBattle, startSiege, startRaid, dailyTourney, joinTourney, giveAlms, rescueCondemned };
