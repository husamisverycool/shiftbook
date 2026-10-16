// Pattern: docs/patterns/payments.md — QuickBooks Online sales transactions (payments) and Receive
// payment; Zoho Books unused amount; Stripe unapply.
import { setRequestLocale } from "next-intl/server";
import { PaymentsView } from "@/components/shiftbook/receivables/payments-view";
import { withAgency } from "@/server/db";
import { openInvoicesByClient, paymentsList } from "@/server/receivables/queries";
import { mayCollect } from "@/server/receivables/service";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function PaymentsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const { rows, clients, today } = await withAgency(actor.agencyId, async (tx) => ({ rows: await paymentsList(tx), clients: await openInvoicesByClient(tx), today: await agencyToday(tx) }));
  return <PaymentsView rows={rows} clients={clients} today={today} canChange={mayCollect(actor)} />;
}
