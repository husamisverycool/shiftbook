import { describe, expect, it } from "vitest";
import { overtimeRows } from "./leakage";

const MULT = { OT: { num: 3, den: 2 }, DT: { num: 2, den: 1 } };
const pay = (type: "OT" | "DT", minutes: number, amountCents: number) => ({ workerId: "w1", week: "2026-10-05", type, minutes, amountCents, multiplier: MULT[type] });
const bill = (clientId: string, type: "OT" | "DT", minutes: number, ruleId: string) => ({ workerId: "w1", week: "2026-10-05", clientId, type, minutes, ruleId });

describe("overtime not billed (decision I7)", () => {
  it("billed at the multiplier leaks nothing; at straight time or not billable leaks the premium paid on those minutes", () => {
    // 6 h overtime paid at $39.75 = $238.50; the premium is one third: $79.50.
    const rows = overtimeRows([pay("OT", 360, 23_850)], [bill("plm", "OT", 360, "bill_overtime_straight")]);
    expect(rows).toEqual([
      {
        clientId: "plm",
        workerId: "w1",
        week: "2026-10-05",
        paidMinutes: 360,
        multiplierMinutes: 0,
        straightMinutes: 360,
        notBilledMinutes: 0,
        premiumNotBilledCents: 7950,
        reasons: ["bill_overtime_straight"],
        explain: "Overtime paid this week: 6h 00m for $238.50; its premium (the part above straight time) $79.50. 6h 00m billed at straight time: premium not billed $79.50 × 360/360 min = $79.50.",
        // The working as message keys for the reader's language (decision 0030); the said tests check it says the explain.
        said: expect.any(Array),
      },
    ]);
    expect(overtimeRows([pay("OT", 360, 23_850)], [bill("plm", "OT", 360, "bill_overtime_multiplier")])[0]).toMatchObject({ multiplierMinutes: 360, premiumNotBilledCents: 0, reasons: [] });
  });

  it("a week split between two clients: each client's minutes carry the worker's premium per minute; double time's premium is half", () => {
    // OT 4 h $159.00 (premium $53.00); DT 1 h $53.00 (premium $26.50).
    const rows = overtimeRows(
      [pay("OT", 240, 15_900), pay("DT", 60, 5300)],
      [bill("pcd", "OT", 120, "bill_overtime_multiplier"), bill("plm", "OT", 120, "bill_overtime_own_sites_straight"), bill("plm", "DT", 60, "bill_overtime_not_billable")],
    );
    expect(rows.map((r) => [r.clientId, r.paidMinutes, r.multiplierMinutes, r.straightMinutes, r.notBilledMinutes, r.premiumNotBilledCents, r.reasons])).toEqual([
      ["pcd", 120, 120, 0, 0, 0, []],
      // 53.00 × 120/240 = 26.50 + 26.50 × 60/60 = 26.50 → 53.00.
      ["plm", 180, 0, 120, 60, 5300, ["bill_overtime_own_sites_straight", "bill_overtime_not_billable"]],
    ]);
  });

  it("an overtime line with no multiplier on file carries no premium", () => {
    expect(overtimeRows([{ ...pay("OT", 60, 3000), multiplier: null }], [bill("plm", "OT", 60, "bill_overtime_straight")])[0]!.premiumNotBilledCents).toBe(0);
  });

  it("the premium is rounded once over the whole row", () => {
    // OT 7 min $3.01: premium $1.00333…; 7 of 7 minutes not billed → $1.00.
    expect(overtimeRows([pay("OT", 7, 301)], [bill("plm", "OT", 7, "bill_overtime_not_billable")])[0]!.premiumNotBilledCents).toBe(100);
  });
});
