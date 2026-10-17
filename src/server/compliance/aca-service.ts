/**
 * The Owner's ACA changes (slice j step 3c, decision J8): the measurement settings, from today and
 * checked against the limits in force, and the hours imported from before Granite. Each works the
 * duties out again at once. Audited.
 */
import { addDays, addMonths, floorDiv, isIsoDate, mod } from "@shiftbook/rules";
import { and, eq, isNull } from "drizzle-orm";
import { audit } from "../audit";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { lockCompliance } from "../run/period-lock";
import type { Actor } from "../session";
import { acaSettingsProblem, type AcaSettings } from "./aca";
import { ACA_SETTINGS_KEY, acaLimitsOn, acaSettingsOn, paidCoverage } from "./aca-data";
import { mayChangeComplianceSettings, setFromToday, type ComplianceResult } from "./service";
import { syncObligations } from "./sync";

/** The measurement settings from today (the Owner), checked against the limits in force. */
export async function setAcaSettings(tx: Tx, actor: Actor, input: AcaSettings, today: string): Promise<ComplianceResult> {
  if (!mayChangeComplianceSettings(actor)) return { ok: false, error: "not_allowed" };
  const limits = await acaLimitsOn(tx, today);
  if (!limits) return { ok: false, error: "invalid", field: "rule" };
  const value = { measurementMonths: input.measurementMonths, firstMonth: input.firstMonth, adminDays: input.adminDays, stabilityMonths: input.stabilityMonths };
  const problem = acaSettingsProblem(value, limits);
  if (problem) return { ok: false, error: "invalid", field: problem };
  await lockCompliance(tx, actor.agencyId);
  const current = await acaSettingsOn(tx, today);
  if (current && JSON.stringify(current.settings) === JSON.stringify(value)) return { ok: true };
  await setFromToday(tx, actor, ACA_SETTINGS_KEY, value, today);
  await syncObligations(tx, actor.agencyId, today);
  return { ok: true };
}

export type ImportProblem = { row: number; reason: "worker" | "month" | "hours" | "columns" | "duplicate" | "empty" | "too_many" | "paid" };
export type ImportResult = { ok: true; rows: number } | { ok: false; error: "not_allowed" } | { ok: false; error: "invalid"; problems: ImportProblem[] };

/** Whole hours with optional thousands commas, or h:mm. */
const HOURS = /^(\d{1,3}(?:,\d{3})+|\d+)(?::([0-5]\d))?$/;
/** Hours with one or two decimals ("162.5", "162.25"), when they make whole minutes. */
const DECIMAL_HOURS = /^(\d+)\.(\d{1,2})$/;
const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** A month as a spreadsheet may write it — 2025-10, 2025-10-01, 10/2025, 10/1/2025, Oct-25, October 2025 — as its first day, or null. */
export function parseMonth(text: string): string | null {
  const v = text.trim();
  let year: number | null = null;
  let month: number | null = null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{1,2})(?:-0?1)?$/.exec(v))) [year, month] = [Number(m[1]), Number(m[2])];
  else if ((m = /^(\d{1,2})\/(?:0?1\/)?(\d{4})$/.exec(v))) [year, month] = [Number(m[2]), Number(m[1])];
  else if ((m = /^([A-Za-z]{3,9})\.?[- ](\d{2}|\d{4})$/.exec(v))) {
    const name = m[1]!.toLowerCase();
    // A month's English name or its first three letters ("Sept" too).
    const i = MONTH_NAMES.findIndex((n) => n === name || n.slice(0, 3) === name || (n === "september" && name === "sept"));
    if (i >= 0) [year, month] = [m[2]!.length === 2 ? 2000 + Number(m[2]) : Number(m[2]), i + 1];
  }
  if (year === null || month === null || month < 1 || month > 12) return null;
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  return isIsoDate(first) ? first : null;
}

/** Hours as whole hours, h:mm or a decimal that makes whole minutes, in minutes; or null. */
export function parseHours(text: string): number | null {
  const v = text.trim();
  const h = HOURS.exec(v);
  if (h) return Number(h[1]!.replace(/,/g, "")) * 60 + Number(h[2] ?? "0");
  const d = DECIMAL_HOURS.exec(v);
  if (!d) return null;
  const scale = d[2]!.length === 1 ? 10 : 100;
  const part = Number(d[2]) * 60;
  return mod(part, scale) === 0 ? Number(d[1]) * 60 + floorDiv(part, scale) : null;
}
/** At most every hour of a month (the table's check): a typing check, not a rule. */
const MAX_MONTH_MINUTES = 44_640;
const MAX_ROWS = 5000;

/** A CSV line's cells, quotes understood. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const nameKey = (v: string) => v.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
const monthEnd = (first: string) => addDays(addMonths(first, 1), -1);

/**
 * Hours from before Granite: a CSV with the columns Worker, Month and Hours, and optionally Payroll
 * ID (an ID the worker has in any payroll system on file, for two workers of one name). Months as a
 * spreadsheet writes them; hours whole, h:mm or decimal. Only months that have ended, and not one
 * Granite paid in full for the worker (its hours would count twice); for a month Granite paid in
 * part, the hours outside the weeks it paid. Nothing is saved unless every row is good; a month already
 * on file for the worker is replaced (kept as replaced).
 */
export async function importAcaHours(tx: Tx, actor: Actor, filename: string, text: string, today: string): Promise<ImportResult> {
  if (!mayChangeComplianceSettings(actor)) return { ok: false, error: "not_allowed" };
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  const head = (lines[0] ? cells(lines[0]) : []).map((h) => h.toLowerCase());
  const at = { worker: head.indexOf("worker"), month: head.indexOf("month"), hours: head.indexOf("hours"), payrollId: head.indexOf("payroll id") };
  if (at.worker < 0 || at.month < 0 || at.hours < 0) return { ok: false, error: "invalid", problems: [{ row: 1, reason: "columns" }] };
  if (lines.length < 2) return { ok: false, error: "invalid", problems: [{ row: 1, reason: "empty" }] };
  if (lines.length > MAX_ROWS + 1) return { ok: false, error: "invalid", problems: [{ row: 1, reason: "too_many" }] };
  await lockCompliance(tx, actor.agencyId);
  const workers = await tx.select({ id: s.workers.id, firstName: s.workers.firstName, lastName: s.workers.lastName, payrollIds: s.workers.payrollIds }).from(s.workers);
  const byName = new Map<string, string[]>();
  const byPayrollId = new Map<string, string[]>();
  for (const w of workers) {
    const k = nameKey(`${w.firstName} ${w.lastName}`);
    byName.set(k, [...(byName.get(k) ?? []), w.id]);
    for (const p of new Set(Object.values(w.payrollIds).map((x) => x?.id.trim().toLowerCase()).filter((x): x is string => Boolean(x)))) byPayrollId.set(p, [...(byPayrollId.get(p) ?? []), w.id]);
  }
  // A month Granite paid in full for a worker is on file already.
  const paid = await paidCoverage(tx);
  const paidInFull = (workerId: string, first: string) => {
    const last = monthEnd(first);
    let day = first;
    for (const p of paid.filter((x) => !x.except?.includes(workerId))) {
      if (p.start <= day && day <= p.end) day = addDays(p.end, 1);
      if (day > last) return true;
    }
    return false;
  };
  const problems: ImportProblem[] = [];
  const rows: { workerId: string; month: string; minutes: number }[] = [];
  const seen = new Set<string>();
  lines.slice(1).forEach((line, i) => {
    const c = cells(line);
    const row = i + 2;
    const payrollId = at.payrollId >= 0 ? (c[at.payrollId] ?? "").trim().toLowerCase() : "";
    const ids = payrollId ? (byPayrollId.get(payrollId) ?? []) : (byName.get(nameKey(c[at.worker] ?? "")) ?? []);
    const month = parseMonth(c[at.month] ?? "");
    const minutes = parseHours(c[at.hours] ?? "");
    if (ids.length !== 1) return problems.push({ row, reason: "worker" });
    // A whole month that has ended: never one still running or to come.
    if (month === null || monthEnd(month) >= today) return problems.push({ row, reason: "month" });
    if (minutes === null || !Number.isSafeInteger(minutes) || minutes > MAX_MONTH_MINUTES) return problems.push({ row, reason: "hours" });
    if (paidInFull(ids[0]!, month)) return problems.push({ row, reason: "paid" });
    const key = `${ids[0]}|${month}`;
    if (seen.has(key)) return problems.push({ row, reason: "duplicate" });
    seen.add(key);
    rows.push({ workerId: ids[0]!, month, minutes });
  });
  if (problems.length > 0) return { ok: false, error: "invalid", problems: problems.slice(0, 50) };
  const source = filename.trim().slice(0, 200) || "import";
  const now = new Date();
  for (const r of rows) {
    await tx
      .update(s.acaMonthlyHours)
      .set({ replacedAt: now })
      .where(and(eq(s.acaMonthlyHours.workerId, r.workerId), eq(s.acaMonthlyHours.month, r.month), isNull(s.acaMonthlyHours.replacedAt)));
  }
  await tx.insert(s.acaMonthlyHours).values(rows.map((r) => ({ agencyId: actor.agencyId, ...r, source, createdBy: actor.userId, createdByLabel: actor.label })));
  await audit(tx, actor, [{ action: "create", entityType: "aca_monthly_hours", entityId: actor.agencyId, after: { source, rows: rows.length } }]);
  await syncObligations(tx, actor.agencyId, today);
  return { ok: true, rows: rows.length };
}
