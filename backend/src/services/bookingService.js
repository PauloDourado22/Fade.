import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { createCheckoutSession } from './stripeService.js';

export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.status = 409;
  }
}

export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.status = 404;
  }
}

/**
 * The one place double-booking gets prevented. `db.transaction` wraps the
 * check-then-insert in a single SQLite transaction — combined with
 * better-sqlite3 being synchronous (no other request's code can run in
 * between our check and our insert on Node's single thread), this closes the
 * classic race condition where two people both see a slot as "free" and both
 * book it. This is the detail interviewers ask about when they say "tell me
 * about a tricky bug or edge case you handled."
 */
export function createBookingHold({ serviceId, staffId, startAt, customer }) {
  const service = db.prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(serviceId);
  if (!service) throw new NotFoundError('Service not found.');

  const staff = db.prepare('SELECT * FROM staff WHERE id = ? AND active = 1').get(staffId);
  if (!staff) throw new NotFoundError('Staff member not found.');

  const start = new Date(startAt);
  const end = new Date(start.getTime() + service.duration_minutes * 60_000);
  const holdExpiresAt = new Date(Date.now() + config.holdDurationMinutes * 60_000);
  const publicCode = nanoid(12);

  const insert = db.transaction(() => {
    const conflict = db
      .prepare(
        `SELECT id FROM appointments
         WHERE staff_id = ?
           AND status IN ('confirmed', 'pending_payment')
           AND start_at < ? AND end_at > ?`
      )
      .get(staffId, end.toISOString(), start.toISOString());

    if (conflict) {
      throw new ConflictError('That slot was just taken. Please pick another time.');
    }

    const result = db
      .prepare(
        `INSERT INTO appointments
           (public_code, service_id, staff_id, customer_name, customer_email, customer_phone,
            start_at, end_at, status, hold_expires_at, deposit_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?)`
      )
      .run(
        publicCode,
        serviceId,
        staffId,
        customer.name,
        customer.email,
        customer.phone ?? null,
        start.toISOString(),
        end.toISOString(),
        holdExpiresAt.toISOString(),
        service.deposit_cents
      );

    return db.prepare('SELECT * FROM appointments WHERE id = ?').get(result.lastInsertRowid);
  });

  const appointment = insert();
  return { appointment, service };
}

export async function createHoldWithCheckout(input) {
  const { appointment, service } = createBookingHold(input);
  const session = await createCheckoutSession({
    appointment,
    service,
    publicCode: appointment.public_code,
  });

  db.prepare('UPDATE appointments SET stripe_session_id = ? WHERE id = ?').run(
    session.id,
    appointment.id
  );

  return { appointment, checkoutUrl: session.url };
}

export function confirmAppointmentByStripeSession(sessionId, paymentIntentId) {
  const appointment = db
    .prepare('SELECT * FROM appointments WHERE stripe_session_id = ?')
    .get(sessionId);

  if (!appointment) {
    console.warn(`Webhook received for unknown session ${sessionId}`);
    return null;
  }

  // Idempotency guard: Stripe can and does retry webhook delivery. Without
  // this check, a retried event would be harmless here (UPDATE is naturally
  // idempotent), but it's cheap insurance and documents the assumption.
  if (appointment.status === 'confirmed') return appointment;

  db.prepare(
    "UPDATE appointments SET status = 'confirmed', stripe_payment_intent_id = ? WHERE id = ?"
  ).run(paymentIntentId, appointment.id);

  return db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointment.id);
}

export function getAppointmentByPublicCode(code) {
  return db.prepare('SELECT * FROM appointments WHERE public_code = ?').get(code);
}
