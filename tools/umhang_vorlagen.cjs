// Vorlagen für den gemalten Umhang: die Heldenfiguren freigestellt (durchsichtiger Hintergrund, ohne Boden, Ring,
// Waffe, Schild und ohne den gezeichneten Umhang), je Bewegung, Richtung und Bild, so wie das Spiel sie malt.
//   node tools/umhang_vorlagen.cjs <ausgabe-ordner>
// Ausgabe: <ordner>/<modell>/<bewegung>/r<richtung>_b<bild>.png, zu Pferd zusätzlich <modell>/zu_pferd_<pferd>/r<richtung>.png
// (Reiter mit Pferd, nur zum Ansehen), dazu vorlagen.json mit Leinwand, Fußpunkt und Hüftpunkt je Bild.
// Braucht Playwright mit Chromium.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.resolve(process.argv[2] || 'umhang_vorlagen');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg' };
// Bewegungen und Bilder je Richtung (gleich für alle Rüstungen eines Körpers)
const ANIMS = { stehen: 4, gehen: 8, laufen: 8, schlag: 6, getroffen: 4, reiten: 1, reiten_nah: 1 };
// Modelle: Name, Frau, Rüstung. Voll: alle Bewegungen; sonst nur Stehen, Bild 0 (zum Prüfen, ob der Umhang passt)
const MODELS = [
  ['held_edel', false, null, true], ['held_ritter', false, 'kettenruestung', true],
  ['held_gambeson', false, 'gambeson'], ['held_leder', false, 'lederwams'], ['held_kette', false, 'kettenhemd'], ['held_schuppe', false, 'schuppenpanzer'],
  ['ritterin', true, null, true], ['ritterin_ritter', true, 'kettenruestung', true],
  ['ritterin_gambeson', true, 'gambeson'], ['ritterin_leder', true, 'lederwams'], ['ritterin_kette', true, 'kettenhemd'], ['ritterin_schuppe', true, 'schuppenpanzer'],
];
const S = 120 / 26;                         // Bildpunkte je Weltpixel: Held in voller Auflösung (1 Bildpunkt = 1 Punkt im Bogen)
const FOOT = { w: 220, h: 240, ax: 110, ay: 185 };
const RIDE = { w: 600, h: 480, ax: 300, ay: 300 };
const COLOR = '#2c4f86';                    // Wappenfarbe der Vorlage (Wams, Wappenrock, Schabracke)

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await ctx.route('http://game.local/**', async (route) => { const u = new URL(route.request().url()); const f = path.join(ROOT, u.pathname); if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' }); route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) }); });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://game.local/index.html');
  await p.waitForSelector('#btn-new');
  await p.click('#btn-new');
  await p.waitForFunction(() => window.__ritter.started && !window.__ritter.loadingArt, null, { timeout: 120000 });
  const meta = { hinweis: 'Fußpunkt (ax, ay) = Punkt zwischen den Füßen auf dem Boden (zu Pferd: Fußpunkt des Reiters). hips = Hüftgelenk je Bild in Bildpunkten der Leinwand.', richtungen: 'r0 schaut nach links unten, jede weitere Richtung dreht sich um 45° gegen den Uhrzeigersinn (von oben gesehen): r1 nach unten (zum Betrachter), r2 rechts unten, r3 rechts, r4 rechts oben, r5 nach oben (vom Betrachter weg), r6 links oben, r7 links', farbe: COLOR, modelle: {} };
  const snap = (o) => p.evaluate(async (o) => {
    const G = window.__ritter, D = window.__ritterDebug;
    const u = D.makeUnit({ kind: 'preview', cls: G.s.player.cls, female: o.female, eq: { ruestung: o.ruestung, pferd: o.pferd || null }, tunic: o.color });
    for (let k = 0; k < 200; k++) {
      const r = D.figureSnapshot({ unit: u, mounted: !!o.mounted, anim: o.anim, frame: o.frame, dir: o.dir, w: o.w, h: o.h, ax: o.ax, ay: o.ay, s: o.s, cape: false });
      if (r) return { url: r.cv.toDataURL('image/png'), key: r.key, hips: r.hips };
      await new Promise((res) => setTimeout(res, 100));
    }
    return null;
  }, o);
  const save = (file, url) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64')); };
  for (const [name, female, ruestung, full] of MODELS) {
    const m = { leinwand: [FOOT.w, FOOT.h], fusspunkt: [FOOT.ax, FOOT.ay], bewegungen: {} };
    for (const [anim, n] of Object.entries(full ? ANIMS : { stehen: 1 })) {
      const bw = (m.bewegungen[anim] = { bilder: n, hips: [] });
      for (let dir = 0; dir < 8; dir++) {
        const row = [];
        for (let frame = 0; frame < n; frame++) {
          const r = await snap({ female, ruestung, anim, frame, dir, ...FOOT, s: S, color: COLOR });
          if (!r) { console.log('FEHL', name, anim, dir, frame); continue; }
          if (r.key !== name) console.log('Modell', r.key, 'statt', name);
          save(path.join(OUT, name, anim, `r${dir}_b${frame}.png`), r.url);
          row.push(r.hips ? [+(FOOT.ax + r.hips.x * S).toFixed(1), +(FOOT.ay + r.hips.y * S).toFixed(1)] : null);
        }
        bw.hips.push(row);
      }
    }
    if (full) for (const [label, pferd] of [['reitpferd', 'klepper'], ['schlachtross', 'schlachtross']]) {
      const key = `zu_pferd_${label}`;
      m[key] = { leinwand: [RIDE.w, RIDE.h], fusspunkt_reiter: [RIDE.ax, RIDE.ay] };
      for (let dir = 0; dir < 8; dir++) {
        const r = await snap({ female, ruestung, pferd, mounted: true, anim: 'reiten', frame: 0, dir, ...RIDE, s: S, color: COLOR });
        if (r) save(path.join(OUT, name, key, `r${dir}.png`), r.url); else console.log('FEHL', name, key, dir);
      }
    }
    meta.modelle[name] = m;
    console.log(name, 'fertig');
  }
  fs.writeFileSync(path.join(OUT, 'vorlagen.json'), JSON.stringify(meta, null, 1));
  console.log('ERR', JSON.stringify(errs.slice(0, 5)));
  await browser.close();
})().catch((e) => { console.error('ABBRUCH', e.message); process.exit(1); });
