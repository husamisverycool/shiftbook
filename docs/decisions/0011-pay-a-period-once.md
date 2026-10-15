# 0011 — A pay period is paid once, one writer at a time

Status: accepted
Date: 2026-10-15

## Context
The fifth second-opinion review showed that a second "create files" re-paid and re-billed the whole
period, and that two simultaneous clicks (or a page refresh racing "create files") could double the
lines in one file. SPEC §11 says corrections create a new run version, but a correction that pays
only the differences (and credits or voids the earlier invoice) is not built yet.

## Decision
- Every action that changes a period (hours, review, skips, totals, files, uploads, re-reads) first
  takes a transaction-scoped Postgres advisory lock on the period (`src/server/run/period-lock.ts`),
  then checks the period belongs to the agency and is still open.
- Creating files locks the paid time entries and the period. Afterwards every change is refused
  with a plain message; locked entries are never payable.
- Unique indexes: one payroll file per run and format; invoice numbers unique per agency.
- "Create files" carries the fingerprint of the totals the person reviewed and is refused when the
  recomputed totals differ.

## Alternatives considered
Allowing a second version now: without difference-only pay and invoice credits it would pay twice.
Row locks on `pay_periods`: needs UPDATE rights for the app role on a reference table.

## Consequences
In slice (a) a period cannot be corrected inside Shiftbook after its files exist; workers skipped
from a run are paid outside it (the skip dialog says so). Slice (e) adds correction versions that
pay and bill only the differences.
