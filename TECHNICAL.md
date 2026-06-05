# Unia Admin APP — 技术文档

## 技术栈

| 层次 | 技术 |
|------|------|
| 桌面框架 | Electron 34 |
| 前端 | React 19 + React Router 7 + Vite 6 |
| 后端 | Node.js + Express 4 |
| 数据库 | SQLite（better-sqlite3，内嵌，无需额外安装） |
| WebSocket | ws 库（B 站直播间协议） |
| 打包 | electron-builder（portable exe）+ esbuild（后端 bundle） |
| 认证 | JWT（jsonwebtoken） |

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
         │ HTTP / REST API
         ▼
┌─────────────────────────────────────────────────────┐
│                  Express 后端                         │
│  /api/auth    登录、注册、Token 验证                   │
│  /api/danmaku 开始/停止 WebSocket 连接                 │
│  /api/ban     禁言、解禁                              │
│  /api/history 历史弹幕查询                            │
│  /api/tags    用户标签/备注 CRUD                       │
│  /api/mods    版主管理                                │
│  /api/bilibili B 站账号绑定（Cookie/扫码）             │
└───────────────────────────┬─────────────────────────┘
                            │ WebSocket（B 站直播协议）
                            ▼
                    B 站直播服务器
```

---

## Electron 主进程（`electron/main.js`）

### 启动流程

```
app.whenReady()
  → Menu.setApplicationMenu(null)   // 移除原生菜单栏
  → createMainWindow()              // 创建主窗口（初始隐藏）
  → 读取已保存的运行模式
      ├─ 已保存 local  → 直接启动本地后端
      ├─ 已保存 remote → 直接连接远程地址
      └─ 首次运行      → 展示 mode-select.html（内嵌于主窗口）
  → launchApp(modeInfo)
      ├─ local 模式: startLocalBackend() → 启动内嵌 Express 后端
      └─ remote 模式: startFrontendServer() → 启动轻量静态文件服务
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

配置存储在 Electron `userData` 目录下的 `unia-config.json`，包含：

```json
{
  "mode": "local",
  "remoteUrl": null,
  "mainX": 100, "mainY": 100, "mainWidth": 1200, "mainHeight": 800,
  "overlayX": 50, "overlayY": 100, "overlayWidth": 360, "overlayHeight": 580,
  "overlayOpacity": 0.85,
  "overlayPinned": true
}
```

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
- 接收：后端通过 SSE（Server-Sent Events）或 polling 推送消息至前端
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

---

## 后端（`backend/src/`）

### 数据库（SQLite）

表结构概览：

| 表名 | 说明 |
|------|------|
| `users` | 管理员账户（用户名、bcrypt 密码哈希） |
| `danmaku_history` | 历史弹幕记录（uid、用户名、内容、房间号、时间戳） |
| `ban_records` | 禁言日志（uid、操作者、时长、时间） |
| `user_tags` | 用户标签（uid、tag、备注） |
| `mods` | 版主列表 |

数据库文件路径：`{userData}/data/admin.db`

### B 站 WebSocket（`bilibiliLiveWS.js`）

连接流程：
1. 请求 B 站 API 获取直播间 WebSocket 地址和 token
2. 建立 WebSocket 连接并发送认证包
3. 处理心跳（30s 间隔）
4. 解析 zlib/brotli 压缩的数据包（弹幕、礼物、SC、上舰等）
5. 通过 SSE 推送解析后的消息至前端

### 认证

- JWT 签名密钥存储在 `{userData}/jwt_secret.txt`，首次运行自动生成
- Token 通过 `Authorization: Bearer <token>` 请求头传递
- 首次运行自动创建 `admin` 账户，密码在启动对话框中显示

---

## 构建流程

### 前端构建

```bash
npm run build:frontend
# vite build → resources/frontend-dist/
```

### 后端构建

```bash
npm run build:backend
# esbuild bundle → resources/server.cjs（单文件，含全部依赖）
```

### 打包为 exe

```bash
# 便携版（单文件，双击直接运行）
npm run dist
# 输出: dist/Unia-Admin.exe（约 73 MB）

# 安装包（NSIS 向导，创建桌面 / 开始菜单快捷方式）
npm run dist:setup
# 输出: dist/Unia-Admin-Setup.exe（约 80 MB）
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

## 运行模式对比

| 特性 | 本地模式 | 远程模式 |
|------|---------|---------|
| 后端部署 | 内嵌，自动启动 | 需要独立部署 |
| 数据存储 | `{userData}/data/` | 远程服务器 |
| 适用场景 | 个人单机使用 | 多人协作、服务器部署 |
| 前端服务 | 由内嵌后端托管 | 内置轻量 HTTP 服务器托管 |

---

## 开发注意事项

1. **修改 electron/ 后** 需要 `npm run build:backend` 重新打包后端（因为 main.js 依赖 server.cjs）
2. **修改 frontend/ 后** 需要 `npm run build:frontend`
3. **调试**：`npm start` 直接启动 Electron，前端通过 Vite dev server 或预构建产物提供服务
4. **IPC 安全**：所有渲染进程 API 通过 `contextBridge` 暴露，`contextIsolation: true`，禁用 `nodeIntegration`
5. **外部链接**：跳转外部 URL 一律通过 `shell.openExternal` 由系统默认浏览器打开，防止在 Electron 内加载不受信任的页面
6. **远程模式 backendUrl 持久化**：`initBackendUrl()` 解析到 `backendUrl` 后，同步写入 Electron 配置（`unia-config.json`）；`restoreElectronAuth()` 每次启动优先从配置恢复 `backendUrl`，避免 401 整页刷新后 URL 参数丢失导致请求回退到本地服务器
