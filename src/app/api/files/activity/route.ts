/** The activity log as CSV, following the filters in the address (GitHub's export; decision 0028). */
import { parseActivityFilters } from "@/server/activity/filters";
import { exportActivity, mayViewActivity } from "@/server/activity/queries";
import { withAgency } from "@/server/db";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const actor = await currentActor();
  if (!mayViewActivity(actor)) return new Response("Not allowed", { status: 403 });
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const { csv, from, to } = await withAgency(actor.agencyId, async (tx) => {
    const f = parseActivityFilters(params, await agencyToday(tx));
    return { ...(await exportActivity(tx, actor, f)), from: f.from, to: f.to };
  });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="activity-${from}-to-${to}.csv"`, "Cache-Control": "no-store" } });
}
