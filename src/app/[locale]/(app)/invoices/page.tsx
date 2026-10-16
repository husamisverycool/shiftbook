// Pattern: docs/patterns/invoices.md — Stripe invoices list; Bullhorn "# Selected" actions; Avionté
// Invoice Merge for statements.
import { setRequestLocale } from "next-intl/server";
import { InvoicesView } from "@/components/shiftbook/invoices/invoices-view";
import { withAgency } from "@/server/db";
import { listInvoices } from "@/server/invoices/queries";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function InvoicesPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = currentActor();
  const rows = await withAgency(actor.agencyId, (tx) => listInvoices(tx));
  return <InvoicesView rows={rows} />;
}
