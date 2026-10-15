import { computePay, type Shift } from "@shiftbook/rules";
import { describe, expect, it } from "vitest";
import { REFERENCE_GUARANTEE_RULES, REFERENCE_JURISDICTION_RULES, REFERENCE_MINIMUM_WAGE_RULES, REFERENCE_OVERTIME_RULES, REFERENCE_PREMIUM_RULES } from "./reference-data";

const shift = (site: Pick<Shift, "jurisdiction" | "countyFips" | "placeFips">, minutes = 480): Shift => ({
  entryIds: ["e1"],
  workerId: "w1",
  workerName: "Test Worker",
  assignmentId: "a1",
  clientId: "c1",
  ...site,
  date: "2026-10-12",
  startMinute: 420,
  minutes,
  payRateCents: 1800,
  billRateCents: 2600,
  billOtMultiplier: { num: 3, den: 2 },
  billDtMultiplier: { num: 2, den: 1 },
  otBillingRule: "multiplier",
});
const pay = (s: Shift) =>
  computePay({
    workweekStartsOn: 1,
    shifts: [s],
    overtimeRules: REFERENCE_OVERTIME_RULES,
    jurisdictionRules: REFERENCE_JURISDICTION_RULES,
    minimumWageRules: REFERENCE_MINIMUM_WAGE_RULES,
    premiumRules: REFERENCE_PREMIUM_RULES,
    guaranteeRules: REFERENCE_GUARANTEE_RULES,
  });

describe("the reference wage rules", () => {
  it("hold a week at a California city with its own minimum wage, rather than paying the state rate", () => {
    const sf = pay(shift({ jurisdiction: "CA", countyFips: "06075", placeFips: "0667000" }));
    expect(sf.payLines).toEqual([]);
    expect(sf.blockers.map((b) => [b.code, b.ruleCode])).toEqual([["rule_not_supported_yet", "local_minimum_wage"]]);
    // Unincorporated Los Angeles County cannot be told from its cities by code: the whole county is held (Long Beach here).
    expect(pay(shift({ jurisdiction: "CA", countyFips: "06037", placeFips: "0643000" })).blockers.map((b) => b.code)).toEqual(["rule_not_supported_yet"]);
  });

  it("pay a California city with no ordinance of its own (Ontario), with daily overtime", () => {
    const ontario = pay(shift({ jurisdiction: "CA", countyFips: "06071", placeFips: "0653896" }, 600));
    expect(ontario.blockers).toEqual([]);
    expect(ontario.payLines.map((l) => [l.type, l.ruleId, l.minutes])).toEqual([
      ["REG", "straight_time", 480],
      ["OT", "ca_daily_overtime", 120],
    ]);
  });

  it("pay Chicago and Cook County at their own minimum wages", () => {
    const low = (site: Pick<Shift, "jurisdiction" | "countyFips" | "placeFips">) => pay({ ...shift(site), payRateCents: 1500 }).payLines.find((l) => l.type === "MW_TRUEUP")?.rate;
    expect(low({ jurisdiction: "IL", countyFips: "17031", placeFips: "1714000" })).toEqual({ num: 205, den: 1 });
    expect(low({ jurisdiction: "IL", countyFips: "17031", placeFips: "1724582" })).toEqual({ num: 40, den: 1 });
  });
});
