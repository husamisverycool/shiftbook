/**
 * Paychex Flex Standard Payroll Import (SPI) — SPEC §27 item 4; decision 0040.
 *
 * Research (docs/research/payroll-formats-slice-f.md §5.1, columns HIGH from Deltek's Paychex export
 * spec; Paychex's own pages returned 404): sixteen columns in a fixed order, a header row allowed but
 * not needed, `mm/dd/yyyy` dates; Pay Component is the company's own code, case-sensitive; Rate
 * overrides the stored rate; Hours or Units, not both; "Amount must be empty if Hours is nonzero";
 * "Use only one of Rate, Rate #, or Amount per earning."
 *
 * Declared capability: every kind of pay under the pay component the agency maps — as hours with the
 * line's own rate written (Paychex pays hours × that rate), or as dollars in Amount. Hours are written
 * with two decimals rounded up (no worked time lost); the notes say what that does to Paychex's gross.
 */
import { renderLayout } from "./spreadsheet";
import { targetOf } from "./collect";
import type { ExportFixture, ExportResult } from "./registry";
import type { SpreadsheetLayout } from "./targets";

export const PAYCHEX_HEADER = [
  "Client ID",
  "Worker ID",
  "Org",
  "Job Number",
  "Pay Component",
  "Rate",
  "Rate Number",
  "Hours",
  "Units",
  "Line Date",
  "Amount",
  "Check Seq Number",
  "Override State",
  "Override Local",
  "Override Local Jurisdiction",
  "Labor Assignment",
] as const;

export function paychexLayout(clientId: string): SpreadsheetLayout {
  const blank = (header: string) => ({ field: "fixed" as const, header, value: "" });
  return {
    fileName: "paychex-flex-{start}-to-{end}.csv",
    delimiter: "comma",
    header: true,
    dateFormat: "MM/DD/YYYY",
    columns: [
      { field: "fixed", header: "Client ID", value: clientId },
      { field: "worker_id", header: "Worker ID" },
      blank("Org"),
      blank("Job Number"),
      { field: "earning_code", header: "Pay Component" },
      { field: "rate", header: "Rate" },
      blank("Rate Number"),
      { field: "hours", header: "Hours" },
      blank("Units"),
      { field: "week_end", header: "Line Date" },
      { field: "amount", header: "Amount" },
      blank("Check Seq Number"),
      blank("Override State"),
      blank("Override Local"),
      blank("Override Local Jurisdiction"),
      blank("Labor Assignment"),
    ],
  };
}

export function renderPaychexFlex(fixture: ExportFixture): ExportResult {
  const target = targetOf(fixture, "paychex_flex_csv");
  return renderLayout(fixture, "paychex_flex_csv", paychexLayout(target.clientId), { amountOn: "dollars_rows", file: "Paychex Flex file", receiver: "Paychex Flex" });
}
