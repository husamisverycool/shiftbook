/**
 * QuickBooks Online time CSV — SPEC §13; slice f, decision F3.
 *
 * QuickBooks Online (US) has no time import of its own; Intuit points to importer apps, which read
 * a CSV of time activities by column name (research §2): the date, the employee's exact display
 * name, a customer (required by the importers), the duration (H:MM or decimal) and whether it is
 * billable. Those importers set no payroll item, so every row lands as the employee's regular pay
 * at the rate stored in QuickBooks Online: this file carries regular hours only, and anything else
 * names the worker to pay by hand.
 *
 * Each worker's week of regular hours goes on the week's last day, in rows of at most 23:59 (as for
 * QuickBooks Desktop), durations in exact minutes; dates MM/DD/YYYY; UTF-8 with CRLF.
 */
import { formatCents, formatRate } from "@shiftbook/rules";
import type { ControlTotals } from "../server/db/schema";
import { collect, correctionNote, targetOf, totalsByCode, weekEnd, who } from "./collect";
import { readCsv, writeCsv } from "./csv";
import { ExportError } from "./errors";
import { cmp, formatDate, hoursMinutes, lineCents, readHoursMinutes, signedCents, splitMinutes } from "./lines";
import type { ExportFixture, ExportResult } from "./registry";

export const QBO_HEADER = ["Date", "Name", "Customer", "Hours", "Billable"] as const;
const MAX_ROW_MINUTES = 23 * 60 + 59;

export function renderQboTime(fixture: ExportFixture): ExportResult {
  const target = targetOf(fixture, "qbo_time_csv");
  const c = collect(fixture, "qbo_time_csv", { storedRate: true, carries: "regular hours" });
  const rows: string[][] = [[...QBO_HEADER]];
  const notes = correctionNote(fixture, "QuickBooks Online");
  let payrollSystemGrossCents = 0;
  for (const w of c.workers) {
    const perWeek = new Map<string, number>();
    for (const { line } of w.lines) perWeek.set(weekEnd(fixture, line), (perWeek.get(weekEnd(fixture, line)) ?? 0) + line.minutes);
    for (const [date, minutes] of [...perWeek].sort((a, b) => cmp(a[0], b[0]))) {
      if (minutes === 0) continue;
      for (const piece of splitMinutes(minutes, MAX_ROW_MINUTES)) rows.push([formatDate(date, "MM/DD/YYYY"), w.id, target.customer, hoursMinutes(piece), "No"]);
    }
    for (const t of totalsByCode(w)) {
      const cents = Number(lineCents(t.minutes, w.base!));
      payrollSystemGrossCents += cents;
      if (cents !== t.amountCents) {
        notes.push(`${who(w.worker)} — REG: QuickBooks Online pays ${hoursMinutes(t.minutes)} × ${formatRate(w.base!)} = ${formatCents(cents)}; Shiftbook computed ${formatCents(t.amountCents)} (${signedCents(cents - t.amountCents)}), because Shiftbook rounds each workweek's line separately.`);
      }
    }
  }
  const bytes = writeCsv(rows, { eol: "\r\n" });
  const controlTotals: ControlTotals = { workers: c.workers.length, minutesByType: c.minutesByType, grossCents: c.grossCents, payrollSystemGrossCents, payrollSystemDifferenceCents: payrollSystemGrossCents - c.grossCents };
  const parsed = parseQboTime(new TextDecoder().decode(bytes));
  const problems = [
    ...(parsed.size !== c.workers.length ? [`workers ${parsed.size} ≠ ${c.workers.length}`] : []),
    ...c.workers.flatMap((w) => {
      const want = w.lines.reduce((sum, l) => sum + l.line.minutes, 0);
      return parsed.get(w.id) === want ? [] : [`${w.id} minutes ${parsed.get(w.id) ?? 0} ≠ ${want}`];
    }),
  ];
  if (problems.length > 0) throw new ExportError("does_not_reconcile", `The QuickBooks Online file does not reconcile to the run: ${problems.join("; ")}.`);
  return {
    filename: `quickbooks-online-time-${fixture.period.startsOn}-to-${fixture.period.endsOn}${fixture.correction ? `-correction-${fixture.correction.version}` : ""}.csv`,
    mediaType: "text/csv",
    bytes,
    controlTotals,
    notes,
  };
}

/** Reads the file back: minutes per display name. */
export function parseQboTime(text: string): Map<string, number> {
  const [header, ...rows] = readCsv(text);
  if (header?.join(",") !== QBO_HEADER.join(",")) throw new ExportError("does_not_reconcile", "The QuickBooks Online file header is not the expected header.");
  const out = new Map<string, number>();
  for (const r of rows) out.set(r[1]!, (out.get(r[1]!) ?? 0) + readHoursMinutes(r[3] ?? "", "QuickBooks Online file"));
  return out;
}
