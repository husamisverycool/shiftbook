import { eq } from "drizzle-orm";
import { withAgency } from "@/server/db";
import { invoices } from "@/server/db/schema";
import { currentActor } from "@/server/session";
import { documentStore } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Downloads an invoice PDF; row-level security limits it to the signed-in agency. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const actor = currentActor();
  const [row] = await withAgency(actor.agencyId, (tx) => tx.select().from(invoices).where(eq(invoices.id, id))).catch(() => []);
  if (!row?.pdfStorageKey) return new Response("Not found", { status: 404 });
  const bytes = await documentStore.get(row.pdfStorageKey);
  return new Response(new Blob([bytes as BlobPart]), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="invoice-${row.number}.pdf"` },
  });
}
