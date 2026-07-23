'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../lib/api';
import { auth } from '../lib/auth';

const STATUS_LABELS = {
  pending_payment: 'Pending payment',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  expired: 'Expired hold',
  no_show: 'No-show',
};

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [stats, setStats] = useState(null);
  const [date, setDate] = useState(todayIso());
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  // `search` updates on every keystroke for a responsive input; the query
  // only fires off the debounced copy, so we don't hit the API per letter.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [error, setError] = useState(null);

  // Add-to-book form (feature 5). staff/services power the dropdowns; the
  // form is collapsed until the owner clicks "Add to book".
  const [staffList, setStaffList] = useState([]);
  const [serviceList, setServiceList] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState('walkin'); // 'walkin' | 'block'
  const [addForm, setAddForm] = useState({
    staffId: '', serviceId: '', customerName: '', customerEmail: '',
    time: '10:00', durationMinutes: '30', reason: '',
  });
  const [addError, setAddError] = useState(null);

  // Customer history drawer (feature 7).
  const [historyFor, setHistoryFor] = useState(null); // email being viewed
  const [history, setHistory] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

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
      // When searching by name/email, drop the date filter - an owner
      // looking up "did Diego ever book" wants matches across all days,
      // not just the one currently in the date picker.
      const data = await api.listAppointmentsFiltered(token, {
        date: debouncedSearch.trim() ? undefined : date,
        status: statusFilter,
        search: debouncedSearch.trim(),
      });
      setAppointments(data);
    } catch (err) {
      if (err.message.includes('401') || err.message.toLowerCase().includes('invalid')) {
        auth.clearToken();
        router.replace('/login');
      }
      setError(err.message);
    }
  }, [token, date, statusFilter, debouncedSearch, router]);

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

  // Staff + services for the add-to-book dropdowns. Public endpoints, loaded
  // once; the owner needs the same lists a customer would see when booking.
  useEffect(() => {
    if (!token) return;
    api.getStaff().then(setStaffList).catch(() => {});
    api.getServices().then(setServiceList).catch(() => {});
  }, [token]);

  async function handleStatusChange(id, status) {
    try {
      await api.updateAppointmentStatus(token, id, status);
      loadAppointments();
      loadStats();
    } catch (err) {
      setError(err.message);
    }
  }

  // Combine the dashboard's active date with a "HH:MM" time into an ISO
  // instant. Built from local Date parts (not string concatenation into a
  // Z-suffixed string) so it lands on the owner's wall-clock time.
  function isoFromDateTime(dateStr, time) {
    const [h, m] = time.split(':').map(Number);
    const [y, mo, d] = dateStr.split('-').map(Number);
    return new Date(y, mo - 1, d, h, m, 0, 0).toISOString();
  }

  async function handleAddSubmit(e) {
    e.preventDefault();
    setAddError(null);
    try {
      const startAt = isoFromDateTime(date, addForm.time);
      if (addMode === 'walkin') {
        if (!addForm.staffId || !addForm.serviceId || !addForm.customerName.trim()) {
          setAddError('Barber, service, and customer name are required.');
          return;
        }
        await api.createOwnerBooking(token, {
          serviceId: Number(addForm.serviceId),
          staffId: Number(addForm.staffId),
          startAt,
          customerName: addForm.customerName.trim(),
          customerEmail: addForm.customerEmail.trim(),
        });
      } else {
        if (!addForm.staffId || !Number(addForm.durationMinutes)) {
          setAddError('Barber and a duration are required.');
          return;
        }
        await api.createBlock(token, {
          staffId: Number(addForm.staffId),
          startAt,
          durationMinutes: Number(addForm.durationMinutes),
          reason: addForm.reason.trim(),
        });
      }
      setAddOpen(false);
      setAddForm((f) => ({ ...f, customerName: '', customerEmail: '', reason: '' }));
      loadAppointments();
      loadStats();
    } catch (err) {
      setAddError(err.message);
    }
  }

  async function openHistory(email) {
    if (!email) return;
    setHistoryFor(email);
    setHistory(null);
    try {
      setHistory(await api.getCustomerHistory(token, email));
    } catch (err) {
      setHistory({ error: err.message });
    }
  }

  function handleLogout() {
    auth.clearToken();
    router.push('/login');
  }

  // Export whatever's currently in the table (respects the active filters)
  // to a CSV the browser downloads directly - no backend round-trip, since
  // the rows are already loaded client-side. Each field is quoted and its
  // own quotes doubled, so a comma or quote in a customer's name can't
  // break the column layout (standard CSV escaping).
  function exportCsv() {
    const headers = ['Date', 'Time', 'Customer', 'Email', 'Service', 'Staff', 'Status', 'Deposit', 'Price'];
    const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = appointments.map((a) => [
      new Date(a.start_at).toLocaleDateString('en-US'),
      new Date(a.start_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      a.customer_name,
      a.is_block ? '' : a.customer_email,
      // Blocks point at the internal '__block__' sentinel service - never
      // leak that name into an export; show a plain label instead.
      a.is_block ? 'Blocked' : a.service_name,
      a.staff_name,
      a.is_block ? 'Blocked' : STATUS_LABELS[a.status] ?? a.status,
      `$${(a.deposit_cents / 100).toFixed(2)}`,
      a.is_block || a.price_cents == null ? '' : `$${(a.price_cents / 100).toFixed(2)}`,
    ]);
    const csv = [headers, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');

    // Blob + object URL + programmatic click is the standard no-dependency
    // way to trigger a client-side file download. Revoke the URL after to
    // avoid leaking it for the life of the page.
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fade-book-${search.trim() ? 'search' : date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!token) return null;

  return (
    <main className="container" style={{ maxWidth: 1000 }}>
      <div className="nav" style={{ maxWidth: 'none', padding: 0, marginBottom: 24 }}>
        <Link href="/" className="brand" aria-label="FADE. — back to home">FADE.</Link>
        <div>
          <Link href="/dashboard/settings" className="action-link">Settings</Link>
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

      {stats && (
        <div className="revenue-band">
          <div className="revenue-cell">
            <div className="revenue-k">Deposits secured</div>
            <div className="revenue-v">${(stats.today.depositsCents / 100).toFixed(0)}</div>
          </div>
          <div className="revenue-cell">
            <div className="revenue-k">At the chair</div>
            <div className="revenue-v">${(stats.today.atChairCents / 100).toFixed(0)}</div>
          </div>
          <div className="revenue-cell total">
            <div className="revenue-k">Booked today</div>
            <div className="revenue-v">${(stats.today.expectedCents / 100).toFixed(0)}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
        <div>
          <div className="section-heading">
            <h2 style={{ fontSize: 20 }}>{search.trim() ? 'Search results' : "Today's book"}</h2>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '10px 18px', fontSize: 13 }}
                onClick={() => { setAddOpen((v) => !v); setAddError(null); }}
              >
                {addOpen ? 'Close' : '+ Add to book'}
              </button>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <input
                  type="date"
                  value={date}
                  disabled={!!search.trim()}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {addOpen && (
            <form className="add-book-form" onSubmit={handleAddSubmit}>
              <div className="add-mode-toggle">
                <button
                  type="button"
                  className={addMode === 'walkin' ? 'active' : ''}
                  onClick={() => { setAddMode('walkin'); setAddError(null); }}
                >
                  Walk-in
                </button>
                <button
                  type="button"
                  className={addMode === 'block' ? 'active' : ''}
                  onClick={() => { setAddMode('block'); setAddError(null); }}
                >
                  Block time
                </button>
              </div>

              <div className="add-fields">
                <select
                  value={addForm.staffId}
                  onChange={(e) => setAddForm((f) => ({ ...f, staffId: e.target.value }))}
                >
                  <option value="">Barber…</option>
                  {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>

                {addMode === 'walkin' ? (
                  <>
                    <select
                      value={addForm.serviceId}
                      onChange={(e) => setAddForm((f) => ({ ...f, serviceId: e.target.value }))}
                    >
                      <option value="">Service…</option>
                      {serviceList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · ${(s.price_cents / 100).toFixed(0)}
                        </option>
                      ))}
                    </select>
                    <input type="time" value={addForm.time} onChange={(e) => setAddForm((f) => ({ ...f, time: e.target.value }))} />
                    <input
                      type="text"
                      placeholder="Customer name"
                      value={addForm.customerName}
                      onChange={(e) => setAddForm((f) => ({ ...f, customerName: e.target.value }))}
                    />
                    <input
                      type="email"
                      placeholder="Email (optional)"
                      value={addForm.customerEmail}
                      onChange={(e) => setAddForm((f) => ({ ...f, customerEmail: e.target.value }))}
                    />
                  </>
                ) : (
                  <>
                    <input type="time" value={addForm.time} onChange={(e) => setAddForm((f) => ({ ...f, time: e.target.value }))} />
                    <select
                      value={addForm.durationMinutes}
                      onChange={(e) => setAddForm((f) => ({ ...f, durationMinutes: e.target.value }))}
                    >
                      <option value="30">30 min</option>
                      <option value="60">1 hr</option>
                      <option value="90">1.5 hr</option>
                      <option value="120">2 hr</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Reason (e.g. Lunch)"
                      value={addForm.reason}
                      onChange={(e) => setAddForm((f) => ({ ...f, reason: e.target.value }))}
                    />
                  </>
                )}
              </div>

              {addError && <p className="error-text" style={{ margin: 0 }}>{addError}</p>}
              <div>
                <button type="submit" className="btn" style={{ padding: '10px 20px', fontSize: 13 }}>
                  {addMode === 'walkin' ? 'Book walk-in' : 'Block the time'}
                </button>
                <span className="helper-note" style={{ marginLeft: 12 }}>
                  On {new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
              </div>
            </form>
          )}

          <div className="book-filters">
            <input
              type="search"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending_payment">Pending payment</option>
              <option value="completed">Completed</option>
              <option value="no_show">No-show</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired hold</option>
            </select>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={exportCsv}
              disabled={appointments.length === 0}
            >
              Export CSV
            </button>
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
                  <tr><td colSpan={6} className="empty-state">
                    {debouncedSearch.trim() || statusFilter ? 'No appointments match those filters.' : 'No appointments for this day.'}
                  </td></tr>
                )}
                {appointments.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                      {new Date(a.start_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    {a.is_block ? (
                      // A time block has no customer/service - show the reason
                      // (stored in customer_name) spanning those two columns.
                      <td colSpan={2} style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        {a.customer_name || 'Blocked'} — chair unavailable
                      </td>
                    ) : (
                      <>
                        <td>
                          {a.customer_email ? (
                            <button className="link-name" onClick={() => openHistory(a.customer_email)}>
                              {a.customer_name}
                            </button>
                          ) : (
                            a.customer_name
                          )}
                          <br />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                            {a.customer_email || 'walk-in'}
                          </span>
                        </td>
                        <td>{a.service_name}</td>
                      </>
                    )}
                    <td>{a.staff_name}</td>
                    <td>
                      <span className={`badge badge-${a.status}`}>
                        {a.is_block ? 'Blocked' : STATUS_LABELS[a.status] ?? a.status}
                      </span>
                    </td>
                    <td>
                      {a.is_block && a.status === 'confirmed' && (
                        <button className="action-link" onClick={() => handleStatusChange(a.id, 'cancelled')}>
                          Remove
                        </button>
                      )}
                      {!a.is_block && a.status === 'confirmed' && (
                        <>
                          <button className="action-link" onClick={() => handleStatusChange(a.id, 'completed')}>
                            Mark done
                          </button>
                          <button className="action-link" onClick={() => handleStatusChange(a.id, 'no_show')}>
                            No-show
                          </button>
                          <button className="action-link" onClick={() => handleStatusChange(a.id, 'cancelled')}>
                            Cancel
                          </button>
                        </>
                      )}
                      {!a.is_block && a.status === 'pending_payment' && (
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
          {stats && stats.barbers.length > 0 && (
            <div className="side-panel">
              <div className="side-panel-title">Chairs today</div>
              {stats.barbers.map((b) => (
                <div className="barber-row" key={b.staffId}>
                  <div className="barber-row-head">
                    <span className="name">{b.name}</span>
                    <span className={`meta ${b.working ? '' : 'off'}`}>
                      {b.working ? `${b.count} booked · ${b.occupancyPct}%` : 'Day off'}
                    </span>
                  </div>
                  {b.working && (
                    <div className="occ-bar"><div className="occ-bar-fill" style={{ width: `${b.occupancyPct}%` }} /></div>
                  )}
                </div>
              ))}
            </div>
          )}

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
                    {item.customerName} — {new Date(item.startAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}{' '}
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

      {historyFor && (
        <div className="drawer-overlay" onClick={() => setHistoryFor(null)}>
          {/* stopPropagation so clicks inside the panel don't close it */}
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <div className="drawer-title">Customer history</div>
                <div className="drawer-sub">{historyFor}</div>
              </div>
              <button className="action-link" onClick={() => setHistoryFor(null)}>Close</button>
            </div>

            {!history && <p className="empty-state">Loading…</p>}
            {history?.error && <p className="error-text">{history.error}</p>}

            {history && !history.error && (
              <>
                <div className="drawer-summary">
                  <div><span className="n">{history.summary.total}</span><span className="l">Bookings</span></div>
                  <div><span className="n">{history.summary.completed}</span><span className="l">Completed</span></div>
                  <div>
                    <span className="n" style={{ color: history.summary.noShow ? 'var(--bad)' : 'var(--text)' }}>
                      {history.summary.noShow}
                    </span>
                    <span className="l">No-shows</span>
                  </div>
                  <div><span className="n">{history.summary.cancelled}</span><span className="l">Cancelled</span></div>
                </div>

                <div className="drawer-list">
                  {history.bookings.length === 0 && <p className="empty-state">No bookings found.</p>}
                  {history.bookings.map((b) => (
                    <div className="drawer-row" key={b.id}>
                      <span className="when">
                        {new Date(b.start_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span className="what">{b.service_name} · {b.staff_name}</span>
                      <span className={`badge badge-${b.status}`}>{STATUS_LABELS[b.status] ?? b.status}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
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
