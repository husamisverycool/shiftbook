import { describe, expect, it } from "vitest";
import { assessEntry, type AssessContext } from "./assess";
import { reading, type FieldReading, type RawEntry } from "./types";

const ctx = (over: Partial<AssessContext> = {}): AssessContext => ({
  period: { startsOn: "2026-10-05", endsOn: "2026-10-11" },
  roster: [
    { workerId: "w-bob", firstName: "Robert", lastName: "Jones" },
    { workerId: "w-andre", firstName: "Andre", lastName: "Lewis" },
    { workerId: "w-bri", firstName: "Brianna", lastName: "Lewis" },
  ],
  nicknames: [["Bob", "Robert"]],
  assignments: [
    { assignmentId: "a-bob", workerId: "w-bob", clientId: "c-il", startDate: "2026-08-03", endDate: null, status: "active" },
    { assignmentId: "a-andre", workerId: "w-andre", clientId: "c-il", startDate: "2026-08-03", endDate: null, status: "active" },
    { assignmentId: "a-bri", workerId: "w-bri", clientId: "c-ca", startDate: "2026-08-03", endDate: null, status: "active" },
  ],
  clients: [
    { clientId: "c-il", name: "Prairie Line Manufacturing (demo)" },
    { clientId: "c-ca", name: "Pacific Crest Distribution (demo)" },
  ],
  clientHint: null,
  ...over,
});

const hand = <T>(text: string, value: T, a: string, b: string): FieldReading<T> => ({
  ...reading(text, value),
  page: 1,
  box: { x: 100, y: 200, w: 50, h: 20 },
  passA: a,
  passB: b,
  agree: a === b,
  handwritten: true,
});

function row(over: Partial<RawEntry> = {}): RawEntry {
  return {
    rowIndex: 0,
    worker: reading("Bob Jones", "Bob Jones"),
    date: reading("10/06/2026", "2026-10-06"),
    in: reading("3:00 PM", 900),
    out: reading("11:30 PM", 1410),
    break: reading("30", 30),
    total: reading("8", 480),
    externalId: null,
    checks: [],
    ...over,
  };
}

describe("assessEntry", () => {
  it("accepts a clean row: matched worker, active assignment, arithmetic adds up", () => {
    const d = assessEntry(row(), ctx());
    expect(d).toMatchObject({
      workerId: "w-bob",
      assignmentId: "a-bob",
      clientId: "c-il",
      workDate: "2026-10-06",
      inMinute: 900,
      outMinute: 1410,
      breakMinutes: 30,
      minutes: 480,
      confidence: "high",
      status: "extracted",
      reviewReasons: [],
    });
    expect(d.fields.worker?.checks).toEqual([]);
  });

  it("flags a written total that does not match in/out/break", () => {
    const d = assessEntry(row({ total: reading("8", 480), out: reading("11:00 PM", 1380) }), ctx());
    expect(d.status).toBe("needs_review");
    expect(d.reviewReasons).toEqual(["total_mismatch"]);
    expect(d.minutes).toBe(450); // in/out/break wins; the written total is what disagrees
    expect(d.fields.total?.checks).toEqual(["total_mismatch"]);
  });

  it("never creates a worker for an unknown name", () => {
    const d = assessEntry(row({ worker: reading("Danny Ortiz", "Danny Ortiz") }), ctx());
    expect(d).toMatchObject({ workerId: null, assignmentId: null, status: "needs_review", reviewReasons: ["worker_not_on_roster"] });
  });

  it("reports an ambiguous name instead of guessing", () => {
    const d = assessEntry(row({ worker: reading("Lewis", "Lewis") }), ctx());
    expect(d.reviewReasons).toEqual(["worker_ambiguous"]);
  });

  it("uses the document's client to settle a name that fits workers at two clients", () => {
    const d = assessEntry(row({ worker: reading("A. Lewis", "A. Lewis") }), ctx({ clientHint: "Prairie Line Manufacturing" }));
    expect(d).toMatchObject({ workerId: "w-andre", status: "extracted" });
  });

  it("flags a date outside the pay period", () => {
    const d = assessEntry(row({ date: reading("10/12/2026", "2026-10-12") }), ctx());
    expect(d.reviewReasons).toEqual(["date_outside_period"]);
  });

  it("flags a worker with no active assignment on that date", () => {
    const c = ctx();
    c.assignments[0] = { ...c.assignments[0]!, endDate: "2026-10-01", status: "ended" };
    expect(assessEntry(row(), c).reviewReasons).toEqual(["no_active_assignment"]);
  });

  it("flags time out before time in", () => {
    const d = assessEntry(row({ in: reading("11:30 PM", 1410), out: reading("3:00 PM", 900), total: null }), ctx());
    expect(d.reviewReasons).toEqual(["in_after_out"]);
  });

  it("sends a value the two readings disagree on to review, with low confidence", () => {
    const d = assessEntry(row({ out: hand("11:30", 1410, "11:30", "11:50"), total: null }), ctx());
    expect(d).toMatchObject({ status: "needs_review", confidence: "low" });
    expect(d.reviewReasons).toEqual(["passes_disagree:out"]);
    expect(d.fields.out).toMatchObject({ passA: "11:30", passB: "11:50", agree: false, confidence: "low", box: { x: 100, y: 200, w: 50, h: 20 } });
  });

  it("accepts handwriting only when both readings agree exactly", () => {
    const agreed = assessEntry(row({ out: hand("11:30", 1410, "11:30", "11:30") }), ctx());
    expect(agreed.status).toBe("extracted");
    const single = assessEntry(row({ out: { ...hand("11:30", 1410, "11:30", "11:30"), passB: null, agree: null } }), ctx());
    expect(single.reviewReasons).toEqual(["handwriting_not_confirmed:out"]);
  });

  it("keeps problems found while reading", () => {
    const d = assessEntry(row({ checks: ["unreadable:in"], in: reading<number>("3:7O", null) }), ctx());
    expect(d.reviewReasons).toContain("unreadable:in");
    expect(d.status).toBe("needs_review");
  });

  it("uses the written total when there are no clock times (VMS daily totals)", () => {
    const d = assessEntry(row({ in: null, out: null, break: null, total: reading("ST/Hr 8.00 + OT/Hr 1.00", 540) }), ctx());
    expect(d).toMatchObject({ minutes: 540, inMinute: null, status: "extracted" });
  });
});
