# Research W: Partner-ready money flows

Prepared 2026-10-17 for Slice W (SPEC §27 item 9: "compute everything, move nothing"). Scope:
onboarding/requirements screens (Stripe Connect), financing-offer screens (Stripe Capital), the
exact fields an embedded-payroll partner needs to pay an hourly W-2 worker (Check, Zeal), earned
wage access (EWA) rules, and what invoice factors ask for.

## How to read this

- **Fetched live 2026-10-17** with Firecrawl. **High** = official doc read in full (often its
  Markdown export); **Medium** = official page read via an extraction query or search excerpt;
  **Low** = vendor blog / third party; **Unverified** = not found.
- Field names below are API identifiers and are quoted exactly. They are data contracts, not UI
  wording; UI wording must still be our own.
- All example values in this file are invented. No SSNs, names, keys. Any SSN in a payload sample
  is written as the placeholder `9xx-xx-xxxx` (CLAUDE.md test-SSN rule); in real use it is never
  exported except through the audited reveal.
- **Money format at the boundary.** Granite stores integer cents and integer minutes. Check takes
  money as decimal **strings** ("160.00") and hours as decimals (16.0); Zeal takes money and hours
  as JSON **numbers** (floats). The payload builder must convert cents → string with exactly two
  decimals (Check) and minutes → hours with an explain line showing the conversion; never compute
  in floats.

---

## 0. Summary

| Granite piece | Primary pattern | Notes |
|---|---|---|
| Partner onboarding status (agency's own payments account) | **Stripe Connect requirements model** (`currently_due`, `eventually_due`, `past_due`, `pending_verification`, `current_deadline`, `disabled_reason`) + embedded onboarding's **summary** step | Hosted vs embedded both end with "check the account", never trust the return |
| Financing offer page (invoice funding / advance) | **Stripe Capital offer anatomy** (principal, payment rate, flat premium, total, minimum payment) + Capital's approved/prohibited wording rules | Offer lifecycle statuses from Capital webhooks |
| Embedded-payroll payload per locked run | **Check** `payroll` + `payroll_items` (earnings types) and **Zeal** `employeeCheck` + `shifts` | Field lists in §3 and §4 |
| EWA availability per worker | CFPB 2025 advisory opinion's "Covered EWA" criteria | Not 2024; see §5 |
| Invoice-funding packet | Factor requirements (eCapital, altLINE, Scale Funding formerly TCI) + a published Schedule of Accounts form | §6 |

---

## 1. Stripe Connect onboarding (hosted and embedded)

- **Sources:**
  - Stripe-hosted onboarding (Medium, extraction): https://docs.stripe.com/connect/hosted-onboarding
  - Account onboarding embedded component (High, Markdown export): https://docs.stripe.com/connect/supported-embedded-components/account-onboarding.md?platform=web
  - Handle verification with the API (Medium, extraction): https://docs.stripe.com/connect/handling-api-verification

### Hosted flow
- A Stripe-hosted form "renders dynamically based on the capabilities, country, and business type".
  It asks the account holder to confirm pre-filled information before accepting the service
  agreement.
- **Up-front vs incremental:** up-front collects `eventually_due`; incremental collects only
  `currently_due`; `collection_options.future_requirements = include` also collects future ones.
- **refresh_url**: used when the link has expired ("a few minutes"), was already visited, or was
  pre-visited by a chat app link preview; your server must mint a new link.
- **return_url**: reached on completion **or "Save for later"**; it "doesn't mean that all
  information has been collected". You must retrieve the account (or listen to `account.updated`)
  and check requirements.

### Embedded component
- Always collects `currently_due`; `collectionOptions` can add `eventually_due` and future
  requirements, and restrict with `only` / `exclude` (wildcards like `owners.address.*`). `only`
  is meant for remediation and **skips the summary step**.
- Callbacks: `onExit` (required in React) and `onStepChange({step})` (analytics only; steps may
  repeat or reorder; names may change).
- On exit, check `details_submitted`, `charges_enabled`, `payouts_enabled` and any other requested
  capabilities.
- **Step names** (exact, abridged to those relevant to a US staffing agency):
  `stripe_user_authentication`, `business_type`, `business_details`,
  `additional_business_details`, `representative_details`, `representative_document`,
  `owners`, `executives`, `confirm_owners`, `person_identity_verification`,
  `rep_identity_verification`, `business_verification`, `external_account`, `support_details`,
  `summary` ("Final review step of onboarding. The connected account can update entered
  information from this step"), plus `summary_*` edit steps (business, persons, external account,
  support, tax identification form).
- Footer and final screen show the service agreement and privacy links; platforms collecting
  requirements themselves can substitute their own links.

### Requirements hash (exact definitions, Medium)
- `currently_due`: must be resolved by `current_deadline` to stay active.
- `eventually_due`: might become required when thresholds are reached; once required it appears
  in both arrays.
- `past_due`: subset of `currently_due` that has already disabled capabilities.
- `pending_verification`: under review; failure moves items back to due arrays.
- `errors`: per-requirement validation/verification errors.
- `disabled_reason` values: `action_required.requested_capabilities`, `listed`,
  `rejected.fraud`, `rejected.incomplete_verification`, `rejected.listed`, `rejected.other`,
  `rejected.terms_of_service`, `requirements.past_due`, `requirements.pending_verification`,
  `under_review`.
- The extraction also listed typical US company requirement keys (`business_profile.mcc`,
  `company.tax_id`, `representative`, `owners`, `external_account`, `tos_acceptance`): treat as
  **unverified** (not seen verbatim).

---

## 2. Stripe Capital (financing offers)

- **Sources:**
  - Capital for platforms (High, Markdown): https://docs.stripe.com/capital/how-capital-for-platforms-works.md
  - Build a custom Capital program (Medium, search excerpt with webhook table): https://docs.stripe.com/capital/api-integration
  - Marketing your Capital program (High, Markdown): https://docs.stripe.com/capital/marketing.md
  - Refills (Medium, excerpt with JSON): https://docs.stripe.com/capital/refills

### Offer anatomy (exact components)
| Component | Meaning (doc) |
|---|---|
| Principal amount | "The amount the connected account receives upfront" |
| Payment rate | "The percentage of each future transaction withheld toward repayment" |
| Premium amount | "A flat, one-time fee on top of the principal, with no compounding interest" |
| Minimum payment | "A repayment floor over a set period (where applicable)" |
- Worked example in the doc: principal 20,000, payment rate 15%, premium 2,000, total 22,000.
- API terms object fields: `advance_amount`, `fee_amount`, `withhold_rate`, `currency`,
  `campaign_type`, `previous_financing_fee_discount_rate`; reporting summary: `remaining_amount`,
  `paid_amount`, `current_repayment_interval {due_at, remaining_amount, paid_amount}`,
  `repayments_begin_at`, `advance_paid_out_at`. (Amounts appear in minor units in the samples.)

### Eligibility (exact table)
- For-profit business in a supported country; at least 3 months processing on the platform, annual
  volume ≥ 5,000 and monthly average ≥ 1,000 (local currency); good standing; applicant is a
  representative/controller/director, 18+, owning ≥ 25%. "Meeting these requirements doesn't
  guarantee an offer."

### Lifecycle (webhook names, Medium)
`capital.financing_offer.created` → (`delivered` once communicated; all offers start
**undelivered**) → `accepted` (application submitted) → `paid_out` → `fully_repaid`; side exits:
`canceled`, `rejected`, `expired`, `replacement_created`, `accepted_other_offer`. Funds arrive
"within 1–2 business days" of acceptance. Offers refresh when a prior offer expires after 30 days;
refills at ~80% repaid.

### Acceptance and disclosure rules
- "Regardless of integration type, connected accounts must accept their offer on a Stripe-hosted
  Capital page or an embedded component." The hosted page's layout exists only as an image
  (**unverified** in text).
- All customer-facing Capital material must be pre-approved by Stripe (5-7 business days), per
  market, every change. US disclaimer must name the issuing banks and explain minimum-payment
  debits. Approved vs prohibited wording, e.g. say "prequalified" not "preapproved", "flat fee /
  financing fee" not "interest rate / APR", "if approved" not "when approved", "typically in 2
  business days" not "next business day", never imply no credit check unless MCA. Don't market to
  confirmed-ineligible accounts.
- **Implication for Granite:** our own invoice-funding "eligibility decision" screen should adopt
  the same discipline: offers phrased as prequalified, the fee as a flat amount, an explicit
  "subject to review" line, and the SPEC banner that no money moves in this version.

---

## 3. Check (embedded payroll API)

- **Sources:**
  - Types of earnings (High, Markdown): https://docs.checkhq.com/reference/types-of-earnings.md
  - The payroll object (Medium, search excerpt with attribute table): https://docs.checkhq.com/reference/payroll
  - Payroll preview and approval (Medium, excerpt): https://docs.checkhq.com/docs/payroll-preview-and-approval
  - The payroll item object (Medium, excerpt): https://docs.checkhq.com/reference/the-payroll-item-object
  - Create an employee (High, Markdown OpenAPI): https://docs.checkhq.com/reference/create-an-employee.md
  - Structuring earnings (Medium, excerpt): https://docs.checkhq.com/docs/earnings

### Objects needed for one hourly W-2 worker
1. **Company** (`com_…`) and **Workplace** (`wrk_…`; a work address used for tax jurisdiction;
   workplace fields **unverified**).
2. **Employee** `POST /employees`: required `last_name`, `company`, `workplaces` (array; may be
   empty but then blocks). Other fields: `first_name`, `middle_name`, `email`, `dob`,
   `residence {line1, line2, city, state (2-letter), postal_code}`, `start_date`,
   `termination_date`, `primary_workplace`, `ssn` (only `ssn_last_four` readable afterwards),
   `payment_method_preference` (`direct_deposit` | `manual`), `active`,
   `w2_electronic_consent_provided`, `metadata`. Bulk create accepted.
   - Response `onboard`: `status` (e.g. `blocking`), `blocking_steps`, `remaining_steps`
     (`ssn`, `payment_method`, `withholdings`), with sub-checks such as
     `payment_method_preference_set`, `bank_account_exists`, `bank_account_verified`, and
     per-jurisdiction withholdings (Federal + state). dob, residence, start_date and workplaces
     each block until set.
3. **Payroll** `POST /payrolls`: `company`, `period_start`, `period_end`, `payday` (must be a
   valid direct-deposit payday; `/paydays` lists them), optional `pay_schedule`,
   `pay_frequency` (`weekly`, `biweekly` default, `semimonthly`, `monthly`, `quarterly`,
   `annually`), `processing_period` (`three_day` | `two_day` | `one_day`; sets the approval
   deadline relative to payday), `funding_payment_method` (`ach` | `wire`; `parafin` set by Check
   when a payroll advance is accepted), `bank_account`, `metadata`, optional inline `items`.
   - Read-only: `status` (`draft`, `pending`, `processing`, `failed`, `partially_paid`, `paid`),
     `type` (`regular`, `off_cycle`, `amendment`, `balancing`, `third_party_sick_pay`),
     `approval_deadline`, `reopen_deadline`, `approved_at`, `preview {status, started_at}`,
     `totals {employee_gross, employee_taxes, employee_net, company_taxes, liability,
     cash_requirement, …}`, `warnings`.
   - Preview: `GET /payrolls/{id}/preview?async=true`, poll or webhook until `succeeded`.
4. **Payroll item** (one per employee per payroll): `payroll`, `employee`, `payment_method`,
   `earnings[]`, `reimbursements[] {amount, code, description}`, `benefits`,
   `post_tax_deductions`, overrides, `paper_check_number`, `metadata`; returns `net_pay`, `taxes`,
   `warnings`, `status`.
5. **Earning** entries: `type` **or** `earning_code` (custom code, e.g. per position/rate),
   `amount` (string dollars), `hours` (required for hourly types), `workplace`, `description`,
   `metadata`. Check shows one paystub line per type/code with rate, hours, current and YTD.

### Earning types relevant to staffing (exact)
- Require hours: `hourly` (regular), `overtime`, `double_overtime`, `paid_holiday`, `pto`, `sick`,
  `piece`, `rest_and_recovery`, `non_productive`, `salaried`.
- Memo hours (already counted elsewhere): `weighted_overtime`, `weighted_double_overtime`,
  `tip_credit_adjustment_to_minimum_wage`, `piece_adjustment_to_minimum_wage`.
- No hours: `bonus`, `commission`, `severance`, `cash_tips`, `paycheck_tips`, `group_term_life`,
  `other_imputed`, `non_hourly_regular`, `nqdc_distribution`.
- Note: Check needs Granite to have **already computed** overtime and its amount; it taxes, it
  does not apply our pay rules. Each line maps 1:1 from a Granite pay line (with its `explain`
  carried in `metadata` or our handoff record).

### Minimal partner-ready payload (shape only; invented IDs)
```json
{
  "company": "com_EXAMPLE",
  "period_start": "2026-10-05",
  "period_end": "2026-10-11",
  "payday": "2026-10-16",
  "pay_frequency": "weekly",
  "items": [{
    "employee": "emp_EXAMPLE",
    "payment_method": "direct_deposit",
    "earnings": [
      {"type": "hourly",   "hours": 40.0, "amount": "720.00", "workplace": "wrk_EXAMPLE"},
      {"type": "overtime", "hours": 4.5,  "amount": "121.50", "workplace": "wrk_EXAMPLE"}
    ],
    "metadata": {"granite_run": "run_EXAMPLE", "granite_lines": "pl_1,pl_2"}
  }]
}
```

---

## 4. Zeal (embedded payroll API)

- **Sources:**
  - Create Employee Check (High, Markdown OpenAPI): https://docs.zeal.com/reference/employee-checks/employee-checks/create-employee-check.md
  - Shift Object (High): https://docs.zeal.com/reference/employee-checks/shifts/shift-object.md
  - Create Employee (Medium, extraction from OpenAPI): https://docs.zeal.com/reference/employees/create-employee.md
  - Customer Accounts, staffing end-clients (High): https://docs.zeal.com/docs/customer-accounts-closed-beta.md
  - Wallet Transaction Object, Instant Pay (High): https://docs.zeal.com/reference/wallet/wallet-transaction-object.md
  - Docs index: https://docs.zeal.com/llms.txt

### Objects for one hourly W-2 worker
1. **Employee** `POST` create: required `companyID`, `new_employees[]` each with `email`,
   `first_name`, `last_name`, `title`, `default_pay_schedule` (`daily`, `weekly`, `biweekly`,
   `semimonthly`, `monthly`), `default_wage`, `workLocationID`. Optional: `overtime_rate`
   (default 1.5×), `doubletime_rate` (default 2×), `start_date`, `dob`, `ssn`, `phone_number`,
   `address`, `address_line2`, `city`, `state`, `zip`, `external_id`, `work_week_start` (FLSA
   policy), `is_salary`, `is_regular`, `soc_code`, `metadata`.
2. **Work Location** (`workLocationID`; taxes the shift's jurisdiction).
3. **Reporting Period** (`reportingPeriodID`; its fields **unverified**, page not fetched).
4. **Employee Check** `POST /employeeCheck`: required `companyID`, `employeeID`,
   `reportingPeriodID`, `check_date`, `shifts`. Optional `approval_required` (default false: Zeal
   auto-processes the day before check date), `disbursement.method` (`direct_deposit`,
   `download_check`, `physical_check`, `prepaid`, `paycard`, `instant_pay`), `speed`
   (`two_day` default, `one_day`, `one_day_no_reserve`, `zero_day_no_reserve`),
   `flsa_ot_recommendation`, `apply_employee_deductions`, `metadata`.
   - `check_date` must be a business day and Zeal "will not roll forward this date
     automatically"; cut-off is 2PM PST two days before.
   - Error example: one check per employee per check date (code 32).
   - Response: `status` (`pending` …), `approved`, `disbursement_status`, `gross_pay`, `net_pay`,
     `totals {gross_earnings, gross_pay, net_pay, employer_taxes, employee_taxes,
     employee_deductions, employee_garnishments, company_cash_requirement, …}`.
5. **Shift** (each line of work): `time` (ISO-8601, required), one earning object such as
   `hourly {hours (required), wage, custom_name}` and `overtime {hours, wage}`, optional
   `workLocationID`, `customerAccountID` (staffing end-client, early access), `wcc_code`
   (workers' comp class code, seen in the customer-accounts sample), `reimbursement {amount}`,
   `metadata`.

### Staffing-specific: Customer Accounts
- "The concept of a Customer Account represents the end-client of a staffing company." Create with
  `code`, `companyID`, `business_name`; status starts `initial_onboarding`; attach a funding
  source (account/routing/type) and verify by micro-deposits or instant verification. Map work to
  a client by putting `customerAccountID` on each shift. This is the closest public model to
  Granite's client → assignment → pay line chain, and `wcc_code` per shift supports the
  payroll-by-class export.

### Instant Pay is not EWA
- Zeal "Instant Pay" is a **wallet for net pay already paid** (credits = net pay; debits =
  push-to-card transfers with `partner_fee` and `zeal_fee`; statuses `processing`, `settled`,
  `returned`). No earned-wage **advance** endpoint was found in the Zeal index. Check's only
  advance concept found is the employer-side payroll advance (`funding_payment_method: parafin`).
  Neither partner documents a worker EWA API publicly (gap).

### Minimal partner-ready payload (shape only)
```json
{
  "companyID": "EXAMPLE_COMPANY",
  "employeeID": "EXAMPLE_EMPLOYEE",
  "reportingPeriodID": "EXAMPLE_PERIOD",
  "check_date": "2026-10-16",
  "approval_required": true,
  "disbursement": {"method": "direct_deposit"},
  "shifts": [
    {"time": "2026-10-06T16:00:00Z", "hourly": {"hours": 8, "wage": 18}, "workLocationID": "EXAMPLE_WL"},
    {"time": "2026-10-10T16:00:00Z", "overtime": {"hours": 4.5, "wage": 27}, "workLocationID": "EXAMPLE_WL"}
  ],
  "metadata": {"granite_run": "run_EXAMPLE"}
}
```
Note Zeal recomputes gross from hours × wage (floats). Granite must send the wage that reproduces
our cent-exact line amount, and the handoff record must show any rounding difference.

---

## 5. Earned wage access: CFPB position (summary only)

- **Correction to the brief:** there is no final 2024 advisory opinion. Sequence (High for the
  2025 opinion; Low/Medium for the history from law-firm summaries):
  1. Nov 2020 advisory opinion: a narrow employer-integrated EWA product is not "credit".
  2. Mid-2024 **proposed interpretive rule** (never finalized) would have treated all EWA as credit
     and expedited fees / some tips as finance charges.
  3. Jan 15 2025: CFPB rescinded the 2020 opinion.
  4. **Dec 23 2025 advisory opinion** (effective that day), "Truth in Lending (Regulation Z);
     Non-application to Earned Wage Access Products":
     https://www.federalregister.gov/documents/2025/12/23/2025-23735/truth-in-lending-regulation-z-non-application-to-earned-wage-access-products
     It formally withdraws the 2024 proposal.
- **"Covered EWA" is not credit when all hold** (paraphrased from the opinion):
  1. Each access does not exceed **accrued wages earned to that moment, determined from payroll
     data** (not worker statements or estimates).
  2. Recovery is by a **payroll process deduction** at the next payroll, not a debit of the
     worker's bank account after payday.
  3. Before use, the provider clearly explains and warrants **no recourse** if the deduction falls
     short, no debt collection, no sale of the amount, no credit reporting.
  4. **No individual credit underwriting** (no credit reports or scores).
- Fees: free products' providers are generally not "creditors". If an EWA product were credit,
  **expedited-delivery fees** can be finance charges when the free option is made too hard to
  choose, and **tips** count when not truly voluntary.
- The opinion is non-binding on states; law-firm commentary notes state regimes (e.g. California
  DFPI, New York legislation) continue (Low:
  https://www.mofo.com/resources/insights/260107-cfpb-reestablishes-position-that-certain-earned-wage).
- **Disclosure norms for Granite's EWA availability screen:** show available = accrued, approved
  pay to date from our own pay lines minus prior accesses, under the configurable cap; state that
  recovery is by payroll deduction; state no recourse, no collection, no credit check; show any fee
  and a free option with equal prominence; tips (if any) clearly optional. All as data on the
  screen plus "no money moves in this version".

---

## 6. Invoice funding (factoring) underwriting inputs

- **Sources (Low/Medium; vendor marketing and forms):**
  - eCapital, how to qualify: https://ecapital.com/blog/how-to-qualify-for-invoice-factoring-and-expedite-funding/
  - altLINE, small business requirements: https://altline.sobanco.com/factoring-for-small-businesses/
  - altLINE, aging schedule buckets: https://altline.sobanco.com/how-to-fill-out-an-accounts-receivable-aging-schedule/
  - Scale Funding (TCI Business Capital rebranded; https://getscalefunding.com/scale-funding-insights/tci-business-capital-is-now-scale-funding/), how it works: https://getscalefunding.com/scale-funding-insights/get-cash-to-run-your-business/
  - Advance Partners, staffing credit analysis: https://www.advancepartners.com/blog/notes-from-a-credit-analyst/
  - Commercial Funding, debtor concentration: https://www.commercialfund.com/blog/debtor-concentration-impact-on-ar-financing
  - Compass Funding Solutions, Schedule of Accounts form (PDF): https://compassfs.net/_Old_Website/scac011.pdf
  - SEC-filed factoring agreement defining Schedule of Accounts: https://www.sec.gov/Archives/edgar/data/1665300/000121390018004257/fs42018ex10-17_stellaracq3.htm

### What they ask for at setup
- eCapital: AR aging report, tax ID, articles of incorporation; then agreement and onboarding.
- altLINE: list of all customers whose invoices will be factored (for debtor credit review);
  personal ID, EIN, customer contracts, corporate documents; AR aging report. Factors invoices "up
  to 90 days outstanding"; UCC filing after term sheet. Fees described as an initial fee "up to
  3.50%" for the first period (typically 30 days) plus incremental fees "up to 1.50%".
- Scale Funding: quote, then agreement, then per-batch invoice submission; advance "up to 95
  percent" within 24 hours; remainder held in reserve, released minus fee when the customer pays.

### Per-invoice / per-batch
- **Schedule of Accounts** (bill of sale/assignment signed by the client). SEC-filed agreement
  definition: it identifies each receivable with "the correct amount owed by the Account Debtor,
  the name and address of the Account Debtor, the invoice number, and the invoice date".
- Compass form columns: debtor name, invoice number, date, reference/PO number, invoice amount;
  factor-only box: check no., check date, total, fee %, reserve, charge back, rebates, cash payment;
  signed assignment paragraph.
- eCapital: send invoice + PO confirmation; factor **verifies** delivery/acceptance; advance on
  approval; reserve released on customer payment.
- Staffing-specific evidence (Advance Partners): "approved timesheets", clean billing formats
  matching the client's required format, debtor credit quality, historical DSO, dispute history,
  concentration; red flags: rising disputes, slower remittance, changed payment methods,
  inconsistent remittance info.

### Aging and concentration
- Buckets: Current, 1-30, 31-60, 61-90, over 90 days past due (altLINE).
- Debtor concentration = share of total AR owed by one debtor (Commercial Funding). One factor's
  page says factors "start to flag concentration once a single customer passes 20 to 30 percent"
  (Low; search excerpt, https://deltacapitalgroup.com/invoice-factoring-with-one-customer/).

---

## Recommended hierarchy for Granite

### `/settings/payments-partner` (partner onboarding readiness)
- Status header with one of: not started, information due (with deadline), under review,
  restricted (with reason), ready (Stripe requirements model: `currently_due` + `current_deadline`,
  `pending_verification`, `disabled_reason`).
- Checklist grouped Business → People → Bank → Review, each item due now / due later / in review
  (Stripe `currently_due` vs `eventually_due` vs `pending_verification`; group order follows the
  embedded step order `business_type` … `owners` … `external_account` … `summary`).
- Final **summary** review screen with per-section Edit (Stripe `summary` + `summary_*` steps).
- Return from any flow re-reads status; never assume complete (Stripe `return_url` rule).

### `/runs/[id]/handoff` (embedded payroll payload)
- Partner selector (Check / Zeal / file); readiness list per worker mirroring Check `onboard`
  blocking steps (dob, residence, start date, workplace, SSN on file, payment method, withholdings)
  (Check employee onboard).
- Table one row per worker: regular hours/amount, OT hours/amount, other earnings, mapped partner
  type (`hourly`/`overtime`… or `hourly`/`overtime` shift objects), client account and comp class
  (Check earning types; Zeal shifts with `customerAccountID`, `wcc_code`).
- Totals strip like Check `totals` (gross, employer taxes "computed by partner", cash requirement
  "unknown until partner preview").
- Actions: download JSON, "record handoff"; banner that no money moves (SPEC §27.9).

### `/workers/[id]/earned-pay` (EWA availability)
- Available now = accrued approved pay to date − prior accesses, capped (CFPB "Covered EWA" #1);
  explain string with inputs; recovery method line (payroll deduction, #2); fixed disclosure block:
  no recourse, no collection, no credit check (#3, #4); fee and free option shown equally (fee
  guidance).

### `/invoices/[id]/funding` (invoice-funding packet and decision)
- Eligibility decision with reasons: invoice age vs 90-day limit (altLINE), debtor concentration %
  vs configurable threshold (Commercial Funding / Delta), approved timesheet backup present,
  disputes open (Advance Partners), client credit flag.
- Offer-style block when eligible: invoice amount, advance %, advance amount, flat fee, reserve,
  "prequalified, subject to review" (Stripe Capital anatomy and wording rules; Scale Funding
  advance/reserve model).
- Packet contents: Schedule of Accounts line (debtor name and address, invoice #, date, PO #,
  amount; Compass form + SEC definition), invoice PDF, approved timesheets, aging snapshot.
- Status chips modelled on Capital lifecycle: draft → packet ready → handed off → (partner
  outcome recorded manually).

### Gaps
- Stripe Capital hosted offer page layout only in an image (unverified).
- Check workplace object and Zeal reporting-period object fields not fetched (unverified).
- No public worker-EWA API from Check or Zeal.
- Factor "concentration limit" numbers come from marketing pages only (Low).
