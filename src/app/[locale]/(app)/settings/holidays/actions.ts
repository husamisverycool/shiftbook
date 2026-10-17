"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteHolidayPolicy, HolidayRefusedError, saveHolidayPolicy, type HolidayProblem } from "@/server/catalog/holidays";
import { withAgency } from "@/server/db";
import { actorAllowedTo } from "@/server/session";

const whole = z.number().int();
const fraction = z.object({ num: whole, den: whole }).strict();
const PolicySchema = z
  .object({
    clientId: z.uuid().nullable(),
    name: z.string().max(200),
    dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60),
    workedMultiplier: fraction,
    notWorkedMinutes: whole,
    billWorkedMultiplier: fraction.nullable(),
    billNotWorked: z.boolean(),
  })
  .strict();
export type HolidayPolicyForm = z.infer<typeof PolicySchema>;

const refresh = () => revalidatePath("/[locale]/(app)/settings/holidays", "page");

/** The Owner adds or changes a holiday policy (audited). */
export async function saveHolidayPolicyAction(id: string | null, input: HolidayPolicyForm, reason: string): Promise<{ ok: true } | { ok: false; problems: HolidayProblem[] }> {
  const actor = await actorAllowedTo("settings");
  const parsed = PolicySchema.safeParse(input);
  if ((id !== null && !z.uuid().safeParse(id).success) || !parsed.success || typeof reason !== "string" || reason.length > 2000) return { ok: false, problems: ["name"] };
  try {
    await withAgency(actor.agencyId, (tx) => saveHolidayPolicy(tx, actor, id, parsed.data, reason));
  } catch (error) {
    if (error instanceof HolidayRefusedError) return { ok: false, problems: error.problems };
    throw error;
  }
  refresh();
  return { ok: true };
}

export async function deleteHolidayPolicyAction(id: string, reason: string): Promise<{ ok: true } | { ok: false; problems: HolidayProblem[] }> {
  const actor = await actorAllowedTo("settings");
  if (!z.uuid().safeParse(id).success || typeof reason !== "string" || reason.length > 2000) return { ok: false, problems: ["name"] };
  try {
    await withAgency(actor.agencyId, (tx) => deleteHolidayPolicy(tx, actor, id, reason));
  } catch (error) {
    if (error instanceof HolidayRefusedError) return { ok: false, problems: error.problems };
    throw error;
  }
  refresh();
  return { ok: true };
}
