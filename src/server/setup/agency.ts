/**
 * The agency's own setup (completeness audit): its business details (Gusto's company details: legal
 * name, address, phone; the reply-to address on invoices and emails), its time zone, the day its pay
 * week starts, and its branches (Linear's settings rows; Gusto's locations list). Only the Owner
 * changes them (the permissions table's `settings`).
 *
 * Patterns: docs/patterns/settings/agency.md, docs/patterns/settings/branches.md,
 * docs/patterns/settings/payroll.md (the pay week).
 */
import { addDays, workweekStart, type Weekday } from "@shiftbook/rules";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { can } from "../permissions";
import { lockCatalog } from "../run/period-lock";
import type { Actor } from "../session";
import { agencyToday, settingOn } from "../settings";
import type { FieldProblem } from "./clients";

export const maySetUp = (actor: Pick<Actor, "role">) => can(actor, "settings");

/** The US time zones an agency chooses from (IANA names; the ones US payroll systems offer). */
export const TIME_ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Puerto_Rico"] as const;
export const TIME_ZONE_KEY = "time_zone";
export const WORKWEEK_KEY = "workweek_starts_on";

export interface AgencyDetails {
  name: string;
  addressLines: string[];
  phone: string | null;
  email: string | null;
  timeZone: string;
}

const PRINTABLE = (v: string, max: number) => v.length >= 1 && v.length <= max && v.trim() === v && !/[\u0000-\u001f\u007f]/.test(v);
const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]+$/;

export function agencyProblems(value: unknown): FieldProblem[] {
  const v = (value ?? {}) as Partial<Record<keyof AgencyDetails, unknown>>;
  const out: FieldProblem[] = [];
  if (typeof v.name !== "string" || !PRINTABLE(v.name, 200)) out.push({ field: "name", rule: "required" });
  const lines = v.addressLines;
  if (!Array.isArray(lines) || lines.length > 4 || lines.some((l) => typeof l !== "string" || !PRINTABLE(l, 200))) out.push({ field: "addressLines", rule: "address" });
  if (v.phone !== null && (typeof v.phone !== "string" || !/^[0-9+().\- ]{7,25}$/.test(v.phone))) out.push({ field: "phone", rule: "phone" });
  if (v.email !== null && (typeof v.email !== "string" || v.email.length > 254 || !EMAIL.test(v.email))) out.push({ field: "email", rule: "email" });
  if (!TIME_ZONES.includes(v.timeZone as (typeof TIME_ZONES)[number])) out.push({ field: "timeZone", rule: "time_zone" });
  return out;
}

export interface AgencyView {
  name: string;
  addressLines: string[];
  phone: string | null;
  email: string | null;
  timeZone: string | null;
  workweekStartsOn: Weekday | null;
  /** Whether the pay week's day can still change (no hours filed and no run yet). */
  workweekChangeable: boolean;
}

export async function agencyView(tx: Tx, agencyId: string): Promise<AgencyView> {
  const [a] = await tx.select().from(s.agencies).where(eq(s.agencies.id, agencyId));
  const today = await agencyToday(tx);
  const zone = await settingOn<string>(tx, TIME_ZONE_KEY, today);
  const week = await settingOn<number>(tx, WORKWEEK_KEY, today);
  return {
    name: a!.name,
    addressLines: a!.addressLines,
    phone: a!.phone,
    email: a!.email,
    timeZone: typeof zone === "string" ? zone : null,
    workweekStartsOn: typeof week === "number" ? (week as Weekday) : null,
    workweekChangeable: !(await periodsInUse(tx)),
  };
}

/** Replaces a setting from `from` on: rows in force on or after that day end the day before (or go). */
async function putSetting(tx: Tx, actor: Actor, key: string, value: unknown, from: string): Promise<void> {
  const rows = await tx.select().from(s.agencySettings).where(eq(s.agencySettings.key, key));
  for (const r of rows) {
    if (r.effectiveFrom >= from) await tx.delete(s.agencySettings).where(eq(s.agencySettings.id, r.id));
    else if (r.effectiveTo === null || r.effectiveTo >= from) await tx.update(s.agencySettings).set({ effectiveTo: addDays(from, -1) }).where(eq(s.agencySettings.id, r.id));
  }
  const [row] = await tx.insert(s.agencySettings).values({ agencyId: actor.agencyId, key, value, effectiveFrom: from }).returning({ id: s.agencySettings.id });
  const before = rows.find((r) => r.effectiveFrom <= from && (r.effectiveTo === null || from <= r.effectiveTo));
  await audit(tx, actor, [{ action: before ? "update" : "create", entityType: "agency_setting", entityId: row!.id, before: before ? { key, value: before.value } : undefined, after: { key, value, effectiveFrom: from } }]);
}

export type SetupResult = { ok: true } | { ok: false; error: "not_allowed" | "not_found" | "in_use" | "name_taken" } | { ok: false; error: "invalid"; problems: FieldProblem[] };

/** Saves the business details (on invoices and emails) and the time zone ("today" for the agency). */
export async function saveAgencyDetails(tx: Tx, actor: Actor, value: unknown): Promise<SetupResult> {
  if (!maySetUp(actor)) return { ok: false, error: "not_allowed" };
  const problems = agencyProblems(value);
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const v = value as AgencyDetails;
  const [before] = await tx.select().from(s.agencies).where(eq(s.agencies.id, actor.agencyId));
  const after = { name: v.name, addressLines: v.addressLines, phone: v.phone, email: v.email };
  await tx.update(s.agencies).set(after).where(eq(s.agencies.id, actor.agencyId));
  await audit(tx, actor, [{ action: "update", entityType: "agency", entityId: actor.agencyId, before: { name: before!.name, addressLines: before!.addressLines, phone: before!.phone, email: before!.email }, after }]);
  const today = await agencyToday(tx);
  if ((await settingOn<string>(tx, TIME_ZONE_KEY, today)) !== v.timeZone) await putSetting(tx, actor, TIME_ZONE_KEY, v.timeZone, today);
  return { ok: true };
}

/** Whether any pay period has hours filed or a run: its weeks are then fixed (overtime is counted by them). */
async function periodsInUse(tx: Tx): Promise<boolean> {
  const [runs] = await tx.select({ n: count() }).from(s.payRuns);
  if ((runs?.n ?? 0) > 0) return true;
  const [entries] = await tx.select({ n: count() }).from(s.timeEntries);
  return (entries?.n ?? 0) > 0;
}

/**
 * Sets the day the pay week starts (the workweek overtime is counted in: 29 C.F.R. § 778.105). It can
 * change only before any hours are filed or any run made — afterwards weeks already counted would no
 * longer line up, which the FLSA allows only as a permanent change made with care; the page says so.
 * Empty pay periods of the old week are removed, and the current and previous weeks made again.
 */
export async function setWorkweekStart(tx: Tx, actor: Actor, day: unknown): Promise<SetupResult> {
  if (!maySetUp(actor)) return { ok: false, error: "not_allowed" };
  if (typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6) return { ok: false, error: "invalid", problems: [{ field: "workweekStartsOn", rule: "weekday" }] };
  await lockCatalog(tx, actor.agencyId, "exclusive");
  if (await periodsInUse(tx)) return { ok: false, error: "in_use" };
  await putSetting(tx, actor, WORKWEEK_KEY, day, "2000-01-01");
  await tx.delete(s.payPeriods);
  await ensurePayPeriods(tx, actor.agencyId, await agencyToday(tx));
  return { ok: true };
}

/**
 * Makes sure the current and the previous pay week exist (opening Convert timesheets calls this):
 * idempotent and safe when two pages ask at once (the unique start day; a week overlapping another
 * period is skipped). Nothing happens until the pay week's day is set, nor for the demo agency. Returns
 * the weeks made.
 */
export async function ensurePayPeriods(tx: Tx, agencyId: string, today: string): Promise<string[]> {
  // The demo keeps its two pay periods (SPEC §18); its weeks are the sample timesheets'.
  const [agency] = await tx.select({ isDemo: s.agencies.isDemo }).from(s.agencies).where(eq(s.agencies.id, agencyId));
  if (!agency || agency.isDemo) return [];
  const day = await settingOn<number>(tx, WORKWEEK_KEY, today);
  if (typeof day !== "number") return [];
  const current = workweekStart(today, day as Weekday);
  return insertWeeks(tx, agencyId, [addDays(current, -7), current]);
}

async function insertWeeks(tx: Tx, agencyId: string, starts: string[]): Promise<string[]> {
  const made: string[] = [];
  for (const startsOn of starts) {
    const endsOn = addDays(startsOn, 6);
    const [overlap] = await tx
      .select({ n: count() })
      .from(s.payPeriods)
      .where(and(sql`${s.payPeriods.startsOn} <= ${endsOn}`, sql`${s.payPeriods.endsOn} >= ${startsOn}`));
    if ((overlap?.n ?? 0) > 0) continue;
    const rows = await tx.insert(s.payPeriods).values({ agencyId, startsOn, endsOn }).onConflictDoNothing().returning({ id: s.payPeriods.id });
    if (rows.length > 0) made.push(startsOn);
  }
  return made;
}

export type StartPeriodResult = { ok: true; id: string } | { ok: false; error: "not_allowed" | "no_workweek" | "future" | "exists" | "date" };

/** Starts the pay period of an earlier week (a week paid late, or before Tabulado was used). */
export async function startPayPeriod(tx: Tx, actor: Actor, date: unknown): Promise<StartPeriodResult> {
  if (!can(actor, "hours")) return { ok: false, error: "not_allowed" };
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "date" };
  const today = await agencyToday(tx);
  const day = await settingOn<number>(tx, WORKWEEK_KEY, today);
  if (typeof day !== "number") return { ok: false, error: "no_workweek" };
  const startsOn = workweekStart(date, day as Weekday);
  if (startsOn > workweekStart(today, day as Weekday)) return { ok: false, error: "future" };
  const made = await insertWeeks(tx, actor.agencyId, [startsOn]);
  const [row] = await tx.select({ id: s.payPeriods.id }).from(s.payPeriods).where(eq(s.payPeriods.startsOn, startsOn));
  if (made.length === 0) return row ? { ok: false, error: "exists" } : { ok: false, error: "exists" };
  await audit(tx, actor, [{ action: "create", entityType: "pay_period", entityId: row!.id, after: { startsOn, endsOn: addDays(startsOn, 6) } }]);
  return { ok: true, id: row!.id };
}

// ---------- branches ----------

export interface BranchRow {
  id: string;
  name: string;
  archived: boolean;
  /** Job orders counted in this branch's margin. */
  jobOrders: number;
}

export async function listBranches(tx: Tx): Promise<BranchRow[]> {
  const rows = await tx.select().from(s.branches).orderBy(asc(s.branches.name));
  const counts = rows.length > 0 ? await tx.select({ branchId: s.jobOrders.branchId, n: count() }).from(s.jobOrders).where(inArray(s.jobOrders.branchId, rows.map((r) => r.id))).groupBy(s.jobOrders.branchId) : [];
  return rows
    .map((r) => ({ id: r.id, name: r.name, archived: r.archivedAt !== null, jobOrders: Number(counts.find((c) => c.branchId === r.id)?.n ?? 0) }))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
}

const branchName = (v: unknown) => typeof v === "string" && PRINTABLE(v, 100);

async function nameTaken(tx: Tx, name: string, except: string | null): Promise<boolean> {
  const rows = await tx.select({ id: s.branches.id }).from(s.branches).where(and(sql`lower(${s.branches.name}) = lower(${name})`, isNull(s.branches.archivedAt)));
  return rows.some((r) => r.id !== except);
}

export async function createBranch(tx: Tx, actor: Actor, name: unknown): Promise<SetupResult & { id?: string }> {
  if (!maySetUp(actor)) return { ok: false, error: "not_allowed" };
  if (!branchName(name)) return { ok: false, error: "invalid", problems: [{ field: "name", rule: "required" }] };
  if (await nameTaken(tx, name as string, null)) return { ok: false, error: "name_taken" };
  const [row] = await tx.insert(s.branches).values({ agencyId: actor.agencyId, name: name as string }).returning({ id: s.branches.id });
  await audit(tx, actor, [{ action: "create", entityType: "branch", entityId: row!.id, after: { name } }]);
  return { ok: true, id: row!.id };
}

export async function renameBranch(tx: Tx, actor: Actor, id: string, name: unknown): Promise<SetupResult> {
  if (!maySetUp(actor)) return { ok: false, error: "not_allowed" };
  if (!branchName(name)) return { ok: false, error: "invalid", problems: [{ field: "name", rule: "required" }] };
  const [before] = await tx.select().from(s.branches).where(eq(s.branches.id, id));
  if (!before) return { ok: false, error: "not_found" };
  if (await nameTaken(tx, name as string, id)) return { ok: false, error: "name_taken" };
  await tx.update(s.branches).set({ name: name as string }).where(eq(s.branches.id, id));
  await audit(tx, actor, [{ action: "update", entityType: "branch", entityId: id, before: { name: before.name }, after: { name } }]);
  return { ok: true };
}

/** Archives a branch (or brings it back): it leaves the pickers; margin and registrations keep naming it. */
export async function setBranchArchived(tx: Tx, actor: Actor, id: string, archived: boolean): Promise<SetupResult> {
  if (!maySetUp(actor)) return { ok: false, error: "not_allowed" };
  const [before] = await tx.select().from(s.branches).where(eq(s.branches.id, id));
  if (!before) return { ok: false, error: "not_found" };
  if ((before.archivedAt !== null) === archived) return { ok: true };
  if (!archived && (await nameTaken(tx, before.name, id))) return { ok: false, error: "name_taken" };
  await tx.update(s.branches).set({ archivedAt: archived ? new Date() : null }).where(eq(s.branches.id, id));
  await audit(tx, actor, [{ action: "update", entityType: "branch", entityId: id, before: { archived: !archived }, after: { archived } }]);
  return { ok: true };
}
