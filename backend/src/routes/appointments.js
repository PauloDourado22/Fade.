import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { expireStaleHolds } from '../services/availability.js';

export const appointmentsRouter = Router();

// Every route below requires a valid owner/staff JWT — this whole router is
// the "dashboard" surface, and none of it should be reachable by a customer.
appointmentsRouter.use(requireAuth);

appointmentsRouter.get('/', (req, res) => {
  expireStaleHolds();

  const { date, status } = req.query;
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

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT a.*, s.name as service_name, st.name as staff_name
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN staff st ON st.id = a.staff_id
       ${where}
       ORDER BY a.start_at ASC`
    )
    .all(...params);

  res.json(rows);
});

const VALID_TRANSITIONS = {
  confirmed: ['completed', 'cancelled'],
  pending_payment: ['cancelled'],
};

appointmentsRouter.patch('/:id/status', (req, res) => {
  const { status } = req.body ?? {};
  const id = Number(req.params.id);
  const allowed = ['confirmed', 'cancelled', 'completed'];

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
