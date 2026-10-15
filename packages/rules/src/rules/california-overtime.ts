/**
 * RULE: California daily, double-time and seventh-day overtime, and weekly overtime on the rest.
 *
 * - Cal. Lab. Code § 510(a); IWC wage orders § 3(A): over 8 hours in a workday at 1.5×, over 12 at
 *   2×; on the seventh day of work in a workweek, the first 8 hours at 1.5× and the rest at 2×; over
 *   40 hours in the workweek at 1.5×.
 * - The seventh day counts only when all seven days of the same fixed workweek were worked (DLSE
 *   Enforcement Manual 48.1.3.2; Mendoza v. Nordstrom (2017) 2 Cal.5th 1074): seven days in a row
 *   that straddle two workweeks earn no seventh-day premium.
 * - No hour is counted twice: hours already paid at a daily or seventh-day premium do not count
 *   toward the 40 (DLSE Opinion Letter 2000.01.19).
 * - The agency is the employer: hours at every client are counted together.
 * The workday is the calendar day (midnight to midnight; shifts are split at midnight by intake).
 * Thresholds and multipliers come from the overtime rule data, effective-dated; a row that changes
 * inside the workweek is not handled and holds the week.
 */
import { addDays } from "../dates";
import type { Fraction, IsoDate, OvertimeRule, Shift } from "../types";
import { WEEKLY_OVERTIME, type WeeklyRule } from "./weekly-overtime";

export const CA_DAILY_OVERTIME = "ca_daily_overtime";
export const CA_DAILY_DOUBLE_TIME = "ca_daily_double_time";
export const CA_SEVENTH_DAY = "ca_seventh_day";
export const CA_SEVENTH_DAY_DOUBLE_TIME = "ca_seventh_day_double_time";
export const CALIFORNIA_RULE_CODES = [CA_DAILY_OVERTIME, CA_DAILY_DOUBLE_TIME, CA_SEVENTH_DAY, CA_SEVENTH_DAY_DOUBLE_TIME] as const;

/** Minutes of one shift paid at a premium under one rule. */
export interface PremiumPart {
  ruleCode: string;
  type: "OT" | "DT";
  multiplier: Fraction;
  minutes: number;
  citation: string;
  thresholdMinutes: number;
}

export interface PremiumSplit {
  shift: Shift;
  regular: number;
  premiums: PremiumPart[];
}

export type CaliforniaRules = Record<(typeof CALIFORNIA_RULE_CODES)[number], OvertimeRule>;

export type CaliforniaSelection = { ok: true; rules: CaliforniaRules } | { ok: false; reason: "missing" | "changes_mid_week"; ruleCode: string; date?: IsoDate };

/**
 * The four California rows, each covering the whole workweek. All four apply to every California
 * week by statute: a missing one (in the jurisdiction list or the overtime rows) holds the week
 * instead of paying less.
 */
export function selectCaliforniaRules(rules: OvertimeRule[], codes: string[], week: IsoDate): CaliforniaSelection {
  const weekEnd = addDays(week, 6);
  const out: Partial<CaliforniaRules> = {};
  for (const code of CALIFORNIA_RULE_CODES) {
    if (!codes.includes(code)) return { ok: false, reason: "missing", ruleCode: code };
    const touching = rules.filter((r) => r.jurisdiction === "CA" && r.ruleCode === code && r.effectiveFrom <= weekEnd && (r.effectiveTo === null || r.effectiveTo >= week));
    const change = touching.flatMap((r) => [r.effectiveFrom > week ? r.effectiveFrom : null, r.effectiveTo !== null && r.effectiveTo < weekEnd ? addDays(r.effectiveTo, 1) : null]).find((d) => d !== null);
    if (change) return { ok: false, reason: "changes_mid_week", ruleCode: code, date: change };
    if (touching.length === 0) return { ok: false, reason: "missing", ruleCode: code };
    out[code] = touching[0]!;
  }
  return { ok: true, rules: out as CaliforniaRules };
}

/** How many of a shift's minutes, which start `start` minutes into the day, fall in [0, a), [a, b) and [b, ∞). */
function segments(start: number, minutes: number, a: number, b: number): [number, number, number] {
  const end = start + minutes;
  const inRange = (lo: number, hi: number) => Math.max(0, Math.min(end, hi) - Math.max(start, lo));
  return [inRange(0, a), inRange(a, b), inRange(b, Number.MAX_SAFE_INTEGER)];
}

/**
 * Splits chronologically ordered shifts of one California workweek into straight time and premium
 * minutes by rule, day by day, then weekly overtime on the straight minutes past the threshold.
 */
export function splitCalifornia(ordered: Shift[], week: IsoDate, ca: CaliforniaRules, weekly: WeeklyRule & { citation: string }): PremiumSplit[] {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const worked = new Set(ordered.filter((s) => s.minutes > 0).map((s) => s.date));
  const seventhDay = dates.every((d) => worked.has(d)) ? dates[6]! : null;
  const dayUsed = new Map<string, number>();
  let straightSoFar = 0;
  const part = (rule: OvertimeRule, minutes: number): PremiumPart[] =>
    minutes > 0 ? [{ ruleCode: rule.ruleCode, type: rule.earningType === "DT" ? "DT" : "OT", multiplier: rule.multiplier, minutes, citation: rule.citation, thresholdMinutes: rule.thresholdMinutes }] : [];
  return ordered.map((shift) => {
    const start = dayUsed.get(shift.date) ?? 0;
    dayUsed.set(shift.date, start + shift.minutes);
    const premiums: PremiumPart[] = [];
    let straight: number;
    if (shift.date === seventhDay) {
      const [before, first, rest] = segments(start, shift.minutes, ca.ca_seventh_day.thresholdMinutes, ca.ca_seventh_day_double_time.thresholdMinutes);
      straight = before;
      premiums.push(...part(ca.ca_seventh_day, first), ...part(ca.ca_seventh_day_double_time, rest));
    } else {
      const [first, over8, over12] = segments(start, shift.minutes, ca.ca_daily_overtime.thresholdMinutes, ca.ca_daily_double_time.thresholdMinutes);
      premiums.push(...part(ca.ca_daily_overtime, over8), ...part(ca.ca_daily_double_time, over12));
      straight = first;
    }
    // Weekly overtime only on minutes not already paid at a daily or seventh-day premium.
    const room = Math.max(0, weekly.thresholdMinutes - straightSoFar);
    const regular = Math.min(straight, room);
    straightSoFar += straight;
    if (straight > regular) premiums.push({ ruleCode: WEEKLY_OVERTIME, type: "OT", multiplier: weekly.multiplier, minutes: straight - regular, citation: weekly.citation, thresholdMinutes: weekly.thresholdMinutes });
    return { shift, regular, premiums };
  });
}
