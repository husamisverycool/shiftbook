/**
 * Intake service: receive a file, store it, and read it into checked time entries (SPEC §6).
 * Structured files are parsed deterministically; images and PDFs go through the two-pass extractor.
 * Every time entry written is audited.
 */
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { openPeriod } from "../run/period-lock";
import type { Actor } from "../session";
import type { DocumentStore } from "../storage";
import { assessEntry, type AssessContext, type EntryDraft } from "./assess";
import { parseStructuredUpload } from "./structured";
import type { ParsedDocument } from "./types";

export type DocumentKind = (typeof s.documentKind.enumValues)[number];

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
};

/** What kind of document an upload is, from its name; null when the type is not accepted. */
export function classifyUpload(filename: string): { kind: DocumentKind; mediaType: string } | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (IMAGE_TYPES[ext]) return { kind: "image", mediaType: IMAGE_TYPES[ext] };
  if (ext === "pdf") return { kind: "pdf", mediaType: "application/pdf" };
  if (ext === "csv") return { kind: "timeclock_csv", mediaType: "text/csv" };
  if (ext === "xlsx") return { kind: "timeclock_xlsx", mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  return null;
}

export class UnsupportedFileError extends Error {
  constructor(filename: string) {
    super(`${filename}: only JPG, PNG, HEIC, PDF, CSV and XLSX files are accepted.`);
    this.name = "UnsupportedFileError";
  }
}

const safeName = (filename: string) => filename.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(0, 120) || "file";

/** Stores the file and records it. The same file in the same period is recognised, not duplicated. */
export async function receiveDocument(
  tx: Tx,
  actor: Actor,
  store: DocumentStore,
  input: { payPeriodId: string; filename: string; bytes: Uint8Array; receivedVia?: "upload" | "email" | "manual" },
): Promise<{ documentId: string; duplicate: boolean }> {
  // The period must be the agency's own (row-level security) and still open.
  await openPeriod(tx, input.payPeriodId);
  const type = classifyUpload(input.filename);
  if (!type) throw new UnsupportedFileError(input.filename);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const [existing] = await tx
    .select({ id: s.sourceDocuments.id })
    .from(s.sourceDocuments)
    .where(and(eq(s.sourceDocuments.payPeriodId, input.payPeriodId), eq(s.sourceDocuments.sha256, sha256)));
  if (existing) return { documentId: existing.id, duplicate: true };

  const storageKey = `${actor.agencyId}/documents/${sha256}/${safeName(input.filename)}`;
  await store.put(storageKey, input.bytes);
  const [doc] = await tx
    .insert(s.sourceDocuments)
    .values({
      agencyId: actor.agencyId,
      payPeriodId: input.payPeriodId,
      kind: type.kind,
      filename: input.filename,
      mediaType: type.mediaType,
      sha256,
      byteSize: input.bytes.byteLength,
      receivedVia: input.receivedVia ?? "upload",
      storageKey,
      status: "received",
    })
    .returning();
  await tx.insert(s.jobs).values({ agencyId: actor.agencyId, kind: "read_document", payload: { documentId: doc!.id } });
  await audit(tx, actor, [{ action: "create", entityType: "source_document", entityId: doc!.id, after: { filename: input.filename, sha256, kind: type.kind } }]);
  return { documentId: doc!.id, duplicate: false };
}

/** Roster, nicknames, assignments, clients and the period: everything the checks need. */
export async function loadAssessContext(tx: Tx, payPeriodId: string, clientHint: string | null): Promise<AssessContext> {
  const [period] = await tx.select().from(s.payPeriods).where(eq(s.payPeriods.id, payPeriodId));
  if (!period) throw new Error("pay period not found");
  const workers = await tx.select().from(s.workers);
  const nick = await tx.select().from(s.nicknames);
  const assignments = await tx
    .select({
      assignmentId: s.assignments.id,
      workerId: s.assignments.workerId,
      clientId: s.jobOrders.clientId,
      startDate: s.assignments.startDate,
      endDate: s.assignments.endDate,
      status: s.assignments.status,
    })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId));
  const clients = await tx.select({ clientId: s.clients.id, name: s.clients.name }).from(s.clients);
  return {
    period: { startsOn: period.startsOn, endsOn: period.endsOn },
    roster: workers.map((w) => ({ workerId: w.id, firstName: w.firstName, lastName: w.lastName })),
    nicknames: nick.map((n) => [n.nickname, n.givenName]),
    assignments,
    clients,
    clientHint,
  };
}

/** Replaces a document's time entries with freshly checked ones, auditing each. */
export async function saveEntries(tx: Tx, actor: Actor, documentId: string, payPeriodId: string, drafts: EntryDraft[]): Promise<void> {
  const old = await tx.select({ id: s.timeEntries.id }).from(s.timeEntries).where(eq(s.timeEntries.sourceDocumentId, documentId));
  if (old.length > 0) {
    await tx.delete(s.timeEntries).where(eq(s.timeEntries.sourceDocumentId, documentId));
    await audit(tx, actor, old.map((o) => ({ action: "delete" as const, entityType: "time_entry", entityId: o.id, reason: "document read again" })));
  }
  if (drafts.length === 0) return;
  const inserted = await tx
    .insert(s.timeEntries)
    .values(
      drafts.map((d) => ({
        agencyId: actor.agencyId,
        payPeriodId,
        sourceDocumentId: documentId,
        rowIndex: d.rowIndex,
        workerNameRaw: d.workerNameRaw,
        workerId: d.workerId,
        assignmentId: d.assignmentId,
        workDate: d.workDate,
        inMinute: d.inMinute,
        outMinute: d.outMinute,
        breakMinutes: d.breakMinutes,
        minutes: d.minutes,
        fields: d.fields,
        confidence: d.confidence,
        status: d.status,
        reviewReasons: d.reviewReasons,
      })),
    )
    .returning();
  await audit(
    tx,
    actor,
    inserted.map((e) => ({
      action: "create" as const,
      entityType: "time_entry",
      entityId: e.id,
      after: { workerNameRaw: e.workerNameRaw, workDate: e.workDate, minutes: e.minutes, status: e.status, reviewReasons: e.reviewReasons },
    })),
  );
}

/** What reading a document produced, before saving. */
export interface ReadResult {
  parsed: ParsedDocument;
  pages: { pageNumber: number; storageKey: string; redactedStorageKey: string; width: number; height: number; redactions: number }[];
}

/** Reads images and PDFs (two independent passes). Implemented by the extraction pipeline. */
export interface ImageReader {
  read(input: { agencyId: string; documentId: string; filename: string; mediaType: string; bytes: Uint8Array; period: { startsOn: string; endsOn: string }; clients: string[] }): Promise<ReadResult>;
}

/** Turns a stored document into checked entries. Long model calls happen outside any transaction. */
export async function readStoredDocument(
  deps: {
    withAgency: <T>(agencyId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;
    store: DocumentStore;
    imageReader: ImageReader;
  },
  actor: Actor,
  documentId: string,
): Promise<{ entries: number; needsReview: number }> {
  const doc = await deps.withAgency(actor.agencyId, async (tx) => {
    const [d] = await tx.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.id, documentId));
    if (!d) throw new Error("document not found");
    const [p] = await tx.select().from(s.payPeriods).where(eq(s.payPeriods.id, d.payPeriodId));
    const clients = await tx.select({ name: s.clients.name }).from(s.clients);
    await tx.update(s.sourceDocuments).set({ status: "reading", error: null, updatedAt: new Date() }).where(eq(s.sourceDocuments.id, documentId));
    // Sorted: the prompt (and so the recorded-reading hash) must not depend on row order.
    return { ...d, period: { startsOn: p!.startsOn, endsOn: p!.endsOn }, clients: clients.map((c) => c.name).sort() };
  });

  try {
    const bytes = await deps.store.get(doc.storageKey);
    const result: ReadResult =
      doc.kind === "image" || doc.kind === "pdf"
        ? await deps.imageReader.read({ agencyId: actor.agencyId, documentId, filename: doc.filename, mediaType: doc.mediaType, bytes, period: doc.period, clients: doc.clients })
        : { parsed: await parseStructuredUpload(doc.filename, bytes), pages: [] };

    return await deps.withAgency(actor.agencyId, async (tx) => {
      await openPeriod(tx, doc.payPeriodId);
      const context = await loadAssessContext(tx, doc.payPeriodId, result.parsed.clientHint);
      const drafts = result.parsed.entries.map((raw) => assessEntry(raw, context));
      await tx.delete(s.documentPages).where(eq(s.documentPages.documentId, documentId));
      if (result.pages.length > 0) {
        await tx.insert(s.documentPages).values(result.pages.map((p) => ({ ...p, agencyId: actor.agencyId, documentId })));
      }
      await saveEntries(tx, actor, documentId, doc.payPeriodId, drafts);
      const clientId = drafts.find((d) => d.clientId)?.clientId ?? null;
      await tx
        .update(s.sourceDocuments)
        .set({ status: "read", kind: result.parsed.kind, clientId, pageCount: result.pages.length || null, error: result.parsed.notes.join("\n") || null, updatedAt: new Date() })
        .where(eq(s.sourceDocuments.id, documentId));
      return { entries: drafts.length, needsReview: drafts.filter((d) => d.status === "needs_review").length };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.withAgency(actor.agencyId, (tx) =>
      tx.update(s.sourceDocuments).set({ status: "failed", error: message, updatedAt: new Date() }).where(eq(s.sourceDocuments.id, documentId)),
    );
    throw error;
  }
}
