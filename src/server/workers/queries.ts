/**
 * What the roster pages read (slice k step 2). The list carries nothing of the SSN (California's and
 * New York's guidance: no SSNs on rosters); the profile carries the last four and who looked at or
 * changed the number, never the number.
 */
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { SYSTEM_OF, type PayrollSystem } from "../../exports/targets";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { payrollTarget } from "../payroll/settings";
import { payStatementLanguage, placedStates } from "./pay-statement";

export interface WorkerRow {
  id: string;
  firstName: string;
  lastName: string;
  preferredLanguage: string;
  status: s.WorkerStatus;
  endedOn: string | null;
  hireDate: string | null;
  /** Current placements (active on the day), the job and the client. */
  placements: { position: string; clientName: string }[];
  /** Whether the payroll system in use has this worker's number (null when no system is chosen). */
  payrollNumber: "set" | "missing" | null;
  /** Every payroll number the worker has, in any system (the search finds them). */
  payrollNumbers: string[];
}

export interface WorkerListView {
  rows: WorkerRow[];
  system: PayrollSystem | null;
}

/** Placements running on `today`, per worker. */
async function currentPlacements(tx: Tx, today: string, workerIds?: string[]) {
  const rows = await tx
    .select({ workerId: s.assignments.workerId, position: s.jobOrders.position, clientName: s.clients.name, startDate: s.assignments.startDate, endDate: s.assignments.endDate, status: s.assignments.status })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId))
    .where(and(eq(s.assignments.status, "active"), sql`${s.assignments.startDate} <= ${today}`, or(isNull(s.assignments.endDate), sql`${s.assignments.endDate} >= ${today}`), workerIds ? inArray(s.assignments.workerId, workerIds) : undefined))
    .orderBy(asc(s.assignments.startDate));
  const by = new Map<string, { position: string; clientName: string }[]>();
  for (const r of rows) by.set(r.workerId, [...(by.get(r.workerId) ?? []), { position: r.position, clientName: r.clientName }]);
  return by;
}

export async function workerList(tx: Tx, opts: { today: string; includeEnded?: boolean }): Promise<WorkerRow[]> {
  return (await workerListView(tx, opts)).rows;
}

export async function workerListView(tx: Tx, opts: { today: string; includeEnded?: boolean }): Promise<WorkerListView> {
  const target = await payrollTarget(tx);
  const system = target ? SYSTEM_OF[target.format] : null;
  const workers = await tx
    .select({ id: s.workers.id, firstName: s.workers.firstName, lastName: s.workers.lastName, preferredLanguage: s.workers.preferredLanguage, status: s.workers.status, endedOn: s.workers.endedOn, hireDate: s.workers.hireDate, payrollIds: s.workers.payrollIds })
    .from(s.workers)
    .where(opts.includeEnded ? undefined : eq(s.workers.status, "active"));
  const placements = await currentPlacements(tx, opts.today);
  const rows = workers
    .map((w) => ({
      id: w.id,
      firstName: w.firstName,
      lastName: w.lastName,
      preferredLanguage: w.preferredLanguage,
      status: w.status,
      endedOn: w.endedOn,
      hireDate: w.hireDate,
      placements: placements.get(w.id) ?? [],
      payrollNumber: system ? (w.payrollIds[system] ? ("set" as const) : ("missing" as const)) : null,
      payrollNumbers: Object.values(w.payrollIds).flatMap((v) => (v?.id ? [v.id] : [])),
    }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName, "en") || a.firstName.localeCompare(b.firstName, "en"));
  return { rows, system };
}

export interface SsnActivity {
  /** Viewed (Retrieve SSN), changed, a file holding it opened, or refused on another worker as a duplicate. */
  kind: "viewed" | "changed" | "opened" | "matched";
  at: string;
  by: string;
  reason: string | null;
  /** The file opened (kind "opened"). */
  document: string | null;
}

export interface WorkerProfile {
  id: string;
  firstName: string;
  lastName: string;
  preferredLanguage: string;
  status: s.WorkerStatus;
  endedOn: string | null;
  hireDate: string | null;
  i9Section1On: string | null;
  i9Section2On: string | null;
  workAuthExpiresOn: string | null;
  ssn: { last4: string | null; activity: SsnActivity[] };
  payrollIds: s.PayrollIds;
  system: PayrollSystem | null;
  documents: { id: string; documentId: string; filename: string; kind: s.WorkerDocumentKind; effectiveOn: string; addedBy: string; addedAt: string }[];
  placements: { id: string; jobOrderId: string; position: string; clientName: string; startDate: string; endDate: string | null; status: string; current: boolean }[];
  /** New Jersey: the language the pay statements must also be in (SPEC §16), or null. */
  payStatementLanguage: string | null;
}

/** `ssnActivity: true`: who looked at or changed the SSN, for the Owner's Retrieve SSN only (left out unless asked for). */
export async function workerProfile(tx: Tx, id: string, today: string, opts: { ssnActivity?: boolean } = {}): Promise<WorkerProfile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [w] = await tx.select().from(s.workers).where(eq(s.workers.id, id));
  if (!w) return null;
  const target = await payrollTarget(tx);
  const docs = await tx
    .select({ id: s.workerDocuments.id, documentId: s.workerDocuments.documentId, kind: s.workerDocuments.kind, addedBy: s.workerDocuments.createdByLabel, addedAt: s.workerDocuments.createdAt, filename: s.complianceDocuments.filename, effectiveOn: s.complianceDocuments.effectiveOn })
    .from(s.workerDocuments)
    .innerJoin(s.complianceDocuments, eq(s.complianceDocuments.id, s.workerDocuments.documentId))
    .where(and(eq(s.workerDocuments.workerId, w.id), isNull(s.workerDocuments.removedAt)))
    .orderBy(desc(s.complianceDocuments.effectiveOn), desc(s.workerDocuments.createdAt));
  const placed = await tx
    .select({ id: s.assignments.id, jobOrderId: s.assignments.jobOrderId, position: s.jobOrders.position, clientName: s.clients.name, startDate: s.assignments.startDate, endDate: s.assignments.endDate, status: s.assignments.status })
    .from(s.assignments)
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId))
    .where(eq(s.assignments.workerId, w.id))
    .orderBy(desc(s.assignments.startDate));
  // Every look at the SSN (and at a file holding it) and every change to it, newest first (Toast lists
  // them in the Retrieve SSN pop-up).
  const events =
    opts.ssnActivity !== true
      ? []
      : await tx
          .select()
          .from(s.auditEvents)
          .where(and(eq(s.auditEvents.entityType, "worker"), eq(s.auditEvents.entityId, w.id), or(eq(s.auditEvents.action, "reveal"), sql`${s.auditEvents.after} ? 'ssn'`)))
          .orderBy(desc(s.auditEvents.occurredAt), desc(s.auditEvents.id));
  const activityOf = (e: (typeof events)[number]): SsnActivity => {
    const after = (e.after ?? {}) as { ssn?: string; filename?: string };
    const kind = e.action === "reveal" ? (after.filename ? "opened" : "viewed") : after.ssn === "duplicate_refused" ? "matched" : "changed";
    return { kind, at: e.occurredAt.toISOString(), by: e.actorLabel, reason: e.reason, document: kind === "opened" ? (after.filename ?? null) : null };
  };
  return {
    id: w.id,
    firstName: w.firstName,
    lastName: w.lastName,
    preferredLanguage: w.preferredLanguage,
    status: w.status,
    endedOn: w.endedOn,
    hireDate: w.hireDate,
    i9Section1On: w.i9Section1On,
    i9Section2On: w.i9Section2On,
    workAuthExpiresOn: w.workAuthExpiresOn,
    ssn: { last4: w.ssnLast4, activity: events.map(activityOf) },
    payrollIds: w.payrollIds,
    system: target ? SYSTEM_OF[target.format] : null,
    documents: docs.map((d) => ({ ...d, addedAt: d.addedAt.toISOString() })),
    placements: placed.map((p) => ({ ...p, current: p.status === "active" && p.startDate <= today && (p.endDate === null || p.endDate >= today) })),
    payStatementLanguage: payStatementLanguage(await placedStates(tx, w.id), w.preferredLanguage),
  };
}
