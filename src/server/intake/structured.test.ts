import { describe, expect, it } from "vitest";
import { cellText } from "./structured";

describe("Excel cells read as the text a person sees", () => {
  it("uses a formula's result, joins rich text, and leaves error cells blank", () => {
    expect(cellText({ formula: "A1*2", result: 42 })).toBe("42");
    expect(cellText({ formula: "TODAY()", result: new Date(Date.UTC(2026, 9, 19)) })).toBe("10/19/2026");
    expect(cellText({ richText: [{ text: "Anita " }, { text: "Patel" }] })).toBe("Anita Patel");
    expect(cellText({ text: "Prairie Line", hyperlink: "https://example.com" })).toBe("Prairie Line");
    expect(cellText({ error: "#N/A" })).toBe("");
    expect(cellText(null)).toBe("");
  });
});
