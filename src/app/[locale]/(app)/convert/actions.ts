"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { withAgency } from "@/server/db";
import { auditEvents } from "@/server/db/schema";
import { StaleRequestError } from "@/server/errors";
import { createRunFiles, RunNotApprovedError, RunNotReadyError, TotalsChangedError } from "@/server/files/service";
import { PeriodBusyError, PeriodLockedError, PeriodNotFoundError } from "@/server/run/period-lock";
import { archiveDocument, NotArchivableError, retryDocument } from "@/server/intake/service";
import { receiveUploads, type UploadResult } from "@/server/intake/upload";
import { addEntry, approveEntries, confirmDistinctDay, editEntry, rejectEntry, restoreEntry, type EditError, type EntryChange } from "@/server/review/service";
import { approveRun, unapproveRun } from "@/server/run/approval";
import { computeRun, setSkipped } from "@/server/run/service";
import { processQueuedDocuments } from "@/server/services";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";
import { documentStore } from "@/server/storage";

const refresh = () => revalidatePath("/[locale]/(app)/convert", "page");

export type { UploadResult } from "@/server/intake/upload";
export type ActionError = "period_locked" | "busy" | "stale" | "generic";

// Every input is checked against its shape: a hand-made request gets a plain refusal, never a crash.
const id = z.uuid();
const ids = z.array(id).max(5000);
const text = z.string().max(2000);
const reasonsSchema = z.array(z.string().max(100)).max(20);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minute = z.number().int().nullable();
const ChangeSchema = z
  .object({ workerId: id.nullable().optional(), workDate: isoDate.optional(), inMinute: minute.optional(), outMinute: minute.optional(), breakMinutes: minute.optional(), minutes: minute.optional() })
  .strict();
const AddSchema = ChangeSchema.extend({ workerId: id, workDate: isoDate }).strict();
const ok = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

/** The plain refusal for an expected error, or null for a real error. */
function refusal(error: unknown): ActionError | null {
  if (error instanceof PeriodLockedError) return "period_locked";
  if (error instanceof PeriodBusyError) return "busy";
  if (error instanceof StaleRequestError || error instanceof NotArchivableError) return "stale";
  if (error instanceof PeriodNotFoundError) return "generic";
  return null;
}

/** Turns the expected refusals into a plain result; anything else is a real error. */
async function guarded<T>(fn: () => Promise<T>): Promise<T | { error: ActionError }> {
  try {
    return await fn();
  } catch (error) {
    refresh();
    const r = refusal(error);
    if (r) return { error: r };
    throw error;
  }
}

export async function uploadTimesheets(payPeriodId: string, form: FormData): Promise<UploadResult> {
  const actor = currentActor();
  if (!ok(id, payPeriodId) || !(form instanceof FormData)) return { accepted: [], refused: [] };
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const result = await receiveUploads(
    withAgency,
    actor,
    documentStore,
    payPeriodId,
    files.map((f) => ({ name: f.name, size: f.size, bytes: async () => new Uint8Array(await f.arrayBuffer()) })),
  );
  if (result.accepted.length > 0) after(() => processQueuedDocuments(actor).catch(() => undefined));
  refresh();
  return result;
}

/** Reads any queued uploads (for example after a restart). */
export async function readQueued(): Promise<void> {
  const actor = currentActor();
  after(() => processQueuedDocuments(actor).catch(() => undefined));
}

export async function retryAction(documentId: string): Promise<{ ok: true } | { error: ActionError }> {
  const actor = currentActor();
  if (!ok(id, documentId)) return { error: "stale" };
  return guarded(async () => {
    await withAgency(actor.agencyId, (tx) => retryDocument(tx, actor, documentId));
    after(() => processQueuedDocuments(actor).catch(() => undefined));
    refresh();
    return { ok: true as const };
  });
}

export async function archiveAction(documentId: string, reason: string): Promise<{ ok: true } | { error: ActionError }> {
  const actor = currentActor();
  if (!ok(id, documentId) || !ok(text, reason)) return { error: "stale" };
  if (reason.trim() === "") return { error: "generic" };
  return guarded(async () => {
    await withAgency(actor.agencyId, (tx) => archiveDocument(tx, actor, documentId, reason));
    refresh();
    return { ok: true as const };
  });
}

export async function confirmDistinctAction(entryIds: string[], reason: string): Promise<{ ok: true } | { error: ActionError }> {
  const actor = currentActor();
  if (!ok(ids, entryIds) || !ok(text, reason)) return { error: "stale" };
  if (reason.trim() === "") return { error: "generic" };
  return guarded(async () => {
    await withAgency(actor.agencyId, (tx) => confirmDistinctDay(tx, actor, entryIds, reason));
    refresh();
    return { ok: true as const };
  });
}

export async function approveAction(entryIds: string[], bulk: boolean): Promise<{ approved: number; skipped: number } | { error: ActionError }> {
  const actor = currentActor();
  if (!ok(ids, entryIds) || typeof bulk !== "boolean") return { error: "stale" };
  return guarded(async () => {
    const r = await withAgency(actor.agencyId, (tx) => approveEntries(tx, actor, entryIds, { bulk }));
    refresh();
    return { approved: r.approved.length, skipped: r.skipped.length };
  });
}

export async function rejectAction(entryId: string): Promise<{ ok: true } | { error: ActionError }> {
  const actor = currentActor();
  if (!ok(id, entryId)) return { error: "stale" };
  return guarded(async () => {
    await withAgency(actor.agencyId, (tx) => rejectEntry(tx, actor, entryId));
    refresh();
    return { ok: true as const };
  });
}

export async function restoreAction(entryId: string): Promise<{ ok: true } | { error: ActionError }> {
  const actor = currentActor();
  if (!ok(id, entryId)) return { error: "stale" };
  return guarded(async () => {
    await withAgency(actor.agencyId, (tx) => restoreEntry(tx, actor, entryId));
    refresh();
    return { ok: true as const };
  });
}

/** Edits report their own refusals; a busy period is one more. */
async function edited<T>(fn: () => Promise<T>): Promise<T | { ok: false; error: "period_busy" }> {
  try {
    return await fn();
  } catch (error) {
    if (!(error instanceof PeriodBusyError)) throw error;
    return { ok: false, error: "period_busy" };
  } finally {
    refresh();
  }
}

/** Edits an entry; `attachToClientId` is the person's explicit choice to put its hours on that other client's assignment. */
export async function editAction(
  entryId: string,
  change: EntryChange,
  reasons: string[],
  note: string,
  attachToClientId: string | null = null,
): Promise<{ ok: true } | { ok: false; error: EditError | "period_busy"; clients?: { id: string; name: string }[] }> {
  const actor = currentActor();
  if (!ok(id, entryId) || !ok(ChangeSchema, change) || !ok(reasonsSchema, reasons) || !ok(text, note) || !ok(id.nullable(), attachToClientId)) return { ok: false, error: "invalid_value" };
  return edited(() => withAgency(actor.agencyId, (tx) => editEntry(tx, actor, entryId, change, reasons, note, { attachToClientId })));
}

export async function addAction(
  payPeriodId: string,
  input: EntryChange & { workerId: string; workDate: string },
  reasons: string[],
  note: string,
): Promise<{ ok: true } | { ok: false; error: EditError | "period_busy" }> {
  const actor = currentActor();
  if (!ok(id, payPeriodId) || !ok(AddSchema, input) || !ok(reasonsSchema, reasons) || !ok(text, note)) return { ok: false, error: "invalid_value" };
  const r = await edited(() => withAgency(actor.agencyId, (tx) => addEntry(tx, actor, payPeriodId, input, reasons, note)));
  return r.ok ? { ok: true } : r;
}

export async function computeTotalsAction(payPeriodId: string): Promise<{ ok: true } | { error: ActionError }> {
  const actor = currentActor();
  if (!ok(id, payPeriodId)) return { error: "stale" };
  return guarded(async () => {
    await withAgency(actor.agencyId, (tx) => computeRun(tx, actor, payPeriodId));
    refresh();
    return { ok: true as const };
  });
}

export async function skipAction(payPeriodId: string, workerIds: string[], skipped: boolean, reason: string): Promise<{ ok: boolean } | { error: ActionError }> {
  const actor = currentActor();
  if (!ok(id, payPeriodId) || !ok(z.array(id).max(500), workerIds) || typeof skipped !== "boolean" || !ok(text, reason)) return { error: "stale" };
  if (reason.trim() === "") return { ok: false };
  return guarded(async () => {
    await withAgency(actor.agencyId, async (tx) => {
      for (const workerId of workerIds) await setSkipped(tx, actor, payPeriodId, workerId, { skipped, reason });
      await computeRun(tx, actor, payPeriodId);
    });
    refresh();
    return { ok: true };
  });
}

/** The Owner approves the run as shown (slice e): the files will be made from exactly this. */
export async function approveRunAction(payPeriodId: string, expectedFingerprint: string): Promise<{ ok: true } | { ok: false; error: "not_allowed" | "changed" | "blocked" | "period_locked" | "busy" | "generic" }> {
  const actor = currentActor();
  if (!ok(id, payPeriodId) || !ok(z.string().max(128), expectedFingerprint)) return { ok: false, error: "generic" };
  try {
    const r = await withAgency(actor.agencyId, (tx) => approveRun(tx, actor, payPeriodId, expectedFingerprint));
    refresh();
    if (r.ok) return { ok: true };
    return { ok: false, error: r.error === "not_allowed" || r.error === "changed" || r.error === "blocked" ? r.error : "generic" };
  } catch (error) {
    if (error instanceof PeriodLockedError) return { ok: false, error: "period_locked" };
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    return { ok: false, error: "generic" };
  }
}

/** Takes the approval back, with a reason, before the files exist. */
export async function unapproveRunAction(payPeriodId: string, reason: string): Promise<{ ok: true } | { ok: false; error: "not_allowed" | "reason_required" | "period_locked" | "busy" | "generic" }> {
  const actor = currentActor();
  if (!ok(id, payPeriodId) || !ok(text, reason)) return { ok: false, error: "generic" };
  try {
    const r = await withAgency(actor.agencyId, (tx) => unapproveRun(tx, actor, payPeriodId, reason));
    refresh();
    if (r.ok) return { ok: true };
    return { ok: false, error: r.error === "not_allowed" || r.error === "reason_required" ? r.error : "generic" };
  } catch (error) {
    if (error instanceof PeriodLockedError) return { ok: false, error: "period_locked" };
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    return { ok: false, error: "generic" };
  }
}

export async function createFilesAction(
  payPeriodId: string,
  expectedFingerprint: string,
): Promise<{ ok: true } | { ok: false; error: "not_ready" | "not_approved" | "totals_changed" | "period_locked" | "busy" | "generic" }> {
  const actor = currentActor();
  if (!ok(id, payPeriodId) || !ok(z.string().max(128), expectedFingerprint)) return { ok: false, error: "generic" };
  try {
    await withAgency(actor.agencyId, async (tx) => createRunFiles(tx, actor, documentStore, payPeriodId, { today: await agencyToday(tx), expectedFingerprint }));
    refresh();
    return { ok: true };
  } catch (error) {
    refresh();
    if (error instanceof RunNotReadyError) return { ok: false, error: "not_ready" };
    if (error instanceof RunNotApprovedError) return { ok: false, error: "not_approved" };
    if (error instanceof TotalsChangedError) return { ok: false, error: "totals_changed" };
    if (error instanceof PeriodLockedError) return { ok: false, error: "period_locked" };
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    return { ok: false, error: "generic" };
  }
}

export interface HistoryEvent {
  at: string;
  actor: string;
  action: string;
  before: unknown;
  after: unknown;
  reason: string | null;
}

/** The entry's audit log in time order (docs/patterns/review.md: Restaurant365 Punch Edit Audit Log). */
export async function entryHistory(entryId: string): Promise<HistoryEvent[]> {
  const actor = currentActor();
  if (!ok(id, entryId)) return [];
  const rows = await withAgency(actor.agencyId, (tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityType, "time_entry"), eq(auditEvents.entityId, entryId))));
  return rows
    .sort((a, b) => a.id - b.id)
    .map((r) => ({ at: r.occurredAt.toISOString(), actor: r.actorLabel, action: r.action, before: r.before, after: r.after, reason: r.reason }));
}
