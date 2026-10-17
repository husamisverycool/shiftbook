import { withAgency } from "@/server/db";
import { scheduleOfAccounts } from "@/server/invoices/schedule";
import { actorAllowedTo } from "@/server/session";
import { agencyToday } from "@/server/settings";
import { documentStore } from "@/server/storage";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A factor's schedule of accounts for the chosen open invoices (decision 0040): one .zip with the
 * schedule as CSV and as a PDF to sign, and each invoice's PDF with its timesheet backup. Assigning
 * receivables is the cash ability's (Owner, Billing); row-level security limits it to the agency.
 * A POST from the invoices list's form: making a schedule records it on each invoice, so a GET (a
 * prefetch, a shared link) never does.
 */
export async function POST(req: Request): Promise<Response> {
  const form = await req.formData().catch(() => null);
  const raw = form?.get("ids");
  const ids = (typeof raw === "string" ? raw : "").split(",").filter(Boolean);
  if (ids.length === 0 || ids.length > 200 || !ids.every((x) => UUID.test(x))) return new Response("Not found", { status: 404 });
  const actor = await actorAllowedTo("cash");
  const r = await withAgency(actor.agencyId, async (tx) => scheduleOfAccounts(tx, actor, documentStore, ids, await agencyToday(tx)));
  if (!r.ok) return new Response(r.message ?? r.error, { status: r.error === "not_found" || r.error === "none" ? 404 : 409 });
  return new Response(new Blob([r.bytes as BlobPart]), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${r.filename}"` } });
}
