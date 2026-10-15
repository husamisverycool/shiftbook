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

export type Table = { header: string[]; rows: string[][] };

export function tableFromCsv(bytes: Uint8Array): Table {
  const text = new TextDecoder().decode(bytes).replace(/^﻿/, "");
  const all = readCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  const [header = [], ...rows] = all;
  return { header, rows };
}

export async function tableFromXlsx(bytes: Uint8Array): Promise<Table> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { header: [], rows: [] };
  const all: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as unknown[]).slice(1).map((v) => {
      if (v instanceof Date) {
        const iso = v.toISOString().slice(0, 10);
        return `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
      }
      if (v && typeof v === "object" && "text" in v) return String((v as { text: unknown }).text);
      return v === null || v === undefined ? "" : String(v);
    });
    all.push(values);
  });
  const [header = [], ...rows] = all;
  return { header, rows };
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
    const rowNumber = i + 2;
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
      firstRow: i + 2,
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
