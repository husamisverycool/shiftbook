import { describe, expect, it } from "vitest";
import { formatPermille, groupLines, marginPermille, totalsOf, weeksBetween, type MarginLine } from "./margin";

const line = (over: Partial<MarginLine>): MarginLine => ({
  key: "a|2026-10-05",
  assignmentId: "a",
  workerId: "w1",
  workerName: "Marcus Bell",
  clientId: "plm",
  clientName: "Prairie Line",
  week: "2026-10-05",
  recruiterId: null,
  recruiterName: null,
  branchId: "main",
  branchName: "Main office",
  minutesPaid: 2760,
  billedCents: 129_850,
  payCents: 89_425,
  burdenCents: 18_000,
  incomplete: false,
  details: [],
  ...over,
});

describe("margin rows and groups (decisions I4, I5)", () => {
  it("gross margin = billed − pay − burden; margin % of billed to one decimal, half up; none with nothing billed", () => {
    const t = totalsOf([line({})]);
    // 1,298.50 − 894.25 − 180.00 = 224.25; 224.25 ÷ 1,298.50 = 17.27…% → 17.3%.
    expect(t).toEqual({ minutesPaid: 2760, billedCents: 129_850, payCents: 89_425, burdenCents: 18_000, marginCents: 22_425, marginPermille: 173, incomplete: 0 });
    expect(marginPermille(5, 1000)).toBe(5);
    expect(marginPermille(-22_425, 129_850)).toBe(-173);
    expect(marginPermille(100, 0)).toBeNull();
    expect(formatPermille(173)).toBe("17.3%");
    expect(formatPermille(-50)).toBe("-5.0%");
    expect(formatPermille(1000)).toBe("100.0%");
  });

  it("groups by client, worker, recruiter, branch or week; rows without one go to None so totals tie; sorted by margin or margin %", () => {
    const lines = [
      line({}),
      line({ key: "b|2026-10-05", assignmentId: "b", workerId: "w2", workerName: "Anita Patel", recruiterId: "r1", recruiterName: "Lena Ortiz", billedCents: 63_600, payCents: 42_000, burdenCents: 8000, minutesPaid: 1440 }),
      line({ key: "c|2026-09-28", assignmentId: "c", workerId: "w3", workerName: "Kai Brooks", clientId: "pcd", clientName: "Pacific Crest", week: "2026-09-28", branchId: null, branchName: null, billedCents: 10_000, payCents: 9000, burdenCents: 2000, incomplete: true }),
    ];
    const byClient = groupLines(lines, "client", "margin");
    expect(byClient.map((g) => [g.name, g.totals.marginCents, g.lines.length])).toEqual([
      ["Prairie Line", 22_425 + 13_600, 2],
      ["Pacific Crest", -1000, 1],
    ]);
    expect(groupLines(lines, "recruiter", "margin").map((g) => [g.key, g.name, g.totals.marginCents])).toEqual([
      ["none", null, 22_425 - 1000],
      ["r1", "Lena Ortiz", 13_600],
    ]);
    // By margin %: Anita 21.4%, Marcus 17.3%, Kai -10.0%.
    expect(groupLines(lines, "worker", "percent").map((g) => [g.name, g.totals.marginPermille])).toEqual([
      ["Anita Patel", 214],
      ["Marcus Bell", 173],
      ["Kai Brooks", -100],
    ]);
    expect(groupLines(lines, "branch", "margin").map((g) => g.name)).toEqual(["Main office", null]);
    expect(groupLines(lines, "week", "margin").map((g) => g.key)).toEqual(["2026-10-05", "2026-09-28"]);
    expect(totalsOf(lines).incomplete).toBe(1);
  });

  it("the weeks of a period, oldest first", () => {
    expect(weeksBetween("2026-09-21", "2026-10-05")).toEqual(["2026-09-21", "2026-09-28", "2026-10-05"]);
  });
});
