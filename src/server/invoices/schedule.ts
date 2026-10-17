/**
 * A factor's schedule of accounts as one file (decision 0040): the schedule as CSV and as a PDF to
 * sign, and each invoice's PDF as issued (its timesheet backup is inside it), zipped. Made on request
 * from the issued invoices, never stored; recorded in the activity log so the agency can see what it
 * assigned and when.
 */
import { createHash } from "node:crypto";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { and, eq, inArray, sql } from "drizzle-orm";
import { zipSync } from "fflate";
import { createElement, type ReactElement } from "react";
import { formatCents } from "@shiftbook/rules";
import en from "../../../messages/en.json";
import { backupFileName, renderScheduleCsv, scheduleNumber, scheduleRefusal, type ScheduleInvoice } from "../../exports/schedule-of-accounts";
import { ScheduleDocument, type ScheduleData } from "../../pdf/schedule-of-accounts";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { fill, longDate } from "../files/invoice-documents";
import { invoiceBalances } from "../receivables/balances";
import type { Actor } from "../session";
import type { DocumentStore } from "../storage";

export type ScheduleResult = { ok: true; bytes: Uint8Array; filename: string; number: string; count: number; totalCents: number } | { ok: false; error: "none" | "not_found" | "refused" | "no_document"; message?: string };

/** The invoices with what is still owed on each as of `asOf` (payments, credit notes, write-offs, credit applied). */
export async function scheduleInvoices(tx: Tx, ids: string[], asOf: string): Promise<ScheduleInvoice[] | null> {
  const unique = [...new Set(ids)];
  const rows = await tx
    .select({ invoice: s.invoices, client: s.clients, endsOn: s.payPeriods.endsOn })
    .from(s.invoices)
    .innerJoin(s.clients, eq(s.clients.id, s.invoices.clientId))
    .innerJoin(s.payRuns, eq(s.payRuns.id, s.invoices.payRunId))
    .innerJoin(s.payPeriods, eq(s.payPeriods.id, s.payRuns.payPeriodId))
    .where(inArray(s.invoices.id, unique));
  if (rows.length !== unique.length) return null;
  const balances = new Map((await invoiceBalances(tx, { invoiceIds: unique, asOf })).map((b) => [b.invoice.id, b.balanceCents]));
  return rows.map((r) => ({
    id: r.invoice.id,
    number: r.invoice.number,
    kind: r.invoice.kind,
    status: r.invoice.status,
    issuedOn: r.invoice.issuedOn,
    dueOn: r.invoice.dueOn,
    poNumber: r.invoice.poNumber,
    weekEnding: r.endsOn,
    totalCents: r.invoice.totalCents,
    // A credit note, or an invoice issued after the schedule's date, has no balance here: refused as owing nothing.
    balanceCents: balances.get(r.invoice.id) ?? 0,
    debtor: { name: r.client.name, addressLines: r.client.addressLines },
  }));
}

export async function scheduleOfAccounts(tx: Tx, actor: Actor, store: DocumentStore, ids: string[], today: string): Promise<ScheduleResult> {
  if (ids.length === 0) return { ok: false, error: "none" };
  const invoices = await scheduleInvoices(tx, ids, today);
  if (!invoices) return { ok: false, error: "not_found" };
  const refused = invoices.map(scheduleRefusal).find((r) => r !== null);
  if (refused) return { ok: false, error: "refused", message: refused };
  // A receivable is assigned once: an invoice already on another schedule is refused (the same
  // schedule — the same invoices on the same day — may be made again).
  const number = scheduleNumber(today, invoices.map((i) => i.id), (t) => createHash("sha256").update(t).digest("hex"));
  const earlier = await tx
    .select({ entityId: s.auditEvents.entityId, after: s.auditEvents.after })
    .from(s.auditEvents)
    .where(and(eq(s.auditEvents.action, "export"), eq(s.auditEvents.entityType, "invoice"), inArray(s.auditEvents.entityId, invoices.map((i) => i.id)), sql`${s.auditEvents.after} ? 'scheduleOfAccounts'`));
  for (const e of earlier) {
    const on = (e.after as { scheduleOfAccounts?: string } | null)?.scheduleOfAccounts;
    if (on && on !== number) return { ok: false, error: "refused", message: `${invoices.find((i) => i.id === e.entityId)!.number} is already on schedule ${on}; a receivable is assigned only once.` };
  }
  const keys = await tx.select({ id: s.invoices.id, number: s.invoices.number, key: s.invoices.pdfStorageKey }).from(s.invoices).where(inArray(s.invoices.id, invoices.map((i) => i.id)));
  const missing = keys.find((k) => !k.key);
  if (missing) return { ok: false, error: "no_document", message: missing.number };
  const [agency] = await tx.select().from(s.agencies);

  const csv = renderScheduleCsv({ number, date: today, agencyName: agency!.name, invoices });
  const sorted = [...invoices].sort((a, b) => (a.issuedOn < b.issuedOn ? -1 : a.issuedOn > b.issuedOn ? 1 : a.number < b.number ? -1 : 1));
  const t = en.scheduleOfAccounts.pdf;
  const data: ScheduleData = {
    labels: {
      title: t.title,
      number: t.number,
      date: t.date,
      seller: t.seller,
      assignedTo: t.assignedTo,
      debtor: t.debtor,
      invoice: t.invoice,
      issued: t.issued,
      due: t.due,
      reference: t.reference,
      amount: t.amount,
      total: fill(t.total, { count: String(sorted.length) }),
      certification: fill(t.certification, { seller: agency!.name }),
      signature: t.signature,
      printedName: t.printedName,
      titleLine: t.titleLine,
      dateLine: t.dateLine,
      factorUse: t.factorUse,
      page: (page, pages) => fill(en.invoice.page, { page: String(page), pages: String(pages) }),
    },
    number,
    date: longDate(today),
    seller: { name: agency!.name, lines: [...agency!.addressLines, agency!.phone ?? "", agency!.email ?? ""].filter(Boolean) },
    rows: sorted.map((i) => ({ debtor: i.debtor.name, debtorLines: i.debtor.addressLines, invoice: i.number, issued: longDate(i.issuedOn), due: longDate(i.dueOn), reference: i.poNumber ?? "—", amount: formatCents(i.balanceCents) })),
    total: formatCents(csv.totalCents),
  };
  const pdf = new Uint8Array(await renderToBuffer(createElement(ScheduleDocument, { data }) as unknown as ReactElement<DocumentProps>));

  const files: Record<string, Uint8Array> = { [csv.filename]: csv.bytes, [`schedule-of-accounts-${number}.pdf`]: pdf };
  for (const i of sorted) files[backupFileName(i)] = await store.get(keys.find((k) => k.id === i.id)!.key!);
  const bytes = zipSync(files, { level: 6 });

  // Each invoice's history shows the schedule it went out on (one event per invoice), with the CSV's
  // fingerprint so the factor's copy can be matched later.
  const sha256 = createHash("sha256").update(csv.bytes).digest("hex");
  await audit(
    tx,
    actor,
    sorted.map((i) => ({ action: "export" as const, entityType: "invoice", entityId: i.id, after: { scheduleOfAccounts: number, invoices: csv.count, totalCents: csv.totalCents, balanceCents: i.balanceCents, sha256 } })),
  );
  return { ok: true, bytes, filename: `schedule-of-accounts-${number}.zip`, number, count: csv.count, totalCents: csv.totalCents };
}
