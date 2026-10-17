/**
 * Recording partner handoffs (slice w; SPEC §27 item 9: compute everything, move nothing). Each action
 * re-reads and recomputes what it hands off — never trusting the screen's numbers — refuses what is not
 * ready, stores the payload with its SHA-256, and writes an audit event. Only the Owner ("money").
 * Nothing is sent anywhere: a licensed partner would act on the recorded payload.
 */
import { createHash } from "node:crypto";
import { isIsoDate } from "@shiftbook/rules";
import { and, eq, sql } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { wcPacketView } from "../compliance/documents";
import { can } from "../permissions";
import type { Actor } from "../session";
import { payloadBytes } from "./payroll-payload";
import { fundingView, payrollHandoffView, wageAccessView } from "./queries";
import { requestProblem } from "./wage-access";

export type MoneyError = "not_allowed" | "not_found" | "not_ready" | "zeal_differs" | "already" | "amount" | "too_much" | "none" | "range";
export type MoneyResult = { ok: true; handoffId: string } | { ok: false; error: MoneyError };

const PAYROLL_PARTNERS = ["check", "zeal", "file"] as const;
export type PayrollPartner = (typeof PAYROLL_PARTNERS)[number];

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** The plain promises shown with every wage-access request (the CFPB opinion's "covered EWA" conditions). */
export const WAGE_ACCESS_TERMS = ["only_earned", "payroll_deduction", "no_recourse", "no_collection", "no_credit_check", "free_option"] as const;

async function record(
  tx: Tx,
  actor: Actor,
  h: { kind: s.HandoffKind; subjectType: (typeof s.partnerHandoffs.$inferInsert)["subjectType"]; subjectId: string; partner: s.HandoffPartner; amountCents: number | null; summary: Record<string, unknown>; payload: unknown },
  entity: { type: string; id: string },
): Promise<MoneyResult> {
  const bytes = payloadBytes(h.payload);
  const digest = sha256(bytes);
  // A run's payroll and an invoice's funding go once (the unique index is the last word under a race).
  if (h.kind === "payroll" || h.kind === "funding") {
    const [taken] = await tx
      .select({ id: s.partnerHandoffs.id })
      .from(s.partnerHandoffs)
      .where(and(eq(s.partnerHandoffs.kind, h.kind), eq(s.partnerHandoffs.subjectId, h.subjectId)))
      .limit(1);
    if (taken) return { ok: false, error: "already" };
  }
  const [row] = await tx
    .insert(s.partnerHandoffs)
    .values({ agencyId: actor.agencyId, kind: h.kind, subjectType: h.subjectType, subjectId: h.subjectId, partner: h.partner, amountCents: h.amountCents, summary: h.summary, payload: h.payload as object, payloadSha256: digest, createdBy: actor.userId, createdByLabel: actor.label })
    .onConflictDoNothing()
    .returning({ id: s.partnerHandoffs.id });
  if (!row) return { ok: false, error: "already" };
  await audit(tx, actor, [{ action: "export", entityType: entity.type, entityId: entity.id, after: { handoff: row.id, kind: h.kind, partner: h.partner, amountCents: h.amountCents, sha256: digest } }]);
  return { ok: true, handoffId: row.id };
}

/** A regular run's payroll payload, approved by the Owner and recorded for a payroll partner. */
export async function recordPayrollHandoff(tx: Tx, actor: Actor, runId: string, partner: unknown): Promise<MoneyResult> {
  if (!can(actor, "money")) return { ok: false, error: "not_allowed" };
  if (!PAYROLL_PARTNERS.includes(partner as PayrollPartner)) return { ok: false, error: "not_found" };
  const view = await payrollHandoffView(tx, runId);
  if (!view) return { ok: false, error: "not_found" };
  if (!view.payload.ready) return { ok: false, error: "not_ready" };
  const p = partner as PayrollPartner;
  // Zeal recomputes hours × wage; a line it would pay a cent differently is not the approved run
  // (money review B3): handed off as Check's shape or the file instead.
  if (p === "zeal" && view.payload.zeal.differences.length > 0) return { ok: false, error: "zeal_differs" };
  const shaped = p === "check" ? view.payload.check : p === "zeal" ? view.payload.zeal : view.payload.neutral;
  return record(
    tx,
    actor,
    {
      kind: "payroll",
      subjectType: "pay_run",
      subjectId: runId,
      partner: p,
      amountCents: view.payload.neutral.totals.gross_cents,
      summary: { periodStart: view.run.periodStart, periodEnd: view.run.periodEnd, payday: view.run.payday, version: view.run.version, workers: view.payload.neutral.totals.workers, lines: view.payload.neutral.totals.lines },
      payload: { neutral: view.payload.neutral, partner: p, shaped },
    },
    { type: "pay_run", id: runId },
  );
}

/** A worker's request for part of what they have earned, recorded for a wage-access partner. */
export async function requestWageAccess(tx: Tx, actor: Actor, workerId: string, amountCents: unknown, delivery: unknown): Promise<MoneyResult> {
  if (!can(actor, "money")) return { ok: false, error: "not_allowed" };
  if (delivery !== "standard" && delivery !== "expedited") return { ok: false, error: "amount" };
  // One request per worker at a time: a second waits, then sees the first as outstanding (never over the cap).
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`wage_access:${workerId}`}, 0))`);
  const { rules, rows } = await wageAccessView(tx, { workerId });
  const row = rows.find((r) => r.workerId === workerId);
  if (!row) return { ok: false, error: "not_found" };
  const problem = requestProblem(amountCents, row.availability);
  if (problem) return { ok: false, error: problem };
  const amount = amountCents as number;
  const feeCents = delivery === "expedited" ? rules.expeditedFeeCents : 0;
  return record(
    tx,
    actor,
    {
      kind: "wage_access",
      subjectType: "worker",
      subjectId: workerId,
      partner: "wage_access_partner",
      amountCents: amount,
      summary: { workerName: row.workerName, delivery, feeCents, earnedCents: row.availability.earnedCents, availableCents: row.availability.availableCents, entryIds: row.availability.entryIds },
      payload: {
        worker: `granite:worker:${workerId}`,
        amount_cents: amount,
        delivery,
        fee_cents: feeCents,
        earned_cents: row.availability.earnedCents,
        cap_bps: rules.capBps,
        drawn_on_entries: row.availability.entryIds,
        recovery: "payroll_deduction_next_payroll",
        terms: WAGE_ACCESS_TERMS,
      },
    },
    { type: "worker", id: workerId },
  );
}

/** An eligible invoice's packet, submitted to a funding partner (recorded only). */
export async function submitFunding(tx: Tx, actor: Actor, invoiceId: string, today: string): Promise<MoneyResult> {
  if (!can(actor, "money")) return { ok: false, error: "not_allowed" };
  const { packets } = await fundingView(tx, today, { invoiceId });
  const p = packets[0];
  if (!p) return { ok: false, error: "not_found" };
  if (!p.eligible || !p.offer) return { ok: false, error: "not_ready" };
  return record(
    tx,
    actor,
    {
      kind: "funding",
      subjectType: "invoice",
      subjectId: invoiceId,
      partner: "funding_partner",
      amountCents: p.offer.balanceCents,
      summary: { invoiceNumber: p.invoice.number, clientName: p.invoice.clientName, advanceCents: p.offer.advanceCents, feeCents: p.offer.feeCents },
      payload: { schedule_of_accounts: p.schedule, offer: p.offer, facts: p.facts, age_days: p.ageDays, aging_bucket: p.bucket, concentration_bps: p.concentrationBps, dispute_rate_bps: p.disputeRateBps, backup_included: p.invoice.hasBackup },
    },
    { type: "invoice", id: invoiceId },
  );
}

/** The broker's payroll by state and class for pay dates in a range, recorded as handed off. */
export async function recordInsuranceHandoff(tx: Tx, actor: Actor, from: unknown, to: unknown): Promise<MoneyResult> {
  if (!can(actor, "money")) return { ok: false, error: "not_allowed" };
  if (typeof from !== "string" || typeof to !== "string" || !isIsoDate(from) || !isIsoDate(to) || to < from) return { ok: false, error: "range" };
  const v = await wcPacketView(tx, { from, to, order: "class" });
  if (v.runs === 0) return { ok: false, error: "none" };
  return record(
    tx,
    actor,
    {
      kind: "insurance",
      subjectType: "pay_dates",
      subjectId: `${from}_${to}`,
      partner: "broker",
      amountCents: v.totals.totalCents,
      summary: { from, to, classes: v.classes.length, runs: v.runs },
      payload: { from, to, classes: v.classes.map((c) => ({ state: c.state, class_code: c.classCode, description: c.description, minutes: c.minutes, straight_cents: c.straightCents, ot_premium_cents: c.otPremiumCents, dt_premium_cents: c.dtPremiumCents, other_cents: c.otherCents, total_cents: c.totalCents })), totals: v.totals },
    },
    { type: "agency", id: actor.agencyId },
  );
}
