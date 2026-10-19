# Pattern: Massachusetts job order (`src/pdf/ma-job-order.tsx`)

Status: adopted — slice (j) plan, decision J3 (2026-10-16)
Reference product and screen: Tabulado's own statement document (`_documents/statement.md`), with
the contents the law lists: M.G.L. c. 149 § 159C(b) (contact details of the agency, its workers'
compensation carrier, the worksite employer and the Department of Labor Standards; the job and any
clothing, equipment, training or licenses and their costs; the pay day, hourly rate and whether
overtime may occur; daily start and anticipated end times and the expected duration; meals and
transportation and their charges) and 454 CMR 24.08 (confirmed in writing before the end of the first
pay period; a strike or lockout at the worksite; the Department's multilingual statement)
Source URL: https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXXI/Chapter149/Section159C
Source URL: https://www.mass.gov/doc/454-cmr-24-employment-agency-and-temporary-workers-right-to-know-regulations/download
Researched: 2026-10-16 (`docs/research/compliance-slice-j.md` §3). Confidence: high for the statute's
list (read today); medium for the regulation's extra items (read through a government-search index).

## Purpose in Tabulado
The written job order a Massachusetts placement's worker gets by the end of the first pay period.

## Hierarchy
1. **Top:** title "Job order" and "Massachusetts Temporary Workers Right to Know"; the worker's name;
   the placement's start date; the date it was made.
2. **Contacts:** four blocks, each with a name, address and phone, as the law lists them — the
   staffing agency (its phone is required), its workers' compensation insurer (name, address and phone
   from Compliance settings, policy number), the worksite employer (client name, worksite address, the
   phone in the job order's details), the Department of Labor Standards (the contact details the
   agency keeps in Compliance settings).
3. **The job:** position, SOC code; clothing, equipment, training or licenses required and any cost.
4. **Pay:** hourly rate; pay day (the weekday after the first pay period ends, as the workweek and
   pay day settings stood then; "the last day of the workweek" when paid that day); whether overtime
   may occur and its rate (the pay rate × Massachusetts' overtime rule, not the rate card's billing
   multiplier).
5. **Hours:** daily start and anticipated end time; expected duration (the placement's end date, or
   "Not set").
6. **Meals and transportation:** provided or not, and any charge.
7. **Strike or lockout** at the worksite: yes or no.
8. A line that the Department's multilingual statement goes with this job order (the file the agency
   keeps in Compliance settings).
9. "Page X of Y" at the bottom right.

## States
- **Details missing** (the employer's phone, times, overtime, meals, transportation, strike): the duty
  asks for them first; they are kept per job order so the next placement reuses them.
- **No agency phone:** the job order cannot be made.

Deviations allowed: none
