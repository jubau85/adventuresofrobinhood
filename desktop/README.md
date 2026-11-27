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
mit `--vollbild` startet es gleich im Vollbild. `npm run start:zweite` startet eine zweite, getrennte Instanz (eigener
Speicherordner), etwa um den Mehrspieler auf einem Rechner zu testen.

## Paket bauen

```
npm run dist:win      # Windows: Installer (NSIS) und ZIP in desktop/release/
npm run dist:linux    # Linux: AppImage und tar.gz
npm run dist:mac      # Mac: ZIP (nur auf einem Mac)
```

Den Windows-Installer am besten unter Windows bauen; das ZIP geht auch unter Linux. Ein Code-Signatur-Zertifikat ist
nicht eingerichtet (Windows warnt dann beim ersten Start; für Steam ist das nicht nötig, Steam startet die App selbst).
Das Programmsymbol (`build/icon.png`) erzeugt `python3 -I ../tools/symbol.py build/icon.png`.

## Mehrspieler im Heimnetz (vor Steam)

Wer im Startmenü unter „Mehrspieler“ eine **Partie eröffnet**, startet in der App ein kleines Relais (Port 8765); die
App nennt die Adresse im Heimnetz, etwa `ws://192.168.1.20:8765`. Mitspieler tragen sie (oder nur `192.168.1.20`) im
Feld **Relais** ein, wählen denselben Namen der Partie und klicken **Partie beitreten**. Die Windows-Firewall fragt beim
ersten Eröffnen, ob die App im Netz erreichbar sein darf. Auf einem Rechner zum Ausprobieren: `npm start` und
`npm run start:zweite`, im zweiten Fenster als Relais `127.0.0.1` eintragen.
