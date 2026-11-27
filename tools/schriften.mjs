// Schriften für die Desktop-Fassung lokal ablegen (offline spielbar): lädt die Google-Fonts-Stile der Seite
// (nur lateinische Zeichensätze, darin auch die Umlaute), die WOFF2-Dateien und die Lizenzen (SIL Open Font License)
// nach assets/schriften/ und schreibt dort schriften.css mit relativen Pfaden.
//   node tools/schriften.mjs
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'schriften');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const LIZENZ = ['alegreya', 'alegreyasans', 'imfellenglishsc', 'unifrakturmaguntia', 'uncialantiqua'];

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const href = html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/)[1].replace(/&amp;/g, '&');
mkdirSync(OUT, { recursive: true });
const css = await (await fetch(href, { headers: { 'User-Agent': UA } })).text();
// Blöcke: /* latin */ @font-face { ... }
const blocks = [...css.matchAll(/\/\* ([a-z-]+) \*\/\s*(@font-face\s*\{[^}]+\})/g)].filter((m) => m[1] === 'latin' || m[1] === 'latin-ext');
let out = '/* Lokale Schriften (SIL Open Font License 1.1, Lizenzen in diesem Ordner), erzeugt von tools/schriften.mjs */\n';
let n = 0, bytes = 0;
for (const [, subset, face] of blocks) {
  const fam = face.match(/font-family:\s*'([^']+)'/)[1].replace(/\s+/g, '');
  const style = face.match(/font-style:\s*(\w+)/)[1], weight = face.match(/font-weight:\s*(\d+)/)[1];
  const url = face.match(/url\((https:[^)]+\.woff2)\)/)[1];
  const name = `${fam}-${weight}${style === 'italic' ? 'i' : ''}-${subset}.woff2`;
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(join(OUT, name), buf);
  bytes += buf.length; n++;
  out += `/* ${subset} */\n${face.replace(url, name)}\n`;
}
writeFileSync(join(OUT, 'schriften.css'), out);
for (const f of LIZENZ) {
  const t = await (await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${f}/OFL.txt`)).text();
  writeFileSync(join(OUT, `OFL-${f}.txt`), t);
}
console.log(`${n} Schriftdateien, ${(bytes / 1024).toFixed(0)} KB, dazu ${LIZENZ.length} Lizenzen`);
