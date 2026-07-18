// Hand-rolled validation rather than pulling in a schema library — the
// surface area here is small enough that a library would add a dependency
// without buying much clarity. If this API's input surface grows past a
// handful of endpoints, reach for zod instead of letting this file sprawl.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_RE.test(value);
}

export function isNonEmptyString(value, maxLength = 200) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

export function isIsoDateString(value) {
  if (typeof value !== 'string') return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

export function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}
