// Vorspann beim Start. Erst das Studio („Kuki and Karmen Productions“, 100% AI, Made by Jakob) in voller Auflösung mit
// Glut, Goldschrift, Glanz und Fanfare. Dann die Vorgeschichte im Stil der Amiga-Spiele der 90er: 320 × 200 Bildpunkte,
// jedes Bild mit höchstens 32 Farben aus der 12-Bit-Palette und Raster-Dithering, Schreibmaschinentext in der
// Pixelschrift, kleine Farbzyklen (Sterne, Feuer, Kerzen, Möwen) und Tracker-Musik aus 8-Bit-Samples. Zum Schluss
// wird das Pixelbild zum gemalten Titelbild darunter. Leertaste, Enter oder Klick blättert weiter, Esc überspringt alles.
// Bilder und Musik sind hier im Code gemalt und gesetzt; Vorgaben für Oakgen-Fassungen stehen in assets/INTRO-BRIEF.md.

import { G } from './state.js';
import { byId } from './ui.js';
import { PIXFONT } from './pixelfont.js';
import { drawTitleArt, drawCastle, drawKnight } from './titleart.js';
import { startAudio, setHush, introOut, audioRunning, musicEnabled, audioBuffer } from './audio.js';
import { ART } from './assets.js';

const IV_STORY = [
  { bild: 'kerker', text: 'Im Jahre des Herrn 1194. Auf der Heimkehr vom Kreuzzug fiel König Richard Löwenherz in die Hand seiner Feinde. Über ein Jahr lag er in fremden Kerkern, fern von England.' },
  { bild: 'krone', text: 'Derweil griff sein Bruder Johann nach der Krone. Seine Barone besetzten die Burgen, und seine Vögte pressten das Land aus bis auf den letzten Pfennig.' },
  { bild: 'banner', text: 'Nun ist der König frei. Doch noch wehen Johanns Banner über den Burgen, die Sachsen murren gegen die normannischen Herren, und das Land findet keine Ruhe.' },
  { bild: 'wald', text: 'In den Wäldern sammeln sich die Geächteten. Jenseits des Kanals greift König Philipp nach der Normandie, und von Wales bis Irland rüsten die Barone zum Krieg.' },
  { bild: 'heimkehr', text: 'Du aber kehrst heim aus dem Heiligen Land, mit nichts als deinem Schwert, deinem Pferd und deinem Namen.' },
  { bild: 'burgstall', text: 'Von deinem Erbe ist nur ein verfallener Burgstall geblieben. Sammle Gefolge, baue deine Burg, gewinne Ruhm und Land. England wartet auf seinen Ritter.' },
];
const IV_HINT = 'Leertaste: weiter · Esc: überspringen';
// Zeitplan des Studio-Vorspanns (Sekunden): zur erzeugten Fanfare und zur Aufnahme von Oakgen (assets/intro/studio.mp3,
// Marken aus ihrem Lautstärkeverlauf: Schlag 1,5, Stempel 3,7, Höhepunkt ab 4,5, Schlusshit 8,4)
const IV_T_SYNTH = { hit: 1.4, prod: 2.4, stamp: 3.6, write: 4.8, climax: 4.8, shine: [2.6, 5.4, 7.1], final: 0, fade: 8.2, fadeLen: 1.0, end: 9.4 };
const IV_T_FILE = { hit: 1.5, prod: 2.35, stamp: 3.52, write: 4.5, climax: 4.5, shine: [2.7, 5.3, 8.4], final: 8.4, fade: 8.75, fadeLen: 1.05, end: 10.0 };
let IV = null;   // der laufende Vorspann

// Nicht in automatischen Tests (außer mit ?intro) und nicht mit ?ohneintro
export function introWanted() {
  const q = location.search || '';
  if (/[?&]ohneintro\b/.test(q)) return false;
  if (/[?&]intro\b/.test(q)) return true;
  return !navigator.webdriver;
}

// opts.storyOnly: nur die Vorgeschichte (Knopf im Startmenü), opts.onDone: danach
export function startIntro(opts = {}) {
  if (IV) return;
  const box = byId('intro'), cv = byId('intro-cv');
  if (!box || !cv) return;
  IV = {
    box, cv, ctx: cv.getContext('2d'), hint: byId('intro-hint'), sr: byId('intro-text'),
    phase: 'warte', t: 0, pt: 0, last: performance.now(), storyOnly: !!opts.storyOnly, onDone: opts.onDone || null,
    w: 0, h: 0, dpr: 1, fonts: false, parts: [], slide: null, pics: [], fin: null, ending: false,
    reduce: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  };
  G.intro = true;
  setHush(true);
  box.hidden = false;
  box.classList.remove('aus');
  box.style.transitionDuration = '';
  IV.hint.textContent = '';
  startAudio();
  const fontsWanted = ['400 64px "IM Fell English SC"', 'italic 400 40px "Alegreya"', '700 40px "Alegreya Sans"', '500 30px "Alegreya Sans"', '400 60px "UnifrakturMaguntia"'];
  const I = IV;
  Promise.race([Promise.all(fontsWanted.map((f) => document.fonts.load(f).catch(() => null))), new Promise((ok) => setTimeout(ok, 1600))])
    .then(() => { I.fonts = true; });
  window.addEventListener('keydown', ivKey, true);
  box.addEventListener('pointerdown', ivPointer);
  requestAnimationFrame(ivLoop);
}

function ivPointer(e) { e.preventDefault(); startAudio(); ivNext(); }
function ivKey(e) {
  if (!IV) return;
  e.stopPropagation();
  if (e.key === 'Escape') { e.preventDefault(); ivEnd(true); return; }
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight' || IV.phase === 'tor' || IV.phase === 'finale') { e.preventDefault(); startAudio(); ivNext(); }
}

function ivBegin(I, phase) {
  I.phase = phase; I.pt = 0;
  if (phase === 'studio') {
    I.hint.textContent = IV_HINT; I.parts = [];
    const A = introOut(), buf = audioBuffer('intro_studio');
    I.T = buf && A ? IV_T_FILE : IV_T_SYNTH;
    I.sting = A ? (buf ? ivStudioFile(A, buf) : ivStudioSound(A)) : null;
  }
  if (phase === 'story') { I.hint.textContent = IV_HINT; ivStartStory(I); }
}

// Weiter: je nach Abschnitt
function ivNext() {
  const I = IV;
  if (!I || I.ending) return;
  if (I.phase === 'warte') return;
  if (I.phase === 'tor') { ivBegin(I, I.storyOnly ? 'story' : 'studio'); return; }
  if (I.phase === 'studio') { if (I.sting) I.sting.stop(); ivBegin(I, 'story'); return; }
  if (I.phase === 'story') { ivStoryNext(I); return; }
  if (I.phase === 'finale' && I.pt > 0.6) ivEnd(false);
}

// Ende: Spielmusik zurück, Titel wieder zeichnen, der Vorspann blendet darüber aus
function ivEnd(quick) {
  const I = IV;
  if (!I || I.ending) return;
  I.ending = true;
  if (I.sting) I.sting.stop();
  if (I.tracker) I.tracker.stop(quick ? 0.25 : 1.1);
  if (I.phase === 'finale' && !quick) ivFinaleSnapshot(I);
  G.intro = false;
  setHush(false);
  I.hint.textContent = '';
  I.box.style.transitionDuration = quick ? '0.45s' : '1.6s';
  I.box.classList.add('aus');
  setTimeout(() => {
    window.removeEventListener('keydown', ivKey, true);
    I.box.removeEventListener('pointerdown', ivPointer);
    I.box.hidden = true;
    I.box.classList.remove('aus');
    if (I.sr) I.sr.textContent = '';
    if (IV === I) IV = null;
    if (I.onDone) I.onDone();
  }, quick ? 480 : 1650);
}

function ivLoop(now) {
  const I = IV;
  if (!I) return;
  const dt = Math.min(0.1, Math.max(0, (now - I.last) / 1000));
  I.last = now; I.t += dt; I.pt += dt;
  ivFit(I);
  try {
    if (I.phase === 'warte') {
      const c = I.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, I.cv.width, I.cv.height);
      const can = audioRunning() || !musicEnabled();
      // Die Aufnahmen von Oakgen sind gleich geladen; länger als zweieinhalb Sekunden wird nicht gewartet
      const ready = !can || !musicEnabled() || audioBuffer(I.storyOnly ? 'intro_geschichte' : 'intro_studio') || I.pt > 2.5;
      if (I.fonts && ((can && ready) || (!can && I.pt > 0.4))) ivBegin(I, can ? (I.storyOnly ? 'story' : 'studio') : 'tor');
    } else if (I.phase === 'tor') ivGate(I);
    else if (I.phase === 'studio') { ivStudio(I, dt); if (I.pt > I.T.end && !I.ending) ivBegin(I, 'story'); }
    else if (I.phase === 'story') ivStory(I, dt);
    else if (I.phase === 'finale') ivFinale(I, dt);
  } catch (e) {
    // Lieber ohne Vorspann als ein hängender schwarzer Bildschirm
    console.error(e);
    ivEnd(true);
  }
  requestAnimationFrame(ivLoop);
}

function ivFit(I) {
  const w = window.innerWidth, h = window.innerHeight;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  while (dpr > 1 && w * h * dpr * dpr > 9e6) dpr = Math.max(1, dpr - 0.25);
  if (I.w === w && I.h === h && I.dpr === dpr) return;
  I.w = w; I.h = h; I.dpr = dpr;
  I.cv.width = Math.round(w * dpr); I.cv.height = Math.round(h * dpr);
  I.tl = null; I.vig = null;
}

const ivClamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ivEaseOut = (p) => 1 - Math.pow(1 - p, 3);
function ivRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- Startknopf (Browser verlangen eine Eingabe für Ton)
function ivGate(I) {
  const c = I.ctx, W = I.w, H = I.h;
  c.setTransform(I.dpr, 0, 0, I.dpr, 0, 0);
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  const s = Math.min(W, H) / 9, a = 0.55 + 0.45 * Math.sin(I.t * 2.2);
  const g = c.createRadialGradient(W / 2, H / 2 - s * 0.3, 0, W / 2, H / 2 - s * 0.3, s * 2.2);
  g.addColorStop(0, 'rgba(255,170,70,0.16)'); g.addColorStop(1, 'rgba(255,170,70,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `400 ${s}px "IM Fell English SC", Georgia, serif`;
  c.fillStyle = ivGoldGrad(c, H / 2 - s * 0.3, s);
  c.fillText('K & K', W / 2, H / 2 - s * 0.3);
  c.font = `500 ${Math.max(15, s * 0.22)}px "Alegreya Sans", sans-serif`;
  c.fillStyle = `rgba(255,236,200,${0.35 + 0.5 * a})`;
  c.fillText('Klicken oder eine Taste drücken', W / 2, H / 2 + s * 0.65);
}

// ================================================================ Studio
function ivGoldGrad(c, cy, size) {
  const g = c.createLinearGradient(0, cy - size * 0.55, 0, cy + size * 0.3);
  g.addColorStop(0, '#fff6cf'); g.addColorStop(0.34, '#f4c95a'); g.addColorStop(0.52, '#9c6a1c');
  g.addColorStop(0.64, '#e9b84c'); g.addColorStop(1, '#fbe6a2');
  return g;
}

function ivStudioLayout(I) {
  const W = I.w, H = I.h, size = Math.min(W / 11.5, H / 6.4);
  const cy = H / 2 - size * 0.62;
  const L = { size, cy, y2: cy + size * 0.78, y3: cy + size * 1.72, y4: cy + size * 2.62, letters: [] };
  const c = I.ctx;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  const track = size * 0.05;
  let total = 0;
  for (const ch of 'KUKI & KARMEN') {
    const amp = ch === '&';
    const font = amp ? `italic 400 ${size * 1.12}px "Alegreya", Georgia, serif` : `400 ${size}px "IM Fell English SC", Georgia, serif`;
    c.font = font;
    const w = ch === ' ' ? size * 0.24 : c.measureText(ch).width;
    L.letters.push({ ch, font, w, amp });
    total += w + track;
  }
  total -= track;
  let x = W / 2 - total / 2;
  for (const l of L.letters) { l.x = x + l.w / 2; x += l.w + track; }
  L.left = W / 2 - total / 2; L.right = W / 2 + total / 2;
  c.restore();
  return L;
}

function ivSmokeTile() {
  const w = 96, h = 54, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'), img = c.createImageData(w, h), rnd = ivRng(7);
  const grid = (n) => { const a = []; for (let i = 0; i < (n + 1) * (n + 1); i++) a.push(rnd()); return a; };
  const octs = [[4, 0.5], [8, 0.3], [16, 0.2]].map(([n, amp]) => ({ n, amp, g: grid(n) }));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (const o of octs) {
      const fx = (x / w) * o.n, fy = (y / h) * o.n, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const at = (a, b) => o.g[(b % (o.n + 1)) * (o.n + 1) + (a % (o.n + 1))];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      v += o.amp * ((at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy);
    }
    const i = (y * w + x) * 4, a = Math.max(0, v - 0.38) * 1.9;
    img.data[i] = 90; img.data[i + 1] = 50; img.data[i + 2] = 22; img.data[i + 3] = Math.min(255, a * 255);
  }
  c.putImageData(img, 0, 0);
  return cv;
}

function ivSpawn(I, n, f) { for (let k = 0; k < n; k++) I.parts.push(f(k)); if (I.parts.length > 520) I.parts.splice(0, I.parts.length - 520); }

function ivStudio(I, dt) {
  const c = I.ctx, W = I.w, H = I.h, t = I.pt, T = I.T || IV_T_SYNTH;
  if (!I.lay || I.lay.W !== W || I.lay.H !== H) { I.lay = ivStudioLayout(I); I.lay.W = W; I.lay.H = H; }
  if (!I.smoke) I.smoke = ivSmokeTile();
  const L = I.lay, size = L.size;
  // Ebenen in Gerätepixeln
  if (!I.tl) {
    I.tl = document.createElement('canvas'); I.tl.width = I.cv.width; I.tl.height = I.cv.height;
    I.bl = document.createElement('canvas'); I.bl.width = Math.max(8, Math.round(I.cv.width / 10)); I.bl.height = Math.max(8, Math.round(I.cv.height / 10));
    I.bl2 = document.createElement('canvas'); I.bl2.width = Math.max(4, Math.round(I.cv.width / 36)); I.bl2.height = Math.max(4, Math.round(I.cv.height / 36));
    I.vig = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
    I.vig.addColorStop(0, 'rgba(0,0,0,0)'); I.vig.addColorStop(1, 'rgba(0,0,0,0.85)');
  }
  const fadeOut = 1 - ivClamp((t - T.fade) / T.fadeLen);
  // Erschütterung beim Stempel
  let sx = 0, sy = 0;
  const imp = T.stamp + 0.18;
  if (!I.reduce && t > imp && t < imp + 0.37) { const k = (1 - (t - imp) / 0.37) * size * 0.035; sx = Math.sin(t * 93) * k; sy = Math.cos(t * 71) * k; }
  c.setTransform(I.dpr, 0, 0, I.dpr, 0, 0);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  // Rauch
  c.globalAlpha = 0.55 * ivClamp(t / 1.6) * fadeOut;
  c.imageSmoothingEnabled = true;
  for (const [sc, sp, off] of [[1.25, 0.012, 0], [1.6, -0.008, 0.37]]) {
    const dw = W * sc, dh = H * sc, ox = (((t * sp + off) % 1) + 1) % 1 * dw;
    c.drawImage(I.smoke, -ox, H - dh, dw, dh); c.drawImage(I.smoke, dw - ox, H - dh, dw, dh);
  }
  c.globalAlpha = 1;
  c.save(); c.translate(sx, sy);
  // Lichtstreif vor dem Schlag
  const cy = L.cy - size * 0.3;
  if (t > 0.2) {
    const p = ivClamp((t - 0.25) / (T.hit - 0.25)), after = t > T.hit ? 0.16 + 0.05 * Math.sin(t * 1.7) : 1;
    const len = W * (0.15 + 0.85 * ivEaseOut(p)), th = 1.5 + 5 * p;
    c.globalCompositeOperation = 'lighter';
    for (const [k, a] of [[1, 0.95], [7, 0.16], [22, 0.06]]) {
      const g = c.createLinearGradient(W / 2 - len / 2, 0, W / 2 + len / 2, 0);
      g.addColorStop(0, 'rgba(255,200,120,0)'); g.addColorStop(0.5, `rgba(255,${k > 1 ? 190 : 235},${k > 1 ? 120 : 190},${a * after * fadeOut})`); g.addColorStop(1, 'rgba(255,200,120,0)');
      c.fillStyle = g; c.fillRect(W / 2 - len / 2, cy - th * k / 2, len, th * k);
    }
    c.globalCompositeOperation = 'source-over';
  }
  if (t > T.hit) {
    // Puls: bei der Aufnahme nach ihrer Lautstärke, sonst im Takt der Kriegstrommeln
    const beat = 60 / 110, ph = ((t - T.climax) % beat + beat) % beat;
    const pulse = I.sting && I.sting.level ? 1 + Math.min(1.6, I.sting.level() * 4.5)
      : t > T.climax && t < T.climax + 3 ? 1 + 0.9 * Math.exp(-ph * 9) : 1 + 0.5 * Math.exp(-Math.max(0, t - T.hit) * 4);
    const a = ivClamp((t - T.hit) / 1.2) * fadeOut * pulse, R = Math.max(W, H);
    c.save(); c.translate(W / 2, cy); c.rotate(t * 0.035); c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 16; k++) {
      c.rotate(Math.PI / 8);
      const g = c.createLinearGradient(0, 0, R * 0.7, 0); g.addColorStop(0, `rgba(255,190,100,${0.075 * a * (0.6 + 0.4 * Math.sin(t * 0.9 + k * 1.3))})`); g.addColorStop(1, 'rgba(255,190,100,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.lineTo(R * 0.7, -R * 0.035); c.lineTo(R * 0.7, R * 0.035); c.closePath(); c.fill();
    }
    c.restore();
  }
  c.restore();
  // Schrift auf eigene Ebene, dann Glanz und Leuchten
  const tc = I.tl.getContext('2d');
  tc.setTransform(1, 0, 0, 1, 0, 0); tc.clearRect(0, 0, I.tl.width, I.tl.height);
  tc.setTransform(I.dpr, 0, 0, I.dpr, 0, 0); tc.translate(sx, sy);
  tc.textAlign = 'center'; tc.textBaseline = 'alphabetic'; tc.lineJoin = 'round';
  L.letters.forEach((l, k) => {
    if (l.ch === ' ') return;
    const p = ivClamp((t - T.hit - k * 0.045) / 0.5);
    if (p <= 0) return;
    const e = ivEaseOut(p), sc = 1.35 - 0.35 * e;
    tc.save(); tc.globalAlpha = p; tc.translate(l.x, L.cy); tc.scale(sc, sc);
    tc.font = l.font;
    tc.lineWidth = size * 0.05; tc.strokeStyle = '#2a1606'; tc.strokeText(l.ch, 0, 0);
    tc.fillStyle = l.amp ? (() => { const g = tc.createLinearGradient(0, -size * 0.8, 0, size * 0.2); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#ffd27a'); g.addColorStop(1, '#c07a20'); return g; })() : ivGoldGrad(tc, 0 - size * 0.3, size);
    tc.fillText(l.ch, 0, 0);
    tc.restore();
  });
  // PRODUCTIONS mit Zierlinien
  const p2 = ivClamp((t - T.prod) / 0.9);
  if (p2 > 0) {
    const e = ivEaseOut(p2), fs = size * 0.25, sp = fs * (0.95 - 0.35 * e);
    tc.font = `500 ${fs}px "Alegreya Sans", sans-serif`;
    const word = 'PRODUCTIONS'.split(''), ws = word.map((ch) => tc.measureText(ch).width);
    const tw = ws.reduce((a, b) => a + b, 0) + sp * (word.length - 1);
    let x = W / 2 - tw / 2;
    tc.globalAlpha = p2;
    const g = tc.createLinearGradient(0, L.y2 - fs, 0, L.y2); g.addColorStop(0, '#fbf2d8'); g.addColorStop(1, '#c9a867');
    tc.fillStyle = g;
    word.forEach((ch, i) => { tc.fillText(ch, x + ws[i] / 2, L.y2); x += ws[i] + sp; });
    const ly = L.y2 - fs * 0.36, gap = fs * 0.9, len = size * 1.5 * e;
    for (const dir of [-1, 1]) {
      const x0 = W / 2 + dir * (tw / 2 + gap), x1 = x0 + dir * len;
      const lg = tc.createLinearGradient(x0, 0, x1, 0); lg.addColorStop(0, 'rgba(240,200,110,0.95)'); lg.addColorStop(1, 'rgba(240,200,110,0.1)');
      tc.fillStyle = lg; tc.fillRect(Math.min(x0, x1), ly - 0.75, Math.abs(len), 1.5);
      const d = fs * 0.16; tc.fillStyle = '#f2cf78';
      tc.beginPath(); tc.moveTo(x1, ly - d); tc.lineTo(x1 + d, ly); tc.lineTo(x1, ly + d); tc.lineTo(x1 - d, ly); tc.fill();
    }
    tc.globalAlpha = 1;
  }
  // Siegel „100% AI“, fällt wie ein Stempel
  const p3 = ivClamp((t - T.stamp) / 0.18);
  if (p3 > 0) {
    if (!I.stamped) { I.stamped = true; ivSpawn(I, 46, (k) => { const a = (k / 46) * Math.PI * 2; return { x: W / 2 + Math.cos(a) * size * 1.15, y: L.y3 + Math.sin(a) * size * 0.34, vx: Math.cos(a) * size * 1.4, vy: Math.sin(a) * size * 0.7, life: 0.9, max: 0.9, r: 1.6, dust: true }; }); }
    const sc = 2.6 - 1.6 * p3 * p3, bw = size * 2.35, bh = size * 0.66;
    tc.save(); tc.globalAlpha = p3; tc.translate(W / 2, L.y3); tc.rotate(-0.05); tc.scale(sc, sc);
    const rr = (x, y, w, h, r) => { tc.beginPath(); tc.moveTo(x + r, y); tc.arcTo(x + w, y, x + w, y + h, r); tc.arcTo(x + w, y + h, x, y + h, r); tc.arcTo(x, y + h, x, y, r); tc.arcTo(x, y, x + w, y, r); tc.closePath(); };
    rr(-bw / 2, -bh / 2, bw, bh, size * 0.1); tc.fillStyle = 'rgba(46,24,6,0.6)'; tc.fill();
    tc.lineWidth = size * 0.035; tc.strokeStyle = ivGoldGrad(tc, 0, size * 0.8); tc.stroke();
    rr(-bw / 2 + size * 0.08, -bh / 2 + size * 0.08, bw - size * 0.16, bh - size * 0.16, size * 0.06); tc.lineWidth = size * 0.012; tc.stroke();
    tc.font = `700 ${size * 0.36}px "Alegreya Sans", sans-serif`; tc.textBaseline = 'middle';
    if ('letterSpacing' in tc) tc.letterSpacing = `${size * 0.05}px`;
    tc.lineWidth = size * 0.04; tc.strokeStyle = '#2a1606'; tc.strokeText('100% AI', 0, size * 0.02);
    tc.fillStyle = ivGoldGrad(tc, size * 0.05, size * 0.75); tc.fillText('100% AI', 0, size * 0.02);
    if ('letterSpacing' in tc) tc.letterSpacing = '0px';
    for (const dir of [-1, 1]) {
      const x = dir * bw * 0.39, r = size * 0.07; tc.fillStyle = '#f2cf78';
      tc.beginPath(); tc.moveTo(x, -r); tc.lineTo(x + r * 0.3, -r * 0.3); tc.lineTo(x + r, 0); tc.lineTo(x + r * 0.3, r * 0.3); tc.lineTo(x, r); tc.lineTo(x - r * 0.3, r * 0.3); tc.lineTo(x - r, 0); tc.lineTo(x - r * 0.3, -r * 0.3); tc.fill();
    }
    tc.restore(); tc.textBaseline = 'alphabetic';
  }
  // „Made by Jakob“ wird wie mit der Feder geschrieben
  const p4 = ivClamp((t - T.write) / 1.6);
  if (p4 > 0) {
    const fs = size * 0.46;
    tc.font = `italic 400 ${fs}px "Alegreya", Georgia, serif`;
    const tw = tc.measureText('Made by Jakob').width, x0 = W / 2 - tw / 2 - fs * 0.2, xr = x0 + (tw + fs * 0.5) * p4;
    tc.save(); tc.beginPath(); tc.rect(x0 - 4, L.y4 - fs * 1.2, xr - x0 + 4, fs * 1.8); tc.clip();
    const g = tc.createLinearGradient(0, L.y4 - fs, 0, L.y4 + fs * 0.2); g.addColorStop(0, '#fff6dc'); g.addColorStop(1, '#e6bf72');
    tc.lineWidth = fs * 0.06; tc.strokeStyle = '#2a1606'; tc.strokeText('Made by Jakob', W / 2, L.y4);
    tc.fillStyle = g; tc.fillText('Made by Jakob', W / 2, L.y4);
    tc.restore();
    if (p4 < 1) {
      const yq = L.y4 - fs * (0.3 + 0.25 * Math.sin(t * 19));
      ivSpawn(I, Math.random() < 0.7 ? 2 : 1, () => ({ x: xr, y: yq, vx: (Math.random() - 0.3) * size * 0.4, vy: (Math.random() - 0.8) * size * 0.5, life: 0.7, max: 0.7, r: 1.4 }));
      const q = c; q.save(); q.globalCompositeOperation = 'lighter'; const gg = q.createRadialGradient(xr, yq, 0, xr, yq, fs * 0.6);
      gg.addColorStop(0, 'rgba(255,240,200,0.95)'); gg.addColorStop(1, 'rgba(255,170,60,0)'); q.fillStyle = gg; q.fillRect(xr - fs, yq - fs, fs * 2, fs * 2); q.restore();
    }
  }
  // Glanzstreifen über alles Gold
  for (const t0 of T.shine) {
    const p = (t - t0) / 1.0;
    if (p <= 0 || p >= 1) continue;
    const x = -W * 0.2 + W * 1.4 * p, d = size * 0.9;
    tc.save(); tc.globalCompositeOperation = 'source-atop';
    const g = tc.createLinearGradient(x - d, L.cy + d * 0.4, x + d, L.cy - d * 0.4);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,240,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    tc.fillStyle = g; tc.fillRect(-sx, -sy, W, H); tc.restore();
  }
  // Ebene aufs Bild, mit weichem Leuchten aus einer verkleinerten Kopie
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = fadeOut;
  c.drawImage(I.tl, 0, 0);
  const bc = I.bl.getContext('2d'); bc.clearRect(0, 0, I.bl.width, I.bl.height); bc.drawImage(I.tl, 0, 0, I.bl.width, I.bl.height);
  c.globalCompositeOperation = 'lighter'; c.imageSmoothingEnabled = true;
  c.globalAlpha = 0.7 * fadeOut; c.drawImage(I.bl, 0, 0, I.cv.width, I.cv.height);
  const b2 = I.bl2.getContext('2d'); b2.clearRect(0, 0, I.bl2.width, I.bl2.height); b2.drawImage(I.bl, 0, 0, I.bl2.width, I.bl2.height);
  c.globalAlpha = 0.5 * fadeOut; c.drawImage(I.bl2, 0, 0, I.cv.width, I.cv.height);
  c.globalAlpha = 1;
  c.setTransform(I.dpr, 0, 0, I.dpr, 0, 0);
  // Glut: steigt von unten auf, beim Schlag fliegt sie aus der Schrift
  if (t < T.fade + 0.4) ivSpawn(I, Math.random() < dt * 26 ? 1 : 0, () => ({ x: Math.random() * W, y: H + 6, vx: (Math.random() - 0.5) * 14, vy: -(30 + Math.random() * 60), life: 4 + Math.random() * 3, max: 7, r: 1 + Math.random() * 1.6 }));
  if (t >= T.hit && !I.burst) {
    I.burst = true;
    ivSpawn(I, I.reduce ? 30 : 110, () => { const a = Math.random() * Math.PI * 2, v = size * (0.6 + Math.random() * 2.6); return { x: L.left + Math.random() * (L.right - L.left), y: L.cy - size * 0.35 + (Math.random() - 0.5) * size * 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - size * 0.3, life: 1 + Math.random() * 1.6, max: 2.6, r: 1 + Math.random() * 2 }; });
  }
  c.globalCompositeOperation = 'lighter';
  for (let k = I.parts.length - 1; k >= 0; k--) {
    const p = I.parts[k];
    p.life -= dt;
    if (p.life <= 0) { I.parts.splice(k, 1); continue; }
    const drag = p.dust ? 0.9 : 0.985;
    p.vx *= Math.pow(drag, dt * 60); p.vy = p.vy * Math.pow(drag, dt * 60) - (p.dust ? 0 : 8 * dt);
    p.x += (p.vx + Math.sin(I.t * 2.1 + k) * 6) * dt; p.y += p.vy * dt;
    const a = ivClamp(p.life / Math.min(p.max, 1.2)) * fadeOut * (0.7 + 0.3 * Math.sin(I.t * 17 + k));
    c.fillStyle = p.dust ? `rgba(230,200,150,${a * 0.55})` : `rgba(255,${150 + ((k * 37) % 80)},${50 + ((k * 13) % 50)},${a})`;
    c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
  }
  c.globalCompositeOperation = 'source-over';
  // Blitz beim Schlag, Vignette, Abblende
  if (t > T.hit && !I.reduce) {
    let f = 0.42 * Math.exp(-(t - T.hit) * 5.5);
    if (T.final && t > T.final) f += 0.22 * Math.exp(-(t - T.final) * 6);
    if (f > 0.01) { c.fillStyle = `rgba(255,236,200,${f})`; c.fillRect(0, 0, W, H); }
  }
  c.fillStyle = I.vig; c.fillRect(0, 0, W, H);
  if (fadeOut < 1) { c.fillStyle = `rgba(0,0,0,${1 - fadeOut})`; c.fillRect(0, 0, W, H); }
}

// ---------------------------------------------------------------- Studio-Fanfare (Web Audio)
function ivNoise(ac) {
  if (ac.__ivNoise) return ac.__ivNoise;
  const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  ac.__ivNoise = b;
  return b;
}
const ivHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Die Fanfare als Aufnahme; level() ist ihre Lautstärke gerade jetzt (für das Pulsieren der Lichtstrahlen)
function ivStudioFile(A, buf) {
  const { ac } = A, t0 = ac.currentTime + 0.05;
  const src = ac.createBufferSource(); src.buffer = buf;
  const g = ac.createGain(); g.gain.value = 1.7;
  const an = ac.createAnalyser(); an.fftSize = 1024;
  const data = new Float32Array(an.fftSize);
  src.connect(g); g.connect(an); an.connect(A.dry);
  src.start(t0);
  let lvl = 0;
  return {
    level() { an.getFloatTimeDomainData(data); let q = 0; for (let i = 0; i < data.length; i++) q += data[i] * data[i]; lvl = Math.max(Math.sqrt(q / data.length), lvl * 0.88); return lvl; },
    stop() {
      const now = ac.currentTime;
      g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.setTargetAtTime(0, now, 0.15);
      setTimeout(() => { try { src.stop(); } catch (e) { /* schon aus */ } g.disconnect(); }, 1500);
    },
  };
}

function ivStudioSound(A) {
  const { ac } = A, t0 = ac.currentTime + 0.05;
  const bus = ac.createGain(); bus.gain.value = 0.66; bus.connect(A.dry);
  const send = ac.createGain(); send.gain.value = 0.7; bus.connect(send); send.connect(A.wet);
  const nodes = [];
  const keep = (n) => { nodes.push(n); return n; };
  const env = (t, a, peak, hold, rel) => { const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.setTargetAtTime(0.0001, t + a + hold, rel); return g; };
  const noise = (t, dur, type, f, q, g) => { const s = keep(ac.createBufferSource()); s.buffer = ivNoise(ac); s.loop = true; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; s.connect(fl); fl.connect(g); g.connect(bus); s.start(t); s.stop(t + dur); return fl; };
  // Donner zu Beginn
  { const o = keep(ac.createOscillator()); o.frequency.setValueAtTime(64, t0); o.frequency.exponentialRampToValueAtTime(26, t0 + 2.4); const g = env(t0, 0.02, 0.85, 0.2, 0.9); o.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + 4);
    noise(t0, 3.5, 'lowpass', 110, 0.7, env(t0, 0.05, 0.6, 0.3, 1.1)); }
  // Rückwärts-Becken bis zum Schlag
  { const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0 + 0.2); g.gain.exponentialRampToValueAtTime(0.32, t0 + 1.38); g.gain.setValueAtTime(0.0001, t0 + 1.4); noise(t0 + 0.2, 1.25, 'highpass', 2600, 0.5, g); }
  const timp = (m, t, v) => {
    const f = ivHz(m), o = keep(ac.createOscillator()), o2 = keep(ac.createOscillator());
    o.frequency.setValueAtTime(f * 1.16, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07); o2.frequency.value = f * 1.51;
    const g = env(t, 0.005, v, 0.05, 0.55), g2 = env(t, 0.005, v * 0.3, 0.02, 0.25);
    o.connect(g); g.connect(bus); o2.connect(g2); g2.connect(bus); o.start(t); o.stop(t + 3); o2.start(t); o2.stop(t + 2);
    noise(t, 0.2, 'lowpass', 420, 0.8, env(t, 0.003, v * 0.5, 0.02, 0.05));
  };
  const crash = (t, v) => { noise(t, 3, 'highpass', 4800, 0.4, env(t, 0.004, v, 0.05, 0.8)); noise(t, 2, 'bandpass', 8200, 1.2, env(t, 0.004, v * 0.5, 0.02, 0.5)); };
  const brass = (notes, t, dur, v) => {
    for (const m of notes) for (const det of [-9, 0, 8]) {
      const o = keep(ac.createOscillator()); o.type = 'sawtooth'; o.frequency.value = ivHz(m); o.detune.value = det;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.3;
      f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(3400, t + 0.16); f.frequency.exponentialRampToValueAtTime(1500, t + 0.9);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.06); g.gain.setTargetAtTime(v * 0.6, t + 0.14, 0.45); g.gain.setTargetAtTime(0.0001, t + dur, 0.4);
      o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 3);
    }
  };
  const choir = (notes, t, dur, v) => {
    for (const m of notes) for (const det of [-7, 6]) {
      const o = keep(ac.createOscillator()); o.type = 'sawtooth'; o.frequency.value = ivHz(m); o.detune.value = det;
      const lfo = keep(ac.createOscillator()), lg = ac.createGain(); lfo.frequency.value = 5 + Math.random() * 0.6; lg.gain.value = 11; lfo.connect(lg); lg.connect(o.detune);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.55); g.gain.setTargetAtTime(0.0001, t + dur, 0.7);
      for (const [ff, q, a] of [[730, 7, 1], [1090, 9, 0.55], [2440, 11, 0.22]]) { const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = ff; f.Q.value = q; const fg = ac.createGain(); fg.gain.value = a * 3; o.connect(f); f.connect(fg); fg.connect(g); }
      g.connect(bus); o.start(t); lfo.start(t); o.stop(t + dur + 4); lfo.stop(t + dur + 4);
    }
  };
  const bell = (m, t, v) => { for (const [k, d, a] of [[1, 1.4, 1], [2.76, 0.6, 0.35], [5.4, 0.3, 0.18]]) { const o = keep(ac.createOscillator()); o.frequency.value = ivHz(m) * k; const g = env(t, 0.003, v * a, 0.01, d * 0.35); o.connect(g); g.connect(bus); o.start(t); o.stop(t + d * 3); } };
  // Kriegstrommel: tiefer Schlag mit Fell, leicht angezerrt
  const drive = ac.createWaveShaper(); { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = Math.tanh(x * 2.6); } drive.curve = c; }
  const dg = ac.createGain(); dg.gain.value = 0.8; drive.connect(dg); dg.connect(bus);
  const war = (t, v, f = 52) => {
    const o = keep(ac.createOscillator()); o.frequency.setValueAtTime(f * 2.4, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const g = env(t, 0.003, v, 0.03, 0.17); o.connect(g); g.connect(drive); o.start(t); o.stop(t + 1.4);
    noise(t, 0.22, 'lowpass', f > 80 ? 2200 : 1100, 0.7, env(t, 0.002, v * 0.55, 0.01, 0.035));
  };
  const ens = (t, v) => { war(t, v, 48); war(t + 0.012, v * 0.8, 53); war(t + 0.026, v * 0.7, 58); };
  const SB = 60 / 110 / 4;   // Sechzehntel bei 110 Schlägen
  // Schlag: d-Moll, dann B-Dur, C-Dur und als Auflösung D-Dur
  const H = t0 + 1.4;
  ens(H, 0.75); brass([38], H, 1.0, 0.05);
  for (let k = 4; k < 16; k++) { const v = [0.5, 0, 0.22, 0.32][k % 4]; if (v) war(H + k * SB, v); }
  ens(t0 + 2.4, 0.6);
  for (let k = 1; k < 9; k++) { const v = [0, 0, 0.25, 0.35][k % 4] || (k % 4 === 0 ? 0.45 : 0); if (v) war(t0 + 2.4 + k * SB, v, k % 2 ? 90 : 52); }
  ens(t0 + 3.78, 0.85);
  for (let k = 0; k < 8; k++) war(t0 + 4.3 + k * 0.062, 0.2 + k * 0.06, k % 2 ? 95 : 60);
  timp(38, H, 0.9); timp(26, H, 0.5); crash(H, 0.35);
  brass([50, 57, 62, 65, 69], H, 1.0, 0.035); choir([62, 65, 69], H, 1.1, 0.05);
  brass([46, 53, 58, 62, 65], t0 + 2.4, 1.15, 0.033); choir([58, 62, 65], t0 + 2.4, 1.2, 0.05); timp(34, t0 + 2.4, 0.5);
  // Stempel: dumpfer Schlag und Metallklang
  { const t = t0 + 3.6 + 0.18; const o = keep(ac.createOscillator()); o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25); const g = env(t, 0.004, 0.9, 0.04, 0.12); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 1);
    noise(t, 0.3, 'lowpass', 700, 0.7, env(t, 0.002, 0.5, 0.02, 0.05));
    for (const [k, d] of [[1, 1.3], [2.76, 0.9], [5.4, 0.5], [8.93, 0.3]]) { const b = keep(ac.createOscillator()); b.frequency.value = 330 * k; const bg = env(t, 0.002, 0.07, 0.01, d * 0.3); b.connect(bg); bg.connect(bus); b.start(t); b.stop(t + d * 3); } }
  brass([48, 55, 60, 64, 67], t0 + 3.6, 1.2, 0.033); choir([60, 64, 67], t0 + 3.6, 1.25, 0.05);
  // Wirbel in die Auflösung
  [4.28, 4.38, 4.46, 4.53, 4.59, 4.64, 4.69, 4.73, 4.765].forEach((d, i) => timp(38, t0 + d, 0.18 + i * 0.05));
  const R = t0 + 4.8;
  timp(38, R, 1); timp(26, R, 0.6); crash(R, 0.4); ens(R, 0.9); brass([38, 26], R, 3.0, 0.05);
  // Kriegstrommel-Groove unter dem Höhepunkt
  const G = [1, 0, 0.5, 0.7, 1, 0, 0.6, 0, 1, 0, 0.5, 0.7, 1, 0.6, 0.8, 1];
  for (let k = 1; k < 2 * 16 + 4; k++) { const v = G[k % 16]; if (!v) continue; const tt = R + k * SB; if (tt > t0 + 7.55) break; war(tt, 0.48 * v, k % 4 === 0 ? 50 : k % 2 ? 100 + (k % 3) * 18 : 62); }
  ens(t0 + 7.62, 0.8); crash(t0 + 7.62, 0.35);
  brass([50, 57, 62, 66, 69, 74], R, 3.3, 0.046); choir([62, 66, 69, 74], R, 3.4, 0.065);
  [86, 90, 93, 98, 93, 98, 102].forEach((m, i) => bell(m, R + 0.15 + i * 0.16, 0.06));
  bell(86, t0 + 7.1, 0.05); bell(93, t0 + 7.25, 0.05);
  return {
    stop() {
      const now = ac.currentTime;
      bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(bus.gain.value, now); bus.gain.setTargetAtTime(0, now, 0.15);
      setTimeout(() => { for (const n of nodes) { try { n.stop(); } catch (e) { /* schon aus */ } } bus.disconnect(); }, 1500);
    },
  };
}

// ================================================================ Amiga: Bildspeicher, Farben, Schrift
const IV_LW = 320, IV_LH = 200;
const IV_PX = 10, IV_PY = 8, IV_PW = 300, IV_PH = 124;
const IV_TX = 12, IV_TY = 143, IV_LINE = 13;
const IV_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const ivPack = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
const ivHex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

function ivFrame(w, h) {
  const img = new ImageData(w, h);
  return { w, h, img, px: new Uint32Array(img.data.buffer) };
}

// Median-Cut auf höchstens n Farben, gerundet auf 4 Bit je Kanal wie beim Amiga, dann geordnetes Dithering
function ivQuantize(id, n = 32, spread = 26) {
  const d = id.data, N = id.width * id.height;
  const boxes = [Uint32Array.from({ length: N }, (_, i) => i)];
  const range = (b) => {
    let lo = [255, 255, 255], hi = [0, 0, 0];
    for (let k = 0; k < b.length; k++) { const i = b[k] * 4; for (let c = 0; c < 3; c++) { const v = d[i + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; } }
    const r = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], c = r[1] >= r[0] && r[1] >= r[2] ? 1 : r[0] >= r[2] ? 0 : 2;
    return { c, r: r[c] };
  };
  const info = boxes.map(range);
  while (boxes.length < n) {
    let best = -1, bs = 0;
    for (let k = 0; k < boxes.length; k++) { const s = info[k].r * Math.sqrt(boxes[k].length); if (boxes[k].length > 1 && s > bs) { bs = s; best = k; } }
    if (best < 0 || bs <= 0) break;
    const b = boxes[best], ch = info[best].c, keys = new Uint32Array(b.length);
    for (let k = 0; k < b.length; k++) keys[k] = (d[b[k] * 4 + ch] << 17) | b[k];
    keys.sort();
    const mid = b.length >> 1, a1 = new Uint32Array(mid), a2 = new Uint32Array(b.length - mid);
    for (let k = 0; k < b.length; k++) (k < mid ? a1 : a2)[k < mid ? k : k - mid] = keys[k] & 0x1FFFF;
    boxes.splice(best, 1, a1, a2); info.splice(best, 1, range(a1), range(a2));
  }
  const pal = [];
  for (const b of boxes) {
    let r = 0, g = 0, bl = 0;
    for (let k = 0; k < b.length; k++) { const i = b[k] * 4; r += d[i]; g += d[i + 1]; bl += d[i + 2]; }
    const q = (v) => Math.round(v / b.length / 17) * 17;
    const c = [q(r), q(g), q(bl)];
    if (!pal.some((p) => p[0] === c[0] && p[1] === c[1] && p[2] === c[2])) pal.push(c);
  }
  const packed = pal.map((p) => ivPack(p[0], p[1], p[2]));
  const nearest = (r, g, b) => { let bi = 0, bd = 1e9; for (let k = 0; k < pal.length; k++) { const p = pal[k], dr = r - p[0], dg = g - p[1], db = b - p[2], dd = 2 * dr * dr + 4 * dg * dg + 3 * db * db; if (dd < bd) { bd = dd; bi = k; } } return bi; };
  const cache = new Int16Array(32768).fill(-1), out = new Uint32Array(N), w = id.width;
  for (let p = 0; p < N; p++) {
    const x = p % w, y = (p / w) | 0, o = (IV_BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.47) * spread, i = p * 4;
    const r = ivClamp(d[i] + o, 0, 255) | 0, g = ivClamp(d[i + 1] + o, 0, 255) | 0, b = ivClamp(d[i + 2] + o, 0, 255) | 0;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let k = cache[key];
    if (k < 0) { k = nearest(r, g, b); cache[key] = k; }
    out[p] = packed[k];
  }
  const nearCache = new Map();
  const nearRGB = (r, g, b) => { const key = ((ivClamp(r, 0, 255) >> 3) << 10) | ((ivClamp(g, 0, 255) >> 3) << 5) | (ivClamp(b, 0, 255) >> 3); let k = cache[key]; if (k < 0) { k = nearest(r, g, b); cache[key] = k; } return packed[k]; };
  return { w, h: id.height, px: out, pal, nearRGB, near: (hex) => { let v = nearCache.get(hex); if (v === undefined) { const [r, g, b] = ivHex(hex); v = packed[nearest(r, g, b)]; nearCache.set(hex, v); } return v; } };
}

const ivGlyph = (ch) => PIXFONT.g[ch] || PIXFONT.g['?'];
function ivTextW(s) { let w = 0; for (const ch of s) w += ivGlyph(ch)[0]; return w; }
function ivWrap(text, maxW) {
  const lines = []; let line = '';
  for (const word of text.split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (ivTextW(t) > maxW && line) { lines.push(line); line = word; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
// Text in den Bildspeicher: erst ein Schatten, dann die Schrift mit Farbverlauf je Zeile (Kupferbalken)
function ivPrint(F, str, x, y, cols, shadow) {
  for (const pass of shadow ? [0, 1] : [1]) {
    let cx = x;
    for (const ch of str) {
      const g = ivGlyph(ch), [adv, xo, w, top] = g;
      for (let r = 4; r < g.length; r++) {
        const bits = g[r], yy = y + top + r - 4 + (pass ? 0 : 1);
        if (yy < 0 || yy >= F.h) continue;
        const col = pass ? cols[Math.min(cols.length - 1, top + r - 4)] : shadow;
        for (let bx = 0; bx < w; bx++) {
          if (!((bits >> (w - 1 - bx)) & 1)) continue;
          const xx = cx + xo + bx + (pass ? 0 : 1);
          if (xx >= 0 && xx < F.w) F.px[yy * F.w + xx] = col;
        }
      }
      cx += adv;
    }
  }
}
function ivRamp(a, b, n) { const A = ivHex(a), B = ivHex(b); return Array.from({ length: n }, (_, i) => { const u = i / (n - 1); return ivPack(...[0, 1, 2].map((c) => Math.round((A[c] + (B[c] - A[c]) * u) / 17) * 17)); }); }
const IV_TEXT = ivRamp('#fff6c8', '#e89a3a', PIXFONT.h);
const IV_SHADOW = ivPack(68, 34, 0);

function ivShade(F, k) {
  if (k >= 1) return;
  const px = F.px;
  for (let i = 0; i < px.length; i++) {
    const c = px[i];
    px[i] = ivPack(Math.round(((c & 255) * k) / 17) * 17, Math.round((((c >> 8) & 255) * k) / 17) * 17, Math.round((((c >> 16) & 255) * k) / 17) * 17);
  }
}

// Goldrahmen um das Bild
function ivBorder(F) {
  const cols = ['#2a1606', '#8a5a1a', '#e8b850', '#fff0b0', '#b07a28', '#3a2208'].map((h) => ivPack(...ivHex(h)));
  const x0 = IV_PX - 4, y0 = IV_PY - 4, x1 = IV_PX + IV_PW + 3, y1 = IV_PY + IV_PH + 3;
  cols.forEach((col, k) => {
    const a = x0 - 1 + k, b = y0 - 1 + k, c2 = x1 + 1 - k, d2 = y1 + 1 - k;
    if (k >= 5) return;
    for (let x = a; x <= c2; x++) { F.px[b * F.w + x] = col; F.px[d2 * F.w + x] = col; }
    for (let y = b; y <= d2; y++) { F.px[y * F.w + a] = col; F.px[y * F.w + c2] = col; }
  });
  // Rauten in den Ecken
  const dia = ivPack(255, 240, 176), dk = ivPack(42, 22, 6);
  for (const [cx, cy] of [[x0 + 1, y0 + 1], [x1 - 1, y0 + 1], [x0 + 1, y1 - 1], [x1 - 1, y1 - 1]]) {
    for (let r = -3; r <= 3; r++) for (let c = -3; c <= 3; c++) { const m = Math.abs(r) + Math.abs(c); if (m <= 3) F.px[(cy + r) * F.w + cx + c] = m === 3 ? dk : dia; }
  }
}

// ================================================================ Szenen (im Code gemalt, dann auf 32 Farben gebracht)
function ivGrad(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); for (const [o, col] of stops) g.addColorStop(o, col); return g; }
function ivGlow(c, x, y, r, col) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
function ivPoly(c, pts, col) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) c.lineTo(pts[k][0], pts[k][1]); c.closePath(); c.fillStyle = col; c.fill(); }
function ivHills(c, base, amp, seed, col, f = 1, rnd = null) {
  const pts = [[0, IV_PH]];
  for (let x = 0; x <= IV_PW; x += 2) {
    const u = x / IV_PW;
    pts.push([x, base - amp * (0.55 * Math.sin(u * 5.3 * f + seed) + 0.3 * Math.sin(u * 11.7 * f + seed * 1.7) + 0.15 * Math.sin(u * 27 * f + seed * 2.3)) + (rnd ? (rnd() - 0.5) * 0.8 : 0)]);
  }
  pts.push([IV_PW, IV_PH]);
  ivPoly(c, pts, col);
}
function ivClouds(c, rnd, n, y0, y1, body, rim) {
  for (let k = 0; k < n; k++) {
    const x = rnd() * IV_PW, y = y0 + rnd() * (y1 - y0), w = 18 + rnd() * 46, h = 1.2 + rnd() * 2.6;
    c.fillStyle = body; c.beginPath(); c.ellipse(x, y, w, h, 0, 0, Math.PI * 2); c.fill();
    if (rim) { c.fillStyle = rim; c.beginPath(); c.ellipse(x + w * 0.1, y + h * 0.7, w * 0.8, h * 0.45, 0, 0, Math.PI * 2); c.fill(); }
  }
}
function ivSky(c, stops, h = IV_PH) { c.fillStyle = ivGrad(c, 0, 0, 0, h, stops); c.fillRect(0, 0, IV_PW, IV_PH); }

const IV_SCENES = {
  // Nacht über der Donau: Burg auf dem Felsen, ein einziges Licht
  kerker: {
    paint(c, rnd, A) {
      ivSky(c, [[0, '#04051a'], [0.5, '#121a48'], [0.82, '#2a3272'], [1, '#3b3a76']], 96);
      A.stars = [];
      for (let k = 0; k < 90; k++) { const x = (rnd() * IV_PW) | 0, y = (rnd() * 78) | 0; c.fillStyle = `rgba(255,255,236,${0.35 + rnd() * 0.65})`; c.fillRect(x, y, 1, 1); if (k < 16) A.stars.push([x, y]); }
      ivGlow(c, 236, 30, 50, 'rgba(170,185,255,0.45)');
      c.fillStyle = '#f2efd6'; c.beginPath(); c.arc(236, 30, 10, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#d4cfae'; for (const [x, y, r] of [[233, 27, 2.2], [240, 33, 1.6], [238, 25, 1.1]]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
      ivClouds(c, rnd, 7, 22, 58, 'rgba(16,22,64,0.9)', 'rgba(150,160,220,0.35)');
      ivHills(c, 92, 6, 1.2, '#161c48', 1.3, rnd);
      c.fillStyle = ivGrad(c, 0, 94, 0, 124, [[0, '#1a2258'], [1, '#070b26']]); c.fillRect(0, 94, IV_PW, 30);
      for (let y = 96; y < 123; y += 2) { const w = 2 + rnd() * 12 * (1 - (y - 96) / 40); c.fillStyle = 'rgba(214,210,176,0.85)'; c.fillRect(236 - w / 2 + (rnd() - 0.5) * 6, y, w, 1); }
      ivPoly(c, [[26, 124], [48, 106], [62, 98], [76, 88], [86, 76], [96, 68], [110, 64], [150, 62], [164, 66], [172, 78], [186, 90], [204, 106], [226, 124]], '#0c0e24');
      c.strokeStyle = '#2c3266'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(150, 62); c.lineTo(164, 66); c.lineTo(172, 78); c.lineTo(186, 90); c.lineTo(204, 106); c.stroke();
      c.strokeStyle = 'rgba(30,36,80,0.8)'; for (let k = 0; k < 9; k++) { const x = 70 + rnd() * 120, y = 74 + rnd() * 40; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 6 + rnd() * 8, y + 3 + rnd() * 4); c.stroke(); }
      const dk = '#090a1c', rim = '#3a4282';
      c.fillStyle = dk;
      c.fillRect(104, 52, 58, 12); for (let x = 104; x < 162; x += 4) c.fillRect(x, 49, 2, 3);
      c.fillRect(98, 38, 11, 26); for (let x = 98; x < 109; x += 4) c.fillRect(x, 35, 2, 3);
      c.fillRect(124, 24, 18, 40); for (let x = 124; x < 142; x += 4) c.fillRect(x, 21, 2, 3);
      c.fillRect(137, 14, 6, 10); ivPoly(c, [[136, 14], [140, 6], [144, 14]], dk);
      c.fillRect(153, 42, 10, 22); ivPoly(c, [[152, 42], [158, 31], [164, 42]], dk);
      c.fillStyle = rim; c.fillRect(141, 24, 1, 40); c.fillRect(162, 42, 1, 22); c.fillRect(108, 38, 1, 14); c.fillRect(143, 14, 1, 10);
      c.fillStyle = '#1c2046'; for (const [x, y] of [[129, 46], [102, 46], [157, 50], [116, 56]]) c.fillRect(x, y, 1, 3);
      ivGlow(c, 132, 37, 9, 'rgba(255,190,90,0.55)');
      c.fillStyle = '#ffd070'; c.fillRect(131, 35, 2, 4);
      A.win = [131, 35];
      c.strokeStyle = '#03040c'; c.lineWidth = 1;
      for (let k = 0; k < 40; k++) { const x = rnd() < 0.5 ? rnd() * 40 : 250 + rnd() * 50, h = 4 + rnd() * 12; c.beginPath(); c.moveTo(x, 124); c.lineTo(x + (rnd() - 0.5) * 4, 124 - h); c.stroke(); }
    },
    anim(put, P, A, t) {
      A.stars.forEach(([x, y], k) => { const v = Math.sin(t * 2.6 + k * 1.9); put(x, y, P.near(v > 0.55 ? '#ffffff' : v < -0.6 ? '#2a3272' : '#b8bcd8')); });
      const ph = Math.floor(t * 7);
      for (let k = 0; k < 7; k++) { const r = ivRng(ph * 31 + k), y = 98 + ((r() * 12) | 0) * 2, w = 1 + ((r() * 4) | 0); for (let i = 0; i < w; i++) put(230 + ((r() * 12) | 0) + i, y, P.near('#f0ecd0')); }
      const f = Math.sin(t * 9) + Math.sin(t * 14.3) > 0.4;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) put(A.win[0] + i, A.win[1] + j, P.near(f ? '#ffe7a0' : '#e09a40'));
    },
  },
  // Die Krone auf rotem Samt, zwischen Kerzen und Bannern
  krone: {
    paint(c, rnd, A) {
      c.fillStyle = ivGrad(c, 0, 0, 0, IV_PH, [[0, '#0c0404'], [1, '#1e0a08']]); c.fillRect(0, 0, IV_PW, IV_PH);
      ivGlow(c, 150, 72, 120, 'rgba(130,44,20,0.6)');
      for (let k = 0; k < 5; k++) { c.fillStyle = 'rgba(255,200,120,0.06)'; ivPoly(c, [[140 + k * 5, 0], [150 + k * 5, 0], [120 + k * 18, 124], [100 + k * 18, 124]], 'rgba(255,200,120,0.05)'); }
      for (const x0 of [0, 274]) {
        c.fillStyle = ivGrad(c, x0, 0, x0 + 26, 0, [[0, '#140c0a'], [0.5, '#3a2a22'], [1, '#140c0a']]); c.fillRect(x0, 0, 26, IV_PH);
        c.fillStyle = '#4a382a'; c.fillRect(x0 - 2, 14, 30, 4); c.fillRect(x0 - 2, 110, 30, 4);
      }
      for (const x0 of [40, 230]) {
        ivPoly(c, [[x0, 0], [x0 + 30, 0], [x0 + 30, 88], [x0 + 15, 80], [x0, 88]], '#7c1414');
        c.fillStyle = 'rgba(60,6,6,0.6)'; for (let x = x0 + 4; x < x0 + 30; x += 7) c.fillRect(x, 0, 2, 82);
        c.strokeStyle = '#c89a3a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x0 + 2, 0); c.lineTo(x0 + 2, 84); c.lineTo(x0 + 15, 77); c.lineTo(x0 + 28, 84); c.lineTo(x0 + 28, 0); c.stroke();
        c.fillStyle = '#d8aa44'; for (const yy of [20, 38, 56]) ivPoly(c, [[x0 + 8, yy + 6], [x0 + 15, yy], [x0 + 22, yy + 6], [x0 + 19, yy + 6], [x0 + 15, yy + 3], [x0 + 11, yy + 6]], '#d8aa44');
      }
      c.fillStyle = ivGrad(c, 0, 98, 0, 124, [[0, '#3a2010'], [0.1, '#1c0e08'], [1, '#0c0604']]); c.fillRect(84, 98, 132, 26);
      c.fillStyle = ivGrad(c, 0, 86, 0, 104, [[0, '#c02a2a'], [0.5, '#8a1616'], [1, '#3a0606']]); c.beginPath(); c.ellipse(150, 96, 48, 10, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#d8aa44'; for (const x of [103, 197]) { c.fillRect(x - 1, 96, 3, 7); c.fillRect(x - 2, 102, 5, 2); }
      ivGlow(c, 150, 74, 40, 'rgba(255,200,90,0.35)');
      const gold = ivGrad(c, 0, 50, 0, 90, [[0, '#fff4b0'], [0.35, '#f0c040'], [0.6, '#a06a14'], [0.8, '#e8b840'], [1, '#7a4a0c']]);
      for (const [x, h] of [[120, 16], [135, 22], [150, 28], [165, 22], [180, 16]]) {
        ivPoly(c, [[x - 6, 76], [x - 2, 76 - h * 0.6], [x, 76 - h], [x + 2, 76 - h * 0.6], [x + 6, 76]], gold);
        c.fillStyle = '#fffbe8'; c.beginPath(); c.arc(x, 76 - h - 1.5, 2.3, 0, Math.PI * 2); c.fill();
        A.spark = A.spark || []; A.spark.push([x, 76 - h - 1]);
      }
      c.fillStyle = gold; c.beginPath(); c.moveTo(114, 74); c.quadraticCurveTo(150, 80, 186, 74); c.lineTo(186, 88); c.quadraticCurveTo(150, 94, 114, 88); c.closePath(); c.fill();
      c.strokeStyle = '#5a3008'; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#f8f0d0'; for (let x = 117; x < 184; x += 4) { c.fillRect(x, 75 + Math.pow((x - 150) / 36, 2) * -1 + 1.5, 1.5, 1.5); c.fillRect(x, 88 + Math.pow((x - 150) / 36, 2) * -1 + 1, 1.5, 1.5); }
      for (const [x, col, r] of [[128, '#c01028', 3], [150, '#1838c0', 4], [172, '#10904a', 3]]) {
        c.fillStyle = col; c.beginPath(); c.ellipse(x, 84, r, r * 0.8, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffffff'; c.fillRect(x - 1, 82.5, 1.5, 1.2); A.spark.push([x, 83]);
      }
      A.flames = [];
      for (const x of [62, 238]) {
        c.fillStyle = ivGrad(c, x - 6, 0, x + 6, 0, [[0, '#6a4a20'], [0.5, '#e8c060'], [1, '#6a4a20']]); c.fillRect(x - 1, 84, 3, 40); c.fillRect(x - 6, 82, 13, 3);
        c.fillStyle = ivGrad(c, x - 4, 0, x + 4, 0, [[0, '#a89878'], [0.4, '#f4ecd4'], [1, '#8a7a5a']]); c.fillRect(x - 3, 56, 7, 26);
        ivGlow(c, x + 0.5, 50, 44, 'rgba(255,170,70,0.5)');
        A.flames.push([x, 54]);
      }
    },
    anim(put, P, A, t) {
      A.flames.forEach(([x, y], k) => {
        const h = 6 + Math.round(Math.sin(t * 11 + k * 2) + Math.sin(t * 17.3 + k)), sway = Math.round(Math.sin(t * 7 + k * 3) * 0.6);
        for (let j = 0; j < h; j++) { const u = j / h, w = u < 0.25 ? 1 : u < 0.7 ? 2 : 1; for (let i = -w + 1; i <= w - 1 + (w > 1 ? 1 : 0); i++) put(x + i + (u > 0.5 ? sway : 0), y - j, P.near(u < 0.35 ? '#fff6c0' : u < 0.7 ? '#ffc84a' : '#e06a18')); }
      });
      const cyc = Math.floor(t / 0.55), r = ivRng(cyc * 7 + 3), sp = A.spark[(r() * A.spark.length) | 0], life = (t / 0.55) % 1;
      if (life < 0.5) { const s = life < 0.25 ? 2 : 1, col = P.near('#ffffff'), c2 = P.near('#fff0a0'); put(sp[0], sp[1], col); for (let i = 1; i <= s; i++) { put(sp[0] + i, sp[1], c2); put(sp[0] - i, sp[1], c2); put(sp[0], sp[1] + i, c2); put(sp[0], sp[1] - i, c2); } }
    },
  },
  // Morgenrot: Johanns Banner über der Burg, darunter das sächsische Dorf
  banner: {
    paint(c, rnd, A) {
      ivSky(c, [[0, '#1e0c22'], [0.38, '#5a1c2c'], [0.66, '#c24a2a'], [0.85, '#f29a3c'], [1, '#ffd27a']], 92);
      ivGlow(c, 70, 84, 64, 'rgba(255,200,110,0.6)');
      c.fillStyle = '#fff0b0'; c.beginPath(); c.arc(70, 86, 13, 0, Math.PI * 2); c.fill();
      ivClouds(c, rnd, 11, 10, 70, 'rgba(58,16,40,0.85)', 'rgba(240,130,70,0.55)');
      ivHills(c, 88, 5, 0.4, '#5a2030', 1.6, rnd);
      ivHills(c, 98, 6, 2.2, '#3a1424', 1.1, rnd);
      ivPoly(c, [[110, 124], [150, 96], [176, 80], [196, 72], [276, 70], [300, 76], [300, 124]], '#24101a');
      drawCastle(c, 232, 72, 0.3, '#c41818', 0.6);
      c.fillStyle = 'rgba(255,150,90,0.55)'; c.fillRect(190, 59, 1, 13); c.fillRect(211, 32, 1, 40);
      A.flags = [[232 - 49 * 0.3, 72 - 216 * 0.3, 12], [232 - 123 * 0.3, 72 - 123 * 0.3, 9], [232 + 123 * 0.3, 72 - 123 * 0.3, 9]];
      A.smoke = [];
      c.fillStyle = '#170a10';
      for (const [x, y, w] of [[14, 118, 22], [40, 116, 18], [64, 119, 24], [92, 117, 20], [8, 124, 30]]) {
        c.fillRect(x, y - 6, w, 8); ivPoly(c, [[x - 3, y - 6], [x + w / 2, y - 15], [x + w + 3, y - 6]], '#1e0c12');
        c.fillStyle = '#ffb050'; c.fillRect(x + 4, y - 3, 2, 2); c.fillStyle = '#170a10';
        A.smoke.push([x + w * 0.7, y - 13]);
      }
      c.strokeStyle = '#2a0e16'; c.lineWidth = 1; for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(120 + k * 8, 124); c.lineTo(150 + k * 14, 100 + k * 2); c.stroke(); }
    },
    anim(put, P, A, t) {
      A.flags.forEach(([fx, fy, len], k) => {
        const red = P.near('#d42020'), dk = P.near('#7a1010');
        for (let u = 0; u < len; u++) { const off = Math.round(Math.sin(t * 5 + u * 0.7 + k) * (u / len) * 1.6); const hh = Math.max(2, Math.round(4 - u * 0.15)); for (let j = 0; j < hh; j++) put(fx + 1 + u, fy + j + off, (u + j) % 4 === 0 ? dk : red); }
      });
      A.smoke.forEach(([x, y], k) => {
        for (let i = 0; i < 7; i++) { const age = ((t * 0.55 + i / 7 + k * 0.13) % 1), yy = y - age * 26, xx = x + Math.sin(age * 5 + k) * 3 + age * 8; if (age < 0.85) put(xx, yy, P.near(age < 0.4 ? '#8a6a70' : '#5a3a48')); }
      });
    },
  },
  // Nacht im Wald: Geächtete am Feuer
  wald: {
    paint(c, rnd, A) {
      c.fillStyle = ivGrad(c, 0, 0, 0, IV_PH, [[0, '#03080a'], [0.6, '#0a1a16'], [1, '#141a10']]); c.fillRect(0, 0, IV_PW, IV_PH);
      ivGlow(c, 150, 92, 150, 'rgba(255,110,30,0.42)');
      for (let k = 0; k < 30; k++) {
        const x = rnd() * IV_PW, w = 2 + rnd() * 4, d = Math.abs(x - 150);
        c.fillStyle = rnd() < 0.5 ? '#0c1a14' : '#13241a'; c.fillRect(x, 0, w, 112);
        c.fillStyle = `rgba(190,90,30,${Math.max(0.05, 0.45 - d / 260)})`; c.fillRect(x < 150 ? x + w - 1 : x, 10, 1, 100);
      }
      c.fillStyle = '#071009'; for (let k = 0; k < 30; k++) { c.beginPath(); c.ellipse(rnd() * IV_PW, rnd() * 24, 16 + rnd() * 22, 7 + rnd() * 8, 0, 0, Math.PI * 2); c.fill(); }
      ivGlow(c, 150, 100, 48, 'rgba(255,190,80,0.6)');
      for (let k = 0; k < 8; k++) {
        let x = rnd() * IV_PW; if (Math.abs(x - 150) < 60) x += x < 150 ? -60 : 60;
        const w = 7 + rnd() * 9, d = Math.abs(x - 150);
        c.fillStyle = '#050806'; c.fillRect(x, 0, w, IV_PH);
        c.fillStyle = `rgba(230,110,30,${Math.max(0.18, 0.95 - d / 150)})`; c.fillRect(x < 150 ? x + w - 2 : x, 18, 2, IV_PH - 18);
      }
      c.fillStyle = ivGrad(c, 0, 106, 0, 124, [[0, '#2a160a'], [1, '#0c0a06']]); c.fillRect(0, 106, IV_PW, 18);
      ivGlow(c, 150, 110, 80, 'rgba(220,100,30,0.55)');
      c.save(); c.translate(150, 109);
      for (const a of [-0.35, 0.35, 0]) { c.save(); c.rotate(a); c.fillStyle = '#4a240c'; c.fillRect(-15, -2, 30, 4); c.fillStyle = '#ff7a20'; c.fillRect(-4, -1, 2, 1); c.fillRect(6, 0, 2, 1); c.restore(); }
      c.restore();
      A.fire = [150, 106];
      const ink = '#050302', rim = '#ff8a2a';
      // Sitzende Gestalten mit Kapuze, die zum Feuer gewandte Seite leuchtet
      const sit = (x, y, s, facesRight) => {
        const f = facesRight ? 1 : -1;
        ivPoly(c, [[x - 9 * s, y], [x - 6 * s, y - 15 * s], [x + 6 * s, y - 15 * s], [x + 10 * s, y]], ink);
        c.fillStyle = ink; c.beginPath(); c.arc(x, y - 19 * s, 6 * s, 0, Math.PI * 2); c.fill();
        ivPoly(c, [[x - 5 * s * f, y - 21 * s], [x - 9 * s * f, y - 29 * s], [x + 3 * s * f, y - 24 * s]], ink);
        c.fillStyle = rim; c.fillRect(x + (facesRight ? 6 * s : -7 * s), y - 15 * s, 1.5, 14 * s); c.fillRect(x + (facesRight ? 4.5 * s : -6 * s), y - 23 * s, 1.5, 7 * s);
        ivPoly(c, [[x + 4 * f * s, y - 9 * s], [x + 13 * f * s, y - 6 * s], [x + 12 * f * s, y - 4 * s], [x + 4 * f * s, y - 6 * s]], ink);
      };
      sit(110, 113, 1.15, true); sit(192, 113, 1.15, false); sit(128, 110, 0.85, true);
      // Stehender Bogenschütze mit Bogen und Köcher
      ivPoly(c, [[214, 114], [217, 90], [227, 90], [230, 114]], ink); ivPoly(c, [[212, 92], [215, 70], [229, 70], [232, 92]], ink);
      c.fillStyle = ink; c.beginPath(); c.arc(222, 64, 6.5, 0, Math.PI * 2); c.fill(); ivPoly(c, [[216, 62], [224, 52], [229, 64]], ink);
      ivPoly(c, [[226, 72], [234, 66], [236, 68], [229, 76]], ink);
      c.fillStyle = rim; c.fillRect(212, 72, 2, 40); c.fillRect(215, 59, 1.5, 8);
      c.strokeStyle = '#5a2c10'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(238, 48); c.quadraticCurveTo(252, 78, 238, 110); c.stroke();
      c.strokeStyle = '#c8a070'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(238, 48); c.lineTo(238, 110); c.stroke();
      c.fillStyle = '#2a1408'; c.fillRect(226, 60, 3, 16); c.fillStyle = '#d8c8a0'; c.fillRect(226, 57, 1, 3); c.fillRect(228, 56, 1, 4);
    },
    anim(put, P, A, t) {
      const [fx, fy] = A.fire;
      for (let dx = -11; dx <= 11; dx++) {
        const n = Math.sin(t * 13 + dx * 1.7) * 0.5 + Math.sin(t * 7.1 - dx * 0.9) * 0.5;
        const h = Math.max(1, Math.round((32 - Math.abs(dx) * 2.7) * (0.78 + 0.27 * n)));
        for (let j = 0; j < h; j++) { const u = j / h; put(fx + dx + (j > h * 0.6 ? Math.round(Math.sin(t * 9 + j * 0.5)) : 0), fy - j, P.near(u < 0.4 && Math.abs(dx) < 5 ? '#fff4b0' : u < 0.6 ? '#ffb030' : u < 0.85 ? '#e85a12' : '#9a2a0a')); }
      }
      for (let i = 0; i < 12; i++) { const age = ((t * 0.6 + i / 12) % 1), r = ivRng(i * 13 + Math.floor(t * 0.6 + i / 12)); put(fx + (r() - 0.5) * 16 + Math.sin(age * 6 + i) * 3, fy - 16 - age * 60, P.near(age < 0.5 ? '#ffd060' : '#c04010')); }
    },
  },
  // Morgen auf dem Kanal: ein Schiff mit dem Kreuz im Segel vor weißen Klippen
  heimkehr: {
    paint(c, rnd, A) {
      ivSky(c, [[0, '#2c3a6e'], [0.35, '#7a6a9a'], [0.62, '#e0908a'], [0.82, '#f8c08a'], [1, '#ffe0b0']], 82);
      ivGlow(c, 64, 78, 76, 'rgba(255,220,150,0.6)');
      c.fillStyle = '#fff4d0'; c.beginPath(); c.arc(64, 80, 11, 0, Math.PI * 2); c.fill();
      ivClouds(c, rnd, 12, 12, 66, 'rgba(140,100,150,0.75)', 'rgba(255,208,160,0.6)');
      c.fillStyle = ivGrad(c, 0, 80, 0, 124, [[0, '#9a90b0'], [0.3, '#4a5a8a'], [1, '#18223e']]); c.fillRect(0, 80, IV_PW, 44);
      ivPoly(c, [[196, 81], [204, 66], [228, 61], [262, 63], [300, 57], [300, 82]], '#ece4d4');
      c.fillStyle = '#b8b0a8'; for (let k = 0; k < 22; k++) { const x = 200 + rnd() * 100; c.fillRect(x, 64 + rnd() * 6, 1, 8 + rnd() * 10); }
      c.fillStyle = '#5a7a42'; ivPoly(c, [[204, 66], [228, 61], [262, 63], [300, 57], [300, 60], [262, 66], [228, 64], [206, 68]], '#5a7a42');
      c.fillStyle = '#7a7a90'; c.fillRect(196, 80, 104, 2);
      for (let y = 82; y < 123; y += 2) { const w = 3 + rnd() * 14 * (1 - (y - 82) / 50); c.fillStyle = 'rgba(255,240,192,0.85)'; c.fillRect(64 - w / 2 + (rnd() - 0.5) * 8, y, w, 1); }
      for (let k = 0; k < 40; k++) { c.fillStyle = 'rgba(30,40,80,0.6)'; c.fillRect(rnd() * IV_PW, 86 + rnd() * 36, 4 + rnd() * 8, 1); }
      // Kogge
      const sx = 150, sy = 96;
      for (let k = 0; k < 6; k++) { c.fillStyle = `rgba(24,18,24,${0.5 - k * 0.07})`; c.fillRect(sx - 18 + (k % 2 ? 2 : -1) + rnd() * 2, sy + 5 + k * 2, 34 - k * 3, 1); }
      for (let k = 0; k < 4; k++) { c.fillStyle = 'rgba(230,220,190,0.35)'; c.fillRect(sx - 8 + (k % 2 ? 2 : -2), sy + 7 + k * 3, 16 - k * 3, 1); }
      ivPoly(c, [[sx - 24, sy - 4], [sx + 24, sy - 4], [sx + 18, sy + 4], [sx - 15, sy + 4]], '#2a1a10');
      c.fillStyle = '#5a3a20'; c.fillRect(sx - 22, sy - 3, 44, 1);
      c.fillStyle = '#2a1a10'; c.fillRect(sx - 24, sy - 9, 8, 5); c.fillRect(sx + 15, sy - 8, 9, 4);
      c.fillStyle = '#1a1008'; c.fillRect(sx, sy - 38, 1.5, 34); c.fillRect(sx - 12, sy - 35, 25, 1.2);
      c.fillStyle = ivGrad(c, sx - 11, 0, sx + 12, 0, [[0, '#f4ead0'], [0.7, '#e0d2b0'], [1, '#b8a888']]);
      c.beginPath(); c.moveTo(sx - 11, sy - 34); c.lineTo(sx + 12, sy - 34); c.quadraticCurveTo(sx + 15, sy - 21, sx + 11, sy - 9); c.lineTo(sx - 10, sy - 9); c.quadraticCurveTo(sx - 13, sy - 21, sx - 11, sy - 34); c.fill();
      c.fillStyle = '#b81818'; c.fillRect(sx - 1, sy - 32, 3, 22); c.fillRect(sx - 9, sy - 24, 20, 3);
      ivPoly(c, [[sx + 1.5, sy - 38], [sx + 9, sy - 36.5], [sx + 1.5, sy - 35]], '#c01818');
      A.sun = [64, 82];
      A.gulls = [[40, 30, 9], [100, 20, 7], [210, 36, 11]];
    },
    anim(put, P, A, t) {
      const ph = Math.floor(t * 8);
      for (let k = 0; k < 10; k++) { const r = ivRng(ph * 17 + k), y = 84 + ((r() * 18) | 0) * 2, w = 18 * (1 - (y - 82) / 50); put(A.sun[0] + (r() - 0.5) * w, y, P.near('#ffffff')); }
      A.gulls.forEach(([x0, y0, v], k) => {
        const x = ((x0 + t * v) % 330) - 15, y = y0 + Math.sin(t * 0.8 + k) * 4, up = Math.sin(t * 7 + k * 2) > 0, col = P.near('#3a3050');
        put(x, y, col); put(x - 1, y - (up ? 1 : 0), col); put(x + 1, y - (up ? 1 : 0), col); put(x - 2, y - (up ? 2 : 0), col); put(x + 2, y - (up ? 2 : 0), col);
      });
    },
  },
  // Abend: der verfallene Burgstall, davor ein einsamer Reiter
  burgstall: {
    paint(c, rnd, A) {
      ivSky(c, [[0, '#181430'], [0.35, '#4a2e54'], [0.6, '#a4485a'], [0.8, '#e8884a'], [1, '#ffc472']], 98);
      ivGlow(c, 214, 84, 74, 'rgba(255,190,110,0.62)');
      c.fillStyle = '#ffe6a0'; c.beginPath(); c.arc(214, 86, 12, 0, Math.PI * 2); c.fill();
      ivClouds(c, rnd, 9, 14, 70, 'rgba(58,32,64,0.85)', 'rgba(255,170,110,0.5)');
      ivHills(c, 96, 6, 0.9, '#4a2a48', 1.4, rnd);
      ivHills(c, 104, 5, 2.6, '#2e1a30', 1.1, rnd);
      ivPoly(c, [[120, 124], [168, 90], [196, 78], [272, 76], [300, 86], [300, 124]], '#1c1020');
      const dk = '#140a16', rim = '#f0a070';
      ivPoly(c, [[228, 78], [228, 44], [231, 38], [234, 42], [237, 33], [240, 40], [243, 31], [246, 42], [249, 46], [249, 78]], dk);
      c.fillStyle = '#d07850'; c.fillRect(237, 50, 3, 6); c.fillRect(238, 49, 1, 1); c.fillRect(242, 62, 2, 4);
      for (const [x, w, h] of [[190, 12, 12], [204, 9, 8], [216, 10, 15], [252, 9, 10], [262, 12, 14]]) {
        ivPoly(c, [[x, 79], [x, 79 - h], [x + w * 0.3, 79 - h - 2], [x + w * 0.6, 79 - h + 1], [x + w, 79 - h - 1], [x + w, 79]], dk);
        c.fillStyle = rim; c.fillRect(x, 79 - h, w * 0.3, 1);
      }
      c.fillStyle = rim; c.fillRect(228, 44, 1, 30); c.fillRect(231, 38, 1, 1); c.fillRect(237, 33, 1, 1); c.fillRect(243, 31, 1, 1);
      c.fillStyle = '#120a12'; for (const [x, y, r] of [[200, 80, 7], [258, 80, 6], [182, 86, 8], [280, 82, 9]]) { c.beginPath(); c.arc(x, y, r, Math.PI, 0); c.fill(); }
      ivPoly(c, [[0, 102], [40, 98], [90, 106], [130, 116], [150, 124], [0, 124]], '#0e0a0c');
      c.strokeStyle = '#1a1214'; c.lineWidth = 1; for (let k = 0; k < 50; k++) { const x = rnd() * 140, y = 104 + rnd() * 20; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd() - 0.3) * 3, y - 2 - rnd() * 4); c.stroke(); }
      drawKnight(c, 62, 112, 0.26, '#b08a3a', 0.4);
      A.crows = [238, 30];
    },
    anim(put, P, A, t) {
      const col = P.near('#100810');
      for (let k = 0; k < 3; k++) {
        const a = t * (0.6 + k * 0.17) + k * 2.1, x = A.crows[0] + Math.cos(a) * (22 + k * 6), y = A.crows[1] - 8 + Math.sin(a) * (7 + k * 2), up = Math.sin(t * 9 + k * 2) > 0;
        put(x, y, col); put(x + 1, y, col); put(x - 1, y - (up ? 1 : 0), col); put(x + 2, y - (up ? 1 : 0), col); put(x - 2, y - (up ? 2 : 1), col); put(x + 3, y - (up ? 2 : 1), col);
      }
    },
  },
};

// ---------------------------------------------------------------- Bilder von Oakgen (600 × 248, doppelt so fein)
// Farbzyklen in Bildkoordinaten: twinkle (Sterne), shimmer (Glitzer auf Wasser), flicker (Flammen, Feuerschein,
// slow: ruhiger Schein), sparkle (Lichtblitze), wave (Fahnen wehen, Mast links), smoke (Rauch aus Kaminen), sparks
// (Funken), gulls (Möwen ziehen vorbei), crows (Krähen kreisen)
const IV_FX = {
  kerker: [
    { fx: 'twinkle', r: [0, 0, 600, 95], lum: 140, n: 48, ex: [[362, 0, 458, 72]] },
    { fx: 'shimmer', r: [392, 168, 432, 246], lum: 115 },
    { fx: 'flicker', r: [209, 53, 219, 67], amp: 0.4 },
    { fx: 'flicker', r: [187, 115, 199, 129], amp: 0.3 },
  ],
  krone: [
    { fx: 'flicker', r: [148, 28, 168, 64], amp: 0.45 },
    { fx: 'flicker', r: [432, 30, 452, 64], amp: 0.45 },
    { fx: 'sparkle', pts: [[300, 96], [245, 114], [354, 114], [268, 134], [300, 131], [331, 134], [277, 121], [334, 121]] },
  ],
  banner: [
    { fx: 'wave', r: [417, 7, 473, 35], amp: 1.6 },
    { fx: 'wave', r: [348, 40, 374, 51], amp: 1 },
    { fx: 'wave', r: [459, 43, 489, 60], amp: 1 },
    { fx: 'wave', r: [507, 60, 532, 75], amp: 1 },
    { fx: 'wave', r: [295, 77, 315, 89], amp: 0.8 },
    { fx: 'smoke', pts: [[93, 174], [241, 197], [324, 180], [427, 177], [492, 167]] },
    { fx: 'shimmer', r: [110, 140, 142, 172], lum: 150 },
  ],
  wald: [
    { fx: 'flicker', r: [254, 128, 296, 198], amp: 0.5 },
    { fx: 'flicker', r: [130, 8, 180, 140], amp: 0.14, slow: true },
    { fx: 'flicker', r: [518, 8, 566, 160], amp: 0.12, slow: true },
    { fx: 'sparks', at: [272, 168], h: 140 },
  ],
  heimkehr: [
    { fx: 'shimmer', r: [254, 172, 296, 246], lum: 150 },
    { fx: 'wave', r: [188, 60, 228, 82], amp: 1.3 },
    { fx: 'gulls', list: [[40, 44, 8], [300, 22, 6]] },
  ],
  burgstall: [
    { fx: 'crows', c: [420, 50], rx: 72, ry: 22, n: 3 },
  ],
};

const ivLum = (d, i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
const ivHash = (a, b) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 13; return ((Math.imul(h, 0x27d4eb2d) >>> 0) % 1000) / 1000; };

// Ein Bild von Oakgen als Bild der Vorgeschichte: 64 Farben (wie ein Amiga mit AGA), leichtes Raster, Farbzyklen vorbereitet
function ivFromImage(img, name) {
  const cv = document.createElement('canvas'); cv.width = 600; cv.height = 248;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.drawImage(img, 0, 0, 600, 248);
  const id = c.getImageData(0, 0, 600, 248), d = id.data, W = 600;
  const pic = ivQuantize(id, 64, 8);
  pic.name = name; pic.k = 2; pic.fx = [];
  const inR = (x, y, r) => x >= r[0] && y >= r[1] && x < r[2] && y < r[3];
  for (const f of IV_FX[name] || []) {
    const e = { ...f };
    if (f.r && (f.fx === 'twinkle' || f.fx === 'shimmer' || f.fx === 'flicker')) {
      const pts = [];
      for (let y = f.r[1]; y < f.r[3]; y++) for (let x = f.r[0]; x < f.r[2]; x++) {
        const i = (y * W + x) * 4, l = ivLum(d, i);
        if (f.ex && f.ex.some((r) => inR(x, y, r))) continue;
        if (f.fx === 'flicker' ? d[i] > 100 && d[i] >= d[i + 1] && d[i + 1] >= d[i + 2] * 0.85 : l > f.lum) pts.push([x, y, d[i], d[i + 1], d[i + 2]]);
      }
      // Sterne: nur die hellsten, über den Himmel verteilt
      if (f.fx === 'twinkle') { pts.sort((a, b) => (b[2] + b[3] + b[4]) - (a[2] + a[3] + a[4])); e.pts = pts.slice(0, f.n || 40); } else e.pts = pts;
    }
    pic.fx.push(e);
  }
  return pic;
}

function ivFxRun(put, pic, t) {
  const P = pic, src = pic.px, W = pic.w;
  const scale = (r, g, b, k) => P.nearRGB(r * k, g * k, b * k);
  const bird = (x, y, up, col, span) => {
    put(x, y, col); put(x + 1, y, col);
    for (let i = 1; i <= span; i++) { const dy = up ? -Math.ceil(i / 2) : Math.floor(i / 3); put(x - i, y + dy, col); put(x + 1 + i, y + dy, col); }
  };
  for (const f of pic.fx) {
    if (f.fx === 'twinkle') f.pts.forEach(([x, y, r, g, b], k) => { const v = Math.sin(t * 2.7 + k * 1.93); if (v > 0.55) { put(x, y, P.nearRGB(255, 255, 250)); if (v > 0.9) { put(x + 1, y, scale(r, g, b, 1)); put(x - 1, y, scale(r, g, b, 1)); put(x, y - 1, scale(r, g, b, 1)); put(x, y + 1, scale(r, g, b, 1)); } } else if (v < -0.7) put(x, y, scale(r, g, b, 0.45)); });
    else if (f.fx === 'shimmer') { const st = Math.floor(t * 8); f.pts.forEach(([x, y, r, g, b], k) => { const h = ivHash(st, k); if (h < 0.28) put(x, y, scale(r, g, b, 0.6)); else if (h > 0.9) put(x, y, P.nearRGB(255, 252, 235)); }); }
    else if (f.fx === 'flicker') {
      const glow = f.slow ? 1 + f.amp * (Math.sin(t * 6.1) * 0.6 + Math.sin(t * 9.7 + 1) * 0.4) : 0;
      for (const [x, y, r, g, b] of f.pts) {
        const k = f.slow ? glow : 1 + f.amp * (0.5 * Math.sin(t * 13 + x * 0.9 + y * 0.45) + 0.5 * Math.sin(t * 7.3 - y * 0.6 + x * 0.3));
        put(x, y, scale(r, g, b, k));
      }
    } else if (f.fx === 'sparkle') {
      const cyc = Math.floor(t / 0.5), life = (t / 0.5) % 1;
      if (life < 0.55) {
        const [sx, sy] = f.pts[Math.floor(ivHash(cyc, 7) * f.pts.length)], arm = life < 0.25 ? 3 : 2, w = P.nearRGB(255, 255, 255), g = P.nearRGB(255, 240, 170);
        put(sx, sy, w);
        for (let i = 1; i <= arm; i++) { const c2 = i === 1 ? w : g; put(sx + i, sy, c2); put(sx - i, sy, c2); put(sx, sy + i, c2); put(sx, sy - i, c2); }
      }
    } else if (f.fx === 'wave') {
      const [x0, y0, x1, y1] = f.r, col = [];
      for (let x = x0 + 1; x < x1; x++) {
        const dy = Math.round(Math.sin(t * 5.5 + x * 0.35) * f.amp * (x - x0) / (x1 - x0));
        if (!dy) continue;
        col.length = 0;
        for (let y = y0; y < y1; y++) col.push(src[y * W + x]);
        for (let y = y0; y < y1; y++) { const sy = y - dy; if (sy >= y0 && sy < y1) put(x, y, col[sy - y0]); }
      }
    } else if (f.fx === 'smoke') {
      f.pts.forEach(([px, py], k) => {
        for (let i = 0; i < 9; i++) {
          const age = (t * 0.3 + i / 9 + k * 0.21) % 1, y = py - age * 46, x = px + Math.sin(age * 5 + k) * 3 + age * 12, sz = 1 + Math.floor(age * 3);
          const v = 150 - age * 50, col = P.nearRGB(v, v * 0.92, v * 0.95);
          for (let a = 0; a < sz; a++) for (let b = 0; b < sz; b++) if ((a + b + i) % 2 === 0 && age < 0.9) put(x + a, y + b, col);
        }
      });
    } else if (f.fx === 'sparks') {
      for (let i = 0; i < 14; i++) {
        const age = (t * 0.55 + i / 14) % 1, n = Math.floor(t * 0.55 + i / 14), r = ivHash(n, i);
        const x = f.at[0] + (r - 0.5) * 24 + Math.sin(age * 6 + i) * 4, y = f.at[1] - age * f.h;
        put(x, y, P.nearRGB(255, 220 - age * 120, 90 - age * 60));
        if (age < 0.4) put(x, y + 1, P.nearRGB(255, 150, 40));
      }
    } else if (f.fx === 'gulls') {
      f.list.forEach(([x0, y0, v], k) => { const x = ((x0 + t * v) % 640) - 20, y = y0 + Math.sin(t * 0.7 + k) * 5; bird(x, y, Math.sin(t * 6 + k * 2) > 0, P.nearRGB(248, 246, 240), 4); });
    } else if (f.fx === 'crows') {
      for (let k = 0; k < f.n; k++) {
        const a = t * (0.5 + k * 0.13) + k * 2.1, x = f.c[0] + Math.cos(a) * (f.rx - k * 14), y = f.c[1] + Math.sin(a) * (f.ry - k * 4);
        bird(x, y, Math.sin(t * 8 + k * 2) > 0, P.nearRGB(18, 10, 20), 4);
      }
    }
  }
}

function ivPaint(name, seed) {
  const cv = document.createElement('canvas'); cv.width = IV_PW; cv.height = IV_PH;
  const c = cv.getContext('2d', { willReadFrequently: true }), A = {};
  IV_SCENES[name].paint(c, ivRng(seed), A);
  const pic = ivQuantize(c.getImageData(0, 0, IV_PW, IV_PH));
  pic.A = A; pic.name = name;
  return pic;
}

// ================================================================ Vorgeschichte
function ivStartStory(I) {
  I.F = ivFrame(IV_LW, IV_LH);
  I.lo = document.createElement('canvas'); I.lo.width = IV_LW; I.lo.height = IV_LH;
  I.loc = I.lo.getContext('2d');
  const A = introOut(), buf = audioBuffer('intro_geschichte');
  if (A && !I.tracker) I.tracker = buf ? ivStoryFile(A, buf) : ivTracker(A);
  I.pics = [];
  ivSlide(I, 0);
}

function ivSlide(I, i) {
  const s = IV_STORY[i];
  if (!I.pics[i]) {
    const img = ART[`intro_g${i + 1}`];
    I.pics[i] = img && img.complete !== false && (img.naturalWidth || img.width) ? ivFromImage(img, s.bild) : ivPaint(s.bild, 1194 + i * 77);
  }
  I.slide = { i, phase: 'ein', t: 0, chars: 0, lines: ivWrap(s.text, IV_LW - IV_TX * 2), total: s.text.length };
  if (I.sr) I.sr.textContent = s.text;
}

function ivStoryNext(I) {
  const S = I.slide;
  if (!S) return;
  if (S.phase === 'ein' || S.phase === 'text') { S.chars = S.total; S.phase = 'halt'; S.t = Math.max(0, ivHold(S) - 1.4); return; }
  if (S.phase === 'halt') { S.phase = 'aus'; S.t = 0; }
}
const ivHold = (S) => 2.6 + S.total * 0.03;

function ivStory(I, dt) {
  const S = I.slide, F = I.F;
  S.t += dt;
  if (S.phase === 'ein' && S.t > 0.7) { S.phase = 'text'; S.t = 0; }
  else if (S.phase === 'text') { S.chars += dt * 36; if (S.chars >= S.total) { S.chars = S.total; S.phase = 'halt'; S.t = 0; } }
  else if (S.phase === 'halt' && S.t > ivHold(S)) { S.phase = 'aus'; S.t = 0; }
  else if (S.phase === 'aus' && S.t > 0.7) {
    // Im Dunkeln das nächste Bild malen: so fällt die kurze Rechenpause nicht auf
    if (S.i + 1 < IV_STORY.length) ivSlide(I, S.i + 1);
    else { ivStartFinale(I); return; }
  }
  const pic = I.pics[S.i];
  F.px.fill(ivPack(0, 0, 0));
  let hi = null;
  if (pic.k === 2) {
    // Bild von Oakgen: doppelt so fein auf eigener Fläche, Rahmen und Schrift bleiben grob
    if (!I.PF) { I.PF = ivFrame(600, 248); I.pcv = document.createElement('canvas'); I.pcv.width = 600; I.pcv.height = 248; I.pcc = I.pcv.getContext('2d'); }
    const PF = I.PF;
    PF.px.set(pic.px);
    const put = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < 600 && y < 248) PF.px[y * 600 + x] = col; };
    ivFxRun(put, pic, I.t);
    hi = PF;
  } else {
    for (let y = 0; y < IV_PH; y++) F.px.set(pic.px.subarray(y * IV_PW, (y + 1) * IV_PW), (IV_PY + y) * IV_LW + IV_PX);
    const put = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < IV_PW && y < IV_PH) F.px[(IV_PY + y) * IV_LW + IV_PX + x] = col; };
    IV_SCENES[pic.name].anim(put, pic, pic.A, I.t);
  }
  ivBorder(F);
  // Text
  let left = Math.floor(S.chars), cx = 0, cy = 0;
  S.lines.forEach((ln, k) => {
    if (left <= 0) return;
    const part = ln.slice(0, left); left -= ln.length + 1;
    ivPrint(F, part, IV_TX, IV_TY + k * IV_LINE, IV_TEXT, IV_SHADOW);
    cx = IV_TX + ivTextW(part); cy = IV_TY + k * IV_LINE;
  });
  if ((S.phase === 'text' || S.phase === 'halt') && Math.floor(I.t * 2.4) % 2 === 0) {
    const col = IV_TEXT[8];
    if (S.phase === 'halt') { cx = IV_LW - 18; cy = IV_LH - 13; }
    for (let y = 2; y < 12; y++) for (let x = 1; x < 6; x++) F.px[(cy + y) * IV_LW + cx + x] = S.phase === 'halt' && (x + y) % 2 ? IV_SHADOW : col;
  }
  // Ein- und Ausblenden in Schritten, wie mit der Farbpalette
  const k = S.phase === 'ein' ? S.t / 0.7 : S.phase === 'aus' ? 1 - S.t / 0.7 : 1;
  const shade = Math.round(ivClamp(k) * 8) / 8;
  ivShade(F, shade);
  if (hi) { ivShade(hi, shade); I.pcc.putImageData(hi.img, 0, 0); }
  ivShow(I, F, I.lo, I.loc, false, hi ? I.pcv : null);
}

// Bildspeicher auf den Schirm: groß, scharfe Kanten, leichte Rasterzeilen wie am Monitor
function ivShow(I, F, lo, loc, cover, overlay = null) {
  loc.putImageData(F.img, 0, 0);
  const c = I.ctx, W = I.cv.width, H = I.cv.height;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  const s = cover ? Math.max(W / F.w, H / F.h) : Math.min(W / F.w, H / F.h);
  const dw = F.w * s, dh = F.h * s, dx = (W - dw) / 2, dy = (H - dh) / 2;
  c.imageSmoothingEnabled = false;
  c.drawImage(lo, dx, dy, dw, dh);
  if (overlay) c.drawImage(overlay, dx + IV_PX * s, dy + IV_PY * s, IV_PW * s, IV_PH * s);
  if (s >= 3) {
    if (!I.scan || I.scanS !== s) {
      const p = document.createElement('canvas'); p.width = 1; p.height = Math.max(2, Math.round(s));
      const pc = p.getContext('2d'); pc.fillStyle = 'rgba(0,0,0,0.2)'; pc.fillRect(0, p.height - Math.max(1, Math.round(s * 0.3)), 1, Math.max(1, Math.round(s * 0.3)));
      I.scan = c.createPattern(p, 'repeat'); I.scanS = s;
    }
    c.save(); c.translate(0, dy); c.fillStyle = I.scan; c.fillRect(dx, 0, dw, dh); c.restore();
  }
}

// ================================================================ Schluss: Titel als Pixelbild, dann das Gemälde
function ivStartFinale(I) {
  I.phase = 'finale'; I.pt = 0;
  I.hint.textContent = '';
  if (I.sr) I.sr.textContent = "A Knight's Tale";
  const lw = IV_LW, lh = Math.max(120, Math.min(720, Math.round(IV_LW * I.h / Math.max(1, I.w))));
  I.fin = { F: ivFrame(lw, lh), lo: document.createElement('canvas') };
  I.fin.lo.width = lw; I.fin.lo.height = lh; I.fin.loc = I.fin.lo.getContext('2d');
  ivFinaleSnapshot(I);
  ivFinaleLogo(I);
  if (I.tracker) I.tracker.schluss();
}

function ivFinaleSnapshot(I) {
  const fin = I.fin;
  if (!fin) return;
  const cv = document.createElement('canvas'); cv.width = fin.F.w; cv.height = fin.F.h;
  const c = cv.getContext('2d', { willReadFrequently: true });
  // Wie das Titelbild: dieselbe Zeit, derselbe Ausschnitt, nur klein
  c.scale(fin.F.w / I.w, fin.F.h / I.h);
  drawTitleArt(c, I.w, I.h, G.time, G.titleColor || '#c8a040');
  fin.pic = ivQuantize(c.getImageData(0, 0, fin.F.w, fin.F.h), 32, 22);
  if (I.ending) ivFinaleDraw(I);
}

// Schriftzug genau dort, wo die Überschrift des Startmenüs sitzt (Zeile für Zeile), damit er beim Überblenden in sie
// übergeht
function ivTitleLines() {
  const h1 = document.querySelector('#title h1');
  if (!h1 || byId('title').hidden) return null;
  const node = [...h1.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
  if (!node) return null;
  const txt = node.textContent, words = [];
  let pos = 0;
  for (const w of txt.split(/(\s+)/)) {
    if (w.trim()) {
      const r = document.createRange(); r.setStart(node, pos); r.setEnd(node, pos + w.length);
      const b = r.getBoundingClientRect();
      if (b.width > 0) words.push({ w, b });
    }
    pos += w.length;
  }
  const lines = [];
  for (const it of words) {
    const ln = lines.find((l) => Math.abs(l.top - it.b.top) < it.b.height * 0.5);
    if (ln) { ln.text += ` ${it.w}`; ln.right = it.b.right; ln.bottom = Math.max(ln.bottom, it.b.bottom); }
    else lines.push({ text: it.w, left: it.b.left, right: it.b.right, top: it.b.top, bottom: it.b.bottom });
  }
  return { lines, font: getComputedStyle(h1) };
}

function ivFinaleLogo(I) {
  const fin = I.fin, w = fin.F.w, h = fin.F.h, sx = w / I.w, sy = h / I.h;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.fillStyle = '#fff'; c.textBaseline = 'middle';
  const T = ivTitleLines();
  if (T && T.lines.length) {
    for (const ln of T.lines) {
      let size = (ln.bottom - ln.top) * sy * 0.8;
      c.font = `${T.font.fontWeight} ${size}px ${T.font.fontFamily}`;
      const m = c.measureText(ln.text).width;
      if (m > 0) { size *= ((ln.right - ln.left) * sx) / m; c.font = `${T.font.fontWeight} ${size}px ${T.font.fontFamily}`; }
      c.fillText(ln.text, ln.left * sx, ((ln.top + ln.bottom) / 2) * sy);
    }
  } else {
    c.font = `400 ${h * 0.12}px "UnifrakturMaguntia", serif`;
    c.fillText("A Knight's Tale", w * 0.08, h * 0.22);
  }
  const d = c.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
  let y0 = h, y1 = 0;
  for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] > 110) { mask[i] = 1; const yy = (i / w) | 0; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
  const edge = new Uint8Array(w * h);
  for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) { const i = yy * w + xx; if (!mask[i] && (mask[i - 1] || mask[i + 1] || mask[i - w] || mask[i + w] || mask[i - w - 1])) edge[i] = 1; }
  fin.mask = mask; fin.edge = edge; fin.y0 = y0; fin.y1 = Math.max(y0 + 1, y1);
  fin.gold = ivRamp('#7a3a08', '#fff8c8', 9).concat(ivRamp('#fff8c8', '#7a3a08', 9).slice(1));
}

function ivFinaleDraw(I) {
  const fin = I.fin, F = fin.F, t = I.pt;
  F.px.set(fin.pic.px);
  // Goldschrift mit wanderndem Glanz (Farbzyklus) und dunklem Rand
  const n = fin.gold.length, span = fin.y1 - fin.y0 + 1, shift = Math.floor(t * 12);
  const dark = ivPack(34, 14, 0);
  const vis = ivClamp((t - 0.5) / 0.9);
  for (let i = 0; i < fin.mask.length; i++) {
    if (fin.edge[i] && vis > 0) F.px[i] = dark;
    else if (fin.mask[i] && vis > 0) {
      const yy = (i / F.w) | 0, u = (yy - fin.y0) / span;
      if (u > vis * 1.2) continue;
      const base = 3 + Math.round((1 - Math.abs(u - 0.4) * 1.6) * 5), band = ((yy + 40 - shift) % 40 + 40) % 40;
      F.px[i] = fin.gold[Math.max(0, Math.min(n - 1, band < 6 ? 8 + (band % 3) : base))];
    }
  }
  if (t > 2 && !I.ending && Math.floor(t * 1.6) % 2 === 0) {
    const msg = 'Drücke eine Taste';
    ivPrint(F, msg, Math.round((F.w - ivTextW(msg)) / 2), F.h - 22, IV_TEXT, IV_SHADOW);
  }
  const k = Math.round(ivClamp(t / 1.0) * 8) / 8;
  ivShade(F, k);
  ivShow(I, F, fin.lo, fin.loc, true);
}

function ivFinale(I) {
  ivFinaleDraw(I);
  if (I.pt > 14 && !I.ending) ivEnd(false);
}

// ================================================================ Tracker-Musik: 8-Bit-Samples wie auf dem Amiga
const IV_SR = 16574, IV_BEAT = 60 / 110;
const IV_CH = { Dm: [50, 57, 62, 65], Bb: [46, 53, 58, 62], F: [53, 57, 60, 65], C: [48, 55, 60, 64], A: [45, 52, 57, 61], Gm: [43, 50, 55, 58], D: [50, 57, 62, 66] };
const IV_ROOT = { Dm: 38, Bb: 34, F: 41, C: 36, A: 33, Gm: 31, D: 38 };
const IV_MEL_B = [[[69, 2], [74, 1], [76, 1]], [[77, 1.5], [76, 0.5], [74, 1], [72, 1]], [[72, 2], [69, 1], [72, 1]], [[67, 3], [64, 1]],
  [[69, 2], [74, 1], [76, 1]], [[77, 1], [79, 1], [77, 1], [74, 1]], [[76, 1.5], [72, 0.5], [76, 1], [79, 1]], [[76, 2], [73, 1], [69, 1]]];
const IV_MEL_C = [[[74, 1], [70, 1], [67, 1], [70, 1]], [[69, 2], [65, 1], [69, 1]], [[73, 1], [76, 1], [81, 1], [79, 1]], [[77, 2], [74, 2]],
  [[74, 1], [77, 1], [82, 1], [81, 1]], [[81, 1.5], [79, 0.5], [77, 1], [72, 1]], [[76, 1], [79, 1], [76, 1], [72, 1]], [[76, 2], [73, 2]]];
// Aufmarsch (Kriegstrommeln, Streicher galoppieren an), Thema mit Kampftrommeln, Marsch, Sturm (alles, Doppel-Kick)
const IV_SONG = [
  { ch: ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A'], drums: 'aufmarsch', choir: 2, stac: 4, harp: 16 },
  { ch: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'C', 'A'], mel: IV_MEL_B, drums: 'kampf', bass: true, stac: 0, blech: true, harp: 8 },
  { ch: ['Gm', 'Dm', 'A', 'Dm', 'Bb', 'F', 'C', 'A'], mel: IV_MEL_C, drums: 'marsch', bass: true, choir: 0, stac: 0, blech: true },
  { ch: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'C', 'A'], mel: IV_MEL_B, drums: 'sturm', bass: true, choir: 0, stac: 0, blech: true, oct: true },
];

function ivInstruments(ac) {
  const q8 = (v) => Math.round(Math.max(-1, Math.min(1, v)) * 127) / 127;
  const mk = (data, rate = IV_SR) => { const b = ac.createBuffer(1, data.length, rate); b.getChannelData(0).set(data); return b; };
  const lpA = (f) => 1 - Math.exp(-2 * Math.PI * f / IV_SR);
  const I = {};
  // Streicher: fünf verstimmte Sägezähne, nahtlos geschleift (ganzzahlige Schwingungen je Schleife)
  {
    const L = 0.5, N = Math.round(IV_SR * L), det = [0.993, 0.997, 1, 1.004, 1.008], cyc = det.map((d) => Math.round(261.63 * d * L));
    const out = new Float32Array(N), a = lpA(2600); let lp = 0;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) { let v = 0; for (const cc of cyc) v += 2 * ((i * cc / N) % 1) - 1; lp += a * (v / cyc.length - lp); if (pass) out[i] = q8(lp * 1.1); }
    I.str = { buf: mk(out), base: 60, loop: true, a: 0.3, r: 0.5 };
  }
  // Chor „aah“: Sägezähne durch drei Formantfilter
  {
    const L = 0.5, N = Math.round(IV_SR * L), cyc = [0.996, 1, 1.005].map((d) => Math.round(261.63 * d * L));
    const bp = (f, Q) => { const w = 2 * Math.PI * f / IV_SR, al = Math.sin(w) / (2 * Q), a0 = 1 + al; return { b0: al / a0, b2: -al / a0, a1: -2 * Math.cos(w) / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 }; };
    const fs = [[bp(730, 6), 1], [bp(1090, 8), 0.6], [bp(2440, 10), 0.25]];
    const out = new Float32Array(N);
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < N; i++) {
      let x = 0; for (const cc of cyc) x += 2 * ((i * cc / N) % 1) - 1; x /= 3;
      let y = 0;
      for (const [f, g] of fs) { const o = f.b0 * x + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2; f.x2 = f.x1; f.x1 = x; f.y2 = f.y1; f.y1 = o; y += o * g; }
      if (pass === 2) out[i] = q8(y * 2.2);
    }
    I.chor = { buf: mk(out), base: 60, loop: true, a: 0.5, r: 0.7 };
  }
  // Einzelne Schwingungen mit 64 Werten (wie Chip-Samples): Melodie und Bass
  const cycle = (fn) => { const d = new Float32Array(64); for (let i = 0; i < 64; i++) d[i] = q8(fn(i / 64)); return d; };
  I.lead = { buf: mk(cycle((u) => { let v = 0; for (let h = 1; h <= 14; h++) v += (Math.sin(Math.PI * h * 0.3) / h) * Math.cos(2 * Math.PI * h * u) * Math.pow(0.86, h); return v * 1.4; }), 64 * 261.63), base: 60, loop: true, a: 0.02, r: 0.12, vib: true };
  I.bass = { buf: mk(cycle((u) => { let v = 0; for (let h = 1; h <= 12; h++) v += Math.sin(2 * Math.PI * h * u) / h; return Math.tanh(v * 1.9) * 0.9; }), 64 * 130.81), base: 48, loop: true, a: 0.004, r: 0.06, dec: 0.35 };
  // Blech: helle, angezerrte Sägezähne für kurze Stöße
  {
    const L = 0.5, N = Math.round(IV_SR * L), cyc = [0.995, 1, 1.006].map((d) => Math.round(261.63 * d * L));
    const out = new Float32Array(N), a = lpA(3600); let lp = 0;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) { let v = 0; for (const cc of cyc) v += 2 * ((i * cc / N) % 1) - 1; lp += a * (v / cyc.length - lp); if (pass) out[i] = q8(Math.tanh(lp * 2.2) * 0.85); }
    I.blech = { buf: mk(out), base: 60, loop: true, a: 0.012, r: 0.12, dec: 0.22 };
  }
  // Harfe: gezupfte Saite
  {
    const N = Math.round(IV_SR * 1.6), P = Math.round(IV_SR / 523.25), ring = new Float32Array(P), out = new Float32Array(N);
    for (let i = 0; i < P; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < N; i++) { const a = ring[idx], b = ring[(idx + 1) % P]; ring[idx] = (a + b) * 0.5 * 0.997; out[i] = q8(a * 0.9); idx = (idx + 1) % P; }
    I.harfe = { buf: mk(out), base: 72, loop: false, a: 0.002, r: 0.6 };
  }
  // Schlagwerk
  const drum = (dur, fn) => { const N = Math.round(IV_SR * dur), out = new Float32Array(N); let s = { lp: 0, hp: 0, prev: 0, ph: 0 }; for (let i = 0; i < N; i++) out[i] = q8(fn(i / IV_SR, s)); return { buf: mk(out), base: 60, loop: false, a: 0.001, r: 0.1, one: true }; };
  I.pauke = drum(2, (t, s) => { const f = 98 * (1 + 0.16 * Math.exp(-t * 40)); s.ph += f / IV_SR; const n = Math.random() * 2 - 1; s.lp += lpA(380) * (n - s.lp); return Math.sin(2 * Math.PI * s.ph) * Math.exp(-t * 2.2) * 0.95 + Math.sin(2 * Math.PI * s.ph * 1.51) * Math.exp(-t * 6) * 0.25 + s.lp * Math.exp(-t * 30) * 1.4; });
  I.pauke.base = 43;
  I.kick = drum(0.4, (t, s) => { const f = 48 + 150 * Math.exp(-t * 32); s.ph += f / IV_SR; const click = t < 0.006 ? (Math.random() * 2 - 1) * 0.6 : 0; return Math.tanh((Math.sin(2 * Math.PI * s.ph) * Math.exp(-t * 8) + click) * 1.8) * 0.95; });
  I.snare = drum(0.3, (t, s) => { const n = Math.random() * 2 - 1; s.lp += lpA(6800) * (n - s.lp); s.ph += 190 / IV_SR; return Math.tanh((s.lp * 1.1 * Math.exp(-t * 13) + Math.sin(2 * Math.PI * s.ph) * 0.6 * Math.exp(-t * 26) + Math.sin(2 * Math.PI * s.ph * 1.74) * 0.3 * Math.exp(-t * 30)) * 1.7) * 0.9; });
  // Große Kriegstrommel und Toms: tiefer Schlag mit Fell und etwas Zerrung
  I.taiko = drum(1.1, (t, s) => { const f = 50 + 75 * Math.exp(-t * 24); s.ph += f / IV_SR; const n = Math.random() * 2 - 1; s.lp += lpA(950) * (n - s.lp); return Math.tanh((Math.sin(2 * Math.PI * s.ph) * Math.exp(-t * 4.2) * 1.4 + s.lp * Math.exp(-t * 16) * 1.3) * 1.7) * 0.95; });
  I.tom = drum(0.6, (t, s) => { const f = 100 + 70 * Math.exp(-t * 20); s.ph += f / IV_SR; const n = Math.random() * 2 - 1; s.lp += lpA(2000) * (n - s.lp); return Math.tanh((Math.sin(2 * Math.PI * s.ph) * Math.exp(-t * 7) + s.lp * Math.exp(-t * 24) * 0.8) * 1.6) * 0.9; });
  I.hat = drum(0.08, (t, s) => { const n = Math.random() * 2 - 1, hp = n - s.prev; s.prev = n; return hp * 0.45 * Math.exp(-t * 60); });
  I.becken = drum(1.8, (t, s) => { const n = Math.random() * 2 - 1, hp = n - s.prev * 0.7; s.prev = n; return hp * 0.42 * Math.exp(-t * 2.4); });
  I.stac = { ...I.str, a: 0.004, r: 0.06, dec: 0.1 };
  return I;
}

// Die Musik der Vorgeschichte als Aufnahme (Oakgen, assets/intro/geschichte.mp3): d-Moll, 110 Schläge je Minute, der
// erste Takt beginnt bei 1,601 s. Die Schleife läuft über 32 Takte von 32,146 s bis 101,965 s: An dieser Stelle passen
// die Takte davor zusammen, und der leise Anfang kommt nicht wieder.
const IV_STORY_FILE = { gain: 1.5, d0: 1.601, loopStart: 32.146, loopEnd: 101.965 };
function ivStoryFile(A, buf) {
  const { ac } = A, M = IV_STORY_FILE, t0 = ac.currentTime + 0.08, bar = 4 * IV_BEAT;
  const src = ac.createBufferSource(); src.buffer = buf;
  src.loop = true; src.loopStart = M.loopStart; src.loopEnd = Math.min(M.loopEnd, buf.duration);
  const g = ac.createGain(); g.gain.value = M.gain;
  src.connect(g); g.connect(A.dry); src.start(t0);
  const syn = ivTracker(A, false);   // nur für den Schlussakkord
  let stopped = false;
  const fade = (at, tc, after) => {
    const now = ac.currentTime;
    g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.setTargetAtTime(0, Math.max(now, at), tc);
    setTimeout(() => { try { src.stop(); } catch (e) { /* schon aus */ } g.disconnect(); }, (Math.max(0, at - now) + after) * 1000);
  };
  // Wo die Aufnahme gerade steht (mit Schleife)
  const pos = () => {
    let p = ac.currentTime - t0;
    if (p > src.loopEnd) p = src.loopStart + ((p - src.loopEnd) % (src.loopEnd - src.loopStart));
    return p;
  };
  return {
    stop(tc = 1) { if (stopped) return; stopped = true; fade(ac.currentTime, tc / 3, tc + 1.5); syn.stop(tc); },
    // Schluss: Der große Schlag des Schlussakkords (0,75 s nach seinem Anlauf) fällt auf einen halben Takt der Aufnahme,
    // und die Aufnahme klingt im Anlauf aus
    schluss() {
      if (stopped) return;
      stopped = true;
      const hb = bar / 2, p = pos();
      let wait = M.d0 + Math.ceil((p - M.d0) / hb) * hb - p - 0.75;
      while (wait < 0.1) wait += hb;
      const at = ac.currentTime + wait;
      fade(at, 0.25, 3);
      syn.finale(at);
      syn.stop(2.4);
    },
  };
}

function ivTracker(A, bars = true) {
  const { ac } = A;
  const bus = ac.createGain(); bus.gain.value = 1.05; bus.connect(A.dry);
  const send = ac.createGain(); send.gain.value = 0.3; bus.connect(send); send.connect(A.wet);
  const I = ivInstruments(ac), live = new Set();
  const T = {
    n: 0, next: ac.currentTime + 0.12, stopped: false,
    note(id, m, t, dur, vol, pan = 0) {
      const S = I[id], src = ac.createBufferSource();
      src.buffer = S.buf; src.loop = S.loop; src.playbackRate.value = Math.pow(2, (m - S.base) / 12);
      const g = ac.createGain(), p = ac.createStereoPanner(); p.pan.value = pan;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + S.a);
      if (S.dec) g.gain.setTargetAtTime(vol * 0.55, t + S.a, S.dec);
      if (!S.one) g.gain.setTargetAtTime(0, t + dur, S.r / 3);
      let lfo = null;
      if (S.vib && dur > 0.4) { lfo = ac.createOscillator(); const lg = ac.createGain(); lfo.frequency.value = 5.6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(14, t + 0.35); lfo.connect(lg); lg.connect(src.detune); lfo.start(t); lfo.stop(t + dur + S.r + 0.1); }
      src.connect(g); g.connect(p); p.connect(bus);
      const end = S.one ? t + S.buf.duration / src.playbackRate.value + 0.05 : t + dur + S.r + 0.05;
      src.start(t); src.stop(end);
      live.add(src); src.onended = () => live.delete(src);
    },
    stop(tc = 1) {
      if (T.stopped) return;
      T.stopped = true; clearInterval(T.timer);
      const now = ac.currentTime;
      bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(bus.gain.value, now); bus.gain.setTargetAtTime(0, now, tc / 3);
      setTimeout(() => { for (const s of live) { try { s.stop(); } catch (e) { /* schon aus */ } } bus.disconnect(); fb.disconnect(); }, tc * 1000 + 6500);
    },
    // Schlussakkord in D-Dur mit Fanfare, eigener Ausgang, klingt aus, während der Titel erscheint
    finale(at) {
      const t = Math.max(at || 0, ac.currentTime + 0.08);
      [[69, 0], [74, 0.25], [78, 0.5], [81, 0.75]].forEach(([m, d], k) => { fbNote('lead', m, t + d, k === 3 ? 3.2 : 0.22, 0.16, -0.4); fbNote('blech', m - 12, t + d, k === 3 ? 2.6 : 0.2, 0.06, -0.2); });
      for (const m of [57, 62, 66, 69]) { fbNote('str', m, t, 4.2, 0.11, m % 2 ? -0.3 : 0.3); fbNote('chor', m, t + 0.2, 4.0, 0.12, m % 2 ? 0.3 : -0.3); }
      for (let k = 0; k < 12; k++) fbNote(k % 2 ? 'tom' : 'taiko', k % 2 ? 66 - k : 60, t + k * 0.06, 0.1, 0.2 + k * 0.04, k % 2 ? 0.35 : -0.35);
      for (const [d, v] of [[0.75, 0.8], [1.3, 0.5], [1.5, 0.6], [2.05, 0.9]]) { fbNote('taiko', 57, t + d, 1, v, -0.2); fbNote('taiko', 61, t + d + 0.01, 1, v * 0.8, 0.2); }
      fbNote('pauke', 50, t + 0.75, 1, 0.75, 0); fbNote('becken', 60, t + 0.75, 1, 0.5, 0.2); fbNote('becken', 60, t + 2.05, 1, 0.45, -0.2);
      [[74, 0.8], [81, 0.92], [86, 1.04]].forEach(([m, d]) => fbNote('harfe', m, t + d, 1, 0.16, 0.5));
    },
  };
  // Eigener Bus für den Schluss, damit er nicht mit dem Tracker ausgeblendet wird
  const fb = ac.createGain(); fb.gain.value = 0.85; fb.connect(A.dry); const fs = ac.createGain(); fs.gain.value = 0.4; fb.connect(fs); fs.connect(A.wet);
  const fbNote = (id, m, t, dur, vol, pan) => {
    const S = I[id], src = ac.createBufferSource(); src.buffer = S.buf; src.loop = S.loop; src.playbackRate.value = Math.pow(2, (m - S.base) / 12);
    const g = ac.createGain(), p = ac.createStereoPanner(); p.pan.value = pan;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + S.a); if (!S.one) g.gain.setTargetAtTime(0, t + dur, Math.max(0.3, S.r));
    src.connect(g); g.connect(p); p.connect(fb); src.start(t); src.stop(S.one ? t + S.buf.duration / src.playbackRate.value + 0.05 : t + dur + 2.5);
  };
  const tick = () => { while (!T.stopped && T.next < ac.currentTime + 0.7) { ivBar(T, T.n++, T.next); T.next += 4 * IV_BEAT; } };
  T.schluss = () => { T.stop(2.4); T.finale(); };
  if (bars) { T.timer = setInterval(tick, 120); tick(); }
  return T;
}

// Ein Takt: Flächen, Galopp in Bass und Streichern, Blechstöße, Melodie und viel Schlagwerk (Stereo hart verteilt wie
// die vier Kanäle des Amiga)
function ivBar(T, n, t) {
  const si = n < 32 ? Math.floor(n / 8) : 1 + (Math.floor((n - 32) / 8) % 3), sec = IV_SONG[si], b = n % 8;
  const name = sec.ch[b], ch = IV_CH[name], root = IV_ROOT[name], B = IV_BEAT, S16 = B / 4;
  const at = (k) => t + k * S16;
  const hit = (id, k, v, m = 60, pan = 0) => T.note(id, m, at(k), 0.1, v, pan);
  for (const m of ch.slice(1)) T.note('str', m, t, 4 * B * 0.97, 0.055, m % 2 ? -0.3 : 0.3);
  if (sec.choir != null && b >= sec.choir) for (const m of ch.slice(1)) T.note('chor', m, t + 0.03, 4 * B * 0.95, 0.09, m % 2 ? 0.25 : -0.25);
  if (sec.stac != null && b >= sec.stac) { const o = [ch[1], ch[1] + 12, ch[2], ch[1] + 12]; for (let k = 0; k < 16; k++) T.note('stac', o[k % 4], at(k), S16 * 0.8, k % 4 === 0 ? 0.085 : 0.055, 0.45); }
  if (sec.harp) {
    const arp = [ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[1] + 24, ch[2] + 24], pat = [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1], step = 16 / sec.harp;
    for (let k = 0; k < 16; k += step) T.note('harfe', arp[pat[k]], at(k), S16, sec.mel ? 0.06 : 0.08, 0.55);
  }
  if (sec.bass) for (let q = 0; q < 4; q++) {
    const m = root + 12 + (q === 3 && b % 2 ? 7 : 0);
    T.note('bass', m, at(q * 4), S16 * 1.8, 0.26, -0.1); T.note('bass', m, at(q * 4 + 2), S16 * 0.85, 0.2, -0.1); T.note('bass', m, at(q * 4 + 3), S16 * 0.85, 0.22, -0.1);
  }
  if (sec.blech) for (const m of [ch[0] + 12, ...ch.slice(1)]) { T.note('blech', m, t, B * 0.9, 0.05, -0.2); if (sec.drums !== 'marsch') T.note('blech', m, at(6), B * 0.45, 0.04, -0.2); }
  if (sec.mel) { let tt = t; for (const [m, beats] of sec.mel[b]) { T.note('lead', m, tt, beats * B * 0.93, 0.13, -0.55); if (sec.oct) T.note('blech', m - 12, tt, beats * B * 0.9, 0.035, -0.35); tt += beats * B; } }
  const pk = root < 40 ? root + 12 : root, d = sec.drums;
  const crash = (k = 0) => hit('becken', k, 0.34, 60, 0.35);
  const fill = (from) => { for (let k = from; k < 16; k++) hit('tom', k, 0.3 + (k - from) * 0.045, 69 - (k - from) * 2, k % 2 ? -0.4 : 0.4); };
  if (d === 'aufmarsch') {
    const dense = b >= 6;
    (dense ? [1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] : [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0]).forEach((on, k) => { if (on) hit('taiko', k, (k % 4 === 0 ? 0.62 : 0.4) * (dense ? 0.75 + k / 40 : 1), k % 4 === 0 ? 58 : 62, k % 2 ? 0.25 : -0.25); });
    if (b === 0 || b === 4) { hit('pauke', 0, 0.6, pk, 0.1); crash(); }
    if (b >= 4 && b < 7) for (const k of [4, 12]) hit('snare', k, 0.24, 60, 0.15);
    if (b === 7) fill(8);
  } else if (d === 'kampf') {
    for (const k of [0, 6, 8, 14]) hit('kick', k, 0.6);
    for (const k of [4, 12]) hit('snare', k, 0.42, 60, 0.15);
    for (const k of [7, 15]) hit('snare', k, 0.1, 60, 0.15);
    for (let k = 0; k < 16; k++) hit('hat', k, k % 2 ? 0.06 : 0.11, 60, 0.45);
    for (const k of [0, 10]) hit('taiko', k, 0.5, 58, -0.3);
    if (b % 4 === 0) crash();
    if (b % 4 === 3) fill(12);
  } else if (d === 'marsch') {
    [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1].forEach((on, k) => { if (on) hit('snare', k, k % 4 === 0 ? 0.4 : 0.2, 60, 0.15); });
    for (const k of [0, 4, 8, 12]) hit('taiko', k, k === 0 ? 0.65 : 0.45, k % 8 ? 62 : 58, k % 8 ? 0.3 : -0.3);
    for (const k of [0, 8]) hit('kick', k, 0.55);
    hit('pauke', 0, 0.5, pk, 0.1);
    if (b === 0 || b === 4) crash();
    if (b === 7) fill(8);
  } else if (d === 'sturm') {
    const dbl = b >= 6;
    for (let k = 0; k < 16; k += dbl ? 1 : 2) hit('kick', k, dbl ? 0.45 : 0.55);
    for (const k of [4, 12]) { hit('snare', k, 0.45, 60, 0.15); hit('snare', k - 1, 0.1, 60, 0.15); }
    for (const k of [0, 3, 6, 8, 11, 14]) hit('taiko', k, k % 8 === 0 ? 0.62 : 0.42, k % 8 === 0 ? 58 : 63, k % 2 ? 0.3 : -0.3);
    for (let k = 0; k < 16; k++) hit('hat', k, k % 2 ? 0.07 : 0.12, 60, 0.45);
    if (b % 2 === 0) crash();
    if (b % 4 === 3) fill(b === 7 ? 8 : 12);
  }
}
