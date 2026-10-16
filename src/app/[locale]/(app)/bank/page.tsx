// Pattern: docs/patterns/bank.md — QuickBooks Online bank transactions (For review, Posted,
// Excluded); Stripe's order of matching; Business Central confidence.
import { setRequestLocale } from "next-intl/server";
import { BankView, type BankTab } from "@/components/shiftbook/receivables/bank-view";
import { withAgency } from "@/server/db";
import { bankView, openInvoicesByClient } from "@/server/receivables/queries";
import { mayCollect } from "@/server/receivables/service";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function BankPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const sp = await props.searchParams;
  const tab: BankTab = sp.tab === "posted" || sp.tab === "excluded" ? sp.tab : "review";
  const actor = await currentActor();
  const { view, clients, today } = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    return { view: await bankView(tx, today), clients: await openInvoicesByClient(tx), today };
  });
  return <BankView view={view} tab={tab} clients={clients} today={today} canChange={mayCollect(actor)} />;
}
