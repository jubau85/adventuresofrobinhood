// Mehrspieler-Lobby im Startmenü: Partie eröffnen oder beitreten. In der Lobby stellt jeder seinen Ritter ein (Name,
// Figur, Wappen mit eigener Farbe) und wählt die Grafschaft, über die er herrscht; der Gastgeber stellt die
// Schwierigkeit ein und startet, sobald alle bereit sind. Chat für alle. Die Regeln dahinter stehen in mp.js; hier nur
// die Oberfläche. main.js reicht über initLobby die Dinge herein, die zum Spielstart gehören (Profil aus dem Startmenü
// als Vorschlag, Welt erschaffen, als Gast einsteigen, Ladetafel).

import { G } from './state.js';
import { byId, esc } from './ui.js';
import { CHARGES, CHARGE_IDS, armsSVG, chargeSVG } from './heraldry.js';
import { mpLobbyHost, mpLobbyJoin, mpLobbyChoose, mpLobbyStart, mpLobbyLeave, mpChat, lobbyView } from './mp.js';
import { drawLobbyMap, lobbyMapPick, lobbyMapSeatPos } from './shiremap.js';

let lbHooks = null, lbStep = 'wahl', lbStatus = '', lbProfile = null, lbSig = '', lbSigArms = '', lbNameT = null, lbHover = null, lbMapReq = 0;
const LOBBY_DIFF = [['leicht', 'Leicht'], ['mittel', 'Mittel'], ['schwer', 'Schwer']];
const isDesktop = () => !!(window.ritterDesktop && window.ritterDesktop.relay);

export function initLobby(h) {
  lbHooks = h;
  byId('btn-mp').addEventListener('click', openLobby);
  const box = byId('lobby');
  box.addEventListener('click', onLobbyClick);
  box.addEventListener('change', onLobbyChange);
  box.addEventListener('keydown', onLobbyKey);
  box.addEventListener('input', onLobbyInput);
  box.addEventListener('pointermove', onMapMove);
  box.addEventListener('pointerleave', () => { if (lbHover) { lbHover = null; mapSoon(); } }, true);
  window.addEventListener('resize', () => { if (!byId('lobby').hidden) mapSoon(); });
}

export function openLobby() {
  lbStep = G.mp && G.mp.phase === 'lobby' ? 'lobby' : 'wahl';
  byId('lobby').hidden = false;
  renderLobby();
}
function closeLobby() { byId('lobby').hidden = true; }

// Adresse wie „192.168.1.20“ oder „192.168.1.20:8765“ oder „ws://…“ zu einer WebSocket-Adresse
function normAddr(a) {
  a = String(a || '').trim();
  if (!a) return '';
  if (!/^wss?:\/\//.test(a)) a = `ws://${a}`;
  if (!/:\d+(\/|$)/.test(a.replace(/^wss?:\/\//, ''))) a += ':8765';
  return a;
}
const roomName = (v) => (String(v || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32)) || 'burg';

const lobbyEvents = {
  onLobby: () => { if (lbStep === 'lobby' && !byId('lobby').hidden) renderLobbyParts(); },
  onStart: () => { closeLobby(); lbHooks.showLoading('Der Gastgeber erschafft die Welt …'); },
  onWelcome: (d, err) => {
    if (!d) { lbHooks.hideLoading(); lbStep = 'wahl'; lbStatus = err || 'Beitreten fehlgeschlagen.'; byId('lobby').hidden = false; renderLobby(); return; }
    closeLobby();
    lbHooks.showLoading('Die Welt wird erschaffen …');
    const prof = { ...lbProfile, ...((G.mp && G.mp.profile) || {}) };
    setTimeout(() => lbHooks.startGuest(d, prof), 30);
  },
  onClosed: (msg) => { lbHooks.hideLoading(); lbStep = 'wahl'; lbStatus = msg; byId('lobby').hidden = false; renderLobby(); },
  onFail: (msg) => { lbStep = 'wahl'; lbStatus = msg; renderLobby(); },
};

function renderLobby() {
  const card = byId('lobby-card');
  lbSig = ''; lbSigArms = '';
  if (lbStep === 'wahl') {
    const hint = isDesktop()
      ? 'Wer eröffnet, ist Gastgeber. Seine Mitspieler im Heimnetz tragen die Adresse ein, die ihm hier gleich angezeigt wird. Auf demselben PC (zweites Fenster) bleibt das Adressfeld leer.'
      : 'In dieser Browser-Fassung spielen zwei Fenster im selben Browser miteinander; das Adressfeld bleibt dann leer. Mit Freunden im Netz spielt ihr über die Desktop-App.';
    card.innerHTML = `
      <h2>Mehrspieler</h2>
      <p class="lb-note">Im Mehrspieler gibt es keine Heimburg: Jeder herrscht von Anfang an über eine Grafschaft. Ritter, Wappen und Grafschaft wählst du gleich in der Lobby.</p>
      <div class="lb-cols">
        <div class="lb-col">
          <h3>Partie eröffnen</h3>
          <label class="lb-field">Name der Partie<input id="lb-room-host" value="burg" maxlength="32" autocomplete="off"></label>
          <button type="button" class="btn primary" data-lb="host">Eröffnen</button>
        </div>
        <div class="lb-col">
          <h3>Partie beitreten</h3>
          <label class="lb-field">Name der Partie<input id="lb-room-join" value="burg" maxlength="32" autocomplete="off"></label>
          <label class="lb-field">Adresse des Gastgebers<input id="lb-addr" placeholder="${isDesktop() ? 'z. B. 192.168.1.20 – leer: dieser PC' : 'leer lassen'}" autocomplete="off"></label>
          <button type="button" class="btn primary" data-lb="join">Beitreten</button>
        </div>
      </div>
      <p class="lb-hint">${esc(hint)}</p>
      ${lbStatus ? `<p class="lb-status">${esc(lbStatus)}</p>` : ''}
      <div class="row"><button type="button" class="btn" data-lb="back">Zurück</button></div>`;
    return;
  }
  card.innerHTML = `
    <h2 id="lb-title">Partie</h2>
    <p class="lb-note" id="lb-info"></p>
    <div class="lb-cols">
      <section class="lb-col" aria-label="Dein Ritter">
        <h3>Dein Ritter</h3>
        <div class="lb-hero">
          <div class="lb-arms" id="lb-arms"></div>
          <div class="lb-hero-fields">
            <label class="lb-field">Name<input id="lb-name" maxlength="24" autocomplete="off"></label>
            <div class="lb-field">Figur<div class="seg" id="lb-fig"></div></div>
          </div>
        </div>
        <div class="lb-field">Wappenfarbe <span class="lb-sub" id="lb-colorname"></span><div class="lb-swatches" id="lb-colors"></div></div>
        <div class="lb-field">Metall<div class="seg" id="lb-metal"></div></div>
        <div class="lb-field">Wappenbild <span class="lb-sub" id="lb-chargename"></span><div class="lb-charges" id="lb-charges"></div></div>
      </section>
      <section class="lb-col" aria-label="Deine Grafschaft">
        <h3>Deine Grafschaft</h3>
        <div class="lb-map"><canvas id="lb-map" role="img" aria-label="Karte der Grafschaften: Klick wählt eine freie Grafschaft"></canvas></div>
        <p class="lb-maptip" id="lb-maptip">Klick auf die Karte wählt eine freie Grafschaft.</p>
        <label class="lb-field">Hier beginnst du als Herr<select id="lb-seat"></select></label>
        <div class="lb-seatinfo" id="lb-seatinfo"></div>
        <div id="lb-diff"></div>
      </section>
    </div>
    <table class="lb-players"><thead><tr><th>Spieler</th><th>Grafschaft</th><th>Bereit</th></tr></thead><tbody id="lb-players"></tbody></table>
    <div class="lb-chat"><div class="lb-chatlog" id="lb-chatlog" aria-live="polite"></div>
      <input id="lb-chat" maxlength="200" placeholder="Nachricht an alle … (Enter schickt)" autocomplete="off"></div>
    <div class="row" id="lb-actions"></div>`;
  renderLobbyParts();
}

function renderLobbyParts() {
  const v = lobbyView();
  if (!v || lbStep !== 'lobby') return;
  const set = (id, html) => { const el = byId(id); if (el && el.innerHTML !== html) el.innerHTML = html; };
  set('lb-title', `Partie „${esc(v.room)}“`);
  if (v.waiting) {
    set('lb-info', 'Verbinde mit dem Gastgeber …');
    set('lb-actions', '<button type="button" class="btn" data-lb="leave">Abbrechen</button>');
    return;
  }
  const me = v.me, arms = me.arms || { field: me.color, metal: 'gold', charge: 'loewe' };
  const info = v.role === 'host'
    ? (v.lan && v.lan.length ? `Du bist Gastgeber. Mitspieler tragen ein: Partie <b>${esc(v.room)}</b>, Adresse <b>${esc(v.lan.map((a) => a.replace(/^ws:\/\//, '').replace(/:8765$/, '')).join(' oder '))}</b>.`
      : `Du bist Gastgeber. Mitspieler treten der Partie <b>${esc(v.room)}</b> bei.`)
    : 'Stell deinen Ritter ein, wähl deine Grafschaft und melde dich bereit. Der Gastgeber startet das Spiel.';
  set('lb-info', info);
  // Dein Ritter: Wappen, Name, Figur, Farbe, Metall, Bild
  set('lb-arms', armsSVG(arms, 64, 'Dein Wappen'));
  const nameEl = byId('lb-name');
  if (nameEl && document.activeElement !== nameEl && nameEl.value !== me.name) nameEl.value = me.name || '';
  set('lb-fig', [['m', 'Ritter'], ['f', 'Ritterin']].map(([k, n]) => `<button type="button" class="btn sm${(k === 'f') === !!me.female ? ' primary' : ''}" data-lb="fig" data-v="${k}" aria-pressed="${(k === 'f') === !!me.female}">${n}</button>`).join(''));
  const cur = v.colors.find((c) => c.color === me.color);
  set('lb-colorname', cur ? esc(cur.name) : '');
  set('lb-colors', v.colors.map((c) => {
    const sel = c.color === me.color, by = c.by;
    return `<button type="button" class="lb-swatch${sel ? ' sel' : ''}" style="--c:${esc(c.color)}" data-lb="color" data-v="${esc(c.color)}" ${by ? 'disabled' : ''} aria-pressed="${sel}" title="${esc(c.name)}${by ? ` · trägt schon ${esc(by)}` : ''}" aria-label="${esc(c.name)}${by ? `, trägt schon ${esc(by)}` : ''}"></button>`;
  }).join(''));
  set('lb-metal', [['gold', 'Gold'], ['silber', 'Silber']].map(([k, n]) => `<button type="button" class="btn sm${arms.metal === k ? ' primary' : ''}" data-lb="metal" data-v="${k}" aria-pressed="${arms.metal === k}">${n}</button>`).join(''));
  set('lb-chargename', CHARGES[arms.charge] ? esc(CHARGES[arms.charge].name) : '');
  const sa = JSON.stringify(arms);
  if (sa !== lbSigArms) {
    lbSigArms = sa;
    set('lb-charges', CHARGE_IDS.map((id) => `<button type="button" class="lb-charge${arms.charge === id ? ' sel' : ''}" data-lb="charge" data-v="${id}" title="${esc(CHARGES[id].name)}" aria-label="${esc(CHARGES[id].name)}" aria-pressed="${arms.charge === id}">${chargeSVG(id, arms, 30)}</button>`).join(''));
  }
  // Grafschaft: nach Reichen, vergebene gesperrt; nur neu zeichnen, wenn sich etwas ändert (sonst klappt das Menü zu)
  const sel = byId('lb-seat'), s2 = JSON.stringify([me.seat, v.seats.map((x) => x.by)]);
  if (sel && s2 !== lbSig && document.activeElement !== sel) {
    lbSig = s2;
    const realms = [...new Set(v.seats.map((x) => x.realm))];
    sel.innerHTML = realms.map((r) => `<optgroup label="${esc(r)}">${v.seats.filter((x) => x.realm === r).map((x) => `<option value="${esc(x.id)}"${x.id === me.seat ? ' selected' : ''}${x.by ? ' disabled' : ''}>${esc(x.name)} · Burg ${esc(x.castle)}${x.by ? ` (${esc(x.by)})` : ''}</option>`).join('')}</optgroup>`).join('');
  }
  drawLobbyMapNow(v);
  const seat = v.seats.find((x) => x.id === me.seat);
  set('lb-seatinfo', seat ? `<p><b>${esc(seat.name)}</b>, Sitz auf der Burg ${esc(seat.castle)} (${esc(seat.realm)}).</p><p>${esc(seat.text)}</p><p class="lb-sub">Bisher halten ${esc(seat.lord)} die Burg. Du beginnst als ihr Herr mit Besatzung, Rittersaal und Lager; die Abgaben der Grafschaft gehören dir.</p>` : '');
  const diffName = (LOBBY_DIFF.find((d) => d[0] === v.difficulty) || LOBBY_DIFF[0])[1];
  set('lb-diff', v.role === 'host'
    ? `<div class="lb-field">Schwierigkeit der Barone <div class="seg">${LOBBY_DIFF.map(([k, n]) => `<button type="button" class="btn sm${v.difficulty === k ? ' primary' : ''}" data-lb="diff" data-v="${k}">${n}</button>`).join('')}</div></div>`
    : `<p class="lb-note">Schwierigkeit der Barone: <b>${esc(diffName)}</b></p>`);
  // Spieler
  set('lb-players', v.players.map((p) => {
    const st = v.seats.find((x) => x.id === p.seat);
    return `<tr${p.id === me.id ? ' class="me"' : ''}>
      <td><span class="lb-mini">${armsSVG(p.arms || { field: p.color || '#888', metal: 'gold', charge: 'loewe' }, 20, esc(p.name))}</span>${esc(p.name)}${p.host ? ' <span class="lb-tag">Gastgeber</span>' : ''}${p.id === me.id ? ' <span class="lb-tag">du</span>' : ''}</td>
      <td>${st ? `${esc(st.name)} <span class="lb-sub">(${esc(st.castle)})</span>` : '–'}</td>
      <td>${p.ready ? '✔' : '…'}</td></tr>`;
  }).join(''));
  set('lb-chatlog', v.chat.map((c) => `<div><b>${esc(c.name)}:</b> ${esc(c.text)}</div>`).join('') || '<div class="muted">Noch keine Nachrichten.</div>');
  const log = byId('lb-chatlog'); if (log) log.scrollTop = log.scrollHeight;
  const guests = v.players.filter((p) => !p.host);
  set('lb-actions', v.role === 'host'
    ? `<button type="button" class="btn primary" data-lb="start"${v.allReady ? '' : ' disabled'}>Spiel starten</button>
       <button type="button" class="btn" data-lb="leave">Partie schließen</button>
       <span class="lb-hint">${guests.length ? (v.allReady ? 'Alle sind bereit.' : 'Warte, bis alle bereit sind.') : 'Du kannst auch allein starten; Mitspieler können später noch beitreten.'}</span>`
    : `<button type="button" class="btn primary" data-lb="ready">${me.ready ? 'Doch nicht bereit' : 'Bereit'}</button>
       <button type="button" class="btn" data-lb="leave">Verlassen</button>`);
}

// Karte: vergebene Grafschaften mit Farbe und Wappen ihres Spielers, deine golden, die unter dem Zeiger hell
function drawLobbyMapNow(v) {
  const cv = byId('lb-map');
  if (!cv || !v || v.waiting) return;
  const seats = v.players.filter((p) => p.seat).map((p) => ({ id: p.seat, by: p.id === v.me.id ? null : p.name, color: p.color, arms: p.arms }));
  drawLobbyMap(cv, { seats, mine: v.me.seat, hover: lbHover });
  const tip = byId('lb-maptip'), h = lbHover && v.seats.find((x) => x.id === lbHover);
  if (tip) tip.textContent = h ? `${h.name} · Burg ${h.castle} (${h.realm})${h.id === v.me.seat ? ' · deine Wahl' : h.by ? ` · gewählt von ${h.by}` : ' · frei, Klick wählt'}` : 'Klick auf die Karte wählt eine freie Grafschaft.';
}
function mapSoon() {
  if (lbMapReq) return;
  lbMapReq = requestAnimationFrame(() => { lbMapReq = 0; if (lbStep === 'lobby' && !byId('lobby').hidden) drawLobbyMapNow(lobbyView()); });
}
window.__lobbyMapPos = (id) => { const cv = byId('lb-map'); return cv ? lobbyMapSeatPos(cv, id) : null; };
function mapPoint(e) { const cv = byId('lb-map'), r = cv.getBoundingClientRect(); return lobbyMapPick(cv, e.clientX - r.left, e.clientY - r.top); }
function onMapMove(e) {
  if (e.target.id !== 'lb-map') { if (lbHover) { lbHover = null; mapSoon(); } return; }
  const id = mapPoint(e);
  e.target.style.cursor = id ? 'pointer' : 'default';
  if (id !== lbHover) { lbHover = id; mapSoon(); }
}

function onLobbyClick(e) {
  if (e.target.id === 'lb-map') {
    const id = mapPoint(e), v = lobbyView(), s = id && v && v.seats.find((x) => x.id === id);
    if (s && (s.free || id === v.me.seat)) mpLobbyChoose({ seat: id });
    return;
  }
  const b = e.target.closest('[data-lb]');
  if (!b) return;
  const act = b.dataset.lb;
  if (act === 'host') {
    lbProfile = lbHooks.profile();
    const url = isDesktop() ? lbHooks.desktopRelay() : '';
    mpLobbyHost({ room: roomName(byId('lb-room-host').value), kind: url ? 'relais' : 'kanal', url, lan: G.mpLan || null }, lbProfile, lobbyEvents);
    lbStep = 'lobby'; lbStatus = ''; renderLobby();
  } else if (act === 'join') {
    lbProfile = lbHooks.profile();
    let url = normAddr(byId('lb-addr').value);
    if (!url && isDesktop()) url = 'ws://127.0.0.1:8765';
    mpLobbyJoin({ room: roomName(byId('lb-room-join').value), kind: url ? 'relais' : 'kanal', url }, lbProfile, lobbyEvents);
    lbStep = 'lobby'; lbStatus = ''; renderLobby();
  } else if (act === 'ready') { const v = lobbyView(); mpLobbyChoose({ ready: !(v && v.me && v.me.ready) }); }
  else if (act === 'fig') mpLobbyChoose({ profile: { female: b.dataset.v === 'f' } });
  else if (act === 'color') mpLobbyChoose({ profile: { color: b.dataset.v } });
  else if (act === 'metal') mpLobbyChoose({ profile: { arms: { metal: b.dataset.v } } });
  else if (act === 'charge') mpLobbyChoose({ profile: { arms: { charge: b.dataset.v } } });
  else if (act === 'diff') mpLobbyChoose({ difficulty: b.dataset.v });
  else if (act === 'start') {
    const r = mpLobbyStart();
    if (!r) return;
    closeLobby();
    lbHooks.startHost({ ...lbProfile, ...r.profile, difficulty: r.difficulty, seat: r.seat });
  } else if (act === 'leave') { mpLobbyLeave(); lbStep = 'wahl'; lbStatus = ''; renderLobby(); }
  else if (act === 'back') { if (G.mp && G.mp.phase === 'lobby') mpLobbyLeave(); closeLobby(); }
}

function onLobbyChange(e) {
  if (e.target.id === 'lb-seat') { mpLobbyChoose({ seat: e.target.value }); e.target.blur(); }
  if (e.target.id === 'lb-name') sendName(e.target.value);
}
// Name: kurz nach dem Tippen an alle
function onLobbyInput(e) {
  if (e.target.id !== 'lb-name') return;
  clearTimeout(lbNameT);
  const v = e.target.value;
  lbNameT = setTimeout(() => sendName(v), 450);
}
function sendName(v) { const n = String(v || '').trim(); if (n) mpLobbyChoose({ profile: { name: n } }); }

function onLobbyKey(e) {
  if (e.target.id === 'lb-chat' && e.key === 'Enter') { e.preventDefault(); mpChat(e.target.value); e.target.value = ''; }
  if (e.key === 'Escape') { e.stopPropagation(); }
}
