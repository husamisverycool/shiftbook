/**
 * The ACA look-back measurement method (SPEC §16; slice j step 3c, decision J8; 26 C.F.R.
 * § 54.4980H-3(d)): who is full-time in a measurement period, so coverage is offered for the stability
 * period that follows. Pure; integer minutes and days; every limit is a dated rule row.
 *
 * One row per worker and cycle:
 * - Standard periods of `measurementMonths`, one after another from the first day of `firstMonth`
 *   in 2000 (so a length that does not divide a year never jumps at New Year): the latest that has
 *   ended (its result decides the stability period that follows), the one before it while a
 *   full-time result's stability period still runs, and the one running now — each for a worker
 *   employed from its first day ((d)(1); a new worker joins the standard periods once employed for a
 *   whole one, (d)(4)).
 * - A new worker's initial period of the same length, from the first of the month after the start
 *   (or the start, on a first), listed until its stability period is over. Its administrative period
 *   is at most 90 days in all, the days between the start and the initial period included
 *   ((d)(3)(vi)(A)), and ends by the last day of the first calendar month beginning on or after the
 *   first anniversary of the start ((d)(3)(vi)(B)).
 * - Full-time: on average at least 30 hours of service a week — minutes × 7 ≥ 1,800 × days (the
 *   limit row; § 54.4980H-1(a)(21)).
 * - At least 13 consecutive weeks with no hour of service is a break: the worker returns as new
 *   ((c)(4)(i)); a worker in such a break now is listed as on a break, not measured.
 * - Hours of service (§ 54.4980H-1(a)(24)): hours paid for work, and for holidays, vacation and
 *   illness with no work.
 *
 * A worker's hours are on file for the periods Tabulado paid them in (the caller's `covered`
 * periods, less a period's run that skipped them) and the months imported for them, a month of no
 * hours included. A period with days not on file is never decided on what is missing: an ended one is
 * "hours missing" from the first such day; a running one counts to the last day on file and says
 * from when hours are missing before it. A break is only seen across days on file; a worker in one
 * keeps the rows of periods already ended. The start date is the first hour of service
 * (§ 54.4980H-1(a)(47)): the hire date when it is before the hours on file, else the first day
 * worked; with no hire date, the first day worked when the 13 weeks before it are on file, else the
 * start is unknown and the worker is measured as one employed all along.
 */
import { addDays, addMonths, floorDiv, toDayNumber } from "@shiftbook/rules";

/** Standard periods count from the first month of this year (any year would do; one fixed origin keeps them in step). */
const ORIGIN_YEAR = 2000;
/** The start of a worker employed before the hours on file and with no hire date: before everything. */
const UNKNOWN_START = "0001-01-01";

export interface AcaSettings {
  measurementMonths: number;
  /** 1 (January) to 12. */
  firstMonth: number;
  adminDays: number;
  stabilityMonths: number;
}

export interface AcaLimits {
  minMeasurementMonths: number;
  maxMeasurementMonths: number;
  maxAdminDays: number;
  minStabilityMonths: number;
  fullTimeMinutesPerWeek: number;
  breakWeeks: number;
}

export interface ServiceDay {
  workerId: string;
  date: string;
  minutes: number;
}

/** Hours from before Tabulado: a whole month (its first day). */
export interface ServiceMonth {
  workerId: string;
  month: string;
  minutes: number;
}

/** A paid pay period: its days' hours are on file, except for the workers its run skipped. */
export interface Covered {
  start: string;
  end: string;
  except?: string[];
}

export interface AcaWorker {
  id: string;
  name: string;
  hireDate: string | null;
}

export type AcaResult = "full_time" | "not_full_time" | "measuring" | "missing_hours" | "on_break";

/** The ACA tab's Show filter: every row, or one result. */
export const ACA_SHOWS = ["all", "full_time", "not_full_time", "measuring", "missing_hours", "on_break"] as const;
export type AcaShow = (typeof ACA_SHOWS)[number];

export interface AcaRow {
  workerId: string;
  workerName: string;
  hireDate: string | null;
  cycle: "standard" | "initial";
  /** Decided once the period has ended with every day on file; "measuring" while it runs; "missing_hours" when days are not on file; "on_break" in a break now. */
  result: AcaResult;
  measurementStart: string;
  measurementEnd: string;
  /** Hours of service counted (while measuring, to `countedThrough`), in minutes. */
  minutes: number;
  days: number;
  /** The last day counted: the period's end, or while it runs the last day on file before yesterday. */
  countedThrough: string | null;
  /** Whole weeks in the period, for the eye; the test uses the days. */
  weeks: number;
  /** Average minutes a week, rounded down (the test is exact). */
  averageMinutesPerWeek: number;
  /** The first day in the period with no hours on file, if any. */
  missingFrom: string | null;
  /** Null when the period runs or there is no administrative period. */
  adminStart: string | null;
  adminEnd: string | null;
  stabilityStart: string | null;
  stabilityEnd: string | null;
  breakStart: string | null;
  breakEnd: string | null;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const firstOfMonth = (date: string) => `${date.slice(0, 7)}-01`;
const daysBetween = (from: string, to: string) => toDayNumber(to) - toDayNumber(from) + 1;
const monthEnd = (start: string, months: number) => addDays(addMonths(start, months), -1);

/** What is wrong with the settings against the limits in force, as the field to fix, or null. */
export function acaSettingsProblem(s: AcaSettings, l: AcaLimits): keyof AcaSettings | null {
  if (!Number.isInteger(s.measurementMonths) || s.measurementMonths < l.minMeasurementMonths || s.measurementMonths > l.maxMeasurementMonths) return "measurementMonths";
  if (!Number.isInteger(s.firstMonth) || s.firstMonth < 1 || s.firstMonth > 12) return "firstMonth";
  if (!Number.isInteger(s.adminDays) || s.adminDays < 0 || s.adminDays > l.maxAdminDays) return "adminDays";
  // At least the minimum and the measurement period; at most two years (a typing check).
  if (!Number.isInteger(s.stabilityMonths) || s.stabilityMonths < l.minStabilityMonths || s.stabilityMonths < s.measurementMonths || s.stabilityMonths > 24) return "stabilityMonths";
  return null;
}

/** The latest standard measurement period that has ended before `today`. */
export function latestStandardPeriod(s: AcaSettings, today: string): { start: string; end: string } {
  // Months from the origin to today's month; the period running today starts a whole number of periods in.
  const since = (Number(today.slice(0, 4)) - ORIGIN_YEAR) * 12 + (Number(today.slice(5, 7)) - s.firstMonth);
  const current = addMonths(`${ORIGIN_YEAR}-${String(s.firstMonth).padStart(2, "0")}-01`, floorDiv(since, s.measurementMonths) * s.measurementMonths);
  return { start: addMonths(current, -s.measurementMonths), end: addDays(current, -1) };
}

/** The days on file as merged runs, with the last day of the run a date falls in. */
function coverage(periods: Covered[]) {
  const runs: Covered[] = [];
  for (const p of [...periods].filter((x) => x.start <= x.end).sort((a, b) => cmp(a.start, b.start))) {
    const last = runs.at(-1);
    if (last && p.start <= addDays(last.end, 1)) {
      if (p.end > last.end) last.end = p.end;
    } else runs.push({ ...p });
  }
  /** The last day of the unbroken run of days on file from `from`, or null when `from` is not on file. */
  const runEnd = (from: string) => runs.find((r) => r.start <= from && from <= r.end)?.end ?? null;
  /** The first day of the unbroken run of days on file up to `to`, or null when `to` is not on file. */
  const runStart = (to: string) => runs.find((r) => r.start <= to && to <= r.end)?.start ?? null;
  /** The first day from `from` to `to` not on file, or null. */
  const firstMissing = (from: string, to: string) => {
    const end = runEnd(from);
    return end === null ? from : end >= to ? null : addDays(end, 1);
  };
  /** The latest day on file up to a date, or null. */
  const lastBy = (date: string) => {
    const r = runs.filter((x) => x.start <= date).at(-1);
    return r ? (r.end < date ? r.end : date) : null;
  };
  return { runEnd, runStart, firstMissing, lastBy };
}

function byWorker<T extends { workerId: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) out.set(r.workerId, [...(out.get(r.workerId) ?? []), r]);
  return out;
}

export function acaRows(args: { today: string; settings: AcaSettings; limits: AcaLimits; workers: AcaWorker[]; days: ServiceDay[]; months: ServiceMonth[]; covered: Covered[] }): AcaRow[] {
  const { today, settings: s, limits: l } = args;
  const yesterday = addDays(today, -1);
  const ended = latestStandardPeriod(s, today);
  const previous = { start: addMonths(ended.start, -s.measurementMonths), end: addDays(ended.start, -1) };
  const running = { start: addDays(ended.end, 1), end: monthEnd(addDays(ended.end, 1), s.measurementMonths) };
  const breakDays = l.breakWeeks * 7;
  const daysOf = byWorker(args.days);
  const monthsOf = byWorker(args.months);
  const rows: AcaRow[] = [];
  for (const w of [...args.workers].sort((a, b) => cmp(a.name, b.name) || cmp(a.id, b.id))) {
    const days = (daysOf.get(w.id) ?? []).filter((d) => d.minutes > 0 && d.date <= today);
    const imported = (monthsOf.get(w.id) ?? []).filter((m) => m.month <= today);
    const months = imported.filter((m) => m.minutes > 0);
    // This worker's days on file: the periods paid, less those whose run skipped them, and their own imported months (none worked included).
    const onFile = coverage([...args.covered.filter((c) => !c.except?.includes(w.id)), ...imported.map((m) => ({ start: m.month, end: monthEnd(m.month, 1) }))]);
    // A month from before Tabulado is service on its first and its last day (whole months, for breaks).
    const serviceDates = [...new Set([...days.map((d) => d.date), ...months.flatMap((m) => [m.month, monthEnd(m.month, 1)])])].sort(cmp);
    // Listed when there is something to measure: hours in the periods measured now, or a hire since.
    if (!serviceDates.some((d) => d >= ended.start) && !(w.hireDate !== null && w.hireDate >= ended.start)) continue;
    // The last break of 13 weeks or more that ended (between two days worked), and one running now (since the last), across days on file only.
    let returned: { start: string; end: string } | null = null;
    for (let i = 1; i < serviceDates.length; i += 1) {
      const from = addDays(serviceDates[i - 1]!, 1);
      const to = addDays(serviceDates[i]!, -1);
      if (daysBetween(from, to) >= breakDays && onFile.firstMissing(from, to) === null) returned = { start: from, end: to };
    }
    let breakNow: string | null = null;
    const lastDay = serviceDates.at(-1);
    if (lastDay !== undefined) {
      const from = addDays(lastDay, 1);
      const runEnd = onFile.runEnd(from);
      const to = runEnd === null ? null : runEnd < yesterday ? runEnd : yesterday;
      if (to !== null && daysBetween(from, to) >= breakDays) breakNow = from;
    }
    const firstWorked = serviceDates[0] ?? null;
    const hireOnFile = w.hireDate !== null && onFile.runEnd(w.hireDate) !== null;
    // Hired before the hours on file, with 13 weeks on file and no hours right before the first day worked: back from a break too.
    if (!returned && firstWorked !== null && w.hireDate !== null && !hireOnFile && w.hireDate < firstWorked) {
      const end = addDays(firstWorked, -1);
      const from = onFile.runStart(end);
      if (from !== null && daysBetween(from, end) >= breakDays) returned = { start: from, end };
    }
    // The start: after a break, the return; with a hire date before the hours on file, the hire date; with one on file, the first
    // day worked; with none, the first day worked when the 13 weeks before it are on file, else unknown (employed all along).
    const start = returned
      ? addDays(returned.end, 1)
      : w.hireDate !== null
        ? [hireOnFile ? (firstWorked ?? w.hireDate) : w.hireDate, firstWorked].filter((x): x is string => x !== null).sort(cmp)[0]!
        : firstWorked !== null && onFile.firstMissing(addDays(firstWorked, -breakDays), addDays(firstWorked, -1)) === null
          ? firstWorked
          : UNKNOWN_START;
    const minutesIn = (from: string, to: string) =>
      days.filter((d) => d.date >= from && d.date <= to).reduce((sum, d) => sum + d.minutes, 0) + months.filter((m) => m.month >= firstOfMonth(from) && m.month <= to).reduce((sum, m) => sum + m.minutes, 0);
    const measure = (cycle: AcaRow["cycle"], from: string, to: string, adminDays: number, adminCap: string | null): AcaRow => {
      const done = to < today;
      // Once ended, the whole period; while it runs, to the last day on file (the days since are not paid yet).
      const lastOnFile = onFile.lastBy(yesterday);
      const through = done ? to : lastOnFile !== null && lastOnFile >= from ? lastOnFile : null;
      const missingFrom = through === null ? null : onFile.firstMissing(from, through);
      const length = through === null ? 0 : daysBetween(from, through);
      const minutes = length > 0 ? minutesIn(from, through!) : 0;
      const adminEndRaw = done && adminDays > 0 ? addDays(to, adminDays) : null;
      const adminEnd = adminEndRaw && adminCap && adminCap < adminEndRaw ? adminCap : adminEndRaw;
      const stabilityStart = done ? addDays(adminEnd ?? to, 1) : null;
      return {
        workerId: w.id,
        workerName: w.name,
        hireDate: w.hireDate,
        cycle,
        result: !done ? "measuring" : missingFrom ? "missing_hours" : minutes * 7 >= l.fullTimeMinutesPerWeek * length ? "full_time" : "not_full_time",
        measurementStart: from,
        measurementEnd: to,
        minutes,
        days: length,
        countedThrough: length > 0 ? through : null,
        weeks: floorDiv(length, 7),
        averageMinutesPerWeek: length > 0 ? floorDiv(minutes * 7, length) : 0,
        missingFrom,
        adminStart: adminEnd ? addDays(to, 1) : null,
        adminEnd,
        stabilityStart,
        stabilityEnd: stabilityStart ? monthEnd(stabilityStart, s.stabilityMonths) : null,
        breakStart: returned?.start ?? breakNow,
        breakEnd: returned && !breakNow ? returned.end : null,
      };
    };
    const mine: AcaRow[] = [];
    // A new worker's initial period, while it or its stability period still matters.
    if (start !== UNKNOWN_START) {
      const initialStart = start.endsWith("-01") ? start : addMonths(firstOfMonth(start), 1);
      const before = toDayNumber(initialStart) - toDayNumber(start);
      const anniversary = addMonths(start, 12);
      const monthAfter = anniversary.endsWith("-01") ? anniversary : addMonths(firstOfMonth(anniversary), 1);
      const initial = measure("initial", initialStart, monthEnd(initialStart, s.measurementMonths), Math.max(0, Math.min(s.adminDays, l.maxAdminDays - before)), monthEnd(monthAfter, 1));
      if (start > ended.start || initial.stabilityEnd === null || initial.stabilityEnd >= today) mine.push(initial);
    }
    // The standard periods the worker is employed through from their first day ((d)(4)); the one before the latest
    // while a full-time result's stability period still runs.
    if (start <= previous.start) {
      const prior = measure("standard", previous.start, previous.end, s.adminDays, null);
      if (prior.result === "full_time" && prior.stabilityEnd !== null && prior.stabilityEnd >= today) mine.push(prior);
    }
    if (start <= ended.start) mine.push(measure("standard", ended.start, ended.end, s.adminDays, null));
    if (start <= running.start) mine.push(measure("standard", running.start, running.end, s.adminDays, null));
    // In a break now: the periods already ended stay (their results stand); nothing is measuring.
    const kept = breakNow ? mine.filter((r) => r.result !== "measuring") : mine;
    rows.push(...kept.sort((a, b) => cmp(a.measurementStart, b.measurementStart) || cmp(a.cycle, b.cycle)));
    if (breakNow) rows.push(onBreak(w, breakNow));
  }
  return rows;
}

function onBreak(w: AcaWorker, since: string): AcaRow {
  return {
    workerId: w.id,
    workerName: w.name,
    hireDate: w.hireDate,
    cycle: "standard",
    result: "on_break",
    measurementStart: since,
    measurementEnd: since,
    minutes: 0,
    days: 0,
    countedThrough: null,
    weeks: 0,
    averageMinutesPerWeek: 0,
    missingFrom: null,
    adminStart: null,
    adminEnd: null,
    stabilityStart: null,
    stabilityEnd: null,
    breakStart: since,
    breakEnd: null,
  };
}
