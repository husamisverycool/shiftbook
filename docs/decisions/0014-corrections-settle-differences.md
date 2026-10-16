# 0014 — A correction settles only the differences

Status: accepted (supersedes the "paid once" consequence of 0011)
Date: 2026-10-16

## Context
0011 locked a period once its files exist, because a second "create files" would have paid and
billed the whole period again. SPEC §11 asks for corrections as a new run version, and the owner
asked for slice (e) in full. Research: `docs/research/weekly-run-slice-e.md` (Check: a paid payroll
is immutable and a correction is a new unit; TempWorks and Check net reversals inside a correction;
Stripe credit notes adjust an invoice without voiding it; Bullhorn numbers rebills from the
original). Plan: `.claude/plans/slice-e-weekly-run.md`, decisions E8–E13.

## Decision
- The Owner starts a correction of a paid period with a reason. It is the next version of the run;
  the period's lock (0011) is unchanged, and the period is "open" again until that version's files
  exist. The paid hours open again with the status they had when paid (kept in
  `time_entries.paid_status`), so a client-approved shift stays approved until it changes.
- The correction version is computed for the whole period with the same engine (overtime and the
  equal-pay counter depend on the whole week). Its lines are the period's truth; its **differences**
  are its lines minus the latest paid version's, per worker, assignment, workweek, earning type and
  rate (and per client for billing). Each amount stays rounded once on its own line; a difference is
  the exact difference of two such amounts.
- Every difference is settled once. Per worker, differences at one earning type, rate and workweek
  are added up (each workweek stands alone for overtime: 29 C.F.R. 778.104); when every sum is an
  addition at the worker's one regular rate in the period (the rate Gusto pays), the correction's
  payroll file carries them. Otherwise the Owner records a decision for the worker: "paid by hand"
  for more pay; for less pay "repaid outside payroll", "to be recovered under the worker's state
  rules" or "written off". Pay a worker kept from an earlier correction (written off, or to be
  recovered) is remembered for the period: more pay later is "covered by what they kept" (up to that
  amount) or "paid by hand", never paid again on its own. A decision keeps the amount it was made
  for; a changed or vanished difference asks again (a new decision, or removing it when nothing was
  done outside the files), and a correction holding decisions cannot be discarded. The payroll file
  never carries a negative line. A cent left over from rounding each line once, when hours move at
  one rate, is not a difference.
- Billing: per client whose billed difference is not zero, a supplemental invoice
  (`{original}-S{n}`) or a credit note (`{original}-CN-{nn}`, negative total) naming the original; a
  client billed for the first time gets an ordinary invoice. Earlier files and invoices never change.
- A correction in which nothing differs can be discarded; its paid hours lock again. In a correction a
  worker paid in the corrected version cannot be skipped (that would read as all their pay taken
  back), and one skipped in it (paid separately) cannot be brought back into the file.
- The Gusto file of a correction says so in its name and notes; a line is within half a cent per
  stored line it adds up of minutes × rate, and every line (overtime added alone included) is
  checked against the worker's single regular rate in the whole period.

## Alternatives considered
- Reverse the whole earlier version and pay the new one in full (Check, TempWorks): the agency would
  run a negative payroll in Gusto, which an hours import cannot carry, and the client would get a
  full credit and rebill for a two-hour change.
- Net a worker's overpayment against more pay elsewhere in the file: that is a deduction from wages,
  which several states allow only with the worker's written consent (Cal. Lab. Code §§ 221, 224;
  820 ILCS 115/9; M.G.L. c.149 §150), so it is a recorded decision instead.

## Consequences
- A correction can always be finished: what the file cannot carry is settled by a decision.
- Corrections of corrections compare with the latest paid version, so each difference is settled
  once even across several corrections.
- Watch: decisions are records once their version's files exist (a trigger refuses deleting them,
  except in the demo agency's reset).
