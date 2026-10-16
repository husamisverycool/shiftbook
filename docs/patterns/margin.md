# Pattern: Margin (`/margin`)

Status: adopted — slice (i) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: Stripe — Billing analytics (an overview of metrics, each opening its
detail; filter and group; export the summary table or the underlying rows; configure the metric
definitions); Stripe Dashboard home charts (a date range control); Brex — Reports, Spend (a weekly
graph; the same data split by a chosen dimension; one filter for the whole page; download); Brex —
Home (each metric opens how it is calculated); Mercury — Insights (Overview and other tabs; the time
frame at the top right); TempWorks — Gross Profit Summary (group by branch, customer or week; sort by
gross profit or gross profit %); Bullhorn — User Scorecard (by recruiter)
Source URL: https://docs.stripe.com/billing/subscriptions/analytics
Source URL: https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights
Source URL: https://brex.com/support/brex-reporting
Source URL: https://www.brex.com/support/home-page
Source URL: https://mercury.com/blog/introducing-insights
Source URL: https://kb.tempworks.com/help/gross-profit-summary-report
Source URL: https://kb.bullhorn.com/bhone/Content/BH1/Topics/bh1CanvasUserScorecardReport.htm
Researched: 2026-10-16 (`docs/research/margin-slice-i.md` §1, §5). Confidence: high for the
metric-to-detail, group-by and export pattern (Stripe, Brex, TempWorks); medium for the exact
placement of the time frame (Mercury's help article was read only as a snippet).

## Purpose in Shiftbook
What each week's work earned after paying the workers and the estimated employer costs (SPEC §15):
gross margin = billed − pay − estimated burden, by client, worker, recruiter, branch and week, every
amount traceable to its lines and their explain strings. For the Owner and the accountant.

## Hierarchy
1. **View header:** H1 "Margin"; at the right the **period** (Last 4 weeks · Last 13 weeks (default) ·
   Last 52 weeks · Custom from–to), **Export** (Summary CSV · Lines CSV), and **Margin settings**
   (Stripe Configure).
2. **Tabs** (Mercury Insights): Overview · Overtime not billed · Cash floating (`margin/overtime.md`,
   `margin/cash.md`), in the address.
3. **Metric cards** (Stripe overview; Brex Home): Billed, Pay, Estimated burden, Gross margin, Margin %,
   Overtime premium not billed, Cash floating. The first five open how they are worked out (the
   formula and the period's numbers); the last two open their tabs.
4. **Weekly chart** (Brex weekly graph): gross margin per week of the period as bars, the week's
   billed and margin on hover and in an accessible table.
5. **Group by** (Brex split; TempWorks Group By): Client · Worker · Recruiter · Branch · Week, and
   **Sort** by Gross margin or Margin % (TempWorks Sort By), in the address.
6. **Table:** one row per group: name, hours paid, billed, pay, burden, gross margin, margin %; a
   totals row. Each column header says its formula. A row opens its lines (Stripe Explore): worker,
   client, week, hours, billed, pay, burden (with its explain string), margin.

## Interactions
- Changing the period, grouping or sort recomputes the page; all three live in the address.
- Export Summary CSV downloads the table as shown; Lines CSV downloads every line in the period
  (Stripe: summary table or data results).
- Keyboard: G then M opens the page.

## States
- **Nothing in the period:** no week with files made — an empty state with a link to Convert
  timesheets.
- **Burden incomplete:** a line names how many pay lines have no workers' comp or tax rate, with a
  link to Margin settings; their burden counts as zero.
- **Not for this role:** for anyone but the Owner and the accountant, a line saying who can see margin.

## Never copy
Stripe's, Brex's, Mercury's, TempWorks' or Bullhorn's wording, icons, colors or logos.

## Look (decision 0029, from the products' own screenshots)
The figures as plain type in a row over a hairline, as Stripe's app overview and Mercury's Insights set them (https://docs.stripe.com/stripe-apps/patterns/chart-layout, https://mercury.com/blog/introducing-insights); Overview, Overtime not billed and Cash floating as underline tabs.

Deviations allowed: none
