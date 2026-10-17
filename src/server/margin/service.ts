/**
 * Margin settings and the fields margin groups by (slice i; decisions I3, I10, I11;
 * docs/patterns/settings/margin.md). Rates are kept by date: a new rate starts on a date, the one
 * before it ends the day before (Bullhorn: start and end, never deleted); one starting the same day
 * replaces it. Only the Owner changes rates and the pay day; recruiter and branch are changed by
 * anyone who manages placements, never the read-only accountant. Every change is audited.
 */
import { isIsoDate } from "@shiftbook/rules";
import { and, eq, isNull } from "drizzle-orm";
import { audit } from "../audit";
import { planInsert, type Dated } from "../catalog/versions";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { PAY_DAY_KEY } from "../payroll/paid-lines";
import { lockCatalog } from "../run/period-lock";
import type { Actor } from "../session";
import { can } from "../permissions";

/** SPEC §2: the Owner sees margin; the read-only accountant reads everything. */
export const mayViewMargin = (actor: Actor) => can(actor, "viewMargin");
export const mayChangeMargin = (actor: Actor) => can(actor, "settings");
export { PAY_DAY_KEY };
export const mayChangePlacement = (actor: Actor) => can(actor, "placements");

export const OT_PREMIUM_KEY = "margin.wc_excludes_ot_premium";

export interface MarginProblem {
  field: "state" | "classCode" | "description" | "ratePpm" | "includes" | "effectiveFrom" | "days";
  rule: string;
}

export type MarginResult = { ok: true } | { ok: false; error: "not_allowed" | "not_found" } | { ok: false; error: "invalid"; problems: MarginProblem[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATE = /^[A-Z]{2}$/;
const ppm = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 1_000_000;
const text = (v: unknown, max: number) => v === null || v === undefined || (typeof v === "string" && v.trim().length <= max);
const clean = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Inserts a dated row among its versions (same start: replaced) and audits it. */
async function insertDated<T extends Dated>(
  tx: Tx,
  actor: Actor,
  entityType: string,
  versions: T[],
  from: string,
  replace: (row: T) => Promise<void>,
  end: (id: string, effectiveTo: string | null) => Promise<void>,
  insert: (effectiveTo: string | null) => Promise<string>,
  after: Record<string, unknown>,
) {
  const same = versions.find((v) => v.effectiveFrom === from);
  if (same) {
    await replace(same);
    await audit(tx, actor, [{ action: "update", entityType, entityId: same.id, before: { ...same }, after: { ...after, effectiveFrom: from } }]);
    return;
  }
  const plan = planInsert(versions, from);
  if (!plan.ok) throw new Error("A rate already starts that day.");
  for (const u of plan.updates) await end(u.id, u.effectiveTo);
  const id = await insert(plan.effectiveTo);
  await audit(tx, actor, [
    { action: "create", entityType, entityId: id, after: { ...after, effectiveFrom: from, effectiveTo: plan.effectiveTo } },
    ...plan.updates.map((u) => ({ action: "update" as const, entityType, entityId: u.id, before: { effectiveTo: versions.find((v) => v.id === u.id)!.effectiveTo }, after: { effectiveTo: u.effectiveTo }, reason: `ended by the rate from ${from}` })),
  ]);
}

export interface TaxRateInput {
  state: string | null;
  ratePpm: number;
  includes: string | null;
  effectiveFrom: string;
}

export async function addTaxRate(tx: Tx, actor: Actor, input: unknown): Promise<MarginResult> {
  if (!mayChangeMargin(actor)) return { ok: false, error: "not_allowed" };
  const v = (input ?? {}) as Partial<TaxRateInput>;
  const problems: MarginProblem[] = [];
  if (v.state !== null && !(typeof v.state === "string" && STATE.test(v.state))) problems.push({ field: "state", rule: "state" });
  if (!ppm(v.ratePpm)) problems.push({ field: "ratePpm", rule: "percent" });
  if (!text(v.includes, 200)) problems.push({ field: "includes", rule: "too_long" });
  if (typeof v.effectiveFrom !== "string" || !isIsoDate(v.effectiveFrom)) problems.push({ field: "effectiveFrom", rule: "date" });
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const state = v.state ?? null;
  const versions = await tx.select().from(s.burdenTaxRates).where(state === null ? isNull(s.burdenTaxRates.state) : eq(s.burdenTaxRates.state, state));
  const values = { ratePpm: v.ratePpm!, includes: clean(v.includes) };
  await insertDated(
    tx,
    actor,
    "burden_tax_rate",
    versions,
    v.effectiveFrom!,
    async (row) => void (await tx.update(s.burdenTaxRates).set({ ...values, createdAt: new Date(), createdBy: actor.userId, createdByLabel: actor.label }).where(eq(s.burdenTaxRates.id, row.id))),
    async (id, effectiveTo) => void (await tx.update(s.burdenTaxRates).set({ effectiveTo }).where(eq(s.burdenTaxRates.id, id))),
    async (effectiveTo) => (await tx.insert(s.burdenTaxRates).values({ agencyId: actor.agencyId, state, ...values, effectiveFrom: v.effectiveFrom!, effectiveTo, createdBy: actor.userId, createdByLabel: actor.label }).returning({ id: s.burdenTaxRates.id }))[0]!.id,
    { state, ...values },
  );
  return { ok: true };
}

export interface WcRateInput {
  state: string;
  classCode: string;
  description: string | null;
  ratePpm: number;
  effectiveFrom: string;
}

export async function addWcRate(tx: Tx, actor: Actor, input: unknown): Promise<MarginResult> {
  if (!mayChangeMargin(actor)) return { ok: false, error: "not_allowed" };
  const v = (input ?? {}) as Partial<WcRateInput>;
  const problems: MarginProblem[] = [];
  if (!(typeof v.state === "string" && STATE.test(v.state))) problems.push({ field: "state", rule: "state" });
  // As the rate card takes it (src/server/catalog/versions.ts).
  if (!(typeof v.classCode === "string" && /^[A-Za-z0-9.-]{1,12}$/.test(v.classCode.trim()))) problems.push({ field: "classCode", rule: "class_code" });
  if (!text(v.description, 120)) problems.push({ field: "description", rule: "too_long" });
  if (!ppm(v.ratePpm)) problems.push({ field: "ratePpm", rule: "per_hundred" });
  if (typeof v.effectiveFrom !== "string" || !isIsoDate(v.effectiveFrom)) problems.push({ field: "effectiveFrom", rule: "date" });
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const classCode = v.classCode!.trim();
  const versions = await tx.select().from(s.wcRates).where(and(eq(s.wcRates.state, v.state!), eq(s.wcRates.classCode, classCode)));
  const values = { ratePpm: v.ratePpm!, description: clean(v.description) };
  await insertDated(
    tx,
    actor,
    "wc_rate",
    versions,
    v.effectiveFrom!,
    async (row) => void (await tx.update(s.wcRates).set({ ...values, createdAt: new Date(), createdBy: actor.userId, createdByLabel: actor.label }).where(eq(s.wcRates.id, row.id))),
    async (id, effectiveTo) => void (await tx.update(s.wcRates).set({ effectiveTo }).where(eq(s.wcRates.id, id))),
    async (effectiveTo) => (await tx.insert(s.wcRates).values({ agencyId: actor.agencyId, state: v.state!, classCode, ...values, effectiveFrom: v.effectiveFrom!, effectiveTo, createdBy: actor.userId, createdByLabel: actor.label }).returning({ id: s.wcRates.id }))[0]!.id,
    { state: v.state, classCode, ...values },
  );
  return { ok: true };
}

/** An agency setting from a date, kept by date like the rates. */
async function setDatedSetting(tx: Tx, actor: Actor, key: string, value: unknown, from: string) {
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const versions = await tx.select().from(s.agencySettings).where(eq(s.agencySettings.key, key));
  await insertDated(
    tx,
    actor,
    "agency_setting",
    versions,
    from,
    async (row) => void (await tx.update(s.agencySettings).set({ value }).where(eq(s.agencySettings.id, row.id))),
    async (id, effectiveTo) => void (await tx.update(s.agencySettings).set({ effectiveTo }).where(eq(s.agencySettings.id, id))),
    async (effectiveTo) => (await tx.insert(s.agencySettings).values({ agencyId: actor.agencyId, key, value, effectiveFrom: from, effectiveTo }).returning({ id: s.agencySettings.id }))[0]!.id,
    { key, value },
  );
}

export async function setOtPremium(tx: Tx, actor: Actor, exclude: unknown, from: unknown): Promise<MarginResult> {
  if (!mayChangeMargin(actor)) return { ok: false, error: "not_allowed" };
  if (typeof exclude !== "boolean" || typeof from !== "string" || !isIsoDate(from)) return { ok: false, error: "invalid", problems: [{ field: "effectiveFrom", rule: "date" }] };
  await setDatedSetting(tx, actor, OT_PREMIUM_KEY, exclude, from);
  return { ok: true };
}

export async function setPayDay(tx: Tx, actor: Actor, days: unknown, from: unknown): Promise<MarginResult> {
  if (!mayChangeMargin(actor)) return { ok: false, error: "not_allowed" };
  const problems: MarginProblem[] = [];
  // Up to four weeks after the period ends (pay in arrears; Gusto pay schedules).
  if (!(typeof days === "number" && Number.isSafeInteger(days) && days >= 0 && days <= 28)) problems.push({ field: "days", rule: "days" });
  if (typeof from !== "string" || !isIsoDate(from)) problems.push({ field: "effectiveFrom", rule: "date" });
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  await setDatedSetting(tx, actor, PAY_DAY_KEY, days, from as string);
  return { ok: true };
}

/** The recruiter whose placement it is (any user of the agency), or none. */
export async function setRecruiter(tx: Tx, actor: Actor, assignmentId: string, userId: string | null): Promise<MarginResult> {
  // Who is credited with a placement's margin is not the Recruiter's to choose (security review, slice t).
  if (!can(actor, "placementTerms")) return { ok: false, error: "not_allowed" };
  if (!UUID.test(assignmentId) || (userId !== null && !UUID.test(userId))) return { ok: false, error: "not_found" };
  await lockCatalog(tx, actor.agencyId, "exclusive");
  const [a] = await tx.select().from(s.assignments).where(eq(s.assignments.id, assignmentId));
  if (!a) return { ok: false, error: "not_found" };
  if (userId !== null && (await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, userId))).length === 0) return { ok: false, error: "not_found" };
  if (a.recruiterUserId === userId) return { ok: true };
  await tx.update(s.assignments).set({ recruiterUserId: userId }).where(eq(s.assignments.id, assignmentId));
  await audit(tx, actor, [{ action: "update", entityType: "assignment", entityId: assignmentId, before: { recruiterUserId: a.recruiterUserId }, after: { recruiterUserId: userId } }]);
  return { ok: true };
}
