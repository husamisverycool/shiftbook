/**
 * What people do with compliance duties (slice j; docs/patterns/compliance/[id].md,
 * settings/compliance.md): an owner, done with a note, not applicable with a reason, reopened (the
 * Owner), notes, files (never deleted), the I-9 dates, registrations and workers' comp policies.
 * Every change is audited and takes the compliance lock; anything that changes the facts works the
 * duties out again at once.
 */
import type { Explain } from "../../lib/explain";
import { createHash, randomUUID } from "node:crypto";
import { addDays, isIsoDate } from "@shiftbook/rules";
import { and, eq, isNull } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { lockCompliance } from "../run/period-lock";
import type { Actor } from "../session";
import type { DocumentStore } from "../storage";
import { complianceRules, OPEN_DAYS_KEY, syncObligations } from "./sync";
import { can } from "../permissions";

export type ComplianceError = "not_allowed" | "not_found" | "invalid" | "not_open" | "already_open" | "closed_by_data";
export type ComplianceResult = { ok: true } | { ok: false; error: ComplianceError; field?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Files a duty's proof may be: PDF, images, spreadsheets, documents, text (Vanta's list, without archives). */
export const EVIDENCE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  csv: "text/csv",
  txt: "text/plain",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
export const MAX_EVIDENCE_BYTES = 20 * 1024 * 1024;
export const MA_STATEMENT_KEY = "compliance.ma_statement_document";

const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
const dateOrNull = (v: unknown) => v === null || (typeof v === "string" && isIsoDate(v));

export const mayChangeComplianceSettings = (actor: Actor) => can(actor, "settings");

/** The Owner acts on every duty; a coordinator or billing on the kinds whose rule names them; the accountant reads. */
export async function mayActOn(tx: Tx, actor: Actor, kind: string): Promise<boolean> {
  if (actor.role === "owner") return true;
  if (actor.role === "accountant") return false;
  const rules = (await complianceRules(tx)).filter((r) => r.code === kind);
  return rules.some((r) => r.roles.includes(actor.role));
}

async function obligationFor(tx: Tx, actor: Actor, id: string) {
  if (!UUID.test(id)) return { error: "not_found" as const };
  await lockCompliance(tx, actor.agencyId);
  const [o] = await tx.select().from(s.obligations).where(eq(s.obligations.id, id));
  if (!o) return { error: "not_found" as const };
  if (!(await mayActOn(tx, actor, o.kind))) return { error: "not_allowed" as const };
  return { o };
}

export async function setObligationOwner(tx: Tx, actor: Actor, id: string, userId: string | null): Promise<ComplianceResult> {
  const r = await obligationFor(tx, actor, id);
  if ("error" in r) return { ok: false, error: r.error! };
  if (userId !== null && (!UUID.test(userId) || (await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, userId))).length === 0)) return { ok: false, error: "not_found" };
  if (r.o.ownerUserId === userId) return { ok: true };
  await tx.update(s.obligations).set({ ownerUserId: userId }).where(eq(s.obligations.id, id));
  await audit(tx, actor, [{ action: "update", entityType: "obligation", entityId: id, before: { ownerUserId: r.o.ownerUserId }, after: { ownerUserId: userId } }]);
  return { ok: true };
}

/** Done (with an optional note) or not applicable (with a reason). */
export async function closeObligation(tx: Tx, actor: Actor, id: string, status: "done" | "not_applicable", note: unknown): Promise<ComplianceResult> {
  const r = await obligationFor(tx, actor, id);
  if ("error" in r) return { ok: false, error: r.error! };
  if (r.o.status !== "open") return { ok: false, error: "not_open" };
  const clean = typeof note === "string" ? note.trim() : "";
  if (status === "not_applicable" && !text(clean, 500)) return { ok: false, error: "invalid", field: "reason" };
  if (clean.length > 500) return { ok: false, error: "invalid", field: "note" };
  await tx
    .update(s.obligations)
    .set({ status, statusNote: clean || null, noteKey: null, doneAt: new Date(), doneBy: actor.userId, doneByLabel: actor.label, closedBySystem: false })
    .where(eq(s.obligations.id, id));
  await audit(tx, actor, [{ action: "update", entityType: "obligation", entityId: id, before: { status: "open" }, after: { status, note: clean || null } }]);
  return { ok: true };
}

/** Only the Owner reopens a duty a person closed; what the data closed, the data keeps closed. */
export async function reopenObligation(tx: Tx, actor: Actor, id: string): Promise<ComplianceResult> {
  if (actor.role !== "owner") return { ok: false, error: "not_allowed" };
  const r = await obligationFor(tx, actor, id);
  if ("error" in r) return { ok: false, error: r.error! };
  if (r.o.status === "open") return { ok: false, error: "already_open" };
  if (r.o.closedBySystem) return { ok: false, error: "closed_by_data" };
  await tx.update(s.obligations).set({ status: "open", statusNote: null, noteKey: null, doneAt: null, doneBy: null, doneByLabel: null, closedBySystem: false }).where(eq(s.obligations.id, id));
  await audit(tx, actor, [{ action: "update", entityType: "obligation", entityId: id, before: { status: r.o.status, note: r.o.statusNote }, after: { status: "open" } }]);
  return { ok: true };
}

export async function addObligationNote(tx: Tx, actor: Actor, id: string, body: unknown): Promise<ComplianceResult> {
  const r = await obligationFor(tx, actor, id);
  if ("error" in r) return { ok: false, error: r.error! };
  if (!text(body, 2000)) return { ok: false, error: "invalid", field: "body" };
  const [row] = await tx.insert(s.obligationNotes).values({ agencyId: actor.agencyId, obligationId: id, body: (body as string).trim(), createdBy: actor.userId, createdByLabel: actor.label }).returning({ id: s.obligationNotes.id });
  await audit(tx, actor, [{ action: "create", entityType: "obligation_note", entityId: row!.id, after: { obligationId: id } }]);
  return { ok: true };
}

export interface EvidenceFile {
  filename: string;
  bytes: Uint8Array;
  effectiveOn: string;
}

/** A file kept in the document store and recorded (never deleted); the caller links it. */
export async function storeComplianceDocument(tx: Tx, actor: Actor, store: DocumentStore, file: EvidenceFile, source: "upload" | "generated"): Promise<{ ok: true; id: string; storageKey: string } | { ok: false; error: "invalid"; field: string }> {
  const name = file.filename.trim().replace(/[\\/]/g, "_");
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const mediaType = EVIDENCE_TYPES[ext];
  if (!name || name.length > 200 || !mediaType) return { ok: false, error: "invalid", field: "file_type" };
  if (file.bytes.byteLength === 0 || file.bytes.byteLength > MAX_EVIDENCE_BYTES) return { ok: false, error: "invalid", field: "file_size" };
  if (!isIsoDate(file.effectiveOn)) return { ok: false, error: "invalid", field: "effective_on" };
  const id = randomUUID();
  const storageKey = `compliance/${actor.agencyId}/${id}.${ext}`;
  await store.put(storageKey, file.bytes);
  await tx.insert(s.complianceDocuments).values({
    id,
    agencyId: actor.agencyId,
    filename: name,
    mediaType,
    sizeBytes: file.bytes.byteLength,
    sha256: createHash("sha256").update(file.bytes).digest("hex"),
    storageKey,
    source,
    effectiveOn: file.effectiveOn,
    createdBy: actor.userId,
    createdByLabel: actor.label,
  });
  await audit(tx, actor, [{ action: "create", entityType: "compliance_document", entityId: id, after: { filename: name, source, effectiveOn: file.effectiveOn } }]);
  return { ok: true, id, storageKey };
}

export async function linkDocument(tx: Tx, actor: Actor, obligationId: string, documentId: string): Promise<void> {
  const live = await tx.select().from(s.obligationDocuments).where(and(eq(s.obligationDocuments.obligationId, obligationId), eq(s.obligationDocuments.documentId, documentId), isNull(s.obligationDocuments.unlinkedAt)));
  if (live.length > 0) return;
  await tx.insert(s.obligationDocuments).values({ agencyId: actor.agencyId, obligationId, documentId, linkedByLabel: actor.label });
  await audit(tx, actor, [{ action: "update", entityType: "obligation", entityId: obligationId, after: { linkedDocumentId: documentId } }]);
}

/** Form I-9 copies are never kept in Tabulado: dates only (decision J4). */
export const keepsNoFiles = (kind: string) => kind.startsWith("i9_");

export async function addObligationFile(tx: Tx, actor: Actor, store: DocumentStore, id: string, file: EvidenceFile): Promise<ComplianceResult> {
  const r = await obligationFor(tx, actor, id);
  if ("error" in r) return { ok: false, error: r.error! };
  if (keepsNoFiles(r.o.kind)) return { ok: false, error: "invalid", field: "i9_files" };
  const doc = await storeComplianceDocument(tx, actor, store, file, "upload");
  if (!doc.ok) return doc;
  await linkDocument(tx, actor, id, doc.id);
  return { ok: true };
}

/** Unlinking keeps the file (Past files). */
export async function unlinkObligationFile(tx: Tx, actor: Actor, id: string, documentId: string): Promise<ComplianceResult> {
  const r = await obligationFor(tx, actor, id);
  if ("error" in r) return { ok: false, error: r.error! };
  if (!UUID.test(documentId)) return { ok: false, error: "not_found" };
  const [link] = await tx.select().from(s.obligationDocuments).where(and(eq(s.obligationDocuments.obligationId, id), eq(s.obligationDocuments.documentId, documentId), isNull(s.obligationDocuments.unlinkedAt)));
  if (!link) return { ok: false, error: "not_found" };
  await tx.update(s.obligationDocuments).set({ unlinkedAt: new Date(), unlinkedByLabel: actor.label }).where(eq(s.obligationDocuments.id, link.id));
  await audit(tx, actor, [{ action: "update", entityType: "obligation", entityId: id, before: { linkedDocumentId: documentId }, after: { linkedDocumentId: null } }]);
  return { ok: true };
}

export interface I9Input {
  hireDate: string | null;
  section1On: string | null;
  section2On: string | null;
  workAuthExpiresOn: string | null;
}

/** The I-9 dates of one worker (dates only, decision J4); the I-9 duties follow at once. */
export async function recordI9(tx: Tx, actor: Actor, workerId: string, input: I9Input, today: string): Promise<ComplianceResult> {
  if (!(await mayActOn(tx, actor, "i9_section1"))) return { ok: false, error: "not_allowed" };
  if (!UUID.test(workerId)) return { ok: false, error: "not_found" };
  for (const [field, v] of Object.entries(input)) if (!dateOrNull(v)) return { ok: false, error: "invalid", field };
  // A completed date cannot be later than today; Section 2 cannot come before Section 1 (both may come
  // before the first day, once the job is accepted: M-274 3.0, 4.0).
  for (const field of ["section1On", "section2On"] as const) if (input[field] !== null && input[field]! > today) return { ok: false, error: "invalid", field };
  if (input.section2On !== null && input.section1On !== null && input.section2On < input.section1On) return { ok: false, error: "invalid", field: "section2On" };
  await lockCompliance(tx, actor.agencyId);
  const [w] = await tx.select().from(s.workers).where(eq(s.workers.id, workerId));
  if (!w) return { ok: false, error: "not_found" };
  const after = { hireDate: input.hireDate, i9Section1On: input.section1On, i9Section2On: input.section2On, workAuthExpiresOn: input.workAuthExpiresOn };
  const before = { hireDate: w.hireDate, i9Section1On: w.i9Section1On, i9Section2On: w.i9Section2On, workAuthExpiresOn: w.workAuthExpiresOn };
  if (JSON.stringify(before) === JSON.stringify(after)) return { ok: true };
  await tx.update(s.workers).set(after).where(eq(s.workers.id, workerId));
  await audit(tx, actor, [{ action: "update", entityType: "worker", entityId: workerId, before, after }]);
  // A changed end of the work authorization: the reverification for the old date is set aside by
  // whoever changed it, saying so (the new date gets its own).
  if (w.workAuthExpiresOn !== null && w.workAuthExpiresOn !== input.workAuthExpiresOn) {
    const [old] = await tx.select().from(s.obligations).where(and(eq(s.obligations.kind, "i9_reverify"), eq(s.obligations.workerId, workerId), eq(s.obligations.occurrence, w.workAuthExpiresOn), eq(s.obligations.status, "open")));
    if (old) {
      const note = input.workAuthExpiresOn ? `The work authorization's end was changed from ${w.workAuthExpiresOn} to ${input.workAuthExpiresOn}.` : `The work authorization's end (${w.workAuthExpiresOn}) was removed.`;
      const noteKey: Explain = { parts: [input.workAuthExpiresOn ? { key: "noteWorkAuthChanged", values: { from: { date: w.workAuthExpiresOn }, to: { date: input.workAuthExpiresOn } } } : { key: "noteWorkAuthRemoved", values: { from: { date: w.workAuthExpiresOn } } }], citation: null };
      await tx.update(s.obligations).set({ status: "not_applicable", statusNote: note, noteKey, doneAt: new Date(), doneBy: actor.userId, doneByLabel: actor.label, closedBySystem: false }).where(eq(s.obligations.id, old.id));
      await audit(tx, actor, [{ action: "update", entityType: "obligation", entityId: old.id, before: { status: "open" }, after: { status: "not_applicable", note, noteKey } }]);
    }
  }
  await syncObligations(tx, actor.agencyId, today);
  return { ok: true };
}

/** Reverified: this duty is done; the new end of the work authorization (if any) gives the next one. */
export async function recordReverification(tx: Tx, actor: Actor, obligationId: string, input: { reverifiedOn: string; nextExpiresOn: string | null }, today: string): Promise<ComplianceResult> {
  const r = await obligationFor(tx, actor, obligationId);
  if ("error" in r) return { ok: false, error: r.error! };
  if (r.o.kind !== "i9_reverify" || !r.o.workerId) return { ok: false, error: "not_found" };
  if (r.o.status !== "open") return { ok: false, error: "not_open" };
  if (!isIsoDate(input.reverifiedOn) || input.reverifiedOn > today) return { ok: false, error: "invalid", field: "reverifiedOn" };
  if (!dateOrNull(input.nextExpiresOn) || (input.nextExpiresOn !== null && input.nextExpiresOn <= input.reverifiedOn)) return { ok: false, error: "invalid", field: "nextExpiresOn" };
  const note = `Reverified on ${input.reverifiedOn}.`;
  const noteKey: Explain = { parts: [{ key: "noteReverified", values: { date: { date: input.reverifiedOn } } }], citation: null };
  await tx.update(s.obligations).set({ status: "done", statusNote: note, noteKey, doneAt: new Date(), doneBy: actor.userId, doneByLabel: actor.label, closedBySystem: false }).where(eq(s.obligations.id, obligationId));
  await audit(tx, actor, [{ action: "update", entityType: "obligation", entityId: obligationId, before: { status: "open" }, after: { status: "done", note, noteKey } }]);
  const [w] = await tx.select().from(s.workers).where(eq(s.workers.id, r.o.workerId));
  await tx.update(s.workers).set({ workAuthExpiresOn: input.nextExpiresOn }).where(eq(s.workers.id, r.o.workerId));
  await audit(tx, actor, [{ action: "update", entityType: "worker", entityId: r.o.workerId, before: { workAuthExpiresOn: w?.workAuthExpiresOn ?? null }, after: { workAuthExpiresOn: input.nextExpiresOn } }]);
  await syncObligations(tx, actor.agencyId, today);
  return { ok: true };
}

export interface RegistrationInput {
  jurisdiction: string;
  branchId: string | null;
  number: string;
  issuedOn: string | null;
  expiresOn: string;
  documentId: string | null;
}

export async function addRegistration(tx: Tx, actor: Actor, input: RegistrationInput, today: string): Promise<ComplianceResult> {
  if (!mayChangeComplianceSettings(actor)) return { ok: false, error: "not_allowed" };
  if (!["IL", "MA", "NJ"].includes(input.jurisdiction)) return { ok: false, error: "invalid", field: "jurisdiction" };
  if (!text(input.number, 60)) return { ok: false, error: "invalid", field: "number" };
  if (!dateOrNull(input.issuedOn)) return { ok: false, error: "invalid", field: "issuedOn" };
  if (!isIsoDate(input.expiresOn) || (input.issuedOn !== null && input.expiresOn < input.issuedOn)) return { ok: false, error: "invalid", field: "expiresOn" };
  await lockCompliance(tx, actor.agencyId);
  if (input.branchId !== null && (!UUID.test(input.branchId) || (await tx.select({ id: s.branches.id }).from(s.branches).where(eq(s.branches.id, input.branchId))).length === 0)) return { ok: false, error: "invalid", field: "branchId" };
  if (input.documentId !== null && (!UUID.test(input.documentId) || (await tx.select({ id: s.complianceDocuments.id }).from(s.complianceDocuments).where(eq(s.complianceDocuments.id, input.documentId))).length === 0)) return { ok: false, error: "invalid", field: "documentId" };
  const values = { jurisdiction: input.jurisdiction as "IL" | "MA" | "NJ", branchId: input.branchId, number: input.number.trim(), issuedOn: input.issuedOn, expiresOn: input.expiresOn, documentId: input.documentId };
  const [row] = await tx.insert(s.agencyRegistrations).values({ agencyId: actor.agencyId, ...values, createdBy: actor.userId, createdByLabel: actor.label }).returning({ id: s.agencyRegistrations.id });
  await audit(tx, actor, [{ action: "create", entityType: "agency_registration", entityId: row!.id, after: values }]);
  await syncObligations(tx, actor.agencyId, today);
  await linkCertificate(tx, actor, { registrationId: row!.id }, input.documentId);
  return { ok: true };
}

export interface PolicyInput {
  carrier: string;
  /** The insurer's address and phone (for Massachusetts job orders); optional. */
  carrierContact: string | null;
  policyNumber: string;
  states: string[];
  startsOn: string;
  endsOn: string;
  auditDueOn: string | null;
  documentId: string | null;
}

export async function addPolicy(tx: Tx, actor: Actor, input: PolicyInput, today: string): Promise<ComplianceResult> {
  if (!mayChangeComplianceSettings(actor)) return { ok: false, error: "not_allowed" };
  if (!text(input.carrier, 120)) return { ok: false, error: "invalid", field: "carrier" };
  if (!text(input.policyNumber, 60)) return { ok: false, error: "invalid", field: "policyNumber" };
  if (input.carrierContact !== null && (typeof input.carrierContact !== "string" || input.carrierContact.trim().length > 500)) return { ok: false, error: "invalid", field: "carrierContact" };
  if (!Array.isArray(input.states) || input.states.length > 60 || !input.states.every((x) => typeof x === "string" && /^[A-Z]{2}$/.test(x))) return { ok: false, error: "invalid", field: "states" };
  if (!isIsoDate(input.startsOn)) return { ok: false, error: "invalid", field: "startsOn" };
  if (!isIsoDate(input.endsOn) || input.endsOn < input.startsOn) return { ok: false, error: "invalid", field: "endsOn" };
  if (!dateOrNull(input.auditDueOn)) return { ok: false, error: "invalid", field: "auditDueOn" };
  await lockCompliance(tx, actor.agencyId);
  if (input.documentId !== null && (!UUID.test(input.documentId) || (await tx.select({ id: s.complianceDocuments.id }).from(s.complianceDocuments).where(eq(s.complianceDocuments.id, input.documentId))).length === 0)) return { ok: false, error: "invalid", field: "documentId" };
  const values = { carrier: input.carrier.trim(), carrierContact: input.carrierContact?.trim() || null, policyNumber: input.policyNumber.trim(), states: [...new Set(input.states)].sort(), startsOn: input.startsOn, endsOn: input.endsOn, auditDueOn: input.auditDueOn, documentId: input.documentId };
  const [row] = await tx.insert(s.wcPolicies).values({ agencyId: actor.agencyId, ...values, createdBy: actor.userId, createdByLabel: actor.label }).returning({ id: s.wcPolicies.id });
  await audit(tx, actor, [{ action: "create", entityType: "wc_policy", entityId: row!.id, after: values }]);
  await syncObligations(tx, actor.agencyId, today);
  await linkCertificate(tx, actor, { policyId: row!.id }, input.documentId);
  return { ok: true };
}

/** A registration's certificate or a policy's file is evidence for the duties it starts. */
async function linkCertificate(tx: Tx, actor: Actor, subject: { registrationId: string } | { policyId: string }, documentId: string | null) {
  if (documentId === null) return;
  const where = "registrationId" in subject ? eq(s.obligations.registrationId, subject.registrationId) : eq(s.obligations.policyId, subject.policyId);
  for (const o of await tx.select({ id: s.obligations.id }).from(s.obligations).where(where)) await linkDocument(tx, actor, o.id, documentId);
}

/** A compliance setting from today: today's row replaced, else the one before ends yesterday. */
export async function setFromToday(tx: Tx, actor: Actor, key: string, value: unknown, today: string) {
  const rows = await tx.select().from(s.agencySettings).where(eq(s.agencySettings.key, key));
  const current = rows.find((r) => r.effectiveTo === null);
  if (current && current.effectiveFrom === today) await tx.update(s.agencySettings).set({ value }).where(eq(s.agencySettings.id, current.id));
  else {
    if (current) await tx.update(s.agencySettings).set({ effectiveTo: addDays(today, -1) }).where(eq(s.agencySettings.id, current.id));
    await tx.insert(s.agencySettings).values({ agencyId: actor.agencyId, key, value, effectiveFrom: today });
  }
  await audit(tx, actor, [{ action: "update", entityType: "agency_setting", entityId: actor.agencyId, before: current ? { key, value: current.value } : null, after: { key, value } }]);
}

/** The Department's multilingual statement sent with each Massachusetts job order (454 CMR 24.08). */
export async function setMaStatement(tx: Tx, actor: Actor, documentId: string, today: string): Promise<ComplianceResult> {
  if (!mayChangeComplianceSettings(actor)) return { ok: false, error: "not_allowed" };
  if (!UUID.test(documentId)) return { ok: false, error: "not_found" };
  await lockCompliance(tx, actor.agencyId);
  if ((await tx.select({ id: s.complianceDocuments.id }).from(s.complianceDocuments).where(eq(s.complianceDocuments.id, documentId))).length === 0) return { ok: false, error: "not_found" };
  await setFromToday(tx, actor, MA_STATEMENT_KEY, { documentId }, today);
  return { ok: true };
}

/** The Department of Labor Standards' contact details printed on each Massachusetts job order (M.G.L. c. 149 § 159C(b)). */
export const MA_CONTACT_KEY = "compliance.ma_department_contact";

export async function setMaContact(tx: Tx, actor: Actor, contact: unknown, today: string): Promise<ComplianceResult> {
  if (!mayChangeComplianceSettings(actor)) return { ok: false, error: "not_allowed" };
  if (!text(contact, 500)) return { ok: false, error: "invalid", field: "contact" };
  await lockCompliance(tx, actor.agencyId);
  await setFromToday(tx, actor, MA_CONTACT_KEY, (contact as string).trim(), today);
  return { ok: true };
}

/**
 * The weekend days the agency is open (Owner), from today: they count as business days for Form I-9
 * Section 2 (Monday to Friday always do; holidays are never skipped — the earlier, safe date).
 */
export async function setOpenWeekendDays(tx: Tx, actor: Actor, days: unknown, today: string): Promise<ComplianceResult> {
  if (!mayChangeComplianceSettings(actor)) return { ok: false, error: "not_allowed" };
  if (!Array.isArray(days) || days.length > 2 || !days.every((d) => d === 0 || d === 6)) return { ok: false, error: "invalid", field: "days" };
  await lockCompliance(tx, actor.agencyId);
  const weekdays = [...new Set([1, 2, 3, 4, 5, ...(days as number[])])].sort((a, b) => a - b);
  const current = await tx.select().from(s.agencySettings).where(and(eq(s.agencySettings.key, OPEN_DAYS_KEY), isNull(s.agencySettings.effectiveTo)));
  if (JSON.stringify(current[0]?.value ?? [1, 2, 3, 4, 5]) === JSON.stringify(weekdays)) return { ok: true };
  await setFromToday(tx, actor, OPEN_DAYS_KEY, weekdays, today);
  await syncObligations(tx, actor.agencyId, today);
  return { ok: true };
}
