// Desktop-App (Electron): lädt das Spiel aus game/ über das eigene Protokoll app:// (so funktionieren Module, fetch und
// Bilder wie im Browser, ohne Webserver), speichert Spielstände als Dateien im Benutzerordner und schaltet mit F11 oder
// Alt+Enter auf Vollbild. Später kommt hier die Steam-Anbindung dazu (Overlay, Cloud, Lobbys, Verbindungen).
const { app, BrowserWindow, protocol, net, ipcMain, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// Im fertigen Paket liegt das Spiel neben der App unter resources/game (electron-builder extraResources)
const GAME = app.isPackaged ? path.join(process.resourcesPath, 'game') : path.join(__dirname, 'game');
const TITLE = "A Knight's Tale";

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// Nur eine Instanz; ein zweiter Start holt das Fenster nach vorn (Mehrspieler-Tests starten mit --zweite eine eigene)
const second = process.argv.includes('--zweite');
if (second) app.setPath('userData', path.join(app.getPath('userData'), 'zweite'));
else if (!app.requestSingleInstanceLock()) app.quit();

// Spielstände: ein JSON-Text je Schlüssel unter <Benutzerordner>/saves/, erst in eine Hilfsdatei geschrieben und dann
// umbenannt, damit ein Absturz beim Schreiben nie den alten Stand zerstört
const SAVES = () => path.join(app.getPath('userData'), 'saves');
const saveFile = (key) => path.join(SAVES(), `${String(key).replace(/[^a-z0-9._-]/gi, '_')}.json`);
ipcMain.on('saves:write', (e, key, text) => {
  try {
    fs.mkdirSync(SAVES(), { recursive: true });
    const f = saveFile(key), tmp = `${f}.tmp`;
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, f);
    e.returnValue = true;
  } catch (err) { e.returnValue = false; }
});
ipcMain.on('saves:read', (e, key) => {
  try { e.returnValue = fs.readFileSync(saveFile(key), 'utf8'); } catch (err) { e.returnValue = null; }
});
ipcMain.on('saves:remove', (e, key) => {
  try { fs.rmSync(saveFile(key), { force: true }); e.returnValue = true; } catch (err) { e.returnValue = false; }
});
ipcMain.on('app:info', (e) => { e.returnValue = { version: app.getVersion(), platform: process.platform, second }; });
ipcMain.on('app:quit', () => app.quit());

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 640,
    title: TITLE, backgroundColor: '#1d160f', show: false, autoHideMenuBar: true, icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.show(); if (process.argv.includes('--vollbild')) win.setFullScreen(true); });
  // F11 und Alt+Enter: Vollbild; F12 öffnet die Entwicklerwerkzeuge nur mit --entwickler
  win.webContents.on('before-input-event', (ev, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt)) { win.setFullScreen(!win.isFullScreen()); ev.preventDefault(); }
    if (input.key === 'F12' && process.argv.includes('--entwickler')) win.webContents.toggleDevTools();
  });
  // Links nach draußen im Browser öffnen, nie im Spielfenster
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (ev, url) => { if (!url.startsWith('app://')) ev.preventDefault(); });
  win.loadURL('app://spiel/index.html');
  return win;
}

app.whenReady().then(() => {
  // app://spiel/<pfad> -> game/<pfad>; nichts außerhalb von game/
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
    const file = path.normalize(path.join(GAME, rel));
    if (!file.startsWith(GAME + path.sep)) return new Response('Nicht erlaubt', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
});
app.on('window-all-closed', () => app.quit());
