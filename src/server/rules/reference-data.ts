/**
 * The reference wage-rule rows, mirrored from migrations drizzle/0002_reference_rules.sql,
 * drizzle/0004_rule_data_v2.sql, drizzle/0005_place_codes.sql, drizzle/0015 (Chicago and Cook County),
 * drizzle/0016 (premiums and short-day pay) and drizzle/0017 (California local minimum wages). An integration test proves the database holds exactly these rows,
 * so tests and goldens that use this module can never drift from what the app computes with.
 * Sources: docs/research/minimum-wage-2026.md and the citations on each row.
 */
import type { EqualPayRule, GuaranteeRule, JurisdictionRule, MinimumWageRule, OvertimeRule, PremiumRule, RegularRateRule } from "@shiftbook/rules";

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

type Scope = { countyFips?: string; placeFips?: string; scopeName: string };

const j = (jurisdiction: string, ruleCode: string, citation: string, scope?: Scope): JurisdictionRule => ({
  jurisdiction,
  countyFips: scope?.countyFips ?? null,
  placeFips: scope?.placeFips ?? null,
  scopeName: scope?.scopeName ?? null,
  ruleCode,
  effectiveFrom: since,
  effectiveTo: null,
  citation,
});

const CA_LOCAL = "Local minimum wage ordinance listed in the UC Berkeley Labor Center inventory linked by the California Department of Industrial Relations (2026); its rates are not on file yet";

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
  // Census FIPS codes: Cook County, IL = 17031; City of Chicago = 1714000 (drizzle/0015).
  j("IL", "minimum_wage", "Cook County Minimum Wage Ordinance, Cook County Code § 42-13 (Ord. 16-5768)", { countyFips: "17031", scopeName: "Cook County" }),
  j("IL", "minimum_wage", "Chicago Minimum Wage Ordinance, Chicago Municipal Code ch. 6-105", { placeFips: "1714000", scopeName: "City of Chicago" }),
  // California localities with their own minimum wage (drizzle/0017): held until their rates are on file.
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0600562", scopeName: "City of Alameda" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0605108", scopeName: "City of Belmont" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0606000", scopeName: "City of Berkeley" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0609066", scopeName: "City of Burlingame" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0617610", scopeName: "City of Cupertino" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0617918", scopeName: "Daly City" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0620956", scopeName: "City of East Palo Alto" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0621796", scopeName: "City of El Cerrito" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0622594", scopeName: "City of Emeryville" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0625338", scopeName: "Foster City" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0626000", scopeName: "City of Fremont" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0631708", scopeName: "City of Half Moon Bay" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0633000", scopeName: "City of Hayward" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0643280", scopeName: "City of Los Altos" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0644000", scopeName: "City of Los Angeles" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0645246", scopeName: "City of Malibu" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0646870", scopeName: "City of Menlo Park" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0647766", scopeName: "City of Milpitas" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0649670", scopeName: "City of Mountain View" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0652582", scopeName: "City of Novato" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0653000", scopeName: "City of Oakland" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0655282", scopeName: "City of Palo Alto" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0656000", scopeName: "City of Pasadena" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0656784", scopeName: "City of Petaluma" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0660102", scopeName: "Redwood City" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0660620", scopeName: "City of Richmond" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0665070", scopeName: "City of San Carlos" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0666000", scopeName: "City of San Diego" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0667000", scopeName: "City and County of San Francisco" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0668000", scopeName: "City of San Jose" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0668252", scopeName: "City of San Mateo" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0669084", scopeName: "City of Santa Clara" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0670000", scopeName: "City of Santa Monica" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0670098", scopeName: "City of Santa Rosa" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0673262", scopeName: "City of South San Francisco" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0672646", scopeName: "City of Sonoma" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0677000", scopeName: "City of Sunnyvale" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { placeFips: "0684410", scopeName: "City of West Hollywood" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { countyFips: "06037", scopeName: "Los Angeles County (its ordinance covers unincorporated areas; cities there are held too until checked)" }),
  j("CA", "local_minimum_wage", CA_LOCAL, { countyFips: "06081", scopeName: "San Mateo County (its ordinance covers unincorporated areas; cities there are held too until checked)" }),
];

const mw = (jurisdiction: string, rateCents: number, effectiveFrom: string, effectiveTo: string | null, citation: string, scope?: Scope): MinimumWageRule => ({
  jurisdiction,
  countyFips: scope?.countyFips ?? null,
  placeFips: scope?.placeFips ?? null,
  scopeName: scope?.scopeName ?? null,
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
  // Local rates (drizzle/0015): applied wherever the worksite is inside the city or county.
  mw("IL", 1660, "2025-07-01", "2026-06-30", "Chicago Municipal Code ch. 6-105; OLS Rule MW 2.01 — $16.60 per hour from July 1, 2025 (employers with 4 or more employees)", { placeFips: "1714000", scopeName: "City of Chicago" }),
  mw("IL", 1705, "2026-07-01", null, "Chicago Municipal Code ch. 6-105; OLS Rule MW 2.01 — $17.05 per hour from July 1, 2026 (employers with 4 or more employees)", { placeFips: "1714000", scopeName: "City of Chicago" }),
  mw("IL", 1500, "2025-07-01", "2026-06-30", "Cook County Code § 42-13 — $15.00 per hour from July 1, 2025 (held at the state rate)", { countyFips: "17031", scopeName: "Cook County" }),
  mw("IL", 1540, "2026-07-01", null, "Cook County Code § 42-13 — $15.40 per hour from July 1, 2026", { countyFips: "17031", scopeName: "Cook County" }),
];

const premium = (ruleCode: string, effectiveFrom: string, effectiveTo: string | null, citation: string): PremiumRule => ({ jurisdiction: "CA", ruleCode, premiumMinutes: 60, perWorkdayMax: 1, effectiveFrom, effectiveTo, citation });

/** California meal- and rest-period premiums (drizzle/0016), two dated versions of § 226.7. */
export const REFERENCE_PREMIUM_RULES: PremiumRule[] = [
  premium("ca_meal_premium", "2000-01-01", "2026-12-31", "Cal. Lab. Code § 226.7(c) (version in effect through December 31, 2026) — one additional hour of pay at the regular rate for each workday a meal period is not provided; Ferra v. Loews Hollywood Hotel, LLC (2021) 11 Cal.5th 858; UPS v. Superior Court (2011) 196 Cal.App.4th 57"),
  premium("ca_meal_premium", "2027-01-01", null, "Cal. Lab. Code § 226.7(c) (version operative January 1, 2027; Stats. 2020, ch. 343) — one additional hour of pay at the regular rate for each workday a meal period is not provided; Ferra; UPS"),
  premium("ca_rest_premium", "2000-01-01", "2026-12-31", "Cal. Lab. Code § 226.7(c) (version in effect through December 31, 2026) — one additional hour of pay at the regular rate for each workday a rest period is not provided; Ferra v. Loews Hollywood Hotel, LLC (2021) 11 Cal.5th 858; UPS v. Superior Court (2011) 196 Cal.App.4th 57"),
  premium("ca_rest_premium", "2027-01-01", null, "Cal. Lab. Code § 226.7(c) (version operative January 1, 2027; Stats. 2020, ch. 343) — one additional hour of pay at the regular rate for each workday a rest period is not provided; Ferra; UPS"),
];

const guarantee = (r: Omit<GuaranteeRule, "effectiveFrom" | "effectiveTo">): GuaranteeRule => ({ ...r, effectiveFrom: "2000-01-01", effectiveTo: null });

/** Minimum pay for a short day, one per state (drizzle/0016). */
export const REFERENCE_GUARANTEE_RULES: GuaranteeRule[] = [
  guarantee({ jurisdiction: "CA", ruleCode: "ca_reporting_time", dueMinutes: null, reassignedDueMinutes: null, scheduledFraction: { num: 1, den: 2 }, minMinutes: 120, maxMinutes: 240, minScheduledMinutes: null, basis: "regular_rate", citation: "IWC wage orders § 5(A) (e.g. 8 CCR § 11070) — reporting time pay: half the usual or scheduled day's work, at least two and at most four hours, at the regular rate of pay" }),
  guarantee({ jurisdiction: "MA", ruleCode: "ma_reporting_pay", dueMinutes: 180, reassignedDueMinutes: null, scheduledFraction: null, minMinutes: null, maxMinutes: null, minScheduledMinutes: 180, basis: "pay_rate", citation: "454 CMR 27.04(1) — a worker scheduled for three or more hours who reports and is not given the expected hours is paid for at least three hours, at no less than the minimum wage" }),
  guarantee({ jurisdiction: "IL", ruleCode: "il_day_labor_minimum", dueMinutes: 240, reassignedDueMinutes: 120, scheduledFraction: null, minMinutes: null, maxMinutes: null, minScheduledMinutes: null, basis: "pay_rate", citation: "Day and Temporary Labor Services Act, 820 ILCS 175/30(g); 56 Ill. Adm. Code 260.450(b) — sent and not utilized: at least 4 hours at the agreed rate; placed elsewhere the same shift: at least 2 hours" }),
];


/** The premium multiple that stays out of the regular rate (drizzle/0021). */
export const REFERENCE_REGULAR_RATE_RULES: RegularRateRule[] = [
  {
    jurisdiction: "US",
    ruleCode: "premium_excluded_from_regular_rate",
    multiplier: { num: 3, den: 2 },
    effectiveFrom: "2000-01-01",
    effectiveTo: null,
    citation:
      "29 U.S.C. § 207(e)(6) — a premium rate for work on holidays, Saturdays, Sundays or regular days of rest of not less than one and one-half times the rate for like work on other days stays out of the regular rate; a smaller premium counts in it (29 C.F.R. § 778.203); California follows (DLSE Enforcement Manual 49.1.2.4)",
  },
];

/** The Illinois equal-pay counter (drizzle/0019). */
export const REFERENCE_EQUAL_PAY_RULES: EqualPayRule[] = [
  {
    jurisdiction: "IL",
    ruleCode: "il_dtlsa_equal_pay",
    countsFrom: "2024-04-01",
    warnMinutes: 36_000,
    windowMonths: 12,
    triggerMinutes: 43_200,
    longWindowMonths: 48,
    longTriggerMinutes: 249_600,
    effectiveFrom: "2024-08-09",
    effectiveTo: null,
    citation:
      "820 ILCS 175/42(a) (P.A. 103-1030, eff. 2024-08-09) — equal pay and benefits (or their hourly cash value, § 42(b)) after more than 720 hours at the same third party client within a 12-month period, counting work on or after April 1, 2024; § 42(a)(2)(B), (c): more than 4,160 hours within a 48-month period; 56 Ill. Adm. Code 260.445, 260.505(b) — the client's data is due before the next pay period begins. The 600-hour heads-up is Granite's (SPEC §9), not law.",
  },
];
