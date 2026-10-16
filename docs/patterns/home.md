# Pattern: Home (`/`)

Status: adopted — decision 0029 (2026-10-16, revised after the owner's review); SPEC §26
"Setup/onboarding checklist" and "Analytics dashboard"
Reference product and screen: Stripe Dashboard Home; Shopify Polaris setup guide
Source URL: https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights
Source URL: https://docs.stripe.com/dashboard/basics
Source URL: https://shopify.dev/docs/api/app-home/patterns/compositions/setup-guide
Researched: 2026-10-16 from the products' own screenshots (`docs/research/design-gravity-slice-l.md`
part C). Confidence: high for the parts and their order (Stripe's screenshot shows "Today" then
"Your overview"; Polaris puts the setup guide on the homepage).

## Purpose in Shiftbook
The first page after signing in: where to begin (a setup guide that walks a new agency — or a
stranger in the demo, SPEC §24 — through a week), the week now, what needs someone, and the past
quarter at a glance.

## Hierarchy
1. **Setup guide** (Polaris, as its screenshot shows it; for the Owner, while not hidden): a white
   card with "Setup guide", hide (×) and collapse (⌃) buttons on the right, one intro line, "N of M
   steps done", then the steps in a bordered box with dividers — each a checkbox (ticked by
   Shiftbook when the step has happened, never by hand: Polaris "Mark tasks as complete when
   merchants finish them"), its title and a chevron. One step open at a time, the first not done:
   its one-line description and its button. The steps:
   1. Choose the payroll system → payroll file settings. Done: a payroll system is chosen.
   2. Add clients and job orders → Job orders. Done: a worker is on an assignment.
   3. Convert a week's timesheets → the pay period's upload. Done: a pay period not paid before
      Shiftbook has a timesheet or hours. (In the demo it points at "Use the sample timesheets".)
   4. Ask a client to approve the hours → Client approvals. Done: an approval request was sent.
   5. Approve the week and create the files → the pay period. Done: a week has its files.
   6. Match a bank file to the invoices → Bank. Done: a bank file was imported. (In the demo it
      points at "Use the sample bank file".)
   7. Look up a worker's SSN → Workers. Done: the Owner looked one up since the agency last started
      over.
2. **Today** (Stripe Home "Today"): the heading, large and bold, over a hairline. On the left the
   pay period's figures as plain type — hours this pay period (its dates under it), workers with
   hours, and the period's status — and under them its hours by day as bars on hairline gridlines,
   the gridlines' values on the right. On the right a column of figures separated by hairlines, each
   with "View" beside its label (Stripe's balance and payouts): open receivables (with the invoice
   count), overdue (with the invoice count), compliance (overdue · due soon).
3. **Needs attention** (Stripe Home "surfaces important notifications"): a heading, then one row per
   notice between hairlines — its status badge, one sentence, and the place it is handled — most
   urgent first: the pay period's state, disputed shifts, overdue duties, overdue invoices, clients
   that must approve and were not asked, duties due soon, bank lines for review, approvals waiting.
4. **Your overview** (Stripe Home), for the Owner and the accountant (as Margin): a bold heading; the
   date range as a pill ("Date range | Last 13 weeks"); then white cards on a light grey band — billed,
   gross margin, hours paid — each with its title, the figure, the previous 13 weeks under it, a line
   week by week on hairline gridlines, and "View more" to Margin.

## Interactions
- Each step's button, each "View", each notice and each "View more" opens its page.
- Hide guide keeps it hidden on this browser; "Setup guide" beside Today brings it back.
- G then H opens Home (`_layouts/app.md`).

## States
- A role that cannot do the steps (coordinator, Billing, the accountant) sees no guide.
- No pay period yet: Today says so.
- Figures for a new agency read zero; the charts draw a flat line.

## Never
Stripe's or Shopify's wording, icons, illustrations or colors; boxed figure cards.

Deviations allowed: none
