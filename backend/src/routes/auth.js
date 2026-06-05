import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { requireAuth, requireAdmin, signToken } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '请填写用户名和密码' });

    const mod = db.prepare('SELECT * FROM mods WHERE username = ? AND disabled_at IS NULL').get(username);
    if (!mod) return res.status(401).json({ error: '用户名或密码错误' });

    const ok = await bcrypt.compare(password, mod.password_hash);
    if (!ok) return res.status(401).json({ error: '用户名或密码错误' });

    const token = signToken({ id: mod.id, username: mod.username, role: mod.role });
    res.json({ token, username: mod.username, role: mod.role });
  } catch (e) { next(e); }
});

router.post('/register', async (req, res, next) => {
  try {
    const { token, username, password } = req.body;
    if (!token || !username || !password) return res.status(400).json({ error: '参数不完整' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });

    const invite = db.prepare(
      'SELECT * FROM invite_tokens WHERE token = ? AND used_by IS NULL AND expires_at > ?'
    ).get(token, Date.now());
    if (!invite) return res.status(400).json({ error: '邀请链接无效或已过期' });

    const exists = db.prepare('SELECT id FROM mods WHERE username = ?').get(username);
    if (exists) return res.status(400).json({ error: '用户名已被使用' });

    const hash = await bcrypt.hash(password, 12);
    const now = Date.now();
    const result = db.prepare(
      `INSERT INTO mods (username, password_hash, role, created_at, invited_by) VALUES (?, ?, 'mod', ?, ?)`
    ).run(username, hash, now, invite.created_by);

    db.prepare('UPDATE invite_tokens SET used_by = ?, used_at = ? WHERE id = ?')
      .run(result.lastInsertRowid, now, invite.id);

    const jwt = signToken({ id: result.lastInsertRowid, username, role: 'mod' });
    res.json({ token: jwt, username, role: 'mod' });
  } catch (e) { next(e); }
});

router.post('/invite', requireAuth, requireAdmin, (req, res, next) => {
  try {
    const { expiresHours = 24 } = req.body;
    const token = uuidv4();
    const expiresAt = Date.now() + expiresHours * 3600 * 1000;

    db.prepare('INSERT INTO invite_tokens (token, created_by, expires_at) VALUES (?, ?, ?)')
      .run(token, req.mod.id, expiresAt);

    const baseUrl = (process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    res.json({ token, link: `${baseUrl}/register?token=${token}`, expiresAt });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, (req, res) => {
  const mod = db.prepare('SELECT id, username, role, is_superadmin, created_at FROM mods WHERE id = ?').get(req.mod.id);
  res.json(mod);
});

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const updates = [];
    const params = [];

    if (username !== undefined) {
      if (!username.trim()) return res.status(400).json({ error: '用户名不能为空' });
      const exists = db.prepare('SELECT id FROM mods WHERE username = ? AND id != ?').get(username.trim(), req.mod.id);
      if (exists) return res.status(400).json({ error: '用户名已被使用' });
      updates.push('username = ?');
      params.push(username.trim());
    }

    if (password !== undefined) {
      if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
      const hash = await bcrypt.hash(password, 12);
      updates.push('password_hash = ?');
      params.push(hash);
    }

    if (updates.length === 0) return res.status(400).json({ error: '没有需要修改的内容' });

    params.push(req.mod.id);
    db.prepare(`UPDATE mods SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT id, username, role, created_at FROM mods WHERE id = ?').get(req.mod.id);
    res.json(updated);
  } catch (e) { next(e); }
});

export default router;
