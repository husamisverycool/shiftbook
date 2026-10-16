/** The margin as CSV: the summary as shown, every line, or overtime not billed (docs/patterns/margin.md). */
import { withAgency } from "@/server/db";
import { marginAsk } from "@/server/margin/ask";
import { marginLinesCsv, marginSummaryCsv, overtimeCsv } from "@/server/margin/csv";
import { marginPeriod, marginView, overtimeView } from "@/server/margin/queries";
import { mayViewMargin } from "@/server/margin/service";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

const GROUP_LABEL = { client: "Client", worker: "Worker", recruiter: "Recruiter", branch: "Branch", week: "Week" } as const;

export async function GET(req: Request): Promise<Response> {
  const actor = currentActor();
  if (!mayViewMargin(actor)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  if (kind !== "summary" && kind !== "lines" && kind !== "overtime") return new Response("Not found", { status: 404 });
  const ask = marginAsk(Object.fromEntries(url.searchParams.entries()));
  const { csv, period } = await withAgency(actor.agencyId, async (tx) => {
    const period = await marginPeriod(tx, await agencyToday(tx), ask.period);
    if (kind === "overtime") return { period, csv: overtimeCsv((await overtimeView(tx, period)).rows) };
    const view = await marginView(tx, { from: period.from, to: period.to, groupBy: ask.groupBy, sort: ask.sort });
    return { period, csv: kind === "summary" ? marginSummaryCsv(view.groups, GROUP_LABEL[ask.groupBy], "None") : marginLinesCsv(view.lines) };
  });
  const name = `${kind === "overtime" ? "overtime-not-billed" : `margin-${kind}`}-${period.from}-to-${period.to}.csv`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
}
