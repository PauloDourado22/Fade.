import { db } from '../db/index.js';
import { expireStaleHolds } from './availability.js';

// Everything here is a real aggregate over the `appointments` table - no
// invented numbers. See docs/adr/0002-fade-rebrand-implementation.md,
// decision 4, for why this exists as a small set of new read-only queries
// rather than a fabricated "analytics" layer.

const ACTIVE_STATUSES = ['confirmed', 'pending_payment', 'completed'];
const BUSY_STATUSES = ['confirmed', 'pending_payment'];

// Local date components, not toISOString().slice(0, 10) - the same
// UTC-vs-local bug fixed on the frontend (see book/page.js's todayIso()).
// Here "local" means the server process's clock/TZ, which is why a
// production deploy should pin TZ explicitly (e.g. `TZ=America/Los_Angeles`
// in the environment) to the shop's actual timezone rather than trusting
// whatever the host defaults to.
function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Total working minutes across all active staff for a given weekday, and
 * total minutes already booked (confirmed or held) that day - used to derive
 * an occupancy percentage. A shop with 0 working minutes that day (e.g. a
 * closed Sunday) reports 0% rather than dividing by zero.
 */
function occupancyForDate(dateStr) {
  const weekday = new Date(`${dateStr}T00:00:00`).getDay();

  const workingMinutes = db
    .prepare(
      `SELECT COALESCE(SUM(wh.end_minute - wh.start_minute), 0) as minutes
       FROM working_hours wh
       JOIN staff s ON s.id = wh.staff_id AND s.active = 1
       WHERE wh.weekday = ?`
    )
    .get(weekday).minutes;

  if (workingMinutes === 0) return 0;

  // Parse as local time (no "Z"), same convention as `weekday` above and as
  // availability.js - but `appointments.start_at`/`end_at` are stored as
  // UTC ISO strings (see bookingService.js), so the *bound* values must be
  // converted with .toISOString() before hitting the DB. Comparing a raw
  // local-format string against a stored UTC string would be comparing two
  // different representations of time as if they were the same text.
  const dayStart = new Date(`${dateStr}T00:00:00.000`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999`);

  const bookedRows = db
    .prepare(
      `SELECT start_at, end_at FROM appointments
       WHERE status IN (${BUSY_STATUSES.map(() => '?').join(',')})
         AND start_at < ? AND end_at > ?`
    )
    .all(...BUSY_STATUSES, dayEnd.toISOString(), dayStart.toISOString());

  const bookedMinutes = bookedRows.reduce((sum, row) => {
    const start = Math.max(new Date(row.start_at).getTime(), dayStart.getTime());
    const end = Math.min(new Date(row.end_at).getTime(), dayEnd.getTime());
    return sum + Math.max(0, (end - start) / 60_000);
  }, 0);

  return Math.round((bookedMinutes / workingMinutes) * 100);
}

/**
 * Per-barber view of a single day: how many appointments each active staff
 * member has, and how full their own chair is. Same occupancy math as
 * occupancyForDate() but scoped to one staff_id's working window and one
 * staff_id's appointments - so "who's slammed and who's idle" is answerable
 * at a glance, not just the shop-wide average.
 */
function perBarberForDate(dateStr) {
  const weekday = new Date(`${dateStr}T00:00:00`).getDay();
  const dayStart = new Date(`${dateStr}T00:00:00.000`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999`);

  const staff = db.prepare('SELECT id, name FROM staff WHERE active = 1 ORDER BY name').all();

  return staff.map((member) => {
    const workingMinutes = db
      .prepare(
        `SELECT COALESCE(SUM(end_minute - start_minute), 0) as minutes
         FROM working_hours WHERE staff_id = ? AND weekday = ?`
      )
      .get(member.id, weekday).minutes;

    const rows = db
      .prepare(
        `SELECT start_at, end_at FROM appointments
         WHERE staff_id = ?
           AND status IN (${BUSY_STATUSES.map(() => '?').join(',')})
           AND start_at < ? AND end_at > ?`
      )
      .all(member.id, ...BUSY_STATUSES, dayEnd.toISOString(), dayStart.toISOString());

    const bookedMinutes = rows.reduce((sum, row) => {
      const start = Math.max(new Date(row.start_at).getTime(), dayStart.getTime());
      const end = Math.min(new Date(row.end_at).getTime(), dayEnd.getTime());
      return sum + Math.max(0, (end - start) / 60_000);
    }, 0);

    const count = db
      .prepare(
        `SELECT COUNT(*) as n FROM appointments
         WHERE staff_id = ? AND date(start_at) = date(?) AND is_block = 0
           AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`
      )
      .get(member.id, dateStr, ...ACTIVE_STATUSES).n;

    return {
      staffId: member.id,
      name: member.name,
      count,
      // A barber with no working_hours that day (e.g. day off) reads 0%,
      // not a divide-by-zero - mirrors occupancyForDate's guard.
      occupancyPct: workingMinutes === 0 ? 0 : Math.round((bookedMinutes / workingMinutes) * 100),
      working: workingMinutes > 0,
    };
  });
}

export function getDashboardStats() {
  expireStaleHolds();

  const today = isoDate(new Date());

  // is_block = 0 throughout the count/revenue queries: a time block occupies
  // the chair (so it counts toward occupancy) but it isn't a booking and
  // earns nothing, so it must not inflate the appointment count or revenue.
  const todayCount = db
    .prepare(
      `SELECT COUNT(*) as n FROM appointments
       WHERE date(start_at) = date(?) AND is_block = 0 AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`
    )
    .get(today, ...ACTIVE_STATUSES).n;

  const heldCents = db
    .prepare(
      `SELECT COALESCE(SUM(deposit_cents), 0) as cents FROM appointments
       WHERE date(start_at) = date(?) AND status = 'pending_payment'`
    )
    .get(today).cents;

  // Revenue for the day, split into the two real cashflows a barbershop
  // owner cares about separately:
  //   depositsCents  - money already secured up front (confirmed/completed
  //                    holds; a pending_payment hold has NOT paid yet, so it
  //                    is deliberately excluded and shown as `heldCents`).
  //   atChairCents   - the remainder each customer still pays in person
  //                    (price - deposit), i.e. cash the chair will take today.
  // Their sum (expectedCents) is the day's total booked value. All three are
  // straight SUMs over the same rows - no projection or estimate.
  const revenue = db
    .prepare(
      `SELECT
         COALESCE(SUM(a.deposit_cents), 0) AS deposits,
         COALESCE(SUM(s.price_cents - a.deposit_cents), 0) AS atChair,
         COALESCE(SUM(s.price_cents), 0) AS expected
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       WHERE date(a.start_at) = date(?)
         AND a.is_block = 0
         AND a.status IN ('confirmed', 'completed')`
    )
    .get(today);

  const todayOccupancyPct = occupancyForDate(today);
  const barbers = perBarberForDate(today);

  const week = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = isoDate(d);
    week.push({
      day: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      pct: occupancyForDate(dateStr),
    });
  }

  // Needs attention: unpaid holds expiring soon. Same condition
  // expireStaleHolds() checks, surfaced *before* it fires instead of only
  // ever seeing the aftermath.
  const needsAttention = db
    .prepare(
      `SELECT a.id, a.customer_name, a.customer_email, a.start_at, a.hold_expires_at,
              s.name as service_name
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       WHERE a.status = 'pending_payment'
         AND a.hold_expires_at IS NOT NULL
         AND a.hold_expires_at > datetime('now')
         AND a.hold_expires_at <= datetime('now', '+30 minutes')
       ORDER BY a.hold_expires_at ASC
       LIMIT 5`
    )
    .all()
    .map((row) => ({
      id: row.id,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      serviceName: row.service_name,
      startAt: row.start_at,
      minutesLeft: Math.max(
        0,
        Math.round((new Date(row.hold_expires_at).getTime() - Date.now()) / 60_000)
      ),
    }));

  return {
    today: {
      count: todayCount,
      heldCents,
      occupancyPct: todayOccupancyPct,
      depositsCents: revenue.deposits,
      atChairCents: revenue.atChair,
      expectedCents: revenue.expected,
    },
    barbers,
    week,
    needsAttention,
  };
}
