// 위젯·설정창이 앱(main.js)과 주고받는 통로
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('iceNative', {
  postMessage: msg => ipcRenderer.send('ice', msg),
});
contextBridge.exposeInMainWorld('iceSettings', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: s => ipcRenderer.invoke('settings:save', s),
  pickPhoto: () => ipcRenderer.invoke('settings:photo'),
  setScale: v => ipcRenderer.send('settings:scale', v),
  onScale: f => ipcRenderer.on('scale', (_e, v) => f(v)),
});
