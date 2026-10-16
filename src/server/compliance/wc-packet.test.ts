import { describe, expect, it } from "vitest";
import { packet, type PacketLine } from "./wc-packet";

const OT = { num: 3, den: 2 };
const DT = { num: 2, den: 1 };
const line = (over: Partial<PacketLine>): PacketLine => ({ workerId: "w", workerName: "W", state: "IL", classCode: "3632", type: "REG", minutes: 0, amountCents: 0, multiplier: null, ...over });

describe("the workers' comp packet (decision J7; NCRB Rule 2-C-2-a: the overtime premium apart by worker and by class)", () => {
  const lines = [
    line({ workerId: "mb", workerName: "Marcus Bell", type: "REG", minutes: 2400, amountCents: 73_000 }),
    line({ workerId: "mb", workerName: "Marcus Bell", type: "OT", minutes: 360, amountCents: 16_425, multiplier: OT }),
    line({ workerId: "ap", workerName: "Anita Patel", type: "REG", minutes: 1440, amountCents: 43_800 }),
    line({ workerId: "jc", workerName: "Jasmine Carter", state: "CA", classCode: "8292", type: "REG", minutes: 2400, amountCents: 78_000 }),
    line({ workerId: "jc", workerName: "Jasmine Carter", state: "CA", classCode: "8292", type: "OT", minutes: 120, amountCents: 5850, multiplier: OT }),
    line({ workerId: "jc", workerName: "Jasmine Carter", state: "CA", classCode: "8292", type: "DT", minutes: 60, amountCents: 3900, multiplier: DT }),
    line({ workerId: "jc", workerName: "Jasmine Carter", state: "CA", classCode: "8292", type: "HOL_NOT_WORKED", minutes: 480, amountCents: 15_600 }),
    line({ workerId: "kt", workerName: "Kevin Tran", state: "CA", classCode: null, type: "REG", minutes: 300, amountCents: 10_000 }),
  ];

  it("straight time and each premium apart, rounded once per worker and class; missing classes apart and out of the totals", () => {
    const p = packet(lines, "state");
    // Marcus: OT $164.25 at 3/2 → premium 1/3 = $54.75, straight $109.50 + REG $730.00 = $839.50.
    // Jasmine: OT $58.50 → premium $19.50; DT $39.00 at 2/1 → premium $19.50; straight $780.00 + $39.00 + $19.50 = $838.50; holiday $156.00 other.
    expect(p.rows.map((r) => [r.state, r.classCode, r.workerName, r.minutes, r.straightCents, r.otPremiumCents, r.dtPremiumCents, r.otherCents, r.totalCents])).toEqual([
      ["CA", "8292", "Jasmine Carter", 2580, 83_850, 1950, 1950, 15_600, 103_350],
      ["IL", "3632", "Anita Patel", 1440, 43_800, 0, 0, 0, 43_800],
      ["IL", "3632", "Marcus Bell", 2760, 83_950, 5475, 0, 0, 89_425],
    ]);
    expect(p.missing).toEqual([{ workerId: "kt", workerName: "Kevin Tran", state: "CA", minutes: 300, totalCents: 10_000 }]);
    expect(p.classes.map((c) => [c.state, c.classCode, c.straightCents, c.otPremiumCents, c.totalCents])).toEqual([
      ["CA", "8292", 83_850, 1950, 103_350],
      ["IL", "3632", 127_750, 5475, 133_225],
    ]);
    expect(p.totals).toEqual({ minutes: 6780, straightCents: 211_600, otPremiumCents: 7425, dtPremiumCents: 1950, otherCents: 15_600, totalCents: 236_575 });
    // Everything paid, missing classes included, for the tie-out with the payroll runs.
    expect(p.allPayCents).toBe(246_575);
    expect(p.rows[2]!.explain).toBe("Regular $730.00; overtime $164.25 at 3/2, its premium (1/3) $54.75; straight time $839.50 + overtime premium $54.75 = $894.25, each premium rounded half up once.");
    expect(p.rows[0]!.explain).toBe("Regular $780.00; overtime $58.50 at 3/2, its premium (1/3) $19.50; double time $39.00 at 2/1, its premium (1/2) $19.50; other pay $156.00 (HOL_NOT_WORKED); straight time $838.50 + overtime premium $19.50 + double-time premium $19.50 + other pay $156.00 = $1,033.50, each premium rounded half up once.");
  });

  it("class first; a premium of part cents rounds half up once; no multiplier on file counts all of it as straight time and says so", () => {
    const odd = packet([line({ type: "OT", minutes: 60, amountCents: 10_001, multiplier: OT })], "class");
    // $100.01 × 1/3 = $33.3366… → $33.34; straight $66.67.
    expect(odd.rows.map((r) => [r.straightCents, r.otPremiumCents, r.totalCents])).toEqual([[6667, 3334, 10_001]]);
    const none = packet([line({ type: "OT", minutes: 60, amountCents: 3000, multiplier: null })], "class");
    expect(none.rows[0]).toMatchObject({ straightCents: 3000, otPremiumCents: 0 });
    expect(none.rows[0]!.explain).toContain("overtime $30.00 with no overtime multiplier on file: counted as straight time");
    expect(odd.rows[0]!.explain).toContain("its premium (1/3) $33.3366… → $33.34");
    expect(packet(lines, "class").classes.map((c) => c.classCode)).toEqual(["3632", "8292"]);
  });

  it("a year of weekly overtime lines stays exact and its explain stays short (one fraction per multiplier, in lowest terms)", () => {
    // 52 weeks of $164.25 at 3/2 = $8,541.00, premium 1/3 = $2,847.00 exactly; and 7/4 lines too.
    const year = Array.from({ length: 52 }, () => line({ type: "OT", minutes: 360, amountCents: 16_425, multiplier: OT }));
    const odd = Array.from({ length: 52 }, () => line({ type: "OT", minutes: 60, amountCents: 3501, multiplier: { num: 7, den: 4 } }));
    const p = packet([...year, ...odd], "state");
    // 52 × $35.01 = $1,820.52 at 7/4: premium 3/7 = $780.2228… → $780.22. Total $10,361.52; straight $10,361.52 − $3,627.22 = $6,734.30.
    expect(p.rows.map((r) => [r.otPremiumCents, r.straightCents, r.totalCents])).toEqual([[284_700 + 78_022, 854_100 + 182_052 - 284_700 - 78_022, 854_100 + 182_052]]);
    expect(p.rows[0]!.explain).toBe("overtime $8,541.00 at 3/2, its premium (1/3) $2,847.00; overtime $1,820.52 at 7/4, its premium (3/7) $780.2228… → $780.22; straight time $6,734.30 + overtime premium $3,627.22 = $10,361.52, each premium rounded half up once.");
  });

  it("a negative correction line lowers the worker's figures; bonus overtime is premium", () => {
    const p = packet([line({ type: "REG", minutes: 600, amountCents: 18_250 }), line({ type: "REG", minutes: -60, amountCents: -1825 }), line({ type: "BONUS_OT", minutes: 0, amountCents: 1200 })], "state");
    expect(p.rows.map((r) => [r.minutes, r.straightCents, r.otPremiumCents, r.totalCents])).toEqual([[540, 16_425, 1200, 17_625]]);
  });
});
