import { describe, expect, it } from "vitest";
import { expectedOn, floatingRows, projection } from "./floating";

describe("cash floating (decision I8)", () => {
  const paid = [
    { periodId: "w2", periodEndsOn: "2026-10-11", payDate: "2026-10-16", clientId: "plm", paidCents: 118_000 },
    { periodId: "w2", periodEndsOn: "2026-10-11", payDate: "2026-10-16", clientId: "pcd", paidCents: 50_000 },
    { periodId: "w1", periodEndsOn: "2026-10-04", payDate: "2026-10-09", clientId: "plm", paidCents: 90_000 },
  ];
  const collected = [
    { periodId: "w2", clientId: "plm", collectedCents: 100_000 },
    { periodId: "w1", clientId: "plm", collectedCents: 95_000 },
  ];

  it("payroll paid (once its pay date has passed) less what the client paid for that work, never below zero", () => {
    const rows = floatingRows(paid, collected, "2026-10-16");
    expect(rows.map((r) => [r.periodId, r.clientId, r.payDate, r.paidCents, r.collectedCents, r.floatingCents])).toEqual([
      ["w2", "pcd", "2026-10-16", 50_000, 0, 50_000],
      ["w2", "plm", "2026-10-16", 118_000, 100_000, 18_000],
      ["w1", "plm", "2026-10-09", 90_000, 95_000, 0],
    ]);
    // The day before w2's pay date only w1 has been paid.
    expect(floatingRows(paid, collected, "2026-10-15").map((r) => r.periodId)).toEqual(["w1"]);
  });

  it("an invoice is expected in its issue date + the client's average days to pay, else on its due date", () => {
    expect(expectedOn({ issuedOn: "2026-10-13", dueOn: "2026-11-12", averageDays: 21 })).toBe("2026-11-03");
    expect(expectedOn({ issuedOn: "2026-10-13", dueOn: "2026-11-12", averageDays: null })).toBe("2026-11-12");
  });
});

describe("the projection to the next pay date (decision I9, review finding 3)", () => {
  const base = { asOf: "2026-10-16", paid: [{ periodId: "w2", periodEndsOn: "2026-10-11", payDate: "2026-10-16", clientId: "plm", paidCents: 97_950 }], collected: [] };
  const next = { payDate: "2026-10-23", rows: [{ periodId: "w3", periodEndsOn: "2026-10-18", payDate: "2026-10-23", clientId: null, paidCents: 97_950 }], estimate: true };

  it("an invoice expected in pays back only its own week's payroll: the margin on it never offsets other weeks", () => {
    const p = projection({ ...base, next, expected: [{ periodId: "w2", clientId: "plm", number: "PLM-20261005", balanceCents: 142_500, expectedOn: "2026-10-20" }] });
    // w2: $979.50 paid, $1,425.00 in → 0; w3: $979.50 paid, nothing in → $979.50.
    expect(p).toEqual({ nowCents: 97_950, payrollCents: 97_950, backCents: 97_950, afterCents: 97_950, counted: ["PLM-20261005"], overdueCents: 0 });
  });

  it("with nothing expected in, the next payroll adds to what is floating", () => {
    expect(projection({ ...base, next, expected: [] })).toMatchObject({ backCents: 0, afterCents: 195_900, counted: [] });
  });

  it("an overdue invoice (its expected date already passed) is not counted on: it is shown apart", () => {
    const p = projection({ ...base, next, expected: [{ periodId: "w2", clientId: "plm", number: "PLM-1", balanceCents: 50_000, expectedOn: "2026-10-01" }] });
    expect(p).toMatchObject({ backCents: 0, afterCents: 195_900, counted: [], overdueCents: 50_000 });
  });
});
