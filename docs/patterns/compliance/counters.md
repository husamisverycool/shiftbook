# Pattern: Hours counters (`/compliance/counters`)

Status: adopted — slice (j) plan, decisions J5 and J6 (2026-10-16)
Reference product and screen: TempWorks — ACA Employee Cycles report (one row per employee and
window: hours, weeks, average hours, the window's start and end; filters by customer; a "Show"
option to find what needs attention); the Illinois counter's own terms from 820 ILCS 175/42 (more than
720 hours at one client within 12 months; more than 4,160 hours within 48 months)
Source URL: https://kb.tempworks.com/help/pdfexport/id/5f15b22fec161cb956687e7c
Source URL: https://ilga.gov/documents/legislation/ilcs/documents/082001750K42.htm
Researched: 2026-10-16 (`docs/research/compliance-slice-j.md` §1, §6; slice (c) research §4).
Confidence: high for the columns' meaning (TempWorks report); the counter's terms are the statute's.

## Purpose in Shiftbook
Each Illinois worker's hours at each client toward the equal-pay thresholds (SPEC §4 HoursCounter,
§16 "Illinois Section 42 triggers"), with the hours worked there before Shiftbook.

## Hierarchy
1. **View header and tabs** as `compliance.md` (Counters tab); a line saying what is counted (the
   rule's windows and thresholds, its citation).
2. **Filters** (TempWorks parameters): search by worker; client; Show (all, near — past the rule's
   heads-up and not crossed, crossed).
3. **Table**, one row per worker and client (TempWorks: one row per employee and window): worker,
   client, hours in the 12 months to today (of the 720) with the window's first day, hours in the 48
   months (of the 4,160), hours before Shiftbook included, and the state — crossed on a date (a link to
   its duty), near (hours to go), or hours to go.
4. **A row opens** (a button on the row, keyboard reachable): its opening balances — hours, the date
   they run to, the note, who added them and when; removed ones struck through with who, when and why
   — with **Add balance** and **Remove** (the Owner).

## Interactions
- Add balance (a dialog): the worker and client (from the row, or chosen when adding from the page),
  the hours (whole hours, or hours and minutes as h:mm), the date they run to (not after today), a note;
  the next run counts them.
- Remove asks for a reason; the balance stays listed as removed.

## States
- **No counter rule in force:** says the counters need the Illinois rule.
- **Nothing to count:** says no Illinois day and temporary labor has been worked or entered.
- **No match:** says so, with Clear filters.
- **Read only** (everyone but the Owner): no Add or Remove.

## Never copy
TempWorks' wording, icons, colors or logos.

Deviations allowed: none
