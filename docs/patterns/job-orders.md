# Pattern: Job orders list (`/job-orders`)

Status: adopted — slice (b) plan, decision B1 (2026-10-15)
Reference product and screen: Linear — issue list (primary: view header, filters, display options,
grouping, selection, keyboard, create modal); Attio — record preview (the side panel's contents and
navigation, which Linear does not document for peek); Notion — side peek (confirms the side panel
keeps the list usable)
Source URL: https://linear.app/docs/display-options
Source URL: https://linear.app/docs/filters
Source URL: https://linear.app/docs/custom-views
Source URL: https://linear.app/docs/select-issues
Source URL: https://linear.app/docs/creating-issues
Source URL: https://linear.app/docs/issue-templates
Source URL: https://linear.app/changelog/2019-09-23-improved-peek
Source URL: https://attio.com/help/reference/managing-your-data/records/create-and-view-records
Source URL: https://www.notion.com/help/views-filters-and-sorts
Researched: 2026-10-15. Confidence: high for Linear's list mechanics and shortcuts; medium for the
side panel (Attio documents its contents; Linear documents only the Space key).

## Purpose in Granite
Every job order of the agency (SPEC §4, §8): what position, at which client and worksite, how many
workers, the rate in force today. Open one to see its details, assignments and rate card.

## Hierarchy
1. **View header:** the view's name ("Job orders"); on the right a filter control, the display
   options button, and the create button (Linear). The title is set as every page's title
   (`_components/page-header.md`, decision 0029).
2. **Filter bar** (only when filters are applied): each filter as a chip; filters are written to the
   URL so the link shares the filtered view (Linear).
3. **Group headers** when grouped (default: by client), sticky while scrolling, each with a count
   and a collapse toggle at its left edge: full-width tinted bands, the rows running edge to edge
   under them with hairline dividers and no box around the list (Linear's list view screenshot,
   https://linear.app/docs/filters).
4. **Rows:** the properties chosen in display options. Granite's properties: position, client,
   worksite (city, state), shift, headcount (assigned / wanted), pay rate in force today, bill rate
   in force today, prevailing-wage flag. A checkbox appears at the left edge on hover (Linear).
5. **Bulk action bar** at the bottom when rows are selected (Linear).
6. **Side panel** on the right when a row is previewed (Attio record preview; Notion side peek): the
   list stays usable and the previewed row stays highlighted. Panel header: "N of M" in this view,
   previous and next arrows, an expand control to the job order's page, and close. Body: the key
   fields (Attio "Highlights") and the most recent activity with a link to all of it.

## Interactions
- ↑/↓ or J/K highlight a row; hover also highlights; nothing is selected on open (Linear).
- Space opens the side panel for the highlighted row and closes it again (Linear peek); in the panel,
  previous/next move through the view (Attio). Enter or the expand control opens the job order page.
- X selects the highlighted row; Shift+click or Shift+↑/↓ extends; Cmd/Ctrl+A selects all
  (after filtering); Esc clears (Linear).
- F opens the filter menu: client, worksite state, prevailing wage, has open headcount; operators
  "is / is not / is any of" (Linear).
- Shift+V opens display options: grouping (none, client, worksite state), ordering (position,
  client, created), visible properties; personal by default (Linear).
- C opens the create modal: client, worksite (only that client's), position, SOC code, shift,
  headcount, pay range, prevailing wage. Esc with changes asks to keep or discard (Linear drafts —
  Granite keeps the draft in the browser only).
- Bulk bar: in this slice only "Clear selection" (Linear's bulk actions that change issues have no
  job-order equivalent yet).

## States
- Empty (no job orders): the empty-state component (`_components/empty-state.md`): what a job
  order is for, and the create button.
- No results for the filters: the empty-state component with a clear-filters link (Linear does not
  document this state — difference listed).
- Loading: the list skeleton; error: an error alert with "Try again" (as the converter).

## Not known from the references (ask the owner before building)
- Saved views (Linear Alt+V) — not in this slice.

## Never copy
Linear's, Attio's or Notion's wording, icons, colors or logos.

## Look (Linear's list view, from its own screenshot at https://linear.app/docs/filters)
Each row is one line, as Linear's rows are: the position and shift, then its worksite in muted type; the properties at the
row's right as small rounded chips (Linear's label and project chips), each saying what it is when the
value alone does not ("Pay $17.00", "Bill $25.00"); dates as plain muted text, short ("Aug 3, 2026"). A
property the group's band already names is not repeated in its rows.

## Loading and errors (slice o)
- Loading: the page's outline in the list shape (`_components/loading.md`); buttons that start
  work show a spinner in place of their icon (Primer Button `loading`).
- A failure: the frame stays; the failed content's place says so with "Try again"
  (`_components/error.md`).

Deviations allowed: none
