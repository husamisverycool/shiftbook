/**
 * Review actions on time entries (SPEC §7; docs/patterns/review.md): edit with a required reason
 * (Restaurant365 Punch Edits), approve (one, or high-confidence rows in bulk), reject and restore
 * (Rippling timesheets). Every change is audited with what it was before and after.
 */
import { and, eq, inArray } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import type { Actor } from "../session";

export const EDIT_REASONS = ["misread_corrected", "confirmed_client", "confirmed_worker", "matched_worker", "other"] as const;
export type EditReason = (typeof EDIT_REASONS)[number];

export type EditError =
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
  | "several_assignments";

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

/** Active assignments of a worker on a date, at the document's client first. */
async function assignmentFor(tx: Tx, workerId: string, date: string, clientId: string | null): Promise<string | EditError> {
  const rows = await tx
    .select({ id: s.assignments.id, clientId: s.jobOrders.clientId, start: s.assignments.startDate, end: s.assignments.endDate, status: s.assignments.status })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .where(eq(s.assignments.workerId, workerId));
  const active = rows.filter((a) => a.status === "active" && a.start <= date && (a.end === null || date <= a.end));
  const atClient = clientId ? active.filter((a) => a.clientId === clientId) : active;
  const pick = atClient.length > 0 ? atClient : active;
  if (pick.length === 0) return "no_assignment";
  if (pick.length > 1) return "several_assignments";
  return pick[0]!.id;
}

export async function editEntry(tx: Tx, actor: Actor, entryId: string, change: EntryChange, reasons: string[], note: string): Promise<{ ok: true } | { ok: false; error: EditError }> {
  const chosen = [...new Set(reasons)].filter((r): r is EditReason => (EDIT_REASONS as readonly string[]).includes(r));
  if (chosen.length === 0) return { ok: false, error: "reason_required" };
  if (chosen.includes("other") && note.trim() === "") return { ok: false, error: "note_required" };

  const [entry] = await tx.select().from(s.timeEntries).where(eq(s.timeEntries.id, entryId));
  if (!entry) return { ok: false, error: "not_found" };
  if (!EDITABLE.includes(entry.status)) return { ok: false, error: "not_editable" };
  const [period] = await tx.select().from(s.payPeriods).where(eq(s.payPeriods.id, entry.payPeriodId));

  const next = { ...snapshot(entry) };
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
  if (!next.workDate || next.workDate < period!.startsOn || next.workDate > period!.endsOn) return { ok: false, error: "date_outside_period" };

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
    const [doc] = entry.sourceDocumentId ? await tx.select({ clientId: s.sourceDocuments.clientId }).from(s.sourceDocuments).where(eq(s.sourceDocuments.id, entry.sourceDocumentId)) : [];
    const found = await assignmentFor(tx, next.workerId, next.workDate, doc?.clientId ?? null);
    if (found === "no_assignment" || found === "several_assignments") return { ok: false, error: found };
    next.assignmentId = found;
  } else {
    next.assignmentId = null;
  }

  const fields: s.EntryFields = { ...entry.fields };
  const before = snapshot(entry);
  for (const key of Object.keys(FIELD_OF) as (keyof EntryChange)[]) {
    if (key === "minutes" ? next.minutes === before.minutes : next[key] === before[key]) continue;
    const name = FIELD_OF[key];
    const text = key === "workDate" || key === "workerId" ? String(next[key] ?? "") : key === "breakMinutes" ? String(next[key] ?? "") : hhmm(next[key] as number | null);
    const base: s.FieldProvenance = fields[name] ?? { value: null, page: null, box: null, passA: null, passB: null, agree: null, handwritten: false, confidence: "high", checks: [] };
    fields[name] = { ...base, value: text, edited: true, checks: [] };
  }
  next.status = "reviewed";
  await tx
    .update(s.timeEntries)
    .set({ ...next, fields, reviewReasons: [], updatedAt: new Date() })
    .where(eq(s.timeEntries.id, entryId));
  const reason = chosen.map((r) => (r === "other" ? `other: ${note.trim()}` : r)).join(", ") + (note.trim() && !chosen.includes("other") ? `: ${note.trim()}` : "");
  await audit(tx, actor, [{ action: "update", entityType: "time_entry", entityId: entryId, before, after: next, reason }]);
  return { ok: true };
}

/** Approves entries a person checked. In bulk, only high-confidence rows change (SPEC §7). */
export async function approveEntries(tx: Tx, actor: Actor, ids: string[], opts: { bulk: boolean }): Promise<{ approved: string[]; skipped: string[] }> {
  if (ids.length === 0) return { approved: [], skipped: [] };
  const rows = await tx.select().from(s.timeEntries).where(inArray(s.timeEntries.id, ids));
  const [period] = rows[0] ? await tx.select().from(s.payPeriods).where(eq(s.payPeriods.id, rows[0].payPeriodId)) : [];
  const approved: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    const e = rows.find((r) => r.id === id);
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
    await audit(tx, actor, approved.map((id) => ({ action: "approve" as const, entityType: "time_entry", entityId: id, after: { status: "reviewed" }, reason: opts.bulk ? "bulk approval (high confidence)" : null })));
  }
  return { approved, skipped };
}

export async function rejectEntry(tx: Tx, actor: Actor, id: string): Promise<boolean> {
  const done = await tx
    .update(s.timeEntries)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(and(eq(s.timeEntries.id, id), inArray(s.timeEntries.status, EDITABLE)))
    .returning({ id: s.timeEntries.id });
  if (done.length > 0) await audit(tx, actor, [{ action: "update", entityType: "time_entry", entityId: id, after: { status: "rejected" }, reason: "rejected in review" }]);
  return done.length > 0;
}

/** A restored entry goes back to review: a person must look at it again. */
export async function restoreEntry(tx: Tx, actor: Actor, id: string): Promise<boolean> {
  const done = await tx
    .update(s.timeEntries)
    .set({ status: "needs_review", updatedAt: new Date() })
    .where(and(eq(s.timeEntries.id, id), eq(s.timeEntries.status, "rejected")))
    .returning({ id: s.timeEntries.id });
  if (done.length > 0) await audit(tx, actor, [{ action: "update", entityType: "time_entry", entityId: id, before: { status: "rejected" }, after: { status: "needs_review" }, reason: "restored" }]);
  return done.length > 0;
}
