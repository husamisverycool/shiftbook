import { withAgency } from "@/server/db";
import { statementPdf } from "@/server/invoices/queries";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A statement of several of one client's invoices (decision G1), made on request and not stored. */
export async function GET(req: Request): Promise<Response> {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean);
  if (ids.length === 0 || ids.length > 100 || !ids.every((x) => UUID.test(x))) return new Response("Not found", { status: 404 });
  const actor = await currentActor();
  const r = await withAgency(actor.agencyId, async (tx) => statementPdf(tx, ids, await agencyToday(tx)));
  if (!r.ok) return new Response(r.error === "before_statements" ? `Invoice ${r.number} was made before statements could include it.` : r.error, { status: r.error === "not_found" ? 404 : 409 });
  return new Response(new Blob([r.bytes as BlobPart]), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${r.filename}"` } });
}
