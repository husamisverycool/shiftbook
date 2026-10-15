/**
 * What the job order and assignment screens show (docs/patterns/job-orders.md, job-orders/[id].md,
 * assignments.md). Read-only.
 */
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { cardPaidThrough } from "./rate-cards";
import { inForce, isFrozen } from "./versions";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const fullName = (w: { firstName: string; lastName: string }) => `${w.firstName} ${w.lastName}`;

export interface ActivityItem {
  id: number;
  at: string;
  actor: string;
  action: string;
  entityType: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
}

export interface RateVersionView {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  payRateCents: number;
  billRateCents: number;
  markupBp: number | null;
  otMultiplier: { num: number; den: number };
  dtMultiplier: { num: number; den: number };
  wcClassCode: string | null;
  /** Used by a paid week: never edited or deleted, only followed by a new version. */
  frozen: boolean;
}

const versionView = (v: typeof s.rateCards.$inferSelect, paid: string | null): RateVersionView => ({
  id: v.id,
  effectiveFrom: v.effectiveFrom,
  effectiveTo: v.effectiveTo,
  payRateCents: v.payRateCents,
  billRateCents: v.billRateCents,
  markupBp: v.markupBp,
  otMultiplier: { num: v.otMultiplierNum, den: v.otMultiplierDen },
  dtMultiplier: { num: v.dtMultiplierNum, den: v.dtMultiplierDen },
  wcClassCode: v.wcClassCode,
  frozen: isFrozen(v, paid),
});

/** Audit events about a job order, its rate cards and its assignments, newest first. */
async function activityOf(tx: Tx, jobOrderId: string, limit: number): Promise<ActivityItem[]> {
  const rows = await tx
    .select()
    .from(s.auditEvents)
    .where(
      or(
        and(eq(s.auditEvents.entityType, "job_order"), eq(s.auditEvents.entityId, jobOrderId)),
        and(
          inArray(s.auditEvents.entityType, ["rate_card", "assignment"]),
          or(sql`${s.auditEvents.after}->>'jobOrderId' = ${jobOrderId}`, sql`${s.auditEvents.before}->>'jobOrderId' = ${jobOrderId}`),
        ),
      ),
    )
    .orderBy(desc(s.auditEvents.occurredAt), desc(s.auditEvents.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    at: r.occurredAt.toISOString(),
    actor: r.actorLabel,
    action: r.action,
    entityType: r.entityType,
    before: (r.before as Record<string, unknown> | null) ?? null,
    after: (r.after as Record<string, unknown> | null) ?? null,
    reason: r.reason,
  }));
}

export interface JobOrderRow {
  id: string;
  position: string;
  clientId: string;
  clientName: string;
  worksiteName: string;
  city: string;
  state: string;
  shift: string | null;
  socCode: string | null;
  headcount: number;
  assigned: number;
  payRateCents: number | null;
  billRateCents: number | null;
  prevailingWage: boolean;
  createdAt: string;
  recent: ActivityItem[];
}

/** Every job order with today's rates and how many workers are on it now or later. */
export async function listJobOrders(tx: Tx, today: string): Promise<JobOrderRow[]> {
  const jobs = await tx
    .select({ job: s.jobOrders, client: s.clients, site: s.worksites })
    .from(s.jobOrders)
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId))
    .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId));
  const cards = await tx.select().from(s.rateCards);
  const assignments = await tx.select().from(s.assignments);
  const rows: JobOrderRow[] = [];
  for (const { job, client, site } of jobs) {
    const card = inForce(cards.filter((c) => c.jobOrderId === job.id && c.assignmentId === null), today);
    rows.push({
      id: job.id,
      position: job.position,
      clientId: client.id,
      clientName: client.name,
      worksiteName: site.name,
      city: site.city,
      state: site.state,
      shift: job.shift,
      socCode: job.socCode,
      headcount: job.headcount,
      assigned: assignments.filter((a) => a.jobOrderId === job.id && a.status !== "cancelled" && (a.endDate === null || a.endDate >= today)).length,
      payRateCents: card?.payRateCents ?? null,
      billRateCents: card?.billRateCents ?? null,
      prevailingWage: job.prevailingWage,
      createdAt: job.createdAt.toISOString(),
      recent: await activityOf(tx, job.id, 3),
    });
  }
  return rows.sort((a, b) => cmp(a.clientName, b.clientName) || cmp(a.position, b.position) || cmp(a.shift ?? "", b.shift ?? "") || cmp(a.id, b.id));
}

/** Clients with their worksites, and the roster: what the forms choose from. */
export async function catalogOptions(tx: Tx) {
  const clients = await tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients);
  const sites = await tx.select({ id: s.worksites.id, clientId: s.worksites.clientId, name: s.worksites.name, city: s.worksites.city, state: s.worksites.state }).from(s.worksites);
  const people = await tx.select({ id: s.workers.id, firstName: s.workers.firstName, lastName: s.workers.lastName }).from(s.workers);
  const jobs = await tx
    .select({ id: s.jobOrders.id, position: s.jobOrders.position, shift: s.jobOrders.shift, clientId: s.clients.id, clientName: s.clients.name })
    .from(s.jobOrders)
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId));
  return {
    clients: clients.sort((a, b) => cmp(a.name, b.name)),
    worksites: sites.sort((a, b) => cmp(a.name, b.name)),
    workers: people.map((w) => ({ id: w.id, name: fullName(w) })).sort((a, b) => cmp(a.name, b.name)),
    jobOrders: jobs.map((j) => ({ id: j.id, clientId: j.clientId, label: `${j.position}${j.shift ? ` (${j.shift})` : ""} — ${j.clientName}` })).sort((a, b) => cmp(a.label, b.label)),
  };
}

export interface AssignmentRow {
  id: string;
  workerId: string;
  workerName: string;
  jobOrderId: string;
  position: string;
  shift: string | null;
  clientName: string;
  startDate: string;
  endDate: string | null;
  status: "active" | "ended" | "cancelled";
  ownRates: boolean;
  payRateCents: number | null;
  billRateCents: number | null;
  source: string | null;
}

export async function listAssignments(tx: Tx, today: string, where?: { jobOrderId: string }): Promise<AssignmentRow[]> {
  const rows = await tx
    .select({ a: s.assignments, w: s.workers, j: s.jobOrders, c: s.clients })
    .from(s.assignments)
    .innerJoin(s.workers, eq(s.workers.id, s.assignments.workerId))
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId))
    .where(where ? eq(s.assignments.jobOrderId, where.jobOrderId) : undefined);
  const cards = await tx.select().from(s.rateCards);
  return rows
    .map(({ a, w, j, c }) => {
      const own = cards.filter((r) => r.assignmentId === a.id);
      const card = inForce(own, today) ?? inForce(cards.filter((r) => r.jobOrderId === j.id && r.assignmentId === null), today);
      return {
        id: a.id,
        workerId: w.id,
        workerName: fullName(w),
        jobOrderId: j.id,
        position: j.position,
        shift: j.shift,
        clientName: c.name,
        startDate: a.startDate,
        endDate: a.endDate,
        status: a.status,
        ownRates: own.length > 0,
        payRateCents: card?.payRateCents ?? null,
        billRateCents: card?.billRateCents ?? null,
        source: a.externalSource,
      };
    })
    .sort((x, y) => cmp(x.workerName.toLowerCase(), y.workerName.toLowerCase()) || cmp(x.startDate, y.startDate) || cmp(x.id, y.id));
}

/** One job order: details, assignments, its rate card (and each assignment's own), activity. */
export async function jobOrderPage(tx: Tx, id: string, today: string) {
  const [row] = await tx
    .select({ job: s.jobOrders, client: s.clients, site: s.worksites })
    .from(s.jobOrders)
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId))
    .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId))
    .where(eq(s.jobOrders.id, id));
  if (!row) return null;
  const card = { jobOrderId: id, assignmentId: null };
  const paid = await cardPaidThrough(tx, card);
  const versions = (await tx.select().from(s.rateCards).where(eq(s.rateCards.jobOrderId, id))).sort((a, b) => cmp(a.effectiveFrom, b.effectiveFrom));
  const assignments = await listAssignments(tx, today, { jobOrderId: id });
  const ownCards = [];
  for (const a of assignments.filter((x) => x.ownRates)) {
    const ownPaid = await cardPaidThrough(tx, { jobOrderId: id, assignmentId: a.id });
    ownCards.push({ assignmentId: a.id, workerName: a.workerName, paidThrough: ownPaid, versions: versions.filter((v) => v.assignmentId === a.id).map((v) => versionView(v, ownPaid)) });
  }
  return {
    job: {
      id: row.job.id,
      position: row.job.position,
      clientId: row.client.id,
      clientName: row.client.name,
      worksiteId: row.site.id,
      worksite: { name: row.site.name, addressLine: row.site.addressLine, city: row.site.city, county: row.site.county, state: row.site.state, postalCode: row.site.postalCode },
      socCode: row.job.socCode,
      shift: row.job.shift,
      headcount: row.job.headcount,
      payMinCents: row.job.payMinCents,
      payMaxCents: row.job.payMaxCents,
      prevailingWage: row.job.prevailingWage,
      createdAt: row.job.createdAt.toISOString(),
    },
    rates: { paidThrough: paid, versions: versions.filter((v) => v.assignmentId === null).map((v) => versionView(v, paid)) },
    ownCards,
    assignments,
    activity: await activityOf(tx, id, 200),
  };
}

export type JobOrderPage = NonNullable<Awaited<ReturnType<typeof jobOrderPage>>>;
