/**
 * A stored file (evidence, a certificate, a generated document) for anyone in the agency to read
 * (slice j). Never a worker's own file: those open for the Owner, with a reason, through
 * /api/files/worker/[id] (slice k, decision 0027).
 */
import { complianceDocument } from "@/server/compliance/queries";
import { withAgency } from "@/server/db";
import { currentActor } from "@/server/session";
import { documentStore } from "@/server/storage";
import { isWorkerFile } from "@/server/workers/service";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const actor = await currentActor();
  const found = await withAgency(actor.agencyId, async (tx) => ({ doc: await complianceDocument(tx, id), workers: await isWorkerFile(tx, id) }));
  const doc = found.doc;
  if (!doc) return new Response("Not found", { status: 404 });
  if (found.workers) return new Response("Not allowed", { status: 403 });
  const bytes = await documentStore.get(doc.storageKey);
  // The name as kept, without quotes or line breaks (it goes in a header).
  const name = doc.filename.replace(/["\r\n]/g, "_");
  return new Response(new Blob([bytes as BlobPart]), { headers: { "Content-Type": doc.mediaType, "Content-Disposition": `attachment; filename="${encodeURIComponent(name).replace(/%20/g, " ")}"; filename*=UTF-8''${encodeURIComponent(name)}`, "X-Content-Type-Options": "nosniff" } });
}
