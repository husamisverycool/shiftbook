import { describe, expect, it } from "vitest";
import { gridTicks, runningTotals } from "./chart-axis";

describe("chart gridlines", () => {
  it("falls on round steps of the shown unit, the top at or just above the largest value (Stripe Home: $1.5K, $1.0K, $500, $0)", () => {
    // $1,260.00 in cents, gridlines in dollars: steps of $500.
    expect(gridTicks({ max: 126_000, unit: 100, intervals: 3 })).toEqual([150_000, 100_000, 50_000, 0]);
    // $24,542.38: steps of $10,000.
    expect(gridTicks({ max: 2_454_238, unit: 100, intervals: 3 })).toEqual([3_000_000, 2_000_000, 1_000_000, 0]);
    // $7,000.00 exactly: steps of $2,500 reach it in three.
    expect(gridTicks({ max: 700_000, unit: 100, intervals: 3 })).toEqual([750_000, 500_000, 250_000, 0]);
    // 876:40 in minutes, gridlines in whole hours: steps of 500 hours.
    expect(gridTicks({ max: 52_600, unit: 60, intervals: 3 })).toEqual([60_000, 30_000, 0]);
    // Four steps where the chart is taller (Stripe's bar chart: 4K, 3K, 2K, 1K, 0).
    expect(gridTicks({ max: 380_000, unit: 100, intervals: 4 })).toEqual([400_000, 300_000, 200_000, 100_000, 0]);
  });

  it("never steps by less than one shown unit, so an empty chart reads 1 and 0", () => {
    expect(gridTicks({ max: 0, unit: 100, intervals: 3 })).toEqual([100, 0]);
    expect(gridTicks({ max: 0, unit: 60, intervals: 3 })).toEqual([60, 0]);
    expect(gridTicks({ max: 120, unit: 60, intervals: 3 })).toEqual([120, 60, 0]);
  });

  it("goes below zero for a loss, on the same steps", () => {
    expect(gridTicks({ max: 527_402, min: -100_000, unit: 100, intervals: 4 })).toEqual([600_000, 400_000, 200_000, 0, -200_000]);
    expect(gridTicks({ max: 0, min: -30_000, unit: 100, intervals: 3 })).toEqual([0, -10_000, -20_000, -30_000]);
  });
});

describe("running totals", () => {
  it("adds each day to the days before it, as Stripe's Today line rises through the day", () => {
    expect(runningTotals([60, 0, 120, 30])).toEqual([60, 60, 180, 210]);
    expect(runningTotals([])).toEqual([]);
  });
});
