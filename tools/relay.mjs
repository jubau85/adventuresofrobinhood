// Relais für den Mehrspieler ohne Steam (siehe desktop/relay.js, dort liegt der Server).
//   node tools/relay.mjs [port]          (Standard 8765; im Spiel als Relais ws://<rechner>:8765 eintragen)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { startRelay, lanAddresses } = require('../desktop/relay.js');
const port = Number(process.argv[2] || process.env.PORT || 8765);
startRelay(port);
console.log(`Relais auf Port ${port}` + (lanAddresses().length ? ` – im Heimnetz: ${lanAddresses().map((a) => `ws://${a}:${port}`).join(', ')}` : ''));
