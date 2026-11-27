// Mehrspieler-Lobby im Startmenü: Partie eröffnen oder beitreten, dann alle in einer Liste mit Wappenfarbe, Burg und
// „bereit“; der Gastgeber stellt die Schwierigkeit ein und startet, Gäste wählen ihre Burg und melden sich bereit.
// Chat für alle. Die Regeln dahinter stehen in mp.js; hier nur die Oberfläche. main.js reicht über initLobby die Dinge
// herein, die zum Spielstart gehören (Profil aus dem Startmenü, Welt erschaffen, als Gast einsteigen, Ladetafel).

import { G } from './state.js';
import { byId, esc } from './ui.js';
import { mpLobbyHost, mpLobbyJoin, mpLobbyChoose, mpLobbyStart, mpLobbyLeave, mpChat, lobbyView } from './mp.js';

let lbHooks = null, lbStep = 'wahl', lbStatus = '', lbProfile = null, lbSig = '';
const LOBBY_DIFF = [['leicht', 'Leicht'], ['mittel', 'Mittel'], ['schwer', 'Schwer']];
const isDesktop = () => !!(window.ritterDesktop && window.ritterDesktop.relay);

export function initLobby(h) {
  lbHooks = h;
  byId('btn-mp').addEventListener('click', openLobby);
  const box = byId('lobby');
  box.addEventListener('click', onLobbyClick);
  box.addEventListener('change', onLobbyChange);
  box.addEventListener('keydown', onLobbyKey);
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
    setTimeout(() => lbHooks.startGuest(d, lbProfile), 30);
  },
  onClosed: (msg) => { lbHooks.hideLoading(); lbStep = 'wahl'; lbStatus = msg; byId('lobby').hidden = false; renderLobby(); },
  onFail: (msg) => { lbStep = 'wahl'; lbStatus = msg; renderLobby(); },
};

function renderLobby() {
  const card = byId('lobby-card');
  lbSig = '';
  if (lbStep === 'wahl') {
    const hint = isDesktop()
      ? 'Wer eröffnet, ist Gastgeber. Seine Mitspieler im Heimnetz tragen die Adresse ein, die ihm hier gleich angezeigt wird. Auf demselben PC (zweites Fenster) bleibt das Adressfeld leer.'
      : 'In dieser Browser-Fassung spielen zwei Fenster im selben Browser miteinander; das Adressfeld bleibt dann leer. Mit Freunden im Netz spielt ihr über die Desktop-App.';
    card.innerHTML = `
      <h2>Mehrspieler</h2>
      <p class="lb-note">Dein Held kommt aus dem Startmenü: Name, Figur und Wappen dort einstellen, dann hier eröffnen oder beitreten.</p>
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
    <table class="lb-players"><thead><tr><th>Spieler</th><th>Burg</th><th>Bereit</th></tr></thead><tbody id="lb-players"></tbody></table>
    <div id="lb-mine"></div>
    <div id="lb-diff"></div>
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
  const info = v.role === 'host'
    ? (v.lan && v.lan.length ? `Du bist Gastgeber. Mitspieler tragen ein: Partie <b>${esc(v.room)}</b>, Adresse <b>${esc(v.lan.map((a) => a.replace(/^ws:\/\//, '').replace(/:8765$/, '')).join(' oder '))}</b>.`
      : `Du bist Gastgeber. Mitspieler treten der Partie <b>${esc(v.room)}</b> bei.`)
    : 'Wähle deine Burg und melde dich bereit. Der Gastgeber startet das Spiel.';
  set('lb-info', info);
  set('lb-players', v.players.map((p) => `<tr${p.id === v.me.id ? ' class="me"' : ''}>
      <td><span class="lb-dot" style="background:${esc(p.color || '#888')}"></span>${esc(p.name)}${p.host ? ' <span class="lb-tag">Gastgeber</span>' : ''}${p.id === v.me.id ? ' <span class="lb-tag">du</span>' : ''}</td>
      <td>${esc(p.seat === 'heim' ? 'Heimburg' : (v.seats.find((s) => s.id === p.seat) || { label: '–' }).label)}</td>
      <td>${p.ready ? '✔' : '…'}</td></tr>`).join(''));
  // Burgwahl (Gäste): nur neu zeichnen, wenn sich die Auswahl ändert, sonst klappt das Menü beim Öffnen zu
  if (v.role === 'guest') {
    const s2 = JSON.stringify([v.me.seat, v.seats.map((s) => s.free)]);
    if (s2 !== lbSig) {
      lbSig = s2;
      set('lb-mine', `<label class="lb-field">Deine Burg
        <select id="lb-seat">${v.seats.map((s) => `<option value="${esc(s.id)}"${s.id === v.me.seat ? ' selected' : ''}${s.free || s.id === v.me.seat ? '' : ' disabled'}>${esc(s.label)}${s.free || s.id === v.me.seat ? '' : ' (vergeben)'}</option>`).join('')}</select></label>`);
    }
  } else set('lb-mine', '');
  const diffName = (LOBBY_DIFF.find((d) => d[0] === v.difficulty) || LOBBY_DIFF[0])[1];
  set('lb-diff', v.role === 'host'
    ? `<div class="lb-field">Schwierigkeit der Barone <div class="seg">${LOBBY_DIFF.map(([k, n]) => `<button type="button" class="btn sm${v.difficulty === k ? ' primary' : ''}" data-lb="diff" data-v="${k}">${n}</button>`).join('')}</div></div>`
    : `<p class="lb-note">Schwierigkeit der Barone: <b>${esc(diffName)}</b></p>`);
  set('lb-chatlog', v.chat.map((c) => `<div><b>${esc(c.name)}:</b> ${esc(c.text)}</div>`).join('') || '<div class="muted">Noch keine Nachrichten.</div>');
  const log = byId('lb-chatlog'); if (log) log.scrollTop = log.scrollHeight;
  const guests = v.players.filter((p) => !p.host);
  set('lb-actions', v.role === 'host'
    ? `<button type="button" class="btn primary" data-lb="start"${v.allReady ? '' : ' disabled'}>Spiel starten</button>
       <button type="button" class="btn" data-lb="leave">Partie schließen</button>
       <span class="lb-hint">${guests.length ? (v.allReady ? 'Alle sind bereit.' : 'Warte, bis alle bereit sind.') : 'Du kannst auch allein starten; Mitspieler können später noch beitreten.'}</span>`
    : `<button type="button" class="btn primary" data-lb="ready">${v.me.ready ? 'Doch nicht bereit' : 'Bereit'}</button>
       <button type="button" class="btn" data-lb="leave">Verlassen</button>`);
}

function onLobbyClick(e) {
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
  else if (act === 'diff') mpLobbyChoose({ difficulty: b.dataset.v });
  else if (act === 'start') {
    const r = mpLobbyStart();
    if (!r) return;
    closeLobby();
    lbHooks.startHost({ ...lbProfile, difficulty: r.difficulty });
  } else if (act === 'leave') { mpLobbyLeave(); lbStep = 'wahl'; lbStatus = ''; renderLobby(); }
  else if (act === 'back') { if (G.mp && G.mp.phase === 'lobby') mpLobbyLeave(); closeLobby(); }
}

function onLobbyChange(e) {
  if (e.target.id === 'lb-seat') mpLobbyChoose({ seat: e.target.value });
}

function onLobbyKey(e) {
  if (e.target.id === 'lb-chat' && e.key === 'Enter') { e.preventDefault(); mpChat(e.target.value); e.target.value = ''; }
  if (e.key === 'Escape') { e.stopPropagation(); }
}
