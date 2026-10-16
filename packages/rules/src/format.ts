/** Text formatting for explain strings. Integer-only; no "/" (see int.ts). */
import { exactDecimal, exactDecimalBig, floorDiv, mod } from "./int";
import type { Fraction } from "./types";

/** 2280 → "38h 00m". */
export function formatDuration(minutes: number): string {
  return `${floorDiv(minutes, 60)}h ${String(mod(minutes, 60)).padStart(2, "0")}m`;
}

function withThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 69350 → "$693.50"; 106000 → "$1,060.00". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${withThousands(String(floorDiv(abs, 100)))}.${String(mod(abs, 100)).padStart(2, "0")}`;
}

/** {5475, 2} cents/hour → "$27.375/h"; always at least two decimals. */
export function formatRate(rate: Fraction): string {
  // Big integers: a malformed rate with a huge denominator is shown, never a crash.
  const text = exactDecimalBig(BigInt(rate.num), BigInt(rate.den) * 100n);
  const [whole, frac = ""] = text.split(".");
  const fraction = frac.length >= 2 ? frac : frac.padEnd(2, "0");
  return `$${withThousands(whole ?? "0")}.${fraction}/h`;
}

/** An exact amount of cents as dollars: {87200, 1} → "$872.00"; {100, 3} → "$0.3333…". */
export function formatMoney(cents: Fraction): string {
  return formatRate(cents).replace("/h", "");
}

/** {3, 2} → "1.5". */
export function formatMultiplier(m: Fraction): string {
  return exactDecimal(m.num, m.den);
}

/** 43200 → "720 hours"; 249600 → "4,160 hours"; a part hour as a duration. */
export function formatHours(minutes: number): string {
  return mod(minutes, 60) === 0 ? `${withThousands(String(floorDiv(minutes, 60)))} hours` : formatDuration(minutes);
}

/** 660 → "11:00" (minutes after midnight). */
export function formatClock(minute: number): string {
  return `${String(floorDiv(minute, 60)).padStart(2, "0")}:${String(mod(minute, 60)).padStart(2, "0")}`;
}
