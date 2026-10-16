import { describe, expect, it } from "vitest";
import { clock, hoursMinutes, money, parseClock, signedMoney } from "./format";

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
});
