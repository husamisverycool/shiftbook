# Pattern: Root frame and demo banner (`src/app/[locale]/layout.tsx`)

Status: PROPOSED — needs owner decision (the owner's mapping has no reference for the app frame or
the demo banner)
Reference product and screen: Stripe Dashboard — sandbox / test-mode banner (proposed)
Source URL: https://docs.stripe.com/sandboxes/dashboard/manage
Source URL: https://docs.stripe.com/sandboxes
Source URL: https://docs.stripe.com/testing-use-cases
Researched: 2026-10-15. Confidence: high that the banner sits at the top of every Dashboard page;
low for its wording, color and controls (not documented).

## Purpose in Shiftbook
The outermost frame of every page: language from the URL (`/en/...`, `/es/...`), and in demo mode a
banner on every page (SPEC §18) with the one-click reset.

## Hierarchy
1. **Demo banner** — only in demo mode — at the top of every page (Stripe: "the banner at the top of
   the Dashboard indicates that you're in a sandbox. From here, you can go to any other part of the
   Dashboard"). Contents: that this is demo data, and the reset control (SPEC §18).
2. **Page content** — the route's own pattern.
3. Navigation frame (sidebar): none in slice (a), which has one screen. The owner picks a reference
   for the navigation frame before slice (b).

## Interactions
- Reset demo → confirms, then restores the seeded demo agency (SPEC §18).
- Leaving demo mode: not available in the demo deployment.

## Not known from the references (ask the owner before building)
- Banner wording, color, whether it stays fixed while scrolling (Stripe does not document these).

## Never copy
Stripe's wording, colors or icons.

Deviations allowed: none
