import { describe, expect, it } from "vitest";
import { payLineAnatomy } from "./pay-line-anatomy";

/**
 * The website's "one pay line, taken apart" shows the engine's own figures. By hand: Mon 10h, Wed 9h, Fri
 * 13h are 2h + 1h + 4h over 8 (Friday's 13th hour is double time) = 7h = 420 min; 1.5 × $18.25 = $27.375/h;
 * 420 × 2737.5¢ / 60 = 19,162.5¢, rounded half up once = $191.63.
 */
describe("the website's pay line, taken apart", () => {
  const a = payLineAnatomy();

  it("is California's daily overtime: 7 hours from Monday, Wednesday and Friday", () => {
    expect(a.ruleId).toBe("ca_daily_overtime");
    expect(a.minutes).toBe(420);
    expect(a.days).toEqual([
      { date: "2026-10-05", minutes: 120 },
      { date: "2026-10-07", minutes: 60 },
      { date: "2026-10-09", minutes: 240 },
    ]);
    expect(a.days.reduce((n, d) => n + d.minutes, 0)).toBe(a.minutes);
    expect(a.thresholdMinutes).toBe(480);
  });

  it("carries the engine's rate, exact arithmetic and one rounding", () => {
    expect(a.multiplier).toBe("1.5");
    expect(a.baseRateCents).toBe(1825);
    expect(a.rate).toBe("$27.375/h");
    expect(a.exactCents).toBe("19162.5");
    expect(a.rounded).toBe(true);
    expect(a.amountCents).toBe(19163);
    expect(a.explain).toContain("19162.5");
  });

  it("names the law", () => {
    expect(a.citation).toBe("Cal. Lab. Code § 510(a)");
  });
});
