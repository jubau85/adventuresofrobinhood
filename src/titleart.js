// Titelbild, im Code gemalt: Sonnenuntergang über den Hügeln, eine Burg auf dem Hügel
// und ein Ritter zu Pferd im Gegenlicht. Banner und Wimpel tragen die gewählte Wappenfarbe.

import { ART } from './assets.js';

function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(hex, a, k = 1) { const [r, g, b] = hexRgb(hex); return `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},${a})`; }

// Hügelkette als Funktion der x-Position
function ridge(x, w, base, amp, seed, freq) {
  const u = x / w;
  return base - amp * (0.5 * Math.sin(u * 6.1 * freq + seed) + 0.3 * Math.sin(u * 13.7 * freq + seed * 2.1) + 0.2 * Math.sin(u * 29.3 * freq + seed * 3.7));
}

function fillRidge(c, w, h, base, amp, seed, freq, col) {
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x <= w; x += 6) c.lineTo(x, ridge(x, w, base, amp, seed, freq));
  c.lineTo(w, h);
  c.closePath();
  c.fillStyle = col;
  c.fill();
}

function drawCastle(c, x, y, s, color, t) {
  const dark = '#2a1a2a';
  c.fillStyle = dark;
  const rect = (rx, ry, rw, rh) => c.fillRect(x + rx * s, y - (ry + rh) * s, rw * s, rh * s);
  const crenel = (rx, ry, rw) => { for (let k = 0; k < rw; k += 8) rect(rx + k, ry, 5, 5); };
  // Mauer und Türme
  rect(-120, 0, 240, 46); crenel(-120, 46, 240);
  rect(-140, 0, 34, 84); crenel(-140, 84, 34);
  rect(106, 0, 34, 84); crenel(106, 84, 34);
  rect(-30, 0, 26, 64); crenel(-30, 64, 26);
  // Bergfried
  rect(-70, 0, 64, 132); crenel(-70, 132, 64);
  rect(-58, 132, 18, 30); // Ecktürmchen
  c.beginPath(); c.moveTo(x - 60 * s, y - 162 * s); c.lineTo(x - 49 * s, y - 182 * s); c.lineTo(x - 38 * s, y - 162 * s); c.fill();
  // Tor
  c.fillStyle = '#120a12';
  c.beginPath(); c.moveTo(x + 40 * s, y); c.lineTo(x + 40 * s, y - 22 * s); c.quadraticCurveTo(x + 52 * s, y - 34 * s, x + 64 * s, y - 22 * s); c.lineTo(x + 64 * s, y); c.fill();
  // Fenster mit Licht
  const flick = 0.85 + Math.sin(t * 7) * 0.08 + Math.sin(t * 13.3) * 0.05;
  c.fillStyle = `rgba(255,200,110,${flick})`;
  for (const [wx, wy] of [[-56, 96], [-30, 96], [-56, 60], [-30, 60], [-130, 58], [116, 58], [-20, 40]]) c.fillRect(x + wx * s, y - wy * s, 5 * s, 9 * s);
  const glow = c.createRadialGradient(x - 40 * s, y - 80 * s, 0, x - 40 * s, y - 80 * s, 90 * s);
  glow.addColorStop(0, 'rgba(255,180,90,0.18)'); glow.addColorStop(1, 'rgba(255,180,90,0)');
  c.fillStyle = glow; c.fillRect(x - 140 * s, y - 180 * s, 200 * s, 200 * s);
  // Banner
  const flag = (fx, fy, len) => {
    c.strokeStyle = dark; c.lineWidth = 2 * s;
    c.beginPath(); c.moveTo(x + fx * s, y - fy * s); c.lineTo(x + fx * s, y - (fy + 34) * s); c.stroke();
    const top = y - (fy + 34) * s;
    c.beginPath();
    c.moveTo(x + fx * s, top);
    for (let k = 0; k <= 10; k++) {
      const u = k / 10;
      c.lineTo(x + (fx + u * len) * s, top + Math.sin(t * 3 + u * 5 + fx) * 3 * u * s);
    }
    for (let k = 10; k >= 0; k--) {
      const u = k / 10;
      c.lineTo(x + (fx + u * len) * s, top + (14 - u * 4) * s + Math.sin(t * 3 + u * 5 + fx) * 3 * u * s);
    }
    c.closePath();
    c.fillStyle = rgba(color, 1, 0.85); c.fill();
    c.strokeStyle = 'rgba(255,170,90,0.6)'; c.lineWidth = 1; c.stroke();
  };
  flag(-49, 182, 40); flag(-123, 89, 30); flag(123, 89, 30);
}

function drawKnight(c, x, y, s, color, t) {
  const sil = '#0e080d';
  const rim = 'rgba(255,170,90,0.85)';
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  const breath = Math.sin(t * 1.6) * 0.6;
  // Umhang (hinter dem Reiter, weht im Wind)
  c.beginPath();
  c.moveTo(-6, -118);
  for (let k = 0; k <= 8; k++) { const u = k / 8; c.lineTo(-6 - u * 70, -118 + u * 40 + Math.sin(t * 2.4 + u * 4) * 8 * u); }
  for (let k = 8; k >= 0; k--) { const u = k / 8; c.lineTo(-14 - u * 62, -88 + u * 30 + Math.sin(t * 2.4 + u * 4 + 0.6) * 8 * u); }
  c.closePath();
  c.fillStyle = rgba(color, 1, 0.55); c.fill();
  c.strokeStyle = rim; c.lineWidth = 1.2; c.stroke();
  // Pferd
  c.fillStyle = sil;
  c.beginPath();
  c.moveTo(-58, -64); // Kruppe
  c.quadraticCurveTo(-60, -96, -20, -92); // Rücken
  c.quadraticCurveTo(10, -90, 30, -100); // Widerrist
  c.quadraticCurveTo(48, -132, 62, -140); // Hals
  c.lineTo(70, -142); c.lineTo(86, -122); c.lineTo(82, -114); // Kopf
  c.lineTo(66, -122); c.quadraticCurveTo(54, -100, 44, -76); // Kehle, Brust
  c.quadraticCurveTo(10, -60, -40, -62);
  c.closePath(); c.fill();
  c.strokeStyle = rim; c.lineWidth = 1.4; c.stroke();
  // Ohren und Mähne
  c.beginPath(); c.moveTo(64, -140); c.lineTo(66, -152); c.lineTo(70, -142); c.fill();
  // Beine
  c.lineCap = 'round'; c.strokeStyle = sil; c.lineWidth = 7;
  const leg = (x1, y1, x2, y2, x3, y3) => { c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(x2, y2, x3, y3); c.stroke(); };
  leg(-46, -66, -50, -36, -54, 0);
  leg(-30, -64, -26, -34, -30, 0);
  leg(30, -70, 44, -50, 52, -40 + breath); // erhobenes Vorderbein
  leg(36, -70, 34, -36, 36, 0);
  // Schweif
  c.lineWidth = 5;
  c.beginPath(); c.moveTo(-58, -78); c.quadraticCurveTo(-82, -70 + Math.sin(t * 2) * 4, -76, -30); c.stroke();
  // Reiter
  c.fillStyle = sil;
  c.beginPath();
  c.moveTo(-14, -94); c.lineTo(12, -94); c.lineTo(8, -136); c.lineTo(-8, -138); c.closePath(); c.fill();
  // Topfhelm
  c.fillRect(-9, -158, 17, 20);
  c.beginPath(); c.moveTo(-9, -158); c.lineTo(-1, -164); c.lineTo(8, -158); c.fill();
  c.strokeStyle = rim; c.lineWidth = 1;
  c.strokeRect(-9, -158, 17, 20);
  c.fillStyle = 'rgba(255,170,90,0.9)'; c.fillRect(-6, -150, 14, 1.6);
  // Schild in Wappenfarbe
  c.beginPath(); c.moveTo(-2, -132); c.lineTo(22, -132); c.lineTo(22, -112); c.lineTo(10, -96); c.lineTo(-2, -112); c.closePath();
  c.fillStyle = rgba(color, 1, 0.7); c.fill(); c.strokeStyle = rim; c.lineWidth = 1.2; c.stroke();
  c.fillStyle = 'rgba(214,173,76,0.85)'; c.fillRect(9, -130, 2.4, 30); c.fillRect(1, -121, 18, 2.4);
  // Lanze mit Wimpel
  c.strokeStyle = sil; c.lineWidth = 3.2;
  c.beginPath(); c.moveTo(-26, -60); c.lineTo(30, -250); c.stroke();
  c.strokeStyle = rim; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-25, -62); c.lineTo(31, -252); c.stroke();
  c.beginPath();
  const px = 26, py = -236;
  c.moveTo(px, py);
  for (let k = 0; k <= 8; k++) { const u = k / 8; c.lineTo(px + u * 58, py + 4 + Math.sin(t * 4 + u * 6) * 4 * u + u * 6); }
  c.lineTo(px - 3, py + 14);
  c.closePath();
  c.fillStyle = rgba(color, 1, 0.95); c.fill(); c.strokeStyle = rim; c.lineWidth = 1; c.stroke();
  c.restore();
}

const titleMotes = [];
const titleBirds = [];

// Gemaltes Titelbild mit langsamem Kameraschwenk, links abgedunkelt für den Titel
function drawPainting(c, w, h, t) {
  const im = h > w * 1.1 && ART.titel_hoch ? ART.titel_hoch : ART.titel_quer || ART.titel_hoch;
  if (!im) return false;
  const zoom = 1.04 + Math.sin(t * 0.05) * 0.025;
  const sc = Math.max(w / im.width, h / im.height) * zoom;
  const dw = im.width * sc, dh = im.height * sc;
  const px = (w - dw) * (0.5 + Math.sin(t * 0.037) * 0.25), py = (h - dh) * 0.5;
  c.drawImage(im, px, py, dw, dh);
  const shadeL = c.createLinearGradient(0, 0, w * 0.62, 0);
  shadeL.addColorStop(0, 'rgba(14,10,24,0.62)'); shadeL.addColorStop(1, 'rgba(14,10,24,0)');
  c.fillStyle = shadeL; c.fillRect(0, 0, w, h);
  const shadeB = c.createLinearGradient(0, h * 0.55, 0, h);
  shadeB.addColorStop(0, 'rgba(10,8,14,0)'); shadeB.addColorStop(1, 'rgba(10,8,14,0.45)');
  c.fillStyle = shadeB; c.fillRect(0, 0, w, h);
  // Schwebende Funken im Abendlicht
  c.fillStyle = 'rgba(255,214,140,0.55)';
  for (let k = 0; k < 26; k++) {
    const x = ((k * 173.7 + t * (8 + (k % 5) * 3)) % (w + 40)) - 20;
    const y = h * (0.35 + ((k * 0.137) % 0.6)) + Math.sin(t * 0.7 + k) * 12;
    c.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.3 + k * 2));
    c.fillRect(x, y, 2, 2);
  }
  c.globalAlpha = 1;
  return true;
}

export function drawTitleArt(c, w, h, t, color) {
  if (drawPainting(c, w, h, t)) return;
  // Himmel
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#141a36'); sky.addColorStop(0.3, '#3a2a58'); sky.addColorStop(0.52, '#a9505a');
  sky.addColorStop(0.64, '#e8894a'); sky.addColorStop(0.72, '#ffc874');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  // Sterne oben
  c.fillStyle = 'rgba(255,255,255,0.7)';
  for (let k = 0; k < 40; k++) { const sx = (k * 197.3) % w, sy = (k * 61.7) % (h * 0.28); const tw = 0.5 + 0.5 * Math.sin(t * 2 + k); c.globalAlpha = 0.25 + 0.5 * tw * (1 - sy / (h * 0.28)); c.fillRect(sx, sy, 1.5, 1.5); }
  c.globalAlpha = 1;
  // Sonne mit Strahlen
  const sx = w * 0.3, sy = h * 0.64, sr = Math.max(40, h * 0.085);
  const glow = c.createRadialGradient(sx, sy, sr * 0.3, sx, sy, sr * 6);
  glow.addColorStop(0, 'rgba(255,230,160,0.9)'); glow.addColorStop(0.15, 'rgba(255,190,110,0.45)'); glow.addColorStop(1, 'rgba(255,150,80,0)');
  c.fillStyle = glow; c.fillRect(0, 0, w, h);
  c.save();
  c.translate(sx, sy); c.rotate(t * 0.02);
  c.fillStyle = 'rgba(255,220,150,0.06)';
  for (let k = 0; k < 12; k++) { c.rotate(Math.PI / 6); c.beginPath(); c.moveTo(0, 0); c.lineTo(w * 1.2, -40); c.lineTo(w * 1.2, 40); c.closePath(); c.fill(); }
  c.restore();
  c.fillStyle = '#fff0c8'; c.beginPath(); c.arc(sx, sy, sr, 0, Math.PI * 2); c.fill();
  // Wolkenbänder
  for (let k = 0; k < 6; k++) {
    const cy = h * (0.18 + k * 0.07), cxs = ((t * (6 + k * 2) + k * 300) % (w + 600)) - 300;
    for (let j = 0; j < 4; j++) {
      const ex = cxs + j * 140, ew = 180 + ((k * 37 + j * 53) % 120), eh = 10 + ((k + j) % 3) * 5;
      const g = c.createLinearGradient(0, cy - eh, 0, cy + eh);
      g.addColorStop(0, 'rgba(70,40,80,0.55)'); g.addColorStop(1, k > 2 ? 'rgba(255,160,100,0.55)' : 'rgba(200,110,120,0.4)');
      c.fillStyle = g; c.beginPath(); c.ellipse(ex, cy, ew, eh, 0, 0, Math.PI * 2); c.fill();
    }
  }
  // Ferne Hügel und Dunst
  fillRidge(c, w, h, h * 0.7, h * 0.05, 1.3, 1.6, '#8a4e66');
  c.fillStyle = 'rgba(255,190,140,0.12)'; c.fillRect(0, h * 0.62, w, h * 0.12);
  fillRidge(c, w, h, h * 0.76, h * 0.06, 4.1, 1.1, '#5e3550');
  // Burghügel
  const cxB = w * 0.7;
  c.beginPath(); c.moveTo(cxB - w * 0.28, h); c.quadraticCurveTo(cxB - w * 0.12, h * 0.66, cxB, h * 0.645); c.quadraticCurveTo(cxB + w * 0.14, h * 0.66, cxB + w * 0.32, h); c.closePath();
  c.fillStyle = '#3d2438'; c.fill();
  drawCastle(c, cxB, h * 0.652, Math.max(0.55, h / 1100), color, t);
  // Nebel
  for (let k = 0; k < 3; k++) {
    const my = h * (0.78 + k * 0.05), mx = ((t * (10 + k * 5)) % (w + 400)) - 200;
    const g = c.createRadialGradient(mx, my, 0, mx, my, w * 0.4);
    g.addColorStop(0, 'rgba(255,210,180,0.16)'); g.addColorStop(1, 'rgba(255,210,180,0)');
    c.fillStyle = g; c.fillRect(0, my - h * 0.1, w, h * 0.2);
  }
  fillRidge(c, w, h, h * 0.86, h * 0.04, 7.7, 0.9, '#28172a');
  // Vordergrund mit Ritter
  c.beginPath(); c.moveTo(0, h); c.lineTo(0, h * 0.8); c.quadraticCurveTo(w * 0.14, h * 0.74, w * 0.3, h * 0.79); c.quadraticCurveTo(w * 0.42, h * 0.84, w * 0.5, h); c.closePath();
  c.fillStyle = '#140b12'; c.fill();
  drawKnight(c, w * 0.17, h * 0.765, Math.max(0.5, h / 900), color, t);
  // Vögel
  if (titleBirds.length < 7 && Math.random() < 0.01) titleBirds.push({ x: -30, y: h * (0.2 + Math.random() * 0.25), v: 25 + Math.random() * 20, p: Math.random() * 6 });
  c.strokeStyle = 'rgba(20,10,20,0.8)'; c.lineWidth = 1.6;
  for (let i = titleBirds.length - 1; i >= 0; i--) {
    const b = titleBirds[i];
    b.x += b.v / 60; const f = Math.sin(t * 9 + b.p) * 3;
    c.beginPath(); c.moveTo(b.x - 6, b.y - f); c.quadraticCurveTo(b.x - 2, b.y - 1, b.x, b.y); c.quadraticCurveTo(b.x + 2, b.y - 1, b.x + 6, b.y - f); c.stroke();
    if (b.x > w + 40) titleBirds.splice(i, 1);
  }
  // Schwebende Funken
  if (titleMotes.length < 40) titleMotes.push({ x: Math.random() * w, y: h * (0.6 + Math.random() * 0.4), v: 6 + Math.random() * 10, life: 0, max: 4 + Math.random() * 4 });
  for (let i = titleMotes.length - 1; i >= 0; i--) {
    const m = titleMotes[i];
    m.life += 1 / 60; m.y -= m.v / 60; m.x += Math.sin(t + i) * 0.2;
    if (m.life > m.max) { titleMotes.splice(i, 1); continue; }
    c.fillStyle = `rgba(255,210,130,${0.6 * Math.sin((m.life / m.max) * Math.PI)})`;
    c.fillRect(m.x, m.y, 2, 2);
  }
  // Vignette
  const v = c.createRadialGradient(w / 2, h * 0.55, h * 0.3, w / 2, h * 0.55, Math.max(w, h) * 0.85);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(8,4,10,0.7)');
  c.fillStyle = v; c.fillRect(0, 0, w, h);
}
