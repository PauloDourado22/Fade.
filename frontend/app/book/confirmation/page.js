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
    // async, independent of this page load - so we poll for a few seconds
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
    <main className="container" style={{ maxWidth: 480 }}>
      {status === 'checking' && (
        <div className="card">
          <p className="empty-state" style={{ padding: 0, textAlign: 'left' }}>Confirming your booking…</p>
        </div>
      )}

      {status === 'confirmed' && (
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 900,
            letterSpacing: '-0.03em', textTransform: 'uppercase', lineHeight: 1, margin: '0 0 14px',
            color: 'var(--accent)',
          }}>
            You&apos;re in.
          </h1>
          <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>
            {appointment?.staffName} · {appointment?.serviceName}{' '}
            {appointment?.startAt && new Date(appointment.startAt).toLocaleString([], {
              weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </p>
          <div className="code-chip">BOOKING #{code} · SHOW AT THE CHAIR</div>
          <p style={{ marginTop: 24 }}>
            <a href="/book" className="btn btn-secondary">Book another</a>
          </p>
          <p style={{ marginTop: 16 }}>
            <a href={`/book/manage?code=${code}`} className="action-link" style={{ fontSize: 13 }}>
              Need to reschedule or cancel? →
            </a>
          </p>
        </div>
      )}

      {status === 'pending' && (
        <div className="card">
          <p>
            Payment received, confirmation is still processing — you&apos;ll get an email shortly.
          </p>
          <p className="code-chip" style={{ marginTop: 12 }}>CODE {code}</p>
        </div>
      )}

      {status === 'missing-code' && (
        <div className="card"><p className="error-text">No confirmation code found in the URL.</p></div>
      )}

      {status === 'error' && (
        <div className="card">
          <p className="error-text">Couldn&apos;t look up your booking. Contact the shop with code {code}.</p>
        </div>
      )}
    </main>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<main className="container"><p className="empty-state">Loading…</p></main>}>
      <ConfirmationContent />
    </Suspense>
  );
}
