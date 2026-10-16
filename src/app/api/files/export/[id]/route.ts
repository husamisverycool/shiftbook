import { eq } from "drizzle-orm";
import { withAgency } from "@/server/db";
import { exports } from "@/server/db/schema";
import { currentActor } from "@/server/session";
import { documentStore } from "@/server/storage";

export const dynamic = "force-dynamic";

/** An IIF or a text file is plain text (QuickBooks reads IIF as ASCII text); everything else is CSV. */
const contentType = (filename: string) => (/\.(iif|txt)$/i.test(filename) ? "text/plain; charset=utf-8" : "text/csv; charset=utf-8");

/** Downloads a payroll file; row-level security limits it to the signed-in agency. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const actor = await currentActor();
  const [row] = await withAgency(actor.agencyId, (tx) => tx.select().from(exports).where(eq(exports.id, id))).catch(() => []);
  if (!row) return new Response("Not found", { status: 404 });
  const bytes = await documentStore.get(row.storageKey);
  return new Response(new Blob([bytes as BlobPart]), {
    headers: { "Content-Type": contentType(row.filename), "Content-Disposition": `attachment; filename="${row.filename}"` },
  });
}
