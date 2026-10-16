/**
 * The margin as CSV (docs/patterns/margin.md: export the summary as shown, or every line; Stripe
 * Billing analytics). Amounts in dollars with two decimals; a cell a spreadsheet would run as a
 * formula is kept as text (as the aging CSV, decision 0019).
 */
import { floorDiv, formatCents, mod, roundHalfUp } from "@shiftbook/rules";
import { formatPermille, type GroupBy, type MarginGroup, type MarginLine } from "./margin";
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

/** Column names in the screen's language (review nit: the CSV speaks the page's language). */
export interface MarginCsvLabels {
  groups: Record<GroupBy, string>;
  hours: string;
  billed: string;
  pay: string;
  burden: string;
  margin: string;
  percent: string;
  none: string;
  incomplete: string;
  overtime: { week: string; client: string; worker: string; paid: string; atMultiplier: string; atStraight: string; notBilled: string; premium: string; terms: string; reasons: Record<string, string> };
}

type MarginMessages = (typeof import("../../../messages/en.json"))["margin"];

export const marginCsvLabels = (m: MarginMessages): MarginCsvLabels => ({
  groups: m.groups,
  hours: m.cols.hours,
  billed: m.cards.billed,
  pay: m.cards.pay,
  burden: m.cards.burden,
  margin: m.cards.margin,
  percent: m.cards.percent,
  none: m.none,
  incomplete: m.csvIncomplete,
  overtime: { ...m.overtime, reasons: m.overtime.reasons },
});

export function marginSummaryCsv(groups: MarginGroup[], by: GroupBy, l: MarginCsvLabels): string {
  const head = [l.groups[by], l.hours, l.billed, l.pay, l.burden, l.margin, l.percent];
  return csv([
    head,
    ...groups.map((g) => [g.name ?? l.none, decimalHours(g.totals.minutesPaid), money(g.totals.billedCents), money(g.totals.payCents), money(g.totals.burdenCents), money(g.totals.marginCents), g.totals.marginPermille === null ? "" : formatPermille(g.totals.marginPermille)]),
  ]);
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function marginLinesCsv(lines: MarginLine[], l: MarginCsvLabels): string {
  const head = [l.groups.week, l.groups.client, l.groups.worker, l.groups.recruiter, l.groups.branch, l.hours, l.billed, l.pay, l.burden, l.margin, l.incomplete];
  return csv([
    head,
    ...[...lines]
      .sort((a, b) => cmp(a.week, b.week) || cmp(a.clientName ?? "", b.clientName ?? "") || cmp(a.workerName, b.workerName))
      .map((x) => [x.week, x.clientName ?? "", x.workerName, x.recruiterName ?? "", x.branchName ?? "", decimalHours(x.minutesPaid), money(x.billedCents), money(x.payCents), money(x.burdenCents), money(x.billedCents - x.payCents - x.burdenCents), x.incomplete > 0 ? String(x.incomplete) : ""]),
  ]);
}

export function overtimeCsv(rows: (OvertimeRow & { clientName: string; workerName: string })[], l: MarginCsvLabels): string {
  const o = l.overtime;
  const head = [o.week, o.client, o.worker, o.paid, o.atMultiplier, o.atStraight, o.notBilled, o.premium, o.terms];
  return csv([head, ...rows.map((r) => [r.week, r.clientName, r.workerName, decimalHours(r.paidMinutes), decimalHours(r.multiplierMinutes), decimalHours(r.straightMinutes), decimalHours(r.notBilledMinutes), money(r.premiumNotBilledCents), r.reasons.map((x) => o.reasons[x] ?? x).join("; ")])]);
}
