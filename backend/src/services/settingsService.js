import { db } from '../db/index.js';
import { config } from '../config.js';

// Single source of truth for every runtime-editable setting: its storage
// key, how to turn the stored text into a real value, how to validate an
// incoming write, and the default to fall back to when the row is absent.
// Adding a new setting is one entry here plus (if it needs one) a UI control
// - nothing else in the app reads the `settings` table directly.
const SPEC = {
  deposit_enabled: {
    parse: (v) => v === 'true',
    serialize: (v) => (v ? 'true' : 'false'),
    validate: (v) => typeof v === 'boolean',
    default: () => config.depositEnabled,
  },
  hold_duration_minutes: {
    parse: (v) => Number(v),
    serialize: (v) => String(v),
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 120,
    default: () => config.holdDurationMinutes,
  },
  slot_step_minutes: {
    parse: (v) => Number(v),
    serialize: (v) => String(v),
    // Only the granularities the UI offers - an arbitrary step would produce
    // odd slot times and isn't worth supporting.
    validate: (v) => [15, 30, 60].includes(v),
    default: () => 60,
  },
  booking_window_days: {
    parse: (v) => Number(v),
    serialize: (v) => String(v),
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 90,
    default: () => 14,
  },
  cancellation_window_hours: {
    parse: (v) => Number(v),
    serialize: (v) => String(v),
    validate: (v) => Number.isInteger(v) && v >= 0 && v <= 168,
    default: () => 24,
  },
  timezone: {
    parse: (v) => v,
    serialize: (v) => String(v),
    // Empty string = "use the server's own timezone". A non-empty value must
    // be a real IANA zone the runtime recognises.
    validate: (v) => v === '' || isValidTimeZone(v),
    default: () => '',
  },
};

function isValidTimeZone(tz) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const readRow = db.prepare('SELECT value FROM settings WHERE key = ?');
const upsertRow = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`
);

/**
 * Typed value for one setting: the stored row if present, otherwise the
 * config-derived default. Unknown keys throw - every caller should be asking
 * for a key that exists in SPEC.
 */
export function getSetting(key) {
  const spec = SPEC[key];
  if (!spec) throw new Error(`Unknown setting: ${key}`);
  const row = readRow.get(key);
  return row ? spec.parse(row.value) : spec.default();
}

/** Every setting as a typed object - what the settings UI loads. */
export function getAllSettings() {
  const out = {};
  for (const key of Object.keys(SPEC)) out[key] = getSetting(key);
  return out;
}

/**
 * Validate and persist a batch of settings. Rejects the whole batch on the
 * first invalid value (so a bad field can't half-apply), and ignores keys
 * not in SPEC rather than storing junk.
 */
export function updateSettings(patch) {
  const entries = Object.entries(patch).filter(([key]) => key in SPEC);

  for (const [key, value] of entries) {
    if (!SPEC[key].validate(value)) {
      throw new SettingsValidationError(`Invalid value for "${key}".`);
    }
  }

  const write = db.transaction(() => {
    for (const [key, value] of entries) {
      upsertRow.run(key, SPEC[key].serialize(value));
    }
  });
  write();

  return getAllSettings();
}

export class SettingsValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}
