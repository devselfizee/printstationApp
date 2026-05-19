const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updater', {
  skip: () => ipcRenderer.send('update:skip'),
  start: () => ipcRenderer.send('update:start'),
  onProgress: (cb) => ipcRenderer.on('update:progress', (_e, pct) => cb(pct)),
  onComplete: (cb) => ipcRenderer.on('update:complete', () => cb()),
  onError: (cb) => ipcRenderer.on('update:error', (_e, msg) => cb(msg)),
});
