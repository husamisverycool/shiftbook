/**
 * Integer arithmetic for pay and billing (SPEC §5: money is integer cents, time is integer
 * minutes, no floating point). This is the ONLY file in pay/billing code allowed to divide; a lint
 * rule forbids "/" everywhere else. Every helper refuses non-integers and unsafe magnitudes.
 */

function assertSafeInt(value: number, label: string): void {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer, got ${value}`);
  if (!Number.isSafeInteger(value)) throw new Error(`${label} is outside the safe integer range`);
}

function assertPositive(value: number, label: string): void {
  assertSafeInt(value, label);
  if (value <= 0) throw new Error(`${label} must be positive, got ${value}`);
}

/** floor(a / b) for integers, b > 0. */
export function floorDiv(a: number, b: number): number {
  assertSafeInt(a, "dividend");
  assertPositive(b, "divisor");
  return Math.floor(a / b);
}

/** a mod b in [0, b), b > 0. */
export function mod(a: number, b: number): number {
  return a - floorDiv(a, b) * b;
}

/**
 * num / den rounded to the nearest integer, halves away from zero (so 2.5 → 3 and -2.5 → -3).
 * Computed exactly with integers: q = floor((2·|num| + den) / (2·den)), sign restored.
 */
export function roundHalfUp(num: number, den: number): number {
  assertSafeInt(num, "numerator");
  assertPositive(den, "denominator");
  const doubled = 2 * Math.abs(num) + den;
  assertSafeInt(doubled, "intermediate");
  const q = Math.floor(doubled / (2 * den));
  return num < 0 ? -q : q;
}

/** ceil(num / den) for num ≥ 0, den > 0: rounds up, never down. */
export function ceilDiv(num: number, den: number): number {
  assertSafeInt(num, "numerator");
  assertPositive(den, "denominator");
  if (num < 0) throw new Error("ceilDiv is defined for non-negative numerators only");
  return Math.floor((num + den - 1) / den);
}

/** Multiplies integers, refusing to leave the safe integer range. */
export function mul(...factors: number[]): number {
  let product = 1;
  for (const f of factors) {
    assertSafeInt(f, "factor");
    product *= f;
    assertSafeInt(product, "product");
  }
  return product;
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

/** num/den in lowest terms (den > 0). Exact: the gcd divides both. */
export function reduceFraction(f: { num: number; den: number }): { num: number; den: number } {
  assertSafeInt(f.num, "numerator");
  assertPositive(f.den, "denominator");
  const g = gcd(f.num, f.den) || 1;
  return { num: f.num / g, den: f.den / g };
}

/**
 * Exact decimal text of num/den for explain strings: terminating decimals in full; repeating ones
 * cut at `places` digits followed by "…". Never used for arithmetic.
 */
export function exactDecimal(num: number, den: number, places = 4): string {
  assertSafeInt(num, "numerator");
  assertPositive(den, "denominator");
  const negative = num < 0;
  let remainder = Math.abs(num);
  const whole = Math.floor(remainder / den);
  remainder -= whole * den;
  let digits = "";
  for (let i = 0; i < places && remainder !== 0; i++) {
    remainder *= 10;
    const digit = Math.floor(remainder / den);
    digits += String(digit);
    remainder -= digit * den;
  }
  const text = digits.length > 0 ? `${whole}.${digits}` : String(whole);
  const repeating = remainder !== 0 ? "…" : "";
  return `${negative ? "-" : ""}${text}${repeating}`;
}

/**
 * Big-integer versions for line amounts, where minutes × a rate's numerator can pass 2^53 (a
 * weighted regular rate has a large denominator). The result is checked back into a safe integer.
 */
export function roundHalfUpBig(num: bigint, den: bigint): number {
  if (den <= 0n) throw new Error("denominator must be positive");
  const abs = num < 0n ? -num : num;
  const q = (2n * abs + den) / (2n * den);
  const out = Number(num < 0n ? -q : q);
  assertSafeInt(out, "rounded amount");
  return out;
}

/** exactDecimal for big integers (explain text only). */
export function exactDecimalBig(num: bigint, den: bigint, places = 4): string {
  if (den <= 0n) throw new Error("denominator must be positive");
  const negative = num < 0n;
  let remainder = negative ? -num : num;
  const whole = remainder / den;
  remainder -= whole * den;
  let digits = "";
  for (let i = 0; i < places && remainder !== 0n; i++) {
    remainder *= 10n;
    const digit = remainder / den;
    digits += String(digit);
    remainder -= digit * den;
  }
  const text = digits.length > 0 ? `${whole}.${digits}` : String(whole);
  return `${negative ? "-" : ""}${text}${remainder !== 0n ? "…" : ""}`;
}
