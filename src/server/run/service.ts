/**
 * Pay run service (SPEC §11): turns the period's time entries into pay lines and bill lines.
 *
 * Before the engine runs, every entry is checked against the blocking checks the engine cannot see:
 * still needs review, not matched to a worker or assignment, outside the assignment's dates, no
 * rate card or billing profile in effect, a shift past midnight, no payroll id for the target system.
 * Workers a person skipped (Gusto "skip employee") are left out with their entries.
 *
 * One working run per period: computing again replaces its lines. Once a run is exported, the next
 * computation starts a new version (corrections create a new run version).
 */
import { computePay, NO_PLACE, RULES_VERSION, type Issue, type JurisdictionRule, type MinimumWageRule, type OvertimeRule, type PayInput, type Shift, type Weekday } from "@shiftbook/rules";
import { desc, eq, inArray } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import type { Actor } from "../session";

/** The payroll system this slice exports to; its employee id must be on every paid worker. */
export const TARGET_PAYROLL_SYSTEM = "gusto" as const;

export type RunIssueCode =
  | Issue["code"]
  | "entry_needs_review"
  | "unmatched_entry"
  | "entry_incomplete"
  | "outside_assignment"
  | "missing_rate"
  | "missing_billing_profile"
  | "crosses_midnight"
  | "missing_payroll_id"
  | "pay_bill_mismatch";

export interface RunIssue extends Omit<Issue, "code"> {
  code: RunIssueCode;
}

export interface RunResult {
  runId: string;
  version: number;
  status: "ready" | "blocked";
  blockers: RunIssue[];
  warnings: RunIssue[];
  skipped: s.SkippedWorker[];
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const effective = (date: string, from: string, to: string | null) => from <= date && (to === null || date <= to);
/** Entries that may be paid: read cleanly (high confidence), reviewed, client-approved or locked. */
const PAYABLE: (typeof s.timeEntryStatus.enumValues)[number][] = ["extracted", "reviewed", "client_approved", "locked"];

/** The period's working run (not yet exported), created as a draft if there is none. */
async function workingRun(tx: Tx, actor: Actor, payPeriodId: string) {
  const [latest] = await tx.select().from(s.payRuns).where(eq(s.payRuns.payPeriodId, payPeriodId)).orderBy(desc(s.payRuns.version)).limit(1);
  if (latest && latest.status !== "exported" && latest.status !== "closed") return latest;
  const [created] = await tx
    .insert(s.payRuns)
    .values({ agencyId: actor.agencyId, payPeriodId, version: (latest?.version ?? 0) + 1, status: "draft", rulesVersion: RULES_VERSION, skipped: latest?.skipped ?? [] })
    .returning();
  await audit(tx, actor, [{ action: "create", entityType: "pay_run", entityId: created!.id, after: { payPeriodId, version: created!.version } }]);
  return created!;
}

/** Leaves a worker out of (or puts them back into) the period's working run. A reason is required. */
export async function setSkipped(tx: Tx, actor: Actor, payPeriodId: string, workerId: string, change: { skipped: boolean; reason: string }): Promise<void> {
  const reason = change.reason.trim();
  if (reason === "") throw new Error("A reason is required to skip a worker or to bring them back.");
  const run = await workingRun(tx, actor, payPeriodId);
  const others = run.skipped.filter((x) => x.workerId !== workerId);
  const next = change.skipped ? [...others, { workerId, reason, by: actor.label, at: new Date().toISOString() }] : others;
  await tx.update(s.payRuns).set({ skipped: next, status: "draft", updatedAt: new Date() }).where(eq(s.payRuns.id, run.id));
  await audit(tx, actor, [{ action: "update", entityType: "pay_run", entityId: run.id, before: { skipped: run.skipped.map((x) => x.workerId) }, after: { skipped: next.map((x) => x.workerId) }, reason }]);
}

async function ruleTables(tx: Tx): Promise<Pick<PayInput, "overtimeRules" | "jurisdictionRules" | "minimumWageRules">> {
  const ot = await tx.select().from(s.overtimeRules);
  const jr = await tx.select().from(s.jurisdictionRules);
  const mw = await tx.select().from(s.minimumWageRules);
  return {
    overtimeRules: ot.map(
      (r): OvertimeRule => ({
        jurisdiction: r.jurisdiction,
        ruleCode: r.ruleCode,
        kind: r.kind,
        thresholdMinutes: r.thresholdMinutes,
        multiplier: { num: r.multiplierNum, den: r.multiplierDen },
        earningType: r.earningType,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        citation: r.citation,
      }),
    ),
    jurisdictionRules: jr.map(
      (r): JurisdictionRule => ({
        jurisdiction: r.jurisdiction,
        countyFips: r.countyFips,
        placeFips: r.placeFips,
        scopeName: r.scopeName,
        ruleCode: r.ruleCode,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        citation: r.citation,
      }),
    ),
    minimumWageRules: mw.map(
      (r): MinimumWageRule => ({
        jurisdiction: r.jurisdiction,
        countyFips: r.countyFips,
        placeFips: r.placeFips,
        scopeName: r.scopeName,
        rateCents: r.rateCents,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        citation: r.citation,
      }),
    ),
  };
}

async function settingOn<T>(tx: Tx, key: string, date: string): Promise<T | undefined> {
  const rows = await tx.select().from(s.agencySettings).where(eq(s.agencySettings.key, key));
  const inEffect = rows.filter((r) => effective(date, r.effectiveFrom, r.effectiveTo));
  if (inEffect.length > 1) throw new Error(`Agency setting ${key} has ${inEffect.length} rows in effect on ${date}.`);
  return inEffect[0]?.value as T | undefined;
}

export async function computeRun(tx: Tx, actor: Actor, payPeriodId: string): Promise<RunResult> {
  const [period] = await tx.select().from(s.payPeriods).where(eq(s.payPeriods.id, payPeriodId));
  if (!period) throw new Error("pay period not found");
  const run = await workingRun(tx, actor, payPeriodId);
  const skippedIds = new Set(run.skipped.map((x) => x.workerId));
  const workweekStartsOn = await settingOn<number>(tx, "workweek_starts_on", period.startsOn);

  const entries = (await tx.select().from(s.timeEntries).where(eq(s.timeEntries.payPeriodId, payPeriodId))).filter(
    (e) => e.status !== "rejected" && !(e.workerId && skippedIds.has(e.workerId)),
  );
  const workerRows = await tx.select().from(s.workers);
  const workersById = new Map(workerRows.map((w) => [w.id, w]));
  const assignmentRows = await tx
    .select({ assignment: s.assignments, jobOrder: s.jobOrders, worksite: s.worksites })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId));
  const assignmentsById = new Map(assignmentRows.map((r) => [r.assignment.id, r]));
  const rateCards = await tx.select().from(s.rateCards);
  const profiles = await tx.select().from(s.clientBillingProfiles);

  const blockers: RunIssue[] = [];
  const shifts: Shift[] = [];
  const paidWorkers = new Set<string>();
  const ordered = [...entries].sort((a, b) => cmp(a.workerNameRaw, b.workerNameRaw) || cmp(a.workDate ?? "", b.workDate ?? "") || (a.inMinute ?? -1) - (b.inMinute ?? -1) || cmp(a.id, b.id));
  for (const e of ordered) {
    const worker = e.workerId ? workersById.get(e.workerId) : undefined;
    const name = worker ? `${worker.firstName} ${worker.lastName}` : e.workerNameRaw;
    const issue = (code: RunIssueCode, message: string) => blockers.push({ code, workerId: worker?.id, workerName: name, date: e.workDate ?? undefined, entryIds: [e.id], message });
    if (!PAYABLE.includes(e.status)) {
      issue("entry_needs_review", `${name}${e.workDate ? ` on ${e.workDate}` : ""}: this entry still needs review (${e.reviewReasons.join(", ") || e.status}).`);
      continue;
    }
    const a = e.assignmentId ? assignmentsById.get(e.assignmentId) : undefined;
    if (!worker || !a || a.assignment.workerId !== worker.id) {
      issue("unmatched_entry", `"${e.workerNameRaw}"${e.workDate ? ` on ${e.workDate}` : ""} is not matched to a worker and an assignment, so it cannot be paid or billed.`);
      continue;
    }
    if (!e.workDate || e.minutes === null) {
      issue("entry_incomplete", `${name}: the entry has no ${!e.workDate ? "date" : "worked minutes"}.`);
      continue;
    }
    if (!effective(e.workDate, a.assignment.startDate, a.assignment.endDate) || a.assignment.status === "cancelled") {
      issue("outside_assignment", `${name} on ${e.workDate}: the date is outside the assignment (${a.assignment.startDate} to ${a.assignment.endDate ?? "open"}).`);
      continue;
    }
    if (e.outMinute !== null && e.outMinute > 1440) {
      issue("crosses_midnight", `${name} on ${e.workDate}: the shift runs past midnight; split it at midnight so each day carries its own minutes.`);
      continue;
    }
    const cards = rateCards.filter((r) => r.jobOrderId === a.jobOrder.id && effective(e.workDate!, r.effectiveFrom, r.effectiveTo));
    if (cards.length !== 1) {
      issue("missing_rate", `${name} on ${e.workDate}: ${cards.length === 0 ? "no rate card is" : `${cards.length} rate cards are`} in effect for ${a.jobOrder.position}.`);
      continue;
    }
    const profile = profiles.filter((p) => p.clientId === a.jobOrder.clientId && effective(e.workDate!, p.effectiveFrom, p.effectiveTo));
    if (profile.length !== 1) {
      issue("missing_billing_profile", `${name} on ${e.workDate}: ${profile.length === 0 ? "no billing profile is" : `${profile.length} billing profiles are`} in effect for the client.`);
      continue;
    }
    const card = cards[0]!;
    paidWorkers.add(worker.id);
    shifts.push({
      entryIds: [e.id],
      workerId: worker.id,
      workerName: name,
      assignmentId: a.assignment.id,
      clientId: a.jobOrder.clientId,
      jurisdiction: a.worksite.state,
      countyFips: a.worksite.countyFips ?? "",
      placeFips: a.worksite.placeFips ?? (a.worksite.outsideAnyPlace ? NO_PLACE : null),
      date: e.workDate,
      startMinute: e.inMinute,
      minutes: e.minutes,
      payRateCents: card.payRateCents,
      billRateCents: card.billRateCents,
      billOtMultiplier: { num: card.otMultiplierNum, den: card.otMultiplierDen },
      otBillingRule: profile[0]!.overtimeBillingRule,
    });
  }
  for (const id of [...paidWorkers].sort(cmp)) {
    const w = workersById.get(id)!;
    if (!w.payrollIds[TARGET_PAYROLL_SYSTEM]?.id) {
      blockers.push({ code: "missing_payroll_id", workerId: id, workerName: `${w.firstName} ${w.lastName}`, message: `${w.firstName} ${w.lastName} has no Gusto employee id, so the payroll file could not match them.` });
    }
  }

  const input: PayInput = { workweekStartsOn: workweekStartsOn as Weekday, shifts, ...(await ruleTables(tx)) };
  const result = computePay(input);
  blockers.push(...result.blockers);

  // Pay and bill lines must carry the same minutes for each worker, assignment, week and type.
  const minutes = new Map<string, number>();
  for (const l of result.payLines) minutes.set(`${l.workerId}|${l.assignmentId}|${l.workweekStart}|${l.type}`, (minutes.get(`${l.workerId}|${l.assignmentId}|${l.workweekStart}|${l.type}`) ?? 0) + l.minutes);
  for (const l of result.billLines) minutes.set(`${l.workerId}|${l.assignmentId}|${l.workweekStart}|${l.type}`, (minutes.get(`${l.workerId}|${l.assignmentId}|${l.workweekStart}|${l.type}`) ?? 0) - l.minutes);
  for (const [key, diff] of [...minutes].sort((a, b) => cmp(a[0], b[0]))) {
    if (diff !== 0) blockers.push({ code: "pay_bill_mismatch", workerId: key.split("|")[0], message: `Pay and bill minutes differ by ${diff} for ${key}.` });
  }

  const status = blockers.length > 0 ? "blocked" : "ready";
  await tx.delete(s.payLines).where(eq(s.payLines.payRunId, run.id));
  await tx.delete(s.billLines).where(eq(s.billLines.payRunId, run.id));
  if (result.payLines.length > 0) {
    await tx.insert(s.payLines).values(
      result.payLines.map((l) => ({
        agencyId: actor.agencyId,
        payRunId: run.id,
        workerId: l.workerId,
        assignmentId: l.assignmentId,
        timeEntryIds: l.entryIds,
        workweekStart: l.workweekStart,
        type: l.type,
        minutes: l.minutes,
        rateNum: l.rate.num,
        rateDen: l.rate.den,
        amountCents: l.amountCents,
        ruleId: l.ruleId,
        explain: l.explain,
      })),
    );
  }
  if (result.billLines.length > 0) {
    await tx.insert(s.billLines).values(
      result.billLines.map((l) => ({
        agencyId: actor.agencyId,
        payRunId: run.id,
        clientId: l.clientId,
        workerId: l.workerId,
        assignmentId: l.assignmentId,
        timeEntryIds: l.entryIds,
        workweekStart: l.workweekStart,
        type: l.type,
        minutes: l.minutes,
        rateNum: l.rate.num,
        rateDen: l.rate.den,
        amountCents: l.amountCents,
        ruleId: l.ruleId,
        explain: l.explain,
      })),
    );
  }
  const snapshot = { rulesVersion: result.rulesVersion, input, entryIds: ordered.map((e) => e.id), skipped: run.skipped, blockers, warnings: result.warnings };
  await tx
    .update(s.payRuns)
    .set({ status, rulesVersion: result.rulesVersion, blockers, warnings: result.warnings, snapshot, updatedAt: new Date() })
    .where(eq(s.payRuns.id, run.id));
  await audit(tx, actor, [
    {
      action: "update",
      entityType: "pay_run",
      entityId: run.id,
      after: { status, rulesVersion: result.rulesVersion, payLines: result.payLines.length, billLines: result.billLines.length, blockers: blockers.length },
      reason: "computed",
    },
  ]);
  return { runId: run.id, version: run.version, status, blockers, warnings: result.warnings, skipped: run.skipped };
}

/** The period's latest run with its lines, for the review screens. */
export async function loadRun(tx: Tx, payPeriodId: string) {
  const [run] = await tx.select().from(s.payRuns).where(eq(s.payRuns.payPeriodId, payPeriodId)).orderBy(desc(s.payRuns.version)).limit(1);
  if (!run) return null;
  const pay = await tx.select().from(s.payLines).where(eq(s.payLines.payRunId, run.id));
  const bill = await tx.select().from(s.billLines).where(eq(s.billLines.payRunId, run.id));
  const ids = [...new Set([...pay, ...bill].map((l) => l.workerId))];
  const people = ids.length > 0 ? await tx.select().from(s.workers).where(inArray(s.workers.id, ids)) : [];
  return { run, payLines: pay, billLines: bill, workers: people };
}
