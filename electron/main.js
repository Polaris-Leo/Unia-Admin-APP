'use strict';

process.env.NODE_NO_WARNINGS = '1';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const net    = require('net');
const http   = require('http');

const BACKEND_URL = 'https://adminbot.unia.love';

// ── 持久路径 ────────────────────────────────────────────────────────────────
const USER_DATA   = app.getPath('userData');
const CONFIG_FILE = path.join(USER_DATA, 'unia-config.json');

let mainWin      = null;
let overlayWin   = null;
let tray         = null;
let frontendPort = null;

// ── 配置读写 ─────────────────────────────────────────────────────────────────
function loadConfig() {
  try { if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); }
  catch {}
  return {};
}
function saveConfig(data) {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2)); } catch {}
}

// ── 端口 / 静态文件服务 ──────────────────────────────────────────────────────
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml', '.png': 'image/png',
  '.ico':  'image/x-icon',  '.json': 'application/json',
  '.woff2': 'font/woff2',   '.woff': 'font/woff', '.ttf': 'font/ttf',
};
function startFrontendServer(distDir) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0].split('#')[0];
      let file = path.join(distDir, urlPath === '/' ? 'index.html' : urlPath);
      if (!fs.existsSync(file)) file = path.join(distDir, 'index.html');
      const ct = MIME[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ct });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv.address().port));
  });
}

// ── 创建主窗口 ───────────────────────────────────────────────────────────────
function createMainWindow() {
  const cfg = loadConfig();
  mainWin = new BrowserWindow({
    width:    cfg.mainWidth  || 1200,
    height:   cfg.mainHeight || 800,
    x: cfg.mainX, y: cfg.mainY,
    minWidth: 900, minHeight: 600,
    frame: true, title: 'Unia 管理工具',
    backgroundColor: '#111111',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  mainWin.on('close', () => {
    const b = mainWin.getBounds();
    saveConfig({ ...loadConfig(), mainX: b.x, mainY: b.y, mainWidth: b.width, mainHeight: b.height });
    app.quit();
  });
  mainWin.on('closed', () => { mainWin = null; });
}

// ── 创建悬浮窗 ───────────────────────────────────────────────────────────────
function createOverlayWindow(url) {
  const cfg = loadConfig();
  overlayWin = new BrowserWindow({
    width:  cfg.overlayWidth  || 360,
    height: cfg.overlayHeight || 580,
    x: cfg.overlayX, y: cfg.overlayY,
    transparent: true, frame: false,
    alwaysOnTop: true, resizable: true,
    minWidth: 272,
    hasShadow: false, skipTaskbar: false,
    title: 'Unia 弹幕悬浮窗',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.loadURL(url);
  overlayWin.hide();
  overlayWin.on('close', (e) => {
    e.preventDefault();
    const b = overlayWin.getBounds();
    saveConfig({ ...loadConfig(), overlayX: b.x, overlayY: b.y, overlayWidth: b.width, overlayHeight: b.height });
    overlayWin.hide();
  });
}

// ── 启动应用 ─────────────────────────────────────────────────────────────────
async function launchApp() {
  const distDir    = path.join(app.getAppPath(), 'resources', 'frontend-dist');
  frontendPort     = await startFrontendServer(distDir);
  const enc        = encodeURIComponent(BACKEND_URL);
  const mainUrl    = `http://127.0.0.1:${frontendPort}/?mode=remote&backendUrl=${enc}`;
  const overlayUrl = `http://127.0.0.1:${frontendPort}/overlay?mode=remote&backendUrl=${enc}`;

  mainWin.loadURL(mainUrl);
  mainWin.once('ready-to-show', () => mainWin.show());

  createOverlayWindow(overlayUrl);
  setupTray();
}

// ── 托盘 ─────────────────────────────────────────────────────────────────────
function setupTray() {
  if (tray) return;
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  );
  tray = new Tray(icon);
  tray.setToolTip('Unia 管理工具');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主界面',     click: () => { mainWin?.show(); mainWin?.focus(); } },
    { label: '显示弹幕悬浮窗', click: () => { overlayWin?.show(); overlayWin?.focus(); } },
    { type: 'separator' },
    { label: '退出', click: () => app.exit(0) },
  ]));
  tray.on('double-click', () => { mainWin?.show(); mainWin?.focus(); });
}

// ── 应用启动入口 ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  try {
    createMainWindow();
    await launchApp();
  } catch (e) {
    const { dialog } = require('electron');
    dialog.showErrorBox('Unia 启动失败', String(e.message || e));
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { overlayWin?.removeAllListeners('close'); });

// ── IPC 处理 ─────────────────────────────────────────────────────────────────
ipcMain.handle('load-config',        () => loadConfig());
ipcMain.handle('save-config', (_, d) => {
  saveConfig(d);
  mainWin?.webContents.send('config-updated', d);
  overlayWin?.webContents.send('config-updated', d);
  return true;
});

ipcMain.on('open-external', (_, url) => { if (url?.startsWith('https://')) shell.openExternal(url); });
ipcMain.on('close-window',         () => mainWin?.close());
ipcMain.on('minimize-window',      () => mainWin?.minimize());
ipcMain.on('toggle-always-on-top', (_, v) => mainWin?.setAlwaysOnTop(v, 'screen-saver'));

ipcMain.on('close-overlay', () => {
  if (!overlayWin) return;
  const b = overlayWin.getBounds();
  saveConfig({ ...loadConfig(), overlayX: b.x, overlayY: b.y, overlayWidth: b.width, overlayHeight: b.height });
  overlayWin.hide();
});
ipcMain.on('minimize-overlay',   () => overlayWin?.minimize());
ipcMain.on('toggle-overlay-pin', (_, v) => overlayWin?.setAlwaysOnTop(v, 'screen-saver'));
ipcMain.on('set-overlay-ignore-mouse', (_, ignore) => {
  overlayWin?.setIgnoreMouseEvents(ignore, { forward: true });
});
ipcMain.on('overlay-snapshot', (_, data) => {
  overlayWin?.webContents.send('overlay-snapshot', data);
});
ipcMain.on('open-overlay', async () => {
  if (!overlayWin) return;

  try {
    const state = await mainWin?.webContents.executeJavaScript(`({
      token: localStorage.getItem('token'),
      backendUrl: localStorage.getItem('backendUrl')
    })`);
    if (state?.token || state?.backendUrl) {
      await overlayWin.webContents.executeJavaScript(`
        ${JSON.stringify(state.token)} ? localStorage.setItem('token', ${JSON.stringify(state.token)}) : localStorage.removeItem('token');
        ${JSON.stringify(state.backendUrl)} ? localStorage.setItem('backendUrl', ${JSON.stringify(state.backendUrl)}) : localStorage.removeItem('backendUrl');
        window.dispatchEvent(new StorageEvent('storage', { key: 'token', newValue: ${JSON.stringify(state.token)} }));
      `);
    }
  } catch {}

  overlayWin.show();
  overlayWin.focus();
  mainWin?.webContents.send('overlay-sync-request');
});
