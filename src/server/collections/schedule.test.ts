import { describe, expect, it } from "vitest";
import { creditNoteRoom, DEFAULT_SCHEDULE, parseSchedule, reminderDue, SCHEDULE_CHOICES } from "./schedule";

const on = { enabled: true, beforeDueDays: 3, overdueDays: 7, finalDays: 30 };
const invoice = { dueOn: "2026-10-20", balanceCents: 50_000 };

describe("reminderDue", () => {
  it("nothing while the schedule is off, the invoice is settled, or no day has come", () => {
    expect(reminderDue(invoice, { ...on, enabled: false }, "2026-10-25", [])).toBeNull();
    expect(reminderDue({ ...invoice, balanceCents: 0 }, on, "2026-10-25", [])).toBeNull();
    expect(reminderDue(invoice, on, "2026-10-16", [])).toBeNull();
  });

  it("each stage from its day: 3 days before, 7 after, 30 after", () => {
    expect(reminderDue(invoice, on, "2026-10-17", [])).toBe("before_due");
    expect(reminderDue(invoice, on, "2026-10-20", ["before_due"])).toBeNull();
    expect(reminderDue(invoice, on, "2026-10-27", ["before_due"])).toBe("overdue");
    expect(reminderDue(invoice, on, "2026-11-19", ["before_due", "overdue"])).toBe("final");
    expect(reminderDue(invoice, on, "2026-12-01", ["before_due", "overdue", "final"])).toBeNull();
  });

  it("only the latest stage that has come: a reminder before the due date is never sent after it", () => {
    expect(reminderDue(invoice, on, "2026-10-28", [])).toBe("overdue");
    expect(reminderDue(invoice, on, "2026-11-25", [])).toBe("final");
    expect(reminderDue(invoice, { ...on, overdueDays: null }, "2026-10-28", [])).toBeNull();
  });
});

describe("parseSchedule", () => {
  it("the stored setting, or nothing sent when there is none or it is not one of the choices", () => {
    expect(parseSchedule(undefined)).toEqual(DEFAULT_SCHEDULE);
    expect(DEFAULT_SCHEDULE.enabled).toBe(false);
    expect(parseSchedule(on)).toEqual(on);
    expect(parseSchedule({ ...on, overdueDays: 5 })).toEqual(DEFAULT_SCHEDULE);
    expect(SCHEDULE_CHOICES.overdueDays).toContain(7);
  });
});

describe("creditNoteRoom", () => {
  it("never more than the invoice's total less its earlier credit notes (Stripe)", () => {
    expect(creditNoteRoom(100_000, [])).toBe(100_000);
    expect(creditNoteRoom(100_000, [-25_000, -50_000])).toBe(25_000);
    expect(creditNoteRoom(100_000, [-100_000])).toBe(0);
    // Paid $900, $100 written off: only the $900 actually paid can still be credited.
    expect(creditNoteRoom(100_000, [], [10_000])).toBe(90_000);
    expect(creditNoteRoom(100_000, [-50_000], [10_000])).toBe(40_000);
    expect(creditNoteRoom(100_000, [-95_000], [10_000])).toBe(0);
  });
});
