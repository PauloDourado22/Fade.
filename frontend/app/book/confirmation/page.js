'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const [status, setStatus] = useState('checking');
  const [appointment, setAppointment] = useState(null);

  useEffect(() => {
    if (!code) {
      setStatus('missing-code');
      return;
    }

    // The webhook that actually confirms the appointment runs server-side,
    // async, independent of this page load — so we poll for a few seconds
    // rather than assuming "the browser landed here" means "payment is
    // confirmed". If the webhook is slow (or Stripe retries), this still
    // ends up correct instead of showing a false negative.
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      try {
        const data = await api.getAppointmentStatus(code);
        setAppointment(data);
        if (data.status === 'confirmed' || attempts >= 8) {
          clearInterval(interval);
          setStatus(data.status === 'confirmed' ? 'confirmed' : 'pending');
        }
      } catch {
        if (attempts >= 8) {
          clearInterval(interval);
          setStatus('error');
        }
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [code]);

  return (
    <main className="container">
      <div className="card">
        {status === 'checking' && <p>Confirming your booking…</p>}
        {status === 'confirmed' && (
          <>
            <p className="success-text">Booking confirmed!</p>
            <p className="subtitle">
              {appointment?.customerName}, see you at{' '}
              {new Date(appointment.startAt).toLocaleString()}.
            </p>
          </>
        )}
        {status === 'pending' && (
          <p>
            Payment received, confirmation is still processing — you&apos;ll get an email shortly.
            Keep this confirmation code: <strong>{code}</strong>
          </p>
        )}
        {status === 'missing-code' && <p className="error-text">No confirmation code found in the URL.</p>}
        {status === 'error' && <p className="error-text">Couldn&apos;t look up your booking. Contact the shop with code {code}.</p>}
      </div>
    </main>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<main className="container"><p>Loading…</p></main>}>
      <ConfirmationContent />
    </Suspense>
  );
}
