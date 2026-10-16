# 0024 — The ACA look-back: cycles per worker from the hours on file, never decided on missing hours

Status: accepted
Date: 2026-10-16

## Context
SPEC §16 asks for an "ACA hours look-back report"; the slice (j) plan (decision J8) adds an "offer
coverage by" duty for each worker measured full-time. The method is 26 C.F.R. § 54.4980H-3(d); the
definitions are in § 54.4980H-1(a). Both were read again from the regulation's text while building
(hour of service (a)(24), full-time (a)(21), start date (a)(47), the administrative period
(d)(3)(vi), the transition to standard periods (d)(4), breaks in service (c)(4)(i)).

## Decision
- **Settings are the agency's, dated, the Owner's**: the standard measurement period's length and
  first month, administrative days, stability months; checked against the dated limits row
  (`aca_rules`: 3–12 months, at most 90 days, at least 6 months and no shorter than the measurement
  period, 1,800 minutes a week, 13 weeks). New workers use an initial period of the same length.
  Saving works the duties out at once.
- **Hours of service** are the paid time entries' own minutes on their own days from each period's
  latest paid version (an entry split over regular and overtime lines counts once), and holiday pay
  with no work on the holiday a person confirmed. Premiums, guarantees and bonuses are pay, not
  hours. Months before Shiftbook come from a CSV import (worker, month, hours), all rows good or
  nothing saved, a month imported again replacing the one on file.
- **Days on file** are the paid periods' days and the imported months (an imported month is on file
  for everyone). An ended period with any day not on file is "hours missing from" that day and is
  never decided; a running one counts to the last day on file. A break needs 13 weeks without hours
  across days on file.
- **The start date** is the hire date when it is before the hours on file, else the first day worked;
  after a break, the return.
- **Rows per worker and cycle**: the latest ended standard period and the running one (for a worker
  employed from their first day), and a new worker's initial period while it or its stability period
  still matters. A new worker's administrative period counts the days before the initial period and
  stops at the end of the first month beginning on or after the first anniversary.
- **The duty** `aca_offer` (one per worker and cycle: `standard:2025-10-01`) is due the day before
  the stability period begins, and says the test's arithmetic. A result that changes before then sets
  an open duty aside as no longer applying; once it is due, the data never sets it aside (a person
  decides).

## Second opinion, fixed
A review found these, each with a test that failed before the fix (`aca.test.ts` "second opinion",
`aca-service.test.ts`, `tests/integration/aca.test.ts` "second opinion"):
- An imported month counted as on file for every worker: it is now on file only for its worker
  (a month of no hours included), and a period whose run skipped a worker is not on file for them.
- A full-time result vanished from the list (and its open duty closed) once the next period ended,
  during a break, or after the settings changed: a full-time result is listed until its stability
  period ends, a worker on a break keeps ended periods, and a duty already due stays.
- Period lengths that do not divide a year jumped at New Year: periods now run one after another
  from the first month of 2000.
- A worker with no hire date looked new from the first day on file: the start is unknown (employed
  all along) unless 13 weeks on file before that day show no hours; the same 13 weeks after an old
  hire date make a return from a break.
- A running period hid early gaps: it now says from when hours are missing.
- Imports could count a month Shiftbook paid twice, and took the month still running: a month paid
  in full is refused, and only months that have ended are taken.
- Paid hours are read from what each run paid (its recorded shifts), not the time entries (which a
  correction not yet paid may have changed); days and months are grouped by worker once.
- The import takes a Payroll ID column, spreadsheet months (10/2025, Oct-25) and decimal hours.
- Settings changes measure past periods with the new settings; duties already due stay on file, so
  nothing owed disappears.

## Alternatives considered
- **Treating days not on file as zero hours:** an agency starting mid-year would see every worker as
  not full-time and get no offer duties — the costliest silent error.
- **One row per worker:** hides the overlap the regulation creates (full-time in an initial period
  keeps its stability period even when the standard period says otherwise).
- **The 4-week "rule of parity" for breaks** (TempWorks applies it): not verified in the final rule;
  not built.
- **Monthly measurement (130 hours a month):** the plan chose the look-back method; the monthly
  method can be added as another setting later.

## Consequences
- The sidebar's badge works the duties out on each page, so this reads what the paid runs paid
  (summed in the database) when the settings exist; nothing is read before then. Caching it is left
  for when an agency's history makes it slow.
- Demo workers were all hired 2026-08-03, so the demo shows them measuring until hours are imported.
