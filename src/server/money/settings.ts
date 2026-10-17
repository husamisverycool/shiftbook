/**
 * The agency's rules for wage access and invoice funding (docs/patterns/settings/money.md), kept as
 * dated agency settings like every other threshold (CLAUDE.md: rates and thresholds in data with
 * effective dates). A change starts today; one made again the same day replaces it. Only the Owner
 * changes them ("money" ability). Every change is audited.
 */
import { addDays } from "@shiftbook/rules";
import { and, eq, isNull } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { can } from "../permissions";
import { lockPayrollSettings } from "../run/period-lock";
import type { Actor } from "../session";
import { DEFAULT_FUNDING, type FundingRules } from "./funding";
import { DEFAULT_WAGE_ACCESS, type WageAccessRules } from "./wage-access";

export const WAGE_ACCESS_KEY = "money.wage_access";
export const FUNDING_KEY = "money.funding";

export type MoneySettingsProblem = { field: string; rule: "range" | "type" };
export type MoneySettingsResult = { ok: true } | { ok: false; error: "not_allowed" } | { ok: false; error: "invalid"; problems: MoneySettingsProblem[] };

const int = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;

async function current(tx: Tx, key: string) {
  const [row] = await tx.select().from(s.agencySettings).where(and(eq(s.agencySettings.key, key), isNull(s.agencySettings.effectiveTo)));
  return row ?? null;
}

export async function wageAccessRules(tx: Tx): Promise<WageAccessRules> {
  const v = (await current(tx, WAGE_ACCESS_KEY))?.value as Partial<WageAccessRules> | undefined;
  return { ...DEFAULT_WAGE_ACCESS, ...(v ?? {}) };
}

export async function fundingRules(tx: Tx): Promise<FundingRules> {
  const v = (await current(tx, FUNDING_KEY))?.value as Partial<FundingRules> | undefined;
  return { ...DEFAULT_FUNDING, ...(v ?? {}) };
}

export function wageAccessProblems(v: unknown): MoneySettingsProblem[] {
  const r = (v ?? {}) as Record<string, unknown>;
  const problems: MoneySettingsProblem[] = [];
  if (typeof r.enabled !== "boolean") problems.push({ field: "enabled", rule: "type" });
  // At most the whole of what was earned (the CFPB opinion: never more than accrued wages).
  if (!int(r.capBps, 100, 10_000)) problems.push({ field: "capBps", rule: "range" });
  if (!int(r.maxPerRequestCents, 0, 100_000_00)) problems.push({ field: "maxPerRequestCents", rule: "range" });
  if (!int(r.expeditedFeeCents, 0, 100_00)) problems.push({ field: "expeditedFeeCents", rule: "range" });
  return problems;
}

export function fundingProblems(v: unknown): MoneySettingsProblem[] {
  const r = (v ?? {}) as Record<string, unknown>;
  const problems: MoneySettingsProblem[] = [];
  if (typeof r.enabled !== "boolean") problems.push({ field: "enabled", rule: "type" });
  if (!int(r.advanceBps, 100, 10_000)) problems.push({ field: "advanceBps", rule: "range" });
  if (!int(r.feeBps, 0, 2_000)) problems.push({ field: "feeBps", rule: "range" });
  if (!int(r.maxConcentrationBps, 100, 10_000)) problems.push({ field: "maxConcentrationBps", rule: "range" });
  if (!int(r.maxAgeDays, 1, 365)) problems.push({ field: "maxAgeDays", rule: "range" });
  if (typeof r.requireClientApproval !== "boolean") problems.push({ field: "requireClientApproval", rule: "type" });
  return problems;
}

/** From today: the rule in force ends yesterday and the new one starts today (the same day: replaced). */
async function change(tx: Tx, actor: Actor, key: string, value: Record<string, unknown>, today: string) {
  await lockPayrollSettings(tx, actor.agencyId, "exclusive");
  const was = await current(tx, key);
  if (was && was.effectiveFrom >= today) {
    await tx.update(s.agencySettings).set({ value }).where(eq(s.agencySettings.id, was.id));
    await audit(tx, actor, [{ action: "update", entityType: "agency_setting", entityId: was.id, before: { key, value: was.value }, after: { key, value, effectiveFrom: was.effectiveFrom } }]);
    return;
  }
  if (was) await tx.update(s.agencySettings).set({ effectiveTo: addDays(today, -1) }).where(eq(s.agencySettings.id, was.id));
  const [row] = await tx.insert(s.agencySettings).values({ agencyId: actor.agencyId, key, value, effectiveFrom: today }).returning({ id: s.agencySettings.id });
  await audit(tx, actor, [{ action: was ? "update" : "create", entityType: "agency_setting", entityId: row!.id, before: was ? { key, value: was.value } : undefined, after: { key, value, effectiveFrom: today } }]);
}

const pick = <T extends object>(v: unknown, keys: (keyof T)[]) => Object.fromEntries(keys.map((k) => [k, (v as Record<string, unknown>)[k as string]])) as Record<string, unknown>;

export async function setWageAccessRules(tx: Tx, actor: Actor, v: unknown, today: string): Promise<MoneySettingsResult> {
  if (!can(actor, "money")) return { ok: false, error: "not_allowed" };
  const problems = wageAccessProblems(v);
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  await change(tx, actor, WAGE_ACCESS_KEY, pick<WageAccessRules>(v, ["enabled", "capBps", "maxPerRequestCents", "expeditedFeeCents"]), today);
  return { ok: true };
}

export async function setFundingRules(tx: Tx, actor: Actor, v: unknown, today: string): Promise<MoneySettingsResult> {
  if (!can(actor, "money")) return { ok: false, error: "not_allowed" };
  const problems = fundingProblems(v);
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  await change(tx, actor, FUNDING_KEY, pick<FundingRules>(v, ["enabled", "advanceBps", "feeBps", "maxConcentrationBps", "maxAgeDays", "requireClientApproval"]), today);
  return { ok: true };
}
