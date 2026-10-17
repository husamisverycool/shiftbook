# Slice (w) — partner-ready money flows: compute everything, move nothing (SPEC §27 item 9)

Status: built (2026-10-17)

## Plain summary
A new **Money** area (sidebar, G then N) where the Owner prepares, approves and records what a licensed
partner would act on. Every money page says plainly that no money moves in this version.

- **Payroll:** each run whose files were made becomes the per-worker payload a payroll partner (Check
  or Zeal, or a plain file) needs — every earning already computed, reconciled to the payroll file to
  the cent, wage access repaid as a deduction, never an SSN or bank details. Approve and record; download.
- **Wage access:** for each worker, pay earned from approved, unpaid hours (straight time, rounded
  down: never more than earned), the share the agency allows, and a request dialog with a free
  delivery beside the paid one and the CFPB's covered-EWA terms. Shown on the worker's page too.
- **Invoice funding:** every open invoice's packet (schedule of accounts, approval trail, payment
  history, concentration, disputes, aging) and its decision under the agency's rules; an eligible one
  shows a Stripe-Capital-style offer (advance, flat fee, reserve) and can be submitted.
- **Insurance:** payroll by state and workers' comp class for a range of pay dates, CSV, recorded for
  the broker.
- **Money settings:** the agency's wage-access and funding rules, dated like every other rule.

## Built
Research `docs/research/money-flows-slice-w.md`; pattern files `money.md`, `money/payroll.md`,
`money/payroll/[id].md`, `money/wage-access.md`, `money/funding.md`, `money/funding/[id].md`,
`money/insurance.md`, `settings/money.md` (+ `_layouts/app.md`, `workers/[id].md`); migration
`drizzle/0052_partner_handoffs.sql` (row-level security; the app reads and inserts; only the demo's
reset deletes); `src/server/money/*` (pure payload, wage access, funding, broker CSV; queries;
service; settings); pages with loading outlines; `/api/files/money`; tests: unit (money), integration
`tests/integration/money.test.ts`, e2e `tests/e2e/money.spec.ts` (en and es).

## Decisions
- No SSN, date of birth, address or bank details in any payload: the partner's own onboarding
  collects them (Check `onboard`); only the last four of an SSN on file is named.
- A correction run is not handed off here (it pays differences through its payroll file).
- The demo seeds the money rules (wage access on at 50%, a $2.99 faster fee; funding on, 90% advance,
  3% fee, no concentration limit because the demo runs one client's week, client approval required);
  it seeds no handoffs because a fresh demo has no run (SPEC §18).
