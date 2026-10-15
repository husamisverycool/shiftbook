/**
 * Shiftbook pay and bill engine (SPEC §9). Pure and deterministic: the same input always gives the
 * same output; no I/O, no clock, integer math only.
 *
 * Order per worker-week (SPEC §9):
 *   1. classify minutes        — validate shifts, group into fixed workweeks, jurisdiction gate
 *   2. apply wage floor        — block pay below the highest applicable minimum wage
 *   3. straight pay            — regular minutes × the pay rate in effect for each shift
 *   4. regular rate            — slice (a): the week's single pay rate (several rates + OT block)
 *   5. overtime                — weekly overtime, most protective rule once, never double counted
 *   6. confirmed premiums      — slice (c): meal/rest premiums, holidays, guarantees
 *   7. allocate to clients     — lines per assignment and rate; bill lines mirror pay-line minutes
 *
 * Anything this version cannot compute correctly blocks the worker-week instead of guessing.
 */
import { addDays, isEffective, isIsoDate, toDayNumber, workweekStart } from "./dates";
import { formatCents, formatDuration, formatMultiplier, formatRate } from "./format";
import { exactDecimal, mul, reduceFraction as reduce, roundHalfUp } from "./int";
import { placeKey, placeMatches } from "./places";
import { MINIMUM_WAGE, selectMinimumWage } from "./rules/minimum-wage";
import { selectWeeklyRule, splitAtThreshold, WEEKLY_OVERTIME } from "./rules/weekly-overtime";
import type { EarningType, Fraction, Issue, JurisdictionRule, Line, PayInput, PayResult, Shift } from "./types";

export const RULES_VERSION = "2026.10-a3";

/** Rule codes this engine version implements. Any other applicable rule code blocks the run. */
export const IMPLEMENTED_RULE_CODES = new Set([WEEKLY_OVERTIME, MINIMUM_WAGE]);
/** Federal rules that must always be present; without them nothing is computed. */
const REQUIRED_FEDERAL_RULES = [WEEKLY_OVERTIME, MINIMUM_WAGE];

const TYPE_ORDER: EarningType[] = ["REG", "OT", "DT", "HOL", "DIFF", "MEAL_PREMIUM", "REST_PREMIUM", "MIN_GUARANTEE"];
const MINUTES_PER_DAY = 1440;
const STATE = /^[A-Z]{2}$/;

/** Plain code-unit comparison: deterministic on every machine, unlike locale collation. */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** amount = minutes × rate / 60, in cents, rounded half-up exactly once. */
function lineAmount(minutes: number, rate: Fraction): { amountCents: number; exact: string; wasExact: boolean } {
  const num = mul(minutes, rate.num);
  const den = mul(60, rate.den);
  const amountCents = roundHalfUp(num, den);
  return { amountCents, exact: exactDecimal(num, den), wasExact: mul(amountCents, den) === num };
}

function arithmetic(label: string, minutes: number, rate: Fraction, rateNote: string): { text: string; amountCents: number } {
  const { amountCents, exact, wasExact } = lineAmount(minutes, rate);
  const rounding = wasExact ? "exactly →" : "→ rounded half-up once →";
  const text = `${label}: ${formatDuration(minutes)} (${minutes} min) × ${formatRate(rate)}${rateNote} = ${exact}¢ ${rounding} ${formatCents(amountCents)}.`;
  return { text, amountCents };
}

function validShift(s: Shift): string | null {
  if (!isIsoDate(s.date)) return `"${s.date}" is not a real calendar date`;
  if (!STATE.test(s.jurisdiction) || s.jurisdiction === "US") return `worksite state "${s.jurisdiction}" is not a two-letter state code`;
  if (placeKey(s.county) === "" || placeKey(s.city) === "") return "the worksite's county and city are needed to check local ordinances";
  if (!Number.isSafeInteger(s.minutes) || s.minutes < 0) return `minutes must be a whole number ≥ 0 (got ${s.minutes})`;
  if (s.minutes > MINUTES_PER_DAY) return `${s.minutes} minutes is more than one day`;
  if (s.startMinute !== null) {
    if (!Number.isSafeInteger(s.startMinute) || s.startMinute < 0 || s.startMinute >= MINUTES_PER_DAY) return "start time must be within the day";
    if (s.startMinute + s.minutes > MINUTES_PER_DAY) return "the shift runs past midnight; split it at midnight so each day carries its own minutes";
  }
  if (!Number.isSafeInteger(s.payRateCents) || s.payRateCents <= 0) return "pay rate must be a positive number of cents";
  if (!Number.isSafeInteger(s.billRateCents) || s.billRateCents <= 0) return "bill rate must be a positive number of cents";
  const m = s.billOtMultiplier;
  if (!Number.isSafeInteger(m.num) || !Number.isSafeInteger(m.den) || m.num <= 0 || m.den <= 0) return "multipliers must be positive whole-number fractions";
  return null;
}

function chronological(a: Shift, b: Shift): number {
  if (a.date !== b.date) return toDayNumber(a.date) - toDayNumber(b.date);
  const sa = a.startMinute ?? 0;
  const sb = b.startMinute ?? 0;
  if (sa !== sb) return sa - sb;
  return cmp(a.entryIds[0] ?? "", b.entryIds[0] ?? "");
}

/** Jurisdiction rows for a worksite on a date: statewide rows plus rows for its county or city. */
function rowsFor(rules: JurisdictionRule[], state: string, county: string, city: string, date: string) {
  return rules.filter(
    (r) =>
      r.jurisdiction === state &&
      (state === "US" || (placeMatches(r.county, county) && placeMatches(r.city, city))) &&
      isEffective(date, r.effectiveFrom, r.effectiveTo),
  );
}

/** Shifts on one line share assignment, rates and billing rule. */
const lineKey = (s: Shift) => [s.assignmentId, s.payRateCents, s.billRateCents, s.billOtMultiplier.num, s.billOtMultiplier.den, s.otBillingRule].join("|");

interface Bucket {
  key: string;
  assignmentId: string;
  clientId: string;
  firstIndex: number;
  sample: Shift;
  regular: number;
  overtime: number;
  regularEntries: string[];
  overtimeEntries: string[];
}

function emptyResult(blockers: Issue[]): PayResult {
  return { rulesVersion: RULES_VERSION, payLines: [], billLines: [], blockers, warnings: [] };
}

export function computePay(input: PayInput): PayResult {
  if (!Number.isInteger(input.workweekStartsOn) || input.workweekStartsOn < 0 || input.workweekStartsOn > 6) {
    return emptyResult([{ code: "invalid_input", message: `The workweek start day must be 0 (Sunday) to 6 (Saturday); got ${String(input.workweekStartsOn)}.` }]);
  }

  const blockers: Issue[] = [];
  const warnings: Issue[] = [];
  const payLines: Line[] = [];
  const billLines: Line[] = [];

  // A worker with a shift that cannot be placed in any week is held entirely.
  const heldWorkers = new Set<string>();
  const seenEntries = new Map<string, string>();
  for (const shift of input.shifts) {
    if (!isIsoDate(shift.date)) {
      heldWorkers.add(shift.workerId);
      blockers.push({ code: "invalid_input", workerId: shift.workerId, workerName: shift.workerName, entryIds: shift.entryIds, message: `${shift.workerName}: "${shift.date}" is not a real calendar date. All of this worker's weeks are held until it is fixed.` });
    }
    for (const id of shift.entryIds) {
      const other = seenEntries.get(id);
      if (other !== undefined && !heldWorkers.has(shift.workerId)) {
        heldWorkers.add(shift.workerId);
        blockers.push({ code: "invalid_input", workerId: shift.workerId, workerName: shift.workerName, entryIds: [id], message: `${shift.workerName}: time entry ${id} appears in more than one shift, so it would be paid twice. All of this worker's weeks are held.` });
      }
      seenEntries.set(id, shift.workerId);
    }
  }

  // 1. classify minutes: group by worker and fixed workweek; remember invalid shifts per week.
  const weeks = new Map<string, Shift[]>();
  const invalid = new Map<string, Issue[]>();
  for (const shift of input.shifts) {
    if (heldWorkers.has(shift.workerId)) continue;
    const problem = validShift(shift);
    const week = workweekStart(shift.date, input.workweekStartsOn);
    const key = `${shift.workerId}\u0000${week}`;
    if (problem) {
      const list = invalid.get(key) ?? [];
      list.push({ code: "invalid_input", workerId: shift.workerId, workerName: shift.workerName, workweekStart: week, date: shift.date, entryIds: shift.entryIds, message: `${shift.workerName} on ${shift.date}: ${problem}. The whole workweek is held until it is fixed.` });
      invalid.set(key, list);
    }
    if (shift.minutes === 0 && !problem) continue;
    const list = weeks.get(key) ?? [];
    list.push(shift);
    weeks.set(key, list);
  }

  for (const key of [...new Set([...weeks.keys(), ...invalid.keys()])].sort(cmp)) {
    const shifts = [...(weeks.get(key) ?? [])].sort(chronological);
    const first = shifts[0]!;
    const week = workweekStart(first.date, input.workweekStartsOn);
    const who = { workerId: first.workerId, workerName: first.workerName, workweekStart: week };
    const weekBlockers: Issue[] = [...(invalid.get(key) ?? [])];
    if (weekBlockers.length > 0) {
      blockers.push(...weekBlockers);
      continue;
    }

    // A day can hold at most 24 hours, and shifts with known start times must not overlap.
    const byDay = new Map<string, Shift[]>();
    for (const s of shifts) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
    for (const [date, dayShifts] of [...byDay].sort((a, b) => cmp(a[0], b[0]))) {
      const minutes = dayShifts.reduce((sum, s) => sum + s.minutes, 0);
      if (minutes > MINUTES_PER_DAY) {
        weekBlockers.push({ code: "invalid_input", ...who, date, message: `${first.workerName} on ${date}: ${formatDuration(minutes)} recorded in one day, more than 24 hours.` });
        continue;
      }
      const timed = dayShifts.filter((s) => s.startMinute !== null).sort((a, b) => a.startMinute! - b.startMinute!);
      for (let i = 1; i < timed.length; i++) {
        const prev = timed[i - 1]!;
        if (timed[i]!.startMinute! < prev.startMinute! + prev.minutes) {
          weekBlockers.push({ code: "invalid_input", ...who, date, entryIds: [...prev.entryIds, ...timed[i]!.entryIds], message: `${first.workerName} on ${date}: two shifts overlap in time, so the same minutes would be paid twice.` });
          break;
        }
      }
    }

    // Jurisdiction gate, checked on every day worked: every worksite state must be known, and every
    // rule that applies there (statewide or local) must be implemented by this version.
    const applicable = new Set<string>();
    const federal = new Set<string>();
    const dates = [...byDay.keys()].sort(cmp);
    for (const date of dates) for (const row of rowsFor(input.jurisdictionRules, "US", "", "", date)) federal.add(row.ruleCode);
    for (const code of federal) applicable.add(code);
    const missingFederal = REQUIRED_FEDERAL_RULES.filter((c) => !federal.has(c));
    if (missingFederal.length > 0) {
      weekBlockers.push({ code: "rule_data_missing", ...who, jurisdiction: "US", message: `${first.workerName}, workweek starting ${week}: the federal rule data (${missingFederal.join(", ")}) is missing, so nothing can be computed.` });
    }
    const reported = new Set<string>();
    const sites = [...new Map(shifts.map((s) => [`${s.jurisdiction}|${placeKey(s.county)}|${placeKey(s.city)}`, s])).values()];
    for (const site of sites.sort((a, b) => cmp(`${a.jurisdiction}${a.county}${a.city}`, `${b.jurisdiction}${b.county}${b.city}`))) {
      const siteDates = [...new Set(shifts.filter((s) => s.jurisdiction === site.jurisdiction && placeKey(s.county) === placeKey(site.county) && placeKey(s.city) === placeKey(site.city)).map((s) => s.date))].sort(cmp);
      const known = siteDates.some((d) => input.jurisdictionRules.some((r) => r.jurisdiction === site.jurisdiction && isEffective(d, r.effectiveFrom, r.effectiveTo)));
      if (!known) {
        weekBlockers.push({ code: "unknown_jurisdiction", ...who, jurisdiction: site.jurisdiction, message: `${first.workerName}, workweek starting ${week}: no wage rules are on file for ${site.jurisdiction}, so this week cannot be computed.` });
        continue;
      }
      for (const date of siteDates) {
        for (const row of rowsFor(input.jurisdictionRules, site.jurisdiction, site.county, site.city, date)) {
          applicable.add(row.ruleCode);
          const k = `${site.jurisdiction}|${row.county ?? ""}|${row.city ?? ""}|${row.ruleCode}`;
          if (!IMPLEMENTED_RULE_CODES.has(row.ruleCode) && !reported.has(k)) {
            reported.add(k);
            const scope = row.city ? `${row.city}, ${site.jurisdiction}` : row.county ? `${row.county} County, ${site.jurisdiction}` : site.jurisdiction;
            weekBlockers.push({ code: "rule_not_supported_yet", ...who, jurisdiction: site.jurisdiction, ruleCode: row.ruleCode, date, message: `${first.workerName}, workweek starting ${week}: ${scope} rule ${row.ruleCode} (${row.citation}) is not implemented yet, so this week cannot be computed.` });
          }
        }
      }
    }
    const states = [...new Set(shifts.map((s) => s.jurisdiction))].sort(cmp);
    if (weekBlockers.length > 0) {
      blockers.push(...weekBlockers);
      continue;
    }

    // 2. wage floor: the highest applicable minimum wage on each day worked.
    if (applicable.has(MINIMUM_WAGE)) {
      const seen = new Set<string>();
      for (const s of shifts) {
        const floor = selectMinimumWage(input.minimumWageRules, s.jurisdiction, s.county, s.city, s.date);
        if (!floor) {
          weekBlockers.push({ code: "rule_data_missing", ...who, jurisdiction: s.jurisdiction, ruleCode: MINIMUM_WAGE, date: s.date, message: `${first.workerName} on ${s.date}: no minimum-wage rate is on file for ${s.jurisdiction} on that date.` });
          continue;
        }
        const k = `${s.payRateCents}|${floor.rateCents}`;
        if (s.payRateCents < floor.rateCents && !seen.has(k)) {
          seen.add(k);
          weekBlockers.push({ code: "below_minimum_wage", ...who, jurisdiction: s.jurisdiction, ruleCode: MINIMUM_WAGE, date: s.date, entryIds: s.entryIds, message: `${first.workerName} on ${s.date}: pay rate ${formatRate({ num: s.payRateCents, den: 1 })} is below the minimum wage of ${formatRate({ num: floor.rateCents, den: 1 })} (${floor.citations.join("; ")}).` });
        }
      }
    }

    // 5. overtime: each state that lists weekly overtime must have its own rule row; then the most
    // protective weekly rule across federal and state rows is applied once.
    for (const state of states) {
      const listsWeekly = dates.some((d) => rowsFor(input.jurisdictionRules, state, "", "", d).some((r) => r.ruleCode === WEEKLY_OVERTIME && r.county == null && r.city == null));
      const hasRow = input.overtimeRules.some((r) => r.jurisdiction === state && r.ruleCode === WEEKLY_OVERTIME && r.kind === "weekly" && isEffective(week, r.effectiveFrom, r.effectiveTo));
      if (listsWeekly && !hasRow) {
        weekBlockers.push({ code: "rule_data_missing", ...who, jurisdiction: state, ruleCode: WEEKLY_OVERTIME, message: `${first.workerName}, workweek starting ${week}: ${state} weekly overtime applies but its rule row is missing, so this week cannot be computed.` });
      }
    }
    const stateRowMissing = weekBlockers.some((b) => b.code === "rule_data_missing" && b.ruleCode === WEEKLY_OVERTIME);
    const weekly = applicable.has(WEEKLY_OVERTIME) ? selectWeeklyRule(input.overtimeRules, ["US", ...states], week) : null;
    if (applicable.has(WEEKLY_OVERTIME) && !weekly && !stateRowMissing) {
      weekBlockers.push({ code: "rule_data_missing", ...who, ruleCode: WEEKLY_OVERTIME, message: `${first.workerName}, workweek starting ${week}: weekly overtime applies but no overtime rule row is in effect, so this week cannot be computed.` });
    }

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

    // Overtime allocation follows the order of work; flag days where that order was assumed.
    const otDays = new Set(splits.filter((x) => x.overtime > 0).map((x) => x.shift.date));
    for (const date of [...otDays].sort(cmp)) {
      const sameDay = byDay.get(date) ?? [];
      if (new Set(sameDay.map(lineKey)).size > 1 && sameDay.some((s) => s.startMinute === null)) {
        warnings.push({ code: "allocation_order_assumed", ...who, date, message: `${first.workerName} on ${date}: shifts paid or billed differently have no start time, so the order used to decide which one carries the overtime was assumed.` });
      }
    }

    // 7. allocate to assignments (and so to clients) at the rates in effect for each shift.
    const buckets = new Map<string, Bucket>();
    splits.forEach(({ shift, regular, overtime }, index) => {
      const k = lineKey(shift);
      const b = buckets.get(k) ?? { key: k, assignmentId: shift.assignmentId, clientId: shift.clientId, firstIndex: index, sample: shift, regular: 0, overtime: 0, regularEntries: [], overtimeEntries: [] };
      b.regular += regular;
      b.overtime += overtime;
      if (regular > 0) b.regularEntries.push(...shift.entryIds);
      if (overtime > 0) b.overtimeEntries.push(...shift.entryIds);
      buckets.set(k, b);
    });

    const weekPay: Line[] = [];
    const weekBill: Line[] = [];
    const citations = weekly ? weekly.citations.join("; ") : "";
    for (const b of [...buckets.values()].sort((x, y) => x.firstIndex - y.firstIndex)) {
      const base = { workerId: first.workerId, assignmentId: b.assignmentId, clientId: b.clientId, workweekStart: week };
      const payRate: Fraction = { num: b.sample.payRateCents, den: 1 };
      const billRate: Fraction = { num: b.sample.billRateCents, den: 1 };

      // 3. straight pay
      if (b.regular > 0) {
        const pay = arithmetic("Regular", b.regular, payRate, "");
        const scope = weekly ? `hours up to the ${formatDuration(weekly.thresholdMinutes)} weekly threshold in the workweek starting ${week}` : `all hours in the workweek starting ${week}`;
        weekPay.push({ ...base, type: "REG", minutes: b.regular, rate: payRate, amountCents: pay.amountCents, ruleId: "straight_time", explain: `${pay.text} Rule straight_time: ${scope}.`, entryIds: b.regularEntries });
        const bill = arithmetic("Billed regular", b.regular, billRate, "");
        weekBill.push({ ...base, type: "REG", minutes: b.regular, rate: billRate, amountCents: bill.amountCents, ruleId: "bill_regular", explain: `${bill.text} Bill rate from the rate card.`, entryIds: b.regularEntries });
      }

      // 5. overtime pay and its billing
      if (b.overtime > 0 && weekly) {
        const elsewhere = splits.filter((x) => x.shift.assignmentId !== b.assignmentId).reduce((sum, x) => sum + x.regular, 0);
        const elsewhereNote = elsewhere > 0 ? ` ${formatDuration(elsewhere)} of the first ${formatDuration(weekly.thresholdMinutes)} were worked on other assignments.` : "";
        const otRate = reduce({ num: mul(b.sample.payRateCents, weekly.multiplier.num), den: weekly.multiplier.den });
        const note = ` (${formatMultiplier(weekly.multiplier)} × ${formatRate(payRate).replace("/h", "")})`;
        const pay = arithmetic("Overtime", b.overtime, otRate, note);
        const why = `Rule ${WEEKLY_OVERTIME}: ${formatDuration(totalMinutes)} worked in the workweek starting ${week} is ${formatDuration(overtimeMinutes)} over the ${formatDuration(weekly.thresholdMinutes)} threshold (${citations}).${elsewhereNote}`;
        weekPay.push({ ...base, type: "OT", minutes: b.overtime, rate: otRate, amountCents: pay.amountCents, ruleId: WEEKLY_OVERTIME, explain: `${pay.text} ${why}`, entryIds: b.overtimeEntries });

        const rule = b.sample.otBillingRule;
        if (rule === "multiplier") {
          const m = b.sample.billOtMultiplier;
          const rate = reduce({ num: mul(b.sample.billRateCents, m.num), den: m.den });
          const bill = arithmetic("Billed overtime", b.overtime, rate, ` (${formatMultiplier(m)} × ${formatRate(billRate).replace("/h", "")} bill rate)`);
          weekBill.push({ ...base, type: "OT", minutes: b.overtime, rate, amountCents: bill.amountCents, ruleId: "bill_overtime_multiplier", explain: `${bill.text} Client bills overtime at the rate-card overtime multiplier.${elsewhereNote}`, entryIds: b.overtimeEntries });
        } else if (rule === "straight_time") {
          const bill = arithmetic("Billed overtime at straight time", b.overtime, billRate, "");
          weekBill.push({ ...base, type: "OT", minutes: b.overtime, rate: billRate, amountCents: bill.amountCents, ruleId: "bill_overtime_straight", explain: `${bill.text} Client bills overtime at straight time.${elsewhereNote}`, entryIds: b.overtimeEntries });
        } else {
          weekBill.push({ ...base, type: "OT", minutes: b.overtime, rate: { num: 0, den: 1 }, amountCents: 0, ruleId: "bill_overtime_not_billable", explain: `Overtime not billed: ${formatDuration(b.overtime)} (${b.overtime} min) → ${formatCents(0)}. Client profile marks overtime not billable.${elsewhereNote}`, entryIds: b.overtimeEntries });
        }
      }
      // 6. confirmed premiums — slice (c).
    }

    const zero = weekPay.filter((l) => l.minutes > 0 && l.amountCents <= 0);
    if (zero.length > 0) {
      blockers.push(...zero.map((l) => ({ code: "zero_or_negative_pay" as const, ...who, entryIds: l.entryIds, message: `${first.workerName}: pay line ${l.type} for the workweek starting ${week} computes to ${formatCents(l.amountCents)}.` })));
      continue;
    }
    payLines.push(...weekPay);
    billLines.push(...weekBill);
  }

  const order = (a: Line, b: Line) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
  return {
    rulesVersion: RULES_VERSION,
    payLines: sortLines(payLines, order),
    billLines: sortLines(billLines, order),
    blockers,
    warnings,
  };
}

/** Keeps the per-week chronological order of buckets, with types in a fixed order inside each. */
function sortLines(lines: Line[], typeOrder: (a: Line, b: Line) => number): Line[] {
  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      if (a.line.workerId !== b.line.workerId) return cmp(a.line.workerId, b.line.workerId);
      if (a.line.workweekStart !== b.line.workweekStart) return cmp(a.line.workweekStart, b.line.workweekStart);
      return a.index - b.index || typeOrder(a.line, b.line);
    })
    .map((x) => x.line);
}

/** Exposed for tests of week boundaries. */
export const _internal = { addDays };
