import type { EqualPayRule } from "@shiftbook/rules";
import { describe, expect, it } from "vitest";
import { counters } from "./counters";

/** drizzle/0005's Illinois row: work from 2024-04-01; 600 h heads-up; more than 720 h in 12 months, 4,160 h in 48. */
const IL: EqualPayRule = { jurisdiction: "IL", ruleCode: "il_dtlsa_equal_pay", countsFrom: "2024-04-01", warnMinutes: 36_000, windowMonths: 12, triggerMinutes: 43_200, longWindowMonths: 48, longTriggerMinutes: 249_600, effectiveFrom: "2024-08-09", effectiveTo: null, citation: "820 ILCS 175/42" };
const TODAY = "2026-10-16";
const run = (over: Partial<Parameters<typeof counters>[0]>) => counters({ today: TODAY, jurisdiction: "IL", rules: [IL], worked: [], balances: [], crossings: [], ...over });

describe("hours counters (J5; 820 ILCS 175/42)", () => {
  it("the 12 months to today start the day after the same date a year ago; the 48 months not before the counting start", () => {
    // 2026-10-16 − 12 months = 2025-10-16, + 1 day = 2025-10-17. 48 months back is 2022-10-17, before 2024-04-01.
    const [r] = run({
      worked: [
        { workerId: "w", clientId: "c", date: "2025-10-16", minutes: 480 },
        { workerId: "w", clientId: "c", date: "2025-10-17", minutes: 480 },
        { workerId: "w", clientId: "c", date: "2024-03-31", minutes: 480 },
        { workerId: "w", clientId: "c", date: "2024-04-01", minutes: 480 },
        { workerId: "w", clientId: "c", date: "2026-10-17", minutes: 480 },
      ],
    });
    expect(r).toMatchObject({ windowStart12: "2025-10-17", windowStart48: "2024-04-01", minutes12: 480, minutes48: 1440, balanceMinutes: 0, near: false });
  });

  it("an opening balance counts on the date it runs to; past 600 hours and not crossed is near", () => {
    // 600 h 01 m = 36,060 minutes: 35,580 from a balance through 2026-09-30 + 480 worked.
    const [r] = run({ balances: [{ workerId: "w", clientId: "c", throughOn: "2026-09-30", minutes: 35_580 }], worked: [{ workerId: "w", clientId: "c", date: "2026-10-05", minutes: 480 }] });
    expect(r).toMatchObject({ minutes12: 36_060, minutes48: 36_060, balanceMinutes: 35_580, near: true, crossed720: null });
    // A balance through a date before the 12 months counts only in the 48.
    const [old] = run({ balances: [{ workerId: "w", clientId: "c", throughOn: "2025-06-30", minutes: 6000 }] });
    expect([old!.minutes12, old!.minutes48, old!.balanceMinutes]).toEqual([0, 6000, 6000]);
  });

  it("a crossing on file is shown (and is not near), even with no hours in the window; most hours first", () => {
    const rows = run({
      worked: [
        { workerId: "a", clientId: "c", date: "2026-10-05", minutes: 600 },
        { workerId: "b", clientId: "c", date: "2026-10-05", minutes: 900 },
      ],
      balances: [{ workerId: "b", clientId: "c", throughOn: "2026-09-30", minutes: 43_000 }],
      crossings: [
        { kind: "il_equal_pay_720h", workerId: "b", clientId: "c", crossedOn: "2026-10-05" },
        { kind: "il_equal_pay_720h", workerId: "z", clientId: "c", crossedOn: "2024-12-01" },
      ],
    });
    expect(rows.map((r) => [r.workerId, r.minutes12, r.crossed720, r.near])).toEqual([
      ["b", 43_900, "2026-10-05", false],
      ["a", 600, null, false],
      ["z", 0, "2024-12-01", false],
    ]);
  });

  it("no rule in force, no counters", () => {
    expect(run({ jurisdiction: "MA", worked: [{ workerId: "w", clientId: "c", date: "2026-10-05", minutes: 480 }] })).toEqual([]);
  });
});
