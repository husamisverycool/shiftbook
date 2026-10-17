# 0043 — Beeline, Coupa and Magnit profiles with agency columns; voiding a credit note; versioned onboarding policies; a demo Recruiter

Status: accepted (owner, 2026-10-17: "build everything … in full")
Date: 2026-10-17

## Context
Four gaps remained: Connections listed Beeline, Coupa and Magnit as "Not available yet" (decision
0040); a credit note issued by mistake could not be undone; the policies a worker acknowledges were
three fixed texts; and the demo sign-in had no Recruiter. Research: `docs/research/vms-profiles-gap.md`.

## Decision
1. **Three more VMS profiles** through the same mechanism as Fieldglass (`BUILT_IN_PROFILES`):
   `beeline-timesheet-export`, `coupa-time-sheet-lines`, `magnit-timesheet-export`. No public column
   list exists for any of them, so each uses its system's vocabulary and is **editable by the agency**.
2. **Agency columns**: Settings › Connections › Edit columns saves the agency's column names, counted
   statuses and date format as the next `mapping_profiles` row for that built-in key (versions, never
   overwritten; Owner and Coordinator, the `hours` ability; audited as `mapping_profile`). Intake reads
   with the latest version (`agencyProfiles`) and records it on the source document
   (`mapping_profile_id`). A saved definition that does not check out (`profileColumnProblems`) is
   ignored in favour of the built-in one. Restore saves the built-in names as a new version.
3. **Invoice upload** to these systems stays the generic mapped CSV (slice g): none publishes an
   invoice import layout.
4. **Voiding a credit note** (Stripe): Owner and Billing (`cash`), with a reason (up to 500
   characters), only while the invoice is open — no live payment match, write-off or credit
   application from or to it — and never a correction run's note. The note keeps its number; its
   status becomes `void` with `voided_at`, `void_reason` and `voided_by_label` (a CHECK requires the
   reason with the status); its PDF is re-rendered with "VOID — reason" under a new storage key; the
   invoice's status is settled again (a fully credited invoice returns to issued); audited. Balances
   already exclude void notes, so the invoice asks for the credited amount again; an "as of" view
   after the void treats the note as never counted.
5. **Onboarding policies** (`onboarding_policies`, migration 0060): Settings › Onboarding, Owner and
   Coordinator (`onboardingPolicies`). Each save is a new version from a date, today or later; removal
   is a version that is not active. Versions are never updated (UPDATE revoked) and are deleted only by
   the demo's reset (trigger); a worker's session cannot insert one. A worker's acknowledgment records
   the version; one saved before versions counts as version 1, and the agency's first save keeps the
   three built-in policies as its version 1, so nobody is asked again by that save alone. A required
   policy in force whose current version the worker has not acknowledged is owed: Home shows a
   "Policies to confirm" card and onboarding opens on the Policies step. Settings shows how many
   workers owe each policy.
6. **Demo Recruiter**: a fictional recruiter joins the demo staff, so "Continue as" offers it.

## Consequences
- Connections lists every VMS as available, with Edit columns.
- The profiles' column names are low confidence by design; an agency fixes them in a minute without us.
- Migration `0060_gaps.sql`: invoice void columns; `onboarding_policies` with RLS, the kept-rows
  trigger and the worker insert policy.
