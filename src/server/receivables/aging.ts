/**
 * Aging and days to pay (SPEC §14; slice h decisions H1, H7). Pure: balances and dates in, buckets
 * and averages out, in integer cents and whole days.
 *
 * Buckets by days past due (QuickBooks Online, Xero): Current (not yet due), 1–30, 31–60, 61–90
 * and 91+. A credit (a client's unapplied payment, or a credit note beyond what it corrects) is a
 * negative amount in Current, so a client's total is what it owes net (Xero's detail includes them).
 */
import { roundHalfUpBig } from "@shiftbook/rules";

export const BUCKETS = ["current", "d1_30", "d31_60", "d61_90", "d91_plus"] as const;
export type Bucket = (typeof BUCKETS)[number];

/** Whole days from `from` to `to` (ISO dates; negative when `to` is earlier). */
export function daysFrom(from: string, to: string): number {
  return Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / 86_400_000);
}

/** The bucket of an amount due on `dueOn`, as of `asOf`. */
export function bucketOf(dueOn: string, asOf: string): Bucket {
  const late = daysFrom(dueOn, asOf);
  if (late <= 0) return "current";
  if (late <= 30) return "d1_30";
  if (late <= 60) return "d31_60";
  if (late <= 90) return "d61_90";
  return "d91_plus";
}

export interface OpenItem {
  clientId: string;
  invoiceId: string;
  dueOn: string;
  /** What is left to pay; negative when credit notes exceed what is left (a credit). */
  balanceCents: number;
}

export interface AgingRow {
  clientId: string;
  buckets: Record<Bucket, number>;
  totalCents: number;
  overdueCents: number;
  creditCents: number;
  /** The invoices behind each bucket (the drill-down). */
  invoices: Record<Bucket, string[]>;
}

const empty = <T>(make: () => T) => Object.fromEntries(BUCKETS.map((b) => [b, make()])) as Record<Bucket, T>;

/** One row per client with anything open or any credit, as of `asOf`. */
export function aging(items: OpenItem[], credits: { clientId: string; cents: number }[], asOf: string): AgingRow[] {
  const rows = new Map<string, AgingRow>();
  const row = (clientId: string) => {
    const r = rows.get(clientId) ?? { clientId, buckets: empty(() => 0), totalCents: 0, overdueCents: 0, creditCents: 0, invoices: empty<string[]>(() => []) };
    rows.set(clientId, r);
    return r;
  };
  for (const i of items) {
    if (i.balanceCents === 0) continue;
    const r = row(i.clientId);
    // A credit is not late: it sits in Current.
    const b = i.balanceCents < 0 ? "current" : bucketOf(i.dueOn, asOf);
    r.buckets[b] += i.balanceCents;
    r.invoices[b].push(i.invoiceId);
    r.totalCents += i.balanceCents;
    if (i.balanceCents < 0) r.creditCents -= i.balanceCents;
    else if (b !== "current") r.overdueCents += i.balanceCents;
  }
  for (const c of credits) {
    if (c.cents <= 0) continue;
    const r = row(c.clientId);
    r.buckets.current -= c.cents;
    r.totalCents -= c.cents;
    r.creditCents += c.cents;
  }
  return [...rows.values()];
}

export interface PaidInvoice {
  issuedOn: string;
  dueOn: string;
  /** The date of the payment that paid it off. */
  paidOn: string;
}

export interface DaysToPay {
  invoices: number;
  totalDays: number;
  /** Rounded half up once; null with no invoice. */
  averageDays: number | null;
  averageDaysLate: number | null;
  explain: string;
}

/**
 * The simple average of the days from issue to the payment that paid each invoice off (Xero,
 * QuickBooks Desktop), and the average days late against the due date (Workday; on-time counts 0).
 */
export function daysToPay(paid: PaidInvoice[]): DaysToPay {
  if (paid.length === 0) return { invoices: 0, totalDays: 0, averageDays: null, averageDaysLate: null, explain: "No invoice paid in full in the window." };
  const totalDays = paid.reduce((sum, p) => sum + Math.max(0, daysFrom(p.issuedOn, p.paidOn)), 0);
  const totalLate = paid.reduce((sum, p) => sum + Math.max(0, daysFrom(p.dueOn, p.paidOn)), 0);
  const n = BigInt(paid.length);
  const averageDays = roundHalfUpBig(BigInt(totalDays), n);
  const averageDaysLate = roundHalfUpBig(BigInt(totalLate), n);
  return {
    invoices: paid.length,
    totalDays,
    averageDays,
    averageDaysLate,
    explain: `${paid.length} invoice${paid.length === 1 ? "" : "s"} paid in full, ${totalDays} days from issue to payment in total → ${averageDays} days on average (rounded half up); ${totalLate} days past due in total → ${averageDaysLate} days late on average.`,
  };
}
