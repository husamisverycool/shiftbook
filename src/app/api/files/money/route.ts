/**
 * Money downloads (slice w; docs/patterns/money/*): a run's payroll payload in a partner's format, an
 * invoice's funding packet, and the broker's payroll by class as CSV. The Owner only ("money"); every
 * payload or packet download is an export in the activity log. No payload holds an SSN or bank details.
 */
import { createHash } from "node:crypto";
import { isIsoDate } from "@shiftbook/rules";
import { audit } from "@/server/audit";
import { wcPacketView } from "@/server/compliance/documents";
import { withAgency } from "@/server/db";
import { brokerCsv } from "@/server/money/broker-csv";
import { payloadBytes } from "@/server/money/payroll-payload";
import { fundingView, payrollHandoffView } from "@/server/money/queries";
import { can } from "@/server/permissions";
import { currentActor } from "@/server/session";
import { agencyToday } from "@/server/settings";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new Response("Not found", { status: 404 });
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

export async function GET(req: Request): Promise<Response> {
  const actor = await currentActor();
  if (!can(actor, "money")) return notFound();
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");

  if (kind === "payroll") {
    const runId = url.searchParams.get("run") ?? "";
    const shape = url.searchParams.get("shape");
    if (!UUID.test(runId) || (shape !== "check" && shape !== "zeal" && shape !== "file")) return notFound();
    const body = await withAgency(actor.agencyId, async (tx) => {
      const view = await payrollHandoffView(tx, runId);
      if (!view) return null;
      const text = payloadBytes(shape === "check" ? view.payload.check : shape === "zeal" ? view.payload.zeal : view.payload.neutral);
      await audit(tx, actor, [{ action: "export", entityType: "pay_run", entityId: runId, after: { file: "payroll_payload", shape, sha256: sha(text) } }]);
      return { text, name: `payroll-${view.run.periodStart}-to-${view.run.periodEnd}-v${view.run.version}-${shape}.json` };
    });
    if (!body) return notFound();
    return new Response(body.text, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${body.name}"` } });
  }

  if (kind === "funding") {
    const invoiceId = url.searchParams.get("invoice") ?? "";
    if (!UUID.test(invoiceId)) return notFound();
    const body = await withAgency(actor.agencyId, async (tx) => {
      const p = (await fundingView(tx, await agencyToday(tx), { invoiceId })).packets[0];
      if (!p) return null;
      const text = payloadBytes({ schedule_of_accounts: p.schedule, eligible: p.eligible, reasons: p.reasons, offer: p.offer, facts: p.facts, age_days: p.ageDays, aging_bucket: p.bucket, concentration_bps: p.concentrationBps, dispute_rate_bps: p.disputeRateBps, backup_included: p.invoice.hasBackup });
      await audit(tx, actor, [{ action: "export", entityType: "invoice", entityId: invoiceId, after: { file: "funding_packet", sha256: sha(text) } }]);
      return { text, name: `funding-packet-${p.invoice.number.replace(/[^A-Za-z0-9-]+/g, "-")}.json` };
    });
    if (!body) return notFound();
    return new Response(body.text, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${body.name}"` } });
  }

  if (kind === "insurance") {
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (!isIsoDate(from) || !isIsoDate(to) || to < from) return notFound();
    // Audited like the payroll and funding files (money review B4).
    const csv = await withAgency(actor.agencyId, async (tx) => {
      const text = brokerCsv(await wcPacketView(tx, { from, to, order: "class" }));
      await audit(tx, actor, [{ action: "export", entityType: "agency", entityId: actor.agencyId, after: { file: "payroll_by_class", from, to, sha256: sha(text) } }]);
      return text;
    });
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="payroll-by-class-${from}-to-${to}.csv"` } });
  }

  return notFound();
}
