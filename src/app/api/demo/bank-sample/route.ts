/** The demo's sample bank file (docs/patterns/bank/import.md), made from the demo's open invoices. */
import { withAgency } from "@/server/db";
import { bankSampleCsv } from "@/server/demo/bank-sample";
import { openInvoicesByClient } from "@/server/receivables/queries";
import { currentActor, isDemo } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!isDemo()) return new Response("Not found", { status: 404 });
  const actor = await currentActor();
  const { csv, today } = await withAgency(actor.agencyId, async (tx) => {
    const today = await agencyToday(tx);
    return { csv: bankSampleCsv(await openInvoicesByClient(tx), today), today };
  });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="demo-bank-activity-${today}.csv"` } });
}
