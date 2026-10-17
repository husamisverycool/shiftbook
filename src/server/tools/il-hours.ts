/**
 * The free Illinois 720-hour checker (SPEC §27 item 2; docs/patterns/tools/il-720-hours.md): a table
 * of days worked (worker, client, date, hours) in, each worker × client's hours in the 12- and
 * 48-month windows out, with the day each threshold was passed. It counts with the app's own code —
 * the rules package's equal-pay counter finds the crossings and the compliance counters total the
 * windows, from the same rule row the app is proven to hold (REFERENCE_EQUAL_PAY_RULES; 820 ILCS
 * 175/42). Pure: nothing is stored or logged. Minutes are integers throughout.
 */
import { addDays, equalPayCounter, isIsoDate, type Shift } from "@shiftbook/rules";
import { counters } from "@/server/compliance/counters";
import { REFERENCE_EQUAL_PAY_RULES } from "@/server/rules/reference-data";

export interface DayWorked {
  worker: string;
  client: string;
  /** YYYY-MM-DD. */
  date: string;
  minutes: number;
}

export type Column = "worker" | "client" | "date" | "hours";
export interface RowProblem {
  /** 1-based, as the person's spreadsheet numbers rows (the heading is row 1). */
  row: number;
  problem: "date" | "hours" | "worker" | "client";
}

/** The most rows one check reads (a year of a 500-person agency's days is far fewer per client file). */
export const MAX_ROWS = 50_000;

const HEADINGS: Record<Column, RegExp> = {
  worker: /^(worker|employee|name|worker name|employee name|associate|temp|trabajador|empleado|nombre)$/i,
  client: /^(client|customer|company|client name|site|worksite|cliente|empresa)$/i,
  date: /^(date|day|work date|workdate|shift date|fecha)$/i,
  hours: /^(hours|hrs|total hours|hours worked|total|horas)$/i,
};

/** Hours as written ("8", "8.5", "7,75", "8:30") in whole minutes; null when not a day's hours. */
export function parseMinutes(text: string): number | null {
  const s = text.trim().replace(",", ".");
  let minutes: number;
  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(s);
  const decimal = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(s);
  if (clock) minutes = Number(clock[1]) * 60 + Number(clock[2]);
  else if (decimal) {
    const frac = (decimal[2] ?? "").padEnd(2, "0");
    // Hundredths of an hour × 60 must land on a whole minute (0.25 → 15; 0.333 is refused above).
    if ((Number(frac) * 60) % 100 !== 0) return null;
    minutes = Number(decimal[1]) * 60 + (Number(frac) * 60) / 100;
  } else return null;
  return minutes >= 0 && minutes <= 1440 ? minutes : null;
}

/** A date as written (2026-03-02, 3/2/2026, 03/02/26) as YYYY-MM-DD; null when it is not a real day. */
export function parseWorkDate(text: string): string | null {
  const s = text.trim();
  let iso: string | null = null;
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (isoMatch) iso = `${isoMatch[1]}-${isoMatch[2]!.padStart(2, "0")}-${isoMatch[3]!.padStart(2, "0")}`;
  else if (us) iso = `${us[3]!.length === 2 ? `20${us[3]}` : us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
  return iso && isIsoDate(iso) ? iso : null;
}

/**
 * The days in a table whose first row names its columns. `rowNumbers`: the spreadsheet's own number for
 * each row after the heading, when blank rows were left out; otherwise the table's own order.
 */
export function parseHoursTable(table: string[][], rowNumbers?: number[]): { rows: DayWorked[]; problems: RowProblem[]; missing: Column[] } {
  const heading = (table[0] ?? []).map((h) => String(h ?? "").trim());
  const at = {} as Record<Column, number>;
  const missing: Column[] = [];
  for (const col of ["worker", "client", "date", "hours"] as Column[]) {
    const i = heading.findIndex((h) => HEADINGS[col].test(h));
    if (i < 0) missing.push(col);
    at[col] = i;
  }
  if (missing.length > 0) return { rows: [], problems: [], missing };
  const rows: DayWorked[] = [];
  const problems: RowProblem[] = [];
  for (let r = 1; r < Math.min(table.length, MAX_ROWS + 1); r++) {
    const cells = table[r]!.map((c) => String(c ?? "").trim());
    if (cells.every((c) => c === "")) continue;
    const worker = cells[at.worker] ?? "";
    const client = cells[at.client] ?? "";
    const date = parseWorkDate(cells[at.date] ?? "");
    const minutes = parseMinutes(cells[at.hours] ?? "");
    const problem: RowProblem["problem"] | null = !worker ? "worker" : !client ? "client" : !date ? "date" : minutes === null ? "hours" : null;
    if (problem) problems.push({ row: rowNumbers?.[r - 1] ?? r + 1, problem });
    else rows.push({ worker, client, date: date!, minutes: minutes! });
  }
  return { rows, problems, missing };
}

export interface PairResult {
  worker: string;
  client: string;
  minutes12: number;
  windowStart12: string;
  minutes48: number;
  windowStart48: string;
  /** The day the worker passed 720 hours (or 4,160 in 48 months) at the client; null if not yet. */
  crossed720: string | null;
  crossed4160: string | null;
  /** About when, at the last four weeks' pace, the 720 hours will be passed; null if passed or no recent hours. */
  projected720: string | null;
  status: "over" | "near" | "ok";
}

const key = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const ceilDiv = (a: number, b: number) => Math.floor((a + b - 1) / b);

export function checkHours(days: DayWorked[], asOf: string): { pairs: PairResult[]; rule: { triggerMinutes: number; warnMinutes: number; longTriggerMinutes: number; citation: string } } {
  const rules = REFERENCE_EQUAL_PAY_RULES;
  const rule = rules.find((r) => r.jurisdiction === "IL")!;
  // One id per worker and per client, however the names were capitalised or spaced; the first spelling is shown.
  const names = new Map<string, string>();
  const idOf = (prefix: string, name: string) => {
    const id = `${prefix}:${key(name)}`;
    if (!names.has(id)) names.set(id, name.trim().replace(/\s+/g, " "));
    return id;
  };
  const counted = days.filter((d) => d.date <= asOf && d.minutes > 0);
  const shifts: Shift[] = counted.map((d, i) => ({
    entryIds: [String(i)],
    workerId: idOf("w", d.worker),
    workerName: d.worker,
    assignmentId: "",
    clientId: idOf("c", d.client),
    jurisdiction: "IL",
    countyFips: "",
    placeFips: null,
    date: d.date,
    startMinute: null,
    minutes: d.minutes,
    payRateCents: 0,
    billRateCents: 0,
    billOtMultiplier: { num: 1, den: 1 },
    billDtMultiplier: { num: 1, den: 1 },
    otBillingRule: "multiplier",
  }));
  for (const d of days) {
    idOf("w", d.worker);
    idOf("c", d.client);
  }
  // The run's own counter finds each crossing (it records the day the total first went past the threshold).
  const { obligations } = equalPayCounter({ rules, shifts, hoursWorked: [], onFile: [], workweekStartsOn: 1 });
  const crossings = obligations.map((o) => ({ kind: o.kind as "il_equal_pay_720h" | "il_equal_pay_4160h", workerId: o.workerId, clientId: o.clientId, crossedOn: o.crossedOn }));
  const rows = counters({
    today: asOf,
    jurisdiction: "IL",
    rules,
    worked: days.map((d) => ({ workerId: idOf("w", d.worker), clientId: idOf("c", d.client), date: d.date, minutes: d.minutes })),
    balances: [],
    crossings,
  });
  const recentFrom = addDays(asOf, -27);
  const pairs = rows.map((r): PairResult => {
    const recent = counted.filter((d) => idOf("w", d.worker) === r.workerId && idOf("c", d.client) === r.clientId && d.date >= recentFrom).reduce((n, d) => n + d.minutes, 0);
    const perWeek = Math.floor(recent / 4);
    const projected720 = r.crossed720 === null && perWeek > 0 ? addDays(asOf, 7 * ceilDiv(rule.triggerMinutes - r.minutes12 + 1, perWeek)) : null;
    return {
      worker: names.get(r.workerId)!,
      client: names.get(r.clientId)!,
      minutes12: r.minutes12,
      windowStart12: r.windowStart12,
      minutes48: r.minutes48,
      windowStart48: r.windowStart48,
      crossed720: r.crossed720,
      crossed4160: r.crossed4160,
      projected720,
      status: r.crossed720 !== null || r.minutes12 > rule.triggerMinutes ? "over" : r.near ? "near" : "ok",
    };
  });
  return { pairs, rule: { triggerMinutes: rule.triggerMinutes, warnMinutes: rule.warnMinutes, longTriggerMinutes: rule.longTriggerMinutes, citation: rule.citation } };
}
