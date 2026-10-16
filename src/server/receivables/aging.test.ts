import { describe, expect, it } from "vitest";
import { aging, bucketOf, daysFrom, daysToPay } from "./aging";

describe("aging buckets by days past due (H1)", () => {
  it("not yet due is Current; then 1–30, 31–60, 61–90, 91 and over", () => {
    const asOf = "2026-12-31";
    expect(daysFrom("2026-12-01", asOf)).toBe(30);
    expect(bucketOf("2026-12-31", asOf)).toBe("current"); // due today: not late
    expect(bucketOf("2027-01-15", asOf)).toBe("current");
    expect(bucketOf("2026-12-30", asOf)).toBe("d1_30"); // 1 day
    expect(bucketOf("2026-12-01", asOf)).toBe("d1_30"); // 30 days
    expect(bucketOf("2026-11-30", asOf)).toBe("d31_60"); // 31 days
    expect(bucketOf("2026-11-01", asOf)).toBe("d31_60"); // 60 days
    expect(bucketOf("2026-10-31", asOf)).toBe("d61_90"); // 61 days
    expect(bucketOf("2026-10-02", asOf)).toBe("d61_90"); // 90 days
    expect(bucketOf("2026-10-01", asOf)).toBe("d91_plus"); // 91 days
  });

  it("sums each client's balances into buckets; a credit sits in Current as a negative amount, so the total is what it owes net", () => {
    const rows = aging(
      [
        { clientId: "a", invoiceId: "a1", dueOn: "2026-12-20", balanceCents: 100_00 }, // 11 days late
        { clientId: "a", invoiceId: "a2", dueOn: "2027-01-10", balanceCents: 250_50 }, // not yet due
        { clientId: "a", invoiceId: "a3", dueOn: "2026-09-01", balanceCents: 40_00 }, // 121 days late
        { clientId: "a", invoiceId: "a4", dueOn: "2026-11-01", balanceCents: -15_00 }, // a credit note beyond what it corrects
        { clientId: "b", invoiceId: "b1", dueOn: "2026-10-15", balanceCents: 0 }, // paid: not listed
      ],
      [
        { clientId: "a", cents: 20_00 },
        { clientId: "c", cents: 5_00 },
      ],
      "2026-12-31",
    );
    expect(rows).toEqual([
      {
        clientId: "a",
        // Current: 250.50 − 15.00 − 20.00 = 215.50
        buckets: { current: 215_50, d1_30: 100_00, d31_60: 0, d61_90: 0, d91_plus: 40_00 },
        // 100.00 + 250.50 + 40.00 − 15.00 − 20.00 = 355.50
        totalCents: 355_50,
        overdueCents: 140_00,
        creditCents: 35_00,
        invoices: { current: ["a2", "a4"], d1_30: ["a1"], d31_60: [], d61_90: [], d91_plus: ["a3"] },
      },
      { clientId: "c", buckets: { current: -5_00, d1_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0 }, totalCents: -5_00, overdueCents: 0, creditCents: 5_00, invoices: { current: [], d1_30: [], d31_60: [], d61_90: [], d91_plus: [] } },
    ]);
  });
});

describe("days to pay (H7)", () => {
  it("averages the days from issue to the payment that paid each invoice off, rounded half up once; days late against the due date, on time counting 0", () => {
    const r = daysToPay([
      { issuedOn: "2026-10-01", dueOn: "2026-10-31", paidOn: "2026-10-29" }, // 28 days, 0 late
      { issuedOn: "2026-10-08", dueOn: "2026-11-07", paidOn: "2026-11-12" }, // 35 days, 5 late
      { issuedOn: "2026-10-15", dueOn: "2026-11-14", paidOn: "2026-11-20" }, // 36 days, 6 late
      { issuedOn: "2026-10-22", dueOn: "2026-11-21", paidOn: "2026-11-21" }, // 30 days, 0 late
    ]);
    // 28 + 35 + 36 + 30 = 129 days ÷ 4 = 32.25 → 32; 0 + 5 + 6 + 0 = 11 ÷ 4 = 2.75 → 3.
    expect(r).toMatchObject({ invoices: 4, totalDays: 129, averageDays: 32, averageDaysLate: 3 });
    expect(r.explain).toBe("4 invoices paid in full, 129 days from issue to payment in total → 32 days on average (rounded half up); 11 days past due in total → 3 days late on average.");
    // 1 + 2 = 3 ÷ 2 = 1.5 → 2 (half up).
    expect(daysToPay([{ issuedOn: "2026-10-01", dueOn: "2026-10-31", paidOn: "2026-10-02" }, { issuedOn: "2026-10-01", dueOn: "2026-10-31", paidOn: "2026-10-03" }]).averageDays).toBe(2);
    expect(daysToPay([])).toMatchObject({ invoices: 0, averageDays: null, averageDaysLate: null });
  });
});
