# 0039 — Scheduling and shift fill (slice u)

Status: accepted (owner: "build everything … in full", 2026-10-17; SPEC §27 item 7)
Date: 2026-10-17
Number: first written as 0041, which the client portal's record also took when the slices were built
in parallel; moved to the free 0039 the same day. The comment at the top of `drizzle/0049_scheduling.sql`
still says 0041: applied migrations are not edited.

## Context
SPEC §27 brings scheduling into version one: a shift board per client and worksite, offers to eligible
workers, confirmations, no-shows and replacements, confirmed shifts attached to assignments, attendance
feeding intake, and fill and no-show rates. Research: `docs/research/scheduling-slice-u.md`.

## Decision
1. **Two tables** (drizzle/0049, row-level security): `shifts` (one job order, one day, minutes after
   midnight, an unpaid break; open / assigned / awaiting / confirmed / cancelled; published when
   `published_at` is set and not older than `changed_at` — When I Work's pending changes; a warning when
   the worker declined or did not answer — Deputy) and `shift_offers` (an open published shift offered to
   an eligible worker; the first to accept takes it).
2. **Eligibility** is the spine: workers placed on the job order that day first, then those placed in
   the same position; an overlapping shift is flagged (When I Work's scheduling concerns) and never
   offered.
3. **Publishing** follows Deputy's three steps (what, which clients, how to notify). Asking for
   confirmation makes assigned shifts await an answer due 16 hours before the start in the agency's time
   zone (Instawork's window) — published later than that, by the start; already started, not asked; no
   answer by then opens the shift again with a warning (Deputy), checked
   whenever the schedule or a worker's list is read.
4. **Confirming places the worker**: a confirmed shift attaches to the worker's assignment on that job
   order, made from that date at the job order's rates when there is none (bounded by a later placement
   so they never overlap).
5. **Hours still come only from timesheets** (SPEC §6): a schedule never makes a time entry. The run's
   exceptions step lists confirmed shifts with no hours yet, never blocking. Attendance reads the first
   time in from the hours: late is after the start plus Deputy's 15-minute tolerance; a no-show is marked
   by a person, with an open replacement offered while the shift runs.
6. **Notices**: publishing records how workers are told and the message in the activity log; the
   delivery itself rides the notifications slice (r). The worker's Shifts screen is a component with
   bound actions; until the worker app (slice t) mounts it, it is reachable in the demo at
   `/shifts-preview`, answered as a demo worker by an agency person who changes placements.

## Consequences
- Margin gains an Attendance tab (fill rate, no-show rate, late, problem shifts).
- The sidebar gains Schedule under Staffing ("G then S").
- Rates are whole basis points; minutes are integers; nothing here touches pay or billing.
