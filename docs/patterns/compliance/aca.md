# Pattern: ACA look-back (`/compliance/aca`)

Status: adopted — slice (j) plan, decision J8 (2026-10-16)
Reference product and screen: TempWorks — ACA Employee Cycles report (parameters: dates, branch,
status, customer, average hours, "Show", "Group By"; one row per employee cycle: Employee, Hire Date,
Cycle Status, Current Status, Measurement Hours, Weeks, Average, Start and End, Administrative Start
and End, Stability Start and End, Break In Service Start and End); the periods' terms from 26 C.F.R.
§ 54.4980H-3 (standard and initial measurement periods of 3 to 12 months, an administrative period of
up to 90 days in all, a stability period of at least six months and no shorter than the measurement
period, a break of 13 weeks)
Source URL: https://kb.tempworks.com/help/pdfexport/id/5f15b22fec161cb956687e7c
Source URL: https://www.ecfr.gov/current/title-26/chapter-I/subchapter-D/part-54/section-54.4980H-3
Researched: 2026-10-16 (`docs/research/compliance-slice-j.md` §6; the regulation's text checked again
for hours of service, the 90-day total for new workers and the transition to standard periods).
Confidence: high for the columns (TempWorks) and the periods (the regulation).

## Purpose in Tabulado
Who is full-time under the look-back measurement method, so the agency offers coverage in time
(SPEC §16 "ACA look-back"), from the hours Tabulado paid and the months imported from before it.

## Hierarchy
1. **View header and tabs** as `compliance.md` (ACA tab).
2. **Parameters** (TempWorks): the measurement settings in force (standard period months and first
   month, administrative days, stability months) and when they began, with a link to Compliance
   settings; the hours on file (the paid weeks, and the months imported: how many, from when to
   when, the latest file and who imported it); Show (all, full-time, not full-time, measuring, hours
   missing, on a break); search by worker; **Import hours** (the Owner).
3. **Table**, one row per worker and cycle (TempWorks): worker, hire date, cycle (initial or
   standard), result in words (full-time, not full-time, measuring, hours missing from a date, on a
   break), measurement start and end, hours, weeks, average hours a week; administrative start and
   end; stability start and end; break in service start and end. A full-time row links to its
   "offer coverage by" duty and stays listed until its stability period ends; a worker on a break
   keeps the rows of periods already ended.
4. **Import hours** (a dialog): a CSV with the columns Worker, Month and Hours, and optionally
   Payroll ID, of hours of service before Tabulado (months as spreadsheets write them, 2025-10,
   10/2025 or Oct-25; hours whole, h:mm or decimal); rows are matched by the payroll ID, else the
   worker's full name; only months that have ended and that Tabulado did not pay in full; rows that
   are wrong are listed by row number with what is wrong, and nothing is saved until every row is
   good; a month imported again replaces the one on file.

## Interactions
- A full-time result opens its "offer coverage by" duty (Compliance list, area ACA), due the day
  before the stability period begins.
- Show and search change the table at once and stay in the address.
- Import and the settings are the Owner's; everyone else reads (no link to change them).

## States
- **No settings yet:** says the look-back needs its periods first, with a link to set them.
- **Hours missing:** a period with days whose hours are not on file is not decided; the row says from
  which day — while it is measuring too — and the import is the way to fill them.
- **No workers to measure:** says no worker has hours on file in these periods.
- **Nothing matches:** a line with Clear filters.

## Never copy
TempWorks' wording, icons, colors or logos.

Deviations allowed: none
