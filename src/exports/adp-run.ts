/**
 * RUN Powered by ADP time sheet import — SPEC §13; slice f, decision F5.
 *
 * ADP's partner guide (research §4): a .csv whose first row is the version `##GENERIC## V1.0`, the
 * second the column headings, then data; eleven columns in a fixed order; the company code, pay
 * frequency and period dates the same on every row; explicit decimals; rate codes only, never rates.
 *
 * Declared capability: each kind of pay under the earnings code the agency maps, as hours or as
 * dollars. RUN prices hours at the employee's stored rate (rate code BASE) × the earnings code's
 * multiple (1, 1.5 or 2), so every hours line must be exactly that; a worker with another rate is
 * refused (pay by hand, or map the kind as dollars). Dollars are paid as written.
 *
 * Hours are written with two decimals rounded up (no worked time lost); the notes say what that does
 * to RUN's gross. Pay frequency comes from the period: 7 days weekly (W), 14 days biweekly (B).
 */
import { addDays, exactDecimal, formatCents, formatRate, roundHalfUpBig } from "@shiftbook/rules";
import type { ControlTotals } from "../server/db/schema";
import { collect, correctionNote, targetOf, totalsByCode, who, writesSomething } from "./collect";
import { readCsv, writeCsv } from "./csv";
import { ExportError } from "./errors";
import { formatDate, hundredthsToMinutes, readTwoDecimals, signedCents, times, toHundredths, twoDecimals } from "./lines";
import type { ExportFixture, ExportResult } from "./registry";

export const RUN_VERSION_ROW = "##GENERIC## V1.0";
export const RUN_HEADER = ["Company Code", "Pay Frequency", "Pay Period Start", "Pay Period End", "Employee ID", "Earnings Code", "Pay Hours", "Dollars", "Separate Check", "Worked Department", "Rate Code"] as const;


export function renderAdpRun(fixture: ExportFixture): ExportResult {
  const target = targetOf(fixture, "adp_run_csv");
  const { startsOn, endsOn } = fixture.period;
  const frequency = addDays(startsOn, 6) === endsOn ? "W" : addDays(startsOn, 13) === endsOn ? "B" : null;
  if (!frequency) throw new ExportError("unsupported_period", `RUN imports weekly or biweekly pay periods; ${startsOn} to ${endsOn} is neither.`);
  const c = collect(fixture, "adp_run_csv", { storedRate: true, carries: "the kinds of pay mapped to its earnings codes" });
  const start = formatDate(fixture.period.startsOn, "MM/DD/YYYY");
  const end = formatDate(fixture.period.endsOn, "MM/DD/YYYY");
  const rows: string[][] = [[RUN_VERSION_ROW], [...RUN_HEADER]];
  const notes = correctionNote(fixture, "RUN Powered by ADP");
  let payrollSystemGrossCents = 0;
  for (const w of c.workers) {
    for (const t of totalsByCode(w)) {
      // Blanks, never zeros: nothing to carry, no row.
      if (t.as === "hours" ? t.minutes === 0 : t.amountCents === 0) continue;
      if (t.as === "dollars") {
        rows.push([target.companyCode, frequency, start, end, w.id, t.code, "", twoDecimals(t.amountCents), "0", "", "BASE"]);
        payrollSystemGrossCents += t.amountCents;
        continue;
      }
      const h = toHundredths(t.minutes);
      rows.push([target.companyCode, frequency, start, end, w.id, t.code, twoDecimals(h), "", "0", "", "BASE"]);
      const rate = times(w.base!, t.factor);
      const cents = roundHalfUpBig(BigInt(h) * BigInt(rate.num), 100n * BigInt(rate.den));
      payrollSystemGrossCents += cents;
      const exactHours = h * 60 === t.minutes * 100;
      if (!exactHours || cents !== t.amountCents) {
        const written = exactHours ? `${t.minutes} min written as ${twoDecimals(h)} h (exact)` : `${t.minutes} min written as ${twoDecimals(h)} h (${exactDecimal(t.minutes, 60)} h exactly, rounded up to the next hundredth so no worked time is lost)`;
        const factor = t.factor.num === t.factor.den ? "" : ` × ${exactDecimal(t.factor.num, t.factor.den)}`;
        const why = exactHours ? ", because Tabulado rounds each pay line separately" : "";
        notes.push(`${who(w.worker)} — ${t.types.join(", ")}: ${written}. RUN pays ${twoDecimals(h)} h × ${formatRate(w.base!)}${factor} = ${formatCents(cents)}; Tabulado computed ${formatCents(t.amountCents)} (${signedCents(cents - t.amountCents)})${why}.`);
      }
    }
  }
  const bytes = writeCsv(rows, { eol: "\r\n" });
  const controlTotals: ControlTotals = {
    workers: c.workers.filter(writesSomething).length,
    minutesByType: c.minutesByType,
    ...(Object.keys(c.amountsByType).length > 0 ? { amountsByType: c.amountsByType } : {}),
    grossCents: c.grossCents,
    payrollSystemGrossCents,
    payrollSystemDifferenceCents: payrollSystemGrossCents - c.grossCents,
  };
  const parsed = parseAdpRun(new TextDecoder().decode(bytes));
  const written = c.workers.filter(writesSomething).length;
  const problems: string[] = parsed.size !== written ? [`workers ${parsed.size} ≠ ${written}`] : [];
  for (const w of c.workers) {
    for (const t of totalsByCode(w)) {
      const got = t.as === "hours" ? parsed.get(w.id)?.minutes.get(t.code) : parsed.get(w.id)?.cents.get(t.code);
      const want = t.as === "hours" ? t.minutes : t.amountCents;
      if ((got ?? 0) !== want) problems.push(`${w.id} ${t.code} ${got ?? 0} ≠ ${want}`);
    }
  }
  if (problems.length > 0) throw new ExportError("does_not_reconcile", `The RUN file does not reconcile to the run: ${problems.join("; ")}.`);
  return {
    filename: `adp-run-${fixture.period.startsOn}-to-${fixture.period.endsOn}${fixture.correction ? `-correction-${fixture.correction.version}` : ""}.csv`,
    mediaType: "text/csv",
    bytes,
    controlTotals,
    notes,
  };
}

/** Reads the file back: per employee id, minutes per hours code and cents per dollars code. */
export function parseAdpRun(text: string): Map<string, { minutes: Map<string, number>; cents: Map<string, number> }> {
  const [version, header, ...rows] = readCsv(text);
  if (version?.join(",") !== RUN_VERSION_ROW || header?.join(",") !== RUN_HEADER.join(",")) throw new ExportError("does_not_reconcile", "The RUN file does not start with the version row and the headings.");
  const out = new Map<string, { minutes: Map<string, number>; cents: Map<string, number> }>();
  for (const r of rows) {
    const e = out.get(r[4]!) ?? { minutes: new Map<string, number>(), cents: new Map<string, number>() };
    if (r[6]) e.minutes.set(r[5]!, (e.minutes.get(r[5]!) ?? 0) + hundredthsToMinutes(readTwoDecimals(r[6], "hours", "RUN file")));
    if (r[7]) e.cents.set(r[5]!, (e.cents.get(r[5]!) ?? 0) + readTwoDecimals(r[7], "dollars", "RUN file"));
    out.set(r[4]!, e);
  }
  return out;
}
