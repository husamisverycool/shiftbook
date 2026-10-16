// Pattern: docs/patterns/invoices/[id].md — Stripe invoice details; TempWorks "Preview Invoice w/
// Timecards"; SAP Fieldglass "Related"; Bullhorn One credit links.
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { InvoicePage } from "@/components/shiftbook/invoices/invoice-page";
import { withAgency } from "@/server/db";
import { invoiceDetail } from "@/server/invoices/queries";
import { invoiceReceivables, openInvoicesByClient } from "@/server/receivables/queries";
import { mayCollect } from "@/server/receivables/service";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InvoiceDetailPage(props: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);
  if (!UUID.test(id)) notFound();
  const sp = await props.searchParams;
  const actor = await currentActor();
  const view = await withAgency(actor.agencyId, async (tx) => {
    const detail = await invoiceDetail(tx, id);
    if (!detail) return null;
    const today = await agencyToday(tx);
    return { detail, today, ar: await invoiceReceivables(tx, id, today), clients: await openInvoicesByClient(tx) };
  });
  if (!view) notFound();
  // Back to the list as it was filtered (only its own filters travel).
  const back = new URLSearchParams(typeof sp.back === "string" ? sp.back.slice(0, 300) : "");
  const kept = new URLSearchParams([...back.entries()].filter(([k]) => k === "status" || k === "client"));
  return <InvoicePage detail={view.detail} back={kept.toString()} ar={view.ar} clients={view.clients} today={view.today} canCollect={mayCollect(actor)} />;
}
