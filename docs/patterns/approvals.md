# Pattern: Client approvals list (`/approvals`)

Status: adopted — slice (d) plan (2026-10-16)
Reference product and screen: Harvest — Time > Approval (primary: filters, rows grouped by status,
approve or remind per row, reminders only to those who have not acted); Stripe Dashboard — invoices
list (status badge per row with a tooltip, row opens the detail page, row ⋯ actions); Instawork —
disputes banner (the count of open hour disputes above the list, with a link to them); Linear —
issue status (status categories in a fixed order)
Source URL: https://support.getharvest.com/hc/en-us/articles/39974542812429-Flexible-timesheet-approval
Source URL: https://support.getharvest.com/hc/en-us/articles/360048181832-Submitting-and-approving-timesheets
Source URL: https://docs.stripe.com/invoicing/dashboard/manage-invoices.md
Source URL: https://help.instawork.com/en/articles/3758225-how-to-review-disputes
Source URL: https://linear.app/docs/issue-property
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/timesheetApprovalReminders.htm
Source URL: https://kb.tempworks.com/help/customer-portal-reviewing-and-approving-webcenter-timecards
Researched: 2026-10-16. Confidence: high for Harvest and Stripe list mechanics; medium for
Instawork's banner (one article).

## Purpose in Granite
Where the agency asks each client to approve a pay period's hours (SPEC §10), sees who has approved,
who has not, and which shifts a client disputed.

## Hierarchy
1. **View header:** "Client approvals"; the pay period chooser (Harvest timeframe) on the right.
2. **Disputes banner** (Instawork) when any shift is disputed: the count and a link that filters
   the list to disputed requests.
3. **Filter chips** (Harvest status filter; in the URL): status, client.
4. **Rows, one per client with hours in the period**, grouped by status in a fixed order (Linear
   category order): Disputed, Not sent, Waiting, Approved. Each row: client, approver (name and
   email, or "No approver yet"), shifts and hours in the period, status badge with a tooltip
   (Stripe), last activity (sent, reminded, approved) with its time.
5. **Row actions** (Harvest per-row actions; Stripe ⋯ menu): Send for approval (Not sent), Send a
   reminder (Waiting), Open; in the row's ⋯ menu, **Approval required before payroll** on or off
   for the client (TempWorks: "every client may be set up differently"; slice e), audited. A client
   that requires approval shows it beside its name.

## Interactions
- A row opens `/approvals/[id]` for that client and period (Stripe: row opens the detail page). A
  client never sent a request opens the send dialog instead.
- Send for approval: a dialog with the approver's name, email and language, prefilled from the
  client's last approver (Stripe's send-invoice dialog prefills the customer's email); shows how
  many shifts and hours will be sent; Send. Not offered while any of the client's shifts still need
  review (it says how many, with a link to Review hours).
- Send a reminder: only to requests still waiting (Harvest: reminders go only to those who have not
  acted; Bullhorn One: reminders only for submitted time); logged on the request's history.

## States
- Empty (no hours in the period): empty-state component with a link to Convert timesheets.
- No results for the filters: empty-state component with clear-filters.
- Loading skeleton; error alert with "Try again".

## Never copy
Harvest's, Stripe's, Instawork's or Linear's wording, icons, colors or logos.

## Look (decision 0029, from the products' own screenshots)
Stripe's list: the title with the pay period on the right, the filters, then the table full width; each client's state as a tinted badge.

## Loading and errors (slice o)
- Loading: the page's outline in the list shape (`_components/loading.md`); buttons that start
  work show a spinner in place of their icon (Primer Button `loading`).
- A failure: the frame stays; the failed content's place says so with "Try again"
  (`_components/error.md`).

Deviations allowed: none
