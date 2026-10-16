/**
 * Social Security numbers and birth dates never leave the upload (CLAUDE.md data safety; SPEC §21).
 * A column is removed when:
 * - its heading names one, however it is written ("S.S.N.", "SS#", "Soc. Sec. No.", "D.O.B.",
 *   "Born", "Fecha de nacimiento", "F. Nac.", "Seguro Social", "NSS", …);
 * - any cell holds a nine-digit number with or without separators (as `extraction/redact.ts` finds
 *   them on images) — a nine-digit id column is removed too, which is the safe way to be wrong; a
 *   ZIP+4 code (five digits, then four) is not that shape;
 * - most of its cells are dates and most of those are at least 14 years before today (birth dates,
 *   as redact.ts treats them), in any common way of writing a date — except the start and end
 *   dates the import recognises, where an old placement is just history. An 8-digit number
 *   ("19900102", "10011999") and a date of short numbers with spaces ("8 8 10") are as often an id
 *   or hours, so they count as dates only when the heading has a birth word;
 * - any cell gives a date next to a birth word ("DOB 01/02/1990", "dob01/02/1990"), or right after
 *   a short label that means one only then ("FN 02/01/1990", "YOB 1990", "geb 02.01.1990").
 * A file whose first row holds an SSN or a date has no header row and is refused before anything
 * is kept. What is kept about a removed column is its position, its heading with every digit
 * hidden, and the reason. The stored copy, previews, mappings and logs only ever see what is left.
 */
import { floorDiv, mod } from "@shiftbook/rules";

/** Heading words that name an SSN, a tax id or a birth date on their own. */
const WORDS = new Set([
  "ssn", "ssno", "ssnum", "ssnumber", "socsec", "last4", "itin", "nss", "curp",
  "dob", "born", "birth", "birthdate", "birthdates", "birthday", "bday",
  "nacimiento", "nac", "fnac", "nacido", "nacida", "cumpleaños", "cumpleanos", "naissance", "naiss", "geboren",
  "yob", "bdate", "lastfour",
]);
/**
 * Short forms that mean an SSN or a tax id only in a heading made of them and id words ("SS #",
 * "Employee TIN", "Employee L4"), never beside other words ("L4 Hours", "Level L4").
 */
const SHORT = new Set(["ss", "sin", "tin", "l4"]);
const ID_WORDS = new Set(["no", "num", "nbr", "number", "numero", "número", "id", "employee", "emp", "worker", "candidate", "last", "4", "four"]);
/** Pieces that name one anywhere in the heading once it is squeezed to letters. */
const PIECES = ["socialsecurity", "socialinsurance", "taxid", "taxpayer", "dateofbirth", "birthdate", "segurosoc", "fechadenacimiento", "fechanac", "cumplea", "datedenaissance", "geburt", "gebdatum", "nascimento", "nascita", "geboorte", "urodzeni"];

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
  if (words.some((w, i) => (w === "soc" || w === "social") && words[i + 1]?.startsWith("sec"))) return true;
  return PIECES.some((p) => squeezed.includes(p));
}

/** Nine digits as 3-2-4 with any common separator between both groups or none at all (not 5-4, a ZIP+4). */
const SEP = String.raw`(?:\s{0,3}[.\-‐-―_/]\s{0,3}|\s{1,3})`;
const SSN_SOURCE = String.raw`(?<!\d)(?:\d{3}${SEP}\d{2}${SEP}?\d{4}|\d{9})(?!\d)`;
const SSN_SHAPED = new RegExp(SSN_SOURCE);
const ssnIn = (text: string) => SSN_SHAPED.test(text.normalize("NFKC"));

/**
 * Month names and their common short forms in English, Spanish, French and German → the month's
 * number. The import's date reading (`plan.ts`) uses the same list.
 */
export const MONTH_NUMBER: ReadonlyMap<string, number> = new Map(
  [
    "jan january ene enero janvier janv januar jänner jaenner",
    "feb february febrero février fevrier févr fevr fév fev februar",
    "mar march marzo mars märz maerz mär",
    "apr april abr abril avril avr",
    "may mayo mai",
    "jun june junio juin juni",
    "jul july julio juillet juil juli",
    "aug august ago agosto août aout",
    "sep sept september septiembre setiembre septembre",
    "oct october octubre octobre oktober okt",
    "nov november noviembre novembre",
    "dec december dic diciembre décembre decembre déc dezember dez",
  ].flatMap((names, i) => names.split(" ").map((name) => [name, i + 1] as const)),
);
// Every repeat below is bounded, so a long cell can never make the search slow.
const DAY = String.raw`(\d{1,2})(?:st|nd|rd|th)?`;
const YEAR = String.raw`['’]?(\d{4}|\d{2})`;
/** A month's name (checked against MONTH_NUMBER), with an optional dot; one capture group. */
export const MONTH_NAME = String.raw`([a-zñéèêëàâäöüûôîïç]{3,11})\.?`;
const NAME = MONTH_NAME;
const DSEP = String.raw`[\s\-/.]`;
/** An optional weekday before a date written with a month name ("Tue Jan 02 1990", "Mon, Oct 19, 2026"); no capture group. */
export const WEEKDAY = String.raw`(?:(?:mon|tue|wed|thu|fri|sat|sun|lun|mar|mi[eé]|jue|vie|s[aá]b|dom)[a-zé]{0,7}\.?,?\s{1,3})?`;
/** A time zone: a short name ("UTC", "EST") or a named one ("America/Chicago", "America/Argentina/Buenos_Aires"). */
const ZONE = String.raw`(?:z|utc|gmt|[a-z]{2,14}(?:/[a-z0-9_+\-]{1,30}){1,2}|[a-z]{2,5})`;
/**
 * An optional time of day after a date, with an optional time zone, as spreadsheets and databases
 * write date-time cells ("1/2/1990 12:00:00 AM", "1990-01-02 00:00:00 UTC", "… America/Chicago",
 * "… GMT-0500 (Eastern Standard Time)").
 */
const TIME = String.raw`(?:(?:\s{1,3}|t)\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:\s{0,3}[ap]\.?\s?m\.?)?(?:\s{0,3}${ZONE})?(?:\s{0,3}[+-]\d{2}(?::?\d{2})?)?(?:\s{0,3}\([^)]{0,60}\))?)?`;
const isMonth = (name: string | undefined) => MONTH_NUMBER.has((name ?? "").toLowerCase());
const dayOk = (d: string | undefined) => Number(d) >= 1 && Number(d) <= 31;
const monthOk = (m: string | undefined) => Number(m) >= 1 && Number(m) <= 12;
/** Numbers with spaces between them are a date on their own only with a year from 1900 to 2099 ("01 02 1990", not "8 8 10"). */
const shortSpaced = (separator: string | undefined, year: string | undefined) => /\s/.test(separator ?? "") && !/^(?:19|20)\d{2}$/.test(year ?? "");
/**
 * The ways a date is commonly written; each gives the year (and enough to check it is a date).
 * `loose` forms are as often a number (an id, hours): they count as a date only next to a birth word.
 */
const DATE_FORMS: { source: string; year: (m: RegExpExecArray) => string | null; loose?: (m: RegExpExecArray) => boolean }[] = [
  // 01/02/1990, 1/2/90, 02.01.1990, 01-02-1990, 01 02 1990 (one separator throughout; month or day first: only the year matters)
  {
    source: String.raw`(\d{1,2})([/.\-]|\s{1,2})(\d{1,2})\2${YEAR}${TIME}`,
    year: (m) => (dayOk(m[1]) && dayOk(m[3]) && (monthOk(m[1]) || monthOk(m[3])) ? m[4]! : null),
    loose: (m) => shortSpaced(m[2], m[4]),
  },
  // 1990/01/02, 1990-01-02, 1990 01 02, 1990-01-02T00:00:00Z
  { source: String.raw`(\d{4})([/.\-]|\s{1,2})(\d{1,2})\2(\d{1,2})${TIME}`, year: (m) => (monthOk(m[3]) && dayOk(m[4]) ? m[1]! : null), loose: (m) => shortSpaced(m[2], m[1]) },
  // 19900102, and 01021990 (month or day first): as often an id, so only next to a birth word
  { source: String.raw`((?:19|20)\d{2})(\d{2})(\d{2})`, year: (m) => (monthOk(m[2]) && dayOk(m[3]) ? m[1]! : null), loose: () => true },
  { source: String.raw`(\d{2})(\d{2})((?:19|20)\d{2})`, year: (m) => (dayOk(m[1]) && dayOk(m[2]) && (monthOk(m[1]) || monthOk(m[2])) ? m[3]! : null), loose: () => true },
  // 2 Jan 1990, 02-Jan-1990, 2 de enero de 1990, 2 janvier 1990, 2. Januar 1990, Tue, 02 Jan 1990 00:00:00 GMT
  { source: String.raw`${WEEKDAY}${DAY}${DSEP}{0,3}(?:de\s{1,3})?${NAME}[\s\-/.,]{0,3}(?:de\s{1,3})?${YEAR}${TIME}`, year: (m) => (isMonth(m[2]) && dayOk(m[1]) ? m[3]! : null) },
  // Jan 2, 1990; January 2 1990; Jan-02-1990; Jan 2 '90; Tue Jan 02 1990 — not a month and year
  // alone ("May 2026"), nor a range of days ("Oct 5-11")
  { source: String.raw`${WEEKDAY}${NAME}${DSEP}{0,3}${DAY}(?:,\s{0,3}|\s{1,3}|[/.]|-(?=\d{4}))${YEAR}${TIME}`, year: (m) => (isMonth(m[1]) && dayOk(m[2]) ? m[3]! : null) },
  // 1990-Jan-02, 1990 Jan 2
  { source: String.raw`(\d{4})${DSEP}{1,3}${NAME}${DSEP}{0,3}${DAY}${TIME}`, year: (m) => (isMonth(m[2]) && dayOk(m[3]) ? m[1]! : null) },
  // 1990年1月2日
  { source: String.raw`(\d{4})\s{0,2}年\s{0,2}(\d{1,2})\s{0,2}月\s{0,2}(\d{1,2})\s{0,2}日`, year: (m) => (monthOk(m[2]) && dayOk(m[3]) ? m[1]! : null) },
];
const WHOLE = DATE_FORMS.map((f) => ({ re: new RegExp(`^${f.source}$`, "i"), year: f.year, loose: f.loose }));
const INSIDE = DATE_FORMS.map((f) => ({ re: new RegExp(String.raw`(?<![\da-zñ])${f.source}(?![\da-zñ])`, "gi"), year: f.year }));
/** A date starting exactly where the search is put (`lastIndex`), for dates right after a label. */
const AT = DATE_FORMS.map((f) => ({ re: new RegExp(String.raw`${f.source}(?![\da-zñ])`, "iy"), year: f.year }));
/** A cell longer than this is not a date (and is not run through the whole-cell patterns). */
const MAX_DATE_CELL = 120;

/** A two-digit year after this year's is last century ("01/02/90" is 1990), for finding birth dates only. */
function fullYear(text: string, thisYear: number): number {
  if (text.length === 4) return Number(text);
  const yy = Number(text);
  return yy > thisYear % 100 ? 1900 + yy : 2000 + yy;
}

/**
 * The year of a cell that is a date, however it is written; null when it is not one. An 8-digit
 * number or short numbers with spaces are a date only next to a birth word (`nearBirthWord`).
 */
function dateYear(text: string, thisYear: number, nearBirthWord = false): number | null {
  const t = text.normalize("NFKC").trim().toLowerCase();
  if (t.length > MAX_DATE_CELL) return null;
  for (const form of WHOLE) {
    const m = form.re.exec(t);
    const y = m && (nearBirthWord || !form.loose?.(m)) ? form.year(m) : null;
    if (y) return fullYear(y, thisYear);
  }
  return null;
}

/** The years of the dates written anywhere in a text. */
function yearsInside(text: string, thisYear: number): number[] {
  const t = text.normalize("NFKC").toLowerCase();
  return INSIDE.flatMap((form) => [...t.matchAll(form.re)].flatMap((m) => {
    const y = form.year(m);
    return y ? [fullYear(y, thisYear)] : [];
  }));
}

/** Words that say a date nearby is a birth date ("Geb.-Nr.", a building number, is not one). */
const BIRTH_WORDS = String.raw`d\.?\s?o\.?\s?b(?![a-z])|born(?![a-z])|birth[a-z]*|b['’\-]?day(?![a-z])|b-?date(?![a-z])|f\.?\s?nac|f\.\s?n\.(?![a-z])|nac(?![a-zñ])|nac(?:id[oa]s?|i[oó]|imiento)|cumplea[a-zñ]*|naissance|naiss\.|n[ée]e?\s{1,3}le(?![a-z])|geboren|geburt[a-z]*|geb\.(?![\s\-]{0,3}nr)`;
/** Headings that say a column holds dates, where an 8-digit number is one ("Fecha", "Data de nascimento", "Geboortedatum"). */
const DATE_WORD = /(?<![a-z])(?:date|fecha|data|datum|dt)|nascimento|nascita|geboorte|urodzeni/i;
const BIRTH_WORD = new RegExp(String.raw`(?<![a-zñ])(?:${BIRTH_WORDS})`, "i");
/** Letters, accented ones included, on lowercased text (so "Gebühr" is one word). */
const LETTER = "a-zà-öø-ÿ";
/**
 * A birth word, or a short label that means a birth date only with a date right after it ("FN",
 * "YOB" with a year alone, "geb" without its dot), then the spaces or marks before the date. Also
 * finds a date written against its label ("dob01/02/1990").
 */
const LABEL = new RegExp(String.raw`(?<![${LETTER}\d])(?:${BIRTH_WORDS}|(?<yob>y\.?\s?o\.?\s?b\.?)|(?<ambiguous>f\.?\s?n\.?|geb\.?(?:\s{1,3}am)?))(?![${LETTER}])[\s:#=.,\-]{0,3}`, "gi");
const YEAR_ALONE = /(?:19|20)\d{2}(?!\d)/y;
/** Every date has a digit within its first 31 characters (a weekday, a month name and spaces come first at most). */
const DIGIT_SOON = /\D{0,30}\d/y;

/**
 * True when a date comes right after a birth word or label in the text. "FN" and "geb" have other
 * meanings ("Fn." a footnote): after them only a date old enough to be a birth date counts.
 */
function labelledDate(text: string, thisYear: number): boolean {
  const t = text.normalize("NFKC").toLowerCase();
  for (const label of t.matchAll(LABEL)) {
    const at = label.index + label[0].length;
    DIGIT_SOON.lastIndex = at;
    if (!DIGIT_SOON.test(t)) continue;
    YEAR_ALONE.lastIndex = at;
    if (label.groups?.yob && YEAR_ALONE.test(t)) return true;
    for (const form of AT) {
      form.re.lastIndex = at;
      const m = form.re.exec(t);
      const y = m ? form.year(m) : null;
      if (y && (!label.groups?.ambiguous || fullYear(y, thisYear) <= thisYear - 14)) return true;
    }
  }
  return false;
}

/** A cell that gives a birth date: a date anywhere beside a birth word, or right after a label. */
const birthDateIn = (text: string, thisYear: number) => (BIRTH_WORD.test(text) && yearsInside(text, thisYear).length > 0) || labelledDate(text, thisYear);

/**
 * Most cells with digits are dates (next to the heading's birth word, an 8-digit number counts) and
 * most of those are old. Placeholders without digits ("n/a", "unknown") neither hide a birth-date
 * column nor make an id column look like one.
 */
function birthDates(heading: string, values: string[], thisYear: number): boolean {
  if (values.some((v) => birthDateIn(v, thisYear))) return true;
  const h = heading.normalize("NFKC");
  const nearDateWord = BIRTH_WORD.test(h) || DATE_WORD.test(h);
  const years = values.map((v) => dateYear(v, thisYear, nearDateWord)).filter((y): y is number => y !== null);
  const withDigits = values.filter((v) => /\d/.test(v)).length;
  // An id column (most cells with digits are bare 8-digit numbers) is not taken for dates by a stray one.
  const ids = values.filter((v) => /^\d{8}$/.test(v)).length;
  const old = years.filter((y) => y <= thisYear - 14).length;
  return old > 0 && old * 2 > years.length && (nearDateWord || ids * 2 <= withDigits);
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

/** The "4" that names a column of last four digits ("SSN Last 4", "SSN4", "L4"): part of its name, not a value. */
const NAMES_LAST_FOUR = /(?:last|(?<![a-z])l|ssn)[\s_\-]?$/i;

/**
 * A removed column's heading with anything shaped like an SSN or a date hidden, and every other
 * digit too ("DOB 1/2" → "DOB •••/•••"): the column is gone, so nothing in its heading needs them.
 */
function masked(heading: string): string {
  let out = heading.normalize("NFKC").slice(0, 300).replace(new RegExp(SSN_SOURCE, "g"), "•••");
  for (const form of INSIDE) out = out.replace(form.re, (...m) => (form.year(m as unknown as RegExpExecArray) ? "•••" : m[0]));
  return out.replace(/\d+/g, (digits: string, at: number, all: string) => (digits === "4" && NAMES_LAST_FOUR.test(all.slice(Math.max(0, at - 5), at)) ? digits : "•••")).slice(0, 100);
}

export type RemovedColumn = { column: string; heading: string; reason: "heading" | "ssn_values" | "birth_dates" };

/**
 * True when a heading is shaped like an SSN or is a date: the first row is a record, not column
 * names, and the file is refused before anything is kept.
 */
export function headingProblem(header: string[], today: string): boolean {
  const thisYear = Number(today.slice(0, 4));
  // An 8-digit number old enough to be a birth date is a record too ("19900102"; not "10192026").
  return header.some((h) => {
    if (ssnIn(h) || dateYear(h, thisYear) !== null) return true;
    const y = /^\s*\d{8}\s*$/.test(h) ? dateYear(h, thisYear, true) : null;
    return y !== null && y <= thisYear - 14;
  });
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
        : !opts.dateColumns?.includes(h) && birthDates(h, column, thisYear)
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

/**
 * A filename is stored with any SSN-shaped part hidden, and any birth date: a date 14 or more years
 * old, or any date when the name has a birth word in it. An ordinary date ("placements 2026-10-19") stays.
 */
export function safeFilename(name: string, today: string): string {
  const thisYear = Number(today.slice(0, 4));
  const birth = BIRTH_WORD.test(name);
  let out = name.normalize("NFKC").slice(0, 300).replace(new RegExp(SSN_SOURCE, "g"), "•••");
  for (const form of INSIDE) {
    out = out.replace(form.re, (...m) => {
      const y = form.year(m as unknown as RegExpExecArray);
      return y && (birth || fullYear(y, thisYear) <= thisYear - 14) ? "•••" : m[0];
    });
  }
  // A name with a birth word keeps none of its numbers ("dob01-02-1990.csv": the date sits against the word).
  if (birth) out = out.replace(/\d+/g, "•••");
  return out.slice(0, 200);
}
