import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { isValidEmail, isNonEmptyString } from '../utils/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

export const authRouter = Router();

// Login attempts are rate-limited per IP too — otherwise this endpoint is a
// free password-guessing oracle. 10 attempts / 15 min is generous for a real
// owner who fat-fingers a password, tight for a brute-force script.
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

authRouter.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body ?? {};

  if (!isValidEmail(email) || !isNonEmptyString(password, 200)) {
    return res.status(400).json({ error: 'Valid email and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  // Deliberately identical error for "no such user" and "wrong password" —
  // a different message for each would let an attacker enumerate which
  // emails have accounts on this system.
  const invalidCredentials = () => res.status(401).json({ error: 'Invalid email or password.' });

  if (!user) return invalidCredentials();

  const matches = bcrypt.compareSync(password, user.password_hash);
  if (!matches) return invalidCredentials();

  const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});
