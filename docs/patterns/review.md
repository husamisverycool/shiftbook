# Pattern: Hours review grid (`/review`)

Status: adopted — built in the converter's Review hours step (`convert/hours-grid.tsx`; the grid
lives inside `/convert`, so `/review` has no page of its own). Owner, 2026-10-17: "Finish everything".
Reference product and screen: Airtable — Grid view (primary: grid mechanics, keyboard, summary bar);
Rippling — Time > Timesheets (secondary: hours content, approval status, per-entry actions);
Rossum — validation screen (the source document beside the values: boxes, their states, review order);
Restaurant365 — Punch Edits (editing an entry requires a reason; edited marker; per-entry audit log)
Source URL: https://support.airtable.com/articles/7905594155-airtable-grid-view
Source URL: https://support.airtable.com/articles/7980233311-airtable-keyboard-shortcuts
Source URL: https://support.airtable.com/articles/2203617073-accessibility-in-airtable
Source URL: https://support.airtable.com/articles/7344081006-using-the-summary-bar-in-airtable-views
Source URL: https://support.airtable.com/articles/4087973664-adding-duplicating-and-deleting-airtable-records
Source URL: https://help.rippling.com/article?articleId=1500010823462 (to verify in a browser)
Source URL: https://help.rippling.com/article?articleId=360058673234 (to verify in a browser)
Source URL: https://knowledge-base.rossum.ai/docs/document-validation-screen-in-rossum
Source URL: https://knowledge-base.rossum.ai/docs/interactive-bounding-boxes-in-rossum
Source URL: https://knowledge-base.rossum.ai/docs/keyboard-shortcuts
Source URL: https://docs.restaurant365.com/docs/punch-edits
Source URL: https://docs.restaurant365.com/docs/punch-audit-report
Researched: 2026-10-15. Confidence: high for Airtable shortcuts and behaviors, medium for Airtable
toolbar order (not documented); high for Rippling content, medium until URLs are browser-checked.

## Purpose in Granite
Every time entry for the period in one spreadsheet-style grid (SPEC §7). The coordinator fixes what
needs review, with the source image beside the grid, and approves what is right.

## Hierarchy
1. **Filters row** (Rippling Timesheets top): pay period, client, status, confidence, and a search for
   one worker.
2. **Hours summary** (Rippling "Hours summary", expandable): totals for the filtered period —
   regular, overtime, double time, total, needs review.
3. **View bar** (Airtable): row height (short / medium / tall / extra tall), hide fields (modal with
   toggles, hide all / show all, find a field), filter, group, sort, search.
4. **Field header row** (Airtable): click a field name → dropdown including "hide field"; drag edge
   to resize; drag header to reorder. The first (primary) field — worker — cannot be hidden.
5. **Rows** — one per time entry (Rippling day view: one row per day's time entry):
   - checkbox left of the first cell (Airtable);
   - expand icon beside the row number on hover (Airtable) → opens the side panel;
   - columns (Rippling day-view content mapped to SPEC §4): Worker · Client · Date · In · Out ·
     Break · Minutes (shown as hours:minutes) · Confidence · Status · Source;
   - status-and-actions at the far right (Rippling): approve (check), reject (X).
6. **"+" at the bottom-left** to add an entry manually (Airtable).
7. **Summary bar at the bottom** (Airtable): per-column summary; defaults to Sum for numeric
   fields; click a field's summary to choose a function; with a range selected it summarises only
   the selection; grouped views show per-group summaries and a total.
8. **Side panel** (Airtable expanded record, opened with Space or the expand icon): the entry's
   fields, and on the right an activity section (All activity / Comments / Revision history). For
   Granite the panel also shows the source document image (Rossum validation screen):
   - zoom in, zoom out and reset zoom above the image;
   - a box around every value read from it, in one of three states (Rossum): read but not yet
     reviewed · checked by a person · stops confirmation (shadcn theme tokens, destructive for the
     last);
   - hovering a box names the field it fills; clicking a value on the image selects its cell in
     the grid (Rossum: clicking a value jumps to its field).
9. **Bulk action bar** (Rippling: "bottom center of your screen" when rows are checked): Approve /
   Reject. Granite rule: bulk approve applies only to high-confidence rows (SPEC §7); other
   selected rows are left unchanged and counted in the bar.

## Interactions
Keyboard (Airtable; Cmd on Mac = Ctrl on Windows):
- Arrow keys move between cells. Enter (or F2) edits the selected cell; Esc leaves the cell.
- Space expands the active record (side panel); Esc returns to the grid.
- Shift+Space expands the active cell.
- Shift+arrows / Shift+click select a range; Cmd+arrows jump to the table edge.
- Cmd+C / Cmd+X / Cmd+V copy, cut, paste (pasting into a range fills every selected cell).
- Shift+Enter inserts an entry below.
- Cmd+Z undo; Cmd+Shift+Z or Cmd+Y redo.
- Cmd+F find (Esc closes). Cmd+Shift+F filter menu, Cmd+Shift+D group menu, Cmd+Shift+S sort menu.
- In the side panel: Cmd+Shift+< / > previous / next entry; Esc closes.
- Cmd+/ shows the shortcut list.
- Enter on a reviewed cell moves to the next value still awaiting review (Rossum).
Mouse:
- Click a Start/End cell to edit it inline (Rippling).
- Right-click a row: insert above/below, duplicate, delete (Airtable).
Editing an entry (Restaurant365 Punch Edits, researched 2026-10-15):
- The row's edit control (or Enter on the row) makes that row's values editable in place: worker
  (roster choice), date, in, out, break. Times are typed in place.
- A **reason is required before saving**: a list of preset reasons, more than one may be chosen
  (Restaurant365: "required selections made when adding or editing a punch"). Granite's preset
  reasons: corrected a misread value · confirmed with the client · confirmed with the worker ·
  matched to the right worker · other. Saving is the row's checkmark; each row is saved on its own
  (no group edit); cancel leaves the row unchanged.
- Edited rows carry a marker next to the changed value (Restaurant365: "a blue marker … next to
  punches that have been edited"; Granite uses the theme's primary token, not blue).
- The side panel shows the entry's audit log in time order: who, which fields changed from what to
  what, the reasons, and when (Restaurant365 Punch Edit Audit Log).
Rules from the SPEC that apply to every interaction above:
- Every edit asks for a reason and writes an audit event (SPEC §7).
- Values never silently change status: an edited `needs_review` cell becomes `reviewed`.

## States
- Entry status (SPEC §4): extracted · needs review · reviewed · client approved · disputed · locked.
- Approval (Rippling): pending · approved · rejected. A rejected entry does not flow to payroll.
- Dates outside the period are not editable (Rippling greys out inactive periods).
- Alerts column / marker (Rippling): comments and warnings per entry.
- Hours whose worker is assigned that day only at another client than the timesheet's, or whose
  timesheet's client is unclear: held, naming that client (several: each, in name order). Editing
  the row offers "Attach to {client}" for each named client, with the same required reason as Save;
  the history keeps both clients. A Granite rule (slice (b) plan, decision B5), not from the
  references: a timesheet's hours never move to another client's bill by themselves.

## Not known from the references (settled, owner 2026-10-17: build everything)
- Order of the view-bar buttons: Airtable's toolbar as its help articles show it — Hide fields,
  (Filter), Group, Sort, Row height — with the filters kept in Rippling's filters row above; undo,
  redo and the shortcut list at the bar's right end.
- Delete/Backspace does not clear a cell, and Home/End are not bound: neither reference documents
  them, and clearing a payroll value without a reason would skip the required reason.
- Empty state: `_components/empty-state.md`; loading: the converter's loading panel.
- The view (row height, hidden fields, order, widths, group, sort, summaries) is the person's own,
  kept in this browser — Airtable keeps a personal view; Granite does not store it on the server.
- "Insert above / below" opens the add-entry row for the same worker and day: entries are hours,
  not ordered rows, so where one is inserted is not kept. "Delete" is the row's Reject (an entry is
  never deleted; SPEC §19).
- Paste and undo are edits like any other: one reason for the whole paste, each entry saved and
  audited on its own; undo and redo replay the change with the edit's reasons and a note saying so.

## Never copy
Logos, product names, icons, illustrations, wording or colors from Airtable or Rippling.

Deviations allowed: none
