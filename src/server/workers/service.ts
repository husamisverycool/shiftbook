/**
 * The worker roster (slice k step 2, decision 0027; SPEC §17): a worker's details, their SSN sealed
 * with its own key (src/server/workers/ssn.ts), the Owner's audited reveal, payroll numbers,
 * documents, the end of employment. A worker is never deleted.
 *
 * The roster is the Owner's and the Coordinators' to change ("workers"); a whole SSN is the Owner's
 * alone to see ("revealSsn"), with a reason, and every look and change is an audit event that never
 * holds the number (the last four at most).
 */
import { and, count, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { isIsoDate } from "@shiftbook/rules";
import { holdsSsn } from "../../lib/ssn-text";
import type { PayrollSystem } from "../../exports/targets";
import { audit } from "../audit";
import { storeComplianceDocument } from "../compliance/service";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { setWorkerPayrollId } from "../payroll/settings";
import { can } from "../permissions";
import type { Actor } from "../session";
import type { DocumentStore } from "../storage";
import { last4Of, readSsn, sealSsn, ssnIndex, ssnProblem, unsealSsn, type SsnProblem } from "./ssn";

export type WorkerError = "not_allowed" | "not_found" | "invalid" | "duplicate" | "reason_required" | "none" | "ended" | "active" | "too_many";
export type WorkerResult<T = object> = ({ ok: true } & T) | { ok: false; error: Exclude<WorkerError, "invalid" | "duplicate"> } | { ok: false; error: "invalid"; field: string; rule?: SsnProblem | "has_ssn" } | { ok: false; error: "duplicate"; by: string };

const LANGUAGES = ["en", "es"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const name = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const nameOk = (v: string) => v.length > 0 && v.length <= 100;
/**
 * SSNs one person may enter or replace in an hour, refusals included: enough to set up a crew, too few
 * to guess another worker's number through the "already on another worker" answer.
 */
export const SSN_ENTRIES_PER_HOUR = 30;

async function workerOf(tx: Tx, id: string) {
  if (!UUID.test(id)) return null;
  const [w] = await tx.select().from(s.workers).where(eq(s.workers.id, id)).for("update");
  return w ?? null;
}

export interface NewWorker {
  firstName: string;
  lastName: string;
  preferredLanguage: string;
  hireDate: string | null;
}

/** A new worker (Toast's Add employee): names, language, hire date. */
export async function createWorker(tx: Tx, actor: Actor, input: NewWorker): Promise<WorkerResult<{ id: string }>> {
  if (!can(actor, "workers")) return { ok: false, error: "not_allowed" };
  const firstName = name(input.firstName);
  const lastName = name(input.lastName);
  if (!nameOk(firstName)) return { ok: false, error: "invalid", field: "firstName" };
  if (!nameOk(lastName)) return { ok: false, error: "invalid", field: "lastName" };
  if (!(LANGUAGES as readonly string[]).includes(input.preferredLanguage)) return { ok: false, error: "invalid", field: "preferredLanguage" };
  if (input.hireDate !== null && !isIsoDate(input.hireDate)) return { ok: false, error: "invalid", field: "hireDate" };
  const [row] = await tx.insert(s.workers).values({ agencyId: actor.agencyId, firstName, lastName, preferredLanguage: input.preferredLanguage, hireDate: input.hireDate }).returning({ id: s.workers.id });
  await audit(tx, actor, [{ action: "create", entityType: "worker", entityId: row!.id, after: { firstName, lastName, preferredLanguage: input.preferredLanguage, hireDate: input.hireDate } }]);
  return { ok: true, id: row!.id };
}

/** The Personal section (Toast: each section with its own Edit). */
export async function updatePersonal(tx: Tx, actor: Actor, id: string, input: { firstName: string; lastName: string; preferredLanguage: string }): Promise<WorkerResult> {
  if (!can(actor, "workers")) return { ok: false, error: "not_allowed" };
  const w = await workerOf(tx, id);
  if (!w) return { ok: false, error: "not_found" };
  const firstName = name(input.firstName);
  const lastName = name(input.lastName);
  if (!nameOk(firstName)) return { ok: false, error: "invalid", field: "firstName" };
  if (!nameOk(lastName)) return { ok: false, error: "invalid", field: "lastName" };
  if (!(LANGUAGES as readonly string[]).includes(input.preferredLanguage)) return { ok: false, error: "invalid", field: "preferredLanguage" };
  const before = { firstName: w.firstName, lastName: w.lastName, preferredLanguage: w.preferredLanguage };
  const after = { firstName, lastName, preferredLanguage: input.preferredLanguage };
  if (JSON.stringify(before) === JSON.stringify(after)) return { ok: true };
  await tx.update(s.workers).set(after).where(eq(s.workers.id, w.id));
  await audit(tx, actor, [{ action: "update", entityType: "worker", entityId: w.id, before, after }]);
  return { ok: true };
}

/** Enters or replaces the SSN: sealed with a fresh data key, refused when another worker in the agency has it. */
export async function setSsn(tx: Tx, actor: Actor, id: string, text: string, kek: Buffer): Promise<WorkerResult> {
  if (!can(actor, "workers")) return { ok: false, error: "not_allowed" };
  if (typeof text !== "string") return { ok: false, error: "invalid", field: "ssn", rule: "format" };
  const problem = ssnProblem(text);
  if (problem) return { ok: false, error: "invalid", field: "ssn", rule: problem };
  // One at a time in the agency: two people entering the same number at once both see the check.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`ssn:${actor.agencyId}`}, 0))`);
  const [entries] = await tx
    .select({ n: count() })
    .from(s.auditEvents)
    .where(and(eq(s.auditEvents.actorUserId, actor.userId), eq(s.auditEvents.entityType, "worker"), gt(s.auditEvents.occurredAt, sql`now() - interval '1 hour'`), sql`${s.auditEvents.after}->>'ssn' in ('changed', 'duplicate_refused')`));
  if ((entries?.n ?? 0) >= SSN_ENTRIES_PER_HOUR) return { ok: false, error: "too_many" };
  const w = await workerOf(tx, id);
  if (!w) return { ok: false, error: "not_found" };
  const digits = readSsn(text)!;
  const index = ssnIndex(digits, kek, actor.agencyId);
  const [other] = await tx.select({ id: s.workers.id, firstName: s.workers.firstName, lastName: s.workers.lastName, last4: s.workers.ssnLast4 }).from(s.workers).where(and(eq(s.workers.ssnIndex, index), ne(s.workers.id, w.id)));
  if (other) {
    // The worker whose number it is shows the try in "who viewed or changed it" (never the number).
    await audit(tx, actor, [{ action: "refuse", entityType: "worker", entityId: other.id, after: { ssn: "duplicate_refused", last4: other.last4, enteredOn: w.id } }]);
    return { ok: false, error: "duplicate", by: `${other.firstName} ${other.lastName}` };
  }
  if (w.ssnIndex === index) return { ok: true };
  await tx
    .update(s.workers)
    .set({ ssnSealed: sealSsn(digits, kek, w.id), ssnLast4: last4Of(digits), ssnIndex: index, ssnChangedAt: new Date() })
    .where(eq(s.workers.id, w.id));
  // The log keeps that it changed and the last four, never the number.
  await audit(tx, actor, [{ action: "update", entityType: "worker", entityId: w.id, before: w.ssnLast4 ? { ssn: "on file", last4: w.ssnLast4 } : { ssn: "none" }, after: { ssn: "changed", last4: last4Of(digits) } }]);
  return { ok: true };
}

/** Toast's Retrieve SSN: the Owner, a business reason, one worker; the look is recorded with its reason. */
export async function revealSsn(tx: Tx, actor: Actor, id: string, reason: string, kek: Buffer): Promise<WorkerResult<{ ssn: string }>> {
  if (!can(actor, "revealSsn")) return { ok: false, error: "not_allowed" };
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length === 0) return { ok: false, error: "reason_required" };
  if (why.length > 500) return { ok: false, error: "invalid", field: "reason" };
  // The reason is kept for good: the number never goes in it.
  if (holdsSsn(why)) return { ok: false, error: "invalid", field: "reason", rule: "has_ssn" };
  if (!UUID.test(id)) return { ok: false, error: "not_found" };
  const [w] = await tx.select().from(s.workers).where(eq(s.workers.id, id));
  if (!w) return { ok: false, error: "not_found" };
  if (!w.ssnSealed) return { ok: false, error: "none" };
  const digits = unsealSsn(w.ssnSealed, kek, w.id);
  await audit(tx, actor, [{ action: "reveal", entityType: "worker", entityId: w.id, after: { field: "ssn", last4: w.ssnLast4 }, reason: why }]);
  return { ok: true, ssn: `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` };
}

/** A payroll number from the profile (the same rules as the payroll settings' Worker ids tab). */
export async function setWorkerPayrollNumber(tx: Tx, actor: Actor, id: string, system: PayrollSystem, value: string, title?: string): Promise<WorkerResult | { ok: false; error: "taken"; by: string } | { ok: false; error: "invalid"; problems: { field: string; rule: string; message: string }[] }> {
  if (!can(actor, "employment")) return { ok: false, error: "not_allowed" };
  const r = await setWorkerPayrollId(tx, actor, id, system, typeof value === "string" ? value.trim() : "", title);
  return r as WorkerResult | { ok: false; error: "taken"; by: string } | { ok: false; error: "invalid"; problems: { field: string; rule: string; message: string }[] };
}

/** Employment ends on a date (Toast's status change); the record stays. */
export async function endEmployment(tx: Tx, actor: Actor, id: string, endedOn: string, today: string): Promise<WorkerResult> {
  if (!can(actor, "employment")) return { ok: false, error: "not_allowed" };
  if (!isIsoDate(endedOn)) return { ok: false, error: "invalid", field: "endedOn" };
  const w = await workerOf(tx, id);
  if (!w) return { ok: false, error: "not_found" };
  if (w.status === "ended") return { ok: false, error: "ended" };
  if ((w.hireDate && endedOn < w.hireDate) || endedOn > today) return { ok: false, error: "invalid", field: "endedOn" };
  await tx.update(s.workers).set({ status: "ended", endedOn }).where(eq(s.workers.id, w.id));
  await audit(tx, actor, [{ action: "update", entityType: "worker", entityId: w.id, before: { status: "active" }, after: { status: "ended", endedOn } }]);
  return { ok: true };
}

/** Back to work (Toast's rehire). */
export async function rehire(tx: Tx, actor: Actor, id: string): Promise<WorkerResult> {
  if (!can(actor, "employment")) return { ok: false, error: "not_allowed" };
  const w = await workerOf(tx, id);
  if (!w) return { ok: false, error: "not_found" };
  if (w.status === "active") return { ok: false, error: "active" };
  await tx.update(s.workers).set({ status: "active", endedOn: null }).where(eq(s.workers.id, w.id));
  await audit(tx, actor, [{ action: "update", entityType: "worker", entityId: w.id, before: { status: "ended", endedOn: w.endedOn }, after: { status: "active" } }]);
  return { ok: true };
}

/** A worker's file (a W-4, a withholding or direct deposit form…), kept in the agency's document store with its effective date. */
export async function addWorkerDocument(
  tx: Tx,
  actor: Actor,
  store: DocumentStore,
  id: string,
  file: { filename: string; bytes: Uint8Array; kind: string; effectiveOn: string },
): Promise<WorkerResult<{ id: string; storageKey: string }>> {
  if (!can(actor, "workers")) return { ok: false, error: "not_allowed" };
  // No I-9 or identity-document copies: the kinds leave them out (decision J4: the I-9 is dates only).
  if (!(s.WORKER_DOCUMENT_KINDS as readonly string[]).includes(file.kind)) return { ok: false, error: "invalid", field: "kind" };
  // A file name is shown on the page and in the log: never an SSN in it.
  if (holdsSsn(file.filename)) return { ok: false, error: "invalid", field: "file_name" };
  const w = await workerOf(tx, id);
  if (!w) return { ok: false, error: "not_found" };
  const stored = await storeComplianceDocument(tx, actor, store, { filename: file.filename, bytes: file.bytes, effectiveOn: file.effectiveOn }, "upload");
  if (!stored.ok) return stored;
  const [link] = await tx
    .insert(s.workerDocuments)
    .values({ agencyId: actor.agencyId, workerId: w.id, documentId: stored.id, kind: file.kind as s.WorkerDocumentKind, createdBy: actor.userId, createdByLabel: actor.label })
    .returning({ id: s.workerDocuments.id });
  await audit(tx, actor, [{ action: "update", entityType: "worker", entityId: w.id, after: { document: "added", kind: file.kind, filename: file.filename.trim(), effectiveOn: file.effectiveOn } }]);
  return { ok: true, id: link!.id, storageKey: stored.storageKey };
}

/** Removes a document from the profile; the file stays in the store for the record. */
export async function removeWorkerDocument(tx: Tx, actor: Actor, workerId: string, linkId: string): Promise<WorkerResult> {
  if (!can(actor, "workers")) return { ok: false, error: "not_allowed" };
  if (!UUID.test(workerId) || !UUID.test(linkId)) return { ok: false, error: "not_found" };
  const [link] = await tx
    .update(s.workerDocuments)
    .set({ removedAt: new Date(), removedByLabel: actor.label })
    .where(and(eq(s.workerDocuments.id, linkId), eq(s.workerDocuments.workerId, workerId), isNull(s.workerDocuments.removedAt)))
    .returning();
  if (!link) return { ok: false, error: "not_found" };
  await audit(tx, actor, [{ action: "update", entityType: "worker", entityId: workerId, after: { document: "removed", kind: link.kind, documentId: link.documentId } }]);
  return { ok: true };
}

/**
 * Whether a stored file is a worker's: those never go out through the compliance files' route (a W-4
 * holds the SSN; a direct deposit form, bank details). Every other file is the agency's to read.
 */
export async function isWorkerFile(tx: Tx, documentId: string): Promise<boolean> {
  const linked = await tx.select({ id: s.workerDocuments.id }).from(s.workerDocuments).where(eq(s.workerDocuments.documentId, documentId)).limit(1);
  return linked.length > 0;
}

/**
 * Opening a worker's file is a look at what it holds (the SSN on a W-4, bank details): the Owner, a
 * business reason, recorded like Retrieve SSN; the route then serves it through a short grant.
 */
export async function openWorkerDocument(tx: Tx, actor: Actor, workerId: string, linkId: string, reason: string): Promise<WorkerResult> {
  if (!can(actor, "revealSsn")) return { ok: false, error: "not_allowed" };
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length === 0) return { ok: false, error: "reason_required" };
  if (why.length > 500) return { ok: false, error: "invalid", field: "reason" };
  if (holdsSsn(why)) return { ok: false, error: "invalid", field: "reason", rule: "has_ssn" };
  if (!UUID.test(workerId) || !UUID.test(linkId)) return { ok: false, error: "not_found" };
  const [link] = await tx
    .select({ kind: s.workerDocuments.kind, documentId: s.workerDocuments.documentId, filename: s.complianceDocuments.filename })
    .from(s.workerDocuments)
    .innerJoin(s.complianceDocuments, eq(s.complianceDocuments.id, s.workerDocuments.documentId))
    .where(and(eq(s.workerDocuments.id, linkId), eq(s.workerDocuments.workerId, workerId), isNull(s.workerDocuments.removedAt)));
  if (!link) return { ok: false, error: "not_found" };
  await audit(tx, actor, [{ action: "reveal", entityType: "worker", entityId: workerId, after: { document: link.kind, documentId: link.documentId, filename: link.filename }, reason: why }]);
  return { ok: true };
}
