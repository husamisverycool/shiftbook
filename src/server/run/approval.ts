/**
 * Approving a weekly run (SPEC §2: the Owner approves runs; §11: approval snapshots inputs, rules
 * version and outputs). Plan `.claude/plans/slice-e-weekly-run.md`, decisions E1 and E2.
 *
 * Approving freezes the totals fingerprint the Owner saw, the warnings shown and who approved. The
 * run's inputs, rules version and lines are the run's snapshot and lines, which cannot change while
 * it stays approved: computing again with anything changed voids the approval (run/service.ts), and
 * files are made only from an approved run whose fingerprint still matches (files/service.ts).
 */
import { desc, eq } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import type { Actor } from "../session";
import { openPeriod } from "./period-lock";
import { computeRun } from "./service";

export type RunApprovalError = "not_allowed" | "changed" | "blocked" | "not_approved" | "reason_required" | "not_found";
type Result = { ok: true } | { ok: false; error: RunApprovalError };

const mayApprove = (actor: Actor) => actor.role === "owner";

export async function approveRun(tx: Tx, actor: Actor, payPeriodId: string, expectedFingerprint: string): Promise<Result> {
  if (!mayApprove(actor)) return { ok: false, error: "not_allowed" };
  await openPeriod(tx, payPeriodId);
  const computed = await computeRun(tx, actor, payPeriodId);
  if (computed.status === "blocked") return { ok: false, error: "blocked" };
  if (computed.fingerprint !== expectedFingerprint) return { ok: false, error: "changed" };
  if (computed.status === "approved") return { ok: true };
  const [run] = await tx.select().from(s.payRuns).where(eq(s.payRuns.id, computed.runId));
  const pay = await tx.select({ workerId: s.payLines.workerId, amountCents: s.payLines.amountCents }).from(s.payLines).where(eq(s.payLines.payRunId, computed.runId));
  const bill = await tx.select({ amountCents: s.billLines.amountCents }).from(s.billLines).where(eq(s.billLines.payRunId, computed.runId));
  const approval: s.RunApproval = {
    fingerprint: computed.fingerprint,
    rulesVersion: run!.rulesVersion,
    warnings: computed.warnings.map((w) => ({ code: w.code, message: w.message })),
    totals: {
      workers: new Set(pay.map((l) => l.workerId)).size,
      grossCents: pay.reduce((sum, l) => sum + l.amountCents, 0),
      billedCents: bill.reduce((sum, l) => sum + l.amountCents, 0),
      payLines: pay.length,
      billLines: bill.length,
    },
  };
  const now = new Date();
  await tx.update(s.payRuns).set({ status: "approved", approvedAt: now, approvedBy: actor.userId, approvedByLabel: actor.label, approval, updatedAt: now }).where(eq(s.payRuns.id, computed.runId));
  await audit(tx, actor, [{ action: "approve", entityType: "pay_run", entityId: computed.runId, after: { status: "approved", ...approval } }]);
  return { ok: true };
}

/** Takes an approval back before the files exist (Rise: "unapprove until posted"; Check: reopen). */
export async function unapproveRun(tx: Tx, actor: Actor, payPeriodId: string, reason: string): Promise<Result> {
  if (!mayApprove(actor)) return { ok: false, error: "not_allowed" };
  const why = reason.trim();
  if (why === "") return { ok: false, error: "reason_required" };
  await openPeriod(tx, payPeriodId);
  const [run] = await tx.select().from(s.payRuns).where(eq(s.payRuns.payPeriodId, payPeriodId)).orderBy(desc(s.payRuns.version)).limit(1);
  if (!run) return { ok: false, error: "not_found" };
  if (run.status !== "approved") return { ok: false, error: "not_approved" };
  await tx.update(s.payRuns).set({ status: "ready", approvedAt: null, approvedBy: null, approvedByLabel: null, approval: null, updatedAt: new Date() }).where(eq(s.payRuns.id, run.id));
  await audit(tx, actor, [{ action: "update", entityType: "pay_run", entityId: run.id, before: { status: "approved", approvedBy: run.approvedByLabel }, after: { status: "ready" }, reason: `unapproved: ${why}` }]);
  return { ok: true };
}

/** A client whose shifts must be approved by it before the run can be approved (plan, decision E6). */
export async function setClientApprovalRequired(tx: Tx, actor: Actor, clientId: string, required: boolean): Promise<Result> {
  if (!mayApprove(actor)) return { ok: false, error: "not_allowed" };
  const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, clientId));
  if (!client) return { ok: false, error: "not_found" };
  if (client.approvalRequired === required) return { ok: true };
  await tx.update(s.clients).set({ approvalRequired: required }).where(eq(s.clients.id, clientId));
  await audit(tx, actor, [{ action: "update", entityType: "client", entityId: clientId, before: { approvalRequired: client.approvalRequired }, after: { approvalRequired: required } }]);
  return { ok: true };
}
