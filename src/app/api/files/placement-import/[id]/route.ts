import { eq } from "drizzle-orm";
import { writeCsv } from "@/exports/csv";
import { withAgency } from "@/server/db";
import { placementImports } from "@/server/db/schema";
import { keptRowsCsv } from "@/server/placements/service";
import { currentActor } from "@/server/session";
import { documentStore } from "@/server/storage";

export const dynamic = "force-dynamic";

/**
 * An import's files (Avionté's View Imports: "Download CSV"): `?file=rows` the rows as Tabulado kept them
 * (columns holding SSNs or birth dates were removed on receipt; typed fixes applied; rows left out
 * removed), `?file=results` each row's result and
 * reason. Row-level security limits it to the signed-in agency.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const file = new URL(req.url).searchParams.get("file") ?? "rows";
  if ((file !== "rows" && file !== "results") || !/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const actor = await currentActor();
  const [row] = await withAgency(actor.agencyId, (tx) => tx.select().from(placementImports).where(eq(placementImports.id, id))).catch(() => []);
  if (!row) return new Response("Not found", { status: 404 });
  const base = row.filename.replace(/\.(csv|xlsx)$/i, "");
  if (file === "rows") {
    // The rows kept: the typed fixes applied, the rows left out removed, no cell opening as a formula.
    const bytes = await withAgency(actor.agencyId, (tx) => keptRowsCsv(tx, documentStore, id));
    if (!bytes) return new Response("Not found", { status: 404 });
    return new Response(new Blob([bytes as BlobPart]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}-rows.csv"` } });
  }
  if (!row.results) return new Response("Not found", { status: 404 });
  // A value from the file never starts a formula when the CSV is opened (OWASP CSV injection).
  const cell = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
  const bytes = writeCsv([["Row", "Result", "Reason", "Value"], ...row.results.map((r) => [String(r.row), r.outcome, r.reason?.code ?? "", cell(r.reason?.value ?? "")])], { eol: "\r\n" });
  return new Response(new Blob([bytes as BlobPart]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}-results.csv"` } });
}
