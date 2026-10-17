// Pattern: docs/patterns/settings/connections.md — Zapier's App Connections (Connected and Available
// tabs, status, last used, a row menu with Test, Open, Delete) and Stripe's apps catalogue (grouped by
// category, a name and one sentence each), laid out as Linear's settings (decision 0040); the
// forwarding address first, as Ramp's receipt forwarding (decision 0042).
import { setRequestLocale } from "next-intl/server";
import { ConnectionsSettings } from "@/components/shiftbook/settings/connections";
import { ForwardingSettings } from "@/components/shiftbook/settings/forwarding";
import { connectionsView } from "@/server/connections/queries";
import { listPeriods } from "@/server/convert/queries";
import { withAgency } from "@/server/db";
import { inboundDomain } from "@/server/inbound/config";
import { forwardingView } from "@/server/inbound/service";
import { can } from "@/server/permissions";
import { currentActor, isDemo } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const { tab } = await props.searchParams;
  const actor = await currentActor();
  const { view, forwarding, weeks } = await withAgency(actor.agencyId, async (tx) => ({
    view: await connectionsView(tx),
    forwarding: await forwardingView(tx, actor.agencyId, inboundDomain()),
    weeks: (await listPeriods(tx)).filter((p) => p.runStatus !== "exported" && p.runStatus !== "closed").map((p) => ({ id: p.id, startsOn: p.startsOn })),
  }));
  return (
    <ConnectionsSettings
      view={view}
      tab={tab === "available" ? "available" : "connected"}
      canForget={can(actor, "placementTerms")}
      forwarding={<ForwardingSettings view={forwarding} weeks={weeks} canManage={can(actor, "settings")} canFile={can(actor, "hours")} demo={isDemo()} />}
    />
  );
}
