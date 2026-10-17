import { describe, expect, it } from "vitest";
import { parseQbdIif, renderQbdIif } from "./qbd-iif";
import type { ExportFixture } from "./registry";

const REG = { num: 1825, den: 1 };
const OT = { num: 5475, den: 2 };
const base = (over: Partial<ExportFixture> = {}): ExportFixture => ({
  format: "qbd_iif",
  mappingVersion: "qbd-iif-v1",
  period: { startsOn: "2026-10-05", endsOn: "2026-10-11" },
  earningCodeMap: {},
  target: { format: "qbd_iif", version: "2022_or_later" },
  codes: { REG: { code: "Regular Pay", as: "hours" }, OT: { code: "Overtime Pay", as: "hours" }, DT: { code: "Double Time Pay", as: "hours" } },
  workers: [
    { workerId: "w1", firstName: "Ana", lastName: "Álvarez", payrollIds: { qbd: { id: "Alvarez, Ana" } } },
    { workerId: "w2", firstName: "Ben", lastName: "Okafor", payrollIds: { qbd: { id: "Okafor, Ben" } } },
  ],
  payLines: [
    { workerId: "w2", type: "REG", minutes: 2280, amountCents: 69_350, rate: REG, workweekStart: "2026-10-05" },
    { workerId: "w1", type: "REG", minutes: 2400, amountCents: 73_000, rate: REG, workweekStart: "2026-10-05" },
    { workerId: "w1", type: "OT", minutes: 37, amountCents: 1688, rate: OT, workweekStart: "2026-10-05" },
  ],
  ...over,
});
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const HEADER = "!TIMEACT\tDATE\tJOB\tEMP\tITEM\tPITEM\tDURATION\tPROJ\tNOTE\tXFERTOPAYROLL\tBILLINGSTATUS";
const row = (date: string, emp: string, item: string, duration: string) => `TIMEACT\t${date}\t\t${emp}\t\t${item}\t${duration}\t\t\tY\t0`;

describe("QuickBooks Desktop IIF time file", () => {
  it("writes each worker's week of hours per payroll item on the week's last day, in rows of at most 23:59, TAB-separated with CRLF", () => {
    const r = renderQbdIif(base());
    expect(r.filename).toBe("quickbooks-time-2026-10-05-to-2026-10-11.iif");
    expect(r.mediaType).toBe("text/plain");
    expect(text(r.bytes)).toBe(
      [
        HEADER,
        row("10/11/26", "Alvarez, Ana", "Regular Pay", "20:00"),
        row("10/11/26", "Alvarez, Ana", "Regular Pay", "20:00"),
        row("10/11/26", "Alvarez, Ana", "Overtime Pay", "0:37"),
        row("10/11/26", "Okafor, Ben", "Regular Pay", "19:00"),
        row("10/11/26", "Okafor, Ben", "Regular Pay", "19:00"),
        "",
      ].join("\r\n"),
    );
  });

  it("states the gross QuickBooks computes from the hours (exact minutes, so the same)", () => {
    expect(renderQbdIif(base()).controlTotals).toEqual({
      workers: 2,
      minutesByType: { REG: 4680, OT: 37 },
      grossCents: 144_038,
      payrollSystemGrossCents: 144_038,
      payrollSystemDifferenceCents: 0,
    });
    expect(renderQbdIif(base()).notes).toEqual([]);
  });

  it("dates each workweek on its own last day", () => {
    const r = renderQbdIif(
      base({
        period: { startsOn: "2026-10-05", endsOn: "2026-10-18" },
        payLines: [
          { workerId: "w1", type: "REG", minutes: 480, amountCents: 14_600, rate: REG, workweekStart: "2026-10-12" },
          { workerId: "w1", type: "REG", minutes: 600, amountCents: 18_250, rate: REG, workweekStart: "2026-10-05" },
        ],
      }),
    );
    expect(text(r.bytes).split("\r\n").slice(1, 3)).toEqual([row("10/11/26", "Alvarez, Ana", "Regular Pay", "10:00"), row("10/18/26", "Alvarez, Ana", "Regular Pay", "8:00")]);
  });

  it("notes a cent QuickBooks rounds differently when it adds two weeks' lines before pricing them", () => {
    const r = renderQbdIif(
      base({
        period: { startsOn: "2026-10-05", endsOn: "2026-10-18" },
        payLines: [
          { workerId: "w1", type: "OT", minutes: 1, amountCents: 46, rate: OT, workweekStart: "2026-10-05" },
          { workerId: "w1", type: "OT", minutes: 1, amountCents: 46, rate: OT, workweekStart: "2026-10-12" },
          { workerId: "w1", type: "REG", minutes: 2400, amountCents: 73_000, rate: REG, workweekStart: "2026-10-05" },
        ],
      }),
    );
    // 2 min × $27.375/h = $0.9125 → $0.91; Granite rounded each minute's line: $0.46 + $0.46 = $0.92.
    expect(r.controlTotals.payrollSystemDifferenceCents).toBe(-1);
    expect(r.notes).toEqual(["Álvarez, Ana — OT: QuickBooks pays 0:02 × $27.375/h = $0.91; Granite computed $0.92 (−$0.01), because Granite rounds each workweek's line separately."]);
  });

  it("writes the Timer header for QuickBooks Desktop 2021 and earlier", () => {
    const r = renderQbdIif(base({ target: { format: "qbd_iif", version: "2021_or_earlier", companyName: "Sample Staffing LLC", companyCreateTime: "1208544781" } }));
    expect(text(r.bytes).split("\r\n").slice(0, 3)).toEqual([
      "!TIMERHDR\tVER\tREL\tCOMPANYNAME\tIMPORTEDBEFORE\tFROMTIMER\tCOMPANYCREATETIME",
      "TIMERHDR\t8\t0\tSample Staffing LLC\tN\tY\t1208544781",
      HEADER,
    ]);
  });

  it("reads its own file back to the same minutes per worker and item", () => {
    expect(parseQbdIif(text(renderQbdIif(base()).bytes))).toEqual(
      new Map([
        ["Alvarez, Ana", new Map([["Regular Pay", 2400], ["Overtime Pay", 37]])],
        ["Okafor, Ben", new Map([["Regular Pay", 2280]])],
      ]),
    );
  });

  it("names the worker when the file cannot carry a kind of pay (dollars)", () => {
    const r = () => renderQbdIif(base({ payLines: [...base().payLines, { workerId: "w2", type: "BONUS", minutes: 0, amountCents: 5000, rate: { num: 5000, den: 1 } }] }));
    expect(r).toThrowError(expect.objectContaining({ code: "unsupported_earning_type", workerId: "w2", message: expect.stringContaining("Okafor, Ben: the QuickBooks Desktop file carries hours (regular, overtime, double time, holiday not worked) only, so it cannot carry a bonus") }));
  });

  it("names the worker when a kind of pay has no payroll item", () => {
    const r = () => renderQbdIif(base({ codes: { REG: { code: "Regular Pay", as: "hours" } } }));
    expect(r).toThrowError(expect.objectContaining({ code: "unsupported_earning_type", workerId: "w1", message: expect.stringContaining("overtime has no QuickBooks Desktop code") }));
  });

  it("refuses overtime at a weighted regular rate, which QuickBooks cannot pay from its stored rate", () => {
    const r = () => renderQbdIif(base({ payLines: [{ workerId: "w1", type: "REG", minutes: 2400, amountCents: 73_000, rate: REG }, { workerId: "w1", type: "OT", minutes: 60, amountCents: 2800, rate: { num: 2800, den: 1 } }] }));
    expect(r).toThrowError(expect.objectContaining({ code: "several_pay_rates", workerId: "w1", message: expect.stringContaining("but QuickBooks Desktop pays it at 1.5 × the stored rate ($27.375/h)") }));
  });

  it("refuses a worker with two regular rates", () => {
    const r = () => renderQbdIif(base({ payLines: [{ workerId: "w1", type: "REG", minutes: 60, amountCents: 1825, rate: REG }, { workerId: "w1", type: "REG", minutes: 60, amountCents: 2000, rate: { num: 2000, den: 1 } }] }));
    expect(r).toThrowError(expect.objectContaining({ code: "several_pay_rates", workerId: "w1" }));
  });

  it("refuses a worker with no QuickBooks name, or a name the file cannot carry", () => {
    const missing = () => renderQbdIif(base({ workers: [base().workers[0]!, { workerId: "w2", firstName: "Ben", lastName: "Okafor", payrollIds: {} }] }));
    expect(missing).toThrowError(expect.objectContaining({ code: "missing_payroll_id", workerId: "w2", message: "Okafor, Ben has no QuickBooks Desktop employee name, so QuickBooks Desktop cannot match the row." }));
    const accented = () => renderQbdIif(base({ workers: [{ workerId: "w1", firstName: "Ana", lastName: "Álvarez", payrollIds: { qbd: { id: "Álvarez, Ana" } } }, base().workers[1]!] }));
    expect(accented).toThrowError(expect.objectContaining({ code: "missing_payroll_id", workerId: "w1" }));
  });

  it("refuses two workers with the same QuickBooks name", () => {
    const r = () => renderQbdIif(base({ workers: [base().workers[0]!, { workerId: "w2", firstName: "Ben", lastName: "Okafor", payrollIds: { qbd: { id: "alvarez, ana" } } }] }));
    expect(r).toThrowError(expect.objectContaining({ code: "duplicate_payroll_id" }));
  });

  it("names a correction for its version, says it adds to the earlier file, and checks lines against the period's regular rate", () => {
    const fixture = base({
      payLines: [{ workerId: "w1", type: "OT", minutes: 60, amountCents: 2738, rate: OT, parts: 2, workweekStart: "2026-10-05" }],
      correction: { version: 2, baseVersion: 1 },
      referenceRates: { w1: REG },
    });
    const r = renderQbdIif(fixture);
    expect(r.filename).toBe("quickbooks-time-2026-10-05-to-2026-10-11-correction-2.iif");
    expect(r.notes[0]).toContain("Correction 2 of this pay period: only the differences against version 1");
    expect(() => renderQbdIif({ ...fixture, referenceRates: { w1: { num: 2000, den: 1 } } })).toThrowError(expect.objectContaining({ code: "several_pay_rates", workerId: "w1" }));
  });

  it("refuses overtime with no regular hours, whose stored rate is unknown; holiday pay alone is at the stored rate", () => {
    const r = () => renderQbdIif(base({ payLines: [{ workerId: "w1", type: "OT", minutes: 60, amountCents: 2738, rate: OT }] }));
    expect(r).toThrowError(expect.objectContaining({ code: "several_pay_rates", workerId: "w1", message: expect.stringContaining("has overtime but no regular hours") }));
    const holiday = renderQbdIif(base({ codes: { ...base().codes, HOL_NOT_WORKED: { code: "Holiday Hourly", as: "hours" } }, payLines: [{ workerId: "w1", type: "HOL_NOT_WORKED", minutes: 480, amountCents: 14_600, rate: REG }] }));
    expect(holiday.controlTotals.payrollSystemDifferenceCents).toBe(0);
  });
});
