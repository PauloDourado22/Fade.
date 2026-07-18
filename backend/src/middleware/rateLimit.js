/**
 * A deliberately small in-memory sliding-window rate limiter — no Redis, no
 * extra dependency. Good enough for a single-instance deployment and for
 * the specific threat it's guarding against here: "hold griefing", where
 * someone repeatedly starts (but never completes) checkout to keep locking
 * every open slot and denying real customers a booking.
 *
 * If this API ever runs on multiple instances, this needs to move to a
 * shared store (Redis) since each instance would otherwise track its own
 * count — same limitation as the cache in the dashboard project.
 */
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map(); // ip -> array of timestamps

  return function rateLimit(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    const recent = (hits.get(ip) ?? []).filter((t) => t > windowStart);
    if (recent.length >= max) {
      return res.status(429).json({ error: 'Too many booking attempts. Try again shortly.' });
    }
    recent.push(now);
    hits.set(ip, recent);
    next();
  };
}
