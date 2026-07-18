import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * Protects dashboard routes. Expects `Authorization: Bearer <token>`.
 *
 * Trade-off worth knowing: the token lives in localStorage on the frontend,
 * which is simple and avoids cross-site cookie configuration for a
 * two-origin (frontend/backend) dev setup — but it's readable by any JS that
 * runs on the page, so an XSS bug elsewhere in the app could steal it.
 * The alternative (httpOnly cookie) closes that hole but opens a CSRF one
 * and needs SameSite/domain configuration to work across origins. For a
 * single-owner dashboard with no third-party scripts, this is a reasonable
 * choice — flagging it so it's a conscious one if this app grows.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }
  const token = header.slice('Bearer '.length);
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}
