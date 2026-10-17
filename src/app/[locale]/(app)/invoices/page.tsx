// Pattern: docs/patterns/invoices.md — Stripe invoices list; Bullhorn "# Selected" actions; Avionté
// Invoice Merge for statements.
import { setRequestLocale } from "next-intl/server";
import { InvoicesView } from "@/components/shiftbook/invoices/invoices-view";
import { withAgency } from "@/server/db";
import { listInvoices } from "@/server/invoices/queries";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function InvoicesPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const { rows, today } = await withAgency(actor.agencyId, async (tx) => ({ rows: await listInvoices(tx), today: await agencyToday(tx) }));
  return <InvoicesView rows={rows} today={today} />;
}
