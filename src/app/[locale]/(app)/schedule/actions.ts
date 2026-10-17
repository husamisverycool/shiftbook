"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db, withAgency } from "@/server/db";
import * as s from "@/server/db/schema";
import { requestOrigin } from "@/server/request-info";
import { PeriodBusyError } from "@/server/run/period-lock";
import { tellWorkersOfPublish, type Lang } from "@/server/schedule/notify";
import { linkBaseUrl } from "@/server/services";
import { deliverSms, smsTransport } from "@/server/worker-app/sms";
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
  const note = input.data.message?.trim() || null;
  const base = linkBaseUrl(await requestOrigin());
  const result = await run(() =>
    withAgency(actor.agencyId, async (tx) => {
      const r = await publishShifts(tx, actor, { ...input.data, message: note });
      if (!r.ok || input.data.notify === "silent") return { r, texts: [] };
      const [agency] = await tx.select({ name: s.agencies.name }).from(s.agencies);
      const name = agency?.name ?? "";
      const day = (iso: string, lang: Lang) => new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
      const words = await Promise.all((["en", "es"] as const).map(async (lang) => [lang, await getTranslations({ locale: lang, namespace: "schedule" })] as const));
      const t = Object.fromEntries(words) as Record<Lang, Awaited<ReturnType<typeof getTranslations<"schedule">>>>;
      const texts = await tellWorkersOfPublish(tx, actor, r.workerIds, (lang) => {
        const values = { from: day(input.data.from, lang), to: day(input.data.to, lang), agency: name };
        return {
          message: note ? t[lang]("workerNoticeWithNote", { ...values, note }) : t[lang]("workerNotice", values),
          sms: t[lang]("workerNoticeSms", { ...values, link: `${base}/${lang}/w/shifts` }),
        };
      });
      return { r, texts };
    }),
  );
  if ("error" in result) return result;
  // Texts go after the commit; a failed one is recorded on its row and never undoes the publish.
  for (const sms of result.texts) await deliverSms(db, smsTransport(), actor.agencyId, sms);
  return result.r;
}

/** Who may take a shift (reading; the dialog asks as the job order, date or time changes). */
export async function eligibleAction(raw: unknown, shiftId: string | null): Promise<EligibleWorker[]> {
  const actor = await actorAllowedTo("placements");
  const input = ShiftSchema.pick({ jobOrderId: true, workDate: true, startMinute: true, endMinute: true, breakMinutes: true }).safeParse(raw);
  if (!input.success || (shiftId !== null && !id.safeParse(shiftId).success)) return [];
  return withAgency(actor.agencyId, (tx) => eligibleWorkers(tx, { ...input.data, id: shiftId ?? undefined }));
}
