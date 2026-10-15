/**
 * RULE: California reporting-time pay.
 *
 * IWC wage orders § 5(A) (e.g. 8 CCR § 11070 § 5(A)): an employee who reports for work "and is not
 * put to work or is furnished less than half said employee's usual or scheduled day's work, ... shall
 * be paid for half the usual or scheduled day's work, but in no event for less than two (2) hours
 * nor more than four (4) hours, at the employee's regular rate of pay." The pay for the day comes to
 * that amount: the minutes worked count toward it and the rest is reporting-time pay, which is not
 * hours worked and stays out of the regular rate (DLSE Manual 49.1.2.4; Murphy v. Kenneth Cole).
 * Not modeled here (flagged in the research): the second report in a day (§ 5(B)) and the
 * exceptions of § 5(C). The share, minimum and maximum are rule data; minutes round up.
 */
import { ceilDiv, mul } from "../int";
import type { GuaranteeRule } from "../types";

export const CA_REPORTING_TIME = "ca_reporting_time";

export function caReportingTime(rule: GuaranteeRule, scheduledMinutes: number, workedMinutes: number): { dueMinutes: number; halfMinutes: number; shortfall: number } {
  const f = rule.scheduledFraction!;
  const halfMinutes = ceilDiv(mul(scheduledMinutes, f.num), f.den);
  if (workedMinutes >= halfMinutes) return { dueMinutes: 0, halfMinutes, shortfall: 0 };
  const dueMinutes = Math.min(Math.max(halfMinutes, rule.minMinutes ?? 0), rule.maxMinutes ?? halfMinutes);
  return { dueMinutes, halfMinutes, shortfall: Math.max(0, dueMinutes - workedMinutes) };
}
