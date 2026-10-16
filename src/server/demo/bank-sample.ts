/**
 * The demo's sample bank file (slice h, docs/patterns/bank/import.md: "in demo mode a link to
 * download a sample bank file"). Made from the demo's open invoices when asked, so it always has
 * something to match: one deposit naming an invoice and paying it exactly, one naming a client and
 * paying short (a bank fee kept back), a transfer from savings and a payroll withdrawal. Laid out
 * like a business checking export (posting date, description, signed amount, type, check number).
 * The deposits are dated today: the demo's invoices are issued the day its week is run, and money
 * does not arrive before its invoice. Everything in it is invented demo data.
 */
import { addDays, type IsoDate } from "@shiftbook/rules";

export interface SampleClient {
  name: string;
  invoices: { number: string; dueOn: string; balanceCents: number }[];
}

/** The fee a bank keeps back from the short deposit, in cents. */
const KEPT_BACK = 2500;

const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const amount = (cents: number) => `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;
/** A client's name as a bank prints it: capitals, without "(demo)". */
const bankName = (name: string) => name.replace(/\(.*?\)/g, "").trim().toUpperCase();

export function bankSampleCsv(clients: SampleClient[], today: IsoDate): string {
  const withOpen = clients.filter((c) => c.invoices.some((i) => i.balanceCents > 0));
  const rows: string[][] = [];
  const first = withOpen[0];
  const firstInvoice = first?.invoices.find((i) => i.balanceCents > 0);
  if (first && firstInvoice) rows.push([usDate(today), `ACH CREDIT ${bankName(first.name)} PAYMENT INV ${firstInvoice.number}`, amount(firstInvoice.balanceCents), "ACH_CREDIT", ""]);
  // The second client when there is one; otherwise the first client's next invoice.
  const second = withOpen[1] ?? first;
  const secondInvoice = second?.invoices.find((i) => i.balanceCents > KEPT_BACK * 2 && i !== firstInvoice);
  if (second && secondInvoice) rows.push([usDate(today), `DEPOSIT ${bankName(second.name)} AP REMITTANCE`, amount(secondInvoice.balanceCents - KEPT_BACK), "ACH_CREDIT", ""]);
  rows.push([usDate(today), "ONLINE TRANSFER FROM SAVINGS ACCOUNT ENDING 0000", amount(500000), "ACCT_XFER", ""]);
  rows.push([usDate(addDays(today, -1)), "ACH DEBIT PAYROLL SERVICE DEMO NET PAY", amount(-1234567), "ACH_DEBIT", ""]);
  const head = ["Posting Date", "Description", "Amount", "Type", "Check or Slip #"];
  const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  return [head, ...rows].map((r) => r.map(quote).join(",")).join("\r\n") + "\r\n";
}
