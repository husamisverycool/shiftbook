/**
 * Which shifts a client's approver is asked about, and in what state (plan "Who may be asked"; data
 * shape per research part 2 §4: hours only — no rates, amounts, Social Security numbers or contact
 * details ever reach the client's page).
 */
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";

export type ShiftState = "waiting" | "approved" | "disputed" | "needs_review" | "locked";

export interface ClientShift extends s.ApprovedShift {
  state: ShiftState;
}

const STATE: Record<(typeof s.timeEntryStatus.enumValues)[number], ShiftState | null> = {
  extracted: "waiting",
  reviewed: "waiting",
  client_approved: "approved",
  disputed: "disputed",
  needs_review: "needs_review",
  locked: "locked",
  rejected: null,
};

/**
 * The client's shifts in the period: entries matched to an assignment on one of the client's job
 * orders (never set aside), in worker, day and start order. Entries not matched to any assignment
 * yet but on the client's own timesheet count as needing review.
 */
export async function clientShifts(tx: Tx, clientId: string, payPeriodId: string): Promise<ClientShift[]> {
  const rows = await tx
    .select({
      entryId: s.timeEntries.id,
      workerId: s.workers.id,
      firstName: s.workers.firstName,
      lastName: s.workers.lastName,
      workDate: s.timeEntries.workDate,
      inMinute: s.timeEntries.inMinute,
      outMinute: s.timeEntries.outMinute,
      breakMinutes: s.timeEntries.breakMinutes,
      minutes: s.timeEntries.minutes,
      status: s.timeEntries.status,
    })
    .from(s.timeEntries)
    .innerJoin(s.assignments, eq(s.assignments.id, s.timeEntries.assignmentId))
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.workers, eq(s.workers.id, s.timeEntries.workerId))
    .where(and(eq(s.timeEntries.payPeriodId, payPeriodId), eq(s.jobOrders.clientId, clientId), ne(s.timeEntries.status, "rejected")))
    .orderBy(asc(s.workers.lastName), asc(s.workers.firstName), asc(s.timeEntries.workDate), asc(s.timeEntries.inMinute), asc(s.timeEntries.id));
  const shifts: ClientShift[] = [];
  for (const r of rows) {
    const state = STATE[r.status];
    if (!state) continue;
    // An entry without a day or minutes cannot be shown or approved: it still needs review.
    const complete = r.workDate !== null && r.minutes !== null;
    shifts.push({
      entryId: r.entryId,
      workerId: r.workerId,
      workerName: `${r.firstName} ${r.lastName}`,
      workDate: r.workDate ?? "",
      inMinute: r.inMinute,
      outMinute: r.outMinute,
      breakMinutes: r.breakMinutes,
      minutes: r.minutes ?? 0,
      state: complete ? state : "needs_review",
    });
  }
  return shifts;
}

/** Entries on the client's own timesheets not matched to anyone yet (they may turn out to be the client's). */
export async function unmatchedOnClientTimesheets(tx: Tx, clientId: string, payPeriodId: string): Promise<number> {
  const rows = await tx
    .select({ id: s.timeEntries.id })
    .from(s.timeEntries)
    .innerJoin(s.sourceDocuments, eq(s.sourceDocuments.id, s.timeEntries.sourceDocumentId))
    .where(
      and(
        eq(s.timeEntries.payPeriodId, payPeriodId),
        eq(s.sourceDocuments.clientId, clientId),
        isNull(s.timeEntries.assignmentId),
        inArray(s.timeEntries.status, ["extracted", "needs_review", "reviewed"]),
      ),
    );
  return rows.length;
}

/** The values the approver approves for a shift (kept in the decision as evidence). */
export const approvedShift = (x: ClientShift): s.ApprovedShift => ({
  entryId: x.entryId,
  workerId: x.workerId,
  workerName: x.workerName,
  workDate: x.workDate,
  inMinute: x.inMinute,
  outMinute: x.outMinute,
  breakMinutes: x.breakMinutes,
  minutes: x.minutes,
});

/**
 * SHA-256 of exactly what an approval would cover: the shifts waiting (values and order) and which
 * of them carry a dispute. A change anywhere in between refuses the approval.
 */
export function snapshotSha256(waiting: ClientShift[], disputedEntryIds: string[]): string {
  const shifts = [...waiting].sort((a, b) => (a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0)).map(approvedShift);
  const disputes = [...new Set(disputedEntryIds)].sort();
  return createHash("sha256").update(JSON.stringify({ shifts, disputes })).digest("hex");
}

export interface ShiftSummary {
  workers: number;
  shifts: number;
  minutes: number;
}

export function summarize(shifts: ClientShift[]): ShiftSummary {
  return { workers: new Set(shifts.map((x) => x.workerId)).size, shifts: shifts.length, minutes: shifts.reduce((sum, x) => sum + x.minutes, 0) };
}
