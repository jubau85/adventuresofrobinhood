// Gemeinsamer Zustand. G.s ist der Spielstand (wird gespeichert), der Rest ist Laufzeit.

export const G = {
  world: null,        // statische Welt (aus dem Seed erzeugt)
  s: null,            // Spielstand
  units: [],          // alle Einheiten, die gerade in der Welt sind
  groups: [],         // KI-Gruppen auf der Karte
  peasants: [],       // Dorfbewohner (nur Atmosphäre)
  projectiles: [],
  fx: [],
  cam: { x: 0, y: 0, zoom: 1 },
  view: { w: 800, h: 600, dpr: 1 },
  input: { dx: 0, dy: 0 },
  ui: { panel: null, arg: null, tab: null, sel: null },
  paused: false,
  fast: false,
  started: false,
  pendingSite: null,  // Siedlung, die beim Ankommen geöffnet wird
  nearSite: null,
  hover: null,
  clickMarker: null,
  pathBudget: 0,
  castleDirty: true,
  nextId: 1,
  time: 0,            // Echtzeit seit Start (für Animationen)
  messages: [],
  onLog: null,
};

export function uid() { return G.nextId++; }

export function log(text, kind = 'info') {
  G.messages.push({ text, kind, t: performance.now() });
  if (G.messages.length > 60) G.messages.shift();
  if (G.onLog) G.onLog();
}
