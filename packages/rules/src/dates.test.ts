import { describe, expect, it } from "vitest";
import { addMonths } from "./dates";

describe("addMonths — calendar months, clamped to the month's last day", () => {
  it("moves by whole months and years", () => {
    expect(addMonths("2026-10-14", -12)).toBe("2025-10-14");
    expect(addMonths("2026-10-14", -48)).toBe("2022-10-14");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });
  it("clamps a day past the month's end to its last day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-02-29", -12)).toBe("2023-02-28");
    expect(addMonths("2024-03-31", -1)).toBe("2024-02-29");
  });
});
