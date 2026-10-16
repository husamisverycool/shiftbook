// Pattern: docs/patterns/receivables.md — FreshBooks Accounts Aging; QuickBooks Online A/R aging
// summary (as of a date); TempWorks Short Pay Invoices.
import { setRequestLocale } from "next-intl/server";
import { isIsoDate } from "@shiftbook/rules";
import { ReceivablesView } from "@/components/shiftbook/receivables/receivables-view";
import { withAgency } from "@/server/db";
import { receivablesView } from "@/server/receivables/queries";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function ReceivablesPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const sp = await props.searchParams;
  const actor = currentActor();
  const { view, today } = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    // A date in the future is read as today: the aging cannot see payments not yet received.
    const asOf = typeof sp.asOf === "string" && isIsoDate(sp.asOf) && sp.asOf <= today ? sp.asOf : today;
    return { view: await receivablesView(tx, asOf), today };
  });
  return <ReceivablesView view={view} tab={sp.tab === "short" ? "short" : "aging"} today={today} />;
}
