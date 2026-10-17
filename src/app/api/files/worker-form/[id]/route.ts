/**
 * A worker's signed onboarding form for the Owner (slice t), as a worker's file opens (decision 0027):
 * only through the grant handed out after the reason was recorded — the form holds bank details and
 * work-eligibility numbers. Made on request, never stored.
 */
import { appKey } from "@/server/auth/crypto";
import { withAgency } from "@/server/db";
import { can } from "@/server/permissions";
import { currentActor } from "@/server/session";
import { FORM_KINDS, formGrantSubject, type FormKind } from "@/server/worker-app/agency";
import { onboardingFormPdf } from "@/server/worker-app/documents";
import { grantHolds } from "@/server/workers/file-grant";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "";
  if (!UUID.test(id) || !(FORM_KINDS as readonly string[]).includes(kind)) return new Response("Not found", { status: 404 });
  const actor = await currentActor();
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature") ?? "";
  if (!can(actor, "revealSsn") || !grantHolds(appKey(), formGrantSubject(id, kind as FormKind), actor.userId, expires, signature, Math.floor(Date.now() / 1000))) return new Response("Not allowed", { status: 403 });
  const locale = url.searchParams.get("locale") === "es" ? "es" : "en";
  const r = await withAgency(actor.agencyId, (tx) => onboardingFormPdf(tx, id, kind as FormKind, locale, "full"));
  if (!r) return new Response("Not found", { status: 404 });
  return new Response(new Blob([r.bytes as BlobPart]), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${r.filename}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" } });
}
