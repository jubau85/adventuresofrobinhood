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

- Karte von England und Frankreich (512 × 512, etwa 1,6 km je Feld) mit echten Küsten, Flüssen, Bergland und Wäldern, 41 Orten an historischen Stellen, Straßen, Brücken und Häfen
- Fähren über den Kanal und die Nordsee
- 63 Orte, Wahrzeichen (Kathedralen, Tower, Louvre, Tuchhallen), Stonehenge und Hadrianswall, Einzelhöfe
- Bewohner mit Rollen und Tagesablauf
- Hospiz, Schafzucht, Felder, Verpflegung; Fehden zwischen Fraktionen; Kampfbonus in der Burg
- Schlachten zweier Heere (bis 50 gegen 50), Belagerungen mit Trebuchet, Gebäudeschäden und Wiederaufbau, Friedhöfe mit Begräbnissen, Gasthäuser mit Übernachtung
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
- **Turnier in Ashby:** Tjost als Minispiel, Preisgeld und viel Ruhm. Ein Kernstück von *Ivanhoe*.
- **Belagerungen:** Überfälle auf Ashcombe als echte Kämpfe vor den Mauern statt als Würfelwurf. Mauern und Tore blockieren dann den Weg.
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
- Wetter (Regen, Nebel), Hunger im Winter, Seuchen
- Mehrere Spielstände und Schwierigkeitsgrade
- Gamepad- und Touch-Steuerung ausbauen
- Eigene Grafiken statt gezeichneter Formen

## Technik

- Reines JavaScript mit Canvas 2D, ohne Abhängigkeiten
- Welt deterministisch aus einem Seed, deshalb kleine Spielstände
- Gelände in 8 × 8-Chunks vorgerendert, Objekte pro Bild nach Tiefe sortiert
- `tools/build.mjs` bündelt die Module zu einer einzigen HTML-Datei und prüft dabei doppelte Namen
