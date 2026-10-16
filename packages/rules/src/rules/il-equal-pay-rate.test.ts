import { describe, expect, it } from "vitest";
import type { Shift } from "../types";
import { applyEqualPayRates, duplicateEqualPayRates, equalPayRateProblem, latestRequest, rateInForce, type EqualPayRate } from "./il-equal-pay-rate";

const shift = (date: string, over: Partial<Shift> = {}): Shift => ({
  entryIds: [`e-${date}`],
  workerId: "w",
  workerName: "W",
  assignmentId: "a",
  clientId: "c",
  jurisdiction: "IL",
  countyFips: "17197",
  placeFips: "1738570",
  date,
  startMinute: 420,
  minutes: 480,
  payRateCents: 1700,
  billRateCents: 2400,
  billOtMultiplier: { num: 3, den: 2 },
  billDtMultiplier: { num: 2, den: 1 },
  otBillingRule: "multiplier",
  ...over,
});
const rate = (over: Partial<EqualPayRate>): EqualPayRate => ({ workerId: "w", clientId: "c", effectiveFrom: "2026-10-19", kind: "rate", rateCents: 1850, benefitsCents: 0, method: "comparator", ...over });
const asked = (effectiveFrom: string): EqualPayRate => ({ workerId: "w", clientId: "c", effectiveFrom, kind: "asked", rateCents: null, benefitsCents: null, method: null });
const all = () => true;

describe("the Illinois equal-pay rate (820 ILCS 175/42)", () => {
  it("from the row's date the pay rate is at least the comparator's rate plus the benefits' cash value, saying why", () => {
    // $18.50 + $1.25 = $19.75, above the card's $17.00.
    const out = applyEqualPayRates([shift("2026-10-16"), shift("2026-10-19")], [rate({ benefitsCents: 125 })], all);
    expect(out.map((s) => [s.date, s.payRateCents])).toEqual([
      ["2026-10-16", 1700],
      ["2026-10-19", 1975],
    ]);
    expect(out[0]!.payRateExplain).toBeUndefined();
    expect(out[1]!.payRateExplain).toBe("Illinois equal pay from 2026-10-19 (820 ILCS 175/42(a), (b)): the comparable direct hire's rate $18.50 + the benefits' hourly cash value $1.25 = $19.75, above the rate card's $17.00.");
  });

  it("never lowers pay; another worker or client is untouched; a request alone changes nothing; work the caller says is not covered is untouched", () => {
    expect(applyEqualPayRates([shift("2026-10-19", { payRateCents: 2000 })], [rate({})], all)[0]!.payRateCents).toBe(2000);
    expect(applyEqualPayRates([shift("2026-10-19", { clientId: "d" }), shift("2026-10-19", { workerId: "v" })], [rate({})], all).map((s) => s.payRateCents)).toEqual([1700, 1700]);
    expect(applyEqualPayRates([shift("2026-10-19")], [asked("2026-10-16")], all)[0]!.payRateCents).toBe(1700);
    expect(applyEqualPayRates([shift("2026-10-19", { jurisdiction: "IN" })], [rate({})], (s) => s.jurisdiction === "IL")[0]!.payRateCents).toBe(1700);
  });

  it("a later request never undoes a rate: the rate in force is the latest rate row; requests are kept apart", () => {
    const rows = [rate({}), asked("2026-10-26"), rate({ effectiveFrom: "2026-11-02", rateCents: 1900, method: "survey_75th" })];
    expect(rateInForce(rows, "w", "c", "2026-10-25")?.rateCents).toBe(1850);
    expect(rateInForce(rows, "w", "c", "2026-10-27")?.rateCents).toBe(1850);
    expect(rateInForce(rows, "w", "c", "2026-10-18")).toBeNull();
    expect(latestRequest(rows, "w", "c")?.effectiveFrom).toBe("2026-10-26");
    // Paid $18.50 on 2026-10-27, after the request.
    expect(applyEqualPayRates([shift("2026-10-27")], rows, all)[0]!.payRateCents).toBe(1850);
    const [nov] = applyEqualPayRates([shift("2026-11-02")], rows, all);
    expect([nov!.payRateCents, nov!.payRateExplain]).toEqual([1900, "Illinois equal pay from 2026-11-02 (820 ILCS 175/42(a)): the area's 75th-percentile wage for the job (BLS OEWS) $19.00, above the rate card's $17.00."]);
  });

  it("rows are checked: a real date, a positive rate and its method, at most $100,000 together; a request has no figures; two rows for one date are found", () => {
    expect(equalPayRateProblem(rate({}))).toBeNull();
    expect(equalPayRateProblem(rate({ effectiveFrom: "2026-02-30" }))).toContain("date");
    expect(equalPayRateProblem(rate({ rateCents: 0 }))).toContain("rate");
    expect(equalPayRateProblem(rate({ benefitsCents: -1 }))).toContain("benefits");
    expect(equalPayRateProblem(rate({ rateCents: 9_999_999, benefitsCents: 2 }))).toContain("$100,000");
    expect(equalPayRateProblem(rate({ method: null }))).toContain("method");
    expect(equalPayRateProblem(asked("2026-10-16"))).toBeNull();
    expect(equalPayRateProblem({ ...asked("2026-10-16"), rateCents: 1 })).toContain("request");
    expect(duplicateEqualPayRates([rate({}), rate({ rateCents: 1900 }), rate({ effectiveFrom: "2026-11-02" })]).map((r) => r.rateCents)).toEqual([1850, 1900]);
  });
});
