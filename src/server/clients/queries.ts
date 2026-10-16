/**
 * What the clients screens show (slice g): the list (docs/patterns/clients.md) and one client with
 * its invoice settings, their dated versions and its invoices (docs/patterns/clients/[id].md).
 */
import { asc, eq } from "drizzle-orm";
import { earliestNewVersion } from "../catalog/billing";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { clientInvoices, type InvoiceRow } from "../invoices/queries";

type Profile = typeof s.clientBillingProfiles.$inferSelect;
const inForce = (p: Profile, date: string) => p.effectiveFrom <= date && (p.effectiveTo === null || date <= p.effectiveTo);

export interface ClientRow {
  id: string;
  name: string;
  code: string;
  /** The settings in force today (null: none yet). */
  settings: Pick<Profile, "invoiceTemplate" | "separateBy" | "paymentTermsDays" | "vmsFormat"> | null;
}

export async function listClients(tx: Tx, today: string): Promise<ClientRow[]> {
  const clients = await tx.select().from(s.clients).orderBy(asc(s.clients.name));
  const profiles = await tx.select().from(s.clientBillingProfiles);
  return clients.map((c) => {
    const p = profiles.find((x) => x.clientId === c.id && inForce(x, today));
    return { id: c.id, name: c.name, code: c.code, settings: p ? { invoiceTemplate: p.invoiceTemplate, separateBy: p.separateBy, paymentTermsDays: p.paymentTermsDays, vmsFormat: p.vmsFormat } : null };
  });
}

export interface ClientDetail {
  client: { id: string; name: string; code: string };
  current: Profile | null;
  /** Every version, newest first (Bullhorn One Invoice Term versions). */
  versions: Profile[];
  /** The first day a new version may start (the day after the last invoiced period), or null. */
  earliest: string | null;
  invoices: InvoiceRow[];
}

export async function clientDetail(tx: Tx, id: string, today: string): Promise<ClientDetail | null> {
  const [client] = await tx.select({ id: s.clients.id, name: s.clients.name, code: s.clients.code }).from(s.clients).where(eq(s.clients.id, id));
  if (!client) return null;
  const versions = (await tx.select().from(s.clientBillingProfiles).where(eq(s.clientBillingProfiles.clientId, id))).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return {
    client,
    current: versions.find((v) => inForce(v, today)) ?? null,
    versions,
    earliest: await earliestNewVersion(tx, id),
    invoices: await clientInvoices(tx, id),
  };
}
