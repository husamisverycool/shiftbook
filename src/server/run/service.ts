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
import { addDays, addMonths, computePay, NO_PLACE, RULES_VERSION, WORKED_TIME, workweekStart, type Bonus, type Confirmation, type HolidayPolicy, type HoursWorked, type Issue, type JurisdictionRule, type MinimumWageRule, type OvertimeRule, type PayInput, type Shift, type Weekday } from "@shiftbook/rules";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { ExportError } from "../../exports/errors";
import { renderExport } from "../../exports/registry";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { fileTextInputs, planInvoices } from "../files/invoice-plan";
import { billFromMarkup } from "../catalog/versions";
import { settingOn } from "../settings";
import { isStuck } from "../intake/service";
import { payrollFixture } from "../files/payroll-fixture";
import type { Actor } from "../session";
import { openPeriod, PeriodLockedError } from "./period-lock";

export { PeriodLockedError } from "./period-lock";
export { settingOn } from "../settings";

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

  for (const id of [...paidWorkers].sort(cmp)) {
    const w = workersById.get(id)!;
    if (!w.payrollIds[TARGET_PAYROLL_SYSTEM]?.id) {
      blockers.push({ code: "missing_payroll_id", workerId: id, workerName: `${w.firstName} ${w.lastName}`, message: `${w.firstName} ${w.lastName} has no Gusto employee id, so the payroll file could not match them.` });
    }
  }

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
  const obligationsOnFile = (await tx.select().from(s.obligations).where(or(isNull(s.obligations.payRunId), ne(s.obligations.payRunId, run.id))))
    .map((o) => ({ kind: o.kind, workerId: o.workerId, clientId: o.clientId, crossedOn: o.crossedOn }))
    .sort((a, b) => cmp(a.workerId, b.workerId) || cmp(a.clientId, b.clientId) || cmp(a.kind, b.kind));
  const input: PayInput = { workweekStartsOn: workweekStartsOn as Weekday, shifts, confirmations, holidayPolicies, bonuses, hoursWorked, obligationsOnFile, ...tables };
  const result = computePay(input);
  blockers.push(...result.blockers);

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
        obligations: result.obligations,
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
  // The obligations this run's hours create (Illinois equal pay), kept in step with the run and audited.
  const dueOn = addDays(period.endsOn, 1);
  const mine = await tx.select().from(s.obligations).where(eq(s.obligations.payRunId, run.id));
  const keyOf = (o: { kind: string; workerId: string; clientId: string; crossedOn: string }) => `${o.kind}|${o.workerId}|${o.clientId}|${o.crossedOn}`;
  const wanted = new Set(result.obligations.map(keyOf));
  const gone = mine.filter((m) => m.status === "open" && !wanted.has(keyOf(m)));
  if (gone.length > 0) {
    await tx.delete(s.obligations).where(inArray(s.obligations.id, gone.map((m) => m.id)));
    await audit(tx, actor, gone.map((m) => ({ action: "delete" as const, entityType: "obligation", entityId: m.id, before: { kind: m.kind, workerId: m.workerId, clientId: m.clientId, crossedOn: m.crossedOn }, reason: "the run's hours changed" })));
  }
  for (const o of result.obligations) {
    const evidence: s.ObligationEvidence = { ruleCode: o.ruleCode, citation: o.citation, crossedAtMinute: o.crossedAtMinute, windowStart: o.windowStart, thresholdMinutes: o.thresholdMinutes, minutesAfter: o.minutesAfter, entryIds: o.entryIds };
    const existing = mine.find((m) => keyOf(m) === keyOf(o));
    if (existing) {
      await tx.update(s.obligations).set({ evidence, message: o.message, dueOn }).where(eq(s.obligations.id, existing.id));
      continue;
    }
    const [row] = await tx
      .insert(s.obligations)
      .values({ agencyId: actor.agencyId, kind: o.kind, jurisdiction: o.jurisdiction, workerId: o.workerId, clientId: o.clientId, payRunId: run.id, crossedOn: o.crossedOn, dueOn, evidence, message: o.message })
      .onConflictDoNothing()
      .returning();
    if (row) await audit(tx, actor, [{ action: "create", entityType: "obligation", entityId: row.id, after: { kind: o.kind, workerId: o.workerId, clientId: o.clientId, crossedOn: o.crossedOn, dueOn } }]);
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
