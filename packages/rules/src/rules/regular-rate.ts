/**
 * RULE: the regular rate, and the overtime premium paid on it.
 *
 * - 29 C.F.R. § 778.115: with two or more rates in one workweek, the regular rate is the weighted
 *   average — total straight-time earnings divided by total hours worked.
 * - 29 C.F.R. § 778.111(a) (and § 778.110(a) for one rate): overtime is straight time for every hour
 *   worked plus (multiplier − 1) × the regular rate for each overtime hour.
 * - 29 C.F.R. § 778.107: the regular rate may never be less than the minimum wage; the premium's
 *   base on a day is the higher of the regular rate and that day's minimum wage.
 * Illinois (56 Ill. Adm. Code 210.420, 210.430), Massachusetts (454 CMR 27.03(3)) and California
 * (DLSE Enforcement Manual 49.2.5) compute it the same way. The "rate of the job" option
 * (§ 778.419) is not offered: it needs an agreement made before the work, and the weighted average
 * is always lawful (docs/research/pay-rules-slice-c.md §1).
 *
 * The regular rate is an exact fraction of cents per hour and is never rounded; only line amounts
 * are rounded, once. The multiplier comes from the overtime rule data.
 */
import { mul, reduceFraction as reduce } from "../int";
import type { Fraction } from "../types";

export const REGULAR_RATE_CITATION = "29 C.F.R. § 778.115; § 778.111(a)";
export const RATE_FLOOR_CITATION = "29 C.F.R. § 778.107";

/** Σ minutes × rate ÷ Σ minutes, in cents per hour (Σ minutes > 0). */
export function weightedRegularRate(shifts: { minutes: number; payRateCents: number }[]): Fraction {
  let earned = 0;
  let minutes = 0;
  for (const s of shifts) {
    earned += mul(s.minutes, s.payRateCents);
    minutes += s.minutes;
  }
  return reduce({ num: earned, den: minutes });
}

/** The premium's base on a day: the regular rate, or that day's minimum wage when it is higher. */
export function premiumBase(regularRate: Fraction, floorCents: number): { base: Fraction; floorApplies: boolean } {
  return mul(floorCents, regularRate.den) > regularRate.num ? { base: { num: floorCents, den: 1 }, floorApplies: true } : { base: regularRate, floorApplies: false };
}

/** An overtime hour's rate on a shift: its own rate + (multiplier − 1) × the premium base. */
export function overtimeRate(payRateCents: number, base: Fraction, multiplier: Fraction): Fraction {
  return reduce({
    num: mul(payRateCents, multiplier.den, base.den) + mul(multiplier.num - multiplier.den, base.num),
    den: mul(multiplier.den, base.den),
  });
}
