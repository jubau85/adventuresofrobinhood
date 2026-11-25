// Musik, live im Browser erzeugt (Web Audio): gezupfte Laute, Flöte, Hörner, Bordun und Trommel.
// Stimmungen: Titel (episch), Welt (Estampie im Dreiertakt), Nacht (ruhig), Kampf (Trommeln).
// Startet erst nach einer Eingabe des Spielers, so wie Browser es verlangen.

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

function tick() {
  if (!ac || !enabled) return;
  if (ac.currentTime < nextTime - 0.8) return;
  const t0 = Math.max(nextTime, ac.currentTime + 0.1);
  if (mood !== playingMood) {
    playingMood = mood;
    setDrone(true, mood === 'titel' ? [38, 45] : mood === 'kampf' ? [38, 50] : [38, 45]);
  }
  nextTime = mood === 'titel' ? schedTitle(t0) : schedWorld(t0, mood);
}
