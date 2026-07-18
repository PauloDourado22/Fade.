'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const STEPS = ['Service', 'Barber', 'Time', 'Details'];

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

  return (
    <main className="container">
      <div className="steps">
        {STEPS.map((label, i) => (
          <div key={label} className={`step ${i === step ? 'active' : ''}`}>{label}</div>
        ))}
      </div>

      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

      {step === 0 && (
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
                  {service.duration_minutes} min · €{(service.price_cents / 100).toFixed(2)} ·
                  {' '}€{(service.deposit_cents / 100).toFixed(2)} deposit
                </div>
              </button>
            ))}
          </div>
          <button className="btn" disabled={!selectedService} onClick={() => setStep(1)}>
            Continue
          </button>
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="option-grid">
            {staffList.map((member) => (
              <button
                key={member.id}
                type="button"
                className={`option-card ${selectedStaff?.id === member.id ? 'selected' : ''}`}
                onClick={() => setSelectedStaff(member)}
              >
                <div className="title">{member.name}</div>
                <div className="subtitle">{member.bio}</div>
              </button>
            ))}
          </div>
          <button className="btn btn-secondary" onClick={() => setStep(0)} style={{ marginRight: 8 }}>
            Back
          </button>
          <button className="btn" disabled={!selectedStaff} onClick={() => setStep(2)}>
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
            {slots.length === 0 && <p className="subtitle">No open slots this day — try another date.</p>}
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
          <button className="btn btn-secondary" onClick={() => setStep(1)} style={{ marginRight: 8 }}>
            Back
          </button>
          <button className="btn" disabled={!selectedSlot} onClick={() => setStep(3)}>
            Continue
          </button>
        </div>
      )}

      {step === 3 && (
        <form onSubmit={handleSubmit}>
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
          <p className="subtitle" style={{ marginBottom: 16 }}>
            You&apos;ll pay a €{selectedService && (selectedService.deposit_cents / 100).toFixed(2)} deposit
            now to hold this slot — the rest at the shop.
          </p>
          <button type="button" className="btn btn-secondary" onClick={() => setStep(2)} style={{ marginRight: 8 }}>
            Back
          </button>
          <button className="btn" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Redirecting to payment…' : 'Pay deposit & confirm'}
          </button>
        </form>
      )}
    </main>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
