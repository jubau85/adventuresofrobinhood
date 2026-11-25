// Isometrische Projektion. Welt: Kachelkoordinaten (x, y). Bild: Pixel.

import { TW, TH } from './data.js';

export const HW = TW / 2;
export const HH = TH / 2;

export function isoX(x, y) { return (x - y) * HW; }
export function isoY(x, y) { return (x + y) * HH; }

// Bildschirmpunkt (CSS-Pixel) -> Weltkoordinate
export function screenToWorld(px, py, cam, vw, vh) {
  const ix = (px - vw / 2) / cam.zoom + cam.x;
  const iy = (py - vh / 2) / cam.zoom + cam.y;
  return { x: (ix / HW + iy / HH) / 2, y: (iy / HH - ix / HW) / 2 };
}

// Weltkoordinate -> Bildschirmpunkt (CSS-Pixel)
export function worldToScreen(x, y, cam, vw, vh) {
  return {
    x: (isoX(x, y) - cam.x) * cam.zoom + vw / 2,
    y: (isoY(x, y) - cam.y) * cam.zoom + vh / 2,
  };
}
