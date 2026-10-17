/**
 * The broker's payroll by class (docs/patterns/money/insurance.md; Patriot's Workers' Comp Wages report
 * as CSV): one row per state and class with the overtime premium apart (NCRB Rule 2-C-2-a), and the
 * total. Amounts in dollars from integer cents; a cell a spreadsheet would run is kept as text. Pure.
 */
import { floorDiv, mod } from "@shiftbook/rules";
import type { WcPacketView } from "../compliance/documents";

const money = (c: number) => `${c < 0 ? "-" : ""}${floorDiv(Math.abs(c), 100)}.${String(mod(Math.abs(c), 100)).padStart(2, "0")}`;
const hours = (m: number) => `${floorDiv(m, 60)}:${String(mod(m, 60)).padStart(2, "0")}`;
const cell = (x: string) => {
  const safe = /^[=+\-@\t\r]/.test(x) && Number.isNaN(Number(x)) ? `'${x}` : x;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

export function brokerCsv(v: Pick<WcPacketView, "classes" | "totals">): string {
  const head = ["State", "Class", "Description", "Hours", "Straight time", "Overtime premium", "Double-time premium", "Other pay", "Total pay"];
  const rows = v.classes.map((c) => [c.state, c.classCode, c.description ?? "", hours(c.minutes), money(c.straightCents), money(c.otPremiumCents), money(c.dtPremiumCents), money(c.otherCents), money(c.totalCents)]);
  const total = ["Total", "", "", hours(v.totals.minutes), money(v.totals.straightCents), money(v.totals.otPremiumCents), money(v.totals.dtPremiumCents), money(v.totals.otherCents), money(v.totals.totalCents)];
  return [head, ...rows, total].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
