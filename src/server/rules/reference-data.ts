/**
 * The reference wage-rule rows, mirrored from migrations drizzle/0002_reference_rules.sql and
 * drizzle/0004_rule_data_v2.sql. An integration test proves the database holds exactly these rows,
 * so tests and goldens that use this module can never drift from what the app computes with.
 * Sources: docs/research/minimum-wage-2026.md and the citations on each row.
 */
import type { JurisdictionRule, MinimumWageRule, OvertimeRule } from "@shiftbook/rules";

const since = "2000-01-01";

export const REFERENCE_OVERTIME_RULES: OvertimeRule[] = [
  { jurisdiction: "US", ruleCode: "weekly_overtime", kind: "weekly", thresholdMinutes: 2400, multiplier: { num: 3, den: 2 }, earningType: "OT", effectiveFrom: since, effectiveTo: null, citation: "Fair Labor Standards Act, 29 U.S.C. § 207(a)(1); 29 C.F.R. Part 778 — over 40 hours in a workweek at not less than 1.5x the regular rate" },
  { jurisdiction: "IL", ruleCode: "weekly_overtime", kind: "weekly", thresholdMinutes: 2400, multiplier: { num: 3, den: 2 }, earningType: "OT", effectiveFrom: since, effectiveTo: null, citation: "Illinois Minimum Wage Law, 820 ILCS 105/4a(1) — over 40 hours in a workweek at not less than 1.5x the regular rate" },
  { jurisdiction: "MA", ruleCode: "weekly_overtime", kind: "weekly", thresholdMinutes: 2400, multiplier: { num: 3, den: 2 }, earningType: "OT", effectiveFrom: since, effectiveTo: null, citation: "Massachusetts Minimum Fair Wage Law, M.G.L. c. 151, § 1A — over 40 hours in a workweek at not less than 1.5x the regular rate" },
  { jurisdiction: "CA", ruleCode: "weekly_overtime", kind: "weekly", thresholdMinutes: 2400, multiplier: { num: 3, den: 2 }, earningType: "OT", effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 510(a) — over 40 hours in a workweek at not less than 1.5x the regular rate" },
  { jurisdiction: "CA", ruleCode: "ca_daily_overtime", kind: "daily", thresholdMinutes: 480, multiplier: { num: 3, den: 2 }, earningType: "OT", effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 510(a) — over 8 hours in a workday at not less than 1.5x the regular rate" },
  { jurisdiction: "CA", ruleCode: "ca_daily_double_time", kind: "daily_double", thresholdMinutes: 720, multiplier: { num: 2, den: 1 }, earningType: "DT", effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 510(a) — over 12 hours in a workday at not less than 2x the regular rate" },
  { jurisdiction: "CA", ruleCode: "ca_seventh_day", kind: "seventh_day", thresholdMinutes: 0, multiplier: { num: 3, den: 2 }, earningType: "OT", effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 510(a); IWC Wage Orders § 3(A) — first 8 hours on the seventh day of work in a workweek at not less than 1.5x the regular rate" },
  { jurisdiction: "CA", ruleCode: "ca_seventh_day_double_time", kind: "seventh_day", thresholdMinutes: 480, multiplier: { num: 2, den: 1 }, earningType: "DT", effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 510(a); IWC Wage Orders § 3(A) — over 8 hours on the seventh day of work in a workweek at not less than 2x the regular rate" },
];

const j = (jurisdiction: string, ruleCode: string, citation: string, scope: { county?: string; city?: string } = {}): JurisdictionRule => ({
  jurisdiction,
  county: scope.county ?? null,
  city: scope.city ?? null,
  ruleCode,
  effectiveFrom: since,
  effectiveTo: null,
  citation,
});

export const REFERENCE_JURISDICTION_RULES: JurisdictionRule[] = [
  j("US", "weekly_overtime", "29 U.S.C. § 207(a)(1)"),
  j("IL", "weekly_overtime", "820 ILCS 105/4a"),
  j("MA", "weekly_overtime", "M.G.L. c. 151, § 1A"),
  j("CA", "weekly_overtime", "Cal. Lab. Code § 510(a)"),
  j("CA", "ca_daily_overtime", "Cal. Lab. Code § 510(a)"),
  j("CA", "ca_daily_double_time", "Cal. Lab. Code § 510(a)"),
  j("CA", "ca_seventh_day", "Cal. Lab. Code § 510(a)"),
  j("CA", "ca_seventh_day_double_time", "Cal. Lab. Code § 510(a)"),
  j("US", "minimum_wage", "29 U.S.C. § 206(a)(1)"),
  j("IL", "minimum_wage", "820 ILCS 105/4"),
  j("MA", "minimum_wage", "M.G.L. c. 151, § 1"),
  j("CA", "minimum_wage", "Cal. Lab. Code § 1182.12"),
  j("IL", "local_minimum_wage", "Cook County Code § 42-13 (Ord. 16-5768); municipalities may opt out", { county: "Cook" }),
  j("IL", "local_minimum_wage", "Chicago Municipal Code ch. 6-105", { city: "Chicago" }),
];

const mw = (jurisdiction: string, rateCents: number, effectiveFrom: string, effectiveTo: string | null, citation: string): MinimumWageRule => ({
  jurisdiction,
  county: null,
  city: null,
  rateCents,
  effectiveFrom,
  effectiveTo,
  citation,
});

export const REFERENCE_MINIMUM_WAGE_RULES: MinimumWageRule[] = [
  mw("US", 725, "2009-07-24", null, "Fair Labor Standards Act, 29 U.S.C. § 206(a)(1)(C) — $7.25 per hour"),
  mw("IL", 1400, "2024-01-01", "2024-12-31", "Illinois Minimum Wage Law, 820 ILCS 105/4(a)(1) — $14.00 per hour in 2024"),
  mw("IL", 1500, "2025-01-01", null, "Illinois Minimum Wage Law, 820 ILCS 105/4(a)(1) — $15.00 per hour from January 1, 2025"),
  mw("MA", 1425, "2022-01-01", "2022-12-31", "M.G.L. c. 151, § 1 (St. 2018, c. 121) — $14.25 per hour in 2022"),
  mw("MA", 1500, "2023-01-01", null, "M.G.L. c. 151, § 1 (St. 2018, c. 121) — $15.00 per hour from January 1, 2023"),
  mw("CA", 1650, "2025-01-01", "2025-12-31", "Cal. Lab. Code § 1182.12 — $16.50 per hour in 2025"),
  mw("CA", 1690, "2026-01-01", "2026-12-31", "Cal. Lab. Code § 1182.12 — $16.90 per hour in 2026"),
  mw("CA", 1740, "2027-01-01", null, "Cal. Lab. Code § 1182.12 — $17.40 per hour from January 1, 2027 (certified July 31, 2026)"),
];
