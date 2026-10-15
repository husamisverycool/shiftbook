"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { withAgency } from "@/server/db";
import { auditEvents, jobs, sourceDocuments } from "@/server/db/schema";
import { createRunFiles, RunNotReadyError } from "@/server/files/service";
import { classifyUpload, receiveDocument } from "@/server/intake/service";
import { addEntry, approveEntries, editEntry, rejectEntry, restoreEntry, type EditError, type EntryChange } from "@/server/review/service";
import { computeRun, setSkipped } from "@/server/run/service";
import { processQueuedDocuments } from "@/server/services";
import { currentActor } from "@/server/session";
import { documentStore } from "@/server/storage";

const MAX_BYTES = 25 * 1024 * 1024;
const refresh = () => revalidatePath("/[locale]/convert", "page");
const today = () => new Date().toISOString().slice(0, 10);

export type UploadResult = { accepted: string[]; refused: { filename: string; reason: "unsupported" | "tooLarge" | "duplicate" }[] };

export async function uploadTimesheets(payPeriodId: string, form: FormData): Promise<UploadResult> {
  const actor = currentActor();
  const result: UploadResult = { accepted: [], refused: [] };
  for (const entry of form.getAll("files")) {
    if (!(entry instanceof File)) continue;
    if (!classifyUpload(entry.name)) result.refused.push({ filename: entry.name, reason: "unsupported" });
    else if (entry.size > MAX_BYTES) result.refused.push({ filename: entry.name, reason: "tooLarge" });
    else {
      const bytes = new Uint8Array(await entry.arrayBuffer());
      const { duplicate } = await withAgency(actor.agencyId, (tx) => receiveDocument(tx, actor, documentStore, { payPeriodId, filename: entry.name, bytes }));
      if (duplicate) result.refused.push({ filename: entry.name, reason: "duplicate" });
      else result.accepted.push(entry.name);
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

export async function retryDocument(documentId: string): Promise<void> {
  const actor = currentActor();
  await withAgency(actor.agencyId, async (tx) => {
    await tx.update(sourceDocuments).set({ status: "received", error: null, updatedAt: new Date() }).where(eq(sourceDocuments.id, documentId));
    await tx.insert(jobs).values({ agencyId: actor.agencyId, kind: "read_document", payload: { documentId } });
  });
  after(() => processQueuedDocuments(actor).catch(() => undefined));
  refresh();
}

export async function approveAction(ids: string[], bulk: boolean): Promise<{ approved: number; skipped: number }> {
  const actor = currentActor();
  const r = await withAgency(actor.agencyId, (tx) => approveEntries(tx, actor, ids, { bulk }));
  refresh();
  return { approved: r.approved.length, skipped: r.skipped.length };
}

export async function rejectAction(id: string): Promise<void> {
  const actor = currentActor();
  await withAgency(actor.agencyId, (tx) => rejectEntry(tx, actor, id));
  refresh();
}

export async function restoreAction(id: string): Promise<void> {
  const actor = currentActor();
  await withAgency(actor.agencyId, (tx) => restoreEntry(tx, actor, id));
  refresh();
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

export async function computeTotalsAction(payPeriodId: string): Promise<void> {
  const actor = currentActor();
  await withAgency(actor.agencyId, (tx) => computeRun(tx, actor, payPeriodId));
  refresh();
}

export async function skipAction(payPeriodId: string, workerIds: string[], skipped: boolean, reason: string): Promise<{ ok: boolean }> {
  const actor = currentActor();
  if (reason.trim() === "") return { ok: false };
  await withAgency(actor.agencyId, async (tx) => {
    for (const id of workerIds) await setSkipped(tx, actor, payPeriodId, id, { skipped, reason });
    await computeRun(tx, actor, payPeriodId);
  });
  refresh();
  return { ok: true };
}

export async function createFilesAction(payPeriodId: string): Promise<{ ok: true } | { ok: false; error: "not_ready" | "generic" }> {
  const actor = currentActor();
  try {
    await withAgency(actor.agencyId, (tx) => createRunFiles(tx, actor, documentStore, payPeriodId, { today: today() }));
    refresh();
    return { ok: true };
  } catch (error) {
    refresh();
    return { ok: false, error: error instanceof RunNotReadyError ? "not_ready" : "generic" };
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
