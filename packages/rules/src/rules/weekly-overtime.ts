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
 * used once (lowest threshold, then highest multiplier): overtime is never counted twice.
 *
 * Slice (a) limit: the regular rate is the single pay rate of the workweek. A workweek with several
 * pay rates and overtime is blocked by the engine until the weighted-average regular rate
 * (29 C.F.R. § 778.115) arrives in slice (c).
 */
import { isEffective } from "../dates";
import type { Fraction, IsoDate, OvertimeRule, Shift } from "../types";

export const WEEKLY_OVERTIME = "weekly_overtime";

export interface WeeklyRule {
  thresholdMinutes: number;
  multiplier: Fraction;
  citations: string[];
}

function moreProtective(a: OvertimeRule, b: OvertimeRule): boolean {
  if (a.thresholdMinutes !== b.thresholdMinutes) return a.thresholdMinutes < b.thresholdMinutes;
  // Compare multipliers exactly: a.num/a.den > b.num/b.den  ⇔  a.num·b.den > b.num·a.den
  return a.multiplier.num * b.multiplier.den > b.multiplier.num * a.multiplier.den;
}

/** The weekly overtime rule in effect for a workweek across the given jurisdictions, if any. */
export function selectWeeklyRule(
  rules: OvertimeRule[],
  jurisdictions: string[],
  week: IsoDate,
): WeeklyRule | null {
  const candidates = rules
    .filter((r) => r.kind === "weekly" && r.ruleCode === WEEKLY_OVERTIME)
    .filter((r) => jurisdictions.includes(r.jurisdiction))
    .filter((r) => isEffective(week, r.effectiveFrom, r.effectiveTo))
    .sort((a, b) => (a.jurisdiction < b.jurisdiction ? -1 : a.jurisdiction > b.jurisdiction ? 1 : 0));
  if (candidates.length === 0) return null;
  let chosen = candidates[0]!;
  for (const c of candidates) if (moreProtective(c, chosen)) chosen = c;
  return {
    thresholdMinutes: chosen.thresholdMinutes,
    multiplier: chosen.multiplier,
    citations: candidates.map((c) => c.citation),
  };
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
