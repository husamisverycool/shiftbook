/**
 * The agency's activity log (slice k step 3, decision 0028; SPEC §19): the audit events, filtered by
 * date (the agency's own days), person, record type, event and one record; newest first, 50 at a
 * time; each record named as it is now. The Owner and the accountant read it (`viewActivity`); the
 * log holds no SSN (decision 0027), so nothing here is held back from them.
 */
import { and, count, desc, eq, inArray, lt, sql, type SQL } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { can } from "../permissions";
import type { Actor } from "../session";
import { agencyToday, settingOn } from "../settings";
import { activityCsv } from "./csv";
import { eventOf, type ActivityEvent } from "./events";
import { activityParams, type ActivityFilters } from "./filters";

/** Stripe lists events a page at a time. */
export const ACTIVITY_PAGE = 50;
/** The most one export carries (a filter narrows a longer log). */
export const EXPORT_LIMIT = 50_000;

export const mayViewActivity = (actor: Actor) => can(actor, "viewActivity");

/** The kinds of record the log names (anything else shows its kind only). */
const NAMED = new Set(["worker", "user", "client", "job_order", "assignment", "rate_card", "invoice", "pay_run", "source_document", "time_entry", "approval_request", "obligation", "billing_profile", "payment", "placement_import", "compliance_document", "agency_registration", "wc_policy", "agency"]);

/** Zone names Postgres was asked about (its list is long; it does not change while the app runs). */
const knownZones = new Map<string, boolean>();

/** The agency's time zone as Postgres knows it (an unknown name is read as UTC, as agencyToday does). */
export async function activityZone(tx: Tx): Promise<string> {
  const zone = await settingOn<unknown>(tx, "time_zone", await agencyToday(tx));
  if (typeof zone !== "string") return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    return "UTC";
  }
  if (!knownZones.has(zone)) {
    const [known] = await tx.execute<{ ok: boolean }>(sql`select exists (select 1 from pg_timezone_names where name = ${zone}) as ok`);
    knownZones.set(zone, Boolean(known?.ok));
  }
  return knownZones.get(zone) ? zone : "UTC";
}

function whereOf(f: ActivityFilters, zone: string): SQL[] {
  const e = s.auditEvents;
  // The agency's days as instants, so the index on (agency, occurred_at) serves the range (safe across daylight saving).
  const out: SQL[] = [sql`${e.occurredAt} >= (${f.from}::date::timestamp at time zone ${zone})`, sql`${e.occurredAt} < ((${f.to}::date + 1)::timestamp at time zone ${zone})`];
  if (f.person) out.push(eq(e.actorLabel, f.person));
  if (f.type) out.push(eq(e.entityType, f.type));
  if (f.record) out.push(eq(e.entityType, f.record.type), eq(e.entityId, f.record.id));
  const after = sql`coalesce(${e.after}, '{}'::jsonb)`;
  if (f.action === "ssn_viewed") out.push(eq(e.action, "reveal"), sql`not (${after} ? 'filename')`);
  else if (f.action === "file_opened") out.push(eq(e.action, "reveal"), sql`${after} ? 'filename'`);
  else if (f.action === "ssn_changed") out.push(eq(e.action, "update"), sql`${after}->>'ssn' = 'changed'`);
  // "Changed" lists the changes an SSN change is not (it has its own action).
  else if (f.action === "update") out.push(eq(e.action, "update"), sql`coalesce(${after}->>'ssn', '') <> 'changed'`);
  else if (f.action) out.push(eq(e.action, f.action));
  return out;
}

type Row = typeof s.auditEvents.$inferSelect;
export type RecordRef = ActivityEvent["record"];

/** Each record's name and page as they are now, one query per kind of record. */
async function recordsOf(tx: Tx, rows: Row[]): Promise<Map<string, RecordRef>> {
  const ids = (type: string) => [...new Set(rows.filter((r) => r.entityType === type && /^[0-9a-f-]{36}$/i.test(r.entityId)).map((r) => r.entityId))];
  const out = new Map<string, RecordRef>();
  const put = (type: string, id: string, ref: RecordRef) => out.set(`${type}:${id}`, ref);
  const want = async <T>(type: string, load: (list: string[]) => Promise<T[]>, each: (row: T) => void) => {
    const list = ids(type);
    if (list.length > 0) for (const r of await load(list)) each(r);
  };
  const workerName = (w: { firstName: string | null; lastName: string | null }) => (w.firstName !== null ? `${w.firstName} ${w.lastName}` : null);

  await want("worker", (l) => tx.select({ id: s.workers.id, firstName: s.workers.firstName, lastName: s.workers.lastName }).from(s.workers).where(inArray(s.workers.id, l)), (w) => put("worker", w.id, { name: workerName(w), href: `/workers/${w.id}` }));
  await want("user", (l) => tx.select({ id: s.users.id, name: s.users.name }).from(s.users).where(inArray(s.users.id, l)), (u) => put("user", u.id, { name: u.name, href: "/settings/members" }));
  await want("client", (l) => tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients).where(inArray(s.clients.id, l)), (c) => put("client", c.id, { name: c.name, href: `/clients/${c.id}` }));
  await want(
    "job_order",
    (l) => tx.select({ id: s.jobOrders.id, position: s.jobOrders.position, client: s.clients.name }).from(s.jobOrders).innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId)).where(inArray(s.jobOrders.id, l)),
    (j) => put("job_order", j.id, { name: `${j.position} · ${j.client}`, href: `/job-orders/${j.id}` }),
  );
  await want(
    "assignment",
    (l) =>
      tx
        .select({ id: s.assignments.id, jobOrderId: s.assignments.jobOrderId, position: s.jobOrders.position, firstName: s.workers.firstName, lastName: s.workers.lastName })
        .from(s.assignments)
        .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
        .innerJoin(s.workers, eq(s.workers.id, s.assignments.workerId))
        .where(inArray(s.assignments.id, l)),
    (a) => put("assignment", a.id, { name: `${a.firstName} ${a.lastName} · ${a.position}`, href: `/job-orders/${a.jobOrderId}?tab=assignments` }),
  );
  await want(
    "rate_card",
    (l) => tx.select({ id: s.rateCards.id, jobOrderId: s.rateCards.jobOrderId, position: s.jobOrders.position }).from(s.rateCards).innerJoin(s.jobOrders, eq(s.jobOrders.id, s.rateCards.jobOrderId)).where(inArray(s.rateCards.id, l)),
    (r) => put("rate_card", r.id, { name: r.position, href: `/job-orders/${r.jobOrderId}?tab=rates` }),
  );
  await want("invoice", (l) => tx.select({ id: s.invoices.id, number: s.invoices.number }).from(s.invoices).where(inArray(s.invoices.id, l)), (i) => put("invoice", i.id, { name: i.number, href: `/invoices/${i.id}` }));
  await want(
    "pay_run",
    (l) => tx.select({ id: s.payRuns.id, periodId: s.payPeriods.id, from: s.payPeriods.startsOn, to: s.payPeriods.endsOn }).from(s.payRuns).innerJoin(s.payPeriods, eq(s.payPeriods.id, s.payRuns.payPeriodId)).where(inArray(s.payRuns.id, l)),
    (r) => put("pay_run", r.id, { name: null, period: { from: r.from, to: r.to }, href: `/convert?period=${r.periodId}` }),
  );
  await want(
    "source_document",
    (l) => tx.select({ id: s.sourceDocuments.id, filename: s.sourceDocuments.filename, periodId: s.sourceDocuments.payPeriodId }).from(s.sourceDocuments).where(inArray(s.sourceDocuments.id, l)),
    (d) => put("source_document", d.id, { name: d.filename, href: `/convert?period=${d.periodId}` }),
  );
  await want(
    "time_entry",
    (l) =>
      tx
        .select({ id: s.timeEntries.id, workDate: s.timeEntries.workDate, periodId: s.timeEntries.payPeriodId, firstName: s.workers.firstName, lastName: s.workers.lastName })
        .from(s.timeEntries)
        .leftJoin(s.workers, eq(s.workers.id, s.timeEntries.workerId))
        .where(inArray(s.timeEntries.id, l)),
    (t) => put("time_entry", t.id, { name: workerName(t), href: `/convert?period=${t.periodId}`, ...(t.workDate ? { period: { from: t.workDate, to: t.workDate } } : {}) }),
  );
  await want(
    "approval_request",
    (l) => tx.select({ id: s.approvalRequests.id, client: s.clients.name, from: s.payPeriods.startsOn, to: s.payPeriods.endsOn }).from(s.approvalRequests).innerJoin(s.clients, eq(s.clients.id, s.approvalRequests.clientId)).innerJoin(s.payPeriods, eq(s.payPeriods.id, s.approvalRequests.payPeriodId)).where(inArray(s.approvalRequests.id, l)),
    (a) => put("approval_request", a.id, { name: a.client, period: { from: a.from, to: a.to }, href: `/approvals/${a.id}` }),
  );
  await want(
    "obligation",
    (l) =>
      tx
        .select({ id: s.obligations.id, kind: s.obligations.kind, firstName: s.workers.firstName, lastName: s.workers.lastName, client: s.clients.name })
        .from(s.obligations)
        .leftJoin(s.workers, eq(s.workers.id, s.obligations.workerId))
        .leftJoin(s.clients, eq(s.clients.id, s.obligations.clientId))
        .where(inArray(s.obligations.id, l)),
    (o) => put("obligation", o.id, { name: workerName(o) ?? o.client, kind: o.kind, href: `/compliance/${o.id}` }),
  );
  await want(
    "billing_profile",
    (l) => tx.select({ id: s.clientBillingProfiles.id, clientId: s.clients.id, client: s.clients.name }).from(s.clientBillingProfiles).innerJoin(s.clients, eq(s.clients.id, s.clientBillingProfiles.clientId)).where(inArray(s.clientBillingProfiles.id, l)),
    (b) => put("billing_profile", b.id, { name: b.client, href: `/clients/${b.clientId}` }),
  );
  await want("payment", (l) => tx.select({ id: s.payments.id, client: s.clients.name }).from(s.payments).innerJoin(s.clients, eq(s.clients.id, s.payments.clientId)).where(inArray(s.payments.id, l)), (p) => put("payment", p.id, { name: p.client, href: "/payments" }));
  await want("placement_import", (l) => tx.select({ id: s.placementImports.id, filename: s.placementImports.filename }).from(s.placementImports).where(inArray(s.placementImports.id, l)), (p) => put("placement_import", p.id, { name: p.filename, href: null }));
  // A worker's own file is named, never linked: it opens from the profile, with a reason (decision 0027).
  await want("compliance_document", (l) => tx.select({ id: s.complianceDocuments.id, filename: s.complianceDocuments.filename }).from(s.complianceDocuments).where(inArray(s.complianceDocuments.id, l)), (d) => put("compliance_document", d.id, { name: d.filename, href: null }));
  await want("agency_registration", (l) => tx.select({ id: s.agencyRegistrations.id, jurisdiction: s.agencyRegistrations.jurisdiction, number: s.agencyRegistrations.number }).from(s.agencyRegistrations).where(inArray(s.agencyRegistrations.id, l)), (g) => put("agency_registration", g.id, { name: `${g.jurisdiction} ${g.number}`, href: "/settings/compliance" }));
  await want("wc_policy", (l) => tx.select({ id: s.wcPolicies.id, carrier: s.wcPolicies.carrier, number: s.wcPolicies.policyNumber }).from(s.wcPolicies).where(inArray(s.wcPolicies.id, l)), (p) => put("wc_policy", p.id, { name: `${p.carrier} ${p.number}`, href: "/settings/compliance" }));
  await want("agency", (l) => tx.select({ id: s.agencies.id, name: s.agencies.name }).from(s.agencies).where(inArray(s.agencies.id, l)), (a) => put("agency", a.id, { name: a.name, href: null }));
  // A record of a kind that has a name, no longer on file (removed, or cleared by a demo reset): said so.
  for (const r of rows) if (NAMED.has(r.entityType) && !out.has(`${r.entityType}:${r.entityId}`)) put(r.entityType, r.entityId, { name: null, href: null, gone: true });
  return out;
}

async function eventsOf(tx: Tx, rows: Row[]): Promise<ActivityEvent[]> {
  const records = await recordsOf(tx, rows);
  return rows.map((r) => ({
    id: r.id,
    at: r.occurredAt.toISOString(),
    actor: r.actorLabel,
    action: r.action,
    event: eventOf(r.action, r.after),
    entityType: r.entityType,
    entityId: r.entityId,
    record: records.get(`${r.entityType}:${r.entityId}`) ?? { name: null, href: null },
    reason: r.reason,
    before: r.before,
    after: r.after,
  }));
}

export interface ActivityPage {
  events: ActivityEvent[];
  /** How many events match the filters (null when not counted again: Load more). */
  total: number | null;
  /** The id to read on from (Load more), or null at the end. */
  nextAfter: number | null;
}

export async function activityPage(tx: Tx, f: ActivityFilters, opts: { after?: number; limit?: number; withTotal?: boolean } = {}): Promise<ActivityPage> {
  const limit = Math.min(Math.max(1, opts.limit ?? ACTIVITY_PAGE), ACTIVITY_PAGE);
  const where = whereOf(f, await activityZone(tx));
  const rows = await tx
    .select()
    .from(s.auditEvents)
    .where(and(...where, opts.after !== undefined ? lt(s.auditEvents.id, opts.after) : undefined))
    .orderBy(desc(s.auditEvents.id))
    .limit(limit + 1);
  const [total] = opts.withTotal === false ? [null] : await tx.select({ n: count() }).from(s.auditEvents).where(and(...where));
  const shown = rows.slice(0, limit);
  return { events: await eventsOf(tx, shown), total: total ? total.n : null, nextAfter: rows.length > limit ? shown.at(-1)!.id : null };
}

/** One record's name and page now (the record filter's chip, even when no event matches). */
export async function activityRecord(tx: Tx, record: { type: string; id: string }): Promise<RecordRef | null> {
  const refs = await recordsOf(tx, [{ entityType: record.type, entityId: record.id } as Row]);
  return refs.get(`${record.type}:${record.id}`) ?? null;
}

/** One event by its id (the details pane opened from a link). */
export async function activityEvent(tx: Tx, id: number): Promise<ActivityEvent | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const rows = await tx.select().from(s.auditEvents).where(eq(s.auditEvents.id, id));
  return rows.length === 0 ? null : (await eventsOf(tx, rows))[0]!;
}

/** The filters' choices: everyone who appears in the log, and the kinds of record in it. */
export async function activityOptions(tx: Tx): Promise<{ people: string[]; types: string[] }> {
  const people = await tx.selectDistinct({ v: s.auditEvents.actorLabel }).from(s.auditEvents).orderBy(s.auditEvents.actorLabel);
  const types = await tx.selectDistinct({ v: s.auditEvents.entityType }).from(s.auditEvents).orderBy(s.auditEvents.entityType);
  return { people: people.map((p) => p.v), types: types.map((t) => t.v) };
}

/** The filtered log as CSV (GitHub's export); the export is itself an event (Vercel). */
export async function exportActivity(tx: Tx, actor: Actor, f: ActivityFilters): Promise<{ csv: string; rows: number }> {
  const where = whereOf(f, await activityZone(tx));
  const rows = await tx.select().from(s.auditEvents).where(and(...where)).orderBy(desc(s.auditEvents.id)).limit(EXPORT_LIMIT);
  const events = await eventsOf(tx, rows);
  // The cap is said in the log: a longer log is exported a narrower filter at a time.
  await audit(tx, actor, [{ action: "export", entityType: "activity_log", entityId: actor.agencyId, after: { filters: activityParams(f, await agencyToday(tx)), rows: events.length, ...(events.length === EXPORT_LIMIT ? { cappedAt: EXPORT_LIMIT } : {}) } }]);
  return { csv: activityCsv(events), rows: events.length };
}
