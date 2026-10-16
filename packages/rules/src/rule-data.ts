/**
 * Rule tables are put in one fixed order and checked before anything is computed, so the result
 * never depends on the order rows arrive in, and malformed or conflicting rows stop the run instead
 * of one of them silently winning.
 */
import { isIsoDate } from "./dates";
import { scopeProblem, STATE_FIPS } from "./places";
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

function multiplierProblem(m: { num?: unknown; den?: unknown } | undefined): string | null {
  if (!m || !positiveInt(m.num) || !positiveInt(m.den) || (m.num as number) > MAX_FACTOR || (m.den as number) > MAX_FACTOR) {
    return "its multiplier must be a positive whole-number fraction";
  }
  if ((m.num as number) < (m.den as number)) return "its multiplier is below 1, which would pay overtime at less than the regular rate";
  return null;
}

function datesProblem(r: { effectiveFrom: string; effectiveTo: string | null }): string | null {
  if (!isIsoDate(r.effectiveFrom)) return `effective-from "${r.effectiveFrom}" is not a date`;
  if (r.effectiveTo !== null && !isIsoDate(r.effectiveTo)) return `effective-to "${r.effectiveTo}" is not a date`;
  if (r.effectiveTo !== null && r.effectiveTo < r.effectiveFrom) return "it ends before it starts";
  return null;
}

const overlaps = (a: { effectiveFrom: string; effectiveTo: string | null }, b: { effectiveFrom: string; effectiveTo: string | null }) =>
  a.effectiveFrom <= (b.effectiveTo ?? OPEN_END) && b.effectiveFrom <= (a.effectiveTo ?? OPEN_END);

function overlapProblems<T extends { effectiveFrom: string; effectiveTo: string | null; citation: string }>(rows: T[], group: (r: T) => string, label: (r: T) => string): Issue[] {
  const issues: Issue[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let k = i + 1; k < rows.length; k++) {
      const a = rows[i]!;
      const b = rows[k]!;
      if (group(a) === group(b) && overlaps(a, b)) {
        issues.push(invalid(`${label(a)}: two rows are in effect at the same time (from ${a.effectiveFrom} and from ${b.effectiveFrom}: "${a.citation}" and "${b.citation}"), so which one applies would be a guess`));
      }
    }
  }
  return issues;
}

const invalid = (problem: string): Issue => ({
  code: "rule_data_invalid",
  message: `Rule data problem — ${problem}. Nothing is computed until the rule data is fixed.`,
});

/** Every problem with the rule tables; an empty list means they can be used. */
export function ruleDataProblems(t: RuleTables): Issue[] {
  const issues: Issue[] = [];
  for (const r of t.overtimeRules) {
    const where = `overtime rule ${r.jurisdiction} ${r.ruleCode}`;
    const problem =
      (!knownJurisdiction(r.jurisdiction) && `"${r.jurisdiction}" is not US, a state or DC`) ||
      datesProblem(r) ||
      ((!Number.isSafeInteger(r.thresholdMinutes) || r.thresholdMinutes < 0 || r.thresholdMinutes > MAX_THRESHOLD_MINUTES) && "its threshold must be a whole number of minutes within a week") ||
      multiplierProblem(r.multiplier) ||
      (r.kind === "weekly" && r.earningType !== "OT" && `a weekly overtime row must pay earning type OT, not ${String(r.earningType)}`);
    if (problem) issues.push(invalid(`${where}: ${problem}`));
  }
  for (const r of t.jurisdictionRules) {
    const where = `jurisdiction rule ${r.jurisdiction} ${r.ruleCode}`;
    const problem = (!knownJurisdiction(r.jurisdiction) && `"${r.jurisdiction}" is not US, a state or DC`) || datesProblem(r) || scopeProblem(r.jurisdiction, r.countyFips, r.placeFips);
    if (problem) issues.push(invalid(`${where}: ${problem}`));
  }
  for (const r of t.minimumWageRules) {
    const where = `minimum-wage rate ${r.jurisdiction}`;
    const problem =
      (!knownJurisdiction(r.jurisdiction) && `"${r.jurisdiction}" is not US, a state or DC`) ||
      datesProblem(r) ||
      scopeProblem(r.jurisdiction, r.countyFips, r.placeFips) ||
      ((!positiveInt(r.rateCents) || r.rateCents > MAX_MINIMUM_WAGE_CENTS) && "its rate must be a positive whole number of cents, at most $1,000 an hour");
    if (problem) issues.push(invalid(`${where}: ${problem}`));
  }
  for (const r of t.premiumRules) {
    const where = `premium rule ${r.jurisdiction} ${r.ruleCode}`;
    const problem =
      (!knownJurisdiction(r.jurisdiction) && `"${r.jurisdiction}" is not US, a state or DC`) ||
      datesProblem(r) ||
      ((!positiveInt(r.premiumMinutes) || r.premiumMinutes > MAX_THRESHOLD_MINUTES) && "its minutes of pay must be a positive whole number within a week") ||
      ((!positiveInt(r.perWorkdayMax) || r.perWorkdayMax > 24) && "its per-workday limit must be a small positive whole number");
    if (problem) issues.push(invalid(`${where}: ${problem}`));
  }
  for (const r of t.guaranteeRules) {
    const where = `minimum-pay rule ${r.jurisdiction} ${r.ruleCode}`;
    const minutes = (n: number | null) => n === null || (Number.isSafeInteger(n) && n >= 0 && n <= MAX_THRESHOLD_MINUTES);
    const f = r.scheduledFraction;
    const problem =
      (!knownJurisdiction(r.jurisdiction) && `"${r.jurisdiction}" is not US, a state or DC`) ||
      datesProblem(r) ||
      (![r.dueMinutes, r.reassignedDueMinutes, r.minMinutes, r.maxMinutes, r.minScheduledMinutes].every(minutes) && "its minutes must be whole numbers within a week") ||
      (f !== null && (!positiveInt(f.num) || !positiveInt(f.den) || f.num > f.den) && "its share of the scheduled day must be a fraction from 0 to 1") ||
      (r.minMinutes !== null && r.maxMinutes !== null && r.minMinutes > r.maxMinutes && "its least minutes are more than its most") ||
      (r.basis !== "regular_rate" && r.basis !== "pay_rate" && "its rate basis must be the regular rate or the pay rate");
    if (problem) issues.push(invalid(`${where}: ${problem}`));
  }
  for (const p of t.holidayPolicies) {
    const where = `holiday policy "${typeof p.name === "string" ? p.name.slice(0, 100) : String(p.name)}"`;
    const dates = Array.isArray(p.dates) ? p.dates : null;
    const problem =
      ((typeof p.name !== "string" || p.name.trim() === "" || p.name.length > 100) && "its name must be text of 1 to 100 characters") ||
      (p.clientId !== null && (typeof p.clientId !== "string" || p.clientId.trim() === "") && "its client must be a client id, or none for the agency's default") ||
      ((!dates || dates.length === 0 || dates.length > 366) && "it must list from 1 to 366 holiday dates") ||
      (dates && !dates.every((d) => typeof d === "string" && isIsoDate(d)) && "one of its holiday dates is not a real calendar date") ||
      (dates && new Set(dates).size !== dates.length && "it lists the same date twice") ||
      (multiplierProblem(p.workedMultiplier) && "its pay for hours worked on a holiday must be a whole-number fraction of at least 1× the pay rate") ||
      ((!Number.isSafeInteger(p.notWorkedMinutes) || p.notWorkedMinutes < 0 || p.notWorkedMinutes > MINUTES_PER_DAY) && "its pay for a holiday not worked must be a whole number of minutes, at most a day") ||
      (p.billWorkedMultiplier !== null && multiplierProblem(p.billWorkedMultiplier) && "its bill for hours worked on a holiday must be a whole-number fraction of at least 1× the bill rate, or none") ||
      (typeof p.billNotWorked !== "boolean" && "whether a holiday not worked is billed must be yes or no");
    if (problem) issues.push(invalid(`${where}: ${problem}`));
  }
  for (const r of t.regularRateRules) {
    const where = `regular-rate rule ${r.jurisdiction} ${r.ruleCode}`;
    const problem = (!knownJurisdiction(r.jurisdiction) && `"${r.jurisdiction}" is not US, a state or DC`) || datesProblem(r) || multiplierProblem(r.multiplier);
    if (problem) issues.push(invalid(`${where}: ${problem}`));
  }
  for (const r of t.equalPayRules) {
    const where = `equal-pay counter rule ${r.jurisdiction} ${r.ruleCode}`;
    const months = (n: number) => Number.isSafeInteger(n) && n >= 1 && n <= 120;
    const problem =
      (!knownJurisdiction(r.jurisdiction) && `"${r.jurisdiction}" is not US, a state or DC`) ||
      datesProblem(r) ||
      (!isIsoDate(r.countsFrom) && `its counting start "${r.countsFrom}" is not a date`) ||
      (!months(r.windowMonths) || !months(r.longWindowMonths) || r.longWindowMonths < r.windowMonths ? "its windows must be whole numbers of months from 1 to 120, the long one at least as long" : null) ||
      (![r.warnMinutes, r.triggerMinutes, r.longTriggerMinutes].every(positiveInt) && "its thresholds must be positive whole numbers of minutes") ||
      ((r.warnMinutes >= r.triggerMinutes || r.longTriggerMinutes <= r.triggerMinutes) && "its heads-up must come before its trigger, and its long trigger after it");
    if (problem) issues.push(invalid(`${where}: ${problem}`));
  }
  if (issues.length > 0) return issues;

  issues.push(
    ...overlapProblems(t.overtimeRules, (r) => `${r.jurisdiction}|${r.ruleCode}|${r.kind}`, (r) => `overtime rule ${r.jurisdiction} ${r.ruleCode}`),
    ...overlapProblems(t.jurisdictionRules, (r) => `${r.jurisdiction}|${scopeKey(r)}|${r.ruleCode}`, (r) => `jurisdiction rule ${r.jurisdiction} ${r.ruleCode}${r.scopeName ? ` (${r.scopeName})` : ""}`),
    ...overlapProblems(t.minimumWageRules, (r) => `${r.jurisdiction}|${scopeKey(r)}`, (r) => `minimum-wage rate ${r.jurisdiction}${r.scopeName ? ` (${r.scopeName})` : ""}`),
    ...overlapProblems(t.premiumRules, (r) => `${r.jurisdiction}|${r.ruleCode}`, (r) => `premium rule ${r.jurisdiction} ${r.ruleCode}`),
    // One minimum-pay rule per state at a time: which one applies would otherwise be a guess.
    ...overlapProblems(t.guaranteeRules, (r) => r.jurisdiction, (r) => `minimum-pay rule ${r.jurisdiction} ${r.ruleCode}`),
  );
  issues.push(...overlapProblems(t.equalPayRules, (r) => r.jurisdiction, (r) => `equal-pay counter rule ${r.jurisdiction} ${r.ruleCode}`));
  issues.push(...overlapProblems(t.regularRateRules, (r) => `${r.jurisdiction}|${r.ruleCode}`, (r) => `regular-rate rule ${r.jurisdiction} ${r.ruleCode}`));
  // One holiday policy per client (or for the agency) on a date: which one pays would otherwise be a guess.
  for (let i = 0; i < t.holidayPolicies.length; i++) {
    for (let k = i + 1; k < t.holidayPolicies.length; k++) {
      const a = t.holidayPolicies[i]!;
      const b = t.holidayPolicies[k]!;
      const both = a.clientId === b.clientId ? a.dates.filter((d) => b.dates.includes(d)) : [];
      if (both.length > 0) {
        issues.push(invalid(`holiday policies "${a.name}" and "${b.name}" both list ${both[0]} for ${a.clientId === null ? "the agency" : "the same client"}, so which one pays would be a guess`));
      }
    }
  }
  return issues;
}
