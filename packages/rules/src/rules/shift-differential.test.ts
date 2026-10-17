import { describe, expect, it } from "vitest";
import { contractShortfall } from "./contract-minimum";
import { differentialEarned, differentialKey, differentialValid } from "./shift-differential";

describe("shift differential (29 C.F.R. § 778.207(b))", () => {
  const night = { name: "Night", payCentsPerHour: 150, billCentsPerHour: 200 };
  it("earned exactly: 8 h × $1.50 = 720 minutes × 150 ÷ 60 = $12.00", () => {
    expect(differentialEarned(480, night)).toEqual({ num: 72_000, den: 60 });
  });
  it("accepts whole cents per hour up to $100.00, a bill of zero, a short name", () => {
    expect(differentialValid(night)).toBe(true);
    expect(differentialValid({ ...night, billCentsPerHour: 0 })).toBe(true);
    expect(differentialValid({ ...night, payCentsPerHour: 0 })).toBe(false);
    expect(differentialValid({ ...night, payCentsPerHour: 1.5 })).toBe(false);
    expect(differentialValid({ ...night, payCentsPerHour: 10_001 })).toBe(false);
    expect(differentialValid({ ...night, billCentsPerHour: -1 })).toBe(false);
    expect(differentialValid({ ...night, name: " " })).toBe(false);
  });
  it("one key per differential", () => {
    expect(differentialKey(night)).not.toBe(differentialKey({ ...night, billCentsPerHour: 0 }));
  });
});

describe("contractual minimum hours (29 C.F.R. § 778.220)", () => {
  it("owes the promise less minutes worked and statutory minimum already paid, never below zero", () => {
    expect(contractShortfall(240, 90, 0)).toBe(150);
    expect(contractShortfall(240, 90, 150)).toBe(0);
    expect(contractShortfall(240, 300, 0)).toBe(0);
    expect(contractShortfall(480, 60, 180)).toBe(240);
  });
});
