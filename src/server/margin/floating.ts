/**
 * "Cash you are floating" (SPEC §15; slice i, decisions I8 and I9): for each run and client whose pay
 * date has passed, the gross pay for that client's work less the payments applied to that run's
 * invoices for it, never below zero; and what the next payroll adds before the money expected in
 * arrives (Xero: invoices expected by a date; a projected balance).
 */
import { addDays, formatCents } from "@shiftbook/rules";

export interface RunClientPaid {
  runId: string;
  periodEndsOn: string;
  clientId: string;
  paidCents: number;
}

export interface RunClientCollected {
  runId: string;
  clientId: string;
  collectedCents: number;
}

export interface FloatingRow extends RunClientPaid {
  payDate: string;
  collectedCents: number;
  floatingCents: number;
}

export const payDateOf = (periodEndsOn: string, payDayAfter: number) => addDays(periodEndsOn, payDayAfter);

export function floatingRows(paid: RunClientPaid[], collected: RunClientCollected[], asOf: string, payDayAfter: number): FloatingRow[] {
  return paid
    .map((p) => {
      const collectedCents = collected.filter((c) => c.runId === p.runId && c.clientId === p.clientId).reduce((s, c) => s + c.collectedCents, 0);
      return { ...p, payDate: payDateOf(p.periodEndsOn, payDayAfter), collectedCents, floatingCents: Math.max(0, p.paidCents - collectedCents) };
    })
    .filter((r) => r.payDate <= asOf)
    .sort((a, b) => (a.payDate < b.payDate ? 1 : a.payDate > b.payDate ? -1 : a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0));
}

/** When an open invoice is expected in: issued + the client's average days to pay (slice h), else its due date. */
export const expectedOn = (i: { issuedOn: string; dueOn: string; averageDays: number | null }) => (i.averageDays === null ? i.dueOn : addDays(i.issuedOn, i.averageDays));

export interface ProjectionInput {
  floatingNowCents: number;
  payDate: string;
  payroll: { cents: number; estimate: boolean };
  expected: { number: string; clientName: string; balanceCents: number; expectedOn: string }[];
}

export function projection(p: ProjectionInput): { expectedCents: number; afterCents: number; explain: string } {
  const by = p.expected.filter((e) => e.expectedOn <= p.payDate);
  const expectedCents = by.reduce((s, e) => s + e.balanceCents, 0);
  const afterCents = Math.max(0, p.floatingNowCents + p.payroll.cents - expectedCents);
  const which = by.length === 0 ? "" : ` (${by.map((e) => e.number).join(", ")})`;
  const raw = p.floatingNowCents + p.payroll.cents - expectedCents;
  return {
    expectedCents,
    afterCents,
    explain: `${formatCents(p.floatingNowCents)} floating now + ${formatCents(p.payroll.cents)} payroll on ${p.payDate}${p.payroll.estimate ? " (an estimate: the average of the last four paid weeks)" : ""} − ${formatCents(expectedCents)} expected in by then${which} = ${formatCents(raw)}${raw < 0 ? ", so nothing floating" : ""}.`,
  };
}
