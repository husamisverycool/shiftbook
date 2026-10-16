/**
 * The aging as CSV, as the Receivables page shows it (FreshBooks "Export for Excel"). A cell that a
 * spreadsheet would run as a formula (starting with = + - @, a tab or a carriage return, and not a
 * number) is kept as text with a leading apostrophe before it is quoted (review finding 6).
 */
import { csvCell } from "../../lib/csv-cell";
import { formatCents } from "@shiftbook/rules";
import { BUCKETS, type Bucket } from "./aging";

export interface AgingTable {
  clients: { clientName: string; buckets: Record<Bucket, number>; totalCents: number; daysToPay: { averageDays: number | null } }[];
  totals: Record<Bucket, number>;
  totalCents: number;
}

const money = (c: number) => (c < 0 ? `-${formatCents(-c).slice(1)}` : formatCents(c).slice(1)).replaceAll(",", "");
const cell = csvCell;

export function agingCsv(view: AgingTable): string {
  const head = ["Client", "Current", "1-30", "31-60", "61-90", "91+", "Total", "Days to pay"];
  const rows = view.clients.map((c) => [c.clientName, ...BUCKETS.map((k) => money(c.buckets[k])), money(c.totalCents), c.daysToPay.averageDays === null ? "" : String(c.daysToPay.averageDays)]);
  return [head, ...rows, ["Total", ...BUCKETS.map((k) => money(view.totals[k])), money(view.totalCents), ""]].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
