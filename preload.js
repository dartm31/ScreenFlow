const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getMonitors: () => ipcRenderer.invoke('get-monitors'),
  toggleFocus: () => ipcRenderer.invoke('toggle-focus'),
  getFocusStatus: () => ipcRenderer.invoke('get-focus-status'),
  getTranslations: () => ipcRenderer.invoke('get-translations'),
  onFocusStatusChanged: (callback) => ipcRenderer.on('focus-status-changed', (event, status) => callback(status)),
  onConfigUpdated: (callback) => ipcRenderer.on('config-updated', (event, newConfig) => callback(newConfig))
});
