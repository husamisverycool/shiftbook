/**
 * Keeps the obligations table in step with what the agency's data calls for (decision J3): new
 * duties are created, open ones follow their dates, the data closes what it settles (a renewal, an
 * I-9 date), and an open duty the data no longer calls for is closed as not applicable. A person's
 * decision (done, not applicable) is never undone; what Shiftbook closed, Shiftbook may reopen.
 * The run keeps the Illinois equal-pay crossings itself.
 */
import { addDays, workweekStart, type Weekday } from "@shiftbook/rules";
import { eq, notInArray } from "drizzle-orm";
import { auditBy } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { lockCompliance } from "../run/period-lock";
import { settingOn } from "../settings";
import { EQUAL_PAY_KINDS } from "./kinds";
import { keyOf, wantedObligations, type ComplianceRule, type Placement, type Wanted } from "./generate";

/** Who Shiftbook's own changes are recorded as. */
export const SYSTEM = "Shiftbook";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export async function complianceRules(tx: Tx): Promise<ComplianceRule[]> {
  return (await tx.select().from(s.complianceRules)).map((r) => ({ ...r, fixedDates: r.fixedDates ?? [], socGroups: r.socGroups ?? [], roles: r.roles ?? [] }));
}

/** The facts the duties are worked out from. */
export async function complianceInput(tx: Tx, today: string) {
  const [rules, registrations, policies, rows, workers] = await Promise.all([
    complianceRules(tx),
    tx.select().from(s.agencyRegistrations),
    tx.select().from(s.wcPolicies),
    tx
      .select({
        id: s.assignments.id,
        workerId: s.assignments.workerId,
        clientId: s.jobOrders.clientId,
        state: s.worksites.state,
        dayAndTemporaryLabor: s.jobOrders.dayAndTemporaryLabor,
        socCode: s.jobOrders.socCode,
        startDate: s.assignments.startDate,
        endDate: s.assignments.endDate,
        status: s.assignments.status,
        workerLanguage: s.workers.preferredLanguage,
      })
      .from(s.assignments)
      .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
      .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId))
      .innerJoin(s.workers, eq(s.workers.id, s.assignments.workerId)),
    tx.select().from(s.workers),
  ]);
  const startsOn = new Map<string, Weekday>();
  const weekStart = async (date: string) => {
    if (!startsOn.has(date)) {
      const v = await settingOn<number>(tx, "workweek_starts_on", date);
      startsOn.set(date, (typeof v === "number" ? v : 1) as Weekday);
    }
    return startsOn.get(date)!;
  };
  const placements: Placement[] = [];
  for (const r of rows.sort((a, b) => cmp(a.startDate, b.startDate) || cmp(a.id, b.id))) {
    // Pay periods are the agency's workweeks: the first one ends six days after the start's week begins.
    placements.push({ ...r, dayAndTemporaryLabor: r.dayAndTemporaryLabor !== false, firstPeriodEnd: addDays(workweekStart(r.startDate, await weekStart(r.startDate)), 6) });
  }
  const firstStart = (workerId: string) =>
    placements
      .filter((p) => p.workerId === workerId && p.status !== "cancelled")
      .map((p) => p.startDate)
      .sort(cmp)[0] ?? null;
  return {
    today,
    rules,
    registrations: registrations.sort((a, b) => cmp(a.jurisdiction, b.jurisdiction) || cmp(a.branchId ?? "", b.branchId ?? "") || cmp(a.expiresOn, b.expiresOn) || cmp(a.id, b.id)),
    policies: policies.sort((a, b) => cmp(a.startsOn, b.startsOn) || cmp(a.id, b.id)),
    placements,
    workers: workers
      .sort((a, b) => cmp(a.lastName, b.lastName) || cmp(a.firstName, b.firstName) || cmp(a.id, b.id))
      .map((w) => ({ id: w.id, hireDate: w.hireDate ?? firstStart(w.id), i9Section1On: w.i9Section1On, i9Section2On: w.i9Section2On, workAuthExpiresOn: w.workAuthExpiresOn })),
  };
}

const subjectOf = (w: Wanted) => ({ workerId: w.workerId, clientId: w.clientId, assignmentId: w.assignmentId, registrationId: w.registrationId, policyId: w.policyId });

export async function syncObligations(tx: Tx, agencyId: string, today: string): Promise<{ created: number; changed: number; closed: number }> {
  await lockCompliance(tx, agencyId);
  const wanted = wantedObligations(await complianceInput(tx, today));
  const existing = await tx.select().from(s.obligations).where(notInArray(s.obligations.kind, [...EQUAL_PAY_KINDS]));
  const byKey = new Map(existing.map((o) => [keyOf({ ...o, occurrence: o.occurrence }), o]));
  const who = { agencyId, userId: null, label: SYSTEM };
  const now = new Date();
  let created = 0;
  let changed = 0;
  let closed = 0;
  const seen = new Set<string>();
  for (const w of wanted) {
    const key = keyOf(w);
    seen.add(key);
    const o = byKey.get(key);
    const closedNow = w.done ? { status: "done" as const, statusNote: w.done.note, doneAt: now, doneBy: null, doneByLabel: SYSTEM, closedBySystem: true } : null;
    if (!o) {
      const [row] = await tx
        .insert(s.obligations)
        .values({ agencyId, kind: w.kind, jurisdiction: w.jurisdiction, subjectKind: w.subjectKind, ...subjectOf(w), occurrence: w.occurrence, dueOn: w.dueOn, remindOn: w.remindOn, facts: w.facts, message: w.message, ...(closedNow ?? {}) })
        .onConflictDoNothing()
        .returning({ id: s.obligations.id });
      if (row) {
        created += 1;
        await auditBy(tx, who, [{ action: "create", entityType: "obligation", entityId: row.id, after: { kind: w.kind, occurrence: w.occurrence, dueOn: w.dueOn, status: closedNow ? "done" : "open" } }]);
      }
      continue;
    }
    const datesMoved = o.dueOn !== w.dueOn || o.remindOn !== w.remindOn || o.message !== w.message || JSON.stringify(o.facts) !== JSON.stringify(w.facts);
    if (o.status === "open" && closedNow) {
      await tx.update(s.obligations).set({ dueOn: w.dueOn, remindOn: w.remindOn, facts: w.facts, message: w.message, ...closedNow }).where(eq(s.obligations.id, o.id));
      await auditBy(tx, who, [{ action: "update", entityType: "obligation", entityId: o.id, before: { status: "open" }, after: { status: "done", note: w.done!.note } }]);
      closed += 1;
    } else if (o.status !== "open" && o.closedBySystem && !closedNow) {
      // Shiftbook closed it and the data calls for it again: open.
      await tx.update(s.obligations).set({ status: "open", statusNote: null, doneAt: null, doneBy: null, doneByLabel: null, closedBySystem: false, dueOn: w.dueOn, remindOn: w.remindOn, facts: w.facts, message: w.message }).where(eq(s.obligations.id, o.id));
      await auditBy(tx, who, [{ action: "update", entityType: "obligation", entityId: o.id, before: { status: o.status }, after: { status: "open" }, reason: "the data calls for it again" }]);
      changed += 1;
    } else if (o.status === "open" && datesMoved) {
      await tx.update(s.obligations).set({ dueOn: w.dueOn, remindOn: w.remindOn, facts: w.facts, message: w.message }).where(eq(s.obligations.id, o.id));
      if (o.dueOn !== w.dueOn) await auditBy(tx, who, [{ action: "update", entityType: "obligation", entityId: o.id, before: { dueOn: o.dueOn }, after: { dueOn: w.dueOn } }]);
      changed += 1;
    }
  }
  for (const o of existing) {
    if (o.status !== "open" || seen.has(keyOf(o))) continue;
    await tx.update(s.obligations).set({ status: "not_applicable", statusNote: NO_LONGER, doneAt: now, doneBy: null, doneByLabel: SYSTEM, closedBySystem: true }).where(eq(s.obligations.id, o.id));
    await auditBy(tx, who, [{ action: "update", entityType: "obligation", entityId: o.id, before: { status: "open" }, after: { status: "not_applicable" }, reason: NO_LONGER }]);
    closed += 1;
  }
  return { created, changed, closed };
}

/** The note on a duty the data no longer calls for (a cancelled placement, a changed state). */
export const NO_LONGER = "No longer applies: what it was worked out from has changed.";
