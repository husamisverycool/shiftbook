/** The aging as CSV, as the Receivables page shows it (docs/patterns/receivables.md; FreshBooks export). */
import { isIsoDate } from "@shiftbook/rules";
import { withAgency } from "@/server/db";
import { agingCsv, receivablesView } from "@/server/receivables/queries";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const asked = new URL(req.url).searchParams.get("asOf");
  const actor = currentActor();
  const { csv, asOf } = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    const asOf = asked && isIsoDate(asked) && asked <= today ? asked : today;
    return { csv: agingCsv(await receivablesView(tx, asOf)), asOf };
  });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="receivables-aging-${asOf}.csv"` } });
}
