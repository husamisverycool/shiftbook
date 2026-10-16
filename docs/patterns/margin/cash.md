# Pattern: Cash floating (`/margin/cash`)

Status: adopted — slice (i) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: Xero — short-term cash flow (the money expected in by a date from
invoices due; a projected balance at that date); QuickBooks Online — cash flow planner (projections
that say why each amount is there)
Source URL: https://www.xero.com/accounting-software/analytics/cash-flow/
Source URL: https://quickbooks.intuit.com/learn-support/en-ca/help-article/budget-forecast-reports/use-cash-flow-planner-quickbooks-online/L2l59mIqe_CA_en_CA
Researched: 2026-10-16 (`docs/research/margin-slice-i.md` §4). Confidence: medium (Xero's product
page; no staffing product shows this figure).

## Purpose in Shiftbook
"Cash you are floating" (SPEC §15): payroll the agency has paid for work its clients have not paid for
yet, and what the next payroll adds before the money expected in arrives.

## Hierarchy
1. **View header and tabs** as `margin.md`.
2. **Cards:** Floating today · Next pay date and its payroll · Expected in by then · Floating after
   that payroll (Xero's projected balance). Each says how it is worked out (QuickBooks Online planner).
3. **By client:** client, payroll paid for its work, collected for that work, floating, days to pay
   (Xero, slice h); a totals row. A row opens its weeks: the week, its pay date, paid, collected,
   floating.

## Interactions
- Nothing to change here: it is as of today. The pay day is set in Margin settings.

## States
- **Nothing floating:** says so.
- **No payroll yet for the next pay date:** the payroll is the average of the last four paid weeks and
  is marked as an estimate.
- **Not for this role:** as `margin.md`.

## Never copy
Xero's or Intuit's wording, icons, colors or logos.

Deviations allowed: none
