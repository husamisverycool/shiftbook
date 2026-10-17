/**
 * Rate cards (SPEC §4, §8; docs/patterns/job-orders/[id].md). A job order has a card; an assignment
 * may have its own card for one worker, which applies on the dates its versions cover (the job
 * order's card applies on the other dates). Versions follow `versions.ts`; a version used by a paid
 * week is frozen. Every change is audited; editing an unused version needs a reason (Stripe).
 */
import { and, eq, isNull } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { can } from "../permissions";
import { lockCatalog } from "../run/period-lock";
import type { Actor } from "../session";
import { paidThrough } from "./paid";
import { billFromMarkup, billOf, isFrozen, planDelete, planInsert, rateProblems, type RateInput, type RateProblem } from "./versions";

export const RATE_EDIT_REASONS = ["wrong_from_start", "client_agreed", "data_entry", "other"] as const;

export type RateError = "not_found" | "invalid" | "same_start" | "paid" | "earliest" | "reason_required" | "note_required" | "not_allowed";
export type RateResult = { ok: true; id: string } | { ok: false; error: RateError; problems?: RateProblem[]; paidThrough?: string };

/** Which card: the job order's (assignmentId null), or one assignment's own. */
export interface CardRef {
  jobOrderId: string;
  assignmentId: string | null;
}

type Version = typeof s.rateCards.$inferSelect;

async function cardOf(tx: Tx, ref: { jobOrderId: string } | { assignmentId: string }): Promise<CardRef | null> {
  if ("assignmentId" in ref) {
    const [a] = await tx.select({ jobOrderId: s.assignments.jobOrderId }).from(s.assignments).where(eq(s.assignments.id, ref.assignmentId));
    return a ? { jobOrderId: a.jobOrderId, assignmentId: ref.assignmentId } : null;
  }
  const [j] = await tx.select({ id: s.jobOrders.id }).from(s.jobOrders).where(eq(s.jobOrders.id, ref.jobOrderId));
  return j ? { jobOrderId: j.id, assignmentId: null } : null;
}

export async function versionsOf(tx: Tx, card: CardRef): Promise<Version[]> {
  const rows = await tx
    .select()
    .from(s.rateCards)
    .where(and(eq(s.rateCards.jobOrderId, card.jobOrderId), card.assignmentId ? eq(s.rateCards.assignmentId, card.assignmentId) : isNull(s.rateCards.assignmentId)));
  return rows.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0));
}

/** The last paid day of the work this card prices: the assignment's, or every assignment's on the job order. */
export async function cardPaidThrough(tx: Tx, card: CardRef): Promise<string | null> {
  if (card.assignmentId) return paidThrough(tx, [card.assignmentId]);
  const rows = await tx.select({ id: s.assignments.id }).from(s.assignments).where(eq(s.assignments.jobOrderId, card.jobOrderId));
  return paidThrough(tx, rows.map((r) => r.id));
}

function reasonText(reasons: string[], note: string): { ok: true; text: string } | { ok: false; error: "reason_required" | "note_required" } {
  const chosen = [...new Set(reasons)].filter((r) => (RATE_EDIT_REASONS as readonly string[]).includes(r));
  if (chosen.length === 0) return { ok: false, error: "reason_required" };
  if (chosen.includes("other") && note.trim() === "") return { ok: false, error: "note_required" };
  return { ok: true, text: chosen.map((r) => (r === "other" ? `other: ${note.trim()}` : r)).join(", ") + (note.trim() && !chosen.includes("other") ? `: ${note.trim()}` : "") };
}

/** The row to store (call only after `rateProblems` found nothing, so the bill is exactly one kind). */
function values(input: RateInput) {
  const bill = billOf(input)!;
  const fromMarkup = "markupBp" in bill ? billFromMarkup(input.payRateCents, bill.markupBp) : null;
  return {
    row: {
      effectiveFrom: input.effectiveFrom,
      payRateCents: input.payRateCents,
      billRateCents: fromMarkup ? fromMarkup.rateCents : (bill as { rateCents: number }).rateCents,
      markupBp: "markupBp" in bill ? bill.markupBp : null,
      otMultiplierNum: input.otMultiplier.num,
      otMultiplierDen: input.otMultiplier.den,
      dtMultiplierNum: input.dtMultiplier.num,
      dtMultiplierDen: input.dtMultiplier.den,
      wcClassCode: input.wcClassCode,
      diffName: input.terms?.differential ? input.terms.differential.name.trim() : null,
      diffPayCents: input.terms?.differential?.payCents ?? null,
      diffBillCents: input.terms?.differential?.billCents ?? null,
      diffStartMinute: input.terms?.differential?.startMinute ?? null,
      diffEndMinute: input.terms?.differential?.endMinute ?? null,
      diffDays: input.terms?.differential ? [...input.terms.differential.days].sort((a, b) => a - b) : [],
      contractMinimumMinutes: input.terms?.contractMinimumMinutes ?? null,
      billsContractMinimum: input.terms?.contractMinimumMinutes ? input.terms.billsContractMinimum : false,
    },
    explain: fromMarkup?.explain ?? null,
  };
}

async function setEnds(tx: Tx, updates: { id: string; effectiveTo: string | null }[]) {
  for (const u of updates) await tx.update(s.rateCards).set({ effectiveTo: u.effectiveTo }).where(eq(s.rateCards.id, u.id));
}

/** Adds a version (Bullhorn "New version"); it must start after the card's last paid day. */
export async function addRateVersion(tx: Tx, actor: Actor, ref: { jobOrderId: string } | { assignmentId: string }, input: RateInput): Promise<RateResult> {
  if (!can(actor, "placementTerms")) return { ok: false, error: "not_allowed" };
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const card = await cardOf(tx, ref);
  if (!card) return { ok: false, error: "not_found" };
  const problems = rateProblems(input);
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const paid = await cardPaidThrough(tx, card);
  if (isFrozen(input, paid)) return { ok: false, error: "paid", paidThrough: paid! };
  const versions = await versionsOf(tx, card);
  const plan = planInsert(versions, input.effectiveFrom);
  if (!plan.ok) return { ok: false, error: plan.error };
  await setEnds(tx, plan.updates);
  const { row, explain } = values(input);
  const [created] = await tx
    .insert(s.rateCards)
    .values({ agencyId: actor.agencyId, jobOrderId: card.jobOrderId, assignmentId: card.assignmentId, ...row, effectiveTo: plan.effectiveTo })
    .returning({ id: s.rateCards.id });
  await audit(tx, actor, [
    { action: "create", entityType: "rate_card", entityId: created!.id, after: { ...row, effectiveTo: plan.effectiveTo, jobOrderId: card.jobOrderId, assignmentId: card.assignmentId }, reason: explain },
    ...plan.updates.map((u) => ({ action: "update" as const, entityType: "rate_card", entityId: u.id, before: { effectiveTo: versions.find((v) => v.id === u.id)!.effectiveTo }, after: { effectiveTo: u.effectiveTo, jobOrderId: card.jobOrderId, assignmentId: card.assignmentId }, reason: `ended by the version from ${input.effectiveFrom}` })),
  ]);
  return { ok: true, id: created!.id };
}

/** Edits a version no paid week used, with a reason. Its start may move between its neighbours. */
export async function editRateVersion(tx: Tx, actor: Actor, versionId: string, input: RateInput, reasons: string[], note: string): Promise<RateResult> {
  if (!can(actor, "placementTerms")) return { ok: false, error: "not_allowed" };
  const reason = reasonText(reasons, note);
  if (!reason.ok) return reason;
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const [current] = await tx.select().from(s.rateCards).where(eq(s.rateCards.id, versionId));
  if (!current) return { ok: false, error: "not_found" };
  const problems = rateProblems(input);
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const card = { jobOrderId: current.jobOrderId, assignmentId: current.assignmentId };
  const paid = await cardPaidThrough(tx, card);
  if (isFrozen(current, paid) || isFrozen(input, paid)) return { ok: false, error: "paid", paidThrough: paid! };
  const versions = await versionsOf(tx, card);
  const others = versions.filter((v) => v.id !== versionId);
  // Moving the start: close the gap it leaves, then slot it in at its new start.
  const removal = planDelete(versions, versionId);
  // The earliest version may move its start, but not past the next one (that would leave a gap).
  if (!removal.ok && removal.error === "earliest" && input.effectiveFrom > others[0]!.effectiveFrom) return { ok: false, error: "earliest" };
  const afterRemoval = others.map((v) => ({ ...v, effectiveTo: removal.ok ? (removal.updates.find((u) => u.id === v.id)?.effectiveTo ?? v.effectiveTo) : v.effectiveTo }));
  const plan = planInsert(afterRemoval, input.effectiveFrom);
  if (!plan.ok) return { ok: false, error: plan.error };
  const ends = new Map<string, string | null>();
  if (removal.ok) for (const u of removal.updates) ends.set(u.id, u.effectiveTo);
  for (const u of plan.updates) ends.set(u.id, u.effectiveTo);
  const changed = [...ends].filter(([id, to]) => others.find((v) => v.id === id)!.effectiveTo !== to).map(([id, effectiveTo]) => ({ id, effectiveTo }));
  await setEnds(tx, changed);
  const { row, explain } = values(input);
  await tx.update(s.rateCards).set({ ...row, effectiveTo: plan.effectiveTo }).where(eq(s.rateCards.id, versionId));
  const before = { effectiveFrom: current.effectiveFrom, effectiveTo: current.effectiveTo, payRateCents: current.payRateCents, billRateCents: current.billRateCents, markupBp: current.markupBp };
  await audit(tx, actor, [
    { action: "update", entityType: "rate_card", entityId: versionId, before, after: { ...row, effectiveTo: plan.effectiveTo, ...card }, reason: explain ? `${reason.text} (${explain})` : reason.text },
    ...changed.map((u) => ({ action: "update" as const, entityType: "rate_card", entityId: u.id, before: { effectiveTo: others.find((v) => v.id === u.id)!.effectiveTo }, after: { effectiveTo: u.effectiveTo, ...card }, reason: "neighbouring version moved" })),
  ]);
  return { ok: true, id: versionId };
}

/** Deletes a version no paid week used; the one before it is extended over its dates (Bullhorn). */
export async function deleteRateVersion(tx: Tx, actor: Actor, versionId: string): Promise<RateResult> {
  if (!can(actor, "placementTerms")) return { ok: false, error: "not_allowed" };
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const [current] = await tx.select().from(s.rateCards).where(eq(s.rateCards.id, versionId));
  if (!current) return { ok: false, error: "not_found" };
  const card = { jobOrderId: current.jobOrderId, assignmentId: current.assignmentId };
  const paid = await cardPaidThrough(tx, card);
  if (isFrozen(current, paid)) return { ok: false, error: "paid", paidThrough: paid! };
  const versions = await versionsOf(tx, card);
  const plan = planDelete(versions, versionId);
  if (!plan.ok) return { ok: false, error: plan.error };
  await tx.delete(s.rateCards).where(eq(s.rateCards.id, versionId));
  await setEnds(tx, plan.updates);
  await audit(tx, actor, [
    { action: "delete", entityType: "rate_card", entityId: versionId, before: { effectiveFrom: current.effectiveFrom, effectiveTo: current.effectiveTo, payRateCents: current.payRateCents, billRateCents: current.billRateCents, ...card } },
    ...plan.updates.map((u) => ({ action: "update" as const, entityType: "rate_card", entityId: u.id, after: { effectiveTo: u.effectiveTo, ...card }, reason: "extended over a deleted version" })),
  ]);
  return { ok: true, id: versionId };
}
