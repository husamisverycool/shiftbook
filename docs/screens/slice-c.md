# Slice (c) screens compared with their pattern files

Captured 2026-10-16 in demo mode (English, 1440×900 unless noted). ✓ = matches the pattern file.
Slice (c) adds no screen: its results show in the converter's existing steps, whose pattern files
did not change. These screenshots show the new pay results in those steps.

## Step 3, Review totals — `docs/patterns/convert.md` (Gusto review step)
Screens: `slice-c/c1-california-week-totals.png`, `slice-c/es-c1-california-week-totals.png`,
`slice-c/c3-two-rate-week-refused.png`, `slice-c/c4-skip-dialog.png`,
`slice-c/c5-two-rate-week-skipped.png`.
- ✓ A California week that slice (a) held is now paid: 40 h regular, 20 h overtime and 3 h
  double time (daily overtime over 8 h, double time over 12 h, the seventh day), $1,482.00 gross.
  The summary's overtime column counts overtime and double time together; the Hours worked tab
  shows them apart (both as slice (a) built them).
- ✓ A worker with two pay rates and overtime is paid on the weighted regular rate ($907.03). The
  Gusto hours file carries one rate per job row, so the file would be refused: the error alert
  names the worker and why, and offers to skip them for this run with a required reason (the
  existing skip, unchanged). After skipping, the other workers' files can be created.
- Differences: none new. The slice (a) differences still apply (skipped workers listed in an alert
  rather than badged in the tables).

## Step 4, Files — `docs/patterns/convert.md` + `docs/patterns/exports.md`
Screen: `slice-c/c2-california-week-files.png`.
- ✓ Control totals now show double time hours alongside regular and overtime, and the gross Gusto
  will compute matches Shiftbook's to the cent.
- Differences: none new.

## Invoice PDF — `docs/patterns/_documents/invoice.md`
No layout change: the new kinds of line (double time, holiday, bonus, minimum-wage top-up,
meal and rest premiums, reporting pay) use the existing line layout with their own English and
Spanish names (a unit test checks every kind has both).
