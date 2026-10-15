/**
 * Gusto hours import (Smart Import) CSV — SPEC §13.
 *
 * Gusto publishes no fixed layout; each company downloads its own template. Every recent real
 * template starts with the same core columns (docs/research/payroll-and-vms-formats.md):
 *   last_name, first_name, title, gusto_employee_id, regular_hours, overtime_hours,
 *   double_overtime_hours
 * This format writes exactly those, one row per worker, hours as decimals with two places.
 *
 * Declared capability: REG, OT, DT only. Any other earning type in the run fails the export.
 * Gusto applies its own multipliers to overtime_hours (1.5×) and double_overtime_hours (2×), so an
 * OT or DT line at any other rate fails the export, as does a worker with several base rates.
 *
 * Hours are written with two decimals, ROUNDED UP to the next hundredth, so a worker is never paid
 * for less time than worked. Gusto multiplies those hours by the rate stored in Gusto, so its gross
 * can differ from Shiftbook's minute-exact gross by a few cents: every such line gets a note with the
 * money effect, and the control totals carry the gross Gusto should compute and the difference.
 *
 * Reconciliation: the file is read back and must give the run's workers and minutes by type exactly
 * (two-decimal hours rounded up are within 0.4 minutes, so they round back to the exact minute).
 */
import { ceilDiv, exactDecimal, floorDiv, formatCents, formatRate, mod, roundHalfUp, roundHalfUpBig, type EarningType, type Fraction } from "@shiftbook/rules";
import type { ControlTotals } from "../server/db/schema";
import { readCsv, writeCsv } from "./csv";
import { ExportError } from "./errors";
import type { ExportFixture, ExportResult, ExportWorker } from "./registry";

export const GUSTO_HEADER = [
  "last_name",
  "first_name",
  "title",
  "gusto_employee_id",
  "regular_hours",
  "overtime_hours",
  "double_overtime_hours",
] as const;

const HOUR_COLUMNS = ["regular_hours", "overtime_hours", "double_overtime_hours"] as const;
type HourColumn = (typeof HOUR_COLUMNS)[number];

/** The earning types this format can carry, and the template column each one may map to. */
export const GUSTO_CAPABILITY: Partial<Record<EarningType, HourColumn>> = {
  REG: "regular_hours",
  OT: "overtime_hours",
  DT: "double_overtime_hours",
};

/** minutes → hundredths of an hour, rounded up (37 → 62 = 0.62 h; 38 → 64 = 0.64 h). */
const toHundredths = (minutes: number) => ceilDiv(minutes * 100, 60);
/** hundredths → minutes; exact for every value written by toHundredths (error ≤ 0.4 min). */
const toMinutes = (hundredths: number) => roundHalfUp(hundredths * 60, 100);
const hoursText = (hundredths: number) => `${floorDiv(hundredths, 100)}.${String(mod(hundredths, 100)).padStart(2, "0")}`;
/** Gusto's multiplier per column, applied to the employee's base rate. */
const GUSTO_MULTIPLIER: Record<HourColumn, Fraction> = {
  regular_hours: { num: 1, den: 1 },
  overtime_hours: { num: 3, den: 2 },
  double_overtime_hours: { num: 2, den: 1 },
};
const sameRate = (a: Fraction, b: Fraction) => BigInt(a.num) * BigInt(b.den) === BigInt(b.num) * BigInt(a.den);
/** minutes × rate ÷ 60 rounded once, in big integers (a weighted overtime rate has a large denominator). */
const lineCents = (minutes: number, rate: Fraction) => roundHalfUpBig(BigInt(minutes) * BigInt(rate.num), 60n * BigInt(rate.den));
/** Name order that is the same on every machine: accents folded, case folded, plain comparison. */
const sortKey = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const signedCents = (c: number) => (c >= 0 ? `+${formatCents(c)}` : `−${formatCents(-c)}`);

/** Plain names for the earning types this file cannot carry, and what to do instead. */
const NOT_CARRIED: Partial<Record<EarningType, string>> = {
  MW_TRUEUP: "a minimum-wage top-up (the rate card is below the minimum wage); fix the rate card, or pay the top-up in Gusto as a separate amount",
  MEAL_PREMIUM: "a meal-period premium; pay it in Gusto as a separate amount",
  REST_PREMIUM: "a rest-period premium; pay it in Gusto as a separate amount",
  REPORTING_PAY: "reporting-time pay for a short day; pay it in Gusto as a separate amount",
  MIN_GUARANTEE: "a day-labor minimum for a short day; pay it in Gusto as a separate amount",
};

function columnFor(type: EarningType, map: ExportFixture["earningCodeMap"]): HourColumn {
  const mapped = map[type];
  const allowed = GUSTO_CAPABILITY[type];
  if (!mapped || !allowed || mapped !== allowed) {
    const plain = NOT_CARRIED[type];
    throw new ExportError(
      "unsupported_earning_type",
      plain
        ? `The Gusto hours file carries regular, overtime and double-time hours only, so it cannot carry ${plain}.`
        : `The Gusto hours file cannot carry earning type ${type}${mapped ? ` (mapped to "${mapped}")` : " (no column mapped)"}. It carries ${Object.keys(GUSTO_CAPABILITY).join(", ")} only.`,
    );
  }
  return allowed;
}

/** Each worker once, and each Gusto employee id on one worker only (Gusto would merge their hours). */
function indexWorkers(workers: ExportWorker[]): Map<string, ExportWorker> {
  const byId = new Map<string, ExportWorker>();
  const byGustoId = new Map<string, ExportWorker>(); // keyed case-insensitively
  for (const w of workers) {
    if (byId.has(w.workerId)) {
      throw new ExportError("duplicate_payroll_id", `${w.lastName}, ${w.firstName} is listed twice in the run's workers, so which Gusto id to use would be a guess.`);
    }
    byId.set(w.workerId, w);
    const gid = w.payrollIds.gusto?.id;
    if (!gid) continue;
    if (gid.trim() !== gid) {
      throw new ExportError("missing_payroll_id", `${w.lastName}, ${w.firstName}: the Gusto employee id "${gid}" has spaces around it; fix it so Gusto matches the right person.`);
    }
    const other = byGustoId.get(gid.toLowerCase());
    if (other) {
      throw new ExportError(
        "duplicate_payroll_id",
        `${other.lastName}, ${other.firstName} and ${w.lastName}, ${w.firstName} both have Gusto employee id ${gid}; Gusto would put both workers' hours on one person.`,
      );
    }
    byGustoId.set(gid.toLowerCase(), w);
  }
  return byId;
}

/** A pay line must be whole minutes ≥ 0 at a positive rate, with amount = minutes × rate ÷ 60 rounded once. */
function checkLine(line: ExportFixture["payLines"][number], who: string): void {
  const problem =
    (!Number.isSafeInteger(line.minutes) || line.minutes < 0) ? `${line.minutes} minutes is not a whole number ≥ 0`
    : !Number.isSafeInteger(line.amountCents) ? `${line.amountCents} is not a whole number of cents`
    : (!Number.isSafeInteger(line.rate.num) || !Number.isSafeInteger(line.rate.den) || line.rate.num <= 0 || line.rate.den <= 0) ? "its rate is not a positive amount"
    : lineCents(line.minutes, line.rate) !== line.amountCents
      ? `${formatCents(line.amountCents)} is not ${line.minutes} min × ${formatRate(line.rate)} rounded once (${formatCents(lineCents(line.minutes, line.rate))})`
      : null;
  if (problem) throw new ExportError("invalid_pay_line", `${who}: the ${line.type} pay line cannot be exported because ${problem}.`);
}

export function renderGustoHours(fixture: ExportFixture): ExportResult {
  const workersById = indexWorkers(fixture.workers);
  const perWorker = new Map<string, Record<HourColumn, number>>();
  const minutesByType: Record<string, number> = {};
  const baseRates = new Map<string, Set<string>>();
  const columnRates = new Map<string, Partial<Record<HourColumn, Fraction>>>();
  const premiumLines: { workerId: string; column: HourColumn; rate: Fraction }[] = [];
  const columnAmounts = new Map<string, Record<HourColumn, number>>();
  let grossCents = 0;

  for (const line of fixture.payLines) {
    const column = columnFor(line.type, fixture.earningCodeMap);
    const worker = workersById.get(line.workerId);
    if (!worker) throw new ExportError("missing_payroll_id", `Pay line for unknown worker ${line.workerId}.`);
    if (!worker.payrollIds.gusto?.id) {
      throw new ExportError(
        "missing_payroll_id",
        `${worker.lastName}, ${worker.firstName} has no Gusto employee id, so Gusto cannot match the row.`,
      );
    }
    if (!worker.payrollIds.gusto.title) {
      throw new ExportError(
        "missing_payroll_id",
        `${worker.lastName}, ${worker.firstName} has no Gusto job title; Gusto matches hours to a job, so the row could land on the wrong job.`,
      );
    }
    checkLine(line, `${worker.lastName}, ${worker.firstName}`);
    if (line.type === "REG") {
      const rates = baseRates.get(line.workerId) ?? new Set<string>();
      rates.add(`${line.rate.num}/${line.rate.den}`);
      baseRates.set(line.workerId, rates);
      if (rates.size > 1) {
        throw new ExportError(
          "several_pay_rates",
          `${worker.lastName}, ${worker.firstName} has more than one pay rate this period; Gusto pays one rate per job row, so each rate needs its own Gusto job before exporting.`,
        );
      }
    }
    const row = perWorker.get(line.workerId) ?? { regular_hours: 0, overtime_hours: 0, double_overtime_hours: 0 };
    row[column] += line.minutes;
    perWorker.set(line.workerId, row);
    const rates = columnRates.get(line.workerId) ?? {};
    rates[column] = line.rate;
    columnRates.set(line.workerId, rates);
    if (column !== "regular_hours") premiumLines.push({ workerId: line.workerId, column, rate: line.rate });
    const amounts = columnAmounts.get(line.workerId) ?? { regular_hours: 0, overtime_hours: 0, double_overtime_hours: 0 };
    amounts[column] += line.amountCents;
    columnAmounts.set(line.workerId, amounts);
    minutesByType[line.type] = (minutesByType[line.type] ?? 0) + line.minutes;
    grossCents += line.amountCents;
  }

  // Gusto pays overtime and double time at its own multiple of the employee's base rate, so every
  // premium line must be exactly that multiple of the worker's single regular rate.
  for (const line of premiumLines) {
    const w = workersById.get(line.workerId)!;
    const reg = columnRates.get(line.workerId)?.regular_hours;
    if (!reg) {
      throw new ExportError(
        "several_pay_rates",
        `${w.lastName}, ${w.firstName} has ${line.column} but no regular hours, so the base rate Gusto multiplies is unknown.`,
      );
    }
    const m = GUSTO_MULTIPLIER[line.column];
    if (!sameRate(line.rate, { num: reg.num * m.num, den: reg.den * m.den })) {
      throw new ExportError(
        "several_pay_rates",
        `${w.lastName}, ${w.firstName}: ${line.column} is paid at ${formatRate(line.rate)}, but Gusto pays it at ${exactDecimal(m.num, m.den)} × the regular rate (${formatRate({ num: reg.num * m.num, den: reg.den * m.den })}).`,
      );
    }
  }

  const ordered = [...perWorker.keys()]
    .map((id) => workersById.get(id)!)
    .sort((a, b) => cmp(sortKey(a.lastName), sortKey(b.lastName)) || cmp(sortKey(a.firstName), sortKey(b.firstName)) || cmp(a.payrollIds.gusto!.id, b.payrollIds.gusto!.id));

  const notes: string[] = [];
  const rows: string[][] = [[...GUSTO_HEADER]];
  let payrollSystemGrossCents = 0;
  for (const w of ordered) {
    const minutes = perWorker.get(w.workerId)!;
    const rates = columnRates.get(w.workerId) ?? {};
    const amounts = columnAmounts.get(w.workerId)!;
    const hours = HOUR_COLUMNS.map((col) => toHundredths(minutes[col]));
    HOUR_COLUMNS.forEach((col, i) => {
      const rate = rates[col];
      if (!rate || minutes[col] === 0) return;
      const gustoCents = roundHalfUpBig(BigInt(hours[i]!) * BigInt(rate.num), 100n * BigInt(rate.den));
      payrollSystemGrossCents += gustoCents;
      const exactHours = hours[i]! * 60 === minutes[col] * 100;
      if (!exactHours || gustoCents !== amounts[col]) {
        const type = (Object.keys(GUSTO_CAPABILITY) as EarningType[]).find((t) => GUSTO_CAPABILITY[t] === col)!;
        const written = exactHours
          ? `${minutes[col]} min written as ${hoursText(hours[i]!)} h (exact)`
          : `${minutes[col]} min written as ${hoursText(hours[i]!)} h (${exactDecimal(minutes[col], 60)} h exactly, rounded up to the next hundredth so no worked time is lost)`;
        const why = exactHours ? ", because Shiftbook rounds each pay line separately" : "";
        notes.push(
          `${w.lastName}, ${w.firstName} — ${type}: ${written}. Gusto pays ${hoursText(hours[i]!)} h × ${formatRate(rate)} = ${formatCents(gustoCents)}; Shiftbook computed ${formatCents(amounts[col])} (${signedCents(gustoCents - amounts[col])})${why}.`,
        );
      }
    });
    rows.push([w.lastName, w.firstName, w.payrollIds.gusto!.title ?? "", w.payrollIds.gusto!.id, ...hours.map(hoursText)]);
  }

  const bytes = writeCsv(rows);
  const controlTotals: ControlTotals = {
    workers: ordered.length,
    minutesByType,
    grossCents,
    payrollSystemGrossCents,
    payrollSystemDifferenceCents: payrollSystemGrossCents - grossCents,
  };
  reconcile(bytes, controlTotals);

  return {
    filename: `gusto-hours-${fixture.period.startsOn}-to-${fixture.period.endsOn}.csv`,
    mediaType: "text/csv",
    bytes,
    controlTotals,
    notes,
  };
}

/** Reads a Gusto hours file back: worker rows and total hundredths per hour column. */
export function parseGustoHoursCsv(text: string): { workers: number; hundredthsByColumn: Record<HourColumn, number> } {
  const [header, ...rows] = readCsv(text);
  if (!header || header.join(",") !== GUSTO_HEADER.join(",")) {
    throw new ExportError("does_not_reconcile", "The Gusto file header is not the expected template header.");
  }
  const totals: Record<HourColumn, number> = { regular_hours: 0, overtime_hours: 0, double_overtime_hours: 0 };
  for (const row of rows) {
    HOUR_COLUMNS.forEach((col, i) => {
      const text = row[4 + i] ?? "";
      const m = /^(\d+)\.(\d{2})$/.exec(text);
      if (!m) throw new ExportError("does_not_reconcile", `Unreadable hours value "${text}" in the Gusto file.`);
      totals[col] += Number(m[1]) * 100 + Number(m[2]);
    });
  }
  return { workers: rows.length, hundredthsByColumn: totals };
}

/** The file must give back the run's workers and minutes by type exactly, or the export fails. */
function reconcile(bytes: Uint8Array, expected: ControlTotals): void {
  const text = new TextDecoder().decode(bytes);
  const parsed = parseGustoHoursCsv(text);
  const rows = readCsv(text).slice(1);
  const problems: string[] = [];
  if (parsed.workers !== expected.workers) problems.push(`workers ${parsed.workers} ≠ ${expected.workers}`);
  for (const [type, column] of Object.entries(GUSTO_CAPABILITY) as [EarningType, HourColumn][]) {
    const index = 4 + HOUR_COLUMNS.indexOf(column);
    const minutesFromFile = rows.reduce((sum, row) => {
      const m = /^(\d+)\.(\d{2})$/.exec(row[index] ?? "")!;
      return sum + toMinutes(Number(m[1]) * 100 + Number(m[2]));
    }, 0);
    const minutesInRun = expected.minutesByType[type] ?? 0;
    if (minutesFromFile !== minutesInRun) problems.push(`${type} minutes ${minutesFromFile} ≠ ${minutesInRun}`);
  }
  if (problems.length > 0) {
    throw new ExportError("does_not_reconcile", `The Gusto file does not reconcile to the run: ${problems.join("; ")}.`);
  }
}
