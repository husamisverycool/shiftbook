/**
 * Estimated burden on one pay line (SPEC §15; slice i, decision I2): employer taxes as a percentage of
 * the pay, plus workers' comp per $100 of the pay less the overtime premium (one third of time and a
 * half, one half of double time, all of the half-time on a bonus) while the agency leaves the premium
 * out (most states do). Rates are parts per million of pay. One exact fraction, rounded half up once;
 * the explain string shows each part and the rounding. A missing rate counts as zero and says so.
 */
import { exactDecimal, formatCents, formatMoney, roundHalfUpBig } from "@shiftbook/rules";

export interface BurdenRates {
  /** Employer taxes in parts per million of pay, or null when no rate applies. */
  taxPpm: number | null;
  /** The worksite's state the tax rate was chosen for. */
  taxState: string | null;
  /** Workers' comp in parts per million of pay ($4.00 per $100 = 40,000), or null. */
  wcPpm: number | null;
  wcState: string | null;
  /** The rate card's class code; null when the card has none. */
  wcClass: string | null;
  excludeOtPremium: boolean;
}

export interface BurdenLineInput {
  type: string;
  amountCents: number;
}

export interface LineBurden {
  cents: number;
  incomplete: boolean;
  explain: string;
}

const MILLION = 1_000_000n;

/** The share of a line's pay that is not overtime premium: {num, den}. */
function wcShare(type: string, exclude: boolean): { num: bigint; den: bigint; text: string | null } {
  if (!exclude) return { num: 1n, den: 1n, text: null };
  if (type === "OT") return { num: 2n, den: 3n, text: "2/3" };
  if (type === "DT") return { num: 1n, den: 2n, text: "1/2" };
  if (type === "BONUS_OT") return { num: 0n, den: 1n, text: "none" };
  return { num: 1n, den: 1n, text: null };
}

/** An exact amount of cents (num/den) as dollars, as the pay lines show them: $20.6212…, $0.1175. */
function dollars(num: bigint, den: bigint): string {
  const negative = num < 0n;
  return `${negative ? "-" : ""}${formatMoney({ num: Number(negative ? -num : num), den: Number(den) })}`;
}

/** 117500 → "11.75%": at least two decimals. */
export const percentOf = (ppm: number) => {
  const [whole, frac = ""] = exactDecimal(ppm, 10_000).split(".");
  return `${whole}.${frac.padEnd(2, "0")}%`;
};
export const perHundred = (ppm: number) => {
  const text = exactDecimal(ppm, 10_000);
  const [whole, frac = ""] = text.split(".");
  return `$${whole}.${frac.padEnd(2, "0")}`;
};

export function lineBurden(line: BurdenLineInput, rates: BurdenRates): LineBurden {
  const amount = BigInt(line.amountCents);
  const share = wcShare(line.type, rates.excludeOtPremium);
  const tax = rates.taxPpm === null ? 0n : BigInt(rates.taxPpm);
  const wc = rates.wcPpm === null || rates.wcClass === null ? 0n : BigInt(rates.wcPpm);
  // amount × tax / 1e6 + amount × share × wc / 1e6, over one denominator.
  const den = MILLION * share.den;
  const num = amount * (tax * share.den + wc * share.num);
  const cents = roundHalfUpBig(num, den);
  const pay = formatCents(line.amountCents);
  const parts: string[] = [];
  parts.push(
    rates.taxPpm === null
      ? `No employer tax rate for ${rates.taxState ?? "the worksite's state"} (counted as $0.00)`
      : `Employer taxes (${rates.taxState ?? "any other state"}) ${percentOf(rates.taxPpm)} of ${pay} = ${dollars(amount * tax, MILLION)}`,
  );
  if (rates.wcClass === null) parts.push("no workers' comp class on the rate card (counted as $0.00)");
  else if (rates.wcPpm === null) parts.push(`no workers' comp rate for ${rates.wcState ?? "the worker's state"} ${rates.wcClass} (counted as $0.00)`);
  else {
    const base = dollars(amount * share.num, share.den);
    const premium = share.text === null ? "" : share.text === "none" ? " (all of it is overtime premium, left out)" : ` (the overtime premium left out: ${share.text} of ${pay})`;
    parts.push(`workers' comp (${rates.wcState} ${rates.wcClass}) ${perHundred(rates.wcPpm)} per $100 of ${base}${premium} = ${dollars(amount * share.num * wc, MILLION * share.den)}`);
  }
  const exact = num % den === 0n;
  // (num and den stay well inside safe integers: pay below $100,000 a line × 1,000,000 × 3.)
  parts.push(exact ? `burden ${formatCents(cents)}` : `burden ${dollars(num, den)} → ${formatCents(cents)}, rounded half up once`);
  const text = parts.join("; ");
  return { cents, incomplete: rates.taxPpm === null || rates.wcPpm === null || rates.wcClass === null, explain: `${text.charAt(0).toUpperCase()}${text.slice(1)}.` };
}
