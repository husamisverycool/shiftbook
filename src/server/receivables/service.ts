/**
 * Receivables and cash application (SPEC §14; slice h decisions H2–H9). Shiftbook records what the
 * agency received and where it applied it; it never moves money and never sends anything. Every
 * change is the Owner's or Billing's, under the agency's receivables lock, audited.
 */
import { createHash } from "node:crypto";
import { isIsoDate } from "@shiftbook/rules";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { lockReceivables } from "../run/period-lock";
import type { Actor } from "../session";
import { agencyToday } from "../settings";
import { BANK_FILE_LIMITS, bankRows, readBankLines } from "./bank-csv";
import { fingerprints } from "./bank-fingerprint";
import { invoiceBalances, settleStatuses, unappliedOf } from "./balances";

const INT4_MAX = 2_147_483_647;
/** Who may record and change receivables (SPEC §2: Billing does invoices, AR and cash application). */
export const mayCollect = (actor: Actor) => actor.role === "owner" || actor.role === "billing";

export interface Application {
  invoiceId: string;
  amountCents: number;
}

export interface PaymentInput {
  clientId: string;
  receivedOn: string;
  amountCents: number;
  method: s.PaymentMethod;
  reference: string | null;
  memo: string | null;
  applications: Application[];
}

export interface ReceivablesProblem {
  field: "clientId" | "receivedOn" | "amountCents" | "method" | "reference" | "memo" | "applications" | "reason" | "note";
  rule: string;
  invoiceId?: string;
}

export type ReceivablesResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: "not_allowed" | "not_found" | "voided" | "line_not_open" }
  | { ok: false; error: "invalid"; problems: ReceivablesProblem[] };

const whole = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);
const text = (v: unknown, max: number) => v === null || (typeof v === "string" && v.length <= max);

/** What is wrong with applying amounts to a client's invoices (each open, each within its balance, in total within `available`). */
async function applicationProblems(tx: Tx, clientId: string, applications: unknown, available: number): Promise<ReceivablesProblem[]> {
  if (!Array.isArray(applications) || applications.length > 200) return [{ field: "applications", rule: "applications" }];
  const problems: ReceivablesProblem[] = [];
  const ids = applications.map((a) => (a as Application)?.invoiceId);
  if (ids.some((x) => typeof x !== "string") || new Set(ids).size !== ids.length) return [{ field: "applications", rule: "applications" }];
  const open = await invoiceBalances(tx, { clientIds: [clientId], invoiceIds: ids as string[] });
  let total = 0;
  for (const a of applications as Application[]) {
    const b = open.find((x) => x.invoice.id === a.invoiceId);
    if (!b) problems.push({ field: "applications", rule: "not_this_clients", invoiceId: a.invoiceId });
    else if (!whole(a.amountCents) || a.amountCents <= 0) problems.push({ field: "applications", rule: "amount", invoiceId: a.invoiceId });
    else if (a.amountCents > b.balanceCents) problems.push({ field: "applications", rule: "more_than_owed", invoiceId: a.invoiceId });
    else total += a.amountCents;
  }
  if (problems.length === 0 && total > available) problems.push({ field: "applications", rule: "more_than_received" });
  return problems;
}

/**
 * Records money received from a client and applies it (QuickBooks Online Receive payment); what is
 * not applied is the client's credit. From a bank line, the payment carries the line's date, amount
 * and description, and the line is posted.
 */
export async function recordPayment(tx: Tx, actor: Actor, input: unknown, opts: { bankLineId?: string } = {}): Promise<ReceivablesResult<{ paymentId: string }>> {
  if (!mayCollect(actor)) return { ok: false, error: "not_allowed" };
  await lockReceivables(tx, actor.agencyId);
  const v = (input ?? {}) as Partial<PaymentInput>;
  const today = await agencyToday(tx);
  const problems: ReceivablesProblem[] = [];
  const [client] = typeof v.clientId === "string" ? await tx.select({ id: s.clients.id }).from(s.clients).where(eq(s.clients.id, v.clientId)) : [];
  if (!client) problems.push({ field: "clientId", rule: "choose_client" });
  if (typeof v.receivedOn !== "string" || !isIsoDate(v.receivedOn)) problems.push({ field: "receivedOn", rule: "date" });
  else if (v.receivedOn > today) problems.push({ field: "receivedOn", rule: "future" });
  if (!whole(v.amountCents) || v.amountCents <= 0 || v.amountCents > INT4_MAX) problems.push({ field: "amountCents", rule: "amount" });
  if (!s.PAYMENT_METHODS.includes(v.method as s.PaymentMethod)) problems.push({ field: "method", rule: "choose_method" });
  if (!text(v.reference ?? null, 100)) problems.push({ field: "reference", rule: "too_long" });
  if (!text(v.memo ?? null, 500)) problems.push({ field: "memo", rule: "too_long" });
  let line: typeof s.bankLines.$inferSelect | undefined;
  if (opts.bankLineId) {
    [line] = await tx.select().from(s.bankLines).where(eq(s.bankLines.id, opts.bankLineId));
    if (!line) return { ok: false, error: "not_found" };
    if (line.status !== "review" || line.amountCents <= 0) return { ok: false, error: "line_not_open" };
    if (v.amountCents !== line.amountCents || v.receivedOn !== line.postedOn) problems.push({ field: "amountCents", rule: "not_the_deposit" });
  }
  if (problems.length === 0) problems.push(...(await applicationProblems(tx, client!.id, v.applications, v.amountCents!)));
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const p = v as PaymentInput;
  const [row] = await tx
    .insert(s.payments)
    .values({ agencyId: actor.agencyId, clientId: p.clientId, receivedOn: p.receivedOn, amountCents: p.amountCents, method: p.method, reference: p.reference?.trim() || null, memo: p.memo?.trim() || null, bankLineId: line?.id ?? null, createdBy: actor.userId, createdByLabel: actor.label })
    .returning();
  if (p.applications.length > 0) {
    await tx.insert(s.paymentMatches).values(p.applications.map((a) => ({ agencyId: actor.agencyId, paymentId: row!.id, invoiceId: a.invoiceId, amountCents: a.amountCents, createdBy: actor.userId, createdByLabel: actor.label })));
  }
  if (line) await tx.update(s.bankLines).set({ status: "posted" }).where(eq(s.bankLines.id, line.id));
  await settleStatuses(tx, p.applications.map((a) => a.invoiceId));
  await audit(tx, actor, [
    { action: "create", entityType: "payment", entityId: row!.id, after: { clientId: p.clientId, receivedOn: p.receivedOn, amountCents: p.amountCents, method: p.method, reference: row!.reference, applications: p.applications, bankLineId: line?.id ?? null } },
  ]);
  return { ok: true, paymentId: row!.id };
}

/** Applies what is left of a payment (its credit) to the client's open invoices. */
export async function applyCredit(tx: Tx, actor: Actor, paymentId: string, applications: unknown): Promise<ReceivablesResult> {
  if (!mayCollect(actor)) return { ok: false, error: "not_allowed" };
  await lockReceivables(tx, actor.agencyId);
  const [p] = await tx.select().from(s.payments).where(eq(s.payments.id, paymentId));
  if (!p) return { ok: false, error: "not_found" };
  if (p.voidedAt) return { ok: false, error: "voided" };
  const problems = await applicationProblems(tx, p.clientId, applications, await unappliedOf(tx, paymentId));
  if (Array.isArray(applications) && applications.length === 0) problems.push({ field: "applications", rule: "applications" });
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const apps = applications as Application[];
  await tx.insert(s.paymentMatches).values(apps.map((a) => ({ agencyId: actor.agencyId, paymentId, invoiceId: a.invoiceId, amountCents: a.amountCents, createdBy: actor.userId, createdByLabel: actor.label })));
  await settleStatuses(tx, apps.map((a) => a.invoiceId));
  await audit(tx, actor, [{ action: "update", entityType: "payment", entityId: paymentId, after: { applied: apps }, reason: "credit applied" }]);
  return { ok: true };
}

/** Voids a payment with a reason (Stripe "unapply"): the invoices it paid open again; a bank line returns to review. */
export async function voidPayment(tx: Tx, actor: Actor, paymentId: string, reason: string): Promise<ReceivablesResult> {
  if (!mayCollect(actor)) return { ok: false, error: "not_allowed" };
  if (typeof reason !== "string" || reason.trim() === "" || reason.length > 500) return { ok: false, error: "invalid", problems: [{ field: "reason", rule: "reason" }] };
  await lockReceivables(tx, actor.agencyId);
  const [p] = await tx.select().from(s.payments).where(eq(s.payments.id, paymentId));
  if (!p) return { ok: false, error: "not_found" };
  if (p.voidedAt) return { ok: false, error: "voided" };
  await tx.update(s.payments).set({ voidedAt: new Date(), voidReason: reason.trim() }).where(eq(s.payments.id, paymentId));
  if (p.bankLineId) await tx.update(s.bankLines).set({ status: "review" }).where(eq(s.bankLines.id, p.bankLineId));
  const applied = await tx.select({ invoiceId: s.paymentMatches.invoiceId }).from(s.paymentMatches).where(eq(s.paymentMatches.paymentId, paymentId));
  await settleStatuses(tx, applied.map((a) => a.invoiceId));
  await audit(tx, actor, [{ action: "update", entityType: "payment", entityId: paymentId, before: { voided: false }, after: { voided: true, bankLineId: p.bankLineId }, reason: reason.trim() }]);
  return { ok: true };
}

/** Lets go of the rest of an invoice, with a reason (TempWorks small-balance write-off). */
export async function writeOff(tx: Tx, actor: Actor, invoiceId: string, input: unknown): Promise<ReceivablesResult> {
  if (!mayCollect(actor)) return { ok: false, error: "not_allowed" };
  await lockReceivables(tx, actor.agencyId);
  const v = (input ?? {}) as { amountCents?: unknown; reason?: unknown; note?: unknown };
  const [b] = await invoiceBalances(tx, { invoiceIds: [invoiceId] });
  if (!b) return { ok: false, error: "not_found" };
  const problems: ReceivablesProblem[] = [];
  if (!whole(v.amountCents) || v.amountCents <= 0) problems.push({ field: "amountCents", rule: "amount" });
  else if (v.amountCents > b.balanceCents) problems.push({ field: "amountCents", rule: "more_than_owed" });
  if (!s.WRITE_OFF_REASONS.includes(v.reason as s.WriteOffReason)) problems.push({ field: "reason", rule: "choose_reason" });
  if (!text(v.note ?? null, 500)) problems.push({ field: "note", rule: "too_long" });
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const writtenOn = await agencyToday(tx);
  const [row] = await tx
    .insert(s.writeOffs)
    .values({ agencyId: actor.agencyId, invoiceId, writtenOn, amountCents: v.amountCents as number, reason: v.reason as s.WriteOffReason, note: (v.note as string | null)?.trim() || null, createdBy: actor.userId, createdByLabel: actor.label })
    .returning();
  await settleStatuses(tx, [invoiceId]);
  await audit(tx, actor, [{ action: "create", entityType: "write_off", entityId: row!.id, after: { invoiceId, number: b.invoice.number, amountCents: v.amountCents, reason: v.reason, balanceBefore: b.balanceCents } }]);
  return { ok: true };
}

/** Records (or changes) why an invoice was paid short (H4). */
export async function setShortPay(tx: Tx, actor: Actor, invoiceId: string, reason: unknown, note: unknown): Promise<ReceivablesResult> {
  if (!mayCollect(actor)) return { ok: false, error: "not_allowed" };
  const problems: ReceivablesProblem[] = [];
  if (!s.SHORT_PAY_REASONS.includes(reason as s.ShortPayReason)) problems.push({ field: "reason", rule: "choose_reason" });
  if (!text(note ?? null, 500)) problems.push({ field: "note", rule: "too_long" });
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  await lockReceivables(tx, actor.agencyId);
  const [inv] = await tx.select({ id: s.invoices.id }).from(s.invoices).where(eq(s.invoices.id, invoiceId));
  if (!inv) return { ok: false, error: "not_found" };
  const [before] = await tx.select().from(s.shortPays).where(eq(s.shortPays.invoiceId, invoiceId));
  const values = { reason: reason as s.ShortPayReason, note: (note as string | null)?.trim() || null, recordedAt: new Date(), recordedBy: actor.userId, recordedByLabel: actor.label };
  if (before) await tx.update(s.shortPays).set(values).where(eq(s.shortPays.id, before.id));
  else await tx.insert(s.shortPays).values({ agencyId: actor.agencyId, invoiceId, ...values });
  await audit(tx, actor, [{ action: before ? "update" : "create", entityType: "short_pay", entityId: invoiceId, before: before ? { reason: before.reason, note: before.note } : null, after: { reason, note: values.note } }]);
  return { ok: true };
}

/** Records that a reminder was prepared (copied, or opened in the email app): Shiftbook sends nothing (H8). */
export async function recordReminder(tx: Tx, actor: Actor, invoiceId: string, stage: unknown, locale: unknown, how: unknown): Promise<ReceivablesResult> {
  if (!mayCollect(actor)) return { ok: false, error: "not_allowed" };
  if (!s.REMINDER_STAGES.includes(stage as s.ReminderStage) || (locale !== "en" && locale !== "es") || (how !== "copied" && how !== "email_app")) return { ok: false, error: "invalid", problems: [] };
  const [b] = await invoiceBalances(tx, { invoiceIds: [invoiceId] });
  if (!b) return { ok: false, error: "not_found" };
  const [row] = await tx.insert(s.reminders).values({ agencyId: actor.agencyId, invoiceId, stage: stage as s.ReminderStage, locale, how, createdBy: actor.userId, createdByLabel: actor.label }).returning();
  await audit(tx, actor, [{ action: "create", entityType: "reminder", entityId: row!.id, after: { invoiceId, number: b.invoice.number, stage, locale, how, balanceCents: b.balanceCents } }]);
  return { ok: true };
}

// ---------- bank file (H5) ----------

export type ImportResult = ReceivablesResult<{ importId: string; imported: number; skipped: number }> | { ok: false; error: "file"; reason: "size" | "lines" | "empty" | "unreadable"; rows?: number[] };

/**
 * Imports the chosen lines of a bank CSV read with a mapping (QuickBooks Online Upload from file).
 * A line imported before is skipped; a withdrawal is kept as excluded (it is never a client's
 * payment); every chosen line must read cleanly or nothing is imported.
 */
export async function importBankFile(tx: Tx, actor: Actor, file: { filename: string; text: string }, mapping: s.BankMapping, chosenRows: number[]): Promise<ImportResult> {
  if (!mayCollect(actor)) return { ok: false, error: "not_allowed" };
  if (Buffer.byteLength(file.text, "utf8") > BANK_FILE_LIMITS.bytes) return { ok: false, error: "file", reason: "size" };
  const rows = bankRows(file.text);
  if (rows.length > BANK_FILE_LIMITS.lines + 20) return { ok: false, error: "file", reason: "lines" };
  const read = readBankLines(rows, mapping);
  const chosen = new Set(chosenRows);
  const bad = read.problems.filter((p) => chosen.has(p.rowNumber)).map((p) => p.rowNumber);
  if (bad.length > 0) return { ok: false, error: "file", reason: "unreadable", rows: bad };
  const lines = read.lines.filter((l) => chosen.has(l.rowNumber));
  if (lines.length === 0) return { ok: false, error: "file", reason: "empty" };
  await lockReceivables(tx, actor.agencyId);
  const prints = fingerprints(read.lines);
  const printOf = new Map(read.lines.map((l, i) => [l.rowNumber, prints[i]!]));
  const existing = new Set((await tx.select({ fingerprint: s.bankLines.fingerprint }).from(s.bankLines).where(inArray(s.bankLines.fingerprint, lines.map((l) => printOf.get(l.rowNumber)!)))).map((r) => r.fingerprint));
  const fresh = lines.filter((l) => !existing.has(printOf.get(l.rowNumber)!));
  const [imp] = await tx
    .insert(s.bankImports)
    .values({ agencyId: actor.agencyId, filename: file.filename.slice(0, 200), sha256: createHash("sha256").update(file.text).digest("hex"), mapping, lineCount: fresh.length, createdBy: actor.userId, createdByLabel: actor.label })
    .returning();
  if (fresh.length > 0) {
    await tx.insert(s.bankLines).values(
      fresh.map((l) => ({
        agencyId: actor.agencyId,
        importId: imp!.id,
        rowNumber: l.rowNumber,
        postedOn: l.postedOn,
        description: l.description,
        reference: l.reference,
        amountCents: l.amountCents,
        fingerprint: printOf.get(l.rowNumber)!,
        status: l.amountCents > 0 ? ("review" as const) : ("excluded" as const),
        excludedReason: l.amountCents > 0 ? null : "withdrawal",
      })),
    );
  }
  await audit(tx, actor, [{ action: "create", entityType: "bank_import", entityId: imp!.id, after: { filename: imp!.filename, sha256: imp!.sha256, imported: fresh.length, skipped: lines.length - fresh.length } }]);
  return { ok: true, importId: imp!.id, imported: fresh.length, skipped: lines.length - fresh.length };
}

export const EXCLUDE_REASONS = ["not_a_client_payment", "transfer", "duplicate", "other"] as const;

/** Excludes a deposit from review (QuickBooks Online Exclude), with why. */
export async function excludeLine(tx: Tx, actor: Actor, lineId: string, reason: unknown): Promise<ReceivablesResult> {
  if (!mayCollect(actor)) return { ok: false, error: "not_allowed" };
  if (!EXCLUDE_REASONS.includes(reason as (typeof EXCLUDE_REASONS)[number])) return { ok: false, error: "invalid", problems: [{ field: "reason", rule: "choose_reason" }] };
  await lockReceivables(tx, actor.agencyId);
  const [line] = await tx.select().from(s.bankLines).where(eq(s.bankLines.id, lineId));
  if (!line) return { ok: false, error: "not_found" };
  if (line.status !== "review") return { ok: false, error: "line_not_open" };
  await tx.update(s.bankLines).set({ status: "excluded", excludedReason: reason as string }).where(eq(s.bankLines.id, lineId));
  await audit(tx, actor, [{ action: "update", entityType: "bank_line", entityId: lineId, before: { status: "review" }, after: { status: "excluded", reason } }]);
  return { ok: true };
}

/** Brings an excluded deposit back to review (a withdrawal stays excluded). */
export async function includeLine(tx: Tx, actor: Actor, lineId: string): Promise<ReceivablesResult> {
  if (!mayCollect(actor)) return { ok: false, error: "not_allowed" };
  await lockReceivables(tx, actor.agencyId);
  const [line] = await tx.select().from(s.bankLines).where(eq(s.bankLines.id, lineId));
  if (!line) return { ok: false, error: "not_found" };
  if (line.status !== "excluded" || line.amountCents <= 0) return { ok: false, error: "line_not_open" };
  await tx.update(s.bankLines).set({ status: "review", excludedReason: null }).where(eq(s.bankLines.id, lineId));
  await audit(tx, actor, [{ action: "update", entityType: "bank_line", entityId: lineId, before: { status: "excluded", reason: line.excludedReason }, after: { status: "review" } }]);
  return { ok: true };
}

/** Undoes a posted line (QuickBooks Online Undo): its payment is voided and the line is back in review. */
export async function undoLine(tx: Tx, actor: Actor, lineId: string): Promise<ReceivablesResult> {
  if (!mayCollect(actor)) return { ok: false, error: "not_allowed" };
  const [p] = await tx.select({ id: s.payments.id }).from(s.payments).where(and(eq(s.payments.bankLineId, lineId), isNull(s.payments.voidedAt)));
  if (!p) return { ok: false, error: "not_found" };
  return voidPayment(tx, actor, p.id, "bank line undone");
}
