// Pattern: docs/patterns/settings/margin.md — Bullhorn workers' compensation codes; TempWorks worker
// comp codes and Initial Burden; Gusto pay schedule.
import { STATE_FIPS } from "@shiftbook/rules";
import { setRequestLocale } from "next-intl/server";
import { NotForRole } from "@/components/shiftbook/margin/frame";
import { MarginSettingsView } from "@/components/shiftbook/margin/settings";
import { withAgency } from "@/server/db";
import { marginSettings } from "@/server/margin/queries";
import { mayChangeMargin, mayViewMargin } from "@/server/margin/service";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function MarginSettingsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = currentActor();
  if (!mayViewMargin(actor)) return <NotForRole />;
  const { view, today } = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    return { view: await marginSettings(tx, today), today };
  });
  return <MarginSettingsView view={view} today={today} states={Object.keys(STATE_FIPS).sort()} canChange={mayChangeMargin(actor)} />;
}
