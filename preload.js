'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadConfig:          ()      => ipcRenderer.invoke('load-config'),
  saveConfig:          (data)  => ipcRenderer.invoke('save-config', data),
  closeWindow:         ()      => ipcRenderer.send('close-window'),
  minimizeWindow:      ()      => ipcRenderer.send('minimize-window'),
  toggleAlwaysOnTop:   (value) => ipcRenderer.send('toggle-always-on-top', value),
});
