/**
 * One timesheet with every value read from it (docs/patterns/documents/[documentId].md: Rossum's
 * validation screen, Dext's item details): the document, its lines, its pages or file rows, the
 * documents before and after it in the inbox, and its history.
 */
import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { Tx } from "../db";
import * as s from "../db/schema";
import type { DocumentStore } from "../storage";
import type { TimeclockProfile } from "../intake/profiles";
import { tableAt } from "../intake/structured";
import { hoursStep, type HoursRow } from "./queries";

const FILE_ROWS_SHOWN = 500;

export interface DocumentReview {
  doc: {
    id: string;
    filename: string;
    kind: string;
    status: string;
    error: string | null;
    pageCount: number | null;
    clientName: string | null;
    receivedVia: string;
    receivedAt: string;
    period: { id: string; startsOn: string; endsOn: string };
  };
  rows: HoursRow[];
  roster: { id: string; name: string }[];
  /** A time file's own rows (header and numbered rows), for provenance by row and column. */
  file: { header: string[]; rows: { n: number; values: string[] }[] } | null;
  previousId: string | null;
  nextId: string | null;
  /** The next document in the inbox that still has values to review (Rossum: after Confirm, go there). */
  nextToReviewId: string | null;
  history: { id: string; at: string; actor: string; action: string; entityType: string; reason: string | null }[];
}

export async function documentReview(tx: Tx, store: DocumentStore, documentId: string): Promise<DocumentReview | null> {
  const [d] = await tx.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.id, documentId));
  if (!d) return null;
  const [period] = await tx.select().from(s.payPeriods).where(eq(s.payPeriods.id, d.payPeriodId));
  const [client] = d.clientId ? await tx.select({ name: s.clients.name }).from(s.clients).where(eq(s.clients.id, d.clientId)) : [];
  const { rows, roster } = await hoursStep(tx, d.payPeriodId);
  const mine = rows.filter((r) => r.document?.id === d.id).sort((a, b) => a.rowIndex - b.rowIndex);

  // The inbox's order: newest first, then by name (src/server/convert/queries.ts uploadStep).
  const siblings = (await tx.select({ id: s.sourceDocuments.id, filename: s.sourceDocuments.filename, createdAt: s.sourceDocuments.createdAt, status: s.sourceDocuments.status }).from(s.sourceDocuments).where(eq(s.sourceDocuments.payPeriodId, d.payPeriodId)))
    .filter((x) => x.status !== "archived")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.filename.localeCompare(b.filename));
  const at = siblings.findIndex((x) => x.id === d.id);
  const toReview = new Set(rows.filter((r) => r.status === "needs_review").map((r) => r.document?.id));
  const after = [...siblings.slice(at + 1), ...siblings.slice(0, Math.max(at, 0))];

  let file: DocumentReview["file"] = null;
  if (/\.(csv|xlsx)$/i.test(d.filename)) {
    const [profile] = d.mappingProfileId ? await tx.select({ definition: s.mappingProfiles.definition }).from(s.mappingProfiles).where(eq(s.mappingProfiles.id, d.mappingProfileId)) : [];
    const headerRow = (profile?.definition as TimeclockProfile | undefined)?.headerRow ?? 1;
    try {
      const t = await tableAt(d.filename, await store.get(d.storageKey), headerRow);
      file = { header: t.header, rows: t.rows.slice(0, FILE_ROWS_SHOWN).map((values, i) => ({ n: t.rowNumbers[i] ?? i + 2, values })) };
    } catch {
      file = null; // a file that cannot be read shows its error instead
    }
  }

  const entryIds = mine.map((r) => r.id);
  const events = await tx
    .select()
    .from(s.auditEvents)
    .where(entryIds.length > 0 ? or(and(eq(s.auditEvents.entityType, "source_document"), eq(s.auditEvents.entityId, d.id)), and(eq(s.auditEvents.entityType, "time_entry"), inArray(s.auditEvents.entityId, entryIds))) : and(eq(s.auditEvents.entityType, "source_document"), eq(s.auditEvents.entityId, d.id)))
    .orderBy(desc(s.auditEvents.occurredAt))
    .limit(100);

  return {
    doc: {
      id: d.id,
      filename: d.filename,
      kind: d.kind,
      status: d.status,
      error: d.error,
      pageCount: d.pageCount,
      clientName: client?.name ?? null,
      receivedVia: d.receivedVia,
      receivedAt: d.createdAt.toISOString(),
      period: { id: period!.id, startsOn: period!.startsOn, endsOn: period!.endsOn },
    },
    rows: mine,
    roster,
    file,
    previousId: at > 0 ? siblings[at - 1]!.id : null,
    nextId: at >= 0 && at < siblings.length - 1 ? siblings[at + 1]!.id : null,
    nextToReviewId: after.find((x) => toReview.has(x.id))?.id ?? null,
    history: events.map((e) => ({ id: String(e.id), at: e.occurredAt.toISOString(), actor: e.actorLabel, action: e.action, entityType: e.entityType, reason: e.reason })),
  };
}

