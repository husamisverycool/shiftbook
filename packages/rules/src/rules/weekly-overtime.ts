/**
 * RULE: weekly overtime.
 *
 * Hours worked over the weekly threshold in a fixed, recurring workweek are paid at not less than the
 * multiplier times the regular rate. Thresholds, multipliers and citations come from the
 * `overtime_rules` table (effective-dated); nothing here is hard-coded.
 *
 * Legal sources (as carried in the rule data):
 * - Fair Labor Standards Act, 29 U.S.C. § 207(a)(1); workweek basis 29 C.F.R. §§ 778.103–778.105.
 * - Illinois Minimum Wage Law, 820 ILCS 105/4a.
 * - Massachusetts, M.G.L. c. 151, § 1A.
 * - California, Cal. Lab. Code § 510(a) (weekly component; daily rules are separate rule codes).
 *
 * Where several jurisdictions' weekly rules apply to the same workweek, the most protective one is
 * used once (lowest threshold, then highest multiplier): overtime is never counted twice. The federal
 * row is always required; a state's row is required when the state lists weekly overtime.
 *
 * The premium is paid on the week's regular rate, the weighted average of its pay rates
 * (rules/regular-rate.ts, 29 C.F.R. § 778.115); this file only decides which minutes are overtime.
 */
import { addDays } from "../dates";
import type { Fraction, IsoDate, OvertimeRule, Shift } from "../types";

export const WEEKLY_OVERTIME = "weekly_overtime";

export interface WeeklyRule {
  thresholdMinutes: number;
  multiplier: Fraction;
  citations: string[];
}

export type WeeklySelection =
  | { ok: true; rule: WeeklyRule }
  /** A required jurisdiction has no weekly row covering the workweek. */
  | { ok: false; reason: "missing"; jurisdiction: string }
  /** A jurisdiction's weekly row starts or ends inside the workweek. */
  | { ok: false; reason: "changes_mid_week"; jurisdiction: string; date: IsoDate };

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function moreProtective(a: OvertimeRule, b: OvertimeRule): boolean {
  if (a.thresholdMinutes !== b.thresholdMinutes) return a.thresholdMinutes < b.thresholdMinutes;
  // Compare multipliers exactly: a.num/a.den > b.num/b.den  ⇔  a.num·b.den > b.num·a.den
  return a.multiplier.num * b.multiplier.den > b.multiplier.num * a.multiplier.den;
}

/**
 * The weekly overtime rule for a workweek across the given jurisdictions. Each jurisdiction's row
 * must cover the whole workweek (a threshold that changes mid-week is not handled in this version);
 * every jurisdiction in `required` must have one. Rule rows never overlap (checked by the engine).
 */
export function selectWeeklyRule(
  rules: OvertimeRule[],
  jurisdictions: string[],
  required: string[],
  week: IsoDate,
): WeeklySelection {
  const weekEnd = addDays(week, 6);
  const covering: OvertimeRule[] = [];
  for (const jurisdiction of [...new Set(jurisdictions)].sort(cmp)) {
    const rows = rules.filter((r) => r.kind === "weekly" && r.ruleCode === WEEKLY_OVERTIME && r.jurisdiction === jurisdiction);
    const touching = rows.filter((r) => r.effectiveFrom <= weekEnd && (r.effectiveTo === null || r.effectiveTo >= week));
    const changes = touching
      .flatMap((r) => [r.effectiveFrom > week ? r.effectiveFrom : null, r.effectiveTo !== null && r.effectiveTo < weekEnd ? addDays(r.effectiveTo, 1) : null])
      .filter((d): d is IsoDate => d !== null)
      .sort(cmp);
    if (changes.length > 0) return { ok: false, reason: "changes_mid_week", jurisdiction, date: changes[0]! };
    const row = touching[0];
    if (row) covering.push(row);
    else if (required.includes(jurisdiction)) return { ok: false, reason: "missing", jurisdiction };
  }
  if (covering.length === 0) return { ok: false, reason: "missing", jurisdiction: "US" };
  let chosen = covering[0]!;
  for (const c of covering) if (moreProtective(c, chosen)) chosen = c;
  return { ok: true, rule: { thresholdMinutes: chosen.thresholdMinutes, multiplier: chosen.multiplier, citations: covering.map((c) => c.citation) } };
}

export interface ShiftSplit {
  shift: Shift;
  regular: number;
  overtime: number;
}

/**
 * Splits chronologically ordered shifts at the threshold: minutes up to the threshold are regular;
 * every minute after it is overtime, on the shift during which it was worked.
 */
export function splitAtThreshold(ordered: Shift[], thresholdMinutes: number): ShiftSplit[] {
  let worked = 0;
  return ordered.map((shift) => {
    const regularRoom = Math.max(0, thresholdMinutes - worked);
    const regular = Math.min(shift.minutes, regularRoom);
    worked += shift.minutes;
    return { shift, regular, overtime: shift.minutes - regular };
  });
}
