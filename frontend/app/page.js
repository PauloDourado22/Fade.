'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from './lib/api';

// Static decorative copy for the crew cards - not wired to a review system
// (the database only stores name + bio, no ratings/completed-job counts).
// See docs/adr/0002-fade-rebrand-implementation.md, decision 2, for why this
// is hand-written flavor text instead of a fabricated "live" metric. Text
// matched verbatim to the FADE. design direction's crew cards.
const CREW_FLAVOR = {
  Rui: '★ 4.9 · 1.2k cuts · 15 yrs on the clippers',
  Marta: '★ 5.0 · fades & straight-razor work',
  'Tomás': '★ 4.7 · junior — 20% off',
};
const DEFAULT_FLAVOR = '★ 4.8 · booked solid';

export default function Home() {
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);

  useEffect(() => {
    api.getServices().then(setServices).catch(() => {});
    api.getStaff().then(setStaff).catch(() => {});
  }, []);

  return (
    <main>
      <nav className="nav">
        <Link href="/" className="brand" aria-label="FADE. — home">FADE.</Link>
        <div className="nav-links">
          <a href="#menu" className="nav-link">Cuts</a>
          <a href="#crew" className="nav-link">Crew</a>
          <a href="#visit" className="nav-link">Find us</a>
          <Link href="/login" className="action-link">Staff login</Link>
        </div>
      </nav>

      <div className="container">
        <div className="hero">
          <p className="hero-kicker">842 Valencia St, SF · Tue–Sat 10–8</p>
          <h1>Great hair,<br /><em>zero wait.</em></h1>
          <p>
            Pick your barber, lock a slot, drop a $15 deposit. No queues, no
            no-shows, no small talk you didn&apos;t ask for. In and out in 45.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <Link href="/book" className="btn">Book in 30 seconds →</Link>
            <span className="hero-meta">$15 deposit<br />locks your slot</span>
          </div>
        </div>

        <div className="ticker">
          <span>
            Walk out sharp — FADE. — book in 30 seconds — no queues — walk out sharp — FADE. — book in 30 seconds — no queues
          </span>
        </div>

        <div id="crew" className="section-heading">
          <h2>The crew</h2>
          <span className="meta">{staff.length || '—'} chairs · Tue–Sat</span>
        </div>
        <div className="crew-grid">
          {staff.length === 0 && <p className="empty-state">Loading the crew…</p>}
          {staff.map((member) => (
            <div className="crew-card" key={member.id}>
              <div className="option-card-person" style={{ marginBottom: 4 }}>
                <div className="avatar-circle">{member.name.slice(0, 1)}</div>
                <div>
                  <div className="name">{member.name}</div>
                  <div className="flavor">{CREW_FLAVOR[member.name] ?? DEFAULT_FLAVOR}</div>
                </div>
              </div>
              <p className="bio">{member.bio}</p>
              <Link href="/book" className="crew-book-link">Book with {member.name.split(' ')[0]} →</Link>
            </div>
          ))}
        </div>

        <div id="menu" className="section-heading">
          <h2>The menu</h2>
        </div>
        <div className="menu-list">
          {services.map((service) => (
            <div className="menu-row" key={service.id}>
              <span className="name">{service.name}</span>
              <span className="spacer" />
              <span className="dur">{service.duration_minutes} min</span>
              <span className="price">${(service.price_cents / 100).toFixed(0)}</span>
            </div>
          ))}
        </div>

        <div id="visit" className="footer-bar">
          <span>842 Valencia St, SF · Tue–Sat 10–8</span>
          <span>Walk-ins if a chair is free · deposits refundable 24h out</span>
        </div>
      </div>
    </main>
  );
}
