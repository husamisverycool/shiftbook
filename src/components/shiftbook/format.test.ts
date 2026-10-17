import { describe, expect, it } from "vitest";
import { clock, compactMoney, dateTime, hoursMinutes, money, parseClock, signedMoney, tableDate } from "./format";

describe("screen formatting", () => {
  it("shows money exactly from integer cents in both languages", () => {
    expect(money(144038, "en")).toBe("$1,440.38");
    expect(money(1688, "en")).toBe("$16.88");
    expect(money(-5, "en")).toBe("-$0.05");
    expect(money(144038, "es")).toBe("$1,440.38");
    expect(signedMoney(-5475, "es")).toBe("-$54.75");
    expect(money(9007199254740991, "en")).toBe("$90,071,992,547,409.91");
  });

  it("shows minutes as hours and minutes", () => {
    expect(hoursMinutes(2437)).toBe("40:37");
    expect(hoursMinutes(37)).toBe("0:37");
    expect(hoursMinutes(null)).toBe("—");
  });

  it("reads typed clock times and shows them back", () => {
    expect(parseClock("7:30")).toBe(450);
    expect(parseClock("7:30 pm")).toBe(1170);
    expect(parseClock("12:00 AM")).toBe(0);
    expect(parseClock("24:00")).toBe(1440);
    expect(parseClock("25:00")).toBeNull();
    expect(parseClock("abc")).toBeNull();
    expect(clock(1170, "en")).toBe("7:30 PM");
    expect(clock(1170, "es")).toBe("19:30");
  });

  it("shows a moment in the agency's own time zone, whatever zone the server or browser is in", () => {
    // 22:41 UTC on October 16, 2026 is 5:41 PM in Chicago (daylight time, UTC−5) — as the activity log shows it.
    const at = "2026-10-16T22:41:07Z";
    const plain = (s: string) => s.replace(/[\u202f\u00a0]/g, " ");
    expect(plain(dateTime(at, "en", "America/Chicago"))).toBe("Oct 16, 2026, 5:41 PM");
    expect(plain(dateTime(new Date(at), "en", "America/Chicago", { date: "long" }))).toBe("October 16, 2026 at 5:41 PM");
    expect(plain(dateTime(at, "en", "America/Chicago", { seconds: true }))).toBe("Oct 16, 2026, 5:41:07 PM");
    expect(plain(dateTime(at, "es", "America/Chicago"))).toBe("16 oct 2026, 17:41");
    // In January Chicago is on standard time (UTC−6).
    expect(plain(dateTime("2026-01-15T22:41:00Z", "en", "America/Chicago"))).toBe("Jan 15, 2026, 4:41 PM");
    // A late-evening moment in Chicago is still the same day there, though UTC has moved on.
    expect(plain(dateTime("2026-10-17T03:30:00Z", "en", "America/Chicago"))).toBe("Oct 16, 2026, 10:30 PM");
    // The day alone, as the agency counts days: 03:30 UTC on the 17th is still the 16th in Chicago.
    expect(dateTime("2026-10-17T03:30:00Z", "en", "America/Chicago", { time: false })).toBe("Oct 16, 2026");
    expect(dateTime("2026-10-17T03:30:00Z", "en", "America/Chicago", { date: "long", time: false })).toBe("October 16, 2026");
    // A zone name the browser does not know is read as UTC rather than failing the page (as agencyToday does).
    expect(plain(dateTime(at, "en", "Not/AZone"))).toBe("Oct 16, 2026, 10:41 PM");
  });

  it("writes a chart's gridline money short, the same way in both languages", () => {
    expect(compactMoney(5_000_000)).toBe("$50K");
    expect(compactMoney(2_500_000)).toBe("$25K");
    expect(compactMoney(250_000)).toBe("$2.5K");
    expect(compactMoney(150_000_000)).toBe("$1.5M");
    expect(compactMoney(50_000)).toBe("$500");
    expect(compactMoney(0)).toBe("$0");
    expect(compactMoney(-1_000_000)).toBe("-$10K");
    expect(compactMoney(99_995_000)).toBe("$1M");
  });

  it("writes a date in a list's table short, as Stripe's lists do", () => {
    expect(tableDate("2026-10-16", "en")).toBe("Oct 16, 2026");
    expect(tableDate("2026-10-16", "es")).toBe("16 oct 2026");
  });
});
