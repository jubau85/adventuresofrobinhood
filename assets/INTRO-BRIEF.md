# Intro-Brief: A Knight's Tale

Dieser Brief beschreibt Bilder, Video und Musik für den Vorspann. Du kannst sie mit Oakgen erzeugen; ich baue sie danach ein.

Das Spiel hat den Vorspann schon jetzt vollständig, im Code gemalt und vertont:

1. **Studio-Vorspann (etwa 9,5 s)**
   - „KUKI & KARMEN“ in Goldschrift, darunter „PRODUCTIONS“.
   - Das Siegel „100% AI“ fällt wie ein Stempel.
   - „Made by Jakob“ wird wie mit der Feder geschrieben.
   - Dazu Glut, Rauch, Lichtstrahlen und eine Fanfare mit Pauken und Chor.
2. **Vorgeschichte im Stil der Amiga-Spiele der 90er**
   - Sechs Bilder mit 320 × 200 Bildpunkten, je 32 Farben mit Raster-Dithering.
   - Der Text erscheint wie auf der Schreibmaschine.
   - Dazu Tracker-Musik aus 8-Bit-Samples.
3. **Schluss:** Das Titelbild erscheint erst als Pixelbild und wird dann zum gemalten Titelbild.

**Stand (27.11.2026):**
- Paket 1 (Bilder) und Paket 3, Fanfare, sind geliefert und eingebaut: `assets/intro/geschichte_1.webp` bis `geschichte_6.webp` (aufbereitet mit `tools/intro_bilder.py`) und `assets/intro/studio.mp3`.
- Die Zeitmarken der Fanfare sind gemessen: Schlag 1,5 s, Stempel 3,7 s, Höhepunkt ab 4,5 s, Schlusshit 8,4 s. Die Schrift liegt darauf.
- Offen ist noch `geschichte.mp3` (Paket 2). Bis dahin spielt die Tracker-Musik aus dem Code.
- Das Hintergrundvideo ist bewusst weggelassen.

Alles aus diesem Brief ist **freiwillig**. Jede Datei, die kommt, ersetzt den passenden Teil, und der Rest bleibt, wie er ist.

**Eigenständig bleiben:** keine Logos, Figuren, Bilder oder Melodien aus bestehenden Spielen nachbauen. Der Stil der Zeit ist gewollt, eine Kopie nicht.

---

## Paket 1: Studio-Vorspann

### 1a) Hintergrundvideo ohne Schrift (empfohlen)

KI-Videos schreiben Text fast nie fehlerfrei. Deshalb bleibt die Schrift im Spiel, und das Video liefert nur den Hintergrund dahinter.

- **Datei:** `assets/intro/studio_hintergrund.mp4`
- **Format:** 1920 × 1080, 24 oder 30 Bilder je Sekunde, H.264, 10 Sekunden, ohne Ton, höchstens 15 MB
- **Bildaufbau:** In der Mitte bleibt eine ruhige, dunkle Fläche für den Schriftzug.
- **Ablauf:**
  - ab 1,4 s ein heller Lichtblitz in der Bildmitte,
  - danach glühendes Gold und aufsteigende Funken,
  - ab 8,2 s langsam ins Schwarze.

Prompt:

```
cinematic dark background for a film studio logo, slow drifting smoke lit warm amber from below, glowing embers and golden sparks rising, molten gold light rays from the center, a bright anamorphic lens flare flash in the exact center at 1.4 seconds, then soft volumetric god rays slowly rotating and pulsing to a drum beat, deep black edges with vignette, elegant and epic, medieval fantasy mood, calm empty center area for a title, no text, no letters, no logo, fades to black at the end, 10 seconds
```

Negativ-Prompt:

```
text, letters, words, logo, watermark, signature, faces, people, frame, border, modern objects, sci-fi, blue neon
```

### 1b) Studio-Fanfare (Musik und Klang)

- **Datei:** `assets/intro/studio.mp3`
- **Format:** 9,5 bis 10 Sekunden, 44,1 kHz, 192 kbit/s
- **Ablauf:** Er sollte zu diesen Zeitmarken passen, weil die Schrift darauf abgestimmt ist:

| Zeit | Ereignis |
|---|---|
| 0,0 s | tiefer Donner |
| 0,2 bis 1,4 s | Becken schwillt rückwärts an |
| 1,4 s | großer Orchesterschlag: Pauke, Blech, Chor (d-Moll) |
| 2,4 s | B-Dur |
| 3,8 s | dumpfer Stempelschlag mit Metallklang, C-Dur |
| 4,3 bis 4,8 s | Paukenwirbel |
| 4,8 s | Höhepunkt in D-Dur mit Glockenspiel |
| 4,8 bis 7,6 s | Kriegstrommel-Groove |
| 7,6 s | letzter großer Schlag |
| bis 9,5 s | Ausklang mit langem Hall |

Prompt:

```
epic aggressive cinematic film studio logo sting, 10 seconds, orchestral, choir and pounding war drums: deep thunder rumble at the start, reverse cymbal swell rising into a massive orchestral hit at 1.4 seconds with taiko drums, timpani, brass and wordless choir in D minor, brass chord change to B flat major at 2.4 seconds, heavy stamp-like impact with a metallic clang at 3.8 seconds on C major, drum roll into a triumphant D major climax at 4.8 seconds with full choir, glockenspiel sparkles and a driving war drum groove until 7.6 seconds, one final hit, long reverb tail fading out by 9.5 seconds, medieval heroic mood, no lyrics
```

Kann Oakgen die Zeitmarken nicht genau treffen, schreib mir die Sekunden von Schlag, Stempel und Höhepunkt. Dann richte ich die Schrift nach der Musik.

---

## Paket 2: Bilder der Vorgeschichte (6 Stück)

- **Dateien:** `assets/intro/geschichte_1.png` bis `geschichte_6.png`
- **Format:** Querformat 21:9, zum Beispiel 2016 × 864, PNG
- **Zuschnitt:** Ich schneide auf das Bildfeld 300 : 124 zu. Wichtiges also nicht an den Rand legen.
- **Farben:** Das Spiel rechnet jedes Bild selbst auf 32 Farben mit Raster-Dithering herunter, wie auf dem Amiga. Gemalte Bilder werden dadurch automatisch zu Pixelbildern. Am echtesten wirkt es, wenn das Bild schon als Pixel-Art angelegt ist.

Stil, an jeden Prompt anhängen:

```
16-bit pixel art in the style of early 1990s Amiga adventure game cutscenes, low resolution look, limited palette of about 32 colors, ordered dithering in sky gradients, hand-painted pixel shading, strong silhouettes, cinematic wide composition, no text
```

Negativ-Prompt für alle:

```
text, letters, caption, watermark, logo, signature, frame, border, UI, modern objects, photo, 3D render, blurry, anime
```

| Datei | Text im Spiel | Prompt (vor den Stil) |
|---|---|---|
| `geschichte_1.png` | König Richard in Gefangenschaft | `night, a small stone castle with a tall keep on a steep rocky crag above a wide river, full moon with a soft halo, many stars, a single lit window high in the keep, moonlight reflection on the water, deep blue and violet palette` |
| `geschichte_2.png` | Johann greift nach der Krone | `a golden medieval crown with red, blue and green jewels on a red velvet cushion, two tall candles on golden stands, red banners with gold trim hanging in a dark stone hall, warm candlelight, faint light rays from above` |
| `geschichte_3.png` | Johanns Banner über den Burgen, die Sachsen murren | `sunrise with a red and orange sky, a large Norman stone castle on a hill flying red banners, below in the foreground a small Saxon village of thatched huts with smoke rising from the roofs, dark silhouettes` |
| `geschichte_4.png` | Geächtete in den Wäldern | `night in a dense old forest, hooded outlaws sitting around a crackling campfire, one archer standing with a longbow and quiver, warm firelight on the tree trunks, sparks rising, deep green darkness` |
| `geschichte_5.png` | Heimkehr aus dem Heiligen Land | `dawn on the sea, a single medieval cog ship with a white square sail bearing a red cross, approaching white chalk cliffs, seagulls, the sun low on the horizon with a glittering path on the water, pink and lilac clouds` |
| `geschichte_6.png` | Der verfallene Burgstall | `dusk, the ruins of a small castle on a hill, a broken tower with an empty window against a purple and orange sky, crows circling the tower, in the foreground a lone knight on horseback in silhouette with a lance, looking at the ruin` |

Die Farbzyklen bleiben auch auf deinen Bildern: funkelnde Sterne, Mondglitzern, flackernde Kerzen, Rauch, Feuerfunken, Möwen und Krähen. Ich setze sie an die passenden Stellen deiner Bilder.

---

## Paket 3: Musik der Vorgeschichte

- **Datei:** `assets/intro/geschichte.mp3`
- **Format:** 90 bis 120 Sekunden, nahtlos wiederholbar (Anfang und Ende passen zusammen), 44,1 kHz, 192 kbit/s
- **Klang:** wie ein Amiga-Tracker-Stück (vier Kanäle, 8-Bit-Samples, Stereo hart links und rechts), episch und aggressiv mit vielen Trommeln, wie die Fassung im Spiel

Prompt:

```
1990s Amiga game soundtrack in ProTracker MOD style, crunchy 8-bit samples, hard left and right stereo panning, epic and aggressive medieval battle theme in D minor at 110 BPM, pounding taiko war drums, tom fills, hard snare and punchy kick, galloping bass and string ostinato, brass stabs, wordless choir, flute-like lead melody with vibrato, harp arpeggios, builds from a war drum march to a full storm, 100 seconds, seamless loop, no vocals
```

---

## Abgabe

- Lege die Dateien in `assets/intro/` oder hänge sie hier im Chat an, gern als Zip.
- Fehlt etwas, bleibt dieser Teil wie bisher im Code.
- Gefällt dir ein Ergebnis nur halb, schick es trotzdem mit einem Satz dazu. Oft lässt es sich im Spiel noch anpassen, etwa durch Zuschnitt, Farben oder Lautstärke.
