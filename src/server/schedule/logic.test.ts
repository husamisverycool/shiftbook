import { describe, expect, it } from "vitest";
import { attendance, dayCounters, overlaps, paidMinutes, rateBp, statusCounts, unpublished, type ShiftLike } from "./logic";

const at = (iso: string) => new Date(iso);
let n = 0;
const shift = (over: Partial<ShiftLike> = {}): ShiftLike => ({
  id: `s${++n}`,
  workDate: "2026-10-19",
  startMinute: 420,
  endMinute: 900,
  breakMinutes: 30,
  workerId: "w1",
  state: "assigned",
  publishedAt: at("2026-10-15T12:00:00Z"),
  changedAt: at("2026-10-15T11:00:00Z"),
  warning: null,
  noShow: false,
  ...over,
});

describe("shift minutes", () => {
  it("paid minutes are the span less the unpaid break; overnight shifts end after 1440", () => {
    expect(paidMinutes(shift())).toBe(450);
    expect(paidMinutes(shift({ startMinute: 1320, endMinute: 1800, breakMinutes: 0 }))).toBe(480);
  });

  it("two shifts of one worker overlap when their times meet, across midnight too", () => {
    expect(overlaps(shift(), shift({ startMinute: 840, endMinute: 1200 }))).toBe(true);
    expect(overlaps(shift(), shift({ startMinute: 900, endMinute: 1200 }))).toBe(false);
    expect(overlaps(shift({ startMinute: 1320, endMinute: 1800 }), shift({ workDate: "2026-10-20", startMinute: 300, endMinute: 600 }))).toBe(true);
    expect(overlaps(shift(), shift({ workerId: "w2" }))).toBe(false);
    expect(overlaps(shift(), shift({ state: "cancelled" }))).toBe(false);
  });
});

describe("publishing state", () => {
  it("a shift is unpublished until published, and again after a change (When I Work's pending changes)", () => {
    expect(unpublished(shift({ publishedAt: null }))).toBe(true);
    expect(unpublished(shift())).toBe(false);
    expect(unpublished(shift({ changedAt: at("2026-10-16T00:00:00Z") }))).toBe(true);
    expect(unpublished(shift({ state: "cancelled", publishedAt: null }))).toBe(false);
  });

  it("the status bar counts open, unpublished, awaiting confirmation and warnings (Deputy)", () => {
    const counts = statusCounts([
      shift({ state: "open", workerId: null }),
      shift({ state: "open", workerId: null, warning: "declined", publishedAt: null }),
      shift({ state: "awaiting" }),
      shift({ state: "confirmed", workerId: "w3" }),
      shift({ state: "assigned", workerId: "w3", startMinute: 600 }),
      shift({ state: "cancelled" }),
    ]);
    expect(counts.open.length).toBe(2);
    expect(counts.unpublished.length).toBe(1);
    expect(counts.awaiting.length).toBe(1);
    // The declined one, and the overlapping pair of w3.
    expect(counts.warnings.length).toBe(3);
  });

  it("each day counts its shifts and paid hours, cancelled ones left out", () => {
    const days = dayCounters([shift(), shift({ workDate: "2026-10-20" }), shift({ state: "cancelled" })], ["2026-10-19", "2026-10-20", "2026-10-21"]);
    expect(days).toEqual([
      { date: "2026-10-19", shifts: 1, minutes: 450 },
      { date: "2026-10-20", shifts: 1, minutes: 450 },
      { date: "2026-10-21", shifts: 0, minutes: 0 },
    ]);
  });
});

describe("attendance (Deputy's report; Instawork's fill rate)", () => {
  it("rates are whole basis points, rounded half up, and zero when nothing is counted", () => {
    expect(rateBp(1, 3)).toBe(3333);
    expect(rateBp(2, 3)).toBe(6667);
    expect(rateBp(0, 0)).toBe(0);
  });

  it("fill rate is filled of requested; no-shows and late of past scheduled shifts, 15 minutes' tolerance", () => {
    const rows = attendance(
      [
        { ...shift({ state: "confirmed" }), clientId: "c1", firstInMinute: 420, ended: true },
        { ...shift({ state: "confirmed" }), clientId: "c1", firstInMinute: 436, ended: true },
        { ...shift({ state: "confirmed" }), clientId: "c1", firstInMinute: 435, ended: true },
        { ...shift({ state: "confirmed", noShow: true }), clientId: "c1", firstInMinute: null, ended: true },
        { ...shift({ state: "open", workerId: null }), clientId: "c1", firstInMinute: null, ended: true },
        { ...shift({ state: "awaiting" }), clientId: "c2", firstInMinute: null, ended: false },
        { ...shift({ state: "cancelled" }), clientId: "c2", firstInMinute: null, ended: true },
      ],
      15,
    );
    expect(rows.find((r) => r.clientId === "c1")).toMatchObject({ requested: 5, filled: 4, fillBp: 8000, scheduled: 4, noShows: 1, noShowBp: 2500, late: 1, lateBp: 2500 });
    expect(rows.find((r) => r.clientId === "c2")).toMatchObject({ requested: 1, filled: 1, fillBp: 10000, scheduled: 0, noShows: 0, late: 0 });
  });
});
