# Pattern: Import placements (`/assignments/import`)

Status: adopted — slice (b) plan, decision B3 (2026-10-15)
Reference product and screen: Attio — CSV import (upload → map columns → review values → preview →
run, with import history); Linear — importers (choose the source tool first; map users; re-import
skips what was already imported); Flatfile — remembered mappings and marked problem cells
Source URL: https://attio.com/help/reference/imports-exports/csv-imports/import-data-into-attio-via-csv
Source URL: https://attio.com/help/reference/imports-exports/csv-imports/view-and-manage-csv-imports
Source URL: https://attio.com/help/reference/imports-exports/csv-imports/troubleshooting-csv-imports
Source URL: https://linear.app/docs/import-issues
Source URL: https://linear.app/docs/cli-importer
Source URL: https://support.flatfile.com/articles/8569925090-mapping-data
Source URL: https://support.flatfile.com/articles/7763163677-importing-data-with-flatfile-overview
Source URL: https://bullhorn.github.io/rest-api-docs/entityref.html#placement
Source URL: https://api.jobadder.com/v2/openapi.json
Source URL: https://docs.spott.io/docs/placements/placements.md
Researched: 2026-10-15 (date format and preview records re-checked on the first Attio page the same day). Confidence: high for Attio's steps and states; low for the three vendors'
exact export header text (none publishes it — presets match documented labels and API field names,
and the mapping step lets the person correct them).

## Purpose in Shiftbook
Bring an agency's current placements in from its recruiting system (SPEC §8: CSV import of
placements from Bullhorn, Spott and JobAdder exports via column mapping), without retyping.

## Hierarchy
A step frame, one step at a time, with Back and Next (Attio's import steps):
0. **Source** (Linear importers): Bullhorn · JobAdder · Spott · Other spreadsheet. The choice sets
   the preset mapping.
1. **Upload** (Attio): drop area or choose a file (CSV or Excel); after upload, the number of
   columns and rows found.
2. **Map columns** (Attio): file columns on the left, Shiftbook fields on the right, auto-mapped from
   the preset or a mapping remembered from an earlier import (Flatfile memory); hover a field for
   sample values; leave a column unmapped to skip it. Required: worker name, client, position, start
   date. Columns that look like Social Security numbers or birth dates are never shown; the ones
   removed when the file was received are listed above the columns by position, with why and what
   to do (SPEC §21 data safety — a Shiftbook rule, not from the references).
3. **Review values** (Attio): column list on the left; for the chosen column, each distinct value
   with its row count and what it maps to — workers matched to the roster (or "leave out"; never
   "create"), clients matched to existing clients, positions to job orders (or a new job order, with
   its worksite chosen here), dates read in the chosen format (Attio: for a date attribute the
   format the data uses is chosen in this step; a value that does not match is marked "Invalid
   format"). Here: a Dates entry with month first / day first and each distinct start or end date
   with what it reads as. Fixing a value fixes every row with it; invalid values are marked
   (Flatfile cell marking).
4. **Preview** (Attio): what will happen — assignments to create, job orders to create, rate versions
   to add, rows skipped (each with its reason), rows already imported (Linear re-import skip); the
   records to create listed (Attio: "click between tabs to view the records"), each with its row,
   worker, job order and dates.
5. **Run** (Attio): progress, then every row with imported or skipped and the reason; filter by
   result.
- **Import history** under the step frame (Attio): earlier imports with source, file, date, counts.

## Interactions
- Back/Next between steps loses nothing (Attio).
- Next is disabled until the step is complete (required fields mapped; every value either matched or
  left out).
- Start import runs once; a second click does nothing (idempotent per file and source ids).

## States
- File refused (unsupported type, too large, empty, no header row): the reason under the drop area.
  A first row holding a date or an SSN-shaped number is a record, not column names: refused with
  what to do, before anything is kept.
- A row whose worker is not on the roster: skipped with "not on the roster" unless matched by hand.
- Failed import: the run step lists the failure per row; nothing half-written for a row.
- Loading and error as the converter.

## Not known from the references (ask the owner before building)
- Import drafts shared by link (Attio) — not in this slice.

## Never copy
Wording, icons, colors or logos of Attio, Linear, Flatfile, Bullhorn, JobAdder or Spott.

## Look (decision 0029, from the products' own screenshots)
Laid out as `_components/record-page.md`'s header ("Assignments" above the title) with the shared numbered steps of decision 0029 rule 12.

Deviations allowed: none
