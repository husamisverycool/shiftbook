/**
 * Rule tables are put in one fixed order and checked before anything is computed, so the result
 * never depends on the order rows arrive in, and malformed or conflicting rows stop the run instead
 * of one of them silently winning.
 */
import { isIsoDate } from "./dates";
import { scopeProblem, STATE_FIPS } from "./places";
import type { Issue, JurisdictionRule, MinimumWageRule, OvertimeRule, PayInput } from "./types";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const OPEN_END = "9999-12-31";
const scopeKey = (r: { countyFips?: string | null; placeFips?: string | null }) => `${r.countyFips ?? ""}|${r.placeFips ?? ""}`;

export interface RuleTables {
  overtimeRules: OvertimeRule[];
  jurisdictionRules: JurisdictionRule[];
  minimumWageRules: MinimumWageRule[];
}

/** Copies of the rule tables in one fixed order. */
export function canonicalRules(input: PayInput): RuleTables {
  const key = (parts: (string | number | null | undefined)[]) => parts.map((p) => String(p ?? "")).join("\u0000");
  const by = <T>(rows: T[], f: (r: T) => string) => [...rows].sort((a, b) => cmp(f(a), f(b)));
  return {
    overtimeRules: by(input.overtimeRules, (r) =>
      key([r.jurisdiction, r.ruleCode, r.kind, r.effectiveFrom, r.effectiveTo ?? OPEN_END, r.thresholdMinutes, r.multiplier.num, r.multiplier.den, r.earningType, r.citation]),
    ),
    jurisdictionRules: by(input.jurisdictionRules, (r) => key([r.jurisdiction, scopeKey(r), r.ruleCode, r.effectiveFrom, r.effectiveTo ?? OPEN_END, r.citation, r.scopeName])),
    minimumWageRules: by(input.minimumWageRules, (r) => key([r.jurisdiction, scopeKey(r), r.effectiveFrom, r.effectiveTo ?? OPEN_END, r.rateCents, r.citation, r.scopeName])),
  };
}

const knownJurisdiction = (j: string) => j === "US" || Object.hasOwn(STATE_FIPS, j);
const positiveInt = (n: unknown) => Number.isSafeInteger(n) && (n as number) > 0;

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
      ((!Number.isSafeInteger(r.thresholdMinutes) || r.thresholdMinutes < 0) && "its threshold must be a whole number of minutes") ||
      ((!positiveInt(r.multiplier.num) || !positiveInt(r.multiplier.den)) && "its multiplier must be a positive whole-number fraction");
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
      (!positiveInt(r.rateCents) && "its rate must be a positive whole number of cents");
    if (problem) issues.push(invalid(`${where}: ${problem}`));
  }
  if (issues.length > 0) return issues;

  issues.push(
    ...overlapProblems(t.overtimeRules, (r) => `${r.jurisdiction}|${r.ruleCode}|${r.kind}`, (r) => `overtime rule ${r.jurisdiction} ${r.ruleCode}`),
    ...overlapProblems(t.jurisdictionRules, (r) => `${r.jurisdiction}|${scopeKey(r)}|${r.ruleCode}`, (r) => `jurisdiction rule ${r.jurisdiction} ${r.ruleCode}${r.scopeName ? ` (${r.scopeName})` : ""}`),
    ...overlapProblems(t.minimumWageRules, (r) => `${r.jurisdiction}|${scopeKey(r)}`, (r) => `minimum-wage rate ${r.jurisdiction}${r.scopeName ? ` (${r.scopeName})` : ""}`),
  );
  return issues;
}
