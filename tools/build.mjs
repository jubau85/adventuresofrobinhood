// Bündelt das Spiel in eine einzige HTML-Datei (dist/ritter-ohne-land.html).
// Die Module werden in Abhängigkeitsreihenfolge aneinandergehängt; import/export entfallen.
// Aufruf: node tools/build.mjs [--fragment <pfad>]
//   --fragment schreibt zusätzlich eine Fassung ohne <html>/<head>/<body>-Gerüst.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORDER = ['data', 'rng', 'iso', 'state', 'world', 'units', 'animals', 'economy', 'politics', 'castle', 'sim', 'render', 'ui', 'save', 'main'];

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

const css = readFileSync(join(ROOT, 'style.css'), 'utf8');
let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}</style>`);
html = html.replace('<script type="module" src="src/main.js"></script>', () => `<script>\n(function () {\n'use strict';\n${js}\n})();\n</script>`);

mkdirSync(join(ROOT, 'dist'), { recursive: true });
const out = join(ROOT, 'dist', 'ritter-ohne-land.html');
writeFileSync(out, html);
console.log(`Geschrieben: ${out} (${(html.length / 1024).toFixed(0)} KB)`);

const fi = process.argv.indexOf('--fragment');
if (fi > 0 && process.argv[fi + 1]) {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
    .replace(/<meta charset[^>]*>\s*/, '')
    .replace(/<meta name="viewport"[^>]*>\s*/, '');
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  writeFileSync(process.argv[fi + 1], `${head.trim()}\n${body.trim()}\n`);
  console.log(`Fragment: ${process.argv[fi + 1]}`);
}
