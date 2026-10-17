"use server";

import { revalidatePath } from "next/cache";
import { withAgency } from "@/server/db";
import { PeriodBusyError } from "@/server/run/period-lock";
import { saveAgencyDetails, setWorkweekStart, type SetupResult } from "@/server/setup/agency";
import { actorAllowedTo } from "@/server/session";

/** Settings › Agency (docs/patterns/settings/agency.md): the service checks every field. */
export async function saveAgencyAction(values: unknown): Promise<SetupResult | { ok: false; error: "generic" }> {
  if (JSON.stringify(values ?? null).length > 3_000) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("settings");
  const r = await withAgency(actor.agencyId, (tx) => saveAgencyDetails(tx, actor, values));
  revalidatePath("/[locale]/(app)", "layout");
  return r;
}

/** The pay week's first day (Settings › Payroll file, its Pay week section). */
export async function setWorkweekAction(day: unknown): Promise<SetupResult | { ok: false; error: "busy" }> {
  const actor = await actorAllowedTo("settings");
  try {
    return await withAgency(actor.agencyId, (tx) => setWorkweekStart(tx, actor, day));
  } catch (error) {
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    throw error;
  } finally {
    revalidatePath("/[locale]/(app)/settings/payroll", "page");
    revalidatePath("/[locale]/(app)/convert", "page");
  }
}
