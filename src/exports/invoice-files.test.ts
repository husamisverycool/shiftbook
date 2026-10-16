import { describe, expect, it } from "vitest";
import { fieldglassUpload, invoiceCsv, type InvoiceFileInput } from "./invoice-files";

const REG = { num: 2650, den: 1 };
const OT = { num: 3975, den: 1 };
const input = (over: Partial<InvoiceFileInput> = {}): InvoiceFileInput => ({
  number: "PCD-20261005",
  issuedOn: "2026-10-13",
  period: { startsOn: "2026-10-05", endsOn: "2026-10-11" },
  lines: [
    { workerName: "Marcus Bell", worksite: "Joliet Plant 2", poNumber: "PO-48213", workweekStart: "2026-10-05", type: "REG", minutes: 2400, rate: REG, amountCents: 106_000, timeSheetIds: ["XXXXTS00000001"], vmsWorkerId: "XXXXJS00000001" },
    { workerName: "Marcus Bell", worksite: "Joliet Plant 2", poNumber: "PO-48213", workweekStart: "2026-10-05", type: "OT", minutes: 37, rate: OT, amountCents: 2451, timeSheetIds: ["XXXXTS00000001"], vmsWorkerId: "XXXXJS00000001" },
    { workerName: "Anita Patel", worksite: "Joliet Plant 2", poNumber: null, workweekStart: "2026-10-05", type: "REG", minutes: 1440, rate: REG, amountCents: 63_600, timeSheetIds: ["XXXXTS00000002"], vmsWorkerId: "XXXXJS00000002" },
  ],
  ...over,
});
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("invoice lines CSV", () => {
  it("writes one row per line with the invoice, period, worker, PO, week, kind, exact minutes, rate and amount", () => {
    expect(text(invoiceCsv(input()))).toBe(
      [
        "Invoice Number,Invoice Date,Period Start,Period End,Worker,Worksite,PO Number,Week Ending,Earning Type,Hours,Minutes,Rate,Amount",
        "PCD-20261005,2026-10-13,2026-10-05,2026-10-11,Marcus Bell,Joliet Plant 2,PO-48213,2026-10-11,REG,40.00,2400,26.5000,1060.00",
        "PCD-20261005,2026-10-13,2026-10-05,2026-10-11,Marcus Bell,Joliet Plant 2,PO-48213,2026-10-11,OT,0.62,37,39.7500,24.51",
        "PCD-20261005,2026-10-13,2026-10-05,2026-10-11,Anita Patel,Joliet Plant 2,,2026-10-11,REG,24.00,1440,26.5000,636.00",
        "",
      ].join("\r\n"),
    );
  });

  it("writes a credit's negative amounts with a minus sign", () => {
    const r = text(invoiceCsv(input({ lines: [{ ...input().lines[0]!, minutes: -60, amountCents: -2650 }] })));
    expect(r.split("\r\n")[1]).toBe("PCD-20261005,2026-10-13,2026-10-05,2026-10-11,Marcus Bell,Joliet Plant 2,PO-48213,2026-10-11,REG,-1.00,-60,26.5000,-26.50");
  });
});

describe("SAP Fieldglass time sheet invoice upload", () => {
  it("writes the header, a blank line, the columns, and one row per time sheet with its billing total", () => {
    expect(text(fieldglassUpload(input()))).toBe(
      [
        "Type,Time Sheet Invoice Upload",
        "Transaction,True",
        "",
        "Invoice Code,TIMESHEET ID,Job Seeker ID,Paid Amount,Total Billing Amount",
        "PCD-20261005,XXXXTS00000001,XXXXJS00000001,0.00,1084.51",
        "PCD-20261005,XXXXTS00000002,XXXXJS00000002,0.00,636.00",
        "",
      ].join("\r\n"),
    );
  });

  it("refuses hours that did not come from a Fieldglass time sheet, naming the worker", () => {
    expect(() => fieldglassUpload(input({ lines: [{ ...input().lines[2]!, timeSheetIds: [] }] }))).toThrowError(/Anita Patel: hours for the week ending 2026-10-11 did not come from a SAP Fieldglass time sheet/);
    // The refusal carries the worker's id when the line has one (the run offers to skip them).
    try {
      fieldglassUpload(input({ lines: [{ ...input().lines[2]!, workerId: "w-anita", timeSheetIds: [] }] }));
    } catch (e) {
      expect((e as { workerId?: string }).workerId).toBe("w-anita");
    }
  });

  it("refuses a line whose hours span two time sheets (the line's amount cannot be split)", () => {
    expect(() => fieldglassUpload(input({ lines: [{ ...input().lines[0]!, timeSheetIds: ["XXXXTS00000001", "XXXXTS00000003"] }] }))).toThrowError(/Marcus Bell: .* two SAP Fieldglass time sheets/);
  });
});
