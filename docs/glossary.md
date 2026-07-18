# Glossary — design overhaul

Shared vocabulary for discussing this redesign specifically. See the
outdoor-conditions dashboard project's own `docs/glossary.md` for general
terms like "direction" and "design token" — not duplicated here except where
this project's meaning differs.

**Step indicator** (`.steps` / `.step`)
The 4-label progress bar (Service → Barber → Time → Details) at the top of
`/book` showing which stage of the booking flow the customer is on. Currently
just text with a bottom border; no sense of "done" vs "upcoming" vs "active"
beyond the active label's color.

**Option card** (`.option-card`)
The clickable card used for both service selection (step 0) and barber
selection (step 1) — same component, different content. Must stay visually
identical in both places so the redesign doesn't accidentally imply they're
different interactions.

**Slot grid / slot button** (`.slot-grid` / `.slot-btn`)
The grid of available appointment times on step 2. Small, dense, repeated
elements — the redesign's spacing/sizing decisions here matter more than
almost anywhere else in the app, since a customer scans many of these at
once to find a convenient time.

**Deposit framing**
The specific copy pattern ("Pay a €X deposit now to hold this slot — the
rest at the shop") that appears on the final booking step. Not in scope to
reword (content is frozen this pass), but the *visual weight* given to this
line is a design decision — it's the moment a customer commits to paying,
so how prominent/reassuring it looks is part of the "premium enough to
trust with a deposit" goal even without changing the words.

**Booking status badge** (`.badge-confirmed`, `.badge-pending_payment`,
`.badge-cancelled`, `.badge-completed`, `.badge-expired`)
Five semantic states shown in the owner dashboard's table. Must stay
distinguishable at a glance (including for color-blind users) in whatever
direction is chosen — this is a constraint on the palette, same as the AQI
badges in the sibling project.

**Backstage screens**
`/login` and `/dashboard` — used only by the shop owner, never by a
customer. Explicitly *not* deprioritized this pass (scope decision: all 5
screens equally), but worth naming because they have a different audience
and different content density (a data table vs a marketing hero) than the
customer-facing screens.

**Trust signal**
Any content element whose job is reassuring a stranger it's safe to pay a
deposit here — barber photos/bios, testimonials, shop address/hours, a
review count, etc. The home page currently has none. Explicitly out of
scope for this pass (visual polish only, no new content) — recorded here so
"trust signal" means the same specific thing if it comes up in a future ADR.

**Visual polish only (this pass's scope)**
Restyling existing elements — color, type, spacing, shadow, motion, hover/
focus states — without adding, removing, or rewording any content or
introducing new page sections. Distinguishes this pass from a content/IA
pass, which is explicitly deferred (see ADR 0001, Consequences).
