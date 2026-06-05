import { Router } from 'express';
import { WebSocketServer } from 'ws';
import { BilibiliLiveWS } from '../services/bilibiliLiveWS.js';
import { loadCookies } from '../utils/cookieStorage.js';
import { getLastSessionId, loadRecentHistory, loadSessionChunk } from '../utils/historyStorage.js';
import { requireAuth } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';

const router = Router();
const SECRET = process.env.JWT_SECRET || 'change_me';

let currentWS = null;
let currentRoomId = null;
let wss = null;

// 缓存最新状态，供新连接的前端客户端立即同步
let cachedRoomInfo = null;
let cachedLiveStatus = null;

function broadcast(data) {
  if (!wss) return;
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

function attachHandlers(liveWS) {
  liveWS.onDanmaku    = (msg) => broadcast(msg);
  liveWS.onGift       = (msg) => broadcast(msg);
  liveWS.onGuard      = (msg) => broadcast(msg);
  liveWS.onSuperChat  = (msg) => broadcast(msg);
  liveWS.onLiveStatus = (msg) => {
    cachedLiveStatus = { type: 'live_status', ...msg };
    broadcast(cachedLiveStatus);
  };
  liveWS.onRoomInfo = (msg) => {
    cachedRoomInfo = { type: 'room_info', ...msg };
    broadcast(cachedRoomInfo);
  };
  liveWS.onWatched    = (msg) => broadcast(msg);
  liveWS.onLike       = (msg) => broadcast(msg);
  liveWS.onRankCount  = (msg) => broadcast(msg);
  liveWS.onPopularity = (msg) => broadcast(msg);
}

export async function connectRoom(roomId) {
  if (currentWS) {
    currentWS._intentionalDisconnect = true;
    currentWS.disconnect?.();
  }
  cachedRoomInfo = null;
  cachedLiveStatus = null;

  const cookies = await loadCookies();
  currentWS = new BilibiliLiveWS(roomId, cookies);
  currentRoomId = roomId;
  attachHandlers(currentWS);
  await currentWS.connect();
  console.log(`✅ 已连接直播间 ${roomId}`);

  // 连接成功后主动拉取直播间信息和状态
  setTimeout(async () => {
    try {
      const [roomInfo, liveStatus] = await Promise.all([
        currentWS.getRoomInfo(),
        currentWS.getLiveStatus()
      ]);
      if (roomInfo && currentWS.onRoomInfo) currentWS.onRoomInfo(roomInfo);
      if (liveStatus && currentWS.onLiveStatus) currentWS.onLiveStatus(liveStatus);

      // 非直播状态（轮播/未开播）currentSessionId 为 null，无法存储弹幕
      // 优先复用磁盘上最近的 session，避免每次重连都生成新文件夹
      if (!currentWS.currentSessionId) {
        const lastSession = await getLastSessionId(currentRoomId);
        if (lastSession) {
          currentWS.currentSessionId = lastSession;
          console.log(`📝 非直播状态，复用已有 session: ${lastSession}`);
        } else {
          currentWS.currentSessionId = Math.floor(Date.now() / 1000);
          console.log(`📝 非直播状态，创建兜底 session: ${currentWS.currentSessionId}`);
        }
      }
    } catch (e) {
      console.error('[danmaku] 拉取房间信息失败:', e.message);
    }
  }, 1500);
}

router.post('/start', requireAuth, async (req, res, next) => {
  try {
    const roomId = req.body.roomId || process.env.ROOM_ID;
    if (!roomId) return res.status(400).json({ error: '未配置房间号' });
    await connectRoom(roomId);
    res.json({ ok: true, roomId: currentRoomId });
  } catch (e) { next(e); }
});

router.post('/stop', requireAuth, (req, res) => {
  if (currentWS) {
    currentWS._intentionalDisconnect = true;
    currentWS.disconnect?.();
    currentWS = null;
    currentRoomId = null;
  }
  cachedRoomInfo = null;
  cachedLiveStatus = null;
  res.json({ ok: true });
});

router.get('/recent', requireAuth, async (req, res, next) => {
  try {
    const sessionId = currentWS?.currentSessionId;
    if (!currentRoomId || !sessionId) {
      return res.json({ danmaku: [], superchat: [], gift: [] });
    }
    const data = await loadRecentHistory(currentRoomId, sessionId, 100);
    res.json(data || { danmaku: [], superchat: [], gift: [] });
  } catch (e) { next(e); }
});

router.get('/session', requireAuth, async (req, res, next) => {
  try {
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const limit  = Math.min(Math.max(1, parseInt(req.query.limit) || 300), 500);
    const sessionId = currentWS?.currentSessionId;
    if (!currentRoomId || !sessionId) {
      return res.json({ danmaku: [], total: 0, superchat: [], gift: [] });
    }
    const data = await loadSessionChunk(currentRoomId, sessionId, offset, limit);
    res.json(data ?? { danmaku: [], total: 0, superchat: [], gift: [] });
  } catch (e) { next(e); }
});

router.get('/rooms', requireAuth, (req, res) => {
  res.json({
    roomId: currentRoomId,
    configured: process.env.ROOM_ID || null,
    connected: !!currentWS?.isConnected
  });
});

export function createDanmakuWSS(server) {
  wss = new WebSocketServer({ server, path: '/ws/danmaku' });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    try {
      jwt.verify(token, SECRET);
    } catch {
      ws.close(4001, 'Unauthorized');
      return;
    }
    ws.on('error', () => {});

    // 延一个事件循环，等 Vite 代理管道完全建立后再推送缓存状态
    setImmediate(() => {
      if (ws.readyState !== ws.OPEN) return;
      if (cachedLiveStatus) ws.send(JSON.stringify(cachedLiveStatus));
      if (cachedRoomInfo)   ws.send(JSON.stringify(cachedRoomInfo));
    });
  });
}

export default router;
