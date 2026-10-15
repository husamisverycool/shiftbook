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
 * Reconciliation: the file is read back and must give the run's workers and minutes by type exactly
 * (two-decimal hours always round back to the exact minute), or the export fails.
 */
import { exactDecimal, floorDiv, mod, roundHalfUp, type EarningType } from "@shiftbook/rules";
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

/** minutes → hundredths of an hour, rounded half-up (37 → 62 = 0.62 h). */
const toHundredths = (minutes: number) => roundHalfUp(minutes * 100, 60);
/** hundredths → minutes; exact for every value written by toHundredths (error < 0.3 min). */
const toMinutes = (hundredths: number) => roundHalfUp(hundredths * 60, 100);
const hoursText = (hundredths: number) => `${floorDiv(hundredths, 100)}.${String(mod(hundredths, 100)).padStart(2, "0")}`;

function columnFor(type: EarningType, map: ExportFixture["earningCodeMap"]): HourColumn {
  const mapped = map[type];
  const allowed = GUSTO_CAPABILITY[type];
  if (!mapped || !allowed || mapped !== allowed) {
    throw new ExportError(
      "unsupported_earning_type",
      `The Gusto hours file cannot carry earning type ${type}${mapped ? ` (mapped to "${mapped}")` : " (no column mapped)"}. It carries ${Object.keys(GUSTO_CAPABILITY).join(", ")} only.`,
    );
  }
  return allowed;
}

export function renderGustoHours(fixture: ExportFixture): ExportResult {
  const workersById = new Map<string, ExportWorker>(fixture.workers.map((w) => [w.workerId, w]));
  const perWorker = new Map<string, Record<HourColumn, number>>();
  const minutesByType: Record<string, number> = {};
  const baseRates = new Map<string, Set<string>>();
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
    minutesByType[line.type] = (minutesByType[line.type] ?? 0) + line.minutes;
    grossCents += line.amountCents;
  }

  const ordered = [...perWorker.keys()]
    .map((id) => workersById.get(id)!)
    .sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName, "en") ||
        a.firstName.localeCompare(b.firstName, "en") ||
        a.payrollIds.gusto!.id.localeCompare(b.payrollIds.gusto!.id),
    );

  const notes: string[] = [];
  const rows: string[][] = [[...GUSTO_HEADER]];
  for (const w of ordered) {
    const minutes = perWorker.get(w.workerId)!;
    const hours = HOUR_COLUMNS.map((col) => toHundredths(minutes[col]));
    HOUR_COLUMNS.forEach((col, i) => {
      if (hours[i]! * 60 !== minutes[col] * 100) {
        const type = (Object.keys(GUSTO_CAPABILITY) as EarningType[]).find((t) => GUSTO_CAPABILITY[t] === col)!;
        notes.push(
          `${w.lastName}, ${w.firstName} — ${type}: ${minutes[col]} min written as ${hoursText(hours[i]!)} h (${exactDecimal(minutes[col], 60)} h exactly). Gusto multiplies the hours it receives by its own rate.`,
        );
      }
    });
    rows.push([w.lastName, w.firstName, w.payrollIds.gusto!.title ?? "", w.payrollIds.gusto!.id, ...hours.map(hoursText)]);
  }

  const bytes = writeCsv(rows);
  const controlTotals: ControlTotals = { workers: ordered.length, minutesByType, grossCents };
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
