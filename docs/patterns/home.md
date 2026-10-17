# Pattern: Home (`/`)

Status: adopted — decision 0029 (2026-10-16, revised after the owner's review); SPEC §26
"Setup/onboarding checklist" and "Analytics dashboard"
Reference product and screen: Stripe Dashboard Home; Shopify Polaris setup guide
Source URL: https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights
Source URL: https://docs.stripe.com/dashboard/basics
Source URL: https://shopify.dev/docs/api/app-home/patterns/compositions/setup-guide
Source URL: https://shopify.dev/docs/api/app-home/polaris-web-components/feedback-and-status-indicators/banner
Source URL: https://vercel.com/docs/plans/pro-plan/billing
Researched: 2026-10-16 from the products' own screenshots (`docs/research/design-gravity-slice-l.md`
part C). Confidence: high for the parts and their order (Stripe's screenshot shows "Today" then
"Your overview"; Polaris puts the setup guide on the homepage).

## Purpose in Granite
The first page after signing in: where to begin (a setup guide that walks a new agency — or a
stranger in the demo, SPEC §24 — through a week), the week now, what needs someone, and the past
quarter at a glance.

## Hierarchy
0. **Billing banner** (decision 0036; only when there is something to say), at the very top of the page,
   outside the sections (Polaris's banner: page-wide messages at the top; a heading, one or two plain
   sentences, one action; not dismissible while it must be acted on; Vercel: an overdue account keeps
   its data but cannot change things until it pays):
   - **Changes are paused** (critical tone): one sentence on why — the free days are over with no
     subscription, the last payment failed, payments failed and Stripe stopped trying, the trial ended
     without a card, the first payment was not completed, the subscription was canceled, or it is not to
     Granite's plan (decision 0036, security review) — then that
     everything can still be read and downloaded and nothing is deleted. After a change was refused, a
     first sentence says that change was not made. For the Owner: **Go to Billing**. For everyone else:
     ask the agency's Owner to restart it in Settings › Billing (no button).
   - **Free days end soon** (info tone; the last 7 days of the agency's free days with no
     subscription): for the Owner only, **Start subscription** → Billing.
1. **Setup guide** (Polaris, as its screenshot shows it; for the Owner, while not hidden): a white
   card with "Setup guide", hide (×) and collapse (⌃) buttons on the right, one intro line, "N of M
   steps done", then the steps in a bordered box with dividers — each a checkbox (ticked by
   Granite when the step has happened, never by hand: Polaris "Mark tasks as complete when
   merchants finish them"), its title and a chevron. One step open at a time, the first not done:
   its one-line description and its button. The steps:
   1. Choose the payroll system → payroll file settings. Done: a payroll system is chosen.
   2. Add clients and job orders → Job orders. Done: a worker is on an assignment.
   3. Convert a week's timesheets → the pay period's upload. Done: a pay period not paid before
      Granite has a timesheet or hours. (In the demo it points at "Use the sample timesheets".)
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
- Changes paused (decision 0036): the banner above; the setup guide, figures and notices stay; every
  button that would change something is hidden, as for the accountant.
- A role that cannot do the steps (coordinator, Billing, the accountant) sees no guide.
- No pay period yet: Today says so.
- Figures for a new agency read zero; the charts draw a flat line.

## Never
Stripe's or Shopify's wording, icons, illustrations or colors; boxed figure cards.

## Look (Stripe's own Home screenshot, https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights)
"Today" over a hairline; the figures and the chart on the left, the right column of figures with "View"
beside each label, hairlines between them. "Your overview" bold, the date range pill, then white cards on
a light grey band: the title, the figure, the previous period muted, the chart with its gridline values on
the right and the first and last dates under it, and "View more" at the right of the card's foot with no
rule above it. Gridline values carry their unit ("$25K", "500h", and "0h" or "$0" at zero), written the
same way in both languages.

## Loading and errors (slice o)
- Loading: the page's outline in the dashboard shape (`_components/loading.md`); buttons that start
  work show a spinner in place of their icon (Primer Button `loading`).
- A failure: the frame stays; the failed content's place says so with "Try again"
  (`_components/error.md`).
- Not found (a record that does not exist, an address that matches no page): the frame stays,
  "Page not found" and a button to Home (`_components/error.md`).

Deviations allowed: none
