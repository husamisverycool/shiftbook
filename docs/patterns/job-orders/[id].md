# Pattern: Job order page (`/job-orders/[id]`)

Status: adopted — slice (b) plan, decisions B1 and B2 (2026-10-15)
Reference product and screen: Attio — record page (details panel, relationship tabs, activity tab);
Bullhorn One — placement Rate Cards tab with versions; Gusto — compensation card (value in force now,
scheduled change notice, history newest first); Stripe — Prices (a used price is never edited: a new
one replaces it); Stripe refunds — reason picker where "Other" requires a note
Source URL: https://attio.com/help/reference/managing-your-data/records/create-and-view-records
Source URL: https://attio.com/help/reference/managing-your-data/attributes/relationship-attributes
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/ManagePlaceRateCardVers.htm
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/bh1CanvasYearlyCurrentGrossMarginByBranch.htm
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/EditPlacementRateCard.htm
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/AddPlaceRateCard.htm
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/DeletePlacementRateCard.htm
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/rateCardBestPractices.htm
Source URL: https://github.com/Gusto/embedded-react-sdk/blob/4a148f81ba75c93f6bb8d0cccd003d5e1904ee06/docs/test-fests/compensation-steady-state-sdk.md
Source URL: https://docs.stripe.com/products-prices/manage-prices
Source URL: https://docs.stripe.com/refunds
Source URL: https://linear.app/docs/parent-and-sub-issues
Researched: 2026-10-15. Confidence: high for Bullhorn's versions and rules, Gusto's card states and
Stripe's rule; medium for Attio's exact tab order.

## Purpose in Granite
One job order: its details, the workers assigned to it, and its rate card over time (SPEC §8: full
create/edit with effective dating; rate changes never rewrite locked periods).

## Hierarchy
1. **Header:** position as the title, client · worksite under it, action buttons under the name
   (Attio): Edit, Assign worker.
2. **Details panel** on the left (Attio "Record Details"): client, worksite (address, county, city),
   SOC code, shift, headcount, pay range, prevailing wage, branch (slice i, decision I10: the office
   whose margin the order counts in; Bullhorn's gross margin by branch takes the job owner's
   branch), created.
3. **Tabs** on the right (Attio): Overview · Assignments · Rate card · Activity.
   - **Overview:** the rate card summary (Gusto card) and the assignments summary (count, next end).
   - **Assignments** (Attio relationship tab): the linked assignments as a list — worker, start, end,
     status — with "Assign worker" (search the roster; never create a worker) and, on selection, a
     toolbar with "End assignment" and "Cancel assignment".
   - **Rate card** (Bullhorn Rate Cards tab + Gusto card):
     1. An "Effective on" selector choosing which version is shown; the version in force today is
        selected by default (Bullhorn).
     2. The version's values: pay rate, bill rate (and markup if entered as markup), overtime and
        double-time bill multipliers, WC class code, effective from and to (Gusto shows "effective
        date" as when the current rate took effect).
     3. Above the values, when a later version is scheduled: a notice with its date, what changes,
        and a cancel control (Gusto scheduled-change notice); with two or more, one notice with
        "Review" opening the list (Gusto).
     4. Controls: Add rate card (none yet), New version (copies the shown version), Edit and Delete
        only on a version no paid week used (Bullhorn edit vs. new version; Stripe used-price rule).
     5. History: every version as a table — effective from, to, pay, bill, multipliers — newest
        first (Gusto history).
   - **Activity** (Attio activity tab; Linear activity feed): every change with who, when, and the
     reason when one was required, newest first.
4. When the job order belongs to an assignment-specific card: the assignment row shows "Own rates"
   and opens the same rate card view for that assignment (Bullhorn: rates live on the placement).

## Interactions
- Edit opens the job-order form (same fields as create, with the branch); Save audits the change.
- New version: the form is filled from the shown version except the effective date, which is blank
  on purpose and required (Gusto); it must start after the last paid day; saving ends the previous
  version the day before (Bullhorn) — or, for a start after today, schedules it (Gusto notice).
- Edit a version (only unused by any paid week): requires a reason from a short list — wrong from the
  start, client agreed new rate, data entry fix, other — and "Other" requires a note (Stripe).
- Delete a version: only never used by a paid week, and not the earliest while later ones exist
  (Bullhorn); confirmation dialog (Gusto delete confirmation).
- Assign worker: search the roster, pick start and optional end date; refused with the reason when
  dates overlap the worker's other assignment on this job order. The form reopens for the next
  worker after saving (Linear sub-issue editor), Esc leaves.
- End assignment: pick the end date (not before a paid entry's date). Cancel assignment: only with
  no paid entries; asks for a reason.
- The tab is in the URL (`?tab=rates`), so links open the right tab.

## States
- No rate card: the Rate card tab shows the empty-state component with "Add rate card"; the converter
  holds that job order's hours as a blocker (Bullhorn: no version covering the date fails pay/bill).
- Version touching a paid week: Edit and Delete are not shown; a line says why.
- Loading skeleton; error alert with "Try again"; not found → the 404 page.

## Not known from the references (ask the owner before building)
- Bullhorn's change requests with an approver — not in this slice.

## Never copy
Wording, icons, colors or logos of Attio, Bullhorn, Gusto, Stripe or Linear.

## Look (decision 0029, from the products' own screenshots)
Laid out as `_components/record-page.md`: "Job orders" above the title; the tabs and their content on the left; Details on the right. The overview's rates and workers are modules with plain figures (pay rate, bill rate since their date; workers on it of those wanted) and a button to the tab that holds them.

## Loading and errors (slice o)
- Loading: the page's outline in the record shape (`_components/loading.md`); buttons that start
  work show a spinner in place of their icon (Primer Button `loading`).
- A failure: the frame stays; the failed content's place says so with "Try again"
  (`_components/error.md`).

Deviations allowed: none
