// Brücke zwischen Spiel und Desktop-App: nur diese Funktionen sieht das Spiel (window.ritterDesktop), keinen Node-Zugriff.
// Speichern und Laden laufen synchron, damit save.js im Browser und in der App gleich arbeitet.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ritterDesktop', {
  saves: {
    write: (key, text) => ipcRenderer.sendSync('saves:write', String(key), String(text)),
    read: (key) => ipcRenderer.sendSync('saves:read', String(key)),
    remove: (key) => ipcRenderer.sendSync('saves:remove', String(key)),
  },
  info: () => ipcRenderer.sendSync('app:info'),
  quit: () => ipcRenderer.send('app:quit'),
});
