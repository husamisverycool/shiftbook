/**
 * A factor's schedule of accounts (SPEC §27 item 4; decision 0040; research
 * docs/research/connections-exports-slice-s.md §6): the invoices an agency assigns to its factor,
 * each with "the correct amount owed by the Account Debtor, the name and address of the Account
 * Debtor, the invoice number, and the invoice date" (an SEC-filed factoring agreement), in the columns
 * of a published schedule form (debtor, invoice number, date, reference / PO, amount) plus the due
 * date, terms and week ending a staffing factor checks against the timesheets. A footer row carries
 * the count and the totals; the file is read back and must equal the invoices exactly.
 *
 * Each row states the invoice's total and what is still owed on it (its balance after payments,
 * credit notes, write-offs and credit applied, as receivables computes it): the agreement's "correct
 * amount owed" is the balance, so the schedule's total is the balances' (review finding 1).
 *
 * Pure: issued invoices in, bytes out. Amounts are cents from the invoices and their balances, never
 * recomputed here.
 */
import { formatCents, toDayNumber } from "@shiftbook/rules";
import { readCsv, writeCsv } from "./csv";
import { ExportError } from "./errors";
import { formatDate, readTwoDecimals, twoDecimals } from "./lines";

export interface ScheduleInvoice {
  id: string;
  number: string;
  kind: "invoice" | "supplemental" | "credit_note";
  status: "draft" | "issued" | "paid" | "void";
  issuedOn: string;
  dueOn: string;
  poNumber: string | null;
  /** The last day of the pay period the invoice bills. */
  weekEnding: string;
  totalCents: number;
  /** What is still owed on it, as of the schedule's date. */
  balanceCents: number;
  debtor: { name: string; addressLines: string[] };
}

export interface ScheduleInput {
  number: string;
  date: string;
  agencyName: string;
  invoices: ScheduleInvoice[];
}

export const SCHEDULE_HEADER = [
  "Schedule Number",
  "Schedule Date",
  "Client (Seller)",
  "Debtor Name",
  "Debtor Address",
  "Invoice Number",
  "Invoice Date",
  "Due Date",
  "Terms (days)",
  "PO / Reference",
  "Week Ending",
  "Invoice Amount",
  "Balance Owed",
  "Backup File",
] as const;

/** Same CSV-injection guard as the invoice files: typed text never starts a formula. */
const text = (value: string | null) => (value === null ? "" : /^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
const daysBetween = (from: string, to: string) => toDayNumber(to) - toDayNumber(from);

/** Why an invoice cannot go on a schedule, or null. A factor buys open receivables only. */
export function scheduleRefusal(i: ScheduleInvoice): string | null {
  if (i.kind === "credit_note") return `${i.number} is a credit note; a factor buys amounts owed, so it reduces the original invoice instead.`;
  if (i.status !== "issued") return `${i.number} is ${i.status === "paid" ? "paid" : i.status === "void" ? "void" : "not issued yet"}; only open invoices can be assigned.`;
  if (i.totalCents <= 0 || i.balanceCents <= 0) return `${i.number} owes nothing.`;
  return null;
}

/** Oldest first, as the published form lists them; ties by number. */
const ordered = (invoices: ScheduleInvoice[]) => [...invoices].sort((a, b) => (a.issuedOn < b.issuedOn ? -1 : a.issuedOn > b.issuedOn ? 1 : a.number < b.number ? -1 : 1));

/** The invoice's PDF in the zip: its number made safe, then its id, so two numbers never share a name. */
export function backupFileName(i: Pick<ScheduleInvoice, "number" | "id">): string {
  return `invoices/invoice-${i.number.replace(/[^A-Za-z0-9._-]/g, "_")}-${i.id.slice(0, 8)}.pdf`;
}

export function renderScheduleCsv(input: ScheduleInput): { filename: string; bytes: Uint8Array; count: number; totalCents: number; invoicedCents: number } {
  if (input.invoices.length === 0) throw new ExportError("unknown_format", "Choose at least one open invoice.");
  if (new Set(input.invoices.map((i) => i.id)).size !== input.invoices.length) throw new ExportError("unknown_format", "An invoice is listed twice.");
  for (const i of input.invoices) {
    const refusal = scheduleRefusal(i);
    if (refusal) throw new ExportError("unsupported_earning_type", refusal);
  }
  const rows = ordered(input.invoices);
  if (new Set(rows.map(backupFileName)).size !== rows.length) throw new ExportError("unknown_format", "Two invoices would share a backup file name.");
  const date = formatDate(input.date, "MM/DD/YYYY");
  const invoicedCents = rows.reduce((s, i) => s + i.totalCents, 0);
  const totalCents = rows.reduce((s, i) => s + i.balanceCents, 0);
  const lines: string[][] = [
    [...SCHEDULE_HEADER],
    ...rows.map((i) => [
      input.number,
      date,
      text(input.agencyName),
      text(i.debtor.name),
      text(i.debtor.addressLines.join(", ")),
      text(i.number),
      formatDate(i.issuedOn, "MM/DD/YYYY"),
      formatDate(i.dueOn, "MM/DD/YYYY"),
      String(daysBetween(i.issuedOn, i.dueOn)),
      text(i.poNumber),
      formatDate(i.weekEnding, "MM/DD/YYYY"),
      twoDecimals(i.totalCents),
      twoDecimals(i.balanceCents),
      backupFileName(i),
    ]),
    ["Total", "", "", "", "", `${rows.length} invoices`, "", "", "", "", "", twoDecimals(invoicedCents), twoDecimals(totalCents), ""],
  ];
  const bytes = writeCsv(lines, { eol: "\r\n" });

  // Read back: every invoice once with its amount and balance, and the footer's totals.
  const read = readCsv(new TextDecoder().decode(bytes));
  const body = read.slice(1, -1);
  const problems: string[] = body.length !== rows.length ? [`rows ${body.length} ≠ ${rows.length}`] : [];
  body.forEach((r, n) => {
    const i = rows[n]!;
    if (r[5] !== text(i.number) || readTwoDecimals(r[11] ?? "", "amount", "schedule") !== i.totalCents || readTwoDecimals(r[12] ?? "", "balance", "schedule") !== i.balanceCents)
      problems.push(`row ${n + 1} is not ${i.number} for ${formatCents(i.totalCents)} with ${formatCents(i.balanceCents)} owed`);
  });
  const footer = read.at(-1)!;
  if (readTwoDecimals(footer[11] ?? "", "total", "schedule") !== invoicedCents || readTwoDecimals(footer[12] ?? "", "total", "schedule") !== totalCents) problems.push("the totals");
  if (problems.length > 0) throw new ExportError("does_not_reconcile", `The schedule does not reconcile to its invoices: ${problems.join("; ")}.`);
  return { filename: `schedule-of-accounts-${input.number}.csv`, bytes, count: rows.length, totalCents, invoicedCents };
}

/** A schedule's number: its date and a short fingerprint of its invoices, so the same choice names itself. */
export function scheduleNumber(date: string, invoiceIds: string[], hash: (text: string) => string): string {
  return `SOA-${date.replaceAll("-", "")}-${hash([...invoiceIds].sort().join(",")).slice(0, 6).toUpperCase()}`;
}
