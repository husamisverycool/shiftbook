# Pattern: Client approval page (`/approve/[token]`)

Status: adopted — slice (d) plan (2026-10-16)
Reference product and screen: Bullhorn Time & Expense — Approval Application, opened from its
approval email with no sign-in (primary: one period, one row per worker, day-by-day view, approve
many, dispute a day with a required comment, confirmation email, no undo, expired link); Weatherby
Healthcare client time-approval FAQ (the same application from the client's side); Upwork — hourly
dispute form (dispute dialog content); TempWorks Customer Portal — timecards (a confirmation step
before approval is final); Stripe — hosted invoice page (a no-sign-in page that stays viewable after
it is settled, and its expired-link page)
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/LP/timesheetApprovalLP.htm
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/approvingTime.htm
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/modifyingTime.htm
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/lateApproval.htm
Source URL: https://kb.bullhorn.com/bte/Content/BHTE/Topics/troubleAccessingApprovalApplication.htm
Source URL: https://jobs.weatherbyhealthcare.com/staffing-solutions/resources/time-approval-faq
Source URL: https://support.upwork.com/hc/en-us/articles/211062158-How-to-file-a-dispute-about-a-freelancer-s-hours
Source URL: https://kb.tempworks.com/help/customer-portal-reviewing-and-approving-webcenter-timecards
Source URL: https://docs.stripe.com/invoicing/hosted-invoice-page.md
Researched: 2026-10-16 (research notes: the slice (d) plan). Confidence: medium — the Bullhorn facts
are spread over short help articles; its page header and phone layout are not documented.

## Purpose in Shiftbook
SPEC §10: a page per client per pay period, opened from an emailed link without signing in, where
the client's approver sees their own workers' hours by worker and day, approves them, or disputes a
shift with a reason. Nothing else of the agency's is shown (no pay rates, bill amounts or other
clients; never Social Security numbers).

## Hierarchy
1. **Frame** (`_layouts/portal.md`): the agency's name at the top; its contact details at the foot.
2. **Title and period** (Bullhorn one period per page): "Hours for {client}", the pay period dates,
   and who the request was sent to.
3. **Status line** for the page (Stripe hosted page shows its own status): waiting for approval;
   approved on {date} by {name}; or some shifts disputed and waiting for the agency.
4. **Workers table** (Bullhorn: one row per worker; Weatherby: only workers with time): worker, one
   column per day of the period with that day's hours, the total for the week. A totals row.
   Rows already approved show as approved; a shift under dispute is marked on its day.
5. **Day-by-day view per worker** (Bullhorn "click to view", opened from the row): one line per
   shift: day, start, end, break, hours; a dispute action on each shift still waiting.
6. **Approve bar** at the foot (Bullhorn approve many; TempWorks confirmation): the count of shifts
   and hours being approved, the approver's full name (typed), a confirmation checkbox, and the
   approve button. Disputed shifts are left out of the approval and named in the bar.

Dispute dialog content (Upwork's form, top to bottom; Bullhorn's required comment):
1. The worker, day and the shift's current start, end, break and hours.
2. Corrected start, end and break (optional — the approver may not know them).
3. Reason (required, free text, Bullhorn).
4. Save the dispute.

## Interactions
- Opening the link only shows the page; nothing is approved or used up by opening it (link scanners
  in mail systems open links on their own). Every change is a button press.
- A worker's row opens their day-by-day view (Bullhorn); Escape closes it.
- Dispute a shift (Bullhorn "dispute" with a required comment; Upwork's corrected amount capped by
  what was worked becomes: the corrected times must form a valid shift). A saved dispute can be
  removed again until the approver submits.
- Approve (Bullhorn approve many, after a confirmation step as in TempWorks): approves every shift
  shown that is not disputed, and sends the disputes to the agency, at once. Final: no undo on the
  page (Bullhorn, Beeline); the page says to contact the agency to change it.
- After submitting: the page shows the result (approved by name and time, disputes listed), and a
  confirmation email goes to the approver (Bullhorn) listing what was approved and disputed.
- If the hours changed after the page was opened, submitting is refused and the page reloads with
  the new hours (nothing is approved that the approver did not see).
- Language: the page opens in the language chosen for the approver; a language switch is in the
  frame.

## States
- **Waiting:** as above.
- **Approved:** read-only record, viewable for as long as the link lasts (Stripe's paid invoice page
  stays viewable).
- **Disputed:** read-only; disputed shifts listed with their reasons as waiting for the agency.
- **New hours since the last approval:** approved rows read-only, new shifts waiting.
- **Nothing to approve** (every shift withdrawn or set aside): one line saying so, and the agency's
  contact details.
- **Expired** (Stripe: say the link expired, then to contact the business, then its contact details;
  Bullhorn: a new link is sent): the statement, a button to email a new link to the address the
  request was sent to, and the agency's contact details.
- **Replaced by a newer link:** the same as expired, saying a newer link was sent.
- **Not a valid link:** one statement and the agency-neutral advice to use the link in the latest
  email (no agency details: the link does not say which agency it is).
- **Loading:** server-rendered; buttons show their busy state while saving.
- **Error:** an alert with "Try again"; nothing is half-saved (one transaction).

## Never copy
Bullhorn's, Upwork's, TempWorks', Stripe's wording, icons, colors or logos.

## Look (checked against the reference's own screenshots, 2026-10-17)
Bullhorn's approval table (https://kb.bullhorn.com/bte/Content/BHTE/Topics/approvingTime.htm) marks
nothing on a row still waiting — only its actions; so rows already approved carry a tinted Approved
badge and a disputed shift its mark, and waiting rows carry no badge (`_components/status.md` tones).

Deviations allowed: none
