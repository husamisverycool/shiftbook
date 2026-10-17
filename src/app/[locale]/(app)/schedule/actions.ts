"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAgency } from "@/server/db";
import { PeriodBusyError } from "@/server/run/period-lock";
import { createShifts, deleteShift, eligibleWorkers, markNoShow, publishShifts, updateShift, type EligibleWorker, type ShiftResult } from "@/server/schedule/service";
import { actorAllowedTo } from "@/server/session";

// Every input is checked against its shape here: a hand-made request gets the same refusal as a bad form.
const id = z.uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const whole = z.number().int();
const ShiftSchema = z
  .object({
    jobOrderId: id,
    workDate: isoDate,
    startMinute: whole,
    endMinute: whole,
    breakMinutes: whole,
    workerId: id.nullable(),
    requireConfirmation: z.boolean(),
  })
  .strict();
const PublishSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    scope: z.enum(["changes", "all"]),
    clientIds: z.array(id).max(500).nullable(),
    notify: z.enum(["confirm", "notify", "silent"]),
    message: z.string().max(1000).nullable(),
  })
  .strict();

type Busy = { ok: false; error: "busy" };
const refresh = () => {
  revalidatePath("/[locale]/(app)/schedule", "page");
  revalidatePath("/[locale]/(app)/margin/attendance", "page");
};

/** A busy catalog (files being created right now) is a plain refusal; anything else is a real error. */
async function run<T>(fn: () => Promise<T>): Promise<T | Busy> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    throw error;
  } finally {
    refresh();
  }
}

export async function createShiftsAction(raw: unknown, copies: number): Promise<ShiftResult | Busy> {
  const actor = await actorAllowedTo("placements");
  const input = ShiftSchema.safeParse(raw);
  if (!input.success || !Number.isInteger(copies)) return { ok: false, error: "invalid_time" };
  return run(() => withAgency(actor.agencyId, (tx) => createShifts(tx, actor, { ...input.data, copies })));
}

export async function updateShiftAction(shiftId: string, raw: unknown): Promise<ShiftResult | Busy> {
  const actor = await actorAllowedTo("placements");
  const input = ShiftSchema.safeParse(raw);
  if (!id.safeParse(shiftId).success || !input.success) return { ok: false, error: "invalid_time" };
  return run(() => withAgency(actor.agencyId, (tx) => updateShift(tx, actor, shiftId, input.data)));
}

export async function deleteShiftAction(shiftId: string): Promise<ShiftResult | Busy> {
  const actor = await actorAllowedTo("placements");
  if (!id.safeParse(shiftId).success) return { ok: false, error: "not_found" };
  return run(() => withAgency(actor.agencyId, (tx) => deleteShift(tx, actor, shiftId)));
}

export async function markNoShowAction(shiftId: string, replace: boolean): Promise<ShiftResult | Busy> {
  const actor = await actorAllowedTo("placements");
  if (!id.safeParse(shiftId).success || typeof replace !== "boolean") return { ok: false, error: "not_found" };
  return run(() => withAgency(actor.agencyId, (tx) => markNoShow(tx, actor, shiftId, replace)));
}

export async function publishAction(raw: unknown): Promise<Awaited<ReturnType<typeof publishShifts>> | Busy> {
  const actor = await actorAllowedTo("placements");
  const input = PublishSchema.safeParse(raw);
  if (!input.success) return { ok: false, error: "invalid_date" };
  return run(() => withAgency(actor.agencyId, (tx) => publishShifts(tx, actor, { ...input.data, message: input.data.message?.trim() || null })));
}

/** Who may take a shift (reading; the dialog asks as the job order, date or time changes). */
export async function eligibleAction(raw: unknown, shiftId: string | null): Promise<EligibleWorker[]> {
  const actor = await actorAllowedTo("placements");
  const input = ShiftSchema.pick({ jobOrderId: true, workDate: true, startMinute: true, endMinute: true, breakMinutes: true }).safeParse(raw);
  if (!input.success || (shiftId !== null && !id.safeParse(shiftId).success)) return [];
  return withAgency(actor.agencyId, (tx) => eligibleWorkers(tx, { ...input.data, id: shiftId ?? undefined }));
}
