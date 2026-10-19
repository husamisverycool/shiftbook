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
import { equalPayExplain, sayInEnglish } from "../compliance/explain-keys";
import type { Explain } from "../../lib/explain";
import { createHash } from "node:crypto";
import { hoursMinutes } from "../../components/shiftbook/format";
import { addDays, addMonths, computePay, coveredByEqualPay, latestRequest, rateInForce, formatCents, NO_PLACE, RULES_VERSION, WORKED_TIME, workweekStart, type Bonus, type Confirmation, type Differential, type HolidayPolicy, type HoursWorked, type Issue, type JurisdictionRule, type MinimumWageRule, type ObligationKind, type OvertimeRule, type PayInput, type Say, type Shift, type Weekday } from "@shiftbook/rules";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";
import { ExportError } from "../../exports/errors";
import { fieldglassUpload } from "../../exports/invoice-files";
import { renderExport } from "../../exports/registry";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import { EQUAL_PAY_KINDS } from "../compliance/kinds";
import { equalPayRatesOnFile } from "../compliance/equal-pay-rates";
import { coveredHours, openingBalances } from "../compliance/hours";
import { SYSTEM } from "../compliance/sync";
import * as s from "../db/schema";
import { contractTermsOf, differentialFor } from "./rate-terms";
import type { ExportPayLine } from "../../exports/registry";
import { makesVms, planEntries, vmsInput } from "../files/invoice-documents";
import { billDifferences, fileTextInputs, planCorrectionInvoices, planInvoices } from "../files/invoice-plan";
import { billFromMarkup } from "../catalog/versions";
import { settingOn } from "../settings";
import { isStuck } from "../intake/service";
import { payrollFixture, payrollSettings } from "../files/payroll-fixture";
import { SYSTEM_OF } from "../../exports/targets";
import type { Actor } from "../session";
import { billForDiff, decisionSaid, movesSaid, fileWorkers, hasRealDifferences, heldFor, paidBase, payForDiff, planCorrection, type CorrectionPlan } from "./corrections";
import type { RunIssueCode } from "./issue-codes";
import { dated, message as said, nest, say, semicolons, type Said, type SaidKey } from "../said";
import type { PayrollSystem } from "../../exports/targets";
import { lockCompliance, openPeriod, PeriodLockedError } from "./period-lock";

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
  /** An invoice problem's client (slice g): the fix opens the client's invoice settings. */
  clientName?: string;
  /** The run's own message as keys for the reader's language (decision 0030); the engine's issues carry `say`. */
  said?: Said;
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
/** The note on an equal-pay duty whose crossing the run no longer finds (its hours changed). */
export const NOT_CROSSED = "No longer applies: the hours that crossed the threshold changed.";
type EqualPayRow = typeof s.obligations.$inferSelect & { kind: ObligationKind; workerId: string; clientId: string; crossedOn: string };
const equalPayRows = (rows: (typeof s.obligations.$inferSelect)[]): EqualPayRow[] =>
  rows.filter((o): o is EqualPayRow => (EQUAL_PAY_KINDS as readonly string[]).includes(o.kind) && o.workerId !== null && o.clientId !== null && o.crossedOn !== null);

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** JSON.stringify's replacer leaving out every `say` and `said` (decision 0030). */
export const withoutSay = (key: string, value: unknown) => (key === "say" || key === "said" ? undefined : value);
/** "<name> has no <the system's id>, so <its file> could not match them." for each payroll system. */
const NO_PAYROLL_ID: Record<PayrollSystem, SaidKey> = {
  gusto: "noPayrollIdGusto",
  qbd: "noPayrollIdQbd",
  qbo: "noPayrollIdQbo",
  adp_wfn: "noPayrollIdAdpWfn",
  adp_run: "noPayrollIdAdpRun",
  paychex: "noPayrollIdPaychex",
  paylocity: "noPayrollIdPaylocity",
  spreadsheet: "noPayrollIdSpreadsheet",
};
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

/** 1320 → "22:00" (a differential's window, for a message). */
const clock = (m: number | null) => (m === null ? "" : `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
const withDifferential = (d: Differential | undefined): { differential?: Differential } => (d ? { differential: d } : {});

/** A bill rate the rate card worked out from a markup carries its working onto the bill line (with its keys: decision 0030). */
function billRateExplain(card: typeof s.rateCards.$inferSelect): { billRateExplain?: string; billRateSay?: Say } {
  if (card.markupBp === null) return {};
  const worked = billFromMarkup(card.payRateCents, card.markupBp);
  return worked.rateCents === card.billRateCents ? { billRateExplain: worked.explain, billRateSay: worked.say } : {};
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
  /** Shifts a windowed differential could not be judged on (no start time): warned, never guessed. */
  const startUnknown: RunIssue[] = [];
  const startUnknownSeen = new Set<string>();
  const shiftOn = (
    a: (typeof assignmentRows)[number],
    date: string,
    base: Pick<Shift, "entryIds" | "workerId" | "workerName" | "startMinute" | "minutes"> & { reportedOnly?: true },
  ): Shift | { code: RunIssueCode; message: string; said: Said } => {
    // A worker's own rates on this assignment apply on the dates they cover; the job order's otherwise.
    const covering = rateCards.filter((r) => r.jobOrderId === a.jobOrder.id && effective(date, r.effectiveFrom, r.effectiveTo));
    const own = covering.filter((r) => r.assignmentId === a.assignment.id);
    const cards = own.length > 0 ? own : covering.filter((r) => r.assignmentId === null);
    const on = { name: String(base.workerName), date: dated(date) };
    if (cards.length !== 1) return { code: "missing_rate", ...said([cards.length === 0 ? say("noRateCard", { ...on, position: a.jobOrder.position }) : say("severalRateCards", { ...on, count: String(cards.length), position: a.jobOrder.position })]) };
    const profile = profiles.filter((p) => p.clientId === a.jobOrder.clientId && effective(date, p.effectiveFrom, p.effectiveTo));
    if (profile.length !== 1) return { code: "missing_billing_profile", ...said([profile.length === 0 ? say("noBillingProfile", on) : say("severalBillingProfiles", { ...on, count: String(profile.length) })]) };
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
      // The rate card's dated terms (drizzle/0062): a differential on shifts it covers, a minimum day.
      ...withDifferential(differentialFor(card, date, base.startMinute, () => {
        if (base.minutes <= 0 || startUnknownSeen.has(`${base.workerId}|${date}`)) return;
        startUnknownSeen.add(`${base.workerId}|${date}`);
        startUnknown.push({
          code: "differential_start_unknown",
          workerId: base.workerId,
          workerName: base.workerName,
          date,
          entryIds: base.entryIds,
          ...said([say("differentialStartUnknown", { ...on, differential: card.diffName ?? "", from: clock(card.diffStartMinute), to: clock(card.diffEndMinute) })]),
        });
      })),
      ...contractTermsOf(card),
    };
  };

  const blockers: RunIssue[] = [];
  for (const d of documents) {
    if (isStuck(d)) {
      blockers.push({ code: "document_failed", ...said([say("documentStopped", { file: d.filename })]) });
    } else if (d.status === "received" || d.status === "reading") {
      blockers.push({ code: "documents_pending", ...said([say("documentPending", { file: d.filename })]) });
    } else if (d.status === "failed") {
      blockers.push({ code: "document_failed", ...said([d.error ? say("documentFailedWhy", { file: d.filename, error: d.error }) : say("documentFailed", { file: d.filename })]) });
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
    const issue = (code: RunIssueCode, message: Said) => blockers.push({ code, workerId: worker?.id, workerName: name, date: e.workDate ?? undefined, entryIds: [e.id], ...said(message) });
    // "<name>" or "<name> on <date>", as the entry has a date.
    const who = e.workDate ? nest(say("nameOnDate", { name, date: dated(e.workDate) })) : name;
    if (e.status === "disputed") {
      // A shift the client disputed is neither paid nor billed until the agency settles it (slice d).
      issue("client_dispute_open", [disputeReasons.has(e.id) ? say("disputedWhy", { who, reason: String(disputeReasons.get(e.id)) }) : say("disputed", { who })]);
      continue;
    }
    if (!PAYABLE.includes(e.status)) {
      issue("entry_needs_review", [say("needsReview", { who, reasons: e.reviewReasons.join(", ") || e.status })]);
      continue;
    }
    const a = e.assignmentId ? assignmentsById.get(e.assignmentId) : undefined;
    if (!worker || !a || a.assignment.workerId !== worker.id) {
      issue("unmatched_entry", [e.workDate ? say("unmatchedOn", { name: e.workerNameRaw, date: dated(e.workDate) }) : say("unmatched", { name: e.workerNameRaw })]);
      continue;
    }
    if (!e.workDate || e.minutes === null) {
      issue("entry_incomplete", [say(!e.workDate ? "noDate" : "noMinutes", { name })]);
      continue;
    }
    const on = { name, date: dated(e.workDate) };
    if (!effective(e.workDate, period.startsOn, period.endsOn)) {
      issue("outside_period", [say("outsidePeriod", { ...on, from: dated(period.startsOn), to: dated(period.endsOn) })]);
      continue;
    }
    if (a.assignment.status === "cancelled") {
      issue("outside_assignment", [say("assignmentCancelled", on)]);
      continue;
    }
    if (!effective(e.workDate, a.assignment.startDate, a.assignment.endDate)) {
      const from = dated(a.assignment.startDate);
      issue("outside_assignment", [a.assignment.endDate === null ? say("outsideAssignmentOpen", { ...on, from }) : say("outsideAssignment", { ...on, from, to: dated(a.assignment.endDate) })]);
      continue;
    }
    if (e.outMinute !== null && e.outMinute > 1440) {
      issue("crosses_midnight", [say("crossesMidnight", on)]);
      continue;
    }
    const built = shiftOn(a, e.workDate, { entryIds: [e.id], workerId: worker.id, workerName: name, startMinute: e.inMinute, minutes: e.minutes });
    if ("code" in built) {
      issue(built.code, built.said);
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
    const issue = (code: RunIssueCode, message: Said) => blockers.push({ code, workerId: c.workerId, workerName: name, date: c.date, ...said(message) });
    if (skippedIds.has(c.workerId)) continue;
    if (!worker || !a || a.assignment.workerId !== worker.id || a.assignment.status === "cancelled" || !effective(c.date, a.assignment.startDate, a.assignment.endDate)) {
      issue("outside_assignment", [say(c.kind === "holiday_not_worked" ? "holidayNotOnAssignment" : "shortDayNotOnAssignment", { name, date: dated(c.date) })]);
      continue;
    }
    const built = shiftOn(a, c.date, { entryIds: [], workerId: worker.id, workerName: name, startMinute: null, minutes: 0, reportedOnly: true });
    if ("code" in built) {
      issue(built.code, built.said);
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
        ...said([say("possibleDuplicate", { name: first.workerName, date: dated(first.date), count: String(same.length) })]),
      });
    }
  }

  // A pay period must cover whole workweeks, or a week's overtime would be split between two runs.
  const ws = workweekStartsOn as Weekday;
  const nextStart = addDays(period.endsOn, 1);
  if (workweekStart(period.startsOn, ws) !== period.startsOn || workweekStart(nextStart, ws) !== nextStart) {
    blockers.push({ code: "period_not_aligned", ...said([say("periodNotAligned", { from: dated(period.startsOn), to: dated(period.endsOn) })]) });
  }
  if (shifts.length === 0 && blockers.length === 0) {
    blockers.push({ code: "no_entries", ...said([say("noEntries")]) });
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
        ...said([unique.length === 1 ? say("notApprovedOne", { client: String(mustApprove.get(clientId)) }) : say("notApprovedMany", { client: String(mustApprove.get(clientId)), count: String(unique.length) })]),
      });
    }
  }
  // The payroll file goes to the system in the agency's payroll file settings (slice f, F1).
  const payroll = await payrollSettings(tx);
  if (!payroll) blockers.push({ code: "no_payroll_target", ...said([say("noPayrollTarget")]) });
  // (A correction checks only the workers its file will carry: the file's dry run below names them.)
  const system = payroll ? SYSTEM_OF[payroll.target.format] : null;
  for (const id of run.kind === "correction" || !system ? [] : [...paidWorkers].sort(cmp)) {
    const w = workersById.get(id)!;
    if (!w.payrollIds[system!]?.id) {
      blockers.push({
        code: "missing_payroll_id",
        workerId: id,
        workerName: `${w.firstName} ${w.lastName}`,
        ...said([say(NO_PAYROLL_ID[system!], { name: `${w.firstName} ${w.lastName}` })]),
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
  // the longest window, and the hours worked before Tabulado (opening balances, on the date each runs
  // to); and the obligations already on file from other runs (a crossing never resets). The compliance
  // lock keeps the balances and duties still until this run has written its own (slice j).
  await lockCompliance(tx, actor.agencyId);
  const counterStates = [...new Set((tables.equalPayRules ?? []).map((r) => r.jurisdiction))].sort(cmp);
  const longest = Math.max(0, ...(tables.equalPayRules ?? []).map((r) => r.longWindowMonths));
  const runWorkers = [...new Set(shifts.map((sh) => sh.workerId))].sort(cmp);
  let hoursWorked: HoursWorked[] = [];
  if (counterStates.length > 0 && runWorkers.length > 0) {
    const from = addMonths(period.startsOn, -longest);
    const worked = await coveredHours(tx, { states: counterStates, from, through: addDays(period.startsOn, -1), workerIds: runWorkers });
    const balances = await openingBalances(tx, { from, through: period.endsOn, workerIds: runWorkers });
    hoursWorked = [...worked, ...balances.map((b) => ({ workerId: b.workerId, clientId: b.clientId, date: b.throughOn, minutes: b.minutes }))].sort(
      (a, b) => cmp(a.workerId, b.workerId) || cmp(a.clientId, b.clientId) || cmp(a.date, b.date) || a.minutes - b.minutes,
    );
  }
  // This run's own obligations are recomputed, except one a person already closed; one Tabulado set
  // aside (the hours that crossed changed) is not on file.
  const crossingsOnFile = equalPayRows(await tx.select().from(s.obligations).where(and(inArray(s.obligations.kind, [...EQUAL_PAY_KINDS]), eq(s.obligations.closedBySystem, false), or(isNull(s.obligations.payRunId), ne(s.obligations.payRunId, run.id), ne(s.obligations.status, "open")))));
  const obligationsOnFile = crossingsOnFile
    .map((o) => ({ kind: o.kind, workerId: o.workerId, clientId: o.clientId, crossedOn: o.crossedOn }))
    .sort((a, b) => cmp(a.workerId, b.workerId) || cmp(a.clientId, b.clientId) || cmp(a.kind, b.kind));
  // The Illinois equal-pay rates on file (slice j, J6): the engine pays at least them from their dates.
  const equalPayRates = await equalPayRatesOnFile(tx, runWorkers);
  const input: PayInput = { workweekStartsOn: workweekStartsOn as Weekday, shifts, confirmations, holidayPolicies, bonuses, hoursWorked, obligationsOnFile, ...tables, ...(equalPayRates.length > 0 ? { equalPayRates } : {}) };
  const result = computePay(input);
  blockers.push(...result.blockers);
  // The client's equal-pay figures are due before the laborer's next pay period begins (56 Ill. Adm.
  // Code 260.505(b)): in a pay period that starts after a crossing, covered hours at that client need
  // the rate in force, or a record that the client was asked (whatever its date) — then the rate card
  // is paid and a correction trues it up. Pay is never held for want of the client's data: recording
  // the request is enough. A crossing a person set aside as not applicable (the § 43 collective-
  // agreement exception, say) holds nothing. After the 4,160-hour crossing a wage-survey median
  // entered before it no longer counts: the survey method then asks for the 75th percentile
  // (820 ILCS 175/42(a)(2)(B)).
  const crossings = new Map<string, { at720: string | null; at4160: string | null }>();
  for (const o of [...crossingsOnFile.filter((x) => x.status !== "not_applicable"), ...result.obligations]) {
    const k = `${o.workerId}|${o.clientId}`;
    const c = crossings.get(k) ?? { at720: null, at4160: null };
    const field = o.kind === "il_equal_pay_720h" ? "at720" : "at4160";
    if (c[field] === null || o.crossedOn < c[field]) c[field] = o.crossedOn;
    crossings.set(k, c);
  }
  const rateNeeded = new Set<string>();
  for (const sh of [...shifts].sort((a, b) => cmp(a.date, b.date))) {
    if (sh.minutes <= 0 || sh.reportedOnly || !coveredByEqualPay(tables.equalPayRules ?? [], sh)) continue;
    const k = `${sh.workerId}|${sh.clientId}`;
    const c = crossings.get(k);
    if (!c || c.at720 === null || c.at720 >= period.startsOn || rateNeeded.has(k)) continue;
    const inForce = rateInForce(equalPayRates, sh.workerId, sh.clientId, sh.date);
    const asked = latestRequest(equalPayRates, sh.workerId, sh.clientId);
    const client = sh.clientName ?? sh.clientId;
    const who = { code: "equal_pay_rate_needed" as const, workerId: sh.workerId, workerName: sh.workerName, clientId: sh.clientId, date: sh.date };
    if (!inForce && !asked) {
      rateNeeded.add(k);
      blockers.push({ ...who, ...said([say("equalPayRateDue720", { name: sh.workerName, client, date: dated(c.at720), start: dated(period.startsOn) })]) });
      continue;
    }
    const tier = c.at4160;
    if (tier !== null && tier < period.startsOn && inForce?.method === "survey_median" && inForce.effectiveFrom < tier && !(asked && asked.effectiveFrom >= tier)) {
      rateNeeded.add(k);
      blockers.push({ ...who, ...said([say("equalPayRateDue4160", { name: sh.workerName, client, date: dated(tier), from: dated(inForce.effectiveFrom) })]) });
    }
  }
  const warnings: RunIssue[] = [...result.warnings, ...startUnknown, ...(await overtimeSpikes(tx, period, result.payLines, workerNameOf))];

  // Pay and bill lines must carry the same worked minutes for each worker, assignment, week and type
  // (a minimum-wage top-up or a premium is pay only: it is not billed time).
  const minutes = new Map<string, number>();
  for (const l of result.payLines.filter((x) => BILLED_TIME.has(x.type))) minutes.set(`${l.workerId}|${l.assignmentId}|${l.workweekStart}|${l.type}`, (minutes.get(`${l.workerId}|${l.assignmentId}|${l.workweekStart}|${l.type}`) ?? 0) + l.minutes);
  for (const l of result.billLines.filter((x) => BILLED_TIME.has(x.type))) minutes.set(`${l.workerId}|${l.assignmentId}|${l.workweekStart}|${l.type}`, (minutes.get(`${l.workerId}|${l.assignmentId}|${l.workweekStart}|${l.type}`) ?? 0) - l.minutes);
  for (const [key, diff] of [...minutes].sort((a, b) => cmp(a[0], b[0]))) {
    if (diff !== 0) blockers.push({ code: "pay_bill_mismatch", workerId: key.split("|")[0], ...said([say("payBillMismatch", { diff: String(diff), key })]) });
  }
  // Every stored amount and rate must fit the database's integer columns.
  for (const l of [...result.payLines, ...result.billLines]) {
    if (Math.abs(l.amountCents) > INT4_MAX || l.rate.num > INT4_MAX || l.rate.den > INT4_MAX) {
      blockers.push({ code: "invalid_input", workerId: l.workerId, ...said([say("lineTooLarge", { type: l.type, week: dated(l.workweekStart) })]) });
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
          ...said([say("correctionPayDue", { name, amount: formatCents(due) })]),
        });
      }
      if (!w.needsDecision) continue;
      const base = correction.baseVersion;
      const amount = (cents: number) => nest(say(cents < 0 ? "amountLess" : "amountMore", { amount: formatCents(Math.abs(cents)) }));
      const settled = w.decisions.filter((d) => !w.stale.includes(d)).map((d) => nest(decisionSaid(d)));
      const already: Said = settled.length > 0 ? [say("alreadySettled", { decisions: semicolons(settled) })] : [];
      const kept: Said = w.heldCents > 0 ? [say("heldMayCover", { amount: formatCents(w.heldCents) })] : [];
      const left = w.remainingCents;
      const version = String(base);
      const message: Said =
        w.stale.length > 0
          ? [say("correctionStale", { name, decisions: semicolons(w.stale.map((d) => nest(decisionSaid(d)))), difference: amount(w.netCents - w.leftoverCents), version })]
          : w.decisions.length > 0
            ? [say("correctionDiffers", { name, difference: amount(w.netCents - w.leftoverCents), version }), ...already, say("leftToSettle", { left: amount(left) }), ...(left > 0 ? kept : [])]
            : left < 0
              ? [say("correctionLess", { name, amount: formatCents(-left), version })]
              : !w.additionsOnly
                ? [say("correctionMoves", { name, amount: formatCents(left), moves: semicolons(movesSaid(w.fileLines).map((m) => nest(m))) })]
                : [say("correctionMore", { name, amount: formatCents(left), version }), ...kept, say("recordWhether")];
      blockers.push({
        code: "correction_decision_needed",
        workerId: w.workerId,
        workerName: name,
        // What is left to settle (what a decision recorded now would settle); a stale agreement: what is owed.
        grossCents: w.stale.length > 0 ? w.netCents - w.leftoverCents - w.decisions.filter((d) => !w.stale.includes(d)).reduce((sum, d) => sum + d.differenceCents, 0) : left,
        ...(w.heldCents > 0 ? { heldCents: w.heldCents } : {}),
        ...said(message),
      });
    }
  }

  // Dry run of the files: anything the payroll file or an invoice would refuse is a blocker now,
  // not an error after "Create files".
  const invoicePlan = correction
    ? await planCorrectionInvoices(tx, period, billDifferences(correction.bill))
    : await planInvoices(
        tx,
        period,
        result.billLines.map((l) => ({ clientId: l.clientId, workerId: l.workerId, assignmentId: l.assignmentId, workweekStart: l.workweekStart, type: l.type, minutes: l.minutes, rate: l.rate, amountCents: l.amountCents, ruleId: l.ruleId, entryIds: l.entryIds })),
      );
  if (correction && !hasRealDifferences(correction, { quiet: [], ...invoicePlan }) && blockers.length === 0) {
    blockers.push({ code: "correction_no_differences", ...said([say("correctionNothingDiffers", { version: String(correction.baseVersion) })]) });
  }
  // A VMS invoices each time sheet once: a correction of a client on one is recorded there by hand.
  for (const p of invoicePlan.plans.filter((x) => x.profile.vmsFormat !== null && x.kind !== "invoice")) {
    warnings.push({
      code: "vms_correction_by_hand",
      clientId: p.clientId,
      clientName: p.client.name,
      ...said([say(p.kind === "credit_note" ? "vmsCreditByHand" : "vmsAddByHand", { client: p.client.name, number: p.number, original: p.original!.number })]),
    });
  }
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
    for (const problem of invoicePlan.problems) blockers.push({ code: problem.code, clientId: problem.clientId, clientName: problem.clientName, message: problem.message, said: problem.said });
    // The VMS upload refuses hours it cannot place on a time sheet: said now, not at "Create files".
    // A refusal names the worker (who can be skipped and paid by hand); the file is tried again
    // without them, so every such worker is named at once.
    const vmsPlans = invoicePlan.plans.filter(makesVms);
    if (vmsPlans.length > 0) {
      const entries = await planEntries(tx, vmsPlans);
      for (const p of vmsPlans) {
        const refused = new Set<string>();
        for (let tries = 0; tries <= workersById.size; tries++) {
          const lines = p.lines.filter((l) => !refused.has(l.workerId));
          if (lines.length === 0) break;
          try {
            fieldglassUpload(vmsInput({ ...p, lines }, { workersById, period }, entries));
            break;
          } catch (error) {
            if (!(error instanceof ExportError)) throw error;
            const w = error.workerId ? workersById.get(error.workerId) : undefined;
            blockers.push({ code: "vms_refused", clientId: p.clientId, clientName: p.client.name, workerId: error.workerId, workerName: w ? `${w.firstName} ${w.lastName}` : undefined, ...said([say("vmsRefused", { client: p.client.name, number: p.number, problem: error.message })]) });
            if (!error.workerId) break;
            refused.add(error.workerId);
          }
        }
      }
    }
  }
  // Everything the files will say, so a change after the totals were shown is caught at "Create files".
  const textInputs = await fileTextInputs(tx, actor.agencyId, period.id, invoicePlan.plans, [...new Set(result.payLines.map((l) => l.workerId))], [...new Set(result.billLines.map((l) => l.assignmentId))]);
  const decided = decisions.map((d) => [d.workerId, d.decision, d.differenceCents, d.note]).sort((a, b) => cmp(String(a[0]), String(b[0])));

  const status = blockers.length > 0 ? "blocked" : "ready";
  // The message keys beside the English (decision 0030) are left out: they say exactly the English, so
  // a run computed before them keeps its fingerprint, and an approval of it stands.
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
      }, withoutSay),
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
        say: l.say ?? null,
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
        say: l.say ?? null,
      })),
    );
  }
  // The obligations this run's hours create (Illinois equal pay), kept in step with the run and audited.
  // Due before the next pay period begins: by this period's last day (56 Ill. Adm. Code 260.505(b));
  // a crossing found in earlier periods' hours is already overdue.
  const mine = equalPayRows(await tx.select().from(s.obligations).where(and(eq(s.obligations.payRunId, run.id), inArray(s.obligations.kind, [...EQUAL_PAY_KINDS]))));
  const keyOf = (o: { kind: string; workerId: string; clientId: string; crossedOn: string }) => `${o.kind}|${o.workerId}|${o.clientId}|${o.crossedOn}`;
  const wanted = new Set(result.obligations.map(keyOf));
  // One no longer crossed goes: deleted while nobody has touched it, else set aside with its notes,
  // files and owner kept (Tabulado's own closing, so a later run may open it again).
  const gone = mine.filter((m) => m.status === "open" && !wanted.has(keyOf(m)));
  if (gone.length > 0) {
    const ids = gone.map((m) => m.id);
    const [noted, filed] = await Promise.all([
      tx.selectDistinct({ id: s.obligationNotes.obligationId }).from(s.obligationNotes).where(inArray(s.obligationNotes.obligationId, ids)),
      tx.selectDistinct({ id: s.obligationDocuments.obligationId }).from(s.obligationDocuments).where(inArray(s.obligationDocuments.obligationId, ids)),
    ]);
    const touched = new Set([...noted, ...filed].map((r) => r.id));
    const keep = gone.filter((m) => touched.has(m.id) || m.ownerUserId !== null);
    const drop = gone.filter((m) => !keep.includes(m));
    if (drop.length > 0) {
      await tx.delete(s.obligations).where(inArray(s.obligations.id, drop.map((m) => m.id)));
      await audit(tx, actor, drop.map((m) => ({ action: "delete" as const, entityType: "obligation", entityId: m.id, before: { kind: m.kind, workerId: m.workerId, clientId: m.clientId, crossedOn: m.crossedOn }, reason: "the run's hours changed" })));
    }
    if (keep.length > 0) {
      await tx.update(s.obligations).set({ status: "not_applicable", statusNote: NOT_CROSSED, noteKey: null, doneAt: new Date(), doneBy: null, doneByLabel: SYSTEM, closedBySystem: true }).where(inArray(s.obligations.id, keep.map((m) => m.id)));
      await audit(tx, actor, keep.map((m) => ({ action: "update" as const, entityType: "obligation", entityId: m.id, before: { status: "open" }, after: { status: "not_applicable" }, reason: NOT_CROSSED })));
    }
  }
  const reopened = { status: "open" as const, statusNote: null, noteKey: null, doneAt: null, doneBy: null, doneByLabel: null, closedBySystem: false };
  // The engine's sentence as keys and values for the reader's language (decision 0028): the client as
  // the engine named it, the window's months from the rule row in force on the crossing (the engine's
  // own lookup: jurisdiction and date). Kept only when it says exactly the engine's English.
  const explainOf = (o: (typeof result.obligations)[number]): Explain | null => {
    const rule = (input.equalPayRules ?? []).find((r) => r.jurisdiction === o.jurisdiction && r.ruleCode === o.ruleCode && r.effectiveFrom <= o.crossedOn && (r.effectiveTo === null || o.crossedOn <= r.effectiveTo));
    if (!rule) return null;
    const client = input.shifts.find((sh) => sh.workerId === o.workerId && sh.clientId === o.clientId && sh.clientName)?.clientName ?? `client ${o.clientId}`;
    const explain = equalPayExplain(o, client, o.kind === "il_equal_pay_720h" ? rule.windowMonths : rule.longWindowMonths);
    return sayInEnglish(explain) === o.message ? explain : null;
  };
  for (const o of result.obligations) {
    const overdue = o.crossedOn < period.startsOn;
    const dueOn = overdue ? period.startsOn : period.endsOn;
    const facts: s.ObligationEvidence = { ruleCode: o.ruleCode, citation: o.citation, crossedAtMinute: o.crossedAtMinute, windowStart: o.windowStart, thresholdMinutes: o.thresholdMinutes, minutesAfter: o.minutesAfter, earlierMinutesAfter: o.earlierMinutesAfter, overdue, entryIds: o.entryIds };
    const same = mine.find((m) => keyOf(m) === keyOf(o));
    if (same) {
      const again = same.closedBySystem && same.status !== "open";
      await tx.update(s.obligations).set({ facts, message: o.message, explain: explainOf(o), dueOn, ...(again ? reopened : {}) }).where(eq(s.obligations.id, same.id));
      if (again) await audit(tx, actor, [{ action: "update", entityType: "obligation", entityId: same.id, before: { status: same.status }, after: { status: "open" }, reason: "the run's hours cross again" }]);
      continue;
    }
    // One obligation per worker, client and kind: the engine records one only when it crosses earlier
    // than the one on file (a late timesheet), and then the row moves to this run's earlier crossing.
    // One Tabulado set aside is not on file for the engine: the new crossing takes it over, open.
    const [held] = equalPayRows(await tx.select().from(s.obligations).where(and(eq(s.obligations.kind, o.kind), eq(s.obligations.workerId, o.workerId), eq(s.obligations.clientId, o.clientId))));
    if (held?.closedBySystem) {
      await tx.update(s.obligations).set({ payRunId: run.id, crossedOn: o.crossedOn, dueOn, facts, message: o.message, explain: explainOf(o), ...reopened }).where(eq(s.obligations.id, held.id));
      await audit(tx, actor, [{ action: "update", entityType: "obligation", entityId: held.id, before: { status: held.status, crossedOn: held.crossedOn }, after: { status: "open", crossedOn: o.crossedOn }, reason: "the run's hours cross again" }]);
      continue;
    }
    if (held) {
      if (o.crossedOn >= held.crossedOn) throw new Error(`Obligation ${held.id} is already on file from ${held.crossedOn}; the run found ${o.crossedOn}.`);
      await tx.update(s.obligations).set({ payRunId: run.id, crossedOn: o.crossedOn, dueOn, facts, message: o.message, explain: explainOf(o) }).where(eq(s.obligations.id, held.id));
      await audit(tx, actor, [{ action: "update", entityType: "obligation", entityId: held.id, before: { crossedOn: held.crossedOn }, after: { crossedOn: o.crossedOn }, reason: "hours in an earlier week cross first" }]);
      continue;
    }
    const [row] = await tx
      .insert(s.obligations)
      .values({ agencyId: actor.agencyId, kind: o.kind, jurisdiction: o.jurisdiction, subjectKind: "worker_client", workerId: o.workerId, clientId: o.clientId, payRunId: run.id, crossedOn: o.crossedOn, dueOn, facts, message: o.message, explain: explainOf(o) })
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
    out.push({ code: "overtime_spike", workerId, workerName: name, ...said([say("overtimeSpike", { name, now: hoursMinutes(minutes), before: hoursMinutes(was) })]) });
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
