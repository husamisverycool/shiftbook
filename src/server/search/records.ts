/**
 * The command menu's record search (decision 0038; docs/patterns/_components/command-menu.md):
 * workers, clients, invoices, job orders and assignments whose name or number matches, at most five
 * of each, active before ended (Linear's search order). Runs inside the agency's transaction, so
 * row-level security fences it; it reads names, numbers and statuses only — never an SSN or a date
 * of birth.
 */
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { assignments, clients, invoices, jobOrders, workers, worksites } from "@/server/db/schema";

export type RecordKind = "worker" | "client" | "invoice" | "jobOrder" | "assignment";
/** Which records a query looks at: everything, work records (`#`) or people and companies (`@`). */
export type RecordSet = "all" | "work" | "people";
export interface Scope {
  kind: "client" | "worker";
  id: string;
}

export interface FoundRecord {
  kind: RecordKind;
  id: string;
  title: string;
  /** Where the record opens (an assignment opens on its job order's Assignments tab). */
  href: string;
  /** One muted line of context: the client, the status, the week. Plain data; the screen words it. */
  context: { client?: string; worksite?: string; status?: string; position?: string; worker?: string; totalCents?: number; issuedOn?: string };
  /** The invoice number typed exactly (Stripe: an identifier goes straight to its record). */
  exact?: boolean;
}

export const PER_KIND = 5;
const MAX_TERM = 80;

/** `%term%` with the LIKE wildcards in the person's text taken literally. */
export function containsPattern(term: string): string {
  return `%${term.slice(0, MAX_TERM).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function searchRecords(tx: Tx, input: { term: string; set?: RecordSet; scope?: Scope | null }): Promise<FoundRecord[]> {
  const term = input.term.trim();
  const set = input.set ?? "all";
  const scope = input.scope ?? null;
  if (term === "" && !scope) return [];
  const like = containsPattern(term);
  const people = set !== "work";
  const work = set !== "people";
  const found: FoundRecord[] = [];

  const workerName = sql<string>`${workers.firstName} || ' ' || ${workers.lastName}`;

  if (people && scope?.kind !== "worker") {
    const where: SQL[] = [];
    if (term) where.push(or(ilike(workerName, like), ilike(sql`${workers.lastName} || ' ' || ${workers.firstName}`, like))!);
    if (scope?.kind === "client")
      where.push(
        sql`exists (select 1 from ${assignments} a join ${jobOrders} j on j.id = a.job_order_id where a.worker_id = ${workers.id} and j.client_id = ${scope.id})`,
      );
    const rows = await tx
      .select({ id: workers.id, name: workerName, status: workers.status })
      .from(workers)
      .where(and(...where))
      .orderBy(sql`${workers.status} = 'ended'`, asc(workers.lastName), asc(workers.firstName))
      .limit(PER_KIND);
    for (const r of rows) found.push({ kind: "worker", id: r.id, href: `/workers/${r.id}`, title: r.name, context: { status: r.status } });
  }

  if (people && !scope && term) {
    const rows = await tx
      .select({ id: clients.id, name: clients.name, code: clients.code })
      .from(clients)
      .where(or(ilike(clients.name, like), ilike(clients.code, like)))
      .orderBy(asc(clients.name))
      .limit(PER_KIND);
    for (const r of rows) found.push({ kind: "client", id: r.id, href: `/clients/${r.id}`, title: r.name, context: {} });
  }

  if (work && scope?.kind !== "worker") {
    const where: SQL[] = [];
    if (term) where.push(or(ilike(invoices.number, like), ilike(clients.name, like))!);
    if (scope?.kind === "client") where.push(eq(invoices.clientId, scope.id));
    const rows = await tx
      .select({ id: invoices.id, number: invoices.number, client: clients.name, status: invoices.status, totalCents: invoices.totalCents, issuedOn: invoices.issuedOn })
      .from(invoices)
      .innerJoin(clients, eq(clients.id, invoices.clientId))
      .where(and(...where))
      .orderBy(sql`${invoices.status} in ('paid', 'void')`, desc(invoices.issuedOn), desc(invoices.number))
      .limit(PER_KIND);
    const lower = term.toLowerCase();
    for (const r of rows)
      found.push({ kind: "invoice", id: r.id, href: `/invoices/${r.id}`, title: r.number, exact: lower !== "" && r.number.toLowerCase() === lower, context: { client: r.client, status: r.status, totalCents: r.totalCents, issuedOn: r.issuedOn } });
  }

  if (work && scope?.kind !== "worker") {
    const where: SQL[] = [];
    if (term) where.push(or(ilike(jobOrders.position, like), ilike(clients.name, like), ilike(worksites.name, like))!);
    if (scope?.kind === "client") where.push(eq(jobOrders.clientId, scope.id));
    const rows = await tx
      .select({ id: jobOrders.id, position: jobOrders.position, client: clients.name, worksite: worksites.name })
      .from(jobOrders)
      .innerJoin(clients, eq(clients.id, jobOrders.clientId))
      .innerJoin(worksites, eq(worksites.id, jobOrders.worksiteId))
      .where(and(...where))
      .orderBy(asc(jobOrders.position), asc(clients.name))
      .limit(PER_KIND);
    for (const r of rows) found.push({ kind: "jobOrder", id: r.id, href: `/job-orders/${r.id}`, title: r.position, context: { client: r.client, worksite: r.worksite } });
  }

  if (work) {
    const where: SQL[] = [];
    if (term) where.push(or(ilike(workerName, like), ilike(jobOrders.position, like), ilike(clients.name, like))!);
    if (scope?.kind === "client") where.push(eq(jobOrders.clientId, scope.id));
    if (scope?.kind === "worker") where.push(eq(assignments.workerId, scope.id));
    const rows = await tx
      .select({ id: assignments.id, jobOrderId: assignments.jobOrderId, worker: workerName, position: jobOrders.position, client: clients.name, status: assignments.status })
      .from(assignments)
      .innerJoin(workers, eq(workers.id, assignments.workerId))
      .innerJoin(jobOrders, eq(jobOrders.id, assignments.jobOrderId))
      .innerJoin(clients, eq(clients.id, jobOrders.clientId))
      .where(and(...where))
      .orderBy(sql`${assignments.status} <> 'active'`, desc(assignments.startDate))
      .limit(PER_KIND);
    for (const r of rows) found.push({ kind: "assignment", id: r.id, href: `/job-orders/${r.jobOrderId}?tab=assignments`, title: r.worker, context: { position: r.position, client: r.client, status: r.status } });
  }

  return found;
}
