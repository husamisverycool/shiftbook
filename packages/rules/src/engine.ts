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
import { isLocal, placeProblem, scopeMatches } from "./places";
import { canonicalRules, ruleDataProblems } from "./rule-data";
import { hasLocalRate, MINIMUM_WAGE, selectMinimumWage } from "./rules/minimum-wage";
import { selectWeeklyRule, splitAtThreshold, WEEKLY_OVERTIME } from "./rules/weekly-overtime";
import type { EarningType, Fraction, Issue, JurisdictionRule, Line, PayInput, PayResult, Shift } from "./types";

export const RULES_VERSION = "2026.10-a5";

/** Rule codes this engine version implements. Any other applicable rule code blocks the run. */
export const IMPLEMENTED_RULE_CODES = new Set([WEEKLY_OVERTIME, MINIMUM_WAGE]);
/** Federal rules that must always be present; without them nothing is computed. */
const REQUIRED_FEDERAL_RULES = [WEEKLY_OVERTIME, MINIMUM_WAGE];

const TYPE_ORDER: EarningType[] = ["REG", "OT", "DT", "HOL", "DIFF", "MEAL_PREMIUM", "REST_PREMIUM", "MIN_GUARANTEE"];
const MINUTES_PER_DAY = 1440;
/** Bounds that keep every product inside safe integers: $100,000/h, factors up to 1000. */
const MAX_RATE_CENTS = 10_000_000;
const MAX_FACTOR = 1000;
const BILLING_RULES = new Set(["multiplier", "straight_time", "not_billable"]);

/** Plain code-unit comparison: deterministic on every machine, unlike locale collation. */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const uniqueSorted = (ids: string[]) => [...new Set(ids)].sort(cmp);

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
    cmp(JSON.stringify([a.minutes, a.payRateCents, a.billRateCents, a.billOtMultiplier, a.otBillingRule, a.jurisdiction, a.countyFips, a.placeFips]), JSON.stringify([b.minutes, b.payRateCents, b.billRateCents, b.billOtMultiplier, b.otBillingRule, b.jurisdiction, b.countyFips, b.placeFips]))
  );
}

function validShift(s: Shift): string | null {
  if (!hasEntryIds(s)) return "the shift has no time entry id, so it cannot be traced to a timesheet";
  if (new Set(s.entryIds).size !== s.entryIds.length) return "the same time entry is listed twice in this shift";
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
  const m = s.billOtMultiplier as Partial<Fraction> | undefined;
  if (!m || !Number.isSafeInteger(m.num) || !Number.isSafeInteger(m.den) || m.num! <= 0 || m.den! <= 0 || m.num! > MAX_FACTOR || m.den! > MAX_FACTOR) {
    return "the overtime bill multiplier must be a positive whole-number fraction";
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
const lineKey = (s: Shift) => [s.assignmentId, s.clientId, s.payRateCents, s.billRateCents, s.billRateExplain ?? "", s.billOtMultiplier.num, s.billOtMultiplier.den, s.otBillingRule].join("|");

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
      const k = `${s.payRateCents}|${floor.rateCents}`;
      if (s.payRateCents < floor.rateCents && !seen.has(k)) {
        seen.add(k);
        weekBlockers.push({ code: "below_minimum_wage", ...who, jurisdiction: s.jurisdiction, ruleCode: MINIMUM_WAGE, date: s.date, entryIds: s.entryIds, message: `${first.workerName} on ${s.date}: pay rate ${formatRate({ num: s.payRateCents, den: 1 })} is below the minimum wage of ${formatRate({ num: floor.rateCents, den: 1 })} (${floor.citations.join("; ")}).` });
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

    const threshold = weekly.thresholdMinutes;
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
    const citations = weekly.citations.join("; ");
    for (const b of [...buckets.values()].sort((x, y) => x.firstIndex - y.firstIndex)) {
      const base = { workerId: first.workerId, assignmentId: b.assignmentId, clientId: b.clientId, workweekStart: week };
      const payRate: Fraction = { num: b.sample.payRateCents, den: 1 };
      const billRate: Fraction = { num: b.sample.billRateCents, den: 1 };

      // 3. straight pay
      if (b.regular > 0) {
        const pay = arithmetic("Regular", b.regular, payRate, "");
        const scope = `hours up to the ${formatDuration(weekly.thresholdMinutes)} weekly threshold in the workweek starting ${week}`;
        weekPay.push({ ...base, type: "REG", minutes: b.regular, rate: payRate, amountCents: pay.amountCents, ruleId: "straight_time", explain: `${pay.text} Rule straight_time: ${scope}.`, entryIds: uniqueSorted(b.regularEntries) });
        const bill = arithmetic("Billed regular", b.regular, billRate, "");
        weekBill.push({ ...base, type: "REG", minutes: b.regular, rate: billRate, amountCents: bill.amountCents, ruleId: "bill_regular", explain: `${bill.text} Bill rate from the rate card${b.sample.billRateExplain ? ` (${b.sample.billRateExplain})` : ""}.`, entryIds: uniqueSorted(b.regularEntries) });
      }

      // 5. overtime pay and its billing
      if (b.overtime > 0) {
        const elsewhere = splits.filter((x) => x.shift.assignmentId !== b.assignmentId).reduce((sum, x) => sum + x.regular, 0);
        const elsewhereNote = elsewhere > 0 ? ` ${formatDuration(elsewhere)} of the first ${formatDuration(weekly.thresholdMinutes)} were worked on other assignments.` : "";
        const otRate = reduce({ num: mul(b.sample.payRateCents, weekly.multiplier.num), den: weekly.multiplier.den });
        const note = ` (${formatMultiplier(weekly.multiplier)} × ${formatRate(payRate).replace("/h", "")})`;
        const pay = arithmetic("Overtime", b.overtime, otRate, note);
        const why = `Rule ${WEEKLY_OVERTIME}: ${formatDuration(totalMinutes)} worked in the workweek starting ${week} is ${formatDuration(overtimeMinutes)} over the ${formatDuration(weekly.thresholdMinutes)} threshold (${citations}).${elsewhereNote}`;
        weekPay.push({ ...base, type: "OT", minutes: b.overtime, rate: otRate, amountCents: pay.amountCents, ruleId: WEEKLY_OVERTIME, explain: `${pay.text} ${why}`, entryIds: uniqueSorted(b.overtimeEntries) });

        const rule = b.sample.otBillingRule;
        if (rule === "multiplier") {
          const m = b.sample.billOtMultiplier;
          const rate = reduce({ num: mul(b.sample.billRateCents, m.num), den: m.den });
          const bill = arithmetic("Billed overtime", b.overtime, rate, ` (${formatMultiplier(m)} × ${formatRate(billRate).replace("/h", "")} bill rate)`);
          weekBill.push({ ...base, type: "OT", minutes: b.overtime, rate, amountCents: bill.amountCents, ruleId: "bill_overtime_multiplier", explain: `${bill.text} Client bills overtime at the rate-card overtime multiplier.${elsewhereNote}`, entryIds: uniqueSorted(b.overtimeEntries) });
        } else if (rule === "straight_time") {
          const bill = arithmetic("Billed overtime at straight time", b.overtime, billRate, "");
          weekBill.push({ ...base, type: "OT", minutes: b.overtime, rate: billRate, amountCents: bill.amountCents, ruleId: "bill_overtime_straight", explain: `${bill.text} Client bills overtime at straight time.${elsewhereNote}`, entryIds: uniqueSorted(b.overtimeEntries) });
        } else {
          weekBill.push({ ...base, type: "OT", minutes: b.overtime, rate: { num: 0, den: 1 }, amountCents: 0, ruleId: "bill_overtime_not_billable", explain: `Overtime not billed: ${formatDuration(b.overtime)} (${b.overtime} min) → ${formatCents(0)}. Client profile marks overtime not billable.${elsewhereNote}`, entryIds: uniqueSorted(b.overtimeEntries) });
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
