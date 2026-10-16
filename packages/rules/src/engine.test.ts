import { describe, expect, it } from "vitest";
import { computePay } from "./engine";
import { NO_PLACE } from "./places";
import type { Confirmation, GuaranteeRule, HolidayPolicy, JurisdictionRule, MinimumWageRule, OvertimeRule, PayInput, PremiumRule, Shift } from "./types";

// Census FIPS codes: county = state (2) + county (3); place = state (2) + place (5).
const COOK = "17031";
const WILL = "17197";
const DUPAGE = "17043";
const CHICAGO = "1714000";
const JOLIET = "1738570";
const EVANSTON = "1724582";

const OT_RULES: OvertimeRule[] = [
  { jurisdiction: "US", ruleCode: "weekly_overtime", kind: "weekly", thresholdMinutes: 2400, multiplier: { num: 3, den: 2 }, earningType: "OT", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "29 U.S.C. § 207(a)(1)" },
  { jurisdiction: "IL", ruleCode: "weekly_overtime", kind: "weekly", thresholdMinutes: 2400, multiplier: { num: 3, den: 2 }, earningType: "OT", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "820 ILCS 105/4a" },
  { jurisdiction: "MA", ruleCode: "weekly_overtime", kind: "weekly", thresholdMinutes: 2400, multiplier: { num: 3, den: 2 }, earningType: "OT", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "M.G.L. c. 151, § 1A" },
  { jurisdiction: "CA", ruleCode: "ca_daily_overtime", kind: "daily", thresholdMinutes: 480, multiplier: { num: 3, den: 2 }, earningType: "OT", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "Cal. Lab. Code § 510(a)" },
];
const JURISDICTIONS: JurisdictionRule[] = [
  { jurisdiction: "US", ruleCode: "weekly_overtime", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "29 U.S.C. § 207(a)(1)" },
  { jurisdiction: "IL", ruleCode: "weekly_overtime", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "820 ILCS 105/4a" },
  { jurisdiction: "MA", ruleCode: "weekly_overtime", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "M.G.L. c. 151, § 1A" },
  { jurisdiction: "CA", ruleCode: "weekly_overtime", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "Cal. Lab. Code § 510(a)" },
  { jurisdiction: "CA", ruleCode: "ca_daily_overtime", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "Cal. Lab. Code § 510(a)" },
  { jurisdiction: "US", ruleCode: "minimum_wage", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "29 U.S.C. § 206(a)(1)" },
  { jurisdiction: "IL", ruleCode: "minimum_wage", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "820 ILCS 105/4" },
  { jurisdiction: "MA", ruleCode: "minimum_wage", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "M.G.L. c. 151, § 1" },
  { jurisdiction: "IL", countyFips: COOK, scopeName: "Cook County", ruleCode: "local_minimum_wage", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "Cook County Code ch. 42, art. I" },
  { jurisdiction: "IL", placeFips: CHICAGO, scopeName: "City of Chicago", ruleCode: "local_minimum_wage", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "Chicago Municipal Code ch. 6-105" },
];
const MIN_WAGE: MinimumWageRule[] = [
  { jurisdiction: "US", rateCents: 725, effectiveFrom: "2009-07-24", effectiveTo: null, citation: "29 U.S.C. § 206(a)(1)(C)" },
  { jurisdiction: "IL", rateCents: 1500, effectiveFrom: "2025-01-01", effectiveTo: null, citation: "820 ILCS 105/4(a)(1)" },
  { jurisdiction: "MA", rateCents: 1500, effectiveFrom: "2023-01-01", effectiveTo: null, citation: "M.G.L. c. 151, § 1" },
  { jurisdiction: "CA", rateCents: 1690, effectiveFrom: "2026-01-01", effectiveTo: null, citation: "Cal. Lab. Code § 1182.12" },
];

let seq = 0;
function shift(date: string, minutes: number, over: Partial<Shift> = {}): Shift {
  seq += 1;
  return {
    entryIds: [`e${String(seq).padStart(3, "0")}`],
    workerId: "w1",
    workerName: "Test Worker",
    assignmentId: "a1",
    clientId: "c1",
    jurisdiction: "IL",
    countyFips: WILL,
    placeFips: JOLIET,
    date,
    startMinute: 420,
    minutes,
    payRateCents: 1825,
    billRateCents: 2650,
    billOtMultiplier: { num: 3, den: 2 },
    billDtMultiplier: { num: 2, den: 1 },
    otBillingRule: "multiplier",
    ...over,
  };
}
const input = (shifts: Shift[], extra: Partial<PayInput> = {}): PayInput => ({
  workweekStartsOn: 1, // Monday
  shifts,
  overtimeRules: OT_RULES,
  jurisdictionRules: JURISDICTIONS,
  minimumWageRules: MIN_WAGE,
  ...extra,
});
// Week of Monday 2026-10-05.
const WEEK = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];

describe("computePay — straight time and federal/state weekly overtime", () => {
  it("pays 38 hours as straight time only", () => {
    const r = computePay(input(WEEK.slice(0, 5).map((d, i) => shift(d, i < 4 ? 480 : 360))));
    expect(r.blockers).toEqual([]);
    expect(r.payLines).toHaveLength(1);
    expect(r.payLines[0]).toMatchObject({ type: "REG", minutes: 2280, amountCents: 69_350, ruleId: "straight_time" });
    expect(r.payLines[0]!.explain).toContain("38h 00m (2280 min) × $18.25/h = 69350¢ exactly → $693.50");
  });

  it("pays hours over 40 in the workweek at 1.5x", () => {
    const r = computePay(input(WEEK.slice(0, 5).map((d, i) => shift(d, i < 4 ? 540 : 480)))); // 44h
    expect(r.blockers).toEqual([]);
    expect(r.payLines.map((l) => [l.type, l.minutes, l.amountCents])).toEqual([
      ["REG", 2400, 73_000],
      ["OT", 240, 10_950],
    ]);
    const ot = r.payLines[1]!;
    expect(ot.ruleId).toBe("weekly_overtime");
    expect(ot.explain).toContain("4h 00m (240 min) × $27.375/h (1.5 × $18.25) = 10950¢ exactly → $109.50");
    expect(ot.explain).toContain("44h 00m");
    expect(ot.explain).toContain("29 U.S.C. § 207(a)(1)");
    expect(ot.explain).toContain("820 ILCS 105/4a");
  });

  it("has no overtime at exactly 40 hours", () => {
    const r = computePay(input(WEEK.slice(0, 5).map((d) => shift(d, 480))));
    expect(r.payLines.map((l) => [l.type, l.minutes])).toEqual([["REG", 2400]]);
  });

  it("rounds once per line, half-up, and shows the exact value in the explanation", () => {
    const r = computePay(input([...WEEK.slice(0, 5).map((d) => shift(d, 480)), shift(WEEK[5]!, 37)]));
    const ot = r.payLines.find((l) => l.type === "OT")!;
    expect(ot.minutes).toBe(37);
    expect(ot.amountCents).toBe(1688);
    expect(ot.explain).toContain("= 1688.125¢ → rounded half-up once → $16.88");
  });

  it("bills regular and overtime hours using the rate card", () => {
    const r = computePay(input(WEEK.slice(0, 5).map((d, i) => shift(d, i < 4 ? 540 : 480))));
    expect(r.billLines.map((l) => [l.type, l.minutes, l.amountCents, l.ruleId])).toEqual([
      ["REG", 2400, 106_000, "bill_regular"],
      ["OT", 240, 15_900, "bill_overtime_multiplier"],
    ]);
  });

  it("bills overtime at straight time when the client profile says so", () => {
    const r = computePay(input(WEEK.slice(0, 5).map((d, i) => shift(d, i < 4 ? 540 : 480, { otBillingRule: "straight_time" }))));
    const ot = r.billLines.find((l) => l.type === "OT")!;
    expect([ot.amountCents, ot.ruleId]).toEqual([10_600, "bill_overtime_straight"]);
  });

  it("does not bill overtime when the client profile marks it not billable, but keeps the minutes", () => {
    const r = computePay(input(WEEK.slice(0, 5).map((d, i) => shift(d, i < 4 ? 540 : 480, { otBillingRule: "not_billable" }))));
    const ot = r.billLines.find((l) => l.type === "OT")!;
    expect([ot.minutes, ot.amountCents, ot.ruleId]).toEqual([240, 0, "bill_overtime_not_billable"]);
  });

  it("keeps pay-line and bill-line minutes equal for every type", () => {
    const r = computePay(input(WEEK.slice(0, 6).map((d) => shift(d, 500))));
    const sum = (lines: typeof r.payLines, t: string) => lines.filter((l) => l.type === t).reduce((s, l) => s + l.minutes, 0);
    for (const t of ["REG", "OT"]) expect(sum(r.billLines, t)).toBe(sum(r.payLines, t));
  });
});

describe("computePay — workweeks and allocation", () => {
  it("computes each workweek separately (Monday start)", () => {
    const shifts = [...WEEK.map((d) => shift(d, 360)), shift("2026-10-12", 480)]; // 42h then 8h next week
    const r = computePay(input(shifts));
    expect(r.payLines.map((l) => [l.workweekStart, l.type, l.minutes])).toEqual([
      ["2026-10-05", "REG", 2400],
      ["2026-10-05", "OT", 120],
      ["2026-10-12", "REG", 480],
    ]);
  });

  it("puts overtime on the shifts that crossed 40 hours, and bills that client", () => {
    const shifts = [
      ...WEEK.slice(0, 4).map((d) => shift(d, 480, { assignmentId: "aA", clientId: "cA" })), // 32h client A
      shift(WEEK[4]!, 600, { assignmentId: "aB", clientId: "cB", billRateCents: 3000 }), // 10h client B
    ];
    const r = computePay(input(shifts));
    expect(r.payLines.map((l) => [l.assignmentId, l.type, l.minutes])).toEqual([
      ["aA", "REG", 1920],
      ["aB", "REG", 480],
      ["aB", "OT", 120],
    ]);
    expect(r.billLines.filter((l) => l.type === "OT").map((l) => [l.clientId, l.minutes, l.amountCents])).toEqual([
      ["cB", 120, 9000],
    ]);
  });

  it("gives the same result whatever order the shifts arrive in", () => {
    const shifts = WEEK.slice(0, 6).map((d, i) => shift(d, 450 + i * 7));
    const a = computePay(input(shifts));
    const b = computePay(input([...shifts].reverse()));
    expect(b).toEqual(a);
  });
});

describe("computePay — blocking (never guess)", () => {
  it("blocks an unknown jurisdiction", () => {
    const r = computePay(input([shift(WEEK[0]!, 480, { jurisdiction: "TX", countyFips: "48201", placeFips: "4835000" })]));
    expect(r.payLines).toEqual([]);
    expect(r.blockers).toEqual([expect.objectContaining({ code: "unknown_jurisdiction", jurisdiction: "TX" })]);
  });

  it("pays different rates as separate straight-time lines when there is no overtime", () => {
    const shifts = [shift(WEEK[0]!, 480, { assignmentId: "aA" }), shift(WEEK[1]!, 480, { assignmentId: "aB", payRateCents: 2000 })];
    const r = computePay(input(shifts));
    expect(r.blockers).toEqual([]);
    expect(r.payLines.map((l) => [l.assignmentId, l.amountCents])).toEqual([
      ["aA", 14_600],
      ["aB", 16_000],
    ]);
  });

  it("rejects non-integer or negative minutes and non-positive rates", () => {
    expect(computePay(input([shift(WEEK[0]!, 480.5)])).blockers[0]!.code).toBe("invalid_input");
    expect(computePay(input([shift(WEEK[0]!, -5)])).blockers[0]!.code).toBe("invalid_input");
    expect(computePay(input([shift(WEEK[0]!, 480, { payRateCents: 0 })])).blockers[0]!.code).toBe("invalid_input");
  });
});

describe("computePay — second-opinion review fixes", () => {
  it("prices a mid-week pay-rate change on the same assignment at each day's rate", () => {
    const r = computePay(input([shift(WEEK[0]!, 480, { payRateCents: 2000 }), shift(WEEK[1]!, 480, { payRateCents: 2200 })]));
    expect(r.blockers).toEqual([]);
    expect(r.payLines.map((l) => [l.type, l.minutes, l.amountCents])).toEqual([
      ["REG", 480, 16_000],
      ["REG", 480, 17_600],
    ]);
  });

  it("bills overtime at the bill rate in effect on the day it was worked", () => {
    const shifts = [...WEEK.slice(0, 4).map((d) => shift(d, 540)), shift(WEEK[4]!, 480, { billRateCents: 3000 })];
    const r = computePay(input(shifts));
    expect(r.billLines.reduce((s, l) => s + l.amountCents, 0)).toBe(125_400);
    expect(r.billLines.find((l) => l.type === "OT")!.amountCents).toBe(18_000);
  });

  it("blocks a shift that runs past midnight (it must be split at midnight first)", () => {
    const r = computePay(input([shift(WEEK[6]!, 480, { startMinute: 1320 })]));
    expect(r.payLines).toEqual([]);
    expect(r.blockers[0]).toMatchObject({ code: "invalid_input", workweekStart: "2026-10-05" });
  });

  it("allows a shift that ends exactly at midnight", () => {
    const r = computePay(input([shift(WEEK[4]!, 480, { startMinute: 960 })]));
    expect(r.blockers).toEqual([]);
  });

  it("blocks more than 24 hours on one day", () => {
    const r = computePay(input([shift(WEEK[0]!, 900, { startMinute: 0 }), shift(WEEK[0]!, 600, { startMinute: 0, assignmentId: "a2" })]));
    expect(r.blockers.map((b) => b.code)).toEqual(["invalid_input"]);
  });

  it("blocks the whole worker-week when one shift is invalid", () => {
    const shifts = [...WEEK.slice(0, 5).map((d) => shift(d, 480)), shift(WEEK[5]!, 480, { billRateCents: 0 })];
    const r = computePay(input(shifts));
    expect(r.payLines).toEqual([]);
    expect(r.blockers.map((b) => b.code)).toEqual(["invalid_input"]);
  });

  it("turns an impossible date into a blocker, not a crash", () => {
    const r = computePay(input([shift("2026-02-30", 480)]));
    expect(r.blockers.map((b) => b.code)).toEqual(["invalid_input"]);
  });

  it("rejects 'US' as a worksite jurisdiction (it must be a state)", () => {
    const r = computePay(input([shift(WEEK[0]!, 480, { jurisdiction: "US" })]));
    expect(r.blockers.map((b) => b.code)).toEqual(["invalid_input"]);
  });

  it("blocks when overtime applies but no overtime rule row is in effect", () => {
    const r = computePay(input(WEEK.slice(0, 5).map((d) => shift(d, 540)), { overtimeRules: [] }));
    expect(r.payLines).toEqual([]);
    expect(r.blockers.map((b) => b.code)).toEqual(["rule_data_missing"]);
  });

  it("tops up pay below the applicable minimum wage (the highest of federal, state and local), and warns", () => {
    const r = computePay(input([shift(WEEK[0]!, 480, { payRateCents: 1450 })]));
    expect(r.blockers).toEqual([]);
    expect(r.payLines.map((l) => [l.type, l.minutes, l.rate, l.amountCents])).toEqual([
      ["REG", 480, { num: 1450, den: 1 }, 11_600],
      ["MW_TRUEUP", 480, { num: 50, den: 1 }, 400],
    ]);
    expect(r.payLines[1]!.explain).toContain("Minimum-wage top-up: 8h 00m (480 min) × $0.50/h ($15.00 minimum wage − $14.50 pay rate) = 400¢ exactly → $4.00.");
    expect(r.payLines[1]!.ruleId).toBe("minimum_wage");
    // The client is billed at the bill rate only; the top-up is the agency's.
    expect(r.billLines.map((l) => [l.type, l.amountCents])).toEqual([["REG", 21_200]]);
    expect(r.warnings[0]).toMatchObject({ code: "below_minimum_wage", jurisdiction: "IL" });
    expect(r.warnings[0]!.message).toContain("$15.00/h");
  });

  it("pays overtime on a regular rate raised to the minimum wage, never on the low rate card", () => {
    // $14.50 all week, 45 hours, minimum $15.00: 45 h × $15.00 + ½ × $15.00 × 5 h = $712.50.
    const r = computePay(input(WEEK.slice(0, 5).map((d) => shift(d, 540, { payRateCents: 1450 }))));
    expect(r.blockers).toEqual([]);
    expect(r.payLines.map((l) => [l.type, l.minutes, l.amountCents])).toEqual([
      ["REG", 2400, 58_000],
      ["OT", 300, 11_000],
      ["MW_TRUEUP", 2700, 2250],
    ]);
    expect(r.payLines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(71_250);
    const ot = r.payLines.find((l) => l.type === "OT")!;
    expect(ot.explain).not.toContain("1.5 × $14.50");
    expect(ot.explain).toContain("$14.50 + 0.5 × regular rate $15.00/h");
  });

  it("blocks worksites covered by a local ordinance the engine does not implement yet", () => {
    const r = computePay(input([shift(WEEK[0]!, 480, { countyFips: COOK, placeFips: CHICAGO })]));
    expect(r.payLines).toEqual([]);
    expect(r.blockers.map((b) => [b.code, b.ruleCode])).toEqual([
      ["rule_not_supported_yet", "local_minimum_wage"],
      ["rule_not_supported_yet", "local_minimum_wage"],
    ]);
  });

  it("warns when overtime allocation depended on an assumed order of same-day shifts", () => {
    const shifts = [
      ...WEEK.slice(0, 4).map((d) => shift(d, 540)), // 36h
      shift(WEEK[4]!, 300, { assignmentId: "aB", clientId: "cB" }),
      shift(WEEK[4]!, 300, { assignmentId: "aC", clientId: "cC", startMinute: null }),
    ];
    const r = computePay(input(shifts));
    expect(r.warnings.map((w) => w.code)).toEqual(["allocation_order_assumed"]);
  });

  it("explains on an overtime bill line when other assignments' hours filled the first 40", () => {
    const shifts = [
      ...WEEK.slice(0, 4).map((d) => shift(d, 480, { assignmentId: "aA", clientId: "cA" })),
      shift(WEEK[4]!, 600, { assignmentId: "aB", clientId: "cB" }),
    ];
    const ot = computePay(input(shifts)).billLines.find((l) => l.type === "OT")!;
    expect(ot.explain).toContain("32h 00m of the first 40h 00m were worked on other assignments");
  });
});

describe("computePay — third review fixes", () => {
  it("blocks a worksite with no county code (local ordinances cannot be checked)", () => {
    const r = computePay(input([shift(WEEK[0]!, 480, { countyFips: " " })]));
    expect(r.blockers.map((b) => b.code)).toEqual(["invalid_input"]);
  });

  it("holds every week of a worker who has a shift with an impossible date", () => {
    const r = computePay(input([...WEEK.slice(0, 5).map((d) => shift(d, 480)), shift("2026-10-32", 480)]));
    expect(r.payLines).toEqual([]);
    expect(r.blockers.map((b) => b.code)).toEqual(["invalid_input"]);
  });

  it("applies a jurisdiction rule that takes effect in the middle of the week", () => {
    const local = { jurisdiction: "IL", countyFips: WILL, scopeName: "Will County", ruleCode: "local_minimum_wage", effectiveFrom: "2026-10-07", effectiveTo: null, citation: "hypothetical Will County ordinance" };
    const r = computePay(input(WEEK.slice(0, 5).map((d) => shift(d, 480)), { jurisdictionRules: [...JURISDICTIONS, local] }));
    expect(r.payLines).toEqual([]);
    expect(r.blockers.some((b) => b.ruleCode === "local_minimum_wage")).toBe(true);
  });

  it("never runs without the federal overtime and minimum-wage rules", () => {
    const noFederal = JURISDICTIONS.filter((j) => j.jurisdiction !== "US");
    const r = computePay(input(WEEK.slice(0, 5).map((d) => shift(d, 540)), { jurisdictionRules: noFederal }));
    expect(r.payLines).toEqual([]);
    expect(r.blockers.map((b) => b.code)).toContain("rule_data_missing");
  });

  it("blocks when a state lists weekly overtime but has no overtime row of its own", () => {
    const r = computePay(input(WEEK.slice(0, 5).map((d) => shift(d, 540)), { overtimeRules: OT_RULES.filter((o) => o.jurisdiction !== "IL") }));
    expect(r.payLines).toEqual([]);
    expect(r.blockers.map((b) => [b.code, b.jurisdiction])).toEqual([["rule_data_missing", "IL"]]);
  });

  it("warns about assumed order between same-assignment shifts at different bill rates", () => {
    const shifts = [
      ...WEEK.slice(0, 4).map((d) => shift(d, 540)),
      shift(WEEK[4]!, 300, { startMinute: null }),
      shift(WEEK[4]!, 300, { startMinute: null, billRateCents: 3000 }),
    ];
    expect(computePay(input(shifts)).warnings.map((w) => w.code)).toEqual(["allocation_order_assumed"]);
  });

  it("blocks overlapping shifts and entries counted twice", () => {
    const overlap = computePay(input([shift(WEEK[0]!, 480, { startMinute: 480 }), shift(WEEK[0]!, 480, { startMinute: 600, assignmentId: "a2" })]));
    expect(overlap.blockers.map((b) => b.code)).toEqual(["invalid_input"]);
    const twice = shift(WEEK[0]!, 480);
    const dup = computePay(input([twice, { ...twice, date: WEEK[1]! }]));
    expect(dup.blockers.map((b) => b.code)).toEqual(["invalid_input"]);
  });

  it("rejects an invalid workweek start day", () => {
    const r = computePay(input([shift(WEEK[0]!, 480)], { workweekStartsOn: 7 as never }));
    expect(r.payLines).toEqual([]);
    expect(r.blockers.map((b) => b.code)).toEqual(["invalid_input"]);
  });
});

describe("computePay — effective dating", () => {
  it("uses the rule row in effect for that workweek", () => {
    const usRow = OT_RULES[0]!;
    const rules: OvertimeRule[] = [
      { ...usRow, effectiveTo: "2026-12-31" },
      { ...usRow, thresholdMinutes: 2100, effectiveFrom: "2027-01-01", citation: "hypothetical future rule" },
      ...OT_RULES.filter((r) => r.jurisdiction !== "US"),
    ];
    const r2026 = computePay(input(WEEK.slice(0, 5).map((d) => shift(d, 480)), { overtimeRules: rules }));
    expect(r2026.payLines.map((l) => l.type)).toEqual(["REG"]);
    const jan = ["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07", "2027-01-08"];
    const r2027 = computePay(input(jan.map((d) => shift(d, 480)), { overtimeRules: rules }));
    expect(r2027.payLines.map((l) => [l.type, l.minutes])).toEqual([
      ["REG", 2100],
      ["OT", 300],
    ]);
  });
});

describe("computePay — fourth review fixes", () => {
  /** Deterministic shuffle (mulberry32) so order-independence tests are repeatable. */
  function shuffled<T>(items: T[], seed: number): T[] {
    let a = seed;
    const rand = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }
  const codes = (r: ReturnType<typeof computePay>) => r.blockers.map((b) => [b.code, b.ruleCode ?? null]);

  it("matches local ordinances by official county and place code, never by spelling", () => {
    // Evanston is in Cook County: the county ordinance applies.
    expect(codes(computePay(input([shift(WEEK[0]!, 480, { countyFips: COOK, placeFips: EVANSTON })])))).toEqual([["rule_not_supported_yet", "local_minimum_wage"]]);
    // The part of Chicago in DuPage County: the city ordinance applies.
    expect(codes(computePay(input([shift(WEEK[0]!, 480, { countyFips: DUPAGE, placeFips: CHICAGO })])))).toEqual([["rule_not_supported_yet", "local_minimum_wage"]]);
    // Unincorporated Will County, confirmed outside any city: nothing local applies.
    expect(computePay(input([shift(WEEK[0]!, 480, { placeFips: NO_PLACE })])).blockers).toEqual([]);
  });

  it("refuses a worksite whose codes are not well-formed codes inside its state", () => {
    for (const over of [{ countyFips: "Cook" }, { countyFips: "06071" }, { placeFips: "17140" }, { placeFips: "0614000" }, { jurisdiction: "XX" }] as Partial<Shift>[]) {
      const r = computePay(input([shift(WEEK[0]!, 480, over)]));
      expect(r.payLines).toEqual([]);
      expect(r.blockers.map((b) => b.code)).toEqual(["invalid_input"]);
    }
  });

  it("holds every worker who shares a time entry id, whatever the input order", () => {
    const a = shift(WEEK[0]!, 480, { workerId: "w1", workerName: "One", entryIds: ["shared"] });
    const b = shift(WEEK[0]!, 480, { workerId: "w2", workerName: "Two", entryIds: ["shared"] });
    const forward = computePay(input([a, b]));
    const reversed = computePay(input([b, a]));
    expect(forward.payLines).toEqual([]);
    expect(forward.blockers.map((x) => [x.code, x.workerId])).toEqual([
      ["invalid_input", "w1"],
      ["invalid_input", "w2"],
    ]);
    expect(reversed).toEqual(forward);
  });

  it("refuses a shift with no time entry id, or an empty one", () => {
    for (const entryIds of [[], [""]]) {
      const r = computePay(input([shift(WEEK[0]!, 480, { entryIds })]));
      expect(r.blockers.map((b) => b.code)).toEqual(["invalid_input"]);
    }
  });

  it("never pays without the federal minimum-wage rate row", () => {
    const minimumWageRules = [...MIN_WAGE.filter((m) => m.jurisdiction !== "US" && m.jurisdiction !== "IL"), { ...MIN_WAGE[1]!, rateCents: 515 }];
    const r = computePay(input([shift(WEEK[0]!, 480, { payRateCents: 600 })], { minimumWageRules }));
    expect(r.payLines).toEqual([]);
    expect(codes(r)).toEqual([["rule_data_missing", "minimum_wage"]]);
  });

  it("never computes overtime without the federal overtime row", () => {
    const overtimeRules = [...OT_RULES.filter((o) => o.jurisdiction !== "US" && o.jurisdiction !== "IL"), { ...OT_RULES[1]!, thresholdMinutes: 2880 }];
    const r = computePay(input(WEEK.slice(0, 5).map((d) => shift(d, 528)), { overtimeRules })); // 44h
    expect(r.payLines).toEqual([]);
    expect(codes(r)).toEqual([["rule_data_missing", "weekly_overtime"]]);
  });

  it("blocks a federal rule this version does not implement", () => {
    const extra: JurisdictionRule = { jurisdiction: "US", ruleCode: "federal_contractor_min_wage", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "Exec. Order (hypothetical)" };
    const r = computePay(input([shift(WEEK[0]!, 480)], { jurisdictionRules: [...JURISDICTIONS, extra] }));
    expect(codes(r)).toEqual([["rule_not_supported_yet", "federal_contractor_min_wage"]]);
  });

  it("needs a local minimum-wage rate for a local minimum-wage rule, and then applies it", () => {
    const willRule: JurisdictionRule = { jurisdiction: "IL", countyFips: WILL, scopeName: "Will County", ruleCode: "minimum_wage", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "hypothetical Will County ordinance" };
    const jurisdictionRules = [...JURISDICTIONS, willRule];
    const missing = computePay(input([shift(WEEK[0]!, 480)], { jurisdictionRules }));
    expect(codes(missing)).toEqual([["rule_data_missing", "minimum_wage"]]);

    const willRate: MinimumWageRule = { jurisdiction: "IL", countyFips: WILL, scopeName: "Will County", rateCents: 1900, effectiveFrom: "2026-01-01", effectiveTo: null, citation: "hypothetical Will County ordinance — $19.00" };
    const below = computePay(input([shift(WEEK[0]!, 480)], { jurisdictionRules, minimumWageRules: [...MIN_WAGE, willRate] }));
    expect(codes(below)).toEqual([]);
    expect(below.warnings.map((w) => [w.code, w.ruleCode])).toEqual([["below_minimum_wage", "minimum_wage"]]);
    expect(below.warnings[0]!.message).toContain("$19.00/h");
    expect(below.payLines.find((l) => l.type === "MW_TRUEUP")).toMatchObject({ minutes: 480, rate: { num: 75, den: 1 }, amountCents: 600 });
  });

  it("blocks local overtime rules (not implemented in this version)", () => {
    const jolietOt: JurisdictionRule = { jurisdiction: "IL", placeFips: JOLIET, scopeName: "City of Joliet", ruleCode: "weekly_overtime", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "hypothetical Joliet ordinance" };
    const r = computePay(input([shift(WEEK[0]!, 480)], { jurisdictionRules: [...JURISDICTIONS, jolietOt] }));
    expect(codes(r)).toEqual([["rule_not_supported_yet", "weekly_overtime"]]);
    expect(r.blockers[0]!.message).toContain("City of Joliet");
  });

  it("blocks a week in which an overtime rule changes", () => {
    const il = OT_RULES[1]!;
    const overtimeRules = [...OT_RULES.filter((o) => o.jurisdiction !== "IL"), { ...il, effectiveTo: "2026-10-06" }, { ...il, thresholdMinutes: 2100, effectiveFrom: "2026-10-07" }];
    const r = computePay(input(WEEK.slice(0, 5).map((d) => shift(d, 456)), { overtimeRules })); // 38h
    expect(r.payLines).toEqual([]);
    expect(codes(r)).toEqual([["rule_not_supported_yet", "weekly_overtime"]]);
  });

  it("refuses overlapping rule rows for the same rule (the answer would depend on row order)", () => {
    const overtimeRules = [...OT_RULES, { ...OT_RULES[1]!, thresholdMinutes: 2100, citation: "duplicate row" }];
    const r = computePay(input([shift(WEEK[0]!, 480)], { overtimeRules }));
    expect(r.payLines).toEqual([]);
    expect(r.blockers.map((b) => b.code)).toEqual(["rule_data_invalid"]);
  });

  it("refuses rule rows with malformed local codes", () => {
    const bad: JurisdictionRule = { jurisdiction: "IL", countyFips: "Cook", ruleCode: "local_minimum_wage", effectiveFrom: "2000-01-01", effectiveTo: null, citation: "x" };
    const r = computePay(input([shift(WEEK[0]!, 480)], { jurisdictionRules: [...JURISDICTIONS, bad] }));
    expect(r.blockers.map((b) => b.code)).toEqual(["rule_data_invalid"]);
  });

  it("blocks an assignment that is linked to two clients", () => {
    const r = computePay(input([shift(WEEK[0]!, 480, { clientId: "c1" }), shift(WEEK[1]!, 480, { clientId: "c9" })]));
    expect(r.payLines).toEqual([]);
    expect(r.blockers.map((b) => b.code)).toEqual(["invalid_input"]);
  });

  it("gives the same answer whatever the order of shifts and rule rows", () => {
    const scenarios: PayInput[] = [
      input([shift(WEEK[0]!, 480, { countyFips: COOK, placeFips: CHICAGO })]),
      input([shift(WEEK[0]!, 480, { jurisdiction: "CA", countyFips: "06071", placeFips: "0653896" })]),
      input([shift("2026-10-32", 480), shift(WEEK[1]!, 480, { minutes: -5 }), shift(WEEK[2]!, 480, { payRateCents: 0 })]),
      input([
        ...WEEK.slice(0, 4).map((d) => shift(d, 540)),
        shift(WEEK[4]!, 300, { assignmentId: "aB", clientId: "cB", startMinute: null, entryIds: [] }),
        shift(WEEK[4]!, 300, { assignmentId: "aC", clientId: "cC", startMinute: null }),
      ]),
      input([...WEEK.slice(0, 4).map((d) => shift(d, 540)), shift(WEEK[4]!, 300, { assignmentId: "aB", clientId: "cB", startMinute: null }), shift(WEEK[4]!, 300, { assignmentId: "aC", clientId: "cC", startMinute: null })]),
    ];
    for (const base of scenarios) {
      const expected = computePay(base);
      for (let seed = 1; seed <= 40; seed++) {
        const r = computePay({
          ...base,
          shifts: shuffled(base.shifts, seed),
          overtimeRules: shuffled(base.overtimeRules, seed + 1000),
          jurisdictionRules: shuffled(base.jurisdictionRules, seed + 2000),
          minimumWageRules: shuffled(base.minimumWageRules, seed + 3000),
        });
        expect(r).toEqual(expected);
      }
    }
  });
});

describe("computePay — fifth review fixes", () => {
  const codes = (r: ReturnType<typeof computePay>) => r.blockers.map((b) => b.code);

  it("treats a missing place code as unknown (held), and only an explicit 'none' as outside any city", () => {
    // Part of Chicago lies in DuPage County: with no place code the city ordinance could be missed.
    expect(codes(computePay(input([shift(WEEK[0]!, 480, { countyFips: DUPAGE, placeFips: null })])))).toEqual(["invalid_input"]);
    expect(codes(computePay(input([shift(WEEK[0]!, 480, { placeFips: "" })])))).toEqual(["invalid_input"]);
    expect(computePay(input([shift(WEEK[0]!, 480, { placeFips: NO_PLACE })])).blockers).toEqual([]);
  });

  it("refuses an overtime billing rule it does not know instead of billing overtime at $0", () => {
    const r = computePay(input(WEEK.slice(0, 5).map((d) => shift(d, 528, { otBillingRule: "Multiplier" as never }))));
    expect(r.billLines).toEqual([]);
    expect(codes(r)).toEqual(Array(5).fill("invalid_input"));
  });

  it("refuses an overtime rule row whose multiplier is below 1 or whose earning type is not OT", () => {
    const low = computePay(input([shift(WEEK[0]!, 480)], { overtimeRules: [...OT_RULES.filter((o) => o.jurisdiction !== "US"), { ...OT_RULES[0]!, multiplier: { num: 1, den: 2 } }] }));
    expect(codes(low)).toEqual(["rule_data_invalid"]);
    const type = computePay(input([shift(WEEK[0]!, 480)], { overtimeRules: [...OT_RULES.filter((o) => o.jurisdiction !== "US"), { ...OT_RULES[0]!, earningType: "REG" }] }));
    expect(codes(type)).toEqual(["rule_data_invalid"]);
  });

  it("lists each line's time entries sorted and once, and refuses an entry repeated inside one shift", () => {
    const r = computePay(input([shift(WEEK[0]!, 480, { entryIds: ["z9", "a1"] })]));
    expect(r.payLines[0]!.entryIds).toEqual(["a1", "z9"]);
    expect(codes(computePay(input([shift(WEEK[0]!, 480, { entryIds: ["e1", "e1"] })])))).toEqual(["invalid_input"]);
  });

  it("turns impossible sizes and missing fields into blockers instead of crashing", () => {
    expect(codes(computePay(input([shift(WEEK[0]!, 480, { payRateCents: 2 ** 50 })])))).toEqual(["invalid_input"]);
    expect(codes(computePay(input([shift(WEEK[0]!, 480, { billOtMultiplier: { num: 2 ** 40, den: 1 } })])))).toEqual(["invalid_input"]);
    expect(codes(computePay(input([shift(WEEK[0]!, 480, { billOtMultiplier: undefined as never })])))).toEqual(["invalid_input"]);
    const noMultiplier = { ...OT_RULES[1]!, multiplier: undefined as never };
    expect(codes(computePay(input([shift(WEEK[0]!, 480)], { overtimeRules: [...OT_RULES.filter((o) => o.jurisdiction !== "IL"), noMultiplier] })))).toEqual(["rule_data_invalid"]);
  });
});

describe("computePay — how a bill rate came about is in the bill line", () => {
  it("adds the rate card's own working (a markup rounded to the cent) to the bill line's explanation", () => {
    const note = "$18.25 × (100% + 45.00%) = 2646.25¢, rounded half up to $26.46";
    const r = computePay(input(WEEK.slice(0, 2).map((d) => shift(d, 480, { billRateCents: 2646, billRateExplain: note }))));
    expect(r.billLines).toHaveLength(1);
    expect(r.billLines[0]!.explain).toContain(`Bill rate from the rate card (${note}).`);
    const plain = computePay(input(WEEK.slice(0, 2).map((d) => shift(d, 480))));
    expect(plain.billLines[0]!.explain).toContain("Bill rate from the rate card.");
  });
});

describe("computePay — a bill rate's explanation never splits a line", () => {
  it("keeps shifts with the same rates on one line and lists each explanation", () => {
    const a = "$18.25 × (100% + 45.00%) = 2646.25¢, rounded half up to $26.46";
    const shifts = [shift(WEEK[0]!, 450, { billRateCents: 2646, billRateExplain: a }), shift(WEEK[1]!, 450, { billRateCents: 2646 })];
    const withNote = computePay(input(shifts));
    const without = computePay(input(shifts.map((s) => ({ ...s, billRateExplain: undefined }))));
    expect(withNote.payLines.map((l) => l.amountCents)).toEqual(without.payLines.map((l) => l.amountCents));
    expect(withNote.billLines.map((l) => l.amountCents)).toEqual(without.billLines.map((l) => l.amountCents));
    expect(withNote.billLines).toHaveLength(1);
    // One shift's rate was typed and the other's worked out: the working is said to cover some shifts.
    expect(withNote.billLines[0]!.explain).toContain(`Bill rate from the rate card (some shifts: ${a}).`);
  });

  it("explains each bill line with the shifts on that line only", () => {
    const a = "$18.25 × (100% + 45.00%) = 2646.25¢, rounded half up to $26.46";
    // Worked out Monday and Tuesday; typed as is Wednesday to Friday, where the overtime falls.
    const shifts = WEEK.slice(0, 5).map((d, i) => shift(d, 540, { billRateCents: 2646, billRateExplain: i < 2 ? a : undefined }));
    const r = computePay(input(shifts));
    expect(r.billLines.find((l) => l.type === "REG")!.explain).toContain(`(some shifts: ${a})`);
    const ot = r.billLines.find((l) => l.type === "OT")!;
    expect(ot.explain).not.toContain(a);
    expect(ot.explain).toContain("bill rate from the rate card.");
  });

  it("puts the explanation on the overtime bill line as well", () => {
    const a = "$18.25 × (100% + 45.00%) = 2646.25¢, rounded half up to $26.46";
    const r = computePay(input(WEEK.slice(0, 5).map((d) => shift(d, 540, { billRateCents: 2646, billRateExplain: a }))));
    const ot = r.billLines.find((l) => l.type === "OT")!;
    expect(ot.explain).toContain(`(${a})`);
  });
});

describe("computePay — regular rate as the weighted average of the week's rates (29 C.F.R. § 778.115)", () => {
  // Research golden G2: Joliet IL, week of Monday 2026-10-12. Forklift $20.00 at client A (bill $28.00),
  // general labor $17.00 at client B (bill $24.00).
  const G2 = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];
  const forklift = (d: string) => shift(d, 600, { assignmentId: "aA", clientId: "cA", payRateCents: 2000, billRateCents: 2800 });
  const labor = (d: string) => shift(d, 480, { assignmentId: "aB", clientId: "cB", payRateCents: 1700, billRateCents: 2400 });
  const g2 = () => [...G2.slice(0, 3).map(forklift), ...G2.slice(3).map(labor)];

  it("pays straight time at each rate plus half the week's regular rate for each overtime hour", () => {
    const r = computePay(input(g2()));
    expect(r.blockers).toEqual([]);
    expect(r.payLines.map((l) => [l.assignmentId, l.type, l.minutes, l.amountCents])).toEqual([
      ["aA", "REG", 1800, 60_000],
      ["aB", "REG", 600, 17_000],
      ["aB", "OT", 360, 15_887],
    ]);
    // $872.00 ÷ 46 h = 43,600/23 ¢/h, never rounded; the overtime rate is $17.00 + ½ × that.
    const ot = r.payLines.find((l) => l.type === "OT")!;
    expect(ot.rate).toEqual({ num: 60_900, den: 23 });
    expect(ot.explain).toContain("$17.00 + 0.5 × regular rate $18.9565…/h");
    expect(ot.explain).toContain("Regular rate: $872.00 earned at straight time ÷ 46h 00m worked = $18.9565…/h, used unrounded (29 C.F.R. § 778.115; § 778.111(a))");
    expect(ot.explain).toContain("15886.9565…¢ → rounded half-up once → $158.87");
    // Paying 1.5 × $17.00 instead would have been $153.00, $5.87 short.
    expect(r.payLines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(92_887);
  });

  it("bills each client at its own rates", () => {
    const r = computePay(input(g2()));
    expect(r.billLines.map((l) => [l.clientId, l.type, l.amountCents])).toEqual([
      ["cA", "REG", 84_000],
      ["cB", "REG", 24_000],
      ["cB", "OT", 21_600],
    ]);
  });

  it("gives the same result whatever order the shifts arrive in", () => {
    const shifts = g2();
    expect(computePay(input([...shifts].reverse()))).toEqual(computePay(input(shifts)));
  });

  it("keeps a single-rate week exactly as before (1.5 × the rate)", () => {
    const r = computePay(input(WEEK.slice(0, 5).map((d) => shift(d, 540))));
    const ot = r.payLines.find((l) => l.type === "OT")!;
    expect(ot.rate).toEqual({ num: 5475, den: 2 });
    expect(ot.explain).toContain("(1.5 × $18.25)");
    expect(ot.explain).not.toContain("Regular rate:");
  });

  it("never lets the overtime premium's base fall below that day's minimum wage (29 C.F.R. § 778.107)", () => {
    // The Illinois minimum rises to $16.00 on Thursday; the week's regular rate is $15.52…, so
    // Friday's overtime premium is half of $16.00, not half of $15.52….
    const minimumWageRules = [
      ...MIN_WAGE.filter((m) => m.jurisdiction !== "IL"),
      { jurisdiction: "IL", rateCents: 1500, effectiveFrom: "2025-01-01", effectiveTo: "2026-10-14", citation: "820 ILCS 105/4(a)(1)" },
      { jurisdiction: "IL", rateCents: 1600, effectiveFrom: "2026-10-15", effectiveTo: null, citation: "820 ILCS 105/4(a)(1) (test rise)" },
    ];
    const shifts = [
      ...G2.slice(0, 3).map((d) => shift(d, 600, { assignmentId: "aA", payRateCents: 1500 })),
      ...G2.slice(3).map((d) => shift(d, 480, { assignmentId: "aB", payRateCents: 1650 })),
    ];
    const r = computePay(input(shifts, { minimumWageRules }));
    expect(r.blockers).toEqual([]);
    const ot = r.payLines.find((l) => l.type === "OT")!;
    expect(ot).toMatchObject({ minutes: 360, rate: { num: 2450, den: 1 }, amountCents: 14_700 });
    expect(ot.explain).toContain("the minimum wage that day, $16.00/h, is higher than the regular rate");
  });

  it("tops up the days a new minimum wage covers, and bases those days' overtime premium on it", () => {
    const minimumWageRules = [
      ...MIN_WAGE.filter((m) => m.jurisdiction !== "IL"),
      { jurisdiction: "IL", rateCents: 1500, effectiveFrom: "2025-01-01", effectiveTo: "2026-10-14", citation: "820 ILCS 105/4(a)(1)" },
      { jurisdiction: "IL", rateCents: 1600, effectiveFrom: "2026-10-15", effectiveTo: null, citation: "820 ILCS 105/4(a)(1) (test rise)" },
    ];
    const shifts = [
      ...G2.slice(0, 3).map((d) => shift(d, 600, { assignmentId: "aA", payRateCents: 1500 })),
      ...G2.slice(3).map((d) => shift(d, 480, { assignmentId: "aB", payRateCents: 1550 })),
    ];
    const r = computePay(input(shifts, { minimumWageRules }));
    expect(r.blockers).toEqual([]);
    expect(r.payLines.map((l) => [l.assignmentId, l.type, l.minutes, l.amountCents])).toEqual([
      ["aA", "REG", 1800, 45_000],
      ["aB", "REG", 600, 15_500],
      ["aB", "OT", 360, 14_100],
      ["aB", "MW_TRUEUP", 960, 800],
    ]);
    // 30 h × $15.00 + 16 h × $16.00 + ½ × $16.00 × 6 h = $754.00.
    expect(r.payLines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(75_400);
  });

  it("pays no top-up line that would round to nothing, and still warns", () => {
    const r = computePay(input([shift(WEEK[0]!, 20, { payRateCents: 1499 })]));
    expect(r.blockers).toEqual([]);
    expect(r.payLines.map((l) => l.type)).toEqual(["REG"]);
    expect(r.warnings.map((w) => w.code)).toEqual(["below_minimum_wage"]);
  });

  it("refuses a minimum-wage row that is not a plausible hourly rate", () => {
    const minimumWageRules = [...MIN_WAGE, { jurisdiction: "IL", countyFips: WILL, scopeName: "Will County", rateCents: 150_000, effectiveFrom: "2026-01-01", effectiveTo: null, citation: "typo" }];
    const r = computePay(input([shift(WEEK[0]!, 480)], { minimumWageRules }));
    expect(r.blockers.map((b) => b.code)).toEqual(["rule_data_invalid"]);
  });

  it("computes very large weeks exactly, without leaving safe integers", () => {
    const shifts = WEEK.map((d, i) => shift(d, 1440, { startMinute: 0, assignmentId: i % 2 ? "aA" : "aB", payRateCents: i % 2 ? 9_999_999 : 9_999_998 }));
    const r = computePay(input(shifts));
    expect(r.blockers).toEqual([]);
    const total = r.payLines.reduce((sum, l) => sum + l.amountCents, 0);
    // Straight time for every minute plus half the regular rate for each overtime minute, rounded per line.
    const straight = shifts.reduce((sum, s) => sum + BigInt(s.minutes) * BigInt(s.payRateCents), 0n);
    const premium = straight * BigInt(10080 - 2400) / (2n * 10080n);
    expect(Math.abs(total - Number((straight + premium) / 60n))).toBeLessThanOrEqual(4);
  });
});

describe("computePay — California daily, double-time and seventh-day overtime (Cal. Lab. Code § 510(a))", () => {
  const CA_SITE = { jurisdiction: "CA", countyFips: "06071", placeFips: "0653896" } as const; // Ontario
  const since = "2000-01-01";
  const caOt = (ruleCode: string, kind: OvertimeRule["kind"], thresholdMinutes: number, num: number, den: number, earningType: "OT" | "DT", citation: string): OvertimeRule => ({
    jurisdiction: "CA",
    ruleCode,
    kind,
    thresholdMinutes,
    multiplier: { num, den },
    earningType,
    effectiveFrom: since,
    effectiveTo: null,
    citation,
  });
  const CA_OT: OvertimeRule[] = [
    ...OT_RULES.filter((o) => o.jurisdiction !== "CA"),
    caOt("weekly_overtime", "weekly", 2400, 3, 2, "OT", "Cal. Lab. Code § 510(a) — weekly"),
    caOt("ca_daily_overtime", "daily", 480, 3, 2, "OT", "Cal. Lab. Code § 510(a) — over 8 hours a day"),
    caOt("ca_daily_double_time", "daily_double", 720, 2, 1, "DT", "Cal. Lab. Code § 510(a) — over 12 hours a day"),
    caOt("ca_seventh_day", "seventh_day", 0, 3, 2, "OT", "Cal. Lab. Code § 510(a) — seventh day, first 8 hours"),
    caOt("ca_seventh_day_double_time", "seventh_day", 480, 2, 1, "DT", "Cal. Lab. Code § 510(a) — seventh day, over 8 hours"),
  ];
  const caJ = (ruleCode: string): JurisdictionRule => ({ jurisdiction: "CA", ruleCode, effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 510(a)" });
  const CA_J: JurisdictionRule[] = [
    ...JURISDICTIONS.filter((j) => j.jurisdiction !== "CA"),
    ...["weekly_overtime", "ca_daily_overtime", "ca_daily_double_time", "ca_seventh_day", "ca_seventh_day_double_time"].map(caJ),
    { jurisdiction: "CA", ruleCode: "minimum_wage", effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 1182.12" },
  ];
  // Workweek Sunday 2026-10-04 to Saturday 2026-10-10 (research golden G1).
  const G1 = ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"];
  const ca = (date: string, minutes: number, over: Partial<Shift> = {}) =>
    shift(date, minutes, { ...CA_SITE, payRateCents: 1800, billRateCents: 2600, billDtMultiplier: { num: 2, den: 1 }, ...over });
  const CA_PREMIUMS: PremiumRule[] = [
    { jurisdiction: "CA", ruleCode: "ca_meal_premium", premiumMinutes: 60, perWorkdayMax: 1, effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 226.7(c); Ferra v. Loews Hollywood Hotel (2021) 11 Cal.5th 858" },
    { jurisdiction: "CA", ruleCode: "ca_rest_premium", premiumMinutes: 60, perWorkdayMax: 1, effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 226.7(c); Ferra v. Loews Hollywood Hotel (2021) 11 Cal.5th 858" },
  ];
  const caInput = (shifts: Shift[]) => input(shifts, { workweekStartsOn: 0, overtimeRules: CA_OT, jurisdictionRules: CA_J, premiumRules: CA_PREMIUMS });
  const lines = (r: ReturnType<typeof computePay>, which: "payLines" | "billLines" = "payLines") => r[which].map((l) => [l.type, l.ruleId, l.minutes, l.amountCents]);

  it("pays daily overtime, daily double time, weekly overtime on the rest, and the seventh day", () => {
    const r = computePay(caInput([480, 600, 780, 480, 480, 360, 600].map((m, i) => ca(G1[i]!, m))));
    expect(r.blockers).toEqual([]);
    expect(lines(r)).toEqual([
      ["REG", "straight_time", 2400, 72_000],
      ["OT", "ca_daily_overtime", 360, 16_200],
      ["OT", "weekly_overtime", 360, 16_200],
      ["OT", "ca_seventh_day", 480, 21_600],
      ["DT", "ca_daily_double_time", 60, 3600],
      ["DT", "ca_seventh_day_double_time", 120, 7200],
    ]);
    // $1,368.00; treating Saturday as an ordinary day would pay $1,350.00.
    expect(r.payLines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(136_800);
    const daily = r.payLines.find((l) => l.ruleId === "ca_daily_overtime")!;
    expect(daily.explain).toContain("hours over 8h 00m in a workday, on 2026-10-05 and 2026-10-06");
    const seventh = r.payLines.find((l) => l.ruleId === "ca_seventh_day")!;
    expect(seventh.explain).toContain("2026-10-10 is the seventh day of work in the workweek starting 2026-10-04");
    const weekly = r.payLines.find((l) => l.ruleId === "weekly_overtime")!;
    expect(weekly.explain).toContain("not already paid at a daily or seventh-day premium");
    expect(r.payLines.find((l) => l.type === "DT")!.explain).toContain("(2 × $18.00)");
  });

  it("bills overtime and double time at the rate card's own multipliers", () => {
    const r = computePay(caInput([480, 600, 780, 480, 480, 360, 600].map((m, i) => ca(G1[i]!, m))));
    expect(r.billLines.map((l) => [l.type, l.minutes, l.amountCents])).toEqual([
      ["REG", 2400, 104_000],
      ["OT", 360, 23_400],
      ["OT", 360, 23_400],
      ["OT", 480, 31_200],
      ["DT", 60, 5200],
      ["DT", 120, 10_400],
    ]);
    expect(r.billLines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(197_600);
  });

  it("gives no seventh-day premium to seven days in a row that straddle two workweeks", () => {
    const days = ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"];
    const r = computePay(caInput(days.map((d) => ca(d, 480))));
    expect(r.blockers).toEqual([]);
    expect(r.payLines.map((l) => l.type)).toEqual(["REG", "REG"]);
  });

  it("never counts an hour twice (DLSE Opinion Letter 2000.01.19 examples)", () => {
    const premium = (minutes: number[]) =>
      computePay(caInput(minutes.map((m, i) => ca(G1[i + 1]!, m))))
        .payLines.filter((l) => l.type !== "REG")
        .map((l) => [l.ruleId, l.minutes]);
    expect(premium([600, 600, 600, 600, 600])).toEqual([["ca_daily_overtime", 600]]);
    expect(premium([540, 540, 540, 540, 240])).toEqual([["ca_daily_overtime", 240]]);
    expect(premium([420, 420, 420, 420, 420, 420])).toEqual([["weekly_overtime", 120]]);
  });

  it("pays the first 8 hours of a seventh day at 1.5×, even in a short week", () => {
    const r = computePay(caInput(G1.map((d) => ca(d, 240))));
    expect(lines(r).slice(1)).toEqual([["OT", "ca_seventh_day", 240, 10_800]]);
  });

  it("pays a confirmed missed meal and rest period one hour each at the week's regular rate (Ferra), at most one of each per workday", () => {
    // Research golden G8: Mon–Wed $18.00, Thu–Fri $20.00, 40 h; the regular rate is $752.00 ÷ 40 h = $18.80.
    const shifts = [...G1.slice(1, 4).map((d) => ca(d, 480, { assignmentId: "aA" })), ...G1.slice(4, 6).map((d) => ca(d, 480, { assignmentId: "aB", payRateCents: 2000 }))];
    const confirmations: Confirmation[] = [
      { id: "c1", kind: "meal_period_missed", workerId: "w1", assignmentId: "aB", date: "2026-10-08" },
      { id: "c2", kind: "meal_period_missed", workerId: "w1", assignmentId: "aB", date: "2026-10-08" },
      { id: "c3", kind: "rest_period_missed", workerId: "w1", assignmentId: "aB", date: "2026-10-08" },
    ];
    const r = computePay({ ...caInput(shifts), confirmations });
    expect(r.blockers).toEqual([]);
    expect(lines(r)).toEqual([
      ["REG", "straight_time", 1440, 43_200],
      ["REG", "straight_time", 960, 32_000],
      ["MEAL_PREMIUM", "ca_meal_premium", 60, 1880],
      ["REST_PREMIUM", "ca_rest_premium", 60, 1880],
    ]);
    expect(r.payLines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(78_960);
    const meal = r.payLines.find((l) => l.type === "MEAL_PREMIUM")!;
    expect(meal.explain).toContain("1h 00m (60 min) × $18.80/h (the week's regular rate)");
    expect(meal.explain).toContain("not hours worked");
    // Premiums are not billed unless the client's profile says so (a later step); they are not hours worked.
    expect(r.billLines.some((l) => l.type === "MEAL_PREMIUM")).toBe(false);
  });

  it("refuses a confirmation for a day the worker did not work on that assignment, and warns where no premium applies", () => {
    const off = computePay({ ...caInput([ca(G1[1]!, 480)]), confirmations: [{ id: "c1", kind: "meal_period_missed", workerId: "w1", assignmentId: "a1", date: G1[2]! }] });
    expect(off.blockers.map((b) => b.code)).toEqual(["invalid_input"]);
    const il = computePay({ ...input([shift(WEEK[0]!, 480)]), premiumRules: CA_PREMIUMS, confirmations: [{ id: "c1", kind: "meal_period_missed", workerId: "w1", assignmentId: "a1", date: WEEK[0]! }] });
    expect(il.blockers).toEqual([]);
    expect(il.payLines.map((l) => l.type)).toEqual(["REG"]);
    expect(il.warnings.map((w) => w.code)).toEqual(["premium_not_applicable"]);
  });

  it("never pays less than the federal weekly rule: when the minimum wage rises mid-week, the larger result is paid", () => {
    // Rate card $16.60; the minimum is $16.50 in 2025 and $16.90 from 2026-01-01 (review round c1, B1).
    const minimumWageRules = [
      ...MIN_WAGE.filter((m) => m.jurisdiction !== "CA"),
      { jurisdiction: "CA", rateCents: 1650, effectiveFrom: "2025-01-01", effectiveTo: "2025-12-31", citation: "Cal. Lab. Code § 1182.12 (2025)" },
      { jurisdiction: "CA", rateCents: 1690, effectiveFrom: "2026-01-01", effectiveTo: null, citation: "Cal. Lab. Code § 1182.12 (2026)" },
    ];
    const days = ["2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"];
    const shifts = days.map((d, i) => ca(d, i === 0 ? 720 : 480, { payRateCents: 1660 }));
    const r = computePay(input(shifts, { workweekStartsOn: 1, overtimeRules: CA_OT, jurisdictionRules: CA_J, minimumWageRules }));
    expect(r.blockers).toEqual([]);
    // California's daily rule: 4 h × ½ × $16.709… on Monday → $768.62; the weekly rule: Friday's 4 h
    // over 40 on a $16.90 base → $769.00. The worker gets the larger.
    expect(r.payLines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(76_900);
    const ot = r.payLines.find((l) => l.type === "OT")!;
    expect(ot.ruleId).toBe("weekly_overtime");
    expect(ot.explain).toContain("pays more this week than California's daily and seventh-day rules");
  });

  it("holds a California week whose rule data is incomplete instead of paying less", () => {
    const missingDt = CA_J.filter((j) => j.ruleCode !== "ca_daily_double_time");
    const r = computePay(input([ca(G1[1]!, 780)], { workweekStartsOn: 0, overtimeRules: CA_OT, jurisdictionRules: missingDt }));
    expect(r.payLines).toEqual([]);
    expect(r.blockers.map((b) => [b.code, b.ruleCode])).toEqual([["rule_data_missing", "ca_daily_double_time"]]);
  });

  it("names the pay rule on each bill line, and keeps California daily lines free of weekly notes", () => {
    const shifts = [ca(G1[1]!, 600, { assignmentId: "aA", clientId: "cA" }), ...G1.slice(2, 6).map((d) => ca(d, 480, { assignmentId: "aB", clientId: "cB" })), ca(G1[6]!, 120, { assignmentId: "aB", clientId: "cB" })];
    const r = computePay(caInput(shifts));
    const daily = r.billLines.find((l) => l.type === "OT" && l.explain.includes("ca_daily_overtime"))!;
    expect(daily.explain).not.toContain("were worked on other assignments");
    const straight = computePay(caInput([ca(G1[1]!, 780, { otBillingRule: "straight_time" })]));
    expect(straight.billLines.find((l) => l.type === "DT")!.explain).toContain("Client bills double time at straight time");
    const rr = computePay(caInput([ca(G1[1]!, 600, { assignmentId: "aA" }), ca(G1[2]!, 480, { assignmentId: "aB", payRateCents: 2000 })]));
    expect(rr.payLines.find((l) => l.type === "OT")!.explain).toContain("DLSE Enforcement Manual 49.2.5");
  });

  it("holds a week that mixes California with another state", () => {
    const r = computePay(caInput([ca(G1[1]!, 480), shift(G1[2]!, 480, { assignmentId: "aIL" })]));
    expect(r.payLines).toEqual([]);
    expect(r.blockers).toEqual([expect.objectContaining({ code: "rule_not_supported_yet", jurisdiction: "CA" })]);
    expect(r.blockers[0]!.message).toContain("California and IL");
  });

  it("never pays less than federal law would, and never depends on input order (random weeks)", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
    for (let n = 0; n < 300; n++) {
      const shifts = G1.flatMap((d) => (rand() < 0.15 ? [] : [ca(d, 60 + Math.floor(rand() * 13) * 60, { payRateCents: rand() < 0.5 ? 1800 : 2150, assignmentId: rand() < 0.5 ? "aA" : "aB", startMinute: 0 })]));
      if (shifts.length === 0) continue;
      const r = computePay(caInput(shifts));
      expect(r.blockers).toEqual([]);
      const total = r.payLines.reduce((sum, l) => sum + l.amountCents, 0);
      const minutes = shifts.reduce((sum, s) => sum + s.minutes, 0);
      const straight = shifts.reduce((sum, s) => sum + s.minutes * s.payRateCents, 0); // cent-minutes per hour
      const federal = (straight + Math.max(0, minutes - 2400) * straight / minutes / 2) / 60;
      expect(total).toBeGreaterThanOrEqual(Math.floor(federal) - r.payLines.length);
      expect(computePay(caInput([...shifts].reverse()))).toEqual(r);
    }
  });
});

describe("computePay — pay when a worker reports or is sent and gets less work than scheduled", () => {
  const since = "2000-01-01";
  const GUARANTEES: GuaranteeRule[] = [
    { jurisdiction: "CA", ruleCode: "ca_reporting_time", dueMinutes: null, reassignedDueMinutes: null, scheduledFraction: { num: 1, den: 2 }, minMinutes: 120, maxMinutes: 240, minScheduledMinutes: null, basis: "regular_rate", effectiveFrom: since, effectiveTo: null, citation: "IWC Wage Order 7-2001 § 5(A), 8 CCR § 11070" },
    { jurisdiction: "MA", ruleCode: "ma_reporting_pay", dueMinutes: 180, reassignedDueMinutes: null, scheduledFraction: null, minMinutes: null, maxMinutes: null, minScheduledMinutes: 180, basis: "pay_rate", effectiveFrom: since, effectiveTo: null, citation: "454 CMR 27.04(1)" },
    { jurisdiction: "IL", ruleCode: "il_day_labor_minimum", dueMinutes: 240, reassignedDueMinutes: 120, scheduledFraction: null, minMinutes: null, maxMinutes: null, minScheduledMinutes: null, basis: "pay_rate", effectiveFrom: since, effectiveTo: null, citation: "820 ILCS 175/30(g); 56 Ill. Adm. Code 260.450(b)" },
  ];
  const CA_SITE = { jurisdiction: "CA", countyFips: "06071", placeFips: "0653896" } as const;
  const MA_SITE = { jurisdiction: "MA", countyFips: "25027", placeFips: "2582000" } as const;
  const CA_J: JurisdictionRule[] = [
    ...JURISDICTIONS.filter((j) => j.jurisdiction !== "CA"),
    ...["weekly_overtime", "ca_daily_overtime", "ca_daily_double_time", "ca_seventh_day", "ca_seventh_day_double_time"].map((ruleCode) => ({ jurisdiction: "CA", ruleCode, effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 510(a)" })),
  ];
  const CA_WEEKLY: OvertimeRule = { jurisdiction: "CA", ruleCode: "weekly_overtime", kind: "weekly", thresholdMinutes: 2400, multiplier: { num: 3, den: 2 }, earningType: "OT", effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 510(a)" };
  const caRow = (ruleCode: string, kind: OvertimeRule["kind"], thresholdMinutes: number, num: number, den: number, earningType: "OT" | "DT"): OvertimeRule => ({ jurisdiction: "CA", ruleCode, kind, thresholdMinutes, multiplier: { num, den }, earningType, effectiveFrom: since, effectiveTo: null, citation: "Cal. Lab. Code § 510(a)" });
  const CA_ROWS = [CA_WEEKLY, caRow("ca_daily_overtime", "daily", 480, 3, 2, "OT"), caRow("ca_daily_double_time", "daily_double", 720, 2, 1, "DT"), caRow("ca_seventh_day", "seventh_day", 0, 3, 2, "OT"), caRow("ca_seventh_day_double_time", "seventh_day", 480, 2, 1, "DT")];
  const run = (shifts: Shift[], confirmations: Confirmation[]) => computePay({ ...input(shifts, { jurisdictionRules: CA_J, overtimeRules: [...OT_RULES.filter((o) => o.jurisdiction !== "CA"), ...CA_ROWS] }), guaranteeRules: GUARANTEES, confirmations });
  const sent = (date: string, assignmentId: string, over: Partial<Confirmation> = {}): Confirmation => ({ id: `c-${date}-${assignmentId}`, kind: "reported_short", workerId: "w1", assignmentId, date, ...over });
  const lines = (r: ReturnType<typeof computePay>) => r.payLines.map((l) => [l.type, l.ruleId, l.minutes, l.amountCents]);

  it("California: half the scheduled day (2 to 4 hours) at the regular rate, less the time worked", () => {
    const shifts = [...WEEK.slice(0, 4).map((d) => shift(d, 480, { ...CA_SITE, payRateCents: 1800 })), shift(WEEK[4]!, 120, { ...CA_SITE, payRateCents: 1800 })];
    const r = run(shifts, [sent(WEEK[4]!, "a1", { scheduledMinutes: 480 })]);
    expect(r.blockers).toEqual([]);
    expect(lines(r)).toEqual([
      ["REG", "straight_time", 2040, 61_200],
      ["REPORTING_PAY", "ca_reporting_time", 120, 3600],
    ]);
    expect(r.payLines[1]!.explain).toContain("half the scheduled 8h 00m is 4h 00m (at least 2h 00m, at most 4h 00m); 2h 00m were worked");
    // Given at least half the scheduled day: nothing more is due.
    expect(lines(run([shift(WEEK[0]!, 300, { ...CA_SITE })], [sent(WEEK[0]!, "a1", { scheduledMinutes: 480 })])).map((l) => l[0])).toEqual(["REG"]);
  });

  it("California: a worker sent home without any work is still paid the reporting time", () => {
    const shifts = [shift(WEEK[0]!, 480, { ...CA_SITE, payRateCents: 1800 }), shift(WEEK[1]!, 0, { ...CA_SITE, payRateCents: 1800, entryIds: [], reportedOnly: true })];
    const r = run(shifts, [sent(WEEK[1]!, "a1", { scheduledMinutes: 360 })]);
    expect(r.blockers).toEqual([]);
    expect(lines(r)).toEqual([
      ["REG", "straight_time", 480, 14_400],
      ["REPORTING_PAY", "ca_reporting_time", 180, 5400],
    ]);
  });

  it("California: the scheduled hours are needed", () => {
    const r = run([shift(WEEK[0]!, 60, { ...CA_SITE })], [sent(WEEK[0]!, "a1")]);
    expect(r.blockers.map((b) => b.code)).toEqual(["invalid_input"]);
    expect(r.blockers[0]!.message).toContain("scheduled hours");
  });

  it("Massachusetts: at least 3 hours when 3 or more were scheduled, at no less than the minimum wage", () => {
    const r = run([shift(WEEK[0]!, 60, { ...MA_SITE, payRateCents: 1900 })], [sent(WEEK[0]!, "a1", { scheduledMinutes: 240 })]);
    expect(lines(r)).toEqual([
      ["REG", "straight_time", 60, 1900],
      ["REPORTING_PAY", "ma_reporting_pay", 120, 3800],
    ]);
    expect(lines(run([shift(WEEK[0]!, 60, { ...MA_SITE })], [sent(WEEK[0]!, "a1", { scheduledMinutes: 120 })])).map((l) => l[0])).toEqual(["REG"]);
  });

  it("Illinois day and temporary labor: 4 hours at the agreed rate when not used (research example G5)", () => {
    const shifts = [
      ...WEEK.slice(0, 4).map((d) => shift(d, 600, { assignmentId: "aC", clientId: "cC", payRateCents: 1700 })),
      shift(WEEK[4]!, 90, { assignmentId: "aD", clientId: "cD", payRateCents: 1700 }),
    ];
    const r = run(shifts, [sent(WEEK[4]!, "aD")]);
    expect(r.blockers).toEqual([]);
    expect(lines(r)).toEqual([
      ["REG", "straight_time", 2400, 68_000],
      ["OT", "weekly_overtime", 90, 3825],
      ["MIN_GUARANTEE", "il_day_labor_minimum", 150, 4250],
    ]);
    expect(r.payLines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(76_075);
  });

  it("Illinois: 2 hours for the whole shift when placed elsewhere the same shift; never for clerical work", () => {
    const shifts = [shift(WEEK[0]!, 30, { assignmentId: "aD", clientId: "cD", payRateCents: 1700 }), shift(WEEK[0]!, 60, { assignmentId: "aE", clientId: "cE", payRateCents: 1700, startMinute: 600 })];
    expect(lines(run(shifts, [sent(WEEK[0]!, "aD", { reassigned: true })])).slice(2)).toEqual([["MIN_GUARANTEE", "il_day_labor_minimum", 30, 850]]);
    const clerical = run([shift(WEEK[0]!, 30, { dayAndTemporaryLabor: false })], [sent(WEEK[0]!, "a1")]);
    expect(lines(clerical).map((l) => l[0])).toEqual(["REG"]);
    expect(clerical.warnings.map((w) => w.code)).toEqual(["premium_not_applicable"]);
  });
});

describe("computePay — holidays (agency policy) and bonuses, with the regular-rate rules the law sets for them", () => {
  const MA_SITE = { jurisdiction: "MA", countyFips: "25027", placeFips: "2582000" } as const;
  // Research golden G6: Worcester MA, $19.00, bill $27.00; Thanksgiving Thursday 2026-11-26.
  const THANKS = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"];
  const policy = (over: Partial<HolidayPolicy> = {}): HolidayPolicy => ({ clientId: null, name: "Agency holidays", dates: ["2026-11-26"], workedMultiplier: { num: 3, den: 2 }, notWorkedMinutes: 480, billWorkedMultiplier: { num: 3, den: 2 }, billNotWorked: false, ...over });
  const ma = (date: string, minutes: number, over: Partial<Shift> = {}) => shift(date, minutes, { ...MA_SITE, payRateCents: 1900, billRateCents: 2700, ...over });
  const lines = (r: ReturnType<typeof computePay>, which: "payLines" | "billLines" = "payLines") => r[which].map((l) => [l.type, l.minutes, l.amountCents]);
  const total = (r: ReturnType<typeof computePay>) => r.payLines.reduce((sum, l) => sum + l.amountCents, 0);

  it("pays the policy's premium for hours worked on a holiday, and bills its own multiplier (worker A)", () => {
    const r = computePay({ ...input(THANKS.map((d) => ma(d, 480))), holidayPolicies: [policy()] });
    expect(r.blockers).toEqual([]);
    expect(lines(r)).toEqual([
      ["REG", 2400, 76_000],
      ["HOL", 480, 7600],
    ]);
    expect(total(r)).toBe(83_600);
    expect(lines(r, "billLines")).toEqual([
      ["REG", 2400, 108_000],
      ["HOL", 480, 10_800],
    ]);
    expect(r.payLines[1]!.explain).toContain("0.5 × $19.00");
    expect(r.payLines[1]!.explain).toContain("not counted in the regular rate");
  });

  it("pays a holiday not worked when a person confirmed the worker is eligible (worker B), not as hours worked", () => {
    const shifts = [...THANKS.filter((d) => d !== "2026-11-26").map((d) => ma(d, 480)), ma("2026-11-26", 0, { entryIds: [], reportedOnly: true })];
    const r = computePay({ ...input(shifts), holidayPolicies: [policy()], confirmations: [{ id: "h1", kind: "holiday_not_worked", workerId: "w1", assignmentId: "a1", date: "2026-11-26" }] });
    expect(r.blockers).toEqual([]);
    expect(lines(r)).toEqual([
      ["REG", 1920, 60_800],
      ["HOL_NOT_WORKED", 480, 15_200],
    ]);
    expect(lines(r, "billLines")).toEqual([["REG", 1920, 86_400]]);
  });

  it("adds the holiday premium on top of overtime (worker C, 45 h)", () => {
    const r = computePay({ ...input(THANKS.map((d) => ma(d, 540))), holidayPolicies: [policy()] });
    expect(lines(r)).toEqual([
      ["REG", 2400, 76_000],
      ["OT", 300, 14_250],
      ["HOL", 540, 8550],
    ]);
    expect(total(r)).toBe(98_800);
  });

  it("counts a holiday premium below 1.5× in the regular rate (29 C.F.R. § 778.203)", () => {
    const r = computePay({ ...input(THANKS.map((d) => ma(d, 540))), holidayPolicies: [policy({ workedMultiplier: { num: 5, den: 4 } })] });
    // Regular rate ($855.00 + $42.75) ÷ 45 h = $19.95; overtime 5 h × ($19.00 + $9.975) = $144.875.
    expect(lines(r)).toEqual([
      ["REG", 2400, 76_000],
      ["OT", 300, 14_488],
      ["HOL", 540, 4275],
    ]);
    expect(total(r)).toBe(94_763);
    expect(r.payLines[2]!.explain).toContain("is counted in the regular rate");
    expect(r.payLines[2]!.explain).not.toContain("not counted");
    expect(r.payLines[1]!.explain).toContain("($855.00 earned at straight time + $42.75 holiday premium below 1.5×) ÷ 45h 00m worked = $19.95/h");
  });

  it("pays a nondiscretionary bonus, and overtime on the regular rate that includes it", () => {
    const shifts = [...WEEK.slice(0, 4).map((d) => shift(d, 540)), shift(WEEK[4]!, 480)];
    const r = computePay({ ...input(shifts), bonuses: [{ id: "b1", workerId: "w1", assignmentId: "a1", workweekStart: WEEK[0]!, amountCents: 5000, kind: "nondiscretionary" }] });
    expect(r.blockers).toEqual([]);
    // ($803.00 + $50.00) ÷ 44 h = $19.3863…; overtime 4 h × ($18.25 + ½ × that) = $111.77.
    expect(lines(r)).toEqual([
      ["REG", 2400, 73_000],
      ["OT", 240, 11_177],
      ["BONUS", 0, 5000],
    ]);
  });

  it("California flat-sum bonus: overtime on it at 1.5× and 2× of the bonus over the non-overtime hours (Alvarado)", () => {
    const CA_SITE = { jurisdiction: "CA", countyFips: "06071", placeFips: "0653896" } as const;
    const caJ: JurisdictionRule[] = [
      ...JURISDICTIONS.filter((j) => j.jurisdiction !== "CA"),
      ...["weekly_overtime", "ca_daily_overtime", "ca_daily_double_time", "ca_seventh_day", "ca_seventh_day_double_time"].map((ruleCode) => ({ jurisdiction: "CA", ruleCode, effectiveFrom: "2000-01-01", effectiveTo: null, citation: "Cal. Lab. Code § 510(a)" })),
    ];
    const row = (ruleCode: string, kind: OvertimeRule["kind"], thresholdMinutes: number, num: number, den: number, earningType: "OT" | "DT"): OvertimeRule => ({ jurisdiction: "CA", ruleCode, kind, thresholdMinutes, multiplier: { num, den }, earningType, effectiveFrom: "2000-01-01", effectiveTo: null, citation: "Cal. Lab. Code § 510(a)" });
    const caOt = [...OT_RULES.filter((o) => o.jurisdiction !== "CA"), row("weekly_overtime", "weekly", 2400, 3, 2, "OT"), row("ca_daily_overtime", "daily", 480, 3, 2, "OT"), row("ca_daily_double_time", "daily_double", 720, 2, 1, "DT"), row("ca_seventh_day", "seventh_day", 0, 3, 2, "OT"), row("ca_seventh_day_double_time", "seventh_day", 480, 2, 1, "DT")];
    const G1 = ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"];
    const shifts = [480, 600, 780, 480, 480, 360, 600].map((m, i) => shift(G1[i]!, m, { ...CA_SITE, payRateCents: 1800, billRateCents: 2600 }));
    const r = computePay({ ...input(shifts, { workweekStartsOn: 0, overtimeRules: caOt, jurisdictionRules: caJ }), bonuses: [{ id: "b1", workerId: "w1", assignmentId: "a1", workweekStart: G1[0]!, amountCents: 5000, kind: "flat_sum" }] });
    expect(r.blockers).toEqual([]);
    // $50 ÷ 40 non-overtime hours = $1.25; 20 h × 1.5 × $1.25 + 3 h × 2 × $1.25 = $45.00.
    expect(r.payLines.filter((l) => l.type === "BONUS" || l.type === "BONUS_OT").map((l) => [l.type, l.amountCents])).toEqual([
      ["BONUS", 5000],
      ["BONUS_OT", 4500],
    ]);
    expect(total(r)).toBe(136_800 + 5000 + 4500);
  });
});


describe("computePay — holidays and bonuses: what is refused, and which policy wins", () => {
  const MA_SITE = { jurisdiction: "MA", countyFips: "25027", placeFips: "2582000" } as const;
  const THANKS = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"];
  const policy = (over: Partial<HolidayPolicy> = {}): HolidayPolicy => ({ clientId: null, name: "Agency holidays", dates: ["2026-11-26"], workedMultiplier: { num: 3, den: 2 }, notWorkedMinutes: 480, billWorkedMultiplier: { num: 3, den: 2 }, billNotWorked: false, ...over });
  const ma = (date: string, minutes: number, over: Partial<Shift> = {}) => shift(date, minutes, { ...MA_SITE, payRateCents: 1900, billRateCents: 2700, ...over });
  const presence = (over: Partial<Shift> = {}) => ma("2026-11-26", 0, { entryIds: [], reportedOnly: true, ...over });
  const notWorked = (over: Partial<Confirmation> = {}): Confirmation => ({ id: "h1", kind: "holiday_not_worked", workerId: "w1", assignmentId: "a1", date: "2026-11-26", ...over });
  const fourDays = () => THANKS.filter((d) => d !== "2026-11-26").map((d) => ma(d, 480));
  const lines = (r: ReturnType<typeof computePay>, which: "payLines" | "billLines" = "payLines") => r[which].map((l) => [l.type, l.minutes, l.amountCents]);
  const messages = (r: ReturnType<typeof computePay>) => r.blockers.map((b) => b.message).join(" ");

  it("refuses a holiday not worked on a day the worker worked", () => {
    const r = computePay({ ...input(THANKS.map((d) => ma(d, 480))), holidayPolicies: [policy()], confirmations: [notWorked()] });
    expect(r.payLines).toEqual([]);
    expect(messages(r)).toContain("8h 00m were worked that day");
  });

  it("refuses a holiday not worked that no policy pays", () => {
    for (const holidayPolicies of [[], [policy({ notWorkedMinutes: 0 })], [policy({ dates: ["2026-12-25"] })]]) {
      const r = computePay({ ...input([...fourDays(), presence()]), holidayPolicies, confirmations: [notWorked()] });
      expect(r.payLines).toEqual([]);
      expect(messages(r)).toContain("no holiday policy for this client pays 2026-11-26 as a holiday not worked");
    }
  });

  it("pays a holiday not worked once a day: twice for one assignment pays once; on two assignments is refused", () => {
    const once = computePay({ ...input([...fourDays(), presence()]), holidayPolicies: [policy()], confirmations: [notWorked(), notWorked({ id: "h2" })] });
    expect(once.blockers).toEqual([]);
    expect(lines(once).filter(([t]) => t === "HOL_NOT_WORKED")).toEqual([["HOL_NOT_WORKED", 480, 15_200]]);
    const two = computePay({ ...input([...fourDays(), presence(), presence({ assignmentId: "a2" })]), holidayPolicies: [policy()], confirmations: [notWorked(), notWorked({ id: "h2", assignmentId: "a2" })] });
    expect(two.payLines).toEqual([]);
    expect(messages(two)).toContain("confirmed on two assignments for the same day");
  });

  it("uses the client's own policy over the agency's", () => {
    const r = computePay({ ...input(THANKS.map((d) => ma(d, 480))), holidayPolicies: [policy(), policy({ clientId: "c1", name: "Client holidays", workedMultiplier: { num: 2, den: 1 } })] });
    expect(lines(r)).toEqual([
      ["REG", 2400, 76_000],
      ["HOL", 480, 15_200],
    ]);
    expect(r.payLines[1]!.explain).toContain('"Client holidays"');
  });

  it("bills what the policy bills, even when it pays no premium", () => {
    const worked = computePay({ ...input(THANKS.map((d) => ma(d, 480))), holidayPolicies: [policy({ workedMultiplier: { num: 1, den: 1 }, billWorkedMultiplier: { num: 2, den: 1 } })] });
    expect(lines(worked)).toEqual([["REG", 2400, 76_000]]);
    expect(lines(worked, "billLines")).toEqual([
      ["REG", 2400, 108_000],
      ["HOL", 480, 21_600],
    ]);
    const off = computePay({ ...input([...fourDays(), presence()]), holidayPolicies: [policy({ billNotWorked: true })], confirmations: [notWorked()] });
    expect(lines(off, "billLines")).toEqual([
      ["REG", 1920, 86_400],
      ["HOL_NOT_WORKED", 480, 21_600],
    ]);
  });

  it("stops on bad or conflicting holiday policies instead of picking one", () => {
    const twice = computePay({ ...input(THANKS.map((d) => ma(d, 480))), holidayPolicies: [policy(), policy({ name: "Again" })] });
    expect(twice.payLines).toEqual([]);
    expect(twice.blockers.map((b) => b.code)).toEqual(["rule_data_invalid"]);
    expect(messages(twice)).toContain("both list 2026-11-26");
    const below = computePay({ ...input(THANKS.map((d) => ma(d, 480))), holidayPolicies: [policy({ workedMultiplier: { num: 1, den: 2 } })] });
    expect(below.blockers.map((b) => b.code)).toEqual(["rule_data_invalid"]);
  });

  it("refuses a bonus or a confirmation for a week with no hours, instead of dropping it", () => {
    const r = computePay({
      ...input([shift(WEEK[0]!, 480)]),
      bonuses: [{ id: "b1", workerId: "w1", assignmentId: "a1", workweekStart: "2026-10-12", amountCents: 5000, kind: "nondiscretionary" }],
      confirmations: [{ id: "c1", kind: "meal_period_missed", workerId: "w1", assignmentId: "a1", date: "2026-10-13" }],
    });
    expect(lines(r)).toEqual([["REG", 480, 14_600]]);
    expect(r.blockers).toHaveLength(1);
    expect(r.blockers[0]).toMatchObject({ code: "invalid_input", workerId: "w1", workweekStart: "2026-10-12" });
    expect(r.blockers[0]!.message).toContain("a bonus of $50.00 and a confirmed missed meal period on 2026-10-13 are entered for a week with no hours");
  });

  it("refuses a bonus whose week does not start the workweek, entered twice, or for an assignment with no hours", () => {
    const b = { id: "b1", workerId: "w1", assignmentId: "a1", workweekStart: WEEK[0]!, amountCents: 5000, kind: "nondiscretionary" as const };
    const week = WEEK.slice(0, 5).map((d) => shift(d, 480));
    const tuesday = computePay({ ...input(week), bonuses: [{ ...b, workweekStart: WEEK[1]! }] });
    expect(tuesday.payLines).toEqual([]);
    expect(messages(tuesday)).toContain("not the first day of a workweek");
    const twice = computePay({ ...input(week), bonuses: [b, { ...b, amountCents: 100 }] });
    expect(twice.payLines).toEqual([]);
    expect(messages(twice)).toContain("entered twice");
    const elsewhere = computePay({ ...input(week), bonuses: [{ ...b, assignmentId: "a9" }] });
    expect(elsewhere.payLines).toEqual([]);
    expect(messages(elsewhere)).toContain("for an assignment with no hours this week");
    const zero = computePay({ ...input(week), bonuses: [{ ...b, amountCents: 0 }] });
    expect(messages(zero)).toContain("positive whole number of cents");
  });

  it("explains the regular rate with the bonus in it", () => {
    const shifts = [...WEEK.slice(0, 4).map((d) => shift(d, 540)), shift(WEEK[4]!, 480)];
    const r = computePay({ ...input(shifts), bonuses: [{ id: "b1", workerId: "w1", assignmentId: "a1", workweekStart: WEEK[0]!, amountCents: 5000, kind: "nondiscretionary" }] });
    expect(r.payLines[1]!.explain).toContain("($803.00 earned at straight time + $50.00 nondiscretionary bonus) ÷ 44h 00m worked = $19.3863…/h");
    expect(r.payLines[2]!.explain).toContain("counted in the regular rate, on which this week's overtime is paid");
  });

  it("outside California a flat-sum bonus counts like any nondiscretionary bonus", () => {
    const shifts = [...WEEK.slice(0, 4).map((d) => shift(d, 540)), shift(WEEK[4]!, 480)];
    const r = computePay({ ...input(shifts), bonuses: [{ id: "b1", workerId: "w1", assignmentId: "a1", workweekStart: WEEK[0]!, amountCents: 5000, kind: "flat_sum" }] });
    expect(lines(r)).toEqual([
      ["REG", 2400, 73_000],
      ["OT", 240, 11_177],
      ["BONUS", 0, 5000],
    ]);
  });

  it("California: a flat-sum bonus week explains its own overtime, and pays a missed meal period at the regular rate with the bonus's share (Ferra; Alvarado)", () => {
    const CA_SITE = { jurisdiction: "CA", countyFips: "06071", placeFips: "0653896" } as const;
    const caJ: JurisdictionRule[] = [
      ...JURISDICTIONS.filter((j) => j.jurisdiction !== "CA"),
      ...["weekly_overtime", "ca_daily_overtime", "ca_daily_double_time", "ca_seventh_day", "ca_seventh_day_double_time"].map((ruleCode) => ({ jurisdiction: "CA", ruleCode, effectiveFrom: "2000-01-01", effectiveTo: null, citation: "Cal. Lab. Code § 510(a)" })),
    ];
    const row = (ruleCode: string, kind: OvertimeRule["kind"], thresholdMinutes: number, num: number, den: number, earningType: "OT" | "DT"): OvertimeRule => ({ jurisdiction: "CA", ruleCode, kind, thresholdMinutes, multiplier: { num, den }, earningType, effectiveFrom: "2000-01-01", effectiveTo: null, citation: "Cal. Lab. Code § 510(a)" });
    const caOt = [...OT_RULES.filter((o) => o.jurisdiction !== "CA"), row("weekly_overtime", "weekly", 2400, 3, 2, "OT"), row("ca_daily_overtime", "daily", 480, 3, 2, "OT"), row("ca_daily_double_time", "daily_double", 720, 2, 1, "DT"), row("ca_seventh_day", "seventh_day", 0, 3, 2, "OT"), row("ca_seventh_day_double_time", "seventh_day", 480, 2, 1, "DT")];
    const premiums: PremiumRule[] = [{ jurisdiction: "CA", ruleCode: "ca_meal_premium", premiumMinutes: 60, perWorkdayMax: 1, effectiveFrom: "2000-01-01", effectiveTo: null, citation: "Cal. Lab. Code § 226.7(c)" }];
    const G1 = ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"];
    const shifts = [480, 600, 780, 480, 480, 360, 600].map((m, i) => shift(G1[i]!, m, { ...CA_SITE, payRateCents: 1800, billRateCents: 2600 }));
    const r = computePay({
      ...input(shifts, { workweekStartsOn: 0, overtimeRules: caOt, jurisdictionRules: caJ, premiumRules: premiums }),
      bonuses: [{ id: "b1", workerId: "w1", assignmentId: "a1", workweekStart: G1[0]!, amountCents: 5000, kind: "flat_sum" }],
      confirmations: [{ id: "m1", kind: "meal_period_missed", workerId: "w1", assignmentId: "a1", date: G1[1]! }],
    });
    expect(r.blockers).toEqual([]);
    const byType = Object.fromEntries(r.payLines.filter((l) => ["MEAL_PREMIUM", "BONUS", "BONUS_OT"].includes(l.type)).map((l) => [l.type, l]));
    expect(byType.MEAL_PREMIUM).toMatchObject({ minutes: 60, amountCents: 1925 });
    expect(byType.MEAL_PREMIUM!.explain).toContain("with the $50.00 flat-sum bonus spread over the 40h 00m not paid at a premium");
    expect(byType.BONUS).toMatchObject({ ruleId: "ca_flat_sum_bonus", amountCents: 5000 });
    expect(byType.BONUS_OT).toMatchObject({ ruleId: "ca_flat_sum_bonus", minutes: 1380, amountCents: 4500 });
    expect(byType.BONUS_OT!.explain).toContain("$50.00 ÷ 40h 00m not paid at a premium = $1.25/h; 20h 00m × 1.5 × $1.25 + 3h 00m × 2 × $1.25 = 4500¢ exactly → $45.00");
    expect(r.payLines.find((l) => l.type === "OT")!.explain).toContain("The flat-sum bonus is not in this rate");
  });
});
