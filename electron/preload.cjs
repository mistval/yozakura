const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yozakura', {
  onNavigate: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('yozakura:navigate', listener);
    return () => {
      ipcRenderer.removeListener('yozakura:navigate', listener);
    };
  },
  notifyReady: () => {
    ipcRenderer.send('yozakura:renderer-ready');
  },
});
