import { writeCsv } from "@/exports/csv";
import { SOURCES, templateHeader, type Source } from "@/server/placements/fields";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

/** A template to fill for a placement import, per source (Avionté: a template per import type; decision 0040). */
export async function GET(req: Request): Promise<Response> {
  const source = new URL(req.url).searchParams.get("source") ?? "";
  if (!(SOURCES as readonly string[]).includes(source)) return new Response("Not found", { status: 404 });
  await currentActor();
  const bytes = writeCsv([templateHeader(source as Source)], { eol: "\r\n" });
  return new Response(new Blob([bytes as BlobPart]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="placements-template-${source}.csv"` } });
}
