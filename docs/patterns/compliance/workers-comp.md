# Pattern: Workers' comp packet (`/compliance/workers-comp`)

Status: adopted — slice (j) plan, decision J7 (2026-10-16)
Reference product and screen: Patriot Software — Workers' Comp Wages report (a date range; sorted by
state, then code, then employee, or by code first; gross wages, with overtime wages in their own
column; employees missing a code listed at the top and left out of the totals; PDF and CSV); NCRB
Basic Manual Rule 2-C-2-a (the overtime premium is left out only when records show it separately by
employee and in summary by classification)
Source URL: https://help.patriotsoftware.com/en/articles/15383790-workers-compensation-wages-report
Source URL: https://www.ncrb.org/digitallibrary/basicmanual/Rule_2_-_Premium_and_Payroll.htm
Researched: 2026-10-16 (`docs/research/compliance-slice-j.md` §4). Confidence: high for Patriot's
report; medium for the manual rule (North Carolina's version of the national manual).

## Purpose in Granite
What the agency hands its workers' comp auditor: the payroll by state and class, with the overtime
premium shown apart (SPEC §16: "a workers' comp audit packet (payroll by class and state)").

## Hierarchy
1. **View header and tabs** as `compliance.md` (Workers' comp tab); at the right **From** and **To**
   (the policy's period by default), the order (State first · Class first), and **Export** (PDF, CSV).
2. **Missing a class** (Patriot: listed first, left out of the totals): workers paid in the range with
   no class on their rate card, each with its pay and a link to the job order.
3. **Table**, grouped by state then class (or class then state): worker, hours, straight-time pay,
   overtime premium, double-time premium, other pay, total pay; a subtotal per class and per state
   (the manual's summary by classification); a grand total.
4. **Ties to the payroll files:** a line saying the total equals the gross pay of the runs in the
   range (their control totals) plus what corrections settled outside the files (their decisions), or
   naming the difference left unexplained.

## States
- **Nothing paid in the range:** says so.

## Never copy
Patriot's wording, icons, colors or logos.

Deviations allowed: none
