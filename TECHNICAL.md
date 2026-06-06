# Unia Admin APP — 技术文档

## 技术栈

| 层次 | 技术 |
|------|------|
| 桌面框架 | Electron 34 |
| 前端 | React 19 + React Router 7 + Vite 6 |
| 打包 | electron-builder（portable exe / NSIS 安装包） |

---

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│                   Electron 主进程                    │
│  main.js                                             │
│  ┌──────────────┐  ┌────────────────────────────┐   │
│  │  主窗口       │  │  悬浮窗（透明 alwaysOnTop）  │   │
│  │  BrowserWindow│  │  BrowserWindow             │   │
│  └──────┬───────┘  └────────────┬───────────────┘   │
│         │ IPC                   │ IPC                │
│  ┌──────▼───────────────────────▼───────────────┐   │
│  │              preload.js (contextBridge)       │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  内置轻量 HTTP 服务器（托管 frontend-dist 静态文件）   │
└─────────────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
┌─────────────────┐    ┌───────────────────┐
│  React 前端      │    │  React 前端        │
│  /（DanmakuPage）│    │  /overlay         │
│  /history       │    │  (OverlayPage)     │
│  /ban-logs      │    └───────────────────┘
│  /mods          │
└────────┬────────┘
         │ HTTP / REST API（连接远程后端）
         ▼
┌─────────────────────────────────────────────────────┐
│              远程 Unia 后端服务（独立部署）             │
└─────────────────────────────────────────────────────┘
```

---

## Electron 主进程（`electron/main.js`）

### 启动流程

```
app.whenReady()
  → Menu.setApplicationMenu(null)   // 移除原生菜单栏
  → createMainWindow()              // 创建主窗口（初始隐藏）
  → launchApp()
      → startFrontendServer()       // 启动内置静态文件服务
      → 加载前端，附带 ?mode=remote&backendUrl=...
  → createOverlayWindow(overlayUrl) // 创建悬浮窗（初始隐藏）
  → setupTray()                     // 创建托盘图标
```

### 窗口类型

| 窗口 | 说明 |
|------|------|
| 主窗口 | `frame: true`，标准窗口，承载管理界面 |
| 悬浮窗 | `transparent: true, frame: false, alwaysOnTop: true`，系统级透明置顶，最小宽度 272px |

### IPC 通信

主进程与渲染进程通过 `contextBridge` 暴露的 `window.electronAPI` 通信。

| 方向 | Channel | 说明 |
|------|---------|------|
| 渲染→主 | `load-config` | 读取持久化配置（invoke） |
| 渲染→主 | `save-config` | 写入配置并广播给所有窗口（invoke） |
| 渲染→主 | `open-overlay` | 同步 token 后展示悬浮窗 |
| 渲染→主 | `overlay-snapshot` | 主界面推送弹幕快照给悬浮窗 |
| 渲染→主 | `toggle-overlay-pin` | 切换悬浮窗置顶状态 |
| 渲染→主 | `open-external` | 用系统默认浏览器打开 URL |
| 主→渲染 | `overlay-snapshot` | 悬浮窗接收弹幕数据 |
| 主→渲染 | `config-updated` | 配置变更广播 |
| 主→渲染 | `overlay-sync-request` | 请求主界面重新推送快照 |

### 配置持久化

配置存储在 Electron `userData` 目录下的 `unia-config.json`：

- Windows：`%APPDATA%\unia-admin\unia-config.json`

```json
{
  "mainX": 100, "mainY": 100, "mainWidth": 1200, "mainHeight": 800,
  "overlayX": 50, "overlayY": 100, "overlayWidth": 360, "overlayHeight": 580,
  "overlayOpacity": 0.85,
  "overlayPinned": true
}
```

仅保存窗口位置/尺寸及悬浮窗设置，后端地址不需要配置。

---

## 前端（`frontend/src/`）

### 路由结构

```
/login             → LoginPage
/register          → RegisterPage
/overlay           → OverlayPage（悬浮窗专用，不需要登录）
/                  → DanmakuPage（需登录）
/history           → HistoryPage
/ban-logs          → BanLogPage
/mods              → ModsPage
```

### DanmakuPage 核心逻辑

**WebSocket 生命周期**
- 连接：调用 `POST /api/danmaku/start`，后端建立与 B 站的 WebSocket
- 接收：后端通过 SSE（Server-Sent Events）推送消息至前端
- 消息类型：`danmaku`（弹幕）、`gift`（礼物）、`superchat`（SC）、`guard`（上舰）、`system`（系统通知）

**弹幕列表管理**
- 直播中最多保留 3000 条（`MAX_LIVE`）
- 历史模式分页加载，每页 100 条（`PAGE`）
- 自动滚动：距底部 < 80px 时维持自动滚动，否则显示「N 条新消息」按钮

**用户操作弹窗（`UserActionPopup`）**
- 点击弹幕行的用户区域触发
- 定位逻辑：优先显示在点击元素右下方，超出视口时自动反向（宽 252px，高估 360px）
- 功能：禁言/解禁、标签/备注 CRUD、查看历史弹幕、跳转 B 站空间（系统浏览器）

### OverlayPage（悬浮窗）

**数据流**
```
DanmakuPage（主窗口）
  → window.electronAPI.sendOverlaySnapshot(data)
  → IPC: overlay-snapshot
  → 主进程转发给悬浮窗
  → OverlayPage.onOverlaySnapshot
  → setMsgs() / setConnected() / setFontSize()
```

**布局**（CSS Grid）
```
┌───┬──────────────────────┐
│   │ 用户名                │  ← ov-row-meta
│ 头 ├──────────────────────┤
│ 像 │ 弹幕内容              │  ← ov-content
└───┴──────────────────────┘
  ↑ grid-row: 1 / span 2
```

**透明度控制**
- `--ov-bg-alpha` CSS 变量控制背景透明度
- 在主界面设置面板调节，通过 `saveConfig` → IPC `config-updated` 同步至悬浮窗

**防误触锁定**
- 标题栏锁定按钮切换 `locked` state，为 `ov-root` 添加 `ov-locked` class
- 锁定时通过 CSS `pointer-events: none` 禁用标题栏左侧、弹幕列表、置顶和窗口控制按钮的所有交互
- 锁定按钮本身始终保持 `pointer-events: auto`，确保可随时解锁

---

## 构建流程

### 前端构建

```bash
npm run build
# vite build → resources/frontend-dist/
```

### 打包为 exe

```bash
# 便携版（单文件，双击直接运行）
npm run dist
# 输出: dist/Unia-Admin.exe

# 安装包（NSIS 向导，创建桌面 / 开始菜单快捷方式）
npm run dist:setup
# 输出: dist/Unia-Admin-Setup.exe
```

electron-builder 配置（`package.json` 中的 `build` 字段）：

```json
{
  "appId": "com.unia.admin",
  "productName": "Unia管理工具",
  "icon": "ICON.ico",
  "files": ["electron/**", "resources/**", "package.json"],
  "asar": true,
  "win": {
    "icon": "ICON.ico",
    "target": [{ "target": "portable", "arch": ["x64"] }]
  },
  "portable": { "artifactName": "Unia-Admin.exe" },
  "nsis": {
    "installerIcon": "ICON.ico",
    "artifactName": "Unia-Admin-Setup.exe",
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "shortcutName": "Unia管理工具"
  }
}
```

---

## 开发注意事项

1. **修改 frontend/ 后** 需要 `npm run build` 重新构建前端产物
2. **调试**：`npm start` 直接启动 Electron，使用预构建的 `resources/frontend-dist/`
3. **IPC 安全**：所有渲染进程 API 通过 `contextBridge` 暴露，`contextIsolation: true`，禁用 `nodeIntegration`
4. **外部链接**：跳转外部 URL 一律通过 `shell.openExternal` 由系统默认浏览器打开
5. **backendUrl 持久化**：`initBackendUrl()` 解析到 `backendUrl` 后，同步写入 Electron 配置；每次启动优先从配置恢复，避免页面刷新后参数丢失
