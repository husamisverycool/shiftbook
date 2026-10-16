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
import { mul, reduceFraction as reduce, reduceFractionBig } from "../int";
import type { Fraction, Shift } from "../types";

export const REGULAR_RATE_CITATION = "29 C.F.R. § 778.115; § 778.111(a)";
export const RATE_FLOOR_CITATION = "29 C.F.R. § 778.107";
/** California computes the regular rate the same way (DLSE Enforcement Manual 49.2.5; DLSE overtime FAQ). */
export const CA_REGULAR_RATE_CITATION = "DLSE Enforcement Manual 49.2.5";

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

/**
 * The regular rate when pay other than the hourly rates counts in it — a nondiscretionary bonus
 * (29 C.F.R. §§ 778.208–778.211), a holiday premium below 1.5× (§ 778.203): straight-time earnings
 * plus that pay, divided by the hours worked (§ 778.109), exact. Each extra is an exact amount of
 * cents. Null when the exact rate does not fit in safe integers (the week is then held).
 */
export function regularRateWith(shifts: { minutes: number; payRateCents: number }[], extraCents: Fraction[]): Fraction | null {
  // num/den is 60 × the cents earned: Σ minutes × cents per hour.
  let num = 0n;
  let den = 1n;
  let minutes = 0n;
  for (const s of shifts) {
    num += BigInt(s.minutes) * BigInt(s.payRateCents);
    minutes += BigInt(s.minutes);
  }
  if (minutes <= 0n) throw new Error("the regular rate needs hours worked");
  for (const e of extraCents) {
    num = num * BigInt(e.den) + 60n * BigInt(e.num) * den;
    den *= BigInt(e.den);
  }
  return reduceFractionBig(num, den * minutes);
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

/**
 * The exact worth, in cents, of a week's premiums (what overtime and double time add on top of
 * straight time): Σ minutes × (multiplier − 1) × that day's premium base ÷ 60, as a fraction in
 * big integers so two ways of splitting the week compare exactly.
 */
export function premiumWorth(
  splits: { shift: Shift; premiums: { minutes: number; multiplier: Fraction }[] }[],
  regularRate: Fraction,
  floorOf: Map<Shift, number>,
): { num: bigint; den: bigint } {
  let num = 0n;
  let den = 1n;
  for (const { shift, premiums } of splits) {
    const { base } = premiumBase(regularRate, floorOf.get(shift)!);
    for (const p of premiums) {
      const n = BigInt(p.minutes) * BigInt(p.multiplier.num - p.multiplier.den) * BigInt(base.num);
      const d = BigInt(p.multiplier.den) * BigInt(base.den) * 60n;
      num = num * d + n * den;
      den = den * d;
    }
  }
  return { num, den };
}

/** a > b for two exact fractions (positive denominators). */
export const worthMore = (a: { num: bigint; den: bigint }, b: { num: bigint; den: bigint }) => a.num * b.den > b.num * a.den;
