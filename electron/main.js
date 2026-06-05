'use strict';

process.env.NODE_NO_WARNINGS = '1';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const net    = require('net');
const http   = require('http');
const crypto = require('crypto');

// ── 持久路径 ────────────────────────────────────────────────────────────────
const USER_DATA   = app.getPath('userData');
const CONFIG_FILE = path.join(USER_DATA, 'unia-config.json');
const JWT_FILE    = path.join(USER_DATA, 'jwt_secret.txt');
const DATA_DIR    = path.join(USER_DATA, 'data');

let mainWin    = null;
let overlayWin = null;
let tray       = null;
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
function getJwtSecret() {
  try {
    if (fs.existsSync(JWT_FILE)) return fs.readFileSync(JWT_FILE, 'utf-8').trim();
    const s = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(JWT_FILE), { recursive: true });
    fs.writeFileSync(JWT_FILE, s);
    return s;
  } catch { return crypto.randomBytes(32).toString('hex'); }
}

// ── 端口 / 服务工具 ──────────────────────────────────────────────────────────
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}
async function waitReady(port) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/cookie-status`);
      if (r.status < 500) return;
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('后端服务启动超时，请重试');
}

// 轻量静态文件服务（远程模式托管前端）
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

// ── 启动内嵌后端 ─────────────────────────────────────────────────────────────
async function startLocalBackend() {
  const port = await freePort();
  const jwtSecret = getJwtSecret();
  const frontendDist = path.join(app.getAppPath(), 'resources', 'frontend-dist');

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const isFirst = !fs.existsSync(path.join(DATA_DIR, 'admin.db'));
  let initPwd = null;
  if (isFirst) initPwd = crypto.randomBytes(6).toString('hex');

  Object.assign(process.env, {
    ELECTRON_RUN:       '1',
    PORT:               String(port),
    DATA_DIR,
    JWT_SECRET:         jwtSecret,
    FRONTEND_DIST:      frontendDist,
    FRONTEND_URL:       `http://127.0.0.1:${port}`,
    COOKIE_MANAGER_URL: '',
    ...(initPwd ? { ADMIN_INIT_PASSWORD: initPwd } : {}),
  });

  require(path.join(app.getAppPath(), 'resources', 'server.cjs'));
  await waitReady(port);
  return { port, initPwd };
}

// ── 创建主窗口（初始隐藏，后续加载内容再显示）──────────────────────────────
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

// ── 创建悬浮窗（初始隐藏）───────────────────────────────────────────────────
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

// ── 在主窗口内展示模式选择页面，返回用户选择结果 ───────────────────────────
function runModeSelect() {
  return new Promise((resolve, reject) => {
    mainWin.loadFile(path.join(__dirname, 'mode-select.html'));
    mainWin.once('ready-to-show', () => mainWin.show());

    const onSelect = (_, data) => {
      mainWin.removeListener('closed', onClose);
      resolve(data);
    };
    const onClose = () => {
      ipcMain.removeListener('mode-select', onSelect);
      reject(new Error('用户关闭了模式选择窗口'));
    };

    ipcMain.once('mode-select', onSelect);
    mainWin.once('closed', onClose);
  });
}

// ── 完成模式选择后启动服务并导航主窗口 ──────────────────────────────────────
async function launchApp(modeInfo) {
  let mainUrl, overlayUrl;

  if (modeInfo.mode === 'local') {
    const { port, initPwd } = await startLocalBackend();
    mainUrl    = `http://127.0.0.1:${port}/?mode=local`;
    overlayUrl = `http://127.0.0.1:${port}/overlay?mode=local`;

    // 导航到应用，页面准备好后自动显示
    mainWin.loadURL(mainUrl);
    if (!mainWin.isVisible()) mainWin.once('ready-to-show', () => mainWin.show());

    if (initPwd) {
      dialog.showMessageBox(mainWin, {
        type: 'info', title: 'Unia 首次启动',
        message: '管理员账户已自动创建',
        detail: `用户名: admin\n密码: ${initPwd}\n\n请登录后在管理员页面修改密码。`,
        buttons: ['确定'],
      });
    }
  } else {
    const distDir = path.join(app.getAppPath(), 'resources', 'frontend-dist');
    frontendPort  = await startFrontendServer(distDir);
    const enc     = encodeURIComponent(modeInfo.url);
    mainUrl    = `http://127.0.0.1:${frontendPort}/?mode=remote&backendUrl=${enc}`;
    overlayUrl = `http://127.0.0.1:${frontendPort}/overlay?mode=remote&backendUrl=${enc}`;

    mainWin.loadURL(mainUrl);
    if (!mainWin.isVisible()) mainWin.once('ready-to-show', () => mainWin.show());
  }

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
    {
      label: '重置运行模式（重启生效）', click: () => {
        saveConfig({ ...loadConfig(), mode: undefined, remoteUrl: undefined });
        dialog.showMessageBox({
          type: 'info', title: '已重置',
          message: '模式已重置，即将重启应用', buttons: ['确定'],
        }).then(() => { app.relaunch(); app.exit(0); });
      },
    },
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
    const cfg = loadConfig();
    let modeInfo;

    if (cfg.mode === 'local') {
      // 有保存的本地模式：显示加载进度页后直接启动
      mainWin.loadFile(path.join(__dirname, 'mode-select.html'), { query: { autoMode: 'local' } });
      mainWin.once('ready-to-show', () => mainWin.show());
      modeInfo = { mode: 'local' };
    } else if (cfg.mode === 'remote' && cfg.remoteUrl) {
      // 有保存的远程模式：显示加载进度页后直接连接
      mainWin.loadFile(path.join(__dirname, 'mode-select.html'), { query: { autoMode: 'remote' } });
      mainWin.once('ready-to-show', () => mainWin.show());
      modeInfo = { mode: 'remote', url: cfg.remoteUrl };
    } else {
      // 首次启动或已重置：在主窗口内展示模式选择页
      modeInfo = await runModeSelect();
      saveConfig({ ...loadConfig(), mode: modeInfo.mode, remoteUrl: modeInfo.url || null });
    }

    await launchApp(modeInfo);
  } catch (e) {
    // 用户主动关闭窗口时静默退出，其他错误弹窗提示
    if (e.message !== '用户关闭了模式选择窗口') {
      dialog.showErrorBox('Unia 启动失败', String(e.message || e));
    }
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
ipcMain.on('overlay-snapshot', (_, data) => {
  overlayWin?.webContents.send('overlay-snapshot', data);
});
ipcMain.on('open-overlay', async () => {
  if (!overlayWin) return;

  // 打开悬浮窗前，从主界面同步登录状态，避免远程模式下悬浮窗误判未登录
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
