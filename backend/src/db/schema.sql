-- Owner/staff accounts that can log into the dashboard.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner', -- 'owner' | 'staff'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  bio TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  deposit_cents INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

-- A staff member's standard weekly hours. weekday: 0=Sunday .. 6=Saturday.
-- start_minute/end_minute are minutes since midnight (e.g. 540 = 09:00).
CREATE TABLE IF NOT EXISTS working_hours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  weekday INTEGER NOT NULL,
  start_minute INTEGER NOT NULL,
  end_minute INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- public_code is what customers and the confirmation page use to look up
  -- an appointment. Never expose the integer `id` for public lookups —
  -- sequential IDs let anyone enumerate other customers' bookings.
  public_code TEXT NOT NULL UNIQUE,
  service_id INTEGER NOT NULL REFERENCES services(id),
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  start_at TEXT NOT NULL, -- ISO 8601
  end_at TEXT NOT NULL,   -- ISO 8601
  status TEXT NOT NULL DEFAULT 'pending_payment',
  -- pending_payment | confirmed | cancelled | completed | expired
  hold_expires_at TEXT,
  deposit_cents INTEGER NOT NULL,
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_staff_time
  ON appointments (staff_id, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_appointments_status
  ON appointments (status);
