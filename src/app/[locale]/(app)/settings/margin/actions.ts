"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAgency } from "@/server/db";
import { addTaxRate, addWcRate, setOtPremium, setPayDay, type MarginResult } from "@/server/margin/service";
import { PeriodBusyError } from "@/server/run/period-lock";
import { actorAllowedTo } from "@/server/session";

/** Margin settings actions (slice i; docs/patterns/settings/margin.md). Shapes here; rules in the service. */
export type MarginActionResult = MarginResult | { ok: false; error: "busy" | "generic" };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ppm = z.number().int();
const TaxSchema = z.object({ state: z.string().max(2).nullable(), ratePpm: ppm, includes: z.string().max(400).nullable(), effectiveFrom: isoDate }).strict();
const WcSchema = z.object({ state: z.string().max(2), classCode: z.string().max(20), description: z.string().max(400).nullable(), ratePpm: ppm, effectiveFrom: isoDate }).strict();

async function guarded(fn: () => Promise<MarginResult>): Promise<MarginActionResult> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    throw error;
  } finally {
    for (const path of ["/[locale]/(app)/settings/margin", "/[locale]/(app)/margin", "/[locale]/(app)/margin/overtime", "/[locale]/(app)/margin/cash"]) revalidatePath(path, "page");
  }
}

export async function addTaxRateAction(input: unknown): Promise<MarginActionResult> {
  if (!TaxSchema.safeParse(input).success) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("settings");
  return guarded(() => withAgency(actor.agencyId, (tx) => addTaxRate(tx, actor, input)));
}

export async function addWcRateAction(input: unknown): Promise<MarginActionResult> {
  if (!WcSchema.safeParse(input).success) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("settings");
  return guarded(() => withAgency(actor.agencyId, (tx) => addWcRate(tx, actor, input)));
}

export async function setOtPremiumAction(exclude: boolean, from: string): Promise<MarginActionResult> {
  if (typeof exclude !== "boolean" || !isoDate.safeParse(from).success) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("settings");
  return guarded(() => withAgency(actor.agencyId, (tx) => setOtPremium(tx, actor, exclude, from)));
}

export async function setPayDayAction(days: number, from: string): Promise<MarginActionResult> {
  if (!z.number().int().safeParse(days).success || !isoDate.safeParse(from).success) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("settings");
  return guarded(() => withAgency(actor.agencyId, (tx) => setPayDay(tx, actor, days, from)));
}
