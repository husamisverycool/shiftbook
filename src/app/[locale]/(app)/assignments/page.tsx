// Pattern: docs/patterns/assignments.md — Linear issue list grouped by status, Attio preview.
import { setRequestLocale } from "next-intl/server";
import { AssignmentsView } from "@/components/shiftbook/catalog/assignments-view";
import { catalogOptions, listAssignments } from "@/server/catalog/queries";
import { withAgency } from "@/server/db";
import { agencyToday } from "@/server/settings";
import { mayChangePlacement } from "@/server/margin/service";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function AssignmentsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = await currentActor();
  const { rows, options, today } = await withAgency(actor.agencyId, async (tx) => {
    const day = await agencyToday(tx);
    return { rows: await listAssignments(tx, day), options: await catalogOptions(tx), today: day };
  });
  return <AssignmentsView rows={rows} options={options} today={today} canChange={mayChangePlacement(actor)} />;
}
