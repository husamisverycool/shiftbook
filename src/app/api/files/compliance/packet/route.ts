/** The workers' comp packet as PDF or CSV for a range of pay dates (docs/patterns/compliance/workers-comp.md). */
import { isIsoDate } from "@shiftbook/rules";
import { packetCsv, packetPdf, wcPacketView } from "@/server/compliance/documents";
import { withAgency } from "@/server/db";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const format = url.searchParams.get("format");
  if (!isIsoDate(from) || !isIsoDate(to) || to < from || (format !== "pdf" && format !== "csv")) return new Response("Not found", { status: 404 });
  const order = url.searchParams.get("order") === "class" ? "class" : "state";
  const actor = currentActor();
  const body = await withAgency(actor.agencyId, async (tx) => {
    const v = await wcPacketView(tx, { from, to, order });
    return format === "csv" ? new TextEncoder().encode(packetCsv(v)) : await packetPdf(tx, v, await agencyToday(tx));
  });
  const name = `workers-comp-${from}-to-${to}.${format}`;
  return new Response(new Blob([body as BlobPart]), { headers: { "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/pdf", "Content-Disposition": `attachment; filename="${name}"` } });
}
