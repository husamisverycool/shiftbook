"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setBillingSettings, type BillingResult } from "@/server/catalog/billing";
import { withAgency } from "@/server/db";
import { PeriodBusyError } from "@/server/run/period-lock";
import { addPortalContact, revokePortalContact, sendPortalLink } from "@/server/portal/service";
import { requestOrigin } from "@/server/request-info";
import { approvalDeps, linkBaseUrl } from "@/server/services";
import { actorAllowedTo } from "@/server/session";

/**
 * Starts a version of a client's invoice settings (docs/patterns/clients/[id].md). Shapes only here:
 * the billing service checks every rule and says which one a value breaks.
 */
export async function saveBillingAction(clientId: string, values: unknown, effectiveFrom: string): Promise<BillingResult | { ok: false; error: "busy" | "generic" }> {
  if (!z.uuid().safeParse(clientId).success || !z.string().max(20).safeParse(effectiveFrom).success || JSON.stringify(values ?? null).length > 5000) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("clientBilling");
  try {
    return await withAgency(actor.agencyId, (tx) => setBillingSettings(tx, actor, clientId, values, effectiveFrom));
  } catch (error) {
    // Files are being made with these settings right now: try again in a moment.
    if (error instanceof PeriodBusyError) return { ok: false, error: "busy" };
    throw error;
  } finally {
    revalidatePath("/[locale]/(app)/clients/[id]", "page");
    revalidatePath("/[locale]/(app)/clients", "page");
  }
}

// ---------- Portal access (slice v; docs/patterns/clients/[id].md) ----------

export type PortalAccessResult = { ok: true } | { ok: false; error: string; fields?: string[] };

const portalRevalidate = () => revalidatePath("/[locale]/(app)/clients/[id]", "page");

async function portalDeps() {
  return approvalDeps(linkBaseUrl(await requestOrigin()));
}

/** Gives a person at the client the portal and emails their link. */
export async function addPortalContactAction(clientId: string, input: unknown): Promise<PortalAccessResult> {
  const i = (input ?? {}) as Record<string, unknown>;
  if (!z.uuid().safeParse(clientId).success || typeof i.name !== "string" || typeof i.email !== "string" || typeof i.locale !== "string" || i.name.length > 400 || i.email.length > 400) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("clientBilling");
  try {
    const r = await addPortalContact(await portalDeps(), actor, { clientId, name: i.name, email: i.email, locale: i.locale });
    return r.ok ? { ok: true } : { ok: false, error: r.error, fields: r.fields };
  } finally {
    portalRevalidate();
  }
}

/** Emails a contact a new portal link (earlier ones stop working). */
export async function sendPortalLinkAction(contactId: string): Promise<PortalAccessResult> {
  if (!z.uuid().safeParse(contactId).success) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("clientBilling");
  try {
    const r = await sendPortalLink(await portalDeps(), actor, contactId);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  } finally {
    portalRevalidate();
  }
}

/** Takes the portal away from a contact. */
export async function revokePortalAccessAction(contactId: string): Promise<PortalAccessResult> {
  if (!z.uuid().safeParse(contactId).success) return { ok: false, error: "generic" };
  const actor = await actorAllowedTo("clientBilling");
  try {
    const r = await revokePortalContact(approvalDeps(""), actor, contactId);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  } finally {
    portalRevalidate();
  }
}
