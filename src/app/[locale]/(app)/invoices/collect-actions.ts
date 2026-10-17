"use server";

import { revalidatePath } from "next/cache";
import { issueCreditNote, recordPromise, sendInvoice, type CreditError, type PromiseError, type SendError } from "@/server/collections/service";
import { withAgency } from "@/server/db";
import { PeriodBusyError } from "@/server/run/period-lock";
import { mailTransport } from "@/server/services";
import { actorAllowedTo } from "@/server/session";
import { documentStore } from "@/server/storage";

/**
 * Slice r's invoice actions (docs/patterns/invoices/[id].md): send or resend, issue a credit note,
 * record a promise to pay. Shapes are checked here; the collections service checks every rule.
 */
const refresh = () => {
  for (const path of ["/[locale]/(app)/invoices", "/[locale]/(app)/invoices/[id]", "/[locale]/(app)/receivables", "/[locale]/(app)/clients/[id]"]) revalidatePath(path, "page");
};
const small = (v: unknown, max = 4_000) => JSON.stringify(v ?? null).length <= max;

export async function sendInvoiceAction(invoiceId: unknown, message: unknown): Promise<{ ok: true; to: string } | { ok: false; error: SendError | "failed" }> {
  if (!small(message)) return { ok: false, error: "invalid" };
  const actor = await actorAllowedTo("cash");
  const r = await sendInvoice({ withAgency, store: documentStore, mailTransport }, actor, invoiceId, message);
  refresh();
  return r;
}

export async function issueCreditNoteAction(invoiceId: unknown, input: unknown): Promise<{ ok: true; creditNoteId: string; number: string } | { ok: false; error: CreditError | "busy"; roomCents?: number }> {
  if (!small(input)) return { ok: false, error: "amount" };
  const actor = await actorAllowedTo("cash");
  const v = (input ?? {}) as Record<string, unknown>;
  try {
    return await withAgency(actor.agencyId, (tx) => issueCreditNote(tx, documentStore, actor, invoiceId, { reason: v.reason, amountCents: v.amountCents, memo: v.memo }));
  } catch (error) {
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    throw error;
  } finally {
    refresh();
  }
}

export async function promiseAction(invoiceId: unknown, input: unknown): Promise<{ ok: true } | { ok: false; error: PromiseError }> {
  if (!small(input)) return { ok: false, error: "note" };
  const actor = await actorAllowedTo("cash");
  const v = (input ?? {}) as Record<string, unknown>;
  const r = await withAgency(actor.agencyId, (tx) => recordPromise(tx, actor, invoiceId, { promisedOn: v.promisedOn, amountCents: v.amountCents, note: v.note }));
  refresh();
  return r;
}
