/**
 * Rate card versions (docs/patterns/job-orders/[id].md; Bullhorn One placement rate card versions):
 * a card is a list of dated versions; a version ends the day before the next one starts; there are
 * no gaps or overlaps between versions of one card. Pure functions: no I/O.
 *
 * A version that starts on or before the last paid day of the card's work is frozen: it is never
 * edited or deleted, only followed by a new version (SPEC §8; Stripe: a used price is replaced).
 */
import { addDays, english, exactDecimal, floorDiv, formatCents, isIsoDate, mod, mul, roundHalfUp, type Say } from "@shiftbook/rules";

export interface Dated {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface Multiplier {
  num: number;
  den: number;
}

export interface RateInput {
  effectiveFrom: string;
  payRateCents: number;
  /** The bill rate itself, or a markup on the pay rate in basis points (4500 = 45%). */
  bill: { rateCents: number } | { markupBp: number };
  otMultiplier: Multiplier;
  dtMultiplier: Multiplier;
  wcClassCode: string | null;
  /** A shift differential and a contractual minimum day (drizzle/0062); absent: none. */
  terms?: RateTerms;
}

/** A rate card's further terms: the differential (its window and days) and the minimum day. */
export interface RateTerms {
  differential: { name: string; payCents: number; billCents: number; startMinute: number | null; endMinute: number | null; days: number[] } | null;
  contractMinimumMinutes: number | null;
  billsContractMinimum: boolean;
}

export type RateProblem = "effective_from" | "pay_rate" | "bill_rate" | "markup" | "ot_multiplier" | "dt_multiplier" | "wc_class_code" | "differential" | "contract_minimum";

/** The highest hourly rate accepted, as in the pay engine ($100,000 an hour). */
const MAX_RATE_CENTS = 10_000_000;
/** The highest markup accepted: 1000%. */
const MAX_MARKUP_BP = 100_000;
/** Overtime and double-time bill multipliers: at least 1, at most 10. */
const MAX_MULTIPLIER = 10;

const sorted = <T extends Dated>(versions: T[]) => [...versions].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0));
const wholeCents = (n: number) => Number.isSafeInteger(n) && n > 0 && n <= MAX_RATE_CENTS;
const sensibleMultiplier = (m: Multiplier) =>
  Number.isSafeInteger(m.num) && Number.isSafeInteger(m.den) && m.den > 0 && m.num >= m.den && m.num <= mul(m.den, MAX_MULTIPLIER);

export function rateProblems(input: RateInput): RateProblem[] {
  const problems: RateProblem[] = [];
  if (!isIsoDate(input.effectiveFrom)) problems.push("effective_from");
  if (!wholeCents(input.payRateCents)) problems.push("pay_rate");
  // Exactly one of a bill rate or a markup, tested the same way `billOf` uses it.
  const bill = billOf(input);
  if (bill === null) problems.push("bill_rate");
  else if ("rateCents" in bill) {
    if (!wholeCents(bill.rateCents)) problems.push("bill_rate");
  } else if (!Number.isSafeInteger(bill.markupBp) || bill.markupBp < 0 || bill.markupBp > MAX_MARKUP_BP) {
    problems.push("markup");
  } else if (wholeCents(input.payRateCents) && !wholeCents(billFromMarkup(input.payRateCents, bill.markupBp).rateCents)) {
    problems.push("bill_rate");
  }
  if (!sensibleMultiplier(input.otMultiplier)) problems.push("ot_multiplier");
  if (!sensibleMultiplier(input.dtMultiplier)) problems.push("dt_multiplier");
  if (input.wcClassCode !== null && !/^[A-Za-z0-9.-]{1,12}$/.test(input.wcClassCode)) problems.push("wc_class_code");
  const d = input.terms?.differential;
  if (d) {
    const minute = (m: number | null, max: number) => m === null || (Number.isSafeInteger(m) && m >= 0 && m <= max);
    const windowOk = (d.startMinute === null) === (d.endMinute === null) && minute(d.startMinute, 1439) && minute(d.endMinute, 1440) && (d.startMinute === null || d.startMinute !== d.endMinute);
    const daysOk = Array.isArray(d.days) && d.days.length <= 7 && new Set(d.days).size === d.days.length && d.days.every((x) => Number.isSafeInteger(x) && x >= 0 && x <= 6);
    const centsOk = (c: number, least: number) => Number.isSafeInteger(c) && c >= least && c <= 10_000;
    if (typeof d.name !== "string" || d.name.trim() === "" || d.name.trim().length > 60 || !centsOk(d.payCents, 1) || !centsOk(d.billCents, 0) || !windowOk || !daysOk) problems.push("differential");
  }
  const m = input.terms?.contractMinimumMinutes;
  if (m !== undefined && m !== null && (!Number.isSafeInteger(m) || m < 1 || m > 720)) problems.push("contract_minimum");
  return problems;
}

/** The bill as given: a rate or a markup, or null when it is both, neither, or not an object. */
export function billOf(input: Pick<RateInput, "bill">): { rateCents: number } | { markupBp: number } | null {
  const b = input.bill as unknown;
  if (typeof b !== "object" || b === null) return null;
  const hasRate = "rateCents" in b;
  const hasMarkup = "markupBp" in b;
  if (hasRate === hasMarkup) return null;
  return hasRate ? { rateCents: (b as { rateCents: number }).rateCents } : { markupBp: (b as { markupBp: number }).markupBp };
}

/** Bill rate = pay × (10000 + markup) / 10000 cents an hour, rounded once, half up, with the working. */
export function billFromMarkup(payRateCents: number, markupBp: number): { rateCents: number; explain: string; say: Say } {
  const num = mul(payRateCents, 10_000 + markupBp);
  const rateCents = roundHalfUp(num, 10_000);
  const percent = `${floorDiv(markupBp, 100)}.${String(mod(markupBp, 100)).padStart(2, "0")}%`;
  // The working as message keys (decision 0030): the bill line and the rate form say it in the reader's language.
  const say: Say = [{ key: "billRateMarkup", values: { pay: formatCents(payRateCents), percent, exact: exactDecimal(num, 10_000), bill: formatCents(rateCents) } }];
  return { rateCents, explain: english(say), say };
}

/** The version in force on a date, or null. */
export function inForce<T extends Dated>(versions: T[], date: string): T | null {
  return versions.find((x) => x.effectiveFrom <= date && (x.effectiveTo === null || date <= x.effectiveTo)) ?? null;
}

/** True when the version starts on or before the last paid day: it can only be followed, never changed. */
export function isFrozen(version: Pick<Dated, "effectiveFrom">, paidThrough: string | null): boolean {
  return paidThrough !== null && version.effectiveFrom <= paidThrough;
}

/** Where a new version starting on `from` goes: its end, and the end date the version before it gets. */
export function planInsert(
  versions: Dated[],
  from: string,
): { ok: true; effectiveTo: string | null; updates: { id: string; effectiveTo: string | null }[] } | { ok: false; error: "same_start" } {
  const list = sorted(versions);
  if (list.some((x) => x.effectiveFrom === from)) return { ok: false, error: "same_start" };
  const next = list.find((x) => x.effectiveFrom > from);
  const before = list.filter((x) => x.effectiveFrom < from).at(-1);
  const updates = before ? [{ id: before.id, effectiveTo: addDays(from, -1) }] : [];
  return { ok: true, effectiveTo: next ? addDays(next.effectiveFrom, -1) : null, updates };
}

/** Removing a version: the one before it is extended over its dates. The earliest stays while later ones exist. */
export function planDelete(versions: Dated[], id: string): { ok: true; updates: { id: string; effectiveTo: string | null }[] } | { ok: false; error: "earliest" | "not_found" } {
  const list = sorted(versions);
  const at = list.findIndex((x) => x.id === id);
  if (at < 0) return { ok: false, error: "not_found" };
  if (at === 0) return list.length > 1 ? { ok: false, error: "earliest" } : { ok: true, updates: [] };
  return { ok: true, updates: [{ id: list[at - 1]!.id, effectiveTo: list[at]!.effectiveTo }] };
}
