# ADR 0001: Design overhaul direction and scope

**Status:** Accepted
**Date:** 2026-07-18

## Context

Unlike the outdoor-conditions dashboard project, this codebase's frontend is
genuinely minimal, not already polished: `globals.css` has a small token set
(6 colors, one radius, no shadow scale, no motion/easing tokens), no hover or
focus states beyond browser defaults, a 720px max-width container used even
for the marketing hero, and a 17-line home page (`page.js`) consisting of a
nav, one headline, one paragraph, and one button — no barber photos or bios,
no service preview, no testimonials, no shop hours/address.

This project is called out in the README as the portfolio's flagship piece
(booking + Stripe deposits + double-booking prevention), so its first
impression matters more than the other two projects, and it's also the one
handling real payment flows — "premium" here has to read as *trustworthy*,
not just decorative.

## Decision drivers (from interview)

- **Trigger:** confirmed as "seen it live, feels unfinished/amateur" across
  the board — not one isolated screen. Consistent with the actual state of
  the CSS (no shadows, no motion, no hover states).
- **Scope priority: all 5 screens equally** — marketing home, the 4-step
  booking flow, the confirmation page, login, and the owner dashboard all get
  the same level of treatment. No screen is being deprioritized as
  "backstage."
- **Style relationship to the other portfolio project (outdoor-conditions
  dashboard): not reused.** A barbershop booking site calls for its own
  direction rather than inheriting the dashboard's data-tool visual language.
  Direction mockups for this project are built from scratch, tailored to a
  service-booking context — see `docs/mockups/`.
- **Content scope: visual polish only, current copy/content unchanged.**
  Explicitly decided *not* to add new sections (barber showcase, testimonials,
  service preview, trust badges) despite the home page having none. This
  overhaul restyles what exists; it does not rewrite the information
  architecture or add content. Noted as a real gap for a future pass (see
  Consequences), not silently dropped.

## Decision

1. **Scope: full visual pass across all 5 screens** — home, `/book` (all 4
   steps: Service, Barber, Time, Details), `/book/confirmation`, `/login`,
   and `/dashboard`. Same design tokens and component styles apply
   consistently everywhere; no screen ships in the old style.
2. **No new content or sections.** Existing copy, existing information
   architecture, existing button/label text all stay as-is. The redesign
   restyles `option-card`, `slot-btn`, `step`, `form-group`, `card`, `table`,
   and `badge` — it does not add a barber-bio section, testimonials, or a
   service-preview block to the home page. This is a deliberate scope cut,
   not an oversight (see Consequences for the trade-off this accepts).
3. **Technical approach: keep vanilla CSS.** Same reasoning as the sibling
   project — the problem is token values and the absence of states/motion,
   not the CSS methodology. No component library needed; the interactive
   surface here (option cards, slot grid, form inputs, a data table) is
   still simple enough for hand-written CSS plus the existing class-based
   structure.
4. **Direction: original to this project.** Present 2-3 barbershop/booking-
   specific direction mockups (not the dashboard project's directions),
   built from the actual existing markup (nav, hero, option cards, slot
   grid, step indicator, badges) so the comparison is honest.

## Consequences

- Because content is explicitly out of scope, the redesigned home page will
  look and feel more premium but will still lack trust signals (no barber
  photos, no testimonials, no service list preview) that matter for a site
  asking strangers to pay a deposit. Flagging this now so it isn't mistaken
  for an oversight later: recommend a follow-up ADR once visual polish is
  in, scoped specifically to home-page content/trust signals.
- All 5 screens changing together means the token/style refactor in
  `globals.css` needs to be planned against every screen's actual markup up
  front (this ADR's sibling docs list the classes in use) rather than
  iterated screen-by-screen, to avoid inconsistent partial rollouts.
- Because there's no shared design language with the other portfolio project
  by decision, don't copy tokens or components between the two repos assuming
  consistency is wanted — they're intentionally independent.
