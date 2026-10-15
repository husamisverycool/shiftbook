# Slice (b) screens compared with their pattern files

Captured 2026-10-15 in demo mode (English, 1440×900 unless noted). ✓ = matches the pattern file.

## App frame — `docs/patterns/_layouts/app.md` (Linear sidebar)
Screens: every screenshot below; `slice-b/m3-job-orders-phone.png` for narrow screens.
- ✓ Sidebar on the left under the demo banner: agency name at the top, then Convert timesheets,
  Job orders, Assignments; the current area highlighted.
- ✓ G then C / J / A jumps between areas; `?` lists the shortcuts.
- Differences: on phones the sidebar sits behind a menu button (shadcn default; Linear documents
  no web phone layout). Icons are lucide defaults.

## Job orders — `docs/patterns/job-orders.md` (Linear list, Attio preview)
Screens: `slice-b/b1-job-orders-panel.png`, `slice-b/b2-job-order-create.png`,
`slice-b/es-b1-job-orders.png`, `slice-b/m3-job-orders-phone.png`.
- ✓ View header: title; Filter, Display and New job order on the right.
- ✓ Filters as chips under the header, written to the URL (`?client=…&state=…`).
- ✓ Groups by client by default, sticky headers with a count and a collapse toggle.
- ✓ Rows: position · shift, client · worksite, and the chosen properties (worksite, workers
  assigned of wanted, pay and bill rate today; shift, SOC code, prevailing wage optional).
- ✓ J/K and arrows highlight; X selects; Shift extends; Cmd/Ctrl+A; Esc; F filters; Shift+V
  display options (grouping, ordering, properties, reset; kept per person); C creates.
- ✓ Side panel (Attio preview): "N of M", previous/next, expand, close; key fields and recent
  activity with "View all activity". Space opens and closes it (Linear peek).
- ✓ Create dialog with every field; closing with changes asks to keep a draft (kept in this
  browser and restored next time).
- Differences:
  - Filter operators are "is any of" only (Linear also has "is not" and AND/OR groups).
  - The bulk bar offers only "Clear selection" (no job-order bulk action exists yet).
  - The side panel is shown on wide screens only (1024 px and up); on narrow screens rows open
    the page.
  - No saved views (Alt+V), list/board switch, or right-hand view sidebar.

## Job order page — `docs/patterns/job-orders/[id].md` (Attio record page, Bullhorn, Gusto, Stripe)
Screens: `slice-b/b3-rate-new-version.png`, `slice-b/b4-rate-card.png`,
`slice-b/b5-job-order-assignments.png`, `slice-b/b6-job-order-activity.png`,
`slice-b/m4-job-order-phone.png`.
- ✓ Title (position · shift), client · worksite, Edit and Assign worker under the name.
- ✓ Details panel on the left; tabs Overview · Assignments · Rate card · Activity on the right;
  the tab is in the URL.
- ✓ Rate card: "Effective on" picks the version (today's by default); values; scheduled change
  notice with what changes and "Cancel this change" (several → one notice with Review); New
  version copies the shown one with the date left blank; a version a paid week used shows
  "Used by a paid week" and why, with no Edit or Delete; the earliest cannot be deleted while
  later ones exist; history newest first.
- ✓ Editing an unused version asks for a reason from a short list; Other needs a note.
- ✓ Bill rate may be entered as a markup; the rounding is shown before saving.
- ✓ Assignments tab: worker, start, end, status, rates; Assign worker (roster only) stays open for
  the next worker; selection toolbar with End and Cancel (cancel asks for a reason); "Set own
  rates" for one worker.
- ✓ Activity: who, what, when, the values that changed and the reason, newest first.
- Differences:
  - The worker picker is a plain list of the roster (Airtable's picker has a search box).
  - Bullhorn's "Request change" approval flow is not built (not in this slice).
  - Activity has no per-type filter (Attio lets you hide event types).

## Assignments — `docs/patterns/assignments.md` (Linear list, Attio linked fields)
Screen: `slice-b/b7-assignments.png`.
- ✓ Same list mechanics as job orders; grouped by status; rows show the worker with the linked job
  order's position, shift and client; Import placements and New assignment in the header.
- ✓ Bulk bar: End assignments with one end date; each refusal is explained.
- Differences: as for job orders.

## Import placements — `docs/patterns/assignments/import.md` (Attio import, Linear importers, Flatfile)
Screens: `slice-b/b8-import-source.png`, `slice-b/b9-import-map.png`,
`slice-b/b10-import-values.png`, `slice-b/b11-import-preview.png`, `slice-b/b12-import-results.png`.
- ✓ Steps across the top: Source · Match columns · Review values · Preview · Import; Back/Next.
- ✓ Source first (Bullhorn, JobAdder, Spott, other); drop or choose a CSV or Excel file.
- ✓ Columns that may hold SSNs or birth dates (by heading in English or Spanish, by any nine-digit
  number, or by dates 14+ years old) are removed on receipt and never shown; a notice names them.
- ✓ Match columns: file columns on the left with sample values, Shiftbook fields on the right,
  auto-matched from the preset or the last import from the same source; required fields listed.
- ✓ Review values: each distinct worker, client, job order and status with its row count; choosing
  a match fixes every row; workers are matched to the roster or left out, never created; a new job
  order needs its worksite; unresolved values are marked and Next waits for them.
- ✓ Preview: assignments to create, new job orders, own rate versions to add (with their amounts),
  rows already imported, rows skipped with their reasons, and how dates were read.
- ✓ Results: every row imported or skipped with its reason, filterable; earlier imports listed.
- Differences:
  - No date-format setting: day-first dates are recognised when the file shows it (a first number
    above 12); otherwise dates are read month first, and the preview says which was used.
  - No find-and-replace or cell editing; at most 2,000 rows per import.
  - Imports cannot be deleted afterwards, and drafts cannot be shared by link.
