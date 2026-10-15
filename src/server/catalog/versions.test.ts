import { describe, expect, it } from "vitest";
import { billFromMarkup, inForce, isFrozen, planDelete, planInsert, rateProblems, type RateInput } from "./versions";

const v = (id: string, effectiveFrom: string, effectiveTo: string | null) => ({ id, effectiveFrom, effectiveTo });
const rate = (over: Partial<RateInput> = {}): RateInput => ({
  effectiveFrom: "2026-10-12",
  payRateCents: 1825,
  bill: { rateCents: 2650 },
  otMultiplier: { num: 3, den: 2 },
  dtMultiplier: { num: 2, den: 1 },
  wcClassCode: "8018",
  ...over,
});

describe("rate card versions (Bullhorn: a version ends the day before the next one starts)", () => {
  it("adds the first version open-ended", () => {
    expect(planInsert([], "2026-10-12")).toEqual({ ok: true, effectiveTo: null, updates: [] });
  });

  it("ends the version in force the day before a later one starts", () => {
    expect(planInsert([v("a", "2026-01-01", null)], "2026-10-12")).toEqual({ ok: true, effectiveTo: null, updates: [{ id: "a", effectiveTo: "2026-10-11" }] });
  });

  it("slots a version between two others, ending it the day before the next", () => {
    const versions = [v("a", "2026-01-01", "2026-06-30"), v("b", "2026-07-01", null)];
    expect(planInsert(versions, "2026-03-01")).toEqual({ ok: true, effectiveTo: "2026-06-30", updates: [{ id: "a", effectiveTo: "2026-02-28" }] });
  });

  it("refuses two versions starting on the same day", () => {
    expect(planInsert([v("a", "2026-01-01", null)], "2026-01-01")).toEqual({ ok: false, error: "same_start" });
  });

  it("deletes a version by extending the one before it over its dates", () => {
    const versions = [v("a", "2026-01-01", "2026-06-30"), v("b", "2026-07-01", "2026-09-30"), v("c", "2026-10-01", null)];
    expect(planDelete(versions, "b")).toEqual({ ok: true, updates: [{ id: "a", effectiveTo: "2026-09-30" }] });
    expect(planDelete(versions, "c")).toEqual({ ok: true, updates: [{ id: "b", effectiveTo: null }] });
  });

  it("keeps the earliest version while later ones exist (Bullhorn)", () => {
    expect(planDelete([v("a", "2026-01-01", "2026-06-30"), v("b", "2026-07-01", null)], "a")).toEqual({ ok: false, error: "earliest" });
    expect(planDelete([v("a", "2026-01-01", null)], "a")).toEqual({ ok: true, updates: [] });
  });

  it("finds the version in force on a date", () => {
    const versions = [v("a", "2026-01-01", "2026-06-30"), v("b", "2026-07-01", null)];
    expect(inForce(versions, "2026-06-30")?.id).toBe("a");
    expect(inForce(versions, "2026-07-01")?.id).toBe("b");
    expect(inForce(versions, "2025-12-31")).toBeNull();
  });

  it("freezes a version that starts on or before the last paid day", () => {
    expect(isFrozen(v("a", "2026-10-05", null), "2026-10-11")).toBe(true);
    expect(isFrozen(v("a", "2026-10-12", null), "2026-10-11")).toBe(false);
    expect(isFrozen(v("a", "2026-10-05", null), null)).toBe(false);
  });
});

describe("bill rate from a markup, rounded once and explained", () => {
  it("rounds half up to the cent and says so", () => {
    // $18.25 × 145% = 2646.25 cents → $26.46
    expect(billFromMarkup(1825, 4500)).toEqual({ rateCents: 2646, explain: "$18.25 × (100% + 45.00%) = 2646.25¢, rounded half up to $26.46" });
    // $18.25 × 150% = 2737.5 cents → $27.38
    expect(billFromMarkup(1825, 5000).rateCents).toBe(2738);
  });
});

describe("rate checks", () => {
  it("accepts a sound rate", () => {
    expect(rateProblems(rate())).toEqual([]);
  });

  it("names each problem", () => {
    expect(rateProblems(rate({ effectiveFrom: "2026-13-01" }))).toContain("effective_from");
    expect(rateProblems(rate({ payRateCents: 0 }))).toContain("pay_rate");
    expect(rateProblems(rate({ payRateCents: 1825.5 }))).toContain("pay_rate");
    expect(rateProblems(rate({ bill: { rateCents: -1 } }))).toContain("bill_rate");
    expect(rateProblems(rate({ bill: { markupBp: -1 } }))).toContain("markup");
    expect(rateProblems(rate({ otMultiplier: { num: 1, den: 2 } }))).toContain("ot_multiplier");
    expect(rateProblems(rate({ dtMultiplier: { num: 2, den: 0 } }))).toContain("dt_multiplier");
    expect(rateProblems(rate({ payRateCents: 10_000_001 }))).toContain("pay_rate");
  });

  it("takes the bill as exactly one of a rate or a markup, each checked the same way it is used", () => {
    expect(rateProblems(rate({ bill: { rateCents: 2900, markupBp: -10_000 } as unknown as RateInput["bill"] }))).toContain("bill_rate");
    expect(rateProblems(rate({ bill: {} as unknown as RateInput["bill"] }))).toContain("bill_rate");
    expect(rateProblems(rate({ bill: { markupBp: 1.5 } }))).toContain("markup");
    expect(rateProblems(rate({ bill: { markupBp: "45" as unknown as number } }))).toContain("markup");
    // A markup whose bill rate would be over the cap is refused, not left for the run to block.
    expect(rateProblems(rate({ payRateCents: 9_000_000, bill: { markupBp: 50_000 } }))).toContain("bill_rate");
  });
});
