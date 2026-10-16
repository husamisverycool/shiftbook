# Slice (f) — All payroll export formats

Status: GO under the owner's "just keep going … I don't need to approve anything for you"
(2026-10-16). Choices the research left open are listed under "Decisions made for the owner"; the
owner can reverse any of them.
Contract: SPEC.md §13 (payroll exports), §5 (money and time), §11 (files from the approved run),
§23 (golden tests). Research with sources: `docs/research/payroll-formats-slice-f.md`.

## Goal (what the owner can do at the end)
Choose the agency's payroll system once — Gusto, QuickBooks Desktop, QuickBooks Online, ADP Workforce
Now, RUN Powered by ADP, or a spreadsheet laid out the way a PEO or factoring company asks — set its
codes and each worker's id there, and every week's files (and every correction's) come out in that
format. A file is never made with something the format cannot carry: the run names the worker and
what to do instead. Every file states the gross the payroll system should compute from it, next to
Shiftbook's own, so a difference is seen before payday.

## Done means (evidence I will paste)
1. `pnpm test` (unit + integration + goldens), `pnpm typecheck`, `pnpm lint` — real output, green.
2. Proposed answer keys for every format (a basic week, and each format's refusals), checked against
   hand arithmetic, byte for byte.
3. Playwright, English and Spanish: the Owner switches the payroll system to ADP Workforce Now, enters
   the company code and a worker id, runs a week and downloads `PRxxxEPI.csv`; the same for the
   spreadsheet format with a custom column order. Accessibility checks on every new screen.
4. Screenshots of every new screen and state, compared with the pattern files.
5. A second-opinion review of every exporter (money and export changes), fixed.

## The formats (research §0–§6)
| Format | File | Worker key | Carries | Who prices it |
|---|---|---|---|---|
| Gusto hours CSV (built) | `gusto-hours-….csv` | Gusto employee id + job title | REG/OT/DT hours, bonus dollars | Gusto: stored rate × 1, 1.5, 2 |
| QuickBooks Desktop IIF | `quickbooks-time-….iif` (TAB, CRLF, ASCII) | exact QuickBooks employee name | hours per payroll item (REG/OT/DT, holiday hours) | QuickBooks: the item's rate × its factor |
| QuickBooks Online time-importer CSV | `quickbooks-online-time-….csv` | exact display name | regular hours only | QuickBooks Online: the employee's pay rate |
| ADP Workforce Now Paydata | `PRcccEPI.csv` (CRLF, ASCII 32–91/93–122) | Co Code + File # | hours with a rate per row, dollars per earnings code | ADP: `Temp Rate` × hours × the code's factor; dollars as written |
| RUN Powered by ADP time import | `adp-run-….csv`, first row `##GENERIC## V1.0` | company code + employee id | hours per earnings code at the BASE rate, dollars per amount code | RUN: the BASE rate × 1, 1.5, 2; dollars as written |
| Spreadsheet (mapped CSV) | the agency's file-name template | the agency's chosen worker id | every line: hours with its rate, or dollars | the target, from the rate or amount in each row |

## How each export works (one design for all)
- **Agency settings (effective-dated, audited):** `payroll.target` — the format and its options
  (company code, QuickBooks Desktop version, the customer name QuickBooks Online needs, the
  spreadsheet layout); `earning_code_map.{format}` — per earning type its code in the target, whether
  it travels as hours or dollars, and the factor the target applies to hours.
- **Worker ids per system** stay on the worker (`payrollIds`); the run's "no payroll id" check and
  the file's dry run use the agency's target, not Gusto.
- **Each exporter is pure** (fixture in, bytes + control totals + notes out), declares what it can
  carry, refuses everything else naming the worker, reads its own file back and must give the same
  workers and minutes by type, and states the gross the target should compute (with the money effect
  of rounding hours to the file's precision, as Gusto does today).
- **Where the target multiplies a stored rate** (Gusto, QuickBooks Desktop and Online, RUN), every
  hours line must equal that rate × the declared factor, or the worker is refused (pay by hand). ADP
  Workforce Now and the spreadsheet carry a rate or dollars per row, so they carry a worked-week
  regular rate exactly (decision F4).
- **Corrections** (slice e) use the same exporters with differences only, named for the version.

## Screens and their references
| Screen | Pattern file | Reference |
|---|---|---|
| Payroll file settings (`/settings/payroll`): system, its options, earning codes, worker ids | `settings/payroll.md` (new) | 7shifts per-integration settings with tabs and a matched/unmatched mapping page; QuickBooks Time payroll item mapping; Deputy export destination fields |
| Spreadsheet layout editor (a tab of the same page) | `settings/payroll.md` | Deputy custom payroll export template (columns list, rename, reorder, format settings) |
| Exceptions: "no id in the payroll system" fix opens the worker ids tab | `convert.md` (updated) | Workyard just-in-time mapping; ClickTime refuses to export with missing ids |
| Files: the payroll file section names its format | `convert.md`, `exports.md` | Stripe report sections (unchanged) |

## Steps (tests first)
1. Settings service (effective-dated change with audit; the payroll target; code maps); the run and
   files take the target from settings. Gusto stays the demo default; nothing else changes.
2. Exporters, one at a time, each with unit tests, proposed answer keys and its refusals:
   QuickBooks Desktop IIF → QuickBooks Online → ADP Workforce Now → RUN → spreadsheet.
3. The settings page and the Exceptions fix; demo workers get ids in every system.
4. Browser tests, accessibility, screenshots; second-opinion review; fixes.

## Decisions made for the owner (2026-10-16, under "keep going"; any can be reversed)
- F1 One payroll system per agency at a time. A change applies to every payroll file not made yet
  (the next weeks, and any correction not exported yet); files already made keep their format.
  Each change is kept with its date and who made it (the settings history and the audit log).
- F2 QuickBooks Desktop: the 2022-and-later file (no Timer header rows) by default; the older file
  when the agency says it runs 2021 or earlier (it then needs the company name and the company file
  number from a Timer Lists export). Each worker's week of hours per payroll item goes on the week's
  last day, split into the fewest rows of at most 23:59 (the file's limit), as equal as whole
  minutes allow (40 h → 20:00 + 20:00); the day-by-day detail stays in Shiftbook. Payroll items
  multiply the stored rate by 1 (regular, holiday not worked), 1.5 (overtime) and 2 (double time).
- F3 QuickBooks Online has no time import of its own: Shiftbook writes the CSV the documented
  importers read (date, name, customer, hours as H:MM, not billable), with regular hours only; any
  other kind of pay names the worker to pay by hand. The customer on every row is a setting.
- F4 ADP Workforce Now: one row per worker and `Temp Rate`; a line's `Temp Rate` is its rate
  divided by the multiple ADP applies to its column (1 for `Reg Hours`; the agency's declared
  overtime multiple, 1.5 by default, for `O/T Hours`; the declared multiple of each hours code), so
  overtime at a worked-week regular rate travels exactly (to the 4 decimals ADP takes). Other hours
  kinds use an `Hours 3` code; dollar kinds an `Earnings 3` code (at most four code pairs per row;
  more go on another row). Blanks, never zeros. No name or SSN columns (ADP ignores them and names
  can hold characters ADP refuses). Batch ID = the period's end date as YYMMDD and the run version
  in two digits (`26101101`). File name `PRcccEPI.csv` (`PRcc_EPI.csv` for a two-character code).
- F5 RUN: one row per worker and earnings code, rate code `BASE`; pay frequency from the period
  (7 days W, 14 days B). Each kind of pay is hours (at the stored base rate × 1, 1.5 or 2) or
  dollars, as the agency maps it; a line at any other rate names the worker (RUN takes rate codes,
  not rates).
- F6 Spreadsheet: one row per pay line (worker, workweek, kind of pay, rate), columns chosen,
  renamed and ordered by the agency from a fixed list (never SSN), with delimiter, header row,
  date format and file name set by the agency. Hours are written to two decimals rounded up (as for
  Gusto), rates to four decimals, amounts to the cent. A layout must carry the amount, or hours
  with the rate, so the receiver can price every row; a blank code falls back to Shiftbook's own
  code for the kind of pay (REG, OT, …).
- F7 A difference between Shiftbook's gross and what the target computes from the file (rounding
  of hours or of a rate to the file's precision) is shown in the notes and never blocks; a
  difference from a rate or multiple the target does not have always blocks (names the worker).
- F8 A correction's file uses the same exporter with the differences only, named for its version.
  Where the target pays a stored rate (Gusto, both QuickBooks, RUN), every line is checked against
  the worker's one regular rate in the whole period (as for Gusto). Correction lines keep their
  workweek, so dated files put them in the week they were worked.

## Open questions (do not block; for the owner when convenient)
- A real QuickBooks Desktop 2022+ test import of the IIF file; the QuickBooks Time import columns;
  ADP's overtime factor on `Temp Rate`; RUN's exact heading text (research §8).

## Out of this slice
Live connections to payroll systems (API); invoice backup and templates (g); importing the target's
employee list to match names (a later convenience).

## Progress (2026-10-16)
- Steps 1–2 done (commit 8b225a1): settings service and five exporters, tests first; thirteen proposed
  answer keys checked against hand arithmetic.
- Second-opinion review of the exporters: two blockers (ADP's declared overtime multiple ignored on
  `O/T Hours`; the stored-rate check skipped when a worker had no regular hours line) and nine
  smaller findings — all fixed with tests (decision record 0015).
- Step 3: `/settings/payroll` (system, earning codes, worker ids, spreadsheet columns), the agency
  menu's Settings, the Exceptions fix, the Files step naming the format.
