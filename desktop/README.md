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

## Mehrspieler im Heimnetz (vor Steam)

Im Startmenü öffnet **Mehrspieler …** die Lobby. Wer **eröffnet**, startet in der App ein kleines Relais (Port 8765)
und ist Gastgeber; die Lobby nennt ihm die Adresse im Heimnetz, etwa `192.168.1.20`. Mitspieler wählen
**Partie beitreten**, tragen denselben Namen der Partie und diese Adresse ein. In der Lobby stellt jeder seinen Ritter
und sein Wappen ein, wählt die Grafschaft, über die er herrscht, und meldet sich bereit; der Gastgeber stellt die
Schwierigkeit ein und klickt **Spiel starten**. Die
Windows-Firewall fragt beim ersten Eröffnen, ob die App im Netz erreichbar sein darf. Auf einem Rechner zum
Ausprobieren: `npm start` und `npm run start:zweite`, im zweiten Fenster bleibt das Adressfeld leer.
