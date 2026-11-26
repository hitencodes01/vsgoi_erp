import jwt from 'jsonwebtoken';

// "tv" is the user's tokenVersion. Changing a password bumps it, which signs out every other session.
export const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role, tv: user.tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
