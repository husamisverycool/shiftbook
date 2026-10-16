import { eq } from "drizzle-orm";
import { withAgency } from "@/server/db";
import { invoices } from "@/server/db/schema";
import { currentActor } from "@/server/session";
import { documentStore } from "@/server/storage";

export const dynamic = "force-dynamic";

/**
 * Downloads an invoice's stored documents, as made with the run (never made again): the PDF, or with
 * `?file=csv` its lines CSV, or `?file=vms` its SAP Fieldglass upload (slice g). Row-level security
 * limits it to the signed-in agency.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const file = new URL(req.url).searchParams.get("file") ?? "pdf";
  if (file !== "pdf" && file !== "csv" && file !== "vms") return new Response("Not found", { status: 404 });
  const actor = await currentActor();
  const [row] = await withAgency(actor.agencyId, (tx) => tx.select().from(invoices).where(eq(invoices.id, id))).catch(() => []);
  const key = file === "pdf" ? row?.pdfStorageKey : file === "csv" ? row?.csvStorageKey : row?.vmsStorageKey;
  if (!row || !key) return new Response("Not found", { status: 404 });
  const bytes = await documentStore.get(key);
  const [type, name] =
    file === "pdf" ? ["application/pdf", `invoice-${row.number}.pdf`] : file === "csv" ? ["text/csv; charset=utf-8", `invoice-${row.number}.csv`] : ["text/csv; charset=utf-8", `fieldglass-${row.number}.csv`];
  return new Response(new Blob([bytes as BlobPart]), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"` } });
}
