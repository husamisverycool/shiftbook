import { and, eq } from "drizzle-orm";
import { withAgency } from "@/server/db";
import { documentPages } from "@/server/db/schema";
import { currentActor } from "@/server/session";
import { documentStore } from "@/server/storage";

export const dynamic = "force-dynamic";

/** A page image for the review panel. Always the redacted copy: identifying numbers stay blacked out. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; page: string }> }): Promise<Response> {
  const { id, page } = await ctx.params;
  const n = Number(page);
  if (!Number.isSafeInteger(n) || n < 1) return new Response("Not found", { status: 404 });
  const actor = await currentActor();
  const [row] = await withAgency(actor.agencyId, (tx) =>
    tx.select().from(documentPages).where(and(eq(documentPages.documentId, id), eq(documentPages.pageNumber, n))),
  ).catch(() => []);
  if (!row) return new Response("Not found", { status: 404 });
  const bytes = await documentStore.get(row.redactedStorageKey);
  return new Response(new Blob([bytes as BlobPart]), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
}
