// Pattern: docs/patterns/money.md — Stripe Capital's lifecycle record and Stripe's lists: every handoff
// recorded for a licensed partner; nothing moves in this version.
import { setRequestLocale } from "next-intl/server";
import { MoneyFrame } from "@/components/shiftbook/money/frame";
import { HandoffsTable } from "@/components/shiftbook/money/lists";
import { withAgency } from "@/server/db";
import { handoffs } from "@/server/money/queries";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function MoneyPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const rows = await withAgency(actor.agencyId, (tx) => handoffs(tx));
  return (
    <MoneyFrame tab="handoffs">
      <HandoffsTable rows={rows} />
    </MoneyFrame>
  );
}
