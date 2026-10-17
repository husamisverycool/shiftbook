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

Slice (e) additions (research: `docs/research/weekly-run-slice-e.md`):
Source URL: https://github.com/Gusto/embedded-react-sdk/blob/main/src/components/Payroll/PayrollBlocker/components/PayrollBlockerList.tsx
Source URL: https://docs.gusto.com/embedded-payroll/docs/payroll-statuses
Source URL: https://docs.checkhq.com/docs/payroll-preview-and-approval
Source URL: https://docs.checkhq.com/reference/reopen-payroll
Source URL: https://docs.checkhq.com/docs/correcting-pay-history
Source URL: https://kb.tempworks.com/help/proofing-time-entry-sessions
Source URL: https://support.risepeople.com/portal/kb/articles/how-to-finish-approve-a-pay-run
Source URL: https://help.staffology.co.uk/payroll/payrun/step-by-step/step-9-warnings.htm
Source URL: https://help.powerpay.ca/en/pphelp/Content/Procedures/PayrollPreviewDashboard.htm
Source URL: https://docs.stripe.com/invoicing/dashboard/credit-notes
Source URL: https://help.workyard.com/en/articles/15467712-how-to-map-pay-types-for-quickbooks-online-payroll-exports
Source URL: https://support.clicktime.com/hc/en-us/articles/41018977335565-Export-Payroll-Data-to-ADP
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/settingRebillInvoiceNumber.htm
Source URL: https://support.gusto.com/article/250220135301667/Custom-earnings-types-for-admins
Source URL: https://support.gusto.com/article/999946501000000/Run-a-bonus-payroll

## Purpose in Granite
The smallest end-to-end product: take last week's timesheets for one period, read them, let a
person fix what needs review, and hand back the payroll file and one client invoice.

## Hierarchy
**Landing (Gusto payroll list):** a page heading, then a table of pay periods — period · client ·
status — with the row's action (start, or continue a saved run) at the row's end. Last week's
period is the first row. Opening the page makes this week's and last week's periods when they do not
exist yet (completeness audit G1); **Start a pay period** at the heading's right opens a small dialog
with a date — the earlier week that contains it is added (a week paid late, or before Granite). Until
the pay week's day is set, the page says so with a link to Settings › Payroll file.

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
   need review (SPEC §24 step 3), with the source panel. Forward action: "Check exceptions" (the
   rules are computed on the way: SPEC "rules computed").
3. **Exceptions** (Gusto blocker list; TempWorks proofing "check for errors"; Rise People and
   Staffology warnings):
   - A summary alert first: the count of blocking problems (error), or that none were found.
   - H2 "Blocking", then one row per kind of problem: title (the kind) and description (the people
     or entries, the count), and the row's action at the right — the Fix that applies (back to
     Review hours, skip the workers for this run with a reason, both are real, open Client
     approvals, open the payroll file settings on the missing worker ids — Workyard maps missing
     pay types inside the export and ClickTime names the missing ids (`settings/payroll.md`) —
     open the client's invoice settings when an invoice cannot be made as they say (a PO the client
     requires, its VMS upload; Bullhorn One blocks invoicing on the client's Invoice Terms;
     `clients/[id].md`), back to Upload).
   - H2 "Warnings", the same rows without blocking (they never stop the run; Rise: "warnings do not
     block approval").
   - Under it, "Scheduled, no hours yet" (slice u; Deputy's attendance: a scheduled shift with no
     time in): each confirmed shift in the period with no hours for that worker, day and client — a
     list, never blocking; the schedule never makes hours (SPEC §6).
   - Forward action "Review totals", disabled while any blocking row remains (Gusto: calculate is
     disabled while blockers exist; TempWorks: all errors resolved to continue). Coming back here
     checks again (TempWorks "Refresh").
4. **Review totals** (Gusto review step):
   - Actions at the right of the heading row: **Edit** (secondary; back to step 2) and the forward
     action (primary: **Approve** — Owner only; Gusto Submit, Check approve). Once approved, an
     "approved by … on …" success alert with **Unapprove** (a reason; Rise "unapprove until
     posted", Check "reopen"), and the forward action becomes "Create files".
   - Warnings shown again as alerts (acknowledged by approving).
   - H2 "Summary", then a one-row table of the run's figures: workers · regular hours · overtime
     hours · gross pay · billed amount.
   - Tabs, each a table with a **totals footer row**, 25 rows per page:
     hours worked (worker · regular · overtime · double time · total), pay (worker · gross pay),
     billing (client · hours · billed amount).
5. **Files** (Gusto receipt step; sections from `exports.md`) — a success alert, then one section
   per file (payroll file, invoice), each with its control totals and Download at its upper right.
   - **Versions** (Check: a paid payroll is immutable, a correction is a new unit; Stripe "older
     versions"): the period's versions listed newest first, each with its files. **Start a
     correction** (Owner, a required reason) opens the period again as the next version.
   - A correction version's files: the payroll file with only the differences, and per client a
     supplemental invoice (Bullhorn rebill: the original number with a suffix) or a credit note
     (Stripe: the original number with `-CN-` and a count), each naming the original.
   - A correction's Review totals shows was / now / difference per worker and per client.
   - **Additional pay** (slice G2; Gusto's run-payroll additional earnings and its custom earnings
     types, which classify a bonus as included in or excluded from overtime; Rippling one-time
     payments): an H2 with **Add pay** at its right (the hours ability; hidden when the period is
     locked), then a table of what was entered for the period — worker · what (missed meal period,
     missed rest period, sent and not used / short day, holiday not worked, bonus) · day or
     workweek · amount (bonuses) · reason — each row with a "…" menu to **Remove** (a reason).
     **Add pay** opens a dialog: worker, then the assignment, then the kind, then the fields that
     kind needs (the day; the scheduled hours and "placed elsewhere the same shift" for a short day;
     the workweek, amount and "nondiscretionary / flat sum" for a bonus), and a required reason. The
     engine computes the pay; the totals refresh. An empty table is one muted row.

## Interactions
- **Timesheets by email (decision 0042; Expensify's receipts address beside its upload):** under the
  drop zone, for those who upload, one muted line "Or email timesheets to this address:" with the
  agency's forwarding address in a code chip and a copy button. Emailed files appear in the list as
  uploads do. Hidden when the address is not set up.
- **Demo only (decision 0031):** under the drop zone, while nothing is uploaded, "Trying the demo? Use the sample timesheets" puts the demo's sample folder into the same upload as dropped files (the download in the banner stays).
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
Run states (Gusto: editable → calculated → submitting → processed; Check: draft → preview →
approved): Granite PayRun `draft` → `ready` / `blocked` → `approved` → `exported` (SPEC §4). A
change after approval returns the run to `ready`/`blocked` (Gusto: preparing again cancels the
calculations; Check: a change resets the preview). A correction is the next version of the same
period, through the same steps. Loading panels while reading files, computing totals and
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

## Look (decision 0029, from the products' own screenshots)
The pay periods as Stripe's lists show them: full width, small-capital headers, the period's state as a tinted badge.

Deviations allowed: none
