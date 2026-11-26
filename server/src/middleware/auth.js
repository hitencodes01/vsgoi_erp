import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

const EXPIRED = { error: 'Your session has expired. Sign in again.' };

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json(EXPIRED);
  }

  // Checked on every request so deactivated users and old sessions (after a password change) stop working at once.
  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, role: true, active: true, tokenVersion: true, mustChangePassword: true },
  });
  if (!user || !user.active || user.tokenVersion !== payload.tv) return res.status(401).json(EXPIRED);

  // A temporary password only unlocks the account/settings pages until a new password is chosen.
  if (user.mustChangePassword) {
    const path = req.originalUrl.split('?')[0];
    if (path !== '/api/auth/me' && !path.startsWith('/api/account')) {
      return res.status(403).json({ error: 'Choose a new password before continuing.', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
  }

  req.user = { id: user.id, role: user.role };
  next();
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role)
    ? next()
    : res.status(403).json({ error: 'You do not have access to this.' });
