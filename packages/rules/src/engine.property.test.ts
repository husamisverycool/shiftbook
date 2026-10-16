/**
 * Random weeks (slice (c) plan, "Done means" 3): whatever the hours, rates and order, the engine's
 * pay is never below the federal minimum it owes, never depends on input order, keeps every worked
 * minute exactly once, rounds each line once, and never rounds the regular rate.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computePay } from "./engine";
import { roundHalfUpBig } from "./int";
import type { Fraction, JurisdictionRule, MinimumWageRule, OvertimeRule, PayInput, RegularRateRule, Shift } from "./types";

const since = "2000-01-01";
const ot = (jurisdiction: string, ruleCode: string, kind: OvertimeRule["kind"], thresholdMinutes: number, num: number, den: number, earningType: "OT" | "DT"): OvertimeRule => ({ jurisdiction, ruleCode, kind, thresholdMinutes, multiplier: { num, den }, earningType, effectiveFrom: since, effectiveTo: null, citation: "test" });
const RULES: Pick<PayInput, "overtimeRules" | "jurisdictionRules" | "minimumWageRules"> & { regularRateRules: RegularRateRule[] } = {
  overtimeRules: [
    ot("US", "weekly_overtime", "weekly", 2400, 3, 2, "OT"),
    ot("IL", "weekly_overtime", "weekly", 2400, 3, 2, "OT"),
    ot("CA", "weekly_overtime", "weekly", 2400, 3, 2, "OT"),
    ot("CA", "ca_daily_overtime", "daily", 480, 3, 2, "OT"),
    ot("CA", "ca_daily_double_time", "daily_double", 720, 2, 1, "DT"),
    ot("CA", "ca_seventh_day", "seventh_day", 0, 3, 2, "OT"),
    ot("CA", "ca_seventh_day_double_time", "seventh_day", 480, 2, 1, "DT"),
  ],
  jurisdictionRules: [
    ...["weekly_overtime", "minimum_wage"].map((ruleCode): JurisdictionRule => ({ jurisdiction: "US", ruleCode, effectiveFrom: since, effectiveTo: null, citation: "test" })),
    ...["weekly_overtime", "minimum_wage"].map((ruleCode): JurisdictionRule => ({ jurisdiction: "IL", ruleCode, effectiveFrom: since, effectiveTo: null, citation: "test" })),
    ...["weekly_overtime", "minimum_wage", "ca_daily_overtime", "ca_daily_double_time", "ca_seventh_day", "ca_seventh_day_double_time"].map((ruleCode): JurisdictionRule => ({ jurisdiction: "CA", ruleCode, effectiveFrom: since, effectiveTo: null, citation: "test" })),
  ],
  minimumWageRules: [
    { jurisdiction: "US", rateCents: 725, effectiveFrom: since, effectiveTo: null, citation: "test" },
    { jurisdiction: "IL", rateCents: 1500, effectiveFrom: since, effectiveTo: null, citation: "test" },
    { jurisdiction: "CA", rateCents: 1690, effectiveFrom: since, effectiveTo: null, citation: "test" },
  ] satisfies MinimumWageRule[],
  regularRateRules: [{ jurisdiction: "US", ruleCode: "premium_excluded_from_regular_rate", multiplier: { num: 3, den: 2 }, effectiveFrom: since, effectiveTo: null, citation: "test" }],
};

const IL = { jurisdiction: "IL", countyFips: "17197", placeFips: "1738570" } as const; // Joliet
const CA = { jurisdiction: "CA", countyFips: "06071", placeFips: "0653896" } as const; // Ontario
const MON = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
const SUN = ["2026-10-04", ...MON.slice(0, 6)];

/** One worker's week: up to three assignments, up to two shifts a day, whole minutes. */
const week = (site: typeof IL | typeof CA) =>
  fc
    .array(
      fc.record({
        day: fc.integer({ min: 0, max: 6 }),
        start: fc.integer({ min: 0, max: 1380 }),
        minutes: fc.integer({ min: 1, max: 720 }),
        job: fc.integer({ min: 0, max: 2 }),
      }),
      { minLength: 1, maxLength: 12 },
    )
    .chain((raw) => fc.tuple(fc.constant(raw), fc.array(fc.integer({ min: 1700, max: 4000 }), { minLength: 3, maxLength: 3 }), fc.array(fc.integer({ min: 2400, max: 6000 }), { minLength: 3, maxLength: 3 })))
    .map(([raw, pay, bill]) => {
      const days = site === CA ? SUN : MON;
      // Keep shifts within the day and non-overlapping: lay each day's shifts end to end.
      const byDay = new Map<number, number>();
      const shifts: Shift[] = [];
      raw.forEach((r, i) => {
        const start = Math.max(byDay.get(r.day) ?? 0, r.start);
        const minutes = Math.min(r.minutes, 1440 - start);
        if (minutes <= 0) return;
        byDay.set(r.day, start + minutes);
        shifts.push({
          entryIds: [`e${i}`],
          workerId: "w1",
          workerName: "Random Worker",
          assignmentId: `a${r.job}`,
          clientId: `c${r.job}`,
          ...site,
          date: days[r.day]!,
          startMinute: start,
          minutes,
          payRateCents: pay[r.job]!,
          billRateCents: bill[r.job]!,
          billOtMultiplier: { num: 3, den: 2 },
          billDtMultiplier: { num: 2, den: 1 },
          otBillingRule: "multiplier",
        });
      });
      return shifts;
    })
    .filter((s) => s.length > 0);

const input = (shifts: Shift[], site: typeof IL | typeof CA): PayInput => ({ workweekStartsOn: site === CA ? 0 : 1, shifts, ...RULES });
const total = (r: ReturnType<typeof computePay>) => r.payLines.reduce((sum, l) => sum + l.amountCents, 0);
const minutesOf = (r: ReturnType<typeof computePay>, types: string[]) => r.payLines.filter((l) => types.includes(l.type)).reduce((sum, l) => sum + l.minutes, 0);
const lineCents = (minutes: number, rate: Fraction) => roundHalfUpBig(BigInt(minutes) * BigInt(rate.num), 60n * BigInt(rate.den));

/** The federal floor, computed independently: straight time at each rate plus half the weighted regular rate per minute over 40 hours. */
function federal(shifts: Shift[]): number {
  const minutes = shifts.reduce((sum, s) => sum + s.minutes, 0);
  const earned = shifts.reduce((sum, s) => sum + BigInt(s.minutes) * BigInt(s.payRateCents), 0n); // 60 × cents
  const over = BigInt(Math.max(0, minutes - 2400));
  // straight (earned / 60) + over × ½ × (earned / minutes) / 60, exact, then floored to cents
  return Number((earned * BigInt(minutes) * 2n + over * earned) / (120n * BigInt(minutes)));
}

describe("computePay — random weeks", () => {
  for (const site of [IL, CA]) {
    it(`${site.jurisdiction}: pays every worked minute once, at least the federal amount, the same in any order`, () => {
      fc.assert(
        fc.property(week(site), fc.integer(), (shifts, seed) => {
          const r = computePay(input(shifts, site));
          expect(r.blockers).toEqual([]);
          // Every worked minute once, as regular, overtime or double time.
          expect(minutesOf(r, ["REG", "OT", "DT"])).toBe(shifts.reduce((sum, s) => sum + s.minutes, 0));
          // Never below the federal floor (each line rounds once: allow a cent a line).
          expect(total(r)).toBeGreaterThanOrEqual(federal(shifts) - r.payLines.length);
          // Each line is minutes × rate rounded once; bill minutes mirror pay minutes by type.
          for (const l of [...r.payLines, ...r.billLines]) expect(l.amountCents).toBe(lineCents(l.minutes, l.rate));
          for (const t of ["REG", "OT", "DT"]) expect(r.billLines.filter((l) => l.type === t).reduce((s, l) => s + l.minutes, 0)).toBe(minutesOf(r, [t]));
          // The same answer in any order.
          const shuffled = shifts.map((s, i) => ({ s, i, k: (i * 7919 + Math.abs(seed)) % 104_729 })).sort((a, b) => a.k - b.k || b.i - a.i).map((x) => x.s);
          expect(computePay(input(shuffled, site))).toEqual(r);
        }),
        { numRuns: 300 },
      );
    });
  }

  it("never rounds the regular rate: an overtime line's rate is its own rate + ½ × the exact weighted average", () => {
    fc.assert(
      fc.property(week(IL), (shifts) => {
        const r = computePay(input(shifts, IL));
        const minutes = shifts.reduce((sum, s) => sum + s.minutes, 0);
        const earned = shifts.reduce((sum, s) => sum + s.minutes * s.payRateCents, 0); // every rate is above Illinois's $15.00
        for (const l of r.payLines.filter((x) => x.type === "OT")) {
          const own = r.payLines.find((x) => x.type === "REG" && x.assignmentId === l.assignmentId)?.rate ?? { num: shifts.find((s) => s.assignmentId === l.assignmentId)!.payRateCents, den: 1 };
          // rate = own + ½ × earned / minutes, compared as exact fractions
          const lhs = BigInt(l.rate.num) * BigInt(own.den) * 2n * BigInt(minutes);
          const rhs = (BigInt(own.num) * 2n * BigInt(minutes) + BigInt(earned) * BigInt(own.den)) * BigInt(l.rate.den);
          expect(lhs).toBe(rhs);
        }
      }),
      { numRuns: 300 },
    );
  });
});
