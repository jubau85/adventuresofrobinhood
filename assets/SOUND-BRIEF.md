# Sound-Brief: A Knight's Tale

Dieser Brief beschreibt alle Musikstücke und Geräusche, die das Spiel braucht. Er ist so geschrieben, dass du sie mit Oakgen oder einem anderen Generator erzeugen kannst und ich sie danach ohne Nacharbeit einbaue.

**Heutiger Stand im Spiel:** Die Musik erzeugt das Spiel selbst aus einfachen Klängen (Laute, Flöte, Horn, Trommel, Bordun) in vier Stimmungen: Titel, Welt, Nacht, Kampf. Geräusche gibt es noch gar keine. Alles, was hier geliefert wird, ersetzt oder ergänzt das. Fehlt eine Datei, bleibt es wie bisher.

**Eigener Klang:** Das Spiel hat seinen eigenen Stil. In den Prompts bitte keine Namen bestehender Spiele, Filme, Serien oder Komponisten verwenden und keine bekannten Melodien nachspielen lassen.

**Für Steam:** KI-erzeugte Musik und Geräusche müssen bei der Einreichung angegeben werden. Bitte vor dem Bezahlen die Nutzungsrechte für ein verkauftes Spiel prüfen.

---

## Stand der Probestücke

| Datei | Urteil |
| --- | --- |
| `musik/welt_sommer` (Fassung B) | Passt und ist eingebaut. Lautheit −16 LUFS wie verlangt, Spitze −4,5 dBFS, 2:36 lang. Läuft vorerst überall (Titel, Tag, Nacht, Winter, Kampf): einmal ganz, dann 18 bis 40 Sekunden Pause mit nur Hintergrund, dann wieder von vorn. Die selbst erzeugte Musik springt nur noch ein, wenn die Datei nicht lädt. |
| `sound/ambiente/wiese_tag` | Passt und ist eingebaut. Lautheit −22 LUFS wie verlangt. Die Datei war aus zwei Teilen zusammengesetzt (die erste Hälfte ohne die Höhen über 15 kHz). Ich habe beides bei 15 kHz angeglichen und Ende und Anfang zur nahtlosen Schleife überblendet (`tools/ton.py`). Läuft am Tag von Frühling bis Herbst, nicht bei starkem Regen. Für die nächsten Schleifen: am besten in einem Stück erzeugen, nicht zusammensetzen. |

**Geräusche:** Bis Aufnahmen da sind, erzeugt das Spiel die wichtigsten Geräusche selbst (Amboss, Hammer, Axt, Hacke, Hieb, Klirren, Treffer, Schild, Bogen, Armbrust, Pfeiltreffer in Fleisch, Holz, Metall und Boden, Trebuchet, Einschlag, Bresche, Tor, Lanze, Münzen, Glocke, Feuer). Gelieferte Dateien ersetzen sie später einzeln.

**Als Nächstes:** `musik/nacht`, `musik/welt_winter`, `sound/ambiente/nacht`, `sound/ambiente/winter` und `sound/ambiente/regen`, dann hat jede Tageszeit und Jahreszeit ihren Ton. Danach die Kampfgeräusche.

## 1. Regeln für alle Dateien

**Format**
- Am liebsten **WAV**, 44,1 oder 48 kHz, 16 oder 24 Bit. Ich wandle für das Spiel selbst in kleine Dateien um.
- Kann das Werkzeug kein WAV: **MP3 mit 320 kbit/s** oder OGG in höchster Qualität.

**Lautstärke**
- Musik: gleich laut untereinander, ungefähr −16 LUFS, nicht hart begrenzt
- Ambiente: leiser als die Musik, ungefähr −22 LUFS
- Geräusche: Spitze bei etwa −3 dBFS, nicht übersteuert

**Geräusche (Abschnitt 4)**
- **Mono**, trocken, ohne Hall. Das Spiel setzt Hall und Entfernung selbst dazu.
- Kein Stille-Vorlauf: Der Klang beginnt sofort. Am Ende natürlich ausklingen lassen.
- Häufige Geräusche (Schritte, Treffer, Hiebe) bitte in **mehreren Varianten**, die Anzahl steht in der Liste. Sonst klingt es nach Maschinengewehr.

**Ambiente und Musik (Abschnitte 2 und 3)**
- **Stereo**, **nahtlos wiederholbar**: Ende und Anfang passen zusammen.
- Schafft das Werkzeug keinen nahtlosen Übergang, reicht ein Stück mit sanftem Ende. Dann blende ich über.

**Stimmen:** Keine verständlichen Worte, in keiner Sprache. Rufe, Stöhnen, Lachen, Gemurmel und Chorgesang nur als Laute oder Vokale. Das Spiel soll später in mehrere Sprachen übersetzt werden.

**Dateinamen:** genau wie in den Listen, Varianten mit Nummer: `sound/kampf/hieb_1.wav`, `hieb_2.wav` …

---

## 2. Musik

### Stil-Baustein Musik

Diesen Text bitte **vor** jedes Musik-Motiv setzen:

```
instrumental medieval European music from around the year 1200, played only on period instruments: lute, vielle (medieval fiddle), hurdy-gurdy, recorder, shawm, bagpipe, harp, psaltery, frame drum, tabor, small bells and a low drone; modal melody, warm and natural sound as if recorded in a wooden hall, no modern instruments, no synthesizer, no symphony orchestra, no electric guitar, no drum kit, no lyrics, seamless loop
```

**Grundton:** warm, abenteuerlich, mit einem Hauch Wehmut. Nicht bombastisch wie ein Kinofilm. Kirchentonarten wie Dorisch, Mixolydisch und Äolisch passen gut.

### Stücke zum Wiederholen

| Datei | Länge | Motiv (an den Baustein anhängen) | im Spiel |
| --- | --- | --- | --- |
| `musik/titel.wav` | 1,5 bis 2 min | noble and hopeful main theme, slow build, solo lute at first, then vielle and harp, a soft wordless male choir joins at the end | Titelbild |
| `musik/welt_sommer.wav` | 2,5 bis 3 min | travelling through green countryside on a sunny day, light and hopeful, recorder melody over lute, gentle tabor, triple time, about 95 bpm | unterwegs, Frühling und Sommer |
| `musik/welt_winter.wav` | 2,5 bis 3 min | travelling through a cold grey landscape, slower and wistful, vielle melody over harp and drone, about 70 bpm | unterwegs, Herbst und Winter |
| `musik/nacht.wav` | 2 min | quiet night under the stars, sparse plucked harp, long soft drone, very calm, about 55 bpm | nachts |
| `musik/wald.wav` | 2 min | deep old forest, mysterious but friendly, soft recorder, frame drum heartbeat, low drone | im Wald, bei den Waldleuten |
| `musik/stadt.wav` | 2 min | busy market town, lively, bagpipe or shawm melody, hurdy-gurdy, tabor, about 115 bpm | in Städten und auf Märkten |
| `musik/taverne.wav` | 2 min | merry tavern dance in the style of an estampie, vielle and hurdy-gurdy, hand drum, about 125 bpm | im Gasthaus, im Ort nachts |
| `musik/burg.wav` | 2 min | proud and steady, your own castle, lute and harp with a calm low horn call now and then | in deiner Burg, Burgtafel |
| `musik/kloster.wav` | 2 min | calm abbey, wordless male choir singing long vowels in plainchant style over a drone, distant bell | Abteien, Kirchen, Begräbnisse |
| `musik/mystisch.wav` | 2 min | ancient stone circle and holy spring, ethereal, harp harmonics, bowed psaltery, soft drone, wind chimes | Einsiedeleien, mystische Orte |
| `musik/kampf.wav` | 1,5 min | tense skirmish, driving tabor and frame drums, fast vielle ostinato, low drone, about 135 bpm | kleine Kämpfe |
| `musik/schlacht.wav` | 2 min | large battle or siege, heavy war drums, natural horns, shawms, dark and urgent, about 120 bpm | Feldschlacht, Belagerung |
| `musik/turnier.wav` | 1,5 min | festive tournament, bright shawm fanfares, drums, cheerful and proud | Turnier |
| `musik/frankreich.wav` | 2,5 min | travelling in France, troubadour style, vielle and harp, elegant and light | unterwegs in Frankreich und Flandern |

### Kurze Stücke (einmal abspielen, nicht wiederholen)

| Datei | Länge | Motiv | im Spiel |
| --- | --- | --- | --- |
| `musik/sieg.wav` | 4 bis 6 s | short triumphant fanfare on natural horns and drums | Gefecht gewonnen |
| `musik/niederlage.wav` | 4 bis 6 s | short sad falling motif on vielle and drone | du wurdest niedergeschlagen |
| `musik/auftrag.wav` | 3 bis 4 s | short satisfied flourish on lute and bells | Auftrag erfüllt |
| `musik/stufe.wav` | 3 bis 4 s | short rising motif on harp and bells | Stufe aufgestiegen |
| `musik/bau_fertig.wav` | 3 s | festive little chime of bells | Gebäude fertig |
| `musik/turniersieg.wav` | 6 s | big joyful fanfare with cheering crowd | Turnier gewonnen |
| `musik/belagerung.wav` | 5 s | ominous low horn call and a single war drum | eine Belagerung beginnt |
| `musik/entdeckung.wav` | 3 s | soft mysterious chime | Sehenswürdigkeit entdeckt |
| `musik/bund.wav` | 4 s | warm solemn motif on horns | Bündnis mit einer Fraktion |
| `musik/feind.wav` | 3 s | dark short drone stab | eine Fraktion wird dir feindlich |

---

## 3. Ambiente (Hintergrundgeräusche)

### Stil-Baustein Ambiente

```
natural ambience field recording, continuous background atmosphere, medieval countryside without any modern sounds, no music, no words, stereo, seamless loop
```

Alle Stücke 1 bis 2 Minuten, Stereo, nahtlos.

| Datei | Motiv | im Spiel |
| --- | --- | --- |
| `sound/ambiente/wiese_tag.wav` | open meadow on a summer day, songbirds, light wind in the grass, insects | Land am Tag |
| `sound/ambiente/wald_tag.wav` | deciduous forest by day, many birds, woodpecker, rustling leaves | im Wald am Tag |
| `sound/ambiente/wald_nacht.wav` | forest at night, owls, crickets, a distant fox, soft wind | im Wald nachts |
| `sound/ambiente/nacht.wav` | open land at night, crickets, frogs far away, calm | Land nachts |
| `sound/ambiente/winter.wav` | cold winter wind over bare fields, creaking branches, a crow now and then | Winter |
| `sound/ambiente/regen.wav` | steady light rain on grass and leaves | Regen |
| `sound/ambiente/regen_stark.wav` | heavy rain, gusts of wind | Wolkenbruch |
| `sound/ambiente/fluss.wav` | river flowing over stones, gentle | an Flüssen |
| `sound/ambiente/kueste.wav` | waves on a shingle beach, seagulls, wind | an der Küste, im Hafen |
| `sound/ambiente/dorf.wav` | small village by day, hens clucking, a dog barking far away, wood chopping, unintelligible distant voices | Dörfer |
| `sound/ambiente/stadt.wav` | busy medieval market town, crowd murmur without words, cart wheels on cobbles, hammering, animals | Städte, Märkte |
| `sound/ambiente/taverne.wav` | crowded tavern, murmur and laughter without words, clinking mugs, crackling hearth | am Gasthaus |
| `sound/ambiente/lagerfeuer.wav` | crackling campfire, close | an Lagerfeuern |
| `sound/ambiente/feuer.wav` | a burning timber house, roaring flames, crackling, beams cracking | brennende Häuser |
| `sound/ambiente/stollen.wav` | mine tunnel, dripping water, distant pickaxes, echoing | an Erzgruben |
| `sound/ambiente/mystisch.wav` | stone circle at dusk, soft wind hum, a trickling spring, faint chimes | mystische Orte |
| `sound/ambiente/schlacht_fern.wav` | distant battle, clashing steel, shouting without words, horns, heard from far away | Feldschlacht in der Nähe |
| `sound/ambiente/menge.wav` | excited crowd at a tournament, cheering and murmuring without words | Turnier, Hinrichtung |

---

## 4. Geräusche

### Stil-Baustein Geräusche

```
single isolated sound effect, close and dry, no reverb, no music, no background noise, medieval setting
```

Die Zahl in Klammern ist die Anzahl der Varianten. Ohne Zahl reicht eine.

### Bedienung

| Datei | Motiv |
| --- | --- |
| `sound/ui/klick` (2) | soft wooden click |
| `sound/ui/tafel_auf` | parchment unrolling |
| `sound/ui/tafel_zu` | parchment rolling up |
| `sound/ui/muenzen` (3) | a few coins dropped into a leather purse |
| `sound/ui/gold_viel` | a heavy pile of coins poured onto a table |
| `sound/ui/fehler` | dull wooden knock |
| `sound/ui/auftrag` | quill scratching on parchment, then a wax seal pressed |
| `sound/ui/speichern` | heavy book closed |

### Bewegung

| Datei | Motiv |
| --- | --- |
| `sound/schritt/gras` (4) | a footstep on grass, leather shoe |
| `sound/schritt/weg` (4) | a footstep on a dirt road |
| `sound/schritt/laub` (4) | a footstep on dry leaves and twigs |
| `sound/schritt/schnee` (4) | a footstep in fresh snow |
| `sound/schritt/holz` (4) | a footstep on wooden planks |
| `sound/schritt/kette` (4) | rattling chainmail while walking, one step |
| `sound/pferd/schritt` (4) | a single horse hoofbeat on a dirt road |
| `sound/pferd/galopp` | galloping horse, one-second loop |
| `sound/pferd/wiehern` (2) | horse neighing |
| `sound/pferd/schnauben` (2) | horse snorting |
| `sound/pferd/aufsitzen` | mounting a horse, saddle leather creaking |

### Kampf

| Datei | Motiv |
| --- | --- |
| `sound/kampf/hieb` (4) | sword swung through the air, swoosh |
| `sound/kampf/treffer` (4) | blunt hit on a padded body, cloth and leather |
| `sound/kampf/treffer_kette` (4) | sword hitting chainmail, metallic rattle |
| `sound/kampf/schild` (4) | heavy hit on a wooden shield |
| `sound/kampf/klirren` (4) | two swords clashing |
| `sound/kampf/axt` (3) | battle axe hit, heavy chop |
| `sound/kampf/keule` (3) | wooden club or war hammer, dull thud |
| `sound/kampf/speer` (3) | quick spear thrust |
| `sound/kampf/bogen` (3) | bowstring released, arrow whooshing away |
| `sound/kampf/pfeil_treffer` (3) | arrow hitting wood or a body, thunk |
| `sound/kampf/armbrust` (2) | crossbow shot, sharp twang |
| `sound/kampf/armbrust_laden` | crossbow being cranked and loaded |
| `sound/kampf/schmerz_mann` (4) | man grunting in pain, no words |
| `sound/kampf/schmerz_frau` (3) | woman gasping in pain, no words |
| `sound/kampf/fallen` (3) | a man in armour falling to the ground |
| `sound/kampf/schlachtruf` (2) | group of men roaring a battle cry, no words |
| `sound/kampf/horn` | single war horn blast |

### Belagerung und Turnier

| Datei | Motiv |
| --- | --- |
| `sound/belagerung/trebuchet` | wooden trebuchet releasing, creaking beam, heavy swing |
| `sound/belagerung/stein_mauer` (3) | large stone smashing into a stone wall, crumbling |
| `sound/belagerung/bresche` | a section of stone wall collapsing, rumble and falling stones |
| `sound/belagerung/tor_zu` | heavy wooden gate slamming shut, iron bar dropped into place |
| `sound/belagerung/tor_auf` | heavy wooden gate creaking open |
| `sound/belagerung/sturm` | many soldiers charging, distant roar without words |
| `sound/turnier/fanfare` | short fanfare on natural trumpets |
| `sound/turnier/lanze` (3) | wooden lance shattering on a shield |
| `sound/turnier/jubel` | crowd cheering loudly |
| `sound/turnier/raunen` | crowd gasping in surprise |

### Arbeit und Alltag

| Datei | Motiv |
| --- | --- |
| `sound/arbeit/holzhacken` (3) | axe chopping firewood |
| `sound/arbeit/hammer` (3) | hammering a wooden beam, construction |
| `sound/arbeit/saege` | hand saw cutting wood |
| `sound/arbeit/hacke` (3) | hoe hitting earth |
| `sound/arbeit/sense` (2) | scythe cutting grass |
| `sound/arbeit/spitzhacke` (3) | pickaxe hitting rock |
| `sound/arbeit/amboss` (3) | blacksmith hammer on anvil |
| `sound/arbeit/eimer` (2) | splash of a bucket of water thrown |
| `sound/arbeit/brunnen` | bucket pulled up a well, rope and pulley |
| `sound/arbeit/karren` | wooden cart rolling by |
| `sound/welt/glocke` | church bell, three strokes |
| `sound/welt/totenglocke` | single slow tolling bell |
| `sound/welt/feuer_an` | fire catching on dry thatch, whoosh |
| `sound/welt/einsturz` | burnt timber house collapsing |
| `sound/welt/donner` (3) | thunder rolling in the distance |
| `sound/welt/segen` | bright shimmering chime, holy and soft |
| `sound/welt/quelle` | small spring trickling |
| `sound/welt/galgen` | wooden trapdoor dropping, rope creaking |
| `sound/welt/trommelwirbel` | slow drum roll |
| `sound/welt/schiff` | wooden ship creaking, sail flapping |

### Tiere

| Datei | Motiv |
| --- | --- |
| `sound/tiere/hahn` | rooster crowing at dawn |
| `sound/tiere/huhn` (2) | hens clucking |
| `sound/tiere/hund` (2) | dog barking |
| `sound/tiere/schaf` (2) | sheep bleating |
| `sound/tiere/kuh` (2) | cow mooing |
| `sound/tiere/schwein` (2) | pig grunting |
| `sound/tiere/ziege` | goat bleating |
| `sound/tiere/hirsch` | red deer stag roaring |
| `sound/tiere/wildschwein` | wild boar grunting |
| `sound/tiere/hase` | hare rustling away through grass |
| `sound/tiere/kraehe` (2) | crow cawing |
| `sound/tiere/eule` | tawny owl hooting |
| `sound/tiere/moewe` | seagull crying |
| `sound/tiere/wolf` | distant wolf howling |

---

## 5. Werkzeuge

- **Musik:** Oakgen oder ein anderer Musikgenerator. Zuerst ein Probestück: `musik/welt_sommer.wav`. Das hört man am häufigsten.
- **Geräusche:** Falls Oakgen keine einzelnen Geräusche erzeugt, gibt es eigene Generatoren für Soundeffekte, etwa von ElevenLabs oder Stable Audio. Für Schritte, Hiebe und Tiere klingen echte Aufnahmen oft besser als KI. Freie Sammlungen mit Rechten für kommerzielle Spiele gibt es zum Beispiel im jährlichen GDC-Audio-Paket von Sonniss. Bei jeder Quelle bitte die Lizenz prüfen.
- **Probestück Geräusche:** `sound/kampf/hieb` in 4 Varianten und `sound/ambiente/wiese_tag`. Daran sehe ich, ob Lautstärke und Format passen.

---

## 6. Lieferung

**Ordner:** `assets/musik/` und `assets/sound/` mit den Unterordnern aus den Listen.

**Übergabe:** hier im Chat anhängen oder direkt in den Ordner legen, gern paketweise, Hauptsache mit den Dateinamen aus diesem Brief.

**Was ich damit mache:**
- Die Musik wechselt weich nach Lage: Jahreszeit, Tag und Nacht, Wald, Stadt, Gasthaus, Kampf, Schlacht und Turnier.
- Ambiente wird nach Gelände, Wetter und Tageszeit gemischt.
- Geräusche werden leiser, je weiter weg sie entstehen, und kommen von links oder rechts.
- Varianten wechseln sich zufällig ab, dazu ein wenig Tonhöhe, damit nichts gleich klingt.
- Für die Online-Fassung wandle ich alles in kleine Dateien um.
- Fehlt eine Datei, bleibt es wie heute: selbst erzeugte Musik und Stille.

**Umfang:** 14 Musikstücke, 10 kurze Stücke, 18 Ambiente-Schleifen und 80 Geräusche, mit allen Varianten gut 200 Dateien.
