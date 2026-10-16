import { describe, expect, it } from "vitest";
import { parseQboTime, renderQboTime } from "./qbo-time";
import type { ExportFixture } from "./registry";

const REG = { num: 1825, den: 1 };
const base = (over: Partial<ExportFixture> = {}): ExportFixture => ({
  format: "qbo_time_csv",
  mappingVersion: "qbo-time-v1",
  period: { startsOn: "2026-10-05", endsOn: "2026-10-11" },
  earningCodeMap: {},
  target: { format: "qbo_time_csv", customer: "Payroll time" },
  codes: {},
  workers: [
    { workerId: "w1", firstName: "Ana", lastName: "Álvarez", payrollIds: { qbo: { id: "Ana Álvarez" } } },
    { workerId: "w2", firstName: "Ben", lastName: "Okafor", payrollIds: { qbo: { id: "Okafor, Ben" } } },
  ],
  payLines: [
    { workerId: "w2", type: "REG", minutes: 2280, amountCents: 69_350, rate: REG, workweekStart: "2026-10-05" },
    { workerId: "w1", type: "REG", minutes: 610, amountCents: 18_554, rate: REG, workweekStart: "2026-10-05" },
  ],
  ...over,
});
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("QuickBooks Online time CSV (for the documented importers)", () => {
  it("writes one row per worker and week of regular hours as H:MM, on the week's last day, not billable, CRLF", () => {
    const r = renderQboTime(base());
    expect(r.filename).toBe("quickbooks-online-time-2026-10-05-to-2026-10-11.csv");
    expect(r.mediaType).toBe("text/csv");
    expect(text(r.bytes)).toBe(
      [
        "Date,Name,Customer,Hours,Billable",
        "10/11/2026,Ana Álvarez,Payroll time,10:10,No",
        '10/11/2026,"Okafor, Ben",Payroll time,19:00,No',
        '10/11/2026,"Okafor, Ben",Payroll time,19:00,No',
        "",
      ].join("\r\n"),
    );
  });

  it("states the gross QuickBooks Online computes from the hours at the stored rate", () => {
    expect(renderQboTime(base()).controlTotals).toEqual({ workers: 2, minutesByType: { REG: 2890 }, grossCents: 87_904, payrollSystemGrossCents: 87_904, payrollSystemDifferenceCents: 0 });
  });

  it("reads its own file back to the same minutes per name", () => {
    expect(parseQboTime(text(renderQboTime(base()).bytes))).toEqual(new Map([["Ana Álvarez", 610], ["Okafor, Ben", 2280]]));
  });

  it("carries regular hours only: overtime names the worker to pay by hand", () => {
    const r = () => renderQboTime(base({ payLines: [...base().payLines, { workerId: "w2", type: "OT", minutes: 60, amountCents: 2738, rate: { num: 5475, den: 2 } }] }));
    expect(r).toThrowError(expect.objectContaining({ code: "unsupported_earning_type", workerId: "w2", message: expect.stringContaining("the QuickBooks Online file carries regular hours only, so it cannot carry overtime") }));
  });

  it("refuses a worker with two rates, and a worker with no display name", () => {
    expect(() => renderQboTime(base({ payLines: [{ workerId: "w1", type: "REG", minutes: 60, amountCents: 1825, rate: REG }, { workerId: "w1", type: "REG", minutes: 60, amountCents: 2000, rate: { num: 2000, den: 1 } }] }))).toThrowError(
      expect.objectContaining({ code: "several_pay_rates", workerId: "w1" }),
    );
    expect(() => renderQboTime(base({ workers: [base().workers[0]!, { workerId: "w2", firstName: "Ben", lastName: "Okafor", payrollIds: {} }] }))).toThrowError(expect.objectContaining({ code: "missing_payroll_id", workerId: "w2" }));
  });

  it("names a correction for its version", () => {
    const r = renderQboTime(base({ payLines: [{ workerId: "w1", type: "REG", minutes: 60, amountCents: 1825, rate: REG, parts: 2, workweekStart: "2026-10-05" }], correction: { version: 3, baseVersion: 2 }, referenceRates: { w1: REG } }));
    expect(r.filename).toBe("quickbooks-online-time-2026-10-05-to-2026-10-11-correction-3.csv");
    expect(r.notes[0]).toContain("Correction 3 of this pay period");
  });
});
