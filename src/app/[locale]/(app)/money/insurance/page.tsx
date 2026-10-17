// Pattern: docs/patterns/money/insurance.md — Patriot's Workers' Comp Wages report by state and class
// for a range of pay dates (NCRB: the overtime premium apart), handed off to the broker.
import { isIsoDate } from "@shiftbook/rules";
import { setRequestLocale } from "next-intl/server";
import { InsuranceView } from "@/components/shiftbook/money/insurance";
import { MoneyFrame, MoneyNotForRole } from "@/components/shiftbook/money/frame";
import { packetRange, wcPacketView } from "@/server/compliance/documents";
import { withAgency } from "@/server/db";
import { can } from "@/server/permissions";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function InsurancePage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  if (!can(actor, "money")) return <MoneyNotForRole />;
  const sp = await props.searchParams;
  const view = await withAgency(actor.agencyId, async (tx) => {
    const range = await packetRange(tx, await agencyToday(tx));
    const from = typeof sp.from === "string" && isIsoDate(sp.from) ? sp.from : range.from;
    const to = typeof sp.to === "string" && isIsoDate(sp.to) && sp.to >= from ? sp.to : range.to;
    return wcPacketView(tx, { from, to, order: "class" });
  });
  return (
    <MoneyFrame tab="insurance">
      <InsuranceView key={`${view.from}_${view.to}`} view={view} />
    </MoneyFrame>
  );
}
