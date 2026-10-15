/**
 * Which invoices a run will create, checked before anyone clicks "Create files": one per client
 * billed, the client's billing profile in effect on the period's last day (PO, terms), an invoice
 * number not used before, and a total that fits the database. The run turns problems into blockers;
 * the files service creates exactly these invoices.
 */
import { eq, inArray } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";

const INT4_MAX = 2_147_483_647;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const effective = (date: string, from: string, to: string | null) => from <= date && (to === null || date <= to);

export interface InvoicePlan {
  clientId: string;
  client: typeof s.clients.$inferSelect;
  profile: typeof s.clientBillingProfiles.$inferSelect;
  number: string;
  totalCents: number;
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
    plans.push({ clientId, client, profile: inEffect[0]!, number, totalCents });
  }
  const numbers = plans.map((p) => p.number);
  const taken = numbers.length > 0 ? await tx.select({ number: s.invoices.number }).from(s.invoices).where(inArray(s.invoices.number, numbers)) : [];
  for (const p of plans) {
    if (taken.some((t) => t.number === p.number)) problems.push(`${p.client.name}: invoice number ${p.number} was already issued.`);
    else if (numbers.filter((n) => n === p.number).length > 1) problems.push(`${p.client.name}: another client billed in this run has the same client code (${p.client.code}), so both invoices would be numbered ${p.number}.`);
  }
  return { plans, problems };
}

/** What the files will say besides money (names, addresses, PO, terms, numbers, payroll ids). */
export async function fileTextInputs(tx: Tx, agencyId: string, plans: InvoicePlan[], workerIds: string[]) {
  const [agency] = await tx.select().from(s.agencies).where(eq(s.agencies.id, agencyId));
  const people = workerIds.length > 0 ? await tx.select().from(s.workers).where(inArray(s.workers.id, workerIds)) : [];
  return {
    agency: agency ? [agency.name, agency.addressLines, agency.phone, agency.email] : null,
    invoices: plans.map((p) => [p.number, p.client.name, p.client.addressLines, p.client.billingEmail, p.profile.poNumber, p.profile.paymentTermsDays]),
    workers: people.map((w) => [w.id, w.firstName, w.lastName, w.payrollIds]).sort((a, b) => cmp(String(a[0]), String(b[0]))),
  };
}
