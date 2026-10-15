/**
 * RULE: Illinois day and temporary labor minimum pay.
 *
 * 820 ILCS 175/30(g): a day or temporary laborer "contracted by a day and temporary labor service
 * agency to work at a third party client's worksite but is not utilized by the third party client
 * shall be paid ... for a minimum of 4 hours of pay at the agreed upon rate of pay. However, in the
 * event the day and temporary labor service agency contracts the day or temporary laborer to work at
 * another location during the same shift, the day or temporary laborer shall be paid ... for a minimum
 * of 2 hours of pay." 56 Ill. Adm. Code 260.450(b) (amended effective April 28, 2026) extends this to
 * a laborer "not utilized by the third party client for a minimum of 4 hours", and when placed
 * elsewhere the same shift, "for all hours worked on the shift but no less than 2 hours."
 * Safe reading (research §4): the shortfall is paid at the agreed rate without crediting overtime
 * already earned; it is not hours worked. Applies only to day and temporary labor (not clerical or
 * professional work, § 5). Minutes are rule data.
 */
import type { GuaranteeRule } from "../types";

export const IL_DAY_LABOR_MINIMUM = "il_day_labor_minimum";

/** `atClient`: minutes worked that day at the client the worker was sent to; `allDay`: at every client that day. */
export function ilDayLaborMinimum(rule: GuaranteeRule, reassigned: boolean, atClient: number, allDay: number): { dueMinutes: number; shortfall: number } {
  const dueMinutes = (reassigned ? rule.reassignedDueMinutes : rule.dueMinutes) ?? 0;
  return { dueMinutes, shortfall: Math.max(0, dueMinutes - (reassigned ? allDay : atClient)) };
}
