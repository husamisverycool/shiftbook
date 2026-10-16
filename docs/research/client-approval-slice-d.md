# Research notes: client approval portal (slice d)

Two research passes on 2026-10-16 by research subagents, kept as written. Part 1: screens and
references (feeds the pattern files). Part 2: link security, approver evidence, email and reminders.

# Part 1 — Screens

Researched 2026-10-16. Research only; no repo files changed. Pages were fetched directly (Harvest,
BILL and Upwork articles via their public help-centre API; the human-readable URLs are listed).
Screenshots were not inspected, so element order comes from article text. Quoted labels identify the
reference's controls only; our wording must differ (CLAUDE.md).

**Primary reference for the approver page: Bullhorn Time & Expense (BTE) Approval Application**,
opened from its "Time Approval Request" email. It is the only publicly documented product found
that is built for temp staffing, opens from an emailed link with "No username or password", is
organised by week-ending period with one row per worker and a day-by-day view, and documents
approve one, approve many, dispute by entering new hours with a required comment, the confirmation
email, no undo, and the expired-link message. Weatherby Healthcare's client FAQ describes the same
screen and fills gaps. Confidence: medium (facts spread over short articles; mobile undocumented).
Secondary: Stripe hosted invoice page (no-login page, expiry, recovery); Upwork dispute form.

---

# Screen 1: Approver page (what the client supervisor sees)

Reference product and screen: Bullhorn Time & Expense, Approval Application (primary); Weatherby
Healthcare client "Time approval FAQ" (the same application from the client side); Upwork, hourly
"Dispute" form (dispute dialog); TempWorks Customer Portal, Timecards (bulk action, confirmation).
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/LP/timesheetApprovalLP.htm
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/approvingTime.htm
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/modifyingTime.htm
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/rejectingTimesheets.htm
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/lateApproval.htm
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/assigningAlternateApprover.htm
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/approvalReports.htm
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/manageClientLevelReminderSettings.htm
Source URL: https://jobs.weatherbyhealthcare.com/staffing-solutions/resources/time-approval-faq
Source URL: https://support.upwork.com/hc/en-us/articles/211062158-How-to-file-a-dispute-about-a-freelancer-s-hours
Source URL: https://kb.tempworks.com/help/customer-portal-reviewing-and-approving-webcenter-timecards
Source URL: https://hub.beeline.com/time-expense-366/managing-timesheets-from-approval-central-1694
Source URL: https://docs.bpe.beeline.com/beeline-professional/managing/approving-and-rejecting-timesheets.html
Source URL: https://help.coople.com/en/articles/5356699-how-can-i-review-and-approve-the-working-hours-of-cooplers

## Hierarchy
1. **Top menu bar.** It has "Reports" (Missing Time Sheet, Historical Time Sheet, Estimated Hours and
   Spending). In the upper right is "Alternate Approver", a dialog with first name, last name, email,
   start date, end date, and a checkbox to keep receiving copies of the approval email.
2. **Period tabs.** There is one tab per week-ending date that still has unapproved time, for the
   current and earlier periods (BTE Late Approval). Weatherby: "pay periods appear at the top of the
   page as tabs."
3. **Rows, one per worker assignment.** Only workers who submitted time appear (Weatherby). Each row
   has:
   - the worker;
   - **Total Hours**, a link; hovering shows hours worked plus any overtime or double time;
   - "Click to view", which opens the worker's timesheet day by day (Weatherby: a PDF);
   - actions at the end of the row: approve (check mark), Edit/Modify, and Reject. Edit and Reject
     appear only if the agency turned them on.
4. **Bulk action.** "Multi Approval Option", then select rows, then Submit. TempWorks puts "Approve
   Remaining" and "Reject Remaining" at the top right.
5. **Modify window (per worker).** One line per day with a "New Amount" column and a "Comment" field.
   "Approve Changes" submits it.

Not documented: page header contents (agency or client name), a period-totals row, column order,
footer.

Upwork's dispute form, top to bottom (the content for our dispute dialog):
1. Billing period, total hours charged, and time left to dispute, "at the top of the page".
2. Explanation and Continue.
3. Hours and minutes to dispute. You "can't dispute more hours than the freelancer has worked".
4. Reason checkboxes. "You may select multiple."
5. A checkbox to certify the terms.
6. Submit.

## Interactions
- Opened from the email. No login (BTE landing page).
- **Approve one row:** check mark. BTE warns "this action cannot be reversed."
- **Approve many:** BTE: Multi Approval, then Submit. Beeline "Approve All": "You're not prompted to
  approve this action." TempWorks shows a confirmation screen before approval is final.
- **Dispute a line by changing its hours:** Edit, then enter the New Amount for the day, then a
  Comment, then Approve Changes. The comment is "required when a dispute action has been taken"
  (BTE Modifying Time). Weatherby: Dispute icon, then New Amount, then "You must also enter a comment
  explaining the discrepancy."
- **Reject (send back to the worker):** Reject icon, then a required comment in a pop-up that the
  worker can see, then "Return Timesheet". After that, the approver cannot approve the timesheet or
  edit the comment straight away.
- **Reason format:** BTE: required free text. Upwork: checkbox list, several allowed. Coople
  (no-show): drop-down. InTime by RSM: "predefined reasons" in the email (search snippet only, page
  not fetched: https://eslrsm.atlassian.net/wiki/x/l6MXAw).
- **After approving:** BTE sends a confirmation email "outlining the time approved and/or disputed."
- **Changing your mind:** BTE has no un-approve ("contact your agency administrator and/or
  payroll"); Beeline Professional approvals can't be reversed once finalized. Upwork lets the client
  **withdraw a dispute** (pick a reason, certify); they are then charged for all hours and can't
  dispute that week again.
- **Optional:** after approving, a pop-up to name an alternate approver (BTE per-client setting).

## States
- **Empty:** only workers who submitted time are listed (Weatherby). BTE emails go out only "if there
  is unapproved time". No empty-page design is documented.
- **Loading:** not documented by any reference.
- **Error:** if the BTE page doesn't open, paste the long link, clear browser history, or click the
  email button again. For other errors, contact support. Source:
  https://kb.bullhorn.com/bte/Content/BHTE/Topics/troubleAccessingApprovalApplication.htm
- **Expired:** see Screen 2.
- **Already approved:** approved rows leave the unapproved list. Past approvals are under Reports,
  "Historical Time Sheet" (Weatherby, BTE). No "already approved" page is documented. A similar
  documented case: Stripe's hosted invoice page stays reachable after payment with a receipt link,
  and when voided "displays a message indicating that the invoice has been voided"
  (https://docs.stripe.com/invoicing/overview.md, https://docs.stripe.com/invoicing/dashboard.md).
- **Partially disputed:** BTE's single confirmation email lists approved and disputed time together.
  Disputed hours in a closed period are recorded and handled as a pay or bill adjustment outside the
  app (BTE Late Approval).
- **Mobile:** not documented for BTE or Weatherby. The only documented mobile approval flow I found is
  the Coople for Business app: Review hours tab, then open a shift, then tap a worker, then check
  start, end and break, then Approve. Bulk approval uses a tick box per line.

## Open questions for the owner
1. When a client disputes a line, do they enter the hours they think are right (as in BTE and Upwork),
   or only flag the line with a reason?
2. Should the reason be free text (BTE), a fixed list (Upwork), or a list plus a note?
3. Can a client undo an approval, or withdraw a dispute (Upwork allows withdrawing; BTE and Beeline
   allow no undo)?
4. Do we also need "send back to the worker", separate from dispute? The spec only names dispute.
5. Should "approve all" ask for confirmation first (TempWorks yes, Beeline no)?
6. Are reports and a stand-in approver part of this slice?

---

# Screen 2: Link expired or already used

Reference product and screen: Stripe, hosted invoice page expiry and recovery pages (primary); BTE
expired approval link; Stripe Customer Portal login link and sessions; Slack email sign-in; BILL
customer portal (shown as a contrast).
Source URL: https://docs.stripe.com/invoicing/hosted-invoice-page.md
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/troubleAccessingApprovalApplication.htm
Source URL: https://docs.stripe.com/customer-management/activate-no-code-customer-portal.md
Source URL: https://docs.stripe.com/customer-management.md
Source URL: https://docs.stripe.com/api/customer_portal/sessions/object.md
Source URL: https://slack.com/help/articles/212681477-Sign-in-to-Slack
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/troubleshootingApprovalEmailDelivery.htm
Source URL: https://support.bill.com/hc/en-us/articles/212666063-Portal-accounts-what-the-customer-sees

## Hierarchy
Stripe's expired page has three parts, in this order:
1. A statement that the URL has expired.
2. An instruction to contact the business.
3. The business's contact information.

Stripe's recovery page is used when the invoice was emailed:
1. An email address field.
2. Submit. The person receives "a new copy of the original email with non-expired links."

BTE's expired page shows the message "Response Time has Expired". "An updated link … will be
automatically sent shortly."

Stripe Customer Portal login page:
1. An email field. It can be prefilled with `prefilled_email`, and the customer can still edit it.
2. Stripe emails "a login link that opens their customer portal session."

## Interactions
- **The link itself:** a "secure, long, and random identifier" (Stripe).
- **Expiry:**
  - Stripe invoice URL: 30 days after the due date (or after finalizing if there is no due date),
    never more than 120 days.
  - Stripe Customer Portal sessions: "expire after a 5 minute period. If a customer uses it within
    that time period, the session expires within 1 hour of the most recent activity."
  - BTE: "only remain active for a limited period". The length is not stated.
- **No email arrives (Stripe portal):** the email must match an existing customer. No on-page error
  is documented.
- **Corporate mail filters:**
  - Slack: "If Slack emails still don't arrive, or the links in them expire, ask your IT team to
    allow emails from @slack.com and @slack-mail.com."
  - BTE: emails with links get flagged as spam, so add the sender to the allow list.
- **Contrast:** BILL's invoice link opens a branded page that needs a sign-in, or "Don't have an
  account" using details from the invoice, then terms of service. It is not a magic link.

## States
- **Expired:** documented by Stripe and BTE (above).
- **Recovery sent:** the confirmation message after submitting is not documented.
- **Already used or finished:** Stripe's page stays viewable once paid or voided. BTE does not
  document this case.
- **Loading or error:** not documented.

## Open questions for the owner
1. How long should a link last? (Stripe invoice: 30 days after due. Stripe portal session: 5 minutes,
   or 1 hour after last activity. BTE: not stated.)
2. When a link has expired, should we send a new one automatically (BTE), or let the person request
   one by typing their email (Stripe)?
3. After approval, should the same link still open a read-only record (as Stripe's page does)?
4. Should the link be usable once or many times? Slack's note suggests mail filters can use up links.

---

# Screen 3: Agency view of approval status per client per period

Reference product and screen:
- Harvest, Time > Approval (primary: status filter, approve all, remind);
- Stripe Dashboard, Invoices list (status badges);
- Bullhorn One, Timesheets list and Activity tab;
- BTE, Time Management Console (TMC);
- Harvest, Activity log: Approvals;
- Linear, issue status;
- Instawork, disputes banner.

Source URL: https://support.getharvest.com/hc/en-us/articles/39974542812429-Flexible-timesheet-approval
Source URL: https://support.getharvest.com/hc/en-us/articles/360048181832-Submitting-and-approving-timesheets
Source URL: https://support.getharvest.com/hc/en-us/articles/34910294705037-Activity-log-Approvals
Source URL: https://docs.stripe.com/invoicing/dashboard/manage-invoices.md
Source URL: https://docs.stripe.com/invoicing/send-email.md
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/timesheetApprovalReminders.htm
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/bteApprovalWorkflows.htm
Source URL: https://talentlaunch.freshservice.com/support/solutions/articles/8000004425-bullhorn-time-expense-operating-companies-faq
Source URL: https://linear.app/docs/issue-property
Source URL: https://help.instawork.com/en/articles/3758225-how-to-review-disputes

## Hierarchy
1. **Filters** (Harvest): Timeframe; Status (Unsubmitted / Pending Approval / Approved); Client;
   Project; Role; Teammate.
2. **Disputes banner** (Instawork): the number of people asking for an hours change, with
   "View details".
3. **Rows** (Harvest). Each row has its own actions:
   - Approve and Send email;
   - Send reminder and Force submit, under Unsubmitted;
   - Withdraw, under Approved.
4. **Page action** (Harvest): "Approve all timesheets and expenses", or Withdraw approval for
   everything on the page.
5. **List mechanics** (Stripe): filter tabs or chips; a status badge per row ("Past due",
   "Retrying") with a hover tooltip; Edit columns; Export (CSV); a ⋯ menu per row.
6. **Detail page** (Stripe invoice details): actions depend on status (edit, note, resend, receipt).
7. **History:** Bullhorn One logs every reminder, automatic and manual, on the timesheet's Activity
   tab. Harvest's approvals log shows submit, approve and withdraw events, filterable by event type,
   "performed by" and "owned by", exportable. Stripe keeps customer email logs for 60 days.

## Interactions
- **Manual reminder:** Bullhorn One: select timesheets, Actions > Send Approval Reminder (status
  "Submitted" only). Harvest: Unsubmitted, tick people (or all), Send email reminders. Stripe:
  invoice, "Send invoice", which previews the hosted page first. BTE TMC: "send reminder" from the
  unapproved-time tab; click the approver's name to add an alternate (third-party TalentLaunch FAQ).
- **Agency approves for the client:** TMC admins can approve directly, "bypassing the need for Client
  Level Approval."
- **Filters change what gets approved:** with a filter on, "approve all" approves only the filtered
  time (Harvest).
- **Status chips (Linear):** the categories stay in a fixed order, Backlog > Todo > In Progress >
  Done > Canceled. Statuses can be reordered only within their category. Name, colour and description
  can be edited.

## States
- **Empty:** not documented in these references. `docs/patterns/_components/empty-state.md` already
  exists.
- **Partially disputed:** Instawork shows a banner. BTE has a "Notify branch of dispute" setting.
- **Approved:** Harvest's "Approved" status, which can be withdrawn.
- **Expired link:** Stripe URLs shown in the Dashboard stay valid for at least 10 days.
- **"Opened/viewed":** I found no documented "viewed" event. Stripe documents invoice.created,
  finalized, sent and paid.

## Open questions for the owner
1. Which statuses should a period have (for example: not sent, sent, approved, partly disputed,
   expired)? Linear's category order is fixed; how should our statuses map onto it?
2. Should we record when the client opens the link? No reference documents doing this.
3. May the agency approve on the client's behalf (the BTE TMC can)? If so, whose identity goes in
   the audit event?
4. Who sets a stand-in approver: the client, the agency, or both?

---

# Screen 4: Disputes as adjustment proposals (agency side)

Reference product and screen: Instawork, hours adjustment request (primary); Stripe, Dispute details
(accept or counter); Upwork, freelancer's dispute response; GigSmart, approving timesheets; BTE,
branch notice and late approval.
Source URL: https://help.instawork.com/en/articles/3758225-how-to-review-disputes
Source URL: https://docs.stripe.com/disputes/responding.md
Source URL: https://support.upwork.com/hc/en-us/articles/211068588-What-to-do-if-a-client-disputes-your-hours-on-Upwork
Source URL: https://help.gigsmart.com/approving-timesheets
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/lateApproval.htm

## Hierarchy
Instawork:
1. A banner with the number of requests and "View details".
2. Each request shows the worker, "Current billable hours", "Proposed billable hours", the reason and
   the "Total change".
3. Approve and reject. The button labels are not documented.

Stripe dispute details:
1. The category or reason.
2. "Review the claim details", which shows the documents.
3. An option to email the customer.
4. **Accept dispute** or **Counter dispute**. Counter opens a two-page form that ends with a checkbox
   confirming the response is final.

## Interactions
- **Accept or reject:** Instawork: approving means you are charged the proposed times; rejecting
  means you are not. GigSmart adds a third choice: "pay a different amount".
- **Reply:** not stated as required by Instawork or GigSmart. Stripe Counter needs reasons and
  evidence; Upwork Decline: "Fill out the form and Submit."
- **Final:** Stripe: "You can't edit the response or submit additional files."
- **Deadlines:** Instawork 3 days, then auto-approved; Upwork 3 calendar days; GigSmart 1 business day.
- **Notice to the agency:** BTE "Notify branch of dispute"; Stripe uses email, Dashboard, event, push.

## States
- Waiting for a response, deadline near, auto-resolved (Instawork).
- Under review, then won or lost (Stripe).
- Withdrawn by the client (Upwork).
- Period already closed: handled as an adjustment outside the app (BTE).

## Open questions for the owner
1. If the agency rejects a dispute, is a reply required, and does the client see it?
2. Should the agency be able to settle on different hours (as GigSmart allows)?
3. What happens if nobody responds by the deadline (Instawork approves the dispute automatically)?
4. After the agency responds, does the client have to approve again?

---

# Screen 5: Emails (request, reminder, confirmation)

Reference product and screen: BTE approval request, reminder and confirmation emails; Stripe invoice
emails and reminders; BILL Auto Reminders; Harvest timesheet reminders.
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/manageClientLevelReminderSettings.htm
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/troubleshootingApprovalEmailDelivery.htm
Source URL: https://docs.stripe.com/invoicing/automatic-collection.md
Source URL: https://docs.stripe.com/invoicing/hosted-invoice-page.md
Source URL: https://support.bill.com/hc/en-us/articles/207482263-Auto-Reminders
Source URL: https://support.getharvest.com/hc/en-us/articles/360058596112-Timesheet-reminders

## Hierarchy
- **BTE request email:** contains an "Approve Timesheets" link. It is sent from a donotreply address on
  the branch's schedule, and only when there is unapproved time. The subject and body are not
  documented.
- **Stripe invoice email:** a link to the hosted page plus the invoice PDF attached. The page link is
  also printed in the PDF footer.

## Interactions
- **BTE, per client:** Live Date; First request, First retry, "Escalate on" (third attempt, to a
  second approver); attempts at least 1 hour apart; Previous Week or Current Week; "Notify employee
  when": Never / All Approved / Anything changes. One agency's setup: Monday, Tuesday, Wednesday
  8:00 a.m. EST to primary and alternate approvers (third-party TalentLaunch FAQ).
- **Stripe:** "Add reminder", schedule from a drop-down: before, on, or after the due date (offsets
  not published). Skipped if a payment is already processing.
- **BILL:** up to 3 reminders, off by default, preset 30/60/90 days, before or after due date;
  sender, subject and body editable with merge fields (2,000 characters); sent to all contacts on
  the customer record while more than $0 is due.
- **Harvest:** two automatic reminders, a chosen number of hours before and after the deadline, only
  to people who haven't submitted; plus one-off manual reminders, which people cannot opt out of.
- **Confirmation:** BTE emails the approver after they act, listing approved and/or disputed time.

## States
- **Not received:** check spam, allow-list the sender (BTE); Stripe email logs cover 60 days.
- **Stop conditions:** BTE only while time is unapproved; BILL only while a balance remains; Harvest
  only to non-submitters; Stripe skips while a payment is processing.

## Open questions for the owner
1. How many reminders, and when (BTE: 3 with escalation; BILL: up to 3; Harvest: 2)?
2. Should the third reminder go to a second contact at the client?
3. May agencies edit the email text (as in BILL), or is it fixed?
4. Should workers be told when their hours are approved or disputed (a BTE option)?
5. Should the request email attach a PDF of the hours, as Stripe attaches the invoice?

---

# Could not verify
- **Stripe payment timeline:** no public doc describes its contents; no documented "viewed" event.
- **Slack and Notion link expiry:** not stated on their help pages.
- **BTE:** page header, mobile, already-used link, email subject and body undocumented.
- **TempWorks:** clients sign in (no magic link); rejection-reason format not stated.
- **SAP Fieldglass:** rejection-reason articles need an SAP login.
- **Not researched:** Gusto, Rippling, Deputy, Homebase (internal manager approval, not client links).


# Part 2 — Security, email and reminders

Researched 2026-10-16. Only research: no repository files were changed. Sources are numbered [S#] and listed at the end.
Confidence: **H** = a primary source says it directly. **M** = a vendor or community source, or my inference. **L** = third-party only, or the page could not be read.
Pages I could not read: official Proofpoint and Mimecast scanning docs, the SSA e-signature PDF (403), the DOJ e-signature guidance (401), California leginfo (403, so I used the Attorney General FAQ), SendGrid pricing (redirect loop), and the SAP Fieldglass learning page (404).

---

## 1. Token design

- **Entropy.** OWASP: at least 64 bits; a CSPRNG value of at least 128 bits is recommended [S2] (H). NIST 800-63B-4: random values at ≥112-bit strength from an approved generator (§3.2.12); session secrets ≥64 bits (§5.1) [S4] (H). Node's `crypto.randomBytes` gives "cryptographically strong pseudorandom data" [S5] (H).
- **Hash.** NIST §3.1.2.2: look-up secrets are stored hashed. Only secrets under 112 bits need salted password hashing [S4] (H). So for a 256-bit token, plain SHA-256 is enough. HMAC with a server key adds little here, and it brings a secret to manage, including in demo mode (M). Paragon's split-token design stores the SHA-256 of the secret part [S6] (M).
- **Constant time.** Look up by `token_hash` through a unique index. Timing differences then reveal facts about the hash, never the token [S6] (M). If two secrets are ever compared directly, use `crypto.timingSafeEqual`, which Node documents for "capability urls"; it needs equal-length inputs [S5] (H).
- **Scope.** One row = agency × client × period × approver email (+ snapshot version), with expiry and revocation fields. Repo note: row-level security hides every row until `app.agency_id` is set (`drizzle/0001_rls_and_audit.sql`). The first lookup by hash therefore needs a narrow cross-agency function that returns only `(agency_id, link_id)`.
- **Expiry.**
  - Login links are short: Supabase defaults to 1 hour, single use, 60 s between requests [S13b] (H).
  - Requests for a decision are long: DocuSign defaults to 120 days (community moderator) [S32] (M). Bullhorn approval links last "a limited period" and are re-sent automatically [S30] (H).
  - Why: approvers act days later and scanners open links first. The trade-off is a longer window for a leaked or forwarded link.
- **Single use or reusable.** OWASP makes reset tokens single use [S1] (H). An approval link gets opened by scanners and on several devices. So viewing should be reusable until expiry, and the decision happens once (M).
- **Revocation and re-issue.** The W3C capability-URL draft (2014, not a standard) says such links should expire and be revocable, a resource may have several, and an expired link should return 404 or 410 [S7] (M). Because only hashes are stored, each reminder must mint a new token.
- **Rate limiting.** OWASP: rate-limit token guessing and give consistent messages [S1] (H). Next.js suggests rate limits on actions that send email [S22] (H). With a 256-bit token, guessing is moot; limits are for abuse.
- **Path, query or fragment.**
  - RFC 9110 §17.9: URIs get logged and displayed, so it is "unwise" to put sensitive data in them [S8] (H). RFC 6750 §5.3: bearer tokens "SHOULD NOT be passed in page URLs" [S9] (H). A magic link can't avoid this.
  - Fragments are "not sent in requests" and are left out of Referer [S8] (H), but they need client-side JavaScript. Safe Links rewrites the whole URL [S14], so I infer the gateway sees the token anyway (M).
  - Path and query leak equally; the path fits server rendering (M).
- **Headers.**
  - `Referrer-Policy: no-referrer` [S1] (H). The browser default, strict-origin-when-cross-origin, already strips the path cross-origin [S10] (H), but set it explicitly.
  - No third-party resources on the page [S7].
  - `Cache-Control: no-store` [S2][S9] (H).
  - `X-Robots-Tag: noindex`, and don't block the path in robots.txt: Google can't see a noindex on a blocked page [S11] (H).
- **Logging.** OWASP: don't log access tokens; log a hash if needed [S3] (H). A token prefix makes redaction and secret-scanning reliable, which is why GitHub added prefixes [S12] (H).

**Recommendation for Shiftbook**
- Token: `sbap_` + base64url(`randomBytes(32)`). Store `sha256` only, in a unique column.
- Link `/a/<token>`. Redact `sbap_…` in app logs. Hosting request logs remain a residual exposure, limited by expiry.
- Expiry: the earlier of "period locked" or N days after issue. N lives in settings data; propose 14.
- Reminders mint new links; older links stay valid until their own expiry. Revoke all of a period's links when the approver changes, the period is reopened, or the owner presses Revoke.
- Expired page: an "Email me a new link" button. It sends only to the address on file (no email field) and is limited to 1 per 5 minutes.

## 2. Email link scanners

- **Microsoft Safe Links** scans URLs "prior to message delivery". URLs without "a valid reputation are detonated asynchronously in the background". Holding mail until scanning finishes is the recommended setting [S14] (H). A new link has no reputation, so expect automated fetches before the human clicks.
- **Proofpoint** claims "sandboxing attachments and URLs" and "click-time protection" [S15] (M). Mimecast's "URL Pre Scanning" post would not render beyond its title [S16] (L).
- **Slack** "must fetch every URL in a message" if the link is pasted into chat [S21] (H).
- **Vendor evidence.** Supabase calls prefetching the "most common reason" links appear expired, and fixes it by invalidating only after the user submits [S13] (H). Stytch doesn't count scanner clicks as authentication [S17] (M). Descope shows scanners "an intermediate screen with a button" [S18] (M).
- **Standards.** RFC 9110 §9.2.1: an action selected by URI parameters "MUST" be disallowed for safe methods such as GET [S8] (H). RFC 8058 §1: anti-spam software fetches links, and a machine can't be told from a person, so the fix is POST [S20] (H).
- **Next.js.** Server Actions are POST-only and check the Origin header; cookies can't be set during render [S22] (H).
- **Caveat.** Some sandboxes run JavaScript (M), so never auto-submit a form on page load.

**Recommendation for Shiftbook**
- GET only verifies the token and renders a read-only page. At most it logs "link opened (may be automated)", never treated as human evidence.
- Approve, dispute and resend are button-only Server Actions. Each re-checks the token, scope, expiry and revocation [S22]. The token travels in a hidden form field, so no cookie session is needed.
- Approval also requires a typed name (§3).

## 3. Approver identity and evidence

- **ESIGN.** A signature or record can't be denied legal effect "solely because it is in electronic form" (15 U.S.C. §7001(a)) [S23] (H). An electronic signature is a "sound, symbol, or process … executed or adopted by a person with the intent to sign the record" (§7006(5)) [S24] (H).
  - ESIGN doesn't require anyone to accept e-signatures (§7001(b)(2)) [S23].
  - The consumer-consent rules (§7001(c)) cover personal or household use only (§7006(1)) [S24]. A business approver is not a consumer (M; not legal advice).
- **UETA**, using Vermont's text as the example:
  - It applies when parties agreed to transact electronically, which can be read from context and conduct (9 V.S.A. §274(b)) [S25] (H).
  - Attribution "may be shown in any manner", including that a security procedure worked (§278(a)) [S26] (H).
  - Massachusetts enacted UETA as ch. 110G [S27]; I didn't read its text (M).
- **What is customary.**
  - Bullhorn: no login, no typed name mentioned, a confirmation email of what was approved or disputed, and approval "cannot be reversed" [S29] (H).
  - DocuSign: a record of "the process by which the signature was created" must be kept [S33] (M).
  - FDA's 21 CFR 11.50 doesn't apply to timesheets but is a well-known model: printed name, date and time, and the meaning, such as "approval" [S28] (H).
  - So a typed name is not universal for timesheet approval, but it is cheap evidence of intent.
- **IP addresses and privacy.**
  - IP addresses are PII (NIST SP 800-122 §2.2) [S34] (H) and are online identifiers under GDPR Recital 30 [S35] (H).
  - The CCPA applies only above $25M revenue, 100,000 consumers, or 50% of revenue from selling data; its employee and B2B exemptions ended 2022-12-31 [S36] (H). Most small agencies fall below it (M).
  - OWASP lists the IP address among the "who" fields to log [S3] (H).
- **Retention.** Time cards must be kept 2 years under federal law (29 CFR 516.6(a)(1)) [S37] (H) and 3 years in Massachusetts (c.151 §15) [S38] (H).

**Recommendation for Shiftbook**
- The append-only `client_approval.approved` audit event should hold:
  - the request and link IDs, and the email the link was sent to;
  - the typed full name, plus the attestation text, its version and language;
  - the UTC time, IP address and user agent;
  - a SHA-256 of the exact snapshot shown.
- Disputes are recorded the same way, with the line and reason.
- After a decision, email a confirmation to the approver and the agency, so misuse of a forwarded link is noticed.
- Keep the IP address only in this event, for at least 3 years, and say so on the page.
- Ask the owner to add "portal approval = acceptance" to client agreements, with a lawyer confirming the wording.

## 4. What the page may show

- Next.js advises minimal DTOs, plus taint APIs to stop values reaching the client [S22] (H).
- Bullhorn's approver view describes hours, overtime and double time per day; no rates or amounts are mentioned [S29] (H).
- SAP Fieldglass approvers check days, hours, task codes and rate categories (search snippet only) [S39] (L).
- On bill amounts: the client knows its own bill rates (M). But amounts aren't final until rules run (SPEC §11), so showing them invites disputes over numbers that will change (M).

**Recommendation for Shiftbook**
- **Show:** client, period, each worker's display name, minutes per day by category (regular / OT / DT), totals, job order or PO, line status.
- **Never show:** SSNs or last-4, pay rates, burden, margin, worker contact details or date of birth, other periods or clients, internal notes, source images (they may hold SSN-shaped text or other clients' rows).
- **Bill amounts:** not in v1; ask the owner whether to offer them later.
- Build the page from a dedicated DTO with no SSN or rate fields, and taint SSN values as a backstop.

## 5. Email: demo transport and provider

- **The pattern is a pluggable delivery backend.** Rails `:test` saves mail to `ActionMailer::Base.deliveries` [S40] (H). Laravel's `log` driver writes mail to logs [S41] (H). Django has console, file, locmem and dummy backends, and its test runner uses locmem [S42] (H). ADR 0004 already uses this shape.

| | Postmark | Resend | Amazon SES | SendGrid |
|---|---|---|---|---|
| API / plain fetch | `POST /email`, server-token header; fetch works [S44] (H) | `POST /emails`, Bearer key, `Idempotency-Key` (24 h); fetch works [S49] (H) | SigV4 signing; SDK recommended [S54] (H) | not verified |
| Node SDK | `postmark` [S47] | `resend` [S49] | AWS SDK | not verified |
| Bounce webhooks | yes; **unsigned** (Basic Auth + IP allowlist) [S45][S46] (H) | yes; signed (`svix-*` headers) [S50] (H) | SNS or event publishing [S53] (H) | not verified |
| Deliverability | separate transactional and broadcast streams [S43] (H) | not verified | starts in a sandbox (verified recipients only, 200/day; ~96 h review to leave) [S52] (H) | not verified |
| Low volume | free 100/mo; $15 per 10k [S43] (H) | free 3,000/mo (100/day); $20 per 50k [S48] (H) | $0.10 per 1k [S51] (H) | 60-day trial; ~$19.95 per 50k [S55] (L) |

- **Gmail and Yahoo rules.**
  - All senders: SPF or DKIM, PTR records, TLS, spam rate under 0.3% [S56] (H).
  - Bulk senders (about 5,000 a day; permanent status) also need SPF + DKIM + DMARC with alignment, and one-click unsubscribe for marketing mail [S56][S57] (H).
  - "Transactional messages are excluded" [S57] (H); Yahoo is similar and prefers the RFC 8058 POST method [S58] (H).
  - Approval emails and reminders are transactional.
- **Basics.**
  - SPF (RFC 7208): a DNS record listing allowed senders.
  - DKIM (RFC 6376): the provider signs mail, and the domain publishes the public key in DNS.
  - DMARC (RFC 7489): a policy record at `_dmarc` that requires an aligned SPF or DKIM pass.
  - These are the standard RFCs; I didn't fetch them for this note.

**Recommendation for Shiftbook**
- One `MailTransport` interface:
  - `OutboxTransport` for demo and tests writes to a `demo_mailbox` table, shown in an in-app Outbox and used by Playwright for acceptance step 4.
  - `ResendTransport` (plain fetch) for production.
  - The mode is chosen once in `services.ts`.
- Generate the token inside the send job. Only the fictional demo mailbox ever stores the plaintext link.
- **Choose Resend:** plain fetch, an idempotency key (our jobs retry at least once), signed webhooks, and a free tier that fits a small agency. **Postmark** is the fallback. Choosing either needs a decision record, and the key goes in environment settings.
- In v1, send from Shiftbook's domain as "<Agency> via Shiftbook", with Reply-To set to the agency, so the agency does no DNS work. An own-domain option later means the agency adds the provider's DKIM records and a DMARC record at `p=none`.
- Add no List-Unsubscribe header.

## 6. Reminders

- **Existing queue.** ADR 0010 already has the `jobs` table with SKIP LOCKED, which Postgres documents for "queue-like" tables [S64] (H). Nothing wakes it on a timer.
- **Options.**
  - **Host cron.** Vercel Hobby runs once per day (±59 min); Pro runs per minute [S60] (H). Delivery is best-effort and may duplicate or miss runs, so work must be idempotent; the endpoint is protected by a `CRON_SECRET` header [S61] (H).
  - **pg_cron** runs SQL on a schedule inside Postgres [S62] (H). It can enqueue jobs but can't send email.
  - **pg-boss** has cron and retries and needs Node ≥22.12 [S63] (H). It also needs a long-running process (M) and would duplicate our queue.
- **Prior art.** Bullhorn reminds only while a timesheet is still "Submitted" [S31] (H).

**Recommendation for Shiftbook**
- Add `run_after` to `jobs`. A `sweepReminders(now)` function enqueues reminder jobs with a unique key `(request_id, reminder_no)`, so duplicate cron runs are harmless.
- Reminders stop on approval, dispute, period lock or expiry. Cadence lives in settings data.
- Triggers:
  - Production: a secret-protected route the host scheduler calls every 15 minutes.
  - Demo: a "Run scheduled tasks now" button.
  - Tests: a fixed clock.
- No new service or dependency.

---

## Sources
- S1 https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- S2 https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- S3 https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- S4 NIST SP 800-63B-4 https://pages.nist.gov/800-63-4/sp800-63b.html
- S5 https://nodejs.org/api/crypto.html
- S6 https://paragonie.com/blog/2015/04/secure-authentication-php-with-long-term-persistence
- S7 https://www.w3.org/TR/capability-urls/
- S8 RFC 9110 https://www.rfc-editor.org/rfc/rfc9110
- S9 RFC 6750 https://www.rfc-editor.org/rfc/rfc6750
- S10 https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy
- S11 https://developers.google.com/search/docs/crawling-indexing/block-indexing
- S12 https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/
- S13 https://supabase.com/docs/guides/troubleshooting/otp-verification-failures-token-has-expired-or-otp_expired-errors-5ee4d0
- S13b https://supabase.com/docs/guides/auth/auth-email-passwordless
- S14 https://learn.microsoft.com/en-us/defender-office-365/safe-links-about
- S15 https://www.proofpoint.com/us/products/advanced-threat-protection/targeted-attack-protection
- S16 https://community.mimecast.com/discussion/8622/url-pre-scanning-available-now
- S17 https://stytch.com/docs/multi-tenant-auth/authentication/magic-links/overview.md
- S18 https://docs.descope.com/conditions/email-scanner
- S20 RFC 8058 https://www.rfc-editor.org/rfc/rfc8058
- S21 https://docs.slack.dev/messaging/unfurling-links-in-messages/
- S22 https://nextjs.org/docs/app/guides/data-security
- S23 https://www.law.cornell.edu/uscode/text/15/7001
- S24 https://www.law.cornell.edu/uscode/text/15/7006
- S25 https://legislature.vermont.gov/statutes/section/09/020/00274
- S26 https://legislature.vermont.gov/statutes/section/09/020/00278
- S27 https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXV/Chapter110G
- S28 https://www.law.cornell.edu/cfr/text/21/11.50
- S29 https://kb.bullhorn.com/bte/Content/BHTE/Topics/approvingTime.htm
- S30 https://kb.bullhorn.com/bte/Content/BHTE/Topics/troubleAccessingApprovalApplication.htm
- S31 https://kb.bullhorn.com/bhone/Content/BH1/Topics/timesheetApprovalReminders.htm
- S32 https://community.docusign.com/esignature-111/about-expiration-period-for-signature-request-24990
- S33 https://www.docusign.com/learn/esign-act-ueta
- S34 https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-122.pdf
- S35 https://gdpr-info.eu/recitals/no-30/ (mirror)
- S36 https://oag.ca.gov/privacy/ccpa
- S37 https://www.law.cornell.edu/cfr/text/29/516.6
- S38 https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXXI/Chapter151/Section15
- S39 https://learning.sap.com/courses/procuring-contingent-workers-using-sap-fieldglass/managing-worker-time-and-expenses-1 (404; snippet)
- S40 https://guides.rubyonrails.org/configuring.html ; https://guides.rubyonrails.org/testing.html
- S41 https://laravel.com/docs/12.x/mail
- S42 https://docs.djangoproject.com/en/5.2/topics/email/
- S43 https://postmarkapp.com/pricing
- S44 https://postmarkapp.com/developer/api/email-api
- S45 https://postmarkapp.com/developer/webhooks/bounce-webhook
- S46 https://postmarkapp.com/developer/webhooks/webhooks-overview
- S47 https://postmarkapp.com/developer/integration/official-libraries
- S48 https://resend.com/pricing
- S49 https://resend.com/docs/api-reference/emails/send-email
- S50 https://resend.com/docs/webhooks/verify-webhooks-requests
- S51 https://aws.amazon.com/ses/pricing/
- S52 https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html
- S53 https://docs.aws.amazon.com/ses/latest/dg/monitor-sending-activity-using-notifications.html
- S54 https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv.html
- S55 https://www.usagepricing.com/blueprint/activity/twilio-2025-04-04-packaging ; https://www.usecarly.com/blog/sendgrid-pricing/ (third-party)
- S56 https://support.google.com/a/answer/81126
- S57 https://support.google.com/a/answer/14229414
- S58 https://senders.yahooinc.com/best-practices/
- S60 https://vercel.com/docs/cron-jobs/usage-and-pricing
- S61 https://vercel.com/docs/cron-jobs/manage-cron-jobs
- S62 https://github.com/citusdata/pg_cron
- S63 https://github.com/timgit/pg-boss
- S64 https://www.postgresql.org/docs/current/sql-select.html
- RFC 7208 / 6376 / 7489 (not fetched): https://www.rfc-editor.org/rfc/rfc7208 , https://www.rfc-editor.org/rfc/rfc6376 , https://www.rfc-editor.org/rfc/rfc7489
