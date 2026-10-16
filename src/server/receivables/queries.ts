/**
 * What the receivables screens show (slice h): the aging and short pays (docs/patterns/receivables.md),
 * the payments (payments.md), the bank's deposits with suggestions (bank.md), an invoice's payments
 * and reminder drafts (invoices/[id].md), and what a client owes (clients/[id].md).
 */
import { formatCents } from "@shiftbook/rules";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { fill } from "../files/invoice-documents";
import { settingOn } from "../settings";
import { aging, BUCKETS, daysFrom, daysToPay, type Bucket, type DaysToPay } from "./aging";
import { invoiceBalances, unappliedCredits, type InvoiceBalance } from "./balances";
import { suggestMatch, type MatchWindow, type Suggestion } from "./matching";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Days to pay counts invoices paid off in the year before the date (H7). */
const DAYS_TO_PAY_WINDOW = 365;
/** A reminder's stage from the days past due (FreshBooks Hub cadence: firm from 30 days late). */
export const stageOf = (daysLate: number): s.ReminderStage => (daysLate <= 0 ? "before_due" : daysLate < 30 ? "overdue" : "final");

export interface AgedInvoice {
  id: string;
  number: string;
  kind: s.InvoiceKind;
  issuedOn: string;
  dueOn: string;
  daysLate: number;
  totalCents: number;
  balanceCents: number;
}

export interface ClientAging {
  clientId: string;
  clientName: string;
  buckets: Record<Bucket, number>;
  totalCents: number;
  overdueCents: number;
  creditCents: number;
  invoices: Record<Bucket, AgedInvoice[]>;
  daysToPay: DaysToPay;
}

const aged = (b: InvoiceBalance, asOf: string): AgedInvoice => ({
  id: b.invoice.id,
  number: b.invoice.number,
  kind: b.invoice.kind,
  issuedOn: b.invoice.issuedOn,
  dueOn: b.invoice.dueOn,
  daysLate: Math.max(0, daysFrom(b.invoice.dueOn, asOf)),
  totalCents: b.invoice.totalCents,
  balanceCents: b.balanceCents,
});

function paidOffIn(balances: InvoiceBalance[], asOf: string) {
  return balances.filter((b) => b.paidOffOn !== null && b.paidOffOn <= asOf && daysFrom(b.paidOffOn, asOf) < DAYS_TO_PAY_WINDOW).map((b) => ({ issuedOn: b.invoice.issuedOn, dueOn: b.invoice.dueOn, paidOn: b.paidOffOn! }));
}

export async function receivablesView(tx: Tx, asOf: string) {
  const balances = await invoiceBalances(tx, { asOf });
  const credits = await unappliedCredits(tx, { asOf });
  const clients = await tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients);
  const nameOf = new Map(clients.map((c) => [c.id, c.name]));
  const rows = aging(
    balances.map((b) => ({ clientId: b.invoice.clientId, invoiceId: b.invoice.id, dueOn: b.invoice.dueOn, balanceCents: b.balanceCents })),
    [...credits].map(([clientId, cents]) => ({ clientId, cents })),
    asOf,
  );
  const byId = new Map(balances.map((b) => [b.invoice.id, b]));
  const clientAging: ClientAging[] = rows
    .map((r) => ({
      clientId: r.clientId,
      clientName: nameOf.get(r.clientId) ?? r.clientId,
      buckets: r.buckets,
      totalCents: r.totalCents,
      overdueCents: r.overdueCents,
      creditCents: r.creditCents,
      invoices: Object.fromEntries(BUCKETS.map((k) => [k, r.invoices[k].map((id) => aged(byId.get(id)!, asOf)).sort((a, b) => cmp(a.dueOn, b.dueOn) || cmp(a.number, b.number))])) as Record<Bucket, AgedInvoice[]>,
      daysToPay: daysToPay(paidOffIn(balances.filter((b) => b.invoice.clientId === r.clientId), asOf)),
    }))
    .sort((a, b) => cmp(a.clientName.toLowerCase(), b.clientName.toLowerCase()));
  const totals = Object.fromEntries(BUCKETS.map((k) => [k, clientAging.reduce((sum, c) => sum + c.buckets[k], 0)])) as Record<Bucket, number>;
  // Short paid (TempWorks report): a payment applied and a balance left.
  const short = balances.filter((b) => b.shortPaid);
  const reasons = short.length > 0 ? await tx.select().from(s.shortPays).where(inArray(s.shortPays.invoiceId, short.map((b) => b.invoice.id))) : [];
  const reminded = short.length > 0 ? await tx.select({ invoiceId: s.reminders.invoiceId, createdAt: s.reminders.createdAt }).from(s.reminders).where(inArray(s.reminders.invoiceId, short.map((b) => b.invoice.id))) : [];
  const shortPaid = short
    .map((b) => ({
      invoiceId: b.invoice.id,
      number: b.invoice.number,
      clientName: b.clientName,
      dueOn: b.invoice.dueOn,
      paidCents: b.paidCents,
      balanceCents: b.balanceCents,
      reason: reasons.find((r) => r.invoiceId === b.invoice.id)?.reason ?? null,
      remindedAt: reminded.filter((r) => r.invoiceId === b.invoice.id).reduce<Date | null>((max, r) => (max === null || r.createdAt > max ? r.createdAt : max), null),
    }))
    .sort((a, b) => cmp(a.clientName, b.clientName) || cmp(a.dueOn, b.dueOn));
  return {
    asOf,
    clients: clientAging,
    totals,
    totalCents: clientAging.reduce((sum, c) => sum + c.totalCents, 0),
    overdueCents: clientAging.reduce((sum, c) => sum + c.overdueCents, 0),
    creditCents: clientAging.reduce((sum, c) => sum + c.creditCents, 0),
    shortPaid,
  };
}
export type ReceivablesView = Awaited<ReturnType<typeof receivablesView>>;

/** The aging as CSV, as shown (FreshBooks "Export for Excel"). */
export function agingCsv(view: ReceivablesView): string {
  const money = (c: number) => (c < 0 ? `-${formatCents(-c).slice(1)}` : formatCents(c).slice(1)).replaceAll(",", "");
  const head = ["Client", "Current", "1-30", "31-60", "61-90", "91+", "Total", "Days to pay"];
  const rows = view.clients.map((c) => [c.clientName, ...BUCKETS.map((k) => money(c.buckets[k])), money(c.totalCents), c.daysToPay.averageDays === null ? "" : String(c.daysToPay.averageDays)]);
  const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : /^[=+\-@]/.test(v) && Number.isNaN(Number(v)) ? `'${v}` : v);
  return [head, ...rows, ["Total", ...BUCKETS.map((k) => money(view.totals[k])), money(view.totalCents), ""]].map((r) => r.map(quote).join(",")).join("\r\n") + "\r\n";
}

export async function paymentsList(tx: Tx) {
  const pays = await tx
    .select({ payment: s.payments, clientName: s.clients.name, line: { description: s.bankLines.description } })
    .from(s.payments)
    .innerJoin(s.clients, eq(s.clients.id, s.payments.clientId))
    .leftJoin(s.bankLines, eq(s.bankLines.id, s.payments.bankLineId))
    .orderBy(desc(s.payments.receivedOn), desc(s.payments.createdAt));
  const ids = pays.map((p) => p.payment.id);
  const applied = ids.length > 0 ? await tx.select({ paymentId: s.paymentMatches.paymentId, invoiceId: s.paymentMatches.invoiceId, amountCents: s.paymentMatches.amountCents, number: s.invoices.number }).from(s.paymentMatches).innerJoin(s.invoices, eq(s.invoices.id, s.paymentMatches.invoiceId)).where(inArray(s.paymentMatches.paymentId, ids)) : [];
  return pays.map(({ payment: p, clientName, line }) => {
    const mine = applied.filter((a) => a.paymentId === p.id);
    const appliedCents = mine.reduce((sum, a) => sum + a.amountCents, 0);
    return {
      id: p.id,
      clientId: p.clientId,
      clientName,
      receivedOn: p.receivedOn,
      method: p.method,
      reference: p.reference,
      memo: p.memo,
      amountCents: p.amountCents,
      appliedCents,
      unusedCents: p.voidedAt ? 0 : p.amountCents - appliedCents,
      status: p.voidedAt ? ("voided" as const) : p.amountCents > appliedCents ? ("credit" as const) : ("applied" as const),
      voidReason: p.voidReason,
      fromBank: line?.description ?? null,
      invoices: mine.map((a) => ({ id: a.invoiceId, number: a.number, amountCents: a.amountCents })).sort((a, b) => cmp(a.number, b.number)),
    };
  });
}
export type PaymentRow = Awaited<ReturnType<typeof paymentsList>>[number];

/** Each client's open invoices, oldest due first (the Record payment dialog). */
export async function openInvoicesByClient(tx: Tx) {
  const balances = (await invoiceBalances(tx)).filter((b) => b.balanceCents > 0).sort((a, b) => cmp(a.invoice.dueOn, b.invoice.dueOn) || cmp(a.invoice.number, b.invoice.number));
  const clients = await tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients).orderBy(asc(s.clients.name));
  return clients.map((c) => ({
    id: c.id,
    name: c.name,
    invoices: balances.filter((b) => b.invoice.clientId === c.id).map((b) => ({ id: b.invoice.id, number: b.invoice.number, dueOn: b.invoice.dueOn, balanceCents: b.balanceCents })),
  }));
}
export type PaymentClients = Awaited<ReturnType<typeof openInvoicesByClient>>;

async function matchWindow(tx: Tx, today: string): Promise<MatchWindow> {
  const w = await settingOn<Partial<MatchWindow>>(tx, "receivables.match_window", today);
  // QuickBooks Online's documented window when the agency set none.
  return { daysBefore: typeof w?.daysBefore === "number" ? w.daysBefore : 90, daysAfter: typeof w?.daysAfter === "number" ? w.daysAfter : 20 };
}

export async function bankView(tx: Tx, today: string) {
  const lines = await tx.select().from(s.bankLines).orderBy(desc(s.bankLines.postedOn), asc(s.bankLines.rowNumber));
  const balances = (await invoiceBalances(tx)).filter((b) => b.balanceCents > 0);
  const clients = await tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients);
  const window = await matchWindow(tx, today);
  const open = balances.map((b) => ({ id: b.invoice.id, number: b.invoice.number, clientId: b.invoice.clientId, poNumber: b.invoice.poNumber, issuedOn: b.invoice.issuedOn, dueOn: b.invoice.dueOn, balanceCents: b.balanceCents }));
  const numberOf = new Map(balances.map((b) => [b.invoice.id, b.invoice.number]));
  const nameOf = new Map(clients.map((c) => [c.id, c.name]));
  const posted = lines.filter((l) => l.status === "posted");
  const pays = posted.length > 0 ? await tx.select().from(s.payments).where(and(inArray(s.payments.bankLineId, posted.map((l) => l.id)), isNull(s.payments.voidedAt))) : [];
  const applied = pays.length > 0 ? await tx.select({ paymentId: s.paymentMatches.paymentId, amountCents: s.paymentMatches.amountCents, number: s.invoices.number }).from(s.paymentMatches).innerJoin(s.invoices, eq(s.invoices.id, s.paymentMatches.invoiceId)).where(inArray(s.paymentMatches.paymentId, pays.map((p) => p.id))) : [];
  const base = (l: typeof s.bankLines.$inferSelect) => ({ id: l.id, postedOn: l.postedOn, description: l.description, reference: l.reference, amountCents: l.amountCents });
  return {
    review: lines
      .filter((l) => l.status === "review")
      .map((l) => {
        const suggestion: Suggestion | null = suggestMatch({ postedOn: l.postedOn, description: l.description, reference: l.reference, amountCents: l.amountCents }, open, clients, window);
        return {
          ...base(l),
          suggestion: suggestion ? { ...suggestion, clientName: nameOf.get(suggestion.clientId) ?? "", applications: suggestion.applications.map((a) => ({ ...a, number: numberOf.get(a.invoiceId) ?? "" })) } : null,
        };
      }),
    posted: posted.map((l) => {
      const p = pays.find((x) => x.bankLineId === l.id);
      return { ...base(l), payment: p ? { id: p.id, clientName: nameOf.get(p.clientId) ?? "", invoices: applied.filter((a) => a.paymentId === p.id).map((a) => ({ number: a.number, amountCents: a.amountCents })), creditCents: p.amountCents - applied.filter((a) => a.paymentId === p.id).reduce((sum, a) => sum + a.amountCents, 0) } : null };
    }),
    excluded: lines.filter((l) => l.status === "excluded").map((l) => ({ ...base(l), reason: l.excludedReason ?? "" })),
    imported: lines.length > 0,
  };
}
export type BankView = Awaited<ReturnType<typeof bankView>>;

/** The last mapping used, offered first on the next import (Zoho: remembered). */
export async function lastBankMapping(tx: Tx): Promise<s.BankMapping | null> {
  const [last] = await tx.select({ mapping: s.bankImports.mapping }).from(s.bankImports).orderBy(desc(s.bankImports.createdAt)).limit(1);
  return last?.mapping ?? null;
}

const TEMPLATES = { en: en.reminderTemplate, es: es.reminderTemplate } as const;

/** An invoice's payments, credits, write-offs, short pay, reminders, and the reminder drafts (H8). */
export async function invoiceReceivables(tx: Tx, invoiceId: string, today: string) {
  const [b] = await invoiceBalances(tx, { invoiceIds: [invoiceId] });
  if (!b) return null;
  const pays = await tx
    .select({ match: s.paymentMatches, payment: s.payments })
    .from(s.paymentMatches)
    .innerJoin(s.payments, eq(s.payments.id, s.paymentMatches.paymentId))
    .where(eq(s.paymentMatches.invoiceId, invoiceId))
    .orderBy(asc(s.payments.receivedOn));
  const credits = await tx.select({ id: s.invoices.id, number: s.invoices.number, totalCents: s.invoices.totalCents, issuedOn: s.invoices.issuedOn }).from(s.invoices).where(and(eq(s.invoices.originalInvoiceId, invoiceId), eq(s.invoices.kind, "credit_note")));
  const offs = await tx.select().from(s.writeOffs).where(eq(s.writeOffs.invoiceId, invoiceId)).orderBy(asc(s.writeOffs.createdAt));
  const [short] = await tx.select().from(s.shortPays).where(eq(s.shortPays.invoiceId, invoiceId));
  const sent = await tx.select().from(s.reminders).where(eq(s.reminders.invoiceId, invoiceId)).orderBy(desc(s.reminders.createdAt));
  const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, b.invoice.clientId));
  const [agency] = await tx.select().from(s.agencies);
  const daysLate = daysFrom(b.invoice.dueOn, today);
  const stage = stageOf(daysLate);
  const drafts = Object.fromEntries(
    (["en", "es"] as const).map((locale) => {
      const values = {
        client: client!.name,
        number: b.invoice.number,
        amount: formatCents(b.balanceCents),
        due: new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${b.invoice.dueOn}T00:00:00Z`)),
        days: String(Math.max(0, daysLate)),
        agency: agency!.name,
        phone: agency!.phone ?? "",
        email: agency!.email ?? "",
        po: b.invoice.poNumber ?? "",
      };
      const per = Object.fromEntries((s.REMINDER_STAGES as readonly s.ReminderStage[]).map((st) => [st, { subject: fill(TEMPLATES[locale][st].subject, values), body: fill(TEMPLATES[locale][st].body, values).replace(/\n{3,}/g, "\n\n").trimEnd() }]));
      return [locale, per];
    }),
  ) as Record<"en" | "es", Record<s.ReminderStage, { subject: string; body: string }>>;
  return {
    balanceCents: b.balanceCents,
    paidCents: b.paidCents,
    creditedCents: b.creditedCents,
    writtenOffCents: b.writtenOffCents,
    shortPaid: b.shortPaid,
    payments: pays.map(({ match, payment }) => ({ paymentId: payment.id, receivedOn: payment.receivedOn, method: payment.method, reference: payment.reference, amountCents: match.amountCents, voided: payment.voidedAt !== null })),
    credits: credits.map((c) => ({ id: c.id, number: c.number, amountCents: -c.totalCents, issuedOn: c.issuedOn })),
    writeOffs: offs.map((w) => ({ id: w.id, writtenOn: w.writtenOn, amountCents: w.amountCents, reason: w.reason, note: w.note, by: w.createdByLabel })),
    shortPay: short ? { reason: short.reason, note: short.note, by: short.recordedByLabel, at: short.recordedAt } : null,
    reminders: sent.map((r) => ({ at: r.createdAt, stage: r.stage, locale: r.locale, how: r.how, by: r.createdByLabel })),
    reminder: { stage, daysLate: Math.max(0, daysLate), to: client!.billingEmail, drafts },
  };
}
export type InvoiceReceivables = NonNullable<Awaited<ReturnType<typeof invoiceReceivables>>>;

/** What one client owes (FreshBooks client profile) and how fast it pays (Xero). */
export async function clientReceivables(tx: Tx, clientId: string, today: string) {
  const balances = await invoiceBalances(tx, { clientIds: [clientId] });
  const credit = (await unappliedCredits(tx, { clientIds: [clientId] })).get(clientId) ?? 0;
  const open = balances.filter((b) => b.balanceCents > 0);
  const overdueCents = open.filter((b) => daysFrom(b.invoice.dueOn, today) > 0).reduce((sum, b) => sum + b.balanceCents, 0);
  const notDueCents = open.filter((b) => daysFrom(b.invoice.dueOn, today) <= 0).reduce((sum, b) => sum + b.balanceCents, 0);
  const creditCents = credit - balances.filter((b) => b.balanceCents < 0).reduce((sum, b) => sum + b.balanceCents, 0);
  return { owedCents: overdueCents + notDueCents - creditCents, overdueCents, notDueCents, creditCents, daysToPay: daysToPay(paidOffIn(balances, today)) };
}
export type ClientReceivables = Awaited<ReturnType<typeof clientReceivables>>;

