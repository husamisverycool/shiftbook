/**
 * Pay run service (SPEC §11): turns the period's time entries into pay lines and bill lines.
 *
 * Before the engine runs, every entry is checked against the blocking checks the engine cannot see:
 * still needs review, not matched to a worker or assignment, outside the assignment's dates, no
 * rate card or billing profile in effect, a shift past midnight, no payroll id for the target system.
 * Workers a person skipped (Gusto "skip employee") are left out with their entries.
 *
 * One working run per period, computed under the period's lock: computing again with nothing
 * changed keeps the same lines (same fingerprint); a change replaces them. Once the run is exported
 * the period is locked (period-lock.ts) — in this slice a period is paid once.
 */
import { createHash } from "node:crypto";
import { addDays, computePay, NO_PLACE, RULES_VERSION, workweekStart, type Issue, type JurisdictionRule, type MinimumWageRule, type OvertimeRule, type PayInput, type Shift, type Weekday } from "@shiftbook/rules";
import { desc, eq, inArray } from "drizzle-orm";
import { ExportError } from "../../exports/errors";
import { renderExport } from "../../exports/registry";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { fileTextInputs, planInvoices } from "../files/invoice-plan";
import { payrollFixture } from "../files/payroll-fixture";
import type { Actor } from "../session";
import { openPeriod, PeriodLockedError } from "./period-lock";

export { PeriodLockedError } from "./period-lock";

/** The payroll system this slice exports to; its employee id must be on every paid worker. */
export const TARGET_PAYROLL_SYSTEM = "gusto" as const;

export type RunIssueCode =
  | Issue["code"]
  | "entry_needs_review"
  | "unmatched_entry"
  | "entry_incomplete"
  | "outside_period"
  | "outside_assignment"
  | "missing_rate"
  | "missing_billing_profile"
  | "crosses_midnight"
  | "missing_payroll_id"
  | "pay_bill_mismatch"
  | "possible_duplicate_day"
  | "export_refused"
  | "period_not_aligned"
  | "no_entries"
  | "documents_pending"
  | "document_failed"
  | "invoice_problem";

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
  /** Changes whenever any line, blocker or skip changes; "Create files" must see the same one. */
  fingerprint: string;
}

const INT4_MAX = 2_147_483_647;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const effective = (date: string, from: string, to: string | null) => from <= date && (to === null || date <= to);
/**
 * Entries that may be paid: read cleanly (high confidence), reviewed or client-approved. Locked
 * entries were already paid by an exported run and are never paid again.
 */
const PAYABLE: (typeof s.timeEntryStatus.enumValues)[number][] = ["extracted", "reviewed", "client_approved"];

/** The period's working run (not yet exported), created as a draft if there is none. Call under the lock. */
async function workingRun(tx: Tx, actor: Actor, payPeriodId: string) {
  const [latest] = await tx.select().from(s.payRuns).where(eq(s.payRuns.payPeriodId, payPeriodId)).orderBy(desc(s.payRuns.version)).limit(1);
  if (latest && (latest.status === "exported" || latest.status === "closed")) throw new PeriodLockedError();
  if (latest) return latest;
  const [created] = await tx
    .insert(s.payRuns)
    .values({ agencyId: actor.agencyId, payPeriodId, version: 1, status: "draft", rulesVersion: RULES_VERSION, skipped: [] })
    .returning();
  await audit(tx, actor, [{ action: "create", entityType: "pay_run", entityId: created!.id, after: { payPeriodId, version: created!.version } }]);
  return created!;
}

/** Leaves a worker out of (or puts them back into) the period's working run. A reason is required. */
export async function setSkipped(tx: Tx, actor: Actor, payPeriodId: string, workerId: string, change: { skipped: boolean; reason: string }): Promise<void> {
  const reason = change.reason.trim();
  if (reason === "") throw new Error("A reason is required to skip a worker or to bring them back.");
  await openPeriod(tx, payPeriodId);
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
  const period = await openPeriod(tx, payPeriodId);
  const run = await workingRun(tx, actor, payPeriodId);
  const skippedIds = new Set(run.skipped.map((x) => x.workerId));
  const workweekStartsOn = await settingOn<number>(tx, "workweek_starts_on", period.startsOn);

  // Every timesheet must be read (or archived by a person) before the period's files are made.
  const documents = (await tx.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.payPeriodId, payPeriodId))).sort((a, b) => cmp(a.id, b.id));
  // An archived timesheet was set aside by a person: none of its hours are paid.
  const archived = new Set(documents.filter((d) => d.status === "archived").map((d) => d.id));
  const entries = (await tx.select().from(s.timeEntries).where(eq(s.timeEntries.payPeriodId, payPeriodId))).filter(
    (e) => e.status !== "rejected" && !(e.sourceDocumentId && archived.has(e.sourceDocumentId)) && !(e.workerId && skippedIds.has(e.workerId)),
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
  for (const d of documents) {
    if (d.status === "received" || d.status === "reading") {
      blockers.push({ code: "documents_pending", message: `${d.filename} is still being read; its hours are not in the totals yet.` });
    } else if (d.status === "failed") {
      blockers.push({ code: "document_failed", message: `${d.filename} could not be read${d.error ? ` (${d.error})` : ""}. Read it again, or archive it with a reason if its hours are elsewhere.` });
    }
  }
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
    if (!effective(e.workDate, period.startsOn, period.endsOn)) {
      issue("outside_period", `${name} on ${e.workDate}: the date is outside the pay period (${period.startsOn} to ${period.endsOn}).`);
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
  // The same worker-day from two sources, where one has no clock times, may be the same work counted
  // twice: a person rejects one copy or adds the times (then overlapping times are caught as usual).
  const sourceOf = new Map(ordered.map((e) => [e.id, e.sourceDocumentId ?? `by-hand:${e.id}`]));
  const confirmed = new Set(ordered.filter((e) => e.distinctConfirmed).map((e) => e.id));
  const days = new Map<string, Shift[]>();
  for (const sh of shifts) days.set(`${sh.workerId}|${sh.date}`, [...(days.get(`${sh.workerId}|${sh.date}`) ?? []), sh]);
  for (const [, same] of [...days].sort((a, b) => cmp(a[0], b[0]))) {
    const sources = new Set(same.map((sh) => sourceOf.get(sh.entryIds[0]!)));
    const allConfirmed = same.every((sh) => sh.entryIds.every((id) => confirmed.has(id)));
    if (same.length > 1 && sources.size > 1 && same.some((sh) => sh.startMinute === null) && !allConfirmed) {
      const first = same[0]!;
      blockers.push({
        code: "possible_duplicate_day",
        workerId: first.workerId,
        workerName: first.workerName,
        date: first.date,
        entryIds: same.flatMap((sh) => sh.entryIds),
        message: `${first.workerName} on ${first.date}: ${same.length} entries from different timesheets, and at least one has no clock times, so the same work may be counted twice. Reject one, or confirm both are real.`,
      });
    }
  }

  // A pay period must cover whole workweeks, or a week's overtime would be split between two runs.
  const ws = workweekStartsOn as Weekday;
  const nextStart = addDays(period.endsOn, 1);
  if (workweekStart(period.startsOn, ws) !== period.startsOn || workweekStart(nextStart, ws) !== nextStart) {
    blockers.push({ code: "period_not_aligned", message: `The pay period ${period.startsOn} to ${period.endsOn} does not start and end on workweek boundaries, so weekly overtime could be split between two periods.` });
  }
  if (shifts.length === 0 && blockers.length === 0) {
    blockers.push({ code: "no_entries", message: "There are no hours to pay in this period." });
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
  // Every stored amount and rate must fit the database's integer columns.
  for (const l of [...result.payLines, ...result.billLines]) {
    if (Math.abs(l.amountCents) > INT4_MAX || l.rate.num > INT4_MAX || l.rate.den > INT4_MAX) {
      blockers.push({ code: "invalid_input", workerId: l.workerId, message: `A ${l.type} line for the workweek starting ${l.workweekStart} is too large to store; check the rates.` });
    }
  }
  // Dry run of the files: anything the payroll file or an invoice would refuse is a blocker now,
  // not an error after "Create files".
  const invoicePlan = await planInvoices(tx, period, result.billLines.map((l) => ({ clientId: l.clientId, amountCents: l.amountCents })));
  if (blockers.length === 0 && result.payLines.length > 0) {
    try {
      renderExport(await payrollFixture(tx, period, result.payLines.map((l) => ({ workerId: l.workerId, type: l.type, minutes: l.minutes, amountCents: l.amountCents, rate: l.rate }))));
    } catch (error) {
      if (!(error instanceof ExportError)) throw error;
      blockers.push({ code: "export_refused", message: error.message });
    }
    for (const problem of invoicePlan.problems) blockers.push({ code: "invoice_problem", message: problem });
  }
  // Everything the files will say, so a change after the totals were shown is caught at "Create files".
  const textInputs = await fileTextInputs(tx, actor.agencyId, invoicePlan.plans, [...new Set(result.payLines.map((l) => l.workerId))], [...new Set(result.billLines.map((l) => l.assignmentId))]);

  const status = blockers.length > 0 ? "blocked" : "ready";
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        rulesVersion: result.rulesVersion,
        pay: result.payLines,
        bill: result.billLines,
        blockers,
        warnings: result.warnings,
        skipped: run.skipped.map((x) => x.workerId).sort(cmp),
        documents: documents.map((d) => [d.id, d.status]),
        text: textInputs,
      }),
    )
    .digest("hex");
  const previous = (run.snapshot as { fingerprint?: string } | null)?.fingerprint;
  if (previous === fingerprint && run.status === status) {
    return { runId: run.id, version: run.version, status, blockers, warnings: result.warnings, skipped: run.skipped, fingerprint };
  }
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
  const snapshot = { rulesVersion: result.rulesVersion, fingerprint, input, entryIds: ordered.map((e) => e.id), skipped: run.skipped, blockers, warnings: result.warnings };
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
  return { runId: run.id, version: run.version, status, blockers, warnings: result.warnings, skipped: run.skipped, fingerprint };
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
