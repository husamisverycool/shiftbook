# Research I: Margin analytics (SPEC §15)

Prepared 2026-10-16 for slice (i). Confidence: **High** = I read the official page today; **Medium** = official page seen only as a search snippet, or thin; **Low** = third-party or vendor blog. We copy hierarchy and interactions only, never wording, names or colors.

**Could not read:** Mercury help center and mass.gov (Cloudflare/403); WCIRB class lookup (403); WinTeam help (redirects to a login). **No public docs found** for Avionté (help center is login-only), Top Echelon/Big Biller, Staffing Engine or Erecruit margin reports. Ceipal is marketing copy only.

## 0. What the schema has today (wt-d)

- `pay_lines` and `bill_lines`: run, worker, assignment, `workweek_start`, `type`, minutes, rate, `amount_cents`, `rule_id`, explain. Bill lines also carry `client_id`.
- OT/DT bill lines record the client's terms in `rule_id`: `bill_overtime_multiplier`, `_straight`, `_own_sites_straight`, `_not_billable`. The last is a $0 line that still has minutes (`packages/rules/src/engine.ts` ~800–825).
- Also: `rate_cards.wc_class_code`, `workers.wc_state`, `worksites.state`, effective-dated `agency_settings`, and from slice h `invoices.pay_run_id`, `payments` and `payment_matches`.
- **Gaps:**
  - No recruiter field.
  - A `branches` table exists, but nothing references it.
  - No pay date for a run.
  - No burden or WC rate tables.

## 1. Staffing margin reports

- **TempWorks: Gross Profit Summary** (High). https://kb.tempworks.com/help/gross-profit-summary-report (text from its PDF export, https://kb.tempworks.com/help/pdfexport/id/59c16707ec161cbb1e2bf1ef)
  - "gross profit by branch and customer within a selected date range"; "must be run after you close the week".
  - Filters:
    - weekend-bill date range, Branch (multi-select), Customer, Sales Team, assignment reps;
    - **Payroll Costs Filter**: Gross, Worker Comp Costs, Employer Taxes, Benefits, Branch Burden, One Time Adjustments and others;
    - **Flat Burden %**: "(Specified % * Gross on the transaction)".
  - **Group By:** Branch, Customer, Pay code, Sales Team, Shift, Supervisor, **Weekend Bill**, Asg Entered By, Asg Service Rep.
  - Example: GP = "total bill – (gross + employer taxes + worker comp costs)".
- **TempWorks: Gross Profit Detail** (High). https://kb.tempworks.com/help/gross-profit-detail-report
  - Group by Assignment, Employee, Order, Invoice and others.
  - **Sort By** group name, GP or GP %.
- **Bullhorn: Gross Margin Report** (High). https://kb.bullhorn.com/bhone/Content/BH1/Topics/bh1CanvasGrossMarginReport.htm
  - Filters: hours-worked date range, client, **Burden (percent)**.
  - Columns:
    - placement identity;
    - **for each of Regular, OT and DT:** Bill Rate, Bill Amount, Hours Billed, Pay Rate, Pay Amount, Hours Paid;
    - Workers Comp Premium, Gross Sales, Gross Wages, Burden, Gross Margin.
  - GM = bill − (1 + burden) × pay.
- **Bullhorn: User Scorecard** (High). https://kb.bullhorn.com/bhone/Content/BH1/Topics/bh1CanvasUserScorecardReport.htm
  - Groups by **Account Manager or Recruiter**; ranked by gross profit.
  - Columns: hours, revenue, GP, GP %, GM, GM %, and counts of employees, customers and assignments.
  - GP = "Billable charge total - payable charge total"; GM = "Bill amount - ( pay + burden)".
- **Bullhorn: Gross Margin by Branch** (High). https://kb.bullhorn.com/bhone/Content/BH1/Topics/bh1CanvasYearlyCurrentGrossMarginByBranch.htm
  - **Branch Source: "Job owner or candidate owner"**; burden "default value is 20".
- **Bullhorn: Terminology** (High). https://kb.bullhorn.com/bhone/Content/BH1/Topics/terminologyAlignment.htm
  - GP is dollars and GM is a percentage: "(Revenue - (Payable Charges * (1 + Estimated Burden)))/Revenue".
  - Markup: "Pay Rate * 1.55 = Bill Rate".
  - **The vendors use "gross profit" for different things, so every Shiftbook column should state its formula.**
- **Crelate** (Medium). https://help.crelate.com/en/articles/5749426-burden-rate-and-burden-percentage
  - Burden ($ or %) "flow[s] to your assignments" for GM reporting. No formula is documented.

## 2. Burden settings

- **TempWorks: worker comp codes** (High). https://kb.tempworks.com/help/enterprise---adding-updating-worker-comp-codes
  - Fields: Code, Description, Percentage ("Used for calculations"), Base Percentage, hierarchy, **State**, Active.
  - One code per state, because rates "usually differ from state to state". Rates are reviewed yearly; no effective-date procedure is documented.
- **TempWorks: Gross Profit Calculator** (High). https://kb.tempworks.com/help/beyond-gross-profit-calculator · https://kb.tempworks.com/help/enterprise-gross-profit-calculator
  - Initial Burden "by default includes FICA, FUTA, MED, SUTA, & State FUTA". The SUTA state comes from the worksite.
  - Plus Branch Burden and a customer-specific Additional Burden; Total = the sum.
  - GP % = "(Bill Rate - Pay Rate - (Pay Rate * Initial Burden) - (Pay Rate*Workers Comp)) / Bill Rate".
  - "an approximation, and not an exact figure."
- **TempWorks: FUTA credit reduction** (High, 2026-04-01). https://kb.tempworks.com/help/futa-credit-reduction-overview-and-process
  - Estimate "California: 5.3% (including a 3.8% BCR Add-On)".
  - Recalculated back to January 1, and the change shows in "tax and gross profit reports". **So burden must be effective-dated and recomputable.**
- **Bullhorn: Workers' Compensation Codes** (High). https://kb.bullhorn.com/ats/Content/BHATS/Topics/managingWorkersCompensationCodes.htm
  - "State, Code, Name, Rate, Start, End". Codes are end-dated, never deleted.
- **Bullhorn: Burden Rates** (High). https://kb.bullhorn.com/ats/Content/BHATS/Topics/understandingBurdenRates.htm
  - Default "Pay Rate x 0.14 + Worker's Comp"; custom percentages per employee type.
- **QuickBooks Online project labor cost** (High). https://quickbooks.intuit.com/learn-support/en-us/help-article/regular-payroll/track-hourly-labor-costs-profitability-project/L9ZxBA4sn_US_en_US
  - "wages and other direct costs like taxes and workers' comp insurance".
- **WC excludes the overtime premium in most states** (Medium).
  - Thomson Reuters Accounting CS says "most states exclude" it. https://www.thomsonreuters.com/en-us/help/accounting-cs/set-up-employees-and-payroll-items/workers-compensation-calculations.html
  - LWCC (an insurer): time and a half → "deduct 1/3 of the overtime amount"; double time → ½. https://lwcc.com/resources/overtime-defined
  - No list of state exceptions was found.

## 3. Overtime leakage

No product report by this name was found. Nearest references:

- **Bullhorn Gross Margin Report** (High, above): Hours Paid next to Hours Billed for Reg, OT and DT.
- **WinTeam "Non-Billed Analysis"** (Medium, snippet only; login now required). https://help.teamsoftware.com/Documentation/WinTeam/Personnel-Scheduling/Reports/Non-Billed-Analysis.htm
  - "Billed OT and Non-Billed OT hours"; "the hours have to be PAID".
- **Teambridge blog** (Low, vendor, 2026-05-26). https://www.teambridge.com/blog/unbilled-overtime-staffing-multi-client-margin-leak
  - Causes: multi-client weeks; contracts that bill OT at the regular rate.
  - Audit: paid minus billed OT hours per worker-week, by client.
  - KPI: **OT Bill Ratio = OT hours billed ÷ OT hours paid**.

The run already blocks pay/bill minute mismatches. So in Shiftbook, leakage can come only from the client's terms, and the `bill_overtime_*` rule id names which term.

## 4. Cash floating and the projection

No staffing product found shows "payroll paid − client cash collected for that work". Nearest references:

- **Xero: short-term cash flow** (Medium, product page). https://www.xero.com/accounting-software/analytics/cash-flow/
  - Horizons of 7 to 180 days, weekly or daily; built from invoices due, bills due and repeating items.
  - Shows a projected end balance; "add expected payment dates to overdue invoices"; scenarios.
- **QuickBooks Online: cash flow planner** (High). https://quickbooks.intuit.com/learn-support/en-ca/help-article/budget-forecast-reports/use-cash-flow-planner-quickbooks-online/L2l59mIqe_CA_en_CA
  - "Manage projections"; suggestions that say why and can be accepted or rejected; a cash threshold; PDF export.
- **Check: Cash requirement report** (Medium, snippet). https://checkhq.helpkit.so/running-payroll/4Msp39koQowy1dyFu9tZCK/cash-requirement-report/4AgkjjdTJ4pNmCLQNuXqeP
  - What one payday will debit: net pay plus remitted taxes, by worker.
- **Advance Partners** (Low, factoring vendor). https://www.advancepartners.com/blog/why-staffing-agencies-struggle-with-cash-flow-even-when-theyre-profitable/
  - On Net 45, "you're carrying roughly six weeks of payroll". Recommends DSO "by client/program".

## 5. Dashboard UI references

- **Stripe: Billing analytics** (High). https://docs.stripe.com/billing/subscriptions/analytics
  - An overview of metrics; each opens a detail page with a chart and a table.
  - **Explore** drills into data points.
  - Filter and group.
  - **Export** either the "Summary table" (respects range, filters, grouping, comparison) or "Data results" (underlying rows).
  - **Configure** changes the metric definitions.
- **Stripe: home charts** (High). https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights
  - Dropdowns for date range, **time unit** and **comparison range**.
- **Mercury: Insights**
  - Blog (High): https://mercury.com/blog/introducing-insights. An Overview tab plus Money in and Money out tabs; filters update charts and tables "instantly".
  - Help (Medium, snippet): https://support.mercury.com/hc/en-us/articles/44277089544084-Insights-page-overview. Default "last 3 full months", time frame "in the top right corner", and a row opens its transactions.
- **Mercury: Transactions page** (High). https://mercury.com/blog/updated-transactions-page
  - Cashflow graph; top five money-in and money-out sources by grouping.
- **Brex: Home** (High). https://www.brex.com/support/home-page
  - Metrics with a period selector (30 days, last month, last quarter, 6 months); each metric is clickable "for calculation details".
- **Brex: Reports > Spend** (High). https://brex.com/support/brex-reporting
  - **Weekly spend graph**; splits by category, user and department; one filter for the whole page; CSV/XLSX/PDF download.
- **Ramp: reporting** (High, but says little about layout). https://support.ramp.com/hc/en-us/articles/6048244057747-Real-Time-Reporting
  - Too thin to be a primary reference.

## 6. Rates useful as demo defaults

| Item | Value | Source | Status |
|---|---|---|---|
| Social Security, employer | 6.2% up to $184,500 (2026) | IRS Pub 15 (2026), https://www.irs.gov/publications/p15 | Official, High |
| Medicare, employer | 1.45%, no cap | same | Official, High |
| FUTA | 6.0% on first $7,000, minus up to 5.4% credit = 0.6% | same | Official, High |
| FUTA, California 2025 | Credit reduced 1.2%, so net 1.8% | EY, https://taxnews.ey.com/news/2025-2281 | Official via secondary, Medium |
| FUTA, California 2026 | ~5.3% reduction (estimate; final November 2026) | TempWorks, §2 | Estimate, Medium |
| CA UI new employer | 3.4% on $7,000; ETT 0.1% on $7,000 | https://edd.ca.gov/en/payroll_taxes/rates_and_withholding | Official, High |
| IL UI new employer | **3.450% for NAICS 56** (temp help; standard 3.350%), on $14,250 | IDES EA-50 2026, https://ides.illinois.gov/content/dam/soi/en/web/ides/ides_forms_and_publications/EA-50_2026.pdf | Official, High |
| MA UI new employer | 2.42%; wage base $15,000 | mass.gov snippet; wage base from a third party | Medium / Low |
| CA WC average | $1.65 per $100 payroll (advisory, from 2026-09-01) | https://www.carriermanagement.com/news/2026/07/14/289962.htm | High |
| WC by class (demo) | 8810 $0.25 · 8292 $4.00 · 9079 $2.50 · 3632 $3.00, each per $100 | none | **Invented for the demo. Not real rates.** |

Notes:
- In NCCI states **8018 is a wholesale store and 8017 a retail store**. **8292** is the storage-warehouse code (Medium; https://www.workerscompensation.com/sponsored-content/nccis-classification-inspection-program-update-top-five-reclassified-codes/).
- California and Massachusetts use their own class systems. Real rates come from the agency's policy.
- Wage-base caps mean a flat percentage overstates FUTA and SUTA late in the year. TempWorks and Bullhorn accept that.

---

## Proposed decisions for the plan

- **I1. Lines counted.**
  - Lines of approved and exported runs, regular and correction (corrections are signed differences, so they simply add).
  - Each line is bucketed by its `workweek_start`.
- **I2. Burden per pay line, rounded once.**
  - `burden_cents = round_half_up((amount × T + wc_base × W) / 1,000,000)`, computed as one exact fraction.
  - **T** = employer tax parts per million (ppm), in force on the workweek start for the worksite state (FICA 76,500 + FUTA + SUTA).
  - **W** = WC ppm for (`workers.wc_state` ?? worksite state, rate-card class). $4.00 per $100 = 40,000.
  - `wc_base` = the amount, except OT × 2/3 and DT × 1/2 while "exclude overtime premium" is on (default on).
  - Explain example: "$300.00 overtime × 11.65% taxes = $34.95; WC on $200.00 (premium excluded) × $4.00/$100 = $8.00; burden $42.95."
  - A missing rate shows "burden incomplete" with a link to settings. It never blocks a run.
- **I3. Burden settings.**
  - Effective-dated rows; end-dated, never edited in place (Bullhorn).
  - Tax components per state (TempWorks Initial Burden).
  - WC rate per state and class.
  - An optional extra % for the agency and per client (TempWorks Branch and Additional Burden).
  - The OT-premium toggle.
  - Totals are computed when read and never stored, so a rate change re-flows (TempWorks FUTA).
- **I4. Margin rows.**
  - One row per (assignment, workweek): Hours, Billed, Pay, Est. burden, Gross margin = bill − pay − burden, Margin % (from totals, half up to 0.1%, "—" when nothing was billed).
  - Each header explains its formula.
- **I5. Groups and filters.**
  - Group by Client, Worker, Recruiter, Branch or Week (TempWorks Group By).
  - Filters: period, client, state, branch, recruiter.
  - Sort by margin or margin % (TempWorks Sort By).
  - A "None" row keeps totals tying.
  - **Add:** `assignments.recruiter_user_id` (Bullhorn Recruiter); `clients.branch_id` with a `job_orders.branch_id` override (TempWorks "Branch on the transaction").
- **I6. Dashboard `/margin`.**
  - Range, time unit and comparison controls (Stripe home).
  - KPI cards: Billed, Pay, Burden, Margin, Margin %, OT not billed, Cash floating. Each opens its detail (Stripe; Brex "calculation details").
  - A weekly margin chart (Brex).
  - The grouped table. A row expands into its lines with explain strings (Stripe Explore).
  - Export the summary or the lines (Stripe).
  - A "Burden settings" link (Stripe Configure).
  - Default period: last 13 weeks, a week-aligned reading of Mercury's 3 months. Needs the owner's OK.
- **I7. Overtime leakage.** One row per (client, worker, week):
  - OT/DT minutes paid, and minutes billed at the multiplier;
  - **leaked minutes**, with the reason from the bill `rule_id`;
  - **premium paid** on leaked minutes (pay × (m−1)/m, pro rata);
  - **not billed** (rate-card OT bill minus billed);
  - OT bill ratio (Teambridge).
  - Amounts are rounded once per row. Paired paid/billed columns follow Bullhorn.
- **I8. Cash floating.**
  - Per (run, client), as of a date: paid = that client's gross pay (± taxes, question 7) once the run's **pay date** has passed; collected = payment matches on that run's invoices.
  - Floating = Σ max(0, paid − collected).
  - Shown as a total, by client (with H7 days to pay) and as a weekly line.
  - **New setting:** pay day = N days after the week ends, effective-dated.
- **I9. Projection.**
  - Next pay date D.
  - Payroll at D = that week's computed run if one exists, otherwise the average of the last 4 paid weeks (labeled as an estimate).
  - Expected cash = open balances whose expected pay date (issued + the client's average days to pay, or the due date) ≤ D (Xero).
  - Projected float = current + payroll − expected cash, with an explain string.
- **I10. Screens.**

  | Screen | Pattern file | References |
  |---|---|---|
  | `/margin` | `docs/patterns/margin.md` | **Stripe Billing analytics** (primary), Stripe home, Mercury Insights, Brex Spend, TempWorks GP Summary |
  | `/margin/overtime` | `docs/patterns/margin/overtime.md` | Bullhorn Gross Margin Report; WinTeam (verify in a browser) |
  | `/margin/cash` | `docs/patterns/margin/cash.md` | Xero short-term cash flow, QuickBooks Online planner, Mercury cashflow graph |
  | `/settings/burden` | `docs/patterns/settings/burden.md` | Bullhorn and TempWorks WC codes, TempWorks burden fields |

  The recruiter and branch fields also need updates to `assignments.md`, `job-orders/[id].md` and `clients/[id].md`.
- **I11. Roles.** Owner and accountant see margin (SPEC §2). The Owner edits settings.
- **I12. Demo.**
  - Seed the official federal, CA and IL rates, plus the invented WC rates labeled "example".
  - The existing straight-time CA client shows leakage; one unpaid invoice shows float.
- **I13. Tests.**
  - Golden hand-arithmetic cases: REG, OT 3/2, DT 2/1, a missing rate, a negative correction, a mid-period rate change.
  - Each leakage reason.
  - Float with partial payments.
  - Second-opinion review per CLAUDE.md.

### Open questions for the owner (one at a time)

1. When a worker is placed, who gets credit for the profit: the person who found the worker, or the person who looks after the client?
2. Do you have more than one office? If so, does each client belong to one office?
3. What day do you pay workers for a week's work?
4. Can you share your workers' comp rate per $100 of pay for each job code from your policy?
5. Does your workers' comp insurer charge on the extra half of overtime pay?
6. May we start with federal taxes plus your state's new-business unemployment rate until you give us yours?
7. Should "cash you are floating" include the employer taxes you pay with payroll?
8. Are there other costs per hour you want counted, such as benefits?
