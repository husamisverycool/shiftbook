import { FORM_KINDS, type FormKind } from "@/server/worker-app/agency";
import { onboardingFormPdf } from "@/server/worker-app/documents";
import { asWorker, currentWorkerSession } from "@/server/worker-app/session";

export const dynamic = "force-dynamic";

/** The signed-in worker's own signed form (docs/patterns/_documents/onboarding-form.md), made on request. */
export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }): Promise<Response> {
  const { kind } = await ctx.params;
  const w = await currentWorkerSession();
  if (!w) return new Response("Sign in to the worker app first.", { status: 401 });
  if (!(FORM_KINDS as readonly string[]).includes(kind)) return new Response("Not found", { status: 404 });
  const locale = new URL(req.url).searchParams.get("locale") === "es" ? "es" : "en";
  const r = await asWorker(w, (tx) => onboardingFormPdf(tx, w.workerId, kind as FormKind, locale));
  if (!r) return new Response("Not found", { status: 404 });
  return new Response(new Blob([r.bytes as BlobPart]), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${r.filename}"`, "Cache-Control": "private, no-store" } });
}
