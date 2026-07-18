import { Router } from 'express';
import { verifyWebhookEvent } from '../services/stripeService.js';
import { confirmAppointmentByStripeSession } from '../services/bookingService.js';

export const webhooksRouter = Router();

/**
 * Mounted with `express.raw()` (see server.js) instead of the global
 * `express.json()` — Stripe's signature verification needs the exact raw
 * request bytes. If this route parsed JSON first, the signature check would
 * fail on every request because the bytes it's verifying wouldn't match what
 * Stripe actually sent.
 *
 * We confirm the appointment here, from the webhook, rather than trusting
 * the browser redirect to /book/confirmation. The redirect is just a UX nicety
 * for the customer — a network hiccup, closed tab, or a malicious client
 * skipping the redirect entirely must not be able to fake a paid booking, and
 * only Stripe's server-to-server webhook (verified by signature) can be trusted.
 */
webhooksRouter.post('/stripe', (req, res) => {
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = verifyWebhookEvent(req.body, signature);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature.' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    confirmAppointmentByStripeSession(session.id, session.payment_intent);
  }

  res.json({ received: true });
});
