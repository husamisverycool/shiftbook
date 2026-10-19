import { addDays } from "@shiftbook/rules";
import { describe, expect, it } from "vitest";
import { acaRows, acaSettingsProblem, latestStandardPeriod, type AcaLimits, type AcaRow, type AcaSettings, type Covered, type ServiceDay } from "./aca";

/** The limits of 26 C.F.R. § 54.4980H (drizzle/0033's row): 3–12 months, 90 days, 6 months, 30 h a week, 13 weeks. */
const LIMITS: AcaLimits = { minMeasurementMonths: 3, maxMeasurementMonths: 12, maxAdminDays: 90, minStabilityMonths: 6, fullTimeMinutesPerWeek: 1800, breakWeeks: 13 };
const SETTINGS: AcaSettings = { measurementMonths: 12, firstMonth: 10, adminDays: 60, stabilityMonths: 12 };
const TODAY = "2026-10-16";
/** `count` days of `minutes` each from a date. */
const daily = (workerId: string, from: string, count: number, minutes: number): ServiceDay[] => Array.from({ length: count }, (_, i) => ({ workerId, date: addDays(from, i), minutes }));
/** Tabulado paid every week from 2025-10-01 to yesterday (the hours on file). */
const COVERED: Covered[] = [{ start: "2025-10-01", end: "2026-10-15" }];
const rows = (over: Partial<Parameters<typeof acaRows>[0]>) => acaRows({ today: TODAY, settings: SETTINGS, limits: LIMITS, workers: [], days: [], months: [], covered: COVERED, ...over });
const at = (today: string, over: Partial<Parameters<typeof acaRows>[0]>) => acaRows({ today, settings: SETTINGS, limits: LIMITS, workers: [], days: [], months: [], covered: [{ start: "2025-01-01", end: addDays(today, -1) }], ...over });
const cycles = (r: AcaRow[]) => r.map((x) => [x.workerName, x.cycle, x.measurementStart, x.measurementEnd, x.result]);

describe("ACA look-back (26 C.F.R. § 54.4980H-3(d))", () => {
  it("settings within the limits: 3–12 months, at most 90 administrative days, stability at least 6 months and no shorter than the measurement", () => {
    expect(acaSettingsProblem(SETTINGS, LIMITS)).toBeNull();
    expect(acaSettingsProblem({ ...SETTINGS, measurementMonths: 13 }, LIMITS)).toBe("measurementMonths");
    expect(acaSettingsProblem({ ...SETTINGS, measurementMonths: 2 }, LIMITS)).toBe("measurementMonths");
    expect(acaSettingsProblem({ ...SETTINGS, adminDays: 91 }, LIMITS)).toBe("adminDays");
    expect(acaSettingsProblem({ ...SETTINGS, adminDays: -1 }, LIMITS)).toBe("adminDays");
    expect(acaSettingsProblem({ ...SETTINGS, stabilityMonths: 11 }, LIMITS)).toBe("stabilityMonths");
    expect(acaSettingsProblem({ ...SETTINGS, measurementMonths: 3, stabilityMonths: 5 }, LIMITS)).toBe("stabilityMonths");
    expect(acaSettingsProblem({ ...SETTINGS, stabilityMonths: 25 }, LIMITS)).toBe("stabilityMonths");
    expect(acaSettingsProblem({ ...SETTINGS, firstMonth: 0 }, LIMITS)).toBe("firstMonth");
    expect(acaSettingsProblem({ ...SETTINGS, firstMonth: 1.5 }, LIMITS)).toBe("firstMonth");
  });

  it("the latest standard period that has ended: October 2025 to September 2026 on 2026-10-16", () => {
    expect(latestStandardPeriod(SETTINGS, TODAY)).toEqual({ start: "2025-10-01", end: "2026-09-30" });
    expect(latestStandardPeriod(SETTINGS, "2026-10-01")).toEqual({ start: "2025-10-01", end: "2026-09-30" });
    expect(latestStandardPeriod(SETTINGS, "2026-09-30")).toEqual({ start: "2024-10-01", end: "2025-09-30" });
    expect(latestStandardPeriod({ ...SETTINGS, measurementMonths: 6, firstMonth: 1 }, TODAY)).toEqual({ start: "2026-01-01", end: "2026-06-30" });
    expect(latestStandardPeriod({ ...SETTINGS, measurementMonths: 3, firstMonth: 11 }, TODAY)).toEqual({ start: "2026-05-01", end: "2026-07-31" });
  });

  it("an ongoing worker is full-time at 30 hours a week on average: minutes × 7 ≥ 1,800 × days; the period running now is measuring", () => {
    // 2025-10-01 to 2026-09-30 is 365 days; the line is 1,800 × 365 ÷ 7 = 93,857.1 minutes.
    // 365 days of 257 minutes = 93,805 (not full-time); of 258 = 94,170 (full-time).
    const workers = [
      { id: "a", name: "A", hireDate: "2025-01-06" },
      { id: "b", name: "B", hireDate: "2025-01-06" },
    ];
    const r = rows({ workers, days: [...daily("a", "2025-10-01", 380, 257), ...daily("b", "2025-10-01", 380, 258)] });
    const ended = r.filter((x) => x.measurementStart === "2025-10-01");
    expect(ended.map((x) => [x.workerName, x.cycle, x.result, x.minutes, x.days, x.weeks, x.averageMinutesPerWeek])).toEqual([
      ["A", "standard", "not_full_time", 93_805, 365, 52, 1799],
      ["B", "standard", "full_time", 94_170, 365, 52, 1806],
    ]);
    // Administrative period 60 days: 2026-10-01 to 2026-11-29; stability 12 months from 2026-11-30.
    expect(ended[1]).toMatchObject({ measurementEnd: "2026-09-30", adminStart: "2026-10-01", adminEnd: "2026-11-29", stabilityStart: "2026-11-30", stabilityEnd: "2027-11-29" });
    // The period from 2026-10-01: 15 days so far (to yesterday), 15 × 258 = 3,870 minutes for B.
    const now = r.find((x) => x.workerName === "B" && x.measurementStart === "2026-10-01")!;
    expect(now).toMatchObject({ cycle: "standard", result: "measuring", measurementEnd: "2027-09-30", days: 15, minutes: 3870, adminStart: null, stabilityStart: null });
    // Hired 2025-01-06, before the hours on file: the initial period (2025-02-01 to 2026-01-31, its stability still
    // running) cannot be decided — hours are missing from its first day.
    expect(cycles(r).filter(([n]) => n === "A")).toEqual([
      ["A", "initial", "2025-02-01", "2026-01-31", "missing_hours"],
      ["A", "standard", "2025-10-01", "2026-09-30", "not_full_time"],
      ["A", "standard", "2026-10-01", "2027-09-30", "measuring"],
    ]);
    expect(r[0]).toMatchObject({ missingFrom: "2025-02-01" });
  });

  it("a new worker is measured on an initial period from the first of the next month; while it runs, measuring", () => {
    // Worked 8 hours a day from 2026-02-10 to 2026-10-15 (248 days).
    const r = rows({ workers: [{ id: "c", name: "C", hireDate: "2026-02-10" }], days: daily("c", "2026-02-10", 248, 480) });
    // From 2026-03-01 to 2027-02-28; so far 2026-03-01 to 2026-10-15: 229 days × 480 = 109,920 minutes.
    expect(r[0]).toMatchObject({ cycle: "initial", result: "measuring", measurementStart: "2026-03-01", measurementEnd: "2027-02-28", days: 229, minutes: 109_920, adminEnd: null });
    // Employed before the standard period that began 2026-10-01: measured on it too.
    expect(cycles(r)).toEqual([
      ["C", "initial", "2026-03-01", "2027-02-28", "measuring"],
      ["C", "standard", "2026-10-01", "2027-09-30", "measuring"],
    ]);
  });

  it("a new worker's administrative period is at most 90 days in all, the days before the initial period included", () => {
    // Six-month periods, 90 administrative days. Started 2026-02-10; the initial period runs 2026-03-01 to 2026-08-31,
    // so 19 days (2026-02-10 to 2026-02-28) are already administrative: 71 remain, 2026-09-01 to 2026-11-10.
    const six: AcaSettings = { measurementMonths: 6, firstMonth: 1, adminDays: 90, stabilityMonths: 6 };
    const r = rows({ settings: six, workers: [{ id: "h", name: "H", hireDate: "2026-02-10" }], days: daily("h", "2026-02-10", 248, 480) });
    expect(r.find((x) => x.cycle === "initial")).toMatchObject({ result: "full_time", measurementStart: "2026-03-01", measurementEnd: "2026-08-31", adminStart: "2026-09-01", adminEnd: "2026-11-10", stabilityStart: "2026-11-11", stabilityEnd: "2027-05-10" });
    // Starting on a first leaves all 90: 2026-09-01 to 2026-11-29.
    const first = rows({ settings: six, workers: [{ id: "i", name: "I", hireDate: "2026-03-01" }], days: daily("i", "2026-03-01", 229, 480) });
    expect(first.find((x) => x.cycle === "initial")).toMatchObject({ measurementStart: "2026-03-01", adminEnd: "2026-11-29", stabilityStart: "2026-11-30" });
    // No administrative period: stability starts the day after.
    const none = rows({ settings: { ...six, adminDays: 0 }, workers: [{ id: "i", name: "I", hireDate: "2026-03-01" }], days: daily("i", "2026-03-01", 229, 480) });
    expect(none.find((x) => x.cycle === "initial")).toMatchObject({ adminStart: null, adminEnd: null, stabilityStart: "2026-09-01", stabilityEnd: "2027-02-28" });
  });

  it("the initial period's administrative period stops at the end of the first month beginning on or after the first anniversary", () => {
    // Started 2025-10-15: initial 2025-11-01 to 2026-10-31; 60 days would run to 2026-12-30, but the anniversary
    // 2026-10-15 → the month beginning 2026-11-01 → it ends 2026-11-30.
    const r = at("2026-12-01", { workers: [{ id: "d", name: "D", hireDate: "2025-10-15" }], days: daily("d", "2025-10-15", 400, 480) });
    expect(r.find((x) => x.cycle === "initial")).toMatchObject({ result: "full_time", measurementStart: "2025-11-01", measurementEnd: "2026-10-31", adminStart: "2026-11-01", adminEnd: "2026-11-30", stabilityStart: "2026-12-01" });
  });

  it("a new worker's initial cycle stays listed while its stability period runs, beside the standard ones", () => {
    // Started 2025-07-07, before the standard period of 2025-10-01: the initial period 2025-08-01 to 2026-07-31 ended,
    // its stability (from 2026-09-01) still runs; the standard periods are measured too.
    const r = at(TODAY, { workers: [{ id: "j", name: "J", hireDate: "2025-07-07" }], days: daily("j", "2025-07-07", 466, 480) });
    expect(cycles(r)).toEqual([
      ["J", "initial", "2025-08-01", "2026-07-31", "full_time"],
      ["J", "standard", "2025-10-01", "2026-09-30", "full_time"],
      ["J", "standard", "2026-10-01", "2027-09-30", "measuring"],
    ]);
    // 2025-07-07 to 2025-07-31 is 25 days: 65 of the 90 remain, and 60 are used; the anniversary month (2026-07) ends sooner.
    expect(r[0]).toMatchObject({ adminStart: "2026-08-01", adminEnd: "2026-08-31", stabilityStart: "2026-09-01", stabilityEnd: "2027-08-31" });
    // Once that stability period is over, the initial cycle is no longer listed.
    expect(cycles(at("2027-09-01", { workers: [{ id: "j", name: "J", hireDate: "2025-07-07" }], days: daily("j", "2025-07-07", 790, 480) })).map(([, c, s]) => `${c} ${s}`)).toEqual(["standard 2025-10-01", "standard 2026-10-01"]);
  });

  it("a worker who started on a standard period's first day was employed through all of it: measured on it, and on the initial period", () => {
    const r = rows({ workers: [{ id: "n", name: "N", hireDate: "2025-10-01" }], days: daily("n", "2025-10-01", 380, 480) });
    expect(cycles(r)).toEqual([
      ["N", "initial", "2025-10-01", "2026-09-30", "full_time"],
      ["N", "standard", "2025-10-01", "2026-09-30", "full_time"],
      ["N", "standard", "2026-10-01", "2027-09-30", "measuring"],
    ]);
    // The initial period's administrative period ends with the anniversary month (2026-10); the standard one runs its 60 days.
    expect([r[0]!.adminEnd, r[1]!.adminEnd]).toEqual(["2026-10-31", "2026-11-29"]);
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
    // E keeps the periods already ended (213 days × 8 h from 2025-10-01 is full-time over the year; its result stands) and is
    // listed as on a break; nothing of E's is measuring.
    expect(r.map((x) => [x.workerName, x.cycle, x.result, x.measurementStart, x.breakStart, x.breakEnd])).toEqual([
      ["E", "initial", "missing_hours", "2025-02-01", "2026-05-02", null],
      ["E", "standard", "full_time", "2025-10-01", "2026-05-02", null],
      ["E", "standard", "on_break", "2026-05-02", "2026-05-02", null],
      ["F", "initial", "measuring", "2026-06-01", "2026-02-01", "2026-05-31"],
      ["F", "standard", "measuring", "2026-10-01", "2026-02-01", "2026-05-31"],
    ]);
    // A gap across days not on file is not a break: with nothing paid from 2026-02-01 to 2026-05-31, F is continuing.
    const unknown = rows({ workers: [{ id: "f", name: "F", hireDate: "2025-01-06" }], days: [...daily("f", "2025-10-01", 123, 480), ...daily("f", "2026-06-01", 137, 480)], covered: [{ start: "2025-10-01", end: "2026-01-31" }, { start: "2026-06-01", end: "2026-10-15" }] });
    expect(unknown.every((x) => x.breakStart === null)).toBe(true);
    expect(unknown.find((x) => x.measurementStart === "2025-10-01")).toMatchObject({ result: "missing_hours", missingFrom: "2026-02-01" });
    // 12 weeks and 6 days without is not a break.
    const short = rows({ workers: [{ id: "k", name: "K", hireDate: "2025-01-06" }], days: [...daily("k", "2025-10-01", 100, 480), ...daily("k", addDays("2025-10-01", 100 + 90), 150, 480)] });
    expect(short.every((x) => x.breakStart === null)).toBe(true);
  });

  it("hours from before Tabulado come in whole months; a worker with no hours and no hire date is left out", () => {
    // 12 months of 8,000 minutes = 96,000 over 365 days: full-time.
    const months = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((m) => ({ workerId: "g", month: `${m}-01`, minutes: 8000 }));
    const r = rows({ workers: [{ id: "g", name: "G", hireDate: "2024-03-04" }, { id: "z", name: "Z", hireDate: null }], months });
    expect(r.find((x) => x.measurementStart === "2025-10-01")).toMatchObject({ result: "full_time", minutes: 96_000 });
    expect(r.some((x) => x.workerId === "z")).toBe(false);
  });

  it("a period with days not on file is never decided on what is missing: ended, hours missing from the first such day; running, counted to the last day on file", () => {
    // Tabulado paid from 2026-01-05 to 2026-10-04 only: 2026-01-05 to 2026-09-30 is 269 days × 480 = 129,120 minutes.
    const r = rows({ workers: [{ id: "m", name: "M", hireDate: "2024-06-03" }], days: daily("m", "2026-01-05", 285, 480), covered: [{ start: "2026-01-05", end: "2026-10-04" }] });
    expect(r.map((x) => [x.measurementStart, x.result, x.missingFrom, x.countedThrough, x.days, x.minutes])).toEqual([
      ["2025-10-01", "missing_hours", "2025-10-01", "2026-09-30", 365, 129_120],
      // 2026-10-01 to 2026-10-04 on file: 4 days × 480; the days since are not paid yet, not missing.
      ["2026-10-01", "measuring", null, "2026-10-04", 4, 1920],
    ]);
    // Months imported from before Tabulado fill the gap: 2025-10 to 2025-12 at 10,000 minutes, with 2026-01-01 to 01-04 still missing.
    const months = ["2025-10", "2025-11", "2025-12"].map((m) => ({ workerId: "m", month: `${m}-01`, minutes: 10_000 }));
    const filled = rows({ workers: [{ id: "m", name: "M", hireDate: "2024-06-03" }], days: daily("m", "2026-01-05", 285, 480), months, covered: [{ start: "2026-01-01", end: "2026-10-04" }] });
    expect(filled[0]).toMatchObject({ result: "full_time", missingFrom: null, minutes: 129_120 + 30_000 });
  });

  it("second opinion: an imported month is on file only for its worker; a worker a run skipped has no hours on file there", () => {
    // Imported January to June 2025 for A only; Tabulado paid from 2025-07-01, with B in every run; B worked 8 h every day.
    const r = acaRows({
      today: "2026-02-10",
      settings: { ...SETTINGS, firstMonth: 1 },
      limits: LIMITS,
      workers: [{ id: "b", name: "B", hireDate: "2024-03-04" }],
      days: daily("b", "2025-07-01", 400, 480),
      months: ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"].map((m) => ({ workerId: "a", month: `${m}-01`, minutes: 9000 })),
      covered: [{ start: "2025-07-01", end: "2026-02-08" }],
    });
    expect(r.find((x) => x.measurementStart === "2025-01-01")).toMatchObject({ result: "missing_hours", missingFrom: "2025-01-01" });
    // Months imported with no hours are on file: January to June 2025 without an hour (26 weeks) is a break, so B is new from July.
    const zero = acaRows({ today: "2026-02-10", settings: { ...SETTINGS, firstMonth: 1 }, limits: LIMITS, workers: [{ id: "b", name: "B", hireDate: "2024-03-04" }], days: daily("b", "2025-07-01", 400, 480), months: ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"].map((m) => ({ workerId: "b", month: `${m}-01`, minutes: 0 })), covered: [{ start: "2025-07-01", end: "2026-02-08" }] });
    expect(zero.map((x) => [x.cycle, x.measurementStart, x.result, x.breakStart, x.breakEnd])).toEqual([
      ["initial", "2025-07-01", "measuring", "2025-01-01", "2025-06-30"],
      ["standard", "2026-01-01", "measuring", "2025-01-01", "2025-06-30"],
    ]);
    // A week whose run skipped B is not on file for B.
    const skipped = rows({ workers: [{ id: "b", name: "B", hireDate: "2024-03-04" }], days: daily("b", "2025-10-01", 380, 480), covered: [{ start: "2025-10-01", end: "2026-03-01" }, { start: "2026-03-02", end: "2026-03-08", except: ["b"] }, { start: "2026-03-09", end: "2026-10-15" }] });
    expect(skipped.find((x) => x.measurementStart === "2025-10-01")).toMatchObject({ result: "missing_hours", missingFrom: "2026-03-02" });
  });

  it("second opinion: a full-time result stays listed until its stability period ends, beside the newer period", () => {
    // 90 administrative days: the period of 2024-10 to 2025-09 has stability from 2025-12-30 to 2026-12-29, still running on 2026-10-16.
    // Hired 2023, before the hours on file (from 2024-01-01), and worked every day since.
    const r = at(TODAY, { settings: { ...SETTINGS, adminDays: 90 }, workers: [{ id: "c", name: "C", hireDate: "2023-01-02" }], days: daily("c", "2024-01-01", 1019, 480), covered: [{ start: "2024-01-01", end: "2026-10-15" }] });
    expect(cycles(r)).toEqual([
      ["C", "standard", "2024-10-01", "2025-09-30", "full_time"],
      ["C", "standard", "2025-10-01", "2026-09-30", "full_time"],
      ["C", "standard", "2026-10-01", "2027-09-30", "measuring"],
    ]);
    expect(r[0]).toMatchObject({ stabilityStart: "2025-12-30", stabilityEnd: "2026-12-29" });
    // A not-full-time result there is not listed (its stability period asks nothing).
    const part = at(TODAY, { settings: { ...SETTINGS, adminDays: 90 }, workers: [{ id: "c", name: "C", hireDate: "2023-01-02" }], days: daily("c", "2024-01-01", 1019, 200), covered: [{ start: "2024-01-01", end: "2026-10-15" }] });
    expect(part.map((x) => x.measurementStart)).toEqual(["2025-10-01", "2026-10-01"]);
  });

  it("second opinion: periods that do not divide a year follow one another across New Year", () => {
    const five: AcaSettings = { measurementMonths: 5, firstMonth: 1, adminDays: 0, stabilityMonths: 6 };
    expect(latestStandardPeriod(five, "2025-12-10")).toEqual({ start: "2025-06-01", end: "2025-10-31" });
    expect(latestStandardPeriod(five, "2026-01-10")).toEqual({ start: "2025-06-01", end: "2025-10-31" });
    expect(latestStandardPeriod(five, "2026-04-01")).toEqual({ start: "2025-11-01", end: "2026-03-31" });
  });

  it("second opinion: with no hire date, a worker whose first day on file has no 13 weeks on file before it was employed all along", () => {
    // Tabulado paid from 2026-03-01: nothing on file before, so the 2025 period is listed as hours missing, not skipped as a new hire.
    const r = rows({ workers: [{ id: "u", name: "U", hireDate: null }], days: daily("u", "2026-03-01", 229, 480), covered: [{ start: "2026-03-01", end: "2026-10-15" }] });
    expect(cycles(r)).toEqual([
      ["U", "standard", "2025-10-01", "2026-09-30", "missing_hours"],
      ["U", "standard", "2026-10-01", "2027-09-30", "measuring"],
    ]);
    // With 13 weeks on file before the first day worked, the worker is new.
    const fresh = rows({ workers: [{ id: "v", name: "V", hireDate: null }], days: daily("v", "2026-03-01", 229, 480), covered: COVERED });
    expect(cycles(fresh)[0]).toEqual(["V", "initial", "2026-03-01", "2027-02-28", "measuring"]);
  });

  it("second opinion: a running period says from when hours are missing before the last day on file", () => {
    // Hired 2019; the calendar-year period of 2026 has hours on file only from 2026-03-01.
    const r = rows({ settings: { ...SETTINGS, firstMonth: 1 }, workers: [{ id: "w", name: "W", hireDate: "2019-04-01" }], days: daily("w", "2026-03-01", 229, 480), covered: [{ start: "2026-03-01", end: "2026-10-11" }] });
    expect(r.find((x) => x.measurementStart === "2026-01-01")).toMatchObject({ result: "measuring", missingFrom: "2026-01-01", countedThrough: "2026-10-11" });
  });
});
