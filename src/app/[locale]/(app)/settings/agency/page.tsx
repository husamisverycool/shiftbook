// Pattern: docs/patterns/settings/agency.md — Gusto's company details in Linear's settings column.
import { setRequestLocale } from "next-intl/server";
import { AgencySettings } from "@/components/shiftbook/settings/agency";
import { withAgency } from "@/server/db";
import { can } from "@/server/permissions";
import { agencyView, TIME_ZONES } from "@/server/setup/agency";
import { changesPaused, currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function AgencySettingsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const paused = await changesPaused(actor);
  const view = await withAgency(actor.agencyId, (tx) => agencyView(tx, actor.agencyId));
  return <AgencySettings view={view} zones={TIME_ZONES} canChange={can(actor, "settings") && !paused} />;
}
