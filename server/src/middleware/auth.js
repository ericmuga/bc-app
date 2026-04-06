/**
 * middleware/auth.js
 * JWT authentication. BC webhook routes use a shared secret instead.
 */
import jwt from 'jsonwebtoken';

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { userId, userName, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalid or expired' });
  }
}

/**
 * Role-based access guard. Must be used after authMiddleware.
 * Usage: requireRole('admin', 'analyst')
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/** For BC webhook endpoints – validate HMAC header instead of JWT */
export function webhookAuth(req, res, next) {
  const secret = process.env.BC_WEBHOOK_SECRET;
  if (!secret) return next(); // Secret not configured – allow all (dev only)
  const provided = req.headers['x-bc-signature'];
  if (!provided || provided !== secret) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }
  next();
}
