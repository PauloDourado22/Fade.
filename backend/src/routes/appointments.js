import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { expireStaleHolds } from '../services/availability.js';
import { getDashboardStats } from '../services/dashboardStats.js';
import { createOwnerBooking, createBlock, ConflictError, NotFoundError } from '../services/bookingService.js';
import { isValidEmail, isNonEmptyString, isIsoDateString, isPositiveInteger } from '../utils/validate.js';

export const appointmentsRouter = Router();

// Every route below requires a valid owner/staff JWT — this whole router is
// the "dashboard" surface, and none of it should be reachable by a customer.
appointmentsRouter.use(requireAuth);

// Static path, so no conflict with the '/:id/status' route below even though
// both live on the same router.
appointmentsRouter.get('/stats', (req, res) => {
  res.json(getDashboardStats());
});

appointmentsRouter.get('/', (req, res) => {
  expireStaleHolds();

  const { date, status, search } = req.query;
  const clauses = [];
  const params = [];

  if (typeof date === 'string') {
    clauses.push('date(a.start_at) = date(?)');
    params.push(date);
  }
  if (typeof status === 'string') {
    clauses.push('a.status = ?');
    params.push(status);
  }
  // Case-insensitive contains-match on name or email. LIKE with escaped
  // wildcards so a customer literally typing "%" doesn't turn into a
  // match-everything query; parameterised so it's not an injection vector.
  if (typeof search === 'string' && search.trim()) {
    const term = `%${search.trim().replace(/[%_]/g, '\\$&')}%`;
    clauses.push('(a.customer_name LIKE ? ESCAPE \'\\\' OR a.customer_email LIKE ? ESCAPE \'\\\')');
    params.push(term, term);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT a.*, s.name as service_name, s.price_cents as price_cents, st.name as staff_name
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN staff st ON st.id = a.staff_id
       ${where}
       ORDER BY a.start_at ASC`
    )
    .all(...params);

  res.json(rows);
});

// Customer history (feature 7): every booking tied to one email, newest
// first, plus a small summary including how many times they no-showed -
// the justification an owner needs to decide whether to keep taking their
// bookings. Static path, so it doesn't collide with '/:id/status'.
appointmentsRouter.get('/customer', (req, res) => {
  const email = req.query.email;
  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'An email is required.' });
  }

  const rows = db
    .prepare(
      `SELECT a.id, a.start_at, a.status, s.name as service_name, st.name as staff_name
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN staff st ON st.id = a.staff_id
       WHERE a.customer_email = ? AND a.is_block = 0
       ORDER BY a.start_at DESC`
    )
    .all(email.trim());

  const summary = rows.reduce(
    (acc, r) => {
      acc.total += 1;
      if (r.status === 'completed') acc.completed += 1;
      if (r.status === 'no_show') acc.noShow += 1;
      if (r.status === 'cancelled') acc.cancelled += 1;
      return acc;
    },
    { total: 0, completed: 0, noShow: 0, cancelled: 0 }
  );

  res.json({ email: email.trim(), summary, bookings: rows });
});

// Owner-created walk-in: a real customer booked in person. Email is
// optional (a walk-in might not give one), but if present it must be valid.
appointmentsRouter.post('/', (req, res, next) => {
  const { serviceId, staffId, startAt, customerName, customerEmail } = req.body ?? {};

  if (
    !isPositiveInteger(serviceId) ||
    !isPositiveInteger(staffId) ||
    !isIsoDateString(startAt) ||
    !isNonEmptyString(customerName, 100) ||
    (customerEmail && !isValidEmail(customerEmail))
  ) {
    return res.status(400).json({ error: 'serviceId, staffId, startAt, and customerName are required.' });
  }

  try {
    const appointment = createOwnerBooking({ serviceId, staffId, startAt, customerName, customerEmail });
    res.status(201).json(appointment);
  } catch (err) {
    if (err instanceof ConflictError || err instanceof NotFoundError) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// Owner-created time block (lunch, sick barber, etc.) - no customer/service.
appointmentsRouter.post('/block', (req, res, next) => {
  const { staffId, startAt, durationMinutes, reason } = req.body ?? {};

  if (!isPositiveInteger(staffId) || !isIsoDateString(startAt) || !isPositiveInteger(durationMinutes)) {
    return res.status(400).json({ error: 'staffId, startAt, and durationMinutes are required.' });
  }

  try {
    const block = createBlock({ staffId, startAt, durationMinutes, reason });
    res.status(201).json(block);
  } catch (err) {
    if (err instanceof ConflictError || err instanceof NotFoundError) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

const VALID_TRANSITIONS = {
  // A confirmed booking can complete, be cancelled, or be marked a no-show
  // (feature 6) - the customer had a live booking and didn't turn up, which
  // is distinct from a cancellation and is what the customer-history
  // no-show count is built from.
  confirmed: ['completed', 'cancelled', 'no_show'],
  pending_payment: ['cancelled'],
};

appointmentsRouter.patch('/:id/status', (req, res) => {
  const { status } = req.body ?? {};
  const id = Number(req.params.id);
  const allowed = ['confirmed', 'cancelled', 'completed', 'no_show'];

  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }

  const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!appointment) return res.status(404).json({ error: 'Appointment not found.' });

  const allowedTargets = VALID_TRANSITIONS[appointment.status] ?? [];
  if (!allowedTargets.includes(status)) {
    return res.status(409).json({
      error: `Cannot move appointment from "${appointment.status}" to "${status}".`,
    });
  }

  db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(status, id);
  res.json(db.prepare('SELECT * FROM appointments WHERE id = ?').get(id));
});
