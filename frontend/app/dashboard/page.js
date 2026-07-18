'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { auth } from '../lib/auth';

const STATUS_LABELS = {
  pending_payment: 'Pending payment',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  expired: 'Expired hold',
};

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState(null);

  // Client-side auth guard: if there's no token, bounce to /login. This is a
  // UX guard, not a security boundary — the real enforcement is the backend
  // rejecting requests without a valid JWT (see middleware/auth.js). Never
  // rely on a frontend redirect alone to protect data.
  useEffect(() => {
    const t = auth.getToken();
    if (!t) {
      router.replace('/login');
      return;
    }
    setToken(t);
  }, [router]);

  const loadAppointments = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.listAppointments(token, `?date=${date}`);
      setAppointments(data);
    } catch (err) {
      if (err.message.includes('401') || err.message.toLowerCase().includes('invalid')) {
        auth.clearToken();
        router.replace('/login');
      }
      setError(err.message);
    }
  }, [token, date, router]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  async function handleStatusChange(id, status) {
    try {
      await api.updateAppointmentStatus(token, id, status);
      loadAppointments();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleLogout() {
    auth.clearToken();
    router.push('/login');
  }

  if (!token) return null;

  return (
    <main className="container" style={{ maxWidth: 900 }}>
      <div className="nav" style={{ maxWidth: 'none', padding: 0, marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>Appointments</h1>
        <button className="action-link" onClick={handleLogout}>Log out</button>
      </div>

      <div className="form-group" style={{ maxWidth: 200 }}>
        <label>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Customer</th>
              <th>Service</th>
              <th>Staff</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {appointments.length === 0 && (
              <tr><td colSpan={6}>No appointments for this day.</td></tr>
            )}
            {appointments.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td>{a.customer_name}<br /><span className="subtitle">{a.customer_email}</span></td>
                <td>{a.service_name}</td>
                <td>{a.staff_name}</td>
                <td><span className={`badge badge-${a.status}`}>{STATUS_LABELS[a.status] ?? a.status}</span></td>
                <td>
                  {a.status === 'confirmed' && (
                    <>
                      <button className="action-link" onClick={() => handleStatusChange(a.id, 'completed')}>
                        Mark completed
                      </button>
                      <button className="action-link" onClick={() => handleStatusChange(a.id, 'cancelled')}>
                        Cancel
                      </button>
                    </>
                  )}
                  {a.status === 'pending_payment' && (
                    <button className="action-link" onClick={() => handleStatusChange(a.id, 'cancelled')}>
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
