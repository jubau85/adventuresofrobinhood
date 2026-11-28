// Windows-Installer bauen, auch unter Linux (ohne Wine): erst electron-builder für den Programmordner (win-unpacked),
// dann NSIS mit installer/setup.nsi zur „A Knight's Tale Setup <version>.exe“ in release/.
// Jedes Setup bekommt eine eigene Versionsnummer: Vor dem Bauen zählt das Skript die letzte Stelle hoch
// (tools/version.mjs). Danach die Änderung an den package.json-Dateien mit einchecken.
//   node build-setup.mjs                    nächste Nummer (0.8.0 -> 0.8.1)
//   node build-setup.mjs --version 0.9.0    diese Nummer
//   node build-setup.mjs --gleiche-version  Nummer behalten (nur zum Ausprobieren, nicht zum Weitergeben)
// Braucht makensis: Linux „apt install nsis“, Windows NSIS von nsis.sourceforge.io.
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVersion, setVersion, bumpVersion } from '../tools/version.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const vi = process.argv.indexOf('--version');
const version = vi > 0 && process.argv[vi + 1] ? setVersion(process.argv[vi + 1]) : process.argv.includes('--gleiche-version') ? readVersion() : bumpVersion('patch');
console.log(`Version ${version}`);
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: DIR, stdio: 'inherit', ...opts });
run(process.execPath, [join(DIR, '..', 'tools', 'build.mjs'), '--desktop', 'game']);
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['electron-builder', '--win', 'dir'], { shell: process.platform === 'win32' });
const src = join(DIR, 'release', 'win-unpacked');
if (!existsSync(src)) throw new Error('release/win-unpacked fehlt');
const out = join(DIR, 'release', `A Knight's Tale Setup ${version}.exe`);
run('makensis', ['-V2', `-DVERSION=${version}`, `-DSRC=${src}`, `-DOUT=${out}`, join(DIR, 'installer', 'setup.nsi')]);
console.log(`Installer: ${out} (${(statSync(out).size / 1024 / 1024).toFixed(0)} MB)`);
