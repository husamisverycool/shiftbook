/**
 * The ACA look-back measurement method (SPEC §16; slice j step 3c, decision J8; 26 C.F.R.
 * § 54.4980H-3(d)): who is full-time in a measurement period, so coverage is offered for the stability
 * period that follows. Pure; integer minutes and days; every limit is a dated rule row.
 *
 * - Ongoing workers (started before the standard measurement period began) are measured on the latest
 *   standard period that has ended: `measurementMonths` from the first day of `firstMonth`.
 * - A worker who started later is measured on an initial period of the same length from the first of
 *   the month after the start (or the start, when it is a first); the administrative period after it
 *   may not run past the last day of the first calendar month beginning on or after the first
 *   anniversary of the start ((d)(3)(vi)(B)).
 * - Full-time: on average at least 30 hours a week — minutes × 7 ≥ 1,800 × days (the limit row).
 * - At least 13 consecutive weeks with no hour of service is a break: the worker returns as new
 *   ((c)(4)(i)); a worker in such a break now is not measured.
 * - Hours of service: hours paid (worked, holiday and leave), from the latest paid version of each
 *   period, by the day; months before Shiftbook come from an import, as whole months.
 */
import { addDays, addMonths, floorDiv, toDayNumber } from "@shiftbook/rules";

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

/** Hours from before Shiftbook: a whole month (its first day). */
export interface ServiceMonth {
  workerId: string;
  month: string;
  minutes: number;
}

export interface AcaWorker {
  id: string;
  name: string;
  hireDate: string | null;
}

export interface AcaRow {
  workerId: string;
  workerName: string;
  hireDate: string | null;
  cycle: "standard" | "initial";
  /** "full_time" / "not_full_time" once the period has ended; "measuring" while it runs; "on_break" in a break now. */
  result: "full_time" | "not_full_time" | "measuring" | "on_break";
  measurementStart: string;
  measurementEnd: string;
  minutes: number;
  days: number;
  /** Whole weeks in the period, for the eye; the test uses the days. */
  weeks: number;
  /** Average minutes a week, rounded down (the test is exact). */
  averageMinutesPerWeek: number;
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

/** What is wrong with the settings against the limits in force, as the field to fix, or null. */
export function acaSettingsProblem(s: AcaSettings, l: AcaLimits): keyof AcaSettings | null {
  if (!Number.isInteger(s.measurementMonths) || s.measurementMonths < l.minMeasurementMonths || s.measurementMonths > l.maxMeasurementMonths) return "measurementMonths";
  if (!Number.isInteger(s.firstMonth) || s.firstMonth < 1 || s.firstMonth > 12) return "firstMonth";
  if (!Number.isInteger(s.adminDays) || s.adminDays < 0 || s.adminDays > l.maxAdminDays) return "adminDays";
  if (!Number.isInteger(s.stabilityMonths) || s.stabilityMonths < l.minStabilityMonths || s.stabilityMonths < s.measurementMonths) return "stabilityMonths";
  return null;
}

/** The latest standard measurement period that has ended before `today`. */
export function latestStandardPeriod(s: AcaSettings, today: string): { start: string; end: string } {
  let start = `${today.slice(0, 4)}-${String(s.firstMonth).padStart(2, "0")}-01`;
  // Step back a period at a time until it ends before today.
  while (addDays(addMonths(start, s.measurementMonths), -1) >= today) start = addMonths(start, -s.measurementMonths);
  // And forward while the next one has also ended.
  while (addDays(addMonths(start, 2 * s.measurementMonths), -1) < today) start = addMonths(start, s.measurementMonths);
  return { start, end: addDays(addMonths(start, s.measurementMonths), -1) };
}

/** The last break of at least `weeks` weeks with no hour of service up to today (gaps between service days, or since the last one). */
function lastBreak(serviceDates: string[], today: string, weeks: number): { start: string; end: string | null } | null {
  const gap = weeks * 7;
  let found: { start: string; end: string | null } | null = null;
  for (let i = 1; i < serviceDates.length; i += 1) {
    const prev = serviceDates[i - 1]!;
    const next = serviceDates[i]!;
    if (toDayNumber(next) - toDayNumber(prev) - 1 >= gap) found = { start: addDays(prev, 1), end: addDays(next, -1) };
  }
  const last = serviceDates.at(-1);
  if (last !== undefined && toDayNumber(today) - toDayNumber(last) >= gap) found = { start: addDays(last, 1), end: null };
  return found;
}

export function acaRows(args: { today: string; settings: AcaSettings; limits: AcaLimits; workers: AcaWorker[]; days: ServiceDay[]; months: ServiceMonth[] }): AcaRow[] {
  const { today, settings: s, limits: l } = args;
  const standard = latestStandardPeriod(s, today);
  const rows: AcaRow[] = [];
  for (const w of [...args.workers].sort((a, b) => cmp(a.name, b.name) || cmp(a.id, b.id))) {
    const days = args.days.filter((d) => d.workerId === w.id && d.minutes > 0 && d.date <= today);
    const months = args.months.filter((m) => m.workerId === w.id && m.minutes > 0 && m.month <= today);
    // A month from before Shiftbook is service on its first and its last day (whole months, for breaks).
    const serviceDates = [...new Set([...days.map((d) => d.date), ...months.flatMap((m) => [m.month, addDays(addMonths(m.month, 1), -1)])])].sort(cmp);
    if (serviceDates.length === 0 && w.hireDate === null) continue;
    const gap = lastBreak(serviceDates, today, l.breakWeeks);
    if (gap && gap.end === null) {
      rows.push(blank(w, gap));
      continue;
    }
    // After a break the worker returns as new: their start is the return.
    const firstService = serviceDates[0] ?? null;
    const start = gap ? addDays(gap.end!, 1) : [w.hireDate, firstService].filter((x): x is string => x !== null).sort(cmp)[0]!;
    const minutesIn = (from: string, to: string) =>
      days.filter((d) => d.date >= from && d.date <= to).reduce((sum, d) => sum + d.minutes, 0) + months.filter((m) => m.month >= firstOfMonth(from) && m.month <= to).reduce((sum, m) => sum + m.minutes, 0);
    const measure = (cycle: AcaRow["cycle"], from: string, to: string, adminCap: string | null): AcaRow => {
      const ended = to < today;
      const through = ended ? to : addDays(today, -1);
      const length = Math.max(0, daysBetween(from, through));
      const minutes = minutesIn(from, through);
      const adminStart = ended ? addDays(to, 1) : null;
      const adminEndRaw = ended ? addDays(to, s.adminDays) : null;
      const adminEnd = adminEndRaw && adminCap && adminCap < adminEndRaw ? adminCap : adminEndRaw;
      const stabilityStart = adminEnd ? addDays(adminEnd, 1) : null;
      const fullTime = minutes * 7 >= l.fullTimeMinutesPerWeek * length;
      return {
        workerId: w.id,
        workerName: w.name,
        hireDate: w.hireDate,
        cycle,
        result: !ended ? "measuring" : length > 0 && fullTime ? "full_time" : "not_full_time",
        measurementStart: from,
        measurementEnd: to,
        minutes,
        days: length,
        weeks: floorDiv(length, 7),
        averageMinutesPerWeek: length > 0 ? floorDiv(minutes * 7, length) : 0,
        adminStart,
        adminEnd,
        stabilityStart,
        stabilityEnd: stabilityStart ? addDays(addMonths(stabilityStart, s.stabilityMonths), -1) : null,
        breakStart: gap?.start ?? null,
        breakEnd: gap?.end ?? null,
      };
    };
    if (start < standard.start) {
      rows.push(measure("standard", standard.start, standard.end, null));
      continue;
    }
    // New: an initial period from the first of the next month (or the start, on a first).
    const initialStart = start.endsWith("-01") ? start : addMonths(firstOfMonth(start), 1);
    const initialEnd = addDays(addMonths(initialStart, s.measurementMonths), -1);
    // The last day of the first calendar month beginning on or after the first anniversary.
    const anniversary = addMonths(start, 12);
    const monthAfter = anniversary.endsWith("-01") ? anniversary : addMonths(firstOfMonth(anniversary), 1);
    rows.push(measure("initial", initialStart, initialEnd, addDays(addMonths(monthAfter, 1), -1)));
  }
  return rows;
}

function blank(w: AcaWorker, gap: { start: string; end: string | null }): AcaRow {
  return { workerId: w.id, workerName: w.name, hireDate: w.hireDate, cycle: "standard", result: "on_break", measurementStart: gap.start, measurementEnd: gap.start, minutes: 0, days: 0, weeks: 0, averageMinutesPerWeek: 0, adminStart: null, adminEnd: null, stabilityStart: null, stabilityEnd: null, breakStart: gap.start, breakEnd: null };
}
