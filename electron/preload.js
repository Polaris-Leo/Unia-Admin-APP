'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 主窗口及悬浮窗通用 API
contextBridge.exposeInMainWorld('electronAPI', {
  loadConfig:  ()      => ipcRenderer.invoke('load-config'),
  saveConfig:  (data)  => ipcRenderer.invoke('save-config', data),

  closeWindow:       () => ipcRenderer.send('close-window'),
  minimizeWindow:    () => ipcRenderer.send('minimize-window'),
  toggleAlwaysOnTop: (v) => ipcRenderer.send('toggle-always-on-top', v),

  closeOverlay:     () => ipcRenderer.send('close-overlay'),
  minimizeOverlay:  () => ipcRenderer.send('minimize-overlay'),
  toggleOverlayPin: (v) => ipcRenderer.send('toggle-overlay-pin', v),

  openOverlay:    () => ipcRenderer.send('open-overlay'),
  openExternal:   (url) => ipcRenderer.send('open-external', url),

  // 主界面 → 悬浮窗：同步当前弹幕列表和连接状态
  sendOverlaySnapshot: (data) => ipcRenderer.send('overlay-snapshot', data),
  onOverlaySnapshot: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('overlay-snapshot', handler);
    return () => ipcRenderer.removeListener('overlay-snapshot', handler);
  },
  onOverlaySyncRequest: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('overlay-sync-request', handler);
    return () => ipcRenderer.removeListener('overlay-sync-request', handler);
  },
  onConfigUpdated: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('config-updated', handler);
    return () => ipcRenderer.removeListener('config-updated', handler);
  },
});

// 模式选择页面专用 API（mode-select.html 中调用）
contextBridge.exposeInMainWorld('modeSelectAPI', {
  selectLocal:  ()    => ipcRenderer.send('mode-select', { mode: 'local' }),
  selectRemote: (url) => ipcRenderer.send('mode-select', { mode: 'remote', url }),
});
