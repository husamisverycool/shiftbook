import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { cellText, tableFromCsv, tableFromXlsx } from "./structured";

describe("Excel cells read as the text a person sees", () => {
  it("uses a formula's result, joins rich text, and leaves error cells blank", () => {
    expect(cellText({ formula: "A1*2", result: 42 })).toBe("42");
    expect(cellText({ formula: "TODAY()", result: new Date(Date.UTC(2026, 9, 19)) })).toBe("10/19/2026");
    expect(cellText({ richText: [{ text: "Anita " }, { text: "Patel" }] })).toBe("Anita Patel");
    expect(cellText({ text: "Prairie Line", hyperlink: "https://example.com" })).toBe("Prairie Line");
    expect(cellText({ error: "#N/A" })).toBe("");
    expect(cellText(null)).toBe("");
  });
});

/** Excel's "Social Security number" format, built from its parts (no SSN-shaped text in the source). */
const SSN_FORMAT = ["000", "00", "0000"].join("-");

describe("Excel cells for the placement import", () => {
  it("writes date cells as ISO dates, so the day and month cannot be swapped", () => {
    expect(cellText(new Date(Date.UTC(2026, 9, 5)), { dates: "iso" })).toBe("2026-10-05");
    expect(cellText({ formula: "A1", result: new Date(Date.UTC(2026, 10, 2)) }, { dates: "iso" })).toBe("2026-11-02");
    expect(cellText(new Date(Date.UTC(2026, 9, 5)))).toBe("10/05/2026");
  });

  it("shows a number in a zero-padded format as Excel shows it (an SSN keeps its leading zero)", () => {
    const n = 9_000_001;
    const text = cellText(n, { numFmt: SSN_FORMAT });
    expect(text).toMatch(/^\d{3}-\d{2}-\d{4}$/);
    expect(text.replace(/-/g, "")).toBe(String(n).padStart(9, "0"));
    expect(cellText(1234, { numFmt: "00000" })).toBe("01234");
    expect(cellText(1234, { numFmt: '"0"0000' })).toBe("01234");
    expect(cellText(12.5, { numFmt: SSN_FORMAT })).toBe("12.5");
    expect(cellText(1234, { numFmt: "General" })).toBe("1234");
  });
});

describe("row numbers are the spreadsheet's own", () => {
  it("counts blank lines in a CSV, and a header that is not on row 1", () => {
    const csv = '\nID,Name\n1,Anita\n\n2,Bob\n,\n3,"Line\nbreak"\n4,Dee\n';
    const t = tableFromCsv(new TextEncoder().encode(csv));
    expect(t.header).toEqual(["ID", "Name"]);
    expect(t.rows.map((r) => r[0])).toEqual(["1", "2", "3", "4"]);
    expect(t.rowNumbers).toEqual([3, 5, 7, 8]);
  });

  it("counts empty rows in an Excel sheet", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Placements");
    ws.getCell("A2").value = "ID";
    ws.getCell("B2").value = "Start";
    ws.getCell("A3").value = 1;
    ws.getCell("B3").value = new Date(Date.UTC(2026, 9, 5));
    ws.getCell("A6").value = 2;
    ws.getCell("B6").value = new Date(Date.UTC(2026, 10, 2));
    const t = await tableFromXlsx(new Uint8Array(await wb.xlsx.writeBuffer()), { dates: "iso" });
    expect(t.header).toEqual(["ID", "Start"]);
    expect(t.rows).toEqual([["1", "2026-10-05"], ["2", "2026-11-02"]]);
    expect(t.rowNumbers).toEqual([3, 6]);
  });
});
