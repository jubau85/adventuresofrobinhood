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

### Phase 4: Gefolgsleute auf Reisen (umgesetzt)
- Aufträge an Gefährten abgeben: Botengänge, Lieferungen (aus Burglager oder Ladung, je nachdem, wo sie aufbrechen)
  und Kampfaufträge (Bande, Wilderer, Steuerkasse) mit bis zu zwei Begleitern als Geleit. Gold und Ansehen voll,
  Ruhm halb; Kampf nach Stärke (Angriff × 2 + Abwehr + Lebenskraft / 8) mit Zufall.
- Handelsfahrten: ein Wagen je Gefährte (40 Stück), Fracht am ersten Ziel verkaufen, dort mit allem Geld einkaufen,
  heimbringen oder am zweiten Ziel verkaufen (Zwischenhandel). Preise wie am Markt, jedes Stück verschiebt sie.
  „Wiederholen“ macht eine feste Route daraus.
- Reisen laufen in Spielzeit: zu Pferd 120, zu Fuß 90, mit dem Wagen 75 Felder am Tag, Umweg ein Viertel, übers Meer
  1,5 Tage mehr. Zehrgeld 3 Gold je Kopf und Tag, Fähre 12 Gold je Kopf. Wegelagerer: 5 % am Tag (Waldleute
  verbündet ×0,35, feindlich ×1,6, reiche Fracht ×1,3), Stärke 20 + 0,8 je Tag. Wer unterliegt, verliert die Hälfte
  von Ladung und Geld und kehrt verwundet heim. Zurückrufen jederzeit.
- Noch offen: Wagenzüge sichtbar in der Welt, die du begleiten kannst.

### Phase 5: Kriegskarte (umgesetzt)
- Zwei Kriegsschauplätze: England (Richards Getreue = Sachsen gegen Prinz Johns Barone = Normannen, alle Burgen
  Englands und Wales) und Normandie (das normannische Aufgebot gegen König Philipp, Ziel Caen, Falaise, Évreux, Gisors;
  Compiègne bleibt Philipps Krondomäne).
- Feldzüge: je Schauplatz höchstens einer, 25 % am Tag. Angreifer nach Stärke × Angriffslust (Richard 0,6 / Johann
  0,4, in der Normandie je 0,5), Ziel die nächste Burg der Gegenseite, Ausgang nach 1 bis 4 Tagen Anmarsch. In deiner
  Nähe (100 Felder × Kartenmaß) eine echte Belagerung, sonst 0,4 + 0,9 × (A − V) / (A + V), mindestens 15 %,
  höchstens 85 %; Verteidiger mit Mauern ×1,15, Festung ×1,35. Deine Burgen verteidigen nach ihrem Verteidigungswert.
- Stärke: Grundstärke (Richard 85, Johann 55, Aufgebot 60, Philipp 75), +3 je Grafschaft, Kriegsglück (Sieg +8,
  Niederlage −6, Feldschlacht +12/−8, verblasst um 10 % am Tag), Heerfolge +20 für eine Woche, dein Ruhm / 8
  (höchstens +30) für die Seite deines Treueids.
- Zufällige Belagerungen treffen nur noch Städte, Hallen und Märkte; Grafschaftsburgen belagern die Heere im Krieg.
- Ende: Eine Seite hält alle Burgen ihres Ziels (der Stand zu Spielbeginn zählt nicht). Die Siegtafel gibt es, wenn
  es deine Seite ist; für Johann musst du selbst mindestens zwei Grafschaften halten.

### Phase 6a: Schottland und ganz Irland (umgesetzt)
- Karte 1536 × 1536 Felder bei gleichem Maßstab (rund 800 m je Feld): Nordrand 59° (Orkney), Westrand 11,2° West
  (Kerry), alles um 416 Felder nach Osten und 512 nach Süden verschoben. MAP_K bleibt 2, MAP_AREA = 4 × 1,5.
- Zwei neue Parteien: Schottische Krone (Grenzer, Heer König Wilhelms, +15 Verteidigung und bessere Preise in
  Schottland als Verbündete) und Gälische Könige (Kerne, Aufgebot der Könige, kein Fährlohn nach Irland, +10
  Verteidigung). In Irland halten Prinz Johns Barone Dublin, Meath, Ulster und Leinster.
- Schottische Grafschaften sind von den englischen durch die Grenze getrennt (Solway bis Tweed).

### Phase 6b: Computer-Barone (umgesetzt, barons.js)
- Sechs Barone mit eigener Burg: Gwilym ap Rhys (Wales, Kriegsherr, für Richard), Malcolm von Glenarden (Schottland,
  Kaufmann, für sich), Raoul de Montcabré (Normandie, Wendehals, für Philipp), Hugh de Ravensmere (Hampshire,
  Baumeister, für Johann), Geoffrey von Kirkwold (bei Leicester, frommer Ritter, für Richard), Fergal Ó Duibhne
  (Irland, Rebell, für sich). Mit dir sind es sieben Herren.
- Ihre Burgen sind Burgen auf der Karte (Ort type 'burg' mit baron), mit derselben Turmburg-Anlage und denselben
  gemalten Gebäuden auf denselben Bauplätzen wie deine. Burgstufe und Gebäude wachsen im Spiel.
- Tageslauf je Baron: Einkommen (Grund 22 + 18 je Burgstufe, Markt, Felder, Werkstätten, Grafschaften, mal
  Schwierigkeit) minus Sold (0,8 je Mann); dann ein bis zwei Vorhaben nach Gewichten seines Charakterzugs: bauen (auf die
  Burg sparen, höchstens 3 + 3 × Burgstufe Gebäude), anwerben (14 Gold je Mann bis zur Obergrenze), Aufträge (Gold,
  Ruhm), Handel (Gold; in deiner Nähe ziehen echte Handelszüge), Krieg (ab 30 Mann, alle 10 Tage: eine Grafschaft der
  Gegenseite; Verteidigung 60/80 plus ein Viertel der Stärke ihrer Seite). Überschuss geht in Söldner oder Stiftungen.
- Krieg: Barone mit Treueid stärken ihre Seite (12 % ihrer Kampfkraft, höchstens +25), ihre Grafschaften zählen für
  sie. Der Wendehals wechselt zur stärkeren Seite.
- Du und die Barone: Verhältnis −100 bis 100. Geschenk 120 Gold (+10), Bündnis ab 40 (Männer bei deinen Belagerungen,
  Hilfe bei Angriffen), Fehde (du darfst seine Burg belagern, er zieht gegen deine Burgen; echte Belagerung, wenn du in
  der Nähe bist), Frieden gegen Sühne. Fällt seine Burg, zahlt er Lösegeld, gibt dir seine Grafschaften und wird
  Vasall (ein Viertel seines Einkommens als Tribut). Überfälle auf seine Handelszüge kosten 30, auf sein Heer 12.
- Schwierigkeit beim neuen Spiel: Leicht (Einkommen ×0,62, Bauzeit ×1,5, Holzburg mit 2 Gebäuden, Fehde erst ab
  Verhältnis −60 und Tag 30), Mittel (×0,9, ×1,15, 3 Gebäude, −45, Tag 18), Schwer (×1,25, ×0,85, Steinburg mit 4
  Gebäuden, −25, Tag 10). Dazu „klug“: wie oft ein Baron das Vernünftigste tut (35 %, 60 %, 85 %).

### Phase 7: Mehrspieler (2 bis 6) – Kern und Lobby umgesetzt (mp.js, lobby.js, net.js)
- Ziel: Jeder sitzt auf einer Burg, wächst, schließt Bündnisse, handelt und führt Feldschlachten; ausgeliefert über
  Steam (Desktop-App in `desktop/`, Lobbys und Verbindungen über Steam).
- **Lobby (`lobby.js`, Lobby-Teil in `mp.js`):** Vor dem Spiel treffen sich alle in einer Lobby. Der Gastgeber
  eröffnet sie unter einem Namen, Gäste klopfen mit `hallo` an (bis zu zwölfmal, falls das Relais oder der Gastgeber
  noch nicht so weit ist). Jeder stellt dort seinen Ritter ein (Name, Figur, Wappen) und wählt eine Grafschaft; der
  Gastgeber vergibt Wappenfarben und Grafschaften je nur einmal und führt die Liste (`lobby`, alle 1,5 s und bei jeder
  Änderung). Gäste schicken ihre Wahl (`wahl`: Grafschaft, Profil, bereit). „Spiel starten“ geht, wenn alle Gäste
  bereit sind (allein auch sofort); dann schickt er `start`, erschafft die Welt und begrüßt jeden Gast mit dem
  Weltstand und seiner Grafschaft. Wer nach dem Start dazukommt, bekommt eine freie Grafschaft.
- **Grafschaften statt Heimburg:** Die Mehrspieler-Welt entsteht ohne Ashcombe (`generateWorld(seed, { mp: true })`,
  für alle gleich). Jeder Mensch beginnt als Herr seiner Grafschaft: Ihre Burg ist ein Besitz (`grantSeat` in
  `holdings.js`, 16 Mann, zwei Wochen Ruhe vor den früheren Herren) und zugleich sein Sitz mit Rittersaal, Gefolge,
  Garnison und Lager (`homeBase()` in `castle.js`). Im gemeinsamen Stand heißen die Grafschaften eines Menschen
  `p:<seine Grafschaft>`; beim Senden und Empfangen wird übersetzt, so dass jeder die eigenen als `spieler` sieht.
  Gewinnt oder verliert ein Gast eine Grafschaft, meldet er es als Befehl `grafschaft`; schreibt der Gastgeber eine
  Grafschaft einem anderen zu, verliert der Gast dort seine Burg (nicht am Tag der Eroberung selbst). Burg, Lager,
  Abgaben, Sold und Verpflegung rechnet jeder selbst (`dailyCastle`, `dailyHoldings` ohne Angriffe beim Gast).
- **Gastgeber-Modell:** Ein Spieler ist Gastgeber und rechnet die gemeinsame Welt allein: Uhrzeit und Tage, Märkte,
  Barone, Krieg, Grafschaften, Schäden, Bauten, Wetter, Turniere, Hinrichtungen (`SHARED_KEYS` in `mp.js`). Er schickt
  den ganzen Stand (nicht nur Änderungen), alle 3 s, wenn sich etwas geändert hat, die Märkte alle 8 s, die Uhr zweimal
  je Sekunde. Gäste rechnen täglich nur Persönliches (Sold, Aufträge, eigene Begegnungen; `guestDay` in `sim.js`).
  Dorfleben, Tiere und Gruppen unterwegs rechnet jeder für sich.
- **Befehle:** Was ein Gast an der gemeinsamen Welt ändert, geht als Befehl an den Gastgeber (bisher: Markt-Lager nach
  Kauf und Verkauf, gewonnene und verlorene Grafschaften). Weitere folgen mit 7b.
- **Helden der anderen:** jeder schickt 10-mal je Sekunde Position, Pferd, Ausrüstung und Farbe; die anderen zeigen ihn
  als 3D-Figur mit Namen und Ring in seiner Farbe, weich zwischen den Meldungen.
- **Gastgeber-Wechsel:** Kommt vom Gastgeber 15 s nichts (oder verabschiedet er sich beim Schließen des Fensters),
  übernimmt der Gast mit der kleinsten Kennung mit dem zuletzt empfangenen Weltstand. Neu Beitretende haben eine
  Schonfrist, solange sie die Welt erzeugen. Hing ein Fenster selbst (Tageswechsel, Bilder laden), zählt die Pause
  nicht gegen die anderen; ein Gast, der nach einem Aussetzer wieder auftaucht, bekommt seine Burg zurück.
- **Verbindung (`net.js`):** Browser-Kanal (zwei Fenster auf einem Rechner), WebSocket-Relais (`desktop/relay.js`,
  in der Desktop-App beim Eröffnen eingebaut, sonst `node tools/relay.mjs`), später Steam. Chrome verlangt für Seiten
  aus dem Netz eine Freigabe für Verbindungen ins Heimnetz; die Desktop-App ist davon nicht betroffen.
- **Noch offen (7b/7c):** Angriffe der KI auf die Burgen der Gäste sichtbar für alle, Belagerungen und Feldschlachten
  zwischen Menschen und deren Anzeige bei allen, Diplomatie zwischen Menschen, Gruppen auf der Karte gemeinsam,
  Speichern einer Mehrspieler-Partie für alle, Steam-Lobby.

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
