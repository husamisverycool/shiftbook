/**
 * What every payroll exporter checks and writes the same way (SPEC §13): a pay line is whole minutes
 * at a positive rate with its amount rounded once; an amount line is money only; hours go out with a
 * fixed number of decimals, rounded up so no worked time is lost; names sort the same on every machine.
 */
import { ceilDiv, floorDiv, formatCents, formatRate, mod, roundHalfUp, roundHalfUpBig, type Fraction } from "@shiftbook/rules";
import { ExportError } from "./errors";
import type { ExportPayLine } from "./registry";

/** minutes × rate ÷ 60 rounded once, in big integers (a weighted overtime rate has a large denominator). */
export const lineCents = (minutes: number, rate: Fraction) => roundHalfUpBig(BigInt(minutes) * BigInt(rate.num), 60n * BigInt(rate.den));
export const sameRate = (a: Fraction, b: Fraction) => BigInt(a.num) * BigInt(b.den) === BigInt(b.num) * BigInt(a.den);
export const times = (rate: Fraction, m: Fraction): Fraction => ({ num: rate.num * m.num, den: rate.den * m.den });
/** Name order that is the same on every machine: accents folded, case folded, plain comparison. */
export const sortKey = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const signedCents = (c: number) => (c >= 0 ? `+${formatCents(c)}` : `−${formatCents(-c)}`);

/** minutes → hundredths of an hour, rounded up (37 → 62 = 0.62 h; 38 → 64 = 0.64 h). */
export const toHundredths = (minutes: number) => ceilDiv(minutes * 100, 60);
/** hundredths → minutes; exact for every value written by toHundredths (error ≤ 0.4 min). */
export const hundredthsToMinutes = (hundredths: number) => roundHalfUp(hundredths * 60, 100);
/** 6234 → "62.34" (hundredths of an hour, or cents as dollars). */
export const twoDecimals = (hundredths: number) => `${floorDiv(hundredths, 100)}.${String(mod(hundredths, 100)).padStart(2, "0")}`;
/** "62.34" → 6234; anything else is unreadable. */
export function readTwoDecimals(text: string, what: string, file: string): number {
  const m = /^(\d+)\.(\d{2})$/.exec(text);
  if (!m) throw new ExportError("does_not_reconcile", `Unreadable ${what} value "${text}" in the ${file}.`);
  return Number(m[1]) * 100 + Number(m[2]);
}
/** 1500 → "25:00"; 37 → "0:37". */
export const hoursMinutes = (minutes: number) => `${floorDiv(minutes, 60)}:${String(mod(minutes, 60)).padStart(2, "0")}`;
export function readHoursMinutes(text: string, file: string): number {
  const m = /^(\d+):([0-5]\d)$/.exec(text);
  if (!m) throw new ExportError("does_not_reconcile", `Unreadable duration "${text}" in the ${file}.`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** |amount − minutes × rate ÷ 60| ≤ parts ÷ 2 cents (half a cent per stored line), in exact integers. */
export function withinRounding(amountCents: number, minutes: number, rate: Fraction, parts: number): boolean {
  const den = 60n * BigInt(rate.den);
  const gap = BigInt(amountCents) * den - BigInt(minutes) * BigInt(rate.num);
  return 2n * (gap < 0n ? -gap : gap) <= BigInt(parts) * den;
}

/**
 * A pay line must be whole minutes ≥ 0 at a positive rate, with amount = minutes × rate ÷ 60 rounded
 * once. In a correction it adds up `parts` stored lines' amounts (a difference: was and now), each
 * rounded once, so it must be within half a cent per stored line.
 */
export function checkLine(line: ExportPayLine, who: string, correction: boolean): void {
  const validRate = Number.isSafeInteger(line.rate.num) && Number.isSafeInteger(line.rate.den) && line.rate.num > 0 && line.rate.den > 0;
  const parts = line.parts ?? 2;
  const problem =
    (!Number.isSafeInteger(line.minutes) || line.minutes < 0) ? `${line.minutes} minutes is not a whole number ≥ 0`
    : !Number.isSafeInteger(line.amountCents) ? `${line.amountCents} is not a whole number of cents`
    : !validRate ? "its rate is not a positive amount"
    : correction
      ? !Number.isSafeInteger(parts) || parts < 1
        ? `it adds up ${parts} differences`
        : !withinRounding(line.amountCents, line.minutes, line.rate, parts)
          ? `the difference ${formatCents(line.amountCents)} is further from ${line.minutes} min × ${formatRate(line.rate)} than rounding ${parts} stored line${parts === 1 ? "" : "s"} can explain`
          : null
    : lineCents(line.minutes, line.rate) !== line.amountCents
      ? `${formatCents(line.amountCents)} is not ${line.minutes} min × ${formatRate(line.rate)} rounded once (${formatCents(lineCents(line.minutes, line.rate))})`
      : null;
  if (problem) throw new ExportError("invalid_pay_line", `${who}: the ${line.type} pay line cannot be exported because ${problem}.`);
}

/** An amount line (a bonus, a premium paid as money) is money, not time: no minutes and a positive whole number of cents. */
export function checkAmountLine(line: ExportPayLine, who: string): void {
  const problem = line.minutes !== 0 ? `it carries ${line.minutes} minutes, but it is an amount, not hours` : !Number.isSafeInteger(line.amountCents) || line.amountCents <= 0 ? `${line.amountCents} is not a positive whole number of cents` : null;
  if (problem) throw new ExportError("invalid_pay_line", `${who}: the ${line.type} pay line cannot be exported because ${problem}.`);
}

/** Runs `add` on every line; a refusal about one line is that line's worker's (so the run can name them). */
export function eachLine(lines: ExportPayLine[], add: (line: ExportPayLine) => void): void {
  for (const line of lines) {
    try {
      add(line);
    } catch (error) {
      if (error instanceof ExportError && error.workerId === undefined) throw new ExportError(error.code, error.message, line.workerId);
      throw error;
    }
  }
}

/** The fewest pieces of at most `max` minutes, as equal as whole minutes allow, larger first (2400, 1439 → 1200, 1200). */
export function splitMinutes(minutes: number, max: number): number[] {
  if (minutes <= max) return [minutes];
  const n = ceilDiv(minutes, max);
  const small = floorDiv(minutes, n);
  const big = minutes - small * n;
  return Array.from({ length: n }, (_, i) => small + (i < big ? 1 : 0));
}

/** Only printable ASCII (32–126) without the characters a file refuses; null when fine, else the first bad character. */
export function badCharacter(text: string, refused: (code: number) => boolean = () => false): string | null {
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 32 || code > 126 || refused(code)) return ch;
  }
  return null;
}

/** A date as the file writes it. */
export function formatDate(iso: string, format: "MM/DD/YY" | "MM/DD/YYYY" | "YYYY-MM-DD"): string {
  const [y, m, d] = iso.split("-") as [string, string, string];
  return format === "YYYY-MM-DD" ? iso : format === "MM/DD/YYYY" ? `${m}/${d}/${y}` : `${m}/${d}/${y.slice(2)}`;
}
