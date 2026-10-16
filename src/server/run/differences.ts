/**
 * What a correction pays and bills (plan slice e part 2, decision E8): the correction version's lines
 * minus the lines of the latest paid version, per worker, assignment, workweek, earning type and rate
 * (and per client for bill lines). Pure and deterministic; no I/O. Rates are compared in lowest terms.
 *
 * Each amount was rounded once on its own line when its version was computed (CLAUDE.md "round once,
 * at line level"); a difference is the exact difference of two such amounts and is not rounded again.
 */
import { formatCents, formatDuration, formatRate, type EarningType, type Fraction } from "@shiftbook/rules";
import en from "../../../messages/en.json";

export interface LineForDiff {
  workerId: string;
  assignmentId: string | null;
  /** Bill lines only. */
  clientId?: string;
  workweekStart: string;
  type: EarningType;
  minutes: number;
  amountCents: number;
  rate: Fraction;
  timeEntryIds?: string[];
  /** Bill lines: the rule that priced it (an overtime hour the client is not billed for says so on the invoice). */
  ruleId?: string;
}

export interface DiffLine {
  workerId: string;
  assignmentId: string | null;
  clientId?: string;
  workweekStart: string;
  type: EarningType;
  rate: Fraction;
  was: { minutes: number; amountCents: number };
  now: { minutes: number; amountCents: number };
  /** now − was. */
  minutes: number;
  amountCents: number;
  /** How many stored lines, each rounded once, the was and now amounts add up (the rounding bound). */
  wasLines: number;
  nowLines: number;
  timeEntryIds: string[];
  ruleId?: string;
  explain: string;
}

/** The order lines are listed in everywhere (invoices, files): the engine's earning types in order. */
const TYPE_ORDER: EarningType[] = ["REG", "OT", "DT", "MW_TRUEUP", "REPORTING_PAY", "HOL", "HOL_NOT_WORKED", "DIFF", "MEAL_PREMIUM", "REST_PREMIUM", "MIN_GUARANTEE", "BONUS", "BONUS_OT"];
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function lowestTerms(rate: Fraction): { num: bigint; den: bigint } {
  let x = BigInt(rate.num) < 0n ? -BigInt(rate.num) : BigInt(rate.num);
  let y = BigInt(rate.den);
  while (y !== 0n) [x, y] = [y, x % y];
  const g = x === 0n ? 1n : x;
  return { num: BigInt(rate.num) / g, den: BigInt(rate.den) / g };
}

const keyOf = (l: LineForDiff) => {
  const r = lowestTerms(l.rate);
  return [l.clientId ?? "", l.workerId, l.assignmentId ?? "", l.workweekStart, l.type, `${r.num}/${r.den}`].join("|");
};

const rateOrder = (a: Fraction, b: Fraction) => {
  const left = BigInt(a.num) * BigInt(b.den);
  const right = BigInt(b.num) * BigInt(a.den);
  return left < right ? -1 : left > right ? 1 : 0;
};

const signed = (n: number, text: (abs: number) => string) => `${n < 0 ? "−" : "+"}${text(Math.abs(n))}`;

export function differences(was: LineForDiff[], now: LineForDiff[], opts: { baseVersion: number }): DiffLine[] {
  type Acc = { sample: LineForDiff; was: { minutes: number; amountCents: number }; now: { minutes: number; amountCents: number }; wasLines: number; nowLines: number; entries: Set<string> };
  const byKey = new Map<string, Acc>();
  const add = (l: LineForDiff, side: "was" | "now") => {
    const k = keyOf(l);
    const acc = byKey.get(k) ?? { sample: l, was: { minutes: 0, amountCents: 0 }, now: { minutes: 0, amountCents: 0 }, wasLines: 0, nowLines: 0, entries: new Set<string>() };
    acc[side].minutes += l.minutes;
    acc[side].amountCents += l.amountCents;
    if (side === "was") acc.wasLines += 1;
    else acc.nowLines += 1;
    // A rule seen on the current side names the line (an hour not billable now says so).
    if (side === "now" || acc.sample.ruleId === undefined) acc.sample = { ...acc.sample, ruleId: l.ruleId ?? acc.sample.ruleId };
    for (const id of l.timeEntryIds ?? []) acc.entries.add(id);
    byKey.set(k, acc);
  };
  for (const l of was) add(l, "was");
  for (const l of now) add(l, "now");

  const out: DiffLine[] = [];
  for (const acc of byKey.values()) {
    const minutes = acc.now.minutes - acc.was.minutes;
    const amountCents = acc.now.amountCents - acc.was.amountCents;
    if (minutes === 0 && amountCents === 0) continue;
    const l = acc.sample;
    const r = lowestTerms(l.rate);
    const rate = { num: Number(r.num), den: Number(r.den) };
    const label = en.invoice.earning[l.type];
    const explain =
      `${label} at ${formatRate(rate)}, workweek starting ${l.workweekStart}: ` +
      `was ${formatDuration(acc.was.minutes)} (${acc.was.minutes} min) = ${formatCents(acc.was.amountCents)} in version ${opts.baseVersion}; ` +
      `now ${formatDuration(acc.now.minutes)} (${acc.now.minutes} min) = ${formatCents(acc.now.amountCents)}; ` +
      `difference ${signed(minutes, formatDuration)} (${signed(minutes, (m) => `${m} min`)}) = ${signed(amountCents, formatCents)} ` +
      "(each amount rounded once on its own line; the difference is not rounded again).";
    out.push({
      workerId: l.workerId,
      assignmentId: l.assignmentId,
      ...(l.clientId !== undefined ? { clientId: l.clientId } : {}),
      workweekStart: l.workweekStart,
      type: l.type,
      rate,
      was: acc.was,
      now: acc.now,
      minutes,
      amountCents,
      wasLines: acc.wasLines,
      nowLines: acc.nowLines,
      timeEntryIds: [...acc.entries].sort(cmp),
      ...(l.ruleId !== undefined ? { ruleId: l.ruleId } : {}),
      explain,
    });
  }
  return out.sort(
    (a, b) =>
      cmp(a.clientId ?? "", b.clientId ?? "") ||
      cmp(a.workerId, b.workerId) ||
      cmp(a.assignmentId ?? "", b.assignmentId ?? "") ||
      cmp(a.workweekStart, b.workweekStart) ||
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
      rateOrder(a.rate, b.rate),
  );
}

/** One line of a correction's payroll file: a worker's differences at one earning type and rate. */
export interface FileLine {
  type: EarningType;
  rate: Fraction;
  minutes: number;
  amountCents: number;
  /** How many stored lines, each rounded once, its amount adds up: it is within half a cent of each. */
  parts: number;
}

/** A file line within one workweek. */
export interface WeekLine extends FileLine {
  workweekStart: string;
}

/** Amount lines are exact cents, never rounded from minutes. */
const AMOUNT_TYPES = new Set<EarningType>(["BONUS"]);

/**
 * How one worker's pay differences can be settled (decision E9).
 *
 * Each workweek stands alone (overtime is owed per workweek: 29 C.F.R. § 778.104), so differences are
 * first added up per earning type, rate and workweek: hours moved between days or assignments of one
 * week at one rate cancel out, but overtime moved from one week to another is not netted. When every
 * such sum is an addition, the payroll file (an hours file can only add) carries them, one line per
 * earning type and rate (the file has one row per worker); anything else needs a recorded decision.
 *
 * A sum with no minutes and less than the rounding bound in cents (half a cent per stored line) is
 * what rounding each line once leaves when hours move at one rate: not a difference to settle.
 */
export function settlement(
  lines: { type: EarningType; rate: Fraction; minutes: number; amountCents: number; workweekStart: string; wasLines: number; nowLines: number }[],
): { netCents: number; additionsOnly: boolean; fileLines: FileLine[]; weekLines: WeekLine[]; leftoverCents: number } {
  const weeks = new Map<string, WeekLine>();
  for (const l of lines) {
    const r = lowestTerms(l.rate);
    const k = `${l.type}|${r.num}/${r.den}|${l.workweekStart}`;
    const g = weeks.get(k) ?? { type: l.type, rate: { num: Number(r.num), den: Number(r.den) }, minutes: 0, amountCents: 0, parts: 0, workweekStart: l.workweekStart };
    g.minutes += l.minutes;
    g.amountCents += l.amountCents;
    g.parts += l.wasLines + l.nowLines;
    weeks.set(k, g);
  }
  let leftoverCents = 0;
  const real: WeekLine[] = [];
  for (const g of weeks.values()) {
    if (g.minutes === 0 && g.amountCents === 0) continue;
    if (g.minutes === 0 && !AMOUNT_TYPES.has(g.type) && Math.abs(g.amountCents) * 2 <= g.parts) {
      leftoverCents += g.amountCents;
      continue;
    }
    real.push(g);
  }
  const additionsOnly = real.every((g) => g.minutes >= 0 && g.amountCents >= 0);
  const byRate = new Map<string, FileLine>();
  for (const g of real) {
    const k = `${g.type}|${g.rate.num}/${g.rate.den}`;
    const f = byRate.get(k) ?? { type: g.type, rate: g.rate, minutes: 0, amountCents: 0, parts: 0 };
    f.minutes += g.minutes;
    f.amountCents += g.amountCents;
    f.parts += g.parts;
    byRate.set(k, f);
  }
  const fileLines = [...byRate.values()]
    .filter((f) => f.minutes !== 0 || f.amountCents !== 0)
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || rateOrder(a.rate, b.rate));
  // The same additions week by week, for files dated by the week they were worked (slice f, F8).
  const weekLines = real
    .filter((g) => g.minutes !== 0 || g.amountCents !== 0)
    .sort((a, b) => cmp(a.workweekStart, b.workweekStart) || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || rateOrder(a.rate, b.rate));
  return { netCents: lines.reduce((sum, l) => sum + l.amountCents, 0), additionsOnly, fileLines, weekLines, leftoverCents };
}
