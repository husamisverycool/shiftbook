/**
 * Shiftbook pay and bill engine (SPEC §9). Pure and deterministic: the same input always gives the
 * same output; no I/O, no clock, integer math only.
 *
 * Order per worker-week (SPEC §9):
 *   1. classify minutes        — validate shifts, group into fixed workweeks, jurisdiction gate
 *   2. apply wage floor        — the highest applicable minimum wage each day; a rate card below it
 *                                is topped up on a separate line, with a warning
 *   3. straight pay            — regular minutes × the pay rate in effect for each shift
 *   4. regular rate            — the weighted average of the week's rates, exact (29 C.F.R. § 778.115)
 *   5. overtime                — weekly overtime, most protective rule once, never double counted
 *   6. confirmed premiums      — meal/rest premiums, minimum pay for a short day, holiday pay,
 *                                bonuses (a nondiscretionary bonus is in the regular rate)
 *   7. allocate to clients     — lines per assignment and rate; bill lines mirror pay-line minutes
 *
 * Anything this version cannot compute correctly blocks the worker-week instead of guessing.
 */
import { addDays, isEffective, isIsoDate, toDayNumber, workweekStart } from "./dates";
import { formatCents, formatDuration, formatMoney, formatMultiplier, formatRate } from "./format";
import { exactDecimalBig, mul, reduceFraction as reduce, reduceFractionBig, roundHalfUpBig } from "./int";
import { isLocal, placeProblem, scopeMatches } from "./places";
import { canonicalRules, ruleDataProblems } from "./rule-data";
import { hasLocalRate, MINIMUM_WAGE, selectMinimumWage } from "./rules/minimum-wage";
import { CA_REGULAR_RATE_CITATION, overtimeRate, premiumBase, premiumWorth, RATE_FLOOR_CITATION, REGULAR_RATE_CITATION, regularRateWith, worthMore } from "./rules/regular-rate";
import { CA_DAILY_DOUBLE_TIME, CA_DAILY_OVERTIME, CA_SEVENTH_DAY, CALIFORNIA_RULE_CODES, selectCaliforniaRules, splitCalifornia, type PremiumSplit } from "./rules/california-overtime";
import { selectWeeklyRule, splitAtThreshold, WEEKLY_OVERTIME } from "./rules/weekly-overtime";
import { CA_REPORTING_TIME, caReportingTime } from "./rules/ca-reporting-time";
import { IL_DAY_LABOR_MINIMUM, ilDayLaborMinimum } from "./rules/il-day-labor-minimum";
import { MA_REPORTING_PAY, maReportingPay } from "./rules/ma-reporting-pay";
import { guaranteeRuleFor, PREMIUM_OF, premiumRuleFor } from "./rules/meal-rest-premium";
import { HOLIDAY_CITATION, HOLIDAY_NOT_WORKED, HOLIDAY_WORKED, holidayPolicyFor, premiumCountsInRegularRate } from "./rules/holiday-pay";
import { addWorth, alvaradoWorth, BONUS, BONUS_CITATION, CA_FLAT_SUM_BONUS, CA_FLAT_SUM_CITATION } from "./rules/bonus";
import type { Bonus, Confirmation, ConfirmationKind, EarningType, Fraction, HolidayPolicy, Issue, JurisdictionRule, Line, PayInput, PayResult, PremiumRule, Shift } from "./types";

export const RULES_VERSION = "2026.10-c7";

/** Rule codes this engine version implements. Any other applicable rule code blocks the run. */
export const IMPLEMENTED_RULE_CODES = new Set<string>([WEEKLY_OVERTIME, MINIMUM_WAGE, ...CALIFORNIA_RULE_CODES]);
/** Federal rules that must always be present; without them nothing is computed. */
const REQUIRED_FEDERAL_RULES = [WEEKLY_OVERTIME, MINIMUM_WAGE];

const TYPE_ORDER: EarningType[] = ["REG", "OT", "DT", "MW_TRUEUP", "REPORTING_PAY", "HOL", "HOL_NOT_WORKED", "DIFF", "MEAL_PREMIUM", "REST_PREMIUM", "MIN_GUARANTEE", "BONUS", "BONUS_OT"];
const MINUTES_PER_DAY = 1440;
/** Bounds that keep every product inside safe integers: $100,000/h, factors up to 1000. */
const MAX_RATE_CENTS = 10_000_000;
const MAX_FACTOR = 1000;
const BILLING_RULES = new Set(["multiplier", "straight_time", "not_billable"]);
/** A bonus above $100,000 for one week is a typo, not an amount to pay. */
const MAX_BONUS_CENTS = 10_000_000;
const CONFIRMED: Record<ConfirmationKind, string> = {
  meal_period_missed: "missed meal period",
  rest_period_missed: "missed rest period",
  reported_short: "short day",
  holiday_not_worked: "holiday not worked",
};

/** Plain code-unit comparison: deterministic on every machine, unlike locale collation. */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** "a", "a and b", "a, b and c". */
const listAnd = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const uniqueSorted = (ids: string[]) => [...new Set(ids)].sort(cmp);

/** amount = minutes × rate / 60, in cents, rounded half-up exactly once (big integers: no overflow). */
function lineAmount(minutes: number, rate: Fraction): { amountCents: number; exact: string; wasExact: boolean } {
  const num = BigInt(minutes) * BigInt(rate.num);
  const den = 60n * BigInt(rate.den);
  const amountCents = roundHalfUpBig(num, den);
  return { amountCents, exact: exactDecimalBig(num, den), wasExact: BigInt(amountCents) * den === num };
}

function arithmetic(label: string, minutes: number, rate: Fraction, rateNote: string): { text: string; amountCents: number } {
  const { amountCents, exact, wasExact } = lineAmount(minutes, rate);
  const rounding = wasExact ? "exactly →" : "→ rounded half-up once →";
  const text = `${label}: ${formatDuration(minutes)} (${minutes} min) × ${formatRate(rate)}${rateNote} = ${exact}¢ ${rounding} ${formatCents(amountCents)}.`;
  return { text, amountCents };
}

const hasEntryIds = (s: Shift) => Array.isArray(s.entryIds) && s.entryIds.length > 0 && s.entryIds.every((id) => typeof id === "string" && id.trim() !== "");
const entryKey = (s: Shift) => (Array.isArray(s.entryIds) ? [...s.entryIds].map(String).sort(cmp).join("\u0000") : "");
const startOrMinus = (s: Shift) => (typeof s.startMinute === "number" && Number.isFinite(s.startMinute) ? s.startMinute : -1);

/** One fixed order for all shifts, so nothing downstream depends on the order they arrived in. */
function totalOrder(a: Shift, b: Shift): number {
  return (
    cmp(a.workerId, b.workerId) ||
    cmp(a.date, b.date) ||
    startOrMinus(a) - startOrMinus(b) ||
    cmp(entryKey(a), entryKey(b)) ||
    cmp(a.assignmentId, b.assignmentId) ||
    cmp(a.clientId, b.clientId) ||
    cmp(JSON.stringify([a.minutes, a.payRateCents, a.billRateCents, a.billOtMultiplier, a.billDtMultiplier, a.otBillingRule, a.jurisdiction, a.countyFips, a.placeFips]), JSON.stringify([b.minutes, b.payRateCents, b.billRateCents, b.billOtMultiplier, b.billDtMultiplier, b.otBillingRule, b.jurisdiction, b.countyFips, b.placeFips]))
  );
}

function validShift(s: Shift): string | null {
  if (s.reportedOnly) {
    if (s.minutes !== 0 || !Array.isArray(s.entryIds) || s.entryIds.length > 0) return "a day reported without work carries no minutes and no time entry";
  } else {
    if (!hasEntryIds(s)) return "the shift has no time entry id, so it cannot be traced to a timesheet";
    if (new Set(s.entryIds).size !== s.entryIds.length) return "the same time entry is listed twice in this shift";
  }
  if (!isIsoDate(s.date)) return `"${s.date}" is not a real calendar date`;
  const place = placeProblem(s.jurisdiction, s.countyFips, s.placeFips);
  if (place) return place;
  if (!Number.isSafeInteger(s.minutes) || s.minutes < 0) return `minutes must be a whole number ≥ 0 (got ${s.minutes})`;
  if (s.minutes > MINUTES_PER_DAY) return `${s.minutes} minutes is more than one day`;
  if (s.startMinute !== null) {
    if (!Number.isSafeInteger(s.startMinute) || s.startMinute < 0 || s.startMinute >= MINUTES_PER_DAY) return "start time must be within the day";
    if (s.startMinute + s.minutes > MINUTES_PER_DAY) return "the shift runs past midnight; split it at midnight so each day carries its own minutes";
  }
  if (!Number.isSafeInteger(s.payRateCents) || s.payRateCents <= 0 || s.payRateCents > MAX_RATE_CENTS) return "pay rate must be a positive number of cents per hour, at most $100,000";
  if (!Number.isSafeInteger(s.billRateCents) || s.billRateCents <= 0 || s.billRateCents > MAX_RATE_CENTS) return "bill rate must be a positive number of cents per hour, at most $100,000";
  if (s.billRateExplain !== undefined && (typeof s.billRateExplain !== "string" || s.billRateExplain.length > 300)) return "the bill rate's explanation must be text of at most 300 characters";
  for (const [m, what] of [[s.billOtMultiplier, "overtime"], [s.billDtMultiplier, "double-time"]] as [Partial<Fraction> | undefined, string][]) {
    if (!m || !Number.isSafeInteger(m.num) || !Number.isSafeInteger(m.den) || m.num! <= 0 || m.den! <= 0 || m.num! > MAX_FACTOR || m.den! > MAX_FACTOR) {
      return `the ${what} bill multiplier must be a positive whole-number fraction`;
    }
  }
  if (!BILLING_RULES.has(s.otBillingRule)) return `overtime billing rule "${String(s.otBillingRule)}" is not one of multiplier, straight time or not billable`;
  return null;
}

function chronological(a: Shift, b: Shift): number {
  if (a.date !== b.date) return toDayNumber(a.date) - toDayNumber(b.date);
  const sa = a.startMinute ?? 0;
  const sb = b.startMinute ?? 0;
  if (sa !== sb) return sa - sb;
  return cmp(entryKey(a), entryKey(b));
}

type Site = { jurisdiction: string; countyFips: string; placeFips: string | null };
const siteKey = (s: Site) => `${s.jurisdiction}|${s.countyFips}|${s.placeFips ?? ""}`;

/** Jurisdiction rows for a worksite on a date: statewide rows plus rows for its county or place. */
function rowsFor(rules: JurisdictionRule[], site: Site, date: string) {
  return rules.filter((r) => r.jurisdiction === site.jurisdiction && scopeMatches(r, site) && isEffective(date, r.effectiveFrom, r.effectiveTo));
}

function scopeLabel(row: JurisdictionRule): string {
  if (row.jurisdiction === "US") return "Federal";
  const local = row.scopeName ?? (row.countyFips ? `county ${row.countyFips}` : row.placeFips ? `place ${row.placeFips}` : null);
  return local ? `${local}, ${row.jurisdiction}` : row.jurisdiction;
}

/** Shifts on one line share assignment, client, rates and billing rule. */
const lineKey = (s: Shift) => [s.assignmentId, s.clientId, s.payRateCents, s.billRateCents, s.billOtMultiplier.num, s.billOtMultiplier.den, s.billDtMultiplier.num, s.billDtMultiplier.den, s.otBillingRule].join("|");

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
  /** Premium minutes by rule, kind and the premium's base (the regular rate, or a day's higher minimum wage). */
  overtimeParts: {
    key: string;
    ruleCode: string;
    type: "OT" | "DT";
    multiplier: Fraction;
    citation: string;
    thresholdMinutes: number;
    base: Fraction;
    floorApplies: boolean;
    minutes: number;
    entries: string[];
    dates: string[];
  }[];
  /** Minutes paid below the minimum wage, by that minimum: each gets the difference on a top-up line. */
  trueUps: { floor: number; minutes: number; entries: string[]; dates: string[]; citations: string[] }[];
  /** Minutes worked on a holiday with a premium, by policy and the rate the premium is on. */
  holiday: { key: string; policy: HolidayPolicy; rateCents: number; minutes: number; entries: string[]; dates: string[] }[];
  /** How the bill rate came about on the regular and the overtime line: each distinct working (never splits a line). */
  billRate: { regular: BillRateWorking; overtime: BillRateWorking };
}

/** The distinct workings of a line's bill rate, and whether some shift's rate was entered as is. */
type BillRateWorking = { explains: string[]; typed: boolean };
const noteWorking = (w: BillRateWorking, explain: string | undefined) => {
  if (!explain) w.typed = true;
  else if (!w.explains.includes(explain)) w.explains.push(explain);
};

/** " (working; working)" for a bill line — "some shifts:" when others' rate was entered as is — or "" when none was worked out. */
const billRateNote = (w: BillRateWorking) => (w.explains.length === 0 ? "" : ` (${w.typed ? "some shifts: " : ""}${w.explains.join("; ")})`);

function emptyResult(blockers: Issue[]): PayResult {
  return { rulesVersion: RULES_VERSION, payLines: [], billLines: [], blockers, warnings: [] };
}

export function computePay(input: PayInput): PayResult {
  if (!Number.isInteger(input.workweekStartsOn) || input.workweekStartsOn < 0 || input.workweekStartsOn > 6) {
    return emptyResult([{ code: "invalid_input", message: `The workweek start day must be 0 (Sunday) to 6 (Saturday); got ${String(input.workweekStartsOn)}.` }]);
  }

  const rules = canonicalRules(input);
  const ruleProblems = ruleDataProblems(rules);
  if (ruleProblems.length > 0) return emptyResult(ruleProblems);

  const blockers: Issue[] = [];
  const warnings: Issue[] = [];
  const payLines: Line[] = [];
  const billLines: Line[] = [];
  const shiftsInOrder = [...input.shifts].sort(totalOrder);

  // A worker with a shift that cannot be placed in any week is held entirely.
  const heldWorkers = new Set<string>();
  for (const shift of shiftsInOrder) {
    if (!isIsoDate(shift.date)) {
      heldWorkers.add(shift.workerId);
      blockers.push({ code: "invalid_input", workerId: shift.workerId, workerName: shift.workerName, entryIds: shift.entryIds, message: `${shift.workerName}: "${shift.date}" is not a real calendar date. All of this worker's weeks are held until it is fixed.` });
    }
  }
  // A time entry used by more than one shift would be paid twice: every worker involved is held.
  const uses = new Map<string, Shift[]>();
  for (const shift of shiftsInOrder) {
    if (!Array.isArray(shift.entryIds)) continue;
    for (const id of new Set(shift.entryIds)) uses.set(id, [...(uses.get(id) ?? []), shift]);
  }
  const shared = new Map<string, { name: string; ids: Set<string>; others: Set<string> }>();
  for (const [id, list] of uses) {
    if (list.length < 2) continue;
    for (const s of list) {
      const entry = shared.get(s.workerId) ?? { name: s.workerName, ids: new Set<string>(), others: new Set<string>() };
      entry.ids.add(id);
      for (const o of list) if (o.workerId !== s.workerId) entry.others.add(o.workerName);
      shared.set(s.workerId, entry);
    }
  }
  for (const [workerId, { name, ids, others }] of [...shared].sort((a, b) => cmp(a[0], b[0]))) {
    if (heldWorkers.has(workerId)) continue;
    heldWorkers.add(workerId);
    const list = [...ids].sort(cmp);
    const also = others.size > 0 ? ` (also used for ${[...others].sort(cmp).join(", ")})` : "";
    blockers.push({ code: "invalid_input", workerId, workerName: name, entryIds: list, message: `${name}: time entry ${list.join(", ")} appears in more than one shift${also}, so it would be paid twice. All of this worker's weeks are held.` });
  }
  // An assignment belongs to one client; one linked to several cannot be billed correctly.
  const clientsOf = new Map<string, Set<string>>();
  for (const s of shiftsInOrder) clientsOf.set(s.assignmentId, (clientsOf.get(s.assignmentId) ?? new Set<string>()).add(s.clientId));

  // Bonuses and confirmations are entered by people. One whose week cannot be placed holds the
  // worker; any other problem holds its week; one for a week with no hours on file is never dropped.
  const nameOf = (workerId: string) => shiftsInOrder.find((s) => s.workerId === workerId)?.workerName ?? workerId;
  const enteredProblems = new Map<string, Issue[]>();
  const bonusesOf = new Map<string, Bonus[]>();
  const confirmationsOf = new Map<string, Confirmation[]>();
  const holdWorker = (workerId: string, problem: string) => {
    if (heldWorkers.has(workerId)) return;
    heldWorkers.add(workerId);
    blockers.push({ code: "invalid_input", workerId, workerName: nameOf(workerId), message: `${nameOf(workerId)}: ${problem}. All of this worker's weeks are held until it is fixed.` });
  };
  const bonusIds = new Map<string, number>();
  for (const b of input.bonuses ?? []) bonusIds.set(String(b.id), (bonusIds.get(String(b.id)) ?? 0) + 1);
  for (const b of [...(input.bonuses ?? [])].sort((x, y) => cmp(String(x.id), String(y.id)))) {
    if (heldWorkers.has(b.workerId)) continue;
    if (!isIsoDate(b.workweekStart) || workweekStart(b.workweekStart, input.workweekStartsOn) !== b.workweekStart) {
      holdWorker(b.workerId, `a bonus is entered for the week of "${String(b.workweekStart)}", which is not the first day of a workweek, so it cannot be placed`);
      continue;
    }
    const key = `${b.workerId}\u0000${b.workweekStart}`;
    const problem =
      typeof b.id !== "string" || b.id.trim() === ""
        ? "it has no id, so it cannot be traced"
        : bonusIds.get(b.id)! > 1
          ? `bonus ${b.id} is entered twice, so it would be paid twice`
          : !Number.isSafeInteger(b.amountCents) || b.amountCents <= 0 || b.amountCents > MAX_BONUS_CENTS
            ? "its amount must be a positive whole number of cents, at most $100,000"
            : b.kind !== "nondiscretionary" && b.kind !== "flat_sum"
              ? `its kind "${String(b.kind)}" is neither nondiscretionary nor flat-sum`
              : null;
    if (problem) {
      const name = nameOf(b.workerId);
      enteredProblems.set(key, [...(enteredProblems.get(key) ?? []), { code: "invalid_input", workerId: b.workerId, workerName: name, workweekStart: b.workweekStart, message: `${name}, workweek starting ${b.workweekStart}: a bonus cannot be paid because ${problem}. The whole workweek is held until it is fixed.` }]);
    } else {
      bonusesOf.set(key, [...(bonusesOf.get(key) ?? []), b]);
    }
  }
  for (const c of [...(input.confirmations ?? [])].sort((x, y) => cmp(String(x.date), String(y.date)) || cmp(String(x.id), String(y.id)))) {
    if (heldWorkers.has(c.workerId)) continue;
    if (!isIsoDate(c.date)) {
      holdWorker(c.workerId, `a confirmation is for "${String(c.date)}", which is not a real calendar date`);
      continue;
    }
    const key = `${c.workerId}\u0000${workweekStart(c.date, input.workweekStartsOn)}`;
    if (!Object.hasOwn(CONFIRMED, c.kind)) {
      const name = nameOf(c.workerId);
      enteredProblems.set(key, [...(enteredProblems.get(key) ?? []), { code: "invalid_input", workerId: c.workerId, workerName: name, date: c.date, message: `${name} on ${c.date}: "${String(c.kind)}" is not something this version can pay for. The whole workweek is held until it is fixed.` }]);
      continue;
    }
    confirmationsOf.set(key, [...(confirmationsOf.get(key) ?? []), c]);
  }

  // 1. classify minutes: group by worker and fixed workweek; remember invalid shifts per week.
  const weeks = new Map<string, Shift[]>();
  const invalid = new Map<string, Issue[]>();
  for (const shift of shiftsInOrder) {
    if (heldWorkers.has(shift.workerId)) continue;
    const problem = validShift(shift);
    const week = workweekStart(shift.date, input.workweekStartsOn);
    const key = `${shift.workerId}\u0000${week}`;
    if (problem) {
      const list = invalid.get(key) ?? [];
      list.push({ code: "invalid_input", workerId: shift.workerId, workerName: shift.workerName, workweekStart: week, date: shift.date, entryIds: shift.entryIds, message: `${shift.workerName} on ${shift.date}: ${problem}. The whole workweek is held until it is fixed.` });
      invalid.set(key, list);
    }
    if (shift.minutes === 0 && !problem && !shift.reportedOnly) continue;
    const list = weeks.get(key) ?? [];
    list.push(shift);
    weeks.set(key, list);
  }

  for (const key of [...new Set([...weeks.keys(), ...invalid.keys(), ...enteredProblems.keys(), ...bonusesOf.keys(), ...confirmationsOf.keys()])].sort(cmp)) {
    const [workerId, week] = key.split("\u0000") as [string, string];
    if (heldWorkers.has(workerId)) continue;
    const shifts = [...(weeks.get(key) ?? [])].sort(chronological);
    const who = { workerId, workerName: shifts[0]?.workerName ?? nameOf(workerId), workweekStart: week };
    const weekBlockers: Issue[] = [...(invalid.get(key) ?? []), ...(enteredProblems.get(key) ?? [])];
    if (weekBlockers.length === 0 && shifts.length === 0) {
      const what = [...(bonusesOf.get(key) ?? []).map((b) => `a bonus of ${formatCents(b.amountCents)}`), ...(confirmationsOf.get(key) ?? []).map((c) => `a confirmed ${CONFIRMED[c.kind]} on ${c.date}`)];
      const many = what.length > 1;
      weekBlockers.push({ code: "invalid_input", ...who, message: `${who.workerName}, workweek starting ${week}: ${listAnd(what)} ${many ? "are" : "is"} entered for a week with no hours or reported days on file, so ${many ? "they" : "it"} cannot be paid; correct the week, or add the hours.` });
    }
    if (weekBlockers.length > 0) {
      blockers.push(...weekBlockers);
      continue;
    }
    const first = shifts[0]!;

    for (const assignmentId of [...new Set(shifts.map((s) => s.assignmentId))].sort(cmp)) {
      const clients = [...(clientsOf.get(assignmentId) ?? [])].sort(cmp);
      if (clients.length > 1) {
        weekBlockers.push({ code: "invalid_input", ...who, message: `${first.workerName}, workweek starting ${week}: assignment ${assignmentId} is linked to ${clients.length} clients (${clients.join(", ")}); an assignment belongs to one client, so its hours cannot be billed.` });
      }
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
      const timed = dayShifts.filter((s) => s.startMinute !== null).sort((a, b) => a.startMinute! - b.startMinute! || cmp(entryKey(a), entryKey(b)));
      for (let i = 1; i < timed.length; i++) {
        const prev = timed[i - 1]!;
        if (timed[i]!.startMinute! < prev.startMinute! + prev.minutes) {
          weekBlockers.push({ code: "invalid_input", ...who, date, entryIds: [...prev.entryIds, ...timed[i]!.entryIds], message: `${first.workerName} on ${date}: two shifts overlap in time, so the same minutes would be paid twice.` });
          break;
        }
      }
    }

    // Jurisdiction gate, checked on every day worked. Every federal rule and every rule of each
    // worksite's state, county and place must be implemented by this version; a local minimum-wage
    // rule also needs its local rate on file.
    const dates = [...byDay.keys()].sort(cmp);
    const reported = new Set<string>();
    const gate = (row: JurisdictionRule, date: string) => {
      const k = `${row.jurisdiction}|${row.countyFips ?? ""}|${row.placeFips ?? ""}|${row.ruleCode}`;
      if (reported.has(k)) return;
      if (isLocal(row) && row.ruleCode === MINIMUM_WAGE) {
        if (hasLocalRate(rules.minimumWageRules, row.jurisdiction, row, date)) return;
        reported.add(k);
        weekBlockers.push({ code: "rule_data_missing", ...who, jurisdiction: row.jurisdiction, ruleCode: row.ruleCode, date, message: `${first.workerName}, workweek starting ${week}: ${scopeLabel(row)} has its own minimum wage (${row.citation}), but its rate for ${date} is not on file, so this week cannot be computed.` });
        return;
      }
      if (IMPLEMENTED_RULE_CODES.has(row.ruleCode) && !isLocal(row)) return;
      reported.add(k);
      weekBlockers.push({ code: "rule_not_supported_yet", ...who, jurisdiction: row.jurisdiction, ruleCode: row.ruleCode, date, message: `${first.workerName}, workweek starting ${week}: ${scopeLabel(row)} rule ${row.ruleCode} (${row.citation}) is not implemented yet, so this week cannot be computed.` });
    };

    const federal = new Set<string>();
    for (const date of dates) {
      for (const row of rules.jurisdictionRules.filter((r) => r.jurisdiction === "US" && isEffective(date, r.effectiveFrom, r.effectiveTo))) {
        federal.add(row.ruleCode);
        gate(row, date);
      }
    }
    const missingFederal = REQUIRED_FEDERAL_RULES.filter((c) => !federal.has(c));
    if (missingFederal.length > 0) {
      weekBlockers.push({ code: "rule_data_missing", ...who, jurisdiction: "US", message: `${first.workerName}, workweek starting ${week}: the federal rule data (${missingFederal.join(", ")}) is missing, so nothing can be computed.` });
    }
    const sites = [...new Map(shifts.map((s) => [siteKey(s), { jurisdiction: s.jurisdiction, countyFips: s.countyFips, placeFips: s.placeFips }])).values()].sort((a, b) => cmp(siteKey(a), siteKey(b)));
    const statesListingWeekly = new Set<string>();
    for (const site of sites) {
      const siteDates = [...new Set(shifts.filter((s) => siteKey(s) === siteKey(site)).map((s) => s.date))].sort(cmp);
      const known = siteDates.some((d) => rules.jurisdictionRules.some((r) => r.jurisdiction === site.jurisdiction && isEffective(d, r.effectiveFrom, r.effectiveTo)));
      if (!known) {
        weekBlockers.push({ code: "unknown_jurisdiction", ...who, jurisdiction: site.jurisdiction, message: `${first.workerName}, workweek starting ${week}: no wage rules are on file for ${site.jurisdiction}, so this week cannot be computed.` });
        continue;
      }
      for (const date of siteDates) {
        for (const row of rowsFor(rules.jurisdictionRules, site, date)) {
          if (row.ruleCode === WEEKLY_OVERTIME && !isLocal(row)) statesListingWeekly.add(row.jurisdiction);
          gate(row, date);
        }
      }
    }
    const states = [...new Set(shifts.map((s) => s.jurisdiction))].sort(cmp);
    if (weekBlockers.length > 0) {
      blockers.push(...weekBlockers);
      continue;
    }

    // 2. wage floor: the highest of the federal, state and local minimum wage on each day worked.
    const seen = new Set<string>();
    const floorOf = new Map<Shift, number>();
    const floorCitations = new Map<Shift, string[]>();
    const weekWarnings: Issue[] = [];
    for (const s of shifts) {
      const floor = selectMinimumWage(rules.minimumWageRules, s, s.date);
      if (!floor.ok) {
        const k = `missing|${floor.missing}`;
        if (!seen.has(k)) {
          seen.add(k);
          const whose = floor.missing === "US" ? "federal" : floor.missing;
          weekBlockers.push({ code: "rule_data_missing", ...who, jurisdiction: floor.missing, ruleCode: MINIMUM_WAGE, date: s.date, message: `${first.workerName} on ${s.date}: no ${whose} minimum-wage rate is on file for that date, so the wage floor cannot be checked.` });
        }
        continue;
      }
      floorOf.set(s, floor.rateCents);
      floorCitations.set(s, floor.citations);
      const k = `${s.payRateCents}|${floor.rateCents}`;
      if (s.payRateCents < floor.rateCents && !seen.has(k)) {
        seen.add(k);
        weekWarnings.push({ code: "below_minimum_wage", ...who, jurisdiction: s.jurisdiction, ruleCode: MINIMUM_WAGE, date: s.date, entryIds: s.entryIds, message: `${first.workerName} on ${s.date}: pay rate ${formatRate({ num: s.payRateCents, den: 1 })} is below the minimum wage of ${formatRate({ num: floor.rateCents, den: 1 })} (${floor.citations.join("; ")}). A top-up line pays the difference; fix the rate card.` });
      }
    }

    // 5. overtime: the federal row and each listing state's row must cover the whole workweek; then
    // the most protective weekly rule across them is applied once.
    const selection = selectWeeklyRule(rules.overtimeRules, ["US", ...states], ["US", ...statesListingWeekly], week);
    if (!selection.ok) {
      const whose = selection.jurisdiction === "US" ? "federal" : selection.jurisdiction;
      if (selection.reason === "missing") {
        weekBlockers.push({ code: "rule_data_missing", ...who, jurisdiction: selection.jurisdiction, ruleCode: WEEKLY_OVERTIME, message: `${first.workerName}, workweek starting ${week}: ${whose} weekly overtime applies but its rule row for this workweek is missing, so this week cannot be computed.` });
      } else {
        weekBlockers.push({ code: "rule_not_supported_yet", ...who, jurisdiction: selection.jurisdiction, ruleCode: WEEKLY_OVERTIME, date: selection.date, message: `${first.workerName}, workweek starting ${week}: the ${whose} weekly overtime rule changes on ${selection.date}, inside this workweek; a mid-week rule change is not handled yet, so this week cannot be computed.` });
      }
      blockers.push(...weekBlockers);
      continue;
    }
    const weekly = selection.rule;
    const citations = weekly.citations.join("; ");

    // California counts hours day by day (daily, double-time and seventh-day overtime) before the
    // week; elsewhere only the week counts. A week mixing California with another state is held.
    const california = states.includes("CA");
    const weeklySplits: PremiumSplit[] = splitAtThreshold(shifts, weekly.thresholdMinutes).map(({ shift, regular, overtime }) => ({
      shift,
      regular,
      premiums: overtime > 0 ? [{ ruleCode: WEEKLY_OVERTIME, type: "OT" as const, multiplier: weekly.multiplier, minutes: overtime, citation: citations, thresholdMinutes: weekly.thresholdMinutes }] : [],
    }));
    let splits: PremiumSplit[] = weeklySplits;
    let caSplits: PremiumSplit[] | null = null;
    if (california) {
      const others = states.filter((st) => st !== "CA");
      if (others.length > 0) {
        weekBlockers.push({ code: "rule_not_supported_yet", ...who, jurisdiction: "CA", message: `${first.workerName}, workweek starting ${week}: this week mixes California and ${others.join(", ")} worksites; how California's daily and weekly overtime counts hours worked in another state is not settled, so this week is held.` });
        blockers.push(...weekBlockers);
        continue;
      }
      const codes = [...new Set(rules.jurisdictionRules.filter((r) => r.jurisdiction === "CA" && !isLocal(r) && dates.some((d) => isEffective(d, r.effectiveFrom, r.effectiveTo))).map((r) => r.ruleCode))];
      const ca = selectCaliforniaRules(rules.overtimeRules, codes, week);
      if (!ca.ok) {
        weekBlockers.push(
          ca.reason === "missing"
            ? { code: "rule_data_missing", ...who, jurisdiction: "CA", ruleCode: ca.ruleCode, message: `${first.workerName}, workweek starting ${week}: California rule ${ca.ruleCode} applies but its rule row for this workweek is missing, so this week cannot be computed.` }
            : { code: "rule_not_supported_yet", ...who, jurisdiction: "CA", ruleCode: ca.ruleCode, date: ca.date, message: `${first.workerName}, workweek starting ${week}: California rule ${ca.ruleCode} changes on ${ca.date}, inside this workweek; a mid-week rule change is not handled yet, so this week cannot be computed.` },
        );
        blockers.push(...weekBlockers);
        continue;
      }
      caSplits = splitCalifornia(shifts, week, ca.rules, { ...weekly, citation: citations });
    }
    const totalMinutes = shifts.reduce((sum, s) => sum + s.minutes, 0);
    const premiumOf = (x: PremiumSplit) => x.premiums.reduce((sum, p) => sum + p.minutes, 0);

    // Confirmed premiums must be for a day the worker worked on that assignment; a short day or a
    // holiday not worked, for a day the worker was placed there.
    const confirmed = confirmationsOf.get(key) ?? [];
    const holidaysNotWorked: { c: Confirmation; sample: Shift; policy: HolidayPolicy }[] = [];
    const policyConflict = (date: string) => ({ code: "rule_data_invalid" as const, ...who, date, message: `${first.workerName} on ${date}: two holiday policies for this client list ${date}, so which one pays would be a guess; fix the holiday policies.` });
    for (const c of confirmed) {
      const onDay = shifts.filter((s) => s.assignmentId === c.assignmentId && s.date === c.date);
      if (c.kind === "holiday_not_worked") {
        const workedThatDay = shifts.filter((s) => s.date === c.date).reduce((sum, s) => sum + s.minutes, 0);
        const found = onDay.length > 0 ? holidayPolicyFor(rules.holidayPolicies, onDay[0]!.clientId, c.date) : null;
        if (!found) {
          weekBlockers.push({ code: "invalid_input", ...who, date: c.date, message: `${first.workerName} on ${c.date}: a confirmed holiday not worked is for an assignment the worker was not placed on that day, so it cannot be paid; correct the confirmation.` });
        } else if (workedThatDay > 0) {
          weekBlockers.push({ code: "invalid_input", ...who, date: c.date, message: `${first.workerName} on ${c.date}: a holiday not worked was confirmed, but ${formatDuration(workedThatDay)} were worked that day; hours worked on a holiday are paid as worked, so correct the confirmation.` });
        } else if (holidaysNotWorked.some((h) => h.c.date === c.date)) {
          if (!holidaysNotWorked.some((h) => h.c.date === c.date && h.c.assignmentId === c.assignmentId)) {
            weekBlockers.push({ code: "invalid_input", ...who, date: c.date, message: `${first.workerName} on ${c.date}: a holiday not worked is confirmed on two assignments for the same day; holiday pay is paid once a day, so remove one of the confirmations.` });
          }
        } else if (found.ambiguous) {
          weekBlockers.push(policyConflict(c.date));
        } else if (!found.policy || found.policy.notWorkedMinutes === 0) {
          weekBlockers.push({ code: "invalid_input", ...who, date: c.date, message: `${first.workerName} on ${c.date}: a holiday not worked was confirmed, but no holiday policy for this client pays ${c.date} as a holiday not worked, so it cannot be paid; correct the confirmation or the holiday policy.` });
        } else {
          holidaysNotWorked.push({ c, sample: onDay[0]!, policy: found.policy });
        }
        continue;
      }
      const reported = c.kind === "reported_short";
      if (!onDay.some((s) => reported || s.minutes > 0)) {
        const what = reported ? "short day" : (PREMIUM_OF[c.kind]?.what ?? c.kind);
        weekBlockers.push({ code: "invalid_input", ...who, date: c.date, message: `${first.workerName} on ${c.date}: a confirmed ${what} is for an assignment with no ${reported ? "report" : "hours"} that day, so it cannot be paid; correct the confirmation.` });
      } else if (reported && c.scheduledMinutes !== undefined && c.scheduledMinutes !== null && (!Number.isSafeInteger(c.scheduledMinutes) || c.scheduledMinutes <= 0 || c.scheduledMinutes > MINUTES_PER_DAY)) {
        weekBlockers.push({ code: "invalid_input", ...who, date: c.date, message: `${first.workerName} on ${c.date}: the scheduled hours of a confirmed short day must be more than none and at most a day.` });
      }
    }

    // A bonus belongs to an assignment the worker had hours on that week.
    const weekBonuses = bonusesOf.get(key) ?? [];
    for (const b of weekBonuses) {
      if (!shifts.some((s) => s.assignmentId === b.assignmentId && s.minutes > 0)) {
        weekBlockers.push({ code: "invalid_input", ...who, message: `${first.workerName}, workweek starting ${week}: a bonus of ${formatCents(b.amountCents)} is for an assignment with no hours this week, so it cannot be paid; correct the bonus.` });
      }
    }

    // Hours worked on a holiday under the client's (or agency's) policy, when it pays or bills a premium.
    const holidayOf = new Map<Shift, HolidayPolicy>();
    const conflictDays = new Set<string>();
    for (const s of shifts.filter((x) => x.minutes > 0)) {
      const found = holidayPolicyFor(rules.holidayPolicies, s.clientId, s.date);
      if (found.ambiguous) {
        if (!conflictDays.has(`${s.clientId}|${s.date}`)) weekBlockers.push(policyConflict(s.date));
        conflictDays.add(`${s.clientId}|${s.date}`);
      } else if (found.policy) {
        const { workedMultiplier: k, billWorkedMultiplier: bm } = found.policy;
        if (k.num > k.den || (bm && bm.num > bm.den)) holidayOf.set(s, found.policy);
      }
    }

    if (weekBlockers.length > 0) {
      blockers.push(...weekBlockers);
      continue;
    }

    // 4. regular rate: the weighted average of the week's rates, exact (one rate: that rate).
    // Every minute counts at least at that day's minimum wage (a rate card below it is topped up).
    // Pay beyond the hourly rates goes in too: nondiscretionary bonuses, holiday premiums below 1.5×,
    // and flat-sum bonuses — except in California, where a flat-sum bonus has its own overtime.
    const effective = (s: Shift) => Math.max(s.payRateCents, floorOf.get(s)!);
    const worked = shifts.map((s) => ({ minutes: s.minutes, payRateCents: effective(s) }));
    const hasHours = shifts.some((s) => s.minutes > 0);
    const nondiscretionary = weekBonuses.filter((b) => b.kind === "nondiscretionary");
    const flat = weekBonuses.filter((b) => b.kind === "flat_sum");
    const flatCents = flat.reduce((sum, b) => sum + b.amountCents, 0);
    const smallHolidayPremiums = [...holidayOf]
      .filter(([, p]) => p.workedMultiplier.num > p.workedMultiplier.den && premiumCountsInRegularRate(p.workedMultiplier))
      .map(([s, p]) => ({ num: mul(s.minutes, effective(s), p.workedMultiplier.num - p.workedMultiplier.den), den: mul(60, p.workedMultiplier.den) }));
    const asCents = (bs: Bonus[]) => bs.map((b) => ({ num: b.amountCents, den: 1 }));
    // A week of reported days without work has no hours to average: its rate is the day's own.
    const rateWith = (extra: Fraction[]) => (hasHours ? regularRateWith(worked, extra) : { num: Math.max(...shifts.map(effective)), den: 1 });
    const rrHourly = rateWith([...asCents(nondiscretionary), ...smallHolidayPremiums]);
    const rrAll = rateWith([...asCents(nondiscretionary), ...smallHolidayPremiums, ...asCents(flat)]);
    const nonOvertime = caSplits ? caSplits.reduce((sum, x) => sum + x.regular, 0) : 0;
    if (!rrHourly || !rrAll) {
      blockers.push({ code: "invalid_input", ...who, message: `${first.workerName}, workweek starting ${week}: the week's regular rate is too large to compute exactly; check the rates and amounts entered.` });
      continue;
    }
    if (caSplits && flat.length > 0 && nonOvertime === 0) {
      blockers.push({ code: "rule_not_supported_yet", ...who, jurisdiction: "CA", message: `${first.workerName}, workweek starting ${week}: every hour this week is paid at a premium, so a flat-sum bonus has no hours to be spread over (${CA_FLAT_SUM_CITATION}); this week is held.` });
      continue;
    }
    let regularRate = caSplits ? rrHourly : rrAll;
    const singleRate = new Set(worked.map((w) => w.payRateCents)).size === 1 && shifts.every((s) => s.payRateCents >= floorOf.get(s)!) && weekBonuses.length === 0 && smallHolidayPremiums.length === 0;

    // California pays at least what the federal weekly rule would: both apply, so when the weekly
    // rule's premiums are worth more (a minimum wage rising mid-week, or a flat-sum bonus, can do it)
    // they are paid instead. A flat-sum bonus's own overtime counts on California's side.
    let federalGoverns = false;
    if (caSplits) {
      const premiumParts = caSplits.flatMap((x) => x.premiums);
      const californiaWorth = flat.length > 0 ? addWorth(premiumWorth(caSplits, rrHourly, floorOf), alvaradoWorth(premiumParts, flatCents, nonOvertime)) : premiumWorth(caSplits, rrHourly, floorOf);
      if (worthMore(premiumWorth(weeklySplits, rrAll, floorOf), californiaWorth)) {
        federalGoverns = true;
        regularRate = rrAll;
      } else splits = caSplits;
    }
    const flatInRate = flat.length > 0 && (!caSplits || federalGoverns);
    const flatOvertime = flat.length > 0 && caSplits !== null && !federalGoverns;
    // California's own premiums (meal, rest, reporting time) are paid at its regular rate (Ferra): with
    // a flat-sum bonus, the bonus's share is spread over the hours not paid at a premium (Alvarado).
    let premiumRate: Fraction = regularRate;
    let premiumRateNote = "";
    if (caSplits && flat.length > 0) {
      const withShare = reduceFractionBig(BigInt(rrHourly.num) * BigInt(nonOvertime) + BigInt(flatCents) * 60n * BigInt(rrHourly.den), BigInt(rrHourly.den) * BigInt(nonOvertime));
      if (!withShare) {
        blockers.push({ code: "invalid_input", ...who, message: `${first.workerName}, workweek starting ${week}: the week's regular rate is too large to compute exactly; check the rates and amounts entered.` });
        continue;
      }
      premiumRate = withShare;
      premiumRateNote = `, with the ${formatCents(flatCents)} flat-sum bonus spread over the ${formatDuration(nonOvertime)} not paid at a premium (${CA_FLAT_SUM_CITATION})`;
    }
    const californiaDaily = caSplits !== null && !federalGoverns;
    const weeklyMinutes = splits.reduce((sum, x) => sum + x.premiums.filter((p) => p.ruleCode === WEEKLY_OVERTIME).reduce((s2, p) => s2 + p.minutes, 0), 0);
    const straightEligible = splits.reduce((sum, x) => sum + x.regular, 0) + weeklyMinutes;

    // Overtime allocation follows the order of work; flag days where that order was assumed.
    const otDays = new Set(splits.filter((x) => premiumOf(x) > 0).map((x) => x.shift.date));
    for (const date of [...otDays].sort(cmp)) {
      const sameDay = byDay.get(date) ?? [];
      if (new Set(sameDay.map(lineKey)).size > 1 && sameDay.some((s) => s.startMinute === null)) {
        warnings.push({ code: "allocation_order_assumed", ...who, date, message: `${first.workerName} on ${date}: shifts paid or billed differently have no start time, so the order used to decide which one carries the overtime was assumed.` });
      }
    }

    // 7. allocate to assignments (and so to clients) at the rates in effect for each shift.
    const buckets = new Map<string, Bucket>();
    splits.forEach((split, index) => {
      const { shift, regular } = split;
      const premium = premiumOf(split);
      const k = lineKey(shift);
      const b = buckets.get(k) ?? { key: k, assignmentId: shift.assignmentId, clientId: shift.clientId, firstIndex: index, sample: shift, regular: 0, overtime: 0, regularEntries: [], overtimeEntries: [], overtimeParts: [], trueUps: [], holiday: [], billRate: { regular: { explains: [], typed: false }, overtime: { explains: [], typed: false } } };
      if (regular > 0) noteWorking(b.billRate.regular, shift.billRateExplain);
      if (premium > 0) noteWorking(b.billRate.overtime, shift.billRateExplain);
      b.regular += regular;
      b.overtime += premium;
      if (regular > 0) b.regularEntries.push(...shift.entryIds);
      if (premium > 0) b.overtimeEntries.push(...shift.entryIds);
      for (const p of split.premiums) {
        const { base, floorApplies } = premiumBase(regularRate, floorOf.get(shift)!);
        const partKey = `${p.ruleCode}|${p.type}|${base.num}/${base.den}`;
        const part =
          b.overtimeParts.find((x) => x.key === partKey) ??
          b.overtimeParts[b.overtimeParts.push({ key: partKey, ruleCode: p.ruleCode, type: p.type, multiplier: p.multiplier, citation: p.citation, thresholdMinutes: p.thresholdMinutes, base, floorApplies, minutes: 0, entries: [], dates: [] }) - 1]!;
        part.minutes += p.minutes;
        part.entries.push(...shift.entryIds);
        if (!part.dates.includes(shift.date)) part.dates.push(shift.date);
      }
      const floor = floorOf.get(shift)!;
      if (shift.payRateCents < floor && shift.minutes > 0) {
        const t = b.trueUps.find((x) => x.floor === floor) ?? b.trueUps[b.trueUps.push({ floor, minutes: 0, entries: [], dates: [], citations: [] }) - 1]!;
        t.minutes += shift.minutes;
        t.entries.push(...shift.entryIds);
        if (!t.dates.includes(shift.date)) t.dates.push(shift.date);
        for (const c of floorCitations.get(shift) ?? []) if (!t.citations.includes(c)) t.citations.push(c);
      }
      const policy = holidayOf.get(shift);
      if (policy) {
        const rateCents = effective(shift);
        const h = b.holiday.find((x) => x.policy === policy && x.rateCents === rateCents) ?? b.holiday[b.holiday.push({ key: `${policy.name}|${rateCents}`, policy, rateCents, minutes: 0, entries: [], dates: [] }) - 1]!;
        h.minutes += shift.minutes;
        h.entries.push(...shift.entryIds);
        if (!h.dates.includes(shift.date)) h.dates.push(shift.date);
      }
      buckets.set(k, b);
    });

    const weekPay: Line[] = [];
    const weekBill: Line[] = [];
    const listDates = listAnd;
    // What the regular rate is made of, for the explain strings.
    const straightEarned = reduce({ num: worked.reduce((sum, w) => sum + mul(w.minutes, w.payRateCents), 0), den: 60 });
    const smallHolidayTotal = smallHolidayPremiums.reduce((sum, f) => addWorth(sum, { num: BigInt(f.num), den: BigInt(f.den) }), { num: 0n, den: 1n });
    const inRate = [
      ...nondiscretionary.map((b) => `${formatCents(b.amountCents)} nondiscretionary bonus`),
      ...(flatInRate ? flat.map((b) => `${formatCents(b.amountCents)} flat-sum bonus`) : []),
      ...(smallHolidayPremiums.length > 0 ? [`${formatMoney(reduceFractionBig(smallHolidayTotal.num, smallHolidayTotal.den)!)} holiday premium below 1.5×`] : []),
    ];
    const inRateCitations = [...(nondiscretionary.length > 0 || flatInRate ? [BONUS_CITATION] : []), ...(smallHolidayPremiums.length > 0 ? ["29 C.F.R. § 778.203"] : [])];
    for (const b of [...buckets.values()].sort((x, y) => x.firstIndex - y.firstIndex)) {
      const base = { workerId: first.workerId, assignmentId: b.assignmentId, clientId: b.clientId, workweekStart: week };
      const payRate: Fraction = { num: b.sample.payRateCents, den: 1 };
      const billRate: Fraction = { num: b.sample.billRateCents, den: 1 };

      // 3. straight pay
      if (b.regular > 0) {
        const pay = arithmetic("Regular", b.regular, payRate, "");
        const scope = californiaDaily
          ? `hours not paid at a daily, seventh-day or weekly premium in the workweek starting ${week}`
          : `hours up to the ${formatDuration(weekly.thresholdMinutes)} weekly threshold in the workweek starting ${week}`;
        weekPay.push({ ...base, type: "REG", minutes: b.regular, rate: payRate, amountCents: pay.amountCents, ruleId: "straight_time", explain: `${pay.text} Rule straight_time: ${scope}.`, entryIds: uniqueSorted(b.regularEntries) });
        const bill = arithmetic("Billed regular", b.regular, billRate, "");
        weekBill.push({ ...base, type: "REG", minutes: b.regular, rate: billRate, amountCents: bill.amountCents, ruleId: "bill_regular", explain: `${bill.text} Bill rate from the rate card${billRateNote(b.billRate.regular)}.`, entryIds: uniqueSorted(b.regularEntries) });
      }

      // 5. overtime and double time: straight time + the premium on the regular rate, by rule; then billing
      if (b.overtime > 0) {
        const elsewhere = splits.filter((x) => x.shift.assignmentId !== b.assignmentId).reduce((sum, x) => sum + x.regular, 0);
        const elsewhereNote = elsewhere > 0 ? ` ${formatDuration(elsewhere)} of the first ${formatDuration(weekly.thresholdMinutes)} were worked on other assignments.` : "";
        const straight = formatRate(payRate).replace("/h", "");
        const rrText = formatRate(regularRate);
        const earned = inRate.length === 0 ? `${formatMoney(straightEarned)} earned at straight time` : `(${formatMoney(straightEarned)} earned at straight time + ${inRate.join(" + ")})`;
        const flatNote = flatOvertime ? ` The flat-sum bonus is not in this rate: its overtime is paid on its own line (${CA_FLAT_SUM_CITATION}).` : "";
        const rrWhy = ` Regular rate: ${earned} ÷ ${formatDuration(totalMinutes)} worked = ${rrText}, used unrounded (${[REGULAR_RATE_CITATION, ...(california ? [CA_REGULAR_RATE_CITATION] : []), ...inRateCitations].join("; ")}).${flatNote}`;
        const whyFor = (part: Bucket["overtimeParts"][number]) => {
          const on = listDates(part.dates);
          switch (part.ruleCode) {
            case WEEKLY_OVERTIME:
              return californiaDaily
                ? `Rule ${WEEKLY_OVERTIME}: ${formatDuration(straightEligible)} worked in the workweek starting ${week} not already paid at a daily or seventh-day premium is ${formatDuration(weeklyMinutes)} over the ${formatDuration(weekly.thresholdMinutes)} threshold (${citations}; DLSE Opinion Letter 2000.01.19).${elsewhereNote}`
                : `Rule ${WEEKLY_OVERTIME}: ${formatDuration(totalMinutes)} worked in the workweek starting ${week} is ${formatDuration(weeklyMinutes)} over the ${formatDuration(weekly.thresholdMinutes)} threshold (${citations}).${elsewhereNote}${federalGoverns ? " The weekly rule pays more this week than California's daily and seventh-day rules (both apply, so the larger is paid; 29 U.S.C. § 218(a))." : ""}`;
            case CA_DAILY_OVERTIME:
            case CA_DAILY_DOUBLE_TIME:
              return `Rule ${part.ruleCode}: hours over ${formatDuration(part.thresholdMinutes)} in a workday, on ${on} (${part.citation}).`;
            case CA_SEVENTH_DAY:
              return `Rule ${CA_SEVENTH_DAY}: ${on} is the seventh day of work in the workweek starting ${week} (all seven days were worked) (${part.citation}).`;
            default:
              return `Rule ${part.ruleCode}: hours over ${formatDuration(part.thresholdMinutes)} on ${on}, the seventh day of work in the workweek starting ${week} (${part.citation}).`;
          }
        };
        const ordered = [...b.overtimeParts.filter((p) => p.type === "OT"), ...b.overtimeParts.filter((p) => p.type === "DT")];
        for (const part of ordered) {
          const m = part.multiplier;
          const premium = formatMultiplier({ num: m.num - m.den, den: m.den });
          const otRate = overtimeRate(b.sample.payRateCents, part.base, m);
          const note =
            singleRate && !part.floorApplies
              ? ` (${formatMultiplier(m)} × ${straight})`
              : part.floorApplies
                ? ` (${straight} + ${premium} × ${formatRate(part.base)}, because the minimum wage that day, ${formatRate(part.base)}, is higher than the regular rate ${rrText}; ${RATE_FLOOR_CITATION})`
                : ` (${straight} + ${premium} × regular rate ${rrText})`;
          const pay = arithmetic(part.type === "DT" ? "Double time" : "Overtime", part.minutes, otRate, note);
          weekPay.push({ ...base, type: part.type, minutes: part.minutes, rate: otRate, amountCents: pay.amountCents, ruleId: part.ruleCode, explain: `${pay.text} ${whyFor(part)}${singleRate ? "" : rrWhy}`, entryIds: uniqueSorted(part.entries) });
        }

        // Billing mirrors the pay lines by rule (a minimum-wage base never splits a bill line).
        const billParts = new Map<string, { type: "OT" | "DT"; ruleCode: string; minutes: number; entries: string[] }>();
        for (const part of ordered) {
          const k2 = `${part.ruleCode}|${part.type}`;
          const bp = billParts.get(k2) ?? { type: part.type, ruleCode: part.ruleCode, minutes: 0, entries: [] };
          bp.minutes += part.minutes;
          bp.entries.push(...part.entries);
          billParts.set(k2, bp);
        }
        const rule = b.sample.otBillingRule;
        for (const bp of billParts.values()) {
          const what = bp.type === "DT" ? "double time" : "overtime";
          const note = bp.ruleCode === WEEKLY_OVERTIME ? elsewhereNote : "";
          // In California a line can carry several rules' hours: the bill line says whose it mirrors.
          const forRule = caSplits !== null ? ` (${bp.ruleCode} hours)` : "";
          if (rule === "multiplier") {
            const m = bp.type === "DT" ? b.sample.billDtMultiplier : b.sample.billOtMultiplier;
            const rate = reduce({ num: mul(b.sample.billRateCents, m.num), den: m.den });
            const bill = arithmetic(`${bp.type === "DT" ? "Billed double time" : "Billed overtime"}${forRule}`, bp.minutes, rate, ` (${formatMultiplier(m)} × ${formatRate(billRate).replace("/h", "")} bill rate)`);
            weekBill.push({ ...base, type: bp.type, minutes: bp.minutes, rate, amountCents: bill.amountCents, ruleId: "bill_overtime_multiplier", explain: `${bill.text} Client bills ${what} at the rate-card ${what} multiplier; bill rate from the rate card${billRateNote(b.billRate.overtime)}.${note}`, entryIds: uniqueSorted(bp.entries) });
          } else if (rule === "straight_time") {
            const bill = arithmetic(`Billed ${what} at straight time${forRule}`, bp.minutes, billRate, "");
            weekBill.push({ ...base, type: bp.type, minutes: bp.minutes, rate: billRate, amountCents: bill.amountCents, ruleId: "bill_overtime_straight", explain: `${bill.text} Client bills ${what} at straight time; bill rate from the rate card${billRateNote(b.billRate.overtime)}.${note}`, entryIds: uniqueSorted(bp.entries) });
          } else {
            weekBill.push({ ...base, type: bp.type, minutes: bp.minutes, rate: { num: 0, den: 1 }, amountCents: 0, ruleId: "bill_overtime_not_billable", explain: `${bp.type === "DT" ? "Double time" : "Overtime"} not billed${forRule}: ${formatDuration(bp.minutes)} (${bp.minutes} min) → ${formatCents(0)}. Client profile marks overtime not billable.${note}`, entryIds: uniqueSorted(bp.entries) });
          }
        }
      }
      // 2 (paid). minimum-wage top-up for every minute paid below that day's minimum
      for (const t of b.trueUps) {
        const rate: Fraction = { num: t.floor - b.sample.payRateCents, den: 1 };
        const pay = arithmetic("Minimum-wage top-up", t.minutes, rate, ` (${formatRate({ num: t.floor, den: 1 }).replace("/h", "")} minimum wage − ${formatRate(payRate).replace("/h", "")} pay rate)`);
        // Less than half a cent rounds to nothing: no line (the warning still asks for the rate card to be fixed).
        if (pay.amountCents === 0) continue;
        const why = `Rule ${MINIMUM_WAGE}: the pay rate is below the minimum wage on ${t.dates.join(", ")} (${t.citations.join("; ")}), so the difference is paid for every hour worked.`;
        weekPay.push({ ...base, type: "MW_TRUEUP", minutes: t.minutes, rate, amountCents: pay.amountCents, ruleId: MINIMUM_WAGE, explain: `${pay.text} ${why}`, entryIds: uniqueSorted(t.entries) });
      }
      // 6. holiday premium on hours worked on a holiday: paid on top of straight time and any overtime.
      for (const h of b.holiday) {
        const k = h.policy.workedMultiplier;
        const raised = h.rateCents > b.sample.payRateCents ? ", the minimum wage that day" : "";
        if (k.num > k.den) {
          const extra = { num: k.num - k.den, den: k.den };
          const rate = reduce({ num: mul(h.rateCents, extra.num), den: extra.den });
          const pay = arithmetic("Holiday premium", h.minutes, rate, ` (${formatMultiplier(extra)} × ${formatMoney({ num: h.rateCents, den: 1 })}${raised})`);
          const counts = premiumCountsInRegularRate(k)
            ? "A holiday premium below 1.5× is counted in the regular rate"
            : "A holiday premium of 1.5× or more is not counted in the regular rate";
          const why = `Rule ${HOLIDAY_WORKED}: ${listDates(h.dates)} ${h.dates.length > 1 ? "are holidays" : "is a holiday"} under the holiday policy "${h.policy.name}", which pays ${formatMultiplier(k)} × the pay rate for hours worked; straight time is on the regular and overtime lines, and this premium is paid on top of any overtime, never credited toward it. ${counts} (${HOLIDAY_CITATION}).`;
          if (pay.amountCents > 0) weekPay.push({ ...base, type: "HOL", minutes: h.minutes, rate, amountCents: pay.amountCents, ruleId: HOLIDAY_WORKED, explain: `${pay.text} ${why}`, entryIds: uniqueSorted(h.entries) });
        }
        const bm = h.policy.billWorkedMultiplier;
        if (bm && bm.num > bm.den) {
          const extra = { num: bm.num - bm.den, den: bm.den };
          const rate = reduce({ num: mul(b.sample.billRateCents, extra.num), den: extra.den });
          const bill = arithmetic("Billed holiday premium", h.minutes, rate, ` (${formatMultiplier(extra)} × ${formatRate(billRate).replace("/h", "")} bill rate)`);
          if (bill.amountCents > 0) weekBill.push({ ...base, type: "HOL", minutes: h.minutes, rate, amountCents: bill.amountCents, ruleId: "bill_holiday_premium", explain: `${bill.text} Client billed ${formatMultiplier(bm)} × the bill rate for hours worked on a holiday under the holiday policy "${h.policy.name}"; straight time is on the regular and overtime bill lines.`, entryIds: uniqueSorted(h.entries) });
        }
      }
    }

    // 6. confirmed premiums: an hour at the week's regular rate per confirmed missed period, capped per workday.
    const premiums = new Map<string, { assignmentId: string; clientId: string; kind: ConfirmationKind; rule: PremiumRule; minutes: number; dates: string[]; entries: string[] }>();
    const perDay = new Map<string, number>();
    const notApplicable = new Set<string>();
    for (const c of confirmed.filter((x) => x.kind === "meal_period_missed" || x.kind === "rest_period_missed")) {
      const day = shifts.filter((s) => s.assignmentId === c.assignmentId && s.date === c.date);
      const what = PREMIUM_OF[c.kind]!;
      const rule = premiumRuleFor(rules.premiumRules, day[0]!.jurisdiction, what.ruleCode, c.date);
      if (!rule) {
        const k = `${day[0]!.jurisdiction}|${c.kind}`;
        if (!notApplicable.has(k)) {
          notApplicable.add(k);
          weekWarnings.push({ code: "premium_not_applicable", ...who, jurisdiction: day[0]!.jurisdiction, date: c.date, message: `${first.workerName} on ${c.date}: ${what.what}, but no ${what.label.toLowerCase()} applies in ${day[0]!.jurisdiction}, so nothing is paid for it.` });
        }
        continue;
      }
      const dayKey = `${c.date}|${rule.ruleCode}`;
      if ((perDay.get(dayKey) ?? 0) >= rule.perWorkdayMax) continue;
      perDay.set(dayKey, (perDay.get(dayKey) ?? 0) + 1);
      const k = `${c.assignmentId}|${rule.ruleCode}`;
      const p = premiums.get(k) ?? { assignmentId: c.assignmentId, clientId: day[0]!.clientId, kind: c.kind, rule, minutes: 0, dates: [], entries: [] };
      p.minutes += rule.premiumMinutes;
      if (!p.dates.includes(c.date)) p.dates.push(c.date);
      for (const s of day) p.entries.push(...s.entryIds);
      premiums.set(k, p);
    }
    for (const p of premiums.values()) {
      const what = PREMIUM_OF[p.kind]!;
      const pay = arithmetic(what.label, p.minutes, premiumRate, ` (the week's regular rate${premiumRateNote})`);
      const why = `Rule ${p.rule.ruleCode}: ${what.what} on ${p.dates.join(", ")}, as a person confirmed; one hour of pay at the regular rate, not hours worked, at most ${p.rule.perWorkdayMax} per workday (${p.rule.citation}).`;
      weekPay.push({ workerId: first.workerId, assignmentId: p.assignmentId, clientId: p.clientId, workweekStart: week, type: what.type, minutes: p.minutes, rate: premiumRate, amountCents: pay.amountCents, ruleId: p.rule.ruleCode, explain: `${pay.text} ${why}`, entryIds: uniqueSorted(p.entries) });
    }

    // 6. minimum pay for a confirmed short day: California reporting time, Massachusetts reporting pay,
    // the Illinois day-labor minimum. Not hours worked; never counted toward overtime.
    const shortDays = new Set<string>();
    for (const c of confirmed.filter((x) => x.kind === "reported_short")) {
      if (shortDays.has(`${c.assignmentId}|${c.date}`)) continue;
      shortDays.add(`${c.assignmentId}|${c.date}`);
      const day = shifts.filter((s) => s.assignmentId === c.assignmentId && s.date === c.date);
      const sample = day[0]!;
      const atAssignment = day.reduce((sum, s) => sum + s.minutes, 0);
      const atClient = shifts.filter((s) => s.clientId === sample.clientId && s.date === c.date).reduce((sum, s) => sum + s.minutes, 0);
      const allDay = shifts.filter((s) => s.date === c.date).reduce((sum, s) => sum + s.minutes, 0);
      const rule = guaranteeRuleFor(rules.guaranteeRules, sample.jurisdiction, c.date);
      const notHere = (why: string) => {
        weekWarnings.push({ code: "premium_not_applicable", ...who, jurisdiction: sample.jurisdiction, date: c.date, message: `${first.workerName} on ${c.date}: a short day was confirmed, but ${why}, so nothing more is paid for it.` });
      };
      if (!rule) {
        notHere(`no reporting or minimum-pay rule applies in ${sample.jurisdiction}`);
        continue;
      }
      if (rule.ruleCode === IL_DAY_LABOR_MINIMUM && sample.dayAndTemporaryLabor === false) {
        notHere("the Illinois day-labor minimum does not cover clerical or professional work (820 ILCS 175/5)");
        continue;
      }
      const needsSchedule = rule.ruleCode === CA_REPORTING_TIME || rule.ruleCode === MA_REPORTING_PAY;
      if (needsSchedule && !c.scheduledMinutes) {
        blockers.push({ code: "invalid_input", ...who, date: c.date, message: `${first.workerName} on ${c.date}: a short day was confirmed, but ${sample.jurisdiction} reporting pay depends on the scheduled hours, which are missing; add them to the confirmation.` });
        weekPay.length = 0;
        break;
      }
      let shortfall: number;
      let story: string;
      if (rule.ruleCode === CA_REPORTING_TIME) {
        const r = caReportingTime(rule, c.scheduledMinutes!, atAssignment);
        shortfall = r.shortfall;
        story = `on ${c.date} the worker reported but was given less than half the scheduled day; half the scheduled ${formatDuration(c.scheduledMinutes!)} is ${formatDuration(r.halfMinutes)} (at least ${formatDuration(rule.minMinutes ?? 0)}, at most ${formatDuration(rule.maxMinutes ?? r.halfMinutes)}); ${formatDuration(atAssignment)} were worked, so ${formatDuration(shortfall)} more are paid`;
      } else if (rule.ruleCode === MA_REPORTING_PAY) {
        const r = maReportingPay(rule, c.scheduledMinutes!, atAssignment);
        shortfall = r.shortfall;
        story = `on ${c.date} the worker, scheduled for ${formatDuration(c.scheduledMinutes!)}, reported and was not given the expected hours; at least ${formatDuration(r.dueMinutes)} are owed for the day; ${formatDuration(atAssignment)} were worked, so ${formatDuration(shortfall)} more are paid`;
      } else if (rule.ruleCode === IL_DAY_LABOR_MINIMUM) {
        const r = ilDayLaborMinimum(rule, c.reassigned === true, atClient, allDay);
        shortfall = r.shortfall;
        story = c.reassigned
          ? `on ${c.date} the worker was sent to the client, not used, and placed elsewhere the same shift, so the shift is paid at least ${formatDuration(r.dueMinutes)}; ${formatDuration(allDay)} were worked, so ${formatDuration(shortfall)} more are paid at the agreed rate`
          : `on ${c.date} the worker was sent to the client and not used for ${formatDuration(r.dueMinutes)}; ${formatDuration(atClient)} were worked there, so ${formatDuration(shortfall)} more are paid at the agreed rate`;
      } else {
        notHere(`rule ${rule.ruleCode} is not one this version computes`);
        continue;
      }
      if (shortfall <= 0) continue;
      const rate: Fraction = rule.basis === "regular_rate" ? premiumBase(premiumRate, floorOf.get(sample)!).base : { num: effective(sample), den: 1 };
      const type: EarningType = rule.ruleCode === IL_DAY_LABOR_MINIMUM ? "MIN_GUARANTEE" : "REPORTING_PAY";
      const label = type === "MIN_GUARANTEE" ? "Day-labor minimum" : "Reporting-time pay";
      const basisNote = rule.basis === "regular_rate" ? ` (the week's regular rate${premiumRateNote})` : sample.payRateCents < effective(sample) ? " (the minimum wage that day)" : " (the agreed pay rate)";
      const pay = arithmetic(label, shortfall, rate, basisNote);
      weekPay.push({ workerId: first.workerId, assignmentId: c.assignmentId, clientId: sample.clientId, workweekStart: week, type, minutes: shortfall, rate, amountCents: pay.amountCents, ruleId: rule.ruleCode, explain: `${pay.text} Rule ${rule.ruleCode}: ${story}, not as hours worked (${rule.citation}).`, entryIds: uniqueSorted(day.flatMap((s) => s.entryIds)) });
    }
    if (blockers.some((b) => b.workerId === first.workerId && b.workweekStart === week)) continue;

    // 6. pay for a holiday not worked, confirmed by a person: pay, not hours worked.
    for (const { c, sample, policy } of holidaysNotWorked) {
      const rate: Fraction = { num: effective(sample), den: 1 };
      const minutes = policy.notWorkedMinutes;
      const pay = arithmetic("Holiday pay (not worked)", minutes, rate, sample.payRateCents < effective(sample) ? " (the minimum wage that day)" : " (the agreed pay rate)");
      const why = `Rule ${HOLIDAY_NOT_WORKED}: ${c.date} is a holiday under the holiday policy "${policy.name}", the worker did not work that day, and a person confirmed the worker is eligible; it is pay, not hours worked, so it counts toward neither overtime nor the regular rate (${HOLIDAY_CITATION}).`;
      const line = { workerId: first.workerId, assignmentId: c.assignmentId, clientId: sample.clientId, workweekStart: week, type: "HOL_NOT_WORKED" as const, minutes, entryIds: [] };
      weekPay.push({ ...line, rate, amountCents: pay.amountCents, ruleId: HOLIDAY_NOT_WORKED, explain: `${pay.text} ${why}` });
      if (policy.billNotWorked) {
        const billRate: Fraction = { num: sample.billRateCents, den: 1 };
        const bill = arithmetic("Billed holiday not worked", minutes, billRate, "");
        weekBill.push({ ...line, rate: billRate, amountCents: bill.amountCents, ruleId: "bill_holiday_not_worked", explain: `${bill.text} Client billed for a holiday not worked under the holiday policy "${policy.name}", at the bill rate from the rate card.` });
      }
    }

    // 6. bonuses: the amount as entered; its effect on overtime is already in the regular rate, or —
    // a California flat-sum bonus — on its own overtime line.
    const hasPremiums = splits.some((x) => x.premiums.length > 0);
    for (const bonus of [...weekBonuses].sort((x, y) => cmp(x.id, y.id))) {
      const on = shifts.filter((s) => s.assignmentId === bonus.assignmentId && s.minutes > 0);
      const how =
        bonus.kind === "nondiscretionary"
          ? `nondiscretionary (promised for the work, not decided at the agency's sole discretion), so it is part of the week's pay and counted in the regular rate${hasPremiums ? ", on which this week's overtime is paid" : ""} (${BONUS_CITATION})`
          : flatOvertime
            ? `a flat-sum bonus; in California its overtime is paid on its own line, on the bonus divided by the hours not paid at a premium (${CA_FLAT_SUM_CITATION})`
            : caSplits
              ? `a flat-sum bonus, counted in the regular rate this week because the federal weekly rule pays more than California's rules (29 U.S.C. § 218(a); ${BONUS_CITATION})`
              : `a flat-sum bonus; outside California it counts like any nondiscretionary bonus, in the regular rate${hasPremiums ? ", on which this week's overtime is paid" : ""} (${BONUS_CITATION})`;
      weekPay.push({
        workerId: first.workerId,
        assignmentId: bonus.assignmentId,
        clientId: on[0]!.clientId,
        workweekStart: week,
        type: "BONUS",
        minutes: 0,
        rate: { num: 0, den: 1 },
        amountCents: bonus.amountCents,
        ruleId: flatOvertime && bonus.kind === "flat_sum" ? CA_FLAT_SUM_BONUS : BONUS,
        explain: `Bonus: ${formatCents(bonus.amountCents)} for the workweek starting ${week}, as a person entered and classified it; a lump sum, not hours. Rule ${flatOvertime && bonus.kind === "flat_sum" ? CA_FLAT_SUM_BONUS : BONUS}: ${how}.`,
        entryIds: uniqueSorted(on.flatMap((s) => s.entryIds)),
      });
    }
    if (flatOvertime) {
      const byMultiple = new Map<string, { multiplier: Fraction; minutes: number }>();
      const entries: string[] = [];
      for (const x of splits) {
        for (const p of x.premiums) {
          const g = byMultiple.get(`${p.multiplier.num}/${p.multiplier.den}`) ?? { multiplier: p.multiplier, minutes: 0 };
          g.minutes += p.minutes;
          byMultiple.set(`${p.multiplier.num}/${p.multiplier.den}`, g);
          entries.push(...x.shift.entryIds);
        }
      }
      const parts = [...byMultiple.values()].sort((a, b) => mul(a.multiplier.num, b.multiplier.den) - mul(b.multiplier.num, a.multiplier.den));
      const premiumMinutes = parts.reduce((sum, g) => sum + g.minutes, 0);
      for (const bonus of premiumMinutes > 0 ? [...flat].sort((x, y) => cmp(x.id, y.id)) : []) {
        const worth = alvaradoWorth(parts, bonus.amountCents, nonOvertime);
        const rate = reduceFractionBig(worth.num * 60n, worth.den * BigInt(premiumMinutes));
        if (!rate) {
          blockers.push({ code: "invalid_input", ...who, message: `${first.workerName}, workweek starting ${week}: the overtime on the flat-sum bonus is too large to compute exactly; check the amount entered.` });
          weekPay.length = 0;
          break;
        }
        const share = reduce({ num: mul(bonus.amountCents, 60), den: nonOvertime });
        const { amountCents, exact, wasExact } = lineAmount(premiumMinutes, rate);
        if (amountCents === 0) continue;
        const terms = parts.map((g) => `${formatDuration(g.minutes)} × ${formatMultiplier(g.multiplier)} × ${formatMoney(share)}`).join(" + ");
        const text = `Flat-sum bonus overtime: ${formatCents(bonus.amountCents)} ÷ ${formatDuration(nonOvertime)} not paid at a premium = ${formatRate(share)}; ${terms} = ${exact}¢ ${wasExact ? "exactly →" : "→ rounded half-up once →"} ${formatCents(amountCents)}.`;
        const why = `Rule ${CA_FLAT_SUM_BONUS}: in California, overtime on a flat-sum bonus is paid at the full overtime or double-time multiple of the bonus's hourly share, because the bonus was earned by the hours not paid at a premium alone (${CA_FLAT_SUM_CITATION}).`;
        const on = shifts.find((s) => s.assignmentId === bonus.assignmentId && s.minutes > 0)!;
        weekPay.push({ workerId: first.workerId, assignmentId: bonus.assignmentId, clientId: on.clientId, workweekStart: week, type: "BONUS_OT", minutes: premiumMinutes, rate, amountCents, ruleId: CA_FLAT_SUM_BONUS, explain: `${text} ${why}`, entryIds: uniqueSorted(entries) });
      }
      if (blockers.some((b) => b.workerId === first.workerId && b.workweekStart === week)) continue;
    }

    const zero = weekPay.filter((l) => l.minutes > 0 && l.amountCents <= 0);
    if (zero.length > 0) {
      blockers.push(...zero.map((l) => ({ code: "zero_or_negative_pay" as const, ...who, entryIds: l.entryIds, message: `${first.workerName}: pay line ${l.type} for the workweek starting ${week} computes to ${formatCents(l.amountCents)}.` })));
      continue;
    }
    payLines.push(...weekPay);
    billLines.push(...weekBill);
    warnings.push(...weekWarnings);
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
