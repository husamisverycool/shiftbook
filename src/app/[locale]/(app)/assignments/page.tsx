// Pattern: docs/patterns/assignments.md — Linear issue list grouped by status, Attio preview.
import { setRequestLocale } from "next-intl/server";
import { AssignmentsView } from "@/components/shiftbook/catalog/assignments-view";
import { catalogOptions, listAssignments } from "@/server/catalog/queries";
import { withAgency } from "@/server/db";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function AssignmentsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const actor = currentActor();
  const today = new Date().toISOString().slice(0, 10);
  const { rows, options } = await withAgency(actor.agencyId, async (tx) => ({ rows: await listAssignments(tx, today), options: await catalogOptions(tx) }));
  return <AssignmentsView rows={rows} options={options} today={today} />;
}
