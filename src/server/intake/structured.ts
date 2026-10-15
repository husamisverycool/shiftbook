/**
 * Structured time files — time-clock exports (CSV/XLSX) and VMS exports — read through saved
 * column-mapping profiles (SPEC §6). Deterministic: no model involved.
 */
import ExcelJS from "exceljs";
import { readCsv } from "../../exports/csv";
import { parseClockText, parseDecimalHours, parseIsoDateText, parseUsDate, parseWholeMinutes } from "./parse";
import { BUILT_IN_PROFILES, detectProfile, normalizeHeader, type MappingProfile, type TimeclockProfile, type VmsProfile } from "./profiles";
import { reading, type ParsedDocument, type RawEntry } from "./types";

export class UnrecognisedFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnrecognisedFileError";
  }
}

/** A file's header and rows, with each row's own number in the spreadsheet (blank rows count). */
export type Table = { header: string[]; rows: string[][]; rowNumbers: number[] };

const blank = (r: string[]) => r.every((c) => c.trim() === "");

function table(numbered: { n: number; values: string[] }[]): Table {
  const [header, ...rows] = numbered;
  return { header: header?.values ?? [], rows: rows.map((r) => r.values), rowNumbers: rows.map((r) => r.n) };
}

export function tableFromCsv(bytes: Uint8Array): Table {
  const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "");
  return table(readCsv(text).flatMap((values, i) => (blank(values) ? [] : [{ n: i + 1, values }])));
}

export interface CellOptions {
  /** "iso" writes date cells as 2026-10-05, which cannot be read with day and month swapped. */
  dates?: "us" | "iso";
  /** The cell's number format: a zero-padded one ("00000", Excel's SSN format) keeps its leading zeros. */
  numFmt?: string;
}

/** A whole number in a format made only of zeros and dashes or spaces, as Excel shows it. */
function padded(n: number, numFmt: string | undefined): string | null {
  const format = (numFmt ?? "").replace(/["\\]/g, "");
  if (!/^0+(?:[- ]0+)*$/.test(format) || !Number.isSafeInteger(n) || n < 0) return null;
  const digits = String(n).padStart(format.replace(/[- ]/g, "").length, "0").split("");
  let out = "";
  for (let i = format.length - 1; i >= 0; i--) out = (format[i] === "0" ? digits.pop() : format[i]) + out;
  return digits.join("") + out;
}

/**
 * An Excel cell as the text a person sees: dates as MM/DD/YYYY (or ISO), a formula's result, rich
 * text joined, errors blank, and zero-padded numbers with their zeros.
 */
export function cellText(v: unknown, opts: CellOptions = {}): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const iso = v.toISOString().slice(0, 10);
    return opts.dates === "iso" ? iso : `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
  }
  if (typeof v === "number") return padded(v, opts.numFmt) ?? String(v);
  if (typeof v === "object") {
    if ("result" in v) return cellText((v as { result: unknown }).result, opts);
    if ("richText" in v) return ((v as { richText: { text?: string }[] }).richText ?? []).map((r) => r.text ?? "").join("");
    if ("text" in v) return cellText((v as { text: unknown }).text, opts);
    if ("error" in v) return "";
    return "";
  }
  return String(v);
}

export async function tableFromXlsx(bytes: Uint8Array, opts: Pick<CellOptions, "dates"> = {}): Promise<Table> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { header: [], rows: [], rowNumbers: [] };
  const numbered: { n: number; values: string[] }[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, n) => {
    // row.values is sparse (an empty cell is a hole): Array.from fills holes so every column is there.
    const values = Array.from((row.values as unknown[]).slice(1), (v, i) => cellText(v ?? null, { dates: opts.dates, numFmt: row.getCell(i + 1).numFmt }));
    if (!blank(values)) numbered.push({ n, values });
  });
  return table(numbered);
}

const column = (table: Table, name: string) => table.header.findIndex((h) => normalizeHeader(h) === normalizeHeader(name));
const parseDate = (text: string, format: MappingProfile["dateFormat"]) => (format === "MM/DD/YYYY" ? parseUsDate(text) : parseIsoDateText(text));

function readTimeclock(table: Table, profile: TimeclockProfile, kind: "timeclock_csv" | "timeclock_xlsx"): ParsedDocument {
  const c = profile.columns;
  const idx = {
    externalId: c.externalId ? column(table, c.externalId) : -1,
    name: column(table, c.name),
    date: column(table, c.date),
    in: column(table, c.in),
    out: column(table, c.out),
    breakMinutes: column(table, c.breakMinutes),
    totalHours: c.totalHours ? column(table, c.totalHours) : -1,
  };
  const entries: RawEntry[] = table.rows.map((row, i) => {
    const rowNumber = table.rowNumbers[i] ?? i + 2;
    const cell = (j: number) => (j >= 0 ? (row[j] ?? "").trim() : "");
    const src = (name: string) => ({ kind: "cell" as const, row: rowNumber, column: name });
    const checks: string[] = [];
    const date = parseDate(cell(idx.date), profile.dateFormat);
    const inR = parseClockText(cell(idx.in));
    const outR = parseClockText(cell(idx.out));
    const brk = parseWholeMinutes(cell(idx.breakMinutes) || "0");
    const total = idx.totalHours >= 0 ? parseDecimalHours(cell(idx.totalHours)) : null;
    if (!date) checks.push("unreadable:date");
    if (!inR) checks.push("unreadable:in");
    if (!outR) checks.push("unreadable:out");
    if (brk === null) checks.push("unreadable:break");
    return {
      rowIndex: i,
      worker: reading(cell(idx.name), cell(idx.name) || null, src(c.name)),
      date: reading(cell(idx.date), date, src(c.date)),
      in: reading(cell(idx.in), inR?.minute ?? null, src(c.in)),
      out: reading(cell(idx.out), outR ? (outR.minute === 0 ? 1440 : outR.minute) : null, src(c.out)),
      break: reading(cell(idx.breakMinutes), brk, src(c.breakMinutes)),
      total: c.totalHours ? reading(cell(idx.totalHours), total, src(c.totalHours)) : null,
      externalId: idx.externalId >= 0 ? cell(idx.externalId) || null : null,
      checks,
    };
  });
  return { kind, profileKey: profile.key, clientHint: null, entries, notes: [] };
}

function readVms(table: Table, profile: VmsProfile): ParsedDocument {
  const c = profile.columns;
  const idx = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ? column(table, v) : -1])) as Record<keyof VmsProfile["columns"], number>;
  const included = new Set(profile.includeStatuses.map((s) => s.toLowerCase()));
  const skipped = new Map<string, { status: string; rows: number }>();
  const groups = new Map<string, { firstRow: number; sheets: Set<string>; minutes: number; texts: string[]; date: string | null; dateText: string; name: string; externalId: string; unreadable: boolean }>();
  let clientHint: string | null = null;

  table.rows.forEach((row, i) => {
    const cell = (j: number) => (j >= 0 ? (row[j] ?? "").trim() : "");
    const status = cell(idx.status);
    const sheet = cell(idx.timeSheetId);
    if (!included.has(status.toLowerCase())) {
      const s = skipped.get(sheet) ?? { status, rows: 0 };
      s.rows += 1;
      skipped.set(sheet, s);
      return;
    }
    if (idx.clientName >= 0 && !clientHint) clientHint = cell(idx.clientName) || null;
    const externalId = cell(idx.externalId);
    const dateText = cell(idx.date);
    const key = `${externalId}|${dateText}`;
    const hoursText = cell(idx.hours);
    const minutes = parseDecimalHours(hoursText);
    const g = groups.get(key) ?? {
      firstRow: table.rowNumbers[i] ?? i + 2,
      sheets: new Set<string>(),
      minutes: 0,
      texts: [],
      date: parseDate(dateText, profile.dateFormat),
      dateText,
      name: `${cell(idx.lastName)}, ${cell(idx.firstName)}`,
      externalId,
      unreadable: false,
    };
    g.sheets.add(sheet);
    g.texts.push(`${cell(idx.rateCategory)} ${hoursText}`);
    if (minutes === null) g.unreadable = true;
    else g.minutes += minutes;
    groups.set(key, g);
  });

  const entries: RawEntry[] = [];
  let i = 0;
  for (const g of groups.values()) {
    if (g.minutes === 0 && !g.unreadable) continue; // the VMS writes zero rows for days not worked
    const checks: string[] = [];
    if (!g.date) checks.push("unreadable:date");
    if (g.unreadable) checks.push("unreadable:total");
    if (g.sheets.size > 1) checks.push("duplicate_day_in_vms");
    const src = (name: string) => ({ kind: "cell" as const, row: g.firstRow, column: name });
    entries.push({
      rowIndex: i++,
      worker: reading(g.name, g.name, src(c.lastName)),
      date: reading(g.dateText, g.date, src(c.date)),
      in: null,
      out: null,
      break: null,
      total: reading(g.texts.join(" + "), g.unreadable ? null : g.minutes, src(c.hours)),
      externalId: g.externalId || null,
      checks,
    });
  }
  const notes = [...skipped.entries()].map(
    ([sheet, s]) => `Skipped time sheet ${sheet} (${s.status}): ${s.rows} row${s.rows === 1 ? "" : "s"} not counted; only ${profile.includeStatuses.join(" / ")} time sheets count.`,
  );
  return { kind: "vms_export", profileKey: profile.key, clientHint, entries, notes };
}

function fromTable(filename: string, table: Table, kindHint: "csv" | "xlsx", profiles: MappingProfile[]): ParsedDocument {
  const profile = detectProfile(table.header, profiles);
  if (!profile) {
    throw new UnrecognisedFileError(`${filename}: the columns do not match any saved mapping profile.`);
  }
  if (profile.kind === "vms") return readVms(table, profile);
  return readTimeclock(table, profile, kindHint === "xlsx" ? "timeclock_xlsx" : "timeclock_csv");
}

/** Reads a CSV time file synchronously through the first saved profile that fits its header. */
export function parseStructuredFile(filename: string, bytes: Uint8Array, profiles: MappingProfile[] = BUILT_IN_PROFILES): ParsedDocument {
  return fromTable(filename, tableFromCsv(bytes), "csv", profiles);
}

/** Reads a CSV or XLSX time file through the first saved profile that fits its header. */
export async function parseStructuredUpload(filename: string, bytes: Uint8Array, profiles: MappingProfile[] = BUILT_IN_PROFILES): Promise<ParsedDocument> {
  if (/\.xlsx$/i.test(filename)) return fromTable(filename, await tableFromXlsx(bytes), "xlsx", profiles);
  return parseStructuredFile(filename, bytes, profiles);
}
