'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../lib/api';
import { auth } from '../../lib/auth';

// Weekday order shown in the hours editor. `i` is the DB weekday value
// (0=Sun..6=Sat); we list Mon-first because that's how a shop thinks of a
// week, but store the real index.
const WEEKDAYS = [
  { i: 1, label: 'Mon' }, { i: 2, label: 'Tue' }, { i: 3, label: 'Wed' },
  { i: 4, label: 'Thu' }, { i: 5, label: 'Fri' }, { i: 6, label: 'Sat' }, { i: 0, label: 'Sun' },
];

const minutesToTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const timeToMinutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export default function SettingsPage() {
  const router = useRouter();
  const [token, setToken] = useState(null);

  useEffect(() => {
    const t = auth.getToken();
    if (!t) { router.replace('/login'); return; }
    setToken(t);
  }, [router]);

  if (!token) return null;

  return (
    <main className="container" style={{ maxWidth: 900 }}>
      <div className="nav" style={{ maxWidth: 'none', padding: 0, marginBottom: 24 }}>
        <Link href="/" className="brand" aria-label="FADE. — back to home">FADE.</Link>
        <div>
          <Link href="/dashboard" className="action-link">← Dashboard</Link>
        </div>
      </div>

      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Settings</h1>

      <BookingPolicySection token={token} />
      <WorkingHoursSection token={token} />
      <ServicesSection token={token} />
      <StaffSection token={token} />
      <ClosuresSection token={token} />
      <PasswordSection token={token} />
      <StaffAccountsSection token={token} />
    </main>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <h2 style={{ fontSize: 18 }}>{title}</h2>
        {subtitle && <p className="settings-sub">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- */
function BookingPolicySection({ token }) {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getSettings(token).then(setForm).catch((e) => setError(e.message));
  }, [token]);

  async function save(e) {
    e.preventDefault();
    setError(null); setSaved(false);
    try {
      await api.updateSettings(token, {
        deposit_enabled: form.deposit_enabled,
        hold_duration_minutes: Number(form.hold_duration_minutes),
        slot_step_minutes: Number(form.slot_step_minutes),
        booking_window_days: Number(form.booking_window_days),
        cancellation_window_hours: Number(form.cancellation_window_hours),
        timezone: form.timezone,
      });
      setSaved(true);
    } catch (err) { setError(err.message); }
  }

  if (!form) return <Section title="Booking policy"><p className="empty-state">Loading…</p></Section>;

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  return (
    <Section title="Booking policy" subtitle="How bookings, holds, and deposits behave.">
      <form onSubmit={save} className="settings-grid">
        <label className="settings-field checkbox">
          <input type="checkbox" checked={form.deposit_enabled} onChange={(e) => set('deposit_enabled', e.target.checked)} />
          <span>Require a deposit to book</span>
        </label>
        <label className="settings-field">
          <span>Hold duration (minutes)</span>
          <input type="number" min="1" max="120" value={form.hold_duration_minutes} onChange={(e) => set('hold_duration_minutes', e.target.value)} />
        </label>
        <label className="settings-field">
          <span>Slot length</span>
          <select value={form.slot_step_minutes} onChange={(e) => set('slot_step_minutes', Number(e.target.value))}>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>1 hr</option>
          </select>
        </label>
        <label className="settings-field">
          <span>Booking window (days ahead)</span>
          <input type="number" min="1" max="90" value={form.booking_window_days} onChange={(e) => set('booking_window_days', e.target.value)} />
        </label>
        <label className="settings-field">
          <span>Cancellation window (hours)</span>
          <input type="number" min="0" max="168" value={form.cancellation_window_hours} onChange={(e) => set('cancellation_window_hours', e.target.value)} />
        </label>
        <label className="settings-field">
          <span>Timezone (IANA, blank = server)</span>
          <input type="text" placeholder="America/Los_Angeles" value={form.timezone} onChange={(e) => set('timezone', e.target.value)} />
        </label>
        <div className="settings-actions">
          <button type="submit" className="btn" style={{ padding: '10px 20px', fontSize: 13 }}>Save policy</button>
          {saved && <span className="success-text" style={{ marginLeft: 12 }}>Saved</span>}
          {error && <span className="error-text" style={{ marginLeft: 12 }}>{error}</span>}
        </div>
      </form>
    </Section>
  );
}

/* ---------------------------------------------------------------- */
function WorkingHoursSection({ token }) {
  const [staff, setStaff] = useState([]);
  const [hours, setHours] = useState({}); // staffId -> { weekday -> {open, start, end} }
  const [error, setError] = useState(null);
  const [savedFor, setSavedFor] = useState(null);

  const load = useCallback(async () => {
    try {
      const [staffRows, hourRows] = await Promise.all([api.adminListStaff(token), api.getWorkingHours(token)]);
      const active = staffRows.filter((s) => s.active);
      const map = {};
      for (const s of active) {
        map[s.id] = {};
        for (const d of WEEKDAYS) map[s.id][d.i] = { open: false, start: '10:00', end: '20:00' };
      }
      for (const h of hourRows) {
        if (map[h.staff_id]) {
          map[h.staff_id][h.weekday] = { open: true, start: minutesToTime(h.start_minute), end: minutesToTime(h.end_minute) };
        }
      }
      setStaff(active);
      setHours(map);
    } catch (e) { setError(e.message); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function toggle(staffId, weekday, patch) {
    setHours((h) => ({ ...h, [staffId]: { ...h[staffId], [weekday]: { ...h[staffId][weekday], ...patch } } }));
    setSavedFor(null);
  }

  async function save(staffId) {
    setError(null);
    try {
      const rows = Object.entries(hours[staffId])
        .filter(([, v]) => v.open)
        .map(([weekday, v]) => ({ weekday: Number(weekday), startMinute: timeToMinutes(v.start), endMinute: timeToMinutes(v.end) }));
      await api.setWorkingHours(token, staffId, rows);
      setSavedFor(staffId);
    } catch (e) { setError(e.message); }
  }

  return (
    <Section title="Working hours" subtitle="Each barber's weekly schedule. Unchecked = day off.">
      {error && <p className="error-text">{error}</p>}
      {staff.map((s) => (
        <div key={s.id} className="hours-barber">
          <div className="hours-barber-head">
            <strong>{s.name}</strong>
            <button type="button" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: 12 }} onClick={() => save(s.id)}>
              Save {s.name.split(' ')[0]}
            </button>
            {savedFor === s.id && <span className="success-text" style={{ marginLeft: 10 }}>Saved</span>}
          </div>
          {hours[s.id] && WEEKDAYS.map((d) => {
            const v = hours[s.id][d.i];
            return (
              <div key={d.i} className="hours-day">
                <label className="hours-day-toggle">
                  <input type="checkbox" checked={v.open} onChange={(e) => toggle(s.id, d.i, { open: e.target.checked })} />
                  <span>{d.label}</span>
                </label>
                {v.open ? (
                  <>
                    <input type="time" value={v.start} onChange={(e) => toggle(s.id, d.i, { start: e.target.value })} />
                    <span className="hours-dash">→</span>
                    <input type="time" value={v.end} onChange={(e) => toggle(s.id, d.i, { end: e.target.value })} />
                  </>
                ) : (
                  <span className="hours-off">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </Section>
  );
}

/* ---------------------------------------------------------------- */
function ServicesSection({ token }) {
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({ name: '', durationMinutes: '45', priceCents: '', depositCents: '' });
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api.adminListServices(token).then(setServices).catch((e) => setError(e.message));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.createService(token, {
        name: form.name.trim(),
        durationMinutes: Number(form.durationMinutes),
        priceCents: Math.round(Number(form.priceCents) * 100),
        depositCents: Math.round(Number(form.depositCents || 0) * 100),
      });
      setForm({ name: '', durationMinutes: '45', priceCents: '', depositCents: '' });
      load();
    } catch (err) { setError(err.message); }
  }

  async function toggleActive(s) {
    try { await api.updateService(token, s.id, { active: !s.active }); load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <Section title="Services" subtitle="Your menu. Retiring keeps past bookings intact.">
      {error && <p className="error-text">{error}</p>}
      <div className="crud-list">
        {services.map((s) => (
          <div key={s.id} className={`crud-row ${s.active ? '' : 'inactive'}`}>
            <span className="crud-name">{s.name}</span>
            <span className="crud-meta">{s.duration_minutes} min · ${(s.price_cents / 100).toFixed(0)} · ${(s.deposit_cents / 100).toFixed(0)} dep</span>
            <button type="button" className="action-link" onClick={() => toggleActive(s)}>
              {s.active ? 'Retire' : 'Reactivate'}
            </button>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="crud-add">
        <input placeholder="Service name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <input type="number" min="5" step="5" placeholder="Min" value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} />
        <input type="number" min="0" step="1" placeholder="Price $" value={form.priceCents} onChange={(e) => setForm((f) => ({ ...f, priceCents: e.target.value }))} />
        <input type="number" min="0" step="1" placeholder="Deposit $" value={form.depositCents} onChange={(e) => setForm((f) => ({ ...f, depositCents: e.target.value }))} />
        <button type="submit" className="btn" style={{ padding: '10px 16px', fontSize: 13 }}>Add</button>
      </form>
    </Section>
  );
}

/* ---------------------------------------------------------------- */
function StaffSection({ token }) {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ name: '', bio: '' });
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api.adminListStaff(token).then(setStaff).catch((e) => setError(e.message));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.createStaff(token, { name: form.name.trim(), bio: form.bio.trim() });
      setForm({ name: '', bio: '' });
      load();
    } catch (err) { setError(err.message); }
  }

  async function toggleActive(s) {
    try { await api.updateStaff(token, s.id, { active: !s.active }); load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <Section title="Barbers" subtitle="The crew. Deactivating hides them from booking.">
      {error && <p className="error-text">{error}</p>}
      <div className="crud-list">
        {staff.map((s) => (
          <div key={s.id} className={`crud-row ${s.active ? '' : 'inactive'}`}>
            <span className="crud-name">{s.name}</span>
            <span className="crud-meta">{s.bio || '—'}</span>
            <button type="button" className="action-link" onClick={() => toggleActive(s)}>
              {s.active ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="crud-add">
        <input placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <input placeholder="Short bio (optional)" value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} style={{ flex: 2 }} />
        <button type="submit" className="btn" style={{ padding: '10px 16px', fontSize: 13 }}>Add</button>
      </form>
    </Section>
  );
}

/* ---------------------------------------------------------------- */
function ClosuresSection({ token }) {
  const [closures, setClosures] = useState([]);
  const [form, setForm] = useState({ date: '', reason: '' });
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api.listClosures(token).then(setClosures).catch((e) => setError(e.message));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.addClosure(token, form.date, form.reason.trim());
      setForm({ date: '', reason: '' });
      load();
    } catch (err) { setError(err.message); }
  }

  async function remove(id) {
    try { await api.deleteClosure(token, id); load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <Section title="Closures" subtitle="One-off days the shop is shut, on top of the weekly schedule.">
      {error && <p className="error-text">{error}</p>}
      <div className="crud-list">
        {closures.length === 0 && <p className="empty-state" style={{ padding: '12px 0' }}>No closures scheduled.</p>}
        {closures.map((c) => (
          <div key={c.id} className="crud-row">
            <span className="crud-name">{new Date(`${c.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span className="crud-meta">{c.reason || '—'}</span>
            <button type="button" className="action-link" onClick={() => remove(c.id)}>Remove</button>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="crud-add">
        <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
        <input placeholder="Reason (optional)" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} style={{ flex: 2 }} />
        <button type="submit" className="btn" style={{ padding: '10px 16px', fontSize: 13 }}>Add</button>
      </form>
    </Section>
  );
}

/* ---------------------------------------------------------------- */
function PasswordSection({ token }) {
  const [form, setForm] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null); setMsg(null);
    try {
      await api.changePassword(token, form.current, form.next);
      setMsg('Password changed.');
      setForm({ current: '', next: '' });
    } catch (err) { setError(err.message); }
  }

  return (
    <Section title="Password" subtitle="Change the password for the account you're signed in as.">
      <form onSubmit={submit} className="crud-add">
        <input type="password" placeholder="Current password" value={form.current} onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))} required />
        <input type="password" placeholder="New password (8+ chars)" value={form.next} onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))} required />
        <button type="submit" className="btn" style={{ padding: '10px 16px', fontSize: 13 }}>Update</button>
      </form>
      {msg && <p className="success-text" style={{ marginTop: 8 }}>{msg}</p>}
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
    </Section>
  );
}

/* ---------------------------------------------------------------- */
function StaffAccountsSection({ token }) {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  // Owner-only; the backend enforces it, so if the list 403s we just hide
  // the section rather than showing an error to a staff-role user.
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(() => {
    api.listStaffAccounts(token)
      .then(setAccounts)
      .catch((e) => { if (e.message.toLowerCase().includes('owner')) setForbidden(true); else setError(e.message); });
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.createStaffAccount(token, form.email.trim(), form.password);
      setForm({ email: '', password: '' });
      load();
    } catch (err) { setError(err.message); }
  }

  if (forbidden) return null;

  return (
    <Section title="Dashboard logins" subtitle="Staff accounts that can sign into this dashboard.">
      {error && <p className="error-text">{error}</p>}
      <div className="crud-list">
        {accounts.map((a) => (
          <div key={a.id} className="crud-row">
            <span className="crud-name">{a.email}</span>
            <span className="crud-meta">{a.role}</span>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="crud-add">
        <input type="email" placeholder="staff@email.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
        <input type="password" placeholder="Password (8+ chars)" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
        <button type="submit" className="btn" style={{ padding: '10px 16px', fontSize: 13 }}>Add staff</button>
      </form>
    </Section>
  );
}
