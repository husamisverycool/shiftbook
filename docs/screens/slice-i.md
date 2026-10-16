# Slice (i) screens compared with their pattern files

Captured 2026-10-16 in demo mode (English, 1440×900; Spanish copies start with `es-`). ✓ = matches
the pattern file.

The data behind them: Prairie Line bills overtime at straight time from the week of October 5; its
week is run (Marcus Bell 46 h, Anita Patel 24 h, machine operators in Illinois, class 3632). Demo
rates: Illinois employer taxes 11.70%, workers' comp 3632 $3.00 per $100 (an example), pay day 5
days after the period. By hand: billed $1,855.00 − pay $1,332.25 − burden $194.20 = $328.55
(17.7%); overtime premium not billed $54.75 — the numbers on the screens.

## Margin — `docs/patterns/margin.md` (Stripe Billing analytics; Stripe home; Brex Reports and Home; Mercury Insights; TempWorks Gross Profit Summary)
Screens: `slice-i/i01-margin-empty.png`, `i02-margin-overview.png`, `i03-metric-dialog.png`,
`i04-margin-line-explained.png`, `i05-margin-by-recruiter.png`, `i06-margin-by-week.png`,
`i07-margin-custom-period.png`, `es-i02`, `es-i03`, `es-i04`, `es-i05`.
- ✓ H1 "Margin"; at the right the period (Last 4, 13 (default) or 52 weeks, or chosen dates —
  `i07`), Export (Summary CSV, Lines CSV) and Margin settings.
- ✓ Tabs Overview · Overtime not billed · Cash floating, keeping the period in the address.
- ✓ Metric cards: Billed, Pay, Estimated burden, Gross margin, Margin %, Overtime premium not billed,
  Cash floating; the first five open how they are worked out (`i03`), the last two open their tabs.
- ✓ Weekly chart of gross margin, with the week's numbers on hover and in a table for screen readers.
- ✓ Group by Client · Worker · Recruiter · Branch · Week and Sort by gross margin or margin %, in the
  address (`i05`, `i06`); "None" collects rows without a recruiter or branch.
- ✓ Table: name, hours, billed, pay, estimated burden, gross margin, margin %, a totals row; each
  header says its formula on hover. A row opens its lines; a line opens its pay and bill lines with
  each pay line's burden worked out (`i04`).
- ✓ Empty: no week with files in the period, with a link to Convert timesheets (`i01`).
- ✓ G then M opens it (the browser test uses it); the sidebar shows Margin to the Owner and the
  accountant only.
- Not captured: "Burden incomplete" (the integration test removes the tax rates and checks the
  count) and the line for other roles (the demo signs in as the Owner).

## Overtime not billed — `docs/patterns/margin/overtime.md` (Bullhorn Gross Margin Report; TempWorks Gross Profit Detail)
Screens: `slice-i/i08-overtime-not-billed.png`, `es-i08`.
- ✓ The summary line (overtime paid, not billed at the multiplier, premium not billed).
- ✓ One row per client, worker and week: overtime paid, at the multiplier, at straight time, not
  billed, premium not billed, the client's terms; totals in each column; a row opens its explain
  string and the run's pay and bill lines with theirs (`i08`).
- States: no overtime paid / all billed at the multiplier say so (unit and integration tests).

## Cash floating — `docs/patterns/margin/cash.md` (Xero short-term cash flow; QuickBooks Online cash flow planner)
Screens: `slice-i/i09-cash-floating.png`, `es-i09`.
- ✓ Cards: floating today; the next pay date and its payroll (marked Estimate when no run exists for
  it); expected in by then; floating after that payroll, each saying how it is worked out.
- ✓ By client, only what is floating: payroll paid, collected for it, floating, days to pay; a row
  opens its weeks with their pay dates. "Floating after that payroll" says its sum in words; an
  invoice pays back only its own week; invoices past their expected date are named apart.
- States: nothing floating says so (integration test).

## Margin settings — `docs/patterns/settings/margin.md` (Bullhorn workers' comp codes; TempWorks codes and Initial Burden; Gusto pay schedule)
Screens: `slice-i/i10-margin-settings.png`, `i11-add-wc-rate.png`, `es-i10`, `es-i11`.
- ✓ "Settings" above, H1 "Margin settings"; Employer taxes (state or "Any other state", rate %,
  from, to, what it includes) with Add rate; Workers' comp (state, class code, description, rate per
  $100, from, to) with Add rate, and the overtime-premium choice from a date; Pay day from a date;
  each section says when it was last changed and by whom.
- ✓ Add rate: the section's fields and From (`i11`); rates take four decimals and class codes twelve
  characters; the rate before ends the day before (the browser test adds Illinois 3632 at $5.00 and
  sees two rows and the margin change). The pay day says it applies to periods ending from its date.
- ✓ No rate yet / a class code on a rate card with no rate today: says the burden counts it as zero.
- Read only for the accountant (not captured: the demo signs in as the Owner).

## Placement recruiter and job order branch — `assignments.md`, `job-orders/[id].md`
Screens: `slice-i/i12-assignment-recruiter.png`, `i13-job-order-branch.png`,
`i14-job-order-edit-branch.png`.
- ✓ The assignment side panel's Recruiter (saves when chosen; the browser test clears Anita's and
  sees her margin move to None).
- ✓ The job order's Branch in its details and in the Edit form.

## App frame — `docs/patterns/_layouts/app.md`
Screen: `slice-i/i15-shortcuts.png`.
- ✓ Margin in the sidebar and G then M in the shortcuts; Margin settings in the agency menu.

## Differences found and what was done
- The tab links first used the muted text color, which failed the contrast check; they now use the
  tabs' own colors.
- A line's margin % first showed "—"; it now shows the line's own percentage.
- "Last changed" first read the audit log, which outlives a demo reset; it now reads the rates' own
  rows (and settings changes made since the settings were written).
- The client's terms column was cut off at 1440 px; it now wraps.

## Second-opinion review (money arithmetic), fixed with tests
1. A corrected week counted twice: margin, overtime and cash now read each period's latest paid
   version (a correction computes the whole period again), and cash counts payments on every
   version's invoices.
2. A rate card starting mid-week left the week's lines without a class: the card in force on the
   line's first day of work is used, else one starting later that week.
3. The projection let one invoice's margin pay for other weeks: each expected invoice now counts only
   against its own period; invoices past their expected date are shown apart.
4. A changed pay day moved past pay dates: each period uses the pay day in force on its last day.
5. Cash listed clients with nothing floating: only floating rows are listed.
6. The accountant could change a job order's branch: job order changes are refused for the
   read-only accountant.
7. Rates were limited to two decimals and class codes to ten characters: four decimals and twelve.
- Nits: "burden incomplete" counts pay lines; the overtime premium share comes from each line's
  overtime rule; the overtime row shows the run's lines; the CSV speaks the page's language; the
  cash sums are worded in both languages; the recruiter picker goes back when a save fails; a chosen
  period is at most two years.
