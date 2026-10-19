/**
 * QuickBooks Desktop time file (IIF, TIMEACT rows) — SPEC §13; slice f, decision F2.
 *
 * IIF is ASCII, TAB-separated, CRLF, with no quoting (research §1.2–§1.5). Each data row is one time
 * activity: DATE (MM/DD/YY), EMP (the employee's exact QuickBooks name), PITEM (the payroll item),
 * DURATION (H:MM, at most 23:59), XFERTOPAYROLL Y, BILLINGSTATUS 0 (payroll time, not billed). The
 * 2022-and-later file starts at the `!TIMEACT` header; the 2021-and-earlier file starts with the
 * Timer header naming the company file.
 *
 * Declared capability: hours only — regular, overtime, double time and holiday not worked — under
 * the payroll items the agency maps. QuickBooks prices them as the employee's stored rate × the
 * item's multiple (1, 1.5, 2, 1), so every line must be exactly that (the worker's one rate); dollars
 * (bonuses, premiums) cannot travel in IIF and name the worker.
 *
 * Each worker's week of hours per item goes on the week's last day, split into the fewest rows of at
 * most 23:59, as equal as whole minutes allow (40 h → 20:00 + 20:00). Durations are exact minutes.
 */
import { formatCents, formatRate, roundHalfUpBig } from "@shiftbook/rules";
import type { ControlTotals } from "../server/db/schema";
import { collect, correctionNote, KIND_ORDER, totalsByCode, weekEnd, who } from "./collect";
import { ExportError } from "./errors";
import { cmp, formatDate, hoursMinutes, readHoursMinutes, signedCents, splitMinutes, times } from "./lines";
import type { ExportFixture, ExportResult } from "./registry";
import { targetOf } from "./collect";

export const IIF_TIMEACT_HEADER = ["!TIMEACT", "DATE", "JOB", "EMP", "ITEM", "PITEM", "DURATION", "PROJ", "NOTE", "XFERTOPAYROLL", "BILLINGSTATUS"] as const;
const TIMER_HEADER = ["!TIMERHDR", "VER", "REL", "COMPANYNAME", "IMPORTEDBEFORE", "FROMTIMER", "COMPANYCREATETIME"] as const;
/** The file's limit per row (Intuit: DURATION cannot exceed 23:59). */
const MAX_ROW_MINUTES = 23 * 60 + 59;

export function renderQbdIif(fixture: ExportFixture): ExportResult {
  const target = targetOf(fixture, "qbd_iif");
  const c = collect(fixture, "qbd_iif", { storedRate: true, carries: "hours (regular, overtime, double time, holiday not worked)" });

  const lines: string[][] = [];
  if (target.version === "2021_or_earlier") {
    lines.push([...TIMER_HEADER], ["TIMERHDR", "8", "0", target.companyName, "N", "Y", target.companyCreateTime]);
  }
  lines.push([...IIF_TIMEACT_HEADER]);
  const notes = correctionNote(fixture, "QuickBooks Desktop");
  let payrollSystemGrossCents = 0;
  for (const w of c.workers) {
    // Rows: one per date and payroll item, split to the file's limit.
    const perDay = new Map<string, { date: string; code: string; rank: number; minutes: number }>();
    for (const { line, bucket } of w.lines) {
      const date = weekEnd(fixture, line);
      const key = `${date}|${bucket.code}`;
      const rank = KIND_ORDER.indexOf(line.type);
      const row = perDay.get(key) ?? { date, code: bucket.code, rank, minutes: 0 };
      row.minutes += line.minutes;
      row.rank = Math.min(row.rank, rank);
      perDay.set(key, row);
    }
    for (const row of [...perDay.values()].sort((a, b) => cmp(a.date, b.date) || a.rank - b.rank || cmp(a.code, b.code))) {
      if (row.minutes === 0) continue;
      for (const piece of splitMinutes(row.minutes, MAX_ROW_MINUTES)) {
        lines.push(["TIMEACT", formatDate(row.date, "MM/DD/YY"), "", w.id, "", row.code, hoursMinutes(piece), "", "", "Y", "0"]);
      }
    }
    // QuickBooks prices each item's time at the stored rate × the item's multiple.
    for (const t of totalsByCode(w)) {
      const rate = times(w.base!, t.factor);
      const cents = Number(roundHalfUpBig(BigInt(t.minutes) * BigInt(rate.num), 60n * BigInt(rate.den)));
      payrollSystemGrossCents += cents;
      if (cents !== t.amountCents) {
        notes.push(
          `${who(w.worker)} — ${t.types.join(", ")}: QuickBooks pays ${hoursMinutes(t.minutes)} × ${formatRate(rate)} = ${formatCents(cents)}; Tabulado computed ${formatCents(t.amountCents)} (${signedCents(cents - t.amountCents)}), because Tabulado rounds each workweek's line separately.`,
        );
      }
    }
  }
  // Every value is plain ASCII with no TAB (names and items were checked); the file is ASCII.
  const textOut = lines.map((l) => l.join("\t")).join("\r\n") + "\r\n";
  const bytes = new TextEncoder().encode(textOut);
  const controlTotals: ControlTotals = {
    workers: c.workers.length,
    minutesByType: c.minutesByType,
    grossCents: c.grossCents,
    payrollSystemGrossCents,
    payrollSystemDifferenceCents: payrollSystemGrossCents - c.grossCents,
  };
  // Read back: the same minutes per worker and payroll item.
  const parsed = parseQbdIif(textOut);
  const problems: string[] = [];
  if (parsed.size !== c.workers.length) problems.push(`workers ${parsed.size} ≠ ${c.workers.length}`);
  for (const w of c.workers) {
    for (const t of totalsByCode(w)) {
      const got = parsed.get(w.id)?.get(t.code) ?? 0;
      if (got !== t.minutes) problems.push(`${w.id} ${t.code} minutes ${got} ≠ ${t.minutes}`);
    }
  }
  if (problems.length > 0) throw new ExportError("does_not_reconcile", `The QuickBooks Desktop file does not reconcile to the run: ${problems.join("; ")}.`);

  return {
    filename: `quickbooks-time-${fixture.period.startsOn}-to-${fixture.period.endsOn}${fixture.correction ? `-correction-${fixture.correction.version}` : ""}.iif`,
    mediaType: "text/plain",
    bytes,
    controlTotals,
    notes,
  };
}

/** Reads an IIF time file back: minutes per employee name and payroll item. */
export function parseQbdIif(text: string): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  const rows = text.split("\r\n").filter((r) => r !== "");
  const header = rows.findIndex((r) => r.startsWith("!TIMEACT\t"));
  if (header < 0 || rows[header] !== IIF_TIMEACT_HEADER.join("\t")) throw new ExportError("does_not_reconcile", "The QuickBooks Desktop file has no TIMEACT header.");
  for (const r of rows.slice(header + 1)) {
    const f = r.split("\t");
    if (f[0] !== "TIMEACT" || f.length !== IIF_TIMEACT_HEADER.length) throw new ExportError("does_not_reconcile", `Unreadable row in the QuickBooks Desktop file: ${r}`);
    const minutes = readHoursMinutes(f[6]!, "QuickBooks Desktop file");
    if (minutes > MAX_ROW_MINUTES) throw new ExportError("does_not_reconcile", `A row of ${f[6]} is over the file's 23:59 limit.`);
    const items = out.get(f[3]!) ?? new Map<string, number>();
    items.set(f[5]!, (items.get(f[5]!) ?? 0) + minutes);
    out.set(f[3]!, items);
  }
  return out;
}
