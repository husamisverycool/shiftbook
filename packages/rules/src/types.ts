import type { EqualPayRate } from "./rules/il-equal-pay-rate";

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
  /** Pay for reporting to work and being given less than the scheduled work (California, Massachusetts). */
  | "REPORTING_PAY"
  /** The premium on hours worked on a holiday, under the agency's (or client's) holiday policy. */
  | "HOL"
  /** Pay for a holiday not worked, when a person confirmed the worker is eligible. Not hours worked. */
  | "HOL_NOT_WORKED"
  | "DIFF"
  | "MEAL_PREMIUM"
  | "REST_PREMIUM"
  | "MIN_GUARANTEE"
  /** A nondiscretionary bonus (a lump sum: minutes 0). */
  | "BONUS"
  /** California: overtime on a flat-sum bonus (Alvarado v. Dart Container). */
  | "BONUS_OT";

/**
 * The earning types that are time worked (and billed minute for minute). Every other line's minutes
 * are paid minutes only (a premium, a guarantee, holiday pay): never hours worked, never counted
 * toward overtime, hours totals or the Illinois equal-pay counter.
 */
export const WORKED_TIME: readonly EarningType[] = ["REG", "OT", "DT"];

/** 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * How a client is billed for overtime and double time: at the rate card's multiplier, at straight
 * time, not at all, or at the multiplier only for the hours that would be overtime had the worker
 * worked only at this client's sites (the rest at straight time; the agency bears that premium).
 */
export type OvertimeBillingRule = "multiplier" | "straight_time" | "not_billable" | "own_sites_only";

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
  /** Why the pay rate is above the rate card's (the Illinois equal-pay rate), for the explanation; set by the engine. */
  payRateExplain?: string;
  billOtMultiplier: Fraction;
  /** The rate card's double-time bill multiplier (California double time). */
  billDtMultiplier: Fraction;
  otBillingRule: OvertimeBillingRule;
  /** A day the worker reported (or was sent) but did no work: 0 minutes, no time entry; only reporting pay can follow. */
  reportedOnly?: boolean;
  /** Illinois day and temporary labor (820 ILCS 175): false for clerical or professional work. Default true. */
  dayAndTemporaryLabor?: boolean;
  /** The client's name, for messages a person reads (the id is used when it is missing). */
  clientName?: string;
  /** The client's billing profile bills confirmed meal and rest premiums (at the bill rate). Default no. */
  billsPremiums?: boolean;
  /** The client's billing profile bills minimum pay for a short day (at the bill rate). Default no. */
  billsGuarantees?: boolean;
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

export type ConfirmationKind = "meal_period_missed" | "rest_period_missed" | "reported_short" | "holiday_not_worked";

/** Something a person confirmed about a worker's day on one assignment (the engine computes, a person confirms). */
export interface Confirmation {
  id: string;
  kind: ConfirmationKind;
  workerId: string;
  /** For messages a person reads when the worker has no hours in the run. */
  workerName?: string;
  assignmentId: string;
  date: IsoDate;
  /** reported_short: the minutes the worker was scheduled for that day (California and Massachusetts need them). */
  scheduledMinutes?: number | null;
  /** reported_short: placed at another client the same shift (Illinois day labor). */
  reassigned?: boolean;
}

/**
 * A dated minimum-pay rule for a worker who reports (or is sent) and gets less work than scheduled:
 * California reporting time, Massachusetts reporting pay, the Illinois day-labor minimum. Every
 * number is data; which fields are used depends on the rule code (one rule file each).
 */
export interface GuaranteeRule {
  jurisdiction: string;
  ruleCode: string;
  /** Minutes due in all (Massachusetts 180; Illinois 240). */
  dueMinutes: number | null;
  /** Illinois: minutes due for the whole shift when placed elsewhere the same shift (120). */
  reassignedDueMinutes: number | null;
  /** California: the share of the scheduled day due (1/2). */
  scheduledFraction: Fraction | null;
  /** California: the least and most minutes due (120, 240). */
  minMinutes: number | null;
  maxMinutes: number | null;
  /** Massachusetts: owed only when at least this much was scheduled (180). */
  minScheduledMinutes: number | null;
  /** Paid at the week's regular rate, or at the day's own pay rate (never below the minimum wage). */
  basis: "regular_rate" | "pay_rate";
  effectiveFrom: IsoDate;
  effectiveTo: IsoDate | null;
  citation: string;
}

/**
 * A holiday policy: agency data, not law (no law here requires holiday pay). A client's own policy
 * wins over the agency's default (clientId null). The law still decides how its pay counts: a worked
 * holiday premium of 1.5× or more stays out of the regular rate, a smaller one goes in, and pay for a
 * holiday not worked is not hours worked (29 U.S.C. § 207(e); 29 C.F.R. §§ 778.203, 778.218, 778.219).
 */
export interface HolidayPolicy {
  clientId: string | null;
  name: string;
  dates: IsoDate[];
  /** Pay for hours worked on a holiday, as a multiple of the pay rate (1/1: no premium). */
  workedMultiplier: Fraction;
  /** Minutes paid for a holiday not worked, when a person confirms the worker is eligible (0: none). */
  notWorkedMinutes: number;
  /** Bill for hours worked on a holiday, as a multiple of the bill rate; null bills them like any hours. */
  billWorkedMultiplier: Fraction | null;
  /** Whether a holiday not worked is billed (at the bill rate). */
  billNotWorked: boolean;
}

/**
 * A bonus for one workweek, entered and classified by a person. Nondiscretionary bonuses count in
 * the regular rate (29 C.F.R. §§ 778.208–778.211); a flat-sum bonus in California has its own
 * overtime (Alvarado v. Dart Container Corp. (2018) 4 Cal.5th 542), and elsewhere counts like any
 * nondiscretionary bonus. A bonus for a longer period (apportioned back) is not handled here.
 */
export interface Bonus {
  id: string;
  workerId: string;
  /** For messages a person reads when the worker has no hours in the run. */
  workerName?: string;
  assignmentId: string;
  workweekStart: IsoDate;
  amountCents: number;
  kind: "nondiscretionary" | "flat_sum";
}

/**
 * A dated rule about the regular rate itself: premium pay at or above `multiplier` × the rate stays
 * out of the regular rate (29 U.S.C. § 207(e)(6), ruleCode "premium_excluded_from_regular_rate").
 */
export interface RegularRateRule {
  jurisdiction: string;
  ruleCode: string;
  multiplier: Fraction;
  effectiveFrom: IsoDate;
  effectiveTo: IsoDate | null;
  citation: string;
}

/**
 * Illinois equal pay (820 ILCS 175/42): the counter's numbers as a dated rule row. Minutes worked by
 * one laborer at one third-party client on covered work, from `countsFrom` on, in rolling windows.
 */
export interface EqualPayRule {
  jurisdiction: string;
  ruleCode: string;
  /** Work before this date does not count. */
  countsFrom: IsoDate;
  /** A heads-up before the trigger (600 hours: Shiftbook's choice, not law). */
  warnMinutes: number;
  windowMonths: number;
  /** "More than 720 hours within a 12-month period". */
  triggerMinutes: number;
  longWindowMonths: number;
  /** "More than 4,160 hours within a 48-month period". */
  longTriggerMinutes: number;
  effectiveFrom: IsoDate;
  effectiveTo: IsoDate | null;
  citation: string;
}

/** Covered minutes a worker worked at a client on one day before this run (rolling counters need them). */
export interface HoursWorked {
  workerId: string;
  clientId: string;
  date: IsoDate;
  minutes: number;
}

export type ObligationKind = "il_equal_pay_720h" | "il_equal_pay_4160h";

/** An obligation already on file from an earlier run: once a counter has crossed, it does not reset. */
export interface ObligationOnFile {
  kind: ObligationKind;
  workerId: string;
  clientId: string;
  crossedOn: IsoDate;
}

/** Something the agency must now do because of the hours worked (SPEC §4 Obligation). */
export interface Obligation {
  kind: ObligationKind;
  jurisdiction: string;
  ruleCode: string;
  workerId: string;
  workerName: string;
  clientId: string;
  /** The day of the first minute over the threshold; its minute of the day when the shift's start is known. */
  crossedOn: IsoDate;
  crossedAtMinute: number | null;
  /** The first day of the rolling window on that day. */
  windowStart: IsoDate;
  thresholdMinutes: number;
  /** Minutes worked after the crossing in this run, and their time entries. */
  minutesAfter: number;
  /** Minutes worked after the crossing in earlier periods (a crossing found in earlier hours). */
  earlierMinutesAfter: number;
  entryIds: string[];
  citation: string;
  message: string;
}

export interface PayInput {
  workweekStartsOn: Weekday;
  shifts: Shift[];
  overtimeRules: OvertimeRule[];
  jurisdictionRules: JurisdictionRule[];
  minimumWageRules: MinimumWageRule[];
  premiumRules?: PremiumRule[];
  guaranteeRules?: GuaranteeRule[];
  confirmations?: Confirmation[];
  holidayPolicies?: HolidayPolicy[];
  bonuses?: Bonus[];
  equalPayRules?: EqualPayRule[];
  /** The Illinois equal-pay rates on file per worker and client, from a date (820 ILCS 175/42). */
  equalPayRates?: EqualPayRate[];
  regularRateRules?: RegularRateRule[];
  /** Covered minutes worked before this run, per worker, client and day. */
  hoursWorked?: HoursWorked[];
  obligationsOnFile?: ObligationOnFile[];
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

/** Every issue code the engine can give (a screen needs a label for each, in every language). */
export const ISSUE_CODES = [
  "invalid_input",
  "unknown_jurisdiction",
  "rule_not_supported_yet",
  "rule_data_missing",
  "rule_data_invalid",
  "below_minimum_wage",
  "multiple_pay_rates_with_overtime",
  "zero_or_negative_pay",
  // warnings (do not block):
  "allocation_order_assumed",
  "premium_not_applicable",
  "bonus_kind_check",
  "approaching_equal_pay_hours",
  "equal_pay_obligation",
  "equal_pay_rate_missing",
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

export interface Issue {
  code: IssueCode;
  workerId?: string;
  workerName?: string;
  workweekStart?: IsoDate;
  clientId?: string;
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
  obligations: Obligation[];
}
