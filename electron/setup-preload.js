'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('setupAPI', {
  submit: (url) => ipcRenderer.send('setup-submit', url),
  cancel: () => ipcRenderer.send('setup-cancel'),
});
