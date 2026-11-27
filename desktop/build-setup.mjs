// Windows-Installer bauen, auch unter Linux (ohne Wine): erst electron-builder für den Programmordner (win-unpacked),
// dann NSIS mit installer/setup.nsi zur „A Knight's Tale Setup <version>.exe“ in release/.
//   node build-setup.mjs            (braucht makensis: Linux „apt install nsis“, Windows NSIS von nsis.sourceforge.io)
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(DIR, 'package.json'), 'utf8'));
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: DIR, stdio: 'inherit', ...opts });
run(process.execPath, [join(DIR, '..', 'tools', 'build.mjs'), '--desktop', 'game']);
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['electron-builder', '--win', 'dir'], { shell: process.platform === 'win32' });
const src = join(DIR, 'release', 'win-unpacked');
if (!existsSync(src)) throw new Error('release/win-unpacked fehlt');
const out = join(DIR, 'release', `A Knight's Tale Setup ${version}.exe`);
run('makensis', ['-V2', `-DVERSION=${version}`, `-DSRC=${src}`, `-DOUT=${out}`, join(DIR, 'installer', 'setup.nsi')]);
console.log(`Installer: ${out} (${(statSync(out).size / 1024 / 1024).toFixed(0)} MB)`);
