/**
 * What each invoice still asks for (slice h, decision H3): its total, less the credit notes that
 * name it, less the payments applied to it (a voided payment never counts), less write-offs — as of
 * a date: anything dated after it does not count yet (H1; FreshBooks warns of future-dated
 * payments). Credit notes are not open items themselves: they reduce the invoice they correct, and
 * what they credit beyond its balance is the client's credit (a negative balance).
 */
import { and, eq, inArray, isNull, lte, ne, type SQL } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";

export interface InvoiceBalance {
  invoice: typeof s.invoices.$inferSelect;
  clientName: string;
  creditedCents: number;
  paidCents: number;
  writtenOffCents: number;
  balanceCents: number;
  /** Paid in full by payments alone, and the date of the payment that did it (days to pay, H7). */
  paidOffOn: string | null;
  /** A payment was applied and a balance is left (H4). */
  shortPaid: boolean;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Balances of the invoices that ask for money (not credit notes, not void), as of `asOf`. */
export async function invoiceBalances(tx: Tx, opts: { asOf?: string; clientIds?: string[]; invoiceIds?: string[] } = {}): Promise<InvoiceBalance[]> {
  const where: SQL[] = [ne(s.invoices.kind, "credit_note"), ne(s.invoices.status, "void")];
  if (opts.asOf) where.push(lte(s.invoices.issuedOn, opts.asOf));
  if (opts.clientIds) where.push(inArray(s.invoices.clientId, opts.clientIds.length > 0 ? opts.clientIds : ["00000000-0000-0000-0000-000000000000"]));
  if (opts.invoiceIds) where.push(inArray(s.invoices.id, opts.invoiceIds.length > 0 ? opts.invoiceIds : ["00000000-0000-0000-0000-000000000000"]));
  const rows = await tx.select({ invoice: s.invoices, clientName: s.clients.name }).from(s.invoices).innerJoin(s.clients, eq(s.clients.id, s.invoices.clientId)).where(and(...where));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.invoice.id);
  const credits = await tx
    .select({ originalInvoiceId: s.invoices.originalInvoiceId, totalCents: s.invoices.totalCents, issuedOn: s.invoices.issuedOn })
    .from(s.invoices)
    .where(and(eq(s.invoices.kind, "credit_note"), inArray(s.invoices.originalInvoiceId, ids), ne(s.invoices.status, "void")));
  const matches = await tx
    .select({ invoiceId: s.paymentMatches.invoiceId, amountCents: s.paymentMatches.amountCents, receivedOn: s.payments.receivedOn })
    .from(s.paymentMatches)
    .innerJoin(s.payments, eq(s.payments.id, s.paymentMatches.paymentId))
    .where(and(inArray(s.paymentMatches.invoiceId, ids), isNull(s.payments.voidedAt)));
  const offs = await tx.select({ invoiceId: s.writeOffs.invoiceId, amountCents: s.writeOffs.amountCents, writtenOn: s.writeOffs.writtenOn }).from(s.writeOffs).where(inArray(s.writeOffs.invoiceId, ids));
  const upTo = (date: string) => !opts.asOf || date <= opts.asOf;
  return rows.map(({ invoice, clientName }) => {
    const creditedCents = -credits.filter((c) => c.originalInvoiceId === invoice.id && upTo(c.issuedOn)).reduce((sum, c) => sum + c.totalCents, 0);
    const mine = matches.filter((m) => m.invoiceId === invoice.id && upTo(m.receivedOn)).sort((a, b) => cmp(a.receivedOn, b.receivedOn));
    const paidCents = mine.reduce((sum, m) => sum + m.amountCents, 0);
    const writtenOffCents = offs.filter((w) => w.invoiceId === invoice.id && upTo(w.writtenOn)).reduce((sum, w) => sum + w.amountCents, 0);
    const balanceCents = invoice.totalCents - creditedCents - paidCents - writtenOffCents;
    // The payment that brought what was paid up to what was asked (after credit notes).
    let paidOffOn: string | null = null;
    if (balanceCents <= 0 && writtenOffCents === 0 && paidCents > 0) {
      let running = 0;
      for (const m of mine) {
        running += m.amountCents;
        if (running >= invoice.totalCents - creditedCents) {
          paidOffOn = m.receivedOn;
          break;
        }
      }
    }
    return { invoice, clientName, creditedCents, paidCents, writtenOffCents, balanceCents, paidOffOn, shortPaid: paidCents > 0 && balanceCents > 0 };
  });
}

/** Each client's payments not yet applied (its credit), as of `asOf`. */
export async function unappliedCredits(tx: Tx, opts: { asOf?: string; clientIds?: string[] } = {}): Promise<Map<string, number>> {
  const where: SQL[] = [isNull(s.payments.voidedAt)];
  if (opts.asOf) where.push(lte(s.payments.receivedOn, opts.asOf));
  if (opts.clientIds) where.push(inArray(s.payments.clientId, opts.clientIds.length > 0 ? opts.clientIds : ["00000000-0000-0000-0000-000000000000"]));
  const pays = await tx.select().from(s.payments).where(and(...where));
  if (pays.length === 0) return new Map();
  const applied = await tx.select({ paymentId: s.paymentMatches.paymentId, amountCents: s.paymentMatches.amountCents }).from(s.paymentMatches).where(inArray(s.paymentMatches.paymentId, pays.map((p) => p.id)));
  const out = new Map<string, number>();
  for (const p of pays) {
    const left = p.amountCents - applied.filter((a) => a.paymentId === p.id).reduce((sum, a) => sum + a.amountCents, 0);
    if (left !== 0) out.set(p.clientId, (out.get(p.clientId) ?? 0) + left);
  }
  return out;
}

/** What is left of one payment to apply. */
export async function unappliedOf(tx: Tx, paymentId: string): Promise<number> {
  const [p] = await tx.select().from(s.payments).where(eq(s.payments.id, paymentId));
  if (!p || p.voidedAt) return 0;
  const applied = await tx.select({ amountCents: s.paymentMatches.amountCents }).from(s.paymentMatches).where(eq(s.paymentMatches.paymentId, paymentId));
  return p.amountCents - applied.reduce((sum, a) => sum + a.amountCents, 0);
}

/**
 * Invoice status follows the balance: paid at zero, issued while something is asked (Stripe marks
 * an invoice paid when a credit note covers what remains). Credit notes and void invoices keep theirs.
 */
export async function settleStatuses(tx: Tx, invoiceIds: string[]): Promise<void> {
  if (invoiceIds.length === 0) return;
  for (const b of await invoiceBalances(tx, { invoiceIds: [...new Set(invoiceIds)] })) {
    const status = b.balanceCents <= 0 ? "paid" : "issued";
    if (b.invoice.status !== status) await tx.update(s.invoices).set({ status }).where(eq(s.invoices.id, b.invoice.id));
  }
}
