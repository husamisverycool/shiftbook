import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { exactDecimal, exactDecimalBig, floorDiv, lowestTermsBig, mod, reduceFractionBig, roundHalfUp, roundHalfUpBig } from "./int";

describe("roundHalfUp(num, den) — integer division rounded half away from zero", () => {
  it("rounds exact quotients without change", () => {
    expect(roundHalfUp(10_800, 1)).toBe(10_800);
    expect(roundHalfUp(648_000, 60)).toBe(10_800);
  });

  it("rounds halves up (away from zero)", () => {
    expect(roundHalfUp(5, 2)).toBe(3); // 2.5 → 3
    expect(roundHalfUp(-5, 2)).toBe(-3); // -2.5 → -3
    expect(roundHalfUp(1_688_125, 1000)).toBe(1688); // 1688.125 → 1688
    expect(roundHalfUp(16_885, 10)).toBe(1689); // 1688.5 → 1689
  });

  it("matches the exact rational rule for every integer input", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e9, max: 1e9 }), fc.integer({ min: 1, max: 1e6 }), (n, d) => {
        const q = roundHalfUp(n, d);
        // |n/d - q| <= 1/2, and when exactly 1/2 the result is away from zero
        const twiceDiff = 2 * n - 2 * q * d; // = 2d(n/d - q)
        expect(Math.abs(twiceDiff)).toBeLessThanOrEqual(d);
        if (Math.abs(twiceDiff) === d) expect(Math.sign(q) === Math.sign(n) || q === 0).toBe(true);
      }),
    );
  });

  it("rejects non-integers and unsafe values", () => {
    expect(() => roundHalfUp(1.5, 2)).toThrow(/integer/);
    expect(() => roundHalfUp(1, 0)).toThrow(/positive/);
    expect(() => roundHalfUp(Number.MAX_SAFE_INTEGER, 1)).toThrow(/safe/);
  });
});

describe("floorDiv and mod", () => {
  it("floor towards negative infinity", () => {
    expect(floorDiv(7, 2)).toBe(3);
    expect(floorDiv(-7, 2)).toBe(-4);
    expect(mod(-1, 7)).toBe(6);
    expect(mod(15, 7)).toBe(1);
  });
});

describe("exactDecimal(num, den) — shows a rational exactly for explain strings", () => {
  it("writes terminating decimals in full", () => {
    expect(exactDecimal(1_688_125, 1000)).toBe("1688.125");
    expect(exactDecimal(10_800, 1)).toBe("10800");
    expect(exactDecimal(5475, 2)).toBe("2737.5");
  });

  it("marks repeating decimals with an ellipsis after 4 places", () => {
    expect(exactDecimal(12_775, 60)).toBe("212.9166…");
    expect(exactDecimal(1, 3)).toBe("0.3333…");
  });

  it("handles negatives", () => {
    expect(exactDecimal(-5, 2)).toBe("-2.5");
  });
});

describe("big-integer helpers for line amounts", () => {
  it("round half away from zero and stay exact past 2^53", () => {
    expect(roundHalfUpBig(5n, 2n)).toBe(3);
    expect(roundHalfUpBig(-5n, 2n)).toBe(-3);
    expect(roundHalfUpBig(10_000n * 200_000_000_000_007n, 60n * 10_079n)).toBe(3_307_206_402_752);
    expect(exactDecimalBig(1n, 3n)).toBe("0.3333…");
    expect(exactDecimalBig(-7n, 2n)).toBe("-3.5");
    expect(() => roundHalfUpBig(1n, 0n)).toThrow();
  });
});


describe("lowestTermsBig — exact lowest terms as big integers; the sign stays on the numerator", () => {
  it("reduces", () => {
    expect(lowestTermsBig(16_425n * 52n, 3n)).toEqual({ num: 284_700n, den: 1n });
    expect(lowestTermsBig(-18n, 12n)).toEqual({ num: -3n, den: 2n });
    expect(lowestTermsBig(0n, 7n)).toEqual({ num: 0n, den: 1n });
    expect(() => lowestTermsBig(1n, 0n)).toThrow();
  });
});

describe("reduceFractionBig — exact lowest terms, or null when it cannot be a safe integer", () => {
  it("reduces big numerators and denominators exactly", () => {
    expect(reduceFractionBig(85_300n * 60n, 2640n * 60n)).toEqual({ num: 4265, den: 132 });
    expect(reduceFractionBig(0n, 7n)).toEqual({ num: 0, den: 1 });
    expect(reduceFractionBig(-6n, 4n)).toEqual({ num: -3, den: 2 });
  });
  it("returns null when lowest terms still do not fit", () => {
    expect(reduceFractionBig(2n ** 60n + 1n, 2n ** 60n)).toBeNull();
  });
  it("refuses a denominator that is not positive", () => {
    expect(() => reduceFractionBig(1n, 0n)).toThrow();
  });
});
