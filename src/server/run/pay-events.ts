// Pay events a person enters for a pay period (SPEC §9: "engine computes, human confirms"; Gusto's
// additional earnings in Run payroll; Rippling one-time payments): a missed California meal or rest
// period, a worker sent and not used (a short day), a holiday not worked, and a bonus for a workweek.
// Each needs a reason and is audited; the engine reads them on the next computation. A period whose
// files exist is locked: changing it means starting a correction, as for hours.
import { addDays, workweekStart, type Weekday } from "@shiftbook/rules";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { audit } from "../audit";
import { can } from "../permissions";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import type { Actor } from "../session";
import { settingOn } from "../settings";
import { openPeriod } from "./period-lock";

export const EVENT_KINDS = ["meal_period_missed", "rest_period_missed", "reported_short", "holiday_not_worked"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const BONUS_KINDS = ["nondiscretionary", "flat_sum"] as const;
/** The largest bonus accepted here, in cents ($100,000.00), as the engine's own limit. */
export const MAX_BONUS_CENTS = 10_000_000;

export class PayEventRefusedError extends Error {
  constructor(readonly code: "reason_required" | "outside_period" | "not_on_assignment" | "already_recorded" | "holiday_and_short_day" | "duplicate_bonus" | "bad_amount" | "bad_schedule" | "not_found" | "not_allowed") {
    super(code);
    this.name = "PayEventRefusedError";
  }
}

export interface ConfirmationInput {
  workerId: string;
  assignmentId: string;
  workDate: string;
  kind: EventKind;
  /** reported_short: the minutes the worker was scheduled (California and Massachusetts need it). */
  scheduledMinutes: number | null;
  /** reported_short: placed at another client the same shift (Illinois and New Jersey). */
  reassigned: boolean;
  reason: string;
}

export interface BonusInput {
  workerId: string;
  assignmentId: string;
  workweekStart: string;
  amountCents: number;
  kind: (typeof BONUS_KINDS)[number];
  reason: string;
  /** The same bonus (worker, assignment, week, amount, kind) is already on file and the person means a second one. */
  confirmDuplicate?: boolean;
}

/** Pay events are entered by people who may change hours (the hours ability); checked here too. */
function mayEnter(actor: Actor): void {
  if (!can(actor, "hours")) throw new PayEventRefusedError("not_allowed");
}

/**
 * The workweeks a bonus may be for: those that start inside the period — exactly the bonuses the
 * run reads (computeRun: week start from the period's first day to its last), so one accepted is paid.
 */
async function bonusWeeks(tx: Tx, period: { startsOn: string; endsOn: string }): Promise<string[]> {
  const startsOn = ((await settingOn<number>(tx, "workweek_starts_on", period.startsOn)) ?? 1) as Weekday;
  const weeks: string[] = [];
  let w = workweekStart(period.startsOn, startsOn);
  if (w < period.startsOn) w = addDays(w, 7);
  for (; w <= period.endsOn; w = addDays(w, 7)) weeks.push(w);
  return weeks;
}

async function checkAssignment(tx: Tx, workerId: string, assignmentId: string): Promise<void> {
  const [a] = await tx.select({ workerId: s.assignments.workerId }).from(s.assignments).where(eq(s.assignments.id, assignmentId));
  if (!a || a.workerId !== workerId) throw new PayEventRefusedError("not_on_assignment");
}

export async function recordConfirmation(tx: Tx, actor: Actor, payPeriodId: string, input: ConfirmationInput): Promise<string> {
  mayEnter(actor);
  const reason = input.reason.trim();
  if (reason === "") throw new PayEventRefusedError("reason_required");
  const period = await openPeriod(tx, payPeriodId);
  if (input.workDate < period.startsOn || input.workDate > period.endsOn) throw new PayEventRefusedError("outside_period");
  await checkAssignment(tx, input.workerId, input.assignmentId);
  const short = input.kind === "reported_short";
  if (short && input.scheduledMinutes !== null && (!Number.isSafeInteger(input.scheduledMinutes) || input.scheduledMinutes <= 0 || input.scheduledMinutes > 1440)) throw new PayEventRefusedError("bad_schedule");
  const [same] = await tx
    .select({ id: s.premiumConfirmations.id })
    .from(s.premiumConfirmations)
    .where(and(eq(s.premiumConfirmations.workerId, input.workerId), eq(s.premiumConfirmations.assignmentId, input.assignmentId), eq(s.premiumConfirmations.workDate, input.workDate), eq(s.premiumConfirmations.kind, input.kind)));
  if (same) throw new PayEventRefusedError("already_recorded");
  // A holiday not worked and a short day on the same assignment and day would both pay: one or the other.
  const other = input.kind === "holiday_not_worked" ? "reported_short" : input.kind === "reported_short" ? "holiday_not_worked" : null;
  if (other) {
    const [clash] = await tx
      .select({ id: s.premiumConfirmations.id })
      .from(s.premiumConfirmations)
      .where(and(eq(s.premiumConfirmations.workerId, input.workerId), eq(s.premiumConfirmations.assignmentId, input.assignmentId), eq(s.premiumConfirmations.workDate, input.workDate), eq(s.premiumConfirmations.kind, other)));
    if (clash) throw new PayEventRefusedError("holiday_and_short_day");
  }
  const [row] = await tx
    .insert(s.premiumConfirmations)
    .values({
      agencyId: actor.agencyId,
      workerId: input.workerId,
      assignmentId: input.assignmentId,
      workDate: input.workDate,
      kind: input.kind,
      scheduledMinutes: short ? input.scheduledMinutes : null,
      reassigned: short && input.reassigned,
      note: reason,
      confirmedBy: actor.userId,
    })
    .returning({ id: s.premiumConfirmations.id });
  await audit(tx, actor, [{ action: "create", entityType: "premium_confirmation", entityId: row!.id, after: { workerId: input.workerId, assignmentId: input.assignmentId, workDate: input.workDate, kind: input.kind, scheduledMinutes: short ? input.scheduledMinutes : null, reassigned: short && input.reassigned }, reason }]);
  return row!.id;
}

export async function recordBonus(tx: Tx, actor: Actor, payPeriodId: string, input: BonusInput): Promise<string> {
  mayEnter(actor);
  const reason = input.reason.trim();
  if (reason === "") throw new PayEventRefusedError("reason_required");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > MAX_BONUS_CENTS) throw new PayEventRefusedError("bad_amount");
  const period = await openPeriod(tx, payPeriodId);
  // A bonus belongs to one workweek that starts inside the period, by the agency's workweek.
  if (!(await bonusWeeks(tx, period)).includes(input.workweekStart)) throw new PayEventRefusedError("outside_period");
  await checkAssignment(tx, input.workerId, input.assignmentId);
  if (!input.confirmDuplicate) {
    const [same] = await tx
      .select({ id: s.bonuses.id })
      .from(s.bonuses)
      .where(and(eq(s.bonuses.workerId, input.workerId), eq(s.bonuses.assignmentId, input.assignmentId), eq(s.bonuses.workweekStart, input.workweekStart), eq(s.bonuses.amountCents, input.amountCents), eq(s.bonuses.kind, input.kind)));
    if (same) throw new PayEventRefusedError("duplicate_bonus");
  }
  const [row] = await tx
    .insert(s.bonuses)
    .values({ agencyId: actor.agencyId, workerId: input.workerId, assignmentId: input.assignmentId, workweekStart: input.workweekStart, amountCents: input.amountCents, kind: input.kind, note: reason, enteredBy: actor.userId })
    .returning({ id: s.bonuses.id });
  await audit(tx, actor, [{ action: "create", entityType: "bonus", entityId: row!.id, after: { workerId: input.workerId, assignmentId: input.assignmentId, workweekStart: input.workweekStart, amountCents: input.amountCents, kind: input.kind }, reason }]);
  return row!.id;
}

/** Takes an entered event back, with a reason; the next computation no longer pays it. */
export async function removePayEvent(tx: Tx, actor: Actor, payPeriodId: string, event: { kind: "confirmation" | "bonus"; id: string }, reasonText: string): Promise<void> {
  mayEnter(actor);
  const reason = reasonText.trim();
  if (reason === "") throw new PayEventRefusedError("reason_required");
  const period = await openPeriod(tx, payPeriodId);
  if (event.kind === "confirmation") {
    const [row] = await tx.select().from(s.premiumConfirmations).where(eq(s.premiumConfirmations.id, event.id));
    if (!row || row.workDate < period.startsOn || row.workDate > period.endsOn) throw new PayEventRefusedError("not_found");
    await tx.delete(s.premiumConfirmations).where(eq(s.premiumConfirmations.id, event.id));
    await audit(tx, actor, [{ action: "delete", entityType: "premium_confirmation", entityId: row.id, before: { workerId: row.workerId, workDate: row.workDate, kind: row.kind }, reason }]);
  } else {
    const [row] = await tx.select().from(s.bonuses).where(eq(s.bonuses.id, event.id));
    // Only a bonus this period pays: one for an earlier period stays with it (locked once paid).
    if (!row || row.workweekStart < period.startsOn || row.workweekStart > period.endsOn) throw new PayEventRefusedError("not_found");
    await tx.delete(s.bonuses).where(eq(s.bonuses.id, event.id));
    await audit(tx, actor, [{ action: "delete", entityType: "bonus", entityId: row.id, before: { workerId: row.workerId, workweekStart: row.workweekStart, amountCents: row.amountCents, kind: row.kind }, reason }]);
  }
}

export interface PayEventsView {
  events: {
    kind: "confirmation" | "bonus";
    id: string;
    eventKind: EventKind | (typeof BONUS_KINDS)[number];
    workerId: string;
    workerName: string;
    assignmentLabel: string;
    date: string;
    amountCents: number | null;
    scheduledMinutes: number | null;
    reassigned: boolean;
    reason: string;
  }[];
  /** Who can have an event: the workers with hours on an assignment in the period. */
  options: { workerId: string; name: string; assignments: { assignmentId: string; label: string }[] }[];
  /** The period's workweeks, by their first day (for a bonus). */
  weeks: string[];
  period: { startsOn: string; endsOn: string };
}

export async function payEventsView(tx: Tx, payPeriodId: string): Promise<PayEventsView> {
  const [period] = await tx.select().from(s.payPeriods).where(eq(s.payPeriods.id, payPeriodId));
  if (!period) return { events: [], options: [], weeks: [], period: { startsOn: "", endsOn: "" } };
  const entries = await tx
    .select({ workerId: s.timeEntries.workerId, assignmentId: s.timeEntries.assignmentId })
    .from(s.timeEntries)
    .where(eq(s.timeEntries.payPeriodId, payPeriodId));
  const pairs = entries.filter((e): e is { workerId: string; assignmentId: string } => e.workerId !== null && e.assignmentId !== null);
  const confirmations = await tx.select().from(s.premiumConfirmations).where(and(gte(s.premiumConfirmations.workDate, period.startsOn), lte(s.premiumConfirmations.workDate, period.endsOn)));
  const bonuses = await tx.select().from(s.bonuses).where(and(gte(s.bonuses.workweekStart, period.startsOn), lte(s.bonuses.workweekStart, period.endsOn)));
  const workerIds = [...new Set([...pairs.map((p) => p.workerId), ...confirmations.map((c) => c.workerId), ...bonuses.map((b) => b.workerId)])];
  const assignmentIds = [...new Set([...pairs.map((p) => p.assignmentId), ...confirmations.map((c) => c.assignmentId), ...bonuses.map((b) => b.assignmentId)])];
  const workers = workerIds.length > 0 ? await tx.select({ id: s.workers.id, firstName: s.workers.firstName, lastName: s.workers.lastName }).from(s.workers).where(inArray(s.workers.id, workerIds)) : [];
  const nameOf = new Map(workers.map((w) => [w.id, `${w.firstName} ${w.lastName}`]));
  const labels =
    assignmentIds.length > 0
      ? await tx
          .select({ id: s.assignments.id, position: s.jobOrders.position, client: s.clients.name })
          .from(s.assignments)
          .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
          .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId))
          .where(inArray(s.assignments.id, assignmentIds))
      : [];
  const labelOf = new Map(labels.map((l) => [l.id, `${l.position} · ${l.client}`]));
  const byWorker = new Map<string, Set<string>>();
  for (const p of pairs) byWorker.set(p.workerId, (byWorker.get(p.workerId) ?? new Set()).add(p.assignmentId));
  const weeks = await bonusWeeks(tx, period);
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return {
    events: [
      ...confirmations.map((c) => ({ kind: "confirmation" as const, id: c.id, eventKind: c.kind, workerId: c.workerId, workerName: nameOf.get(c.workerId) ?? "", assignmentLabel: labelOf.get(c.assignmentId) ?? "", date: c.workDate, amountCents: null, scheduledMinutes: c.scheduledMinutes, reassigned: c.reassigned, reason: c.note ?? "" })),
      ...bonuses.map((b) => ({ kind: "bonus" as const, id: b.id, eventKind: b.kind, workerId: b.workerId, workerName: nameOf.get(b.workerId) ?? "", assignmentLabel: labelOf.get(b.assignmentId) ?? "", date: b.workweekStart, amountCents: b.amountCents, scheduledMinutes: null, reassigned: false, reason: b.note ?? "" })),
    ].sort((a, b) => a.workerName.localeCompare(b.workerName) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    options: [...byWorker]
      .map(([workerId, ids]) => ({ workerId, name: nameOf.get(workerId) ?? "", assignments: [...ids].map((id) => ({ assignmentId: id, label: labelOf.get(id) ?? "" })).sort((a, b) => a.label.localeCompare(b.label)) }))
      .sort(byName),
    weeks,
    period: { startsOn: period.startsOn, endsOn: period.endsOn },
  };
}
