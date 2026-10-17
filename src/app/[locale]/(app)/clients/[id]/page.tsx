// Pattern: docs/patterns/clients/[id].md — Stripe customer details with Edit; Bullhorn One Invoice
// Terms versions; Avionté Billing Preferences sections.
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ClientPage } from "@/components/shiftbook/clients/client-page";
import { mayChangeBilling } from "@/server/catalog/billing";
import { clientDetail } from "@/server/clients/queries";
import { withAgency } from "@/server/db";
import { clientReceivables, openInvoicesByClient } from "@/server/receivables/queries";
import { mayCollect } from "@/server/receivables/service";
import { agencyToday } from "@/server/settings";
import { portalAccess } from "@/server/portal/service";
import { currentActor, isDemo } from "@/server/session";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClientDetailPage(props: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);
  if (!UUID.test(id)) notFound();
  const actor = await currentActor();
  const view = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    const detail = await clientDetail(tx, id, today);
    return {
      today,
      detail,
      owes: detail ? await clientReceivables(tx, id, today) : null,
      clients: detail ? await openInvoicesByClient(tx) : [],
      portal: detail ? await portalAccess(tx, id, { demoCopies: isDemo() }) : [],
    };
  });
  if (!view.detail || !view.owes) notFound();
  return <ClientPage detail={view.detail} mayChange={mayChangeBilling(actor)} today={view.today} owes={view.owes} clients={view.clients} mayCollect={mayCollect(actor)} portal={{ rows: view.portal, demo: isDemo() }} />;
}
