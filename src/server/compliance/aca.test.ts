import { addDays } from "@shiftbook/rules";
import { describe, expect, it } from "vitest";
import { acaRows, acaSettingsProblem, latestStandardPeriod, type AcaLimits, type AcaSettings, type ServiceDay } from "./aca";

/** The limits of 26 C.F.R. § 54.4980H (drizzle/0032's row): 3–12 months, 90 days, 6 months, 30 h a week, 13 weeks. */
const LIMITS: AcaLimits = { minMeasurementMonths: 3, maxMeasurementMonths: 12, maxAdminDays: 90, minStabilityMonths: 6, fullTimeMinutesPerWeek: 1800, breakWeeks: 13 };
const SETTINGS: AcaSettings = { measurementMonths: 12, firstMonth: 10, adminDays: 60, stabilityMonths: 12 };
const TODAY = "2026-10-16";
/** `count` days of `minutes` each from a date. */
const daily = (workerId: string, from: string, count: number, minutes: number): ServiceDay[] => Array.from({ length: count }, (_, i) => ({ workerId, date: addDays(from, i), minutes }));
const rows = (over: Partial<Parameters<typeof acaRows>[0]>) => acaRows({ today: TODAY, settings: SETTINGS, limits: LIMITS, workers: [], days: [], months: [], ...over });

describe("ACA look-back (26 C.F.R. § 54.4980H-3(d))", () => {
  it("settings within the limits: 3–12 months, at most 90 administrative days, stability at least 6 months and no shorter than the measurement", () => {
    expect(acaSettingsProblem(SETTINGS, LIMITS)).toBeNull();
    expect(acaSettingsProblem({ ...SETTINGS, measurementMonths: 13 }, LIMITS)).toBe("measurementMonths");
    expect(acaSettingsProblem({ ...SETTINGS, adminDays: 91 }, LIMITS)).toBe("adminDays");
    expect(acaSettingsProblem({ ...SETTINGS, stabilityMonths: 11 }, LIMITS)).toBe("stabilityMonths");
    expect(acaSettingsProblem({ ...SETTINGS, measurementMonths: 3, stabilityMonths: 5 }, LIMITS)).toBe("stabilityMonths");
    expect(acaSettingsProblem({ ...SETTINGS, firstMonth: 0 }, LIMITS)).toBe("firstMonth");
  });

  it("the latest standard period that has ended: October 2025 to September 2026 on 2026-10-16", () => {
    expect(latestStandardPeriod(SETTINGS, TODAY)).toEqual({ start: "2025-10-01", end: "2026-09-30" });
    expect(latestStandardPeriod(SETTINGS, "2026-10-01")).toEqual({ start: "2025-10-01", end: "2026-09-30" });
    expect(latestStandardPeriod(SETTINGS, "2026-09-30")).toEqual({ start: "2024-10-01", end: "2025-09-30" });
    expect(latestStandardPeriod({ ...SETTINGS, measurementMonths: 6, firstMonth: 1 }, TODAY)).toEqual({ start: "2026-01-01", end: "2026-06-30" });
  });

  it("an ongoing worker is full-time at 30 hours a week on average: minutes × 7 ≥ 1,800 × days", () => {
    // 2025-10-01 to 2026-09-30 is 365 days; the line is 1,800 × 365 ÷ 7 = 93,857.1 minutes.
    // 365 days of 257 minutes = 93,805 (not full-time); of 258 = 94,170 (full-time).
    const workers = [
      { id: "a", name: "A", hireDate: "2025-01-06" },
      { id: "b", name: "B", hireDate: "2025-01-06" },
    ];
    const r = rows({ workers, days: [...daily("a", "2025-10-01", 365, 257), ...daily("b", "2025-10-01", 365, 258)] });
    expect(r.map((x) => [x.workerName, x.cycle, x.result, x.minutes, x.days, x.weeks, x.averageMinutesPerWeek])).toEqual([
      ["A", "standard", "not_full_time", 93_805, 365, 52, 1799],
      ["B", "standard", "full_time", 94_170, 365, 52, 1806],
    ]);
    // Administrative period 60 days: 2026-10-01 to 2026-11-29; stability 12 months from 2026-11-30.
    expect(r[1]).toMatchObject({ measurementStart: "2025-10-01", measurementEnd: "2026-09-30", adminStart: "2026-10-01", adminEnd: "2026-11-29", stabilityStart: "2026-11-30", stabilityEnd: "2027-11-29" });
  });

  it("a new worker is measured on an initial period from the first of the next month; while it runs, measuring", () => {
    // Worked 8 hours a day from 2026-02-10 to 2026-10-15 (248 days).
    const r = rows({ workers: [{ id: "c", name: "C", hireDate: "2026-02-10" }], days: daily("c", "2026-02-10", 248, 480) });
    // From 2026-03-01 to 2027-02-28; so far 2026-03-01 to 2026-10-15: 229 days × 480 = 109,920 minutes.
    expect(r[0]).toMatchObject({ cycle: "initial", result: "measuring", measurementStart: "2026-03-01", measurementEnd: "2027-02-28", days: 229, minutes: 109_920, adminEnd: null });
  });

  it("the initial period's administrative period stops at the end of the first month beginning on or after the first anniversary", () => {
    // Started 2025-10-15: initial 2025-11-01 to 2026-10-31; 60 days would run to 2026-12-30, but the anniversary
    // 2026-10-15 → the month beginning 2026-11-01 → it ends 2026-11-30.
    const r = acaRows({ today: "2026-12-01", settings: SETTINGS, limits: LIMITS, workers: [{ id: "d", name: "D", hireDate: "2025-10-15" }], days: daily("d", "2025-10-15", 400, 480), months: [] });
    expect(r[0]).toMatchObject({ cycle: "initial", result: "full_time", measurementStart: "2025-11-01", measurementEnd: "2026-10-31", adminStart: "2026-11-01", adminEnd: "2026-11-30", stabilityStart: "2026-12-01" });
  });

  it("13 weeks without an hour of service is a break: in one now, not measured; back from one, measured as new", () => {
    const r = rows({
      workers: [
        { id: "e", name: "E", hireDate: "2025-01-06" },
        { id: "f", name: "F", hireDate: "2025-01-06" },
      ],
      // E last worked 2026-05-01 (168 days ago). F worked to 2026-01-31, then from 2026-06-01 to 2026-10-15: 120 days without.
      days: [...daily("e", "2025-10-01", 213, 480), ...daily("f", "2025-10-01", 123, 480), ...daily("f", "2026-06-01", 137, 480)],
    });
    expect(r.map((x) => [x.workerName, x.result, x.breakStart, x.breakEnd])).toEqual([
      ["E", "on_break", "2026-05-02", null],
      ["F", "measuring", "2026-02-01", "2026-05-31"],
    ]);
    expect(r[1]).toMatchObject({ cycle: "initial", measurementStart: "2026-06-01" });
  });

  it("hours from before Shiftbook come in whole months", () => {
    // 12 months of 8,000 minutes = 96,000 over 365 days: full-time.
    const months = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((m) => ({ workerId: "g", month: `${m}-01`, minutes: 8000 }));
    expect(rows({ workers: [{ id: "g", name: "G", hireDate: "2024-03-04" }], months })[0]).toMatchObject({ result: "full_time", minutes: 96_000 });
  });
});
