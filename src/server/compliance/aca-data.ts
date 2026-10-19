/**
 * The ACA look-back's data (slice j step 3c, decision J8; docs/patterns/compliance/aca.md): the dated
 * limits (aca_rules), the agency's dated measurement settings, the hours of service Tabulado paid,
 * the days it has hours for, and the months imported from before it. Reads only; the Owner's changes
 * are in aca-service.ts.
 *
 * Hours of service (26 C.F.R. § 54.4980H-1(a)(24)): each hour paid for work — the shifts the latest
 * paid version of each period paid, as that run recorded them (an edit in a correction not yet paid
 * does not count) — and each hour paid for a holiday with no work, on the holiday a person confirmed.
 * Premiums, guarantees and bonuses are pay, not hours. A worker's days on file are the paid periods'
 * days (less those whose run skipped them) and the months imported for them.
 */
import { addDays, addMonths, floorDiv, isEffective } from "@shiftbook/rules";
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { doneRuns, type DoneRun } from "../payroll/paid-lines";
import { acaRows, type AcaLimits, type AcaRow, type AcaSettings, type AcaShow, type Covered, type ServiceDay, type ServiceMonth } from "./aca";

/** The agency's measurement settings, dated (an agency setting). */
export const ACA_SETTINGS_KEY = "aca.lookback";
const PAID_NO_DUTIES = ["HOL_NOT_WORKED"] as const;

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export interface AcaRuleRow extends AcaLimits {
  citation: string;
  sourceUrl: string;
}

export async function acaLimitsOn(tx: Tx, date: string): Promise<AcaRuleRow | null> {
  const rows = await tx.select().from(s.acaRules);
  const r = rows.find((x) => isEffective(date, x.effectiveFrom, x.effectiveTo));
  return r
    ? { minMeasurementMonths: r.minMeasurementMonths, maxMeasurementMonths: r.maxMeasurementMonths, maxAdminDays: r.maxAdminDays, minStabilityMonths: r.minStabilityMonths, fullTimeMinutesPerWeek: r.fullTimeMinutesPerWeek, breakWeeks: r.breakWeeks, citation: r.citation, sourceUrl: r.sourceUrl }
    : null;
}

const asSettings = (v: unknown): AcaSettings | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const n = (k: string) => (Number.isInteger(o[k]) ? (o[k] as number) : NaN);
  const out = { measurementMonths: n("measurementMonths"), firstMonth: n("firstMonth"), adminDays: n("adminDays"), stabilityMonths: n("stabilityMonths") };
  return Object.values(out).every((x) => Number.isInteger(x)) ? out : null;
};

/** The settings in force on a date, with when they began and who set them (from the log). */
export async function acaSettingsOn(tx: Tx, date: string): Promise<{ settings: AcaSettings; from: string } | null> {
  const rows = await tx.select().from(s.agencySettings).where(eq(s.agencySettings.key, ACA_SETTINGS_KEY));
  const r = rows.find((x) => isEffective(date, x.effectiveFrom, x.effectiveTo));
  const settings = r ? asSettings(r.value) : null;
  return r && settings ? { settings, from: r.effectiveFrom } : null;
}

/** The paid periods: every day in them has its hours on file, except for the workers their run skipped. */
export async function paidCoverage(tx: Tx, latest?: DoneRun[]): Promise<Covered[]> {
  const runs = latest ?? (await doneRuns(tx)).latest;
  if (runs.length === 0) return [];
  const rows = await tx
    .select({ start: s.payPeriods.startsOn, end: s.payPeriods.endsOn, skipped: s.payRuns.skipped })
    .from(s.payRuns)
    .innerJoin(s.payPeriods, eq(s.payPeriods.id, s.payRuns.payPeriodId))
    .where(inArray(s.payRuns.id, runs.map((r) => r.id)));
  return rows.map((r) => ({ start: r.start, end: r.end, ...(r.skipped.length > 0 ? { except: r.skipped.map((x) => x.workerId).sort(cmp) } : {}) })).sort((a, b) => cmp(a.start, b.start));
}

/** The hours of service Tabulado paid, per worker and day. */
export async function paidService(tx: Tx, latest?: DoneRun[]): Promise<ServiceDay[]> {
  const runs = latest ?? (await doneRuns(tx)).latest;
  if (runs.length === 0) return [];
  const ids = runs.map((r) => r.id);
  const out = new Map<string, number>();
  const add = (workerId: string, date: string, minutes: number) => out.set(`${workerId}|${date}`, (out.get(`${workerId}|${date}`) ?? 0) + minutes);
  // Worked time: the shifts each run paid, as it recorded them (its input), per worker and day.
  const worked = await tx.execute<{ worker_id: string; date: string; minutes: number }>(sql`
    select sh->>'workerId' as worker_id, sh->>'date' as date, sum((sh->>'minutes')::int)::int as minutes
    from pay_runs r, jsonb_array_elements(coalesce(r.snapshot->'input'->'shifts', '[]'::jsonb)) sh
    where r.id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
      and coalesce((sh->>'reportedOnly')::boolean, false) = false
      and (sh->>'minutes')::int > 0
    group by 1, 2`);
  for (const r of worked) add(r.worker_id, r.date, r.minutes);
  // A holiday not worked: on the holidays confirmed in its week, shared evenly (the first takes any remainder minute).
  const holidays = await tx
    .select({ workerId: s.payLines.workerId, assignmentId: s.payLines.assignmentId, minutes: s.payLines.minutes, workweekStart: s.payLines.workweekStart })
    .from(s.payLines)
    .where(and(inArray(s.payLines.payRunId, ids), inArray(s.payLines.type, [...PAID_NO_DUTIES])));
  const paidHolidays = holidays.filter((l) => l.minutes > 0);
  if (paidHolidays.length > 0) {
    const weeks = paidHolidays.map((l) => l.workweekStart).sort(cmp);
    const confirmed = await tx
      .select({ workerId: s.premiumConfirmations.workerId, assignmentId: s.premiumConfirmations.assignmentId, workDate: s.premiumConfirmations.workDate })
      .from(s.premiumConfirmations)
      .where(and(eq(s.premiumConfirmations.kind, "holiday_not_worked"), gte(s.premiumConfirmations.workDate, weeks[0]!), lte(s.premiumConfirmations.workDate, addDays(weeks.at(-1)!, 6))));
    for (const l of paidHolidays) {
      const dates = [...new Set(confirmed.filter((c) => c.workerId === l.workerId && c.assignmentId === l.assignmentId && c.workDate >= l.workweekStart && c.workDate <= addDays(l.workweekStart, 6)).map((c) => c.workDate))].sort(cmp);
      if (dates.length === 0) {
        add(l.workerId, l.workweekStart, l.minutes);
        continue;
      }
      const share = floorDiv(l.minutes, dates.length);
      dates.forEach((d, i) => add(l.workerId, d, share + (i === 0 ? l.minutes - share * dates.length : 0)));
    }
  }
  return [...out]
    .map(([k, minutes]) => {
      const [workerId, date] = k.split("|") as [string, string];
      return { workerId, date, minutes };
    })
    .sort((a, b) => cmp(a.workerId, b.workerId) || cmp(a.date, b.date));
}

export async function importedMonths(tx: Tx): Promise<ServiceMonth[]> {
  const rows = await tx.select().from(s.acaMonthlyHours).where(isNull(s.acaMonthlyHours.replacedAt));
  return rows.map((r) => ({ workerId: r.workerId, month: r.month, minutes: r.minutes })).sort((a, b) => cmp(a.workerId, b.workerId) || cmp(a.month, b.month));
}

/** What the imports hold: months on file, for how many workers, from when to when, and the latest import. */
export async function importsSummary(tx: Tx) {
  const rows = await tx.select().from(s.acaMonthlyHours).where(isNull(s.acaMonthlyHours.replacedAt));
  if (rows.length === 0) return null;
  const months = rows.map((r) => r.month).sort(cmp);
  const last = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
  return { rows: rows.length, workers: new Set(rows.map((r) => r.workerId)).size, from: months[0]!, through: addDays(addMonths(months.at(-1)!, 1), -1), source: last.source, by: last.createdByLabel, at: last.createdAt.toISOString() };
}

export type AcaInputs = { error: "no_rule" } | { error: "no_settings"; limits: AcaRuleRow } | { error: null; limits: AcaRuleRow; settings: AcaSettings; settingsFrom: string; rows: AcaRow[]; covered: Covered[] };

/** Everything the look-back needs, or why it cannot be worked out. */
export async function acaInputs(tx: Tx, today: string): Promise<AcaInputs> {
  const [limits, settings] = await Promise.all([acaLimitsOn(tx, today), acaSettingsOn(tx, today)]);
  if (!limits) return { error: "no_rule" };
  if (!settings) return { error: "no_settings", limits };
  const { latest } = await doneRuns(tx);
  const [workers, days, months, covered] = await Promise.all([tx.select({ id: s.workers.id, firstName: s.workers.firstName, lastName: s.workers.lastName, hireDate: s.workers.hireDate }).from(s.workers), paidService(tx, latest), importedMonths(tx), paidCoverage(tx, latest)]);
  return {
    error: null,
    limits,
    settings: settings.settings,
    settingsFrom: settings.from,
    covered,
    rows: acaRows({ today, settings: settings.settings, limits, workers: workers.map((w) => ({ id: w.id, name: `${w.firstName} ${w.lastName}`, hireDate: w.hireDate })), days, months, covered }),
  };
}

/** The cycles measured full-time, for their "offer coverage by" duties, with the weekly average they met; none until the settings are entered. */
export async function acaOffers(tx: Tx, today: string): Promise<{ rows: AcaRow[]; fullTimeMinutesPerWeek: number }> {
  const inputs = await acaInputs(tx, today);
  return inputs.error === null ? { rows: inputs.rows.filter((r) => r.result === "full_time"), fullTimeMinutesPerWeek: inputs.limits.fullTimeMinutesPerWeek } : { rows: [], fullTimeMinutesPerWeek: 0 };
}

export { ACA_SHOWS, type AcaShow } from "./aca";

/** The ACA tab: the settings and limits in force, the hours on file, and the rows Show and search keep, each full-time one with its duty. */
export async function acaView(tx: Tx, today: string, q: { show: AcaShow; q: string }) {
  const inputs = await acaInputs(tx, today);
  const imports = await importsSummary(tx);
  if (inputs.error !== null) return { state: inputs.error, limits: "limits" in inputs ? inputs.limits : null, imports, settings: null, settingsFrom: null, paid: null, rows: [], total: 0 };
  const duties = await tx.select({ id: s.obligations.id, workerId: s.obligations.workerId, occurrence: s.obligations.occurrence, status: s.obligations.status }).from(s.obligations).where(eq(s.obligations.kind, "aca_offer"));
  const dutyOf = (r: AcaRow) => duties.find((d) => d.workerId === r.workerId && d.occurrence === `${r.cycle}:${r.measurementStart}`) ?? null;
  const needle = q.q.trim().toLowerCase();
  const rows = inputs.rows.filter((r) => (q.show === "all" || r.result === q.show) && (needle === "" || r.workerName.toLowerCase().includes(needle))).map((r) => ({ ...r, duty: r.result === "full_time" ? dutyOf(r) : null }));
  const paid = inputs.covered.length > 0 ? { from: inputs.covered[0]!.start, through: inputs.covered.map((c) => c.end).sort(cmp).at(-1)!, periods: inputs.covered.length } : null;
  return { state: "ready" as const, limits: inputs.limits, imports, settings: inputs.settings, settingsFrom: inputs.settingsFrom, paid, rows, total: inputs.rows.length };
}
export type AcaView = Awaited<ReturnType<typeof acaView>>;
