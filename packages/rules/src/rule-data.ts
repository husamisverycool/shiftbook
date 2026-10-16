/**
 * Rule tables are put in one fixed order and checked before anything is computed, so the result
 * never depends on the order rows arrive in, and malformed or conflicting rows stop the run instead
 * of one of them silently winning.
 */
import { isIsoDate } from "./dates";
import { scopeProblem, STATE_FIPS } from "./places";
import { english, nested, part, type SayPart } from "./say";
import type { EqualPayRule, GuaranteeRule, HolidayPolicy, Issue, RegularRateRule, JurisdictionRule, MinimumWageRule, OvertimeRule, PayInput, PremiumRule } from "./types";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const OPEN_END = "9999-12-31";
const scopeKey = (r: { countyFips?: string | null; placeFips?: string | null }) => `${r.countyFips ?? ""}|${r.placeFips ?? ""}`;

export interface RuleTables {
  overtimeRules: OvertimeRule[];
  jurisdictionRules: JurisdictionRule[];
  minimumWageRules: MinimumWageRule[];
  premiumRules: PremiumRule[];
  guaranteeRules: GuaranteeRule[];
  /** Agency data, not law: which days are holidays and what the agency (or a client) pays for them. */
  holidayPolicies: HolidayPolicy[];
  equalPayRules: EqualPayRule[];
  regularRateRules: RegularRateRule[];
}

/** Copies of the rule tables in one fixed order. */
export function canonicalRules(input: PayInput): RuleTables {
  const key = (parts: (string | number | null | undefined)[]) => parts.map((p) => String(p ?? "")).join("\u0000");
  const by = <T>(rows: T[], f: (r: T) => string) => [...rows].sort((a, b) => cmp(f(a), f(b)));
  return {
    overtimeRules: by(input.overtimeRules, (r) =>
      key([r.jurisdiction, r.ruleCode, r.kind, r.effectiveFrom, r.effectiveTo ?? OPEN_END, r.thresholdMinutes, r.multiplier?.num, r.multiplier?.den, r.earningType, r.citation]),
    ),
    jurisdictionRules: by(input.jurisdictionRules, (r) => key([r.jurisdiction, scopeKey(r), r.ruleCode, r.effectiveFrom, r.effectiveTo ?? OPEN_END, r.citation, r.scopeName])),
    minimumWageRules: by(input.minimumWageRules, (r) => key([r.jurisdiction, scopeKey(r), r.effectiveFrom, r.effectiveTo ?? OPEN_END, r.rateCents, r.citation, r.scopeName])),
    premiumRules: by(input.premiumRules ?? [], (r) => key([r.jurisdiction, r.ruleCode, r.effectiveFrom, r.effectiveTo ?? OPEN_END, r.premiumMinutes, r.perWorkdayMax, r.citation])),
    guaranteeRules: by(input.guaranteeRules ?? [], (r) => key([r.jurisdiction, r.ruleCode, r.effectiveFrom, r.effectiveTo ?? OPEN_END, JSON.stringify(r), r.citation])),
    holidayPolicies: by(
      (input.holidayPolicies ?? []).map((p) => ({ ...p, dates: Array.isArray(p.dates) ? [...p.dates].sort(cmp) : p.dates })),
      (p) => key([p.clientId, p.name, JSON.stringify(p)]),
    ),
    equalPayRules: by(input.equalPayRules ?? [], (r) => key([r.jurisdiction, r.ruleCode, r.effectiveFrom, r.effectiveTo ?? OPEN_END, JSON.stringify(r)])),
    regularRateRules: by(input.regularRateRules ?? [], (r) => key([r.jurisdiction, r.ruleCode, r.effectiveFrom, r.effectiveTo ?? OPEN_END, JSON.stringify(r)])),
  };
}

const knownJurisdiction = (j: string) => j === "US" || Object.hasOwn(STATE_FIPS, j);
const positiveInt = (n: unknown) => Number.isSafeInteger(n) && (n as number) > 0;
/** Factors stay small so every product of rate × multiplier × minutes is a safe integer. */
const MAX_FACTOR = 1000;
const MAX_THRESHOLD_MINUTES = 10_080; // one week
/** No minimum wage is anywhere near $1,000 an hour: a larger row is a typo, not a rate to pay. */
const MAX_MINIMUM_WAGE_CENTS = 100_000;
const MINUTES_PER_DAY = 1440;

/** Why a row cannot be used, as message keys (decision 0030); false or null when it can. */
type Problem = SayPart | false | null;
const unknownJurisdiction = (j: string): Problem => !knownJurisdiction(j) && part("problemJurisdictionUnknown", { jurisdiction: String(j) });

function multiplierProblem(m: { num?: unknown; den?: unknown } | undefined): SayPart | null {
  if (!m || !positiveInt(m.num) || !positiveInt(m.den) || (m.num as number) > MAX_FACTOR || (m.den as number) > MAX_FACTOR) {
    return part("problemMultiplierFraction");
  }
  if ((m.num as number) < (m.den as number)) return part("problemMultiplierBelowOne");
  return null;
}

function datesProblem(r: { effectiveFrom: string; effectiveTo: string | null }): SayPart | null {
  if (!isIsoDate(r.effectiveFrom)) return part("problemEffectiveFrom", { value: String(r.effectiveFrom) });
  if (r.effectiveTo !== null && !isIsoDate(r.effectiveTo)) return part("problemEffectiveTo", { value: String(r.effectiveTo) });
  if (r.effectiveTo !== null && r.effectiveTo < r.effectiveFrom) return part("problemEndsBeforeStarts");
  return null;
}

const overlaps = (a: { effectiveFrom: string; effectiveTo: string | null }, b: { effectiveFrom: string; effectiveTo: string | null }) =>
  a.effectiveFrom <= (b.effectiveTo ?? OPEN_END) && b.effectiveFrom <= (a.effectiveTo ?? OPEN_END);

function overlapProblems<T extends { effectiveFrom: string; effectiveTo: string | null; citation: string }>(rows: T[], group: (r: T) => string, label: (r: T) => SayPart): Issue[] {
  const issues: Issue[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let k = i + 1; k < rows.length; k++) {
      const a = rows[i]!;
      const b = rows[k]!;
      if (group(a) === group(b) && overlaps(a, b)) {
        const problem = part("problemOverlap", { fromA: { date: a.effectiveFrom }, fromB: { date: b.effectiveFrom }, citationA: String(a.citation), citationB: String(b.citation) });
        issues.push(invalid(part("ruleDataWhere", { where: nested(label(a)), problem: nested(problem) })));
      }
    }
  }
  return issues;
}

const invalid = (problem: SayPart): Issue => {
  const say = [part("ruleDataProblem", { problem: nested(problem) })];
  return { code: "rule_data_invalid", message: english(say), say };
};
/** "<where>: <problem>" for a row. */
const at = (where: SayPart, problem: SayPart): Issue => invalid(part("ruleDataWhere", { where: nested(where), problem: nested(problem) }));
const rule = (key: "whereOvertimeRule" | "whereJurisdictionRule" | "wherePremiumRule" | "whereMinimumPayRule" | "whereRegularRateRule" | "whereEqualPayCounterRule", r: { jurisdiction: string; ruleCode: string }) =>
  part(key, { jurisdiction: String(r.jurisdiction), rule: String(r.ruleCode) });
/** The row's label with its local scope's name, when it has one. */
const scoped = (where: SayPart, scopeName: string | null | undefined): SayPart => (scopeName ? part("whereScoped", { where: nested(where), scope: scopeName }) : where);

/** Every problem with the rule tables; an empty list means they can be used. */
export function ruleDataProblems(t: RuleTables): Issue[] {
  const issues: Issue[] = [];
  for (const r of t.overtimeRules) {
    const problem =
      unknownJurisdiction(r.jurisdiction) ||
      datesProblem(r) ||
      ((!Number.isSafeInteger(r.thresholdMinutes) || r.thresholdMinutes < 0 || r.thresholdMinutes > MAX_THRESHOLD_MINUTES) && part("problemThreshold")) ||
      multiplierProblem(r.multiplier) ||
      (r.kind === "weekly" && r.earningType !== "OT" && part("problemWeeklyEarningType", { type: String(r.earningType) }));
    if (problem) issues.push(at(rule("whereOvertimeRule", r), problem));
  }
  for (const r of t.jurisdictionRules) {
    const problem = unknownJurisdiction(r.jurisdiction) || datesProblem(r) || scopeProblem(r.jurisdiction, r.countyFips, r.placeFips);
    if (problem) issues.push(at(rule("whereJurisdictionRule", r), problem));
  }
  for (const r of t.minimumWageRules) {
    const where = part("whereMinimumWageRate", { jurisdiction: String(r.jurisdiction) });
    const problem =
      unknownJurisdiction(r.jurisdiction) ||
      datesProblem(r) ||
      scopeProblem(r.jurisdiction, r.countyFips, r.placeFips) ||
      ((!positiveInt(r.rateCents) || r.rateCents > MAX_MINIMUM_WAGE_CENTS) && part("problemMinimumWageRate"));
    if (problem) issues.push(at(where, problem));
  }
  for (const r of t.premiumRules) {
    const problem =
      unknownJurisdiction(r.jurisdiction) ||
      datesProblem(r) ||
      ((!positiveInt(r.premiumMinutes) || r.premiumMinutes > MAX_THRESHOLD_MINUTES) && part("problemPremiumMinutes")) ||
      ((!positiveInt(r.perWorkdayMax) || r.perWorkdayMax > 24) && part("problemPerWorkdayMax"));
    if (problem) issues.push(at(rule("wherePremiumRule", r), problem));
  }
  for (const r of t.guaranteeRules) {
    const minutes = (n: number | null) => n === null || (Number.isSafeInteger(n) && n >= 0 && n <= MAX_THRESHOLD_MINUTES);
    const f = r.scheduledFraction;
    const problem =
      unknownJurisdiction(r.jurisdiction) ||
      datesProblem(r) ||
      (![r.dueMinutes, r.reassignedDueMinutes, r.minMinutes, r.maxMinutes, r.minScheduledMinutes].every(minutes) && part("problemGuaranteeMinutes")) ||
      (f !== null && (!positiveInt(f.num) || !positiveInt(f.den) || f.num > f.den) && part("problemScheduledFraction")) ||
      (r.minMinutes !== null && r.maxMinutes !== null && r.minMinutes > r.maxMinutes && part("problemLeastMoreThanMost")) ||
      (r.basis !== "regular_rate" && r.basis !== "pay_rate" && part("problemRateBasis"));
    if (problem) issues.push(at(rule("whereMinimumPayRule", r), problem));
  }
  for (const p of t.holidayPolicies) {
    const where = part("whereHolidayPolicy", { name: typeof p.name === "string" ? p.name.slice(0, 100) : String(p.name) });
    const dates = Array.isArray(p.dates) ? p.dates : null;
    const problem =
      ((typeof p.name !== "string" || p.name.trim() === "" || p.name.length > 100) && part("problemHolidayName")) ||
      (p.clientId !== null && (typeof p.clientId !== "string" || p.clientId.trim() === "") && part("problemHolidayClient")) ||
      ((!dates || dates.length === 0 || dates.length > 366) && part("problemHolidayDateCount")) ||
      (dates && !dates.every((d) => typeof d === "string" && isIsoDate(d)) && part("problemHolidayDateInvalid")) ||
      (dates && new Set(dates).size !== dates.length && part("problemHolidayDateTwice")) ||
      (multiplierProblem(p.workedMultiplier) && part("problemHolidayWorkedMultiplier")) ||
      ((!Number.isSafeInteger(p.notWorkedMinutes) || p.notWorkedMinutes < 0 || p.notWorkedMinutes > MINUTES_PER_DAY) && part("problemHolidayNotWorkedMinutes")) ||
      (p.billWorkedMultiplier !== null && multiplierProblem(p.billWorkedMultiplier) && part("problemHolidayBillMultiplier")) ||
      (typeof p.billNotWorked !== "boolean" && part("problemHolidayBillNotWorked"));
    if (problem) issues.push(at(where, problem));
  }
  for (const r of t.regularRateRules) {
    const problem = unknownJurisdiction(r.jurisdiction) || datesProblem(r) || multiplierProblem(r.multiplier);
    if (problem) issues.push(at(rule("whereRegularRateRule", r), problem));
  }
  for (const r of t.equalPayRules) {
    const months = (n: number) => Number.isSafeInteger(n) && n >= 1 && n <= 120;
    const problem =
      unknownJurisdiction(r.jurisdiction) ||
      datesProblem(r) ||
      (!isIsoDate(r.countsFrom) && part("problemCountsFrom", { value: String(r.countsFrom) })) ||
      (!months(r.windowMonths) || !months(r.longWindowMonths) || r.longWindowMonths < r.windowMonths ? part("problemWindows") : null) ||
      (![r.warnMinutes, r.triggerMinutes, r.longTriggerMinutes].every(positiveInt) && part("problemThresholds")) ||
      ((r.warnMinutes >= r.triggerMinutes || r.longTriggerMinutes <= r.triggerMinutes) && part("problemThresholdOrder"));
    if (problem) issues.push(at(rule("whereEqualPayCounterRule", r), problem));
  }
  if (issues.length > 0) return issues;

  issues.push(
    ...overlapProblems(t.overtimeRules, (r) => `${r.jurisdiction}|${r.ruleCode}|${r.kind}`, (r) => rule("whereOvertimeRule", r)),
    ...overlapProblems(t.jurisdictionRules, (r) => `${r.jurisdiction}|${scopeKey(r)}|${r.ruleCode}`, (r) => scoped(rule("whereJurisdictionRule", r), r.scopeName)),
    ...overlapProblems(t.minimumWageRules, (r) => `${r.jurisdiction}|${scopeKey(r)}`, (r) => scoped(part("whereMinimumWageRate", { jurisdiction: String(r.jurisdiction) }), r.scopeName)),
    ...overlapProblems(t.premiumRules, (r) => `${r.jurisdiction}|${r.ruleCode}`, (r) => rule("wherePremiumRule", r)),
    // One minimum-pay rule per state at a time: which one applies would otherwise be a guess.
    ...overlapProblems(t.guaranteeRules, (r) => r.jurisdiction, (r) => rule("whereMinimumPayRule", r)),
  );
  issues.push(...overlapProblems(t.equalPayRules, (r) => r.jurisdiction, (r) => rule("whereEqualPayCounterRule", r)));
  issues.push(...overlapProblems(t.regularRateRules, (r) => `${r.jurisdiction}|${r.ruleCode}`, (r) => rule("whereRegularRateRule", r)));
  // One holiday policy per client (or for the agency) on a date: which one pays would otherwise be a guess.
  for (let i = 0; i < t.holidayPolicies.length; i++) {
    for (let k = i + 1; k < t.holidayPolicies.length; k++) {
      const a = t.holidayPolicies[i]!;
      const b = t.holidayPolicies[k]!;
      const both = a.clientId === b.clientId ? a.dates.filter((d) => b.dates.includes(d)) : [];
      if (both.length > 0) {
        issues.push(invalid(part(a.clientId === null ? "problemHolidayPoliciesAgency" : "problemHolidayPoliciesClient", { a: a.name, b: b.name, date: { date: both[0]! } })));
      }
    }
  }
  return issues;
}
