/**
 * Payroll file settings (slice f, decision F1): the payroll system the agency's files are made for,
 * the system's code for each kind of pay, and each worker's id there. One system at a time; a change
 * applies to every file not made yet. Every change keeps a dated row (the settings history) and an
 * audit event; only the Owner changes them.
 *
 * Pattern for the page: docs/patterns/settings/payroll.md.
 */
import type { EarningType } from "@shiftbook/rules";
import { and, eq, isNull } from "drizzle-orm";
import { codeMapProblems, defaultCodes, EXPORT_FORMATS, idKey, SYSTEM_OF, targetProblems, workerIdProblem, type CodeMap, type ExportFormat, type PayrollSystem, type PayrollTarget, type SettingProblem } from "../../exports/targets";
import { addDays } from "@shiftbook/rules";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { StaleRequestError } from "../errors";
import { lockPayrollSettings } from "../run/period-lock";
import type { Actor } from "../session";
import { can } from "../permissions";

export const TARGET_KEY = "payroll.target";
export const codesKey = (format: ExportFormat) => `earning_code_map.${format}`;

const mayChange = (actor: Actor) => can(actor, "settings");
export type SettingsResult = { ok: true } | { ok: false; error: "not_allowed" } | { ok: false; error: "invalid"; problems: SettingProblem[] };

/** The setting in use now: the one row with no end date. */
export async function currentSetting(tx: Tx, key: string): Promise<{ id: string; value: unknown; effectiveFrom: string; createdAt: Date } | null> {
  const rows = await tx.select().from(s.agencySettings).where(and(eq(s.agencySettings.key, key), isNull(s.agencySettings.effectiveTo)));
  if (rows.length > 1) throw new Error(`Agency setting ${key} has ${rows.length} rows in use.`);
  const row = rows[0];
  return row ? { id: row.id, value: row.value, effectiveFrom: row.effectiveFrom, createdAt: row.createdAt } : null;
}

/**
 * Replaces the setting in use from today: the current row ends yesterday and a new one starts today,
 * or — when the current row started today — it is updated in place. `expectedId` is the row the
 * person saw (null: none); anything else in use means another tab changed it first.
 */
async function changeSetting(tx: Tx, actor: Actor, key: string, value: unknown, today: string, expectedId: string | null | undefined): Promise<void> {
  // One save at a time: a second save waits, then sees the first one's row and is refused as stale.
  await lockPayrollSettings(tx, actor.agencyId, "exclusive");
  const current = await currentSetting(tx, key);
  if (expectedId !== undefined && (current?.id ?? null) !== expectedId) throw new StaleRequestError();
  if (current && current.effectiveFrom >= today) {
    // Changed again the same day: the row is replaced (a new id, so a page drawn from the old one is
    // stale); the audit log keeps what it held.
    await tx.delete(s.agencySettings).where(eq(s.agencySettings.id, current.id));
    const [row] = await tx.insert(s.agencySettings).values({ agencyId: actor.agencyId, key, value, effectiveFrom: current.effectiveFrom }).returning();
    await audit(tx, actor, [{ action: "update", entityType: "agency_setting", entityId: row!.id, before: { key, value: current.value, settingId: current.id }, after: { key, value, effectiveFrom: current.effectiveFrom } }]);
    return;
  }
  if (current) await tx.update(s.agencySettings).set({ effectiveTo: addDays(today, -1) }).where(eq(s.agencySettings.id, current.id));
  const [row] = await tx.insert(s.agencySettings).values({ agencyId: actor.agencyId, key, value, effectiveFrom: today }).returning();
  await audit(tx, actor, [{ action: current ? "update" : "create", entityType: "agency_setting", entityId: row!.id, before: current ? { key, value: current.value, settingId: current.id } : undefined, after: { key, value, effectiveFrom: today } }]);
}

/** The payroll system in use, or null when none is chosen yet. */
export async function payrollTarget(tx: Tx): Promise<PayrollTarget | null> {
  const row = await currentSetting(tx, TARGET_KEY);
  if (!row) return null;
  if (targetProblems(row.value).length > 0) throw new Error(`The stored payroll target is not valid: ${JSON.stringify(row.value)}`);
  return row.value as PayrollTarget;
}

/** Gusto's map is stored as earning type → column (slice a); every other system as codes. */
function toCodes(format: ExportFormat, value: unknown): CodeMap {
  if (format !== "gusto_hours_csv") return value as CodeMap;
  const out: CodeMap = {};
  for (const [kind, column] of Object.entries(value as Record<string, string>)) out[kind as EarningType] = { code: column, as: column === "bonus" ? "dollars" : "hours" };
  return out;
}
function fromCodes(format: ExportFormat, codes: CodeMap): unknown {
  if (format !== "gusto_hours_csv") return codes;
  return Object.fromEntries(Object.entries(codes).filter(([, c]) => c && c.code !== "").map(([kind, c]) => [kind, c!.code]));
}

/** The codes in use for a format (its defaults when none were saved), with the row they came from. */
/**
 * The codes in use for a format (its defaults when none were saved). They are checked as when saved:
 * a stored code today's rules refuse (saved under older rules) is left out of `codes`, so the run
 * names the worker whose pay it would carry, and is shown with its problem on the settings page.
 */
export async function payrollCodes(tx: Tx, format: ExportFormat): Promise<{ id: string | null; codes: CodeMap; stored: CodeMap; problems: SettingProblem[] }> {
  const row = await currentSetting(tx, codesKey(format));
  if (!row) return { id: null, codes: defaultCodes(format), stored: defaultCodes(format), problems: [] };
  const stored = row.value && typeof row.value === "object" ? toCodes(format, row.value) : {};
  const problems = codeMapProblems(format, stored);
  const bad = new Set(problems.map((p) => p.field.split(".")[1]));
  const codes = Object.fromEntries(Object.entries(stored).filter(([kind]) => !bad.has(kind))) as CodeMap;
  return { id: row.id, codes, stored, problems };
}

/** Gusto's stored map as the Gusto exporter reads it. */
export async function gustoColumns(tx: Tx): Promise<Partial<Record<EarningType, string>>> {
  const row = await currentSetting(tx, codesKey("gusto_hours_csv"));
  return (row?.value as Partial<Record<EarningType, string>> | undefined) ?? (fromCodes("gusto_hours_csv", defaultCodes("gusto_hours_csv")) as Partial<Record<EarningType, string>>);
}

export async function setPayrollTarget(tx: Tx, actor: Actor, target: unknown, today: string, expectedId: string | null): Promise<SettingsResult> {
  if (!mayChange(actor)) return { ok: false, error: "not_allowed" };
  const problems = targetProblems(target);
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  await changeSetting(tx, actor, TARGET_KEY, normalTarget(target as PayrollTarget), today, expectedId);
  return { ok: true };
}

/** Only the fields the system uses are kept. */
function normalTarget(t: PayrollTarget): PayrollTarget {
  switch (t.format) {
    case "gusto_hours_csv":
      return { format: t.format };
    case "qbd_iif":
      return t.version === "2022_or_later" ? { format: t.format, version: t.version } : { format: t.format, version: t.version, companyName: t.companyName, companyCreateTime: t.companyCreateTime };
    case "qbo_time_csv":
      return { format: t.format, customer: t.customer };
    case "adp_wfn_paydata":
    case "adp_run_csv":
      return { format: t.format, companyCode: t.companyCode };
    case "paychex_flex_csv":
      return { format: t.format, clientId: t.clientId };
    case "paylocity_time_csv":
      return { format: t.format };
    case "spreadsheet_csv":
      return {
        format: t.format,
        layout: {
          fileName: t.layout.fileName,
          delimiter: t.layout.delimiter,
          header: t.layout.header,
          dateFormat: t.layout.dateFormat,
          columns: t.layout.columns.map((c) => ({ field: c.field, header: c.header, ...(c.field === "fixed" ? { value: c.value ?? "" } : {}) })),
        },
      };
  }
}

export async function setPayrollCodes(tx: Tx, actor: Actor, format: ExportFormat, codes: unknown, today: string, expectedId: string | null): Promise<SettingsResult> {
  if (!mayChange(actor)) return { ok: false, error: "not_allowed" };
  if (!EXPORT_FORMATS.includes(format)) return { ok: false, error: "invalid", problems: [{ field: "format", rule: "choose_system", message: "Choose a payroll system." }] };
  // A blank code is "not set": dropped, so the kind's fallback applies.
  const cleaned: CodeMap = {};
  if (!codes || typeof codes !== "object" || Array.isArray(codes)) return { ok: false, error: "invalid", problems: [{ field: "codes", rule: "set_codes", message: "Set the codes." }] };
  for (const [kind, c] of Object.entries(codes as CodeMap)) {
    if (!c) continue;
    if (typeof c !== "object" || typeof c.code !== "string") return { ok: false, error: "invalid", problems: [{ field: `codes.${kind}`, rule: "code_text", message: "A code is text." }] };
    const fixed = defaultCodes(format)[kind as EarningType];
    if (c.code === "" && !(format === "spreadsheet_csv") && !fixed) continue;
    cleaned[kind as EarningType] = { code: c.code, as: c.as, ...(c.factor ? { factor: c.factor } : {}) };
  }
  const problems = codeMapProblems(format, cleaned);
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  await changeSetting(tx, actor, codesKey(format), fromCodes(format, cleaned), today, expectedId);
  return { ok: true };
}

export type WorkerIdResult = SettingsResult | { ok: false; error: "taken"; by: string } | { ok: false; error: "not_found" };

/** Sets (or, with an empty id, clears) a worker's id in a payroll system. */
export async function setWorkerPayrollId(tx: Tx, actor: Actor, workerId: string, system: PayrollSystem, id: string, title?: string): Promise<WorkerIdResult> {
  // The Owner's and Coordinators' (decision 0027; not the Recruiter's); the settings page's tab is the Owner's.
  if (!can(actor, "employment")) return { ok: false, error: "not_allowed" };
  // Two people setting the same id on two workers at once: the second waits and sees the first.
  await lockPayrollSettings(tx, actor.agencyId, "exclusive");
  if (!Object.values(SYSTEM_OF).includes(system)) return { ok: false, error: "invalid", problems: [{ field: "system", rule: "choose_system", message: "Choose a payroll system." }] };
  const workers = await tx.select().from(s.workers);
  const worker = workers.find((w) => w.id === workerId);
  if (!worker) return { ok: false, error: "not_found" };
  const before = worker.payrollIds[system];
  const next = { ...worker.payrollIds };
  if (id === "") {
    delete next[system];
  } else {
    const problem = workerIdProblem(system, id, title);
    if (problem) return { ok: false, error: "invalid", problems: [problem] };
    // One id, one person: the system would put both workers' pay on one record.
    const other = workers.find((w) => w.id !== workerId && w.payrollIds[system] && idKey(system, w.payrollIds[system]!.id) === idKey(system, id));
    if (other) return { ok: false, error: "taken", by: `${other.firstName} ${other.lastName}` };
    next[system] = { id, ...(system === "gusto" && title ? { title } : {}) };
  }
  if (JSON.stringify(before ?? null) === JSON.stringify(next[system] ?? null)) return { ok: true };
  await tx.update(s.workers).set({ payrollIds: next }).where(eq(s.workers.id, workerId));
  await audit(tx, actor, [{ action: "update", entityType: "worker", entityId: workerId, before: { payrollIds: { [system]: before ?? null } }, after: { payrollIds: { [system]: next[system] ?? null } } }]);
  return { ok: true };
}
