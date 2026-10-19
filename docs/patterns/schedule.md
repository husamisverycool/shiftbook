# Pattern: Schedule (`/schedule`)

Status: adopted — slice u (2026-10-17, SPEC §27 item 7)
Reference product and screen: When I Work — Scheduler (grid by users, positions or job sites; the
OpenShifts row; per-day shift and hour counters; the shift dialog's "assign to" with an open option,
how many, the eligibility list); Deputy — Schedule (Publish button with a count; the three-step publish
dialog: what changed, which areas, how to notify; the bottom status bar of clickable counts that jump
to the next matching shift; the confirmation lifecycle)
Source URL: https://help.wheniwork.com/articles/using-the-scheduler-computer/
Source URL: https://help.wheniwork.com/articles/creating-openshifts-computer/
Source URL: https://help.deputy.com/hc/en-au/articles/4688801660175-Schedule-filtering-and-management
Source URL: https://help.deputy.com/hc/en-au/articles/4688731978639-Creating-shifts-on-your-schedule
Source URL: https://help.deputy.com/hc/en-au/articles/360000985936-Shift-confirmation
Researched: 2026-10-17 (`docs/research/scheduling-slice-u.md` §§1–5, "Recommended hierarchy").
Confidence: high for the written callouts; screenshots were not inspected (no colors or icons copied).

## Purpose in Tabulado
The week's shifts for each job order: who works when, which shifts are still open, which are
published and which the worker has confirmed. A confirmed shift attaches to the worker's assignment on
that job order; hours still come only from timesheets (SPEC §6) — a schedule never makes a time entry.

## Hierarchy
1. **Page header** (`_components/page-header.md`): title; on the right the client filter (all clients
   or one; Deputy location selector), the week (previous, next, This week; Deputy date selector), the
   grouping switch — by worker, by job order, by worksite (When I Work's "as" switch) — and the
   **Publish** button carrying the count of unpublished changes (When I Work Publish & Notify; Deputy).
2. **Grid** (When I Work): the first column names the row; seven day columns, each headed by the date
   and its counters — shifts and hours (When I Work per-day counters).
   - The first row is **Open shifts** (When I Work users view), then one row per worker, job order or
     worksite, each with its shift count (When I Work position view).
   - A shift is a chip: its time, and the job order or worker (whichever the row does not say).
     Unpublished shifts are drawn dashed and say "Unpublished" in words — a pattern, not a colour
     (When I Work's stripes idea). Awaiting confirmation, confirmed, declined (an open shift with a
     warning) and no-show each carry a word, not only a mark (Deputy lifecycle).
   - An empty cell shows "+" on hover or focus to add a shift there (Deputy "+").
3. **Status bar** at the bottom (Deputy): clickable counts — Open, Unpublished, Awaiting confirmation,
   Warnings (declined; overlapping). Each click opens the next matching shift.
4. **Shift dialog** (When I Work shift details; Deputy): job order (which sets client and worksite),
   date, start, end, unpaid break, assign to (a worker or **Open**), how many copies (When I Work "how
   many"), require confirmation. Under "assign to", the eligible workers first — those placed on that
   job order, then those placed in the same position — with a warning when the worker already has an
   overlapping shift (When I Work Scheduling Concerns). For an open published shift, the offers and
   their answers in the order they came (When I Work requests list). Actions: Save, Delete, and for an
   assigned shift that has started, Mark no-show (with an open replacement when it has not ended).
5. **Publish dialog** (Deputy, three steps): (1) what — only the changes, or every shift in view;
   (2) which clients; (3) how to notify — notify and require confirmation, notify only, or mark
   published without notifying; an optional message. Publishing offers each open shift to its eligible
   workers (Deputy "send offers").

## Interactions
- Tab through chips; Enter opens a chip; "G then S" opens the page (`_layouts/app.md`).
- A worker's answer: accepting an offer takes the shift (first accepted wins; the other offers are
  withdrawn); declining an assigned shift empties it with a warning (Deputy); no answer by the deadline
  (16 hours before the start, Instawork's confirm window; published later than that, by the start) returns
  it to open (Deputy expiry). A shift that has already started is published without asking.
- Confirming places the worker on the job order (an assignment from that date, at the job order's
  rates) when they are not already placed.

- **Publish tells the workers** (integration, SPEC §27): unless "Don't notify" is chosen, each worker on
  a published shift or offered one gets a message in the worker app's thread in their own language
  (with the scheduler's note, when written) and, when live, a text message with a link to Shifts.
- ⌘K's "Publish the schedule" opens this page with the publish dialog already open.

## States
- **No job orders:** the empty state (`_components/empty-state.md`) points to Job orders.
- **No shifts this week:** the grid stays, with its Open row and "+" in each cell.
- **Loading:** the page outline in the list shape (`_components/loading.md`).
- **A failure:** `_components/error.md`.
- **A role that cannot change placements:** the grid reads only; no Publish, no "+".

## Never copy
When I Work's or Deputy's wording, colors, icons or logos.

## Colour (decision 0046)

Worker rows lead with the worker's avatar; job-order and worksite rows show the client's colour dot before the client; each shift chip shows its client's dot before the time (`_components/avatar.md`, `_components/color.md`).

Deviations allowed: none
