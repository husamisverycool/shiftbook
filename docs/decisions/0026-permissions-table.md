# 0026 — What each role may change: one table, checked by every action

Status: accepted
Date: 2026-10-16

## Context
SPEC §2 gives four agency roles: the Owner (everything; approves runs; sees margin; reveals an SSN),
the Coordinator (intake and hours review), Billing (invoices, receivables, cash application) and the
read-only accountant (reads everything except SSNs, changes nothing). Before slice (k) each service
had its own small check (`mayApprove`, `mayCollect`, …) and some actions had none, because everyone
was the demo Owner.

## Decision
- One table, `src/server/permissions.ts` (pure, so screens and tests use it too):
  `hours` (Owner, Coordinator) — timesheets, the review grid, client approval of hours, totals;
  `run` (Owner) — approving or reopening a run, the payroll files, corrections, which clients must
  approve; `placements` (Owner, Coordinator) — job orders, rates, placements, the placement import;
  `clientBilling` (Owner, Billing); `clients` — adding and editing clients and worksites, archiving a client (Owner, Coordinator, Billing; added 2026-10-17 so an agency that signs itself up can set up its business); `cash` (Owner, Billing); `compliance` (Owner, Coordinator,
  Billing — each duty also names the roles that act on it); `settings` (Owner) — payroll, margin and
  compliance settings; `members` (Owner); `viewMargin` (Owner, accountant).
- Every server action that changes something starts with `actorAllowedTo(ability)`; a role without
  it is refused before anything is read or written. A unit test reads every action file and fails
  when an exported action does not name its ability (the person's own account actions and the
  client portal are the only exceptions, and say so).
- The services' own checks now read the same table (one source), so a test calling a service
  directly meets the same rule.
- Screens hide what the role cannot do (buttons, menus, editable fields), and say once that the page
  is read-only for them.
- Reading stays open to every role except the margin pages and whole SSNs.
- Changes from slice (b)'s rule: Billing no longer edits job orders, rates or placements (that was
  "anyone but the accountant"); it is now the Coordinator's and the Owner's work, as SPEC §2 reads.
- The demo's "Reset demo" is the demo's own control, not the agency's: anyone in a demo session may
  use it.
- Slice t added the Recruiter (SPEC §2: job orders, placements, worker onboarding) and `workerApp`
  (Owner, Coordinator, Recruiter: onboarding links, messages with workers). After its security
  review (2026-10-17), two abilities keep the Recruiter to that: `placementTerms` (Owner,
  Coordinator) — rate cards, who is credited as a placement's recruiter (their own margin credit), a
  client's clock-in setting, saved import mappings; `employment` (Owner, Coordinator) — a worker's
  payroll numbers and ending or restarting employment. `placements` keeps job orders, placements and
  the placement import; `workers` keeps a worker's details, documents and an SSN entered.
- Decision 0043 added `onboardingPolicies` (Owner, Coordinator): the policies workers acknowledge at
  onboarding (Settings › Onboarding). The Recruiter sends onboarding links but does not write policy.
  Editing a VMS time file's column names uses `hours` (Owner, Coordinator: they read timesheets in);
  voiding a credit note uses `cash` (Owner, Billing), as issuing one does.

## Alternatives considered
- Permissions per person (Rippling's custom roles): more than SPEC asks; four fixed roles are what a
  small agency has.
- Checks only in the services: the actions' inputs and files (uploads) would be read first; the
  action is the door.

## Consequences
- A page left open while the Owner changes someone's role meets a refusal on the next change; the
  next page load hides the buttons.
- Adding an action means naming its ability, or the test fails.
