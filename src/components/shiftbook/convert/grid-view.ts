/**
 * The review grid's view and its pure arithmetic (docs/patterns/review.md, Airtable grid view):
 * row height, hidden and ordered fields, widths, group, sort, the summary bar's functions, a range of
 * cells, and what a paste would change. No React, no I/O: the grid component and its tests share it.
 */
import type { EntryChange } from "@/server/review/service";
import { parseClock } from "../format";
import type { GridRow } from "./types";

export const COLUMNS = ["worker", "client", "date", "in", "out", "break", "hours", "confidence", "status", "source"] as const;
export type Column = (typeof COLUMNS)[number];
/** Airtable: the first (primary) field cannot be hidden. */
export const PRIMARY: Column = "worker";
export const NUMERIC: Column[] = ["in", "out", "break", "hours"];
export const EDITABLE: Column[] = ["worker", "date", "in", "out", "break", "hours"];

/** Airtable's four row heights. */
export const ROW_HEIGHTS = ["short", "medium", "tall", "extraTall"] as const;
export type RowHeight = (typeof ROW_HEIGHTS)[number];
export const GROUPS = ["none", "client", "worker", "status", "date"] as const;
export type Group = (typeof GROUPS)[number];
export type Sort = { col: Column; dir: "asc" | "desc" } | null;

/** Airtable's summary functions, by kind of field. */
export const SUMMARIES = ["none", "sum", "average", "min", "max", "filled", "empty", "percentFilled", "unique"] as const;
export type Summary = (typeof SUMMARIES)[number];
export function summariesFor(col: Column): Summary[] {
  if (col === "break" || col === "hours") return ["none", "sum", "average", "min", "max", "filled", "empty", "percentFilled"];
  if (col === "in" || col === "out" || col === "date") return ["none", "min", "max", "filled", "empty", "percentFilled", "unique"];
  return ["none", "filled", "empty", "percentFilled", "unique"];
}
/** Airtable: a numeric field's summary defaults to Sum; others show nothing until chosen. */
export const defaultSummary = (col: Column): Summary => (col === "hours" || col === "break" ? "sum" : "none");

export interface View {
  rowHeight: RowHeight;
  hidden: Column[];
  order: Column[];
  widths: Partial<Record<Column, number>>;
  group: Group;
  sort: Sort;
  summaries: Partial<Record<Column, Summary>>;
}
export const DEFAULT_VIEW: View = { rowHeight: "medium", hidden: [], order: [...COLUMNS], widths: {}, group: "none", sort: null, summaries: {} };
export const MIN_WIDTH = 56;
export const MAX_WIDTH = 480;

/** A stored view, repaired: unknown fields dropped, missing ones appended, the primary field first and shown. */
export function normaliseView(raw: unknown): View {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<View>;
  const known = (c: unknown): c is Column => (COLUMNS as readonly unknown[]).includes(c);
  const order = [...new Set([PRIMARY, ...(Array.isArray(v.order) ? v.order.filter(known) : []), ...COLUMNS])];
  const widths: View["widths"] = {};
  for (const [k, w] of Object.entries(v.widths ?? {})) if (known(k) && Number.isFinite(w)) widths[k] = clampWidth(Number(w));
  const summaries: View["summaries"] = {};
  for (const [k, s] of Object.entries(v.summaries ?? {})) if (known(k) && summariesFor(k).includes(s as Summary)) summaries[k] = s as Summary;
  const sort = v.sort && known(v.sort.col) && (v.sort.dir === "asc" || v.sort.dir === "desc") ? { col: v.sort.col, dir: v.sort.dir } : null;
  return {
    rowHeight: ROW_HEIGHTS.includes(v.rowHeight as RowHeight) ? (v.rowHeight as RowHeight) : "medium",
    hidden: Array.isArray(v.hidden) ? [...new Set(v.hidden.filter((c): c is Column => known(c) && c !== PRIMARY))] : [],
    order,
    widths,
    group: GROUPS.includes(v.group as Group) ? (v.group as Group) : "none",
    sort,
    summaries,
  };
}
export const clampWidth = (w: number) => Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w)));
export const shownColumns = (v: View): Column[] => v.order.filter((c) => !v.hidden.includes(c));

/** Moves a field to another field's place (drag a header onto another); the primary field stays first. */
export function moveColumn(order: Column[], from: Column, to: Column): Column[] {
  if (from === to || from === PRIMARY || to === PRIMARY) return order;
  const next = order.filter((c) => c !== from);
  const at = next.indexOf(to);
  const after = order.indexOf(from) < order.indexOf(to);
  next.splice(after ? at + 1 : at, 0, from);
  return next;
}

/** A field's raw value, for sorting, grouping and the summary bar. */
export function rawValue(r: GridRow, col: Column): string | number | null {
  switch (col) {
    case "worker":
      return r.workerName || null;
    case "client":
      return r.clientName;
    case "date":
      return r.workDate;
    case "in":
      return r.inMinute;
    case "out":
      return r.outMinute;
    case "break":
      return r.breakMinutes;
    case "hours":
      return r.status === "rejected" ? null : r.minutes;
    case "confidence":
      return { high: 3, medium: 2, low: 1 }[r.confidence];
    case "status":
      return r.status;
    case "source":
      return r.document?.filename ?? null;
  }
}

/** Empty values last in either direction (Airtable). Stable: equal rows keep their order. */
export function sortRows(rows: GridRow[], sort: Sort): GridRow[] {
  if (!sort) return rows;
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i, v: rawValue(r, sort.col) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      const c = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : String(a.v).localeCompare(String(b.v));
      return c !== 0 ? sign * c : a.i - b.i;
    })
    .map((x) => x.r);
}

export interface RowGroup {
  key: string;
  rows: GridRow[];
}
/** Groups in name (or date) order, each keeping the rows' order; "" holds rows with no value. */
export function groupRows(rows: GridRow[], group: Group): RowGroup[] {
  if (group === "none") return [{ key: "", rows }];
  const by = new Map<string, GridRow[]>();
  for (const r of rows) {
    const key = group === "client" ? (r.clientName ?? "") : group === "worker" ? r.workerName : group === "status" ? r.status : (r.workDate ?? "");
    by.set(key, [...(by.get(key) ?? []), r]);
  }
  return [...by.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b))).map(([key, rs]) => ({ key, rows: rs }));
}

/** A summary over raw values: numbers stay numbers (minutes), the rest are counts or a percent. */
export type SummaryResult = { kind: "minutes" | "clock" | "date" | "count" | "percent"; value: number | string } | null;
export function summarise(values: (string | number | null)[], fn: Summary, col: Column): SummaryResult {
  const filled = values.filter((v): v is string | number => v !== null && v !== "");
  const nums = filled.filter((v): v is number => typeof v === "number");
  const timeKind = col === "in" || col === "out" ? "clock" : col === "date" ? "date" : "minutes";
  switch (fn) {
    case "none":
      return null;
    case "sum":
      return { kind: "minutes", value: nums.reduce((a, b) => a + b, 0) };
    case "average":
      // Minutes are whole: the average is rounded once, half up, as every figure the grid shows.
      return nums.length === 0 ? null : { kind: "minutes", value: Math.floor((2 * nums.reduce((a, b) => a + b, 0) + nums.length) / (2 * nums.length)) };
    case "min":
    case "max": {
      if (filled.length === 0) return null;
      const pick = filled.reduce((a, b) => ((fn === "min" ? compare(b, a) < 0 : compare(b, a) > 0) ? b : a));
      return { kind: timeKind, value: pick };
    }
    case "filled":
      return { kind: "count", value: filled.length };
    case "empty":
      return { kind: "count", value: values.length - filled.length };
    case "percentFilled":
      return { kind: "percent", value: values.length === 0 ? 0 : Math.floor((200 * filled.length + values.length) / (2 * values.length)) };
    case "unique":
      return { kind: "count", value: new Set(filled.map(String)).size };
  }
}
const compare = (a: string | number, b: string | number) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b)));

/** The cells between an anchor and the active cell, inclusive. */
export interface Range {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}
export const rangeOf = (a: { row: number; col: number }, b: { row: number; col: number }): Range => ({
  r0: Math.min(a.row, b.row),
  r1: Math.max(a.row, b.row),
  c0: Math.min(a.col, b.col),
  c1: Math.max(a.col, b.col),
});
export const inRange = (rg: Range | null, row: number, col: number) => rg !== null && row >= rg.r0 && row <= rg.r1 && col >= rg.c0 && col <= rg.c1;
export const rangeSize = (rg: Range) => (rg.r1 - rg.r0 + 1) * (rg.c1 - rg.c0 + 1);

/** Tab-separated values, as spreadsheets put them on the clipboard (quoted cells may hold tabs or new lines). */
export function toTsv(cells: string[][]): string {
  const q = (s: string) => (/[\t\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return cells.map((row) => row.map(q).join("\t")).join("\n");
}
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

/** A row can be changed in the grid (Restaurant365: locked, rejected and client-approved punches cannot). */
export const editableRow = (r: GridRow) => r.status !== "locked" && r.status !== "rejected" && r.status !== "client_approved";

export type PasteProblem = "not_editable" | "invalid_value" | "unknown_worker" | "outside_period";
export interface PastePlan {
  changes: { row: GridRow; change: EntryChange; cells: Column[] }[];
  problems: { row: GridRow; col: Column; problem: PasteProblem; text: string }[];
}

/** "8:30", "8.5" or "510" (minutes) → minutes; null when unreadable. */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  let m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m) return Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
  m = /^(\d{1,2})[.,](\d{1,2})$/.exec(t);
  if (m) {
    // Decimal hours become minutes exactly only for whole minutes (8.5 → 510; 8.33 is refused).
    const hundredths = Number(m[1]) * 100 + Number(m[2]!.padEnd(2, "0"));
    return (hundredths * 60) % 100 === 0 ? (hundredths * 60) / 100 : null;
  }
  m = /^(\d{1,4})$/.exec(t);
  return m ? Number(m[1]) : null;
}
/** "2026-10-05" or "10/5/2026" → ISO date; null when unreadable. */
export function parseDate(text: string): string | null {
  const t = text.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) {
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
    if (!us) return null;
    m = [t, us[3]!, us[1]!.padStart(2, "0"), us[2]!.padStart(2, "0")] as unknown as RegExpExecArray;
  }
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * What pasting would change (Airtable: "pasting into a range fills every selected cell"): the clipboard
 * starts at the range's top-left cell; a single value fills the whole range. Every cell is checked
 * before anything is sent, and each row is then saved on its own with the person's reason.
 */
export function planPaste(args: {
  rows: GridRow[];
  columns: Column[];
  range: Range;
  clipboard: string[][];
  roster: { id: string; name: string }[];
  period: { startsOn: string; endsOn: string };
}): PastePlan {
  const { rows, columns, range, clipboard, roster, period } = args;
  const single = clipboard.length === 1 && clipboard[0]!.length === 1;
  const height = single ? range.r1 - range.r0 + 1 : clipboard.length;
  const width = single ? range.c1 - range.c0 + 1 : Math.max(...clipboard.map((r) => r.length));
  const byRow = new Map<string, { row: GridRow; change: EntryChange; cells: Column[] }>();
  const problems: PastePlan["problems"] = [];
  for (let i = 0; i < height; i++) {
    const row = rows[range.r0 + i];
    if (!row) break;
    for (let j = 0; j < width; j++) {
      const col = columns[range.c0 + j];
      if (!col) break;
      const text = single ? clipboard[0]![0]! : (clipboard[i]?.[j] ?? "");
      const problem = (p: PasteProblem) => problems.push({ row, col, problem: p, text });
      if (!EDITABLE.includes(col) || !editableRow(row)) {
        problem("not_editable");
        continue;
      }
      const entry = byRow.get(row.id) ?? { row, change: {}, cells: [] };
      const timed = row.inMinute !== null || row.outMinute !== null;
      if (col === "worker") {
        const match = roster.filter((w) => w.name.trim().toLowerCase() === text.trim().toLowerCase());
        if (match.length !== 1) {
          problem("unknown_worker");
          continue;
        }
        entry.change.workerId = match[0]!.id;
      } else if (col === "date") {
        const iso = parseDate(text);
        if (!iso) {
          problem("invalid_value");
          continue;
        }
        if (iso < period.startsOn || iso > period.endsOn) {
          problem("outside_period");
          continue;
        }
        entry.change.workDate = iso;
      } else if (col === "in" || col === "out") {
        const minute = parseClock(text);
        if (minute === null) {
          problem("invalid_value");
          continue;
        }
        entry.change[col === "in" ? "inMinute" : "outMinute"] = minute;
      } else if (col === "break") {
        const minutes = parseDuration(text);
        if (minutes === null || !timed) {
          problem(timed ? "invalid_value" : "not_editable");
          continue;
        }
        entry.change.breakMinutes = minutes;
      } else if (col === "hours") {
        const minutes = parseDuration(text);
        // Hours read with clock times follow from them (in, out, break); only a daily total takes hours.
        if (timed) {
          problem("not_editable");
          continue;
        }
        if (minutes === null || minutes > 24 * 60) {
          problem("invalid_value");
          continue;
        }
        entry.change.minutes = minutes;
      }
      entry.cells.push(col);
      byRow.set(row.id, entry);
    }
  }
  // A value equal to the one already there changes nothing.
  const changes = [...byRow.values()]
    .map((e) => ({ ...e, change: Object.fromEntries(Object.entries(e.change).filter(([k, v]) => v !== currentOf(e.row, k as keyof EntryChange))) as EntryChange }))
    .filter((e) => Object.keys(e.change).length > 0);
  return { changes, problems };
}

/** An entry's current value for one field of a change. */
export function currentOf(r: GridRow, key: keyof EntryChange): string | number | null {
  return { workerId: r.workerId, workDate: r.workDate, inMinute: r.inMinute, outMinute: r.outMinute, breakMinutes: r.breakMinutes, minutes: r.minutes }[key];
}
/** The change that puts back what a change replaced (undo), from the row as it was before. */
export function inverseOf(before: GridRow, change: EntryChange): EntryChange {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(change) as (keyof EntryChange)[]) out[key] = currentOf(before, key);
  return out as EntryChange;
}
