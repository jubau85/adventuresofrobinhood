// Partien im Heimnetz finden (LAN): Wer in der App eine Partie eröffnet, ruft sie jede Sekunde per UDP-Broadcast aus
// (Port 8766); wer in der Lobby auf „Mehrspieler …“ steht, hört zu und sieht sie in einer Liste. Ausgerufen werden nur
// Name der Partie, Gastgeber, Spielerzahl, Stand (Lobby oder Spiel), Port des Relais und die Spielversion. Die Adresse
// zum Beitreten ist die, von der der Ruf kam.
const dgram = require('node:dgram');
const os = require('node:os');
const crypto = require('node:crypto');

const LAN_PORT = 8766, MAGIC = 'a-knights-tale/1';
const SELF = crypto.randomBytes(6).toString('hex');   // diese App: eigene Rufe nicht als fremde Partie zeigen

// An alle im Heimnetz: der allgemeine Broadcast und der jedes Netzes, in dem der Rechner hängt
function broadcastAddrs() {
  const out = new Set(['255.255.255.255']);
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
    if (a.family !== 'IPv4' || a.internal || !a.netmask) continue;
    const ip = a.address.split('.').map(Number), m = a.netmask.split('.').map(Number);
    out.add(ip.map((v, k) => (v | (~m[k] & 255))).join('.'));
  }
  return [...out];
}

let beacon = null;
function announce(info) {
  if (!beacon) {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    beacon = { sock, info: null, ready: false, timer: setInterval(send, 1000) };
    sock.on('error', () => { /* kein Netz: dann eben nicht */ });
    sock.bind(0, () => { try { sock.setBroadcast(true); beacon.ready = true; send(); } catch (e) { /* ohne Broadcast */ } });
  }
  beacon.info = { room: String(info.room || '').slice(0, 32), host: String(info.host || '').slice(0, 24), players: info.players | 0, phase: info.phase === 'game' ? 'game' : 'lobby', port: info.port | 0 || 8765, build: String(info.build || '') };
}
function send() {
  if (!beacon || !beacon.ready || !beacon.info) return;
  const msg = Buffer.from(JSON.stringify({ magic: MAGIC, id: SELF, ...beacon.info }));
  for (const b of broadcastAddrs()) beacon.sock.send(msg, LAN_PORT, b, () => { /* einzelne Netze dürfen scheitern */ });
}
function stopAnnounce() {
  if (!beacon) return;
  clearInterval(beacon.timer);
  try { beacon.sock.close(); } catch (e) { /* schon zu */ }
  beacon = null;
}

// Ruft es von diesem Rechner (zweites Fenster), geht es direkt über 127.0.0.1
function ownAddrs() {
  const out = new Set(['127.0.0.1']);
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4') out.add(a.address);
  return out;
}

let ear = null;
const found = new Map();
function search() {
  if (ear) return ear.error;
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  ear = { sock, error: null };
  sock.on('error', (e) => { ear.error = e.message; });
  sock.on('message', (buf, r) => {
    let d;
    try { d = JSON.parse(buf.toString('utf8')); } catch (e) { return; }
    if (!d || d.magic !== MAGIC || d.id === SELF) return;
    found.set(`${d.id}:${d.room}`, {
      id: String(d.id), room: String(d.room || '').slice(0, 32), host: String(d.host || '').slice(0, 24), players: d.players | 0,
      phase: d.phase === 'game' ? 'game' : 'lobby', port: d.port | 0 || 8765, build: String(d.build || ''), from: r.address,
      local: ownAddrs().has(r.address), seen: Date.now(),
    });
  });
  sock.bind(LAN_PORT);
  return null;
}
// Was in den letzten dreieinhalb Sekunden gerufen hat
function list() {
  const now = Date.now();
  for (const [k, v] of found) if (now - v.seen > 3500) found.delete(k);
  return [...found.values()].sort((a, b) => a.room.localeCompare(b.room));
}

module.exports = { announce, stopAnnounce, search, list };
