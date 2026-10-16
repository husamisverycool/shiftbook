// Pattern: docs/patterns/compliance/counters.md — TempWorks ACA Employee Cycles; 820 ILCS 175/42.
import { setRequestLocale } from "next-intl/server";
import { ComplianceFrame } from "@/components/shiftbook/compliance/frame";
import { Counters } from "@/components/shiftbook/compliance/counters";
import { balanceChoices, countersView, mayChangeBalances, type CounterShow } from "@/server/compliance/counter-balances";
import { withAgency } from "@/server/db";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CountersPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const sp = await props.searchParams;
  const show: CounterShow = sp.show === "near" || sp.show === "crossed" ? sp.show : "all";
  const clientId = typeof sp.client === "string" && UUID.test(sp.client) ? sp.client : null;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const canChange = mayChangeBalances(actor);
  const { view, choices, today } = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    return { view: await countersView(tx, today, { clientId, show, q }), choices: canChange ? await balanceChoices(tx) : [], today };
  });
  return (
    <ComplianceFrame tab="counters" counts={null}>
      <Counters view={view} choices={choices} canChange={canChange} today={today} />
    </ComplianceFrame>
  );
}
