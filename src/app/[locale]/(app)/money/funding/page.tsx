// Pattern: docs/patterns/money/funding.md — what factors ask for, with Stripe Capital's wording: every
// open invoice with its funding decision under the agency's rules.
import { setRequestLocale } from "next-intl/server";
import { FundingList } from "@/components/shiftbook/money/funding";
import { MoneyFrame } from "@/components/shiftbook/money/frame";
import { withAgency } from "@/server/db";
import { fundingRules, fundingView } from "@/server/money/queries";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function FundingPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const view = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    return { ...(await fundingView(tx, today)), rules: await fundingRules(tx), today };
  });
  return (
    <MoneyFrame tab="funding">
      <FundingList packets={view.packets} handoffs={view.handoffs} rules={view.rules} today={view.today} />
    </MoneyFrame>
  );
}
