const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (json) => ipcRenderer.invoke('save-data', json),
  openFile: (opts) => ipcRenderer.invoke('open-file', opts),
  saveFile: (opts) => ipcRenderer.invoke('save-file', opts),
  savePdf: (opts) => ipcRenderer.invoke('save-pdf', opts),
  reveal: (p) => ipcRenderer.invoke('reveal', p),
  onMenu: (fn) => ipcRenderer.on('menu', (_e, cmd) => fn(cmd)),
});
