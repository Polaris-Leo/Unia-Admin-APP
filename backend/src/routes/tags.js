import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/:uid', requireAuth, (req, res, next) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM user_tags WHERE target_uid = ? ORDER BY created_at DESC'
    ).all(Number(req.params.uid));
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/:uid', requireAuth, (req, res, next) => {
  try {
    const { tag, note, targetName } = req.body;
    if (!tag && !note) return res.status(400).json({ error: '请提供标签或备注' });
    const result = db.prepare(
      'INSERT INTO user_tags (target_uid, target_name, tag, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(Number(req.params.uid), targetName || '', tag || null, note || null, req.mod.id, Date.now());
    res.json({ id: result.lastInsertRowid });
  } catch (e) { next(e); }
});

router.delete('/:tagId', requireAuth, (req, res, next) => {
  try {
    db.prepare('DELETE FROM user_tags WHERE id = ?').run(Number(req.params.tagId));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
