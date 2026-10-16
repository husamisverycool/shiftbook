# Slice (i) — Margin analytics

Status: GO under the owner's "just keep going … I don't need to approve anything for you"
(2026-10-16). Choices the research left open are listed under "Decisions made for the owner"; the
owner can reverse any of them.
Contract: SPEC.md §2 (the Owner sees margin; the accountant reads everything), §4 (Branch, User,
RateCard WC class, Worker WC state), §5 (integer money, round once, data tables with effective
dates, explain strings), §15 (margin analytics). Research with sources: `docs/research/margin-slice-i.md`.

## Goal (what the owner can do at the end)
See what each week's work earned after paying the workers and the estimated employer costs: gross
margin = billed − pay − estimated burden (employer taxes + workers' comp by class), by client,
worker, recruiter, branch and week, every amount explained. See the overtime the agency paid but did
not bill (and why: the client's overtime terms). See the cash the agency is floating — payroll paid
for work its clients have not paid for yet — and what the next payroll will add. Set the burden
rates, each with the date it applies from.

## Done means (evidence I will paste)
1. `pnpm test` (unit + integration + goldens), `pnpm typecheck`, `pnpm lint` — real output, green.
2. Playwright, English and Spanish: after a week's files, the Owner opens Margin (G then M), sees the
   week's billed, pay, burden and margin by client, groups by worker, recruiter, branch and week,
   opens a row's lines with their explain strings, exports the CSV; sees overtime not billed for the
   client that bills overtime at straight time; sees cash floating and the projection; changes a
   workers' comp rate from a date and sees the burden change. Accessibility checks on every screen.
3. Screenshots of every new screen and state, compared with the pattern files.
4. A second-opinion review of the burden, margin, leakage and floating arithmetic, fixed.
5. Unit tests with hand arithmetic: burden on REG, OT 3/2 and DT 2/1 lines (premium excluded and
   not), a missing rate, a negative correction line, a rate changed mid-period; each leakage reason;
   floating with partial payments; the projection.

## Steps (tests first)
1. Data: burden tax rates by state and workers' comp rates by state and class (effective-dated,
   never edited in place); the overtime-premium setting; the pay day; a recruiter on assignments; a
   branch on job orders; demo values.
2. Pure arithmetic: burden per pay line; margin rows and groups; leakage rows; floating and the
   projection — each with its explain string.
3. Queries and services: the margin view for a period and grouping, leakage, cash, burden settings
   (add a rate from a date; the earlier one ends the day before), recruiter and branch changes.
4. Screens per pattern files; sidebar; recruiter and branch fields.
5. Browser tests, accessibility, screenshots; second-opinion review; fixes.

## Screens and documents, with references
| Screen | Pattern file | Reference |
|---|---|---|
| Margin dashboard (`/margin`) | `margin.md` (new) | Stripe Billing analytics (metric cards that open a detail; group and filter; export summary or rows; configure the definitions); Stripe home charts (date range, time unit); Brex Reports (weekly graph, split by dimension, one filter for the page); TempWorks Gross Profit Summary (group by branch, customer, week; sort by GP or GP %) |
| Overtime not billed (`/margin/overtime`) | `margin/overtime.md` (new) | Bullhorn Gross Margin Report (hours paid beside hours billed for regular, OT and DT) |
| Cash floating (`/margin/cash`) | `margin/cash.md` (new) | Xero short-term cash flow (invoices expected in by a date, a projected balance); QuickBooks Online cash flow planner (projections that say why) |
| Margin settings (`/settings/margin`) | `settings/margin.md` (new) | Bullhorn Workers' Compensation Codes (state, code, name, rate, start, end; end-dated, never deleted); TempWorks worker comp codes (per state) and Initial Burden; Gusto pay schedule (the pay date after the period) |
| Assignments side panel: recruiter | `assignments.md` (updated) | Bullhorn placement Recruiter field (User Scorecard groups by recruiter) |
| Job order page: branch | `job-orders/[id].md` (updated) | TempWorks branch on the order; Bullhorn "Job owner" branch source |
| Sidebar | `_layouts/app.md` (updated) | Linear sidebar |

## Decisions made for the owner (2026-10-16, under "keep going"; any can be reversed)
- I1 **What counts:** the pay and bill lines of runs whose files were made (exported or closed),
  regular and correction (correction lines are signed differences, so they add), each in the week
  of its `workweek_start`.
- I2 **Burden per pay line, rounded once:** employer taxes (a percentage for the worksite's state,
  in force on the week's first day) on the amount, plus workers' comp (a rate per $100 of pay for
  the worker's workers' comp state, else the worksite's, and the rate card's class) on the amount
  less the overtime premium (one third of time and a half, one half of double time) while the
  agency's setting says the premium is excluded (most states; on by default). One exact fraction,
  rounded half up once, with the arithmetic in the explain string. A missing rate counts as zero and
  the row says "burden incomplete" with a link to the settings; it never blocks anything.
- I3 **Rates are kept by date:** a new rate starts on a date and ends the one before (Bullhorn);
  rates are read when the page is shown, so a rate corrected back to January changes past weeks
  (TempWorks recomputes after a FUTA credit reduction). Only the Owner changes them.
- I4 **Margin row:** per assignment and week: hours paid, billed, pay, burden, gross margin
  (billed − pay − burden) and margin % (margin ÷ billed, to one decimal, half up; "—" with nothing
  billed). Every column header says its formula (vendors mean different things by "gross profit").
- I5 **Group by** client (default), worker, recruiter, branch or week; "None" collects rows without a
  recruiter or branch so the totals tie. Sort by margin or margin %.
- I6 **Period:** the last 13 weeks by default (Mercury's three months, week-aligned), or 4 or 52, or
  chosen dates; weeks start on the agency's workweek start.
- I7 **Overtime not billed:** per client, worker and week: overtime and double time paid; billed at
  the multiplier; billed at straight time; not billed; and the premium the agency paid on what was
  not billed at the multiplier (the pay's premium share, pro rata by minutes), with the reason from
  the client's terms.
- I8 **Cash floating:** for each run and client whose pay date has passed (the period's last day +
  the agency's pay day setting, 5 days in the demo): gross pay − payments applied to that run's
  invoices for that client, never below zero, summed. Gross pay only (employer taxes are an open
  question).
- I9 **Projection:** the next pay date; that payroll (the run for it if made, else the average of the
  last four paid weeks, said to be an estimate); the open invoices expected in by then (issued + the
  client's average days to pay, else the due date; Xero's expected dates); floating then = now +
  payroll − expected cash, never below zero, with its explain string.
- I10 **Recruiter** on the assignment (any user of the agency); **branch** on the job order (the
  agency's branches). Both optional.
- I11 **Roles:** the Owner and the Read-only accountant see Margin (SPEC §2); only the Owner changes
  the rates and the pay day. Recruiter and branch are changed by anyone who manages placements and
  job orders, never the accountant (who changes nothing). Others do not see Margin in the sidebar;
  its address says who it is for.
- I12 **Demo:** federal FICA 7.65% and FUTA 0.6% plus each state's new-employer unemployment rate
  (CA 3.4% + ETT 0.1% → 11.75%; IL 3.45% for temporary help → 11.70%; MA 2.42% → 10.67%), workers'
  comp examples 8292 $4.00, 3632 $3.00, 9079 $2.50 per $100 (labeled examples, not real rates), two
  branches and two recruiters (invented names), pay day 5 days after the period ends.
- I13 **Sidebar:** Margin (G then M), shown to the Owner and the accountant.

## Open questions (for the owner when convenient; from the research)
1. When a worker is placed, who gets credit for the profit: the person who found the worker, or the
   person who looks after the client?
2. Do you have more than one office? If so, does each client belong to one office?
3. What day do you pay workers for a week's work?
4. Can you share your workers' comp rate per $100 of pay for each job code from your policy?
5. Does your workers' comp insurer charge on the extra half of overtime pay?
6. May we start with federal taxes plus your state's new-business unemployment rate until you give
   us yours?
7. Should "cash you are floating" include the employer taxes you pay with payroll?
8. Are there other costs per hour you want counted, such as benefits?
