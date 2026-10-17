import { describe, expect, it } from "vitest";
import { noticesFrom, recipientsOf, type NotificationFacts } from "./rules";

const empty: NotificationFacts = { decisions: [], blockedRuns: [], obligations: [], overdueInvoices: [], brokenPromises: [] };

describe("noticesFrom", () => {
  it("a client's decision: returned when nothing was disputed, disputed otherwise; one notice per decision", () => {
    const n = noticesFrom(
      {
        ...empty,
        decisions: [
          { id: "d1", requestId: "r1", clientName: "Acme", periodStart: "2026-10-05", periodEnd: "2026-10-11", disputed: 0 },
          { id: "d2", requestId: "r2", clientName: "Birch", periodStart: "2026-10-05", periodEnd: "2026-10-11", disputed: 2 },
        ],
      },
      "2026-10-17",
    );
    expect(n).toEqual([
      { kind: "approval_returned", dedupeKey: "decision:d1", href: "/approvals/r1", params: { client: "Acme", start: "2026-10-05", end: "2026-10-11", disputed: 0 }, ability: "hours" },
      { kind: "approval_disputed", dedupeKey: "decision:d2", href: "/approvals/r2", params: { client: "Birch", start: "2026-10-05", end: "2026-10-11", disputed: 2 }, ability: "hours" },
    ]);
  });

  it("a blocked run: one notice per run and its count of blockers", () => {
    const n = noticesFrom({ ...empty, blockedRuns: [{ id: "run1", payPeriodId: "p1", periodStart: "2026-10-05", periodEnd: "2026-10-11", blockers: 3 }] }, "2026-10-17");
    expect(n).toEqual([{ kind: "run_blocked", dedupeKey: "run:run1:blocked", href: "/convert?period=p1&step=exceptions", params: { start: "2026-10-05", end: "2026-10-11", blockers: 3 }, ability: "run" }]);
  });

  it("a duty: due soon from its reminder day, overdue the day after its due date — each its own notice", () => {
    const duty = { id: "o1", kind: "il_registration_renewal", dueOn: "2026-10-20", remindOn: "2026-10-10" };
    expect(noticesFrom({ ...empty, obligations: [duty] }, "2026-10-09")).toEqual([]);
    expect(noticesFrom({ ...empty, obligations: [duty] }, "2026-10-10").map((x) => x.dedupeKey)).toEqual(["obligation:o1:soon"]);
    expect(noticesFrom({ ...empty, obligations: [duty] }, "2026-10-20").map((x) => x.kind)).toEqual(["obligation_due_soon"]);
    expect(noticesFrom({ ...empty, obligations: [duty] }, "2026-10-21").map((x) => x.dedupeKey)).toEqual(["obligation:o1:overdue"]);
    expect(noticesFrom({ ...empty, obligations: [{ ...duty, remindOn: null }] }, "2026-10-19")).toEqual([]);
  });

  it("an overdue invoice and a broken promise go to who collects", () => {
    const n = noticesFrom(
      {
        ...empty,
        overdueInvoices: [{ id: "i1", number: "ACME-20261011", clientName: "Acme", dueOn: "2026-10-10", balanceCents: 125_000 }],
        brokenPromises: [{ id: "pp1", invoiceId: "i1", number: "ACME-20261011", clientName: "Acme", promisedOn: "2026-10-15", balanceCents: 125_000 }],
      },
      "2026-10-17",
    );
    expect(n.map((x) => [x.kind, x.dedupeKey, x.href, x.ability])).toEqual([
      ["invoice_overdue", "invoice:i1:overdue", "/invoices/i1", "cash"],
      ["promise_broken", "promise:pp1:broken", "/invoices/i1", "cash"],
    ]);
    expect(n[0]!.params).toEqual({ number: "ACME-20261011", client: "Acme", dueOn: "2026-10-10", balanceCents: 125_000 });
  });
});

describe("recipientsOf", () => {
  const people = [
    { id: "u1", role: "owner" as const, status: "active" as const },
    { id: "u2", role: "coordinator" as const, status: "active" as const },
    { id: "u3", role: "billing" as const, status: "active" as const },
    { id: "u4", role: "accountant" as const, status: "active" as const },
    { id: "u5", role: "billing" as const, status: "suspended" as const },
  ];
  it("the people whose role acts on it, never a suspended or invited person, never the accountant", () => {
    expect(recipientsOf("hours", people)).toEqual(["u1", "u2"]);
    expect(recipientsOf("run", people)).toEqual(["u1"]);
    expect(recipientsOf("cash", people)).toEqual(["u1", "u3"]);
    expect(recipientsOf("compliance", people)).toEqual(["u1", "u2", "u3"]);
  });
});
