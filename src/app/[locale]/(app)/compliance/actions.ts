"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addObligationFile, addObligationNote, addPolicy, addRegistration, closeObligation, recordI9, recordReverification, reopenObligation, setMaContact, setMaStatement, setObligationOwner, setOpenWeekendDays, storeComplianceDocument, unlinkObligationFile, type ComplianceResult } from "@/server/compliance/service";
import { addOpeningBalance, removeOpeningBalance } from "@/server/compliance/counter-balances";
import { importAcaHours, setAcaSettings, type ImportResult } from "@/server/compliance/aca-service";
import { removeEqualPayRate, setEqualPayRate } from "@/server/compliance/equal-pay-rates";
import { createJobOrderNotice, createPacketDocument, createProofPage, saveNoticeDetails } from "@/server/compliance/documents";
import { withAgency } from "@/server/db";
import { PeriodBusyError } from "@/server/run/period-lock";
import { actorAllowedTo, type Actor } from "@/server/session";
import type { Ability } from "@/server/permissions";
import { agencyToday } from "@/server/settings";
import { documentStore } from "@/server/storage";

/** Compliance actions (slice j; docs/patterns/compliance*.md, settings/compliance.md). Shapes here; rules in the service. */
export type ComplianceActionResult = ComplianceResult | { ok: false; error: "busy" | "generic" };

const id = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateOrNull = isoDate.nullable();

async function guarded<T>(fn: () => Promise<T>): Promise<T | { ok: false; error: "busy" }> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    throw error;
  } finally {
    for (const path of ["/[locale]/(app)/compliance", "/[locale]/(app)/compliance/[id]", "/[locale]/(app)/compliance/calendar", "/[locale]/(app)/compliance/counters", "/[locale]/(app)/compliance/aca", "/[locale]/(app)/settings/compliance"]) revalidatePath(path, "page");
    revalidatePath("/[locale]/(app)", "layout");
  }
}

/** Runs a change as the signed-in person, when their role may (duties: "compliance"; the agency's own records: "settings"). */
const run = async (ability: Ability, fn: (tx: Parameters<Parameters<typeof withAgency>[1]>[0], actor: Actor, today: string) => Promise<ComplianceResult>) => {
  const actor = await actorAllowedTo(ability);
  return guarded(() => withAgency(actor.agencyId, async (tx) => fn(tx, actor, await agencyToday(tx))));
};

export async function setOwnerAction(obligationId: string, userId: string | null): Promise<ComplianceActionResult> {
  if (!id.safeParse(obligationId).success || (userId !== null && !id.safeParse(userId).success)) return { ok: false, error: "generic" };
  return run("compliance", (tx, actor) => setObligationOwner(tx, actor, obligationId, userId));
}

export async function closeAction(obligationId: string, status: "done" | "not_applicable", note: string | null): Promise<ComplianceActionResult> {
  if (!id.safeParse(obligationId).success || !["done", "not_applicable"].includes(status) || (note !== null && typeof note !== "string")) return { ok: false, error: "generic" };
  return run("compliance", (tx, actor) => closeObligation(tx, actor, obligationId, status, note));
}

export async function reopenAction(obligationId: string): Promise<ComplianceActionResult> {
  if (!id.safeParse(obligationId).success) return { ok: false, error: "generic" };
  return run("compliance", (tx, actor) => reopenObligation(tx, actor, obligationId));
}

export async function addNoteAction(obligationId: string, body: string): Promise<ComplianceActionResult> {
  if (!id.safeParse(obligationId).success || typeof body !== "string" || body.length > 4000) return { ok: false, error: "generic" };
  return run("compliance", (tx, actor) => addObligationNote(tx, actor, obligationId, body));
}

/** One file with its effective date (FormData: file, effectiveOn). */
export async function addFileAction(obligationId: string, form: FormData): Promise<ComplianceActionResult> {
  const file = form instanceof FormData ? form.get("file") : null;
  const effectiveOn = form instanceof FormData ? form.get("effectiveOn") : null;
  if (!id.safeParse(obligationId).success || !(file instanceof File) || typeof effectiveOn !== "string") return { ok: false, error: "generic" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  return run("compliance", (tx, actor) => addObligationFile(tx, actor, documentStore, obligationId, { filename: file.name, bytes, effectiveOn }));
}

export async function unlinkFileAction(obligationId: string, documentId: string): Promise<ComplianceActionResult> {
  if (!id.safeParse(obligationId).success || !id.safeParse(documentId).success) return { ok: false, error: "generic" };
  return run("compliance", (tx, actor) => unlinkObligationFile(tx, actor, obligationId, documentId));
}

const I9Schema = z.object({ hireDate: dateOrNull, section1On: dateOrNull, section2On: dateOrNull, workAuthExpiresOn: dateOrNull }).strict();

export async function recordI9Action(workerId: string, input: unknown): Promise<ComplianceActionResult> {
  const parsed = I9Schema.safeParse(input);
  if (!id.safeParse(workerId).success || !parsed.success) return { ok: false, error: "generic" };
  return run("compliance", (tx, actor, today) => recordI9(tx, actor, workerId, parsed.data, today));
}

export async function reverifyAction(obligationId: string, reverifiedOn: string, nextExpiresOn: string | null): Promise<ComplianceActionResult> {
  if (!id.safeParse(obligationId).success || !isoDate.safeParse(reverifiedOn).success || !dateOrNull.safeParse(nextExpiresOn).success) return { ok: false, error: "generic" };
  return run("compliance", (tx, actor, today) => recordReverification(tx, actor, obligationId, { reverifiedOn, nextExpiresOn }, today));
}

/** A refusal after the file was kept: thrown so the transaction keeps nothing. */
class Refused extends Error {
  constructor(readonly result: ComplianceResult) {
    super("refused");
  }
}

/**
 * A registration, a policy or the Massachusetts statement with its file (FormData: the fields as JSON
 * in "data", and "file"). Only the Owner; the fields are checked before the file is kept, and a
 * refusal after it keeps nothing (the record rolls back and the stored bytes are removed).
 */
async function withFile<T>(ability: Ability, form: FormData, schema: z.ZodType<T>, save: (tx: Parameters<Parameters<typeof withAgency>[1]>[0], actor: Actor, today: string, data: T, documentId: string | null) => Promise<ComplianceResult>, fileRequired = false): Promise<ComplianceActionResult> {
  if (!(form instanceof FormData)) return { ok: false, error: "generic" };
  await actorAllowedTo(ability);
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
  let stored: string | null = null;
  try {
    return await run(ability, async (tx, actor, today) => {
      let documentId: string | null = null;
      if (upload && bytes) {
        const doc = await storeComplianceDocument(tx, actor, documentStore, { filename: upload.name, bytes, effectiveOn: today }, "upload");
        if (!doc.ok) return doc;
        documentId = doc.id;
        stored = doc.storageKey;
      }
      const result = await save(tx, actor, today, parsed.data, documentId);
      if (!result.ok && documentId) throw new Refused(result);
      return result;
    });
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
    if (stored) await documentStore.removePrefix(stored);
    return error.result;
  }
}

const RegistrationSchema = z.object({ jurisdiction: z.string().max(2), branchId: id.nullable(), number: z.string().max(200), issuedOn: dateOrNull, expiresOn: isoDate }).strict();
const PolicySchema = z.object({ carrier: z.string().max(400), carrierContact: z.string().max(1000).nullable(), policyNumber: z.string().max(200), states: z.array(z.string().max(2)).max(60), startsOn: isoDate, endsOn: isoDate, auditDueOn: dateOrNull }).strict();

export async function addRegistrationAction(form: FormData): Promise<ComplianceActionResult> {
  return withFile("settings", form, RegistrationSchema, (tx, actor, today, data, documentId) => addRegistration(tx, actor, { ...data, documentId }, today));
}

export async function addPolicyAction(form: FormData): Promise<ComplianceActionResult> {
  return withFile("settings", form, PolicySchema, (tx, actor, today, data, documentId) => addPolicy(tx, actor, { ...data, documentId }, today));
}

export async function setMaStatementAction(form: FormData): Promise<ComplianceActionResult> {
  return withFile("settings", form, z.object({}).strict(), (tx, actor, today, _data, documentId) => setMaStatement(tx, actor, documentId!, today), true);
}

/** Makes the duty's document (the proof page, the job order, the packet) and keeps it as evidence. */
export async function makeDocumentAction(obligationId: string, kind: string): Promise<ComplianceActionResult> {
  if (!id.safeParse(obligationId).success) return { ok: false, error: "generic" };
  const make = kind === "ma_job_order" ? createJobOrderNotice : kind === "wc_audit" ? createPacketDocument : kind === "il_client_proof" || kind === "il_client_proof_contract" ? createProofPage : null;
  if (!make) return { ok: false, error: "generic" };
  return run("compliance", (tx, actor, today) => make(tx, actor, documentStore, obligationId, today));
}

const NoticeSchema = z.object({ employerPhone: z.string().max(80), startTime: z.string().max(5), endTime: z.string().max(5), overtime: z.enum(["yes", "no", "possible"]), requirements: z.string().max(600), meals: z.string().max(600), transport: z.string().max(600), strike: z.boolean() }).strict();

export async function saveNoticeDetailsAction(obligationId: string, input: unknown): Promise<ComplianceActionResult> {
  const parsed = NoticeSchema.safeParse(input);
  if (!id.safeParse(obligationId).success || !parsed.success) return { ok: false, error: "generic" };
  return run("compliance", (tx, actor) => saveNoticeDetails(tx, actor, obligationId, parsed.data));
}

export async function setMaContactAction(contact: string): Promise<ComplianceActionResult> {
  if (typeof contact !== "string" || contact.length > 1000) return { ok: false, error: "generic" };
  return run("settings", (tx, actor, today) => setMaContact(tx, actor, contact, today));
}

export async function setOpenDaysAction(days: unknown): Promise<ComplianceActionResult> {
  if (!Array.isArray(days) || days.length > 2) return { ok: false, error: "generic" };
  return run("settings", (tx, actor, today) => setOpenWeekendDays(tx, actor, days, today));
}

const BalanceSchema = z.object({ workerId: id, clientId: id, minutes: z.number().int(), throughOn: isoDate, note: z.string().max(1000) }).strict();

/** Hours a worker did for a client before Shiftbook (the Owner). */
export async function addBalanceAction(input: unknown): Promise<ComplianceActionResult> {
  const parsed = BalanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", field: String(parsed.error.issues[0]?.path[0] ?? "form") };
  return run("settings", (tx, actor, today) => addOpeningBalance(tx, actor, parsed.data, today));
}

export async function removeBalanceAction(balanceId: string, reason: string): Promise<ComplianceActionResult> {
  if (!id.safeParse(balanceId).success || typeof reason !== "string" || reason.length > 1000) return { ok: false, error: "generic" };
  return run("settings", (tx, actor) => removeOpeningBalance(tx, actor, balanceId, reason));
}

const EqualPaySchema = z
  .object({
    effectiveFrom: isoDate,
    kind: z.enum(["rate", "asked"]),
    rateCents: z.number().int().nullable(),
    benefitsCents: z.number().int().nullable(),
    method: z.enum(["comparator", "closest_seniority", "survey_median", "survey_75th"]).nullable(),
    comparator: z.string().max(300).nullable(),
    note: z.string().max(500).nullable(),
  })
  .strict();

/** The Illinois equal-pay rate from a date, or that the client was asked (the Owner). */
export async function setEqualPayRateAction(obligationId: string, input: unknown): Promise<ComplianceActionResult> {
  const parsed = EqualPaySchema.safeParse(input);
  if (!id.safeParse(obligationId).success) return { ok: false, error: "generic" };
  if (!parsed.success) return { ok: false, error: "invalid", field: String(parsed.error.issues[0]?.path[0] ?? "form") };
  return run("compliance", (tx, actor, today) => setEqualPayRate(tx, actor, obligationId, parsed.data, today));
}

export async function removeEqualPayRateAction(obligationId: string, rateId: string, reason: string): Promise<ComplianceActionResult> {
  if (!id.safeParse(obligationId).success || !id.safeParse(rateId).success || typeof reason !== "string" || reason.length > 1000) return { ok: false, error: "generic" };
  return run("compliance", (tx, actor) => removeEqualPayRate(tx, actor, obligationId, rateId, reason));
}

const AcaSettingsSchema = z.object({ measurementMonths: z.number().int(), firstMonth: z.number().int(), adminDays: z.number().int(), stabilityMonths: z.number().int() }).strict();

/** The ACA measurement settings from today (the Owner). */
export async function setAcaSettingsAction(input: unknown): Promise<ComplianceActionResult> {
  const parsed = AcaSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", field: String(parsed.error.issues[0]?.path[0] ?? "form") };
  return run("settings", (tx, actor, today) => setAcaSettings(tx, actor, parsed.data, today));
}

/** At most a megabyte of CSV: 5,000 rows of a name, a month and hours fit with room to spare. */
const MAX_IMPORT_BYTES = 1_000_000;

/** Hours of service before Shiftbook, a CSV (FormData: file) — the Owner. */
export async function importAcaHoursAction(form: FormData): Promise<ImportResult | { ok: false; error: "busy" | "generic" | "too_large" }> {
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "generic" };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, error: "too_large" };
  const text = await file.text();
  const actor = await actorAllowedTo("settings");
  return guarded(() => withAgency(actor.agencyId, async (tx) => importAcaHours(tx, actor, file.name, text, await agencyToday(tx))));
}
