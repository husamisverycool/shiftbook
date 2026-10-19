/**
 * Spreadsheet in the agency's own layout (a PEO's or factoring company's template) — SPEC §13;
 * slice f, decision F6.
 *
 * PEOs and payroll bureaus each publish their own template (research §5): one row per pay entry, a
 * worker id, a pay code, hours with a rate or an amount, a delimiter and a header row of their
 * choosing. The agency picks and orders the columns from a fixed list (never an SSN), names each
 * header, and sets the delimiter, header row, date format and file name (Deputy's custom template).
 *
 * One row per pay line (worker, workweek, kind of pay, rate). Hours go out with two decimals rounded
 * up (no worked time lost), rates with four, amounts to the cent. A kind of pay with no code set goes
 * out under Tabulado's own code (REG, OT, …). With an amount column the receiver pays what is
 * written; without one it prices hours × the written rate, and the notes say what rounding does.
 */
import { exactDecimal, formatCents, formatRate, roundHalfUpBig, type Fraction } from "@shiftbook/rules";
import type { ControlTotals } from "../server/db/schema";
import { collect, correctionNote, KIND_ORDER, KIND_TEXT, targetOf, weekEnd, who } from "./collect";
import { readCsv, writeCsv } from "./csv";
import { ExportError } from "./errors";
import { cmp, eachLine, formatDate, hundredthsToMinutes, readTwoDecimals, signedCents, toHundredths, twoDecimals } from "./lines";
import type { ExportFixture, ExportResult } from "./registry";
import { DELIMITERS, layoutProblems, type ExportFormat, type SpreadsheetField, type SpreadsheetLayout } from "./targets";

/** cents per hour (exact) → ten-thousandths of a dollar, rounded half up: 1825 → 182500 ("18.2500"). */
const tenThousandths = (rate: Fraction) => BigInt(roundHalfUpBig(BigInt(rate.num) * 100n, BigInt(rate.den)));
/** 182500n → "18.2500" (string slicing: no division in pay code). */
const rateText = (t4: bigint) => {
  const s = t4.toString().padStart(5, "0");
  return `${s.slice(0, -4)}.${s.slice(-4)}`;
};

interface Row {
  workerIndex: number;
  id: string;
  lastName: string;
  firstName: string;
  weekStart: string;
  weekEnd: string;
  code: string;
  as: "hours" | "dollars";
  type: string;
  rank: number;
  rate: Fraction;
  /** The multiple the receiver applies to the written rate (1, or the one the agency declared). */
  factor: Fraction;
  minutes: number;
  amountCents: number;
}

/** The rate written for a row: the line's rate ÷ the receiver's multiple, in ten-thousandths of a dollar. */
function writtenRate(row: Pick<Row, "rate" | "factor">): bigint | null {
  if (row.factor.num === row.factor.den) return tenThousandths(row.rate);
  // A declared multiple: written exactly or not at all (the receiver multiplies it back).
  const num = BigInt(row.rate.num) * 100n * BigInt(row.factor.den);
  const den = BigInt(row.rate.den) * BigInt(row.factor.num);
  return num % den === 0n ? BigInt(roundHalfUpBig(num, den)) : null;
}

export function renderSpreadsheet(fixture: ExportFixture): ExportResult {
  const target = targetOf(fixture, "spreadsheet_csv");
  const bad = layoutProblems(target.layout);
  if (bad.length > 0) throw new ExportError("unknown_format", `The spreadsheet layout cannot be used: ${bad.map((p) => p.message).join(" ")}`);
  return renderLayout(fixture, "spreadsheet_csv", target.layout, { amountOn: "every_row", file: "spreadsheet", receiver: "receiver's" });
}

/**
 * How a fixed-layout file differs from the agency's own spreadsheet: `amountOn: "dollars_rows"` —
 * the receiver takes hours with a rate or an amount, never both (Paychex SPI: "Amount must be empty
 * if Hours is nonzero"), so hours rows leave the amount blank and are priced hours × the written rate.
 */
export interface LayoutOptions {
  amountOn: "every_row" | "dollars_rows";
  /** How refusals and the reconciliation name the file. */
  file: string;
  /** Whose pay the notes describe ("Paychex Flex"). */
  receiver: string;
}

/** One row per worker, workweek, kind of pay and rate, in a layout; read back and reconciled. */
export function renderLayout(fixture: ExportFixture, format: ExportFormat, layout: SpreadsheetLayout, opts: LayoutOptions): ExportResult {
  const has = (field: SpreadsheetField) => layout.columns.some((c) => c.field === field);
  const c = collect(fixture, format, { storedRate: false, carries: "every kind of pay" });
  const amountOf = (row: { as: "hours" | "dollars" }) => has("amount") && (opts.amountOn === "every_row" || row.as === "dollars");

  // Dollars need an amount column; hours need hours and a rate, or an amount.
  for (const w of c.workers) {
    eachLine(
      w.lines.map((l) => l.line),
      (line) => {
        const bucket = w.lines.find((l) => l.line === line)!.bucket;
        if (bucket.as === "dollars" && !has("amount")) throw new ExportError("unsupported_earning_type", `${who(w.worker)}: the ${opts.file} has no amount column, so it cannot carry ${KIND_TEXT[line.type]}. Add an amount column, or skip this worker and pay it by hand.`);
      },
    );
  }

  // One row per worker, workweek, kind of pay and rate.
  const rows = new Map<string, Row>();
  c.workers.forEach((w, workerIndex) => {
    for (const { line, bucket } of w.lines) {
      const key = `${w.worker.workerId}|${line.workweekStart ?? ""}|${line.type}|${bucket.as}|${line.rate.num}/${line.rate.den}|${bucket.factor.num}/${bucket.factor.den}`;
      const row = rows.get(key) ?? {
        workerIndex,
        id: w.id,
        lastName: w.worker.lastName,
        firstName: w.worker.firstName,
        weekStart: line.workweekStart ?? fixture.period.startsOn,
        weekEnd: weekEnd(fixture, line),
        code: bucket.code,
        as: bucket.as,
        type: line.type,
        rank: KIND_ORDER.indexOf(line.type),
        rate: line.rate,
        factor: bucket.as === "hours" ? bucket.factor : { num: 1, den: 1 },
        minutes: 0,
        amountCents: 0,
      };
      row.minutes += line.minutes;
      row.amountCents += line.amountCents;
      rows.set(key, row);
    }
  });
  for (const row of rows.values()) {
    if (row.as === "hours" && has("rate") && writtenRate(row) === null) {
      const worker = c.workers[row.workerIndex]!.worker;
      throw new ExportError(
        "unsupported_earning_type",
        `${who(worker)}: ${KIND_TEXT[row.type as keyof typeof KIND_TEXT]} is paid at ${formatRate(row.rate)}, which is not an exact rate once divided by the ${exactDecimal(row.factor.num, row.factor.den)} multiple ${opts.receiver} applies to this pay component (the week's regular rate includes a second rate, a bonus or a top-up). Carry this kind of pay as dollars in payroll settings, or skip this worker and pay them by hand.`,
      );
    }
  }
  const ordered = [...rows.values()].sort((a, b) => a.workerIndex - b.workerIndex || cmp(a.weekStart, b.weekStart) || a.rank - b.rank || (BigInt(a.rate.num) * BigInt(b.rate.den) < BigInt(b.rate.num) * BigInt(a.rate.den) ? -1 : 1));

  const date = (iso: string) => formatDate(iso, layout.dateFormat);
  const value = (row: Row, field: SpreadsheetField, fixed?: string): string => {
    switch (field) {
      case "worker_id":
        return row.id;
      case "last_name":
        return row.lastName;
      case "first_name":
        return row.firstName;
      case "period_start":
        return date(fixture.period.startsOn);
      case "period_end":
        return date(fixture.period.endsOn);
      case "week_start":
        return date(row.weekStart);
      case "week_end":
        return date(row.weekEnd);
      case "earning_code":
        return row.code;
      case "hours":
        return row.as === "hours" ? twoDecimals(toHundredths(row.minutes)) : "";
      case "rate":
        return row.as === "hours" ? rateText(writtenRate(row)!) : "";
      case "amount":
        return amountOf(row) ? twoDecimals(row.amountCents) : "";
      case "fixed":
        return fixed ?? "";
    }
  };
  const lines: string[][] = [...(layout.header ? [layout.columns.map((col) => col.header)] : []), ...ordered.map((row) => layout.columns.map((col) => value(row, col.field, col.value)))];
  const delimiter = DELIMITERS[layout.delimiter];
  const bytes = writeCsv(lines, { eol: "\r\n", delimiter });

  // What the receiver pays: the amount when the file has one; otherwise hours × the written rate × its multiple.
  const pays = (hundredths: number, t4: bigint, factor: Fraction) => roundHalfUpBig(BigInt(hundredths) * t4 * BigInt(factor.num), 10_000n * BigInt(factor.den));
  const notes = correctionNote(fixture, opts.receiver);
  let expectedGrossCents = 0;
  for (const row of ordered) {
    if (amountOf(row)) {
      expectedGrossCents += row.amountCents;
      continue;
    }
    const h = toHundredths(row.minutes);
    const t4 = writtenRate(row)!;
    const cents = pays(h, t4, row.factor);
    expectedGrossCents += cents;
    const exactHours = h * 60 === row.minutes * 100;
    if (!exactHours || cents !== row.amountCents) {
      const written = exactHours ? `${row.minutes} min written as ${twoDecimals(h)} h (exact)` : `${row.minutes} min written as ${twoDecimals(h)} h (${exactDecimal(row.minutes, 60)} h exactly, rounded up to the next hundredth so no worked time is lost)`;
      const multiple = row.factor.num === row.factor.den ? "" : ` × ${exactDecimal(row.factor.num, row.factor.den)}`;
      const worker = c.workers[row.workerIndex]!.worker;
      notes.push(`${who(worker)} — ${row.type}: ${written}. ${opts.amountOn === "every_row" ? "The receiver" : opts.receiver} pays ${twoDecimals(h)} h × ${rateText(t4)}${multiple} = ${formatCents(cents)}; Tabulado computed ${formatCents(row.amountCents)} (${signedCents(cents - row.amountCents)}).`);
    }
  }

  // Read back: rows; per row the worker id, code, minutes, rate and amount, the fixed cells, and empty
  // hours and rate on dollars rows. The receiver's gross is computed from the file as read, not from
  // memory (export review finding 3).
  const read = readCsv(new TextDecoder().decode(bytes), delimiter).slice(layout.header ? 1 : 0);
  const at = (field: SpreadsheetField) => layout.columns.findIndex((col) => col.field === field);
  const problems: string[] = read.length !== ordered.length ? [`rows ${read.length} ≠ ${ordered.length}`] : [];
  let payrollSystemGrossCents = 0;
  read.forEach((r, i) => {
    const row = ordered[i]!;
    if (r[at("worker_id")] !== row.id || r[at("earning_code")] !== row.code) problems.push(`row ${i + 1} is not ${row.id} ${row.code}`);
    layout.columns.forEach((col, n) => {
      if (col.field === "fixed" && (r[n] ?? "") !== (col.value ?? "")) problems.push(`row ${i + 1} ${col.header}`);
    });
    if (amountOf(row)) {
      const cents = readTwoDecimals(r[at("amount")] ?? "", "amount", opts.file);
      if (cents !== row.amountCents) problems.push(`row ${i + 1} amount`);
      payrollSystemGrossCents += cents;
    } else if (has("amount") && (r[at("amount")] ?? "") !== "") problems.push(`row ${i + 1} has an amount beside its hours`);
    if (row.as === "dollars") {
      if (has("hours") && (r[at("hours")] ?? "") !== "") problems.push(`row ${i + 1} has hours beside its amount`);
      if (has("rate") && (r[at("rate")] ?? "") !== "") problems.push(`row ${i + 1} has a rate beside its amount`);
      return;
    }
    const hundredths = has("hours") ? readTwoDecimals(r[at("hours")] ?? "", "hours", opts.file) : toHundredths(row.minutes);
    if (has("hours") && hundredthsToMinutes(hundredths) !== row.minutes) problems.push(`row ${i + 1} minutes`);
    if (!has("rate")) return;
    const rate = r[at("rate")] ?? "";
    if (!/^\d+\.\d{4}$/.test(rate) || BigInt(rate.replace(".", "")) !== writtenRate(row)) {
      problems.push(`row ${i + 1} rate`);
      return;
    }
    if (!amountOf(row)) payrollSystemGrossCents += pays(hundredths, BigInt(rate.replace(".", "")), row.factor);
  });
  if (problems.length === 0 && has("rate") && payrollSystemGrossCents !== expectedGrossCents) problems.push(`the receiver's gross ${formatCents(payrollSystemGrossCents)} ≠ ${formatCents(expectedGrossCents)}`);
  if (problems.length > 0) throw new ExportError("does_not_reconcile", `The ${opts.file} does not reconcile to the run: ${problems.join("; ")}.`);
  if (!has("rate")) payrollSystemGrossCents = expectedGrossCents;

  const controlTotals: ControlTotals = {
    workers: c.workers.length,
    minutesByType: c.minutesByType,
    ...(Object.keys(c.amountsByType).length > 0 ? { amountsByType: c.amountsByType } : {}),
    grossCents: c.grossCents,
    payrollSystemGrossCents,
    payrollSystemDifferenceCents: payrollSystemGrossCents - c.grossCents,
  };

  const name = layout.fileName.replaceAll("{start}", fixture.period.startsOn).replaceAll("{end}", fixture.period.endsOn);
  const dot = name.lastIndexOf(".");
  return {
    filename: fixture.correction ? `${name.slice(0, dot)}-correction-${fixture.correction.version}${name.slice(dot)}` : name,
    mediaType: name.endsWith(".txt") ? "text/plain" : "text/csv",
    bytes,
    controlTotals,
    notes,
  };
}
