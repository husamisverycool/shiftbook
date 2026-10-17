# Pattern: Wage access (`/money/wage-access`)

Status: adopted — slice (w) (2026-10-17)
Reference product and screen: the CFPB's December 23, 2025 advisory opinion on earned wage access
(the four "covered EWA" conditions: never more than wages already earned from payroll data; repaid by
a payroll deduction; no recourse, no collection, no credit reporting; no individual credit
underwriting) and its fee guidance (a free option as easy to choose as a paid one); Stripe Dashboard
lists (`_components/table.md`); Stripe dialogs for a confirmed action
Source URL: https://www.federalregister.gov/documents/2025/12/23/2025-23735/truth-in-lending-regulation-z-non-application-to-earned-wage-access-products
Source URL: https://docs.zeal.com/reference/wallet/wallet-transaction-object.md
Researched: 2026-10-17 (`docs/research/money-flows-slice-w.md` §5). Confidence: high for the
conditions; the screen's arrangement is Granite's Stripe list and dialog.

## Purpose in Granite
For each worker: hours reviewed or approved and not yet paid, what that earned (straight time at the
rate card, rounded down: never more than earned), and how much may be accessed under the agency's
rules; a request recorded for a wage-access partner. Nothing is paid.

## Hierarchy
1. The Money header and tabs (`money.md`), the plain line.
2. **The agency's rules in one line** (cap as a share of earned pay, the per-request limit, the
   faster-delivery fee) with **Change** (to `/settings/money`).
3. **Workers table**: Worker (linking to the worker), Unpaid hours, Earned, Outstanding (requested,
   recovered on payday), Available (bold), and at the row's end **Request** (Owner only).

## Interactions
- **Request** opens a dialog: the amount (prefilled with what is available; whole cents from $1.00),
  the delivery as two equal choices — Standard, free; Faster, with its fee — and the terms as a short
  list (only what was earned; repaid by a payroll deduction on the next payday; no recourse, no
  collection; no credit check; the free option); **Record request** (primary) / Cancel. Errors say
  what to fix (more than available, below $1.00).
- After recording, the row's outstanding and available update.

## States
- Off (the agency has not turned it on): the empty state — "Wage access is off" — with **Open
  settings**.
- No unpaid hours: the empty state — "No unpaid hours" — and one line.

## Loading and errors (slice o)
- Loading: the page's outline in the list shape (`_components/loading.md`).
- A failure: the frame stays; the failed content's place says so with "Try again" (`_components/error.md`).

Deviations allowed: none
