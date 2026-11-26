// Handgemalte Grafiken aus assets/. Fehlt ein Bild oder lädt es nicht, zeichnet das Spiel weiter selbst.
// Der Build bettet die Dateien als data-URL ein, damit die Einzeldatei vollständig bleibt.

const ART_FILES = {
  titel_quer: 'assets/titel/titel_quer.jpg',
  titel_hoch: 'assets/titel/titel_hoch.jpg',
  wiese_sommer: 'assets/boden/wiese_sommer.jpg',
  laub_1_sommer: 'assets/natur/laub_1_sommer.png',
  fig_ritter: 'assets/figuren/ritter.png',
};

export const ART = {};
const artListeners = [];

export function onArt(fn) { artListeners.push(fn); }

export function loadArt() {
  for (const [id, url] of Object.entries(ART_FILES)) {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => { ART[id] = im; for (const f of artListeners) f(id); };
    im.src = url;
  }
}
