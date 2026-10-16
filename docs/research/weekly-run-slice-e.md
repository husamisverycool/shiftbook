# Research notes: weekly run, approval and corrections (slice e)

Research subagent, 2026-10-16, kept as written.

Researched 2026-10-16. Method: I fetched official docs directly where I could. Where a page blocked fetching, I say so and lower the confidence.
- **Not fetchable:** Gusto's help center (`support.gusto.com`, HTTP 403), Rippling's help center, ADP's current help, `leginfo.legislature.ca.gov` (403), `ilga.gov` (503 and TLS errors), and the `dol.gov` opinion-letter PDFs (403).
- **Gusto substitute:** Gusto's *publicly documented* Embedded Payroll docs (`docs.gusto.com`) and Gusto's open-source React SDK (`github.com/Gusto/embedded-react-sdk`, commit 57df1ed, 2026-10-15). The SDK renders Gusto's own run-payroll flow, so I used it in place of the help center. I quote its wording below only to identify screens and states. Do not copy any of it into Shiftbook.

---

## 1. Run flow screens

### Primary reference for the stepped flow: Gusto "Run payroll" (via the Embedded docs and SDK). Confidence: high.

**Lifecycle.** Prepare/update, then calculate, then review, then submit.
- After calculation the payroll carries `totals` and any `submission_blockers`.
- Editing again ("prepare") "will cancel out the calculations". Changing an input throws away the computed totals.
- Gusto "highly recommend[s] a preview step… a breakdown of total payroll, taxes, and debits" before submit.
- Source: https://docs.gusto.com/embedded-payroll/docs/complete-a-regular-payroll

**Screen map.** A landing hub lists the payrolls, and every path starts and ends there. One run moves through:
1. Configuration (the hours step)
2. Overview (the review step)
3. Receipt

The "view all blockers" list opens as a side route from configuration and returns to it.
- **Breadcrumbs:** go back a step.
- **Save & exit:** available on every step except editing one employee.
- **One-way latch:** once submission starts, "the configuration step is hidden and the flow stays on the overview".
- Sources:
  - https://github.com/Gusto/embedded-react-sdk/blob/main/docs/reference/payroll/payroll-flow.md
  - https://github.com/Gusto/embedded-react-sdk/blob/main/src/components/Payroll/PayrollExecutionFlow/GUIDE.md

**Configuration (hours step), top to bottom.**
1. H1 page title, with the period as a subtitle (dates in bold). The primary "calculate and review" button sits top-right.
2. A stack of alerts: deadline, late payroll, skipped workers, saved.
3. A blocker alert.
4. A worker table with columns: worker, hours, time off, extra earnings, reimbursements, total pay.
   - Each row has a menu: edit, or skip/unskip.
   - A skipped row shows a "skipped" badge.

The calculate button is **disabled while blockers exist** (`isCalculateDisabled={blockersFromApi.length > 0}`).
- Sources:
  - https://github.com/Gusto/embedded-react-sdk/blob/main/src/components/Payroll/PayrollConfiguration/PayrollConfigurationPresentation.tsx
  - https://github.com/Gusto/embedded-react-sdk/blob/main/src/components/Payroll/PayrollConfiguration/PayrollConfiguration.tsx

**Overview (review step), top to bottom.**
1. H1 title, then a "<type> payroll for <period>" subtitle, then alerts.
2. A summary table: total payroll, debit amount, debit date, pay date.
3. Detail tabs: company cost by worker, hours by worker (regular, OT 1.5x, OT 2x, time off, total), take-home by worker, and taxes. Each tab has a totals footer row ("all employees in this payroll").
4. Actions: Edit and Submit.

After submit, the screen shows a processing state, then a "submitted" alert with the amount and date, then a receipt link. Cancel sits behind a confirm dialog with explicit yes/no buttons.
- **Submission blockers** show inline, and submit "stays disabled until each blocker has a selected unblock option".
- **`readOnly`:** hides Edit and Cancel.
- Sources:
  - https://github.com/Gusto/embedded-react-sdk/blob/main/docs/reference/payroll/blocks.md (PayrollOverview)
  - https://github.com/Gusto/embedded-react-sdk/blob/main/src/i18n/en/Payroll.PayrollOverview.json

### Others (secondary)

**Check (payroll API).**
- **Lifecycle:** preview, then approve. Approve "marks the most recent preview calculations as final".
- **Invalidation:** any change after preview resets `preview` to null, so the run must be previewed again.
- **Severity on errors:** `aborted` means the calculation is not saved. `blocking` means it is saved but "can't be approved until the issue is addressed".
- Sources:
  - https://docs.checkhq.com/docs/payroll-preview-and-approval
  - https://docs.checkhq.com/reference/errors-during-payroll-preview

**Briefly, the rest** (all secondary, lower confidence):
- **QuickBooks:** preview, submit, finish (search-result text only). https://quickbooks.intuit.com/learn-support/en-ca/help-article/payroll-processes/process-run-payroll/L6MPmTHDR_CA_en_CA
- **ADP:** Preview shows "Cash Required" and Totals, then Approve (2014-era page; current RUN UI unverified). https://support.adp.com/adp_payroll/content/hybrid/mobile-html/vera/VerifyPayroll.htm
- **Paychex Flex:** missing rates "flagged… with direct links to resolve them"; correct after submitting via "Edit Payroll within 15 minutes". https://www.paychex.com/articles/payroll-taxes/running-payroll-with-paychex
- **Rippling:** "compare your current pay run with previous ones" before approval (marketing page; help center unreachable). https://www.rippling.com/payroll
- **Deel:** not researched.

### Staffing back offices

**TempWorks Enterprise "proofing" wizard.** Confidence: high. This is the closest domain match.
1. Select a session.
2. Review the transactions.
3. Check for errors.
   - Fix an error by opening the record, then click **Refresh** to rerun the check.
   - Or tick **approve** to override the error. "Logs record who approved each error."
   - "In order to continue, all errors need to be resolved or approved."
4. Close the session, which shows a summary with totals. Closing releases the transactions to payroll and invoicing.
5. Open the proofing report.

Source: https://kb.tempworks.com/help/proofing-time-entry-sessions

The TempWorks error catalogue maps almost one-to-one onto SPEC §11:

| TempWorks error | What it catches | Can be approved? |
|---|---|---|
| "Zero Bill and/or Zero Pay" | Missing rates | No |
| "FLSA Error -- Employee does not meet minimum wage requirement" | Pay under the floor | Yes, only for retro pay |
| "Regular Hours Over Pay Period Limit" | Hours entered wrong | Yes |
| "PayRate greater than BillRate" | Rates swapped | No |
| "Duplicate entry found" | Duplicate entries | No |
| Pay/invoice "hold code" | Hold on the entry | Clear the hold |

Source: https://kb.tempworks.com/help/proofing-errors-their-meanings-and-how-to-fix

**Bullhorn One.**
- Hours split into **Payable** and **Billable** charges by earn code.
- Failed export records appear on an **Issues** tab. You resolve them, then re-export.
- Sources:
  - https://kb.bullhorn.com/bhone/Content/BH1/Topics/payrollWorkflowBestPractices.htm
  - https://kb.bullhorn.com/bhone/Content/BH1/Topics/dailyUseCasesBh1.htm

**Bullhorn Back Office, Avionté and Asymbl.** I found no public documentation of a validation screen.

### Primary reference for the exceptions list: the Gusto blocker alert and list (SDK). Confidence: high.

**Summary alert.**
- One blocker: an error alert with title, description, help text, and a "view" button.
- Several blockers: one error alert headed "N issues are preventing you…", a bullet list of titles, and a "view all" button.

**Full list.**
- An H2 heading and an intro line.
- A table: a "Blocker" column (title in semibold, description in muted text) and a right-aligned secondary **action button** per row.
- An empty state for no blockers.
- Dismissible success alerts after an action.

Sources:
- https://github.com/Gusto/embedded-react-sdk/blob/main/src/components/Payroll/PayrollBlocker/components/PayrollBlockerAlerts.tsx
- https://github.com/Gusto/embedded-react-sdk/blob/main/src/components/Payroll/PayrollBlocker/components/PayrollBlockerList.tsx

Gusto's list has **no warning tier**, so the warning semantics come from two other products:
- **Rise People:** "Errors (Blocked)" mean you "cannot approve the pay run until the errors have been corrected". Warnings "do not block approval". Source: https://support.risepeople.com/portal/kb/articles/how-to-finish-approve-a-pay-run
- **Staffology:** a top-of-page message with a View Warnings button, and selecting a warning "go[es] to the area that needs updating". Source: https://help.staffology.co.uk/payroll/payrun/step-by-step/step-9-warnings.htm

**Recommendation for Shiftbook**
- **Stepper:** copy Gusto's structure.
  - One run page with a header: period subtitle and one primary action at top-right.
  - SPEC's five steps become stepper stages. "Exceptions resolved" is the blocker list, reached from a summary alert.
  - The primary action stays disabled while any blocking check fails.
- **Inputs invalidate results:** any change after "Rules computed" throws away the computed totals and sends the run back a step (Gusto "prepare cancels calculations"; Check "preview reset to null").
- **Review totals:** a summary table, then tabs (hours by worker, pay by worker, bill by client), each with a totals footer. The actions are Edit and Approve.
- **Exceptions list:** one row per check type, with the count of affected entries and a **Fix** action that opens the hours grid filtered to those entries.
  - Each check reruns on return, like TempWorks "Refresh".
  - Rows group under "Blocking" and "Warnings".
  - No override of blocking checks: SPEC calls them blocking, and TempWorks makes most rate and pay errors non-approvable. Owner to confirm.

## 2. Approving a run and its snapshot

**Gusto.**
- Statuses: Unprocessed, then Submitted, then Pending, then Paid.
  - Updates are allowed only while Unprocessed.
  - Cancelling is allowed only while Submitted. Cancel "transitions a processed payroll back to the unprocessed state" until 4 pm PT on the deadline.
- Sources:
  - https://docs.gusto.com/embedded-payroll/docs/payroll-statuses
  - https://docs.gusto.com/embedded-payroll/reference/put-api-v1-companies-company_id-payrolls-payroll_id-cancel
- A **receipt** must exist once processed. It contains a receipt ID, sender, recipients, debit date, total debited, debits by category, tax by agency, and net pay per employee. Source: https://docs.gusto.com/embedded-payroll/docs/payroll-receipts

**Check.**
- Approval can follow only a successful preview, and it freezes that preview.
- **Reopen** returns a pending payroll to draft until `reopen_deadline`: one hour after approval, or the approval deadline, whichever is earlier.
- For corrections, approval "recalculates… and compares it against the last preview".
- Sources:
  - https://docs.checkhq.com/reference/reopen-payroll
  - https://docs.checkhq.com/docs/correcting-pay-history

**Rise People.**
- **Approve**, and **Unapprove** "only… until the run is posted". Posted runs cannot change.
- Earlier runs must be posted before a later run can be approved.
- Reports reviewed before approving include "Pay Run Changes".
- Source: same Rise URL as in section 1.

**Bullhorn Time & Expense (client approval).** "There is not a way to 'un-approve' time once it has been approved." Source: https://kb.bullhorn.com/bte/Content/BHTE/Topics/approvingTime.htm

**Recommendation for Shiftbook**
- **States:** Draft (hours being edited), then Computed (rules ran, results current), then Approved (snapshot frozen), then Exported (files and invoices exist).
- **Snapshot at Approve.** Record:
  - the input entry IDs with a content hash
  - the rules-engine version and the rate-table effective rows used
  - every pay line and bill line with its `explain`
  - totals and the totals fingerprint (decision 0011 already uses one)
  - the warnings shown and acknowledged
  - approver identity and time
- **Receipt-style summary** after Approve, following Gusto's receipt: run ID and version, period, approver, totals, per-worker and per-client rows.
- **Reopen ("Unapprove")** is allowed only until files are created (Rise "until posted"; Check `reopen_deadline`). After export, the only path is a correction version.
- **Ordering:** a later week cannot be approved while an earlier week's run is still open (Rise). Owner to confirm.

## 3. Corrections after a period is paid and billed

### Payroll side
**Gusto.**
- The off-cycle payroll has `off_cycle_reason` values that include `Correction` and `Wage correction`. Source: https://docs.gusto.com/embedded-payroll/reference/post-v1-companies-company_id-payrolls
- The SDK's OffCycleFlow runs "a bonus or correction payroll". Source: https://github.com/Gusto/embedded-react-sdk/blob/main/docs/reference/payroll/payroll-flow.md
- A reversal is a separate record that links `reversed_payroll_uuid` to `reversal_payroll_uuid`, with `reason`, `category`, `approved_at` and `reversed_employee_uuids`. Source: https://docs.gusto.com/embedded-payroll/reference/get-v1-companies-company_id-payroll_reversals
- From search-result text only (the article returned 403), so confidence is medium:
  - an underpayment gets an off-cycle payroll
  - someone who shouldn't have been paid gets a reversal
  - overpayments are typically corrected on future payrolls
  - check your state's overpayment laws first
  - Source: https://support.gusto.com/article/106621949100000/Edit-cancel-or-reverse-an-employee-payroll-or-contractor-payment

**Check.** This is the clearest prior art.
- "The Payroll object is immutable."
- A void creates a new payroll with negative amounts, linked by `void_of` and `voided_by`.
- A **Correction** bundles voids and backdated replacement payrolls that are "previewed, approved, and fulfilled as a single unit". Offsets net out, so "nothing is double-collected".
- Lifecycle: draft, pending (can be reopened), processing, settled or failed.
- Sources:
  - https://docs.checkhq.com/docs/voiding-a-payroll-item
  - https://docs.checkhq.com/docs/correcting-pay-history

**TempWorks "reverse billing".**
1. Reversing a check creates a negative "negating" transaction.
2. You enter a "correcting" transaction with the right hours.
3. Both are billed, and they "calculate as a credit". The credit memo is sent separately or merged with the original invoice.

Source: https://kb.tempworks.com/help/reverse-billing

### Billing side
**Bullhorn One.**
- Finalized invoices can't be edited or deleted, so you make an "Adjustment": Credit, or **Credit & Reinstate**. Credit & Reinstate issues a full credit memo, frees the charges, and lets you rebill them. Source: https://kb.bullhorn.com/bhone/Content/BH1/Topics/creditReinstateInvoices.htm (the adjustment overview page needs a login; I saw search-result text only)
- **Rebill number** = the original invoice number plus a "Rebill Suffix" that starts with a special character and can't match the credit suffix. Source: https://kb.bullhorn.com/bhone/Content/BH1/Topics/settingRebillInvoiceNumber.htm
- Charges carry an **Adjustment Y/N** column and Min/Max Accounting Period.
- "Manual Export" marks charges processed outside the system "without creating a duplicate payment risk".
- The credit memo can be held as "Do Not Print" until the replacement invoice is ready.
- Source for the last three points: https://kb.bullhorn.com/bhone/Content/BH1/Topics/dailyUseCasesBh1.htm

**Stripe.**
- **Credit notes** decrease an open or paid invoice "without void[ing] and replac[ing] the original".
- Line-level credits are recommended.
- The total of credit notes can't exceed the invoice.
- Credit note numbers look like `C9E0C52C-0036-CN-01`.
- **Revisions** apply only to open or uncollectible invoices: the new invoice is finalized, the old one voided, linked by `latest_revision`, and listed under "Older versions".
- Sources:
  - https://docs.stripe.com/invoicing/dashboard/credit-notes
  - https://docs.stripe.com/invoicing/invoice-edits
  - https://docs.stripe.com/api/credit_notes/object

**QuickBooks credit memo.** The official article returned 404, so I have nothing verified.

### US legal constraints on recovering an overpayment from a worker
**Federal.**
- Wages must be paid "finally and unconditionally or 'free and clear'". Source: 29 C.F.R. 531.35, https://www.ecfr.gov/current/title-29/section-531.35 (text fetched through the eCFR API)
- WHD opinion letters (1998 WL 852662, and FLSA2004-19NA) treat inadvertent overpayments as wage advances that can be recovered by deduction. I could not fetch these from dol.gov; they are cited in the Massachusetts advisory below.

**Underpayments must be paid promptly.** Retro overtime is due "in no event… beyond the next payday after such computation can be made". Source: 29 C.F.R. 778.106, https://www.ecfr.gov/current/title-29/section-778.106

**Massachusetts (Attorney General advisory, M.G.L. c.149 §§148–150).**
- A disputed overpayment "cannot be subject to a wage deduction".
- An undisputed one can be recovered within these limits:
  - no more than 15% of gross pay, or 50× the minimum wage
  - never below minimum wage for each hour worked
  - none at all from minimum-wage workers
  - the repayment plan must be "fair and reasonable"
- Source: https://archives.lib.state.ma.us/server/api/core/bitstreams/c867a0d6-ea73-4fbb-a04f-836c7f4ca34a/content. The mass.gov copy returned 403.

**California.**
- Labor Code §§221 and 224 allow deductions only when required by law or authorized in writing.
- Deducting salary advances that were paid in error from current payroll was held unlawful (*CSEA v. State*, 1988).
- Only one installment may be deducted from a final paycheck.
- Source: DLSE FAQ, https://www.dir.ca.gov/dlse/FAQ_Deductions.htm. The statute text on leginfo returned 403.

**Illinois.**
- If the worker agrees it was an overpayment, the employer may recover it on the "first regular payday" after it.
- If the overpayment was found later, the two sides "shall agree on a repayment schedule".
- Otherwise the employer must follow Section 9: "express written consent… given freely at the time the deduction is made".
- Cash-advance repayments are capped at 15% per paycheck.
- Source: IDOL FAQ, https://labor.illinois.gov/faqs/deductions-from-pay-faq.html. I could not fetch 820 ILCS 115/9 itself.

**Recommendation for Shiftbook**
- **Never edit an exported version.** A correction is a new version of the same run (Check: payroll immutable; Gusto: reversal links two payrolls).
- **Pay files carry only the differences**, by worker and earning type. A positive difference is a "correction" off-cycle line for the target payroll system.
- **Never auto-write a deduction for a negative pay difference.** Raise a blocking per-worker exception, "overpayment needs a decision", showing the worker's state rule as data. SSN-free. The owner chooses: record written consent, collect outside payroll, or write off.
- **Invoices:** a billing increase gets a supplemental invoice numbered from the original, Bullhorn-rebill style. A billing decrease gets a credit note numbered from the invoice, Stripe `-CN-01` style. The original PDF is never regenerated.
  - Offer full "credit and replace" only if a client or VMS demands it. Open question.
- **Correction workflow:** the correction version runs the same five steps and blocking checks. Its review screen shows **was / now / difference** per worker and per client.
- **Prompt payment:** surface 778.106 as a warning, "underpayment must be paid by the next payday".

## 4. "Client approval required" and warnings

**Client approval required.**
- **TempWorks:** "Timecards that are not approved will not be paid", and "every client may be setup slightly differently". Source: https://kb.tempworks.com/help/customer-portal-reviewing-and-approving-webcenter-timecards
- **Bullhorn:** hours become exportable "once the timesheet has been approved". Source: https://kb.bullhorn.com/js/Content/JS/Topics/backOfficeExportAndIntegration.htm (search-result text only; medium confidence)
- **Bullhorn One** supports reminders, escalation and alternate approvers. Source: https://kb.bullhorn.com/bhone/Content/BH1/Topics/payrollWorkflowBestPractices.htm

**Warnings about change versus the prior run.**
- **PowerPay Payroll Preview Dashboard.**
  - Compares the "current regular run to the previous regular run only".
  - Bands: green 0 to ±2%, yellow ±2.01 to ±5%, red above ±5%.
  - The employee variances table lists only workers outside the threshold.
  - A Refresh button reruns it after changes.
  - Nothing is shown when no prior run exists.
  - Source: https://help.powerpay.ca/en/pphelp/Content/Procedures/PayrollPreviewDashboard.htm
- **PrismHR:** variance threshold as an amount or a percent (default 10), against a chosen finalized payroll; a per-worker variance voucher. https://hro.prismhr.com/docs/prismhr/docs/sp_help/Content/PD/Payroll/Dashboard/Payroll_Variance_Analysis.htm (page marked "moved")
- **Check:** `warnings` objects (code, reason, `reason_description`) at preview and approval. https://docs.checkhq.com/reference/payroll-warnings
- **Rippling** "missing employee in pay run" alert: search results only, unverified, low confidence. https://rippling.com/recipes/missing-employee-in-pay-run-alert

**Approaching 720 hours.** No product documents such a warning. The closest analogue is TempWorks' approvable hours-limit errors. SPEC §9 already sets a warning at 600 hours and a trigger above 720.

**Recommendation for Shiftbook**
- **"Client approval required"** is a per-client setting, effective-dated per the CLAUDE.md data-table rule. It is a blocking check that links to the slice-d approval status and offers a "send reminder" fix.
- **Overtime spike** follows PowerPay's pattern:
  - compare each worker's overtime minutes with the prior week's *exported* run
  - the threshold lives in a data table (percent and/or minutes)
  - list only workers over the threshold, with a link to the worker's week
  - show nothing (and say why) when there is no prior week
- **720-hour warning:** per worker per client, showing hours to date and hours this run would add. A run that crosses 720 links to the obligation.
- **Warnings never block.** The approver sees them on Review, and the snapshot stores them as acknowledged.

## 5. Run versioning model

Prior art offers two ways to correct a recorded amount.
- **Reversal Adjustment.** Post an exact negative of the original entry plus a new correct one. It suits immutable records and gives an audit trail, but the number of entries grows.
- **Difference Adjustment.** Post one entry for the difference, computed with a "Parallel Model": reverse and replay in shadow accounts, then compare. It needs fewer entries and shows the net effect, but it needs discriminators to match lines.
- Sources:
  - https://martinfowler.com/eaaDev/ReversalAdjustment.html
  - https://martinfowler.com/eaaDev/DifferenceAdjustment.html

Check and TempWorks use reversal plus re-issue, and net the result inside one correction. Stripe credit notes are difference adjustments.

**Recommended model (small, deterministic)**
- **Records.** `run(period)`, with `run_version(n, state, parent_version, reason, approved_by/at, rules_version, input_hash, totals_fingerprint)`.
  - Versions are immutable once Approved.
  - Only one Draft version exists at a time (Stripe: "at most one draft revision").
- **v1** is a normal run. Its files contain full lines.
- **Starting a correction** on an Exported vN creates vN+1 as a Draft. It copies vN's inputs and requires a reason.
- **Recompute the whole period** for every affected worker-week: weekly overtime and the 720 counter depend on the whole week. Use the same pure engine. This is the Parallel Model.
- **Differences** are computed against the sum of all exported versions, keyed by:
  - pay: (worker, client, assignment, workweek, earning type)
  - bill: (client, invoice line key)

  Lines with a zero difference are dropped. The `explain` string reads like "was 2,400 min @ … / now 2,520 min @ … / difference +120 min = +$X".
- **Blocking checks on the correction:**
  - the minutes integrity check holds for the differences (pay minutes = bill minutes, except non-billable)
  - a negative pay difference blocks with "overpayment needs a decision" (section 3)
- **Exporting vN+1:**
  - one pay file containing only the differences, marked as a correction (Gusto "Correction" off-cycle)
  - per client, one supplemental invoice or credit note linked to the original invoice number
  - unique indexes on (run, version, format)
- **Never mutate.** Totals for a period are always the sum of its exported versions, so earlier versions stay readable as history (Stripe's "Older versions").

## Open questions for the owner (ask one at a time)
1. Once a run is approved but before you create its files, may someone undo the approval to fix something?
2. When a correction means a worker was overpaid, should Shiftbook only flag it for you rather than put a negative amount in the payroll file?
3. When a correction lowers a client's bill, do you prefer a credit note for the difference, or cancelling the whole invoice and sending a new one?
4. When a correction raises a client's bill, should it go out as a small extra invoice for the difference?
5. Which of your clients must approve hours before you pay, and does that ever differ by job order?
6. How big a jump in a worker's overtime versus last week should trigger a warning: a percent, a number of hours, or both?
7. Who is allowed to approve a weekly run: anyone in the office, or only you?
8. Should a later week wait until the earlier week's run is approved and exported?
