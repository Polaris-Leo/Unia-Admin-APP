'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG_FILE = path.join(app.getPath('userData'), 'unia-overlay-config.json');

let win = null;
let tray = null;

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveConfig(data) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
  } catch {}
}

app.whenReady().then(() => {
  const cfg = loadConfig();

  win = new BrowserWindow({
    width:  cfg.width  || 360,
    height: cfg.height || 580,
    x: cfg.x,
    y: cfg.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    hasShadow: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.on('close', () => {
    const bounds = win.getBounds();
    const existing = loadConfig();
    saveConfig({ ...existing, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
  });

  // Minimal 1×1 transparent PNG for tray icon
  const trayIcon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  );
  tray = new Tray(trayIcon);
  tray.setToolTip('Unia 弹幕悬浮窗');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示', click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));
  tray.on('double-click', () => { win.show(); win.focus(); });
});

app.on('window-all-closed', () => app.quit());

ipcMain.handle('load-config', () => loadConfig());
ipcMain.handle('save-config', (_, data) => { saveConfig(data); return true; });
ipcMain.on('close-window',    () => win?.close());
ipcMain.on('minimize-window', () => win?.minimize());
ipcMain.on('toggle-always-on-top', (_, value) => {
  win?.setAlwaysOnTop(value, 'screen-saver');
});
