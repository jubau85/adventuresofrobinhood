# A Knight's Tale – Desktop-Fassung

Das Spiel als eigenes Programm (Electron) für Windows, Linux und Mac. Es lädt dieselben Spieldateien wie die
Browser-Fassung, nur ohne Webserver und offline (Schriften liegen bei), und speichert Spielstände als Dateien im
Benutzerordner (Windows: `%APPDATA%\A Knight's Tale\saves`, Linux: `~/.config/A Knight's Tale/saves`). Das ist die
Grundlage für Steam (Cloud-Speicher, Overlay, Lobbys) im nächsten Schritt.

## Starten (zum Entwickeln)

```
cd desktop
npm install
npm start
```

`npm start` baut zuerst die Spieldateien nach `desktop/game/` (`node ../tools/build.mjs --desktop game`) und öffnet
dann das Fenster. Fehlt nach `npm install` das Electron-Programm, hilft `node node_modules/electron/install.js`.

Tasten: **F11** oder **Alt+Enter** Vollbild. Mit `npm start -- --entwickler` öffnet **F12** die Entwicklerwerkzeuge,
mit `--vollbild` startet es gleich im Vollbild, mit `--ohne-intro` ohne Vorspann (für Tests). In der App spielt der
Vorspann seine Musik sofort, ohne vorher auf einen Klick zu warten. `npm run start:zweite` startet eine zweite, getrennte Instanz (eigener
Speicherordner), etwa um den Mehrspieler auf einem Rechner zu testen.

## Paket bauen

```
npm run dist:setup    # Windows-Installer „A Knight's Tale Setup <version>.exe“ (auch unter Linux, ohne Wine)
npm run dist:win      # Windows: Installer (NSIS) und ZIP in desktop/release/
npm run dist:linux    # Linux: AppImage und tar.gz
npm run dist:mac      # Mac: ZIP (nur auf einem Mac)
```

`dist:setup` baut mit electron-builder den Programmordner und packt ihn mit NSIS (`installer/setup.nsi`) zum
Installer; dafür muss `makensis` da sein (Linux: `apt install nsis`, Windows: NSIS von nsis.sourceforge.io). Er
installiert ohne Administratorrechte nach `%LOCALAPPDATA%\Programs\A Knight's Tale`, legt Verknüpfungen im Startmenü
und auf dem Desktop an und erscheint unter „Apps“ zum Deinstallieren; Spielstände bleiben dabei erhalten.
`dist:win` (electron-builders eigener Installer) braucht unter Linux Wine und geht darum am besten unter Windows. Ein Code-Signatur-Zertifikat ist
nicht eingerichtet (Windows warnt dann beim ersten Start; für Steam ist das nicht nötig, Steam startet die App selbst).
Das Programmsymbol (`build/icon.png`) erzeugt `python3 -I ../tools/symbol.py build/icon.png`.

### Versionsnummern

Jedes Setup, das weitergegeben wird, hat eine eigene Versionsnummer (`Hauptversion.Neben.Build`, z. B. 0.8.0). Sie
steht in `desktop/package.json`; `tools/version.mjs` zieht sie nach `package.json` und `desktop/package-lock.json`
mit. `node build-setup.mjs` (`npm run dist:setup`) zählt vor dem Bauen die letzte Stelle hoch (0.8.0 → 0.8.1);
`--version 0.9.0` setzt eine Nummer, `--gleiche-version` behält sie (nur zum Ausprobieren). Danach die geänderten
package.json-Dateien einchecken. Die Nummer steht im Namen des Setups, im Fenstertitel der App, unten links im
Startmenü und im Spielmenü (dort mit dem Build, dem Kurzzeichen des Codes). `tools/build.mjs` schreibt sie auch in die
Browserfassung; aus den Quellen gestartet zeigt das Spiel „Entwicklungsstand“.

```
node ../tools/version.mjs          # zeigt die Nummer
node ../tools/version.mjs minor    # 0.8.3 -> 0.9.0 (größere Neuerungen)
```

## Mehrspieler im Heimnetz (vor Steam)

Im Startmenü öffnet **Mehrspieler …** die Lobby. Wer **eröffnet**, startet in der App ein kleines Relais (Port 8765)
und ist Gastgeber. Seine Partie ruft die App jede Sekunde ins Heimnetz (UDP-Broadcast auf Port 8766, `lan.js`): Bei den
Mitspielern erscheint sie unter **Partie beitreten → Im Heimnetz gefunden** mit Name, Gastgeber, Spielerzahl und Stand,
und ein Klick auf **Beitreten** genügt. Partien einer anderen Spielversion sind gesperrt (die Welt würde nicht passen).
Von Hand geht es weiterhin: denselben Namen der Partie und die Adresse eintragen, die die Lobby dem Gastgeber nennt,
etwa `192.168.1.20`. In der Lobby stellt jeder seinen Ritter
und sein Wappen ein, wählt die Grafschaft, über die er herrscht, und meldet sich bereit; der Gastgeber stellt die
Schwierigkeit ein und klickt **Spiel starten**. Die
Windows-Firewall fragt beim ersten Eröffnen und beim ersten Suchen, ob die App im Netz erreichbar sein darf: für
private Netzwerke zulassen, sonst finden sich die Rechner nicht. Auf einem Rechner zum
Ausprobieren: `npm start` und `npm run start:zweite`, im zweiten Fenster bleibt das Adressfeld leer.
