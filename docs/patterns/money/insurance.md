# Pattern: Insurance — payroll by class for the broker (`/money/insurance`)

Status: adopted — slice (w) (2026-10-17)
Reference product and screen: Patriot Software's Workers' Comp Wages report (pay by state and class,
CSV or PDF; the same reference as `compliance/workers-comp.md`), NCRB Basic Manual Rule 2-C-2-a
(the overtime premium shown apart by classification); Zeal's `wcc_code` per shift (a class code on
each line of pay); Stripe Dashboard lists (`_components/table.md`)
Source URL: https://help.patriotsoftware.com/en/articles/15383790-workers-compensation-wages-report
Source URL: https://www.ncrb.org/digitallibrary/basicmanual/Rule_2_-_Premium_and_Payroll.htm
Source URL: https://docs.zeal.com/docs/customer-accounts-closed-beta.md
Researched: 2026-10-16 and 2026-10-17 (`docs/research/compliance-slice-j.md`;
`docs/research/money-flows-slice-w.md` §4). Confidence: high (the packet's own reference).

## Purpose in Tabulado
The figures an insurance broker prices and audits workers' comp on: what was paid, by state and class
code, for pay dates in a range, with the overtime premium apart; downloaded and recorded as handed
off to the broker.

## Hierarchy
1. The Money header and tabs (`money.md`), the plain line.
2. **Range** (Patriot's report dates): From and To (pay dates) with **Show**; at the right **Download
   CSV** and the primary action **Record handoff to broker** (Owner only).
3. **Classes table**: State, Class, Description, Hours, Straight time, Overtime premium, Double-time
   premium, Other pay, Total (bold); a totals row.
4. Below the table, the muted note naming the full workers' comp packet (by worker) under Compliance.

## Interactions
- Show reloads the page for the range (the address keeps it).
- **Record handoff to broker** opens a confirmation dialog with the range and total; **Record
  handoff** / Cancel.

## States
- No pay in the range: the empty state — "No pay in these dates" — and one line.

## Loading and errors (slice o)
- Loading: the page's outline in the list shape (`_components/loading.md`).
- A failure: the frame stays; the failed content's place says so with "Try again" (`_components/error.md`).

Deviations allowed: none
