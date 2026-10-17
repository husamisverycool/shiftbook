import { describe, expect, it } from "vitest";
import { contractTermsOf, differentialFor, type RateCardTerms } from "./rate-terms";

const none: RateCardTerms = { diffName: null, diffPayCents: null, diffBillCents: null, diffStartMinute: null, diffEndMinute: null, diffDays: [], contractMinimumMinutes: null, billsContractMinimum: false };
const night: RateCardTerms = { ...none, diffName: "Night", diffPayCents: 150, diffBillCents: 200, diffStartMinute: 22 * 60, diffEndMinute: 6 * 60 };
const weekend: RateCardTerms = { ...none, diffName: "Weekend", diffPayCents: 100, diffBillCents: 0, diffDays: [0, 6] };

describe("a rate card's differential on a shift", () => {
  it("none on the card: none on the shift", () => {
    expect(differentialFor(none, "2026-10-05", 420)).toBeUndefined();
  });
  it("a window past midnight: 22:00 and 02:00 starts get it, 21:59 and 06:00 do not", () => {
    expect(differentialFor(night, "2026-10-05", 22 * 60)).toEqual({ name: "Night", payCentsPerHour: 150, billCentsPerHour: 200 });
    expect(differentialFor(night, "2026-10-05", 2 * 60)).toBeDefined();
    expect(differentialFor(night, "2026-10-05", 22 * 60 - 1)).toBeUndefined();
    expect(differentialFor(night, "2026-10-05", 6 * 60)).toBeUndefined();
  });
  it("a windowed differential needs the shift's start time", () => {
    expect(differentialFor(night, "2026-10-05", null)).toBeUndefined();
  });
  it("weekend days: Saturday and Sunday only (2026-10-10 is a Saturday, 10-05 a Monday)", () => {
    expect(differentialFor(weekend, "2026-10-10", null)).toEqual({ name: "Weekend", payCentsPerHour: 100, billCentsPerHour: 0 });
    expect(differentialFor(weekend, "2026-10-11", 420)).toBeDefined();
    expect(differentialFor(weekend, "2026-10-05", 420)).toBeUndefined();
  });
  it("a contractual minimum day goes on every shift of the card", () => {
    expect(contractTermsOf(none)).toEqual({});
    expect(contractTermsOf({ ...none, contractMinimumMinutes: 240, billsContractMinimum: true })).toEqual({ contractMinimumMinutes: 240, billsContractMinimum: true });
  });
});
