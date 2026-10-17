// Pattern: docs/patterns/money/funding/[id].md — Stripe Capital's offer anatomy and wording, a factor's
// schedule of accounts: one invoice's packet and decision; submitting records it. Nothing is lent.
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { FundingDetail } from "@/components/shiftbook/money/funding";
import { withAgency } from "@/server/db";
import { fundingView, handoffs } from "@/server/money/queries";
import { MoneyNotForRole } from "@/components/shiftbook/money/frame";
import { can } from "@/server/permissions";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FundingDetailPage(props: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);
  if (!UUID.test(id)) notFound();
  const actor = await currentActor();
  if (!can(actor, "money")) return <MoneyNotForRole />;
  const found = await withAgency(actor.agencyId, async (tx) => {
    const { packets } = await fundingView(tx, await agencyToday(tx), { invoiceId: id });
    return packets[0] ? { packet: packets[0], handoff: (await handoffs(tx, { kind: "funding", subjectId: id }))[0] ?? null } : null;
  });
  if (!found) notFound();
  return <FundingDetail packet={found.packet} handoff={found.handoff} />;
}
