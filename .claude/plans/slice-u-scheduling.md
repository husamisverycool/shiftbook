# Slice (u) — scheduling and shift fill (decision 0041)

Status: built (2026-10-17)

## Plain summary
A Schedule page shows the week's shifts by worker, job order or worksite, with open shifts on top.
Shifts are made from job orders, published in three steps, and offered to the workers placed on that
order. Workers confirm, decline with a reason, or accept an open shift — the first to accept gets it and
is placed on the job order. No answer by 16 hours before the start opens the shift again. A no-show is
marked and the rest of the shift offered to others. Margin › Attendance shows fill rate, no-shows and
lateness per client. The run's exceptions step lists confirmed shifts with no hours yet. Hours still come
only from timesheets.

## Steps (done)
1. Research and pattern files: `docs/research/scheduling-slice-u.md`; `docs/patterns/schedule.md`,
   `margin/attendance.md`, `shifts-preview.md`; `convert.md` and `_layouts/app.md` updated.
2. Storage: `drizzle/0049_scheduling.sql` (`shifts`, `shift_offers`, RLS, TENANT_TABLES).
3. Pure logic with unit tests (`src/server/schedule/logic.ts`); service and queries with integration
   tests (`tests/integration/schedule.test.ts`, tenant isolation).
4. Screens: Schedule (grid, shift dialog, publish dialog, status bar), Attendance tab, the worker's
   Shifts screen at `/shifts-preview` (demo), the exceptions-step list; demo seed with a published week.
5. One e2e spec, English and Spanish (`tests/e2e/schedule.spec.ts`).
