"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setAssignmentPo, type PoResult } from "@/server/catalog/billing";
import { cancelAssignment, createAssignment, endAssignments, setAssignmentDates, type AssignmentResult } from "@/server/catalog/assignments";
import { createJobOrder, updateJobOrder, type JobOrderInput, type JobOrderResult } from "@/server/catalog/job-orders";
import { addRateVersion, deleteRateVersion, editRateVersion, type RateResult } from "@/server/catalog/rate-cards";
import type { RateInput } from "@/server/catalog/versions";
import { syncObligations } from "@/server/compliance/sync";
import { withAgency, type Tx } from "@/server/db";
import { setRecruiter, type MarginResult } from "@/server/margin/service";
import { PeriodBusyError } from "@/server/run/period-lock";
import { actorAllowedTo } from "@/server/session";
import { agencyToday } from "@/server/settings";

// Every input is checked against its shape here: a hand-made request gets the same refusal as a bad form.
const id = z.uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const whole = z.number().int();
const fraction = z.object({ num: whole, den: whole }).strict();
const RateSchema = z
  .object({
    effectiveFrom: isoDate,
    payRateCents: whole,
    bill: z.union([z.object({ rateCents: whole }).strict(), z.object({ markupBp: whole }).strict()]),
    otMultiplier: fraction,
    dtMultiplier: fraction,
    wcClassCode: z.string().max(12).nullable(),
  })
  .strict();
const JobOrderSchema = z
  .object({
    clientId: id,
    worksiteId: id,
    position: z.string().max(200),
    socCode: z.string().max(20).nullable(),
    shift: z.string().max(100).nullable(),
    headcount: whole,
    payMinCents: whole.nullable(),
    payMaxCents: whole.nullable(),
    prevailingWage: z.boolean(),
    branchId: id.nullable().optional(),
  })
  .strict();
const AssignmentSchema = z.object({ workerId: id, jobOrderId: id, startDate: isoDate, endDate: isoDate.nullable() }).strict();
const DatesSchema = z.object({ startDate: isoDate, endDate: isoDate.nullable() }).strict();
const RefSchema = z.union([z.object({ jobOrderId: id }).strict(), z.object({ assignmentId: id }).strict()]);
const strings = z.array(z.string().max(500)).max(20);
const refresh = () => {
  revalidatePath("/[locale]/(app)/job-orders", "page");
  revalidatePath("/[locale]/(app)/job-orders/[id]", "page");
  revalidatePath("/[locale]/(app)/assignments", "page");
  // The sidebar's compliance badge.
  revalidatePath("/[locale]/(app)", "layout");
};

/** A placement or job order change, then the compliance duties it calls for, in the same transaction. */
const withDuties = <T>(agencyId: string, fn: (tx: Tx) => Promise<T>) =>
  withAgency(agencyId, async (tx) => {
    const result = await fn(tx);
    await syncObligations(tx, agencyId, await agencyToday(tx));
    return result;
  });

/** A busy catalog (files being created right now) is a plain refusal; anything else is a real error. */
async function run<T>(fn: () => Promise<T>): Promise<T | { ok: false; error: "busy" }> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    throw error;
  } finally {
    refresh();
  }
}

export async function createJobOrderAction(raw: JobOrderInput): Promise<JobOrderResult | { ok: false; error: "busy" }> {
  const actor = await actorAllowedTo("placements");
  const input = JobOrderSchema.safeParse(raw);
  if (!input.success) return { ok: false, error: "invalid", fields: [] };
  return run(() => withDuties(actor.agencyId, (tx) => createJobOrder(tx, actor, input.data)));
}

export async function updateJobOrderAction(jobOrderId: string, raw: JobOrderInput): Promise<JobOrderResult | { ok: false; error: "busy" }> {
  const actor = await actorAllowedTo("placements");
  const input = JobOrderSchema.safeParse(raw);
  if (!input.success || !id.safeParse(jobOrderId).success) return { ok: false, error: "invalid", fields: [] };
  return run(() => withDuties(actor.agencyId, (tx) => updateJobOrder(tx, actor, jobOrderId, input.data)));
}

export async function addRateAction(rawRef: { jobOrderId: string } | { assignmentId: string }, raw: RateInput): Promise<RateResult | { ok: false; error: "busy" }> {
  const actor = await actorAllowedTo("placements");
  const ref = RefSchema.safeParse(rawRef);
  const input = RateSchema.safeParse(raw);
  if (!ref.success || !input.success) return { ok: false, error: "invalid", problems: [] };
  return run(() => withAgency(actor.agencyId, (tx) => addRateVersion(tx, actor, ref.data, input.data)));
}

export async function editRateAction(versionId: string, raw: RateInput, reasons: string[], note: string): Promise<RateResult | { ok: false; error: "busy" }> {
  const actor = await actorAllowedTo("placements");
  const input = RateSchema.safeParse(raw);
  if (!input.success || !id.safeParse(versionId).success || !strings.safeParse(reasons).success || typeof note !== "string") return { ok: false, error: "invalid", problems: [] };
  return run(() => withAgency(actor.agencyId, (tx) => editRateVersion(tx, actor, versionId, input.data, reasons, note.slice(0, 2000))));
}

export async function deleteRateAction(versionId: string): Promise<RateResult | { ok: false; error: "busy" }> {
  const actor = await actorAllowedTo("placements");
  if (!id.safeParse(versionId).success) return { ok: false, error: "not_found" };
  return run(() => withAgency(actor.agencyId, (tx) => deleteRateVersion(tx, actor, versionId)));
}

export async function createAssignmentAction(raw: { workerId: string; jobOrderId: string; startDate: string; endDate: string | null }): Promise<AssignmentResult | { ok: false; error: "busy" }> {
  const actor = await actorAllowedTo("placements");
  // Only these four fields: an import's source id can never be set from here.
  const input = AssignmentSchema.safeParse(raw);
  if (!input.success) return { ok: false, error: "invalid_date" };
  return run(() => withDuties(actor.agencyId, (tx) => createAssignment(tx, actor, input.data)));
}

export async function setAssignmentDatesAction(assignmentId: string, raw: { startDate: string; endDate: string | null }): Promise<AssignmentResult | { ok: false; error: "busy" }> {
  const actor = await actorAllowedTo("placements");
  const dates = DatesSchema.safeParse(raw);
  if (!dates.success || !id.safeParse(assignmentId).success) return { ok: false, error: "invalid_date" };
  return run(() => withDuties(actor.agencyId, (tx) => setAssignmentDates(tx, actor, assignmentId, dates.data)));
}

export async function endAssignmentsAction(ids: string[], endDate: string): Promise<{ ended: string[]; refused: { id: string; error: string }[] } | { ok: false; error: "busy" }> {
  const actor = await actorAllowedTo("placements");
  if (!z.array(id).max(1000).safeParse(ids).success || !isoDate.safeParse(endDate).success) return { ended: [], refused: [] };
  return run(() => withDuties(actor.agencyId, (tx) => endAssignments(tx, actor, ids, endDate)));
}

export async function cancelAssignmentAction(assignmentId: string, reason: string): Promise<AssignmentResult | { ok: false; error: "busy" }> {
  const actor = await actorAllowedTo("placements");
  if (!id.safeParse(assignmentId).success || typeof reason !== "string") return { ok: false, error: "not_found" };
  return run(() => withDuties(actor.agencyId, (tx) => cancelAssignment(tx, actor, assignmentId, reason.slice(0, 2000))));
}

/** The client's PO for one placement (slice g, decision G4); empty means the client's own PO. */
export async function setRecruiterAction(assignmentId: string, userId: string | null): Promise<MarginResult | { ok: false; error: "busy" }> {
  const actor = await actorAllowedTo("placements");
  if (!id.safeParse(assignmentId).success || (userId !== null && !id.safeParse(userId).success)) return { ok: false, error: "not_found" };
  return run(() => withAgency(actor.agencyId, (tx) => setRecruiter(tx, actor, assignmentId, userId)));
}

export async function setAssignmentPoAction(assignmentId: string, poNumber: string): Promise<PoResult | { ok: false; error: "busy" }> {
  const actor = await actorAllowedTo("placements");
  if (!id.safeParse(assignmentId).success || !z.string().max(200).safeParse(poNumber).success) return { ok: false, error: "not_found" };
  return run(() => withAgency(actor.agencyId, (tx) => setAssignmentPo(tx, actor, assignmentId, poNumber)));
}
