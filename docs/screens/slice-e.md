# Slice (e) screens compared with their pattern files

Captured 2026-10-16 in demo mode (English, 1440×900, full page; Spanish copies start with `es-`).
✓ = matches the pattern file.

## Exceptions — `docs/patterns/convert.md` step 3 (Gusto blocker list, TempWorks proofing, Rise People and Staffology warnings)
Screens: `slice-e/e03-exceptions-blocked.png`, `slice-e/e04-exceptions-clear.png`,
`slice-e/e11-exceptions-correction.png`, `slice-e/e15-exceptions-nothing-to-correct.png`,
`slice-e/e17-exceptions-decision-needed.png`, `slice-e/e19-exceptions-decided.png`, `es-e03`, `es-e11`.
- ✓ The step trail now has five steps: Upload timesheets › Review hours › Exceptions › Review totals ›
  Files.
- ✓ A summary alert first: the count of blocking problems (error), or "No blocking problems".
- ✓ H2 "Blocking", one row per kind of problem: title, the people or entries, the count, and the Fix
  at the right (Open Client approvals; skip the workers; record a decision; discard a correction with
  nothing to correct; back to Review hours or Upload).
- ✓ H2 "Warnings", the same rows without a fix; they never stop the run (Rise, Staffology).
- ✓ The forward action "Review totals" is disabled while anything blocks (Gusto, TempWorks); Review
  totals opened by its address while blocked comes back here (browser test).
- ✓ Coming back to the step checks again (TempWorks "Refresh"): after the client approves, the block
  is gone (`e04`).
- Differences: in a correction, a worker's row shows "Record decision" under the worker's line rather
  than at the row's right, because each worker needs their own decision (as "Both are real" does for
  each duplicate day). Recorded decisions are listed in an info alert under Warnings (`e19`).

## Review totals — `docs/patterns/convert.md` step 4 (Gusto review step; Check approve and reopen; Rise unapprove until posted)
Screens: `slice-e/e05-totals-to-approve.png`, `slice-e/e06-totals-approved.png`,
`slice-e/e07-unapprove-dialog.png`, `slice-e/e12-totals-correction-pay.png`,
`slice-e/e13-totals-correction-billing.png`, `es-e05` to `es-e07`, `es-e12`, `es-e13`.
- ✓ Edit (secondary) and the forward action (primary) in the heading row: **Approve** (Owner only);
  once approved, an "Approved by … on …" success alert with **Unapprove**, and the forward action
  becomes "Create files".
- ✓ Unapprove asks for a reason in a dialog (Rise: "unapprove until posted"; Check: reopen).
- ✓ Warnings shown again as alerts with a dismiss (×), acknowledged by approving; a line says how many
  warnings approving acknowledges.
- ✓ H2 "Summary", one row of figures; tabs Hours worked · Pay · Billing, each a table with a totals
  footer.
- ✓ A correction's review shows was / now / difference per worker (Pay) and per client (Billing); the
  Summary row shows the differences with their sign.
- Differences: none.

## Files — `docs/patterns/convert.md` step 5 (Gusto receipt; Check corrections as new units; Stripe older versions) with `exports.md` sections
Screens: `slice-e/e08-files-one-version.png`, `slice-e/e09-start-correction.png`,
`slice-e/e14-files-two-versions.png`, `slice-e/e20-files-three-versions.png`, `es-e08`, `es-e09`, `es-e14`.
- ✓ A success alert, then H2 "Versions" with **Start a correction** (Owner, a required reason) at
  the upper right; the versions newest first, each titled with its number, "Original" or
  "Correction" and its reason.
- ✓ Each version's sections as before (`exports.md`): the payroll file with its control totals and
  Download at the upper right, its notes, then the invoices table.
- ✓ A correction's payroll file carries only the differences and says so in its notes; when nothing
  is added to anyone's pay the version says "No payroll file" (`e20`, version 3).
- ✓ A correction's invoices: a supplemental invoice (Bullhorn rebill: the original number with a
  suffix) or a credit note (Stripe: `-CN-01`), each badged and naming the invoice it corrects.
- ✓ Decisions recorded for workers are listed under "Settled outside the payroll file".
- Differences: a credit note's Due column shows "—" (a credit note is not due).

## Correction documents — `docs/patterns/_documents/invoice.md` (Stripe invoice and credit notes; Bullhorn rebill numbering)
Screens: `slice-e/e22-credit-note-1.png`, `slice-e/e23-supplemental-1.png`.
- ✓ Same hierarchy as the invoice. Supplemental invoice: title, number `PLM-20261005-S1`, a field
  naming the invoice it adds to, the difference lines with "was … h, now … h" under each description,
  totals and amount due.
- ✓ Credit note: title, credit note number `PLM-20261005-CN-01`, no due date, a field naming the
  invoice it credits, "$79.50 credited to invoice PLM-20261005", lines with their minus sign, and
  "Total credited".
- Differences: none.

## Client approvals, approval required — `docs/patterns/approvals.md` (Stripe invoices row ⋯ menu; TempWorks per-client approval)
Screens: `slice-e/e01-row-menu.png`, `slice-e/e02-approvals-required.png`, `es-e01`, `es-e02`.
- ✓ The row's ⋯ menu holds "Approval required before payroll" as a checkbox item (Stripe row menu);
  a client that requires approval shows a badge in its row.
- Differences: none.

## Pay periods — `docs/patterns/convert.md` landing (Gusto payroll list)
Screen: `slice-e/e21-landing.png`.
- ✓ Statuses now include "Ready to approve", "Approved" and "Correction in progress".
