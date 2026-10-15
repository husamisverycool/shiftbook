# Pattern: Root frame and demo banner (`src/app/[locale]/layout.tsx`)

Status: approved — Stripe test-data banner adopted for the demo banner (decision D3)
Reference product and screen: Stripe Dashboard — sandbox / test-mode banner
Source URL: https://docs.stripe.com/sandboxes/dashboard/manage
Source URL: https://docs.stripe.com/sandboxes
Source URL: https://docs.stripe.com/testing-use-cases
Researched: 2026-10-15. Confidence: high that the banner sits at the top of every Dashboard page;
low for its wording, color and controls (not documented).

Owner decision 2026-10-15: "go and do what you think is best but the BIGGEST thing is to purely rely on inspiration from great products NOT your own idea of what's best".

## Purpose in Shiftbook
The outermost frame of every page: language from the URL (`/en/...`, `/es/...`), and in demo mode a
banner on every page (SPEC §18) with the one-click reset.

## Hierarchy
1. **Demo banner** — only in demo mode — at the top of every page (Stripe: "the banner at the top of
   the Dashboard indicates that you're in a sandbox. From here, you can go to any other part of the
   Dashboard"). Contents: that this is demo data, a download of the sample timesheets (decision D6),
   and the reset control (SPEC §18).
2. **Page content** — the route's own pattern.
3. Navigation frame (sidebar): none in slice (a), which has one screen. From slice (b), app pages sit
   in the Linear-style sidebar frame (`_layouts/app.md`, decision B4).

## Interactions
- Reset demo → confirms in a dialog (shadcn alert dialog: title, one line, cancel and confirm), then
  restores the seeded demo agency (SPEC §18) and returns to the converter's landing.
- Sample timesheets → downloads one .zip of the demo's sample folder (SPEC §24 step 1: "upload the
  sample folder").
- Leaving demo mode: not available in the demo deployment.

## Decision D6 (2026-10-15)
No reference documents a sample-file download in a test-mode banner. The demo cannot be tried without
the sample files (SPEC §18, §24), so the banner carries one link to them. Decided under the owner's
"go"; the owner can ask for it to move.

## Not known from the references (ask the owner before building)
- Banner wording, color, whether it stays fixed while scrolling (Stripe does not document these).

## Never copy
Stripe's wording, colors or icons.

Deviations allowed: none
