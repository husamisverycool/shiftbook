# Slice (e) — Weekly run with blocking checks

Status: GO under the owner's "just keep going … I don't need to approve anything for you"
(2026-10-16). Choices the research left open are listed under "Decisions made for the owner"; the
owner can reverse any of them.
Contract: SPEC.md §2 (Owner approves runs), §4 (PayRun), §11 (weekly run), §12–13 (files),
§24 step 5. Research with sources: `docs/research/weekly-run-slice-e.md`.

## Goal (what the owner can do at the end)
Run a week in the five steps of SPEC §11: hours complete → exceptions resolved → rules computed →
review totals → export and invoices. Every blocking check is listed with a way to fix it; warnings
(overtime well above last week, a worker nearing 720 hours at a client) are shown but never block.
The Owner approves the run, which freezes exactly what was approved; files can only be made from an
approved run that still matches. A week already paid can be corrected: a new version pays and bills
only the differences, and the original files and invoices never change.

## Done means (evidence I will paste)
1. `pnpm test` (unit + integration + goldens), `pnpm typecheck`, `pnpm lint` — real output, green.
2. Playwright, English and Spanish: a week with a client that requires approval is blocked until the
   client approves; the Owner approves the run, creates the files; then a correction adds two hours
   and produces a differences-only payroll file and a supplemental invoice. Accessibility checks on
   every new screen.
3. Screenshots of every new screen and state, compared with the pattern files.
4. A second-opinion review of the approval snapshot, the correction differences, the correction
   payroll file and invoices (money and export changes), fixed.
5. Proposed answer keys for the correction export, checked by hand.

## Screens and their references
| Screen | Pattern file | Reference |
|---|---|---|
| converter steps (now five) | `convert.md` (updated) | Gusto run payroll (hours → review → receipt); Gusto blocker list; TempWorks proofing; Rise People and Staffology warnings |
| exceptions step | `convert.md` (updated) | Gusto blocker list (title, description, action per row); Rise/Staffology warnings that never block |
| review totals: approve, unapprove | `convert.md` (updated) | Gusto overview (Submit, cancel before processing); Check approve/reopen; Rise approve/unapprove until posted |
| files: correction versions | `convert.md` + `exports.md` (updated) | Gusto receipt; Check corrections; Stripe credit notes; Bullhorn One rebill numbering |
| client approval required | `approvals.md` (updated) | Stripe invoices list row ⋯ menu; TempWorks per-client approval setup |

## Part 1 — Exceptions, approval, new checks (tests first)
- **Steps:** Upload → Review hours → Exceptions → Review totals → Files. Moving to Exceptions computes
  the rules (SPEC "rules computed"). Exceptions lists every blocking check (one row per kind, the
  count, the people, a Fix action: back to the hours filtered, skip the workers, open Client
  approvals) and every warning; Review totals is reachable only with no blockers.
- **New blocking checks:** a client that requires approval has shifts not approved by it (Fix: Client
  approvals); a disputed shift (slice d) — already blocking.
- **New warnings:** overtime well above last week (per worker, against the previous period's
  exported run; the percent and minutes are an agency setting, effective-dated); a worker nearing
  720 hours at a client (the slice (c) heads-up, shown here).
- **Approve** (Owner only, SPEC §2): from Review totals with no blockers; records who, when, the
  totals fingerprint, the warnings acknowledged, and freezes the run's snapshot (inputs, rules
  version, lines). **Unapprove** with a reason until files exist. A change to anything after approval
  (hours, rates, settings, skips) voids the approval on the next computation, audited; files are
  created only from an approved run whose recomputed fingerprint still matches.
- **Client approval required:** a setting per client (Client approvals row menu), audited.

## Part 2 — Corrections (tests first)
- **Start a correction** on an exported period with a required reason (Owner): a new run version,
  draft; the period opens again; the paid entries become editable (client-approved ones stay approved
  when their values are unchanged since the client's decision).
- **Compute** the whole period with the same engine (overtime and counters depend on the whole
  week). **Differences** against the latest exported version, per worker, assignment, workweek,
  earning type and rate (pay) and per client the same (bill); zero differences dropped. Each line's
  explain says was / now / difference.
- **Blocking on a correction:** pay and bill minutes still match on the differences; a worker whose
  pay goes down needs a recorded decision (repaid outside payroll, written consent on file to
  deduct, or written off — never a negative line in the file; state rules on recovering an
  overpayment differ: 29 C.F.R. 531.35; M.G.L. c.149 §150 AG advisory; Cal. Lab. Code §§ 221, 224;
  820 ILCS 115/9). A warning that more pay is due by the next payday (29 C.F.R. 778.106).
- **Files:** a payroll file with only the positive differences; per client a supplemental invoice
  (more billed, numbered `{original}-S{n}`) or a credit note (less billed, `{original}-CN-{nn}`),
  each listing the differences and naming the original invoice. Earlier files never change.

## Decisions made for the owner (2026-10-16, under "keep going"; any can be reversed)
- E1 Approval is its own act (Owner only) before files, and can be undone with a reason until the
  files exist (Rise "unapprove until posted"; Check "reopen"; Gusto "cancel before processing").
- E2 Blocking checks cannot be overridden (SPEC calls them blocking; TempWorks makes rate and pay
  errors non-approvable). A worker can still be skipped and paid by hand, as today.
- E3 An overpayment is only flagged with a recorded decision, never a negative line in the payroll
  file (recovery rules differ by state and need the worker's consent in several).
- E4 Less billed: a credit note for the difference (Stripe), never cancelling the original. More
  billed: a supplemental invoice for the difference, numbered from the original (Bullhorn rebill).
- E5 Overtime warning: at least 4 hours and at least 50% more overtime than last week's exported
  run (agency setting); nothing when there is no earlier exported week (PowerPay).
- E6 "Client approval required" is off for every demo client by default and is set per client.
- E7 A later week does not wait for an earlier one (not in SPEC; each week stands on its own).

## Out of this slice
Other payroll formats (f); invoice backup bundles and templates (g); scheduling runs; editing the
approval settings per job order.
