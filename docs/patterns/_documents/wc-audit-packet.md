# Pattern: Workers' comp packet PDF (`src/pdf/wc-audit-packet.tsx`)

Status: adopted — slice (j) plan, decision J7 (2026-10-16)
Reference product and screen: Patriot Software — Workers' Comp Wages report, PDF (state, code,
employee; gross and overtime wages apart; missing codes listed first, out of the totals); NCRB Basic
Manual Rule 2-C-2-a (the premium apart by employee and in summary by classification)
Source URL: https://help.patriotsoftware.com/en/articles/15383790-workers-compensation-wages-report
Source URL: https://www.ncrb.org/digitallibrary/basicmanual/Rule_2_-_Premium_and_Payroll.htm
Researched: 2026-10-16 (`docs/research/compliance-slice-j.md` §4).

## Hierarchy
1. **Top:** the agency's name; title "Workers' compensation payroll"; the insurer and policy; the
   date range; the date made.
2. **Summary by state and class:** class, description, straight-time pay, overtime premium,
   double-time premium, other pay, total — the auditor's page.
3. **Detail:** the screen's table (state, class, worker), with subtotals and the grand total.
4. **Missing a class:** listed apart, not in the totals.
5. **Tie-out:** the gross pay of the payroll files in the range, what corrections settled outside
   them, and the difference (zero).
6. No Social Security numbers (SPEC §21). "Page X of Y" at the bottom right.

Deviations allowed: none
