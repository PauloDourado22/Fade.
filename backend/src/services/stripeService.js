import Stripe from 'stripe';
import { config } from '../config.js';

const stripe = new Stripe(config.stripeSecretKey);

/**
 * Creates a Checkout Session for the deposit amount. We charge only the
 * deposit up front (not the full service price) — the customer pays the
 * remainder in person. metadata.appointmentId is how the webhook handler
 * finds its way back to our row after Stripe redirects/notifies us.
 */
export async function createCheckoutSession({ appointment, service, publicCode }) {
  // Turn a cryptic Stripe 401 (and the generic 500 it becomes by the time it
  // reaches the browser) into an actionable message. This is exactly what
  // happens if DEPOSIT_ENABLED is (still) true but STRIPE_SECRET_KEY is
  // still the repo's placeholder - e.g. a backend process that was started
  // before .env was edited and never restarted, since `node --watch` reacts
  // to changed JS files, not a changed .env text file.
  if (!config.stripeSecretKey || config.stripeSecretKey.includes('replace')) {
    throw new Error(
      'Stripe secret key is not configured (still the placeholder value). ' +
      'Either set a real STRIPE_SECRET_KEY in backend/.env, or set ' +
      'DEPOSIT_ENABLED=false there to skip Stripe for testing - and make ' +
      'sure the backend process was restarted after editing .env.'
    );
  }

  return stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'eur',
          unit_amount: appointment.deposit_cents,
          product_data: {
            name: `Deposit — ${service.name}`,
            description: `Booking on ${new Date(appointment.start_at).toLocaleString()}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: { appointmentId: String(appointment.id) },
    success_url: `${config.frontendUrl}/book/confirmation?code=${publicCode}`,
    cancel_url: `${config.frontendUrl}/book?cancelled=1`,
  });
}

/**
 * Verifies the raw webhook payload against Stripe's signature. This is the
 * step that stops anyone from POSTing a fake "payment succeeded" event
 * straight to our webhook endpoint and confirming an appointment for free —
 * without this check, `/webhooks/stripe` would trust any JSON body sent to it.
 */
export function verifyWebhookEvent(rawBody, signatureHeader) {
  return stripe.webhooks.constructEvent(rawBody, signatureHeader, config.stripeWebhookSecret);
}
