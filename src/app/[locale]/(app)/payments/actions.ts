"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAgency } from "@/server/db";
import type { BankMapping } from "@/server/db/schema";
import { alignMapping, BANK_FILE_LIMITS, bankRows, firstMapping, guessMapping, readBankLines, type BankFileProblem } from "@/server/receivables/bank-csv";
import { fingerprints } from "@/server/receivables/bank-fingerprint";
import { lastBankMapping } from "@/server/receivables/queries";
import * as r from "@/server/receivables/service";
import * as s from "@/server/db/schema";
import { inArray } from "drizzle-orm";
import { PeriodBusyError } from "@/server/run/period-lock";
import { currentActor } from "@/server/session";

/**
 * Receivables actions (slice h; patterns receivables.md, payments.md, bank.md, bank/import.md,
 * invoices/[id].md). Shapes are checked here; the receivables service checks every rule.
 */
export type ActionResult = r.ReceivablesResult | { ok: false; error: "busy" | "generic" };

const refresh = () => {
  for (const path of ["/[locale]/(app)/receivables", "/[locale]/(app)/payments", "/[locale]/(app)/bank", "/[locale]/(app)/invoices", "/[locale]/(app)/invoices/[id]", "/[locale]/(app)/clients/[id]"]) revalidatePath(path, "page");
};
async function guarded<T>(fn: () => Promise<T>): Promise<T | { ok: false; error: "busy" }> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    throw error;
  } finally {
    refresh();
  }
}
const id = z.uuid();
const small = (v: unknown) => JSON.stringify(v ?? null).length <= 20_000;

export async function recordPaymentAction(input: unknown, bankLineId?: string): Promise<r.ReceivablesResult<{ paymentId: string }> | { ok: false; error: "busy" | "generic" }> {
  if (!small(input) || (bankLineId !== undefined && !id.safeParse(bankLineId).success)) return { ok: false, error: "generic" };
  const actor = currentActor();
  return guarded(() => withAgency(actor.agencyId, (tx) => r.recordPayment(tx, actor, input, { bankLineId })));
}

export async function applyCreditAction(paymentId: string, applications: unknown): Promise<ActionResult> {
  if (!id.safeParse(paymentId).success || !small(applications)) return { ok: false, error: "generic" };
  const actor = currentActor();
  return guarded(() => withAgency(actor.agencyId, (tx) => r.applyCredit(tx, actor, paymentId, applications)));
}

export async function applyInvoiceCreditAction(fromInvoiceId: string, applications: unknown): Promise<ActionResult> {
  if (!id.safeParse(fromInvoiceId).success || !small(applications)) return { ok: false, error: "generic" };
  const actor = currentActor();
  return guarded(() => withAgency(actor.agencyId, (tx) => r.applyInvoiceCredit(tx, actor, fromInvoiceId, applications)));
}

export async function voidPaymentAction(paymentId: string, reason: string): Promise<ActionResult> {
  if (!id.safeParse(paymentId).success || typeof reason !== "string" || reason.length > 500) return { ok: false, error: "generic" };
  const actor = currentActor();
  return guarded(() => withAgency(actor.agencyId, (tx) => r.voidPayment(tx, actor, paymentId, reason)));
}

export async function writeOffAction(invoiceId: string, input: unknown): Promise<ActionResult> {
  if (!id.safeParse(invoiceId).success || !small(input)) return { ok: false, error: "generic" };
  const actor = currentActor();
  return guarded(() => withAgency(actor.agencyId, (tx) => r.writeOff(tx, actor, invoiceId, input)));
}

export async function shortPayAction(invoiceId: string, reason: unknown, note: unknown): Promise<ActionResult> {
  if (!id.safeParse(invoiceId).success || !small([reason, note])) return { ok: false, error: "generic" };
  const actor = currentActor();
  return guarded(() => withAgency(actor.agencyId, (tx) => r.setShortPay(tx, actor, invoiceId, reason, note)));
}

export async function reminderAction(invoiceId: string, stage: unknown, locale: unknown, how: unknown): Promise<ActionResult> {
  if (!id.safeParse(invoiceId).success) return { ok: false, error: "generic" };
  const actor = currentActor();
  return guarded(() => withAgency(actor.agencyId, (tx) => r.recordReminder(tx, actor, invoiceId, stage, locale, how)));
}

export async function excludeLineAction(lineId: string, reason: unknown): Promise<ActionResult> {
  if (!id.safeParse(lineId).success) return { ok: false, error: "generic" };
  const actor = currentActor();
  return guarded(() => withAgency(actor.agencyId, (tx) => r.excludeLine(tx, actor, lineId, reason)));
}

export async function includeLineAction(lineId: string): Promise<ActionResult> {
  if (!id.safeParse(lineId).success) return { ok: false, error: "generic" };
  const actor = currentActor();
  return guarded(() => withAgency(actor.agencyId, (tx) => r.includeLine(tx, actor, lineId)));
}

export async function undoLineAction(lineId: string): Promise<ActionResult> {
  if (!id.safeParse(lineId).success) return { ok: false, error: "generic" };
  const actor = currentActor();
  return guarded(() => withAgency(actor.agencyId, (tx) => r.undoLine(tx, actor, lineId)));
}

const col = z.number().int().min(0).max(200);
const MappingSchema = z
  .object({
    headerRow: col.nullable(),
    date: col,
    description: col,
    reference: col.nullable(),
    amounts: z.union([z.object({ kind: z.literal("signed"), amount: col }).strict(), z.object({ kind: z.literal("split"), deposits: col, withdrawals: col }).strict(), z.object({ kind: z.literal("typed"), amount: col, type: col }).strict()]),
    dateFormat: z.enum(["MM/DD/YYYY", "YYYY-MM-DD", "DD/MM/YYYY"]),
  })
  .strict();

export interface BankPreview {
  ok: true;
  /** The first rows as text, to choose the header and the columns from. */
  head: string[][];
  columns: number;
  mapping: BankMapping;
  lines: { rowNumber: number; postedOn: string; description: string; amountCents: number; imported: boolean }[];
  problems: BankFileProblem[];
}

/** The first lines offered as the header row: as many as the header is looked for in (guessMapping). */
const HEAD_ROWS = 10;

/**
 * Reads a bank file with a mapping for the Map and Choose steps: the one given; else the last one used,
 * with this file's header row (review finding 2); else the one its header names; else a first mapping
 * from what its cells hold.
 */
export async function previewBankFileAction(text: string, mapping?: unknown): Promise<BankPreview | { ok: false; error: "size" | "lines" | "empty" | "not_allowed" | "generic" }> {
  if (typeof text !== "string") return { ok: false, error: "generic" };
  const actor = currentActor();
  if (!r.mayCollect(actor)) return { ok: false, error: "not_allowed" };
  if (Buffer.byteLength(text, "utf8") > BANK_FILE_LIMITS.bytes) return { ok: false, error: "size" };
  const rows = bankRows(text);
  if (rows.length === 0) return { ok: false, error: "empty" };
  if (rows.length > BANK_FILE_LIMITS.lines + 20) return { ok: false, error: "lines" };
  const given = mapping === undefined ? null : MappingSchema.safeParse(mapping);
  if (given && !given.success) return { ok: false, error: "generic" };
  const columns = Math.max(...rows.slice(0, 30).map((row) => row.length));
  const fits = (m: BankMapping | null): m is BankMapping => !!m && [m.date, m.description, m.reference ?? 0, ...Object.values(m.amounts).filter((v): v is number => typeof v === "number")].every((c) => c < columns);
  const remembered = given ? null : await withAgency(actor.agencyId, (tx) => lastBankMapping(tx));
  const chosen = given?.data ?? (fits(remembered) ? alignMapping(rows, remembered) : null) ?? guessMapping(rows) ?? firstMapping(rows);
  const usable = fits(chosen) ? chosen : (guessMapping(rows) ?? firstMapping(rows));
  const read = readBankLines(rows, usable);
  const prints = fingerprints(read.lines);
  const seen = prints.length > 0 ? new Set((await withAgency(actor.agencyId, (tx) => tx.select({ f: s.bankLines.fingerprint }).from(s.bankLines).where(inArray(s.bankLines.fingerprint, prints)))).map((x) => x.f)) : new Set<string>();
  return {
    ok: true,
    head: rows.slice(0, HEAD_ROWS),
    columns,
    mapping: usable,
    lines: read.lines.map((l, i) => ({ rowNumber: l.rowNumber, postedOn: l.postedOn, description: l.description, amountCents: l.amountCents, imported: seen.has(prints[i]!) })),
    problems: read.problems,
  };
}

export async function importBankFileAction(filename: string, text: string, mapping: unknown, rows: number[]): Promise<r.ImportResult | { ok: false; error: "busy" | "generic" }> {
  const m = MappingSchema.safeParse(mapping);
  if (typeof filename !== "string" || typeof text !== "string" || !m.success || !z.array(z.number().int().min(1)).max(2000).safeParse(rows).success) return { ok: false, error: "generic" };
  const actor = currentActor();
  return guarded(() => withAgency(actor.agencyId, (tx) => r.importBankFile(tx, actor, { filename, text }, m.data, rows)));
}
