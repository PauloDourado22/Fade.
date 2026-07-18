import { Router } from 'express';
import { db } from '../db/index.js';
import { getAvailableSlots } from '../services/availability.js';
import {
  createHoldWithCheckout,
  getAppointmentByPublicCode,
  ConflictError,
  NotFoundError,
} from '../services/bookingService.js';
import { isValidEmail, isNonEmptyString, isIsoDateString, isPositiveInteger } from '../utils/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

export const publicRouter = Router();

publicRouter.get('/services', (req, res) => {
  const services = db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY name').all();
  res.json(services);
});

publicRouter.get('/staff', (req, res) => {
  const staff = db.prepare('SELECT id, name, bio FROM staff WHERE active = 1 ORDER BY name').all();
  res.json(staff);
});

publicRouter.get('/availability', (req, res) => {
  const staffId = Number(req.query.staffId);
  const date = req.query.date; // 'YYYY-MM-DD'
  const durationMinutes = Number(req.query.durationMinutes);

  if (!isPositiveInteger(staffId) || !isPositiveInteger(durationMinutes) || typeof date !== 'string') {
    return res.status(400).json({ error: 'staffId, date, and durationMinutes are required.' });
  }

  const slots = getAvailableSlots({ staffId, date, durationMinutes });
  res.json({ slots });
});

// A booking attempt is the highest-value target for the rate limiter — see
// middleware/rateLimit.js for why (hold griefing).
const bookingLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 8 });

publicRouter.post('/appointments', bookingLimiter, async (req, res, next) => {
  const { serviceId, staffId, startAt, customer } = req.body ?? {};

  if (
    !isPositiveInteger(serviceId) ||
    !isPositiveInteger(staffId) ||
    !isIsoDateString(startAt) ||
    !customer ||
    !isNonEmptyString(customer.name, 100) ||
    !isValidEmail(customer.email)
  ) {
    return res.status(400).json({ error: 'serviceId, staffId, startAt, and customer{name,email} are required.' });
  }

  try {
    const { appointment, checkoutUrl } = await createHoldWithCheckout({
      serviceId,
      staffId,
      startAt,
      customer,
    });
    res.status(201).json({
      publicCode: appointment.public_code,
      checkoutUrl,
    });
  } catch (err) {
    if (err instanceof ConflictError || err instanceof NotFoundError) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

publicRouter.get('/appointments/status', (req, res) => {
  const code = req.query.code;
  if (typeof code !== 'string' || code.length < 6) {
    return res.status(400).json({ error: 'A valid confirmation code is required.' });
  }

  const appointment = getAppointmentByPublicCode(code);
  if (!appointment) {
    return res.status(404).json({ error: 'No appointment found for that code.' });
  }

  // Deliberately return only what a customer needs to see their own
  // confirmation — not the full row (no internal staff_id, no other
  // customers' data reachable from here since lookup is by unguessable code).
  res.json({
    status: appointment.status,
    startAt: appointment.start_at,
    customerName: appointment.customer_name,
  });
});
