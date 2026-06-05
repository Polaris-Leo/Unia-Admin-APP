import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { requireAuth } from '../middleware/auth.js';
import { getSessions, loadHistory } from '../utils/historyStorage.js';

const router = Router();

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');

router.get('/search', requireAuth, async (req, res, next) => {
  try {
    const { uid, keyword, roomId, from, to } = req.query;
    if (!roomId) return res.status(400).json({ error: '请提供房间号' });

    const roomDir = path.join(DATA_DIR, 'history', String(roomId));
    if (!fs.existsSync(roomDir)) return res.json([]);

    const sessions = fs.readdirSync(roomDir)
      .filter(d => /^\d+$/.test(d) && fs.statSync(path.join(roomDir, d)).isDirectory())
      .map(Number)
      .filter(ts => {
        if (from && ts < Number(from)) return false;
        if (to   && ts > Number(to))   return false;
        return true;
      })
      .sort((a, b) => b - a)
      .slice(0, 30);

    const results = [];

    for (const sessionId of sessions) {
      const filePath = path.join(roomDir, String(sessionId), 'danmaku.jsonl');
      if (!fs.existsSync(filePath)) continue;

      const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          if (item.type !== 'danmaku') continue;
          const matchUid = !uid || String(item.user?.uid) === String(uid);
          const matchKw  = !keyword || item.content?.includes(keyword) || item.user?.username?.includes(keyword);
          if (matchUid && matchKw) {
            results.push({ ...item, sessionId, roomId });
            if (results.length >= 500) break;
          }
        } catch {}
      }
      if (results.length >= 500) break;
    }

    results.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    res.json(results);
  } catch (e) { next(e); }
});

router.get('/:roomId/sessions', requireAuth, async (req, res, next) => {
  try {
    const sessions = await getSessions(req.params.roomId);
    res.json(sessions);
  } catch (e) { next(e); }
});

router.get('/:roomId/:sessionId', requireAuth, async (req, res, next) => {
  try {
    const { roomId, sessionId } = req.params;
    const history = await loadHistory(roomId, sessionId);
    if (!history) return res.status(404).json({ error: '场次不存在' });
    res.json(history);
  } catch (e) { next(e); }
});

export default router;
