/**
 * County and city names are free text on worksites; ordinances must match however they are written:
 * "Cook County" = "cook" = " COOK ", "City of Chicago" = "Chicago". Integer/strings only.
 */
export function placeKey(value: string | null | undefined): string {
  if (value == null) return "";
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(county|parish|borough|city of|town of|village of|city|township)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A scoped row applies when its county/city (if any) equals the worksite's, after normalizing. */
export function placeMatches(rowValue: string | null | undefined, siteValue: string): boolean {
  return rowValue == null || placeKey(rowValue) === placeKey(siteValue);
}
