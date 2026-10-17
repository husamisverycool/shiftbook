/**
 * The payroll systems a payroll file can be made for (SPEC §13; slice f, decisions F1–F8), what each
 * one's file can carry, and the rules for the settings that go with it: the system and its options,
 * the system's code for each kind of pay, and each worker's id there. Pure: the settings page, the
 * settings service, the run and the exporters all check with the same rules.
 *
 * Research with sources: docs/research/payroll-formats-slice-f.md.
 */
import { idHoldsSsn } from "../lib/ssn-text";
import type { EarningType, Fraction } from "@shiftbook/rules";
import type { PayrollIds } from "../server/db/schema";
import { badCharacter } from "./lines";

export const EXPORT_FORMATS = ["gusto_hours_csv", "qbd_iif", "qbo_time_csv", "adp_wfn_paydata", "adp_run_csv", "paychex_flex_csv", "paylocity_time_csv", "spreadsheet_csv"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export type PayrollSystem = keyof PayrollIds;

/** Where each format finds the worker: the worker's id in that system. */
export const SYSTEM_OF: Record<ExportFormat, PayrollSystem> = {
  gusto_hours_csv: "gusto",
  qbd_iif: "qbd",
  qbo_time_csv: "qbo",
  adp_wfn_paydata: "adp_wfn",
  adp_run_csv: "adp_run",
  paychex_flex_csv: "paychex",
  paylocity_time_csv: "paylocity",
  spreadsheet_csv: "spreadsheet",
};

/** Names used in the file's notes and refusals (English, like the files). */
export const SYSTEM_NAME: Record<PayrollSystem, string> = {
  gusto: "Gusto",
  qbd: "QuickBooks Desktop",
  qbo: "QuickBooks Online",
  adp_wfn: "ADP Workforce Now",
  adp_run: "RUN Powered by ADP",
  paychex: "Paychex Flex",
  paylocity: "Paylocity",
  spreadsheet: "the spreadsheet's receiver",
};

/** How refusals name each system's file. */
export const FILE_OF: Record<PayrollSystem, string> = {
  gusto: "the Gusto file",
  qbd: "the QuickBooks Desktop file",
  qbo: "the QuickBooks Online file",
  adp_wfn: "the ADP Workforce Now file",
  adp_run: "the RUN Powered by ADP file",
  paychex: "the Paychex Flex file",
  paylocity: "the Paylocity file",
  spreadsheet: "the spreadsheet",
};

/** One person per id: ADP's file number is a number ("000123" is 123); other ids ignore case. */
export function idKey(system: PayrollSystem, id: string): string {
  return system === "adp_wfn" && /^\d+$/.test(id) ? String(Number(id)) : id.toLowerCase();
}

/** What the worker's id is called in each system (the run's "no id" check and the refusals). */
export const WORKER_ID_NAME: Record<PayrollSystem, string> = {
  gusto: "Gusto employee id",
  qbd: "QuickBooks Desktop employee name",
  qbo: "QuickBooks Online display name",
  adp_wfn: "ADP file number",
  adp_run: "RUN employee id",
  paychex: "Paychex worker id",
  paylocity: "Paylocity employee id",
  spreadsheet: "spreadsheet worker id",
};

// ---------- the system and its options ----------

export const DELIMITERS = { comma: ",", tab: "\t", semicolon: ";", pipe: "|" } as const;
export type Delimiter = keyof typeof DELIMITERS;
export const DATE_FORMATS = ["YYYY-MM-DD", "MM/DD/YYYY", "MM/DD/YY"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
/** The fields a spreadsheet column can hold (never an SSN: it is not one of them). */
export const SPREADSHEET_FIELDS = ["worker_id", "last_name", "first_name", "period_start", "period_end", "week_start", "week_end", "earning_code", "hours", "rate", "amount", "fixed"] as const;
export type SpreadsheetField = (typeof SPREADSHEET_FIELDS)[number];

export interface SpreadsheetColumn {
  field: SpreadsheetField;
  /** The column's header text in the file. */
  header: string;
  /** Fixed text written in every row (field "fixed" only). */
  value?: string;
}

export interface SpreadsheetLayout {
  /** The file's name; {start} and {end} become the pay period's dates. */
  fileName: string;
  delimiter: Delimiter;
  header: boolean;
  dateFormat: DateFormat;
  columns: SpreadsheetColumn[];
}

export const DEFAULT_LAYOUT: SpreadsheetLayout = {
  fileName: "payroll-{start}-to-{end}.csv",
  delimiter: "comma",
  header: true,
  dateFormat: "MM/DD/YYYY",
  columns: [
    { field: "worker_id", header: "Worker ID" },
    { field: "last_name", header: "Last name" },
    { field: "first_name", header: "First name" },
    { field: "week_end", header: "Week ending" },
    { field: "earning_code", header: "Earning code" },
    { field: "hours", header: "Hours" },
    { field: "rate", header: "Rate" },
    { field: "amount", header: "Amount" },
  ],
};

export type QbdVersion = "2022_or_later" | "2021_or_earlier";

/** The payroll system in use and what its file needs (decision F1: one at a time). */
export type PayrollTarget =
  | { format: "gusto_hours_csv" }
  | { format: "qbd_iif"; version: "2022_or_later" }
  | { format: "qbd_iif"; version: "2021_or_earlier"; companyName: string; companyCreateTime: string }
  | { format: "qbo_time_csv"; customer: string }
  | { format: "adp_wfn_paydata"; companyCode: string }
  | { format: "adp_run_csv"; companyCode: string }
  | { format: "paychex_flex_csv"; clientId: string }
  | { format: "paylocity_time_csv" }
  | { format: "spreadsheet_csv"; layout: SpreadsheetLayout };

/** A field of the settings and what is wrong with it (shown under the field). */
export interface SettingProblem {
  field: string;
  /** What rule it breaks, for the page to say in the person's language. */
  rule: string;
  message: string;
}

const controlCharacter = (text: string) => [...text].some((ch) => ch.codePointAt(0)! < 32 || ch.codePointAt(0) === 127);
const isTrimmed = (text: string) => text.trim() === text;

/** ADP Workforce Now's file name: PRcccEPI.csv, a two-character code padded with "_" (research §3.2). */
export const adpWfnFileName = (companyCode: string) => `PR${companyCode.length === 2 ? `${companyCode}_` : companyCode}EPI.csv`;

/** Everything wrong with a payroll target (empty when it can be saved). */
export function targetProblems(value: unknown): SettingProblem[] {
  const t = value as Partial<Record<string, unknown>> | null;
  if (!t || typeof t !== "object" || !EXPORT_FORMATS.includes(t.format as ExportFormat)) return [{ field: "format", rule: "choose_system", message: "Choose a payroll system." }];
  const text = (key: string) => (typeof t[key] === "string" ? (t[key] as string) : "");
  switch (t.format as ExportFormat) {
    case "gusto_hours_csv":
      return [];
    case "qbd_iif": {
      if (t.version === "2022_or_later") return [];
      if (t.version !== "2021_or_earlier") return [{ field: "version", rule: "qbd_version", message: "Choose the QuickBooks Desktop version." }];
      const problems: SettingProblem[] = [];
      const name = text("companyName");
      if (!name || !isTrimmed(name) || badCharacter(name)) problems.push({ field: "companyName", rule: "company_name", message: "The company name exactly as QuickBooks shows it, in plain letters, digits and punctuation." });
      if (!/^\d{1,12}$/.test(text("companyCreateTime"))) problems.push({ field: "companyCreateTime", rule: "company_file_number", message: "The number on the second line of QuickBooks' Timer Lists export (digits only)." });
      return problems;
    }
    case "qbo_time_csv": {
      const customer = text("customer");
      return !customer || !isTrimmed(customer) || controlCharacter(customer) || customer.length > 100 ? [{ field: "customer", rule: "qbo_customer", message: "A customer that exists in QuickBooks Online, up to 100 characters." }] : [];
    }
    case "adp_wfn_paydata":
      return /^[A-Z0-9]{2,3}$/.test(text("companyCode")) ? [] : [{ field: "companyCode", rule: "adp_company_code", message: "ADP's company code: 2 or 3 capital letters or digits." }];
    case "adp_run_csv":
      return /^[A-Za-z0-9]{1,10}$/.test(text("companyCode")) ? [] : [{ field: "companyCode", rule: "run_company_code", message: "RUN's company code: up to 10 letters or digits." }];
    case "paychex_flex_csv":
      // Paychex SPI: Client ID, up to 8 characters (research slice f §5.1).
      return /^[A-Za-z0-9]{1,8}$/.test(text("clientId")) ? [] : [{ field: "clientId", rule: "paychex_client_id", message: "Paychex's client id: up to 8 letters or digits." }];
    case "paylocity_time_csv":
      return [];
    case "spreadsheet_csv":
      return layoutProblems(t.layout);
  }
}

/** Everything wrong with a spreadsheet layout. */
export function layoutProblems(value: unknown): SettingProblem[] {
  const l = value as Partial<SpreadsheetLayout> | null;
  if (!l || typeof l !== "object") return [{ field: "layout", rule: "layout", message: "Set up the spreadsheet's columns." }];
  const problems: SettingProblem[] = [];
  if (typeof l.fileName !== "string" || !/^[A-Za-z0-9._{}-]{1,80}\.(csv|txt)$/.test(l.fileName) || l.fileName.replace(/\{(start|end)\}/g, "").includes("{") || l.fileName.replace(/\{(start|end)\}/g, "").includes("}")) {
    problems.push({ field: "fileName", rule: "file_name", message: "A file name of letters, digits, dots, dashes and underscores ending in .csv or .txt; {start} and {end} become the period's dates." });
  }
  if (!l.delimiter || !(l.delimiter in DELIMITERS)) problems.push({ field: "delimiter", rule: "delimiter", message: "Choose a delimiter." });
  if (typeof l.header !== "boolean") problems.push({ field: "header", rule: "header_row", message: "Choose whether the file starts with a header row." });
  if (!DATE_FORMATS.includes(l.dateFormat as DateFormat)) problems.push({ field: "dateFormat", rule: "date_format", message: "Choose a date format." });
  const columns = Array.isArray(l.columns) ? l.columns : [];
  if (columns.length === 0 || columns.length > 30) problems.push({ field: "columns", rule: "columns_count", message: "Between 1 and 30 columns." });
  columns.forEach((c, i) => {
    if (!c || !SPREADSHEET_FIELDS.includes(c.field)) problems.push({ field: `columns.${i}`, rule: "column_field", message: "Choose what the column holds." });
    else if (typeof c.header !== "string" || c.header.length > 64 || controlCharacter(c.header) || (l.header === true && c.header.trim() === "")) problems.push({ field: `columns.${i}.header`, rule: "column_header", message: "A header of up to 64 characters." });
    else if (c.field === "fixed" && (typeof c.value !== "string" || c.value.length > 64 || controlCharacter(c.value))) problems.push({ field: `columns.${i}.value`, rule: "column_value", message: "Fixed text of up to 64 characters." });
  });
  const has = (field: SpreadsheetField) => columns.some((c) => c?.field === field);
  if (!has("worker_id")) problems.push({ field: "columns", rule: "needs_worker_id", message: "Include the worker id, so the receiver can match each row to a person." });
  if (!has("earning_code")) problems.push({ field: "columns", rule: "needs_code", message: "Include the earning code, so the receiver knows what each row pays." });
  if (!has("amount") && !(has("hours") && has("rate"))) problems.push({ field: "columns", rule: "needs_price", message: "Include the amount, or the hours and the rate, so the receiver can price every row." });
  return problems;
}

// ---------- the code for each kind of pay ----------

/** How a kind of pay travels in the file: hours (priced by the target) or dollars (paid as written). */
export type CarriedAs = "hours" | "dollars";

export interface EarningCode {
  /** The target's code (a payroll item name in QuickBooks Desktop; blank where the file has a fixed column). */
  code: string;
  as: CarriedAs;
  /** The multiple the target applies to hours, where the agency declares it (ADP Workforce Now). */
  factor?: Fraction;
}
export type CodeMap = Partial<Record<EarningType, EarningCode>>;

export interface KindRule {
  /** Hours: the file's fixed column, or a code the agency sets; the multiple the target applies. */
  hours?: { column?: string; factor: Fraction; declared?: boolean };
  /** Dollars: the file's fixed column, or a code the agency sets. */
  dollars?: { column?: string };
  /** When no code is set: "refused" (the run names the worker) or "own_code" (Granite's code, REG/OT/…). */
  blank: "refused" | "own_code" | "fixed";
}

export const EARNING_TYPES: readonly EarningType[] = ["REG", "OT", "DT", "MW_TRUEUP", "REPORTING_PAY", "HOL", "HOL_NOT_WORKED", "DIFF", "MEAL_PREMIUM", "REST_PREMIUM", "MIN_GUARANTEE", "BONUS", "BONUS_OT"];
const ONE: Fraction = { num: 1, den: 1 };
const HALF_AGAIN: Fraction = { num: 3, den: 2 };
const TWO: Fraction = { num: 2, den: 1 };
/** Premiums, guarantees, top-ups and bonuses: money, never extra hours worked. */
const MONEY_KINDS: readonly EarningType[] = ["MW_TRUEUP", "REPORTING_PAY", "HOL", "DIFF", "MEAL_PREMIUM", "REST_PREMIUM", "MIN_GUARANTEE", "BONUS", "BONUS_OT"];
const money = (column?: string): KindRule => ({ dollars: column ? { column } : {}, blank: "refused" });

/** What each format can carry, kind by kind (research §1.6, §2.2, §3.8, §4.5, §5.2). Missing kinds are never carried. */
export const KIND_RULES: Record<ExportFormat, Partial<Record<EarningType, KindRule>>> = {
  gusto_hours_csv: {
    REG: { hours: { column: "regular_hours", factor: ONE }, blank: "fixed" },
    OT: { hours: { column: "overtime_hours", factor: HALF_AGAIN }, blank: "fixed" },
    DT: { hours: { column: "double_overtime_hours", factor: TWO }, blank: "fixed" },
    BONUS: { dollars: { column: "bonus" }, blank: "refused" },
  },
  qbd_iif: {
    REG: { hours: { factor: ONE }, blank: "refused" },
    OT: { hours: { factor: HALF_AGAIN }, blank: "refused" },
    DT: { hours: { factor: TWO }, blank: "refused" },
    HOL_NOT_WORKED: { hours: { factor: ONE }, blank: "refused" },
  },
  qbo_time_csv: {
    REG: { hours: { column: "Hours", factor: ONE }, blank: "fixed" },
  },
  adp_wfn_paydata: {
    REG: { hours: { column: "Reg Hours", factor: ONE }, blank: "fixed" },
    OT: { hours: { column: "O/T Hours", factor: HALF_AGAIN, declared: true }, blank: "fixed" },
    DT: { hours: { factor: TWO, declared: true }, blank: "refused" },
    HOL_NOT_WORKED: { hours: { factor: ONE, declared: true }, dollars: {}, blank: "refused" },
    ...Object.fromEntries(MONEY_KINDS.map((k) => [k, money()])),
  },
  adp_run_csv: {
    REG: { hours: { factor: ONE }, dollars: {}, blank: "refused" },
    OT: { hours: { factor: HALF_AGAIN }, dollars: {}, blank: "refused" },
    DT: { hours: { factor: TWO }, dollars: {}, blank: "refused" },
    HOL_NOT_WORKED: { hours: { factor: ONE }, dollars: {}, blank: "refused" },
    ...Object.fromEntries(MONEY_KINDS.map((k) => [k, money()])),
  },
  // Paychex Flex and Paylocity (decision 0040): every kind as hours at the written rate or as dollars,
  // always under a code the agency sets — their codes are the company's own (case-sensitive).
  paychex_flex_csv: {
    ...Object.fromEntries(EARNING_TYPES.filter((k) => k !== "BONUS").map((k) => [k, { hours: { factor: ONE }, dollars: {}, blank: "refused" } satisfies KindRule])),
    BONUS: { dollars: {}, blank: "refused" },
  },
  paylocity_time_csv: {
    ...Object.fromEntries(EARNING_TYPES.filter((k) => k !== "BONUS").map((k) => [k, { hours: { factor: ONE }, dollars: {}, blank: "refused" } satisfies KindRule])),
    BONUS: { dollars: {}, blank: "refused" },
  },
  spreadsheet_csv: {
    ...Object.fromEntries(EARNING_TYPES.filter((k) => k !== "BONUS").map((k) => [k, { hours: { factor: ONE }, dollars: {}, blank: "own_code" } satisfies KindRule])),
    BONUS: { dollars: {}, blank: "own_code" },
  },
};

/** How a kind of pay travels when no code says otherwise: money kinds as dollars, time as hours. */
export function defaultAs(format: ExportFormat, kind: EarningType): CarriedAs {
  const rule = KIND_RULES[format][kind];
  return rule?.hours && (!rule.dollars || !MONEY_KINDS.includes(kind)) ? "hours" : "dollars";
}

/** The map a new agency (or a newly chosen system) starts with: fixed columns filled, codes blank. */
export function defaultCodes(format: ExportFormat): CodeMap {
  const out: CodeMap = {};
  for (const [kind, rule] of Object.entries(KIND_RULES[format]) as [EarningType, KindRule][]) {
    if (rule.hours?.column) out[kind] = { code: rule.hours.column, as: "hours", ...(rule.hours.declared ? { factor: rule.hours.factor } : {}) };
    else if (format === "spreadsheet_csv") out[kind] = { code: "", as: defaultAs(format, kind) };
    else if (format === "adp_wfn_paydata" && rule.hours?.declared && !rule.dollars) out[kind] = { code: "", as: "hours", factor: rule.hours.factor };
  }
  return out;
}

const positiveFraction = (f: unknown): f is Fraction => {
  const x = f as Fraction | null;
  return !!x && Number.isSafeInteger(x.num) && Number.isSafeInteger(x.den) && x.num > 0 && x.den > 0 && x.num <= 100 * x.den;
};

/** The code each format accepts (research §1.2, §3.4, §4.3). */
function codeProblem(format: ExportFormat, code: string): string | null {
  switch (format) {
    case "qbd_iif":
      return isTrimmed(code) && !badCharacter(code) && code.length <= 31 ? null : "The payroll item's name exactly as QuickBooks shows it (up to 31 plain characters).";
    case "adp_wfn_paydata":
      // Without expanded fields: 1–2 letters, or a number 0–79 but 40, 50, 60, 61; with them, 3 (research §3.4).
      return /^[A-Z]{1,2}$/.test(code) || (/^\d{1,2}$/.test(code) && Number(code) <= 79 && ![40, 50, 60, 61].includes(Number(code))) || /^[A-Z0-9]{3}$/.test(code)
        ? null
        : "ADP's code: 1 or 2 letters, a number from 0 to 79 (not 40, 50, 60 or 61), or 3 letters and digits with ADP's expanded fields.";
    case "adp_run_csv":
      return /^[A-Za-z0-9_-]{1,10}$/.test(code) ? null : "RUN's earnings code: up to 10 letters, digits, dashes or underscores.";
    case "paychex_flex_csv":
      // SPI's Pay Component: up to 20 characters, matched case for case.
      return code.length <= 20 && isTrimmed(code) && !controlCharacter(code) && !code.includes(",") ? null : "The pay component exactly as Paychex shows it, up to 20 characters, no commas.";
    case "paylocity_time_csv":
      return /^[A-Za-z0-9_-]{1,10}$/.test(code) ? null : "Paylocity's earning code (detCode) exactly as it is set up: up to 10 letters, digits, dashes or underscores.";
    case "spreadsheet_csv":
      return code.length <= 20 && isTrimmed(code) && !controlCharacter(code) ? null : "Up to 20 characters.";
    default:
      return "This system's file has fixed columns.";
  }
}

/** Everything wrong with a code map for a format (empty when it can be saved). */
export function codeMapProblems(format: ExportFormat, value: unknown): SettingProblem[] {
  if (!value || typeof value !== "object") return [{ field: "codes", rule: "set_codes", message: "Set the codes." }];
  const map = value as Record<string, Partial<EarningCode> | undefined>;
  const rules = KIND_RULES[format];
  const problems: SettingProblem[] = [];
  const used = new Map<string, { as: CarriedAs; factor?: Fraction }>();
  for (const [kind, entry] of Object.entries(map)) {
    if (!entry) continue;
    const rule = rules[kind as EarningType];
    if (!rule) {
      problems.push({ field: `codes.${kind}`, rule: "not_carried", message: "This system's file cannot carry this kind of pay." });
      continue;
    }
    const as = entry.as;
    if (entry.code !== undefined && typeof entry.code !== "string") {
      problems.push({ field: `codes.${kind}`, rule: "code_text", message: "A code is text." });
      continue;
    }
    if (as !== "hours" && as !== "dollars") {
      problems.push({ field: `codes.${kind}`, rule: "choose_as", message: "Choose hours or dollars." });
      continue;
    }
    const way = as === "hours" ? rule.hours : rule.dollars;
    if (!way) {
      problems.push({ field: `codes.${kind}`, rule: as === "hours" ? "dollars_only" : "hours_only", message: as === "hours" ? "This system takes this kind of pay in dollars only." : "This system takes this kind of pay as hours only." });
      continue;
    }
    const code = typeof entry.code === "string" ? entry.code : "";
    if (way.column !== undefined) {
      if (code !== way.column) problems.push({ field: `codes.${kind}`, rule: "fixed_column", message: `This kind of pay goes in the file's "${way.column}" column.` });
    } else if (code !== "") {
      const problem = codeProblem(format, code);
      if (problem) problems.push({ field: `codes.${kind}`, rule: `code_form_${format}`, message: problem });
    }
    if (as === "hours" && rule.hours?.declared && !positiveFraction(entry.factor)) problems.push({ field: `codes.${kind}.factor`, rule: "factor_needed", message: "The multiple the system applies to these hours (for example 1.5)." });
    if (as === "hours" && !rule.hours?.declared && entry.factor !== undefined) problems.push({ field: `codes.${kind}.factor`, rule: "factor_fixed", message: "This system's multiple is fixed." });
    // One code means one thing in the file: the same code for two kinds must travel the same way.
    if (code !== "" && way.column === undefined) {
      const factor = as === "hours" ? (rule.hours?.declared ? entry.factor : rule.hours?.factor) : undefined;
      const other = used.get(code);
      if (other && (other.as !== as || (factor && other.factor && BigInt(factor.num) * BigInt(other.factor.den) !== BigInt(other.factor.num) * BigInt(factor.den)))) {
        problems.push({ field: `codes.${kind}`, rule: "code_reused", message: `"${code}" is already used for another kind of pay carried differently.` });
      }
      used.set(code, { as: as as CarriedAs, ...(factor ? { factor } : {}) });
    }
  }
  return problems;
}

// ---------- the worker's id in the system ----------

/** What is wrong with a worker's id (and Gusto's job title), or null. */
export function workerIdProblem(system: PayrollSystem, id: string, title?: string): { field: "id" | "title"; rule: string; message: string } | null {
  if (id === "" || !isTrimmed(id)) return { field: "id", rule: "id_spaces", message: "Enter the id with no spaces around it." };
  // The id goes into the payroll file and onto the roster: never an SSN (SPEC §21).
  if (idHoldsSsn(id)) return { field: "id", rule: "no_ssn", message: "An SSN can't be a payroll number: it would go into the payroll file." };
  switch (system) {
    case "gusto":
      if (id.length > 64 || controlCharacter(id)) return { field: "id", rule: "gusto_id", message: "Gusto's employee id, up to 64 characters." };
      if (!title || !isTrimmed(title) || controlCharacter(title)) return { field: "title", rule: "gusto_title", message: "The job title as Gusto shows it; Gusto matches hours to a job." };
      return null;
    case "qbd":
      return !badCharacter(id) && id.length <= 41 ? null : { field: "id", rule: "qbd_name", message: "The employee's name exactly as QuickBooks shows it, in plain letters, digits and punctuation (up to 41)." };
    case "qbo":
      return !controlCharacter(id) && id.length <= 100 ? null : { field: "id", rule: "qbo_name", message: "The display name exactly as QuickBooks Online shows it (up to 100 characters)." };
    case "adp_wfn":
      return /^\d{1,6}$/.test(id) && Number(id) >= 51 ? null : { field: "id", rule: "adp_file_number", message: "ADP's file number: digits, from 51 to 999999." };
    case "adp_run":
      return /^[A-Za-z0-9-]{1,15}$/.test(id) ? null : { field: "id", rule: "run_employee_id", message: "RUN's employee id: up to 15 letters, digits or dashes." };
    case "paychex":
      return /^[A-Za-z0-9]{1,10}$/.test(id) ? null : { field: "id", rule: "paychex_worker_id", message: "Paychex's worker id: up to 10 letters or digits." };
    case "paylocity":
      return /^[A-Za-z0-9]{1,10}$/.test(id) ? null : { field: "id", rule: "paylocity_id", message: "Paylocity's employee id: up to 10 letters or digits." };
    case "spreadsheet":
      return id.length <= 50 && !controlCharacter(id) ? null : { field: "id", rule: "sheet_id", message: "Up to 50 characters." };
  }
}
