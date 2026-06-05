import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// 用户列表
router.get('/', requireAuth, requireAdmin, (req, res, next) => {
  try {
    const rows = db.prepare(`
      SELECT m.id, m.username, m.role, m.is_superadmin, m.disabled_at, m.created_at,
             inv.username AS invited_by_name
      FROM mods m
      LEFT JOIN mods inv ON inv.id = m.invited_by
      ORDER BY m.created_at DESC
    `).all();
    res.json(rows);
  } catch (e) { next(e); }
});

// 直接创建用户（管理员手动添加，无需邀请码）
router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { username, password, role = 'mod' } = req.body;
    if (!username || !password) return res.status(400).json({ error: '请填写用户名和密码' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
    if (!['admin', 'mod'].includes(role)) return res.status(400).json({ error: '角色无效' });

    const exists = db.prepare('SELECT id FROM mods WHERE username = ?').get(username);
    if (exists) return res.status(400).json({ error: '用户名已存在' });

    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare(
      `INSERT INTO mods (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)`
    ).run(username, hash, role, Date.now());

    res.json({ id: result.lastInsertRowid, username, role });
  } catch (e) { next(e); }
});

// 修改用户名或密码（所有用户均可操作，包括超级管理员）
router.patch('/:modId/profile', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.modId);
    const { username, password } = req.body;
    if (!username && !password) return res.status(400).json({ error: '请提供新用户名或新密码' });

    if (username) {
      const exists = db.prepare('SELECT id FROM mods WHERE username = ? AND id != ?').get(username, id);
      if (exists) return res.status(400).json({ error: '用户名已被使用' });
      db.prepare('UPDATE mods SET username = ? WHERE id = ?').run(username, id);
    }

    if (password) {
      if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
      const hash = await bcrypt.hash(password, 12);
      db.prepare('UPDATE mods SET password_hash = ? WHERE id = ?').run(hash, id);
    }

    const updated = db.prepare('SELECT id, username, role, is_superadmin FROM mods WHERE id = ?').get(id);
    res.json(updated);
  } catch (e) { next(e); }
});

// 禁用用户
router.patch('/:modId/disable', requireAuth, requireAdmin, (req, res, next) => {
  try {
    const id = Number(req.params.modId);
    if (id === req.mod.id) return res.status(400).json({ error: '不能禁用自己' });
    const target = db.prepare('SELECT is_superadmin FROM mods WHERE id = ?').get(id);
    if (target?.is_superadmin) return res.status(403).json({ error: '超级管理员账户不能禁用' });
    db.prepare('UPDATE mods SET disabled_at = ? WHERE id = ?').run(Date.now(), id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// 启用用户
router.patch('/:modId/enable', requireAuth, requireAdmin, (req, res, next) => {
  try {
    const id = Number(req.params.modId);
    db.prepare('UPDATE mods SET disabled_at = NULL WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// 修改用户角色
router.patch('/:modId/role', requireAuth, requireAdmin, (req, res, next) => {
  try {
    const id = Number(req.params.modId);
    const { role } = req.body;
    if (!['admin', 'mod'].includes(role)) return res.status(400).json({ error: '角色无效' });
    if (id === req.mod.id) return res.status(400).json({ error: '不能修改自己的角色' });
    const target = db.prepare('SELECT is_superadmin FROM mods WHERE id = ?').get(id);
    if (target?.is_superadmin) return res.status(403).json({ error: '超级管理员账户不能降级' });
    db.prepare('UPDATE mods SET role = ? WHERE id = ?').run(role, id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// 删除用户（硬删除，同时清理关联邀请码）
router.delete('/:modId', requireAuth, requireAdmin, (req, res, next) => {
  try {
    const id = Number(req.params.modId);
    if (id === req.mod.id) return res.status(400).json({ error: '不能删除自己' });
    const target = db.prepare('SELECT is_superadmin FROM mods WHERE id = ?').get(id);
    if (target?.is_superadmin) return res.status(403).json({ error: '超级管理员账户不能删除' });
    db.prepare('DELETE FROM invite_tokens WHERE created_by = ? OR used_by = ?').run(id, id);
    db.prepare('DELETE FROM user_tags WHERE created_by = ?').run(id);
    db.prepare('DELETE FROM ban_logs WHERE mod_id = ?').run(id);
    db.prepare('DELETE FROM mods WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// 邀请码删除
router.delete('/invites/:id', requireAuth, requireAdmin, (req, res, next) => {
  try {
    db.prepare('DELETE FROM invite_tokens WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// 邀请码列表（超级管理员看全部，普通管理员只看自己的）
router.get('/invites', requireAuth, requireAdmin, (req, res, next) => {
  try {
    const caller = db.prepare('SELECT is_superadmin FROM mods WHERE id = ?').get(req.mod.id);
    const rows = caller?.is_superadmin
      ? db.prepare(`
          SELECT i.*, m.username AS created_by_name, u.username AS used_by_name
          FROM invite_tokens i
          LEFT JOIN mods m ON m.id = i.created_by
          LEFT JOIN mods u ON u.id = i.used_by
          ORDER BY i.id DESC
          LIMIT 200
        `).all()
      : db.prepare(`
          SELECT i.*, m.username AS created_by_name, u.username AS used_by_name
          FROM invite_tokens i
          LEFT JOIN mods m ON m.id = i.created_by
          LEFT JOIN mods u ON u.id = i.used_by
          WHERE i.created_by = ?
          ORDER BY i.id DESC
          LIMIT 50
        `).all(req.mod.id);
    res.json(rows);
  } catch (e) { next(e); }
});

export default router;
