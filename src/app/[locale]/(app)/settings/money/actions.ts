"use server";

import { revalidatePath } from "next/cache";
import { withAgency } from "@/server/db";
import { setFundingRules, setWageAccessRules, type MoneySettingsResult } from "@/server/money/settings";
import { actorAllowedTo } from "@/server/session";
import { agencyToday } from "@/server/settings";

/** Money settings (slice w; docs/patterns/settings/money.md). The rules' checks are in the service. */
function done(result: MoneySettingsResult): MoneySettingsResult {
  for (const path of ["/[locale]/(app)/settings/money", "/[locale]/(app)/money/wage-access", "/[locale]/(app)/money/funding", "/[locale]/(app)/money/funding/[id]"]) revalidatePath(path, "page");
  return result;
}

export async function setWageAccessRulesAction(input: unknown): Promise<MoneySettingsResult> {
  const actor = await actorAllowedTo("money");
  return done(await withAgency(actor.agencyId, async (tx) => setWageAccessRules(tx, actor, input, await agencyToday(tx))));
}

export async function setFundingRulesAction(input: unknown): Promise<MoneySettingsResult> {
  const actor = await actorAllowedTo("money");
  return done(await withAgency(actor.agencyId, async (tx) => setFundingRules(tx, actor, input, await agencyToday(tx))));
}
