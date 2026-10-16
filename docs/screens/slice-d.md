# Slice (d) screens compared with their pattern files

Captured 2026-10-16 in demo mode (English, 1440×900 unless noted). ✓ = matches the pattern file.

## Client approvals — `docs/patterns/approvals.md` (Harvest approval page, Stripe invoices list, Instawork banner, Linear status order)
Screens: `slice-d/d1-approvals-not-sent.png`, `slice-d/d3-approvals-waiting.png`,
`slice-d/d10-approvals-disputed.png`, `slice-d/es-d12-approvals.png`, `slice-d/d2-send-dialog.png`.
- ✓ View header: title; the pay period chooser on the right (Harvest timeframe).
- ✓ Disputes banner above the list when any shift is disputed, with a button that filters to them
  (Instawork).
- ✓ Filters for status and client, kept in the address.
- ✓ One row per client with hours in the period, grouped by status in a fixed order (disputed, not
  sent, to send again, waiting, approved) with a count per group (Linear).
- ✓ Each row: client, approver (name and email, or "No approver yet"), shifts and hours (and how many
  still need review), status badge with a tooltip (Stripe), last activity with its time.
- ✓ Row actions: Send for approval / Send again, Send a reminder (waiting only), Open.
- ✓ The send dialog prefills the client's last approver (Stripe's send-invoice dialog), shows what
  will be sent, and is refused with a link to Review hours while shifts still need review.
- Differences: the filters are two drop-downs rather than Harvest's filter chips (Shiftbook's
  existing hours review uses the same drop-downs). No bulk "approve all" for the agency (out of this
  slice: approving on the client's behalf).

## Client approval request — `docs/patterns/approvals/[id].md` (Stripe invoice detail and email log, Bullhorn One activity, Harvest log and withdraw, Instawork disputes, Stripe dispute response)
Screens: `slice-d/d4-request-waiting.png`, `slice-d/d5-email-dialog.png`,
`slice-d/d11-request-disputed.png`, `slice-d/d12-request-approved.png`.
- ✓ Header: client and period, status badge, the approver and language; actions that fit the
  status (Send a reminder, Send again, Change approver, Withdraw approval).
- ✓ Disputes: one card per disputed shift with the recorded times, the client's times, the change in
  hours and the client's reason; Accept the client's times, Edit the hours (Review hours filtered to
  the worker), Keep the hours (a required reply). Settled disputes listed with who settled them.
- ✓ Hours: the same table the client sees.
- ✓ History, newest first: sent, reminded, link opened (marked as possibly a mail system), decided,
  disputes settled, approval withdrawn — each with who did it; every email with View email
  (recipient, subject, time, delivery state, text with the link hidden). In demo mode the dialog
  also shows the copy the approver receives, with its working link.
- Differences: no "copy link" (decision 0013: links travel only by email to the approver).

## Client's approval page — `docs/patterns/approve/[token].md` in `docs/patterns/_layouts/portal.md` (Bullhorn approval application, Upwork dispute form, TempWorks confirmation, Stripe hosted page)
Screens: `slice-d/d6-portal-waiting.png`, `slice-d/d7-dispute-dialog.png`,
`slice-d/d8-portal-ready-to-approve.png`, `slice-d/d9-portal-after-decision.png`,
`slice-d/es-d9-portal-after-decision.png`, `slice-d/m1-portal-phone.png` (390 px),
`slice-d/d13-portal-expired.png`, `slice-d/d14-portal-invalid.png`.
- ✓ Frame: the agency's name at the top with the language switch; the agency's contact details and
  "provided by" at the foot; no agency navigation (Stripe hosted page).
- ✓ Title and period, who the request was sent to, the page's own status line.
- ✓ Workers table: one row per worker, one column per day, a total, a totals row; a disputed day is
  marked; each worker's shifts open underneath (Bullhorn "click to view"), Escape closes them.
- ✓ Dispute per shift: the shift's current values, optional corrected start, end and break, a
  required reason (Upwork's form content; Bullhorn's required comment); removable until sent.
- ✓ Approve section: what will be approved and what will be disputed, the typed full name, the
  confirmation checkbox, the note on what is kept, the button, and that it cannot be changed here.
- ✓ After the decision: read-only, who approved and when, disputed shifts with their reasons.
- ✓ Expired: the statement, "Email me a new link" (sent only to the address on file), the agency's
  contact details (Stripe; Bullhorn sends a new link). Invalid: one statement, no agency details.
- Differences: on a phone the hours table scrolls sideways inside its frame (no reference documents
  a phone layout). The demo banner shows above the frame in demo mode (SPEC §18).

## Emails — `docs/patterns/_emails/approval-request.md`
Seen in `slice-d/d5-email-dialog.png`: greeting, who asks for what, the summary of workers, shifts
and hours, the link with how long it lasts and not to forward it, the agency's contact details.
