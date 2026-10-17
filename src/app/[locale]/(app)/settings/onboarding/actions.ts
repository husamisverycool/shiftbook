"use server";

import { revalidatePath } from "next/cache";
import { withAgency } from "@/server/db";
import { actorAllowedTo } from "@/server/session";
import { removePolicy, savePolicy, type PolicyResult } from "@/server/worker-app/policies";

/** Settings › Onboarding (decision 0043; docs/patterns/settings/onboarding.md). The service checks every rule. */
const small = (v: unknown) => JSON.stringify(v ?? null).length <= 20_000;

export async function savePolicyAction(input: unknown): Promise<PolicyResult> {
  if (!small(input) || !input || typeof input !== "object") return { ok: false, error: "invalid", problems: ["title_en"] };
  const actor = await actorAllowedTo("onboardingPolicies");
  const v = input as Record<string, unknown>;
  const r = await withAgency(actor.agencyId, (tx) => savePolicy(tx, actor, { key: v.key, titleEn: v.titleEn, bodyEn: v.bodyEn, titleEs: v.titleEs, bodyEs: v.bodyEs, required: v.required, effectiveFrom: v.effectiveFrom }));
  revalidatePath("/[locale]/(app)/settings/onboarding", "page");
  return r;
}

export async function removePolicyAction(key: unknown, effectiveFrom: unknown): Promise<PolicyResult> {
  const actor = await actorAllowedTo("onboardingPolicies");
  const r = await withAgency(actor.agencyId, (tx) => removePolicy(tx, actor, key, effectiveFrom));
  revalidatePath("/[locale]/(app)/settings/onboarding", "page");
  return r;
}
