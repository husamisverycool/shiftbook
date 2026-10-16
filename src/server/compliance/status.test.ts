import { describe, expect, it } from "vitest";
import { displayStatus, STATUS_ORDER } from "./status";

describe("what a duty shows (Vanta: Due soon from the reminder, Overdue once the date passes)", () => {
  const open = { status: "open" as const, dueOn: "2026-11-01", remindOn: "2026-10-02" };
  it("upcoming before its reminder, due soon from it, due soon on the day, overdue the day after", () => {
    expect(displayStatus(open, "2026-10-01")).toBe("upcoming");
    expect(displayStatus(open, "2026-10-02")).toBe("due_soon");
    expect(displayStatus(open, "2026-11-01")).toBe("due_soon");
    expect(displayStatus(open, "2026-11-02")).toBe("overdue");
  });
  it("done and not applicable whatever the date; no reminder means due soon only on the day", () => {
    expect(displayStatus({ ...open, status: "done" }, "2027-01-01")).toBe("done");
    expect(displayStatus({ ...open, status: "not_applicable" }, "2027-01-01")).toBe("not_applicable");
    expect(displayStatus({ ...open, remindOn: null }, "2026-10-31")).toBe("upcoming");
    expect(displayStatus({ ...open, remindOn: null }, "2026-11-01")).toBe("due_soon");
  });
  it("urgency order: overdue, due soon, upcoming, done, not applicable", () => {
    expect(STATUS_ORDER).toEqual(["overdue", "due_soon", "upcoming", "done", "not_applicable"]);
  });
});
