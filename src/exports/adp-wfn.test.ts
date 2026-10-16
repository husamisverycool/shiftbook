import { describe, expect, it } from "vitest";
import { parseAdpWfn, renderAdpWfn } from "./adp-wfn";
import type { ExportFixture } from "./registry";

const REG = { num: 1825, den: 1 };
const base = (over: Partial<ExportFixture> = {}): ExportFixture => ({
  format: "adp_wfn_paydata",
  mappingVersion: "adp-wfn-v1",
  period: { startsOn: "2026-10-05", endsOn: "2026-10-11" },
  earningCodeMap: {},
  target: { format: "adp_wfn_paydata", companyCode: "XYZ" },
  codes: {
    REG: { code: "Reg Hours", as: "hours" },
    OT: { code: "O/T Hours", as: "hours", factor: { num: 3, den: 2 } },
    DT: { code: "D", as: "hours", factor: { num: 2, den: 1 } },
    BONUS: { code: "B", as: "dollars" },
    MEAL_PREMIUM: { code: "MP", as: "dollars" },
    REST_PREMIUM: { code: "RP", as: "dollars" },
    REPORTING_PAY: { code: "RT", as: "dollars" },
  },
  workers: [
    { workerId: "w1", firstName: "Ana", lastName: "Álvarez", payrollIds: { adp_wfn: { id: "000123" } } },
    { workerId: "w2", firstName: "Ben", lastName: "Okafor", payrollIds: { adp_wfn: { id: "000456" } } },
  ],
  payLines: [
    { workerId: "w2", type: "REG", minutes: 1200, amountCents: 36_500, rate: REG },
    { workerId: "w2", type: "REG", minutes: 1200, amountCents: 40_000, rate: { num: 2000, den: 1 } },
    // Overtime at 1.5 × a worked-week regular rate of $19.1666…/h.
    { workerId: "w2", type: "OT", minutes: 120, amountCents: 5750, rate: { num: 5750, den: 2 } },
    { workerId: "w1", type: "REG", minutes: 2400, amountCents: 73_000, rate: REG },
    { workerId: "w1", type: "OT", minutes: 37, amountCents: 1688, rate: { num: 5475, den: 2 } },
    { workerId: "w1", type: "DT", minutes: 60, amountCents: 3650, rate: { num: 3650, den: 1 } },
    { workerId: "w1", type: "BONUS", minutes: 0, amountCents: 15_000, rate: { num: 15_000, den: 1 } },
  ],
  ...over,
});
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const HEADER = "Co Code,Batch ID,File #,Temp Rate,Reg Hours,O/T Hours,Hours 3 Code,Hours 3 Amount,Earnings 3 Code,Earnings 3 Amount";

describe("ADP Workforce Now paydata file", () => {
  it("writes a row per worker and Temp Rate, hours in their columns, dollars under their codes, blanks for nothing, CRLF", () => {
    const r = renderAdpWfn(base());
    expect(r.filename).toBe("PRXYZEPI.csv");
    expect(r.mediaType).toBe("text/csv");
    expect(text(r.bytes)).toBe(
      [
        HEADER,
        "XYZ,26101101,000123,18.2500,40.00,0.62,D,1.00,,",
        "XYZ,26101101,000123,,,,,,B,150.00",
        "XYZ,26101101,000456,18.2500,20.00,,,,,",
        "XYZ,26101101,000456,19.1667,,2.00,,,,",
        "XYZ,26101101,000456,20.0000,20.00,,,,,",
        "",
      ].join("\r\n"),
    );
  });

  it("states the gross ADP computes: hours × Temp Rate × the declared multiple, dollars as written", () => {
    expect(renderAdpWfn(base()).controlTotals).toEqual({
      workers: 2,
      minutesByType: { REG: 4800, OT: 157, DT: 60 },
      amountsByType: { BONUS: 15_000 },
      grossCents: 175_588,
      payrollSystemGrossCents: 175_597,
      payrollSystemDifferenceCents: 9,
    });
  });

  it("notes the multiples it assumed and every line whose hours are rounded up", () => {
    expect(renderAdpWfn(base()).notes).toEqual([
      "ADP prices O/T Hours at Temp Rate × 1.5 and code D at Temp Rate × 2: the multiples in the payroll file settings. If ADP is set up with other multiples, its gross will differ.",
      "Álvarez, Ana — OT: 37 min written as 0.62 h (0.6166… h exactly, rounded up to the next hundredth so no worked time is lost). ADP pays 0.62 h × 18.2500 × 1.5 = $16.97; Shiftbook computed $16.88 (+$0.09).",
    ]);
  });

  it("reads its own file back to the same minutes per code and dollars per code", () => {
    expect(parseAdpWfn(text(renderAdpWfn(base()).bytes))).toEqual(
      new Map([
        ["000123", { minutes: new Map([["Reg Hours", 2400], ["O/T Hours", 37], ["D", 60]]), cents: new Map([["B", 15_000]]) }],
        ["000456", { minutes: new Map([["Reg Hours", 2400], ["O/T Hours", 120]]), cents: new Map() }],
      ]),
    );
  });

  it("puts more dollar codes than one row can hold on another row (four code pairs per row at most)", () => {
    const r = renderAdpWfn(
      base({
        payLines: [
          { workerId: "w1", type: "REG", minutes: 480, amountCents: 14_600, rate: REG },
          { workerId: "w1", type: "DT", minutes: 60, amountCents: 3650, rate: { num: 3650, den: 1 } },
          { workerId: "w1", type: "BONUS", minutes: 0, amountCents: 5000, rate: { num: 5000, den: 1 } },
          { workerId: "w1", type: "MEAL_PREMIUM", minutes: 60, amountCents: 1825, rate: REG },
          { workerId: "w1", type: "REST_PREMIUM", minutes: 60, amountCents: 1825, rate: REG },
          { workerId: "w1", type: "REPORTING_PAY", minutes: 120, amountCents: 3650, rate: REG },
        ],
      }),
    );
    expect(text(r.bytes).split("\r\n")).toEqual([
      "Co Code,Batch ID,File #,Temp Rate,Reg Hours,O/T Hours,Hours 3 Code,Hours 3 Amount,Earnings 3 Code,Earnings 3 Amount,Earnings 3 Code,Earnings 3 Amount,Earnings 3 Code,Earnings 3 Amount",
      "XYZ,26101101,000123,18.2500,8.00,,D,1.00,,,,,,",
      "XYZ,26101101,000123,,,,,,RT,36.50,MP,18.25,RP,18.25",
      "XYZ,26101101,000123,,,,,,B,50.00,,,,",
      "",
    ]);
  });

  it("names a two-character company's file with an underscore and the version in the batch id", () => {
    const r = renderAdpWfn(base({ target: { format: "adp_wfn_paydata", companyCode: "XY" }, payLines: [{ workerId: "w1", type: "REG", minutes: 60, amountCents: 1825, rate: REG, parts: 2 }], correction: { version: 2, baseVersion: 1 } }));
    expect(r.filename).toBe("PRXY_EPI.csv");
    expect(text(r.bytes).split("\r\n")[1]).toBe("XY,26101102,000123,18.2500,1.00,");
    expect(r.notes[0]).toContain("Correction 2 of this pay period");
  });

  it("refuses a worker with no file number, or one ADP would refuse", () => {
    expect(() => renderAdpWfn(base({ workers: [base().workers[0]!, { workerId: "w2", firstName: "Ben", lastName: "Okafor", payrollIds: {} }] }))).toThrowError(
      expect.objectContaining({ code: "missing_payroll_id", workerId: "w2", message: "Okafor, Ben has no ADP file number, so ADP Workforce Now cannot match the row." }),
    );
    expect(() => renderAdpWfn(base({ workers: [base().workers[0]!, { workerId: "w2", firstName: "Ben", lastName: "Okafor", payrollIds: { adp_wfn: { id: "12" } } }] }))).toThrowError(expect.objectContaining({ code: "missing_payroll_id", workerId: "w2" }));
  });

  it("names the worker when a kind of pay has no ADP code", () => {
    const r = () => renderAdpWfn(base({ payLines: [{ workerId: "w1", type: "HOL", minutes: 480, amountCents: 7300, rate: { num: 1825, den: 2 } }] }));
    expect(r).toThrowError(expect.objectContaining({ code: "unsupported_earning_type", workerId: "w1", message: expect.stringContaining("a holiday premium for hours worked on a holiday has no ADP Workforce Now code") }));
  });

  it("refuses a rate above ADP's limit of 999.9999", () => {
    const r = () => renderAdpWfn(base({ payLines: [{ workerId: "w1", type: "REG", minutes: 60, amountCents: 100_001, rate: { num: 100_001, den: 1 } }] }));
    expect(r).toThrowError(expect.objectContaining({ code: "invalid_pay_line", workerId: "w1" }));
  });
});
