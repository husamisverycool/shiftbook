/**
 * The Illinois hours counters page and its opening balances (slice j step 3a, decision J5;
 * docs/patterns/compliance/counters.md). A balance is the hours a worker did for a client before
 * Shiftbook, with the date they run to and a note; the Owner adds one, or removes a wrong one with a
 * reason (it stays on file). The run counts them from its next computation.
 */
import { addMonths, isIsoDate } from "@shiftbook/rules";
import { and, eq, inArray, ne } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { lockCompliance } from "../run/period-lock";
import type { Actor } from "../session";
import { counters, type CounterRow } from "./counters";
import { coveredHours, openingBalances } from "./hours";
import { EQUAL_PAY_KINDS } from "./kinds";
import type { ComplianceResult } from "./service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** At most every hour of four years (the table's check): a typing check, not a rule. */
const MAX_MINUTES = 2_102_400;

export const mayChangeBalances = (actor: Actor) => actor.role === "owner";

export interface BalanceInput {
  workerId: string;
  clientId: string;
  minutes: number;
  throughOn: string;
  note: string;
}

export async function addOpeningBalance(tx: Tx, actor: Actor, input: BalanceInput, today: string): Promise<ComplianceResult> {
  if (!mayChangeBalances(actor)) return { ok: false, error: "not_allowed" };
  if (!UUID.test(input.workerId)) return { ok: false, error: "invalid", field: "workerId" };
  if (!UUID.test(input.clientId)) return { ok: false, error: "invalid", field: "clientId" };
  if (!Number.isSafeInteger(input.minutes) || input.minutes <= 0 || input.minutes > MAX_MINUTES) return { ok: false, error: "invalid", field: "minutes" };
  if (!isIsoDate(input.throughOn) || input.throughOn > today) return { ok: false, error: "invalid", field: "throughOn" };
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length === 0 || note.length > 500) return { ok: false, error: "invalid", field: "note" };
  await lockCompliance(tx, actor.agencyId);
  if ((await tx.select({ id: s.workers.id }).from(s.workers).where(eq(s.workers.id, input.workerId))).length === 0) return { ok: false, error: "invalid", field: "workerId" };
  if ((await tx.select({ id: s.clients.id }).from(s.clients).where(eq(s.clients.id, input.clientId))).length === 0) return { ok: false, error: "invalid", field: "clientId" };
  const values = { workerId: input.workerId, clientId: input.clientId, minutes: input.minutes, throughOn: input.throughOn, note };
  const [row] = await tx.insert(s.hoursOpeningBalances).values({ agencyId: actor.agencyId, ...values, createdBy: actor.userId, createdByLabel: actor.label }).returning({ id: s.hoursOpeningBalances.id });
  await audit(tx, actor, [{ action: "create", entityType: "hours_opening_balance", entityId: row!.id, after: values }]);
  return { ok: true };
}

/** A wrong balance is removed with a reason; it stays on file. */
export async function removeOpeningBalance(tx: Tx, actor: Actor, id: string, reason: unknown): Promise<ComplianceResult> {
  if (!mayChangeBalances(actor)) return { ok: false, error: "not_allowed" };
  if (!UUID.test(id)) return { ok: false, error: "not_found" };
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length === 0 || why.length > 500) return { ok: false, error: "invalid", field: "reason" };
  await lockCompliance(tx, actor.agencyId);
  const [b] = await tx.select().from(s.hoursOpeningBalances).where(eq(s.hoursOpeningBalances.id, id));
  if (!b) return { ok: false, error: "not_found" };
  if (b.removedAt !== null) return { ok: false, error: "not_open" };
  await tx.update(s.hoursOpeningBalances).set({ removedAt: new Date(), removedByLabel: actor.label, removedReason: why }).where(eq(s.hoursOpeningBalances.id, id));
  await audit(tx, actor, [{ action: "update", entityType: "hours_opening_balance", entityId: id, before: { removed: false }, after: { removed: true }, reason: why }]);
  return { ok: true };
}

export type CounterShow = "all" | "near" | "crossed";

export interface CounterLine extends CounterRow {
  workerName: string;
  clientName: string;
  /** The 720-hour duty, to open it. */
  dutyId: string | null;
  balances: { id: string; minutes: number; throughOn: string; note: string; by: string; at: Date; removedAt: Date | null; removedBy: string | null; removedReason: string | null }[];
}

/** One row per worker and client with covered work or a balance in the long window, or a crossing on file. */
export async function countersView(tx: Tx, today: string, q: { clientId: string | null; show: CounterShow; q: string }) {
  const ruleRows = await tx.select().from(s.equalPayRules);
  const rules = ruleRows.map((r) => ({ jurisdiction: r.jurisdiction, ruleCode: r.ruleCode, countsFrom: r.countsFrom, warnMinutes: r.warnMinutes, windowMonths: r.windowMonths, triggerMinutes: r.triggerMinutes, longWindowMonths: r.longWindowMonths, longTriggerMinutes: r.longTriggerMinutes, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, citation: r.citation }));
  const rule = rules.filter((r) => r.effectiveFrom <= today && (r.effectiveTo === null || r.effectiveTo >= today)).sort((a, b) => cmp(a.jurisdiction, b.jurisdiction))[0] ?? null;
  if (!rule) return { rule: null, rows: [] as CounterLine[], clients: [] as { id: string; name: string }[], total: 0 };
  const from = addMonths(today, -rule.longWindowMonths);
  const [worked, balances, duties, allBalances] = await Promise.all([
    coveredHours(tx, { states: [rule.jurisdiction], from, through: today }),
    openingBalances(tx, { from, through: today }),
    tx
      .select()
      .from(s.obligations)
      .where(and(inArray(s.obligations.kind, [...EQUAL_PAY_KINDS]), eq(s.obligations.closedBySystem, false), ne(s.obligations.status, "not_applicable"))),
    tx.select().from(s.hoursOpeningBalances),
  ]);
  const crossings = duties
    .filter((o) => o.workerId && o.clientId && o.crossedOn && o.jurisdiction === rule.jurisdiction)
    .map((o) => ({ kind: o.kind as "il_equal_pay_720h" | "il_equal_pay_4160h", workerId: o.workerId!, clientId: o.clientId!, crossedOn: o.crossedOn! }));
  const rows = counters({ today, jurisdiction: rule.jurisdiction, rules, worked, balances, crossings });
  const ids = (k: "workerId" | "clientId") => [...new Set(rows.map((r) => r[k]))];
  const [workers, clients] = await Promise.all([
    ids("workerId").length > 0 ? tx.select({ id: s.workers.id, firstName: s.workers.firstName, lastName: s.workers.lastName }).from(s.workers).where(inArray(s.workers.id, ids("workerId"))) : [],
    tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients),
  ]);
  const workerName = (id: string) => {
    const w = workers.find((x) => x.id === id);
    return w ? `${w.firstName} ${w.lastName}` : "";
  };
  const lines: CounterLine[] = rows.map((r) => ({
    ...r,
    workerName: workerName(r.workerId),
    clientName: clients.find((c) => c.id === r.clientId)?.name ?? "",
    dutyId: duties.find((o) => o.kind === "il_equal_pay_720h" && o.workerId === r.workerId && o.clientId === r.clientId)?.id ?? null,
    balances: allBalances
      .filter((b) => b.workerId === r.workerId && b.clientId === r.clientId)
      .sort((a, b) => cmp(b.throughOn, a.throughOn) || b.createdAt.getTime() - a.createdAt.getTime())
      .map((b) => ({ id: b.id, minutes: b.minutes, throughOn: b.throughOn, note: b.note, by: b.createdByLabel, at: b.createdAt, removedAt: b.removedAt, removedBy: b.removedByLabel, removedReason: b.removedReason })),
  }));
  const needle = q.q.trim().toLowerCase();
  const shown = lines.filter(
    (l) =>
      (q.clientId === null || l.clientId === q.clientId) &&
      (q.show === "all" || (q.show === "near" ? l.near : l.crossed720 !== null || l.crossed4160 !== null)) &&
      (needle === "" || l.workerName.toLowerCase().includes(needle)),
  );
  const withRows = new Set(lines.map((l) => l.clientId));
  return {
    rule: { jurisdiction: rule.jurisdiction, windowMonths: rule.windowMonths, longWindowMonths: rule.longWindowMonths, triggerMinutes: rule.triggerMinutes, longTriggerMinutes: rule.longTriggerMinutes, warnMinutes: rule.warnMinutes, citation: rule.citation },
    rows: shown,
    total: lines.length,
    clients: clients.filter((c) => withRows.has(c.id)).sort((a, b) => cmp(a.name, b.name)),
  };
}
export type CountersView = Awaited<ReturnType<typeof countersView>>;

/** Workers and clients a balance may be added for: placements (not cancelled) on day and temporary labor in a state with a counter. */
export async function balanceChoices(tx: Tx) {
  const states = [...new Set((await tx.select({ jurisdiction: s.equalPayRules.jurisdiction }).from(s.equalPayRules)).map((r) => r.jurisdiction))];
  if (states.length === 0) return [];
  const rows = await tx
    .select({ workerId: s.assignments.workerId, firstName: s.workers.firstName, lastName: s.workers.lastName, clientId: s.jobOrders.clientId, clientName: s.clients.name })
    .from(s.assignments)
    .innerJoin(s.workers, eq(s.workers.id, s.assignments.workerId))
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .innerJoin(s.clients, eq(s.clients.id, s.jobOrders.clientId))
    .innerJoin(s.worksites, eq(s.worksites.id, s.jobOrders.worksiteId))
    .where(and(inArray(s.worksites.state, states), eq(s.jobOrders.dayAndTemporaryLabor, true), ne(s.assignments.status, "cancelled")));
  const pairs = new Map<string, { workerId: string; workerName: string; clientId: string; clientName: string }>();
  for (const r of rows) pairs.set(`${r.workerId}|${r.clientId}`, { workerId: r.workerId, workerName: `${r.firstName} ${r.lastName}`, clientId: r.clientId, clientName: r.clientName });
  return [...pairs.values()].sort((a, b) => cmp(a.workerName, b.workerName) || cmp(a.clientName, b.clientName));
}
