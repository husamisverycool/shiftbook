// Pattern: docs/patterns/margin.md — Stripe Billing analytics, Brex Reports, Mercury Insights,
// TempWorks Gross Profit Summary.
import { setRequestLocale } from "next-intl/server";
import { MarginFrame, NotForRole } from "@/components/shiftbook/margin/frame";
import { MarginOverview } from "@/components/shiftbook/margin/overview";
import { withAgency } from "@/server/db";
import { marginAsk } from "@/server/margin/ask";
import { cashView, marginPeriod, marginView } from "@/server/margin/queries";
import { mayViewMargin } from "@/server/margin/service";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function MarginPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = currentActor();
  if (!mayViewMargin(actor)) return <NotForRole />;
  const ask = marginAsk(await props.searchParams);
  const t = await getTranslations("margin");
  const { period, view, floating } = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    const period = await marginPeriod(tx, today, ask.period);
    return { period, view: await marginView(tx, { from: period.from, to: period.to, groupBy: ask.groupBy, sort: ask.sort }), floating: (await cashView(tx, today)).floatingCents };
  });
  return (
    <MarginFrame tab="overview" period={period} exports={view.lines.length > 0 ? [{ kind: "summary", label: t("exportSummary") }, { kind: "lines", label: t("exportLines") }] : []}>
      <MarginOverview view={view} groupBy={ask.groupBy} sort={ask.sort} floatingCents={floating} />
    </MarginFrame>
  );
}
