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
 * A pay rate below the floor is topped up on its own line for every minute worked that day, with a
 * warning to fix the rate card (minimum wage is owed per hour: 29 U.S.C. § 206; in California per
 * hour, not averaged over the week — Armenta v. Osmose (2005) 135 Cal.App.4th 314). A local
 * ordinance that is a plain hourly floor is a local `minimum_wage` row plus dated local rate rows
 * (Chicago, Cook County); an ordinance with more to it carries its own rule code and blocks until
 * modeled.
 */
import { isEffective } from "../dates";
import { isLocal, sameScope, scopeMatches } from "../places";
import type { IsoDate, MinimumWageRule } from "../types";

export const MINIMUM_WAGE = "minimum_wage";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export type MinimumWageSelection =
  | { ok: true; rateCents: number; citations: string[] }
  /** The federal or the state statewide rate is not on file for that date. */
  | { ok: false; missing: string };

/**
 * The minimum wage for a worksite on a date: the highest of the federal rate, the state's statewide
 * rate and any county or place rate for the worksite. Both the federal and the statewide rate must be
 * on file; otherwise the data is missing and nothing is paid.
 */
export function selectMinimumWage(
  rules: MinimumWageRule[],
  site: { jurisdiction: string; countyFips: string; placeFips: string | null },
  date: IsoDate,
): MinimumWageSelection {
  const inEffect = rules.filter((r) => isEffective(date, r.effectiveFrom, r.effectiveTo));
  const federal = inEffect.filter((r) => r.jurisdiction === "US" && !isLocal(r));
  const state = inEffect.filter((r) => r.jurisdiction === site.jurisdiction && !isLocal(r));
  if (federal.length === 0) return { ok: false, missing: "US" };
  if (state.length === 0) return { ok: false, missing: site.jurisdiction };
  const local = inEffect.filter((r) => r.jurisdiction === site.jurisdiction && isLocal(r) && scopeMatches(r, site));
  const matches = [...federal, ...state, ...local];
  const top = Math.max(...matches.map((r) => r.rateCents));
  return { ok: true, rateCents: top, citations: matches.filter((r) => r.rateCents === top).map((r) => r.citation).sort(cmp) };
}

/** True when a local rate row exists for exactly this local scope on that date. */
export function hasLocalRate(
  rules: MinimumWageRule[],
  jurisdiction: string,
  scope: { countyFips?: string | null; placeFips?: string | null },
  date: IsoDate,
): boolean {
  return rules.some((r) => r.jurisdiction === jurisdiction && isLocal(r) && sameScope(r, scope) && isEffective(date, r.effectiveFrom, r.effectiveTo));
}
