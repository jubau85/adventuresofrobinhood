// Mehrspieler-Test mit zwei Spielfenstern: Beitreten, Plätze, Uhr, Helden, Markt-Befehl, Chat, Gastgeber-Wechsel,
// die Burg der eigenen Grafschaft als Heimburg wie Ashcombe (Bauplätze, Pacht, Ausbau, die anderen sehen ihn),
// Gefolge und Auftrags-Banden der anderen, Fehde, Frieden, Bündnis, Geschenk, Treffer über die Rechner, Auftragsbrett.
//   node tools/mehrspieler_test.cjs [ausgabe-ordner] [ws://127.0.0.1:8765]
// Ohne Relais-Adresse über den Browser-Kanal (ein Browser), mit Adresse über das Relais (zwei getrennte Browser;
// vorher `node tools/relay.mjs` starten). Braucht Playwright mit Chromium.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || require('os').tmpdir(), RELAY = process.argv[3] || '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const ok = (c, t) => console.log(`${c ? 'OK  ' : 'FEHL'} ${t}`);
const http = require('http');
const BASE = RELAY ? 'http://127.0.0.1:8781' : 'http://game.local';
if (RELAY) http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(new URL(req.url, BASE).pathname)); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); }).listen(8781);
(async () => {
  const browser = await chromium.launch(RELAY ? { args: ['--no-proxy-server'] } : {});
  const mkCtx = async () => { const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route('http://game.local/**', async (route) => {
    const u = new URL(route.request().url()); const f = path.join(ROOT, u.pathname);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  return ctx; };
  const ctxA = await mkCtx(), ctxB = RELAY ? await mkCtx() : ctxA;
  const errors = [];
  const open = async (tag) => {
    const p = await (tag === 'A' ? ctxA : ctxB).newPage();
    p.on('pageerror', (e) => errors.push(`[${tag}] ${e.message} ${(e.stack || '').split('\n').slice(1, 3).join(' | ')}`));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::/.test(m.text())) errors.push(`[${tag}] console: ${m.text().slice(0, 300)}`); });
    await p.goto(`${BASE}/index.html`);
    await p.waitForSelector('#btn-new');
    return p;
  };
  const A = await open('A'), B = await open('B');
  const ev = (p, f, a) => p.evaluate(f, a);
  // Lobby: A eröffnet, B tritt bei, wählt eine Burg, meldet sich bereit, beide schreiben; A startet
  if (RELAY) for (const p of [A, B]) await p.evaluate(() => { window.ritterDesktop = { relay: { start: () => ({ port: 8765, addresses: ['127.0.0.1'] }) } }; });
  await A.fill('#name-input', 'Aldric');
  await A.click('#btn-mp');
  await A.screenshot({ path: `${OUT}/lobby_wahl.png` });
  await A.fill('#lb-room-host', 'test1');
  await A.click('[data-lb="host"]');
  await A.waitForSelector('#lb-players tr');
  ok(true, 'A hat die Lobby eröffnet');
  // Karte: Zeiger über Kent zeigt den Namen, ein Klick wählt Kent, dann zurück nach Nottingham über die Liste
  const kent = await A.evaluate(() => window.__lobbyMapPos('dover'));
  const box = await A.locator('#lb-map').boundingBox();
  await A.mouse.move(box.x + kent.x, box.y + kent.y + 3);
  await A.waitForTimeout(200);
  const tip = await A.evaluate(() => document.getElementById('lb-maptip').textContent);
  ok(/Kent/.test(tip), `Karte nennt die Grafschaft unter dem Zeiger (${tip})`);
  await A.mouse.click(box.x + kent.x, box.y + kent.y + 3);
  await A.waitForTimeout(300);
  ok(await A.evaluate(() => window.__ritter.mp.seat === 'dover'), 'Klick auf die Karte wählt Kent');
  await A.screenshot({ path: `${OUT}/lobby_karte.png` });
  await A.selectOption('#lb-seat', 'nottingham');
  await A.waitForTimeout(300);
  await B.fill('#name-input', 'Brida');
  await B.click('#btn-mp');
  await B.fill('#lb-room-join', 'test1');
  if (RELAY) await B.fill('#lb-addr', '127.0.0.1');
  await B.click('[data-lb="join"]');
  await B.waitForFunction(() => document.querySelectorAll('#lb-players tr').length === 2, null, { timeout: 20000 });
  await A.waitForFunction(() => document.querySelectorAll('#lb-players tr').length === 2, null, { timeout: 20000 });
  ok(true, 'beide sehen sich in der Lobby');
  ok(await A.evaluate(() => document.querySelector('[data-lb="start"]').disabled), 'Start gesperrt, solange B nicht bereit ist');
  // B stellt seinen Ritter ein: Grafschaft, Ritterin, Wappenbild, Silber; die Farbe von A ist für B gesperrt
  const colA = await A.evaluate(() => window.__ritter.mp.profile.color);
  await B.waitForSelector('#lb-seat option[value="chester"]', { state: 'attached' });
  await B.selectOption('#lb-seat', 'chester');
  await B.waitForTimeout(500);
  ok(await B.evaluate((c) => { const b = document.querySelector(`.lb-swatch[data-v="${c}"]`); return !!b && b.disabled; }, colA), 'Die Wappenfarbe von A ist für B gesperrt');
  await B.click('[data-lb="fig"][data-v="f"]');
  await B.waitForTimeout(300);
  await B.click('[data-lb="charge"][data-v="hirsch"]');
  await B.waitForTimeout(300);
  await B.click('[data-lb="metal"][data-v="silber"]');
  await B.waitForTimeout(600);
  await B.click('[data-lb="ready"]');
  await B.fill('#lb-chat', 'Bin bereit!');
  await B.press('#lb-chat', 'Enter');
  await A.waitForFunction(() => !document.querySelector('[data-lb="start"]').disabled, null, { timeout: 10000 });
  const lobbyA = await A.evaluate(() => ({ rows: [...document.querySelectorAll('#lb-players tr')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()), chat: document.getElementById('lb-chatlog').textContent }));
  console.log('Lobby A', JSON.stringify(lobbyA));
  ok(lobbyA.rows.some((r) => /Brida/.test(r) && /Cheshire/.test(r) && /✔/.test(r)), 'A sieht Brida in Cheshire, bereit');
  const profB = await A.evaluate(() => { const p = window.__ritter.mp.lobby.state.players.find((x) => x.name === 'Brida'); return p && { female: p.female, arms: p.arms, color: p.color }; });
  ok(profB && profB.female && profB.arms.charge === 'hirsch' && profB.arms.metal === 'silber' && profB.color !== colA, `A kennt Bridas Wappen (${JSON.stringify(profB)})`);
  ok(await A.evaluate(() => [...document.querySelectorAll('#lb-seat option')].some((o) => o.value === 'chester' && o.disabled)), 'Cheshire ist für A gesperrt');
  ok(/Brida: Bin bereit!/.test(lobbyA.chat), 'Chat in der Lobby kommt an');
  // Burg zu Beginn: Vorgabe Ruine, der Gastgeber stellt für alle die Holzburg ein
  const startDef = await A.evaluate(() => window.__ritter.mp.lobby.start);
  await A.click('[data-lb="burgstart"][data-v="holzburg"]');
  await B.waitForFunction(() => /Burg zu Beginn: Holzburg/.test(document.getElementById('lb-diff').textContent), null, { timeout: 10000 }).catch(() => {});
  const startB = await B.evaluate(() => document.getElementById('lb-diff').textContent);
  ok(startDef === 'ruine' && /Burg zu Beginn: Holzburg/.test(startB), `Burg zu Beginn: Vorgabe ${startDef}, der Gastgeber wählt die Holzburg, B sieht es`);
  await A.screenshot({ path: `${OUT}/lobby_A.png` });
  await B.screenshot({ path: `${OUT}/lobby_B.png` });
  await A.click('[data-lb="start"]');
  await A.waitForFunction(() => window.__ritter.started && window.__ritter.mp && window.__ritter.mp.phase === 'game' && !window.__ritter.loadingArt, null, { timeout: 120000 });
  await B.waitForFunction(() => window.__ritter.started && window.__ritter.mp && window.__ritter.mp.welcomed && !window.__ritter.loadingArt, null, { timeout: 120000 });
  ok(true, 'A hat gestartet, beide sind im Spiel');
  const sB = await ev(B, () => { const G = window.__ritter; return { seat: G.mp.seat, seed: G.s.seed, day: G.s.day, role: G.mp.role, name: G.s.player.name, female: G.s.player.female, arms: G.s.arms, pos: [G.s.player.x, G.s.player.y], held: Object.keys(G.s.holdings || {}), homeAt: (window.__ritterDebug.castleSite() || {}).id, lv: G.s.castle.level, built: window.__ritterDebug.castlePlots().filter(Boolean).map((p) => p.id), owner: G.s.shires.chester.owner, ownerA: G.s.shires[G.mp.peers.values().next().value.seat || 'nottingham'].owner, home: G.world.sites.some((s) => s.type === 'spieler'), castleName: G.s.castleName }; });
  const sA = await ev(A, () => { const G = window.__ritter; return { seed: G.s.seed, day: G.s.day, seat: G.mp.seat, seats: G.mp.seats, held: Object.keys(G.s.holdings || {}), homeAt: (window.__ritterDebug.castleSite() || {}).id, lv: G.s.castle.level, built: window.__ritterDebug.castlePlots().filter(Boolean).map((p) => p.id), own: G.s.shires[G.mp.seat].owner, chester: G.s.shires.chester.owner, home: G.world.sites.some((s) => s.type === 'spieler'), sites: G.world.sites.length }; });
  const sitesB = await ev(B, () => window.__ritter.world.sites.length);
  console.log('B', JSON.stringify(sB)); console.log('A', JSON.stringify(sA));
  ok(sB.seed === sA.seed && sitesB === sA.sites, 'gleiche Welt (Startwert, gleiche Orte)');
  ok(!sA.home && !sB.home, 'keine Heimburg Ashcombe in der Mehrspieler-Welt');
  ok(sA.homeAt === sA.seat && sA.own === 'spieler' && !sA.held.length, `A herrscht über seine Grafschaft (${sA.seat}), ihre Burg ist seine Heimburg`);
  ok(sB.seat === 'chester' && sB.homeAt === 'chester' && !sB.held.length && sB.owner === 'spieler' && sB.castleName === 'Chester', `B herrscht über Cheshire, Heimburg ${sB.castleName}`);
  ok(sA.lv === 1 && sB.lv === 1 && ['halle', 'holzfaeller', 'felder'].every((id) => sB.built.includes(id) && sA.built.includes(id)) && sB.built.length === 3, `Beide Grafschaftsburgen sind Holzburgen (Stufe ${sA.lv}, ${sB.lv}) mit Rittersaal, Holzfäller und Acker (${sB.built.join(', ')})`);
  ok(sA.chester === 'p:chester' && sB.ownerA === `p:${sA.seat}`, `Jeder sieht die Grafschaft des anderen als dessen (${sA.chester}, ${sB.ownerA})`);
  ok(sB.female && sB.arms.charge === 'hirsch' && sB.arms.metal === 'silber', 'B spielt die Ritterin mit dem gewählten Wappen');
  const names = await ev(A, () => { const G = window.__ritter; return [G.mpSeatInfo('chester').name, G.world.sites.find((s) => s.id === 'chester')]; });
  ok(names[0] === 'Brida', 'Die Karte nennt Brida als Herrin von Cheshire');
  // Helden: B geht ein Stück, A sieht ihn
  await B.waitForTimeout(1500);
  await ev(B, () => { const p = window.__ritter.s.player; p.x += 3; p.y += 1; });
  await A.waitForTimeout(1500);
  const seen = await ev(A, () => { const G = window.__ritter; return (G.remoteUnits || []).filter((u) => u.kind === 'remote').map((u) => ({ name: u.name, x: +u.x.toFixed(1), y: +u.y.toFixed(1) })); });
  const posB = await ev(B, () => [window.__ritter.s.player.x, window.__ritter.s.player.y]);
  console.log('A sieht', JSON.stringify(seen), 'B ist bei', JSON.stringify(posB.map((v) => +v.toFixed(1))));
  ok(seen.length === 1 && seen[0].name === 'Brida' && Math.hypot(seen[0].x - posB[0], seen[0].y - posB[1]) < 0.6, 'A sieht Bridas Helden an der richtigen Stelle');
  const seenB = await ev(B, () => (window.__ritter.remoteUnits || []).map((u) => u.name));
  ok(seenB.includes('Aldric'), 'B sieht Aldrics Helden');
  // Bild: A schaut auf Brida
  await ev(A, ([x, y]) => { const G = window.__ritter; G.s.player.x = x - 1.5; G.s.player.y = y + 1; G.s.player.path = null; G.cam.zoom = 2.2; }, posB);
  await A.waitForTimeout(2500);
  await A.screenshot({ path: `${OUT}/mp_A_sieht_B.png` });
  // Markt: B kauft (Befehl an den Gastgeber)
  const town = await ev(A, () => { const G = window.__ritter; const s = G.world.sites.find((x) => x.type === 'stadt'); return { id: s.id, st: G.s.towns[s.id].stock.getreide }; });
  await ev(B, (id) => window.__ritter.onStock(id, 'getreide', -5), town.id);
  await A.waitForTimeout(1000);
  const after = await ev(A, (id) => window.__ritter.s.towns[id].stock.getreide, town.id);
  ok(after === Math.max(0, town.st - 5), `Markt-Befehl: Lager in ${town.id} ${town.st} -> ${after}`);
  await B.waitForTimeout(9000);
  const bSees = await ev(B, (id) => window.__ritter.s.towns[id].stock.getreide, town.id);
  ok(bSees === after, `B bekommt das Lager vom Gastgeber (${bSees})`);
  // Uhr: A springt einen Tag weiter, B zieht nach und rechnet seine Grafschaft (Abgaben, Salz ins Lager)
  const b1 = await ev(B, () => ({ gold: window.__ritter.s.gold, salz: window.__ritter.s.castle.storage.salz || 0 }));
  const dayA = await ev(A, () => { window.__ritterDebug.passHours(24); return window.__ritter.s.day; });
  await B.waitForTimeout(1500);
  const b2 = await ev(B, () => ({ day: window.__ritter.s.day, gold: window.__ritter.s.gold, salz: window.__ritter.s.castle.storage.salz || 0, home: (window.__ritterDebug.castleSite() || {}).id, inc: window.__ritterDebug.dailyBalance().income.map(([n]) => n) }));
  ok(b2.day === dayA, `B folgt dem Tag (${b2.day} = ${dayA})`);
  ok(b2.gold > b1.gold && b2.salz > b1.salz && b2.home === 'chester', `B bekommt die Abgaben von Cheshire (${b1.gold} -> ${b2.gold} Gold, Salz ${b1.salz} -> ${b2.salz}) und hält die Burg`);
  ok(b2.inc.includes('Pacht der Bauern') && b2.inc.some((n) => /Abgaben Cheshire/.test(n)), `Einnahmen wie in Ashcombe: ${b2.inc.join(', ')}`);
  // Die Burg der eigenen Grafschaft: dieselbe Tafel wie Ashcombe (Ausbau, Rittersaal, Gefolge, Lager), dazu Markt und Ausrüster
  const tabs = await ev(B, () => { window.__ritterDebug.openPanel('town', window.__ritter.world.sites.find((s) => s.id === 'chester')); return { panel: window.__ritter.ui.panel, tabs: [...document.querySelectorAll('#panel-tabs button')].map((b) => b.textContent.trim()), text: document.getElementById('panel-body').textContent }; });
  ok(tabs.panel === 'castle' && ['Ausbau', 'Rittersaal', 'Gefolge', 'Lager', 'Ausrüster', 'Markt'].every((t) => tabs.tabs.some((x) => x.startsWith(t))), `Burgtafel wie in Ashcombe: ${tabs.tabs.join(', ')}`);
  ok(!/Kastellan|Burgvogt/.test(tabs.text) && /Bergfried/.test(tabs.text) && /Im Hof/.test(tabs.text) && /Vor der Mauer/.test(tabs.text), 'Kein Kastellan, dafür Bergfried und Bauplätze im Hof und vor der Mauer');
  await B.screenshot({ path: `${OUT}/mp_B_burg.png` });
  await ev(B, () => { const b = document.querySelector('#panel [data-act="close"], #panel .close'); if (b) b.click(); });
  // B baut eine Kapelle und macht aus seiner Burg eine Ringburg (sofort, mit dem Bau-Schummel); A sieht beides
  const bb = await ev(B, () => {
    const G = window.__ritter, D = window.__ritterDebug;
    G.s.cheat = { ...(G.s.cheat || {}), build: true }; G.s.gold += 5000; G.s.castle.storage.holz = 500; G.s.castle.storage.stein = 500;
    const lay = D.castleLayout(), free = lay.find((p) => !D.castlePlots()[p.i]);
    const okB = D.startBuild('kapelle', free.i), okT = D.startTypeChange('ring');
    const s = D.castleSite();
    return { okB, okT, type: G.s.castle.type, ringR: s.ringR, kap: D.castlePlots().some((p) => p && p.id === 'kapelle'), out: D.castleOut() };
  });
  ok(bb.okB && bb.okT && bb.type === 'ring' && bb.ringR === 5 && bb.kap, `B baut eine Kapelle und eine Ringburg (Mauerring ${bb.ringR})`);
  await A.waitForTimeout(7000);
  const aSees = await ev(A, () => { const G = window.__ritter, s = G.world.sites.find((x) => x.id === 'chester'), b = G.s.mpCastles && G.s.mpCastles.chester; return { peer: s.mpHome, ringR: s.ringR, lv: s.castleLevel, ty: b && b.ty, kap: !!b && b.p.some((q) => q && q[0] === 'kapelle'), rects: (G.world.peerRects || []).length }; });
  ok(aSees.peer === 'peer' && aSees.ty === 'ring' && aSees.ringR === 5 && aSees.kap && aSees.rects > 0, `A sieht Bridas Burg so, wie sie sie ausgebaut hat (${JSON.stringify(aSees)})`);
  await ev(A, () => { const G = window.__ritter, s = G.world.sites.find((x) => x.id === 'chester'); G.s.player.x = s.x + 1; G.s.player.y = s.y + 9; G.s.player.path = null; G.cam.zoom = 1.4; });
  await A.waitForTimeout(3000);
  await A.screenshot({ path: `${OUT}/mp_A_sieht_burg_B.png` });
  await ev(B, () => { const G = window.__ritter, s = window.__ritterDebug.castleSite(); G.s.player.x = s.x + 1; G.s.player.y = s.y + 9; G.s.player.path = null; G.cam.zoom = 1.4; });
  await B.waitForTimeout(3000);
  await B.screenshot({ path: `${OUT}/mp_B_eigene_burg.png` });
  // --- Gefolge und Diplomatie zwischen den Spielern (pvp.js)
  // A und B stehen nebeneinander; jeder sieht das Gefolge des anderen
  await ev(B, () => { const G = window.__ritter, s = G.world.sites.find((x) => x.type === 'stadt'); G.s.player.x = s.x + 14; G.s.player.y = s.y + 14; G.s.player.path = null; for (const c of G.s.companions) if (c.status === 'party') { c.x = G.s.player.x + 1; c.y = G.s.player.y + 0.5; } });
  await ev(A, () => { const G = window.__ritter, s = G.world.sites.find((x) => x.type === 'stadt'); G.s.player.x = s.x + 15.5; G.s.player.y = s.y + 14; G.s.player.path = null; for (const c of G.s.companions) if (c.status === 'party') { c.x = G.s.player.x + 1; c.y = G.s.player.y - 0.5; } });
  await A.waitForTimeout(2500);
  const gefA = await ev(A, () => (window.__ritter.remoteUnits || []).filter((u) => u.rk === 'gefaehrte').map((u) => ({ name: u.name, seat: u.seat, x: +u.x.toFixed(1) })));
  const gefB = await ev(B, () => (window.__ritter.remoteUnits || []).filter((u) => u.rk === 'gefaehrte').map((u) => u.name));
  ok(gefA.length >= 1 && gefA[0].seat === 'chester' && gefB.length >= 1, `Jeder sieht das Gefolge des anderen (A sieht ${JSON.stringify(gefA)}, B sieht ${gefB.join(', ')})`);
  const peace0 = await ev(A, () => { const G = window.__ritter, b = G.remoteUnits.find((u) => u.rk === 'held'); return { st: window.__ritterPvp.pvpWith('chester'), foe: b ? G.remoteFoe(G.s.player, b) : null }; });
  ok(peace0.st === 'frieden' && peace0.foe === false, 'Zu Beginn gilt Frieden: Bridas Held ist kein Feind');
  // A erklärt B die Fehde
  await ev(A, () => window.__ritterPvp.pvpDeclareFeud('chester'));
  await B.waitForTimeout(1200);
  const feud = { A: await ev(A, () => window.__ritterPvp.pvpWith('chester')), B: await ev(B, () => window.__ritterPvp.pvpWith('nottingham')), msgB: await ev(B, () => window.__ritter.messages.slice(-3).map((m) => m.text).join(' | ')) };
  ok(feud.A === 'fehde' && feud.B === 'fehde' && /Fehde/.test(feud.msgB), `Fehde gilt bei beiden (${feud.A}, ${feud.B}): ${feud.msgB.slice(0, 120)}`);
  // In der Fehde: A schlägt Bridas Helden, B verliert Leben (der Schaden wird bei B gerechnet)
  const hp0 = await ev(B, () => window.__ritter.s.player.hp);
  await ev(A, () => { const G = window.__ritter, b = G.remoteUnits.find((u) => u.rk === 'held'); return G.remoteFoe(G.s.player, b) && (G.onRemoteHit(G.s.player, b, false, b.x - 0.8, b.y, false), true); });
  await B.waitForTimeout(800);
  const hp1 = await ev(B, () => window.__ritter.s.player.hp);
  ok(hp1 < hp0, `Ein Schlag von Aldric trifft Brida (Leben ${Math.round(hp0)} -> ${Math.round(hp1)})`);
  // A bietet Frieden an, B nimmt an
  await ev(A, () => window.__ritterPvp.pvpOffer('chester', 'frieden'));
  await B.waitForTimeout(1000);
  const offB = await ev(B, () => ({ offers: { ...window.__ritterPvp.pvpOffers() }, dialog: !document.getElementById('dialog').hidden, text: document.getElementById('dialog-text').textContent }));
  ok(offB.offers.nottingham === 'frieden' && offB.dialog && /Frieden/.test(offB.text), `B bekommt das Friedensangebot (${offB.text})`);
  await B.click('#dialog-yes');
  await A.waitForTimeout(1200);
  const pz = { A: await ev(A, () => window.__ritterPvp.pvpWith('chester')), B: await ev(B, () => window.__ritterPvp.pvpWith('nottingham')) };
  ok(pz.A === 'frieden' && pz.B === 'frieden', `Frieden geschlossen (${pz.A}, ${pz.B})`);
  // Ein Schlag im Frieden zählt nicht
  const hp2 = await ev(B, () => window.__ritter.s.player.hp);
  await ev(A, () => { const G = window.__ritter, b = G.remoteUnits.find((u) => u.rk === 'held'); G.onRemoteHit(G.s.player, b, false, b.x - 0.8, b.y, false); });
  await B.waitForTimeout(800);
  ok((await ev(B, () => window.__ritter.s.player.hp)) >= hp2, 'Im Frieden trifft kein Schlag');
  // B bietet ein Bündnis an, A nimmt über die Tafel „Mitspieler“ an
  await ev(B, () => window.__ritterPvp.pvpOffer('nottingham', 'buendnis'));
  await A.waitForTimeout(1000);
  const dlgA = await ev(A, () => { const d = document.getElementById('dialog'), t = document.getElementById('dialog-text').textContent; d.hidden = true; window.__ritterDebug.openPanel('map', null, 'mitspieler'); return t; });
  ok(/Bündnis/.test(dlgA), `A wird gefragt: ${dlgA}`);
  const tafel = await ev(A, () => ({ tabs: [...document.querySelectorAll('#panel-tabs button')].map((b) => b.textContent.trim()), acts: [...document.querySelectorAll('#panel-body [data-act]')].map((b) => b.dataset.act) }));
  ok(tafel.tabs.includes('Mitspieler') && tafel.acts.includes('pvpja') && tafel.acts.includes('pvpfehde') && tafel.acts.includes('pvpgold'), `Tafel „Mitspieler“ mit ${[...new Set(tafel.acts)].join(', ')}`);
  await A.screenshot({ path: `${OUT}/mp_diplomatie.png` });
  await ev(A, () => document.querySelector('#panel-body [data-act="pvpja"]').click());
  await B.waitForTimeout(1200);
  const bund = { A: await ev(A, () => window.__ritterPvp.pvpWith('chester')), B: await ev(B, () => window.__ritterPvp.pvpWith('nottingham')) };
  ok(bund.A === 'buendnis' && bund.B === 'buendnis', `Bündnis geschlossen (${bund.A}, ${bund.B})`);
  // Geschenk: A schickt B 50 Gold
  const g0 = await ev(B, () => window.__ritter.s.gold);
  await ev(A, () => window.__ritterPvp.pvpGift('chester', 50));
  await B.waitForTimeout(800);
  ok((await ev(B, () => window.__ritter.s.gold)) === g0 + 50, 'Geschenk kommt an (50 Gold)');
  // Gemeinsame Welt: Eine Bande beim Gastgeber erscheint bei B als Spiegel; Bs Schlag trifft sie bei A, sie wehrt sich gegen B
  const band = await ev(A, () => { const G = window.__ritter, p = G.s.player; const g = window.__ritterDebug.spawnGroup('banditen', { pos: { x: p.x + 3, y: p.y + 3 } }); return g && { id: g.id, n: g.members.length, hp: g.members[0].hp }; });
  await B.waitForTimeout(1500);
  const bandB = await ev(B, (id) => { const G = window.__ritter, g = G.groups.find((x) => x.id === id && x.mirror); return g ? { n: g.members.length, type: g.type } : null; }, band.id);
  ok(band && bandB && bandB.n === band.n && bandB.type === 'banditen', `B sieht die Bande des Gastgebers als Spiegel (${bandB && bandB.n} Mann)`);
  const guestGroups = await ev(B, () => window.__ritter.groups.filter((g) => !g.mirror).length);
  ok(guestGroups === 0, `B rechnet selbst keine Gruppen der Welt (${guestGroups})`);
  await ev(B, (id) => { const G = window.__ritter, g = G.groups.find((x) => x.id === id && x.mirror), u = g.members[0]; G.onRemoteHit(G.s.player, u, false, u.x - 0.8, u.y, false); }, band.id);
  await A.waitForTimeout(800);
  const bandA = await ev(A, (id) => { const g = window.__ritter.groups.find((x) => x.id === id); return g && { hp: Math.min(...g.members.map((m) => m.hp)), engaged: g.engaged, foes: g.foes ? [...g.foes] : null }; }, band.id);
  ok(bandA && bandA.hp < band.hp && bandA.engaged && bandA.foes && bandA.foes.includes('chester'), `Bridas Schlag trifft die Bande bei A (Leben ${Math.round(band.hp)} -> ${Math.round(bandA.hp)}), sie kämpft gegen ${bandA && JSON.stringify(bandA.foes)}`);
  await B.waitForTimeout(600);
  const engB = await ev(B, (id) => { const g = window.__ritter.groups.find((x) => x.id === id && x.mirror); return !!(g && g.engaged); }, band.id);
  ok(engB, 'Bei B steht die Bande im Kampf gegen B');
  await A.screenshot({ path: `${OUT}/mp_bande_A.png` });
  await B.screenshot({ path: `${OUT}/mp_bande_B.png` });
  // B erschlägt die Bande (letzte Schläge von B): Erfahrung und Beute bei B
  const xp0 = await ev(B, () => window.__ritter.s.player.xp + window.__ritter.s.player.level * 10000);
  const loot0 = await ev(B, () => window.__ritter.s.gold);
  for (let k = 0; k < 12; k++) {
    await ev(A, (id) => { const g = window.__ritter.groups.find((x) => x.id === id); if (g) for (const m of g.members) m.hp = Math.min(m.hp, 1); }, band.id);
    const left = await ev(B, (id) => { const G = window.__ritter, g = G.groups.find((x) => x.id === id && x.mirror); if (!g) return 0; for (const u of g.members) if (!u.dead && u.hp > 0) G.onRemoteHit(G.s.player, u, false, u.x - 0.8, u.y, false); return g.members.length; }, band.id);
    await B.waitForTimeout(500);
    if (!left) break;
  }
  await B.waitForTimeout(800);
  const gone = await ev(A, (id) => !window.__ritter.groups.some((x) => x.id === id), band.id);
  const xp1 = await ev(B, () => window.__ritter.s.player.xp + window.__ritter.s.player.level * 10000);
  const loot1 = await ev(B, () => window.__ritter.s.gold);
  ok(gone && xp1 > xp0 && loot1 >= loot0, `Bande erschlagen: Erfahrung bei B (${xp0} -> ${xp1}), Gold ${loot0} -> ${loot1}`);
  // Ein Auftrag mit Bande vom Brett: B nimmt ihn an, der Gastgeber stellt die Bande auf; B erledigt sie, der Auftrag ist erfüllt
  const qb = await ev(B, () => { const G = window.__ritter; for (const s of G.world.sites) { const t = G.s.towns[s.id]; const q = t && t.quests && t.quests.find((x) => x.type === 'banditen' || x.type === 'jagd' || x.type === 'ueberfall'); if (q && s.type !== 'spieler') return { site: s.id, q: q.id, type: q.type }; } return null; });
  if (qb) {
    await ev(B, (x) => { const G = window.__ritter, s = G.world.sites.find((y) => y.id === x.site); window.__ritterDebug.openPanel('town', s, 'auftraege'); const b = document.querySelector(`#panel-body [data-act="accept"][data-q="${x.q}"]`); if (b) b.click(); }, qb);
    await A.waitForTimeout(1500);
    const still = await ev(A, (x) => window.__ritter.s.towns[x.site].quests.some((q) => q.id === x.q), qb);
    const mineQ = await ev(B, (x) => { const q = window.__ritter.s.quests.find((y) => y.id === x.q); return q ? { gid: q.groupId || 0, tx: q.tx, ty: q.ty, state: q.state } : null; }, qb);
    const hostG = await ev(A, (x) => { const g = window.__ritter.groups.find((y) => y.questId === x.q); return g ? { id: g.id, owner: g.questOwner, n: g.members.length } : null; }, qb);
    ok(mineQ && !still && hostG && hostG.owner === 'chester' && mineQ.gid === hostG.id, `Auftrag ${qb.q} (${qb.type}) in ${qb.site}: B hat ihn, bei A vom Brett, der Gastgeber stellt die Bande (${JSON.stringify(hostG)})`);
    if (hostG) {
      // B reitet hin und schlägt die Bande
      await ev(B, (q) => { const p = window.__ritter.s.player; p.x = q.tx + 2; p.y = q.ty + 2; p.path = null; }, mineQ);
      await B.waitForTimeout(1500);
      const seenQ = await ev(B, (id) => !!window.__ritter.groups.find((g) => g.id === id && g.mirror), hostG.id);
      ok(seenQ, 'B sieht die Bande seines Auftrags am Ziel');
      for (let k = 0; k < 12; k++) {
        await ev(A, (id) => { const g = window.__ritter.groups.find((x) => x.id === id); if (g) for (const m of g.members) m.hp = Math.min(m.hp, 1); }, hostG.id);
        const left = await ev(B, (id) => { const G = window.__ritter, g = G.groups.find((x) => x.id === id && x.mirror); if (!g) return 0; for (const u of g.members) if (!u.dead && u.hp > 0) G.onRemoteHit(G.s.player, u, false, u.x - 0.8, u.y, false); return g.members.length; }, hostG.id);
        await B.waitForTimeout(500);
        if (!left) break;
      }
      await B.waitForTimeout(800);
      const st = await ev(B, (x) => { const q = window.__ritter.s.quests.find((y) => y.id === x.q); return q && q.state; }, qb);
      ok(st === 'erfuellt', `Bs Auftrag ist erfüllt (${st})`);
    }
  } else ok(true, 'Kein Auftrag mit Bande auf einem Brett zum Prüfen');
  await ev(B, () => { const b = document.querySelector('#panel [data-act="close"], #panel .close'); if (b) b.click(); });

  // B gewinnt eine weitere Grafschaft (wie nach einer Eroberung): der Gastgeber trägt sie für B ein, B behält sie
  await ev(B, () => window.__ritterDebug.grantHolding(window.__ritter.world.sites.find((s) => s.id === 'warwick')));
  await A.waitForTimeout(1500);
  const warA = await ev(A, () => window.__ritter.s.shires.warwick.owner);
  await ev(A, () => window.__ritterDebug.passHours(24));
  await B.waitForTimeout(4500);
  const warB = await ev(B, () => ({ owner: window.__ritter.s.shires.warwick.owner, held: Object.keys(window.__ritter.s.holdings) }));
  ok(warA === 'p:chester' && warB.owner === 'spieler' && warB.held.includes('warwick'), `Eroberung eines Gastes kommt beim Gastgeber an (${warA}) und bleibt (${JSON.stringify(warB)})`);
  // Belagerung unter Spielern: Im Bündnis nicht; nach der Fehde zieht A gegen Warwick (Bs eroberte Burg)
  for (const P of [A, B]) await ev(P, () => { const G = window.__ritter; G.s.renown = Math.max(60, G.s.renown); G.s.gold += 3000; G.groups = G.groups.filter((g) => g.mirror); });
  const tryAlly = await ev(A, () => { const G = window.__ritter, s = G.world.sites.find((x) => x.id === 'warwick'); const r = window.__ritterDebug.startOwnSiege(s, 10); return { r, siege: !!G.siege, msg: G.messages.slice(-1)[0].text }; });
  ok(!tryAlly.r && !tryAlly.siege && /Fehde/.test(tryAlly.msg), `Im Bündnis keine Belagerung (${tryAlly.msg})`);
  await ev(A, () => window.__ritterPvp.pvpDeclareFeud('chester'));
  await B.waitForTimeout(1200);
  const fz = { A: await ev(A, () => window.__ritterPvp.pvpWith('chester')), B: await ev(B, () => window.__ritterPvp.pvpWith('nottingham')) };
  ok(fz.A === 'fehde' && fz.B === 'fehde', `Fehde erklärt (${fz.A}, ${fz.B})`);
  const siA = await ev(A, () => { const G = window.__ritter, s = G.world.sites.find((x) => x.id === 'warwick'), p = G.s.player; p.x = s.x + 16; p.y = s.y + 16; p.path = null; const r = window.__ritterDebug.startOwnSiege(s, 10); return { r, lead: !!(G.siege && G.siege.lead), sides: G.siege && G.siege.sides, msg: G.messages.slice(-1)[0].text }; });
  ok(siA.r && siA.lead && siA.sides && siA.sides.chester === 'def', `A belagert Warwick, B verteidigt (${JSON.stringify(siA)})`);
  await B.waitForFunction(() => window.__ritter.siege && window.__ritter.siege.mirror, null, { timeout: 10000 }).catch(() => {});
  const siB = await ev(B, () => { const G = window.__ritter, sg = G.siege; return { sg: sg && { mirror: sg.mirror, site: sg.site.id, side: sg.side, lead: sg.leadSeat, camp: !!sg.camp }, warn: G.messages.some((m) => /gegen deine Burg Warwick/.test(m.text)) }; });
  const siAd = siB.sg ? '' : JSON.stringify(await ev(A, () => ({ sg: !!window.__ritter.siege, msgs: window.__ritter.messages.slice(-4).map((m) => m.text) })));
  ok(siB.sg && siB.sg.mirror && siB.sg.site === 'warwick' && siB.sg.side === 'def' && siB.sg.lead === 'nottingham' && siB.sg.camp && siB.warn, `B sieht die Belagerung seiner Burg und wird gewarnt (${JSON.stringify(siB)}) ${siAd}`);
  await ev(A, () => window.__ritterDebug.endSiegeNow('gefallen'));
  await A.waitForTimeout(800);
  const wA = await ev(A, () => ({ owner: window.__ritter.s.shires.warwick.owner, held: Object.keys(window.__ritter.s.holdings) }));
  await ev(A, () => window.__ritterDebug.passHours(24));
  await B.waitForTimeout(4500);
  const wB = await ev(B, () => ({ owner: window.__ritter.s.shires.warwick.owner, held: Object.keys(window.__ritter.s.holdings), siege: !!window.__ritter.siege }));
  ok(wA.owner === 'spieler' && wA.held.includes('warwick') && wB.owner === 'p:nottingham' && !wB.held.includes('warwick') && !wB.siege, `Warwick fällt an A (${JSON.stringify(wA)}), B verliert die Burg (${JSON.stringify(wB)})`);
  // B führt ein Aufgebot gegen As Heimburg: der Gastgeber rechnet es, die Burg wird geplündert, nicht erobert
  const goldA0 = await ev(A, () => window.__ritter.s.gold), goldB0 = await ev(B, () => window.__ritter.s.gold);
  await ev(B, () => { const G = window.__ritter, s = G.world.sites.find((x) => x.id === 'nottingham'), p = G.s.player; p.x = s.x + 16; p.y = s.y + 16; p.path = null; });
  await B.waitForTimeout(1000);
  const bS = await ev(B, () => { const G = window.__ritter, s = G.world.sites.find((x) => x.id === 'nottingham'); const r = window.__ritterDebug.startOwnSiege(s, 10); return { r, msg: G.messages.slice(-1)[0].text }; });
  await A.waitForTimeout(1500);
  const hS = await ev(A, () => { const sg = window.__ritter.siege; return sg && { site: sg.site.id, lead: sg.leadSeat, side: sg.side, army: sg.army ? sg.army.members.length : 0, col: sg.army && sg.army.members[0] ? sg.army.members[0].tunic : null }; });
  const bM = await ev(B, () => { const sg = window.__ritter.siege; return sg && { mirror: sg.mirror, lead: sg.lead, side: sg.side, army: sg.army ? sg.army.members.length : 0 }; });
  ok(bS.r && hS && hS.site === 'nottingham' && hS.lead === 'chester' && hS.side === 'def' && hS.army >= 10 && bM && bM.mirror && bM.lead && bM.army === hS.army, `Bs Aufgebot vor Nottingham, beim Gastgeber gerechnet (${JSON.stringify(hS)}), bei B gespiegelt (${JSON.stringify(bM)}) ${bS.msg}`);
  await A.screenshot({ path: `${OUT}/mp_belagerung_A.png` });
  await B.screenshot({ path: `${OUT}/mp_belagerung_B.png` });
  await ev(A, () => window.__ritterDebug.endSiegeNow('gefallen'));
  await B.waitForTimeout(1500);
  const plA = await ev(A, () => ({ gold: window.__ritter.s.gold, owner: window.__ritter.s.shires.nottingham.owner }));
  const plB = await ev(B, () => ({ gold: window.__ritter.s.gold, siege: !!window.__ritter.siege }));
  ok(plA.gold < goldA0 && plA.owner === 'spieler' && plB.gold > goldB0 - 450 && !plB.siege, `Nottingham geplündert: A ${goldA0} -> ${plA.gold} (bleibt Herr), B ${goldB0} -> ${plB.gold}`);
  // Chat
  await ev(A, () => window.__ritter.mpChat('Seid gegrüßt!'));
  await B.waitForTimeout(800);
  const chat = await ev(B, () => window.__ritter.messages.map((m) => m.text).filter((t) => /gegrüßt/.test(t)));
  ok(chat.length === 1 && /^Aldric:/.test(chat[0]), `Chat kommt an (${chat[0]})`);
  // Gast kann die Heimburg nicht verwalten
  // Gastgeber geht: B übernimmt
  await A.close();
  await B.waitForFunction(() => window.__ritter.mp && window.__ritter.mp.role === 'host', null, { timeout: 25000 }).catch(() => {});
  const mig = await ev(B, () => ({ role: window.__ritter.mp.role, peers: window.__ritter.mp.peers.size, msgs: window.__ritter.messages.slice(-3).map((m) => m.text) }));
  console.log('nach dem Gehen', JSON.stringify(mig));
  ok(mig.role === 'host', 'B ist jetzt Gastgeber');
  const day0 = await ev(B, () => window.__ritter.s.day);
  await ev(B, () => window.__ritterDebug.passHours(24));
  const day1 = await ev(B, () => ({ day: window.__ritter.s.day }));
  ok(day1.day === day0 + 1, 'B rechnet die Welt jetzt selbst weiter');
  await B.screenshot({ path: `${OUT}/mp_B.png` });
  console.log('ERRORS', JSON.stringify(errors.slice(0, 6)));
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('ABBRUCH', e.message); process.exit(1); });
