/**
 * What people type into amount fields, turned into integers exactly (SPEC §5: no floating point in
 * pay or billing): dollars → cents, percentages → basis points, multipliers → fractions. Text in,
 * integers out; nothing is ever parsed as a float. A comma only separates thousands ("1,018.50"):
 * "18,25" is refused rather than read as $1,825.
 */
import { floorDiv, mod, mul } from "@shiftbook/rules";

const AMOUNT = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/** "18.25" / "$1,018.5" → cents; null when it is not a plain non-negative amount with at most 2 decimals. */
export function parseDollars(text: string): number | null {
  const m = AMOUNT.exec(text.trim().replace(/^\$/, ""));
  if (!m) return null;
  const whole = m[1]!.replace(/,/g, "");
  if (whole.length > 13) return null;
  return mul(Number(whole), 100) + Number((m[2] ?? "").padEnd(2, "0"));
}

export function centsToInput(cents: number | null): string {
  if (cents === null) return "";
  return `${floorDiv(cents, 100)}.${String(mod(cents, 100)).padStart(2, "0")}`;
}

/** "45" / "45.5%" → basis points (4500 / 4550); at most 2 decimals. */
export function parsePercentBp(text: string): number | null {
  return parseDollars(text.trim().replace(/%$/, ""));
}

const FOUR_PLACES = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,4}))?$/;

/** "11.675" / "$4.1234" / "0.5%" → ten-thousandths (116,750 / 41,234 / 5,000); at most 4 decimals. A rate as parts per million of pay. */
export function parseFourPlaces(text: string): number | null {
  const m = FOUR_PLACES.exec(text.trim().replace(/^\$/, "").replace(/%$/, "").trim());
  if (!m) return null;
  const whole = m[1]!.replace(/,/g, "");
  if (whole.length > 9) return null;
  return mul(Number(whole), 10_000) + Number((m[2] ?? "").padEnd(4, "0"));
}

export function bpToInput(bp: number | null): string {
  return centsToInput(bp);
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, mod(a, b)));

/** "1.5" → {3, 2}; at most 2 decimals. */
export function parseMultiplier(text: string): { num: number; den: number } | null {
  const hundredths = parseDollars(text);
  if (hundredths === null || hundredths === 0) return null;
  const g = gcd(hundredths, 100);
  return { num: floorDiv(hundredths, g), den: floorDiv(100, g) };
}

/** {3, 2} → "1.5" for the form (exact for the fractions the form can produce). */
export function multiplierToInput(m: { num: number; den: number }): string {
  const scaled = mul(m.num, 100);
  if (mod(scaled, m.den) !== 0) return `${m.num}/${m.den}`;
  const hundredths = floorDiv(scaled, m.den);
  const frac = String(mod(hundredths, 100)).padStart(2, "0").replace(/0+$/, "");
  return frac ? `${floorDiv(hundredths, 100)}.${frac}` : String(floorDiv(hundredths, 100));
}
