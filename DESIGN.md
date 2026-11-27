# Design: A Knight's Tale

## Idee

Ein isometrisches Rollenspiel mit lebendiger Welt im Geist der Abenteuerspiele der frühen 90er. Größer und politischer angelegt, näher an *Ivanhoe* als an der Räuberromantik. Der Spieler ist ein enterbter Ritter, der 1194 vom Kreuzzug heimkehrt. Er macht aus einer Burgruine den Mittelpunkt seiner Macht und muss sich zwischen den Parteien in England und Frankreich entscheiden.

## Säulen

1. **Die Burg ist der Dreh- und Angelpunkt.** Alles, was man draußen tut (Handel, Aufträge, Beute, Bündnisse), fließt in den Ausbau von Ashcombe zurück. Jede Ausbaustufe ist auf der Karte sichtbar.
2. **Ein Gefolge anführen.** Gefährten anwerben, ausrüsten, verlieren und befördern. Scharmützel finden in Echtzeit direkt in der Welt statt, ohne eigenen Schlachtbildschirm.
3. **Politik mit Folgen.** Jede Hilfe für eine Fraktion verärgert ihre Rivalen. Wer Steuereintreiber überfällt, wird bei den Sachsen und Waldleuten beliebt und bei den Normannen gehasst, und die kommen dann vor die Burg.
4. **Eine Welt, die ohne dich weiterläuft.** Tageszeiten, Jahreszeiten, Händlerzüge, Patrouillen und Banden sind unterwegs, ob man hinsieht oder nicht.

## Spielschleife

```
Aufträge / Handel / Überfälle  →  Gold, Waren, Ruhm, Ansehen
            ↑                                  ↓
   stärkeres Gefolge  ←  Burg ausbauen, anwerben, ausrüsten
```

Langfristiges Ziel im Prototyp: Ashcombe zur **Festung** ausbauen und **zwei Verbündete** gewinnen.

## Fraktionen

| Fraktion | Will | Rivalen | Vorteil als Verbündete |
| --- | --- | --- | --- |
| Sächsische Thane | Alte Rechte zurück | Normannen | +20 Burgverteidigung, Anwerben 20 % billiger |
| Normannische Barone | Ordnung und Steuern | Sachsen, Waldleute | Keine Abgaben an den Vogt |
| Kirche & Orden | Frieden, Spenden, Einfluss | (keine) | Schnellere Heilung, Ruhm |
| Kaufmannsgilde | Sichere Straßen | Waldleute | Bessere Preise, Handelsanteile |
| Waldleute | Gerechtigkeit, Richards Rückkehr | Normannen, Gilde | Banden meiden dich, Langbogenschützen |
| Krone Frankreichs | Die Normandie | Normannen | Freie Überfahrt, Armbrustschützen |

Schwellen: ab **+50** verbündet, ab **−30** feindlich (Tore zu, Patrouillen greifen an, Überfälle auf die Burg).

## Stand des Prototyps (v0.2)

- Karte von England und Frankreich (1024 × 1024, gut 800 m je Feld) mit echten Küsten, Flüssen, Bergland und Wäldern, 69 Orten an historischen Stellen, Straßen, Brücken und Häfen
- Fähren über den Kanal und die Nordsee
- Große Städte mit Stadtmauer, Strahlen- und Ringgassen, Häuserzeilen, Pfarrkirchen und mehreren Gasthäusern (London mit rund 180 Häusern)
- Stufenloser Zoom von 0,45 bis 4, Standard nah am Geschehen
- Kreislauf aus Bauen und Verfall: Bauplätze, Baustellen, Brände mit Löschketten, Abriss und Neubau
- Überfälle auf Orte mit Plünderung und langer Brache, Stiften für den Wiederaufbau, Sühne
- Jäger, Fischer, Reisigsammler, Aussaat und Ernte
- Turniere mit Tribüne, Zelten, NPC-Tjosten und eigenem Tjost (Zielleiste)
- Bettler mit Almosen, Galgen mit Hinrichtung, Begräbnis und der Möglichkeit zu befreien
- Wetter (Wolken, Regen, Nebel, Schneefall) und eine Schneedecke, die nach und nach wächst und taut
- 69 gleichmäßig verteilte Orte, dazu 6 Erzgruben und 9 mystische Orte mit Einsiedlern (abseits der Straßen, mit Abstand zu allen Orten), 60 Lagerfeuer und kleine Hügel, Wahrzeichen (Kathedralen, Tower, Louvre, Tuchhallen), Stonehenge und Hadrianswall, Einzelhöfe
- Bewohner mit Rollen und Tagesablauf
- Hospiz, Schafzucht, Felder, Verpflegung; Fehden zwischen Fraktionen; Kampfbonus in der Burg
- Schlachten zweier Heere (bis 50 gegen 50), Belagerungen mit Trebuchet, Gebäudeschäden und Wiederaufbau, Friedhöfe mit Begräbnissen, Gasthäuser mit Übernachtung
- Belagerungen mit geschlossenen Toren, Garnison auf Posten hinter der Mauer, sichtbarem Mauerschaden und Bresche, durch die gestürmt wird; Pforte für Verbündete; auch die eigene Burg wird belagert, wenn Normannen oder Sachsen feindlich sind
- Seitenwahl bei Belagerungen: Verteidigern beistehen (durch die Pforte hinein, Dank der Stadt) oder den Belagerern dienen (Sturm auf dein Zeichen, Beuteanteil); Belagerungen, Schlachten und Turniere sind auf beiden Karten markiert und werden am Bildrand angezeigt
- Tag und Nacht mit Lichtern, vier Jahreszeiten (Schnee, Herbstlaub)
- Spieler und Gefolge mit Reiten, Ausrüstung, Stufen, Befehlen
- Sechs Gruppentypen mit eigener Route und eigenem Verhalten
- Märkte mit Angebot und Nachfrage, Ausrüster je Ortstyp
- Fünf Auftragsarten (Lieferung, Banditen, Wilderer, Steuerkasse, Botengang)
- Neun Burggebäude mit je drei Stufen und Bauzeit, vier Burgstufen
- Überfälle auf die Burg, Garnison, Wachtürme
- Gebäudekollision: Häuser, Kirchen, Wahrzeichen, Bergfriede und Burggebäude sperren ihre Felder, die Tür bleibt frei; Orte ohne erreichbare Tür werden nicht gebaut (geprüft mit tools/wege.mjs)
- Eigene Burg: Klick auf Gebäude oder Bauplatz öffnet nur dieses Gebäude, der Boden ist begehbar
- Weitläufige Orte mit Gärten und Höfen zwischen den Häusern
- Speichern und Laden, Einzeldatei-Build

## Fahrplan: Grafschaften, Burgen, Krieg, Mehrspieler

Beschlossen im November 2026. Ziel ist eine strategische Ebene über dem Abenteuer: Grafschaften erobern und halten,
Burgen frei ausbauen, Gefolgsleute als Kastellane und Boten einsetzen, am Ende ein geeintes England oder die
zurückgewonnene Normandie, später mit mehreren Spielern.

### Phase 1: Grafschaften (umgesetzt)
- Jede Burg ist Sitz einer Grafschaft (Shire) mit historischem Namen: West Riding, Nottinghamshire, Kent, Cheshire,
  Bessin, Vexin, Île-de-France und andere. Orte gehören zu der Burg, die man über Land am schnellsten erreicht.
- Ashcombe liegt im West Riding; dessen Sitz Pontefract hält Prinz Johns Vogt. Es ist die einzige Grafschaft mit zwei
  Burgen. Wer Pontefract zurückerobert, beherrscht sie, und der Vogt verlangt keine Abgaben mehr.
- Der Herr einer Grafschaft bekommt die Abgaben ihrer Orte und einen Vorzug aus ihrer Geschichte (Wolle aus den
  Pennines, Caen-Stein, Salz aus Cheshire, halber Fährlohn in Kent, Grenzer in Cumberland …).
- Karte: Grenzen, Farbe des Herrn, Namen; Liste der Grafschaften in der Kartentafel.

### Phase 2: Burg mit freien Bauplätzen (umgesetzt)
- Der Bergfried bleibt der Kern: Ruine, Holzturm, normannischer Bergfried, Donjon.
- Ringsum Bauplätze, frei mit Gebäuden zu belegen, auch mehrfach dasselbe (nur Holzfäller ist erlaubt).
- Die Art der Burg legt die Plätze fest: Eine große Burg hat weniger Plätze, aber mehr davon innerhalb der Mauer;
  eine kleine hat mehr Plätze, die meisten davon ungeschützt außen. Vorschlag (25 sind eher zu viel):
  Turmburg 4 innen + 16 außen (Ring 4), Ringburg 8 + 10 (Ring 5, +15 Verteidigung), Festung 12 + 4 (Ring 6,
  +35 Verteidigung). Innen 2 × 2 Felder (kompakte Gebäude), außen 3 × 3. Äcker, Weiden, Holzfäller und Steinbruch
  nur außen; mehrfach baubar sind sie und die Wachtürme. Umbau der Burgart kostet Gold und Baustoffe; was keinen
  Platz mehr findet, wird abgerissen.
- Bei einer Belagerung erzeugen Gebäude außerhalb der Mauer nichts, und die Belagerer brennen einige nieder;
  sie müssen wieder aufgebaut werden. Innen läuft alles weiter.
- Unterhalt je Gebäude und sinkende Marktpreise halten das Spezialisieren im Zaum.

### Phase 3: Erobern und Halten (umgesetzt)
- Eigene Belagerung jeder Grafschaftsburg (ab Ruhm 15): ein Aufgebot aus 12, 20 oder 30 Söldnern (je 25 Gold) und
  Belagerungsgerät (150 Gold), dazu das Gefolge und Hilfe von Verbündeten, die mit den Herren der Burg verfeindet
  sind (Sachsen, Waldleute, Franzosen). Sturm auf dein Zeichen im Feldlager, sonst nach vier Minuten. Ansehen bei den
  Herren −25 beim Aufbruch, −15 beim Fall; ihre Feinde +4 und +6. Die Burg wechselt samt Grafschaft, die
  überlebenden Söldner bleiben als Besatzung (4 bis 30).
- Eroberte Burgen führt ein Kastellan: ein eigener Gefolgsmann (100 % plus 10 % je Stufe, höchstens 180 %) oder ein
  gedungener Burgvogt (70 %, 6 Gold am Tag). Vorgaben und was der Kastellan von den Abgaben behält:
  ausgewogen (25 %, Besatzung bis 12), Burg ausbauen (70 %), Holz erzeugen (25 %, 12 Holz am Tag nach Hause),
  Verteidigung (50 %, Besatzung bis 30, +15). Ausbau in Stufen: Graben, Wehrgang, Torhaus und zuletzt ein Donjon,
  der eine Steinburg sichtbar zur Festung macht. Selbst Hand anlegen: Schäden sofort ausbessern, fünf Mann anwerben,
  einen Bauabschnitt bezahlen.
- Gegenangriffe der früheren Herren: frühestens sieben Tage nach dem letzten, etwa 7 % am Tag (13 %, wenn sie dich
  hassen). In deiner Nähe eine echte Belagerung mit deiner Besatzung in deinen Farben, sonst Verteidigung gegen
  45 + 2 je Tag. Fällt die Burg, geht die Grafschaft zurück, der Kastellan kommt verwundet heim. Der Ausbau bleibt.

### Phase 4: Gefolgsleute auf Reisen
- Aufträge an Gefolgsleute abgeben: Botengänge, Geleit, Lieferungen.
- Gefolgsleute als Händler zwischen den Städten, später feste Handelsrouten mit Wagenzügen (Gefahr durch Banden).

### Phase 5: Kriegskarte
- Die Parteien erobern Grafschaften auch untereinander: Richards Getreue gegen Prinz Johns Barone, Frankreich gegen
  das normannische Aufgebot.
- Ziel: ein geeintes England unter Richard oder die zurückgewonnene Normandie.

### Phase 6: Mehrspieler (2 bis 6)
- Jeder beginnt in einer anderen Grafschaft mit einer Burgruine, wächst, schließt Bündnisse, handelt und führt
  Feldschlachten.
- Technisch der größte Schritt: Es braucht einen Server (eine Artifact-Seite allein kann keine Echtzeitspiele
  verbinden), entweder mit maßgeblicher Simulation auf dem Server oder als Gleichschritt, bei dem alle Rechner
  dieselbe Simulation aus denselben Befehlen rechnen.
- Vorbereitung schon im Einzelspiel: „Herren“ als eigene Einheiten im Spielstand (Gold, Burgen, Gefolge je Herr),
  mit KI-Herren in anderen Grafschaften als Rivalen und Verbündete; alle Handlungen als Befehle; ein Zufallsgenerator
  mit Startwert statt Math.random in der Simulation. Später übernehmen Menschen die KI-Herren.

## Ausbauplan

### Nächste Schritte
- **Turniere ausbauen:** Buhurt (Gruppenkampf), Bogenschießen, eigene Turniere auf der Burg ausrichten.
- **Belagerungen ausbauen:** Leitern und Rammbock, Aushungern, eigene Belagerungen feindlicher Burgen mit dem Gefolge.
- **Gefährten mit Geschichte:** Benannte Figuren mit eigenen Quests und Loyalität, etwa ein Mönch, eine Bogenschützin oder ein abtrünniger Templer.
- **Diplomatie-Tafel:** Gesandte schicken, Tribute zahlen, Bündnisse förmlich schließen oder brechen.

### Mittelfristig
- **Gefangene und Lösegeld:** Raubritter gefangen nehmen statt erschlagen.
- **Eigene Dörfer:** Höfe und Weiler rund um Ashcombe, die wachsen, wenn die Burg sicher ist.
- **Hauptgeschichte:** Lösegeld für König Richard sammeln, Verschwörung Prinz Johns aufdecken, Ende abhängig von den Bündnissen.
- **Formationen und Gefolge-Befehle:** Keil, Schildwall, Schützen nach hinten.
- **Klang:** Musik und Umgebungsgeräusche (Wald, Markt, Schmiede).

### Später
- Hunger im Winter, Seuchen, Hochwasser nach der Schneeschmelze
- Mehrere Spielstände und Schwierigkeitsgrade
- Gamepad- und Touch-Steuerung ausbauen
- Eigene Grafiken statt gezeichneter Formen

## Technik

- Reines JavaScript mit Canvas 2D, ohne Abhängigkeiten
- Welt deterministisch aus einem Seed, deshalb kleine Spielstände
- Gelände in 8 × 8-Chunks vorgerendert (Auflösung passend zum Zoom), Objekte pro Bild nach Tiefe sortiert
- Ruhende Bauten (Häuser, Kirchen, Mauerstücke) werden einmal in Bildpuffer gezeichnet und danach nur noch kopiert; bei sehr nahem Zoom wird direkt gezeichnet
- `tools/build.mjs` bündelt die Module zu einer einzigen HTML-Datei und prüft dabei doppelte Namen
