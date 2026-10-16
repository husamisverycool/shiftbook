/**
 * What the invoices screens show (slice g): the list (docs/patterns/invoices.md), one invoice with
 * its documents and the documents related to it (docs/patterns/invoices/[id].md), and a statement of
 * several of one client's invoices (docs/patterns/_documents/statement.md, decision G1). Invoices
 * are made only by the weekly run; nothing here changes one.
 */
import { formatCents } from "@shiftbook/rules";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { createElement, type ReactElement } from "react";
import en from "../../../messages/en.json";
import { StatementDocument, type StatementData } from "../../pdf/statement";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { fill, longDate, printedInvoice } from "../files/invoice-documents";

export interface InvoiceRow {
  id: string;
  number: string;
  kind: s.InvoiceKind;
  status: (typeof s.invoiceStatus.enumValues)[number];
  clientId: string;
  clientName: string;
  totalCents: number;
  issuedOn: string;
  dueOn: string;
  period: { id: string; startsOn: string; endsOn: string };
  hasCsv: boolean;
  hasVms: boolean;
  /** Made with slice g's stored document (a statement can include it). */
  hasDocument: boolean;
}

const rowsOf = async (tx: Tx, where?: SQL) => {
  const q = tx
    .select({ invoice: s.invoices, clientName: s.clients.name, period: { id: s.payPeriods.id, startsOn: s.payPeriods.startsOn, endsOn: s.payPeriods.endsOn } })
    .from(s.invoices)
    .innerJoin(s.clients, eq(s.clients.id, s.invoices.clientId))
    .innerJoin(s.payRuns, eq(s.payRuns.id, s.invoices.payRunId))
    .innerJoin(s.payPeriods, eq(s.payPeriods.id, s.payRuns.payPeriodId));
  const rows = await (where ? q.where(where) : q).orderBy(desc(s.invoices.issuedOn), desc(s.invoices.createdAt), asc(s.invoices.number));
  return rows.map(
    (r): InvoiceRow => ({
      id: r.invoice.id,
      number: r.invoice.number,
      kind: r.invoice.kind,
      status: r.invoice.status,
      clientId: r.invoice.clientId,
      clientName: r.clientName,
      totalCents: r.invoice.totalCents,
      issuedOn: r.invoice.issuedOn,
      dueOn: r.invoice.dueOn,
      period: r.period,
      hasCsv: r.invoice.csvStorageKey !== null,
      hasVms: r.invoice.vmsStorageKey !== null,
      hasDocument: r.invoice.document !== null,
    }),
  );
};

/** Every invoice, supplemental invoice and credit note, newest first (one run's in number order). */
export function listInvoices(tx: Tx): Promise<InvoiceRow[]> {
  return rowsOf(tx);
}

/** One client's invoices, newest first (the client page). */
export function clientInvoices(tx: Tx, clientId: string): Promise<InvoiceRow[]> {
  return rowsOf(tx, eq(s.invoices.clientId, clientId));
}

export interface InvoiceDetail {
  row: InvoiceRow;
  client: { id: string; name: string; code: string };
  run: { id: string; version: number };
  template: s.InvoiceTemplate;
  poNumber: string | null;
  worksite: string | null;
  /** The PDF's text as issued (null for an invoice made before slice g kept it). */
  printed: { lines: { description: string; detail: string; hours: string; rate: string; amount: string }[]; groups: { title: string; subtotal: string; lines: { description: string; detail: string; hours: string; rate: string; amount: string }[] }[] | null; subtotal: string; total: string } | null;
  backup: s.IssuedInvoice["backup"] | null;
  /** The invoice this one corrects, and the documents that correct it (Stripe history; Bullhorn credits). */
  original: { id: string; number: string; kind: s.InvoiceKind } | null;
  corrections: { id: string; number: string; kind: s.InvoiceKind; totalCents: number; issuedOn: string }[];
}

export async function invoiceDetail(tx: Tx, id: string): Promise<InvoiceDetail | null> {
  const [row] = await rowsOf(tx, eq(s.invoices.id, id));
  if (!row) return null;
  const [inv] = await tx.select().from(s.invoices).where(eq(s.invoices.id, id));
  const [client] = await tx.select({ id: s.clients.id, name: s.clients.name, code: s.clients.code }).from(s.clients).where(eq(s.clients.id, inv!.clientId));
  const [run] = await tx.select({ id: s.payRuns.id, version: s.payRuns.version }).from(s.payRuns).where(eq(s.payRuns.id, inv!.payRunId));
  const [worksite] = inv!.worksiteId ? await tx.select({ name: s.worksites.name }).from(s.worksites).where(eq(s.worksites.id, inv!.worksiteId)) : [];
  const [original] = inv!.originalInvoiceId ? await tx.select({ id: s.invoices.id, number: s.invoices.number, kind: s.invoices.kind }).from(s.invoices).where(eq(s.invoices.id, inv!.originalInvoiceId)) : [];
  const corrections = await tx
    .select({ id: s.invoices.id, number: s.invoices.number, kind: s.invoices.kind, totalCents: s.invoices.totalCents, issuedOn: s.invoices.issuedOn })
    .from(s.invoices)
    .where(eq(s.invoices.originalInvoiceId, id))
    .orderBy(s.invoices.issuedOn, s.invoices.number);
  const doc = inv!.document;
  const pdf = doc ? printedInvoice(doc) : null;
  return {
    row,
    client: client!,
    run: run!,
    template: inv!.template,
    poNumber: inv!.poNumber,
    worksite: worksite?.name ?? null,
    printed: pdf ? { lines: pdf.lines, groups: pdf.groups?.map((g) => ({ title: g.title, subtotal: g.subtotal, lines: g.lines })) ?? null, subtotal: pdf.subtotal, total: pdf.total } : null,
    backup: doc?.backup ?? null,
    original: original ?? null,
    corrections,
  };
}

export type StatementResult =
  | { ok: true; bytes: Uint8Array; filename: string }
  | { ok: false; error: "none" | "not_found" | "several_clients" }
  | { ok: false; error: "before_statements"; number: string };

/**
 * A statement of chosen invoices of one client (decision G1): a first page listing them with their
 * total, then each invoice's pages as issued. Payments stay on each invoice; nothing is stored.
 */
export async function statementPdf(tx: Tx, ids: string[], today: string): Promise<StatementResult> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { ok: false, error: "none" };
  const rows = await rowsOf(tx, inArray(s.invoices.id, unique));
  if (rows.length !== unique.length) return { ok: false, error: "not_found" };
  if (new Set(rows.map((r) => r.clientId)).size > 1) return { ok: false, error: "several_clients" };
  const invoices = await tx.select().from(s.invoices).where(and(inArray(s.invoices.id, unique), eq(s.invoices.clientId, rows[0]!.clientId)));
  // Oldest first, as a statement reads (QuickBooks statements list transactions by date).
  const ordered = [...rows].sort((a, b) => (a.issuedOn < b.issuedOn ? -1 : a.issuedOn > b.issuedOn ? 1 : a.number < b.number ? -1 : 1));
  const missing = ordered.find((r) => !invoices.find((i) => i.id === r.id)!.document);
  if (missing) return { ok: false, error: "before_statements", number: missing.number };
  const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, rows[0]!.clientId));
  const [agency] = await tx.select().from(s.agencies);
  const t = en.statement;
  const data: StatementData = {
    labels: {
      title: t.title,
      date: t.date,
      billTo: en.invoice.billTo,
      number: t.number,
      period: t.period,
      issued: t.issued,
      due: t.due,
      amount: t.amount,
      total: t.total,
      paidSeparately: t.paidSeparately,
      page: (page, pages) => fill(en.invoice.page, { page: String(page), pages: String(pages) }),
    },
    date: longDate(today),
    from: { name: agency!.name, lines: [...agency!.addressLines, agency!.phone ?? "", agency!.email ?? ""].filter(Boolean) },
    billTo: { name: client!.name, lines: [...client!.addressLines, client!.billingEmail ?? ""].filter(Boolean) },
    rows: ordered.map((r) => ({
      number: r.kind === "invoice" ? r.number : `${r.number} (${r.kind === "credit_note" ? t.creditNote : t.supplemental})`,
      period: `${longDate(r.period.startsOn)} – ${longDate(r.period.endsOn)}`,
      issued: longDate(r.issuedOn),
      due: r.kind === "credit_note" ? "—" : longDate(r.dueOn),
      amount: formatCents(r.totalCents),
    })),
    total: formatCents(ordered.reduce((sum, r) => sum + r.totalCents, 0)),
    invoices: ordered.map((r) => printedInvoice(invoices.find((i) => i.id === r.id)!.document!)),
  };
  const bytes = new Uint8Array(await renderToBuffer(createElement(StatementDocument, { data }) as unknown as ReactElement<DocumentProps>));
  return { ok: true, bytes, filename: `statement-${client!.code}-${today}.pdf` };
}
