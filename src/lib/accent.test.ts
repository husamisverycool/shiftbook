import { describe, expect, it } from "vitest";
import { accentFor, parseAccent } from "./accent";

describe("accent preference (decision 0046)", () => {
  it("reads only the four accents", () => {
    expect(parseAccent("teal")).toBe("teal");
    expect(parseAccent("graphite")).toBe("graphite");
    expect(parseAccent("Teal")).toBeNull();
    expect(parseAccent("red")).toBeNull();
    expect(parseAccent("")).toBeNull();
    expect(parseAccent(undefined)).toBeNull();
    expect(parseAccent(3)).toBeNull();
  });

  it("the person's cookie first, then the hosting's setting, then indigo", () => {
    expect(accentFor("blue", "teal")).toBe("blue");
    expect(accentFor(undefined, "teal")).toBe("teal");
    expect(accentFor("nonsense", "nonsense")).toBe("indigo");
    expect(accentFor(undefined, undefined)).toBe("indigo");
  });
});
