/**
 * Collections (slice r; patterns invoices/[id].md, receivables.md, settings/collections.md,
 * _emails/invoice.md): invoices and credit notes emailed to the client with their PDF (Stripe "Send
 * invoice"), credit notes issued by hand (Stripe credit notes), promises to pay, and reminders emailed
 * on the agency's schedule (Stripe "send reminders … before, when, or after the invoice is due").
 * Money is integer cents; every change is audited; every email is recorded (email_messages).
 */
import { billingInForce } from "../catalog/billing";
import { statementPdf } from "../invoices/queries";
import { addDays, formatCents } from "@shiftbook/rules";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { and, asc, desc, eq, gt, inArray, like, ne, or } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { createElement, type ReactElement } from "react";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { InvoiceDocument, type InvoiceData } from "../../pdf/invoice";
import { assemble, type Block } from "../approvals/emails";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { fill, longDate } from "../files/invoice-documents";
import type { MailTransport } from "../mail/transport";
import { can } from "../permissions";
import { invoiceBalances, settleStatuses } from "../receivables/balances";
import { invoiceReceivables } from "../receivables/queries";
import { lockReceivables } from "../run/period-lock";
import type { Actor } from "../session";
import { agencyToday, settingOn } from "../settings";
import type { DocumentStore } from "../storage";
import { creditNoteRoom, DEFAULT_SCHEDULE, parseSchedule, reminderDue, SCHEDULE_KEY, type ReminderSchedule } from "./schedule";

const INT4_MAX = 2_147_483_647;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGES = { en, es } as const;
type Locale = "en" | "es";
type WithAgency = <T>(agencyId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;

export interface CollectionsDeps {
  withAgency: WithAgency;
  store: DocumentStore;
  mailTransport: (agencyId: string) => MailTransport;
  now?: () => Date;
}

const nowOf = (deps: CollectionsDeps) => (deps.now ? deps.now() : new Date());
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const cleanText = (v: unknown, max: number): string | null | false => {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return false;
  const t = v.trim();
  if (t.length > max) return false;
  return t === "" ? null : t;
};

// ---------- emails ----------

interface Agency {
  name: string;
  phone: string | null;
  email: string | null;
}
const contactOf = (a: Agency) => [a.phone, a.email].filter((v): v is string => Boolean(v)).join(", ");
const dayIn = (iso: string, locale: Locale) => new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** The invoice (or credit note) email in the client's language (docs/patterns/_emails/invoice.md). */
export function renderInvoiceEmail(input: { locale: Locale; agency: Agency; invoice: { number: string; kind: s.InvoiceKind; totalCents: number; dueOn: string }; originalNumber: string | null; message: string | null }) {
  const t = createTranslator({ locale: input.locale, messages: MESSAGES[input.locale], namespace: "collect.email" });
  const credit = input.invoice.kind === "credit_note";
  const subject = t(credit ? "creditSubject" : "invoiceSubject", { number: input.invoice.number, agency: input.agency.name });
  const body = credit
    ? t("creditBody", { agency: input.agency.name, number: input.invoice.number, amount: formatCents(-input.invoice.totalCents), original: input.originalNumber ?? "" })
    : t("invoiceBody", { agency: input.agency.name, number: input.invoice.number, amount: formatCents(input.invoice.totalCents), due: dayIn(input.invoice.dueOn, input.locale) });
  const contact = contactOf(input.agency);
  const blocks: Block[] = [{ text: t("greeting") }, { text: body }, ...(input.message ? [{ text: input.message }] : []), ...(contact ? [{ text: t("contact", { contact }) }] : [])];
  return assemble(subject, blocks);
}

/** A scheduled reminder: slice h's template for the stage (the same words the person sends by hand). */
export function renderReminderEmail(draft: { subject: string; body: string }) {
  return assemble(draft.subject, draft.body.split(/\n{2,}/).map((text) => ({ text })));
}

async function agencyOf(tx: Tx): Promise<s.AgencyRow> {
  const [agency] = await tx.select().from(s.agencies);
  return agency!;
}

/** The client's language for its emails: the language its approver chose last, else English. */
async function clientLocale(tx: Tx, clientId: string): Promise<Locale> {
  const [last] = await tx.select({ locale: s.approvalRequests.locale }).from(s.approvalRequests).where(eq(s.approvalRequests.clientId, clientId)).orderBy(desc(s.approvalRequests.createdAt)).limit(1);
  return last?.locale === "es" ? "es" : "en";
}

const pdfName = (number: string, kind: s.InvoiceKind) => `${kind === "credit_note" ? "credit-note" : "invoice"}-${number}.pdf`;

interface Prepared {
  mailId: string;
  agencyId: string;
  fromName: string;
  replyTo: string | null;
  to: { email: string; name: string | null };
  rendered: { subject: string; text: string; html: string };
  attachment: { filename: string; key: string };
  /** Made at send time and not stored: the consolidated statement of a client that asks for one. */
  extra: { filename: string; content: Uint8Array }[];
}

async function deliver(deps: CollectionsDeps, p: Prepared): Promise<boolean> {
  try {
    const content = await deps.store.get(p.attachment.key);
    const { providerId } = await deps.mailTransport(p.agencyId).send({ id: p.mailId, fromName: p.fromName, replyTo: p.replyTo, to: p.to, ...p.rendered, attachments: [{ filename: p.attachment.filename, content }, ...p.extra] });
    await deps.withAgency(p.agencyId, (tx) => tx.update(s.emailMessages).set({ status: "sent", providerId, sentAt: nowOf(deps) }).where(eq(s.emailMessages.id, p.mailId)));
    return true;
  } catch (error) {
    await deps.withAgency(p.agencyId, (tx) => tx.update(s.emailMessages).set({ status: "failed", error: error instanceof Error ? error.message : String(error) }).where(eq(s.emailMessages.id, p.mailId)));
    return false;
  }
}

export type SendError = "forbidden" | "not_found" | "no_email" | "no_pdf" | "invalid";

/**
 * A client whose invoice settings ask for a consolidated statement (SPEC §4 ClientBillingProfile
 * "consolidate"; §12 "consolidated statement") gets, with each invoice of a week, the statement of every
 * invoice that week made for it (QuickBooks statements: one document listing the open invoices). None
 * for a credit note, nor when the week has a single invoice.
 */
async function consolidatedStatement(tx: Tx, invoice: s.InvoiceRow): Promise<{ filename: string; content: Uint8Array }[]> {
  if (invoice.kind === "credit_note" || !invoice.payRunId) return [];
  const [profile] = (await billingInForce(tx, [invoice.clientId], invoice.issuedOn)).get(invoice.clientId) ?? [];
  if (!profile?.consolidate) return [];
  const week = await tx
    .select({ id: s.invoices.id })
    .from(s.invoices)
    .where(and(eq(s.invoices.payRunId, invoice.payRunId), eq(s.invoices.clientId, invoice.clientId), eq(s.invoices.kind, "invoice"), ne(s.invoices.status, "void")));
  if (week.length < 2) return [];
  const statement = await statementPdf(tx, week.map((w) => w.id), invoice.issuedOn);
  return statement.ok ? [{ filename: statement.filename, content: statement.bytes }] : [];
}

/** "Send invoice" / "Resend": the client's billing email gets the PDF (with its backup pages). */
export async function sendInvoice(deps: CollectionsDeps, actor: Actor, invoiceId: unknown, rawMessage: unknown): Promise<{ ok: true; to: string } | { ok: false; error: SendError | "failed" }> {
  if (!can(actor, "cash")) return { ok: false, error: "forbidden" };
  if (typeof invoiceId !== "string" || !UUID.test(invoiceId)) return { ok: false, error: "not_found" };
  const message = cleanText(rawMessage, 2_000);
  if (message === false) return { ok: false, error: "invalid" };
  const prepared = await deps.withAgency(actor.agencyId, async (tx): Promise<Prepared | { error: SendError }> => {
    const [invoice] = await tx.select().from(s.invoices).where(eq(s.invoices.id, invoiceId));
    if (!invoice || invoice.status === "void") return { error: "not_found" };
    if (!invoice.pdfStorageKey) return { error: "no_pdf" };
    const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, invoice.clientId));
    if (!client?.billingEmail) return { error: "no_email" };
    const original = invoice.originalInvoiceId ? (await tx.select({ number: s.invoices.number }).from(s.invoices).where(eq(s.invoices.id, invoice.originalInvoiceId)))[0] : undefined;
    const agency = await agencyOf(tx);
    const rendered = renderInvoiceEmail({ locale: await clientLocale(tx, client.id), agency, invoice, originalNumber: original?.number ?? null, message });
    const attachment = { filename: pdfName(invoice.number, invoice.kind), key: invoice.pdfStorageKey };
    const extra = await consolidatedStatement(tx, invoice);
    const [mail] = await tx
      .insert(s.emailMessages)
      .values({ agencyId: actor.agencyId, kind: "invoice", invoiceId, toEmail: client.billingEmail, toName: client.name, subject: rendered.subject, textBody: rendered.text, status: "sending", attachments: [{ filename: attachment.filename, bytes: 0 }, ...extra.map((x) => ({ filename: x.filename, bytes: x.content.byteLength }))], createdAt: nowOf(deps) })
      .returning({ id: s.emailMessages.id });
    await audit(tx, actor, [{ action: "export", entityType: "invoice", entityId: invoiceId, after: { number: invoice.number, emailedTo: client.billingEmail, emailId: mail!.id } }]);
    return { mailId: mail!.id, agencyId: actor.agencyId, fromName: agency.name, replyTo: agency.email, to: { email: client.billingEmail, name: client.name }, rendered, attachment, extra };
  });
  if ("error" in prepared) return { ok: false, error: prepared.error };
  return (await deliver(deps, prepared)) ? { ok: true, to: prepared.to.email } : { ok: false, error: "failed" };
}

/** When and to whom an invoice was last emailed (the invoice page's facts line; Stripe's email log). */
export async function invoiceEmails(tx: Tx, invoiceId: string) {
  const rows = await tx
    .select({ id: s.emailMessages.id, kind: s.emailMessages.kind, toEmail: s.emailMessages.toEmail, status: s.emailMessages.status, createdAt: s.emailMessages.createdAt, sentAt: s.emailMessages.sentAt })
    .from(s.emailMessages)
    .where(and(eq(s.emailMessages.invoiceId, invoiceId), inArray(s.emailMessages.kind, ["invoice", "invoice_reminder"])))
    .orderBy(desc(s.emailMessages.createdAt));
  return { lastSent: rows.find((r) => r.kind === "invoice" && r.status === "sent") ?? null, all: rows };
}

// ---------- credit notes by hand ----------

export type CreditError = "forbidden" | "not_found" | "not_invoice" | "void" | "reason" | "amount" | "memo";

export interface CreditInput {
  reason: unknown;
  amountCents: unknown;
  memo: unknown;
}

/** How much the invoice may still be credited (its total less the credit notes that name it and its write-offs). */
export async function creditRoomOf(tx: Tx, invoiceId: string): Promise<number> {
  const [invoice] = await tx.select().from(s.invoices).where(eq(s.invoices.id, invoiceId));
  if (!invoice) return 0;
  const credits = await tx.select({ totalCents: s.invoices.totalCents }).from(s.invoices).where(and(eq(s.invoices.originalInvoiceId, invoiceId), eq(s.invoices.kind, "credit_note"), ne(s.invoices.status, "void")));
  const offs = await tx.select({ amountCents: s.writeOffs.amountCents }).from(s.writeOffs).where(eq(s.writeOffs.invoiceId, invoiceId));
  return creditNoteRoom(invoice.totalCents, credits.map((c) => c.totalCents), offs.map((o) => o.amountCents));
}

const t = en.invoice;

/** The credit note's PDF (docs/patterns/_documents/invoice.md, correction documents: Stripe credit note). */
function creditNoteData(input: { agency: s.AgencyRow; client: s.ClientRow; original: s.InvoiceRow; number: string; today: string; amountCents: number; reason: s.CreditNoteReason; memo: string | null }): InvoiceData {
  const amount = formatCents(-input.amountCents);
  const reason = en.collect.credit.reasons[input.reason];
  return {
    labels: {
      title: t.creditNoteTitle,
      number: t.creditNoteNumber,
      issued: t.issued,
      due: t.due,
      billTo: t.billTo,
      description: t.description,
      hours: t.hours,
      rate: t.rate,
      amount: t.amount,
      subtotal: t.subtotal,
      total: t.total,
      amountDueLabel: t.totalCredited,
      page: (page, pages) => fill(t.page, { page: String(page), pages: String(pages) }),
    },
    number: input.number,
    issuedOn: longDate(input.today),
    dueOn: null,
    fields: [{ label: t.credits, value: input.original.number }, ...(input.original.poNumber ? [{ label: t.po, value: input.original.poNumber }] : [])],
    from: { name: input.agency.name, lines: [...input.agency.addressLines, input.agency.phone ?? "", input.agency.email ?? ""].filter(Boolean) },
    billTo: { name: input.client.name, lines: [...input.client.addressLines, input.client.billingEmail ?? ""].filter(Boolean) },
    amountDueLine: fill(t.creditedLine, { amount: formatCents(input.amountCents), number: input.original.number }),
    lines: [{ description: fill(en.collect.credit.lineDescription, { reason }), detail: input.memo ?? "", hours: "", rate: "", amount }],
    subtotal: amount,
    total: amount,
    amountDue: formatCents(input.amountCents),
    footer: t.footer,
    detail: null,
    images: [],
  };
}

/**
 * "Issue a credit note" (Stripe): a reason, an amount no more than the invoice still allows, a memo.
 * It lowers what the invoice asks for (an open invoice credited to nothing is paid); on a paid invoice
 * the amount becomes the client's credit (a negative balance, applied later as decision 0019 does).
 */
export async function issueCreditNote(tx: Tx, store: DocumentStore, actor: Actor, invoiceId: unknown, input: CreditInput): Promise<{ ok: true; creditNoteId: string; number: string } | { ok: false; error: CreditError; roomCents?: number }> {
  if (!can(actor, "cash")) return { ok: false, error: "forbidden" };
  if (typeof invoiceId !== "string" || !UUID.test(invoiceId)) return { ok: false, error: "not_found" };
  await lockReceivables(tx, actor.agencyId);
  const [original] = await tx.select().from(s.invoices).where(eq(s.invoices.id, invoiceId));
  if (!original) return { ok: false, error: "not_found" };
  if (original.kind === "credit_note") return { ok: false, error: "not_invoice" };
  if (original.status === "void") return { ok: false, error: "void" };
  if (!s.CREDIT_NOTE_REASONS.includes(input.reason as s.CreditNoteReason)) return { ok: false, error: "reason" };
  const memo = cleanText(input.memo, 500);
  if (memo === false) return { ok: false, error: "memo" };
  const room = await creditRoomOf(tx, invoiceId);
  const amount = input.amountCents;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0 || amount > room || amount > INT4_MAX) return { ok: false, error: "amount", roomCents: room };
  const reason = input.reason as s.CreditNoteReason;
  const today = await agencyToday(tx);
  // Numbered in the invoice's own credit-note series (`{invoice}-CN-{nn}`, as corrections number them).
  const taken = await tx.select({ number: s.invoices.number }).from(s.invoices).where(like(s.invoices.number, `${original.number}-CN-%`));
  const used = taken.map((x) => Number(x.number.slice(original.number.length + 4))).filter((n) => Number.isInteger(n));
  const number = `${original.number}-CN-${String(Math.max(0, ...used) + 1).padStart(2, "0")}`;
  const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, original.clientId));
  const agency = await agencyOf(tx);
  const data = creditNoteData({ agency, client: client!, original, number, today, amountCents: amount, reason, memo });
  const pdf = new Uint8Array(await renderToBuffer(createElement(InvoiceDocument, { data }) as unknown as ReactElement<DocumentProps>));
  const key = `${actor.agencyId}/credit-notes/${original.id}/credit-note-${number}.pdf`;
  await store.put(key, pdf);
  const { labels, ...rest } = data;
  const printed = { ...rest, images: 0 };
  const [row] = await tx
    .insert(s.invoices)
    .values({
      agencyId: actor.agencyId,
      clientId: original.clientId,
      payRunId: original.payRunId,
      number,
      issuedOn: today,
      dueOn: today,
      status: "issued",
      subtotalCents: -amount,
      totalCents: -amount,
      pdfStorageKey: key,
      kind: "credit_note",
      originalInvoiceId: original.id,
      // One credit note per number: its own part of the run, so it never takes the run's invoice part.
      splitKey: `credit:${number}`,
      template: original.template,
      poNumber: original.poNumber,
      worksiteId: original.worksiteId,
      document: { pdf: { ...printed, labels: { ...labels, page: t.page } }, lines: [], backup: { detail: false, images: [] } },
      creditReason: reason,
      memo,
    })
    .returning({ id: s.invoices.id });
  await settleStatuses(tx, [original.id]);
  await audit(tx, actor, [{ action: "create", entityType: "invoice", entityId: row!.id, after: { number, kind: "credit_note", original: original.number, amountCents: amount, reason, memo, roomBeforeCents: room } }]);
  return { ok: true, creditNoteId: row!.id, number };
}

// ---------- promises to pay ----------

export type PromiseError = "forbidden" | "not_found" | "date" | "amount" | "note";

export async function recordPromise(tx: Tx, actor: Actor, invoiceId: unknown, input: { promisedOn: unknown; amountCents: unknown; note: unknown }): Promise<{ ok: true } | { ok: false; error: PromiseError }> {
  if (!can(actor, "cash")) return { ok: false, error: "forbidden" };
  if (typeof invoiceId !== "string" || !UUID.test(invoiceId)) return { ok: false, error: "not_found" };
  const [invoice] = await tx.select({ id: s.invoices.id, number: s.invoices.number, kind: s.invoices.kind, status: s.invoices.status }).from(s.invoices).where(eq(s.invoices.id, invoiceId));
  if (!invoice || invoice.kind === "credit_note" || invoice.status === "void") return { ok: false, error: "not_found" };
  const today = await agencyToday(tx);
  if (!isDate(input.promisedOn) || input.promisedOn < today) return { ok: false, error: "date" };
  const amount = input.amountCents === null || input.amountCents === undefined ? null : input.amountCents;
  if (amount !== null && (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0 || amount > INT4_MAX)) return { ok: false, error: "amount" };
  const note = cleanText(input.note, 500);
  if (note === false) return { ok: false, error: "note" };
  const [row] = await tx.insert(s.promisesToPay).values({ agencyId: actor.agencyId, invoiceId, promisedOn: input.promisedOn, amountCents: amount, note, createdBy: actor.userId, createdByLabel: actor.label }).returning({ id: s.promisesToPay.id });
  await audit(tx, actor, [{ action: "create", entityType: "promise_to_pay", entityId: row!.id, after: { invoiceId, number: invoice.number, promisedOn: input.promisedOn, amountCents: amount, note } }]);
  return { ok: true };
}

export interface PromiseView {
  promisedOn: string;
  amountCents: number | null;
  note: string | null;
  by: string;
  /** The date passed with money still owed. */
  broken: boolean;
}

/** Each invoice's latest promise (receivables shows it beside the status). */
export async function latestPromises(tx: Tx, invoiceIds: string[], today: string, balances: Map<string, number>): Promise<Map<string, PromiseView>> {
  if (invoiceIds.length === 0) return new Map();
  const rows = await tx.select().from(s.promisesToPay).where(inArray(s.promisesToPay.invoiceId, invoiceIds)).orderBy(desc(s.promisesToPay.createdAt));
  const out = new Map<string, PromiseView>();
  for (const r of rows) {
    if (out.has(r.invoiceId)) continue;
    out.set(r.invoiceId, { promisedOn: r.promisedOn, amountCents: r.amountCents, note: r.note, by: r.createdByLabel, broken: r.promisedOn < today && (balances.get(r.invoiceId) ?? 0) > 0 });
  }
  return out;
}

export async function promisesOf(tx: Tx, invoiceId: string): Promise<{ promisedOn: string; amountCents: number | null; note: string | null; by: string; at: Date }[]> {
  const rows = await tx.select().from(s.promisesToPay).where(eq(s.promisesToPay.invoiceId, invoiceId)).orderBy(asc(s.promisesToPay.createdAt));
  return rows.map((r) => ({ promisedOn: r.promisedOn, amountCents: r.amountCents, note: r.note, by: r.createdByLabel, at: r.createdAt }));
}

// ---------- the reminder schedule ----------

export async function scheduleOf(tx: Tx, today: string): Promise<ReminderSchedule> {
  return parseSchedule(await settingOn<unknown>(tx, SCHEDULE_KEY, today).catch(() => undefined));
}

/** The Owner's schedule, from today on (an effective-dated agency setting). */
export async function saveSchedule(tx: Tx, actor: Actor, input: unknown): Promise<{ ok: true } | { ok: false; error: "forbidden" | "invalid" }> {
  if (!can(actor, "settings")) return { ok: false, error: "forbidden" };
  const schedule = parseSchedule(input);
  // parseSchedule answers "send nothing" (DEFAULT_SCHEDULE itself) for anything that is not one of the choices.
  if (schedule === DEFAULT_SCHEDULE && JSON.stringify(input) !== JSON.stringify(DEFAULT_SCHEDULE)) return { ok: false, error: "invalid" };
  const today = await agencyToday(tx);
  const before = await scheduleOf(tx, today);
  // The setting in effect ends yesterday (end dates are inclusive); one made today is replaced.
  const open = await tx.select().from(s.agencySettings).where(eq(s.agencySettings.key, SCHEDULE_KEY));
  for (const row of open) {
    if (row.effectiveTo !== null && row.effectiveTo < today) continue;
    if (row.effectiveFrom >= today) await tx.delete(s.agencySettings).where(eq(s.agencySettings.id, row.id));
    else await tx.update(s.agencySettings).set({ effectiveTo: addDays(today, -1) }).where(eq(s.agencySettings.id, row.id));
  }
  const [row] = await tx.insert(s.agencySettings).values({ agencyId: actor.agencyId, key: SCHEDULE_KEY, value: schedule, effectiveFrom: today }).returning({ id: s.agencySettings.id });
  await audit(tx, actor, [{ action: "update", entityType: "agency_setting", entityId: row!.id, before: { key: SCHEDULE_KEY, value: before }, after: { key: SCHEDULE_KEY, value: schedule } }]);
  return { ok: true };
}

/** A client in or out of the automatic reminders (its billing profile in effect today). */
export async function setClientReminders(tx: Tx, actor: Actor, clientId: unknown, on: unknown): Promise<{ ok: true } | { ok: false; error: "forbidden" | "not_found" | "invalid" }> {
  if (!can(actor, "clientBilling")) return { ok: false, error: "forbidden" };
  if (typeof clientId !== "string" || !UUID.test(clientId) || typeof on !== "boolean") return { ok: false, error: "invalid" };
  const profile = await profileToday(tx, clientId, await agencyToday(tx));
  if (!profile) return { ok: false, error: "not_found" };
  // Today's version and every one already set to start later, so a scheduled new version does not
  // switch the reminders back (money review A3).
  await tx
    .update(s.clientBillingProfiles)
    .set({ remindersOff: !on })
    .where(and(eq(s.clientBillingProfiles.clientId, clientId), or(eq(s.clientBillingProfiles.id, profile.id), gt(s.clientBillingProfiles.effectiveFrom, profile.effectiveFrom))));
  await audit(tx, actor, [{ action: "update", entityType: "billing_profile", entityId: profile.id, before: { remindersOff: profile.remindersOff }, after: { remindersOff: !on } }]);
  return { ok: true };
}

async function profileToday(tx: Tx, clientId: string, today: string) {
  const rows = await tx.select().from(s.clientBillingProfiles).where(eq(s.clientBillingProfiles.clientId, clientId)).orderBy(desc(s.clientBillingProfiles.effectiveFrom));
  return rows.find((p) => p.effectiveFrom <= today && (p.effectiveTo === null || today <= p.effectiveTo)) ?? null;
}

/** The settings page's clients: each with its reminders on or off and whether it has a billing email. */
export async function clientsForReminders(tx: Tx, today: string) {
  const clients = await tx.select().from(s.clients).orderBy(asc(s.clients.name));
  const out = [];
  for (const c of clients) {
    const profile = await profileToday(tx, c.id, today);
    out.push({ id: c.id, name: c.name, billingEmail: c.billingEmail, remindersOn: profile ? !profile.remindersOff : false, hasProfile: profile !== null });
  }
  return out;
}

/**
 * The scheduled sweep (the host's schedule): each unpaid invoice of a client in the reminders gets the
 * stage its schedule says, once (a unique row per invoice and stage), with the PDF attached.
 */
export async function sweepReminders(deps: CollectionsDeps, agencyId: string): Promise<{ sent: number; failed: number }> {
  const prepared = await deps.withAgency(agencyId, async (tx) => {
    const today = await agencyToday(tx, nowOf(deps));
    const schedule = await scheduleOf(tx, today);
    if (!schedule.enabled) return [];
    const agency = await agencyOf(tx);
    const out: Prepared[] = [];
    for (const b of await invoiceBalances(tx)) {
      if (b.invoice.status !== "issued" || b.balanceCents <= 0 || !b.invoice.pdfStorageKey) continue;
      // A stage whose email failed is not sent yet: the next sweep tries the same email again (money
      // review A4); the stage keeps its one reminder row.
      const rows = await tx
        .select({ stage: s.reminders.stage, mailId: s.reminders.emailMessageId, status: s.emailMessages.status })
        .from(s.reminders)
        .leftJoin(s.emailMessages, eq(s.emailMessages.id, s.reminders.emailMessageId))
        .where(and(eq(s.reminders.invoiceId, b.invoice.id), eq(s.reminders.how, "emailed")));
      const sent = rows.filter((r) => r.status !== "failed").map((r) => r.stage);
      const stage = reminderDue({ dueOn: b.invoice.dueOn, balanceCents: b.balanceCents }, schedule, today, sent);
      if (!stage) continue;
      const failed = rows.find((r) => r.stage === stage && r.status === "failed");
      const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, b.invoice.clientId));
      const profile = await profileToday(tx, b.invoice.clientId, today);
      if (!client?.billingEmail || !profile || profile.remindersOff) continue;
      const locale = await clientLocale(tx, client.id);
      const view = await invoiceReceivables(tx, b.invoice.id, today);
      const rendered = renderReminderEmail(view!.reminder.drafts[locale][stage]);
      const filename = pdfName(b.invoice.number, b.invoice.kind);
      let mailId: string;
      if (failed?.mailId) {
        // Taken back from "failed" once, so two sweeps at the same moment retry it once.
        const [retry] = await tx
          .update(s.emailMessages)
          .set({ status: "sending", error: null })
          .where(and(eq(s.emailMessages.id, failed.mailId), eq(s.emailMessages.status, "failed")))
          .returning({ id: s.emailMessages.id });
        if (!retry) continue;
        mailId = retry.id;
      } else {
        const [mail] = await tx
          .insert(s.emailMessages)
          .values({ agencyId, kind: "invoice_reminder", invoiceId: b.invoice.id, toEmail: client.billingEmail, toName: client.name, subject: rendered.subject, textBody: rendered.text, status: "sending", attachments: [{ filename, bytes: 0 }], createdAt: nowOf(deps) })
          .returning({ id: s.emailMessages.id });
        await tx.insert(s.reminders).values({ agencyId, invoiceId: b.invoice.id, stage, locale, how: "emailed", emailMessageId: mail!.id, createdByLabel: "Granite" });
        mailId = mail!.id;
      }
      out.push({ mailId, agencyId, fromName: agency.name, replyTo: agency.email, to: { email: client.billingEmail, name: client.name }, rendered, attachment: { filename, key: b.invoice.pdfStorageKey }, extra: [] });
    }
    return out;
  });
  let sent = 0;
  for (const p of prepared) if (await deliver(deps, p)) sent += 1;
  return { sent, failed: prepared.length - sent };
}
