# 0021 — Compliance duties generated from dated rule rows, with evidence never deleted

Status: accepted
Date: 2026-10-16

## Context
SPEC §16 asks for a compliance calendar: state registration renewals, Illinois client verification
dates with a proof page, Illinois § 42 triggers, New Jersey certification and a primary-language
flag, the Massachusetts job order per placement, a workers' comp audit packet, an I-9 status field
and the ACA look-back, in list and calendar views, each obligation with evidence attachments. SPEC §5
puts every rate, threshold and date rule in a data table with effective dates. The obligations table
from slice (c) held only the Illinois equal-pay crossings (one per worker and client). Research:
`docs/research/compliance-slice-j.md`; plan `.claude/plans/slice-j-compliance.md` (J1–J11).

## Decision
- **One obligations table for every duty.** A duty's kind is a code in `compliance_rules`
  (reference data with citation, official source and effective dates: what the due date counts
  from, the offset or business days, the reminder lead, fixed dates, the look-back, who besides the
  Owner may complete it). A subject (registration, policy, client, placement, worker, or worker at a
  client) and an occurrence key make each duty unique. The run keeps recording the equal-pay
  crossings as before.
- **Generated, not typed.** A pure generator (`src/server/compliance/generate.ts`) works out the
  duties from registrations, workers' comp policies, placements and workers' I-9 dates; a sync keeps
  the table in step whenever compliance is shown or its facts change. New duties are created, open
  ones follow their dates, the data closes what it settles (a newer registration renews; an I-9 date
  recorded), and an open duty the data no longer calls for is set aside as not applicable. A person's
  "done" or "not applicable" is never undone by the system; only the Owner reopens.
- **Statuses are worked out when shown:** overdue after the due date, due soon from the reminder
  date, upcoming before; done and not applicable as recorded (Vanta).
- **Evidence** files sit in the document store and `compliance_documents`, linked to duties many to
  many; unlinking keeps the file (Past files). The I-9 is dates only: no copies of the form or of
  identity documents.
- **Roles:** the Owner acts on every duty and changes the settings; coordinators complete placement
  and worker duties; billing completes client proof pages; the accountant reads.

## Alternatives considered
- **Typing duties in by hand** (a generic task list): nothing would stop a renewal or an I-9
  deadline from being forgotten, which is the point of the calendar.
- **Storing the status** (due soon, overdue): it would go stale overnight; computing it from the
  dates is exact and cheap.
- **A scheduled job to generate duties:** the app has no job runner in demo mode; generating on read
  and on each change gives the same result with no moving parts.

## Consequences
- Migration `0029_compliance`; the `obligation_kind` enum becomes text and the old `evidence` column
  becomes `facts` (the equal-pay engine's evidence is unchanged inside it).
- Rule numbers and citations change by adding a row with a new effective date, never by code.
- Generation runs inside the request that shows compliance; at an agency's size (hundreds of
  placements) it is a few small queries. If that grows, the same pure generator can run on a schedule.
