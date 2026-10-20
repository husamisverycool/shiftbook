import { describe, expect, it } from "vitest";
import { RULE_BOOKS, ruleIndex } from "./rule-index";

/** The website lists every rule the engine pays by, read from the dated tables (slice aa). */
describe("the website's index of rules", () => {
  const index = ruleIndex("2026-10-20");
  const book = (b: (typeof RULE_BOOKS)[number]) => index.find((i) => i.book === b)!;
  const rule = (b: (typeof RULE_BOOKS)[number], code: string, scope: string | null = null) => book(b).rules.find((r) => r.code === code && r.scope === scope);

  it("has the federal book and the four states, each with weekly overtime and a minimum wage", () => {
    expect(index.map((i) => i.book)).toEqual(["US", "CA", "IL", "MA", "NJ"]);
    for (const i of index) {
      expect(rule(i.book, "weekly_overtime")).toBeDefined();
      expect(rule(i.book, "minimum_wage")?.rateCents).toBeGreaterThan(0);
    }
  });

  it("dates today's minimum wages and the ones on file for later", () => {
    expect(rule("CA", "minimum_wage")).toMatchObject({ rateCents: 1690, since: "2026-01-01", next: { from: "2027-01-01", rateCents: 1740 } });
    expect(rule("NJ", "minimum_wage")).toMatchObject({ rateCents: 1592, since: "2026-01-01", next: { from: "2027-01-01", rateCents: 1648 } });
    expect(rule("IL", "minimum_wage", "City of Chicago")).toMatchObject({ rateCents: 1705, since: "2026-07-01", next: null });
    expect(rule("US", "minimum_wage")).toMatchObject({ rateCents: 725, since: "2009-07-24" });
  });

  it("carries California's daily rules, premiums and reporting time, with the premiums' new version dated", () => {
    for (const code of ["ca_daily_overtime", "ca_daily_double_time", "ca_seventh_day", "ca_reporting_time"]) expect(rule("CA", code)?.since).toBeNull();
    expect(rule("CA", "ca_meal_premium")?.next?.from).toBe("2027-01-01");
    expect(rule("CA", "ca_daily_overtime")?.citation).toBe("Cal. Lab. Code § 510(a)");
  });

  it("names each state's short-day rule and the Illinois equal-pay rule", () => {
    expect(rule("IL", "il_day_labor_minimum")).toBeDefined();
    expect(rule("IL", "il_dtlsa_equal_pay")?.since).toBe("2024-08-09");
    expect(rule("MA", "ma_reporting_pay")).toBeDefined();
    expect(rule("NJ", "nj_sent_not_used")?.since).toBe("2024-09-16");
  });

  it("counts the California places held for a person", () => {
    expect(book("CA").heldPlaces).toBeGreaterThan(30);
    expect(book("IL").heldPlaces).toBe(0);
  });
});
