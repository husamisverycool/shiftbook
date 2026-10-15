/**
 * RULE: minimum wage floor.
 *
 * The applicable minimum wage on a given day is the highest of the federal, state and local
 * (county, city) rates in effect that day. Rates and citations come from the effective-dated
 * `minimum_wage_rules` table.
 *
 * Legal sources (as carried in the rule data):
 * - Fair Labor Standards Act, 29 U.S.C. § 206(a)(1); § 218(a) preserves higher state and local rates.
 * - Illinois Minimum Wage Law, 820 ILCS 105/4.
 * - Massachusetts, M.G.L. c. 151, § 1.
 * - California, Cal. Lab. Code § 1182.12.
 *
 * Slice (a): a pay rate below the floor BLOCKS the run (SPEC §11 blocking check). The minimum-wage
 * true-up line (SPEC §23 golden) and local ordinances (each a rule code that blocks until modeled)
 * come with the full rules engine.
 */
import { isEffective } from "../dates";
import { placeMatches } from "../places";
import type { IsoDate, MinimumWageRule } from "../types";

export const MINIMUM_WAGE = "minimum_wage";

export function selectMinimumWage(
  rules: MinimumWageRule[],
  state: string,
  county: string,
  city: string,
  date: IsoDate,
): { rateCents: number; citations: string[] } | null {
  const matches = rules.filter(
    (r) =>
      (r.jurisdiction === "US" || r.jurisdiction === state) &&
      (r.county == null || (r.jurisdiction === state && placeMatches(r.county, county))) &&
      (r.city == null || (r.jurisdiction === state && placeMatches(r.city, city))) &&
      isEffective(date, r.effectiveFrom, r.effectiveTo),
  );
  // A state with no statewide row of its own is missing data, even if the federal floor exists.
  if (!matches.some((r) => r.jurisdiction === state && r.county == null && r.city == null)) return null;
  const top = Math.max(...matches.map((r) => r.rateCents));
  return { rateCents: top, citations: matches.filter((r) => r.rateCents === top).map((r) => r.citation) };
}
