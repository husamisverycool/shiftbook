import { describe, expect, it } from "vitest";
import { DEFAULT_WAGE_ACCESS, requestProblem, wageAccessAvailability, type UnpaidShift } from "./wage-access";

const on = { ...DEFAULT_WAGE_ACCESS, enabled: true };
const shift = (entryId: string, minutes: number, payRateCents: number | null): UnpaidShift => ({ entryId, workDate: "2026-10-12", minutes, payRateCents });

describe("earned wage access", () => {
  it("counts earned pay exactly and rounds down once", () => {
    // By hand: 8 h 20 min at $18.25 is 500 × 1825 = 912,500 cent-minutes; 7 h 45 min at $17.10 is
    // 465 × 1710 = 795,150. Summed exactly first: 1,707,650 ÷ 60 = 28460.83… → 28460 cents ($284.60),
    // rounded down once. Half of it (the default cap): $142.30.
    const a = wageAccessAvailability([shift("e1", 500, 1825), shift("e2", 465, 1710)], [], on, new Set());
    expect(a).toMatchObject({ earnedCents: 28460, minutes: 965, capCents: 14230, outstandingCents: 0, availableCents: 14230, reason: null });
    expect(a.entryIds).toEqual(["e1", "e2"]);
  });

  it("leaves out hours with no rate card in force and says so", () => {
    const a = wageAccessAvailability([shift("e1", 480, 2000), shift("e2", 120, null)], [], on, new Set());
    // 480 × 2000 ÷ 60 = 16000 cents; cap 50% = 8000.
    expect(a).toMatchObject({ earnedCents: 16000, minutesWithoutRate: 120, availableCents: 8000 });
  });

  it("keeps an earlier request outstanding until the hours it drew on are paid", () => {
    const shifts = [shift("e1", 480, 2000)];
    const outstanding = [{ amountCents: 5000, entryIds: ["e1"] }];
    expect(wageAccessAvailability(shifts, outstanding, on, new Set()).availableCents).toBe(3000);
    // Once e1 is paid, the access was recovered by that payroll's deduction.
    expect(wageAccessAvailability(shifts, outstanding, on, new Set(["e1"])).availableCents).toBe(8000);
  });

  it("is never negative, honours the per-request limit, and is off unless the agency turns it on", () => {
    const shifts = [shift("e1", 480, 2000)];
    expect(wageAccessAvailability(shifts, [{ amountCents: 9999, entryIds: ["e1"] }], on, new Set())).toMatchObject({ availableCents: 0, reason: "used" });
    expect(wageAccessAvailability(shifts, [], { ...on, maxPerRequestCents: 2500 }, new Set()).availableCents).toBe(2500);
    expect(wageAccessAvailability(shifts, [], DEFAULT_WAGE_ACCESS, new Set())).toMatchObject({ availableCents: 0, reason: "disabled" });
    expect(wageAccessAvailability([], [], on, new Set())).toMatchObject({ availableCents: 0, reason: "no_hours" });
  });

  it("allows a request only for whole cents from $1.00 to what is available", () => {
    const a = wageAccessAvailability([shift("e1", 480, 2000)], [], on, new Set());
    expect(requestProblem(8000, a)).toBeNull();
    expect(requestProblem(8001, a)).toBe("too_much");
    expect(requestProblem(99, a)).toBe("amount");
    expect(requestProblem(10.5, a)).toBe("amount");
    expect(requestProblem(100, { ...a, availableCents: 0 })).toBe("none");
  });
});
