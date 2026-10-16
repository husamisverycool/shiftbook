import { describe, expect, it } from "vitest";
import { parseAdpRun, renderAdpRun } from "./adp-run";
import type { ExportFixture } from "./registry";

const REG = { num: 1825, den: 1 };
const base = (over: Partial<ExportFixture> = {}): ExportFixture => ({
  format: "adp_run_csv",
  mappingVersion: "adp-run-v1",
  period: { startsOn: "2026-10-05", endsOn: "2026-10-11" },
  earningCodeMap: {},
  target: { format: "adp_run_csv", companyCode: "ABC1234" },
  codes: { REG: { code: "REG", as: "hours" }, OT: { code: "OT", as: "hours" }, DT: { code: "DT", as: "hours" }, BONUS: { code: "BONUS", as: "dollars" } },
  workers: [
    { workerId: "w1", firstName: "Ana", lastName: "Álvarez", payrollIds: { adp_run: { id: "123" } } },
    { workerId: "w2", firstName: "Ben", lastName: "Okafor", payrollIds: { adp_run: { id: "456" } } },
  ],
  payLines: [
    { workerId: "w2", type: "REG", minutes: 2280, amountCents: 69_350, rate: REG },
    { workerId: "w1", type: "REG", minutes: 2400, amountCents: 73_000, rate: REG },
    { workerId: "w1", type: "OT", minutes: 37, amountCents: 1688, rate: { num: 5475, den: 2 } },
    { workerId: "w1", type: "BONUS", minutes: 0, amountCents: 15_000, rate: { num: 15_000, den: 1 } },
  ],
  ...over,
});
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const HEADER = "Company Code,Pay Frequency,Pay Period Start,Pay Period End,Employee ID,Earnings Code,Pay Hours,Dollars,Separate Check,Worked Department,Rate Code";

describe("RUN Powered by ADP time sheet import", () => {
  it("writes the version row, the headings, then one row per worker and earnings code at the BASE rate code", () => {
    const r = renderAdpRun(base());
    expect(r.filename).toBe("adp-run-2026-10-05-to-2026-10-11.csv");
    expect(text(r.bytes)).toBe(
      [
        "##GENERIC## V1.0",
        HEADER,
        "ABC1234,W,10/05/2026,10/11/2026,123,REG,40.00,,0,,BASE",
        "ABC1234,W,10/05/2026,10/11/2026,123,OT,0.62,,0,,BASE",
        "ABC1234,W,10/05/2026,10/11/2026,123,BONUS,,150.00,0,,BASE",
        "ABC1234,W,10/05/2026,10/11/2026,456,REG,38.00,,0,,BASE",
        "",
      ].join("\r\n"),
    );
  });

  it("states the gross RUN computes: hours × the stored rate × 1, 1.5 or 2, dollars as written", () => {
    const r = renderAdpRun(base());
    expect(r.controlTotals).toEqual({ workers: 2, minutesByType: { REG: 4680, OT: 37 }, amountsByType: { BONUS: 15_000 }, grossCents: 159_038, payrollSystemGrossCents: 159_047, payrollSystemDifferenceCents: 9 });
    expect(r.notes).toEqual([
      "Álvarez, Ana — OT: 37 min written as 0.62 h (0.6166… h exactly, rounded up to the next hundredth so no worked time is lost). RUN pays 0.62 h × $18.25/h × 1.5 = $16.97; Shiftbook computed $16.88 (+$0.09).",
    ]);
  });

  it("reads its own file back", () => {
    expect(parseAdpRun(text(renderAdpRun(base()).bytes))).toEqual(
      new Map([
        ["123", { minutes: new Map([["REG", 2400], ["OT", 37]]), cents: new Map([["BONUS", 15_000]]) }],
        ["456", { minutes: new Map([["REG", 2280]]), cents: new Map() }],
      ]),
    );
  });

  it("marks a two-week period as biweekly, and refuses a period RUN has no frequency for", () => {
    expect(text(renderAdpRun(base({ period: { startsOn: "2026-10-05", endsOn: "2026-10-18" } })).bytes).split("\r\n")[2]).toBe("ABC1234,B,10/05/2026,10/18/2026,123,REG,40.00,,0,,BASE");
    expect(() => renderAdpRun(base({ period: { startsOn: "2026-10-05", endsOn: "2026-10-25" } }))).toThrowError(expect.objectContaining({ code: "unsupported_period" }));
  });

  it("carries overtime at a weighted regular rate as dollars when the agency maps it that way, and refuses it as hours", () => {
    const weighted = [{ workerId: "w1", type: "REG" as const, minutes: 2400, amountCents: 73_000, rate: REG }, { workerId: "w1", type: "OT" as const, minutes: 60, amountCents: 2800, rate: { num: 2800, den: 1 } }];
    expect(() => renderAdpRun(base({ payLines: weighted }))).toThrowError(expect.objectContaining({ code: "several_pay_rates", workerId: "w1", message: expect.stringContaining("RUN Powered by ADP pays it at 1.5 × the stored rate") }));
    const r = renderAdpRun(base({ payLines: weighted, codes: { ...base().codes, OT: { code: "OTADJ", as: "dollars" } } }));
    expect(text(r.bytes).split("\r\n").slice(2, 4)).toEqual(["ABC1234,W,10/05/2026,10/11/2026,123,REG,40.00,,0,,BASE", "ABC1234,W,10/05/2026,10/11/2026,123,OTADJ,,28.00,0,,BASE"]);
    expect(r.controlTotals.payrollSystemDifferenceCents).toBe(0);
  });

  it("refuses a worker with two rates (RUN takes rate codes, not rates) and a worker with no employee id", () => {
    expect(() => renderAdpRun(base({ payLines: [{ workerId: "w1", type: "REG", minutes: 60, amountCents: 1825, rate: REG }, { workerId: "w1", type: "REG", minutes: 60, amountCents: 2000, rate: { num: 2000, den: 1 } }] }))).toThrowError(
      expect.objectContaining({ code: "several_pay_rates", workerId: "w1" }),
    );
    expect(() => renderAdpRun(base({ workers: [base().workers[0]!, { workerId: "w2", firstName: "Ben", lastName: "Okafor", payrollIds: {} }] }))).toThrowError(expect.objectContaining({ code: "missing_payroll_id", workerId: "w2" }));
  });

  it("names a correction for its version", () => {
    const r = renderAdpRun(base({ payLines: [{ workerId: "w1", type: "REG", minutes: 60, amountCents: 1825, rate: REG, parts: 2 }], correction: { version: 2, baseVersion: 1 }, referenceRates: { w1: REG } }));
    expect(r.filename).toBe("adp-run-2026-10-05-to-2026-10-11-correction-2.csv");
    expect(r.notes[0]).toContain("Correction 2 of this pay period");
  });
});
