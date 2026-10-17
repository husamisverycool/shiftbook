// Pattern: docs/patterns/job-orders.md — Linear issue list with Attio's record preview.
import { setRequestLocale } from "next-intl/server";
import { JobOrdersView } from "@/components/shiftbook/catalog/job-orders-view";
import { catalogOptions, listJobOrders } from "@/server/catalog/queries";
import { withAgency } from "@/server/db";
import { pendingStaffRequests } from "@/server/portal/service";
import { agencyToday } from "@/server/settings";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function JobOrdersPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const { rows, options, requests } = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    return { rows: await listJobOrders(tx, today), options: await catalogOptions(tx), requests: await pendingStaffRequests(tx) };
  });
  return <JobOrdersView rows={rows} options={options} requests={requests} />;
}
