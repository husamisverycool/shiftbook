/** ISO calendar date, "YYYY-MM-DD". */
export type IsoDate = string;

/** An exact rational number; rates are cents per hour as num/den, multipliers likewise. */
export type Fraction = { num: number; den: number };

export type EarningType =
  | "REG"
  | "OT"
  | "DT"
  /** The difference up to the minimum wage when a rate card is below it that day. */
  | "MW_TRUEUP"
  | "HOL"
  | "DIFF"
  | "MEAL_PREMIUM"
  | "REST_PREMIUM"
  | "MIN_GUARANTEE";

/** 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type OvertimeBillingRule = "multiplier" | "straight_time" | "not_billable";

/** Worked time on one assignment on one day: the engine's only input about hours. */
export interface Shift {
  entryIds: string[];
  workerId: string;
  workerName: string;
  assignmentId: string;
  clientId: string;
  /** Worksite state (two-letter code); "US" federal rules always apply in addition. */
  jurisdiction: string;
  /** Worksite county as its 5-digit Census FIPS code ("17031" = Cook County, IL). */
  countyFips: string;
  /**
   * Worksite city or town as its 7-digit Census place code ("1714000" = Chicago), or NO_PLACE
   * ("none") when confirmed outside any city or town. null means unknown, and the week is held.
   */
  placeFips: string | null;
  date: IsoDate;
  /**
   * Minutes after midnight the shift started, for ordering within a day; null if unknown. A shift
   * must not run past midnight (startMinute + minutes ≤ 1440): intake splits such shifts first.
   */
  startMinute: number | null;
  minutes: number;
  payRateCents: number;
  billRateCents: number;
  /** How the bill rate came about when the rate card worked it out (a markup rounded to the cent), for the explanation. */
  billRateExplain?: string;
  billOtMultiplier: Fraction;
  /** The rate card's double-time bill multiplier (California double time). */
  billDtMultiplier: Fraction;
  otBillingRule: OvertimeBillingRule;
}

export interface OvertimeRule {
  jurisdiction: string;
  ruleCode: string;
  kind: "weekly" | "daily" | "daily_double" | "seventh_day";
  thresholdMinutes: number;
  multiplier: Fraction;
  earningType: EarningType;
  effectiveFrom: IsoDate;
  effectiveTo: IsoDate | null;
  citation: string;
}

export interface JurisdictionRule {
  jurisdiction: string;
  /** Local scope by Census code (see places.ts); both null/absent means statewide (or federal). */
  countyFips?: string | null;
  placeFips?: string | null;
  /** The local scope's name, for messages only ("Cook County", "City of Chicago"). */
  scopeName?: string | null;
  ruleCode: string;
  effectiveFrom: IsoDate;
  effectiveTo: IsoDate | null;
  citation: string;
}

export interface MinimumWageRule {
  jurisdiction: string;
  countyFips?: string | null;
  placeFips?: string | null;
  scopeName?: string | null;
  rateCents: number;
  effectiveFrom: IsoDate;
  effectiveTo: IsoDate | null;
  citation: string;
}

/**
 * A dated premium rule paid when a person confirms its trigger: an hour of pay at the regular rate
 * for a missed meal or rest period (Cal. Lab. Code § 226.7(c)). Not hours worked.
 */
export interface PremiumRule {
  jurisdiction: string;
  ruleCode: string;
  /** Minutes of pay per occurrence (60: "one additional hour of pay"). */
  premiumMinutes: number;
  /** The most occurrences paid per workday (one meal and one rest premium a day). */
  perWorkdayMax: number;
  effectiveFrom: IsoDate;
  effectiveTo: IsoDate | null;
  citation: string;
}

export type ConfirmationKind = "meal_period_missed" | "rest_period_missed";

/** Something a person confirmed about a worker's day on one assignment (the engine computes, a person confirms). */
export interface Confirmation {
  id: string;
  kind: ConfirmationKind;
  workerId: string;
  assignmentId: string;
  date: IsoDate;
}

export interface PayInput {
  workweekStartsOn: Weekday;
  shifts: Shift[];
  overtimeRules: OvertimeRule[];
  jurisdictionRules: JurisdictionRule[];
  minimumWageRules: MinimumWageRule[];
  premiumRules?: PremiumRule[];
  confirmations?: Confirmation[];
}

export interface Line {
  workerId: string;
  assignmentId: string;
  clientId: string;
  workweekStart: IsoDate;
  type: EarningType;
  minutes: number;
  /** Cents per hour, exact. */
  rate: Fraction;
  amountCents: number;
  ruleId: string;
  /** Plain-English trace a payroll clerk can check: inputs, rule, arithmetic, rounding. */
  explain: string;
  entryIds: string[];
}

export type IssueCode =
  | "invalid_input"
  | "unknown_jurisdiction"
  | "rule_not_supported_yet"
  | "rule_data_missing"
  | "rule_data_invalid"
  | "below_minimum_wage"
  | "multiple_pay_rates_with_overtime"
  | "zero_or_negative_pay"
  // warnings (do not block):
  | "allocation_order_assumed"
  | "premium_not_applicable";

export interface Issue {
  code: IssueCode;
  workerId?: string;
  workerName?: string;
  workweekStart?: IsoDate;
  jurisdiction?: string;
  ruleCode?: string;
  date?: IsoDate;
  entryIds?: string[];
  message: string;
}

export interface PayResult {
  rulesVersion: string;
  payLines: Line[];
  billLines: Line[];
  blockers: Issue[];
  warnings: Issue[];
}
