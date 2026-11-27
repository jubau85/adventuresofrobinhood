// Mehrspieler-Test mit zwei Spielfenstern: Beitreten, Plätze, Uhr, Helden, Markt-Befehl, Chat, Gastgeber-Wechsel.
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
  await A.screenshot({ path: `${OUT}/lobby_A.png` });
  await B.screenshot({ path: `${OUT}/lobby_B.png` });
  await A.click('[data-lb="start"]');
  await A.waitForFunction(() => window.__ritter.started && window.__ritter.mp && window.__ritter.mp.phase === 'game' && !window.__ritter.loadingArt, null, { timeout: 120000 });
  await B.waitForFunction(() => window.__ritter.started && window.__ritter.mp && window.__ritter.mp.welcomed && !window.__ritter.loadingArt, null, { timeout: 120000 });
  ok(true, 'A hat gestartet, beide sind im Spiel');
  const sB = await ev(B, () => { const G = window.__ritter; return { seat: G.mp.seat, seed: G.s.seed, day: G.s.day, role: G.mp.role, name: G.s.player.name, female: G.s.player.female, arms: G.s.arms, pos: [G.s.player.x, G.s.player.y], held: Object.keys(G.s.holdings || {}), owner: G.s.shires.chester.owner, ownerA: G.s.shires[G.mp.peers.values().next().value.seat || 'nottingham'].owner, home: G.world.sites.some((s) => s.type === 'spieler'), castleName: G.s.castleName }; });
  const sA = await ev(A, () => { const G = window.__ritter; return { seed: G.s.seed, day: G.s.day, seat: G.mp.seat, seats: G.mp.seats, held: Object.keys(G.s.holdings || {}), own: G.s.shires[G.mp.seat].owner, chester: G.s.shires.chester.owner, home: G.world.sites.some((s) => s.type === 'spieler'), sites: G.world.sites.length }; });
  const sitesB = await ev(B, () => window.__ritter.world.sites.length);
  console.log('B', JSON.stringify(sB)); console.log('A', JSON.stringify(sA));
  ok(sB.seed === sA.seed && sitesB === sA.sites, 'gleiche Welt (Startwert, gleiche Orte)');
  ok(!sA.home && !sB.home, 'keine Heimburg Ashcombe in der Mehrspieler-Welt');
  ok(sA.held.includes(sA.seat) && sA.own === 'spieler', `A herrscht über seine Grafschaft (${sA.seat})`);
  ok(sB.seat === 'chester' && sB.held.includes('chester') && sB.owner === 'spieler' && sB.castleName === 'Chester', `B herrscht über Cheshire, Burg ${sB.castleName}`);
  ok(sA.chester === 'p:chester' && sB.ownerA === `p:${sA.seat}`, `Jeder sieht die Grafschaft des anderen als dessen (${sA.chester}, ${sB.ownerA})`);
  ok(sB.female && sB.arms.charge === 'hirsch' && sB.arms.metal === 'silber', 'B spielt die Ritterin mit dem gewählten Wappen');
  const names = await ev(A, () => { const G = window.__ritter; return [G.mpSeatInfo('chester').name, G.world.sites.find((s) => s.id === 'chester')]; });
  ok(names[0] === 'Brida', 'Die Karte nennt Brida als Herrin von Cheshire');
  // Helden: B geht ein Stück, A sieht ihn
  await B.waitForTimeout(1500);
  await ev(B, () => { const p = window.__ritter.s.player; p.x += 3; p.y += 1; });
  await A.waitForTimeout(1500);
  const seen = await ev(A, () => { const G = window.__ritter; return (G.remoteUnits || []).map((u) => ({ name: u.name, x: +u.x.toFixed(1), y: +u.y.toFixed(1) })); });
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
  const b2 = await ev(B, () => ({ day: window.__ritter.s.day, gold: window.__ritter.s.gold, salz: window.__ritter.s.castle.storage.salz || 0, held: Object.keys(window.__ritter.s.holdings || {}) }));
  ok(b2.day === dayA, `B folgt dem Tag (${b2.day} = ${dayA})`);
  ok(b2.gold > b1.gold && b2.salz > b1.salz && b2.held.includes('chester'), `B bekommt die Abgaben von Cheshire (${b1.gold} -> ${b2.gold} Gold, Salz ${b1.salz} -> ${b2.salz}) und hält die Burg`);
  // Die Burg der eigenen Grafschaft: Tafel mit Rittersaal, Gefolge und Lager
  const tabs = await ev(B, () => { window.__ritterDebug.openPanel('town', window.__ritter.world.sites.find((s) => s.id === 'chester')); return [...document.querySelectorAll('#panel-tabs button')].map((b) => b.textContent.trim()); });
  ok(['Rittersaal', 'Gefolge', 'Lager'].every((t) => tabs.some((x) => x.startsWith(t))), `Burgtafel mit ${tabs.join(', ')}`);
  await B.screenshot({ path: `${OUT}/mp_B_burg.png` });
  await ev(B, () => { const b = document.querySelector('#panel [data-act="close"], #panel .close'); if (b) b.click(); });
  // B gewinnt eine weitere Grafschaft (wie nach einer Eroberung): der Gastgeber trägt sie für B ein, B behält sie
  await ev(B, () => window.__ritterDebug.grantHolding(window.__ritter.world.sites.find((s) => s.id === 'warwick')));
  await A.waitForTimeout(1500);
  const warA = await ev(A, () => window.__ritter.s.shires.warwick.owner);
  await ev(A, () => window.__ritterDebug.passHours(24));
  await B.waitForTimeout(4500);
  const warB = await ev(B, () => ({ owner: window.__ritter.s.shires.warwick.owner, held: Object.keys(window.__ritter.s.holdings) }));
  ok(warA === 'p:chester' && warB.owner === 'spieler' && warB.held.includes('warwick'), `Eroberung eines Gastes kommt beim Gastgeber an (${warA}) und bleibt (${JSON.stringify(warB)})`);
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
