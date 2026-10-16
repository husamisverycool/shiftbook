"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addObligationFile, addObligationNote, addPolicy, addRegistration, closeObligation, mayChangeComplianceSettings, recordI9, recordReverification, reopenObligation, setMaStatement, setObligationOwner, storeComplianceDocument, unlinkObligationFile, type ComplianceResult } from "@/server/compliance/service";
import { withAgency } from "@/server/db";
import { PeriodBusyError } from "@/server/run/period-lock";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";
import { documentStore } from "@/server/storage";

/** Compliance actions (slice j; docs/patterns/compliance*.md, settings/compliance.md). Shapes here; rules in the service. */
export type ComplianceActionResult = ComplianceResult | { ok: false; error: "busy" | "generic" };

const id = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateOrNull = isoDate.nullable();

async function guarded(fn: () => Promise<ComplianceResult>): Promise<ComplianceActionResult> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    throw error;
  } finally {
    for (const path of ["/[locale]/(app)/compliance", "/[locale]/(app)/compliance/[id]", "/[locale]/(app)/compliance/calendar", "/[locale]/(app)/settings/compliance"]) revalidatePath(path, "page");
    revalidatePath("/[locale]/(app)", "layout");
  }
}

const run = (fn: (tx: Parameters<Parameters<typeof withAgency>[1]>[0], actor: ReturnType<typeof currentActor>, today: string) => Promise<ComplianceResult>) => {
  const actor = currentActor();
  return guarded(() => withAgency(actor.agencyId, async (tx) => fn(tx, actor, await agencyToday(tx))));
};

export async function setOwnerAction(obligationId: string, userId: string | null): Promise<ComplianceActionResult> {
  if (!id.safeParse(obligationId).success || (userId !== null && !id.safeParse(userId).success)) return { ok: false, error: "generic" };
  return run((tx, actor) => setObligationOwner(tx, actor, obligationId, userId));
}

export async function closeAction(obligationId: string, status: "done" | "not_applicable", note: string | null): Promise<ComplianceActionResult> {
  if (!id.safeParse(obligationId).success || !["done", "not_applicable"].includes(status) || (note !== null && typeof note !== "string")) return { ok: false, error: "generic" };
  return run((tx, actor) => closeObligation(tx, actor, obligationId, status, note));
}

export async function reopenAction(obligationId: string): Promise<ComplianceActionResult> {
  if (!id.safeParse(obligationId).success) return { ok: false, error: "generic" };
  return run((tx, actor) => reopenObligation(tx, actor, obligationId));
}

export async function addNoteAction(obligationId: string, body: string): Promise<ComplianceActionResult> {
  if (!id.safeParse(obligationId).success || typeof body !== "string" || body.length > 4000) return { ok: false, error: "generic" };
  return run((tx, actor) => addObligationNote(tx, actor, obligationId, body));
}

/** One file with its effective date (FormData: file, effectiveOn). */
export async function addFileAction(obligationId: string, form: FormData): Promise<ComplianceActionResult> {
  const file = form instanceof FormData ? form.get("file") : null;
  const effectiveOn = form instanceof FormData ? form.get("effectiveOn") : null;
  if (!id.safeParse(obligationId).success || !(file instanceof File) || typeof effectiveOn !== "string") return { ok: false, error: "generic" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  return run((tx, actor) => addObligationFile(tx, actor, documentStore, obligationId, { filename: file.name, bytes, effectiveOn }));
}

export async function unlinkFileAction(obligationId: string, documentId: string): Promise<ComplianceActionResult> {
  if (!id.safeParse(obligationId).success || !id.safeParse(documentId).success) return { ok: false, error: "generic" };
  return run((tx, actor) => unlinkObligationFile(tx, actor, obligationId, documentId));
}

const I9Schema = z.object({ hireDate: dateOrNull, section1On: dateOrNull, section2On: dateOrNull, workAuthExpiresOn: dateOrNull }).strict();

export async function recordI9Action(workerId: string, input: unknown): Promise<ComplianceActionResult> {
  const parsed = I9Schema.safeParse(input);
  if (!id.safeParse(workerId).success || !parsed.success) return { ok: false, error: "generic" };
  return run((tx, actor, today) => recordI9(tx, actor, workerId, parsed.data, today));
}

export async function reverifyAction(obligationId: string, reverifiedOn: string, nextExpiresOn: string | null): Promise<ComplianceActionResult> {
  if (!id.safeParse(obligationId).success || !isoDate.safeParse(reverifiedOn).success || !dateOrNull.safeParse(nextExpiresOn).success) return { ok: false, error: "generic" };
  return run((tx, actor, today) => recordReverification(tx, actor, obligationId, { reverifiedOn, nextExpiresOn }, today));
}

/**
 * A registration, a policy or the Massachusetts statement with its file (FormData: the fields as JSON
 * in "data", and "file"). Only the Owner; the fields are checked before the file is kept.
 */
async function withFile<T>(form: FormData, schema: z.ZodType<T>, save: (tx: Parameters<Parameters<typeof withAgency>[1]>[0], actor: ReturnType<typeof currentActor>, today: string, data: T, documentId: string | null) => Promise<ComplianceResult>, fileRequired = false): Promise<ComplianceActionResult> {
  if (!(form instanceof FormData)) return { ok: false, error: "generic" };
  if (!mayChangeComplianceSettings(currentActor())) return { ok: false, error: "not_allowed" };
  const raw = form.get("data");
  const file = form.get("file");
  let json: unknown = {};
  try {
    json = typeof raw === "string" ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, error: "generic" };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { ok: false, error: "invalid", field: String(parsed.error.issues[0]?.path[0] ?? "form") };
  const upload = file instanceof File && file.size > 0 ? file : null;
  if (fileRequired && !upload) return { ok: false, error: "invalid", field: "file" };
  const bytes = upload ? new Uint8Array(await upload.arrayBuffer()) : null;
  return run(async (tx, actor, today) => {
    let documentId: string | null = null;
    if (upload && bytes) {
      const doc = await storeComplianceDocument(tx, actor, documentStore, { filename: upload.name, bytes, effectiveOn: today }, "upload");
      if (!doc.ok) return doc;
      documentId = doc.id;
    }
    return save(tx, actor, today, parsed.data, documentId);
  });
}

const RegistrationSchema = z.object({ jurisdiction: z.string().max(2), branchId: id.nullable(), number: z.string().max(200), issuedOn: dateOrNull, expiresOn: isoDate }).strict();
const PolicySchema = z.object({ carrier: z.string().max(400), policyNumber: z.string().max(200), states: z.array(z.string().max(2)).max(60), startsOn: isoDate, endsOn: isoDate, auditDueOn: dateOrNull }).strict();

export async function addRegistrationAction(form: FormData): Promise<ComplianceActionResult> {
  return withFile(form, RegistrationSchema, (tx, actor, today, data, documentId) => addRegistration(tx, actor, { ...data, documentId }, today));
}

export async function addPolicyAction(form: FormData): Promise<ComplianceActionResult> {
  return withFile(form, PolicySchema, (tx, actor, today, data, documentId) => addPolicy(tx, actor, { ...data, documentId }, today));
}

export async function setMaStatementAction(form: FormData): Promise<ComplianceActionResult> {
  return withFile(form, z.object({}).strict(), (tx, actor, today, _data, documentId) => setMaStatement(tx, actor, documentId!, today), true);
}
