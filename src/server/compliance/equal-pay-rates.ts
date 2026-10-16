/**
 * The Illinois equal-pay rate entered on a crossing's duty (slice j step 3b, decision J6;
 * docs/patterns/compliance/[id].md): the client's figures from a date — or only that the client was
 * asked — kept as dated rows per worker and client (820 ILCS 175/42(a), (b)). The run pays at least
 * the rate plus the benefits' hourly cash value from the date (packages/rules il-equal-pay-rate).
 * Entering a rate marks the duty done; a rate from the same date replaces the one before, which is kept
 * as replaced; a request never replaces a rate. A wrong row is removed with a reason and stays on file.
 * The Owner only (the equal-pay rule names no other role). Audited. Paid weeks from a rate's date that
 * were paid without it are listed, so each is trued up by a correction (paying late is itself a
 * violation).
 */
import type { Explain } from "../../lib/explain";
import { equalPayRateProblem, isIsoDate, type EqualPayRate } from "@shiftbook/rules";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { lockCompliance } from "../run/period-lock";
import type { Actor } from "../session";
import { EQUAL_PAY_KINDS } from "./kinds";
import { mayActOn, type ComplianceResult } from "./service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS: s.EqualPayMethod[] = ["comparator", "closest_seniority", "survey_median", "survey_75th"];

export interface EqualPayRateInput {
  effectiveFrom: string;
  kind: "rate" | "asked";
  rateCents: number | null;
  benefitsCents: number | null;
  method: s.EqualPayMethod | null;
  comparator: string | null;
  note: string | null;
}

/** The rows in force for the engine: not removed. */
export async function equalPayRatesOnFile(tx: Tx, workerIds?: string[]): Promise<EqualPayRate[]> {
  const rows = await tx.select().from(s.equalPayRates).where(isNull(s.equalPayRates.removedAt));
  return rows
    .filter((r) => !workerIds || workerIds.includes(r.workerId))
    .map((r) => ({ workerId: r.workerId, clientId: r.clientId, effectiveFrom: r.effectiveFrom, kind: r.kind, rateCents: r.rateCents, benefitsCents: r.benefitsCents, method: r.method }))
    .sort((a, b) => (a.workerId < b.workerId ? -1 : a.workerId > b.workerId ? 1 : a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0));
}

/** The note on a duty that entering a rate closed. */
const RATE_ENTERED = "Equal-pay rate entered from ";

/** A rate (or that the client was asked) for the duty's worker at its client, from a date. */
export async function setEqualPayRate(tx: Tx, actor: Actor, obligationId: string, input: EqualPayRateInput, today: string): Promise<ComplianceResult> {
  if (!UUID.test(obligationId)) return { ok: false, error: "not_found" };
  await lockCompliance(tx, actor.agencyId);
  const [o] = await tx.select().from(s.obligations).where(eq(s.obligations.id, obligationId));
  if (!o || !(EQUAL_PAY_KINDS as readonly string[]).includes(o.kind) || !o.workerId || !o.clientId) return { ok: false, error: "not_found" };
  if (!(await mayActOn(tx, actor, o.kind))) return { ok: false, error: "not_allowed" };
  if (!isIsoDate(input.effectiveFrom)) return { ok: false, error: "invalid", field: "effectiveFrom" };
  if (input.kind === "asked" && input.effectiveFrom > today) return { ok: false, error: "invalid", field: "effectiveFrom" };
  const comparator = typeof input.comparator === "string" ? input.comparator.trim() : "";
  const note = typeof input.note === "string" && input.note.trim() !== "" ? input.note.trim() : null;
  if (note !== null && note.length > 500) return { ok: false, error: "invalid", field: "note" };
  const row: EqualPayRate =
    input.kind === "asked"
      ? { workerId: o.workerId, clientId: o.clientId, effectiveFrom: input.effectiveFrom, kind: "asked", rateCents: null, benefitsCents: null, method: null }
      : { workerId: o.workerId, clientId: o.clientId, effectiveFrom: input.effectiveFrom, kind: "rate", rateCents: input.rateCents, benefitsCents: input.benefitsCents, method: input.method };
  if (input.kind === "rate") {
    if (input.method === null || !METHODS.includes(input.method)) return { ok: false, error: "invalid", field: "method" };
    if (!Number.isSafeInteger(input.rateCents) || (input.rateCents ?? 0) <= 0) return { ok: false, error: "invalid", field: "rateCents" };
    if (!Number.isSafeInteger(input.benefitsCents) || (input.benefitsCents ?? -1) < 0 || (input.rateCents ?? 0) + (input.benefitsCents ?? 0) > 10_000_000) return { ok: false, error: "invalid", field: "benefitsCents" };
    if (comparator.length === 0 || comparator.length > 300) return { ok: false, error: "invalid", field: "comparator" };
  }
  if (equalPayRateProblem(row) !== null) return { ok: false, error: "invalid", field: input.kind === "rate" ? "rateCents" : "kind" };
  // A row from the same date replaces the live one, kept as replaced.
  const [same] = await tx
    .select()
    .from(s.equalPayRates)
    .where(and(eq(s.equalPayRates.workerId, o.workerId), eq(s.equalPayRates.clientId, o.clientId), eq(s.equalPayRates.effectiveFrom, input.effectiveFrom), isNull(s.equalPayRates.removedAt)));
  // A request never replaces the client's figures (it would not change pay, and the figures would be lost).
  if (same && same.kind === "rate" && input.kind === "asked") return { ok: false, error: "invalid", field: "askedOverRate" };
  if (same) {
    await tx.update(s.equalPayRates).set({ removedAt: new Date(), removedByLabel: actor.label }).where(eq(s.equalPayRates.id, same.id));
    await audit(tx, actor, [{ action: "update", entityType: "equal_pay_rate", entityId: same.id, before: { removed: false }, after: { removed: true }, reason: "replaced by a rate from the same date" }]);
  }
  const values = { workerId: o.workerId, clientId: o.clientId, effectiveFrom: input.effectiveFrom, kind: input.kind, rateCents: row.rateCents, benefitsCents: row.benefitsCents, method: row.method, comparator: input.kind === "rate" ? comparator : null, note };
  const [created] = await tx.insert(s.equalPayRates).values({ agencyId: actor.agencyId, ...values, createdBy: actor.userId, createdByLabel: actor.label }).returning({ id: s.equalPayRates.id });
  await audit(tx, actor, [{ action: "create", entityType: "equal_pay_rate", entityId: created!.id, after: { ...values, obligationId } }]);
  // The client's figures are in: the duty is done, saying so.
  if (input.kind === "rate" && o.status === "open") {
    const statusNote = `${RATE_ENTERED}${input.effectiveFrom}.`;
    // The note in keys too, for the reader's language (decision 0028).
    const noteKey: Explain = { parts: [{ key: "noteRateEntered", values: { date: { date: input.effectiveFrom } } }], citation: null };
    await tx.update(s.obligations).set({ status: "done", statusNote, noteKey, doneAt: new Date(), doneBy: actor.userId, doneByLabel: actor.label, closedBySystem: false }).where(eq(s.obligations.id, obligationId));
    await audit(tx, actor, [{ action: "update", entityType: "obligation", entityId: obligationId, before: { status: "open" }, after: { status: "done", note: statusNote, noteKey } }]);
  }
  return { ok: true };
}

/** A wrong row removed with a reason (the Owner); it stays on file. */
export async function removeEqualPayRate(tx: Tx, actor: Actor, obligationId: string, rateId: string, reason: unknown): Promise<ComplianceResult> {
  if (!UUID.test(obligationId) || !UUID.test(rateId)) return { ok: false, error: "not_found" };
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length === 0 || why.length > 500) return { ok: false, error: "invalid", field: "reason" };
  await lockCompliance(tx, actor.agencyId);
  const [o] = await tx.select().from(s.obligations).where(eq(s.obligations.id, obligationId));
  if (!o || !(EQUAL_PAY_KINDS as readonly string[]).includes(o.kind) || !o.workerId || !o.clientId) return { ok: false, error: "not_found" };
  if (!(await mayActOn(tx, actor, o.kind))) return { ok: false, error: "not_allowed" };
  const [r] = await tx.select().from(s.equalPayRates).where(and(eq(s.equalPayRates.id, rateId), eq(s.equalPayRates.workerId, o.workerId), eq(s.equalPayRates.clientId, o.clientId)));
  if (!r) return { ok: false, error: "not_found" };
  if (r.removedAt !== null) return { ok: false, error: "not_open" };
  await tx.update(s.equalPayRates).set({ removedAt: new Date(), removedByLabel: actor.label, removedReason: why }).where(eq(s.equalPayRates.id, rateId));
  await audit(tx, actor, [{ action: "update", entityType: "equal_pay_rate", entityId: rateId, before: { removed: false }, after: { removed: true }, reason: why }]);
  // With no rate left, a duty that entering a rate closed is open again.
  const left = await tx.select({ id: s.equalPayRates.id }).from(s.equalPayRates).where(and(eq(s.equalPayRates.workerId, o.workerId), eq(s.equalPayRates.clientId, o.clientId), eq(s.equalPayRates.kind, "rate"), isNull(s.equalPayRates.removedAt)));
  if (r.kind === "rate" && left.length === 0) {
    const closed = await tx
      .select()
      .from(s.obligations)
      .where(and(inArray(s.obligations.kind, [...EQUAL_PAY_KINDS]), eq(s.obligations.workerId, o.workerId), eq(s.obligations.clientId, o.clientId), eq(s.obligations.status, "done"), eq(s.obligations.closedBySystem, false)));
    for (const d of closed.filter((x) => x.statusNote?.startsWith(RATE_ENTERED) === true)) {
      await tx.update(s.obligations).set({ status: "open", statusNote: null, noteKey: null, doneAt: null, doneBy: null, doneByLabel: null }).where(eq(s.obligations.id, d.id));
      await audit(tx, actor, [{ action: "update", entityType: "obligation", entityId: d.id, before: { status: "done", note: d.statusNote }, after: { status: "open" }, reason: "the equal-pay rate on file was removed" }]);
    }
  }
  return { ok: true };
}

/**
 * Paid weeks a correction must true up: periods whose latest paid version paid the worker at the
 * client on or after a rate's date without that rate (its snapshot's input does not hold it).
 */
export async function weeksToTrueUp(tx: Tx, workerId: string, clientId: string) {
  const rates = (await tx.select().from(s.equalPayRates).where(and(eq(s.equalPayRates.workerId, workerId), eq(s.equalPayRates.clientId, clientId), eq(s.equalPayRates.kind, "rate"), isNull(s.equalPayRates.removedAt)))).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  const first = rates[0];
  if (!first) return [];
  const runs = await tx
    .select({ id: s.payRuns.id, payPeriodId: s.payRuns.payPeriodId, version: s.payRuns.version, status: s.payRuns.status, startsOn: s.payPeriods.startsOn, endsOn: s.payPeriods.endsOn })
    .from(s.payRuns)
    .innerJoin(s.payPeriods, eq(s.payPeriods.id, s.payRuns.payPeriodId));
  const latest = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!latest.has(r.payPeriodId) || r.version > latest.get(r.payPeriodId)!.version) latest.set(r.payPeriodId, r);
  const paid = [...latest.values()].filter((r) => (r.status === "exported" || r.status === "closed") && r.endsOn >= first.effectiveFrom);
  if (paid.length === 0) return [];
  const lines = await tx
    .select({ payRunId: s.payLines.payRunId })
    .from(s.payLines)
    .innerJoin(s.assignments, eq(s.assignments.id, s.payLines.assignmentId))
    .innerJoin(s.jobOrders, eq(s.jobOrders.id, s.assignments.jobOrderId))
    .where(and(inArray(s.payLines.payRunId, paid.map((r) => r.id)), eq(s.payLines.workerId, workerId), eq(s.jobOrders.clientId, clientId)));
  const withPay = new Set(lines.map((l) => l.payRunId));
  const snapshots = await tx.select({ id: s.payRuns.id, snapshot: s.payRuns.snapshot }).from(s.payRuns).where(inArray(s.payRuns.id, [...withPay]));
  const paidWith = (runId: string) => ((snapshots.find((x) => x.id === runId)?.snapshot as { input?: { equalPayRates?: EqualPayRate[] } } | null)?.input?.equalPayRates ?? []).filter((x) => x.kind === "rate" && x.workerId === workerId && x.clientId === clientId);
  // A rate in force during the period that the run did not have.
  return paid
    .filter((r) => withPay.has(r.id) && rates.some((x) => x.effectiveFrom <= r.endsOn && !rates.some((y) => y.effectiveFrom > x.effectiveFrom && y.effectiveFrom <= r.startsOn) && !paidWith(r.id).some((y) => y.effectiveFrom === x.effectiveFrom && y.rateCents === x.rateCents && y.benefitsCents === x.benefitsCents)))
    .map((r) => ({ periodId: r.payPeriodId, startsOn: r.startsOn, endsOn: r.endsOn }))
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1));
}

/** The rates on file for a duty's worker and client, newest first, replaced ones included. */
export async function ratesForDuty(tx: Tx, workerId: string, clientId: string) {
  const rows = await tx.select().from(s.equalPayRates).where(and(eq(s.equalPayRates.workerId, workerId), eq(s.equalPayRates.clientId, clientId)));
  return rows
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : b.createdAt.getTime() - a.createdAt.getTime()))
    .map((r) => ({ id: r.id, effectiveFrom: r.effectiveFrom, kind: r.kind, rateCents: r.rateCents, benefitsCents: r.benefitsCents, method: r.method, comparator: r.comparator, note: r.note, by: r.createdByLabel, at: r.createdAt, replacedAt: r.removedAt, replacedBy: r.removedByLabel, removedReason: r.removedReason }));
}
