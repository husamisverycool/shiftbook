# 0028 — The activity log, and duty explanations in the reader's language

Status: accepted
Date: 2026-10-16

## Context
SPEC §19: append-only events for every create, update, approval, export and reveal, viewable per
record and globally. SPEC §24 step 10: the Owner's reveal of an SSN shows in the audit log. SPEC §20:
every string in English and Spanish, but a compliance duty's "worked out from" line was stored as an
English sentence (task 46).

## Decision
- **Who reads the whole log**: the Owner and the accountant (`viewActivity`). GitHub, Linear and
  Vercel keep theirs to owners; Shiftbook's accountant reads everything except SSNs, and the log
  never holds one (decision 0027: the last four at most). Coordinators and Billing keep the
  records' own histories where they are (a job order's Activity tab, a duty's history).
- **The page** (`docs/patterns/settings/activity.md`): Stripe Workbench's two panes, filters by date
  (the past three months by default, GitHub), person, record type, action and one record; Refresh;
  Copy link; Export CSV following the filters, with each event's before and after (Vercel). The
  export is itself an event (`export` of `activity_log`, the filters and the row count).
- **Record names** are looked up when shown (a worker's name, an invoice's number, a run's period),
  never copied into the log: a renamed worker shows their current name. A record without a page of
  its own shows its type.
- **Duty explanations**: each duty the generator works out carries `explain` — a message key and its
  values (dates, numbers, minutes, names) — beside the English `message`, which stays the record.
  Screens render the key in the reader's language; a unit test renders every generated case's
  English template and checks it says exactly the stored English sentence, so the two cannot drift.
  Illinois equal-pay duties (recorded by the run) are explained from their facts the same way. Notes
  Shiftbook writes when it closes a duty carry a key too (`note_key`); a person's own note stays as
  typed.

## Alternatives considered
- Translating the stored English with patterns on every screen: brittle, and it breaks when a sentence
  changes. (Patterns read back only Shiftbook's own notes written before keys, once, and are kept
  only when the keys say exactly the note.)
- Storing both languages: two places to keep right, and a third language would need a migration.

## Consequences
- Migration 0036 adds `obligations.explain` and `obligations.note_key` (both nullable) and an index on
  the log's agency and time. Each sync fills them for duties and notes written before — the Illinois
  equal-pay duties from their facts, Shiftbook's notes read back from their fixed wording — only when
  the keys say exactly the stored English; anything else keeps its English (no audit event: the
  meaning does not change).
- A rule's citation is shown in the reader's language only while the rule table's text is the one the
  messages translate (a test checks every rule in force); a duty under a replaced row shows its
  stored text.
- The log's times are the agency's own (as its date filters count days). The export's When column is
  UTC (named so); an export stops at 50,000 events and says so in its own event.
- The rules engine's own messages (run blockers, warnings, explain lines on the margin and payroll
  screens) are still English; they move to keys the same way in slice l (task 50).
