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
export type Table = { header: string[]; rows: string[][]; rowNumbers: number[]; lines?: Line[] };
export type Line = { n: number; values: string[] };

const blank = (r: string[]) => r.every((c) => c.trim() === "");

function table(numbered: Line[]): Table {
  const [header, ...rows] = numbered;
  return { header: header?.values ?? [], rows: rows.map((r) => r.values), rowNumbers: rows.map((r) => r.n), lines: numbered };
}

/** The same file read with its column names on spreadsheet line `headerRow` (lines above it are titles). */
function fromHeaderRow(t: Table, headerRow: number): Table {
  return table((t.lines ?? []).filter((l) => l.n >= headerRow));
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
  const at = (name: string | undefined) => (name ? column(table, name) : -1);
  const idx = {
    externalId: at(c.externalId),
    name: at(c.name),
    date: at(c.date),
    in: at(c.in),
    out: at(c.out),
    breakMinutes: at(c.breakMinutes),
    totalHours: at(c.totalHours),
    clientName: at(c.clientName),
  };
  // A saved profile may read hours alone (no punches): then the day's total is the value read.
  const punches = Boolean(c.in && c.out);
  const clientHint = idx.clientName >= 0 ? (table.rows.map((r) => (r[idx.clientName] ?? "").trim()).find((v) => v !== "") ?? null) : null;
  const entries: RawEntry[] = table.rows.map((row, i) => {
    const rowNumber = table.rowNumbers[i] ?? i + 2;
    const cell = (j: number) => (j >= 0 ? (row[j] ?? "").trim() : "");
    const src = (name: string) => ({ kind: "cell" as const, row: rowNumber, column: name });
    const checks: string[] = [];
    const date = parseDate(cell(idx.date), profile.dateFormat);
    const inR = punches ? parseClockText(cell(idx.in)) : null;
    const outR = punches ? parseClockText(cell(idx.out)) : null;
    const brk = c.breakMinutes ? parseWholeMinutes(cell(idx.breakMinutes) || "0") : 0;
    const total = idx.totalHours >= 0 ? parseDecimalHours(cell(idx.totalHours)) : null;
    if (!date) checks.push("unreadable:date");
    if (punches && !inR) checks.push("unreadable:in");
    if (punches && !outR) checks.push("unreadable:out");
    if (brk === null) checks.push("unreadable:break");
    if (!punches && total === null) checks.push("unreadable:total");
    return {
      rowIndex: i,
      worker: reading(cell(idx.name), cell(idx.name) || null, src(c.name)),
      date: reading(cell(idx.date), date, src(c.date)),
      in: punches ? reading(cell(idx.in), inR?.minute ?? null, src(c.in!)) : null,
      out: punches ? reading(cell(idx.out), outR ? (outR.minute === 0 ? 1440 : outR.minute) : null, src(c.out!)) : null,
      break: c.breakMinutes ? reading(cell(idx.breakMinutes), brk, src(c.breakMinutes)) : null,
      total: c.totalHours ? reading(cell(idx.totalHours), total, src(c.totalHours)) : null,
      externalId: idx.externalId >= 0 ? cell(idx.externalId) || null : null,
      checks,
    };
  });
  return { kind, profileKey: profile.key, clientHint, entries, notes: [] };
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
      ...(g.externalId ? { vmsRefs: { timeSheetIds: [...g.sheets].filter(Boolean).sort(), workerId: g.externalId } } : {}),
      checks,
    });
  }
  const notes = [...skipped.entries()].map(
    ([sheet, s]) => `Skipped time sheet ${sheet} (${s.status}): ${s.rows} row${s.rows === 1 ? "" : "s"} not counted; only ${profile.includeStatuses.join(" / ")} time sheets count.`,
  );
  return { kind: "vms_export", profileKey: profile.key, clientHint, entries, notes };
}

function fromTable(filename: string, file: Table, kindHint: "csv" | "xlsx", profiles: MappingProfile[]): ParsedDocument {
  // A profile whose column names sit below lines of titles is tried on the file read from that line.
  for (const profile of profiles) {
    const t = profile.kind === "timeclock" && profile.headerRow && profile.headerRow > 1 ? fromHeaderRow(file, profile.headerRow) : file;
    if (detectProfile(t.header, [profile]) !== profile) continue;
    if (profile.kind === "vms") return readVms(t, profile);
    return readTimeclock(t, profile, kindHint === "xlsx" ? "timeclock_xlsx" : "timeclock_csv");
  }
  throw new UnrecognisedFileError(`${filename}: the columns do not match any saved mapping profile.`);
}

/** The first lines of a file (at most 15), each with its spreadsheet line number: the person picks the header among them. */
export async function firstLines(filename: string, bytes: Uint8Array): Promise<Line[]> {
  const t = /\.xlsx$/i.test(filename) ? await tableFromXlsx(bytes) : tableFromCsv(bytes);
  return (t.lines ?? []).slice(0, 15);
}

/** A whole table read with its header on spreadsheet line `headerRow` (for the mapping preview). */
export async function tableAt(filename: string, bytes: Uint8Array, headerRow: number): Promise<Table> {
  const t = /\.xlsx$/i.test(filename) ? await tableFromXlsx(bytes) : tableFromCsv(bytes);
  return headerRow > 1 ? fromHeaderRow(t, headerRow) : t;
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
