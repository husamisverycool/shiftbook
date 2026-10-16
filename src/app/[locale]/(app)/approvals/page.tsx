// Pattern: docs/patterns/approvals.md — Harvest approval page, Stripe invoices list, Instawork
// disputes banner, Linear's fixed status order.
import { setRequestLocale } from "next-intl/server";
import { after } from "next/server";
import { ApprovalsView } from "@/components/shiftbook/approvals/approvals-view";
import { listApprovals, sweepReminders } from "@/server/approvals/service";
import { listPeriods } from "@/server/convert/queries";
import { withAgency } from "@/server/db";
import { requestOrigin } from "@/server/request-info";
import { approvalDeps, linkBaseUrl } from "@/server/services";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage(props: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const sp = await props.searchParams;
  const actor = currentActor();
  const { periods, periodId, rows } = await withAgency(actor.agencyId, async (tx) => {
    const periods = await listPeriods(tx);
    const asked = typeof sp.period === "string" ? periods.find((p) => p.id === sp.period) : undefined;
    // The newest period with hours, unless one is chosen.
    const period = asked ?? periods.find((p) => p.started) ?? periods[0];
    return { periods: periods.map((p) => ({ id: p.id, startsOn: p.startsOn, endsOn: p.endsOn })), periodId: period?.id ?? "", rows: period ? await listApprovals(tx, period.id) : [] };
  });
  // Reminders that are due go out after the page is sent (the scheduled route does the same).
  const origin = await requestOrigin();
  after(async () => {
    try {
      await sweepReminders(approvalDeps(linkBaseUrl(origin)), actor.agencyId);
    } catch (error) {
      console.error("reminder sweep failed:", error instanceof Error ? error.message : String(error));
    }
  });
  return <ApprovalsView rows={rows} periods={periods} periodId={periodId} />;
}
