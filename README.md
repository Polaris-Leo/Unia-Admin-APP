# Unia Admin APP

B 站直播弹幕管理工具，基于 Electron + React 构建。支持实时弹幕监控、用户禁言/标签/备注、历史弹幕查询、透明悬浮窗等功能。

## 功能概览

**弹幕主界面**
- 实时接收 B 站直播间弹幕、礼物、醒目留言（SC）、上舰消息
- 点击用户名弹出操作面板：禁言（本场/1小时/12小时/永久）、解禁、标签、备注、查看历史、跳转 B 站空间
- 弹幕关键词 / 用户名 / UID 实时过滤
- 历史弹幕分页加载（向上滚动加载更早消息）
- 字体大小调节（11–20px）
- 明暗主题切换

**透明悬浮窗**
- 系统级真透明置顶窗口，使用其他软件时弹幕始终可见
- 左侧用户头像 + 用户名 + 弹幕内容双行布局
- 点击用户名触发与主界面相同的操作弹窗
- 背景透明度可调（10%–100%）
- 置顶开关（标题栏 📌 按钮）
- 字号跟随主界面设置同步

**用户管理**
- 禁言列表查看与批量管理
- 用户标签 / 备注（跨直播间持久化）
- 历史弹幕查询（按 UID 或关键词）
- 版主管理

## 环境要求

- Node.js v18+（仅开发时需要）
- Windows 10/11（macOS 理论可用，未针对性测试）

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（需先构建前端）
npm run build
npm start

# 打包为单文件便携版 .exe
npm run dist

# 打包为 NSIS 安装包（带安装向导，创建桌面和开始菜单快捷方式）
npm run dist:setup
```

| 产物 | 命令 | 说明 |
|------|------|------|
| `dist/Unia-Admin.exe` | `npm run dist` | 便携版，单文件，双击直接运行 |
| `dist/Unia-Admin-Setup.exe` | `npm run dist:setup` | 安装包，有安装向导，可自定义安装目录，支持原位更新 |

两者均无需在目标机器上安装 Node.js。

> **安装包更新说明**：`Unia-Admin-Setup.exe` 支持直接覆盖旧版更新，无需先卸载。运行新版安装包时会自动检测已安装版本，提示确认后关闭旧程序并安装到原目录。

## 下载

前往 [Releases](https://github.com/Polaris-Leo/Unia-Admin-APP/releases) 页面下载最新版本。

## 项目结构

```
Unia-Admin-APP/
├── electron/               # Electron 主进程
│   ├── main.js             # 窗口管理、IPC、托盘、应用生命周期
│   └── preload.js          # 渲染进程与主进程的桥接 API
├── frontend/               # React 前端
│   └── src/
│       ├── pages/
│       │   ├── DanmakuPage.jsx     # 弹幕主界面
│       │   ├── OverlayPage.jsx     # 透明悬浮窗
│       │   ├── HistoryPage.jsx     # 历史弹幕
│       │   ├── BanLogPage.jsx      # 禁言日志
│       │   ├── ModsPage.jsx        # 版主管理
│       │   └── LoginPage.jsx       # 登录
│       └── components/
│           ├── UserActionPopup.jsx  # 用户操作弹窗
│           ├── NavBar.jsx           # 顶部导航栏
│           ├── HistoryDrawer.jsx    # 历史记录抽屉
│           └── BilibiliLoginModal.jsx
├── resources/              # 构建产物（构建后生成）
│   └── frontend-dist/      # 打包后的前端静态文件
├── scripts/
│   └── patch-icon.mjs      # 图标修补脚本
├── ICON.png                # 应用图标源文件
└── ICON.ico                # 应用图标（打包用）
```

## 技术文档

详见 [TECHNICAL.md](./TECHNICAL.md)

## License

MIT
