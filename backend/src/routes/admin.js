import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { getAllSettings, updateSettings, SettingsValidationError } from '../services/settingsService.js';
import { isNonEmptyString, isValidEmail, isPositiveInteger } from '../utils/validate.js';

export const adminRouter = Router();

// Every route here is owner/staff-only dashboard config. Same guarantee as
// the appointments router - a customer JWT (there is no such thing) or no
// token at all can't reach any of it.
adminRouter.use(requireAuth);

// A few operations (creating other logins) are owner-only, not staff. The
// role rides in the JWT (see routes/auth.js) so we don't need a DB lookup.
function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required.' });
  }
  next();
}

const isNonNegativeInteger = (v) => Number.isInteger(v) && v >= 0;

/* ----------------------------------------------------------------------
   Booking policy settings
   ---------------------------------------------------------------------- */
adminRouter.get('/settings', (req, res) => {
  res.json(getAllSettings());
});

adminRouter.patch('/settings', (req, res, next) => {
  try {
    res.json(updateSettings(req.body ?? {}));
  } catch (err) {
    if (err instanceof SettingsValidationError) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

/* ----------------------------------------------------------------------
   Change own password
   ---------------------------------------------------------------------- */
adminRouter.post('/password', (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};

  if (!isNonEmptyString(currentPassword, 200) || !isNonEmptyString(newPassword, 200)) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'Account not found.' });

  // Re-verify the current password even though they're already authenticated:
  // a stolen/left-open session shouldn't be able to silently change the
  // password and lock the real owner out.
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(403).json({ error: 'Current password is incorrect.' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 12), user.id);
  res.json({ ok: true });
});

/* ----------------------------------------------------------------------
   Staff logins (owner-only)
   ---------------------------------------------------------------------- */
adminRouter.get('/staff-accounts', requireOwner, (req, res) => {
  res.json(db.prepare('SELECT id, email, role, created_at FROM users ORDER BY created_at').all());
});

adminRouter.post('/staff-accounts', requireOwner, (req, res) => {
  const { email, password } = req.body ?? {};
  if (!isValidEmail(email) || !isNonEmptyString(password, 200) || password.length < 8) {
    return res.status(400).json({ error: 'A valid email and an 8+ character password are required.' });
  }

  const exists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'An account with that email already exists.' });

  const info = db
    .prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'staff')")
    .run(email, bcrypt.hashSync(password, 12));
  res.status(201).json({ id: info.lastInsertRowid, email, role: 'staff' });
});

/* ----------------------------------------------------------------------
   One-off closures
   ---------------------------------------------------------------------- */
adminRouter.get('/closures', (req, res) => {
  res.json(db.prepare('SELECT id, date, reason FROM closures ORDER BY date').all());
});

adminRouter.post('/closures', (req, res) => {
  const { date, reason } = req.body ?? {};
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'A date (YYYY-MM-DD) is required.' });
  }
  const exists = db.prepare('SELECT id FROM closures WHERE date = ?').get(date);
  if (exists) return res.status(409).json({ error: 'That date is already marked closed.' });

  const info = db
    .prepare('INSERT INTO closures (date, reason) VALUES (?, ?)')
    .run(date, isNonEmptyString(reason, 200) ? reason.trim() : null);
  res.status(201).json({ id: info.lastInsertRowid, date, reason: reason ?? null });
});

adminRouter.delete('/closures/:id', (req, res) => {
  db.prepare('DELETE FROM closures WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

/* ----------------------------------------------------------------------
   Services CRUD  (soft-delete only - existing appointments FK to these)
   ---------------------------------------------------------------------- */
// Owner view includes inactive services (so they can be reactivated) but
// never the internal '__block__' sentinel used by time-blocks.
adminRouter.get('/services', (req, res) => {
  res.json(
    db.prepare("SELECT * FROM services WHERE name != '__block__' ORDER BY active DESC, name").all()
  );
});

function validServiceBody(b) {
  return (
    isNonEmptyString(b.name, 100) &&
    isPositiveInteger(b.durationMinutes) &&
    isNonNegativeInteger(b.priceCents) &&
    isNonNegativeInteger(b.depositCents) &&
    b.depositCents <= b.priceCents
  );
}

adminRouter.post('/services', (req, res) => {
  const b = req.body ?? {};
  if (!validServiceBody(b)) {
    return res.status(400).json({ error: 'name, durationMinutes, priceCents, depositCents (<= price) are required.' });
  }
  const info = db
    .prepare('INSERT INTO services (name, duration_minutes, price_cents, deposit_cents) VALUES (?, ?, ?, ?)')
    .run(b.name.trim(), b.durationMinutes, b.priceCents, b.depositCents);
  res.status(201).json(db.prepare('SELECT * FROM services WHERE id = ?').get(info.lastInsertRowid));
});

adminRouter.patch('/services/:id', (req, res) => {
  const id = Number(req.params.id);
  const service = db.prepare("SELECT * FROM services WHERE id = ? AND name != '__block__'").get(id);
  if (!service) return res.status(404).json({ error: 'Service not found.' });

  const b = req.body ?? {};
  // Allow toggling active on its own; require the full body only when
  // editing the priced fields.
  if ('active' in b && Object.keys(b).length === 1) {
    db.prepare('UPDATE services SET active = ? WHERE id = ?').run(b.active ? 1 : 0, id);
    return res.json(db.prepare('SELECT * FROM services WHERE id = ?').get(id));
  }
  if (!validServiceBody(b)) {
    return res.status(400).json({ error: 'name, durationMinutes, priceCents, depositCents (<= price) are required.' });
  }
  db.prepare(
    'UPDATE services SET name = ?, duration_minutes = ?, price_cents = ?, deposit_cents = ?, active = ? WHERE id = ?'
  ).run(b.name.trim(), b.durationMinutes, b.priceCents, b.depositCents, b.active ? 1 : 0, id);
  res.json(db.prepare('SELECT * FROM services WHERE id = ?').get(id));
});

// "Delete" = retire (active = 0). A hard delete would orphan every past
// appointment that references this service via a NOT NULL foreign key.
adminRouter.delete('/services/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE services SET active = 0 WHERE id = ? AND name != '__block__'").run(id);
  res.json({ ok: true });
});

/* ----------------------------------------------------------------------
   Staff CRUD  (soft-delete only - appointments FK to these too)
   ---------------------------------------------------------------------- */
adminRouter.get('/staff', (req, res) => {
  res.json(db.prepare('SELECT * FROM staff ORDER BY active DESC, name').all());
});

adminRouter.post('/staff', (req, res) => {
  const { name, bio } = req.body ?? {};
  if (!isNonEmptyString(name, 100)) {
    return res.status(400).json({ error: 'A name is required.' });
  }
  const info = db
    .prepare('INSERT INTO staff (name, bio) VALUES (?, ?)')
    .run(name.trim(), isNonEmptyString(bio, 500) ? bio.trim() : null);
  res.status(201).json(db.prepare('SELECT * FROM staff WHERE id = ?').get(info.lastInsertRowid));
});

adminRouter.patch('/staff/:id', (req, res) => {
  const id = Number(req.params.id);
  const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(id);
  if (!staff) return res.status(404).json({ error: 'Staff member not found.' });

  const { name, bio, active } = req.body ?? {};
  db.prepare('UPDATE staff SET name = ?, bio = ?, active = ? WHERE id = ?').run(
    isNonEmptyString(name, 100) ? name.trim() : staff.name,
    bio === undefined ? staff.bio : (isNonEmptyString(bio, 500) ? bio.trim() : null),
    active === undefined ? staff.active : (active ? 1 : 0),
    id
  );
  res.json(db.prepare('SELECT * FROM staff WHERE id = ?').get(id));
});

adminRouter.delete('/staff/:id', (req, res) => {
  db.prepare('UPDATE staff SET active = 0 WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

/* ----------------------------------------------------------------------
   Working hours  (per barber, replace-all)
   ---------------------------------------------------------------------- */
adminRouter.get('/working-hours', (req, res) => {
  res.json(
    db
      .prepare('SELECT id, staff_id, weekday, start_minute, end_minute FROM working_hours ORDER BY staff_id, weekday')
      .all()
  );
});

// Replace one barber's entire week in a single transaction. The UI sends the
// full set of windows it wants that barber to have; anything not sent (a day
// off) simply isn't inserted. Simpler and less error-prone than diffing
// individual rows.
adminRouter.put('/working-hours/:staffId', (req, res) => {
  const staffId = Number(req.params.staffId);
  const staff = db.prepare('SELECT id FROM staff WHERE id = ?').get(staffId);
  if (!staff) return res.status(404).json({ error: 'Staff member not found.' });

  const hours = Array.isArray(req.body?.hours) ? req.body.hours : null;
  if (!hours) return res.status(400).json({ error: 'hours[] is required.' });

  for (const h of hours) {
    const ok =
      Number.isInteger(h.weekday) && h.weekday >= 0 && h.weekday <= 6 &&
      Number.isInteger(h.startMinute) && Number.isInteger(h.endMinute) &&
      h.startMinute >= 0 && h.endMinute <= 24 * 60 && h.startMinute < h.endMinute;
    if (!ok) return res.status(400).json({ error: 'Each window needs weekday 0-6 and start < end within the day.' });
  }

  const replace = db.transaction(() => {
    db.prepare('DELETE FROM working_hours WHERE staff_id = ?').run(staffId);
    const insert = db.prepare(
      'INSERT INTO working_hours (staff_id, weekday, start_minute, end_minute) VALUES (?, ?, ?, ?)'
    );
    for (const h of hours) insert.run(staffId, h.weekday, h.startMinute, h.endMinute);
  });
  replace();

  res.json(
    db.prepare('SELECT id, staff_id, weekday, start_minute, end_minute FROM working_hours WHERE staff_id = ?').all(staffId)
  );
});
