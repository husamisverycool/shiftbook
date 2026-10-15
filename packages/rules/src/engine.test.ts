import { describe, expect, it } from "vitest";
import { computePay } from "./engine";
import type { JurisdictionRule, OvertimeRule, PayInput, Shift } from "./types";

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
    date,
    startMinute: 420,
    minutes,
    payRateCents: 1825,
    billRateCents: 2650,
    billOtMultiplier: { num: 3, den: 2 },
    otBillingRule: "multiplier",
    ...over,
  };
}
const input = (shifts: Shift[], extra: Partial<PayInput> = {}): PayInput => ({
  workweekStartsOn: 1, // Monday
  shifts,
  overtimeRules: OT_RULES,
  jurisdictionRules: JURISDICTIONS,
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
  it("blocks California weeks until the California rules are implemented", () => {
    const r = computePay(input([shift(WEEK[0]!, 600, { jurisdiction: "CA" })]));
    expect(r.payLines).toEqual([]);
    expect(r.blockers).toEqual([
      expect.objectContaining({ code: "rule_not_supported_yet", jurisdiction: "CA", ruleCode: "ca_daily_overtime", workerId: "w1" }),
    ]);
  });

  it("blocks an unknown jurisdiction", () => {
    const r = computePay(input([shift(WEEK[0]!, 480, { jurisdiction: "TX" })]));
    expect(r.payLines).toEqual([]);
    expect(r.blockers).toEqual([expect.objectContaining({ code: "unknown_jurisdiction", jurisdiction: "TX" })]);
  });

  it("blocks overtime weeks with more than one pay rate (regular-rate blending comes in slice c)", () => {
    const shifts = [
      ...WEEK.slice(0, 4).map((d) => shift(d, 480, { assignmentId: "aA" })),
      shift(WEEK[4]!, 600, { assignmentId: "aB", payRateCents: 2000 }),
    ];
    const r = computePay(input(shifts));
    expect(r.payLines).toEqual([]);
    expect(r.blockers).toEqual([expect.objectContaining({ code: "multiple_pay_rates_with_overtime", workerId: "w1" })]);
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

describe("computePay — effective dating", () => {
  it("uses the rule row in effect for that workweek", () => {
    const rules: OvertimeRule[] = [
      ...OT_RULES.map((r) => (r.jurisdiction === "US" ? { ...r, effectiveTo: "2026-12-31" } : r)).filter((r) => r.jurisdiction !== "IL"),
      { ...OT_RULES[0]!, thresholdMinutes: 2100, effectiveFrom: "2027-01-01", citation: "hypothetical future rule" },
    ];
    const jur = JURISDICTIONS.filter((j) => j.jurisdiction !== "IL").concat({ ...JURISDICTIONS[1]! });
    const r2026 = computePay(input(WEEK.slice(0, 5).map((d) => shift(d, 480)), { overtimeRules: rules, jurisdictionRules: jur }));
    expect(r2026.payLines.map((l) => l.type)).toEqual(["REG"]);
    const jan = ["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07", "2027-01-08"];
    const r2027 = computePay(input(jan.map((d) => shift(d, 480)), { overtimeRules: rules, jurisdictionRules: jur }));
    expect(r2027.payLines.map((l) => [l.type, l.minutes])).toEqual([
      ["REG", 2100],
      ["OT", 300],
    ]);
  });
});
