/**
 * What people type into amount fields, turned into integers exactly (SPEC §5: no floating point in
 * pay or billing): dollars → cents, percentages → basis points, multipliers → fractions. Text in,
 * integers out; nothing is ever parsed as a float.
 */

const digits = (s: string) => /^\d+$/.test(s);

/** "18.25" / "$1,018.5" → cents; null when it is not a plain non-negative amount with at most 2 decimals. */
export function parseDollars(text: string): number | null {
  const t = text.trim().replace(/^\$/, "").replace(/,/g, "");
  const [whole = "", frac = "", ...rest] = t.split(".");
  if (rest.length > 0 || !digits(whole) || (frac !== "" && !digits(frac)) || frac.length > 2 || (t.includes(".") && frac === "")) return null;
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0") || "0");
  return Number.isSafeInteger(cents) ? cents : null;
}

export function centsToInput(cents: number | null): string {
  if (cents === null) return "";
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** "45" / "45.5%" → basis points (4500 / 4550); at most 2 decimals. */
export function parsePercentBp(text: string): number | null {
  return parseDollars(text.trim().replace(/%$/, ""));
}

export function bpToInput(bp: number | null): string {
  return centsToInput(bp);
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** "1.5" → {3, 2}; at most 2 decimals. */
export function parseMultiplier(text: string): { num: number; den: number } | null {
  const hundredths = parseDollars(text);
  if (hundredths === null || hundredths === 0) return null;
  const g = gcd(hundredths, 100);
  return { num: hundredths / g, den: 100 / g };
}

/** {3, 2} → "1.5" for the form (exact for the fractions the form can produce). */
export function multiplierToInput(m: { num: number; den: number }): string {
  const hundredths = (m.num * 100) / m.den;
  if (!Number.isInteger(hundredths)) return `${m.num}/${m.den}`;
  const whole = Math.trunc(hundredths / 100);
  const frac = String(hundredths % 100).padStart(2, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}
