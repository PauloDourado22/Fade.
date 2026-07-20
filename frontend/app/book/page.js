'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

// FADE.'s flow leads with "who's cutting" rather than "what service" - see
// docs/adr/0002-fade-rebrand-implementation.md, decision 3.
const STEPS = ['Barber', 'Service', 'Time', 'Lock it in'];

// Per-step headline copy, matched verbatim to the FADE. design direction
// (mockups 4b/5b) rather than paraphrased.
const HEADLINES = ["Who's cutting?", 'What are we doing?', 'When?', 'Lock it in.'];

export default function BookPage() {
  const [step, setStep] = useState(0);
  const [services, setServices] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [slots, setSlots] = useState([]);

  const [selectedService, setSelectedService] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [selectedSlot, setSelectedSlot] = useState(null);

  const [customer, setCustomer] = useState({ name: '', email: '', phone: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getServices().then(setServices).catch((e) => setError(e.message));
    api.getStaff().then(setStaffList).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selectedStaff || !selectedService) return;
    setSlots([]);
    setSelectedSlot(null);
    api
      .getAvailability(selectedStaff.id, selectedDate, selectedService.duration_minutes)
      .then((res) => setSlots(res.slots))
      .catch((e) => setError(e.message));
  }, [selectedStaff, selectedService, selectedDate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const { checkoutUrl } = await api.createAppointment({
        serviceId: selectedService.id,
        staffId: selectedStaff.id,
        startAt: selectedSlot,
        customer,
      });
      // Real Stripe Checkout redirect. In test mode, use card 4242 4242 4242 4242.
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err.message);
      setIsSubmitting(false);
    }
  }

  function handleBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  function jumpTo(i) {
    // Only allow jumping to a step already completed - mirrors the
    // sidebar's clickable-previous-steps behavior in mockup 5b, not a free
    // jump to steps whose data (e.g. available slots) hasn't loaded yet.
    if (i < step) setStep(i);
  }

  const sidebarValues = [
    selectedStaff?.name ?? '',
    selectedService?.name ?? '',
    selectedSlot
      ? new Date(selectedSlot).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
      : '',
    '',
  ];

  const priceLabel = selectedService ? `$${(selectedService.price_cents / 100).toFixed(0)}` : '—';
  const depositLabel = selectedService ? `$${(selectedService.deposit_cents / 100).toFixed(0)}` : '—';
  const balanceLabel = selectedService
    ? `$${((selectedService.price_cents - selectedService.deposit_cents) / 100).toFixed(0)}`
    : '—';

  return (
    <main className="book-shell">
      {/* Mobile-only header: back arrow + progress dots + deposit reminder,
          matching mockup 4b. Hidden at the desktop breakpoint via CSS. */}
      <div className="book-mobile-header">
        <button
          type="button"
          className="circle-btn"
          onClick={handleBack}
          disabled={step === 0}
          aria-label="Back"
        >
          ←
        </button>
        <div className="progress-dots">
          {STEPS.map((_, i) => (
            <span key={i} className={`dot ${i <= step ? 'filled' : ''}`} />
          ))}
        </div>
        <span className="dep-hint">$15 DEP</span>
      </div>

      <div className="book-grid">
        {/* Desktop-only sidebar, matching mockup 5b. Hidden on mobile via CSS. */}
        <aside className="book-sidebar">
          <span className="brand">FADE.</span>
          <div className="sidebar-steps">
            {STEPS.map((label, i) => (
              <div
                key={label}
                className={`sidebar-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
                onClick={() => jumpTo(i)}
              >
                <span className="num">{i + 1}</span>
                <span className="lab">{label}</span>
                <span className="spacer" />
                <span className="val">{sidebarValues[i]}</span>
              </div>
            ))}
          </div>
          <div className="sidebar-summary">
            <div className="summary-row"><span className="k">Price</span><span className="v">{priceLabel}</span></div>
            <div className="summary-row"><span className="k">Deposit now</span><span className="accent-v">{depositLabel}</span></div>
            <div className="summary-row"><span className="k">At the chair</span><span className="v">{balanceLabel}</span></div>
          </div>
        </aside>

        <div className="book-content">
          <h1 className="step-headline">{HEADLINES[step]}</h1>

          {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

          {step === 0 && (
            <div>
              <div className="option-grid">
                {staffList.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className={`option-card ${selectedStaff?.id === member.id ? 'selected' : ''}`}
                    onClick={() => setSelectedStaff(member)}
                  >
                    <div className="option-card-person">
                      <div className="avatar-circle">{member.name.slice(0, 1)}</div>
                      <div>
                        <div className="title">{member.name}</div>
                        <div className="subtitle">{member.bio}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <p className="helper-note">No preference? First free chair takes you.</p>
              <button className="btn" disabled={!selectedStaff} onClick={() => setStep(1)}>
                Continue
              </button>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="option-grid">
                {services.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    className={`option-card ${selectedService?.id === service.id ? 'selected' : ''}`}
                    onClick={() => setSelectedService(service)}
                  >
                    <div className="title">{service.name}</div>
                    <div className="subtitle">
                      {service.duration_minutes} min · ${(service.price_cents / 100).toFixed(0)} ·
                      {' '}${(service.deposit_cents / 100).toFixed(0)} deposit
                    </div>
                  </button>
                ))}
              </div>
              <button className="btn" disabled={!selectedService} onClick={() => setStep(2)}>
                Continue
              </button>
            </div>
          )}

          {step === 2 && (
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
                    {new Date(slot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </button>
                ))}
              </div>
              <button className="btn" disabled={!selectedSlot} onClick={() => setStep(3)} style={{ marginTop: 8 }}>
                Review →
              </button>
            </div>
          )}

          {step === 3 && (
            <form onSubmit={handleSubmit}>
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="summary-row">
                  <span className="k">Barber</span>
                  <span className="v">{selectedStaff?.name}</span>
                </div>
                <div className="summary-row">
                  <span className="k">Service</span>
                  <span className="v">{selectedService?.name}</span>
                </div>
                <div className="summary-row">
                  <span className="k">Time</span>
                  <span className="v">
                    {selectedSlot && new Date(selectedSlot).toLocaleString([], {
                      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="summary-row total">
                  <span className="k">Price</span>
                  <span className="v">{priceLabel}</span>
                </div>
                <div className="summary-row">
                  <span className="k">Deposit now</span>
                  <span className="accent-v">{depositLabel}</span>
                </div>
                <div className="summary-row">
                  <span className="k">At the chair</span>
                  <span className="v">{balanceLabel}</span>
                </div>
              </div>

              <div className="form-group">
                <label>Full name</label>
                <input
                  required
                  value={customer.name}
                  onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  required
                  type="email"
                  value={customer.email}
                  onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Phone (optional)</label>
                <input
                  value={customer.phone}
                  onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
                />
              </div>
              <button className="btn" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Redirecting to payment…' : 'Pay $15 deposit'}
              </button>
              <p className="helper-note">
                Refundable up to 24h before · unpaid holds expire in a few minutes.
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

// NOTE: this replaces a pre-existing bug (not introduced by the FADE pass) -
// `new Date().toISOString().slice(0, 10)` reads the date in UTC, so anyone
// west of UTC before midnight, or east of UTC after 11pm-ish, sees
// "today" default to the wrong calendar day. That's what was causing the
// date field to silently land on a closed day (Sun/Mon) with no slots.
// Using local getFullYear/getMonth/getDate fixes it for the browser's own
// clock. Same fix applied in book/manage/page.js and dashboard/page.js.
function todayIso() {
  return toLocalDateString(new Date());
}

function toLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
