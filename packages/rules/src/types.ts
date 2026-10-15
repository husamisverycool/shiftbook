/** ISO calendar date, "YYYY-MM-DD". */
export type IsoDate = string;

/** An exact rational number; rates are cents per hour as num/den, multipliers likewise. */
export type Fraction = { num: number; den: number };

export type EarningType =
  | "REG"
  | "OT"
  | "DT"
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
  date: IsoDate;
  /** Minutes after midnight the shift started, for ordering within a day; null if unknown. */
  startMinute: number | null;
  minutes: number;
  payRateCents: number;
  billRateCents: number;
  billOtMultiplier: Fraction;
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
  ruleCode: string;
  effectiveFrom: IsoDate;
  effectiveTo: IsoDate | null;
  citation: string;
}

export interface PayInput {
  workweekStartsOn: Weekday;
  shifts: Shift[];
  overtimeRules: OvertimeRule[];
  jurisdictionRules: JurisdictionRule[];
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
  | "multiple_pay_rates_with_overtime"
  | "zero_or_negative_pay";

export interface Issue {
  code: IssueCode;
  workerId?: string;
  workerName?: string;
  workweekStart?: IsoDate;
  jurisdiction?: string;
  ruleCode?: string;
  entryIds?: string[];
  message: string;
}

export interface PayResult {
  rulesVersion: string;
  payLines: Line[];
  billLines: Line[];
  blockers: Issue[];
}
