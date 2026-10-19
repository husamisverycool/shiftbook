# Pattern: Client approval detail (`/approvals/[id]`)

Status: adopted — slice (d) plan (2026-10-16)
Reference product and screen: Stripe Dashboard — invoice detail (header with status and the
actions that fit the status: resend, copy link; a timeline of events); Bullhorn One — timesheet
Activity tab (every reminder, automatic or manual, logged); Harvest — approvals activity log (submit,
approve, withdraw events with who did them) and "withdraw approval"; Instawork — hour disputes
(current hours, proposed hours, reason and the change, then approve or reject); Stripe — dispute
details (accept, or counter with a reply; the response is final)
Source URL: https://docs.stripe.com/invoicing/dashboard.md
Source URL: https://docs.stripe.com/invoicing/send-email.md
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/timesheetApprovalReminders.htm
Source URL: https://support.getharvest.com/hc/en-us/articles/34910294705037-Activity-log-Approvals
Source URL: https://support.getharvest.com/hc/en-us/articles/39974542812429-Flexible-timesheet-approval
Source URL: https://help.instawork.com/en/articles/3758225-how-to-review-disputes
Source URL: https://docs.stripe.com/disputes/responding.md
Researched: 2026-10-16. Confidence: high for Stripe and Harvest; medium for Instawork (one article).

## Purpose in Tabulado
One client's approval request for one pay period: what was sent to whom, what the client decided,
the disputes to settle, and the history.

## Hierarchy
1. **Header** (Stripe invoice detail): client and period; status badge; the approver; actions that
   fit the status — Send a reminder (waiting), Send a new link (expired), Send for approval again
   (new or changed hours, or a dispute settled by keeping the hours), Withdraw approval (approved;
   Harvest).
2. **Disputes** (Instawork, Stripe dispute details), when the client disputed shifts: one card per
   disputed shift — worker, day, the current start, end, break and hours, the client's corrected
   times if given and the change in hours, the reason; actions Accept the client's times (when given),
   Edit the hours (opens Review hours at that shift), and Keep the hours (requires a reply that the
   client will see; Stripe counter-dispute).
3. **Hours** — the same table the client sees (workers by day, totals), each shift's state:
   waiting, approved, disputed, settled.
4. **History** (Stripe timeline; Bullhorn One activity; Harvest approvals log): sent, reminded
   (automatic or by whom), link renewed, approved (name typed, email, time), disputed, dispute
   accepted or kept (by whom, with the reply), approval withdrawn (by whom, with the reason). Each
   email sent has "View email" (Stripe keeps a log of the emails sent to each customer): recipient,
   subject, time, delivery state and the text with the link hidden.

## Interactions
- Accept the client's times: applies the corrected start, end and break to the shift (audited, with
  the client's reason) and counts as the client's approval of that shift (the client proposed them).
- Edit the hours: Review hours, filtered to that worker and day; the edit needs a reason as always;
  afterwards the shift needs the client's approval again.
- Keep the hours: a required reply; the shift needs the client's approval again, and the next link
  shows the reply on that shift.
- Withdraw approval: a required reason; the client's approved shifts become editable again and need
  approval again (Harvest: withdrawn approvals reopen the time).
- View email: a dialog with the logged email. In demo mode it shows the copy delivered to the demo
  mailbox, with its working link, so the person can act as the client (the demo has no real inbox).
- No "copy link": links travel only by email to the approver (a link in the agency's hands could be
  used to approve as the client).

## States
- Not sent; waiting; approved; disputed (open disputes); settled (no open disputes, some shifts
  need approval again); expired; withdrawn.
- Loading skeleton; error alert with "Try again"; not found → the not-found page with a link back to
  Client approvals.

## Never copy
Stripe's, Bullhorn's, Harvest's or Instawork's wording, icons, colors or logos.

## Look (decision 0029, from the products' own screenshots)
Laid out as `_components/record-page.md` without the details column (the hours by day need the full width): "Client approvals" above the client and week with its state; whom it was sent to as the facts line; the request's buttons on the right; Disputes, Hours and History as modules.

## Loading and errors (slice o)
- Loading: the page's outline in the record shape (`_components/loading.md`); buttons that start
  work show a spinner in place of their icon (Primer Button `loading`).
- A failure: the frame stays; the failed content's place says so with "Try again"
  (`_components/error.md`).

Deviations allowed: none
