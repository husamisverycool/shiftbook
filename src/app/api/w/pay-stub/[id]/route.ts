import { payStubPdf } from "@/server/worker-app/documents";
import { asWorker, currentWorkerSession } from "@/server/worker-app/session";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The signed-in worker's pay stub for one paid week (docs/patterns/_documents/pay-stub.md), made on request. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const w = await currentWorkerSession();
  if (!w) return new Response("Sign in to the worker app first.", { status: 401 });
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const locale = new URL(req.url).searchParams.get("locale") === "es" ? "es" : "en";
  const r = await asWorker(w, (tx) => payStubPdf(tx, w.workerId, id, locale));
  if (!r) return new Response("Not found", { status: 404 });
  return new Response(new Blob([r.bytes as BlobPart]), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${r.filename}"`, "Cache-Control": "private, no-store" } });
}
