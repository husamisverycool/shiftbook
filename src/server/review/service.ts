/**
 * Review actions on time entries (SPEC §7; docs/patterns/review.md): edit with a required reason
 * (Restaurant365 Punch Edits), approve (one, or high-confidence rows in bulk), reject and restore
 * (Rippling timesheets). Every change is audited with what it was before and after.
 */
import { and, eq, inArray } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { StaleRequestError } from "../errors";
import { openPeriod, PeriodLockedError } from "../run/period-lock";
import type { Actor } from "../session";

export const EDIT_REASONS = ["misread_corrected", "confirmed_client", "confirmed_worker", "matched_worker", "other"] as const;
export type EditReason = (typeof EDIT_REASONS)[number];

export type EditError =
  | "period_locked"
  | "reason_required"
  | "note_required"
  | "not_found"
  | "not_editable"
  | "date_outside_period"
  | "out_not_after_in"
  | "crosses_midnight"
  | "break_too_long"
  | "invalid_value"
  | "no_assignment"
  | "several_assignments"
  | "assignment_at_other_client";

/** A refused change; for an assignment at another client, that client's name. */
export type EditFailure = { ok: false; error: EditError; client?: string };

export interface EntryChange {
  workerId?: string | null;
  workDate?: string;
  inMinute?: number | null;
  outMinute?: number | null;
  breakMinutes?: number | null;
  /** Worked minutes, for entries read as daily totals (no clock times). */
  minutes?: number | null;
}

const EDITABLE: (typeof s.timeEntryStatus.enumValues)[number][] = ["extracted", "needs_review", "reviewed"];
const FIELD_OF: Record<keyof EntryChange, keyof s.EntryFields> = {
  workerId: "worker",
  workDate: "date",
  inMinute: "in",
  outMinute: "out",
  breakMinutes: "break",
  minutes: "total",
};
const isWhole = (n: unknown, max: number) => n === null || (Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= max);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const hhmm = (m: number | null) => (m === null ? null : `${Math.trunc(m / 60)}:${String(m % 60).padStart(2, "0")}`);
const snapshot = (e: typeof s.timeEntries.$inferSelect) => ({
  workerId: e.workerId,
  assignmentId: e.assignmentId,
  workDate: e.workDate,
  inMinute: e.inMinute,
  outMinute: e.outMinute,
  breakMinutes: e.breakMinutes,
  minutes: e.minutes,
  status: e.status,
});

/**
 * The worker's assignment (not cancelled) covering a date. A timesheet belongs to one client, so its
 * entries take that client's assignments; one at another client is named, and taken only when the
 * person chose "Confirmed with the client" (a timesheet that really covers two clients).
 */
async function assignmentFor(tx: Tx, workerId: string, date: string, clientId: string | null, clientConfirmed: boolean): Promise<string | Omit<EditFailure, "ok">> {
  const rows = await tx
    .select({ id: s.assignments.id, clientId: s.jobOrders.clientId, clientName: s.clients.name, start: s.assignments.startDate, end: s.assignments.endDate, status: s.assignments.status })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId))
    .where(eq(s.assignments.workerId, workerId));
  const active = rows.filter((a) => a.status !== "cancelled" && a.start <= date && (a.end === null || date <= a.end));
  const here = clientId ? active.filter((a) => a.clientId === clientId) : active;
  const pick = here.length === 0 && clientId && clientConfirmed ? active : here;
  if (pick.length === 0) {
    const elsewhere = [...new Set(active.map((a) => a.clientName))];
    return elsewhere.length === 1 ? { error: "assignment_at_other_client", client: elsewhere[0]! } : { error: "no_assignment" };
  }
  if (pick.length > 1) return { error: "several_assignments" };
  return pick[0]!.id;
}

type Values = ReturnType<typeof snapshot>;

/** Takes the period's lock; a period whose files exist reports "period_locked" instead of throwing. */
async function openOrLocked(tx: Tx, payPeriodId: string) {
  try {
    return await openPeriod(tx, payPeriodId);
  } catch (error) {
    if (error instanceof PeriodLockedError) return "period_locked" as const;
    throw error;
  }
}

/** Takes the lock of every period the entries belong to (throws once a period's files exist). */
async function openPeriodsOf(tx: Tx, ids: string[]) {
  const rows = ids.length > 0 ? await tx.select({ payPeriodId: s.timeEntries.payPeriodId }).from(s.timeEntries).where(inArray(s.timeEntries.id, ids)) : [];
  const periods = new Map<string, Awaited<ReturnType<typeof openPeriod>>>();
  for (const id of [...new Set(rows.map((r) => r.payPeriodId))].sort()) periods.set(id, await openPeriod(tx, id));
  return periods;
}

/** The reasons chosen, or the error when none (or "other" without a note) was given. */
function checkedReason(reasons: string[], note: string): { ok: true; text: string; chosen: EditReason[] } | { ok: false; error: EditError } {
  const chosen = [...new Set(reasons)].filter((r): r is EditReason => (EDIT_REASONS as readonly string[]).includes(r));
  if (chosen.length === 0) return { ok: false, error: "reason_required" };
  if (chosen.includes("other") && note.trim() === "") return { ok: false, error: "note_required" };
  const text = chosen.map((r) => (r === "other" ? `other: ${note.trim()}` : r)).join(", ") + (note.trim() && !chosen.includes("other") ? `: ${note.trim()}` : "");
  return { ok: true, text, chosen };
}

/** Applies a change to an entry's values and checks the result the same way for edits and additions. */
async function applyChange(
  tx: Tx,
  start: Values,
  change: EntryChange,
  period: { startsOn: string; endsOn: string },
  documentClientId: string | null,
  clientConfirmed: boolean,
): Promise<{ ok: true; next: Values } | EditFailure> {
  const next = { ...start };
  for (const key of Object.keys(change) as (keyof EntryChange)[]) {
    const value = change[key];
    if (value === undefined) continue;
    if (key === "workDate") {
      if (typeof value !== "string" || !ISO.test(value)) return { ok: false, error: "invalid_value" };
      next.workDate = value;
    } else if (key === "workerId") {
      if (value !== null && typeof value !== "string") return { ok: false, error: "invalid_value" };
      next.workerId = value;
    } else {
      if (!isWhole(value, 2880)) return { ok: false, error: "invalid_value" };
      next[key] = value as number | null;
    }
  }
  if (!next.workDate || next.workDate < period.startsOn || next.workDate > period.endsOn) return { ok: false, error: "date_outside_period" };

  // Minutes follow the clock times when there are times; otherwise the entry carries a daily total.
  if (next.inMinute !== null || next.outMinute !== null) {
    if (next.inMinute === null || next.outMinute === null) return { ok: false, error: "invalid_value" };
    if (next.outMinute <= next.inMinute) return { ok: false, error: "out_not_after_in" };
    if (next.outMinute > 1440) return { ok: false, error: "crosses_midnight" };
    const brk = next.breakMinutes ?? 0;
    if (brk >= next.outMinute - next.inMinute) return { ok: false, error: "break_too_long" };
    next.breakMinutes = brk;
    next.minutes = next.outMinute - next.inMinute - brk;
  } else if (next.minutes === null || next.minutes <= 0 || next.minutes > 1440) {
    return { ok: false, error: "invalid_value" };
  }

  if (next.workerId) {
    const found = await assignmentFor(tx, next.workerId, next.workDate, documentClientId, clientConfirmed);
    if (typeof found !== "string") return { ok: false, ...found };
    next.assignmentId = found;
  } else {
    next.assignmentId = null;
  }
  next.status = "reviewed";
  return { ok: true, next };
}

/** Field provenance after a person changed values: changed fields are marked edited. */
function editedFields(fields: s.EntryFields, before: Values, next: Values): s.EntryFields {
  const out: s.EntryFields = { ...fields };
  for (const key of Object.keys(FIELD_OF) as (keyof EntryChange)[]) {
    if (key === "minutes" ? next.minutes === before.minutes : next[key] === before[key]) continue;
    const name = FIELD_OF[key];
    const text = key === "workDate" || key === "workerId" ? String(next[key] ?? "") : key === "breakMinutes" ? String(next[key] ?? "") : hhmm(next[key] as number | null);
    const base: s.FieldProvenance = out[name] ?? { value: null, page: null, box: null, passA: null, passB: null, agree: null, handwritten: false, confidence: "high", checks: [] };
    out[name] = { ...base, value: text, edited: true, checks: [] };
  }
  return out;
}

export async function editEntry(tx: Tx, actor: Actor, entryId: string, change: EntryChange, reasons: string[], note: string): Promise<{ ok: true } | EditFailure> {
  const reason = checkedReason(reasons, note);
  if (!reason.ok) return reason;

  const [found] = await tx.select({ payPeriodId: s.timeEntries.payPeriodId }).from(s.timeEntries).where(eq(s.timeEntries.id, entryId));
  if (!found) return { ok: false, error: "not_found" };
  const period = await openOrLocked(tx, found.payPeriodId);
  if (period === "period_locked") return { ok: false, error: period };
  // Read again under the period's lock.
  const [entry] = await tx.select().from(s.timeEntries).where(eq(s.timeEntries.id, entryId));
  if (!entry) return { ok: false, error: "not_found" };
  if (!EDITABLE.includes(entry.status)) return { ok: false, error: "not_editable" };
  const [doc] = entry.sourceDocumentId ? await tx.select({ clientId: s.sourceDocuments.clientId }).from(s.sourceDocuments).where(eq(s.sourceDocuments.id, entry.sourceDocumentId)) : [];

  const before = snapshot(entry);
  const result = await applyChange(tx, before, change, period, doc?.clientId ?? null, reason.chosen.includes("confirmed_client"));
  if (!result.ok) return result;
  const next = result.next;
  await tx
    .update(s.timeEntries)
    .set({ ...next, fields: editedFields(entry.fields, before, next), reviewReasons: [], distinctConfirmed: false, updatedAt: new Date() })
    .where(eq(s.timeEntries.id, entryId));
  await audit(tx, actor, [{ action: "update", entityType: "time_entry", entityId: entryId, before, after: next, reason: reason.text }]);
  return { ok: true };
}

/** Adds an entry by hand (Airtable "+"; Restaurant365 "Add Shift" uses the same form and reason). */
export async function addEntry(
  tx: Tx,
  actor: Actor,
  payPeriodId: string,
  input: EntryChange & { workerId: string; workDate: string },
  reasons: string[],
  note: string,
): Promise<{ ok: true; entryId: string } | EditFailure> {
  const reason = checkedReason(reasons, note);
  if (!reason.ok) return reason;
  const period = await openOrLocked(tx, payPeriodId);
  if (period === "period_locked") return { ok: false, error: period };
  const empty: Values = { workerId: null, assignmentId: null, workDate: null, inMinute: null, outMinute: null, breakMinutes: null, minutes: null, status: "needs_review" };
  const result = await applyChange(tx, empty, input, period, null, false);
  if (!result.ok) return result;
  const next = result.next;
  const [worker] = await tx.select().from(s.workers).where(eq(s.workers.id, next.workerId!));
  const [row] = await tx
    .insert(s.timeEntries)
    .values({
      agencyId: actor.agencyId,
      payPeriodId,
      sourceDocumentId: null,
      rowIndex: 0,
      workerNameRaw: worker ? `${worker.firstName} ${worker.lastName}` : "",
      ...next,
      fields: editedFields({}, empty, next),
      confidence: "high",
      reviewReasons: [],
    })
    .returning({ id: s.timeEntries.id });
  await audit(tx, actor, [{ action: "create", entityType: "time_entry", entityId: row!.id, after: next, reason: reason.text }]);
  return { ok: true, entryId: row!.id };
}

/** Approves entries a person checked. In bulk, only high-confidence rows change (SPEC §7). */
export async function approveEntries(tx: Tx, actor: Actor, ids: string[], opts: { bulk: boolean }): Promise<{ approved: string[]; skipped: string[] }> {
  if (ids.length === 0) return { approved: [], skipped: [] };
  const periods = await openPeriodsOf(tx, ids);
  const rows = await tx.select().from(s.timeEntries).where(inArray(s.timeEntries.id, ids));
  const approved: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    const e = rows.find((r) => r.id === id);
    const period = e ? periods.get(e.payPeriodId) : undefined;
    const ready =
      e &&
      (e.status === "extracted" || e.status === "needs_review") &&
      e.workerId !== null &&
      e.assignmentId !== null &&
      e.minutes !== null &&
      e.workDate !== null &&
      period !== undefined &&
      e.workDate >= period.startsOn &&
      e.workDate <= period.endsOn &&
      (!opts.bulk || e.confidence === "high");
    if (!ready) {
      skipped.push(id);
      continue;
    }
    approved.push(id);
  }
  if (approved.length > 0) {
    await tx.update(s.timeEntries).set({ status: "reviewed", reviewReasons: [], updatedAt: new Date() }).where(inArray(s.timeEntries.id, approved));
    await audit(
      tx,
      actor,
      approved.map((id) => {
        const e = rows.find((r) => r.id === id)!;
        return {
          action: "approve" as const,
          entityType: "time_entry",
          entityId: id,
          before: { status: e.status, reviewReasons: e.reviewReasons },
          after: { status: "reviewed", reviewReasons: [] },
          reason: opts.bulk ? "bulk approval (high confidence)" : null,
        };
      }),
    );
  }
  return { approved, skipped };
}

export async function rejectEntry(tx: Tx, actor: Actor, id: string): Promise<boolean> {
  await openPeriodsOf(tx, [id]);
  const [before] = await tx.select({ status: s.timeEntries.status }).from(s.timeEntries).where(eq(s.timeEntries.id, id));
  const done = await tx
    .update(s.timeEntries)
    .set({ status: "rejected", distinctConfirmed: false, updatedAt: new Date() })
    .where(and(eq(s.timeEntries.id, id), inArray(s.timeEntries.status, EDITABLE)))
    .returning({ id: s.timeEntries.id });
  if (done.length > 0) await audit(tx, actor, [{ action: "update", entityType: "time_entry", entityId: id, before: { status: before?.status }, after: { status: "rejected" }, reason: "rejected in review" }]);
  return done.length > 0;
}

/**
 * A restored entry goes back to review: a person must look at it again, and confirm again that its
 * day is real if needed. Entries of an archived timesheet stay set aside with it.
 */
export async function restoreEntry(tx: Tx, actor: Actor, id: string): Promise<boolean> {
  await openPeriodsOf(tx, [id]);
  const [entry] = await tx.select({ documentId: s.timeEntries.sourceDocumentId }).from(s.timeEntries).where(eq(s.timeEntries.id, id));
  const [doc] = entry?.documentId ? await tx.select({ status: s.sourceDocuments.status }).from(s.sourceDocuments).where(eq(s.sourceDocuments.id, entry.documentId)) : [];
  if (doc?.status === "archived") return false;
  const done = await tx
    .update(s.timeEntries)
    .set({ status: "needs_review", distinctConfirmed: false, updatedAt: new Date() })
    .where(and(eq(s.timeEntries.id, id), eq(s.timeEntries.status, "rejected")))
    .returning({ id: s.timeEntries.id });
  if (done.length > 0) await audit(tx, actor, [{ action: "update", entityType: "time_entry", entityId: id, before: { status: "rejected" }, after: { status: "needs_review" }, reason: "restored" }]);
  return done.length > 0;
}

/**
 * A person confirms that entries for one worker on one day are different work, not the same work
 * read twice (the run holds such days otherwise). Cleared whenever one of the entries is edited,
 * rejected or restored, so a confirmation never covers entries that were not confirmed together.
 */
export async function confirmDistinctDay(tx: Tx, actor: Actor, entryIds: string[], reason: string): Promise<void> {
  const why = reason.trim();
  if (why === "") throw new Error("A reason is required to confirm both entries are real.");
  const ids = [...new Set(entryIds)];
  await openPeriodsOf(tx, ids);
  const rows = ids.length > 0 ? await tx.select().from(s.timeEntries).where(inArray(s.timeEntries.id, ids)) : [];
  // What the page showed no longer holds (another tab changed it): at least two live entries of one worker-day.
  if (ids.length < 2 || rows.length !== ids.length || rows.some((r) => r.status === "rejected") || new Set(rows.map((r) => `${r.workerId}|${r.workDate}`)).size !== 1) {
    throw new StaleRequestError();
  }
  await tx.update(s.timeEntries).set({ distinctConfirmed: true, updatedAt: new Date() }).where(inArray(s.timeEntries.id, ids));
  await audit(tx, actor, rows.map((r) => ({ action: "update" as const, entityType: "time_entry", entityId: r.id, before: { distinctConfirmed: r.distinctConfirmed }, after: { distinctConfirmed: true }, reason: why })));
}
