// Verbindungen für den Mehrspieler: eine kleine Schnittstelle, darunter wahlweise
//  - 'kanal': BroadcastChannel, für zwei Fenster im selben Browser (Tests, ein Rechner)
//  - 'relais': WebSocket zu tools/relay.mjs (im Heimnetz oder im Internet)
//  - später 'steam': Lobby und Verbindungen über die Desktop-App (window.ritterDesktop.steam)
// Jede Nachricht ist ein Umschlag { f: Absender, t: Empfänger oder null für alle, y: Art, d: Daten }. Die Schicht kennt
// keine Spielregeln; wer da ist, regelt mp.js über regelmäßige Lebenszeichen.

export function netId() {
  const a = new Uint8Array(6);
  (globalThis.crypto || window.crypto).getRandomValues(a);
  return [...a].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
}

export function openTransport({ kind = 'kanal', room = 'burg', url = '', id = netId() } = {}) {
  const handlers = [];
  const deliver = (env) => {
    if (!env || env.f === id || (env.t && env.t !== id)) return;
    for (const h of handlers) { try { h(env); } catch (e) { console.error(e); } }
  };
  let sendRaw, closeRaw, ready = Promise.resolve(true), state = { open: true };
  if (kind === 'relais') {
    const ws = new WebSocket(url);
    const queue = [];
    state.open = false;
    ready = new Promise((res) => {
      ws.addEventListener('open', () => { state.open = true; ws.send(JSON.stringify({ join: room, id })); for (const q of queue.splice(0)) ws.send(q); res(true); });
      ws.addEventListener('error', () => res(false));
    });
    ws.addEventListener('message', (ev) => { try { deliver(JSON.parse(ev.data)); } catch (e) { /* kaputte Nachricht */ } });
    ws.addEventListener('close', () => { state.open = false; state.closed = true; });
    sendRaw = (text) => { if (ws.readyState === 1) ws.send(text); else if (ws.readyState === 0) queue.push(text); };
    closeRaw = () => ws.close();
  } else {
    const ch = new BroadcastChannel(`akt-${room}`);
    ch.onmessage = (ev) => deliver(ev.data);
    sendRaw = (env) => ch.postMessage(env);
    closeRaw = () => ch.close();
  }
  const pack = (to, y, d) => {
    const env = { f: id, t: to || null, y, d };
    return kind === 'relais' ? JSON.stringify(env) : env;
  };
  return {
    id, kind, room, ready, state,
    send: (to, type, data) => sendRaw(pack(to, type, data)),
    broadcast: (type, data) => sendRaw(pack(null, type, data)),
    on: (fn) => handlers.push(fn),
    close: () => { state.open = false; try { closeRaw(); } catch (e) { /* schon zu */ } },
  };
}
