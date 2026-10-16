"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setBillingSettings, type BillingResult } from "@/server/catalog/billing";
import { withAgency } from "@/server/db";
import { PeriodBusyError } from "@/server/run/period-lock";
import { actorAllowedTo } from "@/server/session";

/**
 * Starts a version of a client's invoice settings (docs/patterns/clients/[id].md). Shapes only here:
 * the billing service checks every rule and says which one a value breaks.
 */
export async function saveBillingAction(clientId: string, values: unknown, effectiveFrom: string): Promise<BillingResult | { ok: false; error: "busy" | "generic" }> {
  if (!z.uuid().safeParse(clientId).success || !z.string().max(20).safeParse(effectiveFrom).success || JSON.stringify(values ?? null).length > 5000) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("clientBilling");
  try {
    return await withAgency(actor.agencyId, (tx) => setBillingSettings(tx, actor, clientId, values, effectiveFrom));
  } catch (error) {
    // Files are being made with these settings right now: try again in a moment.
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    throw error;
  } finally {
    revalidatePath("/[locale]/(app)/clients/[id]", "page");
    revalidatePath("/[locale]/(app)/clients", "page");
  }
}
