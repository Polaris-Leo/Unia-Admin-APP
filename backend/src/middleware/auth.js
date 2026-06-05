import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'change_me';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' });
  try {
    req.mod = jwt.verify(header.slice(7), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token 无效或已过期' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.mod?.role !== 'admin') return res.status(403).json({ error: '权限不足' });
  next();
}

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}
