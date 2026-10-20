import { describe, expect, it } from "vitest";
import { ruleUpdates } from "./rule-updates";

/** The website's "rule changes, before they happen" card (slice aa) reads the dated rule tables. */
describe("the website's rule changes", () => {
  const rows = ruleUpdates("2026-10-20");

  it("lists the changes still to come first, nearest first, with the days left", () => {
    const upcoming = rows.filter((r) => r.daysUntil > 0);
    expect(upcoming.map((r) => [r.state, r.scope, r.rateCents, r.effectiveFrom, r.daysUntil])).toEqual([
      ["CA", null, 1740, "2027-01-01", 73],
      ["NJ", null, 1648, "2027-01-01", 73],
    ]);
  });

  it("then the latest that took effect, newest first; four rows at most, each with its law", () => {
    expect(rows).toHaveLength(4);
    expect(rows.slice(2).map((r) => [r.scope, r.rateCents, r.daysUntil <= 0])).toEqual([
      ["City of Chicago", 1705, true],
      ["Cook County", 1540, true],
    ]);
    for (const r of rows) expect(r.citation.length).toBeGreaterThan(10);
  });
});
