/**
 * An agency sets up its own clients and their worksites (completeness audit; SPEC §4 Client, Worksite).
 * Stripe's "Create a customer" form (name, email, billing address) and its customer details' Edit;
 * Gusto's work addresses (a worksite's address decides which state and local rules apply, so its
 * Census county and place are picked from the Census list — decision 0008 — never typed as names).
 *
 * Patterns: docs/patterns/clients.md and docs/patterns/clients/[id].md.
 */
import { and, count, eq, isNull, ne, sql, type SQL } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { can } from "../permissions";
import { CENSUS_STATES, countyNamed, placeNamed } from "../places/census";
import { lockCatalog } from "../run/period-lock";
import type { Actor } from "../session";

export const mayManageClients = (actor: Pick<Actor, "role">) => can(actor, "clients");

/** The first day a new client's invoice settings cover: every period it could ever be invoiced for. */
export const CLIENT_SETTINGS_FROM = "2000-01-01";

export interface ClientDetails {
  name: string;
  code: string;
  addressLines: string[];
  billingEmail: string | null;
  paymentTermsDays: number;
}

export interface FieldProblem {
  field: string;
  rule: string;
}

const PRINTABLE = (v: string, max: number) => v.length >= 1 && v.length <= max && v.trim() === v && !/[\u0000-\u001f\u007f]/.test(v);
const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]+$/;

/** Everything wrong with a client's details (empty when they can be saved). */
export function clientProblems(value: unknown): FieldProblem[] {
  const v = (value ?? {}) as Partial<Record<keyof ClientDetails, unknown>>;
  const out: FieldProblem[] = [];
  if (typeof v.name !== "string" || !PRINTABLE(v.name, 200)) out.push({ field: "name", rule: "required" });
  if (typeof v.code !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$/.test(v.code)) out.push({ field: "code", rule: "code" });
  const lines = v.addressLines;
  if (!Array.isArray(lines) || lines.length > 4 || lines.some((l) => typeof l !== "string" || !PRINTABLE(l, 200))) out.push({ field: "addressLines", rule: "address" });
  const email = v.billingEmail;
  if (email !== null && (typeof email !== "string" || email.length > 254 || !EMAIL.test(email))) out.push({ field: "billingEmail", rule: "email" });
  const terms = v.paymentTermsDays;
  if (typeof terms !== "number" || !Number.isSafeInteger(terms) || terms < 0 || terms > 365) out.push({ field: "paymentTermsDays", rule: "terms_days" });
  return out;
}

export type ClientResult = { ok: true; id: string } | { ok: false; error: "not_allowed" | "not_found" | "code_taken" } | { ok: false; error: "invalid"; problems: FieldProblem[] };

async function codeTaken(tx: Tx, code: string, except: string | null): Promise<boolean> {
  const [row] = await tx
    .select({ n: count() })
    .from(s.clients)
    .where(and(sql`lower(${s.clients.code}) = lower(${code})`, except ? ne(s.clients.id, except) : undefined));
  return (row?.n ?? 0) > 0;
}

/**
 * Adds a client with its first invoice settings (standard invoice, overtime billed at the multiplier,
 * the terms given), in force for every period, as every client has one version in force (decision G2).
 */
export async function createClient(tx: Tx, actor: Actor, value: unknown): Promise<ClientResult> {
  if (!mayManageClients(actor)) return { ok: false, error: "not_allowed" };
  const problems = clientProblems(value);
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const v = value as ClientDetails;
  await lockCatalog(tx, actor.agencyId, "exclusive");
  if (await codeTaken(tx, v.code, null)) return { ok: false, error: "code_taken" };
  const [client] = await tx
    .insert(s.clients)
    .values({ agencyId: actor.agencyId, name: v.name, code: v.code, addressLines: v.addressLines, billingEmail: v.billingEmail })
    .returning({ id: s.clients.id });
  const [profile] = await tx
    .insert(s.clientBillingProfiles)
    .values({ agencyId: actor.agencyId, clientId: client!.id, paymentTermsDays: v.paymentTermsDays, effectiveFrom: CLIENT_SETTINGS_FROM })
    .returning({ id: s.clientBillingProfiles.id });
  await audit(tx, actor, [
    { action: "create", entityType: "client", entityId: client!.id, after: { name: v.name, code: v.code, addressLines: v.addressLines, billingEmail: v.billingEmail } },
    { action: "create", entityType: "billing_profile", entityId: profile!.id, after: { clientId: client!.id, paymentTermsDays: v.paymentTermsDays, effectiveFrom: CLIENT_SETTINGS_FROM } },
  ]);
  return { ok: true, id: client!.id };
}

/** Changes a client's name, code, bill-to address and billing email (its terms are a billing settings version). */
export async function updateClient(tx: Tx, actor: Actor, id: string, value: unknown): Promise<ClientResult> {
  if (!mayManageClients(actor)) return { ok: false, error: "not_allowed" };
  const problems = clientProblems({ ...(value as object), paymentTermsDays: 0 });
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const v = value as Omit<ClientDetails, "paymentTermsDays">;
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const [before] = await tx.select().from(s.clients).where(eq(s.clients.id, id));
  if (!before) return { ok: false, error: "not_found" };
  if (await codeTaken(tx, v.code, id)) return { ok: false, error: "code_taken" };
  const after = { name: v.name, code: v.code, addressLines: v.addressLines, billingEmail: v.billingEmail };
  await tx.update(s.clients).set(after).where(eq(s.clients.id, id));
  await audit(tx, actor, [{ action: "update", entityType: "client", entityId: id, before: { name: before.name, code: before.code, addressLines: before.addressLines, billingEmail: before.billingEmail }, after }]);
  return { ok: true, id };
}

export type ArchiveResult = { ok: true } | { ok: false; error: "not_allowed" | "not_found" | "active_placements" };

/** Whether workers are still placed (active assignments) on the job orders matching `where`. */
async function activePlacements(tx: Tx, where: SQL): Promise<boolean> {
  const [row] = await tx
    .select({ n: count() })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .where(and(where, eq(s.assignments.status, "active")));
  return (row?.n ?? 0) > 0;
}

/**
 * Archives a client (or brings it back): it leaves the lists and pickers; its runs, invoices and
 * receivables stay. Refused while workers are still placed there (Stripe deletes a customer only with
 * nothing outstanding; Granite archives instead, as runs and invoices name the client).
 */
export async function setClientArchived(tx: Tx, actor: Actor, id: string, archived: boolean): Promise<ArchiveResult> {
  if (!mayManageClients(actor)) return { ok: false, error: "not_allowed" };
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const [client] = await tx.select({ id: s.clients.id, archivedAt: s.clients.archivedAt }).from(s.clients).where(eq(s.clients.id, id));
  if (!client) return { ok: false, error: "not_found" };
  if (archived) {
    if (await activePlacements(tx, eq(s.jobOrders.clientId, id))) return { ok: false, error: "active_placements" };
  }
  if ((client.archivedAt !== null) === archived) return { ok: true };
  await tx.update(s.clients).set({ archivedAt: archived ? new Date() : null }).where(eq(s.clients.id, id));
  await audit(tx, actor, [{ action: "update", entityType: "client", entityId: id, before: { archived: !archived }, after: { archived } }]);
  return { ok: true };
}

// ---------- worksites ----------

export interface WorksiteDetails {
  name: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  countyFips: string;
  /** The Census place the address is in, or null with `outsideAnyPlace` (unincorporated). */
  placeFips: string | null;
  outsideAnyPlace: boolean;
}

/** Everything wrong with a worksite (empty when it can be saved); its county and place from the Census list. */
export function worksiteProblems(value: unknown): FieldProblem[] {
  const v = (value ?? {}) as Partial<Record<keyof WorksiteDetails, unknown>>;
  const out: FieldProblem[] = [];
  for (const f of ["name", "addressLine", "city"] as const) if (typeof v[f] !== "string" || !PRINTABLE(v[f] as string, 200)) out.push({ field: f, rule: "required" });
  const state = typeof v.state === "string" ? v.state : "";
  if (!CENSUS_STATES.includes(state)) out.push({ field: "state", rule: "state" });
  if (typeof v.postalCode !== "string" || !/^\d{5}(-\d{4})?$/.test(v.postalCode)) out.push({ field: "postalCode", rule: "zip" });
  const county = typeof v.countyFips === "string" ? countyNamed(state, v.countyFips) : null;
  if (!county) out.push({ field: "countyFips", rule: "county" });
  if (typeof v.outsideAnyPlace !== "boolean") out.push({ field: "placeFips", rule: "place" });
  else if (v.outsideAnyPlace) {
    if (v.placeFips !== null) out.push({ field: "placeFips", rule: "place" });
  } else {
    const place = typeof v.placeFips === "string" ? placeNamed(state, v.placeFips) : null;
    // A place in another county than the one chosen would match the wrong local rules.
    if (!place || (county && !place.counties.includes(county.fips))) out.push({ field: "placeFips", rule: "place" });
  }
  return out;
}

/** The county's name as the worksite keeps it ("Will", not "Will County"), from the Census list. */
const countyText = (state: string, fips: string) =>
  countyNamed(state, fips)!.name.replace(/ (County|Parish|Borough|Census Area|Municipality|City and Borough)$/u, "");

export type WorksiteResult = { ok: true; id: string } | { ok: false; error: "not_allowed" | "not_found" | "place_in_use" } | { ok: false; error: "invalid"; problems: FieldProblem[] };

export async function createWorksite(tx: Tx, actor: Actor, clientId: string, value: unknown): Promise<WorksiteResult> {
  if (!mayManageClients(actor)) return { ok: false, error: "not_allowed" };
  const problems = worksiteProblems(value);
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const v = value as WorksiteDetails;
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const [client] = await tx.select({ id: s.clients.id }).from(s.clients).where(eq(s.clients.id, clientId));
  if (!client) return { ok: false, error: "not_found" };
  const row = { name: v.name, addressLine: v.addressLine, city: v.city, county: countyText(v.state, v.countyFips), state: v.state, postalCode: v.postalCode, countyFips: v.countyFips, placeFips: v.outsideAnyPlace ? null : v.placeFips, outsideAnyPlace: v.outsideAnyPlace };
  const [site] = await tx.insert(s.worksites).values({ agencyId: actor.agencyId, clientId, ...row }).returning({ id: s.worksites.id });
  await audit(tx, actor, [{ action: "create", entityType: "worksite", entityId: site!.id, after: { clientId, ...row } }]);
  return { ok: true, id: site!.id };
}

/**
 * Changes a worksite. Its state, county and place decide which wage rules apply, so they stay fixed once
 * hours were worked there (the weeks already paid used them): a move is a new worksite.
 */
export async function updateWorksite(tx: Tx, actor: Actor, id: string, value: unknown): Promise<WorksiteResult> {
  if (!mayManageClients(actor)) return { ok: false, error: "not_allowed" };
  const problems = worksiteProblems(value);
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const v = value as WorksiteDetails;
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const [before] = await tx.select().from(s.worksites).where(eq(s.worksites.id, id));
  if (!before) return { ok: false, error: "not_found" };
  const placeChanged = before.state !== v.state || before.countyFips !== v.countyFips || (before.placeFips ?? null) !== (v.outsideAnyPlace ? null : v.placeFips) || before.outsideAnyPlace !== v.outsideAnyPlace;
  if (placeChanged && (await hoursAt(tx, id))) return { ok: false, error: "place_in_use" };
  const row = { name: v.name, addressLine: v.addressLine, city: v.city, county: countyText(v.state, v.countyFips), state: v.state, postalCode: v.postalCode, countyFips: v.countyFips, placeFips: v.outsideAnyPlace ? null : v.placeFips, outsideAnyPlace: v.outsideAnyPlace };
  await tx.update(s.worksites).set(row).where(eq(s.worksites.id, id));
  await audit(tx, actor, [
    {
      action: "update",
      entityType: "worksite",
      entityId: id,
      before: { name: before.name, addressLine: before.addressLine, city: before.city, state: before.state, postalCode: before.postalCode, countyFips: before.countyFips, placeFips: before.placeFips, outsideAnyPlace: before.outsideAnyPlace },
      after: row,
    },
  ]);
  return { ok: true, id };
}

/** Whether any hours were recorded on a job order at this worksite. */
async function hoursAt(tx: Tx, worksiteId: string): Promise<boolean> {
  const [row] = await tx
    .select({ n: count() })
    .from(s.timeEntries)
    .innerJoin(s.assignments, eq(s.assignments.id, s.timeEntries.assignmentId))
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .where(eq(s.jobOrders.worksiteId, worksiteId));
  return (row?.n ?? 0) > 0;
}

export async function setWorksiteArchived(tx: Tx, actor: Actor, id: string, archived: boolean): Promise<ArchiveResult> {
  if (!mayManageClients(actor)) return { ok: false, error: "not_allowed" };
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const [site] = await tx.select({ id: s.worksites.id, archivedAt: s.worksites.archivedAt }).from(s.worksites).where(eq(s.worksites.id, id));
  if (!site) return { ok: false, error: "not_found" };
  if (archived) {
    if (await activePlacements(tx, eq(s.jobOrders.worksiteId, id))) return { ok: false, error: "active_placements" };
  }
  if ((site.archivedAt !== null) === archived) return { ok: true };
  await tx.update(s.worksites).set({ archivedAt: archived ? new Date() : null }).where(eq(s.worksites.id, id));
  await audit(tx, actor, [{ action: "update", entityType: "worksite", entityId: id, before: { archived: !archived }, after: { archived } }]);
  return { ok: true };
}

/** A client's worksites for its page, open ones first. */
export async function worksitesOf(tx: Tx, clientId: string) {
  const rows = await tx.select().from(s.worksites).where(eq(s.worksites.clientId, clientId));
  return rows.sort((a, b) => Number(a.archivedAt !== null) - Number(b.archivedAt !== null) || a.name.localeCompare(b.name));
}

/** Clients not archived (pickers). */
export const activeClients = (tx: Tx) => tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients).where(isNull(s.clients.archivedAt));
