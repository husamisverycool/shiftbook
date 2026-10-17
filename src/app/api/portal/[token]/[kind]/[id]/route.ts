/**
 * The client portal's files (slice v): an invoice's PDF (with its backup) or lines CSV, a payment's
 * remittance advice, a document listed for the client. The link is checked on every download, only the
 * link's own client's files come back, and each download is audited with the contact's identity.
 */
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createTranslator } from "next-intl";
import { createElement, type ReactElement } from "react";
import en from "../../../../../../../messages/en.json";
import es from "../../../../../../../messages/es.json";
import { money, shortDate } from "@/components/shiftbook/format";
import { RemittanceDocument } from "@/pdf/remittance";
import { portalFile } from "@/server/portal/service";
import { approvalDeps } from "@/server/services";
import { documentStore } from "@/server/storage";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
const disposition = (name: string) => `attachment; filename="${name.replace(/["\r\n]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;

export async function GET(req: Request, ctx: { params: Promise<{ token: string; kind: string; id: string }> }): Promise<Response> {
  const { token, kind, id } = await ctx.params;
  if (!UUID.test(id) || token.length > 100) return NOT_FOUND();
  const url = new URL(req.url);
  const deps = approvalDeps("");
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
  if (kind === "invoice") {
    const file = url.searchParams.get("file") === "csv" ? "csv" : "pdf";
    const f = await portalFile(deps, token, { invoiceId: id, file });
    if (!f || f.kind === "payment" || f.kind === "document") return NOT_FOUND();
    const bytes = await documentStore.get(f.storageKey);
    return new Response(new Blob([bytes as BlobPart]), { headers: { ...headers, "Content-Type": file === "csv" ? "text/csv; charset=utf-8" : "application/pdf", "Content-Disposition": disposition(f.filename) } });
  }
  if (kind === "document") {
    const f = await portalFile(deps, token, { documentId: id });
    if (!f || f.kind !== "document") return NOT_FOUND();
    const bytes = await documentStore.get(f.storageKey);
    return new Response(new Blob([bytes as BlobPart]), { headers: { ...headers, "Content-Type": f.mediaType, "Content-Disposition": disposition(f.filename) } });
  }
  if (kind === "remittance") {
    const f = await portalFile(deps, token, { paymentId: id });
    if (!f || f.kind !== "payment") return NOT_FOUND();
    // The page's language (the link sends it), else English.
    const locale = url.searchParams.get("locale") === "es" ? "es" : "en";
    const t = createTranslator({ locale, messages: locale === "es" ? es : en, namespace: "remittancePdf" });
    const tm = createTranslator({ locale, messages: locale === "es" ? es : en, namespace: "payments.methods" });
    const p = f.payment;
    const pdf = await renderToBuffer(
      createElement(RemittanceDocument, {
        data: {
          labels: {
            title: t("title"),
            payee: t("payee"),
            payer: t("payer"),
            date: t("date"),
            method: t("method"),
            reference: t("reference"),
            invoice: t("invoice"),
            invoiceDate: t("invoiceDate"),
            invoiceTotal: t("invoiceTotal"),
            applied: t("applied"),
            payment: t("payment"),
            appliedTotal: t("appliedTotal"),
            notApplied: t("notApplied"),
            none: t("none"),
            recordedBy: t("recordedBy", { agency: f.agency.name }),
            page: (page: number, pages: number) => t("page", { page, pages }),
          },
          payee: { name: f.agency.name, lines: [f.agency.phone, f.agency.email].filter((x): x is string => Boolean(x)) },
          payer: f.clientName,
          date: shortDate(p.receivedOn, locale),
          method: tm.has(p.method) ? tm(p.method) : p.method,
          reference: p.reference ?? "—",
          rows: p.lines.map((l) => ({ number: l.number, date: shortDate(l.issuedOn, locale), total: money(l.totalCents, locale), applied: money(l.appliedCents, locale) })),
          payment: money(p.amountCents, locale),
          appliedTotal: money(p.appliedCents, locale),
          notApplied: p.amountCents > p.appliedCents ? money(p.amountCents - p.appliedCents, locale) : null,
        },
      }) as unknown as ReactElement<DocumentProps>,
    );
    return new Response(new Blob([new Uint8Array(pdf) as BlobPart]), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": disposition(`remittance-${p.receivedOn}.pdf`) } });
  }
  return NOT_FOUND();
}
