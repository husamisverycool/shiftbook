/**
 * "Cash you are floating" (SPEC §15; slice i, decisions I8 and I9). For each pay period and client
 * whose pay date has passed (the period's end + the pay day in force then): the gross pay of the
 * period's latest paid version for that client's work, less the payments applied to the period's
 * invoices for that client, never below zero. The projection runs the same sum on the next pay date:
 * that payroll added, the open invoices expected in by then counted as collected for their own
 * period — so the margin on one invoice never pays for another week (review finding 3).
 */
import { addDays } from "@shiftbook/rules";

export interface PeriodClientPaid {
  periodId: string;
  periodEndsOn: string;
  payDate: string;
  /** null: the next payroll estimated as a whole (no client yet). */
  clientId: string | null;
  paidCents: number;
}

export interface PeriodClientCollected {
  periodId: string;
  clientId: string;
  collectedCents: number;
}

export interface FloatingRow extends PeriodClientPaid {
  collectedCents: number;
  floatingCents: number;
}

export const payDateOf = (periodEndsOn: string, payDayAfter: number) => addDays(periodEndsOn, payDayAfter);

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function floatingRows(paid: PeriodClientPaid[], collected: PeriodClientCollected[], asOf: string): FloatingRow[] {
  return paid
    .filter((p) => p.payDate <= asOf)
    .map((p) => {
      const collectedCents = p.clientId === null ? 0 : collected.filter((c) => c.periodId === p.periodId && c.clientId === p.clientId).reduce((s, c) => s + c.collectedCents, 0);
      return { ...p, collectedCents, floatingCents: Math.max(0, p.paidCents - collectedCents) };
    })
    .sort((a, b) => cmp(b.payDate, a.payDate) || cmp(a.clientId ?? "", b.clientId ?? ""));
}

/** When an open invoice is expected in: issued + the client's average days to pay (slice h), else its due date. */
export const expectedOn = (i: { issuedOn: string; dueOn: string; averageDays: number | null }) => (i.averageDays === null ? i.dueOn : addDays(i.issuedOn, i.averageDays));

export interface ExpectedInvoice {
  periodId: string;
  clientId: string;
  number: string;
  balanceCents: number;
  expectedOn: string;
}

export interface ProjectionInput {
  asOf: string;
  /** Every paid period's rows (also those whose pay date is still ahead). */
  paid: PeriodClientPaid[];
  collected: PeriodClientCollected[];
  /** The next pay date, and its payroll when it is not in `paid` yet (an estimate). */
  next: { payDate: string; rows: PeriodClientPaid[]; estimate: boolean };
  expected: ExpectedInvoice[];
}

export interface Projection {
  nowCents: number;
  /** The payroll paid after today up to the next pay date. */
  payrollCents: number;
  /** What the invoices expected in by then pay back of what is floating. */
  backCents: number;
  afterCents: number;
  /** The invoices counted on. */
  counted: string[];
  /** Open invoices whose expected date has already passed: not counted on. */
  overdueCents: number;
}

export function projection(p: ProjectionInput): Projection {
  const sum = (rows: FloatingRow[]) => rows.reduce((s, r) => s + r.floatingCents, 0);
  const nowCents = sum(floatingRows(p.paid, p.collected, p.asOf));
  const counted = p.expected.filter((e) => e.expectedOn >= p.asOf && e.expectedOn <= p.next.payDate);
  const overdueCents = p.expected.filter((e) => e.expectedOn < p.asOf).reduce((s, e) => s + e.balanceCents, 0);
  const then = [...p.collected, ...counted.map((e) => ({ periodId: e.periodId, clientId: e.clientId, collectedCents: e.balanceCents }))];
  const afterCents = sum(floatingRows([...p.paid, ...p.next.rows], then, p.next.payDate));
  const payrollCents = [...p.paid.filter((r) => r.payDate > p.asOf && r.payDate <= p.next.payDate), ...p.next.rows].reduce((s, r) => s + r.paidCents, 0);
  return { nowCents, payrollCents, backCents: nowCents + payrollCents - afterCents, afterCents, counted: counted.map((e) => e.number), overdueCents };
}
