/**
 * Worksites and local wage rules are matched by official Census codes, never by names: names have
 * too many spellings ("Cook Co.", "County of Cook", "Chicago, IL") for a match to be safe.
 *   - county: 5-digit FIPS code = 2-digit state code + 3-digit county code ("17031" = Cook County, IL)
 *   - place:  7-digit FIPS code = 2-digit state code + 5-digit place code ("1714000" = Chicago, IL),
 *             or NO_PLACE when someone has confirmed the worksite is outside any city or town.
 *             A missing place code is unknown, never "outside": a city ordinance could be missed.
 * Source: U.S. Census Bureau, ANSI/FIPS codes for states, counties and places.
 */
import { part, type SayPart } from "./say";

/** Two-letter USPS state code → 2-digit FIPS state code (50 states and DC). */
export const STATE_FIPS: Readonly<Record<string, string>> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", DC: "11", FL: "12",
  GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23",
  MD: "24", MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30", NE: "31", NV: "32", NH: "33",
  NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44",
  SC: "45", SD: "46", TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54", WI: "55",
  WY: "56",
};

/** The worksite is confirmed to be outside any incorporated city or town. */
export const NO_PLACE = "none";

const COUNTY = /^\d{5}$/;
const PLACE = /^\d{7}$/;

/** Why a worksite's state, county and place codes cannot be used (as message keys), or null when they can. */
export function placeProblem(state: string, countyFips: unknown, placeFips: unknown): SayPart | null {
  const prefix = Object.hasOwn(STATE_FIPS, state) ? STATE_FIPS[state] : undefined;
  if (prefix === undefined) return part("problemWorksiteState", { state: String(state) });
  if (typeof countyFips !== "string" || !COUNTY.test(countyFips)) return part("problemCountyNeeded");
  if (!countyFips.startsWith(prefix)) return part("problemCountyNotInState", { code: countyFips, state });
  if (placeFips === NO_PLACE) return null;
  if (typeof placeFips !== "string" || !PLACE.test(placeFips)) return part("problemPlaceNeeded");
  if (!placeFips.startsWith(prefix)) return part("problemPlaceNotInState", { code: placeFips, state });
  return null;
}

/** Why a rule row's local scope is malformed (as message keys), or null when it is fine (both null = statewide). */
export function scopeProblem(jurisdiction: string, countyFips: unknown, placeFips: unknown): SayPart | null {
  const county = countyFips ?? null;
  const place = placeFips ?? null;
  if (county === null && place === null) return null;
  if (jurisdiction === "US") return part("problemFederalScope");
  if (county !== null && place !== null) return part("problemCountyAndPlace");
  const prefix = Object.hasOwn(STATE_FIPS, jurisdiction) ? STATE_FIPS[jurisdiction] : undefined;
  if (prefix === undefined) return part("problemNotAState", { jurisdiction: String(jurisdiction) });
  if (county !== null && (typeof county !== "string" || !COUNTY.test(county) || !county.startsWith(prefix))) return part("problemScopeCounty", { code: String(county), jurisdiction });
  if (place !== null && (typeof place !== "string" || !PLACE.test(place) || !place.startsWith(prefix))) return part("problemScopePlace", { code: String(place), jurisdiction });
  return null;
}

/** A row applies to a worksite when its scope (if any) is the worksite's county or place. */
export function scopeMatches(row: { countyFips?: string | null; placeFips?: string | null }, site: { countyFips: string; placeFips: string | null }): boolean {
  const county = row.countyFips ?? null;
  const place = row.placeFips ?? null;
  if (county !== null) return county === site.countyFips;
  if (place !== null) return place === site.placeFips;
  return true;
}

/** True when the row is scoped to a county or place (not statewide or federal). */
export const isLocal = (row: { countyFips?: string | null; placeFips?: string | null }) => (row.countyFips ?? null) !== null || (row.placeFips ?? null) !== null;

/** The same local scope (both statewide, or the same county, or the same place). */
export const sameScope = (a: { countyFips?: string | null; placeFips?: string | null }, b: { countyFips?: string | null; placeFips?: string | null }) =>
  (a.countyFips ?? null) === (b.countyFips ?? null) && (a.placeFips ?? null) === (b.placeFips ?? null);
