"use server";

import { revalidatePath } from "next/cache";
import { withAgency } from "@/server/db";
import { startPayPeriod, type StartPeriodResult } from "@/server/setup/agency";
import { actorAllowedTo } from "@/server/session";

/** "Start a pay period" on the pay periods list (docs/patterns/convert.md): an earlier week, by a date in it. */
export async function startPayPeriodAction(date: unknown): Promise<StartPeriodResult> {
  const actor = await actorAllowedTo("hours");
  const r = await withAgency(actor.agencyId, (tx) => startPayPeriod(tx, actor, date));
  revalidatePath("/[locale]/(app)/convert", "page");
  return r;
}
