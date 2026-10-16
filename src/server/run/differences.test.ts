import { describe, expect, it } from "vitest";
import { differences, settlement, type LineForDiff } from "./differences";

const reg = (minutes: number, amountCents: number, extra: Partial<LineForDiff> = {}): LineForDiff => ({
  workerId: "w1",
  assignmentId: "a1",
  workweekStart: "2026-10-05",
  type: "REG",
  minutes,
  amountCents,
  rate: { num: 1825, den: 1 },
  timeEntryIds: ["e1"],
  ...extra,
});

describe("differences between a correction and the version it corrects (decision E8)", () => {
  it("nothing changed: no differences", () => {
    expect(differences([reg(1440, 43_800)], [reg(1440, 43_800)], { baseVersion: 1 })).toEqual([]);
  });

  it("two more hours at the same rate: one line with was, now and the difference in its explain", () => {
    const [line, ...rest] = differences([reg(1440, 43_800)], [reg(1560, 47_450, { timeEntryIds: ["e1", "e2"] })], { baseVersion: 1 });
    expect(rest).toEqual([]);
    expect(line).toMatchObject({ workerId: "w1", assignmentId: "a1", type: "REG", minutes: 120, amountCents: 3650, was: { minutes: 1440, amountCents: 43_800 }, now: { minutes: 1560, amountCents: 47_450 }, wasLines: 1, nowLines: 1 });
    expect(line!.timeEntryIds).toEqual(["e1", "e2"]);
    expect(line!.explain).toBe(
      "Regular at $18.25/h, workweek starting 2026-10-05: was 24h 00m (1440 min) = $438.00 in version 1; now 26h 00m (1560 min) = $474.50; difference +2h 00m (+120 min) = +$36.50 (each amount rounded once on its own line; the difference is not rounded again).",
    );
  });

  it("the same rate written two ways is the same rate", () => {
    expect(differences([reg(1440, 43_800)], [reg(1440, 43_800, { rate: { num: 3650, den: 2 } })], { baseVersion: 1 })).toEqual([]);
  });

  it("a rate change is hours taken off the old rate and put on the new one", () => {
    const out = differences([reg(480, 14_600)], [reg(480, 15_200, { rate: { num: 1900, den: 1 } })], { baseVersion: 2 });
    expect(out.map((l) => [l.rate, l.minutes, l.amountCents])).toEqual([
      [{ num: 1825, den: 1 }, -480, -14_600],
      [{ num: 1900, den: 1 }, 480, 15_200],
    ]);
    expect(out[0]!.explain).toContain("now 0h 00m (0 min) = $0.00; difference −8h 00m (−480 min) = −$146.00");
    expect(out[0]!.explain).toContain("in version 2");
  });

  it("a line no longer in the period is taken off whole; a new one is added whole", () => {
    const out = differences([reg(480, 14_600)], [reg(480, 14_600, { assignmentId: "a2" })], { baseVersion: 1 });
    expect(out.map((l) => [l.assignmentId, l.minutes])).toEqual([
      ["a1", -480],
      ["a2", 480],
    ]);
  });

  it("bill lines are compared per client as well", () => {
    const bill = (clientId: string, minutes: number, amountCents: number) => reg(minutes, amountCents, { clientId, rate: { num: 2650, den: 1 } });
    const out = differences([bill("c1", 480, 21_200)], [bill("c1", 480, 21_200), bill("c2", 60, 2650)], { baseVersion: 1 });
    expect(out.map((l) => [l.clientId, l.minutes, l.amountCents])).toEqual([["c2", 60, 2650]]);
  });

  it("orders lines by worker, assignment, workweek, earning type, then rate", () => {
    const ot = (minutes: number, amountCents: number) => reg(minutes, amountCents, { type: "OT", rate: { num: 5475, den: 2 } });
    const out = differences([], [ot(60, 2738), reg(60, 1825), reg(60, 1825, { workweekStart: "2026-09-28" })], { baseVersion: 1 });
    expect(out.map((l) => [l.workweekStart, l.type])).toEqual([
      ["2026-09-28", "REG"],
      ["2026-10-05", "REG"],
      ["2026-10-05", "OT"],
    ]);
  });
});

describe("how a worker's differences are settled (decision E9)", () => {
  type T = "REG" | "OT" | "BONUS";
  const at = (type: T, num: number, minutes: number, amountCents: number, more: { week?: string; was?: number; now?: number } = {}) => ({
    type,
    rate: { num, den: 1 },
    minutes,
    amountCents,
    workweekStart: more.week ?? "2026-10-05",
    wasLines: more.was ?? 1,
    nowLines: more.now ?? 1,
  });

  it("all additions: the payroll file carries them, one line per earning type and rate, counting the lines each adds up", () => {
    expect(settlement([at("REG", 1825, 120, 3650), at("BONUS", 2500, 0, 2500, { was: 0 })])).toEqual({
      netCents: 6150,
      additionsOnly: true,
      fileLines: [
        { type: "REG", rate: { num: 1825, den: 1 }, minutes: 120, amountCents: 3650, parts: 2 },
        { type: "BONUS", rate: { num: 2500, den: 1 }, minutes: 0, amountCents: 2500, parts: 1 },
      ],
      leftoverCents: 0,
    });
  });

  it("hours moved between days or assignments of one week at one rate add up to what the file needs, or to nothing", () => {
    expect(settlement([at("REG", 1825, -480, -14_600, { now: 0 }), at("REG", 1825, 540, 16_425, { was: 0 })])).toMatchObject({
      netCents: 1825,
      additionsOnly: true,
      fileLines: [{ type: "REG", rate: { num: 1825, den: 1 }, minutes: 60, amountCents: 1825, parts: 2 }],
    });
    expect(settlement([at("REG", 1825, -480, -14_600, { now: 0 }), at("REG", 1825, 480, 14_600, { was: 0 })])).toMatchObject({ netCents: 0, additionsOnly: true, fileLines: [] });
  });

  it("a cent left over from rounding when hours move at one rate is not a difference to settle", () => {
    // Was 4 min on each of two assignments (4 min × $18.25/h = 121.66…¢ → 122¢ each); now 8 min on a third (243.33…¢ → 243¢).
    const r = settlement([at("REG", 1825, -4, -122, { now: 0 }), at("REG", 1825, -4, -122, { now: 0 }), at("REG", 1825, 8, 243, { was: 0 })]);
    expect(r).toEqual({ netCents: -1, additionsOnly: true, fileLines: [], leftoverCents: -1 });
  });

  it("each workweek stands alone: overtime moved from one week to the next is not netted (29 C.F.R. § 778.104)", () => {
    const r = settlement([at("OT", 2738, -240, -10_950, { week: "2026-10-05", now: 0 }), at("OT", 2738, 240, 10_950, { week: "2026-10-12", was: 0 })]);
    expect(r).toMatchObject({ netCents: 0, additionsOnly: false });
  });

  it("hours taken off one rate and put on another are not all additions, even with more pay overall", () => {
    expect(settlement([at("REG", 1825, -480, -14_600), at("REG", 1900, 480, 15_200)])).toMatchObject({ netCents: 600, additionsOnly: false });
  });

  it("less pay overall", () => {
    expect(settlement([at("REG", 1825, -60, -1825)])).toMatchObject({ netCents: -1825, additionsOnly: false });
  });

  it("a bonus changed by a cent is a real difference (bonuses are not rounded)", () => {
    expect(settlement([at("BONUS", 1, 0, 1)])).toMatchObject({ netCents: 1, fileLines: [expect.objectContaining({ type: "BONUS", amountCents: 1 })], leftoverCents: 0 });
  });
});
