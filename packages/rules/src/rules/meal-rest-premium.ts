/**
 * RULE: meal- and rest-period premiums (California).
 *
 * - Cal. Lab. Code § 226.7(c): "one additional hour of pay at the employee's regular rate of
 *   compensation for each workday that the meal or rest or recovery period is not provided." The
 *   section is replaced by a successor version on January 1, 2027 with the same premium sentence:
 *   two dated rule rows.
 * - Ferra v. Loews Hollywood Hotel, LLC (2021) 11 Cal.5th 858: "regular rate of compensation" is the
 *   regular rate of pay used for overtime (the week's weighted average, incentive pay included).
 * - UPS v. Superior Court (2011) 196 Cal.App.4th 57: at most one meal and one rest premium per workday.
 * - Not hours worked (DLSE meal-period FAQ): the premium never counts toward overtime, and it stays
 *   out of the regular rate (Murphy v. Kenneth Cole (2007) 40 Cal.4th 1094; DLSE Manual 49.1.2.4).
 * The engine computes, a person confirms: a premium is paid only for a confirmed missed period.
 * Minutes per premium and the per-workday cap are rule data.
 */
import { isEffective } from "../dates";
import type { ConfirmationKind, GuaranteeRule, IsoDate, PremiumRule } from "../types";

export const CA_MEAL_PREMIUM = "ca_meal_premium";
export const CA_REST_PREMIUM = "ca_rest_premium";

export const PREMIUM_OF: Partial<Record<ConfirmationKind, { ruleCode: string; type: "MEAL_PREMIUM" | "REST_PREMIUM"; label: string; what: string }>> = {
  meal_period_missed: { ruleCode: CA_MEAL_PREMIUM, type: "MEAL_PREMIUM", label: "Meal-period premium", what: "a meal period was not provided" },
  rest_period_missed: { ruleCode: CA_REST_PREMIUM, type: "REST_PREMIUM", label: "Rest-period premium", what: "a rest period was not provided" },
};

/** The premium rule in effect for a worksite's state on a date, if that state has one. */
export function premiumRuleFor(rules: PremiumRule[], jurisdiction: string, ruleCode: string, date: IsoDate): PremiumRule | null {
  return rules.find((r) => r.jurisdiction === jurisdiction && r.ruleCode === ruleCode && isEffective(date, r.effectiveFrom, r.effectiveTo)) ?? null;
}

/** The reporting or minimum-pay rule in effect for a worksite's state on a date (one per state). */
export function guaranteeRuleFor(rules: GuaranteeRule[], jurisdiction: string, date: IsoDate): GuaranteeRule | null {
  return rules.find((r) => r.jurisdiction === jurisdiction && isEffective(date, r.effectiveFrom, r.effectiveTo)) ?? null;
}
