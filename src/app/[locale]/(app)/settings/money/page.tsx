// Pattern: docs/patterns/settings/money.md — Linear's settings layout; the agency's rules for wage access
// (the CFPB opinion's cap: never more than earned) and invoice funding (factors' published terms).
import { setRequestLocale } from "next-intl/server";
import { MoneySettingsView } from "@/components/shiftbook/money/settings";
import { withAgency } from "@/server/db";
import { fundingRules, wageAccessRules } from "@/server/money/settings";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function MoneySettingsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const view = await withAgency(actor.agencyId, async (tx) => ({ wage: await wageAccessRules(tx), funding: await fundingRules(tx) }));
  return <MoneySettingsView wage={view.wage} funding={view.funding} />;
}
