// Pattern: docs/patterns/invoices/[id].md — Stripe invoice details; TempWorks "Preview Invoice w/
// Timecards"; SAP Fieldglass "Related"; Bullhorn One credit links.
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { InvoicePage } from "@/components/shiftbook/invoices/invoice-page";
import { withAgency } from "@/server/db";
import { invoiceDetail } from "@/server/invoices/queries";
import { invoiceReceivables, openInvoicesByClient } from "@/server/receivables/queries";
import { mayCollect } from "@/server/receivables/service";
import { changesPaused, currentActor } from "@/server/session";
import { eq } from "drizzle-orm";
import { creditRoomOf, invoiceEmails, promisesOf } from "@/server/collections/service";
import { clients } from "@/server/db/schema";
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
    // Slice r: when it was last emailed, what may still be credited, the promises to pay, where it would go.
    const emails = await invoiceEmails(tx, id);
    const [client] = await tx.select({ billingEmail: clients.billingEmail }).from(clients).where(eq(clients.id, detail.client.id));
    const collect = {
      lastSent: emails.lastSent ? { to: emails.lastSent.toEmail, at: (emails.lastSent.sentAt ?? emails.lastSent.createdAt).toISOString() } : null,
      reminders: emails.all.filter((e) => e.kind === "invoice_reminder").length,
      billingEmail: client?.billingEmail ?? null,
      roomCents: await creditRoomOf(tx, id),
      promises: (await promisesOf(tx, id)).map((p) => ({ ...p, at: p.at.toISOString() })),
    };
    return { detail, today, ar: await invoiceReceivables(tx, id, today), clients: await openInvoicesByClient(tx), collect };
  });
  if (!view) notFound();
  // Back to the list as it was filtered (only its own filters travel).
  const back = new URLSearchParams(typeof sp.back === "string" ? sp.back.slice(0, 300) : "");
  const kept = new URLSearchParams([...back.entries()].filter(([k]) => k === "status" || k === "client"));
  return <InvoicePage detail={view.detail} back={kept.toString()} ar={view.ar} clients={view.clients} today={view.today} canCollect={mayCollect(actor) && !(await changesPaused(actor))} collect={view.collect} />;
}
