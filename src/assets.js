// Handgemalte Grafiken aus assets/. Fehlt ein Bild oder lädt es nicht, zeichnet das Spiel weiter selbst.
// Der Build bettet die Dateien als data-URL ein, damit die Einzeldatei vollständig bleibt.

const ART_FILES = {
  titel_quer: 'assets/titel/titel_quer.jpg',
  titel_hoch: 'assets/titel/titel_hoch.jpg',
  wiese_sommer: 'assets/boden/wiese_sommer.jpg',
  laub_1_sommer: 'assets/natur/laub_1_sommer.png',
  fig_ritter: 'assets/figuren/ritter.png',
  fig3d_bauer_gehen: 'assets/figuren3d/bauer_gehen.webp',
  fig3d_bauer_gehen_maske: 'assets/figuren3d/bauer_gehen_maske.webp',
  fig3d_bauer_stehen: 'assets/figuren3d/bauer_stehen.webp',
  fig3d_bauer_stehen_maske: 'assets/figuren3d/bauer_stehen_maske.webp',
  fig3d_bauer_aufheben: 'assets/figuren3d/bauer_aufheben.webp',
  fig3d_bauer_aufheben_maske: 'assets/figuren3d/bauer_aufheben_maske.webp',
  // Pferde (tools/pferd.py): Reitpferd mit einfärbbarem Fell, Schlachtross mit einfärbbarer Schabracke
  pferd3d_pferd_stehen: 'assets/pferde/pferd_stehen.webp',
  pferd3d_pferd_stehen_maske: 'assets/pferde/pferd_stehen_maske.webp',
  pferd3d_pferd_schritt: 'assets/pferde/pferd_schritt.webp',
  pferd3d_pferd_schritt_maske: 'assets/pferde/pferd_schritt_maske.webp',
  pferd3d_pferd_galopp: 'assets/pferde/pferd_galopp.webp',
  pferd3d_pferd_galopp_maske: 'assets/pferde/pferd_galopp_maske.webp',
  pferd3d_pferd_grasen: 'assets/pferde/pferd_grasen.webp',
  pferd3d_pferd_grasen_maske: 'assets/pferde/pferd_grasen_maske.webp',
  pferd3d_ross_stehen: 'assets/pferde/ross_stehen.webp',
  pferd3d_ross_stehen_maske: 'assets/pferde/ross_stehen_maske.webp',
  pferd3d_ross_schritt: 'assets/pferde/ross_schritt.webp',
  pferd3d_ross_schritt_maske: 'assets/pferde/ross_schritt_maske.webp',
  pferd3d_ross_galopp: 'assets/pferde/ross_galopp.webp',
  pferd3d_ross_galopp_maske: 'assets/pferde/ross_galopp_maske.webp',
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
