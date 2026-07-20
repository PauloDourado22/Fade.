# ADR 0002: Implementing the FADE. rebrand from the uploaded design exploration

**Status:** Accepted
**Date:** 2026-07-19
**Supersedes:** parts of ADR 0001 (scope was "visual polish only, no new content/features" —
this ADR explicitly expands scope based on new input, see below)

## Context

After ADR 0001 was written and three original mockups were proposed, the user
brought in a much larger, externally-produced design exploration
(`Design Directions.dc.html`, built with Claude's design/canvas tooling in a
separate session) covering multiple rounds of concepts for this project:
**A Navalha** (heritage editorial), **FADE.** (bold streetwear-modernist), and
**R&M Atelier** (understated luxury). FADE. was iterated furthest across three
additional rounds (desktop landing/booking/dashboard, then mobile owner views
and a manage-booking/reschedule flow) — a strong signal it was the chosen
direction, confirmed directly with the user.

This supersedes ADR 0001's "visual polish only" scope: the user is now
directing implementation of a specific, fully-considered design rather than
picking from options I generated blind. That design includes real content
and structural changes (a new brand identity, a reordered booking flow, and
one genuinely new feature), not just restyling.

## Decisions

### 1. Full rebrand to "FADE."
Business name, tagline ("Great hair, zero wait."), and address
(842 Valencia St, SF) from the mockups are adopted throughout — nav, page
title/metadata, footer. Confirmed explicitly with the user rather than
assumed, since this replaces the real business name ("Rui & Marta
Barbershop") that appears in the existing README and copy.

### 2. Star ratings and cut-counts are static decorative copy, not live data
The mockups show barber cards with "★ 4.9 · 1.2k cuts" style stats. There is
no review or completed-job-count system in the database (`staff` only has
`name`/`bio`; nothing tracks ratings). Rather than fabricate a fake metrics
system, these numbers are implemented as hand-written static copy — the same
category as "12 years experience" already being static bio text, not a
computed value. This is documented here explicitly so nobody mistakes it for
a wired-up feature later: if real reviews are ever added, this copy should be
replaced by an actual query, not left as-is.

### 3. Booking flow reordered to barber-first
Existing flow: Service → Barber → Time → Details. FADE's flow: Barber →
Service → Time → Lock it in (review + pay merged into one step). Adopted as
specified — this is a frontend-only step/state reorder, no backend changes
needed, and matches the mockup's "who's cutting matters more than what
you're getting" framing for a barbershop specifically.

### 4. New backend surface: occupancy stats and hold-expiring alerts — real data only
The dashboard mockup's stat row, weekly occupancy bars, and "needs attention"
hold-expiring card are all computable from the existing `appointments` table
with new read-only queries — no fabricated numbers required:
- Today's appointment count, today's held deposits, today's occupancy % —
  aggregated from `appointments` + `working_hours` for the current date.
- This week's occupancy per day — same aggregation across 7 days.
- Needs-attention list — `status = 'pending_payment' AND hold_expires_at`
  within a short window of now, already the same condition
  `expireStaleHolds()` checks against, just surfaced instead of silently
  swept.

New endpoint: `GET /api/appointments/stats` (owner-authenticated, same
`requireAuth` middleware as the rest of `appointmentsRouter`).

### 5. New feature: customer-facing reschedule and self-cancel
The mockup's "manage booking" mobile screen (6b) is a genuinely new
capability: a customer, using their `public_code`, can move their own
appointment to a different open slot, or cancel it.

**Security reasoning, since this is a new customer-facing write path:**
- **Reuses the exact transactional conflict-check pattern from
  `bookingService.createBookingHold`** (check-then-insert/update inside a
  single `db.transaction`) — a reschedule must be just as immune to the
  double-booking race condition as the original booking. Copy-pasting the
  check without the transaction wrapper would silently reintroduce the race
  this project's README specifically calls out as solved.
- **Gated by `public_code`, same trust model as the existing confirmation
  lookup** — no new auth mechanism invented, consistent with how this app
  already treats "possession of the unguessable code" as proof of ownership
  for read access; extending it to a scoped write (reschedule/cancel *your
  own* appointment only) is a deliberate, bounded extension of that existing
  trust boundary, not a new one.
- **Rate-limited** with the same `createRateLimiter` used on the booking
  endpoint, for the same reason: an unauthenticated write endpoint is a hold-
  griefing / abuse vector (repeatedly rescheduling to grief availability)
  even without needing a valid code guess, since the limiter keys on IP
  regardless of whether the code check ultimately fails.
- **Only reachable states are rescheduled/cancelled from `confirmed` or
  `pending_payment`**, mirroring `VALID_TRANSITIONS` already enforced on the
  owner-side status endpoint — a `completed` or already-`cancelled`
  appointment can't be "rescheduled."

New endpoints: `POST /api/public/appointments/:code/reschedule`,
`POST /api/public/appointments/:code/cancel`.

New frontend route: `/book/manage?code=...`, styled per mockup 6b.

### 6. "Send reminder" — no email infrastructure exists, so it's honest, not fake
The mockup shows a "Send reminder" button next to a hold-expiring alert. This
project has no email-sending service (the README lists it as a v2 item). Two
options: fabricate a fake "reminder sent" toast, or make it real. Chose real
but minimal: the button opens `mailto:{customer_email}` pre-filled with a
short message, using the owner's own email client. Not as polished as an
automated email, but it actually does something rather than pretending to.

## Consequences

- Scope grew substantially beyond ADR 0001's "visual polish only" — this is
  intentional and directed by the user bringing in specific, developed
  design content, not scope creep on my part.
- `bookingService.js` gains two new exported functions
  (`rescheduleAppointment`, `cancelAppointmentByPublicCode`) alongside the
  existing `createBookingHold` — kept in the same file since they share the
  conflict-check helper and belong to the same domain.
- The rebrand touches copy in more places than CSS alone (page titles,
  `README.md`'s business name references, seed data comments) — a follow-up
  pass should sweep remaining "Rui & Marta" references outside the app UI
  itself (e.g., README prose) for consistency, not done as part of this ADR.
