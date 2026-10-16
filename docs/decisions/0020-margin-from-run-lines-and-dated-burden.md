# 0020 — Margin from the runs' lines, with burden estimated from dated rates when shown

Status: accepted
Date: 2026-10-16

## Context
SPEC §15 asks for gross margin = bill − pay − estimated burden (a configurable employer tax
percentage and a workers' comp rate by class) by client, worker, recruiter, branch and week; an
overtime-leakage report; "cash you are floating" and a projection for the next payroll. SPEC §5
requires integer money, one rounding at line level with explain strings, and every rate in a data
table with effective dates. Nothing recorded a recruiter, a branch on the work, burden rates or a
pay date. Research: `docs/research/margin-slice-i.md`; plan `.claude/plans/slice-i-margin.md`
(decisions I1–I13).

## Decision
- **Margin is read from the pay and bill lines of each period's latest run whose files were made**
  (exported or closed), each in its `workweek_start`'s week. A correction computes the whole period
  again, so its lines replace the earlier version's; only its files carry the differences. Nothing
  about margin is stored; the screens compute it.
- **Burden is estimated per pay line and rounded once** (`src/server/margin/burden.ts`): employer
  taxes as one percentage per worksite state (a row with no state covers the rest), plus workers'
  comp per $100 of pay for the worker's workers' comp state (else the worksite's) and the class of
  the rate card in force on the line's first day of work (else one starting later that week), on the
  pay less the overtime premium (the share above straight time from the line's overtime rule
  multiplier: 2/3 of the pay kept at 1.5, 1/2 at 2; bonus overtime is all premium) while the
  agency's dated setting says the premium is left out. Rates are parts per million of pay in
  `burden_tax_rates` and `wc_rates`, each with `effective_from`/`effective_to`; a new rate ends the
  one before it (the catalog's `planInsert`), a same-day rate replaces it. The rate in force on the
  week's first day applies, read when the page is drawn, so a rate corrected back in time changes
  the weeks it covers (TempWorks recomputes after a FUTA credit reduction). A missing rate counts as
  zero and the row says "burden incomplete".
- **Overtime not billed** comes from the bill lines' rule ids: minutes billed at straight time or
  not billed carry the worker's overtime premium per minute for that week (the pay above straight
  time, from each pay line's rule multiplier), rounded once per row.
- **Cash floating** is, per pay period and client whose pay date has passed (the period's end + the
  agency's `payroll.pay_day_after_period_end` in force on that end), the latest version's gross pay
  less the payments applied to any version's invoices for that client as of the date, never below
  zero. The projection runs the same sum on the next pay date: that payroll added (its run, else the
  average of the last four paid periods, said to be an estimate), and each open invoice expected in
  by then (issue date + the client's average days to pay, else the due date) counted as collected
  for its own period, so one invoice's margin never offsets another week. Invoices already past
  their expected date are shown apart.
- **Recruiter on the assignment, branch on the job order** (nullable), so margin can group by them;
  "None" keeps totals tying.
- **Only the Owner and the accountant see margin** (SPEC §2); only the Owner changes rates and the
  pay day; the accountant never changes recruiter or branch.

## Alternatives considered
- **Storing burden on each pay line at run time:** faster and fixed, but a corrected rate (a
  workers' comp audit, a FUTA credit reduction) would not reach past weeks; staffing back offices
  recompute. Recomputing on read costs little at an agency's size.
- **One flat burden percentage** (Bullhorn's default 20%): simpler, but SPEC §15 asks for the tax
  percentage and workers' comp by class separately, and workers' comp differs ten-fold by class.
- **A charting library** for the weekly graph: one hand-written SVG bar chart (with an accessible
  table) is enough and adds no dependency.

## Consequences
- Migration `0028_margin`; demo rates are labeled: federal and state unemployment rates from public
  sources, workers' comp rates as examples, not real.
- A flat tax percentage overstates FUTA and SUTA once their wage bases are reached late in the
  year; the screen says the burden is an estimate.
- Open questions for the owner are in the plan (credit for recruiters, offices, pay day, real
  workers' comp rates, premium exclusion, taxes in cash floating, other costs).
