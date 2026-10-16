import { describe, expect, it } from "vitest";
import { renderSpreadsheet } from "./spreadsheet";
import type { ExportFixture } from "./registry";
import { DEFAULT_LAYOUT, type SpreadsheetLayout } from "./targets";

const REG = { num: 1825, den: 1 };
const fixtureWith = (layout: SpreadsheetLayout, over: Partial<ExportFixture> = {}): ExportFixture => ({
  format: "spreadsheet_csv",
  mappingVersion: "spreadsheet-v1",
  period: { startsOn: "2026-10-05", endsOn: "2026-10-11" },
  earningCodeMap: {},
  target: { format: "spreadsheet_csv", layout },
  codes: { REG: { code: "", as: "hours" }, OT: { code: "OT15", as: "hours" }, BONUS: { code: "", as: "dollars" } },
  workers: [
    { workerId: "w1", firstName: "Ana", lastName: "Álvarez", payrollIds: { spreadsheet: { id: "A-001" } } },
    { workerId: "w2", firstName: "Ben", lastName: "Okafor", payrollIds: { spreadsheet: { id: "B-002" } } },
  ],
  payLines: [
    { workerId: "w2", type: "REG", minutes: 2280, amountCents: 69_350, rate: REG, workweekStart: "2026-10-05" },
    { workerId: "w1", type: "REG", minutes: 2400, amountCents: 73_000, rate: REG, workweekStart: "2026-10-05" },
    { workerId: "w1", type: "OT", minutes: 37, amountCents: 1688, rate: { num: 5475, den: 2 }, workweekStart: "2026-10-05" },
    { workerId: "w1", type: "BONUS", minutes: 0, amountCents: 15_000, rate: { num: 15_000, den: 1 }, workweekStart: "2026-10-05" },
  ],
  ...over,
});
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("Spreadsheet (the agency's own layout)", () => {
  it("writes one row per pay line in the agency's columns, hours to two decimals, rates to four, amounts to the cent", () => {
    const r = renderSpreadsheet(fixtureWith(DEFAULT_LAYOUT));
    expect(r.filename).toBe("payroll-2026-10-05-to-2026-10-11.csv");
    expect(text(r.bytes)).toBe(
      [
        "Worker ID,Last name,First name,Week ending,Earning code,Hours,Rate,Amount",
        "A-001,Álvarez,Ana,10/11/2026,REG,40.00,18.2500,730.00",
        "A-001,Álvarez,Ana,10/11/2026,OT15,0.62,27.3750,16.88",
        "A-001,Álvarez,Ana,10/11/2026,BONUS,,,150.00",
        "B-002,Okafor,Ben,10/11/2026,REG,38.00,18.2500,693.50",
        "",
      ].join("\r\n"),
    );
    // The amount column carries Shiftbook's exact pay: the receiver pays what is written.
    expect(r.controlTotals).toEqual({ workers: 2, minutesByType: { REG: 4680, OT: 37 }, amountsByType: { BONUS: 15_000 }, grossCents: 159_038, payrollSystemGrossCents: 159_038, payrollSystemDifferenceCents: 0 });
    expect(r.notes).toEqual([]);
  });

  it("uses the agency's delimiter, date format, fixed text and file name, with or without a header row", () => {
    const layout: SpreadsheetLayout = {
      fileName: "factor-{end}.txt",
      delimiter: "tab",
      header: false,
      dateFormat: "YYYY-MM-DD",
      columns: [
        { field: "fixed", header: "Client", value: "SAMPLE STAFFING" },
        { field: "worker_id", header: "Employee" },
        { field: "period_start", header: "From" },
        { field: "period_end", header: "To" },
        { field: "week_start", header: "Week" },
        { field: "earning_code", header: "Code" },
        { field: "amount", header: "Pay" },
      ],
    };
    const r = renderSpreadsheet(fixtureWith(layout, { payLines: fixtureWith(layout).payLines.slice(0, 1) }));
    expect(r.filename).toBe("factor-2026-10-11.txt");
    expect(text(r.bytes)).toBe("SAMPLE STAFFING\tB-002\t2026-10-05\t2026-10-11\t2026-10-05\tREG\t693.50\r\n");
  });

  it("prices hours × the written rate when there is no amount column, and notes the difference", () => {
    const layout: SpreadsheetLayout = { ...DEFAULT_LAYOUT, columns: DEFAULT_LAYOUT.columns.filter((c) => c.field !== "amount") };
    const r = renderSpreadsheet(fixtureWith(layout, { payLines: fixtureWith(layout).payLines.slice(1, 3) }));
    // 0.62 h × $27.3750 = $16.9725 → $16.97 against $16.88.
    expect(r.controlTotals.payrollSystemDifferenceCents).toBe(9);
    expect(r.notes).toEqual([
      "Álvarez, Ana — OT: 37 min written as 0.62 h (0.6166… h exactly, rounded up to the next hundredth so no worked time is lost). The receiver pays 0.62 h × 27.3750 = $16.97; Shiftbook computed $16.88 (+$0.09).",
    ]);
  });

  it("refuses dollars when the layout has no amount column, naming the worker", () => {
    const layout: SpreadsheetLayout = { ...DEFAULT_LAYOUT, columns: DEFAULT_LAYOUT.columns.filter((c) => c.field !== "amount") };
    expect(() => renderSpreadsheet(fixtureWith(layout))).toThrowError(expect.objectContaining({ code: "unsupported_earning_type", workerId: "w1", message: expect.stringContaining("the spreadsheet has no amount column, so it cannot carry a bonus") }));
  });

  it("quotes a value that holds the delimiter", () => {
    const layout: SpreadsheetLayout = { ...DEFAULT_LAYOUT, columns: [{ field: "fixed", header: "Note", value: "Weekly, hourly" }, ...DEFAULT_LAYOUT.columns] };
    expect(text(renderSpreadsheet(fixtureWith(layout)).bytes).split("\r\n")[1]).toBe('"Weekly, hourly",A-001,Álvarez,Ana,10/11/2026,REG,40.00,18.2500,730.00');
  });

  it("refuses a worker with no id in the spreadsheet", () => {
    expect(() => renderSpreadsheet(fixtureWith(DEFAULT_LAYOUT, { workers: [fixtureWith(DEFAULT_LAYOUT).workers[0]!, { workerId: "w2", firstName: "Ben", lastName: "Okafor", payrollIds: {} }] }))).toThrowError(
      expect.objectContaining({ code: "missing_payroll_id", workerId: "w2" }),
    );
  });

  it("names a correction for its version before the extension", () => {
    const r = renderSpreadsheet(fixtureWith(DEFAULT_LAYOUT, { payLines: [{ workerId: "w1", type: "REG", minutes: 60, amountCents: 1825, rate: REG, parts: 2, workweekStart: "2026-10-05" }], correction: { version: 2, baseVersion: 1 } }));
    expect(r.filename).toBe("payroll-2026-10-05-to-2026-10-11-correction-2.csv");
    expect(r.notes[0]).toContain("Correction 2 of this pay period");
  });
});
