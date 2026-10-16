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

  it("writes control totals that equal the pay lines, plus the gross Gusto should compute and the difference", () => {
    const r = renderGustoHours(base());
    expect(r.controlTotals).toEqual({
      workers: 2,
      minutesByType: { REG: 4680, OT: 37 },
      grossCents: 144_038,
      payrollSystemGrossCents: 144_047,
      payrollSystemDifferenceCents: 9,
    });
  });

  it("lists every line whose minutes are not exact in two-decimal hours, with the money effect", () => {
    const r = renderGustoHours(base());
    expect(r.notes).toEqual([
      "Álvarez, Ana — OT: 37 min written as 0.62 h (0.6166… h exactly, rounded up to the next hundredth so no worked time is lost). Gusto pays 0.62 h × $27.375/h = $16.97; Shiftbook computed $16.88 (+$0.09).",
    ]);
  });

  it("rounds hours up, never down (38 minutes → 0.64 h, not 0.63 h)", () => {
    const fixture = base({ payLines: [{ workerId: "w1", type: "REG", minutes: 38, amountCents: 1156, rate: { num: 1825, den: 1 } }] });
    expect(text(renderGustoHours(fixture).bytes).split("\n")[1]).toBe("Álvarez,Ana,Picker (Primary),a1b2c3,0.64,0.00,0.00");
  });

  it("refuses a worker with no Gusto job title (Gusto matches rows per job)", () => {
    const fixture = base({ workers: [{ workerId: "w1", firstName: "Ana", lastName: "Álvarez", payrollIds: { gusto: { id: "a1b2c3" } } }, base().workers[1]!] });
    expect(() => renderGustoHours(fixture)).toThrow(/job title/);
  });

  it("refuses overtime that is not exactly 1.5× the regular rate (Gusto applies its own multiplier)", () => {
    const fixture = base({
      payLines: [
        { workerId: "w1", type: "REG", minutes: 2400, amountCents: 73_000, rate: { num: 1825, den: 1 } },
        { workerId: "w1", type: "OT", minutes: 60, amountCents: 2000, rate: { num: 2000, den: 1 } },
      ],
    });
    expect(() => renderGustoHours(fixture)).toThrow(/1\.5/);
  });

  it("refuses an earning type the agency has not mapped for Gusto", () => {
    const fixture = base({ payLines: [{ workerId: "w1", type: "DIFF", minutes: 480, amountCents: 14_600, rate: { num: 1825, den: 1 } }] });
    expect(() => renderGustoHours(fixture)).toThrow(ExportError);
    expect(() => renderGustoHours(fixture)).toThrow(/DIFF/);
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

  it("checks every overtime line against the regular rate, not just the last one", () => {
    const fixture = base({
      payLines: [
        { workerId: "w1", type: "REG", minutes: 2400, amountCents: 73_000, rate: { num: 1825, den: 1 } },
        { workerId: "w1", type: "OT", minutes: 60, amountCents: 3650, rate: { num: 3650, den: 1 } },
        { workerId: "w1", type: "OT", minutes: 60, amountCents: 2738, rate: { num: 5475, den: 2 } },
      ],
    });
    expect(() => renderGustoHours(fixture)).toThrow(/1\.5/);
  });

  it("refuses overtime for a worker with no regular line (Gusto needs the base rate)", () => {
    const fixture = base({ payLines: [{ workerId: "w1", type: "OT", minutes: 60, amountCents: 2738, rate: { num: 5475, den: 2 } }] });
    expect(() => renderGustoHours(fixture)).toThrow(/regular/);
  });

  it("notes a cent difference even when the hours are exact (two lines rounded separately)", () => {
    const fixture = base({
      payLines: [
        { workerId: "w1", type: "REG", minutes: 1206, amountCents: 36_683, rate: { num: 1825, den: 1 } },
        { workerId: "w1", type: "REG", minutes: 1194, amountCents: 36_318, rate: { num: 1825, den: 1 } },
      ],
    });
    const r = renderGustoHours(fixture);
    expect(r.controlTotals.payrollSystemDifferenceCents).toBe(-1);
    expect(r.notes).toEqual([
      "Álvarez, Ana — REG: 2400 min written as 40.00 h (exact). Gusto pays 40.00 h × $18.25/h = $730.00; Shiftbook computed $730.01 (−$0.01), because Shiftbook rounds each pay line separately.",
    ]);
  });

  it("quotes fields that contain commas or quotes", () => {
    const fixture = base({
      workers: [{ workerId: "w1", firstName: 'Lee "Junior"', lastName: "Park, Jr.", payrollIds: { gusto: { id: "abc123", title: "Loader, Dock (Primary)" } } }],
      payLines: [{ workerId: "w1", type: "REG", minutes: 60, amountCents: 1825, rate: { num: 1825, den: 1 } }],
    });
    const lines = text(renderGustoHours(fixture).bytes).split("\n");
    expect(lines[1]).toBe('"Park, Jr.","Lee ""Junior""","Loader, Dock (Primary)",abc123,1.00,0.00,0.00');
  });

  it("reads its own file back to the same minutes (the reconciliation check)", () => {
    const r = renderGustoHours(base());
    const parsed = parseGustoHoursCsv(text(r.bytes));
    expect(parsed.workers).toBe(2);
    expect(parsed.hundredthsByColumn).toEqual({ regular_hours: 7800, overtime_hours: 62, double_overtime_hours: 0 });
  });
});

describe("Gusto hours CSV — fourth review fixes", () => {
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return e instanceof ExportError ? e.code : "not an export error";
    }
    return "no error";
  };

  it("refuses two workers with the same Gusto employee id (Gusto would merge their hours)", () => {
    const [ana, ben] = base().workers;
    const fixture = base({ workers: [ana!, { ...ben!, payrollIds: { gusto: { id: "a1b2c3", title: "Loader (Primary)" } } }] });
    expect(code(() => renderGustoHours(fixture))).toBe("duplicate_payroll_id");
  });

  it("refuses a worker listed twice, in either order", () => {
    const [ana, ben] = base().workers;
    const again = { ...ana!, payrollIds: { gusto: { id: "zz9", title: "Picker (Primary)" } } };
    expect(code(() => renderGustoHours(base({ workers: [ana!, ben!, again] })))).toBe("duplicate_payroll_id");
    expect(code(() => renderGustoHours(base({ workers: [again, ben!, ana!] })))).toBe("duplicate_payroll_id");
  });

  it("refuses a pay line with negative minutes", () => {
    const fixture = base({ payLines: [{ workerId: "w1", type: "REG", minutes: -60, amountCents: -1825, rate: { num: 1825, den: 1 } }] });
    expect(code(() => renderGustoHours(fixture))).toBe("invalid_pay_line");
  });

  it("refuses a pay line whose amount is not its minutes × rate rounded once", () => {
    const fixture = base({ payLines: [{ workerId: "w1", type: "REG", minutes: 60, amountCents: 1900, rate: { num: 1825, den: 1 } }] });
    expect(code(() => renderGustoHours(fixture))).toBe("invalid_pay_line");
  });

  it("refuses a pay line with a zero or negative rate", () => {
    const fixture = base({ payLines: [{ workerId: "w1", type: "REG", minutes: 60, amountCents: 0, rate: { num: 0, den: 1 } }] });
    expect(code(() => renderGustoHours(fixture))).toBe("invalid_pay_line");
  });
});

describe("Gusto hours CSV — fifth review fixes", () => {
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return e instanceof ExportError ? e.code : "not an export error";
    }
    return "no error";
  };
  const withIds = (a: string, b: string) => {
    const [ana, ben] = base().workers;
    return base({ workers: [{ ...ana!, payrollIds: { gusto: { id: a, title: "Picker (Primary)" } } }, { ...ben!, payrollIds: { gusto: { id: b, title: "Loader (Primary)" } } }] });
  };

  it("treats Gusto ids that differ only in capital letters as the same id", () => {
    expect(code(() => renderGustoHours(withIds("9A1B2C", "9a1b2c")))).toBe("duplicate_payroll_id");
  });

  it("refuses a Gusto id with spaces around it", () => {
    expect(code(() => renderGustoHours(withIds("9a1b2c ", "d4e5f6")))).toBe("missing_payroll_id");
  });

  it("refuses a pay line whose amount is not whole cents, as an export error", () => {
    const fixture = base({ payLines: [{ workerId: "w1", type: "REG", minutes: 60, amountCents: 1825.5, rate: { num: 1825, den: 1 } }] });
    expect(code(() => renderGustoHours(fixture))).toBe("invalid_pay_line");
  });
});

describe("Gusto hours CSV — pay the engine now computes but this file cannot carry", () => {
  it("refuses a minimum-wage top-up line and says what to do", () => {
    const fixture = base({
      payLines: [
        { workerId: "w1", type: "REG", minutes: 480, amountCents: 11_600, rate: { num: 1450, den: 1 } },
        { workerId: "w1", type: "MW_TRUEUP", minutes: 480, amountCents: 400, rate: { num: 50, den: 1 } },
      ],
    });
    expect(() => renderGustoHours(fixture)).toThrowError(ExportError);
    expect(() => renderGustoHours(fixture)).toThrowError("cannot carry a minimum-wage top-up (the rate card is below the minimum wage); fix the rate card");
  });

  it("refuses holiday pay and bonuses plainly, before checking their arithmetic (a bonus is a lump sum, not hours)", () => {
    const reg = { workerId: "w1", type: "REG" as const, minutes: 480, amountCents: 15_200, rate: { num: 1900, den: 1 } };
    const cases = [
      [{ workerId: "w1", type: "HOL" as const, minutes: 480, amountCents: 7600, rate: { num: 950, den: 1 } }, "cannot carry a holiday premium for hours worked on a holiday"],
      [{ workerId: "w1", type: "HOL_NOT_WORKED" as const, minutes: 480, amountCents: 15_200, rate: { num: 1900, den: 1 } }, "cannot carry holiday pay for a holiday not worked; enter it in Gusto as holiday pay"],
      [{ workerId: "w1", type: "BONUS" as const, minutes: 0, amountCents: 5000, rate: { num: 0, den: 1 } }, "cannot carry a bonus; enter it in Gusto as a bonus"],
      [{ workerId: "w1", type: "BONUS_OT" as const, minutes: 1380, amountCents: 4500, rate: { num: 4500, den: 23 } }, "cannot carry overtime on a flat-sum bonus"],
    ] as const;
    for (const [line, message] of cases) {
      const fixture = base({ payLines: [reg, line] });
      expect(() => renderGustoHours(fixture)).toThrowError(expect.objectContaining({ code: "unsupported_earning_type" }));
      expect(() => renderGustoHours(fixture)).toThrowError(message);
      // The refusal names the worker, so the person knows whose pay to enter by hand, and carries
      // the worker's id, so the run can offer to skip that worker.
      expect(() => renderGustoHours(fixture)).toThrowError("Álvarez, Ana");
      expect(() => renderGustoHours(fixture)).toThrowError(expect.objectContaining({ workerId: "w1" }));
    }
  });

  it("carries bonuses in Gusto's bonus column, as dollars, when the agency maps them there", () => {
    const fixture = base({
      earningCodeMap: { REG: "regular_hours", OT: "overtime_hours", DT: "double_overtime_hours", BONUS: "bonus" },
      payLines: [
        { workerId: "w1", type: "REG", minutes: 2400, amountCents: 73_000, rate: { num: 1825, den: 1 } },
        { workerId: "w1", type: "BONUS", minutes: 0, amountCents: 5000, rate: { num: 0, den: 1 } },
        { workerId: "w1", type: "BONUS", minutes: 0, amountCents: 1234, rate: { num: 0, den: 1 } },
        { workerId: "w2", type: "REG", minutes: 2280, amountCents: 69_350, rate: { num: 1825, den: 1 } },
      ],
    });
    const r = renderGustoHours(fixture);
    expect(text(r.bytes)).toBe(
      [
        "last_name,first_name,title,gusto_employee_id,regular_hours,overtime_hours,double_overtime_hours,bonus",
        "Álvarez,Ana,Picker (Primary),a1b2c3,40.00,0.00,0.00,62.34",
        "Okafor,Ben,Loader (Primary),d4e5f6,38.00,0.00,0.00,0.00",
        "",
      ].join("\n"),
    );
    expect(r.controlTotals).toMatchObject({ workers: 2, minutesByType: { REG: 4680, BONUS: 0 }, amountsByType: { BONUS: 6234 }, grossCents: 148_584, payrollSystemGrossCents: 148_584, payrollSystemDifferenceCents: 0 });
    expect(parseGustoHoursCsv(text(r.bytes))).toMatchObject({ workers: 2, bonusCents: 6234 });
  });

  it("refuses a bonus line that carries minutes, or a bonus without the column mapped", () => {
    const mapped = { REG: "regular_hours", OT: "overtime_hours", DT: "double_overtime_hours", BONUS: "bonus" } as const;
    const reg = { workerId: "w1", type: "REG" as const, minutes: 480, amountCents: 14_600, rate: { num: 1825, den: 1 } };
    expect(() => renderGustoHours(base({ earningCodeMap: mapped, payLines: [reg, { workerId: "w1", type: "BONUS", minutes: 60, amountCents: 5000, rate: { num: 5000, den: 1 } }] }))).toThrowError(expect.objectContaining({ code: "invalid_pay_line" }));
    expect(() => renderGustoHours(base({ earningCodeMap: mapped, payLines: [reg, { workerId: "w1", type: "BONUS", minutes: 0, amountCents: 0, rate: { num: 0, den: 1 } }] }))).toThrowError(expect.objectContaining({ code: "invalid_pay_line" }));
    expect(() => renderGustoHours(base({ payLines: [reg, { workerId: "w1", type: "BONUS", minutes: 0, amountCents: 5000, rate: { num: 0, den: 1 } }] }))).toThrowError(expect.objectContaining({ code: "unsupported_earning_type" }));
  });

  it("refuses overtime on a weighted regular rate plainly, even when its fraction is large", () => {
    const fixture = base({
      payLines: [
        { workerId: "w1", type: "REG", minutes: 1800, amountCents: 60_000, rate: { num: 2000, den: 1 } },
        { workerId: "w1", type: "REG", minutes: 600, amountCents: 17_000, rate: { num: 1700, den: 1 } },
        { workerId: "w1", type: "OT", minutes: 360, amountCents: 15_887, rate: { num: 60_900, den: 23 } },
      ],
    });
    expect(() => renderGustoHours(fixture)).toThrowError(expect.objectContaining({ code: "several_pay_rates" }));
    expect(() => renderGustoHours(base({ payLines: [{ workerId: "w1", type: "REG", minutes: 2400, amountCents: 73_000, rate: { num: 1825, den: 1 } }, { workerId: "w1", type: "OT", minutes: 240, amountCents: 11_177, rate: { num: 61_475, den: 22 } }] }))).toThrowError("because the week's regular rate includes more than the hourly rate (a second pay rate, a bonus");
    const huge = base({ payLines: [{ workerId: "w1", type: "OT", minutes: 10_000, amountCents: 1, rate: { num: 200_000_000_000_007, den: 10_079 } }] });
    expect(() => renderGustoHours(huge)).toThrowError(ExportError);
  });
});
