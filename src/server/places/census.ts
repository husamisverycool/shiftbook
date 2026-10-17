/**
 * Census county and place codes for the worksite editor (decision 0008: places are picked from the
 * Census list, never typed as names). Source: U.S. Census Bureau 2020 FIPS code files
 * national_county2020.txt and national_place2020.txt (www2.census.gov/geo/docs/reference/codes2020),
 * fetched 2026-10-17; only incorporated places are kept — local wage ordinances are made by cities and
 * villages, and a worksite in an unincorporated area is recorded as "outside any city or town".
 */
import countiesJson from "./counties-2020.json";
import placesJson from "./places-2020.json";

export interface County {
  fips: string;
  name: string;
}
export interface Place {
  fips: string;
  name: string;
  /** The counties the place lies in (most lie in one). */
  counties: string[];
}

const COUNTIES = countiesJson as unknown as Record<string, [string, string][]>;
const PLACES = placesJson as unknown as Record<string, [string, string, string[]][]>;

/** Two-letter state codes the Census lists, in alphabetical order. */
export const CENSUS_STATES = Object.keys(COUNTIES).sort();

export function countiesOf(state: string): County[] {
  return (COUNTIES[state] ?? []).map(([fips, name]) => ({ fips, name }));
}

export function countyNamed(state: string, fips: string): County | null {
  const row = (COUNTIES[state] ?? []).find(([f]) => f === fips);
  return row ? { fips: row[0], name: row[1] } : null;
}

export function placeNamed(state: string, fips: string): Place | null {
  const row = (PLACES[state] ?? []).find(([f]) => f === fips);
  return row ? { fips: row[0], name: row[1], counties: row[2] } : null;
}

const fold = (v: string) =>
  v
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();

/**
 * The state's places whose name starts with (then contains) the words typed, optionally only those in
 * one county; at most `limit`.
 */
export function searchPlaces(state: string, query: string, countyFips: string | null, limit = 20): Place[] {
  const q = fold(query);
  const all = (PLACES[state] ?? []).filter(([, , counties]) => countyFips === null || counties.includes(countyFips));
  const named = q === "" ? all : all.filter(([, name]) => fold(name).includes(q));
  const starts = named.filter(([, name]) => fold(name).startsWith(q));
  const rest = named.filter(([, name]) => !fold(name).startsWith(q));
  return [...starts, ...rest].slice(0, limit).map(([fips, name, counties]) => ({ fips, name, counties }));
}
