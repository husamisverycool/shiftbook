"use server";

/** The worker roster (slice k step 2, decision 0027): every change names who may make it; the SSN's reveal and change ask "confirm it's you". */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appKey } from "@/server/auth/crypto";
import { withAgency } from "@/server/db";
import { MAX_EVIDENCE_BYTES } from "@/server/compliance/service";
import { WORKER_DOCUMENT_KINDS } from "@/server/db/schema";
import { actorAllowedTo, mustConfirmNow } from "@/server/session";
import { agencyToday } from "@/server/settings";
import { documentStore } from "@/server/storage";
import { fileGrant } from "@/server/workers/file-grant";
import { addWorkerDocument, createWorker, endEmployment, openWorkerDocument, rehire, removeWorkerDocument, revealSsn, setSsn, setWorkerPayrollNumber, updatePersonal, type WorkerResult } from "@/server/workers/service";

const id = z.uuid();
const text = z.string().max(500);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const SYSTEMS = ["gusto", "qbd", "qbo", "adp_wfn", "adp_run", "paychex", "paylocity", "spreadsheet"] as const;

export type WorkerActionResult<T = object> = WorkerResult<T> | { ok: false; error: "confirm" | "generic" | "taken"; by?: string } | { ok: false; error: "invalid"; problems: { field: string; rule: string; message: string }[] };

const refresh = () => {
  revalidatePath("/[locale]/(app)/workers", "page");
  revalidatePath("/[locale]/(app)/workers/[id]", "page");
};

const PersonalSchema = z.object({ firstName: text, lastName: text, preferredLanguage: z.enum(["en", "es"]) }).strict();
const NewSchema = PersonalSchema.extend({ hireDate: isoDate.nullable() }).strict();

export async function createWorkerAction(input: unknown): Promise<WorkerActionResult<{ id: string }>> {
  const actor = await actorAllowedTo("workers");
  const parsed = NewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", field: String(parsed.error.issues[0]?.path[0] ?? "form") };
  const r = await withAgency(actor.agencyId, (tx) => createWorker(tx, actor, parsed.data));
  refresh();
  return r;
}

export async function updatePersonalAction(workerId: string, input: unknown): Promise<WorkerActionResult> {
  const actor = await actorAllowedTo("workers");
  const parsed = PersonalSchema.safeParse(input);
  if (!id.safeParse(workerId).success) return { ok: false, error: "not_found" };
  if (!parsed.success) return { ok: false, error: "invalid", field: String(parsed.error.issues[0]?.path[0] ?? "form") };
  const r = await withAgency(actor.agencyId, (tx) => updatePersonal(tx, actor, workerId, parsed.data));
  refresh();
  return r;
}

/** Enters or replaces the SSN (it changes who is paid and reported: confirm it's you first). */
export async function setSsnAction(workerId: string, value: string): Promise<WorkerActionResult> {
  const actor = await actorAllowedTo("workers");
  if (!id.safeParse(workerId).success || !z.string().max(40).safeParse(value).success) return { ok: false, error: "invalid", field: "ssn", rule: "format" };
  if (await mustConfirmNow()) return { ok: false, error: "confirm" };
  const r = await withAgency(actor.agencyId, (tx) => setSsn(tx, actor, workerId, value, appKey()));
  refresh();
  return r;
}

/** Toast's Retrieve SSN: the Owner, a reason, confirmed recently; the number goes only in this answer. */
export async function revealSsnAction(workerId: string, reason: string): Promise<WorkerActionResult<{ ssn: string }>> {
  const actor = await actorAllowedTo("revealSsn");
  if (!id.safeParse(workerId).success) return { ok: false, error: "not_found" };
  if (!text.safeParse(reason).success) return { ok: false, error: "invalid", field: "reason" };
  if (await mustConfirmNow()) return { ok: false, error: "confirm" };
  const r = await withAgency(actor.agencyId, (tx) => revealSsn(tx, actor, workerId, reason, appKey()));
  // The list of who looked shows the new look.
  refresh();
  return r;
}

export async function setPayrollNumberAction(workerId: string, system: string, value: string, title?: string): Promise<WorkerActionResult> {
  const actor = await actorAllowedTo("employment");
  if (!id.safeParse(workerId).success || !(SYSTEMS as readonly string[]).includes(system) || !text.safeParse(value).success || (title !== undefined && !text.safeParse(title).success)) return { ok: false, error: "generic" };
  const r = await withAgency(actor.agencyId, (tx) => setWorkerPayrollNumber(tx, actor, workerId, system as (typeof SYSTEMS)[number], value, title));
  refresh();
  return r as WorkerActionResult;
}

export async function endEmploymentAction(workerId: string, endedOn: string): Promise<WorkerActionResult> {
  const actor = await actorAllowedTo("employment");
  if (!id.safeParse(workerId).success || !isoDate.safeParse(endedOn).success) return { ok: false, error: "invalid", field: "endedOn" };
  const r = await withAgency(actor.agencyId, async (tx) => endEmployment(tx, actor, workerId, endedOn, await agencyToday(tx)));
  refresh();
  return r;
}

export async function rehireAction(workerId: string): Promise<WorkerActionResult> {
  const actor = await actorAllowedTo("employment");
  if (!id.safeParse(workerId).success) return { ok: false, error: "not_found" };
  const r = await withAgency(actor.agencyId, (tx) => rehire(tx, actor, workerId));
  refresh();
  return r;
}

/** One file with its kind and effective date (FormData: file, kind, effectiveOn). */
export async function addDocumentAction(workerId: string, form: FormData): Promise<WorkerActionResult<{ id: string }>> {
  const actor = await actorAllowedTo("workers");
  const file = form instanceof FormData ? form.get("file") : null;
  const kind = form instanceof FormData ? form.get("kind") : null;
  const effectiveOn = form instanceof FormData ? form.get("effectiveOn") : null;
  if (!id.safeParse(workerId).success || !(file instanceof File) || typeof kind !== "string" || !(WORKER_DOCUMENT_KINDS as readonly string[]).includes(kind) || typeof effectiveOn !== "string") return { ok: false, error: "invalid", field: "form" };
  // The same limit as every stored file (the service checks it again).
  if (file.size > MAX_EVIDENCE_BYTES) return { ok: false, error: "invalid", field: "file_size" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  let stored: string | null = null;
  try {
    const r = await withAgency(actor.agencyId, async (tx) => {
      const added = await addWorkerDocument(tx, actor, documentStore, workerId, { filename: file.name, bytes, kind, effectiveOn });
      if (added.ok) stored = added.storageKey;
      return added;
    });
    refresh();
    return r.ok ? { ok: true, id: r.id } : r;
  } catch (error) {
    // The record rolled back: the stored bytes go too.
    if (stored) await documentStore.removePrefix(stored);
    throw error;
  }
}

export async function removeDocumentAction(workerId: string, linkId: string): Promise<WorkerActionResult> {
  const actor = await actorAllowedTo("workers");
  if (!id.safeParse(workerId).success || !id.safeParse(linkId).success) return { ok: false, error: "not_found" };
  const r = await withAgency(actor.agencyId, (tx) => removeWorkerDocument(tx, actor, workerId, linkId));
  refresh();
  return r;
}

/**
 * Opens a worker's file (it holds the SSN or bank details): the Owner, a reason, confirmed recently;
 * the opening is recorded, then a two-minute address for this person and this file comes back.
 */
export async function openDocumentAction(workerId: string, linkId: string, reason: string): Promise<WorkerActionResult<{ url: string }>> {
  const actor = await actorAllowedTo("revealSsn");
  if (!id.safeParse(workerId).success || !id.safeParse(linkId).success) return { ok: false, error: "not_found" };
  if (!text.safeParse(reason).success) return { ok: false, error: "invalid", field: "reason" };
  if (await mustConfirmNow()) return { ok: false, error: "confirm" };
  const r = await withAgency(actor.agencyId, (tx) => openWorkerDocument(tx, actor, workerId, linkId, reason));
  if (!r.ok) return r;
  refresh();
  const grant = fileGrant(appKey(), linkId, actor.userId, Math.floor(Date.now() / 1000));
  return { ok: true, url: `/api/files/worker/${linkId}?expires=${grant.expires}&signature=${grant.signature}` };
}
