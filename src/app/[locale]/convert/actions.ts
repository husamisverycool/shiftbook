"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { withAgency } from "@/server/db";
import { auditEvents } from "@/server/db/schema";
import { StaleRequestError } from "@/server/errors";
import { createRunFiles, RunNotReadyError, TotalsChangedError } from "@/server/files/service";
import { PeriodBusyError, PeriodLockedError, PeriodNotFoundError } from "@/server/run/period-lock";
import { archiveDocument, NotArchivableError, retryDocument } from "@/server/intake/service";
import { receiveUploads, type UploadResult } from "@/server/intake/upload";
import { addEntry, approveEntries, confirmDistinctDay, editEntry, rejectEntry, restoreEntry, type EditError, type EntryChange } from "@/server/review/service";
import { computeRun, setSkipped } from "@/server/run/service";
import { processQueuedDocuments } from "@/server/services";
import { currentActor } from "@/server/session";
import { documentStore } from "@/server/storage";

const refresh = () => revalidatePath("/[locale]/convert", "page");
const today = () => new Date().toISOString().slice(0, 10);

export type { UploadResult } from "@/server/intake/upload";
export type ActionError = "period_locked" | "busy" | "stale" | "generic";

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
  return guarded(async () => {
    await withAgency(actor.agencyId, (tx) => retryDocument(tx, actor, documentId));
    after(() => processQueuedDocuments(actor).catch(() => undefined));
    refresh();
    return { ok: true as const };
  });
}

export async function archiveAction(documentId: string, reason: string): Promise<{ ok: true } | { error: ActionError }> {
  const actor = currentActor();
  if (reason.trim() === "") return { error: "generic" };
  return guarded(async () => {
    await withAgency(actor.agencyId, (tx) => archiveDocument(tx, actor, documentId, reason));
    refresh();
    return { ok: true as const };
  });
}

export async function confirmDistinctAction(entryIds: string[], reason: string): Promise<{ ok: true } | { error: ActionError }> {
  const actor = currentActor();
  if (reason.trim() === "") return { error: "generic" };
  return guarded(async () => {
    await withAgency(actor.agencyId, (tx) => confirmDistinctDay(tx, actor, entryIds, reason));
    refresh();
    return { ok: true as const };
  });
}

export async function approveAction(ids: string[], bulk: boolean): Promise<{ approved: number; skipped: number } | { error: ActionError }> {
  const actor = currentActor();
  return guarded(async () => {
    const r = await withAgency(actor.agencyId, (tx) => approveEntries(tx, actor, ids, { bulk }));
    refresh();
    return { approved: r.approved.length, skipped: r.skipped.length };
  });
}

export async function rejectAction(id: string): Promise<{ ok: true } | { error: ActionError }> {
  const actor = currentActor();
  return guarded(async () => {
    await withAgency(actor.agencyId, (tx) => rejectEntry(tx, actor, id));
    refresh();
    return { ok: true as const };
  });
}

export async function restoreAction(id: string): Promise<{ ok: true } | { error: ActionError }> {
  const actor = currentActor();
  return guarded(async () => {
    await withAgency(actor.agencyId, (tx) => restoreEntry(tx, actor, id));
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

export async function editAction(id: string, change: EntryChange, reasons: string[], note: string): Promise<{ ok: true } | { ok: false; error: EditError | "period_busy" }> {
  const actor = currentActor();
  return edited(() => withAgency(actor.agencyId, (tx) => editEntry(tx, actor, id, change, reasons, note)));
}

export async function addAction(
  payPeriodId: string,
  input: EntryChange & { workerId: string; workDate: string },
  reasons: string[],
  note: string,
): Promise<{ ok: true } | { ok: false; error: EditError | "period_busy" }> {
  const actor = currentActor();
  const r = await edited(() => withAgency(actor.agencyId, (tx) => addEntry(tx, actor, payPeriodId, input, reasons, note)));
  return r.ok ? { ok: true } : r;
}

export async function computeTotalsAction(payPeriodId: string): Promise<{ ok: true } | { error: ActionError }> {
  const actor = currentActor();
  return guarded(async () => {
    await withAgency(actor.agencyId, (tx) => computeRun(tx, actor, payPeriodId));
    refresh();
    return { ok: true as const };
  });
}

export async function skipAction(payPeriodId: string, workerIds: string[], skipped: boolean, reason: string): Promise<{ ok: boolean } | { error: ActionError }> {
  const actor = currentActor();
  if (reason.trim() === "") return { ok: false };
  return guarded(async () => {
    await withAgency(actor.agencyId, async (tx) => {
      for (const id of workerIds) await setSkipped(tx, actor, payPeriodId, id, { skipped, reason });
      await computeRun(tx, actor, payPeriodId);
    });
    refresh();
    return { ok: true };
  });
}

export async function createFilesAction(
  payPeriodId: string,
  expectedFingerprint: string,
): Promise<{ ok: true } | { ok: false; error: "not_ready" | "totals_changed" | "period_locked" | "busy" | "generic" }> {
  const actor = currentActor();
  try {
    await withAgency(actor.agencyId, (tx) => createRunFiles(tx, actor, documentStore, payPeriodId, { today: today(), expectedFingerprint }));
    refresh();
    return { ok: true };
  } catch (error) {
    refresh();
    if (error instanceof RunNotReadyError) return { ok: false, error: "not_ready" };
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
  const rows = await withAgency(actor.agencyId, (tx) => tx.select().from(auditEvents).where(and(eq(auditEvents.entityType, "time_entry"), eq(auditEvents.entityId, entryId))));
  return rows
    .sort((a, b) => a.id - b.id)
    .map((r) => ({ at: r.occurredAt.toISOString(), actor: r.actorLabel, action: r.action, before: r.before, after: r.after, reason: r.reason }));
}
