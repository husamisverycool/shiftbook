/**
 * RULE: New Jersey temporary laborer sent and not used.
 *
 * N.J.S.A. 34:8D-6(g) (Temporary Workers' Bill of Rights, P.L.2023, c.10): a temporary laborer in a
 * designated classification placement "who is contracted ... to work at a third party client's
 * worksite but is not utilized by the third party client shall be paid ... for a minimum of four hours
 * of pay at the agreed upon rate of pay"; contracted to work at another location during the same
 * shift: "a minimum of two hours of pay". The same shape as the Illinois day-labor minimum, so the
 * same arithmetic: the shortfall at the agreed rate, not hours worked. Applies only where the job
 * order is day and temporary labor (Tabulado's stand-in for the designated classifications of
 * N.J.S.A. 34:8D-2). Minutes are rule data.
 */
import type { GuaranteeRule } from "../types";
import { ilDayLaborMinimum } from "./il-day-labor-minimum";

export const NJ_SENT_NOT_USED = "nj_sent_not_used";

/** `atClient`: minutes worked that day at the client the worker was sent to; `allDay`: at every client that day. */
export function njSentNotUsed(rule: GuaranteeRule, reassigned: boolean, atClient: number, allDay: number): { dueMinutes: number; shortfall: number } {
  return ilDayLaborMinimum(rule, reassigned, atClient, allDay);
}
