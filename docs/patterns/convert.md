# Pattern: One-page converter (`/convert`) — slice (a)

Status: approved — steps shown one at a time, in Gusto's sequence (decision D2)
Reference product and screen (page frame): Gusto — "Run payroll" flow (pay-period tile → hours
spreadsheet → review summary → confirmation with exports); Rippling — payroll run (secondary)
Source URL: https://support.gusto.com/article/999754831000000/run-a-regular-payroll-for-admins (to verify — Gusto's help center refused automated access; details below come from search excerpts)
Source URL: https://support.gusto.com/article/179037380821161/payroll-automations-for-admins (to verify)
Source URL: https://docs.gusto.com/embedded-payroll/docs/complete-a-regular-payroll
Source URL: https://docs.gusto.com/embedded-payroll/docs/payroll-blockers
Source URL: https://www.rippling.com/products/payroll
References used inside the steps (each has its own pattern file):
- Step 1 Upload → `inbox.md` (Expensify / Ramp; Dext proposed)
- Step 2 Review hours → `review.md` (Airtable grid / Rippling timesheets) with the source panel from
  `documents/[documentId].md` (Rossum / Dext)
- Step 4 Export and invoices → `exports.md` (Stripe reports) and `_documents/invoice.md` (Stripe PDF)
Researched: 2026-10-15. Confidence: LOW for Gusto's on-screen layout (not fetched); medium for its
step sequence and blocker model (Gusto Embedded docs, verified).

## Purpose in Shiftbook
The smallest end-to-end product: take last week's timesheets for one period, read them, let a
person fix what needs review, and hand back the payroll file and one client invoice.

## Hierarchy
Top to bottom, following Gusto's run sequence; step names come from SPEC §11:
1. **Period tile** (Gusto pay-period tile with deadline and payday): the period (last week by
   default), the client the invoice is for, and the action to start.
2. **Step 1 — Upload timesheets** (`inbox.md`): drop files; each file becomes a row that shows its
   reading state, then its result (entries found, entries needing review).
3. **Step 2 — Review hours** (Gusto: "a spreadsheet opens with synced hours", which you edit) —
   the grid from `review.md`, filtered by default to rows that need review (SPEC §24 step 3), with
   the source side panel.
4. **Step 3 — Review totals** (Gusto "Review summary"): flagged items listed **above** the
   details, each with Edit (jumps to the row in step 2) or Dismiss (only for warnings, never for
   blockers); then totals: workers, regular / overtime minutes, gross pay, billed amount.
   Blockers (Gusto Embedded "payroll blockers" are hard stops) prevent step 4.
5. **Step 4 — Export and invoices** (Gusto confirmation page offers "export payroll details"):
   the payroll file and the invoice PDF, each with Download and its control totals (`exports.md`).

## Interactions
- One step is visible at a time. Each step ends with a forward action naming the next step (Gusto:
  "Review summary" from the hours spreadsheet). A later step opens only when the earlier one is
  complete (Gusto: review before submit; blockers stop submission).
- Editing hours after totals were computed recalculates the totals (Gusto Embedded: editing a
  calculated payroll cancels the calculation and returns it to an editable state).
- Edit on a flagged item → scrolls to and selects that row in step 2.
- Download → file goes straight to the device (Stripe, `exports.md`).

## States
Run states (Gusto Embedded, verified): editable (unprocessed) → calculated (totals and blockers
shown) → done (files produced). Shiftbook maps these to PayRun `draft` → `ready` / `blocked` →
`exported` (SPEC §4).

## Decision D2
Gusto shows each step as its own screen, reached in sequence: the hours spreadsheet leads forward to
"review summary", the summary leads forward to submission, and Edit goes back to the hours. Adopted:
the same — one step visible at a time on `/convert`, a forward action at the end of each step that
names the next step, and Edit links that return to the step that owns the data.
Owner decision 2026-10-15: "go and do what you think is best but the BIGGEST thing is to purely rely on inspiration from great products NOT your own idea of what's best".

## Still not known from the references
- Gusto's on-screen details (whether a step indicator is shown, how errors look on rows) could not be
  verified; nothing is built for them until a source is found.

## Never copy
Logos, product names, icons, illustrations, wording or colors from Gusto, Rippling or any reference.

Deviations allowed: none
