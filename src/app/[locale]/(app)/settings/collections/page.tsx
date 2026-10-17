// Pattern: docs/patterns/settings/collections.md — Stripe: "send reminders … before, when, or after the
// invoice is due", from fixed choices; clients left out.
import { setRequestLocale } from "next-intl/server";
import { CollectionsSettingsView } from "@/components/shiftbook/receivables/collections-settings";
import { clientsForReminders, scheduleOf } from "@/server/collections/service";
import { withAgency } from "@/server/db";
import { can } from "@/server/permissions";
import { changesPaused, currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function CollectionsSettingsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const paused = await changesPaused(actor);
  const { schedule, clients } = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    return { schedule: await scheduleOf(tx, today), clients: await clientsForReminders(tx, today) };
  });
  return <CollectionsSettingsView schedule={schedule} clients={clients} canChange={can(actor, "settings") && !paused} canChangeClients={can(actor, "clientBilling") && !paused} />;
}
