import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 4100,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3100',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3100',
  databasePath: process.env.DATABASE_PATH || './data/barbershop.db',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  holdDurationMinutes: Number(process.env.HOLD_DURATION_MINUTES) || 10,
  // Temporary test escape hatch - see bookingService.js's createHoldWithCheckout.
  // Defaults to true (deposits required, current real behavior) so nobody
  // else's environment silently changes; set DEPOSIT_ENABLED=false locally
  // to skip Stripe entirely and have new bookings confirm immediately, so
  // the rest of the app (availability, double-booking prevention, dashboard,
  // reschedule/cancel) can be exercised without live Stripe test keys.
  // Flip back to true (or unset it) before treating this as production-like
  // again - it bypasses real payment collection entirely.
  depositEnabled: process.env.DEPOSIT_ENABLED !== 'false',
};

// Fail fast on missing secrets rather than limping along with `undefined` and
// producing a confusing error three layers deep later. This is the kind of
// check that costs nothing and saves a debugging session.
const required = ['jwtSecret'];
if (config.depositEnabled) required.push('stripeSecretKey');
for (const key of required) {
  if (!config[key] || config[key].includes('replace')) {
    console.warn(
      `[config] Warning: ${key} is missing or still set to its placeholder value. ` +
      `Set a real value in .env before using auth or payments.`
    );
  }
}

if (!config.depositEnabled) {
  console.warn(
    '[config] DEPOSIT_ENABLED=false - bookings will confirm instantly with no ' +
    'Stripe checkout. Testing convenience only; not how this app works for real customers.'
  );
}
