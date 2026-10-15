# Slice (a) screens compared with their pattern files

Captured 2026-10-15 from the running demo (Chromium, 1440×900 and a 390×844 phone), after the
end-to-end tests passed in English and Spanish. ✓ = matches the pattern file. Every difference is
listed; none is a design idea of our own, and most are parts of a pattern that slice (a) does not
build yet.

## Root frame and demo banner — `docs/patterns/_layouts/root.md`
Screens: every screenshot (top strip).
- ✓ Banner at the top of every page, in demo mode only: demo-data line, sample timesheets (.zip)
  (decision D6), Reset demo.
- ✓ Reset confirms in a dialog, restores the demo agency, returns to the landing.
- ✓ No navigation frame in slice (a).
- Differences: none.

## Converter landing — `docs/patterns/convert.md` (Gusto payroll list)
Screens: `slice-a/en-1-landing.png`, `slice-a/m2-landing-phone.png`.
- ✓ Page heading, then the table of pay periods: period · status · the row's action at the row's end.
- ✓ Phones: the status moves under the period so the action stays in view (Gusto's list changes its
  layout on small containers).
- Differences:
  - Gusto's list also has a date-range filter, Type / Pay date / Run by columns and a row menu
    (skip, cancel). Not built: slice (a) has two weekly periods and no run types.

## Step frame — `docs/patterns/convert.md` (Gusto flow frame)
Screens: all step screenshots; `slice-a/m1-hours-phone.png` for narrow screens.
- ✓ Header row: trail of the steps reached so far (earlier steps are links, current one marked for
  screen readers); Save and exit on the right.
- ✓ Narrow screens: the trail collapses to one back link naming the previous step.
- ✓ Heading with the period line, dates in bold.
- ✓ Forward action in the heading row on desktop, full width under the heading on phones.
- ✓ Alerts above the body.
- ✓ Gating: forward is disabled while files are being read, while any entry needs attention, while
  the run is blocked, and while working; the label changes and the body becomes a loading panel.
- ✓ One-way lock: after "Create files" the earlier steps are no longer links and the page stays on
  Files.
- Differences: none.

## Step 1, Upload — `docs/patterns/inbox.md` (Dext add-documents panel, Expensify states)
Screen: `slice-a/en-4-upload-done.png`.
- ✓ Drop area with a "select files" button; accepted types and size limit stated.
- ✓ Refused files listed in the panel with the reason (already uploaded, unsupported type,
  too large).
- ✓ Processing section while files are read; the list refreshes on its own.
- ✓ Failed reading: red indicator, the message, and "Try again".
- Differences (the converter uses the upload part of the inbox; the full `/inbox` page is a later
  slice):
  - No page header with search, filters and export.
  - No Inbox / Processing / Archive tabs.
  - Columns are File · Kind · Status · Client · Entries · Needs review. Dext's Received via and
    Received columns are not shown, and there is no column settings control.
  - No row selection, no footer totals, and rows do not open a document page
    (`/documents/[id]` is not in slice a).
  - Processing does not show an estimated time remaining.
  - No email channel shown.

## Step 2, Review hours — `docs/patterns/review.md` (Airtable grid, Rippling timesheets, Rossum panel, Restaurant365 edits)
Screens: `slice-a/g1-hours-flagged.png`, `slice-a/g2-hours-edit-reason.png`,
`slice-a/g3-source-panel.png`, `slice-a/g4-bulk-bar.png`, `slice-a/m1-hours-phone.png`.
- ✓ Filters row: needs review / all, and a search for one worker.
- ✓ Columns Worker · Client · Date · In · Out · Break · Hours · Confidence · Status · Source.
  Flagged values are shown in the error colour with the reason under the worker's name.
- ✓ Checkbox per row and select-all.
- ✓ Approve and reject at the row's far right; rejected rows can be restored.
- ✓ Bulk bar at the bottom centre. Bulk approve changes only high-confidence rows and says how many
  stayed as they were.
- ✓ Side panel:
  - The entry's values.
  - The redacted source page, with a box around each value in three states and zoom controls.
  - Spreadsheet sources name the file and row.
  - The entry's history in time order: who, when, the reasons, and before → after.
- ✓ Edit (Restaurant365):
  - The row's values become editable in place.
  - Preset reasons, more than one allowed, are required before the checkmark saves; "Other"
    needs a note.
  - Cancel leaves the row unchanged.
  - Edited values carry a marker.
- ✓ Keyboard: arrow keys move between cells, Enter/F2 edits the row, Space opens the side panel,
  Esc leaves.
- ✓ Dates outside the period cannot be chosen.
- Differences:
  - Filters: no pay-period, client or confidence filters (the converter fixes the period).
  - No Rippling hours-summary panel; the hours total is in the grid's bottom row.
  - No Airtable view bar (row height, hide fields, filter, group, sort).
  - No header-menu actions (hide, resize, reorder fields).
  - The expand control is always visible, not only on hover.
  - No "+" to add an entry by hand.
  - Summary bar: only the hours sum, with no choice of summary function.
  - Keyboard shortcuts not built: Shift-range selection, copy/cut/paste, undo/redo, Cmd+F,
    Shift+Enter, Cmd+/, previous/next entry in the panel, Enter to the next value awaiting review.
  - Side panel has no comments tab.
  - Source boxes on photos could not be shown yet: photo readings need the recorded readings
    (Anthropic key).

## Step 3, Review totals — `docs/patterns/convert.md` (Gusto review step)
Screens: `slice-a/en-6-totals-blocked.png`, `slice-a/en-7-totals-ready.png`,
`slice-a/es-6-totals-blocked.png`.
- ✓ Edit (secondary) and Create files (primary) in the heading row.
- ✓ One error alert per blocker type. Rule blockers name the state's rules once and list the
  workers.
- ✓ A blocker that can be resolved here offers to skip the workers for this run, with a required
  reason.
- ✓ Entry-level blockers link back to Review hours.
- ✓ Warnings can be dismissed; blockers cannot.
- ✓ Summary heading and a one-row figures table: workers · regular hours · overtime hours · gross
  pay · billed.
- ✓ Tabs (hours worked, pay, billing), each with a totals footer row and 25 rows per page.
- Differences:
  - Skipped workers are listed in an alert, grouped by reason, with "bring back". Gusto shows a
    skipped badge in the tables; skipped workers have no lines here, so they do not appear in
    the tables.

## Step 4, Files — `docs/patterns/convert.md` + `docs/patterns/exports.md` (Gusto receipt, Stripe report sections)
Screen: `slice-a/en-8-files.png`.
- ✓ Success alert.
- ✓ Payroll file section with Download at its upper right:
  - control totals (workers, hours by type, gross; the gross Gusto will compute and the
    difference),
  - the rounding notes,
  - the file's SHA-256.
- ✓ Invoices table with a Download per invoice.
- Differences:
  - No Stripe-style report controls (period range, format selector). The converter has one
    period and one format.

## Invoice PDF — `docs/patterns/_documents/invoice.md` (Stripe invoice PDF)
Screens: `slice-a/invoice-1.png`, `slice-a/invoice-2.png`.
- ✓ Title.
- ✓ Label/value stack: number, issue date, due date, PO, service period, worksite.
- ✓ Agency and Bill-to address columns.
- ✓ Large "amount due by date" line.
- ✓ Lines: description with a second line (earning type, week); hours from whole minutes; rate;
  amount.
- ✓ Right-aligned subtotal, total and amount due; footer text; "Page X of Y".
- Differences:
  - No memo block and no Ship-to column (neither applies).
  - Letter size only (A4 not offered yet).

## Known gaps across the slice
- Photos and the signed PDF are read only from recorded readings in demo mode. None exist until
  the Anthropic key is added and `scripts/record-demo-extractions.ts` is run.
- In Spanish, titles, labels and blocker names are translated. The detail lines written by the
  rules engine and the explain strings are still English (slice k translates them).
- California weeks are held until California's daily and seventh-day rules arrive (slice c).
