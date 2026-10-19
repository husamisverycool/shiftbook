/**
 * ADP Workforce Now paydata file (`PRcccEPI.csv`) — SPEC §13; slice f, decision F4.
 *
 * ADP's "Importing Paydata" guide (research §3): one header record, then data records; comma
 * delimited, CRLF; ASCII 32–91 and 93–122 only; blanks, never zeros, for no data; explicit decimals.
 * The first three columns are `Co Code`, `Batch ID`, `File #`. The guide allows several records per
 * file number, each with its own `Temp Rate` (four decimals, at most 999.9999).
 *
 * Declared capability: every kind of pay. Hours go out as `Reg Hours`, `O/T Hours` or an `Hours 3`
 * code with the hours; ADP pays them at the row's `Temp Rate` × the multiple the agency declares for
 * the column (1 for regular hours; 1.5 for overtime by default). A line's Temp Rate is its rate ÷
 * that multiple, so overtime at a worked-week regular rate travels exactly (to four decimals). Money
 * (bonuses, premiums, top-ups) goes out as an `Earnings 3` code with dollars, paid as written. At most
 * four code pairs per record (the guide's limit without expanded fields): more dollars go on another
 * record. No name or SSN column (informational in ADP; the SSN never leaves Tabulado).
 *
 * Hours are written with two decimals rounded up (no worked time lost), as for Gusto; the notes say
 * what that does to ADP's gross.
 */
import { exactDecimal, formatCents, formatRate, roundHalfUpBig, type Fraction } from "@shiftbook/rules";
import type { ControlTotals } from "../server/db/schema";
import { collect, correctionNote, KIND_ORDER, targetOf, who, writesSomething, type CollectedWorker } from "./collect";
import { readCsv, writeCsv } from "./csv";
import { ExportError } from "./errors";
import { hundredthsToMinutes, readTwoDecimals, sameRate, signedCents, toHundredths, twoDecimals } from "./lines";
import type { ExportFixture, ExportResult } from "./registry";
import { adpWfnFileName } from "./targets";

const FIXED = ["Co Code", "Batch ID", "File #", "Temp Rate", "Reg Hours", "O/T Hours"] as const;
const HOURS_PAIR = ["Hours 3 Code", "Hours 3 Amount"] as const;
const EARNINGS_PAIR = ["Earnings 3 Code", "Earnings 3 Amount"] as const;
/** Without expanded fields, at most four Hours 3 / Earnings 3 code pairs per record. */
const MAX_PAIRS = 4;
/** Temp Rate's limit, in ten-thousandths of a dollar (999.9999). */
const MAX_TEMP_RATE = 9_999_999n;

/** cents per hour (exact) → ten-thousandths of a dollar, rounded half up: 1825 → 182500 ("18.2500"). */
const tenThousandths = (rate: Fraction) => BigInt(roundHalfUpBig(BigInt(rate.num) * 100n, BigInt(rate.den)));
/** 182500n → "18.2500" (string slicing: no division in pay code). */
const rateText = (t4: bigint) => {
  const s = t4.toString().padStart(5, "0");
  return `${s.slice(0, -4)}.${s.slice(-4)}`;
};
const factorText = (f: Fraction) => exactDecimal(f.num, f.den);

interface Cell {
  minutes: number;
  amountCents: number;
  types: Set<string>;
}
interface RateRow {
  rate: Fraction;
  t4: bigint;
  /** By column: "Reg Hours", "O/T Hours" or an Hours 3 code; each with its multiple. */
  cells: Map<string, Cell & { factor: Fraction }>;
}

export function renderAdpWfn(fixture: ExportFixture): ExportResult {
  const target = targetOf(fixture, "adp_wfn_paydata");
  const c = collect(fixture, "adp_wfn_paydata", { storedRate: false, carries: "every kind of pay" });
  const version = fixture.correction?.version ?? 1;
  const [yy, mm, dd] = [fixture.period.endsOn.slice(2, 4), fixture.period.endsOn.slice(5, 7), fixture.period.endsOn.slice(8, 10)];
  const batch = `${yy}${mm}${dd}${String(version).padStart(2, "0")}`;
  // ADP's Batch ID is at most 8 characters: the date and a two-digit version.
  if (batch.length > 8) throw new ExportError("file_limit", `ADP's batch id holds at most 8 characters, so version ${version} of this period cannot be numbered (${batch}). Pay this correction by hand.`);

  // Each worker's rows: one per Temp Rate (hours), then dollars by code.
  const plans = c.workers.map((w) => planWorker(w));
  function planWorker(w: CollectedWorker) {
    const rows: RateRow[] = [];
    const dollars = new Map<string, Cell & { rank: number }>();
    for (const { line, bucket } of w.lines) {
      if (bucket.as === "dollars") {
        const d = dollars.get(bucket.code) ?? { minutes: 0, amountCents: 0, types: new Set<string>(), rank: KIND_ORDER.indexOf(line.type) };
        d.amountCents += line.amountCents;
        d.types.add(line.type);
        d.rank = Math.min(d.rank, KIND_ORDER.indexOf(line.type));
        dollars.set(bucket.code, d);
        continue;
      }
      // The Temp Rate that, times the column's multiple, is the line's rate.
      const rate = { num: line.rate.num * bucket.factor.den, den: line.rate.den * bucket.factor.num };
      const t4 = tenThousandths(rate);
      if (t4 > MAX_TEMP_RATE) {
        throw new ExportError("invalid_pay_line", `${who(w.worker)}: the ${line.type} pay line's rate (${formatRate(rate)} before ADP's multiple) is above ADP's Temp Rate limit of 999.9999. Skip this worker and pay them by hand.`, w.worker.workerId);
      }
      let row = rows.find((r) => sameRate(r.rate, rate));
      if (!row) {
        row = { rate, t4, cells: new Map() };
        rows.push(row);
      }
      const cell = row.cells.get(bucket.code) ?? { minutes: 0, amountCents: 0, types: new Set<string>(), factor: bucket.factor };
      cell.minutes += line.minutes;
      cell.amountCents += line.amountCents;
      cell.types.add(line.type);
      row.cells.set(bucket.code, cell);
    }
    // Blanks, never zeros: a row or a dollars code that adds up to nothing is left out.
    const rateRows = [...rows].filter((r) => [...r.cells.values()].some((c) => c.minutes > 0)).sort((a, b) => {
      const x = BigInt(a.rate.num) * BigInt(b.rate.den);
      const y = BigInt(b.rate.num) * BigInt(a.rate.den);
      return x < y ? -1 : x > y ? 1 : 0;
    });
    const dollarCodes = [...dollars.entries()].filter(([, d]) => d.amountCents !== 0).sort((a, b) => a[1].rank - b[1].rank || (a[0] < b[0] ? -1 : 1));
    return { w, rateRows, dollarCodes };
  }

  const hoursPairs = Math.max(0, ...plans.flatMap((p) => p.rateRows.map((r) => [...r.cells.keys()].filter((k) => k !== "Reg Hours" && k !== "O/T Hours").length)));
  if (hoursPairs > MAX_PAIRS) throw new ExportError("unsupported_earning_type", `A worker has more than ${MAX_PAIRS} hours codes at one rate; ADP takes ${MAX_PAIRS} per record.`);
  const maxDollars = Math.max(0, ...plans.map((p) => p.dollarCodes.length));
  const dollarPairs = maxDollars === 0 ? 0 : Math.min(MAX_PAIRS - hoursPairs, maxDollars);
  if (maxDollars > 0 && dollarPairs === 0) throw new ExportError("unsupported_earning_type", `Every code pair of an ADP record is taken by hours codes, so no dollars fit.`);
  const header = [...FIXED, ...Array.from({ length: hoursPairs }, () => HOURS_PAIR).flat(), ...Array.from({ length: dollarPairs }, () => EARNINGS_PAIR).flat()];

  const rows: string[][] = [header];
  const notes = correctionNote(fixture, "ADP Workforce Now");
  const declared = new Map<string, Fraction>();
  const workerNotes: string[] = [];
  let payrollSystemGrossCents = 0;
  const blank = (n: number) => Array.from({ length: n }, () => "");
  for (const { w, rateRows, dollarCodes } of plans) {
    for (const row of rateRows) {
      const hours = (code: string) => {
        const cell = row.cells.get(code);
        return cell && cell.minutes > 0 ? twoDecimals(toHundredths(cell.minutes)) : "";
      };
      const pairs = [...row.cells.entries()].filter(([k]) => k !== "Reg Hours" && k !== "O/T Hours" && row.cells.get(k)!.minutes > 0);
      rows.push([
        target.companyCode,
        batch,
        w.id,
        rateText(row.t4),
        hours("Reg Hours"),
        hours("O/T Hours"),
        ...pairs.flatMap(([code, cell]) => [code, twoDecimals(toHundredths(cell.minutes))]),
        ...blank(2 * (hoursPairs - pairs.length)),
        ...blank(2 * dollarPairs),
      ]);
      // What ADP pays for each column: hours × Temp Rate × the multiple, rounded to the cent.
      for (const [code, cell] of row.cells) {
        if (cell.minutes === 0) continue;
        if (code !== "Reg Hours") declared.set(code, cell.factor);
        const h = toHundredths(cell.minutes);
        const cents = Number(roundHalfUpBig(BigInt(h) * row.t4 * BigInt(cell.factor.num), 10_000n * BigInt(cell.factor.den)));
        payrollSystemGrossCents += cents;
        const exactHours = h * 60 === cell.minutes * 100;
        if (!exactHours || cents !== cell.amountCents) {
          const exactRate = row.t4 * BigInt(row.rate.den) === BigInt(row.rate.num) * 100n;
          const written = exactHours
            ? `${cell.minutes} min written as ${twoDecimals(h)} h (exact)`
            : `${cell.minutes} min written as ${twoDecimals(h)} h (${exactDecimal(cell.minutes, 60)} h exactly, rounded up to the next hundredth so no worked time is lost)`;
          const rateNote = exactRate ? "" : `, at a Temp Rate of ${rateText(row.t4)} (${formatRate(row.rate)} exactly, to ADP's four decimals)`;
          const factor = cell.factor.num === cell.factor.den ? "" : ` × ${factorText(cell.factor)}`;
          const why = exactHours && exactRate ? ", because Tabulado rounds each pay line separately" : "";
          workerNotes.push(
            `${who(w.worker)} — ${[...cell.types].join(", ")}: ${written}${rateNote}. ADP pays ${twoDecimals(h)} h × ${rateText(row.t4)}${factor} = ${formatCents(cents)}; Tabulado computed ${formatCents(cell.amountCents)} (${signedCents(cents - cell.amountCents)})${why}.`,
          );
        }
      }
    }
    for (let i = 0; i < dollarCodes.length; i += dollarPairs) {
      const chunk = dollarCodes.slice(i, i + dollarPairs);
      rows.push([target.companyCode, batch, w.id, "", "", "", ...blank(2 * hoursPairs), ...chunk.flatMap(([code, d]) => [code, twoDecimals(d.amountCents)]), ...blank(2 * (dollarPairs - chunk.length))]);
      for (const [, d] of chunk) payrollSystemGrossCents += d.amountCents;
    }
  }
  if (declared.size > 0) {
    const parts = [...declared.entries()].map(([code, f]) => `${code === "O/T Hours" ? "O/T Hours" : `code ${code}`} at Temp Rate × ${factorText(f)}`);
    notes.push(`ADP prices ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`}: the multiples in the payroll file settings. If ADP is set up with other multiples, its gross will differ.`);
  }
  notes.push(...workerNotes);

  // Only characters ADP accepts (ASCII 32–91 and 93–122); every value was checked, this is the backstop.
  const bytes = writeCsv(rows, { eol: "\r\n" });
  for (const b of bytes) {
    if (b !== 13 && b !== 10 && (b < 32 || b > 122 || b === 92)) throw new ExportError("does_not_reconcile", `The ADP file would hold a character ADP refuses (byte ${b}).`);
  }
  const controlTotals: ControlTotals = {
    workers: c.workers.filter(writesSomething).length,
    minutesByType: c.minutesByType,
    ...(Object.keys(c.amountsByType).length > 0 ? { amountsByType: c.amountsByType } : {}),
    grossCents: c.grossCents,
    payrollSystemGrossCents,
    payrollSystemDifferenceCents: payrollSystemGrossCents - c.grossCents,
  };
  reconcile(new TextDecoder().decode(bytes), c.workers);
  return { filename: adpWfnFileName(target.companyCode), mediaType: "text/csv", bytes, controlTotals, notes };
}

/** Reads the file back: per file number, minutes per hours column or code and cents per earnings code. */
export function parseAdpWfn(text: string): Map<string, { minutes: Map<string, number>; cents: Map<string, number> }> {
  const [header, ...rows] = readCsv(text);
  if (!header || header.slice(0, FIXED.length).join(",") !== FIXED.join(",")) throw new ExportError("does_not_reconcile", "The ADP file header is not the expected header.");
  const out = new Map<string, { minutes: Map<string, number>; cents: Map<string, number> }>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const r of rows) {
    const entry = out.get(r[2]!) ?? { minutes: new Map<string, number>(), cents: new Map<string, number>() };
    const hours = (v: string) => hundredthsToMinutes(readTwoDecimals(v, "hours", "ADP file"));
    if (r[4]) add(entry.minutes, "Reg Hours", hours(r[4]));
    if (r[5]) add(entry.minutes, "O/T Hours", hours(r[5]));
    for (let i = FIXED.length; i < header.length; i += 2) {
      const code = r[i] ?? "";
      if (!code) continue;
      if (header[i] === HOURS_PAIR[0]) add(entry.minutes, code, hours(r[i + 1] ?? ""));
      else add(entry.cents, code, readTwoDecimals(r[i + 1] ?? "", "amount", "ADP file"));
    }
    out.set(r[2]!, entry);
  }
  return out;
}

function reconcile(text: string, workers: CollectedWorker[]): void {
  const parsed = parseAdpWfn(text);
  const problems: string[] = [];
  const written = workers.filter(writesSomething).length;
  if (parsed.size !== written) problems.push(`workers ${parsed.size} ≠ ${written}`);
  for (const w of workers) {
    const minutes = new Map<string, number>();
    const cents = new Map<string, number>();
    for (const { line, bucket } of w.lines) {
      if (bucket.as === "hours") minutes.set(bucket.code, (minutes.get(bucket.code) ?? 0) + line.minutes);
      else cents.set(bucket.code, (cents.get(bucket.code) ?? 0) + line.amountCents);
    }
    const got = parsed.get(w.id);
    for (const [code, m] of minutes) if ((got?.minutes.get(code) ?? 0) !== m) problems.push(`${w.id} ${code} minutes ${got?.minutes.get(code) ?? 0} ≠ ${m}`);
    for (const [code, v] of cents) if ((got?.cents.get(code) ?? 0) !== v) problems.push(`${w.id} ${code} cents ${got?.cents.get(code) ?? 0} ≠ ${v}`);
  }
  if (problems.length > 0) throw new ExportError("does_not_reconcile", `The ADP file does not reconcile to the run: ${problems.join("; ")}.`);
}
