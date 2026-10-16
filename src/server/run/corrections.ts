/**
 * Corrections (SPEC §11; plan `.claude/plans/slice-e-weekly-run.md` part 2, decisions E8–E13).
 *
 * A paid period is corrected by a new version of its run: the Owner starts it with a reason, the paid
 * hours open again as they were, and the whole period is computed again with the same engine (overtime
 * and counters depend on the whole week). Its differences against the latest paid version are paid and
 * billed once: through the correction's files when every difference of a worker is an addition, or
 * by a decision the Owner records for that worker. The earlier versions' files never change.
 *
 * A decision stands for money moved outside the files, so it must keep fitting the worker's difference:
 * when the difference changes (or disappears) the run asks again, and a correction holding decisions
 * cannot be discarded. Pay an earlier correction left with the worker (written off, or to be recovered)
 * is remembered for the period, so hours that come back are not paid twice.
 */
import { formatCents, formatDuration, formatRate, RULES_VERSION } from "@shiftbook/rules";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import en from "../../../messages/en.json";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import type { Actor } from "../session";
import { clientNets } from "../files/invoice-plan";
import { differences, settlement, type DiffLine, type FileLine, type LineForDiff } from "./differences";
import { lockPeriod, openPeriod, periodState } from "./period-lock";
import { computeRun } from "./service";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const mayCorrect = (actor: Actor) => actor.role === "owner";
/** Entries a run may pay; the status a locked entry goes back to (decision E13). */
const PAYABLE = ["extracted", "reviewed", "client_approved"] as const;

type PayLineRow = typeof s.payLines.$inferSelect;
type BillLineRow = typeof s.billLines.$inferSelect;

export const payForDiff = (l: Pick<PayLineRow, "workerId" | "assignmentId" | "workweekStart" | "type" | "minutes" | "amountCents" | "rateNum" | "rateDen" | "timeEntryIds">): LineForDiff => ({
  workerId: l.workerId,
  assignmentId: l.assignmentId,
  workweekStart: l.workweekStart,
  type: l.type,
  minutes: l.minutes,
  amountCents: l.amountCents,
  rate: { num: l.rateNum, den: l.rateDen },
  timeEntryIds: l.timeEntryIds,
});

export const billForDiff = (l: Pick<BillLineRow, "clientId" | "workerId" | "assignmentId" | "workweekStart" | "type" | "minutes" | "amountCents" | "rateNum" | "rateDen" | "timeEntryIds" | "ruleId">): LineForDiff => ({
  ...payForDiff(l),
  clientId: l.clientId,
  ruleId: l.ruleId,
});

/** The latest paid version of the period before `beforeVersion` (the one a correction is against), with its lines. */
export async function paidBase(tx: Tx, payPeriodId: string, beforeVersion: number) {
  const [run] = await tx
    .select()
    .from(s.payRuns)
    .where(and(eq(s.payRuns.payPeriodId, payPeriodId), lt(s.payRuns.version, beforeVersion), inArray(s.payRuns.status, ["exported", "closed"])))
    .orderBy(desc(s.payRuns.version))
    .limit(1);
  if (!run) return null;
  const pay = await tx.select().from(s.payLines).where(eq(s.payLines.payRunId, run.id));
  const bill = await tx.select().from(s.billLines).where(eq(s.billLines.payRunId, run.id));
  return { run, pay, bill };
}

export interface DecisionOnFile {
  id: string;
  workerId: string;
  decision: s.CorrectionDecisionKind;
  differenceCents: number;
  note: string;
  decidedByLabel: string;
}

export interface WorkerSettlement {
  workerId: string;
  /** now − was, in cents. */
  netCents: number;
  /** Every difference is an addition the payroll file can carry. */
  additionsOnly: boolean;
  fileLines: FileLine[];
  /** Cents rounding left over when hours moved at one rate: not settled (noted with the file). */
  leftoverCents: number;
  /** Something besides rounding differs for this worker. */
  changed: boolean;
  /** Pay earlier corrections of the period left with the worker and not yet offset (written off, or to be recovered). */
  heldCents: number;
  /** What this correction's decisions settle, in recording order. */
  decisions: DecisionOnFile[];
  /** Agreements (written off, to be recovered, offset) that no longer fit what is owed: to be removed. */
  stale: DecisionOnFile[];
  /** What is still to settle outside the files: the difference less the decisions recorded. */
  remainingCents: number;
  /** The payroll file settles this worker's difference (all additions, nothing recorded, nothing kept). */
  inFile: boolean;
  /** A decision is needed: something is left to settle, or an agreement no longer fits. */
  needsDecision: boolean;
}

export interface CorrectionPlan {
  baseVersion: number;
  pay: DiffLine[];
  bill: DiffLine[];
  /** One per worker whose pay differs, who has decisions, or who has a rounding leftover; in worker id order. */
  workers: WorkerSettlement[];
}

/** Money that moved: paid by hand, repaid. The rest are agreements (written off, to be recovered, offset). */
export const MONEY_MOVED = new Set<s.CorrectionDecisionKind>(["paid_by_hand", "repaid_outside_payroll"]);

/**
 * The amount a decision of this kind settles, given what is left to settle and the pay the worker kept
 * from earlier corrections; or null when the kind does not fit. More pay is paid by hand, or covered by
 * what the worker kept (up to that); less pay is repaid, recovered under state rules, or written off.
 */
export function decisionAmount(decision: s.CorrectionDecisionKind, remainingCents: number, heldCents: number): number | null {
  if (decision === "paid_by_hand") return remainingCents > 0 ? remainingCents : null;
  if (decision === "offset_earlier_overpayment") return remainingCents > 0 && heldCents > 0 ? Math.min(remainingCents, heldCents) : null;
  return remainingCents < 0 ? remainingCents : null;
}

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

/**
 * The differences and how each worker's can be settled. Pure (decisions E8, E9).
 *
 * Decisions are a record of what was settled outside the files. Money that moved (paid by hand,
 * repaid) always stands; agreements must keep fitting what is owed after it, or be removed. What is
 * left after both is asked for again, so nothing is paid twice and no refund is forgotten.
 */
export function planCorrection(input: {
  baseVersion: number;
  basePay: LineForDiff[];
  baseBill: LineForDiff[];
  nowPay: LineForDiff[];
  nowBill: LineForDiff[];
  decisions: DecisionOnFile[];
  /** Per worker, pay earlier corrections of the period left with them, in cents. */
  held?: Map<string, number>;
}): CorrectionPlan {
  const pay = differences(input.basePay, input.nowPay, { baseVersion: input.baseVersion });
  const bill = differences(input.baseBill, input.nowBill, { baseVersion: input.baseVersion });
  const workers: WorkerSettlement[] = [];
  const ids = new Set([...pay.map((l) => l.workerId), ...input.decisions.map((d) => d.workerId)]);
  for (const workerId of [...ids].sort(cmp)) {
    const mine = settlement(pay.filter((l) => l.workerId === workerId));
    const decisions = input.decisions.filter((d) => d.workerId === workerId);
    const changed = mine.fileLines.length > 0 || !mine.additionsOnly;
    if (!changed && decisions.length === 0 && mine.leftoverCents === 0) continue;
    const kept = input.held?.get(workerId) ?? 0;
    const offsets = decisions.filter((d) => d.decision === "offset_earlier_overpayment").reduce((sum, d) => sum + d.differenceCents, 0);
    const heldCents = Math.max(0, kept - offsets);
    const payable = mine.netCents - mine.leftoverCents;
    // What is owed once the money that moved is counted; agreements must fit it.
    const owed = payable - decisions.filter((d) => MONEY_MOVED.has(d.decision)).reduce((sum, d) => sum + d.differenceCents, 0);
    const agreements = decisions.filter((d) => !MONEY_MOVED.has(d.decision));
    const agreed = agreements.reduce((sum, d) => sum + d.differenceCents, 0);
    const fits = agreements.every((d) => sign(d.differenceCents) === sign(owed)) && Math.abs(agreed) <= Math.abs(owed) && offsets <= kept;
    const stale = fits ? [] : agreements;
    const remainingCents = owed - (fits ? agreed : 0);
    // More pay for a worker who kept pay from an earlier correction is never paid again on its own.
    const inFile = decisions.length === 0 && changed && mine.additionsOnly && !(kept > 0 && payable > 0);
    const needsDecision = !inFile && (changed || decisions.length > 0) && (stale.length > 0 || remainingCents !== 0);
    workers.push({ workerId, ...mine, changed, heldCents, decisions, stale, remainingCents, inFile, needsDecision });
  }
  return { baseVersion: input.baseVersion, pay, bill, workers };
}

/** The workers whose differences the correction's payroll file carries: all additions, nothing to decide. */
export const fileWorkers = (plan: CorrectionPlan) => plan.workers.filter((w) => w.inFile && w.fileLines.length > 0);

/**
 * Per worker, the pay earlier paid versions of the period left with them: written off, or to be
 * recovered under their state's rules, less what a later version already offset against it.
 */
export async function heldFor(tx: Tx, payPeriodId: string, beforeVersion: number): Promise<Map<string, number>> {
  const rows = await tx
    .select({ workerId: s.correctionDecisions.workerId, decision: s.correctionDecisions.decision, differenceCents: s.correctionDecisions.differenceCents })
    .from(s.correctionDecisions)
    .innerJoin(s.payRuns, eq(s.payRuns.id, s.correctionDecisions.payRunId))
    .where(and(eq(s.payRuns.payPeriodId, payPeriodId), lt(s.payRuns.version, beforeVersion), inArray(s.payRuns.status, ["exported", "closed"])));
  const held = new Map<string, number>();
  for (const r of rows) {
    // Kept: the overpayment (a negative difference) left with the worker; an offset uses some up.
    const change = r.decision === "written_off" || r.decision === "consent_to_deduct" ? -r.differenceCents : r.decision === "offset_earlier_overpayment" ? -r.differenceCents : 0;
    held.set(r.workerId, (held.get(r.workerId) ?? 0) + change);
  }
  for (const [id, cents] of held) if (cents <= 0) held.delete(id);
  return held;
}

/** "Regular at $18.25/h −24h 00m; Regular at $19.00/h +24h 00m". */
export function describeMoves(lines: FileLine[]): string {
  return lines.map((l) => `${en.invoice.earning[l.type]} at ${formatRate(l.rate)} ${l.minutes < 0 ? "−" : "+"}${formatDuration(Math.abs(l.minutes))}`).join("; ");
}

/** The plan for a stored correction run: its lines against the latest paid version before it. */
export async function correctionPlanFor(tx: Tx, run: { id: string; payPeriodId: string; version: number }): Promise<CorrectionPlan> {
  const base = await paidBase(tx, run.payPeriodId, run.version);
  if (!base) throw new Error(`Run ${run.id} is a correction with no paid version before it.`);
  const pay = await tx.select().from(s.payLines).where(eq(s.payLines.payRunId, run.id));
  const bill = await tx.select().from(s.billLines).where(eq(s.billLines.payRunId, run.id));
  const decisions = await tx.select().from(s.correctionDecisions).where(eq(s.correctionDecisions.payRunId, run.id)).orderBy(asc(s.correctionDecisions.decidedAt), asc(s.correctionDecisions.id));
  const held = await heldFor(tx, run.payPeriodId, run.version);
  return planCorrection({ baseVersion: base.run.version, basePay: base.pay.map(payForDiff), baseBill: base.bill.map(billForDiff), nowPay: pay.map(payForDiff), nowBill: bill.map(billForDiff), decisions, held });
}

export type CorrectionError = "not_allowed" | "reason_required" | "not_paid" | "not_correction" | "has_differences" | "has_decisions" | "note_required" | "wrong_kind" | "not_needed";

/** Starts a correction of a paid period (Owner, with a reason): the next version, a draft (decision E8). */
export async function startCorrection(tx: Tx, actor: Actor, payPeriodId: string, reason: string): Promise<{ ok: true; runId: string; version: number } | { ok: false; error: CorrectionError }> {
  if (!mayCorrect(actor)) return { ok: false, error: "not_allowed" };
  const why = reason.trim();
  if (why === "") return { ok: false, error: "reason_required" };
  await lockPeriod(tx, payPeriodId);
  if ((await periodState(tx, payPeriodId)) !== "exported") return { ok: false, error: "not_paid" };
  const [latest] = await tx.select().from(s.payRuns).where(eq(s.payRuns.payPeriodId, payPeriodId)).orderBy(desc(s.payRuns.version)).limit(1);
  if (!latest) return { ok: false, error: "not_paid" };
  const [run] = await tx
    .insert(s.payRuns)
    .values({ agencyId: actor.agencyId, payPeriodId, version: latest.version + 1, status: "draft", kind: "correction", reason: why, rulesVersion: RULES_VERSION, skipped: latest.skipped })
    .returning();
  // The paid hours open again as they were when they were paid (a client-approved shift stays so).
  const opened = await tx
    .update(s.timeEntries)
    .set({ status: sql`coalesce(${s.timeEntries.paidStatus}, 'reviewed'::time_entry_status)`, updatedAt: new Date() })
    .where(and(eq(s.timeEntries.payPeriodId, payPeriodId), eq(s.timeEntries.status, "locked")))
    .returning({ id: s.timeEntries.id });
  await audit(tx, actor, [{ action: "create", entityType: "pay_run", entityId: run!.id, after: { payPeriodId, version: run!.version, kind: "correction", corrects: latest.version, entriesOpened: opened.length }, reason: `correction: ${why}` }]);
  return { ok: true, runId: run!.id, version: run!.version };
}

/** The open correction of a period (the latest run, a correction not yet paid), under the lock. */
async function openCorrection(tx: Tx, payPeriodId: string) {
  const [run] = await tx.select().from(s.payRuns).where(eq(s.payRuns.payPeriodId, payPeriodId)).orderBy(desc(s.payRuns.version)).limit(1);
  return run && run.kind === "correction" && run.status !== "exported" && run.status !== "closed" ? run : null;
}

/** Discards a correction in which nothing differs (decision E12): the version goes, the paid hours lock again. */
export async function discardCorrection(tx: Tx, actor: Actor, payPeriodId: string): Promise<{ ok: true } | { ok: false; error: CorrectionError }> {
  if (!mayCorrect(actor)) return { ok: false, error: "not_allowed" };
  await openPeriod(tx, payPeriodId);
  if (!(await openCorrection(tx, payPeriodId))) return { ok: false, error: "not_correction" };
  await computeRun(tx, actor, payPeriodId);
  const run = (await openCorrection(tx, payPeriodId))!;
  const plan = await correctionPlanFor(tx, run);
  // A decision is a record of what was settled outside the files: removed on purpose, not with a discard.
  if (plan.workers.some((w) => w.decisions.length > 0)) return { ok: false, error: "has_decisions" };
  const obligations = await tx.select({ id: s.obligations.id }).from(s.obligations).where(eq(s.obligations.payRunId, run.id));
  if (hasRealDifferences(plan) || obligations.length > 0) return { ok: false, error: "has_differences" };
  const base = (await paidBase(tx, payPeriodId, run.version))!;
  await tx.delete(s.correctionDecisions).where(eq(s.correctionDecisions.payRunId, run.id));
  await tx.delete(s.payLines).where(eq(s.payLines.payRunId, run.id));
  await tx.delete(s.billLines).where(eq(s.billLines.payRunId, run.id));
  await tx.delete(s.payRuns).where(eq(s.payRuns.id, run.id));
  const paidIds = [...new Set(base.pay.flatMap((l) => l.timeEntryIds))];
  if (paidIds.length > 0) {
    await tx
      .update(s.timeEntries)
      .set({ paidStatus: sql`${s.timeEntries.status}`, status: "locked", updatedAt: new Date() })
      .where(and(inArray(s.timeEntries.id, paidIds), inArray(s.timeEntries.status, [...PAYABLE])));
  }
  await audit(tx, actor, [{ action: "delete", entityType: "pay_run", entityId: run.id, before: { version: run.version, kind: "correction", reason: run.reason }, reason: `correction discarded: nothing differs from version ${base.run.version}` }]);
  return { ok: true };
}

/**
 * Records how part or all of what is left of a worker's difference in the open correction was settled
 * outside the files (Owner, with a note; decision E9). The amount follows from the kind: what is left,
 * or for an offset up to what the worker kept. Earlier decisions stay; one recorded by mistake is removed.
 */
export async function recordCorrectionDecision(
  tx: Tx,
  actor: Actor,
  payPeriodId: string,
  workerId: string,
  decision: s.CorrectionDecisionKind,
  note: string,
): Promise<{ ok: true } | { ok: false; error: CorrectionError }> {
  if (!mayCorrect(actor)) return { ok: false, error: "not_allowed" };
  if (!(s.CORRECTION_DECISIONS as readonly string[]).includes(decision)) return { ok: false, error: "wrong_kind" };
  const text = note.trim();
  if (text === "") return { ok: false, error: "note_required" };
  await openPeriod(tx, payPeriodId);
  if (!(await openCorrection(tx, payPeriodId))) return { ok: false, error: "not_correction" };
  const computed = await computeRun(tx, actor, payPeriodId);
  const run = (await openCorrection(tx, payPeriodId))!;
  // A worker the run holds for a decision, or whom the file refuses (then all of it is settled by hand).
  const refused = computed.blockers.some((b) => b.workerId === workerId && b.code === "export_refused");
  const mine = (await correctionPlanFor(tx, run)).workers.find((w) => w.workerId === workerId);
  if (!mine || !(mine.needsDecision || refused)) return { ok: false, error: "not_needed" };
  // An agreement that no longer fits is removed first; then what is left is decided.
  if (mine.stale.length > 0) return { ok: false, error: "wrong_kind" };
  if (mine.remainingCents === 0) return { ok: false, error: "not_needed" };
  const amount = decisionAmount(decision, mine.remainingCents, mine.heldCents);
  if (amount === null) return { ok: false, error: "wrong_kind" };
  const [row] = await tx
    .insert(s.correctionDecisions)
    .values({ agencyId: actor.agencyId, payRunId: run.id, workerId, decision, differenceCents: amount, note: text, decidedBy: actor.userId, decidedByLabel: actor.label })
    .returning();
  await audit(tx, actor, [{ action: "create", entityType: "correction_decision", entityId: row!.id, after: { payRunId: run.id, workerId, decision, differenceCents: amount, note: text } }]);
  return { ok: true };
}

/** Something besides rounding differs: a worker's pay, a decision on file, or a client's bill. */
export function hasRealDifferences(plan: CorrectionPlan): boolean {
  return plan.workers.some((w) => w.changed || w.decisions.length > 0) || [...clientNets(plan.bill).values()].some((c) => c.real);
}

/** Removes a decision recorded by mistake in the open correction (Owner): nothing was done outside the files after all. */
export async function removeCorrectionDecision(tx: Tx, actor: Actor, payPeriodId: string, decisionId: string): Promise<{ ok: true } | { ok: false; error: CorrectionError }> {
  if (!mayCorrect(actor)) return { ok: false, error: "not_allowed" };
  await openPeriod(tx, payPeriodId);
  const run = await openCorrection(tx, payPeriodId);
  if (!run) return { ok: false, error: "not_correction" };
  const [onFile] = await tx.select().from(s.correctionDecisions).where(and(eq(s.correctionDecisions.payRunId, run.id), eq(s.correctionDecisions.id, decisionId)));
  if (!onFile) return { ok: false, error: "not_needed" };
  const workerId = onFile.workerId;
  await tx.delete(s.correctionDecisions).where(eq(s.correctionDecisions.id, onFile.id));
  await audit(tx, actor, [
    {
      action: "delete",
      entityType: "correction_decision",
      entityId: onFile.id,
      before: { payRunId: run.id, workerId, decision: onFile.decision, differenceCents: onFile.differenceCents, note: onFile.note },
      reason: "decision removed",
    },
  ]);
  return { ok: true };
}

/** Plain words for a decision, for the files and notes. */
export function decisionText(d: { decision: s.CorrectionDecisionKind; differenceCents: number }): string {
  const amount = formatCents(Math.abs(d.differenceCents));
  switch (d.decision) {
    case "paid_by_hand":
      return `${amount} more pay, paid by hand`;
    case "offset_earlier_overpayment":
      return `${amount} more pay, covered by pay the worker kept from an earlier correction of this period`;
    case "repaid_outside_payroll":
      return `${amount} less pay, repaid outside payroll`;
    case "consent_to_deduct":
      return `${amount} less pay, to be recovered under the worker's state rules (written consent or repayment schedule on file)`;
    case "written_off":
      return `${amount} less pay, written off`;
  }
}
