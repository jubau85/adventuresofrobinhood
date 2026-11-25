# A Knight's Tale

Ein isometrisches Burgen-, Handels- und Politikspiel im Browser. Es spielt in England und Frankreich im Jahr 1194: König Richard ist eben aus der Gefangenschaft zurück, Prinz Johns Barone halten noch die Burgen, König Philipp greift nach der Normandie. Sächsische Thane murren, in den Wäldern leben die Geächteten. Du kehrst als enterbter Ritter vom Kreuzzug zurück und machst aus einer Burgruine eine Festung.

Das Spiel ist ein geistiger Nachfolger der isometrischen Abenteuerspiele der frühen 90er. Es ist ein eigenständiges Spiel mit eigener Welt, eigenen Figuren und eigenen Regeln.

## Spielen

**Ohne Installation:** `dist/a-knights-tale.html` herunterladen und im Browser öffnen.

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

- **Startmenü:** Animiertes Titelbild bei Sonnenuntergang. Du wählst deinen Namen, den Namen deiner Burg, Ritter oder Ritterin und eine von sechs Wappenfarben, mit Vorschau. Farbe und Name erscheinen im ganzen Spiel: Gefolge, Banner, Meldungen, Karte.
- **Musik:** Wird live im Browser erzeugt, mit Laute, Flöte, Hörnern, Bordun und Trommeln. Es gibt ein episches Titelthema, Reisemusik im Dreiertakt, ruhigere Nachtmusik und Trommeln im Kampf. Taste L schaltet sie an und aus.

- **Karte von England und Frankreich:** 512 × 512 Felder, ein Feld sind etwa 1,6 km. Die Küsten von England, Wales, Nordfrankreich, Flandern und der Ostrand Irlands, dazu Wight, Man und die Kanalinseln. Echte Flüsse (Themse, Severn, Trent, Ouse, Seine, Marne, Oise, Somme, Schelde und andere), Bergland an den richtigen Stellen (Pennines, Lake District, Snowdonia, Dartmoor, Ardennen) und die alten Wälder (Sherwood, Barnsdale, New Forest, Weald, Fontainebleau).
- **41 Orte an ihren historischen Stellen:** London, York, Nottingham, Lincoln, Canterbury, Dover, Winchester, Rouen, Caen, Paris, Chartres, Brügge, Troyes und viele mehr, dazu die Schauplätze aus *Ivanhoe* in Yorkshire. Straßen und Brücken verbinden die Orte auf jeder Landmasse. Die Details (Verlauf der Küste, Wälder, Straßen) unterscheiden sich mit jedem neuen Spiel ein wenig.
- **Schiffe übers Meer:** Fähren von Dover nach Calais, von Portsmouth nach Barfleur und ein Wollschiff von London nach Brügge. Die Überfahrt kostet Fährlohn je Kopf und Pferd und dauert einige Stunden. Wer auf der Karte ein Ziel jenseits des Meeres anklickt, reitet automatisch zum passenden Hafen.
- **Kompass und eingenordete Karte:** In der Schrägansicht liegt Norden rechts oben, der Kompass in der Ecke zeigt es an. Die Minikarte zeigt die Umgebung, die große Karte (M) England und Frankreich mit Fährlinien und Landschaftsnamen. Sie lässt sich mit Mausrad oder + und − zoomen und durch Ziehen verschieben.
- **Iso-Grafik mit Relief:** Hügel und Flusstäler mit Licht und Schatten. Die Karte ist ein Diorama mit Erdschichten am Rand. Gebäude haben Fachwerk, Schindeln, Fensterläden, Blumenkästen und Schlagschatten. Dazu kommen Fässer, Heu und Karren.
- **Drei Grafikstufen (Taste G oder Menü):**
  - **Klar** (Standard)
  - **Pixel:** halbe Auflösung, grobe Pixel
  - **Retro:** Amiga-Stil mit eigener 32-Farben-Palette und feinem Dithering
- **Tiere:** Schafe, Kühe und Hühner bei den Höfen, Hirsche im Wald, die vor dir fliehen, Enten auf Flüssen und Seen und Vogelschwärme.
- **Lebendige Welt:** Tag und Nacht, vier Jahreszeiten mit Schnee im Winter, Dorfbewohner, Händlerzüge, Steuereintreiber, Patrouillen, Wegelagerer und Raubritter.
- **Reiten:** Pferde machen schneller und im Kampf stärker. Das Gefolge sitzt mit auf, wenn es Pferde hat.
- **Die Burg Ashcombe:** Ausbau von der Ruine über Holzburg und Steinburg zur Festung. Neun Gebäude mit je drei Stufen (Rittersaal, Unterkunft, Schmiede, Stallungen, Holzfäller, Steinbruch, Markt, Kapelle, Wachtürme). Jeder Ausbau ist auf der Karte zu sehen:
  - abgesteckte Bauplätze mit Schildern
  - Baustellen mit wachsendem Rohbau, Gerüst und Bauleuten
  - jede Stufe sichtbar anders, mit Arbeitern: Schmied mit Funken, Holzfäller, Steinmetze mit Kran, Pferde auf der Koppel, Soldaten auf dem Übungsplatz, Wachen auf den Türmen
  - eine Burgsiedlung, die mit der Burgstufe wächst
  - goldene Funken, wenn etwas fertig wird
- **Mauern halten auf:** Palisaden und Steinmauern (Ashcombe ab der Holzburg, die Burgen der Barone, die Halle von Rotherwood) sind für alle Figuren undurchlässig. Man kommt nur durchs Tor hinein. Angreifer, Gefolge und Gruppen suchen sich den Weg dorthin.
- **Gefolge:** Leute im Rittersaal anwerben, ausrüsten (Waffe, Rüstung, Schild, Pferd) und in Scharmützel führen. Dazu Befehle (folgen, Stellung halten, angreifen), Erfahrung und Stufen, Sold, Garnison und Verwundete.
- **Jagd:** Mit Bogen oder Armbrust Hirsche und Enten jagen. Hirsche fliehen, Bogenschützen im Gefolge schießen mit. Fleisch und Felle lassen sich einlagern oder in Städten verkaufen. Wilderei kann den Normannen auffallen, fremdes Vieh zu schießen gilt als Diebstahl. Die Bestände wachsen täglich nach.
- **Handel:** Jeder Ort erzeugt und braucht andere Waren. Die Preise richten sich nach dem Vorrat. Holz, Stein und Eisen braucht man auch für den Burgbau.
- **Politik:** Sechs Fraktionen (Sachsen, Normannen, Kirche, Gilde, Waldleute und die Krone Frankreichs) mit Rivalitäten. Als Freund der Franzosen fährst du umsonst über den Kanal und kannst Armbrustschützen anwerben. Aufträge, Geschenke und Überfälle verschieben das Ansehen. Verbündete gewähren Vorteile, Feinde überfallen deine Burg.
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
| G | Grafik wechseln: klar, Pixel, Retro |
| L | Musik an und aus |
| Esc | Schließen und Menü |

## Aufbau des Codes

| Datei | Inhalt |
| --- | --- |
| `src/data.js` | Alle Spieldaten und Balancing-Werte: Fraktionen, Waren, Gegenstände, Klassen, Gruppen, Gebäude, Orte |
| `src/geo.js` | Küsten, Flüsse, Bergland und Wälder als Längen- und Breitengrade |
| `src/world.js` | Weltgenerator (Küsten rastern, Flüsse, Orte, Straßen je Landmasse, Häfen), A*-Wegfindung |
| `src/units.js` | Einheiten, Werte, Kampf, Gefolge, KI-Gruppen, Dorfbewohner, Fähren |
| `src/economy.js` | Märkte, Preise, Ladung, Ausrüstungshandel |
| `src/politics.js` | Ansehen, Ruhm, Aufträge |
| `src/castle.js` | Burgausbau, Produktion, Anwerben, Überfälle |
| `src/sim.js` | Uhrzeit, Jahreszeiten, Tageswechsel |
| `src/render.js` | Isometrischer Canvas-Renderer mit Höhenrelief, Schatten, Retro-Modus (Palette, Dithering), Minikarte |
| `src/animals.js` | Tiere und Jagd |
| `src/titleart.js` | Gemaltes, animiertes Titelbild |
| `src/audio.js` | Musik mit Web Audio (Instrumente, Noten, Stimmungen) |
| `src/ui.js` | Kopfleiste und alle Tafeln |
| `src/save.js` | Speichern und Laden |
| `src/main.js` | Start, Hauptschleife, Eingabe |
| `tools/build.mjs` | Bündelt alles in eine HTML-Datei |

Keine Abhängigkeiten und kein Framework, nur Canvas 2D und modernes JavaScript. Grafik und Figuren werden im Code gezeichnet.

Wie es weitergehen kann, steht in [DESIGN.md](DESIGN.md).
