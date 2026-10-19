# Pattern: Overtime not billed (`/margin/overtime`)

Status: adopted — slice (i) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: Bullhorn — Gross Margin Report (for regular, overtime and double time:
hours paid beside hours billed, pay and bill amounts, per placement); TempWorks — Gross Profit Detail
(rows by employee and order, sorted by gross profit)
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/bh1CanvasGrossMarginReport.htm
Source URL: https://kb.tempworks.com/help/gross-profit-detail-report
Researched: 2026-10-16 (`docs/research/margin-slice-i.md` §3). Confidence: high for the paired paid
and billed columns (Bullhorn); no product names this report, so its rows follow Bullhorn's columns.

## Purpose in Tabulado
Overtime the agency paid but did not bill at the overtime multiplier (SPEC §15 "overtime paid but not
billed"), and why: the client's overtime terms (billed at straight time, billed only at its own
sites, not billable).

## Hierarchy
1. **View header and tabs** as `margin.md` (the period and Export at the right).
2. **Summary line:** overtime and double-time hours paid, hours not billed at the multiplier, and the
   premium paid on them.
3. **Table:** one row per client, worker and week with overtime: client, worker, week, overtime hours
   paid, billed at the multiplier, billed at straight time, not billed, premium not billed, the
   client's terms; a totals row. A row opens its explain strings (the pay lines and the bill lines).

## Interactions
- The period is shared with Margin (the address).
- Export downloads the table.

## States
- **No overtime paid** in the period: says so.
- **All overtime billed at the multiplier:** says so, with the hours.
- **Not for this role:** as `margin.md`.

## Never copy
Bullhorn's or TempWorks' wording, icons, colors or logos.

Deviations allowed: none
