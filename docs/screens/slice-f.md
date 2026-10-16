# Slice (f) screens compared with their pattern files

Captured 2026-10-16 in demo mode (English, 1440×900, full page; Spanish copies start with `es-`).
✓ = matches the pattern file.

## Payroll file settings — `docs/patterns/settings/payroll.md` (7shifts integration settings and mapping page; Deputy destination fields and custom template; QuickBooks Time item mapping)
Screens: `slice-f/f01-settings-gusto.png`, `slice-f/f02-settings-adp-refused.png`,
`slice-f/f03-settings-adp-codes.png`, `slice-f/f10-settings-qbd-2021.png`,
`slice-f/f11-settings-none-chosen.png`, `es-f01`, `es-f03`.
- ✓ Page header: "Settings" above the H1 "Payroll file", with a one-line description.
- ✓ Payroll system: one option per system with the hint of what its file carries; the system in use
  is marked "In use" (Deputy format list; 7shifts target chosen once).
- ✓ The chosen system's own fields appear under the choice (Deputy): ADP's company code with its
  rule as help text (`f03`); QuickBooks Desktop's version, and for 2021 and earlier the company name
  and company file number (`f10`).
- ✓ The file name the system expects (`PRXYZEPI.csv`), read only.
- ✓ Save (7shifts saves explicitly), "Saved" beside it, and when and by whom it was last changed.
- ✓ Refused: a company code that breaks the rule shows the rule under the field and nothing is
  saved (`f02`).
- ✓ Nothing chosen yet: an error alert says so and the tabs are not shown (`f11`).
- ✓ Tabs for the system in use: Earning codes · Worker ids · (Spreadsheet only) Spreadsheet columns.

## Earning codes — same pattern file, Hierarchy 4 (7shifts export codes; QuickBooks Time items)
Screens: `slice-f/f01-settings-gusto.png` (Gusto's fixed columns), `slice-f/f03-settings-adp-codes.png`.
- ✓ One row per kind of pay Shiftbook can produce: the kind, the code (a field, or the file's fixed
  column as text), hours or dollars where the system lets the agency choose, the multiple (a field
  where the agency declares it, ADP; fixed otherwise), and what happens when blank, per row
  (7shifts). Kinds the system cannot carry say so in their row.

## Worker ids — same pattern file, Hierarchy 5 (7shifts mapping page; QuickBooks Time autosave)
Screens: `slice-f/f04-settings-worker-ids-missing.png`, `slice-f/f05-settings-worker-id-refused.png`,
`slice-f/f05b-settings-worker-ids-all.png`, `es-f04`.
- ✓ A progress bar with "N of M workers have an id", filter chips All · Missing · Set with counts, a
  search box, then one row per worker: name, the id field (and Gusto's job title), a status badge.
- ✓ An id saves when the field is left or Enter is pressed; the badge and the progress update; an
  id the system would refuse shows the rule under the field (`f05`).
- ✓ Opened from the run's fix on **Missing** (`f04`: only the worker without an ADP file number).
- Differences: the Missing badge is outlined rather than red, so its text keeps enough contrast
  (axe); the pattern names no color.

## Spreadsheet columns — same pattern file, Hierarchy 6 (Deputy custom payroll export)
Screens: `slice-f/f08-settings-spreadsheet-columns.png`, `slice-f/f09-settings-layout-refused.png`, `es-f08`.
- ✓ File options first (file name with its rule, delimiter, date format, header row on or off).
- ✓ Included columns in file order, each with its header (rename), move up, move down and Remove
  (Deputy drags; keyboard buttons here), then "Add a column": a search box over the fields,
  fixed text included (Deputy's static value). Save with "Saved".
- ✓ A layout that cannot name a worker, a code or a price is refused with the reason (`f09`).
- Not in the pattern file, so not built: Deputy's blank, concatenated and conditional columns,
  custom rows and fixed width (the research found no PEO template that needs them yet).

## Exceptions — `docs/patterns/convert.md` step 3 (Workyard just-in-time mapping; ClickTime refuses missing ids)
Screens: `slice-f/f06-exceptions-missing-id.png`, `es-f06`.
- ✓ "No id in the payroll system" names the worker and offers **Open payroll file settings** (to
  Worker ids, Missing) beside skipping the worker.

## Files — `docs/patterns/convert.md` step 5 with `exports.md`
Screens: `slice-f/f07-files-adp.png`, `es-f07`.
- ✓ The payroll file's section names its format ("ADP Workforce Now paydata · PRXYZEPI.csv"), and the
  control totals say the gross that system will compute.

## App frame — `docs/patterns/_layouts/app.md` (Linear workspace menu)
Screen: `slice-f/f12-agency-menu.png`.
- ✓ The agency's name at the top of the sidebar opens a menu with Settings.
