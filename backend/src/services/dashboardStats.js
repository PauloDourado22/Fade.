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

export function getDashboardStats() {
  expireStaleHolds();

  const today = isoDate(new Date());

  const todayCount = db
    .prepare(
      `SELECT COUNT(*) as n FROM appointments
       WHERE date(start_at) = date(?) AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`
    )
    .get(today, ...ACTIVE_STATUSES).n;

  const heldCents = db
    .prepare(
      `SELECT COALESCE(SUM(deposit_cents), 0) as cents FROM appointments
       WHERE date(start_at) = date(?) AND status = 'pending_payment'`
    )
    .get(today).cents;

  const todayOccupancyPct = occupancyForDate(today);

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
    today: { count: todayCount, heldCents, occupancyPct: todayOccupancyPct },
    week,
    needsAttention,
  };
}
