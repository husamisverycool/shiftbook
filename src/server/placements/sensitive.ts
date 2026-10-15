/**
 * Social Security numbers and birth dates never leave the upload (CLAUDE.md data safety; SPEC §21).
 * A column is removed when:
 * - its heading names one, however it is written ("S.S.N.", "SS#", "Soc. Sec. No.", "D.O.B.",
 *   "Born", "Fecha de nacimiento", "F. Nac.", "Seguro Social", "NSS", …);
 * - any cell holds a nine-digit number with or without separators (as `extraction/redact.ts` finds
 *   them on images) — a nine-digit id column is removed too, which is the safe way to be wrong; a
 *   ZIP+4 code (five digits, then four) is not that shape;
 * - most of its dates are at least 14 years before today (birth dates, as redact.ts treats them),
 *   in any common way of writing a date — except the start and end dates the import recognises,
 *   where an old placement is just history;
 * - any cell gives a date next to a birth word ("DOB 01/02/1990").
 * A file whose first row holds an SSN or a date has no header row and is refused before anything
 * is kept. What is kept about a removed column is its position, its heading with anything shaped
 * like an SSN or a date hidden, and the reason. The stored copy, previews, mappings and logs only
 * ever see what is left.
 */
import { floorDiv, mod } from "@shiftbook/rules";

/** Heading words that name an SSN, a tax id or a birth date on their own. */
const WORDS = new Set(["ssn", "ssno", "ssnum", "ssnumber", "socsec", "itin", "nss", "curp", "dob", "born", "birth", "birthdate", "birthdates", "birthday", "nacimiento", "nac", "fnac", "cumpleaños", "cumpleanos"]);
/** Short forms that mean an SSN or a tax id only in a heading made of them and id words ("SS #", "Employee TIN"). */
const SHORT = new Set(["ss", "sin", "tin"]);
const ID_WORDS = new Set(["no", "num", "nbr", "number", "numero", "número", "id", "employee", "emp", "worker", "candidate", "last", "4", "four"]);
/** Pieces that name one anywhere in the heading once it is squeezed to letters. */
const PIECES = ["socialsecurity", "taxid", "taxpayer", "dateofbirth", "birthdate", "segurosocial", "fechadenacimiento", "fechanac", "cumplea"];

function sensitiveHeading(heading: string): boolean {
  const text = heading.normalize("NFKC");
  const squeezed = text.toLowerCase().replace(/[^a-z0-9ñ]/g, "");
  const words = text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9ñáéíóú]+/)
    .filter(Boolean);
  if (WORDS.has(squeezed) || SHORT.has(squeezed)) return true;
  if (words.some((w) => WORDS.has(w) || /^ssn|ssn$/.test(w))) return true;
  if (words.some((w) => SHORT.has(w)) && words.every((w) => SHORT.has(w) || ID_WORDS.has(w))) return true;
  if (words.some((w, i) => w === "soc" && words[i + 1]?.startsWith("sec"))) return true;
  return PIECES.some((p) => squeezed.includes(p));
}

/** Nine digits as 3-2-4 with any common separator between both groups or none at all (not 5-4, a ZIP+4). */
const SEP = String.raw`(?:\s*[.\-‐-―_/]\s*|\s+)`;
const SSN_SOURCE = String.raw`(?<!\d)(?:\d{3}${SEP}\d{2}${SEP}?\d{4}|\d{9})(?!\d)`;
const SSN_SHAPED = new RegExp(SSN_SOURCE);
const ssnIn = (text: string) => SSN_SHAPED.test(text.normalize("NFKC"));

const MONTHS = new Set(
  (
    "jan january feb february mar march apr april may jun june jul july aug august sep sept september oct october nov november dec december " +
    "ene enero febrero marzo abr abril mayo junio julio ago agosto septiembre setiembre octubre noviembre dic diciembre"
  ).split(" "),
);
const DAY = String.raw`(\d{1,2})(?:st|nd|rd|th)?`;
const YEAR = String.raw`(\d{4}|\d{2})`;
const NAME = String.raw`([a-zñ]{3,10})\.?`;
/** The ways a date is commonly written; each gives the year (and enough to check it is a date). */
const DATE_FORMS: { source: string; year: (m: RegExpExecArray) => string | null }[] = [
  // 01/02/1990, 1/2/90, 02.01.1990, 01-02-1990 (month or day first: only the year matters here)
  { source: String.raw`(\d{1,2})[/.\-](\d{1,2})[/.\-]${YEAR}`, year: (m) => (Number(m[1]) >= 1 && Number(m[2]) >= 1 && Number(m[1]) <= 31 && Number(m[2]) <= 31 && Math.min(Number(m[1]), Number(m[2])) <= 12 ? m[3]! : null) },
  // 1990/01/02, 1990-01-02, 1990-01-02 00:00:00
  { source: String.raw`(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?`, year: (m) => (Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31 ? m[1]! : null) },
  // 19900102
  { source: String.raw`((?:19|20)\d{2})(\d{2})(\d{2})`, year: (m) => (Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31 ? m[1]! : null) },
  // 2 Jan 1990, 02-Jan-1990, 2 de enero de 1990
  { source: String.raw`${DAY}[\s\-/.]*(?:de\s+)?${NAME}[\s\-/.,]*(?:de\s+)?${YEAR}`, year: (m) => (MONTHS.has(m[2]!) && Number(m[1]) >= 1 && Number(m[1]) <= 31 ? m[3]! : null) },
  // Jan 2, 1990; January 2 1990
  { source: String.raw`${NAME}\s*${DAY},?[\s\-/.]*${YEAR}`, year: (m) => (MONTHS.has(m[1]!) && Number(m[2]) >= 1 && Number(m[2]) <= 31 ? m[3]! : null) },
];
const WHOLE = DATE_FORMS.map((f) => ({ re: new RegExp(`^${f.source}$`, "i"), year: f.year }));
const INSIDE = DATE_FORMS.map((f) => ({ re: new RegExp(String.raw`(?<![\da-zñ])${f.source}(?![\da-zñ])`, "gi"), year: f.year }));

/** A two-digit year after this year's is last century ("01/02/90" is 1990), for finding birth dates only. */
function fullYear(text: string, thisYear: number): number {
  if (text.length === 4) return Number(text);
  const yy = Number(text);
  return yy > thisYear % 100 ? 1900 + yy : 2000 + yy;
}

/** The year of a cell that is a date, however it is written; null when it is not one. */
function dateYear(text: string, thisYear: number): number | null {
  const t = text.normalize("NFKC").trim().toLowerCase();
  for (const form of WHOLE) {
    const m = form.re.exec(t);
    const y = m ? form.year(m) : null;
    if (y) return fullYear(y, thisYear);
  }
  return null;
}

function hasDateInside(text: string): boolean {
  const t = text.normalize("NFKC").toLowerCase();
  return INSIDE.some((form) => [...t.matchAll(form.re)].some((m) => form.year(m) !== null));
}

/** Words that say a date nearby is a birth date. */
const BIRTH_WORD = /(?<![a-zñ])(?:d\.?\s?o\.?\s?b|born|birth[a-z]*|f\.?\s?nac|nac(?![a-zñ])|nacimiento|naci[oó]|cumplea[a-zñ]*)/i;

function birthDates(values: string[], thisYear: number): boolean {
  if (values.some((v) => BIRTH_WORD.test(v) && hasDateInside(v))) return true;
  const years = values.map((v) => dateYear(v, thisYear)).filter((y): y is number => y !== null);
  const old = years.filter((y) => y <= thisYear - 14).length;
  return old > 0 && old * 2 > years.length;
}

/** A spreadsheet's column letter: 0 → A, 26 → AA. */
function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    out = String.fromCharCode(65 + mod(n - 1, 26)) + out;
    n = floorDiv(n - 1, 26);
  }
  return out;
}

/** A heading with anything shaped like an SSN or a date hidden. */
function masked(heading: string): string {
  let out = heading.normalize("NFKC").replace(new RegExp(SSN_SOURCE, "g"), "•••");
  for (const form of INSIDE) out = out.replace(form.re, (...m) => (form.year(m as unknown as RegExpExecArray) ? "•••" : m[0]));
  return out.slice(0, 100);
}

export type RemovedColumn = { column: string; heading: string; reason: "heading" | "ssn_values" | "birth_dates" };

/**
 * True when a heading is shaped like an SSN or is a date: the first row is a record, not column
 * names, and the file is refused before anything is kept.
 */
export function headingProblem(header: string[], today: string): boolean {
  const thisYear = Number(today.slice(0, 4));
  return header.some((h) => ssnIn(h) || dateYear(h, thisYear) !== null);
}

export function dropSensitive(
  header: string[],
  rows: string[][],
  today: string,
  opts: { dateColumns?: string[] } = {},
): { header: string[]; rows: string[][]; removed: RemovedColumn[] } {
  const thisYear = Number(today.slice(0, 4));
  const removed: RemovedColumn[] = [];
  const keep = header.map((h, i) => {
    const column = rows.map((r) => (r[i] ?? "").trim()).filter((v) => v !== "");
    const reason: RemovedColumn["reason"] | null = sensitiveHeading(h)
      ? "heading"
      : column.some(ssnIn)
        ? "ssn_values"
        : !opts.dateColumns?.includes(h) && birthDates(column, thisYear)
          ? "birth_dates"
          : null;
    if (reason) removed.push({ column: columnLetter(i), heading: masked(h), reason });
    return reason === null;
  });
  return {
    header: header.filter((_, i) => keep[i]),
    rows: rows.map((r) => header.map((_, i) => r[i] ?? "").filter((_, i) => keep[i])),
    removed,
  };
}

/** A filename with an SSN-shaped part in it is stored with that part hidden. */
export function safeFilename(name: string): string {
  return name.normalize("NFKC").replace(new RegExp(SSN_SOURCE, "g"), "•••").slice(0, 200);
}
