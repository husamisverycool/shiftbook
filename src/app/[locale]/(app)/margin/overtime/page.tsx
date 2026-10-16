// Pattern: docs/patterns/margin/overtime.md — Bullhorn Gross Margin Report; TempWorks Gross Profit Detail.
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarginFrame, NotForRole } from "@/components/shiftbook/margin/frame";
import { MarginOvertime } from "@/components/shiftbook/margin/overtime";
import { withAgency } from "@/server/db";
import { marginAsk } from "@/server/margin/ask";
import { marginPeriod, overtimeView } from "@/server/margin/queries";
import { mayViewMargin } from "@/server/margin/service";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function OvertimePage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  if (!mayViewMargin(actor)) return <NotForRole />;
  const ask = marginAsk(await props.searchParams);
  const t = await getTranslations("margin");
  const { period, view } = await withAgency(actor.agencyId, async (tx) => {
    const period = await marginPeriod(tx, await agencyToday(tx), ask.period);
    return { period, view: await overtimeView(tx, period) };
  });
  return (
    <MarginFrame tab="overtime" period={period} exports={view.rows.length > 0 ? [{ kind: "overtime", label: t("exportCsv") }] : []}>
      <MarginOvertime view={view} />
    </MarginFrame>
  );
}
