import { describe, expect, it } from "vitest";
import { centsToInput, parseDollars, parsePercentBp, parseMultiplier, bpToInput } from "./amounts";

describe("typed amounts become integers exactly", () => {
  it("reads dollars as cents", () => {
    expect(parseDollars("18.25")).toBe(1825);
    expect(parseDollars("$1,018.5")).toBe(101850);
    expect(parseDollars("20")).toBe(2000);
    expect(parseDollars(" 0.07 ")).toBe(7);
    expect(parseDollars("18.255")).toBeNull();
    expect(parseDollars("abc")).toBeNull();
    expect(parseDollars("")).toBeNull();
    expect(parseDollars("-3")).toBeNull();
    // A comma only separates thousands: "18,25" (cents after a comma) is refused, not read as $1,825.
    expect(parseDollars("18,25")).toBeNull();
    expect(parseDollars("1,018.50")).toBe(101850);
    expect(parseDollars("1,0185")).toBeNull();
  });

  it("writes cents back as a plain amount for the form", () => {
    expect(centsToInput(1825)).toBe("18.25");
    expect(centsToInput(2000)).toBe("20.00");
    expect(centsToInput(null)).toBe("");
  });

  it("reads a percentage as basis points", () => {
    expect(parsePercentBp("45")).toBe(4500);
    expect(parsePercentBp("45.5%")).toBe(4550);
    expect(parsePercentBp("12.25")).toBe(1225);
    expect(parsePercentBp("1.234")).toBeNull();
    expect(parsePercentBp("4,5")).toBeNull();
    expect(bpToInput(4550)).toBe("45.50");
  });

  it("reads a multiplier as a fraction", () => {
    expect(parseMultiplier("1.5")).toEqual({ num: 3, den: 2 });
    expect(parseMultiplier("2")).toEqual({ num: 2, den: 1 });
    expect(parseMultiplier("1.25")).toEqual({ num: 5, den: 4 });
    expect(parseMultiplier("x")).toBeNull();
  });
});
