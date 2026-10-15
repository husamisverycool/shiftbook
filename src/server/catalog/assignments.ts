/**
 * Assignments — the spine (SPEC §4; docs/patterns/assignments.md, job-orders/[id].md): a worker on a
 * job order from a start date to an optional end date. Workers are only chosen from the roster,
 * never created (SPEC §6). Dates never move so that paid hours fall outside them, and an assignment
 * with paid hours is never cancelled (SPEC §8: paid weeks never change). Every change is audited.
 */
import { and, eq, ne } from "drizzle-orm";
import { isIsoDate } from "@shiftbook/rules";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { lockCatalog } from "../run/period-lock";
import type { Actor } from "../session";
import { paidDates } from "./paid";

export type AssignmentError =
  | "not_found"
  | "worker_not_found"
  | "job_order_not_found"
  | "invalid_date"
  | "end_before_start"
  | "overlaps"
  | "paid_outside"
  | "has_paid_hours"
  | "reason_required"
  | "already_cancelled";
export type AssignmentResult = { ok: true; id: string } | { ok: false; error: AssignmentError; paid?: { first: string; last: string } };

const overlap = (a: { start: string; end: string | null }, b: { start: string; end: string | null }) =>
  a.start <= (b.end ?? "9999-12-31") && b.start <= (a.end ?? "9999-12-31");

function datesProblem(start: string, end: string | null): AssignmentError | null {
  if (!isIsoDate(start) || (end !== null && !isIsoDate(end))) return "invalid_date";
  if (end !== null && end < start) return "end_before_start";
  return null;
}

/** A worker's other live assignment on the same job order overlapping these dates, if any. */
async function overlapping(tx: Tx, workerId: string, jobOrderId: string, dates: { start: string; end: string | null }, except: string | null) {
  const rows = await tx
    .select()
    .from(s.assignments)
    .where(and(eq(s.assignments.workerId, workerId), eq(s.assignments.jobOrderId, jobOrderId), ne(s.assignments.status, "cancelled")));
  return rows.find((r) => r.id !== except && overlap(dates, { start: r.startDate, end: r.endDate })) ?? null;
}

export async function createAssignment(
  tx: Tx,
  actor: Actor,
  input: { workerId: string; jobOrderId: string; startDate: string; endDate: string | null; external?: { source: string; id: string } },
): Promise<AssignmentResult> {
  const bad = datesProblem(input.startDate, input.endDate);
  if (bad) return { ok: false, error: bad };
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const [worker] = await tx.select({ id: s.workers.id }).from(s.workers).where(eq(s.workers.id, input.workerId));
  if (!worker) return { ok: false, error: "worker_not_found" };
  const [job] = await tx.select({ id: s.jobOrders.id }).from(s.jobOrders).where(eq(s.jobOrders.id, input.jobOrderId));
  if (!job) return { ok: false, error: "job_order_not_found" };
  if (await overlapping(tx, input.workerId, input.jobOrderId, { start: input.startDate, end: input.endDate }, null)) return { ok: false, error: "overlaps" };
  const [row] = await tx
    .insert(s.assignments)
    .values({
      agencyId: actor.agencyId,
      workerId: input.workerId,
      jobOrderId: input.jobOrderId,
      startDate: input.startDate,
      endDate: input.endDate,
      status: "active",
      externalSource: input.external?.source ?? null,
      externalId: input.external?.id ?? null,
    })
    .returning({ id: s.assignments.id });
  await audit(tx, actor, [{ action: "create", entityType: "assignment", entityId: row!.id, after: { ...input } }]);
  return { ok: true, id: row!.id };
}

/** Changes an assignment's dates; paid hours must stay inside them. An end date in the past ends it. */
export async function setAssignmentDates(tx: Tx, actor: Actor, id: string, dates: { startDate: string; endDate: string | null }, today: string): Promise<AssignmentResult> {
  const bad = datesProblem(dates.startDate, dates.endDate);
  if (bad) return { ok: false, error: bad };
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const [current] = await tx.select().from(s.assignments).where(eq(s.assignments.id, id));
  if (!current) return { ok: false, error: "not_found" };
  if (current.status === "cancelled") return { ok: false, error: "already_cancelled" };
  const paid = await paidDates(tx, id);
  if (paid && (dates.startDate > paid.first || (dates.endDate !== null && dates.endDate < paid.last))) return { ok: false, error: "paid_outside", paid };
  if (await overlapping(tx, current.workerId, current.jobOrderId, { start: dates.startDate, end: dates.endDate }, id)) return { ok: false, error: "overlaps" };
  const status = dates.endDate !== null && dates.endDate < today ? "ended" : "active";
  await tx.update(s.assignments).set({ startDate: dates.startDate, endDate: dates.endDate, status }).where(eq(s.assignments.id, id));
  await audit(tx, actor, [
    { action: "update", entityType: "assignment", entityId: id, before: { startDate: current.startDate, endDate: current.endDate, status: current.status }, after: { ...dates, status } },
  ]);
  return { ok: true, id };
}

/** Ends assignments on one date (bulk bar). Each is checked on its own; returns which ended. */
export async function endAssignments(tx: Tx, actor: Actor, ids: string[], endDate: string, today: string): Promise<{ ended: string[]; refused: { id: string; error: AssignmentError }[] }> {
  const ended: string[] = [];
  const refused: { id: string; error: AssignmentError }[] = [];
  for (const id of [...new Set(ids)].sort()) {
    const [current] = await tx.select({ startDate: s.assignments.startDate }).from(s.assignments).where(eq(s.assignments.id, id));
    const r = current ? await setAssignmentDates(tx, actor, id, { startDate: current.startDate, endDate }, today) : { ok: false as const, error: "not_found" as const };
    if (r.ok) ended.push(id);
    else refused.push({ id, error: r.error });
  }
  return { ended, refused };
}

/** Cancels an assignment that never had paid hours, with a reason. Its hours are never payable. */
export async function cancelAssignment(tx: Tx, actor: Actor, id: string, reason: string): Promise<AssignmentResult> {
  const why = reason.trim();
  if (why === "") return { ok: false, error: "reason_required" };
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const [current] = await tx.select().from(s.assignments).where(eq(s.assignments.id, id));
  if (!current) return { ok: false, error: "not_found" };
  if (current.status === "cancelled") return { ok: true, id };
  const paid = await paidDates(tx, id);
  if (paid) return { ok: false, error: "has_paid_hours", paid };
  await tx.update(s.assignments).set({ status: "cancelled" }).where(eq(s.assignments.id, id));
  await audit(tx, actor, [{ action: "update", entityType: "assignment", entityId: id, before: { status: current.status }, after: { status: "cancelled" }, reason: why }]);
  return { ok: true, id };
}
