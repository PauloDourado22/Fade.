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
};

// Fail fast on missing secrets rather than limping along with `undefined` and
// producing a confusing error three layers deep later. This is the kind of
// check that costs nothing and saves a debugging session.
const required = ['jwtSecret', 'stripeSecretKey'];
for (const key of required) {
  if (!config[key] || config[key].includes('replace')) {
    console.warn(
      `[config] Warning: ${key} is missing or still set to its placeholder value. ` +
      `Set a real value in .env before using auth or payments.`
    );
  }
}
