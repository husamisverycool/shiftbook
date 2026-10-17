# Pattern: Money — payroll runs to hand off (`/money/payroll`)

Status: adopted — slice (w) (2026-10-17)
Reference product and screen: Check — the payroll object's periods, payday and statuses (a payroll
per pay period, `period_start`, `period_end`, `payday`, `status`); Stripe Dashboard lists
(`_components/table.md`)
Source URL: https://docs.checkhq.com/reference/payroll
Source URL: https://docs.checkhq.com/docs/payroll-preview-and-approval
Researched: 2026-10-17 (`docs/research/money-flows-slice-w.md` §3). Confidence: high.

## Purpose in Granite
The weekly runs whose payroll files were made, each one a payroll an embedded-payroll partner could
pay. A regular run is handed off from its own page; a correction pays only differences and goes
through its payroll file.

## Hierarchy
1. The Money header and tabs (`money.md`), the plain line.
2. **Runs table** (Stripe list): Pay period (dates; "version 2" when there is one), Pay date, Workers,
   Gross (bold), Handoff — a badge: "Recorded" (neutral) with its date, "To hand off" (info), or for a
   correction "Through its payroll file" (neutral). The whole row opens the run's handoff page.

## Interactions
- A row (or its period link) opens `/money/payroll/[id]`; a correction's row is not a link.

## States
- Empty: "No payroll to hand off yet" with one line — a run appears here once its files are made —
  and **Go to Convert timesheets**.

## Loading and errors (slice o)
- Loading: the page's outline in the list shape (`_components/loading.md`).
- A failure: the frame stays; the failed content's place says so with "Try again" (`_components/error.md`).

Deviations allowed: none
