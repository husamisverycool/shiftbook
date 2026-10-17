# Pattern: Money — handoffs (`/money`)

Status: adopted — slice (w) (2026-10-17, owner: "build everything … in full")
Reference product and screen: Stripe Capital for platforms — the financing lifecycle a platform shows
(an offer is created, delivered, accepted, paid out; each with its date) and Stripe Connect's
"check the account, never trust the return" rule; Stripe Dashboard lists (`_components/table.md`);
Check payroll statuses (draft, pending, processing, paid)
Source URL: https://docs.stripe.com/capital/how-capital-for-platforms-works.md
Source URL: https://docs.stripe.com/capital/api-integration
Source URL: https://docs.stripe.com/connect/hosted-onboarding
Source URL: https://docs.checkhq.com/reference/payroll
Researched: 2026-10-17 (`docs/research/money-flows-slice-w.md` §1–§3). Confidence: high for the
statuses and the record-then-check discipline; the list's layout follows Granite's Stripe table.

## Purpose in Granite
SPEC §27 item 9: the money that would flow through a licensed partner — payroll, wage access, invoice
funding, the insurance broker's figures — computed in full and handed off as a recorded payload.
Nothing moves in this version. This page is the record of every handoff.

## Hierarchy
1. **Page header** (decision 0029, Stripe): H1 "Money"; at the right **Settings** (to
   `/settings/money`). Under it the underline tabs: **Handoffs** · **Payroll** · **Wage access** ·
   **Funding** · **Insurance** (each its own address).
2. **The plain line, on every money page** (Stripe Capital's required disclosure discipline): an
   info notice under the tabs — no money moves in this version; a licensed partner would act on what
   is recorded here.
3. **Handoffs table** (Stripe list): Recorded (date and time), What (kind), About (the run's period,
   the worker, the invoice number or the pay-date range, linking to it), Partner, Amount (bold),
   Status (a neutral "Recorded" badge, `_components/status.md`), By. Newest first.

## Interactions
- A row's "About" link opens the record it concerns (the payroll handoff, the worker, the invoice's
  funding page, the insurance tab for that range).
- Tabs and Settings are links; the keyboard reaches each.

## States
- Empty (`_components/empty-state.md`): the icon, "Nothing handed off yet", one line saying handoffs
  start from a run's payroll, and the action **Go to Payroll**.

## Loading and errors (slice o)
- Loading: the page's outline in the list shape (`_components/loading.md`).
- A failure: the frame stays; the failed content's place says so with "Try again" (`_components/error.md`).

Deviations allowed: none
