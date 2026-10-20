import { describe, expect, it } from "vitest";
import { SITE_STATES, stateWeek, weekByDay } from "./state-week";

/**
 * The website's "pick a state" week (slice aa) is computed by the real rules engine on the reference rule
 * data, so what the page shows is what the app would pay. These are the hand-checked figures.
 * Week: Mon 10h, Tue 8h, Wed 9h, Thu 8h, Fri 13h at $18.25/h; Saturday scheduled 8h, sent home unused.
 */
const line = (state: (typeof SITE_STATES)[number], type: string) => stateWeek(state).lines.filter((l) => l.type === type);
const minutes = (state: (typeof SITE_STATES)[number], type: string) => line(state, type).reduce((n, l) => n + l.minutes, 0);

describe("the website's sample week, state by state", () => {
  it("covers exactly the states the engine has rules for", () => {
    expect(SITE_STATES).toEqual(["CA", "IL", "MA", "NJ"]);
  });

  it("holds nothing for a person: no blockers in any state", () => {
    for (const s of SITE_STATES) expect(stateWeek(s).blockers).toEqual([]);
  });

  it("Illinois, Massachusetts and New Jersey: 40 regular hours and 8 weekly overtime hours", () => {
    for (const s of ["IL", "MA", "NJ"] as const) {
      expect(minutes(s, "REG")).toBe(40 * 60);
      expect(minutes(s, "OT")).toBe(8 * 60);
      expect(minutes(s, "DT")).toBe(0);
    }
  });

  it("California: daily overtime past 8 hours and double time past 12, then weekly overtime on the rest", () => {
    // Daily OT: Mon 2h, Wed 1h, Fri 4h (8–12) = 7h; double time Fri 1h; regular 40h (48h − 7 − 1), no weekly OT left.
    expect(minutes("CA", "DT")).toBe(60);
    expect(minutes("CA", "OT")).toBe(7 * 60);
    expect(minutes("CA", "REG")).toBe(40 * 60);
  });

  it("pays the Saturday the worker was sent home by each state's own rule", () => {
    const sentHome = (s: (typeof SITE_STATES)[number]) => stateWeek(s).lines.filter((l) => l.date === "2026-10-10").reduce((n, l) => n + l.minutes, 0);
    expect(sentHome("CA")).toBe(4 * 60); // half the 8 scheduled hours, between 2 and 4
    expect(sentHome("MA")).toBe(3 * 60); // 3 hours
    expect(sentHome("IL")).toBe(4 * 60); // 4 hours
    expect(sentHome("NJ")).toBe(4 * 60); // 4 hours
  });

  it("totals are the sum of whole-cent lines, and every line explains itself", () => {
    for (const s of SITE_STATES) {
      const w = stateWeek(s);
      expect(w.totalCents).toBe(w.lines.reduce((n, l) => n + l.amountCents, 0));
      for (const l of w.lines) {
        expect(Number.isInteger(l.amountCents)).toBe(true);
        expect(l.explain.length).toBeGreaterThan(20);
      }
    }
  });

  it("Illinois' total by hand: 40 × $18.25 + 8 × $27.375 + 4 × $18.25", () => {
    expect(stateWeek("IL").totalCents).toBe(73000 + 21900 + 7300);
  });

  it("the chart's days add up to the engine's own lines, type by type", () => {
    for (const s of SITE_STATES) {
      const w = stateWeek(s);
      const days = weekByDay(w);
      const sum = (k: "regular" | "overtime" | "double" | "sentHome") => days.reduce((n, d) => n + d[k], 0);
      expect(sum("regular")).toBe(minutes(s, "REG"));
      expect(sum("overtime")).toBe(minutes(s, "OT"));
      expect(sum("double")).toBe(minutes(s, "DT"));
      expect(sum("sentHome")).toBe(w.lines.filter((l) => l.date !== null).reduce((n, l) => n + l.minutes, 0));
    }
  });
});
