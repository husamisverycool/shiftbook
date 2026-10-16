/**
 * RULE: holiday pay under the agency's (or client's) holiday policy, and how the law counts it.
 *
 * No federal, California, Illinois or Massachusetts law requires holiday pay or a holiday premium
 * (DOL holiday page; 29 C.F.R. § 778.219(b)(1) "the statute (which does not require premium pay for a
 * holiday)"; DLSE holiday FAQ; IDOL vacation FAQ; mass.gov blue laws guide), so the policy is data.
 * The law still sets how that pay counts:
 * - a premium for hours worked on a holiday of at least 1.5× the rate stays out of the regular rate
 *   (29 U.S.C. § 207(e)(6)); a smaller one goes into it and is never credited toward overtime
 *   (29 C.F.R. § 778.203);
 * - pay for a holiday not worked is not hours worked and stays out of the regular rate (§ 778.218).
 * Holiday premiums are paid on top of overtime, never credited against it (the safe reading: the
 * owner's decision C4 in .claude/plans/slice-c-pay-rules.md).
 */
import type { Fraction, HolidayPolicy, IsoDate } from "../types";

export const HOLIDAY_WORKED = "holiday_worked";
export const HOLIDAY_NOT_WORKED = "holiday_not_worked";
export const HOLIDAY_CITATION = "29 U.S.C. § 207(e)(6); 29 C.F.R. §§ 778.203, 778.218, 778.219";

/** The policy covering a client's worksite on a date: the client's own, else the agency's; several at one level is ambiguous. */
export function holidayPolicyFor(policies: HolidayPolicy[], clientId: string, date: IsoDate): { policy: HolidayPolicy | null; ambiguous: boolean } {
  for (const level of [policies.filter((p) => p.clientId === clientId), policies.filter((p) => p.clientId === null)]) {
    const covering = level.filter((p) => p.dates.includes(date));
    if (covering.length > 1) return { policy: null, ambiguous: true };
    if (covering.length === 1) return { policy: covering[0]!, ambiguous: false };
  }
  return { policy: null, ambiguous: false };
}

/** A worked-holiday premium below 1.5× counts in the regular rate (§ 778.203); 1.5× or more does not (§ 207(e)(6)). */
export const premiumCountsInRegularRate = (m: Fraction) => m.num * 2 < m.den * 3;
