/**
 * RULE: holiday pay under the agency's (or client's) holiday policy, and how the law counts it.
 *
 * No federal, California, Illinois or Massachusetts law requires holiday pay or a holiday premium
 * (DOL holiday page; 29 C.F.R. § 778.219(b)(1) "the statute (which does not require premium pay for a
 * holiday)"; DLSE holiday FAQ; IDOL vacation FAQ; mass.gov blue laws guide), so the policy is data.
 * The law still sets how that pay counts:
 * - a premium for hours worked on a holiday of at least the cut-off multiple of the rate (1.5×, a
 *   dated rule row) stays out of the regular rate (29 U.S.C. § 207(e)(6)); a smaller one goes into it
 *   and is never credited toward overtime (29 C.F.R. § 778.203); California follows (DLSE Manual
 *   49.1.2.4);
 * - pay for a holiday not worked is not hours worked and stays out of the regular rate
 *   (29 U.S.C. § 207(e)(2); 29 C.F.R. §§ 778.218, 778.219).
 * Holiday premiums are paid on top of overtime, never credited against it (the owner's decision C4).
 * When a client has its own policy, the worker is paid the better of the client's and the agency's
 * terms for the date (the agency's promise to its worker stands), and the client is billed by its
 * own policy only (decision C7 in .claude/plans/slice-c-pay-rules.md).
 */
import { isEffective } from "../dates";
import type { Fraction, HolidayPolicy, IsoDate, RegularRateRule } from "../types";

export const HOLIDAY_WORKED = "holiday_worked";
export const HOLIDAY_NOT_WORKED = "holiday_not_worked";
export const HOLIDAY_WORKED_CITATION = "29 U.S.C. § 207(e)(6); 29 C.F.R. §§ 778.203, 778.219";
export const HOLIDAY_NOT_WORKED_CITATION = "29 U.S.C. § 207(e)(2); 29 C.F.R. §§ 778.218, 778.219";
/** The rule row holding the multiple at and above which premium pay stays out of the regular rate. */
export const PREMIUM_EXCLUDED = "premium_excluded_from_regular_rate";

/** What a holiday pays and bills for a client's work on a date, and whose policy each comes from. */
export interface HolidayTerms {
  /** The policy whose worked-holiday multiplier is paid (the better of the client's and the agency's). */
  pay: HolidayPolicy | null;
  workedMultiplier: Fraction;
  /** The policy whose not-worked minutes are paid (the larger). */
  notWorked: HolidayPolicy | null;
  notWorkedMinutes: number;
  /** The policy billed: the client's own when it has any, else the agency's. */
  bill: HolidayPolicy | null;
}

const ONE: Fraction = { num: 1, den: 1 };
const more = (a: Fraction, b: Fraction) => a.num * b.den > b.num * a.den;

/**
 * The holiday terms for a client's work on a date, or ambiguous when two policies at one level
 * (the client's own, or the agency's) list the date. Null when no policy lists it.
 */
export function holidayTermsFor(policies: HolidayPolicy[], clientId: string, date: IsoDate): { terms: HolidayTerms | null; ambiguous: boolean } {
  const own = policies.filter((p) => p.clientId === clientId);
  const ownToday = own.filter((p) => p.dates.includes(date));
  const agencyToday = policies.filter((p) => p.clientId === null && p.dates.includes(date));
  if (ownToday.length > 1 || agencyToday.length > 1) return { terms: null, ambiguous: true };
  const client = ownToday[0] ?? null;
  const agency = agencyToday[0] ?? null;
  if (!client && !agency) return { terms: null, ambiguous: false };
  // Ties go to the client's own policy (its name is the one the explanation gives).
  const pay = [client, agency].filter((p): p is HolidayPolicy => p !== null).reduce((best, p) => (more(p.workedMultiplier, best.workedMultiplier) ? p : best));
  const notWorked = [client, agency].filter((p): p is HolidayPolicy => p !== null).reduce((best, p) => (p.notWorkedMinutes > best.notWorkedMinutes ? p : best));
  return {
    terms: {
      pay: more(pay.workedMultiplier, ONE) ? pay : null,
      workedMultiplier: pay.workedMultiplier,
      notWorked: notWorked.notWorkedMinutes > 0 ? notWorked : null,
      notWorkedMinutes: notWorked.notWorkedMinutes,
      bill: own.length > 0 ? client : agency,
    },
    ambiguous: false,
  };
}

/** The cut-off rule in effect on a date (federal; California follows it), or null when none is on file. */
export const premiumExclusionOn = (rules: RegularRateRule[], date: IsoDate) => rules.find((r) => r.jurisdiction === "US" && r.ruleCode === PREMIUM_EXCLUDED && isEffective(date, r.effectiveFrom, r.effectiveTo)) ?? null;

/** A worked-holiday premium below the cut-off counts in the regular rate (§ 778.203); at or above it, it does not (§ 207(e)(6)). */
export const premiumCountsInRegularRate = (m: Fraction, cutOff: Fraction) => m.num * cutOff.den < cutOff.num * m.den;
