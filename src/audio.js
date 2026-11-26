// Musik, live im Browser erzeugt (Web Audio): gezupfte Laute, Flöte, Hörner, Bordun und Trommel.
// Stimmungen: Titel (episch), Welt (Estampie im Dreiertakt), Nacht (ruhig), Kampf (Trommeln).
// Dazu fertige Aufnahmen aus assets/musik und assets/sound (Sound-Brief): Wo es eine passende gibt,
// spielt sie statt der erzeugten Musik. Hintergrundgeräusche laufen darunter in einer Schleife.
// Startet erst nach einer Eingabe des Spielers, so wie Browser es verlangen.

import { G } from './state.js';
import { isoX } from './iso.js';

let ac = null, master = null, dry = null, wet = null;
let enabled = true, started = false;
let mood = 'titel', playingMood = null;
let nextTime = 0, phraseIdx = 0, timer = null;
let droneNodes = null;
const pluckCache = new Map();

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------- Einstellungen
export function musicEnabled() { return enabled; }

export function loadMusicPref() {
  try { const v = localStorage.getItem('ritter-musik'); enabled = v === null ? true : v === '1'; } catch (e) { enabled = true; }
  return enabled;
}

export function setMusicEnabled(on) {
  enabled = on;
  try { localStorage.setItem('ritter-musik', on ? '1' : '0'); } catch (e) { /* ohne Speicher */ }
  if (!ac) { if (on) startAudio(); return; }
  const now = ac.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setTargetAtTime(on ? 0.55 : 0, now, 0.4);
  if (on && ac.state === 'suspended') ac.resume();
}

export function setMood(m) { mood = m; }

// ---------------------------------------------------------------- Aufbau
function makeImpulse(seconds, decay) {
  const sr = ac.sampleRate, len = Math.floor(sr * seconds);
  const buf = ac.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export function startAudio() {
  if (started || !enabled) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try { ac = new AC(); } catch (e) { return; }
  started = true;
  master = ac.createGain();
  master.gain.value = 0;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 3;
  master.connect(comp); comp.connect(ac.destination);
  dry = ac.createGain(); dry.gain.value = 0.85; dry.connect(master);
  const conv = ac.createConvolver(); conv.buffer = makeImpulse(3.2, 2.6);
  wet = ac.createGain(); wet.gain.value = 0.35; wet.connect(conv); conv.connect(master);
  master.gain.setTargetAtTime(0.55, ac.currentTime, 1.2);
  fileBus = ac.createGain(); fileBus.gain.value = 1; fileBus.connect(master);
  sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  loadFiles();
  nextTime = ac.currentTime + 0.3;
  timer = setInterval(tick, 150);
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend(); else if (enabled) ac.resume();
  });
}

function out(node, send = 0.4) {
  node.connect(dry);
  if (send > 0) { const s = ac.createGain(); s.gain.value = send; node.connect(s); s.connect(wet); }
}

// ---------------------------------------------------------------- Instrumente
function pluckBuffer(m) {
  let b = pluckCache.get(m);
  if (b) return b;
  const sr = ac.sampleRate, len = Math.floor(sr * 2.4);
  b = ac.createBuffer(1, len, sr);
  const d = b.getChannelData(0);
  const N = Math.max(2, Math.round(sr / midiHz(m)));
  const ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const a = ring[idx], c = ring[(idx + 1) % N];
    ring[idx] = (a + c) * 0.5 * 0.996;
    d[i] = a;
    idx = (idx + 1) % N;
  }
  pluckCache.set(m, b);
  return b;
}

function lute(m, t, vol = 0.32) {
  const src = ac.createBufferSource();
  src.buffer = pluckBuffer(m);
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
  const g = ac.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); out(g, 0.3);
  src.start(t); src.stop(t + 2.4);
}

function flute(m, t, dur, vol = 0.12) {
  const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = midiHz(m);
  const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = midiHz(m) * 2;
  const g2 = ac.createGain(); g2.gain.value = 0.12;
  const lfo = ac.createOscillator(); lfo.frequency.value = 5.2;
  const lg = ac.createGain(); lg.gain.value = 0;
  lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(midiHz(m) * 0.008, t + Math.min(0.5, dur * 0.6));
  lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.07);
  g.gain.setValueAtTime(vol * 0.85, t + Math.max(0.08, dur - 0.12));
  g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
  o.connect(g); o2.connect(g2); g2.connect(g); out(g, 0.5);
  for (const n of [o, o2, lfo]) { n.start(t); n.stop(t + dur + 0.1); }
}

function horn(m, t, dur, vol = 0.07) {
  const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiHz(m);
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2;
  f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1400, t + 0.25); f.frequency.linearRampToValueAtTime(800, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.2);
  g.gain.setValueAtTime(vol, t + dur - 0.3); g.gain.linearRampToValueAtTime(0, t + dur + 0.1);
  o.connect(f); f.connect(g); out(g, 0.6);
  o.start(t); o.stop(t + dur + 0.2);
}

function drum(t, vol = 0.5, low = true) {
  const o = ac.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(low ? 95 : 160, t); o.frequency.exponentialRampToValueAtTime(low ? 45 : 90, t + 0.25);
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + (low ? 0.45 : 0.18));
  o.connect(g); out(g, 0.25);
  o.start(t); o.stop(t + 0.5);
  const len = Math.floor(ac.sampleRate * 0.12);
  const nb = ac.createBuffer(1, len, ac.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const n = ac.createBufferSource(); n.buffer = nb;
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = low ? 220 : 900;
  const ng = ac.createGain(); ng.gain.value = vol * 0.35;
  n.connect(bp); bp.connect(ng); out(ng, 0.2);
  n.start(t);
}

function setDrone(on, roots = [38, 45]) {
  if (droneNodes) {
    const old = droneNodes;
    const now = ac.currentTime;
    old.g.gain.setTargetAtTime(0, now, 0.6);
    setTimeout(() => old.oscs.forEach((o) => { try { o.stop(); } catch (e) { /* schon aus */ } }), 3000);
    droneNodes = null;
  }
  if (!on) return;
  const g = ac.createGain(); g.gain.value = 0;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
  const oscs = roots.map((m, i) => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiHz(m); o.detune.value = i ? 4 : -3; o.connect(f); o.start(); return o; });
  f.connect(g); out(g, 0.5);
  g.gain.setTargetAtTime(0.035, ac.currentTime, 1.5);
  droneNodes = { g, oscs };
}

// ---------------------------------------------------------------- Noten
// Titel: D-Moll, langsam und weit. Je Takt: Melodie [Ton, Schläge], Akkord für Hörner und Laute.
const TITLE = {
  bpm: 64, beats: 4,
  bars: [
    { mel: [[69, 2], [67, 1], [65, 1]], ch: [50, 57, 62] },
    { mel: [[67, 2], [69, 1], [72, 1]], ch: [46, 53, 58] },
    { mel: [[74, 3], [72, 1]], ch: [48, 55, 60] },
    { mel: [[69, 4]], ch: [45, 52, 57] },
    { mel: [[65, 2], [67, 1], [69, 1]], ch: [50, 57, 62] },
    { mel: [[70, 2], [69, 1], [67, 1]], ch: [46, 53, 58] },
    { mel: [[69, 2], [67, 1], [64, 1]], ch: [48, 55, 60] },
    { mel: [[62, 4]], ch: [50, 57, 62] },
  ],
};

// Welt: D-Dorisch im Dreiertakt. Vier Phrasen zu je vier Takten.
const CH = { Dm: [50, 53, 57], G: [55, 59, 62], C: [48, 52, 55], Am: [45, 48, 52], F: [41, 45, 48], Em: [52, 55, 59] };
const WORLD = [
  { mel: [[[74, 1], [72, 0.5], [71, 0.5], [69, 1]], [[67, 1], [69, 1], [65, 1]], [[64, 1], [65, 0.5], [67, 0.5], [69, 1]], [[62, 3]]], ch: ['Dm', 'G', 'C', 'Dm'] },
  { mel: [[[69, 1], [71, 0.5], [72, 0.5], [74, 1]], [[72, 1], [69, 1], [67, 1]], [[65, 1], [64, 1], [67, 1]], [[69, 3]]], ch: ['Am', 'F', 'C', 'Am'] },
  { mel: [[[65, 0.5], [67, 0.5], [69, 1], [65, 1]], [[67, 0.5], [69, 0.5], [71, 1], [67, 1]], [[69, 1], [67, 1], [64, 1]], [[62, 3]]], ch: ['Dm', 'G', 'C', 'Dm'] },
  { mel: [[[62, 1], [64, 1], [65, 1]], [[67, 1.5], [65, 0.5], [64, 1]], [[62, 1], [60, 1], [64, 1]], [[62, 3]]], ch: ['Dm', 'C', 'Am', 'Dm'] },
];
const WORLD_ORDER = [0, 1, 0, 2, 3, 1, 2, 0];

function schedTitle(t0) {
  const spb = 60 / TITLE.bpm;
  let t = t0;
  TITLE.bars.forEach((bar, i) => {
    const barLen = TITLE.beats * spb;
    for (const m of bar.ch) horn(m, t, barLen * 0.98, 0.05);
    lute(bar.ch[0] - 12, t, 0.35);
    [0, 1, 2, 1].forEach((k, j) => lute(bar.ch[k] + 12, t + j * spb, 0.16));
    drum(t, 0.55); drum(t + 2 * spb, 0.3);
    if (i % 4 === 3) { drum(t + 3 * spb, 0.25, false); drum(t + 3.5 * spb, 0.3, false); }
    let mt = t;
    for (const [m, b] of bar.mel) { flute(m, mt, b * spb * 0.95, 0.11); mt += b * spb; }
    t += barLen;
  });
  return t;
}

function schedWorld(t0, kind) {
  const bpm = kind === 'kampf' ? 132 : kind === 'nacht' ? 76 : 104;
  const spb = 60 / bpm;
  const ph = WORLD[WORLD_ORDER[phraseIdx % WORLD_ORDER.length]];
  phraseIdx++;
  let t = t0;
  ph.mel.forEach((bar, bi) => {
    const ch = CH[ph.ch[bi]];
    const pattern = kind === 'nacht' ? [0, 2] : [0, 1, 2, 1, 2, 1];
    const step = (3 * spb) / pattern.length;
    pattern.forEach((k, j) => lute(ch[k] + (j % 3 === 2 ? 12 : 0), t + j * step, kind === 'nacht' ? 0.18 : 0.22));
    if (kind !== 'nacht') {
      drum(t, kind === 'kampf' ? 0.55 : 0.32);
      drum(t + 2 * spb, kind === 'kampf' ? 0.35 : 0.14, false);
      if (kind === 'kampf') { drum(t + spb, 0.3); drum(t + 2.5 * spb, 0.25, false); }
    }
    let mt = t;
    for (const [m, b] of bar) { flute(m + (kind === 'nacht' ? -12 : 0), mt, b * spb * 0.92, kind === 'nacht' ? 0.08 : 0.1); mt += b * spb; }
    t += 3 * spb;
  });
  return t;
}

// ---------------------------------------------------------------- Aufnahmen
// Fehlt eine Datei oder lädt sie nicht, bleibt es bei der erzeugten Musik und Stille.
const FILES = {
  welt_sommer: 'assets/musik/welt_sommer.mp3',
  wiese_tag: 'assets/sound/ambiente/wiese_tag.mp3',
};
const buffers = {};
let fileBus = null, want = { music: null, amb: null }, track = null, ambTrack = null, restUntil = 0;

// Was gerade laufen soll: ein Musikstück und ein Hintergrund (Namen aus FILES oder null)
export function setScene(music, amb) { want = { music: music || null, amb: amb || null }; }

function loadFiles() {
  for (const [id, url] of Object.entries(FILES)) {
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => new Promise((ok, no) => ac.decodeAudioData(b, ok, no)))
      .then((buf) => { buffers[id] = buf; })
      .catch(() => { /* ohne Datei geht es weiter wie bisher */ });
  }
}

function fadeTo(g, to, tc) {
  const now = ac.currentTime;
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(g.gain.value, now);
  g.gain.setTargetAtTime(to, now, tc);
}

function startTrack(id, loop, level) {
  const src = ac.createBufferSource();
  src.buffer = buffers[id]; src.loop = loop;
  const g = ac.createGain(); g.gain.value = 0;
  src.connect(g); g.connect(fileBus);
  src.start();
  fadeTo(g, level, 1.2);
  return { id, src, g, endsAt: loop ? Infinity : ac.currentTime + buffers[id].duration };
}

function stopTrack(t, tc = 1.2) {
  fadeTo(t.g, 0, tc);
  setTimeout(() => { try { t.src.stop(); } catch (e) { /* schon aus */ } t.g.disconnect(); }, tc * 6000);
}

// Musikstück einmal ganz, dann eine Pause nur mit Hintergrund, dann wieder von vorn
function updateFiles() {
  const m = want.music && buffers[want.music] ? want.music : null;
  if (track && track.id !== m) { stopTrack(track); track = null; restUntil = 0; }
  if (track && ac.currentTime >= track.endsAt - 0.05) { track = null; restUntil = ac.currentTime + 18 + Math.random() * 22; }
  if (!track && m && ac.currentTime >= restUntil) track = startTrack(m, false, 0.9);
  const a = want.amb && buffers[want.amb] ? want.amb : null;
  if (ambTrack && ambTrack.id !== a) { stopTrack(ambTrack, 1.5); ambTrack = null; }
  if (!ambTrack && a) ambTrack = startTrack(a, true, 0.7);
}

// ---------------------------------------------------------------- Geräusche
// Live erzeugt aus Rauschen, Tönen und Hüllkurven, jedes Mal ein wenig anders. Leiser mit der Entfernung zum
// Helden, links oder rechts nach der Lage im Bild, ferne Geräusche mit etwas mehr Hall.
let sfxBus = null, noiseBuffer = null;
const lastKind = {};
let voicesT = 0, voices = 0;
const vary = (v, k = 0.06) => v * (1 + (Math.random() * 2 - 1) * k);

function noiseBuf() {
  if (noiseBuffer) return noiseBuffer;
  const len = ac.sampleRate;
  noiseBuffer = ac.createBuffer(1, len, ac.sampleRate);
  const d = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}
function envGain(t, attack, peak, decay) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}
// Rauschen durch einen Filter, auf Wunsch mit wandernder Mittenfrequenz
function nz(out, t, { type = 'bandpass', f = 1000, f2 = null, q = 1, vol = 0.5, a = 0.002, d = 0.1 }) {
  const n = ac.createBufferSource(); n.buffer = noiseBuf();
  n.playbackRate.value = vary(1, 0.2);
  const flt = ac.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
  if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  const g = envGain(t, a, vol, d);
  n.connect(flt); flt.connect(g); g.connect(out);
  n.start(t, Math.random() * 0.5); n.stop(t + a + d + 0.05);
}
// Ein Teilton, auf Wunsch mit fallender Tonhöhe
function tone(out, t, { f = 440, f2 = null, type = 'sine', vol = 0.3, a = 0.002, d = 0.3 }) {
  const o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  const g = envGain(t, a, vol, d);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + a + d + 0.05);
}

const SFX = {
  // Schmied: Hammer auf Amboss, heller Klang mit unharmonischen Obertönen
  amboss(o, t) {
    const f = vary(980, 0.05);
    [[1, 0.42, 1.1], [2.76, 0.26, 0.8], [5.4, 0.15, 0.5], [8.93, 0.08, 0.3]].forEach(([r, v, d]) => tone(o, t, { f: f * r, vol: v, d }));
    nz(o, t, { f: 3500, q: 1, vol: 0.35, d: 0.03 });
  },
  // Baustelle: Hammer auf Holz
  hammer(o, t) {
    nz(o, t, { f: vary(450, 0.15), q: 1.2, vol: 0.7, d: 0.09 });
    tone(o, t, { f: vary(140), f2: 90, vol: 0.55, d: 0.08 });
    nz(o, t, { type: 'highpass', f: 2200, vol: 0.22, d: 0.015 });
  },
  axt(o, t) {
    nz(o, t, { f: vary(900, 0.15), q: 1.5, vol: 0.6, d: 0.12 });
    tone(o, t, { f: vary(220), f2: 160, vol: 0.32, d: 0.1 });
    nz(o, t + 0.03, { type: 'highpass', f: 3000, vol: 0.18, d: 0.05 });
  },
  hacke(o, t) {
    nz(o, t, { type: 'lowpass', f: vary(500, 0.2), vol: 0.55, d: 0.12 });
    nz(o, t + 0.01, { f: 1600, q: 0.8, vol: 0.14, d: 0.05 });
  },
  hieb(o, t) { nz(o, t, { f: 700, f2: 2600, q: 1.4, vol: 0.32, a: 0.07, d: 0.13 }); },
  klirren(o, t) {
    const f = vary(1500, 0.1);
    [[1, 0.3, 0.35], [2.1, 0.18, 0.25], [3.7, 0.1, 0.15]].forEach(([r, v, d]) => tone(o, t, { f: f * r, vol: v, d }));
    nz(o, t, { type: 'highpass', f: 4000, vol: 0.25, d: 0.03 });
  },
  treffer(o, t) {
    nz(o, t, { type: 'lowpass', f: 600, vol: 0.6, d: 0.1 });
    tone(o, t, { f: vary(95), f2: 60, vol: 0.45, d: 0.08 });
  },
  schild(o, t) {
    nz(o, t, { f: vary(320, 0.1), q: 1.6, vol: 0.75, d: 0.14 });
    tone(o, t, { f: vary(110), f2: 75, vol: 0.5, d: 0.12 });
  },
  bogen(o, t) {
    tone(o, t, { f: vary(170), f2: 110, type: 'triangle', vol: 0.32, d: 0.14 });
    nz(o, t + 0.01, { f: 1800, f2: 900, q: 1, vol: 0.12, a: 0.02, d: 0.14 });
  },
  armbrust(o, t) {
    nz(o, t, { type: 'highpass', f: 1500, vol: 0.45, d: 0.03 });
    tone(o, t, { f: vary(240), f2: 170, type: 'triangle', vol: 0.3, d: 0.1 });
  },
  trebuchet(o, t) {
    tone(o, t, { f: 70, f2: 52, type: 'sawtooth', vol: 0.12, a: 0.05, d: 0.5 });
    nz(o, t + 0.15, { f: 300, f2: 900, q: 0.8, vol: 0.25, a: 0.25, d: 0.35 });
  },
  einschlag(o, t) {
    nz(o, t, { type: 'lowpass', f: 320, vol: 0.9, d: 0.45 });
    tone(o, t, { f: 62, f2: 40, vol: 0.6, d: 0.3 });
    for (let k = 0; k < 8; k++) nz(o, t + 0.05 + Math.random() * 0.5, { f: vary(1500, 0.4), q: 1.2, vol: 0.12, d: 0.04 });
  },
  einsturz(o, t) {
    nz(o, t, { type: 'lowpass', f: 260, vol: 1, a: 0.05, d: 1.6 });
    tone(o, t, { f: 55, f2: 35, vol: 0.6, d: 0.8 });
    for (let k = 0; k < 22; k++) nz(o, t + Math.random() * 1.4, { f: vary(1300, 0.5), q: 1, vol: 0.14, d: 0.05 });
  },
  tor(o, t) {
    nz(o, t, { type: 'lowpass', f: 220, vol: 0.9, d: 0.28 });
    tone(o, t, { f: 72, f2: 50, vol: 0.5, d: 0.22 });
    nz(o, t + 0.16, { f: 2500, q: 2, vol: 0.3, d: 0.03 });
  },
  lanze(o, t) {
    nz(o, t, { f: 1200, q: 0.8, vol: 0.8, d: 0.25 });
    nz(o, t, { type: 'highpass', f: 3000, vol: 0.4, d: 0.05 });
    tone(o, t, { f: 130, f2: 80, vol: 0.4, d: 0.12 });
  },
  muenzen(o, t) {
    for (let k = 0; k < 4; k++) {
      const tt = t + k * vary(0.07, 0.4), f = 2600 + Math.random() * 1800;
      tone(o, tt, { f, vol: 0.09, d: vary(0.12, 0.3) });
      tone(o, tt, { f: f * 2.4, vol: 0.04, d: 0.06 });
    }
  },
  glocke(o, t) {
    const f = 300;
    [[0.5, 0.22, 5], [1, 0.3, 4], [1.2, 0.17, 3], [1.5, 0.12, 3], [2, 0.15, 2.5], [2.5, 0.07, 1.5], [3, 0.05, 1]]
      .forEach(([r, v, d]) => tone(o, t, { f: f * r, vol: v, d }));
  },
  knistern(o, t) {
    for (let k = 0; k < 3; k++) nz(o, t + Math.random() * 0.2, { type: 'highpass', f: vary(1400, 0.3), vol: 0.1 + Math.random() * 0.25, d: 0.012 + Math.random() * 0.015 });
  },
};

// Geräusch ohne Ort (Bedienung, Münzen)
export function sfx(kind, vol = 1) { playSfx(kind, vol, 0, 0); }

// Geräusch an einem Ort der Welt
export function sfxAt(kind, x, y, vol = 1, range = 22) {
  if (!ac || !enabled || !G.s) return;
  const p = G.s.player;
  const d = Math.hypot(x - p.x, y - p.y);
  if (d > range) return;
  const k = 1 - d / range;
  const pan = Math.max(-1, Math.min(1, ((isoX(x, y) - G.cam.x) * G.cam.zoom) / (G.view.w / 2))) * 0.75;
  playSfx(kind, vol * k * k, pan, d / range);
}

function playSfx(kind, vol, pan, far) {
  if (!ac || !enabled || !SFX[kind] || vol < 0.02) return;
  const now = ac.currentTime;
  // Gleiche Geräusche nicht übereinander stapeln, insgesamt höchstens zwölf je Zehntelsekunde
  if (now - (lastKind[kind] || 0) < 0.045) return;
  if (now - voicesT > 0.1) { voicesT = now; voices = 0; }
  if (++voices > 12) return;
  lastKind[kind] = now;
  const g = ac.createGain(); g.gain.value = Math.min(1, vol);
  const pn = ac.createStereoPanner ? ac.createStereoPanner() : null;
  if (pn) { pn.pan.value = pan; g.connect(pn); pn.connect(sfxBus); } else g.connect(sfxBus);
  if (far > 0.2) { const s = ac.createGain(); s.gain.value = 0.25 * far; g.connect(s); s.connect(wet); }
  SFX[kind](g, now + 0.005);
  setTimeout(() => g.disconnect(), 6500);
}

// Werkzeuge im Bild: Jeder Schlag erklingt in dem Augenblick, in dem das Werkzeug trifft (siehe render.js)
let lastWorkT = null;
export function playWork(list) {
  if (!ac || !enabled || !G.s) return;
  const now = G.time;
  if (lastWorkT === null || G.fast || now < lastWorkT || now - lastWorkT > 0.5) { lastWorkT = now; return; }
  const prev = lastWorkT; lastWorkT = now;
  let n = 0;
  for (const e of list) {
    const a = prev * e.speed + e.phase - Math.PI, b = now * e.speed + e.phase - Math.PI;
    if (Math.floor(b / (Math.PI * 2)) > Math.floor(a / (Math.PI * 2))) { sfxAt(e.kind, e.x, e.y, e.kind === 'amboss' ? 0.55 : 0.75, 18); if (++n >= 6) break; }
  }
}

// Für Tests: was geladen ist und was gerade läuft
export function audioDebug() {
  return { started, state: ac && ac.state, loaded: Object.keys(buffers), music: track && track.id, amb: ambTrack && ambTrack.id, resting: !!ac && !track && ac.currentTime < restUntil, want, lastSfx: { ...lastKind } };
}

function fileMusicActive() { return !!(want.music && buffers[want.music]) && (!!track || ac.currentTime < restUntil); }

function tick() {
  if (!ac || !enabled) return;
  updateFiles();
  // Läuft eine Aufnahme (oder die Pause danach), schweigt die erzeugte Musik
  if (fileMusicActive()) {
    if (droneNodes) setDrone(false);
    playingMood = null;
    nextTime = ac.currentTime + 0.3;
    return;
  }
  if (ac.currentTime < nextTime - 0.8) return;
  const t0 = Math.max(nextTime, ac.currentTime + 0.1);
  if (mood !== playingMood) {
    playingMood = mood;
    setDrone(true, mood === 'titel' ? [38, 45] : mood === 'kampf' ? [38, 50] : [38, 45]);
  }
  nextTime = mood === 'titel' ? schedTitle(t0) : schedWorld(t0, mood);
}
