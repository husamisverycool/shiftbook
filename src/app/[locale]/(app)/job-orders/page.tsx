// Pattern: docs/patterns/job-orders.md — Linear issue list with Attio's record preview.
import { setRequestLocale } from "next-intl/server";
import { JobOrdersView } from "@/components/shiftbook/catalog/job-orders-view";
import { catalogOptions, listJobOrders } from "@/server/catalog/queries";
import { withAgency } from "@/server/db";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function JobOrdersPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = currentActor();
  const today = new Date().toISOString().slice(0, 10);
  const { rows, options } = await withAgency(actor.agencyId, async (tx) => ({ rows: await listJobOrders(tx, today), options: await catalogOptions(tx) }));
  return <JobOrdersView rows={rows} options={options} />;
}
