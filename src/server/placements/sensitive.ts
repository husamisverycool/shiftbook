/**
 * Social Security numbers and birth dates never leave the upload (CLAUDE.md data safety; SPEC §21).
 * A column is removed when:
 * - its heading names one, however it is written ("S.S.N.", "SS#", "Soc. Sec. No.", "D.O.B.",
 *   "Born", "Fecha de nacimiento", "Seguro Social", …);
 * - any cell holds a nine-digit number with or without separators (as `extraction/redact.ts` finds
 *   them on images) — a nine-digit id column is removed too, which is the safe way to be wrong;
 * - it holds dates at least 14 years before today (birth dates, as redact.ts treats them).
 * The stored copy, previews, mappings and logs only ever see what is left.
 */
import { parseIsoDateText, parseUsDate } from "../intake/parse";

/** Heading words that name an SSN, a tax id or a birth date on their own. */
const WORDS = new Set(["ssn", "ss", "ssno", "ssnum", "sin", "tin", "itin", "dob", "born", "birth", "birthdate", "birthday", "nacimiento"]);
/** Pieces that name one anywhere in the heading once it is squeezed to letters and digits. */
const PIECES = ["socialsecurity", "socsec", "ssnumber", "taxid", "taxpayer", "dateofbirth", "birthdate", "segurosocial", "fechadenacimiento", "ssn#"];

function sensitiveHeading(heading: string): boolean {
  const squeezed = heading.toLowerCase().replace(/[^a-z0-9#ñ]/g, "");
  const words = heading
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9ñ]+/)
    .filter(Boolean);
  if (WORDS.has(squeezed.replace(/#/g, "")) || words.some((w) => WORDS.has(w))) return true;
  if (/^s\.?s\.?#?$/i.test(heading.trim())) return true;
  return PIECES.some((p) => squeezed.includes(p));
}

/** Nine digits as 3-2-4 with any common separator, or none (redact.ts plus "." and dashes). */
const SSN_SHAPED = /(?<!\d)\d{3}[\s.\-‐-―]?\d{2}[\s.\-‐-―]?\d{4}(?!\d)/;

function birthDates(values: string[], today: string): boolean {
  const cutoff = Number(today.slice(0, 4)) - 14;
  return values.some((v) => {
    const d = parseIsoDateText(v) ?? parseUsDate(v) ?? parseDayFirst(v);
    return d !== null && Number(d.slice(0, 4)) <= cutoff;
  });
}

function parseDayFirst(text: string): string | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(text);
  return m ? parseUsDate(`${m[2]}/${m[1]}/${m[3]}`) : null;
}

export function dropSensitive(header: string[], rows: string[][], today: string): { header: string[]; rows: string[][]; removed: string[] } {
  const keep = header.map((h, i) => {
    const column = rows.map((r) => (r[i] ?? "").trim()).filter((v) => v !== "");
    return !sensitiveHeading(h) && !column.some((v) => SSN_SHAPED.test(v)) && !birthDates(column, today);
  });
  return {
    header: header.filter((_, i) => keep[i]),
    rows: rows.map((r) => header.map((_, i) => r[i] ?? "").filter((_, i) => keep[i])),
    removed: header.filter((_, i) => !keep[i]),
  };
}

/** A filename with an SSN-shaped part in it is stored with that part hidden. */
export function safeFilename(name: string): string {
  return name.replace(new RegExp(SSN_SHAPED.source, "g"), "•••").slice(0, 200);
}
