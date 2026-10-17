import { describe, expect, it } from "vitest";
import { holidayProblems } from "./holidays";
import { rateProblems, type RateInput, type RateTerms } from "./versions";

const rate: RateInput = { effectiveFrom: "2026-10-05", payRateCents: 1800, bill: { rateCents: 2600 }, otMultiplier: { num: 3, den: 2 }, dtMultiplier: { num: 2, den: 1 }, wcClassCode: null };
const night: NonNullable<RateTerms["differential"]> = { name: "Night", payCents: 150, billCents: 200, startMinute: 1320, endMinute: 360, days: [] };

describe("a rate card's differential and minimum day (drizzle/0062)", () => {
  it("accepts none, a windowed differential, a days-only one, and a minimum day of up to 12 hours", () => {
    expect(rateProblems(rate)).toEqual([]);
    expect(rateProblems({ ...rate, terms: { differential: night, contractMinimumMinutes: 240, billsContractMinimum: true } })).toEqual([]);
    expect(rateProblems({ ...rate, terms: { differential: { ...night, startMinute: null, endMinute: null, days: [0, 6] }, contractMinimumMinutes: null, billsContractMinimum: false } })).toEqual([]);
  });
  it("refuses a half-set window, an empty name, zero pay, a repeated or impossible day, and a minimum over 12 hours", () => {
    const bad = (differential: typeof night) => rateProblems({ ...rate, terms: { differential, contractMinimumMinutes: null, billsContractMinimum: false } });
    expect(bad({ ...night, endMinute: null })).toEqual(["differential"]);
    expect(bad({ ...night, name: " " })).toEqual(["differential"]);
    expect(bad({ ...night, payCents: 0 })).toEqual(["differential"]);
    expect(bad({ ...night, days: [1, 1] })).toEqual(["differential"]);
    expect(bad({ ...night, days: [7] })).toEqual(["differential"]);
    expect(bad({ ...night, startMinute: 600, endMinute: 600 })).toEqual(["differential"]);
    expect(rateProblems({ ...rate, terms: { differential: null, contractMinimumMinutes: 721, billsContractMinimum: false } })).toEqual(["contract_minimum"]);
  });
});

describe("a holiday policy", () => {
  const policy = { clientId: null, name: "Agency holidays", dates: ["2026-11-26"], workedMultiplier: { num: 3, den: 2 }, notWorkedMinutes: 480, billWorkedMultiplier: null, billNotWorked: false };
  it("accepts 1 to 3 times the rate and up to 12 hours off", () => {
    expect(holidayProblems(policy)).toEqual([]);
    expect(holidayProblems({ ...policy, workedMultiplier: { num: 1, den: 1 }, billWorkedMultiplier: { num: 2, den: 1 } })).toEqual([]);
  });
  it("refuses no dates, a repeated date, below 1× or above 3×, and more than 12 hours off", () => {
    expect(holidayProblems({ ...policy, dates: [] })).toEqual(["dates"]);
    expect(holidayProblems({ ...policy, dates: ["2026-11-26", "2026-11-26"] })).toEqual(["dates"]);
    expect(holidayProblems({ ...policy, workedMultiplier: { num: 1, den: 2 } })).toEqual(["worked_multiplier"]);
    expect(holidayProblems({ ...policy, workedMultiplier: { num: 7, den: 2 } })).toEqual(["worked_multiplier"]);
    expect(holidayProblems({ ...policy, notWorkedMinutes: 721 })).toEqual(["not_worked"]);
  });
});
