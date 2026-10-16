/**
 * Keeps the obligations table in step with what the agency's data calls for (decision J3): new
 * duties are created (not those further back than their look-back), open ones follow their dates,
 * the data closes what it settles (a renewal, an I-9 date), and an open duty the data no longer calls
 * for is closed as not applicable — never one only because it is old. A person's decision (done, not
 * applicable) is never undone; what Shiftbook closed, Shiftbook may reopen or close again as the data
 * says. The run keeps the Illinois equal-pay crossings itself.
 */
import { addDays, workweekStart, type Weekday } from "@shiftbook/rules";
import { and, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";
import { auditBy } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { lockCompliance, tryLockCompliance } from "../run/period-lock";
import { settingOn } from "../settings";
import { equalPayExplain, noteKeyOf, sayInEnglish } from "./explain-keys";
import { EQUAL_PAY_KINDS } from "./kinds";
import { acaOffers } from "./aca-data";
import { keyOf, wantedObligations, type ComplianceRule, type GenerateInput, type OpenDays, type Placement, type Wanted } from "./generate";

/** Who Shiftbook's own changes are recorded as. */
export const SYSTEM = "Shiftbook";
/** The weekdays the agency is open (0 Sunday … 6 Saturday), dated: its weekend days count as I-9 business days. */
export const OPEN_DAYS_KEY = "compliance.open_weekdays";

/** JSON with its keys sorted, so facts read back from jsonb compare equal to the same facts worked out again. */
export const stableJson = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => cmp(a, b))) : x));

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export async function complianceRules(tx: Tx): Promise<ComplianceRule[]> {
  return (await tx.select().from(s.complianceRules)).map((r) => ({ ...r, fixedDates: r.fixedDates ?? [], socGroups: r.socGroups ?? [], roles: r.roles ?? [] }));
}

/** The facts the duties are worked out from. */
export async function complianceInput(tx: Tx, today: string): Promise<GenerateInput> {
  const offers = await acaOffers(tx, today);
  const aca = offers.rows.map((r) => ({ workerId: r.workerId, cycle: r.cycle, measurementStart: r.measurementStart, measurementEnd: r.measurementEnd, minutes: r.minutes, days: r.days, averageMinutesPerWeek: r.averageMinutesPerWeek, fullTimeMinutesPerWeek: offers.fullTimeMinutesPerWeek, stabilityStart: r.stabilityStart!, stabilityEnd: r.stabilityEnd! }));
  const [rules, registrations, policies, rows, workers, openRows] = await Promise.all([
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
    tx.select().from(s.agencySettings).where(eq(s.agencySettings.key, OPEN_DAYS_KEY)),
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
  const mine = (workerId: string) => placements.filter((p) => p.workerId === workerId && p.status !== "cancelled");
  const firstStart = (workerId: string) => mine(workerId).map((p) => p.startDate).sort(cmp)[0] ?? null;
  /** When the job starting on the hire date ends: the latest such placement's end; open-ended or none: null. */
  const firstJobEnds = (workerId: string, hire: string | null) => {
    const first = mine(workerId).filter((p) => p.startDate === hire);
    return first.length === 0 || first.some((p) => p.endDate === null) ? null : first.map((p) => p.endDate!).sort(cmp).at(-1)!;
  };
  const openDays: OpenDays[] = openRows
    .filter((r) => Array.isArray(r.value))
    .map((r) => ({ weekdays: (r.value as unknown[]).filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6), effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo }))
    .sort((a, b) => cmp(a.effectiveFrom, b.effectiveFrom));
  return {
    today,
    rules,
    registrations: registrations.sort((a, b) => cmp(a.jurisdiction, b.jurisdiction) || cmp(a.branchId ?? "", b.branchId ?? "") || cmp(a.expiresOn, b.expiresOn) || cmp(a.id, b.id)),
    policies: policies.sort((a, b) => cmp(a.startsOn, b.startsOn) || cmp(a.id, b.id)),
    placements,
    workers: workers
      .sort((a, b) => cmp(a.lastName, b.lastName) || cmp(a.firstName, b.firstName) || cmp(a.id, b.id))
      .map((w) => {
        const hireDate = w.hireDate ?? firstStart(w.id);
        return { id: w.id, hireDate, i9Section1On: w.i9Section1On, i9Section2On: w.i9Section2On, workAuthExpiresOn: w.workAuthExpiresOn, firstJobEndsOn: firstJobEnds(w.id, hireDate) };
      }),
    openDays,
    aca,
  };
}

const subjectOf = (w: Wanted) => ({ workerId: w.workerId, clientId: w.clientId, assignmentId: w.assignmentId, registrationId: w.registrationId, policyId: w.policyId });

/**
 * Works the duties out again unless someone is changing them right now (then it is left to them): for
 * the sidebar's badge on every page, which must never wait.
 */
export async function syncIfFree(tx: Tx, agencyId: string, today: string): Promise<void> {
  if (await tryLockCompliance(tx, agencyId)) await syncObligations(tx, agencyId, today);
}

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
    const closedNow = w.done ? { status: "done" as const, statusNote: w.done.note, noteKey: w.done.key, doneAt: now, doneBy: null, doneByLabel: SYSTEM, closedBySystem: true } : null;
    if (!o) {
      // Work long past is not tracked: too old to create (one already on file is kept below).
      if (w.tooOld) continue;
      const [row] = await tx
        .insert(s.obligations)
        .values({ agencyId, kind: w.kind, jurisdiction: w.jurisdiction, subjectKind: w.subjectKind, ...subjectOf(w), occurrence: w.occurrence, dueOn: w.dueOn, remindOn: w.remindOn, facts: w.facts, message: w.message, explain: w.explain, ...(closedNow ?? {}) })
        .onConflictDoNothing()
        .returning({ id: s.obligations.id });
      if (row) {
        created += 1;
        await auditBy(tx, who, [{ action: "create", entityType: "obligation", entityId: row.id, after: { kind: w.kind, occurrence: w.occurrence, dueOn: w.dueOn, status: closedNow ? "done" : "open" } }]);
      }
      continue;
    }
    const datesMoved = o.dueOn !== w.dueOn || o.remindOn !== w.remindOn || o.message !== w.message || stableJson(o.facts) !== stableJson(w.facts);
    if (o.status === "open" && closedNow) {
      await tx.update(s.obligations).set({ dueOn: w.dueOn, remindOn: w.remindOn, facts: w.facts, message: w.message, explain: w.explain, ...closedNow }).where(eq(s.obligations.id, o.id));
      await auditBy(tx, who, [{ action: "update", entityType: "obligation", entityId: o.id, before: { status: "open" }, after: { status: "done", note: w.done!.note, noteKey: w.done!.key } }]);
      closed += 1;
    } else if (o.closedBySystem && closedNow && (o.status !== "done" || o.statusNote !== closedNow.statusNote)) {
      // Shiftbook closed it and the data now settles it (or settles it another way): done, saying how.
      await tx.update(s.obligations).set({ dueOn: w.dueOn, remindOn: w.remindOn, facts: w.facts, message: w.message, explain: w.explain, ...closedNow }).where(eq(s.obligations.id, o.id));
      await auditBy(tx, who, [{ action: "update", entityType: "obligation", entityId: o.id, before: { status: o.status, note: o.statusNote }, after: { status: "done", note: w.done!.note, noteKey: w.done!.key } }]);
      changed += 1;
    } else if (o.status !== "open" && o.closedBySystem && !closedNow) {
      // Shiftbook closed it and the data calls for it again: open.
      await tx.update(s.obligations).set({ status: "open", statusNote: null, noteKey: null, doneAt: null, doneBy: null, doneByLabel: null, closedBySystem: false, dueOn: w.dueOn, remindOn: w.remindOn, facts: w.facts, message: w.message, explain: w.explain }).where(eq(s.obligations.id, o.id));
      await auditBy(tx, who, [{ action: "update", entityType: "obligation", entityId: o.id, before: { status: o.status }, after: { status: "open" }, reason: "the data calls for it again" }]);
      changed += 1;
    } else if (o.status === "open" && datesMoved) {
      await tx.update(s.obligations).set({ dueOn: w.dueOn, remindOn: w.remindOn, facts: w.facts, message: w.message, explain: w.explain }).where(eq(s.obligations.id, o.id));
      if (o.dueOn !== w.dueOn) await auditBy(tx, who, [{ action: "update", entityType: "obligation", entityId: o.id, before: { dueOn: o.dueOn }, after: { dueOn: w.dueOn } }]);
      changed += 1;
    } else if (o.message === w.message && stableJson(o.explain) !== stableJson(w.explain)) {
      // The same sentence, said in keys for the reader's language (decision 0028): no event, nothing changed.
      await tx.update(s.obligations).set({ explain: w.explain }).where(eq(s.obligations.id, o.id));
    }
  }
  for (const o of existing) {
    if (o.status !== "open" || seen.has(keyOf(o))) continue;
    // An ACA offer already due is never set aside by the data (a break, new periods, changed settings): a person decides.
    if (o.kind === "aca_offer" && o.dueOn < today) continue;
    await tx.update(s.obligations).set({ status: "not_applicable", statusNote: NO_LONGER, noteKey: null, doneAt: now, doneBy: null, doneByLabel: SYSTEM, closedBySystem: true }).where(eq(s.obligations.id, o.id));
    await auditBy(tx, who, [{ action: "update", entityType: "obligation", entityId: o.id, before: { status: "open" }, after: { status: "not_applicable" }, reason: NO_LONGER }]);
    closed += 1;
  }
  await backfillOnce(tx, agencyId);
  return { created, changed, closed };
}

/** The note on a duty the data no longer calls for (a cancelled placement, a changed state). */
export const NO_LONGER = "No longer applies: what it was worked out from has changed.";

/** Agencies whose older duties this process has already given keys (the sync runs on every page). */
const backfilled = new Set<string>();

async function backfillOnce(tx: Tx, agencyId: string): Promise<void> {
  if (backfilled.has(agencyId)) return;
  await backfillKeys(tx);
  backfilled.add(agencyId);
}

/**
 * Duties and notes from before keys were kept (decision 0028; drizzle/0036) get them — only when the
 * keys say exactly the stored English, so nothing reads differently in another language. No event: the
 * meaning does not change. The rest keep showing their stored English. Once per agency per process.
 */
export async function backfillKeys(tx: Tx): Promise<void> {
  const pay = await tx.select().from(s.obligations).where(and(inArray(s.obligations.kind, [...EQUAL_PAY_KINDS]), isNull(s.obligations.explain)));
  if (pay.length > 0) {
    const rules = await tx.select().from(s.equalPayRules);
    const workers = new Map((await tx.select({ id: s.workers.id, firstName: s.workers.firstName, lastName: s.workers.lastName }).from(s.workers)).map((w) => [w.id, `${w.firstName} ${w.lastName}`]));
    const clients = new Map((await tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients)).map((c) => [c.id, c.name]));
    for (const o of pay) {
      const f = o.facts as Partial<s.ObligationEvidence>;
      if (!o.crossedOn || !o.workerId || !o.clientId || typeof f.windowStart !== "string" || typeof f.thresholdMinutes !== "number") continue;
      const rule = rules.find((r) => r.jurisdiction === o.jurisdiction && r.ruleCode === f.ruleCode && r.effectiveFrom <= o.crossedOn! && (r.effectiveTo === null || o.crossedOn! <= r.effectiveTo));
      if (!rule) continue;
      const explain = equalPayExplain(
        { kind: o.kind, workerName: workers.get(o.workerId) ?? "", crossedOn: o.crossedOn, crossedAtMinute: f.crossedAtMinute ?? null, windowStart: f.windowStart, thresholdMinutes: f.thresholdMinutes, earlierMinutesAfter: f.earlierMinutesAfter ?? 0 },
        clients.get(o.clientId) ?? `client ${o.clientId}`,
        o.kind === "il_equal_pay_720h" ? rule.windowMonths : rule.longWindowMonths,
      );
      if (sayInEnglish(explain) === o.message) await tx.update(s.obligations).set({ explain }).where(eq(s.obligations.id, o.id));
    }
  }
  for (const o of await tx.select({ id: s.obligations.id, kind: s.obligations.kind, closedBySystem: s.obligations.closedBySystem, statusNote: s.obligations.statusNote }).from(s.obligations).where(and(isNull(s.obligations.noteKey), isNotNull(s.obligations.statusNote)))) {
    const noteKey = noteKeyOf(o.statusNote!, o);
    if (noteKey) await tx.update(s.obligations).set({ noteKey }).where(eq(s.obligations.id, o.id));
  }
}
