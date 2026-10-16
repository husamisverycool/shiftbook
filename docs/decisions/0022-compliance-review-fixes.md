# 0022 — Compliance after the second opinion: age never closes a duty, duties per hire and per contract, documents that say what the law lists

Status: accepted
Date: 2026-10-16

## Context
A second-opinion review of slice (j) steps 1 and 2 (decision 0021) found fifteen defects with
concrete failure paths. The ones that change behavior or the data model are recorded here; each has a
test that failed before the fix (`src/server/compliance/{generate,wc-packet}.test.ts`,
`tests/integration/compliance.test.ts` "second opinion", `compliance-documents.test.ts`,
`equal-pay.test.ts`).

## Decision
- **Age never closes a duty.** A rule's look-back only stops old duties from being created; one
  already on file stays open however late it is (before, an overdue job order a year old was closed
  as "no longer applies").
- **The run's equal-pay duties change under the compliance lock.** One whose crossing goes away is
  deleted only while nobody has touched it (no note, file or owner); otherwise it is set aside as
  Shiftbook's own "not applicable", and opens again if the hours cross again.
- **What Shiftbook closed, the data reopens or closes again; what a person closed, only the Owner
  reopens.** Reopening a duty the data closed is refused (it would not last).
- **Form I-9 duties are one per hire date**, and a section date recorded more than the rule's window
  (30 days) before the hire belongs to an earlier hire. Section 2 may come before the first day (not
  before Section 1); a job shorter than three business days needs it on the first day; the weekend
  days the agency is open count as business days (an Owner setting, Jira's "standard working days";
  Monday to Friday always count). A changed work-authorization end sets the old reverification aside
  in the name of the person who changed it. No I-9 files are kept at all.
- **Illinois proof of registration:** one per contract (covered work after a gap longer than 183
  days starts a new one); a March 1 or September 1 counts when covered work runs then or ended within
  the window; the page shows the registration and policy in force on the day the client checks, and
  cannot be made without one.
- **The Massachusetts job order lists every contact's name, address and phone** (the insurer's from
  the policy, the worksite employer's in the job order's details, the agency's required), the
  overtime rate from Massachusetts' overtime rule (not the rate card's billing multiplier), and the
  pay day as the settings stood when the first pay period ended.
- **The workers' comp packet's tie-out** counts what corrections settled outside the files; premiums
  are summed per multiplier and kept in lowest terms, so a year of overtime stays exact and short.
- **Workers' comp renewal** needs the following policy to cover every state the old one did.
- **The sidebar's badge works the duties out first** when the compliance lock is free; placement and
  job order changes and imports work them out in the same transaction.
- A registration, policy or statement refused after its file was stored keeps nothing (the record
  rolls back and the bytes are removed).

## Alternatives considered
- **Closing old duties to keep the list short:** the list would hide the most serious problems.
- **One I-9 duty per worker forever:** a rehire would show the old form as done.
- **Counting Saturday for every agency:** the earlier date for all, but wrong for agencies closed on
  weekends; the setting keeps the safe reading the default.

## Consequences
- Migration `0030` adds `compliance_rules.window_days` (with the values above), `wc_policies.
  carrier_contact`, and moves existing contract-proof and I-9 rows to their new occurrence keys.
- The windows are Shiftbook's safe readings, not numbers in the law; they live in the rule rows so
  the agency's lawyer can change them by adding a dated row.
