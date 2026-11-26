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

- Karte von England und Frankreich (512 × 512, etwa 1,6 km je Feld) mit echten Küsten, Flüssen, Bergland und Wäldern, 69 Orten an historischen Stellen, Straßen, Brücken und Häfen
- Fähren über den Kanal und die Nordsee
- Große Städte mit Stadtmauer, Strahlen- und Ringgassen, Häuserzeilen, Pfarrkirchen und mehreren Gasthäusern (London mit rund 180 Häusern)
- Stufenloser Zoom von 0,45 bis 4, Standard nah am Geschehen
- Kreislauf aus Bauen und Verfall: Bauplätze, Baustellen, Brände mit Löschketten, Abriss und Neubau
- Überfälle auf Orte mit Plünderung und langer Brache, Stiften für den Wiederaufbau, Sühne
- Jäger, Fischer, Reisigsammler, Aussaat und Ernte
- Turniere mit Tribüne, Zelten, NPC-Tjosten und eigenem Tjost (Zielleiste)
- Bettler mit Almosen, Galgen mit Hinrichtung, Begräbnis und der Möglichkeit zu befreien
- Wetter (Wolken, Regen, Nebel, Schneefall) und eine Schneedecke, die nach und nach wächst und taut
- 69 gleichmäßig verteilte Orte, dazu 6 Erzgruben und 9 mystische Orte mit Einsiedlern, 60 Lagerfeuer und kleine Hügel, Wahrzeichen (Kathedralen, Tower, Louvre, Tuchhallen), Stonehenge und Hadrianswall, Einzelhöfe
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
- Speichern und Laden, Einzeldatei-Build

## Ausbauplan

### Nächste Schritte
- **Turniere ausbauen:** Buhurt (Gruppenkampf), Bogenschießen, eigene Turniere auf der Burg ausrichten.
- **Belagerungen ausbauen:** Leitern und Rammbock, Aushungern, eigene Belagerungen feindlicher Burgen mit dem Gefolge.
- **Gefährten mit Geschichte:** Benannte Figuren mit eigenen Quests und Loyalität, etwa ein Mönch, eine Bogenschützin oder ein abtrünniger Templer.
- **Diplomatie-Tafel:** Gesandte schicken, Tribute zahlen, Bündnisse förmlich schließen oder brechen.
- **Gebäudekollision:** Auch Häuser sollen den Weg versperren. Mauern tun das bereits.

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
