// Pattern: docs/patterns/approvals/[id].md — Stripe invoice detail and email log, Bullhorn One
// activity, Harvest approvals log and withdraw, Instawork hour disputes, Stripe dispute response.
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ApprovalDetailView } from "@/components/shiftbook/approvals/approval-detail";
import { approvalDetail } from "@/server/approvals/service";
import { withAgency } from "@/server/db";
import { currentActor, isDemo } from "@/server/session";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ApprovalPage(props: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);
  if (!UUID.test(id)) notFound();
  const actor = await currentActor();
  // In demo mode the history also opens each email as the approver received it (decision 0012).
  const detail = await withAgency(actor.agencyId, (tx) => approvalDetail(tx, id, { demoCopies: isDemo() }));
  if (!detail) notFound();
  return <ApprovalDetailView detail={detail} demo={isDemo()} />;
}
