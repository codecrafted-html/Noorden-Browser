const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('browser', {
  command: (name, value) => ipcRenderer.send('browser:command', name, value),
  onState: callback => ipcRenderer.on('browser:state', (_event, value) => callback(value)),
  onFocusAddress: callback => ipcRenderer.on('browser:focus-address', () => callback()),
  onFind: callback => ipcRenderer.on('browser:find', () => callback()),
  onFindResult: callback => ipcRenderer.on('browser:find-result', (_event, result) => callback(result)),
  onOverlayImage: callback => ipcRenderer.on('browser:overlay-image', (_event, image) => callback(image))
});
