# Pattern: One-page converter (`/convert`) — slice (a)

Status: approved — steps shown one at a time, in Gusto's sequence (decision D2); frame re-sourced
from Gusto's published payroll-run code (2026-10-15)
Reference product and screen (page frame): Gusto — run payroll flow, as published in Gusto's open
source embedded payroll UI ("PayrollExecutionFlow": hours step → review step → receipts)
Source URL: https://github.com/Gusto/embedded-react-sdk (commit 4a148f81, 2026-10-15; files named below)
Source URL: https://sdk.gusto.com/docs/reference/payroll/payroll-execution-flow
Source URL: https://sdk.gusto.com/docs/reference/payroll/payroll-flow
Source URL: https://docs.gusto.com/embedded-payroll/docs/payroll-blockers
Files read in the repository (layout facts below come from these, not from screenshots):
- `src/components/Payroll/PayrollExecutionFlow/GUIDE.md` — the step flow and the one-way latch
- `src/components/Flow/FlowHeader.tsx`, `src/components/Common/UI/Breadcrumbs/Breadcrumbs.tsx` —
  the step trail
- `src/components/Payroll/PayrollList/PayrollListPresentation.tsx` — the landing list
- `src/components/Payroll/PayrollConfiguration/PayrollConfigurationPresentation.tsx` — hours step
- `src/components/Payroll/PayrollBlocker/components/PayrollBlockerAlerts.tsx` — blocker alerts
- `src/components/Payroll/PayrollOverview/PayrollOverviewPresentation.tsx` — review step
References used inside the steps (each has its own pattern file):
- Step 1 Upload → `inbox.md` (Dext "Add documents" → Processing → Inbox)
- Step 2 Review hours → `review.md` (Airtable grid) with the source panel from
  `documents/[documentId].md` (Rossum validation screen)
- Step 4 Files → `exports.md` (Stripe report sections) and `_documents/invoice.md` (Stripe PDF)
Researched: 2026-10-15. Confidence: HIGH for the frame, gating, blocker alerts and review layout
(read in Gusto's source); Gusto's own web app may differ in visual detail from its embedded UI.

## Purpose in Shiftbook
The smallest end-to-end product: take last week's timesheets for one period, read them, let a
person fix what needs review, and hand back the payroll file and one client invoice.

## Hierarchy
**Landing (Gusto payroll list):** a page heading, then a table of pay periods — period · client ·
status — with the row's action (start, or continue a saved run) at the row's end. Last week's
period is the first row.

**Every step (Gusto flow frame), top to bottom:**
1. **Header row:** the step trail on the left; **Save and exit** on the right (returns to the
   landing; the run is kept and the row's action becomes "continue").
   - The trail lists only the steps reached so far, ending with the current one. Earlier steps are
     links; the current step is plain text marked as the current step for screen readers.
   - In a narrow container the trail collapses to one back link naming the previous step.
2. **Page heading** with a supporting line naming the period, the dates in bold.
3. **The step's forward action** in the heading row, at the right on desktop; under the heading at
   full width on mobile.
4. **Alerts**, stacked (each: status, title, body, optional action, optional dismiss).
5. **The step's body.**

**Steps (step names from SPEC §11):**
1. **Upload timesheets** — body from `inbox.md`. Forward action: "Review hours".
2. **Review hours** (Gusto hours step) — blocker alerts above the body; then an H2 section heading
   with a one-line description; then the grid from `review.md`, filtered by default to entries that
   need review (SPEC §24 step 3), with the source panel. Forward action: "Review totals".
3. **Review totals** (Gusto review step):
   - Actions at the right of the heading row: **Edit** (secondary; back to step 2) and the forward
     action (primary: "Create files").
   - Alerts, then blockers (each an error alert; see Interactions).
   - H2 "Summary", then a one-row table of the run's figures: workers · regular hours · overtime
     hours · gross pay · billed amount.
   - Tabs, each a table with a **totals footer row**, 25 rows per page:
     hours worked (worker · regular · overtime · double time · total), pay (worker · gross pay),
     billing (client · hours · billed amount).
4. **Files** (Gusto receipt step; sections from `exports.md`) — a success alert, then one section
   per file (payroll file, invoice), each with its control totals and Download at its upper right.

## Interactions
- **Gating (Gusto hours step):** the forward action is disabled while any blocker exists, while
  files are still being read, and while totals are being computed. While computing, its label
  changes to the in-progress form and the body is replaced by a loading panel (title + one line
  saying it can take a minute).
- **Blockers (Gusto blocker alerts):**
  - One blocker → one error alert: title, description, help text, and a button to view it (it
    selects the entry in step 2).
  - Several → one error alert titled with the count, a bulleted list, and "view all", which opens
    the blocker list (a step-like view reached from step 2 and returning to it).
- **Warnings** are alerts with a dismiss (×) on the review step; blockers never have a dismiss.
- **Edit after totals** (Gusto): returns to step 2; totals are recomputed when moving forward again.
- **One-way latch** (Gusto: once submission starts, editing is hidden): once "Create files" has
  started, Edit and the earlier steps in the trail stop being links; the run stays on step 4.
- **Download** → the file goes straight to the device (Stripe, `exports.md`).

## States
Run states (Gusto: editable → calculated → submitting → processed): Shiftbook PayRun `draft` →
`ready` / `blocked` → `exported` (SPEC §4). Loading panels while reading files, computing totals and
creating files. A load failure shows an error alert with a retry action (Gusto "processing failed"
with recalculate).

## Decision D2
Gusto shows each step as its own screen, reached in sequence, with a trail of the steps reached so
far. Adopted: the same — one step visible at a time on `/convert`.
Owner decision 2026-10-15: "go and do what you think is best but the BIGGEST thing is to purely rely
on inspiration from great products NOT your own idea of what's best".

## Still not known from the references
- Gusto's visual styling (shadcn/ui defaults are used instead, never Gusto's look).
- Keyboard shortcuts for moving between steps (none documented; none built).

## Never copy
Logos, product names, icons, illustrations, wording or colors from Gusto or any reference.

Deviations allowed: none
