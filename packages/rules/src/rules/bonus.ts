/**
 * RULE: bonuses.
 *
 * - Federal (and Illinois, Massachusetts): a nondiscretionary bonus for the workweek is part of the
 *   week's pay and of its regular rate, so overtime is paid on a regular rate that includes it
 *   (29 C.F.R. §§ 778.208–778.211). A bonus is discretionary only if both the fact and the amount are
 *   decided at the employer's sole discretion at or near the end of the period (§ 778.211): a person
 *   classifies every bonus.
 * - California flat-sum bonus (Alvarado v. Dart Container Corp. of California (2018) 4 Cal.5th 542;
 *   DLSE Manual 49.2.4.2): the bonus is divided by the non-overtime hours of the period, and
 *   overtime on it is paid at the full overtime multiple (1.5× or 2×) of that bonus rate. Here a
 *   bonus belongs to one workweek; one earned over a longer period is not handled yet.
 */
export const BONUS = "bonus";
export const BONUS_CITATION = "29 C.F.R. §§ 778.208–778.211";
export const CA_FLAT_SUM_BONUS = "ca_flat_sum_bonus";
export const CA_FLAT_SUM_CITATION = "Alvarado v. Dart Container Corp. of California (2018) 4 Cal.5th 542; DLSE Enforcement Manual 49.2.4.2";

type Worth = { num: bigint; den: bigint };

/** a + b for two exact amounts of cents. */
export const addWorth = (a: Worth, b: Worth): Worth => ({ num: a.num * b.den + b.num * a.den, den: a.den * b.den });

/**
 * Overtime on a California flat-sum bonus, exact, in cents: Σ premium minutes × that premium's full
 * multiple × bonus ÷ minutes not paid at a premium (Alvarado: 1.5× or 2× of the bonus's hourly share,
 * because the bonus was earned by the non-overtime hours alone).
 */
export function alvaradoWorth(parts: { minutes: number; multiplier: { num: number; den: number } }[], bonusCents: number, nonOvertimeMinutes: number): Worth {
  if (nonOvertimeMinutes <= 0) throw new Error("a flat-sum bonus needs hours outside overtime to spread over");
  let worth: Worth = { num: 0n, den: 1n };
  for (const p of parts) {
    worth = addWorth(worth, { num: BigInt(p.minutes) * BigInt(p.multiplier.num) * BigInt(bonusCents), den: BigInt(p.multiplier.den) * BigInt(nonOvertimeMinutes) });
  }
  return worth;
}
