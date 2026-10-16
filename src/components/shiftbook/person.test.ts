import { describe, expect, it } from "vitest";
import { initialsOf } from "./person";

describe("initialsOf", () => {
  it("takes the first and last name's first letters, either way round", () => {
    expect(initialsOf("Marcus Bell")).toBe("MB");
    expect(initialsOf("Bell, Marcus")).toBe("MB");
    expect(initialsOf("María José de la Cruz")).toBe("MC");
    expect(initialsOf("Émile")).toBe("É");
    expect(initialsOf("  ")).toBe("?");
    expect(initialsOf("(demo) Owner")).toBe("DO");
  });

  it("leaves out a note in brackets after the name", () => {
    expect(initialsOf("Lena Ortiz (demo)")).toBe("LO");
    expect(initialsOf("Cedar Row Staffing (demo)")).toBe("CS");
  });
});
