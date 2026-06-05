import { config as dotenvConfig } from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import fs from 'fs';
import cors from 'cors';
import path from 'path';
import { initDb } from './db.js';
import axios from 'axios';
import authRouter from './routes/auth.js';
import danmakuRouter, { createDanmakuWSS, connectRoom } from './routes/danmaku.js';
import banRouter from './routes/ban.js';
import historyRouter from './routes/history.js';
import tagsRouter from './routes/tags.js';
import modsRouter from './routes/mods.js';
import bilibiliRouter from './routes/bilibili.js';
import { loadCookies, loadLocalCookies } from './utils/cookieStorage.js';

// 仅在非 Electron 环境中加载 .env 文件
if (!process.env.ELECTRON_RUN) {
  dotenvConfig();
}

const PORT = process.env.PORT || 3001;

function ensureDataFiles() {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  fs.mkdirSync(path.join(dataDir, 'history'), { recursive: true });
  for (const file of ['face-cache.json', 'emote-cache.json', 'gift-cache.json']) {
    const filePath = path.join(dataDir, file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '{}');
    }
  }
}

ensureDataFiles();
initDb();

const app = express();
const server = createServer(app);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/cookie-status', async (req, res) => {
  // BiliCookie 服务已禁用（COOKIE_MANAGER_URL 为空）
  const localCookies = loadLocalCookies();
  const localAuth = !!(localCookies?.SESSDATA && localCookies?.bili_jct);
  const localUid = localCookies?.DedeUserID || null;

  res.json({
    activeSource: localAuth ? 'local' : 'none',
    remote: { configured: false, url: null, connected: false, uid: null, configuredUid: null },
    local: { authenticated: localAuth, uid: localUid },
  });
});

app.use('/api/auth',     authRouter);
app.use('/api/danmaku',  danmakuRouter);
app.use('/api/ban',      banRouter);
app.use('/api/history',  historyRouter);
app.use('/api/tags',     tagsRouter);
app.use('/api/mods',     modsRouter);
app.use('/api/bilibili', bilibiliRouter);

// 托管前端构建产物
const frontendDist = process.env.FRONTEND_DIST || path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

createDanmakuWSS(server);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ Unia backend running on port ${PORT}`);
  const roomId = process.env.ROOM_ID;
  if (roomId) {
    setTimeout(() => connectRoom(roomId).catch(e => console.error('自动连接失败:', e.message)), 1000);
  }
});
