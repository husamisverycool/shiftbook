/**
 * Scheduling and shift fill (slice u, decision 0041; docs/patterns/schedule.md). Shifts of job orders,
 * published (When I Work's pending changes; Deputy's three-step publish), offered to eligible workers
 * (Deputy "send offers"), confirmed or declined by the worker (Deputy's lifecycle; Instawork's confirm
 * window), marked no-show with a replacement. A confirmed shift places the worker on the job order. A
 * schedule never makes a time entry (SPEC §6): hours still come only from timesheets. Every change is
 * audited.
 */
import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { addDays, isIsoDate } from "@shiftbook/rules";
import { audit, auditBy } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { lockCatalog } from "../run/period-lock";
import type { Actor } from "../session";
import { agencyZone } from "../settings";
import { CONFIRM_DEADLINE_MINUTES, overlaps, type ShiftLike } from "./logic";

export type ShiftError =
  | "not_found"
  | "job_order_not_found"
  | "worker_not_found"
  | "invalid_date"
  | "invalid_time"
  | "invalid_copies"
  | "not_open"
  | "not_yours"
  | "already_answered"
  | "not_started"
  | "reason_required";
export type ShiftResult = { ok: true; ids: string[] } | { ok: false; error: ShiftError };

export interface ShiftInput {
  jobOrderId: string;
  workDate: string;
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
  /** null: an open shift. */
  workerId: string | null;
  /** How many identical shifts (When I Work "how many"); a shift with a worker is always one. */
  copies: number;
  requireConfirmation: boolean;
}

/** Who answers a shift: a worker (the worker app, or the demo preview), by name for the activity log. */
export interface WorkerWho {
  agencyId: string;
  workerId: string;
  label: string;
}

const MAX_COPIES = 50;

function inputProblem(i: ShiftInput): ShiftError | null {
  if (!isIsoDate(i.workDate)) return "invalid_date";
  const ints = [i.startMinute, i.endMinute, i.breakMinutes].every(Number.isInteger);
  if (!ints || i.startMinute < 0 || i.startMinute > 1439 || i.endMinute <= i.startMinute || i.endMinute > i.startMinute + 1440 || i.breakMinutes < 0 || i.breakMinutes >= i.endMinute - i.startMinute) return "invalid_time";
  if (!Number.isInteger(i.copies) || i.copies < 1 || i.copies > MAX_COPIES || (i.workerId !== null && i.copies !== 1)) return "invalid_copies";
  return null;
}

async function jobOrderExists(tx: Tx, id: string) {
  const [row] = await tx.select({ id: s.jobOrders.id }).from(s.jobOrders).where(eq(s.jobOrders.id, id));
  return !!row;
}

async function workerExists(tx: Tx, id: string) {
  const [row] = await tx.select({ id: s.workers.id }).from(s.workers).where(eq(s.workers.id, id));
  return !!row;
}

export async function createShifts(tx: Tx, actor: Actor, input: ShiftInput): Promise<ShiftResult> {
  const bad = inputProblem(input);
  if (bad) return { ok: false, error: bad };
  if (!(await jobOrderExists(tx, input.jobOrderId))) return { ok: false, error: "job_order_not_found" };
  if (input.workerId && !(await workerExists(tx, input.workerId))) return { ok: false, error: "worker_not_found" };
  const rows = await tx
    .insert(s.shifts)
    .values(
      Array.from({ length: input.copies }, () => ({
        agencyId: actor.agencyId,
        jobOrderId: input.jobOrderId,
        workDate: input.workDate,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        breakMinutes: input.breakMinutes,
        workerId: input.workerId,
        state: (input.workerId ? "assigned" : "open") as s.ShiftState,
        requireConfirmation: input.requireConfirmation,
        createdBy: actor.userId,
      })),
    )
    .returning({ id: s.shifts.id });
  await audit(tx, actor, rows.map((r) => ({ action: "create" as const, entityType: "shift", entityId: r.id, after: { ...input, copies: undefined } })));
  return { ok: true, ids: rows.map((r) => r.id) };
}

/** A change makes the shift unpublished again; a new worker or time asks for a new answer. */
export async function updateShift(tx: Tx, actor: Actor, id: string, input: Omit<ShiftInput, "copies">): Promise<ShiftResult> {
  const bad = inputProblem({ ...input, copies: 1 });
  if (bad) return { ok: false, error: bad };
  const [before] = await tx.select().from(s.shifts).where(eq(s.shifts.id, id)).for("update");
  if (!before || before.state === "cancelled") return { ok: false, error: "not_found" };
  if (!(await jobOrderExists(tx, input.jobOrderId))) return { ok: false, error: "job_order_not_found" };
  if (input.workerId && !(await workerExists(tx, input.workerId))) return { ok: false, error: "worker_not_found" };
  const sameWork =
    before.workerId === input.workerId && before.jobOrderId === input.jobOrderId && before.workDate === input.workDate && before.startMinute === input.startMinute && before.endMinute === input.endMinute;
  const state: s.ShiftState = input.workerId === null ? "open" : sameWork && before.state !== "open" ? before.state : "assigned";
  await tx
    .update(s.shifts)
    .set({
      jobOrderId: input.jobOrderId,
      workDate: input.workDate,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      breakMinutes: input.breakMinutes,
      workerId: input.workerId,
      requireConfirmation: input.requireConfirmation,
      state,
      assignmentId: sameWork ? before.assignmentId : null,
      confirmBy: sameWork ? before.confirmBy : null,
      warning: input.workerId === null && sameWork ? before.warning : null,
      warningWorkerId: input.workerId === null && sameWork ? before.warningWorkerId : null,
      warningReason: input.workerId === null && sameWork ? before.warningReason : null,
      changedAt: sql`clock_timestamp()`,
    })
    .where(eq(s.shifts.id, id));
  if (!sameWork) await tx.update(s.shiftOffers).set({ status: "withdrawn" }).where(and(eq(s.shiftOffers.shiftId, id), eq(s.shiftOffers.status, "offered")));
  await audit(tx, actor, [{ action: "update", entityType: "shift", entityId: id, before, after: input }]);
  return { ok: true, ids: [id] };
}

/** Never published: gone. Published: cancelled, so the worker's list shows it (Instawork's Cancelled). */
export async function deleteShift(tx: Tx, actor: Actor, id: string): Promise<ShiftResult> {
  const [before] = await tx.select().from(s.shifts).where(eq(s.shifts.id, id)).for("update");
  if (!before || before.state === "cancelled") return { ok: false, error: "not_found" };
  if (before.publishedAt === null) await tx.delete(s.shifts).where(eq(s.shifts.id, id));
  else {
    await tx.update(s.shifts).set({ state: "cancelled", changedAt: sql`clock_timestamp()` }).where(eq(s.shifts.id, id));
    await tx.update(s.shiftOffers).set({ status: "withdrawn" }).where(and(eq(s.shiftOffers.shiftId, id), eq(s.shiftOffers.status, "offered")));
  }
  await audit(tx, actor, [{ action: "delete", entityType: "shift", entityId: id, before }]);
  return { ok: true, ids: [id] };
}

export interface EligibleWorker {
  workerId: string;
  name: string;
  /** 1: placed on this job order that day; 2: placed in the same position that day. */
  tier: 1 | 2;
  /** Already has a shift that overlaps this one (When I Work's scheduling concerns). */
  conflict: boolean;
}

/** Workers placed on the job order that day, then those placed in the same position; overlaps flagged. */
export async function eligibleWorkers(tx: Tx, shift: { id?: string; jobOrderId: string; workDate: string; startMinute: number; endMinute: number; breakMinutes: number }): Promise<EligibleWorker[]> {
  const [job] = await tx.select({ position: s.jobOrders.position }).from(s.jobOrders).where(eq(s.jobOrders.id, shift.jobOrderId));
  if (!job) return [];
  const placed = await tx
    .select({ workerId: s.assignments.workerId, jobOrderId: s.assignments.jobOrderId, position: s.jobOrders.position, first: s.workers.firstName, last: s.workers.lastName })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.workers, eq(s.workers.id, s.assignments.workerId))
    .where(
      and(
        ne(s.assignments.status, "cancelled"),
        eq(s.workers.status, "active"),
        lte(s.assignments.startDate, shift.workDate),
        or(isNull(s.assignments.endDate), gte(s.assignments.endDate, shift.workDate)),
        or(eq(s.assignments.jobOrderId, shift.jobOrderId), sql`lower(${s.jobOrders.position}) = lower(${job.position})`),
      ),
    );
  const best = new Map<string, EligibleWorker>();
  for (const p of placed) {
    const tier = p.jobOrderId === shift.jobOrderId ? 1 : 2;
    const had = best.get(p.workerId);
    if (!had || tier < had.tier) best.set(p.workerId, { workerId: p.workerId, name: `${p.first} ${p.last}`, tier, conflict: false });
  }
  if (best.size === 0) return [];
  const theirs = await tx
    .select()
    .from(s.shifts)
    .where(and(inArray(s.shifts.workerId, [...best.keys()]), gte(s.shifts.workDate, addDays(shift.workDate, -1)), lte(s.shifts.workDate, addDays(shift.workDate, 1)), ne(s.shifts.state, "cancelled")));
  const me: ShiftLike = { id: shift.id ?? "new", ...shift, workerId: null, state: "open", publishedAt: null, changedAt: new Date(0), warning: null, noShow: false };
  for (const w of best.values()) w.conflict = theirs.some((t) => t.workerId === w.workerId && overlaps({ ...me, workerId: w.workerId }, t));
  return [...best.values()].sort((a, b) => a.tier - b.tier || Number(a.conflict) - Number(b.conflict) || a.name.localeCompare(b.name));
}

export type NotifyMode = "confirm" | "notify" | "silent";
export interface PublishInput {
  from: string;
  to: string;
  /** Deputy step 1: only the changes, or every shift in view. */
  scope: "changes" | "all";
  /** Deputy step 2: which clients; null for all. */
  clientIds: string[] | null;
  /** Deputy step 3. */
  notify: NotifyMode;
  message: string | null;
}

/**
 * Publishes the shifts in view: assigned shifts await the worker's answer when confirmation is asked
 * (due 16 hours before the start, in the agency's time zone); open shifts are offered to their eligible
 * workers without a clash (Deputy "send offers"). Notices go out with the message when asked.
 */
export async function publishShifts(tx: Tx, actor: Actor, input: PublishInput): Promise<{ ok: true; published: number; offered: number } | { ok: false; error: ShiftError }> {
  if (!isIsoDate(input.from) || !isIsoDate(input.to) || input.to < input.from) return { ok: false, error: "invalid_date" };
  const zone = await agencyZone(tx);
  const rows = await tx
    .select({ shift: s.shifts, clientId: s.jobOrders.clientId })
    .from(s.shifts)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.shifts.jobOrderId))
    .where(and(gte(s.shifts.workDate, input.from), lte(s.shifts.workDate, input.to), ne(s.shifts.state, "cancelled")));
  const chosen = rows
    .filter((r) => input.clientIds === null || input.clientIds.includes(r.clientId))
    .filter((r) => input.scope === "all" || r.shift.publishedAt === null || r.shift.changedAt > r.shift.publishedAt)
    .map((r) => r.shift);
  let offered = 0;
  for (const sh of chosen) {
    const asks = input.notify === "confirm" && sh.requireConfirmation && sh.workerId !== null && sh.state === "assigned";
    await tx
      .update(s.shifts)
      .set({
        publishedAt: sql`clock_timestamp()`,
        state: asks ? "awaiting" : sh.state,
        confirmBy: asks
          ? sql`((${sh.workDate}::date + make_interval(mins => ${sh.startMinute})) AT TIME ZONE ${zone}) - make_interval(mins => ${CONFIRM_DEADLINE_MINUTES})`
          : sh.confirmBy,
      })
      .where(eq(s.shifts.id, sh.id));
    if (sh.state === "open" && input.notify !== "silent") {
      const to = (await eligibleWorkers(tx, sh)).filter((w) => !w.conflict && w.workerId !== sh.warningWorkerId);
      if (to.length > 0) {
        const made = await tx
          .insert(s.shiftOffers)
          .values(to.map((w) => ({ agencyId: actor.agencyId, shiftId: sh.id, workerId: w.workerId })))
          .onConflictDoNothing()
          .returning({ id: s.shiftOffers.id });
        offered += made.length;
      }
    }
  }
  await audit(tx, actor, [{ action: "update", entityType: "schedule", entityId: actor.agencyId, after: { published: chosen.map((c) => c.id), offered, ...input } }]);
  return { ok: true, published: chosen.length, offered };
}

/** No answer by the deadline: the shift opens again with a warning (Deputy). Run before reading. */
export async function expireOverdue(tx: Tx): Promise<number> {
  const rows = await tx
    .update(s.shifts)
    .set({ state: "open", warning: "expired", warningWorkerId: sql`${s.shifts.workerId}`, workerId: null, assignmentId: null, confirmBy: null, changedAt: sql`clock_timestamp()` })
    .where(and(eq(s.shifts.state, "awaiting"), sql`${s.shifts.confirmBy} < now()`))
    .returning({ id: s.shifts.id });
  return rows.length;
}

/** The worker's placement on the job order that day, made from that date when there is none (at the job order's rates). */
async function ensureAssignment(tx: Tx, who: { agencyId: string; userId: string | null; label: string }, workerId: string, jobOrderId: string, date: string): Promise<string> {
  await lockCatalog(tx, who.agencyId, "exclusive");
  const theirs = await tx
    .select()
    .from(s.assignments)
    .where(and(eq(s.assignments.workerId, workerId), eq(s.assignments.jobOrderId, jobOrderId), ne(s.assignments.status, "cancelled")))
    .orderBy(asc(s.assignments.startDate));
  const covering = theirs.find((a) => a.startDate <= date && (a.endDate === null || a.endDate >= date));
  if (covering) return covering.id;
  // A later placement on the same order bounds this one so they never overlap.
  const later = theirs.find((a) => a.startDate > date);
  const [row] = await tx
    .insert(s.assignments)
    .values({ agencyId: who.agencyId, workerId, jobOrderId, startDate: date, endDate: later ? addDays(later.startDate, -1) : null, status: "active" })
    .returning({ id: s.assignments.id });
  await auditBy(tx, who, [{ action: "create", entityType: "assignment", entityId: row!.id, after: { workerId, jobOrderId, startDate: date, from: "schedule" } }]);
  return row!.id;
}

const whoOf = (w: WorkerWho) => ({ agencyId: w.agencyId, userId: null, label: w.label });

/** The worker confirms their shift (Deputy; Instawork). */
export async function confirmShift(tx: Tx, who: WorkerWho, shiftId: string): Promise<ShiftResult> {
  await expireOverdue(tx);
  const [sh] = await tx.select().from(s.shifts).where(eq(s.shifts.id, shiftId)).for("update");
  if (!sh || sh.state === "cancelled") return { ok: false, error: "not_found" };
  if (sh.workerId !== who.workerId) return { ok: false, error: "not_yours" };
  if (sh.state === "confirmed") return { ok: false, error: "already_answered" };
  const assignmentId = await ensureAssignment(tx, whoOf(who), who.workerId, sh.jobOrderId, sh.workDate);
  await tx.update(s.shifts).set({ state: "confirmed", assignmentId, confirmBy: null }).where(eq(s.shifts.id, shiftId));
  await auditBy(tx, whoOf(who), [{ action: "approve", entityType: "shift", entityId: shiftId, after: { state: "confirmed", assignmentId } }]);
  return { ok: true, ids: [shiftId] };
}

/** The worker can't make it: a reason is required; the shift opens again with a warning (Deputy; Instawork). */
export async function declineShift(tx: Tx, who: WorkerWho, shiftId: string, reason: string): Promise<ShiftResult> {
  const why = reason.trim();
  if (why.length === 0 || why.length > 500) return { ok: false, error: "reason_required" };
  const [sh] = await tx.select().from(s.shifts).where(eq(s.shifts.id, shiftId)).for("update");
  if (!sh || sh.state === "cancelled") return { ok: false, error: "not_found" };
  if (sh.workerId !== who.workerId) return { ok: false, error: "not_yours" };
  await tx
    .update(s.shifts)
    .set({ state: "open", workerId: null, assignmentId: null, confirmBy: null, warning: "declined", warningWorkerId: who.workerId, warningReason: why, changedAt: sql`clock_timestamp()` })
    .where(eq(s.shifts.id, shiftId));
  await auditBy(tx, whoOf(who), [{ action: "update", entityType: "shift", entityId: shiftId, before: { state: sh.state }, after: { state: "open", warning: "declined" }, reason: why }]);
  return { ok: true, ids: [shiftId] };
}

/** An offer answered: the first to accept takes the shift, confirmed; the other offers are withdrawn. */
export async function answerOffer(tx: Tx, who: WorkerWho, offerId: string, accept: boolean, reason: string | null): Promise<ShiftResult> {
  const [offer] = await tx.select().from(s.shiftOffers).where(eq(s.shiftOffers.id, offerId)).for("update");
  if (!offer) return { ok: false, error: "not_found" };
  if (offer.workerId !== who.workerId) return { ok: false, error: "not_yours" };
  if (offer.status !== "offered") return { ok: false, error: "already_answered" };
  const why = reason?.trim() || null;
  if (why && why.length > 500) return { ok: false, error: "reason_required" };
  if (!accept) {
    await tx.update(s.shiftOffers).set({ status: "declined", reason: why, respondedAt: sql`now()` }).where(eq(s.shiftOffers.id, offerId));
    await auditBy(tx, whoOf(who), [{ action: "update", entityType: "shift_offer", entityId: offerId, after: { status: "declined" }, reason: why }]);
    return { ok: true, ids: [offer.shiftId] };
  }
  const [sh] = await tx.select().from(s.shifts).where(eq(s.shifts.id, offer.shiftId)).for("update");
  if (!sh || sh.state !== "open") {
    await tx.update(s.shiftOffers).set({ status: "withdrawn" }).where(eq(s.shiftOffers.id, offerId));
    return { ok: false, error: "not_open" };
  }
  const assignmentId = await ensureAssignment(tx, whoOf(who), who.workerId, sh.jobOrderId, sh.workDate);
  await tx.update(s.shifts).set({ state: "confirmed", workerId: who.workerId, assignmentId, warning: null, warningWorkerId: null, warningReason: null, confirmBy: null }).where(eq(s.shifts.id, sh.id));
  await tx.update(s.shiftOffers).set({ status: "accepted", respondedAt: sql`now()` }).where(eq(s.shiftOffers.id, offerId));
  await tx.update(s.shiftOffers).set({ status: "withdrawn" }).where(and(eq(s.shiftOffers.shiftId, sh.id), eq(s.shiftOffers.status, "offered")));
  await auditBy(tx, whoOf(who), [{ action: "approve", entityType: "shift", entityId: sh.id, after: { state: "confirmed", workerId: who.workerId, assignmentId, offerId } }]);
  return { ok: true, ids: [sh.id] };
}

/**
 * The worker did not come: marked no-show (Deputy). While the shift has not ended, a replacement open
 * shift for the rest of it is made and offered to the eligible workers, the absent one left out.
 */
export async function markNoShow(tx: Tx, actor: Actor, shiftId: string, replace: boolean): Promise<ShiftResult> {
  const [sh] = await tx.select().from(s.shifts).where(eq(s.shifts.id, shiftId)).for("update");
  if (!sh || sh.state === "cancelled" || sh.workerId === null) return { ok: false, error: "not_found" };
  const zone = await agencyZone(tx);
  const [when] = await tx.execute<{ started: boolean; ended: boolean }>(
    sql`select now() >= ((${sh.workDate}::date + make_interval(mins => ${sh.startMinute})) AT TIME ZONE ${zone}) as started,
               now() >= ((${sh.workDate}::date + make_interval(mins => ${sh.endMinute})) AT TIME ZONE ${zone}) as ended`,
  );
  if (!when?.started) return { ok: false, error: "not_started" };
  await tx.update(s.shifts).set({ noShow: true }).where(eq(s.shifts.id, shiftId));
  const ids = [shiftId];
  if (replace && !when.ended) {
    const [copy] = await tx
      .insert(s.shifts)
      .values({
        agencyId: actor.agencyId,
        jobOrderId: sh.jobOrderId,
        workDate: sh.workDate,
        startMinute: sh.startMinute,
        endMinute: sh.endMinute,
        breakMinutes: sh.breakMinutes,
        workerId: null,
        state: "open",
        requireConfirmation: sh.requireConfirmation,
        replacesShiftId: sh.id,
        publishedAt: sql`clock_timestamp()`,
        changedAt: sql`now()`,
        createdBy: actor.userId,
      })
      .returning({ id: s.shifts.id });
    const to = (await eligibleWorkers(tx, { ...sh, id: copy!.id })).filter((w) => !w.conflict && w.workerId !== sh.workerId);
    if (to.length > 0) await tx.insert(s.shiftOffers).values(to.map((w) => ({ agencyId: actor.agencyId, shiftId: copy!.id, workerId: w.workerId }))).onConflictDoNothing();
    ids.push(copy!.id);
  }
  await audit(tx, actor, [{ action: "update", entityType: "shift", entityId: shiftId, after: { noShow: true, replacement: ids[1] ?? null } }]);
  return { ok: true, ids };
}
