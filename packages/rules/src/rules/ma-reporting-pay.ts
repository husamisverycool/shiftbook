/**
 * RULE: Massachusetts reporting pay.
 *
 * 454 CMR 27.04(1): "When an employee who is scheduled to work three or more hours reports for duty
 * at the time set by the employer, and that employee is not provided with the expected hours of work,
 * the employee shall be paid for at least three hours on such day at no less than the basic minimum
 * wage." The research found the computation ambiguous; this uses the safe reading (docs/research/
 * pay-rules-slice-c.md §3): the day's pay comes to at least three hours, the shortfall paid at the
 * day's own rate (never below the minimum wage), not as hours worked. Minutes are rule data.
 */
import type { GuaranteeRule } from "../types";

export const MA_REPORTING_PAY = "ma_reporting_pay";

export function maReportingPay(rule: GuaranteeRule, scheduledMinutes: number, workedMinutes: number): { dueMinutes: number; shortfall: number } {
  if (scheduledMinutes < (rule.minScheduledMinutes ?? 0)) return { dueMinutes: 0, shortfall: 0 };
  const dueMinutes = rule.dueMinutes ?? 0;
  return { dueMinutes, shortfall: Math.max(0, dueMinutes - workedMinutes) };
}
