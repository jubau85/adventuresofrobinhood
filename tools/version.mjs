// Versionsnummer des Spiels. Sie steht in desktop/package.json (dort liest die Desktop-App sie, und das Setup trägt sie
// im Namen) und wird nach package.json und desktop/package-lock.json mitgezogen. Jedes Setup bekommt eine eigene
// Nummer: desktop/build-setup.mjs zählt vor dem Bauen die letzte Stelle hoch.
//   node tools/version.mjs            zeigt die Nummer
//   node tools/version.mjs patch      zählt die letzte Stelle hoch (0.8.0 -> 0.8.1)
//   node tools/version.mjs minor      zählt die mittlere hoch (0.8.1 -> 0.9.0), major die erste (0.9.0 -> 1.0.0)
//   node tools/version.mjs 0.8.0      setzt sie
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = join(ROOT, 'desktop', 'package.json');
const ROOT_PKG = join(ROOT, 'package.json');
const LOCK = join(ROOT, 'desktop', 'package-lock.json');
const VALID = /^\d+\.\d+\.\d+$/;

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const writeJson = (f, o) => writeFileSync(f, `${JSON.stringify(o, null, 2)}\n`);

export function readVersion() { return readJson(DESK).version; }

export function setVersion(v) {
  if (!VALID.test(v)) throw new Error(`Keine Versionsnummer: ${v} (erwartet z. B. 0.8.0)`);
  for (const f of [DESK, ROOT_PKG]) { const o = readJson(f); o.version = v; writeJson(f, o); }
  if (existsSync(LOCK)) {
    const o = readJson(LOCK);
    o.version = v;
    if (o.packages && o.packages['']) o.packages[''].version = v;
    writeJson(LOCK, o);
  }
  return v;
}

export function bumpVersion(kind = 'patch') {
  const [a, b, c] = readVersion().split('.').map(Number);
  const next = kind === 'major' ? `${a + 1}.0.0` : kind === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
  return setVersion(next);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv[2];
  if (!arg) console.log(readVersion());
  else if (['patch', 'minor', 'major'].includes(arg)) console.log(bumpVersion(arg));
  else console.log(setVersion(arg));
}
