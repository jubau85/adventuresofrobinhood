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
- **69 Orte an ihren historischen Stellen**, gleichmäßig über ganz England, Wales, die Normandie, Frankreich und Flandern verteilt: von Carlisle, Scarborough und Keswick im Norden über Warwick, Northampton, Stamford, Worcester und Gloucester in der Mitte, Lynn und Bury St Edmunds im Osten, Pembroke, Cardiff, Dorchester und Bodmin im Westen bis Colchester, Battle, Rennes, Ypern und Provins. Dazu die Schauplätze aus *Ivanhoe* rund um Yorkshire. Straßen und Brücken verbinden die Orte auf jeder Landmasse.
- **Wahrzeichen:** der Tower von London und St Paul's, die Kathedralen von Canterbury, York, Lincoln, Durham, Ely, Winchester, Hereford, Reims, Laon, Rouen und Chartres (frisch abgebrannt), Notre-Dame und der neue Louvre im Bau, Mont-Saint-Michel auf seinem Felsen, der Gravensteen in Gent, die Tuchhallen von Brügge, Ypern, Troyes und Provins, der Burghügel von York und Glastonbury Tor.
- **Erzgruben:** Eisen im Forest of Dean, im Weald und bei Ferrière, Blei im Peak, Silber bei Alston, Zinn im Dartmoor. Bergleute brechen Erz im Stollen und tragen es zum Haufen. An der Grube kaufst du Erz billig, oder du pachtest einen Anteil: Dann bringen Fuhrleute jeden Morgen Erz in dein Burglager. Blei, Zinn und Silber sind neue Waren, die Städte mit Kathedralen, Tuchhallen und Münzstätten gut bezahlen. Die Gruben liegen abseits in Hügeln und Wäldern, ohne Straße dorthin.
- **Mystische Orte:** Neun Einsiedeleien an heiligen Quellen, alten Steinkreisen, Hügelgräbern, Höhlen und einer uralten Eibe, etwa der Steinkreis von Avebury, Wielands Schmiede, Long Meg und ihre Töchter oder die Quelle von Barenton im Wald von Brocéliande. In der Dämmerung tanzen Glühwürmchen. Der Einsiedler gibt Rat, heilt und segnet dich und dein Gefolge. Sie liegen weit abseits der Wege, ein gutes Stück von jedem Ort entfernt, meist tief im Wald oder in den Hügeln.
- **Lagerfeuer:** Köhler, Jäger, Hirten, Reisende und Pilger rasten an Waldrändern. Nachts sitzen sie im Schein der Flammen.
- **Kleine Hügel:** Sanfte Kuppen beleben das Flachland.
- **Große Städte:** London füllt bei normalem Zoom mehrere Bildschirme: eine Stadtmauer mit Toren, Strahlen- und Ringgassen, rund 180 Häuser in Zeilen entlang der Gassen, mehrere Pfarrkirchen, Brunnen, Gasthäuser und Schmieden, der Markt in der Mitte und die Themse mit Kai und Brücke. Paris, York, Rouen und Brügge sind ähnlich angelegt, kleinere Orte entsprechend kleiner. Jede Stadt hat ihr eigenes Leben, mit Bewohnern je nach Größe.
- **Die Welt baut und verfällt:** Auf Bauplätzen am Ortsrand entstehen neue Häuser, mit Fundament, Fachwerk, Gerüst und Bauleuten, die Balken heranschleppen. Anderswo brennt ein Haus ab, ein Sturm deckt ein Dach ab, ein baufälliges Haus wird abgerissen und später neu errichtet. Bricht in deiner Nähe ein Feuer aus, holen die Leute Eimer am Brunnen und löschen.
- **Dein Einfluss:** Du kannst den Wiederaufbau eines Ortes stiften. Oder ihn überfallen: Die Besatzung stellt sich dir, die Leute fliehen in die Häuser, bei einem Sieg plünderst du Gold und Waren, und Häuser gehen in Flammen auf. Danach ist der Ort verlassen: Die Bewohner fliehen, kein Fenster leuchtet mehr, kein Rauch steigt auf, Markt und Gasthaus sind geschlossen, und es wird nichts gebaut oder repariert. Erst nach knapp zwei Wochen kehren die Leute nach und nach zurück, mit Sühne an die Hinterbliebenen früher. Wer Bewohner erschlägt, verlängert die Zeit. Nach einem Überfall ist das ganze Land vier Tage gewarnt, und ein verwüsteter Ort lässt sich nicht gleich wieder überfallen.
- **Alltag draußen:** Jäger pirschen am Waldrand und kommen mit Wild oder einem Hasen zurück, Fischer sitzen am Wasser, Bauern säen im Frühling und ernten im Herbst, Mägde und Kinder sammeln Reisig für den Winter.
- **Turniere:** Herolde kündigen Turniere an, das erste in Ashby. Vor dem Ort stehen Schranken, eine Tribüne mit Baldachin und die Zelte der Ritter, das Volk strömt herbei. Acht Ritter tjosten in drei Runden. Mit Pferd und Startgeld reitest du mit: Senke die Lanze im richtigen Moment, brich Lanzen und hebe Gegner aus dem Sattel. Der Sieger gewinnt Gold und viel Ruhm. Angekündigte Turniere stehen auf der Karte, am Vortag und am Turniertag zeigt ein Pfeil am Bildrand den Weg.
- **Bettler:** Vor den Stadttoren, an Burgtoren und Kirchentüren sitzen Bettler. Ein Klick gibt Almosen. Die Kirche sieht das gern, und manch Bettler weiß etwas Nützliches.
- **Galgen:** Vor Burgen, Städten und Marktflecken steht ein Galgen. Wer beim Wildern oder Stehlen erwischt wird, wird hinausgeführt, das Urteil verlesen, der Priester betet, das Volk schaut zu. Danach wird der Tote auf dem Friedhof begraben. Du kannst den Verurteilten auch losschneiden, dann greifen die Wachen an.
- **Wetter und fließende Jahreszeiten:** Wolken, Regen, Nebel und Schneefall je nach Jahreszeit. Der Winter beginnt kahl und grau, der Schnee bleibt erst in Flecken liegen und deckt dann alles zu. Im Frühling taut er im Regen nach und nach weg.
- **Feiner Zoom:** Mit dem Mausrad stufenlos von der Übersicht (0,45) bis ganz nah heran (4). Standard ist eine nahe Ansicht. Die Größenverhältnisse orientieren sich an den Abenteuerspielen der frühen 90er: Eine Kate ist drei- bis viermal so hoch wie eine Figur, Stadtmauern und Burgen überragen die Häuser.
- **Sehenswürdigkeiten:** Stonehenge und der Hadrianswall. Wer sie zum ersten Mal besucht, gewinnt Ruhm.
- **Einzelhöfe:** Über das Land verstreut liegen Gehöfte mit Äckern, Vieh und Bauern.
- **Schlachten:** Ab und zu ziehen zwei Heere zu je 50 Mann heran, etwa Prinz Johns Heer gegen die Getreuen König Richards oder König Philipps Heer gegen das normannische Aufgebot. Du kannst zusehen oder auf einer Seite eingreifen. Bei knapper Bildrate werden die Heere automatisch kleiner.
- **Belagerungen:** Ein Heer schlägt vor einer Burg oder Stadt der Gegenseite sein Lager auf. Die Tore schlagen zu, die Besatzung kommt aus Bergfried und Häusern und bezieht Stellung hinter der Mauer. Das Trebuchet hämmert auf das Mauerstück, das dem Lager am nächsten liegt: Erst bröckeln die Zinnen, dann zeigen sich Risse und Löcher, schließlich bricht eine Bresche auf. Durch sie stürmen die Angreifer, die Verteidiger bleiben drinnen und halten dagegen, ihre Schützen schießen über die Mauer. Einzelne Steine treffen auch Dächer und setzen Häuser in Brand. Danach liegt zwei Tage Schutt in der Bresche, dann wird sie unter Gerüsten vermauert.
- **Deine Burg in Gefahr:** Sind dir Normannen oder Sachsen feindlich gesinnt, zieht ihr Heer gegen deine Burg, ab Ansehen −60 (sehr feindlich) deutlich öfter. Ab der Holzburg schließen sich die Tore, die Garnison (Grundbesatzung nach Burgstufe, Gefolge in der Garnison, Wachtürme) bezieht Stellung. Durch die Pforte am Tor (E) kommst du hinein und hinaus. Bist du weit weg, entscheiden Mauern, Türme und Garnison.
- **Burgtor:** Ab der Holzburg schließt und öffnest du das Tor deiner Burg selbst, in der Burgtafel unter Ausbau oder mit B in der Nähe. Geschlossen: +10 Verteidigung, aber kein Marktgeld, weil die Händler draußen bleiben. Du selbst kommst durch die Pforte, ein Klick auf ein Ziel hinter dem Tor führt dich automatisch hindurch. Der Zustand wird gespeichert.
- **Seite wählen:** Ein Bote meldet jede Belagerung, die Karte markiert sie, und ein Pfeil am Bildrand zeigt Richtung und Entfernung. Im Feldlager (E oder Klick auf Zelte und Soldaten) oder in der belagerten Stadt wählst du deine Seite. *Den Verteidigern beistehen:* Durch die Pforte am Tor lassen dich die Wachen ein, gemeinsam mit der Besatzung hältst du die Bresche. Hält die Stadt, dankt sie dir mit Gold, Ansehen und Ruhm. *Den Belagerern dienen:* Du bläst zum Sturm, die Besatzung greift dich an. Fällt die Stadt, bekommst du einen Beuteanteil aus Gold und Waren, und der Ort liegt einige Tage darnieder. Auf der großen Karte führt „Hinreisen“ direkt zu Belagerung oder Turnier.
- **Friedhöfe und Begräbnisse:** Die Toten bringen Priester und Mönche im Trauerzug zum Friedhof, mit Kreuz, Bahre und einer kleinen Messe. Die Gräber bleiben.
- **Gasthäuser:** Die Bewohner treffen sich mittags und abends vor dem Gasthaus. Du kannst mit deinem Gefolge übernachten: voll geheilt, bis zum nächsten Abend ausgeruht (+10 % Angriff und Abwehr, +15 % Erfahrung), dazu ein Gerücht vom Wirt.
- **Lebendige Orte:** Bauern hacken und ernten je nach Jahreszeit, Mägde holen Wasser am Brunnen und kaufen auf dem Markt ein, Schmiede hämmern am Amboss, Händler stehen hinter ihren Ständen und rufen ihre Waren aus, Mönche beten und jäten, Kinder spielen Fangen, Wachen stehen am Tor. Mittags trifft man sich zum Schwatz, abends geht es nach Hause. Wer in der Nähe ist, hört Sprüche, Grüße und Gerüchte.
- **Schiffe übers Meer:** Fähren von Dover nach Calais, von Portsmouth nach Barfleur und ein Wollschiff von London nach Brügge. Die Überfahrt kostet Fährlohn je Kopf und Pferd und dauert einige Stunden. Wer auf der Karte ein Ziel jenseits des Meeres anklickt, reitet automatisch zum passenden Hafen.
- **Kompass und eingenordete Karte:** In der Schrägansicht liegt Norden rechts oben, der Kompass in der Ecke zeigt es an. Die Minikarte zeigt die Umgebung, die große Karte (M) England und Frankreich mit Fährlinien und Landschaftsnamen. Sie lässt sich mit Mausrad oder + und − zoomen und durch Ziehen verschieben.
- **Iso-Grafik mit Relief:** Hügel und Flusstäler mit Licht und Schatten. Die Karte ist ein Diorama mit Erdschichten am Rand. Gebäude haben Fachwerk, Schindeln, Fensterläden, Blumenkästen und Schlagschatten. Dazu kommen Fässer, Heu und Karren.
- **Drei Grafikstufen (Taste G oder Menü):**
  - **Klar** (Standard)
  - **Pixel:** halbe Auflösung, grobe Pixel
  - **Retro:** Amiga-Stil mit eigener 32-Farben-Palette und feinem Dithering
- **Tiere:** Schafe, Kühe und Hühner bei den Höfen, Hirsche im Wald, die vor dir fliehen, Enten auf Flüssen und Seen und Vogelschwärme.
- **Lebendige Welt:** Tag und Nacht, vier Jahreszeiten mit Wetter, Dorfbewohner, Händlerzüge, Steuereintreiber, Patrouillen, Wegelagerer und Raubritter.
- **Reiten:** Pferde machen schneller und im Kampf stärker. Das Gefolge sitzt mit auf, wenn es Pferde hat. Die Pferde sind 3D-Modelle (in Blender gebaut, `tools/pferd.py`) in acht Richtungen: Sie stehen und schlagen mit dem Schweif, gehen im Viertakt-Schritt und galoppieren im Dreitakt, je nach Tempo; die Hufe stehen dabei fest am Boden. Das Fell hat die Farbe des Pferds (Klepper braun, Zelter Schimmel), das Schlachtross trägt eine Schabracke in der Wappenfarbe seines Reiters. Der Reiter sitzt im Sattel und wippt mit. In der Koppel der Burg gehen die Pferde ihre Runde und grasen.
- **Die Burg Ashcombe:** Ausbau von der Ruine über Holzburg und Steinburg zur Festung. Neun Gebäude mit je drei Stufen (Rittersaal, Unterkunft, Schmiede, Stallungen, Holzfäller, Steinbruch, Markt, Kapelle, Wachtürme). Jeder Ausbau ist auf der Karte zu sehen:
  - abgesteckte Bauplätze mit Schildern
  - Baustellen mit wachsendem Rohbau, Gerüst und Bauleuten
  - jede Stufe sichtbar anders, mit Arbeitern: Schmied mit Funken, Holzfäller, Steinmetze mit Kran, Pferde auf der Koppel, Soldaten auf dem Übungsplatz, Wachen auf den Türmen
  - eine Burgsiedlung, die mit der Burgstufe wächst
  - goldene Funken, wenn etwas fertig wird
  - ein Klick auf ein Gebäude oder einen Bauplatz öffnet nur dieses Gebäude (Ausbau und, wo vorhanden, Anwerben, Rüstkammer oder Markt); der Bergfried öffnet die ganze Burg, ein Klick auf den Boden führt einfach dorthin
- **Mauern und Häuser halten auf:** Palisaden und Steinmauern (Ashcombe ab der Holzburg, die Burgen der Barone, die Halle von Rotherwood) sind für alle Figuren undurchlässig. Man kommt nur durchs Tor hinein. Auch Häuser, Kirchen, Hallen, Wahrzeichen, Bergfriede, Marktstände, Brunnen, Zelte und Zäune kann niemand durchschreiten, ebenso jedes Gebäude deiner Burg mit Nebengebäuden (Schafhütte, Scherschuppen, Scheune, Windmühle, Turm am Saal) und die eingezäunten Pferche (Schafweide, Pferdekoppel, Übungsplatz). Die Grundflächen werden genau geprüft, nicht nur feldweise; die Tür bleibt immer frei, und wer doch einmal in einem Hindernis steht, geht auf kürzestem Weg hinaus. Angreifer, Gefolge, Bewohner und Gruppen suchen sich den Weg drumherum, die Schafe bleiben in ihrer Weide.
- **Weitläufige Orte:** Dörfer, Märkte, Burgen und Abteien nehmen etwa ein Drittel mehr Fläche ein, zwischen den Häusern liegen Gärten und Wege. Städte sind größer, in den Häuserzeilen bleiben Höfe frei, und jede Hauptstraße hat ihre Brücke über den Fluss. Häuser, deren Tür man nicht erreichen könnte (zum Fluss hin, in einer Flussschleife), werden gar nicht erst gebaut.
- **Gefolge:** Leute im Rittersaal anwerben, ausrüsten (Waffe, Rüstung, Schild, Pferd) und in Scharmützel führen. Dazu Befehle (folgen, Stellung halten, angreifen), Erfahrung und Stufen, Sold, Garnison und Verwundete.
- **Jagd:** Mit Bogen oder Armbrust Hirsche und Enten jagen. Hirsche fliehen, Bogenschützen im Gefolge schießen mit. Fleisch und Felle lassen sich einlagern oder in Städten verkaufen. Wilderei kann den Normannen auffallen, fremdes Vieh zu schießen gilt als Diebstahl. Die Bestände wachsen täglich nach.
- **Handel:** Jeder Ort erzeugt und braucht andere Waren. Die Preise richten sich nach dem Vorrat. Holz, Stein und Eisen braucht man auch für den Burgbau.
- **Burg mit Hinterland:** Hospiz zum Heilen, Schafzucht mit eigener Herde, Felder mit Zehntscheune und Windmühle. Du und dein Gefolge braucht täglich Verpflegung aus Getreide oder Fleisch.
- **Kampf um die Burg:** Innerhalb deiner Mauern kämpfst du je nach Burgstufe besser, die Wachtürme schießen auf Feinde in Reichweite.
- **Fraktionen im Streit:** Banden überfallen Händler, Sachsen und Normannen und Franzosen bekämpfen einander. Befreundete Trupps kommen dir zu Hilfe, verfeindete schließen sich deinen Angreifern an.
- **Politik:** Sechs Fraktionen (Sachsen, Normannen, Kirche, Gilde, Waldleute und die Krone Frankreichs) mit Rivalitäten. Als Freund der Franzosen fährst du umsonst über den Kanal und kannst Armbrustschützen anwerben. Aufträge, Geschenke und Überfälle verschieben das Ansehen. Verbündete gewähren Vorteile, Feinde überfallen deine Burg.
- **Testmodus (F9 oder Menü):** Schalter für unendlich Gold, unendlich Rohstoffe und Vorräte, Unverwundbarkeit für dich und dein Gefolge, sofortiges Bauen und Sofortreise per Klick auf der Karte. Dazu Knöpfe für Zeit, Wetter und Schneedecke, ein Turnier heute, eine Hinrichtung, ein Feuer, eine Belagerung, eine Schlacht, beste Ausrüstung, Stufe und Ruhm, vollen Burgausbau und Ansehen. In der Kopfleiste steht dann „Testmodus“.
- **Speichern:** Automatisch jeden Morgen im Browser, dazu manuell über das Menü.

## Steuerung

| Taste | Aktion |
| --- | --- |
| Klick | Gehen, Gegner angreifen, Ort ansteuern |
| W A S D | Direkt laufen |
| E | Ort betreten, Burg verwalten |
| R | Auf- und absitzen |
| Leertaste | Nächsten Feind angreifen, beim Tjost die Lanze senken |
| Klick auf Bettler | Almosen geben |
| F oder 1 2 3 | Gefolge: folgen, halten, angreifen |
| T | Zeitraffer |
| I J P M | Gefolge, Aufträge, Politik, Karte |
| Mausrad, + − | Stufenlos zoomen |
| G | Grafik wechseln: klar, Pixel, Retro |
| L | Musik an und aus |
| Esc | Schließen und Menü |
| F9 | Testmodus (Cheats) |

## Aufbau des Codes

| Datei | Inhalt |
| --- | --- |
| `src/data.js` | Alle Spieldaten und Balancing-Werte: Fraktionen, Waren, Gegenstände, Klassen, Gruppen, Gebäude, Orte |
| `src/geo.js` | Küsten, Flüsse, Bergland und Wälder als Längen- und Breitengrade |
| `src/world.js` | Weltgenerator (Küsten rastern, Flüsse, Orte, Straßen je Landmasse, Häfen), A*-Wegfindung |
| `src/units.js` | Einheiten, Werte, Kampf, Gefolge, KI-Gruppen, Fehden, Fähren |
| `src/life.js` | Alltag der Bewohner: Rollen, Tagesablauf, Arbeitsplätze, Jagd, Reisig, Löschen, Bettler und Almosen, Sprüche, Gasthaus, Begräbnisse |
| `src/siege.js` | Belagerungen, Gebäudeschäden und Wiederaufbau |
| `src/dynamics.js` | Bauen und Verfall, Brände, Überfälle, Stiften und Sühne |
| `src/tournament.js` | Turniere: Ankündigung, Turnierplatz, Tjost, Zielleiste |
| `src/justice.js` | Galgen und Hinrichtungen, Befreien |
| `src/weather.js` | Wetter, Schneedecke, fließende Jahreszeiten |
| `src/cheats.js` | Testmodus: Cheats und Ereignisknöpfe |
| `src/mines.js` | Erzgruben (Anteile, tägliche Lieferung) und Einsiedler (Rat, Segen, Spende) |
| `src/economy.js` | Märkte, Preise, Ladung, Ausrüstungshandel |
| `src/politics.js` | Ansehen, Ruhm, Aufträge |
| `src/castle.js` | Burgausbau, Produktion, Anwerben, Überfälle |
| `src/sim.js` | Uhrzeit, Jahreszeiten, Tageswechsel |
| `src/render.js` | Isometrischer Canvas-Renderer mit Höhenrelief, Schatten, Retro-Modus (Palette, Dithering), Minikarte |
| `src/animals.js` | Tiere und Jagd |
| `src/titleart.js` | Titelbild: das gemalte Bild aus `assets/titel`, sonst im Code gemalt |
| `src/assets.js` | Lädt handgemalte Grafiken aus `assets/`, fehlt eine, zeichnet das Spiel selbst |
| `src/audio.js` | Musik mit Web Audio (Instrumente, Noten, Stimmungen) |
| `src/ui.js` | Kopfleiste und alle Tafeln |
| `src/save.js` | Speichern und Laden |
| `src/main.js` | Start, Hauptschleife, Eingabe |
| `tools/build.mjs` | Bündelt alles in eine HTML-Datei |
| `tools/kollision.mjs` | Prüft für drei Welten, ob sich Gebäude, Stadtmauern, Burgmauern, Palisaden und Friedhöfe überschneiden (`node tools/kollision.mjs`) |
| `tools/pferd.py` | Baut ein Pferd in Blender (Körper aus Skelett und Hautmodifikator, Knochen, Gewichte) und berechnet Stehen, Schritt, Galopp und Grasen; `--art ross` für das Schlachtross mit Schabracke. Danach `tools/sprites.py … --schleife … --punkt sattel --meter 1.75` und `tools/sprite_pack.py` |
| `tools/wege.mjs` | Prüft für drei Welten, ob jede Haustür, jede Ortsmitte und jeder Platz, den die Bewohner ansteuern (Brunnen, Stände, Amboss, Kirche, Gasthaus), frei steht und erreichbar ist, und misst den Abstand zwischen den Häusern (`node tools/wege.mjs`, zum Vergleich `--ohne-haeuser`) |
| `tools/ton.py` | Macht aus gelieferten Tönen spielfertige MP3s: nahtlose Schleifen für Hintergründe, Stille weg bei Musikstücken (`python3 tools/ton.py schleife|stueck <quelle> <ziel.mp3>`) |
| `tools/sprites.py` | Rendert eine animierte 3D-Figur (GLB) mit Blender in Sprite-Bögen: 2:1-Schrägansicht, 8 Richtungen, Umrisse, Fußpunkt (`/opt/blender-venv/bin/python tools/sprites.py <figur.glb> <ordner>`) |
| `tools/waffen.py` | Baut einfache Waffen als 3D-Modelle für die Sprite-Strecke |
| `tools/figur.py` | Stellt eine KI-Figur auf grünem Hintergrund frei, entfernt grüne Säume und verkleinert sie auf Spielgröße (`python3 tools/figur.py assets/roh/figuren/ritter_gemini.webp assets/figuren/ritter.png`). Magenta färbt das Spiel zur Wappenfarbe um. |

Keine Abhängigkeiten und kein Framework, nur Canvas 2D und modernes JavaScript. Grafik und Figuren werden im Code gezeichnet. Nach und nach kommen handgemalte Bilder dazu (Titelbild, Böden für Sommer, Herbst, Winter und Schnee, Eiche, Buche, Birke, Apfelbaum und drei Nadelbäume in Herbst- und Winterfassung, Büsche, Felsen, Schilf, Baumstümpfe, umgestürzte Stämme und Holzstöße), der Plan dafür steht in [assets/GRAFIK-BRIEF.md](assets/GRAFIK-BRIEF.md). Der Build bettet sie in die Einzeldatei ein. Musik und Geräusche sind in [assets/SOUND-BRIEF.md](assets/SOUND-BRIEF.md) beschrieben. Wo eine Aufnahme da ist (bisher Sommermusik und Wiese), spielt das Spiel sie, sonst erzeugt es die Musik selbst. Geräusche erzeugt das Spiel live: Amboss, Hammer, Axt und Hacke im Takt der Arbeiter, Hiebe, Treffer und Schildschläge im Nahkampf, Bogensehne und Armbrust mit davonzischendem Pfeil, Pfeiltreffer ins Fleisch, in den Schild, an der Rüstung oder in den Boden, Trebuchet, Einschlag, Bresche und Tor bei Belagerungen, Lanzenbruch, Kirchenglocken, Feuerknistern und Münzen. Sie werden mit der Entfernung leiser und kommen von links oder rechts.

Wie es weitergehen kann, steht in [DESIGN.md](DESIGN.md).
