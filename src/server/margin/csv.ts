/**
 * The margin as CSV (docs/patterns/margin.md: export the summary as shown, or every line; Stripe
 * Billing analytics). Amounts in dollars with two decimals; a cell a spreadsheet would run as a
 * formula is kept as text (as the aging CSV, decision 0019).
 */
import { floorDiv, formatCents, mod, roundHalfUp } from "@shiftbook/rules";
import { formatPermille, type MarginGroup, type MarginLine } from "./margin";
import type { OvertimeRow } from "./leakage";

const money = (c: number) => (c < 0 ? `-${formatCents(-c).slice(1)}` : formatCents(c).slice(1)).replaceAll(",", "");
const cell = (v: string) => {
  const safe = /^[=+\-@\t\r]/.test(v) && Number.isNaN(Number(v)) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};
const csv = (rows: string[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
/** Minutes as decimal hours to two places, rounded half up once: 2760 → "46.00", 50 → "0.83". */
export function decimalHours(minutes: number): string {
  const hundredths = roundHalfUp(Math.abs(minutes) * 100, 60);
  return `${minutes < 0 ? "-" : ""}${floorDiv(hundredths, 100)}.${String(mod(hundredths, 100)).padStart(2, "0")}`;
}

export function marginSummaryCsv(groups: MarginGroup[], groupLabel: string, noneLabel: string): string {
  const head = [groupLabel, "Hours", "Billed", "Pay", "Estimated burden", "Gross margin", "Margin %"];
  return csv([
    head,
    ...groups.map((g) => [g.name ?? noneLabel, decimalHours(g.totals.minutesPaid), money(g.totals.billedCents), money(g.totals.payCents), money(g.totals.burdenCents), money(g.totals.marginCents), g.totals.marginPermille === null ? "" : formatPermille(g.totals.marginPermille)]),
  ]);
}

export function marginLinesCsv(lines: MarginLine[]): string {
  const head = ["Week", "Client", "Worker", "Recruiter", "Branch", "Hours", "Billed", "Pay", "Estimated burden", "Gross margin", "Burden incomplete"];
  return csv([
    head,
    ...[...lines]
      .sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : (a.clientName ?? "") < (b.clientName ?? "") ? -1 : (a.clientName ?? "") > (b.clientName ?? "") ? 1 : a.workerName < b.workerName ? -1 : 1))
      .map((l) => [l.week, l.clientName ?? "", l.workerName, l.recruiterName ?? "", l.branchName ?? "", decimalHours(l.minutesPaid), money(l.billedCents), money(l.payCents), money(l.burdenCents), money(l.billedCents - l.payCents - l.burdenCents), l.incomplete ? "yes" : ""]),
  ]);
}

export function overtimeCsv(rows: (OvertimeRow & { clientName: string; workerName: string })[]): string {
  const head = ["Week", "Client", "Worker", "Overtime hours paid", "Billed at the multiplier", "Billed at straight time", "Not billed", "Premium not billed", "Client's terms"];
  return csv([head, ...rows.map((r) => [r.week, r.clientName, r.workerName, decimalHours(r.paidMinutes), decimalHours(r.multiplierMinutes), decimalHours(r.straightMinutes), decimalHours(r.notBilledMinutes), money(r.premiumNotBilledCents), r.reasons.join(" ")])]);
}
