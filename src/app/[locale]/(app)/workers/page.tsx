// Pattern: docs/patterns/workers.md — Toast Payroll Team page.
import { setRequestLocale } from "next-intl/server";
import { WorkersView } from "@/components/shiftbook/workers/workers-view";
import { withAgency } from "@/server/db";
import { agencyToday } from "@/server/settings";
import { currentActor } from "@/server/session";
import { workerListView } from "@/server/workers/queries";

export const dynamic = "force-dynamic";

export default async function WorkersPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  // Every worker, ended ones too: the search finds them and "Include ended" shows them without a round trip.
  const view = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    return { today, ...(await workerListView(tx, { today, includeEnded: true })) };
  });
  return <WorkersView rows={view.rows} system={view.system} today={view.today} />;
}
