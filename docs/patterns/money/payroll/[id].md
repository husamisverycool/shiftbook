# Pattern: Payroll handoff (`/money/payroll/[id]`)

Status: adopted — slice (w) (2026-10-17)
Reference product and screen: Check — payroll preview and approval (a payroll is previewed, then
approved before its deadline; the preview's `totals`; each `payroll_item` with its `earnings`) and
employee onboarding (`onboard.blocking_steps` / `remaining_steps`: SSN, payment method,
withholdings, date of birth, residence, start date, workplace); Zeal — the employee check and its
shifts (hours × wage per shift; `customerAccountID`, `wcc_code`); Stripe detail page
(`_components/record-page.md`)
Source URL: https://docs.checkhq.com/docs/payroll-preview-and-approval
Source URL: https://docs.checkhq.com/reference/the-payroll-item-object
Source URL: https://docs.checkhq.com/reference/types-of-earnings.md
Source URL: https://docs.checkhq.com/reference/create-an-employee.md
Source URL: https://docs.zeal.com/reference/employee-checks/employee-checks/create-employee-check.md
Source URL: https://docs.zeal.com/reference/employee-checks/shifts/shift-object.md
Researched: 2026-10-17 (`docs/research/money-flows-slice-w.md` §3, §4 and "Recommended hierarchy").
Confidence: high for the objects and the approval step; the screen's arrangement is Granite's Stripe
record page.

## Purpose in Granite
One run's payroll as the partner would receive it: every worker's earnings already computed by the
pay rules (the partner taxes, it does not apply overtime rules), reconciled to the payroll file to
the cent, approved by the Owner and recorded. Nothing is sent.

## Hierarchy
1. **Ancestors** "Money › Payroll" (never a back arrow); H1 "Payroll for {period}"; the status badge
   (Ready — info; Recorded — neutral; Not ready — warning); one facts line: pay date · workers · gross.
2. The plain line (no money moves).
3. **Left column**, modules under hairlines:
   - **Earnings by worker** (Check payroll items): a table — Worker, Regular (hours and amount),
     Overtime (hours and amount), Other, Gross (bold), Ready (a check, or what Granite is missing:
     start date, worksite, SSN on file). Totals row.
   - **What the partner collects** (Check `onboard`): date of birth, home address, how they are paid,
     tax withholdings — never held by Granite; the partner's onboarding asks each worker.
   - **Reconciliation**: the payroll file's gross and the payload's gross, equal or the difference.
     With Zeal chosen, any line whose hours × wage would come out a cent different (Zeal recomputes
     from the numbers it receives) is listed with both amounts.
4. **Right column** (Stripe details, label over value): Run version, Rules version, Approved, Pay
   date; **Partner format** — a choice of Check, Zeal or a file (neutral JSON); **Download payload**
   (the chosen format; recorded in the activity log as an export); the primary action **Approve and
   record handoff**. Once recorded: Recorded (date), By, Fingerprint (SHA-256, shortened, copyable).

## Interactions
- **Approve and record handoff** opens a confirmation dialog (Check's approval step): the gross and
  workers, the format, the plain line; **Record handoff** (primary) / Cancel. Disabled with the
  reason when not ready. Only the Owner sees the action; others read the page.
- Download keeps the chosen format.

## States
- Not ready: the badge, the reason in the right column, the action disabled.
- Recorded: the action is replaced by the record; downloading still works.
- Not found: the app's not found (`_components/error.md`).

## Loading and errors (slice o)
- Loading: the page's outline in the record shape (`_components/loading.md`).
- A failure: the frame stays; the failed content's place says so with "Try again" (`_components/error.md`).

Deviations allowed: none
