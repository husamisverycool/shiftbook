/**
 * Shiftbook pay and bill engine (SPEC §9). Pure and deterministic: the same input always gives the
 * same output; no I/O, no clock, integer math only.
 *
 * Order per worker-week (SPEC §9):
 *   1. classify minutes        — validate shifts, group into fixed workweeks
 *   2. apply wage floor        — slice (c): minimum-wage tables
 *   3. straight pay            — regular minutes × pay rate
 *   4. regular rate            — slice (a): the week's single pay rate (several rates + OT block)
 *   5. overtime                — weekly overtime, most protective rule once, never double counted
 *   6. confirmed premiums      — slice (c): meal/rest premiums, holidays, guarantees
 *   7. allocate to clients     — lines per assignment; bill lines mirror pay-line minutes
 */
import { toDayNumber, isEffective, workweekStart } from "./dates";
import { formatCents, formatDuration, formatMultiplier, formatRate } from "./format";
import { exactDecimal, mul, reduceFraction as reduce, roundHalfUp } from "./int";
import { selectWeeklyRule, splitAtThreshold, WEEKLY_OVERTIME } from "./rules/weekly-overtime";
import type { EarningType, Fraction, Issue, Line, PayInput, PayResult, Shift } from "./types";

export const RULES_VERSION = "2026.10-a1";

/** Rule codes this engine version implements. Any other applicable rule code blocks the run. */
export const IMPLEMENTED_RULE_CODES = new Set([WEEKLY_OVERTIME]);

const TYPE_ORDER: EarningType[] = ["REG", "OT", "DT", "HOL", "DIFF", "MEAL_PREMIUM", "REST_PREMIUM", "MIN_GUARANTEE"];

/** amount = minutes × rate / 60, in cents, rounded half-up exactly once. */
function lineAmount(minutes: number, rate: Fraction): { amountCents: number; exact: string; wasExact: boolean } {
  const num = mul(minutes, rate.num);
  const den = mul(60, rate.den);
  const amountCents = roundHalfUp(num, den);
  const wasExact = mul(amountCents, den) === num;
  return { amountCents, exact: exactDecimal(num, den), wasExact };
}

function arithmetic(label: string, minutes: number, rate: Fraction, rateNote: string): { text: string; amountCents: number } {
  const { amountCents, exact, wasExact } = lineAmount(minutes, rate);
  const rounding = wasExact ? "exactly →" : "→ rounded half-up once →";
  const text = `${label}: ${formatDuration(minutes)} (${minutes} min) × ${formatRate(rate)}${rateNote} = ${exact}¢ ${rounding} ${formatCents(amountCents)}.`;
  return { text, amountCents };
}

function validShift(s: Shift): string | null {
  if (!Number.isSafeInteger(s.minutes) || s.minutes < 0) return `minutes must be a whole number ≥ 0 (got ${s.minutes})`;
  if (!Number.isSafeInteger(s.payRateCents) || s.payRateCents <= 0) return "pay rate must be a positive number of cents";
  if (!Number.isSafeInteger(s.billRateCents) || s.billRateCents <= 0) return "bill rate must be a positive number of cents";
  for (const f of [s.billOtMultiplier]) {
    if (!Number.isSafeInteger(f.num) || !Number.isSafeInteger(f.den) || f.num <= 0 || f.den <= 0) return "multipliers must be positive whole-number fractions";
  }
  return null;
}

function chronological(a: Shift, b: Shift): number {
  if (a.date !== b.date) return toDayNumber(a.date) - toDayNumber(b.date);
  const sa = a.startMinute ?? 0;
  const sb = b.startMinute ?? 0;
  if (sa !== sb) return sa - sb;
  return (a.entryIds[0] ?? "").localeCompare(b.entryIds[0] ?? "");
}

interface Bucket {
  assignmentId: string;
  clientId: string;
  firstIndex: number;
  sample: Shift;
  regular: number;
  overtime: number;
  regularEntries: string[];
  overtimeEntries: string[];
}

export function computePay(input: PayInput): PayResult {
  const blockers: Issue[] = [];
  const payLines: Line[] = [];
  const billLines: Line[] = [];

  // 1. classify minutes: validate, then group by worker and fixed workweek.
  const weeks = new Map<string, Shift[]>();
  for (const shift of input.shifts) {
    const problem = validShift(shift);
    if (problem) {
      blockers.push({ code: "invalid_input", workerId: shift.workerId, workerName: shift.workerName, entryIds: shift.entryIds, message: `${shift.workerName} on ${shift.date}: ${problem}.` });
      continue;
    }
    if (shift.minutes === 0) continue;
    const week = workweekStart(shift.date, input.workweekStartsOn);
    const key = `${shift.workerId}\u0000${week}`;
    const list = weeks.get(key) ?? [];
    list.push(shift);
    weeks.set(key, list);
  }

  const orderedKeys = [...weeks.keys()].sort();
  for (const key of orderedKeys) {
    const shifts = [...weeks.get(key)!].sort(chronological);
    const first = shifts[0]!;
    const week = workweekStart(first.date, input.workweekStartsOn);
    const who = { workerId: first.workerId, workerName: first.workerName, workweekStart: week };
    const weekBlockers: Issue[] = [];

    // Jurisdiction gate: every worksite state must be known, and every rule that applies must be
    // implemented by this engine version. Otherwise the week is blocked, never guessed.
    const states = [...new Set(shifts.map((s) => s.jurisdiction))].sort();
    const applicable = new Set<string>();
    for (const state of ["US", ...states]) {
      const rows = input.jurisdictionRules.filter((r) => r.jurisdiction === state && isEffective(week, r.effectiveFrom, r.effectiveTo));
      if (rows.length === 0 && state !== "US") {
        weekBlockers.push({ code: "unknown_jurisdiction", ...who, jurisdiction: state, message: `${first.workerName}, workweek starting ${week}: no wage rules are on file for ${state}, so this week cannot be computed.` });
      }
      for (const row of rows) {
        applicable.add(row.ruleCode);
        if (!IMPLEMENTED_RULE_CODES.has(row.ruleCode)) {
          weekBlockers.push({ code: "rule_not_supported_yet", ...who, jurisdiction: state, ruleCode: row.ruleCode, message: `${first.workerName}, workweek starting ${week}: ${state} rule ${row.ruleCode} (${row.citation}) is not implemented yet, so this week cannot be computed.` });
        }
      }
    }

    // 2. wage floor — slice (c).
    // 5. overtime: the most protective weekly rule, applied once.
    const weekly = applicable.has(WEEKLY_OVERTIME)
      ? selectWeeklyRule(input.overtimeRules, ["US", ...states], week)
      : null;
    const threshold = weekly?.thresholdMinutes ?? Number.MAX_SAFE_INTEGER;
    const splits = splitAtThreshold(shifts, threshold);
    const totalMinutes = shifts.reduce((sum, s) => sum + s.minutes, 0);
    const overtimeMinutes = splits.reduce((sum, s) => sum + s.overtime, 0);

    // 4. regular rate: a single pay rate in this slice.
    const rates = new Set(shifts.map((s) => s.payRateCents));
    if (overtimeMinutes > 0 && rates.size > 1) {
      weekBlockers.push({ code: "multiple_pay_rates_with_overtime", ...who, message: `${first.workerName}, workweek starting ${week}: overtime with ${rates.size} different pay rates needs the weighted regular rate (29 C.F.R. § 778.115), which arrives with the full rules engine.` });
    }

    if (weekBlockers.length > 0) {
      blockers.push(...weekBlockers);
      continue;
    }

    // 7. allocate to assignments (and so to clients), keeping chronological order.
    const buckets = new Map<string, Bucket>();
    splits.forEach(({ shift, regular, overtime }, index) => {
      const b = buckets.get(shift.assignmentId) ?? {
        assignmentId: shift.assignmentId,
        clientId: shift.clientId,
        firstIndex: index,
        sample: shift,
        regular: 0,
        overtime: 0,
        regularEntries: [],
        overtimeEntries: [],
      };
      b.regular += regular;
      b.overtime += overtime;
      if (regular > 0) b.regularEntries.push(...shift.entryIds);
      if (overtime > 0) b.overtimeEntries.push(...shift.entryIds);
      buckets.set(shift.assignmentId, b);
    });

    const citations = weekly ? weekly.citations.join("; ") : "";
    for (const b of [...buckets.values()].sort((x, y) => x.firstIndex - y.firstIndex)) {
      const base = { workerId: first.workerId, assignmentId: b.assignmentId, clientId: b.clientId, workweekStart: week };
      const payRate: Fraction = { num: b.sample.payRateCents, den: 1 };
      const billRate: Fraction = { num: b.sample.billRateCents, den: 1 };

      // 3. straight pay
      if (b.regular > 0) {
        const pay = arithmetic("Regular", b.regular, payRate, "");
        const scope = weekly
          ? `hours up to the ${formatDuration(weekly.thresholdMinutes)} weekly threshold in the workweek starting ${week}`
          : `all hours in the workweek starting ${week}`;
        payLines.push({ ...base, type: "REG", minutes: b.regular, rate: payRate, amountCents: pay.amountCents, ruleId: "straight_time", explain: `${pay.text} Rule straight_time: ${scope}.`, entryIds: b.regularEntries });
        const bill = arithmetic("Billed regular", b.regular, billRate, "");
        billLines.push({ ...base, type: "REG", minutes: b.regular, rate: billRate, amountCents: bill.amountCents, ruleId: "bill_regular", explain: `${bill.text} Bill rate from the rate card.`, entryIds: b.regularEntries });
      }

      // 5. overtime pay and its billing
      if (b.overtime > 0 && weekly) {
        const otRate = reduce({ num: mul(b.sample.payRateCents, weekly.multiplier.num), den: weekly.multiplier.den });
        const note = ` (${formatMultiplier(weekly.multiplier)} × ${formatRate(payRate).replace("/h", "")})`;
        const pay = arithmetic("Overtime", b.overtime, otRate, note);
        const why = `Rule ${WEEKLY_OVERTIME}: ${formatDuration(totalMinutes)} worked in the workweek starting ${week} is ${formatDuration(overtimeMinutes)} over the ${formatDuration(weekly.thresholdMinutes)} threshold (${citations}).`;
        payLines.push({ ...base, type: "OT", minutes: b.overtime, rate: otRate, amountCents: pay.amountCents, ruleId: WEEKLY_OVERTIME, explain: `${pay.text} ${why}`, entryIds: b.overtimeEntries });

        const rule = b.sample.otBillingRule;
        if (rule === "multiplier") {
          const m = b.sample.billOtMultiplier;
          const rate = reduce({ num: mul(b.sample.billRateCents, m.num), den: m.den });
          const bill = arithmetic("Billed overtime", b.overtime, rate, ` (${formatMultiplier(m)} × ${formatRate(billRate).replace("/h", "")} bill rate)`);
          billLines.push({ ...base, type: "OT", minutes: b.overtime, rate, amountCents: bill.amountCents, ruleId: "bill_overtime_multiplier", explain: `${bill.text} Client bills overtime at the rate-card overtime multiplier.`, entryIds: b.overtimeEntries });
        } else if (rule === "straight_time") {
          const bill = arithmetic("Billed overtime at straight time", b.overtime, billRate, "");
          billLines.push({ ...base, type: "OT", minutes: b.overtime, rate: billRate, amountCents: bill.amountCents, ruleId: "bill_overtime_straight", explain: `${bill.text} Client bills overtime at straight time.`, entryIds: b.overtimeEntries });
        } else {
          billLines.push({ ...base, type: "OT", minutes: b.overtime, rate: { num: 0, den: 1 }, amountCents: 0, ruleId: "bill_overtime_not_billable", explain: `Overtime not billed: ${formatDuration(b.overtime)} (${b.overtime} min) → ${formatCents(0)}. Client profile marks overtime not billable.`, entryIds: b.overtimeEntries });
        }
      }
      // 6. confirmed premiums — slice (c).
    }
  }

  for (const line of payLines) {
    if (line.minutes > 0 && line.amountCents <= 0) {
      blockers.push({ code: "zero_or_negative_pay", workerId: line.workerId, workweekStart: line.workweekStart, entryIds: line.entryIds, message: `Pay line ${line.type} for workweek ${line.workweekStart} computes to ${formatCents(line.amountCents)}.` });
    }
  }

  const order = (a: Line, b: Line) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
  return {
    rulesVersion: RULES_VERSION,
    payLines: sortLines(payLines, order),
    billLines: sortLines(billLines, order),
    blockers,
  };
}

/** Keeps the per-week chronological assignment order, with types in a fixed order inside it. */
function sortLines(lines: Line[], typeOrder: (a: Line, b: Line) => number): Line[] {
  const position = new Map<string, number>();
  lines.forEach((l, i) => {
    const k = `${l.workerId}\u0000${l.workweekStart}\u0000${l.assignmentId}`;
    if (!position.has(k)) position.set(k, i);
  });
  return [...lines].sort((a, b) => {
    if (a.workerId !== b.workerId) return a.workerId.localeCompare(b.workerId);
    if (a.workweekStart !== b.workweekStart) return a.workweekStart.localeCompare(b.workweekStart);
    const pa = position.get(`${a.workerId}\u0000${a.workweekStart}\u0000${a.assignmentId}`)!;
    const pb = position.get(`${b.workerId}\u0000${b.workweekStart}\u0000${b.assignmentId}`)!;
    if (pa !== pb) return pa - pb;
    return typeOrder(a, b);
  });
}
