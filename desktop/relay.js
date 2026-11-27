// Relais für den Mehrspieler ohne Steam (CommonJS, auch in der Desktop-App): ein kleiner WebSocket-Server ohne
// Abhängigkeiten. Er reicht Nachrichten innerhalb einer Partie (Raum) weiter, an alle oder an einen bestimmten Spieler,
// und kennt sonst nichts vom Spiel. Die erste Nachricht eines Spielers ist { join: <raum>, id: <spieler> }, danach
// Umschläge { f, t, y, d } (src/net.js).
//   node desktop/relay.js [port]     oder aus der App: startRelay(port)
const { createServer } = require('node:http');
const { createHash } = require('node:crypto');
const os = require('node:os');

function startRelay(PORT = 8765, onError = null) {
  const rooms = new Map(); // raum -> Set(verbindung)

  function frame(text) {
    const data = Buffer.from(text);
    const n = data.length;
    const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x81, 127, 0, 0, 0, 0]), Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])]);
    return Buffer.concat([head, data]);
  }

  const server = createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end("A Knight's Tale – Relais läuft\n"); });
  server.on('upgrade', (req, sock) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) { sock.destroy(); return; }
    const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sock.setNoDelay(true);
    const conn = { sock, room: null, id: null };
    let buf = Buffer.alloc(0), parts = [];
    const leave = () => { if (conn.room && rooms.has(conn.room)) { rooms.get(conn.room).delete(conn); if (!rooms.get(conn.room).size) rooms.delete(conn.room); } };
    const onText = (text) => {
      let msg;
      try { msg = JSON.parse(text); } catch (e) { return; }
      if (msg.join) {
        leave();
        conn.room = String(msg.join).slice(0, 48); conn.id = String(msg.id || '').slice(0, 24);
        if (!rooms.has(conn.room)) rooms.set(conn.room, new Set());
        rooms.get(conn.room).add(conn);
        return;
      }
      if (!conn.room) return;
      const out = frame(text);
      for (const o of rooms.get(conn.room) || []) if (o !== conn && (!msg.t || msg.t === o.id)) o.sock.write(out);
    };
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (buf.length < 2) return;
        const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        const mOff = off; if (masked) off += 4;
        if (buf.length < off + len) return;
        let payload = buf.subarray(off, off + len);
        if (masked) { const m = buf.subarray(mOff, mOff + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3]; }
        buf = buf.subarray(off + len);
        if (op === 0x8) { leave(); sock.end(); return; }
        if (op === 0x9) { sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
        if (op === 0x1 || op === 0x0) { parts.push(payload); if (fin) { onText(Buffer.concat(parts).toString('utf8')); parts = []; } }
      }
    });
    sock.on('close', leave);
    sock.on('error', leave);
  });
  server.on('error', (e) => { if (onError) onError(e); else console.error(e.message); });
  server.listen(PORT);
  return { port: PORT, close: () => server.close() };
}

// Adressen dieses Rechners im Heimnetz (für die Mitspieler)
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

module.exports = { startRelay, lanAddresses };
if (require.main === module) {
  const port = Number(process.argv[2] || process.env.PORT || 8765);
  startRelay(port);
  console.log(`Relais auf Port ${port}` + (lanAddresses().length ? ` – im Heimnetz: ${lanAddresses().map((a) => `ws://${a}:${port}`).join(', ')}` : ''));
}
