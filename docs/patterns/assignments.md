# Pattern: Assignments list (`/assignments`)

Status: adopted — slice (b) plan (2026-10-15)
Reference product and screen: Linear — issue list (same mechanics as `job-orders.md`); Attio — views
that show, filter and sort by fields of the linked record; Attio — record preview for the side panel
Source URL: https://linear.app/docs/display-options
Source URL: https://linear.app/docs/filters
Source URL: https://linear.app/docs/select-issues
Source URL: https://attio.com/help/reference/managing-your-data/views/create-and-manage-table-views
Source URL: https://attio.com/help/reference/managing-your-data/records/create-and-view-records
Source URL: https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/purchaseOrderNumbers.htm
Source URL: https://kb.bullhorn.com/backoffice/Content/backoffice/Topics/usingVariablesBillingContacts.htm
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/bh1CanvasUserScorecardReport.htm
Researched: 2026-10-15. Confidence: high (same mechanics as the job orders list).

## Purpose in Shiftbook
Every assignment — the spine (SPEC §4): which worker is placed on which job order, from when to when,
and whether it is active. Also the entry point to importing placements.

## Hierarchy
1. **View header:** "Assignments"; on the right the filter control, display options, Import, and
   the create button (Linear).
2. **Filter bar** when filters apply (in the URL).
3. **Group headers** (default: by status — active, ended, cancelled), sticky, with counts.
4. **Rows:** worker, client and position (fields of the linked job order, as Attio views show linked
   records' fields), start, end, rates (job order's or "own rates"), status.
5. **Bulk action bar** when rows are selected: End assignments (asks for one end date).
6. **Side panel** (Attio preview): "N of M", previous/next, expand (to the job order page, Assignments
   tab), close; body: the assignment's fields, its rate in force today and recent activity.
   Slice g (decision G4): the client's **PO** for this placement (Bullhorn Back Office: a PO on each
   placement, or "same as billing contact"), a field whose hint says that left empty the client's
   own PO is used.
   Slice i (decision I10): the **Recruiter** — one of the agency's users, or none — whose placements
   the margin groups by (Bullhorn User Scorecard: gross profit by recruiter).

## Interactions
- As in `job-orders.md`: J/K or arrows, Space for the side panel, X/Shift/Cmd+A selection, Esc, F
  filters (client, worker, status, starts/ends between), Shift+V display options, C to create.
- Create: worker (roster search, never creates a worker), job order, start, optional end.
- Import → `/assignments/import`.
- The PO saves when its field is left or Enter is pressed, as the worker ids do
  (`settings/payroll.md`); a PO the rule refuses shows the rule under the field.
- The recruiter saves when chosen; the accountant sees it read only.

## States
- Empty: empty-state component with links to create or import.
- No results for the filters: empty-state component with clear-filters.
- Loading skeleton; error alert with "Try again".

## Never copy
Linear's or Attio's wording, icons, colors or logos.

Deviations allowed: none
