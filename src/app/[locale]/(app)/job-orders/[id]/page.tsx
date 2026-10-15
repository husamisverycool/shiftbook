// Pattern: docs/patterns/job-orders/[id].md — Attio record page; Bullhorn rate card versions;
// Gusto compensation card; Stripe Prices.
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { JobOrderPageView } from "@/components/shiftbook/catalog/job-order-page";
import { catalogOptions, jobOrderPage } from "@/server/catalog/queries";
import { withAgency } from "@/server/db";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function JobOrderRoute(props: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const actor = currentActor();
  const today = new Date().toISOString().slice(0, 10);
  const { data, options } = await withAgency(actor.agencyId, async (tx) => ({ data: await jobOrderPage(tx, id, today), options: await catalogOptions(tx) }));
  if (!data) notFound();
  return <JobOrderPageView data={data} options={options} today={today} />;
}
