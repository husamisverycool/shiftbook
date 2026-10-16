import { describe, expect, it } from "vitest";
import { expectedOn, floatingRows, projection } from "./floating";

describe("cash floating (decision I8)", () => {
  const paid = [
    { runId: "r2", periodEndsOn: "2026-10-11", clientId: "plm", paidCents: 118_000 },
    { runId: "r2", periodEndsOn: "2026-10-11", clientId: "pcd", paidCents: 50_000 },
    { runId: "r1", periodEndsOn: "2026-10-04", clientId: "plm", paidCents: 90_000 },
  ];
  it("payroll paid (once its pay date has passed) less what the client paid for that work, never below zero", () => {
    const collected = [
      { runId: "r2", clientId: "plm", collectedCents: 100_000 },
      { runId: "r1", clientId: "plm", collectedCents: 95_000 },
    ];
    // Pay day 5 days after the period: r2 pays 2026-10-16, r1 2026-10-09.
    const rows = floatingRows(paid, collected, "2026-10-16", 5);
    expect(rows.map((r) => [r.runId, r.clientId, r.payDate, r.paidCents, r.collectedCents, r.floatingCents])).toEqual([
      ["r2", "pcd", "2026-10-16", 50_000, 0, 50_000],
      ["r2", "plm", "2026-10-16", 118_000, 100_000, 18_000],
      ["r1", "plm", "2026-10-09", 90_000, 95_000, 0],
    ]);
    // The day before r2's pay date only r1 has been paid.
    expect(floatingRows(paid, collected, "2026-10-15", 5).map((r) => r.runId)).toEqual(["r1"]);
  });

  it("an invoice is expected in its issue date + the client's average days to pay, else on its due date", () => {
    expect(expectedOn({ issuedOn: "2026-10-13", dueOn: "2026-11-12", averageDays: 21 })).toBe("2026-11-03");
    expect(expectedOn({ issuedOn: "2026-10-13", dueOn: "2026-11-12", averageDays: null })).toBe("2026-11-12");
  });

  it("projection (decision I9): floating now + the next payroll − what is expected in by its pay date", () => {
    const p = projection({
      floatingNowCents: 68_000,
      payDate: "2026-10-23",
      payroll: { cents: 160_000, estimate: true },
      expected: [
        { number: "PLM-20261005", clientName: "Prairie Line", balanceCents: 30_000, expectedOn: "2026-10-20" },
        { number: "PCD-20261005", clientName: "Pacific Crest", balanceCents: 80_000, expectedOn: "2026-11-01" },
      ],
    });
    expect(p).toEqual({
      expectedCents: 30_000,
      afterCents: 198_000,
      explain: "$680.00 floating now + $1,600.00 payroll on 2026-10-23 (an estimate: the average of the last four paid weeks) − $300.00 expected in by then (PLM-20261005) = $1,980.00.",
    });
    expect(projection({ floatingNowCents: 0, payDate: "2026-10-23", payroll: { cents: 10_000, estimate: false }, expected: [{ number: "X", clientName: "C", balanceCents: 50_000, expectedOn: "2026-10-01" }] })).toMatchObject({ afterCents: 0 });
  });
});
