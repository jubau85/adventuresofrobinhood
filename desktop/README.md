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
