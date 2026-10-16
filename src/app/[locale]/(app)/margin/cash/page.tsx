// Pattern: docs/patterns/margin/cash.md — Xero short-term cash flow; QuickBooks Online cash flow planner.
import { setRequestLocale } from "next-intl/server";
import { MarginCash } from "@/components/shiftbook/margin/cash";
import { MarginFrame, NotForRole } from "@/components/shiftbook/margin/frame";
import { withAgency } from "@/server/db";
import { cashView } from "@/server/margin/queries";
import { mayViewMargin } from "@/server/margin/service";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function CashPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = currentActor();
  if (!mayViewMargin(actor)) return <NotForRole />;
  const view = await withAgency(actor.agencyId, async (tx) => cashView(tx, await agencyToday(tx)));
  return (
    <MarginFrame tab="cash" period={null} exports={[]}>
      <MarginCash view={view} />
    </MarginFrame>
  );
}
