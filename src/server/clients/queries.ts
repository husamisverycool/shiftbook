/**
 * What the clients screens show (slice g): the list (docs/patterns/clients.md) and one client with
 * its invoice settings, their dated versions and its invoices (docs/patterns/clients/[id].md).
 */
import { asc, count, eq } from "drizzle-orm";
import { earliestNewVersion } from "../catalog/billing";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { clientInvoices, type InvoiceRow } from "../invoices/queries";
import { placeNamed } from "../places/census";

type Profile = typeof s.clientBillingProfiles.$inferSelect;
const inForce = (p: Profile, date: string) => p.effectiveFrom <= date && (p.effectiveTo === null || date <= p.effectiveTo);

export interface ClientRow {
  id: string;
  name: string;
  code: string;
  archived: boolean;
  /** The settings in force today (null: none yet). */
  settings: Pick<Profile, "invoiceTemplate" | "separateBy" | "paymentTermsDays" | "vmsFormat"> | null;
}

export async function listClients(tx: Tx, today: string): Promise<ClientRow[]> {
  const clients = await tx.select().from(s.clients).orderBy(asc(s.clients.name));
  const profiles = await tx.select().from(s.clientBillingProfiles);
  return clients.map((c) => {
    const p = profiles.find((x) => x.clientId === c.id && inForce(x, today));
    return { id: c.id, name: c.name, code: c.code, archived: c.archivedAt !== null, settings: p ? { invoiceTemplate: p.invoiceTemplate, separateBy: p.separateBy, paymentTermsDays: p.paymentTermsDays, vmsFormat: p.vmsFormat } : null };
  });
}

export interface ClientDetail {
  /** With the bill-to its invoices carry (address and billing email), the record's facts line. */
  client: { id: string; name: string; code: string; addressLines: string[]; billingEmail: string | null; workerClock: "off" | "on" | "location"; archived: boolean };
  /** Its worksites (Gusto's company locations), open ones first (completeness audit G1). */
  worksites: {
    id: string;
    name: string;
    addressLine: string;
    city: string;
    state: string;
    postalCode: string;
    county: string;
    countyFips: string | null;
    placeFips: string | null;
    placeName: string | null;
    outsideAnyPlace: boolean;
    archived: boolean;
    placeFixed: boolean;
  }[];
  current: Profile | null;
  /** Every version, newest first (Bullhorn One Invoice Term versions). */
  versions: Profile[];
  /** The first day a new version may start (the day after the last invoiced period), or null. */
  earliest: string | null;
  invoices: InvoiceRow[];
}

export async function clientDetail(tx: Tx, id: string, today: string): Promise<ClientDetail | null> {
  const [row] = await tx
    .select({ id: s.clients.id, name: s.clients.name, code: s.clients.code, addressLines: s.clients.addressLines, billingEmail: s.clients.billingEmail, workerClock: s.clients.workerClock, archivedAt: s.clients.archivedAt })
    .from(s.clients)
    .where(eq(s.clients.id, id));
  if (!row) return null;
  const { archivedAt, ...rest } = row;
  const client = { ...rest, archived: archivedAt !== null };
  const sites = await tx.select().from(s.worksites).where(eq(s.worksites.clientId, id));
  // A worksite where hours were worked keeps its state, county and place (Gusto's locations).
  const worked = await tx
    .select({ worksiteId: s.jobOrders.worksiteId, n: count() })
    .from(s.timeEntries)
    .innerJoin(s.assignments, eq(s.assignments.id, s.timeEntries.assignmentId))
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .where(eq(s.jobOrders.clientId, id))
    .groupBy(s.jobOrders.worksiteId);
  const worksites = sites
    .map((w) => ({
      id: w.id,
      name: w.name,
      addressLine: w.addressLine,
      city: w.city,
      state: w.state,
      postalCode: w.postalCode,
      county: w.county,
      countyFips: w.countyFips,
      placeFips: w.placeFips,
      placeName: w.placeFips ? (placeNamed(w.state, w.placeFips)?.name ?? null) : null,
      outsideAnyPlace: w.outsideAnyPlace,
      archived: w.archivedAt !== null,
      placeFixed: worked.some((x) => x.worksiteId === w.id && Number(x.n) > 0),
    }))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
  const versions = (await tx.select().from(s.clientBillingProfiles).where(eq(s.clientBillingProfiles.clientId, id))).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return {
    client,
    worksites,
    current: versions.find((v) => inForce(v, today)) ?? null,
    versions,
    earliest: await earliestNewVersion(tx, id),
    invoices: await clientInvoices(tx, id),
  };
}
