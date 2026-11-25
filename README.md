# Ritter ohne Land

Ein isometrisches Burgen-, Handels- und Politikspiel im Browser. Es spielt im England des Jahres 1194: König Richard ist in Gefangenschaft, normannische Barone und sächsische Thane belauern einander, in den Wäldern leben die Geächteten. Du kehrst als enterbter Ritter vom Kreuzzug zurück und machst aus einer Burgruine eine Festung.

Das Spiel ist ein geistiger Nachfolger der isometrischen Abenteuerspiele der frühen 90er. Es ist ein eigenständiges Spiel mit eigener Welt, eigenen Figuren und eigenen Regeln.

## Spielen

**Ohne Installation:** `dist/ritter-ohne-land.html` herunterladen und im Browser öffnen.

**Zum Entwickeln** (Module direkt aus `src/`, ES-Module brauchen einen lokalen Server):

```bash
python3 -m http.server 8080
```

Danach `http://localhost:8080` öffnen.

**Einzeldatei neu bauen** (nach Änderungen in `src/`):

```bash
node tools/build.mjs
```

## Was schon drin ist

- **Große, zufällig erzeugte Welt:** 160 × 160 Felder mit Fluss, Seen, Wäldern und Hügeln. Dazu 15 Orte (Städte, Dörfer, Burgen, Abteien, ein verstecktes Lager), die durch Straßen und Brücken verbunden sind.
- **Lebendige Welt:** Tag und Nacht, vier Jahreszeiten mit Schnee im Winter, Dorfbewohner, Händlerzüge, Steuereintreiber, Patrouillen, Wegelagerer und Raubritter.
- **Reiten:** Pferde machen schneller und im Kampf stärker. Das Gefolge sitzt mit auf, wenn es Pferde hat.
- **Die Burg Ashcombe:** Ausbau von der Ruine über Holzburg und Steinburg zur Festung. Neun Gebäude mit je drei Stufen (Rittersaal, Unterkunft, Schmiede, Stallungen, Holzfäller, Steinbruch, Markt, Kapelle, Wachtürme). Jedes Gebäude ist auf der Karte zu sehen, während des Baus mit Gerüst.
- **Gefolge:** Leute im Rittersaal anwerben, ausrüsten (Waffe, Rüstung, Schild, Pferd) und in Scharmützel führen. Dazu Befehle (folgen, Stellung halten, angreifen), Erfahrung und Stufen, Sold, Garnison und Verwundete.
- **Handel:** Jeder Ort erzeugt und braucht andere Waren. Die Preise richten sich nach dem Vorrat. Holz, Stein und Eisen braucht man auch für den Burgbau.
- **Politik:** Fünf Fraktionen (Sachsen, Normannen, Kirche, Gilde, Waldleute) mit Rivalitäten. Aufträge, Geschenke und Überfälle verschieben das Ansehen. Verbündete gewähren Vorteile, Feinde überfallen deine Burg.
- **Speichern:** Automatisch jeden Morgen im Browser, dazu manuell über das Menü.

## Steuerung

| Taste | Aktion |
| --- | --- |
| Klick | Gehen, Gegner angreifen, Ort ansteuern |
| W A S D | Direkt laufen |
| E | Ort betreten, Burg verwalten |
| R | Auf- und absitzen |
| Leertaste | Nächsten Feind angreifen |
| F oder 1 2 3 | Gefolge: folgen, halten, angreifen |
| T | Zeitraffer |
| I J P M | Gefolge, Aufträge, Politik, Karte |
| Mausrad | Zoom |
| Esc | Schließen und Menü |

## Aufbau des Codes

| Datei | Inhalt |
| --- | --- |
| `src/data.js` | Alle Spieldaten und Balancing-Werte: Fraktionen, Waren, Gegenstände, Klassen, Gruppen, Gebäude, Orte |
| `src/world.js` | Weltgenerator aus dem Seed, A*-Wegfindung |
| `src/units.js` | Einheiten, Werte, Kampf, Gefolge, KI-Gruppen, Dorfbewohner |
| `src/economy.js` | Märkte, Preise, Ladung, Ausrüstungshandel |
| `src/politics.js` | Ansehen, Ruhm, Aufträge |
| `src/castle.js` | Burgausbau, Produktion, Anwerben, Überfälle |
| `src/sim.js` | Uhrzeit, Jahreszeiten, Tageswechsel |
| `src/render.js` | Isometrischer Canvas-Renderer, Minikarte |
| `src/ui.js` | Kopfleiste und alle Tafeln |
| `src/save.js` | Speichern und Laden |
| `src/main.js` | Start, Hauptschleife, Eingabe |
| `tools/build.mjs` | Bündelt alles in eine HTML-Datei |

Keine Abhängigkeiten und kein Framework, nur Canvas 2D und modernes JavaScript. Grafik und Figuren werden im Code gezeichnet.

Wie es weitergehen kann, steht in [DESIGN.md](DESIGN.md).
