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
 * the period is locked (period-lock.ts) until a correction opens it again: a correction version is
 * computed for the whole period like any run, and settles only its differences against the latest
 * paid version (corrections.ts).
 */
import { createHash } from "node:crypto";
import { hoursMinutes } from "../../components/shiftbook/format";
import { addDays, addMonths, computePay, formatCents, NO_PLACE, RULES_VERSION, WORKED_TIME, workweekStart, type Bonus, type Confirmation, type HolidayPolicy, type HoursWorked, type Issue, type JurisdictionRule, type MinimumWageRule, type OvertimeRule, type PayInput, type Shift, type Weekday } from "@shiftbook/rules";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { ExportError } from "../../exports/errors";
import { renderExport } from "../../exports/registry";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import type { ExportPayLine } from "../../exports/registry";
import { fileTextInputs, planCorrectionInvoices, planInvoices } from "../files/invoice-plan";
import { billFromMarkup } from "../catalog/versions";
import { settingOn } from "../settings";
import { isStuck } from "../intake/service";
import { payrollFixture, payrollSettings } from "../files/payroll-fixture";
import { SYSTEM_NAME, SYSTEM_OF, WORKER_ID_NAME } from "../../exports/targets";
import type { Actor } from "../session";
import { billForDiff, decisionText, describeMoves, fileWorkers, hasRealDifferences, heldFor, paidBase, payForDiff, planCorrection, type CorrectionPlan } from "./corrections";
import type { RunIssueCode } from "./issue-codes";
import { openPeriod, PeriodLockedError } from "./period-lock";

export { PeriodLockedError } from "./period-lock";
export { settingOn } from "../settings";

/** The payroll system this slice exports to; its employee id must be on every paid worker. */

export type { RunIssueCode } from "./issue-codes";

export interface RunIssue extends Omit<Issue, "code"> {
  code: RunIssueCode;
  /** export_refused: the worker's gross pay this period, so a person skipping them knows what to pay by hand. In a correction: their difference. */
  grossCents?: number;
  /** A correction: pay an earlier correction of the period left with the worker (an offset may cover more pay). */
  heldCents?: number;
}

export interface RunResult {
  runId: string;
  version: number;
  /** "correction": a later version of a paid period, settling only its differences (slice e). */
  kind: "regular" | "correction";
  /** "approved": the Owner approved it and nothing has changed since (slice e). */
  status: "ready" | "blocked" | "approved";
  blockers: RunIssue[];
  warnings: RunIssue[];
  skipped: s.SkippedWorker[];
  /** Changes whenever any line, blocker or skip changes; "Create files" must see the same one. */
  fingerprint: string;
}

const INT4_MAX = 2_147_483_647;
/** Line types that are worked time, billed minute for minute (pay-only lines are not billed time). */
const BILLED_TIME = new Set<string>(WORKED_TIME);
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

/** In a correction, a worker paid in the version it corrects cannot be skipped (decision E10). */
export class SkipRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkipRefusedError";
  }
}

/** Leaves a worker out of (or puts them back into) the period's working run. A reason is required. */
export async function setSkipped(tx: Tx, actor: Actor, payPeriodId: string, workerId: string, change: { skipped: boolean; reason: string }): Promise<void> {
  const reason = change.reason.trim();
  if (reason === "") throw new Error("A reason is required to skip a worker or to bring them back.");
  await openPeriod(tx, payPeriodId);
  const run = await workingRun(tx, actor, payPeriodId);
  if (run.kind === "correction") {
    const base = await paidBase(tx, payPeriodId, run.version);
    const [w] = await tx.select().from(s.workers).where(eq(s.workers.id, workerId));
    const name = w ? `${w.firstName} ${w.lastName}` : "This worker";
    if (change.skipped && base?.pay.some((l) => l.workerId === workerId)) {
      throw new SkipRefusedError(`${name} was paid in version ${base.run.version}, so skipping them in this correction would read as all their pay taken back. Fix what holds them, or record a decision for their difference.`);
    }
    // Skipped then means paid separately: through this correction's file it would be paid again.
    if (!change.skipped && base?.run.skipped.some((x) => x.workerId === workerId)) {
      throw new SkipRefusedError(`${name} was skipped in version ${base.run.version} and paid separately, so a correction cannot bring them back into the payroll file. Settle any difference for them by hand.`);
    }
  }
  const others = run.skipped.filter((x) => x.workerId !== workerId);
  const next = change.skipped ? [...others, { workerId, reason, by: actor.label, at: new Date().toISOString() }] : others;
  await tx.update(s.payRuns).set({ skipped: next, status: "draft", updatedAt: new Date() }).where(eq(s.payRuns.id, run.id));
  await audit(tx, actor, [{ action: "update", entityType: "pay_run", entityId: run.id, before: { skipped: run.skipped.map((x) => x.workerId) }, after: { skipped: next.map((x) => x.workerId) }, reason }]);
}

async function ruleTables(tx: Tx): Promise<Pick<PayInput, "overtimeRules" | "jurisdictionRules" | "minimumWageRules" | "premiumRules" | "guaranteeRules" | "equalPayRules" | "regularRateRules">> {
  const ep = await tx.select().from(s.equalPayRules);
  const rr = await tx.select().from(s.regularRateRules);
  const ot = await tx.select().from(s.overtimeRules);
  const jr = await tx.select().from(s.jurisdictionRules);
  const mw = await tx.select().from(s.minimumWageRules);
  const pr = await tx.select().from(s.premiumRules);
  const gr = await tx.select().from(s.guaranteeRules);
  return {
    guaranteeRules: gr.map((r) => ({
      jurisdiction: r.jurisdiction,
      ruleCode: r.ruleCode,
      dueMinutes: r.dueMinutes,
      reassignedDueMinutes: r.reassignedDueMinutes,
      scheduledFraction: r.scheduledFractionNum !== null && r.scheduledFractionDen !== null ? { num: r.scheduledFractionNum, den: r.scheduledFractionDen } : null,
      minMinutes: r.minMinutes,
      maxMinutes: r.maxMinutes,
      minScheduledMinutes: r.minScheduledMinutes,
      basis: r.basis,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      citation: r.citation,
    })),
    premiumRules: pr.map((r) => ({ jurisdiction: r.jurisdiction, ruleCode: r.ruleCode, premiumMinutes: r.premiumMinutes, perWorkdayMax: r.perWorkdayMax, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, citation: r.citation })),
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
    regularRateRules: rr.map((r) => ({ jurisdiction: r.jurisdiction, ruleCode: r.ruleCode, multiplier: { num: r.multiplierNum, den: r.multiplierDen }, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, citation: r.citation })),
    equalPayRules: ep.map((r) => ({
      jurisdiction: r.jurisdiction,
      ruleCode: r.ruleCode,
      countsFrom: r.countsFrom,
      warnMinutes: r.warnMinutes,
      windowMonths: r.windowMonths,
      triggerMinutes: r.triggerMinutes,
      longWindowMonths: r.longWindowMonths,
      longTriggerMinutes: r.longTriggerMinutes,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      citation: r.citation,
    })),
  };
}

/** A bill rate the rate card worked out from a markup carries its working onto the bill line. */
function billRateExplain(card: typeof s.rateCards.$inferSelect): { billRateExplain?: string } {
  if (card.markupBp === null) return {};
  const worked = billFromMarkup(card.payRateCents, card.markupBp);
  return worked.rateCents === card.billRateCents ? { billRateExplain: worked.explain } : {};
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
  const workerNameOf = (id: string) => {
    const w = workersById.get(id);
    return w ? `${w.firstName} ${w.lastName}` : undefined;
  };
  const assignmentRows = await tx
    .select({ assignment: s.assignments, jobOrder: s.jobOrders, worksite: s.worksites })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId));
  const assignmentsById = new Map(assignmentRows.map((r) => [r.assignment.id, r]));
  const rateCards = await tx.select().from(s.rateCards);
  const clientNames = new Map((await tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients)).map((c) => [c.id, c.name]));
  const profiles = await tx.select().from(s.clientBillingProfiles);

  // What a person confirmed for days in this period: missed meal or rest periods, short days (the engine computes, a person confirms).
  const confirmations: Confirmation[] = (await tx.select().from(s.premiumConfirmations).where(and(gte(s.premiumConfirmations.workDate, period.startsOn), lte(s.premiumConfirmations.workDate, period.endsOn))))
    .filter((c) => !skippedIds.has(c.workerId))
    .map((c) => ({ id: c.id, kind: c.kind, workerId: c.workerId, workerName: workerNameOf(c.workerId), assignmentId: c.assignmentId, date: c.workDate, scheduledMinutes: c.scheduledMinutes, reassigned: c.reassigned }))
    .sort((a, b) => cmp(a.id, b.id));
  // The agency's holiday policies (a client's own never lowers the agency's for its worker), and bonuses
  // entered for the workweeks of this period. A bonus whose week is not a workweek of the period holds its worker.
  const holidayPolicies: HolidayPolicy[] = (await tx.select().from(s.holidayPolicies))
    .map((p) => ({
      clientId: p.clientId,
      name: p.name,
      dates: p.holidayDates,
      workedMultiplier: { num: p.workedMultiplierNum, den: p.workedMultiplierDen },
      notWorkedMinutes: p.notWorkedMinutes,
      billWorkedMultiplier: p.billWorkedMultiplierNum !== null && p.billWorkedMultiplierDen !== null ? { num: p.billWorkedMultiplierNum, den: p.billWorkedMultiplierDen } : null,
      billNotWorked: p.billNotWorked,
    }))
    .sort((a, b) => cmp(a.clientId ?? "", b.clientId ?? "") || cmp(a.name, b.name));
  const bonuses: Bonus[] = (await tx.select().from(s.bonuses).where(and(gte(s.bonuses.workweekStart, period.startsOn), lte(s.bonuses.workweekStart, period.endsOn))))
    .filter((b) => !skippedIds.has(b.workerId))
    .map((b) => ({ id: b.id, workerId: b.workerId, workerName: workerNameOf(b.workerId), assignmentId: b.assignmentId, workweekStart: b.workweekStart, amountCents: b.amountCents, kind: b.kind }))
    .sort((a, b) => cmp(a.id, b.id));

  /** The shift for an assignment on a date with that day's rate card, billing profile and worksite; or why there is none. */
  const shiftOn = (
    a: (typeof assignmentRows)[number],
    date: string,
    base: Pick<Shift, "entryIds" | "workerId" | "workerName" | "startMinute" | "minutes"> & { reportedOnly?: true },
  ): Shift | { code: RunIssueCode; message: string } => {
    // A worker's own rates on this assignment apply on the dates they cover; the job order's otherwise.
    const covering = rateCards.filter((r) => r.jobOrderId === a.jobOrder.id && effective(date, r.effectiveFrom, r.effectiveTo));
    const own = covering.filter((r) => r.assignmentId === a.assignment.id);
    const cards = own.length > 0 ? own : covering.filter((r) => r.assignmentId === null);
    if (cards.length !== 1) return { code: "missing_rate", message: `${base.workerName} on ${date}: ${cards.length === 0 ? "no rate card is" : `${cards.length} rate cards are`} in effect for ${a.jobOrder.position}.` };
    const profile = profiles.filter((p) => p.clientId === a.jobOrder.clientId && effective(date, p.effectiveFrom, p.effectiveTo));
    if (profile.length !== 1) return { code: "missing_billing_profile", message: `${base.workerName} on ${date}: ${profile.length === 0 ? "no billing profile is" : `${profile.length} billing profiles are`} in effect for the client.` };
    const card = cards[0]!;
    return {
      ...base,
      assignmentId: a.assignment.id,
      clientId: a.jobOrder.clientId,
      clientName: clientNames.get(a.jobOrder.clientId),
      jurisdiction: a.worksite.state,
      countyFips: a.worksite.countyFips ?? "",
      placeFips: a.worksite.placeFips ?? (a.worksite.outsideAnyPlace ? NO_PLACE : null),
      date,
      payRateCents: card.payRateCents,
      billRateCents: card.billRateCents,
      ...billRateExplain(card),
      billOtMultiplier: { num: card.otMultiplierNum, den: card.otMultiplierDen },
      billDtMultiplier: { num: card.dtMultiplierNum, den: card.dtMultiplierDen },
      otBillingRule: profile[0]!.overtimeBillingRule,
      billsPremiums: profile[0]!.billPremiums,
      billsGuarantees: profile[0]!.billGuarantees,
      dayAndTemporaryLabor: a.jobOrder.dayAndTemporaryLabor,
    };
  };

  const blockers: RunIssue[] = [];
  for (const d of documents) {
    if (isStuck(d)) {
      blockers.push({ code: "document_failed", message: `${d.filename}: reading stopped before it finished. Read it again, or archive it with a reason if its hours are elsewhere.` });
    } else if (d.status === "received" || d.status === "reading") {
      blockers.push({ code: "documents_pending", message: `${d.filename} is still being read; its hours are not in the totals yet.` });
    } else if (d.status === "failed") {
      blockers.push({ code: "document_failed", message: `${d.filename} could not be read${d.error ? ` (${d.error})` : ""}. Read it again, or archive it with a reason if its hours are elsewhere.` });
    }
  }
  const disputedIds = entries.filter((e) => e.status === "disputed").map((e) => e.id);
  const disputeReasons = new Map(
    (disputedIds.length > 0 ? await tx.select({ entryId: s.clientDisputes.timeEntryId, reason: s.clientDisputes.reason }).from(s.clientDisputes).where(and(inArray(s.clientDisputes.timeEntryId, disputedIds), eq(s.clientDisputes.status, "open"))) : []).map((d) => [d.entryId, d.reason]),
  );
  const shifts: Shift[] = [];
  const paidWorkers = new Set<string>();
  const ordered = [...entries].sort((a, b) => cmp(a.workerNameRaw, b.workerNameRaw) || cmp(a.workDate ?? "", b.workDate ?? "") || (a.inMinute ?? -1) - (b.inMinute ?? -1) || cmp(a.id, b.id));
  for (const e of ordered) {
    const worker = e.workerId ? workersById.get(e.workerId) : undefined;
    const name = worker ? `${worker.firstName} ${worker.lastName}` : e.workerNameRaw;
    const issue = (code: RunIssueCode, message: string) => blockers.push({ code, workerId: worker?.id, workerName: name, date: e.workDate ?? undefined, entryIds: [e.id], message });
    if (e.status === "disputed") {
      // A shift the client disputed is neither paid nor billed until the agency settles it (slice d).
      issue("client_dispute_open", `${name}${e.workDate ? ` on ${e.workDate}` : ""}: the client disputed this shift${disputeReasons.has(e.id) ? ` ("${disputeReasons.get(e.id)}")` : ""}; settle it in Client approvals.`);
      continue;
    }
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
    if (a.assignment.status === "cancelled") {
      issue("outside_assignment", `${name} on ${e.workDate}: the assignment was cancelled, so these hours cannot be paid on it.`);
      continue;
    }
    if (!effective(e.workDate, a.assignment.startDate, a.assignment.endDate)) {
      issue("outside_assignment", `${name} on ${e.workDate}: the date is outside the assignment (${a.assignment.startDate} to ${a.assignment.endDate ?? "open"}).`);
      continue;
    }
    if (e.outMinute !== null && e.outMinute > 1440) {
      issue("crosses_midnight", `${name} on ${e.workDate}: the shift runs past midnight; split it at midnight so each day carries its own minutes.`);
      continue;
    }
    const built = shiftOn(a, e.workDate, { entryIds: [e.id], workerId: worker.id, workerName: name, startMinute: e.inMinute, minutes: e.minutes });
    if ("code" in built) {
      issue(built.code, built.message);
      continue;
    }
    paidWorkers.add(worker.id);
    shifts.push(built);
  }

  // A day a worker reported (or was sent) and did no work at all, or a holiday not worked, confirmed
  // by a person, is a 0-minute day on its assignment: only reporting, day-labor minimum or holiday
  // pay can follow from it. One such day per worker, assignment and date.
  for (const c of confirmations.filter((x) => x.kind === "reported_short" || x.kind === "holiday_not_worked")) {
    if (shifts.some((sh) => sh.workerId === c.workerId && sh.assignmentId === c.assignmentId && sh.date === c.date)) continue;
    const worker = workersById.get(c.workerId);
    const a = assignmentsById.get(c.assignmentId);
    const name = worker ? `${worker.firstName} ${worker.lastName}` : c.workerId;
    const issue = (code: RunIssueCode, message: string) => blockers.push({ code, workerId: c.workerId, workerName: name, date: c.date, message });
    if (skippedIds.has(c.workerId)) continue;
    if (!worker || !a || a.assignment.workerId !== worker.id || a.assignment.status === "cancelled" || !effective(c.date, a.assignment.startDate, a.assignment.endDate)) {
      issue("outside_assignment", `${name} on ${c.date}: a confirmed ${c.kind === "holiday_not_worked" ? "holiday not worked" : "short day"} is not on an assignment the worker has that day.`);
      continue;
    }
    const built = shiftOn(a, c.date, { entryIds: [], workerId: worker.id, workerName: name, startMinute: null, minutes: 0, reportedOnly: true });
    if ("code" in built) {
      issue(built.code, built.message);
      continue;
    }
    paidWorkers.add(worker.id);
    shifts.push(built);
  }
  // The same worker-day from two sources, where one has no clock times, may be the same work counted
  // twice: a person rejects one copy or adds the times (then overlapping times are caught as usual).
  const sourceOf = new Map(ordered.map((e) => [e.id, e.sourceDocumentId ?? `by-hand:${e.id}`]));
  const confirmed = new Set(ordered.filter((e) => e.distinctConfirmed).map((e) => e.id));
  const days = new Map<string, Shift[]>();
  // (A day reported without work has no entry and no minutes: it is never a copy of other work.)
  for (const sh of shifts.filter((x) => !x.reportedOnly)) days.set(`${sh.workerId}|${sh.date}`, [...(days.get(`${sh.workerId}|${sh.date}`) ?? []), sh]);
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

  // A client that requires approval: every shift of its that would be paid must be approved by it
  // (SPEC §11 "client approval missing where required"; slice e).
  const mustApprove = new Map((await tx.select({ id: s.clients.id, name: s.clients.name, required: s.clients.approvalRequired }).from(s.clients)).filter((c) => c.required).map((c) => [c.id, c.name]));
  if (mustApprove.size > 0) {
    const statusOf = new Map(entries.map((e) => [e.id, e.status]));
    const waiting = new Map<string, string[]>();
    for (const sh of shifts) {
      if (!mustApprove.has(sh.clientId)) continue;
      for (const id of sh.entryIds) if (statusOf.get(id) !== "client_approved") waiting.set(sh.clientId, [...(waiting.get(sh.clientId) ?? []), id]);
    }
    for (const [clientId, ids] of [...waiting].sort((a, b) => cmp(mustApprove.get(a[0])!, mustApprove.get(b[0])!))) {
      const unique = [...new Set(ids)].sort(cmp);
      blockers.push({
        code: "client_approval_missing",
        entryIds: unique,
        message: `${mustApprove.get(clientId)}: ${unique.length === 1 ? "1 shift is" : `${unique.length} shifts are`} not approved by the client yet.`,
      });
    }
  }
  // The payroll file goes to the system in the agency's payroll file settings (slice f, F1).
  const payroll = await payrollSettings(tx);
  if (!payroll) blockers.push({ code: "no_payroll_target", message: "No payroll system is chosen yet, so there is no payroll file to make. Choose it in the payroll file settings." });
  // (A correction checks only the workers its file will carry: the file's dry run below names them.)
  const system = payroll ? SYSTEM_OF[payroll.target.format] : null;
  for (const id of run.kind === "correction" || !system ? [] : [...paidWorkers].sort(cmp)) {
    const w = workersById.get(id)!;
    if (!w.payrollIds[system!]?.id) {
      blockers.push({
        code: "missing_payroll_id",
        workerId: id,
        workerName: `${w.firstName} ${w.lastName}`,
        message: `${w.firstName} ${w.lastName} has no ${WORKER_ID_NAME[system!]}, so the ${SYSTEM_NAME[system!]} payroll file could not match them.`,
      });
    }
  }

  // A correction settles only its differences against the latest paid version (decisions E8, E9).
  const base = run.kind === "correction" ? await paidBase(tx, payPeriodId, run.version) : null;
  if (run.kind === "correction" && !base) throw new Error(`Run ${run.id} is a correction with no paid version before it.`);
  const decisions = base ? await tx.select().from(s.correctionDecisions).where(eq(s.correctionDecisions.payRunId, run.id)).orderBy(asc(s.correctionDecisions.decidedAt), asc(s.correctionDecisions.id)) : [];
  const held = base ? await heldFor(tx, payPeriodId, run.version) : new Map<string, number>();

  const tables = await ruleTables(tx);
  // Hours worked before this period that count toward a rolling equal-pay counter (Illinois § 42):
  // covered work at a worksite in a state with a counter, on timesheets not set aside, as far back as
  // the longest window; and the obligations already on file from other runs (a crossing never resets).
  const counterStates = [...new Set((tables.equalPayRules ?? []).map((r) => r.jurisdiction))].sort(cmp);
  const longest = Math.max(0, ...(tables.equalPayRules ?? []).map((r) => r.longWindowMonths));
  const runWorkers = [...new Set(shifts.map((sh) => sh.workerId))].sort(cmp);
  let hoursWorked: HoursWorked[] = [];
  if (counterStates.length > 0 && runWorkers.length > 0) {
    const rows = await tx
      .select({ workerId: s.timeEntries.workerId, clientId: s.jobOrders.clientId, date: s.timeEntries.workDate, minutes: sql<number>`sum(${s.timeEntries.minutes})::int` })
      .from(s.timeEntries)
      .innerJoin(s.assignments, eq(s.assignments.id, s.timeEntries.assignmentId))
      .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
      .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId))
      .leftJoin(s.sourceDocuments, eq(s.sourceDocuments.id, s.timeEntries.sourceDocumentId))
      .where(
        and(
          inArray(s.timeEntries.workerId, runWorkers),
          gte(s.timeEntries.workDate, addMonths(period.startsOn, -longest)),
          lt(s.timeEntries.workDate, period.startsOn),
          ne(s.timeEntries.status, "rejected"),
          isNotNull(s.timeEntries.minutes),
          inArray(s.worksites.state, counterStates),
          eq(s.jobOrders.dayAndTemporaryLabor, true),
          or(isNull(s.sourceDocuments.id), ne(s.sourceDocuments.status, "archived")),
        ),
      )
      .groupBy(s.timeEntries.workerId, s.jobOrders.clientId, s.timeEntries.workDate);
    hoursWorked = rows
      .filter((r): r is { workerId: string; clientId: string; date: string; minutes: number } => r.workerId !== null && r.date !== null)
      .sort((a, b) => cmp(a.workerId, b.workerId) || cmp(a.clientId, b.clientId) || cmp(a.date, b.date));
  }
  // This run's own obligations are recomputed, except one a person already marked done.
  const obligationsOnFile = (await tx.select().from(s.obligations).where(or(isNull(s.obligations.payRunId), ne(s.obligations.payRunId, run.id), eq(s.obligations.status, "done"))))
    .map((o) => ({ kind: o.kind, workerId: o.workerId, clientId: o.clientId, crossedOn: o.crossedOn }))
    .sort((a, b) => cmp(a.workerId, b.workerId) || cmp(a.clientId, b.clientId) || cmp(a.kind, b.kind));
  const input: PayInput = { workweekStartsOn: workweekStartsOn as Weekday, shifts, confirmations, holidayPolicies, bonuses, hoursWorked, obligationsOnFile, ...tables };
  const result = computePay(input);
  blockers.push(...result.blockers);
  const warnings: RunIssue[] = [...result.warnings, ...(await overtimeSpikes(tx, period, result.payLines, workerNameOf))];

  // Pay and bill lines must carry the same worked minutes for each worker, assignment, week and type
  // (a minimum-wage top-up or a premium is pay only: it is not billed time).
  const minutes = new Map<string, number>();
  for (const l of result.payLines.filter((x) => BILLED_TIME.has(x.type))) minutes.set(`${l.workerId}|${l.assignmentId}|${l.workweekStart}|${l.type}`, (minutes.get(`${l.workerId}|${l.assignmentId}|${l.workweekStart}|${l.type}`) ?? 0) + l.minutes);
  for (const l of result.billLines.filter((x) => BILLED_TIME.has(x.type))) minutes.set(`${l.workerId}|${l.assignmentId}|${l.workweekStart}|${l.type}`, (minutes.get(`${l.workerId}|${l.assignmentId}|${l.workweekStart}|${l.type}`) ?? 0) - l.minutes);
  for (const [key, diff] of [...minutes].sort((a, b) => cmp(a[0], b[0]))) {
    if (diff !== 0) blockers.push({ code: "pay_bill_mismatch", workerId: key.split("|")[0], message: `Pay and bill minutes differ by ${diff} for ${key}.` });
  }
  // Every stored amount and rate must fit the database's integer columns.
  for (const l of [...result.payLines, ...result.billLines]) {
    if (Math.abs(l.amountCents) > INT4_MAX || l.rate.num > INT4_MAX || l.rate.den > INT4_MAX) {
      blockers.push({ code: "invalid_input", workerId: l.workerId, message: `A ${l.type} line for the workweek starting ${l.workweekStart} is too large to store; check the rates.` });
    }
  }
  // A correction: what differs, and how each worker's difference is settled.
  const correction: CorrectionPlan | null = base
    ? planCorrection({
        baseVersion: base.run.version,
        basePay: base.pay.map(payForDiff),
        baseBill: base.bill.map(billForDiff),
        nowPay: result.payLines.map((l) => ({ workerId: l.workerId, assignmentId: l.assignmentId, workweekStart: l.workweekStart, type: l.type, minutes: l.minutes, amountCents: l.amountCents, rate: l.rate, timeEntryIds: l.entryIds })),
        nowBill: result.billLines.map((l) => ({ clientId: l.clientId, workerId: l.workerId, assignmentId: l.assignmentId, workweekStart: l.workweekStart, type: l.type, minutes: l.minutes, amountCents: l.amountCents, rate: l.rate, timeEntryIds: l.entryIds, ruleId: l.ruleId })),
        decisions,
        held,
      })
    : null;
  if (correction) {
    for (const w of correction.workers) {
      const name = workerNameOf(w.workerId) ?? w.workerId;
      // Due: the difference less rounding, less money already moved (a refund owed after a repayment counts).
      const due = w.owedCents;
      if (due > 0) {
        warnings.push({
          code: "correction_pay_due",
          workerId: w.workerId,
          workerName: name,
          grossCents: due,
          message: `${name}: ${formatCents(due)} more pay is due than has been paid for this period. Pay it as soon as possible, no later than the next regular payday: pay that was missed is already late. Overtime that could not be computed in time is due no later than the next payday after it can be computed (29 C.F.R. § 778.106). State pay-day laws also apply.`,
        });
      }
      if (!w.needsDecision) continue;
      const base = correction.baseVersion;
      const amount = (cents: number) => `${formatCents(Math.abs(cents))} ${cents < 0 ? "less" : "more"}`;
      const settled = w.decisions.filter((d) => !w.stale.includes(d)).map((d) => decisionText(d)).join("; ");
      const already = settled ? ` Already settled outside the files: ${settled}.` : "";
      const kept = w.heldCents > 0 ? ` ${formatCents(w.heldCents)} of pay an earlier correction of this period left with them (written off, or not yet recovered) may cover it; if it was recovered, pay it by hand.` : "";
      const left = w.remainingCents;
      const message =
        w.stale.length > 0
          ? `${name}: ${w.stale.map((d) => decisionText(d)).join("; ")} — no longer fits the difference (${amount(w.netCents - w.leftoverCents)} than version ${base} paid). Remove it, then record what is left.`
          : w.decisions.length > 0
            ? `${name}: ${amount(w.netCents - w.leftoverCents)} than version ${base} paid.${already} ${amount(left)} left to settle: record how.${left > 0 ? kept : ""}`
            : left < 0
              ? `${name}: ${formatCents(-left)} less pay than version ${base} paid. The payroll file never takes pay back: record how it is settled (repaid outside payroll, recovered under the worker's state rules, or written off).`
              : !w.additionsOnly
                ? `${name}: ${formatCents(left)} more pay, but it moves pay between rates, kinds of hours or workweeks (${describeMoves(w.fileLines)}), which the payroll file cannot carry as additions. Pay it by hand and record that here.`
                : `${name}: ${formatCents(left)} more pay than version ${base} paid.${kept} Record whether that covers it, or that it is paid by hand.`;
      blockers.push({
        code: "correction_decision_needed",
        workerId: w.workerId,
        workerName: name,
        // What is left to settle (what a decision recorded now would settle); a stale agreement: what is owed.
        grossCents: w.stale.length > 0 ? w.netCents - w.leftoverCents - w.decisions.filter((d) => !w.stale.includes(d)).reduce((sum, d) => sum + d.differenceCents, 0) : left,
        ...(w.heldCents > 0 ? { heldCents: w.heldCents } : {}),
        message,
      });
    }
    if (!hasRealDifferences(correction) && blockers.length === 0) {
      blockers.push({ code: "correction_no_differences", message: `Nothing differs from version ${correction.baseVersion}, so there is nothing to correct. Change the hours or rates, or discard this correction.` });
    }
  }

  // Dry run of the files: anything the payroll file or an invoice would refuse is a blocker now,
  // not an error after "Create files".
  const invoicePlan = correction
    ? await planCorrectionInvoices(tx, period, correction.bill)
    : await planInvoices(tx, period, result.billLines.map((l) => ({ clientId: l.clientId, amountCents: l.amountCents })));
  // A correction's file carries the additions of the workers it settles (decision E9).
  const fileLines: ExportPayLine[] = correction
    ? fileWorkers(correction).flatMap((w) => w.weekLines.map((l) => ({ workerId: w.workerId, type: l.type, minutes: l.minutes, amountCents: l.amountCents, rate: l.rate, parts: l.parts, workweekStart: l.workweekStart })))
    : result.payLines.map((l) => ({ workerId: l.workerId, type: l.type, minutes: l.minutes, amountCents: l.amountCents, rate: l.rate, workweekStart: l.workweekStart }));
  const grossOf = (workerId: string) =>
    correction ? (correction.workers.find((w) => w.workerId === workerId)?.netCents ?? 0) : result.payLines.filter((l) => l.workerId === workerId).reduce((sum, l) => sum + l.amountCents, 0);
  if (blockers.length === 0) {
    // A refusal about one worker's pay names that worker (they can be skipped, or in a correction
    // settled by a decision, and paid by hand); the file is tried again without them, so every such
    // worker is named at once.
    let lines = fileLines;
    const extra = correction ? { correction: { version: run.version, baseVersion: correction.baseVersion }, referenceRates: regularRates(result.payLines) } : {};
    for (let tries = 0; lines.length > 0 && tries <= workersById.size; tries++) {
      try {
        renderExport({ ...(await payrollFixture(tx, period, lines)), ...extra });
        break;
      } catch (error) {
        if (!(error instanceof ExportError)) throw error;
        const workerId = error.workerId;
        const w = workerId ? workersById.get(workerId) : undefined;
        blockers.push({ code: "export_refused", workerId, workerName: w ? `${w.firstName} ${w.lastName}` : undefined, message: error.message, ...(workerId ? { grossCents: grossOf(workerId) } : {}) });
        if (!workerId) break;
        lines = lines.filter((l) => l.workerId !== workerId);
      }
    }
    for (const problem of invoicePlan.problems) blockers.push({ code: "invoice_problem", message: problem });
  }
  // Everything the files will say, so a change after the totals were shown is caught at "Create files".
  const textInputs = await fileTextInputs(tx, actor.agencyId, invoicePlan.plans, [...new Set(result.payLines.map((l) => l.workerId))], [...new Set(result.billLines.map((l) => l.assignmentId))]);
  const decided = decisions.map((d) => [d.workerId, d.decision, d.differenceCents, d.note]).sort((a, b) => cmp(String(a[0]), String(b[0])));

  const status = blockers.length > 0 ? "blocked" : "ready";
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        rulesVersion: result.rulesVersion,
        pay: result.payLines,
        bill: result.billLines,
        blockers,
        warnings,
        obligations: result.obligations,
        skipped: run.skipped.map((x) => x.workerId).sort(cmp),
        documents: documents.map((d) => [d.id, d.status]),
        text: textInputs,
        correction: base ? { base: base.run.id, decisions: decided } : null,
        payroll,
      }),
    )
    .digest("hex");
  const previous = (run.snapshot as { fingerprint?: string } | null)?.fingerprint;
  // Nothing changed: the same lines stand, and an approval of them stands too.
  if (previous === fingerprint && (run.status === status || (run.status === "approved" && status === "ready"))) {
    return { runId: run.id, version: run.version, kind: run.kind, status: run.status === "approved" ? "approved" : status, blockers, warnings, skipped: run.skipped, fingerprint };
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
  // The obligations this run's hours create (Illinois equal pay), kept in step with the run and audited.
  // Due before the next pay period begins: by this period's last day (56 Ill. Adm. Code 260.505(b));
  // a crossing found in earlier periods' hours is already overdue.
  const mine = await tx.select().from(s.obligations).where(eq(s.obligations.payRunId, run.id));
  const keyOf = (o: { kind: string; workerId: string; clientId: string; crossedOn: string }) => `${o.kind}|${o.workerId}|${o.clientId}|${o.crossedOn}`;
  const wanted = new Set(result.obligations.map(keyOf));
  const gone = mine.filter((m) => m.status === "open" && !wanted.has(keyOf(m)));
  if (gone.length > 0) {
    await tx.delete(s.obligations).where(inArray(s.obligations.id, gone.map((m) => m.id)));
    await audit(tx, actor, gone.map((m) => ({ action: "delete" as const, entityType: "obligation", entityId: m.id, before: { kind: m.kind, workerId: m.workerId, clientId: m.clientId, crossedOn: m.crossedOn }, reason: "the run's hours changed" })));
  }
  for (const o of result.obligations) {
    const overdue = o.crossedOn < period.startsOn;
    const dueOn = overdue ? period.startsOn : period.endsOn;
    const evidence: s.ObligationEvidence = { ruleCode: o.ruleCode, citation: o.citation, crossedAtMinute: o.crossedAtMinute, windowStart: o.windowStart, thresholdMinutes: o.thresholdMinutes, minutesAfter: o.minutesAfter, earlierMinutesAfter: o.earlierMinutesAfter, overdue, entryIds: o.entryIds };
    const same = mine.find((m) => keyOf(m) === keyOf(o));
    if (same) {
      await tx.update(s.obligations).set({ evidence, message: o.message, dueOn }).where(eq(s.obligations.id, same.id));
      continue;
    }
    // One obligation per worker, client and kind: the engine records one only when it crosses earlier
    // than the one on file (a late timesheet), and then the row moves to this run's earlier crossing.
    const [held] = await tx.select().from(s.obligations).where(and(eq(s.obligations.kind, o.kind), eq(s.obligations.workerId, o.workerId), eq(s.obligations.clientId, o.clientId)));
    if (held) {
      if (o.crossedOn >= held.crossedOn) throw new Error(`Obligation ${held.id} is already on file from ${held.crossedOn}; the run found ${o.crossedOn}.`);
      await tx.update(s.obligations).set({ payRunId: run.id, crossedOn: o.crossedOn, dueOn, evidence, message: o.message }).where(eq(s.obligations.id, held.id));
      await audit(tx, actor, [{ action: "update", entityType: "obligation", entityId: held.id, before: { crossedOn: held.crossedOn }, after: { crossedOn: o.crossedOn }, reason: "hours in an earlier week cross first" }]);
      continue;
    }
    const [row] = await tx
      .insert(s.obligations)
      .values({ agencyId: actor.agencyId, kind: o.kind, jurisdiction: o.jurisdiction, workerId: o.workerId, clientId: o.clientId, payRunId: run.id, crossedOn: o.crossedOn, dueOn, evidence, message: o.message })
      .returning();
    await audit(tx, actor, [{ action: "create", entityType: "obligation", entityId: row!.id, after: { kind: o.kind, workerId: o.workerId, clientId: o.clientId, crossedOn: o.crossedOn, dueOn } }]);
  }
  const snapshot = { rulesVersion: result.rulesVersion, fingerprint, input, entryIds: ordered.map((e) => e.id), skipped: run.skipped, blockers, warnings };
  // Anything changed after approval voids it (Gusto: preparing again cancels the calculations).
  const voided = run.status === "approved";
  await tx
    .update(s.payRuns)
    .set({ status, rulesVersion: result.rulesVersion, blockers, warnings, snapshot, approvedAt: null, approvedBy: null, approvedByLabel: null, approval: null, updatedAt: new Date() })
    .where(eq(s.payRuns.id, run.id));
  if (voided) await audit(tx, actor, [{ action: "update", entityType: "pay_run", entityId: run.id, before: { status: "approved", approvedBy: run.approvedByLabel }, after: { status }, reason: "approval voided: the run changed after it was approved" }]);
  await audit(tx, actor, [
    {
      action: "update",
      entityType: "pay_run",
      entityId: run.id,
      after: { status, rulesVersion: result.rulesVersion, payLines: result.payLines.length, billLines: result.billLines.length, blockers: blockers.length },
      reason: "computed",
    },
  ]);
  return { runId: run.id, version: run.version, kind: run.kind, status, blockers, warnings, skipped: run.skipped, fingerprint };
}

/**
 * Each worker's single regular rate in the whole period, for a correction file that adds overtime
 * alone (the payroll system multiplies its stored base rate); none when a worker has several.
 */
export function regularRates(lines: { workerId: string; type: string; rate: { num: number; den: number } }[]): Record<string, { num: number; den: number }> {
  const out: Record<string, { num: number; den: number }> = {};
  const several = new Set<string>();
  for (const l of lines.filter((x) => x.type === "REG")) {
    const had = out[l.workerId];
    if (had && BigInt(had.num) * BigInt(l.rate.den) !== BigInt(l.rate.num) * BigInt(had.den)) several.add(l.workerId);
    out[l.workerId] ??= l.rate;
  }
  for (const id of several) delete out[id];
  return out;
}

/**
 * Workers with much more overtime than in the previous period's exported run (decision E5; PowerPay
 * compares with the previous regular run and lists only those outside the threshold). The minutes and
 * percent are the agency's setting; nothing is said when there is no earlier exported period.
 */
async function overtimeSpikes(
  tx: Tx,
  period: { startsOn: string },
  lines: { workerId: string; type: string; minutes: number }[],
  nameOf: (id: string) => string | undefined,
): Promise<RunIssue[]> {
  const threshold = await settingOn<{ minutes?: unknown; percent?: unknown }>(tx, "warnings.overtime_spike", period.startsOn);
  const floor = threshold?.minutes;
  const percent = threshold?.percent;
  if (typeof floor !== "number" || typeof percent !== "number" || !Number.isInteger(floor) || !Number.isInteger(percent)) return [];
  const earlier = await tx.select().from(s.payPeriods).where(lt(s.payPeriods.endsOn, period.startsOn)).orderBy(desc(s.payPeriods.endsOn)).limit(1);
  if (earlier.length === 0) return [];
  // The latest paid version of that period (a correction still open there does not count yet).
  const [prior] = await tx
    .select()
    .from(s.payRuns)
    .where(and(eq(s.payRuns.payPeriodId, earlier[0]!.id), inArray(s.payRuns.status, ["exported", "closed"])))
    .orderBy(desc(s.payRuns.version))
    .limit(1);
  if (!prior) return [];
  const overtime = (rows: { workerId: string; type: string; minutes: number }[]) => {
    const out = new Map<string, number>();
    for (const l of rows) if (l.type === "OT" || l.type === "DT") out.set(l.workerId, (out.get(l.workerId) ?? 0) + l.minutes);
    return out;
  };
  const before = overtime(await tx.select({ workerId: s.payLines.workerId, type: s.payLines.type, minutes: s.payLines.minutes }).from(s.payLines).where(eq(s.payLines.payRunId, prior.id)));
  const now = overtime(lines);
  const out: RunIssue[] = [];
  for (const [workerId, minutes] of [...now].sort((a, b) => cmp(a[0], b[0]))) {
    const was = before.get(workerId) ?? 0;
    const rise = minutes - was;
    if (rise < floor || rise * 100 < percent * was) continue;
    const name = nameOf(workerId) ?? "";
    out.push({ code: "overtime_spike", workerId, workerName: name, message: `${name}: ${hoursMinutes(minutes)} of overtime this period against ${hoursMinutes(was)} in the period before.` });
  }
  return out;
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
