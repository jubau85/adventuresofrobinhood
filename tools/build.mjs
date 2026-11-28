// Bündelt das Spiel in eine einzige HTML-Datei (dist/a-knights-tale.html).
// Die Module werden in Abhängigkeitsreihenfolge aneinandergehängt; import/export entfallen.
// Aufruf: node tools/build.mjs [--fragment <pfad>] [--extern assets/held/,assets/pferde/]
//   --fragment schreibt zusätzlich eine Fassung ohne <html>/<head>/<body>-Gerüst.
//   --extern bettet Dateien unter diesen Ordnern in das Fragment nicht ein: Sie bleiben relative Pfade und müssen
//            neben der Seite liegen (Liste in <fragment>.dateien.json). Die Einzeldatei in dist/ enthält immer alles.
//   --desktop <ordner> schreibt die Fassung für die Desktop-App (desktop/): eine volle Seite, alle Bilder und Töne als
//            Dateien daneben (kopiert), die Schriften lokal aus assets/schriften/ statt von Google Fonts.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'desktop', 'package.json'), 'utf8')).version;
console.log(`Version ${VERSION}`);
const ORDER = ['data', 'geo', 'assets', 'rng', 'iso', 'state', 'world', 'units', 'tactics', 'shires', 'plots', 'animals', 'life', 'siege', 'dynamics', 'tournament', 'justice', 'mines', 'cheats', 'economy', 'politics', 'castle', 'holdings', 'travels', 'war', 'barons', 'net', 'mp', 'pvp', 'camps', 'sim', 'weather', 'pferde', 'figuren', 'heraldry', 'render', 'titleart', 'audio', 'ui', 'pixelfont', 'intro', 'shiremap', 'lobby', 'save', 'main'];

// Alle Namen, die ein Modul auf oberster Ebene deklariert (auch „let a = 1, b = 2;“)
function topLevelNames(src) {
  const names = [];
  for (const m of src.matchAll(/^(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) names.push(m[1]);
  for (const m of src.matchAll(/^(?:const|let|var)\s+/gm)) {
    let i = m.index + m[0].length, depth = 0, start = i;
    const decls = [];
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === '\'' || c === '"' || c === '`') { const q = c; for (i++; i < src.length && src[i] !== q; i++) if (src[i] === '\\') i++; }
      else if (depth === 0 && (c === ',' || c === ';' || c === '\n' && /[;)}\]]\s*$/.test(src.slice(start, i)))) {
        decls.push(src.slice(start, i));
        start = i + 1;
        if (c !== ',') break;
      }
    }
    for (const d of decls) { const n = d.trim().match(/^([A-Za-z_$][\w$]*)/); if (n) names.push(n[1]); }
  }
  return names;
}

// Jedes Modul in src muss in ORDER stehen, sonst fehlt es in der Einzeldatei (und das Spiel bricht beim Start ab)
const missing = readdirSync(join(ROOT, 'src')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).filter((n) => !ORDER.includes(n));
if (missing.length) throw new Error(`Module fehlen in ORDER (tools/build.mjs): ${missing.join(', ')}`);

const seen = new Map();
let js = '';
for (const name of ORDER) {
  let src = readFileSync(join(ROOT, 'src', `${name}.js`), 'utf8');
  src = src.replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '');
  src = src.replace(/^export\s+(?=(?:async\s+)?function|const|let|class|var)/gm, '');
  if (/^\s*(import|export)\s/m.test(src)) throw new Error(`${name}.js: nicht unterstützte import/export-Form`);
  for (const id of topLevelNames(src)) {
    if (seen.has(id)) throw new Error(`Name „${id}“ ist in ${seen.get(id)}.js und ${name}.js doppelt vergeben`);
    seen.set(id, name);
  }
  js += `\n// ===== ${name}.js =====\n${src}`;
}
if (js.includes('</script')) throw new Error('Der Code enthält „</script“ und kann nicht eingebettet werden');

// Handgemalte Grafiken als data-URL einbetten, damit die Einzeldatei ohne Ordner auskommt
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
function page(extern = []) {
  let artBytes = 0;
  const kept = [];
  const code = js.replace(/'(assets\/[^']+\.(?:jpg|jpeg|png|webp|mp3|ogg))'/g, (m, p) => {
    const file = join(ROOT, p);
    if (!existsSync(file)) return m;
    if (extern.some((e) => p.startsWith(e))) { kept.push(p); return m; }
    const buf = readFileSync(file);
    artBytes += buf.length;
    return `'data:${MIME[p.slice(p.lastIndexOf('.'))]};base64,${buf.toString('base64')}'`;
  });
  // Bilder aus dem Stylesheet (Pergament des Startmenüs) immer einbetten: sie sind klein und gleich beim Start zu sehen
  const css = readFileSync(join(ROOT, 'style.css'), 'utf8').replace(/url\((assets\/[^)]+\.(?:jpg|jpeg|png|webp))\)/g, (m, p) => {
    const file = join(ROOT, p);
    if (!existsSync(file)) return m;
    const buf = readFileSync(file);
    artBytes += buf.length;
    return `url(data:${MIME[p.slice(p.lastIndexOf('.'))]};base64,${buf.toString('base64')})`;
  });
  let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}</style>`);
  // Spielversion (aus dem Code): Partien im Heimnetz mit anderer Version lassen sich nicht betreten. Dazu die
  // Versionsnummer für Menschen (tools/version.mjs), im Startmenü und im Spielmenü zu sehen
  const build = createHash('sha1').update(js).digest('hex').slice(0, 10);
  html = html.replace('<script type="module" src="src/main.js"></script>', () => `<script>\nwindow.__aktBuild = '${build}';\nwindow.__aktVersion = '${VERSION}';\n(function () {\n'use strict';\n${code}\n})();\n</script>`);
  return { html, artBytes, kept };
}
const { html, artBytes } = page();
if (artBytes) console.log(`Grafiken und Töne eingebettet: ${(artBytes / 1024).toFixed(0)} KB`);

mkdirSync(join(ROOT, 'dist'), { recursive: true });
const out = join(ROOT, 'dist', 'a-knights-tale.html');
writeFileSync(out, html);
console.log(`Geschrieben: ${out} (${(html.length / 1024).toFixed(0)} KB)`);

const fi = process.argv.indexOf('--fragment');
if (fi > 0 && process.argv[fi + 1]) {
  const xi = process.argv.indexOf('--extern');
  const extern = xi > 0 && process.argv[xi + 1] ? process.argv[xi + 1].split(',').filter(Boolean) : [];
  const fr = extern.length ? page(extern) : { html, kept: [] };
  if (fr.kept.length) {
    const list = [...new Set(fr.kept)].sort();
    writeFileSync(`${process.argv[fi + 1]}.dateien.json`, JSON.stringify(list, null, 1));
    console.log(`Neben der Seite: ${list.length} Dateien (${(list.reduce((a, p) => a + readFileSync(join(ROOT, p)).length, 0) / 1024).toFixed(0)} KB), Liste in ${process.argv[fi + 1]}.dateien.json`);
  }
  const html2 = fr.html;
  const head = html2.match(/<head>([\s\S]*?)<\/head>/)[1]
    .replace(/<meta charset[^>]*>\s*/, '')
    .replace(/<meta name="viewport"[^>]*>\s*/, '');
  const body = html2.match(/<body>([\s\S]*)<\/body>/)[1];
  writeFileSync(process.argv[fi + 1], `${head.trim()}\n${body.trim()}\n`);
  console.log(`Fragment: ${process.argv[fi + 1]}`);
}

// Desktop-Fassung: volle Seite, Dateien daneben, Schriften lokal
const di = process.argv.indexOf('--desktop');
if (di > 0 && process.argv[di + 1]) {
  const dir = process.argv[di + 1];
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const fr = page(['assets/']);
  let dhtml = fr.html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="assets/schriften/schriften.css">');
  writeFileSync(join(dir, 'index.html'), dhtml);
  const files = new Set(fr.kept);
  for (const f of readdirSync(join(ROOT, 'assets', 'schriften'))) files.add(`assets/schriften/${f}`);
  let bytes = 0;
  for (const f of files) {
    mkdirSync(join(dir, dirname(f)), { recursive: true });
    copyFileSync(join(ROOT, f), join(dir, f));
    bytes += statSync(join(ROOT, f)).size;
  }
  console.log(`Desktop: ${join(dir, 'index.html')} (${(dhtml.length / 1024).toFixed(0)} KB) und ${files.size} Dateien (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
}
