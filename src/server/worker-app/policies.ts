/**
 * The policies a worker acknowledges at onboarding (decision 0043; docs/patterns/settings/onboarding.md
 * — Rippling's handbook practice: sent to new hires to acknowledge, and an update rolls out to
 * everyone). The agency edits them in Settings › Onboarding; each change is a new version of the policy
 * from a date; a worker who acknowledged an older version is asked again. Until the agency saves one,
 * the three built-in policies apply; its first save keeps them as version 1 so what workers already
 * acknowledged still counts.
 */
import { asc, isNotNull } from "drizzle-orm";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { can } from "../permissions";
import type { Actor } from "../session";
import { agencyToday } from "../settings";

/** The built-in policies, used until the agency saves its own (version 1 of each when it does). */
export const DEFAULT_POLICIES = ["safety", "harassment", "timekeeping"] as const;
const BUILT_IN_FROM = "2000-01-01";

export interface Policy {
  key: string;
  version: number;
  titleEn: string;
  bodyEn: string;
  titleEs: string | null;
  bodyEs: string | null;
  required: boolean;
  effectiveFrom: string;
  /** One of the built-in three, never saved by this agency. */
  builtIn: boolean;
}

function builtIn(key: (typeof DEFAULT_POLICIES)[number]): Policy {
  return {
    key,
    version: 1,
    titleEn: en.onboardingPolicies.defaults[key],
    bodyEn: en.workerApp.onboarding.policies[key],
    titleEs: es.onboardingPolicies.defaults[key],
    bodyEs: es.workerApp.onboarding.policies[key],
    required: true,
    effectiveFrom: BUILT_IN_FROM,
    builtIn: true,
  };
}

const fromRow = (r: typeof s.onboardingPolicies.$inferSelect): Policy & { active: boolean } => ({
  key: r.policyKey,
  version: r.version,
  titleEn: r.titleEn,
  bodyEn: r.bodyEn,
  titleEs: r.titleEs,
  bodyEs: r.bodyEs,
  required: r.required,
  effectiveFrom: r.effectiveFrom,
  builtIn: false,
  active: r.active,
});

/** Every saved version, oldest first; empty while the agency uses the built-in policies. */
async function versions(tx: Tx) {
  return (await tx.select().from(s.onboardingPolicies).orderBy(asc(s.onboardingPolicies.policyKey), asc(s.onboardingPolicies.version))).map(fromRow);
}

/** The policies in force on a day: each key's latest version from that day on, unless it was removed. */
export async function currentPolicies(tx: Tx, today: string): Promise<Policy[]> {
  const all = await versions(tx);
  if (all.length === 0) return DEFAULT_POLICIES.map(builtIn);
  const latest = new Map<string, Policy & { active: boolean }>();
  for (const v of all) if (v.effectiveFrom <= today) latest.set(v.key, v);
  return [...latest.values()].filter((p) => p.active).map((p) => ({ key: p.key, version: p.version, titleEn: p.titleEn, bodyEn: p.bodyEn, titleEs: p.titleEs, bodyEs: p.bodyEs, required: p.required, effectiveFrom: p.effectiveFrom, builtIn: p.builtIn }));
}

/** Changes saved for a later day (shown in settings as "From {date}"). */
export async function upcomingPolicies(tx: Tx, today: string): Promise<(Policy & { active: boolean })[]> {
  return (await versions(tx)).filter((v) => v.effectiveFrom > today);
}

/** A worker's acknowledgment counts for the version it was given to (none recorded: version 1, as before versions existed). */
export function acknowledgedVersion(ack: { key: string; version?: number } | undefined): number | null {
  return ack ? (ack.version ?? 1) : null;
}

/** Required policies in force that the worker has not acknowledged in their current version. */
export function policiesDue(current: Policy[], acks: { key: string; version?: number; at: string }[]): Policy[] {
  const byKey = new Map(acks.map((a) => [a.key, a]));
  return current.filter((p) => p.required && acknowledgedVersion(byKey.get(p.key)) !== p.version);
}

export type PolicyProblem = "title_en" | "body_en" | "title_es" | "body_es" | "effective_from" | "key";
export type PolicyResult = { ok: true; key: string; version: number } | { ok: false; error: "forbidden" | "not_found" } | { ok: false; error: "invalid"; problems: PolicyProblem[] };

const text = (v: unknown, max: number): string | null | false => {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return false;
  const t = v.trim();
  return t === "" ? null : t.length > max ? false : t;
};
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const slug = (title: string) =>
  title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "policy";

/** The agency's first save keeps the built-in policies as its version 1 (what workers acknowledged still counts). */
async function keepBuiltIns(tx: Tx, actor: Actor) {
  if ((await versions(tx)).length > 0) return;
  await tx.insert(s.onboardingPolicies).values(
    DEFAULT_POLICIES.map(builtIn).map((p) => ({ agencyId: actor.agencyId, policyKey: p.key, version: 1, titleEn: p.titleEn, bodyEn: p.bodyEn, titleEs: p.titleEs, bodyEs: p.bodyEs, required: true, effectiveFrom: BUILT_IN_FROM, createdByLabel: actor.label })),
  );
}

/**
 * Adds a policy, or (with `key`) saves the next version of one, in force from `effectiveFrom` (today
 * or later: what workers already acknowledged is never rewritten). Owner and Coordinator.
 */
export async function savePolicy(tx: Tx, actor: Actor, input: { key?: unknown; titleEn: unknown; bodyEn: unknown; titleEs?: unknown; bodyEs?: unknown; required?: unknown; effectiveFrom: unknown }): Promise<PolicyResult> {
  if (!can(actor, "onboardingPolicies")) return { ok: false, error: "forbidden" };
  const today = await agencyToday(tx);
  const titleEn = text(input.titleEn, 120);
  const bodyEn = text(input.bodyEn, 4000);
  const titleEs = text(input.titleEs, 120);
  const bodyEs = text(input.bodyEs, 4000);
  const problems: PolicyProblem[] = [];
  if (!titleEn) problems.push("title_en");
  if (!bodyEn) problems.push("body_en");
  if (titleEs === false || (titleEs && !bodyEs)) problems.push("body_es");
  if (bodyEs === false || (bodyEs && !titleEs)) problems.push("title_es");
  if (!isDate(input.effectiveFrom) || input.effectiveFrom < today) problems.push("effective_from");
  if (input.key !== undefined && input.key !== null && (typeof input.key !== "string" || !/^[a-z0-9_]{1,40}$/.test(input.key))) problems.push("key");
  if (problems.length > 0) return { ok: false, error: "invalid", problems: [...new Set(problems)] };
  await keepBuiltIns(tx, actor);
  const all = await versions(tx);
  let key: string;
  if (typeof input.key === "string") {
    if (!all.some((v) => v.key === input.key)) return { ok: false, error: "not_found" };
    key = input.key;
  } else {
    const base = slug(titleEn as string);
    key = base;
    for (let n = 2; all.some((v) => v.key === key); n++) key = `${base.slice(0, 36)}_${n}`;
  }
  const before = all.filter((v) => v.key === key).at(-1) ?? null;
  const version = (before?.version ?? 0) + 1;
  const row = { agencyId: actor.agencyId, policyKey: key, version, titleEn: titleEn as string, bodyEn: bodyEn as string, titleEs: titleEs || null, bodyEs: bodyEs || null, required: input.required !== false, active: true, effectiveFrom: input.effectiveFrom as string, createdByLabel: actor.label };
  const [saved] = await tx.insert(s.onboardingPolicies).values(row).returning({ id: s.onboardingPolicies.id });
  await audit(tx, actor, [{ action: before ? "update" : "create", entityType: "onboarding_policy", entityId: saved!.id, before: before ? { key, version: before.version, title: before.titleEn } : null, after: { key, version, title: row.titleEn, required: row.required, effectiveFrom: row.effectiveFrom } }]);
  return { ok: true, key, version };
}

/** Removes a policy from a date (a version that is not active): workers are no longer asked it. */
export async function removePolicy(tx: Tx, actor: Actor, key: unknown, effectiveFrom: unknown): Promise<PolicyResult> {
  if (!can(actor, "onboardingPolicies")) return { ok: false, error: "forbidden" };
  const today = await agencyToday(tx);
  if (!isDate(effectiveFrom) || effectiveFrom < today) return { ok: false, error: "invalid", problems: ["effective_from"] };
  await keepBuiltIns(tx, actor);
  const mine = (await versions(tx)).filter((v) => v.key === key);
  const before = mine.at(-1);
  if (typeof key !== "string" || !before || !before.active) return { ok: false, error: "not_found" };
  const version = before.version + 1;
  const [saved] = await tx
    .insert(s.onboardingPolicies)
    .values({ agencyId: actor.agencyId, policyKey: key, version, titleEn: before.titleEn, bodyEn: before.bodyEn, titleEs: before.titleEs, bodyEs: before.bodyEs, required: before.required, active: false, effectiveFrom, createdByLabel: actor.label })
    .returning({ id: s.onboardingPolicies.id });
  await audit(tx, actor, [{ action: "delete", entityType: "onboarding_policy", entityId: saved!.id, before: { key, version: before.version, title: before.titleEn }, after: { key, version, removedFrom: effectiveFrom } }]);
  return { ok: true, key, version };
}

/** Settings › Onboarding: what is in force today, what changes later, and how many workers each still owes. */
export async function policiesView(tx: Tx) {
  const today = await agencyToday(tx);
  const current = await currentPolicies(tx, today);
  const upcoming = await upcomingPolicies(tx, today);
  // Workers who reached the policies step: those still to acknowledge a policy's current version.
  const rows = await tx.select({ policies: s.workerOnboarding.policies }).from(s.workerOnboarding).where(isNotNull(s.workerOnboarding.policiesAt));
  const due = new Map(current.map((p) => [p.key, rows.filter((r) => policiesDue([p], r.policies).length > 0).length]));
  return { today, current: current.map((p) => ({ ...p, owing: due.get(p.key) ?? 0 })), upcoming };
}
