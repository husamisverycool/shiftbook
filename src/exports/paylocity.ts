/**
 * Paylocity WebPay time import batch (TimeImprt) — SPEC §27 item 4; decision 0040.
 *
 * Research (docs/research/connections-exports-slice-s.md §5; LOW confidence: two third-party vendor
 * guides agree, Paylocity's own layout is not public): seven columns in this order — Id, Det (always
 * "E" for earnings), detCode, Hours, Amount, Rate, rateCode — "do not rename the column headers or
 * change their order"; codes are the company's own, case-sensitive.
 *
 * Declared capability: every kind of pay under the detCode the agency maps — as hours with the line's
 * own rate written, or as dollars in Amount (never both on one row). rateCode is left blank. The
 * import's Status Report lists anything Paylocity refuses before it is posted.
 */
import { renderLayout } from "./spreadsheet";
import { targetOf } from "./collect";
import type { ExportFixture, ExportResult } from "./registry";
import type { SpreadsheetLayout } from "./targets";

export const PAYLOCITY_HEADER = ["Id", "Det", "detCode", "Hours", "Amount", "Rate", "rateCode"] as const;

export const PAYLOCITY_LAYOUT: SpreadsheetLayout = {
  fileName: "paylocity-time-import-{start}-to-{end}.csv",
  delimiter: "comma",
  header: true,
  dateFormat: "MM/DD/YYYY",
  columns: [
    { field: "worker_id", header: "Id" },
    { field: "fixed", header: "Det", value: "E" },
    { field: "earning_code", header: "detCode" },
    { field: "hours", header: "Hours" },
    { field: "amount", header: "Amount" },
    { field: "rate", header: "Rate" },
    { field: "fixed", header: "rateCode", value: "" },
  ],
};

export function renderPaylocity(fixture: ExportFixture): ExportResult {
  targetOf(fixture, "paylocity_time_csv");
  return renderLayout(fixture, "paylocity_time_csv", PAYLOCITY_LAYOUT, { amountOn: "dollars_rows", file: "Paylocity file", receiver: "Paylocity" });
}
