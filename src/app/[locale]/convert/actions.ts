"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { withAgency } from "@/server/db";
import { auditEvents, jobs, sourceDocuments } from "@/server/db/schema";
import { createRunFiles, RunNotReadyError, TotalsChangedError } from "@/server/files/service";
import { openPeriod, PeriodLockedError, PeriodNotFoundError } from "@/server/run/period-lock";
import { archiveDocument, classifyUpload, NotArchivableError, receiveDocument } from "@/server/intake/service";
import { addEntry, approveEntries, confirmDistinctDay, editEntry, rejectEntry, restoreEntry, type EditError, type EntryChange } from "@/server/review/service";
import { computeRun, setSkipped } from "@/server/run/service";
import { processQueuedDocuments } from "@/server/services";
import { currentActor } from "@/server/session";
import { documentStore } from "@/server/storage";

const MAX_BYTES = 25 * 1024 * 1024;
const refresh = () => revalidatePath("/[locale]/convert", "page");
const today = () => new Date().toISOString().slice(0, 10);

export type UploadResult = { accepted: string[]; refused: { filename: string; reason: "unsupported" | "tooLarge" | "duplicate" }[]; locked?: true };
export type ActionError = "period_locked" | "generic";

/** Turns the expected refusals into a plain result; anything else is a real error. */
async function guarded<T>(fn: () => Promise<T>): Promise<T | { error: ActionError }> {
  try {
    return await fn();
  } catch (error) {
    refresh();
    if (error instanceof PeriodLockedError) return { error: "period_locked" };
    if (error instanceof PeriodNotFoundError || error instanceof NotArchivableError) return { error: "generic" };
    throw error;
  }
}

export async function uploadTimesheets(payPeriodId: string, form: FormData): Promise<UploadResult> {
  const actor = currentActor();
  const result: UploadResult = { accepted: [], refused: [] };
  for (const entry of form.getAll("files")) {
    if (!(entry instanceof File)) continue;
    if (!classifyUpload(entry.name)) result.refused.push({ filename: entry.name, reason: "unsupported" });
    else if (entry.size > MAX_BYTES) result.refused.push({ filename: entry.name, reason: "tooLarge" });
    else {
      const bytes = new Uint8Array(await entry.arrayBuffer());
      try {
        const { duplicate } = await withAgency(actor.agencyId, (tx) => receiveDocument(tx, actor, documentStore, { payPeriodId, filename: entry.name, bytes }));
        if (duplicate) result.refused.push({ filename: entry.name, reason: "duplicate" });
        else result.accepted.push(entry.name);
      } catch (error) {
        if (error instanceof PeriodNotFoundError) {
          result.refused.push({ filename: entry.name, reason: "unsupported" });
          break;
        }
        if (!(error instanceof PeriodLockedError)) throw error;
        result.locked = true;
        break;
      }
    }
  }
  if (result.accepted.length > 0) after(() => processQueuedDocuments(actor).catch(() => undefined));
  refresh();
  return result;
}

/** Reads any queued uploads (for example after a restart). */
export async function readQueued(): Promise<void> {
  const actor = currentActor();
  after(() => processQueuedDocuments(actor).catch(() => undefined));
}

export async function retryDocument(documentId: string): Promise<{ ok: true } | { error: ActionError }> {
  const actor = currentActor();
  return guarded(async () => {
    await withAgency(actor.agencyId, async (tx) => {
      const [doc] = await tx.select({ payPeriodId: sourceDocuments.payPeriodId }).from(sourceDocuments).where(eq(sourceDocuments.id, documentId));
      if (!doc) return;
      await openPeriod(tx, doc.payPeriodId);
      await tx.update(sourceDocuments).set({ status: "received", error: null, updatedAt: new Date() }).where(eq(sourceDocuments.id, documentId));
      await tx.insert(jobs).values({ agencyId: actor.agencyId, kind: "read_document", payload: { documentId } });
    });
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

export async function editAction(id: string, change: EntryChange, reasons: string[], note: string): Promise<{ ok: true } | { ok: false; error: EditError }> {
  const actor = currentActor();
  const r = await withAgency(actor.agencyId, (tx) => editEntry(tx, actor, id, change, reasons, note));
  refresh();
  return r;
}

export async function addAction(
  payPeriodId: string,
  input: EntryChange & { workerId: string; workDate: string },
  reasons: string[],
  note: string,
): Promise<{ ok: true } | { ok: false; error: EditError }> {
  const actor = currentActor();
  const r = await withAgency(actor.agencyId, (tx) => addEntry(tx, actor, payPeriodId, input, reasons, note));
  refresh();
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
): Promise<{ ok: true } | { ok: false; error: "not_ready" | "totals_changed" | "period_locked" | "generic" }> {
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
