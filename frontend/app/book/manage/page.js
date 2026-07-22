'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';

const ACTIVE_STATUSES = ['confirmed', 'pending_payment'];

function ManageContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');

  const [loadState, setLoadState] = useState('loading'); // loading | ready | not-found | error
  const [booking, setBooking] = useState(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!code) {
      setLoadState('error');
      return;
    }
    api
      .getManageBooking(code)
      .then((data) => {
        setBooking(data);
        setLoadState('ready');
      })
      .catch(() => setLoadState('not-found'));
  }, [code]);

  useEffect(() => {
    if (!rescheduling || !booking) return;
    setSlots([]);
    setSelectedSlot(null);
    api
      .getAvailability(booking.staffId, selectedDate, booking.durationMinutes)
      .then((res) => setSlots(res.slots))
      .catch((err) => setActionError(err.message));
  }, [rescheduling, booking, selectedDate]);

  async function handleReschedule() {
    setActionError(null);
    setIsSubmitting(true);
    try {
      const updated = await api.rescheduleAppointment(code, selectedSlot);
      setBooking((b) => ({ ...b, startAt: updated.startAt }));
      setRescheduling(false);
      // Copy matched to mockup 6b's "MOVED. {NAME} NOW EXPECTS YOU {time}.
      // DEPOSIT CARRIES OVER." (sentence case here per the rest of this UI's
      // copy style, not the mockup's caps-lock mono treatment).
      setMessage(`Moved. ${booking.staffName} now expects you ${new Date(updated.startAt).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })}. Deposit carries over.`);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm('Cancel this booking? This can\'t be undone.')) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      const updated = await api.cancelAppointment(code);
      setBooking((b) => ({ ...b, status: updated.status }));
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loadState === 'loading') {
    return <main className="container" style={{ maxWidth: 480 }}><p className="empty-state">Loading your booking…</p></main>;
  }

  if (loadState === 'error') {
    return (
      <main className="container" style={{ maxWidth: 480 }}>
        <div className="card"><p className="error-text">No confirmation code found in the URL.</p></div>
      </main>
    );
  }

  if (loadState === 'not-found') {
    return (
      <main className="container" style={{ maxWidth: 480 }}>
        <div className="card"><p className="error-text">Couldn&apos;t find a booking for that code.</p></div>
      </main>
    );
  }

  const canManage = ACTIVE_STATUSES.includes(booking.status);

  return (
    <main className="container" style={{ maxWidth: 480 }}>
      <span className="brand" style={{ display: 'block', marginBottom: 20 }}>FADE.</span>
      <p className="hero-kicker" style={{ marginBottom: 4 }}>Booking #{code}</p>
      <h1 style={{
        fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 900,
        textTransform: 'uppercase', letterSpacing: '-0.03em', lineHeight: 1, margin: '0 0 20px',
      }}>
        Your booking
      </h1>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="summary-row"><span className="k">Barber</span><span className="v">{booking.staffName}</span></div>
        <div className="summary-row"><span className="k">Service</span><span className="v">{booking.serviceName}</span></div>
        <div className="summary-row">
          <span className="k">Time</span>
          <span className="v" style={{ color: 'var(--accent)' }}>
            {new Date(booking.startAt).toLocaleString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </div>
        <div className="summary-row total">
          <span className="k">Deposit</span>
          <span className="v">
            ${(booking.depositCents / 100).toFixed(0)} {booking.status === 'confirmed' ? 'paid ✓' : 'unpaid'}
          </span>
        </div>
        <div className="summary-row">
          <span className="k">At the chair</span>
          <span className="v">${((booking.priceCents - booking.depositCents) / 100).toFixed(0)}</span>
        </div>
        <div className="summary-row">
          <span className="k">Status</span>
          <span className={`badge badge-${booking.status}`}>{booking.status.replace('_', ' ')}</span>
        </div>
      </div>

      {message && <p className="success-text" style={{ marginBottom: 16 }}>{message}</p>}
      {actionError && <p className="error-text" style={{ marginBottom: 16 }}>{actionError}</p>}

      {!canManage && (
        <p className="empty-state">This booking is {booking.status.replace('_', ' ')} and can&apos;t be changed here.</p>
      )}

      {canManage && !rescheduling && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn" onClick={() => setRescheduling(true)}>Reschedule</button>
          <button className="btn btn-danger" onClick={handleCancel} disabled={isSubmitting}>
            {isSubmitting ? 'Cancelling…' : 'Cancel booking'}
          </button>
          <p className="empty-state" style={{ textAlign: 'left', padding: 0 }}>
            Reschedule or cancel free until 24h before your slot.
          </p>
        </div>
      )}

      {canManage && rescheduling && (
        <div>
          <div className="form-group">
            <label>Date</label>
            <input
              type="date"
              value={selectedDate}
              min={todayIso()}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <div className="slot-grid">
            {slots.length === 0 && (
              <p className="empty-state">
                No open slots this day — we&apos;re closed Sun/Mon, try Tue–Sat.
              </p>
            )}
            {slots.map((slot) => (
              <button
                key={slot}
                type="button"
                className={`slot-btn ${selectedSlot === slot ? 'selected' : ''}`}
                onClick={() => setSelectedSlot(slot)}
              >
                {new Date(slot).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button className="btn btn-secondary" onClick={() => setRescheduling(false)}>Back</button>
            <button className="btn" disabled={!selectedSlot || isSubmitting} onClick={handleReschedule}>
              {isSubmitting ? 'Moving…' : 'Move my booking'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function ManagePage() {
  return (
    <Suspense fallback={<main className="container"><p className="empty-state">Loading…</p></main>}>
      <ManageContent />
    </Suspense>
  );
}

// See book/page.js's todayIso() for why this reads local date components
// instead of new Date().toISOString() (a pre-existing UTC-vs-local bug).
function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
