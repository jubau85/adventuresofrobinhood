// Handgemalte Grafiken aus assets/. Fehlt ein Bild oder lädt es nicht, zeichnet das Spiel weiter selbst.
// Der Build bettet die Dateien als data-URL ein, damit die Einzeldatei vollständig bleibt.

const ART_FILES = {
  titel_quer: 'assets/titel/titel_quer.jpg',
  titel_hoch: 'assets/titel/titel_hoch.jpg',
  wiese_sommer: 'assets/boden/wiese_sommer.jpg',
  // Böden für Herbst und Winter (je Bild 4 × 4 Felder)
  wiese_herbst: 'assets/boden/wiese_herbst.jpg',
  wiese_winter: 'assets/boden/wiese_winter.jpg',
  heide_herbst: 'assets/boden/heide_herbst.jpg',
  heide_winter: 'assets/boden/heide_winter.jpg',
  waldboden_herbst: 'assets/boden/waldboden_herbst.jpg',
  waldboden_winter: 'assets/boden/waldboden_winter.jpg',
  acker_winter: 'assets/boden/acker_winter.jpg',
  weg_winter: 'assets/boden/weg_winter.jpg',
  wasser_winter: 'assets/boden/wasser_winter.jpg',
  schnee: 'assets/boden/schnee.jpg',
  // Bäume: 1 Eiche, 2 Buche, 3 Birke, 4 Apfelbaum; Nadelbäume 1 Kiefer, 2 Fichte, 3 junge Tanne
  laub_1_sommer: 'assets/natur/laub_1_sommer.webp',
  laub_1_herbst: 'assets/natur/laub_1_herbst.webp',
  laub_1_winter: 'assets/natur/laub_1_winter.webp',
  laub_2_herbst: 'assets/natur/laub_2_herbst.webp',
  laub_2_winter: 'assets/natur/laub_2_winter.webp',
  laub_3_herbst: 'assets/natur/laub_3_herbst.webp',
  laub_3_winter: 'assets/natur/laub_3_winter.webp',
  laub_4_herbst: 'assets/natur/laub_4_herbst.webp',
  laub_4_winter: 'assets/natur/laub_4_winter.webp',
  nadel_1: 'assets/natur/nadel_1.webp',
  nadel_1_winter: 'assets/natur/nadel_1_winter.webp',
  nadel_2: 'assets/natur/nadel_2.webp',
  nadel_2_winter: 'assets/natur/nadel_2_winter.webp',
  nadel_3: 'assets/natur/nadel_3.webp',
  nadel_3_winter: 'assets/natur/nadel_3_winter.webp',
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
