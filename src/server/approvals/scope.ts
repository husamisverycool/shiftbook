/**
 * Which shifts a client's approver is asked about, and in what state (plan "Who may be asked"; data
 * shape per research part 2 §4: hours only — no rates, amounts, Social Security numbers or contact
 * details ever reach the client's page).
 */
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
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
  const approvedAs = await approvedBeforeLock(tx, clientId, payPeriodId, rows.filter((r) => r.status === "locked").map((r) => r.entryId));
  const shifts: ClientShift[] = [];
  for (const r of rows) {
    let state = STATE[r.status];
    if (!state) continue;
    // A locked shift (its files are made) paid exactly as the client approved it is still approved.
    const was = approvedAs.get(r.entryId);
    if (state === "locked" && was && was.workDate === r.workDate && was.inMinute === r.inMinute && was.outMinute === r.outMinute && was.breakMinutes === r.breakMinutes && was.minutes === r.minutes) state = "approved";
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

/**
 * What the client approved of the given (locked) entries, as it approved them: the shifts in its
 * decisions and the disputes the agency accepted (the client's own times), each counted only when
 * made after the last withdrawal of the client's approval for the period.
 */
async function approvedBeforeLock(tx: Tx, clientId: string, payPeriodId: string, entryIds: string[]): Promise<Map<string, Pick<s.ApprovedShift, "workDate" | "inMinute" | "outMinute" | "breakMinutes" | "minutes">>> {
  const out = new Map<string, Pick<s.ApprovedShift, "workDate" | "inMinute" | "outMinute" | "breakMinutes" | "minutes">>();
  if (entryIds.length === 0) return out;
  const requests = (await tx.select({ id: s.approvalRequests.id }).from(s.approvalRequests).where(and(eq(s.approvalRequests.clientId, clientId), eq(s.approvalRequests.payPeriodId, payPeriodId)))).map((r) => r.id);
  if (requests.length === 0) return out;
  const [withdrawn] = await tx
    .select({ at: sql<Date | null>`max(${s.auditEvents.occurredAt})` })
    .from(s.auditEvents)
    .where(and(eq(s.auditEvents.entityType, "approval_request"), inArray(s.auditEvents.entityId, requests), sql`${s.auditEvents.after}->>'event' = 'approval_withdrawn'`));
  const since = withdrawn?.at ? new Date(withdrawn.at) : null;
  const wanted = new Set(entryIds);
  const decisions = await tx.select({ approved: s.approvalDecisions.approved, at: s.approvalDecisions.decidedAt }).from(s.approvalDecisions).where(inArray(s.approvalDecisions.requestId, requests)).orderBy(asc(s.approvalDecisions.decidedAt));
  for (const d of decisions) {
    if (since && d.at <= since) continue;
    for (const a of d.approved) if (wanted.has(a.entryId)) out.set(a.entryId, a);
  }
  const accepted = await tx.select().from(s.clientDisputes).where(and(inArray(s.clientDisputes.timeEntryId, entryIds), eq(s.clientDisputes.status, "accepted")));
  for (const d of accepted) {
    if (d.proposedInMinute === null || d.proposedOutMinute === null || d.proposedBreakMinutes === null || d.resolvedAt === null || (since && d.resolvedAt <= since)) continue;
    out.set(d.timeEntryId, { workDate: d.shift.workDate, inMinute: d.proposedInMinute, outMinute: d.proposedOutMinute, breakMinutes: d.proposedBreakMinutes, minutes: d.proposedOutMinute - d.proposedInMinute - d.proposedBreakMinutes });
  }
  return out;
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
 * SHA-256 of exactly what an approval would cover: the shifts waiting (their values) and the disputes
 * drafted on them (what each says). A change anywhere in between refuses the approval.
 */
export function snapshotSha256(waiting: ClientShift[], drafts: { entryId: string; reason: string; proposed: { inMinute: number; outMinute: number; breakMinutes: number } | null }[]): string {
  const byId = <T extends { entryId: string }>(a: T, b: T) => (a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0);
  const shifts = [...waiting].sort(byId).map(approvedShift);
  // What each dispute says is part of what is sent, so a change to it refuses the decision too.
  const disputes = [...drafts].sort(byId).map((d) => [d.entryId, d.reason, d.proposed?.inMinute ?? null, d.proposed?.outMinute ?? null, d.proposed?.breakMinutes ?? null]);
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
