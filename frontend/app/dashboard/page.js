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
  const [stats, setStats] = useState(null);
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

  const loadStats = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getDashboardStats(token);
      setStats(data);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  async function handleStatusChange(id, status) {
    try {
      await api.updateAppointmentStatus(token, id, status);
      loadAppointments();
      loadStats();
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
    <main className="container" style={{ maxWidth: 1000 }}>
      <div className="nav" style={{ maxWidth: 'none', padding: 0, marginBottom: 24 }}>
        <span className="brand">FADE.</span>
        <div>
          <span className="action-link" style={{ cursor: 'default', color: 'var(--text-faint)' }}>Owner mode</span>
          <button className="action-link" onClick={handleLogout}>Log out</button>
        </div>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

      {stats && (
        <div className="stat-grid">
          <div className="stat-cell">
            <div className="stat-k">Today</div>
            <div className="stat-v">{stats.today.count}</div>
          </div>
          <div className="stat-cell">
            <div className="stat-k">Held (unpaid)</div>
            <div className="stat-v">${(stats.today.heldCents / 100).toFixed(0)}</div>
          </div>
          <div className="stat-cell">
            <div className="stat-k">Occupancy</div>
            <div className="stat-v" style={{ color: 'var(--accent)' }}>{stats.today.occupancyPct}%</div>
          </div>
          <div className="stat-cell">
            <div className="stat-k">Needs attention</div>
            <div className="stat-v" style={{ color: stats.needsAttention.length ? 'var(--moderate)' : 'var(--text)' }}>
              {stats.needsAttention.length}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
        <div>
          <div className="section-heading">
            <h2 style={{ fontSize: 20 }}>Today&apos;s book</h2>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
                  <tr><td colSpan={6} className="empty-state">No appointments for this day.</td></tr>
                )}
                {appointments.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                      {new Date(a.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      {a.customer_name}
                      <br />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                        {a.customer_email}
                      </span>
                    </td>
                    <td>{a.service_name}</td>
                    <td>{a.staff_name}</td>
                    <td><span className={`badge badge-${a.status}`}>{STATUS_LABELS[a.status] ?? a.status}</span></td>
                    <td>
                      {a.status === 'confirmed' && (
                        <>
                          <button className="action-link" onClick={() => handleStatusChange(a.id, 'completed')}>
                            Mark done
                          </button>
                          <button className="action-link" onClick={() => handleStatusChange(a.id, 'cancelled')}>
                            Cancel
                          </button>
                        </>
                      )}
                      {a.status === 'pending_payment' && (
                        <button className="action-link" onClick={() => handleStatusChange(a.id, 'cancelled')}>
                          Release slot
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {stats && (
            <div className="side-panel">
              <div className="side-panel-title">This week</div>
              {stats.week.map((day, i) => (
                <div className="occ-row" key={i}>
                  <span style={{ color: 'var(--text-muted)' }}>{day.day}</span>
                  <div className="occ-bar"><div className="occ-bar-fill" style={{ width: `${day.pct}%` }} /></div>
                  <span style={{ textAlign: 'right' }}>{day.pct}%</span>
                </div>
              ))}
            </div>
          )}

          {stats && stats.needsAttention.length > 0 && (
            <div className="alert-panel">
              <div className="alert-panel-title">Needs attention</div>
              {stats.needsAttention.map((item) => (
                <div key={item.id} style={{ marginBottom: 14 }}>
                  <div className="alert-row">
                    {item.customerName} — {new Date(item.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                    {item.serviceName}. Deposit unpaid, hold expires in{' '}
                    <span style={{ color: 'var(--moderate)' }}>{item.minutesLeft} min</span>.
                  </div>
                  <div className="alert-actions">
                    <a
                      className="btn"
                      style={{ textDecoration: 'none' }}
                      href={`mailto:${item.customerEmail}?subject=${encodeURIComponent('Your FADE. booking is about to expire')}&body=${encodeURIComponent(
                        `Hi ${item.customerName}, your hold for ${item.serviceName} expires in ${item.minutesLeft} minutes — pay the $15 deposit to keep your slot.`
                      )}`}
                    >
                      Remind
                    </a>
                    <button className="btn btn-secondary" onClick={() => handleStatusChange(item.id, 'cancelled')}>
                      Release
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
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
