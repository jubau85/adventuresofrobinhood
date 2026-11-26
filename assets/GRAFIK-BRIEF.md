# Grafik-Brief: A Knight's Tale

Dieser Brief beschreibt alle Grafiken, die das Spiel braucht. Er ist so geschrieben, dass du die Bilder mit Oakgen (oder einem anderen Bildgenerator) erzeugen kannst und ich sie danach ohne Nacharbeit einbauen kann.

**Ziel:** weg vom Klötzchen-Look. Runde, weiche, handgemalte Formen, die nach Handwerk aussehen: durchhängende Strohdächer, krumme Fachwerkbalken, runde Baumkronen, Mauern aus unregelmäßigen Steinen.

**Eigener Stil:** Das Spiel hat seinen eigenen Look. In den Prompts bitte keine Namen bestehender Spiele, Filme oder Künstler verwenden.

**Stand dieses Briefs:** Spielversion 18. Seit der letzten Fassung sind dazugekommen:
- der neue Maßstab: Figuren sind deutlich kleiner im Verhältnis zu den Häusern (siehe „Maßstab“ unten)
- Baustellen, Brandruinen und Bauplätze, weil die Welt ständig baut und verfällt
- neue Bewohner: Jäger, Fischer, Bettler, Bergleute, Einsiedler, Pilger, Reisende, Henker
- Erzgruben, mystische Orte mit Einsiedlern, Lagerfeuer, Galgen, Friedhöfe, Turniere
- Wahrzeichen: Kathedralen, Tower, Tuchhallen, Stonehenge und andere
- Stadtmauern um die großen Städte
- der kahle Winter vor dem ersten Schnee und das schrittweise Tauwetter
- drei neue Burggebäude (Hospiz, Schafzucht, Felder) und neue Waren (Blei, Zinn, Silber)

Die neuen Pakete 11 bis 13 und die Ergänzungen in den alten Paketen sind mit **neu** markiert. Wer mit **Gemini** arbeitet, liest zuerst den Abschnitt „Mit Gemini erzeugen“.

---

## 1. Regeln für alle Bilder

**Perspektive: echte Isometrie im Verhältnis 2:1.**
- Eine Bodenkachel ist eine Raute, doppelt so breit wie hoch.
- Die Kamera schaut schräg von oben, etwa 30° über dem Boden, also nicht 45°, nicht von vorn und nicht von oben.
- Von einem Haus sieht man das Dach, die linke Vorderwand und die rechte Vorderwand.
- Die vordere Ecke der Grundfläche zeigt nach unten.

**Licht:**
- Es kommt von links oben.
- Linke Wände sind hell, rechte Wände liegen im weichen Schatten.
- Keinen Schlagschatten auf den Boden malen, den zeichnet das Spiel selbst.

**Freistellen:**
- Unter dem Objekt kein Boden, kein Sockel, keine Grasplatte. Ausnahmen sind die Bodentexturen (Paket 2) und der weich auslaufende Bodenfuß der Gebäude (Paket 4, 6, 11 und 12). Mauerteile in Paket 5 bleiben ohne Boden, damit sie nahtlos aneinanderpassen.
- Am besten ein transparenter Hintergrund (PNG mit Alpha).
- Falls Oakgen das nicht kann, ein einfarbiger Hintergrund, den ich ausstanze:
  - Reingrün `#00FF00` für alles außer Pflanzen
  - Magenta `#FF00FF` für Bäume, Büsche und Gras

**Wappenfarbe (wichtig):**
- Der Spieler wählt seine Farbe selbst, die Fraktionen haben eigene Farben.
- Alles, was diese Farbe tragen soll, bitte in kräftigem **Magenta** malen, mit ganz normaler Licht- und Schattenschattierung. Das betrifft:
  - Waffenrock und Umhang
  - Schabracke (Pferdedecke)
  - Banner und Wimpel
  - Markisen der Marktstände und Zeltbahnen auf dem Markt
- Das Spiel färbt Magenta automatisch um. Deshalb sonst nirgends Pink oder Violett verwenden.

**Maßstab (neu, wichtig):**
- Eine Bodenkachel ist im Spiel 64 × 32 Pixel groß (1×).
- Ein erwachsener Mensch zu Fuß ist **etwa 15 Pixel** hoch, ein Reiter mit Pferd etwa 24.
- Eine Bauernkate ist **drei- bis viermal so hoch wie ein Mensch**: Die Traufe liegt bei gut 1,5 Menschenhöhen, der First bei 3 bis 3,5. Die Tür ist knapp eine Menschenhöhe hoch.
- Burg- und Stadtmauern sind etwa 2,5 Menschenhöhen hoch, Türme 4, ein Bergfried 6 bis 7. Kathedralen überragen alles.
- Eine große Eiche ist etwa fünfmal so hoch wie ein Mensch.
- Bei allen Bildern mit Menschen darin oder daneben bitte genau auf dieses Verhältnis achten. Ist eine Tür doppelt so hoch wie eine Figur, wirkt alles falsch.

**Größe:**
- In den Tabellen steht die Größe im Spiel (1×). Gebäude, Bäume und Dinge bitte **viermal so groß** liefern (4×), gern auch sechsmal, solange das Seitenverhältnis gleich bleibt. Beispiel: 1× = 64 × 84 heißt Lieferung 256 × 336.
- **Figuren und Tiere achtmal so groß** (8×). Sie sind im Spiel klein, aber man kann bis zur fünffachen Größe heranzoomen.
- Das Objekt steht mittig, ist ganz zu sehen und hat rundherum etwa 5 % Luft.
- Der Fußpunkt (Mitte der Grundfläche) liegt unten in der Mitte.

**Format:**
- PNG in sRGB, Titelbilder als JPG oder WebP.
- Dateinamen genau wie in den Tabellen: klein geschrieben, ohne Umlaute (ae, oe, ue).
- Bitte **nicht spiegeln**, um Varianten zu sparen: Das Licht käme dann von rechts.

---

## 2. Stil-Baustein

Diesen Text bitte **vor jeden Prompt** setzen. In den Tabellen steht danach nur noch das Motiv.

```
hand-painted isometric game asset, true 2:1 isometric projection, camera about 30 degrees above the ground, soft rounded organic shapes, slightly irregular hand-crafted edges, no hard boxy geometry, warm painterly texture with visible brush strokes, thin soft dark-brown outlines, natural earthy palette of moss green, ochre, oak brown, slate grey and warm cream with small gold accents, light from the upper left, left faces lit, right faces in soft shade, no cast shadow, no ground, no background, isolated single object, centered, fully visible, medieval England and Normandy around 1194
```

Negativ-Prompt, falls Oakgen das kann:

```
text, letters, watermark, logo, frame, border, ground plane, grass base, pedestal, drop shadow, top-down view, front view, side view, fisheye, perspective distortion, plastic 3D render, photo, blurry, cropped, pink, purple
```

> Bei Bildern mit Wappenfarbe das „pink, purple“ aus dem Negativ-Prompt streichen.

**Vorgehen:**
1. Pro Paket zuerst ein Probestück erzeugen (ein Haus, einen Baum, eine Figur) und mir schicken.
2. Ich baue es ein und wir prüfen gemeinsam Größe, Winkel und Stil.
3. Danach den Rest des Pakets.

Was noch fehlt, zeichnet das Spiel weiter selbst. Du kannst also stückweise liefern.

---

## Mit Gemini erzeugen (neu)

Gemini (am besten in Google AI Studio, dort lassen sich Seitenverhältnis und Download in voller Größe einstellen) arbeitet etwas anders als Oakgen. Diese Punkte gehen vor die Regeln oben:

**1. Kein transparenter Hintergrund.** Gemini liefert Bilder ohne Alpha-Kanal. Deshalb immer einen **einfarbigen, flachen Hintergrund** verlangen, den ich ausstanze. Ich stanze mit Toleranz aus, ein paar Prozent daneben ist kein Problem.
- Reingrün `#00FF00` für fast alles
- Magenta `#FF00FF`, wenn das Motiv selbst grün ist (Bäume, Büsche, Gras, grün gekleidete Jäger und Waldleute)
- Reinblau `#0000FF`, wenn Grün **und** Magenta im Motiv vorkommen (zum Beispiel ein Turnierzelt in Wappenfarbe auf Gras)
- Ausdrücklich dazuschreiben: kein Farbverlauf, kein Boden, kein Schatten auf dem Hintergrund.

**2. Kein Negativ-Prompt.** Gemini hat kein eigenes Feld dafür. Den Negativ-Prompt bitte als Satz ans Ende hängen: „Avoid: …“.

**3. Ein gutes Bild als Vorbild mitgeben.** Gemini hält einen Stil am besten, wenn man ein Bild anhängt. Die eingebauten Probestücke (`natur/laub_1_sommer.png`, `boden/wiese_sommer.jpg`) als Stilvorlage anhängen und dazuschreiben: „Match the painting style, brush strokes, outlines and lighting of the attached image.“ Sobald das erste Haus passt, dient es als Vorlage für alle weiteren Häuser.

**4. Varianten durch Bearbeiten statt neu erzeugen.** Das ist Geminis Stärke. Erst das Grundbild erzeugen, dann im selben Gespräch abwandeln, zum Beispiel:
- „Keep exactly the same tree, camera angle and style. Show it bare in early winter, no leaves, no snow.“ → `_kahl`
- „Same tree, now with snow on the branches.“ → `_winter`
- „Keep exactly the same cottage, angle and style. Show it as a burnt-out ruin: roof gone, blackened wall stubs, charred fallen beams, ash.“ → `haus/brandruine.png`
- „Same spot, but the cottage is only begun: rubble foundation and the first oak frame posts, a pile of timber beside it, no walls, no roof.“ → `haus/rohbau_1.png`

So passen Jahreszeiten, Baustufen und Ruinen genau zusammen.

**5. Seitenverhältnis wählen statt Pixel.** Gemini erzeugt feste Formate. Bitte das Format nehmen, das der 1×-Größe am nächsten kommt: Häuser und Bäume meist 1:1 oder 3:4, Türme 9:16, Tribüne, Mauern und lange Gebäude 16:9. Auf die genaue Pixelzahl kommt es nicht an, ich skaliere.

**6. Figuren als Einzelbilder statt Bögen.** Ein sauberes Raster mit 8 × 2 Zellen schafft Gemini kaum. Deshalb jede Pose als eigenes Bild, Format 1:1, die Figur groß in der Mitte. Erst die stehende Figur erzeugen, dann im selben Gespräch: „Same character, same angle, now walking with the left leg forward“ und so weiter. Die Bögen setze ich daraus zusammen.
- Dateinamen: `figuren/<name>_<pose>.png`, Rückansicht mit `_hinten`, zum Beispiel `ritter_gehen1.png`, `ritter_gehen1_hinten.png`.
- Posen: `stehen`, `gehen1` bis `gehen4`, `ausholen`, `schlag`, `liegend`, bei Alltagsleuten zusätzlich `arbeit1`, `arbeit2`, `sitzen`.
- Mindestens nötig: `stehen`, `gehen1`, `gehen2`, `schlag`, `liegend`, jeweils von vorn. Den Rest ergänze ich.
- Die Figuren werden im Spiel sehr klein. Bitte dazuschreiben: „bold simple shapes and clear colour areas, readable when shrunk to a tiny size“.

**7. Maßstab in Worten.** Gemini kann keine Pixelmaße einhalten. Bei Gebäuden deshalb das Verhältnis zum Menschen beschreiben, etwa „the door is about as tall as an adult person, the eaves at about 1.5 times a person's height“. Menschen selbst bitte nicht ins Gebäudebild malen.

**Fertiger Prompt für das erste Probestück** (`haus/stroh_1.png`, Format 1:1, Laubbaum als Stilvorlage anhängen):

```
Create a hand-painted isometric game asset of a small English peasant cottage from around 1194. Match the painting style, brush strokes, outlines and lighting of the attached image.

Camera and format: true 2:1 isometric projection, camera about 30 degrees above the ground, the front corner of the footprint points straight down, we see the roof, the lit left wall and the shaded right wall. Light from the upper left. The cottage is centered, fully visible, with a small empty margin. Background: one flat solid pure green colour (#00FF00), no gradient, no floor, no shadow on the background.

Style: soft rounded organic shapes, slightly irregular hand-crafted edges, warm painterly texture with visible brush strokes, thin soft dark-brown outlines, muted earthy palette of straw, limewash, oak and moss.

The cottage: low limewashed wattle-and-daub walls, a huge thick weathered thatched hipped roof sweeping down almost to head height with deep rounded eaves, curved cruck timbers visible on the gable end, a smoke hole at the top of the thatch and no chimney, a small unglazed window with a wooden shutter, a low plank door about as tall as an adult person. It sits on a small irregular patch of trampled earth with grass tufts and a puddle that fades softly into the background, nettles and long grass against the walls, mud splashes at the wall base. Low and wide proportions: the eaves at about 1.5 times the height of an adult, the ridge at about 3.5 times.

Avoid: text, letters, watermark, frame, people, animals, flower boxes, brick chimney, glass windows, tall straight box walls, bright clean colours, toy-like cartoon look, any floor or shadow on the green background.
```

Ist das Haus gelungen, bitte im selben Gespräch gleich die Varianten aus Punkt 4 erzeugen: Bauplatz, Rohbau 1 bis 3 und Brandruine.

**Hinweis für Steam:** Steam verlangt beim Einreichen eine Angabe, ob Inhalte mit KI erzeugt wurden, und eine kurze Beschreibung dazu. Gemini-Bilder tragen außerdem ein unsichtbares Wasserzeichen (SynthID). Beides spricht nicht gegen die Bilder, man muss es nur angeben.

---

## Stand der Probestücke

| Datei | Urteil |
| --- | --- |
| `titel/titel_quer.jpg`, `titel_hoch.jpg` | Passt, ist eingebaut. |
| `boden/wiese_sommer.png` | Passt, ist eingebaut. Die übrigen Bodentexturen bitte im selben Maßstab: Grashalme so groß wie hier. |
| `natur/laub_1_sommer.png` | Passt, ist eingebaut. Weitere Bäume bitte genauso freigestellt, Stammfuß unten in der Mitte. |
| `haus/stroh_1.png` | Schön gemalt, aber zu sehr Aufbauspiel und zu „aufgesetzt“. Bitte nach den Regeln in Paket 4 neu erzeugen, mit dem neuen Maßstab (Tür knapp eine Menschenhöhe). |

**Als Nächstes empfehle ich diese Reihenfolge:**
1. `haus/stroh_1.png` neu, dann der Rest von Paket 4. Häuser bestimmen das Bild jedes Ortes.
2. Paket 7, Figuren im neuen Maßstab, zuerst `figuren/ritter.png` als Probestück.
3. Paket 3, Bäume mit den neuen kahlen Wintervarianten.
4. Paket 2, Bodentexturen.
5. Danach nach Lust und Laune: Wahrzeichen (Paket 11), mystische Orte und Gruben (12), Turnier (13).

## 3. Pakete in der Reihenfolge der Wirkung

| Paket | Inhalt | ca. Bilder | Wirkung |
| --- | --- | --- | --- |
| 1 | Titelbild | 2 | sofort sichtbar |
| 2 | Bodentexturen | 27 | ganze Landschaft |
| 3 | Bäume, Büsche, Felsen | 44 | ganze Landschaft |
| 4 | Häuser, Kirchen, Dorfdinge, Baustellen | 35 | alle Orte |
| 5 | Burgen-Baukasten, Stadtmauer, Hafen | 25 | Burgen, Städte, Küste |
| 6 | Eigene Burg im Ausbau | 42 | das Herz des Spiels |
| 7 | Figuren, Lasten | 42 Bögen, 13 Lasten | alle Menschen |
| 8 | Tiere | 6 Bögen | Weiden, Wald |
| 9 | Symbole und Porträts | 66 | Tafeln und Menüs |
| 10 | Musik (optional) | 7 Stücke | Ton |
| 11 | **neu:** Wahrzeichen | 15 | Kathedralen, Tower, Tuchhallen, Stonehenge |
| 12 | **neu:** Mystische Orte, Gruben, Lagerfeuer, Galgen, Friedhof | 23 | Land zwischen den Orten |
| 13 | **neu:** Turnier | 4 | Turnierplatz |

Die Pakete 2 bis 4 und 7 verändern das Bild am stärksten, damit würde ich anfangen.

---

## Paket 1: Titelbild

Hier gilt der Stil-Baustein **nicht**. Statt eines einzelnen Objekts ist es ein ganzes Gemälde.

| Datei | Größe |
| --- | --- |
| `titel/titel_quer.jpg` | 2560 × 1440 |
| `titel/titel_hoch.jpg` | 1440 × 2560 (für Handys) |

```
epic hand-painted fantasy-history illustration, painterly, cinematic, a lone knight in chainmail on a horse seen from behind at three-quarter angle, standing on a grassy hill at sunset, dark cloak blowing in the wind, a small white pennant on his lance, looking over a wide green valley with a winding river, a stone castle on a rocky crag in the middle distance, beyond it the sea with two medieval cog ships and faint white cliffs, warm golden light, dramatic glowing clouds, birds, atmospheric haze, medieval England 1194, rich warm colours, soft rounded painterly shapes, no text, no letters
```

**Bildaufbau:**
- Oben links etwa ein Drittel ruhiger Himmel, dort steht der Titel.
- Der Ritter steht im rechten unteren Drittel.
- In der Hochformat-Fassung den Himmel oben lassen und den Ritter im unteren Drittel zeigen.

---

## Paket 2: Bodentexturen

Hier gilt ebenfalls ein **anderer Baustein**: nahtlos kachelbar, von genau oben.

```
seamless tileable texture, orthographic top-down view, hand-painted, soft painterly brush strokes, even soft lighting, no shadows, no objects, no perspective, game terrain texture, medieval countryside
```

Größe 1× 256 × 256, Lieferung 1024 × 1024. Das Spiel legt die Textur selbst schräg auf die Rauten und auf die Hügel.

| Datei | Motiv (an den Baustein anhängen) |
| --- | --- |
| `boden/wiese_sommer.png` | lush meadow grass, small clover patches |
| `boden/wiese_fruehling.png` | fresh light-green meadow with tiny white and yellow flowers |
| `boden/wiese_herbst.png` | late-autumn meadow, yellowed and olive grass, a few fallen leaves |
| `boden/wiese_winter.png` | thin snow cover with grass tufts showing through |
| `boden/wiese_kahl.png` | **neu:** bare early-winter meadow without snow, dull olive and brown grass, a touch of frost |
| `boden/waldboden_sommer.png` | forest floor, moss, ferns, dark soil, twigs |
| `boden/waldboden_herbst.png` | forest floor covered in orange and brown fallen leaves |
| `boden/waldboden_winter.png` | forest floor with patchy snow, needles and dark leaves |
| `boden/waldboden_kahl.png` | **neu:** wet dark forest floor in early winter, brown leaves, no snow |
| `boden/heide_sommer.png` | upland moor, heather, short grass, small grey stones |
| `boden/heide_herbst.png` | upland moor, purple-brown heather, bracken |
| `boden/heide_winter.png` | snowy upland moor, rocks and dry heather peeking out |
| `boden/heide_kahl.png` | **neu:** bare brown upland moor in early winter, no snow |
| `boden/acker_jung.png` | ploughed field with straight rows of young green crops, rows run horizontally |
| `boden/acker_reif.png` | ripe golden wheat field, rows run horizontally |
| `boden/acker_brach.png` | freshly ploughed brown furrows, rows run horizontally |
| `boden/acker_winter.png` | snowy furrows, rows run horizontally |
| `boden/weg.png` | packed dirt road, wheel ruts, small pebbles, worn grass edges |
| `boden/weg_winter.png` | muddy road with slush and snow |
| `boden/sand.png` | sandy shore, a few pebbles and shell fragments |
| `boden/kies.png` | pebble beach, rounded grey stones |
| `boden/wasser_fluss.png` | clear shallow river water, soft ripples, greenish blue |
| `boden/wasser_meer.png` | deep sea water, gentle wave pattern, blue-green |
| `boden/wasser_winter.png` | dark cold water with thin ice floes |
| `boden/fels.png` | bare grey rock surface with cracks and lichen |
| `boden/pflaster.png` | rough cobblestone town square |
| `boden/schlamm.png` | wet mud with puddles (for camps and building sites) |

> **Neu:** Der Winter kommt jetzt nach und nach. Erst ist das Land kahl und graugrün (`_kahl`), dann bleibt Schnee in Flecken liegen, dann ist alles weiß (`_winter`). Die Schneeflecken dazwischen malt das Spiel selbst.

---

## Paket 3: Bäume, Büsche, Felsen

Stil-Baustein + Motiv. Hintergrund transparent oder Magenta.

| Datei | 1× | Motiv |
| --- | --- | --- |
| `natur/laub_1_sommer.png` | 64 × 84 | broad old oak tree, round lush crown, thick gnarled trunk |
| `natur/laub_2_sommer.png` | 64 × 84 | beech tree, rounded crown, smooth grey trunk |
| `natur/laub_3_sommer.png` | 56 × 84 | slender birch tree, white bark, airy crown |
| `natur/laub_4_sommer.png` | 56 × 64 | small apple tree with red apples |
| `natur/laub_1_herbst.png` … `laub_4_herbst.png` | wie oben | same trees in autumn colours, orange, rust and gold leaves |
| `natur/laub_1_winter.png` … `laub_4_winter.png` | wie oben | same trees bare in winter, snow on the branches |
| `natur/laub_1_kahl.png` … `laub_4_kahl.png` | wie oben | **neu:** same trees bare in early winter, no snow, dark wet bark |
| `natur/laub_1_fruehling.png` … `laub_4_fruehling.png` | wie oben | same trees in spring, fresh light green, white blossoms on the apple tree |
| `natur/nadel_1.png` | 44 × 92 | tall pine tree, rounded layered branches, reddish trunk |
| `natur/nadel_2.png` | 44 × 92 | dark spruce, soft drooping branches |
| `natur/nadel_3.png` | 40 × 70 | young fir tree |
| `natur/nadel_1_winter.png` … `nadel_3_winter.png` | wie oben | same trees with heavy snow on the branches |
| `natur/busch_1_sommer.png` | 40 × 32 | round hazel bush |
| `natur/busch_2_sommer.png` | 40 × 30 | flowering hawthorn bush |
| `natur/busch_3_sommer.png` | 36 × 28 | bramble bush with berries |
| `natur/busch_1_herbst.png` … `busch_3_herbst.png` | wie oben | same bushes in autumn colours |
| `natur/busch_1_winter.png` … `busch_3_winter.png` | wie oben | same bushes bare with snow |
| `natur/busch_1_kahl.png` … `busch_3_kahl.png` | wie oben | **neu:** same bushes bare, brown twigs, no snow |
| `natur/fels_1.png` | 48 × 36 | rounded mossy boulder |
| `natur/fels_2.png` | 52 × 34 | cluster of three weathered grey rocks |
| `natur/fels_3.png` | 40 × 40 | tall standing stone, lichen |
| `natur/fels_1_winter.png` … `fels_3_winter.png` | wie oben | same rocks with snow caps |
| `natur/schilf.png` | 40 × 36 | clump of reeds and bulrushes (for riverbanks) |
| `natur/baumstumpf.png` | 28 × 22 | old tree stump with a small axe mark |

---

## Paket 4: Häuser, Kirchen, Dorfdinge

### So sah England um 1194 aus

Das Probehaus war schön gemalt, wirkte aber wie aus einem Aufbauspiel: hohe, kastige Wände, ein ordentlich gestutztes Dach, Blumenkasten und gemauerter Schornstein. Ein englisches Bauernhaus um 1194 sieht anders aus. Diese Merkmale machen es englisch:

**Bitte so:**
- **Das Dach ist das Haus.** Ein riesiges, dickes Strohdach (oder Reet), meist als Walmdach. Es reicht tief herunter, fast bis auf Kopfhöhe, und hat weit überstehende, weich gerundete Traufen. Das Stroh ist verwittert, grau-golden, mit Moosflecken und eingesackten Stellen.
- **Niedrige Wände:** Flechtwerk mit Lehm, gekalkt in warmem Cremeweiß oder Ocker, unten mit Schmutzspritzern. Im Westen auch Cob (Stampflehm) mit runden Ecken, im Osten Feuerstein und Bruchstein.
- **Cruck-Rahmen:** Am Giebel sieht man oft zwei gebogene Eichenbalken, die wie ein spitzer Bogen vom Boden bis zum First laufen. Das ist das typischste Merkmal überhaupt.
- **Kein Schornstein.** Der Rauch zieht durch ein kleines Rauchloch oder eine Giebelöffnung oben im Stroh.
- **Kleine Fensterluken ohne Glas** mit Holzläden, eine einfache Brettertür, oft niedrig.
- **Langhaus:** Menschen und Vieh unter einem langen Dach, an einem Ende ein breites Stalltor.
- **Drumherum:** Flechtzaun aus Weidenruten (Hürden), ein Kohlgarten, ein Misthaufen, ein Holzstoß, eine Bank an der Wand.
- **In der Stadt:** normannische Steinhäuser mit Rundbogenfenstern im Obergeschoss (wie das „Jew's House“ in Lincoln). Dazu schlichte Fachwerkhäuser mit weit gesetzten, dunklen Eichenbalken ohne Zierfiguren.
- **Farben gedämpft:** Stroh, Lehm, Kalk, Eiche, Moos. Nichts Bonbonfarbenes.

**Bitte nicht:**
- keine Blumenkästen
- keine Schornsteine mit Tonaufsatz
- keine Glasfenster
- keine dekorativen Firstbalken oder Holzschnitzereien wie in den Alpen
- keine hohen, geraden Kastenwände
- keine sauberen, knalligen Farben
- kein spielzeughafter, klobiger Comic-Look

### Damit Häuser nicht „aufgesetzt“ wirken

Abweichend von Regel 1 bekommen **Gebäude einen kleinen Bodenfuß**: eine unregelmäßige Fläche aus festgetretener Erde, etwas Gras und einer Pfütze vor der Tür. Sie läuft zum Rand hin **weich ins Transparente** aus. Dazu Gras und Brennnesseln, die an den Wänden hochwachsen, Moos an der Mauerkante und Schmutz unten an den Wänden. Den weichen Schatten unter dem Haus legt das Spiel zusätzlich darunter.

Zusätzlich zum Stil-Baustein bitte diesen **Haus-Baustein** anhängen:

```
english vernacular architecture of the late 12th century, rooted in the ground, sitting on a small irregular patch of trampled earth, grass tufts and a puddle that fades softly into transparency at the edges, nettles and long grass growing against the walls, mud splashes at the wall base, weathered, mossy, muted earthy colours, low and wide proportions
```

Negativ-Prompt für Häuser ergänzen:

```
flower box, brick chimney, chimney pot, glass windows, decorative ridge beam, alpine style, bavarian style, tall straight box walls, clean bright colours, toy-like, chunky cartoon, floating, hard flat base edge
```

### Liste

Die **Grundfläche** ist in Feldern angegeben, eine Raute entspricht 1 × 1.

**Maßstab:** Bei einer Kate mit 1,2 × 1 Feldern liegt die Traufe etwa 26 Pixel (1×) über dem Boden, der First etwa 50. Die Tür ist rund 15 Pixel hoch, so hoch wie ein Mensch. Stadthäuser sind zwei- bis dreigeschossig und entsprechend höher.

| Datei | Grundfläche | 1× | Motiv |
| --- | --- | --- | --- |
| `haus/stroh_1.png` | 1.2 × 1 | 92 × 88 | small english peasant cottage with low limewashed wattle-and-daub walls, a huge thick weathered thatched hipped roof sweeping down almost to head height with deep rounded eaves, curved cruck timbers visible on the gable end, smoke hole at the top of the thatch, no chimney, small unglazed window with a wooden shutter, low plank door |
| `haus/stroh_2.png` | 1 × 1 | 84 × 84 | tiny one-room cottage of ochre cob walls with rounded corners, steep shaggy thatch with moss, smoke drifting from a gablet at the top, woodpile against the wall |
| `haus/stroh_3.png` | 2.2 × 1 | 140 × 96 | english medieval longhouse, people and cattle under one long low thatched roof, lower walls of rough rubble stone, upper walls of daub, small door for the family and a wide byre door at one end, a dung heap beside it |
| `haus/stroh_4.png` | 1 × 1 | 80 × 76 | simple cottar's hut, very low walls almost hidden under a deep round thatch, wattle hurdle fence and a small cabbage patch beside it |
| `haus/stein_1.png` | 1 × 1.2 | 88 × 104 | two-storey norman stone town house of warm limestone, round-arched romanesque window pairs on the upper floor, arched doorway below, shallow stone-slate roof, no chimney pot |
| `haus/stein_2.png` | 1.3 × 1 | 92 × 92 | east anglian cottage of knapped flint and rubble with dressed limestone corners, reed thatch roof |
| `haus/fachwerk_1.png` | 1 × 1.2 | 86 × 104 | two-storey merchant's house, plain widely spaced dark oak timber frame without decorative patterns, limewashed infill, steep oak-shingle roof, a wooden shop shutter folded down as a counter with wares on it |
| `haus/fachwerk_2.png` | 1 × 1 | 80 × 96 | narrow town house, timber frame and daub, thatched roof, a hanging sign above the door |
| `haus/holz_1.png` | 1 × 1 | 80 × 84 | saxon-style timber hall-hut, vertical split-oak plank walls, steep wooden shingle roof, smoke hole |
| `haus/holz_2.png` | 1 × 1 | 76 × 80 | timber storehouse raised on staddle stones (mushroom-shaped stones), shingle roof |
| `haus/langhalle.png` | 3.2 × 1.4 | 190 × 130 | great saxon thegn's hall, long aisled timber hall with a tall steep thatched roof, simple carved bargeboards, wide doors on the long side, smoke rising from the roof ridge |
| `haus/kirche_dorf.png` | 2 × 1 | 130 × 140 | small norman parish church of flint and rubble with a sturdy square west tower, round-headed windows, stone-slate roof, a few grave crosses beside it |
| `haus/kathedrale.png` | 3.2 × 1.4 | 200 × 210 | large norman cathedral of pale limestone, massive round arches, thick walls, a square crossing tower with a low pyramid roof, round apse |
| `haus/kloster.png` | 2.2 × 1 | 140 × 110 | cistercian monastery range of grey stone, plain round-arched windows, stone-slate roof, a small cloister walk |
| `haus/marktstand_1.png` | 0.8 × 0.6 | 56 × 60 | rough wooden market stall with a cloth awning in magenta, baskets of bread, cheese and eggs |
| `haus/marktstand_2.png` | 0.8 × 0.6 | 56 × 60 | trestle stall with a magenta awning, bolts of wool cloth and pottery |
| `haus/zelt_markt.png` | 0.9 × 0.9 | 60 × 64 | round medieval pavilion tent, canvas in magenta with cream trim, small pennant on top |
| `haus/zelt_lager.png` | 0.9 × 0.9 | 60 × 56 | low patched outlaw shelter of hides and branches, olive and brown |
| `haus/brunnen.png` | 0.6 × 0.6 | 44 × 52 | round rubble-stone village well with a small timber frame, rope and bucket |
| `haus/feuerstelle.png` | 0.5 × 0.5 | 36 × 24 | ring of stones with charred logs, no flames (the game draws the fire) |
| `haus/fass.png` | 0.3 | 20 × 24 | two wooden barrels |
| `haus/heu.png` | 0.4 | 32 × 26 | round haystack with a small thatched cap |
| `haus/holzstapel.png` | 0.5 | 36 × 24 | stacked firewood logs |
| `haus/karren.png` | 0.6 | 40 × 30 | wooden two-wheeled cart with solid wheels |
| `haus/beet.png` | 0.6 | 40 × 22 | kitchen garden bed with cabbages and leeks, wattle edge |
| `haus/misthaufen.png` | 0.5 | 34 × 22 | steaming dung heap with straw |
| `haus/kisten.png` | 0.4 | 28 × 26 | wooden crates and a sack |
| `haus/zaun_x.png` | 1 Feld | 68 × 40 | woven wattle hurdle fence segment running from upper left to lower right |
| `haus/zaun_y.png` | 1 Feld | 68 × 40 | woven wattle hurdle fence segment running from upper right to lower left |

**Neu: Bauen und Verfall.** Auf Bauplätzen am Ortsrand entstehen laufend neue Häuser, anderswo brennt eines ab und wird neu errichtet. Dafür braucht es diese Stufen, passend zur Grundfläche einer Kate (1,2 × 1). Bauleute und Rauch zeichnet das Spiel darüber.

| Datei | Grundfläche | 1× | Motiv |
| --- | --- | --- | --- |
| `haus/bauplatz.png` | 1.2 × 1 | 90 × 50 | staked-out building plot, wooden pegs and string, a small pile of timber, trampled earth |
| `haus/rohbau_1.png` | 1.2 × 1 | 90 × 70 | foundation of rubble stones and the first oak frame posts standing, timber pile beside it |
| `haus/rohbau_2.png` | 1.2 × 1 | 90 × 84 | cottage half built: oak frame complete, wattle panels half filled with daub, simple wooden scaffolding with a ladder |
| `haus/rohbau_3.png` | 1.2 × 1 | 92 × 88 | walls finished, bare roof rafters, first bundles of thatch on the lower edge, scaffolding |
| `haus/brandruine.png` | 1.2 × 1 | 90 × 60 | burnt-out cottage, blackened wall stubs, charred fallen beams, ash, a little smoke |

> Die Dateinamen haben sich geändert: Statt `ziegel_1..3` heißen die Stadthäuser jetzt `fachwerk_1..2` und `stein_1`. Rote Ziegeldächer gab es um 1194 in englischen Städten kaum.

---

## Paket 5: Burgen-Baukasten und Hafen

Burgmauern werden im Spiel aus Teilen zusammengesetzt. Jedes Mauerteil ist **genau ein Feld lang**.

**Richtungen:**
- „x“ heißt: Die Mauer läuft von **links oben nach rechts unten**.
- „y“ heißt: Sie läuft von **rechts oben nach links unten**.
- Das Tor sitzt in einer x-Mauer, die Öffnung zeigt zum Betrachter nach links unten.

Die Anschlüsse sollen nahtlos aneinanderpassen. Gleich hoch, gleiche Steine, keine Abschlüsse an den Enden.

| Datei | 1× | Motiv |
| --- | --- | --- |
| `burg/stein_mauer_x.png` | 68 × 84 | one straight segment of a medieval stone curtain wall with crenellations and a wall-walk, irregular warm grey stones, wall runs from upper left to lower right, open ends so segments tile seamlessly |
| `burg/stein_mauer_y.png` | 68 × 84 | same wall segment running from upper right to lower left |
| `burg/stein_turm.png` | 72 × 128 | round stone corner tower with crenellated top and arrow slits |
| `burg/stein_tor.png` | 80 × 120 | stone gatehouse with two round towers, open wooden gate and raised portcullis, gate opening facing the viewer to the lower left |
| `burg/bergfried.png` | 2 × 2 Felder, 140 × 210 | square norman stone keep, three storeys, flat crenellated roof, small arched windows, a flagpole with a magenta banner |
| `burg/bergfried_gross.png` | 2.5 × 2.5 Felder, 170 × 250 | massive fortress keep with four corner turrets, buttresses and a magenta banner |
| `burg/palas.png` | 2 × 1 Felder, 140 × 130 | stone great hall with tall windows and a steep slate roof |
| `burg/palisade_x.png` | 68 × 70 | wooden palisade segment of sharpened logs with a walkway behind, runs from upper left to lower right |
| `burg/palisade_y.png` | 68 × 70 | same palisade segment, runs from upper right to lower left |
| `burg/holzturm.png` | 64 × 120 | wooden watchtower on stilts, plank platform, small shingle roof, ladder |
| `burg/holztor.png` | 80 × 100 | wooden palisade gate with a covered walkway on top, gate facing lower left |
| `burg/holzhalle.png` | 2 × 1 Felder, 130 × 110 | wooden hall with shingle roof, inside a palisade |
| `burg/ruine_mauer_1.png` | 68 × 50 | crumbled stub of an old stone wall, ivy, fallen stones |
| `burg/ruine_mauer_2.png` | 68 × 40 | low ruined wall with a broken arch |
| `burg/ruine_turm.png` | 72 × 90 | ruined tower stump, broken top, ivy |
| `burg/schutt.png` | 56 × 30 | pile of rubble and fallen dressed stones |
| `burg/stadtmauer_block.png` | 68 × 92 | **neu:** one block of a town wall exactly one tile in size, crenellated on top, the same stone on all sides, so blocks can follow a curving ring |
| `burg/stadtturm.png` | 84 × 130 | **neu:** square town-wall tower, slightly wider than one tile, crenellated, arrow slits |
| `burg/stadttor.png` | 84 × 140 | **neu:** town gate tower over a road, open arch, a magenta banner on top |
| `hafen/kogge_x.png` | 150 × 140 | medieval cog ship, round wooden hull, single mast, big square sail with red and cream stripes, small castles fore and aft, ship lies along the line from upper left to lower right, calm water line, no water around it |
| `hafen/kogge_y.png` | 150 × 140 | same cog, lying along the line from upper right to lower left |
| `hafen/boot.png` | 60 × 40 | small wooden fishing boat with nets |
| `hafen/steg_x.png` | 68 × 40 | wooden pier segment on posts, runs from upper left to lower right |
| `hafen/steg_y.png` | 68 × 40 | same pier, runs from upper right to lower left |
| `hafen/kran.png` | 60 × 110 | medieval wooden treadwheel harbour crane |

---

## Paket 6: Deine eigene Burg im Ausbau

Die Burg wächst in vier Stufen: Ruine, Holzburg, Steinburg, Festung. Die Mauern dafür kommen aus Paket 5. Hier folgen die neun Gebäude in je drei Stufen. Stufe 1 ist einfach und aus Holz, Stufe 2 solide, Stufe 3 prächtig aus Stein. Jede Stufe soll man auf einen Blick unterscheiden können.

Für alle Gebäude hier gelten der Haus-Baustein und die englischen Regeln aus Paket 4, mit Bodenfuß. Arbeiter, Funken, Rauch und Pferde zeichnet das Spiel darüber. Bitte **keine Menschen und Tiere** in diese Bilder malen.

| Datei | Grundfläche | Stufe 1 | Stufe 2 | Stufe 3 |
| --- | --- | --- | --- | --- |
| `eigen/rittersaal_1..3.png` | 1.5 × 3 | wooden hall with thatch | timber hall on stone base, shingle roof, banner | stone great hall, tall windows, two magenta banners |
| `eigen/unterkunft_1..3.png` | 2.6 × 1.2 | two tents and a lean-to | wooden barracks | stone barracks with tile roof and weapon racks |
| `eigen/schmiede_1..3.png` | 1.4 × 1.2 | open forge shed, anvil under roof | timber smithy with chimney | stone smithy, two chimneys, big bellows |
| `eigen/stall_1..3.png` | 1.2 × 2.4 | simple open horse shelter | wooden stable with hay loft | long stone stable with tile roof |
| `eigen/holzfaeller_1..3.png` | 1.2 × 1 | woodcutter's hut with chopping block | hut and saw pit | two huts, saw pit, big log piles |
| `eigen/steinbruch_1..3.png` | 2 × 1.6 | small rocky outcrop with tools | open quarry pit with cut blocks | deep quarry with wooden crane and ramps |
| `eigen/markt_1..3.png` | 2.8 × 2.4 | two stalls on a trampled square | four stalls and a well | paved market square, market cross, covered market hall |
| `eigen/kapelle_1..3.png` | 2.6 × 1.3 | wooden wayside cross with a tiny roof | small wooden chapel | stone chapel with bell tower |
| `eigen/wachturm_1..3.png` | 1 × 1 | wooden lookout platform | wooden tower with roof | tall round stone tower with crenellations |
| `eigen/hospiz_1..3.png` | 2 × 2.4 | **neu:** herb garden and a small timber infirmary | timber hospice with beds under a long roof, herb beds | stone hospital with a chapel end and a cloister garden |
| `eigen/schafzucht_1..3.png` | 3 × 2.6 | **neu:** wattle sheep pen and a lean-to | pen, sheepfold barn and wool bales | large stone sheepfold, shearing shed, stacked wool bales |
| `eigen/felder_1..3.png` | 1.8 × 1.6 | **neu:** small field barn | tithe barn of timber with a thatched roof | big stone tithe barn and a wooden post windmill |
| `eigen/baustelle_klein.png` | 1 × 1 | wooden scaffolding around a half-built wall, stacked timber, ropes, a ladder | | |
| `eigen/baustelle_mittel.png` | 2 × 1.5 | larger building site, scaffolding, half-built stone walls, wooden crane | | |
| `eigen/baustelle_gross.png` | 3 × 2 | big building site for a keep, scaffolding on several levels, treadwheel crane, material piles | | |
| `eigen/bauplatz_schild.png` | 0.3 | small wooden sign post with a blank hanging board (the game paints the icon on it) | | |
| `eigen/materialhaufen.png` | 0.6 | pile of cut stones, planks and a few barrels | | |

1×-Größe: etwa 64 Pixel Breite je Feld Grundfläche, die Höhe nach Bedarf.

---

## Paket 7: Figuren

Alle Menschen kommen als **Bogen** (Sprite-Sheet) mit festem Raster:
- **8 Spalten**, von links nach rechts:
  1. Stehen
  2. bis 5. Gehen (4 Phasen eines Schritts)
  6. Angriff ausholen
  7. Angriff (Schlag, Stoß oder Schuss)
  8. Am Boden liegend (besiegt)
- **2 Zeilen:**
  - Zeile 1: Die Figur geht **schräg auf den Betrachter zu, nach links unten**.
  - Zeile 2: Sie geht **schräg vom Betrachter weg, nach rechts oben** (Rücken zu sehen).
  - Die übrigen Richtungen erzeugt das Spiel daraus.
- **Zellgröße (neu, kleinerer Maßstab):**
  - Zu Fuß 1× 24 × 24, die Figur ist etwa 15 Pixel hoch. Lieferung 8×, also 192 × 192 je Zelle und **1536 × 384** je Bogen. Die Figur füllt etwa zwei Drittel der Zellhöhe.
  - Beritten 1× 40 × 34, Lieferung 8×, also 320 × 272 je Zelle und **2560 × 544** je Bogen.
- Die Füße stehen in jeder Zelle auf derselben Höhe, der Fußpunkt liegt mittig im unteren Fünftel.
- Gleiche Figur, gleiche Farben und gleiche Größe in allen Zellen.

**Stil:** Die Figuren sollen rund und freundlich wirken: etwas größerer Kopf, weiche Formen, gut lesbar auf kleiner Größe. Bitte nicht spitz und nicht kantig.

Für die Figuren gilt ein eigener Baustein, **vor das Motiv** gesetzt:

```
hand-painted isometric character sprite sheet, 8 columns and 2 rows on a strict grid, same character in every cell, row 1 walking diagonally toward the viewer to the lower left, row 2 walking diagonally away to the upper right showing the back, columns: idle, walk 1, walk 2, walk 3, walk 4, attack windup, attack strike, lying defeated on the ground, cute slightly chunky proportions, soft rounded shapes, painterly, thin soft outlines, light from upper left, no cast shadow, no ground, transparent background, medieval 1194
```

Falls Oakgen keine sauberen Bögen schafft, reichen auch Einzelbilder, etwa `ritter_vorn_gehen2.png`. Das Minimum je Figur: Stehen, Gehen in 2 Phasen, Angriff und Liegend, jeweils von vorn. Die Rückansicht ergänze ich dann aus der Vorderansicht.

**Dein Ritter und dein Gefolge** (Wappenfarbe in Magenta):

| Datei | Motiv |
| --- | --- |
| `figuren/ritter.png` | knight in chainmail with a magenta surcoat, simple helmet, sword and kite shield with a magenta field |
| `figuren/ritterin.png` | female knight, same armour, long braid, magenta surcoat, sword and shield |
| `figuren/ritter_beritten.png` | the same knight riding a brown warhorse with a magenta caparison, lance upright, couched lance in the attack frames |
| `figuren/ritterin_beritten.png` | the female knight riding a grey warhorse with a magenta caparison |
| `figuren/knecht.png` | man-at-arms in a padded gambeson with magenta tabard, spear and round shield |
| `figuren/reisiger.png` | mounted-style soldier on foot, leather jerkin with magenta sash, short sword and round shield |
| `figuren/schuetze.png` | archer with a short bow, gambeson with magenta hood |
| `figuren/langbogen.png` | longbowman, tall yew longbow, leather jerkin, magenta hood |
| `figuren/armbrust.png` | crossbowman, crossbow, padded coat with magenta tabard, steel cap |
| `figuren/bauernbursche.png` | farm lad with a wooden club, simple tunic with magenta patch |

**Gegner und Leute im Land:**

| Datei | Motiv |
| --- | --- |
| `figuren/wegelagerer.png` | ragged highway robber, brown hood, wooden club |
| `figuren/wilddieb.png` | poacher, green-brown hood, short bow |
| `figuren/bandenfuehrer.png` | bandit leader, leather armour, short sword, wooden shield |
| `figuren/raubritter_beritten.png` | robber knight on a black horse, blackened chainmail, dark surcoat with red trim, long sword |
| `figuren/soeldner.png` | mercenary with a battle axe, leather armour, scarred |
| `figuren/soldat.png` | soldier in chainmail, spear, long kite shield, magenta surcoat (the game colours it red for the Normans, blue for the French) |
| `figuren/armbrust_soldat.png` | soldier with crossbow, gambeson, magenta surcoat |
| `figuren/chevalier_beritten.png` | french knight on a horse, chainmail, magenta surcoat and caparison, long sword |
| `figuren/steuereintreiber_beritten.png` | fat tax collector on a horse, rich dark-red robe, money chest on the saddle |
| `figuren/haendler_beritten.png` | merchant on a horse with saddle bags, blue cloak, fur hat |
| `figuren/wache.png` | hired caravan guard, gambeson, spear, round shield |
| `figuren/waldmann.png` | outlaw of the forest in green, longbow, hood |
| `figuren/bauer.png` | peasant man in a brown tunic, straw hat, carrying a hoe |
| `figuren/baeuerin.png` | peasant woman, long dress, headscarf, basket |
| `figuren/moench.png` | monk in a brown habit with a rope belt, hood |
| `figuren/kind.png` | village child, simple tunic (only idle and walking needed) |

**Neu: weitere Leute im Land.** Für sie gilt ein **Alltags-Bogen** mit 8 Spalten: Stehen, Gehen 1 bis 4, Arbeiten 1 und 2 (die Bewegung ihrer Arbeit), Sitzen. Zwei Zeilen wie oben. Das Werkzeug der Arbeit bitte mitmalen.

| Datei | Motiv |
| --- | --- |
| `figuren/jaeger.png` | hunter in green-brown, hood, longbow; work frames: crouching and drawing the bow |
| `figuren/fischer.png` | fisherman with a wide hat, rod; work frames: casting and waiting |
| `figuren/bergmann.png` | miner in a dark hooded tunic and leather apron, pickaxe; work frames: swinging the pick |
| `figuren/bettler.png` | ragged beggar in a patched grey tunic, wooden bowl, some with a crutch; work frames: sitting and holding out the bowl |
| `figuren/einsiedler.png` | old hermit with a long white beard, brown robe, walking staff; work frames: kneeling in prayer |
| `figuren/pilger.png` | pilgrim with a wide-brimmed hat, a scallop shell, tall staff and a satchel |
| `figuren/reisender.png` | traveller in a hooded cloak with a bundle on a stick |
| `figuren/priester.png` | priest in a black cassock with a wooden cross; work frames: blessing |
| `figuren/wirt.png` | innkeeper with a white apron and a jug of ale |
| `figuren/hirte.png` | shepherd with a crook and a straw hat |
| `figuren/magd.png` | maid with a headscarf and a wooden bucket |
| `figuren/handwerker.png` | craftsman with a leather apron and a hammer |
| `figuren/buerger.png`, `figuren/buergerin.png` | townsfolk in coloured wool clothes, plain and tidy |
| `figuren/haendler.png` | market trader on foot in a coloured tunic and a cap; work frames: calling out and waving |
| `figuren/henker.png` | executioner in a black hood and dark tunic |
| `figuren/turnierritter_beritten.png` | tournament knight on a warhorse with a magenta caparison, lance with a magenta pennant; attack frames: lance couched forward |

**Neu: Lasten zum Auflegen.** Was die Leute tragen, legt das Spiel als kleines Bild auf den Rücken oder in die Hand. Einzelbilder, 1× 16 × 16, Lieferung 8×, Baustein aus Paket 9:
`last_reisig`, `last_holz`, `last_balken`, `last_sack`, `last_korb`, `last_eimer`, `last_erz`, `last_wild` (deer over the shoulders), `last_hase`, `last_fisch`, `last_heu`, `last_bahre` (stretcher with a shrouded body), `last_kreuz` (processional cross), jeweils als `figuren/<name>.png`.

---

## Paket 8: Tiere

Bögen wie bei den Figuren, aber mit **6 Spalten**:
1. Stehen
2. und 3. Gehen
4. Grasen oder Picken
5. Rennen (nur Hirsch und Pferd, sonst wie Gehen)
6. Erlegt am Boden

Dazu 2 Zeilen wie bei den Figuren.

| Datei | Zelle 1× | Motiv |
| --- | --- | --- |
| `tiere/schaf.png` | 20 × 17 | fluffy cream sheep, black face |
| `tiere/kuh.png` | 27 × 22 | brown and white cow |
| `tiere/huhn.png` | 11 × 11 | small brown hen |
| `tiere/hirsch.png` | 27 × 27 | red deer stag with antlers |
| `tiere/ente.png` | 12 × 10 | mallard duck swimming (no water drawn) |
| `tiere/pferd.png` | 34 × 29 | riderless chestnut horse with saddle |

Neuer Maßstab: Die Zellen sind kleiner als in der ersten Fassung, dafür bitte **8×** liefern (Schaf also 160 × 136 je Zelle).

---

## Paket 9: Symbole und Porträts

Hier gilt ein eigener Baustein:

```
hand-painted game icon, front view, soft rounded shapes, painterly, thin soft outline, centered, transparent background, gentle light from upper left, readable at small size, medieval
```

Größe 1× 64 × 64, Lieferung 256 × 256.

**Waren** (`icons/ware_<name>.png`):

| Name | Motiv |
| --- | --- |
| getreide | sheaf of wheat |
| holz | logs |
| stein | cut stone blocks |
| eisen | iron bars |
| wolle | bundle of raw wool |
| bier | wooden tankard of ale |
| salz | sack of salt |
| wein | wine barrel with a jug |
| fleisch | joint of meat |
| felle | stack of furs |
| blei | **neu:** grey lead ingots |
| zinn | **neu:** small shining tin ingots |
| silber | **neu:** silver ingot and a few coins |

**Ausrüstung** (`icons/item_<name>.png`):

| Gruppe | Namen |
| --- | --- |
| Waffen | knueppel, kurzschwert, speer, kurzbogen, langschwert, streitaxt, langbogen, armbrust, ritterschwert, kriegshammer, eibenbogen |
| Rüstungen | gambeson, lederwams, kettenhemd, schuppenpanzer, kettenruestung |
| Schilde | holzschild, rundschild, drachenschild (normannischer Langschild), wappenschild (mit Magenta-Feld) |
| Pferde | klepper (shaggy pony), zelter (elegant palfrey), schlachtross (armoured warhorse) |

**Leiste oben** (`icons/hud_<name>.png`): gold (Münzen), ruhm (Stern), leben (Herz), gefolge (Schild), ladung (Sack).

**Gebäude** (`icons/bau_<name>.png`):

| Name | Motiv |
| --- | --- |
| halle | Krone |
| kaserne | gekreuzte Schwerter |
| schmiede | Amboss |
| stall | Hufeisen |
| holzfaeller | Axt |
| steinbruch | Spitzhacke |
| markt | Münze |
| kapelle | Kreuz |
| wehr | Turm |
| hospiz | **neu:** Kräuterbund |
| schafzucht | **neu:** Schaf |
| felder | **neu:** Ähre |

**Fraktionswappen** (`icons/wappen_<name>.png`), als Wappenschild:

| Name | Wappen |
| --- | --- |
| sachsen | weißer Drache auf Grün |
| normannen | zwei goldene Löwen auf Rot |
| kirche | goldenes Kreuz auf Weiß |
| gilde | Waage und Wollsack auf Lila |
| waldleute | Eichenblatt und Pfeil auf Braungrün |
| franken | goldene Lilien auf Blau |

**Porträts** (für Startmenü und Gefolge-Tafel), 1× 128 × 160, Lieferung 512 × 640. Brustbild mit leichtem Dreiviertel-Profil, Waffenrock in Magenta, gemalter Hintergrund in warmem, unscharfem Braun:

| Datei | Motiv |
| --- | --- |
| `portraits/ritter.png` | Ritter |
| `portraits/ritterin.png` | Ritterin |
| `portraits/knecht.png`, `schuetze.png`, `langbogen.png`, `armbrust.png`, `reisiger.png`, `bauernbursche.png` | je eines für die Gefolge-Klassen |

**Oberflächen** (nahtlos, Baustein aus Paket 2), Lieferung 1024 × 1024:
- `ui/pergament.png`: Pergament
- `ui/eiche.png`: dunkles Eichenholz für die Leisten

---

## Paket 10: Musik (optional)

Falls Oakgen auch Musik kann. Bitte als OGG oder MP3 mit 160 kbit/s, nahtlos wiederholbar (Anfang und Ende passen zusammen).

**Grundton:** mittelalterlich, warm, episch, aber nicht bombastisch, in Moll und dorischer Tonart.

**Instrumente:** Laute, Blockflöte, Drehleier, Fiedel, Rahmentrommel, Naturhorn und ein leiser Chor. Keine bekannten Melodien nachspielen.

| Datei | Länge | Stimmung |
| --- | --- | --- |
| `musik/titel.ogg` | 1,5 bis 2 min | episches Titelthema, langsamer Aufbau, Hörner und Chor |
| `musik/reise.ogg` | 2 bis 3 min | Reisemusik am Tag, Dreiertakt, Laute und Flöte, leicht und hoffnungsvoll |
| `musik/nacht.ogg` | 2 min | ruhig, Drehleier und Flöte, viel Hall |
| `musik/kampf.ogg` | 1 min | treibende Trommeln, Fiedel, Hörner |
| `musik/sieg.ogg` | 5 s | kurze Fanfare |
| `musik/niederlage.ogg` | 5 s | kurzes, trauriges Motiv |
| `musik/bau_fertig.ogg` | 3 s | festliches Glockenspiel |

---

## Paket 11 (neu): Wahrzeichen

Große, bekannte Bauten der Zeit um 1194. Stil-Baustein wie immer, **ohne** Haus-Baustein, aber mit Bodenfuß. Die Bauten sind echt. Bitte so malen, wie sie um 1194 aussahen: romanisch, mit Rundbögen, viele Kathedralen noch im Bau. Keine späteren gotischen Spitzbogenfassaden.

| Datei | Grundfläche | 1× | Motiv |
| --- | --- | --- | --- |
| `wahrzeichen/kathedrale_tuerme.png` | 5.5 × 3.6 | 300 × 250 | large romanesque cathedral of pale limestone, two square west towers with low pyramid roofs, long nave with round-arched windows and buttresses, transepts, a massive square crossing tower with battlements, round apse at the east end, slate roofs |
| `wahrzeichen/kathedrale_spitze.png` | 6 × 3.6 | 300 × 320 | romanesque cathedral with a tall slender timber spire on the crossing tower, long nave, transepts, round apse |
| `wahrzeichen/kathedrale_bau.png` | 5.5 × 3.6 | 310 × 280 | cathedral under construction: east end finished, nave walls half built, wooden scaffolding, a treadwheel crane, stacked stone blocks |
| `wahrzeichen/kathedrale_ruine.png` | 5.5 × 3.6 | 300 × 220 | cathedral recently gutted by fire: roof gone, blackened walls and window arches, charred beams, scaffolding at one end |
| `wahrzeichen/abtei_fels.png` | 4.5 × 3.5 | 260 × 300 | small abbey church and monastery buildings crowded on top of a steep rocky island hill, a few houses clinging to the slope |
| `wahrzeichen/tower_weiss.png` | 3.7 × 3.4 | 230 × 210 | great square norman keep of whitewashed stone with four corner turrets, inside a low curtain wall with a gate, a magenta banner on top |
| `wahrzeichen/tower_grau.png` | 3.7 × 3.4 | 230 × 210 | the same kind of keep in grey stone, a flemish count's castle |
| `wahrzeichen/motte.png` | 3.2 × 3.2 | 205 × 200 | motte-and-bailey castle: a steep grassy earth mound with a wooden keep and palisade on top, a wooden stair up the mound |
| `wahrzeichen/rundturm.png` | 2.6 × 2.6 | 170 × 200 | massive round stone keep under construction inside a square curtain wall, scaffolding on the top storey |
| `wahrzeichen/tuchhalle.png` | 3.4 × 1.8 | 170 × 150 | long stone cloth hall with arcades on the ground floor, a steep tiled roof, market stalls in front |
| `wahrzeichen/tuchhalle_belfried.png` | 3.4 × 1.8 | 170 × 260 | the same cloth hall with a tall square belfry tower in the middle |
| `wahrzeichen/stonehenge.png` | 3.6 × 3.6 | 230 × 130 | ancient circle of huge grey sarsen stones with lintels, some fallen, inner horseshoe of trilithons, grassy ground patch |
| `wahrzeichen/tor.png` | 5.5 × 5.5 | 350 × 260 | steep green conical hill with terraced sides and a small stone chapel tower on the summit |
| `wahrzeichen/wall_x.png` | 1 Feld | 68 × 60 | segment of an ancient roman frontier wall, crumbled top, grass and moss, runs from upper left to lower right (dazu `wall_y.png` in der anderen Richtung) |

---

## Paket 12 (neu): Mystische Orte, Gruben, Lagerfeuer, Galgen, Friedhof

Stil-Baustein, Haus-Baustein bei Hütten, Bodenfuß überall außer bei den kleinen Dingen. **Keine Menschen** in die Bilder malen, die zeichnet das Spiel.

**Mystische Orte der Einsiedler.** Sie sollen still, alt und ein wenig geheimnisvoll wirken: Moos, Flechten, Nebelfetzen am Boden, warmes Licht in der Klause. Kein Fantasy-Glühen, keine Runen, keine Magie.

| Datei | Grundfläche | 1× | Motiv |
| --- | --- | --- | --- |
| `mystisch/klause.png` | 1.2 × 1.2 | 80 × 76 | tiny round hermit's hut of rough stone with a conical thatched roof, low wooden door, a small wooden cross by the door, smoke hole |
| `mystisch/quelle.png` | 1.2 × 1 | 72 × 52 | holy spring: a small stone basin with clear water among mossy stones, a simple wooden cross, ferns |
| `mystisch/steinkreis.png` | 2.4 × 2.2 | 150 × 100 | small circle of nine weathered standing stones with lichen, a flat altar stone in the middle |
| `mystisch/huegelgrab.png` | 2.2 × 2 | 140 × 80 | long grassy burial mound with a dark entrance framed by huge upright stones and a capstone |
| `mystisch/hoehle.png` | 2 × 1.4 | 110 × 84 | sandstone rock face with a dark cave mouth, a cross carved into the rock, ivy |
| `mystisch/eibe.png` | 1.5 × 1.5 | 100 × 110 | ancient gnarled yew tree with a hollow trunk, coloured cloth ribbons tied to the branches, a small stone shrine at its foot |

**Erzgruben.** Bergbau um 1194: kleine Stollen im Hang, Handarbeit, Holz und Stein.

| Datei | Grundfläche | 1× | Motiv |
| --- | --- | --- | --- |
| `grube/stollen.png` | 2.4 × 1.5 | 130 × 92 | mine entrance: a rocky hillside outcrop with grass on top and a timber-framed adit portal leading into darkness, plank track coming out |
| `grube/halde.png` | 2.2 × 1.8 | 130 × 70 | spoil heap of grey-brown waste rock and slag |
| `grube/erz_eisen.png` | 0.6 | 40 × 26 | pile of rusty red-brown iron ore |
| `grube/erz_blei.png` | 0.6 | 40 × 26 | pile of grey lead ore (galena) with a metallic sheen |
| `grube/erz_zinn.png` | 0.6 | 40 × 26 | pile of dark tin ore and washed grey gravel |
| `grube/erz_silber.png` | 0.6 | 40 × 26 | pile of grey ore with bright silvery glints |
| `grube/meiler.png` | 1.2 | 76 × 42 | charcoal clamp: a dome of stacked wood covered with earth and turf, thin smoke |
| `grube/hunt.png` | 0.6 | 40 × 30 | small wooden mine cart on plank rails, loaded with ore |

**Lagerfeuer.** Köhler, Jäger, Hirten und Pilger rasten an Waldrändern. Das Feuer selbst zeichnet das Spiel.

| Datei | Grundfläche | 1× | Motiv |
| --- | --- | --- | --- |
| `lager/sitzstamm.png` | 0.8 | 50 × 22 | fallen log used as a bench |
| `lager/unterstand.png` | 1 × 1 | 64 × 50 | lean-to shelter of branches and hides |
| `lager/wildbret.png` | 0.5 | 30 × 40 | wooden tripod with a deer carcass hanging from it |
| `lager/kessel.png` | 0.4 | 26 × 30 | iron cooking pot hanging from a tripod (no fire, the game draws it) |

**Galgen und Friedhof.** Der Galgen bitte **leer**, mit Strick. Den Rest zeichnet das Spiel.

| Datei | Grundfläche | 1× | Motiv |
| --- | --- | --- | --- |
| `recht/galgen.png` | 1.2 × 0.9 | 70 × 76 | wooden gallows: two posts, a crossbeam with an empty noose, a small plank platform with steps |
| `friedhof/grab_1.png`, `grab_2.png`, `grab_3.png` | 0.3 | 22 × 22 | grave mound with a small wooden cross (dazu zwei Varianten: grave slab, small stone cross) |
| `friedhof/zaun.png` | 1 Feld | 68 × 30 | low wattle churchyard fence segment, runs from upper left to lower right |

---

## Paket 13 (neu): Turnier

Vor einer Stadt oder Burg wird ein Turnierplatz aufgebaut. Die Farben der Ritter und des Gastgebers bitte in **Magenta**, das Spiel färbt um.

| Datei | Grundfläche | 1× | Motiv |
| --- | --- | --- | --- |
| `turnier/schranke.png` | 1 Feld | 68 × 34 | one segment of a jousting tilt barrier: low wooden fence with a draped cloth in magenta and cream stripes, runs from upper left to lower right, open ends so segments join |
| `turnier/tribuene.png` | 7.2 × 1.5 | 280 × 190 | long wooden spectator stand with three tiers, a raised central box under a striped magenta canopy, banners; seated spectators painted in, small and simple |
| `turnier/pavillon.png` | 1 × 1 | 70 × 82 | round knight's pavilion tent with magenta and cream stripes, scalloped edge, pennant on top |
| `turnier/bannerstange.png` | 0.2 | 24 × 64 | tall pole with a long magenta banner |

---

## 4. Lieferung

**Ordner:** alles unter `assets/` mit diesen Unterordnern:
`titel`, `boden`, `natur`, `haus`, `burg`, `hafen`, `eigen`, `figuren`, `tiere`, `icons`, `portraits`, `ui`, `musik`, und neu `wahrzeichen`, `mystisch`, `grube`, `lager`, `recht`, `friedhof`, `turnier`

**Übergabe:**
- Hier im Chat anhängen oder direkt in den Ordner legen.
- Gern paketweise, Hauptsache mit den Dateinamen aus diesem Brief.

**Umfang:** Im Spiel verkleinere und komprimiere ich alles. Die Online-Fassung soll trotzdem schnell laden. Gib mir also lieber zu große als zu kleine Bilder, aber keine über 4096 Pixel.

**Was ich damit mache:**
- Ein Lader nimmt jedes vorhandene Bild und fällt sonst auf die heutige Grafik zurück.
- Magenta wird in die Wappen- und Fraktionsfarben umgefärbt.
- Bodentexturen werden auf die schrägen Rauten und Hügel gelegt.
- Die Mauerteile werden zu den Burgringen zusammengesetzt.
- Fußpunkte und Größen gleiche ich pro Bild ab.

**Was das Spiel weiterhin selbst zeichnet** (bitte nicht mitmalen):
- Feuer, Rauch, Licht bei Nacht, Glühwürmchen
- Regen, Schneefall und die Schneeflecken im Übergang
- Schlagschatten unter allen Dingen
- Brandspuren und Löcher bei beschädigten Häusern, Gerüste bei Reparaturen
- Lanzensplitter, Staubwolken, Sprechblasen, Schadenszahlen
