/**
 * The reference wage-rule rows, mirrored from migration drizzle/0002_reference_rules.sql.
 * An integration test proves the database holds exactly these rows, so tests and goldens that
 * use this module can never drift from what the app computes with.
 */
import type { JurisdictionRule, OvertimeRule } from "@shiftbook/rules";

const since = "2000-01-01";

export const REFERENCE_OVERTIME_RULES: OvertimeRule[] = [
  { jurisdiction: "US", ruleCode: "weekly_overtime", kind: "weekly", thresholdMinutes: 2400, multiplier: { num: 3, den: 2 }, earningType: "OT", effectiveFrom: since, effectiveTo: null, citation: "Fair Labor Standards Act, 29 U.S.C. § 207(a)(1); 29 C.F.R. Part 778 — over 40 hours in a workweek at not less than 1.5x the regular rate" },
  { jurisdiction: "IL", ruleCode: "weekly_overtime", kind: "weekly", thresholdMinutes: 2400, multiplier: { num: 3, den: 2 }, earningType: "OT", effectiveFrom: since, effectiveTo: null, citation: "Illinois Minimum Wage Law, 820 ILCS 105/4a — over 40 hours in a workweek at 1.5x the regular rate" },
  { jurisdiction: "MA", ruleCode: "weekly_overtime", kind: "weekly", thresholdMinutes: 2400, multiplier: { num: 3, den: 2 }, earningType: "OT", effectiveFrom: since, effectiveTo: null, citation: "Massachusetts Minimum Fair Wage Law, M.G.L. c. 151, § 1A — over 40 hours in a workweek at 1.5x the regular rate" },
  { jurisdiction: "CA", ruleCode: "weekly_overtime", kind: "weekly", thresholdMinutes: 2400, multiplier: { num: 3, den: 2 }, earningType: "OT", effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 510(a) — over 40 hours in a workweek at 1.5x the regular rate" },
  { jurisdiction: "CA", ruleCode: "ca_daily_overtime", kind: "daily", thresholdMinutes: 480, multiplier: { num: 3, den: 2 }, earningType: "OT", effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 510(a) — over 8 hours in a workday at 1.5x the regular rate" },
  { jurisdiction: "CA", ruleCode: "ca_daily_double_time", kind: "daily_double", thresholdMinutes: 720, multiplier: { num: 2, den: 1 }, earningType: "DT", effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 510(a) — over 12 hours in a workday at 2x the regular rate" },
  { jurisdiction: "CA", ruleCode: "ca_seventh_day", kind: "seventh_day", thresholdMinutes: 0, multiplier: { num: 3, den: 2 }, earningType: "OT", effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 510(a) — first 8 hours on the seventh consecutive workday in a workweek at 1.5x; over 8 at 2x" },
];

export const REFERENCE_JURISDICTION_RULES: JurisdictionRule[] = [
  { jurisdiction: "US", ruleCode: "weekly_overtime", effectiveFrom: since, effectiveTo: null, citation: "29 U.S.C. § 207(a)(1)" },
  { jurisdiction: "IL", ruleCode: "weekly_overtime", effectiveFrom: since, effectiveTo: null, citation: "820 ILCS 105/4a" },
  { jurisdiction: "MA", ruleCode: "weekly_overtime", effectiveFrom: since, effectiveTo: null, citation: "M.G.L. c. 151, § 1A" },
  { jurisdiction: "CA", ruleCode: "weekly_overtime", effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 510(a)" },
  { jurisdiction: "CA", ruleCode: "ca_daily_overtime", effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 510(a)" },
  { jurisdiction: "CA", ruleCode: "ca_daily_double_time", effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 510(a)" },
  { jurisdiction: "CA", ruleCode: "ca_seventh_day", effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 510(a)" },
];
