// Pattern: docs/patterns/clients.md — Stripe customers list.
import { setRequestLocale } from "next-intl/server";
import { ClientsView } from "@/components/shiftbook/clients/clients-view";
import { listClients } from "@/server/clients/queries";
import { withAgency } from "@/server/db";
import { agencyToday } from "@/server/settings";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function ClientsPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const showArchived = (await props.searchParams).archived === "1";
  const actor = await currentActor();
  const rows = await withAgency(actor.agencyId, async (tx) => listClients(tx, await agencyToday(tx)));
  return <ClientsView rows={showArchived ? rows : rows.filter((r) => !r.archived)} archivedCount={rows.filter((r) => r.archived).length} showArchived={showArchived} />;
}
