import { describe, expect, it } from "vitest";
import { ExportError } from "./errors";
import { parseGustoHoursCsv, renderGustoHours } from "./gusto-hours";
import type { ExportFixture } from "./registry";

const base = (over: Partial<ExportFixture> = {}): ExportFixture => ({
  format: "gusto_hours_csv",
  mappingVersion: "gusto-core-v1",
  period: { startsOn: "2026-10-05", endsOn: "2026-10-11" },
  earningCodeMap: { REG: "regular_hours", OT: "overtime_hours", DT: "double_overtime_hours" },
  workers: [
    { workerId: "w1", firstName: "Ana", lastName: "Álvarez", payrollIds: { gusto: { id: "a1b2c3", title: "Picker (Primary)" } } },
    { workerId: "w2", firstName: "Ben", lastName: "Okafor", payrollIds: { gusto: { id: "d4e5f6", title: "Loader (Primary)" } } },
  ],
  payLines: [
    { workerId: "w2", type: "REG", minutes: 2280, amountCents: 69_350, rate: { num: 1825, den: 1 } },
    { workerId: "w1", type: "REG", minutes: 2400, amountCents: 73_000, rate: { num: 1825, den: 1 } },
    { workerId: "w1", type: "OT", minutes: 37, amountCents: 1688, rate: { num: 5475, den: 2 } },
  ],
  ...over,
});

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("Gusto hours CSV", () => {
  it("writes the core template columns, one row per worker, sorted by name, hours to two decimals", () => {
    const r = renderGustoHours(base());
    expect(r.filename).toBe("gusto-hours-2026-10-05-to-2026-10-11.csv");
    expect(r.mediaType).toBe("text/csv");
    expect(text(r.bytes)).toBe(
      [
        "last_name,first_name,title,gusto_employee_id,regular_hours,overtime_hours,double_overtime_hours",
        "Álvarez,Ana,Picker (Primary),a1b2c3,40.00,0.62,0.00",
        "Okafor,Ben,Loader (Primary),d4e5f6,38.00,0.00,0.00",
        "",
      ].join("\n"),
    );
  });

  it("writes control totals that equal the pay lines", () => {
    const r = renderGustoHours(base());
    expect(r.controlTotals).toEqual({ workers: 2, minutesByType: { REG: 4680, OT: 37 }, grossCents: 144_038 });
  });

  it("lists every line whose minutes are not exact in two-decimal hours", () => {
    const r = renderGustoHours(base());
    expect(r.notes).toEqual([
      "Álvarez, Ana — OT: 37 min written as 0.62 h (0.6166… h exactly). Gusto multiplies the hours it receives by its own rate.",
    ]);
  });

  it("refuses an earning type the agency has not mapped for Gusto", () => {
    const fixture = base({ payLines: [{ workerId: "w1", type: "HOL", minutes: 480, amountCents: 14_600, rate: { num: 1825, den: 1 } }] });
    expect(() => renderGustoHours(fixture)).toThrow(ExportError);
    expect(() => renderGustoHours(fixture)).toThrow(/HOL/);
  });

  it("refuses a worker with no Gusto employee id (missing payroll file number)", () => {
    const fixture = base({ workers: [{ workerId: "w1", firstName: "Ana", lastName: "Álvarez", payrollIds: {} }, base().workers[1]!] });
    expect(() => renderGustoHours(fixture)).toThrow(/Gusto employee id/);
  });

  it("refuses a worker with two straight-time pay rates (Gusto pays one rate per job row)", () => {
    const fixture = base({
      payLines: [
        { workerId: "w1", type: "REG", minutes: 480, amountCents: 14_600, rate: { num: 1825, den: 1 } },
        { workerId: "w1", type: "REG", minutes: 480, amountCents: 16_000, rate: { num: 2000, den: 1 } },
      ],
    });
    expect(() => renderGustoHours(fixture)).toThrow(/more than one pay rate/);
  });

  it("quotes fields that contain commas or quotes", () => {
    const fixture = base({
      workers: [{ workerId: "w1", firstName: 'Lee "Junior"', lastName: "Park, Jr.", payrollIds: { gusto: { id: "abc123" } } }],
      payLines: [{ workerId: "w1", type: "REG", minutes: 60, amountCents: 1825, rate: { num: 1825, den: 1 } }],
    });
    const lines = text(renderGustoHours(fixture).bytes).split("\n");
    expect(lines[1]).toBe('"Park, Jr.","Lee ""Junior""",,abc123,1.00,0.00,0.00');
  });

  it("reads its own file back to the same minutes (the reconciliation check)", () => {
    const r = renderGustoHours(base());
    const parsed = parseGustoHoursCsv(text(r.bytes));
    expect(parsed.workers).toBe(2);
    expect(parsed.hundredthsByColumn).toEqual({ regular_hours: 7800, overtime_hours: 62, double_overtime_hours: 0 });
  });
});
