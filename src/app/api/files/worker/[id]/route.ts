/**
 * A worker's file (slice k, decision 0027): only for the Owner, through the grant the reveal handed
 * out after the reason was recorded (a W-4 holds the SSN; a direct deposit form, bank details).
 */
import { and, eq, isNull } from "drizzle-orm";
import { appKey } from "@/server/auth/crypto";
import { withAgency } from "@/server/db";
import * as s from "@/server/db/schema";
import { can } from "@/server/permissions";
import { currentActor } from "@/server/session";
import { documentStore } from "@/server/storage";
import { grantHolds } from "@/server/workers/file-grant";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const actor = await currentActor();
  const url = new URL(req.url);
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature") ?? "";
  if (!can(actor, "revealSsn") || !grantHolds(appKey(), id, actor.userId, expires, signature, Math.floor(Date.now() / 1000))) return new Response("Not allowed", { status: 403 });
  const [doc] = await withAgency(actor.agencyId, (tx) =>
    tx
      .select({ filename: s.complianceDocuments.filename, mediaType: s.complianceDocuments.mediaType, storageKey: s.complianceDocuments.storageKey })
      .from(s.workerDocuments)
      .innerJoin(s.complianceDocuments, eq(s.complianceDocuments.id, s.workerDocuments.documentId))
      .where(and(eq(s.workerDocuments.id, id), isNull(s.workerDocuments.removedAt))),
  );
  if (!doc) return new Response("Not found", { status: 404 });
  const bytes = await documentStore.get(doc.storageKey);
  const name = doc.filename.replace(/["\r\n]/g, "_");
  return new Response(new Blob([bytes as BlobPart]), {
    headers: {
      "Content-Type": doc.mediaType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(name).replace(/%20/g, " ")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
