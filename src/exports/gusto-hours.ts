/**
 * Gusto hours import (Smart Import) CSV — SPEC §13.
 *
 * Gusto publishes no fixed layout; each company downloads its own template. Every recent real
 * template starts with the same core columns (docs/research/payroll-and-vms-formats.md):
 *   last_name, first_name, title, gusto_employee_id, regular_hours, overtime_hours,
 *   double_overtime_hours
 * This format writes exactly those, one row per worker, hours as decimals with two places.
 *
 * Declared capability: REG, OT, DT as hours, and BONUS as an amount in Gusto's "bonus" column (a
 * documented import field) when the agency maps it there; the column is written only when the run
 * has a bonus. Any other earning type in the run fails the export, naming the worker.
 * Gusto applies its own multipliers to overtime_hours (1.5×) and double_overtime_hours (2×), so an
 * OT or DT line at any other rate fails the export, as does a worker with several base rates.
 *
 * Hours are written with two decimals, ROUNDED UP to the next hundredth, so a worker is never paid
 * for less time than worked. Gusto multiplies those hours by the rate stored in Gusto, so its gross
 * can differ from Granite's minute-exact gross by a few cents: every such line gets a note with the
 * money effect, and the control totals carry the gross Gusto should compute and the difference.
 *
 * Reconciliation: the file is read back and must give the run's workers and minutes by type exactly
 * (two-decimal hours rounded up are within 0.4 minutes, so they round back to the exact minute).
 *
 * A correction's file (slice e, decision E9) carries differences against an earlier version, all of
 * them additions: it is named for its version and says it adds to the earlier file. Each line adds up
 * amounts that were each rounded once on their own stored line, so it is within half a cent per
 * stored line of minutes × rate. Gusto pays every hour at its stored rate, so every line is checked
 * against the worker's one regular rate in the whole period, even overtime added without regular hours.
 */
import { exactDecimal, formatCents, formatRate, roundHalfUpBig, type EarningType, type Fraction } from "@shiftbook/rules";
import type { ControlTotals } from "../server/db/schema";
import { readCsv, writeCsv } from "./csv";
import { ExportError } from "./errors";
import { checkAmountLine, checkLine, cmp, hundredthsToMinutes, sameRate, signedCents, sortKey, toHundredths, twoDecimals } from "./lines";
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

/** Amount columns, written in dollars with two decimals. */
const AMOUNT_COLUMNS = ["bonus"] as const;
type AmountColumn = (typeof AMOUNT_COLUMNS)[number];
/** The earning types this format can carry as an amount, and the template column each one may map to. */
export const GUSTO_AMOUNT_CAPABILITY: Partial<Record<EarningType, AmountColumn>> = { BONUS: "bonus" };

const toMinutes = hundredthsToMinutes;
const hoursText = twoDecimals;
/** Gusto's multiplier per column, applied to the employee's base rate. */
const GUSTO_MULTIPLIER: Record<HourColumn, Fraction> = {
  regular_hours: { num: 1, den: 1 },
  overtime_hours: { num: 3, den: 2 },
  double_overtime_hours: { num: 2, den: 1 },
};

/** Plain names for the earning types this file cannot carry, and what to do instead. */
const NOT_CARRIED: Partial<Record<EarningType, string>> = {
  MW_TRUEUP: "a minimum-wage top-up (the rate card is below the minimum wage); fix the rate card, or pay the top-up in Gusto as a separate amount",
  MEAL_PREMIUM: "a meal-period premium; pay it in Gusto as a separate amount",
  REST_PREMIUM: "a rest-period premium; pay it in Gusto as a separate amount",
  REPORTING_PAY: "reporting-time pay for a short day; pay it in Gusto as a separate amount",
  MIN_GUARANTEE: "a day-labor minimum for a short day; pay it in Gusto as a separate amount",
  HOL: "a holiday premium for hours worked on a holiday; pay it in Gusto as a separate amount",
  HOL_NOT_WORKED: "holiday pay for a holiday not worked; enter it in Gusto as holiday pay",
  BONUS: "a bonus; enter it in Gusto as a bonus",
  BONUS_OT: "overtime on a flat-sum bonus; pay it in Gusto as a separate amount",
};

function columnFor(type: EarningType, map: ExportFixture["earningCodeMap"], who: string): { kind: "hours"; column: HourColumn } | { kind: "amount"; column: AmountColumn } {
  const mapped = map[type];
  const hours = GUSTO_CAPABILITY[type];
  const amount = GUSTO_AMOUNT_CAPABILITY[type];
  if (mapped && hours && mapped === hours) return { kind: "hours", column: hours };
  if (mapped && amount && mapped === amount) return { kind: "amount", column: amount };
  const plain = NOT_CARRIED[type];
  const carried = map.BONUS === "bonus" ? "regular, overtime and double-time hours and bonuses" : "regular, overtime and double-time hours";
  throw new ExportError(
    "unsupported_earning_type",
    plain
      ? `${who}: the Gusto hours file carries ${carried} only, so it cannot carry ${plain}.`
      : `${who}: the Gusto hours file cannot carry earning type ${type}${mapped ? ` (mapped to "${mapped}")` : " (no column mapped)"}. It carries ${[...Object.keys(GUSTO_CAPABILITY), ...Object.keys(GUSTO_AMOUNT_CAPABILITY)].join(", ")} only.`,
  );
}

const dollarsText = twoDecimals;

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

export function renderGustoHours(fixture: ExportFixture): ExportResult {
  const workersById = indexWorkers(fixture.workers);
  const perWorker = new Map<string, Record<HourColumn, number>>();
  const minutesByType: Record<string, number> = {};
  const baseRates = new Map<string, Set<string>>();
  const columnRates = new Map<string, Partial<Record<HourColumn, Fraction>>>();
  const premiumLines: { workerId: string; column: HourColumn; rate: Fraction }[] = [];
  const columnAmounts = new Map<string, Record<HourColumn, number>>();
  const bonusCents = new Map<string, number>();
  const amountsByType: Record<string, number> = {};
  let grossCents = 0;

  for (const line of fixture.payLines) {
    try {
      addLine(line);
    } catch (error) {
      // Every refusal about one line is that line's worker's.
      if (error instanceof ExportError && error.workerId === undefined) throw new ExportError(error.code, error.message, line.workerId);
      throw error;
    }
  }
  function addLine(line: ExportFixture["payLines"][number]): void {
    const worker = workersById.get(line.workerId);
    if (!worker) throw new ExportError("missing_payroll_id", `Pay line for unknown worker ${line.workerId}.`);
    const target = columnFor(line.type, fixture.earningCodeMap, `${worker.lastName}, ${worker.firstName}`);
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
    if (target.kind === "amount") {
      checkAmountLine(line, `${worker.lastName}, ${worker.firstName}`);
      bonusCents.set(line.workerId, (bonusCents.get(line.workerId) ?? 0) + line.amountCents);
      if (!perWorker.has(line.workerId)) perWorker.set(line.workerId, { regular_hours: 0, overtime_hours: 0, double_overtime_hours: 0 });
      minutesByType[line.type] = (minutesByType[line.type] ?? 0) + line.minutes;
      amountsByType[line.type] = (amountsByType[line.type] ?? 0) + line.amountCents;
      grossCents += line.amountCents;
      return;
    }
    const column = target.column;
    checkLine(line, `${worker.lastName}, ${worker.firstName}`, fixture.correction !== undefined);
    // A correction adds to what Gusto already pays at its stored rate: the worker's one regular rate
    // in the whole period (a rate changed within the period, or a second rate, cannot be added as hours).
    const reference = fixture.correction ? fixture.referenceRates?.[line.workerId] : undefined;
    if (line.type === "REG" && fixture.correction && (!reference || !sameRate(line.rate, reference))) {
      throw new ExportError(
        "several_pay_rates",
        reference
          ? `${worker.lastName}, ${worker.firstName}: this correction adds regular hours at ${formatRate(line.rate)}, but Gusto pays this worker's stored rate (${formatRate(reference)} this period). Pay the difference by hand.`
          : `${worker.lastName}, ${worker.firstName} has more than one pay rate this period, so the hours this correction adds cannot be matched to the rate Gusto pays. Pay the difference by hand.`,
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
    // A correction's base is the worker's one regular rate in the whole period (overtime may be added alone).
    const reg = fixture.correction ? fixture.referenceRates?.[line.workerId] : columnRates.get(line.workerId)?.regular_hours;
    if (!reg) {
      throw new ExportError(
        "several_pay_rates",
        `${w.lastName}, ${w.firstName} has ${line.column} but no regular hours, so the base rate Gusto multiplies is unknown.`,
        line.workerId,
      );
    }
    const m = GUSTO_MULTIPLIER[line.column];
    if (!sameRate(line.rate, { num: reg.num * m.num, den: reg.den * m.den })) {
      throw new ExportError(
        "several_pay_rates",
        `${w.lastName}, ${w.firstName}: ${line.column} is paid at ${formatRate(line.rate)}, because the week's regular rate includes more than the hourly rate (a second pay rate, a bonus, a holiday premium below 1.5× or a minimum-wage top-up), but Gusto pays it at ${exactDecimal(m.num, m.den)} × the stored rate (${formatRate({ num: reg.num * m.num, den: reg.den * m.den })}). Skip this worker and pay them by hand, or enter the difference in Gusto as a separate amount.`,
        line.workerId,
      );
    }
  }

  const ordered = [...perWorker.keys()]
    .map((id) => workersById.get(id)!)
    .sort((a, b) => cmp(sortKey(a.lastName), sortKey(b.lastName)) || cmp(sortKey(a.firstName), sortKey(b.firstName)) || cmp(a.payrollIds.gusto!.id, b.payrollIds.gusto!.id));

  const notes: string[] = fixture.correction
    ? [
        `Correction ${fixture.correction.version} of this pay period: only the differences against version ${fixture.correction.baseVersion}, all of them additions. Import it into the payroll that pays them (the next regular payroll or an off-cycle payroll); it does not replace the file for version ${fixture.correction.baseVersion}.`,
      ]
    : [];
  const withBonus = bonusCents.size > 0;
  const rows: string[][] = [[...GUSTO_HEADER, ...(withBonus ? AMOUNT_COLUMNS : [])]];
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
        const why = exactHours ? ", because Granite rounds each pay line separately" : "";
        notes.push(
          `${w.lastName}, ${w.firstName} — ${type}: ${written}. Gusto pays ${hoursText(hours[i]!)} h × ${formatRate(rate)} = ${formatCents(gustoCents)}; Granite computed ${formatCents(amounts[col])} (${signedCents(gustoCents - amounts[col])})${why}.`,
        );
      }
    });
    // Gusto pays a bonus as the amount written: exact.
    const bonus = bonusCents.get(w.workerId) ?? 0;
    payrollSystemGrossCents += bonus;
    rows.push([w.lastName, w.firstName, w.payrollIds.gusto!.title ?? "", w.payrollIds.gusto!.id, ...hours.map(hoursText), ...(withBonus ? [dollarsText(bonus)] : [])]);
  }

  const bytes = writeCsv(rows);
  const controlTotals: ControlTotals = {
    workers: ordered.length,
    minutesByType,
    ...(Object.keys(amountsByType).length > 0 ? { amountsByType } : {}),
    grossCents,
    payrollSystemGrossCents,
    payrollSystemDifferenceCents: payrollSystemGrossCents - grossCents,
  };
  reconcile(bytes, controlTotals);

  return {
    filename: `gusto-hours-${fixture.period.startsOn}-to-${fixture.period.endsOn}${fixture.correction ? `-correction-${fixture.correction.version}` : ""}.csv`,
    mediaType: "text/csv",
    bytes,
    controlTotals,
    notes,
  };
}

/** Reads a Gusto hours file back: worker rows, total hundredths per hour column, and the bonus total in cents. */
export function parseGustoHoursCsv(text: string): { workers: number; hundredthsByColumn: Record<HourColumn, number>; bonusCents: number } {
  const [header, ...rows] = readCsv(text);
  const withBonus = header?.join(",") === [...GUSTO_HEADER, ...AMOUNT_COLUMNS].join(",");
  if (!header || (!withBonus && header.join(",") !== GUSTO_HEADER.join(","))) {
    throw new ExportError("does_not_reconcile", "The Gusto file header is not the expected template header.");
  }
  const totals: Record<HourColumn, number> = { regular_hours: 0, overtime_hours: 0, double_overtime_hours: 0 };
  let bonusCents = 0;
  const read = (text: string, what: string) => {
    const m = /^(\d+)\.(\d{2})$/.exec(text);
    if (!m) throw new ExportError("does_not_reconcile", `Unreadable ${what} value "${text}" in the Gusto file.`);
    return Number(m[1]) * 100 + Number(m[2]);
  };
  for (const row of rows) {
    HOUR_COLUMNS.forEach((col, i) => {
      totals[col] += read(row[4 + i] ?? "", "hours");
    });
    if (withBonus) bonusCents += read(row[4 + HOUR_COLUMNS.length] ?? "", "bonus");
  }
  return { workers: rows.length, hundredthsByColumn: totals, bonusCents };
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
  const bonusInRun = expected.amountsByType?.BONUS ?? 0;
  if (parsed.bonusCents !== bonusInRun) problems.push(`BONUS cents ${parsed.bonusCents} ≠ ${bonusInRun}`);
  if (problems.length > 0) {
    throw new ExportError("does_not_reconcile", `The Gusto file does not reconcile to the run: ${problems.join("; ")}.`);
  }
}
