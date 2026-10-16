import { describe, expect, it } from "vitest";
import { lineBurden, percentOf, perHundred } from "./burden";

const CA = { taxPpm: 117_500, taxState: "CA", wcPpm: 40_000, wcState: "CA", wcClass: "8292", excludeOtPremium: true };

describe("estimated burden on one pay line (decision I2), rounded once", () => {
  it("regular pay: 11.75% taxes + $4.00 per $100 workers' comp", () => {
    // $780.00 × 11.75% = $91.65; $780.00 × 4% = $31.20; $122.85.
    const b = lineBurden({ type: "REG", amountCents: 78_000 }, CA);
    expect(b).toMatchObject({ cents: 12_285, incomplete: false });
    expect(b.explain).toBe("Employer taxes (CA) 11.75% of $780.00 = $91.65; workers' comp (CA 8292) $4.00 per $100 of $780.00 = $31.20; burden $122.85.");
  });

  it("overtime at time and a half: workers' comp leaves out the premium (2/3 of the pay)", () => {
    // $175.50 × 11.75% = $20.62125; WC on $117.00 × 4% = $4.68; $25.30125 → $25.30.
    const b = lineBurden({ type: "OT", amountCents: 17_550 }, CA);
    expect(b.cents).toBe(2530);
    expect(b.explain).toBe(
      "Employer taxes (CA) 11.75% of $175.50 = $20.6212…; workers' comp (CA 8292) $4.00 per $100 of $117.00 (the overtime premium left out: 2/3 of $175.50) = $4.68; burden $25.3012… → $25.30, rounded half up once.",
    );
  });

  it("an amount that is not a whole number of cents shows four places of dollars, … when there are more", () => {
    // $1.00 × 2/3 = $0.6666… of workers' comp base: × 4% = $0.0266…; taxes $0.1175.
    expect(lineBurden({ type: "OT", amountCents: 100 }, CA).explain).toBe(
      "Employer taxes (CA) 11.75% of $1.00 = $0.1175; workers' comp (CA 8292) $4.00 per $100 of $0.6666… (the overtime premium left out: 2/3 of $1.00) = $0.0266…; burden $0.1441… → $0.14, rounded half up once.",
    );
  });

  it("double time leaves out half; with the premium counted, workers' comp is on all of it", () => {
    // $100.00: taxes $11.75; WC on $50.00 = $2.00 → $13.75; counted in full: $4.00 → $15.75.
    expect(lineBurden({ type: "DT", amountCents: 10_000 }, CA).cents).toBe(1375);
    expect(lineBurden({ type: "DT", amountCents: 10_000 }, { ...CA, excludeOtPremium: false }).cents).toBe(1575);
  });

  it("a negative correction line has a negative burden, rounded half away from zero", () => {
    // -$0.10 × 11.75% = -$0.01175; WC -$0.004 → -$0.01575 → -$0.02.
    expect(lineBurden({ type: "REG", amountCents: -10 }, CA).cents).toBe(-2);
  });

  it("a missing rate counts as zero and the line is incomplete, saying which", () => {
    const b = lineBurden({ type: "REG", amountCents: 10_000 }, { ...CA, wcPpm: null });
    expect(b).toMatchObject({ cents: 1175, incomplete: true });
    expect(b.explain).toBe("Employer taxes (CA) 11.75% of $100.00 = $11.75; no workers' comp rate for CA 8292 (counted as $0.00); burden $11.75.");
    expect(lineBurden({ type: "REG", amountCents: 10_000 }, { ...CA, taxPpm: null, wcClass: null, wcPpm: null })).toMatchObject({
      cents: 0,
      incomplete: true,
      explain: "No employer tax rate for CA (counted as $0.00); no workers' comp class on the rate card (counted as $0.00); burden $0.00.",
    });
  });

  it("reads rates back as people write them", () => {
    expect(percentOf(117_500)).toBe("11.75%");
    expect(percentOf(76_500)).toBe("7.65%");
    expect(perHundred(40_000)).toBe("$4.00");
    expect(perHundred(16_500)).toBe("$1.65");
    expect(percentOf(100_000)).toBe("10.00%");
    expect(percentOf(106_700)).toBe("10.67%");
  });
});
