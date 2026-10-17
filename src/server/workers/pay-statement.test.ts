import { describe, expect, it } from "vitest";
import { payStatementLanguage, payStubLocale } from "./pay-statement";

describe("New Jersey primary-language pay statement", () => {
  it("flags a worker placed in New Jersey whose language is not English", () => {
    expect(payStatementLanguage(["NJ"], "es")).toBe("es");
    expect(payStatementLanguage(["IL", "NJ"], "pl")).toBe("pl");
    expect(payStatementLanguage(["NJ"], "en")).toBeNull();
    expect(payStatementLanguage(["IL", "MA"], "es")).toBeNull();
    expect(payStatementLanguage([], "es")).toBeNull();
  });
  it("a Spanish-speaking New Jersey worker's stub is in Spanish whatever the screen's language", () => {
    expect(payStubLocale("es", "en")).toBe("es");
    expect(payStubLocale("pl", "en")).toBe("en");
    expect(payStubLocale(null, "es")).toBe("es");
  });
});
