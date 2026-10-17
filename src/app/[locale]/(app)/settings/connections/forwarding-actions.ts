"use server";

// The forwarding address's actions (decision 0042): the Owner manages the address and its senders
// (settings ability); whoever converts timesheets files a held email and, in the demo, sends the test
// email (hours ability).
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db, withAgency } from "@/server/db";
import { addressOf } from "@/server/inbound/address";
import { inboundDomain } from "@/server/inbound/config";
import { demoEmail } from "@/server/inbound/demo";
import { ensureAddress, fileHeldEmail, receiveInboundEmail, rotateAddress, setAllowedSenders } from "@/server/inbound/service";
import { PeriodBusyError, PeriodLockedError, PeriodNotFoundError } from "@/server/run/period-lock";
import { processQueuedDocuments } from "@/server/services";
import { actorAllowedTo, isDemo } from "@/server/session";
import { documentStore } from "@/server/storage";

const refresh = () => {
  revalidatePath("/[locale]/(app)/settings/connections", "page");
  revalidatePath("/[locale]/(app)/convert", "page");
};

export async function rotateForwardingAction(): Promise<{ ok: true }> {
  const actor = await actorAllowedTo("settings");
  await withAgency(actor.agencyId, (tx) => rotateAddress(tx, actor));
  refresh();
  return { ok: true };
}

export async function setSendersAction(input: unknown): Promise<{ ok: true; senders: string[] } | { ok: false; error: "invalid"; value: string } | { ok: false; error: "too_many" | "stale" }> {
  const actor = await actorAllowedTo("settings");
  const parsed = z.array(z.string().max(300)).max(60).safeParse(input);
  if (!parsed.success) return { ok: false, error: "stale" };
  const r = await withAgency(actor.agencyId, (tx) => setAllowedSenders(tx, actor, parsed.data));
  refresh();
  return r;
}

export async function fileHeldEmailAction(emailId: unknown, payPeriodId: unknown): Promise<{ ok: true; filed: number } | { ok: false; error: "not_found" | "not_held" | "busy" | "locked" | "generic" }> {
  const actor = await actorAllowedTo("hours");
  const ids = z.tuple([z.string().uuid(), z.string().uuid()]).safeParse([emailId, payPeriodId]);
  if (!ids.success) return { ok: false, error: "generic" };
  try {
    const r = await withAgency(actor.agencyId, (tx) => fileHeldEmail(tx, actor, documentStore, ids.data[0], ids.data[1]));
    if (r.ok) after(() => processQueuedDocuments(actor).catch(() => undefined));
    refresh();
    return r;
  } catch (error) {
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    if (error instanceof PeriodLockedError || error instanceof PeriodNotFoundError) return { ok: false, error: "locked" };
    throw error;
  }
}

/** Demo only: a test email to the agency's address, through the same code as a real one. */
export async function sendDemoEmailAction(): Promise<{ ok: true; status: string; filed: number } | { ok: false; error: "stale" | "busy" }> {
  const actor = await actorAllowedTo("hours");
  const domain = inboundDomain();
  if (!isDemo() || !domain) return { ok: false, error: "stale" };
  const address = await withAgency(actor.agencyId, (tx) => ensureAddress(tx, actor.agencyId));
  try {
    const r = await receiveInboundEmail({ db, withAgency, store: documentStore, domain }, demoEmail(addressOf(address.token, domain)));
    if (r.status === "no_address" || r.status === "duplicate") return { ok: false, error: "stale" };
    if (r.filed > 0) after(() => processQueuedDocuments(actor).catch(() => undefined));
    refresh();
    return { ok: true, status: r.status, filed: r.filed + r.held };
  } catch (error) {
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    throw error;
  }
}
