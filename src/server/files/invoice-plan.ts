/**
 * Which invoices a run will create, checked before anyone clicks "Create files": one per client
 * billed, the client's billing profile in effect on the period's last day (PO, terms), an invoice
 * number not used before, and a total that fits the database. The run turns problems into blockers;
 * the files service creates exactly these invoices.
 */
import { formatCents, type EarningType, type Fraction } from "@shiftbook/rules";
import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "../db/client";
import { settlement } from "../run/differences";
import * as s from "../db/schema";

const INT4_MAX = 2_147_483_647;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const effective = (date: string, from: string, to: string | null) => from <= date && (to === null || date <= to);

export interface InvoicePlan {
  clientId: string;
  client: typeof s.clients.$inferSelect;
  profile: typeof s.clientBillingProfiles.$inferSelect;
  number: string;
  /** A credit note's is negative. */
  totalCents: number;
  /** Slice e: a correction's documents name the invoice they correct. */
  kind: s.InvoiceKind;
  original: { id: string; number: string } | null;
}

export async function planInvoices(
  tx: Tx,
  period: { startsOn: string; endsOn: string },
  bill: { clientId: string; amountCents: number }[],
): Promise<{ plans: InvoicePlan[]; problems: string[] }> {
  const clientIds = [...new Set(bill.map((l) => l.clientId))].sort(cmp);
  if (clientIds.length === 0) return { plans: [], problems: [] };
  const clients = await tx.select().from(s.clients).where(inArray(s.clients.id, clientIds));
  const profiles = await tx.select().from(s.clientBillingProfiles).where(inArray(s.clientBillingProfiles.clientId, clientIds));
  const plans: InvoicePlan[] = [];
  const problems: string[] = [];
  for (const clientId of clientIds) {
    const client = clients.find((c) => c.id === clientId)!;
    const inEffect = profiles.filter((p) => p.clientId === clientId && effective(period.endsOn, p.effectiveFrom, p.effectiveTo));
    const totalCents = bill.filter((l) => l.clientId === clientId).reduce((sum, l) => sum + l.amountCents, 0);
    const number = `${client.code}-${period.startsOn.replaceAll("-", "")}`;
    if (inEffect.length !== 1) {
      problems.push(`${client.name}: ${inEffect.length === 0 ? "no billing profile is" : `${inEffect.length} billing profiles are`} in effect on ${period.endsOn}, the invoice date basis, so its PO and payment terms are unknown.`);
      continue;
    }
    if (totalCents < 0 || totalCents > INT4_MAX) {
      problems.push(`${client.name}: the invoice total is too large to store; check the bill rates.`);
      continue;
    }
    plans.push({ clientId, client, profile: inEffect[0]!, number, totalCents, kind: "invoice", original: null });
  }
  const numbers = plans.map((p) => p.number);
  const taken = numbers.length > 0 ? await tx.select({ number: s.invoices.number }).from(s.invoices).where(inArray(s.invoices.number, numbers)) : [];
  for (const p of plans) {
    if (taken.some((t) => t.number === p.number)) problems.push(`${p.client.name}: invoice number ${p.number} was already issued.`);
    else if (numbers.filter((n) => n === p.number).length > 1) problems.push(`${p.client.name}: another client billed in this run has the same client code (${p.client.code}), so both invoices would be numbered ${p.number}.`);
  }
  return { plans, problems };
}

/**
 * A correction's documents (decision E11), per client whose billed difference is not zero: a
 * supplemental invoice for more billed, numbered `{original}-S{n}` (Bullhorn rebill: the original
 * number with a suffix), or a credit note for less, `{original}-CN-{nn}` (Stripe), each naming the
 * client's original invoice for the period. A client billed for the first time gets an ordinary
 * invoice. A client whose differences net to zero gets no document.
 */
type BillDifference = { clientId?: string; amountCents: number; minutes?: number; type?: EarningType; rate?: Fraction; workweekStart?: string; wasLines?: number; nowLines?: number };

/**
 * Per client, the net billed difference and whether anything changed beyond the cent that rounding
 * each line once leaves when hours move at one rate (the same rule as pay: run/differences.ts).
 */
export function clientNets(differences: BillDifference[]): Map<string, { netCents: number; real: boolean }> {
  const out = new Map<string, { netCents: number; real: boolean }>();
  for (const clientId of [...new Set(differences.map((d) => d.clientId).filter((x): x is string => Boolean(x)))].sort(cmp)) {
    const mine = differences.filter((d) => d.clientId === clientId);
    const full = mine.filter((d) => d.type !== undefined && d.rate !== undefined && d.minutes !== undefined && d.workweekStart !== undefined);
    const s0 = settlement(full.map((d) => ({ type: d.type!, rate: d.rate!, minutes: d.minutes!, amountCents: d.amountCents, workweekStart: d.workweekStart!, wasLines: d.wasLines ?? 1, nowLines: d.nowLines ?? 1 })));
    out.set(clientId, { netCents: mine.reduce((sum, d) => sum + d.amountCents, 0), real: full.length < mine.length || s0.fileLines.length > 0 || !s0.additionsOnly });
  }
  return out;
}

export async function planCorrectionInvoices(
  tx: Tx,
  period: { id: string; startsOn: string; endsOn: string },
  differences: BillDifference[],
): Promise<{ plans: InvoicePlan[]; problems: string[] }> {
  const changed = [...clientNets(differences)].filter(([, c]) => c.real && c.netCents !== 0).map(([clientId, c]) => [clientId, c.netCents] as const);
  if (changed.length === 0) return { plans: [], problems: [] };
  const runIds = (await tx.select({ id: s.payRuns.id }).from(s.payRuns).where(eq(s.payRuns.payPeriodId, period.id))).map((r) => r.id);
  const issued = runIds.length > 0 ? await tx.select().from(s.invoices).where(inArray(s.invoices.payRunId, runIds)) : [];
  // Clients billed for the first time are planned like any run's invoices (only more billed can be).
  const fresh = await planInvoices(
    tx,
    period,
    changed.filter(([clientId, cents]) => cents > 0 && !issued.some((i) => i.clientId === clientId && i.kind === "invoice")).map(([clientId, amountCents]) => ({ clientId, amountCents })),
  );
  const plans: InvoicePlan[] = [...fresh.plans];
  const problems: string[] = [...fresh.problems];
  for (const [clientId, cents] of changed) {
    const original = issued.find((i) => i.clientId === clientId && i.kind === "invoice");
    const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, clientId));
    if (!original) {
      if (cents < 0) problems.push(`${client!.name}: billed nothing in this period's paid versions, so ${formatCents(-cents)} less cannot be credited; check the bill rates.`);
      continue;
    }
    const profiles = await tx.select().from(s.clientBillingProfiles).where(eq(s.clientBillingProfiles.clientId, clientId));
    const inEffect = profiles.filter((p) => effective(period.endsOn, p.effectiveFrom, p.effectiveTo));
    if (inEffect.length !== 1) {
      problems.push(`${client!.name}: ${inEffect.length === 0 ? "no billing profile is" : `${inEffect.length} billing profiles are`} in effect on ${period.endsOn}, so the correction's payment terms are unknown.`);
      continue;
    }
    if (Math.abs(cents) > INT4_MAX) {
      problems.push(`${client!.name}: the correction's total is too large to store; check the bill rates.`);
      continue;
    }
    const kind: s.InvoiceKind = cents > 0 ? "supplemental" : "credit_note";
    const earlier = await tx.select({ id: s.invoices.id }).from(s.invoices).where(and(eq(s.invoices.originalInvoiceId, original.id), eq(s.invoices.kind, kind)));
    const n = earlier.length + 1;
    const number = kind === "supplemental" ? `${original.number}-S${n}` : `${original.number}-CN-${String(n).padStart(2, "0")}`;
    const [taken] = await tx.select({ id: s.invoices.id }).from(s.invoices).where(eq(s.invoices.number, number));
    if (taken) {
      problems.push(`${client!.name}: invoice number ${number} was already issued.`);
      continue;
    }
    plans.push({ clientId, client: client!, profile: inEffect[0]!, number, totalCents: cents, kind, original: { id: original.id, number: original.number } });
  }
  plans.sort((a, b) => cmp(a.number, b.number));
  return { plans, problems };
}

/** What the files will say besides money (names, addresses, PO, terms, numbers, payroll ids). */
export async function fileTextInputs(tx: Tx, agencyId: string, plans: InvoicePlan[], workerIds: string[], assignmentIds: string[]) {
  const [agency] = await tx.select().from(s.agencies).where(eq(s.agencies.id, agencyId));
  const people = workerIds.length > 0 ? await tx.select().from(s.workers).where(inArray(s.workers.id, workerIds)) : [];
  // The position and worksite name are printed on invoice lines.
  const placed =
    assignmentIds.length > 0
      ? await tx
          .select({ id: s.assignments.id, position: s.jobOrders.position, worksite: s.worksites.name })
          .from(s.assignments)
          .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
          .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId))
          .where(inArray(s.assignments.id, assignmentIds))
      : [];
  return {
    agency: agency ? [agency.name, agency.addressLines, agency.phone, agency.email] : null,
    invoices: plans.map((p) => [p.number, p.client.name, p.client.addressLines, p.client.billingEmail, p.profile.poNumber, p.profile.paymentTermsDays]),
    workers: people.map((w) => [w.id, w.firstName, w.lastName, w.payrollIds]).sort((a, b) => cmp(String(a[0]), String(b[0]))),
    assignments: placed.map((a) => [a.id, a.position, a.worksite]).sort((a, b) => cmp(a[0]!, b[0]!)),
  };
}
