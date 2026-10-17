import { describe, expect, it } from "vitest";
import { hueIndex } from "./avatar";

describe("avatar colours (decision 0046)", () => {
  it("the same id always gets the same colour, and ids spread over all twelve", () => {
    expect(hueIndex("client-1")).toBe(hueIndex("client-1"));
    const used = new Set(Array.from({ length: 200 }, (_, i) => hueIndex(`worker-${i}`)));
    expect(used.size).toBe(12);
  });
});
