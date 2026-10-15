"use server";

import { revalidatePath } from "next/cache";
import { cancelAssignment, createAssignment, endAssignments, setAssignmentDates, type AssignmentResult } from "@/server/catalog/assignments";
import { createJobOrder, updateJobOrder, type JobOrderInput, type JobOrderResult } from "@/server/catalog/job-orders";
import { addRateVersion, deleteRateVersion, editRateVersion, type RateResult } from "@/server/catalog/rate-cards";
import type { RateInput } from "@/server/catalog/versions";
import { withAgency } from "@/server/db";
import { PeriodBusyError } from "@/server/run/period-lock";
import { currentActor } from "@/server/session";

const today = () => new Date().toISOString().slice(0, 10);
const refresh = () => {
  revalidatePath("/[locale]/(app)/job-orders", "page");
  revalidatePath("/[locale]/(app)/job-orders/[id]", "page");
  revalidatePath("/[locale]/(app)/assignments", "page");
};

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

export async function createJobOrderAction(input: JobOrderInput): Promise<JobOrderResult | { ok: false; error: "busy" }> {
  const actor = currentActor();
  return run(() => withAgency(actor.agencyId, (tx) => createJobOrder(tx, actor, input)));
}

export async function updateJobOrderAction(id: string, input: JobOrderInput): Promise<JobOrderResult | { ok: false; error: "busy" }> {
  const actor = currentActor();
  return run(() => withAgency(actor.agencyId, (tx) => updateJobOrder(tx, actor, id, input)));
}

export async function addRateAction(ref: { jobOrderId: string } | { assignmentId: string }, input: RateInput): Promise<RateResult | { ok: false; error: "busy" }> {
  const actor = currentActor();
  return run(() => withAgency(actor.agencyId, (tx) => addRateVersion(tx, actor, ref, input)));
}

export async function editRateAction(versionId: string, input: RateInput, reasons: string[], note: string): Promise<RateResult | { ok: false; error: "busy" }> {
  const actor = currentActor();
  return run(() => withAgency(actor.agencyId, (tx) => editRateVersion(tx, actor, versionId, input, reasons, note)));
}

export async function deleteRateAction(versionId: string): Promise<RateResult | { ok: false; error: "busy" }> {
  const actor = currentActor();
  return run(() => withAgency(actor.agencyId, (tx) => deleteRateVersion(tx, actor, versionId)));
}

export async function createAssignmentAction(input: { workerId: string; jobOrderId: string; startDate: string; endDate: string | null }): Promise<AssignmentResult | { ok: false; error: "busy" }> {
  const actor = currentActor();
  return run(() => withAgency(actor.agencyId, (tx) => createAssignment(tx, actor, input)));
}

export async function setAssignmentDatesAction(id: string, dates: { startDate: string; endDate: string | null }): Promise<AssignmentResult | { ok: false; error: "busy" }> {
  const actor = currentActor();
  return run(() => withAgency(actor.agencyId, (tx) => setAssignmentDates(tx, actor, id, dates, today())));
}

export async function endAssignmentsAction(ids: string[], endDate: string): Promise<{ ended: string[]; refused: { id: string; error: string }[] } | { ok: false; error: "busy" }> {
  const actor = currentActor();
  return run(() => withAgency(actor.agencyId, (tx) => endAssignments(tx, actor, ids, endDate, today())));
}

export async function cancelAssignmentAction(id: string, reason: string): Promise<AssignmentResult | { ok: false; error: "busy" }> {
  const actor = currentActor();
  return run(() => withAgency(actor.agencyId, (tx) => cancelAssignment(tx, actor, id, reason)));
}
