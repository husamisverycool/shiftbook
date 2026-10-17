"use server";

import { revalidatePath } from "next/cache";
import { saveSchedule, setClientReminders } from "@/server/collections/service";
import { withAgency } from "@/server/db";
import { actorAllowedTo } from "@/server/session";

/** Settings › Collections (slice r; docs/patterns/settings/collections.md). The service checks every rule. */
export async function saveScheduleAction(input: unknown): Promise<{ ok: true } | { ok: false; error: "forbidden" | "invalid" }> {
  if (JSON.stringify(input ?? null).length > 1_000) return { ok: false, error: "invalid" };
  const actor = await actorAllowedTo("settings");
  const r = await withAgency(actor.agencyId, (tx) => saveSchedule(tx, actor, input));
  revalidatePath("/[locale]/(app)/settings/collections", "page");
  return r;
}

export async function setClientRemindersAction(clientId: unknown, on: unknown): Promise<{ ok: boolean }> {
  const actor = await actorAllowedTo("clientBilling");
  const r = await withAgency(actor.agencyId, (tx) => setClientReminders(tx, actor, clientId, on));
  revalidatePath("/[locale]/(app)/settings/collections", "page");
  return { ok: r.ok };
}
