// Pattern: docs/patterns/settings/connections.md — Zapier's App Connections (Connected and Available
// tabs, status, last used, a row menu with Test, Open, Delete) and Stripe's apps catalogue (grouped by
// category, a name and one sentence each), laid out as Linear's settings (decision 0040).
import { setRequestLocale } from "next-intl/server";
import { ConnectionsSettings } from "@/components/shiftbook/settings/connections";
import { connectionsView } from "@/server/connections/queries";
import { withAgency } from "@/server/db";
import { can } from "@/server/permissions";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const { tab } = await props.searchParams;
  const actor = await currentActor();
  const view = await withAgency(actor.agencyId, (tx) => connectionsView(tx));
  return <ConnectionsSettings view={view} tab={tab === "available" ? "available" : "connected"} canForget={can(actor, "placements")} />;
}
